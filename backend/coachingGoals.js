const crypto = require('node:crypto');
const schema = `
CREATE TABLE IF NOT EXISTS CoachingGoalMeasurements (
    MeasurementID INTEGER PRIMARY KEY AUTOINCREMENT,
    MetricID INTEGER NOT NULL REFERENCES CoachingMetrics(MetricID) ON DELETE CASCADE,
    Value REAL NOT NULL CHECK(Value >= 0),
    ProgressDate TEXT NOT NULL,
    Notes TEXT NOT NULL DEFAULT '',
    IsBaseline INTEGER NOT NULL DEFAULT 0 CHECK(IsBaseline IN (0,1)),
    RequestID TEXT,
    UNIQUE(MetricID,RequestID)
);
CREATE INDEX IF NOT EXISTS CoachingGoalMeasurementDates ON CoachingGoalMeasurements(MetricID,ProgressDate,MeasurementID);
INSERT INTO CoachingGoalMeasurements(MetricID,Value,ProgressDate,Notes,IsBaseline)
SELECT M.MetricID, json_extract(M.Data,'$.baseline'), substr(M.CreatedAt,1,10), 'Initial starting measurement.',1
FROM CoachingMetrics M WHERE json_valid(M.Data) AND NOT EXISTS (SELECT 1 FROM CoachingGoalMeasurements H WHERE H.MetricID=M.MetricID);
INSERT INTO CoachingGoalMeasurements(MetricID,Value,ProgressDate,Notes,RequestID)
SELECT M.MetricID,json_extract(M.Data,'$.current'),COALESCE(json_extract(M.Data,'$.date'),substr(M.CreatedAt,1,10)),
COALESCE(json_extract(M.Data,'$.notes'),''),'legacy-current'
FROM CoachingMetrics M WHERE json_valid(M.Data) AND json_extract(M.Data,'$.current') != json_extract(M.Data,'$.baseline')
AND NOT EXISTS (SELECT 1 FROM CoachingGoalMeasurements H WHERE H.MetricID=M.MetricID AND H.IsBaseline=0);
`;

