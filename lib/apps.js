'use strict';
// Applications: task-specific workflows that run on the organization's own models, beyond chat with
// documents. Each one is a structured input form, a grounded prompt, an output contract and a review
// rule. Outputs are drafts for qualified people; nothing here makes a clinical, legal or grading decision.

const W = (s) => s.replace(/\s+\n/g, '\n').trim();

// ---------- deterministic identifier detection (HIPAA Safe Harbor style, plus Indian identifiers) ----------
const PHI_RULES = [
  ['Aadhaar', /\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/g],
  ['ABHA number', /\b\d{2}-\d{4}-\d{4}-\d{4}\b/g],
  ['SSN', /\b\d{3}-\d{2}-\d{4}\b/g],
  ['MRN', /\b(?:MRN|Medical Record(?: Number)?|Record #|Acct(?:ount)? ?#?)[:#\s]*[A-Z0-9-]{5,14}\b/gi],
  ['Email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ['URL', /\bhttps?:\/\/[^\s)]+/gi],
  ['IP address', /\b(?:\d{1,3}\.){3}\d{1,3}\b/g],
  ['Phone/Fax', /(?:\+91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/g],
  ['Phone/Fax', /(?:\+1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g],
  ['Date', /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.? \d{1,2},? \d{4}|\d{4}-\d{2}-\d{2})\b/g],
  ['Age over 89', /\b(?:9\d|1[01]\d)[- ](?:year|yr)s?[- ]old\b/gi],
  ['PIN code', /\b[1-9]\d{5}\b/g],
  ['ZIP code', /\b\d{5}(?:-\d{4})?\b/g],
  ['Street address', /\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Marg|Nagar|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way)\b/g],
  ['Name', /\b(?:Mr|Mrs|Ms|Miss|Dr|Shri|Smt|Kum|Patient|Pt)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g],
];
function redactPHI(text) {
  let out = String(text);
  const found = [];
  for (const [type, re] of PHI_RULES) {
    out = out.replace(re, (m) => { found.push({ type, value: m }); return `[${type.toUpperCase().replace(/[^A-Z]+/g, '_')}]`; });
  }
  return { text: out, found };
}

const CAUTION_CLINICAL = 'Draft for a licensed clinician to review and edit. Not a medical decision.';
const APPS = [
  // ---------------- healthcare ----------------
  { id: 'phi-redact', name: 'PHI de-identification', industries: ['healthcare', 'pharma', 'insurance'], category: 'Privacy', kind: 'Deterministic + AI', icon: 'shield',
    summary: 'Find and mask patient identifiers (names, dates, UHID/MRN, Aadhaar and ABHA numbers, phone numbers, addresses, emails) before text is shared, analysed or used for training.',
    inputs: [{ key: 'text', label: 'Clinical text', type: 'textarea', rows: 10 }],
    example: { text: 'Pt. Sunita Kulkarni (MRN: PE-0048213), 67-year-old female, Aadhaar 4821 7730 1295, seen on 14/03/2026 at 12 Linking Road, Bandra West, Mumbai 400050. Contact +91 98200 41873 or sunita.k@example.com. Son Mr. Amit Kulkarni will pick her up. Follow-up with Dr. Deshpande on April 2, 2026.' },
    run: 'phi', review: 'Pattern rules plus a model pass for remaining names. The data protection or privacy officer verifies before release; this assists de-identification review and is not an expert determination.' },
  { id: 'discharge-summary', name: 'Discharge summary draft', industries: ['healthcare'], category: 'Clinical documentation', kind: 'Grounded generation', icon: 'doc',
    summary: 'Turn de-identified encounter notes into a structured discharge summary that follows the hospital\'s own template.',
    inputs: [{ key: 'notes', label: 'Encounter notes (de-identified)', type: 'textarea', rows: 10 }],
    example: { notes: 'Admitted with community-acquired pneumonia, right lower lobe. Treated with IV ceftriaxone and azithromycin for 3 days, switched to oral amoxicillin-clavulanate. Afebrile 48 hours, O2 sat 96% on room air. Comorbid type 2 diabetes, metformin continued, glucose 140-180. Discharge home with daughter. Follow up with primary care in 7 days, repeat chest X-ray in 6 weeks.' },
    grounding: 'Discharge Summary Template', system: 'You draft hospital discharge summaries from clinician notes. Use only facts in the notes. Follow the template headings in the provided excerpt when present. Mark anything missing as [needs clinician input]. Never invent medications, doses or results.',
    prompt: (i) => `Draft a discharge summary from these notes.\n\nNotes:\n${i.notes}`, review: CAUTION_CLINICAL },
  { id: 'prior-auth', name: 'Insurance pre-authorization letter', industries: ['healthcare'], category: 'Revenue cycle', kind: 'Grounded generation', icon: 'doc',
    summary: 'Draft a cashless pre-authorization or prior-authorization request for an insurer or TPA from the clinical facts, following the internal guide.',
    inputs: [{ key: 'payer', label: 'Insurer or TPA', type: 'text' }, { key: 'service', label: 'Requested service', type: 'text' }, { key: 'facts', label: 'Clinical facts supporting necessity (de-identified)', type: 'textarea', rows: 6 }],
    example: { payer: 'Example Health Insurance (via TPA)', service: 'Lumbar spine MRI without contrast', facts: 'Low back pain radiating to left leg for 9 weeks. Failed 6 weeks of physiotherapy and NSAIDs. New left foot weakness (4/5 dorsiflexion) and diminished ankle reflex on exam this week.' },
    grounding: 'Pre-authorization Guide', system: 'You write concise, factual pre-authorization requests for insurers and TPAs. Use only the facts provided and the internal guide. List the clinical criteria met. Leave signature fields for the physician.',
    prompt: (i) => `Insurer or TPA: ${i.payer}\nRequested service: ${i.service}\nClinical facts:\n${i.facts}\n\nWrite the pre-authorization request with the medical necessity justification.`, review: 'Draft for the ordering physician to verify and sign.' },
  { id: 'coding-assist', name: 'Coding suggestions', industries: ['healthcare'], category: 'Revenue cycle', kind: 'Structured extraction', icon: 'list',
    summary: 'Suggest candidate ICD-10 diagnosis codes with the supporting phrase from the note, for a medical coder to confirm.',
    inputs: [{ key: 'note', label: 'Clinical note (de-identified)', type: 'textarea', rows: 8 }],
    example: { note: 'Assessment: Community-acquired pneumonia of right lower lobe. Type 2 diabetes mellitus without complications, on metformin. Essential hypertension, controlled.' },
    format: 'json', system: 'You assist certified medical coders. Suggest candidate ICD-10 codes (WHO ICD-10, or ICD-10-CM for US claims) only when the note clearly documents the condition. Quote the exact supporting phrase. If unsure, say so with low confidence. Reply with JSON only.',
    prompt: (i) => `Note:\n${i.note}\n\nReply as JSON: {"codes":[{"code":"","description":"","evidence":"exact phrase from the note","confidence":"high|medium|low"}],"queries":["questions the coder should ask the physician"]}`,
    review: 'Suggestions only. A medical coder verifies every code against the official code set and documentation.' },
  { id: 'breach-triage', name: 'Breach risk assessment', industries: ['healthcare', 'insurance'], category: 'Compliance', kind: 'Grounded structured analysis', icon: 'shield',
    summary: 'Assess a data incident against the hospital\'s breach procedure (DPDP Act and CERT-In in India, HIPAA in the US), with deadlines and next steps.',
    inputs: [{ key: 'incident', label: 'What happened', type: 'textarea', rows: 7 }],
    example: { incident: 'A nurse emailed a discharge summary for one patient to the wrong external address (a similar name). The recipient replied within an hour saying they deleted it without reading. The email was not encrypted. It contained name, UHID, diagnosis and medication list.' },
    format: 'json', grounding: 'Breach and Security Incident Response Procedure', system: 'You support a privacy officer assessing a data incident. Follow the internal procedure excerpt and the laws it names (for example the DPDP Act and CERT-In Directions in India, or the HIPAA four-factor test in the US). Be careful and conservative. You do not make the final determination. Reply with JSON only.',
    prompt: (i) => `Incident:\n${i.incident}\n\nReply as JSON: {"factors":[{"factor":"Nature and extent of the data","assessment":"","risk":"low|medium|high"},{"factor":"Who received or accessed it","assessment":"","risk":""},{"factor":"Whether it was viewed or misused","assessment":"","risk":""},{"factor":"Extent of mitigation","assessment":"","risk":""}],"overall":"low risk|reportable breach|needs counsel","next_steps":[""],"deadlines":["with the regulator and timeframe, e.g. CERT-In within 6 hours"]}`,
    review: 'The data protection officer and counsel make the breach determination.' },
  { id: 'baa-review', name: 'Vendor data agreement review', industries: ['healthcare'], category: 'Compliance', kind: 'Grounded comparison', icon: 'scale',
    summary: 'Compare a vendor\'s data processing agreement (or US business associate agreement) with the hospital\'s standard terms and list what is missing or weaker.',
    inputs: [{ key: 'contract', label: 'Vendor agreement text', type: 'textarea', rows: 10 }],
    example: { contract: 'Section 4. Vendor will use commercially reasonable safeguards for customer data. Section 7. Vendor will notify Customer of security incidents within 30 business days. Section 9. Upon termination, Vendor may retain copies of data for analytics. Subcontractors are engaged at Vendor\'s discretion.' },
    format: 'json', grounding: 'Vendor Data Processing Standard Terms', system: 'You compare vendor contracts against the organization\'s standard data processing terms in the excerpt. Be specific, quote the vendor clause, and do not give legal advice. Reply with JSON only.',
    prompt: (i) => `Vendor agreement:\n${i.contract}\n\nReply as JSON: {"clauses":[{"requirement":"from our standard terms","vendor_clause":"quote or 'missing'","status":"meets|weaker|missing","suggested_change":""}],"summary":""}`,
    review: 'For compliance and legal review before signature.' },
  { id: 'patient-reply', name: 'Patient message reply', industries: ['healthcare'], category: 'Patient access', kind: 'Generation with safety check', icon: 'chat',
    summary: 'Draft a clear, kind reply to a patient message and flag anything that needs urgent clinical attention.',
    inputs: [{ key: 'message', label: 'Patient message', type: 'textarea', rows: 6 }],
    example: { message: 'Hi, I was discharged on Tuesday after my pneumonia. I still cough a lot and today I feel more short of breath walking to the kitchen. Should I keep taking the antibiotic and is this normal?' },
    format: 'json', system: 'You draft patient portal replies for a nurse to review. Use plain, kind language at a 6th-grade reading level. Do not diagnose or change medications. If the message mentions symptoms that may need urgent care (worsening breathing, chest pain, confusion, high fever), set urgent to true. Reply with JSON only.',
    prompt: (i) => `Patient message:\n${i.message}\n\nReply as JSON: {"urgent":true|false,"why":"","reply":"draft reply for the nurse to edit","route_to":"nurse|physician|scheduling|billing"}`,
    review: 'A nurse reviews every reply. Urgent flags go to the clinical team immediately.' },
  // ---------------- education ----------------
  { id: 'answer-eval', name: 'AI answer evaluator', industries: ['education'], category: 'Assessment', kind: 'Rubric scoring', icon: 'check',
    summary: 'Score a student answer against the model answer and rubric with criterion-level feedback. Faculty confirm every mark.',
    inputs: [{ key: 'question', label: 'Question', type: 'text' }, { key: 'rubric', label: 'Model answer and rubric', type: 'textarea', rows: 5 }, { key: 'answer', label: 'Student answer', type: 'textarea', rows: 6 }, { key: 'max', label: 'Maximum marks', type: 'text' }],
    example: { question: 'Explain why FERPA matters when a parent asks about an adult student\'s grades.', rubric: 'Full marks: states FERPA rights transfer to students at 18 or in postsecondary education (2), explains consent or an exception is needed to disclose (2), mentions the dependent-student tax exception or a signed release (1).', answer: 'Once the student is in college the rights belong to the student, so we cannot share grades unless the student gives written consent.', max: '5' },
    format: 'json', system: 'You assist faculty with marking. Score strictly against the rubric, criterion by criterion, and quote the student\'s words as evidence. Faculty make the final decision. Reply with JSON only.',
    prompt: (i) => `Question: ${i.question}\nRubric: ${i.rubric}\nStudent answer: ${i.answer}\nMaximum marks: ${i.max}\n\nReply as JSON: {"score":0,"max":0,"criteria":[{"criterion":"","awarded":0,"possible":0,"evidence":""}],"feedback":"for the student"}`,
    review: 'Suggested marks only. Faculty confirm or change every score.' },
  { id: 'accreditation-check', name: 'Accreditation evidence check', industries: ['education'], category: 'Compliance', kind: 'Grounded comparison', icon: 'list',
    summary: 'Check uploaded institutional documents against an accreditation criterion and list the evidence found and missing.',
    inputs: [{ key: 'criterion', label: 'Criterion and what evidence it expects', type: 'textarea', rows: 5 }],
    example: { criterion: 'The institution protects student records and publishes how students can access and correct them, and has a records retention schedule.' },
    format: 'json', grounding: true, system: 'You help an accreditation office check evidence. Use only the internal excerpts provided. Reply with JSON only.',
    prompt: (i) => `Criterion:\n${i.criterion}\n\nReply as JSON: {"evidence_found":[{"document":"","what_it_shows":""}],"missing":[""],"readiness":"ready|partial|not ready"}`,
    review: 'For the accreditation coordinator to verify against the official criteria.' },
  // ---------------- every industry ----------------
  { id: 'gap-check', name: 'Policy gap check', industries: '*', category: 'Compliance', kind: 'Grounded comparison', icon: 'scale',
    summary: 'Paste a requirement and see which internal policies cover it and what is still missing.',
    inputs: [{ key: 'requirement', label: 'Requirement or regulation text', type: 'textarea', rows: 6 }],
    example: { requirement: 'Workforce members must receive security awareness training at least annually, and training completion must be documented.' },
    format: 'json', grounding: true, system: 'You compare a requirement against internal policy excerpts. Use only the excerpts. Reply with JSON only.',
    prompt: (i) => `Requirement:\n${i.requirement}\n\nReply as JSON: {"covered_by":[{"document":"","how":""}],"gaps":[""],"suggested_policy_text":""}`,
    review: 'For the compliance owner to confirm.' },
  { id: 'summarize', name: 'Summary and action items', industries: '*', category: 'Productivity', kind: 'Generation', icon: 'doc',
    summary: 'Summarize any long text into key points, decisions, owners and deadlines.',
    inputs: [{ key: 'text', label: 'Text', type: 'textarea', rows: 10 }],
    example: { text: 'Quality committee, Oct 28. Readmission rate for heart failure rose to 21% in Q3. Agreed: pharmacy to start discharge medication reconciliation calls within 48 hours (owner: pharmacy lead, start Nov 15). IT to add a readmission risk flag in the EHR by December. Next review in January.' },
    system: 'You summarize text accurately and briefly. Do not add facts.', prompt: (i) => `Summarize with headings Key points, Decisions, Action items (owner, due date):\n\n${i.text}`, review: 'Check against the source before sharing.' },
  { id: 'clause-extract', name: 'Contract clause extraction', industries: ['legal', 'healthcare', 'banking', 'insurance', 'technology', 'other'], category: 'Legal', kind: 'Structured extraction', icon: 'scale',
    summary: 'Pull parties, term, renewal, liability cap, confidentiality, data protection and termination clauses out of a contract.',
    inputs: [{ key: 'contract', label: 'Contract text', type: 'textarea', rows: 10 }],
    example: { contract: 'This Agreement between Northside Imaging LLC ("Vendor") and Pulse Emergency Hospital ("Customer") begins January 1, 2027 for 24 months and renews automatically for 12-month terms unless either party gives 90 days notice. Vendor\'s total liability is capped at fees paid in the prior 12 months. Each party keeps the other\'s confidential information secret for 5 years.' },
    format: 'json', system: 'You extract clauses from contracts precisely, quoting the source text. Reply with JSON only.',
    prompt: (i) => `Contract:\n${i.contract}\n\nReply as JSON: {"parties":[""],"effective_date":"","term":"","renewal":"","liability_cap":"","confidentiality":"","data_protection":"","termination":"","unusual_terms":[""]}`,
    review: 'For counsel to verify against the signed document.' },
];

const forIndustry = (industry) => APPS.filter((a) => a.industries === '*' || a.industries.includes(industry));
module.exports = { APPS, forIndustry, redactPHI, W };
