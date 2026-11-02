'use strict';
// Compliance signals: what the platform itself, the organization's documents, its evidence and AI
// reviews say about each obligation. These are indicators to guide people, not an audit opinion,
// and they never change an obligation's status on their own.
const K = require('./knowledge');

const CONTROLS = [
  { id: 'audit_ledger', name: 'Hash-chained audit ledger', desc: 'Every sign-in, change and AI request is recorded in a SHA-256 hash chain that can be verified offline.',
    cats: ['records', 'security', 'breach', 'ai', 'sector'], kw: ['log', 'audit', 'record', 'accountab', 'monitor', 'trail', 'traceab', 'incident', 'detect'] },
  { id: 'rbac', name: 'Role-based access control', desc: 'Every request is checked against the user\'s role on the server; privilege escalation is blocked.',
    cats: ['security', 'privacy', 'sector'], kw: ['access', 'authori', 'least privilege', 'role', 'safeguard', 'confidential', 'unauthori'] },
  { id: 'local_inference', name: 'On-premises inference', desc: 'Models run on the organization\'s own hardware. No prompt or document is sent to an outside AI provider.',
    cats: ['transfer', 'privacy', 'ai', 'sector'], kw: ['transfer', 'cross-border', 'third countr', 'locali', 'residen', 'processor', 'vendor', 'third part', 'disclos', 'service provider', 'sharing'] },
  { id: 'hash_only_logging', name: 'Prompts logged as hashes only', desc: 'The audit trail stores SHA-256 hashes of prompts and answers, not their text.',
    cats: ['privacy', 'sector'], kw: ['minimi', 'purpose', 'retention', 'confidential', 'personal data', 'personal information', 'health information', 'records'] },
  { id: 'dept_scoping', name: 'Department-scoped knowledge', desc: 'People can only retrieve documents for their own department or documents shared with everyone.',
    cats: ['privacy', 'sector', 'security'], kw: ['minimum necessary', 'need to know', 'access', 'segregat', 'confidential', 'disclos'] },
  { id: 'evidence_integrity', name: 'Integrity-checked evidence store', desc: 'Evidence files are stored with a SHA-256 hash and re-checked on every download.',
    cats: ['records', 'security', 'sector'], kw: ['evidence', 'documentation', 'record', 'integrity', 'retain', 'electronic record'] },
  { id: 'auth_controls', name: 'Authentication controls', desc: 'scrypt password hashing, lockout after failed attempts, session time limits, forced change of temporary passwords.',
    cats: ['security', 'sector'], kw: ['authenticat', 'password', 'access control', 'identity', 'credential', 'security'] },
  { id: 'ai_oversight', name: 'AI output labeled for human review', desc: 'AI-drafted compliance analysis is labeled and never changes a status; a person decides.',
    cats: ['ai'], kw: ['ai', 'artificial intelligence', 'automated', 'human oversight', 'transparen', 'risk management', 'model'] },
];

function controlState(ctx) {
  const { org, ledgerOk, deployments, roleCount } = ctx;
  return CONTROLS.map((c) => {
    let active = true, why = 'Built into this platform and always on.';
    if (c.id === 'audit_ledger') { active = ledgerOk; why = ledgerOk ? 'Chain verified intact just now.' : 'Chain verification is currently failing.'; }
    if (c.id === 'local_inference') { active = ['on_prem', 'air_gapped', 'private_cloud', 'hybrid'].includes(org.deploymentType) && deployments.length > 0; why = active ? `${deployments.length} deployment(s) on organization-controlled nodes (${org.deploymentType.replace('_', ' ')}).` : 'No deployment yet.'; }
    if (c.id === 'rbac') { why = `${roleCount} distinct role(s) in use.`; }
    return { ...c, active, why };
  });
}

const textOf = (o) => `${o.title} ${o.summary}`.toLowerCase();
function controlsFor(ob, controls) {
  const t = textOf(ob);
  return controls.filter((c) => c.active && c.cats.includes(ob.category) && c.kw.some((k) => t.includes(k))).map((c) => c.id);
}

