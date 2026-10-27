/* Меню «Пуск» и поиск */
'use strict';

const StartMenu = (() => {
  const el = () => document.getElementById('start-menu');
  let view = 'home';
  let kbIndex = -1;
  let results = [];

  function avatarHTML(size = 34) {
    const av = Store.get('avatar');
    const name = Store.get('userName') || 'П';
    return `<div class="avatar" style="width:${size}px;height:${size}px;font-size:${size * 0.42}px;background:${av ? `url('${av}') center/cover` : Store.get('avatarColor')}">${av ? '' : esc(name.trim()[0]?.toUpperCase() || 'П')}</div>`;
  }

  function build() {
    el().innerHTML = `
      <div class="sm-search"><label class="sm-search-box">${Icons.ui('search', 16)}<input type="text" placeholder="Поиск приложений, параметров и документов" spellcheck="false"></label></div>
      <div class="sm-body"></div>
      <div class="sm-footer">
        <div class="sm-user"></div>
        <button class="icon-btn sm-power" title="Выключение">${Icons.ui('power', 18)}</button>
      </div>`;
    const input = $('.sm-search input', el());
    input.addEventListener('input', () => {
      kbIndex = -1;
      if (input.value.trim()) { view = 'search'; renderSearch(input.value); }
      else { view = 'home'; render(); }
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); if (input.value) { input.value = ''; view = 'home'; render(); } else Shell.close('start'); }
      if (view !== 'search') return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        kbIndex = clamp(kbIndex + (e.key === 'ArrowDown' ? 1 : -1), 0, results.length - 1);
        $$('.sm-row', el()).forEach((r, i) => r.classList.toggle('kb', i === kbIndex));
        $$('.sm-row', el())[kbIndex]?.scrollIntoView({ block: 'nearest' });
      }
      if (e.key === 'Enter') { e.preventDefault(); const r = results[kbIndex < 0 ? 0 : kbIndex]; if (r) { r.open(); Shell.close('start'); } }
    });
    $('.sm-power', el()).onclick = e => {
      const r = e.currentTarget.getBoundingClientRect();
      UI.menu(r.left - 150, r.top - 8, FX.web ? [
        { label: 'Заблокировать', icon: 'lock', action: () => Power.lock() },
        { label: 'Выйти из учётной записи', icon: 'signout', action: () => Power.signOut() },
      ] : [
        { label: 'Заблокировать', icon: 'lock', action: () => Power.lock() },
        { label: 'Спящий режим', icon: 'sleep', action: () => Power.sleep() },
        { label: 'Завершение работы', icon: 'power', action: () => Power.shutdown() },
        { label: 'Перезагрузка', icon: 'restart', action: () => Power.restart() },
      ], { above: true });
    };
    $('.sm-user', el()).onclick = e => {
      const r = e.currentTarget.getBoundingClientRect();
      UI.menu(r.left, r.top - 8, [
        { header: Store.get('userName') + (FX.web ? ' · ' + FXWeb.login : ' · Локальная учётная запись') },
        { label: 'Изменить параметры учётной записи', icon: 'user', action: () => Apps.launch('settings', { page: FX.web ? 'fx' : 'accounts' }) },
        { label: 'Заблокировать', icon: 'lock', action: () => Power.lock() },
        { label: 'Выйти', icon: 'signout', action: () => Power.signOut() },
      ], { above: true });
    };
    el().addEventListener('contextmenu', e => e.preventDefault());
    el().addEventListener('keydown', e => {
      if (e.target !== input && e.key.length === 1 && !e.ctrlKey && !e.altKey) input.focus();
    });
  }

  function renderUser() {
    $('.sm-user', el()).innerHTML = avatarHTML() + `<span>${esc(Store.get('userName'))}</span>`;
  }

  function appMenu(app, x, y) {
    const inStart = Store.get('startPinned').includes(app.id);
    const pinnedTb = Taskbar.isPinned(app.id);
    UI.menu(x, y, [
      { label: 'Открыть', icon: 'app:' + app.icon, action: () => { Apps.launch(app.id); Shell.close('start'); } },
      { sep: true },
      { label: inStart ? 'Открепить от начального экрана' : 'Закрепить на начальном экране', icon: inStart ? 'unpin' : 'pin', action: () => { Store.update('startPinned', p => inStart ? p.filter(x => x !== app.id) : [...p, app.id]); render(); } },
      inStart ? { label: 'Переместить в начало', icon: 'up', action: () => { Store.update('startPinned', p => [app.id, ...p.filter(x => x !== app.id)]); render(); } } : null,
      { label: pinnedTb ? 'Открепить от панели задач' : 'Закрепить на панели задач', icon: pinnedTb ? 'unpin' : 'pin', action: () => Taskbar.togglePin(app.id) },
      { label: 'Создать ярлык на рабочем столе', icon: 'external', action: () => FileOps.appShortcut(app.id) },
      app.android ? null : { label: 'Добавить в автозагрузку', checked: Store.get('startupApps').includes(app.id), action: () => Store.update('startupApps', s => s.includes(app.id) ? s.filter(x => x !== app.id) : [...s, app.id]) },
      ...(typeof AndroidApps !== 'undefined' ? AndroidApps.menuItems(app) : []),
    ]);
  }

  function render() {
    renderUser();
    const body = $('.sm-body', el());
    if (view === 'all') return renderAll(body);
    const pinned = Store.get('startPinned').map(Apps.get).filter(Boolean);
    const rec = FileOps.recent().slice(0, 6);
    body.innerHTML = `
      <div class="sm-section-head"><span>Закреплённые</span><button class="btn sm-all-btn">Все приложения ${Icons.ui('chevron-right', 12)}</button></div>
      <div class="sm-grid"></div>
      ${Store.get('showRecommended') ? `<div class="sm-section-head"><span>Рекомендуем</span>${rec.length ? '<button class="btn sm-clear-rec">Очистить</button>' : ''}</div><div class="sm-rec"></div>` : ''}`;
    $('.sm-all-btn', body).onclick = () => { view = 'all'; render(); };
    const grid = $('.sm-grid', body);
    pinned.forEach(app => {
      const a = h(`<div class="sm-app" title="${esc(app.desc || app.name)}">${Icons.get(app.icon, 32)}<span>${esc(app.name)}</span></div>`);
      a.onclick = () => { Shell.close('start'); Apps.launch(app.id); };
      a.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); appMenu(app, e.clientX, e.clientY); };
      grid.append(a);
    });
    const rbox = $('.sm-rec', body);
    if (rbox) {
      if (!rec.length) rbox.outerHTML = '<div class="sm-tip">Здесь будут появляться недавно открытые файлы. Откройте что-нибудь в Проводнике, Блокноте или Фотографиях.</div>';
      rec.forEach(r => {
        const t = FS.typeOf(r.path);
        const it = h(`<div class="sm-rec-item">${Icons.get(t.icon, 30)}<div class="t"><b>${esc(FS.basename(r.path))}</b><span>${esc(timeAgo(r.ts))}</span></div></div>`);
        it.onclick = () => { Shell.close('start'); FileOps.open(r.path); };
        it.oncontextmenu = e => {
          e.preventDefault(); e.stopPropagation();
          UI.menu(e.clientX, e.clientY, [
            { label: 'Открыть', icon: 'folder-open', action: () => { Shell.close('start'); FileOps.open(r.path); } },
            { label: 'Открыть расположение файла', icon: 'folder', action: () => { Shell.close('start'); Apps.launch('explorer', { path: FS.parent(r.path), select: r.path }); } },
            { label: 'Удалить из списка', icon: 'close', action: () => { Persist.set('recent', Persist.get('recent', []).filter(x => x.path !== r.path)); render(); } },
          ]);
        };
        rbox.append(it);
      });
    }
    $('.sm-clear-rec', body)?.addEventListener('click', () => { Persist.set('recent', []); render(); });
  }

  function renderAll(body) {
    body.innerHTML = `<div class="sm-section-head"><span>Все приложения</span><button class="btn sm-back">${Icons.ui('chevron-left', 12)} Назад</button></div><div class="sm-all-list"></div>`;
    $('.sm-back', body).onclick = () => { view = 'home'; render(); };
    const list = $('.sm-all-list', body);
    const apps = Apps.all().sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    let letter = '';
    apps.forEach(app => {
      const L = app.name[0].toUpperCase();
      if (L !== letter) { letter = L; list.append(h(`<div class="letter">${esc(L)}</div>`)); }
      const r = h(`<div class="sm-row">${Icons.get(app.icon, 26)}<div class="t">${esc(app.name)}<span>${esc(app.desc || '')}</span></div></div>`);
      r.onclick = () => { Shell.close('start'); Apps.launch(app.id); };
      r.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); appMenu(app, e.clientX, e.clientY); };
      list.append(r);
    });
  }

  function renderSearch(q) {
    const body = $('.sm-body', el());
    const query = q.trim();
    const ql = query.toLowerCase();
    results = [];
    const apps = Apps.search(query);
    apps.forEach(a => results.push({ group: 'Приложения', icon: Icons.get(a.icon, 26), bigIcon: Icons.get(a.icon, 64), name: a.name, sub: 'Приложение', open: () => Apps.launch(a.id), app: a }));
    (typeof SETTINGS_INDEX !== 'undefined' ? SETTINGS_INDEX : []).filter(s => s.label.toLowerCase().includes(ql) || (s.kw || '').includes(ql)).slice(0, 5)
      .forEach(s => results.push({ group: 'Параметры', icon: Icons.get('settings', 26), bigIcon: Icons.get('settings', 64), name: s.label, sub: 'Параметры системы', open: () => Apps.launch('settings', { page: s.page }) }));
    const files = [];
    if (ql.length >= 2) {
      [FS.P.home, 'D:'].forEach(root => files.push(...FS.search(root, query, 30)));
    }
    files.slice(0, 8).forEach(f => {
      const t = FS.typeOf(f.path, f.node);
      results.push({ group: f.isDir ? 'Папки' : 'Документы', icon: Icons.get(t.icon, 26, { shortcut: t.shortcut }), bigIcon: Icons.get(t.icon, 64, { shortcut: t.shortcut }), name: FileOps.label(f.name, f.node), sub: FS.display(FS.parent(f.path)), open: () => FileOps.open(f.path), path: f.path });
    });
    // Калькулятор прямо в поиске
    let calc = null;
    if (/^[\d\s+\-*/×÷^().,%!πe]+$/i.test(query) && /\d/.test(query) && /[+\-*/×÷^%!]/.test(query)) {
      try { calc = MathParser.format(MathParser.evaluate(query)); } catch {}
    }
    if (calc !== null) results.unshift({ group: 'Калькулятор', icon: Icons.get('calculator', 26), bigIcon: Icons.get('calculator', 64), name: `${query} = ${calc}`, sub: 'Открыть в Калькуляторе', open: () => Apps.launch('calculator', { expr: query }) });
    results.push({ group: 'Поиск в Интернете', icon: `<span style="width:26px;display:grid;place-items:center">${Icons.ui('search', 18)}</span>`, bigIcon: Icons.get('browser', 64), name: `${query} — смотреть результаты в Интернете`, sub: 'Браузер', open: () => Apps.launch('browser', { search: query }) });

    const best = results[0];
    body.innerHTML = `<div class="sm-results"><div class="sm-best"><div class="sm-results-list"></div><div class="sm-best-card"></div></div></div>`;
    const list = $('.sm-results-list', body);
    let g = '';
    results.forEach((r, i) => {
      if (r.group !== g) { g = r.group; list.append(h(`<div class="group">${esc(g)}</div>`)); }
      const row = h(`<div class="sm-row ${i === kbIndex ? 'kb' : ''}">${r.icon}<div class="t">${esc(r.name)}<span>${esc(r.sub)}</span></div></div>`);
      row.onclick = () => { Shell.close('start'); r.open(); };
      row.onmouseenter = () => showBest(r);
      if (r.path) row.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); UI.menu(e.clientX, e.clientY, [{ label: 'Открыть расположение файла', icon: 'folder', action: () => { Shell.close('start'); Apps.launch('explorer', { path: FS.parent(r.path), select: r.path }); } }]); };
      list.append(row);
    });
    showBest(best);
    if (narrow()) $('.sm-best-card', body).style.display = 'none';
  }
  const narrow = () => innerWidth < 640;

  function showBest(r) {
    const card = $('.sm-best-card', el());
    if (!card || !r) return;
    card.innerHTML = `${r.bigIcon}<b>${esc(r.name)}</b><span class="muted small">${esc(r.sub)}</span><button class="btn primary">Открыть</button>`;
    $('.btn', card).onclick = () => { Shell.close('start'); r.open(); };
  }

  function init() {
    build();
    Shell.register('start', {
      el: el(),
      onOpen(arg) {
        const input = $('.sm-search input', el());
        input.value = '';
        view = 'home';
        render();
        Sound.play('click');
        setTimeout(() => input.focus(), arg?.search ? 30 : 60);
      },
      onClose() { $('.sm-search input', el()).blur(); },
    });
    ['userName', 'avatar', 'avatarColor'].forEach(k => Store.on(k, () => renderUser()));
  }

  return { init, avatarHTML };
})();
