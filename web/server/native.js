/* Monomach: серверная реализация моста FXNative для рабочего стола.
   Пути вида /disk/… — личный диск пользователя; /cloud/<id>/… — подключённые облачные диски. */
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { LocalDisk, treeSize, err } = require('./localdisk');

const posix = path.posix;
const TRASH = '.WindowsFX/RecycleBin';

class UserSpace {
  constructor(ctx, user) {
    this.ctx = ctx;
    this.user = user;
    const db = ctx.db;
    const quota = {
      get: async () => {
        const c = ctx.usage.get(user.id);
        if (!c || Date.now() - c.at > 10 * 60e3) {
          const { size } = await treeSize(this.diskRoot);
          ctx.usage.set(user.id, { used: size, at: Date.now() });
          db.prepare('UPDATE users SET used=? WHERE id=?').run(size, user.id);
        }
        const q = db.prepare('SELECT quota FROM users WHERE id=?').get(user.id);
        return { used: ctx.usage.get(user.id).used, quota: q ? q.quota : 0 };
      },
      add: delta => {
        const c = ctx.usage.get(user.id);
        if (c) { c.used = Math.max(0, c.used + delta); ctx.dirtyUsage.add(user.id); }
      },
    };
    this.quota = quota;
    if (ctx.local) {
      // Mac: диск D: — домашняя папка; свободное место — по самому диску, без подсчёта всех файлов
      this.diskRoot = ctx.local.home;
      this.quota = macQuota(this.diskRoot);
      this.disk = new LocalDisk(this.diskRoot, this.quota);
      return;
    }
    this.diskRoot = path.join(ctx.dataDir, 'users', String(user.id), 'disk');
    this.disk = new LocalDisk(this.diskRoot, quota);
  }

  /** Все корни: личный диск + облака */
  mounts() {
    const list = [{ key: 'disk', path: '/disk', label: this.ctx.local ? 'Этот Mac' : 'Мой диск', backend: this.disk, local: true }];
    if (this.ctx.local) {
      // iCloud Drive и внешние диски (/Volumes) — отдельными дисками
      const icloud = path.join(this.ctx.local.home, 'Library/Mobile Documents/com~apple~CloudDocs');
      if (fs.existsSync(icloud)) list.push(this.volume('icloud', 'iCloud Drive', icloud, 'cloud'));
      for (const v of macVolumes()) list.push(this.volume('v-' + v.name, v.name, v.path, 'volume'));
    }
    if (this.ctx.clouds) for (const m of this.ctx.clouds.forUser(this.user.id)) list.push({ key: 'cloud', path: '/cloud/' + m.id, label: m.label, backend: m.backend, kind: m.kind, letter: m.letter });
    return list;
  }
  resolve(np) {
    np = posix.normalize('/' + String(np || '')).replace(/\/$/, '') || '/';
    for (const m of this.mounts()) {
      if (np === m.path || np.startsWith(m.path + '/')) return { m, rel: np.slice(m.path.length + 1), np };
    }
    throw err('ENOENT', 'Нет такого диска');
  }

  async roots() {
    const out = [];
    for (const m of this.mounts()) {
      if (m.local && m.root) {
        const { used, quota } = await m.backend.q.get();
        out.push({ key: m.key, kind: m.kind, path: m.path, label: m.label, total: quota, free: Math.max(0, quota - used) });
      } else if (m.local) {
        const { used, quota } = await this.quota.get();
        out.push({ key: m.key, kind: 'disk', path: m.path, label: m.label, letter: 'D:', total: quota, free: Math.max(0, quota - used),
          ...(this.ctx.local ? { folders: { desktop: 'Desktop', docs: 'Documents', downloads: 'Downloads', pictures: 'Pictures', music: 'Music', videos: 'Movies' }, mac: true } : {}) });
      } else {
        const sp = await this.space(m);
        out.push({ key: m.key, path: m.path, label: m.label, kind: m.kind, letter: m.letter, total: sp ? sp.total : 0, free: sp ? sp.free : 0 });
      }
    }
    return out;
  }

