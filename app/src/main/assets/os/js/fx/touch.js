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
