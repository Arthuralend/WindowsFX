/* Видеоплеер WindowsFX — проигрыватель в стиле VLC.
   На устройстве воспроизводит движок libVLC (почти любые форматы: MKV, AVI, MP4, MOV, WMV, FLV, TS, VOB,
   WebM, RMVB, звук AC-3/DTS/FLAC, субтитры SRT/ASS/SSA); на виртуальном диске и вне Android — HTML5 <video>. */
'use strict';

/** Наложение нативных видеоповерхностей на окна плеера (как вкладки браузера) */
const VideoNative = (() => {
  const ps = new Map(); // id -> { win, host, shown, rect, onEvent }
  let raf = null;
  function covers() {
    if (Shell.anyOpen()) return true;
    if (document.querySelector('.ctx-menu, .dlg-backdrop, .snap-flyout.show')) return true;
    if (typeof TaskView !== 'undefined' && TaskView.isOpen()) return true;
    if (typeof Power !== 'undefined' && Power.isLocked()) return true;
    if (document.body.classList.contains('wm-busy')) return true;
    const p = document.getElementById('power-screen');
    return !!(p && p.classList.contains('show'));
  }
  function tick() {
    raf = null;
    if (!ps.size) return;
    const covered = covers();
    const active = WM.active();
    const dpr = window.devicePixelRatio || 1;
    ps.forEach((e, id) => {
      const w = e.win;
      let show = !covered && e.enabled() && (w === active || e.isFull?.()) && !w.minimized && w.el.isConnected && !w.el.classList.contains('other-desk') && !w.el.classList.contains('minimizing');
      let rect = '';
      if (show) {
        const r = e.host.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) show = false;
        else rect = [Math.round(r.left * dpr), Math.round(r.top * dpr), Math.round(r.width * dpr), Math.round(r.height * dpr)].join(',');
      }
      if (show !== e.shown || rect !== e.rect) {
        if (e.shown && !show) FX.tryCall('vlcSnapshot', id);
        const [x, y, ww, hh] = rect ? rect.split(',').map(Number) : [0, 0, 0, 0];
        FX.tryCall('vlcBounds', id, x, y, ww, hh, show);
        e.host.classList.toggle('vp-live', show);
        e.shown = show; e.rect = rect;
      }
    });
    loop();
  }
  function loop() { if (!raf && ps.size) raf = requestAnimationFrame(tick); }
  FX.on('vlc', ev => ps.get(ev.id)?.onEvent(ev));
  FX.on('resume', loop);
  return {
    available: () => !!(window.FXNative && window.FXNative.vlcCreate),
    register(id, e) { ps.set(id, { shown: false, rect: '', enabled: () => true, ...e }); FX.call('vlcCreate', id); loop(); },
    get: id => ps.get(id),
    destroy(id) { if (!ps.has(id)) return; ps.delete(id); FX.tryCall('vlcDestroy', id); },
    sync: loop,
  };
})();

