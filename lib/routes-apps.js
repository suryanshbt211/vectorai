'use strict';
// Running applications on the organization's own models, plus per-user favourite cards.
const { HttpError, id, now, sha256, str } = require('./util');
const K = require('./knowledge');
const A = require('./apps');
const { hardware } = require('./hardware');

module.exports = function (app) {
  const { store, route } = app;
  const view = (a) => ({ id: a.id, name: a.name, category: a.category, kind: a.kind, icon: a.icon, summary: a.summary, inputs: a.inputs, example: a.example, review: a.review, grounded: !!a.grounding || a.run === 'phi', format: a.format || 'markdown', groundingDoc: typeof a.grounding === 'string' ? a.grounding : null });
  const appsFor = (ctx) => { const org = store.orgs.get(ctx.orgId); return org ? A.forIndustry(org.industry) : []; };

  route('GET', '/api/apps', 'chat.use', (ctx) => appsFor(ctx).map(view));

  function sources(ctx, a, query) {
    if (!a.grounding) return [];
    const docs = store.knowledge.filter((d) => app.canSeeDoc(ctx, d));
    const chunks = [];
    const pinned = typeof a.grounding === 'string' ? docs.find((d) => d.title.toLowerCase().includes(a.grounding.toLowerCase())) : null;
    for (const d of docs) d.chunks.forEach((t, n) => chunks.push({ docId: d.id, title: d.title, n, text: t }));
    const hits = K.search(chunks, query, 4).map((h) => h.chunk);
    const out = pinned ? pinned.chunks.slice(0, 3).map((t, n) => ({ docId: pinned.id, title: pinned.title, n, text: t })) : [];
    for (const h of hits) if (!out.some((o) => o.docId === h.docId && o.n === h.n) && out.length < 5) out.push(h);
    return out;
  }
  const parseJson = (t) => { try { return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch (_) { return null; } };

  route('POST', '/api/apps/:id/run', 'chat.use', async (ctx) => {
    const a = appsFor(ctx).find((x) => x.id === ctx.params.id);
    if (!a) throw new HttpError(404, 'Application not available for this organization');
    const inputs = {};
    for (const f of a.inputs) inputs[f.key] = str(ctx.body.inputs && ctx.body.inputs[f.key], 20000, f.label, { required: f.type === 'textarea' });
    const dep = store.deployments.get(ctx.body.deploymentId);
    if (!dep || dep.orgId !== ctx.orgId) throw new HttpError(400, 'Choose a model to run on');
    const cl = app.clientFor(app.nodeFor(ctx.orgId, dep.nodeId));
    const opts = { num_ctx: Math.max(dep.numCtx || 4096, 4096), temperature: a.format === 'json' ? 0.1 : 0.3, ...(dep.gpuMode === 'cpu' ? { num_gpu: 0 } : dep.gpuMode === 'max' ? { num_gpu: 999 } : {}) };
    const keep = dep.keepAlive === '-1' ? -1 : dep.keepAlive;
    const t0 = Date.now();
    let result, fin = null, used = [];
    try {
      if (a.run === 'phi') {
        const det = A.redactPHI(inputs.text);
        // model pass: names or identifiers the patterns missed
        const r = await cl.chat({ model: dep.model, format: 'json', keep_alive: keep, options: { ...opts, num_predict: 300 }, messages: [{ role: 'system', content: 'You find personal identifiers that remain in de-identified clinical text: person names, family member names, facility-unique IDs, geographic subdivisions smaller than a state. Reply with JSON only.' }, { role: 'user', content: `Text:\n${det.text}\n\nReply as JSON: {"remaining":[{"type":"Name|ID|Location|Other","value":"exact text"}]}` }] });
        fin = r;
        const j = parseJson((r.message && r.message.content) || '') || {};
        let text = det.text; const extra = [];
        for (const x of Array.isArray(j.remaining) ? j.remaining : []) {
          const v = String(x.value || '').trim();
          if (v.length >= 3 && !/^\[/.test(v) && text.includes(v)) { text = text.split(v).join(`[${String(x.type || 'OTHER').toUpperCase().replace(/[^A-Z]+/g, '_')}]`); extra.push({ type: (x.type || 'Other') + ' (model)', value: v }); }
        }
        const all = det.found.concat(extra);
        const byType = {}; all.forEach((f) => { byType[f.type] = (byType[f.type] || 0) + 1; });
        result = { kind: 'redaction', text, identifiers: all.length, byType, rulesFound: det.found.length, modelFound: extra.length };
      } else {
        const query = Object.values(inputs).join(' ');
        used = sources(ctx, a, query);
        const sys = a.system + (used.length ? `\n\nInternal excerpts (cite as [1], [2]):\n\n${used.map((s, i) => `[${i + 1}] (${s.title})\n${s.text.slice(0, 1200)}`).join('\n\n')}` : '');
        const r = await cl.chat({ model: dep.model, keep_alive: keep, ...(a.format === 'json' ? { format: 'json' } : {}), options: { ...opts, num_predict: 900 }, messages: [{ role: 'system', content: sys }, { role: 'user', content: a.prompt(inputs) }] });
        fin = r;
        const text = (r.message && r.message.content) || '';
        result = a.format === 'json' ? { kind: 'json', data: parseJson(text), raw: text } : { kind: 'markdown', text };
      }
    } catch (e) {
      app.recordMetric({ orgId: ctx.orgId, deploymentId: dep.id, model: dep.model, kind: 'app', user: ctx.user, fin: null, totalMs: Date.now() - t0, error: e.message });
      ctx.log('app.run', { type: 'app', id: a.id }, { app: a.name, model: dep.model, error: e.message }, 'error');
      throw e;
    }
    const m = app.recordMetric({ orgId: ctx.orgId, deploymentId: dep.id, model: dep.model, kind: 'app', user: ctx.user, fin, totalMs: Date.now() - t0, grounded: used.length > 0, sources: used.length, docIds: [...new Set(used.map((s) => s.docId))] });
    const outText = JSON.stringify(result);
    const run = { id: id('arun'), orgId: ctx.orgId, userId: ctx.user.id, appId: a.id, appName: a.name, model: dep.model, deploymentName: dep.name, inputs, result, sources: used.map((s, i) => ({ n: i + 1, docId: s.docId, title: s.title })), ms: m.totalMs, tps: m.tps, tokens: m.completionTokens, ts: now() };
    store.appruns.insert(run);
    const mine = store.appruns.filter((r) => r.userId === ctx.user.id);
    if (mine.length > 30) store.appruns.removeWhere((r) => r.userId === ctx.user.id && r.ts < mine.sort((x, y) => (x.ts < y.ts ? 1 : -1))[29].ts);
    ctx.log('app.run', { type: 'app', id: a.id }, { app: a.name, model: dep.model, inputSha256: sha256(JSON.stringify(inputs)), outputSha256: sha256(outText), sources: run.sources.length, tokens: m.completionTokens });
    return { ...run, review: a.review };
  }, { maxBody: 256 * 1024 });

  route('GET', '/api/apps/runs', 'chat.use', (ctx) => store.appruns.filter((r) => r.userId === ctx.user.id && (!ctx.query.appId || r.appId === ctx.query.appId)).sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 20));
  route('GET', '/api/apps/stats', 'deployments.read', (ctx) => {
    const runs = store.metrics.filter((m) => m.orgId === ctx.orgId && m.kind === 'app');
    return { runs: runs.length, byApp: store.appruns.filter((r) => r.orgId === ctx.orgId).reduce((a, r) => { a[r.appName] = (a[r.appName] || 0) + 1; return a; }, {}) };
  });

  // ---------- personal AI: the organization's own model and the physical machine it runs on ----------
  route('GET', '/api/personal-ai', 'auth', async (ctx) => {
    if (!ctx.orgId) throw new HttpError(403, 'Only available inside an organization');
    const custom = store.custommodels.filter((m) => m.orgId === ctx.orgId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const deps = store.deployments.filter((d) => d.orgId === ctx.orgId);
    const docs = store.knowledge.filter((d) => d.orgId === ctx.orgId);
    const runs = store.evalruns.filter((r) => r.orgId === ctx.orgId && r.status === 'done').sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
    const own = custom[0] || null;
    const ownDep = own ? deps.find((d) => d.model === own.name) : null;
    let installed = [], running = [], reachable = false, version = null;
    try { [installed, running] = await Promise.all([app.local.tags(), app.local.ps()]); version = (await app.local.version()).version; reachable = true; } catch (_) { /* offline */ }
    const hw = await hardware();
    let host = ''; try { host = new URL(app.ollamaUrl).hostname; } catch (_) { /* keep empty */ }
    const local = ['127.0.0.1', 'localhost', '::1'].includes(host);
    return {
      internal: {
        ownModel: own ? { name: own.name, from: own.from, createdAt: own.createdAt, examples: own.examples || 0, docs: own.docIds.length } : null,
        deployment: ownDep ? { name: ownDep.name, requests: ownDep.stats ? ownDep.stats.requests : 0 } : null,
        baseModels: [...new Set(deps.map((d) => d.model))],
        documents: docs.length, trainingDocs: docs.filter((d) => (d.useFor || []).includes('training')).length,
        trainingApproved: store.trainitems.filter((t) => t.orgId === ctx.orgId && t.status === 'approved').length,
        bestEval: runs.length ? Math.max(...runs.map((r) => r.score)) : null, lastEval: runs[0] ? { score: runs[0].score, model: runs[0].model, at: runs[0].startedAt } : null,
        requests: store.metrics.filter((m) => m.orgId === ctx.orgId).length,
      },
      physical: {
        summary: hw.summary, deviceType: hw.deviceType, vendor: hw.vendor, model: hw.model, cpu: hw.cpu, memoryBytes: hw.memoryBytes, gpus: hw.gpus, accelerator: hw.accelerator, osName: hw.osName,
        runtime: { name: 'Ollama', version, reachable, endpoint: app.ollamaUrl, local },
        modelsOnDisk: installed.length, diskBytes: installed.reduce((a, m) => a + (m.size || 0), 0), loaded: running.map((m) => ({ name: m.name, sizeBytes: m.size || 0, vramBytes: m.size_vram || 0 })),
      },
    };
  });

  // ---------- favourite cards (per user) ----------
  route('GET', '/api/me/favorites', 'auth', (ctx) => ctx.user.favorites || []);
  route('PUT', '/api/me/favorites', 'auth', (ctx) => {
    const fav = (Array.isArray(ctx.body.favorites) ? ctx.body.favorites : []).map((x) => String(x).slice(0, 60)).filter((x) => /^[a-z0-9:_-]+$/i.test(x)).slice(0, 40);
    store.users.update(ctx.user.id, { favorites: [...new Set(fav)] });
    return store.users.get(ctx.user.id).favorites;
  });
};
