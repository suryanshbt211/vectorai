#!/usr/bin/env node
'use strict';
// Creates a demo organization with one user per role so you can click through every screen.
// Run with the server stopped:  node scripts/seed-demo.js
// The password comes from DEMO_PASSWORD, or is generated and printed once.
const { createApp } = require('../lib/app');
const { randomPassword, id, now, sha256 } = require('../lib/util');
const K = require('../lib/knowledge');

const app = createApp();
const op = app.bootstrap();
const password = process.env.DEMO_PASSWORD || randomPassword() + 'A1';
if (app.store.orgs.find((o) => o.name === 'Demo Logistics Co')) { console.error('Demo organization already exists in this data directory.'); process.exit(1); }

const { org } = app.createOrg({
  name: 'Demo Logistics Co', industry: 'logistics', jurisdictions: ['IN', 'IN-MH', 'EU', 'DE', 'US', 'US-TX'], deploymentType: 'on_prem',
  ownerUsername: 'demo.owner', ownerName: 'Demo Owner', ownerPassword: password, forceChange: false,
}, null);

const people = [
  ['demo.platform', 'Priya Platform', 'platform_admin', 'IT'],
  ['demo.engineer', 'Arjun Engineer', 'ai_engineer', 'IT'],
  ['demo.security', 'Sana Security', 'security_admin', 'IT'],
  ['demo.compliance', 'Carlos Compliance', 'compliance_officer', 'Compliance'],
  ['demo.dept', 'Dana Dispatch', 'dept_admin', 'Operations'],
  ['demo.employee', 'Eli Employee', 'employee', 'Operations'],
  ['demo.hr', 'Hana HR', 'employee', 'HR'],
  ['demo.auditor', 'Audrey Auditor', 'auditor', ''],
];
for (const [username, displayName, roleId, department] of people) {
  const { user } = app.createUserRecord({ orgId: org.id, username, displayName, roleId, department, password, mustChange: false });
  app.audit(null, 'user.create', { type: 'user', id: user.id }, { username, roleId, department, via: 'seed-demo script' }, 'ok', org.id);
}

const docs = [
  ['SAMPLE: Driver records retention policy', '*', 'This is a sample policy for demonstration only.\n\nDriver qualification files are kept for the duration of employment and three years afterwards. Records of duty status and supporting documents are kept for six months. Access to driver records is limited to Operations managers, HR and Compliance.\n\nPersonal data of drivers must not be copied to personal devices or shared outside the company without approval from Compliance.'],
  ['SAMPLE: Shipping documents handling', 'Operations', 'This is a sample procedure for demonstration only.\n\nDispatch staff must file shipping papers and customs documents in the document system within one working day. Customs records are retained for five years. Dangerous goods declarations must be reviewed by a trained dangerous goods officer before release.\n\nAny suspected loss of shipment data must be reported to the security team immediately.'],
  ['SAMPLE: Employee data access (HR only)', 'HR', 'This is a sample HR-only note for demonstration only.\n\nSalary bands and disciplinary records are restricted to the HR department. Requests for employee data from other departments need written approval from the HR director.'],
];
for (const [title, department, text] of docs) {
  const d = app.store.knowledge.insert({ id: id('doc'), orgId: org.id, title, department, text, chunks: K.chunk(text), sha256: sha256(text), createdBy: 'demo.owner', createdAt: now() });
  app.audit(null, 'knowledge.create', { type: 'document', id: d.id }, { title, department, sha256: d.sha256, via: 'seed-demo script' }, 'ok', org.id);
}
app.store.flush();

console.log('\nDemo organization created: Demo Logistics Co (logistics; India, Maharashtra, EU, Germany, US, Texas)');
console.log(`Password for every demo user: ${password}\n`);
for (const [u, n, r] of [['demo.owner', 'Demo Owner', 'owner'], ...people.map(([u, n, r]) => [u, n, r])]) console.log(`  ${u.padEnd(16)} ${r.padEnd(20)} ${n}`);
if (op) console.log(`\nOperator account (Vector team): username ${op.username}, password ${op.password}`);
else console.log('\nOperator account already exists. Use scripts/reset-password.js operator if you need a new password.');
console.log('Start the server with: npm start   then open http://127.0.0.1:8080/app/\n');
