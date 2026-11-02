import { $, $$, esc, get, post, toast, modal, icon, LOGO, field } from './ui.js';
import { views as vOverview } from './views-overview.js';
import { views as vModels } from './views-models.js';
import { views as vWork } from './views-work.js';
import { views as vCompliance } from './views-compliance.js';
import { views as vAdmin } from './views-admin.js';
import { views as vInsights } from './views-insights.js';
import { views as vHome } from './views-home.js';
import { views as vIntel } from './views-intel.js';
import { views as vComp3 } from './views-comp3.js';
import { views as vOps } from './views-ops.js';
import { views as vCards } from './views-cards.js';
import { views as vStory } from './views-story.js';

const VIEWS = { ...vOverview, ...vModels, ...vWork, ...vCompliance, ...vAdmin, ...vInsights, ...vHome, ...vIntel, ...vComp3, ...vOps, ...vCards, ...vStory };
const S = { me: null, perms: [], org: null, scope: 'org' };
const can = (p) => S.perms.includes(p);

const TABS = [
  { id: 'ops', label: 'Home', perm: 'ops.view', platform: true },
  { id: 'customers', label: 'Customers', perm: 'orgs.manage', platform: true },
  { id: 'infrastructure', label: 'Host & GPUs', perm: 'infra.read', platform: true },
  { id: 'models', label: 'Models', perm: 'models.read', platform: true },
  { id: 'audit', label: 'Audit ledgers', perm: 'audit.read', platform: true },
  { id: 'overview', label: 'Home', org: true },
  { id: 'story', label: 'Story', org: true },
  { id: 'knowledge', label: 'Documents', perm: 'knowledge.read', org: true },
  { id: 'models', label: 'Models', perm: 'models.read', org: true },
  { id: 'finetune', label: 'Fine-tune', perm: 'models.manage', org: true },
  { id: 'chat', label: 'Assistant', perm: 'chat.use', org: true },
  { id: 'cards', label: 'Cards', org: true },
  { id: 'compliance', label: 'Compliance', perm: 'compliance.read', org: true },
  { id: 'tasks', label: 'Tasks', org: true },
  { id: 'audit', label: 'Audit', perm: 'audit.read', org: true },
];
const MORE = [
  { id: 'intelligence', label: 'Intelligence', perm: 'models.read', org: true },
  { id: 'metrics', label: 'AI metrics', perm: 'deployments.read', org: true },
  { id: 'graph', label: 'Knowledge map', perm: 'knowledge.read', org: true },
  { id: 'deployments', label: 'Deployments', perm: 'deployments.read', org: true },
  { id: 'infrastructure', label: 'Infrastructure', perm: 'infra.read', org: true },
  { id: 'users', label: 'Users & roles', perm: 'users.read', org: true },
  { id: 'organization', label: 'Organization', perm: 'org.read', org: true },
  { id: 'account', label: 'Account' },
];
const visible = (list) => list.filter((i) => (!i.perm || can(i.perm)) && (S.scope === 'platform' ? !i.org : !i.platform));
function navItems() { return [{ g: 'Navigate', items: visible(TABS) }, { g: 'Administration', items: visible(MORE) }]; }
const home = () => (S.scope === 'platform' ? 'ops' : 'overview');
const root = $('#root');

// ---------- theme ----------
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('vector-theme', t); } catch (_) { /* ignore */ }
}
const toggleTheme = () => setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light');

