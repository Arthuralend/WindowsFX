/* Панель задач */
'use strict';

const Taskbar = (() => {
  const tb = () => document.getElementById('taskbar');
  let order = []; // порядок появления незакреплённых запущенных приложений
  let preview = null, prevT, hideT;

  function build() {
    tb().innerHTML = `
      <div class="tb-widgets">
        <div class="tb-chip" data-flyout="widgets" title="Виджеты">
          <span class="wx-ic">${Icons.ui('widgets', 22)}</span>
          <div class="wx-text"><span class="wx-t">Виджеты</span><span class="wx-d">Погода и новости</span></div>
        </div>
      </div>
      <div class="tb-center">
        <button class="tb-btn tb-start" data-flyout="start" title="Пуск">${Icons.get('start', 26)}</button>
        <button class="tb-btn tb-sys tb-search" data-flyout="start" title="Поиск">${Icons.ui('search', 20)}</button>
        <button class="tb-btn tb-sys tb-tv" title="Представление задач">${Icons.ui('taskview', 21)}</button>
        <div class="tb-apps" style="display:flex;gap:3px"></div>
      </div>
      <div class="tb-right">
        <div class="tb-btn tb-sys tb-up" title="Отображать скрытые значки" style="width:30px">${Icons.ui('chevron-up', 14)}</div>
        <div class="tb-lang" title="Язык ввода (Alt+Shift)"></div>
        <div class="tb-tray" data-flyout="quick" title="Сеть, звук, батарея"></div>
        <div class="tb-clock" data-flyout="notif"><div class="tb-ck"><span class="ck-t"></span><span class="ck-d"></span></div><span class="tb-bell">${Icons.ui('bell', 16)}<span class="badge hidden"></span></span></div>
        <div class="tb-show-desktop" title="Свернуть все окна"></div>
      </div>`;
    const t = tb();
    $('.tb-start', t).onclick = () => Shell.toggle('start');
    $('.tb-search', t).onclick = () => Shell.open('start', { search: true });
    $('.tb-tv', t).onclick = () => TaskView.toggle();
    $('.tb-chip', t).onclick = () => Shell.toggle('widgets');
    $('.tb-tray', t).onclick = () => Shell.toggle('quick');
    $('.tb-clock', t).onclick = () => Shell.toggle('notif');
    $('.tb-show-desktop', t).onclick = () => { Shell.closeAll(); WM.toggleDesktop(); };
    $('.tb-up', t).onclick = e => {
      const r = e.currentTarget.getBoundingClientRect();
      UI.menu(r.left - 90, r.top - 8, [
        { header: 'Скрытые значки' },
        { label: 'Безопасность Windows', icon: 'shield', action: () => UI.alert('Безопасность Windows', 'Угроз не обнаружено.\nПоследняя проверка: ' + fmtDateTime(Date.now() - 3600e3), 'info') },
        { label: 'Диспетчер задач', icon: 'app:taskmgr', action: () => Apps.launch('taskmgr') },
        { label: 'Часы и будильники', icon: 'app:clock', action: () => Apps.launch('clock') },
      ], { above: true });
    };
    const langEl = $('.tb-lang', t);
    const showLang = () => { const l = Kbd.LANGS[Kbd.current()]; langEl.textContent = l.short; langEl.title = l.name + '\nКлавиатура: ' + l.kb + '\nПереключение: Alt+Shift или Win+Пробел'; };
    showLang();
    Kbd.on('change', showLang);
    langEl.onclick = e => {
      const r = e.currentTarget.getBoundingClientRect();
      UI.menu(r.left - 160, r.top - 8, [
        { header: 'Язык ввода' },
        ...Kbd.list().map(l => ({ label: Kbd.LANGS[l].short + '   ' + Kbd.LANGS[l].name, checked: l === Kbd.current(), action: () => Kbd.set(l) })),
        { sep: true },
        { label: 'Языковые параметры', icon: 'lang', action: () => Apps.launch('settings', { page: 'time' }) },
      ], { above: true });
    };

    t.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (e.target.closest('.tb-btn[data-app]')) return;
      UI.menu(e.clientX, e.clientY, [
        { label: 'Диспетчер задач', icon: 'app:taskmgr', action: () => Apps.launch('taskmgr') },
        { label: 'Показать рабочий стол', icon: 'desktop', action: () => WM.toggleDesktop() },
        { sep: true },
        { label: 'Параметры панели задач', icon: 'gear', action: () => Apps.launch('settings', { page: 'taskbar' }) },
      ], { above: true });
    });

    // Автоскрытие
    const hot = h('<div class="tb-hot"></div>');
    document.getElementById('os').append(hot);
    hot.addEventListener('mouseenter', () => t.classList.add('peek'));
    t.addEventListener('mouseleave', () => { if (!Shell.anyOpen()) t.classList.remove('peek'); });
    Shell.on('change', () => { if (Shell.anyOpen()) t.classList.add('peek'); else if (!t.matches(':hover')) t.classList.remove('peek'); });
  }

  function applySettings() {
    const t = tb();
    t.classList.toggle('left', Store.get('taskbarAlign') === 'left');
    document.getElementById('start-menu').classList.toggle('left', Store.get('taskbarAlign') === 'left');
    $('.tb-chip', t).style.display = Store.get('showWidgetsBtn') ? '' : 'none';
    $('.tb-search', t).style.display = Store.get('showSearchBtn') ? '' : 'none';
    $('.tb-tv', t).style.display = Store.get('showTaskViewBtn') ? '' : 'none';
    document.documentElement.classList.toggle('tb-autohide', !!Store.get('taskbarAutoHide'));
    updateClock();
  }

  // ---------------- Кнопки приложений ----------------
  function appIds() {
    const pinned = Store.get('pinned').filter(id => Apps.get(id));
    const running = [...new Set(WM.list().map(w => w.app))];
    running.forEach(a => { if (!order.includes(a)) order.push(a); });
    order = order.filter(a => running.includes(a));
    return [...pinned, ...order.filter(a => !pinned.includes(a))];
  }

  function renderApps() {
    const box = $('.tb-apps', tb());
    if (!box) return;
    const active = WM.active();
    const ids = appIds();
    const existing = new Map($$('.tb-btn[data-app]', box).map(b => [b.dataset.app, b]));
    const frag = [];
    ids.forEach(id => {
      const app = Apps.get(id);
      let b = existing.get(id);
      if (!b) {
        b = h(`<button class="tb-btn" data-app="${id}" title="${esc(app.name)}">${Icons.get(app.icon, 26)}</button>`);
        bindAppBtn(b, id);
      }
      existing.delete(id);
      const wins = WM.byApp(id).filter(w => w.desktop === WM.desktops.current());
      const allWins = WM.byApp(id);
      b.classList.toggle('running', allWins.length > 0);
      b.classList.toggle('active', !!active && active.app === id);
      b.draggable = Store.get('pinned').includes(id);
      b.title = wins.length ? `${app.name} — ${wins.length} ${plural(wins.length, 'окно', 'окна', 'окон')}` : app.name;
      frag.push(b);
    });
    existing.forEach(b => b.remove());
    frag.forEach((b, i) => { if (box.children[i] !== b) box.insertBefore(b, box.children[i] || null); });
  }

  function bindAppBtn(b, id) {
    b.addEventListener('click', () => {
      hidePreview(true);
      const wins = WM.byApp(id).filter(w => w.desktop === WM.desktops.current());
      if (!wins.length) {
        b.classList.add('launching');
        setTimeout(() => b.classList.remove('launching'), 500);
        Apps.launch(id);
        return;
      }
      if (wins.length === 1) {
        const w = wins[0];
        if (w.isActive() && !w.minimized) WM.minimize(w); else WM.focus(w);
        return;
      }
      showPreview(b, id, true);
    });
    b.addEventListener('auxclick', e => { if (e.button === 1) Apps.launch(id); });
    b.addEventListener('mouseenter', () => {
      clearTimeout(hideT);
      if (!WM.byApp(id).length) return;
      clearTimeout(prevT);
      prevT = setTimeout(() => showPreview(b, id), preview ? 0 : 450);
    });
    b.addEventListener('mouseleave', () => { clearTimeout(prevT); hideT = setTimeout(hidePreview, 250); });
    b.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      hidePreview(true);
      jumpList(b, id);
    });
    // Перестановка закреплённых
    b.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-w12-app', id); e.dataTransfer.effectAllowed = 'move'; hidePreview(true); });
    b.addEventListener('dragover', e => {
      if ([...e.dataTransfer.types].includes('text/x-w12-app')) { e.preventDefault(); b.classList.add('dragover'); }
    });
    b.addEventListener('dragleave', () => b.classList.remove('dragover'));
    b.addEventListener('drop', e => {
      b.classList.remove('dragover');
      const from = e.dataTransfer.getData('text/x-w12-app');
      if (!from || from === id) return;
      e.preventDefault();
      Store.update('pinned', p => {
        const fi = p.indexOf(from);
        if (fi < 0) return;
        p.splice(fi, 1);
        const ti = p.indexOf(id);
        p.splice(ti < 0 ? p.length : ti, 0, from);
      });
    });
  }

  function jumpList(b, id) {
    const app = Apps.get(id);
    const wins = WM.byApp(id);
    const pinned = Store.get('pinned').includes(id);
    const recent = FileOps.recent().filter(r => FileOps.appFor(r.path) === id).slice(0, 5);
    const r = b.getBoundingClientRect();
    UI.menu(r.left, r.top - 8, [
      recent.length ? { header: 'Последние' } : null,
      ...recent.map(x => ({ label: FS.basename(x.path), icon: 'app:' + FS.typeOf(x.path).icon, action: () => FileOps.open(x.path) })),
      recent.length ? { sep: true } : null,
      { label: app.name, icon: 'app:' + app.icon, action: () => Apps.launch(id) },
      { label: pinned ? 'Открепить от панели задач' : 'Закрепить на панели задач', icon: pinned ? 'unpin' : 'pin', action: () => togglePin(id) },
      wins.length ? { label: wins.length > 1 ? 'Закрыть все окна' : 'Закрыть окно', icon: 'close', action: () => wins.forEach(w => w.close()) } : null,
    ], { above: true });
  }

  function togglePin(id) {
    Store.update('pinned', p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  }

  // ---------------- Превью окон ----------------
  /** Создаёт уменьшенную копию окна */
  function thumb(win, W, H) {
    const box = h('<div class="thumb-wrap" style="position:absolute;inset:0"></div>');
    try {
      const src = win.el;
      const bw = src.offsetWidth || win.bounds.w, bh = src.offsetHeight || win.bounds.h;
      if (!bw || win.minimized) throw 0;
      const clone = src.cloneNode(true);
      clone.classList.remove('active', 'minimizing', 'min', 'other-desk', 'opening', 'anim');
      Object.assign(clone.style, { left: 0, top: 0, position: 'absolute', width: bw + 'px', height: bh + 'px', transform: 'none', opacity: 1, boxShadow: 'none', zIndex: 0 });
      const oc = $$('canvas', src), cc = $$('canvas', clone);
      cc.forEach((c, i) => { try { const img = new Image(); img.src = oc[i].toDataURL(); img.style.cssText = c.style.cssText; img.className = c.className; img.width = oc[i].width; img.height = oc[i].height; c.replaceWith(img); } catch { } });
      const ot = $$('textarea', src), ct = $$('textarea', clone);
      ct.forEach((t, i) => { t.textContent = ot[i].value; t.scrollTop = ot[i].scrollTop; });
      $$('iframe, video, audio', clone).forEach(f => f.replaceWith(h(`<div style="${f.style.cssText};flex:1;display:grid;place-items:center;background:var(--surface-2)">${Icons.ui('globe', 48)}</div>`)));
      $$('[id]', clone).forEach(x => x.removeAttribute('id'));
      const k = Math.min(W / bw, H / bh);
      const wrap = h('<div class="thumb-scale"></div>');
      Object.assign(wrap.style, { width: bw + 'px', height: bh + 'px', transform: `scale(${k})`, left: (W - bw * k) / 2 + 'px', top: (H - bh * k) / 2 + 'px' });
      wrap.append(clone);
      box.append(wrap);
    } catch {
      box.innerHTML = `<div class="thumb-fallback" style="position:absolute;inset:0;display:grid;place-items:center">${Icons.get(win.icon, 48)}</div>`;
    }
    return box;
  }

  function showPreview(btn, id, sticky = false) {
    hidePreview(true);
    const wins = WM.byApp(id).filter(w => w.desktop === WM.desktops.current());
    if (!wins.length) return;
    const p = h('<div class="tb-preview glass"></div>');
    wins.forEach(w => {
      const it = h(`<div class="tbp-item ${w.isActive() ? 'active' : ''}">
        <div class="tbp-head">${Icons.get(w.icon, 16)}<span>${esc(w.title)}</span><button class="icon-btn" title="Закрыть">${Icons.ui('close', 12)}</button></div>
        <div class="tbp-thumb"></div>
      </div>`);
      $('.tbp-thumb', it).append(thumb(w, 184, 110));
      it.onclick = () => { hidePreview(true); WM.focus(w); };
      $('.icon-btn', it).onclick = async e => { e.stopPropagation(); await w.close(); hidePreview(true); };
      it.addEventListener('mouseenter', () => { wins.forEach(x => x !== w && !x.minimized && (x.el.style.opacity = '.15')); });
      it.addEventListener('mouseleave', () => { wins.forEach(x => (x.el.style.opacity = '')); });
      p.append(it);
    });
    p.addEventListener('mouseenter', () => clearTimeout(hideT));
    p.addEventListener('mouseleave', () => { hideT = setTimeout(hidePreview, 250); });
    document.getElementById('overlay-layer').append(p);
    const r = btn.getBoundingClientRect();
    const pr = p.getBoundingClientRect();
    p.style.left = clamp(r.left + r.width / 2 - pr.width / 2, 8, innerWidth - pr.width - 8) + 'px';
    p.style.top = (r.top - pr.height - 12) + 'px';
    requestAnimationFrame(() => p.classList.add('show'));
    preview = p;
  }

  function hidePreview(now) {
    clearTimeout(hideT);
    if (!preview) return;
    const p = preview;
    preview = null;
    WM.list().forEach(w => (w.el.style.opacity = ''));
    if (now === true) p.remove(); else { p.classList.remove('show'); setTimeout(() => p.remove(), 160); }
  }

  // ---------------- Трей и часы ----------------
  function renderTray() {
    const tray = $('.tb-tray', tb());
    if (!tray) return;
    const net = Store.get('airplane') ? 'airplane' : (Store.get('wifi') && navigator.onLine ? 'wifi' : 'wifi-off');
    const vol = Store.get('muted') || Store.get('volume') === 0 ? 'volume-mute' : Store.get('volume') < 40 ? 'volume-low' : 'volume';
    const b = Battery.state;
    tray.innerHTML = Icons.ui(net, 17) + Icons.ui(vol, 17) + Icons.battery(b.level, b.charging, 18);
    tray.title = `${Store.get('airplane') ? 'Режим «В самолёте»' : Store.get('wifi') ? (navigator.onLine ? 'Wi-Fi: подключено, доступ к Интернету' : 'Wi-Fi: нет доступа к Интернету') : 'Wi-Fi отключён'}\nГромкость: ${Store.get('muted') ? 'выкл.' : Store.get('volume') + '%'}\nБатарея: ${Math.round(b.level * 100)}%${b.charging ? ' (заряжается)' : ''}`;
  }

  function updateClock() {
    const t = $('.ck-t', tb());
    if (!t) return;
    const now = Date.now();
    t.textContent = fmtTime(now, Store.get('showSeconds'));
    $('.ck-d', tb()).textContent = fmtDate(now);
    $('.tb-clock', tb()).title = cap(fmtDateLong(now));
  }

  function updateBadge() {
    const n = UI.Notifications.list().length;
    const b = $('.tb-bell .badge', tb());
    if (!b) return;
    b.textContent = n > 9 ? '9+' : n;
    b.classList.toggle('hidden', !n);
    $('.tb-bell', tb()).innerHTML = Icons.ui(Store.get('dnd') ? 'bell-off' : 'bell', 16) + b.outerHTML;
  }

  function updateWeather() {
    const d = Weather.cached();
    const chip = $('.tb-chip', tb());
    if (!chip) return;
    if (d && d.current) {
      $('.wx-ic', chip).innerHTML = Weather.icon(d.current.code, d.current.isDay, 28);
      $('.wx-t', chip).textContent = Weather.temp(d.current.temp) + (Store.get('weatherUnits') === 'F' ? 'F' : 'C');
      $('.wx-d', chip).textContent = Weather.desc(d.current.code);
    }
  }

  function init() {
    build();
    applySettings();
    renderApps();
    renderTray();
    updateBadge();
    updateWeather();
    WM.on('change', renderApps);
    WM.on('desktops', renderApps);
    ['pinned'].forEach(k => Store.on(k, renderApps));
    ['taskbarAlign', 'showWidgetsBtn', 'showSearchBtn', 'showTaskViewBtn', 'taskbarAutoHide', 'showSeconds', 'clock24'].forEach(k => Store.on(k, applySettings));
    ['wifi', 'airplane', 'volume', 'muted'].forEach(k => Store.on(k, renderTray));
    Store.on('dnd', updateBadge);
    Store.on('weatherUnits', updateWeather);
    Battery.on('change', renderTray);
    addEventListener('online', renderTray);
    addEventListener('offline', renderTray);
    UI.Notifications.on('change', updateBadge);
    Weather.on('update', updateWeather);
    Shell.on('change', (name, open) => {
      const map = { start: '.tb-start', quick: '.tb-tray', notif: '.tb-clock', widgets: '.tb-chip' };
      if (map[name]) $(map[name], tb())?.classList.toggle('open', open);
    });
    setInterval(updateClock, 1000);
    Weather.load().catch(() => {});
  }

  return {
    init, togglePin, thumb, renderApps,
    buttonRect(app) { const b = $(`.tb-btn[data-app="${app}"]`, tb()); return b ? b.getBoundingClientRect() : null; },
    isPinned: id => Store.get('pinned').includes(id),
  };
})();
