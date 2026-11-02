#!/usr/bin/env node
'use strict';
// Offline ledger verifier. Works on a ledger-*.jsonl file from the data directory or on a JSON file
// exported from the Audit screen. It needs nothing from the running application.
//   node scripts/verify-ledger.js data/ledger/ledger-platform.jsonl
//   node scripts/verify-ledger.js vector-ledger-org_ab12-2026-10-31.json [expectedHeadHash]
const fs = require('fs');
const { hashEntry, GENESIS_PREV } = require('../lib/ledger');

const [file, expectedHead] = process.argv.slice(2);
if (!file) { console.error('Usage: node scripts/verify-ledger.js <ledger.jsonl | export.json> [expectedHeadHash]'); process.exit(2); }

let entries;
const raw = fs.readFileSync(file, 'utf8');
try {
  if (file.endsWith('.jsonl')) entries = raw.split('\n').filter(Boolean).map((l, i) => { try { return JSON.parse(l); } catch (e) { throw new Error(`line ${i + 1} is not valid JSON`); } });
  else entries = JSON.parse(raw).entries;
} catch (e) { console.error('FAIL: cannot read ledger: ' + e.message); process.exit(1); }

let prev = GENESIS_PREV;
for (let i = 0; i < entries.length; i++) {
  const e = entries[i];
  const { hash, ...rest } = e;
  const fail = (why) => { console.error(`FAIL at entry ${i}: ${why}`); process.exit(1); };
  if (e.index !== i) fail('index does not match position (entry removed, inserted or reordered)');
  if (e.prevHash !== prev) fail('link to previous entry is broken');
  if (hashEntry(rest) !== hash) fail('content does not match its hash (record altered)');
  prev = hash;
}
if (expectedHead && expectedHead !== prev) { console.error(`FAIL: chain is internally consistent but its head ${prev} differs from the head you recorded (${expectedHead}). Entries may have been truncated or replaced.`); process.exit(1); }
console.log(`OK: ${entries.length} entries, chain intact. Head: ${prev}`);
if (!expectedHead) console.log('Tip: store the head hash somewhere outside this machine and pass it as the second argument to detect truncation or wholesale replacement.');
