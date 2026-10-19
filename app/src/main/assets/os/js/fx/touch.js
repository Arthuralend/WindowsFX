/* WindowsFX: сенсорный ввод — перетаскивание пальцем, двойное касание, крупные области захвата */
'use strict';

(function () {
  const touch = (typeof FX !== 'undefined' && FX.available) || matchMedia('(pointer: coarse)').matches;
  if (!touch) return;
  document.documentElement.classList.add('touch');

  // HTML5 drag-and-drop пальцем (файлы, значки, вкладки): удерживайте и тяните
  if (window.MobileDragDrop) {
    MobileDragDrop.polyfill({
      forceApply: true,
      holdToDrag: 380,
      dragImageTranslateOverride: MobileDragDrop.scrollBehaviourDragImageTranslateOverride,
    });
    addEventListener('touchmove', () => {}, { passive: false });
  }

  // Два пальца: касание = правая кнопка мыши, движение = прокрутка (как на тачпаде)
  const two = { on: false, t0: 0, x0: 0, y0: 0, lx: 0, ly: 0, moved: false, d0: 0, vx: 0, vy: 0, lt: 0, el: null, pinch: false };
  const centre = ts => ({ x: (ts[0].clientX + ts[1].clientX) / 2, y: (ts[0].clientY + ts[1].clientY) / 2, d: Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY) });
  function scroller(el, dx, dy) {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const canY = /(auto|scroll|overlay)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1;
      const canX = /(auto|scroll|overlay)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1;
      if ((dy && canY) || (dx && canX)) return n;
    }
    return null;
  }
  function scrollBy(dx, dy) {
    const el = two.el && scroller(two.el, dx, dy);
    if (el) el.scrollBy({ left: dx, top: dy, behavior: 'instant' });
  }
  let momentum = 0;
  addEventListener('touchstart', e => {
    cancelAnimationFrame(momentum);
    if (e.touches.length === 2) {
      const c = centre(e.touches);
      Object.assign(two, { on: true, t0: performance.now(), x0: c.x, y0: c.y, lx: c.x, ly: c.y, d0: c.d, moved: false, pinch: false, vx: 0, vy: 0, lt: performance.now(), el: document.elementFromPoint(c.x, c.y) });
    } else if (e.touches.length > 2) two.on = false;
  }, { capture: true, passive: true });
  addEventListener('touchmove', e => {
    if (!two.on || e.touches.length !== 2) return;
    const c = centre(e.touches);
    if (!two.moved && !two.pinch) {
      if (Math.abs(c.d - two.d0) > 40 && Math.abs(c.d - two.d0) > Math.hypot(c.x - two.x0, c.y - two.y0)) two.pinch = true;
      else if (Math.hypot(c.x - two.x0, c.y - two.y0) > 8) two.moved = true;
    }
    if (two.moved) {
      e.preventDefault();
      const dx = two.lx - c.x, dy = two.ly - c.y, now = performance.now(), dt = Math.max(1, now - two.lt);
      scrollBy(dx, dy);
      two.vx = two.vx * 0.6 + (dx / dt) * 0.4; two.vy = two.vy * 0.6 + (dy / dt) * 0.4; two.lt = now;
    }
    two.lx = c.x; two.ly = c.y;
  }, { capture: true, passive: false });
  addEventListener('touchend', e => {
    if (!two.on) return;
    if (e.touches.length > 0) return; // ждём, пока поднимутся оба пальца
    two.on = false;
    const dt = performance.now() - two.t0;
    if (!two.moved && !two.pinch && dt < 450) {
      const el = document.elementFromPoint(two.x0, two.y0);
      if (el && !(el instanceof HTMLIFrameElement)) {
        const o = { bubbles: true, cancelable: true, composed: true, clientX: two.x0, clientY: two.y0, screenX: two.x0, screenY: two.y0, button: 2, buttons: 0, view: window };
        el.dispatchEvent(new MouseEvent('contextmenu', o));
      }
      return;
    }
    if (two.moved) {
      // инерция
      let vx = two.vx * 16, vy = two.vy * 16;
      const step = () => {
        vx *= 0.92; vy *= 0.92;
        if (Math.abs(vx) < 0.5 && Math.abs(vy) < 0.5) return;
        scrollBy(vx, vy);
        momentum = requestAnimationFrame(step);
      };
      if (Math.abs(vy) > 2 || Math.abs(vx) > 2) momentum = requestAnimationFrame(step);
    }
  }, { capture: true, passive: true });
  addEventListener('touchcancel', () => { two.on = false; }, { capture: true, passive: true });

  // Двойное касание → dblclick (если WebView не прислал его сам)
  let last = { t: 0, x: 0, y: 0, el: null };
  let nativeDbl = 0;
  document.addEventListener('dblclick', () => { nativeDbl = Date.now(); }, true);
  document.addEventListener('pointerup', e => {
    if (e.pointerType !== 'touch') return;
    const now = Date.now();
    const target = e.target;
    if (now - last.t < 380 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 24 && last.el === target) {
      const t0 = now;
      setTimeout(() => {
        if (nativeDbl >= t0 - 50) return;
        target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, view: window }));
      }, 60);
      last = { t: 0, x: 0, y: 0, el: null };
    } else last = { t: now, x: e.clientX, y: e.clientY, el: target };
  }, true);
})();
