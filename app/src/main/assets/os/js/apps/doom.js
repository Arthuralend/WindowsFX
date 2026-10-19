/* DOOM v1.9 (1993) — оригинальная DOS-версия в DOSBox (js-dos, WebAssembly).
   Игра берётся из оригинального установщика в js/apps/DOOM: DOOMS_19.1 + DOOMS_19.2 — это разрезанный
   самораспаковывающийся ZIP (DOOMS_19.EXE). Он склеивается и распаковывается прямо в браузере,
   файлы передаются в DOSBox, который работает в Web Worker. */
'use strict';

Apps.register({
  id: 'doom', name: 'DOOM', icon: 'doom', desc: 'Оригинальный DOOM v1.9 (1993) в эмуляторе DOSBox',
  keywords: 'doom дум игра шутер dos dosbox id software',
  single: true,
  launch: () => openDoom(),
});

// Одноразовая «установка» для профилей, созданных до появления DOOM: настройки и файлы WindowsFX
// хранятся в localStorage, поэтому новые значения по умолчанию к ним сами не применяются
(() => {
  if (Persist.get('doom.installed', false)) return;
  try {
    if (!Store.get('startPinned').includes('doom')) Store.update('startPinned', p => [...p, 'doom']);
    const lnk = FS.P.desktop + '/DOOM.lnk';
    if (FS.isDir(FS.P.desktop) && !FS.exists(lnk)) FS.write(lnk, JSON.stringify({ app: 'doom' }));
    const exe = 'D:/Игры/DOOM/doom.exe';
    if (FS.isDir('D:') && !FS.exists(exe)) { FS.mkdirp('D:/Игры/DOOM'); FS.write(exe, 'doom'); }
    Persist.set('doom.installed', true);
  } catch (e) { console.warn('DOOM: не удалось добавить ярлыки', e); }
})();

