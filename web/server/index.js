/* Monomach.ru — «Режим эффективной работы».
   Сервер: регистрация и вход, личный диск пользователя, сохранение профиля, мост рабочего стола,
   панель администратора. Запуск: node index.js (Node.js 22+). Настройки — переменные окружения (см. README). */
'use strict';
const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { open } = require('./db');
const A = require('./auth');
const { UserSpace, API } = require('./native');
const { err } = require('./localdisk');

const env = process.env;
const ROOT = path.resolve(__dirname, '..');
const CFG = {
  port: +(env.PORT || 8080),
  host: env.HOST || '0.0.0.0',
  dataDir: path.resolve(env.DATA_DIR || path.join(ROOT, 'data')),
  assets: path.resolve(env.ASSETS_DIR || path.join(ROOT, '..', 'app', 'src', 'main', 'assets')),
  pub: path.join(ROOT, 'public'),
  quota: +(env.DEFAULT_QUOTA_MB || 1024) * 1024 * 1024,
  secureCookies: env.SECURE_COOKIES ? env.SECURE_COOKIES === '1' : null,   // null = по X-Forwarded-Proto
  trustProxy: env.TRUST_PROXY !== '0',
  siteName: env.SITE_NAME || 'Monomach',
  version: require(path.join(ROOT, 'package.json')).version,
  sessionDays: 30,
  // Monomach для Mac: один пользователь, вход по секретному ключу программы, диск D: — домашняя папка Mac
  local: env.LOCAL_MODE === '1',
  localToken: env.LOCAL_TOKEN || '',
  localHome: env.LOCAL_HOME || os.homedir(),
};
if (CFG.local && CFG.localToken.length < 16) { console.error('LOCAL_MODE требует LOCAL_TOKEN'); process.exit(1); }

const db = open(CFG.dataDir);
const setting = (k, def) => { const r = db.prepare('SELECT v FROM settings WHERE k=?').get(k); return r ? r.v : def; };
const setSetting = (k, v) => db.prepare('INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, String(v));

// ---------- ключ шифрования паролей облачных дисков
let secret = env.SECRET_KEY || setting('secret_key');
if (!secret) { secret = crypto.randomBytes(32).toString('base64'); setSetting('secret_key', secret); }
const box = A.cipher(secret);

// ---------- учётная запись администратора
(function initAdmin() {
  if (CFG.local) return;
  // ADMIN_LOGIN/ADMIN_PASSWORD задают администратора при первом запуске; ADMIN_RESET=1 — сбросить пароль из настроек
  if (env.ADMIN_LOGIN && env.ADMIN_PASSWORD) {
    if (!setting('admin_login') || env.ADMIN_RESET === '1') {
      setSetting('admin_login', env.ADMIN_LOGIN);
      setSetting('admin_pass', A.hashPassword(env.ADMIN_PASSWORD));
    }
  } else if (!setting('admin_login')) {
    const pw = crypto.randomBytes(9).toString('base64url');
    setSetting('admin_login', 'admin');
    setSetting('admin_pass', A.hashPassword(pw));
    const f = path.join(CFG.dataDir, 'admin-password.txt');
    fs.writeFileSync(f, `Панель администратора: /admin\nЛогин: admin\nПароль: ${pw}\nСмените пароль в панели и удалите этот файл.\n`, { mode: 0o600 });
    console.log(`[monomach] создан администратор admin, пароль записан в ${f}`);
  }
})();

const ctx = { db, dataDir: CFG.dataDir, version: CFG.version, usage: new Map(), dirtyUsage: new Set(), clouds: null, box, local: CFG.local ? { home: CFG.localHome } : null };
try { ctx.clouds = require('./clouds').init(ctx); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') console.error(e); }
setInterval(() => {
  for (const id of ctx.dirtyUsage) { const c = ctx.usage.get(id); if (c) db.prepare('UPDATE users SET used=? WHERE id=?').run(c.used, id); }
  ctx.dirtyUsage.clear();
}, 5000).unref();

// ---------- журнал
function logEvent(type, req, user, detail) {
  db.prepare('INSERT INTO events(ts,type,user_id,login,ip,ua,detail) VALUES(?,?,?,?,?,?,?)')
    .run(Date.now(), type, user ? user.id ?? null : null, user ? user.login ?? null : null, req ? ip(req) : null, req ? String(req.headers['user-agent'] || '').slice(0, 300) : null, detail ? String(detail).slice(0, 500) : null);
}
// старые записи журнала (старше года) удаляются раз в сутки
setInterval(() => db.prepare('DELETE FROM events WHERE ts < ?').run(Date.now() - 365 * 864e5), 864e5).unref();

// ---------- HTTP-утилиты
function ip(req) {
  if (CFG.trustProxy) {
    const f = req.headers['x-forwarded-for'];
    if (f) return String(f).split(',')[0].trim();
    if (req.headers['x-real-ip']) return String(req.headers['x-real-ip']);
  }
  return (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}
const isHttps = req => CFG.secureCookies ?? (req.headers['x-forwarded-proto'] === 'https' || !!req.socket.encrypted);
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', wasm: 'application/wasm', json: 'application/json', pdf: 'application/pdf', txt: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', bcmap: 'application/octet-stream', pfb: 'application/octet-stream', wcaff: 'application/octet-stream', data: 'application/octet-stream', xml: 'application/xml' };
const mime = p => MIME[path.extname(p).slice(1).toLowerCase()] || 'application/octet-stream';
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN' };

function send(res, code, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...SEC, ...extra });
  res.end(body);
}
const json = (res, code, obj, extra) => send(res, code, JSON.stringify(obj), 'application/json; charset=utf-8', extra);
function readBody(req, limit = 64 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { reject(err('EFBIG')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJSON(req, limit) { const b = await readBody(req, limit); try { return JSON.parse(b.toString('utf8') || '{}'); } catch { return {}; } }

function cookie(res, req, name, value, maxAgeSec) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (isHttps(req)) parts.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(Array.isArray(prev) ? prev : prev ? [prev] : []), parts.join('; ')]);
}

