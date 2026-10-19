/* WinArchivator: движок архивов в отдельном потоке (7-Zip 24.09, WebAssembly; LGPL-2.1 + unRAR).
   Один поток на окно архиватора: архив подключается через WORKERFS (читается по мере надобности),
   результаты передаются в основной поток по одному файлу. */
'use strict';
importScripts('../vendor/7z/7zz.umd.js');

let M = null;           // экземпляр 7-Zip
let outBytes = [];      // вывод текущей команды (байты)
let errBytes = [];
let rawLines = new Set(); // строки вывода не в UTF-8 (имена CP866)
let curId = 0;          // id запроса (для сообщений о ходе работы)
let lastPct = -1;
const acks = new Map(); // ожидание подтверждений приёма файлов

const NOPASS = '-p\u0001fx-nopass';

async function engine() {
  if (M) return M;
  M = await self.SevenZip({
    locateFile: p => '../vendor/7z/' + p,
    stdout(c) {
      if (c === null) return;
      outBytes.push(c & 255);
      if (c === 37) { // '%'
        let i = outBytes.length - 2, n = 0, mul = 1;
        while (i >= 0 && outBytes[i] >= 48 && outBytes[i] <= 57 && mul <= 100) { n += (outBytes[i] - 48) * mul; mul *= 10; i--; }
        if (mul > 1 && n !== lastPct) { lastPct = n; self.postMessage({ id: curId, progress: n }); }
      }
    },
    stderr(c) { if (c !== null) errBytes.push(c & 255); },
  });
  for (const d of ['/w', '/x', '/src', '/in']) try { M.FS.mkdir(d); } catch {}
  return M;
}

const U8 = new TextDecoder('utf-8', { fatal: true });
const OEM = new TextDecoder('ibm866');
/** Вывод 7-Zip построчно: UTF-8, а строки с именами не в UTF-8 — как CP866 */
function decode(bytes, mark) {
  const u = Uint8Array.from(bytes);
  const out = [];
  let s = 0;
  for (let i = 0; i <= u.length; i++) {
    if (i < u.length && u[i] !== 10) continue;
    const b = u.subarray(s, i);
    s = i + 1;
    let t;
    try { t = U8.decode(b); } catch { t = OEM.decode(b); if (mark) rawLines.add(t); }
    out.push(t);
  }
  return out.join('\n');
}

function run(args) {
  outBytes = []; errBytes = []; lastPct = -1; rawLines = new Set();
  let code, extra = '';
  try { code = M.callMain(['-sccUTF-8', '-bb0', ...args]); }
  catch (e) { code = typeof e?.status === 'number' ? e.status : 2; extra = typeof e === 'number' ? '\nERROR: внутренняя ошибка 7-Zip (пароль ZIP с русскими буквами не поддерживается)' : '\n' + (e?.message || e); }
  return { code, out: decode(outBytes, true), err: decode(errBytes, false) + extra };
}

function rmrf(p) {
  let st;
  try { st = M.FS.stat(p); } catch { return; }
  if (M.FS.isDir(st.mode)) {
    for (const n of M.FS.readdir(p)) if (n !== '.' && n !== '..') rmrf(p + '/' + n);
    try { M.FS.rmdir(p); } catch {}
  } else try { M.FS.unlink(p); } catch {}
}
function mkdirp(p) {
  let cur = '';
  for (const part of p.split('/').filter(Boolean)) { cur += '/' + part; try { M.FS.mkdir(cur); } catch {} }
}

function wrongPassword(r) {
  return /Wrong password|Can not open encrypted archive|Data Error in encrypted file/i.test(r.err + r.out);
}
function errorText(r) {
  const lines = (r.err + '\n' + r.out).split('\n').map(s => s.trim()).filter(s => /^(ERROR|WARNING)|Can not open|Unexpected end|CRC Failed|Data Error|Headers Error|Unsupported/i.test(s));
  const tail = (r.err.trim() || r.out.replace(/[\b]+/g, '').trim()).split('\n').slice(-4).join('\n');
  return [...new Set(lines)].slice(0, 8).join('\n') || (r.code ? (tail || 'Код завершения 7-Zip: ' + r.code) : '');
}

