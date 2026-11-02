#!/usr/bin/env node
'use strict';
// Creates two fictional sample customers (healthcare and education) and drives them through the real
// API: users, documents, deployments on your local Ollama model, compliance decisions with evidence,
// genuine chat traffic and AI compliance reviews. Every metric you then see comes from real calls to
// Ollama on this machine.
//
//   Stop the Vector server first (it shares the data directory), then:
//     node scripts/seed-samples.js [--traffic 4] [--ai 2] [--model gemma3:4b]
//   --traffic N  real chat questions per organization (0 to skip; slow on CPU-only machines)
//   --ai N       AI compliance reviews per organization (0 to skip)
//   SAMPLE_PASSWORD sets the password for every sample user.
const { createApp } = require('../lib/app');
const { randomPassword } = require('../lib/util');
const { HEALTH, EDU } = require('./sample-data');

/** Seeds the two demo customers into a running app (in-process or the live server) through its HTTP API. */
async function seed(app, base, { password, traffic = 4, ai = 2, model: forceModel = null, log = (...a) => console.log(' ', ...a) } = {}) {
  const TRAFFIC = traffic, AI = ai, FORCE_MODEL = forceModel;
  const jars = {};
  async function call(user, method, url, body, stream) {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', cookie: jars[user] || '' }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) jars[user] = sc.split(';')[0];
    if (stream) return r;
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${method} ${url}: ${data.error || r.status}`);
    return data;
  }
  const login = (u) => call(u, 'POST', '/api/auth/login', { username: u, password });

  // ---- Ollama model ----
  let model = FORCE_MODEL, ollamaOk = false, installed = [];
  try {
    installed = (await app.local.tags()).map((t) => t.name);
    const running = (await app.local.ps()).map((m) => m.name);
    ollamaOk = true;
    if (!model) model = running.find((n) => /gemma/i.test(n)) || running[0] || installed.find((n) => /gemma/i.test(n)) || installed[0] || 'gemma3:4b';
  } catch (e) { model = model || 'gemma3:4b'; }
  console.log(`\nOllama: ${ollamaOk ? 'reachable' : 'NOT reachable (deployments are created but cannot start; no traffic)'}${ollamaOk ? `, ${installed.length} model(s) installed` : ''}`);
  console.log(`Model for sample deployments: ${model}${ollamaOk && !installed.includes(model) ? ' (not installed: download it in Models, or pass --model)' : ''}\n`);
  const canRun = ollamaOk && installed.includes(model);

  for (const S of [HEALTH, EDU]) {
    if (app.store.orgs.find((o) => o.name === S.org.name)) { console.log(`${S.org.name} already exists, skipping.`); continue; }
    console.log(`${S.org.name}`);
    const { org } = app.createOrg({ ...S.org, ownerUsername: S.owner[0], ownerName: S.owner[1], ownerPassword: password, forceChange: false }, null);
    app.store.orgs.update(org.id, { demo: true });
    const owner = S.owner[0];
    await login(owner);
    for (const [username, displayName, roleId, department] of S.people) await call(owner, 'POST', '/api/users', { username, displayName, roleId, department, password });
    // created by an admin, so they would have to change it; samples skip that step
    S.people.forEach(([u]) => { const x = app.store.users.find((y) => y.username === u); app.store.users.update(x.id, { mustChange: false }); });
    log(`${S.people.length + 1} users`);
    for (const [title, department, text] of S.docs) await call(owner, 'POST', '/api/knowledge', { title, department, text, tags: S.tags[title] || '', useFor: S.training.includes(title) ? ['retrieval', 'training'] : ['retrieval'] });
    log(`${S.docs.length} documents`);

    const eng = S.people.find((p) => p[2] === 'ai_engineer')[0];
    await login(eng);
    const deps = [];
    for (const d of S.deployments) {
      const r = await call(eng, 'POST', '/api/deployments', { name: d.name, model, node: 'local', numCtx: 4096, temperature: d.temperature, gpuMode: 'auto', keepAlive: '2h', systemPrompt: d.systemPrompt, start: canRun });
      deps.push(r);
      log(`deployment ${d.name}: ${r.status}${r.startError ? ' (' + r.startError + ')' : ''}`);
    }

    // ---- compliance decisions grounded in the documents ----
    const co = S.people.find((p) => p[2] === 'compliance_officer')[0];
    await login(co);
    await call(co, 'POST', '/api/compliance/custom', S.custom);
    // the owner can open every document, so matches carry real titles (a compliance officer sees restricted ones redacted)
    const ins = await call(owner, 'GET', '/api/compliance/insights');
    const comp = await call(co, 'GET', '/api/compliance');
    const docsByTitle = new Map(S.docs.map(([t, , text]) => [t, text]));
    let impl = 0, prog = 0;
    for (const it of comp.items) {
      const s = ins.signals[it.id];
      const strong = s.docs.filter((d) => d.strength === 'strong');
      if (!strong.length) continue;
      const doc = strong[0];
      const implement = doc.score >= 14 && impl < Math.ceil(comp.items.length * 0.3);
      await call(co, 'PUT', `/api/compliance/${encodeURIComponent(it.id)}/status`, { status: implement ? 'implemented' : 'in_progress', ownerId: comp.owners.find((o) => o.name === S.people.find((p) => p[0] === co)[1]).id, note: `Sample decision: addressed by internal policy "${doc.title}". ${implement ? 'Controls confirmed in the annual review.' : 'Policy exists; operating evidence still to be collected.'}` });
      if (implement) {
        const text = docsByTitle.get(doc.title) || doc.excerpt;
        await call(co, 'POST', `/api/compliance/${encodeURIComponent(it.id)}/evidence`, { title: `Policy: ${doc.title}`, note: 'Approved policy document attached as evidence (sample).', fileName: doc.title.replace(/[^\w]+/g, '_') + '.txt', fileBase64: Buffer.from(text).toString('base64') });
        impl++;
      } else prog++;
    }
    log(`compliance: ${comp.items.length} obligations, ${impl} implemented with evidence, ${prog} in progress, rest open`);

    // ---- real traffic ----
    if (canRun && TRAFFIC > 0) {
      const qs = S.questions.slice(0, TRAFFIC);
      for (const [u, q] of qs) {
        if (!jars[u]) await login(u);
        const t0 = Date.now();
        const r = await call(u, 'POST', '/api/chat', { message: q, deploymentId: deps[0].id, useKnowledge: true }, true);
        const text = await r.text();
        const done = text.trim().split('\n').map((l) => JSON.parse(l)).find((e) => e.type === 'done') || {};
        const st = done.stats || {};
        log(`chat ${u.padEnd(15)} ${((Date.now() - t0) / 1000).toFixed(1)}s  ${st.completionTokens || 0} tok  ${st.tokensPerSecond || '-'} tok/s  "${q.slice(0, 50)}"`);
      }
    } else log('chat traffic skipped');

    // ---- AI compliance reviews ----
    if (canRun && AI > 0) {
      const ins2 = await call(owner, 'GET', '/api/compliance/insights');
      const comp2 = await call(co, 'GET', '/api/compliance');
      const picks = comp2.items.filter((i) => i.status !== 'implemented' && ins2.signals[i.id].docs.length && !ins2.signals[i.id].ai).slice(0, AI);
      for (const it of picks) {
        const t0 = Date.now();
        try { const a = await call(co, 'POST', `/api/compliance/${encodeURIComponent(it.id)}/assess`, { deploymentId: deps[1].id }); log(`AI review ${((Date.now() - t0) / 1000).toFixed(1)}s  ${a.verdict.padEnd(11)} ${it.title.slice(0, 60)}`); }
        catch (e) { log(`AI review failed: ${e.message}`); }
      }
    } else log('AI reviews skipped');

    // ---- compliance tasks assigned to people ----
    const people = (await call(co, 'GET', '/api/tasks')).people;
    for (const [title, ob, who, priority, days] of S.tasks) {
      const u = people.find((p) => p.name === (S.people.find((x) => x[0] === who) || [])[1]);
      try { await call(co, 'POST', '/api/tasks', { title, obligationId: ob, assigneeId: u ? u.id : null, priority, dueDate: new Date(Date.now() + days * 864e5).toISOString().slice(0, 10) }); } catch (e) { log('task skipped: ' + e.message); }
    }
    const mytasks = (await call(co, 'GET', '/api/tasks')).tasks;
    const firstAssignee = S.people.find((x) => x[0] === S.tasks[0][2])[0];
    if (mytasks[0] && firstAssignee) { await login(firstAssignee); const t = mytasks.find((x) => x.title === S.tasks[0][0]); if (t) { await call(firstAssignee, 'PUT', '/api/tasks/' + t.id, { status: 'in_progress' }); await call(firstAssignee, 'POST', `/api/tasks/${t.id}/comments`, { text: 'Started. Two vendors still to sign.' }).catch(() => {}); } }
    log(`${S.tasks.length} compliance tasks assigned`);

    // ---- compliance check: predefined requirements run against every document and entered value ----
    const dayStr = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
    for (const [ob, key, v] of S.compInputs || []) {
      try { await call(co, 'PUT', `/api/compliance/${encodeURIComponent(ob)}/requirements/${encodeURIComponent(key)}`, { value: typeof v === 'object' ? dayStr(v.days) : String(v) }); } catch (e) { log(`input skipped (${ob}/${key}): ${e.message}`); }
    }
    // Pulse leaves the check for the live demo (press "Run compliance check"); other tenants run it here.
    const chk = S.liveCheck ? await call(co, 'GET', '/api/compliance/requirements') : await call(co, 'POST', '/api/compliance/check', {});
    log(`compliance check${S.liveCheck ? ' (left for the live demo)' : ''}: ${chk.summary.met} of ${chk.summary.requirements} requirements met · ${chk.summary.complete} complete, ${chk.summary.partial} partial, ${chk.summary.pending} pending · ${chk.summary.docsNeeded} documents and ${chk.summary.inputsNeeded} values still needed`);
    const byCat = S.assignBy || {};
    const idOf = (u) => { const p = people.find((x) => x.name === (S.people.find((y) => y[0] === u) || [])[1]); return p ? p.id : null; };
    const items = chk.results.filter((r) => r.state !== 'na').flatMap((r) => r.reqs.filter((q) => q.status !== 'met' && !q.taskId).map((q) => ({ obligationId: r.id, key: q.key, assigneeId: idOf(byCat[r.category] || byCat.default || co), priority: q.status === 'expired' ? 'high' : 'medium', dueDate: dayStr(q.status === 'expired' ? 5 : 21) })));
    if (items.length && !S.liveCheck) { const a = await call(co, 'POST', '/api/compliance/check/assign', { items: items.filter((x) => x.assigneeId) }); log(`${a.created} pending requirements assigned as tasks`); }

    // ---- intelligence: evaluation set, feedback, training data, own model ----
    const ev = await call(eng, 'POST', '/api/evals', S.evals);
    if (canRun && TRAFFIC > 0) {
      const asker = S.questions[0][0];
      const convs = await call(asker, 'GET', '/api/conversations');
      if (convs[0]) await call(asker, 'POST', `/api/conversations/${convs[0].id}/feedback`, { messageIndex: 1, rating: 'up', share: true, note: 'Clear and cited the right policy' }).catch(() => {});
      const fb = await call(eng, 'GET', '/api/feedback');
      if (fb[0] && fb[0].shared) await call(eng, 'POST', '/api/training', { feedbackId: fb[0].id }).catch(() => {});
    }
    if (canRun && AI > 0) {
      const run = await call(eng, 'POST', `/api/evals/${ev.id}/run`, { deploymentId: deps[0].id });
      let r = run; const t0 = Date.now();
      while (r.status === 'running' && Date.now() - t0 < 30 * 60 * 1000) { await new Promise((z) => setTimeout(z, 1500)); r = await call(eng, 'GET', '/api/evalruns/' + run.id); }
      log(`evaluation "${S.evals.name}" on ${model}: ${r.score ?? '-'}% (${r.passed}/${r.total} passed)`);
      const docs = await call(eng, 'GET', '/api/knowledge');
      const tdoc = docs.find((d) => d.title === S.training[0]);
      if (tdoc) {
        const job = await call(eng, 'POST', '/api/training/generate', { docId: tdoc.id, deploymentId: deps[0].id, count: 4 });
        let j = job; const t1 = Date.now();
        while (j.status === 'running' && Date.now() - t1 < 15 * 60 * 1000) { await new Promise((z) => setTimeout(z, 1500)); j = await call(eng, 'GET', '/api/jobs/' + job.id); }
        log(`training data: ${j.message}`);
        const pend = (await call(eng, 'GET', '/api/training')).filter((t) => t.status === 'pending').slice(0, 2);
        for (const t of pend) await call(eng, 'PUT', '/api/training/' + t.id, { status: 'approved' });
        if (pend.length) log(`training data: ${pend.length} examples approved`);
      }
      try {
        const cm = await call(eng, 'POST', '/api/models/create', { name: S.org.name.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '') + '-assistant:v1', from: model, system: S.deployments[0].systemPrompt, includeTraining: true, temperature: 0.3, numCtx: 4096 });
        log(`own model built: ${cm.name} (${cm.examples || 0} approved examples)`);
        const od = await call(eng, 'POST', '/api/deployments', { name: S.org.name.split(' ')[0] + ' Assistant (own model)', model: cm.name, node: 'local', numCtx: 4096, temperature: 0.3, gpuMode: 'auto', keepAlive: '2h', systemPrompt: S.deployments[0].systemPrompt, start: true });
        log(`own model deployed: ${od.name} (${od.status})`);
        // applications on the organization's own model
        const apps = await call(owner, 'GET', '/api/apps');
        for (const appId of S.appDemos || []) {
          const ap = apps.find((x) => x.id === appId); if (!ap) continue;
          const t0 = Date.now();
          try { await call(owner, 'POST', `/api/apps/${appId}/run`, { deploymentId: od.id, inputs: ap.example }); log(`application "${ap.name}" ran on ${cm.name} in ${((Date.now() - t0) / 1000).toFixed(1)}s`); } catch (e) { log(`application ${appId} failed: ${e.message}`); }
        }
      } catch (e) { log(`own model not built: ${e.message}`); }
    }

    // favourite cards so Home shows them on first sign-in
    for (const u of [S.owner[0], ...S.people.map((p) => p[0])]) { const x = app.store.users.find((y) => y.username === u); if (x) app.store.users.update(x.id, { favorites: S.favorites || [] }); }
    const sec = S.people.find((p) => p[2] === 'security_admin')[0];
    await login(sec);
    await call(sec, 'GET', '/api/ledger/verify');
    const anc = await call(sec, 'POST', '/api/ledger/anchors', { note: 'Initial anchor after sample setup' });
    log(`ledger anchored at entry ${anc.index}, head ${anc.hash.slice(0, 16)}…`);
    void org;
    console.log('');
  }
  return { password };
}

async function main() {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  const port = Number(process.env.PORT) || 8080;
  try { const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(800) }); if (r.ok) { console.error(`\nA Vector server is running on port ${port}. Stop it first (Ctrl+C), then run this script again.\n`); process.exit(1); } } catch (_) { /* not running: good */ }
  const app = createApp();
  const op = app.bootstrap();
  const addr = await app.start(0, '127.0.0.1');
  const password = process.env.SAMPLE_PASSWORD || randomPassword() + 'A1';
  await seed(app, `http://127.0.0.1:${addr.port}`, { password, traffic: Number(arg('traffic', 4)), ai: Number(arg('ai', 2)), model: arg('model', null) });
  await app.close();
  console.log(`Password for every sample user: ${password}\n`);
  console.log('  Healthcare:  pe.owner (owner), pe.compliance, pe.nurse, pe.security, pe.auditor ...');
  console.log('  Education:   lu.owner (owner), lu.compliance, lu.faculty, lu.registrar, lu.auditor ...');
  if (op) console.log(`\n  Operator account: operator / ${op.password}`);
  console.log('\nStart the server with npm start and open http://127.0.0.1:8080/app/\n');
}
module.exports = { seed };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
