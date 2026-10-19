/* Просмотр PDF (pdf.js, Apache-2.0): прокрутка, миниатюры, масштаб, поиск, поворот */
'use strict';

Apps.register({
  id: 'pdf', name: 'Просмотр PDF', icon: 'pdf', desc: 'Чтение документов PDF',
  keywords: 'pdf документ читалка acrobat reader',
  launch: args => openPdfViewer(args),
});

const PdfLib = (() => {
  let p = null;
  const base = new URL('js/vendor/pdfjs/', document.baseURI).href;
  return {
    base,
    load() {
      if (!p) p = import(base + 'pdf.min.mjs').then(lib => { lib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs'; return lib; });
      return p;
    },
  };
})();

function openPdfViewer(args = {}) {
  const win = WM.open({ app: 'pdf', title: 'Просмотр PDF', width: 960, height: 720, minWidth: 380, minHeight: 300 });
  const b = win.body;
  b.classList.add('pdfv');
  b.innerHTML = `
    <div class="app-toolbar pdfv-bar">
      <button class="icon-btn pdfv-side-btn" title="Миниатюры">${Icons.ui('sidebar', 16)}</button>
      <button class="tb-text-btn pdfv-open">${Icons.ui('folder-open', 16)}Открыть</button>
      <span class="sep"></span>
      <button class="icon-btn pdfv-prev" title="Предыдущая страница">${Icons.ui('chevron-up', 14)}</button>
      <input class="input pdfv-page" value="1" inputmode="numeric"><span class="muted pdfv-total">/ 0</span>
      <button class="icon-btn pdfv-next" title="Следующая страница">${Icons.ui('chevron-down', 14)}</button>
      <span class="sep"></span>
      <button class="icon-btn pdfv-zo" title="Уменьшить">${Icons.ui('zoom-out', 16)}</button>
      <button class="tb-text-btn pdfv-zl">100%</button>
      <button class="icon-btn pdfv-zi" title="Увеличить">${Icons.ui('zoom-in', 16)}</button>
      <button class="icon-btn pdfv-rot" title="Повернуть">${Icons.ui('rotate', 16)}</button>
      <span class="spacer"></span>
      <label class="input pdfv-find">${Icons.ui('search', 14)}<input placeholder="Поиск в документе"></label>
      <button class="icon-btn pdfv-more" title="Ещё">${Icons.ui('more', 16)}</button>
    </div>
    <div class="pdfv-main">
      <div class="pdfv-side hidden"></div>
      <div class="pdfv-scroll"><div class="pdfv-pages"></div><div class="pdfv-empty">${Icons.get('pdf', 72)}<div>Откройте документ PDF из Проводника или кнопкой «Открыть».</div></div></div>
    </div>
    <div class="statusbar"><span class="pdfv-status"></span></div>`;

  const scroll = $('.pdfv-scroll', b), pagesEl = $('.pdfv-pages', b), side = $('.pdfv-side', b);
  let doc = null, path = null, scale = 0, fit = 'width', rotation = 0, pages = [], renderTasks = new Map(), obs = null, gen = 0;
  const status = t => ($('.pdfv-status', b).textContent = t);

  async function openPath(p) {
    path = p;
    win.setTitle(FS.basename(p) + ' — Просмотр PDF');
    status('Открытие…');
    try {
      const url = FS.url(p);
      const res = await fetch(url);
      const data = await res.arrayBuffer();
      await openData(data);
      FileOps.addRecent(p);
    } catch (e) { console.error(e); status(''); UI.alert('Просмотр PDF', 'Не удалось открыть документ.\n' + (e.message || ''), 'error'); }
  }

  async function openData(data, password) {
    const lib = await PdfLib.load();
    const task = lib.getDocument({ data, cMapUrl: PdfLib.base + 'cmaps/', cMapPacked: true, standardFontDataUrl: PdfLib.base + 'standard_fonts/', password });
    task.onPassword = async (cb, reason) => {
      const pw = await UI.prompt('Документ защищён', reason === 2 ? 'Неверный пароль. Повторите:' : 'Введите пароль документа:', '', { password: true });
      if (pw == null) { task.destroy(); status('Отменено'); } else cb(pw);
    };
    const d = await task.promise;
    if (doc) doc.destroy();
    doc = d;
    gen++;
    rotation = 0;
    $('.pdfv-empty', b).style.display = 'none';
    $('.pdfv-total', b).textContent = '/ ' + doc.numPages;
    await layout();
    buildThumbs();
    status(`${doc.numPages} ${plural(doc.numPages, 'страница', 'страницы', 'страниц')}`);
  }

  async function pageSize(i) {
    const pg = await doc.getPage(i);
    const v = pg.getViewport({ scale: 1, rotation: (pg.rotate + rotation) % 360 });
    return { w: v.width, h: v.height };
  }

  async function layout() {
    renderTasks.forEach(t => t.cancel?.()); renderTasks.clear();
    obs?.disconnect();
    pagesEl.innerHTML = '';
    pages = [];
    const first = await pageSize(1);
    const avail = scroll.clientWidth - 32;
    if (fit === 'width') scale = clamp(avail / first.w, 0.2, 6);
    else if (fit === 'page') scale = clamp(Math.min(avail / first.w, (scroll.clientHeight - 32) / first.h), 0.2, 6);
    $('.pdfv-zl', b).textContent = Math.round(scale * 100) + '%';
    for (let i = 1; i <= doc.numPages; i++) {
      const sz = i === 1 ? first : await pageSize(i);
      const el = h(`<div class="pdfv-page" data-p="${i}" style="width:${Math.round(sz.w * scale)}px;height:${Math.round(sz.h * scale)}px"><canvas></canvas><span class="pdfv-num">${i}</span></div>`);
      pagesEl.append(el);
      pages.push({ el, rendered: 0 });
    }
    const myGen = gen;
    obs = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) render(+e.target.dataset.p, myGen); }), { root: scroll, rootMargin: '600px 0px' });
    pages.forEach(p => obs.observe(p.el));
  }

  async function render(i, myGen) {
    const p = pages[i - 1];
    if (!p || p.rendered === scale || myGen !== gen) return;
    p.rendered = scale;
    try {
      const pg = await doc.getPage(i);
      const v = pg.getViewport({ scale, rotation: (pg.rotate + rotation) % 360 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const c = $('canvas', p.el);
      c.width = Math.floor(v.width * dpr); c.height = Math.floor(v.height * dpr);
      c.style.width = Math.floor(v.width) + 'px'; c.style.height = Math.floor(v.height) + 'px';
      const t = pg.render({ canvasContext: c.getContext('2d'), viewport: v, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
      renderTasks.set(i, t);
      await t.promise;
      renderTasks.delete(i);
    } catch (e) { if (e?.name !== 'RenderingCancelledException') console.warn(e); p.rendered = 0; }
  }

  async function buildThumbs() {
    side.innerHTML = '';
    const myGen = gen;
    for (let i = 1; i <= doc.numPages && myGen === gen; i++) {
      const t = h(`<div class="pdfv-thumb" data-p="${i}"><canvas></canvas><span>${i}</span></div>`);
      t.onclick = () => goTo(i);
      side.append(t);
      if (side.classList.contains('hidden') && i > 60) continue;
      const pg = await doc.getPage(i);
      const v = pg.getViewport({ scale: 120 / pg.getViewport({ scale: 1 }).width, rotation: (pg.rotate + rotation) % 360 });
      const c = $('canvas', t); c.width = v.width; c.height = v.height;
      await pg.render({ canvasContext: c.getContext('2d'), viewport: v }).promise.catch(() => {});
    }
  }

  function current() {
    const top = scroll.scrollTop + scroll.clientHeight / 3;
    let n = 1;
    for (const p of pages) { if (p.el.offsetTop <= top) n = +p.el.dataset.p; else break; }
    return n;
  }
  function goTo(n) {
    if (!doc) return;
    n = clamp(n, 1, doc.numPages);
    scroll.scrollTo({ top: pages[n - 1].el.offsetTop - 12 });
  }
  scroll.addEventListener('scroll', throttle(() => {
    if (!doc) return;
    const n = current();
    $('.pdfv-page', b).value = n;
    $$('.pdfv-thumb', side).forEach(t => t.classList.toggle('on', +t.dataset.p === n));
  }, 120));

  async function setScale(s, mode = null) {
    if (!doc) return;
    const n = current();
    fit = mode;
    scale = clamp(s, 0.2, 6);
    if (!mode) $('.pdfv-zl', b).textContent = Math.round(scale * 100) + '%';
    const keepFit = mode;
    await layout();
    if (!keepFit) $('.pdfv-zl', b).textContent = Math.round(scale * 100) + '%';
    goTo(n);
  }

  // ---------- поиск ----------
  let findQ = '', findHits = [], findI = -1;
  async function find(q) {
    if (!doc || !q) return;
    if (q !== findQ) {
      findQ = q; findHits = []; findI = -1;
      status('Поиск…');
      const low = q.toLowerCase();
      for (let i = 1; i <= doc.numPages; i++) {
        const pg = await doc.getPage(i);
        const tc = await pg.getTextContent();
        const text = tc.items.map(it => it.str).join(' ').toLowerCase();
        let pos = text.indexOf(low), cnt = 0;
        while (pos >= 0) { cnt++; pos = text.indexOf(low, pos + low.length); }
        if (cnt) findHits.push({ page: i, cnt });
      }
      const total = findHits.reduce((a, x) => a + x.cnt, 0);
      status(total ? `Найдено: ${total} на ${findHits.length} ${plural(findHits.length, 'странице', 'страницах', 'страницах')}` : 'Ничего не найдено');
    }
    if (!findHits.length) return;
    findI = (findI + 1) % findHits.length;
    goTo(findHits[findI].page);
    pages[findHits[findI].page - 1].el.classList.add('hit');
    setTimeout(() => pages[findHits[findI]?.page - 1]?.el.classList.remove('hit'), 1500);
  }

  // ---------- кнопки ----------
  $('.pdfv-open', b).onclick = async () => {
    const p = await UI.filePicker({ mode: 'open', dir: path ? FS.parent(path) : FS.P.docs, kinds: ['pdf'], typeLabel: 'Документы PDF (*.pdf)' });
    if (p) openPath(p);
  };
  $('.pdfv-side-btn', b).onclick = () => { side.classList.toggle('hidden'); if (doc && !side.classList.contains('hidden')) buildThumbs(); };
  $('.pdfv-prev', b).onclick = () => goTo(current() - 1);
  $('.pdfv-next', b).onclick = () => goTo(current() + 1);
  $('.pdfv-page', b).onchange = e => goTo(+e.target.value || 1);
  $('.pdfv-zi', b).onclick = () => setScale(scale * 1.2);
  $('.pdfv-zo', b).onclick = () => setScale(scale / 1.2);
  $('.pdfv-zl', b).onclick = e => {
    const r = e.currentTarget.getBoundingClientRect();
    UI.menu(r.left, r.bottom + 4, [
      { label: 'По ширине', checked: fit === 'width', action: () => setScale(scale, 'width') },
      { label: 'Страница целиком', checked: fit === 'page', action: () => setScale(scale, 'page') },
      { sep: true },
      ...[50, 75, 100, 125, 150, 200, 300].map(z => ({ label: z + '%', action: () => setScale(z / 100) })),
    ]);
  };
  $('.pdfv-rot', b).onclick = async () => { if (!doc) return; rotation = (rotation + 90) % 360; await layout(); buildThumbs(); };
  $('.pdfv-find input', b).addEventListener('keydown', e => { if (e.key === 'Enter') find(e.target.value.trim()); });
  $('.pdfv-more', b).onclick = e => {
    const r = e.currentTarget.getBoundingClientRect();
    UI.menu(r.right - 260, r.bottom + 4, [
      { label: 'Ночной режим', checked: b.classList.contains('night'), action: () => b.classList.toggle('night') },
      { label: 'Показать в Проводнике', icon: 'folder', disabled: !path, action: () => Apps.launch('explorer', { path: FS.parent(path), select: path }) },
      { label: 'Поделиться…', icon: 'share', disabled: !path || !FS.isDevice(path), action: () => FX.call('share', FS.toNative(path)) },
      { label: 'Открыть в другом приложении', icon: 'external', disabled: !path || !FS.isDevice(path), action: () => FX.call('openExternal', FS.toNative(path), true) },
      { label: 'Свойства документа', icon: 'info', disabled: !doc, action: showProps },
    ]);
  };
  async function showProps() {
    const m = await doc.getMetadata().catch(() => ({ info: {} }));
    const i = m.info || {};
    UI.alert('Свойства документа', [
      ['Файл', path ? FS.basename(path) : '—'], ['Заголовок', i.Title], ['Автор', i.Author], ['Создатель', i.Creator],
      ['Производитель', i.Producer], ['Версия PDF', i.PDFFormatVersion], ['Страниц', doc.numPages],
    ].filter(x => x[1]).map(([k, v]) => `${k}: ${v}`).join('\n'), 'info');
  }

  // щипок для масштаба
  (() => {
    const pts = new Map(); let d0 = 0, s0 = 1;
    scroll.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') pts.set(e.pointerId, e); if (pts.size === 2) { const [a, c] = [...pts.values()]; d0 = Math.hypot(a.clientX - c.clientX, a.clientY - c.clientY); s0 = scale; } });
    scroll.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, e);
      if (pts.size === 2 && d0) { const [a, c] = [...pts.values()]; const k = Math.hypot(a.clientX - c.clientX, a.clientY - c.clientY) / d0; pagesEl.style.transform = `scale(${k})`; pagesEl.style.transformOrigin = 'top center'; pagesEl.dataset.k = k; }
    });
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2 && d0) { const k = +pagesEl.dataset.k || 1; pagesEl.style.transform = ''; d0 = 0; if (Math.abs(k - 1) > 0.05) setScale(s0 * k); } };
    scroll.addEventListener('pointerup', up); scroll.addEventListener('pointercancel', up);
  })();

  win.onResize = debounce(() => { if (doc && fit) setScale(scale, fit); }, 250);
  win.onClose = () => { obs?.disconnect(); doc?.destroy(); };
  win.onArgs = a => { if (a.path) openPath(a.path); };
  if (args.path) openPath(args.path);
  return win;
}
