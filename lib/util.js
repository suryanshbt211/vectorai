'use strict';
const crypto = require('crypto');

class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code || null; }
}
const id = (prefix) => prefix + '_' + crypto.randomBytes(7).toString('hex');
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const now = () => new Date().toISOString();

function str(v, max, name, { required = true } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError(400, `${name} is required`);
    return '';
  }
  if (typeof v !== 'string') throw new HttpError(400, `${name} must be text`);
  const s = v.trim();
  if (required && !s) throw new HttpError(400, `${name} is required`);
  if (s.length > max) throw new HttpError(400, `${name} is too long (max ${max} characters)`);
  return s;
}
function oneOf(v, list, name) {
  if (!list.includes(v)) throw new HttpError(400, `${name} must be one of: ${list.join(', ')}`);
  return v;
}
function num(v, min, max, name, dflt) {
  if (v === undefined || v === null || v === '') return dflt;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${name} must be a number between ${min} and ${max}`);
  return n;
}
function randomPassword() { return crypto.randomBytes(12).toString('base64url'); }

module.exports = { HttpError, id, sha256, now, str, oneOf, num, randomPassword };
