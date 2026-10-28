/* Параметры */
'use strict';

const SETTINGS_INDEX = [
  { label: 'Яркость', page: 'display', kw: 'экран яркость монитор' }, { label: 'Ночной свет', page: 'display', kw: 'синий свет ночь' },
  { label: 'Масштаб текста', page: 'accessibility', kw: 'размер шрифта текст' }, { label: 'Звук и громкость', page: 'sound', kw: 'громкость звук динамики' },
  { label: 'Уведомления', page: 'notifications', kw: 'не беспокоить уведомления' }, { label: 'Питание и батарея', page: 'power', kw: 'батарея экономия заряд сон' },
  { label: 'Хранилище', page: 'storage', kw: 'диск память место' }, { label: 'О системе', page: 'about', kw: 'сведения процессор версия имя компьютера' },
  { label: 'Bluetooth', page: 'bluetooth', kw: 'устройства наушники мышь' }, { label: 'Wi-Fi', page: 'network', kw: 'сеть интернет wifi' },
  { label: 'Режим «В самолёте»', page: 'network', kw: 'самолет' }, { label: 'Фон рабочего стола', page: 'personalization', kw: 'обои фон картинка' },
  { label: 'Цвет акцента', page: 'colors', kw: 'цвет акцент тема' }, { label: 'Тёмная тема', page: 'colors', kw: 'тёмный светлый режим тема' },
  { label: 'Эффекты прозрачности', page: 'colors', kw: 'прозрачность стекло' }, { label: 'Темы', page: 'themes', kw: 'темы оформления' },
  { label: 'Панель задач', page: 'taskbar', kw: 'выравнивание панель задач виджеты' }, { label: 'Пуск', page: 'taskbar', kw: 'меню пуск рекомендуем' },
  { label: 'Установленные приложения', page: 'apps', kw: 'программы приложения' }, { label: 'Приложения по умолчанию', page: 'apps', kw: 'открывать по умолчанию' },
  { label: 'Автозагрузка', page: 'apps', kw: 'запуск автозапуск' }, { label: 'Учётная запись', page: 'accounts', kw: 'имя пользователь аватар' },
  { label: 'Пароль для входа', page: 'accounts', kw: 'пароль вход блокировка' }, { label: 'Дата и время', page: 'time', kw: 'время часы формат' },
  { label: 'Погода: город', page: 'time', kw: 'погода город' }, { label: 'Специальные возможности', page: 'accessibility', kw: 'анимация контраст' },
  { label: 'Сочетания клавиш', page: 'accessibility', kw: 'горячие клавиши клавиатура' }, { label: 'Конфиденциальность', page: 'privacy', kw: 'очистить история сброс' },
  { label: 'Резервная копия', page: 'privacy', kw: 'экспорт импорт копия' }, { label: 'Сброс системы', page: 'privacy', kw: 'сбросить вернуть исходное' },
  { label: 'Обновления', page: 'update', kw: 'обновления версия' },
  { label: 'WindowsFX и Android', page: 'fx', kw: 'android андроид окна память файлы масштаб приложения' },
];

// Автоблокировка при бездействии
(() => {
  let last = Date.now();
  ['pointermove', 'pointerdown', 'keydown', 'wheel'].forEach(e => addEventListener(e, () => (last = Date.now()), { passive: true, capture: true }));
  setInterval(() => {
    const m = Store.get('lockTimeout') || 0;
    if (m && typeof Power !== 'undefined' && !Power.isLocked() && Date.now() - last > m * 60e3) Power.lock();
  }, 5000);
})();

Apps.register({
  id: 'settings', name: 'Параметры', icon: 'settings', desc: 'Настройки системы', single: true,
  keywords: 'настройки параметры settings конфигурация',
  launch: args => openSettings(args),
});

