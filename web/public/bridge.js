/* Monomach: мост рабочего стола в браузере.
   1) Загружает профиль пользователя с сервера в localStorage и отправляет на сервер каждое изменение —
      настройки, рабочий стол, Напоминания, Дела и т. д. сохраняются в учётной записи.
   2) Создаёт window.FXNative: файловые операции выполняет сервер (личный диск и облачные диски). */
(() => {
  'use strict';
  const LS = window.localStorage;
  const S = Storage.prototype;
  const oSet = S.setItem, oRem = S.removeItem;
  const tracked = k => typeof k === 'string' && (k.startsWith('w12.') || k.startsWith('app.'));

  function toLogin() { try { location.replace('/login'); } catch {} throw new Error('Требуется вход'); }

  // ---------- 1. профиль
  const x = new XMLHttpRequest();
  x.open('GET', '/api/profile', false);
  x.send();
  if (x.status === 401) toLogin();
  let prof;
  try { prof = JSON.parse(x.responseText); } catch { prof = { data: {} }; }

  Object.keys(LS).filter(k => tracked(k)).forEach(k => oRem.call(LS, k));
  for (const [k, v] of Object.entries(prof.data || {})) if (tracked(k)) { try { oSet.call(LS, k, v); } catch (e) { console.warn('profile', k, e); } }
  oSet.call(LS, 'mm.owner', prof.login || '');

  let pend = { set: {}, del: new Set() };
  let timer = null, inflight = false;
  const empty = () => !Object.keys(pend.set).length && !pend.del.size;
  function take() { const b = { set: pend.set, del: [...pend.del] }; pend = { set: {}, del: new Set() }; return b; }
  function schedule(ms = 900) { clearTimeout(timer); timer = setTimeout(flush, ms); }
  async function flush() {
    if (inflight) return schedule(500);
    if (empty()) return;
    const body = take();
    inflight = true;
    try {
      const r = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
      if (r.status === 401) return toLogin();
      if (!r.ok) throw new Error('HTTP ' + r.status);
      setState('saved');
    } catch (e) {
      // вернуть в очередь, если новых значений по тем же ключам не появилось
      for (const [k, v] of Object.entries(body.set)) if (!(k in pend.set) && !pend.del.has(k)) pend.set[k] = v;
      for (const k of body.del) if (!(k in pend.set)) pend.del.add(k);
      setState('error');
      schedule(5000);
    } finally { inflight = false; }
  }
  function flushNow() {
    if (empty()) return;
    const body = JSON.stringify(take());
    if (!(navigator.sendBeacon && body.length < 60000 && navigator.sendBeacon('/api/profile', new Blob([body], { type: 'application/json' })))) {
      try { const r = new XMLHttpRequest(); r.open('PUT', '/api/profile', false); r.setRequestHeader('Content-Type', 'application/json'); r.send(body); } catch {}
    }
  }
  let state = 'saved';
  const stateFns = [];
  function setState(s) { if (s !== state) { state = s; stateFns.forEach(f => { try { f(s); } catch {} }); } }

  S.setItem = function (k, v) {
    oSet.call(this, k, v);
    if (this === LS && tracked(k)) { pend.set[k] = String(v); pend.del.delete(k); setState('pending'); schedule(); }
  };
  S.removeItem = function (k) {
    oRem.call(this, k);
    if (this === LS && tracked(k)) { delete pend.set[k]; pend.del.add(k); setState('pending'); schedule(); }
  };
  addEventListener('pagehide', flushNow);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNow(); });

  // ---------- 2. FXNative
  function rpc(name, args) {
    const r = new XMLHttpRequest();
    r.open('POST', '/native/' + name, false);
    r.setRequestHeader('Content-Type', 'application/json');
    r.send(JSON.stringify(args));
    if (r.status === 401) toLogin();
    if (r.status !== 200) return JSON.stringify({ err: 'EIO', msg: 'Сервер недоступен (' + r.status + ')' });
    return r.responseText;
  }
  const OK = v => JSON.stringify({ ok: v === undefined ? true : v });
  const SERVER = ['info', 'hasAccess', 'requestAccess', 'roots', 'stat', 'list', 'readText', 'readBase64', 'writeText', 'writeBase64', 'writeChunk',
    'mkdir', 'rename', 'remove', 'copy', 'move', 'trash', 'untrash', 'purge', 'search', 'usage'];
  const N = { __web: true };
  SERVER.forEach(n => { N[n] = (...a) => rpc(n, a); });

  const enc = p => p.split('/').map(encodeURIComponent).join('/');
  const emit = (n, d) => setTimeout(() => { try { window.FXHost && FXHost.emit(n, d); } catch (e) { console.error(e); } }, 0);
  function download(np) {
    const a = document.createElement('a');
    a.href = '/fs' + enc(np) + '?download=1';
    a.download = np.split('/').pop();
    document.body.appendChild(a); a.click(); a.remove();
  }

  /** Загрузка файлов с компьютера в папку диска */
  async function upload(files, destDir) {
    for (const f of files) {
      const np = destDir.replace(/\/$/, '') + '/' + f.name;
      try {
        const r = await fetch('/api/upload?path=' + encodeURIComponent(np), { method: 'PUT', body: f, credentials: 'same-origin' });
        const j = await r.json().catch(() => ({}));
        if (j.err) emit('imported', { error: (j.msg || 'Не удалось загрузить') + ': ' + f.name });
        else emit('imported', { path: np });
      } catch (e) { emit('imported', { error: 'Не удалось загрузить ' + f.name }); }
    }
  }
  Object.assign(N, {
    importDocument(mime, destDir) {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.multiple = true;
      if (mime && mime !== '*/*') inp.accept = mime;
      inp.onchange = () => upload([...inp.files], destDir);
      inp.click();
      return OK();
    },
    openExternal(np) { download(np); return OK(); },
    share(np) { download(np); return OK(); },
    launchUrl(url) { window.open(url, '_blank', 'noopener'); return OK(); },
    toast(msg) { emit('toast', { msg }); return OK(); },
    vibrate(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch {} return OK(); },
    immersive() { return OK(); },
  });

  // Напоминания: уведомления браузера, пока открыта вкладка
  const alarms = new Map();
  Object.assign(N, {
    notifyPermission() { try { window.Notification && Notification.permission === 'default' && Notification.requestPermission(); } catch {} return OK(); },
    notifySchedule(id, at, title, body) {
      clearTimeout(alarms.get(id));
      const ms = at - Date.now();
      if (ms > 2 ** 31 - 1) return OK(false);
      alarms.set(id, setTimeout(() => {
        alarms.delete(id);
        try { if (window.Notification && Notification.permission === 'granted') { const n = new Notification(title, { body, tag: id, icon: '/web/icon.svg' }); n.onclick = () => { focus(); emit('reminder', { id }); n.close(); }; } } catch {}
      }, Math.max(0, ms)));
      return OK(true);
    },
    notifyCancel(id) { clearTimeout(alarms.get(id)); alarms.delete(id); return OK(); },
  });
  window.FXNative = N;

  // ---------- 3. учётная запись
  window.FXWeb = {
    login: prof.login || '',
    site: 'Monomach',
    upload,
    flush: () => { flushNow(); },
    syncState: () => state,
    onSync(f) { stateFns.push(f); },
    async logout() {
      flushNow();
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
      Object.keys(LS).filter(k => tracked(k)).forEach(k => oRem.call(LS, k));
      location.replace('/login');
    },
    async changePassword(old, password) {
      const r = await fetch('/api/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ old, password }), credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Не удалось сменить пароль');
      return true;
    },
    async me() { const r = await fetch('/api/me', { credentials: 'same-origin' }); return r.json(); },
  };
})();