  volume(key, label, root, kind) {
    this.vols = this.vols || new Map();
    let b = this.vols.get(root);
    if (!b) { b = new LocalDisk(root, macQuota(root), { noCreate: true }); this.vols.set(root, b); }
    return { key: 'vol', path: '/vol/' + encodeURIComponent(key), label, backend: b, kind, local: true, root };
  }

  /** Свободное место облака: кэш на минуту, не дольше 3 с ожидания (иначе — «неизвестно») */
  async space(m) {
    this.spCache = this.spCache || new Map();
    const c = this.spCache.get(m.path);
    if (c && Date.now() - c.at < 60e3) return c.v;
    if (!m.backend.space) return null;
    const p = m.backend.space().catch(() => null).then(v => { this.spCache.set(m.path, { v, at: Date.now() }); return v; });
    return Promise.race([p, new Promise(r => setTimeout(() => r(c ? c.v : null), 3000))]);
  }

  // ---- копирование между разными дисками (например, Мой диск → Яндекс Диск)
  async xcopy(a, b) {
    const st = await a.m.backend.stat(a.rel);
    if (!st) throw err('ENOENT');
    if (await b.m.backend.stat(b.rel)) throw err('EEXIST');
    if (st.t === 'd') {
      await b.m.backend.mkdir(b.rel);
      for (const i of await a.m.backend.list(a.rel)) {
        await this.xcopy({ m: a.m, rel: posix.join(a.rel, i.n) }, { m: b.m, rel: posix.join(b.rel, i.n) });
      }
    } else {
      const buf = await a.m.backend.read(a.rel);
      await b.m.backend.write(b.rel, buf, false, st.m);
    }
  }
}

const B64 = s => Buffer.from(String(s || ''), 'base64');

/** Mac: занято/свободно по файловой системе (statfs), кэш на 30 с */
function macQuota(root) {
  let c = null;
  return {
    get: async () => {
      if (!c || Date.now() - c.at > 30e3) {
        const st = await fs.promises.statfs(root).catch(() => null);
        const total = st ? st.blocks * st.bsize : 0, free = st ? st.bavail * st.bsize : 0;
        c = { at: Date.now(), v: { used: total - free, quota: total } };
      }
      return c.v;
    },
    add: () => { c = null; },
  };
}
/** Подключённые к Mac диски, кроме системного */
function macVolumes() {
  const out = [];
  try {
    const sysDev = fs.statSync('/').dev;
    for (const n of fs.readdirSync('/Volumes')) {
      const p = path.join('/Volumes', n);
      try {
        const st = fs.statSync(p);
        if (!st.isDirectory() || st.dev === sysDev) continue;
        out.push({ name: n, path: p });
      } catch {}
    }
  } catch {}
  return out;
}