const Doom = (() => {
  const GAME_DIR = 'js/apps/DOOM/';
  const VENDOR = 'js/vendor/js-dos/';
  const PARTS = ['DOOMS_19.1', 'DOOMS_19.2'];
  // Файлы, которые игра пишет сама: настройки и сохранения — переносим между сеансами
  const PERSIST_RE = /^(DEFAULT\.CFG|DOOMSAV\d\.DSG)$/i;

  // Начальный DEFAULT.CFG: звук Sound Blaster (как в DOSBox: порт 220h, IRQ 7, DMA 1), музыка через OPL
  const DEFAULT_CFG = [
    ['mouse_sensitivity', 5], ['sfx_volume', 8], ['music_volume', 8], ['show_messages', 1],
    ['key_right', 77], ['key_left', 75], ['key_up', 72], ['key_down', 80],
    ['key_strafeleft', 51], ['key_straferight', 52], ['key_fire', 29], ['key_use', 57],
    ['key_strafe', 56], ['key_speed', 54],
    ['use_mouse', 1], ['mouseb_fire', 0], ['mouseb_strafe', 1], ['mouseb_forward', 2],
    ['use_joystick', 0], ['joyb_fire', 0], ['joyb_strafe', 1], ['joyb_use', 3], ['joyb_speed', 2],
    ['screenblocks', 10], ['detaillevel', 0], ['snd_channels', 8],
    ['snd_musicdevice', 3], ['snd_sfxdevice', 3],
    ['snd_sbport', 0x220], ['snd_sbirq', 7], ['snd_sbdma', 1], ['snd_mport', 0x330],
    ['usegamma', 0],
  ].map(([k, v]) => `${k}\t\t${v}`).join('\r\n') + '\r\n';

  const DOSBOX_CONF = `[sdl]
autolock=false
fullscreen=false
output=surface
sensitivity=100
waitonerror=true
priority=higher,normal
mapperfile=mapper-jsdos.map
usescancodes=true

[dosbox]
machine=svga_s3
memsize=16

[cpu]
core=auto
cputype=auto
cycles=max

[mixer]
nosound=false
rate=44100
blocksize=1024
prebuffer=20

[render]
frameskip=0
aspect=false
scaler=none

[midi]
mpu401=intelligent
mididevice=default

[sblaster]
sbtype=sb16
sbbase=220
irq=7
dma=1
hdma=5
sbmixer=true
oplmode=auto
oplemu=default
oplrate=44100

[gus]
gus=false

[speaker]
pcspeaker=true
pcrate=44100
tandy=auto
disney=false

[joystick]
joysticktype=none

[dos]
xms=true
ems=true
umb=true
keyboardlayout=none

[ipx]
ipx=false

[autoexec]
echo off
mount c .
c:
cls
DOOM.EXE
`;

  // DOM KeyboardEvent.code → код клавиши js-dos (коды GLFW). Не зависит от раскладки (рус/англ).
  const KEYS = {
    Escape: 256, Enter: 257, Tab: 258, Backspace: 259, Insert: 260, Delete: 261,
    ArrowRight: 262, ArrowLeft: 263, ArrowDown: 264, ArrowUp: 265,
    PageUp: 266, PageDown: 267, Home: 268, End: 269,
    CapsLock: 280, ScrollLock: 281, NumLock: 282, PrintScreen: 283, Pause: 284,
    ShiftLeft: 340, ControlLeft: 341, AltLeft: 342, ShiftRight: 344, ControlRight: 345, AltRight: 346,
    Space: 32, Quote: 39, Comma: 44, Minus: 45, Period: 46, Slash: 47, Semicolon: 59, Equal: 61,
    BracketLeft: 91, Backslash: 92, BracketRight: 93, Backquote: 96, IntlBackslash: 348,
    NumpadDecimal: 330, NumpadDivide: 331, NumpadMultiply: 332, NumpadSubtract: 333, NumpadAdd: 334, NumpadEnter: 335,
  };
  for (let i = 0; i < 26; i++) KEYS['Key' + String.fromCharCode(65 + i)] = 65 + i;
  for (let i = 0; i < 10; i++) { KEYS['Digit' + i] = 48 + i; KEYS['Numpad' + i] = 320 + i; }
  for (let i = 1; i <= 12; i++) KEYS['F' + i] = 289 + i;
  const KBD_ESC = KEYS.Escape;
  // Запасной вариант по устаревшему keyCode — если браузер не заполнил KeyboardEvent.code
  const LEGACY = { 8: 'Backspace', 9: 'Tab', 13: 'Enter', 16: 'Shift', 17: 'Control', 18: 'Alt', 27: 'Escape', 32: 'Space', 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown' };
  function keyOf(e) {
    if (e.code) return KEYS[e.code];
    const k = e.keyCode, name = LEGACY[k];
    if (name) return KEYS[name] ?? KEYS[name + (e.location === 2 ? 'Right' : 'Left')];
    if (k >= 65 && k <= 90) return k;
    if (k >= 48 && k <= 57) return k;
    if (k >= 112 && k <= 123) return 290 + k - 112;
  }

  // ---------------- Загрузка эмулятора ----------------
  let emuPromise = null;
  function loadEmulators() {
    return emuPromise ||= new Promise((resolve, reject) => {
      if (window.emulators) return resolve(window.emulators);
      const s = document.createElement('script');
      s.src = VENDOR + 'emulators.js';
      s.onload = () => {
        if (!window.emulators) return reject(new Error('emulators.js не инициализировался'));
        window.emulators.pathPrefix = new URL(VENDOR, location.href).href;
        resolve(window.emulators);
      };
      s.onerror = () => reject(new Error('Не удалось загрузить ' + s.src));
      document.head.append(s);
    }).catch(e => { emuPromise = null; throw e; });
  }

  // ---------------- Распаковка оригинального установщика ----------------
  let gamePromise = null;
  function loadGame(onStatus) {
    return gamePromise ||= (async () => {
      onStatus?.('Чтение установщика DOOMS_19.1 + DOOMS_19.2…');
      const parts = await Promise.all(PARTS.map(async name => {
        const r = await fetch(GAME_DIR + name);
        if (!r.ok) throw new Error(`Файл ${GAME_DIR}${name} не найден (HTTP ${r.status}).`);
        return new Uint8Array(await r.arrayBuffer());
      }));
      const sfx = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      parts.reduce((off, p) => (sfx.set(p, off), off + p.length), 0);
      onStatus?.('Распаковка DOOMS_19.EXE…');
      const files = await unzip(sfx);
      for (const need of ['DOOM.EXE', 'DOOM1.WAD']) {
        if (!files.some(f => f.path === need)) throw new Error(`В установщике нет файла ${need}.`);
      }
      return files;
    })().catch(e => { gamePromise = null; throw e; });
  }

  /** Минимальный распаковщик ZIP (stored/deflate) с поддержкой SFX-заглушки перед архивом */
  async function unzip(buf) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Установщик повреждён: не найден каталог ZIP-архива.');
    const count = dv.getUint16(eocd + 10, true);
    const cdSize = dv.getUint32(eocd + 12, true);
    const cdOff = dv.getUint32(eocd + 16, true);
    const shift = eocd - cdSize - cdOff; // размер самораспаковывающейся заглушки (PKSFX)
    const latin1 = new TextDecoder('latin1');
    const entries = [];
    let p = cdOff + shift;
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Установщик повреждён: неверная запись каталога.');
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true) + shift;
      const name = latin1.decode(buf.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      if (name.endsWith('/')) continue;
      const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      entries.push({ name, method, usize, data: buf.subarray(start, start + csize) });
    }
    return Promise.all(entries.map(async e => {
      let contents;
      if (e.method === 0) contents = e.data.slice();
      else if (e.method === 8) contents = await inflateRaw(e.data);
      else throw new Error(`Неподдерживаемый метод сжатия ${e.method} у ${e.name}.`);
      if (contents.length !== e.usize) throw new Error(`Файл ${e.name} распакован с ошибкой.`);
      return { path: e.name.toUpperCase(), contents };
    }));
  }

  async function inflateRaw(data) {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // ---------------- Сохранения (IndexedDB) ----------------
  const DB_NAME = 'w12-doom', STORE = 'files';
  let dbPromise = null;
  function db() {
    return dbPromise ||= new Promise((resolve, reject) => {
      const rq = indexedDB.open(DB_NAME, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    }).catch(e => { dbPromise = null; throw e; });
  }
  async function savedFiles() {
    try {
      const d = await db();
      return await new Promise((resolve, reject) => {
        const out = [], tx = d.transaction(STORE, 'readonly'), cur = tx.objectStore(STORE).openCursor();
        cur.onsuccess = () => {
          const c = cur.result;
          if (!c) return resolve(out);
          out.push({ path: String(c.key), contents: new Uint8Array(c.value) });
          c.continue();
        };
        cur.onerror = () => reject(cur.error);
      });
    } catch (e) { console.warn('DOOM: не удалось прочитать сохранения', e); return []; }
  }
  async function storeFile(name, bytes) {
    const d = await db();
    await new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(bytes, name);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  async function clearSaves() {
    const d = await db();
    await new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  // ---------------- Звук ----------------
  /** Кольцевой буфер моно-сэмплов. Ждёт наполнения перед стартом и не даёт накапливаться задержке. */
  function ringBuffer(cap = 1 << 15, prime = 2048, maxFill = 6144) {
    const buf = new Float32Array(cap);
    let rd = 0, wr = 0, size = 0, primed = false;
    return {
      write(s) {
        if (size + s.length > maxFill) return;
        for (let i = 0; i < s.length; i++) { buf[wr] = s[i]; wr = (wr + 1) & (cap - 1); }
        size += s.length;
      },
      read(out) {
        if (!primed) primed = size >= prime;
        let i = 0;
        if (primed) for (; i < out.length && size > 0; i++, size--) { out[i] = buf[rd]; rd = (rd + 1) & (cap - 1); }
        if (i < out.length) { out.fill(0, i); primed = false; }
      },
    };
  }
  let workletUrl = null;
  const WORKLET_SRC = `const ringBuffer = ${ringBuffer.toString()};
class DoomOut extends AudioWorkletProcessor {
  constructor() { super(); this.ring = ringBuffer(); this.port.onmessage = e => this.ring.write(e.data); }
  process(inputs, outputs) { const ch = outputs[0] && outputs[0][0]; if (ch) this.ring.read(ch); return true; }
}
registerProcessor('doom-out', DoomOut);`;

  // ---------------- Управление ----------------
  const CONTROL_DEFAULTS = {
    scheme: 'modern',     // modern — WASD + мышь, classic — как в 1993 году (стрелки, «,» «.», Пробел)
    alwaysRun: true,      // постоянный бег
    mouseTurnOnly: true,  // мышь только поворачивает (без хода вперёд/назад от вертикального движения)
    mouseSens: 1,         // множитель чувствительности мыши
    rmbUse: true,         // правая кнопка мыши — «Открыть/использовать»
    wheelWeapons: true,   // колесо мыши — смена оружия
    gamepad: true,        // поддержка геймпада
  };
  const controls = () => ({ ...CONTROL_DEFAULTS, ...Persist.get('doom.controls', {}) });
  const setControls = c => Persist.set('doom.controls', c);

  // DOS-сканкоды для DEFAULT.CFG (DOOM 1.9 хранит в нём именно их)
  const SC = { W: 17, E: 18, A: 30, S: 31, D: 32, SPACE: 57, CTRL: 29, ALT: 56, SHIFT: 54, UP: 72, LEFT: 75, RIGHT: 77, DOWN: 80, COMMA: 51, PERIOD: 52 };
  function bindings(c) {
    const modern = c.scheme === 'modern';
    return {
      key_up: modern ? SC.W : SC.UP, key_down: modern ? SC.S : SC.DOWN,
      key_left: SC.LEFT, key_right: SC.RIGHT,
      key_strafeleft: modern ? SC.A : SC.COMMA, key_straferight: modern ? SC.D : SC.PERIOD,
      key_fire: SC.CTRL, key_use: modern ? SC.E : SC.SPACE, key_strafe: SC.ALT, key_speed: SC.SHIFT,
      use_mouse: 1, mouseb_fire: 0, mouseb_strafe: 1, mouseb_forward: 2, use_joystick: 0,
      // Известный приём оригинального DOOM 1.9: joyb_speed 29 включает постоянный бег
      joyb_speed: c.alwaysRun ? 29 : 2,
    };
  }
  /** Подставить привязки в DEFAULT.CFG, не трогая остальные настройки игрока (громкость, размер экрана…) */
  function applyBindings(bytes, c) {
    const b = bindings(c), seen = new Set();
    const text = new TextDecoder('latin1').decode(bytes);
    const out = text.split(/\r?\n/).filter(Boolean).map(line => {
      const k = line.split(/\s+/)[0];
      if (!(k in b)) return line;
      seen.add(k);
      return `${k}\t\t${b[k]}`;
    });
    for (const k in b) if (!seen.has(k)) out.push(`${k}\t\t${b[k]}`);
    const s = out.join('\r\n') + '\r\n';
    return Uint8Array.from(s, ch => ch.charCodeAt(0) & 255);
  }

  return {
    KEYS, KBD_ESC, keyOf, DEFAULT_CFG, DOSBOX_CONF, PERSIST_RE, loadEmulators, loadGame, savedFiles, storeFile, clearSaves, ringBuffer,
    CONTROL_DEFAULTS, controls, setControls, applyBindings,
    workletUrl: () => workletUrl ||= URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'text/javascript' })),
  };
})();

