#!/usr/bin/env node
'use strict';
const { createApp } = require('./lib/app');

const port = Number(process.env.PORT) || 8080;
const host = process.env.HOST || '127.0.0.1';
const local = ['127.0.0.1', 'localhost', '::1'].includes(host);
// Demo sign-in (pick an account, no passwords) is on for local use. Set VECTOR_AUTH=password for real
// password sign-in. On a non-local address it stays off unless VECTOR_DEMO_LOGIN=1 is set on purpose.
const demoLogin = process.env.VECTOR_AUTH !== 'password' && (local || process.env.VECTOR_DEMO_LOGIN === '1');
const app = createApp({ demoLogin });
const creds = app.bootstrap();

app.start(port, host).then(async () => {
  const shown = host === '0.0.0.0' ? 'localhost' : host;
  console.log('\n  Vector Platform ' + app.version);
  console.log(`  Public site     http://${shown}:${port}/`);
  console.log(`  Product (app)   http://${shown}:${port}/app/`);
  console.log(`  Data directory  ${app.dataDir}`);
  console.log(`  Ollama          ${app.ollamaUrl}`);
  try { const v = await app.local.version(); console.log(`  Ollama status   reachable, version ${v.version}`); }
  catch (e) { console.log('  Ollama status   NOT reachable. Install Ollama, run "ollama serve", or set OLLAMA_HOST.'); }
  const bad = app.ledgers.verifyAll().filter((r) => !r.ok);
  console.log(bad.length ? `  Ledger          INTEGRITY FAILURE in: ${bad.map((b) => b.scope).join(', ')}` : `  Ledger          ${app.ledgers.scopes().length} chain(s) verified`);
  console.log(demoLogin ? '  Sign-in         demo mode: choose an account on the sign-in page (VECTOR_AUTH=password to require passwords)' : '  Sign-in         passwords required');
  if (!local) console.log('  Note            listening beyond localhost: put TLS in front and set COOKIE_SECURE=1');
  if (creds && !demoLogin) {
    console.log('\n  First run: operator account created. Save this now, it is not shown again.');
    console.log(`    username  ${creds.username}\n    password  ${creds.password}\n    (you must change it at first sign-in)\n`);
  }
  // Demo data: with no customers yet, load the two demo customers in the background. VECTOR_DEMO=off to start empty.
  if (!app.store.orgs.all().length && process.env.VECTOR_DEMO !== 'off') {
    const password = require('./lib/util').randomPassword() + 'A1'; // internal only, used by the loader's API calls
    console.log('  Demo data       loading two demo customers in the background (VECTOR_DEMO=off to skip)\n');
    require('./scripts/seed-samples').seed(app, `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`, { password, traffic: Number(process.env.VECTOR_DEMO_TRAFFIC || 3), ai: Number(process.env.VECTOR_DEMO_AI || 1), log: (...a) => console.log('  [demo]', ...a) })
      .then(() => console.log('  [demo] done: open the app and pick an account'))
      .catch((e) => console.log('  [demo] stopped: ' + e.message));
  }
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => app.close().then(() => process.exit(0)));
