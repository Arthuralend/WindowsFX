/* 2048 */
'use strict';

Apps.register({
  id: 'game2048', name: '2048', icon: 'game2048', desc: 'Соберите плитку 2048',
  keywords: 'игра 2048 головоломка',
  launch: () => open2048(),
});

function open2048() {
  const win = WM.open({ app: 'game2048', title: '2048', width: 420, height: 560, minWidth: 340, minHeight: 480, remember: false });
  const b = win.body;
  b.classList.add('g2');
  let grid, score, best = Persist.get('2048.best', 0), won;

  b.innerHTML = `<div class="g2-top"><b class="g2-logo">2048</b><span class="spacer"></span><div class="g2-score"><span>СЧЁТ</span><b class="g2-s">0</b></div><div class="g2-score"><span>РЕКОРД</span><b class="g2-b">${best}</b></div></div>
    <div class="row-gap" style="padding:0 18px"><span class="muted small">Стрелки или WASD — двигать плитки</span><span class="spacer"></span><button class="btn sm g2-new">Новая игра</button></div>
    <div class="g2-board"></div>`;
  const board = $('.g2-board', b);

  function add() {
    const empty = [];
    grid.forEach((v, i) => !v && empty.push(i));
    if (empty.length) grid[empty[Math.floor(Math.random() * empty.length)]] = Math.random() < 0.9 ? 2 : 4;
  }
  function render(newIdx = -1) {
    board.innerHTML = grid.map((v, i) => `<div class="g2-cell"><div class="g2-tile t${Math.min(v, 4096)} ${i === newIdx ? 'new' : ''}">${v || ''}</div></div>`).join('');
    $('.g2-s', b).textContent = score;
    if (score > best) { best = score; Persist.set('2048.best', best); }
    $('.g2-b', b).textContent = best;
  }
  function newGame() { grid = Array(16).fill(0); score = 0; won = false; add(); add(); render(); }

  function move(dir) {
    const old = grid.join();
    for (let k = 0; k < 4; k++) {
      const idx = [0, 1, 2, 3].map(j => dir === 'left' ? k * 4 + j : dir === 'right' ? k * 4 + 3 - j : dir === 'up' ? j * 4 + k : (3 - j) * 4 + k);
      let line = idx.map(i => grid[i]).filter(Boolean);
      for (let j = 0; j < line.length - 1; j++) if (line[j] === line[j + 1]) { line[j] *= 2; score += line[j]; if (line[j] === 2048 && !won) { won = true; UI.notify({ title: '2048! 🎉', body: 'Вы собрали плитку 2048!', app: 'game2048' }); } line.splice(j + 1, 1); }
      while (line.length < 4) line.push(0);
      idx.forEach((i, j) => (grid[i] = line[j]));
    }
    if (grid.join() === old) return;
    add();
    render();
    const canMove = grid.some((v, i) => !v || (i % 4 < 3 && v === grid[i + 1]) || (i < 12 && v === grid[i + 4]));
    if (!canMove) setTimeout(() => UI.alert('2048', `Игра окончена! Ваш счёт: ${score}`, 'info').then(newGame), 200);
  }
  win.el.tabIndex = -1;
  win.el.addEventListener('keydown', e => {
    const m = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down' }[e.code];
    if (m && !e.ctrlKey) { e.preventDefault(); move(m); }
  });
  let sx, sy;
  board.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; });
  board.addEventListener('pointerup', e => { const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.max(Math.abs(dx), Math.abs(dy)) > 30) move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')); });
  $('.g2-new', b).onclick = newGame;
  newGame();
  setTimeout(() => win.el.focus(), 50);
  return win;
}