// ---------- auth screens ----------
async function renderLogin(msg) {
  let mode = 'password';
  try { mode = (await get('/api/auth/mode')).mode; } catch (_) { /* server unreachable: fall back to the form */ }
  if (mode === 'demo') return renderPicker(msg);
  root.innerHTML = `<div class="login"><div class="card"><div class="row" style="gap:10px">${LOGO}<b style="font:600 20px var(--f-disp)">Vector</b></div>
    <h2>Sign in</h2><p class="mute" style="margin-bottom:18px">Enterprise control plane for your private AI.</p>
    <form id="lf" novalidate>
      ${field('Username', '<input class="input" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required>')}
      ${field('Password', '<input class="input" name="password" type="password" autocomplete="current-password" required>')}
      <div class="m-err" id="le" role="alert" style="margin:0 0 10px">${esc(msg || '')}</div>
      <button class="btn primary" style="width:100%;justify-content:center" type="submit">Sign in</button>
    </form>
    <p class="hint" style="margin-top:16px"><a href="/">Back to the Vector site</a></p></div></div>`;
  const f = $('#lf');
  $('input[name=username]', f).focus();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const b = $('button', f); b.disabled = true; $('#le').textContent = '';
    try { await post('/api/auth/login', { username: f.username.value, password: f.password.value }); await boot(); }
    catch (err) { $('#le').textContent = err.message; b.disabled = false; }
  };
}
// Demo sign-in: choose who you want to be. No passwords; every action is still checked by role and audit-trailed.
async function renderPicker(msg) {
  let accounts = [];
  try { accounts = await get('/api/auth/demo-accounts'); } catch (_) { /* empty list */ }
  const groups = {};
  for (const a of accounts) (groups[a.orgName] = groups[a.orgName] || []).push(a);
  const order = Object.keys(groups).sort((x, y) => (x === 'Vector team' ? -1 : y === 'Vector team' ? 1 : x.localeCompare(y)));
  const rank = (r) => ['Vector Operator', 'Organization Owner', 'Compliance Officer', 'Platform Administrator', 'AI Engineer', 'Security Administrator', 'Department Administrator', 'Employee', 'Auditor'].indexOf(r);
  const ini = (n) => n.replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  root.innerHTML = `<div class="login" style="align-items:flex-start;padding-top:6vh"><div style="width:100%;max-width:1100px">
    <div class="row" style="gap:10px;margin-bottom:6px">${LOGO}<b style="font:600 22px var(--f-disp)">Vector</b></div>
    <h2 style="margin:10px 0 4px">Choose an account</h2><p class="mute" style="margin-bottom:18px">Demo sign-in on this server: pick who you want to be. What you can see and do follows that person's role, and every action is recorded in the audit trail.</p>
    ${msg ? `<div class="callout warn" style="margin-bottom:14px">${esc(msg)}</div>` : ''}
    ${accounts.length ? '' : '<div class="callout">No accounts yet. The demo customers are still loading; refresh in a few seconds.</div>'}
    <div class="grid3" style="align-items:start">${order.map((g) => `<div class="card"><div class="ch"><div><div class="tt">${esc(g)}</div><div class="st">${g === 'Vector team' ? 'Operations console' : groups[g].length + ' people'}</div></div></div><div class="stack" style="gap:6px">${groups[g].sort((x, y) => rank(x.roleName) - rank(y.roleName)).map((a) => `<button class="btn ghost" style="width:100%;justify-content:flex-start;gap:10px;padding:8px 10px;min-height:44px;text-align:left" data-u="${esc(a.username)}"><span class="avs" style="width:30px;height:30px;line-height:30px;font-size:11px;flex:0 0 30px">${esc(ini(a.displayName))}</span><span style="flex:1;min-width:0"><span style="display:block;font-weight:600">${esc(a.displayName)}</span><span class="faint" style="font-size:12px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.roleName)}${a.department ? ' · ' + esc(a.department) : ''}</span></span></button>`).join('')}</div></div>`).join('')}</div>
    <p class="hint" style="margin-top:16px"><a href="/">Back to the Vector site</a></p></div></div>`;
  root.querySelectorAll('[data-u]').forEach((b) => { b.onclick = async () => { b.disabled = true; try { await post('/api/auth/demo-login', { username: b.dataset.u }); await boot(); } catch (err) { b.disabled = false; toast(err.message, 'bad'); } }; });
  if (!accounts.length) setTimeout(() => { if (!S.me) renderPicker(); }, 4000);
}
function renderForcePassword() {
  root.innerHTML = `<div class="login"><div class="card"><div class="row" style="gap:10px">${LOGO}<b style="font:600 20px var(--f-disp)">Vector</b></div>
    <h2>Choose a new password</h2><p class="mute" style="margin-bottom:18px">Your account uses a temporary password. Set your own to continue (at least 10 characters).</p>
    <form id="pf" novalidate>
      ${field('Temporary password', '<input class="input" name="cur" type="password" autocomplete="current-password" required>')}
      ${field('New password', '<input class="input" name="n1" type="password" autocomplete="new-password" required>')}
      ${field('Repeat new password', '<input class="input" name="n2" type="password" autocomplete="new-password" required>')}
      <div class="m-err" id="le" role="alert" style="margin:0 0 10px"></div>
      <button class="btn primary" style="width:100%;justify-content:center" type="submit">Save and continue</button>
      <button class="btn ghost" style="width:100%;justify-content:center;margin-top:8px" type="button" id="so">Sign out</button>
    </form></div></div>`;
  const f = $('#pf');
  $('#so').onclick = signOut;
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (f.n1.value !== f.n2.value) { $('#le').textContent = 'The new passwords do not match'; return; }
    try { await post('/api/auth/password', { current: f.cur.value, next: f.n1.value }); await boot(); }
    catch (err) { $('#le').textContent = err.message; }
  };
}
async function signOut() { try { await post('/api/auth/logout'); } catch (_) { /* already out */ } S.me = null; cleanup(); renderLogin(); }
window.addEventListener('vector:unauth', () => { if (S.me) { S.me = null; cleanup(); renderLogin('Your session ended. Please sign in again.'); } });

