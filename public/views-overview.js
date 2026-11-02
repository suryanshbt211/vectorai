import { esc, get, post, del, toast, modal, confirmBox, badge, meter, spark, bytes, mib, ago, dt, sh, num, statusBadge, pagehead, tile, empty, field, val, hwHtml } from './ui.js';
import { fmtN, fmtMs, lineChart, columnChart } from './charts.js';
import { kpi, card, tl } from './views-insights.js';

const histSeries = (samples, f) => samples.map(f);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function gpuCard(g, hist, i) {
  const vram = pct(g.memUsedMiB, g.memTotalMiB);
  return `<div class="card"><h3>GPU ${g.index}<span class="tag">${esc(g.name)}</span></h3>
    <div class="kv" style="grid-template-columns:90px 1fr">
      <dt>Utilization</dt><dd>${meter(g.util)}<span class="mono">${g.util ?? '-'}%</span></dd>
      <dt>VRAM</dt><dd>${meter(vram)}<span class="mono">${mib(g.memUsedMiB)} / ${mib(g.memTotalMiB)}</span></dd>
      <dt>Temperature</dt><dd class="mono">${g.tempC ?? '-'} °C</dd>
      <dt>Power</dt><dd class="mono">${g.powerW ?? '-'} W${g.powerLimitW ? ' / ' + g.powerLimitW + ' W' : ''}</dd>
      <dt>Driver</dt><dd class="mono">${esc(g.driver || '-')}</dd></div>
    <div class="faint" style="font-size:11px;margin-top:8px">Utilization, last ${Math.round(hist.length * 3 / 60) || 1} min</div>
    ${spark(histSeries(hist, (s) => (s.gpus[i] ? s.gpus[i].util : null)))}</div>`;
}

function runningTable(list) {
  if (!list.length) return '<p class="mute">No model is loaded in memory right now.</p>';
  return `<div class="tblwrap"><table class="tbl"><thead><tr><th>Model</th><th>Size</th><th>On GPU</th><th>Unloads</th></tr></thead><tbody>${list.map((m) => {
    const share = m.sizeBytes ? Math.round(((m.vramBytes || 0) / m.sizeBytes) * 100) : 0;
    return `<tr><td class="mono">${esc(m.name)}</td><td>${bytes(m.sizeBytes)}</td><td style="min-width:140px">${meter(share, share >= 99 ? 'ok' : share > 0 ? 'warn' : '')}<span class="mono">${share ? share + '% on GPU' : 'CPU · system RAM'}</span></td><td>${m.expiresAt ? ago(m.expiresAt).replace(' ago', '') : '-'}</td></tr>`;
  }).join('')}</tbody></table></div><p class="hint" style="margin-top:8px">Shows where each loaded model sits: GPU memory (fastest), or the CPU and system RAM, which is what a laptop without a dedicated GPU uses.</p>`;
}

