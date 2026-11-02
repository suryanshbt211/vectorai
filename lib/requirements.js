'use strict';
// What it takes to comply: for each obligation, the documents and inputs (numbers, names, dates) an
// organization must have. The compliance check runs every requirement against the organization's
// documents and entered values, says what is done and what is pending, and turns pending items into tasks.
//
// Requirement kinds:
//   doc   - a policy, procedure or record. Met when a document in Knowledge matches `match` (every group
//           needs at least one of its phrases in the document's title, tags or text), or when a document
//           was uploaded against this requirement.
//   input - a value someone enters: text, number or date. Optional rules: min (number), future (date must
//           be after today), maxAgeDays (date must be recent).
// Specific lists exist for common obligations; everything else gets a sensible list from its category.
// These are practical checklists to organize the work, not legal advice.

const doc = (key, label, match, hint) => ({ key, kind: 'doc', label, match, hint });
const input = (key, label, type, rules = {}, hint) => ({ key, kind: 'input', label, type, ...rules, hint });

const SPECIFIC = {
  // ---------------- India ----------------
  'in-dpdp': [
    doc('privacy-notice', 'Privacy notice and consent policy (DPDP Act)', [['dpdp', 'digital personal data protection', 'data protection'], ['consent', 'notice']], 'How notice is given, how consent is taken and withdrawn, legitimate uses.'),
    doc('breach-intimation', 'Personal data breach intimation procedure', [['data protection board', 'dpdp'], ['breach']], 'Who informs the Data Protection Board and affected people, and how.'),
    doc('processor-terms', 'Data processing terms for vendors', [['processor', 'data processing'], ['vendor', 'sub-processor', 'contract']], 'What every vendor that handles personal data must agree to.'),
    input('grievance-officer', 'Grievance officer or DPO (name and contact)', 'text'),
    input('notice-published', 'Date the consent notice was last published in local languages', 'date', { maxAgeDays: 400 }),
  ],
  'in-certin': [
    doc('incident-procedure', 'Cyber incident reporting procedure (CERT-In, 6 hours)', [['cert-in'], ['6 hours', 'six hours']], 'Which incidents are reported to CERT-In and how within 6 hours.'),
    input('poc', 'CERT-In point of contact (name and role)', 'text'),
    input('log-days', 'ICT log retention in India (days)', 'number', { min: 180 }, 'The Directions require at least 180 days.'),
    input('last-drill', 'Date of the last incident reporting drill', 'date', { maxAgeDays: 365 }),
  ],
  'in-itact': [
    doc('risk-assessment', 'Information security risk assessment', [['risk assessment', 'risk analysis'], ['security']], 'Annual assessment of reasonable security practices (Section 43A, SPDI Rules).'),
    input('last-assessment', 'Date of the last security risk assessment', 'date', { maxAgeDays: 400 }),
  ],
  'in-clinical-est': [
    doc('registration-policy', 'Hospital registration and statutory records procedure', [['registration'], ['clinical establishment', 'nursing home', 'hospital']], 'How registration is kept current and registers are maintained.'),
    input('reg-number', 'Clinical establishment registration number', 'text'),
    input('reg-valid', 'Registration valid until', 'date', { future: true }),
  ],
  'in-medical-records': [
    doc('retention', 'Medical records retention schedule (at least 3 years)', [['retention', 'retained'], ['3 years', 'three years']], 'How long in-patient and medico-legal records are kept.'),
    doc('patient-copies', 'Patient access to records procedure (copies within 72 hours)', [['72 hours']], 'How patients get copies of their records.'),
    input('mrd-head', 'Head of medical records (name)', 'text'),
  ],
  'in-pcpndt': [
    doc('pcpndt-procedure', 'PC-PNDT procedure (registration and Form F)', [['pc-pndt', 'pcpndt'], ['form f']], 'Registration of imaging units and completion of Form F.'),
    input('pcpndt-reg', 'PC-PNDT registration number', 'text'),
    input('pcpndt-valid', 'PC-PNDT registration valid until', 'date', { future: true }),
    input('formf-audit', 'Date of the last Form F audit', 'date', { maxAgeDays: 120 }),
  ],
  'in-bmw': [
    doc('bmw-procedure', 'Bio-medical waste management procedure', [['bio-medical waste', 'biomedical waste']], 'Segregation, handover to the treatment facility, records.'),
    input('bmw-auth', 'Pollution Control Board authorisation number', 'text'),
    input('bmw-report', 'Date the last annual bio-medical waste report was filed', 'date', { maxAgeDays: 400 }),
    input('cbwtf', 'Common treatment facility (agency name)', 'text'),
  ],
  'in-abdm': [
    doc('abdm-procedure', 'ABDM health records and consent procedure', [['abdm', 'ayushman bharat'], ['consent']], 'How records are shared through ABDM against consent.'),
    input('hfr-id', 'Health Facility Registry (HFR) ID', 'text'),
  ],
  'in-nciipc': [
    doc('cii-policy', 'Critical information infrastructure protection policy', [['critical information infrastructure', 'nciipc']], 'Only if your systems are notified as critical information infrastructure.'),
    input('ciso', 'Chief information security officer (name)', 'text'),
  ],
  'in-gst-records': [
    doc('accounts-retention', 'Books of account retention policy (GST)', [['gst', 'books of account'], ['retain', 'retention', 'kept']], 'How accounts and invoices are kept.'),
    input('gst-years', 'Years accounts are kept', 'number', { min: 6 }, 'At least 72 months from the due date of the annual return.'),
  ],
  'inmh-nursing-homes': [
    doc('mh-registration', 'Maharashtra nursing home registration procedure', [['nursing home'], ['maharashtra', 'registration']], 'Registration, displays at reception, registers.'),
    input('mh-reg', 'Maharashtra nursing home registration number', 'text'),
    input('mh-valid', 'Registration valid until', 'date', { future: true }),
    input('mh-display', 'Date the patients\' rights charter and charges were last checked at reception', 'date', { maxAgeDays: 120 }),
  ],
  'inmh-shops': [
    input('shops-reg', 'Shops and Establishments registration or intimation number', 'text'),
    input('registers', 'Date employee and wage registers were last reviewed', 'date', { maxAgeDays: 400 }),
  ],
  // ---------------- United States ----------------
  'us-hipaa': [
    doc('privacy-policy', 'HIPAA privacy policy and notice of privacy practices', [['hipaa'], ['privacy']]),
    doc('risk-analysis', 'HIPAA security risk analysis', [['risk analysis', 'risk assessment'], ['security']]),
    doc('baa', 'Business associate agreement terms', [['business associate', 'baa']]),
    input('privacy-officer', 'Privacy officer (name)', 'text'),
    input('security-officer', 'Security officer (name)', 'text'),
    input('last-risk-analysis', 'Date of the last security risk analysis', 'date', { maxAgeDays: 400 }),
  ],
  'us-hipaa-breach': [
    doc('breach-procedure', 'Breach notification procedure (60 days)', [['breach'], ['60', 'sixty']]),
    input('last-tabletop', 'Date of the last breach response exercise', 'date', { maxAgeDays: 400 }),
  ],
  'us-ferpa': [
    doc('ferpa-policy', 'FERPA student records policy', [['ferpa']]),
    input('annual-notice', 'Date the annual FERPA notice was sent', 'date', { maxAgeDays: 400 }),
  ],
  'usny-shield': [
    doc('security-program', 'Information security program with reasonable safeguards', [['security'], ['safeguard', 'program']]),
    input('program-owner', 'Person who runs the security program', 'text'),
  ],
  'eu-gdpr': [
    doc('privacy-notice', 'Privacy notice (GDPR Articles 13 and 14)', [['gdpr', 'privacy notice', 'data protection']]),
    doc('ropa', 'Record of processing activities', [['record of processing', 'processing activities', 'ropa']]),
    input('dpo', 'Data protection officer or contact (name)', 'text'),
  ],
};