module.exports = function registerGoals(app, helpers) {
    const { db, ready, transaction, queries, requireRoles, handler, requireParticipant, identifier, date, text, choice, fail } = helpers;
    const initialised = ready.then(() => new Promise((resolve,reject)=>db.exec(schema,error=>error?reject(error):resolve())));
    async function list(user) {
        await initialised;
        const q=queries(db);
        const rows=await q.all(`SELECT M.*,U.FirstName AS CoachFirstName,U.LastName AS CoachLastName
            FROM CoachingMetrics M JOIN Users U ON U.UserID=M.CoachID
            WHERE ${user.Role==='Participant'?'M.ParticipantID':'M.CoachID'}=? AND EXISTS (
                SELECT 1 FROM ProgrammeParticipants PP JOIN ProgrammeCoaches PC ON PC.ProgrammeID=PP.ProgrammeID
                WHERE PP.UserID=M.ParticipantID AND PC.UserID=M.CoachID AND PC.Status='Active'
                  ${user.Role==='Participant'?"AND PP.Status IN ('Active','Completed')":''})`,[user.UserID]);
        const measurements=await q.all(`SELECT H.* FROM CoachingGoalMeasurements H JOIN CoachingMetrics M ON M.MetricID=H.MetricID
            WHERE ${user.Role==='Participant'?'M.ParticipantID':'M.CoachID'}=? ORDER BY H.ProgressDate,H.MeasurementID`,[user.UserID]);
        return rows.map(row=>{
            const data=JSON.parse(row.Data);
            const updates=measurements.filter(item=>item.MetricID===row.MetricID).map(item=>({id:item.MeasurementID,value:item.Value,date:item.ProgressDate,notes:item.Notes,isBaseline:Boolean(item.IsBaseline)}));
            const latest=updates.filter(item=>!item.isBaseline).at(-1) || updates[0];
            return { ...data,id:row.MetricID,participantId:row.ParticipantID,coachName:`${row.CoachFirstName} ${row.CoachLastName}`,
                currentValue:latest?.value ?? data.current, current:latest?.value ?? data.current,
                direction:data.direction || (data.target<data.baseline?'decrease':'increase'),
                targetDate:data.targetDate || data.date || row.CreatedAt.slice(0,10),frequency:data.frequency || 'No Reminder',
                description:data.description || data.notes || '',createdAt:row.CreatedAt,updates,lastUpdatedAt:latest?.date || data.date || row.CreatedAt.slice(0,10) };
        });
    }
    async function owned(q,user,id) {
        const row=await q.get('SELECT * FROM CoachingMetrics WHERE MetricID=? AND CoachID=?',[id,user.UserID]);
        if (!row) fail('Goal not found or access denied.',404);
        await requireParticipant(q,user.UserID,row.ParticipantID);
        return row;
    }
    async function save(req,res,id) {
        await initialised;
        const b=req.body,user=req.session.user;
        const data={};
        data.participantId=identifier(b.participantId);
        for(const field of ['name','category','unit']) data[field]=text(b[field],field,true,255);
        for(const field of ['baseline','target']) {
            if(b[field]==null || b[field]==='') fail('Complete all measurements.');
            data[field]=Number(b[field]);
            if(!Number.isFinite(data[field]) || data[field]<0) fail('Measurements must be nonnegative numbers.');
        }
        data.direction=choice(b.direction,['increase','decrease'],'goal direction');
        if((data.direction==='increase' && data.target<data.baseline)||(data.direction==='decrease' && data.target>data.baseline)) fail('The target must match the selected direction.');
        data.targetDate=date(b.targetDate);
        data.frequency=choice(b.frequency,['Weekly','Fortnightly','Monthly','No Reminder'],'update frequency');
        data.description=text(b.description,'Description');
        const requestID=text(b.requestId,'Request ID',false,100);
        const hash=crypto.createHash('sha256').update(JSON.stringify(b)).digest('hex');
        const result=await transaction(async q=>{
            if(!id && requestID) {
                const prior=await q.get("SELECT * FROM CoachWorkspaceRequests WHERE CoachID=? AND Resource='goals' AND RequestID=?",[user.UserID,requestID]);
                if(prior) {if(prior.BodyHash!==hash)fail('The request was already used for another goal.',409);return prior.RecordID;}
            }
            await requireParticipant(q,user.UserID,data.participantId);
            const previous=id?await owned(q,user,id):null;
            const old=previous?JSON.parse(previous.Data):{};
            const latest=id?await q.get('SELECT Value,ProgressDate FROM CoachingGoalMeasurements WHERE MetricID=? AND IsBaseline=0 ORDER BY ProgressDate DESC,MeasurementID DESC LIMIT 1',[id]):null;
            data.current=latest?.Value ?? data.baseline;
            data.date=latest?.ProgressDate || new Date().toISOString().slice(0,10);
            data.notes=old.notes || '';
            if(id) {
                await q.run('UPDATE CoachingMetrics SET ParticipantID=?,Data=? WHERE MetricID=? AND CoachID=?',[data.participantId,JSON.stringify(data),id,user.UserID]);
                await q.run('UPDATE CoachingGoalMeasurements SET Value=? WHERE MetricID=? AND IsBaseline=1',[data.baseline,id]);
            } else {
                id=(await q.run('INSERT INTO CoachingMetrics(CoachID,ParticipantID,Data) VALUES(?,?,?)',[user.UserID,data.participantId,JSON.stringify(data)])).id;
                await q.run('INSERT INTO CoachingGoalMeasurements(MetricID,Value,ProgressDate,Notes,IsBaseline) VALUES(?,?,?,?,1)',[id,data.baseline,data.date,'Initial starting measurement.']);
                if(requestID)await q.run("INSERT INTO CoachWorkspaceRequests(CoachID,Resource,RequestID,BodyHash,RecordID) VALUES(?,'goals',?,?,?)",[user.UserID,requestID,hash,id]);
            }
            return id;
        });
        res.status(req.method==='POST'?201:200).json({id:result});
    }
    app.get('/api/coach/goals',requireRoles('Coach'),handler(async(req,res)=>res.json(await list(req.session.user))));
    app.get('/api/participant/goals',requireRoles('Participant'),handler(async(req,res)=>res.json(await list(req.session.user))));
    app.post('/api/coach/goals',requireRoles('Coach'),handler((req,res)=>save(req,res,null)));
    app.put('/api/coach/goals/:id',requireRoles('Coach'),handler((req,res)=>save(req,res,identifier(req.params.id))));
    app.post('/api/coach/goals/:id/updates',requireRoles('Coach'),handler(async(req,res)=>{
        await initialised;
        const id=identifier(req.params.id),value=Number(req.body.value),progressDate=date(req.body.date);
        if(req.body.value==null || req.body.value==='' || !Number.isFinite(value)||value<0)fail('Enter a valid nonnegative measurement.');
        if(progressDate>new Date().toISOString().slice(0,10))fail('Progress updates cannot use a future date.');
        const notes=text(req.body.notes,'Notes'),requestID=text(req.body.requestId,'Request ID',true,100);
        await transaction(async q=>{
            const row=await owned(q,req.session.user,id);
            const prior=await q.get('SELECT * FROM CoachingGoalMeasurements WHERE MetricID=? AND RequestID=?',[id,requestID]);
            if(prior) {
                if(prior.Value!==value || prior.ProgressDate!==progressDate || prior.Notes!==notes)fail('This update request was already saved with different information.',409);
                return;
            }
            await q.run('INSERT INTO CoachingGoalMeasurements(MetricID,Value,ProgressDate,Notes,RequestID) VALUES(?,?,?,?,?)',[id,value,progressDate,notes,requestID]);
            const latest=await q.get('SELECT Value,ProgressDate FROM CoachingGoalMeasurements WHERE MetricID=? AND IsBaseline=0 ORDER BY ProgressDate DESC,MeasurementID DESC LIMIT 1',[id]);
            const data={...JSON.parse(row.Data),current:latest.Value,date:latest.ProgressDate};
            await q.run('UPDATE CoachingMetrics SET Data=? WHERE MetricID=?',[JSON.stringify(data),id]);
        });
        res.status(201).json({message:'Progress recorded.'});
    }));
    app.delete('/api/coach/goals/:id',requireRoles('Coach'),handler(async(req,res)=>{
        await initialised;
        const id=identifier(req.params.id);
        await transaction(async q=>{await owned(q,req.session.user,id);await q.run('DELETE FROM CoachingMetrics WHERE MetricID=? AND CoachID=?',[id,req.session.user.UserID]);});
        res.json({message:'Goal deleted.'});
    }));
};
module.exports.schema=schema;
