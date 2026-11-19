import { request, ready, byId, setText, element, button, options, pageError, fullName, progress, requestId } from './api.js';

const page = location.pathname.split('/').pop().replace('.html','');
const configurations = {
    programmes: {
        singular:'programme', add:'add-programme-btn', form:'programme-form', panel:'programme-form-panel',
        close:['close-programme-form','cancel-programme-form'], message:'programme-form-message', title:'programme-form-title',
        table:'programmes-table-body', empty:'programmes-empty-state', search:'programme-search', results:'programme-results-count',
        filters:[['programme-status-filter','status']],
        fields:{name:'programme-name',category:'programme-category',duration:'programme-duration',status:'programme-status',description:'programme-description',objectives:'programme-objectives'},
        columns:r=>[r.name,r.category || '—',r.duration || '—',r.status,formatDate(r.createdAt)],
        stats:rows=>({'total-programmes':rows.length,'active-programmes':count(rows,'Active'),'draft-programmes':count(rows,'Draft'),'archived-programmes':count(rows,'Archived')})
    },
    participants: {
        singular:'participant', add:'add-participant-btn', form:'participant-form', panel:'participant-form-panel',
        close:['close-form-btn','cancel-form-btn'], message:'form-message', title:'form-title',
        table:'participants-table-body', empty:'empty-state',search:'participant-search',results:'results-count',
        filters:[['status-filter','status']],
        fields:{firstName:'first-name',lastName:'last-name',email:'email',phone:'phone',programmeId:'programme',status:'status',goals:'goals',password:'participant-password'},
        columns:r=>[`${fullName(r)} · ${r.email}`,r.programme,formatDate(r.dateAdded),r.status],
        stats:rows=>({'total-count':rows.length,'active-count':count(rows,'Active'),'inactive-count':count(rows,'Inactive')})
    },
    appointments: {
        singular:'appointment',add:'add-appointment-btn',form:'appointment-form',panel:'appointment-form-panel',
        close:['close-appointment-form','cancel-appointment-form'],message:'appointment-form-message',title:'appointment-form-title',
        table:'appointments-table-body',empty:'appointments-empty-state',search:'appointment-search',results:'appointment-results-count',
        filters:[['appointment-status-filter','status']],
        fields:{participantId:'appointment-participant',programmeId:'appointment-programme',title:'appointment-title',date:'appointment-date',time:'appointment-time',duration:'appointment-duration',type:'appointment-type',status:'appointment-status',notes:'appointment-notes',location:'appointment-location',meetingLink:'appointment-meeting-link',agenda:'appointment-agenda'},
        columns:r=>[participantName(r.participantId),r.title,formatDate(r.date),r.time,`${r.duration} min`,r.type,r.status],
        stats:rows=>({'total-appointments':rows.length,'upcoming-appointments':rows.filter(upcoming).length,'completed-appointments':count(rows,'Completed'),'cancelled-appointments':count(rows,'Cancelled')})
    },
    actions: {
        singular:'action',add:'add-action-btn',form:'action-form',panel:'action-form-panel',
        close:['close-action-form','cancel-action-form'],message:'action-form-message',title:'action-form-title',
        table:'actions-table-body',empty:'actions-empty-state',search:'action-search',results:'action-results-count',
        filters:[['action-status-filter','status'],['action-priority-filter','priority'],['action-assignee-filter','assigneeType']],
        fields:{assigneeType:'action-assignee-type',title:'action-title',participantId:'action-participant',programmeId:'action-programme',dueDate:'action-due-date',priority:'action-priority',status:'action-status',description:'action-description'},
        columns:r=>[r.title,participantName(r.participantId),r.assigneeType || 'Participant',formatDate(r.dueDate),deadline(r),r.priority,r.status==='Pending'?'Not Started':r.status],
        stats:rows=>({'total-actions':rows.length,'overdue-actions':rows.filter(row=>deadline(row)==='Overdue').length,'in-progress-actions':count(rows,'In Progress'),'completed-actions':count(rows,'Completed')})
    },
    metrics: {
        singular:'metric',add:'add-metric-btn',form:'metric-form',panel:'metric-form-panel',
        close:['close-metric-form','cancel-metric-form'],message:'metric-form-message',title:'metric-form-title',
        table:'metrics-table-body',empty:'metrics-empty-state',search:'metric-search',results:'metric-results-count',
        filters:[['metric-participant-filter','participantId'],['metric-category-filter','category']],
        fields:{participantId:'metric-participant',name:'metric-name',category:'metric-category',unit:'metric-unit',baseline:'metric-baseline',current:'metric-current',target:'metric-target',date:'metric-date',notes:'metric-notes'},
        columns:r=>[participantName(r.participantId),r.name,r.category,`${r.baseline} ${r.unit}`,`${r.current} ${r.unit}`,`${r.target} ${r.unit}`,`${Math.round(progress(r))}%`,formatDate(r.date)],
        stats:rows=>({'total-metrics':rows.length,'tracked-participants':new Set(rows.map(r=>r.participantId)).size,'improving-metrics':rows.filter(r=>progress(r)>0).length,'attention-metrics':rows.filter(r=>progress(r)===0).length})
    }
};
let records=[], participants=[], programmes=[];
let editing=null;
let saving=false;
let createRequest=null;
let actionView="current";
const config=configurations[page];
function count(rows,status) { return rows.filter(row=>row.status===status).length; }
function deadline(row) {
    if (['Completed','Cancelled'].includes(row.status)) return row.status;
    if (!row.dueDate) return 'No deadline';
    const now=new Date();now.setHours(0,0,0,0);
    const days=Math.round((new Date(row.dueDate+'T00:00:00')-now)/86400000);
    return days<0?'Overdue':days===0?'Due today':days<=3?'Due soon':'On track';
}
function sessionTypeFields() {
    const online=byId('appointment-type').value==='Online';
    byId('appointment-location-group').hidden=online;
    byId('appointment-meeting-link-group').hidden=!online;
}
function upcoming(row) { return ['Scheduled','Rescheduled'].includes(row.status) && new Date(`${row.date}T${row.time || '23:59'}`)>=new Date(); }
function formatDate(value) {
    return value ? new Date(String(value).slice(0,10)+'T00:00:00').toLocaleDateString('en-ZA') : '—';
}
function participantName(id) { const person=participants.find(p=>p.id===Number(id)); return person ? fullName(person) : 'Participant'; }

