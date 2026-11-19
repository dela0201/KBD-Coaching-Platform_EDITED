import { request, ready, byId, setText, options, element, fullName, pageError } from './api.js';
let data={}, currentReport=null;
const resources=['participants','appointments','programmes','actions','metrics'];
const csvButton=byId('download-csv-btn'), pdfButton=byId('download-pdf-btn');
function filter(records,type) {
    const participant=byId('report-participant').value;
    const from=byId('report-start-date').value, to=byId('report-end-date').value;
    return records.filter(row=>{
        const date=String(row.date || row.dueDate || row.dateAdded || row.createdAt || '').slice(0,10);
        let matches=participant==='all';
        if (!matches && type==='participants') matches=row.id===Number(participant);
        else if (!matches && type==='programmes') matches=data.participants.find(p=>p.id===Number(participant))?.programmes.some(p=>p.id===row.id);
        else if (!matches) matches=row.participantId===Number(participant);
        return matches && (!from || date>=from) && (!to || date<=to);
    });
}
function report(type) {
    if (type==='overview') return {title:'Coaching Overview',headers:['Category','Total records'],rows:resources.map(name=>[name,filter(data[name],name).length])};
    const rows=filter(data[type],type);
    const headers={participants:['Participant','Email','Programme','Status'],programmes:['Programme','Category','Duration','Status'],appointments:['Participant','Date','Time','Title','Status'],actions:['Participant','Due date','Title','Priority','Status'],metrics:['Participant','Date','Metric','Baseline','Current','Target','Unit']};
    return {title:type[0].toUpperCase()+type.slice(1)+' Report',headers:headers[type],rows:rows.map(row=>{
        const person=data.participants.find(p=>p.id===row.participantId);
        const name=person?fullName(person):'Participant';
        if (type==='participants') return [fullName(row),row.email,row.programme,row.status];
        if (type==='programmes') return [row.name,row.category,row.duration,row.status];
        if (type==='appointments') return [name,row.date,row.time,row.title,row.status];
        if (type==='actions') return [name,row.dueDate,row.title,row.priority,row.status];
        return [name,row.date,row.name,row.baseline,row.current,row.target,row.unit];
    })};
}
function renderReport() {
    const root=byId('report-preview-content');
    root.replaceChildren(element('h2',currentReport.title),element('p',`Generated ${new Date().toLocaleString('en-ZA')}`));
    const table=element('table',null,'report-table');
    const head=element('thead'), tr=element('tr');
    currentReport.headers.forEach(value=>tr.append(element('th',value))); head.append(tr); table.append(head);
    const body=element('tbody');
    currentReport.rows.forEach(values=>{
        const row=element('tr'); values.forEach(value=>row.append(element('td',value))); body.append(row);
    });
    table.append(body);
    const wrapper=element('div',null,'report-table-wrapper'); wrapper.append(table); root.append(wrapper);
    if (!currentReport.rows.length) root.append(element('p','No records match these filters.'));
}
byId('report-form').addEventListener('submit',async event=>{
    event.preventDefault();
    csvButton.disabled=pdfButton.disabled=true; currentReport=null;
    if (byId('report-start-date').value && byId('report-end-date').value && byId('report-start-date').value>byId('report-end-date').value) {
        setText('report-message','The start date must be on or before the end date.'); return;
    }
    const submit=event.submitter; submit.disabled=true;
    try {
        const rows=await Promise.all(resources.map(name=>request(`/api/coach/${name}`)));
        data=Object.fromEntries(resources.map((name,index)=>[name,rows[index]]));
        currentReport=report(byId('report-type').value); renderReport();
        csvButton.disabled=pdfButton.disabled=false; setText('report-message','Report generated.');
    } catch(error) { setText('report-message',error.message); byId('report-preview-content').replaceChildren(); }
    finally { submit.disabled=false; }
});
csvButton.addEventListener('click',()=>{
    if (!currentReport) return;
    const csv=[currentReport.headers,...currentReport.rows].map(row=>row.map(value=>{
        let text=String(value??'');
        if (/^[\s]*[=+@-]/.test(text)) text="'"+text;
        return '"'+text.replaceAll('"','""')+'"';
    }).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
    const link=element('a'); link.href=url; link.download='kbd-coaching-report.csv';
    document.body.append(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
});
pdfButton.textContent='Print / Save as PDF';
pdfButton.addEventListener('click',()=>{if(currentReport) window.print();});
try {
    await ready;
    data.participants=await request('/api/coach/participants');
    options(byId('report-participant'),data.participants,fullName,p=>p.id,'All participants');
    byId('report-participant').options[0].value='all';
} catch(error) { pageError(error); }
