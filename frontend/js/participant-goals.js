(() => {
    let started=false;
    const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;if(className)node.className=className;return node;};
    async function start(user){
        if(started)return;
        if(user?.Role!=='Participant'){location.replace('/pages/dashboard.html');return;}
        started=true;document.body.classList.add('participant-portal');document.querySelector('.topbar h1').textContent='My Goals';
        const shell=el('section',null,'pd pp');shell.id='participant-page';shell.append(el('h2','Your coaching goals'));
        document.querySelector('.main-content > .dashboard').after(shell);
        async function load(){
            try{
                const response=await fetch('/api/participant/goals',{credentials:'same-origin',headers:{Accept:'application/json'}});
                const goals=await KBDUI.readResponse(response);shell.replaceChildren(el('h2','Your coaching goals'));
                if(!goals.length)shell.append(el('p','Your coach will share measurable goals here.','pd-empty'));
                for(const goal of goals){
                    const card=el('article',null,'panel pp-card');card.append(el('h3',goal.name),el('p',`Coach ${goal.coachName}`),el('p',goal.description));
                    card.append(el('p',`Starting point ${goal.baseline} · Current ${goal.currentValue} · Target ${goal.target} ${goal.unit}`));
                    const value=goal.baseline===goal.target?(goal.currentValue===goal.target?100:0):Math.min(100,Math.max(0,(goal.currentValue-goal.baseline)/(goal.target-goal.baseline)*100));
                    const progress=el('progress');progress.max=100;progress.value=value;progress.setAttribute('aria-label',goal.name);card.append(progress,el('p',`${Math.round(value)}% · Target date ${goal.targetDate}`));
                    const history=el('details'),summary=el('summary','Progress history');history.append(summary);
                    for(const update of [...goal.updates].reverse())history.append(el('p',`${update.date} · ${update.value} ${goal.unit} · ${update.notes}`));
                    card.append(history);shell.append(card);
                }
            }catch(error){shell.replaceChildren(el('p',error.message));const retry=el('button','Try Again','primary-button');retry.type='button';retry.addEventListener('click',load);shell.append(retry);}
        }
        await load();
    }
    if(window.kbdCurrentUser)start(window.kbdCurrentUser);else window.addEventListener('kbd-auth-ready',event=>start(event.detail),{once:true});
})();
