/* Загрузка, экран блокировки, вход, выключение, перезагрузка */
'use strict';

const Power = (() => {
  const ls = () => document.getElementById('lockscreen');
  const ps = () => document.getElementById('power-screen');
  let sessionActive = false;
  let clockT = null;
  let state = 'off';

  /** Нестойкий хеш пароля (данные хранятся только локально в браузере) */
  function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 'h' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  const logo = () => `<svg class="ps-logo" viewBox="0 0 48 48"><defs><linearGradient id="ps-a" gradientUnits="userSpaceOnUse" x1="292" y1="287" x2="548" y2="766"><stop offset="0" stop-color="#5EEAD4"/><stop offset=".5" stop-color="#22D3EE"/><stop offset="1" stop-color="#2563EB"/></linearGradient><linearGradient id="ps-b" gradientUnits="userSpaceOnUse" x1="486" y1="232" x2="734" y2="770"><stop offset="0" stop-color="#818CF8"/><stop offset=".55" stop-color="#8B5CF6"/><stop offset="1" stop-color="#D946EF"/></linearGradient></defs><g transform="translate(-14.9 -6.9) scale(.066)"><path d="M292 312L456 287 548 766 292 729Z" fill="url(#ps-a)"/><path d="M486 270L734 232 734 770 574 746Z" fill="url(#ps-b)"/><path d="M471 250L566 800" stroke="#fff" stroke-width="9" stroke-linecap="round" opacity=".9"/><path d="M808 136C816 196 826 206 886 214 826 222 816 232 808 292 800 232 790 222 730 214 790 206 800 196 808 136Z" fill="#fff"/></g></svg>`;
  const spinner = () => '<div class="spinner ps-spinner"><i></i><i></i><i></i><i></i><i></i></div>';

  function showPower(html) {
    ps().innerHTML = html;
    ps().classList.add('show');
  }
  function hidePower() { ps().classList.remove('show'); ps().innerHTML = ''; }

  async function boot() {
    state = 'boot';
    window.__bootTime = Date.now();
    showPower(logo() + spinner() + '<div class="ps-brand">Windows<b style="background:linear-gradient(120deg,#22d3ee,#8b5cf6,#d946ef);-webkit-background-clip:text;color:transparent">FX</b></div>');
    await sleep(Store.get('animations') ? 1300 : 400);
    if (Store.get('lockOnStart') || Store.get('password')) {
      lock(true);
      hidePower();
    } else {
      hidePower();
      startSession();
    }
  }

  // ---------------- Экран блокировки ----------------
  function buildLock() {
    const hasPass = !!Store.get('password');
    ls().innerHTML = `
      <div class="ls-bg"></div>
      <div class="ls-clock"><div class="t"></div><div class="d"></div></div>
      <div class="ls-widgets"></div>
      <div class="ls-hint">Щёлкните мышью или нажмите любую клавишу</div>
      <div class="ls-login">
        <div class="ls-avatar"></div>
        <div class="ls-name">${esc(Store.get('userName'))}</div>
        ${hasPass ? `<div class="ls-pass"><input type="password" placeholder="Пароль" autocomplete="off"><button title="Войти">${Icons.ui('forward', 16)}</button></div>` : `<button class="btn ls-signin">Войти</button>`}
        <div class="ls-error"></div>
        ${hasPass ? '<button class="btn subtle ls-forgot" style="color:#fff;font-size:.86rem">Я забыл пароль</button>' : ''}
      </div>
      <div class="ls-status">${Icons.ui(Store.get('wifi') && !Store.get('airplane') ? 'wifi' : 'wifi-off', 20)}${Icons.battery(Battery.state.level, Battery.state.charging, 22)}</div>
      <div class="ls-corner">
        <button title="Специальные возможности">${Icons.ui('accessibility', 20)}</button>
        <button class="ls-power" title="Выключение">${Icons.ui('power', 20)}</button>
      </div>`;
    ls().style.background = Desktop.wallpaperCSS();
    const av = Store.get('avatar');
    const avEl = $('.ls-avatar', ls());
    if (av) avEl.style.backgroundImage = `url('${av}')`;
    else { avEl.style.background = Store.get('avatarColor'); avEl.textContent = (Store.get('userName').trim()[0] || 'П').toUpperCase(); }
    const w = Weather.cached();
    const wbox = $('.ls-widgets', ls());
    if (w?.current) wbox.append(h(`<div class="ls-widget">${Weather.icon(w.current.code, w.current.isDay, 30)}<div><b>${Weather.temp(w.current.temp)}</b> ${esc(w.place.name)}<div style="opacity:.8;font-size:.85rem">${esc(Weather.desc(w.current.code))}</div></div></div>`));
    const nEv = Persist.get('calendar.events', []).filter(e => e.date === dateKey(new Date())).length;
    if (nEv) wbox.append(h(`<div class="ls-widget">${Icons.ui('calendar', 20)}<div>${nEv} ${plural(nEv, 'событие', 'события', 'событий')} сегодня</div></div>`));

    const submit = () => {
      const inp = $('.ls-pass input', ls());
      if (inp && hash(inp.value) !== Store.get('password')) {
        $('.ls-error', ls()).textContent = inp.value ? 'Неверный пароль. Повторите попытку.' : 'Введите пароль.';
        const box = $('.ls-pass', ls());
        box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
        Sound.play('error', true);
        inp.select();
        return;
      }
      unlock();
    };
    $('.ls-pass button', ls())?.addEventListener('click', submit);
    $('.ls-pass input', ls())?.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') ls().classList.remove('login'); });
    $('.ls-signin', ls())?.addEventListener('click', submit);
    $('.ls-forgot', ls())?.addEventListener('click', async e => {
      e.stopPropagation();
      const ok = await UI.confirm('Сброс пароля', 'Пароль хранится только в этом браузере. Сбросить пароль для входа?\nВаши файлы и настройки сохранятся.', { ok: 'Сбросить пароль' });
      if (ok) { Store.set('password', ''); buildLock(); ls().classList.add('login'); }
    });
    $('.ls-power', ls()).addEventListener('click', e => {
      e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect();
      UI.menu(r.left - 160, r.top - 8, [
        { label: 'Спящий режим', icon: 'sleep', action: sleepMode },
        { label: 'Завершение работы', icon: 'power', action: shutdown },
        { label: 'Перезагрузка', icon: 'restart', action: restart },
      ], { above: true });
    });
    tickLock();
  }

  function tickLock() {
    const t = $('.ls-clock .t', ls());
    if (!t) return;
    t.textContent = fmtTime(Date.now());
    $('.ls-clock .d', ls()).textContent = cap(new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }));
  }

  function toLogin() {
    if (state !== 'locked' || ls().classList.contains('login')) return;
    ls().classList.add('login');
    setTimeout(() => ($('.ls-pass input', ls()) || $('.ls-signin', ls()))?.focus(), 250);
  }

  function lock(fromBoot = false) {
    Shell.closeAll();
    UI.closeMenus();
    TaskView.hide();
    state = 'locked';
    buildLock();
    ls().classList.remove('login');
    ls().classList.add('show');
    clearInterval(clockT);
    clockT = setInterval(tickLock, 1000);
    if (!fromBoot) Sound.play('lock');
  }

  function unlock() {
    state = 'on';
    clearInterval(clockT);
    ls().classList.remove('show', 'login');
    Sound.context();
    if (!sessionActive) startSession();
    else Sound.play('unlock');
    document.getElementById('desktop').focus();
  }

  function startSession() {
    state = 'on';
    sessionActive = true;
    Sound.play('startup');
    (Store.get('startupApps') || []).forEach((id, i) => setTimeout(() => Apps.get(id) && Apps.launch(id), 400 + i * 250));
    if (Store.get('firstRun')) {
      Store.set('firstRun', false);
      if (FX.mac) setTimeout(() => UI.notify({
        title: 'Добро пожаловать в Monomach!',
        body: 'Диск D: — ваша домашняя папка Mac: Документы, Загрузки и Рабочий стол те же, что в Finder. Выход — ⌘Q.',
        icon: 'start', appName: 'Monomach', onClick: () => Apps.launch('explorer', { path: 'thispc://' }),
      }), 1200);
      else setTimeout(() => UI.notify({
        title: 'Добро пожаловать в WindowsFX!',
        body: 'Откройте «Прочти меня» на рабочем столе, чтобы узнать о горячих клавишах и возможностях системы.',
        icon: 'start', appName: 'WindowsFX', onClick: () => FileOps.open(FS.P.desktop + '/Прочти меня.txt'),
      }), 1200);
    }
  }

  async function closeAllApps() {
    for (const w of WM.list()) {
      const ok = await w.close();
      if (!ok && WM.get(w.id)) return false;
    }
    return true;
  }

  async function shutdown() {
    if (!await closeAllApps()) return;
    Shell.closeAll();
    state = 'off';
    sessionActive = false;
    ls().classList.remove('show', 'login');
    Store.flush();
    Sound.play('shutdown');
    showPower(spinner() + '<div class="ps-text">Завершение работы</div>');
    await sleep(Store.get('animations') ? 2000 : 500);
    showPower(`<div class="ps-off"><button class="ps-power" title="Включить">${Icons.ui('power', 36)}</button><span>Компьютер выключен. Нажмите, чтобы включить.</span></div>`);
    $('.ps-power', ps()).onclick = () => boot();
  }

  async function restart() {
    if (!await closeAllApps()) return;
    Shell.closeAll();
    state = 'off';
    sessionActive = false;
    ls().classList.remove('show', 'login');
    Store.flush();
    showPower(spinner() + '<div class="ps-text">Перезагрузка</div>');
    await sleep(Store.get('animations') ? 1800 : 400);
    showPower('');
    await sleep(500);
    boot();
  }

  async function signOut() {
    if (!await closeAllApps()) return;
    if (FX.web) { showPower(spinner() + '<div class="ps-text">Выход из учётной записи</div>'); Store.flush(); return FXWeb.logout(); }
    sessionActive = false;
    showPower(spinner() + '<div class="ps-text">Выход из системы</div>');
    await sleep(Store.get('animations') ? 1200 : 300);
    hidePower();
    lock(true);
    toLogin();
  }

  function sleepMode() {
    Shell.closeAll();
    lock(true);
    state = 'sleep';
    showPower('');
    ps().style.cursor = 'none';
    const wake = () => {
      removeEventListener('keydown', wake, true);
      ps().removeEventListener('pointerdown', wake);
      ps().style.cursor = '';
      hidePower();
      state = 'locked';
    };
    setTimeout(() => {
      addEventListener('keydown', wake, true);
      ps().addEventListener('pointerdown', wake);
    }, 600);
  }

  function init() {
    ls().addEventListener('click', e => { if (!e.target.closest('.ls-login, .ls-corner, button, input')) toLogin(); });
    addEventListener('keydown', e => { if (state === 'locked' && ls().classList.contains('show') && !ls().classList.contains('login')) { e.preventDefault(); toLogin(); } }, true);
    ls().addEventListener('contextmenu', e => e.preventDefault());
    ps().addEventListener('contextmenu', e => e.preventDefault());
  }

  return {
    init, boot, lock, unlock, shutdown, restart, signOut, sleep: sleepMode, hash,
    state: () => state,
    isLocked: () => state !== 'on',
  };
})();
