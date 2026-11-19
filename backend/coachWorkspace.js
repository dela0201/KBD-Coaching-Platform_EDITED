const sqlite3 = require('sqlite3');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');

const schema = `
CREATE TABLE IF NOT EXISTS CoachWorkspaceDetails (
    Resource TEXT NOT NULL,
    RecordID INTEGER NOT NULL,
    OwnerID INTEGER NOT NULL REFERENCES Users(UserID) ON DELETE CASCADE,
    Data TEXT NOT NULL,
    PRIMARY KEY (Resource, RecordID, OwnerID)
);
CREATE TABLE IF NOT EXISTS CoachWorkspaceRequests (
    CoachID INTEGER NOT NULL REFERENCES Users(UserID) ON DELETE CASCADE,
    Resource TEXT NOT NULL,
    RequestID TEXT NOT NULL,
    BodyHash TEXT NOT NULL,
    RecordID INTEGER NOT NULL,
    PRIMARY KEY(CoachID,Resource,RequestID)
);
CREATE TRIGGER IF NOT EXISTS CoachDetailsUserCleanup AFTER DELETE ON Users BEGIN
    DELETE FROM CoachWorkspaceDetails WHERE Resource='participants' AND RecordID=OLD.UserID;
END;
CREATE TRIGGER IF NOT EXISTS CoachDetailsProgrammeCleanup AFTER DELETE ON Programmes BEGIN
    DELETE FROM CoachWorkspaceDetails WHERE Resource='programmes' AND RecordID=OLD.ProgrammeID;
END;
CREATE TRIGGER IF NOT EXISTS CoachDetailsSessionCleanup AFTER DELETE ON Sessions BEGIN
    DELETE FROM CoachWorkspaceDetails WHERE Resource='appointments' AND RecordID=OLD.SessionID;
END;
CREATE TRIGGER IF NOT EXISTS CoachDetailsActionCleanup AFTER DELETE ON Actions BEGIN
    DELETE FROM CoachWorkspaceDetails WHERE Resource='actions' AND RecordID=OLD.ActionID;
END;
CREATE TABLE IF NOT EXISTS CoachingMetrics (
    MetricID INTEGER PRIMARY KEY AUTOINCREMENT,
    CoachID INTEGER NOT NULL REFERENCES Users(UserID) ON DELETE CASCADE,
    ParticipantID INTEGER NOT NULL REFERENCES Users(UserID) ON DELETE CASCADE,
    Data TEXT NOT NULL,
    CreatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS CoachingMessages (
    MessageID INTEGER PRIMARY KEY AUTOINCREMENT,
    SenderID INTEGER NOT NULL REFERENCES Users(UserID) ON DELETE CASCADE,
    RecipientID INTEGER NOT NULL REFERENCES Users(UserID) ON DELETE CASCADE,
    Type TEXT NOT NULL CHECK(Type IN ('text', 'file', 'voice')),
    Text TEXT NOT NULL DEFAULT '',
    FileName TEXT,
    MimeType TEXT,
    FileData BLOB,
    RequestID TEXT NOT NULL,
    CreatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(SenderID, RequestID)
);
CREATE INDEX IF NOT EXISTS CoachingMessagesRecipients ON CoachingMessages(RecipientID, SenderID, MessageID);
`;

function queries(connection) {
    return {
        all: (sql, values = []) => new Promise((resolve, reject) => {
            connection.all(sql, values, (error, rows) => error ? reject(error) : resolve(rows));
        }),
        get: (sql, values = []) => new Promise((resolve, reject) => {
            connection.get(sql, values, (error, row) => error ? reject(error) : resolve(row));
        }),
        run: (sql, values = []) => new Promise((resolve, reject) => {
            connection.run(sql, values, function (error) {
                if (error) reject(error);
                else resolve({ id: this.lastID, changes: this.changes });
            });
        })
    };
}

function fail(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    throw error;
}

function text(value, label, required = false, limit = 10000) {
    const result = String(value ?? '').trim();
    if (required && !result) fail(`${label} is required.`);
    if (result.length > limit) fail(`${label} is too long.`);
    return result;
}

function identifier(value) {
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result <= 0) fail('A valid record ID is required.');
    return result;
}

function date(value) {
    const result = text(value, 'Date', true, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(result)) ||
        new Date(result).toISOString().slice(0, 10) !== result) fail('Enter a valid date.');
    return result;
}

