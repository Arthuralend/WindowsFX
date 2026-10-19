/* Фоновые службы: будильники и таймеры, напоминания календаря, погода, батарея */
'use strict';

// ======================= Часы / будильники / таймеры =======================
const ClockService = (() => {
  const em = new Emitter();
  let alarms = Persist.get('alarms', [
    { id: 'a1', time: '07:30', label: 'Подъём', days: [0, 1, 2, 3, 4], enabled: false, fired: '' },
  ]);
  const timers = [];
  const stopwatch = { running: false, start: 0, elapsed: 0, laps: [] };
  let ringing = null;

  const saveAlarms = () => { Persist.set('alarms', alarms); em.emit('alarms'); };

  function ring(title, body, snooze) {
    stopRinging();
    let n = 0;
    Sound.play('alarm', true);
    ringing = setInterval(() => { if (++n > 15) stopRinging(); else Sound.play('alarm', true); }, 2200);
    const actions = [{ label: 'Закрыть', fn: stopRinging }];
    if (snooze) actions.push({ label: 'Отложить на 5 мин', fn: () => { stopRinging(); snooze(); } });
    UI.notify({ title, body, icon: 'clock', app: 'clock', sticky: true, silent: true, actions, onClick: stopRinging });
  }
  function stopRinging() { clearInterval(ringing); ringing = null; }

  function tick() {
    const now = new Date();
    const hm = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    const wd = (now.getDay() + 6) % 7;
    const firedKey = dateKey(now) + ' ' + hm;
    alarms.forEach(a => {
      if (!a.enabled || a.time !== hm || a.fired === firedKey) return;
      if (a.days.length && !a.days.includes(wd)) return;
      a.fired = firedKey;
      if (!a.days.length) a.enabled = false;
      saveAlarms();
      ring('Будильник · ' + a.time, a.label || 'Будильник', () => addTimer(5 * 60e3, 'Отложенный будильник: ' + (a.label || a.time)));
    });
    for (let i = timers.length - 1; i >= 0; i--) {
      const t = timers[i];
      if (!t.paused && t.endAt <= Date.now()) {
        timers.splice(i, 1);
        ring('Таймер завершён', t.label || 'Время вышло!');
        em.emit('timers');
      }
    }
    // напоминания календаря
    const events = Persist.get('calendar.events', []);
    let changed = false;
    events.forEach(ev => {
      if (!ev.time || ev.notified) return;
      const at = new Date(ev.date + 'T' + ev.time + ':00').getTime();
      const remindAt = at - (ev.remind || 0) * 60e3;
      if (Date.now() >= remindAt && Date.now() - at < 60 * 60e3) {
        ev.notified = true; changed = true;
        UI.notify({ title: ev.title, body: (ev.remind ? `Через ${ev.remind} мин · ` : 'Сейчас · ') + ev.time, icon: 'calendar', app: 'calendar', onClick: () => Apps.launch('calendar', { date: ev.date }) });
      }
    });
    if (changed) Persist.set('calendar.events', events);
    em.emit('tick');
  }

  function addTimer(ms, label = '') {
    const t = { id: uid('t'), label, duration: ms, endAt: Date.now() + ms, paused: false, remaining: ms };
    timers.push(t);
    em.emit('timers');
    return t;
  }
  function pauseTimer(id) {
    const t = timers.find(x => x.id === id);
    if (!t) return;
    if (t.paused) { t.endAt = Date.now() + t.remaining; t.paused = false; }
    else { t.remaining = t.endAt - Date.now(); t.paused = true; }
    em.emit('timers');
  }
  function removeTimer(id) {
    const i = timers.findIndex(x => x.id === id);
    if (i >= 0) timers.splice(i, 1);
    em.emit('timers');
  }
  function timerLeft(t) { return t.paused ? t.remaining : Math.max(0, t.endAt - Date.now()); }

  setInterval(tick, 1000);

  return {
    on: (e, f) => em.on(e, f),
    alarms: () => alarms,
    addAlarm(a) { alarms.push({ id: uid('a'), enabled: true, days: [], label: '', fired: '', ...a }); saveAlarms(); },
    updateAlarm(id, patch) { const a = alarms.find(x => x.id === id); if (a) Object.assign(a, patch); saveAlarms(); },
    removeAlarm(id) { alarms = alarms.filter(x => x.id !== id); saveAlarms(); },
    timers: () => timers, addTimer, pauseTimer, removeTimer, timerLeft,
    stopwatch, stopRinging,
    swElapsed: () => stopwatch.elapsed + (stopwatch.running ? Date.now() - stopwatch.start : 0),
  };
})();

