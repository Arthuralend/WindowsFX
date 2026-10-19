/* Хранилище системных настроек (сохраняются в localStorage) */
'use strict';

const Store = (() => {
  const KEY = 'w12.settings';
  const defaults = {
    // Персонализация
    theme: 'dark',              // dark | light | auto
    accent: '#7c6cff',
    accentAuto: false,
    wallpaper: 'fx',
    customWallpaper: null,
    transparency: true,
    animations: true,
    accentTitlebars: false,
    // Панель задач
    taskbarAlign: 'center',     // center | left
    taskbarAutoHide: false,
    showWidgetsBtn: true,
    showSearchBtn: true,
    showTaskViewBtn: true,
    showSeconds: false,
    pinned: ['explorer', 'browser', 'lexicon', 'tabs', 'photos', 'settings'],
    // Пуск
    startPinned: ['explorer', 'browser', 'lexicon', 'tabs', 'prism', 'pdf', 'photos', 'settings', 'notepad', 'calculator', 'paint', 'terminal', 'music', 'clock', 'calendar', 'weather', 'taskmgr', 'camera', 'assistant', 'minesweeper', 'game2048', 'doom'],
    showRecommended: true,
    // Рабочий стол
    desktopIcons: true,
    desktopIconSize: 'medium',   // small | medium | large
    desktopSort: 'none',
    iconPositions: {},
    showExtensions: false,
    showHidden: false,
    explorerView: 'grid',
    // Учётная запись
    userName: 'Пользователь',
    avatar: null,
    avatarColor: '#7a5cff',
    password: '',
    lockOnStart: false,
    lockTimeout: 0,
    // Система
    deviceName: 'WINDOWSFX',
    brightness: 100,
    nightLight: false,
    nightLightStrength: 40,
    textScale: 100,
    highContrast: false,
    volume: 70,
    muted: false,
    sounds: true,
    dnd: false,
    toasts: true,
    wifi: true,
    bluetooth: true,
    airplane: false,
    batterySaver: false,
    clock24: true,
    weatherCity: 'Москва',
    weatherUnits: 'C',
    startupApps: [],
    defaultApps: { text: 'notepad', image: 'photos', audio: 'music', html: 'browser', pdf: 'pdf', doc: 'lexicon', sheet: 'tabs', psd: 'prism' },
    androidWindows: true,
    immersive: true,
    uiScale: 100,
    lastUpdateCheck: 0,
    firstRun: true,
    btDevices: [
      { name: 'Наушники Aurora Buds', type: 'audio', connected: true },
      { name: 'Мышь Nova Mouse', type: 'mouse', connected: true },
      { name: 'Клавиатура Keys Pro', type: 'keyboard', connected: false },
    ],
  };

  let data;
  try { data = { ...defaults, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; }
  catch { data = { ...defaults }; }

  const em = new Emitter();
  let frozen = false;
  const save = debounce(() => {
    if (frozen) return;
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) {
      // Скорее всего, слишком большие пользовательские обои
      console.warn(e);
      if (data.customWallpaper) {
        data.customWallpaper = null;
        if (data.wallpaper === 'custom') data.wallpaper = 'bloom';
        try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
        typeof UI !== 'undefined' && UI.notify({ title: 'Не удалось сохранить обои', body: 'Изображение слишком большое для хранилища браузера.', icon: 'settings' });
      }
    }
  }, 150);

  return {
    defaults,
    get(k) { return data[k]; },
    set(k, v) {
      if (typeof v !== 'object' && data[k] === v) return;
      data[k] = v;
      save();
      em.emit(k, v);
      em.emit('*', k, v);
    },
    /** Изменить объект/массив по месту и уведомить подписчиков */
    update(k, fn) {
      const v = structuredClone(data[k]);
      const r = fn(v);
      this.set(k, r === undefined ? v : r);
    },
    on(k, fn) { return em.on(k, fn); },
    all() { return { ...data }; },
    flush() { if (frozen) return; try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} },
    resetAll() {
      frozen = true;
      typeof FS !== 'undefined' && FS.freeze();
      Object.keys(localStorage).filter(k => k.startsWith('w12.')).forEach(k => localStorage.removeItem(k));
    },
  };
})();
