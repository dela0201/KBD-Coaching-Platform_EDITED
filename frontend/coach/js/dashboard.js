import { request, ready, setText, element, fullName, pageError } from './api.js';
async function load() {
    try {
        const user=await ready;
        const [participants,appointments,actions,programmes]=await Promise.all(['participants','appointments','actions','programmes'].map(name=>request(`/api/coach/${name}`)));
        setText('welcome-greeting',`Welcome back, ${user.FirstName}.`);
        setText('welcome-date',new Date().toLocaleDateString('en-ZA',{weekday:'long',day:'numeric',month:'long',year:'numeric'}));
        setText('total-participants',participants.length);
        setText('active-participants',participants.filter(p=>p.status==='Active').length);
        const upcoming=appointments.filter(a=>['Scheduled','Rescheduled'].includes(a.status) && new Date(`${a.date}T${a.time||'23:59'}`)>=new Date())
            .sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
        setText('upcoming-sessions',upcoming.length);
        setText('pending-actions',actions.filter(a=>['Pending','In Progress'].includes(a.status)).length);
        const schedule=document.getElementById('upcoming-sessions-list');
        schedule.replaceChildren();
        for (const item of upcoming.slice(0,5)) {
            const link=element('a',`${item.date} ${item.time} · ${item.participantName} · ${item.title}`,'workspace-list-item');
            link.href='/coach/pages/appointments.html'; schedule.append(link);
        }
        if (!upcoming.length) schedule.append(element('p','No upcoming appointments.','empty-state'));
        const activity=document.getElementById('recent-activity');
        activity.replaceChildren();
        const entries=[...participants.map(p=>({date:p.dateAdded,text:`Participant · ${fullName(p)}`})),...programmes.map(p=>({date:p.createdAt,text:`Programme · ${p.name}`})),...actions.map(a=>({date:a.createdAt,text:`Action · ${a.title}`}))]
            .sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
        entries.forEach(entry=>activity.append(element('p',`${entry.date.slice(0,10)} · ${entry.text}`,'workspace-list-item')));
        if (!entries.length) activity.append(element('p','No coaching activity yet.','empty-state'));
    } catch(error) {
        ['total-participants','active-participants','upcoming-sessions','pending-actions'].forEach(id=>setText(id,'Unavailable'));
        pageError(error,load);
    }
}
load();
