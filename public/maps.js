// World and US-state choropleths for the compliance map. Geometry: Natural Earth via world-atlas
// and us-atlas (public domain), pre-projected by scripts/build-geo.js and served locally.
import { esc } from './ui.js';
import { tip } from './charts.js';

const cache = {};
async function load(name) { if (!cache[name]) cache[name] = fetch('/app/geo/' + name + '.json').then((r) => r.json()); return cache[name]; }

// Readiness: diverging orange (low) -> neutral -> blue (high). Money and counts: one-hue ramps.
export function readinessColor(v) {
  if (v == null) return 'var(--s3)';
  const t = Math.max(0, Math.min(100, v));
  return t < 50 ? `color-mix(in srgb, var(--c2) ${Math.round(((50 - t) / 50) * 85 + 15)}%, var(--s3))` : `color-mix(in srgb, var(--c1) ${Math.round(((t - 50) / 50) * 85 + 15)}%, var(--s3))`;
}
export function rampColor(v, max, hue = 'var(--c2)') { if (!v) return 'color-mix(in srgb, ' + hue + ' 8%, var(--s3))'; const t = Math.min(1, v / (max || 1)); return `color-mix(in srgb, ${hue} ${Math.round(18 + t * 82)}%, var(--s3))`; }
export function legend(metric, max, fmt) {
  if (metric === 'readiness') return `<span>Low readiness</span><span class="ramp">${[10, 25, 40, 55, 70, 85, 100].map((v) => `<i style="background:${readinessColor(v)}"></i>`).join('')}</span><span>High</span><span class="faint" style="margin-left:10px"><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--s3);vertical-align:-1px"></i> not in scope</span>`;
  const hue = metric === 'open' ? 'var(--c1)' : 'var(--c2)';
  return `<span>0</span><span class="ramp">${[0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 1].map((t) => `<i style="background:${rampColor(t * (max || 1), max || 1, hue)}"></i>`).join('')}</span><span>${esc(fmt(max || 0))}</span>`;
}

/** values: {CODE: {fill, tip}} ; returns svg markup */
export async function worldSvg(values, { selected } = {}) {
  const g = await load('world');
  return `<svg viewBox="0 0 ${g.w} ${g.h}" role="img" aria-label="World map of compliance by country">${g.countries.map((c) => { const v = values[c.id]; return `<path class="cty ${v ? 'on' : ''} ${selected === c.id ? 'sel' : ''}" d="${c.d}" ${v ? `style="fill:${v.fill}" data-code="${esc(c.id)}" data-tip="${esc(v.tip)}"` : `data-tip="${esc(tip(c.name, [['Not in scope', '']]))}"`}/>`; }).join('')}</svg>`;
}
export async function usSvg(values, { selected } = {}) {
  const g = await load('us-states');
  return `<svg viewBox="0 0 ${g.w} ${g.h}" role="img" aria-label="Map of US states">${g.states.map((s) => { const v = values[s.id]; return `<path class="cty ${v ? 'on' : ''} ${selected === s.id ? 'sel' : ''}" d="${s.d}" ${v ? `style="fill:${v.fill}" data-code="${esc(s.id)}" data-tip="${esc(v.tip)}"` : `data-tip="${esc(tip(s.name, [['No state-level rules selected', '']]))}"`}/>`; }).join('')}</svg>`;
}
