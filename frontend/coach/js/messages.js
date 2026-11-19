import { request, ready, byId, element, fullName, pageError, button, requestId } from './api.js';
let user,contacts=[],selected=null,recorder=null,mediaStream=null,sending=false;
let requestVersion=0, polling=false;
const pending=new Map();
let timer;
let lastSignature=null;
function renderContacts() {
    const term=byId('message-search').value.trim().toLowerCase();
    const list=byId('conversation-list'); list.replaceChildren();
    const rows=contacts.filter(person=>(fullName(person)+' '+person.email).toLowerCase().includes(term));
    rows.forEach(person=>{
        const item=button(fullName(person),()=>open(person)); item.className='conversation-item'; list.append(item);
    });
    byId('messages-empty-state').hidden=rows.length>0;
    byId('messages-empty-state').style.display=rows.length?'none':'block';
}
async function loadMessages() {
    if (!selected || polling) return;
    const peer=selected.id,version=requestVersion; polling=true;
    try {
        const rows=await request(`/api/workspace/messages/${peer}`);
        if (version!==requestVersion) return;
        const signature=rows.map(row=>row.id).join(',');
        if (signature===lastSignature) return;
        lastSignature=signature;
        const list=byId('chat-messages');
        const atBottom=list.scrollHeight-list.scrollTop-list.clientHeight<80;
        list.replaceChildren();
        if (!rows.length) list.append(element('p','This is the beginning of your conversation.','chat-date-divider'));
        rows.forEach(message=>{
            const row=element('div',null,'message-row '+(message.senderId===user.UserID?'sent':'received'));
            const bubble=element('div',null,'message-bubble');
            if (message.type==='text') bubble.textContent=message.text;
            else if (message.type==='voice') {
                const audio=element('audio'); audio.controls=true; audio.src=`/api/workspace/message-files/${message.id}`; bubble.append(audio);
            } else {
                const link=element('a',message.fileName || 'Download file');
                link.href=`/api/workspace/message-files/${message.id}`; link.download=message.fileName; bubble.append(link);
            }
            row.append(bubble,element('span',new Date(message.timestamp.replace(' ','T')+'Z').toLocaleString('en-ZA'),'message-time'));
            list.append(row);
        });
        if (atBottom) list.scrollTop=list.scrollHeight;
    } finally { polling=false; }
}
async function open(person) {
    stopRecording(); selected=person; requestVersion++; lastSignature=null; polling=false;
    byId('chat-participant-name').textContent=fullName(person);
    byId('chat-participant-avatar').textContent=(person.firstName[0]+person.lastName[0]).toUpperCase();
    byId('messages-inbox').classList.add('hidden'); byId('messages-chat').classList.remove('hidden');
    byId('chat-messages').replaceChildren(element('p','Loading messages…'));
    try { await loadMessages(); } catch(error) { pageError(error,()=>loadMessages().catch(pageError)); }
}
function stopRecording() {
    if (recorder?.state==='recording') {recorder.onstop=null; recorder.stop();}
    mediaStream?.getTracks().forEach(track=>track.stop()); mediaStream=null;
    byId('recording-status').classList.add('hidden'); byId('record-voice-btn').textContent='🎙';
}
async function send(payload) {
    if (!selected || sending) return;
    const peer=selected.id;
    const key=peer+JSON.stringify(payload);
    if (!pending.has(key)) pending.set(key,requestId());
    const idempotencyKey=pending.get(key);
    sending=true; byId('send-message-btn').disabled=true;
    try {
        await request(`/api/workspace/messages/${peer}`,{method:'POST',body:JSON.stringify({...payload,requestId:idempotencyKey})});
        pending.delete(key);
        if (selected?.id===peer) await loadMessages();
        return true;
    } catch(error) { pageError(error,()=>send(payload)); return false; }
    finally { sending=false; byId('send-message-btn').disabled=false; }
}
async function sendBlob(blob,type,name) {
    if (blob.size>5*1024*1024) { pageError(new Error('Attachments must be 5 MB or smaller.')); return; }
    const fileData=await new Promise((resolve,reject)=>{
        const reader=new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=()=>reject(new Error('Unable to read the attachment.')); reader.readAsDataURL(blob);
    });
    return send({type,fileData,fileName:name});
}
byId('back-to-inbox').addEventListener('click',()=>{
    stopRecording(); selected=null; requestVersion++;
    byId('messages-chat').classList.add('hidden'); byId('messages-inbox').classList.remove('hidden');
});
byId('message-search').addEventListener('input',renderContacts);
byId('message-form').addEventListener('submit',async event=>{
    event.preventDefault(); const text=byId('message-input').value.trim();
    if (text && await send({type:'text',text})) byId('message-input').value='';
});
byId('attach-file-btn').addEventListener('click',()=>byId('message-file').click());
byId('message-file').addEventListener('change',async event=>{
    const file=event.target.files[0];
    try { if(file) await sendBlob(file,'file',file.name); } catch(error) {pageError(error);}
    event.target.value='';
});
byId('record-voice-btn').addEventListener('click',async()=>{
    if (recorder?.state==='recording') {recorder.stop(); return;}
    if (!selected) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {pageError(new Error('Voice recording requires a supported browser and HTTPS or localhost.'));return;}
    const peer=selected.id;
    try {
        mediaStream=await navigator.mediaDevices.getUserMedia({audio:true});
        const chunks=[]; recorder=new MediaRecorder(mediaStream);
        recorder.ondataavailable=event=>{if(event.data.size) chunks.push(event.data);};
        recorder.onstop=async()=>{
            const blob=new Blob(chunks,{type:recorder.mimeType.split(';')[0] || 'audio/webm'});
            stopRecording();
            if (selected?.id===peer) {try {await sendBlob(blob,'voice','voice-note.webm');} catch(error) {pageError(error);}}
        };
        recorder.start(); byId('recording-status').classList.remove('hidden'); byId('record-voice-btn').textContent='■';
    } catch(error) {stopRecording();pageError(new Error('Microphone access could not be opened. Check the browser permission.'));}
});
window.addEventListener('pagehide',()=>{stopRecording();clearInterval(timer);});
try {
    user=await ready; contacts=await request('/api/workspace/contacts'); renderContacts();
    timer=setInterval(()=>{if(!document.hidden)loadMessages().catch(error=>pageError(error));},10000);
} catch(error) {pageError(error);}
