/* Реестр приложений */
'use strict';

const Apps = (() => {
  const reg = new Map();
  // Старые идентификаторы (ярлыки и закрепления из прошлых версий)
  const alias = { prism: 'photostore' };
  return {
    register(def) { reg.set(def.id, def); },
    unregister(id) { reg.delete(id); },
    get: id => reg.get(alias[id] || id),
    alias: id => alias[id] || id,
    all: () => [...reg.values()].filter(a => !a.hidden),
    /** Запустить приложение. Для single-приложений повторный запуск фокусирует существующее окно. */
    launch(id, args = {}) {
      id = alias[id] || id;
      const app = reg.get(id);
      if (!app) { UI.alert('Ошибка', `Приложение «${id}» не найдено.`, 'error'); return null; }
      if (app.single) {
        const ex = WM.byApp(id)[0];
        if (ex) { WM.focus(ex); ex.onArgs?.(args); return ex; }
      }
      Shell.closeAll();
      try { return app.launch(args); }
      catch (e) { console.error(e); UI.alert(app.name, 'Не удалось запустить приложение:\n' + e.message, 'error'); return null; }
    },
    search(q) {
      q = q.toLowerCase().trim();
      return this.all().filter(a => a.name.toLowerCase().includes(q) || (a.keywords || '').toLowerCase().includes(q) || a.id.includes(q));
    },
  };
})();

/** Состояние сети: реальное подключение браузера + переключатели Wi-Fi и «В самолёте» */
const Net = {
  online: () => navigator.onLine && Store.get('wifi') && !Store.get('airplane'),
  reason() {
    if (Store.get('airplane')) return 'Включён режим «В самолёте».';
    if (!Store.get('wifi')) return 'Wi-Fi отключён.';
    if (!navigator.onLine) return 'Компьютер не подключён к Интернету.';
    return '';
  },
};

/** Хелпер: экран «нет подключения» */
function offlineScreen(onRetry) {
  const el = h(`<div class="offline-screen">
    ${Icons.ui('wifi-off', 56)}
    <h2>Нет подключения к Интернету</h2>
    <p>${esc(Net.reason())}</p>
    <div class="row-gap">
      <button class="btn primary off-retry">Повторить</button>
      <button class="btn off-settings">Параметры сети</button>
    </div>
  </div>`);
  $('.off-retry', el).onclick = onRetry;
  $('.off-settings', el).onclick = () => Apps.launch('settings', { page: 'network' });
  return el;
}
