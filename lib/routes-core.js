'use strict';
const { HttpError, id, now, str, oneOf } = require('./util');
const { hashPassword, verifyPassword, DUMMY } = require('./auth');
const { PERMS, ORG_PERMS, BUILTIN, roleFor, isSubset } = require('./rbac');
const C = require('./compliance');
const D = require('./compliance-data');

module.exports = function (app) {
  const { store, ledgers, sessions, limiter, route, audit } = app;
  const orgView = (o) => ({ id: o.id, name: o.name, industry: o.industry, industryName: (D.INDUSTRIES.find((i) => i.id === o.industry) || {}).name || o.industry, jurisdictions: o.jurisdictions, deploymentType: o.deploymentType, disabled: !!o.disabled, demo: !!o.demo, createdAt: o.createdAt });

  function mePayload(user) {
    const role = roleFor(store, user.roleId, user.orgId);
    const org = user.orgId ? store.orgs.get(user.orgId) : null;
    return { user: app.sanitizeUser(user), org: org ? orgView(org) : null, perms: role ? role.perms : [], scope: role ? role.scope : 'org', authMode: app.demoLogin ? 'demo' : 'password' };
  }

  route('GET', '/api/health', null, () => ({ ok: true, version: app.version }));

  // ---------- authentication ----------
  route('POST', '/api/auth/login', null, (ctx) => {
    const username = String(ctx.body.username || '').trim().toLowerCase();
    const password = String(ctx.body.password || '');
    if (!username || !password) throw new HttpError(400, 'Enter your username and password');
    const key = `${username}|${ctx.ip}`;
    if (limiter.locked(key)) throw new HttpError(429, 'Too many failed attempts. Try again in a few minutes.');
    const user = store.users.find((u) => u.username === username);
    const org = user && user.orgId ? store.orgs.get(user.orgId) : null;
    const passOk = verifyPassword(password, user ? user.passwordHash : DUMMY);
    if (!(user && passOk && !user.disabled && !(org && org.disabled))) {
      limiter.fail(key);
      audit(null, 'auth.login', { type: 'user', id: user ? user.id : null }, { username: username.slice(0, 40) }, 'denied', user ? user.orgId : null);
      throw new HttpError(401, 'Invalid username or password');
    }
    limiter.clear(key);
    app.setCookie(ctx.res, sessions.create(user.id));
    store.users.update(user.id, { lastLoginAt: now() });
    audit(user, 'auth.login', { type: 'user', id: user.id }, {});
    return mePayload(user);
  });
  // ---------- demo sign-in (no passwords; enabled by the server for local demos) ----------
  // Contact form on the public site. Stored locally for the Vector team; nothing is sent anywhere.
  let leadWindow = { t: 0, n: 0 };
  route('POST', '/api/site/contact', null, (ctx) => {
    const t = Date.now(); if (t - leadWindow.t > 60000) leadWindow = { t, n: 0 };
    if (++leadWindow.n > 20) throw new HttpError(429, 'Too many requests, try again in a minute');
    const b = ctx.body || {}, s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
    const lead = { id: id('lead'), name: s(b.name, 120), email: s(b.email, 160), organization: s(b.organization, 160), industry: s(b.industry, 60), message: s(b.message, 2000), ts: now() };
    if (!lead.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lead.email)) throw new HttpError(400, 'Add your name and a valid work email');
    store.leads.insert(lead);
    if (store.leads.filter(() => true).length > 2000) store.leads.removeWhere((l) => l.ts < lead.ts && Math.random() < 0.1);
    return { ok: true };
  }, { maxBody: 8 * 1024 });
  route('GET', '/api/site/leads', 'orgs.manage', () => store.leads.filter(() => true).sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 200));
  route('GET', '/api/auth/mode', null, () => ({ mode: app.demoLogin ? 'demo' : 'password' }));
  route('GET', '/api/auth/demo-accounts', null, () => {
    if (!app.demoLogin) throw new HttpError(404, 'Demo sign-in is not enabled');
    return store.users.filter((u) => !u.disabled && !(u.orgId && (store.orgs.get(u.orgId) || {}).disabled)).map((u) => {
      const r = roleFor(store, u.roleId, u.orgId), o = u.orgId ? store.orgs.get(u.orgId) : null;
      return { username: u.username, displayName: u.displayName, roleName: r ? r.name : u.roleId, department: u.department || '', orgId: u.orgId, orgName: o ? o.name : 'Vector team' };
    });
  });
  route('POST', '/api/auth/demo-login', null, (ctx) => {
    if (!app.demoLogin) throw new HttpError(404, 'Demo sign-in is not enabled');
    const user = store.users.find((u) => u.username === String(ctx.body.username || '').trim().toLowerCase());
    const org = user && user.orgId ? store.orgs.get(user.orgId) : null;
    if (!user || user.disabled || (org && org.disabled)) throw new HttpError(404, 'Account not found');
    if (user.mustChange) store.users.update(user.id, { mustChange: false });
    app.setCookie(ctx.res, sessions.create(user.id));
    store.users.update(user.id, { lastLoginAt: now() });
    audit(user, 'auth.login', { type: 'user', id: user.id }, { method: 'demo account picker' });
    return mePayload(store.users.get(user.id));
  });
  route('POST', '/api/auth/logout', 'auth', (ctx) => {
    sessions.destroy(ctx.token); app.clearCookie(ctx.res);
    ctx.log('auth.logout', { type: 'user', id: ctx.user.id }, {});
    return { ok: true };
  });
  route('GET', '/api/me', 'auth', (ctx) => mePayload(ctx.user));
  route('POST', '/api/auth/password', 'auth', (ctx) => {
    const { current, next } = ctx.body;
    if (!verifyPassword(String(current || ''), ctx.user.passwordHash)) {
      ctx.log('auth.password_change', { type: 'user', id: ctx.user.id }, {}, 'denied');
      throw new HttpError(400, 'Current password is incorrect');
    }
    if (typeof next !== 'string' || next.length < 10) throw new HttpError(400, 'New password must be at least 10 characters');
    if (next === current) throw new HttpError(400, 'Choose a different password');
    store.users.update(ctx.user.id, { passwordHash: hashPassword(next), mustChange: false });
    sessions.destroyUser(ctx.user.id);
    app.setCookie(ctx.res, sessions.create(ctx.user.id));
    ctx.log('auth.password_change', { type: 'user', id: ctx.user.id }, {});
    return { ok: true };
  });

  // ---------- organizations (Vector operators) ----------
  route('GET', '/api/orgs', 'orgs.manage', () => store.orgs.all().map((o) => ({
    ...orgView(o),
    users: store.users.filter((u) => u.orgId === o.id).length,
    deployments: store.deployments.filter((d) => d.orgId === o.id).length,
  })));
  route('POST', '/api/orgs', 'orgs.manage', (ctx) => {
    const b = ctx.body;
    const { org, owner, tempPassword } = app.createOrg({ name: b.name, industry: b.industry, jurisdictions: b.jurisdictions, deploymentType: b.deploymentType, ownerUsername: b.ownerUsername, ownerName: b.ownerName, ownerPassword: b.ownerPassword }, ctx.user);
    if (app.demoLogin) { store.users.update(owner.id, { mustChange: false }); return { org: orgView(org), owner: app.sanitizeUser(store.users.get(owner.id)) }; }
    return { org: orgView(org), owner: app.sanitizeUser(owner), tempPassword: b.ownerPassword ? undefined : tempPassword };
  });
  route('PUT', '/api/orgs/:id', 'orgs.manage', (ctx) => {
    const org = store.orgs.get(ctx.params.id);
    if (!org) throw new HttpError(404, 'Organization not found');
    const b = ctx.body, patch = {}, before = {};
    if (b.name !== undefined) { patch.name = str(b.name, 120, 'Name'); }
    if (b.industry !== undefined || b.jurisdictions !== undefined) {
      Object.assign(patch, C.validateProfile({ industry: b.industry ?? org.industry, jurisdictions: b.jurisdictions ?? org.jurisdictions }));
    }
    if (b.deploymentType !== undefined) patch.deploymentType = oneOf(b.deploymentType, ['on_prem', 'private_cloud', 'hybrid', 'air_gapped'], 'deploymentType');
    if (b.disabled !== undefined) patch.disabled = !!b.disabled;
    for (const k of Object.keys(patch)) before[k] = org[k];
    store.orgs.update(org.id, patch);
    if (patch.disabled) store.users.filter((u) => u.orgId === org.id).forEach((u) => sessions.destroyUser(u.id));
    ctx.log('org.update', { type: 'org', id: org.id }, { before, after: patch });
    return orgView(store.orgs.get(org.id));
  });
  route('DELETE', '/api/orgs/:id', 'orgs.manage', (ctx) => {
    const org = store.orgs.get(ctx.params.id);
    if (!org) throw new HttpError(404, 'Organization not found');
    if (!org.disabled) throw new HttpError(409, 'Disable the organization before deleting it');
    const gone = {};
    store.users.filter((u) => u.orgId === org.id).forEach((u) => sessions.destroyUser(u.id));
    gone.users = store.users.removeWhere((x) => x.orgId === org.id);
    gone.deployments = store.deployments.removeWhere((x) => x.orgId === org.id);
    gone.conversations = store.conversations.removeWhere((x) => x.orgId === org.id);
    gone.knowledge = store.knowledge.removeWhere((x) => x.orgId === org.id);
    gone.nodes = store.nodes.removeWhere((x) => x.orgId === org.id);
    gone.roles = store.roles.removeWhere((x) => x.orgId === org.id);
    store.obstatus.removeWhere((x) => x.orgId === org.id);
    store.custobs.removeWhere((x) => x.orgId === org.id);
    store.evidence.removeWhere((x) => x.orgId === org.id);
    store.orgs.remove(org.id);
    ctx.log('org.delete', { type: 'org', id: org.id }, { name: org.name, removed: gone, note: 'the organization ledger file is retained on disk' });
    return { ok: true };
  });

  // ---------- own organization ----------
  route('GET', '/api/org', 'org.read', (ctx) => orgView(store.orgs.get(ctx.orgId)));
  route('PUT', '/api/org', 'org.manage', (ctx) => {
    const org = store.orgs.get(ctx.orgId), b = ctx.body, patch = {}, before = {};
    if (b.name !== undefined) patch.name = str(b.name, 120, 'Name');
    if (b.industry !== undefined || b.jurisdictions !== undefined) Object.assign(patch, C.validateProfile({ industry: b.industry ?? org.industry, jurisdictions: b.jurisdictions ?? org.jurisdictions }));
    if (b.deploymentType !== undefined) patch.deploymentType = oneOf(b.deploymentType, ['on_prem', 'private_cloud', 'hybrid', 'air_gapped'], 'deploymentType');
    for (const k of Object.keys(patch)) before[k] = org[k];
    store.orgs.update(org.id, patch);
    ctx.log('org.update', { type: 'org', id: org.id }, { before, after: patch });
    return orgView(store.orgs.get(org.id));
  });

  // ---------- users ----------
  const usersOf = (ctx) => store.users.filter((u) => u.orgId === ctx.orgId);
  const targetUser = (ctx) => {
    const u = store.users.get(ctx.params.id);
    if (!u || u.orgId !== ctx.orgId) throw new HttpError(404, 'User not found');
    return u;
  };
  const assertManageable = (ctx, u) => {
    const r = roleFor(store, u.roleId, u.orgId);
    if (!r || !isSubset(r.perms, ctx.perms)) throw new HttpError(403, 'You cannot manage a user whose role has more permissions than yours');
  };
  const activeOwners = (orgId) => store.users.filter((x) => x.orgId === orgId && x.roleId === 'owner' && !x.disabled);

  route('GET', '/api/users', 'users.read', (ctx) => usersOf(ctx).map(app.sanitizeUser));
  route('POST', '/api/users', 'users.manage', (ctx) => {
    const b = ctx.body;
    const role = roleFor(store, b.roleId, ctx.orgId);
    app.assertCanGrant(ctx.perms, role);
    const { user, tempPassword } = app.createUserRecord({ orgId: ctx.orgId, username: b.username, displayName: b.displayName, roleId: b.roleId, department: b.department, password: b.password });
    ctx.log('user.create', { type: 'user', id: user.id }, { username: user.username, roleId: user.roleId, department: user.department });
    if (app.demoLogin) { store.users.update(user.id, { mustChange: false }); return { user: app.sanitizeUser(store.users.get(user.id)) }; }
    return { user: app.sanitizeUser(user), tempPassword: b.password ? undefined : tempPassword };
  });
  route('PUT', '/api/users/:id', 'users.manage', (ctx) => {
    const u = targetUser(ctx), b = ctx.body, patch = {}, changes = {};
    assertManageable(ctx, u);
    if (b.displayName !== undefined) patch.displayName = str(b.displayName, 80, 'Display name');
    if (b.department !== undefined) patch.department = String(b.department).trim().slice(0, 60);
    if (b.roleId !== undefined && b.roleId !== u.roleId) {
      if (u.id === ctx.user.id) throw new HttpError(400, 'You cannot change your own role');
      const role = roleFor(store, b.roleId, ctx.orgId);
      app.assertCanGrant(ctx.perms, role);
      if (u.roleId === 'owner' && activeOwners(ctx.orgId).length <= 1) throw new HttpError(409, 'An organization must keep at least one active owner');
      patch.roleId = b.roleId;
    }
    if (b.disabled !== undefined && !!b.disabled !== !!u.disabled) {
      if (u.id === ctx.user.id) throw new HttpError(400, 'You cannot disable your own account');
      if (b.disabled && u.roleId === 'owner' && activeOwners(ctx.orgId).length <= 1) throw new HttpError(409, 'An organization must keep at least one active owner');
      patch.disabled = !!b.disabled;
    }
    for (const k of Object.keys(patch)) if (k !== 'displayName') changes[k] = { from: u[k], to: patch[k] };
    store.users.update(u.id, patch);
    if (patch.roleId !== undefined || patch.disabled) sessions.destroyUser(u.id);
    ctx.log('user.update', { type: 'user', id: u.id }, { username: u.username, changes });
    return app.sanitizeUser(store.users.get(u.id));
  });
  route('POST', '/api/users/:id/reset-password', 'users.manage', (ctx) => {
    const u = targetUser(ctx);
    assertManageable(ctx, u);
    const { randomPassword } = require('./util');
    const temp = randomPassword();
    store.users.update(u.id, { passwordHash: hashPassword(temp), mustChange: true });
    sessions.destroyUser(u.id);
    ctx.log('user.reset_password', { type: 'user', id: u.id }, { username: u.username });
    return { tempPassword: temp };
  });
  route('DELETE', '/api/users/:id', 'users.manage', (ctx) => {
    const u = targetUser(ctx);
    assertManageable(ctx, u);
    if (u.id === ctx.user.id) throw new HttpError(400, 'You cannot delete your own account');
    if (u.roleId === 'owner' && activeOwners(ctx.orgId).length <= 1) throw new HttpError(409, 'An organization must keep at least one active owner');
    sessions.destroyUser(u.id);
    const convs = store.conversations.removeWhere((c) => c.userId === u.id);
    store.users.remove(u.id);
    ctx.log('user.delete', { type: 'user', id: u.id }, { username: u.username, conversationsRemoved: convs });
    return { ok: true };
  });

  // ---------- roles ----------
  const rolesView = (ctx) => {
    const builtin = Object.entries(BUILTIN).filter(([, r]) => r.scope === 'org').map(([rid, r]) => ({ id: rid, name: r.name, description: r.desc, perms: r.perms, builtin: true }));
    const custom = store.roles.filter((r) => r.orgId === ctx.orgId).map((r) => ({ id: r.id, name: r.name, description: r.description, perms: r.perms, builtin: false }));
    return builtin.concat(custom);
  };
  route('GET', '/api/roles', 'auth', (ctx) => {
    if (!ctx.orgId) return { roles: [], perms: {} };
    return { roles: rolesView(ctx), perms: Object.fromEntries(ORG_PERMS.map((p) => [p, PERMS[p]])) };
  });
  const cleanPerms = (ctx, perms) => {
    if (!Array.isArray(perms) || !perms.length) throw new HttpError(400, 'Choose at least one permission');
    const set = [...new Set(perms)];
    for (const p of set) if (!ORG_PERMS.includes(p)) throw new HttpError(400, `Unknown permission: ${String(p).slice(0, 40)}`);
    if (!isSubset(set, ctx.perms)) throw new HttpError(403, 'You cannot grant permissions you do not hold');
    return set;
  };
  route('POST', '/api/roles', 'roles.manage', (ctx) => {
    const name = str(ctx.body.name, 60, 'Role name');
    if (rolesView(ctx).some((r) => r.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, 'A role with that name already exists');
    const role = store.roles.insert({ id: id('role'), orgId: ctx.orgId, name, description: str(ctx.body.description, 200, 'Description', { required: false }), perms: cleanPerms(ctx, ctx.body.perms), createdAt: now() });
    ctx.log('role.create', { type: 'role', id: role.id }, { name, perms: role.perms });
    return { id: role.id, name: role.name, description: role.description, perms: role.perms, builtin: false };
  });
  route('PUT', '/api/roles/:id', 'roles.manage', (ctx) => {
    const r = store.roles.get(ctx.params.id);
    if (!r || r.orgId !== ctx.orgId) throw new HttpError(404, 'Custom role not found');
    const patch = {};
    if (ctx.body.name !== undefined) patch.name = str(ctx.body.name, 60, 'Role name');
    if (ctx.body.description !== undefined) patch.description = str(ctx.body.description, 200, 'Description', { required: false });
    if (ctx.body.perms !== undefined) patch.perms = cleanPerms(ctx, ctx.body.perms);
    const before = { name: r.name, perms: r.perms };
    store.roles.update(r.id, patch);
    ctx.log('role.update', { type: 'role', id: r.id }, { before, after: { name: patch.name ?? r.name, perms: patch.perms ?? r.perms } });
    const n = store.roles.get(r.id);
    return { id: n.id, name: n.name, description: n.description, perms: n.perms, builtin: false };
  });
  route('DELETE', '/api/roles/:id', 'roles.manage', (ctx) => {
    const r = store.roles.get(ctx.params.id);
    if (!r || r.orgId !== ctx.orgId) throw new HttpError(404, 'Custom role not found');
    if (store.users.find((u) => u.roleId === r.id)) throw new HttpError(409, 'Reassign the users who hold this role first');
    store.roles.remove(r.id);
    ctx.log('role.delete', { type: 'role', id: r.id }, { name: r.name });
    return { ok: true };
  });

  // ---------- ledger ----------
  const scopeName = (s) => (s === 'platform' ? 'Platform' : (store.orgs.get(s) || {}).name || s);
  route('GET', '/api/ledger', 'audit.read', (ctx) => {
    const q = ctx.query;
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 50)), offset = Math.max(0, Number(q.offset) || 0);
    const f = { action: q.action || undefined, actor: q.actor || undefined, outcome: q.outcome || undefined, q: q.q || undefined };
    if (!ctx.orgId && q.scope === 'all') {
      let rows = [];
      for (const s of ledgers.scopes()) rows = rows.concat(ledgers.for(s).list({ ...f, limit: 1e9 }).entries.map((e) => ({ ...e, scope: s, scopeName: scopeName(s) })));
      rows.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
      return { scope: 'all', total: rows.length, entries: rows.slice(offset, offset + limit).map((e) => ({ ...e, text: app.describeEntry(e), who: app.whoOf(e) })), scopes: ledgers.scopes().map((s) => ({ id: s, name: scopeName(s) })) };
    }
    const scope = ctx.orgId || q.scope || 'platform';
    if (!ledgers.map.has(scope)) throw new HttpError(404, 'Ledger not found');
    const L = ledgers.for(scope);
    const r = L.list({ ...f, limit, offset });
    r.entries = r.entries.map((e) => ({ ...e, text: app.describeEntry ? app.describeEntry(e) : e.action, who: app.whoOf ? app.whoOf(e) : null }));
    return { scope, scopeName: scopeName(scope), ...r, length: L.entries.length, head: L.head(), loadError: L.loadError, scopes: ctx.orgId ? undefined : ledgers.scopes().map((s) => ({ id: s, name: scopeName(s) })) };
  });
  route('GET', '/api/ledger/verify', 'audit.verify', (ctx) => {
    const results = ctx.orgId ? [ledgers.for(ctx.orgId).verify()] : ledgers.verifyAll();
    const ok = results.every((r) => r.ok);
    ctx.log('ledger.verify', { type: 'ledger', id: ctx.orgId || 'all' }, { ok, chains: results.length, firstFailure: ok ? null : results.find((r) => !r.ok) });
    if (!ok && ctx.orgId) app.audit(null, 'ledger.integrity_failure', { type: 'ledger', id: ctx.orgId }, { detectedBy: ctx.user.username, failure: results.find((r) => !r.ok) }, 'error', null);
    return { ok, results: results.map((r) => ({ ...r, scopeName: scopeName(r.scope) })) };
  });
  route('GET', '/api/ledger/export', 'audit.export', (ctx) => {
    const scope = ctx.orgId || ctx.query.scope || 'platform';
    if (!ledgers.map.has(scope)) throw new HttpError(404, 'Ledger not found');
    const L = ledgers.for(scope);
    const payload = { format: 'vector-ledger/1', scope, scopeName: scopeName(scope), exportedAt: now(), length: L.entries.length, head: L.head(), entries: L.entries, howToVerify: 'Run: node scripts/verify-ledger.js <this file>. Each entry hashes (SHA-256) its canonical JSON including the previous entry hash.' };
    ctx.log('ledger.export', { type: 'ledger', id: scope }, { entries: L.entries.length, headAtExport: L.head() });
    app.send(ctx.res, 200, JSON.stringify(payload, null, 1), { 'content-disposition': `attachment; filename="vector-ledger-${scope}-${new Date().toISOString().slice(0, 10)}.json"` });
  });
};
