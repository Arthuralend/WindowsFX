/* Monomach: API панели администратора (/api/admin/…) */
'use strict';
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

module.exports = function (D) {
  const { db, CFG, A, json, readJSON, logEvent, getSession, startSession, cookie, setting, setSetting, ctx, spaces, ip } = D;
  const limiter = new A.Limiter(6, 15 * 60e3);
  const started = Date.now();

  const userRow = u => u && ({
    id: u.id, login: u.login, created: u.created, last_login: u.last_login, last_seen: u.last_seen, last_ip: u.last_ip,
    last_ua: A.describeUA(u.last_ua), logins: u.logins, blocked: !!u.blocked, quota: u.quota, used: (ctx.usage.get(u.id) || {}).used ?? u.used, note: u.note || '',
  });

  async function diskFree() {
    try { const s = await fsp.statfs(CFG.dataDir); return { free: s.bavail * s.bsize, total: s.blocks * s.bsize }; } catch { return null; }
  }

  async function login(req, res) {
    const b = await readJSON(req, 64e3);
    const keys = ['aip:' + ip(req)];
    if (limiter.blocked(...keys)) return json(res, 429, { error: `Слишком много попыток. Попробуйте через ${limiter.retryAfter(...keys)} мин.` });
    const ok = String(b.login || '') === setting('admin_login') && A.checkPassword(String(b.password || ''), setting('admin_pass'));
    if (!ok) { limiter.fail(...keys); logEvent('admin_login_fail', req, { login: String(b.login || '').slice(0, 64) }); return json(res, 401, { error: 'Неверный логин или пароль.' }); }
    limiter.reset(...keys);
    logEvent('admin_login', req, { login: setting('admin_login') });
    startSession(req, res, 'admin', null);
    json(res, 200, { ok: true });
  }

  function overview() {
    const now = Date.now();
    const n = (sql, ...a) => db.prepare(sql).get(...a).n;
    const day = now - 864e5, week = now - 7 * 864e5;
    // посещаемость по дням (последние 14 дней): входы и уникальные пользователи
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const a = d.getTime(), b = a + 864e5;
      days.push({ day: a, logins: n("SELECT COUNT(*) n FROM events WHERE type='login' AND ts>=? AND ts<?", a, b), users: n("SELECT COUNT(DISTINCT user_id) n FROM events WHERE type='login' AND ts>=? AND ts<?", a, b), registrations: n("SELECT COUNT(*) n FROM events WHERE type='register' AND ts>=? AND ts<?", a, b) });
    }
    return {
      users: n('SELECT COUNT(*) n FROM users'),
      blocked: n('SELECT COUNT(*) n FROM users WHERE blocked=1'),
      online: n('SELECT COUNT(*) n FROM users WHERE last_seen>?', now - 5 * 60e3),
      active24: n('SELECT COUNT(*) n FROM users WHERE last_seen>?', day),
      active7: n('SELECT COUNT(*) n FROM users WHERE last_seen>?', week),
      reg24: n("SELECT COUNT(*) n FROM events WHERE type='register' AND ts>?", day),
      reg7: n("SELECT COUNT(*) n FROM events WHERE type='register' AND ts>?", week),
      logins24: n("SELECT COUNT(*) n FROM events WHERE type='login' AND ts>?", day),
      fails24: n("SELECT COUNT(*) n FROM events WHERE type IN ('login_fail','admin_login_fail','login_blocked') AND ts>?", day),
      storageUsed: db.prepare('SELECT COALESCE(SUM(used),0) n FROM users').get().n,
      storageQuota: db.prepare('SELECT COALESCE(SUM(quota),0) n FROM users').get().n,
      mounts: n('SELECT COUNT(*) n FROM mounts'),
      days,
      topIps: db.prepare("SELECT ip, COUNT(*) n FROM events WHERE type IN ('login_fail','admin_login_fail') AND ts>? GROUP BY ip ORDER BY n DESC LIMIT 5").all(week),
    };
  }

  async function system() {
    const mem = process.memoryUsage();
    return {
      version: CFG.version, node: process.version, uptime: Date.now() - started, hostUptime: os.uptime() * 1000,
      load: os.loadavg(), cpus: os.cpus().length, memTotal: os.totalmem(), memFree: os.freemem(), rss: mem.rss,
      disk: await diskFree(), dataDir: CFG.dataDir,
      dbSize: (() => { try { return fs.statSync(path.join(CFG.dataDir, 'monomach.db')).size; } catch { return 0; } })(),
      settings: { registration: setting('registration', 'open'), defaultQuota: +setting('default_quota', CFG.quota), adminLogin: setting('admin_login') },
    };
  }

  function users(url) {
    const q = (url.searchParams.get('q') || '').trim();
    const sort = { login: 'login COLLATE NOCASE', created: 'created DESC', seen: 'last_seen DESC', used: 'used DESC' }[url.searchParams.get('sort')] || 'last_seen DESC';
    const rows = q ? db.prepare(`SELECT * FROM users WHERE login LIKE ? OR last_ip LIKE ? ORDER BY ${sort} LIMIT 500`).all(`%${q}%`, `%${q}%`)
      : db.prepare(`SELECT * FROM users ORDER BY ${sort} LIMIT 500`).all();
    const mounts = db.prepare('SELECT user_id, kind FROM mounts').all();
    return rows.map(r => ({ ...userRow(r), mounts: mounts.filter(m => m.user_id === r.id).map(m => m.kind) }));
  }

  async function user(id) {
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
    if (!u) return null;
    const events = db.prepare('SELECT * FROM events WHERE user_id=? ORDER BY ts DESC LIMIT 200').all(id).map(ev);
    const sessions = db.prepare("SELECT created, last_seen, ip, ua FROM sessions WHERE kind='user' AND user_id=? ORDER BY last_seen DESC").all(id).map(s => ({ ...s, ua: A.describeUA(s.ua) }));
    const mounts = db.prepare('SELECT id, kind, label, url, username, created FROM mounts WHERE user_id=?').all(id);
    const ips = db.prepare("SELECT ip, COUNT(*) n, MAX(ts) last FROM events WHERE user_id=? AND type='login' GROUP BY ip ORDER BY last DESC LIMIT 20").all(id);
    let files = null;
    try { files = await require('./localdisk').treeSize(path.join(CFG.dataDir, 'users', String(id), 'disk')); } catch {}
    const pr = db.prepare('SELECT LENGTH(data) size, updated FROM profiles WHERE user_id=?').get(id);
    return { ...userRow(u), events, sessions, mounts, ips, files, profile: pr || null };
  }

  const ev = e => ({ ...e, ua: A.describeUA(e.ua) });
  function events(url) {
    const where = [], args = [];
    const t = url.searchParams.get('type'); if (t) { where.push(`type IN (${t.split(',').map(() => '?').join(',')})`); args.push(...t.split(',')); }
    const u = url.searchParams.get('user'); if (u) { where.push('user_id=?'); args.push(+u); }
    const q = url.searchParams.get('q'); if (q) { where.push('(login LIKE ? OR ip LIKE ? OR detail LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    const before = url.searchParams.get('before'); if (before) { where.push('id < ?'); args.push(+before); }
    const from = url.searchParams.get('from'); if (from) { where.push('ts >= ?'); args.push(+from); }
    const lim = Math.min(+(url.searchParams.get('limit') || 100), 5000);
    return db.prepare(`SELECT * FROM events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ${lim}`).all(...args).map(ev);
  }

  async function userAction(req, res, id) {
    const b = await readJSON(req, 64e3);
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
    if (!u) return json(res, 404, { error: 'Пользователь не найден' });
    const who = { id: u.id, login: u.login };
    switch (b.action) {
      case 'block':
        db.prepare('UPDATE users SET blocked=1 WHERE id=?').run(id);
        db.prepare("DELETE FROM sessions WHERE kind='user' AND user_id=?").run(id);
        logEvent('admin_block', req, who, b.reason || '');
        return json(res, 200, { ok: true });
      case 'unblock':
        db.prepare('UPDATE users SET blocked=0 WHERE id=?').run(id);
        logEvent('admin_unblock', req, who);
        return json(res, 200, { ok: true });
      case 'password': {
        const pw = b.password && String(b.password).length >= 8 ? String(b.password) : crypto.randomBytes(6).toString('base64url');
        db.prepare('UPDATE users SET pass=? WHERE id=?').run(A.hashPassword(pw), id);
        db.prepare("DELETE FROM sessions WHERE kind='user' AND user_id=?").run(id);
        logEvent('admin_password', req, who);
        return json(res, 200, { ok: true, password: pw });
      }
      case 'quota': {
        const mb = Math.max(10, Math.min(1024 * 1024, +b.mb || 0));
        db.prepare('UPDATE users SET quota=? WHERE id=?').run(Math.round(mb * 1048576), id);
        logEvent('admin_quota', req, who, mb + ' МБ');
        return json(res, 200, { ok: true });
      }
      case 'logout':
        db.prepare("DELETE FROM sessions WHERE kind='user' AND user_id=?").run(id);
        logEvent('admin_logout_user', req, who);
        return json(res, 200, { ok: true });
      case 'note':
        db.prepare('UPDATE users SET note=? WHERE id=?').run(String(b.note || '').slice(0, 1000), id);
        return json(res, 200, { ok: true });
      case 'delete':
        if (String(b.confirm || '') !== u.login) return json(res, 400, { error: 'Для удаления введите имя пользователя.' });
        db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
        db.prepare('DELETE FROM users WHERE id=?').run(id);
        spaces.delete(id); ctx.usage.delete(id);
        await fsp.rm(path.join(CFG.dataDir, 'users', String(id)), { recursive: true, force: true });
        logEvent('admin_delete', req, who);
        return json(res, 200, { ok: true });
    }
    json(res, 400, { error: 'Неизвестное действие' });
  }

  async function settings(req, res) {
    const b = await readJSON(req, 64e3);
    if (b.registration) setSetting('registration', b.registration === 'closed' ? 'closed' : 'open');
    if (b.defaultQuotaMb) setSetting('default_quota', Math.round(Math.max(10, +b.defaultQuotaMb) * 1048576));
    if (b.newPassword) {
      if (!A.checkPassword(String(b.currentPassword || ''), setting('admin_pass'))) return json(res, 400, { error: 'Текущий пароль администратора неверен.' });
      if (String(b.newPassword).length < 10) return json(res, 400, { error: 'Пароль администратора — не короче 10 символов.' });
      setSetting('admin_pass', A.hashPassword(String(b.newPassword)));
      if (b.newLogin && /^[A-Za-z0-9_.-]{3,32}$/.test(b.newLogin)) setSetting('admin_login', b.newLogin);
      try { fs.rmSync(path.join(CFG.dataDir, 'admin-password.txt'), { force: true }); } catch {}
    }
    logEvent('admin_settings', req, { login: setting('admin_login') }, JSON.stringify({ registration: b.registration, defaultQuotaMb: b.defaultQuotaMb, password: !!b.newPassword }));
    json(res, 200, { ok: true });
  }

  function csv(res, rows) {
    const esc = v => { const s = v == null ? '' : String(v); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const head = ['id', 'время', 'событие', 'пользователь', 'IP', 'браузер', 'подробности'];
    const lines = rows.map(e => [e.id, new Date(e.ts).toISOString(), e.type, e.login, e.ip, e.ua, e.detail].map(esc).join(';'));
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="monomach-log.csv"' });
    res.end('﻿' + [head.join(';'), ...lines].join('\r\n'));
  }

  async function handle(req, res, p, url) {
    if (p === 'login' && req.method === 'POST') return login(req, res);
    const s = getSession(req, 'admin');
    if (p === 'logout') { if (s) db.prepare('DELETE FROM sessions WHERE token=?').run(s.token); cookie(res, req, 'mm_a', '', 0); return json(res, 200, { ok: true }); }
    if (!s) return json(res, 401, { error: 'auth' });
    if (p === 'overview') return json(res, 200, overview());
    if (p === 'system') return json(res, 200, await system());
    if (p === 'users') return json(res, 200, users(url));
    let m = p.match(/^users\/(\d+)$/);
    if (m && req.method === 'GET') { const u = await user(+m[1]); return u ? json(res, 200, u) : json(res, 404, { error: 'not found' }); }
    if (m && req.method === 'POST') return userAction(req, res, +m[1]);
    if (p === 'events') return json(res, 200, events(url));
    if (p === 'events.csv') { url.searchParams.set('limit', '5000'); return csv(res, events(url)); }
    if (p === 'settings' && req.method === 'POST') return settings(req, res);
    json(res, 404, { error: 'not found' });
  }

  return { handle };
};
