/* Быстрые настройки, центр уведомлений с календарём, панель виджетов */
'use strict';

// ======================= Быстрые настройки =======================
const QuickSettings = (() => {
  const el = () => document.getElementById('quick-settings');
  const TILES = [
    { key: 'wifi', label: () => { if (FX.available) { const n = FX.tryCall('network'); return n ? (n.wifi ? (n.ssid || 'Wi-Fi') : n.cellular ? 'Мобильная сеть' : n.online ? 'Интернет' : 'Нет сети') : 'Wi-Fi'; } return Store.get('wifi') ? (navigator.onLine ? 'Wi-Fi' : 'Нет сети') : 'Wi-Fi'; }, icon: () => Store.get('wifi') ? 'wifi' : 'wifi-off', disabled: () => Store.get('airplane'),
      ...(FX.available ? { get: () => navigator.onLine, set: () => { Shell.close('quick'); FX.call('openSettings', 'internet'); } } : {}) },
    { key: 'bluetooth', label: () => 'Bluetooth', icon: () => 'bluetooth', ...(FX.available ? { get: () => true, set: () => { Shell.close('quick'); FX.call('openSettings', 'bluetooth'); } } : {}) },
    { key: 'airplane', label: () => 'В самолёте', icon: () => 'airplane' },
    { key: 'batterySaver', label: () => 'Экономия заряда', icon: () => 'leaf' },
    { key: 'nightLight', label: () => 'Ночной свет', icon: () => 'moon' },
    { key: 'theme', label: () => 'Тёмная тема', icon: () => 'brightness', get: () => document.documentElement.dataset.theme === 'dark', set: v => Store.set('theme', v ? 'dark' : 'light') },
    { key: 'dnd', label: () => 'Не беспокоить', icon: () => 'bell-off' },
    { key: 'animations', label: () => 'Анимация', icon: () => 'sparkle' },
    { key: 'access', label: () => 'Спец. возможности', icon: () => 'accessibility', get: () => false, set: () => { Shell.close('quick'); Apps.launch('settings', { page: 'accessibility' }); } },
  ];

  function render() {
    const b = Battery.state;
    el().innerHTML = `
      <div class="qs-grid"></div>
      <div class="qs-sliders">
        <div class="qs-slider"><span class="icon-btn" title="Яркость">${Icons.ui('brightness', 18)}</span><input type="range" class="slider qs-bright" min="20" max="100" value="${Store.get('brightness')}"><span class="val qs-bright-v">${Store.get('brightness')}</span></div>
        <div class="qs-slider"><button class="icon-btn qs-mute" title="Выключить звук">${Icons.ui(Store.get('muted') ? 'volume-mute' : 'volume', 18)}</button><input type="range" class="slider qs-vol" min="0" max="100" value="${Store.get('volume')}"><span class="val qs-vol-v">${Store.get('volume')}</span></div>
      </div>
      <div class="qs-foot">
        <div class="qs-batt" title="${b.supported ? 'Данные батареи вашего устройства' : 'Питание от сети'}">${Icons.battery(b.level, b.charging, 20)}<span>${Math.round(b.level * 100)}%${b.charging ? ' · заряжается' : ''}</span></div>
        <div class="row-gap"><button class="icon-btn qs-lock" title="Заблокировать">${Icons.ui('lock', 16)}</button><button class="icon-btn qs-edit" title="Все параметры">${Icons.ui('gear', 16)}</button></div>
      </div>`;
    const grid = $('.qs-grid', el());
    TILES.forEach(t => {
      const on = t.get ? t.get() : !!Store.get(t.key);
      const dis = t.disabled?.();
      const tile = h(`<div class="qs-tile"><button class="qs-btn ${on ? 'on' : ''}" ${dis ? 'disabled style="opacity:.4"' : ''}>${Icons.ui(t.icon(), 18)}</button><span>${esc(t.label())}</span></div>`);
      $('button', tile).onclick = () => {
        const v = !(t.get ? t.get() : Store.get(t.key));
        t.set ? t.set(v) : Store.set(t.key, v);
        render();
      };
      grid.append(tile);
    });
    const br = $('.qs-bright', el()), vol = $('.qs-vol', el());
    br.oninput = () => { Store.set('brightness', +br.value); $('.qs-bright-v', el()).textContent = br.value; };
    vol.oninput = () => { Store.set('volume', +vol.value); if (Store.get('muted')) Store.set('muted', false); $('.qs-vol-v', el()).textContent = vol.value; };
    vol.onchange = () => Sound.play('volume');
    $('.qs-mute', el()).onclick = () => { Store.set('muted', !Store.get('muted')); render(); };
    $('.qs-edit', el()).onclick = () => { Shell.close('quick'); Apps.launch('settings'); };
    $('.qs-lock', el()).onclick = () => { Shell.close('quick'); Power.lock(); };
    $('.qs-batt', el()).onclick = () => { Shell.close('quick'); Apps.launch('settings', { page: 'power' }); };
    $$('.slider', el()).forEach(fillSlider);
  }

  function init() {
    Shell.register('quick', { el: el(), onOpen: render });
    ['wifi', 'airplane', 'bluetooth', 'nightLight', 'dnd', 'theme', 'batterySaver', 'animations'].forEach(k => Store.on(k, () => Shell.isOpen('quick') && render()));
  }
  return { init };
})();