// ======================= Погода (Open-Meteo, без ключа) =======================
const Weather = (() => {
  const em = new Emitter();
  let data = Persist.get('weather.cache', null);
  let loading = null;

  const CODES = {
    0: 'Ясно', 1: 'Преимущественно ясно', 2: 'Переменная облачность', 3: 'Пасмурно',
    45: 'Туман', 48: 'Изморозь', 51: 'Слабая морось', 53: 'Морось', 55: 'Сильная морось',
    56: 'Ледяная морось', 57: 'Ледяная морось', 61: 'Небольшой дождь', 63: 'Дождь', 65: 'Сильный дождь',
    66: 'Ледяной дождь', 67: 'Ледяной дождь', 71: 'Небольшой снег', 73: 'Снег', 75: 'Сильный снег', 77: 'Снежные зёрна',
    80: 'Ливень', 81: 'Ливень', 82: 'Сильный ливень', 85: 'Снегопад', 86: 'Сильный снегопад',
    95: 'Гроза', 96: 'Гроза с градом', 99: 'Гроза с сильным градом',
  };

  function kind(code, isDay = 1) {
    if (code === 0 || code === 1) return isDay ? 'sun' : 'moon';
    if (code === 2) return isDay ? 'partly' : 'partly-night';
    if (code === 3) return 'cloud';
    if (code === 45 || code === 48) return 'fog';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 95) return 'storm';
    return 'cloud';
  }

  function icon(code, isDay = 1, size = 32) {
    const k = kind(code, isDay);
    const sun = (cx, cy, r) => `<g><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#wx-sun)"/>${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<rect x="${cx - 1.6}" y="${cy - r - 8}" width="3.2" height="5" rx="1.6" fill="#ffc53d" transform="rotate(${a} ${cx} ${cy})"/>`).join('')}</g>`;
    const moon = (cx, cy) => `<path d="M${cx + 8} ${cy + 9}A13 13 0 1 1 ${cx + 3} ${cy - 14}a10.5 10.5 0 0 0 5 23z" fill="url(#wx-moon)"/>`;
    const cloud = (dx = 0, dy = 0, fill = 'url(#wx-cloud)') => `<path transform="translate(${dx} ${dy})" d="M20 50h26a10 10 0 0 0 1.5-19.9A14 14 0 0 0 20.6 28 11 11 0 0 0 20 50z" fill="${fill}"/>`;
    const defs = '';
    let body = '';
    switch (k) {
      case 'sun': body = sun(32, 32, 13); break;
      case 'moon': body = moon(30, 32); break;
      case 'partly': body = sun(24, 24, 10) + cloud(4, 4); break;
      case 'partly-night': body = `<g transform="translate(-6 -8) scale(.85)">${moon(30, 32)}</g>` + cloud(4, 4); break;
      case 'cloud': body = cloud(-6, -6, 'url(#wx-dark)') + cloud(2, 2); break;
      case 'fog': body = cloud(0, -6) + `<g stroke="#b9c3d6" stroke-width="3" stroke-linecap="round"><path d="M14 50h34M18 57h28"/></g>`; break;
      case 'rain': body = cloud(0, -6, 'url(#wx-dark)') + `<g stroke="#4fa3ff" stroke-width="3" stroke-linecap="round"><path d="M22 50l-3 7M32 50l-3 7M42 50l-3 7"/></g>`; break;
      case 'snow': body = cloud(0, -6) + `<g fill="#9fd4ff"><circle cx="21" cy="53" r="2.6"/><circle cx="32" cy="57" r="2.6"/><circle cx="43" cy="53" r="2.6"/></g>`; break;
      case 'storm': body = cloud(0, -8, 'url(#wx-dark)') + `<path d="M33 42l-7 11h6l-3 9 10-13h-6l3-7z" fill="#ffc53d"/>`; break;
    }
    return `<svg class="wx-icon" viewBox="0 0 64 64" width="${size}" height="${size}">${defs}${body}</svg>`;
  }

  async function geocode(name) {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=6&language=ru&format=json`);
    if (!r.ok) throw new Error('Сервис геокодирования недоступен');
    const j = await r.json();
    return (j.results || []).map(x => ({ name: x.name, country: x.country || '', admin: x.admin1 || '', lat: x.latitude, lon: x.longitude, tz: x.timezone }));
  }

  async function fetchFor(place) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}` +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure' +
      '&hourly=temperature_2m,weather_code,is_day,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,uv_index_max' +
      '&timezone=auto&forecast_days=7&wind_speed_unit=ms';
    const r = await fetch(url);
    if (!r.ok) throw new Error('Сервис погоды недоступен');
    const j = await r.json();
    const c = j.current;
    const nowIdx = Math.max(0, j.hourly.time.findIndex(t => t >= c.time.slice(0, 13) + ':00'));
    return {
      place, fetched: Date.now(),
      current: { temp: c.temperature_2m, feels: c.apparent_temperature, humidity: c.relative_humidity_2m, code: c.weather_code, isDay: c.is_day, wind: c.wind_speed_10m, windDir: c.wind_direction_10m, pressure: Math.round(c.surface_pressure * 0.750062) },
      hourly: j.hourly.time.slice(nowIdx, nowIdx + 24).map((t, i) => ({ t, temp: j.hourly.temperature_2m[nowIdx + i], code: j.hourly.weather_code[nowIdx + i], isDay: j.hourly.is_day[nowIdx + i], pop: j.hourly.precipitation_probability?.[nowIdx + i] })),
      daily: j.daily.time.map((d, i) => ({ date: d, max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i], code: j.daily.weather_code[i], sunrise: j.daily.sunrise[i], sunset: j.daily.sunset[i], pop: j.daily.precipitation_probability_max?.[i], uv: j.daily.uv_index_max?.[i] })),
    };
  }

  async function load(force = false) {
    const city = Store.get('weatherCity');
    if (!force && data && data.place?.query === city && Date.now() - data.fetched < 20 * 60e3) return data;
    if (!Net.online()) throw new Error(Net.reason() || 'Нет подключения к Интернету');
    if (loading) return loading;
    loading = (async () => {
      try {
        let place = data?.place?.query === city ? data.place : null;
        if (!place) {
          const res = await geocode(city);
          if (!res.length) throw new Error(`Город «${city}» не найден`);
          place = { ...res[0], query: city };
        }
        data = await fetchFor(place);
        Persist.set('weather.cache', data);
        em.emit('update', data);
        return data;
      } finally { loading = null; }
    })();
    return loading;
  }

  async function setPlace(p) {
    const q = p.name;
    Store.set('weatherCity', q);
    data = await fetchFor({ ...p, query: q });
    Persist.set('weather.cache', data);
    em.emit('update', data);
    return data;
  }

  function temp(t) {
    if (t === undefined || t === null) return '—';
    const v = Store.get('weatherUnits') === 'F' ? t * 9 / 5 + 32 : t;
    return Math.round(v) + '°';
  }

  setInterval(() => load().catch(() => {}), 20 * 60e3);

  return { on: (e, f) => em.on(e, f), load, geocode, setPlace, cached: () => data, desc: c => CODES[c] || '—', icon, temp };
})();

// ======================= Батарея =======================
const Battery = (() => {
  const em = new Emitter();
  const state = { level: 1, charging: true, supported: false, time: null };
  if (navigator.getBattery) {
    navigator.getBattery().then(b => {
      const upd = () => {
        state.level = b.level; state.charging = b.charging; state.supported = true;
        state.time = b.charging ? b.chargingTime : b.dischargingTime;
        em.emit('change', state);
      };
      ['levelchange', 'chargingchange', 'dischargingtimechange'].forEach(e => b.addEventListener(e, upd));
      upd();
    }).catch(() => {});
  }
  if (typeof FX !== 'undefined' && FX.available) {
    const set = d => { if (!d) return; state.level = d.level; state.charging = d.charging; state.supported = true; em.emit('change', state); };
    set(FX.tryCall('battery'));
    FX.on('battery', set);
  }
  return { state, on: (e, f) => em.on(e, f) };
})();
