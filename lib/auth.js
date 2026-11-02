'use strict';
const crypto = require('crypto');
const { sha256 } = require('./util');

const SCRYPT_N = 16384;
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(pw, salt, 64, { N: SCRYPT_N });
  return `scrypt$${SCRYPT_N}$${salt.toString('base64')}$${dk.toString('base64')}`;
}
function verifyPassword(pw, stored) {
  try {
    const [alg, n, saltB64, hashB64] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(hashB64, 'base64');
    const dk = crypto.scryptSync(pw, Buffer.from(saltB64, 'base64'), expected.length, { N: Number(n) });
    return crypto.timingSafeEqual(dk, expected);
  } catch (_) { return false; }
}
// A throwaway hash so unknown usernames cost the same time as wrong passwords.
const DUMMY = hashPassword('not-a-real-password');

class Sessions {
  constructor(idleMs = 4 * 3600 * 1000, maxMs = 12 * 3600 * 1000) { this.map = new Map(); this.idleMs = idleMs; this.maxMs = maxMs; }
  create(userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const t = Date.now();
    this.map.set(sha256(token), { userId, created: t, seen: t });
    return token;
  }
  get(token) {
    if (!token) return null;
    const key = sha256(token);
    const s = this.map.get(key);
    if (!s) return null;
    const t = Date.now();
    if (t - s.seen > this.idleMs || t - s.created > this.maxMs) { this.map.delete(key); return null; }
    s.seen = t;
    return s;
  }
  destroy(token) { if (token) this.map.delete(sha256(token)); }
  destroyUser(userId) { for (const [k, s] of this.map) if (s.userId === userId) this.map.delete(k); }
}

class LoginLimiter {
  constructor(max = 5, windowMs = 10 * 60 * 1000) { this.max = max; this.windowMs = windowMs; this.map = new Map(); }
  locked(key) {
    const r = this.map.get(key);
    if (!r) return false;
    if (Date.now() - r.first > this.windowMs) { this.map.delete(key); return false; }
    return r.count >= this.max;
  }
  fail(key) {
    const r = this.map.get(key);
    if (!r || Date.now() - r.first > this.windowMs) this.map.set(key, { count: 1, first: Date.now() });
    else r.count++;
  }
  clear(key) { this.map.delete(key); }
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

module.exports = { hashPassword, verifyPassword, DUMMY, Sessions, LoginLimiter, parseCookies };
