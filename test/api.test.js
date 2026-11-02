'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startMock } = require('../scripts/mock-ollama');

process.env.VECTOR_OPERATOR_PASSWORD = 'operator-pass-123';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vector-test-'));
const fakeSmi = path.join(dir, 'fake-nvidia-smi.sh');
fs.writeFileSync(fakeSmi, '#!/bin/sh\necho "0, NVIDIA Test GPU, 37, 4096, 24576, 55, 120.5, 300.00, 555.12"\necho "1, NVIDIA Test GPU, 12, 1024, 24576, 41, 80.1, 300.00, 555.12"\n', { mode: 0o755 });
process.env.VECTOR_NVIDIA_SMI = fakeSmi;
const { createApp } = require('../lib/app');

let mock, app, base;
class Client {
  constructor() { this.cookie = ''; }
  async req(method, url, body, raw) {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', cookie: this.cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    for (const c of sc) { const m = /^vsid=([^;]*)/.exec(c); if (m) this.cookie = m[1] ? 'vsid=' + m[1] : ''; }
    const text = await r.text();
    if (raw) return { status: r.status, text, headers: r.headers };
    let json = null; try { json = JSON.parse(text); } catch (_) { /* not json */ }
    return { status: r.status, json, text, headers: r.headers };
  }
  get(u) { return this.req('GET', u); }
  post(u, b) { return this.req('POST', u, b || {}); }
  put(u, b) { return this.req('PUT', u, b || {}); }
  del(u) { return this.req('DELETE', u); }
  async activate(username, temp) { await this.login(username, temp); const r = await this.post('/api/auth/password', { current: temp, next: temp + '-x' }); assert.equal(r.status, 200, r.text); }
  async login(username, password) { const r = await this.post('/api/auth/login', { username, password }); assert.equal(r.status, 200, `login ${username}: ${r.text}`); return r.json; }
}
const ndjson = (t) => t.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

test.before(async () => {
  mock = await startMock(0, { preinstalled: [] });
  app = createApp({ dataDir: path.join(dir, 'data'), ollamaUrl: mock.url });
  app.bootstrap();
  const addr = await app.start(0, '127.0.0.1');
  base = `http://127.0.0.1:${addr.port}`;
});
test.after(async () => { await app.close(); await mock.close(); });

const S = {}; // shared state across ordered tests

test('static: landing page at / and product shell at /app/', async () => {
  const c = new Client();
  const site = await c.req('GET', '/', null, true);
  assert.equal(site.status, 200); assert.match(site.text, /AI that your organization/);
  const shell = await c.req('GET', '/app/', null, true);
  assert.equal(shell.status, 200); assert.match(shell.text, /<div id="root"/);
  const trav = await c.req('GET', '/app/..%2f..%2fserver.js', null, true);
  assert.notEqual(trav.status, 200, 'path traversal must not serve files');
  assert.ok(site.headers.get('x-content-type-options') === 'nosniff');
});

test('auth: wrong password is rejected, repeated failures lock out, API needs a session', async () => {
  const c = new Client();
  assert.equal((await c.get('/api/me')).status, 401);
  let last;
  for (let i = 0; i < 5; i++) last = await c.post('/api/auth/login', { username: 'ghost', password: 'nope-nope-nope' });
  assert.equal(last.status, 401);
  assert.equal((await c.post('/api/auth/login', { username: 'ghost', password: 'nope-nope-nope' })).status, 429);
});

test('operator creates an organization; owner must change the temporary password', async () => {
  S.op = new Client();
  const me = await S.op.login('operator', 'operator-pass-123');
  assert.equal(me.scope, 'platform'); assert.ok(me.perms.includes('orgs.manage'));
  const r = await S.op.post('/api/orgs', { name: 'Acme Logistics', industry: 'logistics', jurisdictions: ['IN', 'IN-MH', 'US', 'US-TX'], ownerUsername: 'acme.owner', ownerName: 'Acme Owner' });
  assert.equal(r.status, 200, r.text);
  S.orgA = r.json.org; assert.ok(r.json.tempPassword);
  S.owner = new Client();
  await S.owner.login('acme.owner', r.json.tempPassword);
  const blocked = await S.owner.get('/api/users');
  assert.equal(blocked.status, 403); assert.equal(blocked.json.code, 'password_change_required');
  assert.equal((await S.owner.post('/api/auth/password', { current: r.json.tempPassword, next: 'short' })).status, 400);
  assert.equal((await S.owner.post('/api/auth/password', { current: r.json.tempPassword, next: 'Owner-new-pass-1' })).status, 200);
  assert.equal((await S.owner.get('/api/users')).status, 200);
});

