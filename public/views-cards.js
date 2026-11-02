// Cards: one central page for every capability and application, with per-user favourites,
// plus the runner that executes an application on the organization's own model.
import { esc, get, post, put, toast, modal, badge, ago, num, pagehead, empty, md } from './ui.js';
import { fmtMs } from './charts.js';

const ICO = {
  chat: '<path d="M4 5h16v11H9l-5 4z"/>', doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>', shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>', scale: '<path d="M12 3v18M5 7h14M5 7l-3 7h6zM19 7l-3 7h6z"/>', check: '<path d="M4 12l5 5L20 6"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>', graph: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="8" r="2.5"/><circle cx="9" cy="18" r="2.5"/><path d="M8.2 7.2l7.5.6M7 8.3l1.5 7.3M16.6 10l-5.8 6.4"/>',
  cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>', brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 0V4M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 0"/>',
  task: '<path d="M9 11l3 3 8-8M4 12v7a1 1 0 0 0 1 1h14"/>', chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', chain: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  rocket: '<path d="M12 3c3 2 5 5 5 9l-2 4H9l-2-4c0-4 2-7 5-9z"/><circle cx="12" cy="10" r="1.6"/>', star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
};
const ic = (n, s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[n] || ICO.cube}</svg>`;

// Platform capabilities (navigation cards). Applications come from the server for the org's industry.
export const PLATFORM = [
  { id: 'p:chat', name: 'Assistant', group: 'Private AI', icon: 'chat', perm: 'chat.use', href: '#/chat', kind: 'Private RAG', summary: 'Ask questions answered from your own documents, with citations, on your own hardware.' },
  { id: 'p:knowledge', name: 'Knowledge', group: 'Private AI', icon: 'book', perm: 'knowledge.read', href: '#/knowledge', kind: 'Data', summary: 'Upload and tag the documents your AI uses for answers and for training.' },
  { id: 'p:graph', name: 'Knowledge map', group: 'Private AI', icon: 'graph', perm: 'knowledge.read', href: '#/graph', kind: 'Insight', summary: 'See how departments, documents, models and obligations connect.' },
  { id: 'p:models', name: 'Models', group: 'Your own models', icon: 'cube', perm: 'models.read', href: '#/models', kind: 'Deployment', summary: 'Choose and run open-weight models on this machine.' },
  { id: 'p:intel', name: 'Intelligence', group: 'Your own models', icon: 'brain', perm: 'models.read', href: '#/intelligence', kind: 'Fine-tuning loop', summary: 'Evaluations, training data from documents and real answers, and your own model builds.' },
  { id: 'p:compliance', name: 'Compliance', group: 'Governance', icon: 'shield', perm: 'compliance.read', href: '#/compliance', kind: 'Obligations', summary: 'Every rule that applies by industry and location, with what supports each one.' },
  { id: 'p:map', name: 'Compliance map', group: 'Governance', icon: 'graph', perm: 'compliance.read', href: '#/compliance?tab=map', kind: 'Map', summary: 'Readiness, open obligations and expected loss by country and state.' },
  { id: 'p:tasks', name: 'Compliance tasks', group: 'Governance', icon: 'task', href: '#/tasks', kind: 'Workflow', summary: 'Assign the work that closes gaps; every change is audit-trailed.' },
  { id: 'p:audit', name: 'Audit ledger', group: 'Governance', icon: 'chain', perm: 'audit.read', href: '#/audit', kind: 'Evidence', summary: 'Hash-chained record of every sign-in, change and AI request.' },
  { id: 'p:metrics', name: 'AI metrics', group: 'Operations', icon: 'chart', perm: 'deployments.read', href: '#/metrics', kind: 'Monitoring', summary: 'Speed, latency, tokens, grounding and document usage, measured from real requests.' },
  { id: 'p:deploy', name: 'Deployments', group: 'Operations', icon: 'rocket', perm: 'deployments.read', href: '#/deployments', kind: 'Operations', summary: 'Start, stop, benchmark and tune the models people use.' },
];
const KIND_TAG = { 'Private RAG': 'ok', 'Fine-tuning loop': 'info' };

export async function loadFavorites() { try { return await get('/api/me/favorites'); } catch (_) { return []; } }
export const cardHtml = (c, fav) => `<div class="fcard" data-act="go" data-href="${esc(c.href)}" tabindex="0" role="link"><div class="row between" style="align-items:flex-start;flex-wrap:nowrap"><span class="fic">${ic(c.icon)}</span><button class="star ${fav ? 'on' : ''}" data-act="fav" data-id="${esc(c.id)}" aria-pressed="${fav}" title="${fav ? 'Remove from favourites' : 'Add to favourites'}">${ic('star', 18)}</button></div><div class="fn">${esc(c.name)}</div><div class="fk"><span class="sig ${KIND_TAG[c.kind] || ''}">${esc(c.kind)}</span>${c.app ? '<span class="sig info">Application</span>' : ''}</div><p>${esc(c.summary)}</p></div>`;

const cards = {
  title: 'Cards', scope: 'org',
  async render(ctx) {
    const { root, can } = ctx;
    const [apps, favs0] = await Promise.all([can('chat.use') ? get('/api/apps') : [], loadFavorites()]);
    let favs = new Set(favs0), q = '', group = '';
    const all = PLATFORM.filter((c) => !c.perm || can(c.perm)).concat(apps.map((a) => ({ id: 'a:' + a.id, name: a.name, group: 'Applications · ' + a.category, icon: a.icon, href: '#/app?id=' + a.id, kind: a.kind, summary: a.summary, app: true })));
    const draw = () => {
      const list = all.filter((c) => (!q || (c.name + ' ' + c.summary + ' ' + c.kind + ' ' + c.group).toLowerCase().includes(q)) && (!group || c.group.startsWith(group)));
      const groups = [...new Set(list.map((c) => c.group))];
      const favList = all.filter((c) => favs.has(c.id));
      root.innerHTML = pagehead('Cards', `Everything ${ctx.org.name} can do with its private AI, in one place: platform capabilities and applications built for ${ctx.org.industryName.toLowerCase()}. Star the ones you use and they appear here and on Home.`) +
        `<div class="filterbar"><div class="fi" style="flex:1"><label>Search cards</label><input class="input" data-inp="q" value="${esc(q)}" placeholder="Redaction, discharge, compliance…"></div><div class="fi"><label>Show</label><div class="seg">${[['', 'All'], ['Applications', 'Applications'], ['Private AI', 'Private AI'], ['Your own models', 'Own models'], ['Governance', 'Governance'], ['Operations', 'Operations']].map(([k, l]) => `<button class="${group === k ? 'on' : ''}" data-act="grp" data-g="${k}">${l}</button>`).join('')}</div></div></div>` +
        `<div class="lp-sec"><h3>${ic('star', 16)} Favourites</h3>${favList.length ? `<div class="fgrid">${favList.map((c) => cardHtml(c, true)).join('')}</div>` : '<p class="mute">Star a card to keep it here and on your Home page.</p>'}</div>` +
        (list.length ? groups.map((g) => `<div class="lp-sec"><h3>${esc(g)}</h3><div class="fgrid">${list.filter((c) => c.group === g).map((c) => cardHtml(c, favs.has(c.id))).join('')}</div></div>`).join('') : `<div class="card">${empty('No cards match', 'Try another search.')}</div>`);
    };
    ctx.inp.q = (t) => { q = t.value.toLowerCase(); const p = t.selectionStart; draw(); const n = root.querySelector('[data-inp=q]'); n.focus(); n.setSelectionRange(p, p); };
    ctx.acts.grp = (b) => { group = b.dataset.g; draw(); };
    ctx.acts.fav = async (b, e) => { e.stopPropagation(); const idv = b.dataset.id; if (favs.has(idv)) favs.delete(idv); else favs.add(idv); draw(); try { favs = new Set(await put('/api/me/favorites', { favorites: [...favs] })); } catch (err) { toast(err.message, 'bad'); } };
    ctx.acts.go = (el, e) => { if (e.target.closest('[data-act=fav]')) return; ctx.nav(el.dataset.href); };
    root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches && e.target.matches('.fcard')) ctx.nav(e.target.dataset.href); });
    draw();
  },
};

// ---------------- application runner ----------------
function renderResult(r) {
  const res = r.result;
  if (res.kind === 'redaction') {
    return `<div class="kpis"><div class="kpi"><div class="k">Identifiers masked</div><div class="v">${res.identifiers}</div><div class="s">${res.rulesFound} by rules · ${res.modelFound} by the model</div></div>${Object.entries(res.byType).map(([k, n]) => `<div class="kpi"><div class="k">${esc(k)}</div><div class="v">${n}</div></div>`).join('')}</div><div class="json" style="white-space:pre-wrap;font-family:var(--f-ui);font-size:14px;line-height:1.6">${esc(res.text).replace(/\[([A-Z_]+)\]/g, '<mark style="background:var(--infobg);color:var(--acc-t);border-radius:4px;padding:0 4px;font-weight:600">[$1]</mark>')}</div>`;
  }
  if (res.kind === 'json') {
    if (!res.data) return `<div class="json">${esc(res.raw)}</div>`;
    const val = (v) => (Array.isArray(v) ? (v.length && typeof v[0] === 'object' ? `<div class="tblwrap"><table class="tbl"><thead><tr>${Object.keys(v[0]).map((k) => `<th>${esc(k.replace(/_/g, ' '))}</th>`).join('')}</tr></thead><tbody>${v.map((row) => `<tr>${Object.keys(v[0]).map((k) => `<td>${esc(String(row[k] ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : `<ul style="margin:0;padding-left:18px">${v.map((x) => `<li>${esc(String(x))}</li>`).join('')}</ul>`) : typeof v === 'object' && v ? `<pre class="json">${esc(JSON.stringify(v, null, 2))}</pre>` : `<span>${esc(String(v))}</span>`);
    return `<dl class="kv" style="grid-template-columns:170px 1fr;gap:12px 16px">${Object.entries(res.data).map(([k, v]) => `<dt style="text-transform:capitalize">${esc(k.replace(/_/g, ' '))}</dt><dd>${typeof v === 'boolean' ? (v ? badge('Yes', 'bad') : badge('No', 'ok')) : val(v)}</dd>`).join('')}</dl>`;
  }
  return `<div class="bubble" style="background:var(--s2);border:1px solid var(--line);border-radius:12px;white-space:pre-wrap">${md(res.text)}</div>`;
}
const appView = {
  title: 'Application', perm: 'chat.use', scope: 'org',
  async render(ctx) {
    const { root } = ctx;
    const [apps, deps, favs] = await Promise.all([get('/api/apps'), get('/api/workspace/deployments'), loadFavorites()]);
    const a = apps.find((x) => x.id === ctx.query.id);
    if (!a) { root.innerHTML = `<div class="card">${empty('Application not found', 'It may not be available for this industry.', '<a class="btn" href="#/cards">All cards</a>')}</div>`; return; }
    const pick = deps.find((d) => /-assistant:/.test(d.model) && d.status === 'running') || deps.find((d) => d.status === 'running') || deps[0];
    let fav = favs.includes('a:' + a.id);
    const history = async () => { const runs = await get('/api/apps/runs?appId=' + a.id); const box = root.querySelector('#hist'); if (box) box.innerHTML = runs.length ? `<div class="feed">${runs.slice(0, 8).map((r) => `<div class="it" style="cursor:pointer" data-act="old" data-id="${r.id}"><span class="av2">${esc(r.model.slice(0, 2).toUpperCase())}</span><div class="w"><div>${esc(Object.values(r.inputs).join(' · ').slice(0, 90))}</div><div class="h2">${ago(r.ts)} · ${esc(r.model)} · ${fmtMs(r.ms)}</div></div></div>`).join('')}</div>` : '<p class="mute">No runs yet.</p>'; root._runs = runs; };
    root.innerHTML = `<div class="row" style="margin-bottom:10px"><a class="btn sm ghost" href="#/cards">← All cards</a></div>` + pagehead(a.name, a.summary, `<button class="btn" data-act="fav">${fav ? '★ Favourite' : '☆ Add to favourites'}</button>`) +
      `<div class="mappanel"><div class="stack"><div class="card"><div class="ch"><div><div class="tt">Input</div><div class="st">${esc(a.kind)}${a.groundingDoc ? ` · grounded in “${esc(a.groundingDoc)}”` : a.grounded ? ' · grounded in your documents' : ''}</div></div><span class="sp"></span><button class="btn sm" data-act="example">Load example</button></div>
        <form data-sub="run">${a.inputs.map((f) => `<div class="field"><label>${esc(f.label)}</label>${f.type === 'textarea' ? `<textarea class="textarea" name="${f.key}" rows="${f.rows || 5}"></textarea>` : `<input class="input" name="${f.key}">`}</div>`).join('')}
        <div class="row"><label class="lbl">Model</label><select class="select" name="dep" style="width:auto;min-width:260px">${deps.map((d) => `<option value="${d.id}" ${pick && d.id === pick.id ? 'selected' : ''}>${esc(d.name)} · ${esc(d.model)}${d.status === 'running' ? '' : ' (' + d.status + ')'}</option>`).join('')}</select><span class="sp"></span><button class="btn primary" type="submit" ${deps.length ? '' : 'disabled'}>Run on this machine</button></div></form></div>
        <div class="card"><div class="ch"><div><div class="tt">Output</div><div class="st" id="outmeta">Runs on your own model. Nothing leaves this machine.</div></div></div><div id="out"><p class="mute">Run the application to see the result.</p></div><div class="callout warn" style="margin-top:12px">${esc(a.review)}</div></div></div>
        <div class="stack"><div class="card"><div class="ch"><div><div class="tt">How it works</div></div></div><ol style="margin:0;padding-left:18px;line-height:1.7;color:var(--mute)"><li>Your input is processed on this machine by ${esc(pick ? pick.model : 'your model')}.</li>${a.grounded ? `<li>${a.groundingDoc ? `The internal document “${esc(a.groundingDoc)}” and other relevant` : 'Relevant'} documents you are allowed to see are added as context.</li>` : ''}${a.id === 'phi-redact' ? '<li>Pattern rules mask SSNs, MRNs, dates, phones, emails, addresses and titled names; the model then finds remaining names.</li>' : ''}<li>The output follows a fixed ${a.format === 'json' ? 'structured format' : 'layout'} so it can be reviewed and reused.</li><li>The run is written to the audit trail as hashes of input and output, and measured in AI metrics.</li></ol></div><div class="card"><div class="ch"><div><div class="tt">My recent runs</div></div></div><div id="hist"></div></div></div></div>`;
    history();
    ctx.acts.example = () => { for (const f of a.inputs) { const el = root.querySelector(`[name="${f.key}"]`); if (el) el.value = a.example[f.key] || ''; } };
    ctx.acts.fav = async (b) => { const cur = await loadFavorites(); const set = new Set(cur); fav = !fav; if (fav) set.add('a:' + a.id); else set.delete('a:' + a.id); await put('/api/me/favorites', { favorites: [...set] }); b.textContent = fav ? '★ Favourite' : '☆ Add to favourites'; };
    ctx.acts.old = (el) => { const r = (root._runs || []).find((x) => x.id === el.dataset.id); if (r) { root.querySelector('#out').innerHTML = renderResult(r); root.querySelector('#outmeta').textContent = `${r.model} · ${fmtMs(r.ms)} · ${ago(r.ts)}`; } };
    ctx.sub.run = async (form) => {
      const inputs = {}; a.inputs.forEach((f) => { inputs[f.key] = form[f.key].value; });
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Running…';
      const t0 = Date.now(); const out = root.querySelector('#out');
      const tick = setInterval(() => { if (out) out.innerHTML = `<p class="mute">Your model is working… ${Math.round((Date.now() - t0) / 1000)} s</p>`; }, 500);
      try {
        const r = await post(`/api/apps/${a.id}/run`, { deploymentId: form.dep.value, inputs });
        clearInterval(tick); out.innerHTML = renderResult(r) + (r.sources.length ? `<div class="srcs" style="margin-top:10px">${r.sources.map((s) => `<span class="src">[${s.n}] ${esc(s.title)}</span>`).join('')}</div>` : '');
        root.querySelector('#outmeta').textContent = `${r.model} · ${fmtMs(r.ms)}${r.tps ? ` · ${r.tps} tok/s` : ''} · recorded in the audit trail`;
        history();
      } catch (e) { clearInterval(tick); out.innerHTML = `<div class="callout bad">${esc(e.message)}</div>`; }
      finally { btn.disabled = false; btn.textContent = 'Run on this machine'; }
    };
  },
};

export const views = { cards, app: appView };
