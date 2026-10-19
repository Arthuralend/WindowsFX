/* Фотографии: галерея по папкам, просмотр с жестами, слайд-шоу, видео, сведения */
'use strict';

Apps.register({
  id: 'photos', name: 'Фотографии', icon: 'photos', desc: 'Просмотр фото и видео',
  keywords: 'фото картинки изображения галерея видео photos gallery',
  launch: args => openPhotos(args),
});

function openPhotos(args = {}) {
  const win = WM.open({ app: 'photos', title: 'Фотографии', width: 1040, height: 680, minWidth: 380, minHeight: 300, className: 'ph-win' });
  const b = win.body;
  b.classList.add('ph2');

  const MEDIA = ['image', 'video'];
  const isMedia = (p, n) => MEDIA.includes(FS.typeOf(p, n).kind);
  const sources = () => {
    const s = [
      { key: 'pictures', name: 'Изображения', path: FS.P.pictures, icon: 'folder-images' },
      FS.P.camera ? { key: 'camera', name: 'Камера', path: FS.P.camera + '/Camera', alt: FS.P.camera, icon: 'folder-images' } : null,
      FS.P.camera ? { key: 'shots', name: 'Скриншоты', path: FS.P.pictures + '/Screenshots', alt: FS.P.camera + '/Screenshots', icon: 'folder-images' } : null,
      { key: 'downloads', name: 'Загрузки', path: FS.P.downloads, icon: 'folder-downloads' },
      { key: 'videos', name: 'Видео', path: FS.P.videos, icon: 'folder-video' },
    ].filter(Boolean);
    return s.map(x => (FS.isDir(x.path) ? x : x.alt && FS.isDir(x.alt) ? { ...x, path: x.alt } : x));
  };

  let mode = 'grid';
  let folder = null;           // текущая папка галереи
  let list = [];               // пути медиафайлов текущей папки
  let idx = 0;
  let slideT = null;
  let showInfo = false;

  function collect(dir, deep = false) {
    const out = [];
    const walk = (d, depth) => {
      let items = [];
      try { items = FS.list(d); } catch { return; }
      for (const it of items) {
        if (it.isDir) { if (deep && depth < 2) walk(it.path, depth + 1); continue; }
        if (isMedia(it.path, it.node)) out.push({ path: it.path, mt: it.node.mt || 0 });
      }
    };
    walk(dir, 0);
    return out.sort((a, c) => c.mt - a.mt).map(x => x.path);
  }

  // ======================================================== галерея
  function renderGrid() {
    mode = 'grid';
    stopSlides();
    const srcs = sources();
    if (!folder) folder = srcs[0].path;
    list = collect(folder);
    win.setTitle('Фотографии');
    b.innerHTML = `
      <div class="ph2-top">
        <div class="ph2-tabs"></div>
        <span class="spacer"></span>
        <button class="btn sm ph2-folder">${Icons.ui('folder-open', 14)} Папка…</button>
        <button class="btn sm ph2-imp">${Icons.ui('upload', 14)} Импорт</button>
      </div>
      <div class="ph2-path muted small"></div>
      <div class="ph2-grid"></div>`;
    const tabsEl = $('.ph2-tabs', b);
    srcs.forEach(s => {
      const t = h(`<button class="ph2-tab ${s.path === folder ? 'on' : ''}">${esc(s.name)}</button>`);
      t.onclick = () => { folder = s.path; renderGrid(); };
      tabsEl.append(t);
    });
    if (!srcs.some(s => s.path === folder)) tabsEl.append(h(`<button class="ph2-tab on">${esc(FS.basename(folder))}</button>`));
    $('.ph2-path', b).textContent = FS.display(folder) + ' · ' + list.length + ' ' + plural(list.length, 'файл', 'файла', 'файлов');
    $('.ph2-folder', b).onclick = async () => {
      const p = await pickFolder();
      if (p) { folder = p; renderGrid(); }
    };
    $('.ph2-imp', b).onclick = () => {
      if (FX.available && FS.isDevice(folder)) FX.call('importDocument', 'image/*', FS.toNative(folder));
      else FileOps.uploadInto(folder, 'image/*,video/*');
    };
    const g = $('.ph2-grid', b);
    if (!list.length) {
      g.innerHTML = `<div class="empty-state">${Icons.get('photos', 64)}<div>В этой папке нет фото и видео.</div></div>`;
      return;
    }
    // ленивое добавление плиток порциями
    let i = 0;
    const addChunk = () => {
      const frag = document.createDocumentFragment();
      for (let k = 0; k < 120 && i < list.length; k++, i++) {
        const p = list[i];
        const n = FS.get(p);
        const kind = FS.typeOf(p, n).kind;
        const tile = h(`<div class="ph2-tile" data-i="${i}"><img loading="lazy" draggable="false" alt="">${kind === 'video' ? `<span class="ph2-play">${Icons.ui('play', 18)}</span>` : ''}</div>`);
        $('img', tile).src = FS.thumb(p, n, 320);
        if (kind === 'video' && !n?.dev) $('img', tile).replaceWith(h(`<div class="ph2-vid">${Icons.get('file-video', 48)}</div>`));
        const at = i;
        tile.onclick = () => { idx = at; renderOne(); };
        tile.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); UI.menu(e.clientX, e.clientY, itemMenu(p)); };
        frag.append(tile);
      }
      g.append(frag);
    };
    addChunk();
    g.onscroll = () => { if (i < list.length && g.scrollTop + g.clientHeight > g.scrollHeight - 600) addChunk(); };
  }

  async function pickFolder() {
    const p = await UI.filePicker({ mode: 'open', dir: folder, title: 'Выберите любой файл в нужной папке', kinds: MEDIA, typeLabel: 'Фото и видео' });
    return p ? FS.parent(p) : null;
  }

  function itemMenu(p) {
    const kind = FS.typeOf(p).kind;
    return [
      { label: 'Открыть', icon: 'image', action: () => { idx = list.indexOf(p); renderOne(); } },
      kind === 'image' ? { label: 'Изменить в Paint', icon: 'brush', action: () => Apps.launch('paint', { path: p }) } : null,
      kind === 'image' && Apps.get('prism') ? { label: 'Изменить в Prism', icon: 'app:prism', action: () => Apps.launch('prism', { path: p }) } : null,
      kind === 'image' ? { label: 'Сделать фоном рабочего стола', icon: 'desktop', action: () => FileOps.setWallpaper(p) } : null,
      FS.isDevice(p) ? { label: 'Поделиться…', icon: 'share', action: () => FX.call('share', FS.toNative(p)) } : null,
      FS.isDevice(p) ? { label: 'Открыть в другом приложении', icon: 'external', action: () => FX.call('openExternal', FS.toNative(p), true) } : null,
      { label: 'Показать в Проводнике', icon: 'folder', action: () => Apps.launch('explorer', { path: FS.parent(p), select: p }) },
      { sep: true },
      { label: 'Удалить', icon: 'trash', action: () => del(p) },
    ];
  }

  async function del(p) {
    await FileOps.remove([p]);
    if (FS.get(p)) return;
    const i = list.indexOf(p);
    if (i >= 0) list.splice(i, 1);
    if (mode === 'one') { if (!list.length) renderGrid(); else { idx = Math.min(idx, list.length - 1); renderOne(); } }
  }

  // ======================================================== просмотр
  let zoom = 1, rot = 0, tx = 0, ty = 0;

  function renderOne() {
    mode = 'one';
    const p = list[idx];
    const node = p && FS.get(p);
    if (!node) { renderGrid(); return; }
    zoom = 1; rot = 0; tx = 0; ty = 0;
    const kind = FS.typeOf(p, node).kind;
    win.setTitle(FS.basename(p) + ' — Фотографии');
    b.innerHTML = `
      <div class="ph2-bar">
        <button class="icon-btn ph-back" title="Галерея">${Icons.ui('back', 16)}</button>
        <b class="ellip ph2-name">${esc(FS.basename(p))}</b>
        <span class="muted small ph2-count">${idx + 1} из ${list.length}</span>
        <span class="spacer"></span>
        ${kind === 'image' ? `
        <button class="icon-btn ph-zo" title="Уменьшить">${Icons.ui('zoom-out', 16)}</button>
        <button class="icon-btn ph-fit" title="По размеру окна">${Icons.ui('maximize', 14)}</button>
        <button class="icon-btn ph-zi" title="Увеличить">${Icons.ui('zoom-in', 16)}</button>
        <button class="icon-btn ph-rot" title="Повернуть">${Icons.ui('rotate', 16)}</button>
        <button class="icon-btn ph-edit" title="Изменить">${Icons.ui('brush', 16)}</button>` : ''}
        <button class="icon-btn ph-slide" title="Слайд-шоу">${Icons.ui(slideT ? 'pause' : 'play', 16)}</button>
        <button class="icon-btn ph-info ${showInfo ? 'active' : ''}" title="Сведения">${Icons.ui('info', 16)}</button>
        <button class="icon-btn ph-del" title="Удалить">${Icons.ui('trash', 16)}</button>
        <button class="icon-btn ph-more" title="Ещё">${Icons.ui('more', 16)}</button>
      </div>
      <div class="ph2-main">
        <div class="ph2-stage">
          ${kind === 'video' ? `<video controls autoplay playsinline></video>` : `<img draggable="false" alt="">`}
          <button class="ph-nav prev">${Icons.ui('chevron-left', 22)}</button>
          <button class="ph-nav next">${Icons.ui('chevron-right', 22)}</button>
        </div>
        <div class="ph2-info ${showInfo ? '' : 'hidden'}"></div>
      </div>
      <div class="ph2-strip"></div>`;
    const media = $('.ph2-stage img, .ph2-stage video', b);
    media.src = FS.url(p);
    if (kind === 'image') media.onload = () => fillInfo(p, node, media.naturalWidth, media.naturalHeight);
    else fillInfo(p, node);
    const apply = () => { if (kind === 'image') media.style.transform = `translate(${tx}px, ${ty}px) scale(${zoom}) rotate(${rot}deg)`; };
    apply();

    $('.prev', b).onclick = () => step(-1);
    $('.next', b).onclick = () => step(1);
    $('.ph-back', b).onclick = renderGrid;
    $('.ph-slide', b).onclick = () => (slideT ? stopSlides() : startSlides());
    $('.ph-info', b).onclick = () => { showInfo = !showInfo; $('.ph2-info', b).classList.toggle('hidden', !showInfo); $('.ph-info', b).classList.toggle('active', showInfo); };
    $('.ph-del', b).onclick = () => del(p);
    $('.ph-more', b).onclick = e => { const r = e.currentTarget.getBoundingClientRect(); UI.menu(r.right - 240, r.bottom + 4, itemMenu(p)); };
    if (kind === 'image') {
      $('.ph-zi', b).onclick = () => { zoom = Math.min(8, zoom * 1.3); apply(); };
      $('.ph-zo', b).onclick = () => { zoom = Math.max(0.2, zoom / 1.3); if (zoom <= 1) { tx = ty = 0; } apply(); };
      $('.ph-fit', b).onclick = () => { zoom = 1; tx = ty = 0; apply(); };
      $('.ph-rot', b).onclick = () => { rot += 90; apply(); };
      $('.ph-edit', b).onclick = () => Apps.launch(Apps.get('prism') ? 'prism' : 'paint', { path: p });
      bindGestures($('.ph2-stage', b), media, apply);
    } else bindSwipe($('.ph2-stage', b));
    renderStrip();
  }

  function fillInfo(p, node, w, hgt) {
    const box = $('.ph2-info', b);
    if (!box) return;
    const rows = [
      ['Имя', FS.basename(p)],
      ['Папка', FS.display(FS.parent(p))],
      ['Тип', FS.typeOf(p, node).label],
      ['Размер', fmtBytes(FS.nodeSize(node))],
      w ? ['Разрешение', `${w} × ${hgt} пикс.`] : null,
      w ? ['Мегапиксели', (w * hgt / 1e6).toFixed(1).replace('.', ',') + ' Мп'] : null,
      ['Изменён', fmtDateLong(node.mt) + ', ' + fmtTime(node.mt)],
    ].filter(Boolean);
    box.innerHTML = `<h3>Сведения</h3>${rows.map(([k, v]) => `<div class="ph2-kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}`;
  }

  function renderStrip() {
    const s = $('.ph2-strip', b);
    if (!s) return;
    const from = Math.max(0, idx - 12), to = Math.min(list.length, idx + 13);
    for (let i = from; i < to; i++) {
      const p = list[i];
      const t = h(`<div class="ph2-thumb ${i === idx ? 'on' : ''}"><img loading="lazy" draggable="false" alt=""></div>`);
      $('img', t).src = FS.thumb(p, null, 160);
      t.onclick = () => { idx = i; renderOne(); };
      s.append(t);
    }
    requestAnimationFrame(() => $('.ph2-thumb.on', s)?.scrollIntoView({ inline: 'center', block: 'nearest' }));
  }

  function step(d) {
    if (!list.length) return;
    idx = (idx + d + list.length) % list.length;
    renderOne();
  }

  function startSlides() {
    stopSlides();
    slideT = setInterval(() => { if (mode === 'one') step(1); else stopSlides(); }, 3500);
    const btn = $('.ph-slide', b); if (btn) btn.innerHTML = Icons.ui('pause', 16);
  }
  function stopSlides() {
    clearInterval(slideT); slideT = null;
    const btn = $('.ph-slide', b); if (btn) btn.innerHTML = Icons.ui('play', 16);
  }

  /** Щипок — масштаб, перетаскивание — сдвиг, свайп — следующее фото, двойное касание — увеличить */
  function bindGestures(stage, img, apply) {
    stage.style.touchAction = 'none';
    const pts = new Map();
    let start = null, lastTap = 0;
    stage.addEventListener('pointerdown', e => {
      if (e.target.closest('.ph-nav')) return;
      stage.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      start = { zoom, tx, ty, pts: new Map([...pts].map(([k, v]) => [k, { ...v }])), t: Date.now() };
    });
    stage.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId) || !start) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const cur = [...pts.values()], st = [...start.pts.values()];
      if (cur.length >= 2 && st.length >= 2) {
        const d0 = Math.hypot(st[0].x - st[1].x, st[0].y - st[1].y) || 1;
        const d1 = Math.hypot(cur[0].x - cur[1].x, cur[0].y - cur[1].y);
        zoom = clamp(start.zoom * d1 / d0, 0.3, 8);
        apply();
      } else if (cur.length === 1 && st.length >= 1) {
        const dx = cur[0].x - st[0].x, dy = cur[0].y - st[0].y;
        if (zoom > 1.01) { tx = start.tx + dx; ty = start.ty + dy; apply(); }
        else { tx = dx; apply(); }
      }
    });
    const end = e => {
      if (!pts.has(e.pointerId)) return;
      const st = start ? [...start.pts.values()][0] : null;
      pts.delete(e.pointerId);
      if (pts.size) { start = { zoom, tx, ty, pts: new Map([...pts].map(([k, v]) => [k, { ...v }])), t: Date.now() }; return; }
      if (zoom <= 1.01 && st) {
        const dx = e.clientX - st.x;
        tx = 0; apply();
        if (Math.abs(dx) > 70) { step(dx < 0 ? 1 : -1); return; }
      }
      if (st && Math.hypot(e.clientX - st.x, e.clientY - st.y) < 10 && Date.now() - start.t < 300) {
        const now = Date.now();
        if (now - lastTap < 320) { if (zoom > 1.05) { zoom = 1; tx = ty = 0; } else zoom = 2.5; apply(); lastTap = 0; }
        else lastTap = now;
      }
      start = null;
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    stage.addEventListener('wheel', e => { e.preventDefault(); zoom = clamp(zoom * (e.deltaY < 0 ? 1.12 : 0.89), 0.3, 8); if (zoom <= 1) tx = ty = 0; apply(); }, { passive: false });
  }

  function bindSwipe(stage) {
    let sx = null;
    stage.addEventListener('pointerdown', e => { if (!e.target.closest('video, .ph-nav')) sx = e.clientX; });
    stage.addEventListener('pointerup', e => { if (sx !== null && Math.abs(e.clientX - sx) > 80) step(e.clientX < sx ? 1 : -1); sx = null; });
  }

  win.el.tabIndex = -1;
  win.el.addEventListener('keydown', e => {
    if (mode !== 'one') return;
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'Escape') renderGrid();
    if (e.key === 'Delete') del(list[idx]);
  });
  win.onBack = () => { if (mode === 'one') { renderGrid(); return true; } return false; };
  const off = FS.on('change', debounce(() => mode === 'grid' && renderGrid(), 300));
  const offImp = FX.on('imported', d => { if (d.path) { FS.refreshDevice(); } });
  win.onClose = () => { off(); offImp(); stopSlides(); };
  win.onArgs = a => open(a);

  function open(a) {
    if (a.path) {
      folder = FS.parent(a.path);
      list = collect(folder);
      idx = Math.max(0, list.findIndex(p => p.toLowerCase() === (FS.realPath(a.path) || a.path).toLowerCase()));
      renderOne();
    } else renderGrid();
  }
  open(args);
  return win;
}
