import { esc, get, post, put, del, toast, modal, confirmBox, badge, ago, dt, sh, num, pagehead, empty, field, options, val } from './ui.js';
import { C, tip, fmtN, fmtMs, columnChart, donut, hbars, gauge } from './charts.js';
import { card, tl, BAND } from './views-insights.js';
import { worldSvg, readinessColor, legend } from './maps.js';
import { PLATFORM, cardHtml, loadFavorites } from './views-cards.js';
import { personalAiHtml } from './views-story.js';
import { provide, reqChip, reqEvidence } from './req-ui.js';

export const inr = (v) => { if (v == null) return '-'; const r = v / 0.012; return r >= 1e7 ? '₹' + (r / 1e7).toFixed(r >= 1e8 ? 0 : 1) + ' cr' : r >= 1e5 ? '₹' + (r / 1e5).toFixed(1) + ' lakh' : '₹' + Math.round(r).toLocaleString('en-IN'); };
export const indiaOnly = (org) => !!(org && org.jurisdictions && org.jurisdictions.length && org.jurisdictions.every((c) => c === 'IN' || c.startsWith('IN-')));
export const usd0 = (v) => (v == null ? '-' : v >= 1e6 ? '$' + (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M' : v >= 1e3 ? '$' + Math.round(v / 1e3) + 'k' : '$' + Math.round(v));
let MONEY_INR = false;
export const setMoneyFor = (org) => { MONEY_INR = indiaOnly(org); };
export const usd = (v) => (MONEY_INR ? inr(v) : usd0(v));
const ini = (s) => String(s || '?').replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
export const feed = (entries) => (entries.length ? `<div class="feed">${entries.map((e) => `<div class="it"><span class="av2">${esc(ini(e.who || 'System'))}</span><div class="w"><div>${esc(e.text)}</div><div class="h2">${ago(e.ts)} · block #${e.index} · ${esc(e.hash.slice(0, 16))}…</div></div></div>`).join('')}</div>` : '<p class="mute">No activity yet.</p>');
const ICO = {
  task: '<path d="M9 11l3 3 8-8M4 12v7a1 1 0 0 0 1 1h14"/>', chat: '<path d="M4 5h16v11H9l-5 4z"/>', doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>', shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  money: '<path d="M12 3v18M17 7H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6"/>', chain: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>', bolt: '<path d="M13 3L4 14h7l-1 7 9-11h-7z"/>', cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/>', brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 0V4M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 0"/>',
};
const ic = (n) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICO[n]}</svg>`;
export const lpTile = ({ href, t, s = '', n = '', unit = '', f = '', icon, cls = '' }) => `<a class="lp-tile ${cls}" href="${href}"><div class="t">${esc(t)}</div><div class="s">${esc(s)}</div>${n !== '' ? `<div class="n">${n}${unit ? `<small>${esc(unit)}</small>` : ''}</div>` : `<div style="margin-top:auto">${ic(icon || 'cube')}</div>`}<div class="f">${f}</div></a>`;

// ======================= Home (launchpad) =======================
const overview = {
  title: 'Home', scope: 'org',
  async render(ctx) {
    const { root, can, org, me } = ctx;
    setMoneyFor(org);
    const [pai, favs, apps, o, tasks, m, ex, docs, led] = await Promise.all([
      get('/api/personal-ai').catch(() => null), loadFavorites(), can('chat.use') ? get('/api/apps').catch(() => []) : [],
      get('/api/overview'), get('/api/tasks?scope=mine'),
      can('deployments.read') ? get('/api/metrics?range=7d') : null,
      can('compliance.read') ? get('/api/compliance/exposure') : null,
      can('knowledge.read') ? get('/api/knowledge') : null,
      can('audit.read') ? get('/api/ledger?limit=8') : null,
    ]);
    const open = tasks.tasks.filter((t) => t.status !== 'done'), overdue = open.filter((t) => t.overdue);
    const hour = new Date().getHours();
    let h = `<div class="ohead"><div class="av">${esc(ini(org.name))}</div><div><h2>Good ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, ${esc(me.displayName.split(' ')[0])}</h2><div class="sub">${esc(org.name)} · ${esc(org.industryName)} · ${org.jurisdictions.map(esc).join(', ')}</div></div><div class="attrs">${o.deployments ? `<div class="attr"><div class="l">Models running</div><div class="x">${o.deployments.running} of ${o.deployments.total}</div></div>` : ''}${ex ? `<div class="attr"><div class="l">Compliance readiness</div><div class="x">${ex.totals.readiness ?? '-'}%</div></div>` : ''}${o.ledger ? `<div class="attr"><div class="l">Audit chain</div><div class="x" style="color:${o.ledger.ok ? 'var(--ok)' : 'var(--bad)'}">${o.ledger.ok ? 'Verified intact' : 'BROKEN'}</div></div>` : ''}<div class="attr"><div class="l">Role</div><div class="x">${esc(me.roleName)}</div></div></div></div>`;
    if (o.attention && o.attention.filter((a) => a.level === 'bad').length) h += o.attention.filter((a) => a.level === 'bad').map((a) => `<div class="callout bad" style="margin-bottom:12px">${esc(a.text)} <a href="${esc(a.link)}">Open</a></div>`).join('');

    if (pai) h += `<div class="lp-sec"><div class="row between"><h3 style="margin:0">Your personal AI</h3><a class="btn sm" href="#/story">Walk through the journey</a></div><div style="height:10px"></div>${personalAiHtml(pai)}</div>`;
    const allCards = PLATFORM.filter((c) => !c.perm || can(c.perm)).concat(apps.map((a) => ({ id: 'a:' + a.id, name: a.name, icon: a.icon, href: '#/app?id=' + a.id, kind: a.kind, summary: a.summary, app: true })));
    const favCards = allCards.filter((c) => favs.includes(c.id));
    h += `<div class="lp-sec"><div class="row between"><h3 style="margin:0">My favourites</h3><a class="btn sm" href="#/cards">All cards</a></div><div style="height:10px"></div>${favCards.length ? `<div class="fgrid">${favCards.map((c) => cardHtml(c, true)).join('')}</div>` : `<div class="card" style="display:flex;align-items:center;gap:14px"><span class="mute" style="flex:1">Star the capabilities and applications you use most on the Cards page and they appear here.</span><a class="btn primary" href="#/cards">Open Cards</a></div>`}</div>`;
    const row = [lpTile({ href: '#/tasks', t: 'My tasks', s: 'Assigned to you', n: open.length, f: overdue.length ? `<span style="color:var(--bad)">${overdue.length} overdue</span>` : 'nothing overdue', cls: overdue.length ? 'crit' : '' })];
    if (docs) row.push(lpTile({ href: '#/knowledge', t: 'Documents', s: 'What your AI knows', n: docs.length, f: can('knowledge.manage') ? 'upload and tag' : 'shared with you' }));
    if (ex) {
      row.push(lpTile({ href: '#/compliance', t: 'Readiness', s: `${ex.totals.total} obligations`, n: ex.totals.readiness ?? 0, unit: '%', f: `${ex.totals.gaps} open gaps`, cls: (ex.totals.readiness || 0) >= 60 ? 'good' : 'warnc' }));
      row.push(lpTile({ href: '#/compliance?tab=map', t: 'Probable loss', s: 'If not complied with, 1 year', n: usd(ex.totals.expectedLossUSD), f: `exposure ${usd(ex.totals.exposureUSD)}`, cls: 'warnc' }));
    }
    if (m) row.push(lpTile({ href: '#/metrics', t: 'AI requests', s: 'Last 7 days', n: num(m.totals.requests), f: m.totals.tps != null ? `${m.totals.tps} tok/s average` : '' }));
    if (o.ledger) row.push(lpTile({ href: '#/audit', t: 'Audit chain', s: 'SHA-256 hash chain', n: num(o.ledger.length), unit: 'blocks', f: o.ledger.ok ? '<span style="color:var(--ok)">verified intact</span>' : '<span style="color:var(--bad)">broken</span>', cls: o.ledger.ok ? '' : 'crit' }));
    h += `<div class="lp-sec"><h3>At a glance</h3><div class="lp-tiles">${row.join('')}</div></div>`;

    const cards = [];
    if (ex) cards.push(`<div class="card g-wide pad0"><div class="ch"><div><div class="tt">Compliance by country</div><div class="st">Shaded by readiness. Hover for detail, open the map for states and losses.</div></div><span class="sp"></span><a class="btn sm" href="#/compliance?tab=map">Open map</a></div><div class="mapwrap" style="border:0;box-shadow:none;border-radius:0" id="homemap"></div><div class="maplegend">${legend('readiness')}</div></div>`);
    if (false && tasks.tasks.length) {
      const by = (s) => tasks.tasks.filter((t) => t.status === s).length;
      cards.push(card('My tasks', 'By status', donut({ items: [['open', 'Open', 'var(--c1)'], ['in_progress', 'In progress', 'var(--c4)'], ['blocked', 'Blocked', 'var(--c8)'], ['done', 'Done', 'var(--c3)']].filter(([k]) => by(k)).map(([k, l, c]) => ({ label: l, value: by(k), color: c })), center: String(open.length), sub: 'open' }) + `<div class="stack" style="gap:6px;margin-top:12px">${open.slice(0, 4).map((t) => `<a href="#/tasks?open=${t.id}" class="row between" style="text-decoration:none;color:inherit;flex-wrap:nowrap"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.title)}</span><span class="pri ${t.priority}">${t.priority}</span></a>`).join('')}</div>`));
    }
    if (false && m) { const labels = m.series.map((x) => tl(x.t, m.stepMs)); cards.push(card('AI usage', 'Requests per day', columnChart({ labels, series: [{ name: 'Succeeded', values: m.series.map((x) => x.requests - x.errors), color: 'var(--c1)' }, { name: 'Failed', values: m.series.map((x) => x.errors), color: 'var(--c8)' }], height: 170 }))); }
    if (led) cards.push(card('Recent activity', 'Who did what, from the hash-chained audit trail', feed(led.entries.slice(0, 7)), { cls: 'g-wide', action: '<a class="btn sm" href="#/audit">Audit</a>' }));
    if (ex) { const top = ex.items.filter((i) => i.expectedLossUSD).sort((a, b) => b.expectedLossUSD - a.expectedLossUSD).slice(0, 5); cards.push(card('Largest expected losses', 'Exposure × likelihood by status', hbars(top.map((i) => ({ label: i.title, value: i.expectedLossUSD, color: 'var(--c2)', tip: tip(i.title, [['Expected loss', usd(i.expectedLossUSD)], ['Exposure', usd(i.exposureUSD)], ['Status', i.status.replace('_', ' ')]]) })), { fmt: usd }))); }
    const order = (c) => (c.includes('Compliance by country') ? 0 : c.includes('Largest expected losses') ? 1 : c.includes('Recent activity') ? 2 : c.includes('AI usage') ? 3 : 4);
    cards.sort((a2, b2) => order(a2) - order(b2));
    h += `<div class="grid3">${cards.join('')}</div>`;
    root.innerHTML = h;
    ctx.acts.go = (el, e) => { if (!e.target.closest('[data-act=fav]')) ctx.nav(el.dataset.href); };
    ctx.acts.fav = async (b, e) => { e.stopPropagation(); await put('/api/me/favorites', { favorites: favs.filter((x) => x !== b.dataset.id) }); ctx.refresh(); };
    if (ex) {
      const vals = {};
      for (const p of ex.places.filter((x) => x.level === 'national')) vals[p.code] = { fill: readinessColor(p.readiness), tip: tip(p.name + (p.via ? ' (via EU)' : ''), [['Readiness', (p.readiness ?? '-') + '%'], ['Obligations', String(p.total)], ['Open', String(p.open)], ['Expected loss', usd(p.expectedLossUSD)]]) };
      const mapEl = root.querySelector('#homemap');
      if (mapEl) { mapEl.innerHTML = await worldSvg(vals); mapEl.addEventListener('click', (e) => { const c = e.target.closest('[data-code]'); if (c) ctx.nav('#/compliance?tab=map&place=' + c.dataset.code); }); }
    }
  },
};

// ======================= Tasks =======================
const COLS = [['open', 'Open'], ['in_progress', 'In progress'], ['blocked', 'Blocked'], ['done', 'Done']];
export async function taskForm(ctx, cur = {}, { obligationId, onSaved } = {}) {
  const [t, comp] = await Promise.all([get('/api/tasks'), get('/api/compliance').catch(() => ({ items: [] }))]);
  const edit = !!cur.id;
  modal({ title: edit ? 'Edit task' : 'New compliance task', wide: true,
    html: `${field('Task', `<input class="input" name="title" value="${esc(cur.title || '')}" placeholder="Collect signed BAAs from all imaging vendors">`)}
      <div class="row">${field('Assign to', `<select class="select" name="assignee"><option value="">Unassigned</option>${options((t.people || []).map((p) => [p.id, p.name + (p.department ? ' · ' + p.department : '')]), cur.assigneeId)}</select>`)}${field('Due date', `<input class="input" type="date" name="due" value="${esc(cur.dueDate || '')}">`)}${field('Priority', `<select class="select" name="priority">${options([['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['critical', 'Critical']], cur.priority || 'medium')}</select>`)}</div>
      ${field('Obligation', `<select class="select" name="ob"><option value="">None</option>${options(comp.items.map((i) => [i.id, `${i.title} · ${i.jurisdictionName}`]), cur.obligationId || obligationId || '')}</select>`)}
      ${field('Details', `<textarea class="textarea" name="desc">${esc(cur.description || '')}</textarea>`)}<p class="hint">Creating and every change to this task are written to the hash-chained audit trail with who did it.</p>`,
    actions: [{ label: edit ? 'Save' : 'Assign task', primary: true, onClick: async (m) => {
      const b = { title: val(m, 'title'), assigneeId: val(m, 'assignee') || null, dueDate: val(m, 'due') || null, priority: val(m, 'priority'), obligationId: val(m, 'ob') || null, description: val(m, 'desc') };
      if (edit) await put('/api/tasks/' + cur.id, b); else await post('/api/tasks', b);
      toast(edit ? 'Task updated' : 'Task assigned'); window.dispatchEvent(new Event('vector:tasks')); if (onSaved) onSaved();
    } }] });
}
export async function taskDetail(ctx, id, onChange) {
  const h = await get(`/api/tasks/${id}/history`);
  const t = h.task, manage = ctx.can('compliance.manage'), mine = t.assigneeId === ctx.me.id;
  let rq = null;
  if (t.requirementKey && t.obligationId && (manage || mine || ctx.can('compliance.read'))) rq = await get(`/api/compliance/${encodeURIComponent(t.obligationId)}/requirements/${encodeURIComponent(t.requirementKey)}`).catch(() => null);
  const rqHtml = rq ? `<div class="reqbox"><div class="row between"><b>${esc(rq.requirement.label)}</b>${reqChip(rq.requirement)}</div><div class="note" style="margin:4px 0 8px">${esc(rq.obligation.title)} · ${rq.obligation.met} of ${rq.obligation.total} requirements met${rq.requirement.evidence ? ' · ' : ''}${reqEvidence(rq.requirement)}</div>${(manage || mine) && rq.requirement.status !== 'met' ? `<button class="btn primary" data-a="prov">${rq.requirement.kind === 'doc' ? 'Upload the document' : 'Enter the value'}</button>` : rq.requirement.status === 'met' ? '<span class="faint" style="font-size:13px">Requirement met. The compliance check closed this task automatically.</span>' : ''}</div>` : '';
  const m = modal({ title: t.title, wide: true,
    html: `${rqHtml}<div class="row" style="gap:8px;margin-bottom:12px"><span class="pri ${t.priority}">${t.priority}</span>${t.overdue ? badge('Overdue', 'bad') : ''}${t.obligationTitle ? `<a class="tag" href="#/compliance?tab=list&open=${encodeURIComponent(t.obligationId)}">${esc(t.obligationTitle)}</a>` : ''}</div>
      <dl class="kv" style="margin-bottom:12px"><dt>Assigned to</dt><dd>${esc(t.assigneeName || 'Unassigned')}</dd><dt>Created by</dt><dd>${esc(t.createdByName || '-')} · ${ago(t.createdAt)}</dd><dt>Due</dt><dd>${esc(t.dueDate || 'No date')}</dd>${t.description ? `<dt>Details</dt><dd>${esc(t.description)}</dd>` : ''}</dl>
      ${manage || mine ? `<div class="row" style="margin-bottom:14px"><span class="lbl">Status</span>${COLS.map(([k, l]) => `<button class="chip ${t.status === k ? 'on' : ''}" data-st="${k}">${l}</button>`).join('')}${manage ? '<span class="sp"></span><button class="btn sm" data-a="edit">Edit</button><button class="btn sm danger" data-a="del">Delete</button>' : ''}</div>` : `<p>Status: ${esc(t.status.replace('_', ' '))}</p>`}
      <h4 style="margin:8px 0">Comments</h4><div class="feed">${h.comments.map((c) => `<div class="it"><span class="av2">${esc(ini(c.name))}</span><div class="w"><div><b>${esc(c.name || '')}</b> <span class="faint" style="font-size:12px">${ago(c.ts)}</span></div><div>${esc(c.text)}</div></div></div>`).join('') || '<p class="mute">No comments yet.</p>'}</div>
      ${manage || mine ? `<div class="row" style="margin-top:8px;flex-wrap:nowrap"><input class="input" name="cm" placeholder="Add a comment"><button class="btn" data-a="cm">Comment</button></div>` : ''}
      <h4 style="margin:18px 0 6px">Audit trail</h4><p class="note" style="margin-top:0">Every change to this task, as recorded in the organization's hash chain.</p>${feed(h.history.slice().reverse())}`,
  });
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-st],[data-a]'); if (!b) return;
    try {
      if (b.dataset.st) { await put('/api/tasks/' + t.id, { status: b.dataset.st }); m.close(); toast('Status updated'); window.dispatchEvent(new Event('vector:tasks')); onChange && onChange(); taskDetail(ctx, t.id, onChange); }
      else if (b.dataset.a === 'cm') { const v = m.$('[name=cm]').value.trim(); if (!v) return; await post(`/api/tasks/${t.id}/comments`, { text: v }); m.close(); taskDetail(ctx, t.id, onChange); }
      else if (b.dataset.a === 'prov') { m.close(); await provide({ id: t.obligationId, title: rq.obligation.title, jurisdictionName: rq.obligation.jurisdictionName }, rq.requirement); window.dispatchEvent(new Event('vector:tasks')); onChange && onChange(); taskDetail(ctx, t.id, onChange); }
      else if (b.dataset.a === 'edit') { m.close(); taskForm(ctx, t, { onSaved: onChange }); }
      else if (b.dataset.a === 'del') { if (await confirmBox({ title: 'Delete task', message: `Delete "${t.title}"? The deletion stays in the audit trail.`, confirm: 'Delete', danger: true })) { await del('/api/tasks/' + t.id); m.close(); toast('Task deleted'); onChange && onChange(); } }
    } catch (err) { m.error(err.message); }
  });
}
const tasks = {
  title: 'Tasks', scope: 'org',
  async render(ctx) {
    const { root, can } = ctx;
    let scope = ctx.query.scope || 'all', view = 'board';
    const draw = async () => {
      const d = await get('/api/tasks?scope=' + scope);
      if (!ctx.alive()) return;
      const T = d.tasks;
      const overdue = T.filter((t) => t.overdue).length;
      root.innerHTML = pagehead('Compliance tasks', 'Assign the work that closes compliance gaps. Every assignment, status change and comment is recorded in the audit trail with who did it.', `${d.scope === 'all' || can('audit.read') ? `<div class="seg">${[['all', 'All tasks'], ['mine', 'My tasks']].map(([k, l]) => `<button class="${(d.scope === k) ? 'on' : ''}" data-act="scope" data-s="${k}">${l}</button>`).join('')}</div>` : ''}<div class="seg">${[['board', 'Board'], ['list', 'List']].map(([k, l]) => `<button class="${view === k ? 'on' : ''}" data-act="view" data-v="${k}">${l}</button>`).join('')}</div>${d.canManage ? '<button class="btn primary" data-act="new">New task</button>' : ''}`) +
        `<div class="kpis">${COLS.map(([k, l]) => `<div class="kpi"><div class="k">${l}</div><div class="v">${T.filter((t) => t.status === k).length}</div></div>`).join('')}<div class="kpi ${overdue ? 'st-bad' : ''}"><div class="k">Overdue</div><div class="v">${overdue}</div></div></div>` +
        (!T.length ? `<div class="card">${empty(d.scope === 'mine' ? 'Nothing assigned to you' : 'No tasks yet', d.canManage ? 'Create a task from here or from any obligation on the Compliance page.' : 'When someone assigns you compliance work it shows up here.', d.canManage ? '<button class="btn primary" data-act="new">New task</button>' : '')}</div>`
          : view === 'board' ? `<div class="kanban">${COLS.map(([k, l]) => `<div class="kcol"><h4><span>${l}</span><span>${T.filter((t) => t.status === k).length}</span></h4>${T.filter((t) => t.status === k).map((t) => `<div class="kcard" data-act="open" data-id="${t.id}"><div class="tt">${esc(t.title)}</div>${t.obligationTitle ? `<div class="note" style="margin-top:4px">${esc(t.obligationTitle)}</div>` : ''}<div class="mm"><span class="pri ${t.priority}">${t.priority}</span>${t.dueDate ? `<span style="${t.overdue ? 'color:var(--bad);font-weight:600' : ''}">due ${esc(t.dueDate)}</span>` : ''}<span class="sp"></span>${t.assigneeName ? `<span class="avs" title="${esc(t.assigneeName)}">${esc(ini(t.assigneeName))}</span>` : ''}</div></div>`).join('')}</div>`).join('')}</div>`
          : `<div class="lrwrap"><table class="lr"><thead><tr><th>Task</th><th>Obligation</th><th>Assigned to</th><th>Priority</th><th>Due</th><th>Status</th><th>Updated</th></tr></thead><tbody>${T.map((t) => `<tr data-act="open" data-id="${t.id}"><td><b>${esc(t.title)}</b></td><td>${esc(t.obligationTitle || '-')}</td><td>${esc(t.assigneeName || 'Unassigned')}</td><td><span class="pri ${t.priority}">${t.priority}</span></td><td style="${t.overdue ? 'color:var(--bad);font-weight:600' : ''}">${esc(t.dueDate || '-')}</td><td>${esc(t.status.replace('_', ' '))}</td><td class="faint">${ago(t.updatedAt)}</td></tr>`).join('')}</tbody></table></div>`);
    };
    ctx.acts.scope = (b) => { scope = b.dataset.s; draw(); };
    ctx.acts.view = (b) => { view = b.dataset.v; draw(); };
    ctx.acts.new = () => taskForm(ctx, {}, { onSaved: draw });
    ctx.acts.open = (el) => taskDetail(ctx, el.dataset.id, draw);
    await draw();
    if (ctx.query.open) { const id = ctx.query.open; history.replaceState(null, '', '#/tasks'); taskDetail(ctx, id, draw); }
  },
};

export const views = { overview, tasks };