// ======================= Центр уведомлений =======================
const NotifCenter = (() => {
  const el = () => document.getElementById('notif-center');
  let month = new Date(); month.setDate(1);
  let selDate = dateKey(new Date());

  function events() { return Persist.get('calendar.events', []); }

  function render() {
    const list = UI.Notifications.list();
    el().innerHTML = `
      <div class="nc-card nc-notifs glass">
        <div class="nc-head"><span>Уведомления</span>
          <div class="row-gap">
            <button class="btn sm nc-dnd" title="Не беспокоить">${Icons.ui(Store.get('dnd') ? 'bell-off' : 'bell', 14)}${Store.get('dnd') ? 'Не беспокоить' : ''}</button>
            ${list.length ? '<button class="btn sm nc-clear">Очистить все</button>' : ''}
          </div>
        </div>
        <div class="nc-list">${list.length ? '' : '<div class="nc-empty">Новых уведомлений нет</div>'}</div>
      </div>
      <div class="nc-card glass">
        <div class="nc-cal-head"><b>${esc(cap(fmtDateLong(Date.now())))}</b></div>
        <div class="nc-cal">
          <div class="nc-cal-head" style="padding:4px 0 6px 4px"><span class="nc-month">${cap(MONTHS[month.getMonth()])} ${month.getFullYear()}</span><span class="row-gap"><button class="icon-btn sm nc-prev">${Icons.ui('chevron-up', 14)}</button><button class="icon-btn sm nc-next">${Icons.ui('chevron-down', 14)}</button></span></div>
          <div class="cal-grid"></div>
        </div>
        <div class="nc-agenda"></div>
      </div>`;
    const box = $('.nc-list', el());
    list.forEach(n => {
      const it = h(`<div class="nc-item"><div class="top">${Icons.has(n.icon) ? Icons.get(n.icon, 16) : `<span class="nicon-glyph" style="width:16px;height:16px">${Icons.ui(n.icon, 11)}</span>`}<span>${esc(n.app)}</span><span>· ${esc(timeAgo(n.ts))}</span><button class="icon-btn sm x" title="Закрыть">${Icons.ui('close', 12)}</button></div><b>${esc(n.title)}</b>${n.body ? `<p>${esc(n.body)}</p>` : ''}</div>`);
      it.onclick = () => { UI.Notifications.activate(n.id); };
      $('.x', it).onclick = e => { e.stopPropagation(); it.style.transform = 'translateX(110%)'; setTimeout(() => UI.Notifications.dismiss(n.id), 180); };
      box.append(it);
    });
    $('.nc-clear', el())?.addEventListener('click', () => UI.Notifications.clear());
    $('.nc-dnd', el()).onclick = () => Store.set('dnd', !Store.get('dnd'));
    $('.nc-prev', el()).onclick = () => { month.setMonth(month.getMonth() - 1); renderCal(); };
    $('.nc-next', el()).onclick = () => { month.setMonth(month.getMonth() + 1); renderCal(); };
    renderCal();
  }

  function renderCal() {
    $('.nc-month', el()).textContent = cap(MONTHS[month.getMonth()]) + ' ' + month.getFullYear();
    const grid = $('.cal-grid', el());
    const evs = events();
    const evDays = new Set(evs.map(e => e.date));
    grid.innerHTML = WEEKDAYS_SHORT.map(d => `<div class="wd">${d}</div>`).join('');
    const first = new Date(month);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first); start.setDate(1 - offset);
    const today = dateKey(new Date());
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const k = dateKey(d);
      const c = h(`<div class="cal-day ${d.getMonth() !== month.getMonth() ? 'other' : ''} ${k === today ? 'today' : ''} ${k === selDate ? 'sel' : ''} ${evDays.has(k) ? 'has-ev' : ''}">${d.getDate()}</div>`);
      c.onclick = () => { selDate = k; renderCal(); };
      c.ondblclick = () => { Shell.close('notif'); Apps.launch('calendar', { date: k }); };
      grid.append(c);
    }
    const ag = $('.nc-agenda', el());
    const dayEv = evs.filter(e => e.date === selDate).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const d = new Date(selDate + 'T00:00:00');
    ag.innerHTML = `<div class="row-gap" style="justify-content:space-between;margin-bottom:6px"><b>${selDate === today ? 'Сегодня' : d.getDate() + ' ' + MONTHS_GEN[d.getMonth()]}</b><button class="btn sm nc-add">${Icons.ui('plus', 12)} Событие</button></div>` +
      (dayEv.length ? dayEv.map(e => `<div class="ev"><i style="background:${esc(e.color || 'var(--accent)')}"></i><div><div>${esc(e.title)}</div><div class="muted small">${e.time ? esc(e.time) : 'Весь день'}</div></div></div>`).join('') : '<div class="muted small">Нет событий</div>');
    $('.nc-add', ag).onclick = () => { Shell.close('notif'); Apps.launch('calendar', { date: selDate, add: true }); };
  }

  function init() {
    Shell.register('notif', { el: el(), onOpen() { month = new Date(); month.setDate(1); selDate = dateKey(new Date()); render(); } });
    UI.Notifications.on('change', () => Shell.isOpen('notif') && render());
    Store.on('dnd', () => Shell.isOpen('notif') && render());
  }
  return { init };
})();

