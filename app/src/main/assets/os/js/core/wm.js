/* Оконный менеджер: открытие, фокус, перетаскивание, изменение размера, прикрепление, виртуальные рабочие столы */
'use strict';

const WM = (() => {
  const wins = new Map();
  const em = new Emitter();
  let z = 100, seq = 0, activeId = null;
  let desktops = [{ name: 'Рабочий стол 1' }];
  let curDesk = 0;
  let shownDesktop = null; // окна, свёрнутые кнопкой «Свернуть все»
  const TASKBAR_SPACE = 64;
  const layer = () => document.getElementById('windows');
  const anims = () => Store.get('animations');

  function area() {
    return { x: 0, y: 0, w: innerWidth, h: innerHeight - (Store.get('taskbarAutoHide') ? 0 : TASKBAR_SPACE) };
  }

  const SNAP_LAYOUTS = [
    [[0, 0, .5, 1], [.5, 0, .5, 1]],
    [[0, 0, .66, 1], [.66, 0, .34, 1]],
    [[0, 0, .5, 1], [.5, 0, .5, .5], [.5, .5, .5, .5]],
    [[0, 0, .5, .5], [.5, 0, .5, .5], [0, .5, .5, .5], [.5, .5, .5, .5]],
    [[0, 0, .333, 1], [.333, 0, .334, 1], [.667, 0, .333, 1]],
    [[0, 0, .25, 1], [.25, 0, .5, 1], [.75, 0, .25, 1]],
  ];

  function fracRect([fx, fy, fw, fh]) {
    const a = area();
    return { x: Math.round(a.w * fx), y: Math.round(a.h * fy), w: Math.round(a.w * fw), h: Math.round(a.h * fh) };
  }

  // ---------------- Создание окна ----------------
  function open(o) {
    const id = 'win' + (++seq);
    const a = area();
    const resizable = o.resizable !== false;
    const saved = resizable && o.remember !== false ? Persist.get('winsize.' + o.app, null) : null;
    const minW = o.minWidth || 320, minH = o.minHeight || 200;
    let w = clamp(saved?.w || o.width || 820, minW, a.w - 16);
    let hgt = clamp(saved?.h || o.height || 560, minH, a.h - 16);
    const n = [...wins.values()].filter(x => x.desktop === curDesk && !x.minimized).length;
    let x = o.x ?? Math.round((a.w - w) / 2 + ((n % 7) - 3) * 28);
    let y = o.y ?? Math.round((a.h - hgt) / 2 + ((n % 7) - 3) * 24);
    x = clamp(x, 0, Math.max(0, a.w - w));
    y = clamp(y, 0, Math.max(0, a.h - hgt));

    const el = h(`<div class="win opening ${o.className || ''}" data-app="${esc(o.app)}" data-id="${id}">
      <div class="win-titlebar">
        <div class="win-title"><span class="win-icon">${Icons.get(o.icon || Apps.get(o.app)?.icon || 'start', 16)}</span><span class="win-title-text"></span></div>
        <div class="win-tb-extra"></div>
        <div class="win-controls">
          <button class="wc wc-min" title="Свернуть">${Icons.ui('minimize', 14)}</button>
          ${o.maximizable !== false && resizable ? `<button class="wc wc-max" title="Развернуть">${Icons.ui('maximize', 12)}</button>` : ''}
          <button class="wc wc-close" title="Закрыть">${Icons.ui('close', 14)}</button>
        </div>
      </div>
      <div class="win-body ${o.bodyClass || ''}"></div>
      ${resizable ? ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(d => `<div class="rz rz-${d}" data-dir="${d}"></div>`).join('') : ''}
    </div>`);

    const win = {
      id, el, app: o.app, title: o.title || '', icon: o.icon || Apps.get(o.app)?.icon || 'start',
      body: $('.win-body', el), titlebar: $('.win-titlebar', el), tbExtra: $('.win-tb-extra', el),
      state: 'normal', minimized: false, prev: null, desktop: curDesk, resizable, minW, minH,
      bounds: { x, y, w, h: hgt },
      beforeClose: o.beforeClose, onClose: o.onClose, onResize: o.onResize, onFocus: o.onFocus,
      created: Date.now(),
      setTitle(t) { this.title = t; $('.win-title-text', el).textContent = t; em.emit('change'); },
      setIcon(ic) { this.icon = ic; $('.win-icon', el).innerHTML = Icons.get(ic, 16); em.emit('change'); },
      close: (force) => close(win, force),
      minimize: () => minimize(win),
      maximize: () => maximize(win),
      restore: () => restore(win),
      toggleMax: () => toggleMax(win),
      focus: () => focus(win),
      setBounds: (b, anim) => setBounds(win, b, anim),
      isActive: () => activeId === id,
    };
    win.setTitle(win.title);
    wins.set(id, win);
    layer().append(el);
    applyBounds(win);
    bindWindow(win);
    focus(win);
    if (o.maximized) maximize(win, false);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('opening')));
    em.emit('change');
    return win;
  }

  function applyBounds(win) {
    const { x, y, w, h } = win.bounds;
    Object.assign(win.el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  }

  function setBounds(win, b, animate = false) {
    win.bounds = { ...win.bounds, ...b };
    if (animate && anims()) {
      win.el.classList.add('anim');
      clearTimeout(win._animT);
      win._animT = setTimeout(() => { win.el.classList.remove('anim'); win.onResize?.(); }, 260);
    }
    applyBounds(win);
    win.onResize?.();
  }

  function updateMaxBtn(win) {
    const b = $('.wc-max', win.el);
    if (!b) return;
    const isMax = win.state !== 'normal';
    b.innerHTML = Icons.ui(isMax ? 'restore' : 'maximize', 12);
    b.title = isMax ? 'Восстановить' : 'Развернуть';
    win.el.classList.toggle('max', win.state === 'max');
    win.el.classList.toggle('snapped', win.state === 'snap');
  }

  function maximize(win, animate = true) {
    if (!win.resizable) return;
    if (win.state === 'normal') win.prev = { ...win.bounds };
    win.state = 'max';
    updateMaxBtn(win);
    setBounds(win, area(), animate);
    em.emit('change');
  }

  function restore(win, animate = true) {
    if (win.state === 'normal') return;
    win.state = 'normal';
    updateMaxBtn(win);
    if (win.prev) setBounds(win, win.prev, animate);
    em.emit('change');
  }

  function toggleMax(win) { win.state === 'normal' ? maximize(win) : restore(win); }

  function snapTo(win, rect) {
    if (win.state === 'normal') win.prev = { ...win.bounds };
    win.state = 'snap';
    updateMaxBtn(win);
    setBounds(win, rect, true);
    focus(win);
  }

  function snapZone(zone) {
    const a = area();
    const hw = Math.round(a.w / 2), hh = Math.round(a.h / 2);
    return {
      max: a,
      left: { x: 0, y: 0, w: hw, h: a.h }, right: { x: hw, y: 0, w: a.w - hw, h: a.h },
      tl: { x: 0, y: 0, w: hw, h: hh }, tr: { x: hw, y: 0, w: a.w - hw, h: hh },
      bl: { x: 0, y: hh, w: hw, h: a.h - hh }, br: { x: hw, y: hh, w: a.w - hw, h: a.h - hh },
    }[zone];
  }

  function applyZone(win, zone) {
    if (zone === 'max') maximize(win);
    else snapTo(win, snapZone(zone));
  }

  // ---------------- Фокус / сворачивание / закрытие ----------------
  function focus(win) {
    if (!win || !wins.has(win.id)) return;
    if (win.desktop !== curDesk) switchDesktop(win.desktop);
    if (win.minimized) unminimize(win);
    shownDesktop = null;
    if (activeId !== win.id || +win.el.style.zIndex !== z) win.el.style.zIndex = ++z;
    if (activeId !== win.id) {
      wins.forEach(w => w.el.classList.toggle('active', w === win));
      activeId = win.id;
      win.onFocus?.();
      em.emit('change');
    }
  }

  function blurAll() {
    if (activeId === null) return;
    activeId = null;
    wins.forEach(w => w.el.classList.remove('active'));
    em.emit('change');
  }

  function topmost(excludeId) {
    let best = null;
    wins.forEach(w => {
      if (w.id === excludeId || w.minimized || w.desktop !== curDesk) return;
      if (!best || +w.el.style.zIndex > +best.el.style.zIndex) best = w;
    });
    return best;
  }

  function minimize(win) {
    if (win.minimized) return;
    win.minimized = true;
    const btn = typeof Taskbar !== 'undefined' ? Taskbar.buttonRect(win.app) : null;
    const r = win.el.getBoundingClientRect();
    if (btn) {
      win.el.style.setProperty('--min-x', Math.round(btn.left + btn.width / 2 - (r.left + r.width / 2)) + 'px');
      win.el.style.setProperty('--min-y', Math.round(btn.top - (r.top + r.height / 2)) + 'px');
    }
    win.el.classList.add('minimizing');
    clearTimeout(win._minT);
    win._minT = setTimeout(() => { if (win.minimized) win.el.classList.add('min'); }, anims() ? 220 : 0);
    if (activeId === win.id) {
      activeId = null;
      win.el.classList.remove('active');
      const next = topmost(win.id);
      if (next) focus(next);
    }
    em.emit('change');
  }

  function unminimize(win) {
    if (!win.minimized) return;
    win.minimized = false;
    clearTimeout(win._minT);
    win.el.classList.remove('min');
    void win.el.offsetWidth;
    win.el.classList.remove('minimizing');
    em.emit('change');
  }

  async function close(win, force = false) {
    if (!wins.has(win.id) || win._closing) return false;
    if (!force && win.beforeClose) {
      focus(win);
      const ok = await win.beforeClose();
      if (!ok) return false;
    }
    win._closing = true;
    if (win.state === 'normal' && win.resizable) Persist.set('winsize.' + win.app, { w: win.bounds.w, h: win.bounds.h });
    win.el.classList.add('closing');
    wins.delete(win.id);
    try { win.onClose?.(); } catch (e) { console.error(e); }
    setTimeout(() => win.el.remove(), anims() ? 160 : 0);
    if (activeId === win.id) {
      activeId = null;
      const next = topmost();
      if (next) focus(next);
    }
    em.emit('change');
    return true;
  }

  // ---------------- Перетаскивание и изменение размера ----------------
  function bindWindow(win) {
    const el = win.el;
    el.addEventListener('pointerdown', () => focus(win), true);

    $('.wc-min', el).onclick = e => { e.stopPropagation(); minimize(win); };
    $('.wc-close', el).onclick = e => { e.stopPropagation(); close(win); };
    const maxBtn = $('.wc-max', el);
    if (maxBtn) {
      maxBtn.onclick = e => { e.stopPropagation(); hideSnapFlyout(); toggleMax(win); };
      maxBtn.addEventListener('mouseenter', () => { clearTimeout(snapHoverT); snapHoverT = setTimeout(() => showSnapFlyout(win, maxBtn), 550); });
      maxBtn.addEventListener('mouseleave', () => { clearTimeout(snapHoverT); scheduleHideSnap(); });
    }

    const tb = win.titlebar;
    tb.addEventListener('dblclick', e => {
      if (e.target.closest('.win-controls, .no-drag, input, button')) return;
      if (win.resizable) toggleMax(win);
    });
    tb.addEventListener('contextmenu', e => {
      if (e.target.closest('.no-drag, input')) return;
      e.preventDefault();
      UI.menu(e.clientX, e.clientY, windowMenu(win));
    });
    $('.win-icon', el).addEventListener('click', e => {
      const r = e.currentTarget.getBoundingClientRect();
      UI.menu(r.left, r.bottom + 4, windowMenu(win));
    });

    tb.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('.win-controls, .no-drag, input, button, select, .win-icon')) return;
      const startX = e.clientX, startY = e.clientY;
      let ox = startX - win.bounds.x, oy = startY - win.bounds.y;
      let moving = false, zone = null;
      const preview = document.getElementById('snap-preview');
      const mv = ev => {
        if (!moving) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
          moving = true;
          document.body.classList.add('wm-busy');
          if (win.state !== 'normal' && win.prev) {
            const ratio = (startX - win.bounds.x) / win.bounds.w;
            win.state = 'normal';
            updateMaxBtn(win);
            win.bounds = { ...win.bounds, w: win.prev.w, h: win.prev.h };
            ox = Math.round(win.prev.w * ratio);
            oy = Math.min(oy, 20);
            em.emit('change');
          }
        }
        const a = area();
        const nx = ev.clientX - ox;
        const ny = clamp(ev.clientY - oy, 0, a.h - 36);
        setBounds(win, { x: nx, y: ny });
        if (win.resizable) {
          zone = detectZone(ev.clientX, ev.clientY);
          if (zone) {
            const r = snapZone(zone);
            Object.assign(preview.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
            preview.classList.add('show');
          } else preview.classList.remove('show');
        }
      };
      const up = () => {
        removeEventListener('pointermove', mv);
        removeEventListener('pointerup', up);
        document.body.classList.remove('wm-busy');
        preview.classList.remove('show');
        if (moving && zone) applyZone(win, zone);
      };
      addEventListener('pointermove', mv);
      addEventListener('pointerup', up);
    });

    $$('.rz', el).forEach(hd => hd.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      focus(win);
      if (win.state !== 'normal') { win.state = 'normal'; updateMaxBtn(win); em.emit('change'); }
      const dir = hd.dataset.dir;
      const s = { ...win.bounds };
      const sx = e.clientX, sy = e.clientY;
      document.body.classList.add('wm-busy');
      document.body.style.cursor = getComputedStyle(hd).cursor;
      const mv = ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        let { x, y, w, h } = s;
        if (dir.includes('e')) w = Math.max(win.minW, s.w + dx);
        if (dir.includes('w')) { w = Math.max(win.minW, s.w - dx); x = s.x + s.w - w; }
        if (dir.includes('s')) h = Math.max(win.minH, s.h + dy);
        if (dir.includes('n')) { h = Math.max(win.minH, s.h - dy); y = s.y + s.h - h; if (y < 0) { h += y; y = 0; } }
        setBounds(win, { x, y, w, h });
      };
      const up = () => {
        removeEventListener('pointermove', mv);
        removeEventListener('pointerup', up);
        document.body.classList.remove('wm-busy');
        document.body.style.cursor = '';
      };
      addEventListener('pointermove', mv);
      addEventListener('pointerup', up);
    }));
  }

  function detectZone(x, y) {
    const a = area();
    const e = 6;
    if (y <= e) return x < 60 ? 'tl' : x > a.w - 60 ? 'tr' : 'max';
    if (x <= e) return y < a.h * 0.22 ? 'tl' : y > a.h * 0.78 ? 'bl' : 'left';
    if (x >= a.w - e - 1) return y < a.h * 0.22 ? 'tr' : y > a.h * 0.78 ? 'br' : 'right';
    return null;
  }

  function windowMenu(win) {
    return [
      { label: 'Восстановить', icon: 'restore', disabled: win.state === 'normal', action: () => restore(win) },
      { label: 'Свернуть', icon: 'minimize', action: () => minimize(win) },
      { label: 'Развернуть', icon: 'maximize', disabled: win.state === 'max' || !win.resizable, action: () => maximize(win) },
      { label: 'Прикрепить', icon: 'snap', disabled: !win.resizable, items: [
        { label: 'Слева', action: () => applyZone(win, 'left') },
        { label: 'Справа', action: () => applyZone(win, 'right') },
        { label: 'Вверху слева', action: () => applyZone(win, 'tl') },
        { label: 'Вверху справа', action: () => applyZone(win, 'tr') },
        { label: 'Внизу слева', action: () => applyZone(win, 'bl') },
        { label: 'Внизу справа', action: () => applyZone(win, 'br') },
      ] },
      desktops.length > 1 ? { label: 'Переместить на', icon: 'taskview', items: desktops.map((d, i) => ({ label: d.name, disabled: i === win.desktop, action: () => moveToDesktop(win, i) })) } : null,
      { sep: true },
      { label: 'Закрыть', icon: 'close', shortcut: 'Ctrl+Alt+W', action: () => close(win) },
    ];
  }

  // ---------------- Макеты прикрепления ----------------
  let snapFly = null, snapHoverT, snapHideT;

  function showSnapFlyout(win, btn) {
    hideSnapFlyout();
    const f = h('<div class="snap-flyout glass"></div>');
    SNAP_LAYOUTS.forEach(layout => {
      const lay = h('<div class="snap-layout"></div>');
      layout.forEach(zr => {
        const zEl = h('<div class="snap-zone"></div>');
        Object.assign(zEl.style, { left: zr[0] * 100 + '%', top: zr[1] * 100 + '%', width: `calc(${zr[2] * 100}% - 3px)`, height: `calc(${zr[3] * 100}% - 3px)` });
        zEl.onclick = () => { hideSnapFlyout(); snapTo(win, fracRect(zr)); };
        lay.append(zEl);
      });
      f.append(lay);
    });
    f.addEventListener('mouseenter', () => clearTimeout(snapHideT));
    f.addEventListener('mouseleave', scheduleHideSnap);
    document.getElementById('overlay-layer').append(f);
    const r = btn.getBoundingClientRect();
    const fr = f.getBoundingClientRect();
    f.style.left = clamp(r.left + r.width / 2 - fr.width / 2, 6, innerWidth - fr.width - 6) + 'px';
    f.style.top = (r.bottom + 6) + 'px';
    snapFly = f;
    requestAnimationFrame(() => f.classList.add('show'));
  }
  function scheduleHideSnap() { clearTimeout(snapHideT); snapHideT = setTimeout(hideSnapFlyout, 280); }
  function hideSnapFlyout() { clearTimeout(snapHideT); snapFly?.remove(); snapFly = null; }

  // ---------------- Виртуальные рабочие столы ----------------
  function switchDesktop(i) {
    if (i < 0 || i >= desktops.length || i === curDesk) return;
    curDesk = i;
    wins.forEach(w => w.el.classList.toggle('other-desk', w.desktop !== curDesk));
    const top = topmost();
    if (top) focus(top); else blurAll();
    em.emit('desktops');
    em.emit('change');
  }

  function addDesktop() {
    desktops.push({ name: 'Рабочий стол ' + (desktops.length + 1) });
    em.emit('desktops');
    return desktops.length - 1;
  }

  function removeDesktop(i) {
    if (desktops.length <= 1) return;
    const target = i === 0 ? 1 : i - 1;
    wins.forEach(w => { if (w.desktop === i) w.desktop = target; });
    desktops.splice(i, 1);
    wins.forEach(w => { if (w.desktop > i) w.desktop--; });
    desktops.forEach((d, k) => { if (/^Рабочий стол \d+$/.test(d.name)) d.name = 'Рабочий стол ' + (k + 1); });
    if (curDesk >= i && curDesk > 0) curDesk--;
    curDesk = Math.min(curDesk, desktops.length - 1);
    wins.forEach(w => w.el.classList.toggle('other-desk', w.desktop !== curDesk));
    em.emit('desktops');
    em.emit('change');
  }

  function moveToDesktop(win, i) {
    win.desktop = i;
    win.el.classList.toggle('other-desk', i !== curDesk);
    if (activeId === win.id && i !== curDesk) { activeId = null; win.el.classList.remove('active'); const t = topmost(); if (t) focus(t); }
    em.emit('change');
    em.emit('desktops');
  }

  // ---------------- Прочее ----------------
  function toggleDesktop() {
    const visible = [...wins.values()].filter(w => w.desktop === curDesk && !w.minimized);
    if (visible.length) {
      shownDesktop = visible.map(w => w.id);
      visible.forEach(minimize);
      blurAll();
    } else if (shownDesktop) {
      const ids = shownDesktop;
      ids.forEach(id => { const w = wins.get(id); if (w) unminimize(w); });
      const last = wins.get(ids[0]);
      if (last) focus(last);
      shownDesktop = null;
    }
  }

  addEventListener('resize', debounce(() => {
    const a = area();
    wins.forEach(w => {
      if (w.state === 'max') setBounds(w, a);
      else {
        const b = w.bounds;
        setBounds(w, { x: clamp(b.x, -b.w + 120, a.w - 120), y: clamp(b.y, 0, a.h - 40), w: Math.min(b.w, a.w), h: Math.min(b.h, a.h) });
      }
    });
  }, 100));
  Store.on('taskbarAutoHide', () => dispatchEvent(new Event('resize')));

  return {
    open, area, on: (e, f) => em.on(e, f),
    list: () => [...wins.values()],
    visible: () => [...wins.values()].filter(w => w.desktop === curDesk),
    get: id => wins.get(id),
    active: () => wins.get(activeId) || null,
    byApp: app => [...wins.values()].filter(w => w.app === app),
    focus, blurAll, minimize, restore, maximize, close, topmost,
    snap: (win, zone) => applyZone(win, zone),
    toggleDesktop,
    async closeAll(force = true) { for (const w of [...wins.values()]) await close(w, force); },
    desktops: {
      list: () => desktops, current: () => curDesk,
      switch: switchDesktop, add: addDesktop, remove: removeDesktop, move: moveToDesktop,
      rename(i, n) { desktops[i].name = n; em.emit('desktops'); },
    },
  };
})();
