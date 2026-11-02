'use strict';
// Minimal Ollama HTTP client (Node 18+ global fetch). Talks only to the Ollama URL you configure.

class OllamaError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function* ndjson(body) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) yield JSON.parse(line);
    }
  }
  if (buf.trim()) yield JSON.parse(buf);
}

class OllamaClient {
  constructor(baseUrl) { this.base = String(baseUrl).replace(/\/+$/, ''); }

  async _fetch(path, { method = 'GET', body, timeout = 8000, signal } = {}) {
    const signals = [];
    if (timeout) signals.push(AbortSignal.timeout(timeout));
    if (signal) signals.push(signal);
    let r;
    try {
      r = await fetch(this.base + path, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: signals.length ? AbortSignal.any(signals) : undefined,
      });
    } catch (e) {
      if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new OllamaError(504, `Ollama at ${this.base} did not respond in time`);
      throw new OllamaError(503, `Ollama is not reachable at ${this.base}. Is it running?`);
    }
    if (!r.ok) {
      let t = '';
      try { t = (await r.text()).slice(0, 300); } catch (_) { /* ignore */ }
      let msg = t;
      try { msg = JSON.parse(t).error || t; } catch (_) { /* plain text */ }
      throw new OllamaError(r.status, msg || r.statusText);
    }
    return r;
  }
  async _json(path, opts) { return (await this._fetch(path, opts)).json(); }

  version() { return this._json('/api/version', { timeout: 2500 }); }
  async tags() { return (await this._json('/api/tags')).models || []; }
  async ps() { return (await this._json('/api/ps', { timeout: 4000 })).models || []; }
  show(name) { return this._json('/api/show', { method: 'POST', body: { model: name, name } }); }
  async remove(name) { await this._fetch('/api/delete', { method: 'DELETE', body: { model: name, name } }); }
  generate(body, timeout = 10 * 60 * 1000) { return this._json('/api/generate', { method: 'POST', body: { ...body, stream: false }, timeout }); }
  chat(body, timeout = 10 * 60 * 1000) { return this._json('/api/chat', { method: 'POST', body: { ...body, stream: false }, timeout }); }

  create(body, timeout = 30 * 60 * 1000) { return this._json('/api/create', { method: 'POST', body: { ...body, stream: false }, timeout }); }
  async *chatStream(body, signal) {
    const r = await this._fetch('/api/chat', { method: 'POST', body: { ...body, stream: true }, timeout: 0, signal });
    yield* ndjson(r.body);
  }
  async *pullStream(name, signal) {
    const r = await this._fetch('/api/pull', { method: 'POST', body: { model: name, name, stream: true }, timeout: 0, signal });
    yield* ndjson(r.body);
  }
}

module.exports = { OllamaClient, OllamaError };
