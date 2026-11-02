'use strict';
const fs = require('fs');
const path = require('path');
const { HttpError, id, now, sha256, str, oneOf } = require('./util');
const C = require('./compliance');
const D = require('./compliance-data');

module.exports = function (app) {
  const { store, route, ledgers } = app;
  const evDir = path.join(store.dir, 'evidence-files');

  app.complianceItems = (orgId) => {
    const org = store.orgs.get(orgId);
    const rows = C.applicable(org, store.custobs.filter((c) => c.orgId === orgId));
    const stat = new Map(store.obstatus.filter((s) => s.orgId === orgId).map((s) => [s.obligationId, s]));
    const ev = new Map();
    store.evidence.filter((e) => e.orgId === orgId).forEach((e) => ev.set(e.obligationId, (ev.get(e.obligationId) || 0) + 1));
    return rows.map((r) => {
      const s = stat.get(r.id);
      const owner = s && s.ownerId ? store.users.get(s.ownerId) : null;
      return { ...r, status: s ? s.status : 'not_started', ownerId: s ? s.ownerId || null : null, ownerName: owner ? owner.displayName : null, note: s ? s.note || '' : '', updatedAt: s ? s.updatedAt : null, updatedBy: s ? s.updatedBy : null, evidenceCount: ev.get(r.id) || 0 };
    });
  };
  const findItem = (orgId, obId) => {
    const it = app.complianceItems(orgId).find((i) => i.id === obId);
    if (!it) throw new HttpError(404, 'That obligation does not apply to this organization');
    return it;
  };

  route('GET', '/api/compliance/meta', 'auth', () => ({ pack: D.PACK, industries: D.INDUSTRIES, jurisdictions: D.JURISDICTIONS, levels: D.LEVELS, categories: D.CATEGORIES, statuses: C.STATUSES }));
  route('GET', '/api/compliance/preview', 'auth', (ctx) => {
    const p = C.validateProfile({ industry: ctx.query.industry, jurisdictions: String(ctx.query.jurisdictions || '').split(',').filter(Boolean) });
    const items = C.applicable(p).map(({ id: i, title, level, jurisdiction, jurisdictionName, category, type, verify }) => ({ id: i, title, level, jurisdiction, jurisdictionName, category, type, verify }));
    return { count: items.length, items, notes: C.coverageNotes(p), pack: D.PACK };
  });

  route('GET', '/api/compliance', 'compliance.read', (ctx) => {
    const org = store.orgs.get(ctx.orgId);
    const items = app.complianceItems(ctx.orgId);
    const out = { pack: D.PACK, profile: { industry: org.industry, jurisdictions: org.jurisdictions }, items, summary: C.summarize(items), notes: C.coverageNotes(org) };
    if (ctx.perms.includes('compliance.manage')) out.owners = store.users.filter((u) => u.orgId === ctx.orgId && !u.disabled).map((u) => ({ id: u.id, name: u.displayName }));
    return out;
  });

  route('PUT', '/api/compliance/:id/status', 'compliance.manage', (ctx) => {
    const it = findItem(ctx.orgId, ctx.params.id);
    const b = ctx.body;
    const status = oneOf(b.status, C.STATUSES, 'status');
    const note = str(b.note, 1000, 'Note', { required: false });
    if (status === 'not_applicable' && note.length < 10) throw new HttpError(400, 'Explain why this obligation does not apply (at least 10 characters)');
    let ownerId = null;
    if (b.ownerId) { const o = store.users.get(b.ownerId); if (!o || o.orgId !== ctx.orgId) throw new HttpError(400, 'Owner must be a user in your organization'); ownerId = o.id; }
    const key = `${ctx.orgId}:${it.id}`;
    const row = { id: key, orgId: ctx.orgId, obligationId: it.id, status, ownerId, note, updatedBy: ctx.user.username, updatedAt: now() };
    if (store.obstatus.get(key)) store.obstatus.update(key, row); else store.obstatus.insert(row);
    ctx.log('compliance.status', { type: 'obligation', id: it.id }, { title: it.title, from: it.status, to: status, ownerId, note });
    return app.complianceItems(ctx.orgId).find((i) => i.id === it.id);
  });

  // ----- custom obligations (local rules, contracts, internal policy) -----
  const readCustom = (b) => ({
    title: str(b.title, 200, 'Title'),
    summary: str(b.summary, 1500, 'Summary'),
    category: oneOf(b.category, Object.keys(D.CATEGORIES), 'category'),
    level: oneOf(b.level, Object.keys(D.LEVELS), 'level'),
    jurisdiction: str(b.jurisdiction, 80, 'Jurisdiction or source', { required: false }),
  });
  route('POST', '/api/compliance/custom', 'compliance.manage', (ctx) => {
    const c = store.custobs.insert({ id: id('cust'), orgId: ctx.orgId, ...readCustom(ctx.body), createdBy: ctx.user.username, createdAt: now() });
    ctx.log('compliance.custom.create', { type: 'obligation', id: c.id }, { title: c.title, level: c.level });
    return app.complianceItems(ctx.orgId).find((i) => i.id === c.id);
  });
  route('PUT', '/api/compliance/custom/:id', 'compliance.manage', (ctx) => {
    const c = store.custobs.get(ctx.params.id);
    if (!c || c.orgId !== ctx.orgId) throw new HttpError(404, 'Custom obligation not found');
    const patch = readCustom({ ...c, ...ctx.body });
    store.custobs.update(c.id, patch);
    ctx.log('compliance.custom.update', { type: 'obligation', id: c.id }, { before: { title: c.title, level: c.level }, after: { title: patch.title, level: patch.level } });
    return app.complianceItems(ctx.orgId).find((i) => i.id === c.id);
  });
  route('DELETE', '/api/compliance/custom/:id', 'compliance.manage', (ctx) => {
    const c = store.custobs.get(ctx.params.id);
    if (!c || c.orgId !== ctx.orgId) throw new HttpError(404, 'Custom obligation not found');
    store.evidence.filter((e) => e.obligationId === c.id).forEach((e) => { try { fs.unlinkSync(path.join(evDir, e.id)); } catch (_) { /* file may not exist */ } });
    store.evidence.removeWhere((e) => e.obligationId === c.id);
    store.obstatus.remove(`${ctx.orgId}:${c.id}`);
    store.custobs.remove(c.id);
    ctx.log('compliance.custom.delete', { type: 'obligation', id: c.id }, { title: c.title });
    return { ok: true };
  });

  // ----- evidence -----
  const evView = (e) => ({ id: e.id, obligationId: e.obligationId, title: e.title, note: e.note, file: e.file, createdBy: e.createdBy, createdAt: e.createdAt });
  route('GET', '/api/compliance/:id/evidence', 'compliance.read', (ctx) => {
    findItem(ctx.orgId, ctx.params.id);
    return store.evidence.filter((e) => e.orgId === ctx.orgId && e.obligationId === ctx.params.id).map(evView);
  });
  route('POST', '/api/compliance/:id/evidence', 'evidence.manage', (ctx) => {
    const it = findItem(ctx.orgId, ctx.params.id);
    const b = ctx.body;
    const title = str(b.title, 160, 'Title');
    const note = str(b.note, 2000, 'Note', { required: false });
    let file = null, buf = null;
    if (b.fileBase64) {
      if (typeof b.fileBase64 !== 'string') throw new HttpError(400, 'File data is invalid');
      buf = Buffer.from(b.fileBase64, 'base64');
      if (!buf.length) throw new HttpError(400, 'The file is empty');
      if (buf.length > 5 * 1024 * 1024) throw new HttpError(413, 'Evidence files are limited to 5 MB');
      file = { name: str(b.fileName || 'evidence.bin', 160, 'File name').replace(/[\r\n"\\/]/g, '_'), size: buf.length, sha256: sha256(buf) };
    }
    if (!file && !note) throw new HttpError(400, 'Add a note, a file, or both');
    const ev = store.evidence.insert({ id: id('ev'), orgId: ctx.orgId, obligationId: it.id, title, note, file, createdBy: ctx.user.username, createdAt: now() });
    if (buf) fs.writeFileSync(path.join(evDir, ev.id), buf, { mode: 0o600 });
    ctx.log('evidence.create', { type: 'evidence', id: ev.id }, { obligationId: it.id, title, fileName: file ? file.name : null, fileSha256: file ? file.sha256 : null, noteSha256: note ? sha256(note) : null });
    return evView(ev);
  }, { maxBody: 8 * 1024 * 1024 });
  const getEv = (ctx) => {
    const e = store.evidence.get(ctx.params.evId);
    if (!e || e.orgId !== ctx.orgId) throw new HttpError(404, 'Evidence not found');
    return e;
  };
  route('DELETE', '/api/compliance/evidence/:evId', 'evidence.manage', (ctx) => {
    const e = getEv(ctx);
    try { fs.unlinkSync(path.join(evDir, e.id)); } catch (_) { /* no file attached */ }
    store.evidence.remove(e.id);
    ctx.log('evidence.delete', { type: 'evidence', id: e.id }, { obligationId: e.obligationId, title: e.title, fileSha256: e.file ? e.file.sha256 : null });
    return { ok: true };
  });
  route('GET', '/api/compliance/evidence/:evId/file', 'compliance.read', (ctx) => {
    const e = getEv(ctx);
    if (!e.file) throw new HttpError(404, 'This evidence has no file');
    let buf;
    try { buf = fs.readFileSync(path.join(evDir, e.id)); } catch (_) { throw new HttpError(404, 'The stored file is missing'); }
    if (sha256(buf) !== e.file.sha256) {
      ctx.log('evidence.integrity_failure', { type: 'evidence', id: e.id }, { expected: e.file.sha256, actual: sha256(buf) }, 'error');
      throw new HttpError(409, 'Integrity check failed: the stored file no longer matches its recorded SHA-256 hash');
    }
    ctx.log('evidence.download', { type: 'evidence', id: e.id }, { fileSha256: e.file.sha256 });
    app.send(ctx.res, 200, buf, { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${e.file.name.replace(/[^\x20-\x7e]/g, '_')}"`, 'x-content-sha256': e.file.sha256 });
  });

  // ----- AI assist (a draft for a human, never a verdict) -----
  route('POST', '/api/compliance/:id/assist', 'compliance.manage', async (ctx) => {
    const it = findItem(ctx.orgId, ctx.params.id);
    const dep = store.deployments.get(ctx.body.deploymentId);
    if (!dep || dep.orgId !== ctx.orgId) throw new HttpError(400, 'Choose a deployment to run this on');
    const org = store.orgs.get(ctx.orgId);
    const industry = (D.INDUSTRIES.find((i) => i.id === org.industry) || {}).name || org.industry;
    const prompt = `Organization industry: ${industry}\nOperating jurisdictions: ${(org.jurisdictions || []).join(', ') || 'not set'}\nObligation: ${it.title}\nSummary: ${it.summary}\n\nIn under 250 words, using exactly these headings:\n1. What this means for the data we handle\n2. Controls and evidence an auditor would expect\n3. Questions to confirm with counsel\nDo not invent citations, deadlines or penalties. State uncertainty plainly.`;
    const cl = app.clientFor(app.nodeFor(ctx.orgId, dep.nodeId));
    let r;
    try {
      r = await cl.chat({ model: dep.model, messages: [{ role: 'system', content: 'You are a compliance analysis assistant. You do not give legal advice. You are concise and flag uncertainty.' }, { role: 'user', content: prompt }], keep_alive: dep.keepAlive === '-1' ? -1 : dep.keepAlive, options: { num_ctx: dep.numCtx, temperature: 0.2, ...(dep.gpuMode === 'cpu' ? { num_gpu: 0 } : dep.gpuMode === 'max' ? { num_gpu: 999 } : {}) } });
    } catch (e) { ctx.log('compliance.assist', { type: 'obligation', id: it.id }, { model: dep.model, error: e.message }, 'error'); throw e; }
    const text = (r.message && r.message.content) || '';
    app.recordMetric({ orgId: ctx.orgId, deploymentId: dep.id, model: dep.model, kind: 'assist', user: ctx.user, fin: r });
    ctx.log('compliance.assist', { type: 'obligation', id: it.id }, { model: dep.model, promptSha256: sha256(prompt), responseSha256: sha256(text), note: 'AI draft; requires human review' });
    return { text, model: dep.model, aiGenerated: true, requiresHumanReview: true };
  });

  // ----- report -----
  const csvCell = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  route('GET', '/api/compliance/report', 'compliance.manage', (ctx) => {
    const org = store.orgs.get(ctx.orgId);
    const items = app.complianceItems(ctx.orgId);
    const L = ledgers.for(ctx.orgId);
    const head = { organization: org.name, industry: org.industry, jurisdictions: org.jurisdictions, generatedAt: now(), generatedBy: ctx.user.username, catalogVersion: D.PACK.version, ledgerLength: L.entries.length, ledgerHead: L.head(), notice: D.PACK.notice };
    const fmt = ctx.query.format === 'csv' ? 'csv' : 'json';
    ctx.log('compliance.export', { type: 'report', id: fmt }, { items: items.length, ledgerHeadAtExport: L.head() });
    const stamp = new Date().toISOString().slice(0, 10);
    if (fmt === 'json') return app.send(ctx.res, 200, JSON.stringify({ ...head, summary: C.summarize(items), items }, null, 1), { 'content-disposition': `attachment; filename="vector-compliance-${stamp}.json"` });
    const cols = ['id', 'level', 'jurisdiction', 'category', 'type', 'title', 'status', 'owner', 'evidence', 'verify_with_counsel', 'note', 'summary'];
    const lines = [`# ${Object.entries(head).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('|') : v}`).join('; ')}`, cols.join(',')];
    for (const i of items) lines.push([i.id, i.level, i.jurisdictionName, i.category, i.type, i.title, i.status, i.ownerName, i.evidenceCount, i.verify ? 'yes' : '', i.note, i.summary].map(csvCell).join(','));
    app.send(ctx.res, 200, lines.join('\n'), { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="vector-compliance-${stamp}.csv"` });
  });
};
