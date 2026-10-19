/* WindowsFX: данные приложений (Напоминания, Дела…) — сохраняются при каждом изменении
   в хранилище WindowsFX и копией в памяти устройства: <внутренняя память>/.WindowsFX/data/<имя>.json.
   Если данные WebView очищены, копия с устройства восстанавливается автоматически. */
'use strict';

const AppData = (() => {
  const timers = {};
  function dir() {
    try {
      const devs = Object.keys(FS.devices() || {});
      return devs.length ? FS.toNative(devs[0]) + '/.WindowsFX/data' : null;
    } catch { return null; }
  }
  function load(name, def) {
    let v = Persist.get('app.' + name, null);
    if (v == null && FX.available) {
      const d = dir();
      const t = d && FX.tryCall('readText', d + '/' + name + '.json', 20e6);
      if (t) { try { v = JSON.parse(t); Persist.set('app.' + name, v); } catch {} }
    }
    return v ?? (typeof def === 'function' ? def() : def);
  }
  function save(name, v) {
    Persist.set('app.' + name, v);
    clearTimeout(timers[name]);
    timers[name] = setTimeout(() => backup(name, v), 1200);
  }
  function backup(name, v) {
    const d = dir();
    if (d && FX.available && FX.tryCall('hasAccess')) FX.tryCall('writeText', d + '/' + name + '.json', JSON.stringify(v));
  }
  /** Путь к копии на устройстве (для «Экспорт» и сведений) */
  const backupPath = name => { const d = dir(); return d ? FS.fromNative(d + '/' + name + '.json') : null; };
  return { load, save, backupPath, flush: name => backup(name, Persist.get('app.' + name, null)) };
})();
