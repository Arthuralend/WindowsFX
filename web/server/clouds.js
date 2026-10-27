/* Monomach: облачные диски пользователя. Каждый пользователь сам подключает свои диски:
   Яндекс Диск и Облако Mail.ru (WebDAV с паролем приложения), любой WebDAV, Google Диск (вход через Google).
   Пароли и ключи доступа хранятся на сервере в зашифрованном виде (AES-256-GCM). */
'use strict';
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { WebDAVDisk, PRESETS } = require('./webdav');
const G = require('./gdrive');
const { err } = require('./localdisk');

const KINDS = { webdav: 'WebDAV', yandex: 'Яндекс Диск', mailru: 'Облако Mail.ru', gdrive: 'Google Диск' };
const LETTERS = 'GHIJKLMNOPQRSTUVWXYZ'.split('').map(l => l + ':');
const MAX_MOUNTS = 10;

function init(ctx) {
  const { db, box } = ctx;
  const cols = db.prepare('PRAGMA table_info(mounts)').all().map(c => c.name);
  if (!cols.includes('letter')) db.exec('ALTER TABLE mounts ADD COLUMN letter TEXT');
  const tmpDir = path.join(ctx.dataDir, 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  // незавершённые загрузки прошлых запусков
  for (const f of fs.readdirSync(tmpDir)) fs.rmSync(path.join(tmpDir, f), { force: true });

  const backends = new Map(); // mount id -> backend
  function backendOf(m) {
    let b = backends.get(m.id);
    if (b) return b;
    const secret = m.secret ? box.dec(m.secret) : '';
    if (m.kind === 'gdrive') b = new G.GDriveDisk({ refreshToken: secret, tmpDir });
    else b = new WebDAVDisk({ url: m.url, username: m.username, password: secret, tmpDir });
    backends.set(m.id, b);
    return b;
  }
  const rows = userId => db.prepare('SELECT * FROM mounts WHERE user_id=? ORDER BY created').all(userId);

  function forUser(userId) {
    return rows(userId).map(m => ({ id: m.id, label: m.label, kind: m.kind, letter: m.letter, backend: backendOf(m) }));
  }
  const pub = m => ({ id: m.id, kind: m.kind, kindName: KINDS[m.kind] || m.kind, label: m.label, url: m.kind === 'webdav' ? m.url : undefined, username: m.username || undefined, letter: m.letter, created: m.created, path: '/cloud/' + m.id });

  function freeLetter(userId) {
    const used = new Set(rows(userId).map(m => m.letter));
    return LETTERS.find(l => !used.has(l)) || null;
  }
  function save(userId, kind, label, url, username, secret) {
    if (rows(userId).length >= MAX_MOUNTS) throw err('ELIMIT', `Можно подключить не больше ${MAX_MOUNTS} дисков.`);
    const id = crypto.randomBytes(6).toString('hex');
    db.prepare('INSERT INTO mounts(id,user_id,kind,label,url,username,secret,created,letter) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id, userId, kind, label, url || null, username || null, secret ? box.enc(secret) : null, Date.now(), freeLetter(userId));
    return db.prepare('SELECT * FROM mounts WHERE id=?').get(id);
  }
  function remove(userId, id) {
    const m = db.prepare('SELECT * FROM mounts WHERE id=? AND user_id=?').get(id, userId);
    if (!m) return null;
    db.prepare('DELETE FROM mounts WHERE id=?').run(id);
    backends.delete(id);
    return m;
  }

  // --- Вход через Google: state привязан к пользователю, действует 10 минут
  const states = new Map();
  setInterval(() => { const t = Date.now(); for (const [k, v] of states) if (t - v.at > 600e3) states.delete(k); }, 60e3).unref();
  const publicUrl = req => (process.env.PUBLIC_URL || `${req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http')}://${req.headers['x-forwarded-host'] || req.headers.host}`).replace(/\/$/, '');
  const redirectUri = req => publicUrl(req) + '/api/cloud/google/callback';

  function page(res, ok, msg) {
    const body = `<!doctype html><meta charset="utf-8"><title>Google Диск</title><style>body{font:15px system-ui,sans-serif;background:#1e1f24;color:#eee;display:grid;place-items:center;height:100vh;margin:0}div{max-width:420px;text-align:center}</style>
<div><h2>${ok ? 'Google Диск подключён' : 'Google Диск не подключён'}</h2><p>${msg.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c])}</p><p>Окно можно закрыть.</p></div>
<script>try{opener&&opener.postMessage({monomachCloud:${ok ? 'true' : 'false'}},location.origin)}catch(e){}setTimeout(()=>{try{close()}catch(e){}},${ok ? 1200 : 6000})</script>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  }

  async function handle(req, res, sub, url, u, { json, readJSON, logEvent }) {
    const M = req.method;
    try {
      if (sub === 'list') return json(res, 200, { mounts: rows(u.id).map(pub), google: G.configured() });

      if (sub === 'add' && M === 'POST') {
        const b = await readJSON(req, 64e3);
        const kind = String(b.kind || '');
        if (!['webdav', 'yandex', 'mailru'].includes(kind)) return json(res, 400, { error: 'Неизвестный тип диска' });
        let addr = kind === 'webdav' ? String(b.url || '').trim() : PRESETS[kind].url;
        if (kind === 'webdav') {
          if (!/^https?:\/\//i.test(addr)) addr = 'https://' + addr;
          let pu; try { pu = new URL(addr); } catch { return json(res, 400, { error: 'Неверный адрес сервера', field: 'url' }); }
          const ip = await require('dns').promises.lookup(pu.hostname).then(r => r.address).catch(() => null);
          if (!ip) return json(res, 400, { error: 'Сервер с таким адресом не найден', field: 'url' });
          if (!process.env.ALLOW_PRIVATE_WEBDAV && (isPrivateHost(pu.hostname) || isPrivateHost(ip))) return json(res, 400, { error: 'Адреса локальной сети подключить нельзя: сервер сайта не видит вашу домашнюю сеть.', field: 'url' });
        }
        const username = String(b.username || '').trim(), password = String(b.password || '');
        if (!username || !password) return json(res, 400, { error: 'Укажите логин и пароль', field: username ? 'password' : 'username' });
        const label = String(b.label || '').trim().slice(0, 40) || (kind === 'webdav' ? new URL(addr).hostname : PRESETS[kind].label);
        const test = new WebDAVDisk({ url: addr, username, password, tmpDir });
        try { await test.check(); }
        catch (e) {
          const hint = e.code === 'EAUTH'
            ? (kind === 'yandex' ? 'Яндекс не принял логин или пароль. Нужен пароль приложения (Яндекс ID → Безопасность → Пароли приложений → «Файлы»), а не обычный пароль.'
              : kind === 'mailru' ? 'Mail.ru не принял логин или пароль. Нужен пароль для внешнего приложения (Почта → Настройки → Безопасность → Пароли для внешних приложений, доступ «Облако / WebDAV»).'
                : 'Сервер не принял логин или пароль.')
            : 'Не удалось подключиться: ' + e.message;
          return json(res, 400, { error: hint });
        }
        const m = save(u.id, kind, label, addr, username, password);
        logEvent('cloud_add', req, u, `${KINDS[kind]}: ${label}${username ? ' (' + username + ')' : ''}`);
        return json(res, 200, { ok: true, mount: pub(m) });
      }

      if (sub === 'rename' && M === 'POST') {
        const b = await readJSON(req, 64e3);
        const label = String(b.label || '').trim().slice(0, 40);
        if (!label) return json(res, 400, { error: 'Пустое имя' });
        db.prepare('UPDATE mounts SET label=? WHERE id=? AND user_id=?').run(label, String(b.id || ''), u.id);
        return json(res, 200, { ok: true });
      }

      if (sub === 'remove' && M === 'POST') {
        const b = await readJSON(req, 64e3);
        const m = remove(u.id, String(b.id || ''));
        if (!m) return json(res, 404, { error: 'Диск не найден' });
        logEvent('cloud_remove', req, u, `${KINDS[m.kind] || m.kind}: ${m.label}`);
        return json(res, 200, { ok: true });
      }

      if (sub === 'google/start') {
        if (!G.configured()) return page(res, false, 'Администратор сайта ещё не включил вход через Google.');
        const state = crypto.randomBytes(18).toString('base64url');
        states.set(state, { user: u.id, at: Date.now() });
        res.writeHead(302, { Location: G.authUrl(redirectUri(req), state), 'Cache-Control': 'no-store' });
        return res.end();
      }
      if (sub === 'google/callback') {
        const st = states.get(url.searchParams.get('state') || '');
        states.delete(url.searchParams.get('state') || '');
        if (!st || st.user !== u.id) return page(res, false, 'Ссылка устарела. Начните подключение заново из Проводника.');
        if (url.searchParams.get('error')) return page(res, false, 'Доступ не разрешён.');
        const tok = await G.exchangeCode(url.searchParams.get('code') || '', redirectUri(req));
        const disk = new G.GDriveDisk({ refreshToken: tok.refresh_token, tmpDir });
        let email = '';
        try { email = (await disk.about()).user?.emailAddress || ''; } catch {}
        const dup = rows(u.id).find(m => m.kind === 'gdrive' && m.username && m.username === email);
        if (dup) remove(u.id, dup.id);
        save(u.id, 'gdrive', 'Google Диск', null, email, tok.refresh_token);
        logEvent('cloud_add', req, u, `Google Диск${email ? ' (' + email + ')' : ''}`);
        return page(res, true, email ? `Аккаунт ${email}. Диск появился в Проводнике.` : 'Диск появился в Проводнике.');
      }
      return json(res, 404, { error: 'not found' });
    } catch (e) {
      if (!e.code) console.error('[clouds]', e);
      if (sub === 'google/callback') return page(res, false, e.message);
      return json(res, 400, { error: e.message });
    }
  }

  return { api: {}, forUser, handle, KINDS };
}

/** Адреса локальной сети и самого сервера подключать нельзя (защита от обращений к внутренним службам) */
function isPrivateHost(h) {
  h = h.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80');
}

module.exports = { init, isPrivateHost };
