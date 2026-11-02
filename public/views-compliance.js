import { esc, get, post, put, del, downloadFile, toast, modal, confirmBox, badge, meter, ago, num, pagehead, tile, empty, field, options, val, readFileB64 } from './ui.js';
import { tip, donut, hbars, gauge } from './charts.js';
import { kpi, card } from './views-insights.js';

let META = null;
export async function complianceMeta() { if (!META) META = await get('/api/compliance/meta'); return META; }

const SL = { not_started: ['Not started', ''], in_progress: ['In progress', 'warn'], implemented: ['Implemented', 'ok'], needs_review: ['Needs review', 'warn'], not_applicable: ['Not applicable', ''] };
const sBadge = (s) => badge(SL[s][0], SL[s][1]);
const TYPE_L = { law: 'Law', regulation: 'Regulation', standard: 'Standard', guidance: 'Guidance', custom: 'Custom' };
const LEVELS = ['international', 'regional', 'national', 'state', 'local'];

// ---- shared industry and jurisdiction picker (used by Customers and Organization too) ----
export function profileFields(meta, cur = {}) {
  const sel = new Set(cur.jurisdictions || []);
  const groups = LEVELS.filter((l) => l !== 'international').map((l) => {
    const js = meta.jurisdictions.filter((j) => j.level === l);
    if (!js.length) return '';
    return `<h5>${esc(meta.levels[l])}</h5>${js.map((j) => { const parent = j.parent ? meta.jurisdictions.find((p) => p.code === j.parent) : null; return `<label class="check" data-name="${esc((j.name + ' ' + j.code).toLowerCase())}"><input type="checkbox" name="j" value="${esc(j.code)}" ${sel.has(j.code) ? 'checked' : ''}> ${esc(j.name)}${parent ? ` <span class="faint">(in ${esc(parent.name)})</span>` : ''}</label>`; }).join('')}`;
  }).join('');
  return `${field('Industry', `<select class="select" name="industry">${options(meta.industries.map((i) => [i.id, i.name]), cur.industry || 'logistics')}</select>`, 'Decides which sector rules apply.')}
    ${field('Where you operate', `<input class="input" placeholder="Filter countries and states" data-pfilter style="margin-bottom:8px"><div class="jp" data-jp>${groups}</div>`, 'Pick every country, state or region you operate in. Rules from parent regions (for example the EU for Germany, or a country for its states) apply automatically.')}
    <div class="callout" data-ppreview>Choose an industry and at least one place to preview the obligations.</div>`;
}
export function mountProfile(m, meta) {
  const root = m.el;
  const read = () => ({ industry: val(m, 'industry'), jurisdictions: [...root.querySelectorAll('[name=j]:checked')].map((e) => e.value) });
  const box = root.querySelector('[data-ppreview]');
  let t = null;
  const preview = () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const p = read();
      try {
        const r = await get(`/api/compliance/preview?industry=${encodeURIComponent(p.industry)}&jurisdictions=${encodeURIComponent(p.jurisdictions.join(','))}`);
        const by = {}; r.items.forEach((i) => { by[i.level] = (by[i.level] || 0) + 1; });
        box.innerHTML = `<b>${r.count} obligations</b> would apply: ${LEVELS.filter((l) => by[l]).map((l) => `${by[l]} ${esc(meta.levels[l].toLowerCase())}`).join(', ')}.${r.notes.length ? `<div class="hint" style="margin-top:6px">${r.notes.map((n) => esc(n.message)).join('<br>')}</div>` : ''}`;
      } catch (e) { box.textContent = e.message; }
    }, 200);
  };
  root.addEventListener('change', (e) => { if (e.target.name === 'industry' || e.target.name === 'j') preview(); });
  root.querySelector('[data-pfilter]').addEventListener('input', (e) => { const q = e.target.value.toLowerCase(); root.querySelectorAll('[data-jp] [data-name]').forEach((l) => { l.hidden = q && !l.dataset.name.includes(q); }); });
  preview();
  return read;
}