test('RBAC: roles gate every action, escalation is blocked, denials are ledgered', async () => {
  const mk = async (username, roleId, department) => {
    const r = await S.owner.post('/api/users', { username, displayName: username, roleId, department, password: 'Password-12345' });
    assert.equal(r.status, 200, r.text);
    const c = new Client(); await c.activate(username, 'Password-12345'); return c;
  };
  S.eng = await mk('acme.eng', 'ai_engineer', 'IT');
  S.emp = await mk('acme.emp', 'employee', 'Operations');
  S.hr = await mk('acme.hr', 'employee', 'HR');
  S.sec = await mk('acme.sec', 'security_admin', 'IT');
  S.comp = await mk('acme.comp', 'compliance_officer', 'Compliance');
  S.aud = await mk('acme.aud', 'auditor', '');
  S.plat = await mk('acme.plat', 'platform_admin', 'IT');
  S.dept = await mk('acme.dept', 'dept_admin', 'Operations');

  assert.equal((await S.emp.post('/api/deployments', { name: 'x', model: 'gemma3:4b' })).status, 403);
  assert.equal((await S.emp.get('/api/users')).status, 403);
  assert.equal((await S.aud.post('/api/users', { username: 'zz.zz', displayName: 'z', roleId: 'employee' })).status, 403);
  assert.equal((await S.plat.post('/api/users', { username: 'zz.zz', displayName: 'z', roleId: 'employee' })).status, 403, 'platform admin lacks users.manage');
  const esc = await S.sec.post('/api/users', { username: 'sneaky', displayName: 's', roleId: 'owner' });
  assert.equal(esc.status, 403, 'security admin cannot mint an owner');
  assert.equal((await S.sec.post('/api/users', { username: 'sneaky2', displayName: 's', roleId: 'operator' })).status, 403);
  const cr = await S.sec.post('/api/roles', { name: 'Too Big', perms: ['models.manage'] });
  assert.equal(cr.status, 403, 'cannot grant perms you do not hold');
  const ok = await S.sec.post('/api/roles', { name: 'Log Viewer', perms: ['audit.read'] });
  assert.equal(ok.status, 200, ok.text);
  assert.equal((await S.owner.post('/api/users', { username: 'acme.viewer', displayName: 'v', roleId: ok.json.id, password: 'Password-12345' })).status, 200);
  const led = await S.aud.get('/api/ledger?outcome=denied');
  assert.ok(led.json.entries.some((e) => e.action === 'access.denied'), 'denied attempts are in the ledger');
  assert.equal((await S.owner.del('/api/users/' + (await S.owner.get('/api/users')).json.find((u) => u.username === 'acme.owner').id)).status, 400, 'cannot delete yourself');
});

test('last active owner is protected', async () => {
  const users = (await S.owner.get('/api/users')).json;
  const ownerId = users.find((u) => u.username === 'acme.owner').id;
  assert.equal((await S.owner.put('/api/users/' + ownerId, { disabled: true })).status, 400);
  const second = await S.owner.post('/api/users', { username: 'acme.owner2', displayName: 'Second', roleId: 'owner', password: 'Password-12345' });
  assert.equal(second.status, 200);
  const o2 = new Client(); await o2.activate('acme.owner2', 'Password-12345');
  assert.equal((await o2.put('/api/users/' + ownerId, { disabled: true })).status, 200);
  assert.equal((await o2.put('/api/users/' + ownerId, { disabled: false })).status, 200);
  assert.equal((await S.owner.get('/api/users')).status, 401, 'disabling a user ends their session');
  await S.owner.login('acme.owner', 'Owner-new-pass-1');
  const del = await o2.del('/api/users/' + second.json.user.id);
  assert.equal(del.status, 400);
});

test('system: GPU stats come from nvidia-smi; catalog lists Gemma; Ollama reachable', async () => {
  const sys = (await S.plat.get('/api/system')).json;
  assert.equal(sys.gpu.available, true); assert.equal(sys.gpu.gpus.length, 2);
  assert.equal(sys.gpu.gpus[0].util, 37); assert.equal(sys.gpu.gpus[0].memTotalMiB, 24576);
  assert.equal(sys.ollama.reachable, true);
  const cat = (await S.eng.get('/api/catalog')).json;
  assert.ok(cat.models.some((m) => m.tag === 'gemma3:4b') && cat.models.some((m) => m.tag.startsWith('gemma4:')));
  assert.equal((await S.emp.get('/api/system')).status, 403);
  const h = (await S.plat.get('/api/system/history')).json;
  assert.ok(Array.isArray(h.samples));
});

test('models: pull streams progress, appears in list, bad pulls report errors, RBAC enforced', async () => {
  assert.equal((await S.emp.post('/api/models/pull', { name: 'gemma3:4b' })).status, 403);
  const p = await S.eng.req('POST', '/api/models/pull', { name: 'gemma3:4b' }, true);
  const ev = ndjson(p.text);
  assert.equal(p.status, 200);
  assert.ok(ev.some((e) => e.completed === 400) && ev[ev.length - 1].status === 'success');
  const list = (await S.eng.get('/api/models')).json;
  assert.ok(list.models.find((m) => m.name === 'gemma3:4b'));
  const bad = ndjson((await S.eng.req('POST', '/api/models/pull', { name: 'failing-model' }, true)).text);
  assert.ok(bad.some((e) => e.error), 'failure surfaced');
  assert.equal((await S.eng.post('/api/models/pull', { name: 'bad name; rm -rf' })).status, 400);
  const show = (await S.eng.get('/api/models/show?name=gemma3:4b')).json;
  assert.equal(show.details.family, 'gemma3');
});