// ---------------- Overview ----------------
const overview = {
  title: 'Overview', scope: 'org',
  async render(ctx) {
    const { root, can } = ctx;
    const o = await get('/api/overview');
    const hist = can('infra.read') ? (await get('/api/system/history')).samples : [];
    const setupItems = o.setup ? [
      ['ollama', 'Ollama is running on this host', 'Install Ollama and start it with: ollama serve', null],
      ['model', 'A model is downloaded', 'Download Gemma 3 4B to start', can('models.manage') ? '#/models?pull=gemma3:4b' : null],
      ['deployment', 'A deployment exists', 'A deployment turns a model into a managed service', can('deployments.manage') ? '#/deployments?new=1' : null],
      ['running', 'A deployment is running', 'Start it so people can chat', can('deployments.manage') ? '#/deployments' : null],
      ['compliance', 'Jurisdictions are set for compliance', 'Choose where you operate', can('org.manage') ? '#/organization' : null],
      ['team', 'You have invited your team', 'Add people with the right role', can('users.manage') ? '#/users' : null],
    ] : [];
    const done = setupItems.filter(([k]) => o.setup[k]).length;
    const c = o.compliance;
    const employeeOnly = !can('deployments.read') && !can('infra.read');

    let h = pagehead(`Welcome, ${ctx.me.displayName.split(' ')[0]}`, ctx.org ? `${ctx.org.name} · ${ctx.org.industryName}` : '', can('chat.use') ? '<a class="btn primary" href="#/chat">Open the assistant</a>' : '');
    if (o.attention && o.attention.length) {
      h += `<div class="stack" style="margin-bottom:16px">${o.attention.map((a) => `<div class="callout ${a.level === 'bad' ? 'bad' : a.level === 'warn' ? 'warn' : ''}">${esc(a.text)} ${a.link ? `<a href="${esc(a.link)}">Open</a>` : ''}</div>`).join('')}</div>`;
    }
    const tiles = [];
    if (o.deployments) tiles.push(tile('Deployments', `${o.deployments.running}<span class="faint" style="font-size:15px"> / ${o.deployments.total} running</span>`));
    if (o.models != null) tiles.push(tile('Models installed', num(o.models)));
    if (o.gpu) tiles.push(tile('GPU', o.gpu.available ? `${o.gpu.count} · ${o.gpu.avgUtil ?? 0}%` : 'None', o.gpu.available ? `${mib(o.gpu.memUsedMiB)} of ${mib(o.gpu.memTotalMiB)} VRAM` : esc(o.gpu.reason || '')));
    if (o.usage) tiles.push(tile('Requests', num(o.usage.requests), `${num(o.usage.tokens)} tokens`));
    if (c) tiles.push(tile('Compliance', `${c.coveragePct}%`, `${c.implemented} of ${c.total} implemented`));
    if (o.ledger) tiles.push(tile('Audit chain', o.ledger.ok ? 'Intact' : 'BROKEN', `${num(o.ledger.length)} entries`));
    h += `<div class="tiles">${tiles.join('')}</div>`;

    const cards = [];
    if (o.setup && done < setupItems.length && !employeeOnly) {
      cards.push(`<div class="card"><h3>Get started <span class="sp"></span><span class="tag">${done} / ${setupItems.length}</span></h3>${meter((done / setupItems.length) * 100, 'ok')}<ul style="list-style:none;padding:0;margin:12px 0 0;display:grid;gap:8px">${setupItems.map(([k, t, hint, link]) => `<li class="row" style="gap:10px;flex-wrap:nowrap">${o.setup[k] ? badge('Done', 'ok') : badge('To do', 'warn')}<div style="flex:1"><div>${esc(t)}</div>${o.setup[k] ? '' : `<div class="hint">${esc(hint)}</div>`}</div>${!o.setup[k] && link ? `<a class="btn sm" href="${esc(link)}">Go</a>` : ''}</li>`).join('')}</ul></div>`);
    }
    if (o.deployments && o.deployments.list.length) {
      cards.push(`<div class="card"><h3>Deployments <span class="sp"></span><a class="btn sm ghost" href="#/deployments">All</a></h3><div class="tblwrap"><table class="tbl"><tbody>${o.deployments.list.map((d) => `<tr><td><b>${esc(d.name)}</b><div class="mono faint" style="font-size:12px">${esc(d.model)}</div></td><td>${statusBadge(d.status)}</td><td class="mono">${d.gpuShare != null ? d.gpuShare + '% GPU' : ''}</td></tr>`).join('')}</tbody></table></div></div>`);
    }
    if (hist.length > 2) {
      cards.push(`<div class="card"><h3>Host load</h3><div class="faint" style="font-size:12px">CPU ${o.cpu ? o.cpu.percent : '-'}%</div>${spark(histSeries(hist, (s) => s.cpu), { cls: 'b' })}<div class="faint" style="font-size:12px;margin-top:6px">Memory ${o.memory ? o.memory.percent : '-'}%</div>${spark(histSeries(hist, (s) => s.mem), { cls: 'b' })}${o.gpu && o.gpu.available ? `<div class="faint" style="font-size:12px;margin-top:6px">GPU utilization</div>${spark(histSeries(hist, (s) => (s.gpus.length ? s.gpus.reduce((a, g) => a + (g.util || 0), 0) / s.gpus.length : null)))}` : ''}</div>`);
    }
    if (c) {
      const lv = Object.entries(c.byLevel || {});
      cards.push(`<div class="card"><h3>Compliance <span class="sp"></span><a class="btn sm ghost" href="#/compliance">Open</a></h3>${meter(c.coveragePct, 'ok')}<p class="mute" style="margin:10px 0">${c.implemented} of ${c.total} obligations implemented${c.gaps ? `, ${c.gaps} mandatory ones still open` : ''}.</p><div class="chips">${lv.map(([k, n]) => `<span class="tag">${esc(k)} ${n}</span>`).join('')}</div></div>`);
    }
    if (o.recent) {
      cards.push(`<div class="card"><h3>Recent activity <span class="sp"></span><a class="btn sm ghost" href="#/audit">Ledger</a></h3>${o.ledger && !o.ledger.ok ? `<div class="callout bad" style="margin-bottom:8px">Chain broken at entry ${o.ledger.brokenAt}</div>` : ''}<div class="tblwrap"><table class="tbl"><tbody>${o.recent.map((e) => `<tr><td class="mono" style="font-size:12px">${esc(e.action)}</td><td>${esc((e.actor || {}).username || 'system')}</td><td class="faint">${ago(e.ts)}</td></tr>`).join('')}</tbody></table></div></div>`);
    }
    if (employeeOnly) {
      cards.unshift(`<div class="card"><h3>Your private workspace</h3><p class="mute">Your questions are answered by models that run on ${esc(ctx.org ? ctx.org.name : 'your organization')}'s own hardware. Nothing is sent to an outside AI service. Open the assistant to ask a question, optionally grounded in your department's documents.</p></div>`);
    }
    h += `<div class="grid2">${cards.join('')}</div>`;
    root.innerHTML = h;
  },
};

