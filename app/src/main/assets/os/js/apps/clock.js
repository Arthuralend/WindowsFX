/* Часы: будильники, таймер, секундомер, мировое время */
'use strict';

Apps.register({
  id: 'clock', name: 'Часы', icon: 'clock', desc: 'Будильник, таймер, секундомер', single: true,
  keywords: 'часы будильник таймер секундомер время',
  launch: args => openClock(args),
});

function openClock(args = {}) {
  const win = WM.open({ app: 'clock', title: 'Часы', width: 720, height: 520, minWidth: 420, minHeight: 380 });
  const b = win.body;
  b.classList.add('ck');
  let tab = args.tab || 'timer';
  b.innerHTML = `<div class="ck-head"><div class="pivot">
    <button data-t="timer">Таймер</button><button data-t="alarm">Будильник</button><button data-t="sw">Секундомер</button><button data-t="world">Мировое время</button>
  </div></div><div class="ck-body"></div>`;
  const body = $('.ck-body', b);
  const fmtMs = (ms, cs) => { const s = Math.floor(ms / 1000); return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}${cs ? ',' + pad2(Math.floor(ms / 10) % 100) : ''}`; };

  function render() {
    $$('.pivot button', b).forEach(x => x.classList.toggle('on', x.dataset.t === tab));
    if (tab === 'timer') {
      const ts = ClockService.timers();
      body.innerHTML = `<div class="ck-presets">${[1, 3, 5, 10, 15, 30].map(m => `<button class="btn" data-m="${m}">${m} мин</button>`).join('')}<button class="btn primary ck-custom">${Icons.ui('plus', 14)} Свой</button></div>
        <div class="ck-timers">${ts.length ? '' : '<div class="empty-state">Запустите таймер — он сработает, даже если закрыть это окно.</div>'}</div>`;
      ts.forEach(t => {
        const left = ClockService.timerLeft(t);
        const pct = 1 - left / t.duration;
        const c = h(`<div class="ck-timer"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="trk"/><circle cx="60" cy="60" r="52" class="prg" stroke-dasharray="326.7" stroke-dashoffset="${326.7 * pct}"/></svg>
          <div class="ck-tt">${fmtMs(left)}</div><div class="muted small">${esc(t.label || 'Таймер')}</div>
          <div class="row-gap"><button class="icon-btn ck-p">${Icons.ui(t.paused ? 'play' : 'pause', 16)}</button><button class="icon-btn ck-x">${Icons.ui('close', 16)}</button></div></div>`);
        $('.ck-p', c).onclick = () => ClockService.pauseTimer(t.id);
        $('.ck-x', c).onclick = () => ClockService.removeTimer(t.id);
        $('.ck-timers', body).append(c);
      });
      $$('[data-m]', body).forEach(x => x.onclick = () => ClockService.addTimer(x.dataset.m * 60e3, `Таймер на ${x.dataset.m} мин`));
      $('.ck-custom', body).onclick = async () => {
        const v = await UI.prompt('Новый таймер', 'Длительность в минутах:', '25', { validate: v => +v > 0 && +v <= 1440 ? '' : 'Введите число от 1 до 1440' });
        if (v) ClockService.addTimer(+v * 60e3, `Таймер на ${v} мин`);
      };
    } else if (tab === 'alarm') {
      body.innerHTML = `<div class="ck-alarms"></div><button class="btn primary ck-add">${Icons.ui('plus', 14)} Добавить будильник</button>`;
      ClockService.alarms().forEach(a => {
        const r = h(`<div class="ck-alarm ${a.enabled ? '' : 'off'}"><div><div class="ck-at">${a.time}</div><div class="muted small">${esc(a.label || 'Будильник')} · ${a.days.length ? a.days.map(d => WEEKDAYS_SHORT[d]).join(', ') : 'Однократно'}</div></div><span class="spacer"></span>${toggleHTML('', a.enabled, false)}<button class="icon-btn ck-del">${Icons.ui('trash', 16)}</button></div>`);
        $('input', r).onchange = e => ClockService.updateAlarm(a.id, { enabled: e.target.checked });
        $('.ck-del', r).onclick = () => ClockService.removeAlarm(a.id);
        $('.ck-alarms', body).append(r);
      });
      $('.ck-add', body).onclick = async () => {
        const n = new Date(Date.now() + 60e3);
        const time = await UI.prompt('Новый будильник', 'Время (ЧЧ:ММ):', pad2(n.getHours()) + ':' + pad2(n.getMinutes()), { validate: v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? '' : 'Формат: 07:30' });
        if (!time) return;
        const label = await UI.prompt('Новый будильник', 'Название:', 'Будильник');
        ClockService.addAlarm({ time, label: label || '' });
      };
    } else if (tab === 'sw') {
      const sw = ClockService.stopwatch;
      body.innerHTML = `<div class="ck-sw"><div class="ck-swt">${fmtMs(ClockService.swElapsed(), true)}</div>
        <div class="row-gap"><button class="btn primary lg ck-ss">${sw.running ? 'Стоп' : 'Старт'}</button><button class="btn lg ck-lap" ${sw.running ? '' : 'disabled'}>Круг</button><button class="btn lg ck-reset">Сброс</button></div>
        <div class="ck-laps">${sw.laps.map((l, i) => `<div><span>Круг ${sw.laps.length - i}</span><b>${fmtMs(l, true)}</b></div>`).join('')}</div></div>`;
      $('.ck-ss', body).onclick = () => { if (sw.running) { sw.elapsed += Date.now() - sw.start; sw.running = false; } else { sw.start = Date.now(); sw.running = true; } render(); };
      $('.ck-lap', body).onclick = () => { sw.laps.unshift(ClockService.swElapsed()); render(); };
      $('.ck-reset', body).onclick = () => { sw.running = false; sw.elapsed = 0; sw.laps = []; render(); };
    } else {
      const zones = [['Москва', 'Europe/Moscow'], ['Лондон', 'Europe/London'], ['Нью-Йорк', 'America/New_York'], ['Токио', 'Asia/Tokyo'], ['Дубай', 'Asia/Dubai'], ['Сидней', 'Australia/Sydney']];
      body.innerHTML = `<div class="ck-world">${zones.map(([n, z]) => {
        const t = new Date().toLocaleTimeString('ru-RU', { timeZone: z, hour: '2-digit', minute: '2-digit' });
        const d = new Date().toLocaleDateString('ru-RU', { timeZone: z, weekday: 'short', day: 'numeric', month: 'short' });
        return `<div class="ck-city"><b>${t}</b><span>${n}</span><span class="muted small">${d}</span></div>`;
      }).join('')}</div>`;
    }
  }
  $$('.pivot button', b).forEach(x => x.onclick = () => { tab = x.dataset.t; render(); });
  const offs = [ClockService.on('tick', () => { if (tab === 'timer' || tab === 'world') render(); }), ClockService.on('timers', () => tab === 'timer' && render()), ClockService.on('alarms', () => tab === 'alarm' && render())];
  const fast = setInterval(() => { if (tab === 'sw' && ClockService.stopwatch.running) { const e = $('.ck-swt', body); if (e) e.textContent = fmtMs(ClockService.swElapsed(), true); } }, 47);
  win.onClose = () => { offs.forEach(f => f()); clearInterval(fast); };
  win.onArgs = a => { if (a.tab) { tab = a.tab; render(); } };
  render();
  return win;
}
