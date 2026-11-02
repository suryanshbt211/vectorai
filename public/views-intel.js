import { esc, get, post, put, del, stream, downloadFile, toast, modal, confirmBox, badge, meter, bytes, ago, num, statusBadge, pagehead, empty, field, options, val, readFileText } from './ui.js';
import { C, tip, fmtN, fmtMs, columnChart, hbars } from './charts.js';
import { kpi, card } from './views-insights.js';
import { views as oldModels } from './views-models.js';

const PRESETS = {
  general: ['General assistant', 'You help employees find answers in internal documents. Cite the excerpts you use as [1], [2]. If the documents do not answer the question, say so instead of guessing.'],
  compliance: ['Compliance reviewer', 'You support the compliance team. Be precise and conservative, cite internal excerpts, and state clearly what evidence or policy is missing. You do not give legal advice.'],
  drafting: ['Drafting assistant', 'You draft clear, professional text such as emails, summaries and reports, following the organization\'s policies. Keep drafts concise and mark anything you are unsure about.'],
};
const fitTag = (m, vram) => (!m.sizeGB ? '<span class="tag">size: see Ollama</span>' : !vram ? `<span class="tag">${m.sizeGB} GB</span>` : m.sizeGB * 1.25 <= vram ? `<span class="tag" style="color:var(--ok)">${m.sizeGB} GB · fits your GPU</span>` : `<span class="tag" style="color:var(--warn)">${m.sizeGB} GB · partly on CPU</span>`);

