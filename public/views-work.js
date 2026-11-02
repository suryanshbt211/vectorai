import { esc, $, get, post, del, stream, toast, modal, confirmBox, badge, md, ago, dt, sh, num, pagehead, empty, field, options, val, readFileText } from './ui.js';

// ---------------- Assistant (chat) ----------------
const chat = {
  title: 'Assistant', perm: 'chat.use',
  async render(ctx) {
    const { root, can } = ctx;
    const [deps, convs] = await Promise.all([get('/api/workspace/deployments'), get('/api/conversations')]);
    let conversations = convs, convId = null, depId = (deps.find((d) => d.status === 'running') || deps[0] || {}).id || '', ac = null, sending = false;
    const useK = can('knowledge.read');
    let useKnowledge = useK;
    let msgs = [];

    root.innerHTML = `<div class="chat"><aside class="convs"><div class="row between" style="padding:10px"><b>Conversations</b><button class="btn sm" data-act="newc">New</button></div><div class="list" id="cl"></div></aside>
      <section class="thread"><div class="bar"><label class="mute" for="dep">Model</label><select class="select" id="dep" style="width:auto;min-width:200px" data-chg="dep"></select>${useK ? '<label class="check"><input type="checkbox" id="uk" data-chg="uk" checked> Use my department\'s documents</label>' : ''}<span class="sp"></span><span class="faint" style="font-size:12px">Runs on your organization\'s own hardware</span></div>
      <div class="msgs" id="ms" aria-live="polite"></div>
      <form class="composer" data-sub="send"><textarea class="textarea" id="in" rows="1" placeholder="Ask a question. Enter to send, Shift+Enter for a new line." aria-label="Message"></textarea><button class="btn primary" id="sendb" type="submit">Send</button></form></section></div>`;
    const ms = $('#ms', root), cl = $('#cl', root), dsel = $('#dep', root), input = $('#in', root), sendb = $('#sendb', root);

    const drawDeps = () => {
      dsel.innerHTML = deps.length ? options(deps.map((d) => [d.id, `${d.name} · ${d.model}${d.status === 'running' ? '' : ' (' + d.status.replace('_', ' ') + ')'}`]), depId) : '<option value="">No deployment available</option>';
    };
    const drawConvs = () => {
      cl.innerHTML = conversations.length ? conversations.map((c) => `<div class="conv ${c.id === convId ? 'on' : ''}" data-act="open" data-id="${c.id}"><span title="${esc(c.title)}">${esc(c.title)}</span><button class="btn ghost sm" data-act="delc" data-id="${c.id}" aria-label="Delete conversation">✕</button></div>`).join('') : '<p class="faint" style="padding:10px">No conversations yet.</p>';
    };
    const bubbleHtml = (m, i) => `<div class="msg ${m.role === 'user' ? 'user' : 'ai'}"><div class="bubble">${md(m.content)}</div>${m.sources && m.sources.length ? `<div class="srcs">${m.sources.map((s) => `<button class="src" data-act="src" data-doc="${esc(s.docId)}" data-n="${s.n}" title="${esc(s.excerpt || '')}">[${s.n}] ${esc(s.title)}</button>`).join('')}</div>` : ''}${m.partial ? '<div class="mstat">Stopped early</div>' : ''}${m.role === 'assistant' && convId && i != null && !m.partial ? `<div class="row" style="gap:6px"><button class="ratebtn ${m.rating === 'up' ? 'on' : ''}" data-act="rate" data-i="${i}" data-r="up" title="Helpful">▲ Helpful</button><button class="ratebtn ${m.rating === 'down' ? 'on' : ''}" data-act="rate" data-i="${i}" data-r="down" title="Not helpful">▼ Not helpful</button></div>` : ''}</div>`;
    const drawMsgs = () => {
      ms.innerHTML = msgs.length ? msgs.map((m, i) => bubbleHtml(m, i)).join('') : `<div class="empty"><b>Ask anything</b>${deps.length ? 'Answers come from a model running on your own servers. Your conversations are private to you.' : 'No deployment exists yet. Ask an administrator to start one.'}</div>`;
      ms.scrollTop = ms.scrollHeight;
    };
    drawDeps(); drawConvs(); drawMsgs();
    if (!deps.length) { sendb.disabled = true; }

    ctx.acts.rate = (b) => {
      const i = Number(b.dataset.i), r = b.dataset.r;
      modal({ title: r === 'up' ? 'Helpful answer' : 'Not helpful', html: `<p class="mute" style="margin-bottom:10px">Your rating helps your organization measure and improve its own model.</p>${field('Comment (optional)', '<input class="input" name="note" placeholder="' + (r === 'up' ? 'What was good?' : 'What was wrong or missing?') + '">')}<label class="check"><input type="checkbox" name="share"> Share this question and answer with the AI team so it can become training or evaluation data</label><p class="note">If you do not share, only the rating and a hash of the answer are kept.</p>`,
        actions: [{ label: 'Send rating', primary: true, onClick: async (m) => { await post(`/api/conversations/${convId}/feedback`, { messageIndex: i, rating: r, note: m.$('[name=note]').value, share: m.$('[name=share]').checked }); msgs[i].rating = r; drawMsgs(); toast('Thanks, rating recorded'); } }] });
    };
    ctx.chg.dep = (t) => { depId = t.value; };
    ctx.chg.uk = (t) => { useKnowledge = t.checked; };
    ctx.acts.newc = () => { if (sending) return; convId = null; msgs = []; drawConvs(); drawMsgs(); input.focus(); };
    ctx.acts.open = async (t) => {
      if (sending) return;
      const c = await get('/api/conversations/' + t.dataset.id);
      convId = c.id; msgs = c.messages; if (c.deploymentId && deps.some((d) => d.id === c.deploymentId)) { depId = c.deploymentId; drawDeps(); }
      drawConvs(); drawMsgs();
    };
    ctx.acts.delc = async (t, e) => {
      e.stopPropagation();
      if (!(await confirmBox({ title: 'Delete conversation', message: 'Delete this conversation? This cannot be undone.', confirm: 'Delete', danger: true }))) return;
      await del('/api/conversations/' + t.dataset.id);
      conversations = conversations.filter((c) => c.id !== t.dataset.id);
      if (convId === t.dataset.id) { convId = null; msgs = []; drawMsgs(); }
      drawConvs();
    };
    ctx.acts.src = async (t) => {
      const m = msgs[msgs.length - 1];
      let doc = null;
      try { doc = await get('/api/knowledge/' + t.dataset.doc); } catch (_) { /* may be gone or restricted */ }
      modal({ title: t.title ? `Source [${t.dataset.n}]` : 'Source', wide: true, html: doc ? `<h4>${esc(doc.title)}</h4><p class="faint" style="margin:4px 0 10px">${esc(doc.department === '*' ? 'All departments' : doc.department)} · sha256 <span class="mono">${esc(sh(doc.sha256))}</span></p><div class="json">${esc(t.title || doc.text.slice(0, 1500))}</div>` : `<p class="mute">This document is no longer available to you.</p>${t.title ? `<div class="json">${esc(t.title)}</div>` : ''}` });
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); root.querySelector('form').requestSubmit(); } });
    input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(160, input.scrollHeight) + 'px'; });

    ctx.sub.send = async () => {
      if (sending) { if (ac) ac.abort(); return; }
      const text = input.value.trim();
      if (!text) return;
      if (!depId) { toast('Choose a deployment first', 'bad'); return; }
      sending = true; ac = new AbortController();
      sendb.textContent = 'Stop'; input.value = ''; input.style.height = 'auto';
      msgs.push({ role: 'user', content: text });
      const ai = { role: 'assistant', content: '', sources: [] };
      msgs.push(ai); drawMsgs();
      const bubble = () => ms.lastElementChild.querySelector('.bubble');
      bubble().classList.add('cursor');
      let stats = null;
      try {
        await stream('/api/chat', { message: text, deploymentId: depId, conversationId: convId, useKnowledge }, (ev) => {
          if (!ctx.alive()) return;
          if (ev.type === 'meta') { ai.sources = ev.sources; }
          else if (ev.type === 'token') { ai.content += ev.t; bubble().innerHTML = md(ai.content); ms.scrollTop = ms.scrollHeight; }
          else if (ev.type === 'error') { ai.content += (ai.content ? '\n\n' : '') + 'Error: ' + ev.message; ai.partial = true; }
          else if (ev.type === 'done') { convId = ev.conversationId; stats = ev.stats; ai.partial = ai.partial || ev.stopped; }
        }, ac.signal);
      } catch (e) {
        if (e.name !== 'AbortError') { ai.content += (ai.content ? '\n\n' : '') + 'Error: ' + e.message; ai.partial = true; }
        else ai.partial = true;
      }
      sending = false; ac = null;
      if (!ctx.alive()) return;
      sendb.textContent = 'Send';
      if (!ai.content) ai.content = '(no answer)';
      drawMsgs();
      if (stats) { const s = document.createElement('div'); s.className = 'mstat'; s.textContent = `${stats.completionTokens} tokens${stats.tokensPerSecond ? ' · ' + stats.tokensPerSecond + ' tok/s' : ''} · ${(stats.totalMs / 1000).toFixed(1)} s`; ms.lastElementChild.append(s); }
      try { conversations = await get('/api/conversations'); drawConvs(); } catch (_) { /* list refresh is optional */ }
    };
    input.focus();
  },
};

