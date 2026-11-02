'use strict';
// Vector regulatory starter pack. Data-handling obligations by industry and jurisdiction level.
//
// IMPORTANT: this is a curated reference to help organize compliance work. It is NOT legal advice and it is
// NOT exhaustive: laws change, thresholds and scope exceptions apply, and local rules are only partly covered.
// Every entry must be confirmed against the primary source by qualified counsel before relying on it.
// Entries marked `verify` have dates or scope that were still moving when this pack was compiled.
// Customers add their own rules (for example city by-laws or contractual duties) as custom obligations.

const PACK = {
  version: '0.1.0',
  compiled: '2026-10-31',
  notice: 'Reference starter pack, not legal advice and not exhaustive. Confirm every entry with counsel against the primary source. Add missing local or contractual rules as custom obligations.',
};

const INDUSTRIES = [
  { id: 'logistics', name: 'Logistics, transport and supply chain' },
  { id: 'banking', name: 'Banking and capital markets' },
  { id: 'insurance', name: 'Insurance' },
  { id: 'healthcare', name: 'Healthcare providers' },
  { id: 'pharma', name: 'Pharma, biotech and medical devices' },
  { id: 'manufacturing', name: 'Manufacturing and industrial' },
  { id: 'energy', name: 'Energy and utilities' },
  { id: 'government_defense', name: 'Government and defense' },
  { id: 'telecom', name: 'Telecommunications' },
  { id: 'retail', name: 'Retail and e-commerce' },
  { id: 'education', name: 'Education' },
  { id: 'legal', name: 'Legal and professional services' },
  { id: 'technology', name: 'Technology and SaaS' },
  { id: 'other', name: 'Other / general business' },
];

const LEVELS = { international: 'International', regional: 'Regional (multi-country)', national: 'National', state: 'State / province', local: 'Local / city / zone' };

const JURISDICTIONS = [
  { code: 'INTL', name: 'International standards and frameworks', level: 'international', parent: null, always: true },
  { code: 'EU', name: 'European Union', level: 'regional', parent: null },
  { code: 'DE', name: 'Germany', level: 'national', parent: 'EU' },
  { code: 'FR', name: 'France', level: 'national', parent: 'EU' },
  { code: 'IE', name: 'Ireland', level: 'national', parent: 'EU' },
  { code: 'NL', name: 'Netherlands', level: 'national', parent: 'EU' },
  { code: 'ES', name: 'Spain', level: 'national', parent: 'EU' },
  { code: 'IT', name: 'Italy', level: 'national', parent: 'EU' },
  { code: 'US', name: 'United States (federal)', level: 'national', parent: null },
  { code: 'US-CA', name: 'California', level: 'state', parent: 'US' },
  { code: 'US-NY', name: 'New York State', level: 'state', parent: 'US' },
  { code: 'US-NY-NYC', name: 'New York City', level: 'local', parent: 'US-NY' },
  { code: 'US-TX', name: 'Texas', level: 'state', parent: 'US' },
  { code: 'US-VA', name: 'Virginia', level: 'state', parent: 'US' },
  { code: 'US-CO', name: 'Colorado', level: 'state', parent: 'US' },
  { code: 'US-IL', name: 'Illinois', level: 'state', parent: 'US' },
  { code: 'US-WA', name: 'Washington State', level: 'state', parent: 'US' },
  { code: 'IN', name: 'India', level: 'national', parent: null },
  { code: 'IN-MH', name: 'India: Maharashtra', level: 'state', parent: 'IN' },
  { code: 'IN-KA', name: 'India: Karnataka', level: 'state', parent: 'IN' },
  { code: 'IN-DL', name: 'India: Delhi', level: 'state', parent: 'IN' },
  { code: 'IN-TN', name: 'India: Tamil Nadu', level: 'state', parent: 'IN' },
  { code: 'IN-GJ', name: 'India: Gujarat', level: 'state', parent: 'IN' },
  { code: 'IN-TG', name: 'India: Telangana', level: 'state', parent: 'IN' },
  { code: 'GB', name: 'United Kingdom', level: 'national', parent: null },
  { code: 'AE', name: 'United Arab Emirates', level: 'national', parent: null },
  { code: 'AE-DIFC', name: 'UAE: Dubai International Financial Centre', level: 'local', parent: 'AE' },
  { code: 'AE-ADGM', name: 'UAE: Abu Dhabi Global Market', level: 'local', parent: 'AE' },
  { code: 'SA', name: 'Saudi Arabia', level: 'national', parent: null },
  { code: 'SG', name: 'Singapore', level: 'national', parent: null },
  { code: 'AU', name: 'Australia', level: 'national', parent: null },
  { code: 'CA', name: 'Canada (federal)', level: 'national', parent: null },
  { code: 'CA-QC', name: 'Canada: Quebec', level: 'state', parent: 'CA' },
  { code: 'CA-ON', name: 'Canada: Ontario', level: 'state', parent: 'CA' },
  { code: 'BR', name: 'Brazil', level: 'national', parent: null },
  { code: 'JP', name: 'Japan', level: 'national', parent: null },
  { code: 'KR', name: 'South Korea', level: 'national', parent: null },
  { code: 'CN', name: 'China (mainland)', level: 'national', parent: null },
  { code: 'ZA', name: 'South Africa', level: 'national', parent: null },
  { code: 'CH', name: 'Switzerland', level: 'national', parent: null },
];

const CATEGORIES = {
  privacy: 'Data protection and privacy',
  security: 'Information security',
  breach: 'Incident and breach reporting',
  records: 'Records and retention',
  transfer: 'Cross-border data',
  ai: 'AI governance',
  sector: 'Sector-specific data duties',
};

const A = '*';
const FIN = ['banking', 'insurance'];
const CNI = ['logistics', 'energy', 'healthcare', 'banking', 'telecom', 'government_defense', 'manufacturing'];
const HEALTH = ['healthcare', 'pharma'];
const TRADE = ['logistics', 'retail', 'manufacturing'];

