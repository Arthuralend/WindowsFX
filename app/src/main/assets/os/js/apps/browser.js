/* Браузер */
'use strict';

Apps.register({
  id: 'browser', name: 'Браузер', icon: 'browser', desc: 'Веб-обозреватель с вкладками', network: true,
  keywords: 'интернет браузер веб edge сайт google',
  launch: args => openBrowser(args),
});

function openBrowser(args = {}) {
  const DEFAULT_BOOKMARKS = [
    { title: 'Google', url: 'https://www.google.com/' },
    { title: 'YouTube', url: 'https://m.youtube.com/' },
    { title: 'Яндекс', url: 'https://ya.ru/' },
    { title: 'Википедия', url: 'https://ru.wikipedia.org/wiki/Заглавная_страница' },
    { title: 'Карты', url: 'https://www.openstreetmap.org/' },
    { title: 'Example', url: 'https://example.com/' },
    { title: 'О WindowsFX', url: 'about:windows' },
  ];
  const BLOCKED = ['youtube.com', 'github.com', 'vk.com', 'yandex.ru', 'ya.ru', 'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'mail.ru', 'reddit.com', 'stackoverflow.com', 'microsoft.com', 'apple.com', 'amazon.com', 'bing.com', 'duckduckgo.com', 'ok.ru', 'telegram.org', 'web.telegram.org', 'habr.com', 'ozon.ru', 'wildberries.ru', 'chatgpt.com', 'openai.com', 'claude.ai', 'linkedin.com', 'netflix.com', 'twitch.tv', 'gosuslugi.ru', 'avito.ru', 'dzen.ru', 'rutube.ru', 'kinopoisk.ru'];
  const bookmarks = () => Persist.get('browser.bookmarks', DEFAULT_BOOKMARKS);
  const setBookmarks = v => { Persist.set('browser.bookmarks', v); renderBookmarks(); updateStar(); };

  const win = WM.open({ app: 'browser', title: 'Новая вкладка — Браузер', width: 1100, height: 720, minWidth: 480, minHeight: 320 });
  const b = win.body;
  b.classList.add('br');
  win.tbExtra.innerHTML = `<div class="br-tabs"></div><button class="icon-btn sm br-newtab no-drag" title="Новая вкладка">${Icons.ui('plus', 14)}</button>`;
  b.innerHTML = `
    <div class="br-bar">
      <button class="icon-btn br-back" title="Назад">${Icons.ui('back', 16)}</button>
      <button class="icon-btn br-fwd" title="Вперёд">${Icons.ui('forward', 16)}</button>
      <button class="icon-btn br-reload" title="Обновить (F5)">${Icons.ui('refresh', 16)}</button>
      <button class="icon-btn br-home" title="Домашняя страница">${Icons.ui('home', 16)}</button>
      <div class="br-addr"><span class="br-lock">${Icons.ui('lock', 13)}</span><input spellcheck="false" placeholder="Введите запрос или веб-адрес"><button class="icon-btn sm br-star" title="Добавить в избранное">${Icons.ui('star', 15)}</button></div>
      <button class="icon-btn br-ext" title="Открыть в настоящем браузере">${Icons.ui('external', 16)}</button>
      <button class="icon-btn br-menu" title="Настройки и другое">${Icons.ui('more', 16)}</button>
    </div>
    <div class="br-bookmarks"></div>
    <div class="br-progress"><i></i></div>
    <div class="br-views"></div>`;
  const tabsEl = $('.br-tabs', win.tbExtra), views = $('.br-views', b), addr = $('.br-addr input', b);
  let tabs = [], cur = null, zoom = 1;

  // ---------- Вкладки ----------
  function newTab(url = 'about:newtab', activate = true, opts = {}) {
    const t = { id: opts.nativeId || uid('tab'), url: '', title: 'Новая вкладка', hist: [], idx: -1, view: h('<div class="br-view"></div>'), mode: 'web', native: !!opts.nativeId, win };
    if (t.native) BrowserNative.register(t, api);
    views.append(t.view);
    tabs.push(t);
    if (activate) activateTab(t);
    if (opts.nativeId) { t.mode = 'native'; t.hist.push('native'); t.idx = 0; t.title = 'Загрузка…'; t.view.append(h('<div class="br-native"><img class="br-snap" alt=""></div>')); }
    else navigate(t, url);
    renderTabs();
    return t;
  }

  function closeTab(t) {
    const i = tabs.indexOf(t);
    if (t.native) BrowserNative.destroy(t);
    t.view.remove();
    tabs.splice(i, 1);
    if (!tabs.length) { win.close(); return; }
    if (cur === t) activateTab(tabs[Math.min(i, tabs.length - 1)]);
    renderTabs();
  }

  function activateTab(t) {
    cur = t;
    tabs.forEach(x => x.view.classList.toggle('on', x === t));
    syncUI();
    renderTabs();
  }

  function renderTabs() {
    tabsEl.innerHTML = '';
    tabs.forEach(t => {
      const el = h(`<div class="br-tab no-drag ${t === cur ? 'on' : ''}" title="${esc(t.title)}">
        <span class="br-fav">${t.loading ? '<div class="ring-loader" style="width:14px;height:14px;border-width:2px"></div>' : favicon(t)}</span>
        <span class="br-tt">${esc(t.title)}</span>
        <button class="br-tx" title="Закрыть вкладку">${Icons.ui('close', 11)}</button>
      </div>`);
      el.onmousedown = e => { if (e.button === 1) { e.preventDefault(); closeTab(t); } };
      el.onclick = e => { if (!e.target.closest('.br-tx')) activateTab(t); };
      $('.br-tx', el).onclick = e => { e.stopPropagation(); closeTab(t); };
      el.oncontextmenu = e => {
        e.preventDefault(); e.stopPropagation();
        UI.menu(e.clientX, e.clientY, [
          { label: 'Новая вкладка', icon: 'plus', action: () => newTab() },
          { label: 'Обновить', icon: 'refresh', action: () => reload(t) },
          { label: 'Дублировать вкладку', icon: 'copy', action: () => newTab(t.url) },
          { sep: true },
          { label: 'Закрыть вкладку', icon: 'close', action: () => closeTab(t) },
          { label: 'Закрыть другие вкладки', disabled: tabs.length < 2, action: () => tabs.filter(x => x !== t).forEach(closeTab) },
        ]);
      };
      tabsEl.append(el);
    });
  }

  function favicon(t) {
    if (t.mode === 'native' && t.icon) return `<img src="${esc(t.icon)}" width="14" height="14">`;
    if (t.url.startsWith('about:')) return Icons.get(t.url === 'about:windows' ? 'start' : 'browser', 14);
    if (t.url.startsWith('file:')) return Icons.get('file-html', 14);
    try { const host = new URL(t.url).hostname; return `<img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32" width="14" height="14" onerror="this.style.visibility='hidden'">`; }
    catch { return Icons.ui('globe', 14); }
  }

  // ---------- Навигация ----------
  function resolve(input) {
    let s = String(input || '').trim();
    if (!s) return 'about:newtab';
    if (/^(about|edge):/i.test(s)) return s.toLowerCase().replace('edge://', 'about:');
    if (/^file:\/\//i.test(s)) return s;
    if (/^[a-z]:[\\/]/i.test(s)) return 'file:///' + FS.norm(s);
    if (/^https?:\/\//i.test(s)) return s;
    if (/^localhost(:\d+)?(\/|$)/i.test(s)) return 'http://' + s;
    if (!/\s/.test(s) && /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/i.test(s)) return 'https://' + s;
    return 'https://www.google.com/search?igu=1&q=' + encodeURIComponent(s);
  }

  function navigate(t, input, push = true) {
    const url = resolve(input);
    if (push) { t.hist.splice(t.idx + 1); t.hist.push(url); t.idx = t.hist.length - 1; }
    load(t, url);
  }

  function load(t, url) {
    if (FX.available && /^https?:/i.test(url)) { renderNative(t, url); addHistory(url, t.title); renderTabs(); if (t === cur) syncUI(); return; }
    t.mode = 'web';
    t.url = url;
    t.view.innerHTML = '';
    t.loading = false;
    if (url.startsWith('about:')) renderInternal(t, url);
    else if (url.startsWith('file:')) renderFile(t, url);
    else if (!Net.online()) { t.title = 'Нет подключения'; t.view.append(offlineScreen(() => reload(t))); }
    else renderWeb(t, url);
    if (!url.startsWith('about:newtab')) addHistory(url, t.title);
    renderTabs();
    if (t === cur) syncUI();
  }

  const back = (t = cur) => {
    if (t.mode === 'native' && t.canBack) return FX.call('webAction', t.id, 'back');
    let i = t.idx - 1;
    while (i >= 0 && t.hist[i] === 'native') i--;
    if (i >= 0) { t.idx = i; load(t, t.hist[i]); }
  };
  const fwd = (t = cur) => {
    if (t.mode === 'native' && t.canFwd) return FX.call('webAction', t.id, 'forward');
    if (t.idx < t.hist.length - 1) { t.idx++; if (t.hist[t.idx] === 'native') return showNative(t); load(t, t.hist[t.idx]); }
  };
  const reload = (t = cur) => t.mode === 'native' ? FX.call('webAction', t.id, 'reload') : load(t, t.url);

  function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }

  /** Веб-страница в настоящем Chromium (Android WebView) поверх окна */
  function renderNative(t, url) {
    if (t.mode !== 'native') {
      t.hist.splice(t.idx + 1);
      if (t.hist[t.hist.length - 1] !== 'native') t.hist.push('native');
      t.idx = t.hist.length - 1;
    }
    showNative(t);
    t.url = url;
    t.title = hostOf(url) || url;
    t.loading = true;
    if (!t.native) { t.native = true; BrowserNative.register(t, api); FX.call('webCreate', t.id, url); }
    else FX.call('webNavigate', t.id, url);
  }
  function showNative(t) {
    t.mode = 'native';
    if (!$('.br-native', t.view)) { t.view.innerHTML = ''; t.view.append(h('<div class="br-native"><img class="br-snap" alt=""></div>')); }
    renderTabs();
    if (t === cur) syncUI();
  }

  function renderWeb(t, url) {
    const host = hostOf(url);
    t.title = host || url;
    const isBlocked = BLOCKED.some(d => host === d || host.endsWith('.' + d)) && !/\/embed\//.test(url) && !(host === 'google.com' && /igu=1/.test(url));
    if (isBlocked) {
      t.view.append(h(`<div class="br-blocked">${Icons.ui('shield', 56)}<h2>${esc(host)} запрещает отображение во встроенных окнах</h2><p>Владельцы этого сайта не разрешают открывать его внутри других страниц. Откройте его в настоящем браузере — он появится в новой вкладке.</p><button class="btn primary">${Icons.ui('external', 14)} Открыть ${esc(host)}</button></div>`));
      $('.btn', t.view).onclick = () => window.open(url, '_blank', 'noopener');
      return;
    }
    const f = h(`<iframe class="br-frame" referrerpolicy="no-referrer-when-downgrade" allow="autoplay; encrypted-media; fullscreen; geolocation; clipboard-write" allowfullscreen></iframe>`);
    f.style.zoom = zoom;
    t.loading = true;
    startProgress();
    f.addEventListener('load', () => { t.loading = false; endProgress(); renderTabs(); });
    f.src = url;
    const info = h(`<div class="br-info">${Icons.ui('info', 14)}<span>Если страница не отображается, сайт мог запретить встраивание.</span><button class="btn sm">Открыть в браузере</button><button class="icon-btn sm">${Icons.ui('close', 12)}</button></div>`);
    $('.btn', info).onclick = () => window.open(url, '_blank', 'noopener');
    $('.icon-btn', info).onclick = () => info.remove();
    t.view.append(info, f);
    setTimeout(() => info.remove(), 9000);
  }

  function renderFile(t, url) {
    const p = decodeURI(url.replace(/^file:\/\/\/?/i, ''));
    const node = FS.get(p);
    if (!node || node.t !== 'f') {
      t.title = 'Файл не найден';
      t.view.append(h(`<div class="br-blocked">${Icons.ui('alert', 56)}<h2>Не удаётся получить доступ к файлу</h2><p>Возможно, он был перемещён, изменён или удалён.<br>${esc(FS.display(p))}</p></div>`));
      return;
    }
    const type = FS.typeOf(p, node);
    t.title = FS.basename(p);
    if (type.kind === 'html') {
      const m = String(node.c).match(/<title>([^<]*)<\/title>/i);
      if (m && m[1].trim()) t.title = m[1].trim();
      const f = h('<iframe class="br-frame" sandbox="allow-scripts allow-forms allow-modals allow-popups"></iframe>');
      f.style.zoom = zoom;
      f.srcdoc = node.c;
      t.view.append(f);
    } else if (type.kind === 'image') {
      t.view.append(h(`<div class="br-imgview"><img src="${esc(node.c)}"></div>`));
    } else if (type.kind === 'audio' || type.kind === 'video') {
      t.view.append(h(`<div class="br-imgview"><${type.kind} controls autoplay src="${esc(node.c)}"></${type.kind}></div>`));
    } else {
      t.view.append(h(`<pre class="br-text">${esc(node.c)}</pre>`));
    }
  }

  // ---------- Внутренние страницы ----------
  function renderInternal(t, url) {
    const page = url.replace('about:', '');
    if (page === 'newtab' || page === 'blank' || page === 'home') {
      t.title = 'Новая вкладка';
      const hr = new Date().getHours();
      const v = h(`<div class="br-newtab" style="background:${Desktop.wallpaperCSS()};background-size:cover;background-position:center">
        <div class="br-nt-inner">
          <div class="br-nt-time"></div>
          <div class="br-nt-greet">${hr < 5 ? 'Доброй ночи' : hr < 12 ? 'Доброе утро' : hr < 18 ? 'Добрый день' : 'Добрый вечер'}, ${esc(Store.get('userName'))}</div>
          <form class="br-nt-search">${Icons.ui('search', 18)}<input placeholder="Поиск в Интернете" spellcheck="false"><button class="icon-btn" type="submit">${Icons.ui('forward', 16)}</button></form>
          <div class="br-dial"></div>
        </div>
      </div>`);
      const time = $('.br-nt-time', v);
      const tick = () => { if (!v.isConnected) return clearInterval(ti); time.textContent = fmtTime(Date.now()); };
      const ti = setInterval(tick, 1000); tick();
      $('form', v).onsubmit = e => { e.preventDefault(); const q = $('input', v).value.trim(); if (q) navigate(t, q); };
      const dial = $('.br-dial', v);
      bookmarks().forEach((bm, i) => {
        const host = hostOf(bm.url);
        const d = h(`<div class="br-dial-item" title="${esc(bm.url)}"><div class="br-dial-ic">${bm.url.startsWith('about:') ? Icons.get('start', 28) : `<img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64" width="28" height="28" onerror="this.style.display='none'">`}</div><span>${esc(bm.title)}</span></div>`);
        d.onclick = () => navigate(t, bm.url);
        d.oncontextmenu = e => {
          e.preventDefault(); e.stopPropagation();
          UI.menu(e.clientX, e.clientY, [
            { label: 'Открыть в новой вкладке', icon: 'tab', action: () => newTab(bm.url) },
            { label: 'Переименовать', icon: 'rename', action: async () => { const n = await UI.prompt('Переименовать', 'Название:', bm.title); if (n) { const l = bookmarks(); l[i].title = n; setBookmarks(l); reload(t); } } },
            { label: 'Удалить', icon: 'trash', action: () => { const l = bookmarks(); l.splice(i, 1); setBookmarks(l); reload(t); } },
          ]);
        };
        dial.append(d);
      });
      const add = h(`<div class="br-dial-item"><div class="br-dial-ic">${Icons.ui('plus', 22)}</div><span>Добавить</span></div>`);
      add.onclick = async () => {
        const u = await UI.prompt('Добавить сайт', 'Адрес сайта:', 'https://');
        if (!u || u === 'https://') return;
        const n = await UI.prompt('Добавить сайт', 'Название:', hostOf(resolve(u)) || u);
        if (n) { setBookmarks([...bookmarks(), { title: n, url: resolve(u) }]); reload(t); }
      };
      dial.append(add);
      t.view.append(v);
      setTimeout(() => t === cur && $('input', v).focus(), 50);
      return;
    }
    if (page === 'history') {
      t.title = 'Журнал';
      const list = Persist.get('browser.history', []);
      const v = h(`<div class="br-page"><div class="br-page-head"><h1>Журнал</h1><button class="btn br-clear">Очистить журнал</button></div><div class="br-list"></div></div>`);
      const lb = $('.br-list', v);
      if (!list.length) lb.innerHTML = '<div class="muted">Журнал пуст.</div>';
      let day = '';
      list.forEach(it => {
        const d = fmtDateLong(it.ts);
        if (d !== day) { day = d; lb.append(h(`<div class="br-list-day">${esc(cap(d))}</div>`)); }
        const r = h(`<div class="br-list-item"><span class="muted small" style="width:48px">${fmtTime(it.ts)}</span>${Icons.ui('globe', 14)}<b>${esc(it.title || it.url)}</b><span class="muted small ellip">${esc(it.url)}</span></div>`);
        r.onclick = () => navigate(t, it.url);
        lb.append(r);
      });
      $('.br-clear', v).onclick = () => { Persist.remove('browser.history'); reload(t); };
      t.view.append(v);
      return;
    }
    if (page === 'bookmarks') {
      t.title = 'Избранное';
      const v = h(`<div class="br-page"><div class="br-page-head"><h1>Избранное</h1></div><div class="br-list"></div></div>`);
      bookmarks().forEach((bm, i) => {
        const r = h(`<div class="br-list-item">${Icons.ui('star-filled', 14)}<b>${esc(bm.title)}</b><span class="muted small ellip">${esc(bm.url)}</span><button class="icon-btn sm" title="Удалить">${Icons.ui('trash', 14)}</button></div>`);
        r.onclick = e => { if (!e.target.closest('button')) navigate(t, bm.url); };
        $('button', r).onclick = () => { const l = bookmarks(); l.splice(i, 1); setBookmarks(l); reload(t); };
        $('.br-list', v).append(r);
      });
      t.view.append(v);
      return;
    }
    if (page === 'windows') {
      t.title = 'О WindowsFX';
      t.view.append(h(`<div class="br-page br-about">
        ${Icons.get('start', 96)}
        <h1>WindowsFX</h1>
        <p class="muted">Версия ${esc(FX.info().version || '—')} · Android ${esc(FX.info().android || '')}</p>
        <p>Рабочий стол в стиле Windows для Android: окна, панель задач, меню «Пуск», настоящие файлы устройства, приложения Android в окнах, браузер на движке Chromium.</p>
        <div class="br-about-grid">
          <div>${Icons.get('explorer', 32)}<b>Файловая система</b><span>Папки, файлы, корзина, перетаскивание</span></div>
          <div>${Icons.get('settings', 32)}<b>Параметры</b><span>Темы, обои, учётные записи, сеть</span></div>
          <div>${Icons.get('assistant', 32)}<b>Ассистент</b><span>Управление системой на естественном языке</span></div>
          <div>${Icons.get('terminal', 32)}<b>Терминал</b><span>Более 40 команд</span></div>
        </div>
      </div>`));
      return;
    }
    t.title = 'Страница не найдена';
    t.view.append(h(`<div class="br-blocked">${Icons.ui('alert', 56)}<h2>Страница ${esc(url)} не найдена</h2><p>Доступные страницы: about:newtab, about:history, about:bookmarks, about:windows</p></div>`));
  }

  function addHistory(url, title) {
    const list = Persist.get('browser.history', []);
    if (list[0]?.url === url) return;
    list.unshift({ url, title, ts: Date.now() });
    Persist.set('browser.history', list.slice(0, 200));
  }

  // ---------- Интерфейс ----------
  let progT;
  function startProgress() { const p = $('.br-progress', b); p.classList.remove('done'); p.classList.add('on'); clearTimeout(progT); progT = setTimeout(endProgress, 12000); }
  function endProgress() { const p = $('.br-progress', b); p.classList.add('done'); clearTimeout(progT); setTimeout(() => p.classList.remove('on', 'done'), 400); }

  function syncUI() {
    if (!cur) return;
    const internal = cur.url.startsWith('about:');
    addr.value = cur.url === 'about:newtab' ? '' : cur.url.startsWith('file:') ? FS.display(decodeURI(cur.url.replace(/^file:\/\/\/?/i, ''))) : cur.url;
    $('.br-lock', b).innerHTML = Icons.ui(internal ? 'info' : cur.url.startsWith('https:') ? 'lock' : cur.url.startsWith('file:') ? 'file' : 'alert', 13);
    $('.br-lock', b).title = internal ? 'Внутренняя страница' : cur.url.startsWith('https:') ? 'Подключение защищено' : cur.url.startsWith('file:') ? 'Локальный файл' : 'Подключение не защищено';
    $('.br-back', b).disabled = !(cur.mode === 'native' && cur.canBack) && !cur.hist.slice(0, cur.idx).some(x => x !== 'native');
    $('.br-fwd', b).disabled = !(cur.mode === 'native' && cur.canFwd) && cur.idx >= cur.hist.length - 1;
    win.setTitle(cur.title + ' — Браузер');
    updateStar();
    if (cur.loading) startProgress(); else $('.br-progress', b).classList.remove('on');
  }

  function updateStar() {
    if (!cur) return;
    const on = bookmarks().some(x => x.url === cur.url);
    const s = $('.br-star', b);
    s.innerHTML = Icons.ui(on ? 'star-filled' : 'star', 15);
    s.classList.toggle('active', on);
    s.title = on ? 'Удалить из избранного' : 'Добавить в избранное';
  }

  function renderBookmarks() {
    const bar = $('.br-bookmarks', b);
    bar.innerHTML = '';
    bookmarks().slice(0, 12).forEach(bm => {
      const host = hostOf(bm.url);
      const x = h(`<button class="br-bm" title="${esc(bm.url)}">${bm.url.startsWith('about:') ? Icons.get('start', 14) : `<img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32" width="14" height="14" onerror="this.style.display='none'">`}<span>${esc(bm.title)}</span></button>`);
      x.onclick = () => navigate(cur, bm.url);
      x.onauxclick = e => { if (e.button === 1) newTab(bm.url); };
      bar.append(x);
    });
  }

  addr.addEventListener('keydown', e => {
    if (e.key === 'Enter') { navigate(cur, addr.value); addr.blur(); }
    if (e.key === 'Escape') { syncUI(); addr.blur(); }
  });
  addr.addEventListener('focus', () => setTimeout(() => addr.select(), 0));
  $('.br-back', b).onclick = () => back();
  $('.br-fwd', b).onclick = () => fwd();
  $('.br-reload', b).onclick = () => reload();
  $('.br-home', b).onclick = () => navigate(cur, 'about:newtab');
  $('.br-newtab', win.tbExtra).onclick = () => newTab();
  $('.br-ext', b).onclick = () => {
    if (/^https?:/.test(cur.url)) { if (FX.available) FX.call('launchUrl', cur.url); else window.open(cur.url, '_blank', 'noopener'); }
    else UI.alert('Браузер', 'Эту страницу можно открыть только во встроенном браузере.', 'info');
  };
  $('.br-star', b).onclick = async () => {
    const l = bookmarks();
    const i = l.findIndex(x => x.url === cur.url);
    if (i >= 0) { l.splice(i, 1); setBookmarks(l); return; }
    const n = await UI.prompt('Добавить в избранное', 'Название:', cur.title);
    if (n) setBookmarks([...l, { title: n, url: cur.url }]);
  };
  $('.br-menu', b).onclick = e => {
    const r = e.currentTarget.getBoundingClientRect();
    const setZoom = z => { if (cur.mode === 'native') { FX.call('webAction', cur.id, z > zoom ? 'zoomin' : 'zoomout'); return; } zoom = clamp(Math.round(z * 10) / 10, 0.5, 2); $$('.br-frame', b).forEach(f => (f.style.zoom = zoom)); };
    UI.menu(r.right - 260, r.bottom + 4, [
      { label: 'Новая вкладка', icon: 'plus', shortcut: 'Ctrl+T', action: () => newTab() },
      { label: 'Новое окно', icon: 'external', action: () => Apps.launch('browser') },
      { sep: true },
      { label: `Масштаб: ${Math.round(zoom * 100)}%`, icon: 'zoom-in', items: [
        { label: 'Увеличить', icon: 'zoom-in', action: () => setZoom(zoom + 0.1) },
        { label: 'Уменьшить', icon: 'zoom-out', action: () => setZoom(zoom - 0.1) },
        { label: 'Сбросить (100%)', action: () => setZoom(1) },
      ] },
      { label: 'Избранное', icon: 'star', action: () => newTab('about:bookmarks') },
      { label: 'Журнал', icon: 'history', shortcut: 'Ctrl+H', action: () => newTab('about:history') },
      { label: 'Показывать панель избранного', checked: Persist.get('browser.showBar', true), action: () => { Persist.set('browser.showBar', !Persist.get('browser.showBar', true)); $('.br-bookmarks', b).classList.toggle('hidden', !Persist.get('browser.showBar', true)); } },
      { sep: true },
      { label: 'Открыть файл…', icon: 'folder-open', shortcut: 'Ctrl+O', action: openFile },
      { label: 'Сохранить ярлык на рабочий стол', icon: 'desktop', disabled: !/^https?:/.test(cur.url), action: () => { FS.write(FS.P.desktop + '/' + FS.unique(FS.P.desktop, (cur.title || 'Сайт').replace(/[\\/:*?"<>|]/g, '') + '.lnk'), JSON.stringify({ app: 'browser', args: { url: cur.url } })); } },
      { label: 'Версия для ПК (сайты)', icon: 'desktop', checked: !!cur.desktop, disabled: cur.mode !== 'native', action: () => FX.call('webAction', cur.id, 'desktop') },
      { label: 'О WindowsFX', icon: 'info', action: () => newTab('about:windows') },
    ]);
  };
  $('.br-bookmarks', b).classList.toggle('hidden', !Persist.get('browser.showBar', true));

  async function openFile() {
    const p = await UI.filePicker({ mode: 'open', dir: FS.P.docs, kinds: ['html', 'text', 'code', 'image', 'audio', 'video'] });
    if (p) newTab('file:///' + p);
  }

  win.el.addEventListener('keydown', e => {
    if (e.ctrlKey && e.code === 'KeyL') { e.preventDefault(); addr.focus(); }
    else if (e.ctrlKey && e.code === 'KeyT') { e.preventDefault(); newTab(); }
    else if (e.ctrlKey && e.code === 'KeyH') { e.preventDefault(); newTab('about:history'); }
    else if (e.ctrlKey && e.code === 'KeyO') { e.preventDefault(); openFile(); }
    else if (e.key === 'F5') { e.preventDefault(); reload(); }
    else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); fwd(); }
  });

  const offNet = [Store.on('wifi', () => cur && !cur.url.startsWith('about:') && reload()), Store.on('airplane', () => cur && !cur.url.startsWith('about:') && reload())];
  win.onClose = () => { offNet.forEach(f => f()); tabs.forEach(t => t.native && BrowserNative.destroy(t)); };
  win.onBack = () => { if (cur && cur.mode === 'native' && cur.canBack) { back(); return true; } return false; };
  win.onArgs = a => openArgs(a);

  function openArgs(a) {
    if (a.path) return newTab('file:///' + a.path);
    if (a.url) return newTab(a.url);
    if (a.search) return newTab(a.search);
    return newTab();
  }

  const api = {
    win, get cur() { return cur; },
    update(t) { renderTabs(); if (t === cur) syncUI(); },
    newTabFromNative(id) { newTab('', true, { nativeId: id }); },
    progress(t, p) { if (t !== cur) return; const bar = $('.br-progress', b); if (p < 100) { bar.classList.add('on'); $('i', bar).style.width = p + '%'; } else endProgress(); },
  };

  renderBookmarks();
  openArgs(args);
  return win;
}
