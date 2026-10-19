/* Lexicon, Tabs, Photostore: офисные и графические приложения на WebAssembly в окнах WindowsFX.
   Движки — открытый код (MIT OR Apache-2.0), собираются с изменениями WindowsFX (tools/craft-patch.sh). */
'use strict';

const CraftApps = {
  lexicon: {
    name: 'Lexicon', icon: 'lexicon', engine: 'WordCraft', desc: 'Текстовый редактор, аналог Word',
    keywords: 'word ворд документ текст docx редактор wordcraft lexicon', kinds: ['doc', 'text'], exts: ['docx', 'doc', 'odt', 'rtf', 'txt', 'md', 'html'],
    defExt: 'docx', dir: () => FS.P.docs, width: 1100, height: 760,
  },
  tabs: {
    name: 'Tabs', icon: 'tabs', engine: 'GridCraft', desc: 'Электронные таблицы, аналог Excel',
    keywords: 'excel эксель таблица xlsx csv gridcraft tabs', kinds: ['sheet'], exts: ['xlsx', 'xls', 'ods', 'csv'],
    defExt: 'xlsx', dir: () => FS.P.docs, width: 1160, height: 760,
  },
  photostore: {
    name: 'Photostore', icon: 'photostore', engine: 'PhotoCraft', desc: 'Графический редактор, аналог Photoshop',
    keywords: 'photoshop фотошоп фото редактор слои psd ps photostore prism', kinds: ['image', 'psd'], exts: ['psd', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff'],
    defExt: 'png', dir: () => FS.P.pictures, width: 1200, height: 800,
  },
};

const CraftHost = (() => {
  const frames = new Map();   // frame window -> { appId, win, pending, lastDir }
  const lastDir = {};

  const entry = w => frames.get(w);
  const findByApp = appId => [...frames.values()].find(e => e.appId === appId && e.win.isActive()) || [...frames.values()].find(e => e.appId === appId);

  function blobToDataURL(blob) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  }

  async function fileFor(path) {
    const res = await fetch(FS.url(path));
    const blob = await res.blob();
    return new File([blob], FS.basename(path), { type: blob.type || '', lastModified: FS.get(path)?.mt || Date.now() });
  }

  function kindsForAccept(appId, accept) {
    if (!accept) return null;
    const exts = accept.split(',').map(s => s.trim().toLowerCase()).filter(s => s.startsWith('.')).map(s => s.slice(1));
    if (exts.some(e => ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(e)) && appId !== 'photostore') return ['image'];
    return null;
  }

  return {
    ready(appId, w) {
      const e = entry(w);
      if (!e) return;
      e.ready = true;
      e.win.body.querySelector('.fx-loading')?.remove();
      if (e.pending) { const p = e.pending; e.pending = null; this.openInto(e, p); }
    },
    async openInto(e, path) {
      try {
        const f = await fileFor(path);
        e.frame.contentWindow.CraftGuest?.dropFile(f);
        e.path = path;
        e.win.setTitle(FS.basename(path) + ' — ' + CraftApps[e.appId].name);
        FileOps.addRecent(path);
      } catch (err) { UI.alert(CraftApps[e.appId].name, 'Не удалось открыть файл: ' + err.message, 'error'); }
    },
    async pickSave(appId, name, types) {
      const def = CraftApps[appId];
      const e = findByApp(appId);
      if (e) WM.focus(e.win);
      const ext = FS.ext(name) || def.defExt;
      const dir = lastDir[appId] || (e?.path && FS.parent(e.path)) || def.dir();
      const p = await UI.filePicker({ mode: 'save', dir, name: FS.ext(name) ? name : name + '.' + ext, ext, title: def.name + ': сохранить как', typeLabel: ext.toUpperCase() + ' (*.' + ext + ')' });
      if (p) lastDir[appId] = FS.parent(p);
      return p;
    },
    async save(appId, path, blob) {
      try {
        const data = await blobToDataURL(blob);
        FS.write(path, data);
        const e = findByApp(appId);
        if (e) { e.path = path; e.win.setTitle(FS.basename(path) + ' — ' + CraftApps[appId].name); }
        FileOps.addRecent(path);
        UI.notify({ title: 'Сохранено', body: FS.display(path), icon: CraftApps[appId].icon, transient: true, silent: true });
      } catch (err) {
        UI.alert(CraftApps[appId].name, 'Не удалось сохранить файл:\n' + err.message, 'error');
        throw err;
      }
    },
    async saveDownload(appId, name, blob) {
      const p = await this.pickSave(appId, name, []);
      if (p) await this.save(appId, p, blob);
    },
    async pickOpen(appId, accept, multiple) {
      const def = CraftApps[appId];
      const e = findByApp(appId);
      if (e) WM.focus(e.win);
      const kinds = kindsForAccept(appId, accept) || def.kinds;
      const p = await UI.filePicker({ mode: 'open', dir: lastDir[appId] || def.dir(), kinds, title: def.name + ': открыть', typeLabel: 'Поддерживаемые файлы' });
      if (!p) return null;
      lastDir[appId] = FS.parent(p);
      if (e && kinds === def.kinds) { e.path = p; e.win.setTitle(FS.basename(p) + ' — ' + def.name); FileOps.addRecent(p); }
      return [await fileFor(p)];
    },
    fileFor,
    register(w, data) { frames.set(w, data); },
    unregister(w) { frames.delete(w); },
  };
})();