// ---------------- Knowledge ----------------
const knowledge = {
  title: 'Knowledge', perm: 'knowledge.read',
  async render(ctx) {
    const { root, can, me } = ctx;
    const manage = can('knowledge.manage'), all = can('knowledge.all');
    root.innerHTML = pagehead('Knowledge', 'Documents the assistant can cite. People only see documents for their own department, plus documents shared with everyone.', manage ? '<button class="btn primary" data-act="add">Add document</button>' : '') + '<div id="kl"></div>';
    const box = root.querySelector('#kl');
    let docs = [];
    const draw = () => {
      box.innerHTML = docs.length ? `<div class="card"><div class="tblwrap"><table class="tbl"><thead><tr><th>Title</th><th>Department</th><th>Size</th><th>Hash</th><th>Added</th><th></th></tr></thead><tbody>${docs.map((d) => `<tr><td><b>${esc(d.title)}</b></td><td>${d.department === '*' ? badge('Everyone', 'ok') : esc(d.department)}</td><td>${num(d.chars)} chars · ${d.chunks} parts</td><td class="mono" title="${esc(d.sha256)}">${esc(sh(d.sha256))}</td><td class="faint">${esc(d.createdBy)} · ${ago(d.createdAt)}</td><td class="acts"><button class="btn sm" data-act="view" data-id="${d.id}">View</button>${manage && (all || d.department === me.department) ? `<button class="btn sm danger" data-act="rm" data-id="${d.id}">Delete</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div><p class="hint" style="margin-top:10px">Search uses keyword matching (BM25), not embeddings. Use the words people actually search for when you write documents.</p>` : `<div class="card">${empty('No documents yet', manage ? 'Add policies, runbooks or FAQs so answers can cite them.' : 'Nothing has been shared with your department yet.', manage ? '<button class="btn primary" data-act="add">Add document</button>' : '')}</div>`;
    };
    const load = async () => { docs = await get('/api/knowledge'); if (ctx.alive()) draw(); };
    await load();
    ctx.acts.add = () => modal({
      title: 'Add document', wide: true,
      html: `<div class="row">${field('Title', '<input class="input" name="title" placeholder="Driver onboarding policy">')}${field('Department', all ? '<input class="input" name="department" value="*" placeholder="* means everyone">' : `<input class="input" name="department" value="${esc(me.department || '')}" disabled>`, all ? 'Use * to share with every department, or type a department name exactly as it appears on user accounts.' : 'Your documents belong to your own department.')}</div>${field('Upload a text file', '<input class="input" type="file" name="file" accept=".txt,.md,.csv,.json,.log,text/plain">', 'Plain text only. For PDFs or Word files, paste the text.')}${field('Text', '<textarea class="textarea" name="text" style="min-height:220px"></textarea>')}`,
      onMount: (m) => { m.$('[name=file]').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; try { m.$('[name=text]').value = await readFileText(f); if (!m.$('[name=title]').value) m.$('[name=title]').value = f.name.replace(/\.[^.]+$/, ''); } catch (err) { m.error(err.message); } }); },
      actions: [{ label: 'Add', primary: true, onClick: async (m) => { await post('/api/knowledge', { title: val(m, 'title'), department: val(m, 'department'), text: val(m, 'text') }); toast('Document added'); load(); } }],
    });
    ctx.acts.view = async (t) => {
      const d = await get('/api/knowledge/' + t.dataset.id);
      modal({ title: d.title, wide: true, html: `<p class="faint" style="margin-bottom:10px">${esc(d.department === '*' ? 'Everyone' : d.department)} · sha256 <span class="mono">${esc(d.sha256)}</span></p><div class="json" style="max-height:480px">${esc(d.text)}</div>` });
    };
    ctx.acts.rm = async (t) => {
      const d = docs.find((x) => x.id === t.dataset.id);
      if (!(await confirmBox({ title: 'Delete document', message: `Delete "${d.title}"? The deletion is recorded in the audit ledger.`, confirm: 'Delete', danger: true }))) return;
      await del('/api/knowledge/' + d.id); toast('Document deleted'); load();
    };
  },
};

export const views = { chat, knowledge };