async function refresh() {
    try {
        byId(config.table).replaceChildren();
        setText(config.results,'Loading…');
        byId(config.empty).hidden=true;
        [records,participants,programmes]=await Promise.all([
            request(`/api/coach/${page}`),request('/api/coach/participants'),request('/api/coach/programmes')
        ]);
        if (config.fields.participantId) {
            options(byId(config.fields.participantId),participants,p=>fullName(p),p=>p.id,'Select participant');
            if (config.fields.programmeId) byId(config.fields.participantId).onchange=()=>populateProgrammes();
        }
        if (page==='participants') options(byId('programme'),programmes.filter(p=>p.status!=='Archived'),p=>p.name,p=>p.id,'Select programme');
        if (page==='metrics') {
            options(byId('metric-participant-filter'),participants,fullName,p=>p.id,'All participants');
            byId('metric-participant-filter').options[0].value='All';
        }
        if (config.fields.programmeId && page!=='participants') populateProgrammes();
        render();
    } catch(error) {
        setText(config.results,'Unable to load records');
        for (const id of Object.keys(config.stats([]))) setText(id,'Unavailable');
        byId(config.add).disabled=true;
        pageError(error,async()=>{byId(config.add).disabled=false;await refresh();});
    }
}
function populateProgrammes(selected='') {
    const participant=participants.find(p=>p.id===Number(byId(config.fields.participantId)?.value));
    const available=programmes.filter(p=>p.status!=='Archived' && (!participant || participant.programmes.some(link=>link.id===p.id && link.status==='Active')));
    options(byId(config.fields.programmeId),available,p=>p.name,p=>p.id,'Select programme');
    byId(config.fields.programmeId).value=String(selected);
}
function render() {
    const term=byId(config.search).value.trim().toLowerCase();
    const filtered=records.filter(row=>{
        const searchable=[...config.columns(row),row.description,row.notes,row.goals].join(' ').toLowerCase();
        const inView=page!=='actions' || (actionView==='past' ? ['Completed','Cancelled'].includes(row.status) : !['Completed','Cancelled'].includes(row.status));
        return inView && searchable.includes(term) && config.filters.every(([id,key])=>{
            const value=byId(id).value;
            return !value || value==='All' || (value==='Overdue'?deadline(row)==='Overdue':String(row[key])===value);
        });
    });
    const body=byId(config.table);
    body.replaceChildren();
    for (const row of filtered) {
        const tr=element('tr');
        config.columns(row).forEach((value,index)=>{
            const cell=element('td');
            if (page==='metrics' && index===6) {
                cell.append(element('span',value));
                const track=element('div',null,'metric-progress-track');
                track.setAttribute('role','progressbar'); track.setAttribute('aria-label',row.name);
                track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');track.setAttribute('aria-valuenow',String(Math.round(progress(row))));
                const fill=element('div',null,'metric-progress-fill');fill.style.width=progress(row)+'%';track.append(fill);cell.append(track);
            } else if (value===row.status || (row.status==='Pending' && value==='Not Started')) {
                cell.append(element('span',value,'status-badge status-'+row.status.toLowerCase().replaceAll(' ','-')));
            } else cell.textContent=value;
            tr.append(cell);
        });
        const controls=element('td');
        if (page==='participants') {
            const view=element('a','View','table-action-btn');
            view.href=`participant-profile.html?id=${row.id}`;
            controls.append(view);
        }
        if (['programmes','actions','appointments'].includes(page)) {
            const native=element('a',page==='appointments'?'Notes & documents':'Documents','table-action-btn');
            native.href='/pages/'+(page==='appointments'?'sessions':page)+'.html?view=classic'; controls.append(native);
        }
        if (!(page==='programmes' && row.status==='Archived')) controls.append(button('Edit',()=>open(row)));
        if (['actions','metrics'].includes(page)) controls.append(button('Delete',()=>remove(row)));
        if (page==='actions' && !['Completed','Cancelled'].includes(row.status)) {
            if (row.status==='Pending') controls.append(button('Start',()=>changeStatus(row,'In Progress')));
            controls.append(button('Complete',()=>changeStatus(row,'Completed')),button('Cancel',()=>changeStatus(row,'Cancelled')));
        }
        if (page==='appointments' && ['Scheduled','Rescheduled'].includes(row.status)) {
            controls.append(button('Complete',()=>changeStatus(row,'Completed')),button('Missed',()=>changeStatus(row,'Missed')));
        }
        if (page==='appointments' && row.status!=='Cancelled') controls.append(button('Cancel',()=>cancel(row)));
        tr.append(controls); body.append(tr);
    }
    for (const [id,value] of Object.entries(config.stats(records))) setText(id,value);
    setText(config.results,`${filtered.length} ${page}`);
    byId(config.empty).hidden=filtered.length>0;
    byId(config.empty).style.display=filtered.length?'none':'block';
}
function open(row=null) {
    editing=row?.id || null;
    createRequest=null;
    byId(config.form).reset();
    setText(config.title,`${row?'Edit':'Create'} ${config.singular}`);
    setText(config.message,'');
    if (config.fields.participantId) byId(config.fields.participantId).value=row?.participantId || '';
    if (config.fields.programmeId && page!=='participants') populateProgrammes(row?.programmeId || '');
    for (const [key,id] of Object.entries(config.fields)) {
        const input=byId(id);
        const value=row?.[key];
        if (value != null && key!=='password') {
            if (input.tagName==='SELECT' && !Array.from(input.options).some(o=>o.value===String(value))) input.add(new Option(value,value));
            input.value=value;
        }
    }
    if (page==='participants') {
        byId('participant-password').required=!row;
        byId('participant-password').closest('.form-group').hidden=Boolean(row);
    }
    if (page==='appointments') sessionTypeFields();
    byId(config.panel).hidden=false;
    byId(config.panel).style.display='block';
    byId(config.panel).scrollIntoView({behavior:'smooth'});
}
function close() {
    if (saving) return;
    byId(config.panel).hidden=true;
    byId(config.panel).style.display='none';
    editing=null;
}
async function submit(event) {
    event.preventDefault();
    if (saving) return;
    const data=Object.fromEntries(Object.entries(config.fields).map(([key,id])=>[key,byId(id).value]));
    if (!editing) {
        const signature=JSON.stringify(data);
        if (createRequest?.signature!==signature) createRequest={signature,id:requestId()};
        data.requestId=createRequest.id;
    }
    if (page==='appointments') {if(data.type==='Online')data.location='';else data.meetingLink='';}
    saving=true;
    const submitButton=byId(config.form).querySelector('[type=submit]');
    submitButton.disabled=true;
    setText(config.message,'Saving…');
    try {
        await request(`/api/coach/${page}${editing?'/'+editing:''}`,{method:editing?'PUT':'POST',body:JSON.stringify(data)});
        saving=false;
        close();
        await refresh();
    } catch(error) { setText(config.message,error.message); }
    finally { saving=false; submitButton.disabled=false; }
}
async function remove(row) {
    if (!confirm(`Delete this ${config.singular}?`)) return;
    try { await request(`/api/coach/${page}/${row.id}`,{method:'DELETE'}); await refresh(); }
    catch(error) { pageError(error); }
}
async function changeStatus(row,status) {
    try {await request(`/api/coach/${page}/${row.id}`,{method:'PUT',body:JSON.stringify({...row,status})});await refresh();}
    catch(error){pageError(error);}
}
async function cancel(row) {
    if (!confirm('Cancel this appointment?')) return;
    try { await request(`/api/coach/appointments/${row.id}`,{method:'PUT',body:JSON.stringify({...row,status:'Cancelled'})}); await refresh(); }
    catch(error) { pageError(error); }
}
try {
    await ready;
    byId(config.add).addEventListener('click',()=>open());
    for (const id of config.close) byId(id).addEventListener('click',close);
    byId(config.form).addEventListener('submit',submit);
    byId(config.search).addEventListener('input',render);
    for (const [id] of config.filters) byId(id).addEventListener('change',render);
    if (page==='actions') {
        for (const view of ['current','past']) byId('action-view-'+view).addEventListener('click',()=>{
            actionView=view;byId('action-view-current').classList.toggle('active',view==='current');byId('action-view-past').classList.toggle('active',view==='past');render();
        });
    }
    if (page==='appointments') byId('appointment-type').addEventListener('change',sessionTypeFields);
    await refresh();
    const editId=Number(new URLSearchParams(location.search).get('edit'));
    if (editId) open(records.find(row=>row.id===editId));
} catch(error) { pageError(error); }
