/* Матрица времени — задачи по матрице Эйзенхауэра (версия программы TimeMatrix для macOS).
   Четыре квадранта, фильтры, поиск, перетаскивание между квадрантами, сроки и заметки,
   виджет на рабочий стол. Формат резервной копии JSON совместим с TimeMatrix для Mac.
   Всё сохраняется при каждом изменении (AppData). */
'use strict';

const TimeMatrix = (() => {
  const em = new Emitter();
  const Q = {
    1: { title: 'Сделать сейчас', sub: 'Важно и срочно', tag: 'Сегодня', color: '#e6424d', icon: 'bolt' },
    2: { title: 'Запланировать', sub: 'Важно, но не срочно', tag: 'На этой неделе', color: '#3dae5c', icon: 'cal' },
    3: { title: 'Делегировать', sub: 'Срочно, но не важно', tag: 'Делегировать', color: '#e09e1a', icon: 'people' },
    4: { title: 'Убрать', sub: 'Не важно и не срочно', tag: 'Ограничить', color: '#4273cc', icon: 'trash' },
  };
  const FILTERS = [['all', 'Все', 'cal'], ['today', 'Сегодня', 'flag'], ['week', 'Неделя', 'clock'], ['important', 'Важное', 'star'], ['nodate', 'Без даты', 'tray']];
  const G = {
    bolt: '<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z" fill="currentColor"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    people: '<circle cx="9" cy="8.5" r="3.2" fill="currentColor"/><circle cx="16.5" cy="9.5" r="2.6" fill="currentColor" opacity=".75"/><path d="M3 19.5c.6-3.6 3-5.5 6-5.5s5.4 1.9 6 5.5zM14.6 14.3c3.2-.6 5.7 1 6.4 4.9h-4.8" fill="currentColor"/>',
    trash: '<path d="M5 7h14l-1.1 12a2 2 0 0 1-2 1.8H8.1a2 2 0 0 1-2-1.8z" fill="currentColor"/><path d="M4 7h16M9.5 7V4.8h5V7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    flag: '<path d="M6 21V4m0 0h10l-2 4 2 4H6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    clock: '<rect x="3.5" y="5" width="13" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="17" cy="16.5" r="4.5" fill="var(--mx-side, #333)" stroke="currentColor" stroke-width="1.7"/><path d="M17 14.6v2.1l1.3 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>',
    star: '<path d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6l-5.3 2.9 1.1-5.9-4.4-4.1 6-.8z" fill="currentColor"/>',
    tray: '<path d="M4 13l2.2-7.3A2 2 0 0 1 8.1 4.3h7.8a2 2 0 0 1 1.9 1.4L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M4 13h4.5l1.2 2.4h4.6l1.2-2.4H20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    plus: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    box: '<rect x="4.5" y="4.5" width="15" height="15" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    boxon: '<rect x="4" y="4" width="16" height="16" rx="4" fill="currentColor"/><path d="M8 12.3l2.7 2.7L16.3 9" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    disk: '<rect x="3.5" y="13" width="17" height="6.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M6 13l2.2-7.5h7.6L18 13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="16.5" cy="16.2" r="1.1" fill="currentColor"/>',
    note: '<path d="M6 4h9l4 4v12H6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 11h7M9 14.5h7M9 18h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  };
  const gi = (k, s = 18, c = 'currentColor') => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" style="color:${c}" aria-hidden="true">${G[k]}</svg>`;

  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : uid('tm')).toUpperCase();
  const fresh = () => {
    const now = new Date();
    const at = (h, m = 0) => { const d = new Date(now); d.setHours(h, m, 0, 0); return d.toISOString(); };
    const t = (title, quadrant, extra = {}) => ({ id: newId(), title, quadrant, done: false, notes: '', created: new Date().toISOString(), ...extra });
    return { tasks: [
      t('Подготовить отчёт', 1, { due: at(11) }),
      t('Ответить на важные письма', 1, { due: at(15) }),
      t('Составить план на неделю', 2),
      t('Изучить новую тему', 2),
      t('Ответить на звонки', 3),
      t('Листать соцсети', 4),
    ] };
  };
  let D = AppData.load('timematrix', fresh);
  if (Array.isArray(D)) D = { tasks: D };
  const save = () => { AppData.save('timematrix', D); em.emit('change'); };

  // ---------- даты
  const dueOf = t => (t.due ? new Date(t.due) : null);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const weekStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const isToday = t => { const d = dueOf(t); return !!d && sameDay(d, new Date()); };
  const isWeek = t => { const d = dueOf(t); if (!d) return false; const s = weekStart(new Date()); return d >= s && d < new Date(s.getTime() + 7 * 864e5); };
  const important = t => t.quadrant === 1 || t.quadrant === 2;
  const PASS = { all: () => true, today: isToday, week: isWeek, important, nodate: t => !t.due };
  const fmtDue = t => {
    const d = dueOf(t);
    if (!d) return '';
    const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (sameDay(d, new Date())) return hm;
    const dm = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
    return hm === '00:00' ? dm : dm + ' ' + hm;
  };
  const overdue = t => { const d = dueOf(t); return !!d && !t.done && d < new Date() && !sameDay(d, new Date()); };

  // ---------- операции
  const get = id => D.tasks.find(t => t.id === id);
  function add(quadrant, title, extra = {}) {
    const t = { id: newId(), title, quadrant, done: false, notes: '', created: new Date().toISOString(), ...extra };
    if (quadrant === 1 && !('due' in extra)) t.due = new Date().toISOString();
    D.tasks.push(t); save(); return t;
  }
  function update(id, patch) { const t = get(id); if (t) { Object.assign(t, patch); if (patch.due === null) delete t.due; save(); } }
  const toggle = id => { const t = get(id); if (t) { t.done = !t.done; save(); } };
  const move = (id, q) => update(id, { quadrant: q });
  function remove(id) {
    const i = D.tasks.findIndex(t => t.id === id);
    if (i < 0) return;
    const [t] = D.tasks.splice(i, 1);
    save();
    UI.notify({ title: 'Задача удалена', body: t.title, app: 'timematrix', transient: true, silent: true, actions: [{ label: 'Вернуть', fn: () => { D.tasks.splice(Math.min(i, D.tasks.length), 0, t); save(); } }] });
  }
  const items = q => D.tasks.filter(t => t.quadrant === q).sort((a, b) => (a.done - b.done) || ((dueOf(a)?.getTime() ?? 9e15) - (dueOf(b)?.getTime() ?? 9e15)));

  // ---------- резервные копии (формат TimeMatrix для Mac)
  const stamp = () => new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  function exportJSON() {
    const path = FS.join(FS.P.docs, FS.unique(FS.P.docs, `Матрица времени ${stamp()}.json`));
    FS.write(path, JSON.stringify(D.tasks, null, 2));
    UI.notify({ title: 'Резервная копия сохранена', body: FS.display(path), app: 'timematrix', transient: true, actions: [{ label: 'Показать', fn: () => Apps.launch('explorer', { path: FS.parent(path), select: path }) }] });
  }
  function exportCSV() {
    const q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
    const rows = ['Квадрант;Задача;Выполнено;Срок;Заметки', ...D.tasks.map(t => [Q[t.quadrant].title, t.title, t.done ? 'да' : 'нет', t.due ? new Date(t.due).toLocaleString('ru-RU') : '', t.notes].map(q).join(';'))];
    const path = FS.join(FS.P.docs, FS.unique(FS.P.docs, `Матрица времени ${stamp()}.csv`));
    FS.write(path, '﻿' + rows.join('\r\n'));
    UI.notify({ title: 'Таблица для Excel сохранена', body: FS.display(path), app: 'timematrix', transient: true, actions: [{ label: 'Открыть', fn: () => FileOps.open(path) }] });
  }
  function parseBackup(text) {
    let v = JSON.parse(text);
    if (v && !Array.isArray(v) && Array.isArray(v.tasks)) v = v.tasks;
    if (!Array.isArray(v) || v.some(t => typeof t !== 'object' || typeof t.title !== 'string' || ![1, 2, 3, 4].includes(+t.quadrant))) throw new Error('Этот файл не является копией Матрицы времени.');
    return v.map(t => ({ id: String(t.id || newId()), title: t.title, quadrant: +t.quadrant, done: !!t.done, notes: t.notes || '', created: t.created || new Date().toISOString(), ...(t.due ? { due: t.due } : {}) }));
  }
  async function importJSON(path) {
    try {
      const list = parseBackup(FS.read(path));
      if (!await UI.confirm('Восстановить задачи из копии?', `В файле задач: ${list.length}.\nТекущие задачи будут заменены. Перед этим сохранится страховочная копия в «Документах».`, { ok: 'Восстановить' })) return;
      exportJSON();
      D.tasks = list; save();
      UI.notify({ title: 'Данные восстановлены', app: 'timematrix', transient: true });
    } catch (e) { UI.alert('Восстановление', e.message || String(e), 'error'); }
  }
  function clearDone() {
    const n = D.tasks.filter(t => t.done).length;
    if (!n) return UI.notify({ title: 'Выполненных задач нет', app: 'timematrix', transient: true, silent: true });
    const keep = D.tasks;
    D.tasks = D.tasks.filter(t => !t.done); save();
    UI.notify({ title: `Удалено выполненных: ${n}`, app: 'timematrix', transient: true, silent: true, actions: [{ label: 'Вернуть', fn: () => { D.tasks = keep; save(); } }] });
  }

  // ---------- виджет на рабочий стол
  function widget(el, opts = {}) {
    const mode = opts.list || 'all';
    const draw = () => {
      if (!el.isConnected) { off(); return; }
      const qs = mode === 'all' ? [1, 2, 3, 4] : [+mode];
      const lim = mode === 'all' ? 3 : 8;
      el.innerHTML = `<div class="mx-w ${mode === 'all' ? 'grid' : 'one'}">${qs.map(q => {
        const open = items(q).filter(t => !t.done);
        return `<div class="mx-wq" style="--qc:${Q[q].color}" data-q="${q}">
          <div class="mx-wq-h"><i>${q}</i><b>${Q[q].title}</b><span>${open.length || ''}</span></div>
          ${open.slice(0, lim).map(t => `<div class="mx-wq-it" data-id="${t.id}"><button class="mx-wchk" title="Выполнено">${gi('box', 14)}</button><span>${esc(t.title)}</span></div>`).join('')}
          ${open.length > lim ? `<div class="mx-wq-more">ещё ${open.length - lim}</div>` : ''}
          ${mode !== 'all' ? '<input class="mx-wq-add" placeholder="+ Новая задача">' : ''}
        </div>`;
      }).join('')}</div>`;
      $$('.mx-wchk', el).forEach(b => b.onclick = e => { e.stopPropagation(); const r = b.closest('.mx-wq-it'); r.classList.add('done'); b.innerHTML = gi('boxon', 14); setTimeout(() => toggle(r.dataset.id), 350); });
      $$('.mx-wq-h, .mx-wq-it', el).forEach(r => r.onclick = () => { Shell.closeAll?.(); Apps.launch('timematrix'); });
      const inp = $('.mx-wq-add', el);
      if (inp) inp.onkeydown = e => { if (e.key === 'Enter' && inp.value.trim()) add(+mode, inp.value.trim()); };
    };
    const off = em.on('change', draw);
    draw();
    return { destroy: off, options: () => [['all', 'Все квадранты'], ...[1, 2, 3, 4].map(q => [String(q), Q[q].title])] };
  }

  return { get data() { return D; }, Q, FILTERS, PASS, gi, items, add, update, toggle, move, remove, get, fmtDue, overdue, isToday, isWeek, important, exportJSON, exportCSV, importJSON, parseBackup, clearDone, widget, on: (e, f) => em.on(e, f), save };
})();

function openTimeMatrix(args = {}) {
  const T = TimeMatrix, gi = T.gi;
  const win = WM.open({ app: 'timematrix', title: 'Матрица времени', width: 1120, height: 720, minWidth: 640, minHeight: 460, bodyClass: 'mx' });
  const b = win.body;
  let filter = 'all', query = '';
  const QUOTES = ['«Сфокусируйся на важном,<br>остальное подождёт»', '«Что важно, редко бывает срочным,<br>а что срочно — редко важно»', '«Не планируй дела —<br>планируй приоритеты»'];
  const quote = QUOTES[new Date().getDate() % QUOTES.length];

  b.innerHTML = `
    <aside class="mx-side">
      <div class="mx-date"><span class="mx-wd"></span><b class="mx-day"></b><span class="mx-mon"></span></div>
      <nav class="mx-filters"></nav>
      <div class="spacer"></div>
      <div class="mx-quote">${quote}</div>
      <button class="mx-backup">${gi('disk', 16)}<span>Резервные копии</span></button>
    </aside>
    <main class="mx-main">
      <div class="mx-top"><div class="mx-title">Матрица времени</div><div class="spacer"></div><label class="mx-search">${Icons.ui('search', 14)}<input placeholder="Поиск задач…"></label></div>
      <div class="mx-grid"></div>
      <div class="mx-stats"></div>
    </main>`;

  function renderSide() {
    const now = new Date();
    $('.mx-wd', b).textContent = cap(now.toLocaleDateString('ru-RU', { weekday: 'long' }));
    $('.mx-day', b).textContent = now.getDate();
    $('.mx-mon', b).textContent = cap(now.toLocaleDateString('ru-RU', { month: 'long', day: 'numeric' }).replace(/^\d+\s*/, ''));
    $('.mx-filters', b).innerHTML = T.FILTERS.map(([k, n, ic]) => `<button class="mx-f ${filter === k ? 'on' : ''}" data-f="${k}">${gi(ic, 18)}<span>${n}</span><i>${T.data.tasks.filter(T.PASS[k]).length}</i></button>`).join('');
    $$('.mx-f', b).forEach(x => x.onclick = () => { filter = x.dataset.f; render(); });
  }

  const passes = t => T.PASS[filter](t) && (!query || (t.title + ' ' + (t.notes || '')).toLowerCase().includes(query));

  function card(q) {
    const Qd = T.Q[q];
    const list = T.items(q).filter(passes);
    const open = list.filter(t => !t.done).length;
    return `<section class="mx-card" data-q="${q}" style="--qc:${Qd.color}">
      <header><i class="mx-num">${q}</i><div class="mx-ht"><b>${Qd.title}</b><span>${Qd.sub}</span></div><span class="mx-cnt">${open}</span><span class="mx-qic">${gi(Qd.icon, 26, Qd.color)}</span></header>
      <div class="mx-list">${list.map(row).join('')}
        <label class="mx-add">${gi('plus', 18, Qd.color)}<input placeholder="Новая задача…" data-q="${q}"></label>
      </div>
    </section>`;
  }
  function row(t) {
    const Qd = T.Q[t.quadrant];
    return `<div class="mx-row ${t.done ? 'done' : ''}" data-id="${t.id}" draggable="true">
      <button class="mx-chk" title="${t.done ? 'Вернуть' : 'Выполнено'}">${gi(t.done ? 'boxon' : 'box', 20, t.done ? Qd.color : 'var(--mx-dim)')}</button>
      <span class="mx-t">${esc(t.title)}${t.notes ? `<i class="mx-hasnote" title="${esc(t.notes.slice(0, 200))}">${gi('note', 13)}</i>` : ''}</span>
      <span class="mx-tag">${Qd.tag}</span>
      <span class="mx-due ${T.overdue(t) ? 'late' : ''}">${T.fmtDue(t)}</span>
    </div>`;
  }
  function stats() {
    const all = T.data.tasks;
    const done = all.length ? all.filter(t => t.done).length / all.length : 0;
    const st = (ic, c, n, l) => `<div class="mx-st"><span class="mx-sti" style="--sc:${c}">${gi(ic, 22, c)}</span><div><b>${n}</b><span>${l}</span></div></div>`;
    const C = 2 * Math.PI * 22;
    return st('bolt', '#e6424d', all.filter(T.isToday).length, 'Сегодня') + st('cal', '#4a8cf0', all.filter(T.isWeek).length, 'На этой неделе') + st('flag', '#9aa3b5', all.filter(T.important).length, 'Важных задач') +
      `<div class="mx-st"><svg width="52" height="52" viewBox="0 0 52 52" class="mx-ring"><circle cx="26" cy="26" r="22" fill="none" stroke="var(--mx-line)" stroke-width="6"/><circle cx="26" cy="26" r="22" fill="none" stroke="#34c759" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(C * done).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 26 26)"/></svg><div><b>${all.length}</b><span>всего задач · выполнено ${Math.round(done * 100)}%</span></div></div>`;
  }

  function render() {
    renderSide();
    const keep = document.activeElement && document.activeElement.matches('.mx-add input') ? { q: document.activeElement.dataset.q, v: document.activeElement.value } : null;
    const scroll = Object.fromEntries($$('.mx-card', b).map(c => [c.dataset.q, $('.mx-list', c).scrollTop]));
    $('.mx-grid', b).innerHTML = [1, 2, 3, 4].map(card).join('');
    $('.mx-stats', b).innerHTML = stats();
    $$('.mx-card', b).forEach(c => { $('.mx-list', c).scrollTop = scroll[c.dataset.q] || 0; });
    if (keep) { const i = $(`.mx-add input[data-q="${keep.q}"]`, b); if (i) { i.value = keep.v; i.focus(); } }
    bind();
  }

  function bind() {
    $$('.mx-row', b).forEach(r => {
      const id = r.dataset.id;
      $('.mx-chk', r).onclick = e => { e.stopPropagation(); T.toggle(id); };
      r.ondblclick = () => edit(id);
      r.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); menu(id, e.clientX, e.clientY); };
      r.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-tm', id); e.dataTransfer.effectAllowed = 'move'; r.classList.add('drag'); });
      r.addEventListener('dragend', () => r.classList.remove('drag'));
      // касание: долгое нажатие — меню
      let lp = null;
      r.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') lp = setTimeout(() => menu(id, e.clientX, e.clientY), 550); });
      ['pointerup', 'pointermove', 'pointercancel'].forEach(ev => r.addEventListener(ev, () => clearTimeout(lp)));
    });
    $$('.mx-card', b).forEach(c => {
      const q = +c.dataset.q;
      c.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('text/x-tm')) { e.preventDefault(); c.classList.add('over'); } });
      c.addEventListener('dragleave', e => { if (!c.contains(e.relatedTarget)) c.classList.remove('over'); });
      c.addEventListener('drop', e => { e.preventDefault(); c.classList.remove('over'); const id = e.dataTransfer.getData('text/x-tm'); if (id && T.get(id)?.quadrant !== q) T.move(id, q); });
    });
    $$('.mx-add input', b).forEach(i => i.onkeydown = e => {
      if (e.key === 'Enter' && i.value.trim()) { T.add(+i.dataset.q, i.value.trim()); i.value = ''; }
      if (e.key === 'Escape') i.blur();
    });
  }

  function menu(id, x, y) {
    const t = T.get(id);
    if (!t) return;
    UI.menu(x, y, [
      { label: 'Изменить…', icon: 'edit', action: () => edit(id) },
      { label: t.done ? 'Вернуть в работу' : 'Выполнено', icon: 'check', action: () => T.toggle(id) },
      { label: 'Переместить', icon: 'forward', items: [1, 2, 3, 4].map(q => ({ label: `${q}. ${T.Q[q].title}`, swatch: T.Q[q].color, checked: t.quadrant === q, action: () => T.move(id, q) })) },
      { label: 'Срок', icon: 'history', items: [
        { label: 'Сегодня', action: () => { const d = new Date(); d.setHours(18, 0, 0, 0); T.update(id, { due: d.toISOString() }); } },
        { label: 'Завтра', action: () => { const d = new Date(Date.now() + 864e5); d.setHours(10, 0, 0, 0); T.update(id, { due: d.toISOString() }); } },
        { label: 'Через неделю', action: () => { const d = new Date(Date.now() + 7 * 864e5); d.setHours(10, 0, 0, 0); T.update(id, { due: d.toISOString() }); } },
        { label: 'Без срока', action: () => T.update(id, { due: null }) },
      ] },
      { sep: true },
      { label: 'Удалить', icon: 'trash', danger: true, action: () => T.remove(id) },
    ]);
  }

  const pad = n => String(n).padStart(2, '0');
  const localInput = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  async function edit(id) {
    const t = T.get(id);
    if (!t) return;
    const box = h(`<div class="mx-ed">
      <label>Задача<input class="input" name="title"></label>
      <label>Квадрант<select class="input" name="q">${[1, 2, 3, 4].map(q => `<option value="${q}" ${t.quadrant === q ? 'selected' : ''}>${q}. ${T.Q[q].title} — ${T.Q[q].sub.toLowerCase()}</option>`).join('')}</select></label>
      <label class="mx-ed-due"><span><input type="checkbox" class="check" name="hasdue"> Срок</span><input class="input" type="datetime-local" name="due"></label>
      <label>Заметки<textarea class="input" name="notes" rows="4"></textarea></label>
    </div>`);
    $('[name=title]', box).value = t.title;
    $('[name=notes]', box).value = t.notes || '';
    const hd = $('[name=hasdue]', box), du = $('[name=due]', box);
    hd.checked = !!t.due;
    du.value = localInput(t.due ? new Date(t.due) : (() => { const d = new Date(); d.setHours(18, 0, 0, 0); return d; })());
    du.disabled = !hd.checked;
    hd.onchange = () => { du.disabled = !hd.checked; };
    setTimeout(() => $('[name=title]', box).focus(), 40);
    const r = await UI.dialog({
      title: 'Задача', appIcon: 'timematrix', content: box, sound: false,
      buttons: [{ label: 'Сохранить', value: 'save', primary: true }, { label: 'Удалить', value: 'del', danger: true }, { label: 'Отмена', value: null, cancel: true }],
      validate: (_, v) => (v === 'save' && !$('[name=title]', box).value.trim() ? 'Введите текст задачи.' : null),
    });
    if (r.button === 'del') return T.remove(id);
    if (r.button !== 'save') return;
    T.update(id, { title: $('[name=title]', box).value.trim(), quadrant: +$('[name=q]', box).value, notes: $('[name=notes]', box).value, due: hd.checked && du.value ? new Date(du.value).toISOString() : null });
  }

  $('.mx-backup', b).onclick = e => {
    const r = e.currentTarget.getBoundingClientRect();
    UI.menu(r.left, r.top - 6, [
      { label: 'Сохранить копию в «Документы»', icon: 'save', action: () => T.exportJSON() },
      { label: 'Восстановить из файла…', icon: 'folder-open', action: pickRestore },
      { sep: true },
      { label: 'Экспорт для Excel (CSV)', icon: 'list', action: () => T.exportCSV() },
      { label: 'Удалить выполненные', icon: 'trash', action: () => T.clearDone() },
      { sep: true },
      { label: 'Виджет на рабочий стол', icon: 'pin', action: () => DeskWidgets.add('timematrix', { list: 'all' }) },
    ], { above: true });
  };
  async function pickRestore() {
    const path = await UI.filePicker({ mode: 'open', dir: FS.P.docs, kinds: ['code', 'text'], title: 'Матрица времени: восстановить из копии', typeLabel: 'Резервная копия (JSON)' });
    if (path) T.importJSON(path);
  }

  $('.mx-search input', b).oninput = e => { query = e.target.value.trim().toLowerCase(); render(); };
  win.el.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyF') { e.preventDefault(); $('.mx-search input', b).focus(); }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyN') { e.preventDefault(); $('.mx-add input[data-q="1"]', b).focus(); }
  });
  const off = T.on('change', render);
  const tick = setInterval(() => { if (!b.isConnected) return clearInterval(tick); renderSide(); }, 60e3);
  win.onClose = () => { off(); clearInterval(tick); AppData.save('timematrix', T.data); };
  render();
  return win;
}

Apps.register({ id: 'timematrix', name: 'Матрица времени', icon: 'timematrix', single: true, desc: 'Задачи по матрице Эйзенхауэра: срочно и важно', keywords: 'матрица времени эйзенхауэр timematrix приоритеты задачи срочно важно планировщик', launch: openTimeMatrix });

