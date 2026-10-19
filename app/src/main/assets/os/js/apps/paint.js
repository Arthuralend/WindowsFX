/* Paint */
'use strict';

Apps.register({
  id: 'paint', name: 'Paint', icon: 'paint', desc: 'Рисование и редактирование изображений',
  keywords: 'рисование рисовалка графика paint картинка',
  launch: args => openPaint(args),
});

function openPaint(args = {}) {
  const PALETTE = ['#000000', '#7f7f7f', '#880015', '#ed1c24', '#ff7f27', '#fff200', '#22b14c', '#00a2e8', '#3f48cc', '#a349a4',
    '#ffffff', '#c3c3c3', '#b97a57', '#ffaec9', '#ffc90e', '#efe4b0', '#b5e61d', '#99d9ea', '#7092be', '#c8bfe7'];
  const TOOLS = [['pencil', 'Карандаш'], ['brush', 'Кисть'], ['eraser', 'Ластик'], ['bucket', 'Заливка'], ['picker', 'Пипетка'], ['text', 'Текст'], ['line', 'Линия'], ['rect', 'Прямоугольник'], ['ellipse', 'Эллипс']];
  let tool = 'brush', size = 6, c1 = '#000000', c2 = '#ffffff', fillShape = false, zoom = 1;
  let path = null, dirty = false;
  const undo = [], redo = [];

  const win = WM.open({ app: 'paint', title: 'Безымянный — Paint', width: 1000, height: 680, minWidth: 560, minHeight: 380 });
  const b = win.body;
  b.classList.add('pt');
  b.innerHTML = `
    <div class="pt-bar">
      <div class="pt-group">
        <button class="tb-text-btn pt-file">${Icons.ui('file', 16)}Файл ${Icons.ui('chevron-down', 10)}</button>
        <button class="icon-btn pt-undo" title="Отменить (Ctrl+Z)">${Icons.ui('undo', 16)}</button>
        <button class="icon-btn pt-redo" title="Повторить (Ctrl+Y)">${Icons.ui('redo', 16)}</button>
      </div>
      <div class="pt-group pt-tools"></div>
      <div class="pt-group"><label class="pt-size">${Icons.ui('brush', 14)}<input type="range" class="slider" min="1" max="60" value="${size}"><span>${size}px</span></label>
        <button class="icon-btn pt-fill" title="Заливка фигур">${Icons.ui('rect', 16)}</button></div>
      <div class="pt-group pt-colors">
        <div class="pt-cur"><div class="pt-c1" title="Цвет 1 (левая кнопка)"></div><div class="pt-c2" title="Цвет 2 (правая кнопка)"></div></div>
        <div class="pt-pal"></div>
        <label class="pt-custom" title="Изменить цвет">${Icons.ui('palette', 18)}<input type="color"></label>
      </div>
    </div>
    <div class="pt-stage"><div class="pt-canvas-wrap"><canvas class="pt-canvas"></canvas><canvas class="pt-overlay"></canvas></div></div>
    <div class="statusbar"><span class="pt-pos">${Icons.ui('plus', 12)}</span><span class="pt-dim"></span><span class="spacer"></span>
      <button class="icon-btn sm pt-zout">${Icons.ui('zoom-out', 14)}</button><span class="pt-zoom">100%</span><button class="icon-btn sm pt-zin">${Icons.ui('zoom-in', 14)}</button></div>`;
  const cv = $('.pt-canvas', b), ov = $('.pt-overlay', b), wrap = $('.pt-canvas-wrap', b), stage = $('.pt-stage', b);
  const ctx = cv.getContext('2d', { willReadFrequently: true }), octx = ov.getContext('2d');

  function setSize(w, hgt, keep = true) {
    const old = keep ? ctx.getImageData(0, 0, cv.width, cv.height) : null;
    cv.width = ov.width = w; cv.height = ov.height = hgt;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hgt);
    if (old) ctx.putImageData(old, 0, 0);
    applyZoom();
  }
  function applyZoom() {
    wrap.style.width = cv.width * zoom + 'px';
    wrap.style.height = cv.height * zoom + 'px';
    $('.pt-zoom', b).textContent = Math.round(zoom * 100) + '%';
    $('.pt-dim', b).textContent = `${cv.width} × ${cv.height} пкс`;
  }
  function setZoom(z) { zoom = clamp(Math.round(z * 100) / 100, 0.1, 8); applyZoom(); }

  const snapshot = () => { undo.push(ctx.getImageData(0, 0, cv.width, cv.height)); if (undo.length > 40) undo.shift(); redo.length = 0; markDirty(); updUndo(); };
  function doUndo() { if (!undo.length) return; redo.push(ctx.getImageData(0, 0, cv.width, cv.height)); const d = undo.pop(); if (d.width !== cv.width || d.height !== cv.height) { cv.width = ov.width = d.width; cv.height = ov.height = d.height; applyZoom(); } ctx.putImageData(d, 0, 0); markDirty(); updUndo(); }
  function doRedo() { if (!redo.length) return; undo.push(ctx.getImageData(0, 0, cv.width, cv.height)); const d = redo.pop(); if (d.width !== cv.width || d.height !== cv.height) { cv.width = ov.width = d.width; cv.height = ov.height = d.height; applyZoom(); } ctx.putImageData(d, 0, 0); markDirty(); updUndo(); }
  function updUndo() { $('.pt-undo', b).disabled = !undo.length; $('.pt-redo', b).disabled = !redo.length; }
  function markDirty(v = true) { dirty = v; win.setTitle((dirty ? '*' : '') + (path ? FS.basename(path) : 'Безымянный') + ' — Paint'); }

  // ---------- Панель ----------
  const toolsEl = $('.pt-tools', b);
  const TOOL_ICONS = { pencil: 'pencil', brush: 'brush', eraser: 'eraser', bucket: 'bucket', picker: 'picker', text: 'text', line: 'line', rect: 'rect', ellipse: 'ellipse' };
  TOOLS.forEach(([t, n]) => {
    const x = h(`<button class="icon-btn" data-t="${t}" title="${n}">${Icons.ui(TOOL_ICONS[t], 18)}</button>`);
    x.onclick = () => { tool = t; renderTools(); };
    toolsEl.append(x);
  });
  function renderTools() {
    $$('[data-t]', toolsEl).forEach(x => x.classList.toggle('active', x.dataset.t === tool));
    $('.pt-fill', b).classList.toggle('active', fillShape);
    stage.dataset.tool = tool;
  }
  const pal = $('.pt-pal', b);
  PALETTE.forEach(c => {
    const s = h(`<button class="pt-sw" style="background:${c}" title="${c}"></button>`);
    s.onclick = () => { c1 = c; renderColors(); };
    s.oncontextmenu = e => { e.preventDefault(); c2 = c; renderColors(); };
    pal.append(s);
  });
  function renderColors() { $('.pt-c1', b).style.background = c1; $('.pt-c2', b).style.background = c2; $('.pt-custom input', b).value = c1; }
  $('.pt-custom input', b).oninput = e => { c1 = e.target.value; renderColors(); };
  $('.pt-cur', b).onclick = () => { [c1, c2] = [c2, c1]; renderColors(); };
  const sizeIn = $('.pt-size input', b);
  sizeIn.oninput = () => { size = +sizeIn.value; $('.pt-size span', b).textContent = size + 'px'; };
  $('.pt-fill', b).onclick = () => { fillShape = !fillShape; renderTools(); };
  $('.pt-undo', b).onclick = doUndo;
  $('.pt-redo', b).onclick = doRedo;
  $('.pt-zin', b).onclick = () => setZoom(zoom * 1.25);
  $('.pt-zout', b).onclick = () => setZoom(zoom / 1.25);

  // ---------- Рисование ----------
  const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom }; };
  let drawing = null;

  cv.addEventListener('pointerdown', async e => {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    const color = e.button === 2 ? c2 : c1;
    const p = pos(e);
    if (tool === 'picker') {
      const d = ctx.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
      const hex = '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
      if (e.button === 2) c2 = hex; else c1 = hex;
      renderColors();
      tool = 'brush'; renderTools();
      return;
    }
    if (tool === 'bucket') { snapshot(); flood(Math.floor(p.x), Math.floor(p.y), color); return; }
    if (tool === 'text') {
      const text = await UI.prompt('Текст', 'Введите текст для вставки:', '');
      if (!text) return;
      snapshot();
      ctx.fillStyle = color;
      ctx.font = `${Math.max(12, size * 4)}px "Segoe UI", sans-serif`;
      ctx.textBaseline = 'top';
      text.split('\n').forEach((line, i) => ctx.fillText(line, p.x, p.y + i * Math.max(12, size * 4) * 1.2));
      return;
    }
    snapshot();
    cv.setPointerCapture(e.pointerId);
    drawing = { start: p, last: p, color };
    if (['pencil', 'brush', 'eraser'].includes(tool)) stroke(p, p);
  });
  cv.addEventListener('pointermove', e => {
    const p = pos(e);
    $('.pt-pos', b).innerHTML = `${Icons.ui('plus', 12)} ${Math.floor(p.x)}, ${Math.floor(p.y)} пкс`;
    if (!drawing) return;
    if (['pencil', 'brush', 'eraser'].includes(tool)) { stroke(drawing.last, p); drawing.last = p; }
    else { octx.clearRect(0, 0, ov.width, ov.height); shape(octx, drawing.start, p, drawing.color, e.shiftKey); }
  });
  const end = e => {
    if (!drawing) return;
    if (['line', 'rect', 'ellipse'].includes(tool)) { octx.clearRect(0, 0, ov.width, ov.height); shape(ctx, drawing.start, pos(e), drawing.color, e.shiftKey); }
    drawing = null;
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerleave', () => { $('.pt-pos', b).innerHTML = Icons.ui('plus', 12); });

  function stroke(a, c) {
    ctx.save();
    ctx.lineCap = ctx.lineJoin = tool === 'pencil' ? 'square' : 'round';
    ctx.strokeStyle = tool === 'eraser' ? c2 : drawing.color;
    ctx.lineWidth = tool === 'pencil' ? Math.max(1, Math.round(size / 3)) : tool === 'eraser' ? size * 2 : size;
    if (tool === 'brush') { ctx.shadowColor = drawing.color; ctx.shadowBlur = size / 3; }
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(c.x + (a.x === c.x && a.y === c.y ? 0.01 : 0), c.y);
    ctx.stroke();
    ctx.restore();
  }

  function shape(g, a, c, color, square) {
    let w = c.x - a.x, hh = c.y - a.y;
    if (square && tool !== 'line') { const m = Math.max(Math.abs(w), Math.abs(hh)); w = Math.sign(w || 1) * m; hh = Math.sign(hh || 1) * m; }
    g.save();
    g.strokeStyle = color; g.fillStyle = fillShape ? (color === c1 ? c2 : c1) : color;
    g.lineWidth = Math.max(1, size / 2); g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    if (tool === 'line') {
      let ex = c.x, ey = c.y;
      if (square) { const ang = Math.round(Math.atan2(c.y - a.y, c.x - a.x) / (Math.PI / 4)) * Math.PI / 4; const len = Math.hypot(c.x - a.x, c.y - a.y); ex = a.x + Math.cos(ang) * len; ey = a.y + Math.sin(ang) * len; }
      g.moveTo(a.x, a.y); g.lineTo(ex, ey); g.stroke();
    } else if (tool === 'rect') {
      g.rect(a.x, a.y, w, hh);
      if (fillShape) g.fill();
      g.stroke();
    } else {
      g.ellipse(a.x + w / 2, a.y + hh / 2, Math.abs(w / 2), Math.abs(hh / 2), 0, 0, Math.PI * 2);
      if (fillShape) g.fill();
      g.stroke();
    }
    g.restore();
  }

  function flood(x, y, hex) {
    const W = cv.width, H = cv.height;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const img = ctx.getImageData(0, 0, W, H);
    const d = new Uint32Array(img.data.buffer);
    const tr = parseInt(hex.slice(1, 3), 16), tg = parseInt(hex.slice(3, 5), 16), tb = parseInt(hex.slice(5, 7), 16);
    const fill = ((255 << 24) | (tb << 16) | (tg << 8) | tr) >>> 0;
    const target = d[y * W + x];
    if (target === fill) return;
    const tR = target & 255, tG = (target >> 8) & 255, tB = (target >> 16) & 255, tA = (target >>> 24);
    const tol = 40;
    const match = i => { const v = d[i]; return Math.abs((v & 255) - tR) <= tol && Math.abs(((v >> 8) & 255) - tG) <= tol && Math.abs(((v >> 16) & 255) - tB) <= tol && Math.abs((v >>> 24) - tA) <= tol; };
    const seen = new Uint8Array(W * H);
    const stack = [[x, y]];
    while (stack.length) {
      let [cx, cy] = stack.pop();
      let i = cy * W + cx;
      while (cx >= 0 && match(i) && !seen[i]) { cx--; i--; }
      cx++; i++;
      let up = false, dn = false;
      while (cx < W && match(i) && !seen[i]) {
        d[i] = fill; seen[i] = 1;
        if (cy > 0) { const u = i - W; if (match(u) && !seen[u]) { if (!up) { stack.push([cx, cy - 1]); up = true; } } else up = false; }
        if (cy < H - 1) { const dd = i + W; if (match(dd) && !seen[dd]) { if (!dn) { stack.push([cx, cy + 1]); dn = true; } } else dn = false; }
        cx++; i++;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // ---------- Файлы ----------
  async function confirmDiscard() {
    if (!dirty) return true;
    const r = await UI.dialog({ title: 'Paint', appIcon: 'paint', message: `Сохранить изменения в «${path ? FS.basename(path) : 'Безымянный'}»?`, sound: false,
      buttons: [{ label: 'Сохранить', value: 'save', primary: true }, { label: 'Не сохранять', value: 'no' }, { label: 'Отмена', value: 'cancel', cancel: true }] });
    if (r.button === 'save') return save();
    return r.button === 'no';
  }
  async function save() {
    if (!path || !/\.(png|jpe?g|webp)$/i.test(path)) return saveAs();
    try {
      const type = /\.jpe?g$/i.test(path) ? 'image/jpeg' : /\.webp$/i.test(path) ? 'image/webp' : 'image/png';
      FS.write(path, cv.toDataURL(type, 0.92));
      markDirty(false);
      FileOps.addRecent(path);
      return true;
    } catch (e) { UI.alert('Paint', e.message, 'error'); return false; }
  }
  async function saveAs() {
    const p = await UI.filePicker({ mode: 'save', dir: path ? FS.parent(path) : FS.P.pictures, name: path ? FS.stem(FS.basename(path)) + '.png' : 'Рисунок.png', ext: 'png', title: 'Сохранить как', typeLabel: 'PNG (*.png), JPEG (*.jpg)' });
    if (!p) return false;
    path = p;
    return save();
  }
  function loadImage(url, p) {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 4000 / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * k)), hh = Math.max(1, Math.round(img.height * k));
      cv.width = ov.width = w; cv.height = ov.height = hh;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh);
      ctx.drawImage(img, 0, 0, w, hh);
      undo.length = redo.length = 0; updUndo();
      path = p || null;
      fitZoom();
      markDirty(!p);
    };
    img.onerror = () => UI.alert('Paint', 'Не удалось открыть изображение.', 'error');
    img.src = url;
  }
  function fitZoom() {
    const r = stage.getBoundingClientRect();
    zoom = Math.min(1, (r.width - 40) / cv.width, (r.height - 40) / cv.height);
    setZoom(zoom > 0 ? zoom : 1);
  }
  async function open() {
    if (!await confirmDiscard()) return;
    const p = await UI.filePicker({ mode: 'open', dir: FS.P.pictures, kinds: ['image'], typeLabel: 'Изображения' });
    if (p) { loadImage(FS.read(p), p); FileOps.addRecent(p); }
  }
  async function newImage() {
    if (!await confirmDiscard()) return;
    const content = h(`<div class="row-gap"><label>Ширина <input class="input pw" type="number" min="16" max="4000" value="${cv.width}" style="width:90px"></label><label>Высота <input class="input ph" type="number" min="16" max="4000" value="${cv.height}" style="width:90px"></label></div>`);
    const r = await UI.dialog({ title: 'Новый рисунок', content, sound: false, buttons: [{ label: 'Создать', value: true, primary: true }, { label: 'Отмена', value: false, cancel: true }] });
    if (!r.button) return;
    path = null; undo.length = redo.length = 0; updUndo();
    setSize(clamp(+$('.pw', content).value || 1024, 16, 4000), clamp(+$('.ph', content).value || 640, 16, 4000), false);
    markDirty(false);
  }
  async function resizeCanvas() {
    const content = h(`<div class="row-gap"><label>Ширина <input class="input pw" type="number" min="16" max="4000" value="${cv.width}" style="width:90px"></label><label>Высота <input class="input ph" type="number" min="16" max="4000" value="${cv.height}" style="width:90px"></label></div>`);
    const r = await UI.dialog({ title: 'Размер холста', content, sound: false, buttons: [{ label: 'OK', value: true, primary: true }, { label: 'Отмена', value: false, cancel: true }] });
    if (!r.button) return;
    snapshot();
    setSize(clamp(+$('.pw', content).value, 16, 4000), clamp(+$('.ph', content).value, 16, 4000));
  }
  function transform(kind) {
    snapshot();
    const tmp = document.createElement('canvas');
    tmp.width = cv.width; tmp.height = cv.height;
    tmp.getContext('2d').drawImage(cv, 0, 0);
    if (kind === 'rot') { cv.width = ov.width = tmp.height; cv.height = ov.height = tmp.width; }
    ctx.save();
    if (kind === 'flipH') { ctx.translate(cv.width, 0); ctx.scale(-1, 1); }
    if (kind === 'flipV') { ctx.translate(0, cv.height); ctx.scale(1, -1); }
    if (kind === 'rot') { ctx.translate(cv.width, 0); ctx.rotate(Math.PI / 2); }
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
    applyZoom();
  }

  $('.pt-file', b).onclick = e => {
    const r = e.currentTarget.getBoundingClientRect();
    UI.menu(r.left, r.bottom + 4, [
      { label: 'Создать', icon: 'new-file', shortcut: 'Ctrl+N', action: newImage },
      { label: 'Открыть…', icon: 'folder-open', shortcut: 'Ctrl+O', action: open },
      { label: 'Сохранить', icon: 'save', shortcut: 'Ctrl+S', action: save },
      { label: 'Сохранить как…', action: saveAs },
      { sep: true },
      { label: 'Импорт с компьютера…', icon: 'upload', action: () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = async () => { if (inp.files[0] && await confirmDiscard()) loadImage(await readFileAs(inp.files[0])); }; inp.click(); } },
      { label: 'Скачать PNG', icon: 'download', action: () => downloadBlob((path ? FS.stem(FS.basename(path)) : 'Рисунок') + '.png', cv.toDataURL('image/png')) },
      { label: 'Сделать фоном рабочего стола', icon: 'image', action: async () => { const url = await downscaleImage(cv.toDataURL('image/png'), 1920, 'image/jpeg', 0.88); Store.set('customWallpaper', url); Store.set('wallpaper', 'custom'); } },
      { sep: true },
      { label: 'Изображение', icon: 'image', items: [
        { label: 'Размер холста…', action: resizeCanvas },
        { label: 'Повернуть на 90°', icon: 'rotate', action: () => transform('rot') },
        { label: 'Отразить по горизонтали', action: () => transform('flipH') },
        { label: 'Отразить по вертикали', action: () => transform('flipV') },
        { label: 'Очистить', icon: 'trash', action: () => { snapshot(); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); } },
      ] },
      { sep: true },
      { label: 'Выход', action: () => win.close() },
    ]);
  };

  stage.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); } }, { passive: false });
  win.el.addEventListener('keydown', e => {
    if (e.target.closest('input')) return;
    if (e.ctrlKey && e.code === 'KeyZ') { e.preventDefault(); doUndo(); }
    else if (e.ctrlKey && e.code === 'KeyY') { e.preventDefault(); doRedo(); }
    else if (e.ctrlKey && e.code === 'KeyS') { e.preventDefault(); save(); }
    else if (e.ctrlKey && e.code === 'KeyO') { e.preventDefault(); open(); }
    else if (e.ctrlKey && e.code === 'KeyN') { e.preventDefault(); newImage(); }
    else if (!e.ctrlKey && !e.altKey) {
      const map = { KeyB: 'brush', KeyP: 'pencil', KeyE: 'eraser', KeyF: 'bucket', KeyI: 'picker', KeyT: 'text', KeyL: 'line', KeyR: 'rect', KeyO: 'ellipse' };
      if (map[e.code]) { tool = map[e.code]; renderTools(); }
      if (e.key === '[') { size = Math.max(1, size - 2); sizeIn.value = size; sizeIn.dispatchEvent(new Event('input', { bubbles: true })); }
      if (e.key === ']') { size = Math.min(60, size + 2); sizeIn.value = size; sizeIn.dispatchEvent(new Event('input', { bubbles: true })); }
    }
  });
  win.el.tabIndex = -1;
  win.beforeClose = confirmDiscard;

  setSize(1024, 640, false);
  renderTools(); renderColors(); updUndo();
  if (args.path) { try { loadImage(FS.read(args.path), FS.realPath(args.path)); FileOps.addRecent(args.path); } catch (e) { UI.alert('Paint', e.message, 'error'); } }
  else setTimeout(fitZoom, 50);
  return win;
}
