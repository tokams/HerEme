'use strict';
const byId = id => document.getElementById(id);
let csrf;
let refreshSequence = 0;

async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : {
    method:'POST',
    headers:{'Content-Type':'application/json','X-CSRF-Token':csrf || ''},
    body:JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(Error(data.error), {status:response.status});
  return data;
}

function setSignedIn(value) {
  byId('access').hidden = value;
  byId('dashboard').hidden = !value;
  byId('logout').hidden = !value;
  if (!value) {
    refreshSequence++;
    csrf = null;
    byId('sites').replaceChildren();
    byId('audit').replaceChildren();
  }
}

function displayError(error) {
  if (error.status === 401) setSignedIn(false);
  byId('status').textContent = error.message;
}

function element(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function siteCard(site) {
  const card = document.createElement('article');
  const link = element('a',site.hostname);
  link.href = 'https://' + site.hostname + '/';
  const qr = document.createElement('img');
  qr.src = '/api/sites/' + encodeURIComponent(site.id) + '/qr.svg';
  qr.alt = 'QR code for ' + site.hostname;
  qr.width = 145;
  qr.height = 145;
  qr.loading = 'lazy';
  const status = [site.ready ? 'Ready' : 'Unavailable', new Date(site.checked).toLocaleString(), site.problem];
  if (site.release) status.push('Release ' + site.release.slice(0,12));
  card.append(element('h2',site.label),link,element('p',status.filter(Boolean).join(' · ')),qr);
  card.append(element('p','New registrations: ' + (site.registrationOpen ? 'Open' : 'Closed')));
  const toggle = element('button',site.registrationOpen ? 'Close registration' : 'Open registration');
  toggle.onclick = async () => {
    if (!confirm(toggle.textContent + ' for ' + site.hostname + '?')) return;
    toggle.disabled = true;
    try {
      await api('/api/sites/' + site.id + '/registration',{registrationOpen:!site.registrationOpen});
      await refresh();
    } catch (error) {
      displayError(error);
    } finally {
      toggle.disabled = false;
    }
  };
  card.append(toggle);
  return card;
}

async function refresh() {
  const sequence = ++refreshSequence;
  const data = await api('/api/sites');
  if (sequence !== refreshSequence) return;
  byId('explorer').hidden = !data.canExplore;
  csrf = data.csrf;
  setSignedIn(true);
  byId('sites').replaceChildren(...data.sites.map(siteCard));
  byId('audit').replaceChildren(...data.audit.map(row =>
    element('li',[row.time+' UTC',row.actor,row.action,row.site,row.detail].filter(Boolean).join(' · '))));
  byId('status').textContent = '';
}

byId('login').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button');
  submit.disabled = true;
  try {
    await api('/api/login',Object.fromEntries(new FormData(form)));
    form.reset();
    await refresh();
  } catch (error) {
    displayError(error);
  } finally {
    submit.disabled = false;
  }
};
byId('refresh').onclick = () => refresh().catch(displayError);
byId('logout').onclick = async () => {
  try {
    await api('/api/logout',{});
    setSignedIn(false);
    byId('status').textContent = '';
  } catch (error) {
    displayError(error);
  }
};
refresh().catch(error => {
  if (error.status === 401) setSignedIn(false);
  else displayError(error);
});
