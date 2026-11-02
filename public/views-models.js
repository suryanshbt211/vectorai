import { esc, get, post, put, del, stream, toast, modal, confirmBox, badge, meter, bytes, ago, num, statusBadge, pagehead, tile, empty, field, options, val } from './ui.js';

const pulling = new Map(); // module level so progress survives navigating away and back
let redraw = null;

async function startPull(name, node) {
  if (pulling.has(name)) return;
  pulling.set(name, { status: 'starting', pct: 0 });
  if (redraw) redraw();
  try {
    await stream('/api/models/pull', { name, node }, (ev) => {
      if (ev.error) throw new Error(ev.error);
      const p = pulling.get(name);
      if (!p) return;
      p.status = ev.status || p.status;
      if (ev.total && ev.completed != null) { p.pct = Math.round((ev.completed / ev.total) * 100); p.done = ev.completed; p.total = ev.total; }
      if (redraw) redraw();
    });
    toast(`${name} downloaded`);
  } catch (e) { toast(`${name}: ${e.message}`, 'bad'); }
  pulling.delete(name);
  if (redraw) redraw(true);
}

const fit = (m, vramGiB) => {
  if (!m.sizeGB) return '<span class="tag">size: see Ollama</span>';
  if (!vramGiB) return `<span class="tag">${m.sizeGB} GB</span>`;
  const need = m.sizeGB * 1.25;
  return need <= vramGiB ? `<span class="tag" style="color:var(--ok)">${m.sizeGB} GB · fits your GPU</span>` : `<span class="tag" style="color:var(--warn)">${m.sizeGB} GB · exceeds your VRAM, partly on CPU</span>`;
};

