/* WinArchivator — архиватор WindowsFX.
   Открывает и извлекает ZIP, RAR (в т. ч. RAR5), 7Z, TAR, GZ, BZ2, XZ, ZST, ISO, CAB, ARJ, LZH, WIM и др.;
   создаёт 7Z, ZIP, TAR, TAR.GZ, TAR.BZ2, TAR.XZ, с паролем (AES-256) для 7Z и ZIP.
   Движок — 7-Zip (WebAssembly) в отдельном потоке: js/apps/winarch-worker.js. */
'use strict';

const WinArch = (() => {
  const APP = 'winarch';
  const NAME = 'WinArchivator';
  const ARCH_EXT = ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'tbz2', 'tbz', 'xz', 'txz', 'zst', 'tzst', 'lz', 'lzma', 'z', 'iso', 'cab', 'arj', 'lzh', 'lha', 'cpio', 'wim', 'dmg', 'vhd', 'vhdx', 'img', 'jar', 'deb', 'rpm', 'chm', 'msi', 'epub', 'apk', 'xpi', 'squashfs', 'udf', 'xar', 'r00', '001'];
  const FORMATS = [
    { id: '7z', label: '7Z', ext: '7z', pass: true },
    { id: 'zip', label: 'ZIP', ext: 'zip', pass: true },
    { id: 'tar', label: 'TAR', ext: 'tar' },
    { id: 'tar.gz', label: 'TAR.GZ', ext: 'tar.gz' },
    { id: 'tar.bz2', label: 'TAR.BZ2', ext: 'tar.bz2' },
    { id: 'tar.xz', label: 'TAR.XZ', ext: 'tar.xz' },
  ];
  const LEVELS = [[0, 'Без сжатия'], [1, 'Скоростной'], [3, 'Быстрый'], [5, 'Обычный'], [7, 'Хороший'], [9, 'Максимальный']];
  const prefs = () => Persist.get('winarch.prefs', { format: 'zip', level: 5, solid: true, mode: 'ask', sub: true });
  const savePrefs = p => Persist.set('winarch.prefs', { ...prefs(), ...p });

  const isArchive = p => {
    const n = FS.basename(p).toLowerCase();
    return ARCH_EXT.includes(FS.ext(n)) || /\.(part\d+\.rar|\d{3})$/.test(n);
  };
  const baseName = p => FS.basename(p).replace(/\.(tar\.(gz|bz2|xz|zst)|part\d+\.rar)$/i, '').replace(/\.[^.]+$/, '') || FS.basename(p);

  // ---------- Значки (оригинальные) ----------
  const TB = {
    add: '<rect x="5" y="20" width="24" height="7" rx="2" fill="#f2a21a"/><rect x="5" y="13" width="24" height="7" rx="2" fill="#19b3a0"/><rect x="5" y="6" width="24" height="7" rx="2" fill="#7c6cff"/><rect x="15" y="6" width="4" height="21" fill="#2a2f3f" opacity=".85"/><circle cx="29" cy="27" r="8" fill="#1fb35b"/><path d="M29 22.5v9M24.5 27h9" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>',
    extract: '<path d="M4 15h28v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="#c9893a"/><path d="M4 15l4-6h20l4 6z" fill="#e6a85a"/><path d="M18 4v15M12 11l6 7 6-7" stroke="#2f7bff" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="11" y="21" width="14" height="4" rx="1.5" fill="#8a5a22" opacity=".6"/>',
    test: '<path d="M4 13h28v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="#7c6cff"/><path d="M4 13l4-6h20l4 6z" fill="#a99cff"/><circle cx="26" cy="25" r="8.5" fill="#1fb35b"/><path d="M22 25l3 3 5.5-6" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    view: '<path d="M8 3h14l7 7v22a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="#eef1f7" stroke="#9aa3b5"/><path d="M22 3v7h7" fill="#cfd6e4"/><path d="M10 15h12M10 19h14M10 23h9" stroke="#7c8aa5" stroke-width="1.6"/><circle cx="23" cy="25" r="6" fill="none" stroke="#2f7bff" stroke-width="2.6"/><path d="M27.5 29.5l4.5 4.5" stroke="#2f7bff" stroke-width="3" stroke-linecap="round"/>',
    del: '<path d="M8 10h20l-1.6 21a2 2 0 0 1-2 1.8H11.6a2 2 0 0 1-2-1.8z" fill="#e5484d"/><rect x="6" y="6" width="24" height="4" rx="1.5" fill="#b8323a"/><rect x="14" y="3" width="8" height="4" rx="1.5" fill="#b8323a"/><path d="M14 15v13M18 15v13M22 15v13" stroke="#fff" stroke-opacity=".75" stroke-width="1.8" stroke-linecap="round"/>',
    find: '<circle cx="15" cy="15" r="9" fill="#dbe8ff" stroke="#2f7bff" stroke-width="3"/><path d="M22 22l9 9" stroke="#2f7bff" stroke-width="4" stroke-linecap="round"/><path d="M11 13a5 5 0 0 1 5-4" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>',
    info: '<circle cx="18" cy="18" r="14" fill="#2f7bff"/><circle cx="18" cy="11" r="2.4" fill="#fff"/><path d="M18 16v11" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>',
    up: '<path d="M4 10a3 3 0 0 1 3-3h7l3 3h12a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill="#f2b632"/><path d="M18 26V15M13 19l5-5 5 5" stroke="#fff" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  const tbIcon = (k, s = 34) => `<svg width="${s}" height="${s}" viewBox="0 0 36 36">${TB[k]}</svg>`;

  // ---------- Движок (поток) ----------
  class Engine {
    constructor() {
      this.w = new Worker('js/apps/winarch-worker.js');
      this.seq = 0;
      this.pending = new Map();
      this.w.onmessage = ({ data }) => {
        const p = this.pending.get(data.id);
        if (!p) return;
        if (data.progress !== undefined || data.phase) { p.onEvent?.(data); return; }
        if (data.file || data.dir) {
          Promise.resolve(p.onEvent?.(data)).catch(e => { p.failed = e; }).finally(() => { if (data.ack) this.w.postMessage({ op: 'ack', n: data.ack }); });
          return;
        }
        this.pending.delete(data.id);
        if (p.failed) p.reject(p.failed);
        else if (data.error) p.reject(new Error(data.error));
        else p.resolve(data.result);
      };
      this.w.onerror = e => { for (const p of this.pending.values()) p.reject(new Error(e.message || 'Ошибка движка архиватора')); this.pending.clear(); };
    }
    call(op, args = {}, onEvent) {
      const id = ++this.seq;
      return new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject, onEvent });
        this.w.postMessage({ ...args, op, id });
      });
    }
    cancel() {
      this.w.terminate();
      for (const p of this.pending.values()) { const e = new Error('Операция отменена.'); e.cancelled = true; p.reject(e); }
      this.pending.clear();
    }
  }

  // ---------- Запись результатов ----------
  function b64(u8, from, to) {
    let s = '';
    for (let i = from; i < to; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + 0x8000, to)));
    return btoa(s);
  }
  const CHUNK = 3 * 1024 * 1024;
  const TEXT_KINDS = ['text', 'code', 'html'];

  /** Записать файл (устройство — частями через Android, диск C: — в виртуальную ФС) */
  function writeFile(dest, u8, mtime) {
    if (FS.isDevice(dest)) {
      const np = FS.toNative(dest);
      if (!u8.length) { FX.call('writeChunk', np, '', false, true, mtime || 0); return; }
      for (let i = 0; i < u8.length; i += CHUNK) FX.call('writeChunk', np, b64(u8, i, Math.min(i + CHUNK, u8.length)), i > 0, i + CHUNK >= u8.length, mtime || 0);
      return;
    }
    FS.mkdirp(FS.parent(dest));
    const kind = FS.typeOf(dest, { t: 'f', c: '' }).kind;
    if (TEXT_KINDS.includes(kind)) FS.write(dest, new TextDecoder().decode(u8));
    else FS.write(dest, 'data:' + mimeOf(dest) + ';base64,' + b64(u8, 0, u8.length));
  }
  function mkdir(dest) {
    if (FS.isDevice(dest)) { FX.tryCall('mkdir', FS.toNative(dest)); return; }
    try { FS.mkdirp(dest); } catch {}
  }
  function exists(dest) {
    if (FS.isDevice(dest)) return !!FX.tryCall('stat', FS.toNative(dest));
    return FS.exists(dest);
  }
  function mimeOf(p) {
    const e = FS.ext(p);
    return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', pdf: 'application/pdf', zip: 'application/zip' })[e] || 'application/octet-stream';
  }
  function uniqueName(dest) {
    if (!exists(dest)) return dest;
    const dir = FS.parent(dest), n = FS.basename(dest), e = FS.ext(n), st = e ? n.slice(0, -(e.length + 1)) : n;
    for (let i = 2; i < 9999; i++) { const p = `${dir}/${st} (${i})${e ? '.' + e : ''}`; if (!exists(p)) return p; }
    return dest;
  }
  const done = () => { try { FS.refreshDevice(); } catch {} };

  // ---------- Входные файлы для упаковки ----------
  function collectInputs(paths, prefix = '') {
    const out = [];
    const walk = (p, rel) => {
      const n = FS.get(p);
      if (!n) return;
      if (n.t === 'd') {
        const list = FS.list(p);
        for (const it of list) walk(it.path, rel + '/' + it.name);
      } else out.push({ name: rel, url: FS.url(p), size: n.s ?? n.size ?? 0 });
    };
    for (const p of paths) walk(FS.realPath(p) || p, (prefix ? prefix + '/' : '') + FS.basename(p));
    return out;
  }

  // ---------- Окно хода операции ----------
  function progress(title, onCancel) {
    const back = h('<div class="dlg-backdrop wa-pback"></div>');
    const d = h(`<div class="dlg glass wa-prog">
      <div class="dlg-title">${Icons.get(APP, 16)}<span>${esc(title)}</span></div>
      <div class="wa-prog-body">
        <div class="wa-prog-op"></div>
        <div class="wa-prog-file muted small"></div>
        <div class="wa-bar"><div class="wa-bar-fill"></div></div>
        <div class="wa-prog-row small muted"><span class="wa-prog-time">Прошло: 0:00</span><span class="wa-prog-pct">0%</span></div>
        <div class="dlg-btns"><button class="btn wa-cancel">Отмена</button></div>
      </div></div>`);
    back.append(d);
    document.getElementById('overlay-layer').append(back);
    const t0 = Date.now();
    const timer = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); $('.wa-prog-time', d).textContent = `Прошло: ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 500);
    $('.wa-cancel', d).onclick = () => onCancel?.();
    return {
      op(t) { $('.wa-prog-op', d).textContent = t; },
      file(f) { $('.wa-prog-file', d).textContent = f || ''; },
      pct(p) { p = clamp(Math.round(p), 0, 100); $('.wa-bar-fill', d).style.width = p + '%'; $('.wa-prog-pct', d).textContent = p + '%'; },
      close() { clearInterval(timer); back.remove(); },
    };
  }

  async function askPassword(name, again) {
    const v = await UI.prompt('Введите пароль', (again ? 'Неверный пароль. ' : '') + `Введите пароль для архива «${name}»:`, '', { type: 'password', ok: 'OK' });
    return v || null;
  }

  async function askOverwrite(name) {
    const r = await UI.dialog({
      title: 'Подтверждение замены файла', icon: 'question', appIcon: APP,
      message: `Файл «${name}» уже существует.\nЗаменить его?`,
      buttons: [{ label: 'Да', value: 'replace', primary: true }, { label: 'Да для всех', value: 'replaceAll' }, { label: 'Переименовать', value: 'rename' }, { label: 'Нет', value: 'skip' }, { label: 'Нет для всех', value: 'skipAll', cancel: true }],
    });
    return r.button || 'skipAll';
  }

  // ---------- Извлечение ----------
  /** src: путь архива; dest: папка; opts: { files, strip, mode, password, engine, session } */
  async function extract(src, dest, opts = {}) {
    const own = !opts.engine;
    const eng = opts.engine || new Engine();
    let cancelled = false;
    const pr = progress(`${NAME}: извлечение`, () => { cancelled = true; eng.cancel(); });
    pr.op(`Извлечение из ${FS.basename(src)}`);
    let mode = opts.mode || prefs().mode;
    let password = opts.password || '';
    let written = 0;
    try {
      if (own) {
        let r = await eng.call('open', { url: FS.url(src), name: FS.basename(src), password }, e => e.progress !== undefined && pr.pct(e.progress));
        while (r.needPassword) {
          pr.close();
          password = await askPassword(FS.basename(src), !!password);
          if (!password) return 0;
          r = await eng.call('open', { url: FS.url(src), name: FS.basename(src), password });
        }
      }
      for (;;) {
        const strip = opts.strip ? opts.strip.replace(/\/?$/, '/') : '';
        const r = await eng.call('extract', { files: opts.files || null, password }, async ev => {
          if (ev.progress !== undefined) { pr.pct(ev.progress); return; }
          let rel = ev.file ? ev.file.path : ev.dir;
          if (strip && rel.startsWith(strip)) rel = rel.slice(strip.length);
          if (!rel) return;
          let target = dest + '/' + rel;
          if (ev.dir) { mkdir(target); return; }
          pr.file(rel);
          if (exists(target)) {
            if (mode === 'ask') {
              const a = await askOverwrite(rel);
              if (a === 'replaceAll') mode = 'replace';
              else if (a === 'skipAll') mode = 'skip';
              if (a === 'skip' || a === 'skipAll') return;
              if (a === 'rename') target = uniqueName(target);
            } else if (mode === 'skip') return;
            else if (mode === 'rename') target = uniqueName(target);
          }
          writeFile(target, ev.file.data, ev.file.mtime);
          written++;
        });
        if (r.needPassword) {
          pr.close();
          password = await askPassword(FS.basename(src), !!password);
          if (!password) return written;
          return extract(src, dest, { ...opts, engine: eng, password, mode });
        }
        if (r.error) throw new Error(r.error);
        if (r.warning) UI.notify({ title: `${NAME}: предупреждения`, body: r.warning, icon: APP });
        break;
      }
      return written;
    } catch (e) {
      if (!cancelled) UI.alert(NAME, 'Ошибка извлечения:\n' + e.message, 'error');
      return written;
    } finally {
      pr.close();
      done();
      if (own && !cancelled) eng.w.terminate();
    }
  }

  // ---------- Создание архива ----------
  async function create(paths, out, o) {
    const eng = new Engine();
    let cancelled = false;
    const pr = progress(`${NAME}: создание архива`, () => { cancelled = true; eng.cancel(); });
    pr.op(`Добавление в ${FS.basename(out)}`);
    try {
      const inputs = collectInputs(paths);
      if (!inputs.length) throw new Error('Нет файлов для добавления (пустые папки не упаковываются).');
      const r = await eng.call('create', { inputs, outName: FS.basename(out), type: o.format, level: o.level, password: o.password || '', encNames: !!o.encNames, solid: o.solid !== false }, ev => {
        if (ev.phase === 'read') pr.file('Чтение: ' + ev.file);
        if (ev.progress !== undefined) { pr.pct(ev.progress); }
      });
      pr.op('Запись архива…');
      writeFile(out, r.data, Date.now());
      if (r.warning) UI.notify({ title: `${NAME}: предупреждения`, body: r.warning, icon: APP });
      if (o.deleteAfter) for (const p of paths) try { FS.remove(p); } catch {}
      done();
      UI.notify({ title: 'Архив создан', body: FS.display(out), icon: APP, transient: true, silent: true });
      return out;
    } catch (e) {
      if (!cancelled) UI.alert(NAME, 'Не удалось создать архив:\n' + e.message, 'error');
      return null;
    } finally { pr.close(); eng.w.terminate(); }
  }

  /** Диалог «Имя и параметры архива» */
  async function addDialog(paths, opt = {}) {
    const p = prefs();
    const dir = opt.dir || FS.parent(paths[0]);
    const def = paths.length === 1 ? baseName(paths[0]) : (FS.basename(FS.parent(paths[0])) || 'Архив');
    let fmt = FORMATS.find(f => f.id === p.format) || FORMATS[1];
    const el = h(`<div class="wa-form">
      <label class="wa-l">Имя архива</label>
      <div class="wa-row"><input class="input wa-name" value="${esc(def + '.' + fmt.ext)}"><button class="btn wa-browse">Обзор…</button></div>
      <div class="wa-cols">
        <fieldset class="wa-fs"><legend>Формат архива</legend>${FORMATS.map(f => `<label class="wa-radio"><input type="radio" name="wafmt" value="${f.id}" ${f.id === fmt.id ? 'checked' : ''}> ${f.label}</label>`).join('')}</fieldset>
        <div class="wa-col">
          <label class="wa-l">Метод сжатия</label>
          <select class="input wa-level">${LEVELS.map(([v, n]) => `<option value="${v}" ${v === p.level ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <label class="wa-check"><input type="checkbox" class="check wa-solid" ${p.solid ? 'checked' : ''}> Создать непрерывный архив</label>
          <label class="wa-check"><input type="checkbox" class="check wa-del"> Удалить файлы после упаковки</label>
          <fieldset class="wa-fs wa-passbox"><legend>Шифрование</legend>
            <input class="input wa-pass" type="password" placeholder="Пароль (необязательно)" autocomplete="new-password">
            <input class="input wa-pass2" type="password" placeholder="Повторите пароль" autocomplete="new-password">
            <label class="wa-check"><input type="checkbox" class="check wa-encn"> Шифровать имена файлов</label>
          </fieldset>
        </div>
      </div>
      <div class="muted small">Файлов: ${paths.length === 1 ? esc(FS.basename(paths[0])) : paths.length + ' элементов'} · папка: ${esc(FS.display(dir))}</div>
    </div>`);
    let folder = dir;
    const nameIn = $('.wa-name', el);
    const sync = () => {
      fmt = FORMATS.find(f => f.id === $('input[name=wafmt]:checked', el).value);
      const st = nameIn.value.replace(/\.(tar\.(gz|bz2|xz)|7z|zip|tar)$/i, '');
      nameIn.value = st + '.' + fmt.ext;
      $('.wa-passbox', el).classList.toggle('disabled', !fmt.pass);
      $$('.wa-passbox input', el).forEach(i => i.disabled = !fmt.pass);
      $('.wa-encn', el).disabled = fmt.id !== '7z';
      $('.wa-solid', el).disabled = fmt.id !== '7z';
    };
    $$('input[name=wafmt]', el).forEach(r => r.onchange = sync);
    sync();
    $('.wa-browse', el).onclick = async () => { const f = await UI.filePicker({ mode: 'folder', dir: folder, title: 'Папка для архива' }); if (f) { folder = f; el.querySelector('.muted.small').textContent = 'Папка: ' + FS.display(f); } };
    const r = await UI.dialog({
      title: 'Имя и параметры архива', appIcon: APP, content: el, wide: true,
      buttons: [{ label: 'OK', value: true, primary: true }, { label: 'Отмена', value: false, cancel: true }],
      validate: () => {
        if ($('.wa-pass', el).value !== $('.wa-pass2', el).value) return 'Пароли не совпадают.';
        if (fmt.id === 'zip' && /[^\x20-\x7e]/.test($('.wa-pass', el).value)) return 'Для ZIP пароль может содержать только латинские буквы, цифры и знаки. Для пароля с русскими буквами выберите формат 7Z.';
        try { FS.validName(nameIn.value.trim()); } catch (e) { return e.message; }
        return null;
      },
    });
    if (!r.button) return null;
    const o = { format: fmt.id, level: +$('.wa-level', el).value, solid: $('.wa-solid', el).checked, deleteAfter: $('.wa-del', el).checked, password: fmt.pass ? $('.wa-pass', el).value : '', encNames: $('.wa-encn', el).checked };
    savePrefs({ format: o.format, level: o.level, solid: o.solid });
    let out = folder + '/' + nameIn.value.trim();
    if (exists(out) && !(await UI.confirm(NAME, `Архив «${FS.basename(out)}» уже существует. Заменить его?`))) return null;
    return create(paths, out, o);
  }

  /** Диалог «Путь и параметры извлечения» */
  async function extractDialog(src, opt = {}) {
    const p = prefs();
    const parentDir = opt.dest || FS.parent(src);
    const el = h(`<div class="wa-form">
      <label class="wa-l">Путь для извлечения</label>
      <div class="wa-row"><input class="input wa-dest" value="${esc(FS.display(parentDir))}"><button class="btn wa-browse">Обзор…</button></div>
      <label class="wa-check"><input type="checkbox" class="check wa-sub" ${p.sub && !opt.files ? 'checked' : ''}> Извлечь в подпапку «${esc(baseName(src))}»</label>
      <fieldset class="wa-fs"><legend>Режим перезаписи</legend>
        ${[['ask', 'Спрашивать'], ['replace', 'Заменять без запроса'], ['skip', 'Пропускать существующие'], ['rename', 'Переименовывать автоматически']].map(([v, n]) => `<label class="wa-radio"><input type="radio" name="wamode" value="${v}" ${v === p.mode ? 'checked' : ''}> ${n}</label>`).join('')}
      </fieldset>
      ${opt.files ? `<div class="muted small">Будет извлечено элементов: ${opt.files.length}</div>` : ''}
    </div>`);
    let folder = parentDir;
    $('.wa-browse', el).onclick = async () => { const f = await UI.filePicker({ mode: 'folder', dir: folder, title: 'Папка для извлечения' }); if (f) { folder = f; $('.wa-dest', el).value = FS.display(f); } };
    $('.wa-dest', el).onchange = () => { folder = $('.wa-dest', el).value.trim(); };
    const r = await UI.dialog({ title: 'Путь и параметры извлечения', appIcon: APP, content: el, buttons: [{ label: 'OK', value: true, primary: true }, { label: 'Отмена', value: false, cancel: true }] });
    if (!r.button) return null;
    const mode = $('input[name=wamode]:checked', el).value;
    const sub = $('.wa-sub', el).checked;
    savePrefs({ mode, sub: opt.files ? p.sub : sub });
    let dest = FS.realPath(folder) || folder;
    if (sub) dest = dest + '/' + baseName(src);
    mkdir(dest);
    const n = await extract(src, dest, { ...opt, mode });
    if (n) UI.notify({ title: 'Извлечение завершено', body: `${n} ${plural(n, 'файл', 'файла', 'файлов')} → ${FS.display(dest)}`, icon: APP, transient: true, silent: true, onClick: () => Apps.launch('explorer', { path: dest }) });
    return dest;
  }

  async function extractHere(src, sub) {
    const dest = FS.parent(src) + (sub ? '/' + baseName(src) : '');
    if (sub) mkdir(dest);
    const n = await extract(src, dest, { mode: 'ask' });
    if (n) UI.notify({ title: 'Извлечение завершено', body: `${n} ${plural(n, 'файл', 'файла', 'файлов')} → ${FS.display(dest)}`, icon: APP, transient: true, silent: true });
  }

  // ---------- Пункт контекстного меню Проводника ----------
  function menuEntry(paths) {
    if (!paths?.length || paths.some(p => FS.isProtected?.(p))) return null;
    const single = paths.length === 1;
    const p = paths[0];
    const arch = single && FS.get(p)?.t === 'f' && isArchive(p);
    const nm = single ? baseName(p) : (FS.basename(FS.parent(p)) || 'Архив');
    const items = [];
    if (arch) {
      items.push(
        { label: 'Открыть в WinArchivator', icon: 'app:' + APP, action: () => Apps.launch(APP, { path: p }) },
        { label: 'Извлечь файлы…', icon: 'folder-open', action: () => extractDialog(p) },
        { label: 'Извлечь в текущую папку', icon: 'download', action: () => extractHere(p, false) },
        { label: `Извлечь в «${nm}\\»`, icon: 'new-folder', action: () => extractHere(p, true) },
        { sep: true },
      );
    }
    items.push(
      { label: 'Добавить в архив…', icon: 'app:' + APP, action: () => addDialog(paths) },
      { label: `Добавить в «${nm}.zip»`, icon: 'app:file-archive', action: () => quickAdd(paths, nm, 'zip') },
      { label: `Добавить в «${nm}.7z»`, icon: 'app:file-archive', action: () => quickAdd(paths, nm, '7z') },
    );
    return { label: 'WinArchivator', icon: 'app:' + APP, items };
  }
  async function quickAdd(paths, nm, fmt) {
    let out = FS.parent(paths[0]) + '/' + nm + '.' + fmt;
    out = uniqueName(out);
    return create(paths, out, { format: fmt, level: prefs().level, solid: true });
  }

  // ================= Окно WinArchivator =================
  function open(args = {}) {
    const win = WM.open({ app: APP, title: NAME, width: 900, height: 600, minWidth: 520, minHeight: 360, bodyClass: 'wa' });
    const b = win.body;
    b.innerHTML = `
      <div class="menubar">
        <button data-m="file">Файл</button><button data-m="cmd">Команды</button><button data-m="tools">Инструменты</button><button data-m="opts">Параметры</button><button data-m="help">Справка</button>
      </div>
      <div class="wa-tb">
        <button class="wa-tbtn" data-a="add">${tbIcon('add')}<span>Добавить</span></button>
        <button class="wa-tbtn" data-a="extract">${tbIcon('extract')}<span>Извлечь в…</span></button>
        <button class="wa-tbtn" data-a="test">${tbIcon('test')}<span>Тест</span></button>
        <button class="wa-tbtn" data-a="view">${tbIcon('view')}<span>Просмотр</span></button>
        <button class="wa-tbtn" data-a="del">${tbIcon('del')}<span>Удалить</span></button>
        <button class="wa-tbtn" data-a="find">${tbIcon('find')}<span>Найти</span></button>
        <button class="wa-tbtn" data-a="info">${tbIcon('info')}<span>Информация</span></button>
      </div>
      <div class="wa-addr">
        <button class="wa-up" title="Вверх (Backspace)">${tbIcon('up', 24)}</button>
        <div class="wa-path input"><span class="wa-path-ic"></span><span class="wa-path-t"></span></div>
        <button class="icon-btn wa-drives" title="Диски и папки">${Icons.ui('chevron-down', 14)}</button>
      </div>
      <div class="wa-list" tabindex="0">
        <div class="wa-head"><span class="c-name" data-s="name">Имя</span><span class="c-size" data-s="size">Размер</span><span class="c-pack" data-s="packed">Сжат</span><span class="c-type" data-s="type">Тип</span><span class="c-time" data-s="mtime">Изменён</span><span class="c-crc" data-s="crc">CRC32</span></div>
        <div class="wa-rows"></div>
      </div>
      <div class="statusbar wa-status"><span class="wa-st-l"></span><span class="spacer"></span><span class="wa-st-r"></span></div>`;

    const rowsEl = $('.wa-rows', b);
    const listEl = $('.wa-list', b);
    let mode = 'fs';           // 'fs' — папки устройства, 'arc' — содержимое архива
    let dir = FS.P.downloads;  // текущая папка (fs)
    let A = null;              // открытый архив: { path, eng, entries, tree, info, readOnly, password }
    let inner = '';            // текущая папка внутри архива
    let search = null;         // результаты поиска
    let items = [];
    let sel = new Set();
    let anchor = -1;
    let sort = { k: 'name', asc: true };

    // ---------- Архив ----------
    function buildTree(entries) {
      const root = { name: '', dir: true, kids: new Map(), path: '' };
      for (const e of entries) {
        const parts = e.path.split('/').filter(Boolean);
        let n = root;
        parts.forEach((part, i) => {
          const last = i === parts.length - 1;
          let k = n.kids.get(part);
          if (!k) { k = { name: part, dir: !last || e.dir, kids: new Map(), path: parts.slice(0, i + 1).join('/'), size: 0, packed: null, mtime: 0, crc: '', raw: e.raw }; n.kids.set(part, k); }
          if (last) Object.assign(k, { dir: e.dir || k.kids.size > 0, size: e.size, packed: e.packed, mtime: e.mtime, crc: e.crc, enc: e.enc, method: e.method, raw: e.raw, entry: e });
          n = k;
        });
      }
      // размеры папок
      (function sum(n) { if (!n.dir) return [n.size || 0, n.packed || 0]; let s = 0, p = 0; for (const k of n.kids.values()) { const [a, c] = sum(k); s += a; p += c; } n.size = s; n.packed = p; return [s, p]; })(root);
      return root;
    }
    function nodeAt(path) {
      let n = A.tree;
      for (const part of path.split('/').filter(Boolean)) { n = n.kids.get(part); if (!n) return null; }
      return n;
    }

    async function openArchive(path, password) {
      const prevEng = A?.eng;
      const eng = new Engine();
      const pr = progress(`${NAME}: открытие архива`, () => eng.cancel());
      pr.op(FS.basename(path));
      try {
        let r = await eng.call('open', { url: FS.url(path), name: FS.basename(path), password: password || '' }, e => e.progress !== undefined && pr.pct(e.progress));
        const headerEnc = !!r.needPassword || !!(A && A.path === path && A.headerEnc);
        while (r.needPassword) {
          pr.close();
          password = await askPassword(FS.basename(path), !!password);
          if (!password) { eng.w.terminate(); return false; }
          r = await eng.call('open', { url: FS.url(path), name: FS.basename(path), password });
        }
        prevEng?.w.terminate();
        A = { path, eng, entries: r.entries, tree: buildTree(r.entries), info: r.info, readOnly: r.readOnly, nested: r.nested, size: r.size, password: password || '', headerEnc };
        mode = 'arc'; inner = ''; search = null;
        win.setTitle(`${FS.basename(path)} — ${NAME}`);
        FileOps.addRecent(path);
        render();
        return true;
      } catch (e) {
        eng.w.terminate();
        if (!e.cancelled) UI.alert(NAME, `Не удалось открыть архив «${FS.basename(path)}»:\n${e.message}`, 'error');
        return false;
      } finally { pr.close(); }
    }
    function closeArchive() {
      A?.eng.w.terminate();
      A = null; mode = 'fs'; search = null;
      win.setTitle(NAME);
    }
    async function reloadArchive() {
      if (!A) return;
      const keep = inner;
      const ok = await openArchive(A.path, A.password);
      if (ok && nodeAt(keep)) { inner = keep; render(); }
    }

    // ---------- Список ----------
    function typeLabel(name, isDir) {
      if (isDir) return 'Папка с файлами';
      return FS.typeOf(name, { t: 'f', c: '' }).label;
    }
    function collect() {
      if (mode === 'fs') {
        let list = [];
        try { list = FS.list(dir); } catch (e) { list = []; }
        return list.map(it => ({ name: it.name, path: it.path, dir: it.isDir, size: it.isDir ? null : (it.node.s ?? it.node.size ?? (typeof it.node.c === 'string' ? it.node.c.length : 0)), mtime: it.node.mt || it.node.m || 0, icon: FS.typeOf(it.path, it.node).icon, type: FS.typeOf(it.path, it.node).label }));
      }
      if (search) return search.map(n => ({ name: n.path, node: n, dir: n.dir, size: n.size, packed: n.packed, mtime: n.mtime, crc: n.crc, type: typeLabel(n.name, n.dir), icon: n.dir ? 'folder' : FS.typeOf(n.name, { t: 'f', c: '' }).icon, enc: n.enc }));
      const n = nodeAt(inner) || A.tree;
      return [...n.kids.values()].map(k => ({ name: k.name, node: k, dir: k.dir, size: k.size, packed: k.packed, mtime: k.mtime, crc: k.crc, type: typeLabel(k.name, k.dir), icon: k.dir ? 'folder' : FS.typeOf(k.name, { t: 'f', c: '' }).icon, enc: k.enc }));
    }
    function sortItems(list) {
      const k = sort.k, m = sort.asc ? 1 : -1;
      return list.sort((a, b) => (b.dir - a.dir) || (k === 'name' || k === 'type' || k === 'crc' ? String(a[k] || '').localeCompare(String(b[k] || ''), 'ru', { numeric: true }) * m : ((a[k] || 0) - (b[k] || 0)) * m) || a.name.localeCompare(b.name, 'ru'));
    }
    const fmtSize = v => v === null || v === undefined ? '' : v.toLocaleString('ru-RU');

    function render() {
      items = sortItems(collect());
      sel = new Set(); anchor = -1;
      const up = mode === 'arc' ? true : !!FS.parent(dir);
      b.classList.toggle('arc', mode === 'arc');
      $('.wa-path-t', b).textContent = mode === 'fs' ? FS.display(dir) : (FS.basename(A.path) + (inner ? '\\' + inner.replace(/\//g, '\\') : '') + (search ? ' — результаты поиска' : ''));
      $('.wa-path-ic', b).innerHTML = Icons.get(mode === 'fs' ? FS.typeOf(dir).icon : 'file-archive', 16);
      const html = [];
      if (up) html.push(`<div class="wa-r wa-r-up" data-i="-1"><span class="c-name">${tbIcon('up', 18)}<span>..</span></span><span class="c-size"></span><span class="c-pack"></span><span class="c-type">Папка</span><span class="c-time"></span><span class="c-crc"></span></div>`);
      items.slice(0, 20000).forEach((it, i) => {
        html.push(`<div class="wa-r${it.dir ? ' dir' : ''}" data-i="${i}" draggable="${mode === 'fs'}"><span class="c-name">${Icons.get(it.icon, 18)}<span>${esc(it.name)}${it.enc ? ' *' : ''}</span></span><span class="c-size">${it.dir && mode === 'fs' ? '' : fmtSize(it.size)}</span><span class="c-pack">${mode === 'arc' ? fmtSize(it.packed) : ''}</span><span class="c-type">${esc(it.type)}</span><span class="c-time">${it.mtime ? fmtDateTime(it.mtime) : ''}</span><span class="c-crc">${esc(it.crc || '')}</span></div>`);
      });
      if (!items.length) html.push(`<div class="wa-empty muted">${mode === 'arc' ? (search ? 'Ничего не найдено.' : 'Папка пуста.') : 'Эта папка пуста.'}</div>`);
      rowsEl.innerHTML = html.join('');
      $$('.wa-head span', b).forEach(s => s.classList.toggle('sorted', s.dataset.s === sort.k));
      updateStatus();
      updateButtons();
    }
    function updateStatus() {
      const s = [...sel].map(i => items[i]).filter(Boolean);
      const total = items.reduce((a, x) => a + (x.dir ? 0 : (x.size || 0)), 0);
      const nf = items.filter(x => !x.dir).length, nd = items.filter(x => x.dir).length;
      $('.wa-st-l', b).textContent = s.length ? `Выбрано: ${s.length} · ${fmtBytes(s.reduce((a, x) => a + (x.size || 0), 0))}` : '';
      let r = `${nd ? nd + ' ' + plural(nd, 'папка', 'папки', 'папок') + ', ' : ''}${nf} ${plural(nf, 'файл', 'файла', 'файлов')}, ${fmtBytes(total)}`;
      if (mode === 'arc' && !search) {
        r = `Всего: ${r}`;
        const root = A.tree;
        if (!inner && root.size) r += ` · сжатие ${Math.round(((A.size || root.packed) / root.size) * 100)}%`;
      }
      $('.wa-st-r', b).textContent = r;
    }
    function updateButtons() {
      const arc = mode === 'arc';
      const s = selected();
      const one = s.length === 1 ? s[0] : null;
      const can = {
        add: arc ? !A.readOnly : true,
        extract: arc || (one && !one.dir && isArchive(one.path)),
        test: arc || (one && !one.dir && isArchive(one.path)),
        view: !!one && !one.dir,
        del: arc ? !A.readOnly && s.length > 0 : s.length > 0,
        find: true,
        info: arc || !!one,
      };
      $$('.wa-tbtn', b).forEach(x => x.disabled = !can[x.dataset.a]);
    }
    const selected = () => [...sel].sort((a, b) => a - b).map(i => items[i]).filter(Boolean);
    function setSel(list) {
      sel = new Set(list);
      $$('.wa-r', rowsEl).forEach(r => r.classList.toggle('sel', sel.has(+r.dataset.i)));
      updateStatus(); updateButtons();
    }

    // ---------- Навигация ----------
    function goUp() {
      if (mode === 'arc') {
        if (search) { search = null; render(); return; }
        if (inner) { const was = inner; inner = inner.split('/').slice(0, -1).join('/'); render(); focusName(was.split('/').pop()); return; }
        const p = A.path; closeArchive(); dir = FS.parent(p) || dir; render(); focusName(FS.basename(p)); return;
      }
      const p = FS.parent(dir);
      if (p) { const was = FS.basename(dir); dir = p; render(); focusName(was); }
    }
    function focusName(n) {
      const i = items.findIndex(x => x.name === n);
      if (i >= 0) { setSel([i]); anchor = i; rowsEl.querySelector(`.wa-r[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' }); }
    }
    async function activate(i) {
      if (i === -1) return goUp();
      const it = items[i];
      if (!it) return;
      if (mode === 'fs') {
        if (it.dir) { dir = it.path; render(); return; }
        if (isArchive(it.path)) { await openArchive(it.path); return; }
        FileOps.open(it.path);
        return;
      }
      if (it.dir) { search = null; inner = it.node.path; render(); return; }
      view([it]);
    }

    // ---------- Команды ----------
    const archFiles = list => list.map(it => ({ path: it.node.path, dir: it.dir, raw: it.node.raw }));
    function tempDir() {
      const devs = Object.keys(FS.devices?.() || {});
      const base = devs.length ? devs[0] + '/.WindowsFX/Temp/WinArchivator' : FS.P.home + '/AppData/Temp/WinArchivator';
      return base + '/' + baseName(A.path);
    }
    async function view(list) {
      if (mode === 'fs') { list.forEach(it => FileOps.open(it.path)); return; }
      const it = list[0];
      if (!it || it.dir) return;
      const dest = tempDir();
      const strip = it.node.path.split('/').slice(0, -1).join('/');
      const n = await extract(A.path, dest, { engine: A.eng, files: archFiles([it]), strip, mode: 'replace', password: A.password });
      if (n) FileOps.open(dest + '/' + it.node.name);
    }
    async function doExtract() {
      if (mode === 'fs') {
        const one = selected()[0];
        if (one && isArchive(one.path)) await extractDialog(one.path);
        return;
      }
      const s = selected();
      const files = s.length ? archFiles(s) : (search ? null : (inner ? archFiles([{ node: nodeAt(inner), dir: true }]) : null));
      const strip = search ? '' : inner;
      await extractDialog(A.path, { engine: A.eng, files: files || undefined, strip, password: A.password, dest: FS.parent(A.path) });
    }
    async function doTest() {
      let eng = A?.eng, own = false, path = A?.path, password = A?.password || '';
      if (mode === 'fs') {
        const one = selected()[0];
        if (!one) return;
        path = one.path; eng = new Engine(); own = true;
      }
      const pr = progress(`${NAME}: проверка архива`, () => eng.cancel());
      pr.op('Проверка ' + FS.basename(path));
      try {
        if (own) {
          let r = await eng.call('open', { url: FS.url(path), name: FS.basename(path) });
          while (r.needPassword) { pr.close(); password = await askPassword(FS.basename(path), !!password); if (!password) return; r = await eng.call('open', { url: FS.url(path), name: FS.basename(path), password }); }
        }
        let r = await eng.call('test', { password }, e => e.progress !== undefined && pr.pct(e.progress));
        while (r.needPassword) { pr.close(); password = await askPassword(FS.basename(path), !!password); if (!password) return; r = await eng.call('test', { password }); }
        pr.close();
        UI.dialog({ title: `Проверка архива ${FS.basename(path)}`, appIcon: APP, icon: r.ok ? 'info' : 'error', message: r.message });
      } catch (e) { if (!e.cancelled) UI.alert(NAME, e.message, 'error'); }
      finally { pr.close(); if (own) eng.w.terminate(); }
    }
    async function doDelete() {
      const s = selected();
      if (!s.length) return;
      if (mode === 'fs') { FileOps.remove ? FileOps.remove(s.map(x => x.path)) : s.forEach(x => FS.remove(x.path)); return; }
      if (A.readOnly) return UI.alert(NAME, 'Этот архив можно только читать: изменять можно архивы 7Z, ZIP и TAR.', 'info');
      if (!(await UI.confirm('Удаление из архива', `Удалить из архива ${s.length === 1 ? '«' + s[0].name + '»' : s.length + ' ' + plural(s.length, 'элемент', 'элемента', 'элементов')}?`, { ok: 'Удалить', danger: true }))) return;
      const pr = progress(`${NAME}: удаление файлов`, () => A.eng.cancel());
      pr.op('Обновление ' + FS.basename(A.path));
      try {
        const r = await A.eng.call('remove', { files: archFiles(s), password: A.password, headerEnc: A.headerEnc }, e => e.progress !== undefined && pr.pct(e.progress));
        pr.op('Запись архива…');
        writeFile(A.path, r.data, Date.now());
        done();
      } catch (e) { if (!e.cancelled) UI.alert(NAME, e.message, 'error'); }
      finally { pr.close(); }
      await reloadArchive();
    }
    async function doAdd(paths) {
      if (mode === 'fs') {
        const s = paths || selected().map(x => x.path);
        if (!s.length) return UI.alert(NAME, 'Выделите файлы и папки, которые нужно добавить в архив.', 'info');
        const out = await addDialog(s, { dir });
        if (out) { if (FS.parent(out) === dir) { render(); focusName(FS.basename(out)); } }
        return;
      }
      if (A.readOnly) return UI.alert(NAME, 'В этот архив нельзя добавлять файлы: изменять можно архивы 7Z, ZIP и TAR.', 'info');
      if (!paths) {
        const p = await UI.filePicker({ mode: 'open', dir: FS.parent(A.path), title: 'Добавить файл в архив' });
        if (!p) return;
        paths = [p];
      }
      const inputs = collectInputs(paths, inner);
      if (!inputs.length) return;
      const pr = progress(`${NAME}: добавление файлов`, () => A.eng.cancel());
      pr.op('Обновление ' + FS.basename(A.path));
      try {
        const r = await A.eng.call('add', { inputs, password: A.password, level: prefs().level, headerEnc: A.headerEnc }, e => { if (e.progress !== undefined) pr.pct(e.progress); if (e.phase) pr.file(e.file); });
        pr.op('Запись архива…');
        writeFile(A.path, r.data, Date.now());
        done();
      } catch (e) { if (!e.cancelled) UI.alert(NAME, e.message, 'error'); }
      finally { pr.close(); }
      await reloadArchive();
    }
    async function doFind() {
      const q = await UI.prompt('Поиск файлов', mode === 'arc' ? 'Имя или маска (*, ?) для поиска в архиве:' : 'Имя или маска (*, ?) для поиска в папке:', '*', {});
      if (!q) return;
      const re = new RegExp('^' + q.trim().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
      const loose = !/[*?]/.test(q);
      const match = n => loose ? n.toLowerCase().includes(q.trim().toLowerCase()) : re.test(n);
      if (mode === 'arc') {
        const out = [];
        (function walk(n) { for (const k of n.kids.values()) { if (match(k.name)) out.push(k); if (k.dir) walk(k); } })(A.tree);
        search = out; render();
        return;
      }
      Apps.launch('explorer', { path: dir, search: q });
    }
    function doInfo() {
      if (mode === 'fs') { const one = selected()[0]; if (one) UI.properties(one.path); return; }
      const t = A.tree;
      let files = 0, dirs = 0, enc = false;
      (function walk(n) { for (const k of n.kids.values()) { if (k.dir) { dirs++; walk(k); } else { files++; if (k.enc) enc = true; } } })(t);
      const i = A.info;
      const rows = [
        ['Архив', FS.basename(A.path)], ['Папка', FS.display(FS.parent(A.path))], ['Формат', (i.Type || '').toUpperCase()],
        ['Размер архива', fmtBytes(A.size || 0)], ['Распакованный размер', fmtBytes(t.size)], ['Степень сжатия', t.size ? Math.round((A.size || 0) / t.size * 100) + '%' : '—'],
        ['Файлов', files], ['Папок', dirs], ['Метод', i.Method || [...new Set(A.entries.map(e => e.method).filter(Boolean))].slice(0, 3).join(', ') || '—'],
        ['Непрерывный', i.Solid === '+' ? 'да' : 'нет'], ['Пароль', enc || A.password ? 'да' : 'нет'], ['Только чтение', A.readOnly ? 'да' : 'нет'],
      ];
      const el = h(`<table class="wa-info">${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(String(v))}</td></tr>`).join('')}</table>`);
      UI.dialog({ title: 'Информация об архиве', appIcon: APP, content: el });
    }
    async function openDialog() {
      const p = await UI.filePicker({ mode: 'open', dir: mode === 'fs' ? dir : FS.parent(A.path), kinds: ['archive'], title: 'Открыть архив', typeLabel: 'Архивы' });
      if (p) openArchive(p);
    }

    function act(a) {
      ({ add: () => doAdd(), extract: doExtract, test: doTest, view: () => view(selected()), del: doDelete, find: doFind, info: doInfo })[a]?.();
    }
    $$('.wa-tbtn', b).forEach(x => x.onclick = () => act(x.dataset.a));
    $('.wa-up', b).onclick = goUp;
    $('.wa-drives', b).onclick = e => {
      const r = e.currentTarget.getBoundingClientRect();
      const places = [['Рабочий стол', FS.P.desktop, 'folder-desktop'], ['Документы', FS.P.docs, 'folder-docs'], ['Загрузки', FS.P.downloads, 'folder-downloads'], ['Изображения', FS.P.pictures, 'folder-images'], ['Видео', FS.P.videos, 'folder-video'], { sep: true }, ...FS.drives().map(d => [`${d.label} (${d.letter})`, d.letter, d.device ? 'drive-phone' : 'drive-win'])];
      UI.menu(r.left - 220, r.bottom + 2, places.map(x => x.sep ? x : { label: x[0], icon: 'app:' + x[2], action: () => { if (mode === 'arc') closeArchive(); dir = x[1]; render(); } }));
    };
    $$('.wa-head span', b).forEach(s => s.onclick = () => { sort = { k: s.dataset.s, asc: sort.k === s.dataset.s ? !sort.asc : true }; render(); });

    // мышь и касание
    rowsEl.addEventListener('click', e => {
      const r = e.target.closest('.wa-r');
      if (!r) { setSel([]); return; }
      const i = +r.dataset.i;
      if (i < 0) { setSel([]); return; }
      if (e.shiftKey && anchor >= 0) { const [a, z] = [Math.min(anchor, i), Math.max(anchor, i)]; setSel([...Array(z - a + 1).keys()].map(k => k + a)); return; }
      if (e.ctrlKey || e.metaKey || b.classList.contains('multi')) { const s = new Set(sel); s.has(i) ? s.delete(i) : s.add(i); anchor = i; setSel([...s]); return; }
      anchor = i; setSel([i]);
    });
    rowsEl.addEventListener('dblclick', e => { const r = e.target.closest('.wa-r'); if (r) activate(+r.dataset.i); });
    rowsEl.addEventListener('contextmenu', e => {
      e.preventDefault();
      const r = e.target.closest('.wa-r');
      if (r && +r.dataset.i >= 0 && !sel.has(+r.dataset.i)) { anchor = +r.dataset.i; setSel([+r.dataset.i]); }
      const s = selected();
      const arc = mode === 'arc';
      const menu = arc ? [
        s.length === 1 && !s[0].dir ? { label: 'Просмотр', icon: 'eye', action: () => view(s) } : null,
        s.length === 1 && s[0].dir ? { label: 'Открыть папку', icon: 'folder-open', action: () => activate([...sel][0]) } : null,
        { label: s.length ? 'Извлечь выделенное…' : 'Извлечь в…', icon: 'download', action: doExtract },
        { label: 'Извлечь рядом с архивом', icon: 'download', action: () => extract(A.path, FS.parent(A.path), { engine: A.eng, files: s.length ? archFiles(s) : undefined, strip: search ? '' : inner, password: A.password, mode: 'ask' }) },
        { sep: true },
        { label: 'Добавить файлы…', icon: 'plus', disabled: A.readOnly, action: () => doAdd() },
        { label: 'Удалить', icon: 'trash', disabled: A.readOnly || !s.length, action: doDelete },
        { sep: true },
        { label: 'Выделить всё', shortcut: 'Ctrl+A', action: () => setSel(items.map((_, i) => i)) },
        { label: 'Информация', icon: 'info', action: doInfo },
      ] : [
        s.length === 1 ? { label: 'Открыть', icon: 'folder-open', action: () => activate([...sel][0]) } : null,
        s.length === 1 && !s[0].dir && isArchive(s[0].path) ? { label: 'Извлечь файлы…', icon: 'download', action: doExtract } : null,
        s.length ? { label: 'Добавить в архив…', icon: 'app:' + APP, action: () => doAdd() } : null,
        { sep: true },
        { label: 'Выделить всё', shortcut: 'Ctrl+A', action: () => setSel(items.map((_, i) => i)) },
        { label: 'Обновить', icon: 'refresh', action: () => { FS.refreshDevice?.(); render(); } },
      ];
      UI.menu(e.clientX, e.clientY, menu.filter(Boolean));
    });

    // перетаскивание из Проводника → добавить в архив (или открыть архив)
    listEl.addEventListener('dragover', e => { if (DnD.paths) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; listEl.classList.add('drop'); } });
    listEl.addEventListener('dragleave', () => listEl.classList.remove('drop'));
    listEl.addEventListener('drop', e => {
      e.preventDefault(); listEl.classList.remove('drop');
      const paths = (DnD.paths || []).slice(); DnD.end();
      if (!paths.length) return;
      if (mode === 'fs' && paths.length === 1 && isArchive(paths[0])) { openArchive(paths[0]); return; }
      doAdd(paths);
    });
    rowsEl.addEventListener('dragstart', e => {
      if (mode !== 'fs') { e.preventDefault(); return; }
      const r = e.target.closest('.wa-r');
      const i = +r?.dataset.i;
      if (!(i >= 0)) { e.preventDefault(); return; }
      if (!sel.has(i)) setSel([i]);
      DnD.start(e, selected().map(x => x.path), 'winarch');
    });
    rowsEl.addEventListener('dragend', () => DnD.end());

    // клавиатура
    listEl.addEventListener('keydown', e => {
      const n = items.length;
      let i = anchor;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { i = clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, n - 1); }
      else if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = n - 1;
      else if (e.key === 'Enter') { if (anchor >= 0) activate(anchor); e.preventDefault(); return; }
      else if (e.key === 'Backspace') { goUp(); e.preventDefault(); return; }
      else if (e.key === 'Delete') { doDelete(); return; }
      else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA') { setSel(items.map((_, k) => k)); e.preventDefault(); return; }
      else if (e.altKey && e.code === 'KeyA') { act('add'); e.preventDefault(); return; }
      else if (e.altKey && e.code === 'KeyE') { act('extract'); e.preventDefault(); return; }
      else if (e.altKey && e.code === 'KeyT') { act('test'); e.preventDefault(); return; }
      else if (e.altKey && e.code === 'KeyI') { act('info'); e.preventDefault(); return; }
      else if (e.key === 'F3') { act('find'); e.preventDefault(); return; }
      else return;
      e.preventDefault();
      if (n) { anchor = i; setSel([i]); rowsEl.querySelector(`.wa-r[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' }); }
    });

    // меню
    const MENUS = {
      file: () => [
        { label: 'Открыть архив…', shortcut: 'Ctrl+O', icon: 'folder-open', action: openDialog },
        mode === 'arc' ? { label: 'Закрыть архив', action: () => { const p = A.path; closeArchive(); dir = FS.parent(p); render(); } } : null,
        { label: 'Показать в Проводнике', icon: 'app:explorer', action: () => Apps.launch('explorer', { path: mode === 'arc' ? FS.parent(A.path) : dir }) },
        { sep: true },
        { label: 'Выделить всё', shortcut: 'Ctrl+A', action: () => setSel(items.map((_, i) => i)) },
        { sep: true },
        { label: 'Выход', action: () => WM.close(win) },
      ].filter(Boolean),
      cmd: () => [
        { label: 'Добавить файлы в архив', shortcut: 'Alt+A', action: () => act('add') },
        { label: 'Извлечь в указанную папку', shortcut: 'Alt+E', action: () => act('extract') },
        mode === 'arc' ? { label: 'Извлечь без подтверждения', action: () => extractHere(A.path, true) } : null,
        { label: 'Проверить архив', shortcut: 'Alt+T', action: () => act('test') },
        { label: 'Просмотреть файл', action: () => act('view') },
        { label: 'Удалить файлы', shortcut: 'Del', action: () => act('del') },
        { sep: true },
        { label: 'Найти файлы', shortcut: 'F3', action: () => act('find') },
        { label: 'Информация', shortcut: 'Alt+I', action: () => act('info') },
      ].filter(Boolean),
      tools: () => [
        { label: 'Преобразовать архив в ZIP', disabled: mode !== 'arc', action: () => convert('zip') },
        { label: 'Преобразовать архив в 7Z', disabled: mode !== 'arc', action: () => convert('7z') },
        { sep: true },
        { label: 'Очистить временные файлы', action: () => { try { const t = tempDir(); if (FS.exists(t)) FS.remove(t); } catch {} } },
      ],
      opts: () => {
        const p = prefs();
        return [
          { label: 'Формат по умолчанию', items: FORMATS.map(f => ({ label: f.label, checked: p.format === f.id, action: () => savePrefs({ format: f.id }) })) },
          { label: 'Сжатие по умолчанию', items: LEVELS.map(([v, n]) => ({ label: n, checked: p.level === v, action: () => savePrefs({ level: v }) })) },
          { label: 'Перезапись при извлечении', items: [['ask', 'Спрашивать'], ['replace', 'Заменять'], ['skip', 'Пропускать'], ['rename', 'Переименовывать']].map(([v, n]) => ({ label: n, checked: p.mode === v, action: () => savePrefs({ mode: v }) })) },
          { label: 'Множественный выбор касанием', checked: b.classList.contains('multi'), action: () => b.classList.toggle('multi') },
        ];
      },
      help: () => [
        { label: 'Поддерживаемые форматы', action: () => UI.dialog({ title: NAME, appIcon: APP, message: 'Открытие и извлечение: ZIP, RAR (включая RAR5), 7Z, TAR, GZ, BZ2, XZ, ZST, LZ, LZMA, Z, ISO, UDF, CAB, ARJ, LZH, CPIO, WIM, DMG, VHD, DEB, RPM, MSI, CHM, JAR, APK, EPUB, многотомные архивы.\n\nСоздание: 7Z, ZIP, TAR, TAR.GZ, TAR.BZ2, TAR.XZ. Шифрование AES-256 для 7Z и ZIP.' }) },
        { label: 'О программе', action: () => UI.dialog({ title: 'О программе ' + NAME, appIcon: APP, html: true, message: `<div style="display:flex;gap:14px;align-items:center">${Icons.get(APP, 56)}<div><b>${NAME}</b> для WindowsFX<br><span class="muted small">Движок: 7-Zip 24.09 © Игорь Павлов (GNU LGPL 2.1 + ограничение unRAR), WebAssembly-сборка 7z-wasm.</span></div></div>` }) },
      ],
    };
    $$('.menubar button', b).forEach(btn => btn.onclick = () => {
      const r2 = btn.getBoundingClientRect();
      btn.classList.add('open');
      const m = UI.menu(r2.left, r2.bottom + 2, MENUS[btn.dataset.m]());
      const obs = new MutationObserver(() => { if (!m.isConnected) { btn.classList.remove('open'); obs.disconnect(); } });
      obs.observe(document.getElementById('overlay-layer'), { childList: true });
    });

    async function convert(fmt) {
      const dest = tempDir() + '/~convert';
      mkdir(dest);
      const n = await extract(A.path, dest, { engine: A.eng, mode: 'replace', password: A.password });
      if (!n) return;
      const out = uniqueName(FS.parent(A.path) + '/' + baseName(A.path) + '.' + fmt);
      const list = FS.list(dest).map(x => x.path);
      await create(list, out, { format: fmt, level: prefs().level, solid: true });
      try { FS.remove(dest); } catch {}
      done();
    }

    win.el.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyO') { e.preventDefault(); openDialog(); }
    });
    win.onArgs = a => { if (a.path) { if (isArchive(a.path) && FS.get(a.path)?.t === 'f') openArchive(a.path); else { if (mode === 'arc') closeArchive(); dir = a.path; render(); } } };
    win.onBack = () => { if (mode === 'arc' || FS.parent(dir)) { goUp(); return true; } return false; };
    win.onClose = () => { A?.eng.w.terminate(); };
    const offFs = FS.on('change', debounce(() => { if (mode === 'fs' && win.el.isConnected) { const keep = selected().map(x => x.name); render(); keep.forEach(focusName); } }, 120));
    const prevClose = win.onClose;
    win.onClose = () => { prevClose(); offFs?.(); };

    // старт
    if (args.path && FS.get(args.path)?.t === 'f' && isArchive(args.path)) { dir = FS.parent(args.path); render(); openArchive(args.path); }
    else { if (args.path && FS.isDir(args.path)) dir = args.path; render(); }
    setTimeout(() => listEl.focus(), 50);
    return win;
  }

  Apps.register({
    id: APP, name: NAME, icon: APP, single: false,
    desc: 'Архиватор: ZIP, RAR, 7Z, TAR, GZ, ISO и другие',
    keywords: 'архив архиватор winrar rar zip 7z 7-zip распаковать упаковать сжать извлечь tar gz iso',
    launch: args => open(args),
  });

  return { menuEntry, extractDialog, addDialog, extractHere, isArchive, open };
})();