/** Отдача файла с поддержкой Range (видео, музыка, PDF) */
async function sendFile(req, res, file, opts = {}) {
  const st = await fsp.stat(file).catch(() => null);
  if (!st || !st.isFile()) return send(res, 404, 'not found');
  return sendStream(req, res, { size: st.size, mtime: st.mtimeMs, stream: (s, e) => fs.createReadStream(file, { start: s, end: e }) }, opts.type || mime(file), opts);
}
function sendStream(req, res, f, type, opts = {}) {
  const h = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Last-Modified': new Date(f.mtime).toUTCString(), 'Cache-Control': opts.cache || 'no-cache', ...SEC };
  if (opts.download) h['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(opts.download)}`;
  const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (r && f.size) {
    let start = r[1] === '' ? f.size - +r[2] : +r[1];
    let end = r[1] === '' || r[2] === '' ? f.size - 1 : Math.min(+r[2], f.size - 1);
    if (start < 0) start = 0;
    if (start > end || start >= f.size) { res.writeHead(416, { 'Content-Range': `bytes */${f.size}` }); return res.end(); }
    res.writeHead(206, { ...h, 'Content-Range': `bytes ${start}-${end}/${f.size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    return f.stream(start, end).pipe(res);
  }
  res.writeHead(200, { ...h, 'Content-Length': f.size });
  if (req.method === 'HEAD' || !f.size) return res.end();
  f.stream(0, f.size - 1).pipe(res);
}

// ---------- сессии
const seenAt = new Map();
function getSession(req, kind) {
  const c = A.parseCookies(req.headers.cookie)[kind === 'admin' ? 'mm_a' : 'mm_s'];
  if (!c) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token=? AND kind=?').get(A.tokenId(c), kind);
  if (!s) return null;
  const now = Date.now();
  const ttl = kind === 'admin' ? 12 * 3600e3 : CFG.sessionDays * 864e5;
  if (now - s.last_seen > ttl) { db.prepare('DELETE FROM sessions WHERE token=?').run(s.token); return null; }
  if (now - (seenAt.get(s.token) || 0) > 60e3) {
    seenAt.set(s.token, now);
    db.prepare('UPDATE sessions SET last_seen=?, ip=? WHERE token=?').run(now, ip(req), s.token);
    if (s.user_id) db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(now, s.user_id);
  }
  return s;
}
let localUser = null;
function getLocalUser(req) {
  if (A.parseCookies(req.headers.cookie).mm_l !== CFG.localToken) return null;
  if (!localUser) {
    let u = db.prepare('SELECT * FROM users WHERE login=?').get('mac');
    if (!u) {
      const now = Date.now();
      const r = db.prepare('INSERT INTO users(login,pass,created,last_login,last_seen,logins,quota) VALUES(?,?,?,?,?,0,0)').run('mac', '-', now, now, now);
      db.prepare('INSERT INTO profiles(user_id,data,updated) VALUES(?,?,?)').run(Number(r.lastInsertRowid), JSON.stringify({ 'w12.settings': JSON.stringify({ userName: env.LOCAL_USER || os.userInfo().username, deviceName: 'MAC' }) }), now);
      u = db.prepare('SELECT * FROM users WHERE login=?').get('mac');
    }
    localUser = u;
  }
  return { ...localUser, session: 'local' };
}
function getUser(req) {
  if (CFG.local) return getLocalUser(req);
  const s = getSession(req, 'user');
  if (!s) return null;
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(s.user_id);
  if (!u || u.blocked) return null;
  u.session = s.token;
  return u;
}
function startSession(req, res, kind, userId) {
  const t = A.newToken();
  const now = Date.now();
  db.prepare('INSERT INTO sessions(token,kind,user_id,created,last_seen,ip,ua) VALUES(?,?,?,?,?,?,?)').run(A.tokenId(t), kind, userId ?? null, now, now, ip(req), String(req.headers['user-agent'] || '').slice(0, 300));
  cookie(res, req, kind === 'admin' ? 'mm_a' : 'mm_s', t, kind === 'admin' ? 12 * 3600 : CFG.sessionDays * 86400);
}
setInterval(() => {
  db.prepare("DELETE FROM sessions WHERE (kind='user' AND last_seen < ?) OR (kind='admin' AND last_seen < ?)").run(Date.now() - CFG.sessionDays * 864e5, Date.now() - 12 * 3600e3);
}, 3600e3).unref();

const spaces = new Map();
function space(u) {
  let s = spaces.get(u.id);
  if (!s) { s = new UserSpace(ctx, u); spaces.set(u.id, s); }
  s.user = u;
  return s;
}

// ---------- регистрация и вход
const limiter = new A.Limiter(8, 15 * 60e3);
const regLimiter = new A.Limiter(5, 60 * 60e3);
const LOGIN_RE = /^[A-Za-zА-Яа-яЁё0-9][A-Za-zА-Яа-яЁё0-9_.\-]{2,31}$/;

function defaultProfile(login) {
  return { 'w12.settings': JSON.stringify({ userName: login, deviceName: CFG.siteName.toUpperCase() }) };
}

async function apiRegister(req, res) {
  const b = await readJSON(req, 64e3);
  const login = String(b.login || '').trim(), pw = String(b.password || '');
  if (setting('registration', 'open') !== 'open') return json(res, 403, { error: 'Регистрация временно закрыта.' });
  if (regLimiter.blocked('ip:' + ip(req))) return json(res, 429, { error: 'Слишком много регистраций с этого адреса. Попробуйте позже.' });
  if (!LOGIN_RE.test(login)) return json(res, 400, { error: 'Имя: от 3 до 32 символов — буквы, цифры, точка, дефис или подчёркивание; начинается с буквы или цифры.', field: 'login' });
  if (pw.length < 8) return json(res, 400, { error: 'Пароль должен быть не короче 8 символов.', field: 'password' });
  if (pw.length > 200) return json(res, 400, { error: 'Слишком длинный пароль.', field: 'password' });
  if (/^(admin|administrator|root|support|monomach|администратор)$/i.test(login)) return json(res, 400, { error: 'Это имя зарезервировано.', field: 'login' });
  if (db.prepare('SELECT 1 FROM users WHERE login=?').get(login)) return json(res, 409, { error: 'Это имя уже занято.', field: 'login' });
  const now = Date.now();
  const quota = +setting('default_quota', CFG.quota);
  const r = db.prepare('INSERT INTO users(login,pass,created,last_login,last_seen,last_ip,last_ua,logins,quota) VALUES(?,?,?,?,?,?,?,1,?)')
    .run(login, A.hashPassword(pw), now, now, now, ip(req), String(req.headers['user-agent'] || '').slice(0, 300), quota);
  const id = Number(r.lastInsertRowid);
  db.prepare('INSERT INTO profiles(user_id,data,updated) VALUES(?,?,?)').run(id, JSON.stringify(defaultProfile(login)), now);
  regLimiter.fail('ip:' + ip(req));
  const u = { id, login };
  logEvent('register', req, u);
  logEvent('login', req, u);
  startSession(req, res, 'user', id);
  json(res, 200, { ok: true, login });
}

async function apiLogin(req, res) {
  const b = await readJSON(req, 64e3);
  const login = String(b.login || '').trim(), pw = String(b.password || '');
  const keys = ['ip:' + ip(req), 'u:' + login.toLowerCase()];
  if (limiter.blocked(...keys)) return json(res, 429, { error: `Слишком много неудачных попыток. Попробуйте через ${limiter.retryAfter(...keys)} мин.` });
  const u = db.prepare('SELECT * FROM users WHERE login=?').get(login);
  if (!u || !A.checkPassword(pw, u.pass)) {
    limiter.fail(...keys);
    logEvent('login_fail', req, u ? u : { login }, u ? 'неверный пароль' : 'нет такого пользователя');
    return json(res, 401, { error: 'Неверное имя или пароль.' });
  }
  if (u.blocked) { logEvent('login_blocked', req, u); return json(res, 403, { error: 'Учётная запись заблокирована. Обратитесь к администратору.' }); }
  limiter.reset(keys[1]);
  const now = Date.now();
  db.prepare('UPDATE users SET last_login=?, last_seen=?, last_ip=?, last_ua=?, logins=logins+1 WHERE id=?').run(now, now, ip(req), String(req.headers['user-agent'] || '').slice(0, 300), u.id);
  logEvent('login', req, u);
  startSession(req, res, 'user', u.id);
  json(res, 200, { ok: true, login: u.login });
}

function apiLogout(req, res) {
  const u = getUser(req);
  if (u) { db.prepare('DELETE FROM sessions WHERE token=?').run(u.session); logEvent('logout', req, u); }
  cookie(res, req, 'mm_s', '', 0);
  json(res, 200, { ok: true });
}

async function apiPassword(req, res, u) {
  const b = await readJSON(req, 64e3);
  if (!A.checkPassword(String(b.old || ''), u.pass)) return json(res, 400, { error: 'Текущий пароль указан неверно.' });
  const pw = String(b.password || '');
  if (pw.length < 8) return json(res, 400, { error: 'Новый пароль должен быть не короче 8 символов.' });
  db.prepare('UPDATE users SET pass=? WHERE id=?').run(A.hashPassword(pw), u.id);
  db.prepare("DELETE FROM sessions WHERE kind='user' AND user_id=? AND token<>?").run(u.id, u.session);
  logEvent('password_change', req, u);
  json(res, 200, { ok: true });
}

// ---------- профиль (настройки, рабочий стол, данные программ)
const PROFILE_MAX = 25 * 1024 * 1024;
function loadProfile(id) {
  const r = db.prepare('SELECT data, updated FROM profiles WHERE user_id=?').get(id);
  return r ? { data: JSON.parse(r.data), updated: r.updated } : { data: {}, updated: 0 };
}
async function apiProfilePut(req, res, u) {
  const b = await readJSON(req, PROFILE_MAX + 1e6);
  const p = loadProfile(u.id);
  const keyOk = k => typeof k === 'string' && /^(w12\.|app\.|mm\.)/.test(k) && k.length < 200;
  if (b.set && typeof b.set === 'object') for (const [k, v] of Object.entries(b.set)) if (keyOk(k) && typeof v === 'string') p.data[k] = v;
  if (Array.isArray(b.del)) for (const k of b.del) if (keyOk(k)) delete p.data[k];
  if (b.replace && typeof b.replace === 'object') { p.data = {}; for (const [k, v] of Object.entries(b.replace)) if (keyOk(k) && typeof v === 'string') p.data[k] = v; }
  const text = JSON.stringify(p.data);
  if (text.length > PROFILE_MAX) return json(res, 413, { error: 'Профиль слишком большой.' });
  const now = Date.now();
  db.prepare('INSERT INTO profiles(user_id,data,updated) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, updated=excluded.updated').run(u.id, text, now);
  json(res, 200, { ok: true, updated: now });
}

// ---------- мост рабочего стола
async function apiNative(req, res, u, name) {
  const fn = API[name] || (ctx.clouds && ctx.clouds.api[name]);
  const args = await readJSON(req);
  if (!fn) return json(res, 200, { err: 'ENOSYS', msg: name });
  try {
    const v = await fn(space(u), ...(Array.isArray(args) ? args : []));
    json(res, 200, { ok: v === undefined ? true : v });
  } catch (e) {
    if (!e.code || !/^E[A-Z]+$/.test(e.code)) console.error('[native]', name, e);
    json(res, 200, { err: /^E[A-Z]+$/.test(e.code || '') ? e.code : 'EIO', msg: e.code === 'ENOSPC' ? 'Недостаточно места: лимит вашего диска ' + Math.round((space(u).user.quota || CFG.quota) / 1048576) + ' МБ.' : e.message });
  }
}

async function serveUserFile(req, res, u, np, url) {
  try {
    const r = space(u).resolve(np);
    const f = r.m.backend.open ? await r.m.backend.open(r.rel) : null;
    if (!f) {
      const buf = await r.m.backend.read(r.rel, 200 * 1024 * 1024);
      return sendStream(req, res, { size: buf.length, mtime: Date.now(), stream: (s, e) => require('stream').Readable.from(buf.subarray(s, e + 1)) }, mime(np), { download: url.searchParams.has('download') ? path.posix.basename(np) : null });
    }
    sendStream(req, res, f, f.type || mime(np), { download: url.searchParams.has('download') ? path.posix.basename(np) : null });
  } catch (e) { send(res, e.code === 'EACCES' ? 403 : 404, 'not found'); }
}

async function apiUpload(req, res, u, url) {
  const np = url.searchParams.get('path');
  try {
    const r = space(u).resolve(np);
    const len = +(req.headers['content-length'] || 0);
    if (r.m.backend.writeStream) await r.m.backend.writeStream(r.rel, req, len);
    else await r.m.backend.write(r.rel, await readBody(req, 512 * 1024 * 1024));
    json(res, 200, { ok: true, path: np });
  } catch (e) {
    json(res, 200, { err: e.code || 'EIO', msg: e.code === 'ENOSPC' ? 'Недостаточно места на вашем диске.' : e.message });
  }
}

// ---------- страницы
function osIndex() {
  let html = fs.readFileSync(path.join(CFG.assets, 'os', 'index.html'), 'utf8');
  html = html.replace('<head>', `<head>\n  <base href="/assets/os/">\n  <script src="/web/bridge.js"></script>\n  <script src="/web/localfs.js"></script>`)
    .replace(/<title>[^<]*<\/title>/, `<title>${CFG.siteName}</title>`)
    .replace('</head>', '  <link rel="stylesheet" href="/web/monomach.css">\n  <link rel="icon" href="/web/icon.svg">\n</head>')
    .replace('<script src="js/main.js"></script>', '<script src="/web/webdisks.js"></script>\n  <script src="/web/web-shell.js"></script>\n  <script src="js/main.js"></script>');
  return html;
}

// Названия в текстах рабочего стола: WindowsFX → Monomach (служебная папка .WindowsFX не меняется)
const BRAND = [
  ['WindowsFX и Android', 'Monomach'],
  ['WindowsFX для Android', 'Monomach — режим эффективной работы'],
  ['Это рабочий стол в стиле Windows для Android.', 'Это ваш рабочий стол Monomach в браузере.'],
  ['рабочий стол для Android', 'режим эффективной работы'],
  ['Диск D: — это память вашего устройства, а Документы, Загрузки и Изображения — настоящие папки телефона или планшета.', 'Диск D: — ваш личный диск на сервере: Документы, Загрузки и Изображения хранятся на нём и доступны с любого компьютера.'],
];
const branded = new Map();
async function sendBranded(req, res, file) {
  const st = await fsp.stat(file).catch(() => null);
  if (!st) return send(res, 404, 'not found');
  let c = branded.get(file);
  if (!c || c.m !== st.mtimeMs) {
    let t = await fsp.readFile(file, 'utf8');
    for (const [a, b] of BRAND) t = t.split(a).join(b);
    t = t.replace(/(?<![.\w])WindowsFX(?![\w])/g, CFG.siteName);
    c = { m: st.mtimeMs, body: Buffer.from(t, 'utf8') };
    branded.set(file, c);
  }
  send(res, 200, c.body, 'text/javascript; charset=utf-8', { 'Cache-Control': 'no-cache' });
}

async function serveAsset(req, res, rel) {
  const file = path.resolve(CFG.assets, '.' + path.posix.normalize('/' + rel));
  if (!file.startsWith(CFG.assets + path.sep)) return send(res, 403, 'forbidden');
  const m = rel.match(/^craft\/([a-z]+)\/index\.html$/);
  if (m) {
    const html = (await fsp.readFile(file, 'utf8').catch(() => null));
    if (html == null) return send(res, 404, 'not found');
    return send(res, 200, html.replace('<head>', `<head><script src="/assets/os/js/fx/craft-frame.js" data-app="${m[1]}"></script>`), 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache' });
  }
  if (/^os\/js\/(?!vendor\/).*\.js$/.test(rel)) return sendBranded(req, res, file);
  const cache = /\.(wasm|png|jpg|svg|woff2?|ttf|bcmap|pfb|wcaff|data)$/i.test(file) && !/\/os\//.test(file) ? 'public, max-age=86400' : 'no-cache';
  return sendFile(req, res, file, { cache });
}

const admin = require('./admin')({ db, CFG, A, json, readJSON, send, logEvent, getSession, startSession, cookie, setting, setSetting, ctx, spaces, ip });

// ---------- маршрутизация
async function route(req, res) {
  const url = new URL(req.url, 'http://x');
  let p;
  try { p = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'bad url'); }
  const M = req.method;

  if (p === '/healthz') return send(res, 200, 'ok');
  if (p === '/sw.js') return sendFile(req, res, path.join(CFG.pub, 'sw.js'), { cache: 'no-cache' });
  if (p.startsWith('/web/')) return sendFile(req, res, path.join(CFG.pub, path.posix.normalize('/' + p.slice(5))), { cache: 'no-cache' });
  if (p.startsWith('/assets/')) return serveAsset(req, res, p.slice(8));
  if (p === '/favicon.ico') return sendFile(req, res, path.join(CFG.pub, 'icon.svg'), { type: 'image/svg+xml' });

  if (CFG.local) {
    // вход из программы Monomach для Mac: /auth?t=<ключ> ставит cookie и открывает рабочий стол
    if (p === '/auth') {
      if (url.searchParams.get('t') !== CFG.localToken) return send(res, 403, 'forbidden');
      res.writeHead(302, { Location: '/', 'Set-Cookie': `mm_l=${CFG.localToken}; Path=/; HttpOnly; SameSite=Strict`, 'Cache-Control': 'no-store' });
      return res.end();
    }
    if (p === '/admin' || p.startsWith('/api/admin/') || p === '/api/register' || p === '/api/login' || p === '/api/password') return send(res, 404, 'not found');
  }
  if (p === '/admin' || p === '/admin/') return sendFile(req, res, path.join(CFG.pub, 'admin.html'));
  if (p.startsWith('/api/admin/')) return admin.handle(req, res, p.slice(11), url);

  if (p === '/api/register' && M === 'POST') return apiRegister(req, res);
  if (p === '/api/login' && M === 'POST') return apiLogin(req, res);
  if (p === '/api/logout' && M === 'POST') return apiLogout(req, res);
  if (p === '/api/config') return json(res, 200, { site: CFG.siteName, registration: setting('registration', 'open') === 'open', quota: +setting('default_quota', CFG.quota) });

  const u = getUser(req);
  if (p === '/' || p === '/login' || p === '/register') {
    if (p === '/' && u) return send(res, 200, osIndex(), 'text/html; charset=utf-8');
    if (CFG.local) return send(res, 403, 'Откройте рабочий стол через программу Monomach.');
    if (p !== '/' && u) { res.writeHead(302, { Location: '/' }); return res.end(); }
    return sendFile(req, res, path.join(CFG.pub, 'login.html'));
  }
  if (!u) {
    if (p.startsWith('/native/') || p.startsWith('/api/')) return json(res, 401, { err: 'EAUTH', error: 'Требуется вход' });
    res.writeHead(302, { Location: '/login' }); return res.end();
  }
  if (p === '/api/me') { const q = await space(u).quota.get(); return json(res, 200, { local: CFG.local, login: u.login, created: u.created, quota: CFG.local ? q.quota : u.quota, used: q.used }); }
  if (p === '/api/password' && M === 'POST') return apiPassword(req, res, u);
  if (p === '/api/profile' && M === 'GET') { const pr = loadProfile(u.id); return json(res, 200, { login: u.login, data: pr.data, updated: pr.updated, local: CFG.local }); }
  if (p === '/api/profile' && (M === 'PUT' || M === 'POST')) return apiProfilePut(req, res, u);
  if (p === '/api/upload' && (M === 'PUT' || M === 'POST')) return apiUpload(req, res, u, url);
  if (p.startsWith('/native/') && M === 'POST') return apiNative(req, res, u, p.slice(8));
  if (p.startsWith('/fs/') || p.startsWith('/thumb/')) return serveUserFile(req, res, u, p.slice(p.indexOf('/', 1)), url);
  if (ctx.clouds && p.startsWith('/api/cloud/')) return ctx.clouds.handle(req, res, p.slice(11), url, u, { json, readJSON, logEvent, send });
  send(res, 404, 'not found');
}

const server = http.createServer((req, res) => {
  route(req, res).catch(e => { console.error(e); if (!res.headersSent) json(res, 500, { error: 'Внутренняя ошибка сервера' }); else res.end(); });
});
server.requestTimeout = 0;
// Mac: если программа Monomach закрылась аварийно, сервер не остаётся висеть в фоне
const PARENT = process.ppid;
if (CFG.local && PARENT !== 1) setInterval(() => { if (process.ppid !== PARENT) process.exit(0); }, 2000).unref();
server.listen(CFG.port, CFG.host, () => console.log(`[monomach] ${CFG.siteName} ${CFG.version}: http://${CFG.host}:${CFG.port}  данные: ${CFG.dataDir}`));

module.exports = { server, CFG, db };