// ---------------- Models ----------------
const models = {
  title: 'Models', perm: 'models.read',
  async render(ctx) {
    const { root, can } = ctx;
    const manage = can('models.manage');
    let tab = ctx.query.tab === 'catalog' ? 'catalog' : 'installed';
    let node = '';
    const [cat, nodes] = await Promise.all([get('/api/catalog'), can('infra.read') ? get('/api/nodes').catch(() => []) : Promise.resolve([])]);
    let vramGiB = 0;
    if (can('infra.read')) { try { const s = await get('/api/system'); if (s.gpu.available) vramGiB = Math.max(...s.gpu.gpus.map((g) => g.memTotalMiB)) / 1024; } catch (_) { /* optional */ } }
    let installed = [], loadErr = null;

    const draw = async (reload) => {
      if (!ctx.alive()) return;
      if (reload) { try { installed = (await get('/api/models' + (node ? '?node=' + encodeURIComponent(node) : ''))).models; loadErr = null; } catch (e) { installed = []; loadErr = e.message; } }
      if (!ctx.alive()) return;
      const have = new Set(installed.map((m) => m.name));
      const pulls = [...pulling.entries()];
      const nodeSel = nodes.length > 1 ? `<select class="select" style="width:auto" data-chg="node" aria-label="Node">${options(nodes.map((n) => [n.id === 'local' ? '' : n.id, n.name]), node)}</select>` : '';
      let h = pagehead('Models', 'Open-weight models stored on your own hardware. Nothing is downloaded unless you choose it, and nothing you ask leaves this network.', nodeSel + (manage ? '<button class="btn primary" data-act="pullany">Download a model</button>' : ''));
      if (pulls.length) h += `<div class="card" style="margin-bottom:16px"><h3>Downloading</h3>${pulls.map(([n, p]) => `<div style="margin-bottom:10px"><div class="row between"><span class="mono">${esc(n)}</span><span class="mute">${esc(p.status)}${p.total ? ` · ${bytes(p.done)} of ${bytes(p.total)}` : ''}</span></div>${meter(p.pct, 'ok')}</div>`).join('')}</div>`;
      if (loadErr) h += `<div class="callout bad" style="margin-bottom:16px">Cannot reach Ollama: ${esc(loadErr)}. Start it with <span class="mono">ollama serve</span>.</div>`;
      h += `<div class="tabs" role="tablist"><button class="tab ${tab === 'installed' ? 'on' : ''}" data-act="tab" data-tab="installed">Installed (${installed.length})</button><button class="tab ${tab === 'catalog' ? 'on' : ''}" data-act="tab" data-tab="catalog">Catalog</button></div>`;
      if (tab === 'installed') {
        h += installed.length ? `<div class="card"><div class="tblwrap"><table class="tbl"><thead><tr><th>Model</th><th>Family</th><th>Parameters</th><th>Quantization</th><th>Size</th><th>State</th><th>Updated</th><th></th></tr></thead><tbody>${installed.map((m) => `<tr><td class="mono"><b>${esc(m.name)}</b></td><td>${esc(m.family || '-')}</td><td>${esc(m.params || '-')}</td><td>${esc(m.quant || '-')}</td><td>${bytes(m.sizeBytes)}</td><td>${m.running ? badge('Loaded', 'ok') : badge('On disk')}</td><td class="faint">${ago(m.modifiedAt)}</td><td class="acts"><button class="btn sm" data-act="info" data-name="${esc(m.name)}">Details</button>${can('deployments.manage') ? `<a class="btn sm" href="#/deployments?new=1&model=${encodeURIComponent(m.name)}">Deploy</a>` : ''}${manage ? `<button class="btn sm danger" data-act="rm" data-name="${esc(m.name)}">Delete</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`
          : (loadErr ? '' : `<div class="card">${empty('No models yet', manage ? 'Start with Gemma 3 4B. It runs well on a single consumer GPU and handles text and images.' : 'Ask an administrator to download a model.', manage ? '<button class="btn primary" data-act="pull" data-name="gemma3:4b">Download Gemma 3 4B</button>' : '')}</div>`);
      } else {
        const fams = [...new Set(cat.models.map((m) => m.family))];
        h += vramGiB ? `<p class="mute" style="margin-bottom:12px">Largest GPU on this host: ${vramGiB.toFixed(1)} GiB of VRAM. A model needs roughly its file size plus room for context.</p>` : '<p class="mute" style="margin-bottom:12px">No dedicated NVIDIA GPU reported; inference uses this machine\'s CPU or integrated graphics. Smaller models answer faster.</p>';
        for (const f of fams) {
          h += `<h3 style="margin:20px 0 10px">${esc(f)}</h3><div class="mcards">${cat.models.filter((m) => m.family === f).map((m) => `<div class="mcard ${m.recommended ? 'rec' : ''}"><div class="row between"><h4>${esc(m.tag)}</h4>${m.recommended ? badge('Default', 'ok') : ''}</div><div class="meta"><span class="tag">${esc(m.params)}</span>${m.ctx ? `<span class="tag">${esc(m.ctx)} context</span>` : ''}${m.input.map((i) => `<span class="tag">${esc(i)}</span>`).join('')}${fit(m, vramGiB)}</div><p>${esc(m.note)}</p>${m.license ? `<div class="hint">Licence: ${esc(m.license)}</div>` : '<div class="hint">Check the licence on its Ollama page before use.</div>'}${have.has(m.tag) || have.has(m.tag + ':latest') ? badge('Installed', 'ok') : pulling.has(m.tag) ? badge('Downloading…', 'warn') : manage ? `<button class="btn sm primary" data-act="pull" data-name="${esc(m.tag)}">Download</button>` : ''}</div>`).join('')}</div>`;
        }
      }
      root.innerHTML = h;
    };
    redraw = (reload) => draw(reload);
    ctx.acts.tab = (t) => { tab = t.dataset.tab; draw(); };
    ctx.chg.node = (t) => { node = t.value; draw(true); };
    ctx.acts.pull = (t) => { startPull(t.dataset.name, node || undefined); };
    ctx.acts.pullany = () => modal({
      title: 'Download a model',
      html: `<p class="mute" style="margin-bottom:12px">Enter any model tag from the Ollama library, for example <span class="mono">gemma3:12b</span>. Its licence is your responsibility.</p>${field('Model tag', '<input class="input mono" name="name" placeholder="gemma3:4b" list="tags">')}<datalist id="tags">${cat.models.map((m) => `<option value="${esc(m.tag)}">`).join('')}</datalist>`,
      actions: [{ label: 'Download', primary: true, onClick: async (m) => { const n = val(m, 'name').trim(); if (!n) throw new Error('Enter a model tag'); startPull(n, node || undefined); tab = 'installed'; } }],
    });
    ctx.acts.rm = async (t) => {
      if (!(await confirmBox({ title: 'Delete model', message: `Delete ${t.dataset.name} from disk? You can download it again later.`, confirm: 'Delete', danger: true }))) return;
      await del(`/api/models?name=${encodeURIComponent(t.dataset.name)}${node ? '&node=' + encodeURIComponent(node) : ''}`);
      toast('Model deleted'); draw(true);
    };
    ctx.acts.info = async (t) => {
      const s = await get(`/api/models/show?name=${encodeURIComponent(t.dataset.name)}${node ? '&node=' + encodeURIComponent(node) : ''}`);
      const d = s.details || {};
      modal({ title: t.dataset.name, wide: true, html: `<dl class="kv"><dt>Family</dt><dd>${esc(d.family || '-')}</dd><dt>Parameters</dt><dd>${esc(d.parameter_size || '-')}</dd><dt>Quantization</dt><dd>${esc(d.quantization_level || '-')}</dd><dt>Format</dt><dd>${esc(d.format || '-')}</dd><dt>Capabilities</dt><dd>${(s.capabilities || []).map((c) => `<span class="tag">${esc(c)}</span>`).join(' ') || '-'}</dd>${Object.entries(s.modelInfo || {}).map(([k, v]) => `<dt>${esc(k.split('.').pop())}</dt><dd class="mono">${esc(v)}</dd>`).join('')}</dl>${s.parameters ? `<h4 style="margin:14px 0 6px">Default parameters</h4><pre class="json">${esc(s.parameters)}</pre>` : ''}${s.license ? `<h4 style="margin:14px 0 6px">Licence (excerpt)</h4><pre class="json">${esc(s.license)}</pre>` : ''}` });
    };
    redraw = (r) => { if (ctx.alive()) draw(r); };
    await draw(true);
    ctx.poll(async () => { if (!pulling.size) await draw(true); }, 15000);
    if (ctx.query.pull && manage) { const n = ctx.query.pull; history.replaceState(null, '', '#/models'); startPull(n); }
  },
};

// ---------------- Deployments ----------------
const KEEP = [['5m', '5 minutes'], ['30m', '30 minutes'], ['2h', '2 hours'], ['24h', '24 hours'], ['-1', 'Never unload']];
const GPU_MODES = [['auto', 'Automatic: use the GPU when it fits'], ['max', 'Maximum: put every layer on the GPU'], ['cpu', 'CPU only']];

const deployments = {
  title: 'Deployments', perm: 'deployments.read',
  async render(ctx) {
    const { root, can } = ctx;
    const manage = can('deployments.manage');
    root.innerHTML = pagehead('Deployments', 'A deployment is a model loaded on a node with fixed settings. People chat with deployments; administrators watch and control them here.', manage ? '<button class="btn primary" data-act="new">New deployment</button>' : '') + '<div id="dl"></div>';
    const box = root.querySelector('#dl');
    let list = [];
    const busy = new Set();
    const draw = () => {
      if (!ctx.alive()) return;
      box.innerHTML = list.length ? `<div class="card"><div class="tblwrap"><table class="tbl"><thead><tr><th>Name</th><th>Model</th><th>Node</th><th>Status</th><th>GPU</th><th>Context</th><th>Speed</th><th>Requests</th><th></th></tr></thead><tbody>${list.map((d) => {
        const b = busy.has(d.id);
        return `<tr><td><b>${esc(d.name)}</b>${d.error ? `<div class="hint" style="color:var(--bad)">${esc(d.error)}</div>` : ''}</td><td class="mono">${esc(d.model)}</td><td>${esc(d.nodeName)}</td><td>${statusBadge(d.status)}</td><td style="min-width:120px">${d.status === 'running' ? `${meter(d.gpuShare || 0, d.gpuShare >= 99 ? 'ok' : 'warn')}<span class="mono">${d.gpuShare}% VRAM</span> <span class="faint">(${esc(d.gpuMode)})</span>` : `<span class="faint">${esc(d.gpuMode)}</span>`}</td><td class="mono">${num(d.numCtx)}</td><td class="mono">${d.lastBenchmark && d.lastBenchmark.avgTps != null ? d.lastBenchmark.avgTps + ' tok/s' : '-'}</td><td>${num(d.stats ? d.stats.requests : 0)}</td><td class="acts">${manage ? `${d.status === 'running' ? `<button class="btn sm" ${b ? 'disabled' : ''} data-act="op" data-op="stop" data-id="${d.id}">Stop</button><button class="btn sm" ${b ? 'disabled' : ''} data-act="op" data-op="restart" data-id="${d.id}">Restart</button>` : `<button class="btn sm primary" ${b ? 'disabled' : ''} data-act="op" data-op="start" data-id="${d.id}">Start</button>`}<button class="btn sm" ${b || d.status !== 'running' ? 'disabled' : ''} data-act="bench" data-id="${d.id}" title="Measures speed only, not answer quality">Benchmark</button><button class="btn sm" data-act="edit" data-id="${d.id}">Edit</button><button class="btn sm danger" data-act="rm" data-id="${d.id}">Delete</button>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div></div>` : `<div class="card">${empty('No deployments yet', manage ? 'Download a model, then create a deployment to put it to work.' : 'Nothing has been deployed yet.', manage ? '<button class="btn primary" data-act="new">New deployment</button>' : '')}</div>`;
    };
    const load = async () => { list = await get('/api/deployments'); draw(); };
    ctx.poll(load, 4000);
    await load();

    async function form(cur = {}) {
      const [nodes, ms] = await Promise.all([get('/api/nodes').catch(() => [{ id: 'local', name: 'This host' }]), get('/api/models').then((r) => r.models).catch(() => [])]);
      const cat = await get('/api/catalog').catch(() => ({ models: [] }));
      const tags = [...new Set([...ms.map((m) => m.name), ...cat.models.map((m) => m.tag)])];
      const edit = !!cur.id;
      modal({
        title: edit ? `Edit ${cur.name}` : 'New deployment', wide: true,
        html: `<div class="row">${field('Name', `<input class="input" name="name" value="${esc(cur.name || '')}" placeholder="Support assistant">`)}${field('Node', `<select class="select" name="node">${options(nodes.map((n) => [n.id === 'local' ? 'local' : n.id, n.name]), cur.nodeId || 'local')}</select>`)}</div>
          ${field('Model', `<input class="input mono" name="model" list="mt" value="${esc(cur.model || '')}" placeholder="gemma3:4b">`, ms.length ? 'Installed models are listed first. A model that is not installed must be downloaded in Models before the deployment can start.' : 'No model is installed yet. Download one in Models first.')}<datalist id="mt">${tags.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
          <div class="row">${field('Context length (tokens)', `<input class="input" name="numCtx" type="number" min="512" step="512" value="${cur.numCtx || 4096}">`, 'Longer context uses more VRAM.')}${field('Temperature', `<input class="input" name="temperature" type="number" min="0" max="2" step="0.1" value="${cur.temperature ?? 0.7}">`)}</div>
          <div class="row">${field('GPU use', `<select class="select" name="gpuMode">${options(GPU_MODES, cur.gpuMode || 'auto')}</select>`)}${field('Keep loaded for', `<select class="select" name="keepAlive">${options(KEEP, cur.keepAlive || '30m')}</select>`, 'Idle time before the model leaves memory.')}</div>
          ${field('System prompt', `<textarea class="textarea" name="systemPrompt" placeholder="Optional. Sets the assistant's role and tone for everyone who uses this deployment.">${esc(cur.systemPrompt || '')}</textarea>`)}
          ${edit ? '<p class="hint">If the deployment is running and you change the model, context, GPU use or keep-alive, it is reloaded automatically.</p>' : '<label class="check"><input type="checkbox" name="start" checked> Start it now</label>'}`,
        actions: [{ label: edit ? 'Save changes' : 'Create deployment', primary: true, onClick: async (m) => {
          const body = { name: val(m, 'name'), node: val(m, 'node'), model: val(m, 'model'), numCtx: Number(val(m, 'numCtx')), temperature: Number(val(m, 'temperature')), gpuMode: val(m, 'gpuMode'), keepAlive: val(m, 'keepAlive'), systemPrompt: val(m, 'systemPrompt') };
          if (edit) { const r = await put('/api/deployments/' + cur.id, body); if (r.restartError) toast('Saved, but reloading failed: ' + r.restartError, 'bad'); else toast('Saved'); }
          else { body.start = val(m, 'start'); const r = await post('/api/deployments', body); if (r.startError) toast('Created, but it did not start: ' + r.startError, 'bad'); else toast(body.start ? 'Deployment started' : 'Deployment created'); }
          load();
        } }],
      });
    }
    ctx.acts.new = () => form({ model: ctx.query.model || '' });
    ctx.acts.edit = (t) => form(list.find((d) => d.id === t.dataset.id));
    ctx.acts.op = async (t) => {
      const id = t.dataset.id, op = t.dataset.op;
      busy.add(id); draw();
      try { await post(`/api/deployments/${id}/${op}`); toast(op === 'stop' ? 'Stopped' : op === 'start' ? 'Started' : 'Restarted'); }
      finally { busy.delete(id); load(); }
    };
    ctx.acts.bench = async (t) => {
      const id = t.dataset.id;
      busy.add(id); draw(); toast('Benchmark running. This takes a few moments.');
      try {
        const r = await post(`/api/deployments/${id}/benchmark`);
        modal({ title: 'Benchmark result', html: `<p class="mute" style="margin-bottom:10px">Speed only. It says nothing about the quality of the answers.</p><div class="tiles">${tile('Average speed', `${r.avgTps ?? '-'} tok/s`)}${tile('Average latency', `${r.avgLatencyMs} ms`)}</div><div class="tblwrap"><table class="tbl"><thead><tr><th>Prompt</th><th>Prompt tokens</th><th>Output tokens</th><th>tok/s</th><th>Total ms</th></tr></thead><tbody>${r.results.map((x) => `<tr><td>${x.prompt}</td><td>${x.promptTokens}</td><td>${x.completionTokens}</td><td>${x.tps ?? '-'}</td><td>${x.totalMs}</td></tr>`).join('')}</tbody></table></div>` });
      } finally { busy.delete(id); load(); }
    };
    ctx.acts.rm = async (t) => {
      const d = list.find((x) => x.id === t.dataset.id);
      if (!(await confirmBox({ title: 'Delete deployment', message: `Delete ${d.name}? It is unloaded from memory. The model files stay on disk.`, confirm: 'Delete', danger: true }))) return;
      await del('/api/deployments/' + d.id); toast('Deployment deleted'); load();
    };
    if (ctx.query.new && manage) { history.replaceState(null, '', '#/deployments'); ctx.acts.new(); }
  },
};

export const views = { models, deployments };
