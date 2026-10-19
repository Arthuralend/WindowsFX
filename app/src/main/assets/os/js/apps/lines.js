/* Lines — логическая игра в стиле старых DOS-игр (поле 9×9, собирайте по 5 шаров одного цвета в линию).
   Собственная реализация WindowsFX: графика VGA, «бип» PC-спикера, таблица рекордов. */
'use strict';

function openLines() {
  const N = 9, CELL = 40, PAD = 12, TOP = 54;
  const W = N * CELL + PAD * 2, H = N * CELL + PAD + TOP + 14;
  const COLORS = [['#ff3030', '#8a0000'], ['#30d040', '#006a10'], ['#3070ff', '#00157a'], ['#ffe040', '#8a6a00'], ['#ff50ff', '#7a007a'], ['#30e0e0', '#006a6a'], ['#c08040', '#5a3000']];
  const win = WM.open({ app: 'lines', title: 'Lines', width: W + 220, height: H + 70, minWidth: 420, minHeight: 360, bodyClass: 'ln' });
  const b = win.body;
  b.innerHTML = `
    <div class="ln-bar"><button class="ln-btn ln-new">F2 Новая игра</button><button class="ln-btn ln-undo">Отмена хода</button><button class="ln-btn ln-snd">Звук: ВКЛ</button><button class="ln-btn ln-top">Рекорды</button></div>
    <div class="ln-wrap"><canvas class="ln-cv" width="${W}" height="${H}"></canvas><div class="ln-side"><div class="ln-h">РЕКОРДЫ</div><ol class="ln-hs"></ol><div class="ln-help">Щёлкните по шару, затем по пустой клетке.<br>Соберите 5 и более шаров одного цвета в линию — по горизонтали, вертикали или диагонали.</div></div></div>`;
  const cv = $('.ln-cv', b), g = cv.getContext('2d');
  let board, next, score, sel, anim = null, over, undo = null, bounce = 0, grow = [];
  let sound = Persist.get('lines.sound', true);
  const hs = () => Persist.get('lines.scores', []);

  // ---------- звук PC-спикера ----------
  let ac = null;
  function beep(f, ms, delay = 0) {
    if (!sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), v = ac.createGain();
      o.type = 'square'; o.frequency.value = f; v.gain.value = 0.05;
      o.connect(v).connect(ac.destination);
      const t = ac.currentTime + delay / 1000;
      o.start(t); o.stop(t + ms / 1000);
    } catch {}
  }

  function newGame() {
    board = Array.from({ length: N }, () => Array(N).fill(-1));
    score = 0; sel = null; over = false; undo = null; grow = [];
    next = rnd3();
    place(5);
    next = rnd3();
    draw();
  }
  const rnd3 = () => [0, 1, 2].map(() => Math.floor(Math.random() * COLORS.length));
  const empties = () => { const e = []; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (board[y][x] < 0) e.push([x, y]); return e; };
  function place(count) {
    const put = [];
    for (let i = 0; i < count; i++) {
      const e = empties();
      if (!e.length) break;
      const [x, y] = e[Math.floor(Math.random() * e.length)];
      board[y][x] = count === 5 ? Math.floor(Math.random() * COLORS.length) : next[i];
      put.push([x, y]);
    }
    grow = put.map(([x, y]) => ({ x, y, t: 0 }));
    return put;
  }

  function path(sx, sy, tx, ty) {
    const prev = new Map(), q = [[sx, sy]], key = (x, y) => y * N + x;
    prev.set(key(sx, sy), null);
    while (q.length) {
      const [x, y] = q.shift();
      if (x === tx && y === ty) {
        const p = []; let k = key(x, y);
        while (k !== null) { p.unshift([k % N, Math.floor(k / N)]); k = prev.get(k); }
        return p;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N || board[ny][nx] >= 0 || prev.has(key(nx, ny))) continue;
        prev.set(key(nx, ny), key(x, y)); q.push([nx, ny]);
      }
    }
    return null;
  }

  function lines(x, y) {
    const c = board[y][x];
    if (c < 0) return [];
    const out = new Set();
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const run = [[x, y]];
      for (const s of [1, -1]) {
        let nx = x + dx * s, ny = y + dy * s;
        while (nx >= 0 && ny >= 0 && nx < N && ny < N && board[ny][nx] === c) { run.push([nx, ny]); nx += dx * s; ny += dy * s; }
      }
      if (run.length >= 5) run.forEach(([a, b2]) => out.add(a + ',' + b2));
    }
    return [...out].map(s => s.split(',').map(Number));
  }
  const points = n => n * 2 + (n - 5) * (n - 5) * 4;

  function removeAt(cells) {
    if (!cells.length) return false;
    cells.forEach(([x, y]) => { board[y][x] = -1; });
    score += points(cells.length);
    beep(880, 60); beep(1175, 60, 70); beep(1568, 90, 140);
    return true;
  }

  function move(fx, fy, tx, ty) {
    const p = path(fx, fy, tx, ty);
    if (!p) { beep(110, 140); return; }
    undo = { board: board.map(r => r.slice()), next: next.slice(), score };
    const c = board[fy][fx];
    board[fy][fx] = -1;
    sel = null;
    anim = { p, c, i: 0 };
    const step = () => {
      anim.i++;
      beep(330 + anim.i * 12, 12);
      if (anim.i < p.length - 1) { draw(); setTimeout(step, 45); return; }
      board[ty][tx] = c; anim = null;
      if (!removeAt(lines(tx, ty))) {
        const put = place(3);
        let removed = false;
        put.forEach(([x, y]) => { if (board[y][x] >= 0 && removeAt(lines(x, y))) removed = true; });
        next = rnd3();
        if (!empties().length) gameOver();
        void removed;
      }
      draw();
    };
    step();
  }

  function gameOver() {
    over = true;
    beep(392, 150); beep(330, 150, 160); beep(262, 300, 320);
    const list = hs();
    if (score > 0 && (list.length < 10 || score > list[list.length - 1].s)) {
      setTimeout(async () => {
        const name = (await UI.prompt('Lines — рекорд!', `Ваш счёт: ${score}. Введите имя:`, Store.get('userName') || 'Игрок'))?.trim() || 'Игрок';
        const l = hs(); l.push({ n: name.slice(0, 16), s: score, d: Date.now() }); l.sort((a, c) => c.s - a.s);
        Persist.set('lines.scores', l.slice(0, 10)); drawScores();
      }, 400);
    }
  }

  // ---------- графика VGA ----------
  function ball(x, y, r, c) {
    const [hi, lo] = COLORS[c];
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.18, hi); gr.addColorStop(1, lo);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  function cellXY(x, y) { return [PAD + x * CELL, TOP + y * CELL]; }
  function draw() {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    // табло
    g.fillStyle = '#0000aa'; g.fillRect(0, 0, W, TOP - 8);
    g.fillStyle = '#5555ff'; g.fillRect(0, TOP - 10, W, 2);
    g.font = 'bold 22px "Courier New", monospace'; g.textBaseline = 'middle';
    g.fillStyle = '#ffff55'; g.textAlign = 'left'; g.fillText(String(score).padStart(5, '0'), 12, 23);
    const best = Math.max(score, hs()[0]?.s || 0);
    g.fillStyle = '#55ffff'; g.textAlign = 'right'; g.fillText(String(best).padStart(5, '0'), W - 12, 23);
    next.forEach((c, i) => ball(W / 2 - 34 + i * 34, 23, 12, c));
    // поле
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const [cx, cy] = cellXY(x, y);
      g.fillStyle = '#aaaaaa'; g.fillRect(cx, cy, CELL, CELL);
      g.fillStyle = '#ffffff'; g.fillRect(cx, cy, CELL - 2, 2); g.fillRect(cx, cy, 2, CELL - 2);
      g.fillStyle = '#555555'; g.fillRect(cx + 2, cy + CELL - 2, CELL - 2, 2); g.fillRect(cx + CELL - 2, cy + 2, 2, CELL - 2);
      const c = board[y][x];
      if (c >= 0) {
        let r = CELL * 0.36, oy = 0;
        const gw = grow.find(q => q.x === x && q.y === y);
        if (gw) r *= Math.min(1, gw.t);
        if (sel && sel[0] === x && sel[1] === y) oy = -Math.abs(Math.sin(bounce)) * 6;
        ball(cx + CELL / 2, cy + CELL / 2 + oy, r, c);
      }
    }
    if (anim) { const [ax, ay] = anim.p[anim.i]; const [cx, cy] = cellXY(ax, ay); ball(cx + CELL / 2, cy + CELL / 2, CELL * 0.36, anim.c); }
    if (over) {
      g.fillStyle = 'rgba(0,0,170,.85)'; g.fillRect(PAD + 30, TOP + CELL * 3.5, W - PAD * 2 - 60, CELL * 2);
      g.strokeStyle = '#ffff55'; g.lineWidth = 2; g.strokeRect(PAD + 34, TOP + CELL * 3.5 + 4, W - PAD * 2 - 68, CELL * 2 - 8);
      g.fillStyle = '#ffff55'; g.textAlign = 'center'; g.font = 'bold 22px "Courier New", monospace';
      g.fillText('ИГРА ОКОНЧЕНА', W / 2, TOP + CELL * 4.2);
      g.font = 'bold 15px "Courier New", monospace'; g.fillStyle = '#ffffff';
      g.fillText('F2 — новая игра', W / 2, TOP + CELL * 4.9);
    }
  }
  function drawScores() {
    $('.ln-hs', b).innerHTML = hs().map(x => `<li><span>${esc(x.n)}</span><b>${x.s}</b></li>`).join('') || '<li class="muted">пока пусто</li>';
  }

  let raf = 0;
  const loop = () => {
    if (!cv.isConnected) return;
    let dirty = false;
    if (sel) { bounce += 0.18; dirty = true; }
    if (grow.length) { grow.forEach(q => { q.t += 0.12; }); grow = grow.filter(q => q.t < 1); dirty = true; }
    if (dirty) draw();
    raf = requestAnimationFrame(loop);
  };

  cv.addEventListener('click', e => {
    if (anim) return;
    if (over) return newGame();
    const r = cv.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) * (W / r.width) - PAD) / CELL);
    const y = Math.floor(((e.clientY - r.top) * (H / r.height) - TOP) / CELL);
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    if (board[y][x] >= 0) { sel = [x, y]; bounce = 0; beep(660, 25); draw(); }
    else if (sel) move(sel[0], sel[1], x, y);
  });
  const doUndo = () => { if (!undo || anim) return; board = undo.board; next = undo.next; score = undo.score; undo = null; over = false; sel = null; draw(); };
  $('.ln-new', b).onclick = newGame;
  $('.ln-undo', b).onclick = doUndo;
  $('.ln-snd', b).onclick = e => { sound = !sound; Persist.set('lines.sound', sound); e.currentTarget.textContent = 'Звук: ' + (sound ? 'ВКЛ' : 'ВЫКЛ'); };
  $('.ln-snd', b).textContent = 'Звук: ' + (sound ? 'ВКЛ' : 'ВЫКЛ');
  $('.ln-top', b).onclick = () => b.classList.toggle('ln-noside');
  win.el.addEventListener('keydown', e => {
    if (e.key === 'F2') { e.preventDefault(); newGame(); }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); doUndo(); }
  });
  newGame();
  drawScores();
  loop();
  win.onClose = () => cancelAnimationFrame(raf);
  return win;
}

Apps.register({ id: 'lines', name: 'Lines', icon: 'lines', desc: 'Классическая игра «Линии» в стиле DOS', keywords: 'lines линии шары игра dos color lines пять в ряд', launch: openLines });
