/* Monomach: пароли, сессии, защита от подбора */
'use strict';
const crypto = require('crypto');

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 64, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${h.toString('base64')}`;
}
function checkPassword(pw, stored) {
  const [alg, s, h] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !s || !h) return false;
  const want = Buffer.from(h, 'base64');
  const got = crypto.scryptSync(String(pw), Buffer.from(s, 'base64'), want.length, SCRYPT);
  return crypto.timingSafeEqual(want, got);
}

const newToken = () => crypto.randomBytes(32).toString('base64url');
const tokenId = t => crypto.createHash('sha256').update(String(t)).digest('hex');

function parseCookies(h) {
  const out = {};
  String(h || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

/** Ограничение попыток входа: не больше `max` неудачных за `windowMs` с одного IP и для одного логина */
class Limiter {
  constructor(max = 8, windowMs = 15 * 60e3) { this.max = max; this.win = windowMs; this.m = new Map(); }
  _get(k) { const now = Date.now(); const a = (this.m.get(k) || []).filter(t => now - t < this.win); this.m.set(k, a); return a; }
  blocked(...keys) { return keys.some(k => this._get(k).length >= this.max); }
  fail(...keys) { const now = Date.now(); keys.forEach(k => this._get(k).push(now)); }
  reset(...keys) { keys.forEach(k => this.m.delete(k)); }
  retryAfter(...keys) {
    let t = 0;
    for (const k of keys) { const a = this._get(k); if (a.length >= this.max) t = Math.max(t, this.win - (Date.now() - a[0])); }
    return Math.ceil(t / 60e3);
  }
}

/** Кратко: браузер и система по User-Agent (для журнала) */
function describeUA(ua) {
  ua = String(ua || '');
  const os = /Windows NT 10/.test(ua) ? 'Windows' : /Windows/.test(ua) ? 'Windows' : /iPad/.test(ua) ? 'iPadOS' : /iPhone/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '';
  const br = /YaBrowser\/(\d+)/.exec(ua) ? 'Яндекс Браузер' : /Edg\/(\d+)/.test(ua) ? 'Edge' : /OPR\/(\d+)/.test(ua) ? 'Opera'
    : /Firefox\/(\d+)/.test(ua) ? 'Firefox' : /Chrome\/(\d+)/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return [br, os].filter(Boolean).join(', ') || (ua ? ua.slice(0, 60) : '—');
}

/** Шифрование паролей облачных дисков ключом сервера */
function cipher(keyB64) {
  const key = Buffer.from(keyB64, 'base64');
  return {
    enc(text) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
      return [iv, c.getAuthTag(), body].map(b => b.toString('base64')).join('.');
    },
    dec(s) {
      const [iv, tag, body] = String(s).split('.').map(x => Buffer.from(x, 'base64'));
      const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(body), d.final()]).toString('utf8');
    },
  };
}

module.exports = { hashPassword, checkPassword, newToken, tokenId, parseCookies, Limiter, describeUA, cipher };
