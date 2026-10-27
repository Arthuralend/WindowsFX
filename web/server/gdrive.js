/* Monomach: Google Диск через Google Drive API v3 (вход через Google, OAuth 2.0).
   Пути относительные, как у LocalDisk; файлы Google Документов/Таблиц/Презентаций
   показываются как .docx/.xlsx/.pptx (экспорт при открытии). */
'use strict';
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { Readable, PassThrough } = require('stream');
const { err } = require('./localdisk');

const posix = path.posix;
const env = process.env;
const API = () => (env.GDRIVE_API || 'https://www.googleapis.com').replace(/\/$/, '');
const TOKEN_URL = () => env.GDRIVE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPE = 'https://www.googleapis.com/auth/drive openid email';
const FOLDER = 'application/vnd.google-apps.folder';
const GDOCS = {
  'application/vnd.google-apps.document': ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  'application/vnd.google-apps.spreadsheet': ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  'application/vnd.google-apps.presentation': ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  'application/vnd.google-apps.drawing': ['png', 'image/png'],
};
const FIELDS = 'id,name,mimeType,size,modifiedTime,parents';

const configured = () => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const q = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

function authUrl(redirectUri, state) {
  const u = new URL(AUTH_URL);
  u.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri, response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state }).toString();
  return u.toString();
}
async function exchangeCode(code, redirectUri) {
  const r = await fetch(TOKEN_URL(), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code' }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.refresh_token) throw err('EAUTH', 'Google не выдал доступ: ' + (j.error_description || j.error || r.status));
  return j;
}

class GDriveDisk {
  constructor({ refreshToken, tmpDir }) {
    this.refreshToken = refreshToken;
    this.tmpDir = tmpDir || os.tmpdir();
    this.access = null; this.exp = 0;
    this.ids = new Map();    // rel -> { id, at }
    this.lists = new Map();  // rel -> { at, items: [{n,d,s,m,id,mime}] }
    this.parts = new Map();
  }

  async token() {
    if (this.access && Date.now() < this.exp - 60e3) return this.access;
    const r = await fetch(TOKEN_URL(), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID || '', client_secret: env.GOOGLE_CLIENT_SECRET || '', refresh_token: this.refreshToken, grant_type: 'refresh_token' }) }).catch(e => { throw err('EIO', 'Нет связи с Google: ' + e.message); });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw err('EAUTH', 'Доступ к Google Диску отозван — подключите диск заново');
    this.access = j.access_token; this.exp = Date.now() + (j.expires_in || 3600) * 1000;
    return this.access;
  }
  async api(method, p, { query, body, headers = {}, ok = [200], raw = false } = {}) {
    const u = new URL(p.startsWith('http') ? p : API() + p);
    if (query) for (const [k, v] of Object.entries(query)) if (v != null) u.searchParams.set(k, v);
    const r = await fetch(u, { method, headers: { Authorization: 'Bearer ' + await this.token(), ...headers }, body, ...(body && typeof body.getReader === 'function' ? { duplex: 'half' } : {}) }).catch(e => { throw err('EIO', 'Нет связи с Google: ' + e.message); });
    if (!ok.includes(r.status)) {
      const t = await r.text().catch(() => '');
      if (r.status === 401) { this.access = null; throw err('EAUTH', 'Google отклонил доступ'); }
      if (r.status === 404) throw err('ENOENT');
      if (r.status === 403 && /storageQuotaExceeded/.test(t)) throw err('ENOSPC', 'На Google Диске закончилось место');
      throw err('EIO', `Google Диск: ошибка ${r.status} ${t.slice(0, 160)}`);
    }
    if (raw) return r;
    return r.status === 204 ? null : r.json();
  }

  invalidate(rel) {
    rel = rel || '';
    const par = posix.dirname(rel) === '.' ? '' : posix.dirname(rel);
    this.lists.delete(rel); this.lists.delete(par);
    for (const k of [...this.ids.keys()]) if (k === rel || k.startsWith(rel + '/')) this.ids.delete(k);
    for (const k of [...this.lists.keys()]) if (k.startsWith(rel + '/')) this.lists.delete(k);
  }

  /** Имя в списке (для документов Google — с расширением экспорта) */
  static display(f) {
    const g = GDOCS[f.mimeType];
    return g && !f.name.toLowerCase().endsWith('.' + g[0]) ? f.name + '.' + g[0] : f.name;
  }
  async children(rel) {
    rel = rel || '';
    const c = this.lists.get(rel);
    if (c && Date.now() - c.at < 3000) return c.items;
    const pid = rel ? (await this.entry(rel))?.id : 'root';
    if (!pid) throw err('ENOENT');
    const items = [];
    const seen = new Set();
    let pageToken;
    do {
      const j = await this.api('GET', '/drive/v3/files', { query: { q: `'${q(pid)}' in parents and trashed=false`, fields: `nextPageToken,files(${FIELDS})`, pageSize: 1000, pageToken, spaces: 'drive' } });
      for (const f of j.files || []) {
        let n = GDriveDisk.display(f);
        if (seen.has(n.toLowerCase())) { const e = posix.extname(n); n = n.slice(0, n.length - e.length) + ' (' + f.id.slice(0, 4) + ')' + e; }
        seen.add(n.toLowerCase());
        const d = f.mimeType === FOLDER;
        items.push({ n, d, s: d ? 0 : +(f.size || 0), m: Date.parse(f.modifiedTime) || 0, id: f.id, mime: f.mimeType });
      }
      pageToken = j.nextPageToken;
    } while (pageToken);
    this.lists.set(rel, { at: Date.now(), items });
    const base = rel ? rel + '/' : '';
    for (const i of items) this.ids.set(base + i.n, { id: i.id, d: i.d, mime: i.mime, at: Date.now() });
    return items;
  }
  async entry(rel) {
    if (!rel) return { id: 'root', d: true };
    const c = this.ids.get(rel);
    if (c && Date.now() - c.at < 30e3) return c;
    const par = posix.dirname(rel) === '.' ? '' : posix.dirname(rel);
    const items = await this.children(par).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    if (!items) return null;
    const i = items.find(x => x.n === posix.basename(rel));
    return i ? { id: i.id, d: i.d, mime: i.mime, s: i.s, m: i.m } : null;
  }

  async check() { await this.token(); await this.children(''); return true; }
  async about() { return this.api('GET', '/drive/v3/about', { query: { fields: 'user(emailAddress,displayName),storageQuota' } }); }
  async space() {
    const a = await this.about();
    const sq = a.storageQuota || {};
    const total = +sq.limit || 0, used = +sq.usage || 0;
    return total ? { total, free: Math.max(0, total - used) } : null;
  }

  async stat(rel) {
    if (!rel) return { t: 'd', s: 0, m: 0 };
    const par = posix.dirname(rel) === '.' ? '' : posix.dirname(rel);
    const items = await this.children(par).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    const i = items && items.find(x => x.n === posix.basename(rel));
    return i ? { t: i.d ? 'd' : 'f', s: i.s, m: i.m } : null;
  }
  async list(rel) { return (await this.children(rel)).map(({ n, d, s, m }) => ({ n, d, s, m })); }

  async fetchMedia(e, range) {
    const g = GDOCS[e.mime];
    if (g) return this.api('GET', `/drive/v3/files/${e.id}/export`, { query: { mimeType: g[1] }, raw: true });
    return this.api('GET', `/drive/v3/files/${e.id}`, { query: { alt: 'media' }, headers: range ? { Range: range } : {}, ok: [200, 206], raw: true });
  }
  async read(rel, max) {
    const e = await this.entry(rel);
    if (!e) throw err('ENOENT');
    if (e.d) throw err('EISDIR');
    if (max && e.s > max) throw err('EFBIG');
    const r = await this.fetchMedia(e);
    const buf = Buffer.from(await r.arrayBuffer());
    if (max && buf.length > max) throw err('EFBIG');
    return buf;
  }
  async open(rel) {
    const e = await this.entry(rel);
    if (!e || e.d) throw err('ENOENT');
    if (GDOCS[e.mime]) {
      const buf = await this.read(rel);
      return { size: buf.length, mtime: e.m || Date.now(), stream: (s, en) => Readable.from(buf.subarray(s, en + 1)) };
    }
    const st = await this.stat(rel);
    const self = this;
    return {
      size: st.s, mtime: st.m || Date.now(),
      stream(start, end) {
        const out = new PassThrough();
        self.fetchMedia(e, start === 0 && end === st.s - 1 ? null : `bytes=${start}-${end}`)
          .then(r => { const s = Readable.fromWeb(r.body); s.on('error', x => out.destroy(x)); s.pipe(out); })
          .catch(x => out.destroy(x));
        return out;
      },
    };
  }

  async ensureDir(rel) {
    if (!rel) return 'root';
    const e = await this.entry(rel);
    if (e) { if (!e.d) throw err('ENOTDIR'); return e.id; }
    const pid = await this.ensureDir(posix.dirname(rel) === '.' ? '' : posix.dirname(rel));
    const f = await this.api('POST', '/drive/v3/files', { query: { fields: FIELDS }, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: posix.basename(rel), mimeType: FOLDER, parents: [pid] }) });
    this.invalidate(rel);
    return f.id;
  }
  /** Загрузка содержимого (возобновляемая загрузка Drive API — подходит для любых размеров) */
  async upload(rel, body, length) {
    const e = await this.entry(rel);
    if (e && e.d) throw err('EISDIR');
    if (e && GDOCS[e.mime]) throw err('EACCES', 'Документы Google нельзя перезаписать — сохраните под другим именем');
    let init;
    if (e) init = await this.api('PATCH', `/upload/drive/v3/files/${e.id}`, { query: { uploadType: 'resumable', fields: FIELDS }, headers: { 'Content-Type': 'application/json', 'X-Upload-Content-Length': String(length) }, body: '{}', raw: true });
    else {
      const pid = await this.ensureDir(posix.dirname(rel) === '.' ? '' : posix.dirname(rel));
      init = await this.api('POST', '/upload/drive/v3/files', { query: { uploadType: 'resumable', fields: FIELDS }, headers: { 'Content-Type': 'application/json', 'X-Upload-Content-Length': String(length) }, body: JSON.stringify({ name: posix.basename(rel), parents: [pid] }), raw: true });
    }
    const loc = init.headers.get('location');
    if (!loc) throw err('EIO', 'Google Диск не начал загрузку');
    await this.api('PUT', loc, { body, headers: { 'Content-Length': String(length) }, ok: [200, 201] });
    this.invalidate(rel);
  }
  async write(rel, buf, append = false) {
    if (append) {
      const old = await this.read(rel).catch(x => { if (x.code === 'ENOENT') return Buffer.alloc(0); throw x; });
      buf = Buffer.concat([old, buf]);
    }
    await this.upload(rel, buf, buf.length);
  }
  async writeStream(rel, stream) {
    const tmp = path.join(this.tmpDir, 'mm-gup-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    await new Promise((res, rej) => { const o = fs.createWriteStream(tmp); stream.on('error', rej); o.on('error', rej); o.on('finish', res); stream.pipe(o); });
    try { const { size } = await fsp.stat(tmp); await this.upload(rel, Readable.toWeb(fs.createReadStream(tmp)), size); }
    finally { await fsp.rm(tmp, { force: true }); }
  }
  async writeChunk(rel, buf, append, done) {
    let tmp = this.parts.get(rel);
    if (!append || !tmp) {
      if (tmp) await fsp.rm(tmp, { force: true });
      tmp = path.join(this.tmpDir, 'mm-gch-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      this.parts.set(rel, tmp);
      await fsp.writeFile(tmp, buf);
    } else await fsp.appendFile(tmp, buf);
    if (!done) return;
    this.parts.delete(rel);
    try { const { size } = await fsp.stat(tmp); await this.upload(rel, Readable.toWeb(fs.createReadStream(tmp)), size); }
    finally { await fsp.rm(tmp, { force: true }); }
  }

  async mkdir(rel) {
    if (await this.stat(rel)) throw err('EEXIST');
    await this.ensureDir(rel);
  }
  async rename(rel, name) {
    if (!name || /[\/\\]/.test(name) || name === '.' || name === '..') throw err('EINVAL');
    const e = await this.entry(rel);
    if (!e) throw err('ENOENT');
    const to = (posix.dirname(rel) === '.' ? '' : posix.dirname(rel) + '/') + name;
    if (to.toLowerCase() !== rel.toLowerCase() && await this.stat(to)) throw err('EEXIST');
    await this.api('PATCH', `/drive/v3/files/${e.id}`, { query: { fields: FIELDS }, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    this.invalidate(rel); this.invalidate(to);
    return to;
  }
  /** Удаление — в корзину Google Диска (файл можно восстановить на drive.google.com) */
  async remove(rel) {
    if (!rel) throw err('EACCES');
    const e = await this.entry(rel);
    if (!e) return;
    await this.api('PATCH', `/drive/v3/files/${e.id}`, { query: { fields: 'id' }, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
    this.invalidate(rel);
  }
  async copy(a, b) {
    const e = await this.entry(a);
    if (!e) throw err('ENOENT');
    if (await this.stat(b)) throw err('EEXIST');
    if (e.d) {
      await this.ensureDir(b);
      for (const i of await this.children(a)) await this.copy(a + '/' + i.n, b + '/' + i.n);
    } else {
      const pid = await this.ensureDir(posix.dirname(b) === '.' ? '' : posix.dirname(b));
      await this.api('POST', `/drive/v3/files/${e.id}/copy`, { query: { fields: FIELDS }, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: posix.basename(b), parents: [pid] }) });
    }
    this.invalidate(b);
  }
  async move(a, b) {
    if (!a) throw err('EACCES');
    const e = await this.entry(a);
    if (!e) throw err('ENOENT');
    if (a.toLowerCase() !== b.toLowerCase() && await this.stat(b)) throw err('EEXIST');
    if ((b + '/').startsWith(a + '/')) throw err('EINVAL');
    const from = posix.dirname(a) === '.' ? '' : posix.dirname(a), toDir = posix.dirname(b) === '.' ? '' : posix.dirname(b);
    const query = { fields: FIELDS };
    if (from !== toDir) {
      const oldP = (await this.entry(from)).id, newP = await this.ensureDir(toDir);
      Object.assign(query, { addParents: newP, removeParents: oldP });
    }
    await this.api('PATCH', `/drive/v3/files/${e.id}`, { query, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: posix.basename(b) }) });
    this.invalidate(a); this.invalidate(b);
  }
  async search(rel, qs, limit = 200) {
    // поиск по всему диску по имени, затем фильтр по папке
    const j = await this.api('GET', '/drive/v3/files', { query: { q: `name contains '${q(qs)}' and trashed=false`, fields: `files(${FIELDS})`, pageSize: Math.min(limit, 200) } });
    const out = [];
    for (const f of j.files || []) {
      const p = await this.pathOf(f).catch(() => null);
      if (p == null) continue;
      if (rel && !(p === rel || p.startsWith(rel.replace(/\/$/, '') + '/'))) continue;
      const d = f.mimeType === FOLDER;
      out.push({ n: GDriveDisk.display(f), d, s: d ? 0 : +(f.size || 0), m: Date.parse(f.modifiedTime) || 0, rel: p });
    }
    return out;
  }
  async pathOf(f, depth = 0) {
    if (depth > 30) return null;
    const pid = (f.parents || [])[0];
    if (!pid) return null;
    const rootId = this.rootId || (this.rootId = (await this.api('GET', '/drive/v3/files/root', { query: { fields: 'id' } })).id);
    const name = GDriveDisk.display(f);
    if (pid === rootId) return name;
    const p = await this.api('GET', `/drive/v3/files/${pid}`, { query: { fields: FIELDS } });
    const pp = await this.pathOf(p, depth + 1);
    return pp == null ? null : pp + '/' + name;
  }
}

module.exports = { GDriveDisk, configured, authUrl, exchangeCode };
