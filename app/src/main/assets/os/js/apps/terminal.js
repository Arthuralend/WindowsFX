/* Терминал */
'use strict';

Apps.register({
  id: 'terminal', name: 'Терминал', icon: 'terminal', desc: 'Командная строка и PowerShell',
  keywords: 'терминал консоль cmd powershell командная строка shell',
  launch: args => openTerminal(args),
});

function openTerminal(args = {}) {
  let cwd = args.cwd && FS.isDir(args.cwd) ? FS.realPath(args.cwd) : FS.P.home;
  const hist = Persist.get('terminal.history', []);
  let hIdx = hist.length;
  let scheme = Persist.get('terminal.scheme', 'campbell');
  let busy = null;

  const win = WM.open({ app: 'terminal', title: 'Windows PowerShell', width: 820, height: 500, minWidth: 380, minHeight: 220 });
  const b = win.body;
  b.classList.add('term');
  b.dataset.scheme = scheme;
  b.innerHTML = `<div class="term-out"></div><div class="term-line"><span class="term-prompt"></span><input class="term-in" spellcheck="false" autocomplete="off"></div>`;
  const out = $('.term-out', b), inp = $('.term-in', b), promptEl = $('.term-prompt', b);
  const scroll = () => { b.scrollTop = b.scrollHeight; };

  let redirect = null; // { path, append, buf: [] }
  function print(text = '', cls = '') {
    if (redirect) { redirect.buf.push(String(text).replace(/<[^>]+>/g, '')); return; }
    out.append(h(`<div class="tl ${cls}">${cls === 'html' ? text : esc(text) || '&nbsp;'}</div>`));
    scroll();
  }
  const printHTML = html => print(html, 'html');
  const err = msg => print(msg, 'err');
  const prompt = () => `PS ${FS.display(cwd)}>`;
  const updPrompt = () => { promptEl.textContent = prompt() + ' '; win.setTitle('Windows PowerShell — ' + FS.basename(cwd)); };

  function resolve(p) {
    if (!p) return cwd;
    p = p.replace(/\\/g, '/');
    if (p === '~' || p.startsWith('~/')) p = FS.P.home + p.slice(1);
    else if (/^[a-z]:/i.test(p)) { /* абсолютный */ }
    else if (p.startsWith('/')) p = FS.split(cwd)[0] + p;
    else p = cwd + '/' + p;
    const parts = [];
    FS.split(p).forEach(s => { if (s === '.') return; if (s === '..') { if (parts.length > 1) parts.pop(); } else parts.push(s); });
    return FS.realPath(parts.join('/')) || parts.join('/');
  }

  function parse(line) {
    const tokens = [];
    const re = /"([^"]*)"|'([^']*)'|(>>|>)|(\S+)/g;
    let m;
    while ((m = re.exec(line))) tokens.push(m[1] ?? m[2] ?? m[3] ?? m[4]);
    return tokens;
  }

  const pid = w => 1000 + parseInt(w.id.replace(/\D/g, ''), 10) * 4;

  // ---------- Команды ----------
  const C = {};
  const alias = (names, fn, help) => names.split(' ').forEach((n, i) => { C[n] = fn; if (i === 0 && help) fn.help = help; });

  alias('help ?', () => {
    print('Доступные команды:', 'hl');
    const rows = [
      ['ls, dir', 'Список файлов и папок'], ['cd <путь>', 'Сменить папку (cd .., cd ~, cd D:)'], ['pwd', 'Текущая папка'],
      ['mkdir <имя>', 'Создать папку'], ['touch <файл>', 'Создать пустой файл'], ['cat <файл>', 'Показать содержимое файла'],
      ['echo <текст> [> файл]', 'Вывести текст (или записать в файл, >> — дописать)'], ['rm <путь>', 'Удалить в корзину'],
      ['cp <откуда> <куда>', 'Копировать'], ['mv <откуда> <куда>', 'Переместить/переименовать'], ['tree', 'Дерево папок'],
      ['find <текст>', 'Поиск файлов по имени'], ['grep <текст> <файл>', 'Поиск строк в файле'], ['wc <файл>', 'Число строк, слов, символов'],
      ['head/tail <файл>', 'Начало/конец файла'], ['open <файл|папка>', 'Открыть в связанном приложении'], ['edit <файл>', 'Редактировать в Блокноте'],
      ['start <приложение>', 'Запустить приложение (start apps — список)'], ['ps, tasklist', 'Список запущенных окон'], ['kill <PID|прил.>', 'Завершить процесс'],
      ['calc <выражение>', 'Вычислить: calc 2^10/3'], ['date, time, uptime', 'Дата, время, время работы'], ['whoami, hostname, ver', 'Сведения о пользователе и системе'],
      ['systeminfo, neofetch', 'Информация о системе'], ['df', 'Место на дисках'], ['weather [город]', 'Прогноз погоды'], ['ping <хост>', 'Проверить задержку до сайта'],
      ['theme dark|light', 'Сменить тему'], ['accent <#цвет>', 'Сменить цвет акцента'], ['wallpaper <имя>', 'Сменить обои (wallpaper list)'], ['volume <0-100>', 'Громкость'],
      ['notify <текст>', 'Показать уведомление'], ['color <схема>', 'Цвета терминала: campbell, matrix, ocean, light'], ['matrix', 'Эффект «Матрицы»'],
      ['history, cls', 'История команд, очистить экран'], ['lock, sleep, restart, shutdown', 'Управление питанием'], ['exit', 'Закрыть терминал'],
    ];
    rows.forEach(([c, d]) => printHTML(`<span class="c-y">${esc(c.padEnd(26, ' '))}</span>${esc(d)}`));
  });
  alias('cls clear', () => { out.innerHTML = ''; });
  alias('pwd', () => print(FS.display(cwd)));
  alias('cd chdir sl', a => {
    if (!a[0]) return print(FS.display(cwd));
    if (/^[a-z]:$/i.test(a[0])) a[0] += '/';
    const p = resolve(a[0]);
    if (!FS.isDir(p)) return err(`cd : Не удаётся найти путь "${FS.display(p)}", так как он не существует.`);
    cwd = FS.realPath(p); updPrompt();
  });
  alias('ls dir gci', a => {
    const all = a.includes('-a') || a.includes('/a');
    const target = resolve(a.find(x => !x.startsWith('-') && !x.startsWith('/')) || '');
    if (!FS.isDir(target)) {
      const n = FS.get(target);
      if (n) return printHTML(`${fmtDateTime(n.mt)}  ${String(fmtBytes(FS.nodeSize(n))).padStart(10)}  ${esc(FS.basename(target))}`);
      return err(`Get-ChildItem : Не удаётся найти путь "${FS.display(target)}".`);
    }
    const list = FS.list(target);
    print('');
    print(`    Каталог: ${FS.display(target)}`);
    print('');
    printHTML('<span class="c-hl">Mode         LastWriteTime        Length Name</span>');
    printHTML('<span class="c-hl">----         -------------        ------ ----</span>');
    list.forEach(it => {
      const len = it.isDir ? '' : String(FS.nodeSize(it.node));
      const name = it.isDir ? `<span class="c-b">${esc(it.name)}</span>` : /\.(exe|lnk)$/i.test(it.name) ? `<span class="c-g">${esc(it.name)}</span>` : esc(it.name);
      printHTML(`${it.isDir ? 'd----' : '-a---'}   ${fmtDateTime(it.node.mt).padEnd(19)}  ${len.padStart(12)} ${name}`);
    });
    if (all) print(`\n${list.filter(x => !x.isDir).length} файл(ов), ${list.filter(x => x.isDir).length} папок`);
    print('');
  });
  alias('mkdir md', a => {
    if (!a.length) return err('mkdir : Укажите имя папки.');
    a.forEach(n => { try { FS.mkdirp(resolve(n)); } catch (e) { err('mkdir : ' + e.message); } });
  });
  alias('touch ni new-item', a => {
    if (!a.length) return err('touch : Укажите имя файла.');
    a.forEach(n => { const p = resolve(n); try { if (FS.get(p)) FS.write(p, FS.read(p)); else FS.write(p, ''); } catch (e) { err('touch : ' + e.message); } });
  });
  alias('cat type gc get-content', a => {
    if (!a.length) return err('cat : Укажите файл.');
    a.forEach(n => {
      try {
        const c = FS.read(resolve(n));
        if (String(c).startsWith('data:')) return print(`[двоичные данные: ${fmtBytes(FS.size(resolve(n)))}]`);
        String(c).split('\n').forEach(l => print(l));
      } catch (e) { err('cat : ' + e.message); }
    });
  });
  alias('echo write write-output', a => print(a.join(' ')));
  alias('rm del erase rmdir rd remove-item', a => {
    const files = a.filter(x => !x.startsWith('-'));
    if (!files.length) return err('rm : Укажите путь.');
    files.forEach(n => {
      const p = resolve(n);
      const node = FS.get(p);
      if (!node) return err(`rm : Не удаётся найти "${FS.display(p)}".`);
      if (node.t === 'd' && Object.keys(node.c).length && !a.includes('-r') && !a.includes('-rf') && !a.includes('-recurse')) return err(`rm : Папка "${FS.basename(p)}" не пуста. Используйте rm -r.`);
      if (FS.isInside(cwd, p)) return err('rm : Нельзя удалить текущую папку.');
      try { FS.remove(p); print(`Перемещено в корзину: ${FS.basename(p)}`, 'dim'); } catch (e) { err('rm : ' + e.message); }
    });
  });
  alias('cp copy copy-item', a => {
    if (a.length < 2) return err('cp : Использование: cp <источник> <назначение>');
    const src = resolve(a[0]), dst = resolve(a[1]);
    try {
      if (FS.isDir(dst)) FS.copy(src, dst);
      else { const n = FS.get(src); if (!n || n.t !== 'f') throw new Error('Источник не найден или является папкой.'); FS.write(dst, n.c); }
    } catch (e) { err('cp : ' + e.message); }
  });
  alias('mv move ren rename move-item', a => {
    if (a.length < 2) return err('mv : Использование: mv <источник> <назначение>');
    const src = resolve(a[0]), dst = resolve(a[1]);
    try {
      if (FS.isDir(dst)) FS.move(src, dst);
      else if (FS.parent(dst).toLowerCase() === FS.parent(src).toLowerCase()) FS.rename(src, FS.basename(dst));
      else { const p = FS.move(src, FS.parent(dst)); FS.rename(p, FS.basename(dst)); }
    } catch (e) { err('mv : ' + e.message); }
  });
  alias('tree', a => {
    const root = resolve(a[0] || '');
    if (!FS.isDir(root)) return err('tree : Папка не найдена.');
    print(FS.display(root));
    let count = 0;
    (function rec(p, prefix) {
      const items = FS.list(p);
      items.forEach((it, i) => {
        if (count++ > 400) return;
        const last = i === items.length - 1;
        printHTML(esc(prefix + (last ? '└── ' : '├── ')) + (it.isDir ? `<span class="c-b">${esc(it.name)}</span>` : esc(it.name)));
        if (it.isDir) rec(it.path, prefix + (last ? '    ' : '│   '));
      });
    })(root, '');
  });
  alias('find search', a => {
    if (!a[0]) return err('find : Укажите текст для поиска.');
    const res = FS.search(cwd, a.join(' '), 100);
    if (!res.length) return print('Ничего не найдено.');
    res.forEach(r => printHTML(r.isDir ? `<span class="c-b">${esc(FS.display(r.path))}</span>` : esc(FS.display(r.path))));
    print(`Найдено: ${res.length}`, 'dim');
  });
  alias('grep findstr select-string', a => {
    if (a.length < 2) return err('grep : Использование: grep <текст> <файл>');
    try {
      const q = a[0].toLowerCase();
      let n = 0;
      String(FS.read(resolve(a[1]))).split('\n').forEach((l, i) => {
        if (l.toLowerCase().includes(q)) { n++; printHTML(`<span class="c-g">${i + 1}:</span>${esc(l).replace(new RegExp(a[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => `<span class="c-r">${m}</span>`)}`); }
      });
      if (!n) print('Совпадений нет.', 'dim');
    } catch (e) { err('grep : ' + e.message); }
  });
  alias('wc', a => { try { const c = String(FS.read(resolve(a[0]))); print(`${c.split('\n').length} строк, ${c.split(/\s+/).filter(Boolean).length} слов, ${c.length} символов  ${a[0]}`); } catch (e) { err('wc : ' + e.message); } });
  alias('head', a => { try { String(FS.read(resolve(a[0]))).split('\n').slice(0, +a[1] || 10).forEach(l => print(l)); } catch (e) { err('head : ' + e.message); } });
  alias('tail', a => { try { String(FS.read(resolve(a[0]))).split('\n').slice(-(+a[1] || 10)).forEach(l => print(l)); } catch (e) { err('tail : ' + e.message); } });
  alias('open ii invoke-item explorer', a => {
    if (!a[0] || a[0] === '.') return Apps.launch('explorer', { path: cwd });
    const p = resolve(a[0]);
    if (!FS.get(p)) return err(`open : Не удаётся найти "${FS.display(p)}".`);
    FileOps.open(p);
  });
  alias('edit notepad nano vim code', a => {
    if (!a[0]) return Apps.launch('notepad');
    const p = resolve(a[0]);
    if (!FS.get(p)) { try { FS.write(p, ''); } catch (e) { return err('edit : ' + e.message); } }
    Apps.launch('notepad', { path: p });
  });
  alias('start start-process', a => {
    if (!a[0] || a[0] === 'apps') {
      print('Приложения:', 'hl');
      Apps.all().forEach(x => printHTML(`  <span class="c-y">${x.id.padEnd(14)}</span>${esc(x.name)}`));
      return;
    }
    const q = a[0].toLowerCase();
    const app = Apps.get(q) || Apps.all().find(x => x.name.toLowerCase() === q || x.name.toLowerCase().startsWith(q) || (x.keywords || '').split(' ').includes(q));
    if (app) { Apps.launch(app.id); print(`Запуск: ${app.name}`, 'dim'); return; }
    const p = resolve(a[0]);
    if (FS.get(p)) return FileOps.open(p);
    if (/^https?:|\.\w{2,}$/.test(a[0])) return Apps.launch('browser', { url: a[0] });
    err(`start : Не удаётся найти приложение или файл "${a[0]}".`);
  });
  alias('apps', () => C.start(['apps']));
  alias('ps tasklist get-process', () => {
    printHTML('<span class="c-hl">PID     Приложение         Окно</span>');
    printHTML('<span class="c-hl">---     ----------         ----</span>');
    [{ id: 'sys4', title: 'System' }, { id: 'sys88', title: 'Рабочий стол Windows' }].forEach(s => print(`${String(pid(s)).padEnd(8)}${'system'.padEnd(19)}${s.title}`));
    WM.list().forEach(w => print(`${String(pid(w)).padEnd(8)}${w.app.padEnd(19)}${w.title}`));
  });
  alias('kill taskkill stop-process', async a => {
    if (!a[0]) return err('kill : Укажите PID или имя приложения.');
    const key = a.filter(x => !x.startsWith('/') && !x.startsWith('-')).pop();
    const wins = WM.list().filter(w => String(pid(w)) === key || w.app === key.toLowerCase());
    if (!wins.length) return err(`kill : Процесс "${key}" не найден.`);
    for (const w of wins) { if (w === win) continue; await w.close(true); print(`УСПЕШНО: процесс ${w.app} с PID ${pid(w)} завершён.`); }
  });
  alias('calc', a => {
    if (!a.length) return Apps.launch('calculator');
    try { print(MathParser.format(MathParser.evaluate(a.join(' ')))); } catch (e) { err('calc : ' + e.message); }
  });
  alias('date get-date', () => print(cap(fmtDateLong(Date.now())) + ', ' + fmtTime(Date.now(), true)));
  alias('time', () => print(fmtTime(Date.now(), true)));
  alias('uptime', () => { const s = Math.floor((Date.now() - (window.__bootTime || Date.now())) / 1000); print(`Система работает: ${Math.floor(s / 3600)} ч ${Math.floor(s / 60) % 60} мин ${s % 60} с`); });
  alias('whoami', () => print(`${Store.get('deviceName').toLowerCase()}\\${Store.get('userName')}`));
  alias('hostname', () => print(Store.get('deviceName')));
  alias('ver winver', () => print(`WindowsFX [Версия ${Persist.get('update.installed', false) ? '12.0.28000.1105' : '12.0.28000.1012'}]`));
  alias('systeminfo neofetch', () => {
    const logo = ['        ████████  ████████', '        ████████  ████████', '        ████████  ████████', '        ████████  ████████', '', '        ████████  ████████', '        ████████  ████████', '        ████████  ████████', '        ████████  ████████'];
    const info = [
      `<span class="c-b">${esc(Store.get('userName'))}</span>@<span class="c-b">${esc(Store.get('deviceName'))}</span>`, '─────────────────────',
      `<span class="c-b">ОС:</span> WindowsFX ${FX.info().version || ''} (Android ${FX.info().android || ''})`,
      `<span class="c-b">Ядро:</span> ${esc(navigator.userAgent.match(/(Chrome|Firefox|Safari|Edg)\/[\d.]+/)?.[0] || 'JS')}`,
      `<span class="c-b">Время работы:</span> ${Math.floor((Date.now() - (window.__bootTime || Date.now())) / 60000)} мин`,
      `<span class="c-b">Оболочка:</span> PowerShell 7.5 (эмуляция)`,
      `<span class="c-b">Экран:</span> ${screen.width}x${screen.height}`,
      `<span class="c-b">Тема:</span> ${document.documentElement.dataset.theme === 'dark' ? 'Тёмная' : 'Светлая'}, акцент ${Store.get('accent')}`,
      `<span class="c-b">ЦП:</span> ${navigator.hardwareConcurrency || '?'} потоков`,
      `<span class="c-b">Память:</span> ${navigator.deviceMemory ? navigator.deviceMemory + ' ГБ' : 'н/д'}`,
      `<span class="c-b">Окна:</span> ${WM.list().length}`,
    ];
    for (let i = 0; i < Math.max(logo.length, info.length); i++) printHTML(`<span class="c-b">${esc((logo[i] || '').padEnd(30))}</span>${info[i] || ''}`);
  });
  alias('df', () => {
    printHTML('<span class="c-hl">Диск  Метка              Всего       Занято      Свободно</span>');
    FS.drives().forEach(d => print(`${d.letter.padEnd(6)}${d.label.padEnd(19)}${fmtBytes(d.total).padEnd(12)}${fmtBytes(d.used).padEnd(12)}${fmtBytes(d.free)}`));
  });
  alias('weather', async a => {
    try {
      if (a.length) { const r = await Weather.geocode(a.join(' ')); if (!r.length) return err('Город не найден.'); await Weather.setPlace(r[0]); }
      const d = await Weather.load();
      print(`${d.place.name}${d.place.country ? ', ' + d.place.country : ''}: ${Weather.temp(d.current.temp)}, ${Weather.desc(d.current.code)}`, 'hl');
      print(`Ощущается как ${Weather.temp(d.current.feels)} · ветер ${Math.round(d.current.wind)} м/с · влажность ${d.current.humidity}%`);
      d.daily.slice(0, 5).forEach(x => print(`  ${new Date(x.date).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }).padEnd(14)} ${Weather.temp(x.min).padStart(4)} … ${Weather.temp(x.max).padEnd(5)} ${Weather.desc(x.code)}`));
    } catch (e) { err('weather : ' + e.message); }
  });
  alias('ping test-connection', async a => {
    if (!a[0]) return err('ping : Укажите адрес узла.');
    if (!Net.online()) return err('ping : ' + Net.reason());
    const host = a[0].replace(/^https?:\/\//, '').split('/')[0];
    print(`Обмен пакетами с ${host}:`);
    const times = [];
    for (let i = 0; i < 4; i++) {
      const t = performance.now();
      try {
        await fetch(`https://${host}/favicon.ico?_=${Math.random()}`, { mode: 'no-cors', cache: 'no-store' });
        const ms = Math.round(performance.now() - t); times.push(ms);
        print(`Ответ от ${host}: время=${ms}мс`);
      } catch { print(`Превышен интервал ожидания для запроса.`, 'err'); }
      await sleep(400);
    }
    if (times.length) print(`Статистика: отправлено = 4, получено = ${times.length}; мин = ${Math.min(...times)}мс, макс = ${Math.max(...times)}мс, среднее = ${Math.round(times.reduce((x, y) => x + y) / times.length)}мс`, 'dim');
  });
  alias('theme', a => { if (!['dark', 'light', 'auto'].includes(a[0])) return err('theme : Используйте theme dark | light | auto'); Store.set('theme', a[0]); print('Тема изменена.', 'dim'); });
  alias('accent', a => { if (!/^#[0-9a-f]{6}$/i.test(a[0] || '')) return err('accent : Укажите цвет в формате #RRGGBB'); Store.set('accent', a[0].toLowerCase()); print('Цвет акцента изменён.', 'dim'); });
  alias('wallpaper', a => {
    const ids = Object.keys(Desktop.WALLPAPERS);
    if (!a[0] || a[0] === 'list') { print('Доступные обои: ' + ids.join(', ')); return; }
    if (!ids.includes(a[0])) { const p = resolve(a[0]); if (FS.typeOf(p).kind === 'image') { FileOps.setWallpaper(p); return; } return err('wallpaper : Неизвестные обои. Введите wallpaper list'); }
    Store.set('wallpaper', a[0]); print('Обои изменены.', 'dim');
  });
  alias('volume', a => { const v = +a[0]; if (isNaN(v)) return print(`Громкость: ${Store.get('volume')}%`); Store.set('volume', clamp(Math.round(v), 0, 100)); Store.set('muted', false); print(`Громкость: ${Store.get('volume')}%`); });
  alias('notify', a => UI.notify({ title: 'Терминал', body: a.join(' ') || 'Привет!', app: 'terminal' }));
  alias('color', a => {
    const s = ['campbell', 'matrix', 'ocean', 'light', 'retro'];
    if (!s.includes(a[0])) return print('Схемы: ' + s.join(', '));
    scheme = a[0]; b.dataset.scheme = scheme; Persist.set('terminal.scheme', scheme);
  });
  alias('history', () => hist.slice(-50).forEach((c, i) => print(`${String(i + 1).padStart(4)}  ${c}`)));
  alias('lock', () => Power.lock());
  alias('shutdown', a => a.includes('/r') || a.includes('-r') ? Power.restart() : Power.shutdown());
  alias('restart reboot', () => Power.restart());
  alias('sleep', () => Power.sleep());
  alias('exit', () => win.close());
  alias('fortune joke', () => {
    const j = ['Есть 10 типов людей: те, кто понимает двоичную систему, и те, кто нет.', 'Работает — не трогай.', 'Программист — это машина для превращения кофе в код.', 'Сначала было слово. Потом — синтаксическая ошибка.', 'Лучший способ предсказать будущее — запрограммировать его.', '// TODO: придумать шутку'];
    print(j[Math.floor(Math.random() * j.length)]);
  });
  alias('matrix', () => new Promise(res => {
    const cv = h('<canvas class="term-matrix"></canvas>');
    b.append(cv);
    const W = cv.width = b.clientWidth, H = cv.height = b.clientHeight;
    const g = cv.getContext('2d');
    const cols = Math.floor(W / 14), drops = Array(cols).fill(0).map(() => Math.random() * -50);
    const chars = 'アイウエオカキクケコサシスセソ0123456789ЖЯЙЦУКЕН';
    let n = 0;
    const iv = setInterval(() => {
      g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#3cff7a'; g.font = '14px monospace';
      drops.forEach((d, i) => { g.fillText(chars[Math.floor(Math.random() * chars.length)], i * 14, d * 14); drops[i] = d * 14 > H && Math.random() > 0.97 ? 0 : d + 1; });
      if (++n > 220) { clearInterval(iv); cv.remove(); res(); }
    }, 33);
    busy = () => { clearInterval(iv); cv.remove(); res(); };
  }));

  // ---------- Выполнение ----------
  async function run(line) {
    printHTML(`<span class="c-p">${esc(prompt())}</span> ${esc(line)}`);
    line = line.trim();
    if (!line) return;
    hist.push(line);
    if (hist.length > 200) hist.shift();
    Persist.set('terminal.history', hist);
    hIdx = hist.length;
    let tokens = parse(line);
    // перенаправление вывода
    const ri = tokens.findIndex(t => t === '>' || t === '>>');
    if (ri >= 0) {
      const file = tokens[ri + 1];
      if (!file) return err('Не указан файл для перенаправления.');
      redirect = { path: resolve(file), append: tokens[ri] === '>>', buf: [] };
      tokens = tokens.slice(0, ri);
    }
    const cmd = (tokens.shift() || '').toLowerCase();
    const fn = C[cmd];
    try {
      if (!fn) {
        // попытка запустить файл или приложение по имени
        const p = resolve(cmd);
        if (FS.get(p) && FS.get(p).t === 'f') { FileOps.open(p); }
        else if (Apps.get(cmd)) Apps.launch(cmd);
        else err(`${cmd} : Имя "${cmd}" не распознано как имя командлета, функции или исполняемой программы. Введите help для справки.`);
      } else {
        inp.disabled = true;
        await fn(tokens);
      }
    } catch (e) { err(String(e.message || e)); }
    finally {
      inp.disabled = false;
      busy = null;
      if (redirect) {
        const r = redirect; redirect = null;
        try {
          const prev = r.append && FS.get(r.path)?.t === 'f' ? FS.read(r.path) : '';
          FS.write(r.path, prev + (prev && !prev.endsWith('\n') ? '\n' : '') + r.buf.join('\n') + '\n');
        } catch (e) { err(e.message); }
      }
      inp.focus();
      scroll();
    }
  }

  function complete() {
    const v = inp.value;
    const parts = v.split(' ');
    const last = parts[parts.length - 1];
    if (parts.length === 1) {
      const m = Object.keys(C).filter(c => c.startsWith(last.toLowerCase()));
      if (m.length === 1) inp.value = m[0] + ' ';
      else if (m.length > 1) print(m.join('  '), 'dim');
      return;
    }
    const slash = Math.max(last.lastIndexOf('/'), last.lastIndexOf('\\'));
    const dirPart = slash >= 0 ? last.slice(0, slash + 1) : '';
    const namePart = (slash >= 0 ? last.slice(slash + 1) : last).replace(/^"/, '').toLowerCase();
    const dir = resolve(dirPart || '.');
    if (!FS.isDir(dir)) return;
    const m = FS.list(dir).filter(it => it.name.toLowerCase().startsWith(namePart));
    if (m.length === 1) {
      let n = m[0].name + (m[0].isDir ? '\\' : '');
      if (/\s/.test(n)) n = `"${dirPart}${n}"`; else n = dirPart + n;
      parts[parts.length - 1] = n;
      inp.value = parts.join(' ');
    } else if (m.length > 1) {
      print(m.map(x => x.name).join('  '), 'dim');
      let common = m[0].name;
      m.forEach(x => { while (!x.name.toLowerCase().startsWith(common.toLowerCase())) common = common.slice(0, -1); });
      if (common.length > namePart.length) { parts[parts.length - 1] = dirPart + common; inp.value = parts.join(' '); }
    }
  }

  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const v = inp.value; inp.value = ''; run(v); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (hIdx > 0) { hIdx--; inp.value = hist[hIdx]; } }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (hIdx < hist.length - 1) { hIdx++; inp.value = hist[hIdx]; } else { hIdx = hist.length; inp.value = ''; } }
    else if (e.key === 'Tab') { e.preventDefault(); complete(); }
    else if (e.ctrlKey && e.code === 'KeyL') { e.preventDefault(); out.innerHTML = ''; }
    else if (e.ctrlKey && e.code === 'KeyC' && !inp.value.slice(inp.selectionStart, inp.selectionEnd)) { if (busy) busy(); printHTML(`<span class="c-p">${esc(prompt())}</span> ${esc(inp.value)}^C`); inp.value = ''; }
  });
  b.addEventListener('mouseup', () => { if (!getSelection().toString()) inp.focus(); });
  win.onFocus = () => setTimeout(() => inp.focus(), 0);
  b.addEventListener('contextmenu', async e => {
    e.preventDefault();
    const s = getSelection().toString();
    if (s) { navigator.clipboard?.writeText(s); getSelection().removeAllRanges(); }
    else { try { inp.value += await navigator.clipboard.readText(); inp.focus(); } catch {} }
  });

  print('Windows PowerShell');
  print('WindowsFX — рабочий стол для Android.');
  print('');
  printHTML('Установите последнюю версию PowerShell для новых функций и улучшения! Введите <span class="c-y">help</span>, чтобы увидеть список команд.');
  print('');
  updPrompt();
  setTimeout(() => inp.focus(), 50);
  return win;
}
