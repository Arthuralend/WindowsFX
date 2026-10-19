/* Рабочий стол: обои, значки, выделение, перетаскивание, контекстное меню */
'use strict';

const Desktop = (() => {
  const svgURL = s => `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}")`;
  const mountainsSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2a5e"/><stop offset=".5" stop-color="#6a4c93"/><stop offset=".8" stop-color="#ff8c6b"/><stop offset="1" stop-color="#ffc38b"/></linearGradient><linearGradient id="m1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a3878"/><stop offset="1" stop-color="#2b2150"/></linearGradient><linearGradient id="m2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2150"/><stop offset="1" stop-color="#161233"/></linearGradient></defs><rect width="1600" height="900" fill="url(#s)"/><circle cx="1100" cy="560" r="110" fill="#ffd9a0" opacity=".85"/><path d="M0 560 L220 380 L380 500 L600 300 L820 520 L1000 410 L1250 560 L1420 450 L1600 540 L1600 900 L0 900Z" fill="url(#m1)" opacity=".85"/><path d="M0 680 L180 560 L420 690 L640 540 L900 700 L1120 590 L1380 700 L1600 620 L1600 900 L0 900Z" fill="url(#m2)"/><path d="M0 800 L300 720 L560 800 L820 740 L1100 810 L1380 750 L1600 790 L1600 900 L0 900Z" fill="#0c0a1f"/></svg>`;
  const wavesSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0fd1ff"/><stop offset=".5" stop-color="#2a5bff"/><stop offset="1" stop-color="#7a2bff"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/>${[0, 1, 2, 3, 4, 5, 6].map(i => `<path d="M0 ${330 + i * 85} C300 ${250 + i * 85} 500 ${420 + i * 85} 800 ${330 + i * 85} S1300 ${250 + i * 85} 1600 ${330 + i * 85} L1600 900 L0 900Z" fill="#fff" opacity="${0.04 + i * 0.025}"/>`).join('')}</svg>`;
  const stars = Array.from({ length: 40 }, (_, i) => `radial-gradient(${i % 4 ? 1 : 1.6}px ${i % 4 ? 1 : 1.6}px at ${(i * 37.3) % 100}% ${(i * 61.7) % 100}%, rgba(255,255,255,${0.5 + (i % 5) / 10}), transparent)`).join(',');

  const fxSVG = (light) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1">${light ? '<stop offset="0" stop-color="#eef2ff"/><stop offset=".55" stop-color="#e4e3ff"/><stop offset="1" stop-color="#f6e6ff"/>' : '<stop offset="0" stop-color="#0b1230"/><stop offset=".55" stop-color="#1e1650"/><stop offset="1" stop-color="#3a1663"/>'}</linearGradient><radialGradient id="c" cx=".12" cy=".9" r=".7"><stop offset="0" stop-color="#22d3ee" stop-opacity="${light ? '.35' : '.45'}"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></radialGradient><radialGradient id="m" cx=".9" cy=".08" r=".65"><stop offset="0" stop-color="#d946ef" stop-opacity="${light ? '.3' : '.45'}"/><stop offset="1" stop-color="#d946ef" stop-opacity="0"/></radialGradient><radialGradient id="h" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#7c6cff" stop-opacity="${light ? '.35' : '.5'}"/><stop offset="1" stop-color="#7c6cff" stop-opacity="0"/></radialGradient><linearGradient id="sa" gradientUnits="userSpaceOnUse" x1="292" y1="287" x2="548" y2="766"><stop offset="0" stop-color="#5eead4"/><stop offset=".5" stop-color="#22d3ee"/><stop offset="1" stop-color="#2563eb"/></linearGradient><linearGradient id="sb" gradientUnits="userSpaceOnUse" x1="486" y1="232" x2="734" y2="770"><stop offset="0" stop-color="#818cf8"/><stop offset=".55" stop-color="#8b5cf6"/><stop offset="1" stop-color="#d946ef"/></linearGradient><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="240" x2="0" y2="770"><stop offset="0" stop-color="#fff" stop-opacity=".4"/><stop offset=".5" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#b)"/><rect width="1600" height="1000" fill="url(#c)"/><rect width="1600" height="1000" fill="url(#m)"/><circle cx="800" cy="500" r="420" fill="url(#h)"/><g transform="translate(800 500) scale(.62) translate(-589 -500)" opacity="${light ? '.8' : '.92'}"><path d="M292 312L456 287 548 766 292 729Z" fill="url(#sa)"/><path d="M486 270L734 232 734 770 574 746Z" fill="url(#sb)"/><path d="M292 312L456 287 548 766 292 729ZM486 270L734 232 734 770 574 746Z" fill="url(#g)"/><path d="M471 250L566 800" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".85"/><path d="M808 136C816 196 826 206 886 214 826 222 816 232 808 292 800 232 790 222 730 214 790 206 800 196 808 136Z" fill="#fff"/></g>${Array.from({ length: 60 }, (_, i) => `<circle cx="${(i * 263) % 1600}" cy="${(i * 151) % 1000}" r="${(i % 3) * 0.7 + 0.7}" fill="#fff" opacity="${light ? 0.25 : 0.15 + (i % 5) / 12}"/>`).join('')}</svg>`;
  const WALLPAPERS = {
    fx: { name: 'WindowsFX', dark: svgURL(fxSVG(false)), light: svgURL(fxSVG(true)) },
    bloom: {
      name: 'Цветение',
      dark: 'radial-gradient(ellipse 30% 48% at 42% 60%, #2f6bff 0%, rgba(47,107,255,0) 70%), radial-gradient(ellipse 30% 48% at 58% 60%, #00c6ff 0%, rgba(0,198,255,0) 70%), radial-gradient(ellipse 24% 40% at 50% 46%, #8a5cff 0%, rgba(138,92,255,0) 72%), radial-gradient(ellipse 60% 30% at 50% 84%, rgba(40,90,255,.75), transparent 70%), linear-gradient(180deg, #040920 0%, #091842 55%, #0c2766 100%)',
      light: 'radial-gradient(ellipse 30% 48% at 42% 60%, #6f9dff 0%, rgba(111,157,255,0) 70%), radial-gradient(ellipse 30% 48% at 58% 60%, #5fd8ff 0%, rgba(95,216,255,0) 70%), radial-gradient(ellipse 24% 40% at 50% 46%, #b49bff 0%, rgba(180,155,255,0) 72%), radial-gradient(ellipse 60% 30% at 50% 84%, rgba(90,140,255,.6), transparent 70%), linear-gradient(180deg, #eef3ff 0%, #d6e2ff 60%, #bfd2ff 100%)',
    },
    aurora: { name: 'Сияние', animated: true, css: 'radial-gradient(ellipse at 30% 20%, rgba(60,255,176,.35), transparent 50%), radial-gradient(ellipse at 70% 30%, rgba(138,92,255,.4), transparent 55%), linear-gradient(120deg, #07102a, #0f2f5c 25%, #0b5e66 45%, #3a1f6e 70%, #07102a)' },
    sunset: { name: 'Закат', css: 'radial-gradient(circle at 68% 66%, #ffe2b0 0, #ffb07a 9%, rgba(255,140,100,0) 32%), linear-gradient(180deg, #24124d 0%, #7b2d7a 42%, #e8566b 72%, #ffb36b 100%)' },
    ocean: { name: 'Океан', css: 'radial-gradient(ellipse at 20% 0%, rgba(79,227,255,.35), transparent 50%), radial-gradient(ellipse at 80% 100%, rgba(42,59,255,.55), transparent 55%), linear-gradient(160deg, #031d33, #0a4d7a 50%, #0a86ad)' },
    nebula: { name: 'Туманность', css: stars + ', radial-gradient(ellipse at 30% 40%, rgba(255,80,180,.42), transparent 50%), radial-gradient(ellipse at 72% 62%, rgba(80,120,255,.5), transparent 55%), radial-gradient(ellipse at 50% 100%, rgba(0,200,255,.25), transparent 60%), #06071a' },
    mountains: { name: 'Горы', css: svgURL(mountainsSVG) },
    waves: { name: 'Волны', css: svgURL(wavesSVG) },
    spectrum: { name: 'Спектр', css: 'radial-gradient(circle at 60% 45%, transparent 0, rgba(0,0,0,.6) 80%), conic-gradient(from 210deg at 60% 45%, #ff5f6d, #ffc371, #47cf73, #2fb3ff, #6b5cff, #ff5fb0, #ff5f6d)' },
    graphite: { name: 'Графит', css: 'radial-gradient(circle at 30% 20%, #3b404d 0, #1a1c22 65%, #111216 100%)' },
    mint: { name: 'Пастель', css: 'radial-gradient(ellipse at 15% 85%, rgba(255,214,240,.9), transparent 50%), radial-gradient(ellipse at 85% 15%, rgba(190,215,255,.9), transparent 55%), linear-gradient(135deg, #d5fbe9, #cfe0ff 55%, #f1dcff)' },
  };

  function wallpaperCSS(id = Store.get('wallpaper')) {
    if (id === 'custom' && Store.get('customWallpaper')) return `url("${Store.get('customWallpaper')}")`;
    const wp = WALLPAPERS[id] || WALLPAPERS.fx;
    if (wp.dark) return document.documentElement.dataset.theme === 'light' ? wp.light : wp.dark;
    return wp.css;
  }

  function applyWallpaper() {
    const w = document.getElementById('wallpaper');
    const id = Store.get('wallpaper');
    w.style.background = wallpaperCSS();
    w.style.backgroundSize = 'cover';
    w.style.backgroundPosition = 'center';
    w.classList.toggle('animated', !!WALLPAPERS[id]?.animated && Store.get('animations'));
    if (WALLPAPERS[id]?.animated) w.style.backgroundSize = '';
    const ls = document.querySelector('#lockscreen');
    if (ls) ls.style.background = wallpaperCSS();
  }

  // ---------------- Значки ----------------
  const SIZES = { small: { w: 76, h: 76, i: 32 }, medium: { w: 88, h: 96, i: 46 }, large: { w: 108, h: 122, i: 64 } };
  const PAD = 8;
  const BIN = '::bin';
  let selected = new Set();
  let items = [];
  const root = () => document.getElementById('desktop');

  function grid() {
    const s = SIZES[Store.get('desktopIconSize')] || SIZES.medium;
    const r = root().getBoundingClientRect();
    return { ...s, rows: Math.max(1, Math.floor((r.height - PAD * 2) / s.h)), cols: Math.max(1, Math.floor((r.width - PAD * 2) / s.w)) };
  }

  // Системные значки всегда первые, как в Windows: «Этот компьютер», затем «Корзина»
  const SYSTEM = ['Этот компьютер.lnk', BIN];
  // Порядок стандартных ярлыков без сортировки; остальные файлы идут следом по времени создания
  const DEFAULT_ORDER = ['Документы.lnk', 'Браузер.lnk', 'Параметры.lnk', 'Терминал.lnk', 'Paint.lnk', 'Сапёр.lnk', 'Ассистент.lnk', 'DOOM.lnk', 'Прочти меня.txt'];

  function collect() {
    const list = [{ key: BIN, name: 'Корзина', special: 'bin' }];
    try {
      FS.list(FS.P.desktop).forEach(it => list.push({ key: it.name, name: it.name, path: it.path, node: it.node }));
    } catch {}
    const sys = SYSTEM.map(k => list.find(it => it.key === k)).filter(Boolean);
    const rest = list.filter(it => !SYSTEM.includes(it.key));
    const sort = Store.get('desktopSort');
    if (sort && sort !== 'none') {
      rest.sort((a, b) => {
        if (sort === 'type') return FS.typeOf(a.path, a.node).label.localeCompare(FS.typeOf(b.path, b.node).label, 'ru') || a.name.localeCompare(b.name, 'ru');
        if (sort === 'date') return b.node.mt - a.node.mt;
        if (sort === 'size') return FS.nodeSize(b.node) - FS.nodeSize(a.node);
        return a.name.localeCompare(b.name, 'ru', { numeric: true });
      });
    } else {
      const rank = it => { const i = DEFAULT_ORDER.indexOf(it.key); return i < 0 ? DEFAULT_ORDER.length : i; };
      rest.sort((a, b) => rank(a) - rank(b) || (a.node.ct || 0) - (b.node.ct || 0) || a.name.localeCompare(b.name, 'ru', { numeric: true }));
    }
    return [...sys, ...rest];
  }

  function layout(list) {
    const g = grid();
    const pos = { ...Store.get('iconPositions') };
    const occ = new Set();
    const out = new Map();
    let dirty = false;
    list.forEach(it => {
      const p = pos[it.key];
      if (p && p.c < g.cols && p.r < g.rows && !occ.has(p.c + ',' + p.r)) { out.set(it.key, p); occ.add(p.c + ',' + p.r); }
    });
    let c = 0, r = 0;
    list.forEach(it => {
      if (out.has(it.key)) return;
      while (occ.has(c + ',' + r)) { r++; if (r >= g.rows) { r = 0; c++; } }
      out.set(it.key, { c, r });
      occ.add(c + ',' + r);
    });
    // удаляем позиции несуществующих элементов
    Object.keys(pos).forEach(k => { if (!list.some(it => it.key === k)) { delete pos[k]; dirty = true; } });
    if (dirty) Store.set('iconPositions', pos);
    return out;
  }

  function iconHTML(it, size) {
    if (it.special === 'bin') return Icons.get(FS.bin().length ? 'recycle-full' : 'recycle', size);
    const t = FS.typeOf(it.path, it.node);
    if (t.kind === 'image' && it.node.c) return `<img class="icon dthumb" src="${esc(it.node.c)}" style="width:${size}px;height:${size}px;object-fit:cover;border-radius:4px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)" draggable="false">`;
    return Icons.get(t.icon, size, { shortcut: t.shortcut });
  }

  function render() {
    const d = root();
    items = collect();
    const g = grid();
    const pos = layout(items);
    d.innerHTML = '';
    d.style.setProperty('--di-w', (g.w - 6) + 'px');
    if (!Store.get('desktopIcons')) return;
    items.forEach(it => {
      const p = pos.get(it.key);
      const label = it.special ? it.name : FileOps.label(it.name, it.node);
      const el = h(`<div class="dicon" data-key="${esc(it.key)}" draggable="true" title="${esc(label)}">${iconHTML(it, g.i)}<div class="dlabel">${esc(label)}</div></div>`);
      el.style.left = (PAD + p.c * g.w) + 'px';
      el.style.top = (PAD + p.r * g.h) + 'px';
      if (selected.has(it.key)) el.classList.add('sel');
      if (it.path && FileOps.isCut(it.path)) el.classList.add('cut');
      it.el = el;
      d.append(el);
    });
    selected = new Set([...selected].filter(k => items.some(i => i.key === k)));
  }

  const byKey = k => items.find(i => i.key === k);
  const selPaths = () => [...selected].map(byKey).filter(i => i && i.path).map(i => i.path);

  function setSel(keys) {
    selected = new Set(keys);
    items.forEach(it => it.el?.classList.toggle('sel', selected.has(it.key)));
  }

  function openItem(it) {
    if (it.special === 'bin') Apps.launch('explorer', { path: 'bin://' });
    else FileOps.open(it.path);
  }

  function startRename(key) {
    const it = byKey(key);
    if (!it || it.special || !it.el) return;
    if (FS.isProtected(it.path)) return;
    setSel([key]);
    const lab = $('.dlabel', it.el);
    const ta = h('<textarea class="rename-input" rows="1" spellcheck="false"></textarea>');
    ta.value = it.name;
    lab.replaceWith(ta);
    it.el.draggable = false;
    const fit = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
    fit();
    ta.focus();
    const dot = it.name.lastIndexOf('.');
    ta.setSelectionRange(0, dot > 0 && it.node.t === 'f' ? dot : it.name.length);
    let done = false;
    const commit = async (ok) => {
      if (done) return; done = true;
      const v = ta.value.trim();
      if (ok && v && v !== it.name) {
        const np = await FileOps.rename(it.path, v);
        if (np) {
          Store.update('iconPositions', p => { if (p[it.name]) { p[FS.basename(np)] = p[it.name]; delete p[it.name]; } });
          selected = new Set([FS.basename(np)]);
        }
      }
      render();
      root().focus();
    };
    ta.addEventListener('input', fit);
    ta.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); commit(true); }
      if (e.key === 'Escape') { e.preventDefault(); commit(false); }
    });
    ta.addEventListener('blur', () => commit(true));
    ta.addEventListener('pointerdown', e => e.stopPropagation());
  }

  function renameNew(path) {
    if (!path) return;
    const name = FS.basename(path);
    setTimeout(() => startRename(name), 30);
  }

  function cellAt(x, y) {
    const g = grid();
    const r = root().getBoundingClientRect();
    return { c: clamp(Math.floor((x - r.left - PAD) / g.w), 0, g.cols - 1), r: clamp(Math.floor((y - r.top - PAD) / g.h), 0, g.rows - 1) };
  }

  function placeAt(keys, cell, anchorKey) {
    const g = grid();
    const pos = Object.fromEntries(layout(collect()));
    const anchor = pos[anchorKey] || cell;
    const dc = cell.c - anchor.c, dr = cell.r - anchor.r;
    const moving = new Set(keys);
    const occ = new Set(Object.entries(pos).filter(([k]) => !moving.has(k)).map(([, p]) => p.c + ',' + p.r));
    keys.forEach(k => {
      const p = pos[k] || cell;
      let c = clamp(p.c + (anchorKey ? dc : 0), 0, g.cols - 1);
      let r = clamp(p.r + (anchorKey ? dr : 0), 0, g.rows - 1);
      if (!anchorKey) { c = cell.c; r = cell.r; }
      let guard = 0;
      while (occ.has(c + ',' + r) && guard++ < 5000) { r++; if (r >= g.rows) { r = 0; c = (c + 1) % g.cols; } }
      pos[k] = { c, r };
      occ.add(c + ',' + r);
    });
    Store.set('iconPositions', pos);
    Store.set('desktopSort', 'none');
  }

  // ---------------- Контекстные меню ----------------
  function bgMenu(x, y) {
    const size = Store.get('desktopIconSize');
    const sort = Store.get('desktopSort');
    const setSort = s => { Store.set('desktopSort', s); Store.set('iconPositions', {}); render(); };
    UI.menu(x, y, [
      { label: 'Вид', icon: 'grid', items: [
        { label: 'Крупные значки', checked: size === 'large', action: () => { Store.set('desktopIconSize', 'large'); render(); } },
        { label: 'Обычные значки', checked: size === 'medium', action: () => { Store.set('desktopIconSize', 'medium'); render(); } },
        { label: 'Мелкие значки', checked: size === 'small', action: () => { Store.set('desktopIconSize', 'small'); render(); } },
        { sep: true },
        { label: 'Упорядочить значки', action: () => { Store.set('iconPositions', {}); render(); } },
        { label: 'Отображать значки рабочего стола', checked: Store.get('desktopIcons'), action: () => { Store.set('desktopIcons', !Store.get('desktopIcons')); render(); } },
      ] },
      { label: 'Сортировка', icon: 'sort', items: [
        { label: 'Имя', checked: sort === 'name', action: () => setSort('name') },
        { label: 'Размер', checked: sort === 'size', action: () => setSort('size') },
        { label: 'Тип элемента', checked: sort === 'type', action: () => setSort('type') },
        { label: 'Дата изменения', checked: sort === 'date', action: () => setSort('date') },
      ] },
      { label: 'Обновить', icon: 'refresh', action: () => { root().style.opacity = .3; setTimeout(() => { render(); root().style.opacity = ''; }, 120); } },
      { sep: true },
      { label: 'Вставить', icon: 'paste', shortcut: 'Ctrl+V', disabled: !FileOps.canPaste(), action: () => pasteHere(x, y) },
      { label: 'Создать', icon: 'plus', items: FileOps.createItems(FS.P.desktop, p => { placeAt([FS.basename(p)], cellAt(x, y)); render(); renameNew(p); }) },
      { sep: true },
      { label: 'Добавить виджет', icon: 'apps', items: [
        { label: 'Напоминания — Сегодня', icon: 'app:reminders', action: () => DeskWidgets.add('reminders', { list: 'today' }) },
        { label: 'Напоминания — Все', icon: 'app:reminders', action: () => DeskWidgets.add('reminders', { list: 'all' }) },
        { label: 'Дела — Сегодня', icon: 'app:things', action: () => DeskWidgets.add('things', { list: 'today' }) },
        { label: 'Дела — Входящие', icon: 'app:things', action: () => DeskWidgets.add('things', { list: 'inbox' }) },
      ] },
      { label: 'Загрузить файлы с компьютера…', icon: 'upload', action: () => FileOps.uploadInto(FS.P.desktop) },
      { label: 'Открыть в терминале', icon: 'terminal', action: () => Apps.launch('terminal', { cwd: FS.P.desktop }) },
      { sep: true },
      { label: 'Параметры экрана', icon: 'display', action: () => Apps.launch('settings', { page: 'display' }) },
      { label: 'Персонализация', icon: 'palette', action: () => Apps.launch('settings', { page: 'personalization' }) },
    ]);
  }

  function pasteHere(x, y) {
    const out = FileOps.paste(FS.P.desktop);
    if (out.length && x !== undefined) { placeAt(out.map(FS.basename), cellAt(x, y)); render(); }
  }

  function itemMenu(it, x, y) {
    if (it.special === 'bin') {
      UI.menu(x, y, [
        { label: 'Открыть', icon: 'folder-open', action: () => openItem(it) },
        { label: 'Очистить корзину', icon: 'trash', disabled: !FS.bin().length, action: emptyBin },
        { sep: true },
        { label: 'Свойства', icon: 'info', action: () => UI.alert('Корзина', `Элементов в корзине: ${FS.bin().length}\nЗанимаемое место: ${fmtBytes(FS.bin().reduce((s, b) => s + FS.nodeSize(b.node), 0))}`) },
      ]);
      return;
    }
    const paths = selPaths();
    UI.menu(x, y, FileOps.itemMenu(paths.length ? paths : [it.path], { dir: FS.P.desktop, rename: p => startRename(FS.basename(p)) }));
  }

  async function emptyBin() {
    const n = FS.bin().length;
    if (!n) return;
    if (await UI.confirm('Удаление нескольких элементов', `Вы действительно хотите безвозвратно удалить эти элементы (${n})?`, { danger: true })) {
      FS.emptyBin();
      Sound.play('trash');
    }
  }

  // ---------------- События ----------------
  function bind() {
    const d = root();
    let dragKey = null;

    d.addEventListener('pointerdown', e => {
      Shell.closeAll();
      const ic = e.target.closest('.dicon');
      if (ic) {
        const k = ic.dataset.key;
        if (e.ctrlKey) {
          const s = new Set(selected); s.has(k) ? s.delete(k) : s.add(k); setSel(s);
        } else if (e.shiftKey && selected.size) {
          const keys = items.map(i => i.key);
          const last = [...selected].pop();
          const [a, b] = [keys.indexOf(last), keys.indexOf(k)].sort((x, y) => x - y);
          setSel(keys.slice(a, b + 1));
        } else if (!selected.has(k)) setSel([k]);
        WM.blurAll();
        setTimeout(() => d.focus({ preventScroll: true }));
        return;
      }
      if (e.target !== d || e.button !== 0) { if (e.target === d) { WM.blurAll(); } return; }
      WM.blurAll();
      d.focus({ preventScroll: true });
      const sx = e.clientX, sy = e.clientY;
      const base = e.ctrlKey ? new Set(selected) : new Set();
      let band = null;
      const mv = ev => {
        if (!band && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
        if (!band) { band = h('<div class="rubber"></div>'); document.body.append(band); }
        const x1 = Math.min(sx, ev.clientX), y1 = Math.min(sy, ev.clientY);
        const x2 = Math.max(sx, ev.clientX), y2 = Math.max(sy, ev.clientY);
        Object.assign(band.style, { left: x1 + 'px', top: y1 + 'px', width: (x2 - x1) + 'px', height: (y2 - y1) + 'px' });
        const s = new Set(base);
        items.forEach(it => {
          if (!it.el) return;
          const r = it.el.getBoundingClientRect();
          if (r.right > x1 && r.left < x2 && r.bottom > y1 && r.top < y2) s.add(it.key);
        });
        setSel(s);
      };
      const up = () => {
        removeEventListener('pointermove', mv);
        removeEventListener('pointerup', up);
        if (band) band.remove(); else setSel(base);
      };
      addEventListener('pointermove', mv);
      addEventListener('pointerup', up);
    });

    d.addEventListener('dblclick', e => {
      const ic = e.target.closest('.dicon');
      if (ic && !e.target.closest('textarea')) { const it = byKey(ic.dataset.key); if (it) openItem(it); }
    });

    d.addEventListener('contextmenu', e => {
      e.preventDefault();
      const ic = e.target.closest('.dicon');
      if (ic) {
        if (!selected.has(ic.dataset.key)) setSel([ic.dataset.key]);
        itemMenu(byKey(ic.dataset.key), e.clientX, e.clientY);
      } else { setSel([]); bgMenu(e.clientX, e.clientY); }
    });

    // Перетаскивание
    d.addEventListener('dragstart', e => {
      const ic = e.target.closest('.dicon');
      if (!ic) return;
      dragKey = ic.dataset.key;
      if (!selected.has(dragKey)) setSel([dragKey]);
      const paths = selPaths();
      DnD.start(e, paths, 'desktop');
      DnD.keys = [...selected];
      setTimeout(() => items.forEach(it => selected.has(it.key) && it.el?.classList.add('dragging-src')));
    });
    d.addEventListener('dragend', () => {
      items.forEach(it => it.el?.classList.remove('dragging-src'));
      dragKey = null;
      DnD.end();
    });
    d.addEventListener('dragover', e => {
      const ic = e.target.closest('.dicon');
      $$('.dicon.drop', d).forEach(x => x !== ic && x.classList.remove('drop'));
      if (!DnD.accepts(e) && !dragKey) return;
      e.preventDefault();
      if (ic && ic.dataset.key !== dragKey && !selected.has(ic.dataset.key)) {
        const it = byKey(ic.dataset.key);
        if (it.special === 'bin' || it.node?.t === 'd') { ic.classList.add('drop'); e.dataTransfer.dropEffect = it.special ? 'move' : (e.ctrlKey ? 'copy' : 'move'); return; }
      }
      e.dataTransfer.dropEffect = DnD.paths && DnD.source !== 'desktop' && !e.ctrlKey ? 'move' : (DnD.paths ? 'move' : 'copy');
    });
    d.addEventListener('dragleave', e => { if (e.target.classList?.contains('dicon')) e.target.classList.remove('drop'); });
    d.addEventListener('drop', async e => {
      e.preventDefault();
      $$('.dicon.drop', d).forEach(x => x.classList.remove('drop'));
      const ic = e.target.closest('.dicon');
      const target = ic ? byKey(ic.dataset.key) : null;
      if (target && !selected.has(target.key) || (target && DnD.source !== 'desktop')) {
        if (target.special === 'bin') {
          if (DnD.paths) { const p = DnD.paths; DnD.end(); await FileOps.remove(p); }
          return;
        }
        if (target.node?.t === 'd') { await DnD.dropInto(target.path, e); return; }
      }
      const cell = cellAt(e.clientX, e.clientY);
      if (DnD.source === 'desktop' && dragKey) {
        placeAt(DnD.keys || [dragKey], cell, dragKey);
        DnD.end();
        render();
        return;
      }
      const out = await DnD.dropInto(FS.P.desktop, e);
      if (out?.length) { placeAt(out.map(FS.basename), cell); render(); }
    });

    // Клавиатура
    d.addEventListener('keydown', e => {
      if (e.target !== d) return;
      const paths = selPaths();
      if (e.key === 'Delete') { if (paths.length) FileOps.remove(paths, e.shiftKey); }
      else if (e.key === 'F2') { if (selected.size === 1) startRename([...selected][0]); }
      else if (e.key === 'Enter') { [...selected].map(byKey).forEach(it => it && openItem(it)); }
      else if (e.ctrlKey && e.code === 'KeyA') { e.preventDefault(); setSel(items.map(i => i.key)); }
      else if (e.ctrlKey && e.code === 'KeyC') { if (paths.length) FileOps.copy(paths); }
      else if (e.ctrlKey && e.code === 'KeyX') { if (paths.length) FileOps.cut(paths); }
      else if (e.ctrlKey && e.code === 'KeyV') { pasteHere(); }
      else if (e.altKey && e.key === 'Enter') { if (paths.length === 1) UI.properties(paths[0]); }
      else return;
      e.preventDefault();
    });

    const rerender = debounce(render, 30);
    FS.on('change', rerender);
    FileOps.on('clip', rerender);
    Store.on('showExtensions', rerender);
    Store.on('desktopIconSize', rerender);
    Store.on('desktopIcons', rerender);
    addEventListener('resize', debounce(render, 150));
  }

  function init() {
    // Однократно перестраиваем значки под новый порядок («Этот компьютер» — первым)
    if (!Persist.get('desktop.layout.v2', false)) {
      Store.set('iconPositions', {});
      Persist.set('desktop.layout.v2', true);
    }
    applyWallpaper();
    ['wallpaper', 'customWallpaper', 'animations'].forEach(k => Store.on(k, applyWallpaper));
    bind();
    render();
  }

  return { init, render, applyWallpaper, wallpaperCSS, WALLPAPERS, emptyBin };
})();
