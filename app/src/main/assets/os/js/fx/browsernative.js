/* WindowsFX: вкладки браузера на движке Chromium (Android WebView), наложенные на окно браузера */
'use strict';

const BrowserNative = (() => {
  const tabs = new Map(); // id -> { t, api, shown, rect }
  let raf = null;

  function register(t, api) {
    tabs.set(t.id, { t, api, shown: false, rect: '' });
    loop();
  }
  function destroy(t) {
    if (!tabs.has(t.id)) return;
    tabs.delete(t.id);
    FX.tryCall('webDestroy', t.id);
  }

  /** Перекрыто ли окно чем-то из оболочки (меню, диалоги, «Пуск», блокировка) */
  function shellCovers() {
    if (Shell.anyOpen()) return true;
    if (document.querySelector('.ctx-menu, .dlg-backdrop, .snap-flyout.show')) return true;
    if (typeof TaskView !== 'undefined' && TaskView.isOpen()) return true;
    if (typeof Power !== 'undefined' && Power.isLocked()) return true;
    if (document.body.classList.contains('wm-busy')) return true;
    const ps = document.getElementById('power-screen');
    return !!(ps && ps.classList.contains('show'));
  }

  function tick() {
    raf = null;
    if (!tabs.size) return;
    const covered = shellCovers();
    const active = WM.active();
    const dpr = window.devicePixelRatio || 1;
    tabs.forEach((e, id) => {
      const { t, api } = e;
      const w = api.win;
      let show = !covered && t.mode === 'native' && api.cur === t && w === active && !w.minimized && w.el.isConnected &&
        !w.el.classList.contains('other-desk') && !w.el.classList.contains('minimizing');
      let rect = '';
      if (show) {
        const host = t.view.querySelector('.br-native') || t.view;
        const r = host.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) show = false;
        else rect = [Math.round(r.left * dpr), Math.round(r.top * dpr), Math.round(r.width * dpr), Math.round(r.height * dpr)].join(',');
      }
      if (show !== e.shown || rect !== e.rect) {
        if (e.shown && !show) FX.tryCall('webSnapshot', id); // картинка вкладки на время, пока она скрыта
        const [x, y, ww, hh] = rect ? rect.split(',').map(Number) : [0, 0, 0, 0];
        FX.tryCall('webBounds', id, x, y, ww, hh, show);
        e.shown = show;
        e.rect = rect;
      }
    });
    loop();
  }
  function loop() { if (!raf && tabs.size) raf = requestAnimationFrame(tick); }

  FX.on('web', ev => {
    const e = tabs.get(ev.id);
    if (!e) return;
    const { t, api } = e;
    switch (ev.type) {
      case 'start': t.loading = true; t.url = ev.url; t.icon = null; break;
      case 'finish': t.loading = false; t.url = ev.url; if (ev.title) t.title = ev.title; api.progress(t, 100); break;
      case 'progress': api.progress(t, ev.p); if (ev.p >= 100) t.loading = false; break;
      case 'title': t.title = ev.title || t.title; break;
      case 'url': t.url = ev.url; break;
      case 'nav': t.canBack = ev.back; t.canFwd = ev.fwd; if (ev.url) t.url = ev.url; break;
      case 'icon': t.icon = ev.icon; break;
      case 'desktop': t.desktop = ev.on; break;
      case 'snapshot': { const img = t.view.querySelector('.br-snap'); if (img) img.src = ev.img; return; }
      case 'newtab': api.newTabFromNative(ev.newId); return;
      case 'download': UI.notify({ title: 'Загрузка начата', body: ev.name + ' → Загрузки', icon: 'download', onClick: () => Apps.launch('explorer', { path: FS.P.downloads }) }); return;
      case 'toast': FX.emit('toast', { msg: ev.msg }); return;
    }
    api.update(t);
  });

  // свернули приложение / открыли диалог — пересчитать сразу
  FX.on('resume', loop);
  return { register, destroy, sync: loop };
})();
