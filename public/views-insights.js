import { esc, get, toast, modal, badge, meter, spark, bytes, mib, ago, dt, sh, num, statusBadge, pagehead, empty } from './ui.js';
import { C, tip, fmtN, fmtMs, lineChart, columnChart, donut, hbars, gauge } from './charts.js';

export const tl = (iso, stepMs) => { const d = new Date(iso); return stepMs < 864e5 ? String(d.getHours()).padStart(2, '0') + ':00' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
export const kpi = (k, v, s = '', extra = '', cls = '') => `<div class="kpi ${cls}"><div class="k">${esc(k)}</div><div class="v">${v}</div><div class="s">${s}</div>${extra}</div>`;
export const card = (title, sub, body, { cls = '', action = '' } = {}) => `<div class="card ${cls}"><div class="ch"><div><div class="tt">${esc(title)}</div>${sub ? `<div class="st">${esc(sub)}</div>` : ''}</div><span class="sp"></span>${action}</div>${body}</div>`;
export const BAND = { evidenced: ['Evidenced', 'var(--ok)'], supported: ['Supported', 'var(--c1)'], partial: ['Partial', 'var(--c4)'], gap: ['Gap', 'var(--bad)'], na: ['Not applicable', 'var(--faint)'] };
export const bandChip = (b) => `<span class="band ${b}">${esc(BAND[b][0])}</span>`;
const LEVELS = ['international', 'regional', 'national', 'state', 'local'];
const LEVEL_L = { international: 'International', regional: 'Regional', national: 'National', state: 'State', local: 'Local' };
const initials = (s) => s.replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// ======================= Overview (customer) =======================
const overview = {
  title: 'Overview', scope: 'org',
  async render(ctx) {
    const { root, can, org } = ctx;
    const [o, m, ins, comp, led] = await Promise.all([
      get('/api/overview'),
      can('deployments.read') ? get('/api/metrics?range=7d') : null,
      can('compliance.read') ? get('/api/compliance/insights') : null,
      can('compliance.read') ? get('/api/compliance') : null,
      can('audit.read') ? get('/api/ledger?limit=8') : null,
    ]);
    let h = `<div class="ohead"><div class="av">${esc(initials(org.name))}</div><div><h2>${esc(org.name)}</h2><div class="sub">${esc(org.industryName)} · ${org.jurisdictions.map(esc).join(', ') || 'no jurisdictions set'}</div></div>
      <div class="attrs">${o.deployments ? `<div class="attr"><div class="l">Deployments running</div><div class="x">${o.deployments.running} of ${o.deployments.total}</div></div>` : ''}${ins ? `<div class="attr"><div class="l">Compliance readiness</div><div class="x">${ins.readiness}%</div></div>` : ''}${o.ledger ? `<div class="attr"><div class="l">Audit chain</div><div class="x" style="color:${o.ledger.ok ? 'var(--ok)' : 'var(--bad)'}">${o.ledger.ok ? 'Verified intact' : 'BROKEN'}</div></div>` : ''}<div class="attr"><div class="l">Signed in as</div><div class="x">${esc(ctx.me.displayName)}</div></div></div></div>`;
    if (o.attention && o.attention.length) h += `<div class="stack" style="margin-bottom:16px;gap:8px">${o.attention.slice(0, 4).map((a) => `<div class="callout ${a.level === 'bad' ? 'bad' : a.level === 'warn' ? 'warn' : ''}">${esc(a.text)} ${a.link ? `<a href="${esc(a.link)}">Open</a>` : ''}</div>`).join('')}</div>`;

    const K = [];
    if (m) {
      const t = m.totals;
      K.push(kpi('AI requests, 7 days', num(t.requests), `${t.users} people · ${t.errors} errors`, spark(m.series.map((x) => x.requests), { max: Math.max(1, ...m.series.map((x) => x.requests)) })));
      K.push(kpi('Tokens processed', fmtN(t.promptTokens + t.completionTokens), `${fmtN(t.completionTokens)} generated`, spark(m.series.map((x) => x.completionTokens), { max: Math.max(1, ...m.series.map((x) => x.completionTokens)), cls: 'b' })));
      K.push(kpi('Generation speed', t.tps != null ? `${t.tps}<small>tok/s</small>` : '-', t.ttft != null ? `first token in ${fmtMs(t.ttft)}` : 'no requests yet'));
      K.push(kpi('Latency p95', fmtMs(t.p95), t.p50 != null ? `median ${fmtMs(t.p50)}` : ''));
    }
    if (ins) K.push(kpi('Compliance readiness', `${ins.readiness}<small>%</small>`, `${ins.bands.gap || 0} gaps · ${ins.bands.evidenced || 0} evidenced`));
    if (o.ledger) K.push(kpi('Audit ledger', num(o.ledger.length), `head ${sh(o.ledger.head)}`, '', o.ledger.ok ? '' : 'st-bad'));
    if (K.length) h += `<div class="kpis">${K.join('')}</div>`;

    const cards = [];
    if (m) {
      const labels = m.series.map((x) => tl(x.t, m.stepMs));
      cards.push(card('AI usage', 'Requests per day by outcome, last 7 days', columnChart({ labels, series: [{ name: 'Succeeded', values: m.series.map((x) => x.requests - x.errors), color: 'var(--c1)' }, { name: 'Failed', values: m.series.map((x) => x.errors), color: 'var(--c8)' }], height: 190 }), { cls: 'g-wide', action: '<a class="btn sm ghost" href="#/metrics">AI metrics</a>' }));
    }
    if (ins) {
      const b = ins.bands;
      cards.push(card('Compliance readiness', `${comp.items.length} obligations for your industry and locations`, donut({ items: ['evidenced', 'supported', 'partial', 'gap', 'na'].filter((k) => b[k]).map((k) => ({ label: BAND[k][0], value: b[k], color: BAND[k][1] })), center: `${ins.readiness}%`, sub: 'readiness', size: 130 }), { action: '<a class="btn sm ghost" href="#/compliance">Open</a>' }));
      const rows = LEVELS.filter((l) => comp.items.some((i) => i.level === l)).map((l) => {
        const its = comp.items.filter((i) => i.level === l);
        const cnt = (bd) => its.filter((i) => ins.signals[i.id].band === bd).length;
        return { l, n: its.length, segs: ['evidenced', 'supported', 'partial', 'gap'].map((bd) => [bd, cnt(bd)]) };
      });
      cards.push(card('Obligations by level', 'From international standards down to local rules', `<div class="stack" style="gap:10px">${rows.map((r) => `<div><div class="row between" style="font-size:12.5px;margin-bottom:4px"><span>${LEVEL_L[r.l]}</span><span class="faint">${r.n}</span></div><div style="display:flex;gap:2px;height:12px">${r.segs.filter(([, n]) => n).map(([bd, n]) => `<i style="flex:${n};background:${BAND[bd][1]};border-radius:3px" data-tip="${esc(tip(LEVEL_L[r.l], [[BAND[bd][0], String(n)]]))}"></i>`).join('')}</div></div>`).join('')}<div class="legend">${['evidenced', 'supported', 'partial', 'gap'].map((bd) => `<span><i style="background:${BAND[bd][1]}"></i>${BAND[bd][0]}</span>`).join('')}</div></div>`));
      const gaps = comp.items.filter((i) => ins.signals[i.id].band === 'gap' && ['law', 'regulation'].includes(i.type)).slice(0, 5);
      cards.push(card('Top open obligations', 'Laws and regulations with no supporting signal yet', gaps.length ? `<div class="stack" style="gap:8px">${gaps.map((i) => `<a href="#/compliance?tab=obligations&open=${encodeURIComponent(i.id)}" style="text-decoration:none;color:inherit" class="row between"><span style="flex:1;min-width:0"><span style="display:block;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(i.title)}</span><span class="faint" style="font-size:12px">${esc(i.jurisdictionName)}</span></span>${bandChip('gap')}</a>`).join('')}</div>` : '<p class="mute">No open mandatory gaps. Nice.</p>'));
    }
    if (o.deployments && o.deployments.list.length) {
      cards.push(card('Deployments', 'Models serving your people', `<div class="tblwrap"><table class="tbl"><tbody>${o.deployments.list.map((d) => `<tr><td><b>${esc(d.name)}</b><div class="mono faint" style="font-size:12px">${esc(d.model)}</div></td><td style="text-align:right">${statusBadge(d.status)}<div class="faint" style="font-size:12px;margin-top:3px;white-space:nowrap">${num(d.stats ? d.stats.requests : 0)} requests</div></td></tr>`).join('')}</tbody></table></div>`, { action: '<a class="btn sm ghost" href="#/deployments">Manage</a>' }));
    }
    if (m && m.byDepartment.length) cards.push(card('Who uses AI', 'Requests by department, last 7 days', hbars(m.byDepartment.slice(0, 6).map((g, k) => ({ label: g.key === '(none)' ? 'No department' : g.key, value: g.requests, color: C(k) })))));
    if (led) {
      const es = led.entries.slice(0, 6).reverse();
      cards.push(card('Audit chain', `${num(led.length)} blocks · each links to the previous hash`, `<div class="chain">${es.map((e, i) => `${i ? '<div class="clink"><svg viewBox="0 0 22 12"><path d="M0 6h18M14 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></div>' : ''}<div class="cblock" style="flex-basis:150px" data-tip="${esc(tip('Block ' + e.index, [['Action', e.action], ['By', (e.actor || {}).username || 'system'], ['Hash', sh(e.hash)], ['Prev', sh(e.prevHash)]]))}"><div class="ix">#${e.index}</div><div class="ac">${esc(e.action)}</div><div class="hh">${esc(e.hash.slice(0, 14))}…</div></div>`).join('')}</div>`, { cls: 'g-full', action: '<a class="btn sm ghost" href="#/audit">Ledger</a>' }));
    }
    if (!m && !ins) cards.push(card('Your private workspace', '', `<p class="mute">Questions are answered by models running on ${esc(org.name)}'s own hardware. Nothing is sent to an outside AI service.</p><div style="margin-top:12px"><a class="btn primary" href="#/chat">Open the assistant</a></div>`));
    if (!can('deployments.read') && can('chat.use')) cards.unshift(card('Ask the assistant', 'Private, on-premises AI', `<p class="mute" style="margin-bottom:12px">Answers come from models on ${esc(org.name)}'s own servers and cite your department's documents.</p><a class="btn primary" href="#/chat">Open the assistant</a>`));
    h += `<div class="grid3">${cards.join('')}</div>`;
    root.innerHTML = h;
  },
};

// ======================= AI metrics =======================
const metrics = {
  title: 'AI metrics', perm: 'deployments.read', scope: 'org',
  async render(ctx) {
    const { root, can } = ctx;
    let range = ctx.query.range || '24h';
    const draw = async () => {
      const [m, sys] = await Promise.all([get('/api/metrics?range=' + range), can('infra.read') ? get('/api/system').catch(() => null) : null]);
      if (!ctx.alive()) return;
      const t = m.totals, labels = m.series.map((x) => tl(x.t, m.stepMs));
      let h = pagehead('AI metrics', 'Measured from every real request to your models: speed, latency, tokens and grounding. Numbers only, no prompt or answer text.', `<span class="faint" style="font-size:12px"><span class="livedot"></span> live</span><div class="seg" role="tablist">${['24h', '7d', '30d'].map((r) => `<button class="${r === range ? 'on' : ''}" data-act="range" data-r="${r}">${r}</button>`).join('')}</div>`);
      if (!t.requests) h += `<div class="callout" style="margin-bottom:16px">No requests in this period yet. Ask something in the Assistant and the charts fill in from the real measurements Ollama reports.</div>`;
      h += `<div class="kpis k4">
        ${kpi('Requests', num(t.requests), `${t.users} people · ${num(m.allTime.requests)} all time`, spark(m.series.map((x) => x.requests), { max: Math.max(1, ...m.series.map((x) => x.requests)) }))}
        ${kpi('Tokens in / out', `${fmtN(t.promptTokens)}<small>/ ${fmtN(t.completionTokens)}</small>`, 'prompt / generated')}
        ${kpi('Generation speed', t.tps != null ? `${t.tps}<small>tok/s</small>` : '-', t.promptTps != null ? `prompt processing ${fmtN(t.promptTps)} tok/s` : '')}
        ${kpi('Time to first token', fmtMs(t.ttft), t.loadMs != null ? `model load avg ${fmtMs(t.loadMs)}` : '')}
        ${kpi('Latency p50 / p95', `${fmtMs(t.p50)}<small>/ ${fmtMs(t.p95)}</small>`, 'end-to-end request time')}
        ${kpi('Error rate', `${t.errorRate}<small>%</small>`, `${t.errors} failed`, '', t.errorRate > 5 ? 'st-bad' : '')}
        ${kpi('Grounded answers', t.groundedPct != null ? `${t.groundedPct}<small>%</small>` : '-', t.avgSources ? `${t.avgSources} sources per grounded answer` : 'answers citing your documents')}
        ${kpi('Cold starts', num(t.coldStarts), 'requests that waited > 1 s for a model load')}</div>`;
      const sysCard = sys ? card('Models in memory now', `Ollama ${sys.ollama.reachable ? 'v' + esc(sys.ollama.version) : 'offline'} · ${sys.hardware ? esc(sys.hardware.deviceType) + ' · ' + esc(sys.hardware.cpu.model) : ''}`, ((sys.ollama.running || []).length ? `<div class="stack" style="gap:12px">${sys.ollama.running.map((r) => { const share = r.sizeBytes ? Math.round((r.vramBytes / r.sizeBytes) * 100) : 0; return `<div><div class="row between"><span class="mono" style="font-weight:600">${esc(r.name)}</span><span class="faint">${bytes(r.sizeBytes)}</span></div>${meter(share, share >= 99 ? 'ok' : share ? 'warn' : '')}<div class="note" style="margin-top:4px">${share}% in GPU memory${share < 100 ? `, ${100 - share}% in system RAM` : ''} · unloads ${r.expiresAt ? ago(r.expiresAt).replace(' ago', '') : '-'}</div></div>`; }).join('')}</div>` : '<p class="mute">No model is loaded right now. The next request loads one (a cold start).</p>') + `<div class="note">CPU ${sys.cpu.percent}% · memory ${sys.memory.percent}% of ${bytes(sys.memory.totalBytes)}</div>`) : '';
      const depRows = m.byDeployment.map((g) => `<tr><td><b>${esc(g.name)}</b><div class="mono faint" style="font-size:12px">${esc(g.model || '')}</div></td><td class="num">${num(g.requests)}</td><td class="num">${fmtN(g.tokens)}</td><td class="num">${g.tps ?? '-'}</td><td class="num">${fmtMs(g.ttft)}</td><td class="num">${fmtMs(g.p50)}</td><td class="num">${fmtMs(g.p95)}</td><td class="num">${g.errors}</td></tr>`).join('');
      h += `<div class="cols2">
        ${card('Requests', 'Succeeded and failed per ' + (m.stepMs < 864e5 ? 'hour' : 'day'), columnChart({ labels, series: [{ name: 'Succeeded', values: m.series.map((x) => x.requests - x.errors), color: 'var(--c1)' }, { name: 'Failed', values: m.series.map((x) => x.errors), color: 'var(--c8)' }] }))}
        ${card('Tokens', 'Prompt tokens read and tokens generated', columnChart({ labels, series: [{ name: 'Prompt', values: m.series.map((x) => x.promptTokens), color: 'var(--c1)' }, { name: 'Generated', values: m.series.map((x) => x.completionTokens), color: 'var(--c2)' }] }))}
        ${card('Latency', 'Median, 95th percentile and time to first token', lineChart({ labels, series: [{ name: 'p50', values: m.series.map((x) => x.p50) }, { name: 'p95', values: m.series.map((x) => x.p95) }, { name: 'First token', values: m.series.map((x) => x.ttft) }], yfmt: fmtMs }))}
        ${card('Generation speed', 'Average tokens per second generated', lineChart({ labels, series: [{ name: 'tok/s', values: m.series.map((x) => x.tps), color: 'var(--c3)' }], area: true, vfmt: (v) => (v == null ? '-' : v + ' tok/s') }))}
        ${card('Latency distribution', 'How long requests took end to end', columnChart({ labels: m.latencyHistogram.map((x) => x.label), series: [{ name: 'Requests', values: m.latencyHistogram.map((x) => x.count), color: 'var(--c7)' }], height: 170 }))}
        ${card('Request types', 'Chat, compliance reviews, drafts and benchmarks', donut({ items: m.byKind.map((g, k) => ({ label: { chat: 'Chat', assess: 'AI compliance review', assist: 'Compliance draft', benchmark: 'Benchmark', eval: 'Evaluation', training: 'Training data generation' }[g.key] || g.key, value: g.requests, color: C(k) })), center: num(t.requests), sub: 'requests' }))}
        ${card('By department', 'Who is using AI', hbars(m.byDepartment.map((g, k) => ({ label: g.key === '(none)' ? 'No department' : g.key, value: g.requests, color: C(k), tip: tip(g.key, [['Requests', num(g.requests)], ['Tokens', fmtN(g.tokens)], ['p50', fmtMs(g.p50)]]) }))))}
        ${card('By role', 'Usage per role', hbars(m.byRole.map((g, k) => ({ label: g.name, value: g.requests, color: C(k + 3) }))))}
        ${card('Most cited documents', 'Knowledge retrieved to ground answers', hbars(m.topDocs.map((d) => ({ label: d.title, value: d.count, color: 'var(--c3)' }))))}
        ${sysCard}
      </div>
      <div class="card" style="margin-top:16px"><div class="ch"><div><div class="tt">Documents your AI uses</div><div class="st">Every document in your knowledge base: how often it grounded an answer in this period, its tags, and whether it feeds training</div></div><span class="sp"></span><a class="btn sm" href="#/knowledge">Manage documents</a></div><div class="tblwrap"><table class="tbl mtable"><thead><tr><th>Document</th><th>Tags</th><th>Department</th><th>Used for</th><th class="num">Retrievals</th><th>Last used</th><th class="num">Training examples</th><th style="width:140px">Share of retrievals</th></tr></thead><tbody>${(() => { const tot = m.documents.reduce((x, d) => x + d.retrievals, 0) || 1; return m.documents.map((d) => `<tr><td><b>${esc(d.title)}</b></td><td>${(d.tags || []).map((x) => `<span class="tagchip">${esc(x)}</span>`).join(' ')}</td><td>${d.department === '*' ? 'Everyone' : esc(d.department)}</td><td>${d.useFor.map((x) => `<span class="sig ${x === 'training' ? 'info' : 'ok'}">${x === 'training' ? 'Training' : 'Answers'}</span>`).join(' ')}</td><td class="num">${d.retrievals}</td><td class="faint">${d.lastUsed ? ago(d.lastUsed) : 'never'}</td><td class="num">${d.training}</td><td>${meter((d.retrievals / tot) * 100, 'ok')}</td></tr>`).join('') || '<tr><td colspan="8" class="mute">No documents yet.</td></tr>'; })()}</tbody></table></div>
        <div class="row" style="gap:24px;margin-top:12px;font-size:13px;color:var(--mute)"><span>Answer ratings: <b style="color:var(--ink)">${m.feedback.up}</b> helpful · <b style="color:var(--ink)">${m.feedback.down}</b> not helpful · ${m.feedback.shared} shared for improvement</span><span>Training data: <b style="color:var(--ink)">${m.intelligence.trainingApproved}</b> approved · ${m.intelligence.trainingPending} pending</span><span>Own models: <b style="color:var(--ink)">${m.intelligence.customModels}</b> · evaluation runs: <b style="color:var(--ink)">${m.intelligence.evalRuns}</b></span></div></div>
      <div class="card" style="margin-top:16px"><div class="ch"><div><div class="tt">By deployment</div><div class="st">Per-deployment performance in this period</div></div></div><div class="tblwrap"><table class="tbl mtable"><thead><tr><th>Deployment</th><th class="num">Requests</th><th class="num">Tokens</th><th class="num">tok/s</th><th class="num">First token</th><th class="num">p50</th><th class="num">p95</th><th class="num">Errors</th></tr></thead><tbody>${depRows || '<tr><td colspan="8" class="mute">No requests yet.</td></tr>'}</tbody></table></div></div>
      <div class="card" style="margin-top:16px"><div class="ch"><div><div class="tt">Recent requests</div><div class="st">Measurements only. Prompts and answers are never stored here.</div></div></div><div class="tblwrap"><table class="tbl mtable"><thead><tr><th>Time</th><th>Type</th><th>Model</th><th>Department</th><th class="num">In</th><th class="num">Out</th><th class="num">tok/s</th><th class="num">First token</th><th class="num">Total</th><th>Grounded</th><th></th></tr></thead><tbody>${m.recent.map((r) => `<tr><td class="faint">${dt(r.ts).slice(5)}</td><td>${esc(r.kind)}</td><td class="mono">${esc(r.model)}</td><td>${esc(r.department || '-')}</td><td class="num">${r.promptTokens}</td><td class="num">${r.completionTokens}</td><td class="num">${r.tps ?? '-'}</td><td class="num">${fmtMs(r.ttftMs)}</td><td class="num">${fmtMs(r.totalMs)}${r.loadMs > 1000 ? ' <span class="tag">cold</span>' : ''}</td><td>${r.grounded ? `${r.sources} doc${r.sources === 1 ? '' : 's'}` : '-'}</td><td>${r.ok ? '' : badge('error', 'bad')}</td></tr>`).join('') || '<tr><td colspan="11" class="mute">No requests yet.</td></tr>'}</tbody></table></div></div>`;
      root.innerHTML = h;
    };
    ctx.acts.range = (b) => { range = b.dataset.r; draw(); };
    await draw();
    ctx.poll(async () => { await draw(); }, 20000);
  },
};

// ======================= Knowledge map (graph) =======================
const TYPE = { department: ['Department', 'var(--c7)', 13], document: ['Document', 'var(--c1)', 9], obligation: ['Obligation', 'var(--c3)', 8], deployment: ['Deployment', 'var(--c2)', 12], model: ['Model', 'var(--c4)', 11] };
const graph = {
  title: 'Knowledge map', perm: 'knowledge.read', scope: 'org',
  async render(ctx) {
    const { root } = ctx;
    const g = await get('/api/graph');
    root.innerHTML = pagehead('Knowledge map', 'How your departments, documents, AI deployments and compliance obligations connect, built from real retrievals and document matches.', `<input class="input" style="width:220px" placeholder="Find a node" data-inp="find" aria-label="Find a node">`) +
      `<div class="row" style="margin-bottom:10px">${Object.entries(TYPE).map(([k, [l, c]]) => `<label class="check"><input type="checkbox" data-chg="flt" value="${k}" checked><i style="width:10px;height:10px;border-radius:50%;background:${c};display:inline-block"></i>${l}s (${g.nodes.filter((n) => n.type === k).length})</label>`).join('')}</div>` +
      `<div class="graphwrap" id="gw"><svg id="gs" role="img" aria-label="Knowledge graph"><g id="gz"><g id="gl"></g><g id="gn"></g></g></svg>
       <div class="glegend"><span><i style="background:var(--c1);border-radius:0;height:2px;width:14px"></i>retrieved by deployment</span><span><i style="background:var(--c3);border-radius:0;height:2px;width:14px"></i>document supports obligation</span><span><i style="background:var(--c7);border-radius:0;height:2px;width:14px"></i>department asks deployment</span><span><i style="background:var(--c2);border-radius:0;height:2px;width:14px"></i>deployment runs model</span></div>
       <div class="gpanel" id="gp"><b>Explore</b><p class="mute" style="margin-top:6px">Drag nodes, scroll to zoom, hover for names, click a node for details. Thicker blue lines mean more retrievals.</p><div class="kv" style="margin-top:10px;grid-template-columns:110px 1fr"><dt>Nodes</dt><dd>${g.nodes.length}</dd><dt>Connections</dt><dd>${g.links.length}</dd></div></div></div>`;
    if (!g.nodes.length) { root.querySelector('#gw').innerHTML = empty('Nothing to map yet', 'Add knowledge documents and use the assistant to see connections appear.'); return; }
    const svg = root.querySelector('#gs'), gz = root.querySelector('#gz'), gl = root.querySelector('#gl'), gn = root.querySelector('#gn'), panel = root.querySelector('#gp');
    const W = svg.clientWidth || 1000, H = svg.clientHeight || 600;
    const byId = new Map();
    const ring = { department: 0.18, deployment: 0.05, model: 0.02, document: 0.32, obligation: 0.45 };
    g.nodes.forEach((n, i) => { const a = (i / g.nodes.length) * Math.PI * 2 * 3.1; const rr = Math.min(W, H) * (ring[n.type] || 0.3); n.x = W / 2 + Math.cos(a) * rr; n.y = H / 2 + Math.sin(a) * rr; n.vx = 0; n.vy = 0; byId.set(n.id, n); });
    const links = g.links.filter((l) => byId.has(l.source) && byId.has(l.target)).map((l) => ({ ...l, s: byId.get(l.source), t: byId.get(l.target) }));
    const deg = new Map(); links.forEach((l) => { deg.set(l.s.id, (deg.get(l.s.id) || 0) + 1); deg.set(l.t.id, (deg.get(l.t.id) || 0) + 1); });
    const rOf = (n) => TYPE[n.type][2] + Math.min(8, (deg.get(n.id) || 0) * 0.8);
    const short = (s, k = 26) => (s.length > k ? s.slice(0, k - 1) + '…' : s);
    gl.innerHTML = links.map((l, i) => `<line class="glink ${l.type.replace(' ', '')}" data-i="${i}" stroke-width="${l.weight && l.type === 'retrieved' ? Math.min(6, 1.2 + l.weight * 0.7) : 1.4}"/>`).join('');
    gn.innerHTML = g.nodes.map((n, i) => `<g class="gnode" data-i="${i}"><circle r="${rOf(n)}" fill="${TYPE[n.type][1]}" data-tip="${esc(tip(n.label, [[TYPE[n.type][0], ''], ...(n.model ? [['Model', n.model]] : []), ...(n.requests != null ? [['Requests', String(n.requests)]] : []), ...(n.status ? [['Status', n.status.replace('_', ' ')]] : [])]))}"/><text dy="${rOf(n) + 13}" text-anchor="middle" class="${n.type === 'obligation' || (n.type === 'document' && (deg.get(n.id) || 0) < 3) ? 'min' : ''}">${esc(short(n.label))}</text></g>`).join('');
    const lineEls = [...gl.children], nodeEls = [...gn.children];
    let alpha = 1, raf = null, view = { x: 0, y: 0, k: 1 };
    const tick = () => {
      const N = g.nodes;
      for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) {
        const a = N[i], b = N[j]; let dx = b.x - a.x, dy = b.y - a.y; let d2 = dx * dx + dy * dy || 0.01;
        if (d2 > 250000) continue;
        const f = (4200 / d2) * alpha; const d = Math.sqrt(d2); dx /= d; dy /= d;
        a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
      }
      for (const l of links) {
        const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        const want = l.type === 'supports' ? 120 : l.type === 'owned by' ? 110 : 170;
        const f = ((d - want) / d) * 0.04 * alpha;
        l.s.vx += dx * f; l.s.vy += dy * f; l.t.vx -= dx * f; l.t.vy -= dy * f;
      }
      for (const n of N) {
        n.vx += (W / 2 - n.x) * 0.0025 * alpha; n.vy += (H / 2 - n.y) * 0.003 * alpha;
        if (n.fixed) { n.vx = 0; n.vy = 0; continue; }
        n.vx *= 0.82; n.vy *= 0.82; n.x += n.vx; n.y += n.vy;
      }
      lineEls.forEach((el, i) => { const l = links[i]; el.setAttribute('x1', l.s.x); el.setAttribute('y1', l.s.y); el.setAttribute('x2', l.t.x); el.setAttribute('y2', l.t.y); });
      nodeEls.forEach((el, i) => el.setAttribute('transform', `translate(${N[i].x.toFixed(1)},${N[i].y.toFixed(1)})`));
      alpha *= 0.985;
      if (alpha > 0.02 && ctx.alive()) raf = requestAnimationFrame(tick);
    };
    const kick = (a = 0.5) => { alpha = Math.max(alpha, a); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); };
    kick(1);
    const applyView = () => gz.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`);
    const toLocal = (e) => { const r = svg.getBoundingClientRect(); return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k }; };
    let drag = null, pan = null;
    svg.addEventListener('pointerdown', (e) => {
      const ge = e.target.closest('.gnode');
      if (ge) { drag = g.nodes[Number(ge.dataset.i)]; drag.fixed = true; drag.moved = false; svg.setPointerCapture(e.pointerId); }
      else { pan = { x: e.clientX - view.x, y: e.clientY - view.y }; }
    });
    svg.addEventListener('pointermove', (e) => {
      if (drag) { const p = toLocal(e); drag.x = p.x; drag.y = p.y; drag.moved = true; kick(0.25); }
      else if (pan) { view.x = e.clientX - pan.x; view.y = e.clientY - pan.y; applyView(); }
    });
    svg.addEventListener('pointerup', () => { if (drag && !drag.moved) select(drag); if (drag) drag.fixed = false; drag = null; pan = null; });
    svg.addEventListener('wheel', (e) => { e.preventDefault(); const r = svg.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top; const k2 = Math.max(0.3, Math.min(3, view.k * (e.deltaY < 0 ? 1.12 : 0.89))); view.x = mx - ((mx - view.x) * k2) / view.k; view.y = my - ((my - view.y) * k2) / view.k; view.k = k2; applyView(); }, { passive: false });
    const neighbors = (n) => { const s = new Set([n.id]); links.forEach((l) => { if (l.s === n) s.add(l.t.id); if (l.t === n) s.add(l.s.id); }); return s; };
    function select(n) {
      const nb = neighbors(n);
      svg.classList.add('graph-dim');
      nodeEls.forEach((el, i) => el.classList.toggle('hl', nb.has(g.nodes[i].id)));
      lineEls.forEach((el, i) => el.classList.toggle('hl', links[i].s === n || links[i].t === n));
      const rel = links.filter((l) => l.s === n || l.t === n).map((l) => ({ other: l.s === n ? l.t : l.s, type: l.type, w: l.weight }));
      const attrs = n.type === 'document' ? [['Department', n.department === '*' ? 'Everyone' : n.department], ['Size', `${num(n.chars)} chars, ${n.chunks} parts`], ['SHA-256', sh(n.sha256)]]
        : n.type === 'deployment' ? [['Model', n.model], ['Requests', num(n.requests)]]
        : n.type === 'obligation' ? [['Jurisdiction', n.jurisdiction], ['Level', n.level], ['Status', n.status.replace('_', ' ')], ['Signal', BAND[n.band][0]]]
        : n.type === 'department' ? [['People', String(n.users)]] : [];
      panel.innerHTML = `<div class="row between"><span class="tag" style="color:${TYPE[n.type][1]}">${TYPE[n.type][0]}</span><button class="btn ghost sm" data-gclose>Clear</button></div><h4 style="margin:8px 0 10px;font-size:15px">${esc(n.label)}</h4><dl class="kv" style="grid-template-columns:95px 1fr">${attrs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl><div class="lbl" style="margin:12px 0 6px">Connections (${rel.length})</div><div class="stack" style="gap:6px">${rel.map((r) => `<div class="row" style="gap:8px;flex-wrap:nowrap"><i style="width:8px;height:8px;border-radius:50%;background:${TYPE[r.other.type][1]};flex:0 0 8px"></i><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.other.label)}">${esc(r.other.label)}</span><span class="faint" style="font-size:11.5px">${esc(r.type)}${r.w && r.type !== 'supports' ? ' ×' + r.w : ''}</span></div>`).join('')}</div>${n.type === 'document' ? `<div style="margin-top:12px"><a class="btn sm" href="#/knowledge">Open in Knowledge</a></div>` : n.type === 'obligation' ? `<div style="margin-top:12px"><a class="btn sm" href="#/compliance?tab=obligations&open=${encodeURIComponent(n.id.slice(3))}">Open obligation</a></div>` : ''}`;
      panel.querySelector('[data-gclose]').onclick = clear;
    }
    function clear() { svg.classList.remove('graph-dim'); nodeEls.forEach((el) => el.classList.remove('hl')); lineEls.forEach((el) => el.classList.remove('hl')); }
    ctx.chg.flt = () => {
      const on = new Set([...root.querySelectorAll('[data-chg=flt]:checked')].map((e) => e.value));
      nodeEls.forEach((el, i) => { el.style.display = on.has(g.nodes[i].type) ? '' : 'none'; });
      lineEls.forEach((el, i) => { el.style.display = on.has(links[i].s.type) && on.has(links[i].t.type) ? '' : 'none'; });
    };
    ctx.inp.find = (t) => { const q = t.value.toLowerCase().trim(); if (!q) return clear(); const n = g.nodes.find((x) => x.label.toLowerCase().includes(q)); if (n) select(n); };
  },
};

export const views = { overview, metrics, graph };
