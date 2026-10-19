/* Напоминания — системное приложение WindowsFX в духе «Напоминаний» macOS:
   смарт-списки (Сегодня, Запланировано, Все, С флажком, Завершено), свои списки с цветами,
   дата и время, повтор, приоритет, флажок, заметки; уведомления Android в назначенное время;
   виджет для панели виджетов и рабочего стола. Данные сохраняются при каждом изменении. */
'use strict';

const Reminders = (() => {
  const COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#0a84ff', '#5e5ce6', '#bf5af2', '#ff2d55', '#a2845e'];
  const em = new Emitter();
  const fresh = () => ({
    lists: [{ id: 'l1', name: 'Напоминания', color: '#0a84ff' }, { id: 'l2', name: 'Работа', color: '#ff9500' }, { id: 'l3', name: 'Личное', color: '#34c759' }],
    items: [
      { id: uid('r'), list: 'l1', title: 'Добро пожаловать в «Напоминания»', notes: 'Нажмите на кружок, чтобы отметить выполненным', due: dateKey(new Date()), time: '', flag: false, prio: 0, done: false, repeat: '', created: Date.now() },
      { id: uid('r'), list: 'l2', title: 'Проверить почту', notes: '', due: dateKey(new Date()), time: '18:00', flag: true, prio: 2, done: false, repeat: '', created: Date.now() },
    ],
  });
  let D = AppData.load('reminders', fresh);
  if (!D.lists?.length) D = fresh();

  function save() { AppData.save('reminders', D); em.emit('change'); scheduleAll(); }
  const today = () => dateKey(new Date());
  const dueTs = it => it.due ? new Date(it.due + 'T' + (it.time || '09:00') + ':00').getTime() : null;
  const listOf = id => D.lists.find(l => l.id === id) || D.lists[0];

  const SMART = {
    today: { name: 'Сегодня', color: '#0a84ff', icon: 'calendar', filter: it => !it.done && it.due && it.due <= today() },
    scheduled: { name: 'Запланировано', color: '#ff3b30', icon: 'clock', filter: it => !it.done && !!it.due },
    all: { name: 'Все', color: '#636366', icon: 'list', filter: it => !it.done },
    flagged: { name: 'С флажком', color: '#ff9500', icon: 'flag', filter: it => !it.done && it.flag },
    done: { name: 'Завершено', color: '#8e8e93', icon: 'check', filter: it => it.done },
  };
  function itemsFor(key) {
    const f = SMART[key] ? SMART[key].filter : it => it.list === key && !it.done;
    return D.items.filter(f).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (a.time || '').localeCompare(b.time || '') || (b.prio - a.prio) || a.created - b.created);
  }

  function add(list, title, extra = {}) {
    const it = { id: uid('r'), list: list && !SMART[list] ? list : D.lists[0].id, title, notes: '', due: list === 'today' ? today() : '', time: '', flag: list === 'flagged', prio: 0, done: false, repeat: '', created: Date.now(), ...extra };
    D.items.push(it); save(); return it;
  }
  function update(id, patch) { const it = D.items.find(x => x.id === id); if (!it) return; Object.assign(it, patch); save(); return it; }
  function remove(id) { D.items = D.items.filter(x => x.id !== id); FX.tryCall('notifyCancel', id); save(); }
  function toggle(id) {
    const it = D.items.find(x => x.id === id);
    if (!it) return;
    if (!it.done && it.repeat && it.due) {
      // повторяющееся: переносим на следующий срок
      const d = new Date(it.due + 'T12:00:00');
      if (it.repeat === 'day') d.setDate(d.getDate() + 1);
      if (it.repeat === 'week') d.setDate(d.getDate() + 7);
      if (it.repeat === 'month') d.setMonth(d.getMonth() + 1);
      if (it.repeat === 'year') d.setFullYear(d.getFullYear() + 1);
      it.due = dateKey(d);
      Sound.play?.('notify');
    } else { it.done = !it.done; it.doneAt = it.done ? Date.now() : 0; }
    save();
  }

  // ---------- Уведомления ----------
  const fired = new Set(Persist.get('reminders.fired', []));
  let timer = 0;
  function scheduleAll() {
    clearTimeout(timer);
    const now = Date.now();
    let next = Infinity;
    for (const it of D.items) {
      const ts = dueTs(it);
      if (!ts || it.done) { FX.tryCall('notifyCancel', it.id); continue; }
      const key = it.id + '@' + ts;
      if (ts > now) {
        FX.tryCall('notifySchedule', it.id, ts, it.title, it.notes || listOf(it.list).name);
        next = Math.min(next, ts);
      } else if (it.time && !fired.has(key) && now - ts < 6 * 3600e3) fire(it, key);
    }
    if (next < Infinity) timer = setTimeout(scheduleAll, Math.min(next - now + 500, 2 ** 31 - 1));
  }
  function fire(it, key) {
    fired.add(key);
    Persist.set('reminders.fired', [...fired].slice(-300));
    UI.notify({
      title: it.title, body: (it.notes ? it.notes + '\n' : '') + (it.time ? 'Сегодня, ' + it.time : ''), icon: 'reminders', app: 'reminders',
      actions: [{ label: 'Готово', action: () => toggle(it.id) }, { label: 'Через 10 мин', action: () => snooze(it.id, 10) }],
      onClick: () => Apps.launch('reminders', { item: it.id }),
    });
  }
  function snooze(id, min) {
    const d = new Date(Date.now() + min * 60e3);
    update(id, { due: dateKey(d), time: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') });
  }
  setTimeout(() => { FX.tryCall('notifyPermission'); scheduleAll(); }, 4000);
  FX.on('reminder', d => Apps.launch('reminders', { item: d.id }));

  function dueLabel(it) {
    if (!it.due) return '';
    const t = today();
    const tm = new Date(); tm.setDate(tm.getDate() + 1);
    const y = new Date(); y.setDate(y.getDate() - 1);
    let s = it.due === t ? 'Сегодня' : it.due === dateKey(tm) ? 'Завтра' : it.due === dateKey(y) ? 'Вчера' : fmtDate(new Date(it.due + 'T12:00:00').getTime());
    if (it.time) s += ', ' + it.time;
    return s;
  }
  const overdue = it => !it.done && it.due && (it.due < today() || (it.due === today() && it.time && dueTs(it) < Date.now()));

  // ---------- Виджет (панель виджетов и рабочий стол) ----------
  function widget(el, opts = {}) {
    const key = opts.list || 'today';
    const draw = () => {
      if (!el.isConnected) { off(); return; }
      const src = SMART[key] || listOf(key);
      const items = itemsFor(key).slice(0, opts.max || 6);
      const count = itemsFor(key).length;
      el.innerHTML = `<div class="rm-w">
        <div class="rm-w-head"><span class="rm-w-ic" style="background:${src.color}">${Icons.ui(SMART[key]?.icon || 'list', 14)}</span><b style="color:${src.color}">${esc(src.name)}</b><span class="rm-w-n">${count}</span></div>
        <div class="rm-w-list">${items.length ? items.map(it => `<div class="rm-w-it" data-id="${it.id}"><button class="rm-chk" style="--c:${listOf(it.list).color}" title="Выполнено"></button><div><div class="rm-w-t">${it.prio ? `<span class="rm-prio">${'!'.repeat(it.prio)}</span> ` : ''}${esc(it.title)}</div>${it.due ? `<div class="rm-w-d ${overdue(it) ? 'late' : ''}">${esc(dueLabel(it))}</div>` : ''}</div>${it.flag ? `<span class="rm-flag">${Icons.ui('flag', 12)}</span>` : ''}</div>`).join('') : '<div class="rm-w-empty">Нет напоминаний 🎉</div>'}</div>
        <input class="rm-w-add" placeholder="+ Новое напоминание">
      </div>`;
      $$('.rm-chk', el).forEach(b => b.onclick = e => { e.stopPropagation(); const r = b.closest('.rm-w-it'); r.classList.add('done'); setTimeout(() => toggle(r.dataset.id), 350); });
      $$('.rm-w-it', el).forEach(r => r.onclick = () => { Shell.closeAll?.(); Apps.launch('reminders', { item: r.dataset.id }); });
      $('.rm-w-head', el).onclick = () => { Shell.closeAll?.(); Apps.launch('reminders', { list: key }); };
      const inp = $('.rm-w-add', el);
      inp.onkeydown = e => { if (e.key === 'Enter' && inp.value.trim()) { add(key, inp.value.trim()); } };
    };
    const off = em.on('change', draw);
    draw();
    return { destroy: off, options: () => [...Object.entries(SMART).filter(([k]) => k !== 'done').map(([k, v]) => [k, v.name]), ...D.lists.map(l => [l.id, l.name])] };
  }

  return { get data() { return D; }, SMART, COLORS, itemsFor, add, update, remove, toggle, snooze, listOf, dueLabel, overdue, save, on: (e, f) => em.on(e, f), widget };
})();

function openReminders(args = {}) {
  const R = Reminders;
  const win = WM.open({ app: 'reminders', title: 'Напоминания', width: 920, height: 600, minWidth: 520, minHeight: 380, bodyClass: 'rm' });
  const b = win.body;
  let cur = args.list || 'today';
  let sel = args.item || null;
  b.innerHTML = `
    <div class="rm-side">
      <input class="input rm-search" placeholder="Поиск">
      <div class="rm-smart"></div>
      <div class="rm-mylists-h">Мои списки</div>
      <div class="rm-lists"></div>
      <div class="rm-side-foot"><button class="btn sm rm-addlist">${Icons.ui('plus', 14)} Добавить список</button><button class="icon-btn rm-pin" title="Виджет на рабочий стол">${Icons.ui('pin', 16)}</button></div>
    </div>
    <div class="rm-main">
      <div class="rm-head"><h1 class="rm-title"></h1><span class="rm-count"></span><span class="spacer"></span><button class="icon-btn rm-showdone" title="Показать завершённые">${Icons.ui('check', 16)}</button><button class="icon-btn rm-new" title="Новое напоминание (Ctrl+N)">${Icons.ui('plus', 18)}</button></div>
      <div class="rm-items"></div>
    </div>`;
  let showDone = false, query = '';

  function renderSide() {
    const sm = $('.rm-smart', b);
    sm.innerHTML = Object.entries(R.SMART).map(([k, s]) => `<div class="rm-tile ${cur === k ? 'on' : ''}" data-k="${k}"><span class="rm-tile-ic" style="background:${s.color}">${Icons.ui(s.icon, 16)}</span><b>${k === 'done' ? '' : R.itemsFor(k).length}</b><span>${esc(s.name)}</span></div>`).join('');
    $$('.rm-tile', sm).forEach(t => t.onclick = () => { cur = t.dataset.k; query = ''; $('.rm-search', b).value = ''; render(); });
    const ls = $('.rm-lists', b);
    ls.innerHTML = R.data.lists.map(l => `<div class="rm-list ${cur === l.id ? 'on' : ''}" data-id="${l.id}"><span class="rm-dot" style="background:${l.color}">${Icons.ui('list', 12)}</span><span class="rm-ln">${esc(l.name)}</span><span class="muted">${R.itemsFor(l.id).length}</span></div>`).join('');
    $$('.rm-list', ls).forEach(r => {
      r.onclick = () => { cur = r.dataset.id; render(); };
      r.oncontextmenu = e => { e.preventDefault(); listMenu(r.dataset.id, e.clientX, e.clientY); };
    });
  }
  function listMenu(id, x, y) {
    const l = R.data.lists.find(z => z.id === id);
    UI.menu(x, y, [
      { label: 'Переименовать', icon: 'rename', action: async () => { const n = await UI.prompt('Список', 'Название списка:', l.name); if (n) { l.name = n.trim(); R.save(); } } },
      { label: 'Цвет', icon: 'palette', items: R.COLORS.map((c, i) => ({ label: ['Красный', 'Оранжевый', 'Жёлтый', 'Зелёный', 'Бирюзовый', 'Синий', 'Индиго', 'Фиолетовый', 'Розовый', 'Коричневый'][i], swatch: c, checked: l.color === c, action: () => { l.color = c; R.save(); } })) },
      { label: 'Виджет на рабочий стол', icon: 'pin', action: () => DeskWidgets.add('reminders', { list: id }) },
      { sep: true },
      { label: 'Удалить список', icon: 'trash', disabled: R.data.lists.length < 2, action: async () => {
        if (!(await UI.confirm('Удалить список', `Удалить список «${l.name}» и все его напоминания?`, { ok: 'Удалить', danger: true }))) return;
        R.data.items = R.data.items.filter(i => i.list !== id); R.data.lists = R.data.lists.filter(z => z.id !== id);
        if (cur === id) cur = 'today'; R.save();
      } },
    ]);
  }

  function render() {
    renderSide();
    const src = R.SMART[cur] || R.listOf(cur);
    $('.rm-title', b).textContent = query ? 'Результаты поиска' : src.name;
    $('.rm-title', b).style.color = query ? '' : src.color;
    let items;
    if (query) items = R.data.items.filter(i => (i.title + ' ' + i.notes).toLowerCase().includes(query.toLowerCase()));
    else {
      items = R.itemsFor(cur);
      if (showDone && !R.SMART[cur]) items = items.concat(R.data.items.filter(i => i.list === cur && i.done));
    }
    $('.rm-count', b).textContent = items.length;
    const el = $('.rm-items', b);
    const group = cur === 'scheduled' && !query;
    let lastG = null;
    const rows = [];
    for (const it of items) {
      if (group) {
        const g = R.dueLabel({ due: it.due }) || 'Без даты';
        if (g !== lastG) { rows.push(`<div class="rm-group">${esc(g)}</div>`); lastG = g; }
      }
      const l = R.listOf(it.list);
      rows.push(`<div class="rm-it ${it.done ? 'done' : ''} ${sel === it.id ? 'sel' : ''}" data-id="${it.id}">
        <button class="rm-chk ${it.done ? 'on' : ''}" style="--c:${l.color}"></button>
        <div class="rm-body">
          <div class="rm-tline">${it.prio ? `<span class="rm-prio" style="color:${l.color}">${'!'.repeat(it.prio)}</span>` : ''}<input class="rm-t" value="${esc(it.title)}" spellcheck="true"></div>
          ${it.notes ? `<div class="rm-notes">${esc(it.notes)}</div>` : ''}
          <div class="rm-meta">${it.due ? `<span class="${R.overdue(it) ? 'late' : ''}">${Icons.ui('calendar', 12)} ${esc(R.dueLabel(it))}</span>` : ''}${it.repeat ? `<span>${Icons.ui('repeat', 12)} ${esc({ day: 'Ежедневно', week: 'Еженедельно', month: 'Ежемесячно', year: 'Ежегодно' }[it.repeat])}</span>` : ''}${R.SMART[cur] ? `<span style="color:${l.color}">${esc(l.name)}</span>` : ''}</div>
        </div>
        ${it.flag ? `<span class="rm-flag">${Icons.ui('flag', 14)}</span>` : ''}
        <button class="icon-btn rm-info" title="Подробнее">${Icons.ui('info', 16)}</button>
      </div>`);
    }
    if (!items.length && !query) rows.push(`<div class="rm-empty">${cur === 'done' ? 'Нет завершённых напоминаний' : 'Нет напоминаний'}</div>`);
    if (!R.SMART[cur] || cur === 'today' || cur === 'flagged' || cur === 'all') rows.push(`<div class="rm-it rm-newrow"><span class="rm-chk ghost"></span><input class="rm-t rm-newt" placeholder="Новое напоминание"></div>`);
    el.innerHTML = rows.join('');
    $$('.rm-it[data-id]', el).forEach(r => {
      const id = r.dataset.id;
      $('.rm-chk', r).onclick = () => { r.classList.add('done'); $('.rm-chk', r).classList.add('on'); setTimeout(() => R.toggle(id), 380); };
      const t = $('.rm-t', r);
      t.onchange = () => { if (t.value.trim()) R.update(id, { title: t.value.trim() }); else R.remove(id); };
      t.onkeydown = e => { if (e.key === 'Enter') { t.blur(); newAfter(); } };
      t.onfocus = () => { sel = id; $$('.rm-it.sel', el).forEach(x => x.classList.remove('sel')); r.classList.add('sel'); };
      $('.rm-info', r).onclick = e => details(id, e.currentTarget);
      r.oncontextmenu = e => { e.preventDefault(); itemMenu(id, e.clientX, e.clientY); };
    });
    const nt = $('.rm-newt', el);
    if (nt) nt.onkeydown = e => {
      if (e.key === 'Enter' && nt.value.trim()) {
        const it = R.add(cur, nt.value.trim());
        sel = it.id;
        setTimeout(() => $('.rm-newt', b)?.focus(), 30);
      }
    };
    if (sel) el.querySelector(`.rm-it[data-id="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }
  function newAfter() { setTimeout(() => $('.rm-newt', b)?.focus(), 20); }

  function itemMenu(id, x, y) {
    const it = R.data.items.find(i => i.id === id);
    if (!it) return;
    const d = new Date(); const tm = new Date(); tm.setDate(tm.getDate() + 1); const wk = new Date(); wk.setDate(wk.getDate() + 7);
    UI.menu(x, y, [
      { label: 'Подробнее…', icon: 'info', action: () => details(id) },
      { label: 'Сегодня', icon: 'calendar', action: () => R.update(id, { due: dateKey(d) }) },
      { label: 'Завтра', icon: 'calendar', action: () => R.update(id, { due: dateKey(tm) }) },
      { label: 'Через неделю', icon: 'calendar', action: () => R.update(id, { due: dateKey(wk) }) },
      { label: it.flag ? 'Снять флажок' : 'Поставить флажок', icon: 'flag', action: () => R.update(id, { flag: !it.flag }) },
      { label: 'Приоритет', items: [[0, 'Нет'], [1, 'Низкий !'], [2, 'Средний !!'], [3, 'Высокий !!!']].map(([v, n]) => ({ label: n, checked: it.prio === v, action: () => R.update(id, { prio: v }) })) },
      { label: 'Переместить в список', items: R.data.lists.map(l => ({ label: l.name, checked: it.list === l.id, action: () => R.update(id, { list: l.id }) })) },
      { sep: true },
      { label: 'Удалить', icon: 'trash', action: () => R.remove(id) },
    ]);
  }

  function details(id) {
    const it = R.data.items.find(i => i.id === id);
    if (!it) return;
    const el = h(`<div class="rm-det">
      <input class="input rm-d-title" value="${esc(it.title)}">
      <textarea class="input rm-d-notes" placeholder="Заметки">${esc(it.notes || '')}</textarea>
      <div class="rm-d-row"><label>${Icons.ui('calendar', 14)} Дата</label><input type="date" class="input rm-d-date" value="${esc(it.due || '')}"><button class="btn sm rm-d-nodate">Без даты</button></div>
      <div class="rm-d-row"><label>${Icons.ui('clock', 14)} Время</label><input type="time" class="input rm-d-time" value="${esc(it.time || '')}"></div>
      <div class="rm-d-row"><label>${Icons.ui('repeat', 14)} Повтор</label><select class="input rm-d-rep">${[['', 'Никогда'], ['day', 'Ежедневно'], ['week', 'Еженедельно'], ['month', 'Ежемесячно'], ['year', 'Ежегодно']].map(([v, n]) => `<option value="${v}" ${it.repeat === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="rm-d-row"><label>${Icons.ui('alert', 14)} Приоритет</label><select class="input rm-d-prio">${[[0, 'Нет'], [1, 'Низкий'], [2, 'Средний'], [3, 'Высокий']].map(([v, n]) => `<option value="${v}" ${it.prio === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="rm-d-row"><label>${Icons.ui('list', 14)} Список</label><select class="input rm-d-list">${R.data.lists.map(l => `<option value="${l.id}" ${it.list === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
      <label class="rm-d-row"><span>${Icons.ui('flag', 14)} С флажком</span><input type="checkbox" class="check rm-d-flag" ${it.flag ? 'checked' : ''}></label>
    </div>`);
    $('.rm-d-nodate', el).onclick = () => { $('.rm-d-date', el).value = ''; $('.rm-d-time', el).value = ''; };
    UI.dialog({ title: 'Подробнее', appIcon: 'reminders', content: el, buttons: [{ label: 'Готово', value: true, primary: true }, { label: 'Удалить', value: 'del', danger: true }, { label: 'Отмена', value: false, cancel: true }] }).then(r => {
      if (r.button === 'del') return R.remove(id);
      if (!r.button) return;
      R.update(id, {
        title: $('.rm-d-title', el).value.trim() || it.title, notes: $('.rm-d-notes', el).value, due: $('.rm-d-date', el).value, time: $('.rm-d-date', el).value ? $('.rm-d-time', el).value : '',
        repeat: $('.rm-d-rep', el).value, prio: +$('.rm-d-prio', el).value, list: $('.rm-d-list', el).value, flag: $('.rm-d-flag', el).checked,
      });
    });
    setTimeout(() => $('.rm-d-title', el).focus(), 50);
  }

  $('.rm-new', b).onclick = () => { if (R.SMART[cur] && !['today', 'flagged', 'all'].includes(cur)) cur = R.data.lists[0].id; render(); newAfter(); };
  $('.rm-showdone', b).onclick = () => { showDone = !showDone; $('.rm-showdone', b).classList.toggle('on', showDone); render(); };
  $('.rm-addlist', b).onclick = async () => {
    const n = await UI.prompt('Новый список', 'Название списка:', 'Новый список');
    if (!n) return;
    const l = { id: uid('l'), name: n.trim(), color: R.COLORS[R.data.lists.length % R.COLORS.length] };
    R.data.lists.push(l); cur = l.id; R.save();
  };
  $('.rm-pin', b).onclick = () => DeskWidgets.add('reminders', { list: cur === 'done' ? 'today' : cur });
  $('.rm-search', b).oninput = e => { query = e.target.value.trim(); render(); };
  win.el.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.code === 'KeyN') { e.preventDefault(); $('.rm-new', b).click(); } });
  const off = R.on('change', () => { if (!b.querySelector('.rm-t:focus')) render(); else renderSide(); });
  win.onClose = () => off();
  win.onArgs = a => { if (a.list) cur = a.list; if (a.item) { sel = a.item; const it = R.data.items.find(i => i.id === a.item); if (it && !R.itemsFor(cur).includes(it)) cur = it.done ? 'done' : it.list; } render(); };
  if (sel) { const it = R.data.items.find(i => i.id === sel); if (it) cur = it.done ? 'done' : it.list; }
  render();
  return win;
}

Apps.register({ id: 'reminders', name: 'Напоминания', icon: 'reminders', single: true, desc: 'Списки дел и напоминания с уведомлениями', keywords: 'напоминания reminders задачи списки уведомления будильник дела', launch: openReminders });