// ---------- shell ----------
let navToken = 0, timers = [];
function cleanup() { timers.forEach(clearInterval); timers = []; navToken++; }

function renderShell() {
  const org = S.org, plat = S.scope === 'platform';
  const initials = (S.me.displayName || '?').replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  root.innerHTML = `<div class="fshell">
    <header class="shellbar"><div class="sb-in">
      <a class="sb-brand" href="#/${home()}">${LOGO}<b>Vector</b><span class="sb-sep"></span><span class="sb-app">${plat ? 'Operations Console' : esc(org ? org.name : '')}</span></a>
      ${!plat && org && org.demo ? '<span class="sb-chip" title="This organization was created with demo content">Demo tenant</span>' : ''}
      <span class="sp"></span>
      <button class="sb-btn sb-search" id="palbtn" title="Search (Ctrl K)">${icon('search')}<span class="hide-m">Search</span><span class="kbd hide-m">Ctrl K</span></button>
      ${plat ? '' : '<a class="sb-btn" href="#/tasks" id="taskbell" title="My tasks"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0"/></svg><i class="sb-badge" hidden></i></a>'}
      <button class="sb-btn" id="themebtn" title="Light or dark theme">${icon('sun')}</button>
      <div class="sb-user"><button class="sb-av" id="avbtn" aria-haspopup="menu" title="${esc(S.me.displayName)}">${esc(initials)}</button>
        <div class="menu" id="avmenu" hidden role="menu"><div class="menu-h"><b>${esc(S.me.displayName)}</b><span>${esc(S.me.roleName)}${S.me.department ? ' · ' + esc(S.me.department) : ''}</span></div>${visible(MORE).map((i) => `<a role="menuitem" href="#/${i.id}">${esc(i.label)}</a>`).join('')}<button role="menuitem" id="so">${S.authMode === 'demo' ? 'Switch account' : 'Sign out'}</button></div></div>
    </div></header>
    <nav class="tabbar" aria-label="Main"><div class="tb-in" id="nav">${visible(TABS).map((i) => `<a class="tbtab" href="#/${i.id}" data-nav="${i.id}">${esc(i.label)}</a>`).join('')}${visible(MORE).length > 1 ? `<div class="tb-more"><button class="tbtab" id="morebtn" aria-haspopup="menu">More ▾</button><div class="menu" id="moremenu" hidden role="menu">${visible(MORE).map((i) => `<a role="menuitem" href="#/${i.id}" data-nav="${i.id}">${esc(i.label)}</a>`).join('')}</div></div>` : ''}</div></nav>
    <main id="main" tabindex="-1"></main>
    <div class="crumbwrap" hidden><span id="crumb"></span><h1 id="ptitle"></h1></div></div>`;
  $('#so').onclick = signOut;
  $('#themebtn').onclick = toggleTheme;
  $('#palbtn').onclick = palette;
  const menu = (btn, m) => { $(btn).onclick = (e) => { e.stopPropagation(); const el = $(m); const open = el.hidden; $$('.menu').forEach((x) => { x.hidden = true; }); el.hidden = !open; }; };
  menu('#avbtn', '#avmenu');
  if ($('#morebtn')) menu('#morebtn', '#moremenu');
  document.addEventListener('click', () => $$('.menu').forEach((x) => { x.hidden = true; }));
  if (!plat) refreshBell();
}
async function refreshBell() {
  try { const t = await get('/api/tasks?scope=mine'); const n = t.tasks.filter((x) => x.status !== 'done').length; const b = $('#taskbell .sb-badge'); if (b) { b.hidden = !n; b.textContent = n; } } catch (_) { /* optional */ }
}
window.addEventListener('vector:tasks', refreshBell);

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [id, q] = raw.split('?');
  return { id: id || home(), query: Object.fromEntries(new URLSearchParams(q || '')) };
}
async function renderRoute() {
  if (!S.me) return;
  const { id, query } = parseHash();
  let v = VIEWS[id];
  const allowed = v && (!v.perm || can(v.perm)) && (v.scope ? v.scope === S.scope : true);
  if (!allowed) { location.hash = '#/' + home(); return; }
  cleanup();
  const token = navToken;
  const main = $('#main');
  main.innerHTML = '';
  const el = document.createElement('div'); el.className = 'view'; main.append(el);
  $('#ptitle').textContent = v.title;
  $('#crumb').textContent = (S.scope === 'platform' ? 'Operations' : (S.org ? S.org.name : '')) + ' / ' + v.title;
  $$('#nav [data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === (id === 'customer' ? 'customers' : id === 'app' ? 'cards' : id)));
  const mb = $('#morebtn'); if (mb) mb.classList.toggle('on', visible(MORE).some((i) => i.id === id) && !visible(TABS).some((i) => i.id === id));
  document.title = v.title + ' · Vector';
  const ctx = {
    root: el, S, can, query, me: S.me, org: S.org, scope: S.scope, acts: {}, chg: {}, inp: {}, sub: {},
    alive: () => token === navToken && el.isConnected,
    nav: (h) => { location.hash = h; },
    poll(fn, ms) { const run = async () => { if (!ctx.alive() || document.hidden) return; try { await fn(); } catch (_) { /* transient */ } }; run(); timers.push(setInterval(run, ms)); },
    refresh: () => renderRoute(),
    setOrg: (o) => { S.org = o; ctx.org = o; },
  };
  const wrap = (map, attr) => (e) => { const t = e.target.closest(`[${attr}]`); if (!t || !el.contains(t)) return; const f = map[t.getAttribute(attr)]; if (f) { if (e.type !== 'input' && e.type !== 'change') e.preventDefault(); Promise.resolve(f(t, e)).catch((err) => toast(err.message || String(err), 'bad')); } };
  el.addEventListener('click', wrap(ctx.acts, 'data-act'));
  el.addEventListener('change', wrap(ctx.chg, 'data-chg'));
  el.addEventListener('input', wrap(ctx.inp, 'data-inp'));
  el.addEventListener('submit', wrap(ctx.sub, 'data-sub'));
  try { await v.render(ctx); }
  catch (e) { if (token === navToken) el.innerHTML = `<div class="callout bad"><b>Could not load this screen.</b><br>${esc(e.message || e)}<div style="margin-top:10px"><button class="btn sm" data-act="retry">Try again</button></div></div>`, ctx.acts.retry = () => renderRoute(); }
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', renderRoute);

// ---------- command palette ----------
function palette() {
  const items = [];
  for (const g of navItems()) for (const i of g.items) items.push({ label: i.label, hint: g.g, run: () => { location.hash = '#/' + i.id; } });
  items.push({ label: 'Toggle light / dark theme', hint: 'Action', run: toggleTheme });
  if (can('models.manage')) items.push({ label: 'Download a model', hint: 'Action', run: () => { location.hash = '#/models?tab=catalog'; } });
  if (can('deployments.manage')) items.push({ label: 'New deployment', hint: 'Action', run: () => { location.hash = '#/deployments?new=1'; } });
  if (can('audit.verify')) items.push({ label: 'Verify audit ledger', hint: 'Action', run: () => { location.hash = '#/audit?verify=1'; } });
  items.push({ label: 'Sign out', hint: 'Action', run: signOut });
  let idx = 0, list = items;
  const m = modal({ title: 'Command palette', html: '', onMount: () => {} });
  m.el.querySelector('.modal').classList.add('pal');
  m.el.querySelector('header').remove(); m.el.querySelector('footer').remove(); m.el.querySelector('.m-err').remove();
  const mb = m.el.querySelector('.mb'); mb.style.padding = '0';
  mb.innerHTML = '<input class="input" placeholder="Go to a screen or run an action" aria-label="Search commands"><ul role="listbox"></ul>';
  const input = $('input', mb), ul = $('ul', mb);
  const draw = () => { ul.innerHTML = list.map((it, i) => `<li role="option" class="${i === idx ? 'on' : ''}" data-i="${i}"><span style="flex:1">${esc(it.label)}</span><span class="faint" style="font-size:12px">${esc(it.hint)}</span></li>`).join('') || '<li class="faint">No match</li>'; };
  const run = (i) => { const it = list[i]; if (it) { m.close(); it.run(); } };
  input.oninput = () => { const q = input.value.toLowerCase(); list = items.filter((it) => it.label.toLowerCase().includes(q)); idx = 0; draw(); };
  input.onkeydown = (e) => { if (e.key === 'ArrowDown') { idx = Math.min(list.length - 1, idx + 1); draw(); e.preventDefault(); } else if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); draw(); e.preventDefault(); } else if (e.key === 'Enter') run(idx); };
  ul.onclick = (e) => { const li = e.target.closest('li[data-i]'); if (li) run(Number(li.dataset.i)); };
  draw(); input.focus();
}
document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && S.me) { e.preventDefault(); if (!document.querySelector('.pal')) palette(); } });

// ---------- boot ----------
async function boot() {
  let me;
  try { me = await get('/api/me'); }
  catch (e) { if (e.status === 401) return renderLogin(); root.innerHTML = `<div class="login"><div class="card"><b>Cannot reach the Vector server.</b><p class="mute" style="margin-top:8px">${esc(e.message)}</p></div></div>`; return; }
  S.me = me.user; S.perms = me.perms; S.org = me.org; S.scope = me.scope; S.authMode = me.authMode || 'password';
  if (S.me.mustChange && S.authMode !== 'demo') return renderForcePassword();
  renderShell();
  if (!location.hash || location.hash === '#') location.hash = '#/' + home(); else renderRoute();
}
boot();
