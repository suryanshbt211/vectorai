'use strict';
// Knowledge documents: chunking and BM25 keyword retrieval, fully local.
// (Vector embeddings through an embedding model are a natural next step; this works with no extra model.)
const tok = (s) => String(s).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
const STOP = new Set('a an the and or of to in on for is are was were be been it this that with as at by from what which who how do does our we'.split(' '));

function chunk(text, size = 900, overlap = 120) {
  const paras = String(text).replace(/\r/g, '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  let cur = '';
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (const p of paras) {
    if (p.length > size) {
      push();
      for (let i = 0; i < p.length; i += size - overlap) out.push(p.slice(i, i + size));
    } else if ((cur + '\n\n' + p).length > size) { push(); cur = p; } else cur = cur ? cur + '\n\n' + p : p;
  }
  push();
  return out;
}

/** chunks: [{docId, title, n, text}] -> top k with BM25 score > 0 */
function search(chunks, query, k = 4) {
  const q = [...new Set(tok(query).filter((w) => w.length > 1 && !STOP.has(w)))];
  if (!q.length || !chunks.length) return [];
  const toks = chunks.map((c) => tok(c.text));
  const N = chunks.length;
  const avg = toks.reduce((a, t) => a + t.length, 0) / N || 1;
  const idf = {};
  for (const w of q) { let n = 0; for (const t of toks) if (t.includes(w)) n++; idf[w] = Math.log(1 + (N - n + 0.5) / (n + 0.5)); }
  const k1 = 1.4, b = 0.75;
  const scored = chunks.map((c, i) => {
    const t = toks[i];
    const tf = {};
    for (const w of t) tf[w] = (tf[w] || 0) + 1;
    let s = 0;
    for (const w of q) if (tf[w]) s += idf[w] * ((tf[w] * (k1 + 1)) / (tf[w] + k1 * (1 - b + (b * t.length) / avg)));
    return { chunk: c, score: s };
  }).filter((x) => x.score > 0);
  scored.sort((a, b2) => b2.score - a.score);
  return scored.slice(0, k);
}
module.exports = { chunk, search };
