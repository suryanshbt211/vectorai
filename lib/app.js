'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { openStore } = require('./store');
const { LedgerSet } = require('./ledger');
const { Sessions, LoginLimiter, parseCookies, hashPassword } = require('./auth');
const { permsOf, roleFor, BUILTIN, isSubset } = require('./rbac');
const { OllamaClient, OllamaError } = require('./ollama');
const { Sampler } = require('./gpu');
const { HttpError, id, now, str, randomPassword } = require('./util');
const C = require('./compliance');
const pkg = require('../package.json');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };
const MUST_CHANGE_OK = new Set(['/api/me', '/api/auth/password', '/api/auth/logout', '/api/health']);
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,39}$/;

function createApp(opts = {}) {
  const root = path.join(__dirname, '..');
  const dataDir = path.resolve(opts.dataDir || process.env.VECTOR_DATA_DIR || path.join(root, 'data'));
  const ollamaUrl = opts.ollamaUrl || process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
  const cookieSecure = opts.cookieSecure ?? process.env.COOKIE_SECURE === '1';

  const store = openStore(dataDir);
  const ledgers = new LedgerSet(path.join(dataDir, 'ledger'));
  const sessions = new Sessions();
  const limiter = new LoginLimiter();
  const local = new OllamaClient(ollamaUrl);
  const sampler = new Sampler(local);
  const routes = [];
  const app = { store, ledgers, sessions, limiter, local, sampler, dataDir, ollamaUrl, version: pkg.version, MIME };
  // Demo sign-in: pick an account instead of typing a password. Off unless the server enables it (localhost only by default).
  app.demoLogin = !!opts.demoLogin;

  // ---------- routing ----------
  app.route = (method, pattern, perm, handler, o = {}) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:[a-zA-Z]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, perm, handler, maxBody: o.maxBody || 1024 * 1024 });
  };

  // ---------- ledger ----------
  app.audit = (user, action, resource, meta, outcome = 'ok', orgIdOverride) => {
    const orgId = orgIdOverride !== undefined ? orgIdOverride : user ? user.orgId : null;
    return ledgers.append(orgId || 'platform', {
      orgId: orgId || null,
      actor: user ? { id: user.id, username: user.username, role: user.roleId } : null,
      action, resource: resource || null, outcome, meta: meta || {},
    });
  };

  // ---------- nodes ----------
  const clientCache = new Map();
  app.localNode = () => ({ id: 'local', name: 'This server (local Ollama)', url: ollamaUrl, shared: true });
  app.nodeFor = (orgId, nodeId) => {
    if (!nodeId || nodeId === 'local') return app.localNode();
    const n = store.nodes.get(nodeId);
    if (!n || n.orgId !== orgId) throw new HttpError(404, 'Node not found');
    return n;
  };
  app.clientFor = (node) => {
    if (node.url === ollamaUrl) return local;
    if (!clientCache.has(node.url)) clientCache.set(node.url, new OllamaClient(node.url));
    return clientCache.get(node.url);
  };
  app.wrapOllama = (e) => {
    if (e instanceof HttpError) return e;
    if (e instanceof OllamaError) return new HttpError(e.status === 404 ? 404 : 502, e.message, 'ollama_error');
    return e;
  };

  // ---------- services ----------
  app.sanitizeUser = (u) => {
    const r = roleFor(store, u.roleId, u.orgId);
    return { id: u.id, username: u.username, displayName: u.displayName, roleId: u.roleId, roleName: r ? r.name : u.roleId, department: u.department || '', orgId: u.orgId, disabled: !!u.disabled, mustChange: !!u.mustChange, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || null };
  };
  app.createUserRecord = ({ orgId, username, displayName, roleId, department = '', password, mustChange = true }) => {
    username = String(username || '').trim().toLowerCase();
    if (!USERNAME_RE.test(username)) throw new HttpError(400, 'Username must be 3-40 characters: lowercase letters, digits, dot, dash or underscore');
    if (store.users.find((u) => u.username === username)) throw new HttpError(409, 'That username is already taken');
    displayName = str(displayName || username, 80, 'Display name');
    if (!roleFor(store, roleId, orgId)) throw new HttpError(400, 'Unknown role');
    if (password !== undefined && (typeof password !== 'string' || password.length < 10)) throw new HttpError(400, 'Password must be at least 10 characters');
    const temp = password || randomPassword();
    const user = store.users.insert({ id: id('usr'), orgId, username, displayName, roleId, department: String(department || '').trim().slice(0, 60), passwordHash: hashPassword(temp), mustChange, disabled: false, createdAt: now(), lastLoginAt: null });
    return { user, tempPassword: temp };
  };
  app.createOrg = ({ name, industry, jurisdictions, deploymentType, ownerUsername, ownerName, ownerPassword, forceChange = true }, actor) => {
    name = str(name, 120, 'Organization name');
    const profile = C.validateProfile({ industry, jurisdictions: jurisdictions || [] });
    deploymentType = ['on_prem', 'private_cloud', 'hybrid', 'air_gapped'].includes(deploymentType) ? deploymentType : 'on_prem';
    const org = { id: id('org'), name, ...profile, deploymentType, disabled: false, createdAt: now() };
    const { user: owner, tempPassword } = app.createUserRecord({ orgId: org.id, username: ownerUsername, displayName: ownerName || ownerUsername, roleId: 'owner', password: ownerPassword, mustChange: forceChange });
    store.orgs.insert(org);
    app.audit(actor, 'org.create', { type: 'org', id: org.id }, { name, industry: profile.industry, jurisdictions: profile.jurisdictions, ownerUsername: owner.username }, 'ok', null);
    ledgers.for(org.id);
    app.audit({ id: owner.id, username: owner.username, roleId: 'owner', orgId: org.id }, 'org.provisioned', { type: 'org', id: org.id }, { by: actor ? actor.username : 'system' });
    return { org, owner, tempPassword };
  };
  app.assertCanGrant = (actorPerms, role) => {
    if (!role) throw new HttpError(400, 'Unknown role');
    if (role.scope === 'platform') throw new HttpError(403, 'That role cannot be assigned inside an organization');
    if (!isSubset(role.perms, actorPerms)) throw new HttpError(403, 'You cannot grant a role with more permissions than you hold');
  };

  // ---------- http plumbing ----------
  function send(res, status, body, headers = {}) {
    const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
    res.end(data);
  }
  app.send = send;
  const SEC = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY', 'permissions-policy': 'camera=(), microphone=(), geolocation=()' };
  const CSP_APP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
  const CSP_SITE = "default-src 'self'; script-src 'self' 'unsafe-inline' https://assets.calendly.com; style-src 'self' 'unsafe-inline' https://assets.calendly.com; img-src 'self' data: https://assets.calendly.com; font-src 'self'; connect-src 'self'; frame-src https://calendly.com https://*.calendly.com; child-src https://calendly.com https://*.calendly.com; base-uri 'none'; frame-ancestors 'none'";

  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', (c) => { size += c.length; if (size > limit) { reject(new HttpError(413, 'Request body too large')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  async function api(req, res, url) {
    const route = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
    if (!route) {
      if (routes.some((r) => r.re.test(url.pathname))) return send(res, 405, { error: 'Method not allowed' });
      return send(res, 404, { error: 'Not found' });
    }
    const m = route.re.exec(url.pathname);
    const params = {};
    route.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });

    if (req.method !== 'GET' && req.headers.origin) {
      let ok = false;
      try { ok = new URL(req.headers.origin).host === req.headers.host; } catch (_) { /* bad origin */ }
      if (!ok) return send(res, 403, { error: 'Cross-origin request blocked' });
    }

    const token = parseCookies(req.headers.cookie).vsid;
    let user = null;
    const sess = sessions.get(token);
    if (sess) {
      user = store.users.get(sess.userId);
      const org = user && user.orgId ? store.orgs.get(user.orgId) : null;
      if (!user || user.disabled || (org && org.disabled)) { sessions.destroy(token); user = null; }
    }
    if (route.perm && !user) return send(res, 401, { error: 'Sign in required', code: 'unauthenticated' });
    const perms = user ? permsOf(store, user) : [];
    if (user && user.mustChange && !MUST_CHANGE_OK.has(url.pathname)) return send(res, 403, { error: 'You must change your temporary password first', code: 'password_change_required' });
    if (route.perm && route.perm !== 'auth' && !perms.includes(route.perm)) {
      app.audit(user, 'access.denied', { type: 'route', id: `${req.method} ${url.pathname}`.slice(0, 120) }, { required: route.perm }, 'denied');
      return send(res, 403, { error: `Your role does not allow this action (${route.perm})`, code: 'forbidden' });
    }

    let body = {};
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'DELETE') {
      const raw = await readBody(req, route.maxBody);
      if (raw.length) {
        try { body = JSON.parse(raw.toString('utf8')); } catch (_) { throw new HttpError(400, 'Request body must be valid JSON'); }
        if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Request body must be a JSON object');
      }
    }
    const ctx = { req, res, url, query: Object.fromEntries(url.searchParams), params, body, user, perms, token, orgId: user ? user.orgId : null,
      ip: req.socket.remoteAddress || '', log: (action, resource, meta, outcome) => app.audit(user, action, resource, meta, outcome) };
    const result = await route.handler(ctx);
    if (result !== undefined && !res.headersSent) send(res, 200, result);
  }

  function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', { 'content-type': 'text/plain' });
    let base, rel;
    if (pathname === '/app') { res.writeHead(301, { location: '/app/' }); return res.end(); }
    if (pathname === '/app/' || pathname.startsWith('/app/')) { base = path.join(root, 'public'); rel = pathname === '/app/' ? 'index.html' : pathname.slice(5); }
    else { base = path.join(root, 'public-site'); rel = pathname === '/' ? 'index.html' : pathname.slice(1); }
    let file;
    try { file = path.normalize(path.join(base, decodeURIComponent(rel))); } catch (_) { return send(res, 400, 'Bad request', { 'content-type': 'text/plain' }); }
    if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      if (base.endsWith('public') && !path.extname(rel)) file = path.join(base, 'index.html'); // SPA fallback
      else return send(res, 404, 'Not found', { 'content-type': 'text/plain' });
    }
    const ext = path.extname(file);
    const isApp = base.endsWith(path.sep + 'public');
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600', 'content-security-policy': isApp ? CSP_APP : CSP_SITE, ...SEC, ...(isApp ? {} : { 'referrer-policy': 'strict-origin-when-cross-origin' }) });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    for (const [k, v] of Object.entries(SEC)) res.setHeader(k, v);
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else serveStatic(req, res, url.pathname);
    } catch (e) {
      const he = app.wrapOllama(e);
      if (he instanceof HttpError) { if (!res.headersSent) send(res, he.status, { error: he.message, code: he.code || undefined }); else res.end(); }
      else { console.error('[vector] internal error:', e); if (!res.headersSent) send(res, 500, { error: 'Internal error' }); else res.end(); }
    }
  });
  app.server = server;

  // ---------- first run ----------
  app.bootstrap = () => {
    if (store.users.all().length) return null;
    const pw = process.env.VECTOR_OPERATOR_PASSWORD || undefined;
    const { user, tempPassword } = app.createUserRecord({ orgId: null, username: 'operator', displayName: 'Vector Operator', roleId: 'operator', password: pw, mustChange: !pw && !app.demoLogin });
    app.audit(null, 'system.bootstrap', { type: 'user', id: user.id }, { note: 'first-run operator account created' }, 'ok', null);
    return { username: user.username, password: tempPassword };
  };

  app.start = (port, host) => new Promise((resolve) => {
    sampler.start();
    server.listen(port, host, () => resolve(server.address()));
  });
  app.close = () => new Promise((resolve) => { sampler.stop(); store.flush(); server.close(() => resolve()); server.closeAllConnections && server.closeAllConnections(); });
  app.setCookie = (res, token) => res.setHeader('set-cookie', `vsid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${12 * 3600}${cookieSecure ? '; Secure' : ''}`);
  app.clearCookie = (res) => res.setHeader('set-cookie', `vsid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${cookieSecure ? '; Secure' : ''}`);

  require('./routes-core')(app);
  require('./routes-ai')(app);
  require('./routes-compliance')(app);
  require('./routes-insights')(app);
  require('./routes-work')(app);
  require('./routes-ops')(app);
  require('./routes-apps')(app);
  require('./routes-check')(app);
  return app;
}

module.exports = { createApp, BUILTIN };