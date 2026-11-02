'use strict';
const D = require('./compliance-data');
const { HttpError } = require('./util');

const LEVEL_ORDER = ['international', 'regional', 'national', 'state', 'local'];
const STATUSES = ['not_started', 'in_progress', 'implemented', 'needs_review', 'not_applicable'];

function validateProfile({ industry, jurisdictions }) {
  if (!D.INDUSTRIES.some((i) => i.id === industry)) throw new HttpError(400, 'Unknown industry');
  if (!Array.isArray(jurisdictions) || jurisdictions.length > 60) throw new HttpError(400, 'jurisdictions must be a list');
  const clean = [...new Set(jurisdictions)];
  for (const c of clean) if (!D.jmap.has(c)) throw new HttpError(400, `Unknown jurisdiction: ${String(c).slice(0, 20)}`);
  return { industry, jurisdictions: clean.filter((c) => c !== 'INTL') };
}

/** Selected jurisdictions plus every ancestor (a Californian company is also subject to US federal rules). */
function scope(jurisdictions) {
  const set = new Set(['INTL']);
  for (const code of jurisdictions || []) {
    let cur = D.jmap.get(code);
    while (cur) { set.add(cur.code); cur = cur.parent ? D.jmap.get(cur.parent) : null; }
  }
  return set;
}

const cmp = (a, b) =>
  LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) ||
  a.jurisdictionName.localeCompare(b.jurisdictionName) ||
  a.category.localeCompare(b.category) || a.title.localeCompare(b.title);

function applicable(profile, customs = []) {
  const set = scope(profile.jurisdictions);
  const industry = profile.industry || 'other';
  const rows = D.OBLIGATIONS
    .filter((o) => set.has(o.jurisdiction) && (o.industries === '*' || o.industries.includes(industry)))
    .map((o) => {
      const j = D.jmap.get(o.jurisdiction);
      return { ...o, level: j.level, jurisdictionName: j.name, source: 'catalog' };
    });
  const cust = customs.map((c) => ({
    id: c.id, jurisdiction: 'CUSTOM', jurisdictionName: c.jurisdiction || 'Custom', level: c.level, industries: '*', category: c.category,
    type: 'custom', title: c.title, summary: c.summary, verify: false, source: 'custom',
  }));
  return rows.concat(cust).sort(cmp);
}

/** Tell the user where the starter pack is thin so nobody mistakes silence for "nothing applies". */
function coverageNotes(profile) {
  const notes = [];
  const industry = profile.industry || 'other';
  for (const code of profile.jurisdictions || []) {
    const j = D.jmap.get(code);
    if (!j || j.level === 'international') continue;
    const own = D.OBLIGATIONS.filter((o) => o.jurisdiction === code && (o.industries === '*' || o.industries.includes(industry))).length;
    if (own === 0) {
      notes.push({ jurisdiction: code, name: j.name, level: j.level, message: `The starter pack has no ${j.level === 'state' ? 'state-level' : j.level === 'local' ? 'local' : 'country-specific'} entries for ${j.name} in this industry. Inherited rules from the parent jurisdiction still apply; add anything specific as a custom obligation.` });
    }
  }
  return notes;
}

function summarize(items) {
  const by = (key) => items.reduce((a, i) => { a[i[key]] = (a[i[key]] || 0) + 1; return a; }, {});
  const counted = items.filter((i) => i.status !== 'not_applicable');
  const done = counted.filter((i) => i.status === 'implemented').length;
  const mandatory = (i) => i.type === 'law' || i.type === 'regulation' || i.type === 'custom';
  return {
    total: items.length,
    byStatus: by('status'),
    byLevel: by('level'),
    byCategory: by('category'),
    implemented: done,
    coveragePct: counted.length ? Math.round((done / counted.length) * 100) : 0,
    gaps: items.filter((i) => mandatory(i) && (i.status === 'not_started' || i.status === 'needs_review')).length,
    needsEvidence: items.filter((i) => i.status === 'implemented' && !i.evidenceCount).length,
    verifyFlagged: items.filter((i) => i.verify).length,
  };
}

module.exports = { validateProfile, applicable, coverageNotes, summarize, scope, STATUSES, LEVEL_ORDER };
