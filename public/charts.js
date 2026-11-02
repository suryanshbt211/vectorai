// Small SVG chart kit. Colors come from CSS tokens (--c1..--c8, validated categorical palette),
// so light and dark themes each get their own steps. Every mark has a hover tooltip.
import { esc } from './ui.js';

export const C = (i) => `var(--c${(i % 8) + 1})`;
let uid = 0;
const nid = () => 'v' + (++uid);
export const tip = (title, rows = []) => `<b>${esc(title)}</b>${rows.map(([k, v, c]) => `<div class="r"><span>${c ? `<i class="sw" style="background:${c}"></i>` : ''}${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}`;
const attr = (s) => esc(s);

function nice(max) {
  if (!max || max <= 0) return { max: 1, step: 0.25 };
  const raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  return { max: step * 4, step };
}
export const fmtN = (v) => (v == null ? '-' : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e4 ? Math.round(v / 1e3) + 'k' : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1) + 'k' : String(Math.round(v * 10) / 10));
export const fmtMs = (v) => (v == null ? '-' : v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + ' s' : Math.round(v) + ' ms');

function frame(W, H, P, ymax, step, yfmt) {
  let g = '<g class="grid">';
  for (let v = 0; v <= ymax + 1e-9; v += step) {
    const y = P.t + (H - P.t - P.b) * (1 - v / ymax);
    g += `<line x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}"/><text class="ax" x="${P.l - 6}" y="${y + 3.5}" text-anchor="end">${esc(yfmt(v))}</text>`;
  }
  return g + '</g>';
}
function xlabels(labels, W, H, P, xAt) {
  const n = labels.length, every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - P.l - P.r) / 52))));
  return labels.map((l, i) => (i % every === 0 || i === n - 1) && !(i === n - 1 && i % every !== 0 && (n - 1) % every < every / 2) ? `<text class="ax" x="${xAt(i)}" y="${H - P.b + 15}" text-anchor="middle">${esc(l)}</text>` : '').join('');
}

/** lineChart({labels, series:[{name, values}], height, yfmt, area, tipTitles}) */
export function lineChart({ labels, series, height = 190, yfmt = fmtN, area = false, tipTitles, vfmt, width = 460 }) {
  const W = width, H = height, P = { t: 10, r: 12, b: 24, l: 44 };
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  const { max: ymax, step } = nice(Math.max(...all, 0));
  const n = labels.length, xAt = (i) => P.l + (n === 1 ? (W - P.l - P.r) / 2 : (i / (n - 1)) * (W - P.l - P.r));
  const yAt = (v) => P.t + (H - P.t - P.b) * (1 - v / ymax);
  const id = nid();
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${attr(series.map((x) => x.name).join(', '))} over time">${frame(W, H, P, ymax, step, yfmt)}<line class="base" x1="${P.l}" x2="${W - P.r}" y1="${H - P.b}" y2="${H - P.b}"/>`;
  series.forEach((se, k) => {
    const col = se.color || C(k);
    let d = '', started = false, last = null;
    se.values.forEach((v, i) => { if (v == null) { started = false; return; } d += (started ? 'L' : 'M') + xAt(i).toFixed(1) + ' ' + yAt(v).toFixed(1); started = true; last = i; });
    if (area && series.length === 1 && d) s += `<path d="${d} L${xAt(last)} ${H - P.b} L${xAt(se.values.findIndex((v) => v != null))} ${H - P.b}Z" fill="${col}" opacity=".12"/>`;
    s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    se.values.forEach((v, i) => { if (v != null && (se.values[i - 1] == null && se.values[i + 1] == null)) s += `<circle cx="${xAt(i)}" cy="${yAt(v)}" r="3.5" fill="${col}" stroke="var(--s1)" stroke-width="2"/>`; });
  });
  s += xlabels(labels, W, H, P, xAt);
  const colW = (W - P.l - P.r) / Math.max(1, n - 1);
  labels.forEach((l, i) => {
    const rows = series.map((se, k) => [se.name, (vfmt || yfmt)(se.values[i]), se.color || C(k)]);
    s += `<line id="${id}-${i}" class="xh" x1="${xAt(i)}" x2="${xAt(i)}" y1="${P.t}" y2="${H - P.b}" style="display:none"/>`;
    s += `<rect class="hit" x="${xAt(i) - colW / 2}" y="${P.t}" width="${colW}" height="${H - P.t - P.b}" data-g="${id}-${i}" data-tip="${attr(tip(tipTitles ? tipTitles[i] : l, rows))}"/>`;
  });
  s += '</svg>';
  const leg = series.length > 1 ? `<div class="legend">${series.map((se, k) => `<span><i style="background:${se.color || C(k)}"></i>${esc(se.name)}</span>`).join('')}</div>` : '';
  return `<div class="viz">${s}</div>${leg}`;
}

