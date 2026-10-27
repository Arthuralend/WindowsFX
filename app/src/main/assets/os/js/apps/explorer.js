/* Проводник */
'use strict';

Apps.register({
  id: 'explorer', name: 'Проводник', icon: 'explorer', desc: 'Файлы, папки и диски',
  keywords: 'файлы папки диск explorer проводник документы',
  launch: args => openExplorer(args),
});

function openExplorer(args = {}) {
  const SPECIAL = {
    'home://': { name: 'Главная', icon: 'home' },
    'thispc://': { name: 'Этот компьютер', icon: 'thispc' },
    'bin://': { name: 'Корзина', icon: 'recycle' },
  };
  const QUICK = [
    ['Рабочий стол', FS.P.desktop, 'folder-desktop'], ['Загрузки', FS.P.downloads, 'folder-downloads'], ['Документы', FS.P.docs, 'folder-docs'],
    ['Изображения', FS.P.pictures, 'folder-images'], ['Музыка', FS.P.music, 'folder-music'], ['Видео', FS.P.videos, 'folder-video'],
  ];

  let path = args.path || 'home://';
  if (!SPECIAL[path] && !FS.isDir(path)) path = 'home://';
  else if (!SPECIAL[path]) path = FS.realPath(path);
  const hist = [path];
  let hIndex = 0;
  let sel = new Set();
  let anchor = null;
  let items = [];
  let query = '';
  let sort = { key: 'name', dir: 1 };
  let preview = Persist.get('explorer.preview', false);

  const win = WM.open({ app: 'explorer', title: 'Проводник', width: 960, height: 600, minWidth: 460, minHeight: 300 });
  const b = win.body;
  b.classList.add('ex');
  b.innerHTML = `
    <div class="ex-nav">
      <button class="icon-btn ex-back" title="Назад (Alt+←)">${Icons.ui('back', 16)}</button>
      <button class="icon-btn ex-fwd" title="Вперёд (Alt+→)">${Icons.ui('forward', 16)}</button>
      <button class="icon-btn ex-up" title="Вверх (Alt+↑)">${Icons.ui('up', 16)}</button>
      <button class="icon-btn ex-refresh" title="Обновить (F5)">${Icons.ui('refresh', 16)}</button>
      <div class="ex-addr input"><div class="ex-crumbs"></div><input class="ex-addr-in" spellcheck="false"></div>
      <label class="ex-search input">${Icons.ui('search', 14)}<input placeholder="Поиск" spellcheck="false"></label>
    </div>
    <div class="ex-cmd app-toolbar"></div>
    <div class="ex-main">
      <div class="ex-side"></div>
      <div class="ex-content" tabindex="0"></div>
      <div class="ex-preview hidden"></div>
    </div>
    <div class="statusbar"><span class="ex-count"></span><span class="ex-selinfo"></span><span class="spacer"></span>
      <button class="icon-btn sm ex-v-details" title="Таблица">${Icons.ui('details', 14)}</button>
      <button class="icon-btn sm ex-v-grid" title="Крупные значки">${Icons.ui('grid', 14)}</button>
    </div>`;
  const content = $('.ex-content', b);
  const isReal = () => !SPECIAL[path];
  const view = () => Store.get('explorerView') || 'grid';

  // ---------- Навигация ----------
  function go(p, push = true) {
    if (!SPECIAL[p]) {
      const rp = FS.realPath(p);
      if (!rp || !FS.isDir(rp)) { UI.alert('Проводник', `Не удаётся найти «${FS.display(p)}». Проверьте правильность написания и повторите попытку.`, 'error'); return; }
      p = rp;
    }
    path = p;
    query = '';
    $('.ex-search input', b).value = '';
    sel.clear(); anchor = null;
    if (push) { hist.splice(hIndex + 1); hist.push(p); hIndex = hist.length - 1; }
    render();
    content.focus({ preventScroll: true });
  }
  const back = () => { if (hIndex > 0) { hIndex--; go(hist[hIndex], false); } };
  const fwd = () => { if (hIndex < hist.length - 1) { hIndex++; go(hist[hIndex], false); } };
  const up = () => {
    if (!isReal()) return go('home://');
    const par = FS.parent(path);
    go(par || 'thispc://');
  };

  $('.ex-back', b).onclick = back;
  $('.ex-fwd', b).onclick = fwd;
  $('.ex-up', b).onclick = up;
  $('.ex-refresh', b).onclick = () => { content.style.opacity = .4; setTimeout(() => { content.style.opacity = ''; render(); }, 100); };
  $('.ex-v-details', b).onclick = () => Store.set('explorerView', 'details');
  $('.ex-v-grid', b).onclick = () => Store.set('explorerView', 'grid');

  // Адресная строка
  const addr = $('.ex-addr', b), addrIn = $('.ex-addr-in', b), crumbs = $('.ex-crumbs', b);
  addr.addEventListener('click', e => {
    if (e.target.closest('.crumb')) return;
    addr.classList.add('editing');
    addrIn.value = isReal() ? FS.display(path) : SPECIAL[path].name;
    addrIn.focus(); addrIn.select();
  });
  addrIn.addEventListener('blur', () => addr.classList.remove('editing'));
  addrIn.addEventListener('keydown', e => {
    if (e.key === 'Escape') { addrIn.blur(); content.focus(); }
    if (e.key === 'Enter') {
      const v = addrIn.value.trim();
      const low = v.toLowerCase();
      addrIn.blur();
      if (['этот компьютер', 'thispc', 'компьютер'].includes(low)) return go('thispc://');
      if (['корзина', 'bin'].includes(low)) return go('bin://');
      if (['главная', 'home', ''].includes(low)) return go('home://');
      const node = FS.get(v);
      if (node && node.t === 'f') { FileOps.open(v); return; }
      go(v);
    }
  });

  function renderCrumbs() {
    crumbs.innerHTML = '';
    const add = (label, p, icon) => {
      const c = h(`<span class="crumb">${icon ? Icons.get(icon, 16) : ''}<span>${esc(label)}</span></span>`);
      c.onclick = () => go(p);
      if (crumbs.children.length) crumbs.append(h(`<span class="crumb-sep">${Icons.ui('chevron-right', 10)}</span>`));
      crumbs.append(c);
    };
    if (!isReal()) { add(SPECIAL[path].name, path, SPECIAL[path].icon); return; }
    add('Этот компьютер', 'thispc://', 'thispc');
    const parts = FS.split(path);
    parts.forEach((seg, i) => {
      const p = parts.slice(0, i + 1).join('/');
      add(i === 0 ? `${FS.drives().find(d => d.letter === seg)?.label || 'Диск'} (${seg})` : seg, p);
    });
    crumbs.scrollLeft = crumbs.scrollWidth;
  }

  // Поиск
  $('.ex-search input', b).addEventListener('input', debounce(e => { query = e.target.value.trim(); sel.clear(); render(); }, 200));
  $('.ex-search input', b).addEventListener('keydown', e => { if (e.key === 'Escape') { e.target.value = ''; query = ''; render(); } });

  // ---------- Боковая панель ----------
  function renderSide() {
    const side = $('.ex-side', b);
    side.innerHTML = '';
    const add = (label, p, icon, extra = '') => {
      const it = h(`<div class="ex-side-item ${path === p ? 'on' : ''} ${extra}" data-path="${esc(p)}">${Icons.get(icon, 18)}<span>${esc(label)}</span></div>`);
      it.onclick = () => go(p);
      it.oncontextmenu = e => {
        e.preventDefault(); e.stopPropagation();
        if (p === 'bin://') UI.menu(e.clientX, e.clientY, [{ label: 'Очистить корзину', icon: 'trash', disabled: !FS.bin().length, action: Desktop.emptyBin }]);
        else if (!SPECIAL[p]) UI.menu(e.clientX, e.clientY, [
          { label: 'Открыть в новом окне', icon: 'external', action: () => Apps.launch('explorer', { path: p }) },
          { label: 'Открыть в терминале', icon: 'terminal', action: () => Apps.launch('terminal', { cwd: p }) },
          { label: 'Свойства', icon: 'info', action: () => UI.properties(p) },
        ]);
      };
      // сброс файлов на элементы боковой панели
      it.addEventListener('dragover', e => { if (DnD.accepts(e) && p !== 'home://' && p !== 'thispc://') { e.preventDefault(); it.classList.add('drop'); } });
      it.addEventListener('dragleave', () => it.classList.remove('drop'));
      it.addEventListener('drop', async e => {
        e.preventDefault(); it.classList.remove('drop');
        if (p === 'bin://') { if (DnD.paths) { const ps = DnD.paths; DnD.end(); FileOps.remove(ps); } return; }
        await DnD.dropInto(p, e);
      });
      side.append(it);
    };
    add('Главная', 'home://', 'home');
    side.append(h('<div class="ex-side-sep"></div>'));
    QUICK.forEach(([n, p, ic]) => add(n, p, ic));
    side.append(h('<div class="ex-side-sep"></div>'));
    add('Этот компьютер', 'thispc://', 'thispc');
    FS.drives().forEach(d => add(`${d.label} (${d.letter})`, d.letter, d.letter === 'C:' ? 'drive-win' : d.icon ? d.icon : d.device ? (d.label.startsWith('SD') ? 'drive-sd' : 'drive-phone') : 'drive', 'indent'));
    side.append(h('<div class="ex-side-sep"></div>'));
    add('Корзина', 'bin://', FS.bin().length ? 'recycle-full' : 'recycle');
  }

  // ---------- Командная панель ----------
  function renderCmd() {
    const cmd = $('.ex-cmd', b);
    const selPaths = selectedPaths();
    const has = sel.size > 0;
    const prot = selPaths.some(FS.isProtected);
    if (path === 'bin://') {
      cmd.innerHTML = `
        <button class="tb-text-btn ex-empty" ${FS.bin().length ? '' : 'disabled'}>${Icons.ui('trash', 16)}Очистить корзину</button>
        <button class="tb-text-btn ex-restore-all" ${FS.bin().length ? '' : 'disabled'}>${Icons.ui('restart', 16)}Восстановить все</button>
        <span class="sep"></span>
        <button class="tb-text-btn ex-restore" ${has ? '' : 'disabled'}>${Icons.ui('undo', 16)}Восстановить</button>
        <button class="icon-btn ex-perm" title="Удалить безвозвратно" ${has ? '' : 'disabled'}>${Icons.ui('close', 16)}</button>`;
      $('.ex-empty', cmd).onclick = Desktop.emptyBin;
      $('.ex-restore-all', cmd).onclick = () => { FS.bin().map(x => x.id).forEach(FS.restore); };
      $('.ex-restore', cmd).onclick = () => { [...sel].forEach(FS.restore); sel.clear(); };
      $('.ex-perm', cmd).onclick = permDeleteBin;
      return;
    }
    cmd.innerHTML = `
      <button class="tb-text-btn ex-new" ${isReal() ? '' : 'disabled'}>${Icons.ui('plus', 16)}Создать ${Icons.ui('chevron-down', 10)}</button>
      <span class="sep"></span>
      <button class="icon-btn ex-cut" title="Вырезать (Ctrl+X)" ${has && !prot ? '' : 'disabled'}>${Icons.ui('cut', 16)}</button>
      <button class="icon-btn ex-copy" title="Копировать (Ctrl+C)" ${has ? '' : 'disabled'}>${Icons.ui('copy', 16)}</button>
      <button class="icon-btn ex-paste" title="Вставить (Ctrl+V)" ${isReal() && FileOps.canPaste() ? '' : 'disabled'}>${Icons.ui('paste', 16)}</button>
      <button class="icon-btn ex-rename" title="Переименовать (F2)" ${sel.size === 1 && !prot ? '' : 'disabled'}>${Icons.ui('rename', 16)}</button>
      <button class="icon-btn ex-del" title="Удалить (Del)" ${has && !prot ? '' : 'disabled'}>${Icons.ui('trash', 16)}</button>
      <span class="sep"></span>
      <button class="tb-text-btn ex-sort">${Icons.ui('sort', 16)}Сортировать ${Icons.ui('chevron-down', 10)}</button>
      <button class="tb-text-btn ex-view">${Icons.ui(view() === 'grid' ? 'grid' : view() === 'list' ? 'list' : 'details', 16)}Просмотреть ${Icons.ui('chevron-down', 10)}</button>
      <span class="sep"></span>
      <button class="tb-text-btn ex-upload" ${isReal() ? '' : 'disabled'} title="Загрузить файлы с компьютера">${Icons.ui('upload', 16)}Загрузить</button>
      <button class="icon-btn ex-more" title="Подробнее">${Icons.ui('more', 16)}</button>`;
    const at = el => { const r = el.getBoundingClientRect(); return [r.left, r.bottom + 4]; };
    $('.ex-new', cmd).onclick = e => UI.menu(...at(e.currentTarget), FileOps.createItems(path, p => { render(); select([p]); startRename(p); }));
    $('.ex-cut', cmd).onclick = () => FileOps.cut(selPaths);
    $('.ex-copy', cmd).onclick = () => FileOps.copy(selPaths);
    $('.ex-paste', cmd).onclick = () => paste();
    $('.ex-rename', cmd).onclick = () => startRename(selPaths[0]);
    $('.ex-del', cmd).onclick = () => FileOps.remove(selPaths);
    $('.ex-sort', cmd).onclick = e => UI.menu(...at(e.currentTarget), sortItems());
    $('.ex-view', cmd).onclick = e => UI.menu(...at(e.currentTarget), viewItems());
    $('.ex-upload', cmd).onclick = () => FileOps.uploadInto(path);
    $('.ex-more', cmd).onclick = e => UI.menu(...at(e.currentTarget), [
      { label: 'Выделить все', icon: 'check', shortcut: 'Ctrl+A', action: () => select(items.map(i => i.id)) },
      { label: 'Снять выделение', action: () => select([]) },
      { label: 'Обратить выделение', action: () => select(items.map(i => i.id).filter(id => !sel.has(id))) },
      { sep: true },
      { label: 'Открыть в терминале', icon: 'terminal', disabled: !isReal(), action: () => Apps.launch('terminal', { cwd: path }) },
      { label: 'Свойства', icon: 'info', disabled: !isReal() && !has, action: () => UI.properties(selPaths[0] || path) },
    ]);
  }

  function sortItems() {
    const s = (key, label) => ({ label, checked: sort.key === key, action: () => { sort.key = key; render(); } });
    return [s('name', 'Имя'), s('date', 'Дата изменения'), s('type', 'Тип'), s('size', 'Размер'), { sep: true },
      { label: 'По возрастанию', checked: sort.dir === 1, action: () => { sort.dir = 1; render(); } },
      { label: 'По убыванию', checked: sort.dir === -1, action: () => { sort.dir = -1; render(); } }];
  }
  function viewItems() {
    const v = (k, label, icon) => ({ label, icon, checked: view() === k, action: () => Store.set('explorerView', k) });
    return [v('grid', 'Крупные значки', 'grid'), v('list', 'Список', 'list'), v('details', 'Таблица', 'details'), { sep: true },
      { label: 'Область просмотра', checked: preview, action: () => { preview = !preview; Persist.set('explorer.preview', preview); renderPreview(); } },
      { label: 'Расширения имён файлов', checked: Store.get('showExtensions'), action: () => Store.set('showExtensions', !Store.get('showExtensions')) }];
  }

  // ---------- Данные ----------
  function collect() {
    if (path === 'bin://') {
      return FS.bin().map(x => {
        const t = FS.typeOf(x.name, x.node);
        return { id: x.id, name: x.name, label: FileOps.label(x.name, x.node), icon: t.icon, shortcut: t.shortcut, kind: t.kind, isDir: x.node.t === 'd', node: x.node, date: x.dt, typeLabel: t.label, size: FS.nodeSize(x.node), orig: x.orig, bin: true };
      });
    }
    let list;
    if (query) {
      const base = isReal() ? path : FS.P.home;
      list = FS.search(base, query, 300);
      if (!isReal()) [FS.P.docs, FS.P.downloads, FS.P.pictures].filter(p => FS.isDevice(p)).forEach(p => list.push(...FS.search(p, query, 80)));
    } else list = FS.list(path);
    const out = list.map(it => {
      const t = FS.typeOf(it.path, it.node);
      return { id: it.path, path: it.path, name: it.name, label: FileOps.label(it.name, it.node), icon: t.icon, shortcut: t.shortcut, kind: t.kind, isDir: it.isDir, node: it.node, date: it.node.mt, typeLabel: t.label, size: it.isDir ? null : FS.nodeSize(it.node), folder: query ? FS.display(FS.parent(it.path)) : null };
    });
    const k = sort.key, d = sort.dir;
    out.sort((a, bb) => {
      if (a.isDir !== bb.isDir) return a.isDir ? -1 : 1;
      let r = 0;
      if (k === 'date') r = a.date - bb.date;
      else if (k === 'size') r = (a.size || 0) - (bb.size || 0);
      else if (k === 'type') r = a.typeLabel.localeCompare(bb.typeLabel, 'ru');
      if (!r) r = a.name.localeCompare(bb.name, 'ru', { numeric: true });
      return r * d;
    });
    return out;
  }

  function selectedPaths() { return path === 'bin://' ? [] : [...sel].filter(p => FS.get(p)); }

  // ---------- Отрисовка ----------
  function render() {
    const title = isReal() ? (FS.split(path).length === 1 ? `${FS.drives().find(d => d.letter === path)?.label} (${path})` : FS.basename(path)) : SPECIAL[path].name;
    win.setTitle(query ? `Результаты поиска в «${title}»` : title);
    win.setIcon(isReal() ? FS.typeOf(path).icon : SPECIAL[path].icon);
    $('.ex-back', b).disabled = hIndex === 0;
    $('.ex-fwd', b).disabled = hIndex >= hist.length - 1;
    $('.ex-up', b).disabled = path === 'home://';
    $('.ex-search input', b).placeholder = 'Поиск: ' + title;
    renderCrumbs();
    renderSide();
    content.innerHTML = '';
    content.className = 'ex-content';
    if (path === 'home://' && !query) renderHome();
    else if (path === 'thispc://' && !query) renderPC();
    else renderItems();
    renderCmd();
    updateStatus();
    renderPreview();
  }

  function itemIcon(it, size) {
    if ((it.kind === 'image' || (it.kind === 'video' && it.node?.dev)) && size >= 40) { const src = FS.thumb(it.path, it.node, size * 2); if (src) return `<img class="ex-thumb" src="${esc(src)}" style="width:${size}px;height:${size}px;object-fit:cover" draggable="false" loading="lazy">`; }
    return Icons.get(it.icon, size, { shortcut: it.shortcut });
  }

  function renderItems() {
    try { items = collect(); }
    catch (e) {
      items = [];
      if (e.code === 'EACCES') {
        content.innerHTML = `<div class="fx-access">${Icons.get('drive-phone', 64)}<h2>Нет доступа к памяти устройства</h2><p>Разрешите WindowsFX «Доступ ко всем файлам», чтобы видеть и изменять файлы на планшете.</p><button class="btn primary">Разрешить доступ</button></div>`;
        $('.btn', content).onclick = () => FX.call('requestAccess');
      } else content.innerHTML = `<div class="empty-state">${Icons.ui('alert', 40)}<div>${esc(e.message)}</div></div>`;
      return;
    }
    const v = path === 'bin://' || query ? (view() === 'grid' ? 'details' : view()) : view();
    content.classList.add('v-' + v);
    if (!items.length) {
      content.innerHTML = `<div class="empty-state">${query ? Icons.ui('search', 40) + '<div>Ничего не найдено по запросу «' + esc(query) + '».</div>' : path === 'bin://' ? Icons.get('recycle', 56) + '<div>Корзина пуста</div>' : '<div>Эта папка пуста.</div>'}</div>`;
      return;
    }
    if (v === 'details') {
      const cols = path === 'bin://' ? [['name', 'Имя'], ['orig', 'Исходное расположение'], ['date', 'Дата удаления'], ['size', 'Размер']]
        : query ? [['name', 'Имя'], ['folder', 'Папка'], ['date', 'Дата изменения'], ['size', 'Размер']]
        : [['name', 'Имя'], ['date', 'Дата изменения'], ['type', 'Тип'], ['size', 'Размер']];
      const head = h(`<div class="ex-dhead">${cols.map(([k, l]) => `<div data-k="${k}" class="${sort.key === k ? 'on' : ''}">${l}${sort.key === k ? Icons.ui(sort.dir === 1 ? 'chevron-up' : 'chevron-down', 10) : ''}</div>`).join('')}</div>`);
      $$('div', head).forEach(c => c.onclick = () => { const k = c.dataset.k; if (['orig', 'folder'].includes(k)) return; if (sort.key === k) sort.dir *= -1; else { sort.key = k; sort.dir = 1; } render(); });
      content.append(head);
    }
    const box = h(`<div class="ex-items"></div>`);
    items.forEach(it => {
      let el;
      if (v === 'grid') el = h(`<div class="ex-item" draggable="true">${itemIcon(it, 48)}<div class="ex-label">${esc(it.label)}</div></div>`);
      else if (v === 'list') el = h(`<div class="ex-item" draggable="true">${Icons.get(it.icon, 18, { shortcut: it.shortcut })}<div class="ex-label">${esc(it.label)}</div></div>`);
      else {
        const c3 = path === 'bin://' ? FS.display(it.orig) : query ? it.folder : it.typeLabel;
        const c2 = fmtDateTime(it.date);
        el = h(`<div class="ex-item ex-row" draggable="true"><div class="c-name">${Icons.get(it.icon, 18, { shortcut: it.shortcut })}<span class="ex-label">${esc(it.label)}</span></div>${path === 'bin://' || query ? `<div>${esc(c3)}</div><div>${c2}</div>` : `<div>${c2}</div><div>${esc(c3)}</div>`}<div class="r">${it.size === null ? '' : fmtBytes(it.size)}</div></div>`);
      }
      el.dataset.id = it.id;
      el.title = `${it.name}\nТип: ${it.typeLabel}${it.size !== null ? '\nРазмер: ' + fmtBytes(it.size) : ''}\nИзменён: ${fmtDateTime(it.date)}`;
      if (sel.has(it.id)) el.classList.add('sel');
      if (it.path && FileOps.isCut(it.path)) el.classList.add('cut');
      it.el = el;
      box.append(el);
    });
    content.append(box);
  }

  function renderHome() {
    items = [];
    content.classList.add('ex-home');
    content.innerHTML = `<div class="ex-sec-title">Быстрый доступ</div><div class="ex-quick"></div><div class="ex-sec-title">Недавние файлы</div><div class="ex-recent"></div>`;
    const q = $('.ex-quick', content);
    QUICK.forEach(([n, p, ic]) => {
      let cnt = 0; try { cnt = FS.list(p).length; } catch {}
      const c = h(`<div class="ex-qcard">${Icons.get(ic, 40)}<div><b>${esc(n)}</b><span>${cnt} ${plural(cnt, 'элемент', 'элемента', 'элементов')}</span></div></div>`);
      c.ondblclick = c.onclick = () => go(p);
      c.addEventListener('dragover', e => { if (DnD.accepts(e)) { e.preventDefault(); c.classList.add('drop'); } });
      c.addEventListener('dragleave', () => c.classList.remove('drop'));
      c.addEventListener('drop', e => { e.preventDefault(); c.classList.remove('drop'); DnD.dropInto(p, e); });
      q.append(c);
    });
    const rec = FileOps.recent();
    const rb = $('.ex-recent', content);
    if (!rec.length) rb.innerHTML = '<div class="muted" style="padding:10px 12px">Открытые недавно файлы появятся здесь.</div>';
    rec.slice(0, 12).forEach(r => {
      const node = FS.get(r.path);
      const t = FS.typeOf(r.path, node);
      const row = h(`<div class="ex-item ex-row ex-recrow">
        <div class="c-name">${Icons.get(t.icon, 18)}<span>${esc(FS.basename(r.path))}</span></div><div>${esc(timeAgo(r.ts))}</div><div class="ellip">${esc(FS.display(FS.parent(r.path)))}</div></div>`);
      row.ondblclick = () => FileOps.open(r.path);
      row.oncontextmenu = e => {
        e.preventDefault(); e.stopPropagation();
        UI.menu(e.clientX, e.clientY, [
          { label: 'Открыть', icon: 'folder-open', action: () => FileOps.open(r.path) },
          { label: 'Открыть расположение файла', icon: 'folder', action: () => go(FS.parent(r.path)) },
          { label: 'Удалить из списка «Недавние»', icon: 'close', action: () => { Persist.set('recent', Persist.get('recent', []).filter(x => x.path !== r.path)); render(); } },
        ]);
      };
      rb.append(row);
    });
  }

  function renderPC() {
    items = [];
    content.classList.add('ex-home');
    content.innerHTML = `<div class="ex-sec-title">Папки</div><div class="ex-quick"></div><div class="ex-sec-title">Устройства и диски</div><div class="ex-drives"></div>`;
    const q = $('.ex-quick', content);
    QUICK.forEach(([n, p, ic]) => {
      const c = h(`<div class="ex-qcard">${Icons.get(ic, 40)}<div><b>${esc(n)}</b><span>${esc(FS.display(FS.parent(p)))}</span></div></div>`);
      c.onclick = () => go(p);
      q.append(c);
    });
    const dbox = $('.ex-drives', content);
    FS.drives().forEach(d => {
      const pct = d.used / d.total * 100;
      const c = h(`<div class="ex-drive">${Icons.get(d.letter === 'C:' ? 'drive-win' : d.icon ? d.icon : d.device ? (d.label.startsWith('SD') ? 'drive-sd' : 'drive-phone') : 'drive', 48)}<div class="dinfo"><b>${esc(d.label)} (${d.letter})</b><div class="dbar"><i style="width:${pct.toFixed(1)}%;${pct > 90 ? 'background:var(--danger)' : ''}"></i></div><span>${fmtBytes(d.free)} свободно из ${fmtBytes(d.total)}</span></div></div>`);
      c.onclick = () => go(d.letter);
      c.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); UI.menu(e.clientX, e.clientY, [{ label: 'Открыть', icon: 'folder-open', action: () => go(d.letter) }, { label: 'Свойства', icon: 'info', action: () => UI.alert(`${d.label} (${d.letter})`, `${d.device ? 'Память устройства Android' : 'Файловая система: NTFS'}\nЗанято: ${fmtBytes(d.used)}\nСвободно: ${fmtBytes(d.free)}\nЁмкость: ${fmtBytes(d.total)}`) }]); };
      dbox.append(c);
    });
  }

  function renderPreview() {
    const pv = $('.ex-preview', b);
    pv.classList.toggle('hidden', !preview);
    if (!preview) return;
    const p = selectedPaths()[0];
    const node = p && FS.get(p);
    if (!node) { pv.innerHTML = '<div class="muted ex-pv-empty">Выберите файл для предварительного просмотра.</div>'; return; }
    const t = FS.typeOf(p, node);
    let body = '';
    if (t.kind === 'image') body = `<img src="${esc(node.c)}" class="ex-pv-img">`;
    else if (['text', 'code', 'html'].includes(t.kind)) body = `<pre class="ex-pv-text">${esc(String(node.c).slice(0, 4000))}</pre>`;
    else if (t.kind === 'audio') body = `<audio controls src="${esc(node.c)}" style="width:100%"></audio>`;
    else body = `<div style="display:grid;place-items:center;padding:20px">${Icons.get(t.icon, 96, { shortcut: t.shortcut })}</div>`;
    pv.innerHTML = `${body}<div class="ex-pv-meta"><b>${esc(FS.basename(p))}</b><span>${esc(t.label)}</span>${node.t === 'f' ? `<span>${fmtBytes(FS.nodeSize(node))}</span>` : ''}<span>Изменён: ${fmtDateTime(node.mt)}</span></div>`;
  }

  function updateStatus() {
    const n = path === 'home://' || path === 'thispc://' ? null : items.length;
    $('.ex-count', b).textContent = n === null ? '' : `Элементов: ${n}`;
    const s = [...sel];
    let info = '';
    if (s.length) {
      const total = s.reduce((acc, id) => acc + (items.find(i => i.id === id)?.size || 0), 0);
      info = `Выбрано: ${s.length}` + (total ? ` · ${fmtBytes(total)}` : '');
    }
    $('.ex-selinfo', b).textContent = info;
  }

  // ---------- Выделение ----------
  function select(ids, keepAnchor) {
    sel = new Set(ids);
    if (!keepAnchor) anchor = ids[ids.length - 1] || null;
    items.forEach(it => it.el?.classList.toggle('sel', sel.has(it.id)));
    renderCmd();
    updateStatus();
    renderPreview();
  }

  function itemByEl(el) { const e = el?.closest('.ex-item[data-id]'); return e ? items.find(i => i.id === e.dataset.id) : null; }

  function openIt(it) {
    if (it.bin) { UI.alert(it.name, `Исходное расположение: ${FS.display(it.orig)}\nУдалён: ${fmtDateTime(it.date)}\nРазмер: ${fmtBytes(it.size)}\n\nЧтобы открыть этот элемент, сначала восстановите его.`, 'info'); return; }
    if (it.isDir) go(it.path);
    else FileOps.open(it.path);
  }

  content.addEventListener('pointerdown', e => {
    if (e.target.closest('.ex-rename-in, .ex-dhead')) return;
    const it = itemByEl(e.target);
    if (it) {
      if (e.ctrlKey) { const s = new Set(sel); s.has(it.id) ? s.delete(it.id) : s.add(it.id); select([...s]); }
      else if (e.shiftKey && anchor) {
        const ids = items.map(i => i.id);
        const [a, c] = [ids.indexOf(anchor), ids.indexOf(it.id)].sort((x, y) => x - y);
        select(ids.slice(a, c + 1), true);
      } else if (!sel.has(it.id)) select([it.id]);
      return;
    }
    if (e.button !== 0 || !items.length) return;
    // рамка выделения
    const sx = e.clientX, sy = e.clientY;
    const base = e.ctrlKey ? new Set(sel) : new Set();
    let band = null;
    const mv = ev => {
      if (!band && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      if (!band) { band = h('<div class="rubber"></div>'); document.body.append(band); }
      const cr = content.getBoundingClientRect();
      const x1 = Math.max(cr.left, Math.min(sx, ev.clientX)), y1 = Math.max(cr.top, Math.min(sy, ev.clientY));
      const x2 = Math.min(cr.right, Math.max(sx, ev.clientX)), y2 = Math.min(cr.bottom, Math.max(sy, ev.clientY));
      Object.assign(band.style, { left: x1 + 'px', top: y1 + 'px', width: Math.max(0, x2 - x1) + 'px', height: Math.max(0, y2 - y1) + 'px' });
      const s = new Set(base);
      items.forEach(i => { const r = i.el?.getBoundingClientRect(); if (r && r.right > x1 && r.left < x2 && r.bottom > y1 && r.top < y2) s.add(i.id); });
      select([...s]);
    };
    const upH = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', upH);
      if (band) band.remove(); else select([...base]);
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', upH);
  });

  content.addEventListener('click', e => {
    const it = itemByEl(e.target);
    if (it && !e.ctrlKey && !e.shiftKey && sel.size > 1) select([it.id]);
  });
  content.addEventListener('dblclick', e => { const it = itemByEl(e.target); if (it && !e.target.closest('input')) openIt(it); });

  content.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (path === 'home://' || path === 'thispc://') return;
    const it = itemByEl(e.target);
    if (it) {
      if (!sel.has(it.id)) select([it.id]);
      if (it.bin) {
        UI.menu(e.clientX, e.clientY, [
          { label: 'Восстановить', icon: 'undo', action: () => { [...sel].forEach(FS.restore); sel.clear(); } },
          { sep: true },
          { label: 'Удалить безвозвратно', icon: 'trash', danger: true, action: permDeleteBin },
        ]);
        return;
      }
      UI.menu(e.clientX, e.clientY, FileOps.itemMenu(selectedPaths(), { dir: path, rename: startRename }));
      return;
    }
    select([]);
    if (path === 'bin://') {
      UI.menu(e.clientX, e.clientY, [{ label: 'Очистить корзину', icon: 'trash', disabled: !FS.bin().length, action: Desktop.emptyBin }, { label: 'Обновить', icon: 'refresh', action: render }]);
      return;
    }
    UI.menu(e.clientX, e.clientY, [
      { label: 'Вид', icon: 'grid', items: viewItems() },
      { label: 'Сортировка', icon: 'sort', items: sortItems() },
      { label: 'Обновить', icon: 'refresh', action: render },
      { sep: true },
      { label: 'Вставить', icon: 'paste', shortcut: 'Ctrl+V', disabled: !FileOps.canPaste(), action: paste },
      { label: 'Создать', icon: 'plus', items: FileOps.createItems(path, p => { render(); select([p]); startRename(p); }) },
      { sep: true },
      { label: 'Загрузить файлы с компьютера…', icon: 'upload', action: () => FileOps.uploadInto(path) },
      { label: 'Открыть в терминале', icon: 'terminal', action: () => Apps.launch('terminal', { cwd: path }) },
      { label: 'Свойства', icon: 'info', action: () => UI.properties(path) },
    ]);
  });

  async function permDeleteBin() {
    const ids = [...sel];
    if (!ids.length) return;
    if (await UI.confirm('Удаление', `Безвозвратно удалить ${ids.length} ${plural(ids.length, 'элемент', 'элемента', 'элементов')}?`, { danger: true })) {
      ids.forEach(FS.purge); sel.clear(); Sound.play('trash');
    }
  }

  function paste() {
    if (!isReal()) return;
    const out = FileOps.paste(path);
    if (out.length) { render(); select(out); }
  }

  // ---------- Переименование ----------
  function startRename(p) {
    const it = items.find(i => i.id === p);
    if (!it || !it.el || FS.isProtected(p)) return;
    select([p]);
    const lab = $('.ex-label', it.el);
    const inp = h('<input class="ex-rename-in" spellcheck="false">');
    inp.value = it.name;
    lab.replaceWith(inp);
    it.el.draggable = false;
    inp.focus();
    const dot = it.name.lastIndexOf('.');
    inp.setSelectionRange(0, dot > 0 && !it.isDir ? dot : it.name.length);
    let done = false;
    const commit = async ok => {
      if (done) return; done = true;
      const v = inp.value.trim();
      let np = null;
      if (ok && v && v !== it.name) np = await FileOps.rename(p, v);
      render();
      if (np) select([np]);
      content.focus({ preventScroll: true });
    };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') commit(true); if (e.key === 'Escape') commit(false); });
    inp.addEventListener('blur', () => commit(true));
    inp.addEventListener('pointerdown', e => e.stopPropagation());
    inp.addEventListener('dblclick', e => e.stopPropagation());
  }

  // ---------- Клавиатура ----------
  win.el.addEventListener('keydown', e => {
    if (e.target.closest('input') && e.target !== content) {
      if (e.key === 'F5') { e.preventDefault(); render(); }
      return;
    }
    const ids = items.map(i => i.id);
    const sp = selectedPaths();
    const k = e.key;
    if (e.altKey && k === 'ArrowLeft') back();
    else if (e.altKey && k === 'ArrowRight') fwd();
    else if (e.altKey && k === 'ArrowUp') up();
    else if (k === 'Backspace') back();
    else if (k === 'F5') render();
    else if (k === 'F2') { if (sp.length === 1) startRename(sp[0]); }
    else if (k === 'Delete') { if (path === 'bin://') permDeleteBin(); else if (sp.length) FileOps.remove(sp, e.shiftKey); }
    else if (k === 'Enter' && e.altKey) { if (sp[0]) UI.properties(sp[0]); }
    else if (k === 'Enter') { [...sel].map(id => items.find(i => i.id === id)).filter(Boolean).forEach(openIt); }
    else if (e.ctrlKey && e.code === 'KeyA') select(ids);
    else if (e.ctrlKey && e.code === 'KeyC') { if (sp.length) FileOps.copy(sp); }
    else if (e.ctrlKey && e.code === 'KeyX') { if (sp.length) FileOps.cut(sp); }
    else if (e.ctrlKey && e.code === 'KeyV') paste();
    else if (e.ctrlKey && e.code === 'KeyF') { $('.ex-search input', b).focus(); }
    else if (e.ctrlKey && e.code === 'KeyN') Apps.launch('explorer', { path });
    else if (e.ctrlKey && e.shiftKey && e.code === 'KeyN') { if (isReal()) { const p = FileOps.newFolder(path); if (p) { render(); startRename(p); } } }
    else if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(k) && ids.length) {
      let cols = 1;
      if (content.classList.contains('v-grid')) {
        const els = items.map(i => i.el);
        const top = els[0].offsetTop;
        cols = Math.max(1, els.findIndex(x => x.offsetTop !== top));
        if (cols <= 0 || els.every(x => x.offsetTop === top)) cols = els.length;
      }
      const cur = Math.max(0, ids.indexOf(anchor));
      let n = cur;
      if (k === 'ArrowDown') n = cur + cols; else if (k === 'ArrowUp') n = cur - cols;
      else if (k === 'ArrowRight') n = cur + (cols > 1 ? 1 : 0); else if (k === 'ArrowLeft') n = cur - (cols > 1 ? 1 : 0);
      else if (k === 'Home') n = 0; else if (k === 'End') n = ids.length - 1;
      n = clamp(n, 0, ids.length - 1);
      select([ids[n]]);
      items[n].el?.scrollIntoView({ block: 'nearest' });
    } else return;
    e.preventDefault();
  });

  // ---------- Перетаскивание ----------
  content.addEventListener('dragstart', e => {
    const it = itemByEl(e.target);
    if (!it || it.bin) { e.preventDefault(); return; }
    if (!sel.has(it.id)) select([it.id]);
    DnD.start(e, selectedPaths(), 'explorer');
  });
  content.addEventListener('dragend', () => DnD.end());
  content.addEventListener('dragover', e => {
    if (!isReal() || !DnD.accepts(e)) return;
    const it = itemByEl(e.target);
    $$('.ex-item.drop', content).forEach(x => x.classList.remove('drop'));
    if (it && it.isDir && !sel.has(it.id)) it.el.classList.add('drop');
    else if (DnD.paths && DnD.paths.every(p => FS.parent(p).toLowerCase() === path.toLowerCase())) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = e.ctrlKey || !DnD.paths ? 'copy' : 'move';
  });
  content.addEventListener('dragleave', e => { if (e.target.classList?.contains('ex-item')) e.target.classList.remove('drop'); });
  content.addEventListener('drop', async e => {
    e.preventDefault();
    $$('.ex-item.drop', content).forEach(x => x.classList.remove('drop'));
    const it = itemByEl(e.target);
    const target = it && it.isDir && !sel.has(it.id) ? it.path : path;
    const out = await DnD.dropInto(target, e);
    if (target === path && out?.length) select(out);
  });

  // ---------- Обновление при изменениях ----------
  const rerender = debounce(() => {
    if (isReal() && !FS.isDir(path)) { go(FS.parent(path) && FS.isDir(FS.parent(path)) ? FS.parent(path) : 'thispc://', false); return; }
    if (b.querySelector('.ex-rename-in')) return;
    const keep = [...sel];
    render();
    select(keep.filter(id => items.some(i => i.id === id)), true);
  }, 40);
  const offs = [FS.on('change', rerender), FileOps.on('clip', rerender), FileOps.on('recent', rerender), Store.on('explorerView', rerender), Store.on('showExtensions', rerender)];
  win.onClose = () => offs.forEach(f => f());
  win.onArgs = a => a.path && go(a.path);

  render();
  if (args.select) { const it = items.find(i => i.id.toLowerCase() === FS.realPath(args.select)?.toLowerCase()); if (it) { select([it.id]); it.el?.scrollIntoView({ block: 'nearest' }); } }
  content.focus({ preventScroll: true });
  return win;
}
