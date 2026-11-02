// Personal AI panel, the guided demo journey (Story) and the fine-tuning wizard.
import { esc, get, post, put, toast, badge, meter, bytes, ago, num, pagehead, empty, field, options } from './ui.js';

const svg = (d, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = { brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 0V4M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 0"/>', chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>', lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>' };

export function personalAiHtml(p) {
  const i = p.internal, h = p.physical;
  const dev = h.deviceType === 'computer' ? 'This computer' : 'This ' + h.deviceType;
  return `<div class="pai">
    <div class="paic"><div class="paih"><span class="paii">${svg(I.brain)}</span><div><div class="pail">Internal AI</div><div class="pait">${i.ownModel ? esc(i.ownModel.name) : 'Not personalized yet'}</div></div></div>
      <dl class="paid"><dt>Built from</dt><dd>${i.ownModel ? esc(i.ownModel.from) + ' (open weights)' : esc(i.baseModels.join(', ') || '-')}</dd><dt>Knows</dt><dd>${i.documents} documents · ${i.trainingDocs} used for training</dd><dt>Learned from</dt><dd>${i.ownModel ? `${i.ownModel.examples} approved examples` : `${i.trainingApproved} approved examples waiting`}</dd><dt>Evaluation</dt><dd>${i.bestEval != null ? `best ${i.bestEval}% on your own test set` : 'not evaluated yet'}</dd><dt>Used</dt><dd>${num(i.requests)} requests</dd></dl>
      <a class="btn sm" href="#/finetune">${i.ownModel ? 'Improve it' : 'Fine-tune your model'}</a></div>
    <div class="paic"><div class="paih"><span class="paii">${svg(I.chip)}</span><div><div class="pail">Physical AI</div><div class="pait">${esc(dev)}${h.vendor || h.model ? ' · ' + esc([h.vendor, h.model].filter(Boolean).join(' ')) : ''}</div></div></div>
      <dl class="paid"><dt>Processor</dt><dd>${esc(h.cpu.model)} · ${h.cpu.cores} cores</dd><dt>Memory</dt><dd>${Math.round(h.memoryBytes / 2 ** 30)} GB${h.gpus.length ? ' · ' + h.gpus.map((g) => esc(g.name)).join(', ') : ''}</dd><dt>Inference</dt><dd>${esc(h.accelerator)}</dd><dt>Runtime</dt><dd>Ollama ${esc(h.runtime.version || '')} · ${h.modelsOnDisk} models on disk (${bytes(h.diskBytes)})</dd><dt>Network</dt><dd>${h.runtime.local ? `${svg(I.lock, 14)} Air-gapped AI: every model call stays on this machine` : 'Inference node on your private network'}</dd></dl>
      <a class="btn sm" href="#/infrastructure">Hardware details</a></div></div>`;
}

// ---------------- Story: the guided end-to-end demo ----------------
const story = {
  title: 'Story', scope: 'org',
  async render(ctx) {
    const { root, can, org } = ctx;
    const [p, runs, tasks, chk] = await Promise.all([get('/api/personal-ai'), can('chat.use') ? get('/api/apps/runs').catch(() => []) : [], get('/api/tasks').catch(() => ({ tasks: [] })), can('compliance.read') ? get('/api/compliance/requirements').catch(() => null) : null]);
    const hasIN = org.jurisdictions.some((c) => c.startsWith('IN')), hasUS = org.jurisdictions.some((c) => c.startsWith('US'));
    const steps = [
      ['Your physical AI', 'See the machine your AI runs on: device, processor, memory and the local Ollama runtime. No cloud.', '#/infrastructure', true, can('infra.read')],
      ['Select documents', 'Upload and tag the policies and procedures your AI should know, and choose which ones it learns from.', '#/knowledge', p.internal.trainingDocs > 0, can('knowledge.read')],
      ['Select models', 'Pick open-weight models such as Gemma to run on this machine. Add more any time.', '#/models', p.internal.baseModels.length > 0, can('models.read')],
      ['Fine-tune your model', 'Turn documents into approved examples and build your own model on top of Gemma.', '#/finetune', !!p.internal.ownModel, can('models.manage')],
      ['Internal chat', 'Ask questions answered from your documents with citations, by your own model.', '#/chat', p.internal.requests > 0, can('chat.use')],
      ['Healthcare applications', 'Beyond chat: patient data de-identification, discharge summaries, insurance pre-authorization, breach triage and more.', '#/cards', runs.length > 0, can('chat.use')],
      ...(hasUS ? [['US compliance by state', 'Every federal and state rule that applies, readiness per state and the probable loss if not complied with.', '#/compliance?tab=map&view=us', true, can('compliance.read')]] : []),
      ...(hasIN ? [['India: national and state rules', `National rules (DPDP Act, CERT-In, Clinical Establishments, PC-PNDT, bio-medical waste) and ${org.jurisdictions.filter((c) => c.startsWith('IN-')).length ? 'Maharashtra' : 'state'} rules, with readiness and the probable loss in rupees.`, '#/compliance?tab=map&place=IN', true, can('compliance.read')]] : []),
      ...(!hasUS && !hasIN ? [['Compliance by place', 'Every rule that applies where you operate, with readiness and the probable loss if not complied with.', '#/compliance?tab=map', true, can('compliance.read')]] : []),
      ['Run the compliance check', chk ? `Predefined rules checked against every document: ${chk.summary.met} of ${chk.summary.requirements} requirements met, ${chk.summary.docsNeeded} documents and ${chk.summary.inputsNeeded} values still needed. Assign them; each one updates the check when provided.` : 'Predefined rules checked against every document; see what is done and pending, and assign the rest.', '#/compliance?tab=check', !!(chk && chk.lastCheck), can('compliance.read')],
      ['Reports', 'A printable compliance report by country and state with exposure and expected loss, stamped with the audit chain.', '#/compliance?tab=report', false, can('compliance.read')],
      ['Tasks and audit trail', 'Assign the work, then prove every action in the hash-chained audit ledger.', '#/tasks', tasks.tasks.length > 0, true],
    ].filter((s) => s[4]);
    const done = steps.filter((s) => s[3]).length;
    root.innerHTML = pagehead('Your AI, end to end', `A guided walk through ${org.name}'s personal AI: from documents and models to fine-tuning, chat, applications, compliance for every place you operate, and reports.`) +
      `<div class="card" style="margin-bottom:16px"><div class="row between"><b>${done} of ${steps.length} steps already done</b><span class="faint" style="font-size:12.5px">Progress updates as you use the platform</span></div><div style="margin-top:8px">${meter((done / steps.length) * 100, 'ok')}</div></div>` +
      `<div class="storyl">${steps.map((s, k) => `<a class="storys ${s[3] ? 'done' : ''}" href="${s[2]}"><span class="storyn">${s[3] ? '✓' : k + 1}</span><span style="flex:1;min-width:0"><b>${esc(s[0])}</b><span class="mute" style="display:block;font-size:13px;margin-top:2px">${esc(s[1])}</span></span><span class="btn sm">${s[3] ? 'Open' : 'Start'}</span></a>`).join('')}</div>`;
  },
};

// ---------------- Fine-tune wizard ----------------
const finetune = {
  title: 'Fine-tune', perm: 'models.manage', scope: 'org',
  async render(ctx) {
    const { root, org } = ctx;
    const slug = (org.name.split(/\s+/)[0] || 'org').toLowerCase().replace(/[^a-z0-9]/g, '');
    let sel = null, base = null, jobMsg = '';
    const draw = async () => {
      const [docs, inst, deps, train, custom, evals] = await Promise.all([get('/api/knowledge'), get('/api/models'), get('/api/workspace/deployments'), get('/api/training'), get('/api/models/custom'), get('/api/evals').catch(() => [])]);
      if (!ctx.alive()) return;
      if (!sel) sel = new Set(docs.filter((d) => (d.useFor || []).includes('training')).map((d) => d.id));
      if (!base) base = (inst.models.find((m) => /gemma/.test(m.name) && !/-assistant/.test(m.name)) || inst.models[0] || {}).name;
      const appr = train.filter((t) => t.status === 'approved'), pend = train.filter((t) => t.status === 'pending');
      const genDep = deps.find((d) => d.status === 'running') || deps[0];
      const next = `${slug}-assistant:v${custom.length + 1}`;
      root.innerHTML = pagehead('Fine-tune your model', `Make ${org.name}'s AI its own: choose what it learns from, choose an open-weight base model, approve the examples it learns, then build, evaluate and deploy it. Everything happens on this machine.`) +
        `<div class="wiz">
          <div class="card"><div class="wizh"><span class="wizn">1</span><div><b>Choose documents to learn from</b><div class="st">${sel.size} of ${docs.length} selected</div></div></div>
            <div class="wizlist">${docs.map((d) => `<label class="check"><input type="checkbox" data-chg="doc" value="${d.id}" ${sel.has(d.id) ? 'checked' : ''}><span style="flex:1">${esc(d.title)}</span><span class="faint" style="font-size:12px">${(d.tags || []).slice(0, 2).map(esc).join(', ')}</span></label>`).join('') || '<p class="mute">Upload documents in Knowledge first.</p>'}</div>
            <button class="btn sm" data-act="saveDocs">Save selection</button></div>
          <div class="card"><div class="wizh"><span class="wizn">2</span><div><b>Choose the base model</b><div class="st">Open weights from the local Ollama library. Add more in Models.</div></div></div>
            <div class="wizlist">${inst.models.filter((m) => !/-assistant:/.test(m.name)).map((m) => `<label class="check"><input type="radio" name="base" data-chg="base" value="${esc(m.name)}" ${m.name === base ? 'checked' : ''}><span style="flex:1" class="mono">${esc(m.name)}</span><span class="faint" style="font-size:12px">${esc(m.params || '')} · ${bytes(m.sizeBytes)}</span></label>`).join('') || '<p class="mute">No models installed. Open Models and add Gemma.</p>'}</div></div>
          <div class="card"><div class="wizh"><span class="wizn">3</span><div><b>Approve training examples</b><div class="st">${appr.length} approved · ${pend.length} waiting for review</div></div></div>
            <p class="mute" style="font-size:13px;margin:0 0 8px">Your model reads each selected document and drafts question and answer pairs. A person approves what it should learn.</p>
            <div class="row" style="margin-bottom:8px"><select class="select" id="gendoc" style="flex:1;min-width:200px">${options(docs.filter((d) => sel.has(d.id)).map((d) => [d.id, d.title]), '')}</select><button class="btn sm primary" data-act="gen" ${genDep && sel.size ? '' : 'disabled'}>Draft 4 examples</button></div>
            <div id="jobmsg">${jobMsg}</div>
            <div class="wizlist" style="max-height:260px">${pend.slice(0, 8).map((t) => `<div class="wizex"><div><b>${esc(t.messages[0].content.slice(0, 140))}</b><div class="mute" style="font-size:12.5px">${esc(t.messages[1].content.slice(0, 200))}</div></div><span class="row" style="gap:4px;flex-wrap:nowrap"><button class="btn sm" data-act="tr" data-id="${t.id}" data-s="approved">Approve</button><button class="btn sm ghost" data-act="tr" data-id="${t.id}" data-s="rejected">Reject</button></span></div>`).join('') || (appr.length ? `<p class="mute">All drafts reviewed. ${appr.length} examples approved.</p>` : '<p class="mute">No drafts yet.</p>')}</div></div>
          <div class="card"><div class="wizh"><span class="wizn">4</span><div><b>Build, evaluate and deploy</b><div class="st">Creates a new model version on this machine</div></div></div>
            ${field('Model name', `<input class="input mono" id="mname" value="${esc(next)}">`)}
            ${field('Instructions', `<textarea class="textarea" id="msys" style="min-height:90px">You are the internal assistant of ${esc(org.name)} (${esc(org.industryName)}). Answer from the organization's documents and policies, cite them, follow the rules of ${esc(org.jurisdictions.join(', '))}, and say when you are unsure. Never give a diagnosis; doctors decide.</textarea>`)}
            <label class="check" style="margin-bottom:10px"><input type="checkbox" id="minc" checked> Teach it the ${appr.length} approved examples</label>
            <div class="row"><button class="btn primary" data-act="build" ${base ? '' : 'disabled'}>Build ${esc(next)}</button></div>
            <p class="note">On this laptop the model learns from your instructions and approved examples, packaged on top of the base weights. For weight-level fine-tuning (LoRA) the approved examples export as JSONL from Intelligence and train on a GPU machine; the result loads back here the same way.</p>
            ${custom.length ? `<div class="lbl" style="margin-top:10px">Your model versions</div><div class="tblwrap"><table class="tbl"><tbody>${custom.map((m) => { const d = deps.find((x) => x.model === m.name); return `<tr><td class="mono"><b>${esc(m.name)}</b><div class="note" style="margin:0">from ${esc(m.from)} · ${m.examples || 0} examples · ${ago(m.createdAt)}</div></td><td>${d ? badge(d.status === 'running' ? 'Deployed' : d.status, d.status === 'running' ? 'ok' : '') : `<button class="btn sm" data-act="deploy" data-m="${esc(m.name)}">Deploy</button>`}</td><td>${d && evals[0] ? `<button class="btn sm" data-act="eval" data-d="${d.id}" data-e="${evals[0].id}">Evaluate</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
          </div></div>`;
    };
    ctx.chg.doc = (t) => { if (t.checked) sel.add(t.value); else sel.delete(t.value); };
    ctx.chg.base = (t) => { base = t.value; };
    ctx.acts.saveDocs = async () => {
      const docs = await get('/api/knowledge');
      for (const d of docs) {
        const has = (d.useFor || ['retrieval']).includes('training'), want = sel.has(d.id);
        if (has !== want) { const base = (d.useFor || ['retrieval']).filter((x) => x !== 'training'); await put('/api/knowledge/' + d.id, { useFor: want ? [...base, 'training'] : (base.length ? base : ['retrieval']) }); }
      }
      toast('Training documents saved'); draw();
    };
    ctx.acts.gen = async () => {
      const deps = await get('/api/workspace/deployments'); const dep = deps.find((d) => d.status === 'running') || deps[0];
      const job = await post('/api/training/generate', { docId: root.querySelector('#gendoc').value, deploymentId: dep.id, count: 4 });
      const tick = async () => { const j = await get('/api/jobs/' + job.id); if (!ctx.alive()) return; jobMsg = j.status === 'running' ? `<div class="callout" style="margin-bottom:8px">${esc(j.message)}… your model is drafting examples on this machine.</div>` : ''; const m = root.querySelector('#jobmsg'); if (m) m.innerHTML = jobMsg; if (j.status === 'running') setTimeout(tick, 1500); else { toast(j.status === 'done' ? j.message : 'Failed: ' + j.message, j.status === 'done' ? 'ok' : 'bad'); draw(); } };
      tick();
    };
    ctx.acts.tr = async (b) => { await put('/api/training/' + b.dataset.id, { status: b.dataset.s }); draw(); };
    ctx.acts.build = async (b) => {
      b.disabled = true; b.textContent = 'Building…';
      try { const r = await post('/api/models/create', { name: root.querySelector('#mname').value, from: base, system: root.querySelector('#msys').value, includeTraining: root.querySelector('#minc').checked, temperature: 0.3, numCtx: 4096 }); toast(`${r.name} built with ${r.examples || 0} examples`); draw(); }
      catch (e) { toast(e.message, 'bad'); b.disabled = false; }
    };
    ctx.acts.deploy = async (b) => { const r = await post('/api/deployments', { name: `${org.name.split(' ')[0]} Assistant (${b.dataset.m.split(':')[1] || 'own'})`, model: b.dataset.m, node: 'local', start: true, systemPrompt: '' }); toast(r.startError ? 'Deployed but not started: ' + r.startError : 'Deployed and running', r.startError ? 'bad' : 'ok'); draw(); };
    ctx.acts.eval = async (b) => { await post(`/api/evals/${b.dataset.e}/run`, { deploymentId: b.dataset.d }); toast('Evaluation started. Results appear in Intelligence → Evaluations.'); };
    await draw();
  },
};

export const views = { story, finetune };