/** columnChart({labels, series:[{name, values, color}], stacked, height, yfmt}) */
export function columnChart({ labels, series, height = 190, yfmt = fmtN, tipTitles, vfmt, width = 460 }) {
  const W = width, H = height, P = { t: 10, r: 8, b: 24, l: 44 };
  const tot = labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] || 0), 0));
  const { max: ymax, step } = nice(Math.max(...tot, 0));
  const n = labels.length, slot = (W - P.l - P.r) / n, bw = Math.max(3, Math.min(34, slot * 0.62));
  const xAt = (i) => P.l + slot * i + slot / 2;
  const hOf = (v) => (H - P.t - P.b) * (v / ymax);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${attr(series.map((x) => x.name).join(', '))}">${frame(W, H, P, ymax, step, yfmt)}`;
  labels.forEach((l, i) => {
    let y = H - P.b;
    const segs = series.map((se, k) => ({ v: se.values[i] || 0, c: se.color || C(k) })).filter((x) => x.v > 0);
    segs.forEach((sg, j) => {
      const h = hOf(sg.v), top = j === segs.length - 1;
      const gap = j > 0 ? 2 : 0;
      const yy = y - h + gap, hh = Math.max(0, h - gap);
      s += top ? `<path d="M${xAt(i) - bw / 2} ${yy + hh} V${yy + Math.min(4, hh)} Q${xAt(i) - bw / 2} ${yy} ${xAt(i) - bw / 2 + Math.min(4, bw / 2)} ${yy} H${xAt(i) + bw / 2 - Math.min(4, bw / 2)} Q${xAt(i) + bw / 2} ${yy} ${xAt(i) + bw / 2} ${yy + Math.min(4, hh)} V${yy + hh}Z" fill="${sg.c}"/>` : `<rect x="${xAt(i) - bw / 2}" y="${yy}" width="${bw}" height="${hh}" fill="${sg.c}"/>`;
      y -= h;
    });
    const rows = series.map((se, k) => [se.name, (vfmt || yfmt)(se.values[i] || 0), se.color || C(k)]);
    if (series.length > 1) rows.push(['Total', (vfmt || yfmt)(tot[i])]);
    s += `<rect class="hit" x="${P.l + slot * i}" y="${P.t}" width="${slot}" height="${H - P.t - P.b}" data-tip="${attr(tip(tipTitles ? tipTitles[i] : l, rows))}"/>`;
  });
  s += `<line class="base" x1="${P.l}" x2="${W - P.r}" y1="${H - P.b}" y2="${H - P.b}"/>` + xlabels(labels, W, H, P, xAt) + '</svg>';
  const leg = series.length > 1 ? `<div class="legend">${series.map((se, k) => `<span><i style="background:${se.color || C(k)}"></i>${esc(se.name)}</span>`).join('')}</div>` : '';
  return `<div class="viz">${s}</div>${leg}`;
}

/** donut({items:[{label, value, color}], center, sub, fmt}) */
export function donut({ items, center = '', sub = '', fmt = fmtN, size = 150 }) {
  const total = items.reduce((a, x) => a + x.value, 0);
  const R = 60, r = 42, cx = 75, cy = 75;
  let a0 = -Math.PI / 2, s = `<svg viewBox="0 0 150 150" role="img" aria-label="${attr(items.map((x) => x.label + ' ' + x.value).join(', '))}">`;
  if (!total) s += `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="var(--s3)" stroke-width="${R - r}"/>`;
  const gapA = items.filter((x) => x.value > 0).length > 1 ? 0.025 : 0;
  items.forEach((it, k) => {
    if (!it.value) return;
    const a1 = a0 + (it.value / total) * Math.PI * 2;
    const s0 = a0 + gapA / 2, s1 = Math.max(s0 + 0.001, a1 - gapA / 2), large = s1 - s0 > Math.PI ? 1 : 0;
    const p = (ang, rad) => `${(cx + rad * Math.cos(ang)).toFixed(2)} ${(cy + rad * Math.sin(ang)).toFixed(2)}`;
    const col = it.color || C(k);
    const full = it.value === total;
    s += full ? `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${col}" stroke-width="${R - r}" data-tip="${attr(tip(it.label, [['Count', fmt(it.value)], ['Share', '100%']]))}"/>`
      : `<path d="M${p(s0, R)} A${R} ${R} 0 ${large} 1 ${p(s1, R)} L${p(s1, r)} A${r} ${r} 0 ${large} 0 ${p(s0, r)}Z" fill="${col}" data-tip="${attr(tip(it.label, [['Count', fmt(it.value)], ['Share', Math.round((it.value / total) * 100) + '%']]))}"/>`;
    a0 = a1;
  });
  s += `<text x="75" y="${sub ? 74 : 81}" text-anchor="middle" style="font:600 22px var(--f-disp);fill:var(--ink)">${esc(center)}</text>${sub ? `<text x="75" y="92" text-anchor="middle" style="font:11px var(--f-ui);fill:var(--faint)">${esc(sub)}</text>` : ''}</svg>`;
  return `<div class="donutc"><div class="viz" style="width:${size}px;flex-basis:${size}px">${s}</div><div class="dleg">${items.map((it, k) => `<div class="r"><i style="background:${it.color || C(k)}"></i><span>${esc(it.label)}</span><span class="n">${fmt(it.value)}</span></div>`).join('')}</div></div>`;
}