// Category defaults, used when an obligation has no specific list.
const BY_CATEGORY = {
  privacy: [doc('privacy-policy', 'Privacy or data protection policy', [['privacy', 'data protection', 'personal data', 'confidential']]), input('privacy-owner', 'Privacy owner (name)', 'text')],
  security: [doc('security-policy', 'Information security policy or risk assessment', [['security'], ['policy', 'risk', 'assessment', 'program', 'controls']]), input('last-review', 'Date of the last security review', 'date', { maxAgeDays: 400 })],
  breach: [doc('incident-procedure', 'Incident and breach response procedure', [['incident', 'breach'], ['report', 'notif', 'respon']]), input('last-drill', 'Date of the last incident response drill', 'date', { maxAgeDays: 400 })],
  records: [doc('retention-schedule', 'Records retention schedule', [['retention', 'retain', 'retained', 'kept for']]), input('records-owner', 'Records owner (name)', 'text')],
  transfer: [doc('transfer-policy', 'Data location and transfer policy', [['transfer', 'cross-border', 'locali', 'stored in', 'within india', 'on premises', 'own servers']])],
  ai: [doc('ai-policy', 'AI use and governance policy', [['ai ', 'artificial intelligence', 'ai platform', 'ai system', 'ai tools'], ['policy', 'governance', 'oversight', 'review']]), input('ai-review', 'Date the AI system inventory was last reviewed', 'date', { maxAgeDays: 120 })],
  sector: [input('owner', 'Responsible owner (name)', 'text')],
};
const STOP = new Set(['ISO', 'IEC', 'NIST', 'US', 'EU', 'THE', 'CFR', 'USC', 'ACT', 'AND', 'PIC', 'WHO', 'RBI', 'DOT']);