// [id, jurisdiction, industries, category, type, title, summary, verify?]
// type: law | regulation | standard | guidance
const ROWS = [
  // ---- International standards and frameworks ----
  ['intl-iso27001', 'INTL', A, 'security', 'standard', 'ISO/IEC 27001:2022, Information security management system', 'Certifiable standard for a risk-based ISMS with a catalogue of security controls. Widely requested by customers and regulators as evidence of security governance.'],
  ['intl-iso27701', 'INTL', A, 'privacy', 'standard', 'ISO/IEC 27701, Privacy information management system', 'Extends ISO 27001 with controls for controllers and processors of personal data. Useful to show GDPR-style accountability.'],
  ['intl-iso42001', 'INTL', A, 'ai', 'standard', 'ISO/IEC 42001:2023, AI management system', 'Certifiable management system for developing and using AI responsibly: risk assessment, impact assessment, lifecycle controls, oversight.'],
  ['intl-soc2', 'INTL', ['technology', 'banking', 'insurance', 'healthcare', 'retail', 'legal', 'other'], 'security', 'standard', 'SOC 2 (AICPA Trust Services Criteria)', 'Independent attestation on security, availability, processing integrity, confidentiality and privacy controls. Commonly demanded in vendor reviews.'],
  ['intl-iso22301', 'INTL', A, 'sector', 'standard', 'ISO 22301, Business continuity management', 'Continuity planning and recovery for critical processes, including recovery of data and AI services.'],
  ['intl-pci', 'INTL', ['banking', 'retail', 'technology', 'insurance', 'logistics'], 'security', 'standard', 'PCI DSS v4.0.1', 'Contractual security standard for anyone storing, processing or transmitting payment card data: segmentation, encryption, access control, logging, testing.'],
  ['intl-fatf', 'INTL', ['banking', 'insurance', 'legal'], 'records', 'guidance', 'FATF Recommendations: customer due diligence and record-keeping', 'International AML/CFT standard. Recommendation 11 expects transaction and due-diligence records to be kept for at least five years and made available to authorities.'],
  ['intl-bcbs239', 'INTL', ['banking'], 'sector', 'guidance', 'BCBS 239, Risk data aggregation and reporting', 'Basel principles on data governance, accuracy, completeness and timeliness of risk data for large banks.'],
  ['intl-swift', 'INTL', ['banking'], 'security', 'standard', 'SWIFT Customer Security Controls Framework', 'Mandatory and advisory controls for SWIFT users: secure environment, access restriction, detection and annual attestation.'],
  ['intl-iso28000', 'INTL', ['logistics', 'retail', 'manufacturing'], 'sector', 'standard', 'ISO 28000:2022, Supply chain security management', 'Security and resilience management system for supply chains, including protection of shipment and operational data.'],
  ['intl-wco', 'INTL', ['logistics', 'retail', 'manufacturing'], 'sector', 'guidance', 'WCO SAFE Framework and Authorized Economic Operator programmes', 'Customs-to-business standards. AEO status depends on demonstrable security and record-keeping of trade data.'],
  ['intl-dg', 'INTL', ['logistics', 'manufacturing', 'pharma'], 'records', 'regulation', 'Dangerous goods rules (IATA DGR, ICAO Technical Instructions, IMDG, ADR)', 'Mode-specific rules for shipping documents, declarations, training records and incident reporting for dangerous goods. Retention periods differ by mode and country.'],
  ['intl-gxp', 'INTL', ['pharma', 'healthcare'], 'records', 'guidance', 'GxP data integrity (ALCOA+, PIC/S, WHO, MHRA guidance)', 'Regulated records must be attributable, legible, contemporaneous, original, accurate, complete and consistent, with audit trails.'],
  ['intl-ich-gcp', 'INTL', ['pharma', 'healthcare'], 'records', 'guidance', 'ICH E6 Good Clinical Practice', 'Clinical trial data integrity, subject confidentiality, source records and archiving for sponsors and sites.'],
  ['intl-iec62443', 'INTL', ['manufacturing', 'energy', 'logistics'], 'security', 'standard', 'IEC 62443, Industrial automation and control systems security', 'Security levels, zones and conduits, secure development and operations for industrial control systems.'],
  ['intl-iso27019', 'INTL', ['energy'], 'security', 'standard', 'ISO/IEC 27019, Information security for energy utilities', 'Sector-specific guidance on ISO 27002 controls for process control systems in energy.'],
  ['intl-iso13485', 'INTL', ['pharma', 'healthcare'], 'sector', 'standard', 'ISO 13485, Medical device quality management', 'Quality system including controlled records, traceability and software validation for medical devices.'],
  ['intl-nist-csf', 'INTL', A, 'security', 'guidance', 'NIST Cybersecurity Framework 2.0', 'Voluntary framework (Govern, Identify, Protect, Detect, Respond, Recover) used worldwide as a common security vocabulary.'],
  ['intl-nist-ai', 'INTL', A, 'ai', 'guidance', 'NIST AI Risk Management Framework 1.0', 'Voluntary guidance to govern, map, measure and manage AI risks, including a generative AI profile.'],

  // ---- European Union ----
  ['eu-gdpr', 'EU', A, 'privacy', 'law', 'GDPR, Regulation (EU) 2016/679', 'Lawful basis, transparency, data subject rights, records of processing, DPIAs, data protection officer where required, processor contracts (Art. 28), privacy by design. Fines up to EUR 20M or 4% of worldwide turnover. Applies to organizations outside the EU that target or monitor people in the EU.'],
  ['eu-gdpr-breach', 'EU', A, 'breach', 'law', 'GDPR personal data breach notification (Art. 33-34)', 'Notify the supervisory authority without undue delay and where feasible within 72 hours of becoming aware; tell affected individuals when the risk is high; keep an internal breach register.'],
  ['eu-gdpr-transfer', 'EU', A, 'transfer', 'law', 'GDPR international transfers (Chapter V)', 'Transfers of personal data outside the EEA need an adequacy decision or safeguards such as Standard Contractual Clauses plus a transfer impact assessment. Running Vector fully on-premises avoids most transfers.'],
  ['eu-ai-act', 'EU', A, 'ai', 'law', 'EU AI Act, Regulation (EU) 2024/1689', 'Risk-based rules: prohibited practices, AI literacy, transparency duties, general-purpose model obligations and, for high-risk systems, risk management, data governance, logging, human oversight and documentation. Obligations apply in phases and application dates have been subject to proposed changes.', true],
  ['eu-nis2', 'EU', ['logistics', 'energy', 'healthcare', 'pharma', 'banking', 'telecom', 'government_defense', 'manufacturing', 'technology'], 'security', 'law', 'NIS2 Directive (EU) 2022/2555', 'Cybersecurity risk management and supply-chain security for essential and important entities in listed sectors, with management accountability. Transposed into national law, so check the member-state version.'],
  ['eu-nis2-incident', 'EU', ['logistics', 'energy', 'healthcare', 'pharma', 'banking', 'telecom', 'government_defense', 'manufacturing', 'technology'], 'breach', 'law', 'NIS2 incident reporting', 'Early warning within 24 hours of becoming aware of a significant incident, an incident notification within 72 hours and a final report within one month.'],
  ['eu-dora', 'EU', FIN, 'security', 'law', 'DORA, Regulation (EU) 2022/2554', 'Digital operational resilience for financial entities: ICT risk management, incident reporting, resilience testing and a register of ICT third-party providers. Applies since 17 January 2025.'],
  ['eu-data-act', 'EU', ['manufacturing', 'technology', 'logistics', 'energy', 'telecom'], 'sector', 'law', 'EU Data Act, Regulation (EU) 2023/2854', 'Access and sharing rules for data generated by connected products and related services, plus cloud switching and international access safeguards. Applies from 12 September 2025.'],
  ['eu-aml', 'EU', ['banking', 'insurance', 'legal'], 'records', 'law', 'EU AML rules (AMLD and Regulation (EU) 2024/1624)', 'Customer due diligence and record retention, generally five years after the end of the relationship, for obliged entities including some legal professionals.'],
  ['eu-psd2', 'EU', ['banking', 'retail', 'technology'], 'security', 'law', 'PSD2, Directive (EU) 2015/2366', 'Strong customer authentication, secure communication, incident reporting and security measures for payment services.'],
  ['eu-solvency2', 'EU', ['insurance'], 'sector', 'law', 'Solvency II, Directive 2009/138/EC', 'Governance and data-quality expectations for risk models and reporting data.'],
  ['eu-eprivacy', 'EU', ['retail', 'technology', 'telecom', 'other'], 'privacy', 'law', 'ePrivacy Directive 2002/58/EC', 'Consent for cookies and similar tracking, confidentiality of communications and electronic marketing rules, implemented nationally.'],
  ['eu-ehds', 'EU', HEALTH, 'sector', 'law', 'European Health Data Space, Regulation (EU) 2025/327', 'Rights over electronic health data, interoperability of health records and rules for secondary use. Applies in stages over several years.', true],
  ['eu-annex11', 'EU', ['pharma'], 'records', 'regulation', 'EudraLex Vol. 4 Annex 11, Computerised systems', 'Validation, audit trails, access control, data backup and electronic signatures for GMP computerised systems.'],
  ['eu-mdr', 'EU', HEALTH, 'sector', 'law', 'Medical Device Regulation (EU) 2017/745', 'Post-market surveillance data, vigilance reporting, UDI and technical documentation for devices, including software as a medical device.'],
  ['eu-ucc', 'EU', TRADE, 'records', 'law', 'Union Customs Code, Regulation (EU) 952/2013', 'Customs records and documents must be kept and made available for audit, generally for at least three years. Member states can require longer.'],
  ['eu-tachograph', 'EU', ['logistics'], 'records', 'law', 'Tachograph and drivers\' hours, Regulations (EU) 165/2014 and (EC) 561/2006', 'Driver and vehicle unit data must be downloaded and kept, generally for at least one year, and personal driver data protected.'],

  // ---- EU member states (implementing and supplementary laws) ----
  ['de-bdsg', 'DE', A, 'privacy', 'law', 'Germany: Federal Data Protection Act (BDSG)', 'Supplements the GDPR: employee data, data protection officer thresholds, and other national specifics. Federal and state authorities supervise.'],
  ['fr-lil', 'FR', A, 'privacy', 'law', 'France: Loi Informatique et Libertes and CNIL guidance', 'National GDPR implementation with CNIL supervision, specific rules for health data hosting and employee monitoring.'],
  ['ie-dpa', 'IE', A, 'privacy', 'law', 'Ireland: Data Protection Act 2018', 'National GDPR implementation supervised by the Data Protection Commission.'],
  ['nl-uavg', 'NL', A, 'privacy', 'law', 'Netherlands: UAVG (GDPR Implementation Act)', 'National GDPR implementation supervised by the Autoriteit Persoonsgegevens.'],
  ['es-lopdgdd', 'ES', A, 'privacy', 'law', 'Spain: Organic Law 3/2018 (LOPDGDD)', 'National GDPR implementation including digital rights, supervised by the AEPD.'],
  ['it-codice', 'IT', A, 'privacy', 'law', 'Italy: Personal Data Protection Code (D.Lgs. 196/2003 as amended)', 'National GDPR implementation supervised by the Garante.'],

  // ---- United States, federal ----
  ['us-ftc', 'US', A, 'privacy', 'law', 'FTC Act Section 5', 'Prohibits unfair or deceptive practices, which the FTC applies to weak data security, broken privacy promises and misleading AI claims.'],
  ['us-sox', 'US', A, 'records', 'law', 'Sarbanes-Oxley Act (US-listed companies)', 'Internal controls over financial reporting and retention of audit records, which covers systems and data that feed financial statements.'],
  ['us-sec-cyber', 'US', A, 'breach', 'regulation', 'SEC cybersecurity disclosure rules (US-listed companies)', 'Disclose material cybersecurity incidents on Form 8-K within four business days of determining materiality, and describe risk management and governance annually.'],
  ['us-cisa-circia', 'US', ['logistics', 'energy', 'healthcare', 'banking', 'telecom', 'government_defense', 'manufacturing'], 'breach', 'law', 'CIRCIA (Cyber Incident Reporting for Critical Infrastructure Act)', 'Covered critical-infrastructure entities will report significant cyber incidents within 72 hours and ransom payments within 24 hours once final rules take effect.', true],
  ['us-hipaa', 'US', ['healthcare', 'insurance', 'pharma'], 'privacy', 'law', 'HIPAA Privacy and Security Rules (45 CFR Parts 160 and 164)', 'Safeguards for protected health information: minimum necessary use, risk analysis, access control, audit controls, encryption as addressable, business associate agreements.'],
  ['us-hipaa-breach', 'US', ['healthcare', 'insurance', 'pharma'], 'breach', 'law', 'HIPAA Breach Notification Rule', 'Notify affected individuals without unreasonable delay and within 60 days of discovery; notify HHS and, for large breaches, the media.'],
  ['us-42cfr2', 'US', ['healthcare'], 'privacy', 'law', '42 CFR Part 2, Substance use disorder records', 'Stricter consent and disclosure limits for records of federally assisted substance use disorder programs.'],
  ['us-cures', 'US', ['healthcare'], 'sector', 'regulation', '21st Century Cures Act information blocking rules (45 CFR Part 171)', 'Providers and health IT developers must not unreasonably interfere with access, exchange or use of electronic health information.'],
  ['us-fda-part11', 'US', ['pharma', 'healthcare'], 'records', 'regulation', 'FDA 21 CFR Part 11, Electronic records and signatures', 'Validation, secure time-stamped audit trails, access controls and signature manifestations for regulated electronic records.'],
  ['us-glba', 'US', FIN, 'privacy', 'law', 'Gramm-Leach-Bliley Act and FTC Safeguards Rule (16 CFR 314)', 'Written information security program, qualified individual, risk assessment, encryption, multi-factor authentication and notice to the FTC of qualifying breaches.'],
  ['us-bsa', 'US', ['banking'], 'records', 'law', 'Bank Secrecy Act recordkeeping (31 CFR Chapter X)', 'Customer identification and transaction records generally retained for five years.'],
  ['us-ffiec', 'US', ['banking'], 'security', 'guidance', 'FFIEC IT Examination Handbook', 'Examiner expectations for information security, operations, outsourcing and business continuity at banks.'],
  ['us-sr117', 'US', ['banking'], 'ai', 'guidance', 'SR 11-7, Model risk management guidance', 'Supervisory expectations for developing, validating and governing models, which examiners apply to AI and machine-learning models.'],
  ['us-ecoa', 'US', ['banking'], 'ai', 'law', 'ECOA / Regulation B, adverse action notices', 'Creditors must give specific reasons for adverse decisions, including decisions made with complex or AI models.'],
  ['us-naic', 'US', ['insurance'], 'security', 'regulation', 'NAIC Insurance Data Security Model Law and AI Model Bulletin', 'Model rules adopted by many states: information security program, vendor oversight, incident notice to regulators, and governance of AI used by insurers. Check each state\'s adoption.', true],
  ['us-nerc-cip', 'US', ['energy'], 'security', 'regulation', 'NERC CIP cybersecurity standards', 'Mandatory cybersecurity standards for the bulk electric system: asset identification, access control, incident reporting, recovery plans, supply-chain risk.'],
  ['us-fmcsa-eld', 'US', ['logistics'], 'records', 'regulation', 'FMCSA hours-of-service records (49 CFR Part 395)', 'Records of duty status and supporting documents must be retained by motor carriers for six months; ELD data must be kept secure and producible to inspectors.'],
  ['us-fmcsa-dq', 'US', ['logistics'], 'records', 'regulation', 'FMCSA driver qualification files (49 CFR 391.51)', 'Driver files, including medical certification and records of violations, retained for the duration of employment and three years after.'],
  ['us-hazmat', 'US', ['logistics', 'manufacturing', 'pharma'], 'records', 'regulation', 'Hazardous materials regulations (49 CFR Parts 171-180)', 'Shipping papers, emergency response information and training records, with shipper copies generally retained for two years.'],
  ['us-fsma-stf', 'US', ['logistics', 'retail'], 'records', 'regulation', 'FSMA Sanitary Transportation of Food (21 CFR Part 1 Subpart O)', 'Records of procedures, agreements and training kept for 12 months beyond the period they apply.'],
  ['us-customs', 'US', TRADE, 'records', 'law', 'Customs recordkeeping (19 U.S.C. 1508, 19 CFR Part 163)', 'Import-related records kept for five years from the date of entry and producible to CBP on request.'],
  ['us-ctpat', 'US', TRADE, 'sector', 'guidance', 'CBP C-TPAT (voluntary)', 'Supply-chain security criteria including IT security and documentation processing for members seeking expedited border treatment.'],
  ['us-osha-records', 'US', ['manufacturing', 'logistics', 'energy'], 'records', 'regulation', 'OSHA injury and illness recordkeeping (29 CFR Part 1904)', 'Employee injury records are personal data; keep for five years and protect privacy of case details.'],
  ['us-cmmc', 'US', ['government_defense', 'manufacturing', 'technology'], 'security', 'regulation', 'CMMC Program (32 CFR Part 170), DFARS 252.204-7012 and NIST SP 800-171', 'Defense contractors that handle Federal Contract Information or Controlled Unclassified Information must meet specified security requirements and, increasingly, certification levels.'],
  ['us-itar-ear', 'US', ['government_defense', 'manufacturing', 'technology', 'energy'], 'transfer', 'law', 'Export controls (ITAR 22 CFR 120-130, EAR 15 CFR 730-774)', 'Controlled technical data cannot be exported or shared with foreign persons without authorization. This affects where data and models are hosted and who can access them.'],
  ['us-fedramp', 'US', ['technology', 'government_defense'], 'security', 'regulation', 'FISMA and FedRAMP', 'Federal information systems and cloud services used by agencies must follow NIST-based authorization and continuous monitoring.'],
  ['us-coppa', 'US', ['education', 'retail', 'technology'], 'privacy', 'law', 'COPPA (16 CFR Part 312)', 'Verifiable parental consent and limits on collecting personal information from children under 13.'],
  ['us-ferpa', 'US', ['education'], 'privacy', 'law', 'FERPA (20 U.S.C. 1232g, 34 CFR Part 99)', 'Protects education records and limits disclosure without consent; vendors act as school officials under conditions.'],
  ['us-fcc-cpni', 'US', ['telecom'], 'privacy', 'regulation', 'FCC CPNI and data breach rules (47 CFR 64.2001 et seq.)', 'Protect customer proprietary network information, authenticate requests and report breaches to the FCC and law enforcement within the prescribed time.'],
  ['us-fcra', 'US', ['banking', 'retail', 'other'], 'privacy', 'law', 'Fair Credit Reporting Act', 'Rules for consumer reports and background checks: permissible purpose, adverse action notices, accuracy and disposal.'],
  ['us-state-breach', 'US', A, 'breach', 'law', 'State data breach notification laws (all 50 states)', 'Every state requires notice to affected residents after a breach of defined personal information, with differing deadlines, content and regulator-notice thresholds.'],
  ['us-state-privacy', 'US', A, 'privacy', 'law', 'Other state comprehensive privacy laws', 'Many states beyond those listed separately (for example CT, UT, OR, MT, IA, DE, NJ, TN, MN, MD, IN, KY, RI, NH, NE) have consumer privacy laws with access, deletion, opt-out and assessment duties. Thresholds and exemptions vary, so select the states you operate in and review each.', true],

  // ---- United States, state and local ----
  ['usca-ccpa', 'US-CA', A, 'privacy', 'law', 'California Consumer Privacy Act as amended by CPRA', 'Rights to know, delete, correct and opt out of sale or sharing, limits on sensitive data use, contracts with service providers. Regulations on risk assessments, cybersecurity audits and automated decision-making technology are being phased in.', true],
  ['usca-cmia', 'US-CA', ['healthcare', 'pharma', 'insurance', 'technology'], 'privacy', 'law', 'California Confidentiality of Medical Information Act', 'Restricts disclosure of medical information by providers, plans and some health technology businesses.'],
  ['usny-shield', 'US-NY', A, 'security', 'law', 'New York SHIELD Act', 'Reasonable administrative, technical and physical safeguards for private information of New York residents, and broadened breach notification.'],
  ['usny-dfs500', 'US-NY', FIN, 'security', 'regulation', 'NYDFS Cybersecurity Regulation (23 NYCRR 500)', 'Cybersecurity program, CISO, multi-factor authentication, 72-hour incident notice, 24-hour notice of ransom payments and annual certification for DFS-regulated entities.'],
  ['usnyc-ll144', 'US-NY-NYC', A, 'ai', 'law', 'New York City Local Law 144, Automated employment decision tools', 'If AI tools substantially assist hiring or promotion decisions in NYC, an annual independent bias audit, public summary and candidate notice are required.'],
  ['ustx-tdpsa', 'US-TX', A, 'privacy', 'law', 'Texas Data Privacy and Security Act', 'Consumer rights, data protection assessments and processor contracts. Applies to businesses over the statutory scope, not limited to large companies.'],
  ['ustx-traiga', 'US-TX', A, 'ai', 'law', 'Texas Responsible Artificial Intelligence Governance Act', 'Prohibited AI uses, disclosure duties for some deployers and enforcement by the Attorney General.', true],
  ['ustx-hb300', 'US-TX', HEALTH, 'privacy', 'law', 'Texas Medical Records Privacy Act (HB 300)', 'Broader definition of covered entity than HIPAA, with training and consent requirements.'],
  ['usva-cdpa', 'US-VA', A, 'privacy', 'law', 'Virginia Consumer Data Protection Act', 'Consumer rights, data protection assessments for high-risk processing and processor contracts.'],
  ['usco-cpa', 'US-CO', A, 'privacy', 'law', 'Colorado Privacy Act', 'Consumer rights, universal opt-out signals and data protection assessments.'],
  ['usco-ai', 'US-CO', A, 'ai', 'law', 'Colorado Artificial Intelligence Act (SB 24-205)', 'Duties for developers and deployers of high-risk AI to avoid algorithmic discrimination, with impact assessments. The effective date has been postponed and the law may be amended.', true],
  ['usil-bipa', 'US-IL', A, 'privacy', 'law', 'Illinois Biometric Information Privacy Act', 'Written policy, informed written consent and retention limits for biometric identifiers, with a private right of action.'],
  ['uswa-mhmda', 'US-WA', A, 'privacy', 'law', 'Washington My Health My Data Act', 'Consent and authorization rules for consumer health data, including data inferred outside HIPAA, with a private right of action.'],

  // ---- India ----
  ['in-dpdp', 'IN', A, 'privacy', 'law', 'Digital Personal Data Protection Act, 2023 and DPDP Rules, 2025', 'Notice and consent or defined legitimate uses, reasonable security safeguards, breach intimation to the Data Protection Board and affected individuals, children\'s data safeguards, and extra duties for significant data fiduciaries. Penalties up to INR 250 crore. Provisions commence in phases.', true],
  ['in-itact', 'IN', A, 'privacy', 'law', 'Information Technology Act, 2000 and SPDI Rules, 2011', 'Reasonable security practices for sensitive personal data and compensation for failure to protect it. Parts are expected to be replaced as the DPDP Act commences.', true],
  ['in-certin', 'IN', A, 'breach', 'regulation', 'CERT-In Directions of 28 April 2022', 'Report specified cyber incidents to CERT-In within six hours, keep ICT system logs for 180 days within India, synchronize clocks with NTP and designate a point of contact.'],
  ['in-nciipc', 'IN', ['energy', 'banking', 'telecom', 'healthcare', 'logistics', 'government_defense'], 'security', 'guidance', 'NCIIPC guidelines for Critical Information Infrastructure (IT Act Section 70A)', 'Protection requirements for entities designated as critical information infrastructure.'],
  ['in-gst-records', 'IN', A, 'records', 'law', 'CGST Act, 2017 Section 36: record retention', 'Books of account and related records kept for 72 months from the due date of the annual return, in electronic form where maintained electronically.'],
  ['in-eway', 'IN', ['logistics', 'retail', 'manufacturing'], 'sector', 'regulation', 'E-way bill requirements (CGST Rules, Rule 138)', 'Movement of goods above the prescribed value needs an e-way bill generated on the common portal and carried or electronically available during transit.'],
  ['in-customs', 'IN', TRADE, 'records', 'law', 'Customs Act, 1962 and Customs Brokers Licensing Regulations, 2018', 'Import and export documentation, electronic filings through ICEGATE and record retention for importers, exporters and customs brokers.'],
  ['in-carriage', 'IN', ['logistics'], 'sector', 'law', 'Carriage by Road Act, 2007', 'Common carriers issue consignment notes and are liable for goods in transit; consignment records support claims and audits.'],
  ['in-mvact', 'IN', ['logistics'], 'sector', 'law', 'Motor Vehicles Act, 1988, Central Motor Vehicles Rules and AIS-140', 'Vehicle registration, driver licensing, permits and fitness records; vehicle location tracking devices are mandated for some public service vehicle categories under AIS-140.'],
  ['in-rbi-itgov', 'IN', ['banking'], 'security', 'regulation', 'RBI Master Direction on IT Governance, Risk, Controls and Assurance (2023)', 'Board-level IT governance, risk management, information security, business continuity and audit for regulated entities.'],
  ['in-rbi-outsourcing', 'IN', ['banking'], 'sector', 'regulation', 'RBI Master Direction on Outsourcing of IT Services (2023)', 'Due diligence, contractual safeguards, audit access and concentration-risk management for outsourced IT, including cloud and AI vendors.'],
  ['in-rbi-localization', 'IN', ['banking', 'retail', 'technology'], 'transfer', 'regulation', 'RBI storage of payment system data (2018 circular)', 'End-to-end payment transaction data must be stored only in systems located in India, with limited exceptions for the foreign leg of a transaction.'],
  ['in-rbi-kyc', 'IN', ['banking'], 'records', 'regulation', 'RBI Master Direction on KYC (2016, as amended)', 'Customer identification, ongoing due diligence and retention of records for at least five years after the relationship or transaction ends.'],
  ['in-sebi-cscrf', 'IN', ['banking'], 'security', 'regulation', 'SEBI Cybersecurity and Cyber Resilience Framework (CSCRF, 2024)', 'Cybersecurity governance, identification, protection, detection, response and recovery requirements for SEBI-regulated entities.'],
  ['in-irdai', 'IN', ['insurance'], 'security', 'regulation', 'IRDAI Information and Cyber Security Guidelines (2023)', 'Governance, controls, incident reporting and audit expectations for insurers and intermediaries.'],
  ['in-abdm', 'IN', ['healthcare'], 'privacy', 'guidance', 'ABDM Health Data Management Policy', 'Consent-based collection and sharing of health data in the Ayushman Bharat Digital Mission ecosystem.'],
  ['in-ndct', 'IN', ['pharma'], 'records', 'regulation', 'Drugs and Cosmetics Act, 1940 and New Drugs and Clinical Trials Rules, 2019', 'Clinical trial data, manufacturing records and regulatory submissions governed by CDSCO.'],
  ['in-cea', 'IN', ['energy'], 'security', 'guidance', 'CEA Guidelines on Cyber Security in Power Sector (2021)', 'Cybersecurity expectations for power sector entities, including incident reporting and ICT supply-chain controls.'],
  ['in-dot', 'IN', ['telecom'], 'records', 'regulation', 'Telecommunications Act, 2023 and DoT licence conditions', 'Licensed operators must meet security, lawful-interception and records requirements, including call and internet data retention periods set in licence terms.', true],
  ['in-meity-cloud', 'IN', ['government_defense'], 'transfer', 'guidance', 'MeitY cloud empanelment and government data guidance', 'Government departments are generally expected to use empanelled cloud services with data hosted in India.'],
  ['in-advocates', 'IN', ['legal'], 'privacy', 'law', 'Advocates Act, 1961 and Bar Council of India Rules', 'Professional duties of client confidentiality that govern how client documents are stored and processed.'],
  ['in-clinical-est', 'IN', ['healthcare'], 'sector', 'law', 'Clinical Establishments (Registration and Regulation) Act, 2010', 'Registration of clinical establishments, minimum standards, display of rates for procedures and services, and maintenance of electronic medical records as prescribed. Applies in states that have adopted it; other states regulate hospitals under their own laws.', true],
  ['in-medical-records', 'IN', ['healthcare'], 'records', 'regulation', 'Medical Council professional conduct regulations: medical records', 'Registered medical practitioners maintain medical records of indoor patients for at least three years and provide copies to patients on request within the prescribed time. National Medical Commission regulations are being updated.', true],
  ['in-pcpndt', 'IN', ['healthcare'], 'records', 'law', 'PC-PNDT Act, 1994 and Rules', 'Registration of ultrasound and imaging facilities, prescribed forms for every procedure, and preservation of records for at least two years; prohibition of sex determination.'],
  ['in-bmw', 'IN', ['healthcare'], 'sector', 'regulation', 'Bio-Medical Waste Management Rules, 2016', 'Authorization from the State Pollution Control Board, segregation and tracking of bio-medical waste, annual reports and records maintained for five years.'],
  ['inmh-nursing-homes', 'IN-MH', ['healthcare'], 'sector', 'law', 'Maharashtra Nursing Homes Registration Act and Rules (as amended)', 'Registration of hospitals and nursing homes in Maharashtra, required staffing and records, display of the patients\' rights charter and schedule of charges, and grievance redressal.', true],
  ['inmh-shops', 'IN-MH', A, 'records', 'law', 'Maharashtra Shops and Establishments Act, 2017', 'Registration and prescribed registers of employees, wages and working hours that employers must maintain and produce to inspectors.'],
  ['inka-shops', 'IN-KA', A, 'records', 'law', 'Karnataka Shops and Commercial Establishments Act, 1961', 'Registration and employee registers maintained and produced to inspectors.'],
  ['indl-shops', 'IN-DL', A, 'records', 'law', 'Delhi Shops and Establishments Act, 1954', 'Registration and employee registers maintained and produced to inspectors.'],
  ['intn-shops', 'IN-TN', A, 'records', 'law', 'Tamil Nadu Shops and Establishments Act, 1947', 'Registration and employee registers maintained and produced to inspectors.'],

  // ---- United Kingdom ----
  ['gb-gdpr', 'GB', A, 'privacy', 'law', 'UK GDPR and Data Protection Act 2018 (as amended by the Data (Use and Access) Act 2025)', 'UK data protection regime supervised by the ICO: lawful basis, rights, accountability, 72-hour breach reporting, international transfer rules.'],
  ['gb-pecr', 'GB', ['retail', 'technology', 'telecom', 'other'], 'privacy', 'law', 'Privacy and Electronic Communications Regulations 2003', 'Cookie consent and electronic marketing rules.'],
  ['gb-nis', 'GB', CNI, 'security', 'law', 'Network and Information Systems Regulations 2018', 'Security and incident reporting duties for operators of essential services and relevant digital service providers. Reform is under consideration.', true],
  ['gb-fca', 'GB', FIN, 'security', 'regulation', 'FCA and PRA operational resilience rules (SYSC 15A, SS1/21)', 'Identify important business services, set impact tolerances, map dependencies including data and technology, and test.'],
  ['gb-pra-mrm', 'GB', ['banking'], 'ai', 'regulation', 'PRA SS1/23, Model risk management principles', 'Governance, validation and monitoring principles for models, including AI, at UK banks.'],
  ['gb-nhs', 'GB', ['healthcare', 'pharma'], 'privacy', 'guidance', 'NHS Data Security and Protection Toolkit and Caldicott Principles', 'Self-assessment standard and confidentiality principles for organizations handling NHS patient data.'],
  ['gb-customs', 'GB', TRADE, 'records', 'law', 'HMRC customs record-keeping', 'Import and export records and supporting documents must be kept for the period HMRC specifies (generally several years) and be available for inspection.', true],
  ['gb-defstan', 'GB', ['government_defense', 'manufacturing'], 'security', 'regulation', 'Defence Standard 05-138 and Cyber Security Model', 'Cyber risk profile and controls required of suppliers to the Ministry of Defence.'],
  ['gb-ai', 'GB', A, 'ai', 'guidance', 'UK AI regulatory principles (sector regulators)', 'No single AI statute. Regulators apply principles on safety, transparency, fairness, accountability and contestability within existing law.'],

  // ---- Middle East ----
  ['ae-pdpl', 'AE', A, 'privacy', 'law', 'UAE Federal Decree-Law No. 45 of 2021, Personal Data Protection', 'Consent and lawful processing, data subject rights, breach notification and transfer limits. Implementing regulations were still awaited when this pack was compiled.', true],
  ['ae-health', 'AE', ['healthcare', 'pharma'], 'transfer', 'law', 'UAE Federal Law No. 2 of 2019, ICT in health fields', 'Health data generally must be stored and processed inside the UAE unless an exception applies.'],
  ['aedifc-dp', 'AE-DIFC', A, 'privacy', 'law', 'DIFC Data Protection Law No. 5 of 2020', 'GDPR-style regime for entities in the DIFC, including AI-specific provisions in its regulations.'],
  ['aeadgm-dp', 'AE-ADGM', A, 'privacy', 'law', 'ADGM Data Protection Regulations 2021', 'GDPR-style regime for entities in the ADGM, supervised by the Office of Data Protection.'],
  ['sa-pdpl', 'SA', A, 'privacy', 'law', 'Saudi Personal Data Protection Law (Royal Decree M/19)', 'Consent, data subject rights, breach notification and controls on transfers outside the Kingdom, supervised by SDAIA.'],
  ['sa-nca', 'SA', CNI.concat(['technology']), 'security', 'regulation', 'NCA Essential Cybersecurity Controls (ECC)', 'Baseline cybersecurity controls for government bodies and critical national infrastructure operators.'],
  ['sa-sama', 'SA', FIN, 'security', 'regulation', 'SAMA Cyber Security Framework', 'Governance, operations and third-party controls for SAMA-regulated financial institutions.'],

  // ---- Asia-Pacific ----
  ['sg-pdpa', 'SG', A, 'privacy', 'law', 'Singapore Personal Data Protection Act 2012', 'Consent, purpose limitation, access and correction, data protection officer, and notification of notifiable breaches within three calendar days of assessment.'],
  ['sg-mas', 'SG', FIN, 'security', 'guidance', 'MAS Technology Risk Management Guidelines', 'Governance, resilience, access control, cryptography and third-party risk expectations for financial institutions.'],
  ['sg-csa', 'SG', ['energy', 'banking', 'healthcare', 'logistics', 'telecom', 'government_defense'], 'security', 'law', 'Singapore Cybersecurity Act 2018', 'Duties for owners of designated critical information infrastructure: codes of practice, audits and incident reporting.'],
  ['sg-ai', 'SG', A, 'ai', 'guidance', 'Singapore Model AI Governance Framework', 'Voluntary guidance on internal governance, human involvement, operations management and stakeholder communication for AI.'],
  ['au-privacy', 'AU', A, 'privacy', 'law', 'Australian Privacy Act 1988 and Notifiable Data Breaches scheme', 'Australian Privacy Principles, cross-border disclosure accountability and notice to the OAIC and individuals for eligible breaches, with assessment within 30 days.'],
  ['au-soci', 'AU', CNI.concat(['retail']), 'security', 'law', 'Security of Critical Infrastructure Act 2018', 'Risk management programs, incident reporting and register obligations for critical infrastructure assets in listed sectors.'],
  ['au-cps234', 'AU', FIN, 'security', 'regulation', 'APRA CPS 234 Information Security and CPS 230 Operational Risk Management', 'Information security capability proportionate to threats, third-party oversight, and operational resilience including critical operations and service providers.'],
  ['au-myhr', 'AU', ['healthcare'], 'privacy', 'law', 'My Health Records Act 2012', 'Strict rules on collection, use and disclosure of My Health Record data.'],
  ['au-ai', 'AU', A, 'ai', 'guidance', 'Australian Voluntary AI Safety Standard', 'Voluntary guardrails for AI governance, testing, transparency and human oversight.'],
  ['jp-appi', 'JP', A, 'privacy', 'law', 'Act on the Protection of Personal Information (APPI)', 'Purpose specification, security control, third-party and cross-border provision rules and breach reporting to the PPC.'],
  ['kr-pipa', 'KR', A, 'privacy', 'law', 'Personal Information Protection Act (PIPA)', 'Strict consent rules, security measures, breach notification and cross-border transfer requirements, supervised by the PIPC.'],
  ['kr-aibasic', 'KR', A, 'ai', 'law', 'Framework Act on AI Development and Trust (AI Basic Act)', 'Transparency and safety duties for high-impact and generative AI, with local-representative rules for foreign providers.', true],
  ['cn-pipl', 'CN', A, 'transfer', 'law', 'PIPL, Data Security Law and Cybersecurity Law', 'Consent and separate consent rules, data classification, localization for critical information infrastructure operators, and security assessment, standard contract or certification for exporting personal data.'],
  ['cn-genai', 'CN', ['technology', 'other'], 'ai', 'regulation', 'Interim Measures for Generative AI Services and algorithm rules', 'Filing, content and training-data requirements for public-facing generative AI services in China.'],

  // ---- Americas, Africa, Europe (non-EU) ----
  ['ca-pipeda', 'CA', A, 'privacy', 'law', 'PIPEDA', 'Ten fair information principles, breach of security safeguards reporting where there is a real risk of significant harm, and breach records kept for 24 months.'],
  ['caqc-law25', 'CA-QC', A, 'privacy', 'law', 'Quebec Private Sector Privacy Act (Law 25)', 'Privacy officer, privacy impact assessments for projects and transfers outside Quebec, transparency on automated decisions, breach reporting.'],
  ['caon-phipa', 'CA-ON', ['healthcare', 'pharma'], 'privacy', 'law', 'Ontario Personal Health Information Protection Act (PHIPA)', 'Rules for health information custodians, consent, breach notification and safeguards.'],
  ['ca-osfi', 'CA', FIN, 'security', 'guidance', 'OSFI Guideline B-13, Technology and cyber risk management', 'Technology governance, operations, resilience and cyber security expectations for federally regulated financial institutions.'],
  ['br-lgpd', 'BR', A, 'privacy', 'law', 'Brazil LGPD (Law 13,709/2018)', 'Legal bases, data subject rights, encarregado (DPO), breach notification to the ANPD and data subjects, and international transfer mechanisms.'],
  ['br-bcb', 'BR', ['banking'], 'security', 'regulation', 'BCB/CMN Resolution 4,893/2021, Cybersecurity policy', 'Cybersecurity policy, incident handling and cloud outsourcing rules for regulated financial institutions.'],
  ['za-popia', 'ZA', A, 'privacy', 'law', 'South Africa POPIA (Act 4 of 2013)', 'Eight processing conditions, information officer registration, breach notification to the Information Regulator and data subjects, and limits on cross-border transfers.'],
  ['ch-fadp', 'CH', A, 'privacy', 'law', 'Swiss Federal Act on Data Protection (revised, in force 2023)', 'Transparency, records of processing, privacy impact assessments, breach notification and cross-border disclosure rules.'],
  ['ch-finma', 'CH', FIN, 'security', 'regulation', 'FINMA Circular 2023/1, Operational risks and resilience', 'ICT risk management, critical data, cyber risk and business continuity for Swiss financial institutions.'],
];

const OBLIGATIONS = ROWS.map(([id, j, ind, cat, type, title, summary, verify]) => ({
  id, jurisdiction: j, industries: ind, category: cat, type, title, summary, verify: !!verify,
}));

const jmap = new Map(JURISDICTIONS.map((j) => [j.code, j]));
const catalogIds = new Set(OBLIGATIONS.map((o) => o.id));
if (catalogIds.size !== OBLIGATIONS.length) throw new Error('duplicate obligation id in compliance catalog');
for (const o of OBLIGATIONS) if (!jmap.has(o.jurisdiction)) throw new Error('unknown jurisdiction in catalog: ' + o.jurisdiction);

module.exports = { PACK, INDUSTRIES, LEVELS, JURISDICTIONS, CATEGORIES, OBLIGATIONS, jmap };