function choice(value, allowed, label) {
    if (!allowed.includes(value)) fail(`Select a valid ${label}.`);
    return value;
}

async function requireProgramme(q, coachID, programmeID) {
    const row = await q.get(`SELECT P.* FROM Programmes P
        JOIN ProgrammeCoaches PC ON PC.ProgrammeID = P.ProgrammeID
        WHERE P.ProgrammeID = ? AND PC.UserID = ? AND PC.Status = 'Active'`, [programmeID, coachID]);
    if (!row) fail('Programme not found or access denied.', 404);
    return row;
}

async function requireParticipant(q, coachID, participantID, programmeID) {
    const values = [participantID, coachID];
    let condition = '';
    if (programmeID) { condition = ' AND PP.ProgrammeID = ?'; values.push(programmeID); }
    const row = await q.get(`SELECT U.* FROM Users U
        JOIN ProgrammeParticipants PP ON PP.UserID = U.UserID
        JOIN ProgrammeCoaches PC ON PC.ProgrammeID = PP.ProgrammeID
        WHERE U.UserID = ? AND U.Role = 'Participant' AND PC.UserID = ?
          AND PC.Status = 'Active' ${condition} LIMIT 1`, values);
    if (!row) fail('Participant not found or access denied.', 404);
    return row;
}

async function putDetails(q, resource, id, owner, data) {
    await q.run(`INSERT INTO CoachWorkspaceDetails(Resource, RecordID, OwnerID, Data)
        VALUES (?, ?, ?, ?) ON CONFLICT(Resource, RecordID, OwnerID)
        DO UPDATE SET Data = excluded.Data`, [resource, id, owner, JSON.stringify(data)]);
}