// ---------- Состояние открытого архива ----------
let arc = null;         // { path, name, type, nested, outer, readOnly, password }

const TECH = /^(Path|Folder|Size|Packed Size|Modified|Attributes|CRC|Encrypted|Method|Type|Physical Size|Headers Size|Solid|Blocks|Comment|Volumes|Characteristics|Offset|Created|Accessed|Host OS|Version|Volume Index|Block|Tail Size|Multivolume|Code Page) = ?(.*)$/;

function parseList(out) {
  const i = out.indexOf('\n----------\n');
  const head = i >= 0 ? out.slice(0, i) : out;
  const body = i >= 0 ? out.slice(i + 12) : '';
  const info = {};
  for (const l of head.split('\n')) { const m = TECH.exec(l.trim()); if (m) info[m[1]] = m[2]; }
  const entries = [];
  for (const block of body.split(/\n\s*\n/)) {
    const e = {};
    for (const l of block.split('\n')) { const m = TECH.exec(l.trim()); if (m) e[m[1]] = m[2]; }
    if (!('Path' in e)) continue;
    const attrs = e.Attributes || '';
    const raw = rawLines.has('Path = ' + e.Path);
    entries.push({
      raw,
      path: e.Path.replace(/\\/g, '/').replace(/^\/+/, ''),
      dir: e.Folder === '+' || /^D/.test(attrs),
      size: +e.Size || 0,
      packed: e['Packed Size'] === '' || e['Packed Size'] === undefined ? null : +e['Packed Size'],
      mtime: e.Modified ? Date.parse(e.Modified.replace(' ', 'T').slice(0, 23)) || 0 : 0,
      crc: e.CRC || '',
      enc: e.Encrypted === '+',
      method: e.Method || '',
      attrs,
    });
  }
  return { info, entries };
}

function list(password) {
  const r = run(['l', '-slt', password ? '-p' + password : NOPASS, arc.path]);
  if (r.code !== 0 && !r.out.includes('\n----------\n')) {
    if (wrongPassword(r)) return { needPassword: true };
    throw new Error(errorText(r) || 'Не удалось открыть архив.');
  }
  return parseList(r.out);
}

/** Имя для выбора в командной строке; имена не в UTF-8 — шаблоном (? вместо не-ASCII букв) */
const pat = f => f.raw ? f.path.replace(/[^\x00-\x7f]/g, '?') : f.path;

const STREAM_TYPES = ['gzip', 'bzip2', 'xz', 'zstd', 'lzma', 'Z', 'lzip', 'lz4', 'brotli'];

