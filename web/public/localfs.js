/* Monomach: папки компьютера пользователя (Chrome, Edge, Яндекс Браузер, Opera — File System Access API).
   Папка подключается как диск L:, M: … Файлы читаются и записываются прямо на компьютере, на сервер не попадают.
   Рабочий стол обращается к дискам синхронно, поэтому список файлов держится в памяти (обновляется в фоне),
   чтение идёт синхронно из объекта File, запись — в фоне по очереди.
   Подключается после bridge.js. */
(() => {
  'use strict';
  const N = window.FXNative;
  if (!N || !N.__web) return;
  const supported = typeof window.showDirectoryPicker === 'function';
  const owner = localStorage.getItem('mm.owner') || '';
  const META_KEY = 'mm.localdisks.' + owner;   // только этот браузер: { id, label, letter }[]
  const LETTERS = ['L:', 'M:', 'N:', 'O:', 'P:', 'Q:', 'R:', 'S:', 'T:', 'U:'];
  const TRASH = '.Monomach-Корзина';
  const OK = v => JSON.stringify({ ok: v === undefined ? true : v });
  const ERR = (code, msg) => JSON.stringify({ err: code, msg });
  const emit = (n, d) => setTimeout(() => { try { window.FXHost && FXHost.emit(n, d); } catch (e) { console.error(e); } }, 0);

  let meta = [];
  try { meta = JSON.parse(localStorage.getItem(META_KEY) || '[]'); } catch {}
  const saveMeta = () => { try { localStorage.setItem(META_KEY, JSON.stringify(meta.map(({ id, label, letter }) => ({ id, label, letter })))); } catch {} };

  // ---------- IndexedDB: дескрипторы папок
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('monomach-local', 1); r.onupgradeneeded = () => r.result.createObjectStore('h'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function idbGet(k) { const d = await idb(); return new Promise(r => { const q = d.transaction('h').objectStore('h').get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(null); }); }
  async function idbPut(k, v) { const d = await idb(); return new Promise(r => { const t = d.transaction('h', 'readwrite'); t.objectStore('h').put(v, k); t.oncomplete = () => r(true); t.onerror = () => r(false); }); }
  async function idbDel(k) { const d = await idb(); return new Promise(r => { const t = d.transaction('h', 'readwrite'); t.objectStore('h').delete(k); t.oncomplete = () => r(true); t.onerror = () => r(false); }); }

  // ---------- дерево в памяти
  // узел: { d: bool, n, s, m, h: handle, file: File|Blob, kids: Map|null, loading: Promise|null }
  const disks = new Map(); // id -> { id, label, letter, root: node, perm, ready }
  const mk = (n, d, h) => ({ n, d, s: 0, m: 0, h, file: null, kids: d ? null : undefined, loading: null });

  function parse(np) {
    const m = /^\/local\/([^/]+)(?:\/(.*))?$/.exec(np || '');
    if (!m) return null;
    const disk = disks.get(m[1]);
    return disk ? { disk, parts: (m[2] || '').split('/').filter(Boolean) } : { disk: null, parts: [] };
  }
  const isLocal = np => typeof np === 'string' && np.startsWith('/local/');

  let refreshTimer = null;
  const refreshSoon = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { try { if (window.FS) FS.refreshDevice(); } catch {} }, 60); };

  async function loadDir(node) {
    if (node.loading) return node.loading;
    node.loading = (async () => {
      const kids = new Map();
      const jobs = [];
      for await (const [name, h] of node.h.entries()) {
        const k = mk(name, h.kind === 'directory', h);
        const old = node.kids && node.kids.get(name);
        if (old && old.d === k.d && k.d) { k.kids = old.kids; }
        kids.set(name, k);
        if (!k.d) jobs.push(h.getFile().then(f => { k.file = f; k.s = f.size; k.m = f.lastModified; }).catch(() => {}));
        if (jobs.length > 64) await Promise.all(jobs.splice(0));
      }
      await Promise.all(jobs);
      // незавершённые записи не теряются
      if (node.kids) for (const [n, k] of node.kids) if (k.pending && !kids.has(n)) kids.set(n, k);
      node.kids = kids;
      node.at = Date.now();
    })().finally(() => { node.loading = null; });
    return node.loading;
  }

  /** Узел по пути (только из памяти). load=true — подгрузить недостающие папки в фоне */
  function find(disk, parts, load = true) {
    let node = disk.root;
    for (const p of parts) {
      if (!node.d) return null;
      if (!node.kids) { if (load && disk.perm === 'granted') loadDir(node).then(refreshSoon).catch(e => console.warn(e)); return undefined; }
      node = node.kids.get(p);
      if (!node) return null;
    }
    return node;
  }

  // ---------- очередь фоновых записей
  let chain = Promise.resolve();
  let pendingOps = 0;
  function bg(label, fn) {
    pendingOps++;
    chain = chain.then(fn).catch(e => {
      console.error('[local]', label, e);
      emit('toast', { msg: 'Не удалось записать на компьютер: ' + label + (e && e.name === 'NotAllowedError' ? ' — нет разрешения на запись в папку' : '') });
    }).finally(() => { pendingOps--; });
    return chain;
  }
  async function dirHandle(disk, parts, create) {
    let h = disk.root.h;
    for (const p of parts) h = await h.getDirectoryHandle(p, { create });
    return h;
  }
  async function writeBlob(disk, parts, blob) {
    const dh = await dirHandle(disk, parts.slice(0, -1), true);
    const fh = await dh.getFileHandle(parts[parts.length - 1], { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    const f = await fh.getFile();
    const node = find(disk, parts, false);
    if (node) { node.h = fh; node.file = f; node.s = f.size; node.m = f.lastModified; node.pending = false; }
  }
  /** Поставить файл в дерево сразу (до окончания записи) */
  function putNode(disk, parts, blob) {
    let node = disk.root;
    for (const p of parts.slice(0, -1)) {
      if (!node.kids) node.kids = new Map();
      let k = node.kids.get(p);
      if (!k) { k = mk(p, true, null); k.kids = new Map(); k.pending = true; node.kids.set(p, k); }
      node = k;
    }
    if (!node.kids) node.kids = new Map();
    const name = parts[parts.length - 1];
    const k = node.kids.get(name) || mk(name, false, null);
    k.d = false; k.file = blob; k.s = blob.size; k.m = Date.now(); k.pending = true;
    node.kids.set(name, k);
    return k;
  }
  function detach(disk, parts) {
    const par = find(disk, parts.slice(0, -1), false);
    if (par && par.kids) par.kids.delete(parts[parts.length - 1]);
  }

  // ---------- синхронное чтение File
  function readSync(blob, asText) {
    const url = URL.createObjectURL(blob);
    try {
      const x = new XMLHttpRequest();
      x.open('GET', url, false);
      if (!asText) x.overrideMimeType('text/plain; charset=x-user-defined');
      x.send();
      if (x.status !== 200 && x.status !== 0) throw new Error('status ' + x.status);
      if (asText) return x.responseText;
      const s = x.responseText;
      let bin = '';
      for (let i = 0; i < s.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(s.slice(i, i + 0x8000), c => c.charCodeAt(0) & 0xff));
      return btoa(bin);
    } finally { URL.revokeObjectURL(url); }
  }
  const b64blob = b => { const s = atob(b || ''); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new Blob([u]); };

  // ---------- рекурсивное копирование (в фоне)
  async function copyNode(srcDisk, sParts, dstDisk, dParts) {
    const s = await resolveHandle(srcDisk, sParts);
    if (s.kind === 'directory') {
      await dirHandle(dstDisk, dParts, true);
      for await (const [name] of s.entries()) await copyNode(srcDisk, [...sParts, name], dstDisk, [...dParts, name]);
    } else await writeBlob(dstDisk, dParts, await s.getFile());
  }
  async function resolveHandle(disk, parts) {
    if (!parts.length) return disk.root.h;
    const dh = await dirHandle(disk, parts.slice(0, -1), false);
    const name = parts[parts.length - 1];
    try { return await dh.getFileHandle(name); } catch { return dh.getDirectoryHandle(name); }
  }
  async function removeEntry(disk, parts) {
    const dh = await dirHandle(disk, parts.slice(0, -1), false);
    await dh.removeEntry(parts[parts.length - 1], { recursive: true });
  }
  function cloneTree(node, name) {
    const c = { ...node, n: name, pending: true };
    if (node.d && node.kids) c.kids = new Map([...node.kids].map(([n, k]) => [n, cloneTree(k, n)]));
    return c;
  }

  // ---------- перенос между папкой компьютера и диском на сервере
  const enc = p => p.split('/').map(encodeURIComponent).join('/');
  async function uploadTree(disk, parts, serverPath) {
    const h = await resolveHandle(disk, parts);
    if (h.kind === 'directory') {
      N.mkdir(serverPath);
      for await (const [name] of h.entries()) await uploadTree(disk, [...parts, name], serverPath + '/' + name);
    } else {
      const r = await fetch('/api/upload?path=' + encodeURIComponent(serverPath), { method: 'PUT', body: await h.getFile(), credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (j.err) throw new Error(j.msg || j.err);
    }
  }
  async function downloadTree(serverPath, disk, parts) {
    const st = JSON.parse(N.stat(serverPath)).ok;
    if (!st) throw new Error('нет файла ' + serverPath);
    if (st.t === 'd') {
      await dirHandle(disk, parts, true);
      for (const i of JSON.parse(N.list(serverPath)).ok || []) await downloadTree(serverPath + '/' + i.n, disk, [...parts, i.n]);
    } else {
      const r = await fetch('/fs' + enc(serverPath), { credentials: 'same-origin' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      await writeBlob(disk, parts, await r.blob());
    }
  }

  // ---------- подключение папок
  function needPermission(disk) {
    if (disk.asked) return;
    disk.asked = true;
    setTimeout(() => {
      try {
        UI.notify({
          title: `Папка «${disk.label}» (${disk.letter})`, body: 'Браузер просит подтвердить доступ к папке на этом компьютере.', icon: 'folder', silent: true,
          actions: [{ label: 'Разрешить', fn: () => grant(disk) }],
        });
      } catch {}
    }, 300);
  }
  async function grant(disk) {
    try {
      const p = await disk.root.h.requestPermission({ mode: 'readwrite' });
      disk.perm = p;
      if (p === 'granted') { await loadDir(disk.root); FS.remount(); }
      else disk.asked = false;
    } catch (e) { console.warn(e); }
  }
  async function restore() {
    for (const m of meta) {
      const h = await idbGet(owner + ':' + m.id).catch(() => null);
      if (!h) continue;
      const disk = { ...m, root: { ...mk(m.label, true, h) }, perm: 'prompt' };
      disks.set(m.id, disk);
      try { disk.perm = await h.queryPermission({ mode: 'readwrite' }); } catch { disk.perm = 'denied'; }
      if (disk.perm === 'granted') loadDir(disk.root).then(refreshSoon).catch(e => console.warn(e));
    }
  }
  const ready = supported ? restore() : Promise.resolve();

  async function add() {
    if (!supported) throw Object.assign(new Error('Этот браузер не умеет открывать папки компьютера. Подойдут Chrome, Edge, Яндекс Браузер или Opera на компьютере.'), { code: 'ENOSYS' });
    const h = await window.showDirectoryPicker({ id: 'monomach', mode: 'readwrite' });
    for (const d of disks.values()) if (await d.root.h.isSameEntry(h).catch(() => false)) return d;
    const used = new Set([...meta.map(m => m.letter)]);
    const letter = LETTERS.find(l => !used.has(l));
    if (!letter) throw new Error('Подключено слишком много папок.');
    const id = Math.random().toString(36).slice(2, 10);
    const m = { id, label: h.name, letter };
    await idbPut(owner + ':' + id, h);
    meta.push(m); saveMeta();
    const disk = { ...m, root: mk(h.name, true, h), perm: 'granted' };
    disks.set(id, disk);
    await loadDir(disk.root);
    return disk;
  }
  async function remove(id) {
    meta = meta.filter(m => m.id !== id); saveMeta();
    disks.delete(id);
    await idbDel(owner + ':' + id).catch(() => {});
  }
  function rename(id, label) {
    const m = meta.find(x => x.id === id);
    if (!m) return;
    m.label = label; saveMeta();
    const d = disks.get(id);
    if (d) d.label = label;
  }

  // ---------- методы моста для путей /local/…
  const orig = {};
  const wrap = (name, fn) => { orig[name] = N[name]; N[name] = (...a) => { try { return fn(...a); } catch (e) { console.error('[local]', name, e); return ERR(e.code || 'EIO', e.message); } }; };
  function need(np) {
    const r = parse(np);
    if (!r || !r.disk) throw Object.assign(new Error('Папка компьютера не подключена в этом браузере'), { code: 'ENOENT' });
    if (r.disk.perm !== 'granted') { needPermission(r.disk); throw Object.assign(new Error('Нет доступа к папке компьютера — нажмите «Разрешить»'), { code: 'EACCES' }); }
    return r;
  }

  wrap('roots', () => {
    const base = JSON.parse(orig.roots());
    if (base.err) return JSON.stringify(base);
    for (const d of disks.values()) base.ok.push({ key: 'local', kind: 'local', path: '/local/' + d.id, label: d.label, letter: d.letter, total: 0, free: 0 });
    // папки, дескрипторы которых ещё загружаются
    for (const m of meta) if (!disks.has(m.id) && supported) base.ok.push({ key: 'local', kind: 'local', path: '/local/' + m.id, label: m.label, letter: m.letter, total: 0, free: 0 });
    return JSON.stringify(base);
  });
  wrap('stat', np => {
    if (!isLocal(np)) return orig.stat(np);
    const r = parse(np);
    if (!r || !r.disk) return OK(r && !r.parts.length ? { t: 'd', s: 0, m: 0 } : null);
    if (!r.parts.length) return OK({ t: 'd', s: 0, m: 0 });
    if (r.disk.perm !== 'granted') return OK(null);
    const n = find(r.disk, r.parts);
    if (n === undefined) return OK({ t: 'd', s: 0, m: 0 }); // пока не загружено — считаем папкой
    return OK(n ? { t: n.d ? 'd' : 'f', s: n.s, m: n.m } : null);
  });
  wrap('list', np => {
    if (!isLocal(np)) return orig.list(np);
    const r = parse(np);
    if (!r || !r.disk) return OK([]);
    if (r.disk.perm !== 'granted') { needPermission(r.disk); return OK([]); }
    const n = find(r.disk, r.parts);
    if (!n) return OK([]);
    if (!n.kids) { loadDir(n).then(refreshSoon).catch(e => console.warn(e)); return OK([]); }
    // фоновое обновление папки, если она давно не перечитывалась
    if (!n.loading && Date.now() - (n.at || 0) > 8000) loadDir(n).then(refreshSoon).catch(() => {});
    return OK([...n.kids.values()].filter(k => k.n !== TRASH).map(k => ({ n: k.n, d: k.d, s: k.s, m: k.m })));
  });
  function fileOf(np) {
    const r = need(np);
    const n = find(r.disk, r.parts);
    if (!n) throw Object.assign(new Error('Файл не найден'), { code: 'ENOENT' });
    if (n.d) throw Object.assign(new Error('Это папка'), { code: 'EISDIR' });
    if (!n.file) throw Object.assign(new Error('Файл ещё загружается'), { code: 'EIO' });
    return { r, n };
  }
  function readGuard(fn, np) {
    try { return fn(); } catch (e) {
      if (e.code) throw e;
      // файл изменён на компьютере после чтения списка — перечитать
      const r = parse(np); const par = r && r.disk && find(r.disk, r.parts.slice(0, -1), false);
      if (par) loadDir(par).then(refreshSoon).catch(() => {});
      throw Object.assign(new Error('Файл изменился на компьютере. Откройте его ещё раз.'), { code: 'EIO' });
    }
  }
  wrap('readText', (np, max) => {
    if (!isLocal(np)) return orig.readText(np, max);
    const { n } = fileOf(np);
    if (max && n.s > max) return ERR('EFBIG');
    return OK(readGuard(() => readSync(n.file, true), np));
  });
  wrap('readBase64', (np, max) => {
    if (!isLocal(np)) return orig.readBase64(np, max);
    const { n } = fileOf(np);
    if (max && n.s > max) return ERR('EFBIG');
    return OK(readGuard(() => readSync(n.file, false), np));
  });
  function writeAny(np, blob) {
    const r = need(np);
    if (!r.parts.length) return ERR('EISDIR');
    putNode(r.disk, r.parts, blob);
    bg(r.parts[r.parts.length - 1], () => writeBlob(r.disk, r.parts, blob));
    return OK();
  }
  wrap('writeText', (np, t) => isLocal(np) ? writeAny(np, new Blob([String(t ?? '')], { type: 'text/plain' })) : orig.writeText(np, t));
  wrap('writeBase64', (np, b) => isLocal(np) ? writeAny(np, b64blob(b)) : orig.writeBase64(np, b));
  const chunks = new Map();
  wrap('writeChunk', (np, b, append, done, mtime) => {
    if (!isLocal(np)) return orig.writeChunk(np, b, append, done, mtime);
    const list = append && chunks.get(np) || [];
    list.push(b64blob(b));
    if (!done) { chunks.set(np, list); return OK(); }
    chunks.delete(np);
    return writeAny(np, new Blob(list));
  });
  wrap('mkdir', np => {
    if (!isLocal(np)) return orig.mkdir(np);
    const r = need(np);
    const par = find(r.disk, r.parts.slice(0, -1), false);
    const name = r.parts[r.parts.length - 1];
    if (par && par.kids && par.kids.has(name)) return ERR('EEXIST');
    if (par) { if (!par.kids) par.kids = new Map(); const k = mk(name, true, null); k.kids = new Map(); k.pending = true; par.kids.set(name, k); }
    bg(name, async () => { const h = await dirHandle(r.disk, r.parts, true); const k = find(r.disk, r.parts, false); if (k) { k.h = h; k.pending = false; } });
    return OK();
  });
  wrap('remove', np => {
    if (!isLocal(np)) return orig.remove(np);
    const r = need(np);
    if (!r.parts.length) return ERR('EACCES');
    detach(r.disk, r.parts);
    bg(r.parts[r.parts.length - 1], () => removeEntry(r.disk, r.parts));
    return OK();
  });
  wrap('purge', np => isLocal(np) ? N.remove(np) : orig.purge(np));
  // Корзина для папок компьютера: файл переносится в скрытую папку «.Monomach-Корзина» в той же папке
  wrap('trash', np => {
    if (!isLocal(np)) return orig.trash(np);
    const r = need(np);
    const t = '/local/' + r.disk.id + '/' + TRASH + '/' + Date.now().toString(36) + '/' + r.parts[r.parts.length - 1];
    const res = JSON.parse(N.move(np, t));
    return res.err ? JSON.stringify(res) : OK(t);
  });
  wrap('untrash', (t, dest) => {
    if (!isLocal(t) && !isLocal(dest)) return orig.untrash(t, dest);
    return N.move(t, dest);
  });
  wrap('rename', (np, name) => {
    if (!isLocal(np)) return orig.rename(np, name);
    const dir = np.slice(0, np.lastIndexOf('/'));
    const res = JSON.parse(N.move(np, dir + '/' + name));
    return res.err ? JSON.stringify(res) : OK(dir + '/' + name);
  });
  function copyOrMove(a, b, move) {
    const la = isLocal(a), lb = isLocal(b);
    if (!la && !lb) return move ? orig.move(a, b) : orig.copy(a, b);
    if (la && lb) {
      const ra = need(a), rb = need(b);
      const node = find(ra.disk, ra.parts, false);
      if (!node) return ERR('ENOENT');
      if (find(rb.disk, rb.parts, false)) return ERR('EEXIST');
      if (ra.disk === rb.disk && (rb.parts.join('/') + '/').startsWith(ra.parts.join('/') + '/')) return ERR('EINVAL');
      const par = find(rb.disk, rb.parts.slice(0, -1), false);
      if (par) { if (!par.kids) par.kids = new Map(); par.kids.set(rb.parts[rb.parts.length - 1], cloneTree(node, rb.parts[rb.parts.length - 1])); }
      if (move) detach(ra.disk, ra.parts);
      bg(ra.parts[ra.parts.length - 1], async () => {
        // файл в той же папке компьютера — быстрый перенос, иначе копия + удаление
        const h = await resolveHandle(ra.disk, ra.parts);
        if (move && ra.disk === rb.disk && h.kind === 'file' && typeof h.move === 'function') {
          const dh = await dirHandle(rb.disk, rb.parts.slice(0, -1), true);
          await h.move(dh, rb.parts[rb.parts.length - 1]);
        } else {
          await copyNode(ra.disk, ra.parts, rb.disk, rb.parts);
          if (move) await removeEntry(ra.disk, ra.parts);
        }
        const nb = find(rb.disk, rb.parts.slice(0, -1), false);
        if (nb) await loadDir(nb);
        refreshSoon();
      });
      return OK();
    }
    if (la) {
      // компьютер → сервер (личный диск или облако): загрузка в фоне
      const ra = need(a);
      if (!find(ra.disk, ra.parts, false)) return ERR('ENOENT');
      if (move) detach(ra.disk, ra.parts);
      bg(ra.parts[ra.parts.length - 1], async () => {
        await uploadTree(ra.disk, ra.parts, b);
        if (move) await removeEntry(ra.disk, ra.parts);
        refreshSoon();
        emit('imported', { path: b });
      });
      return OK();
    }
    // сервер → компьютер: скачивание в фоне
    const rb = need(b);
    const st = JSON.parse(orig.stat(a)).ok;
    if (!st) return ERR('ENOENT');
    if (find(rb.disk, rb.parts, false)) return ERR('EEXIST');
    const par = find(rb.disk, rb.parts.slice(0, -1), false);
    const name = rb.parts[rb.parts.length - 1];
    if (par && par.kids) { const k = mk(name, st.t === 'd', null); k.s = st.s; k.m = st.m; k.pending = true; if (k.d) k.kids = new Map(); par.kids.set(name, k); }
    bg(name, async () => {
      await downloadTree(a, rb.disk, rb.parts);
      if (move) orig.remove(a);
      const nb = find(rb.disk, rb.parts.slice(0, -1), false);
      if (nb) await loadDir(nb);
      refreshSoon();
    });
    return OK();
  }
  wrap('copy', (a, b) => copyOrMove(a, b, false));
  wrap('move', (a, b) => copyOrMove(a, b, true));
  wrap('search', (dir, q, limit) => {
    if (!isLocal(dir)) return orig.search(dir, q, limit);
    const r = need(dir);
    const base = find(r.disk, r.parts, false);
    q = String(q || '').toLowerCase();
    const out = [];
    const walk = (node, p) => {
      if (!node || !node.kids || out.length >= (limit || 200)) return;
      for (const k of node.kids.values()) {
        if (k.n === TRASH) continue;
        const kp = p + '/' + k.n;
        if (k.n.toLowerCase().includes(q)) out.push({ n: k.n, d: k.d, s: k.s, m: k.m, p: kp });
        if (k.d) walk(k, kp);
      }
    };
    walk(base, dir.replace(/\/$/, ''));
    return OK(out);
  });
  wrap('usage', np => {
    if (!isLocal(np)) return orig.usage(np);
    const r = need(np);
    let files = 0, dirs = 0, size = 0;
    const walk = n => { if (!n || !n.kids) return; for (const k of n.kids.values()) { if (k.d) { dirs++; walk(k); } else { files++; size += k.s; } } };
    const n = find(r.disk, r.parts, false);
    if (n && !n.d) return OK({ files: 1, dirs: 0, size: n.s });
    walk(n);
    return OK({ files, dirs, size });
  });

  // ---------- выдача файлов для <img>, <video>, программ (через service worker)
  navigator.serviceWorker?.addEventListener('message', e => {
    const d = e.data;
    if (!d || d.type !== 'mm-local' || !e.ports[0]) return;
    try {
      const r = parse(d.path);
      if (!r || !r.disk || r.disk.perm !== 'granted') return e.ports[0].postMessage({ missing: true });
      const n = find(r.disk, r.parts, false);
      if (!n || n.d) return e.ports[0].postMessage({ missing: true });
      const send = f => e.ports[0].postMessage({ blob: f, size: f.size, mtime: n.m });
      // свежая копия файла, если он мог измениться на компьютере
      if (n.h && n.h.getFile) n.h.getFile().then(f => { n.file = f; n.s = f.size; n.m = f.lastModified; send(f); }).catch(() => (n.file ? send(n.file) : e.ports[0].postMessage({ missing: true })));
      else if (n.file) send(n.file);
      else e.ports[0].postMessage({ missing: true });
    } catch (x) { e.ports[0].postMessage({ missing: true }); }
  });
  if (navigator.serviceWorker && location.protocol !== 'file:') {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(e => console.warn('sw', e));
  }

  window.LocalDisks = {
    supported,
    ready,
    add, remove, rename,
    list: () => meta.map(m => ({ ...m, perm: disks.get(m.id)?.perm || 'prompt', path: '/local/' + m.id })),
    grant: id => { const d = disks.get(id); return d ? grant(d) : null; },
    pending: () => pendingOps,
    flush: () => chain,
  };
  addEventListener('beforeunload', e => { if (pendingOps > 0) { e.preventDefault(); e.returnValue = ''; } });
})();
