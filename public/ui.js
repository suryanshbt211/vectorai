// Shared helpers: API access, escaping, formatting, modals, toasts, charts.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export class ApiError extends Error { constructor(status, msg, code) { super(msg); this.status = status; this.code = code; } }
export async function api(method, url, body) {
  let r;
  try { r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' }); }
  catch (e) { throw new ApiError(0, 'Cannot reach the Vector server'); }
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json().catch(() => null) : await r.text();
  if (r.status === 401 && !url.startsWith('/api/auth/login')) window.dispatchEvent(new Event('vector:unauth'));
  if (!r.ok) throw new ApiError(r.status, (data && data.error) || r.statusText, data && data.code);
  return data;
}
export const get = (u) => api('GET', u);
export const post = (u, b) => api('POST', u, b || {});
export const put = (u, b) => api('PUT', u, b || {});
export const del = (u) => api('DELETE', u);

export async function stream(url, body, onEvent, signal) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal, credentials: 'same-origin' });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new ApiError(r.status, d.error || r.statusText, d.code); }
  const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) onEvent(JSON.parse(line)); }
  }
}
export async function downloadFile(url, fallback = 'download') {
  const r = await fetch(url, { credentials: 'same-origin' });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new ApiError(r.status, d.error || r.statusText); }
  const cd = r.headers.get('content-disposition') || '';
  const m = /filename="([^"]+)"/.exec(cd);
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = m ? m[1] : fallback;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const bytes = (n) => { if (n == null) return '-'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0, v = Number(n); while (v >= 1024 && i < 4) { v /= 1024; i++; } return (v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(1)) + ' ' + u[i]; };
export const mib = (n) => (n == null ? '-' : n >= 1024 ? (n / 1024).toFixed(1) + ' GiB' : Math.round(n) + ' MiB');
export const dt = (ts) => { if (!ts) return '-'; const d = new Date(ts); const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
export const ago = (ts) => { if (!ts) return 'never'; const s = Math.round((Date.now() - new Date(ts)) / 1000); if (s < 60) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' h ago'; return Math.round(s / 86400) + ' d ago'; };
export const sh = (h) => (h ? h.slice(0, 8) + '…' + h.slice(-6) : '-');
export const num = (n) => (n == null ? '-' : Number(n).toLocaleString());

export const badge = (text, kind = '') => `<span class="badge ${kind}"><i class="dot"></i>${esc(text)}</span>`;
export const STATUS = { running: ['Running', 'ok'], stopped: ['Stopped', ''], model_missing: ['Model missing', 'warn'], unreachable: ['Unreachable', 'bad'], node_missing: ['Node removed', 'bad'] };
export const statusBadge = (s) => { const [t, k] = STATUS[s] || [s, '']; return badge(t, k); };
export const meter = (pct, kind) => { const p = Math.max(0, Math.min(100, pct || 0)); const k = kind || (p > 90 ? 'bad' : p > 75 ? 'warn' : ''); return `<div class="meter ${k}" role="progressbar" aria-valuenow="${Math.round(p)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${p}%"></i></div>`; };

export function spark(vals, { min = 0, max = 100, cls = '' } = {}) {
  const w = 240, h = 46;
  const v = []; let last = null;
  for (const x of vals) { if (x != null) last = x; v.push(last); }
  const first = v.find((x) => x != null);
  if (v.length < 2 || first == null) return `<svg class="spark ${cls}" viewBox="0 0 ${w} ${h}" aria-hidden="true"></svg>`;
  const pts = v.map((x, i) => [(i / (v.length - 1)) * w, h - 3 - ((Math.min(max, Math.max(min, x ?? first)) - min) / (max - min || 1)) * (h - 6)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return `<svg class="spark ${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="${line} L${w} ${h} L0 ${h}Z"/><path class="l" d="${line}"/></svg>`;
}

export function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + (kind === 'bad' ? 'bad' : '');
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), kind === 'bad' ? 7000 : 3800);
}

