'use strict';
// Analytics built from real records: inference metrics, compliance signals, the knowledge graph,
// ledger statistics and external anchors for the hash chain.
const { HttpError, id, now, sha256, str } = require('./util');
const { roleFor } = require('./rbac');
const SIG = require('./signals');
const D = require('./compliance-data');

const RANGES = { '24h': { ms: 864e5, step: 36e5, n: 24 }, '7d': { ms: 7 * 864e5, step: 864e5, n: 7 }, '30d': { ms: 30 * 864e5, step: 864e5, n: 30 } };
const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const avg = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null);

function aggregate(rows, range, extraKeys = []) {
  const R = RANGES[range] || RANGES['7d'];
  const end = Date.now();
  const start0 = R.step === 864e5 ? new Date(new Date(end).setHours(0, 0, 0, 0)).getTime() - (R.n - 1) * R.step : Math.floor(end / R.step) * R.step - (R.n - 1) * R.step;
  const inRange = rows.filter((r) => new Date(r.ts).getTime() >= start0);
  const buckets = Array.from({ length: R.n }, (_, i) => ({ t: new Date(start0 + i * R.step).toISOString(), rows: [] }));
  for (const r of inRange) { const i = Math.floor((new Date(r.ts).getTime() - start0) / R.step); if (buckets[i]) buckets[i].rows.push(r); }
  const sum = (rs, k) => rs.reduce((a, r) => a + (r[k] || 0), 0);
  const series = buckets.map((b) => {
    const ok = b.rows.filter((r) => r.ok);
    const lat = ok.map((r) => r.totalMs).filter((x) => x > 0);
    return { t: b.t, requests: b.rows.length, errors: b.rows.length - ok.length, promptTokens: sum(b.rows, 'promptTokens'), completionTokens: sum(b.rows, 'completionTokens'),
      tps: avg(ok.map((r) => r.tps).filter((x) => x != null)), p50: pct(lat, 50), p95: pct(lat, 95), ttft: avg(ok.map((r) => r.ttftMs).filter((x) => x != null)) };
  });
  const ok = inRange.filter((r) => r.ok);
  const lat = ok.map((r) => r.totalMs).filter((x) => x > 0);
  const group = (key) => {
    const m = new Map();
    for (const r of inRange) {
      const k = r[key] || '(none)';
      const g = m.get(k) || { key: k, requests: 0, tokens: 0, errors: 0, tps: [], lat: [], ttft: [] };
      g.requests++; g.tokens += (r.promptTokens || 0) + (r.completionTokens || 0); if (!r.ok) g.errors++;
      if (r.tps != null) g.tps.push(r.tps); if (r.totalMs) g.lat.push(r.totalMs); if (r.ttftMs != null) g.ttft.push(r.ttftMs);
      m.set(k, g);
    }
    return [...m.values()].map((g) => ({ key: g.key, requests: g.requests, tokens: g.tokens, errors: g.errors, tps: avg(g.tps), p50: pct(g.lat, 50), p95: pct(g.lat, 95), ttft: avg(g.ttft) })).sort((a, b) => b.requests - a.requests);
  };
  const hist = [500, 1000, 2000, 5000, 10000, 20000, 40000, Infinity].map((lim, i, a) => ({ upTo: lim, label: lim === Infinity ? `> ${a[i - 1] / 1000}s` : lim < 1000 ? `< ${lim}ms` : `< ${lim / 1000}s`, count: 0 }));
  for (const v of lat) hist.find((h) => v < h.upTo).count++;
  const docCount = new Map();
  inRange.forEach((r) => (r.docIds || []).forEach((d) => docCount.set(d, (docCount.get(d) || 0) + 1)));
  const chats = inRange.filter((r) => r.kind === 'chat');
  const out = {
    range, from: new Date(start0).toISOString(), to: new Date(end).toISOString(), stepMs: R.step, series,
    totals: {
      requests: inRange.length, errors: inRange.length - ok.length, errorRate: inRange.length ? Math.round(((inRange.length - ok.length) / inRange.length) * 1000) / 10 : 0,
      promptTokens: sum(inRange, 'promptTokens'), completionTokens: sum(inRange, 'completionTokens'),
      tps: avg(ok.map((r) => r.tps).filter((x) => x != null)), promptTps: avg(ok.map((r) => r.promptTps).filter((x) => x != null)),
      p50: pct(lat, 50), p95: pct(lat, 95), ttft: avg(ok.map((r) => r.ttftMs).filter((x) => x != null)),
      loadMs: avg(ok.map((r) => r.loadMs).filter((x) => x != null)), coldStarts: ok.filter((r) => r.loadMs > 1000).length,
      groundedPct: chats.length ? Math.round((chats.filter((r) => r.grounded).length / chats.length) * 100) : null,
      avgSources: avg(chats.filter((r) => r.grounded).map((r) => r.sources)),
      users: new Set(inRange.map((r) => r.userId).filter(Boolean)).size,
    },
    byModel: group('model'), byDeployment: group('deploymentId'), byDepartment: group('department'), byRole: group('role'), byKind: group('kind'),
    latencyHistogram: hist.map(({ label, count }) => ({ label, count })),
    topDocs: [...docCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([docId, count]) => ({ docId, count })),
    recent: inRange.slice(-25).reverse().map(({ ts, model, kind, department, role, promptTokens, completionTokens, tps, ttftMs, totalMs, loadMs, grounded, sources, ok: good, error }) => ({ ts, model, kind, department, role, promptTokens, completionTokens, tps, ttftMs, totalMs, loadMs, grounded, sources, ok: good, error })),
  };
  for (const k of extraKeys) out['by' + k[0].toUpperCase() + k.slice(1)] = group(k);
  return out;
}