// ======================= Models: choose what to run =======================
const models = {
  title: 'Models', perm: 'models.read',
  async render(ctx) {
    if (ctx.scope === 'platform') return oldModels.models.render(ctx);
    const { root, can } = ctx;
    const manage = can('models.manage') && can('deployments.manage');
    const pulling = new Map();
    const draw = async () => {
      const [cat, inst, deps, custom, sys, met] = await Promise.all([get('/api/catalog'), get('/api/models').catch(() => ({ models: [] })), can('deployments.read') ? get('/api/deployments') : [], get('/api/models/custom').catch(() => []), can('infra.read') ? get('/api/system').catch(() => null) : null, can('deployments.read') ? get('/api/metrics?range=30d').catch(() => null) : null]);
      const dm = new Map(((met && met.byDeployment) || []).map((g) => [g.key, g]));
      if (!ctx.alive()) return;
      const have = new Set(inst.models.map((m) => m.name));
      const vram = sys && sys.gpu.available ? Math.max(...sys.gpu.gpus.map((g) => g.memTotalMiB)) / 1024 : 0;
      let h = pagehead('Models', 'Choose the models your organization runs. They are stored and executed on your own hardware; nothing you ask leaves your network.', manage ? '<a class="btn" href="#/deployments">Advanced settings</a>' : '');
      h += `<div class="lp-sec"><h3>In use</h3>${deps.length ? `<div class="grid3">${deps.map((d) => `<div class="card"><div class="ch"><div><div class="tt">${esc(d.name)}</div><div class="st mono">${esc(d.model)}</div></div><span class="sp"></span>${statusBadge(d.status)}</div><div class="row" style="gap:18px;font-size:12.5px;color:var(--mute);margin-bottom:12px"><span><b style="color:var(--ink)">${num(d.stats ? d.stats.requests : 0)}</b> requests</span><span><b style="color:var(--ink)">${(dm.get(d.id) || {}).tps ?? (d.lastBenchmark && d.lastBenchmark.avgTps) ?? '-'}</b> tok/s</span><span><b style="color:var(--ink)">${fmtMs((dm.get(d.id) || {}).p50)}</b> median</span>${d.status === 'running' ? `<span><b style="color:var(--ink)">${d.gpuShare ?? 0}%</b> on GPU</span>` : ''}</div><div class="row">${can('chat.use') ? '<a class="btn sm primary" href="#/chat">Ask</a>' : ''}${manage ? (d.status === 'running' ? `<button class="btn sm" data-act="op" data-op="stop" data-id="${d.id}">Stop</button>` : `<button class="btn sm" data-act="op" data-op="start" data-id="${d.id}">Start</button>`) : ''}</div></div>`).join('')}</div>` : `<div class="card">${empty('No model in use yet', manage ? 'Pick one below. Gemma 3 4B is a good first choice for a single GPU or a strong CPU.' : 'Ask an administrator to add a model.')}</div>`}</div>`;
      if (custom.length) h += `<div class="lp-sec"><h3>Your own models</h3><div class="grid3">${custom.map((m) => `<div class="card"><div class="ch"><div><div class="tt mono">${esc(m.name)}</div><div class="st">built from ${esc(m.from)} by ${esc(m.byName || '')} · ${ago(m.createdAt)}</div></div></div><p class="note" style="margin:0 0 10px">Instructions hash ${esc(m.systemSha256.slice(0, 12))}… · ${m.docIds.length} documents referenced</p>${manage && !deps.some((d) => d.model === m.name) ? `<button class="btn sm primary" data-act="use" data-tag="${esc(m.name)}" data-custom="1">Use this model</button>` : deps.some((d) => d.model === m.name) ? badge('In use', 'ok') : ''}</div>`).join('')}</div></div>`;
      if (pulling.size) h += `<div class="card" style="margin-bottom:16px"><div class="tt" style="font-weight:600;margin-bottom:8px">Downloading</div>${[...pulling.entries()].map(([n, p]) => `<div style="margin-bottom:8px"><div class="row between"><span class="mono">${esc(n)}</span><span class="faint">${esc(p.status)}${p.total ? ` · ${bytes(p.done)} of ${bytes(p.total)}` : ''}</span></div>${meter(p.pct, 'ok')}</div>`).join('')}</div>`;
      const fams = [...new Set(cat.models.map((m) => m.family))];
      h += `<div class="lp-sec"><h3>Add a model</h3><p class="mute" style="margin:-4px 0 12px">${sys && sys.hardware ? `${esc(sys.hardware.summary)}. Inference: ${esc(sys.hardware.accelerator)}.` : ''}${vram ? ` Largest dedicated GPU: ${vram.toFixed(1)} GiB.` : ' Smaller models answer faster on this hardware.'}</p>`;
      for (const f of fams) h += `<h4 style="margin:14px 0 8px;font-size:13px;color:var(--mute)">${esc(f)}</h4><div class="mcards">${cat.models.filter((m) => m.family === f).map((m) => { const inUse = deps.some((d) => d.model === m.tag); return `<div class="mcard ${m.recommended ? 'rec' : ''}"><div class="row between"><h4>${esc(m.tag)}</h4>${m.recommended ? badge('Recommended', 'ok') : have.has(m.tag) ? badge('Downloaded') : ''}</div><div class="meta"><span class="tag">${esc(m.params)}</span>${m.ctx ? `<span class="tag">${esc(m.ctx)} context</span>` : ''}${fitTag(m, vram)}</div><p>${esc(m.note)}</p>${inUse ? badge('In use', 'ok') : pulling.has(m.tag) ? badge('Downloading…', 'warn') : manage ? `<button class="btn sm primary" data-act="use" data-tag="${esc(m.tag)}">Use this model</button>` : ''}</div>`; }).join('')}</div>`;
      h += '</div>';
      root.innerHTML = h;
    };
    ctx.acts.op = async (b) => { b.disabled = true; try { await post(`/api/deployments/${b.dataset.id}/${b.dataset.op}`); toast(b.dataset.op === 'stop' ? 'Stopped' : 'Started'); } finally { draw(); } };
    ctx.acts.use = (b) => {
      const tag = b.dataset.tag;
      modal({ title: `Use ${tag}`, html: `<p class="mute" style="margin-bottom:12px">Vector downloads the model if needed, loads it on this server and makes it available in the Assistant. You can fine-tune the settings later.</p>${field('Name people will see', `<input class="input" name="name" value="${esc(b.dataset.custom ? tag.split(':')[0].replace(/-/g, ' ') : tag.split(':')[0].replace(/(\d)/, ' $1').replace(/^./, (c) => c.toUpperCase()) + ' assistant')}">`)}${field('What it is for', `<select class="select" name="preset">${options(Object.entries(PRESETS).map(([k, [l]]) => [k, l]), 'general')}</select>`)}`,
        actions: [{ label: 'Download and start', primary: true, onClick: async (m) => {
          const name = val(m, 'name'), preset = PRESETS[val(m, 'preset')];
          const inst = await get('/api/models').catch(() => ({ models: [] }));
          const go = async () => { const r = await post('/api/deployments', { name, model: tag, node: 'local', systemPrompt: preset[1], temperature: val(m, 'preset') === 'compliance' ? 0.1 : 0.3, start: true }); toast(r.startError ? 'Added, but it did not start: ' + r.startError : `${name} is running`, r.startError ? 'bad' : 'ok'); draw(); };
          if (inst.models.some((x) => x.name === tag)) { await go(); return; }
          pulling.set(tag, { status: 'starting', pct: 0 }); draw();
          (async () => {
            try {
              await stream('/api/models/pull', { name: tag }, (ev) => { if (ev.error) throw new Error(ev.error); const p = pulling.get(tag); p.status = ev.status || p.status; if (ev.total) { p.pct = Math.round((ev.completed / ev.total) * 100); p.done = ev.completed; p.total = ev.total; } if (ctx.alive()) draw(); });
              pulling.delete(tag); await go();
            } catch (e) { pulling.delete(tag); toast(`${tag}: ${e.message}`, 'bad'); draw(); }
          })();
        } }] });
    };
    await draw();
  },
};