test('deployments: create+start uses the model, status reflects GPU use, stop/restart, config validation', async () => {
  assert.equal((await S.eng.post('/api/deployments', { name: 'Bad', model: 'gemma3:4b', numCtx: 5 })).status, 400);
  assert.equal((await S.eng.post('/api/deployments', { name: 'Bad', model: 'gemma3:4b', keepAlive: 'forever' })).status, 400);
  const d = await S.eng.post('/api/deployments', { name: 'Ops Assistant', model: 'gemma3:4b', start: true, gpuMode: 'max', numCtx: 4096 });
  assert.equal(d.status, 200, d.text);
  assert.equal(d.json.status, 'running'); assert.equal(d.json.gpuShare, 100);
  S.dep = d.json;
  const gen = mock.state.calls.filter((c) => c.url === '/api/generate').pop();
  assert.equal(gen.body.options.num_gpu, 999, 'GPU mode max is passed to Ollama');
  assert.equal((await S.eng.post('/api/deployments', { name: 'ops assistant', model: 'gemma3:4b' })).status, 409, 'unique names');
  assert.equal((await S.eng.post(`/api/deployments/${S.dep.id}/stop`)).json.status, 'stopped');
  assert.equal((await S.eng.post(`/api/deployments/${S.dep.id}/start`)).json.status, 'running');
  assert.equal((await S.eng.post(`/api/deployments/${S.dep.id}/restart`)).json.status, 'running');
  const cpu = await S.eng.put(`/api/deployments/${S.dep.id}`, { gpuMode: 'cpu' });
  assert.equal(cpu.json.gpuShare, 0, 'CPU-only mode reloads with no VRAM share');
  await S.eng.put(`/api/deployments/${S.dep.id}`, { gpuMode: 'max' });
  const bench = await S.eng.post(`/api/deployments/${S.dep.id}/benchmark`);
  assert.equal(bench.status, 200, bench.text);
  assert.equal(bench.json.results.length, 3); assert.ok(bench.json.avgTps > 0);
  assert.equal((await S.eng.del('/api/models?name=gemma3:4b')).status, 409, 'cannot delete a model that a deployment uses');
});

test('knowledge: documents are department-scoped, and retrieval never leaks across departments', async () => {
  assert.equal((await S.emp.post('/api/knowledge', { title: 'x', text: 'y' })).status, 403);
  const ops = await S.dept.post('/api/knowledge', { title: 'Shipping procedure', department: 'HR', text: 'Customs records are retained for five years. Dispatch files shipping papers within one day.' });
  assert.equal(ops.status, 200); assert.equal(ops.json.department, 'Operations', 'dept admin is forced into own department');
  const hrDoc = await S.eng.post('/api/knowledge', { title: 'Salary bands', department: 'HR', text: 'Salary bands are confidential. Customs retention is not mentioned here but salary is.' });
  assert.equal(hrDoc.status, 200);
  const all = await S.eng.post('/api/knowledge', { title: 'Company handbook', department: '*', text: 'Everyone must lock their screen. Retention schedules live in the policy library.' });
  assert.equal(all.status, 200);
  const empList = (await S.emp.get('/api/knowledge')).json.map((d) => d.title).sort();
  assert.deepEqual(empList, ['Company handbook', 'Shipping procedure']);
  const hrList = (await S.hr.get('/api/knowledge')).json.map((d) => d.title).sort();
  assert.deepEqual(hrList, ['Company handbook', 'Salary bands']);
  assert.equal((await S.emp.get('/api/knowledge/' + hrDoc.json.id)).status, 404);
  assert.equal((await S.emp.del('/api/knowledge/' + ops.json.id)).status, 403);
});

test('chat: streams tokens, cites only permitted documents, stores private history, ledger holds hashes not text', async () => {
  const secret = 'What is the customs retention period for salary documents?';
  const r = await S.emp.req('POST', '/api/chat', { deploymentId: S.dep.id, message: secret, useKnowledge: true }, true);
  const ev = ndjson(r.text);
  assert.equal(r.status, 200);
  const meta = ev.find((e) => e.type === 'meta');
  assert.ok(meta.sources.length > 0);
  assert.ok(meta.sources.every((s) => s.title !== 'Salary bands'), 'HR-only document is never retrieved for an Operations employee');
  assert.ok(ev.filter((e) => e.type === 'token').length > 3);
  const done = ev.find((e) => e.type === 'done');
  assert.ok(done.conversationId && done.stats.completionTokens > 0 && done.stats.tokensPerSecond > 0);
  const conv = (await S.emp.get('/api/conversations/' + done.conversationId)).json;
  assert.equal(conv.messages.length, 2);
  assert.equal((await S.hr.get('/api/conversations/' + done.conversationId)).status, 404, 'other users cannot read it');
  assert.equal((await S.owner.get('/api/conversations/' + done.conversationId)).status, 404, 'not even the owner');
  const hrRun = ndjson((await S.hr.req('POST', '/api/chat', { deploymentId: S.dep.id, message: 'Tell me about salary bands confidential' }, true)).text);
  assert.ok(hrRun.find((e) => e.type === 'meta').sources.some((s) => s.title === 'Salary bands'), 'HR can retrieve the HR document');
  const ledger = (await S.sec.get('/api/ledger?limit=200')).json;
  const entry = ledger.entries.find((e) => e.action === 'chat.completion');
  assert.ok(entry.meta.promptSha256 && entry.meta.responseSha256 && entry.meta.promptTokens > 0);
  assert.ok(!JSON.stringify(ledger.entries).includes('salary documents'), 'prompt text is not in the ledger');
  const dep = (await S.eng.get('/api/deployments')).json[0];
  assert.ok(dep.stats.requests >= 2);
  assert.equal((await S.sec.post('/api/chat', { deploymentId: S.dep.id, message: 'hi' })).status, 403, 'security admin has no chat.use');
});

