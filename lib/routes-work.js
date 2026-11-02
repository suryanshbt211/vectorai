'use strict';
// Work that people do around their own AI: compliance tasks, exposure and losses, answer feedback,
// evaluation sets, training data, custom models, and human-readable audit descriptions.
const { HttpError, id, now, sha256, str, oneOf, num } = require('./util');
const K = require('./knowledge');
const D = require('./compliance-data');
const P = require('./penalties');
const { TAG_RE } = require('./catalog');

const EU_MEMBERS = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
const STATUS_WORD = { not_started: 'Not started', in_progress: 'In progress', implemented: 'Implemented', needs_review: 'Needs review', not_applicable: 'Not applicable' };

module.exports = function (app) {
  const { store, route, ledgers } = app;
  const needOrg = (ctx) => { if (!ctx.orgId) throw new HttpError(403, 'This is only available inside an organization'); };
  const userName = (uid) => { const u = uid && store.users.get(uid); return u ? u.displayName : null; };
  const has = (ctx, p) => ctx.perms.includes(p);

  // ---------- human-readable audit descriptions ----------
  const obTitle = (oid, meta) => (meta && meta.title) || (D.OBLIGATIONS.find((o) => o.id === oid) || store.custobs.get(oid) || {}).title || oid;
  const depName = (did) => (store.deployments.get(did) || {}).name || 'a deployment';
  app.whoOf = (e) => (e.actor ? (userName(e.actor.id) || e.actor.username) : 'System');
  app.describeEntry = (e) => {
    const m = e.meta || {}, r = e.resource || {};
    const who = e.actor ? (userName(e.actor.id) || e.actor.username) : 'System';
    const q = (s) => `“${s}”`;
    const denied = e.outcome === 'denied', err = e.outcome === 'error';
    switch (e.action) {
      case 'ledger.genesis': return 'Audit chain created';
      case 'system.bootstrap': return 'Platform initialized; operator account created';
      case 'auth.login': return denied ? `Failed sign-in attempt for ${m.username || 'an unknown user'}` : `${who} signed in`;
      case 'auth.logout': return `${who} signed out`;
      case 'auth.password_change': return denied ? `${who} entered a wrong current password` : `${who} changed their password`;
      case 'access.denied': return `${who} was blocked from an action their role does not allow${m.perm ? ` (needs ${m.perm})` : ''}`;
      case 'org.create': return `${who} created the organization ${q(m.name || '')}`;
      case 'org.provisioned': return 'Organization provisioned with its own audit chain';
      case 'org.update': return `${who} updated the organization profile${m.after && m.after.jurisdictions ? ' (operating locations)' : ''}`;
      case 'user.create': return `${who} added ${m.username} as ${m.roleId}${m.department ? ` in ${m.department}` : ''}`;
      case 'user.update': {
        const c = m.changes || {}, parts = [];
        if (c.roleId) parts.push(`role ${c.roleId.from} → ${c.roleId.to}`);
        if (c.disabled) parts.push(c.disabled.to ? 'disabled the account' : 're-enabled the account');
        if (c.department) parts.push(`department → ${c.department.to || 'none'}`);
        return `${who} updated ${m.username}${parts.length ? ': ' + parts.join(', ') : ''}`;
      }
      case 'user.reset_password': return `${who} reset the password of ${m.username}`;
      case 'user.delete': return `${who} deleted the account ${m.username}`;
      case 'role.create': return `${who} created the role ${q(m.name)}`;
      case 'role.update': return `${who} changed the role ${q((m.after || {}).name || '')}`;
      case 'role.delete': return `${who} deleted the role ${q(m.name)}`;
      case 'knowledge.create': return `${who} uploaded ${q(m.title)}${m.department && m.department !== '*' ? ` for ${m.department}` : ' for everyone'}${(m.tags || []).length ? ` · tags ${m.tags.join(', ')}` : ''}`;
      case 'knowledge.update': return `${who} edited ${q(m.title)}${m.after && m.after.tags ? ` · tags ${m.after.tags.join(', ') || 'none'}` : ''}${m.after && m.after.useFor ? ` · used for ${m.after.useFor.join(' and ')}` : ''}`;
      case 'knowledge.delete': return `${who} deleted the document ${q(m.title)}`;
      case 'node.create': return `${who} added the inference node ${q(m.name)}`;
      case 'node.delete': return `${who} removed the inference node ${q(m.name)}`;
      case 'model.pull': return m.state === 'started' ? `${who} started downloading ${r.id}` : m.state === 'completed' ? `${r.id} finished downloading` : `Download of ${r.id} failed${m.error ? ': ' + m.error : ''}`;
      case 'model.delete': return `${who} deleted the model ${r.id}`;
      case 'model.create': return err ? `${who} failed to build ${m.name}` : `${who} built the custom model ${m.name} from ${m.from}`;
      case 'deployment.create': return `${who} created the deployment ${q(m.name)} on ${m.model}`;
      case 'deployment.update': return `${who} changed the settings of ${q(depName(r.id))}`;
      case 'deployment.delete': return `${who} deleted the deployment ${q(m.name)}`;
      case 'deployment.start': return err ? `${depName(r.id)} failed to start: ${m.error}` : `${who} started ${q(depName(r.id))}`;
      case 'deployment.stop': return `${who} stopped ${q(depName(r.id))}`;
      case 'deployment.restart': return `${who} restarted ${q(depName(r.id))}`;
      case 'deployment.benchmark': return err ? `Benchmark of ${q(depName(r.id))} failed` : `${who} benchmarked ${q(depName(r.id))}: ${m.avgTps ?? '-'} tok/s`;
      case 'chat.completion': return `${who} asked ${q(depName(r.id))} a question · ${m.completionTokens || 0} tokens${(m.knowledgeDocs || []).length ? ` · ${m.knowledgeDocs.length} document${m.knowledgeDocs.length > 1 ? 's' : ''} cited` : ''}`;
      case 'conversation.delete': return `${who} deleted one of their conversations`;
      case 'compliance.check': return `${who} ran the compliance check: ${m.met} of ${m.requirements} requirements met across ${m.obligations} obligations (${m.complete} complete, ${m.partial} partial, ${m.pending} pending), against ${m.docs} documents`;
      case 'compliance.input': return `${who} provided "${m.requirement}" for ${q(obTitle(r.id, m))}${m.valid === false ? ` (${m.problem})` : ''} · value hash ${String(m.valueSha256 || '').slice(0, 12)}…`;
      case 'compliance.document': return `${who} uploaded ${q(m.docTitle)} to meet "${m.requirement}" for ${q(obTitle(r.id, m))}`;
      case 'compliance.status': if (m.auto) return `Compliance check (run by ${who}) moved ${q(obTitle(r.id, m))} to ${STATUS_WORD[m.to] || m.to}: ${m.note || ''}`; return `${who} marked ${q(obTitle(r.id, m))} as ${STATUS_WORD[m.to] || m.to}${m.from && m.from !== m.to ? ` (was ${STATUS_WORD[m.from] || m.from})` : ''}`;
      case 'compliance.custom.create': return `${who} added the obligation ${q(m.title)}`;
      case 'compliance.custom.update': return `${who} edited the obligation ${q((m.after || {}).title || '')}`;
      case 'compliance.custom.delete': return `${who} deleted the obligation ${q(m.title)}`;
      case 'compliance.ai_review': return err ? `AI review of ${q(obTitle(r.id))} failed` : `${who} ran an AI review of ${q(obTitle(r.id))}: ${String(m.verdict || '').replace('_', ' ')}`;
      case 'compliance.assist': return `${who} drafted an AI analysis of ${q(obTitle(r.id))}`;
      case 'compliance.export': return `${who} exported the compliance report (${r.id})`;
      case 'compliance.exposure': return `${who} set the exposure estimate for ${q(obTitle(r.id))} to $${Number(m.to || 0).toLocaleString()}`;
      case 'compliance.loss.create': return `${who} recorded a loss of $${Number(m.amountUSD || 0).toLocaleString()} against ${q(obTitle(m.obligationId))}`;
      case 'compliance.loss.delete': return `${who} removed a recorded loss`;
      case 'evidence.create': return `${who} attached evidence ${q(m.title)} to ${q(obTitle(m.obligationId))}`;
      case 'evidence.delete': return `${who} removed evidence ${q(m.title)}`;
      case 'evidence.download': return `${who} downloaded evidence (hash verified)`;
      case 'evidence.integrity_failure': return 'Evidence file failed its integrity check';
      case 'ledger.verify': return `${who} verified the audit chain: ${m.ok ? 'intact' : 'BROKEN'}`;
      case 'ledger.integrity_failure': return 'Audit chain integrity failure detected';
      case 'ledger.anchor': return `${who} anchored the chain at block ${m.anchoredIndex}${m.note ? ` (${m.note})` : ''}`;
      case 'ledger.export': return `${who} exported the audit chain (${m.entries} blocks)`;
      case 'app.run': return err ? `${who} ran ${q(m.app)} but it failed` : `${who} ran the ${q(m.app)} application on ${m.model}${m.sources ? ` · ${m.sources} document${m.sources > 1 ? 's' : ''} used` : ''}`;
      case 'task.create': return `${who} assigned ${q(m.title)} to ${m.assigneeName || 'nobody'}${m.dueDate ? `, due ${m.dueDate}` : ''}`;
      case 'task.update': { if (m.auto) return `Task ${q(m.title)} closed automatically: requirement met`; const c = m.changes || {}; const parts = Object.entries(c).map(([k, v]) => (k === 'status' ? `status ${v.from} → ${v.to}` : k === 'assigneeId' ? `reassigned to ${userName(v.to) || 'nobody'}` : `${k} changed`)); return `${who} updated the task ${q(m.title)}${parts.length ? ': ' + parts.join(', ') : ''}`; }
      case 'task.comment': return `${who} commented on ${q(m.title)}`;
      case 'task.delete': return `${who} deleted the task ${q(m.title)}`;
      case 'feedback.create': return `${who} rated an answer ${m.rating === 'up' ? 'helpful' : 'not helpful'}${m.shared ? ' and shared it for improvement' : ''}`;
      case 'eval.create': return `${who} created the evaluation set ${q(m.name)} (${m.cases} cases)`;
      case 'eval.update': return `${who} edited the evaluation set ${q(m.name)}`;
      case 'eval.delete': return `${who} deleted the evaluation set ${q(m.name)}`;
      case 'eval.run': return m.state === 'started' ? `${who} started evaluating ${m.model} on ${q(m.name)}` : `Evaluation of ${m.model} on ${q(m.name)} finished: ${m.score}%`;
      case 'training.create': return `${who} added ${m.count || 1} training example${(m.count || 1) > 1 ? 's' : ''}${m.source ? ` from ${m.source}` : ''}`;
      case 'training.update': return `${who} ${m.status === 'approved' ? 'approved' : m.status === 'rejected' ? 'rejected' : 'edited'} a training example`;
      case 'training.delete': return `${who} deleted a training example`;
      case 'training.export': return `${who} exported ${m.count} approved training examples (sha256 ${String(m.sha256 || '').slice(0, 12)}…)`;
      default: return `${who}: ${e.action.replace(/[._]/g, ' ')}`;
    }
  };

  // ---------- tasks ----------
  const PRI = ['low', 'medium', 'high', 'critical'], TST = ['open', 'in_progress', 'blocked', 'done'];
  const taskView = (t) => ({ ...t, assigneeName: userName(t.assigneeId), createdByName: userName(t.createdById), obligationTitle: t.obligationId ? obTitle(t.obligationId) : null, overdue: t.status !== 'done' && t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10) });
  const getTask = (ctx) => { const t = store.tasks.get(ctx.params.id); if (!t || t.orgId !== ctx.orgId) throw new HttpError(404, 'Task not found'); return t; };
  const canAllTasks = (ctx) => has(ctx, 'compliance.manage') || has(ctx, 'audit.read');
  route('GET', '/api/tasks', 'auth', (ctx) => {
    needOrg(ctx);
    const mine = ctx.query.scope === 'mine' || !canAllTasks(ctx);
    const list = store.tasks.filter((t) => t.orgId === ctx.orgId && (!mine || t.assigneeId === ctx.user.id)).map(taskView);
    return { scope: mine ? 'mine' : 'all', canManage: has(ctx, 'compliance.manage'), tasks: list.sort((a, b) => (a.dueDate || '9') < (b.dueDate || '9') ? -1 : 1),
      people: has(ctx, 'compliance.manage') ? store.users.filter((u) => u.orgId === ctx.orgId && !u.disabled).map((u) => ({ id: u.id, name: u.displayName, department: u.department })) : undefined };
  });
  const readTask = (ctx, b, cur = {}) => {
    const out = {};
    if (b.title !== undefined || !cur.id) out.title = str(b.title, 160, 'Title');
    if (b.description !== undefined) out.description = str(b.description, 2000, 'Description', { required: false });
    if (b.priority !== undefined || !cur.id) out.priority = oneOf(b.priority || 'medium', PRI, 'priority');
    if (b.dueDate !== undefined) { const d = String(b.dueDate || ''); if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new HttpError(400, 'Due date must be YYYY-MM-DD'); out.dueDate = d || null; }
    if (b.assigneeId !== undefined) { if (b.assigneeId) { const u = store.users.get(b.assigneeId); if (!u || u.orgId !== ctx.orgId || u.disabled) throw new HttpError(400, 'Assignee must be an active person in your organization'); } out.assigneeId = b.assigneeId || null; }
    if (b.obligationId !== undefined) { if (b.obligationId && !app.complianceItems(ctx.orgId).some((i) => i.id === b.obligationId)) throw new HttpError(400, 'That obligation does not apply to this organization'); out.obligationId = b.obligationId || null; }
    if (b.status !== undefined) out.status = oneOf(b.status, TST, 'status');
    return out;
  };
  route('POST', '/api/tasks', 'compliance.manage', (ctx) => {
    const f = readTask(ctx, ctx.body);
    const t = store.tasks.insert({ id: id('task'), orgId: ctx.orgId, status: 'open', description: '', dueDate: null, assigneeId: null, obligationId: null, ...f, comments: [], createdById: ctx.user.id, createdAt: now(), updatedAt: now() });
    ctx.log('task.create', { type: 'task', id: t.id }, { title: t.title, assigneeId: t.assigneeId, assigneeName: userName(t.assigneeId), obligationId: t.obligationId, dueDate: t.dueDate, priority: t.priority });
    return taskView(t);
  });
  route('PUT', '/api/tasks/:id', 'auth', (ctx) => {
    needOrg(ctx);
    const t = getTask(ctx);
    const manager = has(ctx, 'compliance.manage'), assignee = t.assigneeId === ctx.user.id;
    if (!manager && !assignee) throw new HttpError(403, 'Only the assignee or a compliance manager can update this task');
    const body = manager ? ctx.body : { status: ctx.body.status };
    const patch = readTask(ctx, body, t), changes = {};
    for (const k of Object.keys(patch)) if (patch[k] !== t[k]) changes[k] = { from: t[k] ?? null, to: patch[k] };
    if (!Object.keys(changes).length) return taskView(t);
    if (changes.status && changes.status.to === 'done') patch.completedAt = now();
    store.tasks.update(t.id, { ...patch, updatedAt: now() });
    ctx.log('task.update', { type: 'task', id: t.id }, { title: t.title, changes });
    return taskView(store.tasks.get(t.id));
  });
  route('POST', '/api/tasks/:id/comments', 'auth', (ctx) => {
    needOrg(ctx);
    const t = getTask(ctx);
    if (!has(ctx, 'compliance.manage') && t.assigneeId !== ctx.user.id) throw new HttpError(403, 'Only the assignee or a compliance manager can comment');
    const text = str(ctx.body.text, 2000, 'Comment');
    const c = { id: id('cmt'), userId: ctx.user.id, text, ts: now() };
    store.tasks.update(t.id, { comments: [...(t.comments || []), c], updatedAt: now() });
    ctx.log('task.comment', { type: 'task', id: t.id }, { title: t.title, commentSha256: sha256(text) });
    return taskView(store.tasks.get(t.id));
  });
  route('DELETE', '/api/tasks/:id', 'compliance.manage', (ctx) => {
    const t = getTask(ctx);
    store.tasks.remove(t.id);
    ctx.log('task.delete', { type: 'task', id: t.id }, { title: t.title });
    return { ok: true };
  });
  route('GET', '/api/tasks/:id/history', 'auth', (ctx) => {
    needOrg(ctx);
    const t = getTask(ctx);
    if (!canAllTasks(ctx) && t.assigneeId !== ctx.user.id) throw new HttpError(404, 'Task not found');
    const rows = ledgers.for(ctx.orgId).entries.filter((e) => e.resource && e.resource.id === t.id);
    return { task: taskView(t), comments: (t.comments || []).map((c) => ({ ...c, name: userName(c.userId) })), history: rows.map((e) => ({ index: e.index, ts: e.ts, hash: e.hash, prevHash: e.prevHash, text: app.describeEntry(e), who: app.whoOf(e) })) };
  });

  // ---------- exposure, losses and the map ----------
  const regionOf = (code) => { const j = D.jmap.get(code); return j; };
  app.exposureFor = (ctx) => {
    const org = store.orgs.get(ctx.orgId);
    const ins = app.complianceInsights(ctx);
    const overrides = new Map(store.exposure.filter((x) => x.orgId === ctx.orgId).map((x) => [x.obligationId, x.exposureUSD]));
    const losses = store.losses.filter((x) => x.orgId === ctx.orgId);
    const items = ins.items.map((it) => {
      const ref = P.referenceFor(it.id), s = ins.signals[it.id];
      const exposure = overrides.has(it.id) ? overrides.get(it.id) : ref ? ref.defaultExposureUSD : null;
      const key = it.status === 'implemented' && it.evidenceCount ? 'implemented_evidenced' : it.status;
      const likelihood = P.LIKELIHOOD[key] ?? 0.2;
      const lost = losses.filter((l) => l.obligationId === it.id).reduce((a, l) => a + l.amountUSD, 0);
      return { id: it.id, title: it.title, jurisdiction: it.jurisdiction, jurisdictionName: it.jurisdictionName, level: it.level, category: it.category, type: it.type, status: it.status, band: s.band, score: s.score,
        reference: ref, exposureUSD: exposure, custom: overrides.has(it.id), likelihood, expectedLossUSD: exposure != null ? Math.round(exposure * likelihood) : null, lossesUSD: lost };
    });
    // Aggregate by place. A country includes its own and inherited rules (EU rules count for member states the org operates in).
    const sel = org.jurisdictions || [];
    const places = new Map();
    const touch = (code, name, level, parent, via) => { if (!places.has(code)) places.set(code, { code, name, level, parent, via: via || null, items: [] }); return places.get(code); };
    for (const code of sel) { const j = regionOf(code); if (j) touch(code, j.name, j.level, j.parent); }
    if (sel.includes('EU')) for (const m of EU_MEMBERS) if (!places.has(m)) touch(m, (regionOf(m) || { name: m }).name, 'national', 'EU', 'EU');
    for (const it of items) {
      for (const p of places.values()) {
        // a place's set: itself, its ancestors (except INTL), and EU for member states
        let cur = regionOf(p.code), chain = new Set([p.code]);
        while (cur && cur.parent) { chain.add(cur.parent); cur = regionOf(cur.parent); }
        if (p.via === 'EU') chain.add('EU');
        if (chain.has(it.jurisdiction)) p.items.push(it);
      }
    }
    const agg = (arr) => {
      const scored = arr.filter((i) => i.score != null);
      return { total: arr.length, open: arr.filter((i) => ['not_started', 'needs_review'].includes(i.status)).length, evidenced: arr.filter((i) => i.band === 'evidenced').length, gaps: arr.filter((i) => i.band === 'gap').length,
        readiness: scored.length ? Math.round(scored.reduce((a, i) => a + i.score, 0) / scored.length) : null,
        expectedLossUSD: arr.reduce((a, i) => a + (i.expectedLossUSD || 0), 0), exposureUSD: arr.reduce((a, i) => a + (i.exposureUSD || 0), 0), lossesUSD: arr.reduce((a, i) => a + i.lossesUSD, 0) };
    };
    const placeList = [...places.values()].map((p) => ({ code: p.code, name: p.name, level: p.level, parent: p.parent, via: p.via, own: p.items.filter((i) => i.jurisdiction === p.code).length, ...agg(p.items) }));
    const global = items.filter((i) => i.jurisdiction === 'INTL' || i.jurisdiction === 'CUSTOM');
    return { notice: `Illustrative exposure model: expected loss = exposure estimate × likelihood by status (${Object.entries(P.LIKELIHOOD).map(([k, v]) => `${k.replace('_', ' ')} ${Math.round(v * 100)}%`).join(', ')}). Defaults are starting points from statutory maximums; replace them with your own estimates. ${P.VERIFY}`,
      items, places: placeList, global: agg(global), totals: agg(items), losses: losses.map((l) => ({ ...l, obligationTitle: obTitle(l.obligationId), byName: userName(l.byId) })) };
  };
  route('GET', '/api/compliance/exposure', 'compliance.read', (ctx) => app.exposureFor(ctx));
  route('PUT', '/api/compliance/:id/exposure', 'compliance.manage', (ctx) => {
    const it = app.complianceItems(ctx.orgId).find((i) => i.id === ctx.params.id);
    if (!it) throw new HttpError(404, 'That obligation does not apply to this organization');
    const key = `${ctx.orgId}:${it.id}`;
    const v = ctx.body.exposureUSD === null || ctx.body.exposureUSD === '' ? null : Math.round(num(ctx.body.exposureUSD, 0, 1e11, 'Exposure'));
    const prev = store.exposure.get(key);
    if (v === null) { if (prev) store.exposure.remove(key); }
    else if (prev) store.exposure.update(key, { exposureUSD: v }); else store.exposure.insert({ id: key, orgId: ctx.orgId, obligationId: it.id, exposureUSD: v });
    ctx.log('compliance.exposure', { type: 'obligation', id: it.id }, { title: it.title, from: prev ? prev.exposureUSD : null, to: v });
    return { ok: true };
  });
  route('POST', '/api/compliance/losses', 'compliance.manage', (ctx) => {
    const b = ctx.body;
    const it = app.complianceItems(ctx.orgId).find((i) => i.id === b.obligationId);
    if (!it) throw new HttpError(400, 'Choose an obligation that applies to this organization');
    const date = String(b.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'Date must be YYYY-MM-DD');
    const l = store.losses.insert({ id: id('loss'), orgId: ctx.orgId, obligationId: it.id, amountUSD: Math.round(num(b.amountUSD, 1, 1e11, 'Amount')), date, kind: oneOf(b.kind || 'fine', ['fine', 'settlement', 'incident_cost', 'other'], 'kind'), description: str(b.description, 500, 'Description'), byId: ctx.user.id, createdAt: now() });
    ctx.log('compliance.loss.create', { type: 'loss', id: l.id }, { obligationId: it.id, amountUSD: l.amountUSD, kind: l.kind, date });
    return l;
  });
  route('DELETE', '/api/compliance/losses/:id', 'compliance.manage', (ctx) => {
    const l = store.losses.get(ctx.params.id);
    if (!l || l.orgId !== ctx.orgId) throw new HttpError(404, 'Loss record not found');
    store.losses.remove(l.id);
    ctx.log('compliance.loss.delete', { type: 'loss', id: l.id }, { obligationId: l.obligationId, amountUSD: l.amountUSD });
    return { ok: true };
  });

  // ---------- grounded generation shared by evals and training generation ----------
  function grounding(orgId, question, purpose = 'retrieval', k = 4) {
    const chunks = [];
    for (const d of store.knowledge.filter((x) => x.orgId === orgId && (x.useFor || ['retrieval']).includes(purpose))) d.chunks.forEach((t, n) => chunks.push({ docId: d.id, title: d.title, n, text: t }));
    return K.search(chunks, question, k).map((h, i) => ({ n: i + 1, docId: h.chunk.docId, title: h.chunk.title, text: h.chunk.text }));
  }
  const jobs = new Map();
  route('GET', '/api/jobs/:id', 'auth', (ctx) => { const j = jobs.get(ctx.params.id); if (!j || j.orgId !== ctx.orgId) throw new HttpError(404, 'Job not found'); return j; });

  // ---------- feedback on answers ----------
  route('POST', '/api/conversations/:id/feedback', 'chat.use', (ctx) => {
    const c = store.conversations.get(ctx.params.id);
    if (!c || c.userId !== ctx.user.id) throw new HttpError(404, 'Conversation not found');
    const idx = Number(ctx.body.messageIndex);
    const msg = c.messages[idx];
    if (!msg || msg.role !== 'assistant') throw new HttpError(400, 'Choose an answer to rate');
    const rating = oneOf(ctx.body.rating, ['up', 'down'], 'rating');
    const shared = !!ctx.body.share;
    const question = (c.messages.slice(0, idx).reverse().find((m) => m.role === 'user') || {}).content || '';
    const dep = store.deployments.get(c.deploymentId);
    const prev = store.feedback.find((f) => f.conversationId === c.id && f.messageIndex === idx);
    const row = { orgId: ctx.orgId, userId: ctx.user.id, department: ctx.user.department || '', conversationId: c.id, messageIndex: idx, rating, note: str(ctx.body.note, 500, 'Note', { required: false }), shared,
      deploymentId: c.deploymentId, model: dep ? dep.model : null, question: shared ? question : null, answer: shared ? msg.content : null, sources: msg.sources || [], questionSha256: sha256(question), answerSha256: sha256(msg.content), ts: now() };
    if (prev) store.feedback.update(prev.id, row); else store.feedback.insert({ id: id('fb'), ...row });
    c.messages[idx].rating = rating; store.conversations.update(c.id, { messages: c.messages });
    ctx.log('feedback.create', { type: 'deployment', id: c.deploymentId }, { rating, shared, answerSha256: row.answerSha256 });
    return { ok: true, rating, shared };
  }, { maxBody: 8192 });
  route('GET', '/api/feedback', 'models.read', (ctx) => {
    needOrg(ctx);
    return store.feedback.filter((f) => f.orgId === ctx.orgId).sort((a, b) => (a.ts < b.ts ? 1 : -1)).map((f) => ({ ...f, userName: f.shared ? userName(f.userId) : null, userId: undefined, deploymentName: depName(f.deploymentId) }));
  });

  // ---------- evaluation sets ----------
  const readCases = (cases) => {
    if (!Array.isArray(cases) || !cases.length) throw new HttpError(400, 'Add at least one test case');
    if (cases.length > 50) throw new HttpError(400, 'At most 50 cases per set');
    return cases.map((c) => ({ q: str(c.q, 1000, 'Question'), mustInclude: (Array.isArray(c.mustInclude) ? c.mustInclude : String(c.mustInclude || '').split(',')).map((x) => String(x).trim()).filter(Boolean).slice(0, 8) }));
  };
  const evalView = (e) => { const runs = store.evalruns.filter((r) => r.evalId === e.id).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)); return { ...e, runs: runs.map(({ results, ...r }) => r) }; };
  route('GET', '/api/evals', 'models.read', (ctx) => { needOrg(ctx); return store.evalsets.filter((e) => e.orgId === ctx.orgId).map(evalView); });
  route('POST', '/api/evals', 'models.manage', (ctx) => {
    const e = store.evalsets.insert({ id: id('eval'), orgId: ctx.orgId, name: str(ctx.body.name, 100, 'Name'), description: str(ctx.body.description, 500, 'Description', { required: false }), cases: readCases(ctx.body.cases), createdById: ctx.user.id, createdAt: now() });
    ctx.log('eval.create', { type: 'eval', id: e.id }, { name: e.name, cases: e.cases.length });
    return evalView(e);
  }, { maxBody: 256 * 1024 });
  const getEval = (ctx) => { const e = store.evalsets.get(ctx.params.id); if (!e || e.orgId !== ctx.orgId) throw new HttpError(404, 'Evaluation set not found'); return e; };
  route('PUT', '/api/evals/:id', 'models.manage', (ctx) => {
    const e = getEval(ctx), patch = {};
    if (ctx.body.name !== undefined) patch.name = str(ctx.body.name, 100, 'Name');
    if (ctx.body.description !== undefined) patch.description = str(ctx.body.description, 500, 'Description', { required: false });
    if (ctx.body.cases !== undefined) patch.cases = readCases(ctx.body.cases);
    store.evalsets.update(e.id, patch);
    ctx.log('eval.update', { type: 'eval', id: e.id }, { name: patch.name || e.name, cases: (patch.cases || e.cases).length });
    return evalView(store.evalsets.get(e.id));
  }, { maxBody: 256 * 1024 });
  route('DELETE', '/api/evals/:id', 'models.manage', (ctx) => {
    const e = getEval(ctx);
    store.evalruns.removeWhere((r) => r.evalId === e.id); store.evalsets.remove(e.id);
    ctx.log('eval.delete', { type: 'eval', id: e.id }, { name: e.name });
    return { ok: true };
  });
  route('GET', '/api/evalruns/:id', 'models.read', (ctx) => { const r = store.evalruns.get(ctx.params.id); if (!r || r.orgId !== ctx.orgId) throw new HttpError(404, 'Run not found'); return r; });
  const running = new Set();
  route('POST', '/api/evals/:id/run', 'models.manage', (ctx) => {
    const e = getEval(ctx);
    const dep = store.deployments.get(ctx.body.deploymentId);
    if (!dep || dep.orgId !== ctx.orgId) throw new HttpError(400, 'Choose a deployment to evaluate');
    if (running.has(dep.id)) throw new HttpError(409, 'An evaluation is already running on this deployment');
    const run = store.evalruns.insert({ id: id('run'), orgId: ctx.orgId, evalId: e.id, evalName: e.name, deploymentId: dep.id, deploymentName: dep.name, model: dep.model, status: 'running', done: 0, total: e.cases.length, score: null, passed: 0, avgTps: null, avgMs: null, results: [], startedAt: now(), startedBy: ctx.user.username });
    ctx.log('eval.run', { type: 'eval', id: e.id }, { name: e.name, model: dep.model, state: 'started', runId: run.id });
    running.add(dep.id);
    const user = ctx.user;
    (async () => {
      const cl = app.clientFor(app.nodeFor(dep.orgId, dep.nodeId));
      const results = [];
      for (const c of e.cases) {
        const src = grounding(dep.orgId, c.q);
        const system = (dep.systemPrompt || 'You are a careful assistant.') + (src.length ? `\n\nUse these internal excerpts and cite them as [1], [2]:\n\n${src.map((s) => `[${s.n}] (${s.title})\n${s.text.slice(0, 700)}`).join('\n\n')}` : '');
        const t0 = Date.now();
        try {
          const r = await cl.chat({ model: dep.model, messages: [{ role: 'system', content: system }, { role: 'user', content: c.q }], keep_alive: dep.keepAlive === '-1' ? -1 : dep.keepAlive, options: { num_ctx: dep.numCtx, temperature: 0, num_predict: 300 } });
          const text = (r.message && r.message.content) || '';
          const lower = text.toLowerCase();
          const found = c.mustInclude.filter((w) => lower.includes(w.toLowerCase()));
          const score = c.mustInclude.length ? found.length / c.mustInclude.length : 1;
          const m = app.recordMetric({ orgId: dep.orgId, deploymentId: dep.id, model: dep.model, kind: 'eval', user, fin: r, totalMs: Date.now() - t0, grounded: src.length > 0, sources: src.length, docIds: [...new Set(src.map((s) => s.docId))] });
          results.push({ q: c.q, mustInclude: c.mustInclude, found, score, pass: score === 1, answer: text.slice(0, 1500), tps: m.tps, ms: m.totalMs, sources: src.map((s) => s.title) });
        } catch (err) {
          results.push({ q: c.q, mustInclude: c.mustInclude, found: [], score: 0, pass: false, error: err.message });
        }
        store.evalruns.update(run.id, { done: results.length, results });
      }
      const sc = Math.round((results.reduce((a, r) => a + r.score, 0) / results.length) * 100);
      const tps = results.map((r) => r.tps).filter((x) => x != null), ms = results.map((r) => r.ms).filter(Boolean);
      store.evalruns.update(run.id, { status: 'done', score: sc, passed: results.filter((r) => r.pass).length, avgTps: tps.length ? Math.round((tps.reduce((a, b) => a + b, 0) / tps.length) * 10) / 10 : null, avgMs: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null, finishedAt: now() });
      app.audit(user, 'eval.run', { type: 'eval', id: e.id }, { name: e.name, model: dep.model, state: 'finished', runId: run.id, score: sc });
    })().catch(() => store.evalruns.update(run.id, { status: 'failed', finishedAt: now() })).finally(() => running.delete(dep.id));
    return run;
  });

  // ---------- training data ----------
  const trainView = (t) => ({ ...t, createdByName: userName(t.createdById), docTitle: t.docId ? (store.knowledge.get(t.docId) || {}).title || '(deleted)' : null });
  route('GET', '/api/training', 'models.read', (ctx) => { needOrg(ctx); return store.trainitems.filter((t) => t.orgId === ctx.orgId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(trainView); });
  const readPair = (b) => [{ role: 'user', content: str(b.question, 4000, 'Question') }, { role: 'assistant', content: str(b.answer, 8000, 'Answer') }];
  route('POST', '/api/training', 'models.manage', (ctx) => {
    const fromFb = ctx.body.feedbackId ? store.feedback.get(ctx.body.feedbackId) : null;
    if (ctx.body.feedbackId && (!fromFb || fromFb.orgId !== ctx.orgId || !fromFb.shared)) throw new HttpError(400, 'Only answers that users chose to share can become training data');
    const messages = fromFb ? [{ role: 'user', content: fromFb.question }, { role: 'assistant', content: fromFb.answer }] : readPair(ctx.body);
    const t = store.trainitems.insert({ id: id('tr'), orgId: ctx.orgId, source: fromFb ? 'feedback' : 'manual', feedbackId: fromFb ? fromFb.id : null, docId: null, messages, tags: app.cleanTags(ctx.body.tags), status: fromFb && fromFb.rating === 'up' ? 'approved' : 'pending', createdById: ctx.user.id, createdAt: now() });
    ctx.log('training.create', { type: 'training', id: t.id }, { source: t.source, count: 1 });
    return trainView(t);
  }, { maxBody: 64 * 1024 });
  route('PUT', '/api/training/:id', 'models.manage', (ctx) => {
    const t = store.trainitems.get(ctx.params.id);
    if (!t || t.orgId !== ctx.orgId) throw new HttpError(404, 'Training example not found');
    const patch = {};
    if (ctx.body.status !== undefined) patch.status = oneOf(ctx.body.status, ['pending', 'approved', 'rejected'], 'status');
    if (ctx.body.question !== undefined || ctx.body.answer !== undefined) patch.messages = readPair({ question: ctx.body.question ?? t.messages[0].content, answer: ctx.body.answer ?? t.messages[1].content });
    if (ctx.body.tags !== undefined) patch.tags = app.cleanTags(ctx.body.tags);
    store.trainitems.update(t.id, { ...patch, reviewedById: ctx.user.id, reviewedAt: now() });
    ctx.log('training.update', { type: 'training', id: t.id }, { status: patch.status, edited: !!patch.messages });
    return trainView(store.trainitems.get(t.id));
  }, { maxBody: 64 * 1024 });
  route('DELETE', '/api/training/:id', 'models.manage', (ctx) => {
    const t = store.trainitems.get(ctx.params.id);
    if (!t || t.orgId !== ctx.orgId) throw new HttpError(404, 'Training example not found');
    store.trainitems.remove(t.id);
    ctx.log('training.delete', { type: 'training', id: t.id }, {});
    return { ok: true };
  });
  route('POST', '/api/training/generate', 'models.manage', (ctx) => {
    const doc = store.knowledge.get(ctx.body.docId);
    if (!doc || doc.orgId !== ctx.orgId) throw new HttpError(404, 'Document not found');
    const dep = store.deployments.get(ctx.body.deploymentId);
    if (!dep || dep.orgId !== ctx.orgId) throw new HttpError(400, 'Choose a deployment to generate with');
    const count = Math.round(num(ctx.body.count ?? 5, 1, 15, 'Count'));
    const job = { id: id('job'), orgId: ctx.orgId, kind: 'training.generate', status: 'running', progress: 0, message: `Reading ${doc.title}`, created: 0, startedAt: now() };
    jobs.set(job.id, job);
    const user = ctx.user;
    (async () => {
      const cl = app.clientFor(app.nodeFor(dep.orgId, dep.nodeId));
      const prompt = `Read this internal document and write ${count} realistic questions an employee might ask, each with a correct, concise answer taken only from the document.\nReply with JSON only: {"pairs":[{"question":"...","answer":"..."}]}\n\nDocument: ${doc.title}\n${doc.text.slice(0, 6000)}`;
      const t0 = Date.now();
      const r = await cl.chat({ model: dep.model, format: 'json', messages: [{ role: 'system', content: 'You create training data from documents. Answer with valid JSON only. Never invent facts that are not in the document.' }, { role: 'user', content: prompt }], keep_alive: dep.keepAlive === '-1' ? -1 : dep.keepAlive, options: { num_ctx: Math.max(dep.numCtx, 4096), temperature: 0.3, num_predict: 1200 } });
      app.recordMetric({ orgId: dep.orgId, deploymentId: dep.id, model: dep.model, kind: 'training', user, fin: r, totalMs: Date.now() - t0, grounded: true, sources: 1, docIds: [doc.id] });
      const text = (r.message && r.message.content) || '';
      let pairs = [];
      try { const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); pairs = Array.isArray(j.pairs) ? j.pairs : Array.isArray(j) ? j : []; } catch (_) { pairs = []; }
      pairs = pairs.filter((p) => p && p.question && p.answer).slice(0, count);
      for (const p of pairs) store.trainitems.insert({ id: id('tr'), orgId: dep.orgId, source: 'generated', docId: doc.id, model: dep.model, messages: [{ role: 'user', content: String(p.question).slice(0, 4000) }, { role: 'assistant', content: String(p.answer).slice(0, 8000) }], tags: doc.tags || [], status: 'pending', createdById: user.id, createdAt: now() });
      app.audit(user, 'training.create', { type: 'document', id: doc.id }, { source: `document “${doc.title}”`, count: pairs.length, model: dep.model, responseSha256: sha256(text) });
      Object.assign(job, { status: 'done', progress: 100, created: pairs.length, message: pairs.length ? `${pairs.length} examples drafted for review` : 'The model did not return usable examples' });
    })().catch((e) => Object.assign(job, { status: 'failed', message: e.message }));
    return job;
  });
  route('GET', '/api/training/export', 'models.manage', (ctx) => {
    const items = store.trainitems.filter((t) => t.orgId === ctx.orgId && t.status === 'approved');
    const body = items.map((t) => JSON.stringify({ messages: t.messages })).join('\n') + (items.length ? '\n' : '');
    ctx.log('training.export', { type: 'training', id: ctx.orgId }, { count: items.length, sha256: sha256(body) });
    app.send(ctx.res, 200, body, { 'content-type': 'application/x-ndjson', 'content-disposition': `attachment; filename="vector-training-${new Date().toISOString().slice(0, 10)}.jsonl"` });
  });

  // ---------- custom models ----------
  route('GET', '/api/models/custom', 'models.read', (ctx) => { needOrg(ctx); return store.custommodels.filter((m) => m.orgId === ctx.orgId).map((m) => ({ ...m, byName: userName(m.byId) })); });
  route('POST', '/api/models/create', 'models.manage', async (ctx) => {
    needOrg(ctx);
    const name = String(ctx.body.name || '').trim().toLowerCase();
    if (!TAG_RE.test(name)) throw new HttpError(400, 'Model name must look like an Ollama tag, for example pulse-assistant:v1');
    const from = String(ctx.body.from || '').trim();
    if (!TAG_RE.test(from)) throw new HttpError(400, 'Choose an installed base model');
    const system = str(ctx.body.system, 8000, 'Instructions');
    const temperature = num(ctx.body.temperature ?? 0.3, 0, 2, 'Temperature', 0.3);
    const numCtx = Math.round(num(ctx.body.numCtx ?? 4096, 512, 262144, 'Context length', 4096));
    const docIds = (Array.isArray(ctx.body.docIds) ? ctx.body.docIds : []).filter((d) => { const k = store.knowledge.get(d); return k && k.orgId === ctx.orgId; });
    const node = app.nodeFor(ctx.orgId, ctx.body.node);
    // Approved training examples are packaged into the model as example conversations (Ollama MESSAGE),
    // so the model answers in the organization's style. Weight-level fine-tuning uses the JSONL export on a GPU host.
    const examples = ctx.body.includeTraining ? store.trainitems.filter((t) => t.orgId === ctx.orgId && t.status === 'approved').slice(0, 16).flatMap((t) => [{ role: 'user', content: t.messages[0].content.slice(0, 1200) }, { role: 'assistant', content: t.messages[1].content.slice(0, 2000) }]) : [];
    try { await app.clientFor(node).create({ model: name, from, system, parameters: { temperature, num_ctx: numCtx }, ...(examples.length ? { messages: examples } : {}) }); }
    catch (e) { ctx.log('model.create', { type: 'model', id: name }, { name, from, error: e.message }, 'error'); throw e; }
    const rec = store.custommodels.insert({ id: id('cm'), orgId: ctx.orgId, name, from, systemSha256: sha256(system), system, temperature, numCtx, docIds, examples: examples.length / 2, approvedTraining: store.trainitems.filter((t) => t.orgId === ctx.orgId && t.status === 'approved').length, byId: ctx.user.id, createdAt: now() });
    ctx.log('model.create', { type: 'model', id: name }, { name, from, systemSha256: rec.systemSha256, docIds, temperature, numCtx, examples: rec.examples });
    return rec;
  }, { maxBody: 64 * 1024 });
};
module.exports.EU_MEMBERS = EU_MEMBERS;
