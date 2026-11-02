'use strict';
// Tamper-evident audit ledger. Every entry carries the SHA-256 of the previous entry, so changing,
// removing, re-ordering or inserting any record breaks every hash after it. One chain per
// organization plus one platform chain, so customers can verify their own history offline.
const fs = require('fs');
const path = require('path');
const { sha256 } = require('./util');

const GENESIS_PREV = '0'.repeat(64);

function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const hashEntry = (entryWithoutHash) => sha256(canon(entryWithoutHash));

class Ledger {
  constructor(file, scope) {
    this.file = file;
    this.scope = scope;
    this.entries = [];
    this.loadError = null;
    this._load();
    if (!this.entries.length && !this.loadError) this._write({ action: 'ledger.genesis', outcome: 'ok', orgId: scope === 'platform' ? null : scope, actor: null, resource: null, meta: { scope } });
  }
  _load() {
    if (!fs.existsSync(this.file)) return;
    const lines = fs.readFileSync(this.file, 'utf8').split('\n').filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      try { this.entries.push(JSON.parse(lines[i])); }
      catch (e) { this.loadError = `Entry ${i} is not valid JSON`; break; }
    }
  }
  head() { return this.entries.length ? this.entries[this.entries.length - 1].hash : GENESIS_PREV; }
  _write(fields) {
    const e = JSON.parse(JSON.stringify({
      index: this.entries.length,
      ts: new Date().toISOString(),
      orgId: fields.orgId || null,
      actor: fields.actor || null,
      action: fields.action,
      resource: fields.resource || null,
      outcome: fields.outcome || 'ok',
      meta: fields.meta || {},
      prevHash: this.head(),
    }));
    e.hash = hashEntry(e);
    fs.appendFileSync(this.file, JSON.stringify(e) + '\n');
    this.entries.push(e);
    return e;
  }
  append(fields) { return this._write(fields); }

  /** Re-reads the file from disk and checks every link, so edits made behind the app's back are caught. */
  verify() {
    const fail = (index, reason) => ({ ok: false, scope: this.scope, brokenAt: index, reason, length: this.entries.length, head: this.head() });
    let lines;
    try { lines = fs.readFileSync(this.file, 'utf8').split('\n').filter(Boolean); }
    catch (e) { return fail(0, 'Ledger file is missing or unreadable'); }
    let prev = GENESIS_PREV;
    for (let i = 0; i < lines.length; i++) {
      let e;
      try { e = JSON.parse(lines[i]); } catch (_) { return fail(i, 'Entry is not valid JSON'); }
      if (e.index !== i) return fail(i, 'Entry index does not match its position (an entry was removed, inserted or reordered)');
      if (e.prevHash !== prev) return fail(i, 'Link to the previous entry is broken');
      const { hash, ...rest } = e;
      if (hashEntry(rest) !== hash) return fail(i, 'Entry content does not match its hash (the record was altered)');
      prev = hash;
    }
    if (lines.length < this.entries.length) return fail(lines.length, 'Entries are missing from the end of the ledger (truncated)');
    if (lines.length > this.entries.length) return fail(this.entries.length, 'Entries were appended outside the application');
    if (prev !== this.head()) return fail(lines.length - 1, 'Chain head differs from the head the application recorded');
    return { ok: true, scope: this.scope, length: lines.length, head: prev, brokenAt: null, reason: null };
  }

  list({ action, actor, outcome, q, limit = 50, offset = 0 } = {}) {
    let rows = this.entries;
    if (action) rows = rows.filter((e) => e.action.startsWith(action));
    if (outcome) rows = rows.filter((e) => e.outcome === outcome);
    if (actor) rows = rows.filter((e) => e.actor && e.actor.username === actor);
    if (q) { const needle = q.toLowerCase(); rows = rows.filter((e) => JSON.stringify(e).toLowerCase().includes(needle)); }
    const total = rows.length;
    const page = rows.slice().reverse().slice(offset, offset + limit);
    return { total, entries: page };
  }
}

class LedgerSet {
  constructor(dir) {
    this.dir = dir;
    this.map = new Map();
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) {
      const m = /^ledger-([A-Za-z0-9_]+)\.jsonl$/.exec(f);
      if (m) this.map.set(m[1], new Ledger(path.join(dir, f), m[1]));
    }
    this.for('platform');
  }
  for(scope) {
    const key = scope || 'platform';
    if (!/^[A-Za-z0-9_]+$/.test(key)) throw new Error('bad ledger scope');
    if (!this.map.has(key)) this.map.set(key, new Ledger(path.join(this.dir, `ledger-${key}.jsonl`), key));
    return this.map.get(key);
  }
  scopes() { return [...this.map.keys()]; }
  append(scope, fields) { return this.for(scope).append(fields); }
  verifyAll() { return this.scopes().map((s) => this.for(s).verify()); }
}

module.exports = { Ledger, LedgerSet, canon, hashEntry, GENESIS_PREV };
