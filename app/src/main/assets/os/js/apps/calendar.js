/* Календарь */
'use strict';

Apps.register({
  id: 'calendar', name: 'Календарь', icon: 'calendar', desc: 'События и напоминания', single: true,
  keywords: 'календарь события расписание дата',
  launch: args => openCalendar(args),
});

function openCalendar(args = {}) {
  const COLORS = ['#4f8cff', '#3ddc84', '#ffb020', '#ff5b5b', '#a35cff', '#00b7c3'];
  let sel = args.date || dateKey(new Date());
  let month = new Date(sel + 'T00:00:00'); month.setDate(1);
  const events = () => Persist.get('calendar.events', []);
  const save = e => { Persist.set('calendar.events', e); render(); };

  const win = WM.open({ app: 'calendar', title: 'Календарь', width: 900, height: 600, minWidth: 520, minHeight: 400 });
  const b = win.body;
  b.classList.add('cl');

  function render() {
    const evs = events();
    b.innerHTML = `
      <div class="cl-main">
        <div class="cl-head"><b class="cl-m">${cap(MONTHS[month.getMonth()])} ${month.getFullYear()}</b><span class="spacer"></span>
          <button class="btn sm cl-today">Сегодня</button><button class="icon-btn cl-prev">${Icons.ui('chevron-left', 16)}</button><button class="icon-btn cl-next">${Icons.ui('chevron-right', 16)}</button></div>
        <div class="cl-grid">${WEEKDAYS_SHORT.map(d => `<div class="cl-wd">${d}</div>`).join('')}</div>
      </div>
      <div class="cl-side"><div class="cl-side-head"></div><div class="cl-events"></div><button class="btn primary cl-add">${Icons.ui('plus', 14)} Новое событие</button></div>`;
    const grid = $('.cl-grid', b);
    const start = new Date(month); start.setDate(1 - (month.getDay() + 6) % 7);
    const today = dateKey(new Date());
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const k = dateKey(d);
      const dayEv = evs.filter(e => e.date === k);
      const c = h(`<div class="cl-cell ${d.getMonth() !== month.getMonth() ? 'other' : ''} ${k === today ? 'today' : ''} ${k === sel ? 'sel' : ''}"><span class="cl-n">${d.getDate()}</span>${dayEv.slice(0, 3).map(e => `<div class="cl-chip" style="background:${e.color}">${esc(e.time ? e.time + ' ' : '')}${esc(e.title)}</div>`).join('')}${dayEv.length > 3 ? `<div class="muted small">ещё ${dayEv.length - 3}</div>` : ''}</div>`);
      c.onclick = () => { sel = k; if (d.getMonth() !== month.getMonth()) { month = new Date(d); month.setDate(1); } render(); };
      c.ondblclick = () => { sel = k; addEvent(); };
      grid.append(c);
    }
    const sd = new Date(sel + 'T00:00:00');
    $('.cl-side-head', b).innerHTML = `<div class="cl-big">${sd.getDate()}</div><div><b>${cap(sd.toLocaleDateString('ru-RU', { weekday: 'long' }))}</b><div class="muted">${MONTHS_GEN[sd.getMonth()]} ${sd.getFullYear()}</div></div>`;
    const list = evs.filter(e => e.date === sel).sort((a, c) => (a.time || '').localeCompare(c.time || ''));
    const box = $('.cl-events', b);
    box.innerHTML = list.length ? '' : '<div class="muted" style="padding:10px 0">Нет событий. Дважды щёлкните по дню, чтобы добавить.</div>';
    list.forEach(e => {
      const r = h(`<div class="cl-ev"><i style="background:${e.color}"></i><div><b>${esc(e.title)}</b><div class="muted small">${e.time || 'Весь день'}${e.remind ? ' · напомнить за ' + e.remind + ' мин' : ''}</div></div><button class="icon-btn sm">${Icons.ui('trash', 14)}</button></div>`);
      $('button', r).onclick = () => save(events().filter(x => x.id !== e.id));
      box.append(r);
    });
    $('.cl-prev', b).onclick = () => { month.setMonth(month.getMonth() - 1); render(); };
    $('.cl-next', b).onclick = () => { month.setMonth(month.getMonth() + 1); render(); };
    $('.cl-today', b).onclick = () => { sel = today; month = new Date(); month.setDate(1); render(); };
    $('.cl-add', b).onclick = addEvent;
  }

  async function addEvent() {
    const content = h(`<div style="display:flex;flex-direction:column;gap:10px">
      <input class="input e-t" placeholder="Название события">
      <div class="row-gap"><input class="input e-d" type="date" value="${sel}"><input class="input e-h" type="time"><select class="input e-r"><option value="0">Без напоминания</option><option value="5">За 5 мин</option><option value="15">За 15 мин</option><option value="60">За час</option></select></div>
      <div class="row-gap">${COLORS.map((c, i) => `<label><input type="radio" name="ec" value="${c}" ${i ? '' : 'checked'} style="accent-color:${c}"><span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:${c};vertical-align:middle"></span></label>`).join('')}</div>
    </div>`);
    const r = await UI.dialog({ title: 'Новое событие', content, sound: false, buttons: [{ label: 'Сохранить', value: true, primary: true }, { label: 'Отмена', value: false, cancel: true }], validate: () => $('.e-t', content).value.trim() ? '' : 'Введите название события.' });
    if (!r.button) return;
    const ev = { id: uid('ev'), title: $('.e-t', content).value.trim(), date: $('.e-d', content).value || sel, time: $('.e-h', content).value, remind: +$('.e-r', content).value, color: $('input[name=ec]:checked', content).value };
    sel = ev.date;
    save([...events(), ev]);
  }

  win.onArgs = a => { if (a.date) { sel = a.date; month = new Date(sel + 'T00:00:00'); month.setDate(1); } render(); if (a.add) addEvent(); };
  render();
  if (args.add) setTimeout(addEvent, 200);
  return win;
}
