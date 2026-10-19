/* Сапёр */
'use strict';

Apps.register({
  id: 'minesweeper', name: 'Сапёр', icon: 'minesweeper', desc: 'Классическая головоломка',
  keywords: 'игра сапер сапёр мины minesweeper',
  launch: () => openMinesweeper(),
});

function openMinesweeper() {
  const LEVELS = { easy: [9, 9, 10, 'Новичок'], mid: [16, 16, 40, 'Любитель'], hard: [16, 30, 99, 'Профессионал'] };
  let level = Persist.get('mines.level', 'easy');
  let R, Cn, M, cells, started, over, flags, t0, timer;
  const win = WM.open({ app: 'minesweeper', title: 'Сапёр', width: 400, height: 520, minWidth: 300, minHeight: 360, remember: false });
  const b = win.body;
  b.classList.add('ms');

  function newGame() {
    [R, Cn, M] = LEVELS[level];
    cells = Array.from({ length: R * Cn }, () => ({ mine: false, open: false, flag: false, n: 0 }));
    started = false; over = false; flags = 0;
    clearInterval(timer);
    const cell = level === 'hard' ? 26 : 30;
    const w = Math.max(360, Cn * cell + 40), hh = R * cell + 170;
    if (win.state === 'normal') win.setBounds({ w: Math.min(w, innerWidth - 20), h: Math.min(hh, innerHeight - 80) }, true);
    b.innerHTML = `
      <div class="ms-top"><select class="input ms-lvl">${Object.entries(LEVELS).map(([k, v]) => `<option value="${k}" ${k === level ? 'selected' : ''}>${v[3]}</option>`).join('')}</select>
        <span class="ms-cnt">💣 ${M}</span><button class="ms-face">🙂</button><span class="ms-time">⏱ 0</span></div>
      <div class="ms-board" style="grid-template-columns:repeat(${Cn}, ${cell}px)"></div>
      <div class="muted small ms-best">Рекорд: ${Persist.get('mines.best.' + level, null) ? Persist.get('mines.best.' + level) + ' с' : '—'}</div>`;
    const board = $('.ms-board', b);
    cells.forEach((c, i) => {
      const e = h(`<button class="ms-c" style="width:${cell}px;height:${cell}px"></button>`);
      e.onclick = () => reveal(i);
      e.oncontextmenu = ev => { ev.preventDefault(); flag(i); };
      e.onauxclick = ev => { if (ev.button === 1) chord(i); };
      e.ondblclick = () => chord(i);
      c.el = e;
      board.append(e);
    });
    $('.ms-lvl', b).onchange = e => { level = e.target.value; Persist.set('mines.level', level); newGame(); };
    $('.ms-face', b).onclick = newGame;
  }

  const nb = i => { const r = Math.floor(i / Cn), c = i % Cn, out = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (!dr && !dc) continue; const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < R && cc >= 0 && cc < Cn) out.push(rr * Cn + cc); } return out; };

  function place(safe) {
    const forbid = new Set([safe, ...nb(safe)]);
    let k = 0;
    while (k < M) { const i = Math.floor(Math.random() * cells.length); if (!cells[i].mine && !forbid.has(i)) { cells[i].mine = true; k++; } }
    cells.forEach((c, i) => (c.n = nb(i).filter(j => cells[j].mine).length));
    started = true; t0 = Date.now();
    timer = setInterval(() => { $('.ms-time', b).textContent = '⏱ ' + Math.floor((Date.now() - t0) / 1000); }, 500);
  }

  function reveal(i) {
    if (over) return;
    const c = cells[i];
    if (c.flag || c.open) return;
    if (!started) place(i);
    if (c.mine) return lose(i);
    const stack = [i];
    while (stack.length) {
      const j = stack.pop(); const x = cells[j];
      if (x.open || x.flag) continue;
      x.open = true;
      x.el.classList.add('open');
      if (x.n) { x.el.textContent = x.n; x.el.dataset.n = x.n; } else stack.push(...nb(j));
    }
    if (cells.every(x => x.mine || x.open)) win_();
  }
  function flag(i) {
    const c = cells[i];
    if (over || c.open) return;
    c.flag = !c.flag; flags += c.flag ? 1 : -1;
    c.el.textContent = c.flag ? '🚩' : '';
    $('.ms-cnt', b).textContent = '💣 ' + (M - flags);
  }
  function chord(i) {
    const c = cells[i];
    if (!c.open || !c.n) return;
    if (nb(i).filter(j => cells[j].flag).length === c.n) nb(i).forEach(reveal);
  }
  function lose(i) {
    over = true; clearInterval(timer);
    cells.forEach(c => { if (c.mine) { c.el.textContent = '💣'; c.el.classList.add('open'); } });
    cells[i].el.classList.add('boom');
    $('.ms-face', b).textContent = '😵';
    Sound.play('error');
  }
  function win_() {
    over = true; clearInterval(timer);
    const t = Math.floor((Date.now() - t0) / 1000);
    $('.ms-face', b).textContent = '😎';
    const best = Persist.get('mines.best.' + level, null);
    if (!best || t < best) Persist.set('mines.best.' + level, t);
    UI.notify({ title: 'Победа! 🎉', body: `Уровень «${LEVELS[level][3]}» пройден за ${t} с${!best || t < best ? ' — новый рекорд!' : ''}`, app: 'minesweeper' });
  }
  win.onClose = () => clearInterval(timer);
  newGame();
  return win;
}
