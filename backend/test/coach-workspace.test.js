const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcryptjs');

const backend = path.resolve(__dirname, '..');

test('Coach workspace shares core records, persists extensions, and enforces assignment access', { timeout: 60000 }, async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(),'kbd-coach-integration-'));
    const database = path.join(directory,'kbd.db');
    const password = 'WorkspaceTestOnly123!';
    const port = 15000 + Math.floor(Math.random()*10000);
    const origin = `http://127.0.0.1:${port}`;
    const environment = {
        ...process.env, NODE_ENV:'development', PORT:String(port),
        SESSION_SECRET:'coach-workspace-test-session-secret', KBD_DATABASE_PATH:database,
        KBD_DATABASE_DIR:directory,KBD_UPLOAD_DIRECTORY:path.join(directory,'uploads'),
        KBD_ADMIN_FIRST_NAME:'Test',KBD_ADMIN_LAST_NAME:'Admin',KBD_ADMIN_EMAIL:'admin@workspace.test',
        KBD_ADMIN_PASSWORD:password,KBD_INITIAL_PASSWORD:password,KBD_SYNC_ADMIN_PASSWORDS:'false'
    };
    let server;
    let logs='';
    function initialise(script) {
        const result=spawnSync(process.execPath,[script],{cwd:backend,env:environment,encoding:'utf8'});
        assert.equal(result.status,0,result.stderr || result.stdout);
    }
    async function start() {
        server=spawn(process.execPath,['server.js'],{cwd:backend,env:environment,stdio:['ignore','pipe','pipe']});
        server.stdout.on('data',chunk=>{logs+=chunk;});server.stderr.on('data',chunk=>{logs+=chunk;});
        for(let attempt=0;attempt<100;attempt++) {
            try {if((await fetch(origin+'/api/health')).ok)return;} catch {}
            await new Promise(resolve=>setTimeout(resolve,50));
        }
        throw new Error('Server did not start: '+logs);
    }
    async function stop() {
        if(!server || server.exitCode!==null)return;
        await new Promise(resolve=>{server.once('exit',resolve);server.kill();});
    }
    async function call(url,cookie,method='GET',body,expected=200) {
        const response=await fetch(origin+url,{method,headers:{Accept:'application/json',Cookie:cookie || '',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
        const data=await response.json();
        assert.equal(response.status,expected,`${method} ${url}: ${JSON.stringify(data)}\n${logs}`);
        return data;
    }
    async function login(email) {
        const response=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({Email:email,Password:password})});
        assert.equal(response.status,200,await response.clone().text());
        const cookie=response.headers.get('set-cookie').split(';')[0];
        await call('/api/terms/acceptance',cookie,'POST',{TermsVersion:'2026-11-03'});
        return cookie;
    }
    try {
        initialise('initDatabase.js');initialise('createAdminAccounts.js');initialise('createInitialCoach.js');
        const connection=new sqlite3.Database(database);
        // Simulate an existing installation without the new workspace tables.
        await new Promise((resolve,reject)=>connection.exec('DROP TABLE IF EXISTS CoachingGoalMeasurements; DROP TABLE CoachWorkspaceRequests; DROP TABLE CoachWorkspaceDetails; DROP TABLE CoachingMetrics; DROP TABLE CoachingMessages;',error=>error?reject(error):resolve()));
        const hash=await bcrypt.hash(password,12);
        await new Promise((resolve,reject)=>connection.run("INSERT INTO Users(FirstName,LastName,Email,PasswordHash,Role) VALUES('Other','Coach','other@workspace.test',?,'Coach')",[hash],error=>error?reject(error):resolve()));
        await new Promise(resolve=>connection.close(resolve));
        await start();
        const admin=await login('admin@workspace.test');
        const coach=await login('dela@kbd.test');
        const outsider=await login('other@workspace.test');
        const programmeData={name:'Shared coaching journey',description:'Integration test',category:'Leadership',duration:'3 months',objectives:'Build confidence',status:'Active',requestId:'programme-create-1'};
        const [programme,retriedProgramme]=await Promise.all([
            call('/api/coach/programmes',coach,'POST',programmeData,201),
            call('/api/coach/programmes',coach,'POST',programmeData,201)
        ]);
        assert.equal(programme.id,retriedProgramme.id,'Concurrent retries must create one programme');
        const participant=await call('/api/coach/participants',coach,'POST',{firstName:'Test',lastName:'Participant',email:'participant@workspace.test',phone:'0123456789',goals:'Leadership',programmeId:programme.id,status:'Active',password},201);
        const participantSession=await login('participant@workspace.test');
        const coreProgrammes=await call('/api/programmes',admin);
        assert.ok(coreProgrammes.some(row=>row.ProgrammeID===programme.id));
        assert.ok((await call('/api/users',admin)).some(row=>row.UserID===participant.id));
        const appointmentData={participantId:participant.id,programmeId:programme.id,title:'First conversation',date:'2027-01-18',time:'10:00',duration:60,type:'Online',status:'Scheduled',notes:'Shared session note'};
        const appointment=await call('/api/coach/appointments',coach,'POST',appointmentData,201);
        assert.ok((await call('/api/sessions',admin)).some(row=>row.SessionID===appointment.id));
        const overlap=await call('/api/coach/appointments',coach,'POST',{...appointmentData,time:'10:30'},409);
        assert.match(overlap.error,/already/);
        const actionData={participantId:participant.id,programmeId:programme.id,title:'Reflection',dueDate:'2027-01-25',priority:'High',status:'Pending',description:'Reflect on the session'};
        const action=await call('/api/coach/actions',coach,'POST',actionData,201);
        await call(`/api/coach/actions/${action.id}`,coach,'PUT',{...actionData,status:'Completed'});
        assert.equal((await call('/api/actions',admin)).find(row=>row.ActionID===action.id).Status,'Completed');
        const metric=await call('/api/coach/metrics',coach,'POST',{participantId:participant.id,name:'Confidence',category:'Leadership',unit:'Score',baseline:0,current:4,target:10,date:'2027-01-18',notes:'First measurement'},201);
        assert.equal((await call('/api/coach/metrics',coach))[0].current,4);
        const goalData={participantId:participant.id,name:'Leadership score',category:'Leadership',unit:'points',baseline:0,target:10,direction:'increase',targetDate:'2027-02-01',frequency:'Weekly',description:'Shared goal',requestId:'goal-request-1'};
        const goal=await call('/api/coach/goals',coach,'POST',goalData,201);
        const update={value:6,date:new Date().toISOString().slice(0,10),notes:'Improved confidence',requestId:'goal-update-1'};
        await call(`/api/coach/goals/${goal.id}/updates`,coach,'POST',update,201);
        await call(`/api/coach/goals/${goal.id}/updates`,coach,'POST',update,201);
        const participantGoal=(await call('/api/participant/goals',participantSession)).find(row=>row.id===goal.id);
        assert.equal(participantGoal.currentValue,6);
        assert.equal(participantGoal.updates.length,2);
        await call(`/api/coach/goals/${goal.id}/updates`,outsider,'POST',update,404);
        const selfAction=await call('/api/coach/actions',coach,'POST',{...actionData,title:'Coach preparation',assigneeType:'Coach'},201);
        assert.ok(!(await call('/api/actions',participantSession)).some(row=>row.ActionID===selfAction.id),'Coach-only tasks must not enter participant action lists');
        const sessionWithDetails={...appointmentData,meetingLink:'https://example.com/meeting',agenda:'Discuss leadership',location:'',status:'Missed'};
        await call(`/api/coach/appointments/${appointment.id}`,coach,'PUT',sessionWithDetails);
        const participantSessionRow=(await call('/api/sessions',participantSession)).find(row=>row.SessionID===appointment.id);
        assert.equal(participantSessionRow.Status,'Missed');
        assert.equal(participantSessionRow.MeetingLink,sessionWithDetails.meetingLink);
        assert.equal(participantSessionRow.Agenda,sessionWithDetails.agenda);
        assert.equal(participantSessionRow.Notes,undefined,'Private Coach notes must remain private');
        await call(`/api/sessions/${appointment.id}/status`,coach,'PUT',{Status:'Completed'});
        assert.equal((await call('/api/coach/appointments',coach)).find(row=>row.id===appointment.id).status,'Completed');
        await call(`/api/sessions/${appointment.id}/status`,admin,'PUT',{Status:'Missed'});
        assert.equal((await call('/api/sessions',participantSession)).find(row=>row.SessionID===appointment.id).Status,'Missed');
        await call(`/api/sessions/${appointment.id}/status`,admin,'PUT',{Status:'Completed'});
        const decreasingGoal=await call('/api/coach/goals',coach,'POST',{...goalData,name:'Reduce delays',baseline:10,target:0,direction:'decrease',requestId:'goal-request-decrease'},201);
        await call(`/api/coach/goals/${decreasingGoal.id}/updates`,coach,'POST',{...update,value:0,requestId:'goal-update-zero'},201);
        assert.equal((await call('/api/participant/goals',participantSession)).find(row=>row.id===decreasingGoal.id).currentValue,0);


        assert.deepEqual(await call('/api/coach/programmes',outsider),[]);
        assert.deepEqual(await call('/api/coach/metrics',outsider),[]);
        await call(`/api/coach/programmes/${programme.id}`,outsider,'PUT',{name:'Not authorised',status:'Active'},404);
        await call('/api/coach/participants',outsider,'POST',{firstName:'Blocked',lastName:'User',email:'blocked@workspace.test',programmeId:programme.id,status:'Active',password},404);
        assert.ok(!(await call('/api/users',admin)).some(row=>row.Email==='blocked@workspace.test'),'Failed writes must roll back');
        await call('/api/coach/metrics',participantSession,'GET',undefined,403);
        const message={type:'text',text:'Hello participant',requestId:'message-test-1'};
        await call(`/api/workspace/messages/${participant.id}`,coach,'POST',message,201);
        await call(`/api/workspace/messages/${participant.id}`,coach,'POST',message,201);
        assert.equal((await call(`/api/workspace/messages/${participant.id}`,coach)).length,1,'Retries should not duplicate messages');
        const contacts=await call('/api/workspace/contacts',participantSession);
        const coachID=contacts[0].id;
        await call(`/api/workspace/messages/${coachID}`,participantSession,'POST',{type:'text',text:'Hello coach',requestId:'message-test-2'},201);
        assert.equal((await call(`/api/workspace/messages/${participant.id}`,coach)).length,2);
        await call(`/api/workspace/messages/${participant.id}`,outsider,'GET',undefined,403);
        const file=await call(`/api/workspace/messages/${participant.id}`,coach,'POST',{type:'file',fileName:'note.txt',fileData:'data:text/plain;base64,aGVsbG8=',requestId:'file-test-1'},201);
        const download=await fetch(origin+`/api/workspace/message-files/${file.id}`,{headers:{Cookie:participantSession}});
        assert.equal(download.status,200);assert.equal(await download.text(),'hello');
        await call(`/api/workspace/message-files/${file.id}`,outsider,'GET',undefined,404);
        await stop();await start();
        const resumed=await login('dela@kbd.test');
        assert.equal((await call('/api/coach/programmes',resumed))[0].category,'Leadership');
        assert.equal((await call('/api/coach/participants',resumed))[0].phone,'0123456789');
        assert.ok((await call('/api/coach/metrics',resumed)).some(row=>row.id===metric.id));
        assert.equal((await call('/api/coach/goals',resumed)).find(row=>row.id===goal.id).currentValue,6);
        assert.equal((await call(`/api/workspace/messages/${participant.id}`,resumed)).length,3);
    } finally {await stop();fs.rmSync(directory,{recursive:true,force:true});}
});
