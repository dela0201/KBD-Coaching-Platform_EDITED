import { request, ready, setText, byId, fullName, pageError } from './api.js';
try {
    await ready;
    const id=Number(new URLSearchParams(location.search).get('id'));
    const participants=await request('/api/coach/participants');
    const person=participants.find(p=>p.id===id);
    if (!person) throw new Error('Participant not found or access denied.');
    setText('profile-name',fullName(person)); setText('profile-email',person.email);
    setText('profile-avatar',(person.firstName[0]+person.lastName[0]).toUpperCase());
    setText('profile-status',person.status); setText('profile-contact-email',person.email);
    setText('profile-phone',person.phone || 'Not provided'); setText('profile-date',person.dateAdded);
    setText('profile-programme',person.programmes.map(p=>p.name).join(', '));
    setText('profile-programme-status',person.status); setText('profile-goals',person.goals || 'No goals recorded.');
    byId('edit-participant-btn').addEventListener('click',()=>location.assign(`participants.html?edit=${id}`));
} catch(error) { byId('edit-participant-btn').disabled=true; pageError(error); }
