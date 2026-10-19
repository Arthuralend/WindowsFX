/* Медиаплеер: синтезированные треки + файлы из папки «Музыка» */
'use strict';

Apps.register({
  id: 'music', name: 'Медиаплеер', icon: 'music', desc: 'Музыка и видео', single: true,
  keywords: 'музыка плеер аудио mp3 медиа',
  launch: args => openMusic(args),
});

function openMusic(args = {}) {
  // Синтезированные треки: [название, bpm, аккорды (MIDI-корни), цвет]
  const SYNTH = [
    { title: 'Аврора', artist: 'WindowsFX Sound', bpm: 92, chords: [57, 53, 48, 55], color: '#5fd4ff', wave: 'triangle' },
    { title: 'Неоновый город', artist: 'WindowsFX Sound', bpm: 118, chords: [50, 46, 53, 48], color: '#ff5fb0', wave: 'sawtooth' },
    { title: 'Тихий океан', artist: 'WindowsFX Sound', bpm: 76, chords: [52, 48, 55, 50], color: '#3ddc84', wave: 'sine' },
  ];
  const win = WM.open({ app: 'music', title: 'Медиаплеер', width: 760, height: 500, minWidth: 460, minHeight: 360 });
  const b = win.body;
  b.classList.add('mu');
  let tracks = [], cur = -1, playing = false, timer = null, step = 0, audio = null;
  const ctx = Sound.context();
  const out = ctx.createGain(); const an = ctx.createAnalyser(); an.fftSize = 128;
  out.connect(an).connect(Sound.master);
  out.gain.value = 0.5;

  function load() {
    let files = [];
    try { files = FS.list(FS.P.music).filter(f => ['audio', 'video'].includes(FS.typeOf(f.path, f.node).kind)); } catch {}
    tracks = [...SYNTH.map(s => ({ ...s, synth: true })), ...files.map(f => ({ title: FS.stem(f.name), artist: 'Папка «Музыка»', path: f.path, color: '#ffb020' }))];
  }

  b.innerHTML = `
    <div class="mu-main">
      <div class="mu-list"></div>
      <div class="mu-now"><canvas class="mu-vis" width="400" height="160"></canvas><div class="mu-cover"></div><b class="mu-title">Выберите трек</b><span class="muted mu-artist"></span></div>
    </div>
    <div class="mu-bar">
      <button class="icon-btn mu-prev">${Icons.ui('prev', 16)}</button>
      <button class="mu-play">${Icons.ui('play', 18)}</button>
      <button class="icon-btn mu-next">${Icons.ui('next', 16)}</button>
      <span class="muted small mu-time">0:00</span>
      <span class="spacer"></span>
      <button class="btn sm mu-add">${Icons.ui('upload', 12)} Добавить музыку</button>
    </div>`;

  function renderList() {
    const l = $('.mu-list', b);
    l.innerHTML = '';
    tracks.forEach((t, i) => {
      const r = h(`<div class="mu-row ${i === cur ? 'on' : ''}"><span class="mu-dot" style="background:${t.color}">${Icons.ui(i === cur && playing ? 'pause' : 'note', 14)}</span><div><b>${esc(t.title)}</b><span class="muted small">${esc(t.artist)}</span></div></div>`);
      r.onclick = () => i === cur ? toggle() : play(i);
      l.append(r);
    });
  }

  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  function note(freq, t, dur, type, gain) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  function synthStep(t) {
    const tr = tracks[cur];
    const beat = 60 / tr.bpm / 2;
    const root = tr.chords[Math.floor(step / 16) % tr.chords.length];
    const now = ctx.currentTime + 0.05;
    const s = step % 16;
    if (s % 8 === 0) [0, 4, 7, 12].forEach(iv => note(midi(root + iv), now, beat * 8, 'sine', 0.05));
    if (s % 2 === 0) note(midi(root - 12), now, beat * 1.5, 'triangle', 0.14);
    const scale = [0, 3, 5, 7, 10, 12, 15];
    if (Math.random() < 0.55) note(midi(root + 12 + scale[(step * 5 + s) % scale.length]), now, beat * 1.2, tr.wave, 0.06);
    if (s % 4 === 0) { const n = ctx.createBufferSource(); const buf = ctx.createBuffer(1, 2000, ctx.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); n.buffer = buf; const g = ctx.createGain(); g.gain.value = 0.08; n.connect(g).connect(out); n.start(now); }
    step++;
    $('.mu-time', b).textContent = `${Math.floor(step * beat / 60)}:${pad2(Math.floor(step * beat) % 60)}`;
  }

  function stop() { clearInterval(timer); timer = null; if (audio) { audio.pause(); } }
  function play(i) {
    stop();
    cur = i; step = 0; playing = true;
    const t = tracks[i];
    if (t.synth) timer = setInterval(synthStep, 60 / t.bpm / 2 * 1000);
    else {
      if (!audio) { audio = new Audio(); ctx.createMediaElementSource(audio).connect(out); audio.ontimeupdate = () => { $('.mu-time', b).textContent = `${Math.floor(audio.currentTime / 60)}:${pad2(Math.floor(audio.currentTime) % 60)}`; }; audio.onended = () => next(); }
      audio.src = FS.read(t.path); audio.play().catch(() => {});
    }
    update();
  }
  function toggle() {
    if (cur < 0) return play(0);
    playing = !playing;
    if (playing) { tracks[cur].synth ? (timer = setInterval(synthStep, 60 / tracks[cur].bpm / 2 * 1000)) : audio.play(); }
    else stop();
    update();
  }
  const next = () => play((cur + 1) % tracks.length);
  const prev = () => play((cur - 1 + tracks.length) % tracks.length);
  function update() {
    const t = tracks[cur];
    $('.mu-play', b).innerHTML = Icons.ui(playing ? 'pause' : 'play', 18);
    if (t) { $('.mu-title', b).textContent = t.title; $('.mu-artist', b).textContent = t.artist; $('.mu-cover', b).style.background = `radial-gradient(circle at 30% 30%, #fff8, transparent 60%), ${t.color}`; win.setTitle(t.title + ' — Медиаплеер'); }
    renderList();
  }

  const vis = $('.mu-vis', b), g = vis.getContext('2d');
  const data = new Uint8Array(an.frequencyBinCount);
  let raf;
  (function draw() {
    raf = requestAnimationFrame(draw);
    an.getByteFrequencyData(data);
    g.clearRect(0, 0, vis.width, vis.height);
    const col = tracks[cur]?.color || '#4f8cff';
    const w = vis.width / data.length;
    data.forEach((v, i) => { const hh = (v / 255) * vis.height; g.fillStyle = col; g.globalAlpha = 0.35 + v / 400; g.fillRect(i * w, vis.height - hh, w - 2, hh); });
  })();

  $('.mu-play', b).onclick = toggle;
  $('.mu-next', b).onclick = next;
  $('.mu-prev', b).onclick = prev;
  $('.mu-add', b).onclick = () => FileOps.uploadInto(FS.P.music, 'audio/*');
  const off = FS.on('change', debounce(() => { load(); renderList(); }, 100));
  win.onClose = () => { stop(); cancelAnimationFrame(raf); out.disconnect(); off(); };
  win.onArgs = a => { if (a.path) { load(); const i = tracks.findIndex(t => t.path && t.path.toLowerCase() === FS.realPath(a.path).toLowerCase()); if (i >= 0) play(i); else { tracks.push({ title: FS.stem(FS.basename(a.path)), artist: FS.display(FS.parent(a.path)), path: a.path, color: '#ffb020' }); play(tracks.length - 1); } } };
  load(); renderList();
  if (args.path) win.onArgs(args);
  return win;
}
