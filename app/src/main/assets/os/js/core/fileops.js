/* Файловые операции оболочки: открытие, буфер обмена, импорт, контекстные меню */
'use strict';

const FileOps = (() => {
  let clip = null; // { mode: 'copy' | 'cut', paths: [] }
  const em = new Emitter();

  function appFor(path, node) {
    const t = FS.typeOf(path, node);
    const d = Store.get('defaultApps') || {};
    switch (t.kind) {
      case 'folder': return 'explorer';
      case 'text': case 'code': return d.text || 'notepad';
      case 'html': return d.html || 'browser';
      case 'image': return d.image || 'photos';
      case 'audio': return d.audio || 'music';
      case 'video': return (Apps.get(d.video) && d.video) || (Apps.get('fxplayer') ? 'fxplayer' : 'photos');
      case 'archive': return Apps.get('winarch') ? 'winarch' : null;
      case 'pdf': return d.pdf || 'pdf';
      case 'doc': return d.doc || 'lexicon';
      case 'sheet': return d.sheet || 'tabs';
      case 'psd': return Apps.alias(d.psd || 'photostore');
      default: return null;
    }
  }

  // ---------- Недавние файлы ----------
  function addRecent(path) {
    const node = FS.get(path);
    if (!node || node.t !== 'f') return;
    let r = Persist.get('recent', []).filter(x => x.path !== path);
    r.unshift({ path, ts: Date.now() });
    Persist.set('recent', r.slice(0, 24));
    em.emit('recent');
  }
  function recent() { return Persist.get('recent', []).filter(x => FS.get(x.path)); }

  async function open(path) {
    const node = FS.get(path);
    if (!node) { UI.alert('Проводник', `Не удаётся найти «${FS.display(path)}».\nВозможно, элемент был перемещён или удалён.`, 'error'); return; }
    const t = FS.typeOf(path, node);
    if (t.kind === 'folder') return Apps.launch('explorer', { path: FS.realPath(path) });
    if (t.kind === 'lnk') {
      const l = t.target;
      if (!l || !l.app) return UI.alert('Ярлык', 'Ярлык повреждён.', 'error');
      const p = l.args?.path;
      if (p && !p.includes('://') && !FS.exists(p)) return UI.alert('Ошибка ярлыка', `Объект «${FS.display(p)}», на который ссылается ярлык, изменён или перемещён.`, 'warning');
      return Apps.launch(l.app, l.args || {});
    }
    if (t.kind === 'exe') return Apps.launch(node.c);
    if (t.kind === 'apk' && FS.isDevice(path)) { FX.call('openExternal', FS.toNative(path), false); return; }
    const app = appFor(path, node);
    if (!app && FS.isDevice(path)) {
      const r = await UI.dialog({
        title: 'Как вы хотите открыть этот файл?', message: FS.basename(path), icon: 'question',
        buttons: [{ label: 'Приложение Android…', value: 'android', primary: true }, { label: 'Блокнот', value: 'notepad' }, { label: 'Отмена', value: null, cancel: true }],
      });
      if (!r.button) return;
      addRecent(path);
      if (r.button === 'android') { FX.call('openExternal', FS.toNative(path), true); return; }
      return Apps.launch(r.button, { path });
    }
    if (!app) {
      const r = await UI.dialog({
        title: 'Как вы хотите открыть этот файл?', message: FS.basename(path), icon: 'question',
        buttons: [{ label: 'Блокнот', value: 'notepad', primary: true }, { label: 'Браузер', value: 'browser' }, { label: 'Отмена', value: null, cancel: true }],
      });
      if (!r.button) return;
      addRecent(path);
      return Apps.launch(r.button, { path });
    }
    addRecent(path);
    return Apps.launch(app, { path: FS.realPath(path) });
  }

  function openWith(path, app) { addRecent(path); return Apps.launch(app, { path }); }

  // ---------- Создание ----------
  function newFolder(dir) {
    try { return FS.mkdir(dir + '/' + FS.unique(dir, 'Новая папка')); }
    catch (e) { UI.alert('Ошибка', e.message, 'error'); return null; }
  }

  /** Пустые документы Word и Excel (минимальные файлы Office Open XML) */
  const TEMPLATES = {
    docx: 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,UEsDBBQAAAAIAC15U131bniw+gAAAC0CAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbK2Ru07DMBSGd57C8lolDgwIoTgduIzAUB7gyD5JrPomH7c0b4/TlA6owMJo/5fvl92uD86yPSYywUt+XTecoVdBGz9I/r55ru44owxegw0eJZ+Q+Lq7ajdTRGIl7EnyMed4LwSpER1QHSL6ovQhOcjlmAYRQW1hQHHTNLdCBZ/R5yrPHbxrH7GHnc3s6VCulyEJLXH2sBhnluQQozUKctHF3utvlOpEqEvy6KHRRFoVAxcXCbPyM+CUey0vk4xG9gYpv4ArLvERkhY6qJ0ryfr3mgs7Q98bhef83BZTUEhUntzZ+qw4MH711w7Kk0X6/xVL7xdeHH+7+wRQSwMEFAAAAAgALXlTXbmBRHGwAAAAKgEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4J1TRN5pWgaEUJMuCKkrKgeIEjeNaB5KwqO3JwMDIAZG278/y233sDO5YUzGOwZNVQNBJ70yTjM4D8f1DkjKwikxe4cMFkzQ8VV7wlnkspMmExIpiEsMppzDntIkJ7QiVT6gK5PRRytyKaOmQciL0Eg3db2l8d0A/mGSXjGIvWqADEvAf2w/jkbiwcurRZd/nPhKFFlEjZnB3UdF1atdFRYob+nHi/wJUEsDBBQAAAAIAC15U12pPWbG5gAAAFMBAAARAAAAd29yZC9kb2N1bWVudC54bWxNkM1OwzAQhO88RbR3aptCmkZ1euOGhAQ8gBtvfqTYG9lbQnl67CAULvZ+ntHMyqfzl5uKTwxxJK9B7SQU6Fuyo+81fLw/31dQRDbemok8arhhhHNzd1pqS+3VoeciJfhYLxoG5rkWIrYDOhN3NKNPWkfBGU4YerFQsHOgFmNMBW4SD1KWwpnRQ5MiL2Rv+Z5FPiO2/BpW7t++iyVXKHWUJaR5SHNZ7SsQv4YXE9Ir05w9+8dsCWM/sIbqSWa6EDO5TZ2wS6I6SLXGobEYNBxklbEj4n/YX3lFmdvEtpn4W1ls39H8AFBLAwQUAAAACAAteVNdnfOyN64AAAAbAQAAHAAAAHdvcmQvX3JlbHMvZG9jdW1lbnQueG1sLnJlbHONz7sKwkAQBdDer1imN5tYiEg2aURIK/EDhs3kgftiZxXz9y7YKFhYXoY5d6Zun9aIB0VevFNQFSUIctoPi5sUXPvz9gCCE7oBjXekYCWGttnUFzKY8g7PS2CREccK5pTCUUrWM1nkwgdyeTL6aDHlGCcZUN9wIrkry72MnwY0X6boBgWxGyoQ/RroH9uP46Lp5PXdkks/KiSn1eT7RY9xoqTgnYvsgGxq+fVT8wJQSwMEFAAAAAgALXlTXe/PdVRIAQAAfwIAAA8AAAB3b3JkL3N0eWxlcy54bWxtUstuwjAQvPcrIt+DUw4URTUItULqBVU8PmCbmMSSX/U6pPTra5tEbYFTMjPemV2vn5dfSmYn7lAYzcjjpCAZ15WphW4YOezX+Zxk6EHXII3mjJw5kuXi4bkv0Z8lxyzUayx7RlrvbUkpVi1XgBNjuQ7a0TgFPkDX0N642jpTccRgrySdFsWMKhCaLIJhbapXfoROeozQvbsBDih91kZ7zPoSsBKCkb1QoYcN77OtUaBJUNqVxvsKB/QrFHBXrPCWpjESv4N6AsnIdD4yL3jNSdDNyLku3x7+B3KdH3aR+hB1aA5cvlvFQjpMRq/ntdcoBVuoRMqBo+eOkSJaShEXM32ajWDbyUBA580QYYeIv6b05sLTQoOFP9tQbsFB48C20bW+HAsPJKJ08K1mZBOXK9PyNCg+zj/Q6V4+1+kBXPpIhb9/uPgBUEsBAhQDFAAAAAgALXlTXfVueLD6AAAALQIAABMAAAAAAAAAAAAAAIABAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECFAMUAAAACAAteVNduYFEcbAAAAAqAQAACwAAAAAAAAAAAAAAgAErAQAAX3JlbHMvLnJlbHNQSwECFAMUAAAACAAteVNdqT1mxuYAAABTAQAAEQAAAAAAAAAAAAAAgAEEAgAAd29yZC9kb2N1bWVudC54bWxQSwECFAMUAAAACAAteVNdnfOyN64AAAAbAQAAHAAAAAAAAAAAAAAAgAEZAwAAd29yZC9fcmVscy9kb2N1bWVudC54bWwucmVsc1BLAQIUAxQAAAAIAC15U13vz3VUSAEAAH8CAAAPAAAAAAAAAAAAAACAAQEEAAB3b3JkL3N0eWxlcy54bWxQSwUGAAAAAAUABQBAAQAAdgUAAAAA',
    xlsx: 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,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',
  };

  function newFile(dir, name = 'Текстовый документ.txt', content = '') {
    try { return FS.write(dir + '/' + FS.unique(dir, name), content); }
    catch (e) { UI.alert('Ошибка', e.message, 'error'); return null; }
  }

  function createShortcut(path, destDir) {
    const node = FS.get(path);
    if (!node) return;
    let target;
    const t = FS.typeOf(path, node);
    if (t.kind === 'lnk') target = t.target;
    else if (t.kind === 'folder') target = { app: 'explorer', args: { path: FS.realPath(path) } };
    else if (t.kind === 'exe') target = { app: node.c };
    else target = { app: appFor(path, node) || 'notepad', args: { path: FS.realPath(path) } };
    const name = FS.unique(destDir, FS.stem(FS.basename(path)) + (t.kind === 'folder' ? '' : '') + ' — ярлык.lnk');
    try { return FS.write(destDir + '/' + name, JSON.stringify(target)); }
    catch (e) { UI.alert('Ошибка', e.message, 'error'); }
  }

  function appShortcut(appId, destDir = FS.P.desktop) {
    const app = Apps.get(appId);
    const name = FS.unique(destDir, app.name + '.lnk');
    return FS.write(destDir + '/' + name, JSON.stringify({ app: appId }));
  }

  // ---------- Удаление / переименование ----------
  async function remove(paths, permanent = false) {
    paths = paths.filter(p => FS.get(p));
    if (!paths.length) return;
    if (permanent) {
      const msg = paths.length === 1 ? `Вы действительно хотите безвозвратно удалить «${FS.basename(paths[0])}»?` : `Вы действительно хотите безвозвратно удалить эти элементы (${paths.length})?`;
      if (!await UI.confirm('Удаление', msg, { danger: true })) return;
    }
    const errors = [];
    paths.forEach(p => {
      try { permanent ? FS.removePermanent(p) : FS.remove(p); }
      catch (e) { errors.push(FS.basename(p) + ': ' + e.message); }
    });
    if (errors.length < paths.length) Sound.play('trash');
    if (errors.length) UI.alert('Не удалось удалить', errors.join('\n'), 'error');
  }

  async function rename(path, newName) {
    try { return FS.rename(path, newName); }
    catch (e) { await UI.alert('Переименование', e.message, 'error'); return null; }
  }

  async function renameDialog(path) {
    const n = await UI.prompt('Переименовать', 'Новое имя:', FS.basename(path), { selectStem: true });
    if (n && n !== FS.basename(path)) return rename(path, n);
    return null;
  }

  // ---------- Буфер обмена ----------
  function copy(paths) { clip = { mode: 'copy', paths: [...paths] }; em.emit('clip'); }
  function cut(paths) { clip = { mode: 'cut', paths: [...paths] }; em.emit('clip'); }
  function canPaste() { return !!clip && clip.paths.some(p => FS.get(p)); }
  function isCut(path) { return clip?.mode === 'cut' && clip.paths.includes(path); }

  function paste(dir) {
    if (!canPaste()) return [];
    const out = [], errors = [];
    clip.paths.forEach(p => {
      if (!FS.get(p)) return;
      try { out.push(clip.mode === 'cut' ? FS.move(p, dir) : FS.copy(p, dir)); }
      catch (e) { errors.push(FS.basename(p) + ': ' + e.message); }
    });
    if (clip.mode === 'cut') { clip = null; em.emit('clip'); }
    if (errors.length) UI.alert('Ошибка', errors.join('\n'), 'error');
    return out;
  }

  function moveTo(paths, dir) {
    const errors = [];
    const out = [];
    paths.forEach(p => {
      try { out.push(FS.move(p, dir)); } catch (e) { errors.push(FS.basename(p) + ': ' + e.message); }
    });
    if (errors.length) UI.alert('Перемещение', errors.join('\n'), 'error');
    return out;
  }

  // ---------- Импорт файлов с компьютера ----------
  const TEXT_EXT = ['txt', 'md', 'log', 'ini', 'cfg', 'csv', 'js', 'ts', 'css', 'json', 'py', 'xml', 'html', 'htm', 'c', 'cpp', 'java', 'svg'];

  async function importFiles(files, dir) {
    const out = [];
    for (const f of files) {
      try {
        const e = FS.ext(f.name);
        let content, name = f.name;
        if (f.size > 25 * 1024 * 1024) { UI.notify({ title: 'Файл слишком большой', body: `${f.name}: максимальный размер — 25 МБ.`, icon: 'explorer' }); continue; }
        if (e === 'svg') content = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(await readFileAs(f, 'text'));
        else if (TEXT_EXT.includes(e) || f.type.startsWith('text/')) content = await readFileAs(f, 'text');
        else {
          content = await readFileAs(f);
          if (f.type.startsWith('image/') && f.size > 1.5 * 1024 * 1024 && !/gif/.test(f.type)) {
            content = await downscaleImage(content, 2560);
            name = FS.stem(name) + '.jpg';
          }
        }
        const p = FS.write(dir + '/' + FS.unique(dir, name), content);
        out.push(p);
      } catch (err) { UI.alert('Импорт', f.name + ': ' + err.message, 'error'); }
    }
    if (out.length) UI.notify({ title: 'Файлы добавлены', body: `${out.length} ${plural(out.length, 'файл скопирован', 'файла скопировано', 'файлов скопировано')} в «${FS.basename(dir)}».`, icon: 'explorer', onClick: () => Apps.launch('explorer', { path: dir }) });
    return out;
  }

  function uploadInto(dir, accept) {
    if (FX.available && FS.isDevice(dir)) { FX.call('importDocument', (accept || '*/*').split(',')[0], FS.toNative(dir)); return; }
    const inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true;
    if (accept) inp.accept = accept;
    inp.onchange = () => importFiles([...inp.files], dir);
    inp.click();
  }

  function download(path) {
    const node = FS.get(path);
    if (!node || node.t !== 'f') return;
    downloadBlob(FS.basename(path), node.c);
  }

  function setWallpaper(path) {
    const c = FS.read(path);
    Store.set('customWallpaper', c);
    Store.set('wallpaper', 'custom');
    UI.notify({ title: 'Фон рабочего стола изменён', body: FS.basename(path), icon: 'settings', silent: true });
  }

  // ---------- Контекстные меню ----------
  function openWithItems(path) {
    const t = FS.typeOf(path);
    const list = [['notepad', 'Блокнот'], ['browser', 'Браузер']];
    if (t.kind === 'image') list.unshift(['photos', 'Фотографии'], ['paint', 'Paint']);
    if (t.kind === 'audio' || t.kind === 'video') list.unshift(['music', 'Медиаплеер']);
    if (t.kind === 'video') list.unshift(['photos', 'Фотографии'], ['fxplayer', 'Видеоплеер']);
    if (t.kind === 'audio') list.unshift(['fxplayer', 'Видеоплеер']);
    if (t.kind === 'archive') list.unshift(['winarch', 'WinArchivator']);
    if (t.kind === 'pdf') list.unshift(['pdf', 'Просмотр PDF']);
    if (t.kind === 'doc' || t.kind === 'text') list.unshift(['lexicon', 'Lexicon']);
    if (t.kind === 'sheet' || FS.ext(path) === 'csv') list.unshift(['tabs', 'Tabs']);
    if (t.kind === 'image' || t.kind === 'psd') list.unshift(['photostore', 'Photostore']);
    const items = list.filter(([a]) => Apps.get(a)).map(([a, n]) => ({ label: n, icon: 'app:' + Apps.get(a).icon, action: () => openWith(path, a) }));
    if (FS.isDevice(path)) items.push({ sep: true }, { label: 'Приложение Android…', icon: 'external', action: () => FX.call('openExternal', FS.toNative(path), true) });
    return items;
  }

  /** Меню для выделенных элементов. ctx: { rename(path), dir } */
  function itemMenu(paths, ctx = {}) {
    const single = paths.length === 1;
    const p = paths[0];
    const node = FS.get(p);
    const t = FS.typeOf(p, node);
    const prot = paths.some(FS.isProtected);
    return [
      { label: 'Открыть', icon: 'folder-open', shortcut: 'Enter', action: () => paths.forEach(open) },
      single && t.kind === 'folder' ? { label: 'Открыть в новом окне', icon: 'external', action: () => Apps.launch('explorer', { path: p, newWindow: true }) } : null,
      single && t.kind === 'folder' ? { label: 'Открыть в терминале', icon: 'terminal', action: () => Apps.launch('terminal', { cwd: p }) } : null,
      single && node?.t === 'f' && !['lnk', 'exe'].includes(t.kind) ? { label: 'Открыть с помощью', icon: 'apps', items: openWithItems(p) } : null,
      typeof WinArch !== 'undefined' ? WinArch.menuEntry(paths) : null,
      single && t.kind === 'image' ? { label: 'Сделать фоном рабочего стола', icon: 'image', action: () => setWallpaper(p) } : null,
      single && t.kind === 'folder' && canPaste() ? { label: 'Вставить', icon: 'paste', action: () => paste(p) } : null,
      { sep: true },
      { label: 'Вырезать', icon: 'cut', shortcut: 'Ctrl+X', disabled: prot, action: () => cut(paths) },
      { label: 'Копировать', icon: 'copy', shortcut: 'Ctrl+C', action: () => copy(paths) },
      single && ctx.dir !== FS.P.desktop ? { label: 'Создать ярлык на рабочем столе', icon: 'external', action: () => createShortcut(p, FS.P.desktop) } : null,
      single ? { label: 'Переименовать', icon: 'rename', shortcut: 'F2', disabled: prot, action: () => ctx.rename ? ctx.rename(p) : renameDialog(p) } : null,
      { label: 'Удалить', icon: 'trash', shortcut: 'Del', disabled: prot, action: () => remove(paths) },
      { sep: true },
      single && node?.t === 'f' && FS.isDevice(p) ? { label: 'Поделиться…', icon: 'share', action: () => FX.call('share', FS.toNative(p)) } : null,
      single && node?.t === 'f' && !FS.isDevice(p) ? { label: 'Сохранить в «Загрузки» устройства', icon: 'download', action: () => { try { const out = FS.copy(p, FS.P.downloads); UI.notify({ title: 'Файл сохранён', body: FS.display(out), icon: 'download', transient: true }); } catch (e) { UI.alert('Сохранение', e.message, 'error'); } } } : null,
      single ? { label: 'Свойства', icon: 'info', shortcut: 'Alt+Enter', action: () => UI.properties(p) } : null,
    ];
  }

  /** Подменю «Создать» */
  function createItems(dir, after) {
    const done = p => p && after?.(p);
    return [
      { label: 'Папку', icon: 'app:folder', action: () => done(newFolder(dir)) },
      { sep: true },
      { label: 'Документ Word', icon: 'app:file-doc', action: () => done(newFile(dir, 'Новый документ.docx', TEMPLATES.docx)) },
      { label: 'Лист Excel', icon: 'app:file-sheet', action: () => done(newFile(dir, 'Новая таблица.xlsx', TEMPLATES.xlsx)) },
      { sep: true },
      { label: 'Текстовый документ', icon: 'app:file-text', action: () => done(newFile(dir, 'Текстовый документ.txt')) },
      { label: 'Документ HTML', icon: 'app:file-html', action: () => done(newFile(dir, 'Новая страница.html', '<!doctype html>\n<html lang="ru">\n<head>\n  <meta charset="utf-8">\n  <title>Новая страница</title>\n</head>\n<body>\n  <h1>Привет!</h1>\n</body>\n</html>\n')) },
      { label: 'Документ Markdown', icon: 'app:file-text', action: () => done(newFile(dir, 'Заметка.md', '# Заголовок\n\n')) },
      { label: 'Ярлык приложения…', icon: 'external', items: Apps.all().sort((a, b) => a.name.localeCompare(b.name, 'ru')).map(a => ({ label: a.name, icon: 'app:' + a.icon, action: () => done(FS.write(dir + '/' + FS.unique(dir, a.name + '.lnk'), JSON.stringify({ app: a.id }))) })) },
    ];
  }

  /** Отображаемое имя элемента (ярлыки и известные расширения скрываются) */
  function label(name, node) {
    if (!node || node.t === 'd') return name;
    const e = FS.ext(name);
    if (e === 'lnk') return FS.stem(name);
    if (!Store.get('showExtensions') && e && FS.typeOf(name, node).kind !== 'other') return FS.stem(name);
    return name;
  }

  return {
    label, appFor, open, openWith, openWithItems, addRecent, recent, newFolder, newFile, createShortcut, appShortcut,
    remove, rename, renameDialog, copy, cut, paste, canPaste, isCut, moveTo, importFiles, uploadInto, download, setWallpaper,
    itemMenu, createItems, templates: TEMPLATES, on: (e, f) => em.on(e, f), clip: () => clip,
  };
})();

/** Состояние внутреннего перетаскивания файлов между Проводником и рабочим столом */
const DnD = {
  paths: null,
  source: null,
  start(e, paths, source) {
    DnD.paths = paths;
    DnD.source = source;
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('text/plain', paths.map(FS.display).join('\n'));
  },
  end() { DnD.paths = null; DnD.source = null; },
  /** Обработать сброс в папку dir. Возвращает пути созданных/перемещённых элементов. */
  async dropInto(dir, e) {
    if (DnD.paths) {
      const paths = DnD.paths.filter(p => FS.get(p));
      DnD.end();
      if (e.ctrlKey) {
        const out = [];
        paths.forEach(p => { try { out.push(FS.copy(p, dir)); } catch (err) { UI.alert('Копирование', err.message, 'error'); } });
        return out;
      }
      return FileOps.moveTo(paths.filter(p => FS.parent(FS.realPath(p) || p).toLowerCase() !== FS.realPath(dir).toLowerCase()), dir);
    }
    if (e.dataTransfer?.files?.length) return FileOps.importFiles([...e.dataTransfer.files], dir);
    return [];
  },
  accepts(e) { return !!DnD.paths || [...(e.dataTransfer?.types || [])].includes('Files'); },
};
