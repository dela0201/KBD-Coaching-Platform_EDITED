export async function request(path, options = {}) {
    const response = await fetch(path, {
        credentials: 'same-origin',
        ...options,
        headers: { Accept: 'application/json', ...(options.body ? {'Content-Type':'application/json'} : {}), ...options.headers }
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) location.replace('/pages/login.html?role=coach');
    if (data.code === 'TERMS_ACCEPTANCE_REQUIRED') location.replace('/pages/terms.html?continue=1');
    if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
    return data;
}

export const ready = (async () => {
    const { user } = await request('/api/auth/me');
    if (!user) throw new Error('Please sign in to continue.');
    const isInbox = location.pathname.endsWith('/messages.html');
    if (user.Role !== 'Coach' && !(isInbox && user.Role === 'Participant')) {
        location.replace('/pages/dashboard.html');
        throw new Error('This workspace requires Coach access.');
    }
    if (user.UsingTemporaryPassword) {
        location.replace('/pages/temporary-password-change.html');
        throw new Error('Please update your temporary password.');
    }
    return user;
})();

export const byId = id => document.getElementById(id);
export function setText(id, value) {
    const element = byId(id);
    if (element) element.textContent = value ?? '—';
}
export function element(tag, value, className) {
    const node = document.createElement(tag);
    if (value != null) node.textContent = value;
    if (className) node.className = className;
    return node;
}
export function button(label, action) {
    const node = element('button',label,'table-action-btn');
    node.type = 'button';
    node.addEventListener('click',action);
    return node;
}
export function options(select, records, label, value, placeholder='Select an option') {
    select.replaceChildren(new Option(placeholder,''));
    for (const row of records) select.add(new Option(label(row),value(row)));
}
export function pageError(error, retry) {
    let state = byId('workspace-state');
    if (!state) {
        state = element('div',null,'workspace-state');
        state.id = 'workspace-state';
        state.setAttribute('role','alert');
        (document.querySelector('main') || document.body).prepend(state);
    }
    state.replaceChildren(element('p',error.message || String(error)));
    if (retry) state.append(button('Try Again', () => { state.remove(); retry(); }));
}
export function fullName(person) { return `${person.firstName} ${person.lastName}`; }
export function progress(metric) {
    if (metric.target === metric.baseline) return metric.current === metric.target ? 100 : 0;
    return Math.min(100,Math.max(0,(metric.current-metric.baseline)/(metric.target-metric.baseline)*100));
}

export function requestId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2,'0')).join('');
}
