/* Виджеты на рабочем столе: Напоминания, Дела. Перетаскиваются за заголовок, меняют размер за угол,
   положение запоминается. Добавляются из панели виджетов, из приложений и из меню рабочего стола. */
'use strict';

const DeskWidgets = (() => {
  const TYPES = {
    reminders: { name: 'Напоминания', icon: 'reminders', app: 'reminders', render: (el, o) => Reminders.widget(el, o) },
    things: { name: 'Дела', icon: 'things', app: 'things', render: (el, o) => Things.widget(el, o) },
  };
  let layer = null;
  const live = new Map(); // id -> { el, inst }
  const list = () => Persist.get('deskWidgets', []);
  const saveList = l => Persist.set('deskWidgets', l);

  function ensureLayer() {
    if (layer && layer.isConnected) return layer;
    layer = document.getElementById('desk-widgets');
    if (!layer) {
      layer = h('<div id="desk-widgets"></div>');
      const d = document.getElementById('desktop');
      d.after(layer);
    }
    return layer;
  }

  function render() {
    ensureLayer();
    const l = list();
    for (const [id, w] of live) if (!l.some(x => x.id === id)) { w.inst?.destroy?.(); w.el.remove(); live.delete(id); }
    l.forEach(cfg => { if (!live.has(cfg.id)) mount(cfg); else place(live.get(cfg.id).el, cfg); });
  }

  function place(el, cfg) {
    const W = innerWidth, H = innerHeight - 64;
    const w = clamp(cfg.w || 300, 220, W - 20);
    el.style.width = w + 'px';
    if (cfg.h) el.style.height = clamp(cfg.h, 160, H - 20) + 'px';
    el.style.left = clamp(cfg.x ?? W - w - 24, 4, W - w - 4) + 'px';
    el.style.top = clamp(cfg.y ?? 24, 4, H - 80) + 'px';
  }

  function mount(cfg) {
    const T = TYPES[cfg.type];
    if (!T) return;
    const el = h(`<div class="dw glass" data-id="${cfg.id}">
      <div class="dw-bar"><span class="dw-ic">${Icons.get(T.icon, 16)}</span><span class="dw-name">${esc(T.name)}</span><span class="spacer"></span><button class="dw-btn dw-menu" title="Параметры виджета">${Icons.ui('more', 14)}</button></div>
      <div class="dw-body"></div>
      <div class="dw-rz" title="Изменить размер"></div>
    </div>`);
    ensureLayer().append(el);
    place(el, cfg);
    let inst = null;
    try { inst = T.render($('.dw-body', el), cfg.opts || {}); } catch (e) { console.error(e); $('.dw-body', el).textContent = e.message; }
    live.set(cfg.id, { el, inst });

    // перетаскивание
    const bar = $('.dw-bar', el);
    bar.addEventListener('pointerdown', e => {
      if (e.target.closest('.dw-btn')) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      el.classList.add('drag');
      bar.setPointerCapture(e.pointerId);
      const mv = ev => { el.style.left = clamp(ev.clientX - dx, 0, innerWidth - r.width) + 'px'; el.style.top = clamp(ev.clientY - dy, 0, innerHeight - 100) + 'px'; };
      const up = () => {
        el.classList.remove('drag');
        bar.removeEventListener('pointermove', mv); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up);
        update(cfg.id, { x: parseInt(el.style.left), y: parseInt(el.style.top) });
      };
      bar.addEventListener('pointermove', mv); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
    });
    // размер
    const rz = $('.dw-rz', el);
    rz.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      const r = el.getBoundingClientRect();
      rz.setPointerCapture(e.pointerId);
      const mv = ev => { el.style.width = Math.max(220, ev.clientX - r.left) + 'px'; el.style.height = Math.max(160, ev.clientY - r.top) + 'px'; };
      const up = () => {
        rz.removeEventListener('pointermove', mv); rz.removeEventListener('pointerup', up);
        update(cfg.id, { w: parseInt(el.style.width), h: parseInt(el.style.height) });
      };
      rz.addEventListener('pointermove', mv); rz.addEventListener('pointerup', up);
    });
    const menu = (x, y) => {
      const opts = inst?.options?.() || [];
      UI.menu(x, y, [
        { label: 'Открыть «' + T.name + '»', icon: 'app:' + T.icon, action: () => Apps.launch(T.app, cfg.opts || {}) },
        opts.length ? { label: 'Показывать', icon: 'list', items: opts.map(([k, n]) => ({ label: n, checked: (cfg.opts?.list || opts[0][0]) === k, action: () => { remount(cfg.id, { opts: { ...(cfg.opts || {}), list: k } }); } })) } : null,
        { label: 'Размер', items: [['Маленький', 240, 220], ['Средний', 300, 320], ['Большой', 380, 440]].map(([n, w, hh]) => ({ label: n, action: () => remount(cfg.id, { w, h: hh }) })) },
        { sep: true },
        { label: 'Открепить с рабочего стола', icon: 'unpin', action: () => remove(cfg.id) },
      ].filter(Boolean));
    };
    $('.dw-menu', el).onclick = e => { const r = e.currentTarget.getBoundingClientRect(); menu(r.left - 180, r.bottom + 4); };
    el.addEventListener('contextmenu', e => { if (e.target.closest('input,textarea')) return; e.preventDefault(); e.stopPropagation(); menu(e.clientX, e.clientY); });
  }

  function update(id, patch) { saveList(list().map(x => x.id === id ? { ...x, ...patch } : x)); }
  function remount(id, patch) {
    update(id, patch);
    const w = live.get(id);
    if (w) { w.inst?.destroy?.(); w.el.remove(); live.delete(id); }
    render();
  }
  function add(type, opts = {}) {
    const l = list();
    const n = l.length;
    const cfg = { id: uid('dw'), type, opts, w: 300, h: 330, x: innerWidth - 324 - (n % 3) * 316, y: 24 + Math.floor(n / 3) % 2 * 350 };
    l.push(cfg); saveList(l);
    render();
    UI.notify({ title: 'Виджет закреплён на рабочем столе', body: 'Перетащите его за заголовок', app: TYPES[type].app, transient: true, silent: true });
  }
  function remove(id) { saveList(list().filter(x => x.id !== id)); render(); }

  addEventListener('resize', debounce(() => list().forEach(cfg => live.has(cfg.id) && place(live.get(cfg.id).el, cfg)), 200));
  return { init: render, add, remove, TYPES };
})();
