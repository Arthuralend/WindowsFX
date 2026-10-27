/* Виртуальная файловая система, сохраняемая в localStorage */
'use strict';

const FS = (() => {
  const USER = 'C:/Пользователи/Пользователь';
  const P = {
    home: USER,
    desktop: USER + '/Рабочий стол',
    docs: USER + '/Документы',
    downloads: USER + '/Загрузки',
    pictures: USER + '/Изображения',
    music: USER + '/Музыка',
    videos: USER + '/Видео',
  };
  const DRIVES = {
    'C:': { label: 'Локальный диск', total: 256e9, base: 41.7e9 },
    'D:': { label: 'Данные', total: 512e9, base: 118.3e9 },
  };
  const em = new Emitter();
  let root, bin, frozen = false;

  const now = () => Date.now();
  const D = (c = {}, extra = {}) => ({ t: 'd', c, ct: now(), mt: now(), ...extra });
  const F = (c = '', extra = {}) => ({ t: 'f', c, ct: now(), mt: now(), ...extra });
  const lnk = (app, args) => F(JSON.stringify(args ? { app, args } : { app }));
  const svgURL = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);

  function sampleImages() {
    const aurora = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" viewBox="0 0 1200 750"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050a1f"/><stop offset="1" stop-color="#14254d"/></linearGradient><linearGradient id="a" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3cffb0" stop-opacity="0"/><stop offset=".5" stop-color="#3cffb0" stop-opacity=".8"/><stop offset="1" stop-color="#8a5cff" stop-opacity="0"/></linearGradient><filter id="b"><feGaussianBlur stdDeviation="18"/></filter></defs><rect width="1200" height="750" fill="url(#s)"/><g filter="url(#b)"><path d="M-50 330 C250 120 450 420 700 220 S1100 160 1250 260 L1250 330 C1000 260 850 420 650 330 S200 300 -50 420Z" fill="url(#a)"/><path d="M-50 200 C300 60 600 300 900 120 S1150 80 1250 120 L1250 180 C1000 200 800 330 600 260 S150 240 -50 300Z" fill="url(#a)" opacity=".6"/></g>${Array.from({ length: 90 }, (_, i) => `<circle cx="${(i * 137) % 1200}" cy="${(i * 71) % 420}" r="${(i % 3) * 0.6 + 0.6}" fill="#fff" opacity="${0.3 + (i % 5) / 8}"/>`).join('')}<path d="M0 620 L180 520 L300 580 L460 470 L640 590 L800 500 L980 600 L1200 520 L1200 750 L0 750Z" fill="#070b18"/><path d="M0 680 L220 600 L420 660 L620 590 L860 670 L1060 610 L1200 650 L1200 750 L0 750Z" fill="#03060e"/></svg>`;
    const mountains = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" viewBox="0 0 1200 750"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffcf9e"/><stop offset=".55" stop-color="#ff8c7a"/><stop offset="1" stop-color="#7a4b9c"/></linearGradient></defs><rect width="1200" height="750" fill="url(#s)"/><circle cx="820" cy="330" r="90" fill="#fff4d6" opacity=".9"/><path d="M0 470 L200 300 L340 420 L520 250 L720 440 L900 330 L1200 470 L1200 750 L0 750Z" fill="#9a5c9e" opacity=".7"/><path d="M0 560 L160 450 L360 560 L560 420 L780 560 L960 470 L1200 560 L1200 750 L0 750Z" fill="#6b3f86"/><path d="M0 650 L240 560 L480 650 L700 580 L940 660 L1200 600 L1200 750 L0 750Z" fill="#3e2560"/></svg>`;
    const waves = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" viewBox="0 0 1200 750"><defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0fd1ff"/><stop offset="1" stop-color="#2a3bff"/></linearGradient></defs><rect width="1200" height="750" fill="url(#s)"/>${[0, 1, 2, 3, 4, 5].map(i => `<path d="M0 ${300 + i * 80} C200 ${240 + i * 80} 400 ${360 + i * 80} 600 ${300 + i * 80} S1000 ${240 + i * 80} 1200 ${300 + i * 80} L1200 750 L0 750Z" fill="#fff" opacity="${0.06 + i * 0.03}"/>`).join('')}</svg>`;
    return { 'Северное сияние.svg': svgURL(aurora), 'Горы на закате.svg': svgURL(mountains), 'Волны.svg': svgURL(waves) };
  }

  function defaultTree() {
    const imgs = sampleImages();
    const pictures = {};
    for (const [n, u] of Object.entries(imgs)) pictures[n] = F(u);
    return {
      'C:': D({
        'Program Files': D({
          'WindowsFX': D({
            'Блокнот': D({ 'notepad.exe': F('notepad') }),
            'Калькулятор': D({ 'calc.exe': F('calculator') }),
            'Paint': D({ 'mspaint.exe': F('paint') }),
            'Терминал': D({ 'terminal.exe': F('terminal') }),
            'Браузер': D({ 'browser.exe': F('browser') }),
          }),
          'Common Files': D(),
        }, { sys: 1 }),
        'Windows': D({
          'System32': D({
            'drivers': D({ 'etc': D({ 'hosts': F('# Файл hosts\n127.0.0.1       localhost\n::1             localhost\n') }) }),
            'cmd.exe': F('terminal'),
            'taskmgr.exe': F('taskmgr'),
            'explorer.exe': F('explorer'),
            'kernel32.dll': F('MZ\u0090\u0000\u0003 — системная библиотека WindowsFX'),
            'config.sys': F('DEVICE=C:\\Windows\\System32\\himem.sys\nFILES=40\n'),
          }),
          'Fonts': D({ 'SegoeUI.ttf': F('шрифт') }),
          'win.ini': F('; for 16-bit app support\n[fonts]\n[extensions]\n[mci extensions]\n[files]\n[Mail]\nMAPI=1\n'),
        }, { sys: 1 }),
        'Пользователи': D({
          'Пользователь': D({
            'Рабочий стол': D({
              'Этот компьютер.lnk': lnk('explorer', { path: 'thispc://' }),
              'Браузер.lnk': lnk('browser'),
              'Документы.lnk': lnk('explorer', { path: P.docs }),
              'Lexicon.lnk': lnk('lexicon'),
              'Tabs.lnk': lnk('tabs'),
              'Photostore.lnk': lnk('photostore'),
              'WinArchivator.lnk': lnk('winarch'),
              'Видеоплеер.lnk': lnk('fxplayer'),
              'Фотографии.lnk': lnk('photos'),
              'Просмотр PDF.lnk': lnk('pdf'),
              'Параметры.lnk': lnk('settings'),
              'Терминал.lnk': lnk('terminal'),
              'Paint.lnk': lnk('paint'),
              'Сапёр.lnk': lnk('minesweeper'),
              'DOOM.lnk': lnk('doom'),
              'Ассистент.lnk': lnk('assistant'),
              'Прочти меня.txt': F(README),
            }),
            'Документы': D({
              'Добро пожаловать.txt': F('Добро пожаловать в WindowsFX!\n\nЭто рабочий стол в стиле Windows для Android.\nДиск D: — это память вашего устройства, а Документы, Загрузки и Изображения — настоящие папки телефона или планшета.\n\nПопробуйте:\n • перетаскивать окна к краям экрана — они прилипнут;\n • навести курсор на кнопку «Развернуть» — появятся макеты прикрепления;\n • щёлкнуть правой кнопкой мыши по рабочему столу;\n • спросить что-нибудь у Ассистента.\n'),
              'Список дел.txt': F('☐ Настроить обои и цвет акцента\n☐ Нарисовать что-нибудь в Paint\n☐ Сыграть в Сапёра на уровне «Профессионал»\n☐ Добавить события в Календарь\n☑ Запустить WindowsFX\n'),
              'Проекты': D({
                'Идеи.md': F('# Идеи\n\n- Сайт-портфолио\n- Игра на canvas\n- Трекер привычек\n'),
                'index.html': F('<!doctype html>\n<html lang="ru">\n<head><meta charset="utf-8"><title>Моя страница</title>\n<style>body{font-family:Segoe UI,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:linear-gradient(135deg,#4f8cff,#a35cff);color:#fff}button{font-size:18px;padding:10px 20px;border-radius:10px;border:0;cursor:pointer}</style></head>\n<body>\n<div style="text-align:center">\n<h1>Привет из WindowsFX!</h1>\n<p>Эту страницу можно редактировать в Блокноте.</p>\n<button onclick="this.textContent=\'Нажато \' + (++window.n||(window.n=1)) + \' раз\'">Нажми меня</button>\n</div>\n</body>\n</html>\n'),
                'script.js': F('// Пример JavaScript\nfunction greet(name) {\n  return `Привет, ${name}!`;\n}\n\nconsole.log(greet("мир"));\n'),
              }),
            }),
            'Загрузки': D(),
            'Изображения': D(pictures),
            'Музыка': D(),
            'Видео': D(),
          }),
        }, { sys: 1 }),
      }),
      'D:': D({
        'Резервные копии': D(),
        'Игры': D({ 'Сапёр': D({ 'minesweeper.exe': F('minesweeper') }), '2048': D({ '2048.exe': F('game2048') }), 'DOOM': D({ 'doom.exe': F('doom') }) }),
        'readme.txt': F('Диск D: — для ваших данных.\n'),
      }),
    };
  }

  const README = 'WindowsFX\n=========\n\nГорячие клавиши:\n  Ctrl+Alt+S — меню «Пуск»\n  Ctrl+Alt+D — показать рабочий стол\n  Ctrl+Alt+E — Проводник\n  Ctrl+Alt+I — Параметры\n  Ctrl+Alt+T — Терминал\n  Ctrl+Alt+L — заблокировать\n  Ctrl+Alt+W — закрыть активное окно\n  Ctrl+Alt+Tab / Ctrl+Alt+V — представление задач\n  Ctrl+Alt+Стрелки — прикрепить окно\n  Esc — закрыть меню\n\nМожно перетаскивать файлы с вашего компьютера прямо на рабочий стол или в окно Проводника.\n';

  function load() {
    initDev();
    if (Object.keys(DEV).length) {
      delete DRIVES['D:'];
      const D0 = Object.keys(DEV)[0];
      if (FX.web) {
        // Сайт: рабочий стол и папки пользователя — на личном диске сервера; C: — небольшой системный диск профиля
        DRIVES['C:'] = { label: 'Система', total: 20 * 1048576, base: 0 };
        Object.assign(P, { desktop: D0 + '/Рабочий стол', docs: D0 + '/Документы', downloads: D0 + '/Загрузки', pictures: D0 + '/Изображения', music: D0 + '/Музыка', videos: D0 + '/Видео', camera: D0 + '/Изображения' });
      } else
      Object.assign(P, { docs: D0 + '/Documents', downloads: D0 + '/Download', pictures: D0 + '/Pictures', music: D0 + '/Music', videos: D0 + '/Movies', camera: D0 + '/DCIM' });
      FOLDER_ICONS = { [P.desktop]: 'folder-desktop', [P.docs]: 'folder-docs', [P.downloads]: 'folder-downloads', [P.pictures]: 'folder-images', [P.music]: 'folder-music', [P.videos]: 'folder-video', [P.camera]: 'folder-images' };
      if (FX.tryCall('hasAccess')) ensureDevFolders();
    }
    const saved = Persist.get('fs', null);
    if (saved && saved.root && saved.root['C:']) { root = saved.root; bin = saved.bin || []; }
    else { root = defaultTree(); bin = []; save(); }
    if (Object.keys(DEV).length) {
      if (root['D:']) {
        // старый виртуальный диск D: становится папкой на C:
        const games = root['D:'].c['Игры'];
        if (games) root['C:'].c['Игры'] = games;
        delete root['D:'];
        save();
      }
    }
    migrateDesktop();
    if (FX.web && isDev(P.desktop)) seedWebDesktop();
  }

  /** Сайт: при первом входе ярлыки и «Прочти меня» переносятся на рабочий стол личного диска */
  function seedWebDesktop() {
    try {
      const np = toNative(P.desktop);
      if (Persist.get('web.desktopSeeded', false)) return;
      Persist.set('web.desktopSeeded', true);
      devInvalidate(np);
      if (!devStat(np)) FX.call('mkdir', np);
      else if ((FX.call('list', np) || []).length) return;
      const parts = split(USER + '/Рабочий стол');
      let d = root[parts[0]];
      for (const k of parts.slice(1)) d = d && d.c && d.c[k];
      if (!d || !d.c) return;
      for (const [n, node] of Object.entries(d.c)) if (node.t === 'f' && typeof node.c === 'string' && !node.c.startsWith('data:')) FX.call('writeText', np + '/' + n, node.c);
      devInvalidate(np);
    } catch (e) { console.warn('desktop seed', e); }
  }

  /** 0.4: Prism → Photostore, новые ярлыки WinArchivator и Видеоплеер (один раз) */
  function migrateDesktop() {
    try {
      const parts = split(P.desktop);
      let d = root[parts[0]];
      for (const k of parts.slice(1)) d = d && d.c && d.c[k];
      if (!d || !d.c) return;
      let ch = false;
      if (d.c['Prism.lnk']) { d.c['Photostore.lnk'] = d.c['Prism.lnk']; d.c['Photostore.lnk'].c = JSON.stringify({ app: 'photostore' }); delete d.c['Prism.lnk']; ch = true; }
      const done = Persist.get('fxmig', []);
      const add = { 'WinArchivator.lnk': 'winarch', 'Видеоплеер.lnk': 'fxplayer' };
      for (const [n, app] of Object.entries(add)) {
        if (done.includes(app)) continue;
        if (!d.c[n]) { d.c[n] = F(JSON.stringify({ app })); ch = true; }
        done.push(app);
      }
      Persist.set('fxmig', done);
      if (ch) save();
    } catch (e) { console.warn('desktop migration', e); }
  }

  const save = debounce(() => {
    if (frozen) return;
    Persist.set('fs', { root, bin });
  }, 400);

  function changed(info = {}) { save(); em.emit('change', info); }

  // ---------- Пути ----------
  function norm(p) {
    p = String(p || '').replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/$/, '');
    if (/^[a-z]:/i.test(p)) p = p[0].toUpperCase() + p.slice(1);
    return p;
  }
  const split = p => norm(p).split('/').filter(Boolean);
  const join = (...a) => norm(a.filter(Boolean).join('/'));
  const parent = p => split(p).slice(0, -1).join('/');
  const basename = p => { const s = split(p); return s[s.length - 1] || ''; };
  const ext = n => { const i = n.lastIndexOf('.'); return i > 0 ? n.slice(i + 1).toLowerCase() : ''; };
  const stem = n => { const i = n.lastIndexOf('.'); return i > 0 ? n.slice(0, i) : n; };
  const display = p => norm(p).replace(/\//g, '\\') + (/^[A-Z]:$/.test(norm(p)) ? '\\' : '');

  // ================= Память устройства Android (диски D:, E: …) =================
  const DEV = {};              // 'D:' -> { root, label, total, free }
  const DEV_TEXT_MAX = 12 * 1024 * 1024;
  const DEV_BIN_MAX = 40 * 1024 * 1024;
  const devStatCache = new Map();  // nativePath -> { info, at }
  const devListCache = new Map();  // nativePath -> { list, at }
  const CACHE_MS = 2500;

  function initDev() {
    if (typeof FX === 'undefined' || !FX.available) return;
    try {
      const roots = FX.call('roots') || [];
      const letters = ['D:', 'E:', 'F:', 'G:', 'H:', 'I:', 'J:', 'K:', 'L:', 'M:', 'N:', 'O:', 'P:'];
      roots.forEach((r, i) => {
        if (i >= letters.length) return;
        // сайт: у каждого диска своя постоянная буква (D: — личный диск, G:… — облака, L:… — папки компьютера)
        const L = r.letter && !DEV[r.letter] && !['A:', 'B:', 'C:'].includes(r.letter) ? r.letter : letters.find(l => !DEV[l]);
        if (!L) return;
        DEV[L] = { root: r.path, label: r.label || (i === 0 ? 'Внутренняя память' : (roots.length > 2 ? 'SD-карта ' + i : 'SD-карта')), total: r.total, free: r.free, kind: r.kind || r.key };
      });
    } catch (e) { console.warn('device roots', e); }
  }
  function refreshDevSpace() {
    if (typeof FX === 'undefined' || !FX.available) return;
    const roots = FX.tryCall('roots') || [];
    Object.values(DEV).forEach(d => { const r = roots.find(x => x.path === d.root); if (r) { d.total = r.total; d.free = r.free; } });
  }
  const devLetter = p => { const d = (split(p)[0] || '').toUpperCase(); return DEV[d] ? d : null; };
  const isDev = p => !!devLetter(p);
  function toNative(p) {
    const parts = split(p);
    const L = parts[0].toUpperCase();
    return DEV[L].root + (parts.length > 1 ? '/' + parts.slice(1).join('/') : '');
  }
  function fromNative(np) {
    for (const [L, d] of Object.entries(DEV)) if (np === d.root || np.startsWith(d.root + '/')) return L + np.slice(d.root.length);
    return null;
  }
  const nparent = np => np.slice(0, np.lastIndexOf('/')) || '/';
  function devInvalidate(np) {
    devStatCache.delete(np);
    devListCache.delete(np);
    devListCache.delete(nparent(np));
  }
  function devInvalidateAll() { devStatCache.clear(); devListCache.clear(); refreshDevSpace(); }
  function devStat(np) {
    const c = devStatCache.get(np);
    if (c && Date.now() - c.at < CACHE_MS) return c.info;
    const st = FX.call('stat', np);
    const info = st ? { t: st.t, s: st.s, m: st.m } : null;
    devStatCache.set(np, { info, at: Date.now() });
    return info;
  }
  function devListRaw(np) {
    const c = devListCache.get(np);
    if (c && Date.now() - c.at < CACHE_MS) return c.list;
    const list = FX.call('list', np) || [];
    const now = Date.now();
    list.forEach(i => devStatCache.set(np + '/' + i.n, { info: { t: i.d ? 'd' : 'f', s: i.s, m: i.m }, at: now }));
    devListCache.set(np, { list, at: now });
    return list;
  }
  const TEXT_KINDS = ['text', 'code', 'html', 'lnk'];
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', mp4: 'video/mp4', webm: 'video/webm', pdf: 'application/pdf' };
  function isTextName(name) {
    const t = TYPES[ext(name)];
    return !!t && TEXT_KINDS.includes(t[0]);
  }
  /** Содержимое файла устройства: текст или URL (для изображений, звука, видео, документов) */
  function devContent(np) {
    const name = np.slice(np.lastIndexOf('/') + 1);
    if (isTextName(name)) return FX.call('readText', np, DEV_TEXT_MAX);
    return FX.url(np);
  }
  /** Псевдо-узел дерева для файла устройства (содержимое читается лениво) */
  function devNode(np, info) {
    const node = { t: info.t, ct: info.m, mt: info.m, size: info.s || 0, dev: np };
    Object.defineProperty(node, 'c', {
      enumerable: false,
      get() {
        if (node.t !== 'd') return devContent(np);
        const kids = {};
        const hidden = typeof Store !== 'undefined' && Store.get('showHidden');
        for (const i of devListRaw(np)) {
          if (!hidden && i.n.startsWith('.')) continue;
          kids[i.n] = devNode(np + '/' + i.n, { t: i.d ? 'd' : 'f', s: i.s, m: i.m });
        }
        return kids;
      },
    });
    return node;
  }
  function devGet(path) {
    const np = toNative(path);
    const info = devStat(np);
    return info ? devNode(np, info) : null;
  }
  /** Двоичное содержимое как data:URL (для копирования между дисками) */
  function devDataURL(np) {
    const name = np.slice(np.lastIndexOf('/') + 1);
    const b64 = FX.call('readBase64', np, DEV_BIN_MAX);
    return 'data:' + (MIME[ext(name)] || 'application/octet-stream') + ';base64,' + b64;
  }
  function devWrite(np, content) {
    content = String(content ?? '');
    if (content.startsWith('data:')) {
      const i = content.indexOf(',');
      const head = content.slice(0, i);
      const data = content.slice(i + 1);
      if (head.includes(';base64')) FX.call('writeBase64', np, data);
      else FX.call('writeText', np, decodeURIComponent(data));
    } else if (/^\/fs\//.test(content) && !isTextName(np)) {
      // URL другого файла устройства → копия
      const src = decodeURIComponent(content.slice(3));
      if (src !== np) { try { FX.call('remove', np); } catch {} FX.call('copy', src, np); }
    } else FX.call('writeText', np, content);
    devInvalidate(np);
  }
  /** Перенос между виртуальным диском и устройством (рекурсивно) */
  function crossCopy(srcPath, destPath) {
    if (isDev(srcPath)) {
      const snp = toNative(srcPath);
      const info = devStat(snp);
      if (!info) throw new Error('Элемент не найден.');
      if (info.t === 'd') {
        mkdirRaw(destPath);
        for (const i of devListRaw(snp)) crossCopy(srcPath + '/' + i.n, destPath + '/' + i.n);
      } else {
        const content = isTextName(srcPath) ? FX.call('readText', snp, DEV_TEXT_MAX) : devDataURL(snp);
        write(destPath, content);
      }
    } else {
      const n = get(srcPath);
      if (!n) throw new Error('Элемент не найден.');
      if (n.t === 'd') {
        mkdirRaw(destPath);
        for (const k of Object.keys(n.c)) crossCopy(srcPath + '/' + k, destPath + '/' + k);
      } else write(destPath, n.c);
    }
  }
  function ensureDevFolders() {
    for (const p of [P.desktop, P.docs, P.downloads, P.pictures, P.music, P.videos]) {
      if (!isDev(p)) continue;
      try { if (!devStat(toNative(p))) FX.call('mkdir', toNative(p)); } catch {}
    }
  }
  function mkdirRaw(path) {
    if (isDev(path)) { FX.call('mkdir', toNative(path)); devInvalidate(toNative(path)); }
    else mkdir(path);
  }

  function key(dir, name) {
    if (!dir || dir.t !== 'd') return null;
    if (name in dir.c) return name;
    const low = name.toLowerCase();
    return Object.keys(dir.c).find(k => k.toLowerCase() === low) ?? null;
  }

  function get(path) {
    const parts = split(path);
    if (!parts.length) return null;
    if (isDev(path)) { try { return devGet(path); } catch { return null; } }
    let n = root[parts[0].toUpperCase()];
    for (let i = 1; i < parts.length && n; i++) {
      const k = key(n, parts[i]);
      n = k === null ? null : n.c[k];
    }
    return n || null;
  }

  /** Возвращает путь с реальным регистром имён */
  function realPath(path) {
    const parts = split(path);
    if (parts.length && isDev(path)) {
      const p = [parts[0].toUpperCase(), ...parts.slice(1)].join('/');
      try { return devStat(toNative(p)) ? p : null; } catch { return null; }
    }
    if (!parts.length || !root[parts[0].toUpperCase()]) return null;
    let n = root[parts[0].toUpperCase()];
    const out = [parts[0].toUpperCase()];
    for (let i = 1; i < parts.length; i++) {
      const k = key(n, parts[i]);
      if (k === null) return null;
      out.push(k); n = n.c[k];
    }
    return out.join('/');
  }

  function validName(name) {
    name = String(name || '').trim();
    if (!name) throw new Error('Имя не может быть пустым.');
    if (/[\\/:*?"<>|]/.test(name)) throw new Error('Имя файла не может содержать следующие знаки: \\ / : * ? " < > |');
    if (name === '.' || name === '..') throw new Error('Недопустимое имя.');
    if (name.length > 200) throw new Error('Слишком длинное имя.');
    return name;
  }

  function dirNode(path) {
    const n = get(path);
    if (!n) throw new Error('Путь не найден: ' + display(path));
    if (n.t !== 'd') throw new Error('Это не папка: ' + display(path));
    return n;
  }

  function isProtected(path) {
    if (isDev(path)) {
      const parts = split(path);
      if (parts.length <= 1) return true;
      return Object.values(P).includes(realPath(path) || norm(path));
    }
    const p = realPath(path) || norm(path);
    const prot = ['C:/Windows', 'C:/Program Files', 'C:/Пользователи', USER, ...Object.values(P)];
    return split(p).length <= 1 || prot.includes(p) || p.startsWith('C:/Windows/');
  }

  function unique(dirPath, name) {
    const d = get(dirPath);
    if (!d || key(d, name) === null) return name;
    const isFile = name.includes('.') && !name.startsWith('.');
    const s = isFile ? stem(name) : name;
    const e = isFile ? name.slice(s.length) : '';
    for (let i = 2; ; i++) {
      const cand = `${s} (${i})${e}`;
      if (key(d, cand) === null) return cand;
    }
  }

  // ---------- Операции ----------
  function list(path) {
    if (isDev(path)) {
      const np = toNative(path);
      const base = (realPath(path) || norm(path));
      const hidden = typeof Store !== 'undefined' && Store.get('showHidden');
      return devListRaw(np).filter(i => hidden || !i.n.startsWith('.'))
        .map(i => ({ name: i.n, path: base + '/' + i.n, node: devNode(np + '/' + i.n, { t: i.d ? 'd' : 'f', s: i.s, m: i.m }), isDir: i.d }))
        .sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name, 'ru', { numeric: true }));
    }
    const d = dirNode(path);
    const base = realPath(path);
    return Object.keys(d.c).map(name => ({ name, path: base + '/' + name, node: d.c[name], isDir: d.c[name].t === 'd' }))
      .sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name, 'ru', { numeric: true }));
  }

  function mkdir(path) {
    if (isDev(path)) {
      const name = validName(basename(path));
      const np = toNative(parent(path)) + '/' + name;
      FX.call('mkdir', np);
      devInvalidate(np);
      changed({ dir: parent(path) });
      return (realPath(parent(path)) || parent(path)) + '/' + name;
    }
    const par = dirNode(parent(path));
    const name = validName(basename(path));
    if (key(par, name) !== null) throw new Error(`Элемент «${name}» уже существует.`);
    par.c[name] = D();
    par.mt = now();
    changed({ dir: parent(path) });
    return realPath(parent(path)) + '/' + name;
  }

  function mkdirp(path) {
    const parts = split(path);
    let cur = parts[0];
    for (let i = 1; i < parts.length; i++) {
      cur += '/' + parts[i];
      const n = get(cur);
      if (!n) mkdir(cur);
      else if (n.t !== 'd') throw new Error('Это не папка: ' + display(cur));
    }
    return realPath(path);
  }

  function write(path, content) {
    if (isDev(path)) {
      const name = validName(basename(path));
      const np = toNative(parent(path)) + '/' + name;
      devWrite(np, content);
      changed({ dir: parent(path), path });
      return (realPath(parent(path)) || parent(path)) + '/' + name;
    }
    const par = dirNode(parent(path));
    const name = validName(basename(path));
    const k = key(par, name);
    if (k !== null) {
      const n = par.c[k];
      if (n.t === 'd') throw new Error('Папка с таким именем уже существует.');
      n.c = content; n.mt = now();
    } else {
      par.c[name] = F(content);
    }
    par.mt = now();
    changed({ dir: parent(path), path });
    return realPath(path);
  }

  function read(path) {
    if (isDev(path)) {
      const np = toNative(path);
      const info = devStat(np);
      if (!info) throw new Error('Файл не найден: ' + display(path));
      if (info.t !== 'f') throw new Error('Это папка: ' + display(path));
      return devContent(np);
    }
    const n = get(path);
    if (!n) throw new Error('Файл не найден: ' + display(path));
    if (n.t !== 'f') throw new Error('Это папка: ' + display(path));
    return n.c;
  }

  function rename(path, newName) {
    newName = validName(newName);
    if (isDev(path)) {
      const rp0 = realPath(path);
      if (!rp0) throw new Error('Элемент не найден.');
      if (isProtected(rp0)) throw new Error('Отказано в доступе. Эта папка защищена системой.');
      if (basename(rp0) === newName) return rp0;
      const np = toNative(rp0);
      FX.call('rename', np, newName);
      devInvalidate(np);
      devInvalidate(nparent(np) + '/' + newName);
      const out = parent(rp0) + '/' + newName;
      changed({ dir: parent(rp0), renamed: [rp0, out] });
      return out;
    }
    const rp = realPath(path);
    if (!rp) throw new Error('Элемент не найден.');
    if (isProtected(rp)) throw new Error('Отказано в доступе. Этот элемент защищён системой.');
    const parPath = parent(rp);
    const par = get(parPath);
    const old = basename(rp);
    if (old === newName) return rp;
    const ex = key(par, newName);
    if (ex !== null && ex !== old) throw new Error(`Элемент «${newName}» уже существует в этой папке.`);
    // сохраняем порядок ключей
    const entries = Object.entries(par.c).map(([k, v]) => k === old ? [newName, v] : [k, v]);
    par.c = Object.fromEntries(entries);
    par.c[newName].mt = now();
    changed({ dir: parPath, renamed: [rp, parPath + '/' + newName] });
    return parPath + '/' + newName;
  }

  function detach(path) {
    const rp = realPath(path);
    if (!rp) throw new Error('Элемент не найден.');
    if (isProtected(rp)) throw new Error('Отказано в доступе. Этот элемент защищён системой.');
    const par = get(parent(rp));
    const name = basename(rp);
    const node = par.c[name];
    delete par.c[name];
    par.mt = now();
    return { node, name, rp };
  }

  function remove(path) {
    if (isDev(path)) {
      const rp0 = realPath(path);
      if (!rp0) throw new Error('Элемент не найден.');
      if (isProtected(rp0)) throw new Error('Отказано в доступе. Эта папка защищена системой.');
      const np = toNative(rp0);
      const info = devStat(np);
      const trashed = FX.call('trash', np);
      devInvalidate(np);
      const id = uid('bin');
      bin.unshift({ id, name: basename(rp0), orig: parent(rp0), dev: trashed, node: { t: info?.t || 'f', c: '', ct: info?.m || now(), mt: info?.m || now(), size: info?.s || 0 }, dt: now() });
      changed({ dir: parent(rp0), removed: rp0 });
      return id;
    }
    const { node, name, rp } = detach(path);
    const id = uid('bin');
    bin.unshift({ id, name, orig: parent(rp), node, dt: now() });
    changed({ dir: parent(rp), removed: rp });
    return id;
  }

  function removePermanent(path) {
    if (isDev(path)) {
      const rp0 = realPath(path);
      if (!rp0) throw new Error('Элемент не найден.');
      if (isProtected(rp0)) throw new Error('Отказано в доступе. Эта папка защищена системой.');
      FX.call('remove', toNative(rp0));
      devInvalidate(toNative(rp0));
      changed({ dir: parent(rp0), removed: rp0 });
      return;
    }
    const { rp } = detach(path);
    changed({ dir: parent(rp), removed: rp });
  }

  function restore(id) {
    const i = bin.findIndex(b => b.id === id);
    if (i < 0) return null;
    const b = bin[i];
    if (!get(b.orig)) mkdirp(b.orig);
    const name = unique(b.orig, b.name);
    if (b.dev) {
      FX.call('untrash', b.dev, toNative(b.orig) + '/' + name);
      devInvalidate(toNative(b.orig) + '/' + name);
      bin.splice(i, 1);
      changed({ dir: b.orig });
      return (realPath(b.orig) || b.orig) + '/' + name;
    }
    get(b.orig).c[name] = b.node;
    bin.splice(i, 1);
    changed({ dir: b.orig });
    return realPath(b.orig) + '/' + name;
  }

  function purge(id) {
    const i = bin.findIndex(b => b.id === id);
    if (i >= 0) { if (bin[i].dev) FX.tryCall('purge', bin[i].dev); bin.splice(i, 1); changed({ bin: true }); }
  }

  function emptyBin() { bin.forEach(b => b.dev && FX.tryCall('purge', b.dev)); bin = []; changed({ bin: true }); }

  const clone = n => structuredClone(n);

  function isInside(child, par) {
    const c = (realPath(child) || norm(child)).toLowerCase();
    const p = (realPath(par) || norm(par)).toLowerCase();
    return c === p || c.startsWith(p + '/');
  }

  function copy(src, destDir) {
    if (isDev(src) || isDev(destDir)) {
      const rs0 = realPath(src);
      if (!rs0) throw new Error('Элемент не найден.');
      const rd0 = realPath(destDir);
      if (!rd0 || get(rd0)?.t !== 'd') throw new Error('Папка назначения не найдена.');
      const srcNode = get(rs0);
      if (srcNode.t === 'd' && isInside(rd0, rs0)) throw new Error('Конечная папка является вложенной в исходную.');
      let name = basename(rs0);
      if (get(rd0 + '/' + name)) {
        const isFile = srcNode.t === 'f' && ext(name);
        name = unique(rd0, isFile ? `${stem(name)} — копия.${ext(name)}` : `${name} — копия`);
      }
      const dest = rd0 + '/' + name;
      if (isDev(rs0) && isDev(rd0)) { FX.call('copy', toNative(rs0), toNative(dest)); devInvalidate(toNative(dest)); }
      else crossCopy(rs0, dest);
      changed({ dir: rd0 });
      return dest;
    }
    const rs = realPath(src);
    const n = get(rs);
    if (!n) throw new Error('Элемент не найден.');
    const dest = dirNode(destDir);
    if (n.t === 'd' && isInside(destDir, rs)) throw new Error('Конечная папка является вложенной в исходную.');
    let name = basename(rs);
    if (key(dest, name) !== null) {
      const isFile = n.t === 'f' && ext(name);
      const cname = isFile ? `${stem(name)} — копия.${ext(name)}` : `${name} — копия`;
      name = unique(destDir, cname);
    }
    const c = clone(n);
    c.ct = c.mt = now();
    dest.c[name] = c;
    changed({ dir: destDir });
    return realPath(destDir) + '/' + name;
  }

  function move(src, destDir) {
    const rs = realPath(src);
    if (!rs) throw new Error('Элемент не найден.');
    const rd = realPath(destDir);
    if (!rd) throw new Error('Папка назначения не найдена.');
    if (parent(rs).toLowerCase() === rd.toLowerCase()) return rs;
    if (isInside(rd, rs)) throw new Error('Невозможно переместить папку в саму себя.');
    if (isDev(rs) || isDev(rd)) {
      if (isProtected(rs)) throw new Error('Отказано в доступе. Этот элемент защищён системой.');
      const name = unique(rd, basename(rs));
      const dest = rd + '/' + name;
      if (isDev(rs) && isDev(rd)) { FX.call('move', toNative(rs), toNative(dest)); devInvalidate(toNative(rs)); devInvalidate(toNative(dest)); }
      else {
        crossCopy(rs, dest);
        if (isDev(rs)) { FX.call('remove', toNative(rs)); devInvalidate(toNative(rs)); }
        else detach(rs);
      }
      changed({ dir: rd, moved: [rs, dest] });
      return dest;
    }
    const dest = dirNode(rd);
    const { node, name } = detach(rs);
    const nn = unique(rd, name);
    dest.c[nn] = node;
    dest.mt = now();
    changed({ dir: rd, moved: [rs, rd + '/' + nn] });
    return rd + '/' + nn;
  }

  function nodeSize(n) {
    if (!n) return 0;
    if (n.dev) {
      if (n.t !== 'd') return n.size || 0;
      try { return FX.call('usage', n.dev).size; } catch { return 0; }
    }
    if (n.size !== undefined && n.c === '') return n.size;
    if (n.t === 'd') return Object.values(n.c).reduce((s, c) => s + nodeSize(c), 0);
    const s = n.c || '';
    if (s.startsWith('data:')) {
      const i = s.indexOf(',');
      return s.slice(0, i).includes('base64') ? Math.round((s.length - i - 1) * 3 / 4) : decodeURIComponent(s.slice(i + 1)).length;
    }
    let b = 0;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); b += c < 0x80 ? 1 : c < 0x800 ? 2 : 3; }
    return b;
  }

  function countItems(n) {
    if (n && n.dev) { try { const u = FX.call('usage', n.dev); return { files: u.files, dirs: u.dirs }; } catch { return { files: 0, dirs: 0 }; } }
    let files = 0, dirs = 0;
    (function walk(x) { for (const c of Object.values(x.c)) { if (c.t === 'd') { dirs++; walk(c); } else files++; } })(n);
    return { files, dirs };
  }

  function walk(path, fn) {
    const start = realPath(path);
    if (!start) return;
    (function rec(p, n) {
      for (const [name, c] of Object.entries(n.c)) {
        const cp = p + '/' + name;
        if (fn(cp, c, name) === false) return false;
        if (c.t === 'd' && rec(cp, c) === false) return false;
      }
    })(start, get(start));
  }

  function search(path, query, limit = 200) {
    if (isDev(path)) {
      try {
        return (FX.call('search', toNative(realPath(path) || path), query, limit) || []).map(i => {
          const p = fromNative(i.p);
          return { name: i.n, path: p, node: devNode(i.p, { t: i.d ? 'd' : 'f', s: i.s, m: i.m }), isDir: i.d };
        }).filter(x => x.path);
      } catch { return []; }
    }
    const q = query.toLowerCase();
    const res = [];
    walk(path, (p, n, name) => {
      if (name.toLowerCase().includes(q)) res.push({ name, path: p, node: n, isDir: n.t === 'd' });
      if (res.length >= limit) return false;
    });
    return res;
  }

  const TYPES = {
    txt: ['text', 'Текстовый документ', 'file-text'], log: ['text', 'Файл журнала', 'file-text'], ini: ['text', 'Параметры конфигурации', 'file-text'],
    cfg: ['text', 'Файл конфигурации', 'file-text'], md: ['text', 'Документ Markdown', 'file-text'], csv: ['text', 'Файл CSV', 'file-text'],
    sys: ['text', 'Системный файл', 'file-generic'], dll: ['other', 'Расширение приложения', 'file-generic'],
    js: ['code', 'Файл JavaScript', 'file-code'], ts: ['code', 'Файл TypeScript', 'file-code'], css: ['code', 'Каскадная таблица стилей', 'file-code'],
    json: ['code', 'Файл JSON', 'file-code'], py: ['code', 'Файл Python', 'file-code'], xml: ['code', 'Документ XML', 'file-code'],
    c: ['code', 'Исходный код C', 'file-code'], cpp: ['code', 'Исходный код C++', 'file-code'], java: ['code', 'Исходный код Java', 'file-code'],
    html: ['html', 'HTML-документ', 'file-html'], htm: ['html', 'HTML-документ', 'file-html'],
    png: ['image', 'Изображение PNG', 'file-image'], jpg: ['image', 'Изображение JPEG', 'file-image'], jpeg: ['image', 'Изображение JPEG', 'file-image'],
    gif: ['image', 'Изображение GIF', 'file-image'], webp: ['image', 'Изображение WebP', 'file-image'], svg: ['image', 'Изображение SVG', 'file-image'], bmp: ['image', 'Точечный рисунок', 'file-image'],
    mp3: ['audio', 'Аудиофайл MP3', 'file-audio'], wav: ['audio', 'Аудиофайл WAV', 'file-audio'], ogg: ['audio', 'Аудиофайл OGG', 'file-audio'], m4a: ['audio', 'Аудиофайл M4A', 'file-audio'], flac: ['audio', 'Аудиофайл FLAC', 'file-audio'],
    mp4: ['video', 'Видеофайл MP4', 'file-video'], webm: ['video', 'Видеофайл WebM', 'file-video'], avi: ['video', 'Видеофайл AVI', 'file-video'], wmv: ['video', 'Видеофайл WMV', 'file-video'], flv: ['video', 'Видеофайл FLV', 'file-video'], mpg: ['video', 'Видеофайл MPEG', 'file-video'], mpeg: ['video', 'Видеофайл MPEG', 'file-video'], m4v: ['video', 'Видеофайл M4V', 'file-video'], ts: ['video', 'Видеопоток MPEG-TS', 'file-video'], m2ts: ['video', 'Видеофайл M2TS', 'file-video'], mts: ['video', 'Видеофайл AVCHD', 'file-video'], vob: ['video', 'Видеофайл DVD', 'file-video'], ogv: ['video', 'Видеофайл OGG', 'file-video'], rmvb: ['video', 'Видеофайл RealMedia', 'file-video'], asf: ['video', 'Видеофайл ASF', 'file-video'], divx: ['video', 'Видеофайл DivX', 'file-video'], f4v: ['video', 'Видеофайл F4V', 'file-video'],
    lnk: ['lnk', 'Ярлык', 'file-generic'], exe: ['exe', 'Приложение', 'file-generic'],
    pdf: ['pdf', 'Документ PDF', 'file-pdf'],
    docx: ['doc', 'Документ Word', 'file-doc'], doc: ['doc', 'Документ Word 97–2003', 'file-doc'], odt: ['doc', 'Документ OpenDocument', 'file-doc'], rtf: ['doc', 'Документ RTF', 'file-doc'],
    xlsx: ['sheet', 'Лист Excel', 'file-sheet'], xls: ['sheet', 'Лист Excel 97–2003', 'file-sheet'], ods: ['sheet', 'Таблица OpenDocument', 'file-sheet'],
    psd: ['psd', 'Изображение Photoshop', 'file-psd'],
    heic: ['image', 'Изображение HEIC', 'file-image'], mkv: ['video', 'Видеофайл MKV', 'file-video'], mov: ['video', 'Видеофайл MOV', 'file-video'], '3gp': ['video', 'Видеофайл 3GP', 'file-video'],
    aac: ['audio', 'Аудиофайл AAC', 'file-audio'], opus: ['audio', 'Аудиофайл OPUS', 'file-audio'],
    apk: ['apk', 'Пакет приложения Android', 'file-apk'], zip: ['archive', 'Архив ZIP', 'file-archive'], rar: ['archive', 'Архив RAR', 'file-archive'], '7z': ['archive', 'Архив 7-Zip', 'file-archive'], tar: ['archive', 'Архив TAR', 'file-archive'], gz: ['archive', 'Архив GZip', 'file-archive'], tgz: ['archive', 'Архив TAR.GZ', 'file-archive'], bz2: ['archive', 'Архив BZip2', 'file-archive'], tbz2: ['archive', 'Архив TAR.BZ2', 'file-archive'], xz: ['archive', 'Архив XZ', 'file-archive'], txz: ['archive', 'Архив TAR.XZ', 'file-archive'], zst: ['archive', 'Архив Zstandard', 'file-archive'], lz: ['archive', 'Архив LZip', 'file-archive'], lzma: ['archive', 'Архив LZMA', 'file-archive'], z: ['archive', 'Архив Z', 'file-archive'], iso: ['archive', 'Образ диска ISO', 'file-archive'], cab: ['archive', 'Архив CAB', 'file-archive'], arj: ['archive', 'Архив ARJ', 'file-archive'], lzh: ['archive', 'Архив LZH', 'file-archive'], lha: ['archive', 'Архив LHA', 'file-archive'], cpio: ['archive', 'Архив CPIO', 'file-archive'], wim: ['archive', 'Образ WIM', 'file-archive'], dmg: ['archive', 'Образ DMG', 'file-archive'], vhd: ['archive', 'Образ VHD', 'file-archive'], img: ['archive', 'Образ диска', 'file-archive'], jar: ['archive', 'Архив Java', 'file-archive'], deb: ['archive', 'Пакет DEB', 'file-archive'], rpm: ['archive', 'Пакет RPM', 'file-archive'], chm: ['archive', 'Справка CHM', 'file-archive'], msi: ['archive', 'Пакет MSI', 'file-archive'], epub: ['archive', 'Книга EPUB', 'file-archive'],
  };
  let FOLDER_ICONS = { [P.desktop]: 'folder-desktop', [P.docs]: 'folder-docs', [P.downloads]: 'folder-downloads', [P.pictures]: 'folder-images', [P.music]: 'folder-music', [P.videos]: 'folder-video' };

  function parseLnk(n) { try { return JSON.parse(n.c); } catch { return null; } }

  /** Сведения о типе элемента: kind, label, icon */
  function typeOf(path, node) {
    node = node || get(path);
    if (!node) return { kind: 'other', label: 'Файл', icon: 'file-generic' };
    if (node.t === 'd') return { kind: 'folder', label: 'Папка с файлами', icon: FOLDER_ICONS[realPath(path)] || 'folder' };
    const e = ext(basename(path));
    const t = TYPES[e];
    if (t && t[0] === 'lnk') {
      const l = parseLnk(node);
      let icon = 'file-generic';
      if (l) {
        if (l.app === 'explorer' && l.args?.path) {
          icon = l.args.path === 'thispc://' ? 'thispc' : l.args.path === 'bin://' ? 'recycle' : (FOLDER_ICONS[l.args.path] || 'folder');
        } else icon = typeof Apps !== 'undefined' && Apps.get(l.app) ? Apps.get(l.app).icon : 'file-generic';
      }
      return { kind: 'lnk', label: 'Ярлык', icon, shortcut: true, target: l };
    }
    if (t && t[0] === 'exe') {
      const app = typeof Apps !== 'undefined' && Apps.get(node.c);
      return { kind: 'exe', label: 'Приложение', icon: app ? app.icon : 'file-generic', app: node.c };
    }
    if (t) return { kind: t[0], label: t[1], icon: t[2] };
    return { kind: 'other', label: e ? `Файл «${e.toUpperCase()}»` : 'Файл', icon: 'file-generic' };
  }

  const DRIVE_ICONS = { disk: 'drive-home', webdav: 'drive-net', yandex: 'drive-cloud-y', mailru: 'drive-cloud-m', gdrive: 'drive-cloud-g', cloud: 'drive-cloud', local: 'drive-local' };
  function drives() {
    const virt = Object.entries(DRIVES).filter(([l]) => root[l]).map(([letter, d]) => {
      const used = d.base + nodeSize(root[letter]);
      return { letter, label: d.label, total: d.total, used, free: d.total - used, path: letter };
    });
    const dev = Object.entries(DEV).map(([letter, d]) => ({ letter, label: d.label, total: d.total || 1, used: (d.total || 0) - (d.free || 0), free: d.free || 0, path: letter, device: true, kind: d.kind, icon: DRIVE_ICONS[d.kind], unknown: !d.total }));
    return [...virt, ...dev];
  }

  load();

  return {
    P, USER, on: (e, f) => em.on(e, f),
    norm, split, join, parent, basename, ext, stem, display, realPath, validName, isProtected, isInside,
    get, exists: p => !!get(p), isDir: p => get(p)?.t === 'd', list, mkdir, mkdirp, write, read, rename,
    remove, removePermanent, restore, purge, emptyBin, bin: () => bin, binItem: id => bin.find(b => b.id === id),
    copy, move, unique, size: p => nodeSize(get(p)), nodeSize, countItems, walk, search, typeOf, parseLnk, drives,
    freeze() { frozen = true; },
    isDevice: isDev, toNative, fromNative, devices: () => DEV,
    /** Диски подключены или отключены (облака, папки компьютера): перечитать список */
    remount() {
      for (const k of Object.keys(DEV)) delete DEV[k];
      initDev();
      devInvalidateAll();
      em.emit('change', { device: true, drives: true });
    },
    refreshDevice() { devInvalidateAll(); if (Object.keys(DEV).length && FX.tryCall('hasAccess')) ensureDevFolders(); em.emit('change', { device: true }); },
    /** Миниатюра изображения/видео для значков */
    thumb(path, node, size = 128) {
      node = node || get(path);
      if (node?.dev) return FX.thumb(node.dev, size);
      return node?.c || '';
    },
    /** URL файла для <img>/<audio>/<video>/fetch (data:URL для виртуального диска) */
    url(path) {
      const n = get(path);
      if (!n) return '';
      if (n.dev) return FX.url(n.dev);
      return n.c;
    },
    reset() { root = defaultTree(); bin = []; changed({}); },
  };
})();