/** modal({title, html, wide, actions:[{label, primary, danger, onClick(m)}], onMount(m)}) */
export function modal({ title, html, wide, actions = [], onMount, closeLabel = 'Cancel' }) {
  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h3>${esc(title)}</h3><button class="btn ghost sm" data-x aria-label="Close">✕</button></header><div class="mb">${html}</div><div class="m-err" role="alert"></div><footer></footer></div>`;
  const prev = document.activeElement;
  const m = {
    el: ov, $: (s) => $(s, ov), $$: (s) => $$(s, ov),
    error: (t) => { $('.m-err', ov).textContent = t || ''; },
    close: () => { ov.remove(); document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); },
  };
  const onKey = (e) => { if (e.key === 'Escape' && ov.isConnected && document.querySelectorAll('.ov').length && ov === [...document.querySelectorAll('.ov')].pop()) m.close(); };
  document.addEventListener('keydown', onKey);
  const foot = $('footer', ov);
  const all = actions.length ? actions : [];
  const cancel = document.createElement('button'); cancel.className = 'btn'; cancel.textContent = actions.length ? closeLabel : 'Close'; cancel.onclick = m.close; foot.append(cancel);
  for (const a of all) {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.primary ? 'primary' : '') + (a.danger ? ' danger' : '');
    b.textContent = a.label;
    b.onclick = async () => {
      m.error('');
      b.disabled = true;
      try { const r = await a.onClick(m); if (r !== false) m.close(); }
      catch (e) { m.error(e.message || String(e)); }
      finally { b.disabled = false; }
    };
    foot.append(b);
  }
  $('[data-x]', ov).onclick = m.close;
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) m.close(); });
  document.body.append(ov);
  const first = $('input:not([type=checkbox]),select,textarea', ov) || $('.btn.primary', ov);
  if (first) first.focus();
  if (onMount) onMount(m);
  return m;
}
export function confirmBox({ title = 'Are you sure?', message, confirm = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({ title, html: `<p>${esc(message)}</p>`, actions: [{ label: confirm, primary: !danger, danger, onClick: () => { done = true; resolve(true); } }] });
    const obs = new MutationObserver(() => { if (!m.el.isConnected) { obs.disconnect(); if (!done) resolve(false); } });
    obs.observe(document.body, { childList: true });
  });
}
export function secretBox(title, lines) {
  return modal({ title, html: `<p class="mute" style="margin-bottom:10px">Copy this now. It is shown once and the person must change it at first sign-in.</p>${lines.map(([k, v]) => `<div class="field"><label>${esc(k)}</label><input class="input mono" readonly value="${esc(v)}" onfocus="this.select()"></div>`).join('')}` });
}

// Small safe markdown: code fences, inline code, bold, bullet lists. Everything is escaped first.
export function md(text) {
  const parts = String(text).split(/```/);
  return parts.map((p, i) => {
    if (i % 2) { const body = p.replace(/^[a-zA-Z0-9_+-]*\n/, ''); return `<pre><code>${esc(body.replace(/\n$/, ''))}</code></pre>`; }
    let s = esc(p);
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    return s;
  }).join('');
}

const ICONS = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  server: '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/>',
  cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  rocket: '<path d="M12 3c3 2 5 5 5 9l-2 4H9l-2-4c0-4 2-7 5-9z"/><circle cx="12" cy="10" r="1.6"/><path d="M9 16l-2 4 3-1M15 16l2 4-3-1"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14c3 0 5 2 5 5"/>',
  chain: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  building: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  graph: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="8" r="2.5"/><circle cx="9" cy="18" r="2.5"/><path d="M8.2 7.2l7.5.6M7 8.3l1.5 7.3M16.6 10l-5.8 6.4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>', search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>',
};
export const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;
export const LOGO = '<svg width="30" height="25" viewBox="0 0 545 450" aria-hidden="true"><path d="M34 14H150Q178 14 193 40L344 300Q354 318 344 336L292 428Q276 452 260 428L16 46Q2 14 34 14Z" fill="currentColor"/><path d="M356 34Q356 4 382 20L528 118Q546 134 528 150L382 258Q356 276 356 246Z" fill="#7B6DFF"/></svg>';

export function field(label, control, hint) { return `<div class="field"><label>${esc(label)}</label>${control}${hint ? `<div class="hint">${esc(hint)}</div>` : ''}</div>`; }
export function readFileText(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Could not read the file')); r.readAsText(file); }); }
export function readFileB64(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error('Could not read the file')); r.readAsDataURL(file); }); }

export const pagehead = (title, sub, actions = '') => `<div class="pagehead"><div><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div><div class="sp"></div><div class="row">${actions}</div></div>`;
export const tile = (k, v, s = '') => `<div class="tile"><div class="k">${esc(k)}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
export const empty = (title, text, action = '') => `<div class="empty"><b>${esc(title)}</b>${esc(text)}${action ? `<div style="margin-top:14px">${action}</div>` : ''}</div>`;
export const options = (list, sel) => list.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(l)}</option>`).join('');
export const val = (m, name) => { const e = m.el.querySelector(`[name="${name}"]`); return e ? (e.type === 'checkbox' ? e.checked : e.value) : undefined; };

// The physical machine this deployment runs on (from /api/system -> hardware).
export const hwLine = (h) => (h ? `Running on ${esc(h.summary)}` : '');
export const hwHtml = (h) => (!h ? '' : `<dl class="kv" style="grid-template-columns:120px 1fr"><dt>Device</dt><dd><b>${esc(h.deviceType === 'computer' ? 'Computer' : h.deviceType.charAt(0).toUpperCase() + h.deviceType.slice(1))}</b>${h.vendor || h.model ? ' · ' + esc([h.vendor, h.model].filter(Boolean).join(' ')) : ''}</dd><dt>Operating system</dt><dd>${esc(h.osName || h.platform)} (${esc(h.arch)})</dd><dt>Processor</dt><dd>${esc(h.cpu.model)} · ${h.cpu.cores} cores</dd><dt>Memory</dt><dd>${Math.round(h.memoryBytes / 2 ** 30)} GB</dd><dt>Graphics</dt><dd>${h.gpus.length ? h.gpus.map((g) => esc(g.name) + (g.vram ? ` <span class="faint">(${esc(String(g.vram))})</span>` : '')).join('<br>') : '<span class="faint">none reported</span>'}</dd><dt>Inference</dt><dd>${esc(h.accelerator)}</dd><dt>Network</dt><dd>Local only: models, data and logs stay on this machine</dd></dl>`);
