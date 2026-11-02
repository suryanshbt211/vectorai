'use strict';
const { HttpError, id, now, sha256, str, num, oneOf } = require('./util');
const { snapshot } = require('./gpu');
const { CATALOG, DEFAULT_MODEL, TAG_RE } = require('./catalog');
const K = require('./knowledge');
const D = require('./compliance-data');

const BENCH_PROMPTS = [
  'Explain in two sentences why sensitive data should stay inside an organization\'s own network.',
  'List three controls that reduce the risk of unauthorized access to customer records.',
  'Summarize in one paragraph: a logistics company must retain driver records and shipping documents for defined periods and protect the personal data of employees and customers.',
];
const KEEP_RE = /^(-1|\d{1,4}[smh])$/;

module.exports = function (app) {
  const { store, route, ledgers } = app;
  const normTag = (n) => {
    n = String(n || '').trim();
    if (!TAG_RE.test(n)) throw new HttpError(400, 'Model name is not valid. Use an Ollama tag such as gemma3:4b');
    return n.includes(':') ? n : n + ':latest';
  };
  const ollamaOptions = (d) => ({ num_ctx: d.numCtx, temperature: d.temperature, ...(d.gpuMode === 'cpu' ? { num_gpu: 0 } : d.gpuMode === 'max' ? { num_gpu: 999 } : {}) });
  const keepAlive = (d) => (d.keepAlive === '-1' ? -1 : d.keepAlive);

  // ---------- live status (cached briefly per node) ----------
  const cache = new Map();
  const nodeInfo = (client) => {
    const hit = cache.get(client.base);
    if (hit && Date.now() - hit.t < 1500) return hit.p;
    const p = Promise.allSettled([client.ps(), client.tags()]).then(([ps, tags]) => ({
      ok: ps.status === 'fulfilled' && tags.status === 'fulfilled',
      error: ps.status === 'rejected' ? ps.reason.message : tags.status === 'rejected' ? tags.reason.message : null,
      ps: ps.value || [], tags: tags.value || [],
    }));
    cache.set(client.base, { t: Date.now(), p });
    return p;
  };
  const forget = (client) => cache.delete(client.base);
  // One row per inference call: numbers only, never prompt or answer text.
  app.recordMetric = (row) => {
    const ns = (x) => (x ? Math.round(x / 1e6) : 0);
    const f = row.fin || {};
    const evalMs = ns(f.eval_duration), promptMs = ns(f.prompt_eval_duration), loadMs = ns(f.load_duration);
    const m = {
      id: id('met'), ts: now(), orgId: row.orgId, deploymentId: row.deploymentId || null, model: row.model, kind: row.kind,
      userId: row.user ? row.user.id : null, role: row.user ? row.user.roleId : null, department: row.user ? row.user.department || '' : '',
      promptTokens: f.prompt_eval_count || 0, completionTokens: f.eval_count || 0,
      loadMs, promptEvalMs: promptMs, evalMs, totalMs: row.totalMs != null ? row.totalMs : ns(f.total_duration),
      ttftMs: row.ttftMs != null ? row.ttftMs : null,
      tps: evalMs > 0 ? Math.round(((f.eval_count || 0) / (evalMs / 1000)) * 10) / 10 : null,
      promptTps: promptMs > 0 ? Math.round(((f.prompt_eval_count || 0) / (promptMs / 1000)) * 10) / 10 : null,
      grounded: !!row.grounded, sources: row.sources || 0, docIds: row.docIds || [], ok: !row.error, error: row.error ? String(row.error).slice(0, 200) : null,
    };
    store.metrics.insert(m);
    if (store.metrics.items.length > 50000) store.metrics.items.splice(0, store.metrics.items.length - 50000);
    return m;
  };
  const nodeOf = (dep) => { try { return app.nodeFor(dep.orgId, dep.nodeId); } catch (_) { return null; } };

  async function view(dep, org) {
    const node = nodeOf(dep);
    let status = 'node_missing', extra = {}, error = dep.lastError || null;
    if (node) {
      const info = await nodeInfo(app.clientFor(node));
      if (!info.ok) { status = 'unreachable'; error = info.error; }
      else {
        const run = info.ps.find((m) => m.name === dep.model || m.model === dep.model);
        const installed = info.tags.some((t) => t.name === dep.model || t.model === dep.model);
        status = run ? 'running' : installed ? 'stopped' : 'model_missing';
        if (run) extra = { sizeBytes: run.size || 0, vramBytes: run.size_vram || 0, gpuShare: run.size ? Math.round(((run.size_vram || 0) / run.size) * 100) : null, expiresAt: run.expires_at || null };
      }
    }
    const bench = (dep.benchmarks || [])[0] || null;
    return { id: dep.id, orgId: dep.orgId, orgName: org ? org.name : undefined, name: dep.name, nodeId: dep.nodeId, nodeName: node ? node.name : '(removed node)', model: dep.model, numCtx: dep.numCtx, temperature: dep.temperature, keepAlive: dep.keepAlive, gpuMode: dep.gpuMode, systemPrompt: dep.systemPrompt, status, error, ...extra, stats: dep.stats, lastBenchmark: bench ? { at: bench.at, avgTps: bench.avgTps, avgLatencyMs: bench.avgLatencyMs } : null, createdAt: dep.createdAt, updatedAt: dep.updatedAt };
  }
  const viewAll = (deps) => Promise.all(deps.map((d) => view(d, store.orgs.get(d.orgId))));
  app.viewDeployments = viewAll;

  async function loadModel(dep) {
    const cl = app.clientFor(app.nodeFor(dep.orgId, dep.nodeId));
    try { await cl.generate({ model: dep.model, prompt: '', keep_alive: keepAlive(dep), options: ollamaOptions(dep) }); store.deployments.update(dep.id, { lastError: null }); }
    catch (e) { store.deployments.update(dep.id, { lastError: e.message }); throw e; }
    finally { forget(cl); }
  }
  async function unloadModel(dep) {
    const cl = app.clientFor(app.nodeFor(dep.orgId, dep.nodeId));
    try { await cl.generate({ model: dep.model, keep_alive: 0 }, 60000); } finally { forget(cl); }
  }
  const getDep = (ctx) => {
    const d = store.deployments.get(ctx.params.id);
    if (!d || d.orgId !== ctx.orgId) throw new HttpError(404, 'Deployment not found');
    return d;
  };

  // ---------- system and nodes ----------
  route('GET', '/api/system', 'infra.read', async () => {
    const snap = await snapshot();
    let ollama = { reachable: false, url: app.ollamaUrl };
    try {
      const [v, ps] = await Promise.all([app.local.version(), app.local.ps()]);
      ollama = { reachable: true, url: app.ollamaUrl, version: v.version, running: ps.map((m) => ({ name: m.name, sizeBytes: m.size, vramBytes: m.size_vram, expiresAt: m.expires_at })) };
    } catch (e) { ollama.error = e.message; }
    return { ...snap, ollama };
  });
  route('GET', '/api/system/history', 'infra.read', () => ({ intervalMs: app.sampler.intervalMs, samples: app.sampler.history }));

  route('GET', '/api/nodes', 'infra.read', async (ctx) => {
    const nodes = [app.localNode(), ...store.nodes.filter((n) => n.orgId === ctx.orgId)];
    return Promise.all(nodes.map(async (n) => {
      const info = await nodeInfo(app.clientFor(n));
      let version = null;
      if (info.ok) { try { version = (await app.clientFor(n).version()).version; } catch (_) { /* optional */ } }
      return { id: n.id, name: n.name, url: n.id === 'local' ? n.url : n.url, shared: !!n.shared, reachable: info.ok, error: info.error, version, models: info.tags.length, running: info.ps.map((m) => ({ name: m.name, vramBytes: m.size_vram || 0, sizeBytes: m.size || 0 })), deployments: store.deployments.filter((d) => d.nodeId === n.id && (n.id === 'local' ? d.orgId === ctx.orgId : true)).length };
    }));
  });
  route('POST', '/api/nodes', 'infra.manage', (ctx) => {
    const name = str(ctx.body.name, 60, 'Node name');
    let u;
    try { u = new URL(str(ctx.body.url, 200, 'URL')); } catch (_) { throw new HttpError(400, 'URL must look like http://10.0.0.5:11434'); }
    if (!['http:', 'https:'].includes(u.protocol)) throw new HttpError(400, 'URL must start with http:// or https://');
    const node = store.nodes.insert({ id: id('node'), orgId: ctx.orgId, name, url: u.origin, createdAt: now() });
    ctx.log('node.create', { type: 'node', id: node.id }, { name, url: node.url });
    return node;
  });
  route('DELETE', '/api/nodes/:id', 'infra.manage', (ctx) => {
    const n = store.nodes.get(ctx.params.id);
    if (!n || n.orgId !== ctx.orgId) throw new HttpError(404, 'Node not found');
    if (store.deployments.find((d) => d.nodeId === n.id)) throw new HttpError(409, 'Remove the deployments on this node first');
    store.nodes.remove(n.id);
    ctx.log('node.delete', { type: 'node', id: n.id }, { name: n.name });
    return { ok: true };
  });

  // ---------- models ----------
  route('GET', '/api/catalog', 'models.read', () => ({ defaultModel: DEFAULT_MODEL, models: CATALOG }));
  route('GET', '/api/models', 'models.read', async (ctx) => {
    const node = app.nodeFor(ctx.orgId, ctx.query.node);
    const cl = app.clientFor(node);
    const [tags, ps] = await Promise.all([cl.tags(), cl.ps().catch(() => [])]);
    return {
      node: { id: node.id, name: node.name },
      models: tags.map((t) => {
        const run = ps.find((m) => m.name === t.name || m.model === t.name);
        return { name: t.name, sizeBytes: t.size, modifiedAt: t.modified_at, digest: String(t.digest || '').slice(0, 12), family: (t.details || {}).family || null, params: (t.details || {}).parameter_size || null, quant: (t.details || {}).quantization_level || null, running: !!run, vramBytes: run ? run.size_vram || 0 : 0, usedBy: store.deployments.filter((d) => d.orgId === ctx.orgId && d.nodeId === node.id && d.model === t.name).length };
      }),
    };
  });
  route('GET', '/api/models/show', 'models.read', async (ctx) => {
    const node = app.nodeFor(ctx.orgId, ctx.query.node);
    const s = await app.clientFor(node).show(normTag(ctx.query.name));
    return { details: s.details || {}, capabilities: s.capabilities || [], parameters: s.parameters || '', license: String(s.license || '').slice(0, 800), modelInfo: Object.fromEntries(Object.entries(s.model_info || {}).filter(([k]) => /context_length|parameter_count|embedding_length|block_count/.test(k))) };
  });
  const pulls = new Set();
  route('POST', '/api/models/pull', 'models.manage', async (ctx) => {
    const name = normTag(ctx.body.name);
    const node = app.nodeFor(ctx.orgId, ctx.body.node);
    const cl = app.clientFor(node);
    const key = `${cl.base}|${name}`;
    if (pulls.has(key)) throw new HttpError(409, 'That model is already downloading');
    pulls.add(key);
    ctx.log('model.pull', { type: 'model', id: name }, { node: node.id, state: 'started' });
    const { res } = ctx;
    res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
    const ac = new AbortController();
    res.on('close', () => { if (!res.writableFinished) ac.abort(); });
    let ok = false, err = null;
    try {
      for await (const ev of cl.pullStream(name, ac.signal)) {
        if (ev.error) throw new Error(ev.error);
        if (ev.status === 'success') ok = true;
        res.write(JSON.stringify({ status: ev.status, total: ev.total, completed: ev.completed }) + '\n');
      }
      if (!ok) err = 'The download ended before Ollama confirmed success';
    } catch (e) { err = ac.signal.aborted ? 'Download cancelled' : e.message; }
    finally { pulls.delete(key); forget(cl); }
    ctx.log('model.pull', { type: 'model', id: name }, { node: node.id, state: ok ? 'completed' : 'failed', error: err || undefined }, ok ? 'ok' : 'error');
    if (err && !res.writableEnded) res.write(JSON.stringify({ error: err }) + '\n');
    if (!res.writableEnded) res.end();
  });
  route('DELETE', '/api/models', 'models.manage', async (ctx) => {
    const name = normTag(ctx.query.name);
    const node = app.nodeFor(ctx.orgId, ctx.query.node);
    if (store.deployments.find((d) => d.nodeId === node.id && d.model === name)) throw new HttpError(409, 'A deployment still uses this model. Delete or change that deployment first.');
    await app.clientFor(node).remove(name);
    forget(app.clientFor(node));
    ctx.log('model.delete', { type: 'model', id: name }, { node: node.id });
    return { ok: true };
  });

  // ---------- deployments ----------
  route('GET', '/api/deployments', 'deployments.read', async (ctx) => viewAll(store.deployments.filter((d) => d.orgId === ctx.orgId)));
  const readDepFields = (ctx, b, cur = {}) => {
    const out = {};
    if (b.name !== undefined || !cur.id) {
      out.name = str(b.name, 60, 'Name');
      if (store.deployments.find((d) => d.orgId === ctx.orgId && d.id !== cur.id && d.name.toLowerCase() === out.name.toLowerCase())) throw new HttpError(409, 'A deployment with that name already exists');
    }
    if (b.model !== undefined || !cur.id) out.model = normTag(b.model);
    if (b.node !== undefined || !cur.id) { const n = app.nodeFor(ctx.orgId, b.node); out.nodeId = n.id; }
    if (b.numCtx !== undefined || !cur.id) out.numCtx = Math.round(num(b.numCtx, 512, 262144, 'Context length', 4096));
    if (b.temperature !== undefined || !cur.id) out.temperature = num(b.temperature, 0, 2, 'Temperature', 0.7);
    if (b.keepAlive !== undefined || !cur.id) { const k = String(b.keepAlive ?? '30m'); if (!KEEP_RE.test(k)) throw new HttpError(400, 'Keep-alive must look like 30m, 2h or -1 (never unload)'); out.keepAlive = k; }
    if (b.gpuMode !== undefined || !cur.id) out.gpuMode = oneOf(b.gpuMode ?? 'auto', ['auto', 'cpu', 'max'], 'GPU mode');
    if (b.systemPrompt !== undefined || !cur.id) out.systemPrompt = str(b.systemPrompt, 4000, 'System prompt', { required: false });
    return out;
  };
  route('POST', '/api/deployments', 'deployments.manage', async (ctx) => {
    const f = readDepFields(ctx, ctx.body);
    const dep = store.deployments.insert({ id: id('dep'), orgId: ctx.orgId, ...f, lastError: null, stats: { requests: 0, promptTokens: 0, completionTokens: 0, lastUsedAt: null }, benchmarks: [], createdBy: ctx.user.id, createdAt: now(), updatedAt: now() });
    ctx.log('deployment.create', { type: 'deployment', id: dep.id }, { name: dep.name, model: dep.model, node: dep.nodeId, gpuMode: dep.gpuMode, numCtx: dep.numCtx });
    let startError = null;
    if (ctx.body.start) {
      try { await loadModel(dep); ctx.log('deployment.start', { type: 'deployment', id: dep.id }, { model: dep.model }); }
      catch (e) { startError = e.message; ctx.log('deployment.start', { type: 'deployment', id: dep.id }, { model: dep.model, error: e.message }, 'error'); }
    }
    return { ...(await view(store.deployments.get(dep.id), store.orgs.get(ctx.orgId))), startError };
  });
  route('PUT', '/api/deployments/:id', 'deployments.manage', async (ctx) => {
    const dep = getDep(ctx);
    const patch = readDepFields(ctx, ctx.body, dep);
    const before = {};
    for (const k of Object.keys(patch)) before[k] = dep[k];
    const wasRunning = (await view(dep)).status === 'running';
    const loadAffecting = ['model', 'nodeId', 'numCtx', 'gpuMode', 'keepAlive'].some((k) => k in patch && patch[k] !== dep[k]);
    if (wasRunning && loadAffecting) { try { await unloadModel(dep); } catch (_) { /* old settings may not reload */ } }
    store.deployments.update(dep.id, { ...patch, updatedAt: now() });
    ctx.log('deployment.update', { type: 'deployment', id: dep.id }, { before, after: patch });
    let restartError = null;
    if (wasRunning && loadAffecting) { try { await loadModel(store.deployments.get(dep.id)); } catch (e) { restartError = e.message; } }
    return { ...(await view(store.deployments.get(dep.id), store.orgs.get(ctx.orgId))), restartError };
  });
  route('DELETE', '/api/deployments/:id', 'deployments.manage', async (ctx) => {
    const dep = getDep(ctx);
    try { await unloadModel(dep); } catch (_) { /* node may be offline; still remove the record */ }
    store.deployments.remove(dep.id);
    ctx.log('deployment.delete', { type: 'deployment', id: dep.id }, { name: dep.name, model: dep.model });
    return { ok: true };
  });
  for (const action of ['start', 'stop', 'restart']) {
    route('POST', `/api/deployments/:id/${action}`, 'deployments.manage', async (ctx) => {
      const dep = getDep(ctx);
      try {
        if (action === 'stop' || action === 'restart') await unloadModel(dep);
        if (action === 'start' || action === 'restart') await loadModel(dep);
      } catch (e) {
        ctx.log(`deployment.${action}`, { type: 'deployment', id: dep.id }, { model: dep.model, error: e.message }, 'error');
        throw e;
      }
      ctx.log(`deployment.${action}`, { type: 'deployment', id: dep.id }, { model: dep.model });
      return view(store.deployments.get(dep.id), store.orgs.get(ctx.orgId));
    });
  }
  const benchRunning = new Set();
  route('POST', '/api/deployments/:id/benchmark', 'deployments.manage', async (ctx) => {
    const dep = getDep(ctx);
    if (benchRunning.has(dep.id)) throw new HttpError(409, 'A benchmark is already running for this deployment');
    benchRunning.add(dep.id);
    try {
      const cl = app.clientFor(app.nodeFor(dep.orgId, dep.nodeId));
      const results = [];
      for (let i = 0; i < BENCH_PROMPTS.length; i++) {
        const r = await cl.chat({ model: dep.model, messages: [{ role: 'user', content: BENCH_PROMPTS[i] }], keep_alive: keepAlive(dep), options: { ...ollamaOptions(dep), num_predict: 128 } });
        app.recordMetric({ orgId: dep.orgId, deploymentId: dep.id, model: dep.model, kind: 'benchmark', user: ctx.user, fin: r });
        const evalS = (r.eval_duration || 0) / 1e9;
        results.push({ prompt: i + 1, promptTokens: r.prompt_eval_count || 0, completionTokens: r.eval_count || 0, tps: evalS > 0 ? Math.round(((r.eval_count || 0) / evalS) * 10) / 10 : null, totalMs: Math.round((r.total_duration || 0) / 1e6), loadMs: Math.round((r.load_duration || 0) / 1e6) });
      }
      forget(cl);
      const tpsVals = results.map((r) => r.tps).filter((x) => x != null);
      const rec = { at: now(), by: ctx.user.username, results, avgTps: tpsVals.length ? Math.round((tpsVals.reduce((a, b) => a + b, 0) / tpsVals.length) * 10) / 10 : null, avgLatencyMs: Math.round(results.reduce((a, r) => a + r.totalMs, 0) / results.length) };
      store.deployments.update(dep.id, { benchmarks: [rec, ...(dep.benchmarks || [])].slice(0, 10) });
      ctx.log('deployment.benchmark', { type: 'deployment', id: dep.id }, { model: dep.model, avgTps: rec.avgTps, avgLatencyMs: rec.avgLatencyMs, note: 'speed benchmark only; it does not measure answer quality' });
      return rec;
    } catch (e) { ctx.log('deployment.benchmark', { type: 'deployment', id: dep.id }, { error: e.message }, 'error'); throw e; }
    finally { benchRunning.delete(dep.id); }
  }, { maxBody: 4096 });
  route('GET', '/api/deployments/:id/benchmarks', 'deployments.read', (ctx) => getDep(ctx).benchmarks || []);

  // ---------- knowledge ----------
  const canSee = (ctx, d) => d.orgId === ctx.orgId && (d.department === '*' || ctx.perms.includes('knowledge.all') || (ctx.user.department && d.department === ctx.user.department));
  app.canSeeDoc = canSee;
  const docView = (d, withText) => ({ id: d.id, title: d.title, department: d.department, chunks: d.chunks.length, chars: d.text.length, sha256: d.sha256, tags: d.tags || [], useFor: d.useFor || ['retrieval'], fileName: d.fileName || null, createdBy: d.createdBy, createdAt: d.createdAt, updatedAt: d.updatedAt || null, ...(withText ? { text: d.text } : {}) });
  route('GET', '/api/knowledge', 'knowledge.read', (ctx) => store.knowledge.filter((d) => canSee(ctx, d)).map((d) => docView(d)));
  route('GET', '/api/knowledge/:id', 'knowledge.read', (ctx) => {
    const d = store.knowledge.get(ctx.params.id);
    if (!d || !canSee(ctx, d)) throw new HttpError(404, 'Document not found');
    return docView(d, true);
  });
  route('POST', '/api/knowledge', 'knowledge.manage', (ctx) => {
    const title = str(ctx.body.title, 160, 'Title');
    const text = str(ctx.body.text, 300000, 'Text');
    let department = String(ctx.body.department ?? '*').trim().slice(0, 60) || '*';
    if (!ctx.perms.includes('knowledge.all')) {
      if (!ctx.user.department) throw new HttpError(403, 'Your account has no department, so you cannot add department documents');
      department = ctx.user.department;
    }
    const doc = store.knowledge.insert({ id: id('doc'), orgId: ctx.orgId, title, department, text, chunks: K.chunk(text), sha256: sha256(text), tags: app.cleanTags(ctx.body.tags), useFor: app.cleanUse(ctx.body.useFor), fileName: ctx.body.fileName ? String(ctx.body.fileName).slice(0, 160) : null, createdBy: ctx.user.username, createdAt: now() });
    ctx.log('knowledge.create', { type: 'document', id: doc.id }, { title, department, sha256: doc.sha256, chunks: doc.chunks.length, tags: doc.tags, useFor: doc.useFor });
    if (app.complianceReconcile) app.complianceReconcile(ctx); // a new document can meet compliance requirements
    return docView(doc);
  }, { maxBody: 2 * 1024 * 1024 });
  app.cleanTags = (t) => [...new Set((Array.isArray(t) ? t : String(t || '').split(',')).map((x) => String(x).trim().toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 30)).filter(Boolean))].slice(0, 12);
  app.cleanUse = (u) => { const v = (Array.isArray(u) ? u : ['retrieval']).filter((x) => ['retrieval', 'training'].includes(x)); return v.length ? v : ['retrieval']; };
  route('PUT', '/api/knowledge/:id', 'knowledge.manage', (ctx) => {
    const d = store.knowledge.get(ctx.params.id);
    if (!d || !canSee(ctx, d)) throw new HttpError(404, 'Document not found');
    if (!ctx.perms.includes('knowledge.all') && d.department !== ctx.user.department) throw new HttpError(403, 'You can only edit documents from your own department');
    const patch = {}, before = { title: d.title, tags: d.tags || [], useFor: d.useFor || ['retrieval'], department: d.department };
    if (ctx.body.title !== undefined) patch.title = str(ctx.body.title, 160, 'Title');
    if (ctx.body.tags !== undefined) patch.tags = app.cleanTags(ctx.body.tags);
    if (ctx.body.useFor !== undefined) patch.useFor = app.cleanUse(ctx.body.useFor);
    if (ctx.body.department !== undefined && ctx.perms.includes('knowledge.all')) patch.department = String(ctx.body.department).trim().slice(0, 60) || '*';
    store.knowledge.update(d.id, { ...patch, updatedAt: now() });
    ctx.log('knowledge.update', { type: 'document', id: d.id }, { title: patch.title || d.title, before, after: patch });
    return docView(store.knowledge.get(d.id));
  });
  route('DELETE', '/api/knowledge/:id', 'knowledge.manage', (ctx) => {
    const d = store.knowledge.get(ctx.params.id);
    if (!d || !canSee(ctx, d)) throw new HttpError(404, 'Document not found');
    if (!ctx.perms.includes('knowledge.all') && d.department !== ctx.user.department) throw new HttpError(403, 'You can only delete documents from your own department');
    store.knowledge.remove(d.id);
    ctx.log('knowledge.delete', { type: 'document', id: d.id }, { title: d.title, department: d.department, sha256: d.sha256 });
    return { ok: true };
  });

  // ---------- workspace: conversations and chat ----------
  route('GET', '/api/workspace/deployments', 'chat.use', async (ctx) => {
    const v = await viewAll(store.deployments.filter((d) => d.orgId === ctx.orgId));
    return v.map((d) => ({ id: d.id, name: d.name, model: d.model, status: d.status, gpuShare: d.gpuShare ?? null }));
  });
  route('GET', '/api/conversations', 'chat.use', (ctx) => store.conversations.filter((c) => c.userId === ctx.user.id).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).map((c) => ({ id: c.id, title: c.title, deploymentId: c.deploymentId, updatedAt: c.updatedAt, messages: c.messages.length })));
  route('GET', '/api/conversations/:id', 'chat.use', (ctx) => {
    const c = store.conversations.get(ctx.params.id);
    if (!c || c.userId !== ctx.user.id) throw new HttpError(404, 'Conversation not found');
    return c;
  });
  route('DELETE', '/api/conversations/:id', 'chat.use', (ctx) => {
    const c = store.conversations.get(ctx.params.id);
    if (!c || c.userId !== ctx.user.id) throw new HttpError(404, 'Conversation not found');
    store.conversations.remove(c.id);
    ctx.log('conversation.delete', { type: 'conversation', id: c.id }, { messages: c.messages.length });
    return { ok: true };
  });

  route('POST', '/api/chat', 'chat.use', async (ctx) => {
    const { res, user, orgId } = ctx, b = ctx.body;
    const message = str(b.message, 8000, 'Message');
    const dep = store.deployments.get(b.deploymentId);
    if (!dep || dep.orgId !== orgId) throw new HttpError(404, 'Choose a deployment to chat with');
    let conv = null;
    if (b.conversationId) { conv = store.conversations.get(b.conversationId); if (!conv || conv.userId !== user.id) throw new HttpError(404, 'Conversation not found'); }
    const st = (await view(dep)).status;
    if (st === 'unreachable') throw new HttpError(503, 'The inference node is not reachable');
    if (st === 'model_missing') throw new HttpError(409, `The model ${dep.model} is not installed on this node. Download it in Models first.`);
    const cl = app.clientFor(app.nodeFor(orgId, dep.nodeId));

    let sources = [];
    const useKnowledge = b.useKnowledge !== false && ctx.perms.includes('knowledge.read');
    if (useKnowledge) {
      const chunks = [];
      for (const d of store.knowledge.filter((x) => canSee(ctx, x) && (x.useFor || ['retrieval']).includes('retrieval'))) d.chunks.forEach((t, n) => chunks.push({ docId: d.id, title: d.title, n, text: t }));
      sources = K.search(chunks, message, 4).map((h, i) => ({ n: i + 1, docId: h.chunk.docId, title: h.chunk.title, excerpt: h.chunk.text.slice(0, 400), score: Math.round(h.score * 100) / 100 }));
    }
    let system = dep.systemPrompt || 'You are a careful assistant inside an organization\'s private AI workspace. Answer plainly and say when you are unsure.';
    if (sources.length) {
      const ctxText = sources.map((s) => `[${s.n}] (${s.title})\n${s.excerpt}`).join('\n\n');
      system += `\n\nUse the internal excerpts below when they help. Cite them as [1], [2]. If they do not answer the question, say so instead of guessing.\n\n${ctxText}`;
    }
    const history = conv ? conv.messages.slice(-12).map((m) => ({ role: m.role, content: m.content })) : [];
    const messages = [{ role: 'system', content: system }, ...history, { role: 'user', content: message }];

    res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
    const ev = (o) => { if (!res.writableEnded) res.write(JSON.stringify(o) + '\n'); };
    ev({ type: 'meta', sources: sources.map(({ n, docId, title, excerpt }) => ({ n, docId, title, excerpt })) });
    const ac = new AbortController();
    res.on('close', () => { if (!res.writableFinished) ac.abort(); });
    let out = '', fin = null, err = null, tFirst = null;
    const t0 = Date.now();
    try {
      for await (const e of cl.chatStream({ model: dep.model, messages, keep_alive: keepAlive(dep), options: ollamaOptions(dep) }, ac.signal)) {
        if (e.error) throw new Error(e.error);
        if (e.message && e.message.content) { if (tFirst === null) tFirst = Date.now(); out += e.message.content; ev({ type: 'token', t: e.message.content }); }
        if (e.done) fin = e;
      }
    } catch (e) { err = ac.signal.aborted ? 'stopped' : e.message; }
    forget(cl);
    const ts = now();
    if (!conv) conv = store.conversations.insert({ id: id('conv'), orgId, userId: user.id, title: message.slice(0, 60), deploymentId: dep.id, messages: [], createdAt: ts, updatedAt: ts });
    conv.messages.push({ role: 'user', content: message, ts });
    if (out) conv.messages.push({ role: 'assistant', content: out, ts: now(), sources: sources.map((s) => ({ n: s.n, docId: s.docId, title: s.title })), partial: !!err });
    store.conversations.update(conv.id, { updatedAt: now(), deploymentId: dep.id, messages: conv.messages });
    const pt = fin ? fin.prompt_eval_count || 0 : 0, ct = fin ? fin.eval_count || 0 : 0;
    const tps = fin && fin.eval_duration ? Math.round((ct / (fin.eval_duration / 1e9)) * 10) / 10 : null;
    const s = dep.stats || { requests: 0, promptTokens: 0, completionTokens: 0 };
    store.deployments.update(dep.id, { stats: { requests: s.requests + 1, promptTokens: s.promptTokens + pt, completionTokens: s.completionTokens + ct, lastUsedAt: now() } });
    // The ledger stores hashes of the prompt and answer, never their text.
    ctx.log('chat.completion', { type: 'deployment', id: dep.id }, { conversationId: conv.id, model: dep.model, promptSha256: sha256(message), responseSha256: out ? sha256(out) : null, promptTokens: pt, completionTokens: ct, knowledgeDocs: [...new Set(sources.map((x) => x.docId))], note: err ? `incomplete: ${err}` : undefined }, err && err !== 'stopped' ? 'error' : 'ok');
    app.recordMetric({ orgId, deploymentId: dep.id, model: dep.model, kind: 'chat', user, fin, totalMs: Date.now() - t0, ttftMs: tFirst ? tFirst - t0 : null, grounded: sources.length > 0, sources: sources.length, docIds: [...new Set(sources.map((x) => x.docId))], error: err && err !== 'stopped' ? err : null });
    if (err && err !== 'stopped') ev({ type: 'error', message: err });
    ev({ type: 'done', conversationId: conv.id, stats: { promptTokens: pt, completionTokens: ct, tokensPerSecond: tps, totalMs: Date.now() - t0 }, stopped: err === 'stopped' });
    if (!res.writableEnded) res.end();
  });

  // ---------- overview (customer) ----------
  route('GET', '/api/overview', 'auth', async (ctx) => {
    if (!ctx.orgId) return { operator: true };
    const { perms } = ctx;
    const has = (p) => perms.includes(p);
    const org = store.orgs.get(ctx.orgId);
    const out = { attention: [], setup: {} };
    const deps = store.deployments.filter((d) => d.orgId === ctx.orgId);
    const views = has('deployments.read') || has('chat.use') ? await viewAll(deps) : [];
    let ollama = null;
    try { ollama = { reachable: true, version: (await app.local.version()).version }; } catch (e) { ollama = { reachable: false, error: e.message }; }
    out.ollama = ollama;
    out.setup = { ollama: ollama.reachable, model: false, deployment: deps.length > 0, running: views.some((v) => v.status === 'running'), compliance: (org.jurisdictions || []).length > 0, team: store.users.filter((u) => u.orgId === ctx.orgId).length > 1 };
    try { out.setup.model = (await app.local.tags()).length > 0; } catch (_) { /* offline */ }
    if (has('deployments.read')) {
      out.deployments = { total: views.length, running: views.filter((v) => v.status === 'running').length, list: views.slice(0, 6) };
      out.usage = deps.reduce((a, d) => ({ requests: a.requests + (d.stats ? d.stats.requests : 0), tokens: a.tokens + (d.stats ? d.stats.completionTokens + d.stats.promptTokens : 0) }), { requests: 0, tokens: 0 });
      if (ollama.reachable && !views.length && has('deployments.manage')) out.attention.push({ level: 'info', text: 'No deployment yet. Download a model and create your first deployment.', link: '#/models' });
      views.filter((v) => v.status === 'stopped').forEach((v) => out.attention.push({ level: 'warn', text: `${v.name} is stopped`, link: '#/deployments' }));
      views.filter((v) => v.status === 'model_missing').forEach((v) => out.attention.push({ level: 'warn', text: `${v.name}: model ${v.model} is not installed on its node`, link: '#/models' }));
      views.filter((v) => v.status === 'unreachable').forEach((v) => out.attention.push({ level: 'bad', text: `${v.name}: node unreachable`, link: '#/infrastructure' }));
    }
    if (has('infra.read')) {
      const snap = await snapshot();
      const g = snap.gpu.gpus;
      out.gpu = { available: snap.gpu.available, reason: snap.gpu.reason, count: g.length, avgUtil: g.length ? Math.round(g.reduce((a, x) => a + (x.util || 0), 0) / g.length) : null, memUsedMiB: g.reduce((a, x) => a + (x.memUsedMiB || 0), 0), memTotalMiB: g.reduce((a, x) => a + (x.memTotalMiB || 0), 0) };
      out.cpu = snap.cpu; out.memory = snap.memory;
      if (!ollama.reachable) out.attention.push({ level: 'bad', text: 'Ollama is not reachable. Start it with: ollama serve', link: '#/infrastructure' });
    }
    if (has('models.read') && ollama.reachable) { try { out.models = (await app.local.tags()).length; } catch (_) { /* ignore */ } }
    if (has('compliance.read')) {
      const items = app.complianceItems(ctx.orgId);
      const C = require('./compliance');
      out.compliance = C.summarize(items);
      if (out.compliance.gaps) out.attention.push({ level: 'warn', text: `${out.compliance.gaps} mandatory obligations have no owner action yet`, link: '#/compliance' });
      if (out.compliance.needsEvidence) out.attention.push({ level: 'warn', text: `${out.compliance.needsEvidence} obligations marked implemented have no evidence`, link: '#/compliance' });
    }
    if (has('audit.read')) {
      const L = ledgers.for(ctx.orgId);
      const v = L.verify();
      out.ledger = { length: L.entries.length, head: L.head(), ok: v.ok, reason: v.reason, brokenAt: v.brokenAt };
      out.recent = L.list({ limit: 8 }).entries.map((e) => ({ ...e, text: app.describeEntry(e), who: app.whoOf(e) }));
      if (!v.ok) out.attention.unshift({ level: 'bad', text: `Audit ledger integrity check FAILED at entry ${v.brokenAt}: ${v.reason}`, link: '#/audit' });
    }
    return out;
  });

  // ---------- operations console (Vector operators) ----------
  route('GET', '/api/ops/overview', 'ops.view', async () => {
    const all = store.deployments.all();
    const views = await viewAll(all);
    const orgs = store.orgs.all().map((o) => {
      const v = views.filter((x) => x.orgId === o.id);
      return { id: o.id, name: o.name, industry: (D.INDUSTRIES.find((i) => i.id === o.industry) || {}).name || o.industry, deploymentType: o.deploymentType, disabled: !!o.disabled, users: store.users.filter((u) => u.orgId === o.id).length, deployments: v.length, running: v.filter((x) => x.status === 'running').length, unhealthy: v.filter((x) => ['unreachable', 'model_missing', 'node_missing'].includes(x.status)).length, requests: v.reduce((a, x) => a + (x.stats ? x.stats.requests : 0), 0) };
    });
    const snap = await snapshot();
    let ollama = { reachable: false };
    try { ollama = { reachable: true, version: (await app.local.version()).version, running: (await app.local.ps()).length }; } catch (e) { ollama.error = e.message; }
    const chains = ledgers.verifyAll().map((r) => ({ scope: r.scope, name: r.scope === 'platform' ? 'Platform' : (store.orgs.get(r.scope) || {}).name || r.scope, ok: r.ok, length: r.length, reason: r.reason, brokenAt: r.brokenAt, head: r.head }));
    return { orgs, deployments: views, system: { gpu: snap.gpu, cpu: snap.cpu, memory: snap.memory, hardware: snap.hardware, ollama }, chains };
  });
};
