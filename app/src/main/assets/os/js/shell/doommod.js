/* DOOM MOD — секретный режим: демоны из DOOM вторгаются на рабочий стол WindowsFX.
   Запуск: команда «DOOM MOD» в Ассистенте.
   Спрайты, шрифты, статус-бар и звуки берутся из оригинального DOOM1.WAD (того же установщика, что и игра DOOM).
   Все «повреждения» Windows только визуальные: CSS-классы и переменные на элементах плюс холсты поверх системы.
   После окончания вторжения всё это снимается, данные и настройки не трогаются. */
'use strict';

const DoomMod = (() => {
  // =====================================================================
  //  Ресурсы DOOM1.WAD
  // =====================================================================
  let assetsP = null;
  function loadAssets() {
    return assetsP ||= (async () => {
      const files = await Doom.loadGame();
      const wad = files.find(f => f.path === 'DOOM1.WAD')?.contents;
      if (!wad) throw new Error('В установщике DOOM нет файла DOOM1.WAD.');
      return parseWad(wad);
    })().catch(e => { assetsP = null; throw e; });
  }

  function parseWad(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = dv.getInt32(4, true), dir = dv.getInt32(8, true);
    const lumps = new Map(), byFrame = new Map();
    for (let i = 0; i < count; i++) {
      const o = dir + i * 16;
      let name = '';
      for (let k = 0; k < 8 && bytes[o + 8 + k]; k++) name += String.fromCharCode(bytes[o + 8 + k]);
      name = name.toUpperCase();
      lumps.set(name, { pos: dv.getInt32(o, true), size: dv.getInt32(o + 4, true) });
      if (name.length >= 6) {
        const key = name.slice(0, 5);
        if (!byFrame.has(key)) byFrame.set(key, []);
        byFrame.get(key).push(name);
      }
    }
    const pl = lumps.get('PLAYPAL');
    const pal = bytes.subarray(pl.pos, pl.pos + 768);

    const patches = new Map();
    /** Картинка в формате DOOM (patch) → холст + маска непрозрачных пикселей для точного попадания */
    function patch(name) {
      if (patches.has(name)) return patches.get(name);
      const l = lumps.get(name);
      if (!l || l.size < 8) { patches.set(name, null); return null; }
      const p = l.pos;
      const w = dv.getInt16(p, true), h = dv.getInt16(p + 2, true);
      const lo = dv.getInt16(p + 4, true), to = dv.getInt16(p + 6, true);
      const c = document.createElement('canvas');
      c.width = Math.max(1, w); c.height = Math.max(1, h);
      const cx = c.getContext('2d');
      const img = cx.createImageData(c.width, c.height), px = img.data;
      const mask = new Uint8Array(w * h);
      for (let x = 0; x < w; x++) {
        let co = p + dv.getInt32(p + 8 + x * 4, true);
        let guard = 0;
        while (bytes[co] !== 255 && guard++ < 256) {
          const top = bytes[co], len = bytes[co + 1];
          for (let j = 0; j < len; j++) {
            const y = top + j;
            if (y >= h) break;
            const ci = bytes[co + 3 + j] * 3, k = y * w + x;
            px[k * 4] = pal[ci]; px[k * 4 + 1] = pal[ci + 1]; px[k * 4 + 2] = pal[ci + 2]; px[k * 4 + 3] = 255;
            mask[k] = 1;
          }
          co += len + 4;
        }
      }
      cx.putImageData(img, 0, 0);
      const r = { name, c, w, h, lo, to, mask, _flip: null, _tint: new Map() };
      patches.set(name, r);
      return r;
    }
    /** Кадр спрайта: префикс (TROO), кадр (A), ротация 1–8 (1 — лицом к зрителю). Возвращает { p, flip } */
    const spriteCache = new Map();
    function sprite(pre, frame, rot = 1) {
      const key = pre + frame + rot;
      if (spriteCache.has(key)) return spriteCache.get(key);
      let res = null;
      const names = byFrame.get(pre + frame) || [];
      for (const n of names) {
        if (n[5] === String(rot)) { res = { p: patch(n), flip: false }; break; }
        if (n.length === 8 && n[6] === frame && n[7] === String(rot)) { res = { p: patch(n), flip: true }; break; }
      }
      if (!res) { const z = patch(pre + frame + '0'); if (z) res = { p: z, flip: false }; }
      if (!res && rot !== 1) res = sprite(pre, frame, 1);
      spriteCache.set(key, res);
      return res;
    }

    const sounds = new Map();
    /** Звук DMX (8 бит, обычно 11025 Гц) → AudioBuffer */
    function sound(name, reverse = false) {
      const key = name + (reverse ? '~' : '');
      if (sounds.has(key)) return sounds.get(key);
      const l = lumps.get(name), ac = Sound.context();
      let buf = null;
      if (l && ac && l.size > 40) {
        const rate = dv.getUint16(l.pos + 2, true), num = dv.getUint32(l.pos + 4, true);
        const start = l.pos + 8 + 16, len = Math.max(1, Math.min(num - 32, l.size - 40));
        buf = ac.createBuffer(1, len, rate || 11025);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < len; i++) ch[reverse ? len - 1 - i : i] = (bytes[start + i] - 128) / 128;
      }
      sounds.set(key, buf);
      return buf;
    }
    return { patch, sprite, sound, has: n => lumps.has(n) };
  }

  /** Отражённая копия холста */
  function flipped(p) {
    if (p._flip) return p._flip;
    const c = document.createElement('canvas');
    c.width = p.c.width; c.height = p.c.height;
    const x = c.getContext('2d');
    x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(p.c, 0, 0);
    return (p._flip = c);
  }
  /** Перекрашенная копия (вспышка попадания, ярость босса, золотой текст) */
  function tinted(src, key, color, alpha = 1) {
    const p = src.p || src, flip = !!src.flip;
    const k = key + (flip ? 'f' : '');
    if (p._tint.has(k)) return p._tint.get(k);
    const c = document.createElement('canvas');
    c.width = p.c.width; c.height = p.c.height;
    const x = c.getContext('2d');
    x.drawImage(flip ? flipped(p) : p.c, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.globalAlpha = alpha;
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    p._tint.set(k, c);
    return c;
  }

  // =====================================================================
  //  Монстры, волны, предметы
  // =====================================================================
  const TYPES = {
    zombie: {
      pre: 'POSS', hp: 20, speed: 22, walk: 'ABCD', attack: 'EF', fire: 1, pain: 'G', death: 'HIJKL', xdeath: 'MNOPQRSTU',
      sight: ['DSPOSIT1', 'DSPOSIT2', 'DSPOSIT3'], die: ['DSPODTH1', 'DSPODTH2', 'DSPODTH3'], painS: 'DSPOPAIN', act: 'DSPOSACT',
      kind: 'hitscan', shot: 'DSPISTOL', dmg: [2, 6], acc: 0.3, cool: [3.4, 5.6], painChance: 0.8, drop: 0.3,
    },
    sergeant: {
      pre: 'SPOS', hp: 30, speed: 22, walk: 'ABCD', attack: 'EF', fire: 1, pain: 'G', death: 'HIJKL', xdeath: 'MNOPQRSTU',
      sight: ['DSPOSIT1', 'DSPOSIT2', 'DSPOSIT3'], die: ['DSPODTH1', 'DSPODTH2', 'DSPODTH3'], painS: 'DSPOPAIN', act: 'DSPOSACT',
      kind: 'hitscan', shot: 'DSSHOTGN', dmg: [4, 10], acc: 0.35, cool: [3.8, 6], painChance: 0.65, drop: 0.35,
    },
    imp: {
      pre: 'TROO', hp: 60, speed: 26, walk: 'ABCD', attack: 'EFG', fire: 2, pain: 'H', death: 'IJKLM', xdeath: 'NOPQRSTU',
      sight: ['DSBGSIT1', 'DSBGSIT2'], die: ['DSBGDTH1', 'DSBGDTH2'], painS: 'DSPOPAIN', act: 'DSBGACT',
      kind: 'fireball', ball: 'BAL1', dmg: [6, 12], cool: [3.2, 5.2], painChance: 0.78, drop: 0.3,
    },
    demon: {
      pre: 'SARG', hp: 150, speed: 48, walk: 'ABCD', attack: 'EFG', fire: 2, pain: 'H', death: 'IJKLMN',
      sight: ['DSSGTSIT'], die: ['DSSGTDTH'], painS: 'DSDMPAIN', act: 'DSDMACT',
      kind: 'melee', dmg: [8, 15], cool: [2.4, 4], painChance: 0.7, drop: 0.35,
    },
    baron: {
      pre: 'BOSS', hp: 2600, speed: 20, walk: 'ABCD', attack: 'EFG', fire: 2, pain: 'H', death: 'IJKLMNO',
      sight: ['DSBRSSIT'], die: ['DSBRSDTH'], painS: 'DSDMPAIN', act: 'DSDMACT',
      kind: 'boss', ball: 'BAL7', dmg: [7, 13], cool: [2.3, 3], painChance: 0.04, drop: 0, scale: 1.9,
    },
  };
  TYPES.spectre = { ...TYPES.demon, fuzz: true };

  const WAVES = [
    { name: 'WAVE 1', sub: 'KNEE-DEEP IN THE DESKTOP', list: { zombie: 6 }, every: 1.5, barrels: 1 },
    { name: 'WAVE 2', sub: 'THE SHORES OF THE TASKBAR', list: { zombie: 5, sergeant: 4, imp: 3 }, every: 1.25, barrels: 2 },
    { name: 'WAVE 3', sub: 'INFERNO.EXE', list: { imp: 7, demon: 3, sergeant: 3 }, every: 1.05, barrels: 2 },
    { name: 'WAVE 4', sub: 'THY DESKTOP CONSUMED', list: { imp: 8, demon: 3, spectre: 2, sergeant: 4, zombie: 3 }, every: 0.85, barrels: 3 },
  ];
  const PICKUPS = {
    STIM: { msg: 'PICKED UP A STIMPACK.', hp: 10 },
    MEDI: { msg: 'PICKED UP A MEDIKIT.', hp: 25 },
    ROCK: { msg: 'PICKED UP A ROCKET.', rockets: 1 },
    BROK: { msg: 'PICKED UP A BOX OF ROCKETS.', rockets: 4 },
  };
  const MAX_ALIVE = 9;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const irnd = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const ease = t => t * t * (3 - 2 * t);

  // =====================================================================
  //  Состояние вторжения
  // =====================================================================
  let G = null;
  let A = null; // ресурсы WAD

  async function start() {
    if (G) return false;
    G = createGame();
    try {
      intro();
      A = await loadAssets();
      if (!G) return false;
      G.assetsReady = true;
    } catch (e) {
      console.error(e);
      const msg = e.message || String(e);
      finish('abort');
      UI.alert('DOOM MOD', 'Демоны не смогли пройти: ' + msg + (location.protocol === 'file:' ? '\n\nОткройте WindowsFX через «npm start».' : ''), 'error');
      return false;
    }
    return true;
  }

  function createGame() {
    const root = h(`<div id="doommod" class="dm-intro">
      <canvas class="dm-canvas"></canvas>
      <div class="dm-glow"></div>
      <div class="dm-dark"></div>
      <div class="dm-hint hidden"><b>ЛКМ</b> — дробовик · <b>ПКМ</b> / <b>Пробел</b> — ракета · <b>M</b> — музыка · удерживайте <b>Esc</b>, чтобы сбежать</div>
      <div class="dm-escape hidden"><span>Побег…</span><i><b></b></i></div>
    </div>`);
    document.body.append(root);
    const decal = h('<canvas class="dm-decals"></canvas>');
    const wp = document.getElementById('wallpaper');
    wp.after(decal);
    document.documentElement.classList.add('dm-active');
    Shell.closeAll?.();

    const g = {
      root, canvas: $('.dm-canvas', root), glow: $('.dm-glow', root), dark: $('.dm-dark', root),
      hint: $('.dm-hint', root), escBar: $('.dm-escape', root), decal,
      ctx: null, dctx: null, glass: document.createElement('canvas'), gctx: null,
      W: 0, H: 0, PX: 3,
      t: 0, phase: 'intro', phaseT: 0, speed: 1, raf: 0, last: performance.now(),
      assetsReady: false,
      mx: 0, my: 0, mouseIn: false, fireHeld: false,
      player: { health: 100, rockets: 5, dead: false, ouchT: 0, evilT: 0, turnT: 0, turnDir: 0, rampageT: 0, painT: 0 },
      weapon: { kind: 'shotgun', cool: 0, anim: -1, flash: 0, bob: 0, lastUsed: 'shotgun' },
      monsters: [], corpses: [], projectiles: [], effects: [], particles: [], pickups: [], barrels: [],
      portal: null, boss: null,
      wave: -1, spawnQueue: [], spawnT: 0,
      kills: 0, shots: 0, hits: 0, startedAt: Date.now(),
      shake: 0, redFlash: 0, whiteFlash: 0, glowLevel: 0, darkLevel: 0,
      title: null, msg: null,
      damaged: new Map(), totalTargets: 1,
      timers: [], listeners: [], soundLast: new Map(),
      music: null, rumble: null, sfxBus: null, ended: false, victoryUI: null, bsod: null,
    };
    g.ctx = g.canvas.getContext('2d');
    g.dctx = decal.getContext('2d');
    g.gctx = g.glass.getContext('2d');
    g.totalTargets = Math.max(8, domTargets().length);
    G = g;
    resize();
    g.mx = g.W / 2; g.my = g.H / 2;

    // Звук: отдельные шины для эффектов и музыки, подключённые к общей громкости Windows
    const ac = Sound.context();
    if (ac) {
      g.sfxBus = ac.createGain(); g.sfxBus.gain.value = 0.9; g.sfxBus.connect(Sound.master);
    }

    // Ввод
    on(window, 'resize', resize);
    on(g.root, 'pointermove', e => { g.mx = e.clientX / g.PX; g.my = e.clientY / g.PX; g.mouseIn = true; });
    on(g.root, 'pointerdown', onPointerDown);
    on(window, 'pointerup', e => { if (e.button === 0) g.fireHeld = false; });
    on(g.root, 'contextmenu', e => e.preventDefault());
    on(g.root, 'wheel', e => e.preventDefault(), { passive: false });
    on(window, 'keydown', onKeyDown, true);
    on(window, 'keyup', onKeyUp, true);
    on(window, 'blur', () => { g.fireHeld = false; });

    g.raf = requestAnimationFrame(loop);
    return g;
  }

  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    G.listeners.push(() => target.removeEventListener(type, fn, opts));
  }
  function later(ms, fn) {
    const g = G;
    const id = setTimeout(() => { if (G === g) fn(); }, ms);
    g.timers.push(id);
    return id;
  }

  function resize() {
    const g = G;
    const iw = innerWidth, ih = innerHeight;
    const PX = Math.max(2, Math.min(Math.round(ih / 270), Math.floor(iw / 320)));
    const W = Math.ceil(iw / PX), H = Math.ceil(ih / PX);
    if (g.W && (W !== g.W || H !== g.H)) {
      const kx = W / g.W, ky = H / g.H;
      for (const list of [g.monsters, g.corpses, g.projectiles, g.effects, g.particles, g.pickups, g.barrels]) {
        for (const o of list) { o.x *= kx; o.y *= ky; if (o.tx !== undefined) { o.tx *= kx; o.ty *= ky; } if (o.sx !== undefined) { o.sx *= kx; o.sy *= ky; } }
      }
      if (g.portal) { g.portal.x *= kx; g.portal.y *= ky; }
    }
    g.PX = PX; g.W = W; g.H = H;
    for (const c of [g.canvas, g.decal]) {
      const keep = g.W && c.width ? c : null;
      let copy = null;
      if (keep && c === g.decal) { copy = document.createElement('canvas'); copy.width = c.width; copy.height = c.height; copy.getContext('2d').drawImage(c, 0, 0); }
      c.width = W; c.height = H;
      c.style.width = W * PX + 'px'; c.style.height = H * PX + 'px';
      if (copy) g.dctx.drawImage(copy, 0, 0, W, H);
    }
    g.glass.width = W; g.glass.height = H;
    g.ctx.imageSmoothingEnabled = false;
    g.dctx.imageSmoothingEnabled = false;
  }

  // =====================================================================
  //  Звук
  // =====================================================================
  function sfx(name, { x, vol = 1, rate = 1, reverse = false, jitter = true } = {}) {
    const g = G;
    if (!g || !A || !g.sfxBus) return;
    const now = performance.now();
    if (now - (g.soundLast.get(name) || 0) < 35) return;
    g.soundLast.set(name, now);
    const ac = Sound.context(), buf = A.sound(name, reverse);
    if (!ac || !buf) return;
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (jitter ? rnd(0.93, 1.07) : 1);
    const gain = ac.createGain();
    gain.gain.value = vol;
    src.connect(gain);
    if (ac.createStereoPanner && x !== undefined) {
      const pan = ac.createStereoPanner();
      pan.pan.value = clamp((x / g.W) * 2 - 1, -1, 1) * 0.75;
      gain.connect(pan).connect(g.sfxBus);
    } else gain.connect(g.sfxBus);
    src.start();
  }

  /** Синтезированный «металл»: дисторшн-гитара + барабаны. Мелодия своя, не из игры. */
  function createMusic() {
    const ac = Sound.context();
    if (!ac) return null;
    const out = ac.createGain();
    out.gain.value = 0;
    out.connect(Sound.master);
    const shaper = ac.createWaveShaper();
    const curve = new Float32Array(1024), k = 60;
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
    shaper.curve = curve;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    const gtr = ac.createGain(); gtr.gain.value = 0.35;
    gtr.connect(shaper); shaper.connect(lp); lp.connect(out);
    const noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    const RIFFS = [
      [0, 0, 0, null, 0, 0, 3, null, 0, 0, 5, null, 6, null, 5, 3],
      [0, null, 0, 1, 0, null, 0, 1, 0, 7, 6, 5, 4, 3, 2, 1],
    ];
    const SHIFT = [0, 0, 5, 3];
    let level = 0, step = 0, next = ac.currentTime + 0.1, muted = false;

    function note(t, semi, dur, vol) {
      const f = 82.41 * Math.pow(2, semi / 12);
      const env = ac.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(vol, t + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      env.connect(gtr);
      for (const [mul, det] of [[1, -6], [1, 6], [1.4983, 0], [2, 3]]) {
        const o = ac.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = f * mul; o.detune.value = det;
        o.connect(env); o.start(t); o.stop(t + dur + 0.02);
      }
    }
    function kick(t, v = 0.9) {
      const o = ac.createOscillator(), e = ac.createGain();
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      e.gain.setValueAtTime(v, t); e.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(e).connect(out); o.start(t); o.stop(t + 0.2);
    }
    function hit(t, hp, dur, v) {
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), e = ac.createGain();
      s.buffer = noise; f.type = 'highpass'; f.frequency.value = hp;
      e.gain.setValueAtTime(v, t); e.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f).connect(e).connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
    }
    function schedule() {
      while (next < ac.currentTime + 0.2) {
        const bpm = level >= 2 ? 176 : 150, dt = 60 / bpm / 4, s = step % 16, bar = Math.floor(step / 16);
        if (level === 0) {
          if (s === 0 || s === 8) kick(next, 0.7);
        } else {
          const riff = RIFFS[level >= 2 ? 1 : 0], v = riff[s];
          if (v !== null) note(next, v + SHIFT[bar % 4], v === 0 ? 0.09 : 0.2, v === 0 ? 0.22 : 0.3);
          if (level >= 2 ? s % 2 === 0 : [0, 6, 8, 14].includes(s)) kick(next, level >= 2 ? 0.6 : 0.85);
          if (s === 4 || s === 12) hit(next, 1400, 0.16, 0.45);
          if (s % 2 === 0) hit(next, 7500, 0.035, 0.1);
        }
        next += dt; step++;
      }
    }
    const timer = setInterval(schedule, 40);
    return {
      setLevel(l) { level = l; },
      fade(v, sec = 1) {
        const target = muted ? 0 : v;
        out.gain.cancelScheduledValues(ac.currentTime);
        out.gain.setValueAtTime(out.gain.value, ac.currentTime);
        out.gain.linearRampToValueAtTime(target, ac.currentTime + sec);
        this.vol = v;
      },
      vol: 0,
      toggle() { muted = !muted; this.fade(this.vol, 0.2); return !muted; },
      stop(sec = 0.6) { this.fade(0, sec); setTimeout(() => { clearInterval(timer); out.disconnect(); }, sec * 1000 + 100); },
    };
  }

  /** Низкий гул перед открытием портала */
  function createRumble() {
    const ac = Sound.context();
    if (!ac) return null;
    const o = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter(), gn = ac.createGain();
    o.type = 'sawtooth'; o.frequency.value = 38; o2.type = 'sawtooth'; o2.frequency.value = 38.7;
    o.frequency.linearRampToValueAtTime(55, ac.currentTime + 4);
    f.type = 'lowpass'; f.frequency.value = 160;
    gn.gain.setValueAtTime(0.0001, ac.currentTime);
    gn.gain.linearRampToValueAtTime(0.5, ac.currentTime + 3);
    o.connect(f); o2.connect(f); f.connect(gn).connect(Sound.master);
    o.start(); o2.start();
    return { stop(sec = 0.5) { gn.gain.cancelScheduledValues(ac.currentTime); gn.gain.setValueAtTime(gn.gain.value, ac.currentTime); gn.gain.linearRampToValueAtTime(0, ac.currentTime + sec); setTimeout(() => { o.stop(); o2.stop(); gn.disconnect(); }, sec * 1000 + 50); } };
  }

  // =====================================================================
  //  Повреждения окон, значков и панели задач (только визуальные)
  // =====================================================================
  function domTargets() {
    const out = [];
    $$('#desktop .dicon').forEach(el => out.push({ el, kind: 'icon' }));
    WM.visible().filter(w => !w.minimized && !w._closing).forEach(w => out.push({ el: w.el, kind: 'win' }));
    const tb = document.getElementById('taskbar');
    if (tb) out.push({ el: tb, kind: 'taskbar' });
    return out.filter(t => { const r = t.el.getBoundingClientRect(); return r.width > 8 && r.height > 8 && r.bottom > 0 && r.top < innerHeight; });
  }
  /** Случайная точка внутри элемента (в координатах экрана, CSS px) */
  function pointIn(el) {
    const r = el.getBoundingClientRect();
    return { x: rnd(r.left + r.width * 0.15, r.right - r.width * 0.15), y: rnd(r.top + r.height * 0.2, r.bottom - r.height * 0.2), r };
  }
  function crackPath(cx, cy, size) {
    let d = '';
    const n = irnd(5, 8);
    for (let i = 0; i < n; i++) {
      let a = (i / n) * Math.PI * 2 + rnd(-0.3, 0.3), x = cx, y = cy;
      d += `M${x.toFixed(1)} ${y.toFixed(1)}`;
      const steps = irnd(3, 6), len = size * rnd(0.45, 1.1);
      for (let k = 0; k < steps; k++) {
        a += rnd(-0.6, 0.6);
        x += Math.cos(a) * len / steps; y += Math.sin(a) * len / steps;
        d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
        if (Math.random() < 0.3) {
          const b = a + rnd(0.6, 1.2) * (Math.random() < 0.5 ? -1 : 1), bl = len / steps * rnd(0.8, 1.6);
          d += `L${(x + Math.cos(b) * bl).toFixed(1)} ${(y + Math.sin(b) * bl).toFixed(1)}M${x.toFixed(1)} ${y.toFixed(1)}`;
        }
      }
    }
    return d;
  }
  /** Нанести визуальное повреждение элементу в точке (sx, sy — координаты экрана) */
  function damageElement(el, sx, sy, power = 1) {
    const g = G;
    if (!g || !el || !el.isConnected) return;
    const r = el.getBoundingClientRect();
    let rec = g.damaged.get(el);
    if (!rec) {
      rec = { el, lvl: 0, cracks: [], burns: [], rot: rnd(4, 14) * (Math.random() < 0.5 ? -1 : 1), w: r.width, h: r.height, kind: el.classList.contains('dicon') ? 'icon' : el.id === 'taskbar' ? 'taskbar' : 'win' };
      g.damaged.set(el, rec);
      el.classList.add('dm-damaged');
    }
    const lx = clamp(sx - r.left, 0, r.width), ly = clamp(sy - r.top, 0, r.height);
    const size = Math.min(140, Math.max(24, Math.min(r.width, r.height) * 0.45)) * (0.8 + power * 0.25);
    rec.cracks.push(crackPath(lx * rec.w / Math.max(1, r.width), ly * rec.h / Math.max(1, r.height), size));
    if (rec.cracks.length > 5) rec.cracks.shift();
    if (power >= 1) rec.burns.push(`radial-gradient(circle at ${lx.toFixed(0)}px ${ly.toFixed(0)}px, rgba(14,5,0,.85) 0, rgba(45,12,0,.55) ${(size * 0.22).toFixed(0)}px, rgba(255,80,0,.16) ${(size * 0.4).toFixed(0)}px, transparent ${(size * 0.6).toFixed(0)}px)`);
    if (rec.burns.length > 5) rec.burns.shift();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${rec.w.toFixed(0)} ${rec.h.toFixed(0)}" preserveAspectRatio="none">` +
      rec.cracks.map(d => `<path d="${d}" fill="none" stroke="rgba(0,0,0,.6)" stroke-width="2.4" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="1" stroke-linejoin="round"/>`).join('') + '</svg>';
    el.style.setProperty('--dm-dmg', [`url("data:image/svg+xml,${encodeURIComponent(svg)}")`, ...rec.burns].join(', '));
    el.style.setProperty('--dm-rot', rec.rot + 'deg');
    el.style.setProperty('--dm-drop', rnd(6, 26).toFixed(0) + 'px');
    rec.lvl = Math.min(3, rec.lvl + (power >= 2 ? 2 : 1));
    el.classList.remove('dm-l1', 'dm-l2', 'dm-l3');
    el.classList.add('dm-l' + rec.lvl);
    el.classList.remove('dm-jolt'); void el.offsetWidth; el.classList.add('dm-jolt');
    later(380, () => el.classList.remove('dm-jolt'));
    // Подпалина на обоях под элементом
    scorch(sx / g.PX, sy / g.PX, size / g.PX * 0.5);
    for (let i = 0; i < 10; i++) particle(sx / g.PX, sy / g.PX, { vx: rnd(-40, 40), vy: rnd(-60, 10), life: rnd(0.3, 0.8), color: pick(['#ffd34a', '#ff8a1c', '#fff2b0']), size: 1, gravity: 120 });
  }
  function repairElement(rec, animate = true) {
    const el = rec.el;
    el.classList.remove('dm-damaged', 'dm-l1', 'dm-l2', 'dm-l3', 'dm-jolt');
    ['--dm-dmg', '--dm-rot', '--dm-drop'].forEach(p => el.style.removeProperty(p));
    if (animate && el.isConnected) {
      el.classList.add('dm-repair');
      setTimeout(() => el.classList.remove('dm-repair'), 700);
    }
  }
  function integrity() {
    let sum = 0;
    G.damaged.forEach(r => { if (r.el.isConnected) sum += r.lvl; });
    return clamp(Math.round(100 - (sum / (G.totalTargets * 3)) * 100), 0, 100);
  }
  function scorch(x, y, r) {
    const c = G.dctx;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(10,4,0,.75)'); g.addColorStop(0.55, 'rgba(40,10,0,.45)'); g.addColorStop(1, 'rgba(40,10,0,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
  function bloodSplat(x, y, n = 8) {
    const c = G.dctx;
    for (let i = 0; i < n; i++) {
      c.fillStyle = pick(['#6a0000', '#8a0b0b', '#4a0000']);
      const s = irnd(1, 3);
      c.fillRect(Math.round(x + rnd(-8, 8)), Math.round(y + rnd(-3, 3)), s, s);
    }
  }

  // =====================================================================
  //  Сценарий
  // =====================================================================
  function intro() {
    const g = G;
    g.phase = 'intro'; g.phaseT = 0;
    g.rumble = createRumble();
    sfxLater(400, 'DSSTNMOV', { vol: 0.8, rate: 0.6 });
    // Окна «дёргаются», будто система сбоит
    later(1200, () => domTargets().filter(t => t.kind === 'win').forEach(t => { t.el.classList.add('dm-glitchy'); later(1600, () => t.el.classList.remove('dm-glitchy')); }));
  }
  function sfxLater(ms, name, opts) { later(ms, () => sfx(name, opts)); }

  function openPortal() {
    const g = G;
    g.phase = 'portal'; g.phaseT = 0;
    g.portal = { x: g.W * rnd(0.38, 0.62), y: g.H * 0.36, r: Math.max(26, Math.min(g.W, g.H) * 0.1), open: 0, crack: 0, spin: 1, color: 0 };
    g.rumble?.stop(1.2);
    sfx('DSBAREXP', { vol: 1, rate: 0.7 });
    later(250, () => sfx('DSTELEPT', { vol: 1, rate: 0.75 }));
    g.whiteFlash = 1; g.shake = 14;
    g.music = createMusic();
    g.music?.setLevel(0); g.music?.fade(0.55, 2);
  }

  function beginWave(i) {
    const g = G;
    g.wave = i;
    const w = WAVES[i];
    g.phase = 'wave'; g.phaseT = 0;
    g.spawnQueue = [];
    for (const [type, n] of Object.entries(w.list)) for (let k = 0; k < n; k++) g.spawnQueue.push(type);
    g.spawnQueue.sort(() => Math.random() - 0.5);
    // Первые монстры — самые простые
    g.spawnQueue.sort((a, b) => (a === 'zombie' ? -1 : 0) - (b === 'zombie' ? -1 : 0));
    g.spawnT = 1.2;
    g.title = { text: w.name, sub: w.sub, t: 0, dur: 3 };
    g.music?.setLevel(1);
    for (let k = 0; k < w.barrels; k++) later(600 + k * 500, spawnBarrel);
    if (i === 0) {
      g.hint.classList.remove('hidden');
      later(9000, () => g.hint.classList.add('hidden'));
    }
  }

  function waveCleared() {
    const g = G;
    g.phase = 'interlude'; g.phaseT = 0;
    g.title = { text: 'WAVE CLEARED', sub: g.wave + 1 < WAVES.length ? '+25 HEALTH  +2 ROCKETS' : 'SOMETHING BIG IS COMING...', t: 0, dur: 3 };
    g.player.health = Math.min(100, g.player.health + 25);
    g.player.rockets = Math.min(50, g.player.rockets + 2);
    g.player.evilT = 1.5;
    sfx('DSGETPOW', { vol: 0.8 });
    // «Стекло» экрана понемногу затягивается
    fadeGlass();
  }

  function bossIntro() {
    const g = G;
    g.phase = 'bossIntro'; g.phaseT = 0;
    g.title = { text: 'WARNING', sub: 'BARON OF HELL APPROACHES', t: 0, dur: 4.2, blink: true };
    g.music?.fade(0, 0.4);
    g.rumble = createRumble();
    sfx('DSSTNMOV', { vol: 1, rate: 0.5 });
    later(1600, () => sfx('DSBRSSIT', { vol: 1, rate: 0.8 }));
  }
  function spawnBoss() {
    const g = G;
    g.phase = 'boss'; g.phaseT = 0;
    g.rumble?.stop(0.6); g.rumble = null;
    g.music?.setLevel(2); g.music?.fade(0.6, 0.6);
    const P = g.portal;
    const m = spawnMonster('baron', P.x, P.y + P.r * 1.2);
    m.boss = true; m.summons = [0.75, 0.5, 0.25];
    g.boss = m;
    g.shake = 18; g.whiteFlash = 0.8;
    sfx('DSBRSSIT', { vol: 1 });
    sfx('DSBAREXP', { vol: 0.8, rate: 0.6 });
  }

  function victory() {
    const g = G;
    if (g.phase === 'victory') return;
    g.phase = 'victory'; g.phaseT = 0;
    g.player.evilT = 99;
    g.music?.fade(0, 2.5);
    // Остальные демоны взрываются вместе с боссом
    g.monsters.forEach(m => { if (m !== g.boss && m.state !== 'dying') later(rnd(300, 1800), () => killMonster(m, 999)); });
    g.projectiles.forEach(p => { p.dead = true; explodeProjectile(p, false); });
    g.title = null;
  }
  function restoreWindows(animate) {
    const g = G;
    const recs = [...g.damaged.values()];
    g.damaged.clear();
    if (!animate) { recs.forEach(r => repairElement(r, false)); return; }
    recs.sort(() => Math.random() - 0.5).forEach((r, i) => setTimeout(() => repairElement(r, true), i * 90));
  }

  function playerDied() {
    const g = G;
    if (g.phase === 'death') return;
    g.phase = 'death'; g.phaseT = 0;
    g.player.dead = true; g.player.health = 0;
    g.fireHeld = false;
    sfx('DSPLDETH', { vol: 1 });
    g.music?.fade(0, 1.2);
    g.shake = 10;
  }

  function showBSOD() {
    const g = G;
    g.phase = 'bsod'; g.phaseT = 0;
    g.music?.stop(0.1);
    const el = h(`<div class="dm-bsod">
      <div class="dm-bsod-in">
        <div class="dm-sad">:(</div>
        <h1>DOOM HAS TAKEN OVER YOUR PC</h1>
        <p>На вашем ПК возникла проблема: демоны захватили систему. Мы собираем сведения об ошибке, а затем изгоним их и перезапустим компьютер.</p>
        <p class="dm-pct">0% выполнено</p>
        <div class="dm-bsod-row">
          <canvas class="dm-qr" width="29" height="29"></canvas>
          <div class="dm-bsod-small">
            <p>Подробнее об этой проблеме: попросите Ассистента ещё раз сказать «DOOM MOD» и отомстите.</p>
            <p>Если вы будете звонить в службу поддержки, назовите им этот код:<br>Код остановки: DEMONIC_INVASION_UNHANDLED</p>
            <p>Сбойный модуль: DOOM1.WAD</p>
          </div>
        </div>
      </div>
    </div>`);
    g.root.append(el);
    g.bsod = { el, pct: 0, next: 0.6, done: false };
    drawQR($('.dm-qr', el));
    el.addEventListener('pointerdown', () => { g.bsod.fast = true; });
    g.root.classList.add('dm-cursor');
  }
  function drawQR(c) {
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 29, 29);
    x.fillStyle = '#0078d7';
    for (let i = 0; i < 29; i++) for (let j = 0; j < 29; j++) if (Math.random() < 0.45) x.fillRect(i, j, 1, 1);
    for (const [fx, fy] of [[0, 0], [22, 0], [0, 22]]) {
      x.fillStyle = '#0078d7'; x.fillRect(fx, fy, 7, 7);
      x.fillStyle = '#fff'; x.fillRect(fx + 1, fy + 1, 5, 5);
      x.fillStyle = '#0078d7'; x.fillRect(fx + 2, fy + 2, 3, 3);
    }
    const face = A?.patch('STFDEAD0');
    if (face) { x.fillStyle = '#fff'; x.fillRect(9, 9, 11, 11); x.drawImage(face.c, 10, 10, 9, 9); }
  }

  function showVictoryUI() {
    const g = G;
    const secs = Math.round((Date.now() - g.startedAt) / 1000);
    const acc = g.shots ? Math.round(g.hits / g.shots * 100) : 0;
    const el = h(`<div class="dm-win">
      <div class="dm-win-stats">
        <div><span>Убито демонов</span><b>${g.kills}</b></div>
        <div><span>Время</span><b>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</b></div>
        <div><span>Точность</span><b>${acc}%</b></div>
      </div>
      <button class="btn primary dm-win-ok">Вернуться к работе</button>
    </div>`);
    g.root.append(el);
    g.root.classList.add('dm-cursor');
    $('.dm-win-ok', el).onclick = () => finish('victory');
    g.victoryUI = el;
  }

  /** Полное завершение: снять все эффекты и вернуть систему в исходное состояние */
  function finish(reason) {
    const g = G;
    if (!g || g.ended) return;
    g.ended = true;
    escDown = 0;
    cancelAnimationFrame(g.raf);
    g.timers.forEach(clearTimeout);
    g.listeners.forEach(f => f());
    g.music?.stop(0.4);
    g.rumble?.stop(0.2);
    if (g.sfxBus) { try { g.sfxBus.gain.setTargetAtTime(0, Sound.context().currentTime, 0.15); } catch {} setTimeout(() => g.sfxBus.disconnect(), 800); }
    restoreWindows(reason === 'victory');
    $$('.dm-glitchy, .dm-jolt').forEach(el => el.classList.remove('dm-glitchy', 'dm-jolt'));
    const os = document.getElementById('os');
    os.style.removeProperty('translate'); os.style.removeProperty('rotate');
    document.documentElement.classList.remove('dm-active');
    g.root.classList.add('dm-out');
    g.decal.classList.add('dm-out');
    setTimeout(() => { g.root.remove(); g.decal.remove(); }, 650);
    G = null;
    if (reason === 'victory') UI.notify({ title: 'WINDOWS 12 SAVED', body: 'Демоны изгнаны, все окна и значки восстановлены.', app: 'doom' });
    else if (reason === 'bsod') UI.notify({ title: 'WindowsFX восстановлена', body: 'После вторжения демонов система перезапущена. Реванш — команда «DOOM MOD» в Ассистенте.', app: 'doom' });
  }

  // =====================================================================
  //  Ввод
  // =====================================================================
  function onPointerDown(e) {
    const g = G;
    g.mx = e.clientX / g.PX; g.my = e.clientY / g.PX;
    Sound.context();
    if (!['wave', 'interlude', 'boss', 'bossIntro'].includes(g.phase)) return;
    e.preventDefault();
    if (e.button === 0) { g.fireHeld = true; fire('shotgun'); }
    else if (e.button === 2) fire('rocket');
  }
  let escDown = 0;
  function onKeyDown(e) {
    const g = G;
    if (!g) return;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (g.phase === 'bsod') { g.bsod.fast = true; return; }
      if (g.phase === 'victory' && g.victoryUI) return finish('victory');
      if (!escDown) { escDown = performance.now(); g.escBar.classList.remove('hidden'); }
      return;
    }
    if (g.phase === 'victory' || g.phase === 'bsod') return;
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey) cheat(e.key.toLowerCase());
    // Во время вторжения клавиатура принадлежит игре: буквы не должны попадать в поля ввода окон
    if (!/^F\d+$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); }
    if (e.code === 'Space') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) fire('rocket'); return; }
    if (e.code === 'KeyM' && !e.repeat) {
      e.preventDefault(); e.stopPropagation();
      const onM = g.music?.toggle();
      say(onM ? 'MUSIC ON' : 'MUSIC OFF');
      return;
    }
    if (e.ctrlKey && e.altKey) { e.preventDefault(); e.stopPropagation(); }
  }
  function onKeyUp(e) {
    if (e.key === 'Escape') { escDown = 0; G?.escBar.classList.add('hidden'); }
  }
  function say(text) { G.msg = { text, t: 0 }; }

  // Чит-коды оригинального DOOM работают и здесь
  let cheatBuf = '';
  function cheat(ch) {
    const g = G, P = g.player;
    cheatBuf = (cheatBuf + ch).slice(-8);
    if (cheatBuf.endsWith('iddqd')) {
      P.god = !P.god;
      if (P.god) P.health = 100;
      say(P.god ? 'DEGREELESSNESS MODE ON' : 'DEGREELESSNESS MODE OFF');
      cheatBuf = '';
    } else if (cheatBuf.endsWith('idkfa')) {
      P.rockets = 50;
      say('VERY HAPPY AMMO ADDED');
      cheatBuf = '';
    } else if (cheatBuf.endsWith('idclev') && ['wave', 'interlude'].includes(g.phase)) {
      say('CHANGING LEVEL...');
      g.spawnQueue = [];
      g.monsters.forEach(m => killMonster(m, 999));
      g.wave = WAVES.length - 1;
      later(1200, () => { if (G && G.phase !== 'death') bossIntro(); });
      cheatBuf = '';
    }
  }

  // =====================================================================
  //  Оружие
  // =====================================================================
  function fire(kind) {
    const g = G, wpn = g.weapon, P = g.player;
    if (P.dead || wpn.cool > 0) return;
    if (kind === 'rocket') {
      if (P.rockets <= 0) { sfx('DSNOWAY', { vol: 0.6 }); say('NO ROCKETS LEFT!'); wpn.cool = 0.3; return; }
      P.rockets--;
      wpn.kind = 'rocket'; wpn.lastUsed = 'rocket'; wpn.cool = 0.75; wpn.anim = 0; wpn.flash = 0.18;
      sfx('DSRLAUNC', { x: g.mx, vol: 0.9 });
      g.shots++;
      const sx = g.W / 2 + (g.mx - g.W / 2) * 0.1, sy = g.H - 40;
      g.projectiles.push({ kind: 'rocket', x: sx, y: sy, sx, sy, tx: g.mx, ty: g.my, t: 0, dur: 0.2, z0: 2.2, z1: 0.9, z: 2.2, player: true });
      g.shake = Math.max(g.shake, 3);
      return;
    }
    wpn.kind = 'shotgun'; wpn.lastUsed = 'shotgun'; wpn.cool = 0.55; wpn.anim = 0; wpn.flash = 0.12;
    P.rampageT = Math.min(2, P.rampageT + 0.35);
    sfx('DSSHOTGN', { x: g.mx, vol: 0.85 });
    g.shots++;
    g.shake = Math.max(g.shake, 2.5);
    let hit = false;
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * 9;
      const x = g.mx + Math.cos(a) * d, y = g.my + Math.sin(a) * d * 0.7;
      if (shootPoint(x, y, 5 * irnd(1, 3))) hit = true;
    }
    if (hit) { g.hits++; g.hitMarker = 0.18; }
  }
  /** Попадание одной дробины / пули игрока */
  function shootPoint(x, y, dmg) {
    const g = G;
    // Летящие в игрока снаряды можно сбить
    for (const p of g.projectiles) {
      if (p.player || p.dead) continue;
      const r = 6 * p.z + 2;
      if (Math.hypot(p.x - x, p.y - y) < r) { p.dead = true; explodeProjectile(p, false); say('NICE SHOT!'); return true; }
    }
    const m = monsterAt(x, y);
    if (m) {
      hurtMonster(m, dmg, x, y);
      return true;
    }
    for (const b of g.barrels) {
      if (b.dead) continue;
      if (b.drawn && hitDrawn(b.drawn, x, y)) { hurtBarrel(b, dmg); return true; }
    }
    effect('PUFF', 'ABCD', x, y, { fd: 0.06, s: 1, anchor: 'center' });
    return false;
  }
  function hitDrawn(d, x, y) {
    const u = Math.floor((x - d.x0) / d.s), v = Math.floor((y - d.y0) / d.s), p = d.p;
    if (u < 0 || v < 0 || u >= p.w || v >= p.h) return false;
    return p.mask[v * p.w + (d.flip ? p.w - 1 - u : u)] === 1;
  }
  function monsterAt(x, y) {
    const list = G.monsters.filter(m => m.drawn && m.state !== 'dying' && m.state !== 'spawn').sort((a, b) => b.y - a.y);
    for (const m of list) if (hitDrawn(m.drawn, x, y)) return m;
    return null;
  }

  // =====================================================================
  //  Монстры
  // =====================================================================
  let nextId = 1;
  function persp(y) { return 0.55 + 0.75 * clamp(y / G.H, 0, 1); }
  function scaleOf(m) { return persp(m.y) * (m.t.scale || 1) * (1 + (m.lunge || 0) * 1.5); }

  function spawnMonster(type, x, y) {
    const g = G, t = TYPES[type];
    const m = {
      id: nextId++, type, t, x, y, hp: t.hp, maxHp: t.hp, state: 'spawn', st: 0, fi: 0, ft: 0, rot: 1, flip: false,
      tx: x, ty: y, cool: rnd(...t.cool) + 1.2, lunge: 0, flash: 0, goal: null, drawn: null, actT: rnd(3, 8),
    };
    g.monsters.push(m);
    effect('TFOG', 'ABCDEFGHIJ', x, y, { fd: 0.07, s: persp(y) * (t.scale || 1) * 1.1 });
    sfx('DSTELEPT', { x, vol: 0.35 });
    later(450, () => { if (m.state === 'spawn') { setState(m, 'walk'); if (Math.random() < 0.6 || m.boss) sfx(pick(t.sight), { x: m.x, vol: 0.7 }); pickGoal(m); } });
    return m;
  }
  function setState(m, s) { m.state = s; m.st = 0; m.fi = 0; m.ft = 0; }

  function pickGoal(m) {
    const g = G;
    const minY = g.H * 0.2, maxY = g.H - 38;
    if (m.boss) {
      m.goal = null;
      m.tx = clamp(g.W / 2 + rnd(-g.W * 0.32, g.W * 0.32), 30, g.W - 30);
      m.ty = clamp(g.H * rnd(0.5, 0.62), minY, maxY);
      return;
    }
    if (Math.random() < 0.45) {
      const targets = domTargets();
      if (targets.length) {
        const t = pick(targets), p = pointIn(t.el);
        m.goal = { el: t.el, kind: t.kind };
        // Встаём рядом с элементом: под ним (если это окно — у нижнего края)
        const r = p.r;
        m.tx = clamp((r.left + r.width * rnd(0.2, 0.8)) / g.PX + rnd(-20, 20), 16, g.W - 16);
        m.ty = clamp((t.kind === 'win' ? r.bottom - r.height * 0.15 : r.bottom + 10) / g.PX, minY, maxY);
        return;
      }
    }
    m.goal = null;
    m.tx = rnd(20, g.W - 20);
    m.ty = rnd(g.H * 0.35, maxY);
  }

  function hurtMonster(m, dmg, x, y, gib = false) {
    const g = G;
    if (m.state === 'dying') return;
    m.hp -= dmg;
    m.flash = 0.08;
    effect('BLUD', 'CBA', x, y, { fd: 0.08, s: 1, anchor: 'center' });
    for (let i = 0; i < 4; i++) particle(x, y, { vx: rnd(-30, 30), vy: rnd(-50, 0), life: rnd(0.3, 0.6), color: pick(['#a00', '#700', '#c22']), size: 1, gravity: 160 });
    if (m.hp <= 0) return killMonster(m, -m.hp, gib);
    if (m.state !== 'attack' && m.state !== 'lunge' && Math.random() < m.t.painChance) {
      setState(m, 'pain');
      sfx(m.t.painS, { x: m.x, vol: 0.6 });
    }
    if (m.boss) checkBossSummon(m);
  }
  function killMonster(m, overkill = 0, gib = false) {
    const g = G;
    if (m.state === 'dying') return;
    const t = m.t;
    const xdeath = t.xdeath && (gib || overkill > 40);
    m.deathFrames = xdeath ? t.xdeath : t.death;
    m.lunge = 0;
    setState(m, 'dying');
    sfx(xdeath ? 'DSSLOP' : pick(t.die), { x: m.x, vol: m.boss ? 1 : 0.8 });
    bloodSplat(m.x, m.y, xdeath ? 18 : 8);
    if (xdeath) for (let i = 0; i < 14; i++) particle(m.x, m.y - 20 * scaleOf(m), { vx: rnd(-70, 70), vy: rnd(-110, -20), life: rnd(0.5, 1), color: pick(['#a00', '#600', '#c33', '#844']), size: irnd(1, 2), gravity: 220 });
    if (m.boss) return bossDeath(m);
    g.kills++;
    g.player.rampageT = Math.min(2, g.player.rampageT + 0.4);
    if (Math.random() < t.drop) {
      const kind = pick(['STIM', 'STIM', 'MEDI', 'ROCK', 'ROCK', 'BROK']);
      later(300, () => G?.pickups.push({ kind, x: m.x, y: m.y, t: 0 }));
    }
  }

  function updateMonster(m, dt) {
    const g = G, t = m.t;
    m.st += dt; m.ft += dt;
    m.flash = Math.max(0, m.flash - dt);
    if (m.state === 'spawn') return;
    if (m.state === 'dying') {
      const fd = m.boss ? 0.2 : 0.11;
      if (m.ft > fd) {
        m.ft = 0;
        if (m.fi < m.deathFrames.length - 1) m.fi++;
        else {
          m.dead = true;
          g.corpses.push({ type: m.type, t: m.t, frame: m.deathFrames[m.deathFrames.length - 1], x: m.x, y: m.y, s: scaleOf(m), age: 0, fuzz: t.fuzz });
          if (g.corpses.length > 40) g.corpses.shift();
        }
      }
      return;
    }
    // Иногда рычат
    m.actT -= dt;
    if (m.actT <= 0) { m.actT = rnd(5, 11); sfx(t.act, { x: m.x, vol: 0.35 }); }

    if (m.state === 'pain') { if (m.st > 0.22) setState(m, 'walk'); return; }

    if (m.state === 'lunge') {
      // Бросок прямо на игрока: монстр растёт и вылетает в центр экрана
      const dur = m.boss ? 0.9 : 0.65;
      const k = clamp(m.st / dur, 0, 1);
      m.lunge = ease(k);
      m.x += (m.lx - m.x) * Math.min(1, dt * 4);
      m.y += (m.ly - m.y) * Math.min(1, dt * 4);
      m.fi = k < 0.5 ? 0 : k < 0.85 ? 1 : 2;
      if (k >= 1) {
        sfx(m.boss ? 'DSCLAW' : 'DSSGTATK', { x: m.x, vol: 1 });
        hurtPlayer(irnd(...t.dmg) * (m.boss ? 1.6 : 1), m.x);
        addGlassCrack(m.x, m.y - 30, 26);
        setState(m, 'retreat');
      }
      return;
    }
    if (m.state === 'retreat') {
      m.lunge = Math.max(0, 1 - m.st / 0.6);
      if (m.st > 0.6) { m.lunge = 0; setState(m, 'walk'); pickGoal(m); m.cool = rnd(...t.cool); }
      return;
    }
    if (m.state === 'attack') {
      const fd = m.boss ? 0.2 : 0.22;
      if (m.ft > fd) {
        m.ft = 0;
        m.fi++;
        if (m.fi === t.fire) attackHit(m);
        if (m.fi >= t.attack.length) { setState(m, 'walk'); m.cool = rnd(...t.cool) * (m.boss && m.enraged ? 0.6 : 1); pickGoal(m); }
      }
      return;
    }
    // Ходьба
    const sp = t.speed * scaleOf(m) * (m.boss && m.enraged ? 1.5 : 1) * (g.phase === 'boss' && !m.boss ? 1.1 : 1);
    const dx = m.tx - m.x, dy = m.ty - m.y, dist = Math.hypot(dx, dy);
    if (dist > 2) {
      m.x += dx / dist * sp * dt;
      m.y += dy / dist * sp * dt;
      setDirection(m, dx, dy);
    }
    if (m.ft > 0.13) { m.ft = 0; m.fi = (m.fi + 1) % 4; }
    m.cool -= dt;
    if (m.cool <= 0 && g.phase !== 'death' && g.phase !== 'victory') startAttack(m);
    else if (dist <= 2) pickGoal(m);
  }
  function setDirection(m, dx, dy) {
    // 8 ротаций DOOM: 1 — к зрителю, 5 — спиной, 3 — профиль влево, 7 — вправо
    const a = Math.atan2(dy, dx); // 0 — вправо, π/2 — вниз (к зрителю)
    const oct = Math.round(((a - Math.PI / 2) / (Math.PI * 2)) * 8 + 8) % 8; // 0 — вниз
    m.rot = oct + 1;
  }

  function startAttack(m) {
    const g = G, t = m.t;
    m.rot = 1;
    // Цель: игрок или элемент Windows
    let goal = null;
    if (m.goal?.el?.isConnected && Math.random() < 0.6) goal = m.goal;
    else if (t.kind !== 'melee' && Math.random() < 0.4) {
      const targets = domTargets();
      if (targets.length) goal = pick(targets);
    }
    if (t.kind === 'boss') return bossAttack(m);
    if (t.kind === 'melee') {
      if (goal) { m.target = goal; setState(m, 'attack'); return; }
      m.lx = clamp(g.mx + rnd(-30, 30), 30, g.W - 30); m.ly = g.H - 10;
      setState(m, 'lunge');
      sfx('DSSGTSIT', { x: m.x, vol: 0.5, rate: 1.2 });
      return;
    }
    m.target = goal;
    setState(m, 'attack');
  }
  function attackHit(m) {
    if (m.boss) return bossAttackHit(m);
    const g = G, t = m.t, s = scaleOf(m);
    const hx = m.x, hy = m.y - (m.drawn ? m.drawn.p.to * s * 0.62 : 30 * s);
    const target = m.target?.el?.isConnected ? m.target : null;
    if (t.kind === 'hitscan') {
      sfx(t.shot, { x: m.x, vol: 0.75 });
      m.muzzle = 0.08;
      if (target) {
        const p = pointIn(target.el);
        effect('PUFF', 'ABCD', p.x / g.PX, p.y / g.PX, { fd: 0.06, s: 1, anchor: 'center' });
        damageElement(target.el, p.x, p.y, t.shot === 'DSSHOTGN' ? 1 : 0);
      } else if (Math.random() < t.acc * (0.6 + 0.5 * persp(m.y)) * (0.8 + 0.1 * Math.max(0, g.wave))) {
        hurtPlayer(irnd(...t.dmg), m.x);
        if (Math.random() < 0.18) addGlassCrack(rnd(g.W * 0.2, g.W * 0.8), rnd(g.H * 0.2, g.H * 0.7), 16);
      }
      return;
    }
    if (t.kind === 'fireball') {
      sfx('DSFIRSHT', { x: m.x, vol: 0.7 });
      if (target) {
        const p = pointIn(target.el);
        launchBall(t.ball, hx, hy, p.x / g.PX, p.y / g.PX, s, { el: target.el, ex: p.x, ey: p.y });
      } else launchBall(t.ball, hx, hy, rnd(g.W * 0.3, g.W * 0.7), rnd(g.H * 0.3, g.H * 0.65), s, { dmg: irnd(...t.dmg) });
      return;
    }
    if (t.kind === 'melee' && target) {
      const p = pointIn(target.el);
      sfx('DSSGTATK', { x: m.x, vol: 0.8 });
      damageElement(target.el, p.x, p.y, 1);
    }
  }
  function launchBall(kind, x, y, tx, ty, s, { el = null, ex, ey, dmg = 0 } = {}) {
    const toPlayer = !el;
    const dist = Math.hypot(tx - x, ty - y);
    G.projectiles.push({
      kind, x, y, sx: x, sy: y, tx, ty, t: 0, dur: toPlayer ? rnd(1.0, 1.35) : clamp(dist / 140, 0.35, 1.4),
      z0: s, z1: toPlayer ? 3.4 : s, z: s, el, ex, ey, dmg,
    });
  }
  function explodeProjectile(p, impact) {
    const g = G;
    if (p.kind === 'rocket') {
      effect('MISL', 'BCD', p.x, p.y, { fd: 0.08, s: 1.4, anchor: 'center' });
      effect('BEXP', 'CDE', p.x, p.y + 8, { fd: 0.09, s: 1.1, anchor: 'bottom' });
      sfx('DSRXPLOD', { x: p.x, vol: 1 });
      g.shake = Math.max(g.shake, 9);
      sparks(p.x, p.y, 26);
      scorch(p.x, p.y, 16);
      radiusDamage(p.x, p.y, 52, 128, true);
      return;
    }
    effect(p.kind, 'CDE', p.x, p.y, { fd: 0.08, s: Math.min(3, p.z), anchor: 'center' });
    sfx('DSFIRXPL', { x: p.x, vol: impact && !p.el ? 1 : 0.6 });
    sparks(p.x, p.y, 8);
    if (impact && p.el) damageElement(p.el, p.ex ?? p.x * g.PX, p.ey ?? p.y * g.PX, p.kind === 'BAL7' ? 2 : 1);
    if (impact && !p.el) {
      hurtPlayer(p.dmg || 10, p.x);
      addGlassCrack(p.x, p.y, 20 + (p.dmg || 10));
      g.redFlash = Math.min(1, g.redFlash + 0.25);
    }
  }
  function radiusDamage(x, y, r, max, fromPlayer) {
    const g = G;
    let hit = false;
    for (const m of [...g.monsters]) {
      if (m.state === 'dying' || m.state === 'spawn') continue;
      const cy = m.y - 20 * scaleOf(m);
      const d = Math.hypot(m.x - x, cy - y);
      if (d < r * scaleOf(m) + 10) {
        const dmg = Math.round(max * (1 - clamp(d / (r + 20), 0, 0.9)));
        hurtMonster(m, dmg, m.x, cy, dmg > 60);
        hit = true;
      }
    }
    for (const b of g.barrels) if (!b.dead && Math.hypot(b.x - x, b.y - 12 - y) < r) later(120, () => hurtBarrel(b, 99));
    if (hit && fromPlayer) { g.hits++; g.hitMarker = 0.2; }
  }

  // ---------------- Босс ----------------
  function bossAttack(m) {
    const g = G;
    const r = Math.random();
    if (r < 0.2 && m.hp < m.maxHp * 0.9) {
      // Бросок на игрока
      m.lx = clamp(g.mx, 40, g.W - 40); m.ly = g.H - 6;
      setState(m, 'lunge');
      sfx('DSBRSSIT', { x: m.x, vol: 0.8, rate: 1.1 });
      return;
    }
    if (r < 0.32) {
      // Удар о землю: всё вздрагивает
      sfx('DSBAREXP', { x: m.x, vol: 0.9, rate: 0.55 });
      g.shake = 16;
      domTargets().filter(t => t.kind === 'icon').forEach(t => { t.el.classList.remove('dm-jolt'); void t.el.offsetWidth; t.el.classList.add('dm-jolt'); later(380, () => t.el.classList.remove('dm-jolt')); });
      domTargets().sort(() => Math.random() - 0.5).slice(0, 3).forEach(t => { const p = pointIn(t.el); damageElement(t.el, p.x, p.y, 1); });
      hurtPlayer(irnd(4, 9), m.x);
      m.cool = rnd(1.2, 1.8);
      return;
    }
    m.target = Math.random() < 0.35 ? { volley: 'windows' } : { volley: 'player' };
    setState(m, 'attack');
  }
  /** «Выстрел» босса кадром атаки: залп по игроку или по окнам */
  function bossAttackHit(m) {
    const g = G, s = scaleOf(m);
    const hx = m.x, hy = m.y - 46 * s;
    sfx('DSFIRSHT', { x: m.x, vol: 0.9, rate: 0.8 });
    if (m.target?.volley === 'windows') {
      domTargets().sort(() => Math.random() - 0.5).slice(0, m.enraged ? 6 : 4).forEach(t => {
        const p = pointIn(t.el);
        launchBall('BAL7', hx, hy, p.x / g.PX, p.y / g.PX, s * 0.7, { el: t.el, ex: p.x, ey: p.y });
      });
      return;
    }
    const n = m.enraged ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const spread = (i - (n - 1) / 2) * g.W * 0.16;
      launchBall('BAL7', hx, hy, clamp(g.mx + spread, 20, g.W - 20), clamp(g.my + rnd(-20, 20), 20, g.H - 50), s * 0.7, { dmg: irnd(...m.t.dmg) });
    }
  }
  function checkBossSummon(m) {
    const g = G;
    if (!m.enraged && m.hp < m.maxHp * 0.5) {
      m.enraged = true;
      sfx('DSBRSSIT', { x: m.x, vol: 1, rate: 0.85 });
      g.title = { text: 'THE BARON IS ENRAGED!', t: 0, dur: 2.2 };
      g.shake = 14; g.redFlash = 0.5;
    }
    while (m.summons.length && m.hp < m.maxHp * m.summons[0]) {
      m.summons.shift();
      const n = m.enraged ? 4 : 3;
      for (let i = 0; i < n; i++) later(i * 280, () => {
        if (!G || G.phase !== 'boss') return;
        const P = G.portal;
        spawnMonster(pick(['imp', 'imp', 'zombie', 'sergeant', 'demon']), clamp(P.x + rnd(-60, 60), 20, G.W - 20), clamp(P.y + P.r + rnd(0, 40), G.H * 0.25, G.H - 40));
      });
      say('THE BARON SUMMONS HIS MINIONS!');
    }
  }
  function bossDeath(m) {
    const g = G;
    g.speed = 0.35;
    later(1600, () => { if (G) G.speed = 1; });
    for (let i = 0; i < 12; i++) later(i * 190, () => {
      if (!G) return;
      const s = scaleOf(m);
      const x = m.x + rnd(-26, 26) * s, y = m.y - rnd(5, 60) * s;
      effect('BEXP', 'BCDE', x, y + 10, { fd: 0.08, s: rnd(0.8, 1.4), anchor: 'bottom' });
      sfx(i % 3 ? 'DSBAREXP' : 'DSRXPLOD', { x, vol: 0.9 });
      sparks(x, y, 20);
      G.shake = 12;
    });
    g.kills++;
    later(2500, () => { if (!G) return; G.whiteFlash = 1; victory(); });
  }

  // ---------------- Бочки ----------------
  function spawnBarrel() {
    const g = G;
    if (!g || g.barrels.filter(b => !b.dead).length >= 4) return;
    const x = rnd(40, g.W - 40), y = rnd(g.H * 0.45, g.H - 44);
    g.barrels.push({ x, y, hp: 20, dead: false, drawn: null, t: 0 });
    effect('TFOG', 'ABCDEFGHIJ', x, y, { fd: 0.06, s: persp(y) });
  }
  function hurtBarrel(b, dmg) {
    if (b.dead) return;
    b.hp -= dmg;
    if (b.hp > 0) return;
    b.dead = true;
    const g = G, s = persp(b.y);
    effect('BEXP', 'ABCDE', b.x, b.y, { fd: 0.09, s: s * 1.3, anchor: 'bottom' });
    sfx('DSBAREXP', { x: b.x, vol: 1 });
    g.shake = Math.max(g.shake, 10);
    sparks(b.x, b.y - 14, 24);
    scorch(b.x, b.y, 18);
    later(150, () => G && radiusDamage(b.x, b.y - 14, 60, 160, true));
    // Взрыв задевает и окна рядом
    const sx = b.x * g.PX, sy = b.y * g.PX;
    domTargets().forEach(t => {
      const r = t.el.getBoundingClientRect();
      const dx = clamp(sx, r.left, r.right) - sx, dy = clamp(sy, r.top, r.bottom) - sy;
      if (Math.hypot(dx, dy) < 70 * g.PX / 3) damageElement(t.el, clamp(sx, r.left + 4, r.right - 4), clamp(sy, r.top + 4, r.bottom - 4), 2);
    });
  }

  // ---------------- Игрок ----------------
  function hurtPlayer(d, fromX) {
    const g = G, P = g.player;
    if (P.dead || g.phase === 'victory' || g.phase === 'intro' || g.phase === 'portal') return;
    if (P.god) { g.shake = Math.max(g.shake, 3); return; }
    d = Math.round(d);
    P.health -= d;
    g.redFlash = Math.min(0.85, g.redFlash + d / 35);
    g.shake = Math.max(g.shake, 3 + d * 0.5);
    if (d >= 15) P.ouchT = 0.7;
    else { P.turnT = 0.5; P.turnDir = fromX < g.W / 2 ? -1 : 1; }
    if (P.painT <= 0) { sfx('DSPLPAIN', { vol: 0.9 }); P.painT = 0.25; }
    if (P.health <= 0) playerDied();
  }
  function addGlassCrack(x, y, size) {
    const c = G.gctx;
    c.lineCap = 'round';
    const lines = irnd(5, 9);
    for (let pass = 0; pass < 2; pass++) {
      c.strokeStyle = pass ? 'rgba(255,255,255,.75)' : 'rgba(0,0,0,.5)';
      c.lineWidth = 1;
      for (let i = 0; i < lines; i++) {
        let a = (i / lines) * Math.PI * 2 + rnd(-0.3, 0.3), px = x + (pass ? 0 : 1), py = y + (pass ? 0 : 1);
        c.beginPath(); c.moveTo(px, py);
        const steps = irnd(3, 5), len = size * rnd(0.5, 1.2);
        for (let k = 0; k < steps; k++) { a += rnd(-0.5, 0.5); px += Math.cos(a) * len / steps; py += Math.sin(a) * len / steps; c.lineTo(px, py); }
        c.stroke();
      }
    }
    c.fillStyle = 'rgba(255,255,255,.35)';
    c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2); c.fill();
  }
  function fadeGlass() {
    const g = G;
    let n = 0;
    const id = setInterval(() => {
      if (!G || G !== g || ++n > 20) return clearInterval(id);
      g.gctx.globalCompositeOperation = 'destination-out';
      g.gctx.fillStyle = 'rgba(0,0,0,.2)';
      g.gctx.fillRect(0, 0, g.W, g.H);
      g.gctx.globalCompositeOperation = 'source-over';
    }, 60);
    g.timers.push(id);
  }

  // ---------------- Эффекты и частицы ----------------
  function effect(pre, frames, x, y, { fd = 0.08, s = 1, anchor = 'sprite', alpha = 1 } = {}) {
    G.effects.push({ pre, frames, x, y, fd, s, anchor, t: 0, alpha });
  }
  function particle(x, y, o) { const g = G; if (g.particles.length > 900) g.particles.shift(); g.particles.push({ x, y, vx: 0, vy: 0, life: 1, max: o.life || 1, color: '#fff', size: 1, gravity: 0, ...o, age: 0 }); }
  function sparks(x, y, n) { for (let i = 0; i < n; i++) particle(x, y, { vx: rnd(-90, 90), vy: rnd(-120, 30), life: rnd(0.25, 0.7), color: pick(['#fff3a0', '#ffd34a', '#ff8a1c', '#ff4a1c']), size: 1, gravity: 180 }); }

  // =====================================================================
  //  Главный цикл
  // =====================================================================
  function loop(now) {
    const g = G;
    if (!g) return;
    g.raf = requestAnimationFrame(loop);
    let dt = Math.min(0.05, (now - g.last) / 1000);
    g.last = now;
    if (Power.isLocked() || document.hidden) return;
    try {
      escapeHold();
      if (!G) return;
      dt *= g.speed;
      update(dt);
      if (!G) return;
      render();
    } catch (e) {
      console.error('DOOM MOD:', e);
      finish('abort');
    }
  }
  function escapeHold() {
    const g = G;
    if (!escDown) return;
    const k = (performance.now() - escDown) / 1500;
    $('b', g.escBar).style.width = Math.min(100, k * 100) + '%';
    if (k >= 1) { escDown = 0; finish('abort'); }
  }

  function update(dt) {
    const g = G, P = g.player;
    g.t += dt; g.phaseT += dt;
    // Фазы сценария
    switch (g.phase) {
      case 'intro':
        g.glowLevel = Math.min(0.75, g.phaseT / 3);
        g.shake = Math.max(g.shake, Math.min(4, g.phaseT * 1.3));
        if (g.phaseT > 3.4 && g.assetsReady) openPortal();
        break;
      case 'portal': {
        const Pt = g.portal;
        Pt.crack = Math.min(1, g.phaseT / 0.5);
        Pt.open = ease(clamp((g.phaseT - 0.4) / 1.1, 0, 1));
        g.glowLevel = 0.85;
        if (g.phaseT > 2) { g.root.classList.remove('dm-intro'); beginWave(0); sfx('DSWPNUP', { vol: 0.8 }); }
        break;
      }
      case 'wave': {
        g.spawnT -= dt;
        const alive = g.monsters.filter(m => m.state !== 'dying').length;
        if (g.spawnQueue.length && g.spawnT <= 0 && alive < MAX_ALIVE) {
          g.spawnT = WAVES[g.wave].every * rnd(0.7, 1.3);
          const Pt = g.portal;
          spawnMonster(g.spawnQueue.shift(), clamp(Pt.x + rnd(-Pt.r, Pt.r), 20, g.W - 20), Pt.y + Pt.r * rnd(0.9, 1.3));
        }
        if (!g.spawnQueue.length && !g.monsters.length && g.phaseT > 3) waveCleared();
        break;
      }
      case 'interlude':
        if (g.phaseT > 3.6) { if (g.wave + 1 < WAVES.length) beginWave(g.wave + 1); else bossIntro(); }
        break;
      case 'bossIntro':
        g.shake = Math.max(g.shake, 2 + g.phaseT * 2.5);
        g.glowLevel = 0.9 + Math.sin(g.t * 12) * 0.1;
        g.darkLevel = Math.random() < 0.08 ? rnd(0.3, 0.7) : g.darkLevel * 0.85;
        g.portal.r += dt * 6;
        g.portal.color = Math.min(1, g.phaseT / 3);
        if (g.phaseT > 4.4) { g.darkLevel = 0; spawnBoss(); }
        break;
      case 'boss':
        g.glowLevel = g.boss?.enraged ? 1 : 0.9;
        break;
      case 'victory':
        g.glowLevel = Math.max(0, g.glowLevel - dt * 0.4);
        if (g.phaseT > 0.8 && g.portal) {
          const Pt = g.portal;
          if (!Pt.closing) { Pt.closing = true; sfx('DSTELEPT', { reverse: true, vol: 1, rate: 0.8 }); }
          Pt.open = Math.max(0, Pt.open - dt * 0.9);
          Pt.spin = -3;
          if (Math.random() < 0.6) particle(Pt.x + rnd(-60, 60), Pt.y + rnd(-60, 60), { vx: 0, vy: 0, life: 0.5, color: '#ffd34a', suck: true });
          if (Pt.open <= 0) g.portal = null;
        }
        if (g.phaseT > 1.6 && !g.repaired) { g.repaired = true; restoreWindows(true); sfx('DSGETPOW', { vol: 0.8 }); fadeGlass(); }
        if (g.phaseT > 2.4 && !g.victoryUI) {
          showVictoryUI();
          g.title = { text: 'WINDOWS 12 SAVED', t: 0, dur: 999, gold: true, big: true };
          victoryJingle();
        }
        break;
      case 'death':
        g.glowLevel = Math.min(1, g.glowLevel + dt);
        g.redFlash = Math.min(0.75, g.redFlash + dt * 0.5);
        if (g.phaseT > 2.2) showBSOD();
        break;
      case 'bsod': {
        const B = g.bsod;
        B.next -= dt * (B.fast ? 8 : 1);
        if (B.next <= 0 && B.pct < 100) {
          B.pct = Math.min(100, B.pct + irnd(2, 9));
          B.next = rnd(0.3, 0.9);
          $('.dm-pct', B.el).textContent = B.pct + '% выполнено';
        }
        if (B.pct >= 100 && !B.done) {
          B.done = true;
          later(900, () => { B.el.classList.add('dm-reboot'); });
          later(2200, () => finish('bsod'));
        }
        return;
      }
    }

    // Игрок
    P.ouchT -= dt; P.evilT -= dt; P.turnT -= dt; P.painT -= dt;
    P.rampageT = Math.max(0, P.rampageT - dt * 0.8);
    const W = g.weapon;
    W.cool -= dt; W.flash -= dt;
    if (W.anim >= 0) { W.anim += dt; if (W.anim > (W.kind === 'rocket' ? 0.5 : 0.55)) W.anim = -1; }
    if (g.fireHeld && W.cool <= 0 && ['wave', 'interlude', 'boss', 'bossIntro'].includes(g.phase)) fire('shotgun');
    g.hitMarker = Math.max(0, (g.hitMarker || 0) - dt);

    // Подбор предметов — навести прицел
    for (const p of g.pickups) {
      p.t += dt;
      if (!p.taken && Math.hypot(p.x - g.mx, p.y - 8 - g.my) < 14) {
        p.taken = true;
        const def = PICKUPS[p.kind];
        if (def.hp) P.health = Math.min(100, P.health + def.hp);
        if (def.rockets) P.rockets = Math.min(50, P.rockets + def.rockets);
        sfx('DSITEMUP', { vol: 0.8 });
        say(def.msg);
        g.bonusFlash = 0.25;
      }
    }
    g.pickups = g.pickups.filter(p => !p.taken && p.t < 25);
    g.bonusFlash = Math.max(0, (g.bonusFlash || 0) - dt);

    // Монстры
    g.monsters.forEach(m => updateMonster(m, dt));
    g.monsters = g.monsters.filter(m => !m.dead);

    // Снаряды
    for (const p of g.projectiles) {
      if (p.dead) continue;
      p.t += dt;
      const k = clamp(p.t / p.dur, 0, 1), kk = p.player ? k : (p.el ? k : k * k);
      p.x = p.sx + (p.tx - p.sx) * kk;
      p.y = p.sy + (p.ty - p.sy) * kk - (p.el && !p.player ? Math.sin(k * Math.PI) * 12 : 0);
      p.z = p.z0 + (p.z1 - p.z0) * (p.player ? k : kk);
      if (k >= 1) { p.dead = true; explodeProjectile(p, true); }
    }
    g.projectiles = g.projectiles.filter(p => !p.dead);

    // Эффекты
    for (const e of g.effects) e.t += dt;
    g.effects = g.effects.filter(e => e.t < e.frames.length * e.fd);
    for (const p of g.particles) {
      p.age += dt;
      if (p.suck && g.portal) { p.x += (g.portal.x - p.x) * dt * 4; p.y += (g.portal.y - p.y) * dt * 4; }
      p.vy += p.gravity * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
    g.particles = g.particles.filter(p => p.age < p.max);

    // Дым и огонь над повреждёнными окнами
    g.damaged.forEach(rec => {
      if (rec.lvl < 2 || !rec.el.isConnected || Math.random() > dt * rec.lvl * 2.2) return;
      const r = rec.el.getBoundingClientRect();
      const x = rnd(r.left, r.right) / g.PX, y = rnd(r.top, r.top + r.height * 0.6) / g.PX;
      particle(x, y, { vx: rnd(-5, 5), vy: rnd(-22, -10), life: rnd(1, 1.8), color: rec.lvl >= 3 && Math.random() < 0.5 ? pick(['#ff8a1c', '#ffd34a']) : pick(['rgba(60,60,60,.55)', 'rgba(90,90,90,.45)']), size: irnd(1, 2), gravity: -6, smoke: true });
    });
    // Искры из портала
    if (g.portal && g.portal.open > 0.3 && Math.random() < dt * 30) {
      const Pt = g.portal, a = rnd(0, Math.PI * 2);
      particle(Pt.x + Math.cos(a) * Pt.r * Pt.open, Pt.y + Math.sin(a) * Pt.r * 1.25 * Pt.open, { vx: rnd(-15, 15), vy: rnd(-40, -10), life: rnd(0.4, 1), color: pick(['#ffd34a', '#ff8a1c', '#ff3a0a']), size: 1, gravity: -10 });
    }

    // Тряска, вспышки, свечение
    g.shake = Math.max(0, g.shake - dt * 22);
    g.redFlash = Math.max(0, g.redFlash - dt * (g.phase === 'death' ? 0 : 0.9));
    g.whiteFlash = Math.max(0, g.whiteFlash - dt * 1.6);
    if (g.title) { g.title.t += dt; if (g.title.t > g.title.dur) g.title = null; }
    if (g.msg) { g.msg.t += dt; if (g.msg.t > 3) g.msg = null; }
    for (const c of g.corpses) c.age += dt;

    const sh = g.shake;
    const os = document.getElementById('os');
    if (sh > 0.2) {
      const px = rnd(-sh, sh) * 0.6, py = rnd(-sh, sh) * 0.6;
      os.style.translate = `${px.toFixed(1)}px ${py.toFixed(1)}px`;
      os.style.rotate = sh > 8 ? `${rnd(-0.25, 0.25).toFixed(2)}deg` : '';
      g.canvas.style.translate = `${(px * 1.3).toFixed(1)}px ${(py * 1.3).toFixed(1)}px`;
    } else { os.style.translate = ''; os.style.rotate = ''; g.canvas.style.translate = ''; }
    g.glow.style.opacity = (g.glowLevel * (0.85 + Math.sin(g.t * 3) * 0.15)).toFixed(3);
    g.dark.style.opacity = g.darkLevel.toFixed(3);
    if (g.phase === 'death') g.canvas.style.rotate = Math.min(14, g.phaseT * 9) + 'deg';
  }

  function victoryJingle() {
    const ac = Sound.context();
    if (!ac) return;
    const t0 = ac.currentTime + 0.05;
    [[0, 0], [4, 0.12], [7, 0.24], [12, 0.36], [7, 0.6], [12, 0.72]].forEach(([semi, dt], i) => {
      const o = ac.createOscillator(), gn = ac.createGain();
      o.type = 'square'; o.frequency.value = 261.6 * Math.pow(2, semi / 12);
      const t = t0 + dt, dur = i === 5 ? 1.2 : 0.22;
      gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.12, t + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(gn).connect(Sound.master); o.start(t); o.stop(t + dur + 0.05);
    });
  }

  // =====================================================================
  //  Отрисовка
  // =====================================================================
  function drawPatch(c, p, x, y) { c.drawImage(p.c, Math.round(x - p.lo), Math.round(y - p.to)); }
  /** Спрайт мира: x, y — точка на «полу», s — масштаб */
  function drawSprite(c, spr, x, y, s, opt = {}) {
    if (!spr?.p) return null;
    const p = spr.p, flip = spr.flip;
    const lo = flip ? p.w - p.lo : p.lo;
    const x0 = Math.round(x - lo * s), y0 = Math.round(y - p.to * s);
    const w = Math.max(1, Math.round(p.w * s)), h = Math.max(1, Math.round(p.h * s));
    let img = flip ? flipped(p) : p.c;
    if (opt.white) img = tinted(spr, 'white', '#fff', 0.85);
    else if (opt.red) img = tinted(spr, 'rage', '#ff1a00', 0.35);
    if (opt.fuzz) {
      c.globalAlpha = 0.28;
      c.drawImage(tinted(spr, 'black', '#000', 1), x0 + irnd(-1, 1), y0, w, h);
      c.globalAlpha = 0.18;
      c.drawImage(img, x0 + irnd(-2, 2), y0 + irnd(-1, 1), w, h);
      c.globalAlpha = 1;
    } else c.drawImage(img, x0, y0, w, h);
    return { p, flip, x0, y0, s: w / p.w };
  }

  /** Спрайт, центр которого в точке (x, y) — для снарядов, взрывов, крови */
  function drawCentered(c, spr, x, y, s, opt) {
    if (!spr?.p) return null;
    const p = spr.p, lo = spr.flip ? p.w - p.lo : p.lo;
    return drawSprite(c, spr, x + (lo - p.w / 2) * s, y + (p.to - p.h / 2) * s, s, opt);
  }

  function render() {
    const g = G, c = g.ctx, W = g.W, H = g.H;
    c.clearRect(0, 0, W, H);
    if (!A) { drawIntroText(c); return; }

    drawPortal(c);

    // Трупы
    for (const k of g.corpses) {
      const spr = A.sprite(k.t.pre, k.frame, 0);
      c.globalAlpha = g.phase === 'victory' ? Math.max(0, 1 - g.phaseT / 2) : 1;
      drawSprite(c, spr, k.x, k.y, k.s, { fuzz: k.fuzz });
      c.globalAlpha = 1;
    }
    // Предметы, бочки, монстры — по глубине (после победы бочки и предметы растворяются)
    const fade = g.phase === 'victory' ? Math.max(0, 1 - g.phaseT / 2) : 1;
    const items = [];
    if (fade > 0) g.pickups.forEach(p => items.push({ y: p.y, draw: () => {
      c.globalAlpha = fade;
      const spr = A.sprite(p.kind, 'A', 0);
      const bob = Math.sin(p.t * 4) * 1.5;
      const d = drawSprite(c, spr, p.x, p.y + bob, persp(p.y));
      if (d && Math.sin(p.t * 6) > 0.6) { c.globalAlpha = 0.35 * fade; c.drawImage(tinted(spr, 'white', '#fff', 0.9), d.x0, d.y0, d.p.w * d.s, d.p.h * d.s); }
      c.globalAlpha = 1;
    } }));
    if (fade > 0) g.barrels.forEach(b => { if (!b.dead) items.push({ y: b.y, draw: () => { b.t += 0.016; c.globalAlpha = fade; b.drawn = drawSprite(c, A.sprite('BAR1', Math.floor(b.t * 4) % 2 ? 'B' : 'A', 0), b.x, b.y, persp(b.y)); c.globalAlpha = 1; } }); });
    g.monsters.forEach(m => items.push({ y: m.y + (m.lunge || 0) * 200, draw: () => drawMonster(c, m) }));
    items.sort((a, b) => a.y - b.y).forEach(i => i.draw());

    // Снаряды
    for (const p of g.projectiles) {
      if (p.kind === 'rocket') { drawCentered(c, A.sprite('MISL', 'A', 1), p.x, p.y, p.z); continue; }
      const fr = Math.floor(g.t * 10) % 2 ? 'B' : 'A';
      const spr = A.sprite(p.kind, fr, 1);
      if (spr?.p) {
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.35;
        c.fillStyle = p.kind === 'BAL7' ? '#3f3' : '#f81';
        c.beginPath(); c.arc(p.x, p.y, 7 * p.z, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
        drawCentered(c, spr, p.x, p.y, p.z);
      }
    }
    // Эффекты
    for (const e of g.effects) {
      const f = e.frames[Math.min(e.frames.length - 1, Math.floor(e.t / e.fd))];
      const spr = A.sprite(e.pre, f, 0);
      if (!spr?.p) continue;
      if (e.anchor === 'center') drawCentered(c, spr, e.x, e.y, e.s);
      else drawSprite(c, spr, e.x, e.y, e.s);
    }
    // Частицы
    for (const p of g.particles) {
      const a = 1 - p.age / p.max;
      c.globalAlpha = p.smoke ? a * 0.8 : Math.min(1, a * 1.5);
      c.fillStyle = p.color;
      const s = p.smoke ? p.size + Math.floor(p.age * 2) : p.size;
      c.fillRect(Math.round(p.x), Math.round(p.y), s, s);
    }
    c.globalAlpha = 1;

    // Трещины на «стекле» экрана
    c.drawImage(g.glass, 0, 0);

    if (g.phase !== 'intro' && g.phase !== 'portal' && g.phase !== 'bsod') {
      drawWeapon(c);
      drawHUD(c);
    }
    drawTexts(c);
    if (g.boss && g.phase === 'boss') drawBossBar(c);
    if (['wave', 'interlude', 'boss', 'bossIntro'].includes(g.phase)) drawCrosshair(c);

    // Вспышки
    if (g.redFlash > 0) { c.fillStyle = `rgba(255,0,0,${(g.redFlash * 0.55).toFixed(3)})`; c.fillRect(0, 0, W, H); }
    if (g.bonusFlash > 0) { c.fillStyle = `rgba(255,220,80,${(g.bonusFlash * 0.6).toFixed(3)})`; c.fillRect(0, 0, W, H); }
    if (g.whiteFlash > 0) { c.fillStyle = `rgba(255,250,235,${g.whiteFlash.toFixed(3)})`; c.fillRect(0, 0, W, H); }
  }

  function drawMonster(c, m) {
    const g = G, t = m.t;
    let frame, rot = m.rot;
    switch (m.state) {
      case 'spawn': return;
      case 'walk': frame = t.walk[m.fi % 4]; break;
      case 'attack': frame = t.attack[Math.min(m.fi, t.attack.length - 1)]; rot = 1; break;
      case 'lunge': frame = t.attack[Math.min(m.fi, t.attack.length - 1)]; rot = 1; break;
      case 'retreat': frame = t.walk[Math.floor(m.st * 8) % 4]; rot = 1; break;
      case 'pain': frame = t.pain; rot = 1; break;
      case 'dying': frame = m.deathFrames[m.fi]; rot = 0; break;
    }
    const spr = rot === 0 ? A.sprite(t.pre, frame, 0) : A.sprite(t.pre, frame, rot);
    const s = scaleOf(m);
    // Тень
    if (m.state !== 'dying') {
      c.fillStyle = 'rgba(0,0,0,.28)';
      c.beginPath(); c.ellipse(m.x, m.y, 14 * s, 3.5 * s, 0, 0, Math.PI * 2); c.fill();
    }
    const opt = { white: m.flash > 0, red: m.boss && m.enraged && !(m.flash > 0), fuzz: t.fuzz && m.state !== 'dying' };
    m.drawn = drawSprite(c, spr, m.x, m.y, s, opt);
    if (m.muzzle > 0) {
      m.muzzle -= 0.016;
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = 'rgba(255,220,120,.5)';
      c.beginPath(); c.arc(m.x, m.y - 34 * s, 9 * s, 0, Math.PI * 2); c.fill();
      c.globalCompositeOperation = 'source-over';
    }
    if (m.boss && m.enraged) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.25 + Math.sin(g.t * 10) * 0.1;
      c.fillStyle = '#f20';
      c.beginPath(); c.ellipse(m.x, m.y - 35 * s, 34 * s, 42 * s, 0, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }
  }

  function drawPortal(c) {
    const g = G, P = g.portal;
    if (!P) return;
    const t = g.t;
    // Трещина перед открытием
    if (P.crack > 0 && P.open < 0.9) {
      c.strokeStyle = `rgba(255,240,180,${(1 - P.open).toFixed(2)})`;
      c.lineWidth = 1;
      c.beginPath();
      const len = P.r * 1.6 * P.crack;
      let y = P.y - len, x = P.x;
      c.moveTo(x, y);
      while (y < P.y + len) { y += rnd(3, 6); x = P.x + rnd(-3, 3); c.lineTo(x, y); }
      c.stroke();
    }
    if (P.open <= 0) return;
    const R = P.r * P.open, RY = R * 1.25;
    const hot = P.color; // 0 — красный портал, 1 — нестабильный (перед боссом)
    // Свечение
    const gl = c.createRadialGradient(P.x, P.y, R * 0.3, P.x, P.y, R * 2.6);
    gl.addColorStop(0, `rgba(255,${Math.round(120 - hot * 60)},30,.55)`);
    gl.addColorStop(1, 'rgba(255,0,0,0)');
    c.fillStyle = gl;
    c.fillRect(P.x - R * 2.6, P.y - R * 2.6, R * 5.2, R * 5.2);
    // Тёмное ядро
    c.fillStyle = '#120000';
    c.beginPath(); c.ellipse(P.x, P.y, R, RY, 0, 0, Math.PI * 2); c.fill();
    // Спиральные рукава
    const arms = 6, pts = 46;
    for (let a = 0; a < arms; a++) {
      for (let k = 0; k < pts; k++) {
        const f = k / pts;
        const ang = t * 2.2 * P.spin + a * (Math.PI * 2 / arms) + f * 4.2;
        const rr = R * (0.08 + f * 0.95);
        const x = P.x + Math.cos(ang) * rr, y = P.y + Math.sin(ang) * rr * 1.25;
        const col = f < 0.3 ? (hot > 0.5 ? '#3a0a3a' : '#4a0000') : f < 0.6 ? (hot > 0.5 ? '#a020a0' : '#b01000') : f < 0.85 ? '#ff5a10' : '#ffd34a';
        c.fillStyle = col;
        const s = f > 0.7 ? 2 : 1;
        c.fillRect(Math.round(x), Math.round(y), s, s);
      }
    }
    // Огненная кромка
    for (let i = 0; i < 90; i++) {
      const ang = (i / 90) * Math.PI * 2 + t * 0.6;
      const flick = 1 + Math.sin(t * 9 + i * 1.7) * 0.06 + rnd(-0.03, 0.03);
      const x = P.x + Math.cos(ang) * R * flick, y = P.y + Math.sin(ang) * RY * flick;
      c.fillStyle = pick(['#ffd34a', '#ff8a1c', '#ff3a0a', '#fff3a0']);
      c.fillRect(Math.round(x), Math.round(y - rnd(0, 3)), 1, irnd(1, 3));
    }
    // Пульсирующий центр
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.25 + Math.sin(t * 5) * 0.1;
    c.fillStyle = hot > 0.5 ? '#c3f' : '#f42';
    c.beginPath(); c.ellipse(P.x, P.y, R * 0.35, RY * 0.35, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }

  function drawWeapon(c) {
    const g = G, Wp = g.weapon, P = g.player;
    const fx = Math.floor((g.W - 320) / 2) + Math.round((g.mx - g.W / 2) * 0.08), fy = g.H - 200;
    let drop = 0;
    if (P.dead) drop = Math.min(120, g.phaseT * 160);
    if (g.phase === 'victory') drop = Math.min(120, g.phaseT * 80);
    const bob = Math.sin(g.t * 3) * 1.5;
    let name, flash = null;
    if (Wp.kind === 'rocket' && Wp.anim >= 0) {
      name = Wp.anim < 0.15 ? 'MISGB0' : 'MISGA0';
      if (Wp.flash > 0) flash = 'MISF' + 'ABCD'[clamp(Math.floor((0.18 - Wp.flash) / 0.045), 0, 3)] + '0';
    } else {
      // Дробовик: выстрел (A + вспышка), затем перезарядка B C D C B
      if (Wp.anim < 0) name = 'SHTGA0';
      else {
        const k = Wp.anim / 0.55;
        name = k < 0.15 ? 'SHTGA0' : k < 0.3 ? 'SHTGB0' : k < 0.5 ? 'SHTGC0' : k < 0.7 ? 'SHTGD0' : k < 0.85 ? 'SHTGC0' : 'SHTGB0';
        if (Wp.flash > 0) flash = Wp.flash > 0.06 ? 'SHTFA0' : 'SHTFB0';
      }
    }
    const p = A.patch(name);
    if (!p) return;
    const kick = Wp.anim >= 0 && Wp.anim < 0.08 ? 4 : 0;
    const x = fx + 1 - p.lo, y = fy + 16 - p.to + bob + drop + kick;
    c.drawImage(p.c, x, y);
    if (flash) { const f = A.patch(flash); if (f) c.drawImage(f.c, fx + 1 - f.lo, fy + 16 - f.to + bob + drop + kick); }
  }

  function drawNum(c, n, rightX, y, set = 'STTNUM') {
    const s = String(Math.max(0, Math.round(n)));
    let x = rightX;
    for (let i = s.length - 1; i >= 0; i--) {
      const p = A.patch(set + s[i]);
      if (!p) continue;
      x -= p.w;
      c.drawImage(p.c, x, y);
    }
  }
  function faceName() {
    const g = G, P = g.player;
    if (P.dead) return 'STFDEAD0';
    if (g.phase === 'victory' || P.god) return 'STFGOD0';
    const lvl = clamp(Math.floor((100 - Math.max(0, P.health)) * 5 / 101), 0, 4);
    if (P.ouchT > 0) return 'STFOUCH' + lvl;
    if (P.evilT > 0) return 'STFEVL' + lvl;
    if (P.turnT > 0) return (P.turnDir < 0 ? 'STFTL' : 'STFTR') + lvl + '0';
    if (P.rampageT > 1.2) return 'STFKILL' + lvl;
    const dir = g.mx < g.W * 0.36 ? 2 : g.mx > g.W * 0.64 ? 0 : 1;
    return 'STFST' + lvl + dir;
  }
  function drawHUD(c) {
    const g = G, P = g.player;
    const bx = Math.floor((g.W - 320) / 2), by = g.H - 32;
    const bar = A.patch('STBAR');
    if (!bar) return;
    c.drawImage(bar.c, bx, by);
    const arms = A.patch('STARMS');
    if (arms) c.drawImage(arms.c, bx + 104, by);
    // Оружие во владении: 2 (пистолет), 3 (дробовик), 5 (ракетница)
    [2, 3, 4, 5, 6, 7].forEach((w, i) => {
      const own = w === 2 || w === 3 || w === 5;
      const p = A.patch((own ? 'STYSNUM' : 'STGNUM') + w);
      if (p) c.drawImage(p.c, bx + 111 + (i % 3) * 12, by + 4 + Math.floor(i / 3) * 10);
    });
    drawNum(c, g.weapon.lastUsed === 'rocket' ? P.rockets : 50, bx + 44, by + 3);
    drawNum(c, Math.max(0, P.health), bx + 90, by + 3);
    const pc = A.patch('STTPRCNT');
    if (pc) { c.drawImage(pc.c, bx + 90, by + 3); c.drawImage(pc.c, bx + 221, by + 3); }
    drawNum(c, integrity(), bx + 221, by + 3);
    const face = A.patch(faceName());
    if (face) drawPatch(c, face, bx + 143, by);
    // Таблица боеприпасов справа: пули, дробь, ракеты, ячейки
    [[50, 200, 5], [50, 50, 11], [P.rockets, 50, 17], [0, 300, 23]].forEach(([cur, max, y]) => {
      drawNum(c, cur, bx + 288, by + y, 'STYSNUM');
      drawNum(c, max, bx + 314, by + y, 'STYSNUM');
    });
    // Счётчик убийств
    drawText(c, 'KILLS ' + g.kills, g.W - 6, 6, 1, 'right');
    if (g.wave >= 0 && g.phase !== 'boss' && g.phase !== 'bossIntro' && g.phase !== 'victory') drawText(c, WAVES[Math.min(g.wave, WAVES.length - 1)].name, 6, 6, 1);
    if (g.msg) drawText(c, g.msg.text, 6, 16, 1);
  }

  const glyph = ch => A.patch('STCFN' + String(ch.charCodeAt(0)).padStart(3, '0'));
  // У крупного текста между буквами 1 пиксель шрифта, иначе буквы сливаются
  const letterGap = scale => (scale > 1 ? scale : 0);
  function textWidth(s, scale = 1) {
    let w = 0, n = 0;
    for (const ch of s.toUpperCase()) { w += (ch === ' ' ? 4 : glyph(ch)?.w ?? 4) * scale; n++; }
    return w + letterGap(scale) * Math.max(0, n - 1);
  }
  /** Перекраска по яркости: светотень исходного шрифта сохраняется */
  function recolor(p, key, [r, g, b]) {
    if (p._tint.has(key)) return p._tint.get(key);
    const c = document.createElement('canvas');
    c.width = p.c.width; c.height = p.c.height;
    const x = c.getContext('2d');
    x.drawImage(p.c, 0, 0);
    const img = x.getImageData(0, 0, c.width, c.height), d = img.data;
    let max = 1;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3]) max = Math.max(max, d[i] + d[i + 1] + d[i + 2]);
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const l = (d[i] + d[i + 1] + d[i + 2]) / max, k = 0.3 + 0.7 * l, hi = l * l * 60;
      d[i] = Math.min(255, r * k + hi); d[i + 1] = Math.min(255, g * k + hi); d[i + 2] = Math.min(255, b * k + hi * 0.6);
    }
    x.putImageData(img, 0, 0);
    p._tint.set(key, c);
    return c;
  }
  function drawText(c, s, x, y, scale = 1, align = 'left', gold = false) {
    s = s.toUpperCase();
    const w = textWidth(s, scale), gap = letterGap(scale);
    let cx = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
    y = Math.round(y);
    for (const ch of s) {
      const p = ch === ' ' ? null : glyph(ch);
      if (!p) { cx += 4 * scale + gap; continue; }
      const pw = p.w * scale, ph = p.h * scale, black = tinted(p, 'shadow', '#000', 1);
      if (scale > 1) {
        // Чёткий контур в 1 пиксель экрана и тень вниз-вправо
        c.globalAlpha *= 0.6;
        c.drawImage(black, cx + 2, y + 2, pw, ph);
        c.globalAlpha /= 0.6;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) c.drawImage(black, cx + dx, y + dy, pw, ph);
      } else c.drawImage(black, cx + 1, y + 1, pw, ph);
      c.drawImage(gold ? recolor(p, 'gold', [255, 196, 40]) : p.c, cx, y, pw, ph);
      cx += pw + gap;
    }
    return w;
  }
  /** Тёмная подложка под крупный заголовок, чтобы он читался на любом фоне */
  function titleBackdrop(c, cx, y, w, h) {
    const pad = 10, x0 = Math.round(cx - w / 2 - pad * 3), x1 = Math.round(cx + w / 2 + pad * 3);
    const gr = c.createLinearGradient(x0, 0, x1, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.15, 'rgba(0,0,0,.72)');
    gr.addColorStop(0.85, 'rgba(0,0,0,.72)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gr;
    c.fillRect(x0, Math.round(y - pad), x1 - x0, Math.round(h + pad * 2));
  }
  function drawTexts(c) {
    const g = G, T = g.title;
    if (g.phase === 'intro' || g.phase === 'portal') drawIntroText(c);
    if (!T) return;
    if (T.blink && Math.floor(T.t * 4) % 2) return;
    const appear = clamp(T.t / 0.25, 0, 1), fade = T.dur < 100 ? clamp((T.dur - T.t) / 0.4, 0, 1) : 1;
    c.globalAlpha = Math.min(appear, fade);
    let scale = T.big ? (g.W > 420 ? 3 : 2) : 2;
    while (scale > 1 && textWidth(T.text, scale) > g.W - 16) scale--;
    const y = T.big ? Math.round(g.H * 0.26) : Math.round(g.H * 0.3);
    const pop = T.big ? 1 : 1 + (1 - appear) * 0.5;
    const subY = y + 9 * scale + 6;
    titleBackdrop(c, g.W / 2, y, Math.max(textWidth(T.text, scale), T.sub ? textWidth(T.sub) : 0), (T.sub ? subY + 8 : y + 8 * scale) - y);
    c.save();
    c.translate(g.W / 2, y); c.scale(pop, pop); c.translate(-g.W / 2, -y);
    drawText(c, T.text, g.W / 2, y, scale, 'center', T.gold);
    c.restore();
    if (T.sub) drawText(c, T.sub, g.W / 2, subY, 1, 'center');
    if (T.big) {
      const face = A.patch('STFGOD0');
      if (face) c.drawImage(face.c, Math.round(g.W / 2 - face.w), y - face.h * 2 - 8, face.w * 2, face.h * 2);
    }
    c.globalAlpha = 1;
  }
  function drawIntroText(c) {
    const g = G, t = g.phaseT;
    if (g.phase !== 'intro') return;
    if (!A) return;
    const logo = A.patch('M_DOOM');
    if (t > 0.8 && logo) {
      const a = clamp((t - 0.8) / 0.6, 0, 1) * (Math.random() < 0.1 ? 0.3 : 1);
      c.globalAlpha = a;
      const s = Math.min(1.5, (g.W * 0.6) / logo.w);
      c.drawImage(logo.c, Math.round(g.W / 2 - logo.w * s / 2), Math.round(g.H * 0.22), logo.w * s, logo.h * s);
      c.globalAlpha = 1;
      drawText(c, 'M O D', g.W / 2, Math.round(g.H * 0.22 + logo.h * s + 4), 2, 'center');
    }
    if (t > 1.8 && Math.floor(t * 3) % 2 === 0) drawText(c, 'WARNING: DEMONIC INTRUSION DETECTED', g.W / 2, Math.round(g.H * 0.62), 1, 'center');
  }
  function drawBossBar(c) {
    const g = G, m = g.boss;
    const w = Math.min(220, g.W - 40), x = Math.round(g.W / 2 - w / 2), y = 18;
    drawText(c, 'BARON OF HELL', g.W / 2, 6, 1, 'center');
    c.fillStyle = '#000'; c.fillRect(x - 1, y - 1, w + 2, 7);
    c.fillStyle = '#3a0000'; c.fillRect(x, y, w, 5);
    const k = clamp(m.hp / m.maxHp, 0, 1);
    c.fillStyle = m.enraged ? (Math.floor(g.t * 8) % 2 ? '#ff3a0a' : '#ffd34a') : '#d01818';
    c.fillRect(x, y, Math.round(w * k), 5);
    c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(x, y, Math.round(w * k), 1);
  }
  function drawCrosshair(c) {
    const g = G;
    const x = Math.round(g.mx), y = Math.round(g.my);
    const over = monsterAt(g.mx, g.my);
    const col = over ? '#ff3030' : '#7cff6a';
    c.fillStyle = 'rgba(0,0,0,.7)';
    for (const [dx, dy, w, h] of [[-6, 0, 4, 1], [3, 0, 4, 1], [0, -6, 1, 4], [0, 3, 1, 4]]) c.fillRect(x + dx + 1, y + dy + 1, w, h);
    c.fillStyle = col;
    for (const [dx, dy, w, h] of [[-6, 0, 4, 1], [3, 0, 4, 1], [0, -6, 1, 4], [0, 3, 1, 4]]) c.fillRect(x + dx, y + dy, w, h);
    c.fillRect(x, y, 1, 1);
    if (g.hitMarker > 0) {
      c.fillStyle = '#fff';
      for (let i = 2; i < 5; i++) { c.fillRect(x - i, y - i, 1, 1); c.fillRect(x + i, y - i, 1, 1); c.fillRect(x - i, y + i, 1, 1); c.fillRect(x + i, y + i, 1, 1); }
    }
  }

  return {
    /** Запустить вторжение. Возвращает false, если оно уже идёт */
    start: () => (G ? false : (start(), true)),
    active: () => !!G,
    stop: () => finish('abort'),
    /** Для отладки из консоли */
    _state: () => G,
  };
})();
