/* Погода */
'use strict';

Apps.register({
  id: 'weather', name: 'Погода', icon: 'weather', desc: 'Прогноз погоды (Open-Meteo)', single: true, network: true,
  keywords: 'погода прогноз температура weather',
  launch: () => openWeather(),
});

function openWeather() {
  const win = WM.open({ app: 'weather', title: 'Погода', width: 860, height: 600, minWidth: 460, minHeight: 400 });
  const b = win.body;
  b.classList.add('wx');

  async function render(force) {
    b.innerHTML = `<div class="empty-state"><div class="ring-loader"></div>Загрузка прогноза…</div>`;
    try {
      const d = await Weather.load(force);
      const c = d.current;
      b.innerHTML = `
        <div class="wx-top"><label class="wx-search input">${Icons.ui('search', 14)}<input placeholder="Поиск города" spellcheck="false"></label><div class="wx-sugg"></div><span class="spacer"></span><button class="icon-btn wx-ref" title="Обновить">${Icons.ui('refresh', 16)}</button></div>
        <div class="wx-hero">
          <div><div class="wx-city">${Icons.ui('location', 16)} ${esc(d.place.name)}${d.place.country ? ', ' + esc(d.place.country) : ''}</div>
          <div class="wx-now">${Weather.icon(c.code, c.isDay, 110)}<span class="wx-temp">${Weather.temp(c.temp)}</span></div>
          <div class="wx-desc">${esc(Weather.desc(c.code))}</div><div class="muted">Обновлено в ${fmtTime(d.fetched)}</div></div>
          <div class="wx-details">
            <div>${Icons.ui('thermo', 18)}<span>Ощущается</span><b>${Weather.temp(c.feels)}</b></div>
            <div>${Icons.ui('wind', 18)}<span>Ветер</span><b>${Math.round(c.wind)} м/с</b></div>
            <div>${Icons.ui('drop', 18)}<span>Влажность</span><b>${c.humidity}%</b></div>
            <div>${Icons.ui('gauge', 18)}<span>Давление</span><b>${c.pressure} мм</b></div>
            <div>${Icons.ui('sunrise', 18)}<span>Восход</span><b>${d.daily[0].sunrise.slice(11)}</b></div>
            <div>${Icons.ui('moon', 18)}<span>Закат</span><b>${d.daily[0].sunset.slice(11)}</b></div>
          </div>
        </div>
        <div class="wx-sec">По часам</div>
        <div class="wx-hours">${d.hourly.map(x => `<div><span class="muted small">${x.t.slice(11, 16)}</span>${Weather.icon(x.code, x.isDay, 36)}<b>${Weather.temp(x.temp)}</b>${x.pop ? `<span class="small" style="color:#4fa3ff">${x.pop}%</span>` : ''}</div>`).join('')}</div>
        <div class="wx-sec">На 7 дней</div>
        <div class="wx-days">${d.daily.map((x, i) => `<div><b>${i ? cap(new Date(x.date).toLocaleDateString('ru-RU', { weekday: 'short' })) : 'Сегодня'}</b><span class="muted small">${new Date(x.date).getDate()} ${MONTHS_GEN[new Date(x.date).getMonth()].slice(0, 3)}</span>${Weather.icon(x.code, 1, 44)}<b>${Weather.temp(x.max)}</b><span class="muted">${Weather.temp(x.min)}</span></div>`).join('')}</div>`;
      $('.wx-ref', b).onclick = () => render(true);
      const inp = $('.wx-search input', b), sug = $('.wx-sugg', b);
      inp.oninput = debounce(async () => {
        const q = inp.value.trim();
        if (q.length < 2) { sug.innerHTML = ''; return; }
        try {
          const res = await Weather.geocode(q);
          sug.innerHTML = '';
          res.forEach(p => { const r = h(`<div>${esc(p.name)}<span class="muted small"> ${esc([p.admin, p.country].filter(Boolean).join(', '))}</span></div>`); r.onclick = async () => { sug.innerHTML = ''; await Weather.setPlace(p); render(); }; sug.append(r); });
        } catch {}
      }, 300);
    } catch (e) {
      b.innerHTML = '';
      b.append(Net.online() ? h(`<div class="empty-state">${Icons.ui('alert', 40)}<div>${esc(e.message)}</div></div>`) : offlineScreen(() => render(true)));
    }
  }
  render();
  return win;
}
