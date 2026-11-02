import { esc, get, post, put, del, downloadFile, toast, modal, confirmBox, secretBox, badge, ago, dt, sh, num, pagehead, tile, empty, field, options, val } from './ui.js';
import { complianceMeta, profileFields, mountProfile } from './views-compliance.js';
import { C, tip, columnChart, donut, hbars, seqColor } from './charts.js';
import { kpi, card } from './views-insights.js';

const DEPLOY = [['on_prem', 'On-premises'], ['private_cloud', 'Private cloud'], ['hybrid', 'Hybrid'], ['air_gapped', 'Air-gapped']];
const dtype = (v) => (DEPLOY.find((d) => d[0] === v) || [, v])[1];
const subset = (a, b) => a.every((p) => b.includes(p));

// ---------------- Users and roles ----------------
const users = {
  title: 'Users & roles', perm: 'users.read', scope: 'org',
  async render(ctx) {
    const { root, can, me } = ctx;
    const manage = can('users.manage'), rolesManage = can('roles.manage');
    let tab = ctx.query.tab === 'roles' ? 'roles' : 'users';
    let list = [], R = { roles: [], perms: {} };
    const load = async () => { [list, R] = await Promise.all([get('/api/users'), get('/api/roles')]); if (ctx.alive()) draw(); };
    const roleName = (id) => (R.roles.find((r) => r.id === id) || { name: id }).name;
    const assignable = () => R.roles.filter((r) => subset(r.perms, ctx.S.perms));

    const usersTab = () => `<div class="card"><div class="tblwrap"><table class="tbl"><thead><tr><th>Person</th><th>Username</th><th>Role</th><th>Department</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead><tbody>${list.map((u) => {
      const self = u.id === me.id;
      const can2 = manage && !self && R.roles.some((r) => r.id === u.roleId && subset(r.perms, ctx.S.perms));
      return `<tr><td><b>${esc(u.displayName)}</b>${self ? ' <span class="tag">you</span>' : ''}</td><td class="mono">${esc(u.username)}</td><td>${esc(roleName(u.roleId))}</td><td>${esc(u.department || '-')}</td><td>${u.disabled ? badge('Disabled', 'bad') : u.mustChange ? badge('Awaiting first sign-in', 'warn') : badge('Active', 'ok')}</td><td class="faint">${u.lastLoginAt ? ago(u.lastLoginAt) : 'never'}</td><td class="acts">${can2 ? `<button class="btn sm" data-act="edit" data-id="${u.id}">Edit</button>${ctx.S.authMode === 'demo' ? '' : `<button class="btn sm" data-act="reset" data-id="${u.id}">Reset password</button>`}<button class="btn sm" data-act="toggle" data-id="${u.id}">${u.disabled ? 'Enable' : 'Disable'}</button><button class="btn sm danger" data-act="rm" data-id="${u.id}">Delete</button>` : manage && self ? `<button class="btn sm" data-act="edit" data-id="${u.id}">Edit</button>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div></div>`;

    const rolesTab = () => {
      const perms = Object.keys(R.perms);
      return `<div class="grid3" style="margin-bottom:16px">${R.roles.map((r) => `<div class="card"><h3>${esc(r.name)} ${r.builtin ? '<span class="tag">built in</span>' : '<span class="tag">custom</span>'}</h3><p class="mute" style="margin-bottom:8px;min-height:36px">${esc(r.description || '')}</p><div class="row between"><span class="faint">${r.perms.length} permissions · ${list.filter((u) => u.roleId === r.id).length} people</span>${!r.builtin && rolesManage ? `<span><button class="btn sm" data-act="editrole" data-id="${r.id}">Edit</button><button class="btn sm danger" data-act="rmrole" data-id="${r.id}">Delete</button></span>` : ''}</div></div>`).join('')}</div>
        <div class="card"><h3>Permission matrix</h3><div class="tblwrap"><table class="tbl matrix"><thead><tr><th>Permission</th>${R.roles.map((r) => `<th title="${esc(r.name)}">${esc(r.name.replace(/ (Administrator|Officer|Owner)$/, ''))}</th>`).join('')}</tr></thead><tbody>${perms.map((p) => `<tr><td><span class="mono" style="font-size:12px">${esc(p)}</span><div class="hint">${esc(R.perms[p])}</div></td>${R.roles.map((r) => `<td class="${r.perms.includes(p) ? 'y' : 'n'}" aria-label="${r.perms.includes(p) ? 'yes' : 'no'}">${r.perms.includes(p) ? '●' : '○'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
    };
    const draw = () => {
      if (!ctx.alive()) return;
      root.innerHTML = pagehead('Users & roles', 'Every action is checked against the signed-in person\'s role on the server. You can only grant a role that has no more power than your own.', (tab === 'users' && manage ? '<button class="btn primary" data-act="add">Add person</button>' : '') + (tab === 'roles' && rolesManage ? '<button class="btn primary" data-act="addrole">New custom role</button>' : '')) +
        `<div class="tabs"><button class="tab ${tab === 'users' ? 'on' : ''}" data-act="tab" data-tab="users">People (${list.length})</button><button class="tab ${tab === 'roles' ? 'on' : ''}" data-act="tab" data-tab="roles">Roles (${R.roles.length})</button></div>` + (tab === 'users' ? usersTab() : rolesTab());
    };
    await load();
    ctx.acts.tab = (t) => { tab = t.dataset.tab; draw(); };

    const userForm = (cur) => {
      const edit = !!cur, self = edit && cur.id === me.id;
      modal({ title: edit ? `Edit ${cur.displayName}` : 'Add person',
        html: `<div class="row">${field('Full name', `<input class="input" name="dn" value="${esc(cur ? cur.displayName : '')}">`)}${field('Username', `<input class="input mono" name="un" value="${esc(cur ? cur.username : '')}" ${edit ? 'disabled' : ''} autocapitalize="none" placeholder="first.last">`)}</div><div class="row">${field('Role', `<select class="select" name="role" ${self ? 'disabled' : ''}>${options(assignable().map((r) => [r.id, r.name]), cur ? cur.roleId : 'employee')}</select>`, self ? 'You cannot change your own role.' : '')}${field('Department', `<input class="input" name="dept" value="${esc(cur ? cur.department || '' : '')}" placeholder="Operations">`, 'Decides which department documents they can see.')}</div>${edit || ctx.S.authMode === 'demo' ? '' : field('Initial password (optional)', '<input class="input mono" name="pw" placeholder="Leave empty to generate one">', 'They must change it at first sign-in.')}`,
        actions: [{ label: edit ? 'Save' : 'Create', primary: true, onClick: async (m) => {
          if (edit) { const b = { displayName: val(m, 'dn'), department: val(m, 'dept') }; if (!self) b.roleId = val(m, 'role'); await put('/api/users/' + cur.id, b); toast('Saved'); }
          else { const r = await post('/api/users', { displayName: val(m, 'dn'), username: val(m, 'un'), roleId: val(m, 'role'), department: val(m, 'dept'), password: ctx.S.authMode === 'demo' ? undefined : val(m, 'pw') || undefined }); toast('Person added'); if (r.tempPassword) setTimeout(() => secretBox('Temporary password', [['Username', r.user.username], ['Temporary password', r.tempPassword]]), 50); }
          load();
        } }] });
    };
    ctx.acts.add = () => userForm();
    ctx.acts.edit = (t) => userForm(list.find((u) => u.id === t.dataset.id));
    ctx.acts.reset = async (t) => {
      const u = list.find((x) => x.id === t.dataset.id);
      if (!(await confirmBox({ title: 'Reset password', message: `Reset the password for ${u.displayName}? They are signed out and must choose a new one.`, confirm: 'Reset' }))) return;
      const r = await post(`/api/users/${u.id}/reset-password`); secretBox('Temporary password', [['Username', u.username], ['Temporary password', r.tempPassword]]); load();
    };
    ctx.acts.toggle = async (t) => {
      const u = list.find((x) => x.id === t.dataset.id);
      if (!u.disabled && !(await confirmBox({ title: 'Disable account', message: `Disable ${u.displayName}? They are signed out immediately.`, confirm: 'Disable', danger: true }))) return;
      await put('/api/users/' + u.id, { disabled: !u.disabled }); toast(u.disabled ? 'Enabled' : 'Disabled'); load();
    };
    ctx.acts.rm = async (t) => {
      const u = list.find((x) => x.id === t.dataset.id);
      if (!(await confirmBox({ title: 'Delete person', message: `Delete ${u.displayName} and their private conversations? The deletion stays in the audit ledger.`, confirm: 'Delete', danger: true }))) return;
      await del('/api/users/' + u.id); toast('Deleted'); load();
    };

    const roleForm = (cur) => {
      const edit = !!cur, mine = ctx.S.perms;
      const groups = {};
      Object.keys(R.perms).forEach((p) => { (groups[p.split('.')[0]] = groups[p.split('.')[0]] || []).push(p); });
      modal({ title: edit ? `Edit ${cur.name}` : 'New custom role', wide: true,
        html: `<div class="row">${field('Role name', `<input class="input" name="rn" value="${esc(cur ? cur.name : '')}">`)}${field('Description', `<input class="input" name="rd" value="${esc(cur ? cur.description || '' : '')}">`)}</div><div class="lbl" style="margin-bottom:6px">Permissions</div><p class="hint" style="margin-bottom:8px">You can only tick permissions you hold yourself.</p><div class="jp" style="max-height:340px">${Object.entries(groups).map(([g, ps]) => `<h5>${esc(g)}</h5>${ps.map((p) => `<label class="check" style="padding:4px 0"><input type="checkbox" name="p" value="${esc(p)}" ${cur && cur.perms.includes(p) ? 'checked' : ''} ${mine.includes(p) ? '' : 'disabled'}><span><span class="mono" style="font-size:12px">${esc(p)}</span> <span class="faint">${esc(R.perms[p])}</span></span></label>`).join('')}`).join('')}</div>`,
        actions: [{ label: edit ? 'Save' : 'Create role', primary: true, onClick: async (m) => { const b = { name: val(m, 'rn'), description: val(m, 'rd'), perms: [...m.el.querySelectorAll('[name=p]:checked')].map((e) => e.value) }; if (edit) await put('/api/roles/' + cur.id, b); else await post('/api/roles', b); toast('Role saved'); load(); } }] });
    };
    ctx.acts.addrole = () => roleForm();
    ctx.acts.editrole = (t) => roleForm(R.roles.find((r) => r.id === t.dataset.id));
    ctx.acts.rmrole = async (t) => {
      const r = R.roles.find((x) => x.id === t.dataset.id);
      if (!(await confirmBox({ title: 'Delete role', message: `Delete the role "${r.name}"? Reassign anyone who holds it first.`, confirm: 'Delete', danger: true }))) return;
      await del('/api/roles/' + r.id); toast('Role deleted'); load();
    };
  },
};

// ---------------- Audit ledger ----------------
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const arrow = '<div class="clink"><svg viewBox="0 0 22 12"><path d="M0 6h18M14 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></div>';
const audit = {
  title: 'Audit ledger', perm: 'audit.read',
  async render(ctx) {
    const { root, can } = ctx;
    const platform = ctx.scope === 'platform';
    const F = { scope: platform ? 'platform' : '', action: '', actor: '', outcome: '', q: '' };
    let offset = 0, data = null, verified = null, stats = null, anchors = [];
    const PAGE = 30;
    root.innerHTML = '<div id="ah"></div><div id="aviz"></div><div id="af"></div><div id="ab"></div>';
    const head = root.querySelector('#ah'), viz = root.querySelector('#aviz'), filt = root.querySelector('#af'), body = root.querySelector('#ab');
    const scopeQ = () => (platform ? 'scope=' + encodeURIComponent(F.scope) : '');

    const drawHead = () => {
      head.innerHTML = pagehead('Audit ledger', 'Every sign-in, change and AI request is a block whose SHA-256 hash covers the previous block\'s hash. Changing, deleting or reordering any record breaks every link after it. Prompts and answers are stored only as hashes.', `${platform && data && data.scopes ? `<select class="select" style="width:auto" data-chg="scope" aria-label="Ledger">${options(data.scopes.map((s) => [s.id, s.name]), F.scope)}</select>` : ''}${can('audit.verify') ? '<button class="btn primary" data-act="verify">Verify chain</button>' : ''}${can('audit.export') ? '<button class="btn" data-act="export">Export</button>' : ''}`) +
        (verified ? `<div class="callout ${verified.ok ? 'ok' : 'bad'}" style="margin-bottom:16px">${verified.ok ? `<b>Chain intact.</b> ${verified.results.map((r) => `${esc(r.scopeName)}: every one of ${num(r.length)} blocks re-hashed from disk and matched`).join(' · ')}.` : `<b>Chain broken.</b> ${verified.results.filter((r) => !r.ok).map((r) => `${esc(r.scopeName)}: ${esc(r.reason)} at block ${r.brokenAt}`).join(' · ')}`}</div>` : '');
    };
    const drawViz = () => {
      if (!stats) return;
      const okA = anchors.filter((a) => a.valid).length;
      const tail = (data.entries || []).slice(0, 7).reverse();
      const brokenAt = verified && !verified.ok ? (verified.results.find((r) => !r.ok) || {}).brokenAt : null;
      const maxHeat = Math.max(1, ...stats.heat.flat());
      viz.innerHTML = `<div class="kpis">
          ${kpi('Blocks in chain', num(stats.length), stats.first ? `since ${dt(stats.first).slice(0, 10)}` : '')}
          ${kpi('Head hash', `<span class="mono" style="font-size:17px">${esc(stats.head.slice(0, 10))}…</span>`, 'fingerprint of the entire history')}
          ${kpi('Integrity', verified ? (verified.ok ? 'Intact' : 'Broken') : 'Not checked', verified ? 'just verified from disk' : 'press Verify chain', '', verified ? (verified.ok ? 'st-ok' : 'st-bad') : '')}
          ${kpi('External anchors', `${okA}<small>/ ${anchors.length}</small>`, anchors.length ? (okA === anchors.length ? 'all still match the chain' : 'MISMATCH: history was rewritten') : 'none recorded yet', '', anchors.length && okA !== anchors.length ? 'st-bad' : '')}
          ${kpi('Denied attempts', num((stats.byOutcome.find((x) => x.key === 'denied') || { n: 0 }).n), 'blocked by role checks or failed logins')}</div>
        <div class="card" style="margin-bottom:16px"><div class="ch"><div><div class="tt">Latest blocks</div><div class="st">Each block stores the previous block's hash. Hover a block to see both.</div></div></div><div class="chain" id="chainstrip">${tail.map((e, i) => `${i ? arrow : ''}<div class="cblock ${brokenAt != null && e.index >= brokenAt ? 'badb' : ''}" data-act="entry2" data-ix="${e.index}" data-tip="${esc(tip('Block ' + e.index, [['What', e.text || e.action], ['Action', e.action], ['Actor', (e.actor || {}).username || 'system'], ['Outcome', e.outcome], ['Hash', e.hash.slice(0, 20) + '…'], ['Previous', e.prevHash.slice(0, 20) + '…']]))}"><div class="row between"><span class="ix">#${e.index}</span><span class="faint" style="font-size:10.5px">${ago(e.ts)}</span></div><div class="ac" style="font-family:var(--f-ui)">${esc(e.who || 'System')}</div><div style="font-size:11.5px;color:var(--mute);height:30px;overflow:hidden;line-height:1.3">${esc(e.text || e.action)}</div><div class="hh">prev ${esc(e.prevHash.slice(0, 12))}…</div><div class="hh" style="color:var(--ink)">hash ${esc(e.hash.slice(0, 12))}…</div></div>`).join('')}</div></div>
        <div class="grid3">
          ${card('Activity', 'Blocks per day by outcome, last 14 days', columnChart({ labels: stats.perDay.map((d) => new Date(d.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })), series: [{ name: 'ok', values: stats.perDay.map((d) => d.ok), color: 'var(--c1)' }, { name: 'denied', values: stats.perDay.map((d) => d.denied), color: 'var(--c4)' }, { name: 'error', values: stats.perDay.map((d) => d.error), color: 'var(--c8)' }], height: 180 }), { cls: 'g-wide' })}
          ${card('What was recorded', 'Blocks by area', donut({ items: stats.byArea.slice(0, 7).map((x, k) => ({ label: x.key, value: x.n, color: C(k) })), center: num(stats.length), sub: 'blocks' }))}
          ${card('Most active', 'Blocks by person', hbars(stats.byActor.map((x, k) => ({ label: x.key, value: x.n, color: 'var(--c7)' }))))}
          ${card('When', 'Activity by weekday and hour', `<div class="heat" style="grid-template-columns:34px repeat(24,1fr);gap:2px">${stats.heat.map((row, d) => `<div class="h">${DAYS[d]}</div>${row.map((v, hh) => `<div class="c" style="min-height:14px;background:${seqColor(v, maxHeat)}" data-tip="${esc(tip(`${DAYS[d]} ${String(hh).padStart(2, '0')}:00`, [['Blocks', String(v)]]))}"></div>`).join('')}`).join('')}</div><div class="note">Darker means more recorded activity in that hour.</div>`, { cls: 'g-wide' })}
          ${card('External anchors', 'Record the head hash outside this server', `<p class="mute" style="font-size:13px;margin-bottom:8px">Someone with full disk access could rebuild a consistent chain. An anchor you keep elsewhere (ticket, email, printed audit report) catches that: every later check confirms the anchored block still has the same hash.</p>${anchors.slice(0, 4).map((a) => `<div class="anch"><span class="sig ${a.valid ? 'ok' : 'bad'}">${a.valid ? 'matches' : 'MISMATCH'}</span><div style="flex:1;min-width:0"><div class="mono" style="font-size:12px;overflow:hidden;text-overflow:ellipsis">#${a.index} ${esc(a.hash.slice(0, 18))}…</div><div class="note" style="margin:0">${esc(a.by)} · ${ago(a.ts)}${a.note ? ' · ' + esc(a.note) : ''}</div></div><button class="btn sm ghost" data-act="copyr" data-r="${esc(a.receipt)}">Copy</button></div>`).join('') || '<p class="faint">No anchors yet.</p>'}${can('audit.verify') ? '<button class="btn sm" data-act="anchor" style="margin-top:10px">Anchor current head</button>' : ''}`)}
        </div>`;
    };
    const drawFilters = () => {
      filt.innerHTML = `<div class="row" style="margin:18px 0 14px"><h3 style="font-size:15px">All blocks</h3><span class="sp"></span><input class="input" style="width:170px" placeholder="Action, e.g. chat." data-inp="action" value="${esc(F.action)}" aria-label="Action"><input class="input" style="width:150px" placeholder="Username" data-inp="actor" value="${esc(F.actor)}" aria-label="Username"><select class="select" style="width:auto" data-chg="outcome" aria-label="Outcome"><option value="">Any outcome</option>${options([['ok', 'ok'], ['denied', 'denied'], ['error', 'error']], F.outcome)}</select><input class="input" style="width:170px" placeholder="Search" data-inp="q" value="${esc(F.q)}" aria-label="Search"></div>`;
    };
    const qs = () => { const p = new URLSearchParams({ limit: PAGE, offset }); for (const k of ['action', 'actor', 'outcome', 'q']) if (F[k]) p.set(k, F[k]); if (platform) p.set('scope', F.scope); return p.toString(); };
    const loadList = async () => {
      const list = await get('/api/ledger?' + qs());
      if (!ctx.alive()) return;
      const es = list.entries;
      body.innerHTML = es.length ? `<div>${es.map((e, i) => `<div class="blk ${e.outcome === 'denied' ? 'denied' : e.outcome === 'error' ? 'error' : ''}" data-act="entry" data-i="${i}" tabindex="0" role="button"><div class="n">${e.index}</div><div class="row between" style="flex-wrap:nowrap"><span style="font-weight:600">${esc(e.text || e.action)}</span><span class="faint" style="white-space:nowrap" title="${esc(dt(e.ts))}">${ago(e.ts)}</span></div><div class="mute" style="font-size:12px"><span class="mono">${esc(e.action)}</span> · ${esc((e.actor || {}).username || 'system')}${e.actor && e.actor.role ? ` (${esc(e.actor.role)})` : ''} · ${esc(dt(e.ts))} ${e.outcome !== 'ok' ? badge(e.outcome, e.outcome === 'error' ? 'bad' : 'warn') : ''}</div><div class="h">hash ${esc(e.hash.slice(0, 24))}… ← prev ${esc(e.prevHash.slice(0, 16))}…</div></div>`).join('')}</div><div class="row between" style="margin-top:8px"><span class="faint">${num(list.total)} matching blocks</span><span><button class="btn sm" data-act="prev" ${offset === 0 ? 'disabled' : ''}>Newer</button> <button class="btn sm" data-act="next" ${offset + PAGE >= list.total ? 'disabled' : ''}>Older</button></span></div>` : `<div class="card">${empty('No blocks match', 'Change the filters.')}</div>`;
      body._entries = es;
    };
    const loadAll = async () => {
      [data, stats, anchors] = await Promise.all([get('/api/ledger?limit=7' + (platform ? '&' + scopeQ() : '')), get('/api/ledger/stats' + (platform ? '?' + scopeQ() : '')), get('/api/ledger/anchors' + (platform ? '?' + scopeQ() : ''))]);
      if (!ctx.alive()) return;
      drawHead(); drawViz();
    };
    await loadAll(); drawFilters(); await loadList();
    root.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.blk')) { e.preventDefault(); e.target.click(); } });
    let timer = null;
    const refilter = () => { clearTimeout(timer); timer = setTimeout(() => { offset = 0; loadList(); }, 300); };
    ctx.inp.action = (t) => { F.action = t.value.trim(); refilter(); };
    ctx.inp.actor = (t) => { F.actor = t.value.trim(); refilter(); };
    ctx.inp.q = (t) => { F.q = t.value.trim(); refilter(); };
    ctx.chg.outcome = (t) => { F.outcome = t.value; offset = 0; loadList(); };
    ctx.chg.scope = async (t) => { F.scope = t.value; offset = 0; verified = null; await loadAll(); loadList(); };
    ctx.acts.prev = () => { offset = Math.max(0, offset - PAGE); loadList(); };
    ctx.acts.next = () => { offset += PAGE; loadList(); };
    ctx.acts.verify = async (b) => {
      b.disabled = true;
      const blocks = [...root.querySelectorAll('#chainstrip .cblock')];
      const res = await get('/api/ledger/verify');
      for (const el of blocks) { el.classList.add(res.ok ? 'ok' : 'badb'); await new Promise((r) => setTimeout(r, 90)); }
      verified = platform ? { ...res, results: res.results.filter((r) => r.scope === F.scope) } : res;
      await new Promise((r) => setTimeout(r, 250));
      await loadAll(); loadList();
      if (verified.ok) root.querySelectorAll('#chainstrip .cblock').forEach((el) => el.classList.add('ok'));
    };
    ctx.acts.anchor = async () => {
      modal({ title: 'Anchor the current head', html: `<p class="mute" style="margin-bottom:12px">This records the current head hash. Copy the receipt and keep it outside this server, for example in your audit ticket.</p>${field('Note', '<input class="input" name="note" placeholder="Q4 internal audit, ticket AUD-112">')}`,
        actions: [{ label: 'Anchor', primary: true, onClick: async (m) => { const a = await post('/api/ledger/anchors', { note: val(m, 'note'), scope: platform ? F.scope : undefined }); await loadAll(); loadList(); setTimeout(() => modal({ title: 'Anchor receipt', html: `<p class="mute" style="margin-bottom:10px">Keep this outside the server. Later, run <span class="mono">node scripts/verify-ledger.js export.json ${esc(a.hash.slice(0, 8))}…</span> with the full hash to prove nothing before block ${a.index} changed.</p><input class="input mono" readonly value="${esc(a.receipt)}" onfocus="this.select()">` }), 50); } }] });
    };
    ctx.acts.copyr = async (b) => { try { await navigator.clipboard.writeText(b.dataset.r); toast('Receipt copied'); } catch (_) { modal({ title: 'Anchor receipt', html: `<input class="input mono" readonly value="${esc(b.dataset.r)}" onfocus="this.select()">` }); } };
    ctx.acts.export = async () => { await downloadFile('/api/ledger/export' + (platform ? '?' + scopeQ() : '')); toast('Ledger exported'); };
    const showEntry = (e) => modal({ title: `Block ${e.index} · ${e.action}`, wide: true, html: `<p class="mute" style="margin-bottom:10px">hash = SHA-256 of this block's canonical JSON (keys sorted), including <span class="mono">prevHash</span>. Verify offline with <span class="mono">node scripts/verify-ledger.js</span> on an exported file.</p><dl class="kv" style="margin-bottom:10px"><dt>prevHash</dt><dd class="mono" style="font-size:12px">${esc(e.prevHash)}</dd><dt>hash</dt><dd class="mono" style="font-size:12px">${esc(e.hash)}</dd></dl><pre class="json">${esc(JSON.stringify(e, null, 2))}</pre>` });
    ctx.acts.entry = (t) => showEntry(body._entries[Number(t.dataset.i)]);
    ctx.acts.entry2 = (t) => { const e = data.entries.find((x) => x.index === Number(t.dataset.ix)); if (e) showEntry(e); };
    if (ctx.query.verify && can('audit.verify')) { history.replaceState(null, '', '#/audit'); const b = root.querySelector('[data-act=verify]'); if (b) ctx.acts.verify(b); }
  },
};

// ---------------- Organization ----------------
const organization = {
  title: 'Organization', perm: 'org.read', scope: 'org',
  async render(ctx) {
    const { root, can } = ctx;
    const [org, meta] = await Promise.all([get('/api/org'), complianceMeta()]);
    const manage = can('org.manage');
    const names = org.jurisdictions.map((c) => (meta.jurisdictions.find((j) => j.code === c) || {}).name || c);
    root.innerHTML = pagehead('Organization', 'Your industry and operating locations decide which compliance obligations apply.', manage ? '<button class="btn primary" data-act="edit">Edit</button>' : '') +
      `<div class="card" style="max-width:760px"><dl class="kv"><dt>Name</dt><dd>${esc(org.name)}</dd><dt>Industry</dt><dd>${esc(org.industryName)}</dd><dt>Operating in</dt><dd>${names.map((n) => `<span class="tag">${esc(n)}</span>`).join(' ') || '<span class="mute">None chosen</span>'}</dd><dt>Deployment type</dt><dd>${esc(dtype(org.deploymentType))}</dd><dt>Created</dt><dd>${dt(org.createdAt)}</dd></dl></div>`;
    ctx.acts.edit = () => {
      let read;
      modal({ title: 'Edit organization', wide: true,
        html: `${field('Name', `<input class="input" name="name" value="${esc(org.name)}">`)}${field('Deployment type', `<select class="select" name="dt">${options(DEPLOY, org.deploymentType)}</select>`)}${profileFields(meta, org)}`,
        onMount: (m) => { read = mountProfile(m, meta); },
        actions: [{ label: 'Save', primary: true, onClick: async (m) => { const p = read(); const o = await put('/api/org', { name: val(m, 'name'), deploymentType: val(m, 'dt'), industry: p.industry, jurisdictions: p.jurisdictions }); ctx.setOrg(o); toast('Organization updated'); ctx.refresh(); } }] });
    };
  },
};

// ---------------- Account ----------------
const account = {
  title: 'Account',
  async render(ctx) {
    const { root, me } = ctx;
    root.innerHTML = pagehead('Account') + `<div class="grid2"><div class="card"><h3>You</h3><dl class="kv"><dt>Name</dt><dd>${esc(me.displayName)}</dd><dt>Username</dt><dd class="mono">${esc(me.username)}</dd><dt>Role</dt><dd>${esc(me.roleName || '')}</dd><dt>Department</dt><dd>${esc(me.department || '-')}</dd></dl></div>
      ${ctx.S.authMode === 'demo' ? '<div class="card"><h3>Sign-in</h3><p class="mute">This server uses demo sign-in: people choose their account on the sign-in page, with no password. Start the server with VECTOR_AUTH=password to require passwords.</p></div>' : `<div class="card"><h3>Change password</h3><form data-sub="pw" novalidate>${field('Current password', '<input class="input" type="password" name="cur" autocomplete="current-password">')}${field('New password', '<input class="input" type="password" name="n1" autocomplete="new-password">', 'At least 10 characters.')}${field('Repeat new password', '<input class="input" type="password" name="n2" autocomplete="new-password">')}<div class="m-err" id="pe" style="margin:0 0 10px"></div><button class="btn primary" type="submit">Change password</button></form></div>`}</div>`;
    ctx.sub.pw = async (f) => {
      const err = root.querySelector('#pe'); err.textContent = '';
      if (f.n1.value !== f.n2.value) { err.textContent = 'The new passwords do not match'; return; }
      try { await post('/api/auth/password', { current: f.cur.value, next: f.n1.value }); f.reset(); toast('Password changed'); }
      catch (e) { err.textContent = e.message; }
    };
  },
};

// ---------------- Customers (Vector operators) ----------------
const customers = {
  title: 'Customers', perm: 'orgs.manage', scope: 'platform',
  async render(ctx) {
    const { root } = ctx;
    const meta = await complianceMeta();
    root.innerHTML = pagehead('Customers', 'Create and manage customer organizations. Each one gets its own users, roles, deployments, compliance profile and audit chain.', '<button class="btn primary" data-act="add">New customer</button>') + '<div id="cl"></div>';
    const box = root.querySelector('#cl');
    let list = [];
    const draw = () => {
      box.innerHTML = list.length ? `<div class="card"><div class="tblwrap"><table class="tbl"><thead><tr><th>Organization</th><th>Industry</th><th>Operating in</th><th>Type</th><th>Users</th><th>Deployments</th><th>Status</th><th></th></tr></thead><tbody>${list.map((o) => `<tr><td><b>${esc(o.name)}</b></td><td>${esc(o.industryName)}</td><td>${o.jurisdictions.map((c) => `<span class="tag">${esc(c)}</span>`).join(' ') || '-'}</td><td>${esc(dtype(o.deploymentType))}</td><td>${o.users}</td><td>${o.deployments}</td><td>${o.disabled ? badge('Disabled', 'bad') : badge('Active', 'ok')}</td><td class="acts"><a class="btn sm primary" href="#/customer?id=${o.id}">Open</a><button class="btn sm" data-act="edit" data-id="${o.id}">Edit</button><button class="btn sm" data-act="toggle" data-id="${o.id}">${o.disabled ? 'Enable' : 'Disable'}</button>${o.disabled ? `<button class="btn sm danger" data-act="rm" data-id="${o.id}">Delete</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>` : `<div class="card">${empty('No customers yet', 'Create the first organization and its owner account.', '<button class="btn primary" data-act="add">New customer</button>')}</div>`;
    };
    const load = async () => { list = await get('/api/orgs'); if (ctx.alive()) draw(); };
    await load();
    const form = (cur) => {
      const edit = !!cur; let read;
      modal({ title: edit ? `Edit ${cur.name}` : 'New customer', wide: true,
        html: `<div class="row">${field('Organization name', `<input class="input" name="name" value="${esc(cur ? cur.name : '')}">`)}${field('Deployment type', `<select class="select" name="dt">${options(DEPLOY, cur ? cur.deploymentType : 'on_prem')}</select>`)}</div>${edit ? '' : `<div class="row">${field('Owner username', '<input class="input mono" name="ou" autocapitalize="none" placeholder="jane.doe">')}${field('Owner full name', '<input class="input" name="on">')}</div>${ctx.S.authMode === 'demo' ? '' : field('Owner initial password (optional)', '<input class="input mono" name="op" placeholder="Leave empty to generate one">')}`}${profileFields(meta, cur || { industry: 'logistics', jurisdictions: [] })}`,
        onMount: (m) => { read = mountProfile(m, meta); },
        actions: [{ label: edit ? 'Save' : 'Create customer', primary: true, onClick: async (m) => {
          const p = read();
          if (edit) { await put('/api/orgs/' + cur.id, { name: val(m, 'name'), deploymentType: val(m, 'dt'), industry: p.industry, jurisdictions: p.jurisdictions }); toast('Saved'); }
          else { const r = await post('/api/orgs', { name: val(m, 'name'), deploymentType: val(m, 'dt'), industry: p.industry, jurisdictions: p.jurisdictions, ownerUsername: val(m, 'ou'), ownerName: val(m, 'on'), ownerPassword: ctx.S.authMode === 'demo' ? undefined : val(m, 'op') || undefined }); toast('Customer created'); if (r.tempPassword) setTimeout(() => secretBox('Owner sign-in', [['Username', r.owner.username], ['Temporary password', r.tempPassword]]), 50); }
          load();
        } }] });
    };
    ctx.acts.add = () => form();
    ctx.acts.edit = (t) => form(list.find((o) => o.id === t.dataset.id));
    ctx.acts.toggle = async (t) => {
      const o = list.find((x) => x.id === t.dataset.id);
      if (!o.disabled && !(await confirmBox({ title: 'Disable customer', message: `Disable ${o.name}? Everyone in it is signed out and cannot sign in.`, confirm: 'Disable', danger: true }))) return;
      await put('/api/orgs/' + o.id, { disabled: !o.disabled }); toast(o.disabled ? 'Enabled' : 'Disabled'); load();
    };
    ctx.acts.rm = async (t) => {
      const o = list.find((x) => x.id === t.dataset.id);
      if (!(await confirmBox({ title: 'Delete customer', message: `Permanently delete ${o.name} with its users, deployments, knowledge and compliance records? The audit ledger file is kept on disk.`, confirm: 'Delete permanently', danger: true }))) return;
      await del('/api/orgs/' + o.id); toast('Customer deleted'); load();
    };
  },
};

export const views = { users, audit, organization, account, customers };
