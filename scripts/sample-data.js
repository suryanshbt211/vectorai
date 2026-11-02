'use strict';
// Two fictional sample customers used by scripts/seed-samples.js. Every organization, person and
// document here is invented for demonstration. The documents mention real laws and standards in
// general terms so the compliance signals have something to match; they are not legal templates.

const NOTE = 'Demo policy of a fictional organization (Vector demo tenant). Not legal advice.';

// Pulse Emergency Hospital Pvt Ltd: a hospital in Mumbai, Maharashtra, India (India only).
const HEALTH = {
  org: { name: 'Pulse Emergency Hospital Pvt Ltd', industry: 'healthcare', jurisdictions: ['IN', 'IN-MH'], deploymentType: 'on_prem' },
  owner: ['pe.owner', 'Dr. Meera Iyer (Director)'],
  people: [
    ['pe.platform', 'Karan Malhotra', 'platform_admin', 'IT'],
    ['pe.engineer', 'Priya Nair', 'ai_engineer', 'IT'],
    ['pe.security', 'Vikram Rao', 'security_admin', 'IT Security'],
    ['pe.compliance', 'Rohan Mehta', 'compliance_officer', 'Compliance'],
    ['pe.mrd', 'Sneha Patil', 'dept_admin', 'Medical Records'],
    ['pe.nurse', 'Sister Anjali Pawar', 'employee', 'Clinical'],
    ['pe.billing', 'Farhan Shaikh', 'employee', 'Billing and TPA'],
    ['pe.psychiatry', 'Dr. Arjun Kulkarni', 'employee', 'Psychiatry'],
    ['pe.radiology', 'Dr. Kavita Joshi', 'employee', 'Radiology'],
    ['pe.auditor', 'Neha Bhatt (external auditor)', 'auditor', ''],
  ],
  deployments: [
    { name: 'Clinical Policy Assistant', temperature: 0.3, systemPrompt: 'You help staff at Pulse Emergency Hospital, Mumbai, find answers in internal policies. Cite the excerpts you use as [1], [2]. Never invent policy. Do not give medical advice about specific patients.' },
    { name: 'Compliance Reviewer', temperature: 0.1, systemPrompt: 'You support the compliance team of a hospital in Mumbai, India. Be precise and conservative, cite internal excerpts, and say what is missing.' },
  ],
  docs: [
    ['Patient Data Protection Policy (DPDP Act)', '*', `${NOTE}

Scope. Personal data of patients, relatives and staff processed by Pulse Emergency Hospital, Mumbai, Maharashtra.

Notice and consent. Patients receive a clear notice in English, Marathi or Hindi describing the personal data collected, the purpose and how to withdraw consent. Treatment in a medical emergency proceeds under the legitimate-use provisions of the Digital Personal Data Protection Act, 2023.

Minimum necessary. Staff access only the patient data needed for their role. Role-based access in the HIS and EMR enforces this.

Security safeguards. Health records are stored on the hospital's own servers in Mumbai with encryption, role-based access and audit logging. The on-premises AI platform processes data locally; no patient data is sent to outside AI services.

Patient rights. Patients may request access, correction and erasure where the law allows, and nominate a person to exercise their rights. Requests go to the grievance officer.

Grievance officer: Rohan Mehta, Compliance. The policy is reviewed every year.`],
    ['Information Security Risk Assessment 2026', 'IT Security', `${NOTE}

Scope. Annual risk assessment of the HIS, EMR, PACS, billing and the on-premises AI platform, aligned to ISO/IEC 27001 and the reasonable security practices expected under the IT Act, 2000 (Section 43A and SPDI Rules).

Top risks. Ransomware on PACS, weak passwords on legacy lab interfaces, unencrypted USB use in wards, and vendor remote access.

Controls. Multi-factor authentication for remote access, network segmentation of medical devices, encrypted backups tested quarterly, and security awareness training for all staff.

The AI platform runs fully on premises with no external API calls. Prompts and answers are logged in a tamper-evident audit chain.`],
    ['Breach and Security Incident Response Procedure', 'IT Security', `${NOTE}

Report immediately. Any staff member who suspects a cyber incident or that patient data reached the wrong person reports it to the IT helpdesk and the Compliance office at once.

CERT-In. Reportable cyber incidents listed in the CERT-In Directions of 28 April 2022 (ransomware, data breaches, unauthorised access to IT systems and others) are reported to CERT-In within 6 hours of being noticed. ICT system logs are kept for 180 days within India and all servers synchronise time with NIC or NPL NTP servers.

DPDP Act. Personal data breaches are intimated to the Data Protection Board of India and to each affected person as the DPDP Rules require, describing what happened, the likely impact and the steps taken.

Assessment. Compliance assesses the nature and extent of the data, who received it, whether it was viewed or misused, and how far the risk was mitigated. The decision and its reasoning are recorded.

The IT lead is the point of contact registered with CERT-In.`],
    ['Mental Healthcare Records Confidentiality', 'Psychiatry', `${NOTE}

Under the Mental Healthcare Act, 2017, every person with mental illness has the right to confidentiality of information about their mental health, treatment and physical healthcare.

Disclosure. Psychiatric records are shared only with the patient's consent, with the nominated representative, with clinicians directly involved in care, or as the Act or a court requires.

Access. Psychiatric notes sit in a restricted section of the EMR visible only to the psychiatry team. Photographs or information about a patient are never released to the media without consent.`],
    ['Medical Records Retention Schedule', 'Medical Records', `${NOTE}

Indoor (in-patient) medical records are retained for at least 3 years from the date treatment began, as the Indian Medical Council professional conduct regulations require. Records of medico-legal cases are retained until the case is finally disposed of. Records of minors are kept until the patient turns 21.

PC-PNDT records (Form F and related) are preserved for at least 2 years. Bio-medical waste records are kept for 5 years.

System audit logs are kept for at least 180 days within India (CERT-In). Electronic records follow the same schedules.`],
    ['Patient Access to Medical Records Procedure', 'Medical Records', `${NOTE}

Patients or their authorised representatives may request copies of medical records in writing. Copies are provided within 72 hours of the request, as the Indian Medical Council regulations require.

Identity is verified before release. Copies of psychiatric records follow the Mental Healthcare Records Confidentiality policy. Records shared through the Ayushman Bharat Digital Mission use ABHA consent artefacts.`],
    ['Responsible AI Use Policy', '*', `${NOTE}

Approved tools. Staff use only the hospital's on-premises AI platform. Patient information must not be entered into public AI chatbots or any external AI service.

Human review. AI output is a draft. Clinicians decide on diagnosis and treatment; coders, billing staff and the compliance office review every AI draft in their area.

Oversight. The AI committee reviews the inventory of AI systems every quarter, with incidents and usage metrics, and approves every new model version after evaluation.`],
    ['Hospital Registration and Statutory Records (Maharashtra)', 'Administration', `${NOTE}

The hospital holds a current registration under the Maharashtra nursing homes law and renews it before expiry. Registration under the Clinical Establishments Act framework is maintained as applicable. The registration certificate, the patients' rights charter and the schedule of charges are displayed at reception in English and Marathi.

Registers. Admission and discharge registers, operation theatre records and death records are maintained as prescribed and produced to inspecting authorities.

Bio-medical waste is segregated at source and handed to the authorised common treatment facility; the annual report is filed with the Maharashtra Pollution Control Board.

Ultrasound and imaging. The radiology unit is registered under the PC-PNDT Act; Form F is completed for every procedure.`],
    ['Vendor Data Processing Standard Terms', 'Compliance', `${NOTE}

Every vendor that processes patient or staff personal data on the hospital's behalf (a data processor under the DPDP Act) signs an agreement that requires:
1. Processing only on the hospital's documented instructions and only for the agreed purpose.
2. Reasonable security safeguards, including encryption and access control.
3. Notice to the hospital of any personal data breach within 24 hours, so the hospital can meet the 6-hour CERT-In timeline and the DPDP Act intimation.
4. No sub-processors without the hospital's written approval.
5. Data stored in India unless the hospital agrees otherwise.
6. Return or deletion of all data at the end of the contract, with written confirmation.
7. Cooperation with audits and with patient rights requests.`],
    ['ABDM and Digital Health Records Procedure', 'Medical Records', `${NOTE}

The hospital participates in the Ayushman Bharat Digital Mission. Patients may link records to their ABHA number. Health records are shared through ABDM only against a valid consent artefact, and the consent log is retained.

ABHA numbers are personal identifiers and are masked in any extract used for analytics or AI training.`],
    ['Clinical Documentation Quick Guide', 'Clinical', `${NOTE}

Shift handoff uses SBAR (Situation, Background, Assessment, Recommendation).

Late entries are labelled "Late entry", show the current date and time, refer to the time care was given, and never alter the original note.

Abbreviations from the "do not use" list are not used. Verbal orders are read back and signed by the ordering doctor within 24 hours.`],
    ['Discharge Summary Template', 'Clinical', `Demo policy of a fictional organization (Vector demo tenant). Not clinical guidance.

Every discharge summary uses these headings in this order:
1. Patient: UHID only (no name in drafts produced by AI tools).
2. Admission and discharge dates.
3. Principal diagnosis and secondary diagnoses.
4. Hospital course: a short narrative of key events, treatments and response.
5. Procedures performed.
6. Discharge medications, grouped as New, Changed and Stopped, each with dose and frequency.
7. Allergies.
8. Follow-up appointments and tests, with timeframes.
9. Results pending at discharge and who will follow them up.
10. Patient instructions in plain language (English, Marathi or Hindi), including warning signs that need urgent care.
11. Doctor's name, registration number and signature, completed by the discharging doctor.

AI-drafted summaries are marked DRAFT until a doctor reviews and signs them.`],
    ['Cashless Pre-authorization Guide', 'Billing and TPA', `Demo policy of a fictional organization (Vector demo tenant). Not insurer guidance.

A pre-authorization request to an insurer or TPA must state: the requested treatment or investigation, the provisional diagnosis, how long symptoms have lasted, conservative treatment tried with dates and outcome, objective examination or test findings, red-flag findings, the expected length of stay and the estimated cost.

Imaging of the lumbar spine is generally requested after at least six weeks of failed conservative therapy, or earlier when red flags such as progressive neurological deficit are documented.

Mark a request as an emergency when a delay could seriously jeopardise the patient's health. Keep a copy of every request and the insurer's reply in the patient account. The treating doctor signs every request.`],
  ],
  tags: {
    'Patient Data Protection Policy (DPDP Act)': 'dpdp, privacy, consent, patient rights',
    'Information Security Risk Assessment 2026': 'security, risk, iso 27001, it act',
    'Breach and Security Incident Response Procedure': 'breach, incident, cert-in, dpdp',
    'Mental Healthcare Records Confidentiality': 'mental healthcare act, psychiatry, confidentiality',
    'Medical Records Retention Schedule': 'retention, records',
    'Patient Access to Medical Records Procedure': 'patient access, records',
    'Responsible AI Use Policy': 'ai, governance',
    'Hospital Registration and Statutory Records (Maharashtra)': 'maharashtra, registration, pc-pndt, bio-medical waste',
    'Vendor Data Processing Standard Terms': 'vendors, dpdp, contracts',
    'ABDM and Digital Health Records Procedure': 'abdm, abha, consent',
    'Clinical Documentation Quick Guide': 'clinical, nursing',
    'Discharge Summary Template': 'clinical, discharge, template',
    'Cashless Pre-authorization Guide': 'billing, tpa, pre-authorization',
  },
  training: ['Patient Data Protection Policy (DPDP Act)', 'Breach and Security Incident Response Procedure', 'Medical Records Retention Schedule', 'Clinical Documentation Quick Guide'],
  tasks: [
    ['Collect signed data processing agreements from all imaging vendors', 'in-dpdp', 'pe.compliance', 'high', 14],
    ['Run the 6-hour CERT-In incident reporting drill', 'in-certin', 'pe.security', 'high', 10],
    ['Publish the DPDP consent notice in Marathi and Hindi', 'in-dpdp', 'pe.compliance', 'critical', -1],
    ['Renew the Maharashtra nursing home registration', 'inmh-nursing-homes', 'pe.compliance', 'high', 25],
    ['File the annual bio-medical waste report with MPCB', 'in-bmw', 'pe.mrd', 'medium', 18],
    ['Audit Form F records in radiology for the last quarter', 'in-pcpndt', 'pe.radiology', 'medium', 12],
  ],
  evals: { name: 'Front-line policy questions', cases: [
    { q: 'Within how many hours must a cyber incident be reported to CERT-In?', mustInclude: ['6'] },
    { q: 'Can staff put patient information into public AI chatbots?', mustInclude: ['not'] },
    { q: 'How long are in-patient medical records kept?', mustInclude: ['3 years'] },
    { q: 'What format do we use for shift handoff notes?', mustInclude: ['SBAR'] },
    { q: 'How quickly must we give patients copies of their medical records?', mustInclude: ['72'] },
  ] },
  custom: { title: 'Board policy: quarterly review of AI system inventory', summary: 'The Board Quality and Compliance Committee requires a quarterly review of every AI system in use, its risk rating, incidents and usage metrics.', category: 'ai', level: 'local', jurisdiction: 'Pulse Board policy QC-12' },
  questions: [
    ['pe.nurse', 'How do I document a late entry in the chart?'],
    ['pe.nurse', 'What should I do if I think patient information was sent to the wrong person?'],
    ['pe.billing', 'What must a cashless pre-authorization request include?'],
    ['pe.security', 'Within how many hours must a cyber incident be reported to CERT-In?'],
    ['pe.psychiatry', 'Who can we share a psychiatric patient\'s records with?'],
    ['pe.mrd', 'How long must we keep in-patient records and system audit logs?'],
    ['pe.platform', 'Are we allowed to use public AI chatbots with patient data?'],
    ['pe.compliance', 'What must a vendor data processing agreement require?'],
  ],
  favorites: ['a:phi-redact', 'a:discharge-summary', 'a:breach-triage', 'p:compliance', 'p:chat', 'p:intel'],
  appDemos: ['phi-redact', 'breach-triage'],
  // values already entered by the hospital (dates relative to today); the check finds the rest missing
  compInputs: [
    ['in-dpdp', 'grievance-officer', 'Rohan Mehta, Compliance (grievance@pulse.example)'],
    ['in-certin', 'poc', 'Vikram Rao, IT Security lead'],
    ['in-certin', 'log-days', 180],
    ['in-certin', 'last-drill', { days: -75 }],
    ['in-clinical-est', 'reg-number', 'MH/MUM/CE/2024/0187'],
    ['in-clinical-est', 'reg-valid', { days: 150 }],
    ['inmh-nursing-homes', 'mh-reg', 'BMC/NH/2023/4412'],
    ['inmh-nursing-homes', 'mh-valid', { days: -20 }],
    ['in-medical-records', 'mrd-head', 'Sneha Patil, Medical Records'],
    ['in-bmw', 'cbwtf', 'Authorised common treatment facility, Mumbai'],
  ],
  liveCheck: true,
  assignBy: { security: 'pe.security', breach: 'pe.security', records: 'pe.mrd', transfer: 'pe.platform', ai: 'pe.engineer', default: 'pe.compliance' },
};

