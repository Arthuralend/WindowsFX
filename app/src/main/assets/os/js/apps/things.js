/* Дела — менеджер задач в духе Things: Входящие, Сегодня (и «Этим вечером»), Предстоящие,
   В любое время, Когда-нибудь, Журнал; проекты с прогрессом, теги, сроки, контрольные списки.
   Всё сохраняется при каждом изменении (AppData: хранилище WindowsFX + копия на устройстве). */
'use strict';

const Things = (() => {
  const em = new Emitter();
  const fresh = () => {
    const p1 = { id: uid('p'), title: 'Знакомство с «Делами»', notes: 'Пример проекта: отмечайте задачи, и круг прогресса заполнится', color: '#2f6bff', done: false, created: Date.now() };
    const t = (title, extra = {}) => ({ id: uid('t'), title, notes: '', when: '', evening: false, deadline: '', tags: [], checklist: [], project: null, done: false, doneAt: 0, trashed: false, created: Date.now(), order: Date.now() + Math.random(), ...extra });
    return {
      projects: [p1],
      todos: [
        t('Нажмите на задачу, чтобы открыть её', { project: p1.id, notes: 'Здесь можно писать заметки, добавлять контрольный список, теги и срок' }),
        t('Перетащите задачу в «Сегодня»', { project: p1.id, when: dateKey(new Date()) }),
        t('Нажмите «+», чтобы добавить новую задачу', { project: p1.id }),
        t('Разобрать входящие'),
      ],
      tags: ['Работа', 'Дом', 'Срочно'],
    };
  };
  let D = AppData.load('things', fresh);
  const save = () => { AppData.save('things', D); em.emit('change'); };
  const today = () => dateKey(new Date());
  const active = t => !t.done && !t.trashed;
  const isToday = t => active(t) && ((t.when && t.when !== 'someday' && t.when <= today()) || (t.deadline && t.deadline <= today()));
  const byOrder = (a, b) => (a.order || 0) - (b.order || 0);

  const VIEWS = {
    inbox: { name: 'Входящие', icon: 'tg-inbox', color: '#2f80ed', filter: t => active(t) && !t.project && !t.when },
    today: { name: 'Сегодня', icon: 'tg-star', color: '#f5b400', filter: isToday },
    upcoming: { name: 'Предстоящие', icon: 'tg-cal', color: '#ef4444', filter: t => active(t) && t.when && t.when !== 'someday' && t.when > today() },
    anytime: { name: 'В любое время', icon: 'tg-stack', color: '#14b8a6', filter: t => active(t) && t.when !== 'someday' && !(t.when && t.when > today()) && (t.project || t.when) },
    someday: { name: 'Когда-нибудь', icon: 'tg-box', color: '#c4a46b', filter: t => active(t) && t.when === 'someday' },
    logbook: { name: 'Журнал', icon: 'tg-log', color: '#22c55e', filter: t => t.done && !t.trashed },
    trash: { name: 'Корзина', icon: 'tg-trash', color: '#94a3b8', filter: t => t.trashed },
  };
  const G = {
    'tg-inbox': '<path d="M4 13l2.2-7.3A2 2 0 0 1 8.1 4.3h7.8a2 2 0 0 1 1.9 1.4L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="currentColor" opacity=".25"/><path d="M4 13h4.5l1.2 2.4h4.6l1.2-2.4H20M4 13l2.2-7.3A2 2 0 0 1 8.1 4.3h7.8a2 2 0 0 1 1.9 1.4L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    'tg-star': '<path d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6l-5.3 2.9 1.1-5.9-4.4-4.1 6-.8z" fill="currentColor"/>',
    'tg-cal': '<rect x="3.5" y="5" width="17" height="15" rx="3" fill="currentColor" opacity=".2"/><rect x="3.5" y="5" width="17" height="15" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="7" y="12.5" width="3" height="3" rx=".8" fill="currentColor"/>',
    'tg-stack': '<path d="M12 3.5l8.5 4.2L12 12 3.5 7.7z" fill="currentColor"/><path d="M3.5 12l8.5 4.3 8.5-4.3M3.5 16.2l8.5 4.3 8.5-4.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    'tg-box': '<path d="M4 8h16v10.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="currentColor" opacity=".3"/><rect x="3" y="4" width="18" height="4.5" rx="1.5" fill="currentColor"/><path d="M10 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    'tg-log': '<rect x="4" y="3.5" width="16" height="17" rx="3" fill="currentColor"/><path d="M8.2 12.3l2.6 2.6 5-5.4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    'tg-trash': '<path d="M5 7h14l-1.1 12a2 2 0 0 1-2 1.8H8.1a2 2 0 0 1-2-1.8z" fill="currentColor" opacity=".35"/><path d="M4 7h16M9.5 7V4.8h5V7M5.5 7l1.1 12a2 2 0 0 0 2 1.8h6.8a2 2 0 0 0 2-1.8L18.5 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    'tg-flag': '<path d="M6 21V4m0 0h10l-2 4 2 4H6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    'tg-tag': '<path d="M3.5 12.3V4.5a1 1 0 0 1 1-1h7.8l8.2 8.2a1.4 1.4 0 0 1 0 2l-6.3 6.3a1.4 1.4 0 0 1-2 0z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/>',
    'tg-list': '<path d="M9 6.5h11M9 12h11M9 17.5h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M3.6 6.5l1.2 1.2 2-2.2M3.6 12l1.2 1.2 2-2.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="5" cy="17.5" r="1.3" fill="currentColor"/>',
    'tg-moon': '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" fill="currentColor"/>',
    'tg-note': '<path d="M6 4h9l4 4v12H6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 11h7M9 14.5h7M9 18h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  };
  const gi = (k, s = 18, c = 'currentColor') => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" style="color:${c}">${G[k]}</svg>`;

  function list(view) {
    if (VIEWS[view]) return D.todos.filter(VIEWS[view].filter);
    return D.todos.filter(t => t.project === view && !t.trashed && (!t.done || Date.now() - t.doneAt < 2500));
  }
  function progress(pid) {
    const all = D.todos.filter(t => t.project === pid && !t.trashed);
    return all.length ? all.filter(t => t.done).length / all.length : 0;
  }
  function add(view, title, extra = {}) {
    const t = { id: uid('t'), title, notes: '', when: '', evening: false, deadline: '', tags: [], checklist: [], project: null, done: false, doneAt: 0, trashed: false, created: Date.now(), order: Date.now(), ...extra };
    if (view === 'today') t.when = today();
    else if (view === 'someday') t.when = 'someday';
    else if (view === 'upcoming') { const d = new Date(); d.setDate(d.getDate() + 1); t.when = dateKey(d); }
    else if (!VIEWS[view] && view) t.project = view;
    D.todos.push(t); save(); return t;
  }
  const get = id => D.todos.find(t => t.id === id);
  function update(id, patch) { const t = get(id); if (t) { Object.assign(t, patch); save(); } return t; }
  function toggle(id) { const t = get(id); if (!t) return; t.done = !t.done; t.doneAt = t.done ? Date.now() : 0; save(); }

  function whenLabel(t) {
    if (!t.when) return '';
    if (t.when === 'someday') return 'Когда-нибудь';
    if (t.when <= today()) return t.evening ? 'Этим вечером' : 'Сегодня';
    const tm = new Date(); tm.setDate(tm.getDate() + 1);
    if (t.when === dateKey(tm)) return 'Завтра';
    return fmtDate(new Date(t.when + 'T12:00:00').getTime());
  }
  function deadlineLabel(t) {
    if (!t.deadline) return '';
    const days = Math.round((new Date(t.deadline + 'T12:00:00') - new Date(today() + 'T12:00:00')) / 864e5);
    return days < 0 ? `просрочено на ${-days} ${plural(-days, 'день', 'дня', 'дней')}` : days === 0 ? 'срок сегодня' : `осталось ${days} ${plural(days, 'день', 'дня', 'дней')}`;
  }

  // ---------- Виджет «Сегодня» ----------
  function widget(el, opts = {}) {
    const view = opts.list || 'today';
    const draw = () => {
      if (!el.isConnected) { off(); return; }
      const items = list(view).filter(active).sort(byOrder);
      const v = VIEWS[view] || { name: D.projects.find(p => p.id === view)?.title || 'Проект', icon: 'tg-list', color: '#2f6bff' };
      el.innerHTML = `<div class="tg-w">
        <div class="tg-w-head">${gi(v.icon, 18, v.color)}<b>${esc(v.name)}</b><span class="tg-w-n">${items.length || ''}</span></div>
        <div class="tg-w-list">${items.slice(0, opts.max || 7).map(t => `<div class="tg-w-it" data-id="${t.id}"><button class="tg-chk"></button><span>${esc(t.title)}</span>${t.deadline ? `<i class="tg-dl">${gi('tg-flag', 12)}</i>` : ''}</div>`).join('') || '<div class="tg-w-empty">Всё сделано ✨</div>'}</div>
        <input class="tg-w-add" placeholder="+ Новая задача">
      </div>`;
      $$('.tg-chk', el).forEach(b => b.onclick = e => { e.stopPropagation(); const r = b.closest('.tg-w-it'); r.classList.add('done'); setTimeout(() => toggle(r.dataset.id), 400); });
      $$('.tg-w-it', el).forEach(r => r.onclick = () => { Shell.closeAll?.(); Apps.launch('things', { view, item: r.dataset.id }); });
      $('.tg-w-head', el).onclick = () => { Shell.closeAll?.(); Apps.launch('things', { view }); };
      const inp = $('.tg-w-add', el);
      inp.onkeydown = e => { if (e.key === 'Enter' && inp.value.trim()) add(view, inp.value.trim()); };
    };
    const off = em.on('change', draw);
    draw();
    return { destroy: off, options: () => [['today', 'Сегодня'], ['inbox', 'Входящие'], ['upcoming', 'Предстоящие'], ['anytime', 'В любое время'], ...D.projects.filter(p => !p.done).map(p => [p.id, p.title])] };
  }

  return { get data() { return D; }, VIEWS, G, gi, list, progress, add, get, update, toggle, save, whenLabel, deadlineLabel, isToday, active, byOrder, today, on: (e, f) => em.on(e, f), widget };
})();

function openThings(args = {}) {
  const T = Things;
  const gi = T.gi;
  const win = WM.open({ app: 'things', title: 'Дела', width: 980, height: 640, minWidth: 560, minHeight: 400, bodyClass: 'tg' });
  const b = win.body;
  let view = args.view || 'today', open = args.item || null, query = '';
  b.innerHTML = `
    <aside class="tg-side">
      <div class="tg-nav"></div>
      <div class="tg-projh"><span>Проекты</span></div>
      <div class="tg-projs"></div>
      <div class="tg-side-foot"><button class="tg-newproj">${Icons.ui('plus', 14)} Новый проект</button><button class="icon-btn tg-pin" title="Виджет на рабочий стол">${Icons.ui('pin', 16)}</button></div>
    </aside>
    <main class="tg-main">
      <div class="tg-top"><input class="tg-search" placeholder="Быстрый поиск"></div>
      <div class="tg-scroll"><div class="tg-page"></div></div>
      <button class="tg-plus" title="Новая задача (Ctrl+N)">${Icons.ui('plus', 26)}</button>
    </main>`;

  const ring = (p, c) => { const r = 7, L = 2 * Math.PI * r; return `<svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="${r}" fill="none" stroke="${c}" stroke-width="1.8" opacity=".35"/><circle cx="9" cy="9" r="${r - 2.6}" fill="none" stroke="${c}" stroke-width="5.2" stroke-dasharray="${(p * 2 * Math.PI * (r - 2.6)).toFixed(2)} 99" transform="rotate(-90 9 9)"/></svg>`; };

  function renderSide() {
    const nav = $('.tg-nav', b);
    const groups = [['inbox'], ['today', 'upcoming', 'anytime', 'someday'], ['logbook', 'trash']];
    nav.innerHTML = groups.map(g => `<div class="tg-navg">${g.map(k => {
      const v = T.VIEWS[k]; const n = k === 'logbook' || k === 'trash' || k === 'someday' ? 0 : T.list(k).length;
      return `<div class="tg-nv ${view === k && !query ? 'on' : ''}" data-v="${k}">${gi(v.icon, 18, v.color)}<span>${esc(v.name)}</span>${n ? `<b class="${k === 'today' && T.data.todos.some(t => T.active(t) && t.deadline && t.deadline <= T.today()) ? 'red' : ''}">${n}</b>` : ''}</div>`;
    }).join('')}</div>`).join('');
    $$('.tg-nv', nav).forEach(x => x.onclick = () => go(x.dataset.v));
    const pj = $('.tg-projs', b);
    pj.innerHTML = T.data.projects.filter(p => !p.done).map(p => `<div class="tg-nv tg-pj ${view === p.id && !query ? 'on' : ''}" data-v="${p.id}">${ring(T.progress(p.id), p.color || '#2f6bff')}<span>${esc(p.title)}</span>${T.list(p.id).filter(T.active).length ? `<b>${T.list(p.id).filter(T.active).length}</b>` : ''}</div>`).join('');
    $$('.tg-nv', pj).forEach(x => {
      x.onclick = () => go(x.dataset.v);
      x.oncontextmenu = e => { e.preventDefault(); projMenu(x.dataset.v, e.clientX, e.clientY); };
      // перетаскивание задач на проект
      x.addEventListener('dragover', e => { if (dragId) { e.preventDefault(); x.classList.add('drop'); } });
      x.addEventListener('dragleave', () => x.classList.remove('drop'));
      x.addEventListener('drop', e => { e.preventDefault(); x.classList.remove('drop'); if (dragId) T.update(dragId, { project: x.dataset.v }); dragId = null; });
    });
    $$('.tg-nav .tg-nv', b).forEach(x => {
      x.addEventListener('dragover', e => { if (dragId && ['inbox', 'today', 'someday', 'trash', 'anytime'].includes(x.dataset.v)) { e.preventDefault(); x.classList.add('drop'); } });
      x.addEventListener('dragleave', () => x.classList.remove('drop'));
      x.addEventListener('drop', e => {
        e.preventDefault(); x.classList.remove('drop');
        const v = x.dataset.v, id = dragId; dragId = null;
        if (!id) return;
        if (v === 'today') T.update(id, { when: T.today(), evening: false, trashed: false });
        else if (v === 'someday') T.update(id, { when: 'someday' });
        else if (v === 'inbox') T.update(id, { when: '', project: null });
        else if (v === 'anytime') T.update(id, { when: '' });
        else if (v === 'trash') T.update(id, { trashed: true });
      });
    });
  }
  function go(v) { view = v; open = null; query = ''; $('.tg-search', b).value = ''; render(); $('.tg-scroll', b).scrollTop = 0; }

  function projMenu(pid, x, y) {
    const p = T.data.projects.find(z => z.id === pid);
    UI.menu(x, y, [
      { label: 'Переименовать', icon: 'rename', action: async () => { const n = await UI.prompt('Проект', 'Название:', p.title); if (n) { p.title = n.trim(); T.save(); } } },
      { label: 'Цвет', icon: 'palette', items: ['#2f6bff', '#ef4444', '#f59e0b', '#22c55e', '#14b8a6', '#8b5cf6', '#ec4899', '#64748b'].map(c => ({ label: c, swatch: c, checked: p.color === c, action: () => { p.color = c; T.save(); } })) },
      { label: 'Завершить проект', icon: 'check', action: () => { p.done = true; T.data.todos.filter(t => t.project === pid && !t.done).forEach(t => { t.done = true; t.doneAt = Date.now(); }); if (view === pid) view = 'logbook'; T.save(); } },
      { label: 'Виджет на рабочий стол', icon: 'pin', action: () => DeskWidgets.add('things', { list: pid }) },
      { sep: true },
      { label: 'Удалить проект', icon: 'trash', action: async () => {
        if (!(await UI.confirm('Удалить проект', `Удалить «${p.title}»? Задачи проекта будут перемещены в корзину.`, { ok: 'Удалить', danger: true }))) return;
        T.data.todos.filter(t => t.project === pid).forEach(t => { t.trashed = true; });
        T.data.projects = T.data.projects.filter(z => z.id !== pid);
        if (view === pid) view = 'inbox'; T.save();
      } },
    ]);
  }

  let dragId = null;
  function todoHTML(t, opts = {}) {
    const meta = [];
    if (opts.showWhen && t.when && !(view === 'today' && T.isToday(t))) meta.push(`<span class="tg-when">${esc(T.whenLabel(t))}</span>`);
    if (t.when && t.when !== 'someday' && t.when <= T.today() && view !== 'today') meta.unshift(`<span class="tg-star">${gi('tg-star', 13, '#f5b400')}</span>`);
    if (opts.showProject && t.project) { const p = T.data.projects.find(z => z.id === t.project); if (p) meta.push(`<span class="tg-proj">${esc(p.title)}</span>`); }
    t.tags.forEach(g => meta.push(`<span class="tg-tagp">${esc(g)}</span>`));
    if (t.checklist.length) meta.push(`<span class="tg-cl">${gi('tg-list', 13)} ${t.checklist.filter(c => c.d).length}/${t.checklist.length}</span>`);
    if (t.notes) meta.push(`<span class="tg-hasnote">${gi('tg-note', 13)}</span>`);
    if (t.deadline && !t.done) meta.push(`<span class="tg-dline ${t.deadline <= T.today() ? 'late' : ''}">${gi('tg-flag', 13)} ${esc(T.deadlineLabel(t))}</span>`);
    if (t.id === open) return editorHTML(t);
    return `<div class="tg-todo ${t.done ? 'done' : ''}" data-id="${t.id}" draggable="true">
      <button class="tg-chk ${t.done ? 'on' : ''}"></button>
      <div class="tg-tt"><span class="tg-title">${esc(t.title) || '<span class="muted">Новая задача</span>'}</span><span class="tg-meta">${meta.join('')}</span></div>
    </div>`;
  }
  function editorHTML(t) {
    return `<div class="tg-todo tg-open" data-id="${t.id}">
      <button class="tg-chk ${t.done ? 'on' : ''}"></button>
      <div class="tg-ed">
        <input class="tg-ed-title" value="${esc(t.title)}" placeholder="Новая задача">
        <textarea class="tg-ed-notes" placeholder="Заметки" rows="2">${esc(t.notes)}</textarea>
        <div class="tg-ed-cl">${t.checklist.map((c, i) => `<div class="tg-cli ${c.d ? 'done' : ''}" data-i="${i}"><button class="tg-clc"></button><input value="${esc(c.t)}"><button class="icon-btn tg-clx">${Icons.ui('close', 10)}</button></div>`).join('')}</div>
        <div class="tg-ed-tags">${t.tags.map(g => `<span class="tg-tagp">${esc(g)}<i data-g="${esc(g)}">×</i></span>`).join('')}</div>
        <div class="tg-ed-bar">
          ${t.when ? `<button class="tg-chip tg-e-when">${t.when === 'someday' ? gi('tg-box', 14, '#c4a46b') : T.isToday(t) ? gi(t.evening ? 'tg-moon' : 'tg-star', 14, t.evening ? '#8b9cf6' : '#f5b400') : gi('tg-cal', 14, '#ef4444')} ${esc(T.whenLabel(t))}</button>` : ''}
          ${t.deadline ? `<button class="tg-chip tg-e-dl late">${gi('tg-flag', 14, '#ef4444')} Срок: ${esc(fmtDate(new Date(t.deadline + 'T12:00:00').getTime()))}</button>` : ''}
          <span class="spacer"></span>
          <button class="icon-btn tg-e-when2" title="Когда">${gi('tg-cal', 18)}</button>
          <button class="icon-btn tg-e-tag" title="Теги">${gi('tg-tag', 18)}</button>
          <button class="icon-btn tg-e-cl" title="Контрольный список">${gi('tg-list', 18)}</button>
          <button class="icon-btn tg-e-dl2" title="Крайний срок">${gi('tg-flag', 18)}</button>
          <button class="icon-btn tg-e-more" title="Ещё">${Icons.ui('more', 16)}</button>
        </div>
      </div>
    </div>`;
  }

  function section(title, items, opts = {}) {
    if (!items.length && !opts.always) return '';
    return `<div class="tg-sec">${title ? `<div class="tg-sec-h ${opts.cls || ''}">${title}</div>` : ''}${items.map(t => todoHTML(t, opts)).join('')}</div>`;
  }

  function render() {
    renderSide();
    const pg = $('.tg-page', b);
    const v = T.VIEWS[view];
    const proj = !v && T.data.projects.find(p => p.id === view);
    if (!v && !proj) { view = 'inbox'; return render(); }
    let head, body = '';
    if (query) {
      const q = query.toLowerCase();
      const found = T.data.todos.filter(t => !t.trashed && (t.title + ' ' + t.notes + ' ' + t.tags.join(' ')).toLowerCase().includes(q));
      head = `<h1>${Icons.ui('search', 26)} «${esc(query)}»</h1>`;
      body = section('', found, { showWhen: true, showProject: true }) || '<div class="tg-empty">Ничего не найдено</div>';
    } else if (proj) {
      const items = T.list(view).sort(T.byOrder);
      head = `<h1>${ring(T.progress(view), proj.color || '#2f6bff').replace('width="18" height="18"', 'width="30" height="30"')}<input class="tg-ptitle" value="${esc(proj.title)}"></h1><textarea class="tg-pnotes" placeholder="Заметки к проекту" rows="1">${esc(proj.notes || '')}</textarea>`;
      body = section('', items.filter(t => !t.done || Date.now() - t.doneAt < 2500), { showWhen: true }) || '<div class="tg-empty">В проекте пока нет задач</div>';
      const doneN = T.data.todos.filter(t => t.project === view && t.done && !t.trashed).length;
      if (doneN) body += `<div class="tg-doneinfo">Выполнено: ${doneN}</div>`;
    } else {
      head = `<h1>${gi(v.icon, 30, v.color)}<span>${esc(v.name)}</span></h1>`;
      const items = T.list(view);
      if (view === 'today') {
        const day = items.filter(t => !t.evening).sort(T.byOrder), eve = items.filter(t => t.evening).sort(T.byOrder);
        body = section('', day, { showProject: true }) + section(`${gi('tg-moon', 16, '#8b9cf6')} Этим вечером`, eve, { showProject: true, cls: 'eve' });
        if (!items.length) body = '<div class="tg-empty">' + gi('tg-star', 46, '#f5b400') + '<div>На сегодня всё сделано</div></div>';
      } else if (view === 'upcoming') {
        const groups = new Map();
        items.sort((a, c) => a.when.localeCompare(c.when) || T.byOrder(a, c)).forEach(t => {
          const d = new Date(t.when + 'T12:00:00');
          const days = Math.round((d - new Date(T.today() + 'T12:00:00')) / 864e5);
          const key = days <= 7 ? t.when : t.when.slice(0, 7);
          if (!groups.has(key)) groups.set(key, { days, d, items: [] });
          groups.get(key).items.push(t);
        });
        body = [...groups.values()].map(g => {
          const title = g.days === 1 ? `<b class="tg-dnum">${g.d.getDate()}</b> Завтра` : g.days <= 7 ? `<b class="tg-dnum">${g.d.getDate()}</b> ${cap(g.d.toLocaleDateString('ru-RU', { weekday: 'long' }))}` : cap(g.d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }));
          return section(title, g.items, { showProject: true, showWhen: g.days > 7, cls: 'up' });
        }).join('') || '<div class="tg-empty">Нет запланированных задач</div>';
      } else if (view === 'anytime') {
        const noProj = items.filter(t => !t.project).sort(T.byOrder);
        body = section('', noProj, { showWhen: true }) + T.data.projects.filter(p => !p.done).map(p => section(`${ring(T.progress(p.id), p.color || '#2f6bff')} ${esc(p.title)}`, items.filter(t => t.project === p.id).sort(T.byOrder), { showWhen: true, cls: 'proj' })).join('');
        if (!items.length) body = '<div class="tg-empty">Нет задач</div>';
      } else if (view === 'logbook') {
        const groups = new Map();
        items.sort((a, c) => c.doneAt - a.doneAt).forEach(t => { const k = dateKey(new Date(t.doneAt || t.created)); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
        body = [...groups.entries()].map(([k, arr]) => section(k === T.today() ? 'Сегодня' : fmtDateLong(new Date(k + 'T12:00:00').getTime()), arr, { showProject: true, cls: 'up' })).join('') || '<div class="tg-empty">Журнал пуст</div>';
      } else if (view === 'trash') {
        body = (items.length ? `<button class="btn sm tg-empty-trash">Очистить корзину</button>` : '') + (section('', items, { showProject: true }) || '<div class="tg-empty">Корзина пуста</div>');
      } else {
        body = section('', items.sort(T.byOrder), { showWhen: true, showProject: view !== 'inbox' }) || `<div class="tg-empty">${gi(v.icon, 46, v.color)}<div>${view === 'inbox' ? 'Входящие пусты' : 'Нет задач'}</div></div>`;
      }
    }
    pg.innerHTML = `<div class="tg-head">${head}</div>${body}`;
    bind(pg, proj);
  }

  function bind(pg, proj) {
    $$('.tg-todo', pg).forEach(r => {
      const id = r.dataset.id;
      const t = T.get(id);
      $('.tg-chk', r).onclick = e => {
        e.stopPropagation();
        if (!t.done) { r.classList.add('done'); $('.tg-chk', r).classList.add('on'); Sound.play?.('click'); }
        setTimeout(() => { if (open === id) open = null; T.toggle(id); }, t.done ? 0 : 450);
      };
      if (r.classList.contains('tg-open')) return bindEditor(r, t);
      r.onclick = () => { open = id; render(); setTimeout(() => $('.tg-ed-title', b)?.focus(), 20); };
      r.oncontextmenu = e => { e.preventDefault(); todoMenu(id, e.clientX, e.clientY); };
      r.addEventListener('dragstart', e => { dragId = id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.title); r.classList.add('dragging'); });
      r.addEventListener('dragend', () => { r.classList.remove('dragging'); setTimeout(() => { dragId = null; }, 50); });
      r.addEventListener('dragover', e => { if (dragId && dragId !== id) { e.preventDefault(); r.classList.add('dropline'); } });
      r.addEventListener('dragleave', () => r.classList.remove('dropline'));
      r.addEventListener('drop', e => {
        e.preventDefault(); r.classList.remove('dropline');
        if (!dragId || dragId === id) return;
        const moved = T.get(dragId);
        const sibs = $$('.tg-todo', pg).map(x => T.get(x.dataset.id)).filter(Boolean);
        const i = sibs.indexOf(t);
        const prev = sibs[i - 1];
        moved.order = prev && prev !== moved ? (prev.order + t.order) / 2 : t.order - 1;
        if (view === 'today') { moved.when = T.today(); moved.evening = t.evening; }
        dragId = null; T.save();
      });
    });
    if (proj) {
      const pt = $('.tg-ptitle', pg), pn = $('.tg-pnotes', pg);
      pt.onchange = () => { proj.title = pt.value.trim() || proj.title; T.save(); };
      pn.oninput = debounce(() => { proj.notes = pn.value; AppData.save('things', T.data); }, 400);
    }
    $('.tg-empty-trash', pg)?.addEventListener('click', async () => {
      if (!(await UI.confirm('Корзина', 'Удалить задачи из корзины навсегда?', { ok: 'Очистить', danger: true }))) return;
      T.data.todos = T.data.todos.filter(t => !t.trashed); T.save();
    });
  }

  function bindEditor(r, t) {
    const title = $('.tg-ed-title', r), notes = $('.tg-ed-notes', r);
    const autosize = () => { notes.style.height = 'auto'; notes.style.height = Math.min(320, notes.scrollHeight) + 'px'; };
    autosize();
    title.oninput = debounce(() => { t.title = title.value; AppData.save('things', T.data); }, 300);
    notes.oninput = () => { autosize(); t.notes = notes.value; saveSoon(); };
    title.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); t.title = title.value.trim(); close(); } if (e.key === 'Escape') close(); };
    notes.onkeydown = e => { if (e.key === 'Escape') close(); };
    $$('.tg-cli', r).forEach(c => {
      const i = +c.dataset.i;
      $('.tg-clc', c).onclick = () => { t.checklist[i].d = !t.checklist[i].d; T.save(); };
      const inp = $('input', c);
      inp.oninput = () => { t.checklist[i].t = inp.value; saveSoon(); };
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); t.checklist.splice(i + 1, 0, { t: '', d: false }); T.save(); setTimeout(() => $$('.tg-cli input', b)[i + 1]?.focus(), 20); } if (e.key === 'Backspace' && !inp.value) { e.preventDefault(); t.checklist.splice(i, 1); T.save(); setTimeout(() => $$('.tg-cli input', b)[Math.max(0, i - 1)]?.focus(), 20); } };
      $('.tg-clx', c).onclick = () => { t.checklist.splice(i, 1); T.save(); };
    });
    $$('.tg-ed-tags i', r).forEach(x => x.onclick = () => { t.tags = t.tags.filter(g => g !== x.dataset.g); T.save(); });
    const whenMenu = e => {
      const rr = e.currentTarget.getBoundingClientRect();
      const tm = new Date(); tm.setDate(tm.getDate() + 1);
      const wk = new Date(); wk.setDate(wk.getDate() + ((8 - wk.getDay()) % 7 || 7));
      UI.menu(rr.left, rr.bottom + 4, [
        { label: 'Сегодня', swatch: '#f5b400', action: () => T.update(t.id, { when: T.today(), evening: false }) },
        { label: 'Этим вечером', swatch: '#8b9cf6', action: () => T.update(t.id, { when: T.today(), evening: true }) },
        { label: 'Завтра', action: () => T.update(t.id, { when: dateKey(tm), evening: false }) },
        { label: 'В понедельник', action: () => T.update(t.id, { when: dateKey(wk), evening: false }) },
        { label: 'Выбрать дату…', icon: 'calendar', action: () => pickDate(t.when && t.when !== 'someday' ? t.when : T.today()).then(d => d && T.update(t.id, { when: d, evening: false })) },
        { label: 'Когда-нибудь', swatch: '#c4a46b', action: () => T.update(t.id, { when: 'someday', evening: false }) },
        { sep: true },
        { label: 'Очистить', icon: 'close', disabled: !t.when, action: () => T.update(t.id, { when: '', evening: false }) },
      ]);
    };
    $('.tg-e-when2', r).onclick = whenMenu;
    $('.tg-e-when', r)?.addEventListener('click', whenMenu);
    const dl = () => pickDate(t.deadline || T.today(), true).then(d => { if (d !== null) T.update(t.id, { deadline: d }); });
    $('.tg-e-dl2', r).onclick = dl;
    $('.tg-e-dl', r)?.addEventListener('click', dl);
    $('.tg-e-cl', r).onclick = () => { t.checklist.push({ t: '', d: false }); T.save(); setTimeout(() => { const ins = $$('.tg-cli input', b); ins[ins.length - 1]?.focus(); }, 20); };
    $('.tg-e-tag', r).onclick = e => {
      const rr = e.currentTarget.getBoundingClientRect();
      UI.menu(rr.left, rr.bottom + 4, [
        ...T.data.tags.map(g => ({ label: g, checked: t.tags.includes(g), action: () => T.update(t.id, { tags: t.tags.includes(g) ? t.tags.filter(x => x !== g) : [...t.tags, g] }) })),
        { sep: true },
        { label: 'Новый тег…', icon: 'plus', action: async () => { const n = (await UI.prompt('Новый тег', 'Название тега:', ''))?.trim(); if (!n) return; if (!T.data.tags.includes(n)) T.data.tags.push(n); T.update(t.id, { tags: [...new Set([...t.tags, n])] }); } },
      ]);
    };
    $('.tg-e-more', r).onclick = e => { const rr = e.currentTarget.getBoundingClientRect(); todoMenu(t.id, rr.left - 160, rr.bottom + 4); };
  }
  let saveT = 0;
  function saveSoon() { clearTimeout(saveT); saveT = setTimeout(() => AppData.save('things', T.data), 300); }
  function close() { open = null; T.save(); }

  function pickDate(value, isDeadline) {
    const el = h(`<div class="row-gap"><input type="date" class="input" value="${esc(value)}" style="flex:1"></div>`);
    return UI.dialog({ title: isDeadline ? 'Крайний срок' : 'Когда', appIcon: 'things', content: el, buttons: [{ label: 'OK', value: true, primary: true }, ...(isDeadline ? [{ label: 'Без срока', value: 'none' }] : []), { label: 'Отмена', value: false, cancel: true }] })
      .then(r => r.button === 'none' ? '' : r.button ? $('input', el).value || null : null);
  }

  function todoMenu(id, x, y) {
    const t = T.get(id);
    if (!t) return;
    UI.menu(x, y, [
      { label: 'Открыть', icon: 'edit', action: () => { open = id; render(); } },
      { label: 'Сегодня', swatch: '#f5b400', action: () => T.update(id, { when: T.today(), evening: false, trashed: false }) },
      { label: 'Этим вечером', swatch: '#8b9cf6', action: () => T.update(id, { when: T.today(), evening: true }) },
      { label: 'Когда-нибудь', swatch: '#c4a46b', action: () => T.update(id, { when: 'someday' }) },
      { label: 'Переместить в проект', icon: 'folder', items: [{ label: 'Без проекта (Входящие)', checked: !t.project, action: () => T.update(id, { project: null }) }, ...T.data.projects.filter(p => !p.done).map(p => ({ label: p.title, swatch: p.color, checked: t.project === p.id, action: () => T.update(id, { project: p.id }) }))] },
      { label: 'Повторить задачу', icon: 'copy', action: () => { const c = { ...JSON.parse(JSON.stringify(t)), id: uid('t'), done: false, doneAt: 0, created: Date.now(), order: t.order + 0.001 }; T.data.todos.push(c); T.save(); } },
      { sep: true },
      t.trashed ? { label: 'Восстановить', icon: 'undo', action: () => T.update(id, { trashed: false }) } : { label: 'Удалить', icon: 'trash', action: () => { if (open === id) open = null; T.update(id, { trashed: true }); } },
    ].filter(Boolean));
  }

  function newTodo() {
    let target = view;
    if (['logbook', 'trash'].includes(view) || query) target = 'inbox';
    if (target !== view) { view = target; query = ''; }
    const t = T.add(target, '');
    open = t.id;
    render();
    setTimeout(() => { const el = $('.tg-ed-title', b); el?.focus(); el?.scrollIntoView({ block: 'center' }); }, 30);
  }
  $('.tg-plus', b).onclick = newTodo;
  $('.tg-newproj', b).onclick = async () => {
    const n = (await UI.prompt('Новый проект', 'Название проекта:', ''))?.trim();
    if (!n) return;
    const p = { id: uid('p'), title: n, notes: '', color: ['#2f6bff', '#ef4444', '#f59e0b', '#22c55e', '#14b8a6', '#8b5cf6', '#ec4899'][T.data.projects.length % 7], done: false, created: Date.now() };
    T.data.projects.push(p); view = p.id; T.save();
  };
  $('.tg-pin', b).onclick = () => DeskWidgets.add('things', { list: T.VIEWS[view] && !['logbook', 'trash', 'someday'].includes(view) ? view : 'today' });
  $('.tg-search', b).oninput = e => { query = e.target.value.trim(); render(); };
  // щелчок мимо открытой задачи закрывает её
  $('.tg-scroll', b).addEventListener('pointerdown', e => { if (open && !e.target.closest('.tg-open, .ctx-menu')) { open = null; T.save(); } });
  win.el.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyN')) { e.preventDefault(); newTodo(); }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyF') { e.preventDefault(); $('.tg-search', b).focus(); }
  });
  const off = T.on('change', () => {
    const f = document.activeElement;
    if (f && b.contains(f) && f.matches('.tg-ed-title, .tg-ed-notes, .tg-cli input, .tg-ptitle, .tg-pnotes, .tg-search')) { renderSide(); return; }
    render();
  });
  win.onClose = () => { off(); AppData.save('things', T.data); };
  win.onArgs = a => { if (a.view) view = a.view; if (a.item) open = a.item; render(); };
  render();
  return win;
}

Apps.register({ id: 'things', name: 'Дела', icon: 'things', single: true, desc: 'Задачи и проекты: Сегодня, Предстоящие, Когда-нибудь', keywords: 'дела задачи things todo проекты планировщик список дел', launch: openThings });
