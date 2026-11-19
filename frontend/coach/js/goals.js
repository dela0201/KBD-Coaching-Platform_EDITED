import { request, ready, byId, setText, element, button, options, pageError, fullName, requestId } from './api.js';
let goals=[],participants=[],actions=[],sessions=[],editing=null,saving=false,creation=null,updateRequest=null;
const fields={participantId:'goal-participant',name:'goal-name',category:'goal-category',unit:'goal-unit',baseline:'goal-baseline',target:'goal-target',direction:'goal-direction',targetDate:'goal-target-date',frequency:'goal-frequency',description:'goal-description'};
function today() {const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;}
function progress(goal) {return goal.baseline===goal.target?(goal.currentValue===goal.target?100:0):Math.min(100,Math.max(0,(goal.currentValue-goal.baseline)/(goal.target-goal.baseline)*100));}
function status(goal) {
    if(progress(goal)>=100)return 'Achieved';
    if(goal.targetDate<today())return 'Needs Attention';
    const interval={Weekly:7,Fortnightly:14,Monthly:30}[goal.frequency];
    if(interval){const next=new Date(goal.lastUpdatedAt+'T00:00:00');next.setDate(next.getDate()+interval);if(next<=new Date(today()+'T00:00:00'))return 'Needs Attention';}
    return 'On Track';
}
function name(id){const person=participants.find(p=>p.id===Number(id));return person?fullName(person):'Participant';}
function hide(id){byId(id).hidden=true;byId(id).style.display='none';}
function show(id){byId(id).hidden=false;byId(id).style.display='block';byId(id).scrollIntoView({behavior:'smooth'});}
async function load(){
    try {
        await ready;
        [goals,participants,actions,sessions]=await Promise.all(['goals','participants','actions','appointments'].map(resource=>request('/api/coach/'+resource)));
        const selected=byId('goal-participant-filter').value;
        options(byId('goal-participant-filter'),participants,fullName,p=>p.id,'All participants');byId('goal-participant-filter').options[0].value='All';byId('goal-participant-filter').value=selected || 'All';
        options(byId('goal-participant'),participants,fullName,p=>p.id,'Select participant');
        render();
    }catch(error){pageError(error,load);}
}
function render(){
    const completed=actions.filter(a=>a.status==='Completed').length;
    setText('active-goals-count',goals.filter(g=>status(g)!=='Achieved').length);setText('goals-achieved-count',goals.filter(g=>status(g)==='Achieved').length);
    setText('on-track-goals-count',goals.filter(g=>status(g)==='On Track').length);setText('goals-needing-attention-count',goals.filter(g=>status(g)==='Needs Attention').length);
    setText('insight-action-completion-rate',`${actions.length?Math.round(completed/actions.length*100):0}%`);
    setText('insight-action-summary',`${completed} of ${actions.length} actions completed`);
    setText('insight-completed-sessions',sessions.filter(s=>s.status==='Completed').length);
    setText('insight-open-actions',actions.filter(a=>!['Completed','Cancelled'].includes(a.status)).length);
    setText('insight-participants-with-goals',new Set(goals.map(g=>g.participantId)).size);
    const term=byId('goal-search').value.trim().toLowerCase(),person=byId('goal-participant-filter').value,state=byId('goal-status-filter').value;
    const rows=goals.filter(g=>(g.name+' '+name(g.participantId)+' '+g.category).toLowerCase().includes(term)&&(!person||person==='All'||String(g.participantId)===person)&&(state==='All'||status(g)===state));
    const list=byId('goal-list');list.replaceChildren();
    rows.forEach(goal=>{
        const card=element('article',null,'goal-card');const heading=element('div',null,'goal-card-header'),info=element('div');
        info.append(element('h3',goal.name,'goal-card-title'),element('p',name(goal.participantId),'goal-card-participant'),element('span',goal.category,'goal-category'));
        heading.append(info,element('span',status(goal),'goal-status-badge status-'+status(goal).toLowerCase().replaceAll(' ','-')));card.append(heading);
        const measurements=element('div',null,'goal-measurements');
        for(const [label,value]of [['Starting Point',goal.baseline],['Current',goal.currentValue],['Target',goal.target]]){const measurement=element('div',null,'goal-measurement');measurement.append(element('span',label),element('strong',`${value} ${goal.unit}`));measurements.append(measurement);}
        const track=element('div',null,'goal-progress-track');track.setAttribute('role','progressbar');track.setAttribute('aria-label',goal.name);track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');track.setAttribute('aria-valuenow',String(Math.round(progress(goal))));
        const fill=element('div',null,'goal-progress-fill');fill.style.width=progress(goal)+'%';track.append(fill);
        card.append(measurements,element('p',`Goal progress ${Math.round(progress(goal))}%`),track,element('p',goal.description,'goal-description'),element('p',`Target date ${goal.targetDate} · Updates ${goal.frequency}`,'goal-description'));
        const controls=element('div',null,'goal-card-actions');
        controls.append(button('Record Update',()=>openUpdate(goal)),button('History',()=>history(goal)),button('Edit',()=>open(goal)),button('Delete',()=>remove(goal)));
        card.append(controls);list.append(card);
    });
    setText('goal-results-count',`${rows.length} goals`);byId('goals-empty-state').hidden=rows.length>0;byId('goals-empty-state').style.display=rows.length?'none':'block';
}
function open(goal=null){editing=goal?.id||null;creation=null;byId('goal-form').reset();setText('goal-form-title',goal?'Edit Participant Goal':'Create Participant Goal');setText('goal-form-message','');
    for(const[key,id]of Object.entries(fields))if(goal?.[key]!=null)byId(id).value=goal[key];
    byId('goal-target-date').min=goal?'':today();show('goal-form-panel');
}
function openUpdate(goal){updateRequest=null;byId('goal-update-form').reset();byId('goal-update-id').value=goal.id;setText('goal-update-title',goal.name);byId('goal-update-date').value=today();byId('goal-update-date').max=today();setText('goal-update-message','');show('goal-update-panel');}
function history(goal){setText('goal-history-title',goal.name+' — Progress History');const body=byId('goal-history-table-body');body.replaceChildren();[...goal.updates].reverse().forEach(update=>{const row=element('tr');[update.value,goal.unit,update.date,update.notes].forEach(value=>row.append(element('td',value)));body.append(row);});byId('goal-history-empty-state').hidden=goal.updates.length>0;show('goal-history-panel');}
async function remove(goal){if(!confirm('Delete this goal and its measurement history?'))return;try{await request('/api/coach/goals/'+goal.id,{method:'DELETE'});await load();}catch(error){pageError(error);}}
byId('add-goal-btn').addEventListener('click',()=>open());
for(const id of ['close-goal-form','cancel-goal-form'])byId(id).addEventListener('click',()=>{if(!saving)hide('goal-form-panel');});
for(const id of ['close-goal-update','cancel-goal-update'])byId(id).addEventListener('click',()=>{if(!saving)hide('goal-update-panel');});
byId('close-goal-history').addEventListener('click',()=>hide('goal-history-panel'));
for(const id of ['goal-search','goal-participant-filter','goal-status-filter'])byId(id).addEventListener(id==='goal-search'?'input':'change',render);
byId('goal-form').addEventListener('submit',async event=>{
    event.preventDefault();if(saving)return;saving=true;event.submitter.disabled=true;
    const data=Object.fromEntries(Object.entries(fields).map(([key,id])=>[key,byId(id).value]));
    if(!editing){const signature=JSON.stringify(data);if(creation?.signature!==signature)creation={signature,id:requestId()};data.requestId=creation.id;}
    try{await request('/api/coach/goals'+(editing?'/'+editing:''),{method:editing?'PUT':'POST',body:JSON.stringify(data)});hide('goal-form-panel');await load();}
    catch(error){setText('goal-form-message',error.message);}finally{saving=false;event.submitter.disabled=false;}
});
byId('goal-update-form').addEventListener('submit',async event=>{
    event.preventDefault();if(saving)return;saving=true;event.submitter.disabled=true;
    const data={value:byId('goal-update-value').value,date:byId('goal-update-date').value,notes:byId('goal-update-notes').value};
    const signature=JSON.stringify(data);if(updateRequest?.signature!==signature)updateRequest={signature,id:requestId()};data.requestId=updateRequest.id;
    try{await request('/api/coach/goals/'+byId('goal-update-id').value+'/updates',{method:'POST',body:JSON.stringify(data)});hide('goal-update-panel');await load();}
    catch(error){setText('goal-update-message',error.message);}finally{saving=false;event.submitter.disabled=false;}
});
load();
