/* WindowsFX: связь веб-рабочего стола с Android (window.FXNative) */
'use strict';

const FX = (() => {
  const N = window.FXNative || null;
  const em = new Emitter();
  const ERR = {
    EACCES: 'Нет доступа к памяти устройства. Разрешите WindowsFX «Доступ ко всем файлам».',
    ENOENT: 'Файл или папка не найдены.',
    EEXIST: 'Элемент с таким именем уже существует.',
    EFBIG: 'Файл слишком большой для этой операции.',
    EISDIR: 'Это папка.',
    EINVAL: 'Невозможно переместить папку в саму себя.',
    EIO: 'Не удалось выполнить операцию с файлом.',
    ENOSPC: 'Недостаточно места на диске.',
    ENOSYS: 'Эта функция недоступна в браузере.',
  };

  /** Синхронный вызов Android. Бросает Error с полем code при ошибке. */
  function call(name, ...args) {
    if (!N || typeof N[name] !== 'function') { const e = new Error(N && N.__web ? 'Эта функция недоступна в браузере.' : 'Функция доступна только в приложении WindowsFX для Android.'); e.code = 'ENOSYS'; throw e; }
    const raw = N[name](...args);
    const r = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (r && r.err) { const e = new Error(ERR[r.err] || r.msg || r.err); e.code = r.err; e.detail = r.msg; throw e; }
    return r ? r.ok : null;
  }
  function tryCall(name, ...args) { try { return call(name, ...args); } catch { return null; } }

  const encPath = p => p.split('/').map(encodeURIComponent).join('/');

  // События от Android: FXHost.emit(name, data)
  window.FXHost = {
    emit(name, data) { em.emit(name, data); },
    /** Кнопка «Назад» Android */
    back() {
      try {
        if (document.querySelector('.ctx-menu')) { UI.closeMenus(); return true; }
        const dlg = document.querySelector('.dlg-backdrop .dlg-x, .dlg-backdrop .pk-cancel');
        if (dlg) { dlg.click(); return true; }
        if (typeof TaskView !== 'undefined' && TaskView.isOpen()) { TaskView.hide(); return true; }
        if (Shell.anyOpen()) { Shell.closeAll(); return true; }
        const w = WM.active();
        if (w) {
          if (w.onBack && w.onBack()) return true;
          WM.minimize(w);
          return true;
        }
      } catch (e) { console.error(e); }
      return false;
    },
  };

  em.on('home', () => {
    if (typeof Power !== 'undefined' && Power.isLocked()) return;
    if (Shell.anyOpen()) Shell.closeAll(); else Shell.toggle('start');
  });
  em.on('startkey', () => Shell.toggle('start'));
  em.on('toast', d => {
    const msgs = { 'no-app': 'Нет приложения для открытия этого файла.', 'download-unsupported': 'Эту загрузку нельзя сохранить из браузера.', 'download-failed': 'Не удалось начать загрузку.' };
    UI.notify({ title: msgs[d.msg] || d.msg, icon: 'info', transient: true, silent: true });
  });
  em.on('openurl', d => Apps.launch('browser', { url: d.url }));

  return {
    available: !!N,
    /** Рабочий стол открыт на сайте (Monomach), а не в приложении Android */
    web: !!(N && N.__web),
    /** Есть ли у хоста функция */
    has: name => !!(N && typeof N[name] === 'function'),
    call, tryCall,
    on: (e, f) => em.on(e, f),
    emit: (e, d) => em.emit(e, d),
    /** URL файла устройства для <img>, <audio>, <video>, fetch */
    url: nativePath => '/fs' + encPath(nativePath),
    thumb: (nativePath, size = 256) => '/thumb' + encPath(nativePath) + '?s=' + size,
    appIcon: id => '/appicon/' + encodeURIComponent(id),
    info: () => tryCall('info') || {},
  };
})();