const EDU = {
  org: { name: 'Lakeshore University', industry: 'education', jurisdictions: ['US', 'US-NY', 'US-IL', 'EU'], deploymentType: 'on_prem' },
  owner: ['lu.owner', 'James Whitfield (CIO)'],
  people: [
    ['lu.platform', 'Mei Lin', 'platform_admin', 'IT'],
    ['lu.engineer', 'Carlos Mendes', 'ai_engineer', 'IT'],
    ['lu.security', 'Fatima Haddad', 'security_admin', 'IT'],
    ['lu.compliance', 'Robert Hayes', 'compliance_officer', 'General Counsel'],
    ['lu.registrar', 'Olivia Brooks', 'dept_admin', 'Registrar'],
    ['lu.faculty', 'Prof. Ethan Cole', 'employee', 'Academic Affairs'],
    ['lu.admissions', 'Nina Kowalski', 'employee', 'Admissions'],
    ['lu.facilities', 'Marcus Green', 'employee', 'Facilities'],
    ['lu.auditor', 'Diane Foster (internal audit)', 'auditor', ''],
  ],
  deployments: [
    { name: 'Campus Policy Assistant', temperature: 0.3, systemPrompt: 'You help Lakeshore University staff find answers in university policies. Cite excerpts as [1], [2]. Never invent policy. Do not reveal student records.' },
    { name: 'Compliance Reviewer', temperature: 0.1, systemPrompt: 'You support the General Counsel office. Be precise and conservative, cite internal excerpts, and say what is missing.' },
  ],
  docs: [
    ['FERPA Student Education Records Policy', '*', `${NOTE}

Lakeshore University protects student education records under the Family Educational Rights and Privacy Act (FERPA, 20 U.S.C. 1232g; 34 CFR Part 99).

Rights. Students may inspect and review their records, request amendment of inaccurate records, consent to disclosures, and file a complaint with the US Department of Education.

Annual notification. The Registrar publishes the annual FERPA notification each fall, including the definition of school official and legitimate educational interest.

Disclosure. Personally identifiable information from education records is disclosed only with written consent or under a FERPA exception, such as to school officials with a legitimate educational interest. Disclosures are recorded where required.

Directory information. Name, major, enrollment status and degrees may be released as directory information unless the student opts out through the student portal.`],
    ['Information Security Program (NY SHIELD Act safeguards)', 'IT', `${NOTE}

The university maintains reasonable administrative, technical and physical safeguards for private information of New York residents, as the New York SHIELD Act requires.

Administrative: a designated Information Security Officer, annual risk assessment, workforce training, and vendor contracts requiring safeguards. Technical: role-based access, multi-factor authentication, encryption of laptops, network monitoring, and audit logging of access to student systems. Physical: badge access to data centers and secure disposal.

The program is organized using the NIST Cybersecurity Framework 2.0. ISO/IEC 27001 certification is not pursued at this time.`],
    ['Biometric Information Policy for Campus Access', 'Facilities', `${NOTE}

The Chicago campus uses fingerprint readers at research labs. This policy implements the Illinois Biometric Information Privacy Act (BIPA).

Written policy and retention. This publicly available policy sets the retention schedule: biometric identifiers are permanently destroyed when the purpose for collection is satisfied, or within three years of the person's last interaction with the university, whichever comes first.

Informed written consent. Before enrollment, each person receives written notice of the purpose and length of collection and signs a release. Badge access is offered as an alternative.

No sale. Biometric data is never sold, leased or traded, and is disclosed only as BIPA permits. Templates are encrypted at rest.`],
    ['Incident Response and Breach Notification Plan', 'IT', `${NOTE}

Security incidents are reported to the IT Security Operations Center. The incident team triages, contains and investigates.

If private information or education records may have been exposed, General Counsel decides notification duties under state breach notification laws, including New York and Illinois, and under GDPR for EU data subjects, where the supervisory authority must be notified within 72 hours of becoming aware of a personal data breach unless it is unlikely to result in risk.

Lessons-learned reviews follow every significant incident. Incident records are retained for six years.`],
    ['Generative AI in Teaching and Administration Guidance', 'Academic Affairs', `${NOTE}

Approved platform. Faculty and staff use the university's on-premises AI workspace. Student education records and other confidential data must not be entered into public AI tools.

Human decisions. AI is not used to make admissions, grading, discipline or financial aid decisions. Staff may use AI to draft, but a person reviews and decides. Admissions and grading uses would be high-risk under the EU AI Act for the Dublin study centre, so they are prohibited without a formal assessment.

Risk management. The AI Steering Group maintains an AI system inventory and reviews risks using the NIST AI Risk Management Framework.

Transparency. Instructors state in the syllabus whether and how AI may be used in the course.`],
    ['GDPR Privacy Notice for EU Applicants and Study Abroad', 'Admissions', `${NOTE}

Lakeshore University processes personal data of applicants and students at its Dublin study centre and of EU-resident applicants under the GDPR.

Lawful basis: performance of a contract for enrolled students, legitimate interests for recruitment, and consent for marketing. Special category data is processed only with explicit consent or another Article 9 condition.

Transfers. Personal data transferred from the EU to the United States relies on Standard Contractual Clauses or the EU-US Data Privacy Framework where the recipient is certified.

Rights. Data subjects may access, rectify, erase, restrict, object and port their data, and complain to the Irish Data Protection Commission. A record of processing activities is maintained.`],
    ['University Records Retention Schedule', 'Registrar', `${NOTE}

Academic transcripts: permanent. Application files of students who did not enroll: 1 year after the admission cycle. Enrolled student files: 5 years after graduation or last attendance. Financial aid records: at least 3 years after the award year report.

Security and access logs: 1 year. Incident records: 6 years.

Electronic records are stored with integrity controls. Destruction is documented. Legal holds suspend destruction.`],
    ['Registrar FAQ: Transcripts and Enrollment Verification', 'Registrar', `${NOTE}

Official transcripts are ordered through the student portal and sent electronically within 2 business days. Students with a financial hold can still receive a transcript for employment if the hold is under review.

Enrollment verification for employers, insurers and lenders is provided through the National Student Clearinghouse. Parents of dependent students may receive information only if the student signs a FERPA release or another FERPA exception applies.

Name changes require a government-issued document and are processed within 5 business days.`],
  ],
  tags: { 'FERPA Student Education Records Policy': 'ferpa, student records, privacy', 'Information Security Program (NY SHIELD Act safeguards)': 'security, shield act, nist', 'Biometric Information Policy for Campus Access': 'bipa, biometrics, facilities', 'Incident Response and Breach Notification Plan': 'breach, incident, gdpr', 'Generative AI in Teaching and Administration Guidance': 'ai, teaching, eu ai act', 'GDPR Privacy Notice for EU Applicants and Study Abroad': 'gdpr, admissions, transfers', 'University Records Retention Schedule': 'retention, records', 'Registrar FAQ: Transcripts and Enrollment Verification': 'registrar, transcripts, ferpa' },
  training: ['FERPA Student Education Records Policy', 'Registrar FAQ: Transcripts and Enrollment Verification', 'University Records Retention Schedule'],
  tasks: [
    ['Publish this year\'s annual FERPA notification', 'us-ferpa', 'lu.registrar', 'high', 7],
    ['Write a COPPA policy for the summer coding camp (under 13)', 'us-coppa', 'lu.compliance', 'critical', -2],
    ['Update the record of processing activities for the Dublin centre', 'eu-gdpr', 'lu.compliance', 'medium', 21],
    ['Confirm BIPA consent forms for all lab fingerprint users', 'usil-bipa', 'lu.facilities', 'high', 12],
  ],
  evals: { name: 'Registrar and policy questions', cases: [
    { q: 'Can a parent see their adult child\'s grades without consent?', mustInclude: ['FERPA'] },
    { q: 'How long do we keep fingerprint data from lab readers?', mustInclude: ['three years'] },
    { q: 'How quickly must the regulator be told about an EU personal data breach?', mustInclude: ['72 hours'] },
    { q: 'How long are application files of students who did not enroll kept?', mustInclude: ['1 year'] },
  ] },
  custom: { title: 'Board of Trustees resolution: annual review of AI use in admissions', summary: 'The Board requires General Counsel to confirm every year that no AI system makes or materially influences admissions decisions, and to report AI usage metrics.', category: 'ai', level: 'local', jurisdiction: 'Board resolution 2026-07' },
  questions: [
    ['lu.registrar', 'Can I tell a parent what grades their son received this semester?'],
    ['lu.faculty', 'Am I allowed to use AI to grade student essays?'],
    ['lu.admissions', 'What is our lawful basis for processing EU applicants\' data?'],
    ['lu.facilities', 'How long can we keep fingerprint data from the lab readers?'],
    ['lu.compliance', 'How quickly must we notify the regulator after a breach affecting EU students?'],
    ['lu.registrar', 'How long do we keep application files for students who did not enroll?'],
    ['lu.platform', 'Which safeguards does the SHIELD Act require us to have?'],
    ['lu.faculty', 'How do students opt out of directory information?'],
  ],
};


module.exports = { HEALTH, EDU };

EDU.favorites = ['a:answer-eval', 'a:accreditation-check', 'p:compliance', 'p:chat', 'p:intel'];
EDU.appDemos = ['answer-eval'];
EDU.assignBy = { security: 'lu.security', breach: 'lu.security', records: 'lu.registrar', default: 'lu.compliance' };
