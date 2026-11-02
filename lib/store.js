'use strict';
// Small JSON-file store. One file per collection, atomic writes (temp file + rename).
// Everything lives under the data directory you control; nothing leaves the machine.
const fs = require('fs');
const path = require('path');

class Collection {
  constructor(dir, name) {
    this.file = path.join(dir, name + '.json');
    this.items = [];
    this.dirty = false;
    this.timer = null;
    try { this.items = JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw new Error(`Cannot read ${this.file}: ${e.message}`); }
  }
  all() { return this.items; }
  get(id) { return this.items.find((x) => x.id === id) || null; }
  find(fn) { return this.items.find(fn) || null; }
  filter(fn) { return this.items.filter(fn); }
  insert(obj) { this.items.push(obj); this.save(); return obj; }
  update(id, patch) { const o = this.get(id); if (!o) return null; Object.assign(o, patch); this.save(); return o; }
  remove(id) { const i = this.items.findIndex((x) => x.id === id); if (i < 0) return false; this.items.splice(i, 1); this.save(); return true; }
  removeWhere(fn) { const before = this.items.length; this.items = this.items.filter((x) => !fn(x)); if (this.items.length !== before) this.save(); return before - this.items.length; }
  save() {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 40);
    if (this.timer.unref) this.timer.unref();
  }
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.items));
    fs.renameSync(tmp, this.file);
  }
}

const NAMES = ['compinputs', 'compchecks', 'leads', 'appruns', 'tasks', 'exposure', 'losses', 'feedback', 'evalsets', 'evalruns', 'trainitems', 'custommodels', 'metrics', 'assessments', 'anchors', 'orgs', 'users', 'roles', 'nodes', 'deployments', 'conversations', 'knowledge', 'obstatus', 'custobs', 'evidence'];

function openStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'evidence-files'), { recursive: true });
  const s = { dir };
  for (const n of NAMES) s[n] = new Collection(dir, n);
  s.flush = () => { for (const n of NAMES) s[n].flush(); };
  return s;
}
module.exports = { openStore };