// ======================= Knowledge: upload, tag, see usage =======================
const ACCEPT = '.txt,.md,.markdown,.csv,.json,.html,.htm,.log,.xml,.yaml,.yml';
const strip = (name, t) => (/\.html?$/i.test(name) ? t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : t);
const tagsHtml = (t) => (t || []).map((x) => `<span class="tagchip">${esc(x)}</span>`).join(' ');
const knowledge = {
  title: 'Knowledge', perm: 'knowledge.read',
  async render(ctx) {
    const { root, can, me } = ctx;
    const manage = can('knowledge.manage'), all = can('knowledge.all');
    const F = { q: '', tag: '', use: '' };
    let docs = [], usage = new Map();
    const draw = () => {
      if (!ctx.alive()) return;
      const tags = [...new Set(docs.flatMap((d) => d.tags || []))].sort();
      const list = docs.filter((d) => (!F.q || (d.title + ' ' + (d.tags || []).join(' ')).toLowerCase().includes(F.q)) && (!F.tag || (d.tags || []).includes(F.tag)) && (!F.use || (d.useFor || []).includes(F.use)));
      const forTrain = docs.filter((d) => (d.useFor || []).includes('training')).length;
      root.innerHTML = pagehead('Knowledge', 'Documents that make your AI yours. Use them for answers (retrieval with citations) and as source material for training examples. People only see their own department\'s documents plus those shared with everyone.', '<a class="btn" href="#/graph">Knowledge map</a>') +
        `<div class="kpis"><div class="kpi"><div class="k">Documents</div><div class="v">${docs.length}</div></div><div class="kpi"><div class="k">Used for answers</div><div class="v">${docs.filter((d) => (d.useFor || ['retrieval']).includes('retrieval')).length}</div></div><div class="kpi"><div class="k">Used for training</div><div class="v">${forTrain}</div></div><div class="kpi"><div class="k">Tags</div><div class="v">${tags.length}</div></div>${usage.size ? `<div class="kpi"><div class="k">Never retrieved</div><div class="v">${docs.filter((d) => !(usage.get(d.id) || {}).retrievals).length}</div><div class="s">last 30 days</div></div>` : ''}</div>` +
        (manage ? `<div class="drop" id="drop" tabindex="0" role="button"><b>Drop documents here or click to upload</b>Text, Markdown, CSV, JSON or HTML. You choose tags, department and how the AI may use each one before it is added.<input type="file" id="fin" accept="${ACCEPT}" multiple hidden></div><div class="row" style="margin:8px 0 18px"><button class="btn sm ghost" data-act="paste">Or paste text</button><span class="note" style="margin:0">PDF and Word: export to text first. Uploads are hashed (SHA-256) and recorded in the audit trail.</span></div>` : '') +
        `<div class="filterbar"><div class="fi" style="flex:1"><label>Search</label><input class="input" data-inp="q" value="${esc(F.q)}" placeholder="Title or tag"></div><div class="fi"><label>Tag</label><select class="select" data-chg="tag"><option value="">All tags</option>${options(tags.map((t) => [t, t]), F.tag)}</select></div><div class="fi"><label>Used for</label><select class="select" data-chg="use"><option value="">Anything</option>${options([['retrieval', 'Answers'], ['training', 'Training']], F.use)}</select></div></div>` +
        (list.length ? `<div class="lrwrap"><table class="lr"><thead><tr><th>Document</th><th>Tags</th><th>Department</th><th>Used for</th>${usage.size ? '<th>Retrieved (30d)</th><th>Last used</th>' : ''}<th>Training examples</th><th>Added</th><th></th></tr></thead><tbody>${list.map((d) => { const u = usage.get(d.id) || {}; return `<tr data-act="view" data-id="${d.id}"><td><b>${esc(d.title)}</b><div class="note" style="margin:2px 0 0">${num(d.chars)} chars · sha256 ${esc(d.sha256.slice(0, 10))}…</div></td><td>${tagsHtml(d.tags) || '<span class="faint">-</span>'}</td><td>${d.department === '*' ? 'Everyone' : esc(d.department)}</td><td>${(d.useFor || ['retrieval']).map((x) => `<span class="sig ${x === 'training' ? 'info' : 'ok'}">${x === 'training' ? 'Training' : 'Answers'}</span>`).join(' ')}</td>${usage.size ? `<td style="text-align:right">${u.retrievals || 0}</td><td class="faint">${u.lastUsed ? ago(u.lastUsed) : 'never'}</td>` : ''}<td style="text-align:right">${u.training || 0}</td><td class="faint">${esc(d.createdBy)} · ${ago(d.createdAt)}</td><td class="acts">${manage && (all || d.department === me.department) ? `<button class="btn sm" data-act="edit" data-id="${d.id}">Edit</button><button class="btn sm danger" data-act="rm" data-id="${d.id}">Delete</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : `<div class="card">${empty(docs.length ? 'Nothing matches' : 'No documents yet', docs.length ? 'Change the filters.' : manage ? 'Upload policies, procedures and FAQs to ground answers and build training data.' : 'Nothing has been shared with your department yet.')}</div>`);
      const drop = root.querySelector('#drop');
      if (drop) {
        const fin = root.querySelector('#fin');
        drop.onclick = () => fin.click();
        drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fin.click(); } };
        drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
        drop.ondragleave = () => drop.classList.remove('over');
        drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); queue([...e.dataTransfer.files]); };
        fin.onchange = () => queue([...fin.files]);
      }
    };
    const load = async () => {
      const [d, m] = await Promise.all([get('/api/knowledge'), can('deployments.read') ? get('/api/metrics?range=30d').catch(() => null) : null]);
      docs = d; usage = new Map((m ? m.documents : []).map((x) => [x.id, x])); draw();
    };
    async function queue(files, pasted) {
      const items = [];
      for (const f of files) { if (f.size > 2 * 1024 * 1024) { toast(`${f.name} is over 2 MB`, 'bad'); continue; } try { items.push({ name: f.name, title: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), text: strip(f.name, await readFileText(f)) }); } catch (e) { toast(e.message, 'bad'); } }
      if (pasted) items.push({ name: '', title: '', text: '' });
      if (!items.length) return;
      const known = [...new Set(docs.flatMap((d) => d.tags || []))];
      modal({ title: items.length > 1 ? `Add ${items.length} documents` : 'Add document', wide: true,
        html: `${items.map((it, i) => `<div class="card" style="background:var(--s2);margin-bottom:10px"><div class="row">${field('Title', `<input class="input" name="t${i}" value="${esc(it.title)}">`)}${field('Department', all ? `<input class="input" name="d${i}" value="*" list="depts" placeholder="* = everyone">` : `<input class="input" value="${esc(me.department || '')}" disabled>`)}</div>${field('Tags', `<input class="input" name="g${i}" placeholder="policy, hipaa, retention" list="tagl">`, 'Comma separated. Tags help people filter and help you choose training material.')}<div class="row" style="gap:16px;margin-bottom:6px"><label class="check"><input type="checkbox" name="r${i}" checked> Use for answers (retrieval with citations)</label><label class="check"><input type="checkbox" name="x${i}"> Use for training examples</label></div>${pasted && !it.name ? field('Text', `<textarea class="textarea" name="p${i}" style="min-height:180px"></textarea>`) : `<div class="note">${esc(it.name)} · ${num(it.text.length)} characters</div>`}</div>`).join('')}<datalist id="tagl">${known.map((t) => `<option value="${esc(t)}">`).join('')}</datalist><datalist id="depts"><option value="*">${[...new Set(docs.map((d) => d.department).filter((x) => x !== '*'))].map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`,
        actions: [{ label: 'Add', primary: true, onClick: async (m) => {
          for (let i = 0; i < items.length; i++) {
            const useFor = [m.$(`[name=r${i}]`).checked ? 'retrieval' : null, m.$(`[name=x${i}]`).checked ? 'training' : null].filter(Boolean);
            await post('/api/knowledge', { title: val(m, 't' + i), department: all ? val(m, 'd' + i) : undefined, text: items[i].name ? items[i].text : val(m, 'p' + i), tags: val(m, 'g' + i), useFor: useFor.length ? useFor : ['retrieval'], fileName: items[i].name || null });
          }
          toast(items.length > 1 ? `${items.length} documents added` : 'Document added'); load();
        } }] });
    }
    ctx.acts.paste = () => queue([], true);
    ctx.inp.q = (t) => { F.q = t.value.toLowerCase(); const p = t.selectionStart; draw(); const n = root.querySelector('[data-inp=q]'); n.focus(); n.setSelectionRange(p, p); };
    ctx.chg.tag = (t) => { F.tag = t.value; draw(); };
    ctx.chg.use = (t) => { F.use = t.value; draw(); };
    ctx.acts.view = async (t, e) => { if (e.target.closest('button')) return; const d = await get('/api/knowledge/' + t.dataset.id); modal({ title: d.title, wide: true, html: `<div class="row" style="margin-bottom:10px">${tagsHtml(d.tags)}<span class="faint">${esc(d.department === '*' ? 'Everyone' : d.department)} · sha256 <span class="mono">${esc(d.sha256)}</span></span></div><div class="json" style="max-height:480px">${esc(d.text)}</div>` }); };
    ctx.acts.edit = (t) => {
      const d = docs.find((x) => x.id === t.dataset.id);
      modal({ title: 'Edit document', html: `${field('Title', `<input class="input" name="title" value="${esc(d.title)}">`)}${field('Tags', `<input class="input" name="tags" value="${esc((d.tags || []).join(', '))}">`)}${all ? field('Department', `<input class="input" name="dept" value="${esc(d.department)}">`) : ''}<div class="row" style="gap:16px"><label class="check"><input type="checkbox" name="r" ${(d.useFor || ['retrieval']).includes('retrieval') ? 'checked' : ''}> Use for answers</label><label class="check"><input type="checkbox" name="x" ${(d.useFor || []).includes('training') ? 'checked' : ''}> Use for training</label></div>`,
        actions: [{ label: 'Save', primary: true, onClick: async (m) => { const useFor = [m.$('[name=r]').checked ? 'retrieval' : null, m.$('[name=x]').checked ? 'training' : null].filter(Boolean); await put('/api/knowledge/' + d.id, { title: val(m, 'title'), tags: val(m, 'tags'), useFor, ...(all ? { department: val(m, 'dept') } : {}) }); toast('Saved'); load(); } }] });
    };
    ctx.acts.rm = async (t) => { const d = docs.find((x) => x.id === t.dataset.id); if (!(await confirmBox({ title: 'Delete document', message: `Delete "${d.title}"? The deletion is recorded in the audit trail.`, confirm: 'Delete', danger: true }))) return; await del('/api/knowledge/' + d.id); toast('Deleted'); load(); };
    await load();
  },
};

// ======================= Intelligence: evals, training data, feedback, own models =======================
const intelligence = {
  title: 'Intelligence', perm: 'models.read', scope: 'org',
  async render(ctx) {
    const { root, can } = ctx;
    const manage = can('models.manage');
    let tab = ctx.query.tab || 'evals';
    const poll = new Set();
    const draw = async () => {
      const [evals, train, fb, custom, docs, deps, inst] = await Promise.all([get('/api/evals'), get('/api/training'), get('/api/feedback'), get('/api/models/custom'), get('/api/knowledge').catch(() => []), get('/api/workspace/deployments').catch(() => []), get('/api/models').catch(() => ({ models: [] }))]);
      if (!ctx.alive()) return;
      const appr = train.filter((t) => t.status === 'approved').length, pend = train.filter((t) => t.status === 'pending').length;
      const runs = evals.flatMap((e) => e.runs.map((r) => ({ ...r, evalName: e.name }))).filter((r) => r.status === 'done');
      const best = runs.length ? Math.max(...runs.map((r) => r.score)) : null;
      const arrow = '<div class="ar"><svg width="22" height="12" viewBox="0 0 22 12"><path d="M0 6h18M14 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></div>';
      let h = pagehead('Own your intelligence', 'Turn your documents and daily use into a model that knows how your organization works: write evaluations, build training data from documents and real answers, build your own model, and measure every change before it goes live.');
      h += `<div class="loop" style="margin-bottom:18px"><div class="st"><div class="l">Documents</div><div class="n">${docs.filter((d) => (d.useFor || []).includes('training')).length}</div><div class="d">marked for training</div></div>${arrow}<div class="st"><div class="l">Training data</div><div class="n">${appr}</div><div class="d">approved · ${pend} awaiting review</div></div>${arrow}<div class="st"><div class="l">Own models</div><div class="n">${custom.length}</div><div class="d">built on open weights</div></div>${arrow}<div class="st"><div class="l">Evaluations</div><div class="n">${best != null ? best + '%' : '-'}</div><div class="d">best score · ${runs.length} runs</div></div>${arrow}<div class="st"><div class="l">Production feedback</div><div class="n">${fb.filter((f) => f.rating === 'up').length}<span class="faint" style="font-size:16px"> / ${fb.filter((f) => f.rating === 'down').length}</span></div><div class="d">helpful / not helpful</div></div></div>`;
      const tabs = [['evals', `Evaluations (${evals.length})`], ['training', `Training data (${train.length})`], ['feedback', `Feedback (${fb.length})`], ['models', `Own models (${custom.length})`]];
      h += `<div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}</div>`;
      if (tab === 'evals') {
        h += `<div class="row" style="margin-bottom:12px"><p class="mute" style="flex:1;margin:0">An evaluation is a set of real questions with the facts a correct answer must contain. Run it on every model you consider, so a new base model only goes live when it does at least as well on your work.</p>${manage ? '<button class="btn primary" data-act="newEval">New evaluation set</button>' : ''}</div>`;
        if (runs.length) h += card('Scores by model', 'Every completed run, newest last', columnChart({ labels: runs.slice().reverse().slice(-12).map((r) => r.model.split(':')[0]), tipTitles: runs.slice().reverse().slice(-12).map((r) => `${r.evalName} · ${r.model}`), series: [{ name: 'Score %', values: runs.slice().reverse().slice(-12).map((r) => r.score), color: 'var(--c3)' }], height: 200, width: 1100, vfmt: (v) => v + '%' }), { cls: '' }) + '<div style="height:14px"></div>';
        h += evals.length ? evals.map((e) => `<div class="card" style="margin-bottom:12px"><div class="ch"><div><div class="tt">${esc(e.name)}</div><div class="st">${e.cases.length} cases${e.description ? ' · ' + esc(e.description) : ''}</div></div><span class="sp"></span>${manage ? `<select class="select" style="width:auto" id="dep-${e.id}">${options(deps.map((d) => [d.id, `${d.name} · ${d.model}`]), (deps.find((d) => d.status === 'running') || deps[0] || {}).id)}</select><button class="btn sm primary" data-act="runEval" data-id="${e.id}" ${deps.length ? '' : 'disabled'}>Run</button><button class="btn sm" data-act="editEval" data-id="${e.id}">Edit</button><button class="btn sm danger" data-act="delEval" data-id="${e.id}">Delete</button>` : ''}</div>${e.runs.length ? `<div class="tblwrap"><table class="tbl mtable"><thead><tr><th>When</th><th>Model</th><th>Deployment</th><th>Status</th><th class="num">Score</th><th class="num">Passed</th><th class="num">tok/s</th><th class="num">Avg time</th><th></th></tr></thead><tbody>${e.runs.map((r) => `<tr><td class="faint">${ago(r.startedAt)}</td><td class="mono">${esc(r.model)}</td><td>${esc(r.deploymentName)}</td><td>${r.status === 'running' ? `${meter((r.done / r.total) * 100, 'ok')}<span class="note">${r.done}/${r.total}</span>` : r.status === 'done' ? badge('Done', 'ok') : badge(r.status, 'bad')}</td><td class="num"><b>${r.score ?? '-'}${r.score != null ? '%' : ''}</b></td><td class="num">${r.status === 'done' ? `${r.passed}/${r.total}` : '-'}</td><td class="num">${r.avgTps ?? '-'}</td><td class="num">${fmtMs(r.avgMs)}</td><td class="acts">${r.status !== 'running' ? `<button class="btn sm" data-act="runRes" data-id="${r.id}">Results</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mute">Not run yet.</p>'}</div>`).join('') : `<div class="card">${empty('No evaluation sets yet', 'Write 5 to 20 questions your people really ask, with the key facts a right answer must include.', manage ? '<button class="btn primary" data-act="newEval">New evaluation set</button>' : '')}</div>`;
        evals.forEach((e) => e.runs.filter((r) => r.status === 'running').forEach((r) => poll.add(r.id)));
      } else if (tab === 'training') {
        h += `<div class="kpis"><div class="kpi st-ok"><div class="k">Approved</div><div class="v">${appr}</div></div><div class="kpi"><div class="k">Awaiting review</div><div class="v">${pend}</div></div><div class="kpi"><div class="k">From documents</div><div class="v">${train.filter((t) => t.source === 'generated').length}</div></div><div class="kpi"><div class="k">From real answers</div><div class="v">${train.filter((t) => t.source === 'feedback').length}</div></div></div>`;
        h += `<div class="row" style="margin-bottom:12px"><p class="mute" style="flex:1;margin:0">Examples are question and answer pairs in the standard chat format. A person approves each one. Export the approved set as JSONL to fine-tune (for example a LoRA adapter) on a GPU machine, then load the result into Ollama with an ADAPTER line in a Modelfile.</p>${manage ? `<button class="btn" data-act="gen" ${deps.length ? '' : 'disabled'}>Generate from a document</button><button class="btn" data-act="addTr">Add example</button><button class="btn primary" data-act="export" ${appr ? '' : 'disabled'}>Export approved (JSONL)</button>` : ''}</div><div id="jobmsg"></div>`;
        h += train.length ? `<div class="lrwrap"><table class="lr"><thead><tr><th>Question</th><th>Answer</th><th>Source</th><th>Status</th><th>Added</th><th></th></tr></thead><tbody>${train.map((t) => `<tr><td style="max-width:320px">${esc(t.messages[0].content.slice(0, 160))}</td><td style="max-width:360px" class="mute">${esc(t.messages[1].content.slice(0, 180))}</td><td>${t.source === 'generated' ? `<span class="sig info">document</span><div class="note" style="margin:2px 0 0">${esc(t.docTitle || '')}</div>` : t.source === 'feedback' ? '<span class="sig ok">real answer</span>' : '<span class="sig">manual</span>'}</td><td>${t.status === 'approved' ? badge('Approved', 'ok') : t.status === 'rejected' ? badge('Rejected', 'bad') : badge('Review', 'warn')}</td><td class="faint">${esc(t.createdByName || '')} · ${ago(t.createdAt)}</td><td class="acts">${manage ? `${t.status !== 'approved' ? `<button class="btn sm" data-act="trSt" data-id="${t.id}" data-s="approved">Approve</button>` : ''}${t.status !== 'rejected' ? `<button class="btn sm" data-act="trSt" data-id="${t.id}" data-s="rejected">Reject</button>` : ''}<button class="btn sm" data-act="trEdit" data-id="${t.id}">Edit</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : `<div class="card">${empty('No training data yet', 'Generate draft examples from a document, add your own, or promote answers people rated helpful.')}</div>`;
      } else if (tab === 'feedback') {
        h += `<p class="mute" style="margin-bottom:12px">People rate answers in the Assistant. Text is only visible here when they choose to share it for improvement; otherwise only the rating and hashes are kept.</p>`;
        h += fb.length ? `<div class="lrwrap"><table class="lr"><thead><tr><th>When</th><th>Rating</th><th>Deployment</th><th>Question and answer</th><th>Note</th><th></th></tr></thead><tbody>${fb.map((f) => `<tr><td class="faint">${ago(f.ts)}</td><td>${f.rating === 'up' ? badge('Helpful', 'ok') : badge('Not helpful', 'bad')}</td><td>${esc(f.deploymentName)}<div class="note mono" style="margin:0">${esc(f.model || '')}</div></td><td style="max-width:460px">${f.shared ? `<b>${esc(f.question.slice(0, 140))}</b><div class="mute">${esc(f.answer.slice(0, 200))}</div><div class="note" style="margin:2px 0 0">shared by ${esc(f.userName || '')}</div>` : `<span class="faint">Not shared · answer hash ${esc(f.answerSha256.slice(0, 12))}…</span>`}</td><td>${esc(f.note || '')}</td><td class="acts">${manage && f.shared ? `<button class="btn sm" data-act="promote" data-id="${f.id}">Add to training</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : `<div class="card">${empty('No feedback yet', 'Ratings appear here as people use the Assistant.')}</div>`;
      } else {
        h += `<div class="cols2"><div>${custom.length ? custom.map((m) => `<div class="card" style="margin-bottom:12px"><div class="ch"><div><div class="tt mono">${esc(m.name)}</div><div class="st">from ${esc(m.from)} · ${esc(m.byName || '')} · ${ago(m.createdAt)}</div></div></div><dl class="kv"><dt>Temperature</dt><dd>${m.temperature}</dd><dt>Context</dt><dd>${num(m.numCtx)} tokens</dd><dt>Instructions</dt><dd class="mute" style="white-space:pre-wrap">${esc(m.system.slice(0, 400))}</dd><dt>Training examples</dt><dd>${m.approvedTraining} approved at build time</dd></dl><div class="row" style="margin-top:10px"><a class="btn sm" href="#/models">Use in Models</a><button class="btn sm" data-act="evalModel" data-tag="${esc(m.name)}">Evaluate</button></div></div>`).join('') : `<div class="card">${empty('No own models yet', 'Build one on top of an open-weight base model with your organization\'s instructions and defaults.')}</div>`}</div>
          ${manage ? `<div class="card"><div class="ch"><div><div class="tt">Build your own model</div><div class="st">Packages a base model with your instructions and settings, on this server</div></div></div>${field('Name', `<input class="input mono" name="cm-name" value="${esc((ctx.org.name.split(/\s+/)[0] || 'org').toLowerCase().replace(/[^a-z0-9]/g, ''))}-assistant:v${custom.length + 1}">`)}${field('Base model', `<select class="select" name="cm-from">${options(inst.models.map((m) => [m.name, m.name]), (inst.models.find((m) => /gemma/.test(m.name)) || {}).name)}</select>`)}${field('Instructions', `<textarea class="textarea" name="cm-sys" style="min-height:140px">You are the internal assistant of ${esc(ctx.org.name)} (${esc(ctx.org.industryName)}). Answer from the organization's documents and policies, cite them, follow ${esc(ctx.org.jurisdictions.join(', '))} rules, and say when you are unsure.</textarea>`)}<div class="row">${field('Temperature', '<input class="input" type="number" name="cm-temp" min="0" max="2" step="0.1" value="0.3">')}${field('Context (tokens)', '<input class="input" type="number" name="cm-ctx" min="512" step="512" value="4096">')}</div><button class="btn primary" data-act="build" ${inst.models.length ? '' : 'disabled'}>Build model</button><p class="note">This uses Ollama's model builder (base weights + instructions + parameters). It does not change the weights; weight-level fine-tuning uses the exported training data on a GPU host, and the resulting adapter can be built the same way.</p></div>` : ''}</div>`;
      }
      root.innerHTML = h;
      if (poll.size) setTimeout(() => { if (ctx.alive()) { poll.clear(); draw(); } }, 2500);
    };
    ctx.acts.tab = (b) => { tab = b.dataset.tab; draw(); };
    const caseText = (cases) => cases.map((c) => `${c.q} | ${c.mustInclude.join(', ')}`).join('\n');
    const evalForm = (cur) => modal({ title: cur ? 'Edit evaluation set' : 'New evaluation set', wide: true,
      html: `${field('Name', `<input class="input" name="n" value="${esc(cur ? cur.name : '')}" placeholder="Front desk policy questions">`)}${field('Description', `<input class="input" name="d" value="${esc(cur ? cur.description || '' : '')}">`)}${field('Cases: one per line, "question | words the answer must contain"', `<textarea class="textarea mono" name="c" style="min-height:220px" placeholder="How many days do we have to notify patients after a breach? | 60 days\nCan public AI chatbots receive PHI? | not, public">${esc(cur ? caseText(cur.cases) : '')}</textarea>`)}`,
      actions: [{ label: 'Save', primary: true, onClick: async (m) => { const cases = val(m, 'c').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [q, w] = l.split('|'); return { q: q.trim(), mustInclude: (w || '').split(',').map((x) => x.trim()).filter(Boolean) }; }); const b = { name: val(m, 'n'), description: val(m, 'd'), cases }; if (cur) await put('/api/evals/' + cur.id, b); else await post('/api/evals', b); toast('Saved'); draw(); } }] });
    ctx.acts.newEval = () => evalForm();
    ctx.acts.editEval = async (b) => evalForm((await get('/api/evals')).find((e) => e.id === b.dataset.id));
    ctx.acts.delEval = async (b) => { if (await confirmBox({ title: 'Delete evaluation set', message: 'Delete this set and its runs?', confirm: 'Delete', danger: true })) { await del('/api/evals/' + b.dataset.id); draw(); } };
    ctx.acts.runEval = async (b) => { const dep = root.querySelector('#dep-' + b.dataset.id).value; await post(`/api/evals/${b.dataset.id}/run`, { deploymentId: dep }); toast('Evaluation started. Each case is a real request to your model.'); draw(); };
    ctx.acts.evalModel = () => { tab = 'evals'; draw(); toast('Deploy the model in Models, then run an evaluation set on it.'); };
    ctx.acts.runRes = async (b) => { const r = await get('/api/evalruns/' + b.dataset.id); modal({ title: `${r.evalName} · ${r.model}`, wide: true, html: `<div class="kpis"><div class="kpi"><div class="k">Score</div><div class="v">${r.score ?? '-'}%</div></div><div class="kpi"><div class="k">Passed</div><div class="v">${r.passed}/${r.total}</div></div><div class="kpi"><div class="k">Speed</div><div class="v">${r.avgTps ?? '-'}<small>tok/s</small></div></div></div>${r.results.map((x) => `<div class="card" style="margin-bottom:8px;background:var(--s2)"><div class="row between"><b>${esc(x.q)}</b>${x.pass ? badge('Pass', 'ok') : badge(Math.round(x.score * 100) + '%', x.score ? 'warn' : 'bad')}</div><div class="pill-row" style="margin:6px 0">${x.mustInclude.map((w) => `<span class="sig ${x.found.includes(w) ? 'ok' : 'bad'}">${esc(w)}</span>`).join('')}</div>${x.error ? `<div class="callout bad">${esc(x.error)}</div>` : `<div class="mute" style="white-space:pre-wrap;font-size:12.5px">${esc(x.answer || '')}</div><div class="note">${x.sources && x.sources.length ? 'Sources: ' + x.sources.map(esc).join(', ') + ' · ' : ''}${fmtMs(x.ms)}</div>`}</div>`).join('')}` }); };
    ctx.acts.gen = async () => {
      const [docs, deps] = await Promise.all([get('/api/knowledge'), get('/api/workspace/deployments')]);
      const tdocs = docs.filter((d) => (d.useFor || []).includes('training'));
      modal({ title: 'Generate training examples from a document', html: `<p class="mute" style="margin-bottom:12px">Your own model reads the document and drafts question and answer pairs. Nothing leaves this server. Every draft waits for human approval.</p>${field('Document', `<select class="select" name="doc">${options((tdocs.length ? tdocs : docs).map((d) => [d.id, d.title]), '')}</select>`, tdocs.length ? 'Showing documents marked for training.' : 'No document is marked for training yet, so all are listed.')}${field('Model', `<select class="select" name="dep">${options(deps.map((d) => [d.id, `${d.name} · ${d.model}`]), (deps.find((d) => d.status === 'running') || deps[0] || {}).id)}</select>`)}${field('How many', '<input class="input" type="number" name="n" min="1" max="15" value="5">')}`,
        actions: [{ label: 'Generate', primary: true, onClick: async (m) => {
          const job = await post('/api/training/generate', { docId: val(m, 'doc'), deploymentId: val(m, 'dep'), count: Number(val(m, 'n')) });
          const msg = () => root.querySelector('#jobmsg');
          const tick = async () => { const j = await get('/api/jobs/' + job.id); if (!ctx.alive()) return; if (msg()) msg().innerHTML = j.status === 'running' ? `<div class="callout" style="margin-bottom:12px">${esc(j.message)}… your model is drafting examples. On a CPU this can take a minute or two.</div>` : ''; if (j.status === 'running') setTimeout(tick, 2000); else { toast(j.status === 'done' ? j.message : 'Generation failed: ' + j.message, j.status === 'done' ? 'ok' : 'bad'); draw(); } };
          tick();
        } }] });
    };
    const trForm = (cur) => modal({ title: cur ? 'Edit training example' : 'Add training example', wide: true, html: `${field('Question', `<textarea class="textarea" name="q">${esc(cur ? cur.messages[0].content : '')}</textarea>`)}${field('Ideal answer', `<textarea class="textarea" name="a" style="min-height:140px">${esc(cur ? cur.messages[1].content : '')}</textarea>`)}`,
      actions: [{ label: 'Save', primary: true, onClick: async (m) => { if (cur) await put('/api/training/' + cur.id, { question: val(m, 'q'), answer: val(m, 'a') }); else await post('/api/training', { question: val(m, 'q'), answer: val(m, 'a') }); toast('Saved'); draw(); } }] });
    ctx.acts.addTr = () => trForm();
    ctx.acts.trEdit = async (b) => trForm((await get('/api/training')).find((t) => t.id === b.dataset.id));
    ctx.acts.trSt = async (b) => { await put('/api/training/' + b.dataset.id, { status: b.dataset.s }); draw(); };
    ctx.acts.export = async () => { await downloadFile('/api/training/export'); toast('Exported. The export is recorded in the audit trail with its hash.'); };
    ctx.acts.promote = async (b) => { await post('/api/training', { feedbackId: b.dataset.id }); toast('Added to training data'); tab = 'training'; draw(); };
    ctx.acts.build = async (b) => {
      b.disabled = true; b.textContent = 'Building…';
      try { const r = await post('/api/models/create', { name: root.querySelector('[name=cm-name]').value, from: root.querySelector('[name=cm-from]').value, system: root.querySelector('[name=cm-sys]').value, temperature: Number(root.querySelector('[name=cm-temp]').value), numCtx: Number(root.querySelector('[name=cm-ctx]').value) }); toast(`${r.name} built on this server`); draw(); }
      catch (e) { toast(e.message, 'bad'); b.disabled = false; b.textContent = 'Build model'; }
    };
    await draw();
  },
};

export const views = { models, knowledge, intelligence };