function forObligation(ob) {
  if (SPECIFIC[ob.id]) return SPECIFIC[ob.id];
  const base = BY_CATEGORY[ob.category] || BY_CATEGORY.sector;
  if (ob.category !== 'sector') return base;
  // Sector rules: look for a document that names the rule (acronym or the first distinctive words of its title).
  const acr = (ob.title.match(/\b[A-Z][A-Z0-9-]{2,}\b/g) || []).filter((w) => !STOP.has(w)).map((w) => w.toLowerCase());
  const words = ob.title.replace(/\(.*?\)/g, '').split(/[,:]/)[0].trim().toLowerCase();
  return [doc('policy', `Policy or procedure covering ${ob.title.replace(/\s*\(.*?\)\s*/g, ' ').trim()}`, [acr.length ? acr : [words]]), ...base];
}

const daysBetween = (a, b) => Math.round((b - a) / 86400000);
function checkValue(r, v) {
  if (v == null || String(v).trim() === '') return { ok: false, problem: 'missing' };
  if (r.type === 'number') {
    const n = Number(v);
    if (!Number.isFinite(n)) return { ok: false, problem: 'not a number' };
    if (r.min != null && n < r.min) return { ok: false, problem: `must be at least ${r.min}` };
  }
  if (r.type === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, problem: 'not a date' };
    const d = new Date(v + 'T00:00:00Z'), today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
    if (r.future && d < today) return { ok: false, problem: 'expired', expired: true };
    if (r.maxAgeDays && daysBetween(d, today) > r.maxAgeDays) return { ok: false, problem: `older than ${r.maxAgeDays} days`, expired: true };
    if (!r.future && d > today) return { ok: false, problem: 'date is in the future' };
  }
  return { ok: true };
}

function docMatch(r, docs) {
  for (const d of docs) {
    const hay = `${d.title} ${(d.tags || []).join(' ')} ${d.text}`.toLowerCase();
    if (r.match.every((g) => g.some((p) => hay.includes(p)))) return d;
  }
  return null;
}

// Evaluate every requirement of every applicable obligation.
// items: complianceItems; docs: knowledge docs; inputs: compinputs rows; tasks: org tasks.
function evaluate(items, docs, inputs, tasks) {
  const inp = new Map(inputs.map((x) => [`${x.obligationId}|${x.key}`, x]));
  const out = [];
  for (const it of items) {
    const reqs = forObligation(it).map((r) => {
      const saved = inp.get(`${it.id}|${r.key}`);
      const task = tasks.filter((t) => t.obligationId === it.id && t.requirementKey === r.key).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] || null;
      const row = { key: r.key, kind: r.kind, label: r.label, hint: r.hint || '', type: r.type || null, min: r.min ?? null, future: !!r.future, maxAgeDays: r.maxAgeDays || null,
        taskId: task ? task.id : null, taskStatus: task ? task.status : null, assigneeId: task ? task.assigneeId : null };
      if (r.kind === 'doc') {
        const linked = saved && saved.docId ? docs.find((d) => d.id === saved.docId) : null;
        const m = linked || docMatch(r, docs);
        return { ...row, status: m ? 'met' : 'missing', evidence: m ? { docId: m.id, title: m.title, how: linked ? 'uploaded for this requirement' : 'matched in Knowledge', by: saved ? saved.byName : m.createdBy, at: saved ? saved.at : m.createdAt } : null };
      }
      const c = checkValue(r, saved ? saved.value : null);
      return { ...row, status: c.ok ? 'met' : saved ? (c.expired ? 'expired' : 'invalid') : 'missing', problem: c.ok ? null : c.problem, evidence: saved ? { value: saved.value, by: saved.byName, at: saved.at } : null };
    });
    const met = reqs.filter((r) => r.status === 'met').length;
    const state = it.status === 'not_applicable' ? 'na' : met === reqs.length ? 'complete' : met > 0 ? 'partial' : 'pending';
    out.push({ id: it.id, title: it.title, jurisdiction: it.jurisdiction, jurisdictionName: it.jurisdictionName, level: it.level, category: it.category, status: it.status, ownerId: it.ownerId, state, met, total: reqs.length, reqs });
  }
  return out;
}

function summarize(results) {
  const live = results.filter((r) => r.state !== 'na');
  const reqs = live.flatMap((r) => r.reqs);
  const pend = reqs.filter((q) => q.status !== 'met');
  return {
    obligations: live.length, complete: live.filter((r) => r.state === 'complete').length, partial: live.filter((r) => r.state === 'partial').length, pending: live.filter((r) => r.state === 'pending').length,
    notApplicable: results.length - live.length, requirements: reqs.length, met: reqs.length - pend.length,
    docsNeeded: pend.filter((q) => q.kind === 'doc').length, inputsNeeded: pend.filter((q) => q.kind === 'input').length,
    expired: pend.filter((q) => q.status === 'expired').length, unassigned: pend.filter((q) => !q.taskId || q.taskStatus === 'done').length,
    percent: reqs.length ? Math.round(((reqs.length - pend.length) / reqs.length) * 100) : 0,
  };
}

module.exports = { forObligation, evaluate, summarize, checkValue, SPECIFIC };
