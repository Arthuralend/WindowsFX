/* WindowsFX: подключается внутри окна Lexicon / Tabs / Prism (WordCraft, GridCraft, PhotoCraft).
   Направляет «Открыть» и «Сохранить» этих приложений в файлы WindowsFX. */
(function () {
  'use strict';
  var host = window.parent && window.parent !== window ? window.parent : null;
  if (!host || !host.CraftHost) return;
  var me = document.currentScript;
  var appId = (me && me.getAttribute('data-app')) || 'craft';
  var H = host.CraftHost;

  function abort() { return new DOMException('The user aborted a request.', 'AbortError'); }

  // 1) «Сохранить как» через File System Access API (WordCraft вызывает его сам)
  window.showSaveFilePicker = function (opts) {
    opts = opts || {};
    return H.pickSave(appId, opts.suggestedName || 'document', opts.types || []).then(function (path) {
      if (!path) throw abort();
      return {
        kind: 'file',
        name: path.split('/').pop(),
        createWritable: function () {
          var parts = [];
          return Promise.resolve({
            write: function (d) {
              if (d && typeof d === 'object' && !(d instanceof Blob) && !(d instanceof ArrayBuffer) && !ArrayBuffer.isView(d) && 'data' in d) d = d.data;
              parts.push(d);
              return Promise.resolve();
            },
            close: function () { return H.save(appId, path, new Blob(parts)); },
            abort: function () { return Promise.resolve(); },
            truncate: function () { return Promise.resolve(); },
            seek: function () { return Promise.resolve(); },
          });
        },
        getFile: function () { return H.fileFor(path); },
        queryPermission: function () { return Promise.resolve('granted'); },
        requestPermission: function () { return Promise.resolve('granted'); },
      };
    });
  };

  // 2) Скачивание (GridCraft, PhotoCraft): ссылка с атрибутом download → диалог сохранения WindowsFX
  var aClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    var href = this.href || '';
    if (this.hasAttribute('download') && /^(blob:|data:)/.test(href)) {
      var name = this.getAttribute('download') || 'file';
      fetch(href).then(function (r) { return r.blob(); }).then(function (blob) { H.saveDownload(appId, name, blob); });
      return;
    }
    return aClick.call(this);
  };

  // 3) «Открыть»: <input type=file> → окно выбора файлов WindowsFX
  var iClick = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    var input = this;
    if (input.type !== 'file') return iClick.call(input);
    H.pickOpen(appId, input.accept || '', !!input.multiple).then(function (files) {
      if (files === 'native') return iClick.call(input);
      if (!files || !files.length) { input.dispatchEvent(new Event('cancel')); return; }
      var dt = new DataTransfer();
      files.forEach(function (f) { dt.items.add(f); });
      input.files = dt.files;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };
  if (HTMLInputElement.prototype.showPicker) {
    HTMLInputElement.prototype.showPicker = function () { this.click(); };
  }

  // 4) Открыть файл, переданный из Проводника: «бросаем» его на холст приложения
  window.CraftGuest = {
    dropFile: function (file) {
      var c = document.querySelector('canvas') || document.body;
      var dt = new DataTransfer();
      dt.items.add(file);
      ['dragenter', 'dragover', 'drop'].forEach(function (type) {
        c.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      });
    },
  };

  var started = false;
  function ready() { if (started) return; started = true; setTimeout(function () { H.ready(appId, window); }, 900); }
  window.addEventListener('TrunkApplicationStarted', ready);
  window.addEventListener('load', function () { setTimeout(ready, 4000); });
})();