// ======================= Виджеты =======================
const Widgets = (() => {
  const el = () => document.getElementById('widgets-panel');
  let timer;

  const TIPS = [
    'Перетащите окно к верхнему краю экрана, чтобы развернуть его, или к боковому — чтобы занять половину.',
    'Наведите курсор на кнопку «Развернуть», чтобы выбрать макет прикрепления окна.',
    'Нажмите Ctrl+Alt+S, чтобы открыть меню «Пуск», и начните печатать для поиска.',
    'В поиске меню «Пуск» можно считать: попробуйте ввести 2^10 + 24.',
    'Перетащите файлы с вашего компьютера на рабочий стол, чтобы импортировать их.',
    'Ассистент умеет менять тему, обои, ставить таймеры и отвечать на вопросы.',
    'Используйте несколько рабочих столов в «Представлении задач» для разных задач.',
    'В Терминале введите help, чтобы увидеть список команд.',
    'Изображение из «Фотографий» можно сделать фоном рабочего стола одним щелчком.',
  ];

  function greeting() {
    const hr = new Date().getHours();
    return hr < 5 ? 'Доброй ночи' : hr < 12 ? 'Доброе утро' : hr < 18 ? 'Добрый день' : 'Добрый вечер';
  }

  function render() {
    const todo = Persist.get('widgets.todo', [{ t: 'Изучить WindowsFX', d: false }, { t: 'Настроить обои', d: false }]);
    const pics = (() => { try { return FS.list(FS.P.pictures).filter(f => FS.typeOf(f.path, f.node).kind === 'image'); } catch { return []; } })();
    const pic = pics.length ? pics[Math.floor(Math.random() * pics.length)] : null;
    const drives = FS.drives();
    const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
    const todayEv = Persist.get('calendar.events', []).filter(e => e.date === dateKey(new Date())).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    el().innerHTML = `
      <div class="wg-top">
        <div><div class="wg-time"></div><div class="wg-date"></div></div>
        <div style="text-align:right"><div style="font-weight:600;font-size:1.1rem">${greeting()}, ${esc(Store.get('userName'))}!</div><div class="muted small">${WM.list().length ? 'Открыто окон: ' + WM.list().length : 'Хорошего дня'}</div></div>
      </div>
      <div class="wg-grid">
        <div class="wg wg-weather span2"><div class="wg-title">${Icons.ui('location', 14)}<span class="wx-city">${esc(Store.get('weatherCity'))}</span><button class="icon-btn wx-open" title="Открыть «Погоду»">${Icons.ui('external', 14)}</button></div><div class="wx-body"><div class="row-gap"><div class="ring-loader"></div><span class="muted">Загрузка погоды…</span></div></div></div>
        <div class="wg"><div class="wg-title">${Icons.ui('calendar', 14)}Сегодня<button class="icon-btn wg-cal" title="Календарь">${Icons.ui('plus', 14)}</button></div>
          ${todayEv.length ? todayEv.slice(0, 4).map(e => `<div class="row-gap"><i style="width:4px;height:24px;border-radius:2px;background:${esc(e.color || 'var(--accent)')}"></i><div><div>${esc(e.title)}</div><div class="muted small">${e.time || 'Весь день'}</div></div></div>`).join('') : '<div class="muted">На сегодня событий нет.</div>'}
        </div>
        <div class="wg wg-rem"><div class="wg-title"><span>${Icons.ui('list', 14)} Напоминания</span><button class="icon-btn wg-pin-rem" title="Закрепить на рабочем столе">${Icons.ui('pin', 14)}</button></div><div class="wg-rem-body" style="flex:1;min-height:0"></div></div>
        <div class="wg wg-things"><div class="wg-title"><span>${Icons.ui('check', 14)} Дела</span><button class="icon-btn wg-pin-tg" title="Закрепить на рабочем столе">${Icons.ui('pin', 14)}</button></div><div class="wg-tg-body" style="flex:1;min-height:0"></div></div>
        <div class="wg wg-todo"><div class="wg-title">${Icons.ui('check', 14)}Задачи</div><div class="todo-list"></div><input class="input todo-in" placeholder="Добавить задачу и нажать Enter"></div>
        <div class="wg wg-note"><div class="wg-title">${Icons.ui('edit', 14)}Заметка</div><textarea placeholder="Напишите что-нибудь…">${esc(Persist.get('widgets.note', ''))}</textarea></div>
        <div class="wg"><div class="wg-title">${Icons.ui('cpu', 14)}Система</div>
          ${drives.map(d => `<div class="wg-stat"><span style="width:62px">Диск ${d.letter}</span><div class="wg-bar"><i style="width:${(d.used / d.total * 100).toFixed(1)}%"></i></div><span class="muted small">${fmtBytes(d.free)} своб.</span></div>`).join('')}
          <div class="wg-stat"><span style="width:62px">Окна</span><span class="muted small">${WM.list().length} открыто · ${WM.desktops.list().length} ${plural(WM.desktops.list().length, 'рабочий стол', 'рабочих стола', 'рабочих столов')}</span></div>
          <div class="wg-stat"><span style="width:62px">Работает</span><span class="muted small wg-uptime"></span></div>
        </div>
        ${pic ? `<div class="wg wg-photo" style="padding:0;min-height:180px;cursor:pointer;background:url('${esc(pic.node.c)}') center/cover"><div style="margin-top:auto;padding:12px;background:linear-gradient(transparent,rgba(0,0,0,.6));color:#fff;font-size:.86rem">${Icons.ui('image', 14)} ${esc(pic.name)}</div></div>` : ''}
        <div class="wg wg-tip ${pic ? '' : 'span2'}"><div class="wg-title">${Icons.ui('sparkle', 14)}Совет дня</div><div>${esc(tip)}</div></div>
      </div>`;
    // Задачи
    const tl = $('.todo-list', el());
    const saveTodo = () => Persist.set('widgets.todo', todo);
    const drawTodo = () => {
      tl.innerHTML = '';
      todo.forEach((t, i) => {
        const row = h(`<label class="${t.d ? 'done' : ''}"><input type="checkbox" class="check" ${t.d ? 'checked' : ''}><span>${esc(t.t)}</span><button class="icon-btn del" title="Удалить">${Icons.ui('close', 12)}</button></label>`);
        $('input', row).onchange = e => { t.d = e.target.checked; saveTodo(); drawTodo(); };
        $('.del', row).onclick = e => { e.preventDefault(); todo.splice(i, 1); saveTodo(); drawTodo(); };
        tl.append(row);
      });
      if (!todo.length) tl.innerHTML = '<div class="muted small">Список задач пуст.</div>';
    };
    drawTodo();
    $('.todo-in', el()).onkeydown = e => {
      if (e.key === 'Enter' && e.target.value.trim()) { todo.push({ t: e.target.value.trim(), d: false }); e.target.value = ''; saveTodo(); drawTodo(); }
    };
    try { Reminders.widget($('.wg-rem-body', el()), { list: 'today', max: 5 }); } catch (e) { console.error(e); }
    try { Things.widget($('.wg-tg-body', el()), { list: 'today', max: 5 }); } catch (e) { console.error(e); }
    $('.wg-pin-rem', el()).onclick = () => { Shell.close('widgets'); DeskWidgets.add('reminders', { list: 'today' }); };
    $('.wg-pin-tg', el()).onclick = () => { Shell.close('widgets'); DeskWidgets.add('things', { list: 'today' }); };
    $('.wg-note textarea', el()).oninput = debounce(e => Persist.set('widgets.note', e.target.value), 300);
    $('.wx-open', el()).onclick = () => { Shell.close('widgets'); Apps.launch('weather'); };
    $('.wg-cal', el()).onclick = () => { Shell.close('widgets'); Apps.launch('calendar', { add: true, date: dateKey(new Date()) }); };
    $('.wg-photo', el())?.addEventListener('click', () => { Shell.close('widgets'); FileOps.open(pic.path); });
    tick();
    loadWeather();
  }

  function weatherHTML(d) {
    const c = d.current;
    return `<div class="now">${Weather.icon(c.code, c.isDay, 64)}<span class="tt">${Weather.temp(c.temp)}</span><div><div style="font-weight:600">${esc(Weather.desc(c.code))}</div><div class="muted small">Ощущается как ${Weather.temp(c.feels)} · Ветер ${Math.round(c.wind)} м/с · Влажность ${c.humidity}%</div></div></div>
      <div class="wg-hours">${d.hourly.filter((_, i) => i % 3 === 0).slice(0, 8).map(x => `<div><span class="muted">${x.t.slice(11, 16)}</span>${Weather.icon(x.code, x.isDay, 28)}<b>${Weather.temp(x.temp)}</b></div>`).join('')}</div>`;
  }

  async function loadWeather() {
    const box = $('.wx-body', el());
    if (!box) return;
    const cached = Weather.cached();
    if (cached?.current) box.innerHTML = weatherHTML(cached);
    try {
      const d = await Weather.load();
      if ($('.wx-body', el())) { $('.wx-body', el()).innerHTML = weatherHTML(d); $('.wx-city', el()).textContent = d.place.name + (d.place.country ? ', ' + d.place.country : ''); }
    } catch (e) {
      if (!cached?.current && $('.wx-body', el())) $('.wx-body', el()).innerHTML = `<div class="muted">${Icons.ui('wifi-off', 18)} ${esc(e.message)}</div><button class="btn sm wx-retry" style="align-self:flex-start">Повторить</button>`;
      $('.wx-retry', el())?.addEventListener('click', loadWeather);
    }
  }

  function tick() {
    const t = $('.wg-time', el());
    if (!t) return;
    t.textContent = fmtTime(Date.now());
    $('.wg-date', el()).textContent = cap(fmtDateLong(Date.now()));
    const up = Math.floor((Date.now() - (window.__bootTime || Date.now())) / 1000);
    const u = $('.wg-uptime', el());
    if (u) u.textContent = `${Math.floor(up / 3600)} ч ${Math.floor(up / 60) % 60} мин ${up % 60} с`;
  }

  function init() {
    Shell.register('widgets', {
      el: el(),
      onOpen() { render(); clearInterval(timer); timer = setInterval(tick, 1000); },
      onClose() { clearInterval(timer); },
    });
  }
  return { init };
})();
