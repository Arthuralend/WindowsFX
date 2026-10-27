/* Monomach: личный диск пользователя на сервере (папка data/users/<id>/disk) с лимитом места */
'use strict';
const fsp = require('fs/promises');
const fs = require('fs');
const path = require('path');

const err = (code, msg) => Object.assign(new Error(msg || code), { code });

async function treeSize(p) {
  let size = 0, files = 0, dirs = 0;
  const st = await fsp.lstat(p).catch(() => null);
  if (!st) return { size, files, dirs };
  if (!st.isDirectory()) return { size: st.size, files: 1, dirs: 0 };
  const walk = async d => {
    for (const e of await fsp.readdir(d, { withFileTypes: true })) {
      const q = path.join(d, e.name);
      if (e.isDirectory()) { dirs++; await walk(q); }
      else if (e.isFile()) { files++; size += (await fsp.stat(q)).size; }
    }
  };
  await walk(p);
  return { size, files, dirs };
}

class LocalDisk {
  /** @param root абсолютный путь папки; @param quota {get():{used,quota}, add(delta)} */
  constructor(root, quota) { this.root = root; this.q = quota; fs.mkdirSync(root, { recursive: true }); }

  abs(rel) {
    const p = path.resolve(this.root, '.' + path.posix.normalize('/' + (rel || '')));
    if (p !== this.root && !p.startsWith(this.root + path.sep)) throw err('EACCES', 'outside');
    return p;
  }
  async need(bytes) {
    if (bytes <= 0) return;
    const { used, quota } = await this.q.get();
    if (used + bytes > quota) throw err('ENOSPC', 'quota');
  }

  async stat(rel) {
    const st = await fsp.stat(this.abs(rel)).catch(() => null);
    return st ? { t: st.isDirectory() ? 'd' : 'f', s: st.isFile() ? st.size : 0, m: Math.round(st.mtimeMs) } : null;
  }
  async list(rel) {
    const d = this.abs(rel);
    const out = [];
    for (const e of await fsp.readdir(d, { withFileTypes: true }).catch(e => { throw err(e.code === 'ENOTDIR' ? 'ENOTDIR' : 'ENOENT'); })) {
      const st = await fsp.stat(path.join(d, e.name)).catch(() => null);
      if (st) out.push({ n: e.name, d: st.isDirectory(), s: st.isFile() ? st.size : 0, m: Math.round(st.mtimeMs) });
    }
    return out;
  }
  async read(rel, max) {
    const p = this.abs(rel);
    const st = await fsp.stat(p).catch(() => { throw err('ENOENT'); });
    if (st.isDirectory()) throw err('EISDIR');
    if (max && st.size > max) throw err('EFBIG');
    return fsp.readFile(p);
  }
  /** Поток для выдачи файла (с диапазоном) */
  async open(rel) {
    const p = this.abs(rel);
    const st = await fsp.stat(p).catch(() => null);
    if (!st || st.isDirectory()) throw err('ENOENT');
    return { size: st.size, mtime: st.mtimeMs, stream: (start, end) => fs.createReadStream(p, { start, end }) };
  }
  async write(rel, buf, append = false, mtime = 0) {
    const p = this.abs(rel);
    const old = await fsp.stat(p).catch(() => null);
    if (old && old.isDirectory()) throw err('EISDIR');
    const delta = append ? buf.length : buf.length - (old ? old.size : 0);
    await this.need(delta);
    await fsp.mkdir(path.dirname(p), { recursive: true });
    await (append ? fsp.appendFile(p, buf) : fsp.writeFile(p, buf));
    if (mtime) await fsp.utimes(p, new Date(), new Date(mtime)).catch(() => {});
    this.q.add(delta);
  }
  /** Запись из потока (загрузка файлов) */
  async writeStream(rel, stream, length) {
    const p = this.abs(rel);
    const old = await fsp.stat(p).catch(() => null);
    if (old && old.isDirectory()) throw err('EISDIR');
    if (length) await this.need(length - (old ? old.size : 0));
    await fsp.mkdir(path.dirname(p), { recursive: true });
    const tmp = p + '.part-' + Date.now();
    let n = 0;
    const { used, quota } = await this.q.get();
    const room = quota - used + (old ? old.size : 0);
    await new Promise((res, rej) => {
      const out = fs.createWriteStream(tmp);
      stream.on('data', c => { n += c.length; if (n > room) { stream.destroy(); out.destroy(); rej(err('ENOSPC')); } });
      stream.on('error', rej);
      out.on('error', rej);
      out.on('finish', res);
      stream.pipe(out);
    }).catch(async e => { await fsp.rm(tmp, { force: true }); throw e; });
    await fsp.rename(tmp, p);
    this.q.add(n - (old ? old.size : 0));
  }
  async mkdir(rel) {
    const p = this.abs(rel);
    if (fs.existsSync(p)) throw err('EEXIST');
    await fsp.mkdir(p, { recursive: true });
  }
  async rename(rel, name) {
    if (!name || /[\/\\]/.test(name) || name === '.' || name === '..') throw err('EINVAL');
    const p = this.abs(rel);
    const t = path.join(path.dirname(p), name);
    if (t.toLowerCase() !== p.toLowerCase() && fs.existsSync(t)) throw err('EEXIST');
    await fsp.rename(p, t);
    return path.posix.join(path.posix.dirname('/' + rel), name).slice(1);
  }
  async remove(rel) {
    const p = this.abs(rel);
    if (p === this.root) throw err('EACCES');
    const { size } = await treeSize(p);
    await fsp.rm(p, { recursive: true, force: true });
    this.q.add(-size);
  }
  async copy(a, b) {
    const pa = this.abs(a), pb = this.abs(b);
    if (fs.existsSync(pb)) throw err('EEXIST');
    if ((pb + path.sep).startsWith(pa + path.sep)) throw err('EINVAL');
    const { size } = await treeSize(pa);
    await this.need(size);
    await fsp.mkdir(path.dirname(pb), { recursive: true });
    await fsp.cp(pa, pb, { recursive: true, errorOnExist: true, preserveTimestamps: true });
    this.q.add(size);
  }
  async move(a, b) {
    const pa = this.abs(a), pb = this.abs(b);
    if (pa === this.root) throw err('EACCES');
    if (fs.existsSync(pb) && pa.toLowerCase() !== pb.toLowerCase()) throw err('EEXIST');
    if ((pb + path.sep).startsWith(pa + path.sep)) throw err('EINVAL');
    await fsp.mkdir(path.dirname(pb), { recursive: true });
    await fsp.rename(pa, pb);
  }
  async search(rel, q, limit = 200) {
    q = String(q || '').toLowerCase();
    const out = [];
    const walk = async (d, r) => {
      for (const e of await fsp.readdir(d, { withFileTypes: true }).catch(() => [])) {
        if (out.length >= limit) return;
        if (e.name.startsWith('.')) continue;
        const p = path.join(d, e.name), rr = r ? r + '/' + e.name : e.name;
        if (e.name.toLowerCase().includes(q)) {
          const st = await fsp.stat(p).catch(() => null);
          if (st) out.push({ n: e.name, d: st.isDirectory(), s: st.isFile() ? st.size : 0, m: Math.round(st.mtimeMs), rel: rr });
        }
        if (e.isDirectory()) await walk(p, rr);
      }
    };
    const base = rel ? rel.replace(/^\/+|\/+$/g, '') : '';
    await walk(this.abs(base), base);
    return out;
  }
  async usage(rel) { return treeSize(this.abs(rel)); }
}

module.exports = { LocalDisk, treeSize, err };