// ---------------- Infrastructure ----------------
const infrastructure = {
  title: 'Infrastructure', perm: 'infra.read',
  async render(ctx) {
    const { root, can } = ctx;
    root.innerHTML = pagehead('Infrastructure', 'Live GPU, memory and Ollama status for this host, plus the inference nodes deployments can run on.', can('infra.manage') ? '<button class="btn primary" data-act="addnode">Add node</button>' : '') + '<div id="live"></div><div class="card" style="margin-top:16px"><h3>Inference nodes</h3><div id="nodes"></div></div>';
    const live = root.querySelector('#live');
    ctx.poll(async () => {
      const [s, h] = await Promise.all([get('/api/system'), get('/api/system/history')]);
      if (!ctx.alive()) return;
      const hist = h.samples;
      const ol = s.ollama;
      let x = `<div class="tiles">${tile('Ollama', ol.reachable ? 'Running' : 'Offline', ol.reachable ? `v${esc(ol.version)}` : esc(ol.error || ''))}${tile('CPU', `${s.cpu.percent}%`, `${s.cpu.cores} cores`)}${tile('Memory', `${s.memory.percent}%`, `${bytes(s.memory.usedBytes)} of ${bytes(s.memory.totalBytes)}`)}${tile('Device', s.hardware ? esc(s.hardware.deviceType === 'computer' ? 'Computer' : s.hardware.deviceType.replace(/^./, (c) => c.toUpperCase())) : '-', s.hardware ? esc(s.hardware.accelerator) : '')}</div>`;
      if (!ol.reachable) x += `<div class="callout bad" style="margin-bottom:16px">Ollama is not reachable at ${esc(ol.url)}. Install it from ollama.com and run <span class="mono">ollama serve</span>, or set OLLAMA_HOST for this server.</div>`;
      if (s.gpu.available) x += `<div class="grid2" style="margin-bottom:16px">${s.gpu.gpus.map((g, i) => gpuCard(g, hist, i)).join('')}</div>`;
      x += `<div class="card" style="margin-bottom:16px"><div class="ch"><div><div class="tt">Deployment hardware</div><div class="st">${esc(s.hardware ? s.hardware.summary : '')}</div></div></div>${hwHtml(s.hardware)}</div>`;
      x += `<div class="grid2"><div class="card"><h3>Models in memory</h3>${runningTable(ol.running || [])}</div><div class="card"><h3>Host</h3><dl class="kv"><dt>Name</dt><dd>${esc(s.host.name)}</dd><dt>Platform</dt><dd>${esc(s.host.platform)} ${esc(s.host.arch)}</dd><dt>CPU</dt><dd>${esc(s.cpu.model)}</dd><dt>Uptime</dt><dd>${Math.round(s.host.uptimeSec / 3600)} h</dd></dl><div class="faint" style="font-size:12px;margin-top:10px">CPU load</div>${spark(histSeries(hist, (q) => q.cpu), { cls: 'b' })}<div class="faint" style="font-size:12px">Memory</div>${spark(histSeries(hist, (q) => q.mem), { cls: 'b' })}</div></div>`;
      live.innerHTML = x;
    }, 3000);
    const nodesEl = root.querySelector('#nodes');
    const loadNodes = async () => {
      const nodes = await get('/api/nodes');
      if (!ctx.alive()) return;
      nodesEl.innerHTML = `<div class="tblwrap"><table class="tbl"><thead><tr><th>Name</th><th>Address</th><th>Status</th><th>Models</th><th>Loaded</th><th>Deployments</th><th></th></tr></thead><tbody>${nodes.map((n) => `<tr><td><b>${esc(n.name)}</b>${n.id === 'local' ? ' <span class="tag">this host</span>' : ''}</td><td class="mono">${esc(n.url)}</td><td>${n.reachable ? badge('Online' + (n.version ? ' · v' + n.version : ''), 'ok') : badge('Unreachable', 'bad')}${n.error ? `<div class="hint">${esc(n.error)}</div>` : ''}</td><td>${n.models}</td><td>${n.running.map((m) => `<span class="tag">${esc(m.name)}</span>`).join(' ') || '-'}</td><td>${n.deployments}</td><td class="acts">${n.id !== 'local' && can('infra.manage') ? `<button class="btn sm danger" data-act="rmnode" data-id="${esc(n.id)}" data-name="${esc(n.name)}">Remove</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
    };
    await loadNodes();
    ctx.poll(loadNodes, 10000);
    ctx.acts.addnode = () => modal({
      title: 'Add inference node',
      html: `<p class="mute" style="margin-bottom:12px">Another machine running Ollama that this organization can deploy to. It must be reachable from this server.</p>${field('Name', '<input class="input" name="name" placeholder="GPU server 2">')}${field('Address', '<input class="input mono" name="url" placeholder="http://10.0.0.5:11434">', 'Ollama has no login of its own. Keep this on a private network.')}`,
      actions: [{ label: 'Add node', primary: true, onClick: async (m) => { await post('/api/nodes', { name: val(m, 'name'), url: val(m, 'url') }); toast('Node added'); loadNodes(); } }],
    });
    ctx.acts.rmnode = async (t) => {
      if (!(await confirmBox({ title: 'Remove node', message: `Remove ${t.dataset.name}? Models on that machine are not touched.`, confirm: 'Remove', danger: true }))) return;
      await del('/api/nodes/' + t.dataset.id); toast('Node removed'); loadNodes();
    };
  },
};

// ---------------- Operations (Vector operators) ----------------
const ops = {
  title: 'Operations', perm: 'ops.view', scope: 'platform',
  async render(ctx) {
    const { root } = ctx;
    let range = '24h';
    root.innerHTML = pagehead('Operations', 'Health of the local Ollama runtime and every customer organization. Operators see status, counts and performance, never prompts, documents or answers.', `<span class="faint" style="font-size:12px"><span class="livedot"></span> live</span><div class="seg">${['24h', '7d', '30d'].map((r) => `<button class="${r === range ? 'on' : ''}" data-act="range" data-r="${r}">${r}</button>`).join('')}</div>`) + '<div id="ops"></div>';
    const box = root.querySelector('#ops');
    const draw = async () => {
      const [d, ol, m, h] = await Promise.all([get('/api/ops/overview'), get('/api/ops/ollama'), get('/api/ops/metrics?range=' + range), get('/api/system/history')]);
      if (!ctx.alive()) return;
      root.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.r === range));
      const hist = h.samples, t = m.totals, sys = d.system;
      const run = d.deployments.filter((x) => x.status === 'running').length;
      const bad = d.deployments.filter((x) => ['unreachable', 'model_missing', 'node_missing'].includes(x.status)).length;
      const broken = d.chains.filter((c) => !c.ok);
      const labels = m.series.map((x) => tl(x.t, m.stepMs));
      let x = '';
      if (broken.length) x += `<div class="callout bad" style="margin-bottom:16px"><b>Audit chain integrity failure:</b> ${broken.map((c) => esc(c.name)).join(', ')}. Open Audit ledgers.</div>`;
      if (!ol.reachable) x += `<div class="callout bad" style="margin-bottom:16px"><b>Ollama is not reachable</b> at ${esc(ol.url)}: ${esc(ol.error || '')}. Start it with <span class="mono">ollama serve</span> or set OLLAMA_HOST.</div>`;
      x += `<div class="kpis">
        ${kpi('Ollama', ol.reachable ? `<span style="color:var(--ok)">Online</span>` : '<span style="color:var(--bad)">Offline</span>', ol.reachable ? `v${esc(ol.version)} · answered in ${ol.latencyMs} ms` : esc(ol.url))}
        ${kpi('Models', ol.reachable ? `${ol.running.length}<small>/ ${ol.installed.length} loaded</small>` : '-', ol.reachable ? bytes(ol.installed.reduce((a, b) => a + b.sizeBytes, 0)) + ' on disk' : '')}
        ${kpi('Customers', num(d.orgs.length), `${d.orgs.reduce((a, o) => a + o.users, 0)} users`)}
        ${kpi('Deployments', `${run}<small>/ ${d.deployments.length} running</small>`, `${bad} need attention`, '', bad ? 'st-bad' : '')}
        ${kpi('AI requests, ' + range, num(t.requests), `${fmtN(t.promptTokens + t.completionTokens)} tokens`, spark(m.series.map((s) => s.requests), { max: Math.max(1, ...m.series.map((s) => s.requests)) }))}
        ${kpi('Generation speed', t.tps != null ? `${t.tps}<small>tok/s</small>` : '-', t.p95 != null ? `p95 latency ${fmtMs(t.p95)}` : 'no requests yet')}
        ${kpi('Audit chains', broken.length ? 'Broken' : 'Intact', `${d.chains.length} chains verified now`, '', broken.length ? 'st-bad' : 'st-ok')}</div>`;
      const share = (r) => (r.sizeBytes ? Math.round((r.vramBytes / r.sizeBytes) * 100) : 0);
      x += `<div class="cols2">
        ${card('Local Ollama runtime', ol.reachable ? `${esc(ol.url)} · v${esc(ol.version)}` : 'offline', ol.reachable ? `<div class="lbl" style="margin-bottom:6px">Loaded in memory</div>${ol.running.length ? ol.running.map((r) => `<div style="margin-bottom:10px"><div class="row between"><span class="mono" style="font-weight:600">${esc(r.name)}</span><span class="faint" style="font-size:12px">${bytes(r.sizeBytes)}${r.ctx ? ' · ctx ' + num(r.ctx) : ''}</span></div>${meter(share(r), share(r) >= 99 ? 'ok' : share(r) ? 'warn' : '')}<div class="note" style="margin-top:3px">${share(r)}% in GPU memory${share(r) < 100 ? ` · ${bytes(r.sizeBytes - r.vramBytes)} in system RAM` : ''} · unloads in ${r.expiresAt ? ago(r.expiresAt).replace(' ago', '') : '-'}</div></div>`).join('') : '<p class="mute" style="margin-bottom:10px">Nothing loaded. The next request triggers a model load.</p>'}
          <div class="lbl" style="margin:12px 0 6px">Installed models</div><div class="tblwrap"><table class="tbl"><thead><tr><th>Model</th><th>Params</th><th>Quant</th><th>Size</th><th>Used by</th></tr></thead><tbody>${ol.installed.map((mm) => { const used = ol.usedBy.filter((u) => u.model === mm.name); return `<tr><td class="mono"><b>${esc(mm.name)}</b>${ol.running.some((r) => r.name === mm.name) ? ' <span class="livedot" title="loaded"></span>' : ''}</td><td>${esc(mm.params || '-')}</td><td>${esc(mm.quant || '-')}</td><td>${bytes(mm.sizeBytes)}</td><td>${used.length ? `<span title="${esc(used.map((u) => u.org + ' / ' + u.deployment).join('\n'))}">${used.length} deployment${used.length > 1 ? 's' : ''}</span>` : '<span class="faint">unused</span>'}</td></tr>`; }).join('') || '<tr><td colspan="5" class="mute">No models installed. Run: ollama pull gemma3:4b</td></tr>'}</tbody></table></div>` : `<p class="mute">Ollama did not answer: ${esc(ol.error || '')}</p>`)}
        ${card('Host', `${esc(sys.hardware ? sys.hardware.summary : '')}`, `<div class="row between" style="font-size:12.5px"><span>CPU</span><b>${sys.cpu.percent}%</b></div>${spark(hist.map((s) => s.cpu), { cls: 'b' })}<div class="row between" style="font-size:12.5px;margin-top:6px"><span>Memory</span><b>${sys.memory.percent}% of ${bytes(sys.memory.totalBytes)}</b></div>${spark(hist.map((s) => s.mem), { cls: 'b' })}${sys.gpu.available ? sys.gpu.gpus.map((g, i) => `<div class="row between" style="font-size:12.5px;margin-top:6px"><span>GPU ${g.index} · ${mib(g.memUsedMiB)} / ${mib(g.memTotalMiB)} · ${g.tempC ?? '-'}°C</span><b>${g.util ?? 0}%</b></div>${spark(hist.map((s) => (s.gpus[i] ? s.gpus[i].util : null)))}`).join('') : (sys.hardware ? `<div class="note">Inference: ${esc(sys.hardware.accelerator)}</div>` : '')}<div class="note">Sampled every ${Math.round(h.intervalMs / 1000)} s · last ${Math.round((hist.length * h.intervalMs) / 60000)} min</div>`)}
        ${card('AI requests by customer', 'Per ' + (m.stepMs < 864e5 ? 'hour' : 'day'), (m.orgSeries.length ? columnChart({ labels, series: m.orgSeries.map((g) => ({ name: g.name, values: g.values })) }) : '<p class="mute">No requests yet in this period.</p>'), { cls: '' })}
        ${card('Latency and speed', 'p95 request time and time to first token across customers', lineChart({ labels, series: [{ name: 'p95', values: m.series.map((s) => s.p95) }, { name: 'First token', values: m.series.map((s) => s.ttft) }], yfmt: fmtMs }))}
      </div>`;
      x += `<div class="card" style="margin-top:16px"><div class="ch"><div><div class="tt">Customers</div><div class="st">Counts and performance only</div></div><span class="sp"></span><a class="btn sm" href="#/customers">Manage</a></div><div class="tblwrap"><table class="tbl mtable"><thead><tr><th>Organization</th><th>Industry</th><th>Type</th><th class="num">Users</th><th class="num">Deployments</th><th>Health</th><th class="num">Requests (${range})</th><th class="num">tok/s</th><th class="num">p95</th></tr></thead><tbody>${d.orgs.map((o) => { const g = m.byOrgId.find((z) => z.key === o.id) || {}; return `<tr><td><a href="#/customer?id=${o.id}" style="font-weight:600;color:var(--acc-t)">${esc(o.name)}</a>${o.disabled ? ' ' + badge('Disabled', 'bad') : ''}</td><td>${esc(o.industry)}</td><td>${esc(String(o.deploymentType).replace('_', ' '))}</td><td class="num">${o.users}</td><td class="num">${o.running}/${o.deployments}</td><td>${o.unhealthy ? badge(o.unhealthy + ' unhealthy', 'bad') : o.deployments ? badge('Healthy', 'ok') : badge('No deployments')}</td><td class="num">${num(g.requests || 0)}</td><td class="num">${g.tps ?? '-'}</td><td class="num">${fmtMs(g.p95)}</td></tr>`; }).join('') || `<tr><td colspan="9">${empty('No customers yet', 'Create one in Customers, or run npm run seed-samples.')}</td></tr>`}</tbody></table></div></div>`;
      x += `<div class="cols2" style="margin-top:16px"><div class="card"><div class="ch"><div><div class="tt">All deployments</div></div></div><div class="tblwrap"><table class="tbl"><thead><tr><th>Customer</th><th>Deployment</th><th>Model</th><th>Status</th><th>GPU</th></tr></thead><tbody>${d.deployments.map((v) => `<tr><td>${esc(v.orgName || '')}</td><td><b>${esc(v.name)}</b></td><td class="mono">${esc(v.model)}</td><td>${statusBadge(v.status)}</td><td class="mono">${v.gpuShare != null ? v.gpuShare + '%' : '-'}</td></tr>`).join('') || '<tr><td colspan="5" class="mute">No deployments.</td></tr>'}</tbody></table></div></div>
        <div class="card"><div class="ch"><div><div class="tt">Audit chains</div><div class="st">Re-verified from disk on every refresh</div></div><span class="sp"></span><a class="btn sm" href="#/audit">Open</a></div><div class="tblwrap"><table class="tbl"><thead><tr><th>Ledger</th><th>Blocks</th><th>Integrity</th><th>Head</th></tr></thead><tbody>${d.chains.map((c) => `<tr><td>${esc(c.name)}</td><td>${num(c.length)}</td><td>${c.ok ? badge('Intact', 'ok') : badge('Broken at ' + c.brokenAt, 'bad')}</td><td class="mono" title="${esc(c.head)}">${esc(sh(c.head))}</td></tr>`).join('')}</tbody></table></div></div></div>`;
      box.innerHTML = x;
    };
    ctx.acts.range = (b) => { range = b.dataset.r; draw(); };
    await draw();
    ctx.poll(draw, 8000);
  },
};
export const views = { overview, infrastructure, ops };