test('compliance: obligations depend on industry and jurisdiction; local, state, national and international levels', async () => {
  const c = (await S.comp.get('/api/compliance')).json;
  const ids = new Set(c.items.map((i) => i.id));
  for (const want of ['intl-iso27001', 'in-dpdp', 'in-eway', 'in-carriage', 'inmh-shops', 'us-fmcsa-eld', 'ustx-tdpsa', 'us-customs']) assert.ok(ids.has(want), 'expected ' + want);
  for (const nope of ['eu-gdpr', 'us-hipaa', 'in-rbi-itgov', 'eu-dora', 'usca-ccpa']) assert.ok(!ids.has(nope), 'unexpected ' + nope);
  const levels = new Set(c.items.map((i) => i.level));
  for (const l of ['international', 'national', 'state']) assert.ok(levels.has(l), 'level ' + l);
  assert.ok(c.notes.some((n) => /Maharashtra|Texas/.test(n.name)) === false, 'states with entries do not warn');
  assert.ok((await S.emp.get('/api/compliance')).json.items.length === c.items.length, 'employees can see obligations');
  assert.equal((await S.emp.put('/api/compliance/in-dpdp/status', { status: 'implemented' })).status, 403, 'employees cannot change status');
  const pv = (await S.emp.get('/api/compliance/preview?industry=banking&jurisdictions=GB,US-CA')).json;
  const pids = new Set(pv.items.map((i) => i.id));
  assert.ok(pids.has('gb-gdpr') && pids.has('usca-ccpa') && pids.has('us-glba') && pids.has('gb-fca') && !pids.has('in-eway'));
  assert.equal((await S.emp.get('/api/compliance/preview?industry=nonsense&jurisdictions=GB')).status, 400);
});

test('compliance workflow: status rules, evidence hashing and integrity check, custom local rules, report anchored to ledger', async () => {
  assert.equal((await S.comp.put('/api/compliance/in-dpdp/status', { status: 'not_applicable', note: 'short' })).status, 400);
  const st = await S.comp.put('/api/compliance/in-dpdp/status', { status: 'in_progress', note: 'Gap assessment started' });
  assert.equal(st.status, 200); assert.equal(st.json.status, 'in_progress');
  const content = Buffer.from('Access control policy v3 approved 2026-01-10');
  const ev = await S.comp.post('/api/compliance/in-dpdp/evidence', { title: 'Access policy', note: 'Signed copy', fileName: 'policy.txt', fileBase64: content.toString('base64') });
  assert.equal(ev.status, 200, ev.text);
  assert.equal(ev.json.file.sha256, require('crypto').createHash('sha256').update(content).digest('hex'));
  const dl = await S.emp.req('GET', `/api/compliance/evidence/${ev.json.id}/file`, null, true);
  assert.equal(dl.status, 200); assert.equal(dl.text, content.toString());
  assert.equal((await S.emp.post('/api/compliance/in-dpdp/evidence', { title: 't', note: 'n' })).status, 403);
  fs.appendFileSync(path.join(dir, 'data', 'evidence-files', ev.json.id), 'tampered');
  const bad = await S.comp.req('GET', `/api/compliance/evidence/${ev.json.id}/file`, null, true);
  assert.equal(bad.status, 409); assert.match(bad.text, /Integrity check failed/);
  const cust = await S.comp.post('/api/compliance/custom', { title: 'Pune Municipal vehicle registry filing', summary: 'City filing of fleet records every quarter', category: 'records', level: 'local', jurisdiction: 'Pune Municipal Corporation' });
  assert.equal(cust.status, 200); assert.equal(cust.json.level, 'local');
  assert.equal((await S.comp.put('/api/compliance/' + cust.json.id + '/status', { status: 'implemented', note: 'Done' })).json.status, 'implemented');
  const rep = await S.comp.req('GET', '/api/compliance/report?format=csv', null, true);
  assert.equal(rep.status, 200); assert.match(rep.text, /ledgerHead=[0-9a-f]{64}/); assert.match(rep.text, /Pune Municipal/);
  assert.equal((await S.emp.req('GET', '/api/compliance/report', null, true)).status, 403);
  const ai = await S.comp.post('/api/compliance/in-dpdp/assist', { deploymentId: S.dep.id });
  assert.equal(ai.status, 200); assert.equal(ai.json.requiresHumanReview, true); assert.ok(ai.json.text.length > 0);
  assert.equal((await S.comp.get('/api/compliance')).json.items.find((i) => i.id === 'in-dpdp').status, 'in_progress', 'AI assist never changes status');
});

