'use strict';
// Customer detail for Vector operators: health, usage and compliance posture of one organization.
// Counts and aggregates only. Operators never receive documents, prompts, answers or task text.
const { HttpError } = require('./util');
const { BUILTIN, roleFor } = require('./rbac');
const { aggregate } = require('./routes-insights');

module.exports = function (app) {
  const { store, route, ledgers } = app;
  route('GET', '/api/ops/orgs/:id', 'ops.view', async (ctx) => {
    const org = store.orgs.get(ctx.params.id);
    if (!org) throw new HttpError(404, 'Organization not found');
    const users = store.users.filter((u) => u.orgId === org.id);
    const byRole = {};
    users.forEach((u) => { const r = roleFor(store, u.roleId, org.id); const k = r ? r.name : u.roleId; byRole[k] = (byRole[k] || 0) + 1; });
    const deps = (await app.viewDeployments(store.deployments.filter((d) => d.orgId === org.id))).map((d) => ({ id: d.id, name: d.name, model: d.model, status: d.status, gpuShare: d.gpuShare ?? null, requests: d.stats ? d.stats.requests : 0, lastUsedAt: d.stats ? d.stats.lastUsedAt : null }));
    const m = aggregate(store.metrics.filter((x) => x.orgId === org.id), ctx.query.range || '7d');
    // compliance posture computed as the organization owner would see it, then reduced to aggregates
    const pseudo = { orgId: org.id, perms: BUILTIN.owner.perms, user: { id: null, department: '' } };
    const ins = app.complianceInsights(pseudo);
    const items = ins.items;
    const exp = app.exposureFor(pseudo);
    const tasks = store.tasks.filter((t) => t.orgId === org.id);
    const today = new Date().toISOString().slice(0, 10);
    const L = ledgers.for(org.id), v = L.verify();
    const areas = {};
    L.entries.forEach((e) => { const k = e.action.split('.')[0]; areas[k] = (areas[k] || 0) + 1; });
    return {
      org: { id: org.id, name: org.name, industry: org.industry, jurisdictions: org.jurisdictions, deploymentType: org.deploymentType, disabled: !!org.disabled, demo: !!org.demo, createdAt: org.createdAt },
      users: { total: users.length, active: users.filter((u) => !u.disabled).length, lastLogin: users.map((u) => u.lastLoginAt).filter(Boolean).sort().pop() || null, byRole },
      deployments: deps,
      metrics: { range: m.range, stepMs: m.stepMs, series: m.series.map(({ t, requests, errors, completionTokens, tps, p95 }) => ({ t, requests, errors, completionTokens, tps, p95 })), totals: m.totals, byModel: m.byModel, byKind: m.byKind },
      knowledge: { documents: store.knowledge.filter((d) => d.orgId === org.id).length, training: store.trainitems.filter((t) => t.orgId === org.id && t.status === 'approved').length, evalRuns: store.evalruns.filter((r) => r.orgId === org.id && r.status === 'done').length, customModels: store.custommodels.filter((c) => c.orgId === org.id).map((c) => c.name) },
      compliance: { readiness: ins.readiness, bands: ins.bands, total: items.length, byLevel: items.reduce((a, i) => { a[i.level] = (a[i.level] || 0) + 1; return a; }, {}), byStatus: items.reduce((a, i) => { a[i.status] = (a[i.status] || 0) + 1; return a; }, {}), totals: exp.totals, places: exp.places, controlsActive: ins.controls.filter((c) => c.active).length, controls: ins.controls.length },
      tasks: { total: tasks.length, open: tasks.filter((t) => t.status === 'open').length, inProgress: tasks.filter((t) => t.status === 'in_progress').length, blocked: tasks.filter((t) => t.status === 'blocked').length, done: tasks.filter((t) => t.status === 'done').length, overdue: tasks.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < today).length },
      ledger: { length: L.entries.length, ok: v.ok, reason: v.reason, brokenAt: v.brokenAt, head: L.head(), lastActivity: L.entries.length ? L.entries[L.entries.length - 1].ts : null, byArea: Object.entries(areas).map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n), anchors: store.anchors.filter((a) => a.scope === org.id).length },
      notice: 'Operator view: counts, health and posture only. Documents, prompts, answers and task text stay with the customer.',
    };
  });
};
