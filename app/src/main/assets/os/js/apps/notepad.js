/* Блокнот */
'use strict';

Apps.register({
  id: 'notepad', name: 'Блокнот', icon: 'notepad', desc: 'Простой текстовый редактор',
  keywords: 'текст редактор заметки notepad txt',
  launch: args => openNotepad(args),
});

function openNotepad(args = {}) {
  const prefs = Persist.get('notepad.prefs', { wrap: true, size: 15, family: 'mono', status: true });
  let path = null, saved = '', zoom = 100;

  const win = WM.open({ app: 'notepad', title: 'Безымянный — Блокнот', width: 760, height: 520, minWidth: 360, minHeight: 240 });
  const b = win.body;
  b.classList.add('np');
  b.innerHTML = `
    <div class="menubar">
      <button data-m="file">Файл</button><button data-m="edit">Правка</button><button data-m="format">Формат</button><button data-m="view">Вид</button>
    </div>
    <div class="np-find hidden">
      <input class="input np-q" placeholder="Найти" spellcheck="false">
      <input class="input np-r" placeholder="Заменить на" spellcheck="false">
      <button class="icon-btn np-prev" title="Предыдущее (Shift+F3)">${Icons.ui('chevron-up', 14)}</button>
      <button class="icon-btn np-next" title="Следующее (F3)">${Icons.ui('chevron-down', 14)}</button>
      <button class="btn sm np-rep">Заменить</button>
      <button class="btn sm np-repall">Заменить все</button>
      <label class="row-gap small"><input type="checkbox" class="check np-case">Учитывать регистр</label>
      <span class="muted small np-found"></span>
      <span class="spacer"></span>
      <button class="icon-btn np-fclose">${Icons.ui('close', 14)}</button>
    </div>
    <textarea class="np-text" spellcheck="false"></textarea>
    <div class="statusbar np-status"><span class="np-pos"></span><span class="np-chars"></span><span class="spacer"></span><span class="np-zoom">100%</span><span>Windows (CRLF)</span><span>UTF-8</span></div>`;
  const ta = $('.np-text', b);

  function applyPrefs() {
    ta.style.whiteSpace = prefs.wrap ? 'pre-wrap' : 'pre';
    ta.style.overflowX = prefs.wrap ? 'hidden' : 'auto';
    ta.style.fontSize = (prefs.size * zoom / 100) + 'px';
    ta.style.fontFamily = prefs.family === 'mono' ? 'var(--mono)' : prefs.family === 'serif' ? 'Georgia, "Times New Roman", serif' : 'var(--font)';
    $('.np-status', b).classList.toggle('hidden', !prefs.status);
    $('.np-zoom', b).textContent = zoom + '%';
    Persist.set('notepad.prefs', prefs);
  }

  const dirty = () => ta.value !== saved;
  function updateTitle() {
    const name = path ? FS.basename(path) : 'Безымянный';
    win.setTitle((dirty() ? '*' : '') + name + ' — Блокнот');
  }
  function updateStatus() {
    const before = ta.value.slice(0, ta.selectionStart);
    const line = before.split('\n').length;
    const col = before.length - before.lastIndexOf('\n');
    const selLen = Math.abs(ta.selectionEnd - ta.selectionStart);
    $('.np-pos', b).textContent = `Стр ${line}, стлб ${col}` + (selLen ? ` (выделено: ${selLen})` : '');
    $('.np-chars', b).textContent = `${ta.value.length.toLocaleString('ru-RU')} ${plural(ta.value.length, 'символ', 'символа', 'символов')}`;
  }

  function load(p) {
    try {
      const c = FS.read(p);
      path = FS.realPath(p);
      ta.value = c;
      saved = c;
      ta.setSelectionRange(0, 0);
      ta.scrollTop = 0;
      FileOps.addRecent(path);
    } catch (e) { UI.alert('Блокнот', e.message, 'error'); }
    updateTitle(); updateStatus();
  }

  async function confirmDiscard() {
    if (!dirty()) return true;
    const r = await UI.dialog({
      title: 'Блокнот', appIcon: 'notepad', message: `Вы хотите сохранить изменения в файле «${path ? FS.basename(path) : 'Безымянный'}»?`,
      buttons: [{ label: 'Сохранить', value: 'save', primary: true }, { label: 'Не сохранять', value: 'discard' }, { label: 'Отмена', value: 'cancel', cancel: true }],
      sound: false,
    });
    if (r.button === 'save') return await save();
    return r.button === 'discard';
  }

  async function save() {
    if (!path) return saveAs();
    try {
      FS.write(path, ta.value);
      saved = ta.value;
      updateTitle();
      return true;
    } catch (e) { UI.alert('Блокнот', e.message, 'error'); return false; }
  }

  async function saveAs() {
    const p = await UI.filePicker({ mode: 'save', dir: path ? FS.parent(path) : FS.P.docs, name: path ? FS.basename(path) : 'Безымянный.txt', ext: 'txt', title: 'Сохранить как', typeLabel: 'Текстовые документы (*.txt)' });
    if (!p) return false;
    path = p;
    const ok = await save();
    if (ok) FileOps.addRecent(path);
    return ok;
  }

  async function newDoc() { if (await confirmDiscard()) { path = null; ta.value = ''; saved = ''; updateTitle(); updateStatus(); ta.focus(); } }
  async function open() {
    if (!await confirmDiscard()) return;
    const p = await UI.filePicker({ mode: 'open', dir: path ? FS.parent(path) : FS.P.docs, kinds: ['text', 'code', 'html'], typeLabel: 'Текстовые документы' });
    if (p) load(p);
    ta.focus();
  }
  function uploadLocal() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.txt,.md,.js,.json,.html,.css,.csv,.log,.ini,.xml,.py,text/*';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      if (!await confirmDiscard()) return;
      const text = await readFileAs(f, 'text');
      const p = FS.write(FS.P.downloads + '/' + FS.unique(FS.P.downloads, f.name), text);
      load(p);
    };
    inp.click();
  }

  // ---------- Правка ----------
  function insert(text) { ta.focus(); if (!document.execCommand('insertText', false, text)) ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end'); onInput(); }
  async function paste() {
    try { insert(await navigator.clipboard.readText()); }
    catch { UI.alert('Блокнот', 'Нет доступа к буферу обмена. Используйте Ctrl+V.', 'info'); }
  }
  const exec = cmd => { ta.focus(); document.execCommand(cmd); onInput(); };

  // ---------- Поиск ----------
  const findBar = $('.np-find', b), q = $('.np-q', b), r = $('.np-r', b);
  function openFind(replace) {
    findBar.classList.remove('hidden');
    r.style.display = $('.np-rep', b).style.display = $('.np-repall', b).style.display = replace ? '' : 'none';
    const s = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    if (s && !s.includes('\n')) q.value = s;
    q.focus(); q.select();
    countMatches();
  }
  function norm(s) { return $('.np-case', b).checked ? s : s.toLowerCase(); }
  function countMatches() {
    if (!q.value) { $('.np-found', b).textContent = ''; return; }
    const n = norm(ta.value).split(norm(q.value)).length - 1;
    $('.np-found', b).textContent = n ? `Найдено: ${n}` : 'Не найдено';
  }
  function find(dir = 1) {
    if (!q.value) return false;
    const hay = norm(ta.value), needle = norm(q.value);
    let i = dir > 0 ? hay.indexOf(needle, ta.selectionEnd) : hay.lastIndexOf(needle, ta.selectionStart - 1);
    if (i < 0) i = dir > 0 ? hay.indexOf(needle) : hay.lastIndexOf(needle);
    if (i < 0) { Sound.play('error'); return false; }
    ta.focus();
    ta.setSelectionRange(i, i + needle.length);
    // прокрутка к найденному
    const line = ta.value.slice(0, i).split('\n').length;
    ta.scrollTop = Math.max(0, (line - 5) * parseFloat(getComputedStyle(ta).lineHeight || 20));
    updateStatus();
    return true;
  }
  function replaceOne() {
    const s = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    if (s && norm(s) === norm(q.value)) insert(r.value);
    find(1); countMatches();
  }
  function replaceAll() {
    if (!q.value) return;
    const flags = $('.np-case', b).checked ? 'g' : 'gi';
    const re = new RegExp(q.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    const n = (ta.value.match(re) || []).length;
    if (!n) return;
    ta.focus(); ta.select();
    insert(ta.value.replace(re, () => r.value));
    $('.np-found', b).textContent = `Заменено: ${n}`;
  }
  q.addEventListener('input', countMatches);
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); find(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') { findBar.classList.add('hidden'); ta.focus(); } });
  r.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); replaceOne(); } if (e.key === 'Escape') { findBar.classList.add('hidden'); ta.focus(); } });
  $('.np-next', b).onclick = () => find(1);
  $('.np-prev', b).onclick = () => find(-1);
  $('.np-rep', b).onclick = replaceOne;
  $('.np-repall', b).onclick = replaceAll;
  $('.np-case', b).onchange = countMatches;
  $('.np-fclose', b).onclick = () => { findBar.classList.add('hidden'); ta.focus(); };

  async function goToLine() {
    const total = ta.value.split('\n').length;
    const n = await UI.prompt('Переход на строку', `Номер строки (1–${total}):`, '1', { validate: v => (+v >= 1 && +v <= total) ? '' : 'Номер строки превышает общее число строк.' });
    if (!n) return;
    const lines = ta.value.split('\n');
    const pos = lines.slice(0, +n - 1).reduce((a, l) => a + l.length + 1, 0);
    ta.focus(); ta.setSelectionRange(pos, pos);
    ta.scrollTop = (n - 5) * parseFloat(getComputedStyle(ta).lineHeight || 20);
    updateStatus();
  }

  const stamp = () => insert(fmtTime(Date.now()) + ' ' + fmtDate(Date.now()));

  // ---------- Меню ----------
  const MENUS = {
    file: () => [
      { label: 'Создать', icon: 'new-file', shortcut: 'Ctrl+N', action: newDoc },
      { label: 'Новое окно', icon: 'external', shortcut: 'Ctrl+Shift+N', action: () => Apps.launch('notepad') },
      { label: 'Открыть…', icon: 'folder-open', shortcut: 'Ctrl+O', action: open },
      { label: 'Сохранить', icon: 'save', shortcut: 'Ctrl+S', action: save },
      { label: 'Сохранить как…', shortcut: 'Ctrl+Shift+S', action: saveAs },
      { sep: true },
      { label: 'Загрузить с компьютера…', icon: 'upload', action: uploadLocal },
      { label: 'Скачать на компьютер', icon: 'download', action: () => downloadBlob(path ? FS.basename(path) : 'Безымянный.txt', ta.value) },
      { label: 'Открыть в браузере', icon: 'globe', disabled: !path, action: async () => { if (dirty()) await save(); Apps.launch('browser', { path }); } },
      { sep: true },
      { label: 'Выход', action: () => win.close() },
    ],
    edit: () => {
      const has = ta.selectionStart !== ta.selectionEnd;
      return [
        { label: 'Отменить', icon: 'undo', shortcut: 'Ctrl+Z', action: () => exec('undo') },
        { label: 'Повторить', icon: 'redo', shortcut: 'Ctrl+Y', action: () => exec('redo') },
        { sep: true },
        { label: 'Вырезать', icon: 'cut', shortcut: 'Ctrl+X', disabled: !has, action: () => exec('cut') },
        { label: 'Копировать', icon: 'copy', shortcut: 'Ctrl+C', disabled: !has, action: () => exec('copy') },
        { label: 'Вставить', icon: 'paste', shortcut: 'Ctrl+V', action: paste },
        { label: 'Удалить', icon: 'trash', shortcut: 'Del', disabled: !has, action: () => exec('delete') },
        { sep: true },
        { label: 'Найти…', icon: 'search', shortcut: 'Ctrl+F', action: () => openFind(false) },
        { label: 'Найти далее', shortcut: 'F3', action: () => find(1) },
        { label: 'Заменить…', shortcut: 'Ctrl+H', action: () => openFind(true) },
        { label: 'Перейти…', shortcut: 'Ctrl+G', action: goToLine },
        { sep: true },
        { label: 'Выделить все', shortcut: 'Ctrl+A', action: () => { ta.focus(); ta.select(); updateStatus(); } },
        { label: 'Время и дата', icon: 'clock', shortcut: 'F5', action: stamp },
        { sep: true },
        { label: 'Верхний регистр', action: () => { const s = ta.value.slice(ta.selectionStart, ta.selectionEnd); if (s) insert(s.toUpperCase()); } },
        { label: 'Нижний регистр', action: () => { const s = ta.value.slice(ta.selectionStart, ta.selectionEnd); if (s) insert(s.toLowerCase()); } },
      ];
    },
    format: () => [
      { label: 'Перенос по словам', checked: prefs.wrap, action: () => { prefs.wrap = !prefs.wrap; applyPrefs(); } },
      { sep: true },
      { label: 'Шрифт', icon: 'text', items: [
        { label: 'Моноширинный (Cascadia Mono)', checked: prefs.family === 'mono', action: () => { prefs.family = 'mono'; applyPrefs(); } },
        { label: 'Segoe UI', checked: prefs.family === 'sans', action: () => { prefs.family = 'sans'; applyPrefs(); } },
        { label: 'С засечками (Georgia)', checked: prefs.family === 'serif', action: () => { prefs.family = 'serif'; applyPrefs(); } },
      ] },
      { label: 'Размер шрифта', items: [11, 13, 15, 18, 22, 28].map(s => ({ label: s + ' пт', checked: prefs.size === s, action: () => { prefs.size = s; applyPrefs(); } })) },
    ],
    view: () => [
      { label: 'Масштаб', icon: 'zoom-in', items: [
        { label: 'Увеличить', shortcut: 'Ctrl+Плюс', action: () => { zoom = Math.min(500, zoom + 10); applyPrefs(); } },
        { label: 'Уменьшить', shortcut: 'Ctrl+Минус', action: () => { zoom = Math.max(10, zoom - 10); applyPrefs(); } },
        { label: 'Восстановить масштаб по умолчанию', shortcut: 'Ctrl+0', action: () => { zoom = 100; applyPrefs(); } },
      ] },
      { label: 'Строка состояния', checked: prefs.status, action: () => { prefs.status = !prefs.status; applyPrefs(); } },
    ],
  };
  $$('.menubar button', b).forEach(btn => btn.onclick = () => {
    const r2 = btn.getBoundingClientRect();
    btn.classList.add('open');
    const m = UI.menu(r2.left, r2.bottom + 2, MENUS[btn.dataset.m]());
    const obs = new MutationObserver(() => { if (!m.isConnected) { btn.classList.remove('open'); obs.disconnect(); } });
    obs.observe(document.getElementById('overlay-layer'), { childList: true });
  });

  // ---------- События ----------
  const onInput = () => { updateTitle(); updateStatus(); };
  ta.addEventListener('input', onInput);
  ['keyup', 'click', 'select'].forEach(e => ta.addEventListener(e, updateStatus));
  ta.addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); insert('\t'); }
  });
  ta.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); zoom = clamp(zoom + (e.deltaY < 0 ? 10 : -10), 10, 500); applyPrefs(); } }, { passive: false });
  win.el.addEventListener('keydown', e => {
    const k = e.code;
    if (e.ctrlKey && !e.altKey) {
      if (k === 'KeyS') { e.preventDefault(); e.shiftKey ? saveAs() : save(); }
      else if (k === 'KeyO') { e.preventDefault(); open(); }
      else if (k === 'KeyN') { e.preventDefault(); e.shiftKey ? Apps.launch('notepad') : newDoc(); }
      else if (k === 'KeyF') { e.preventDefault(); openFind(false); }
      else if (k === 'KeyH') { e.preventDefault(); openFind(true); }
      else if (k === 'KeyG') { e.preventDefault(); goToLine(); }
      else if (k === 'Equal' || k === 'NumpadAdd') { e.preventDefault(); zoom = Math.min(500, zoom + 10); applyPrefs(); }
      else if (k === 'Minus' || k === 'NumpadSubtract') { e.preventDefault(); zoom = Math.max(10, zoom - 10); applyPrefs(); }
      else if (k === 'Digit0') { e.preventDefault(); zoom = 100; applyPrefs(); }
    } else if (e.key === 'F3') { e.preventDefault(); find(e.shiftKey ? -1 : 1); }
    else if (e.key === 'F5') { e.preventDefault(); stamp(); }
  });

  win.beforeClose = confirmDiscard;
  // Отслеживание переименования/перемещения открытого файла
  const off = FS.on('change', info => {
    if (!path) return;
    const mv = info.renamed || info.moved;
    if (mv && mv[0].toLowerCase() === path.toLowerCase()) { path = mv[1]; updateTitle(); }
  });
  win.onClose = off;

  applyPrefs();
  if (args.path) load(args.path);
  else if (args.text) { ta.value = args.text; updateTitle(); }
  updateStatus(); updateTitle();
  setTimeout(() => ta.focus(), 50);
  return win;
}
