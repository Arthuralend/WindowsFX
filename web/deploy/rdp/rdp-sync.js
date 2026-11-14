#!/usr/bin/env node
/* Monomach RDP: учётные записи Linux для входа через Windows App (запускается от root).
   Сайт ведёт список пользователей, которым разрешён вход по RDP (DATA_DIR/rdp/users.json);
   этот скрипт создаёт недостающих пользователей Linux (без пароля — пароль проверяет сайт),
   ограничивает им память и процессор и удаляет тех, кого в списке больше нет.
   Трогает только членов группы monomach-rdp. */
'use strict';
const fs = require('fs');
const { execFileSync, spawnSync } = require('child_process');

const GROUP = 'monomach-rdp';
const HOME = '/home/monomach-rdp';
const conf = {};
try { fs.readFileSync('/etc/monomach.env', 'utf8').split('\n').forEach(l => { const m = /^\s*([A-Z_]+)=(.*)$/.exec(l); if (m) conf[m[1]] = m[2].trim(); }); } catch {}
const DATA = conf.DATA_DIR || '/var/lib/monomach';
const MEM = conf.RDP_MEMORY_MAX || '1536M';
const CPU = conf.RDP_CPU_QUOTA || '150%';

const run = (cmd, args) => spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
const NAME_RE = /^[a-z][a-z0-9_-]{2,31}$/;

if (run('getent', ['group', GROUP]).status !== 0) execFileSync('groupadd', ['--system', GROUP]);
fs.mkdirSync(HOME, { recursive: true, mode: 0o711 });

let want = [];
try { want = JSON.parse(fs.readFileSync(DATA + '/rdp/users.json', 'utf8')).users || []; } catch (e) { console.error('users.json:', e.message); process.exit(0); }
const wanted = new Map(want.filter(u => NAME_RE.test(u.name)).map(u => [u.name, u]));

const members = new Set((run('getent', ['group', GROUP]).stdout.toString().split(':')[3] || '').trim().split(',').filter(Boolean));
// основная группа не попадает в список членов — дополняем по /etc/passwd
const gid = run('getent', ['group', GROUP]).stdout.toString().split(':')[2];
fs.readFileSync('/etc/passwd', 'utf8').split('\n').forEach(l => { const x = l.split(':'); if (x[3] === gid && x[0]) members.add(x[0]); });

let created = 0, removed = 0, reload = false;
for (const [name, u] of wanted) {
  if (members.has(name)) continue;
  if (run('id', [name]).status === 0) { console.error(`skip ${name}: системный пользователь с таким именем уже есть`); continue; }
  const r = run('useradd', ['--no-create-home', '--home-dir', `${HOME}/${name}`, '--shell', '/bin/bash', '--gid', GROUP, '--comment', `Monomach #${u.id}`, name]);
  if (r.status !== 0) { console.error(`useradd ${name}:`, r.stderr.toString().trim()); continue; }
  created++;
}
// ограничения памяти и процессора для каждого сеанса (systemd user-<uid>.slice)
for (const name of wanted.keys()) {
  const id = run('id', ['-u', name]);
  if (id.status !== 0) continue;
  const dir = `/etc/systemd/system/user-${id.stdout.toString().trim()}.slice.d`;
  const f = `${dir}/50-monomach.conf`;
  const body = `# Monomach RDP: ограничения сеанса ${name}\n[Slice]\nMemoryMax=${MEM}\nCPUQuota=${CPU}\nTasksMax=1024\n`;
  let old = null; try { old = fs.readFileSync(f, 'utf8'); } catch {}
  if (old !== body) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(f, body); reload = true; }
}
for (const name of members) {
  if (wanted.has(name)) continue;
  run('pkill', ['-KILL', '-u', name]);
  const id = run('id', ['-u', name]).stdout.toString().trim();
  const r = run('userdel', ['--remove', name]);
  if (r.status === 0) { removed++; if (id) { fs.rmSync(`/etc/systemd/system/user-${id}.slice.d/50-monomach.conf`, { force: true }); reload = true; } }
  else console.error(`userdel ${name}:`, r.stderr.toString().trim());
}
if (reload) run('systemctl', ['daemon-reload']);
if (created || removed) console.log(`monomach-rdp-sync: создано ${created}, удалено ${removed}, всего ${wanted.size}`);
