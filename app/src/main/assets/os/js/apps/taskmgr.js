/* Диспетчер задач */
'use strict';

Apps.register({
  id: 'taskmgr', name: 'Диспетчер задач', icon: 'taskmgr', desc: 'Процессы и производительность', single: true,
  keywords: 'диспетчер задач процессы taskmgr производительность',
  launch: () => openTaskmgr(),
});

function openTaskmgr() {
  const win = WM.open({ app: 'taskmgr', title: 'Диспетчер задач', width: 820, height: 540, minWidth: 480, minHeight: 320 });
  const b = win.body;
  b.classList.add('tm');
  b.innerHTML = `
    <div class="tm-head"><div class="pivot"><button data-t="proc" class="on">Процессы</button><button data-t="perf">Производительность</button></div><span class="spacer"></span><button class="btn sm tm-end" disabled>${Icons.ui('close', 12)} Снять задачу</button></div>
    <div class="tm-body"></div>`;
  let tab = 'proc', selected = null;
  const cpu = Array(60).fill(0), mem = Array(60).fill(0);
  let frames = 0, raf;
  const countFrames = () => { frames++; raf = requestAnimationFrame(countFrames); };
  countFrames();
  const BASE = { browser: 180, explorer: 45, settings: 60, paint: 70, music: 55, photos: 50, terminal: 30 };
  const memOf = w => (BASE[w.app] || 35) + Math.round(w.el.getElementsByTagName('*').length / 25);

  function sample() {
    const load = clamp((1 - frames / 60) * 100, 0, 100) * 0.6 + 3 + WM.list().length * 1.5 + Math.random() * 6;
    frames = 0;
    cpu.push(clamp(load, 1, 100)); cpu.shift();
    const used = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : WM.list().reduce((a, w) => a + memOf(w), 900);
    mem.push(used); mem.shift();
    render();
  }

  function graph(data, max, color) {
    const W = 600, H = 160;
    const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - (v / max) * H}`).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="tm-graph"><polygon points="0,${H} ${pts} ${W},${H}" fill="${color}" opacity=".18"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  }

  function render() {
    const body = $('.tm-body', b);
    if (tab === 'proc') {
      const wins = WM.list();
      body.innerHTML = `<div class="tm-row tm-th"><span>Имя</span><span>ЦП</span><span>Память</span></div>` +
        wins.map(w => `<div class="tm-row ${selected === w.id ? 'sel' : ''}" data-id="${w.id}"><span class="row-gap">${Icons.get(w.icon, 18)}${esc(w.title)}</span><span>${(Math.random() * (w.isActive() ? 6 : 1.5)).toFixed(1)}%</span><span>${memOf(w)} МБ</span></div>`).join('') +
        `<div class="tm-row"><span class="row-gap">${Icons.get('explorer', 18)}Проводник Windows (оболочка)</span><span>${(Math.random() * 2).toFixed(1)}%</span><span>84 МБ</span></div>`;
      $$('.tm-row[data-id]', body).forEach(r => {
        r.onclick = () => { selected = r.dataset.id; render(); };
        r.ondblclick = () => WM.focus(WM.get(r.dataset.id));
      });
    } else {
      const c = cpu[cpu.length - 1], m = mem[mem.length - 1];
      body.innerHTML = `<div class="tm-perf">
        <div class="tm-card"><div class="row-gap"><b>ЦП</b><span class="spacer"></span><span class="tm-big">${Math.round(c)}%</span></div>${graph(cpu, 100, '#4f8cff')}<span class="muted small">${navigator.hardwareConcurrency || '?'} логических процессоров</span></div>
        <div class="tm-card"><div class="row-gap"><b>Память</b><span class="spacer"></span><span class="tm-big">${Math.round(m)} МБ</span></div>${graph(mem, Math.max(...mem) * 1.3, '#a35cff')}<span class="muted small">${performance.memory ? 'Куча JavaScript' : 'Оценка'} · окон открыто: ${WM.list().length}</span></div>
      </div>`;
    }
    $('.tm-end', b).disabled = !(tab === 'proc' && selected && WM.get(selected));
  }

  $$('.pivot button', b).forEach(x => x.onclick = () => { tab = x.dataset.t; $$('.pivot button', b).forEach(y => y.classList.toggle('on', y === x)); render(); });
  $('.tm-end', b).onclick = () => { const w = WM.get(selected); if (w) w.close(true); selected = null; };
  const iv = setInterval(sample, 1000);
  const off = WM.on('change', () => tab === 'proc' && render());
  win.onClose = () => { clearInterval(iv); cancelAnimationFrame(raf); off(); };
  render();
  return win;
}