const ops = {
  async open({ url, name, password }) {
    await engine();
    try { M.FS.unmount('/src'); } catch {}
    rmrf('/w'); M.FS.mkdir('/w');
    const blob = await (await fetch(url)).blob();
    M.FS.mount(M.WORKERFS, { blobs: [{ name, data: blob }] }, '/src');
    arc = { path: '/src/' + name, name, nested: false, password: password || '', size: blob.size };
    let L = list(password);
    if (L.needPassword) return { needPassword: true };
    arc.type = L.info.Type || '';
    // .tar.gz и подобные: показываем содержимое вложенного TAR, как WinRAR
    if (STREAM_TYPES.includes(arc.type) && L.entries.length === 1 && /\.tar$/i.test(L.entries[0].path)) {
      mkdirp('/w/inner');
      const r = run(['x', '-o/w/inner', '-y', '-bsp1', arc.path]);
      if (r.code === 0) {
        arc.outer = { path: arc.path, type: arc.type };
        arc.path = '/w/inner/' + L.entries[0].path;
        arc.nested = true;
        const L2 = list('');
        L2.info.Type = arc.type + '+tar';
        L = L2;
      }
    }
    arc.readOnly = arc.nested || !['7z', 'zip', 'tar', 'wim'].includes(arc.type);
    return { info: L.info, entries: L.entries, readOnly: arc.readOnly, nested: arc.nested, size: blob.size };
  },

  async relist({ password }) {
    const L = list(password || arc.password);
    if (L.needPassword) return { needPassword: true };
    return { info: L.info, entries: L.entries };
  },

  /** Извлечь (всё или выбранное) и передать файлы в основной поток */
  async extract({ id, files, password, flat }) {
    rmrf('/x'); M.FS.mkdir('/x');
    const sel = [];
    for (const f of files || []) { const n = pat(f); sel.push(n); if (f.dir) sel.push(n + '/*'); }
    const r = run([flat ? 'e' : 'x', '-o/x', '-y', '-bsp1', '-r-', password ? '-p' + password : NOPASS, arc.path, ...sel]);
    if (r.code !== 0) {
      if (wrongPassword(r)) { rmrf('/x'); return { needPassword: true }; }
      if (r.code >= 2) { const msg = errorText(r); await sendTree(id); return { error: msg || 'Ошибка извлечения.' }; }
    }
    const n = await sendTree(id);
    return { files: n, warning: r.code === 1 ? errorText(r) : '' };
  },

  async test({ password }) {
    const r = run(['t', '-bsp1', password ? '-p' + password : NOPASS, arc.path]);
    if (r.code !== 0 && wrongPassword(r)) return { needPassword: true };
    const files = /Files: (\d+)/.exec(r.out)?.[1];
    return { ok: r.code === 0, message: r.code === 0 ? `Ошибок не обнаружено.${files ? '\nПроверено файлов: ' + files : ''}` : errorText(r) };
  },

  /** Создать новый архив из файлов (blobs: [{ name: относительный путь, url }]) */
  async create({ id, inputs, outName, type, level, password, encNames, solid }) {
    await engine();
    try { M.FS.unmount('/in'); } catch {}
    rmrf('/w/new'); mkdirp('/w/new');
    const blobs = [];
    for (const f of inputs) {
      blobs.push({ name: f.name, data: await (await fetch(f.url)).blob() });
      self.postMessage({ id, phase: 'read', file: f.name });
    }
    M.FS.mount(M.WORKERFS, { blobs }, '/in');
    M.FS.chdir('/in');
    const top = [...new Set(inputs.map(f => f.name.split('/')[0]))];
    const comp = ['-mx=' + level];
    let r;
    const tarStream = { 'tar.gz': 'gzip', 'tar.bz2': 'bzip2', 'tar.xz': 'xz', 'tar.zst': 'zstd' }[type];
    if (tarStream) {
      const tarName = outName.replace(/\.(gz|bz2|xz|zst)$/i, '');
      r = run(['a', '-ttar', '-bsp1', '/w/new/' + tarName, ...top]);
      if (r.code < 2) {
        M.FS.chdir('/w/new');
        r = run(['a', '-t' + tarStream, ...comp, '-bsp1', '/w/new/' + outName, tarName]);
        try { M.FS.unlink('/w/new/' + tarName); } catch {}
      }
    } else {
      const args = ['a', '-t' + type, ...comp, '-bsp1'];
      if (password && (type === '7z' || type === 'zip')) {
        args.push('-p' + password);
        if (type === 'zip') args.push('-mem=AES256');
        if (type === '7z' && encNames) args.push('-mhe=on');
      }
      if (type === '7z') args.push('-ms=' + (solid ? 'on' : 'off'));
      r = run([...args, '/w/new/' + outName, ...top]);
    }
    M.FS.chdir('/');
    try { M.FS.unmount('/in'); } catch {}
    if (r.code >= 2) throw new Error(errorText(r) || 'Не удалось создать архив.');
    const data = M.FS.readFile('/w/new/' + outName);
    rmrf('/w/new');
    self.postMessage({ id, result: { data, warning: r.code === 1 ? errorText(r) : '' } }, [data.buffer]);
    return null;
  },

  /** Добавить файлы в открытый архив (в папку inner) */
  async add({ id, inputs, password, level, headerEnc }) {
    if (arc.readOnly) throw new Error('Этот архив можно только читать.');
    const data = await editable();
    try { M.FS.unmount('/in'); } catch {}
    const blobs = [];
    for (const f of inputs) { blobs.push({ name: f.name, data: await (await fetch(f.url)).blob() }); self.postMessage({ id, phase: 'read', file: f.name }); }
    M.FS.mount(M.WORKERFS, { blobs }, '/in');
    M.FS.chdir('/in');
    const top = [...new Set(inputs.map(f => f.name.split('/')[0]))];
    const args = ['a', '-bsp1', '-mx=' + (level ?? 5)];
    if (password && (arc.type === '7z' || arc.type === 'zip')) { args.push('-p' + password); if (arc.type === 'zip') args.push('-mem=AES256'); if (arc.type === '7z' && headerEnc) args.push('-mhe=on'); }
    const r = run([...args, data, ...top]);
    M.FS.chdir('/');
    try { M.FS.unmount('/in'); } catch {}
    if (r.code >= 2) throw new Error(errorText(r) || 'Не удалось добавить файлы.');
    return finishEdit(id, r);
  },

  async remove({ id, files, password, headerEnc }) {
    if (arc.readOnly) throw new Error('Этот архив можно только читать.');
    const data = await editable();
    const sel = [];
    for (const f of files) { const n = pat(f); sel.push(n); if (f.dir) sel.push(n + '/*'); }
    const pw = password ? ['-p' + password, ...(headerEnc && arc.type === '7z' ? ['-mhe=on'] : [])] : [NOPASS];
    const r = run(['d', '-bsp1', '-r-', ...pw, data, ...sel]);
    if (r.code >= 2) throw new Error(errorText(r) || 'Не удалось удалить файлы из архива.');
    return finishEdit(id, r);
  },

  ack({ n }) { acks.get(n)?.(); acks.delete(n); },
};