// ---------------- Compliance ----------------
const BAND = { evidenced: ['Evidenced', 'var(--ok)'], supported: ['Supported', 'var(--c1)'], partial: ['Partial', 'var(--c4)'], gap: ['Gap', 'var(--bad)'], na: ['Not applicable', 'var(--faint)'] };
const bandChip = (b) => `<span class="band ${b}">${esc(BAND[b][0])}</span>`;
const scoreBar = (s) => (s.score == null ? '' : `<div class="scorebar" title="Signal score ${s.score}"><i style="width:${s.score}%;background:${BAND[s.band][1]}"></i></div>`);
const ICON = {
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/></svg>',
  clip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/></svg>',
  ai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="7" width="14" height="11" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12l5 5 9-10"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};
const VERD = { covered: ['AI: covered', 'ok'], partial: ['AI: partial', 'warn'], not_covered: ['AI: not covered', 'bad'], unparsed: ['AI: unclear', ''] };
const sigChips = (it, s) => `${s.controls.length ? `<span class="sig info" title="Platform controls that support this">${ICON.shield}${s.controls.length} control${s.controls.length > 1 ? 's' : ''}</span>` : ''}${s.docs.length ? `<span class="sig ${s.docs.some((d) => d.strength === 'strong') ? 'ok' : ''}" title="${esc(s.docs.map((d) => d.title).join('\n'))}">${ICON.doc}${s.docs.length} doc${s.docs.length > 1 ? 's' : ''}</span>` : ''}${it.evidenceCount ? `<span class="sig ok">${ICON.clip}${it.evidenceCount} evidence</span>` : ''}${s.ai ? `<span class="sig ${VERD[s.ai.verdict][1]}">${ICON.ai}${VERD[s.ai.verdict][0]}</span>` : ''}`;

const compliance = {
  title: 'Compliance', perm: 'compliance.read',
  async render(ctx) {
    const { root, can } = ctx;
    const manage = can('compliance.manage');
    const [data, meta, ins] = await Promise.all([get('/api/compliance'), complianceMeta(), get('/api/compliance/insights')]);
    const industryName = (meta.industries.find((i) => i.id === data.profile.industry) || {}).name || data.profile.industry;
    const jnames = data.profile.jurisdictions.map((c) => (meta.jurisdictions.find((j) => j.code === c) || {}).name || c);
    let tab = ctx.query.tab || 'overview';
    const F = { level: '', status: '', category: '', band: '', q: '' };
    let deps = null;
    const S = (it) => ins.signals[it.id] || { controls: [], docs: [], ai: null, score: 0, band: 'gap' };

    const overviewTab = () => {
      const s = data.summary, b = ins.bands;
      const cats = Object.keys(meta.categories).filter((c) => data.items.some((i) => i.category === c));
      const lvls = LEVELS.filter((l) => data.items.some((i) => i.level === l));
      const cell = (l, c) => { const its = data.items.filter((i) => i.level === l && i.category === c && S(i).score != null); if (!its.length) return '<div class="c" style="background:var(--s2);color:var(--faint)">·</div>'; const v = Math.round(its.reduce((a, i) => a + S(i).score, 0) / its.length); const col = v >= 80 ? BAND.evidenced[1] : v >= 60 ? BAND.supported[1] : v >= 25 ? BAND.partial[1] : BAND.gap[1]; return `<div class="c" style="background:color-mix(in srgb,${col} ${18 + Math.round(v / 2.5)}%,var(--s1));color:var(--ink)" data-tip="${esc(tip(meta.levels[l] + ' · ' + meta.categories[c], [['Obligations', String(its.length)], ['Average signal', v + '%'], ...its.slice(0, 4).map((i) => [i.title.slice(0, 34), BAND[S(i).band][0]])]))}" data-act="drill" data-l="${l}" data-c="${c}">${its.length}</div>`; };
      return `<div class="kpis">
          ${kpi('Readiness signal', `${ins.readiness}<small>%</small>`, 'average across obligations')}
          ${kpi('Obligations', num(s.total), `${lvls.length} levels · ${cats.length} topics`)}
          ${kpi('Evidenced', num(b.evidenced || 0), 'implemented with evidence on file', '', 'st-ok')}
          ${kpi('Open gaps', num(b.gap || 0), `${s.gaps} mandatory not yet addressed`, '', (b.gap || 0) ? 'st-bad' : '')}
          ${kpi('AI reviewed', num(Object.values(ins.signals).filter((x) => x.ai).length), 'suggestions awaiting human review')}
          ${kpi('Verify with counsel', num(s.verifyFlagged), 'dates or scope still moving')}</div>
        <div class="grid3">
          ${card('Readiness', `${industryName} · ${jnames.join(', ') || 'no locations set'}`, gauge(ins.readiness, { label: 'readiness signal', sub: 'Indicator from status, evidence, documents, platform controls and AI reviews' }))}
          ${card('Where each obligation stands', 'Signal band per obligation', donut({ items: ['evidenced', 'supported', 'partial', 'gap', 'na'].filter((k) => b[k]).map((k) => ({ label: BAND[k][0], value: b[k], color: BAND[k][1] })), center: String(s.total), sub: 'obligations' }))}
          ${card('Status set by your team', 'Decisions recorded in the audit ledger', hbars(Object.keys(SL).map((k) => ({ label: SL[k][0], value: s.byStatus[k] || 0, color: k === 'implemented' ? 'var(--ok)' : k === 'in_progress' ? 'var(--c1)' : k === 'needs_review' ? 'var(--c4)' : 'var(--faint)' })), { max: s.total }))}
          <div class="card g-wide"><div class="ch"><div><div class="tt">Coverage map</div><div class="st">Obligation count per level and topic, shaded by average signal. Click a cell to see the obligations.</div></div></div>
            <div class="heat" style="grid-template-columns:110px repeat(${cats.length},minmax(58px,1fr))"><div></div>${cats.map((c) => `<div class="ch2">${esc(meta.categories[c].replace('Data protection and privacy', 'Privacy').replace('Incident and breach reporting', 'Breach').replace('Sector-specific data duties', 'Sector').replace('Information security', 'Security').replace('Records and retention', 'Records').replace('Cross-border data', 'Transfers').replace('AI governance', 'AI'))}</div>`).join('')}${lvls.map((l) => `<div class="h">${esc(meta.levels[l].split(' (')[0])}</div>${cats.map((c) => cell(l, c)).join('')}`).join('')}</div>
            <div class="legend">${['evidenced', 'supported', 'partial', 'gap'].map((k) => `<span><i style="background:${BAND[k][1]}"></i>${BAND[k][0]}</span>`).join('')}</div></div>
          ${card('Platform controls', 'Built into Vector and counted automatically', `<div>${ins.controls.slice(0, 5).map((c) => `<div class="ctl"><div class="ic ${c.active ? 'on' : 'off'}">${c.active ? ICON.check : ICON.x}</div><div style="flex:1"><div style="font-weight:500">${esc(c.name)}</div><div class="note" style="margin-top:2px">supports ${c.obligations} obligation${c.obligations === 1 ? '' : 's'}</div></div></div>`).join('')}</div><button class="btn sm" data-act="tab" data-tab="controls" style="margin-top:8px">All ${ins.controls.length} controls</button>`)}
        </div>
        ${data.notes.length ? `<div class="callout warn" style="margin-top:16px"><b>Where the starter pack is thin</b><ul style="margin:6px 0 0;padding-left:18px">${data.notes.map((n) => `<li>${esc(n.message)}</li>`).join('')}</ul></div>` : ''}
        <div class="callout" style="margin-top:16px">${esc(ins.notice)} ${esc(data.pack.notice)}</div>`;
    };
    const filtered = () => data.items.filter((i) => (!F.level || i.level === F.level) && (!F.status || i.status === F.status) && (!F.category || i.category === F.category) && (!F.band || S(i).band === F.band) && (!F.q || (i.title + ' ' + i.summary + ' ' + i.jurisdictionName).toLowerCase().includes(F.q)));
    const obTab = () => {
      const items = filtered();
      let h = `<div class="row" style="margin-bottom:14px"><div class="chips"><button class="chip ${F.band === '' ? 'on' : ''}" data-act="bnd" data-v="">All</button>${['gap', 'partial', 'supported', 'evidenced'].map((k) => `<button class="chip ${F.band === k ? 'on' : ''}" data-act="bnd" data-v="${k}">${BAND[k][0]} (${ins.bands[k] || 0})</button>`).join('')}</div><span class="sp"></span>
        <select class="select" style="width:auto" data-chg="flevel" aria-label="Level"><option value="">Any level</option>${options(LEVELS.filter((l) => data.summary.byLevel[l]).map((l) => [l, meta.levels[l]]), F.level)}</select>
        <select class="select" style="width:auto" data-chg="fstatus" aria-label="Status"><option value="">Any status</option>${options(Object.entries(SL).map(([k, v]) => [k, v[0]]), F.status)}</select>
        <select class="select" style="width:auto" data-chg="fcat" aria-label="Topic"><option value="">Any topic</option>${options(Object.entries(meta.categories), F.category)}</select>
        <input class="input" style="width:190px" placeholder="Search" value="${esc(F.q)}" data-inp="fq" aria-label="Search obligations">
        ${manage ? `<button class="btn" data-act="batch" title="Runs the AI reviewer on the next 5 open obligations that have matching documents">AI review gaps</button><button class="btn" data-act="addc">Add custom obligation</button>` : ''}</div><div id="batchmsg"></div>`;
      if (!items.length) return h + `<div class="card">${empty('Nothing matches', 'Change the filters to see more obligations.')}</div>`;
      for (const l of LEVELS) {
        const g = items.filter((i) => i.level === l);
        if (!g.length) continue;
        h += `<div class="lvl"><h3>${esc(meta.levels[l])}</h3><span class="tag">${g.length}</span></div>`;
        h += g.map((i) => { const s = S(i); return `<div class="ob" data-act="open" data-id="${esc(i.id)}" tabindex="0" role="button"><div style="flex:1;min-width:0"><div class="t">${esc(i.title)}</div><div class="meta"><span class="tag">${esc(i.jurisdictionName)}</span><span class="tag">${esc(TYPE_L[i.type] || i.type)}</span><span class="tag">${esc(meta.categories[i.category] || i.category)}</span>${i.verify ? '<span class="tag" style="color:var(--warn)">verify with counsel</span>' : ''}${sigChips(i, s)}</div></div><div class="r">${bandChip(s.band)}${scoreBar(s)}<span style="font-size:11.5px">${sBadge(i.status)}</span></div></div>`; }).join('');
      }
      return h;
    };
    const controlsTab = () => `<div class="grid2">${ins.controls.map((c) => `<div class="card"><div class="ctl" style="border:0;padding:0"><div class="ic ${c.active ? 'on' : 'off'}">${c.active ? ICON.check : ICON.x}</div><div style="flex:1"><div class="tt" style="font-weight:600">${esc(c.name)}</div><p class="mute" style="margin:4px 0 8px;font-size:13px">${esc(c.desc)}</p><div class="pill-row"><span class="sig ${c.active ? 'ok' : 'bad'}">${c.active ? 'Active' : 'Inactive'}</span><span class="sig">${c.obligations} obligations</span>${c.categories.map((x) => `<span class="sig">${esc(meta.categories[x] ? meta.categories[x].split(' ')[0] : x)}</span>`).join('')}</div><div class="note">${esc(c.why)}</div></div></div></div>`).join('')}</div><p class="note">A control supports an obligation when its topic matches and the obligation's text mentions what the control does. It covers part of the requirement, never all of it.</p>`;
    const reportTab = () => `<div class="card" style="max-width:720px"><div class="ch"><div><div class="tt">Compliance report</div><div class="st">Every obligation with status, owner, evidence and notes</div></div></div><p class="mute" style="margin-bottom:14px">The report records the audit ledger head hash at the moment of export so it can be tied back to the chain.</p>${manage ? '<div class="row"><button class="btn primary" data-act="rep" data-f="csv">Download CSV</button><button class="btn" data-act="rep" data-f="json">Download JSON</button></div>' : '<p class="faint">Exporting needs the compliance manage permission.</p>'}<p class="hint" style="margin-top:14px">${esc(data.pack.notice)}</p></div>`;

    const draw = () => {
      if (!ctx.alive()) return;
      const tabs = [['overview', 'Overview'], ['obligations', `Obligations (${data.items.length})`], ['controls', 'Platform controls'], ['report', 'Report']];
      root.innerHTML = pagehead('Compliance', `Everything that applies to ${industryName.toLowerCase()} in ${jnames.length ? jnames.join(', ') : 'your chosen places'}, from international standards down to local rules, with what already supports each one.`) + `<div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}</div>` + (tab === 'overview' ? overviewTab() : tab === 'obligations' ? obTab() : tab === 'controls' ? controlsTab() : reportTab());
    };
    const reload = async () => { const [d, i2] = await Promise.all([get('/api/compliance'), get('/api/compliance/insights')]); Object.assign(data, d); Object.assign(ins, i2); draw(); };
    draw();
    ctx.acts.tab = (t) => { tab = t.dataset.tab; draw(); };
    ctx.acts.bnd = (t) => { F.band = t.dataset.v; draw(); };
    ctx.acts.drill = (t) => { F.level = t.dataset.l; F.category = t.dataset.c; F.band = ''; tab = 'obligations'; draw(); };
    ctx.chg.flevel = (t) => { F.level = t.value; draw(); };
    ctx.chg.fstatus = (t) => { F.status = t.value; draw(); };
    ctx.chg.fcat = (t) => { F.category = t.value; draw(); };
    ctx.inp.fq = (t) => { F.q = t.value.toLowerCase(); const pos = t.selectionStart; draw(); const n = root.querySelector('[data-inp=fq]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
    root.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.ob')) { e.preventDefault(); e.target.click(); } });
    ctx.acts.rep = async (t) => { await downloadFile('/api/compliance/report?format=' + t.dataset.f); toast('Report downloaded'); };
    ctx.acts.addc = () => customForm();
    ctx.acts.open = (t) => detail(data.items.find((i) => i.id === t.dataset.id));
    const getDeps = async () => { if (deps === null) deps = can('chat.use') ? await get('/api/workspace/deployments').catch(() => []) : []; return deps; };
    const pickDep = (ds) => (ds.find((d) => /review/i.test(d.name) && d.status === 'running') || ds.find((d) => d.status === 'running') || ds[0]);
    ctx.acts.batch = async (b) => {
      const ds = await getDeps();
      if (!ds.length) { toast('Create a deployment first. The AI reviewer runs on your own model.', 'bad'); return; }
      const queue = data.items.filter((i) => i.status !== 'implemented' && i.status !== 'not_applicable' && S(i).docs.some((d) => !d.restricted) && !S(i).ai).slice(0, 5);
      if (!queue.length) { toast('Nothing left to review: every open obligation with matching documents already has an AI review.'); return; }
      b.disabled = true;
      const msg = root.querySelector('#batchmsg');
      const dep = pickDep(ds);
      for (let k = 0; k < queue.length; k++) {
        if (!ctx.alive()) return;
        msg.innerHTML = `<div class="callout" style="margin-bottom:12px">AI reviewer (${esc(dep.model)}) is reading documents for <b>${esc(queue[k].title)}</b> (${k + 1} of ${queue.length})… ${meter((k / queue.length) * 100, 'ok')}</div>`;
        try { await post(`/api/compliance/${encodeURIComponent(queue[k].id)}/assess`, { deploymentId: dep.id }); } catch (e) { toast(e.message, 'bad'); break; }
      }
      toast('AI reviews finished. They are suggestions; statuses were not changed.');
      await reload();
    };

    function customForm(cur) {
      const edit = !!cur;
      modal({ title: edit ? 'Edit custom obligation' : 'Add custom obligation',
        html: `<p class="mute" style="margin-bottom:12px">For a local rule, a contract clause or an internal policy that the starter pack does not cover.</p>${field('Title', `<input class="input" name="title" value="${esc(cur ? cur.title : '')}">`)}${field('What is required', `<textarea class="textarea" name="summary">${esc(cur ? cur.summary : '')}</textarea>`)}<div class="row">${field('Level', `<select class="select" name="level">${options(LEVELS.map((l) => [l, meta.levels[l]]), cur ? cur.level : 'local')}</select>`)}${field('Topic', `<select class="select" name="category">${options(Object.entries(meta.categories), cur ? cur.category : 'sector')}</select>`)}</div>${field('Source or jurisdiction', `<input class="input" name="jurisdiction" value="${esc(cur && cur.jurisdictionName !== 'Custom' ? cur.jurisdictionName : '')}" placeholder="City ordinance 12/2026, customer contract clause 9.2">`)}`,
        actions: [{ label: edit ? 'Save' : 'Add', primary: true, onClick: async (m) => { const b = { title: val(m, 'title'), summary: val(m, 'summary'), level: val(m, 'level'), category: val(m, 'category'), jurisdiction: val(m, 'jurisdiction') }; if (edit) await put('/api/compliance/custom/' + cur.id, b); else await post('/api/compliance/custom', b); toast('Saved'); reload(); } }] });
    }

    async function detail(item) {
      if (!item) return;
      const s = S(item);
      const evid = await get(`/api/compliance/${encodeURIComponent(item.id)}/evidence`);
      const ds = manage ? await getDeps() : [];
      const ctrls = ins.controls.filter((c) => s.controls.includes(c.id));
      const aiHtml = (a) => (a ? `<div class="callout ${a.verdict === 'covered' ? 'ok' : a.verdict === 'partial' ? 'warn' : a.verdict === 'not_covered' ? 'bad' : ''}" style="margin-top:8px"><div class="row between"><b>${esc(VERD[a.verdict][0])}${a.confidence != null ? ` · confidence ${Math.round(a.confidence * 100)}%` : ''}</b><span class="faint" style="font-size:12px">${esc(a.model)} · ${esc(a.by)} · ${ago(a.ts)}</span></div>${a.reasons && a.reasons.length ? `<div class="lbl" style="margin-top:8px">Why</div><ul style="margin:4px 0;padding-left:18px">${a.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}${a.missing && a.missing.length ? `<div class="lbl" style="margin-top:6px">Still missing</div><ul style="margin:4px 0;padding-left:18px">${a.missing.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}<div class="note">AI suggestion from your own model. A person must decide; the status has not been changed. The prompt and answer hashes are in the audit ledger.</div></div>` : '<p class="mute" style="margin-top:6px">Not reviewed by AI yet.</p>');
      const m = modal({ title: item.title, wide: true,
        html: `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">${bandChip(s.band)}<span class="tag">${esc(item.jurisdictionName)}</span><span class="tag">${esc(meta.levels[item.level])}</span><span class="tag">${esc(TYPE_L[item.type] || item.type)}</span><span class="tag">${esc(meta.categories[item.category] || item.category)}</span>${item.verify ? '<span class="tag" style="color:var(--warn)">verify with counsel</span>' : ''}</div><p style="margin-bottom:16px">${esc(item.summary)}</p>
          <div class="grid2" style="gap:12px;margin-bottom:16px">
            <div class="card" style="background:var(--s2)"><div class="tt" style="font-weight:600;margin-bottom:8px">${ICON.shield.replace('<svg', '<svg width="14" height="14" style="vertical-align:-2px;margin-right:6px"')}Platform controls (${ctrls.length})</div>${ctrls.length ? ctrls.map((c) => `<div style="margin-bottom:6px"><b style="font-size:13px">${esc(c.name)}</b><div class="note" style="margin-top:1px">${esc(c.desc)}</div></div>`).join('') : '<p class="mute">No Vector control maps to this obligation.</p>'}</div>
            <div class="card" style="background:var(--s2)"><div class="tt" style="font-weight:600;margin-bottom:8px">${ICON.doc.replace('<svg', '<svg width="14" height="14" style="vertical-align:-2px;margin-right:6px"')}Matching documents (${s.docs.length})</div>${s.docs.length ? s.docs.map((d) => `<div style="margin-bottom:8px"><div class="row between"><b style="font-size:13px">${esc(d.title)}</b><span class="sig ${d.strength === 'strong' ? 'ok' : ''}">${d.strength}</span></div>${d.excerpt ? `<div class="note" style="margin-top:2px">${esc(d.excerpt.slice(0, 220))}…</div>` : ''}</div>`).join('') : '<p class="mute">No internal document mentions this yet. Add a policy in Knowledge.</p>'}</div>
          </div>
          <div class="row between"><h4>AI review</h4>${manage && ds.length ? `<span class="row" style="gap:6px"><select class="select" name="dep" style="width:auto">${options(ds.map((d) => [d.id, `${d.name} · ${d.model}`]), pickDep(ds).id)}</select><button class="btn" data-a="assess">Run AI review</button></span>` : ''}</div><div data-ai>${aiHtml(s.ai)}</div>
          <h4 style="margin:18px 0 8px">Decision</h4>
          ${manage ? `<div class="row">${field('Status', `<select class="select" name="status">${options(Object.entries(SL).map(([k, v]) => [k, v[0]]), item.status)}</select>`)}${field('Owner', `<select class="select" name="owner"><option value="">Unassigned</option>${options((data.owners || []).map((o) => [o.id, o.name]), item.ownerId)}</select>`)}</div>${field('Note', `<textarea class="textarea" name="note" style="min-height:64px">${esc(item.note || '')}</textarea>`, 'Required when you mark an obligation as not applicable.')}<div class="row" style="margin-bottom:6px"><button class="btn primary" data-a="save">Save decision</button>${item.source === 'custom' ? '<button class="btn" data-a="editc">Edit definition</button><button class="btn danger" data-a="delc">Delete</button>' : ''}</div>` : `<dl class="kv" style="margin-bottom:6px"><dt>Status</dt><dd>${sBadge(item.status)}</dd><dt>Owner</dt><dd>${esc(item.ownerName || 'Unassigned')}</dd>${item.note ? `<dt>Note</dt><dd>${esc(item.note)}</dd>` : ''}</dl>`}
          <h4 style="margin:18px 0 8px">Evidence</h4><div data-ev></div>
          ${can('evidence.manage') ? `<div class="card" style="margin-top:10px;background:var(--s2)"><b>Add evidence</b><div class="row" style="margin-top:8px">${field('Title', '<input class="input" name="evt" placeholder="Annual access review, Q3">')}${field('File (max 5 MB)', '<input class="input" type="file" name="evf">')}</div>${field('Note', '<textarea class="textarea" name="evn" style="min-height:54px"></textarea>')}<button class="btn" data-a="addev">Add evidence</button><p class="hint" style="margin-top:6px">Files are stored with a SHA-256 hash and re-checked on every download.</p></div>` : ''}`,
      });
      const renderEv = (list) => { m.el.querySelector('[data-ev]').innerHTML = list.length ? `<div class="tblwrap"><table class="tbl"><tbody>${list.map((e) => `<tr><td><b>${esc(e.title)}</b>${e.note ? `<div class="hint">${esc(e.note)}</div>` : ''}</td><td class="mono" style="font-size:12px">${e.file ? esc(e.file.name) + '<br>sha256 ' + esc(e.file.sha256.slice(0, 12)) + '…' : '-'}</td><td class="faint">${esc(e.createdBy)} · ${ago(e.createdAt)}</td><td class="acts">${e.file ? `<button class="btn sm" data-a="dl" data-id="${e.id}">Download</button>` : ''}${can('evidence.manage') ? `<button class="btn sm danger" data-a="rmev" data-id="${e.id}">Delete</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mute">No evidence attached yet.</p>'; };
      let evs = evid; renderEv(evs);
      m.el.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-a]'); if (!b) return;
        const a = b.dataset.a;
        try {
          if (a === 'save') { await put(`/api/compliance/${encodeURIComponent(item.id)}/status`, { status: val(m, 'status'), ownerId: val(m, 'owner') || null, note: val(m, 'note') }); toast('Decision saved and recorded in the ledger'); m.close(); reload(); }
          else if (a === 'editc') { m.close(); customForm(item); }
          else if (a === 'delc') { if (await confirmBox({ title: 'Delete custom obligation', message: 'Delete this obligation and its evidence?', confirm: 'Delete', danger: true })) { await del('/api/compliance/custom/' + item.id); m.close(); toast('Deleted'); reload(); } }
          else if (a === 'dl') await downloadFile('/api/compliance/evidence/' + b.dataset.id + '/file');
          else if (a === 'rmev') { await del('/api/compliance/evidence/' + b.dataset.id); evs = evs.filter((x) => x.id !== b.dataset.id); renderEv(evs); reload(); }
          else if (a === 'addev') {
            const f = m.$('[name=evf]').files[0];
            if (f && f.size > 5 * 1024 * 1024) throw new Error('Evidence files are limited to 5 MB');
            const body = { title: val(m, 'evt'), note: val(m, 'evn') };
            if (f) { body.fileName = f.name; body.fileBase64 = await readFileB64(f); }
            const r = await post(`/api/compliance/${encodeURIComponent(item.id)}/evidence`, body);
            evs = [...evs, r]; renderEv(evs); m.$('[name=evt]').value = ''; m.$('[name=evn]').value = ''; m.$('[name=evf]').value = ''; toast('Evidence added'); reload();
          } else if (a === 'assess') {
            b.disabled = true; const out = m.el.querySelector('[data-ai]'); out.innerHTML = '<p class="mute" style="margin-top:6px">Your model is reading the matching documents… this can take a minute on a CPU-only machine.</p>';
            try { const r = await post(`/api/compliance/${encodeURIComponent(item.id)}/assess`, { deploymentId: val(m, 'dep') }); out.innerHTML = aiHtml(r); reload(); }
            catch (err) { out.innerHTML = aiHtml(s.ai); throw err; }
            finally { b.disabled = false; }
          }
        } catch (err) { m.error(err.message); }
      });
    }
    if (ctx.query.open) { const it = data.items.find((i) => i.id === ctx.query.open); history.replaceState(null, '', '#/compliance?tab=obligations'); if (it) detail(it); }
  },
};

export const views = { compliance };