module.exports = function registerCoachWorkspace(app, db, requireRoles, writeAuditLog) {
    const ready = new Promise((resolve, reject) => db.exec(schema, error => error ? reject(error) : resolve()));
    // Keep multi-statement writes isolated from concurrent requests using the main connection.
    async function transaction(work) {
        const connection = new sqlite3.Database(db.filename);
        connection.configure('busyTimeout', 5000);
        const q = queries(connection);
        try {
            await q.run('PRAGMA foreign_keys = ON');
            await q.run('BEGIN IMMEDIATE');
            const result = await work(q);
            await q.run('COMMIT');
            return result;
        } catch (error) {
            await q.run('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            await new Promise(resolve => connection.close(resolve));
        }
    }

    function handler(work) {
        return async (req, res) => {
            try { await ready; await work(req, res); }
            catch (error) {
                const conflict = error.code === 'SQLITE_CONSTRAINT';
                const status = error.status || (conflict ? 409 : 500);
                if (status === 500) console.error('Coach workspace:', error);
                res.status(status).json({ error: status === 500 ? 'Unable to save or load this information.' :
                    conflict ? 'A conflicting record already exists. Check the email address and assignments.' : error.message });
            }
        };
    }

    async function list(resource, coachID) {
        const q = queries(db);
        const details = await q.all('SELECT * FROM CoachWorkspaceDetails WHERE OwnerID = ?', [coachID]);
        const metadata = (type, id) => {
            const found = details.find(row => row.Resource === type && row.RecordID === id);
            return found ? JSON.parse(found.Data) : {};
        };
        if (resource === 'programmes') {
            const rows = await q.all(`SELECT P.* FROM Programmes P JOIN ProgrammeCoaches PC ON PC.ProgrammeID = P.ProgrammeID
                WHERE PC.UserID = ? AND PC.Status = 'Active' ORDER BY P.ProgrammeName`, [coachID]);
            return rows.map(row => ({ category: 'General', duration: '', objectives: '', ...metadata(resource, row.ProgrammeID),
                id: row.ProgrammeID, name: row.ProgrammeName, description: row.Description || '', status: row.Status, createdAt: row.CreatedAt }));
        }
        if (resource === 'participants') {
            const rows = await q.all(`SELECT DISTINCT U.UserID, U.FirstName, U.LastName, U.Email, U.CreatedAt, U.AccountStatus
                FROM Users U JOIN ProgrammeParticipants PP ON PP.UserID = U.UserID
                JOIN ProgrammeCoaches PC ON PC.ProgrammeID = PP.ProgrammeID
                WHERE PC.UserID = ? AND PC.Status = 'Active' AND U.Role = 'Participant'`, [coachID]);
            const assignments = await q.all(`SELECT PP.*, P.ProgrammeName FROM ProgrammeParticipants PP
                JOIN Programmes P ON P.ProgrammeID = PP.ProgrammeID JOIN ProgrammeCoaches PC ON PC.ProgrammeID = P.ProgrammeID
                WHERE PC.UserID = ? AND PC.Status = 'Active' ORDER BY PP.EnrollmentDate DESC`, [coachID]);
            return rows.map(row => {
                const meta = metadata(resource, row.UserID);
                const links = assignments.filter(link => link.UserID === row.UserID);
                const primary = links.find(link => link.ProgrammeID === Number(meta.programmeId)) || links[0];
                return { phone: '', goals: '', ...meta, id: row.UserID, firstName: row.FirstName, lastName: row.LastName,
                    email: row.Email, dateAdded: row.CreatedAt.slice(0, 10), programme: primary?.ProgrammeName || '',
                    programmeId: primary?.ProgrammeID || '', programmes: links.map(link => ({id:link.ProgrammeID,name:link.ProgrammeName,status:link.Status})),
                    status: row.AccountStatus === 'Active' && primary?.Status !== 'Withdrawn' ? 'Active' : 'Inactive' };
            });
        }
        if (resource === 'appointments') {
            const rows = await q.all(`SELECT S.*, U.FirstName, U.LastName FROM Sessions S
                JOIN Users U ON U.UserID = S.ParticipantID WHERE S.CoachID = ? ORDER BY S.SessionDate DESC`, [coachID]);
            const notes = await q.all('SELECT N.* FROM SessionNotes N WHERE N.CoachID = ? ORDER BY N.UpdatedAt DESC, N.SessionNoteID DESC', [coachID]);
            return rows.map(row => ({ ...metadata(resource, row.SessionID), id: row.SessionID, programmeId: row.ProgrammeID,
                participantId: row.ParticipantID, participantName: `${row.FirstName} ${row.LastName}`,
                title: metadata(resource, row.SessionID).title || row.SessionType,
                date: row.SessionDate, time: row.StartTime || '', duration: row.StartTime && row.EndTime ?
                    (Number(row.EndTime.slice(0,2))*60+Number(row.EndTime.slice(3)))-(Number(row.StartTime.slice(0,2))*60+Number(row.StartTime.slice(3))) : 60,
                type: row.SessionType, status: row.Status==='Cancelled' && metadata(resource,row.SessionID).missed ? 'Missed' : row.Status, notes: notes.find(note=>note.SessionID===row.SessionID)?.Notes || '', createdAt: row.CreatedAt }));
        }
        if (resource === 'actions') {
            const rows = await q.all('SELECT * FROM Actions WHERE AssignedBy = ? ORDER BY DueDate', [coachID]);
            return rows.map(row => ({ priority: 'Medium', ...metadata(resource, row.ActionID), id: row.ActionID,
                programmeId: row.ProgrammeID, participantId: metadata(resource,row.ActionID).assigneeType==='Coach' ? metadata(resource,row.ActionID).participantId : row.AssignedTo, assigneeType: metadata(resource,row.ActionID).assigneeType || 'Participant', title: row.Title, description: row.Description || '',
                dueDate: row.DueDate || '', status: row.Status, createdAt: row.CreatedAt }));
        }
        if (resource === 'metrics') {
            const rows = await q.all(`SELECT M.* FROM CoachingMetrics M WHERE M.CoachID = ? AND EXISTS (
                SELECT 1 FROM ProgrammeParticipants PP JOIN ProgrammeCoaches PC ON PC.ProgrammeID = PP.ProgrammeID
                WHERE PP.UserID = M.ParticipantID AND PC.UserID = M.CoachID AND PC.Status = 'Active')`, [coachID]);
            return rows.map(row => ({...JSON.parse(row.Data), id: row.MetricID, participantId: row.ParticipantID, createdAt: row.CreatedAt}));
        }
        fail('Unknown workspace resource.', 404);
    }

    async function save(q, resource, coach, id, input) {
        const coachID = coach.UserID;
        const existing = id ? (await list(resource, coachID)).find(row => row.id === id) : null;
        if (id && !existing) fail('Record not found or access denied.', 404);
        const data = {};
        if (resource === 'programmes') {
            data.name = text(input.name, 'Programme name', true, 255);
            data.description = text(input.description, 'Description');
            data.category = text(input.category, 'Category', false, 100);
            data.duration = text(input.duration, 'Duration', false, 100);
            data.objectives = text(input.objectives, 'Objectives');
            data.status = choice(input.status, ['Draft','Active','Completed'], 'programme status');
            if (existing?.status === 'Archived') fail('Ask an Admin to reopen this archived programme.', 403);
            if (id) {
                await requireProgramme(q, coachID, id);
                await q.run('UPDATE Programmes SET ProgrammeName = ?, Description = ?, Status = ? WHERE ProgrammeID = ?', [data.name,data.description,data.status,id]);
            } else {
                const result = await q.run('INSERT INTO Programmes(ProgrammeName,Description,Status) VALUES(?,?,?)', [data.name,data.description,data.status]);
                id = result.id;
                await q.run("INSERT INTO ProgrammeCoaches(ProgrammeID,UserID,Status) VALUES(?,?,'Active')", [id,coachID]);
            }
        } else if (resource === 'participants') {
            data.firstName = text(input.firstName, 'First name', true, 100);
            data.lastName = text(input.lastName, 'Last name', true, 100);
            data.email = text(input.email, 'Email', true, 254).toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) fail('Enter a valid email address.');
            data.phone = text(input.phone, 'Phone', false, 50);
            data.goals = text(input.goals, 'Goals');
            data.programmeId = identifier(input.programmeId);
            data.status = choice(input.status, ['Active','Inactive'], 'participant status');
            const programme = await requireProgramme(q, coachID, data.programmeId);
            if (programme.Status === 'Archived') fail('Choose an open programme.');
            if (id) {
                await requireParticipant(q, coachID, id);
                await q.run('UPDATE Users SET FirstName = ?, LastName = ?, Email = ? WHERE UserID = ?', [data.firstName,data.lastName,data.email,id]);
            } else {
                const password = String(input.password || '');
                if (password.length < 8 || password.length > 200) fail('Use a temporary password of 8 to 200 characters.');
                const hash = await bcrypt.hash(password, 12);
                const result = await q.run(`INSERT INTO Users(FirstName,LastName,Email,PasswordHash,Role,OrganisationID)
                    VALUES(?,?,?,?,'Participant',?)`, [data.firstName,data.lastName,data.email,hash,coach.OrganisationID || null]);
                id = result.id;
            }
            const status = data.status === 'Active' ? 'Active' : 'Withdrawn';
            await q.run(`INSERT INTO ProgrammeParticipants(ProgrammeID,UserID,Status) VALUES(?,?,?)
                ON CONFLICT(ProgrammeID,UserID) DO UPDATE SET Status = excluded.Status`, [data.programmeId,id,status]);
            await q.run("INSERT OR IGNORE INTO Progress(ProgrammeID,UserID,ProgressPercentage,Status) VALUES(?,?,0,'Not Started')", [data.programmeId,id]);
        } else if (resource === 'appointments' || resource === 'actions') {
            data.participantId = identifier(input.participantId);
            data.programmeId = identifier(input.programmeId);
            const programme = await requireProgramme(q,coachID,data.programmeId);
            if (programme.Status === 'Archived') fail('Choose an open programme.');
            await requireParticipant(q,coachID,data.participantId,data.programmeId);
            const assignment = await q.get("SELECT Status FROM ProgrammeParticipants WHERE ProgrammeID = ? AND UserID = ?", [data.programmeId,data.participantId]);
            if (assignment.Status !== 'Active') fail('Choose a participant actively enrolled in this programme.');
            data.title = text(input.title,'Title',true,255);
            if (resource === 'appointments') {
                data.date = date(input.date);
                data.time = text(input.time,'Start time',true,5);
                if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time)) fail('Enter a valid start time.');
                data.duration = Number(input.duration);
                if (!Number.isInteger(data.duration) || data.duration < 5 || data.duration > 480) fail('Duration must be 5 to 480 minutes.');
                const end = Number(data.time.slice(0,2))*60+Number(data.time.slice(3))+data.duration;
                if (end >= 1440) fail('The appointment must end before midnight.');
                const endTime = `${String(Math.floor(end/60)).padStart(2,'0')}:${String(end%60).padStart(2,'0')}`;
                data.type = text(input.type,'Session type',true,100);
                data.status = choice(input.status,['Scheduled','Completed','Cancelled','Rescheduled','Missed'],'session status');
                data.missed=data.status==='Missed';
                data.location=text(input.location,'Location',false,1000);
                data.meetingLink=text(input.meetingLink,'Meeting link',false,2000);
                if(data.meetingLink) {
                    let url;
                    try {url=new URL(data.meetingLink);} catch {fail('Enter a valid meeting link.');}
                    if(!['https:','http:'].includes(url.protocol))fail('Use an HTTP or HTTPS meeting link.');
                }
                data.agenda=text(input.agenda,'Agenda');
                data.notes = text(input.notes,'Notes');
                if (['Scheduled','Rescheduled'].includes(data.status)) {
                    const conflict = await q.get(`SELECT SessionID FROM Sessions WHERE SessionDate = ? AND SessionID != ?
                        AND Status IN ('Scheduled','Rescheduled') AND (CoachID = ? OR ParticipantID = ?)
                        AND StartTime < ? AND (EndTime > ? OR (EndTime IS NULL AND StartTime >= ?))`,
                        [data.date,id || 0,coachID,data.participantId,endTime,data.time,data.time]);
                    if (conflict) fail('The Coach or participant already has an appointment during this time.',409);
                }
                const values=[data.programmeId,data.participantId,data.date,data.time,endTime,data.type,data.missed?'Cancelled':data.status];
                if (id) await q.run('UPDATE Sessions SET ProgrammeID=?,ParticipantID=?,SessionDate=?,StartTime=?,EndTime=?,SessionType=?,Status=? WHERE SessionID=? AND CoachID=?', [...values,id,coachID]);
                else id=(await q.run('INSERT INTO Sessions(ProgrammeID,ParticipantID,SessionDate,StartTime,EndTime,SessionType,Status,CoachID) VALUES(?,?,?,?,?,?,?,?)',[...values,coachID])).id;
                const previousNote=await q.get('SELECT Notes FROM SessionNotes WHERE SessionID=? AND CoachID=? ORDER BY UpdatedAt DESC, SessionNoteID DESC LIMIT 1',[id,coachID]);
                if (previousNote?.Notes!==data.notes && (data.notes || previousNote)) {
                    await q.run('INSERT INTO SessionNotes(SessionID,CoachID,Notes) VALUES(?,?,?)',[id,coachID,data.notes]);
                }
            } else {
                data.assigneeType=choice(input.assigneeType || 'Participant',['Participant','Coach'],'assignee');
                data.description=text(input.description,'Description');
                data.dueDate=date(input.dueDate);
                data.priority=choice(input.priority,['Low','Medium','High'],'priority');
                data.status=choice(input.status,['Pending','In Progress','Completed','Cancelled'],'action status');
                const completed=data.status==='Completed'?new Date().toISOString():null;
                const values=[data.programmeId,data.assigneeType==='Coach'?coachID:data.participantId,data.title,data.description,data.dueDate,data.status,completed];
                if (id) {
                    const session=await q.get('SELECT SessionID,ProgrammeID,AssignedTo FROM Actions WHERE ActionID=?',[id]);
                    if (session.SessionID && (session.ProgrammeID!==data.programmeId || session.AssignedTo!==(data.assigneeType==='Coach'?coachID:data.participantId))) fail('Keep the participant and programme linked to this action’s session.');
                    await q.run('UPDATE Actions SET ProgrammeID=?,AssignedTo=?,Title=?,Description=?,DueDate=?,Status=?,CompletedAt=? WHERE ActionID=? AND AssignedBy=?',[...values,id,coachID]);
                } else id=(await q.run('INSERT INTO Actions(ProgrammeID,AssignedTo,Title,Description,DueDate,Status,CompletedAt,AssignedBy) VALUES(?,?,?,?,?,?,?,?)',[...values,coachID])).id;
            }
        } else if (resource === 'metrics') {
            data.participantId=identifier(input.participantId);
            await requireParticipant(q,coachID,data.participantId);
            for (const field of ['name','category','unit']) data[field]=text(input[field],field,true,255);
            for (const field of ['baseline','current','target']) {
                if (input[field] === '' || input[field] == null) fail('Complete all metric values.');
                data[field]=Number(input[field]);
                if (!Number.isFinite(data[field]) || data[field]<0) fail('Use nonnegative numbers for metric values.');
            }
            data.date=date(input.date);
            data.notes=text(input.notes,'Notes');
            if (id) await q.run('UPDATE CoachingMetrics SET ParticipantID=?,Data=? WHERE MetricID=? AND CoachID=?',[data.participantId,JSON.stringify(data),id,coachID]);
            else id=(await q.run('INSERT INTO CoachingMetrics(CoachID,ParticipantID,Data) VALUES(?,?,?)',[coachID,data.participantId,JSON.stringify(data)])).id;
            return id;
        } else fail('Unknown workspace resource.',404);
        await putDetails(q,resource,id,coachID,data);
        return id;
    }

    require('./coachingGoals')(app,{db,ready,transaction,queries,requireRoles,handler,requireParticipant,identifier,date,text,choice,fail});

    app.get('/api/coach/:resource', requireRoles('Coach'), handler(async (req,res) => {
        res.json(await list(req.params.resource,req.session.user.UserID));
    }));
    app.post('/api/coach/:resource', requireRoles('Coach'), handler(async (req,res) => {
        const resource=req.params.resource;
        const requestID=text(req.body.requestId,'Request ID',false,100);
        const hash=crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
        const id=await transaction(async q=>{
            if (requestID) {
                const prior=await q.get('SELECT RecordID,BodyHash FROM CoachWorkspaceRequests WHERE CoachID=? AND Resource=? AND RequestID=?',[req.session.user.UserID,resource,requestID]);
                if (prior) {
                    if (prior.BodyHash!==hash) fail('This request was already saved with different information. Reopen the form to create another record.',409);
                    return prior.RecordID;
                }
            }
            const result=await save(q,resource,req.session.user,null,req.body);
            if (requestID) await q.run('INSERT INTO CoachWorkspaceRequests(CoachID,Resource,RequestID,BodyHash,RecordID) VALUES(?,?,?,?,?)',[req.session.user.UserID,resource,requestID,hash,result]);
            return result;
        });
        writeAuditLog(req,'COACH_RECORD_CREATED',resource,id,'Success');
        res.status(201).json({id});
    }));
    app.put('/api/coach/:resource/:id', requireRoles('Coach'), handler(async (req,res) => {
        const id=identifier(req.params.id);
        await transaction(q=>save(q,req.params.resource,req.session.user,id,req.body));
        writeAuditLog(req,'COACH_RECORD_UPDATED',req.params.resource,id,'Success');
        res.json({id});
    }));
    app.delete('/api/coach/:resource/:id', requireRoles('Coach'), handler(async (req,res) => {
        const resource=req.params.resource;
        const id=identifier(req.params.id);
        if (!['actions','metrics'].includes(resource)) fail('This record cannot be deleted here.',403);
        await transaction(async q=>{
            const record=(await list(resource,req.session.user.UserID)).find(row=>row.id===id);
            if (!record) fail('Record not found or access denied.',404);
            if (resource==='actions') {
                const files=await q.get('SELECT COUNT(*) AS Total FROM UploadedFiles WHERE ActionID=?',[id]);
                if (files.Total) fail('Use the action document controls to remove its files before deletion.',409);
                await q.run('DELETE FROM Actions WHERE ActionID=? AND AssignedBy=?',[id,req.session.user.UserID]);
            } else await q.run('DELETE FROM CoachingMetrics WHERE MetricID=? AND CoachID=?',[id,req.session.user.UserID]);
            await q.run('DELETE FROM CoachWorkspaceDetails WHERE Resource=? AND RecordID=? AND OwnerID=?',[resource,id,req.session.user.UserID]);
        });
        writeAuditLog(req,'COACH_RECORD_DELETED',resource,id,'Success');
        res.json({message:'Record deleted.'});
    }));

    async function peers(user) {
        const coach=user.Role==='Coach';
        return queries(db).all(`SELECT DISTINCT U.UserID AS id,U.FirstName AS firstName,U.LastName AS lastName,U.Email AS email
            FROM Users U JOIN ${coach?'ProgrammeParticipants':'ProgrammeCoaches'} Target ON Target.UserID=U.UserID
            JOIN ${coach?'ProgrammeCoaches':'ProgrammeParticipants'} Own ON Own.ProgrammeID=Target.ProgrammeID
            WHERE Own.UserID=? AND U.Role=? AND U.AccountStatus='Active'
              AND ${coach?"Own.Status='Active' AND Target.Status IN ('Active','Completed')":"Target.Status='Active' AND Own.Status IN ('Active','Completed')"}`,
            [user.UserID,coach?'Participant':'Coach']);
    }
    app.get('/api/workspace/contacts',requireRoles('Coach','Participant'),handler(async(req,res)=>res.json(await peers(req.session.user))));
    app.get('/api/workspace/messages/:peer',requireRoles('Coach','Participant'),handler(async(req,res)=>{
        const peer=identifier(req.params.peer);
        if (!(await peers(req.session.user)).some(user=>user.id===peer)) fail('Conversation access denied.',403);
        const rows=await queries(db).all(`SELECT MessageID AS id, SenderID AS senderId, RecipientID AS recipientId, Type AS type,
            Text AS text, FileName AS fileName, MimeType AS mimeType, CreatedAt AS timestamp
            FROM CoachingMessages WHERE (SenderID=? AND RecipientID=?) OR (SenderID=? AND RecipientID=?) ORDER BY MessageID`,
            [req.session.user.UserID,peer,peer,req.session.user.UserID]);
        res.json(rows);
    }));
    app.post('/api/workspace/messages/:peer',requireRoles('Coach','Participant'),handler(async(req,res)=>{
        const peer=identifier(req.params.peer);
        if (!(await peers(req.session.user)).some(user=>user.id===peer)) fail('Conversation access denied.',403);
        const type=choice(req.body.type,['text','file','voice'],'message type');
        const body=text(req.body.text,'Message',type==='text');
        const requestID=text(req.body.requestId,'Request ID',true,100);
        let buffer=null, mime=null, filename=null;
        if (type!=='text') {
            const match=/^data:([a-zA-Z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.fileData || ''));
            if (!match) fail('The attachment is invalid.');
            mime=match[1];
            if (type==='voice' && !mime.startsWith('audio/')) fail('Choose an audio recording.');
            buffer=Buffer.from(match[2],'base64');
            if (!buffer.length || buffer.length>5*1024*1024) fail('Attachments must be 5 MB or smaller.');
            filename=text(req.body.fileName || (type==='voice'?'voice-note.webm':'attachment'),'File name',true,255);
        }
        const id=await transaction(async q=>{
            const prior=await q.get('SELECT * FROM CoachingMessages WHERE SenderID=? AND RequestID=?',[req.session.user.UserID,requestID]);
            if (prior) {
                const sameFile=(!buffer && !prior.FileData) || (buffer && prior.FileData && buffer.equals(prior.FileData));
                if (prior.RecipientID!==peer || prior.Type!==type || prior.Text!==body || prior.FileName!==filename || prior.MimeType!==mime || !sameFile) {
                    fail('This message request was already saved with different content.',409);
                }
                return prior.MessageID;
            }
            const result=await q.run(`INSERT INTO CoachingMessages(SenderID,RecipientID,Type,Text,FileName,MimeType,FileData,RequestID)
                VALUES(?,?,?,?,?,?,?,?)`,[req.session.user.UserID,peer,type,body,filename,mime,buffer,requestID]);
            return result.id;
        });
        res.status(201).json({id});
    }));
    app.get('/api/workspace/message-files/:id',requireRoles('Coach','Participant'),handler(async(req,res)=>{
        const row=await queries(db).get('SELECT * FROM CoachingMessages WHERE MessageID=?',[identifier(req.params.id)]);
        const own=req.session.user.UserID;
        if (!row || !row.FileData || ![row.SenderID,row.RecipientID].includes(own)) fail('Attachment not found.',404);
        const peer=row.SenderID===own?row.RecipientID:row.SenderID;
        if (!(await peers(req.session.user)).some(user=>user.id===peer)) fail('Attachment access denied.',403);
        res.set('Content-Type',row.Type==='voice'?row.MimeType:'application/octet-stream');
        if (row.Type==='voice') res.set('Content-Disposition','inline');
        else res.attachment(row.FileName);
        res.send(row.FileData);
    }));
    return {
        async updateSessionStatus(sessionID,coachID,status) {
            await ready;
            return transaction(async q=>{
                const result=await q.run('UPDATE Sessions SET Status=? WHERE SessionID=?',[status==='Missed'?'Cancelled':status,sessionID]);
                if (!result.changes) return result;
                const missed=status==='Missed'?1:0;
                await q.run(`INSERT INTO CoachWorkspaceDetails(Resource,RecordID,OwnerID,Data)
                    VALUES('appointments',?,?,json_object('missed',?))
                    ON CONFLICT(Resource,RecordID,OwnerID) DO UPDATE SET Data=json_set(Data,'$.missed',?)`,
                    [sessionID,coachID,missed,missed]);
                return result;
            });
        }
    };
};