/** Копия архива в памяти для изменения (WORKERFS только для чтения) */
async function editable() {
  if (arc.path.startsWith('/w/edit/')) return arc.path;
  mkdirp('/w/edit');
  const p = '/w/edit/' + arc.name;
  const st = M.FS.lookupPath(arc.path).node;
  const src = M.FS.readFile(arc.path);
  M.FS.writeFile(p, src);
  void st;
  arc.path = p;
  return p;
}
function finishEdit(id, r) {
  const data = M.FS.readFile(arc.path);
  const copy = data.slice();
  self.postMessage({ id, result: { data: copy, warning: r.code === 1 ? errorText(r) : '' } }, [copy.buffer]);
  return null;
}

/** Передать содержимое /x в основной поток (по одному файлу, с подтверждением) */
let ackSeq = 0;
async function sendTree(id) {
  let count = 0;
  async function walk(dir, rel) {
    let names;
    try { names = M.FS.readdir(dir); } catch { return; }
    names = names.filter(n => n !== '.' && n !== '..');
    if (!names.length && rel) self.postMessage({ id, dir: rel });
    for (const n of names) {
      const p = dir + '/' + n;
      const r = rel ? rel + '/' + n : n;
      const st = M.FS.stat(p);
      if (M.FS.isDir(st.mode)) { await walk(p, r); try { M.FS.rmdir(p); } catch {} continue; }
      const data = M.FS.readFile(p);
      M.FS.unlink(p);
      const n2 = ++ackSeq;
      const wait = new Promise(res => acks.set(n2, res));
      self.postMessage({ id, file: { path: r, data, mtime: +st.mtime || 0 }, ack: n2 }, [data.buffer]);
      count++;
      await wait;
    }
  }
  await walk('/x', '');
  return count;
}

self.onmessage = async ({ data }) => {
  const { id, op } = data;
  if (op === 'ack') return ops.ack(data);
  curId = id;
  try {
    const r = await ops[op]({ ...data, id });
    if (r !== null) self.postMessage({ id, result: r });
  } catch (e) {
    self.postMessage({ id, error: String(e?.message || e) });
  }
};
