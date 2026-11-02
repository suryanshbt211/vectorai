'use strict';
// A tiny stand-in for Ollama's HTTP API, used by the tests and handy for trying the UI without a GPU:
//   node scripts/mock-ollama.js            (listens on 11434, or MOCK_PORT)
// It fakes model lists, pulls, loading, and streamed chat. It does NOT run any real model.
const http = require('http');

function startMock(port = 0, { pullDelayMs = 5, preinstalled = [] } = {}) {
  const state = { installed: new Map(), running: new Map(), calls: [] };
  const add = (name, sizeGB = 3.4) => state.installed.set(name, { name, model: name, size: Math.round(sizeGB * 1e9), digest: 'sha256:' + Buffer.from(name).toString('hex').padEnd(64, '0'), modified_at: new Date().toISOString(), details: { family: name.split(':')[0], parameter_size: name.split(':')[1] || 'latest', quantization_level: 'Q4_K_M' } });
  preinstalled.forEach((n) => add(n));
  const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  const readBody = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch (_) { r({}); } }); });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const server = http.createServer(async (req, res) => {
    const body = req.method === 'GET' ? {} : await readBody(req);
    state.calls.push({ method: req.method, url: req.url, body });
    if (req.url === '/api/version') return json(res, 200, { version: '0.0.0-mock' });
    if (req.url === '/api/tags') return json(res, 200, { models: [...state.installed.values()] });
    if (req.url === '/api/ps') return json(res, 200, { models: [...state.running.values()].map((m) => ({ name: m.name, model: m.name, size: m.size + 1e9, size_vram: m.gpu === 0 ? 0 : m.size + 1e9, expires_at: new Date(Date.now() + 1800000).toISOString() })) });
    if (req.url === '/api/show') {
      const m = state.installed.get(body.model || body.name);
      return m ? json(res, 200, { details: m.details, capabilities: ['completion'], parameters: 'num_ctx 4096', license: 'Mock licence text', model_info: { 'general.parameter_count': 4e9 } }) : json(res, 404, { error: 'model not found' });
    }
    if (req.url === '/api/delete' && req.method === 'DELETE') {
      return state.installed.delete(body.model) ? (state.running.delete(body.model), json(res, 200, {})) : json(res, 404, { error: 'model not found' });
    }
    if (req.url === '/api/pull') {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      const name = body.model || body.name;
      if (/^fail/.test(name)) { res.write(JSON.stringify({ error: 'pull model manifest: file does not exist' }) + '\n'); return res.end(); }
      res.write(JSON.stringify({ status: 'pulling manifest' }) + '\n');
      for (let i = 1; i <= 4; i++) { await sleep(pullDelayMs); res.write(JSON.stringify({ status: 'pulling abc123', total: 400, completed: i * 100 }) + '\n'); }
      add(name);
      res.write(JSON.stringify({ status: 'success' }) + '\n');
      return res.end();
    }
    if (req.url === '/api/generate') {
      const name = body.model;
      if (!state.installed.has(name)) return json(res, 404, { error: `model '${name}' not found` });
      if (body.keep_alive === 0) { state.running.delete(name); return json(res, 200, { model: name, done: true, done_reason: 'unload' }); }
      state.running.set(name, { name, size: state.installed.get(name).size, gpu: body.options && body.options.num_gpu });
      return json(res, 200, { model: name, response: '', done: true });
    }
    if (req.url === '/api/create') {
      const from = state.installed.get(body.from);
      if (!from) return json(res, 404, { error: `model '${body.from}' not found` });
      add(body.model, from.size / 1e9);
      return json(res, 200, { status: 'success' });
    }
    if (req.url === '/api/chat') {
      const name = body.model;
      if (!state.installed.has(name)) return json(res, 404, { error: `model '${name}' not found` });
      if (!state.running.has(name)) state.running.set(name, { name, size: state.installed.get(name).size, gpu: body.options && body.options.num_gpu });
      const last = [...body.messages].reverse().find((m) => m.role === 'user');
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      const cited = /\[1\]/.test(sys) ? ' See [1].' : '';
      const isTrain = /training data/i.test(sys);
      const text = body.format === 'json' && isTrain
        ? JSON.stringify({ pairs: [1, 2, 3].map((i) => ({ question: `Mock question ${i} about the document?`, answer: `Mock answer ${i} (mock Ollama, not a real model).` })) })
        : body.format === 'json'
        ? JSON.stringify({ verdict: /D1/.test(last.content) ? 'partial' : 'not_covered', confidence: 0.6, reasons: ['Mock review: D1 mentions the topic.'], missing: ['Mock: operating evidence'] })
        : `Mock answer to: ${String(last.content).slice(0, 40)}.${cited} (This text comes from the mock Ollama, not a real model.)`;
      const words = text.split(' ');
      const promptTokens = Math.round(body.messages.reduce((a, m) => a + String(m.content).length, 0) / 4);
      const tps = 18 + Math.random() * 10, ptps = 180 + Math.random() * 80;
      const evalNs = (words.length * 1.3 / tps) * 1e9, promptNs = (promptTokens / ptps) * 1e9;
      const fin = { model: name, done: true, load_duration: Math.random() < 0.15 ? 2.5e9 : 4e7, prompt_eval_count: promptTokens, prompt_eval_duration: promptNs, eval_count: Math.round(words.length * 1.3), eval_duration: evalNs, total_duration: evalNs + promptNs + 5e7 };
      if (body.stream === false) return json(res, 200, { ...fin, message: { role: 'assistant', content: text } });
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      for (const w of words) { await sleep(3); res.write(JSON.stringify({ model: name, message: { role: 'assistant', content: w + ' ' }, done: false }) + '\n'); }
      res.write(JSON.stringify({ ...fin, message: { role: 'assistant', content: '' } }) + '\n');
      return res.end();
    }
    json(res, 404, { error: 'not found' });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    const p = server.address().port;
    resolve({ server, port: p, url: `http://127.0.0.1:${p}`, state, add, close: () => new Promise((r) => { server.close(r); server.closeAllConnections && server.closeAllConnections(); }) });
  }));
}

module.exports = { startMock };
if (require.main === module) {
  const port = Number(process.env.MOCK_PORT) || 11434;
  startMock(port, { preinstalled: ['gemma3:4b'] }).then((m) => console.log(`Mock Ollama listening on ${m.url} (fake models, no real inference)`));
}
