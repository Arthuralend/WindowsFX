/* Monomach: подключение дисков пользователем — Яндекс Диск, Облако Mail.ru, Google Диск, WebDAV, папка компьютера.
   Окно «Подключить диск», раздел в Параметрах, пункты в Проводнике. Подключается перед js/main.js. */
'use strict';

const WebDisks = (() => {
  const KIND = { cloud: 'iCloud Drive', volume: 'Внешний диск', disk: FX.mac ? 'Домашняя папка Mac' : 'Личный диск на сервере', yandex: 'Яндекс Диск', mailru: 'Облако Mail.ru', gdrive: 'Google Диск', webdav: 'Сетевой диск WebDAV', local: 'Папка этого компьютера' };
  const ICON = { yandex: 'drive-cloud-y', mailru: 'drive-cloud-m', gdrive: 'drive-cloud-g', webdav: 'drive-net', local: 'drive-local' };
  const HELP = {
    yandex: `<b>Как получить пароль приложения:</b> откройте <a href="https://id.yandex.ru/security/app-passwords" target="_blank" rel="noopener">Яндекс ID → Безопасность → Пароли приложений</a>, выберите «Файлы» (WebDAV), придумайте название и скопируйте пароль. Логин — ваш логин Яндекса (без @yandex.ru).`,
    mailru: `<b>Как получить пароль приложения:</b> в <a href="https://account.mail.ru/user/2-step-auth/passwords/" target="_blank" rel="noopener">Mail ID → Безопасность → Пароли для внешних приложений</a> создайте пароль с доступом «Облако / WebDAV». Логин — полный адрес почты (например, ivan@mail.ru).`,
    webdav: 'Подходит любой сервер WebDAV: Nextcloud, ownCloud, Synology, 4shared, pCloud и др. Адрес можно найти в настройках сервиса (например, https://cloud.example.ru/remote.php/dav/files/ivan/).',
  };
  let cache = { mounts: [], google: false, at: 0 };

  async function api(p, body) {
    const r = await fetch('/api/cloud/' + p, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' } : { credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw Object.assign(new Error(j.error || 'Ошибка ' + r.status), { field: j.field });
    return j;
  }
  async function refresh() { const j = await api('list'); cache = { ...j, at: Date.now() }; return j; }

  const rootOf = d => (FS.devices()[d.letter] || {}).root || '';
  const isCloud = d => /^\/cloud\//.test(rootOf(d));
  const isLocal = d => /^\/local\//.test(rootOf(d));
  const idOf = d => rootOf(d).split('/')[2];

  function remounted(letter) {
    FS.remount();
    if (letter) setTimeout(() => Apps.launch('explorer', { path: letter }), 150);
  }

  // ---------- окно «Подключить диск»
  function add() {
    refresh().catch(() => {});
    const box = h(`<div class="wd-pick">
      ${[['yandex', 'Яндекс Диск', 'По паролю приложения Яндекса'], ['mailru', 'Облако Mail.ru', 'По паролю для внешних приложений'], ['gdrive', 'Google Диск', 'Вход через аккаунт Google'], ['webdav', 'WebDAV', 'Nextcloud, Synology и другие'], ['local', 'Папка компьютера', 'Документы, Рабочий стол или любая папка']]
        .map(([k, n, d]) => `<button class="wd-card" data-k="${k}">${Icons.get(ICON[k], 40)}<span><b>${n}</b><small>${d}</small></span></button>`).join('')}
    </div>`);
    let closeDlg = null;
    const p = UI.dialog({ title: 'Подключить диск', appIcon: 'thispc', content: box, wide: true, buttons: [{ label: 'Отмена', value: null, cancel: true }] });
    setTimeout(() => { closeDlg = () => document.querySelector('.wd-pick')?.closest('.dlg')?.querySelector('.dlg-x')?.click(); }, 0);
    if (!window.LocalDisks || !LocalDisks.supported) {
      const c = $('[data-k="local"]', box);
      c.classList.add('off');
      $('small', c).textContent = 'Нужен Chrome, Edge, Яндекс Браузер или Opera на компьютере';
    }
    box.addEventListener('click', e => {
      const c = e.target.closest('.wd-card');
      if (!c || c.classList.contains('off')) return;
      const k = c.dataset.k;
      if (k === 'local') {
        // окно выбора папки должно открыться прямо по нажатию
        LocalDisks.add().then(d => { closeDlg && closeDlg(); UI.notify({ title: `Папка «${d.label}» подключена как диск ${d.letter}`, body: 'Файлы остаются на вашем компьютере и на сервер не загружаются.', app: 'explorer', transient: true }); remounted(d.letter); })
          .catch(err => { if (err && err.name !== 'AbortError') UI.alert('Папка компьютера', err.message || String(err), 'error'); });
        return;
      }
      closeDlg && closeDlg();
      if (k === 'gdrive') return google();
      setTimeout(() => form(k), 160);
    });
    return p;
  }

  function google() {
    const go = () => {
      const w = window.open('/api/cloud/google/start', 'mm-google', 'width=520,height=680');
      if (!w) { location.href = '/api/cloud/google/start'; return; }
      const on = e => {
        if (e.origin !== location.origin || !e.data || !('monomachCloud' in e.data)) return;
        removeEventListener('message', on);
        if (e.data.monomachCloud) refresh().then(j => { const m = j.mounts.filter(x => x.kind === 'gdrive').pop(); remounted(m && m.letter); });
      };
      addEventListener('message', on);
    };
    refresh().then(j => {
      if (!j.google) return UI.alert('Google Диск', 'Вход через Google ещё не включён администратором сайта. Пока можно подключить Яндекс Диск, Облако Mail.ru или WebDAV.', 'info');
      go();
    }).catch(e => UI.alert('Google Диск', e.message, 'error'));
  }

  async function form(kind, vals = {}) {
    const box = h(`<div class="wd-form">
      ${kind === 'webdav' ? '<label>Адрес сервера<input class="input" name="url" placeholder="https://cloud.example.ru/remote.php/dav/files/ivan/" autocomplete="url"></label>' : ''}
      <label>${kind === 'mailru' ? 'Адрес почты' : 'Логин'}<input class="input" name="username" autocomplete="username" placeholder="${kind === 'mailru' ? 'ivan@mail.ru' : kind === 'yandex' ? 'ivan.petrov' : ''}"></label>
      <label>${kind === 'webdav' ? 'Пароль' : 'Пароль приложения'}<input class="input" name="password" type="password" autocomplete="new-password"></label>
      <label><div>Название диска <span class="muted">(необязательно)</span></div><input class="input" name="label" placeholder="${{ yandex: 'Яндекс Диск', mailru: 'Облако Mail.ru', webdav: 'Мой сервер' }[kind]}" maxlength="40"></label>
      <div class="wd-help">${HELP[kind]}</div>
      <div class="wd-note">Пароль хранится на сервере Monomach в зашифрованном виде и используется только для доступа к вашему диску. Отключить диск можно в любой момент.</div>
    </div>`);
    for (const [k, v] of Object.entries(vals)) { const i = box.querySelector(`[name="${k}"]`); if (i) i.value = v; }
    const r = await UI.dialog({
      title: 'Подключить: ' + KIND[kind], appIcon: ICON[kind], content: box, wide: true, sound: false,
      buttons: [{ label: 'Подключить', value: 'ok', primary: true }, { label: 'Отмена', value: null, cancel: true }],
      validate: () => {
        const v = n => box.querySelector(`[name="${n}"]`)?.value.trim();
        if (kind === 'webdav' && !v('url')) return 'Укажите адрес сервера.';
        if (!v('username')) return 'Укажите логин.';
        if (!box.querySelector('[name="password"]').value) return 'Укажите пароль.';
        return null;
      },
    });
    if (r.button !== 'ok') return;
    const data = { kind };
    box.querySelectorAll('input').forEach(i => { data[i.name] = i.name === 'password' ? i.value : i.value.trim(); });
    UI.notify({ title: 'Подключение диска…', body: KIND[kind], icon: 'upload', transient: true, silent: true });
    try {
      const j = await api('add', data);
      UI.notify({ title: `${j.mount.label} подключён как диск ${j.mount.letter}`, body: 'Диск доступен в Проводнике и сохранится в вашей учётной записи.', app: 'explorer', transient: true });
      remounted(j.mount.letter);
    } catch (e) {
      const { password, ...keep } = data;
      await UI.alert('Не удалось подключить диск', e.message, 'error');
      form(kind, keep);
    }
  }

  // ---------- отключение и переименование
  async function remove(d) {
    const local = isLocal(d);
    if (!await UI.confirm('Отключить диск', `Отключить «${d.label}» (${d.letter})?\n${local ? 'Сама папка и файлы на компьютере останутся.' : 'Файлы в облаке не удаляются — диск просто исчезнет из Monomach.'}`, { ok: 'Отключить' })) return;
    try {
      if (local) await LocalDisks.remove(idOf(d));
      else await api('remove', { id: idOf(d) });
      remounted();
    } catch (e) { UI.alert('Отключить диск', e.message, 'error'); }
  }
  async function rename(d) {
    const name = await UI.prompt('Переименовать диск', 'Название диска', d.label, { validate: v => (v.trim() ? null : 'Введите название') });
    if (!name) return;
    try {
      if (isLocal(d)) LocalDisks.rename(idOf(d), name.trim());
      else await api('rename', { id: idOf(d), label: name.trim() });
      remounted();
    } catch (e) { UI.alert('Переименовать диск', e.message, 'error'); }
  }

  // ---------- раздел «Диски» в Параметрах
  function settings(pg, { sec, row, btn }) {
    const s = sec('Подключённые диски');
    const fill = () => {
      s.querySelectorAll('.st-row, .wd-empty').forEach(x => x.remove());
      const ds = FS.drives().filter(d => d.device && (isCloud(d) || isLocal(d)));
      if (!ds.length) s.append(h('<div class="wd-empty muted small" style="padding:6px 4px 10px">Пока ни одного — подключите облако или папку компьютера.</div>'));
      for (const d of ds) {
        const m = cache.mounts.find(x => x.id === idOf(d));
        const sub = KIND[d.kind] + (m && m.username ? ' · ' + m.username : '') + (isLocal(d) ? ' · только в этом браузере' : '');
        const r = row('hdd', `${esc(d.label)} (${d.letter})`, esc(sub), [btn('Открыть', () => Apps.launch('explorer', { path: d.letter }), 'sm'), btn('Отключить', () => remove(d), 'sm')]);
        const ic = r.querySelector('.st-ic');
        if (ic && ICON[d.kind]) ic.innerHTML = Icons.get(ICON[d.kind], 22);
        s.append(r);
      }
      s.append(row('plus', 'Подключить диск', 'Яндекс Диск, Облако Mail.ru, Google Диск, WebDAV или папка компьютера', btn('Подключить', add)));
    };
    fill();
    refresh().then(fill).catch(() => {});
    const off = FS.on('change', e => { if (e && e.drives && s.isConnected) fill(); else if (!s.isConnected) off && off(); });
    pg.append(s);
  }

  return { add, remove, rename, settings, refresh, kindName: k => KIND[k] || '', removable: d => !!d && (isCloud(d) || isLocal(d)), google };
})();
