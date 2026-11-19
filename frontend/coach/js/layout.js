import { ready, byId, pageError } from './api.js';
try {
    const user = await ready;
    await Promise.all(['sidebar','navbar'].map(async name=>{
        const response=await fetch(`/coach/components/${name}.html`,{credentials:'same-origin'});
        if (!response.ok) throw new Error(`Unable to load the ${name}. Please refresh the page.`);
        byId(name+'-container').innerHTML=await response.text();
    }));
    const page = location.pathname.split('/').pop().replace('.html','');
    const active = page === 'participant-profile' ? 'participants' : page === 'index' ? 'dashboard' : page;
    document.querySelectorAll('[data-page]').forEach(link => {
        const name = link.dataset.page;
        link.href = name === 'dashboard' ? '/coach/index.html' : `/coach/pages/${name}.html`;
        link.classList.toggle('active',name === active);
        if (name === active) link.setAttribute('aria-current',page === 'participant-profile' ? 'location' : 'page');
    });
    const heading = document.querySelector('.topbar-heading h1');
    if (heading) heading.textContent = page === 'index' || !page ? 'Coach Dashboard' : page.replaceAll('-',' ').replace(/\b\w/g,char=>char.toUpperCase());
    setIdentity(user);
    if (user.Role === 'Participant') {
        document.querySelector('.navigation').replaceChildren();
        const dashboard = document.createElement('a');
        dashboard.className='nav-item'; dashboard.href='/pages/dashboard.html'; dashboard.textContent='My dashboard';
        document.querySelector('.navigation').append(dashboard);
        document.querySelector('.brand-text span').textContent='PARTICIPANT';
        const footer=document.querySelector('.sidebar-bottom');
        footer.querySelectorAll('a:not(#workspace-logout)').forEach(link=>link.remove());
        const settings=document.createElement('a'); settings.href='/pages/settings.html'; settings.className='nav-item'; settings.textContent='Settings'; footer.prepend(settings);
    }
    byId('workspace-logout').addEventListener('click',async event=>{
        event.preventDefault();
        try {
            const response=await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});
            if (!response.ok) throw new Error('Unable to sign out. Please try again.');
            location.replace('/pages/login.html?role='+user.Role.toLowerCase());
        } catch(error) { pageError(error); }
    });
    byId('coach-menu-toggle').addEventListener('click',event=>{
        const expanded=event.currentTarget.getAttribute('aria-expanded')==='true';
        event.currentTarget.setAttribute('aria-expanded',String(!expanded));
        document.querySelector('.sidebar').classList.toggle('menu-open',!expanded);
    });
} catch (error) { pageError(error); }
function setIdentity(user) {
    document.querySelector('.user-details strong').textContent=`${user.FirstName} ${user.LastName}`;
    document.querySelector('.user-details span').textContent=user.Role;
    document.querySelector('.user-avatar').textContent=(user.FirstName[0]+user.LastName[0]).toUpperCase();
}