const FXPlayer = (() => {
  const APP = 'fxplayer';
  const NAME = 'Видеоплеер';
  const MEDIA_EXT = ['mp4', 'm4v', 'mkv', 'avi', 'mov', 'wmv', 'asf', 'flv', 'f4v', 'webm', 'ogv', 'ts', 'm2ts', 'mts', 'mpg', 'mpeg', 'vob', '3gp', '3g2', 'rm', 'rmvb', 'divx', 'xvid', 'mxf', 'dv',
    'mp3', 'flac', 'wav', 'ogg', 'opus', 'm4a', 'aac', 'ac3', 'dts', 'wma', 'ape', 'mka', 'alac', 'aiff', 'amr', 'mid'];
  const AUDIO_EXT = ['mp3', 'flac', 'wav', 'ogg', 'opus', 'm4a', 'aac', 'ac3', 'dts', 'wma', 'ape', 'mka', 'alac', 'aiff', 'amr', 'mid'];
  const SUB_EXT = ['srt', 'ass', 'ssa', 'sub', 'vtt', 'smi', 'idx', 'txt'];
  const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4];
  const ASPECTS = [['', 'По умолчанию'], ['16:9', '16:9'], ['4:3', '4:3'], ['16:10', '16:10'], ['1:1', '1:1'], ['21:9', '21:9'], ['2.35:1', '2.35:1'], ['5:4', '5:4']];
  const isMedia = p => MEDIA_EXT.includes(FS.ext(p));
  const isAudio = p => AUDIO_EXT.includes(FS.ext(p));
  const prefs = () => Persist.get('fxplayer.prefs', { volume: 100, hw: true, subEnc: '', resume: true, loop: 'none', shuffle: false });
  const savePrefs = p => Persist.set('fxplayer.prefs', { ...prefs(), ...p });
  const fmt = ms => {
    if (!(ms >= 0)) return '--:--';
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0');
  };
  const GL = {
    play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>',
    pause: '<rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/>',
    prev: '<path d="M6 5v14M19 5.5v13L8.5 12z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    next: '<path d="M18 5v14M5 5.5v13L15.5 12z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    back10: '<path d="M11 6L6 9.5 11 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5 9.5h6a5.5 5.5 0 1 1-5.2 7.3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    fwd10: '<path d="M13 6l5 3.5-5 3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M17.5 9.5h-6a5.5 5.5 0 1 0 5.2 7.3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    unfull: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    list: '<path d="M4 6h11M4 11h11M4 16h7M17 13v7l5-3.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    loop: '<path d="M5 11V9a3 3 0 0 1 3-3h11M16 3l3 3-3 3M19 13v2a3 3 0 0 1-3 3H5M8 21l-3-3 3-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    shuffle: '<path d="M4 7h3.5c4 0 5 10 9 10H20M4 17h3.5c1.6 0 2.7-1.6 3.6-3.6M13 9.6C13.9 8.2 15 7 16.5 7H20M18 4.5 20.5 7 18 9.5M18 14.5l2.5 2.5-2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    vol: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    subs: '<rect x="3" y="5.5" width="18" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6.5 13h4M12.5 13h5M6.5 15.8h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  };
  const g = (k, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24">${GL[k]}</svg>`;
  let seq = 0;

  function open(args = {}) {
    const id = 'vp' + Date.now().toString(36) + (++seq);
    const P = prefs();
    const win = WM.open({ app: APP, title: NAME, width: 900, height: 580, minWidth: 420, minHeight: 300, bodyClass: 'vp' });
    const b = win.body;
    b.innerHTML = `
      <div class="menubar vp-menu"><button data-m="media">Медиа</button><button data-m="play">Воспроизведение</button><button data-m="audio">Аудио</button><button data-m="video">Видео</button><button data-m="subs">Субтитры</button><button data-m="view">Вид</button></div>
      <div class="vp-main">
        <div class="vp-stage">
          <div class="vp-video">
            <img class="vp-snap" alt="">
            <video class="vp-html" playsinline></video>
            <div class="vp-idle">${Icons.get(APP, 84)}<div class="vp-idle-t">Откройте видео или перетащите файл сюда</div><button class="btn primary vp-openbtn">Открыть файл…</button></div>
            <div class="vp-audio hidden">${Icons.get('file-audio', 96)}<div class="vp-audio-t"></div></div>
            <div class="vp-osd"></div>
            <div class="vp-busy hidden"><div class="spinner"><i></i><i></i><i></i><i></i><i></i></div></div>
          </div>
          <div class="vp-bar">
            <div class="vp-seekrow"><span class="vp-t">0:00</span><input type="range" class="slider vp-seek" min="0" max="1000" value="0" step="1"><span class="vp-len">--:--</span></div>
            <div class="vp-ctl">
              <button class="vp-b vp-play" title="Воспроизвести (Пробел)">${g('play', 26)}</button>
              <button class="vp-b vp-prev" title="Предыдущий">${g('prev')}</button>
              <button class="vp-b vp-stop" title="Стоп">${g('stop')}</button>
              <button class="vp-b vp-next" title="Следующий">${g('next')}</button>
              <span class="vp-sep"></span>
              <button class="vp-b vp-back" title="Назад на 10 с (←)">${g('back10')}</button>
              <button class="vp-b vp-fwd" title="Вперёд на 10 с (→)">${g('fwd10')}</button>
              <span class="vp-sep"></span>
              <button class="vp-b vp-full" title="Во весь экран (F)">${g('full')}</button>
              <button class="vp-b vp-pl" title="Список воспроизведения">${g('list')}</button>
              <button class="vp-b vp-loop" title="Повтор">${g('loop')}</button>
              <button class="vp-b vp-shuf" title="Случайный порядок">${g('shuffle')}</button>
              <button class="vp-b vp-sub" title="Субтитры">${g('subs')}</button>
              <span class="spacer"></span>
              <button class="vp-b vp-rate" title="Скорость">1×</button>
              <button class="vp-b vp-mute" title="Звук (M)">${g('vol')}</button>
              <input type="range" class="slider vp-vol" min="0" max="200" value="${P.volume}" title="Громкость">
              <span class="vp-volv small">${P.volume}%</span>
            </div>
          </div>
        </div>
        <div class="vp-side hidden">
          <div class="vp-side-h"><b>Список воспроизведения</b><span class="spacer"></span><button class="icon-btn vp-pl-add" title="Добавить файлы">${Icons.ui('plus', 14)}</button><button class="icon-btn vp-pl-clear" title="Очистить">${Icons.ui('trash', 14)}</button></div>
          <div class="vp-list"></div>
        </div>
      </div>`;
    const $b = s => b.querySelector(s);
    const video = $b('.vp-html'), seek = $b('.vp-seek'), stage = $b('.vp-video');
    let list = [], cur = -1, playing = false, time = 0, length = 0, rate = 1, vol = P.volume, muted = false, mode = 'none', dragging = false;
    let info = {}, full = false, hideT = 0, loop = P.loop, shuffle = P.shuffle, posSaveT = 0, aspect = '';
    let nativeOn = false;

    // ---------- Движки ----------
    const nativeOk = VideoNative.available();
    if (nativeOk) {
      VideoNative.register(id, { win, host: stage, enabled: () => mode === 'native', onEvent, isFull: () => full });
    }
    const E = {
      native: {
        open(path, start) { FX.call('vlcOpen', id, FS.toNative(path), start || 0, prefs().hw, prefs().subEnc || ''); FX.tryCall('vlcCmd', id, 'volume', String(muted ? 0 : vol)); },
        toggle: () => FX.tryCall('vlcCmd', id, 'toggle', ''),
        play: () => FX.tryCall('vlcCmd', id, 'play', ''),
        pause: () => FX.tryCall('vlcCmd', id, 'pause', ''),
        stop: () => FX.tryCall('vlcCmd', id, 'stop', ''),
        seek: ms => FX.tryCall('vlcCmd', id, 'seek', String(Math.round(ms))),
        rate: r => FX.tryCall('vlcCmd', id, 'rate', String(r)),
        volume: v => FX.tryCall('vlcCmd', id, 'volume', String(v)),
        audio: t => FX.tryCall('vlcCmd', id, 'audio', String(t)),
        spu: t => FX.tryCall('vlcCmd', id, 'spu', String(t)),
        sub: p => FX.tryCall('vlcCmd', id, 'sub', FS.toNative(p)),
        aspect: a => FX.tryCall('vlcCmd', id, 'aspect', a),
        spuDelay: ms => FX.tryCall('vlcCmd', id, 'spuDelay', String(ms)),
        info: () => FX.tryCall('vlcInfo', id) || {},
      },
      html: {
        open(path, start) { video.src = FS.url(path); video.currentTime = (start || 0) / 1000; video.volume = Math.min(1, (muted ? 0 : vol) / 100); video.play().catch(() => {}); },
        toggle: () => video.paused ? video.play().catch(() => {}) : video.pause(),
        play: () => video.play().catch(() => {}),
        pause: () => video.pause(),
        stop: () => { video.pause(); video.currentTime = 0; onEvent({ type: 'stopped' }); },
        seek: ms => { video.currentTime = ms / 1000; },
        rate: r => { video.playbackRate = r; },
        volume: v => { video.volume = Math.min(1, v / 100); },
        audio() {}, spu() {}, sub() { UI.alert(NAME, 'Внешние субтитры поддерживаются при воспроизведении файлов устройства.', 'info'); },
        aspect: a => { video.style.objectFit = a ? 'fill' : 'contain'; video.style.aspectRatio = a ? a.replace(':', '/') : ''; },
        spuDelay() {},
        info: () => ({ time: video.currentTime * 1000, length: (video.duration || 0) * 1000, playing: !video.paused, width: video.videoWidth, height: video.videoHeight }),
      },
    };
    const eng = () => E[mode === 'native' ? 'native' : 'html'];

    video.addEventListener('playing', () => onEvent({ type: 'playing' }));
    video.addEventListener('pause', () => onEvent({ type: 'paused' }));
    video.addEventListener('ended', () => onEvent({ type: 'end' }));
    video.addEventListener('error', () => mode === 'html' && video.src && onEvent({ type: 'error' }));
    video.addEventListener('timeupdate', () => onEvent({ type: 'time', time: video.currentTime * 1000, length: (video.duration || 0) * 1000 }));
    video.addEventListener('loadedmetadata', () => onEvent({ type: 'length', length: video.duration * 1000 }));
    video.addEventListener('click', () => full ? showControls() : eng().toggle());
    video.addEventListener('dblclick', () => setFull(!full));

    function onEvent(ev) {
      switch (ev.type) {
        case 'opening': case 'buffering': busy(ev.type === 'opening' || (ev.pct !== undefined && ev.pct < 100)); break;
        case 'playing': playing = true; busy(false); if (ev.audioTracks) info = ev; updatePlay(); stage.classList.remove('vp-has-snap'); break;
        case 'paused': playing = false; updatePlay(); savePos(); break;
        case 'stopped': playing = false; updatePlay(); break;
        case 'end': playing = false; updatePlay(); clearPos(); onEnd(); break;
        case 'error': playing = false; busy(false); updatePlay(); osd('Не удалось воспроизвести файл'); UI.notify({ title: NAME, body: 'Не удалось воспроизвести «' + FS.basename(list[cur]?.path || '') + '». Файл повреждён или формат не поддерживается.', icon: APP }); break;
        case 'length': length = ev.length || length; updateTime(); break;
        case 'time': time = ev.time; if (ev.length) length = ev.length; updateTime(); busy(false); throttleSave(); break;
        case 'tracks': info = { ...info, ...ev }; break;
        case 'snapshot': { const img = $b('.vp-snap'); img.src = ev.img; stage.classList.add('vp-has-snap'); break; }
        case 'tap': if (full) toggleControls(); else eng().toggle(); break;
        case 'dbltap': setFull(!full); break;
        case 'swipe': skip(ev.dir * 10000); break;
        case 'wheel': setVol(vol + (ev.dy > 0 ? 5 : -5)); break;
      }
    }

    // ---------- Список воспроизведения ----------
    function addFiles(paths, playFirst) {
      const start = list.length;
      paths.filter(isMedia).forEach(p => { if (!list.some(x => x.path === p)) list.push({ path: p, name: FS.basename(p) }); });
      renderList();
      if (playFirst && list.length > start) play(start);
      else if (playFirst) { const i = list.findIndex(x => x.path === paths[0]); if (i >= 0) play(i); }
    }
    function addFolder(dir, firstPath) {
      let files = [];
      try { files = FS.list(dir).filter(x => !x.isDir && isMedia(x.path) && !isAudio(x.path) === !isAudio(firstPath || x.path)).map(x => x.path).sort((a, c) => a.localeCompare(c, 'ru', { numeric: true })); } catch {}
      if (firstPath && !files.includes(firstPath)) files.unshift(firstPath);
      addFiles(files, false);
      const i = list.findIndex(x => x.path === firstPath);
      play(i >= 0 ? i : list.length ? 0 : -1);
    }
    function renderList() {
      const el = $b('.vp-list');
      el.innerHTML = list.length ? list.map((x, i) => `<div class="vp-li${i === cur ? ' cur' : ''}" data-i="${i}">${Icons.get(isAudio(x.path) ? 'file-audio' : 'file-video', 16)}<span>${esc(x.name)}</span><button class="icon-btn vp-li-x" title="Убрать">${Icons.ui('close', 12)}</button></div>`).join('') : '<div class="muted small vp-empty">Список пуст. Перетащите сюда видео или нажмите «+».</div>';
    }
    $b('.vp-list').addEventListener('click', e => {
      const r = e.target.closest('.vp-li');
      if (!r) return;
      const i = +r.dataset.i;
      if (e.target.closest('.vp-li-x')) { list.splice(i, 1); if (i < cur) cur--; else if (i === cur) { cur = -1; eng().stop(); } renderList(); return; }
      play(i);
    });

    function play(i) {
      if (i < 0 || i >= list.length) return;
      savePos();
      cur = i;
      const it = list[i];
      const native = nativeOk && FS.isDevice(it.path);
      if (mode === 'html' && native) { video.pause(); video.removeAttribute('src'); video.load(); }
      if (mode === 'native' && !native) FX.tryCall('vlcCmd', id, 'stop', '');
      mode = native ? 'native' : 'html';
      b.classList.toggle('vp-native', native);
      b.classList.add('vp-loaded');
      stage.classList.remove('vp-has-snap');
      const audio = isAudio(it.path);
      $b('.vp-audio').classList.toggle('hidden', !audio);
      $b('.vp-audio-t').textContent = FS.stem(it.name);
      time = 0; length = 0; info = {}; updateTime();
      const saved = prefs().resume ? (Persist.get('fxplayer.pos', {})[it.path] || 0) : 0;
      try { eng().open(it.path, saved); }
      catch (e) { UI.alert(NAME, 'Не удалось открыть файл:\n' + e.message, 'error'); return; }
      if (saved > 5000) osd('Продолжение с ' + fmt(saved));
      eng().rate(rate);
      if (aspect) eng().aspect(aspect);
      win.setTitle(it.name + ' — ' + NAME);
      FileOps.addRecent(it.path);
      renderList();
      VideoNative.sync();
    }
    function onEnd() {
      if (loop === 'one') return play(cur);
      if (shuffle && list.length > 1) { let n; do n = Math.floor(Math.random() * list.length); while (n === cur); return play(n); }
      if (cur + 1 < list.length) return play(cur + 1);
      if (loop === 'all' && list.length) return play(0);
    }
    function next() { if (shuffle && list.length > 1) onEnd(); else if (cur + 1 < list.length) play(cur + 1); else if (loop === 'all') play(0); }
    function prev() { if (time > 3000) eng().seek(0); else if (cur > 0) play(cur - 1); }

    // ---------- Позиция просмотра ----------
    function savePos() {
      const it = list[cur];
      if (!it || !length || isAudio(it.path)) return;
      const m = Persist.get('fxplayer.pos', {});
      if (time > 10000 && time < length - 15000) m[it.path] = Math.round(time); else delete m[it.path];
      const keys = Object.keys(m); if (keys.length > 200) delete m[keys[0]];
      Persist.set('fxplayer.pos', m);
    }
    function clearPos() { const it = list[cur]; if (!it) return; const m = Persist.get('fxplayer.pos', {}); delete m[it.path]; Persist.set('fxplayer.pos', m); }
    function throttleSave() { if (Date.now() - posSaveT > 5000) { posSaveT = Date.now(); savePos(); } }

    // ---------- Интерфейс ----------
    function busy(on) { $b('.vp-busy').classList.toggle('hidden', !on); }
    function updatePlay() {
      $b('.vp-play').innerHTML = g(playing ? 'pause' : 'play', 26);
      $b('.vp-play').title = playing ? 'Пауза (Пробел)' : 'Воспроизвести (Пробел)';
      b.classList.toggle('vp-playing', playing);
      if (full) showControls();
    }
    function updateTime() {
      $b('.vp-t').textContent = fmt(time);
      $b('.vp-len').textContent = length ? fmt(length) : '--:--';
      if (!dragging) { seek.value = length ? Math.round(time / length * 1000) : 0; fillSlider(seek); }
    }
    let osdT = 0;
    function osd(t) { const o = $b('.vp-osd'); o.textContent = t; o.classList.add('show'); clearTimeout(osdT); osdT = setTimeout(() => o.classList.remove('show'), 1600); }
    function skip(ms) { if (!length) return; const t = clamp(time + ms, 0, length - 500); eng().seek(t); time = t; updateTime(); osd((ms > 0 ? '+' : '−') + Math.abs(ms / 1000) + ' с'); }
    function setVol(v) {
      vol = clamp(Math.round(v), 0, 200); muted = false;
      eng().volume(vol);
      $b('.vp-vol').value = vol; fillSlider($b('.vp-vol'));
      $b('.vp-volv').textContent = vol + '%';
      $b('.vp-mute').innerHTML = g(vol ? 'vol' : 'mute');
      savePrefs({ volume: vol });
      osd('Громкость ' + vol + '%');
    }
    function toggleMute() { muted = !muted; eng().volume(muted ? 0 : vol); $b('.vp-mute').innerHTML = g(muted || !vol ? 'mute' : 'vol'); osd(muted ? 'Звук выключен' : 'Громкость ' + vol + '%'); }
    function setRate(r) { rate = r; eng().rate(r); $b('.vp-rate').textContent = (r === 1 ? '1' : String(r).replace('.', ',')) + '×'; osd('Скорость ' + String(r).replace('.', ',') + '×'); }
    function setFull(on) {
      full = on;
      win.el.classList.toggle('vp-fullwin', on);
      document.body.classList.toggle('vp-fullscreen', on);
      $b('.vp-full').innerHTML = g(on ? 'unfull' : 'full');
      if (on) showControls(); else { clearTimeout(hideT); b.classList.remove('vp-hidectl'); }
      VideoNative.sync();
      setTimeout(VideoNative.sync, 60);
    }
    function showControls() {
      b.classList.remove('vp-hidectl');
      clearTimeout(hideT);
      if (full && playing) hideT = setTimeout(() => { b.classList.add('vp-hidectl'); VideoNative.sync(); }, 3000);
      VideoNative.sync();
    }
    function toggleControls() { if (b.classList.contains('vp-hidectl')) showControls(); else { b.classList.add('vp-hidectl'); clearTimeout(hideT); VideoNative.sync(); } }
    function setLoop(l) { loop = l; savePrefs({ loop: l }); $b('.vp-loop').classList.toggle('on', l !== 'none'); $b('.vp-loop').title = { none: 'Повтор выключен', all: 'Повторять список', one: 'Повторять текущий' }[l]; }
    function setShuffle(s) { shuffle = s; savePrefs({ shuffle: s }); $b('.vp-shuf').classList.toggle('on', s); }
    setLoop(loop); setShuffle(shuffle);

    async function openDialog(add) {
      const p = await UI.filePicker({ mode: 'open', dir: list[cur] ? FS.parent(list[cur].path) : FS.P.videos, kinds: ['video', 'audio'], title: NAME + ': открыть файл', typeLabel: 'Видео и аудио' });
      if (!p) return;
      if (add) addFiles([p], false); else addFolder(FS.parent(p), p);
    }
    async function openFolder() {
      const d = await UI.filePicker({ mode: 'folder', dir: list[cur] ? FS.parent(list[cur].path) : FS.P.videos, title: NAME + ': открыть папку' });
      if (!d) return;
      let files = [];
      try { files = FS.list(d).filter(x => !x.isDir && isMedia(x.path)).map(x => x.path).sort((a, c) => a.localeCompare(c, 'ru', { numeric: true })); } catch {}
      if (!files.length) return UI.alert(NAME, 'В этой папке нет видео- и аудиофайлов.', 'info');
      list = []; cur = -1; addFiles(files, true);
    }
    async function openUrl() {
      const u = await UI.prompt('Открыть URL', 'Адрес потока (http, https, rtsp, rtmp, m3u8):', 'https://', {});
      if (!u || !/^[a-z]+:\/\//i.test(u)) return;
      if (!nativeOk) return UI.alert(NAME, 'Потоки воспроизводятся в приложении WindowsFX на Android.', 'info');
      mode = 'native'; b.classList.add('vp-native', 'vp-loaded'); cur = -1;
      FX.call('vlcOpen', id, u, 0, prefs().hw, '');
      win.setTitle(u + ' — ' + NAME);
      VideoNative.sync();
    }
    async function addSubtitle() {
      const p = await UI.filePicker({ mode: 'open', dir: list[cur] ? FS.parent(list[cur].path) : FS.P.videos, title: 'Файл субтитров', typeLabel: 'Субтитры (SRT, ASS, SSA, SUB, VTT)' });
      if (!p) return;
      if (!SUB_EXT.includes(FS.ext(p))) return UI.alert(NAME, 'Это не файл субтитров.', 'warning');
      eng().sub(p); osd('Субтитры: ' + FS.basename(p));
    }
    function trackItems(kind) {
      const i = mode === 'native' ? { ...info, ...eng().info() } : {};
      const tracks = i[kind === 'audio' ? 'audioTracks' : 'spuTracks'] || [];
      const curT = i[kind === 'audio' ? 'audioTrack' : 'spuTrack'];
      if (!tracks.length) return [{ label: mode === 'native' ? 'Нет дорожек' : 'Доступно для файлов устройства', disabled: true }];
      return tracks.map(t => ({ label: t.id === -1 ? 'Отключить' : (t.name || 'Дорожка ' + t.id), checked: t.id === curT, action: () => kind === 'audio' ? eng().audio(t.id) : eng().spu(t.id) }));
    }

    const MENUS = {
      media: () => [
        { label: 'Открыть файл…', shortcut: 'Ctrl+O', icon: 'folder-open', action: () => openDialog(false) },
        { label: 'Открыть папку…', icon: 'app:folder', action: openFolder },
        { label: 'Открыть URL…', shortcut: 'Ctrl+N', icon: 'globe', action: openUrl },
        { label: 'Добавить в список…', icon: 'plus', action: () => openDialog(true) },
        { label: 'Недавние', items: FileOps.recent().filter(r => isMedia(r.path)).slice(0, 10).map(r => ({ label: FS.basename(r.path), action: () => addFolder(FS.parent(r.path), r.path) })).concat([]) },
        { sep: true },
        { label: 'Показать в Проводнике', disabled: !list[cur], action: () => Apps.launch('explorer', { path: FS.parent(list[cur].path) }) },
        { sep: true },
        { label: 'Выход', shortcut: 'Ctrl+Q', action: () => WM.close(win) },
      ],
      play: () => [
        { label: playing ? 'Пауза' : 'Воспроизвести', shortcut: 'Пробел', action: () => eng().toggle() },
        { label: 'Стоп', shortcut: 'S', action: () => eng().stop() },
        { label: 'Предыдущий', shortcut: 'P', action: prev },
        { label: 'Следующий', shortcut: 'N', action: next },
        { sep: true },
        { label: 'Перейти вперёд (10 с)', shortcut: '→', action: () => skip(10000) },
        { label: 'Перейти назад (10 с)', shortcut: '←', action: () => skip(-10000) },
        { label: 'Перейти вперёд (1 мин)', shortcut: 'Ctrl+→', action: () => skip(60000) },
        { label: 'Перейти назад (1 мин)', shortcut: 'Ctrl+←', action: () => skip(-60000) },
        { label: 'Перейти ко времени…', shortcut: 'Ctrl+T', action: gotoTime },
        { sep: true },
        { label: 'Скорость', items: RATES.map(r => ({ label: String(r).replace('.', ',') + '×', checked: r === rate, action: () => setRate(r) })) },
        { label: 'Повтор', items: [['none', 'Выключен'], ['all', 'Весь список'], ['one', 'Текущий файл']].map(([v, n]) => ({ label: n, checked: loop === v, action: () => setLoop(v) })) },
        { label: 'Случайный порядок', checked: shuffle, action: () => setShuffle(!shuffle) },
        { label: 'Продолжать с места остановки', checked: prefs().resume, action: () => savePrefs({ resume: !prefs().resume }) },
      ],
      audio: () => [
        { label: 'Аудиодорожка', items: trackItems('audio') },
        { sep: true },
        { label: 'Громче', shortcut: '↑', action: () => setVol(vol + 10) },
        { label: 'Тише', shortcut: '↓', action: () => setVol(vol - 10) },
        { label: muted ? 'Включить звук' : 'Выключить звук', shortcut: 'M', action: toggleMute },
      ],
      video: () => [
        { label: 'Во весь экран', shortcut: 'F', checked: full, action: () => setFull(!full) },
        { label: 'Соотношение сторон', items: ASPECTS.map(([v, n]) => ({ label: n, checked: aspect === v, action: () => { aspect = v; eng().aspect(v); osd('Соотношение сторон: ' + n); } })) },
        { label: 'Аппаратное декодирование', checked: prefs().hw, disabled: mode !== 'native', action: () => { savePrefs({ hw: !prefs().hw }); osd('Применится к следующему файлу'); } },
        { sep: true },
        { label: 'Информация о файле', action: mediaInfo },
      ],
      subs: () => [
        { label: 'Добавить файл субтитров…', icon: 'plus', action: addSubtitle },
        { label: 'Дорожка субтитров', items: trackItems('spu') },
        { label: 'Кодировка субтитров', items: [['', 'Автоматически'], ['Windows-1251', 'Кириллица (Windows-1251)'], ['UTF-8', 'Юникод (UTF-8)'], ['KOI8-R', 'Кириллица (KOI8-R)'], ['CP866', 'Кириллица (DOS 866)']].map(([v, n]) => ({ label: n, checked: (prefs().subEnc || '') === v, action: () => { savePrefs({ subEnc: v }); if (list[cur]) { const t = time; play(cur); setTimeout(() => eng().seek(t), 600); } } })) },
        { label: 'Задержка субтитров', items: [-2000, -1000, -500, 0, 500, 1000, 2000].map(ms => ({ label: (ms > 0 ? '+' : '') + ms / 1000 + ' с', action: () => { eng().spuDelay(ms); osd('Задержка субтитров ' + ms / 1000 + ' с'); } })) },
      ],
      view: () => [
        { label: 'Список воспроизведения', shortcut: 'Ctrl+L', checked: !$b('.vp-side').classList.contains('hidden'), action: togglePl },
        { label: 'Во весь экран', shortcut: 'F', checked: full, action: () => setFull(!full) },
        { sep: true },
        { label: 'О программе', action: () => UI.dialog({ title: 'О программе', appIcon: APP, html: true, message: `<div style="display:flex;gap:14px;align-items:center">${Icons.get(APP, 56)}<div><b>${NAME} WindowsFX</b><br><span class="muted small">Движок воспроизведения: libVLC (VideoLAN, GNU LGPL 2.1). Форматы: MKV, AVI, MP4, MOV, WMV, FLV, TS, M2TS, VOB, WebM, RMVB, 3GP; звук MP3, FLAC, AAC, AC-3, DTS, WMA; субтитры SRT, ASS, SSA, SUB, VTT.</span></div></div>` }) },
      ],
    };
    async function gotoTime() {
      const v = await UI.prompt('Перейти ко времени', 'Время (ч:мм:сс или мм:сс):', fmt(time), {});
      if (!v) return;
      const parts = v.split(':').map(Number);
      if (parts.some(isNaN)) return;
      const ms = parts.reduce((a, x) => a * 60 + x, 0) * 1000;
      eng().seek(clamp(ms, 0, length || ms)); time = ms; updateTime();
    }
    function mediaInfo() {
      const it = list[cur];
      if (!it) return;
      const i = { ...info, ...eng().info() };
      const node = FS.get(it.path);
      const rows = [['Файл', it.name], ['Папка', FS.display(FS.parent(it.path))], ['Размер', fmtBytes(node?.s || node?.size || 0)], ['Длительность', fmt(i.length || length)], ['Разрешение', i.width ? i.width + ' × ' + i.height : '—'], ['Аудиодорожек', (i.audioTracks || []).filter(t => t.id !== -1).length || '—'], ['Субтитров', (i.spuTracks || []).filter(t => t.id !== -1).length || '—'], ['Движок', mode === 'native' ? 'libVLC' : 'HTML5']];
      UI.dialog({ title: 'Информация о файле', appIcon: APP, content: h(`<table class="wa-info">${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(String(v))}</td></tr>`).join('')}</table>`) });
    }
    function togglePl() { $b('.vp-side').classList.toggle('hidden'); $b('.vp-pl').classList.toggle('on', !$b('.vp-side').classList.contains('hidden')); VideoNative.sync(); }

    $$('.vp-menu button', b).forEach(btn => btn.onclick = () => {
      const r2 = btn.getBoundingClientRect();
      btn.classList.add('open');
      const m = UI.menu(r2.left, r2.bottom + 2, MENUS[btn.dataset.m]());
      const obs = new MutationObserver(() => { if (!m.isConnected) { btn.classList.remove('open'); obs.disconnect(); } });
      obs.observe(document.getElementById('overlay-layer'), { childList: true });
    });
    $b('.vp-openbtn').onclick = () => openDialog(false);
    $b('.vp-play').onclick = () => { if (cur < 0 && list.length) play(0); else if (cur < 0) openDialog(false); else eng().toggle(); };
    $b('.vp-stop').onclick = () => { savePos(); eng().stop(); };
    $b('.vp-prev').onclick = prev;
    $b('.vp-next').onclick = next;
    $b('.vp-back').onclick = () => skip(-10000);
    $b('.vp-fwd').onclick = () => skip(10000);
    $b('.vp-full').onclick = () => setFull(!full);
    $b('.vp-pl').onclick = togglePl;
    $b('.vp-loop').onclick = () => setLoop({ none: 'all', all: 'one', one: 'none' }[loop]);
    $b('.vp-shuf').onclick = () => setShuffle(!shuffle);
    $b('.vp-sub').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); UI.menu(r.left, r.top - 4, MENUS.subs(), { above: true }); };
    $b('.vp-rate').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); UI.menu(r.left, r.top - 4, RATES.map(x => ({ label: String(x).replace('.', ',') + '×', checked: x === rate, action: () => setRate(x) })), { above: true }); };
    $b('.vp-mute').onclick = toggleMute;
    $b('.vp-vol').oninput = e => setVol(+e.target.value);
    $b('.vp-pl-add').onclick = () => openDialog(true);
    $b('.vp-pl-clear').onclick = () => { list = []; cur = -1; renderList(); };
    seek.addEventListener('pointerdown', () => { dragging = true; });
    seek.addEventListener('input', () => { if (length) $b('.vp-t').textContent = fmt(seek.value / 1000 * length); });
    seek.addEventListener('change', () => { dragging = false; if (length) { time = seek.value / 1000 * length; eng().seek(time); updateTime(); } });
    stage.addEventListener('dblclick', e => { if (e.target === stage || e.target.closest('.vp-snap,.vp-audio')) setFull(!full); });
    b.addEventListener('pointermove', () => { if (full) showControls(); });
    b.addEventListener('wheel', e => { if (e.target.closest('.vp-video')) { e.preventDefault(); setVol(vol + (e.deltaY < 0 ? 5 : -5)); } }, { passive: false });

    // перетаскивание файлов из Проводника
    b.addEventListener('dragover', e => { if (DnD.paths) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    b.addEventListener('drop', e => {
      e.preventDefault();
      const paths = (DnD.paths || []).slice(); DnD.end();
      const subs = paths.filter(p => SUB_EXT.includes(FS.ext(p)));
      if (subs.length && cur >= 0) { subs.forEach(p => eng().sub(p)); osd('Субтитры добавлены'); return; }
      const media = paths.filter(isMedia);
      if (!media.length) return;
      if (e.target.closest('.vp-side')) addFiles(media, false);
      else if (media.length === 1) addFolder(FS.parent(media[0]), media[0]);
      else { list = []; cur = -1; addFiles(media, true); }
    });

    // клавиатура (как в VLC)
    win.el.addEventListener('keydown', e => {
      if (e.target.closest('input:not([type=range]), textarea')) return;
      const k = e.key, c = e.ctrlKey || e.metaKey;
      if (k === ' ') eng().toggle();
      else if (k === 'ArrowRight') skip(c ? 60000 : e.shiftKey ? 3000 : 10000);
      else if (k === 'ArrowLeft') skip(c ? -60000 : e.shiftKey ? -3000 : -10000);
      else if (k === 'ArrowUp') setVol(vol + 5);
      else if (k === 'ArrowDown') setVol(vol - 5);
      else if (k === 'f' || k === 'F' || k === 'а' || k === 'А' || (k === 'Enter' && e.altKey)) setFull(!full);
      else if (k === 'Escape' && full) setFull(false);
      else if (k === 'm' || k === 'M' || k === 'ь' || k === 'Ь') toggleMute();
      else if (k === 'n' || k === 'N' || k === 'т' || k === 'Т') next();
      else if (k === 'p' || k === 'P' || k === 'з' || k === 'З') prev();
      else if (k === 's' || k === 'S' || k === 'ы' || k === 'Ы') eng().stop();
      else if (k === ']' || k === '+') setRate(RATES[Math.min(RATES.length - 1, RATES.indexOf(rate) + 1)] || 1);
      else if (k === '[' || k === '-') setRate(RATES[Math.max(0, RATES.indexOf(rate) - 1)] || 1);
      else if (k === '=') setRate(1);
      else if (c && e.code === 'KeyO') openDialog(false);
      else if (c && e.code === 'KeyN') openUrl();
      else if (c && e.code === 'KeyL') togglePl();
      else if (c && e.code === 'KeyT') gotoTime();
      else return;
      e.preventDefault(); e.stopPropagation();
    });

    win.onBack = () => { if (full) { setFull(false); return true; } return false; };
    win.onArgs = a => { if (a.path) addFolder(FS.parent(a.path), a.path); };
    win.onResize = () => VideoNative.sync();
    win.onClose = () => {
      savePos();
      if (full) setFull(false);
      VideoNative.destroy(id);
      video.pause(); video.removeAttribute('src');
    };

    renderList();
    updatePlay();
    if (args.path) addFolder(FS.parent(args.path), args.path);
    setTimeout(() => win.el.focus?.(), 50);
    return win;
  }

  Apps.register({
    id: APP, name: NAME, icon: APP,
    desc: 'Видео и музыка любых форматов (MKV, AVI, MP4, WMV, FLV…), субтитры, списки',
    keywords: 'видео плеер vlc кино фильм mkv avi mp4 медиа проигрыватель субтитры',
    launch: args => open(args),
  });
  return { open, isMedia };
})();
