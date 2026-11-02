'use strict';
// Penalty references for the exposure model. Figures are statutory maximums or published
// inflation-adjusted amounts as checked on 2026-10-31; they change, so each carries its source and
// a verify note. "defaultExposureUSD" is an ILLUSTRATIVE starting estimate of one enforcement
// outcome for a mid-size organization, meant to be replaced with the organization's own figure.
// Non-USD amounts are converted at fixed reference rates (EUR 1.08, INR 0.012, GBP 1.27) for display only.
const R = {
  'us-hipaa': { text: 'Civil penalties $145 to $73,011 per violation; up to $2,190,294 per calendar year for identical violations (2026 inflation adjustment). HHS 2019 enforcement discretion uses lower annual caps for lower tiers.', source: 'HHS, 45 CFR 102.3 (adjusted Jan 2026)', defaultExposureUSD: 1500000 },
  'us-hipaa-breach': { text: 'Same HIPAA civil penalty tiers; up to $2,190,294 per calendar year for identical violations.', source: 'HHS, 45 CFR 102.3 (adjusted Jan 2026)', defaultExposureUSD: 750000 },
  'us-42cfr2': { text: 'Since the 2024 final rule, Part 2 violations carry the HIPAA civil and criminal penalty structure.', source: '42 CFR Part 2 (2024 rule)', defaultExposureUSD: 500000 },
  'us-cures': { text: 'Health IT developers and HIEs/HINs: up to $1,000,000 per information-blocking violation. Providers: CMS disincentives rather than fines.', source: '42 USC 300jj-52; OIG final rule (2023)', defaultExposureUSD: 250000 },
  'usca-ccpa': { text: 'Up to $2,663 per violation, $7,988 if intentional or involving minors under 16 (amounts effective 1 Jan 2025).', source: 'CPPA CPI adjustment, Civ. Code 1798.155 and 1798.199.90', defaultExposureUSD: 400000 },
  'usca-cmia': { text: 'Up to $2,500 per negligent disclosure; up to $25,000 per knowing and willful violation; up to $250,000 when for financial gain.', source: 'Cal. Civ. Code 56.36', defaultExposureUSD: 250000 },
  'uswa-mhmda': { text: 'Enforced under the Washington Consumer Protection Act: Attorney General civil penalties up to $7,500 per violation, plus a private right of action.', source: 'RCW 19.373, RCW 19.86', defaultExposureUSD: 500000 },
  'usil-bipa': { text: 'Liquidated damages of $1,000 per negligent violation and $5,000 per intentional or reckless violation, through private lawsuits.', source: '740 ILCS 14/20', defaultExposureUSD: 2000000 },
  'usny-shield': { text: 'Attorney General civil penalties up to $5,000 per violation for failing to maintain reasonable safeguards; notification failures up to $20 per failed notice, capped at $250,000.', source: 'NY GBL 899-aa, 899-bb', defaultExposureUSD: 250000 },
  'us-coppa': { text: 'Civil penalties up to $53,088 per violation (amount for penalties assessed after 17 Jan 2025).', source: 'FTC, 16 CFR 1.98', defaultExposureUSD: 500000 },
  'us-ftc': { text: 'Rule and order violations: civil penalties up to $53,088 per violation (2025 amount). Section 5 cases otherwise lead to consent orders with long-term obligations.', source: 'FTC, 16 CFR 1.98', defaultExposureUSD: 300000 },
  'us-ferpa': { text: 'No fines. The Department of Education can withhold federal funding from a non-compliant institution after voluntary compliance fails.', source: '20 USC 1232g(f); 34 CFR 99.67', defaultExposureUSD: 1000000 },
  'us-state-breach': { text: 'Varies by state, typically per-violation or per-resident penalties enforced by state attorneys general.', source: 'State statutes', defaultExposureUSD: 150000 },
  'eu-gdpr': { text: 'Up to EUR 20 million or 4% of worldwide annual turnover, whichever is higher.', source: 'GDPR Art. 83(5)', defaultExposureUSD: 1080000 },
  'eu-gdpr-breach': { text: 'Up to EUR 10 million or 2% of worldwide annual turnover, whichever is higher.', source: 'GDPR Art. 83(4)', defaultExposureUSD: 540000 },
  'eu-gdpr-transfer': { text: 'Up to EUR 20 million or 4% of worldwide annual turnover, whichever is higher.', source: 'GDPR Art. 83(5)(c)', defaultExposureUSD: 1080000 },
  'in-certin': { text: 'Failure to provide information or comply with CERT-In directions: imprisonment up to one year, or a fine up to INR 1 lakh, or both (IT Act Section 70B(7)).', source: 'IT Act, 2000, Section 70B(7)', defaultExposureUSD: 50000, currency: 'INR' },
  'in-itact': { text: 'Compensation to affected persons for negligence in protecting sensitive personal data (Section 43A); being replaced by the DPDP Act as it commences.', source: 'IT Act, 2000, Section 43A', defaultExposureUSD: 120000, currency: 'INR' },
  'in-clinical-est': { text: 'Penalties for running an unregistered establishment or breaching its conditions, rising for repeat contraventions; amounts set by the Act and state rules.', source: 'Clinical Establishments Act, 2010, Chapter V', defaultExposureUSD: 30000, currency: 'INR' },
  'in-pcpndt': { text: 'Imprisonment and fines for contraventions, plus suspension of registration and of the practitioner\'s licence.', source: 'PC-PNDT Act, 1994, Sections 23 and 25', defaultExposureUSD: 60000, currency: 'INR' },
  'ustx-hb300': { text: 'Civil penalties up to $5,000 per negligent violation, $25,000 per knowing or intentional violation and $250,000 when for financial gain; up to $1.5 million a year for a pattern of violations.', source: 'Tex. Health & Safety Code 181.201', defaultExposureUSD: 250000 },
  'ustx-tdpsa': { text: 'Attorney General civil penalties up to $7,500 per violation after a 30-day cure period.', source: 'Tex. Bus. & Com. Code 541.155', defaultExposureUSD: 200000 },
  'ustx-traiga': { text: 'Attorney General civil penalties of $10,000 to $12,000 per curable violation, $80,000 to $200,000 per uncurable violation, and $2,000 to $40,000 per day for continuing violations (effective 1 Jan 2026).', source: 'Texas HB 149 (TRAIGA), 2025', defaultExposureUSD: 150000 },
  'eu-nis2': { text: 'Essential entities: up to EUR 10 million or 2% of worldwide turnover; important entities: up to EUR 7 million or 1.4%.', source: 'NIS2 Art. 34', defaultExposureUSD: 540000 },
  'eu-ai-act': { text: 'Up to EUR 35 million or 7% of turnover for prohibited practices; up to EUR 15 million or 3% for other obligations.', source: 'EU AI Act Art. 99', defaultExposureUSD: 810000 },
  'in-dpdp': { text: 'Up to INR 250 crore for failure to take reasonable security safeguards; other breaches up to INR 50 to 200 crore.', source: 'DPDP Act 2023, Schedule', defaultExposureUSD: 600000, currency: 'INR' },
};
const VERIFY = 'Figures change (inflation adjustments, new rules). Confirm with counsel before relying on them.';

// Likelihood that an unaddressed obligation leads to an enforcement outcome within a year, by status.
// A deliberately simple, editable assumption, not an actuarial model.
const LIKELIHOOD = { not_started: 0.25, needs_review: 0.15, in_progress: 0.1, implemented: 0.03, implemented_evidenced: 0.01, not_applicable: 0 };

function referenceFor(id) { return R[id] ? { ...R[id], verify: VERIFY } : null; }
module.exports = { referenceFor, LIKELIHOOD, VERIFY };
