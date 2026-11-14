#!/usr/bin/env node
/* Monomach RDP: проверка имени и пароля из Windows App.
   Вызывается PAM (pam_exec expose_authtok) от root, когда xrdp принимает вход: пароль приходит на stdin,
   имя — в PAM_USER. Проверяет сам сайт (POST /api/rdp/auth); при успехе одноразовый ключ входа
   кладётся в /run/monomach-rdp/<имя>.token — его заберёт rdp-session.sh и откроет рабочий стол. */
'use strict';
const fs = require('fs');
const http = require('http');
const { execFileSync } = require('child_process');

const fail = msg => { if (msg) console.error('monomach-rdp-auth:', msg); process.exit(1); };
if (process.env.PAM_TYPE && process.env.PAM_TYPE !== 'auth') process.exit(0);
const user = String(process.env.PAM_USER || '');
if (!/^[A-Za-z][A-Za-z0-9_-]{2,31}$/.test(user)) fail('bad user');

const conf = {};
try { fs.readFileSync(process.env.MONOMACH_ENV || '/etc/monomach.env', 'utf8').split('\n').forEach(l => { const m = /^\s*([A-Z_]+)=(.*)$/.exec(l); if (m) conf[m[1]] = m[2].trim(); }); } catch {}
const PORT = +(conf.PORT || 8080);
const DATA = conf.DATA_DIR || '/var/lib/monomach';
let secret;
try { secret = fs.readFileSync(DATA + '/rdp/secret', 'utf8').trim(); } catch { fail('no secret'); }

let pw = '';
try { pw = fs.readFileSync(0).toString('utf8'); } catch {}
pw = pw.replace(/\0[\s\S]*$/, '').replace(/\r?\n$/, '');
if (!pw) fail('empty password');

const body = JSON.stringify({ user, password: pw, rhost: String(process.env.PAM_RHOST || '').replace(/^::ffff:/, '') });
const req = http.request({ host: '127.0.0.1', port: PORT, path: '/api/rdp/auth', method: 'POST', timeout: 15000,
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-RDP-Secret': secret } }, res => {
  let d = '';
  res.on('data', c => { d += c; });
  res.on('end', () => {
    let j = {};
    try { j = JSON.parse(d); } catch {}
    if (res.statusCode !== 200 || !j.token) fail(j.error || 'HTTP ' + res.statusCode);
    try {
      const dir = '/run/monomach-rdp';
      fs.mkdirSync(dir, { recursive: true, mode: 0o711 });
      fs.chmodSync(dir, 0o711);
      const f = `${dir}/${user}.token`;
      // одноразовый ключ входа и ключ сеанса (повторный вход, если браузер перезапустится)
      fs.writeFileSync(f, j.token + '\n' + (j.key || '') + '\n', { mode: 0o600 });
      const uid = +execFileSync('/usr/bin/id', ['-u', user]).toString().trim();
      const gid = +execFileSync('/usr/bin/id', ['-g', user]).toString().trim();
      fs.chownSync(f, uid, gid);
    } catch (e) { fail('token: ' + e.message); }
    process.exit(0);
  });
});
req.on('timeout', () => req.destroy(new Error('timeout')));
req.on('error', e => fail(e.message));
req.end(body);