test('insights: real metrics per request, compliance signals and AI review, knowledge graph, ledger anchors', async () => {
  const m = (await S.owner.get('/api/metrics?range=24h')).json;
  assert.ok(m.totals.requests >= 2 && m.totals.completionTokens > 0 && m.totals.tps > 0, 'metrics come from recorded requests');
  assert.ok(m.byKind.some((g) => g.key === 'chat') && m.series.length === 24);
  assert.ok(!JSON.stringify(m).includes('salary documents'), 'metrics never hold prompt text');
  assert.equal((await S.emp.get('/api/metrics')).status, 403, 'employees cannot see org metrics');
  const ins = (await S.comp.get('/api/compliance/insights')).json;
  assert.ok(ins.controls.length >= 6 && ins.controls.find((c) => c.id === 'audit_ledger').active);
  assert.ok(typeof ins.readiness === 'number' && Object.keys(ins.signals).length > 5);
  const anyWithControl = Object.values(ins.signals).some((s) => s.controls.length > 0);
  assert.ok(anyWithControl, 'platform controls map to some obligations');
  const empIns = (await S.emp.get('/api/compliance/insights')).json;
  assert.ok(!JSON.stringify(empIns).includes('Salary bands'), 'restricted document titles are redacted for people who cannot open them');
  const rv = await S.comp.post('/api/compliance/in-dpdp/assess', { deploymentId: S.dep.id });
  assert.equal(rv.status, 200, rv.text); assert.ok(['covered', 'partial', 'not_covered', 'unparsed'].includes(rv.json.verdict));
  assert.equal((await S.comp.get('/api/compliance')).json.items.find((i) => i.id === 'in-dpdp').status, 'in_progress', 'AI review never changes status');
  assert.ok((await S.comp.get('/api/compliance/insights')).json.signals['in-dpdp'].ai, 'review shows up in signals');
  const g = (await S.owner.get('/api/graph')).json;
  assert.ok(g.nodes.some((n) => n.type === 'document') && g.nodes.some((n) => n.type === 'deployment') && g.links.some((l) => l.type === 'retrieved'));
  const anc = await S.sec.post('/api/ledger/anchors', { note: 'test anchor' });
  assert.equal(anc.status, 200); assert.equal(anc.json.valid, true); assert.match(anc.json.receipt, /^vector-anchor:/);
  const st = (await S.sec.get('/api/ledger/stats')).json;
  assert.ok(st.length > 5 && st.byArea.length && st.heat.length === 7);
  assert.equal((await S.emp.post('/api/ledger/anchors', {})).status, 403);
});