function openDoom() {
  const win = WM.open({
    app: 'doom', title: 'DOOM', width: 800, height: 646, minWidth: 360, minHeight: 300, bodyClass: 'doom-body',
    onClose: () => destroy(),
    onFocus: () => setTimeout(() => !closed && screen.focus({ preventScroll: true }), 0),
    onResize: () => fit(),
  });
  const b = win.body;
  b.innerHTML = `<div class="doom-screen" tabindex="0" data-raw-keys>
      <canvas class="doom-canvas" width="640" height="400"></canvas>
      <div class="doom-status">
        <div class="doom-logo">DOOM</div>
        <div class="doom-status-text">Подготовка…</div>
        <div class="doom-progress"><i></i></div>
      </div>
      <div class="doom-hint hidden"></div>
    </div>
    <div class="doom-panel hidden" role="dialog" aria-label="Управление"></div>`;
  win.tbExtra.innerHTML = `<span class="spacer"></span>
    <button class="icon-btn sm no-drag doom-keys" title="Управление">${Icons.ui('keyboard', 15)}</button>
    <button class="icon-btn sm no-drag doom-mute" title="Звук">${Icons.ui('volume', 15)}</button>
    <button class="icon-btn sm no-drag doom-mouse" title="Захватить мышь">${Icons.ui('mouse', 15)}</button>
    <button class="icon-btn sm no-drag doom-full" title="Во весь экран">${Icons.ui('display', 15)}</button>
    <button class="icon-btn sm no-drag doom-restart" title="Перезапустить DOSBox">${Icons.ui('restart', 15)}</button>`;

  const screen = $('.doom-screen', b), canvas = $('.doom-canvas', b), ctx2d = canvas.getContext('2d', { alpha: false });
  const status = $('.doom-status', b), statusText = $('.doom-status-text', b), hint = $('.doom-hint', b);
  const muteBtn = $('.doom-mute', win.tbExtra);

  let ci = null, closed = false, booting = false, muted = false;
  let audio = null, frame = null, frameW = 0, frameH = 0, rafId = 0, imageData = null;
  const mouseDown = new Set();
  const cleanups = [];
  let syncTimer = 0, syncing = false;
  const lastSaved = new Map(); // имя → байты, уже записанные в IndexedDB

  const setStatus = (text, kind = 'busy') => {
    status.classList.remove('hidden', 'error', 'busy');
    status.classList.add(kind);
    statusText.textContent = text;
  };

  // ---------------- Изображение ----------------
  function fit() {
    // clientWidth/Height — размер без CSS-трансформаций (анимации сворачивания/открытия окна масштабируют его)
    const sw = screen.clientWidth, sh = screen.clientHeight;
    if (!sw || !sh) return;
    // Картинка DOS (320×200, 640×400, 720×400) всегда показывается в пропорции 4:3, как на ЭЛТ-мониторе
    const w = Math.min(sw, sh * 4 / 3), h = w * 3 / 4;
    canvas.style.width = Math.floor(w) + 'px';
    canvas.style.height = Math.floor(h) + 'px';
  }
  const ro = new ResizeObserver(fit);
  ro.observe(screen);
  cleanups.push(() => ro.disconnect());

  function draw() {
    rafId = 0;
    if (!frame || !frameW || !frameH) return;
    if (!imageData || imageData.width !== frameW || imageData.height !== frameH) {
      canvas.width = frameW; canvas.height = frameH;
      imageData = ctx2d.createImageData(frameW, frameH);
      imageData.data.fill(255);
    }
    const dst = imageData.data, src = frame.data;
    if (frame.rgba) dst.set(src.subarray(0, dst.length));
    else for (let i = 0, j = 0, n = frameW * frameH; i < n; i++, j += 3) {
      const k = i * 4;
      dst[k] = src[j]; dst[k + 1] = src[j + 1]; dst[k + 2] = src[j + 2];
    }
    ctx2d.putImageData(imageData, 0, 0);
  }

  // ---------------- Звук ----------------
  async function startAudio(rate) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !rate) return null;
    let ac;
    try { ac = new AC({ sampleRate: rate, latencyHint: 'interactive' }); }
    catch { try { ac = new AC(); } catch { return null; } }
    const gain = ac.createGain();
    gain.connect(ac.destination);
    // DOSBox присылает моно-сэмплы порциями; проигрываем их через кольцевой буфер в AudioWorklet
    let node, push;
    try {
      await ac.audioWorklet.addModule(Doom.workletUrl());
      node = new AudioWorkletNode(ac, 'doom-out', { numberOfInputs: 0, outputChannelCount: [1] });
      push = samples => node.port.postMessage(samples);
    } catch {
      // Запасной вариант для старых браузеров
      const ring = Doom.ringBuffer();
      node = ac.createScriptProcessor(2048, 0, 1);
      node.onaudioprocess = e => ring.read(e.outputBuffer.getChannelData(0));
      push = samples => ring.write(samples);
    }
    node.connect(gain);
    const vol = () => { gain.gain.value = muted ? 0 : Sound.level(); };
    vol();
    const offV = Store.on('volume', vol), offM = Store.on('muted', vol);
    const resume = () => { if (ac.state === 'suspended') ac.resume().catch(() => {}); };
    resume();
    return {
      ac, vol, resume, push,
      close() { offV(); offM(); node.disconnect(); ac.close().catch(() => {}); },
    };
  }

  // ---------------- Управление ----------------
  let ctl = Doom.controls();
  let bootedWith = null; // схема и бег, с которыми запущен DOSBox (они записаны в DEFAULT.CFG)
  const K = Doom.KEYS;
  const modern = () => (bootedWith || ctl).scheme === 'modern';
  // Клавиши DOS, на которые в DEFAULT.CFG привязаны действия
  const act = () => modern()
    ? { fwd: K.KeyW, back: K.KeyS, left: K.KeyA, right: K.KeyD, use: K.KeyE }
    : { fwd: K.ArrowUp, back: K.ArrowDown, left: K.Comma, right: K.Period, use: K.Space };

  // Нажатия считаются по ссылкам: одну клавишу DOS могут одновременно «держать» клавиатура, мышь и геймпад.
  // DOOM опрашивает клавиши 35 раз в секунду, поэтому отпускание уходит не раньше чем через MIN_HOLD мс.
  const MIN_HOLD = 60, held = new Map(), downAt = new Map();
  function hold(code) {
    if (!ci) return;
    const n = held.get(code) || 0;
    held.set(code, n + 1);
    if (n === 0) { downAt.set(code, performance.now()); ci.sendKeyEvent(code, true); }
  }
  function unhold(code) {
    const n = held.get(code) || 0;
    if (!n) return;
    if (n > 1) { held.set(code, n - 1); return; }
    held.delete(code);
    const c = ci;
    if (!c) return;
    const wait = MIN_HOLD - (performance.now() - (downAt.get(code) || 0));
    if (wait > 0) setTimeout(() => { if (!held.has(code)) c.sendKeyEvent(code, false); }, wait);
    else c.sendKeyEvent(code, false);
  }
  const tap = (code, ms = 90) => { hold(code); setTimeout(() => unhold(code), ms); };

  // Источник ввода (клавиша, кнопка мыши или геймпада) держит набор клавиш DOS, пока нажат
  const sources = new Map();
  function press(id, codes, late) {
    if (sources.has(id)) return;
    const src = { codes: [...codes], timer: 0 };
    sources.set(id, src);
    codes.forEach(hold);
    if (late) src.timer = setTimeout(() => {
      src.timer = 0;
      if (sources.get(id) !== src) return;
      late.forEach(hold);
      src.codes.push(...late);
    }, 150);
  }
  function release(id) {
    const src = sources.get(id);
    if (!src) return;
    clearTimeout(src.timer);
    sources.delete(id);
    src.codes.forEach(unhold);
  }

  // В DOOM 1.9 на действие можно назначить только одну клавишу, поэтому в современной схеме
  // стрелки и Пробел дополнительно «нажимают» привязанные W/S/E
  function translate(code) {
    if (!modern()) return { now: [code] };
    if (code === K.ArrowUp) return { now: [code, K.KeyW] };
    // «S» в меню DOOM прыгает на пункт «Save game», поэтому к стрелке вниз она добавляется, только если стрелку держат
    if (code === K.ArrowDown) return { now: [code], late: [K.KeyS] };
    if (code === K.Space) return { now: [code, K.KeyE] };
    return { now: [code] };
  }

  // Оружие: колесо мыши листает слоты 1–7, Q возвращает предыдущее
  let weapon = 2, prevWeapon = 0;
  function noteWeapon(n) { if (n !== weapon) { prevWeapon = weapon; weapon = n; } }
  function selectWeapon(n) { noteWeapon(n); tap(K['Digit' + n]); }
  const cycleWeapon = dir => selectWeapon(((weapon - 1 + dir + 7) % 7) + 1);
  const lastWeapon = () => { if (prevWeapon) selectWeapon(prevWeapon); };

  function releaseAll() {
    [...sources.keys()].forEach(release);
    [...mouseDown].forEach(btn => { ci?.sendMouseButton(btn, false); mouseDown.delete(btn); });
  }

  // ---------------- Клавиатура ----------------
  let lastRealEsc = 0;
  screen.addEventListener('keydown', e => {
    const code = Doom.keyOf(e);
    if (code === undefined) return;
    e.preventDefault(); e.stopPropagation();
    if (code === Doom.KBD_ESC) lastRealEsc = performance.now();
    audio?.resume();
    if (e.repeat || !ci) return;
    if (modern() && e.code === 'KeyQ') return lastWeapon();
    const d = /^Digit([1-7])$/.exec(e.code);
    if (d) noteWeapon(+d[1]);
    const t = translate(code);
    press('key:' + (e.code || code), t.now, t.late);
  });
  screen.addEventListener('keyup', e => {
    const code = Doom.keyOf(e);
    if (code === undefined) return;
    e.preventDefault(); e.stopPropagation();
    release('key:' + (e.code || code));
  });
  screen.addEventListener('blur', releaseAll);
  const onWinBlur = () => releaseAll();
  addEventListener('blur', onWinBlur);
  cleanups.push(() => removeEventListener('blur', onWinBlur));
  // Ctrl+W браузер не даёт перехватить: пока идёт игра, просим подтвердить закрытие вкладки
  const onBeforeUnload = e => { if (ci && !closed) { e.preventDefault(); e.returnValue = ''; } };
  addEventListener('beforeunload', onBeforeUnload);
  cleanups.push(() => removeEventListener('beforeunload', onBeforeUnload));

  // ---------------- Мышь ----------------
  const locked = () => document.pointerLockElement === canvas;
  let unlockRequested = false;
  // Если браузер не умеет захватывать указатель (или страница во фрейме без разрешения),
  // мышь работает без захвата: движение над экраном поворачивает, кнопки передаются в игру
  let freeMouse = !canvas.requestPointerLock;
  async function lockMouse() {
    if (!ci || locked() || freeMouse) return;
    try { await canvas.requestPointerLock({ unadjustedMovement: true }); }
    catch {
      try { await canvas.requestPointerLock(); }
      catch (e) {
        // SecurityError — слишком частый повторный захват после Esc; это временно
        if (e?.name === 'SecurityError') return;
        freeMouse = true;
        $('.doom-mouse', win.tbExtra).classList.add('active');
        showHint('Браузер не разрешил захват мыши — мышь работает без захвата', 5000);
      }
    }
  }
  function unlockMouse() { if (locked()) { unlockRequested = true; document.exitPointerLock(); } }
  const domToDos = btn => (btn === 0 ? 0 : btn === 2 ? 1 : btn === 1 ? 2 : -1);

  canvas.addEventListener('pointerdown', e => {
    screen.focus({ preventScroll: true });
    audio?.resume();
    if (!ci) return;
    if (!locked() && !freeMouse) { e.preventDefault(); lockMouse(); return; }
    e.preventDefault();
    // Правая кнопка — «Открыть/использовать», как в современных шутерах
    if (e.button === 2 && ctl.rmbUse) return press('mouse:2', [act().use]);
    const btn = domToDos(e.button);
    if (btn < 0) return;
    mouseDown.add(btn);
    downAt.set('m' + btn, performance.now());
    ci.sendMouseButton(btn, true);
  });
  const onPointerUp = e => {
    if (e.button === 2) release('mouse:2');
    const btn = domToDos(e.button);
    if (!mouseDown.has(btn) || !ci) return;
    mouseDown.delete(btn);
    const c = ci, wait = MIN_HOLD - (performance.now() - (downAt.get('m' + btn) || 0));
    if (wait > 0) setTimeout(() => { if (!mouseDown.has(btn)) c.sendMouseButton(btn, false); }, wait);
    else c.sendMouseButton(btn, false);
  };
  addEventListener('pointerup', onPointerUp);
  cleanups.push(() => removeEventListener('pointerup', onPointerUp));

  // Поворот: дробные смещения копятся, чтобы низкая чувствительность не «съедала» медленные движения
  let accX = 0, accY = 0;
  function look(dx, dy) {
    if (!ci) return;
    accX += dx * ctl.mouseSens;
    accY += ctl.mouseTurnOnly ? 0 : dy * ctl.mouseSens;
    const ix = Math.trunc(accX), iy = Math.trunc(accY);
    if (!ix && !iy) return;
    accX -= ix; accY -= iy;
    ci.sendMouseRelativeMotion(ix, iy);
  }
  canvas.addEventListener('mousemove', e => {
    if ((locked() || freeMouse) && (e.movementX || e.movementY)) look(e.movementX, e.movementY);
  });
  let wheelAt = 0;
  canvas.addEventListener('wheel', e => {
    if (!ci || !ctl.wheelWeapons) return;
    e.preventDefault();
    const now = performance.now();
    if (now - wheelAt < 120 || !e.deltaY) return;
    wheelAt = now;
    cycleWeapon(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // ---------------- Геймпад ----------------
  let padRaf = 0, padPrev = {}, padLast = 0, padHinted = false;
  function padDown(id) {
    const a = act();
    if (id === 'b3') return lastWeapon();
    if (id === 'b4' || id === 'b5') return cycleWeapon(id === 'b5' ? 1 : -1);
    const dpad = { b12: K.ArrowUp, b13: K.ArrowDown, b14: K.ArrowLeft, b15: K.ArrowRight }[id];
    if (dpad) { const t = translate(dpad); return press('pad:' + id, t.now, t.late); }
    const code = {
      fwd: a.fwd, back: a.back, sl: a.left, sr: a.right,
      b0: K.Enter, b1: K.Backspace, b2: a.use, b6: a.use, b7: K.ControlLeft, b8: K.Tab, b9: K.Escape,
    }[id];
    if (code) press('pad:' + id, [code]);
  }
  function releasePad() { for (const id in padPrev) release('pad:' + id); padPrev = {}; }
  function pollPad(t) {
    padRaf = requestAnimationFrame(pollPad);
    const dt = Math.min(50, t - (padLast || t));
    padLast = t;
    if (!ci || paused || !ctl.gamepad || !win.isActive() || !document.hasFocus()) { releasePad(); return; }
    const pad = [...(navigator.getGamepads?.() || [])].find(p => p?.connected);
    if (!pad) { releasePad(); return; }
    if (!padHinted) { padHinted = true; showHint('Геймпад подключён: левый стик — ход, правый — поворот, RT — огонь, X — открыть', 5000); }
    const on = {}, ax = pad.axes, dz = 0.4;
    pad.buttons.forEach((btn, i) => { if (btn.pressed || btn.value > 0.5) on['b' + i] = true; });
    if (ax[1] < -dz) on.fwd = true;
    if (ax[1] > dz) on.back = true;
    if (ax[0] < -dz) on.sl = true;
    if (ax[0] > dz) on.sr = true;
    for (const id in on) if (!padPrev[id]) padDown(id);
    for (const id in padPrev) if (!on[id]) release('pad:' + id);
    padPrev = on;
    // Правый стик — плавный поворот, как мышью
    const rx = ax[2] || 0;
    if (Math.abs(rx) > 0.15) look(Math.sign(rx) * Math.pow(Math.abs(rx), 1.6) * 0.9 * dt, 0);
  }
  padRaf = requestAnimationFrame(pollPad);
  cleanups.push(() => cancelAnimationFrame(padRaf));

  const onLockChange = () => {
    const on = locked();
    screen.classList.toggle('locked', on);
    $('.doom-mouse', win.tbExtra).classList.toggle('active', on);
    if (on) { showHint('Мышь захвачена. Esc — меню игры и освобождение мыши'); return; }
    releaseAll();
    const byUser = !unlockRequested;
    unlockRequested = false;
    // Браузер сам освобождает мышь по Esc и не передаёт нажатие странице — отправляем Esc в DOOM
    if (byUser && ci && !closed && win.isActive() && document.hasFocus()) {
      setTimeout(() => {
        if (performance.now() - lastRealEsc < 300 || !ci) return;
        ci.sendKeyEvent(Doom.KBD_ESC, true);
        setTimeout(() => ci?.sendKeyEvent(Doom.KBD_ESC, false), 60);
      }, 120);
    }
  };
  document.addEventListener('pointerlockchange', onLockChange);
  cleanups.push(() => document.removeEventListener('pointerlockchange', onLockChange));

  let hintT;
  function showHint(text, ms = 3500) {
    hint.textContent = text;
    hint.classList.remove('hidden');
    clearTimeout(hintT);
    hintT = setTimeout(() => hint.classList.add('hidden'), ms);
  }

  // ---------------- Кнопки заголовка ----------------
  function updateMute() {
    muteBtn.innerHTML = Icons.ui(muted ? 'volume-mute' : 'volume', 15);
    muteBtn.title = muted ? 'Включить звук' : 'Выключить звук';
    audio?.vol();
  }
  muteBtn.onclick = () => { muted = !muted; updateMute(); screen.focus(); };
  $('.doom-mouse', win.tbExtra).onclick = () => {
    if (freeMouse) showHint('Захват мыши недоступен в этом браузере — мышь работает без захвата');
    else locked() ? unlockMouse() : lockMouse();
    screen.focus();
  };
  $('.doom-full', win.tbExtra).onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await screen.requestFullscreen();
        // В полноэкранном режиме можно забрать у браузера все клавиши (Esc, Ctrl+W…) — они уйдут прямо в игру;
        // выйти из полноэкранного режима — удерживать Esc
        navigator.keyboard?.lock?.().catch(() => {});
      }
    } catch (e) { console.warn(e); }
    screen.focus();
  };
  const onFsChange = () => { if (!document.fullscreenElement) navigator.keyboard?.unlock?.(); fit(); };
  document.addEventListener('fullscreenchange', onFsChange);
  cleanups.push(() => document.removeEventListener('fullscreenchange', onFsChange));
  async function restart() {
    if (booting) return;
    await stopEmulator();
    if (!closed) boot();
  }
  $('.doom-restart', win.tbExtra).onclick = restart;
  $('.doom-keys', win.tbExtra).onclick = () => (panelOpen ? closePanel() : openPanel());

  // ---------------- Панель «Управление» ----------------
  const panel = $('.doom-panel', b);
  let panelOpen = false;
  const KEY_HELP = {
    modern: [
      ['W A S D', 'Ход и движение вбок'], ['Мышь, ← →', 'Поворот'], ['ЛКМ, Ctrl', 'Огонь'],
      ['ПКМ, E, Пробел', 'Открыть дверь, нажать кнопку'], ['1–7, колесо мыши', 'Оружие'], ['Q', 'Предыдущее оружие'],
      ['Shift', 'Бег (если постоянный бег выключен)'], ['Alt + поворот', 'Движение вбок'], ['Tab', 'Карта'],
      ['Esc', 'Меню'], ['F2 / F3', 'Сохранить / загрузить'], ['F6 / F9', 'Быстрое сохранение / загрузка'],
      ['− / =', 'Размер экрана'], ['F11', 'Яркость'],
    ],
    classic: [
      ['↑ ↓', 'Ход'], ['← →', 'Поворот'], [', .', 'Движение вбок'], ['Ctrl, ЛКМ', 'Огонь'], ['Пробел', 'Открыть дверь, нажать кнопку'],
      ['Shift', 'Бег'], ['Alt + ← →', 'Движение вбок'], ['1–7', 'Оружие'], ['Tab', 'Карта'], ['Esc', 'Меню'],
      ['F2 / F3', 'Сохранить / загрузить'], ['F6 / F9', 'Быстрое сохранение / загрузка'],
    ],
    pad: [
      ['Левый стик', 'Ход'], ['Правый стик', 'Поворот'], ['RT', 'Огонь'], ['X, LT', 'Открыть'], ['LB / RB', 'Оружие'],
      ['Y', 'Предыдущее оружие'], ['Back', 'Карта'], ['Start', 'Меню'], ['A / B', 'Выбрать / назад в меню'], ['Крестовина', 'Стрелки'],
    ],
  };
  const keyRows = rows => rows.map(([k, v]) => `<div class="dp-k"><span>${k.split(', ').map(x => `<kbd>${esc(x)}</kbd>`).join(' ')}</span><span>${esc(v)}</span></div>`).join('');
  const row = (key, title, desc) => `<div class="dp-row"><div><div class="dp-t">${title}</div>${desc ? `<div class="dp-d">${desc}</div>` : ''}</div>${toggleHTML('dp-' + key, ctl[key], false)}</div>`;

  function renderPanel() {
    panel.innerHTML = `<div class="dp-head"><b>Управление</b><span class="spacer"></span>
        <button class="icon-btn sm dp-close" title="Закрыть (Esc)">${Icons.ui('close', 14)}</button></div>
      <div class="dp-body">
        <div class="dp-row"><div><div class="dp-t">Схема управления</div><div class="dp-d">Современная — WASD и мышь, классическая — как в 1993 году</div></div>
          <div class="seg dp-scheme"><button data-v="modern" class="${ctl.scheme === 'modern' ? 'on' : ''}">Современная</button><button data-v="classic" class="${ctl.scheme === 'classic' ? 'on' : ''}">Классическая</button></div></div>
        ${row('alwaysRun', 'Постоянный бег', 'Игрок всегда бегает, как в современных шутерах')}
        ${row('mouseTurnOnly', 'Мышь только поворачивает', 'Вертикальное движение мыши не двигает игрока вперёд и назад')}
        <div class="dp-row"><div><div class="dp-t">Чувствительность мыши</div><div class="dp-d dp-sens-v">×${ctl.mouseSens.toFixed(2)}</div></div>
          <input type="range" class="slider dp-sens" min="0.25" max="3" step="0.05" value="${ctl.mouseSens}"></div>
        ${row('rmbUse', 'Правая кнопка — «Открыть»', 'Иначе — движение вбок, как в оригинале')}
        ${row('wheelWeapons', 'Колесо мыши — смена оружия', 'Листает слоты 1–7; Q — предыдущее оружие')}
        ${row('gamepad', 'Геймпад', 'Xbox, PlayStation и другие контроллеры')}
        <div class="dp-restart ${needsRestart() ? '' : 'hidden'}">
          <span>Схема управления и постоянный бег применятся после перезапуска DOSBox. Сохранения останутся, несохранённый прогресс уровня пропадёт.</span>
          <button class="btn primary sm dp-apply">Перезапустить</button></div>
        <div class="dp-note">Ctrl+W браузер закрывает вкладку сам — стреляйте мышью или играйте во весь экран: там все клавиши уходят в игру.</div>
        <h4>Клавиатура и мышь</h4><div class="dp-keys">${keyRows(KEY_HELP[ctl.scheme])}</div>
        <h4>Геймпад</h4><div class="dp-keys">${keyRows(KEY_HELP.pad)}</div>
      </div>`;
    $('.dp-close', panel).onclick = closePanel;
    $('.dp-apply', panel).onclick = () => { closePanel(); restart(); };
    $$('.dp-scheme button', panel).forEach(btn => btn.onclick = () => update({ scheme: btn.dataset.v }, true));
    ['alwaysRun', 'mouseTurnOnly', 'rmbUse', 'wheelWeapons', 'gamepad'].forEach(k => {
      $(`.dp-${k} input`, panel).onchange = e => update({ [k]: e.target.checked }, k === 'alwaysRun');
    });
    const sens = $('.dp-sens', panel);
    sens.oninput = () => { update({ mouseSens: +sens.value }); $('.dp-sens-v', panel).textContent = '×' + (+sens.value).toFixed(2); };
  }
  const needsRestart = () => !!bootedWith && (bootedWith.scheme !== ctl.scheme || bootedWith.alwaysRun !== ctl.alwaysRun);
  function update(patch, rerender = false) {
    ctl = { ...ctl, ...patch };
    Doom.setControls(ctl);
    if (rerender) renderPanel();
    else $('.dp-restart', panel).classList.toggle('hidden', !needsRestart());
  }
  function openPanel() {
    panelOpen = true;
    unlockMouse();
    renderPanel();
    panel.classList.remove('hidden');
    $('.doom-keys', win.tbExtra).classList.add('active');
    updatePause();
    $('.dp-close', panel).focus();
  }
  function closePanel() {
    if (!panelOpen) return;
    panelOpen = false;
    panel.classList.add('hidden');
    $('.doom-keys', win.tbExtra).classList.remove('active');
    updatePause();
    screen.focus({ preventScroll: true });
  }
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closePanel(); } });

  // Сворачивание окна и открытая панель «Управление» ставят эмуляцию на паузу
  let paused = false;
  function updatePause() {
    if (!ci || closed) return;
    const want = win.minimized || panelOpen;
    if (want && !paused) { paused = true; releaseAll(); ci.pause(); audio?.ac.suspend().catch(() => {}); }
    else if (!want && paused) { paused = false; ci.resume(); audio?.resume(); fit(); }
  }
  const offWm = WM.on('change', updatePause);
  cleanups.push(offWm);

  // ---------------- Перенос сохранений между сеансами ----------------
  function findPersisted(node, out = []) {
    // Корень файловой системы DOSBox — смонтированный диск C:
    for (const n of node?.nodes || []) if (n.nodes === null && Doom.PERSIST_RE.test(n.name)) out.push(n.name);
    return out;
  }
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
  async function syncSaves() {
    if (!ci || syncing) return;
    syncing = true;
    try {
      const names = findPersisted(await ci.fsTree());
      for (const name of names) {
        const bytes = await ci.fsReadFile(name);
        if (!bytes || same(lastSaved.get(name.toUpperCase()), bytes)) continue;
        await Doom.storeFile(name.toUpperCase(), bytes);
        lastSaved.set(name.toUpperCase(), bytes);
      }
    } catch (e) { console.warn('DOOM: не удалось сохранить файлы игры', e); }
    finally { syncing = false; }
  }

  // ---------------- Запуск / остановка ----------------
  async function boot() {
    booting = true;
    frame = null; imageData = null;
    ctx2d.fillStyle = '#000'; ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    try {
      setStatus('Загрузка DOSBox (WebAssembly)…');
      const [emu, game, saved] = await Promise.all([
        Doom.loadEmulators(),
        Doom.loadGame(t => !closed && setStatus(t)),
        Doom.savedFiles(),
      ]);
      if (closed) return;
      setStatus('Запуск DOSBox…');
      const fsInit = new Map(game.map(f => [f.path, f.contents]));
      fsInit.set('DEFAULT.CFG', new TextEncoder().encode(Doom.DEFAULT_CFG));
      lastSaved.clear();
      for (const f of saved) { fsInit.set(f.path, f.contents); lastSaved.set(f.path, f.contents); }
      // Схема управления и постоянный бег задаются привязками в DEFAULT.CFG
      bootedWith = { scheme: ctl.scheme, alwaysRun: ctl.alwaysRun };
      fsInit.set('DEFAULT.CFG', Doom.applyBindings(fsInit.get('DEFAULT.CFG'), ctl));
      const init = [...fsInit].map(([path, contents]) => ({ path, contents: contents.slice() }));
      init.push({ dosboxConf: Doom.DOSBOX_CONF, jsdosConf: { version: emu.version } });

      const c = await emu.dosboxWorker(init);
      if (closed) { c.exit().catch(() => {}); return; }
      ci = c;
      const ev = ci.events();
      frameW = ci.width(); frameH = ci.height();
      ev.onFrameSize((w, h) => { frameW = w; frameH = h; });
      ev.onFrame((rgb, rgba) => {
        frame = rgb ? { data: rgb, rgba: false } : rgba ? { data: rgba, rgba: true } : null;
        if (!rafId) rafId = requestAnimationFrame(draw);
      });
      ev.onSoundPush(s => audio?.push(s));
      const a = await startAudio(ci.soundFrequency());
      if (closed || ci !== c) { a?.close(); return; }
      audio = a;
      ev.onExit(() => { if (!closed) setStatus('DOSBox завершил работу. Нажмите «Перезапустить».', 'error'); });
      status.classList.add('hidden');
      updateMute();
      syncTimer = setInterval(syncSaves, 15000);
      screen.focus({ preventScroll: true });
      showHint(modern()
        ? 'Щёлкните по экрану, чтобы захватить мышь · WASD — ход, мышь — поворот, ЛКМ — огонь, E — открыть · все клавиши — кнопка «Управление»'
        : 'Щёлкните по экрану, чтобы захватить мышь · Стрелки — ход, Ctrl — огонь, Пробел — открыть', 7000);
    } catch (e) {
      console.error(e);
      const hintFile = location.protocol === 'file:' ? '\n\nDOOM нужно открывать через локальный сервер: выполните «npm start» и откройте http://localhost:8080' : '';
      if (!closed) setStatus('Не удалось запустить DOOM: ' + (e.message || e) + hintFile, 'error');
    } finally { booting = false; }
  }

  async function stopEmulator() {
    clearInterval(syncTimer);
    unlockMouse();
    releaseAll();
    cancelAnimationFrame(rafId); rafId = 0;
    const c = ci;
    if (c) await syncSaves();
    ci = null;
    audio?.close(); audio = null;
    paused = false;
    if (c) {
      try { await Promise.race([c.exit(), sleep(3000)]); } catch (e) { console.warn(e); }
    }
  }

  function destroy() {
    closed = true;
    if (document.fullscreenElement === screen) document.exitFullscreen().catch(() => {});
    stopEmulator();
    cleanups.forEach(f => f());
    clearTimeout(hintT);
  }

  // Для отладки из консоли: WM.byApp('doom')[0].doom.ci
  win.doom = { get ci() { return ci; }, get audio() { return audio; }, syncSaves };
  boot();
  return win;
}