// Distinctive terms: acronyms and names in the title (HIPAA, FERPA, ISO 27001) weigh most.
function docMatches(ob, chunks) {
  if (!chunks.length) return [];
  const acr = (ob.title.match(/\b[A-Z][A-Z0-9-]{2,}\b/g) || []).filter((w) => !['ISO', 'IEC', 'NIST', 'US', 'EU', 'THE', 'CFR', 'USC', 'ACT', 'AND', 'PIC', 'WHO'].includes(w));
  const hits = K.search(chunks, `${ob.title} ${ob.title} ${ob.summary}`, 6);
  const byDoc = new Map();
  for (const h of hits) {
    const txt = h.chunk.text;
    const acrHit = acr.filter((a) => txt.includes(a)).length;
    const score = h.score + acrHit * 4;
    const cur = byDoc.get(h.chunk.docId);
    if (!cur || cur.score < score) byDoc.set(h.chunk.docId, { docId: h.chunk.docId, title: h.chunk.title, score: Math.round(score * 10) / 10, acronym: acrHit > 0, excerpt: txt.slice(0, 320) });
  }
  return [...byDoc.values()].filter((d) => d.score >= 6 || d.acronym).sort((a, b) => b.score - a.score).slice(0, 3)
    .map((d) => ({ ...d, strength: d.acronym || d.score >= 11 ? 'strong' : 'related' }));
}

function scoreOf(item, s) {
  if (item.status === 'not_applicable') return { score: null, band: 'na' };
  if (item.status === 'implemented' && item.evidenceCount) return { score: 100, band: 'evidenced' };
  let v = item.status === 'implemented' ? 60 : item.status === 'in_progress' ? 20 : 0;
  if (item.evidenceCount) v += 25;
  const strong = s.docs.some((d) => d.strength === 'strong');
  v += strong ? 25 : s.docs.length ? 12 : 0;
  v += Math.min(20, s.controls.length * 7);
  if (s.ai) v += s.ai.verdict === 'covered' ? 15 : s.ai.verdict === 'partial' ? 7 : 0;
  v = Math.min(95, v);
  return { score: v, band: v >= 60 ? 'supported' : v >= 25 ? 'partial' : 'gap' };
}

function compute({ items, org, docs, ledgerOk, deployments, roleCount, assessments }) {
  const controls = controlState({ org, ledgerOk, deployments, roleCount });
  const chunks = [];
  for (const d of docs) d.chunks.forEach((t, n) => chunks.push({ docId: d.id, title: d.title, n, text: t }));
  const latest = new Map();
  for (const a of assessments) { const c = latest.get(a.obligationId); if (!c || c.ts < a.ts) latest.set(a.obligationId, a); }
  const signals = {};
  for (const it of items) {
    const a = latest.get(it.id);
    const s = { controls: controlsFor(it, controls), docs: docMatches(it, chunks), ai: a ? { verdict: a.verdict, confidence: a.confidence, reasons: a.reasons, missing: a.missing, model: a.model, ts: a.ts, by: a.by } : null };
    Object.assign(s, scoreOf(it, s));
    signals[it.id] = s;
  }
  const scored = Object.values(signals).filter((s) => s.score !== null);
  const readiness = scored.length ? Math.round(scored.reduce((a, s) => a + s.score, 0) / scored.length) : 0;
  const bands = Object.values(signals).reduce((a, s) => { a[s.band] = (a[s.band] || 0) + 1; return a; }, {});
  const usage = controls.map((c) => ({ id: c.id, obligations: Object.values(signals).filter((s) => s.controls.includes(c.id)).length }));
  return { controls: controls.map(({ kw, cats, ...c }) => ({ ...c, categories: cats, obligations: usage.find((u) => u.id === c.id).obligations })), signals, readiness, bands };
}

module.exports = { compute, CONTROLS };