test('work: tasks with audit trail, exposure model, feedback, evals, training data, custom models, readable ledger', async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const tl = (await S.comp.get('/api/tasks')).json;
  const emp = (await S.emp.get('/api/me')).json.user;
  const t = await S.comp.post('/api/tasks', { title: 'Collect DPDP consent records', assigneeId: emp.id, obligationId: 'in-dpdp', dueDate: '2026-12-01', priority: 'high' });
  assert.equal(t.status, 200, t.text); assert.equal(t.json.assigneeName, emp.displayName);
  const mine = (await S.emp.get('/api/tasks')).json;
  assert.equal(mine.scope, 'mine'); assert.ok(mine.tasks.some((x) => x.id === t.json.id));
  assert.equal((await S.emp.put('/api/tasks/' + t.json.id, { status: 'in_progress', title: 'hacked' })).json.title, 'Collect DPDP consent records', 'assignee can only change status');
  assert.equal((await S.emp.post('/api/tasks/' + t.json.id + '/comments', { text: 'Started with the HR export' })).status, 200);
  assert.equal((await S.hr.put('/api/tasks/' + t.json.id, { status: 'done' })).status, 403, 'others cannot touch it');
  const h = (await S.comp.get('/api/tasks/' + t.json.id + '/history')).json;
  assert.ok(h.history.length >= 3 && h.history.some((x) => /status open → in_progress/.test(x.text)), 'task changes are in the chain with readable text');
  assert.equal((await S.emp.post('/api/tasks', { title: 'x' })).status, 403);
  void tl;
  const ex = (await S.comp.get('/api/compliance/exposure')).json;
  const dp = ex.items.find((i) => i.id === 'in-dpdp');
  assert.ok(dp.reference && dp.exposureUSD > 0 && dp.expectedLossUSD > 0);
  assert.ok(ex.places.some((p) => p.code === 'IN') && ex.places.some((p) => p.code === 'IN-MH') && ex.places.some((p) => p.code === 'US-TX' && p.total > p.own));
  assert.equal((await S.comp.put('/api/compliance/in-dpdp/exposure', { exposureUSD: 1000 })).status, 200);
  assert.equal((await S.comp.post('/api/compliance/losses', { obligationId: 'in-dpdp', amountUSD: 5000, date: '2026-10-01', description: 'Regulator penalty notice' })).status, 200);
  const ex2 = (await S.comp.get('/api/compliance/exposure')).json.items.find((i) => i.id === 'in-dpdp');
  assert.equal(ex2.exposureUSD, 1000); assert.equal(ex2.lossesUSD, 5000);
  const run = ndjson((await S.emp.req('POST', '/api/chat', { deploymentId: S.dep.id, message: 'What is the customs retention period?' }, true)).text);
  const convId = run.find((e) => e.type === 'done').conversationId;
  assert.equal((await S.emp.post('/api/conversations/' + convId + '/feedback', { messageIndex: 1, rating: 'up', share: true })).status, 200);
  const fb = (await S.eng.get('/api/feedback')).json; assert.ok(fb[0].shared && fb[0].question);
  const tr = await S.eng.post('/api/training', { feedbackId: fb[0].id }); assert.equal(tr.json.status, 'approved');
  const job = (await S.eng.post('/api/training/generate', { docId: S.docOps || (await S.eng.get('/api/knowledge')).json[0].id, deploymentId: S.dep.id, count: 3 })).json;
  for (let i = 0; i < 50 && (await S.eng.get('/api/jobs/' + job.id)).json.status === 'running'; i++) await sleep(20);
  assert.equal((await S.eng.get('/api/jobs/' + job.id)).json.created, 3);
  const exp = await S.eng.req('GET', '/api/training/export', null, true);
  assert.equal(exp.status, 200); assert.ok(JSON.parse(exp.text.trim().split('\n')[0]).messages.length === 2);
  const ev = (await S.eng.post('/api/evals', { name: 'Retention', cases: [{ q: 'How long are records kept?', mustInclude: 'mock' }] })).json;
  const r0 = (await S.eng.post('/api/evals/' + ev.id + '/run', { deploymentId: S.dep.id })).json;
  for (let i = 0; i < 50 && (await S.eng.get('/api/evalruns/' + r0.id)).json.status === 'running'; i++) await sleep(20);
  const r1 = (await S.eng.get('/api/evalruns/' + r0.id)).json; assert.equal(r1.status, 'done'); assert.equal(r1.score, 100);
  const cm = await S.eng.post('/api/models/create', { name: 'acme-assistant:v1', from: S.dep.model, system: 'You are the Acme assistant.' });
  assert.equal(cm.status, 200, cm.text);
  assert.ok((await S.eng.get('/api/models')).json.models.some((m) => m.name === 'acme-assistant:v1'));
  const led = (await S.sec.get('/api/ledger?limit=100')).json;
  assert.ok(led.entries.every((e) => typeof e.text === 'string' && e.text.length > 3));
  assert.ok(led.entries.some((e) => /built the custom model acme-assistant:v1/.test(e.text)));
  // fine-tuning with approved examples, and the personal AI summary
  const items = (await S.eng.get('/api/training')).json;
  await S.eng.put('/api/training/' + items[0].id, { status: 'approved' });
  const cm2 = await S.eng.post('/api/models/create', { name: 'acme-assistant:v2', from: S.dep.model, system: 'You are the Acme assistant.', includeTraining: true });
  assert.equal(cm2.status, 200, cm2.text); assert.ok(cm2.json.examples >= 1);
  const pai = (await S.owner.get('/api/personal-ai')).json;
  assert.equal(pai.internal.ownModel.name, 'acme-assistant:v2'); assert.ok(pai.internal.ownModel.examples >= 1);
  assert.equal(pai.physical.runtime.name, 'Ollama'); assert.ok(pai.physical.cpu && pai.physical.memoryBytes > 0);
  const m = (await S.owner.get('/api/metrics?range=24h')).json;
  assert.ok(Array.isArray(m.documents) && m.documents.some((d) => d.retrievals > 0) && m.feedback.up >= 1);
});

