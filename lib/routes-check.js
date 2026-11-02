'use strict';
// The compliance check: run every predefined requirement (documents and inputs) against what the
// organization has, show what is done and pending, assign the pending work, and accept documents and
// values as people provide them. Every step is written to the hash-chained audit ledger.
const { HttpError, id, now, sha256, str, oneOf } = require('./util');
const K = require('./knowledge');
const R = require('./requirements');

module.exports = function (app) {
  const { store, route } = app;
  const userName = (uid) => { const u = uid && store.users.get(uid); return u ? u.displayName : null; };
  const has = (ctx, p) => ctx.perms.includes(p);
  const needOrg = (ctx) => { if (!ctx.orgId) throw new HttpError(403, 'Only available inside an organization'); };

  function evaluateOrg(orgId) {
    const items = app.complianceItems(orgId);
    const docs = store.knowledge.filter((d) => d.orgId === orgId);
    const inputs = store.compinputs.filter((x) => x.orgId === orgId);
    const tasks = store.tasks.filter((t) => t.orgId === orgId);
    const results = R.evaluate(items, docs, inputs, tasks);
    for (const r of results) for (const q of r.reqs) q.assigneeName = userName(q.assigneeId);
    return results;
  }

  // Bring statuses and tasks in line with the requirements: close tasks whose requirement is now met,
  // move untouched obligations to "in progress", and mark fully met ones "needs review" so a person
  // signs off. Nothing is marked implemented automatically.
  function reconcile(ctx, onlyOb) {
    const results = evaluateOrg(ctx.orgId);
    const changed = [];
    for (const r of results) {
      if (onlyOb && r.id !== onlyOb) continue;
      for (const q of r.reqs) {
        if (q.status === 'met' && q.taskId && q.taskStatus !== 'done') {
          const t = store.tasks.get(q.taskId);
          const how = q.evidence ? (q.evidence.title ? `document "${q.evidence.title}"` : 'the value entered') : 'the compliance check';
          store.tasks.update(t.id, { status: 'done', completedAt: now(), updatedAt: now(), comments: [...(t.comments || []), { id: id('cmt'), userId: ctx.user.id, text: `Closed automatically: requirement met by ${how}.`, ts: now() }] });
          ctx.log('task.update', { type: 'task', id: t.id }, { title: t.title, changes: { status: { from: t.status, to: 'done' } }, auto: true });
        }
      }
      if (r.state === 'na') continue;
      let to = null;
      if (r.state === 'complete' && ['not_started', 'in_progress'].includes(r.status)) to = 'needs_review';
      else if (r.state === 'partial' && r.status === 'not_started') to = 'in_progress';
      if (to) {
        const key = `${ctx.orgId}:${r.id}`, cur = store.obstatus.get(key);
        const note = to === 'needs_review' ? `Compliance check: all ${r.total} requirements met. Ready for sign-off.` : `Compliance check: ${r.met} of ${r.total} requirements met.`;
        const row = { id: key, orgId: ctx.orgId, obligationId: r.id, status: to, ownerId: cur ? cur.ownerId : null, note, updatedBy: ctx.user.username, updatedAt: now() };
        if (cur) store.obstatus.update(key, row); else store.obstatus.insert(row);
        ctx.log('compliance.status', { type: 'obligation', id: r.id }, { title: r.title, from: r.status, to, note, auto: true });
        changed.push(r.id);
      }
    }
    return changed.length ? evaluateOrg(ctx.orgId) : results;
  }
  app.complianceReconcile = (ctx, onlyOb) => { try { if (ctx.orgId) reconcile(ctx, onlyOb); } catch (_) { /* best effort after uploads */ } };

  const view = (results, last) => ({ results, summary: R.summarize(results), lastCheck: last ? { at: last.at, by: last.byName, summary: last.summary, docs: last.docs } : null });
  const lastCheck = (orgId) => store.compchecks.filter((c) => c.orgId === orgId).sort((a, b) => (a.at < b.at ? 1 : -1))[0];

  route('GET', '/api/compliance/requirements', 'compliance.read', (ctx) => view(evaluateOrg(ctx.orgId), lastCheck(ctx.orgId)));

  route('POST', '/api/compliance/check', 'compliance.manage', (ctx) => {
    const t0 = Date.now();
    const results = reconcile(ctx);
    const summary = R.summarize(results);
    const docs = store.knowledge.filter((d) => d.orgId === ctx.orgId).length;
    const digest = sha256(JSON.stringify(results.map((r) => [r.id, r.reqs.map((q) => [q.key, q.status])])));
    const rec = store.compchecks.insert({ id: id('chk'), orgId: ctx.orgId, at: now(), byId: ctx.user.id, byName: ctx.user.displayName, docs, summary, resultsSha256: digest, ms: Date.now() - t0 });
    const mine = store.compchecks.filter((c) => c.orgId === ctx.orgId).sort((a, b) => (a.at < b.at ? 1 : -1));
    if (mine.length > 30) store.compchecks.removeWhere((c) => c.orgId === ctx.orgId && c.at < mine[29].at);
    ctx.log('compliance.check', { type: 'org', id: ctx.orgId }, { obligations: summary.obligations, complete: summary.complete, partial: summary.partial, pending: summary.pending, met: summary.met, requirements: summary.requirements, docs, resultsSha256: digest });
    return { ...view(results, rec), ms: rec.ms };
  });

  // Assign pending requirements as tasks. Body: { items: [{ obligationId, key, assigneeId, dueDate, priority }] }
  // or { all: true, assigneeId, days } to assign everything pending (the obligation owner first, else assigneeId).
  route('POST', '/api/compliance/check/assign', 'compliance.manage', (ctx) => {
    const results = evaluateOrg(ctx.orgId);
    const b = ctx.body || {};
    const users = new Map(store.users.filter((u) => u.orgId === ctx.orgId && !u.disabled).map((u) => [u.id, u]));
    const due = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    let list = [];
    if (b.all) {
      const days = Math.max(1, Math.min(180, Number(b.days) || 14));
      const pool = [...users.values()];
      const byRole = (role) => (pool.find((u) => u.roleId === role) || {}).id;
      const team = (cat) => !b.route ? null : cat === 'security' || cat === 'breach' ? byRole('security_admin') : cat === 'ai' ? byRole('ai_engineer') : cat === 'transfer' ? byRole('platform_admin') : cat === 'records' ? (pool.find((u) => /record/i.test(u.department || '')) || {}).id || null : null;
      for (const r of results) for (const q of r.reqs) if (q.status !== 'met' && r.state !== 'na' && (!q.taskId || q.taskStatus === 'done')) list.push({ obligationId: r.id, key: q.key, assigneeId: r.ownerId || team(r.category) || b.assigneeId || ctx.user.id, dueDate: due(q.status === 'expired' ? Math.min(days, 7) : days), priority: q.status === 'expired' ? 'high' : 'medium' });
    } else list = Array.isArray(b.items) ? b.items.slice(0, 200) : [];
    const created = [];
    for (const x of list) {
      const r = results.find((y) => y.id === x.obligationId); const q = r && r.reqs.find((y) => y.key === x.key);
      if (!q) throw new HttpError(400, 'Unknown requirement');
      if (q.taskId && q.taskStatus !== 'done') continue;
      const assignee = users.get(x.assigneeId); if (!assignee) throw new HttpError(400, 'Assignee must be an active person in your organization');
      const dueDate = x.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(x.dueDate) ? x.dueDate : due(14);
      const priority = oneOf(x.priority || 'medium', ['low', 'medium', 'high', 'critical'], 'priority');
      const title = `${q.kind === 'doc' ? 'Upload' : 'Provide'}: ${q.label}`.slice(0, 160);
      const description = `Needed for "${r.title}" (${r.jurisdictionName}).${q.hint ? ' ' + q.hint : ''}${q.problem && q.problem !== 'missing' ? ` Current value: ${q.problem}.` : ''} Provide it from this task; the compliance check updates as soon as you do.`;
      const t = store.tasks.insert({ id: id('task'), orgId: ctx.orgId, status: 'open', title, description, dueDate, assigneeId: assignee.id, obligationId: r.id, requirementKey: q.key, priority, comments: [], createdById: ctx.user.id, createdAt: now(), updatedAt: now() });
      ctx.log('task.create', { type: 'task', id: t.id }, { title, assigneeId: assignee.id, assigneeName: assignee.displayName, obligationId: r.id, requirementKey: q.key, dueDate, priority });
      created.push(t.id);
    }
    return { created: created.length, ...view(evaluateOrg(ctx.orgId), lastCheck(ctx.orgId)) };
  });

  // One requirement: readable by compliance readers and by the person it is assigned to.
  const canTouch = (ctx, obId, key, write) => {
    if (has(ctx, write ? 'compliance.manage' : 'compliance.read')) return true;
    return store.tasks.filter((t) => t.orgId === ctx.orgId && t.obligationId === obId && t.requirementKey === key && t.assigneeId === ctx.user.id && t.status !== 'done').length > 0;
  };
  const findReq = (ctx) => {
    const r = evaluateOrg(ctx.orgId).find((x) => x.id === ctx.params.id);
    const q = r && r.reqs.find((y) => y.key === ctx.params.key);
    if (!q) throw new HttpError(404, 'Requirement not found');
    return { r, q };
  };
  route('GET', '/api/compliance/:id/requirements/:key', 'auth', (ctx) => {
    needOrg(ctx);
    if (!canTouch(ctx, ctx.params.id, ctx.params.key, false)) throw new HttpError(403, 'Not assigned to you');
    const { r, q } = findReq(ctx);
    return { obligation: { id: r.id, title: r.title, jurisdictionName: r.jurisdictionName, state: r.state, met: r.met, total: r.total }, requirement: q };
  });

  // Provide a requirement: { value } for inputs, { document: { title, text, fileName } } for documents.
  route('PUT', '/api/compliance/:id/requirements/:key', 'auth', (ctx) => {
    needOrg(ctx);
    if (!canTouch(ctx, ctx.params.id, ctx.params.key, true)) throw new HttpError(403, 'Only a compliance manager or the person assigned can provide this');
    const { r, q } = findReq(ctx);
    const key = `${ctx.orgId}:${r.id}:${q.key}`;
    const base = { id: key, orgId: ctx.orgId, obligationId: r.id, key: q.key, byId: ctx.user.id, byName: ctx.user.displayName, at: now() };
    if (q.kind === 'input') {
      const value = str(ctx.body.value, 300, q.label);
      const c = R.checkValue(q, value);
      if (!c.ok && !c.expired) throw new HttpError(400, `${q.label}: ${c.problem}`);
      const row = { ...base, value };
      if (store.compinputs.get(key)) store.compinputs.update(key, row); else store.compinputs.insert(row);
      ctx.log('compliance.input', { type: 'obligation', id: r.id }, { title: r.title, requirement: q.label, key: q.key, valueSha256: sha256(value), valid: c.ok, problem: c.ok ? null : c.problem });
    } else {
      const d = ctx.body.document || {};
      const title = str(d.title || q.label, 160, 'Title'), text = str(d.text, 300000, 'Document text');
      const department = has(ctx, 'knowledge.all') ? '*' : ctx.user.department || '*';
      const docRow = store.knowledge.insert({ id: id('doc'), orgId: ctx.orgId, title, department, text, chunks: K.chunk(text), sha256: sha256(text), tags: app.cleanTags(['compliance', ...(d.tags ? String(d.tags).split(',') : [])]), useFor: ['retrieval'], fileName: d.fileName ? String(d.fileName).slice(0, 160) : null, createdBy: ctx.user.username, createdAt: now() });
      ctx.log('knowledge.create', { type: 'document', id: docRow.id }, { title, department, sha256: docRow.sha256, chunks: docRow.chunks.length, tags: docRow.tags, useFor: docRow.useFor });
      const row = { ...base, docId: docRow.id };
      if (store.compinputs.get(key)) store.compinputs.update(key, row); else store.compinputs.insert(row);
      ctx.log('compliance.document', { type: 'obligation', id: r.id }, { title: r.title, requirement: q.label, key: q.key, docId: docRow.id, docTitle: title, sha256: docRow.sha256 });
    }
    const results = reconcile(ctx, r.id);
    const nr = results.find((x) => x.id === r.id);
    return { obligation: { id: nr.id, title: nr.title, state: nr.state, met: nr.met, total: nr.total }, requirement: nr.reqs.find((y) => y.key === q.key), summary: R.summarize(results) };
  }, { maxBody: 2 * 1024 * 1024 });
};