/** hbars([{label, value, color, tip}], {fmt, max}) */
export function hbars(items, { fmt = fmtN, max } = {}) {
  if (!items.length) return '<p class="mute">No data yet.</p>';
  const m = max || Math.max(...items.map((x) => x.value), 1);
  return `<div class="hbar">${items.map((it, k) => `<span class="l" title="${attr(it.label)}">${esc(it.label)}</span><div class="b" data-tip="${attr(it.tip || tip(it.label, [['Value', fmt(it.value)]]))}"><i style="width:${Math.max(it.value ? 2 : 0, (it.value / m) * 100)}%;background:${it.color || 'var(--c1)'}"></i></div><span class="n">${fmt(it.value)}</span>`).join('')}</div>`;
}

/** gauge(value 0..100, {label, color}) semi-circle */
export function gauge(v, { label = '', sub = '', color } = {}) {
  const val = Math.max(0, Math.min(100, v || 0));
  const col = color || (val >= 70 ? 'var(--ok)' : val >= 40 ? 'var(--c4)' : 'var(--bad)');
  const R = 70, cx = 90, cy = 88, a = Math.PI * (1 - val / 100);
  const ex = cx + R * Math.cos(a), ey = cy - R * Math.sin(a);
  return `<div class="viz gauge" style="max-width:220px;margin:0 auto"><svg viewBox="0 0 180 110" role="img" aria-label="${attr(label)} ${val}%"><path d="M${cx - R} ${cy} A${R} ${R} 0 0 1 ${cx + R} ${cy}" fill="none" stroke="var(--s3)" stroke-width="14" stroke-linecap="round"/>${val > 0 ? `<path d="M${cx - R} ${cy} A${R} ${R} 0 0 1 ${ex.toFixed(2)} ${ey.toFixed(2)}" fill="none" stroke="${col}" stroke-width="14" stroke-linecap="round"/>` : ''}<text x="${cx}" y="${cy - 8}" text-anchor="middle" style="font:600 30px var(--f-disp);fill:var(--ink)">${Math.round(val)}<tspan style="font-size:15px;fill:var(--faint)">%</tspan></text><text x="${cx}" y="${cy + 14}" text-anchor="middle" style="font:500 11px var(--f-ui);fill:var(--mute)">${esc(label)}</text></svg>${sub ? `<div class="note" style="text-align:center;margin-top:0">${esc(sub)}</div>` : ''}</div>`;
}

export function seqColor(v, max) { if (!v) return 'var(--q0)'; const t = v / (max || 1); return `var(--q${Math.min(6, Math.max(1, Math.ceil(t * 6)))})`; }
export const seqInk = (v, max) => (v && v / (max || 1) > 0.55 ? '#fff' : 'var(--ink)');

// ---- shared tooltip ----
let tipEl = null;
function showTip(e, html) {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'vtip'; document.body.append(tipEl); }
  tipEl.innerHTML = html; tipEl.hidden = false;
  const r = tipEl.getBoundingClientRect();
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
  tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
}
let guide = null;
document.addEventListener('mousemove', (e) => {
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (guide && (!t || t.dataset.g !== guide.id)) { guide.style.display = 'none'; guide = null; }
  if (!t) { if (tipEl) tipEl.hidden = true; return; }
  showTip(e, t.dataset.tip);
  if (t.dataset.g) { const g = document.getElementById(t.dataset.g); if (g) { g.style.display = ''; guide = g; } }
});
document.addEventListener('scroll', () => { if (tipEl) tipEl.hidden = true; }, true);