test('ledger: chain verifies, and any tampering is detected (edit, delete, truncate, append)', async () => {
  const v = (await S.aud.get('/api/ledger/verify')).json;
  assert.equal(v.ok, true); assert.ok(v.results[0].length > 20);
  const file = path.join(dir, 'data', 'ledger', `ledger-${S.orgA.id}.jsonl`);
  const original = fs.readFileSync(file, 'utf8');
  const lines = original.split('\n').filter(Boolean);
  const L = app.ledgers.for(S.orgA.id);
  const check = async () => { const r = L.verify(); return { ok: r.ok, results: [r] }; };

  const edited = lines.slice(); const e5 = JSON.parse(edited[5]); e5.outcome = e5.outcome === 'ok' ? 'denied' : 'ok'; edited[5] = JSON.stringify(e5);
  fs.writeFileSync(file, edited.join('\n') + '\n');
  let r = await check(); assert.equal(r.ok, false); assert.equal(r.results[0].brokenAt, 5); assert.match(r.results[0].reason, /altered/);

  fs.writeFileSync(file, lines.filter((_, i) => i !== 7).join('\n') + '\n');
  r = await check(); assert.equal(r.ok, false); assert.equal(r.results[0].brokenAt, 7);

  fs.writeFileSync(file, lines.slice(0, -3).join('\n') + '\n');
  r = await check(); assert.equal(r.ok, false); assert.match(r.results[0].reason, /truncated/);

  const forged = { ...JSON.parse(lines[lines.length - 1]) }; delete forged.hash; forged.index = lines.length; forged.prevHash = JSON.parse(lines[lines.length - 1]).hash;
  forged.hash = require('../lib/ledger').hashEntry(forged);
  fs.writeFileSync(file, original + JSON.stringify(forged) + '\n');
  r = await check(); assert.equal(r.ok, false); assert.match(r.results[0].reason, /outside the application/);

  fs.writeFileSync(file, original);
  r = await check(); assert.equal(r.ok, true, 'restored file verifies again');
  const exp = await S.aud.req('GET', '/api/ledger/export', null, true);
  const out = path.join(dir, 'export.json'); fs.writeFileSync(out, exp.text);
  const { execFileSync } = require('child_process');
  assert.match(execFileSync('node', [path.join(__dirname, '..', 'scripts', 'verify-ledger.js'), out]).toString(), /OK: \d+ entries/);
  const t = JSON.parse(exp.text); t.entries[3].meta = { forged: true }; fs.writeFileSync(out, JSON.stringify(t));
  assert.throws(() => execFileSync('node', [path.join(__dirname, '..', 'scripts', 'verify-ledger.js'), out], { stdio: 'pipe' }));
});

test('isolation: organizations cannot see each other; operators see health but not content', async () => {
  const orgsList = (await S.op.get('/api/orgs')).json;
  const det = await S.op.get('/api/ops/orgs/' + orgsList[0].id);
  assert.equal(det.status, 200, det.text);
  assert.ok(det.json.compliance.total > 0 && det.json.users.total > 0 && det.json.ledger.length > 0);
  assert.ok(!/salary|customs retention|Salary bands/i.test(det.text), 'operator customer view carries no document or prompt content');
  assert.equal((await S.owner.get('/api/ops/orgs/' + orgsList[0].id)).status, 403, 'customers cannot use the operator view');
  const r = await S.op.post('/api/orgs', { name: 'Beta Bank', industry: 'banking', jurisdictions: ['GB'], ownerUsername: 'beta.owner', ownerName: 'Beta Owner', ownerPassword: 'Password-12345' });
  assert.equal(r.status, 200);
  const b = new Client(); await b.activate('beta.owner', 'Password-12345');
  assert.equal((await b.get('/api/deployments')).json.length, 0);
  assert.equal((await b.get('/api/knowledge')).json.length, 0);
  const bl = (await b.get('/api/ledger?limit=200')).json;
  assert.ok(bl.entries.every((e) => e.orgId === r.json.org.id));
  assert.equal((await b.put(`/api/deployments/${S.dep.id}`, { name: 'hijack' })).status, 404);
  assert.equal((await b.post(`/api/deployments/${S.dep.id}/stop`)).status, 404);
  assert.equal((await b.post('/api/chat', { deploymentId: S.dep.id, message: 'hi' })).status, 404);
  const bc = (await b.get('/api/compliance')).json;
  assert.ok(bc.items.some((i) => i.id === 'gb-fca') && !bc.items.some((i) => i.id === 'in-eway'));
  assert.equal((await b.post('/api/compliance/in-dpdp/assist', { deploymentId: S.dep.id })).status, 404);

  const ops = (await S.op.get('/api/ops/overview')).json;
  assert.ok(ops.orgs.length >= 2 && ops.deployments.some((d) => d.name === 'Ops Assistant' && d.orgName === 'Acme Logistics'));
  assert.ok(ops.chains.every((c) => c.ok === true || c.scope === S.orgA.id));
  assert.equal((await S.op.get('/api/conversations')).status, 403);
  assert.equal((await S.op.get('/api/knowledge')).status, 403);
  assert.equal((await S.op.get('/api/compliance')).status, 403);
  assert.equal((await S.op.get('/api/users')).status, 403);
  assert.equal((await S.owner.get('/api/orgs')).status, 403);
  assert.equal((await S.owner.get('/api/ops/overview')).status, 403);
  const all = (await S.op.get('/api/ledger?scope=all&limit=5')).json;
  assert.ok(all.total > 10);
});

test('overview and cleanup: attention list, deployment delete, org disable ends sessions', async () => {
  const ov = (await S.owner.get('/api/overview')).json;
  assert.ok(ov.deployments.total === 1 && ov.compliance.total > 20 && ov.ledger.ok === true && ov.gpu.count === 2);
  assert.equal((await S.eng.del(`/api/deployments/${S.dep.id}`)).status, 200);
  assert.equal((await S.eng.del('/api/models?name=gemma3:4b')).status, 200);
  assert.equal((await S.eng.get('/api/models')).json.models.filter((m) => m.name === 'gemma3:4b').length, 0);
  const orgs = (await S.op.get('/api/orgs')).json;
  const beta = orgs.find((o) => o.name === 'Beta Bank');
  assert.equal((await S.op.del('/api/orgs/' + beta.id)).status, 409, 'must disable first');
  assert.equal((await S.op.put('/api/orgs/' + beta.id, { disabled: true })).status, 200);
  const b = new Client();
  assert.equal((await b.post('/api/auth/login', { username: 'beta.owner', password: 'Password-12345-x' })).status, 401);
  assert.equal((await S.op.del('/api/orgs/' + beta.id)).status, 200);
});

