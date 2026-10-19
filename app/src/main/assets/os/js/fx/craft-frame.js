/* WindowsFX: подключается внутри окна Lexicon / Tabs / Photostore.
   Направляет «Открыть» и «Сохранить» этих приложений в файлы WindowsFX. */
(function () {
  'use strict';
  // 0) Интерфейс приложений — на русском, как и весь WindowsFX (движки берут язык из navigator)
  try {
    Object.defineProperty(navigator, 'language', { configurable: true, get: function () { return 'ru-RU'; } });
    Object.defineProperty(navigator, 'languages', { configurable: true, get: function () { return ['ru-RU', 'ru']; } });
  } catch (e) {}
  // 0b) Холст приложений всегда непрозрачный. На части GPU (Mali, Adreno) движок оставляет в кадре
  //     альфа-канал < 1, и Android смешивает картинку с тем, что под окном, — изображение в Photostore
  //     выглядело полупрозрачным. Без альфа-канала у холста кадр выводится как есть.
  try {
    var getCtx = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
        attrs = Object.assign({}, attrs || {}, { alpha: false, premultipliedAlpha: false });
      }
      return getCtx.call(this, type, attrs);
    };
    if (window.GPUCanvasContext && GPUCanvasContext.prototype.configure) {
      var conf = GPUCanvasContext.prototype.configure;
      GPUCanvasContext.prototype.configure = function (c) { return conf.call(this, Object.assign({}, c, { alphaMode: 'opaque' })); };
    }
  } catch (e) {}
  document.documentElement.style.background = '#1e1e1e';

  // 5) Клавиши навигации от Android (стрелки, PageUp/Down, Home/End, Tab, Esc, Del) — прямо на холст
  window.CraftGuest = window.CraftGuest || {};
  window.CraftGuest.key = function (type, key, code, shift, ctrl, alt, meta) {
    var c = document.querySelector('canvas');
    if (!c) return;
    var t = document.activeElement && document.activeElement !== document.body ? document.activeElement : c;
    var o = { key: key, code: code, shiftKey: !!shift, ctrlKey: !!ctrl, altKey: !!alt, metaKey: !!meta, bubbles: true, cancelable: true, composed: true, view: window };
    (t.tagName === 'INPUT' ? t : c).dispatchEvent(new KeyboardEvent(type, o));
  };

  // 5b) Языки ввода WindowsFX (ENG / РУС / ՀԱՅ) и в окнах Lexicon, Tabs, Photostore
  window.addEventListener('keydown', function (e) {
    var K;
    try { K = window.parent !== window && window.parent.Kbd; } catch (err) { K = null; }
    if (!K || !e.isTrusted) return;
    var a = document.activeElement;
    if (a && a.tagName === 'INPUT') { K.onKeyDown(e, document); return; }
    if ((e.key === 'Shift' && e.altKey) || (e.key === 'Alt' && e.shiftKey) || (e.code === 'Space' && e.metaKey)) { K.onKeyDown(e, document); return; }
    var ch = K.translate(e);
    if (!ch) return;
    e.preventDefault(); e.stopImmediatePropagation();
    var c = document.querySelector('canvas');
    if (c) c.dispatchEvent(new KeyboardEvent('keydown', { key: ch, code: '', bubbles: true, cancelable: true, composed: true, view: window }));
  }, true);

  // 6) Сенсорные жесты для холста egui:
  //    два пальца — касание = правая кнопка, движение = прокрутка колесом (с инерцией), щипок = масштаб (Ctrl+колесо).
  //    Первое касание придерживается на 90 мс, чтобы второй палец не превращал жест в щелчок.
  (function gestures() {
    var HOLD = 90;
    var st = 'idle';          // idle | hold | pass | two
    var held = [];            // придержанные события первого касания
    var holdT = 0;
    var replaying = false;
    var two = null;
    var momentum = 0;
    var lastTouch = null;

    function canvasAt(x, y) { var el = document.elementFromPoint(x, y); return el || document.querySelector('canvas') || document.body; }
    function cloneTouch(t) {
      try { return new Touch({ identifier: t.identifier, target: t.target, clientX: t.clientX, clientY: t.clientY, screenX: t.screenX, screenY: t.screenY, pageX: t.pageX, pageY: t.pageY, radiusX: t.radiusX, radiusY: t.radiusY, force: t.force }); } catch (e) { return t; }
    }
    function snapshot(e) {
      if (e.type.indexOf('touch') === 0) {
        return { kind: 'touch', type: e.type, target: e.target, touches: [].map.call(e.touches, cloneTouch), targetTouches: [].map.call(e.targetTouches, cloneTouch), changedTouches: [].map.call(e.changedTouches, cloneTouch), mods: e };
      }
      return { kind: 'pointer', type: e.type, target: e.target, init: { pointerId: e.pointerId, pointerType: e.pointerType, isPrimary: e.isPrimary, clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY, button: e.button, buttons: e.buttons, width: e.width, height: e.height, pressure: e.pressure, bubbles: true, cancelable: true, composed: true, view: window } };
    }
    function replay(ev) {
      replaying = true;
      try {
        if (ev.kind === 'touch') ev.target.dispatchEvent(new TouchEvent(ev.type, { touches: ev.touches, targetTouches: ev.targetTouches, changedTouches: ev.changedTouches, bubbles: true, cancelable: true, composed: true, view: window }));
        else ev.target.dispatchEvent(new PointerEvent(ev.type, ev.init));
      } catch (err) { /* старые WebView без конструктора Touch */ }
      replaying = false;
    }
    function flush() {
      clearTimeout(holdT);
      var list = held; held = [];
      st = 'pass';
      list.forEach(replay);
    }
    function centre(ts) { return { x: (ts[0].clientX + ts[1].clientX) / 2, y: (ts[0].clientY + ts[1].clientY) / 2, d: Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY) }; }
    function mouse(type, x, y, button, buttons) {
      var el = canvasAt(x, y);
      var o = { clientX: x, clientY: y, screenX: x, screenY: y, button: button || 0, buttons: buttons || 0, bubbles: true, cancelable: true, composed: true, view: window, pointerType: 'mouse', pointerId: 1, isPrimary: true };
      replaying = true;
      try { el.dispatchEvent(type.indexOf('pointer') === 0 ? new PointerEvent(type, o) : new MouseEvent(type, o)); } catch (e) {}
      replaying = false;
    }
    function wheel(x, y, dx, dy, ctrl) {
      var el = canvasAt(x, y);
      replaying = true;
      try { el.dispatchEvent(new WheelEvent('wheel', { deltaX: dx, deltaY: dy, deltaMode: 0, clientX: x, clientY: y, ctrlKey: !!ctrl, bubbles: true, cancelable: true, composed: true, view: window })); } catch (e) {}
      replaying = false;
    }
    function swallow(e) { e.stopImmediatePropagation(); if (e.cancelable && e.type !== 'pointerdown') e.preventDefault(); }

    function onTouch(e) {
      if (replaying) return;
      var n = e.touches.length;
      if (e.type === 'touchstart') {
        cancelAnimationFrame(momentum);
        if (n >= 2) {
          // второй палец: жест двумя пальцами (первое касание, если ещё придержано, отбрасываем)
          if (st === 'pass' && lastTouch) {
            // первое касание уже ушло в приложение: отпускаем его там, где оно было
            mouse('pointerup', lastTouch.x, lastTouch.y, 0, 0);
            if (lastTouch.touch) {
              replaying = true;
              try { (lastTouch.touch.target || document).dispatchEvent(new TouchEvent('touchcancel', { touches: [], targetTouches: [], changedTouches: [lastTouch.touch], bubbles: true, cancelable: true, composed: true, view: window })); } catch (err) {}
              replaying = false;
            }
          }
          clearTimeout(holdT); held = [];
          var c = centre(e.touches);
          two = { t0: performance.now(), x0: c.x, y0: c.y, lx: c.x, ly: c.y, d0: c.d, ld: c.d, mode: '', vx: 0, vy: 0, lt: performance.now() };
          st = 'two';
          swallow(e);
          return;
        }
        if (st === 'idle' || st === 'pass') {
          st = 'hold';
          held = [snapshot(e)];
          lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY, touch: cloneTouch(e.touches[0]) };
          holdT = setTimeout(flush, HOLD);
          swallow(e);
          return;
        }
      }
      if (st === 'hold') {
        if (e.type === 'touchmove') { held.push(snapshot(e)); swallow(e); return; }
        flush(); // палец поднят быстро: сначала отдаём придержанное, затем само событие
        if (e.type === 'touchend' || e.type === 'touchcancel') { if (n === 0) setTimeout(function () { if (st === 'pass') st = 'idle'; }, 0); }
        return;
      }
      if (st === 'two') {
        swallow(e);
        if (e.type === 'touchmove' && n >= 2) {
          var c2 = centre(e.touches);
          if (!two.mode) {
            var mv = Math.hypot(c2.x - two.x0, c2.y - two.y0), dd = Math.abs(c2.d - two.d0);
            if (dd > 36 && dd > mv) two.mode = 'pinch';
            else if (mv > 8) { two.mode = 'scroll'; mouse('mousemove', c2.x, c2.y); }
          }
          var now = performance.now(), dt = Math.max(1, now - two.lt);
          if (two.mode === 'scroll') {
            var dx = two.lx - c2.x, dy = two.ly - c2.y;
            if (dx || dy) wheel(c2.x, c2.y, dx, dy, false);
            two.vx = two.vx * 0.6 + (dx / dt) * 0.4; two.vy = two.vy * 0.6 + (dy / dt) * 0.4;
          } else if (two.mode === 'pinch' && two.ld > 0 && c2.d > 0) {
            var k = Math.log(c2.d / two.ld);
            if (Math.abs(k) > 0.002) wheel(c2.x, c2.y, 0, -k * 100, true);
          }
          two.lx = c2.x; two.ly = c2.y; two.ld = c2.d; two.lt = now;
          return;
        }
        if ((e.type === 'touchend' || e.type === 'touchcancel') && n === 0) {
          var t = two; st = 'idle'; two = null;
          if (!t.mode && performance.now() - t.t0 < 450 && e.type === 'touchend') {
            // правая кнопка мыши в точке касания
            mouse('mousemove', t.x0, t.y0);
            mouse('pointerdown', t.x0, t.y0, 2, 2);
            mouse('mousedown', t.x0, t.y0, 2, 2);
            mouse('pointerup', t.x0, t.y0, 2, 0);
            mouse('mouseup', t.x0, t.y0, 2, 0);
            mouse('contextmenu', t.x0, t.y0, 2, 0);
          } else if (t.mode === 'scroll') {
            var vx = t.vx * 16, vy = t.vy * 16, x = t.lx, y = t.ly;
            var step = function () {
              vx *= 0.92; vy *= 0.92;
              if (Math.abs(vx) < 0.6 && Math.abs(vy) < 0.6) return;
              wheel(x, y, vx, vy, false);
              momentum = requestAnimationFrame(step);
            };
            if (Math.abs(vx) > 2 || Math.abs(vy) > 2) momentum = requestAnimationFrame(step);
          }
        }
        return;
      }
      if (st === 'pass' && (e.type === 'touchend' || e.type === 'touchcancel') && n === 0) st = 'idle';
    }
    function onPointer(e) {
      if (replaying || e.pointerType !== 'touch') return;
      if (st === 'two') { swallow(e); return; }
      if (e.type === 'pointerdown' && (st === 'idle' || st === 'pass') && e.isPrimary) {
        // pointerdown приходит раньше touchstart: придерживаем его вместе с касанием
        st = 'hold'; held = [snapshot(e)];
        lastTouch = { x: e.clientX, y: e.clientY };
        clearTimeout(holdT); holdT = setTimeout(flush, HOLD);
        swallow(e);
        return;
      }
      if (st === 'hold') {
        if (e.type === 'pointerdown' && !e.isPrimary) { clearTimeout(holdT); held = []; swallow(e); return; }
        if (e.type === 'pointermove') { held.push(snapshot(e)); swallow(e); return; }
        if (e.type === 'pointerup' || e.type === 'pointercancel') flush();
      }
      if (e.type === 'pointercancel' && lastTouch) mouse('pointerup', e.clientX || lastTouch.x, e.clientY || lastTouch.y, 0, 0);
      if (e.type === 'pointermove' && lastTouch) { lastTouch.x = e.clientX; lastTouch.y = e.clientY; }
    }
    // touchstart первого пальца при уже начатом удержании (порядок: pointerdown → touchstart)
    var onTouchFirst = function (e) {
      if (replaying) return;
      if (e.type === 'touchstart' && st === 'hold' && e.touches.length === 1) { held.push(snapshot(e)); if (lastTouch) lastTouch.touch = cloneTouch(e.touches[0]); swallow(e); return; }
      onTouch(e);
    };
    ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(function (t) { window.addEventListener(t, onTouchFirst, { capture: true, passive: false }); });
    ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].forEach(function (t) { window.addEventListener(t, onPointer, { capture: true }); });
  })();

})();

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
  window.CraftGuest = window.CraftGuest || {};
  window.CraftGuest.dropFile = function (file) {
      var c = document.querySelector('canvas') || document.body;
      var dt = new DataTransfer();
      dt.items.add(file);
      ['dragenter', 'dragover', 'drop'].forEach(function (type) {
        c.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      });
  };

  var started = false;
  function ready() { if (started) return; started = true; setTimeout(function () { H.ready(appId, window); }, 900); }
  window.addEventListener('TrunkApplicationStarted', ready);
  window.addEventListener('load', function () { setTimeout(ready, 4000); });
})();
