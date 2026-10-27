/* Monomach: облачный диск по протоколу WebDAV (Яндекс Диск, Облако Mail.ru, Nextcloud, любой WebDAV).
   Интерфейс тот же, что у LocalDisk: пути относительные (без ведущей «/»). */
'use strict';
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { Readable, PassThrough } = require('stream');
const { err } = require('./localdisk');

const posix = path.posix;
const UA = 'Monomach/1.0 (WebDAV)';

/** Разбор ответа PROPFIND (multistatus) без внешних библиотек; префиксы пространств имён любые */
function parseMultistatus(xml) {
  const out = [];
  const tag = n => `<(?:[\\w-]+:)?${n}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${n}>`;
  const one = (s, n) => { const m = new RegExp(tag(n), 'i').exec(s); return m ? m[1].trim() : null; };
  const resRe = new RegExp(tag('response'), 'gi');
  let m;
  while ((m = resRe.exec(xml))) {
    const r = m[1];
    const href = one(r, 'href');
    if (href == null) continue;
    // берём только propstat со статусом 200
    let props = '';
    const psRe = new RegExp(tag('propstat'), 'gi');
    let ps;
    while ((ps = psRe.exec(r))) { const st = one(ps[1], 'status') || ''; if (!st || / 200 /.test(st + ' ')) props += ps[1]; }
    if (!props) props = r;
    const rt = new RegExp(`<(?:[\\w-]+:)?resourcetype\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?resourcetype>`, 'i').exec(props);
    const isDir = !!(rt && /collection/i.test(rt[1]));
    const len = one(props, 'getcontentlength');
    const mod = one(props, 'getlastmodified');
    const qa = one(props, 'quota-available-bytes'), qu = one(props, 'quota-used-bytes');
    out.push({
      href: decodeXml(href), d: isDir, s: len ? +len || 0 : 0, m: mod ? Date.parse(decodeXml(mod)) || 0 : 0,
      quota: qa != null || qu != null ? { free: +qa || 0, used: +qu || 0 } : null,
    });
  }
  return out;
}
const decodeXml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
const PROPS = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>';
const QPROPS = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:quota-available-bytes/><d:quota-used-bytes/></d:prop></d:propfind>';

function httpErr(status, what) {
  if (status === 401 || status === 403) return err('EAUTH', 'Сервер отклонил логин или пароль' + (what ? ' (' + what + ')' : ''));
  if (status === 404 || status === 410) return err('ENOENT');
  if (status === 405 && what === 'MKCOL') return err('EEXIST');
  if (status === 412) return err('EEXIST');
  if (status === 507) return err('ENOSPC', 'На облачном диске закончилось место');
  if (status === 413) return err('EFBIG');
  return err('EIO', `Облачный диск ответил ошибкой ${status}${what ? ' на ' + what : ''}`);
}

class WebDAVDisk {
  /** @param url адрес корня, например https://webdav.yandex.ru/ ; tmpDir — для частичных загрузок */
  constructor({ url, username, password, tmpDir }) {
    this.base = new URL(url.endsWith('/') ? url : url + '/');
    this.basePath = this.base.pathname;
    this.auth = 'Basic ' + Buffer.from(`${username || ''}:${password || ''}`).toString('base64');
    this.tmpDir = tmpDir || os.tmpdir();
    this.cache = new Map(); // rel -> { at, list }
    this.parts = new Map(); // rel -> временный файл writeChunk
  }