test('compliance check: predefined requirements, done vs pending, assignment, inputs and documents close the loop', async () => {
  const r0 = (await S.comp.get('/api/compliance/requirements')).json;
  const certin = r0.results.find((r) => r.id === 'in-certin');
  assert.ok(certin && certin.reqs.some((q) => q.kind === 'doc') && certin.reqs.some((q) => q.kind === 'input'));
  assert.ok(r0.summary.requirements > 0 && r0.summary.docsNeeded > 0);
  assert.equal((await S.emp.post('/api/compliance/check', {})).status, 403);
  const run = await S.comp.post('/api/compliance/check', {});
  assert.equal(run.status, 200, run.text); assert.ok(run.json.lastCheck);
  // assign the CERT-In log retention input to an employee
  const users = (await S.comp.get('/api/tasks')).json.people;
  const emp = users.find((u) => u.name === 'acme.emp');
  const as = await S.comp.post('/api/compliance/check/assign', { items: [{ obligationId: 'in-certin', key: 'log-days', assigneeId: emp.id }] });
  assert.equal(as.json.created, 1);
  const task = (await S.emp.get('/api/tasks?scope=mine')).json.tasks.find((t) => t.requirementKey === 'log-days');
  assert.ok(task);
  // the assignee can see and provide it; a wrong value is refused; a valid one closes the task
  assert.equal((await S.emp.get('/api/compliance/in-certin/requirements/log-days')).status, 200);
  assert.equal((await S.emp.put('/api/compliance/in-certin/requirements/log-days', { value: '90' })).status, 400);
  const ok = await S.emp.put('/api/compliance/in-certin/requirements/log-days', { value: '180' });
  assert.equal(ok.status, 200, ok.text); assert.equal(ok.json.requirement.status, 'met');
  assert.equal((await S.emp.get('/api/tasks?scope=mine')).json.tasks.find((t) => t.id === task.id).status, 'done');
  // someone not assigned cannot provide it
  assert.equal((await S.hr.put('/api/compliance/in-certin/requirements/poc', { value: 'x' })).status, 403);
  // a document uploaded for a requirement meets it
  const d = await S.comp.put('/api/compliance/in-certin/requirements/incident-procedure', { document: { title: 'CERT-In procedure', text: 'We report incidents to CERT-In within 6 hours.' } });
  assert.equal(d.status, 200, d.text); assert.equal(d.json.requirement.status, 'met');
  const led = (await S.sec.get('/api/ledger?limit=60')).json.entries.map((e) => e.text).join('\n');
  assert.match(led, /ran the compliance check/); assert.match(led, /provided "ICT log retention/); assert.match(led, /closed automatically/); assert.match(led, /to meet "Cyber incident reporting procedure/);
});

test('site contact form: validates and stores; only operators can read leads', async () => {
  const bad = await fetch(base + '/api/site/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'X' }) });
  assert.equal(bad.status, 400);
  const ok = await fetch(base + '/api/site/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Dana', email: 'dana@example.org', industry: 'Law' }) });
  assert.equal(ok.status, 200);
  assert.equal((await S.owner.req('GET', '/api/site/leads', null, true)).status, 403);
});

test('origin check blocks cross-site writes', async () => {
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://evil.example' }, body: '{"username":"a","password":"b"}' });
  assert.equal(r.status, 403);
});

test('demo sign-in: account picker without passwords, only when the server enables it', async () => {
  const off = await new Client().req('GET', '/api/auth/demo-accounts');
  assert.equal(off.status, 404, 'disabled by default');
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'vector-demo-'));
  const a2 = createApp({ dataDir: d2, ollamaUrl: mock.url, demoLogin: true });
  a2.bootstrap();
  const addr = await a2.start(0, '127.0.0.1');
  const b2 = `http://127.0.0.1:${addr.port}`;
  const list = await (await fetch(b2 + '/api/auth/demo-accounts')).json();
  assert.ok(list.some((x) => x.username === 'operator'));
  const r = await fetch(b2 + '/api/auth/demo-login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'operator' }) });
  assert.equal(r.status, 200);
  const me = await r.json();
  assert.equal(me.authMode, 'demo'); assert.equal(me.user.mustChange, false);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const led = await (await fetch(b2 + '/api/ledger?limit=5', { headers: { cookie } })).json();
  assert.ok(led.entries.some((e) => e.action === 'auth.login' && e.meta.method === 'demo account picker'), 'demo sign-ins are audit-trailed');
  assert.equal((await fetch(b2 + '/api/auth/demo-login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'nobody' }) })).status, 404);
  await a2.close();
});