function openCraft(appId, args = {}) {
  const def = CraftApps[appId];
  const win = WM.open({ app: appId, title: def.name, width: def.width, height: def.height, minWidth: 420, minHeight: 320, bodyClass: 'fx-fill',
    beforeClose: () => UI.confirm(def.name, `Закрыть ${def.name}? Несохранённые изменения будут потеряны.`) });
  const b = win.body;
  b.innerHTML = `<div class="fx-loading">${Icons.get(def.icon, 64)}<div>Запуск ${esc(def.name)}…</div></div>`;
  const frame = h(`<iframe class="fx-frame" allow="clipboard-read; clipboard-write; fullscreen" allowfullscreen></iframe>`);
  const e = { appId, win, frame, pending: args.path || null, path: null, ready: false };
  frame.addEventListener('load', () => {
    try { CraftHost.register(frame.contentWindow, e); } catch {}
    // название документа из заголовка страницы движка
    clearInterval(e.titleT);
    e.titleT = setInterval(() => {
      try {
        const t = frame.contentDocument?.title || '';
        if (!e.path && t && !/^(WordCraft|GridCraft|PhotoCraft|Lexicon|Tabs|Photostore)$/i.test(t)) win.setTitle(t.replace(/(WordCraft|GridCraft|PhotoCraft|Lexicon|Tabs|Photostore)/g, def.name));
      } catch {}
    }, 2000);
  });
  fetch(`../craft/${appId}/index.html`, { method: 'HEAD' }).then(r => {
    if (!r.ok) throw new Error('missing');
    frame.src = `../craft/${appId}/index.html`;
    b.append(frame);
  }).catch(() => {
    b.innerHTML = `<div class="fx-access">${Icons.get(def.icon, 64)}<h2>${esc(def.name)} ещё не установлен</h2><p>Приложение не вошло в эту сборку WindowsFX. Оно будет добавлено в следующей версии.</p></div>`;
  });
  win.onArgs = a => { if (a.path) { if (e.ready) CraftHost.openInto(e, a.path); else e.pending = a.path; } };
  win.onClose = () => { clearInterval(e.titleT); try { CraftHost.unregister(frame.contentWindow); } catch {} };
  return win;
}

Object.entries(CraftApps).forEach(([id, def]) => Apps.register({
  id, name: def.name, icon: def.icon, desc: def.desc, keywords: def.keywords,
  launch: args => openCraft(id, args),
}));
window.CraftHost = CraftHost;

// Клавиши навигации: пока клавиатура в окне Lexicon / Tabs / Photostore, Android отдаёт стрелки
// напрямую (FXHost.key), минуя поле ввода — иначе экранная клавиатура может их «съесть».
(function craftKeys() {
  let routed = false;
  const activeFrame = () => { const a = document.activeElement; return a && a.classList && a.classList.contains('fx-frame') ? a : null; };
  function update() {
    const on = !!activeFrame();
    if (on !== routed) { routed = on; FX.tryCall('keyRoute', on); }
  }
  window.addEventListener('blur', () => setTimeout(update, 0));
  window.addEventListener('focus', () => setTimeout(update, 0));
  document.addEventListener('focusin', update);
  document.addEventListener('pointerdown', () => setTimeout(update, 0), true);
  window.FXHost.key = (type, key, code, shift, ctrl, alt, meta) => {
    const f = activeFrame();
    if (!f) { update(); return; }
    try { f.contentWindow.CraftGuest?.key(type, key, code, shift, ctrl, alt, meta); } catch {}
  };
})();
