/* Monomach: вход через Windows App (RDP).
   Как это устроено на сервере (deploy/rdp/):
     Windows App ──RDP──▶ xrdp ──PAM──▶ rdp-auth ──▶ POST /api/rdp/auth (этот модуль проверяет имя и пароль)
                                │
                                └─▶ rdp-session: Chromium во весь экран → http://localhost:PORT/rdp/enter?t=<одноразовый ключ>
   Каждому пользователю сайта соответствует учётная запись Linux (имя для RDP), её создаёт rdp-sync
   (служба root) по списку rdp/users.json, который ведёт этот модуль. Пароль — тот же, что на сайте:
   он хранится только в базе Monomach, в Linux учётные записи без пароля. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RESERVED = /^(root|daemon|bin|sys|sync|games|man|lp|mail|news|uucp|proxy|www-data|backup|list|irc|gnats|nobody|messagebus|syslog|ubuntu|debian|admin|administrator|caddy|monomach|xrdp|sshd|polkitd|tss|uuidd|tcpdump|landscape|lxd|usbmux|dnsmasq|avahi|pulse|rtkit|colord|geoclue|chrony|ntp|postfix|mysql|postgres|redis|node|docker|guest|user|test|support|systemd-.*|_.*)$/;
const NAME_RE = /^[a-z][a-z0-9_-]{2,31}$/;
// имя, введённое в Windows App: может быть с заглавными (Arsen) — Linux различает регистр, поэтому для имени
// с заглавными буквами создаётся вторая учётная запись Linux (псевдоним), ведущая в тот же аккаунт сайта
const TYPED_RE = /^[A-Za-z][A-Za-z0-9_-]{2,31}$/;

module.exports = function (D) {
  const { db, CFG, A, json, readJSON, send, logEvent, setting, setSetting, ip } = D;
  const env = process.env;
  const R = {
    installed: env.RDP_ENABLED === '1',
    host: env.RDP_HOST || (() => { try { return new URL(env.PUBLIC_URL).hostname; } catch { return ''; } })(),
    port: +(env.RDP_PORT || 3389),
    dir: path.join(CFG.dataDir, 'rdp'),
  };

  // ---------- база: имя Linux для RDP и разрешение входа (NULL — как задано по умолчанию)
  const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!cols.includes('rdp_user')) db.exec('ALTER TABLE users ADD COLUMN rdp_user TEXT');
  if (!cols.includes('rdp')) db.exec('ALTER TABLE users ADD COLUMN rdp INTEGER');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_rdp_user ON users(rdp_user)');
  const scols = db.prepare('PRAGMA table_info(sessions)').all().map(c => c.name);
  if (!scols.includes('via')) db.exec('ALTER TABLE sessions ADD COLUMN via TEXT');

  fs.mkdirSync(R.dir, { recursive: true, mode: 0o700 });
  // общий секрет с rdp-auth (читает root)
  const secretFile = path.join(R.dir, 'secret');
  let SECRET;
  try { SECRET = fs.readFileSync(secretFile, 'utf8').trim(); } catch {}
  if (!SECRET) { SECRET = crypto.randomBytes(32).toString('base64url'); fs.writeFileSync(secretFile, SECRET + '\n', { mode: 0o600 }); }

  const enabled = () => R.installed && setting('rdp', 'on') === 'on';
  const maxSessions = () => Math.max(1, +setting('rdp_max', env.RDP_MAX_SESSIONS || 10));
  const allowedFor = u => !u.blocked && (u.rdp == null ? setting('rdp_default', 'on') === 'on' : u.rdp === 1);

  let systemNames = null;
  function systemName(n) {
    if (!systemNames) {
      systemNames = new Set();
      try { fs.readFileSync('/etc/passwd', 'utf8').split('\n').forEach(l => { const x = l.split(':'); if (x[0] && +x[2] < 1000) systemNames.add(x[0]); }); } catch {}
      setTimeout(() => { systemNames = null; }, 60e3).unref();
    }
    return systemNames.has(n);
  }

  /** Имя для RDP: имя на сайте в нижнем регистре (если оно годится для Linux), иначе mm<номер>. */
  function nameFor(u) {
    if (u.rdp_user) return u.rdp_user;
    let n = String(u.login).toLowerCase();
    const taken = x => !!db.prepare('SELECT 1 FROM users WHERE rdp_user=? AND id<>?').get(x, u.id);
    if (!NAME_RE.test(n) || RESERVED.test(n) || systemName(n) || taken(n)) n = 'mm' + u.id;
    if (taken(n)) n = 'mm' + u.id + '-' + crypto.randomBytes(2).toString('hex');
    db.prepare('UPDATE users SET rdp_user=? WHERE id=?').run(n, u.id);
    u.rdp_user = n;
    return n;
  }

  /** Псевдоним с заглавными буквами — как имя на сайте (Arsen), если основное имя — оно же маленькими буквами. */
  function aliasFor(u) {
    const n = nameFor(u);
    return TYPED_RE.test(u.login) && u.login !== n && u.login.toLowerCase() === n ? u.login : null;
  }

  // ---------- список учётных записей для rdp-sync (служба root создаёт и удаляет пользователей Linux)
  let syncT = null;
  function sync() {
    clearTimeout(syncT);
    syncT = setTimeout(() => {
      if (!R.installed) return;
      const list = db.prepare('SELECT id, login, rdp_user, rdp, blocked FROM users').all()
        .filter(u => u.login !== 'mac')
        .map(u => ({ u, name: nameFor(u) }))
        .filter(x => allowedFor(x.u))
        .flatMap(x => { const a = aliasFor(x.u); return [{ name: x.name, id: x.u.id }, ...(a ? [{ name: a, id: x.u.id, alias: true }] : [])]; });
      const f = path.join(R.dir, 'users.json');
      fs.writeFileSync(f + '.tmp', JSON.stringify({ updated: Date.now(), users: list }), { mode: 0o600 });
      fs.renameSync(f + '.tmp', f);
    }, 300);
  }
  if (R.installed) sync();

  // ---------- одноразовые ключи входа и живые сеансы
  const tickets = new Map();   // sha256(ключ) → { uid, name, exp }
  // ключ сеанса: повторный вход браузера, если он перезапустился внутри того же сеанса RDP (до «Выйти» или 24 ч)
  const sessionKeys = new Map(); // sha256(ключ) → { uid, name, exp }
  const dropKeys = name => { for (const [k, v] of sessionKeys) if (v.name === name) sessionKeys.delete(k); };
  const alive = new Map();     // имя → время последнего сигнала из сеанса
  const ending = new Set();    // имена сеансов, которые надо закрыть
  const ACTIVE_MS = 20e3;
  const activeNames = () => { const now = Date.now(); return [...alive].filter(([, t]) => now - t < ACTIVE_MS).map(([n]) => n); };
  setInterval(() => {
    const now = Date.now();
    for (const [k, t] of tickets) if (t.exp < now) tickets.delete(k);
    for (const [k, t] of sessionKeys) if (t.exp < now) sessionKeys.delete(k);
    for (const [n, t] of alive) if (now - t > 10 * 60e3) alive.delete(n);
  }, 60e3).unref();

  const limiter = new A.Limiter(8, 15 * 60e3);
  /** Запрос пришёл с этого же сервера напрямую, а не из Интернета через Caddy */
  const fromLocal = req => {
    const a = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    return (a === '127.0.0.1' || a === '::1') && !req.headers['x-forwarded-for'] && !req.headers['x-forwarded-proto'] && !req.headers['x-real-ip'];
  };
  const sameSecret = s => { const a = Buffer.from(String(s || '')), b = Buffer.from(SECRET); return a.length === b.length && crypto.timingSafeEqual(a, b); };

  /** PAM (rdp-auth): проверка имени и пароля из Windows App. */
  async function auth(req, res) {
    if (!fromLocal(req) || !sameSecret(req.headers['x-rdp-secret'])) return json(res, 403, { error: 'forbidden' });
    const b = await readJSON(req, 16e3);
    const typed = String(b.user || '').trim(), name = typed.toLowerCase(), pw = String(b.password || '');
    const keys = ['rdp:u:' + name, ...(b.rhost ? ['rdp:ip:' + String(b.rhost)] : [])];
    const meta = { id: null, login: name };
    const reqLike = { headers: { 'user-agent': 'Windows App (RDP)', 'x-forwarded-for': b.rhost || '' }, socket: req.socket };
    if (!enabled()) return json(res, 403, { error: 'Вход через RDP выключен.' });
    if (limiter.blocked(...keys)) { logEvent('rdp_login_fail', reqLike, meta, 'слишком много попыток'); return json(res, 429, { error: 'Слишком много попыток.' }); }
    let u = db.prepare('SELECT * FROM users WHERE rdp_user=?').get(name);
    // имя с заглавными принимается, только если для него создан псевдоним (Arsen → arsen)
    if (u && typed !== name && aliasFor(u) !== typed) u = null;
    if (!u || !A.checkPassword(pw, u.pass)) {
      limiter.fail(...keys);
      logEvent('rdp_login_fail', reqLike, u || meta, u ? 'неверный пароль' : 'нет такого пользователя');
      return json(res, 401, { error: 'Неверное имя или пароль.' });
    }
    if (u.blocked) { logEvent('login_blocked', reqLike, u, 'RDP'); return json(res, 403, { error: 'Учётная запись заблокирована.' }); }
    if (!allowedFor(u)) { logEvent('rdp_login_fail', reqLike, u, 'RDP запрещён'); return json(res, 403, { error: 'Вход через RDP для этой учётной записи выключен.' }); }
    const act = activeNames();
    if (!act.includes(name) && act.length >= maxSessions()) { logEvent('rdp_login_fail', reqLike, u, 'нет свободных мест'); return json(res, 503, { error: 'Все места для входа через RDP сейчас заняты. Попробуйте позже или войдите через браузер.' }); }
    limiter.reset(keys[0]);
    ending.delete(name);
    const t = A.newToken(), key = A.newToken();
    tickets.set(A.tokenId(t), { uid: u.id, name, exp: Date.now() + 5 * 60e3 });
    sessionKeys.set(A.tokenId(key), { uid: u.id, name, exp: Date.now() + 24 * 3600e3 });
    alive.set(name, Date.now());
    logEvent('rdp_auth', reqLike, u);
    json(res, 200, { ok: true, token: t, key });
  }

  /** Chromium в сеансе RDP: одноразовый ключ → обычный сеанс сайта (cookie) → рабочий стол. */
  function enter(req, res, url) {
    if (!fromLocal(req)) return send(res, 403, 'forbidden');
    let t;
    if (url.searchParams.has('k')) t = sessionKeys.get(A.tokenId(url.searchParams.get('k')));
    else { const k = A.tokenId(url.searchParams.get('t') || ''); t = tickets.get(k); tickets.delete(k); }
    if (!t || t.exp < Date.now()) return send(res, 403, 'Ключ входа устарел. Подключитесь заново.');
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(t.uid);
    if (!u || u.blocked) return send(res, 403, 'Учётная запись недоступна.');
    const tok = A.newToken(), now = Date.now();
    db.prepare("INSERT INTO sessions(token,kind,user_id,created,last_seen,ip,ua,via) VALUES(?,'user',?,?,?,?,?,'rdp')").run(A.tokenId(tok), u.id, now, now, 'RDP', 'Windows App (RDP)');
    db.prepare('UPDATE users SET last_login=?, last_seen=?, logins=logins+1 WHERE id=?').run(now, now, u.id);
    logEvent('login', { headers: { 'user-agent': 'Windows App (RDP)' }, socket: req.socket }, u, 'RDP');
    // localhost — без Secure: сеанс открыт только внутри сервера
    res.writeHead(302, { Location: '/', 'Set-Cookie': `mm_s=${encodeURIComponent(tok)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${CFG.sessionDays * 86400}`, 'Cache-Control': 'no-store' });
    res.end();
  }

  /** rdp-session спрашивает раз в несколько секунд: продолжать или закрыть сеанс. */
  function state(req, res, url) {
    if (!fromLocal(req)) return send(res, 403, 'forbidden');
    const typed = String(url.searchParams.get('user') || '');
    if (!TYPED_RE.test(typed)) return json(res, 400, { error: 'user' });
    const name = typed.toLowerCase();
    const end = ending.has(name) || !enabled();
    if (end) { ending.delete(name); alive.delete(name); dropKeys(name); } else alive.set(name, Date.now());
    json(res, 200, { end });
  }

  function info(u) {
    return { installed: R.installed, enabled: enabled(), allowed: allowedFor(u), host: R.host, port: R.port, user: R.installed ? nameFor(u) : null, session: u.via === 'rdp' };
  }

  /** Файл подключения для Windows App / «Подключения к удалённому рабочему столу». */
  function rdpFile(u) {
    const addr = R.port === 3389 ? R.host : `${R.host}:${R.port}`;
    return [
      `full address:s:${addr}`,
      `username:s:${nameFor(u)}`,
      'prompt for credentials:i:1',
      // xrdp проверяет пароль сам (экран входа или данные из Windows App) — без NLA/CredSSP
      'enablecredsspsupport:i:0',
      'authentication level:i:0',
      'screen mode id:i:2',
      'use multimon:i:0',
      'dynamic resolution:i:1',
      'smart sizing:i:1',
      'session bpp:i:24',
      'redirectclipboard:i:1',
      'audiomode:i:2',
      'redirectprinters:i:0',
      'redirectsmartcards:i:0',
      'drivestoredirect:s:',
      'autoreconnection enabled:i:1',
      `alternate shell:s:`,
      `remoteapplicationname:s:${CFG.siteName}`,
      '',
    ].join('\r\n');
  }

  /** Маршруты. Возвращает true, если запрос обработан. */
  async function handle(req, res, p, url, getUser) {
    if (p === '/api/rdp/auth' && req.method === 'POST') { await auth(req, res); return true; }
    if (p === '/rdp/enter') { enter(req, res, url); return true; }
    if (p === '/api/rdp/state') { state(req, res, url); return true; }
    if (!p.startsWith('/api/rdp/')) return false;
    const u = getUser(req);
    if (!u) { json(res, 401, { err: 'EAUTH', error: 'Требуется вход' }); return true; }
    if (u.session && u.session !== 'local') u.via = (db.prepare('SELECT via FROM sessions WHERE token=?').get(u.session) || {}).via;
    if (p === '/api/rdp/info') { json(res, 200, info(u)); return true; }
    if (p === '/api/rdp/file') {
      if (!R.installed) { json(res, 404, { error: 'RDP не установлен на сервере' }); return true; }
      res.writeHead(200, { 'Content-Type': 'application/x-rdp; charset=utf-8', 'Content-Disposition': `attachment; filename="${encodeURIComponent(CFG.siteName)}.rdp"`, 'Cache-Control': 'no-store' });
      res.end(rdpFile(u));
      return true;
    }
    if (p === '/api/rdp/end' && req.method === 'POST') {
      // «Завершить сеанс» из рабочего стола внутри RDP
      if (u.rdp_user) { ending.add(u.rdp_user); dropKeys(u.rdp_user); }
      if (u.via === 'rdp') db.prepare('DELETE FROM sessions WHERE token=?').run(u.session);
      logEvent('rdp_end', req, u);
      json(res, 200, { ok: true });
      return true;
    }
    json(res, 404, { error: 'not found' });
    return true;
  }

  // ---------- для панели администратора
  const admin = {
    status: () => ({ installed: R.installed, enabled: setting('rdp', 'on') === 'on', host: R.host, port: R.port, max: maxSessions(), defaultAllow: setting('rdp_default', 'on') === 'on', active: activeNames() }),
    settings(b) {
      if (b.rdp) setSetting('rdp', b.rdp === 'off' ? 'off' : 'on');
      if (b.rdpMax) setSetting('rdp_max', Math.max(1, Math.min(1000, Math.round(+b.rdpMax) || 1)));
      if (b.rdpDefault) setSetting('rdp_default', b.rdpDefault === 'off' ? 'off' : 'on');
      sync();
    },
    userRow: u => ({ rdpUser: u.rdp_user || null, rdp: allowedFor(u), rdpActive: !!u.rdp_user && activeNames().includes(u.rdp_user) }),
    setAllowed(id, on) { db.prepare('UPDATE users SET rdp=? WHERE id=?').run(on ? 1 : 0, id); sync(); },
    end(id) { const u = db.prepare('SELECT rdp_user FROM users WHERE id=?').get(id); if (u && u.rdp_user) { ending.add(u.rdp_user); dropKeys(u.rdp_user); } },
    changed: sync,
  };

  return { handle, admin, nameFor, sync, installed: R.installed };
};