module.exports = function (app) {
  const { store, route, ledgers } = app;

  // ---------- AI metrics ----------
  route('GET', '/api/metrics', 'deployments.read', (ctx) => {
    const rows = store.metrics.filter((m) => m.orgId === ctx.orgId);
    const a = aggregate(rows, ctx.query.range);
    const deps = new Map(store.deployments.filter((d) => d.orgId === ctx.orgId).map((d) => [d.id, d]));
    a.byDeployment = a.byDeployment.map((g) => ({ ...g, name: deps.has(g.key) ? deps.get(g.key).name : '(deleted)', model: deps.has(g.key) ? deps.get(g.key).model : null }));
    a.byRole = a.byRole.map((g) => { const r = roleFor(store, g.key, ctx.orgId); return { ...g, name: r ? r.name : g.key }; });
    const docs = new Map(store.knowledge.filter((d) => d.orgId === ctx.orgId).map((d) => [d.id, d]));
    a.topDocs = a.topDocs.map((t) => ({ ...t, title: docs.has(t.docId) && app.canSeeDoc(ctx, docs.get(t.docId)) ? docs.get(t.docId).title : '(restricted or deleted)' }));
    const used = new Map(), last = new Map();
    rows.forEach((r) => (r.docIds || []).forEach((d) => { used.set(d, (used.get(d) || 0) + 1); if (!last.has(d) || last.get(d) < r.ts) last.set(d, r.ts); }));
    a.documents = store.knowledge.filter((d) => d.orgId === ctx.orgId && app.canSeeDoc(ctx, d)).map((d) => ({ id: d.id, title: d.title, department: d.department, tags: d.tags || [], useFor: d.useFor || ['retrieval'], chunks: d.chunks.length, chars: d.text.length, retrievals: used.get(d.id) || 0, lastUsed: last.get(d.id) || null, training: store.trainitems.filter((t) => t.docId === d.id).length })).sort((x, y) => y.retrievals - x.retrievals);
    const fb = store.feedback.filter((f) => f.orgId === ctx.orgId);
    a.feedback = { up: fb.filter((f) => f.rating === 'up').length, down: fb.filter((f) => f.rating === 'down').length, shared: fb.filter((f) => f.shared).length };
    a.intelligence = { trainingApproved: store.trainitems.filter((t) => t.orgId === ctx.orgId && t.status === 'approved').length, trainingPending: store.trainitems.filter((t) => t.orgId === ctx.orgId && t.status === 'pending').length, evalRuns: store.evalruns.filter((r) => r.orgId === ctx.orgId && r.status === 'done').length, customModels: store.custommodels.filter((m) => m.orgId === ctx.orgId).length };
    a.allTime = { requests: rows.length, tokens: rows.reduce((s, r) => s + r.promptTokens + r.completionTokens, 0), since: rows.length ? rows[0].ts : null };
    return a;
  });
  route('GET', '/api/ops/metrics', 'ops.view', (ctx) => {
    const a = aggregate(store.metrics.all(), ctx.query.range, ['orgId']);
    a.byOrgId = a.byOrgId.map((g) => ({ ...g, name: (store.orgs.get(g.key) || {}).name || '(deleted)' }));
    const t0 = new Date(a.from).getTime();
    a.orgSeries = a.byOrgId.slice(0, 6).map((g) => {
      const values = a.series.map(() => 0);
      store.metrics.all().forEach((r) => { if (r.orgId !== g.key) return; const i = Math.floor((new Date(r.ts).getTime() - t0) / a.stepMs); if (i >= 0 && i < values.length) values[i]++; });
      return { key: g.key, name: g.name, values };
    });
    // operators never see per-user or per-document detail
    delete a.topDocs; delete a.byDepartment; delete a.byRole; a.recent = a.recent.map(({ department, role, ...r }) => r);
    return a;
  });

  // ---------- Ollama detail for operators ----------
  route('GET', '/api/ops/ollama', 'ops.view', async () => {
    const t0 = Date.now();
    try {
      const [v, tags, ps] = await Promise.all([app.local.version(), app.local.tags(), app.local.ps()]);
      return { reachable: true, url: app.ollamaUrl, latencyMs: Date.now() - t0, version: v.version,
        installed: tags.map((t) => ({ name: t.name, sizeBytes: t.size, modifiedAt: t.modified_at, family: (t.details || {}).family || null, params: (t.details || {}).parameter_size || null, quant: (t.details || {}).quantization_level || null, format: (t.details || {}).format || null })),
        running: ps.map((m) => ({ name: m.name, sizeBytes: m.size || 0, vramBytes: m.size_vram || 0, expiresAt: m.expires_at || null, ctx: m.context_length || null, params: (m.details || {}).parameter_size || null, quant: (m.details || {}).quantization_level || null })),
        usedBy: store.deployments.all().map((d) => ({ model: d.model, org: (store.orgs.get(d.orgId) || {}).name, deployment: d.name })) };
    } catch (e) { return { reachable: false, url: app.ollamaUrl, error: e.message, latencyMs: Date.now() - t0 }; }
  });

  // ---------- compliance signals and AI review ----------
  const insights = (ctx) => {
    const org = store.orgs.get(ctx.orgId);
    const items = app.complianceItems(ctx.orgId);
    // Signals use every document in the organization; titles the viewer may not open are redacted below.
    const docs = store.knowledge.filter((d) => d.orgId === ctx.orgId);
    const L = ledgers.for(ctx.orgId);
    const deployments = store.deployments.filter((d) => d.orgId === ctx.orgId);
    const roleCount = new Set(store.users.filter((u) => u.orgId === ctx.orgId && !u.disabled).map((u) => u.roleId)).size;
    const r = SIG.compute({ items, org, docs, ledgerOk: L.verify().ok, deployments, roleCount, assessments: store.assessments.filter((a) => a.orgId === ctx.orgId) });
    for (const sg of Object.values(r.signals)) {
      sg.docs = sg.docs.map((d) => { const doc = store.knowledge.get(d.docId); return doc && app.canSeeDoc(ctx, doc) ? d : { docId: null, title: `Restricted document (${doc ? doc.department : 'unknown'} department)`, score: d.score, strength: d.strength, restricted: true, excerpt: '' }; });
    }
    return { ...r, items };
  };
  app.complianceInsights = insights;
  route('GET', '/api/compliance/insights', 'compliance.read', (ctx) => {
    const { items, ...r } = insights(ctx);
    return { ...r, notice: 'Signals show where the platform, your documents, evidence and AI reviews support an obligation. They are indicators for people to act on, not an audit opinion, and they never change a status by themselves.' };
  });
  route('POST', '/api/compliance/:id/assess', 'compliance.manage', async (ctx) => {
    const all = insights(ctx);
    const it = all.items.find((i) => i.id === ctx.params.id);
    if (!it) throw new HttpError(404, 'That obligation does not apply to this organization');
    const dep = store.deployments.get(ctx.body.deploymentId);
    if (!dep || dep.orgId !== ctx.orgId) throw new HttpError(400, 'Choose a deployment to run the review on');
    const s = all.signals[it.id];
    const ev = store.evidence.filter((e) => e.orgId === ctx.orgId && e.obligationId === it.id);
    const ctrl = all.controls.filter((c) => s.controls.includes(c.id));
    const docText = s.docs.filter((d) => !d.restricted).map((d, i) => `[D${i + 1}] ${d.title}\n${(store.knowledge.get(d.docId) || { text: d.excerpt }).text.slice(0, 1800)}`).join('\n\n') || '(no matching internal documents)';
    const prompt = `Obligation: ${it.title}\nWhat it requires: ${it.summary}\n\nInternal documents that may address it:\n${docText}\n\nPlatform controls in place: ${ctrl.map((c) => `${c.name} (${c.desc})`).join('; ') || 'none relevant'}\nEvidence on file: ${ev.map((e) => e.title).join('; ') || 'none'}\nCurrent status set by the organization: ${it.status}\n\nAssess how well the documents, controls and evidence above address the obligation. Reply with JSON only, in this shape:\n{"verdict":"covered|partial|not_covered","confidence":0.0,"reasons":["short reason citing D1, D2 or a control"],"missing":["what is still needed"]}\nUse "covered" only if the material clearly addresses the core requirements. Be conservative.`;
    const cl = app.clientFor(app.nodeFor(ctx.orgId, dep.nodeId));
    let r;
    const t0 = Date.now();
    try {
      r = await cl.chat({ model: dep.model, format: 'json', messages: [{ role: 'system', content: 'You are a careful compliance reviewer. You do not give legal advice. You answer with valid JSON only.' }, { role: 'user', content: prompt }], keep_alive: dep.keepAlive === '-1' ? -1 : dep.keepAlive, options: { num_ctx: Math.max(dep.numCtx, 4096), temperature: 0.1, num_predict: 400 } });
    } catch (e) {
      app.recordMetric({ orgId: ctx.orgId, deploymentId: dep.id, model: dep.model, kind: 'assess', user: ctx.user, fin: null, totalMs: Date.now() - t0, error: e.message });
      ctx.log('compliance.ai_review', { type: 'obligation', id: it.id }, { model: dep.model, error: e.message }, 'error');
      throw e;
    }
    app.recordMetric({ orgId: ctx.orgId, deploymentId: dep.id, model: dep.model, kind: 'assess', user: ctx.user, fin: r, totalMs: Date.now() - t0 });
    const text = (r.message && r.message.content) || '';
    let j = null;
    try { j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch (_) { /* fall through */ }
    const verdict = j && ['covered', 'partial', 'not_covered'].includes(j.verdict) ? j.verdict : 'unparsed';
    const rec = store.assessments.insert({
      id: id('asm'), orgId: ctx.orgId, obligationId: it.id, ts: now(), by: ctx.user.username, model: dep.model, verdict,
      confidence: j && typeof j.confidence === 'number' ? Math.max(0, Math.min(1, j.confidence)) : null,
      reasons: j && Array.isArray(j.reasons) ? j.reasons.slice(0, 6).map((x) => String(x).slice(0, 300)) : [text.slice(0, 600)],
      missing: j && Array.isArray(j.missing) ? j.missing.slice(0, 6).map((x) => String(x).slice(0, 300)) : [],
      docIds: s.docs.map((d) => d.docId).filter(Boolean), promptSha256: sha256(prompt), responseSha256: sha256(text),
    });
    ctx.log('compliance.ai_review', { type: 'obligation', id: it.id }, { model: dep.model, verdict, promptSha256: rec.promptSha256, responseSha256: rec.responseSha256, note: 'AI suggestion; status unchanged; requires human review' });
    return rec;
  }, { maxBody: 4096 });

  // ---------- knowledge graph ----------
  route('GET', '/api/graph', 'knowledge.read', (ctx) => {
    const nodes = [], links = [];
    const add = (n) => { nodes.push(n); return n.id; };
    const docs = store.knowledge.filter((d) => app.canSeeDoc(ctx, d));
    const deps = store.deployments.filter((d) => d.orgId === ctx.orgId);
    const metrics = store.metrics.filter((m) => m.orgId === ctx.orgId);
    const depts = new Set(docs.map((d) => (d.department === '*' ? 'Everyone' : d.department)));
    store.users.filter((u) => u.orgId === ctx.orgId && u.department).forEach((u) => depts.add(u.department));
    depts.forEach((d) => add({ id: 'dept:' + d, type: 'department', label: d, users: store.users.filter((u) => u.orgId === ctx.orgId && u.department === d).length }));
    for (const d of docs) {
      add({ id: 'doc:' + d.id, type: 'document', label: d.title, chunks: d.chunks.length, chars: d.text.length, sha256: d.sha256, department: d.department });
      links.push({ source: 'doc:' + d.id, target: 'dept:' + (d.department === '*' ? 'Everyone' : d.department), type: 'owned by' });
    }
    const models = new Set();
    for (const dp of deps) {
      add({ id: 'dep:' + dp.id, type: 'deployment', label: dp.name, model: dp.model, requests: dp.stats ? dp.stats.requests : 0 });
      if (!models.has(dp.model)) { models.add(dp.model); add({ id: 'model:' + dp.model, type: 'model', label: dp.model }); }
      links.push({ source: 'dep:' + dp.id, target: 'model:' + dp.model, type: 'runs' });
    }
    const cite = new Map(), use = new Map();
    for (const m of metrics) {
      if (!m.deploymentId || !deps.some((d) => d.id === m.deploymentId)) continue;
      for (const did of m.docIds || []) if (docs.some((d) => d.id === did)) { const k = m.deploymentId + '|' + did; cite.set(k, (cite.get(k) || 0) + 1); }
      if (m.department && depts.has(m.department)) { const k = m.department + '|' + m.deploymentId; use.set(k, (use.get(k) || 0) + 1); }
    }
    cite.forEach((n, k) => { const [dp, did] = k.split('|'); links.push({ source: 'dep:' + dp, target: 'doc:' + did, type: 'retrieved', weight: n }); });
    use.forEach((n, k) => { const [dpt, dp] = k.split('|'); links.push({ source: 'dept:' + dpt, target: 'dep:' + dp, type: 'asks', weight: n }); });
    if (ctx.perms.includes('compliance.read')) {
      const { signals, items } = insights(ctx);
      for (const it of items) {
        const s = signals[it.id];
        const strong = s.docs.filter((d) => d.docId && (d.strength === 'strong' || d.score >= 9));
        if (!strong.length) continue;
        add({ id: 'ob:' + it.id, type: 'obligation', label: it.title, level: it.level, status: it.status, band: s.band, jurisdiction: it.jurisdictionName });
        strong.forEach((d) => links.push({ source: 'doc:' + d.docId, target: 'ob:' + it.id, type: 'supports', weight: d.score }));
      }
    }
    return { nodes, links };
  });

  // ---------- ledger statistics and anchors ----------
  route('GET', '/api/ledger/stats', 'audit.read', (ctx) => {
    const scope = ctx.orgId || ctx.query.scope || 'platform';
    if (!ledgers.map.has(scope)) throw new HttpError(404, 'Ledger not found');
    const E = ledgers.for(scope).entries;
    const count = (f) => { const m = {}; E.forEach((e) => { const k = f(e); m[k] = (m[k] || 0) + 1; }); return Object.entries(m).map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n); };
    const days = 14, start = new Date(new Date().setHours(0, 0, 0, 0)).getTime() - (days - 1) * 864e5;
    const perDay = Array.from({ length: days }, (_, i) => ({ t: new Date(start + i * 864e5).toISOString(), ok: 0, denied: 0, error: 0 }));
    const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const e of E) {
      const t = new Date(e.ts); const i = Math.floor((t.getTime() - start) / 864e5);
      if (perDay[i]) perDay[i][e.outcome] = (perDay[i][e.outcome] || 0) + 1;
      heat[t.getDay()][t.getHours()]++;
    }
    return { scope, length: E.length, head: ledgers.for(scope).head(), byArea: count((e) => e.action.split('.')[0]), byAction: count((e) => e.action).slice(0, 12), byActor: count((e) => (e.actor ? e.actor.username : 'system')).slice(0, 10), byOutcome: count((e) => e.outcome), perDay, heat, first: E[0] ? E[0].ts : null, last: E.length ? E[E.length - 1].ts : null };
  });
  const anchorsOf = (scope) => store.anchors.filter((a) => a.scope === scope).sort((a, b) => (a.ts < b.ts ? 1 : -1));
  const checkAnchor = (a) => { const e = ledgers.for(a.scope).entries[a.index]; return { ...a, valid: !!e && e.hash === a.hash }; };
  route('GET', '/api/ledger/anchors', 'audit.read', (ctx) => anchorsOf(ctx.orgId || ctx.query.scope || 'platform').map(checkAnchor));
  route('POST', '/api/ledger/anchors', 'audit.verify', (ctx) => {
    const scope = ctx.orgId || ctx.body.scope || 'platform';
    const L = ledgers.for(scope);
    const v = L.verify();
    if (!v.ok) throw new HttpError(409, 'The chain does not verify, so it cannot be anchored. Investigate the break first.');
    const note = str(ctx.body.note, 200, 'Note', { required: false });
    const index = L.entries.length - 1, hash = L.head();
    const a = store.anchors.insert({ id: id('anc'), scope, index, hash, ts: now(), by: ctx.user.username, note, receipt: `vector-anchor:${scope}:${index}:${hash}` });
    ctx.log('ledger.anchor', { type: 'ledger', id: scope }, { anchoredIndex: index, anchoredHash: hash, note });
    return checkAnchor(a);
  }, { maxBody: 4096 });
};

module.exports.aggregate = aggregate;