function openSettings(args = {}) {
  const NAV = [
    ['home', 'Главная', 'home', '#4f8cff'],
    FX.mac ? ['fx', 'Mac и диски', 'display', '#1f7a72'] : FX.web ? ['fx', 'Учётная запись и диски', 'user', '#1f7a72'] : ['fx', 'WindowsFX и Android', 'phone', '#7c6cff'],
    ['system', 'Система', 'display', '#4f8cff'],
    ['bluetooth', 'Bluetooth и устройства', 'bluetooth', '#2f9bff'],
    ['network', 'Сеть и Интернет', 'wifi', '#7a8cff'],
    ['personalization', 'Персонализация', 'palette', '#ff8a3d'],
    ['apps', 'Приложения', 'apps', '#8a6cff'],
    ['accounts', 'Учётные записи', 'user', '#22b573'],
    ['time', 'Время и язык', 'globe', '#16a7d6'],
    ['accessibility', 'Специальные возможности', 'accessibility', '#3b9cff'],
    ['privacy', 'Конфиденциальность и защита', 'shield', '#7b8296'],
    ['update', 'Обновления', 'update', '#2f6bff'],
  ];
  const SUB = { 'fx-windows': 'fx', 'fx-storage': 'fx', display: 'system', sound: 'system', notifications: 'system', power: 'system', storage: 'system', about: 'system', colors: 'personalization', themes: 'personalization', taskbar: 'personalization', lockscreen: 'personalization' };

  let page = 'home';
  const win = WM.open({ app: 'settings', title: 'Параметры', width: 1040, height: 700, minWidth: 560, minHeight: 360 });
  const b = win.body;
  b.classList.add('st');
  b.innerHTML = `
    <div class="st-nav">
      <div class="st-me"></div>
      <label class="st-search input">${Icons.ui('search', 14)}<input placeholder="Найти параметр" spellcheck="false"></label>
      <div class="st-search-res hidden"></div>
      <div class="st-navlist"></div>
    </div>
    <div class="st-main"><div class="st-page"></div></div>`;
  const main = $('.st-main', b), pg = $('.st-page', b);

  // ---------- Вспомогательные элементы ----------
  const sec = (title) => h(`<div class="st-sec"><div class="st-sec-title">${esc(title)}</div></div>`);
  function row(icon, title, desc, ctrl, opts = {}) {
    const r = h(`<div class="st-row ${opts.click ? 'click' : ''}" ${opts.id ? `id="st-${opts.id}"` : ''}>
      ${icon ? `<span class="st-ic">${Icons.ui(icon, 20)}</span>` : ''}
      <div class="st-t"><div>${title}</div>${desc ? `<span>${desc}</span>` : ''}</div>
      <div class="st-c"></div>${opts.click ? `<span class="st-chev">${Icons.ui('chevron-right', 14)}</span>` : ''}
    </div>`);
    if (ctrl) $('.st-c', r).append(...(Array.isArray(ctrl) ? ctrl : [ctrl]));
    if (opts.click) r.onclick = e => { if (!e.target.closest('.st-c > *')) opts.click(); };
    return r;
  }
  function tgl(key, onChange) {
    const el = h(toggleHTML('', !!Store.get(key)));
    $('input', el).onchange = e => { Store.set(key, e.target.checked); onChange?.(e.target.checked); };
    return el;
  }
  function selectEl(value, options, onChange) {
    const s = h(`<select class="input">${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`);
    s.onchange = () => onChange(s.value);
    return s;
  }
  const sel = (key, options, num = false) => selectEl(Store.get(key), options, v => Store.set(key, num ? +v : v));
  function rng(key, min, max, step = 1, suffix = '') {
    const wrap = h(`<div class="row-gap" style="width:240px"><input type="range" class="slider" min="${min}" max="${max}" step="${step}" value="${Store.get(key)}"><span class="muted small" style="width:44px;text-align:right">${Store.get(key)}${suffix}</span></div>`);
    const i = $('input', wrap);
    i.oninput = () => { Store.set(key, +i.value); $('span', wrap).textContent = i.value + suffix; };
    return wrap;
  }
  const btn = (label, fn, cls = '') => { const x = h(`<button class="btn ${cls}">${label}</button>`); x.onclick = fn; return x; };
  const header = (title, crumbParent) => h(`<h1 class="st-h1">${crumbParent ? `<span class="st-crumb">${esc(crumbParent)}</span>${Icons.ui('chevron-right', 16)}` : ''}${esc(title)}</h1>`);

  function renderMe() {
    const me = $('.st-me', b);
    me.innerHTML = `${StartMenu.avatarHTML(64)}<div><b>${esc(Store.get('userName'))}</b><span>${FX.web ? 'Учётная запись ' + esc(FXWeb.site) : 'Локальная учётная запись'}</span></div>`;
    me.onclick = () => go('accounts');
  }

  function renderNav() {
    const nl = $('.st-navlist', b);
    nl.innerHTML = '';
    const cur = SUB[page] || page;
    NAV.forEach(([id, label, icon, color]) => {
      const it = h(`<div class="st-navitem ${cur === id ? 'on' : ''}"><span style="color:${color}">${Icons.ui(icon, 18)}</span><span>${esc(label)}</span></div>`);
      it.onclick = () => go(id);
      nl.append(it);
    });
  }

  // Поиск параметров
  const sIn = $('.st-search input', b), sRes = $('.st-search-res', b);
  sIn.addEventListener('input', () => {
    const q = sIn.value.trim().toLowerCase();
    if (!q) { sRes.classList.add('hidden'); return; }
    const res = SETTINGS_INDEX.filter(s => s.label.toLowerCase().includes(q) || s.kw.includes(q));
    sRes.classList.remove('hidden');
    sRes.innerHTML = res.length ? '' : '<div class="muted small" style="padding:8px">Ничего не найдено</div>';
    res.slice(0, 8).forEach(s => {
      const r = h(`<div class="st-navitem">${Icons.ui('search', 14)}<span>${esc(s.label)}</span></div>`);
      r.onclick = () => { sIn.value = ''; sRes.classList.add('hidden'); go(s.page); };
      sRes.append(r);
    });
  });
  sIn.addEventListener('keydown', e => { if (e.key === 'Enter') $('.st-navitem', sRes)?.click(); if (e.key === 'Escape') { sIn.value = ''; sRes.classList.add('hidden'); } });

  function go(p) {
    page = p;
    renderNav();
    pg.innerHTML = '';
    pg.classList.remove('st-anim'); void pg.offsetWidth; pg.classList.add('st-anim');
    (PAGES[p] || PAGES.home)();
    main.scrollTop = 0;
  }

  // ======================= Страницы =======================
  const PAGES = {
    fx() {
      if (FX.web) return PAGES.web();
      pg.append(header('WindowsFX и Android'));
      const info = FX.info();
      const ff = FX.tryCall('freeform') || {};
      const access = !!FX.tryCall('hasAccess');

      const s1 = sec('Приложения Android');
      s1.append(
        row('apps', 'Открывать приложения Android в окнах', 'Приложения запускаются в плавающих окнах, если на устройстве включён оконный режим', tgl('androidWindows')),
        row(ff.supported ? 'check' : 'alert', 'Оконный режим устройства', ff.supported ? 'Включён: приложения могут открываться в окнах' : 'Выключен: приложения Android открываются на весь экран',
          btn('Как включить', freeformHelp), { id: 'fx-windows' }),
        row('refresh', 'Обновить список приложений', 'Если новое приложение не появилось в «Пуске»', btn('Обновить', () => { AndroidApps.load(); UI.notify({ title: 'Список приложений обновлён', icon: 'apps', transient: true, silent: true }); })),
      );
      const s2 = sec('Память устройства');
      s2.append(
        row(access ? 'check' : 'alert', 'Доступ ко всем файлам', access ? 'Разрешён: диск D: — это память устройства' : 'Не разрешён: Проводник не видит файлы устройства',
          access ? null : btn('Разрешить', () => FX.call('requestAccess'), 'primary'), { id: 'fx-storage' }),
        ...FS.drives().filter(d => d.device).map(d => row('hdd', `${d.label} (${d.letter})`, `Свободно ${fmtBytes(d.free)} из ${fmtBytes(d.total)}`, btn('Открыть', () => Apps.launch('explorer', { path: d.letter })))),
      );
      const s3 = sec('Экран');
      const scaleWrap = h(`<div class="row-gap" style="width:280px"><input type="range" class="slider" min="60" max="160" step="5" value="${Store.get('uiScale') || 100}"><span class="muted small" style="width:48px;text-align:right">${Store.get('uiScale') || 100}%</span><button class="btn sm">OK</button></div>`);
      const sIn = $('input', scaleWrap);
      sIn.oninput = () => { $('span', scaleWrap).textContent = sIn.value + '%'; };
      $('button', scaleWrap).onclick = () => Store.set('uiScale', +sIn.value);
      s3.append(
        row('zoom-in', 'Масштаб интерфейса', 'Размер окон, значков и текста WindowsFX', scaleWrap),
        row('maximize', 'Во весь экран', 'Скрывать строку состояния и кнопки Android (появляются при свайпе от края)', tgl('immersive')),
      );
      const s4 = sec('Система Android');
      s4.append(
        row('home', 'Рабочий стол по умолчанию', 'Сделайте WindowsFX главным экраном — кнопка «Домой» будет открывать его', btn('Выбрать', () => FX.call('openSettings', 'home'))),
        row('wifi', 'Wi-Fi и сеть', null, null, { click: () => FX.call('openSettings', 'wifi') }),
        row('bluetooth', 'Bluetooth', null, null, { click: () => FX.call('openSettings', 'bluetooth') }),
        row('display', 'Экран Android', null, null, { click: () => FX.call('openSettings', 'display') }),
        row('volume', 'Звук', null, null, { click: () => FX.call('openSettings', 'sound') }),
        row('battery_full', 'Батарея', null, null, { click: () => FX.call('openSettings', 'battery') }),
        row('apps', 'Приложения Android', null, null, { click: () => FX.call('openSettings', 'apps') }),
        row('settings', 'Все настройки Android', null, null, { click: () => FX.call('openSettings', 'all') }),
      );
      const s5 = sec('О WindowsFX');
      s5.append(
        row('info', 'Версия', `WindowsFX ${esc(info.version || '—')} · ${esc(info.model || '')} · Android ${esc(info.android || '')}`, null),
        row('star', 'Компоненты с открытым кодом', 'Lexicon, Tabs, Photostore — движки WordCraft, GridCraft, PhotoCraft (MIT/Apache-2.0); русский словарь — А. Лебедев (BSD); архиватор — 7-Zip (LGPL-2.1, unRAR); видеоплеер — libVLC (LGPL-2.1); просмотр PDF — pdf.js (Apache-2.0); DOOM — js-dos (GPL-2.0); перетаскивание — mobile-drag-drop (MIT)', null),
      );
      pg.append(s1, s2, s3, s4, s5);
      if (args.page === 'fx-windows' && !ff.supported) setTimeout(freeformHelp, 300);

      function freeformHelp() {
        UI.dialog({
          title: 'Как включить оконный режим', icon: 'info',
          message: 'Android открывает приложения в окнах, только когда включён системный оконный режим (freeform).\n\n' +
            '1. Настройки → О планшете → 7 раз нажмите «Номер сборки».\n2. Откройте «Для разработчиков».\n3. Включите «Разрешить окна произвольной формы» и «Принудительно разрешить изменение размера».\n4. Перезагрузите устройство.\n\n' +
            'Если таких переключателей нет (часто на Huawei), подключите устройство к компьютеру с включённой отладкой по USB и выполните один раз:\n' +
            'adb shell settings put global enable_freeform_support 1\nadb shell settings put global force_resizable_activities 1\nЗатем перезагрузите.',
          buttons: [{ label: 'Для разработчиков', value: 'dev', primary: true }, { label: 'Закрыть', value: null, cancel: true }],
        }).then(r => { if (r.button === 'dev') FX.call('openSettings', 'developer'); });
      }
    },
    /** Сайт Monomach: учётная запись, диск, пароль, выход */
    web() {
      if (FX.mac) return PAGES.mac();
      pg.append(header('Учётная запись и диски'));
      const s1 = sec('Учётная запись');
      const bar = h('<div style="width:min(300px,40vw);text-align:right"><div class="muted small mm-used">…</div><div style="height:6px;border-radius:3px;background:var(--surface-4);overflow:hidden;margin-top:6px"><i style="display:block;height:100%;width:0;background:var(--accent)"></i></div></div>');
      const used = $('.mm-used', bar);
      s1.append(
        row('user', esc(FXWeb.login), 'Имя для входа на сайт', btn('Выйти', () => Power.signOut())),
        row('hdd', 'Мой диск', 'Файлы на сервере: рабочий стол, документы, загрузки', bar),
        row('lock', 'Пароль', 'Смените пароль для входа на сайт', btn('Сменить', changePw)),
      );
      FXWeb.me().then(m => {
        used.textContent = `Занято ${fmtBytes(m.used)} из ${fmtBytes(m.quota)} · свободно ${fmtBytes(Math.max(0, m.quota - m.used))}`;
        $('i', bar).style.width = Math.min(100, m.used / m.quota * 100) + '%';
      }).catch(() => {});
      const s2 = sec('Сохранение');
      s2.append(row('folder', 'Настройки и рабочий стол', 'Сохраняются в вашей учётной записи при каждом изменении — войдите с любого компьютера, и всё будет на месте', null));
      pg.append(s1, s2);
      if (typeof WebDisks !== 'undefined') WebDisks.settings(pg, { sec, row, btn });
      async function changePw() {
        const box = h('<div style="display:grid;gap:10px;min-width:300px"><input class="input pw-old" type="password" placeholder="Текущий пароль" autocomplete="current-password"><input class="input pw-new" type="password" placeholder="Новый пароль (не короче 8 символов)" autocomplete="new-password"><input class="input pw-new2" type="password" placeholder="Повторите новый пароль" autocomplete="new-password"></div>');
        setTimeout(() => $('.pw-old', box).focus(), 60);
        const r = await UI.dialog({
          title: 'Смена пароля', content: box,
          buttons: [{ label: 'Сменить', value: 'ok', primary: true }, { label: 'Отмена', value: null, cancel: true }],
          validate: () => {
            if ($('.pw-new', box).value.length < 8) return 'Новый пароль должен быть не короче 8 символов.';
            if ($('.pw-new', box).value !== $('.pw-new2', box).value) return 'Пароли не совпадают.';
            return null;
          },
        });
        if (r.button !== 'ok') return;
        try { await FXWeb.changePassword($('.pw-old', box).value, $('.pw-new', box).value); UI.notify({ title: 'Пароль изменён', icon: 'lock', transient: true }); }
        catch (e) { UI.alert('Смена пароля', e.message, 'error'); }
      }
    },
    /** Monomach для Mac */
    mac() {
      pg.append(header('Mac и диски'));
      const s1 = sec('Monomach для Mac');
      const bar = h('<div style="width:min(300px,40vw);text-align:right"><div class="muted small mm-used">…</div><div style="height:6px;border-radius:3px;background:var(--surface-4);overflow:hidden;margin-top:6px"><i style="display:block;height:100%;width:0;background:var(--accent)"></i></div></div>');
      s1.append(
        row('hdd', 'Этот Mac (D:)', 'Диск D: — ваша домашняя папка: Рабочий стол, Документы, Загрузки — те же, что в Finder', bar),
        row('folder', 'iCloud Drive и внешние диски', 'Появляются отдельными дисками в «Этом компьютере», когда подключены', null),
        row('info', 'Сохранение', 'Настройки и данные программ хранятся на этом Mac и сохраняются при каждом изменении', null),
        row('power', 'Выйти из Monomach', 'Также ⌘Q. Полноэкранный режим — ⌃⌘F', btn('Выйти', () => Power.signOut())),
      );
      FXWeb.me().then(m => {
        $('.mm-used', bar).textContent = `Занято ${fmtBytes(m.used)} из ${fmtBytes(m.quota)} · свободно ${fmtBytes(Math.max(0, m.quota - m.used))}`;
        $('i', bar).style.width = Math.min(100, m.used / m.quota * 100) + '%';
      }).catch(() => {});
      pg.append(s1);
      if (typeof WebDisks !== 'undefined') WebDisks.settings(pg, { sec, row, btn });
    },
    'fx-windows'() { PAGES.fx(); },
    'fx-storage'() { PAGES.fx(); },
    home() {
      pg.append(header('Главная'));
      const card = h(`<div class="st-hero">
        <div class="st-hero-pc"><div class="st-mini-desk" style="background:${Desktop.wallpaperCSS()};background-size:cover;background-position:center"></div></div>
        <div><b style="font-size:1.25rem">${esc(Store.get('deviceName'))}</b><div class="muted">WindowsFX для Android</div><button class="btn sm st-ren" style="margin-top:10px">Переименовать</button></div>
        <div class="st-hero-tiles">
          <div class="st-tile">${Icons.ui(Store.get('wifi') && !Store.get('airplane') ? 'wifi' : 'wifi-off', 20)}<div><b>${Store.get('airplane') ? 'Режим «В самолёте»' : Store.get('wifi') ? (navigator.onLine ? 'W12-Home' : 'Нет Интернета') : 'Wi-Fi отключён'}</b><span>Сеть</span></div></div>
          <div class="st-tile">${Icons.ui('update', 20)}<div><b>${Persist.get('update.installed', false) ? 'Обновлено' : 'Доступны обновления'}</b><span>Центр обновления</span></div></div>
        </div>
      </div>`);
      $('.st-ren', card).onclick = renameDevice;
      $$('.st-tile', card)[0].onclick = () => go('network');
      $$('.st-tile', card)[1].onclick = () => go('update');
      pg.append(card);
      const s = sec('Рекомендуемые параметры');
      s.append(
        row('brightness', 'Тёмная тема', 'Переключите оформление системы', (() => { const t = h(toggleHTML('', document.documentElement.dataset.theme === 'dark')); $('input', t).onchange = e => Store.set('theme', e.target.checked ? 'dark' : 'light'); return t; })()),
        row('palette', 'Цвет акцента', 'Цвет кнопок, выделения и индикаторов', h(`<span class="st-swatch" style="background:var(--accent)"></span>`), { click: () => go('colors') }),
        row('image', 'Фон рабочего стола', Desktop.WALLPAPERS[Store.get('wallpaper')]?.name || 'Собственное изображение', null, { click: () => go('personalization') }),
        row('volume', 'Громкость', null, rng('volume', 0, 100, 1, '%')),
        row('bell-off', 'Не беспокоить', 'Скрывать всплывающие уведомления', tgl('dnd')),
      );
      pg.append(s);
    },

    system() {
      pg.append(header('Система'));
      const s = sec('');
      [['display', 'display', 'Экран', 'Яркость, ночной свет, масштаб'], ['sound', 'volume', 'Звук', 'Громкость, устройства вывода, системные звуки'],
        ['notifications', 'bell', 'Уведомления', 'Оповещения от приложений и системы'], ['power', 'battery', 'Питание и батарея', 'Спящий режим, экономия заряда'],
        ['storage', 'hdd', 'Хранилище', 'Место на дисках, очистка'], ['about', 'info', 'О системе', 'Характеристики устройства и Windows']].forEach(([id, ic, t, d]) => s.append(row(ic, t, d, null, { click: () => go(id) })));
      pg.append(s);
    },

    display() {
      pg.append(header('Экран', 'Система'));
      const s = sec('Яркость и цвет');
      s.append(row('brightness', 'Яркость', 'Регулировка яркости встроенного дисплея', rng('brightness', 20, 100, 1, '%')),
        row('moon', 'Ночной свет', 'Использовать более тёплые цвета, чтобы снизить нагрузку на глаза', tgl('nightLight')),
        row('', 'Интенсивность ночного света', null, rng('nightLightStrength', 10, 100, 1, '%')));
      const s2 = sec('Масштаб и макет');
      s2.append(row('text', 'Размер текста', 'Масштаб текста во всей системе', sel('textScale', [[90, '90%'], [100, '100% (рекомендуется)'], [110, '110%'], [125, '125%'], [150, '150%']], true)),
        row('display', 'Разрешение экрана', `${screen.width} × ${screen.height} (окно браузера: ${innerWidth} × ${innerHeight})`, null),
        row('display', 'Масштаб устройства', `${Math.round(devicePixelRatio * 100)}%`, null));
      pg.append(s, s2);
    },

    sound() {
      pg.append(header('Звук', 'Система'));
      const bt = (Store.get('btDevices') || []).find(d => d.type === 'audio' && d.connected);
      const s = sec('Вывод');
      s.append(row('volume', 'Громкость', null, rng('volume', 0, 100, 1, '%')),
        row('volume-mute', 'Отключить звук', null, tgl('muted')),
        row('headphones', 'Устройство вывода', 'Выберите, где воспроизводить звук', selectEl(bt && Store.get('bluetooth') ? 'bt' : 'spk', [['spk', 'Динамики (Realtek High Definition Audio)'], ...(bt && Store.get('bluetooth') ? [['bt', bt.name]] : [])], () => {})),
        row('note', 'Проверка звука', 'Воспроизвести тестовый сигнал', btn('Проверить', () => Sound.play('notify', true))));
      const s2 = sec('Дополнительно');
      s2.append(row('bell', 'Системные звуки', 'Звуки при входе, уведомлениях и ошибках', tgl('sounds')));
      pg.append(s, s2);
    },

    notifications() {
      pg.append(header('Уведомления', 'Система'));
      const s = sec('');
      s.append(row('bell', 'Всплывающие уведомления', 'Показывать баннеры от приложений и системы', tgl('toasts')),
        row('bell-off', 'Не беспокоить', 'Уведомления будут отправляться сразу в центр уведомлений', tgl('dnd')),
        row('send', 'Тестовое уведомление', 'Проверьте, как выглядят уведомления', btn('Отправить', () => UI.notify({ title: 'Тестовое уведомление', body: 'Так выглядят уведомления в WindowsFX.', icon: 'settings', app: 'settings' }))),
        row('trash', 'Очистить центр уведомлений', `Уведомлений: ${UI.Notifications.list().length}`, btn('Очистить', () => { UI.Notifications.clear(); go('notifications'); })));
      pg.append(s);
    },

    power() {
      pg.append(header('Питание и батарея', 'Система'));
      const bs = Battery.state;
      const card = h(`<div class="st-hero" style="grid-template-columns:auto 1fr">${Icons.battery(bs.level, bs.charging, 56)}<div><b style="font-size:1.6rem">${Math.round(bs.level * 100)}%</b><div class="muted">${bs.supported ? (bs.charging ? 'Заряжается' + (isFinite(bs.time) && bs.time > 0 ? ` · до полной зарядки ${Math.round(bs.time / 60)} мин` : '') : 'От батареи' + (isFinite(bs.time) && bs.time > 0 ? ` · осталось ≈ ${Math.floor(bs.time / 3600)} ч ${Math.round(bs.time / 60) % 60} мин` : '')) : 'Питание от сети (данные батареи недоступны в этом браузере)'}</div></div></div>`);
      const s = sec('Питание');
      s.append(row('leaf', 'Экономия заряда', 'Отключает эффекты прозрачности для экономии энергии', tgl('batterySaver')),
        row('lock', 'Блокировать экран при бездействии', 'Автоматически показывать экран блокировки', sel('lockTimeout', [[0, 'Никогда'], [1, 'Через 1 минуту'], [5, 'Через 5 минут'], [10, 'Через 10 минут'], [30, 'Через 30 минут']], true)),
        row('sleep', 'Спящий режим', 'Перевести компьютер в спящий режим сейчас', btn('Спящий режим', () => Power.sleep())));
      pg.append(card, s);
    },

    storage() {
      pg.append(header('Хранилище', 'Система'));
      const s = sec('Локальные диски');
      FS.drives().forEach(d => {
        const pct = d.used / d.total * 100;
        s.append(row('hdd', `${d.label} (${d.letter})`, `Занято ${fmtBytes(d.used)} из ${fmtBytes(d.total)}`, h(`<div class="st-bar"><i style="width:${pct.toFixed(1)}%"></i></div>`), { click: () => Apps.launch('explorer', { path: d.letter }) }));
      });
      let ls = 0;
      for (const k of Object.keys(localStorage)) if (k.startsWith('w12.')) ls += (localStorage.getItem(k) || '').length * 2;
      const binSize = FS.bin().reduce((a, x) => a + FS.nodeSize(x.node), 0);
      const s2 = sec('Использование');
      s2.append(row('memory', 'Хранилище браузера', `Данные WindowsFX занимают ${fmtBytes(ls)} (обычно доступно около 5–10 МБ)`, null),
        row('trash', 'Корзина', `${FS.bin().length} ${plural(FS.bin().length, 'элемент', 'элемента', 'элементов')} · ${fmtBytes(binSize)}`, btn('Очистить', async () => { await Desktop.emptyBin(); go('storage'); })),
        row('history', 'Временные файлы', 'Кэш погоды и история браузера', btn('Удалить', () => { Persist.remove('weather.cache'); Persist.remove('browser.history'); UI.notify({ title: 'Очистка завершена', body: 'Временные файлы удалены.', icon: 'settings', app: 'settings' }); go('storage'); })));
      pg.append(s, s2);
    },

    about() {
      pg.append(header('О системе', 'Система'));
      const ua = navigator.userAgent;
      const browser = /Edg\//.test(ua) ? 'Microsoft Edge ' + ua.match(/Edg\/([\d.]+)/)[1] : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox ' + ua.match(/Firefox\/([\d.]+)/)[1] : /Chrome\//.test(ua) ? 'Chrome ' + ua.match(/Chrome\/([\d.]+)/)[1] : /Safari\//.test(ua) ? 'Safari' : 'Неизвестный браузер';
      const installed = Persist.get('installDate', null) || (Persist.set('installDate', Date.now()), Date.now());
      const upd = Persist.get('update.installed', false);
      const top = h(`<div class="st-hero" style="grid-template-columns:auto 1fr auto">${Icons.get('thispc', 64)}<div><b style="font-size:1.25rem">${esc(Store.get('deviceName'))}</b><div class="muted">Веб-ПК</div></div></div>`);
      top.append(btn('Переименовать этот ПК', renameDevice));
      const spec = [
        ['Имя устройства', Store.get('deviceName')],
        ['Процессор', `${navigator.hardwareConcurrency || '?'} логических процессоров (${navigator.userAgentData?.platform || navigator.platform || 'web'})`],
        ['Оперативная память', navigator.deviceMemory ? `${navigator.deviceMemory} ГБ (оценка браузера)` : 'Нет данных'],
        ['Тип системы', '64-разрядная операционная система (веб-эмуляция)'],
        ['Экран', `${screen.width} × ${screen.height}, ${screen.colorDepth}-бит`],
        ['Браузер', browser],
      ];
      const win12 = [
        ['Выпуск', 'WindowsFX'], ['Версия', upd ? '25H2.1' : '25H2'], ['Сборка ОС', upd ? '28000.1105' : '28000.1012'],
        ['Дата установки', fmtDate(installed)], ['Язык интерфейса', 'Русский (Россия)'],
      ];
      const tbl = (t, rows) => { const s = sec(t); s.append(h(`<div class="st-card"><table class="st-spec">${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table></div>`)); return s; };
      const s1 = tbl('Характеристики устройства', spec);
      $('.st-sec-title', s1).append(btn('Копировать', () => { navigator.clipboard?.writeText([...spec, ...win12].map(r => r.join(': ')).join('\n')); UI.notify({ title: 'Скопировано', body: 'Сведения о системе скопированы в буфер обмена.', icon: 'copy', transient: true, silent: true }); }, 'sm'));
      pg.append(top, s1, tbl('Характеристики Windows', win12));
    },

    bluetooth() {
      pg.append(header('Bluetooth и устройства'));
      const s = sec('');
      s.append(row('bluetooth', 'Bluetooth', Store.get('bluetooth') ? `Доступен для обнаружения как «${Store.get('deviceName')}»` : 'Отключён', tgl('bluetooth', () => go('bluetooth'))));
      pg.append(s);
      if (!Store.get('bluetooth')) return;
      const s2 = sec('Устройства');
      const devs = Store.get('btDevices') || [];
      const icon = t => ({ audio: 'headphones', mouse: 'mouse', keyboard: 'keyboard' }[t] || 'bluetooth');
      devs.forEach((d, i) => {
        const c = btn(d.connected ? 'Отключить' : 'Подключить', () => {
          Store.update('btDevices', l => { l[i].connected = !l[i].connected; });
          if (!d.connected) { Sound.play('plug'); UI.notify({ title: 'Устройство подключено', body: d.name, icon: 'bluetooth', silent: true }); }
          go('bluetooth');
        }, 'sm');
        const more = h(`<button class="icon-btn sm">${Icons.ui('more', 14)}</button>`);
        more.onclick = e => UI.menu(e.clientX, e.clientY, [{ label: 'Удалить устройство', icon: 'trash', action: () => { Store.update('btDevices', l => { l.splice(i, 1); }); go('bluetooth'); } }]);
        s2.append(row(icon(d.type), esc(d.name), d.connected ? '<span style="color:var(--success)">Подключено</span>' : 'Сопряжено', [c, more]));
      });
      s2.append(row('plus', 'Добавить устройство', 'Поиск устройств поблизости', btn('Добавить', async () => {
        const box = h('<div class="row-gap"><div class="ring-loader"></div><span>Поиск устройств…</span></div>');
        const p = UI.dialog({ title: 'Добавить устройство', content: box, buttons: [{ label: 'Отмена', value: null, cancel: true }], sound: false });
        const candidates = [['Колонка Wave Mini', 'audio'], ['Геймпад Pulse', 'keyboard'], ['Наушники Echo Pro', 'audio'], ['Мышь Glide', 'mouse'], ['Клавиатура Slim', 'keyboard']].filter(([n]) => !devs.some(d => d.name === n));
        let picked = null;
        setTimeout(() => {
          if (!box.isConnected) return;
          box.innerHTML = candidates.length ? '' : '<span class="muted">Устройства не найдены.</span>';
          candidates.slice(0, 3).forEach(([n, t]) => {
            const r = h(`<div class="st-row click" style="margin:0 0 4px">${Icons.ui(icon(t), 20)}<div class="st-t"><div>${esc(n)}</div><span>Готово к сопряжению</span></div></div>`);
            r.onclick = () => { picked = { name: n, type: t, connected: true }; box.closest('.dlg').querySelector('.dlg-x').click(); };
            box.append(r);
          });
          box.style.display = 'block';
        }, 1800);
        await p;
        if (picked) { Store.update('btDevices', l => { l.push(picked); }); Sound.play('plug'); UI.notify({ title: 'Устройство готово к работе', body: picked.name, icon: 'bluetooth', silent: true }); }
        go('bluetooth');
      }, 'sm')));
      pg.append(s2);
    },

    network() {
      pg.append(header('Сеть и Интернет'));
      const online = Net.online();
      const conn = navigator.connection;
      const st = h(`<div class="st-hero" style="grid-template-columns:auto 1fr auto"><span style="color:var(--accent-text)">${Icons.ui(online ? 'wifi' : 'wifi-off', 48)}</span><div><b style="font-size:1.25rem">${online ? 'W12-Home' : 'Нет подключения'}</b><div class="muted">${online ? 'Подключено, защищено · есть доступ к Интернету' : esc(Net.reason())}${conn?.effectiveType ? ` · ${conn.effectiveType.toUpperCase()}` : ''}${conn?.downlink ? ` · ≈${conn.downlink} Мбит/с` : ''}</div><div class="muted small st-ping"></div></div></div>`);
      st.append(btn('Проверить задержку', async () => {
        const out = $('.st-ping', st);
        if (!Net.online()) { out.textContent = 'Нет подключения.'; return; }
        out.textContent = 'Проверка…';
        try {
          const times = [];
          for (let i = 0; i < 3; i++) { const t = performance.now(); await fetch('https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0&current=is_day&_=' + Math.random(), { cache: 'no-store' }); times.push(performance.now() - t); }
          out.textContent = `Задержка до api.open-meteo.com: мин. ${Math.round(Math.min(...times))} мс, сред. ${Math.round(times.reduce((a, c) => a + c) / times.length)} мс`;
        } catch { out.textContent = 'Сервер недоступен.'; }
      }, 'sm'));
      const s = sec('');
      s.append(row('wifi', 'Wi-Fi', 'Подключение к беспроводным сетям', tgl('wifi', () => go('network'))),
        row('airplane', 'Режим «В самолёте»', 'Отключение всех беспроводных подключений', tgl('airplane', () => go('network'))));
      pg.append(st, s);
      if (Store.get('wifi') && !Store.get('airplane')) {
        const s2 = sec('Доступные сети');
        [['W12-Home', 'Подключено, защищено', true], ['Кафе «Облако»', 'Открытая сеть', false], ['TP-Link_5G', 'Защищено', false], ['Сосед_WiFi', 'Защищено', false]].forEach(([n, d, cur]) => {
          s2.append(row('wifi', esc(n), d, cur ? h('<span class="muted small">Текущая</span>') : btn('Подключиться', async () => {
            if (d === 'Защищено') {
              const pass = await UI.prompt('Подключение к ' + n, 'Введите ключ безопасности сети:', '', { type: 'password', validate: v => v.length < 8 ? 'Ключ должен содержать не менее 8 символов.' : '' });
              if (!pass) return;
            }
            UI.alert('Wi-Fi', `Не удалось подключиться к «${n}»: сеть вне зоны действия.`, 'warning');
          }, 'sm')));
        });
        pg.append(s2);
      }
    },

    personalization() {
      pg.append(header('Персонализация'));
      const prev = h(`<div class="st-preview"><div class="st-prev-desk" style="background:${Desktop.wallpaperCSS()};background-size:cover;background-position:center"><div class="st-prev-win"><i></i><i></i><i></i></div><div class="st-prev-tb"><i></i><i></i><i></i><i></i></div></div>
        <div class="st-prev-side"></div></div>`);
      pg.append(prev);
      const s = sec('Фон');
      const gal = h('<div class="st-wps"></div>');
      Object.entries(Desktop.WALLPAPERS).forEach(([id, wp]) => {
        const t = h(`<div class="st-wp ${Store.get('wallpaper') === id ? 'on' : ''}" title="${esc(wp.name)}" style="background:${wp.css || (document.documentElement.dataset.theme === 'light' ? wp.light : wp.dark)};background-size:cover;background-position:center"><span>${esc(wp.name)}</span></div>`);
        t.onclick = () => { Store.set('wallpaper', id); go('personalization'); };
        gal.append(t);
      });
      if (Store.get('customWallpaper')) {
        const t = h(`<div class="st-wp ${Store.get('wallpaper') === 'custom' ? 'on' : ''}" style="background:url('${Store.get('customWallpaper')}') center/cover"><span>Своё фото</span></div>`);
        t.onclick = () => { Store.set('wallpaper', 'custom'); go('personalization'); };
        gal.append(t);
      }
      s.append(h('<div class="st-card"></div>'));
      $('.st-card', s).append(gal, h('<div class="row-gap" style="margin-top:12px"></div>'));
      $('.row-gap', $('.st-card', s)).append(
        btn(`${Icons.ui('upload', 14)} Обзор…`, () => {
          const inp = document.createElement('input');
          inp.type = 'file'; inp.accept = 'image/*';
          inp.onchange = async () => {
            const f = inp.files[0]; if (!f) return;
            const url = await downscaleImage(await readFileAs(f), 1920, 'image/jpeg', 0.82);
            Store.set('customWallpaper', url); Store.set('wallpaper', 'custom'); go('personalization');
          };
          inp.click();
        }),
        btn(`${Icons.ui('image', 14)} Из «Изображений»`, async () => {
          const p = await UI.filePicker({ mode: 'open', dir: FS.P.pictures, kinds: ['image'], title: 'Выбор фона', typeLabel: 'Изображения' });
          if (p) { FileOps.setWallpaper(p); go('personalization'); }
        }));
      pg.append(s);
      const s2 = sec('Другие параметры');
      [['colors', 'palette', 'Цвета', 'Цвет акцента, прозрачность, тёмная тема'], ['themes', 'brush', 'Темы', 'Готовые сочетания фона и цветов'], ['taskbar', 'apps', 'Панель задач и Пуск', 'Выравнивание, кнопки, поведение']].forEach(([id, ic, t, d]) => s2.append(row(ic, t, d, null, { click: () => go(id) })));
      s2.append(row('desktop', 'Значки рабочего стола', 'Отображать значки на рабочем столе', tgl('desktopIcons')),
        row('grid', 'Размер значков', null, sel('desktopIconSize', [['small', 'Мелкие'], ['medium', 'Обычные'], ['large', 'Крупные']])));
      pg.append(s2);
    },

    colors() {
      pg.append(header('Цвета', 'Персонализация'));
      const s = sec('');
      s.append(row('brightness', 'Выберите режим', 'Оформление окон и элементов системы', sel('theme', [['dark', 'Тёмный'], ['light', 'Светлый'], ['auto', 'Как в системе']])),
        row('eye', 'Эффекты прозрачности', 'Полупрозрачные окна и панели с размытием', tgl('transparency')),
        row('display', 'Цвет акцента на заголовках окон', 'Подсвечивать заголовок активного окна', tgl('accentTitlebars')));
      const s2 = sec('Цвет акцента');
      const COLORS = ['#ffb900', '#ff8c00', '#f7630c', '#ca5010', '#da3b01', '#ef6950', '#d13438', '#ff4343', '#e74856', '#e81123', '#ea005e', '#c30052', '#e3008c', '#bf0077', '#c239b3', '#9a0089', '#0078d4', '#4f8cff', '#0099bc', '#2d7d9a', '#00b7c3', '#038387', '#00b294', '#018574', '#00cc6a', '#10893e', '#7a7574', '#5d5a58', '#68768a', '#515c6b', '#8764b8', '#744da9', '#b146c2', '#881798', '#6b69d6', '#a35cff'];
      const card = h('<div class="st-card"><div class="st-colors"></div><div class="row-gap" style="margin-top:14px"><span>Свой цвет:</span><input type="color" class="input st-custom-color"></div></div>');
      COLORS.forEach(c => {
        const sw = h(`<button class="st-color ${Store.get('accent').toLowerCase() === c ? 'on' : ''}" style="background:${c}" title="${c}"></button>`);
        sw.onclick = () => { Store.set('accent', c); go('colors'); };
        $('.st-colors', card).append(sw);
      });
      const cc = $('.st-custom-color', card);
      cc.value = Store.get('accent');
      cc.oninput = () => Store.set('accent', cc.value);
      s2.append(card);
      pg.append(s, s2);
    },

    themes() {
      pg.append(header('Темы', 'Персонализация'));
      const THEMES = [
        ['Windows (тёмная)', 'bloom', 'dark', '#4f8cff'], ['Windows (светлая)', 'bloom', 'light', '#0078d4'], ['Северное сияние', 'aurora', 'dark', '#00b294'],
        ['Закат', 'sunset', 'dark', '#ff8c00'], ['Туманность', 'nebula', 'dark', '#e3008c'], ['Пастель', 'mint', 'light', '#8764b8'],
        ['Горы', 'mountains', 'dark', '#ef6950'], ['Океан', 'ocean', 'dark', '#00b7c3'], ['Графит', 'graphite', 'dark', '#7a7574'],
      ];
      const s = sec('Текущая тема: ' + (THEMES.find(t => t[1] === Store.get('wallpaper') && t[3] === Store.get('accent'))?.[0] || 'Пользовательская'));
      const grid = h('<div class="st-themes"></div>');
      THEMES.forEach(([n, wp, th, ac]) => {
        const W = Desktop.WALLPAPERS[wp];
        const bg = W.css || (th === 'light' ? W.light : W.dark);
        const t = h(`<div class="st-theme"><div class="st-theme-img" style="background:${bg};background-size:cover;background-position:center"><div class="st-theme-win" style="background:${th === 'dark' ? '#1f2129' : '#f6f7fb'}"><i style="background:${ac}"></i></div></div><span>${esc(n)}</span></div>`);
        t.onclick = () => { Store.set('wallpaper', wp); Store.set('theme', th); Store.set('accent', ac); go('themes'); };
        grid.append(t);
      });
      s.append(grid);
      pg.append(s);
    },

    taskbar() {
      pg.append(header('Панель задач и Пуск', 'Персонализация'));
      const s = sec('Элементы панели задач');
      s.append(row('widgets', 'Виджеты', null, tgl('showWidgetsBtn')), row('search', 'Поиск', null, tgl('showSearchBtn')), row('taskview', 'Представление задач', null, tgl('showTaskViewBtn')));
      const s2 = sec('Поведение панели задач');
      s2.append(row('apps', 'Выравнивание панели задач', null, sel('taskbarAlign', [['center', 'По центру'], ['left', 'Слева']])),
        row('down', 'Автоматически скрывать панель задач', 'Панель появляется при наведении на нижний край', tgl('taskbarAutoHide')),
        row('clock', 'Показывать секунды в часах', null, tgl('showSeconds')));
      const s3 = sec('Пуск');
      s3.append(row('sparkle', 'Показывать рекомендуемые файлы', 'Недавно открытые файлы в меню «Пуск»', tgl('showRecommended')),
        row('pin', 'Закреплённые приложения', 'Вернуть набор закреплённых приложений по умолчанию', btn('Сбросить', () => { Store.set('startPinned', Store.defaults.startPinned); Store.set('pinned', Store.defaults.pinned); UI.notify({ title: 'Закреплённые приложения сброшены', icon: 'settings', transient: true, silent: true }); })));
      pg.append(s, s2, s3);
    },

    apps() {
      pg.append(header('Приложения'));
      const s = sec('Установленные приложения');
      const card = h('<div class="st-card st-applist"></div>');
      Apps.all().sort((a, c) => a.name.localeCompare(c.name, 'ru')).forEach(a => {
        const more = h(`<button class="icon-btn sm">${Icons.ui('more', 14)}</button>`);
        more.onclick = e => UI.menu(e.clientX, e.clientY, [
          { label: 'Открыть', icon: 'app:' + a.icon, action: () => Apps.launch(a.id) },
          { label: Taskbar.isPinned(a.id) ? 'Открепить от панели задач' : 'Закрепить на панели задач', icon: 'pin', action: () => Taskbar.togglePin(a.id) },
          { label: 'Создать ярлык на рабочем столе', icon: 'external', action: () => FileOps.appShortcut(a.id) },
        ]);
        const r = h(`<div class="st-app">${Icons.get(a.icon, 32)}<div class="st-t"><div>${esc(a.name)}</div><span>${esc(a.desc || '')}</span></div></div>`);
        r.append(btn('Открыть', () => Apps.launch(a.id), 'sm'), more);
        card.append(r);
      });
      s.append(card);
      const s2 = sec('Приложения по умолчанию');
      const da = Store.get('defaultApps');
      const setDa = (k, v) => Store.update('defaultApps', d => { d[k] = v; });
      s2.append(row('file', 'Текстовые файлы (.txt, .md, .js…)', null, selectEl(da.text, [['notepad', 'Блокнот'], ['browser', 'Браузер']], v => setDa('text', v))),
        row('image', 'Изображения (.png, .jpg, .svg…)', null, selectEl(da.image, [['photos', 'Фотографии'], ['paint', 'Paint'], ['browser', 'Браузер']], v => setDa('image', v))),
        row('note', 'Аудио и видео', null, selectEl(da.audio, [['music', 'Медиаплеер'], ['browser', 'Браузер']], v => setDa('audio', v))),
        row('globe', 'Веб-страницы (.html)', null, selectEl(da.html, [['browser', 'Браузер'], ['notepad', 'Блокнот']], v => setDa('html', v))));
      const s3 = sec('Автозагрузка');
      const st = Store.get('startupApps');
      ['explorer', 'notepad', 'browser', 'weather', 'calendar', 'clock', 'music', 'taskmgr', 'assistant', 'terminal'].map(Apps.get).filter(Boolean).forEach(a => {
        const t = h(toggleHTML('', st.includes(a.id)));
        $('input', t).onchange = e => Store.update('startupApps', l => e.target.checked ? [...new Set([...l, a.id])] : l.filter(x => x !== a.id));
        s3.append(row(null, `<span class="row-gap">${Icons.get(a.icon, 20)}${esc(a.name)}</span>`, 'Запускать при входе в систему', t));
      });
      pg.append(s, s2, s3);
    },

    accounts() {
      pg.append(header('Учётные записи'));
      const top = h(`<div class="st-hero" style="grid-template-columns:auto 1fr">${StartMenu.avatarHTML(96)}<div><b style="font-size:1.4rem">${esc(Store.get('userName'))}</b><div class="muted">${FX.web ? 'Учётная запись ' + esc(FXWeb.site) + ' · ' + esc(FXWeb.login) : 'Локальная учётная запись · Администратор'}</div></div></div>`);
      const s = sec('Ваши данные');
      const nameIn = h(`<input class="input" style="width:240px" maxlength="40" value="${esc(Store.get('userName'))}">`);
      nameIn.onchange = () => { const v = nameIn.value.trim(); if (v) { Store.set('userName', v); renderMe(); go('accounts'); } };
      s.append(row('user', 'Имя пользователя', 'Отображается в меню «Пуск» и на экране входа', nameIn));
      const colors = h('<div class="st-colors" style="grid-template-columns:repeat(8,28px)"></div>');
      ['#7a5cff', '#2f6bff', '#00a2c7', '#13a10e', '#ff8c00', '#e81123', '#e3008c', '#5d5a58'].forEach(c => {
        const sw = h(`<button class="st-color ${Store.get('avatarColor') === c && !Store.get('avatar') ? 'on' : ''}" style="background:${c};width:28px;height:28px"></button>`);
        sw.onclick = () => { Store.set('avatar', null); Store.set('avatarColor', c); renderMe(); go('accounts'); };
        colors.append(sw);
      });
      s.append(row('palette', 'Цвет аватара', null, colors),
        row('camera', 'Фото профиля', 'Выберите изображение', [
          btn('Обзор…', () => {
            const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
            inp.onchange = async () => { const f = inp.files[0]; if (!f) return; Store.set('avatar', await downscaleImage(await readFileAs(f), 256)); renderMe(); go('accounts'); };
            inp.click();
          }, 'sm'),
          btn('Снять с камеры', () => Apps.launch('camera', { avatar: true }), 'sm'),
          ...(Store.get('avatar') ? [btn('Удалить', () => { Store.set('avatar', null); renderMe(); go('accounts'); }, 'sm')] : []),
        ]));
      const s2 = sec('Параметры входа');
      const hasPass = !!Store.get('password');
      s2.append(row('lock', 'Пароль', hasPass ? 'Пароль установлен' : 'Пароль не задан — вход выполняется без пароля', [
        btn(hasPass ? 'Изменить' : 'Добавить', setPassword, 'sm'),
        ...(hasPass ? [btn('Удалить', async () => {
          const p = await UI.prompt('Удаление пароля', 'Введите текущий пароль:', '', { type: 'password' });
          if (p === null) return;
          if (Power.hash(p) !== Store.get('password')) return UI.alert('Пароль', 'Неверный пароль.', 'error');
          Store.set('password', ''); go('accounts');
        }, 'sm')] : []),
      ]),
        row('display', 'Показывать экран блокировки при запуске', null, tgl('lockOnStart')),
        row('clock', 'Блокировать при бездействии', null, sel('lockTimeout', [[0, 'Никогда'], [1, '1 мин'], [5, '5 мин'], [10, '10 мин'], [30, '30 мин']], true)),
        row('lock', 'Заблокировать сейчас', null, btn('Заблокировать', () => Power.lock(), 'sm')));
      pg.append(top, s, s2);
    },

    time() {
      pg.append(header('Время и язык'));
      const now = h(`<div class="st-hero" style="grid-template-columns:1fr"><div><b class="st-clock" style="font-size:2rem;font-family:var(--font-display)"></b><div class="muted st-clock-d"></div></div></div>`);
      let seen = false;
      const upd = () => { if (now.isConnected) seen = true; else if (seen) return clearInterval(t); $('.st-clock', now).textContent = fmtTime(Date.now(), true); $('.st-clock-d', now).textContent = cap(fmtDateLong(Date.now())); };
      const t = setInterval(upd, 1000); upd();
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const off = -new Date().getTimezoneOffset() / 60;
      const s = sec('Дата и время');
      s.append(row('clock', '24-часовой формат', null, tgl('clock24')),
        row('clock', 'Показывать секунды в часах на панели задач', null, tgl('showSeconds')),
        row('globe', 'Часовой пояс', `(UTC${off >= 0 ? '+' : ''}${off}) ${tz} — определяется автоматически`, null),
        row('sunrise', 'Синхронизация', 'Время синхронизируется с вашим устройством', null));
      const s2b = sec('Языки ввода (клавиатура)');
      const langRow = id => {
        const L = Kbd.LANGS[id];
        const cb = h(`<input type="checkbox" class="check" ${Kbd.list().includes(id) ? 'checked' : ''}>`);
        cb.onchange = () => {
          const ls = Object.keys(Kbd.LANGS).filter(k => k === id ? cb.checked : Kbd.list().includes(k));
          if (!ls.length) { cb.checked = true; return; }
          Kbd.setList(ls);
        };
        return row('keyboard', `${L.short} · ${L.name}`, 'Раскладка: ' + L.kb, cb);
      };
      s2b.append(...Object.keys(Kbd.LANGS).map(langRow),
        row('keyboard', 'Переключение языка ввода', 'Также Win+Пробел и щелчок по индикатору на панели задач', sel('kbdHotkey', [['alt+shift', 'Alt+Shift'], ['ctrl+shift', 'Ctrl+Shift'], ['any', 'Alt+Shift и Ctrl+Shift']])),
        row('phone', 'Вместе с клавиатурой Android', 'Когда вы меняете язык клавиатуры в Android, WindowsFX переключается на тот же язык', tgl('kbdFollowAndroid')));
      const s3 = sec('Погода');
      const cityIn = h(`<input class="input" style="width:200px" value="${esc(Store.get('weatherCity'))}">`);
      const applyCity = async () => {
        const v = cityIn.value.trim(); if (!v || v === Store.get('weatherCity')) return;
        try {
          const res = await Weather.geocode(v);
          if (!res.length) return UI.alert('Погода', `Город «${v}» не найден.`, 'warning');
          await Weather.setPlace(res[0]);
          cityIn.value = res[0].name;
          UI.notify({ title: 'Город изменён', body: res[0].name + (res[0].country ? ', ' + res[0].country : ''), icon: 'weather', app: 'weather', silent: true });
        } catch (e) { UI.alert('Погода', e.message, 'error'); }
      };
      cityIn.onkeydown = e => { if (e.key === 'Enter') applyCity(); };
      s3.append(row('location', 'Город для прогноза', 'Используется в виджетах, на панели задач и в приложении «Погода»', [cityIn, btn('Сохранить', applyCity, 'sm')]),
        row('thermo', 'Единицы измерения', null, sel('weatherUnits', [['C', 'Цельсий (°C)'], ['F', 'Фаренгейт (°F)']])));
      pg.append(now, s, s2b, s3);
    },

    accessibility() {
      pg.append(header('Специальные возможности'));
      const s = sec('Зрение');
      s.append(row('text', 'Размер текста', `<span style="font-size:${Store.get('textScale') / 100}em">Пример текста</span>`, rng('textScale', 90, 150, 5, '%')),
        row('sparkle', 'Эффекты анимации', 'Плавные анимации окон и панелей', tgl('animations')),
        row('eye', 'Эффекты прозрачности', null, tgl('transparency')),
        row('brightness', 'Повышенная контрастность', 'Сделать цвета насыщеннее и контрастнее', tgl('highContrast')));
      const s2 = sec('Сочетания клавиш');
      const keys = [['Ctrl+Alt+S', 'Открыть меню «Пуск»'], ['Ctrl+Alt+D', 'Показать рабочий стол'], ['Ctrl+Alt+E', 'Проводник'], ['Ctrl+Alt+I', 'Параметры'], ['Ctrl+Alt+T', 'Терминал'], ['Ctrl+Alt+K', 'Ассистент'],
        ['Ctrl+Alt+A', 'Быстрые настройки'], ['Ctrl+Alt+N', 'Центр уведомлений'], ['Ctrl+Alt+Tab / V', 'Представление задач'], ['Ctrl+Alt+L', 'Заблокировать'], ['Ctrl+Alt+W', 'Закрыть активное окно'],
        ['Ctrl+Alt+M', 'Свернуть окно'], ['Ctrl+Alt+← / →', 'Прикрепить окно слева / справа'], ['Ctrl+Alt+↑ / ↓', 'Развернуть / восстановить окно'], ['Ctrl+Alt+Delete', 'Диспетчер задач'], ['Esc', 'Закрыть меню и панели']];
      s2.append(h(`<div class="st-card"><table class="st-spec">${keys.map(([k, d]) => `<tr><td><span class="kbd">${esc(k)}</span></td><td>${esc(d)}</td></tr>`).join('')}</table></div>`));
      pg.append(s, s2);
    },

    privacy() {
      pg.append(header('Конфиденциальность и защита'));
      const s0 = h(`<div class="st-hero" style="grid-template-columns:auto 1fr"><span style="color:var(--success)">${Icons.ui('shield', 48)}</span><div><b style="font-size:1.2rem">Безопасность Windows</b><div class="muted">Защита включена. Действия не требуются.</div></div></div>`);
      const s = sec('Журнал действий');
      s.append(row('history', 'Недавние файлы', 'Список в меню «Пуск» и в Проводнике', btn('Очистить', () => { Persist.set('recent', []); UI.notify({ title: 'Список недавних файлов очищен', icon: 'shield', transient: true, silent: true }); }, 'sm')),
        row('globe', 'История браузера', null, btn('Очистить', () => { Persist.remove('browser.history'); UI.notify({ title: 'История браузера очищена', icon: 'shield', transient: true, silent: true }); }, 'sm')),
        row('bell', 'Уведомления', null, btn('Очистить', () => UI.Notifications.clear(), 'sm')));
      const s2 = sec('Резервная копия');
      s2.append(row('download', 'Экспорт данных', 'Сохранить все файлы и настройки в JSON-файл на ваш компьютер', btn('Экспортировать', () => {
        Store.flush();
        const data = {};
        Object.keys(localStorage).filter(k => k.startsWith('w12.')).forEach(k => (data[k] = localStorage.getItem(k)));
        downloadBlob(`windows12-backup-${dateKey(new Date())}.json`, JSON.stringify({ format: 'w12-backup', version: 1, data }), 'application/json');
      }, 'sm')),
        row('upload', 'Импорт данных', 'Восстановить систему из резервной копии (текущие данные будут заменены)', btn('Импортировать', () => {
          const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
          inp.onchange = async () => {
            try {
              const j = JSON.parse(await readFileAs(inp.files[0], 'text'));
              if (j.format !== 'w12-backup') throw new Error('Это не резервная копия WindowsFX.');
              if (!await UI.confirm('Импорт', 'Заменить текущие файлы и настройки данными из резервной копии? Система будет перезапущена.')) return;
              Store.resetAll();
              Object.entries(j.data).forEach(([k, v]) => localStorage.setItem(k, v));
              location.reload();
            } catch (e) { UI.alert('Импорт', e.message, 'error'); }
          };
          inp.click();
        }, 'sm')));
      const s3 = sec('Восстановление');
      s3.append(row('restart', 'Вернуть компьютер в исходное состояние', 'Удалить все файлы, приложения и настройки', btn('Сбросить', async () => {
        if (!await UI.confirm('Вернуть компьютер в исходное состояние', 'Все ваши файлы, настройки и данные приложений будут удалены без возможности восстановления. Продолжить?', { danger: true, ok: 'Сбросить' })) return;
        Store.resetAll();
        location.reload();
      }, 'danger sm')));
      pg.append(s0, s, s2, s3);
    },

    update() {
      pg.append(header('Обновления WindowsFX'));
      const installed = Persist.get('update.installed', false);
      const pending = Persist.get('update.pending', false);
      const last = Store.get('lastUpdateCheck');
      const box = h(`<div class="st-hero" style="grid-template-columns:auto 1fr auto"><span class="st-upd-ic" style="color:var(--accent-text)">${Icons.ui('update', 48)}</span><div><b class="st-upd-t" style="font-size:1.2rem"></b><div class="muted st-upd-d"></div><div class="st-upd-bar hidden"><div class="st-bar" style="width:100%;margin-top:10px"><i style="width:0%"></i></div></div></div><div class="st-upd-btn"></div></div>`);
      const T = $('.st-upd-t', box), D = $('.st-upd-d', box), B = $('.st-upd-btn', box);
      const setIdle = () => {
        B.innerHTML = '';
        if (Persist.get('update.pending', false)) {
          T.textContent = 'Требуется перезагрузка';
          D.textContent = 'Обновление функций WindowsFX, версия 25H2.1 будет установлено после перезагрузки.';
          B.append(btn('Перезагрузить сейчас', () => { Persist.set('update.installed', true); Persist.set('update.pending', false); Power.restart(); }, 'primary'));
        } else {
          T.textContent = installed || last ? 'У вас установлены последние обновления' : 'Проверьте наличие обновлений';
          D.textContent = last ? 'Последняя проверка: ' + fmtDateLong(last) + ', ' + fmtTime(last) : 'Проверка ещё не выполнялась';
          B.append(btn('Проверить наличие обновлений', check, 'primary'));
        }
      };
      async function check() {
        if (!Net.online()) return UI.alert('Обновления WindowsFX', 'Нет подключения к Интернету. ' + Net.reason(), 'warning');
        B.innerHTML = '';
        T.textContent = 'Проверка наличия обновлений…';
        D.textContent = '';
        $('.st-upd-ic', box).innerHTML = '<div class="ring-loader" style="width:48px;height:48px;border-width:4px"></div>';
        await sleep(2200);
        Store.set('lastUpdateCheck', Date.now());
        $('.st-upd-ic', box).innerHTML = Icons.ui('update', 48);
        if (installed || !box.isConnected) { setIdle(); return; }
        T.textContent = 'Доступны обновления';
        D.textContent = 'Обновление функций WindowsFX, версия 25H2.1 (сборка 28000.1105)';
        B.append(btn('Скачать и установить', async () => {
          B.innerHTML = '';
          $('.st-upd-bar', box).classList.remove('hidden');
          const bar = $('.st-upd-bar i', box);
          for (let p = 0; p <= 100; p += Math.ceil(Math.random() * 7)) {
            if (!box.isConnected) break;
            bar.style.width = Math.min(100, p) + '%';
            T.textContent = p < 60 ? `Скачивание — ${Math.min(100, p)}%` : `Установка — ${Math.min(100, p)}%`;
            await sleep(180);
          }
          Persist.set('update.pending', true);
          $('.st-upd-bar', box).classList.add('hidden');
          UI.notify({ title: 'Требуется перезагрузка', body: 'Перезагрузите компьютер, чтобы завершить установку обновления.', icon: 'settings', app: 'settings', onClick: () => Apps.launch('settings', { page: 'update' }) });
          setIdle();
        }, 'primary'));
      }
      setIdle();
      const s = sec('Дополнительные параметры');
      s.append(row('history', 'Журнал обновлений', installed ? '25H2.1 (сборка 28000.1105) — установлено' : 'Обновления не устанавливались', null),
        row('info', 'Версия системы', installed ? 'WindowsFX' : 'WindowsFX', null, { click: () => go('about') }));
      pg.append(box, s);
      if (pending && !installed) setIdle();
    },
  };

  async function renameDevice() {
    const n = await UI.prompt('Переименование ПК', 'Новое имя компьютера (буквы, цифры и дефис):', Store.get('deviceName'), {
      validate: v => /^[A-Za-zА-Яа-я0-9-]{1,15}$/.test(v.trim()) ? '' : 'Допустимы буквы, цифры и дефис, не более 15 символов.',
    });
    if (n) { Store.set('deviceName', n.trim().toUpperCase()); go(page); }
  }

  async function setPassword() {
    const content = h(`<div style="display:flex;flex-direction:column;gap:8px">
      ${Store.get('password') ? '<input class="input p0" type="password" placeholder="Текущий пароль">' : ''}
      <input class="input p1" type="password" placeholder="Новый пароль">
      <input class="input p2" type="password" placeholder="Подтвердите пароль">
    </div>`);
    const r = await UI.dialog({
      title: 'Пароль', message: 'Пароль будет запрашиваться на экране входа.', content, sound: false,
      buttons: [{ label: 'Сохранить', value: true, primary: true }, { label: 'Отмена', value: false, cancel: true }],
      validate: () => {
        const p0 = $('.p0', content), p1 = $('.p1', content).value, p2 = $('.p2', content).value;
        if (p0 && Power.hash(p0.value) !== Store.get('password')) return 'Неверный текущий пароль.';
        if (p1.length < 4) return 'Пароль должен содержать не менее 4 символов.';
        if (p1 !== p2) return 'Пароли не совпадают.';
        return '';
      },
    });
    if (r.button) {
      Store.set('password', Power.hash($('.p1', content).value));
      UI.notify({ title: 'Пароль установлен', body: 'Используйте его для входа в систему.', icon: 'lock', silent: true });
      go('accounts');
    }
  }

  renderMe();
  const offs = [Store.on('*', debounce(k => {
    if (['userName', 'avatar', 'avatarColor'].includes(k)) renderMe();
    if (['wallpaper', 'customWallpaper', 'theme', 'accent', 'textScale'].includes(k) && ['personalization', 'colors', 'themes', 'home', 'accessibility'].includes(page)) {
      const st = main.scrollTop; go(page); main.scrollTop = st;
    }
  }, 60))];
  win.onClose = () => offs.forEach(f => f());
  win.onArgs = a => a.page && go(a.page);
  go(args.page || 'home');
  return win;
}