/** Методы моста; каждый получает UserSpace и аргументы как в Android */
const API = {
  info: s => ({ version: s.ctx.version, model: 'Monomach', web: true, android: '', sdk: 0, lang: 'ru', user: s.user.login }),
  hasAccess: () => true,
  requestAccess: () => true,
  roots: s => s.roots(),
  stat: async (s, np) => { try { const r = s.resolve(np); return await r.m.backend.stat(r.rel); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } },
  list: async (s, np) => { const r = s.resolve(np); return r.m.backend.list(r.rel); },
  readText: async (s, np, max) => { const r = s.resolve(np); return (await r.m.backend.read(r.rel, max || 0)).toString('utf8'); },
  readBase64: async (s, np, max) => { const r = s.resolve(np); return (await r.m.backend.read(r.rel, max || 0)).toString('base64'); },
  writeText: async (s, np, text) => { const r = s.resolve(np); await r.m.backend.write(r.rel, Buffer.from(String(text ?? ''), 'utf8')); },
  writeBase64: async (s, np, b) => { const r = s.resolve(np); await r.m.backend.write(r.rel, B64(b)); },
  writeChunk: async (s, np, b, append, done, mtime) => {
    const r = s.resolve(np);
    if (r.m.backend.writeChunk) return r.m.backend.writeChunk(r.rel, B64(b), !!append, !!done, mtime || 0);
    await r.m.backend.write(r.rel, B64(b), !!append, done ? mtime || 0 : 0);
  },
  mkdir: async (s, np) => { const r = s.resolve(np); await r.m.backend.mkdir(r.rel); },
  rename: async (s, np, name) => { const r = s.resolve(np); const rel = await r.m.backend.rename(r.rel, name); return r.m.path + '/' + rel; },
  remove: async (s, np) => { const r = s.resolve(np); if (!r.rel) throw err('EACCES'); await r.m.backend.remove(r.rel); },
  copy: async (s, a, b) => {
    const ra = s.resolve(a), rb = s.resolve(b);
    if (ra.m === rb.m || ra.m.path === rb.m.path) return ra.m.backend.copy(ra.rel, rb.rel);
    await s.xcopy(ra, rb);
  },
  move: async (s, a, b) => {
    const ra = s.resolve(a), rb = s.resolve(b);
    if (!ra.rel) throw err('EACCES');
    if (ra.m.path === rb.m.path) return ra.m.backend.move(ra.rel, rb.rel);
    await s.xcopy(ra, rb);
    await ra.m.backend.remove(ra.rel);
  },
  trash: async (s, np) => {
    const r = s.resolve(np);
    if (!r.rel) throw err('EACCES');
    const rel = posix.join(TRASH, Date.now().toString(36), posix.basename(r.rel));
    await r.m.backend.move(r.rel, rel);
    return r.m.path + '/' + rel;
  },
  untrash: async (s, t, dest) => {
    const rt = s.resolve(t), rd = s.resolve(dest);
    if (rt.m.path === rd.m.path) await rt.m.backend.move(rt.rel, rd.rel);
    else { await s.xcopy(rt, rd); await rt.m.backend.remove(rt.rel); }
    const dir = posix.dirname(rt.rel);
    if (dir.startsWith(TRASH + '/')) await rt.m.backend.remove(dir).catch(() => {});
  },
  purge: async (s, t) => {
    const r = s.resolve(t);
    if (!r.rel) throw err('EACCES');
    await r.m.backend.remove(r.rel);
    const dir = posix.dirname(r.rel);
    if (dir.startsWith(TRASH + '/')) await r.m.backend.remove(dir).catch(() => {});
  },
  search: async (s, dir, q, limit) => {
    const r = s.resolve(dir);
    if (!r.m.backend.search) return [];
    const res = await r.m.backend.search(r.rel, q, Math.min(limit || 200, 500));
    return res.map(i => ({ n: i.n, d: i.d, s: i.s, m: i.m, p: r.m.path + '/' + i.rel }));
  },
  /** Mac: открыть файл программой по умолчанию (Word, Preview…) или показать в Finder */
  openExternal: async (s, np) => { if (!s.ctx.local) throw err('ENOSYS'); const r = s.resolve(np); macOpen([r.m.backend.abs(r.rel)]); },
  reveal: async (s, np) => { if (!s.ctx.local) throw err('ENOSYS'); const r = s.resolve(np); macOpen(['-R', r.m.backend.abs(r.rel)]); },
  usage: async (s, np) => { const r = s.resolve(np); return r.m.backend.usage ? r.m.backend.usage(r.rel) : { files: 0, dirs: 0, size: 0 }; },
};

function macOpen(args) { try { spawn('/usr/bin/open', args, { stdio: 'ignore', detached: true }).unref(); } catch (e) { throw err('EIO', e.message); } }

module.exports = { UserSpace, API };
