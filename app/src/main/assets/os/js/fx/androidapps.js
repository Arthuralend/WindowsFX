/* WindowsFX: установленные Android-приложения в «Пуске», поиске и на панели задач */
'use strict';

const AndroidApps = (() => {
  const em = new Emitter();
  let ids = new Set();

  function launch(a) {
    const inWindow = Store.get('androidWindows') !== false;
    try { FX.call('launch', a.id, inWindow); } catch (e) { UI.alert(a.label, e.message, 'error'); }
    if (inWindow && !Persist.get('fx.freeformChecked', false)) {
      Persist.set('fx.freeformChecked', true);
      const st = FX.tryCall('freeform');
      if (st && !st.supported) setTimeout(() => Apps.launch('settings', { page: 'fx-windows' }), 800);
    }
    return null;
  }

  function load() {
    if (!FX.available) return;
    const list = FX.tryCall('apps') || [];
    const next = new Set();
    list.forEach(a => {
      const id = 'and:' + a.id;
      next.add(id);
      Apps.register({
        id, name: a.label, icon: 'img:' + FX.appIcon(a.id), desc: 'Приложение Android',
        keywords: a.pkg + ' android андроид', android: a,
        launch: () => launch(a),
      });
    });
    ids.forEach(id => { if (!next.has(id)) Apps.unregister(id); });
    ids = next;
    em.emit('change');
  }

  /** Пункты контекстного меню для Android-приложения */
  function menuItems(app) {
    if (!app || !app.android) return [];
    const a = app.android;
    return [
      { sep: true },
      { label: 'О приложении', icon: 'info', action: () => FX.call('appInfo', a.pkg) },
      { label: 'Удалить приложение', icon: 'trash', action: () => FX.call('uninstall', a.pkg) },
    ];
  }

  FX.on('apps', debounce(load, 400));
  return { load, menuItems, on: (e, f) => em.on(e, f), isAndroid: id => String(id).startsWith('and:') };
})();