  href(rel, dir = false) {
    const enc = String(rel || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
    return new URL(enc + (dir && enc ? '/' : ''), this.base).toString();
  }
  async req(method, rel, { headers = {}, body, dir = false, ok = [200, 201, 204, 207], what, duplex } = {}) {
    const url = typeof rel === 'string' && /^https?:/.test(rel) ? rel : this.href(rel, dir);
    let r;
    try {
      r = await fetch(url, { method, headers: { Authorization: this.auth, 'User-Agent': UA, ...headers }, body, redirect: 'follow', ...(duplex ? { duplex } : {}), signal: AbortSignal.timeout(method === 'GET' || method === 'PUT' ? 30 * 60e3 : 60e3) });
    } catch (e) {
      throw err('EIO', 'Нет связи с облачным диском: ' + (e.cause?.code || e.message));
    }
    if (!ok.includes(r.status)) { await r.body?.cancel().catch(() => {}); throw httpErr(r.status, what || method); }
    return r;
  }
  invalidate(rel) {
    rel = rel || '';
    this.cache.delete(rel);
    this.cache.delete(posix.dirname(rel) === '.' ? '' : posix.dirname(rel));
    for (const k of this.cache.keys()) if (k.startsWith(rel + '/')) this.cache.delete(k);
  }
  relOf(href) {
    let p;
    try { p = decodeURIComponent(new URL(href, this.base).pathname); } catch { return null; }
    const bp = decodeURIComponent(this.basePath);
    if (!p.startsWith(bp.replace(/\/$/, ''))) return null;
    return p.slice(bp.length).replace(/^\/+|\/+$/g, '');
  }

  async propfind(rel, depth) {
    const r = await this.req('PROPFIND', rel, { headers: { Depth: String(depth), 'Content-Type': 'application/xml; charset=utf-8' }, body: PROPS, dir: depth > 0, ok: [207, 200], what: 'PROPFIND' });
    return parseMultistatus(await r.text());
  }

  /** Проверка подключения (при добавлении диска) */
  async check() { await this.propfind('', 0).catch(async e => { if (e.code === 'ENOENT') await this.propfind('', 1); else throw e; }); return true; }

  async space() {
    const r = await this.req('PROPFIND', '', { headers: { Depth: '0', 'Content-Type': 'application/xml; charset=utf-8' }, body: QPROPS, dir: true, ok: [207, 200] });
    const q = parseMultistatus(await r.text()).find(x => x.quota);
    if (!q || !q.quota) return null;
    return { total: q.quota.free + q.quota.used, free: q.quota.free };
  }

  async stat(rel) {
    rel = rel || '';
    if (!rel) return { t: 'd', s: 0, m: 0 };
    const parent = posix.dirname(rel) === '.' ? '' : posix.dirname(rel);
    const c = this.cache.get(parent);
    if (c && Date.now() - c.at < 4000) {
      const i = c.list.find(x => x.n === posix.basename(rel));
      return i ? { t: i.d ? 'd' : 'f', s: i.s, m: i.m } : null;
    }
    try {
      const [e] = await this.propfind(rel, 0);
      return e ? { t: e.d ? 'd' : 'f', s: e.s, m: e.m } : null;
    } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  }

  async list(rel) {
    rel = rel || '';
    const c = this.cache.get(rel);
    if (c && Date.now() - c.at < 2000) return c.list;
    const items = await this.propfind(rel, 1);
    const out = [];
    for (const e of items) {
      const r = this.relOf(e.href);
      if (r == null || r === rel || r === '') continue;
      const n = posix.basename(r);
      if (posix.dirname(r) !== (rel || '.') && !(rel === '' && !r.includes('/'))) continue;
      out.push({ n, d: e.d, s: e.s, m: e.m });
    }
    this.cache.set(rel, { at: Date.now(), list: out });
    return out;
  }

  async read(rel, max) {
    const r = await this.req('GET', rel, { ok: [200], what: 'чтение' });
    const len = +(r.headers.get('content-length') || 0);
    if (max && len > max) { await r.body?.cancel().catch(() => {}); throw err('EFBIG'); }
    const buf = Buffer.from(await r.arrayBuffer());
    if (max && buf.length > max) throw err('EFBIG');
    return buf;
  }

  /** Поток с поддержкой диапазона (видео, музыка, PDF) */
  async open(rel) {
    const st = await this.stat(rel);
    if (!st || st.t === 'd') throw err('ENOENT');
    const self = this;
    return {
      size: st.s, mtime: st.m || Date.now(),
      stream(start, end) {
        const out = new PassThrough();
        const full = start === 0 && end === st.s - 1;
        self.req('GET', rel, { headers: full ? {} : { Range: `bytes=${start}-${end}` }, ok: [200, 206] }).then(r => {
          let s = Readable.fromWeb(r.body);
          if (!full && r.status === 200) {
            // сервер не поддерживает Range — вырезаем нужный кусок сами
            let pos = 0;
            const cut = new PassThrough();
            s.on('data', ch => { const a = Math.max(0, start - pos), b = Math.min(ch.length, end + 1 - pos); if (b > a) cut.write(ch.subarray(a, b)); pos += ch.length; if (pos > end) { s.destroy(); cut.end(); } });
            s.on('end', () => cut.end());
            s = cut;
          }
          s.on('error', e => out.destroy(e));
          s.pipe(out);
        }).catch(e => out.destroy(e));
        return out;
      },
    };
  }

  async ensureParents(rel) {
    const parts = rel.split('/').slice(0, -1);
    let cur = '';
    for (const p of parts) {
      cur = cur ? cur + '/' + p : p;
      const st = await this.stat(cur);
      if (!st) await this.req('MKCOL', cur, { dir: true, ok: [201, 405], what: 'MKCOL' });
    }
  }

  async write(rel, buf, append = false) {
    if (append) {
      const old = await this.read(rel).catch(e => { if (e.code === 'ENOENT') return Buffer.alloc(0); throw e; });
      buf = Buffer.concat([old, buf]);
    }
    await this.put(rel, buf, buf.length);
  }
  async put(rel, body, length, duplex) {
    const doPut = () => this.req('PUT', rel, { body, headers: { 'Content-Type': 'application/octet-stream', ...(length != null ? { 'Content-Length': String(length) } : {}) }, ok: [200, 201, 204], what: 'запись', duplex });
    try { await doPut(); }
    catch (e) {
      if (e.code !== 'EIO' && e.code !== 'ENOENT') throw e;
      if (duplex) throw e; // поток уже прочитан — повторить нельзя
      await this.ensureParents(rel);
      await doPut();
    }
    this.invalidate(rel);
  }
  /** Загрузка из потока: сначала во временный файл (нужна длина), затем PUT */
  async writeStream(rel, stream) {
    const tmp = path.join(this.tmpDir, 'mm-up-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    await new Promise((res, rej) => { const o = fs.createWriteStream(tmp); stream.on('error', rej); o.on('error', rej); o.on('finish', res); stream.pipe(o); });
    try {
      const { size } = await fsp.stat(tmp);
      await this.ensureParents(rel);
      await this.put(rel, Readable.toWeb(fs.createReadStream(tmp)), size, 'half');
    } finally { await fsp.rm(tmp, { force: true }); }
  }
  /** Запись крупного файла частями (копирование с рабочего стола, архиватор) */
  async writeChunk(rel, buf, append, done) {
    let tmp = this.parts.get(rel);
    if (!append || !tmp) {
      if (tmp) await fsp.rm(tmp, { force: true });
      tmp = path.join(this.tmpDir, 'mm-ch-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      this.parts.set(rel, tmp);
      await fsp.writeFile(tmp, buf);
    } else await fsp.appendFile(tmp, buf);
    if (!done) return;
    this.parts.delete(rel);
    try {
      const { size } = await fsp.stat(tmp);
      await this.ensureParents(rel);
      await this.put(rel, Readable.toWeb(fs.createReadStream(tmp)), size, 'half');
    } finally { await fsp.rm(tmp, { force: true }); }
  }

  async mkdir(rel) {
    if (await this.stat(rel)) throw err('EEXIST');
    await this.ensureParents(rel);
    await this.req('MKCOL', rel, { dir: true, ok: [201], what: 'MKCOL' });
    this.invalidate(rel);
  }
  async rename(rel, name) {
    if (!name || /[\/\\]/.test(name) || name === '.' || name === '..') throw err('EINVAL');
    const to = (posix.dirname(rel) === '.' ? '' : posix.dirname(rel) + '/') + name;
    await this.move(rel, to);
    return to;
  }
  async remove(rel) {
    if (!rel) throw err('EACCES');
    const st = await this.stat(rel);
    await this.req('DELETE', rel, { dir: st && st.t === 'd', ok: [200, 204, 404], what: 'удаление' });
    this.invalidate(rel);
  }
  async copy(a, b) {
    if (await this.stat(b)) throw err('EEXIST');
    const st = await this.stat(a);
    if (!st) throw err('ENOENT');
    await this.ensureParents(b);
    await this.req('COPY', a, { dir: st.t === 'd', headers: { Destination: this.href(b, st.t === 'd'), Overwrite: 'F', Depth: 'infinity' }, ok: [201, 204], what: 'копирование' });
    this.invalidate(b);
  }
  async move(a, b) {
    if (!a) throw err('EACCES');
    const st = await this.stat(a);
    if (!st) throw err('ENOENT');
    if (a.toLowerCase() !== b.toLowerCase() && await this.stat(b)) throw err('EEXIST');
    if ((b + '/').startsWith(a + '/')) throw err('EINVAL');
    await this.ensureParents(b);
    await this.req('MOVE', a, { dir: st.t === 'd', headers: { Destination: this.href(b, st.t === 'd'), Overwrite: 'F' }, ok: [201, 204], what: 'перемещение' });
    this.invalidate(a); this.invalidate(b);
  }
  /** Поиск по имени: обход папок (не глубже 6 уровней и не более 3000 папок) */
  async search(rel, q, limit = 200) {
    q = String(q || '').toLowerCase();
    const out = [];
    let dirs = 0;
    const walk = async (d, depth) => {
      if (out.length >= limit || dirs++ > 3000 || depth > 6) return;
      for (const i of await this.list(d).catch(() => [])) {
        if (out.length >= limit) return;
        if (i.n.startsWith('.')) continue;
        const r = d ? d + '/' + i.n : i.n;
        if (i.n.toLowerCase().includes(q)) out.push({ ...i, rel: r });
        if (i.d) await walk(r, depth + 1);
      }
    };
    await walk(rel ? rel.replace(/^\/+|\/+$/g, '') : '', 0);
    return out;
  }
}

/** Готовые адреса облаков */
const PRESETS = {
  yandex: { url: 'https://webdav.yandex.ru/', label: 'Яндекс Диск' },
  mailru: { url: 'https://webdav.cloud.mail.ru/', label: 'Облако Mail.ru' },
};

module.exports = { WebDAVDisk, PRESETS, parseMultistatus };
