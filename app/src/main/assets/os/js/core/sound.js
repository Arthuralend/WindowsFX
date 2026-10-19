/* Системные звуки — синтезируются через Web Audio API */
'use strict';

const Sound = (() => {
  let ctx = null;
  let master = null;

  function context() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.connect(ctx.destination);
      updateVolume();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function level() { return Store.get('muted') ? 0 : Store.get('volume') / 100; }

  function updateVolume() {
    if (master) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.02);
  }
  Store.on('volume', updateVolume);
  Store.on('muted', updateVolume);

  function tone(freq, start, dur, { type = 'sine', gain = 0.25, attack = 0.01, release = 0.25, dest } = {}) {
    const c = ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + attack);
    g.gain.setValueAtTime(gain, start + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(dest || master);
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  const sounds = {
    startup(t) {
      [[523.25, 0], [659.25, 0.12], [783.99, 0.24], [1046.5, 0.38]].forEach(([f, d]) => {
        tone(f, t + d, 1.6 - d, { type: 'sine', gain: 0.16, attack: 0.04, release: 1.1 });
        tone(f * 2, t + d, 1.0 - d / 2, { type: 'triangle', gain: 0.03, attack: 0.04, release: 0.8 });
      });
    },
    shutdown(t) {
      [[783.99, 0], [659.25, 0.15], [523.25, 0.3], [392, 0.45]].forEach(([f, d]) => tone(f, t + d, 1.2, { gain: 0.14, attack: 0.03, release: 0.9 }));
    },
    notify(t) {
      tone(880, t, 0.35, { gain: 0.16, release: 0.3 });
      tone(1318.5, t + 0.09, 0.5, { gain: 0.13, release: 0.4 });
    },
    error(t) {
      tone(330, t, 0.18, { type: 'triangle', gain: 0.2, release: 0.12 });
      tone(247, t + 0.14, 0.3, { type: 'triangle', gain: 0.2, release: 0.25 });
    },
    click(t) { tone(1800, t, 0.03, { type: 'square', gain: 0.03, attack: 0.001, release: 0.02 }); },
    trash(t) {
      // Шуршание бумаги — фильтрованный шум
      const len = 0.35;
      const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 2500; f.Q.value = 0.8;
      const g = ctx.createGain(); g.gain.value = 0.35;
      src.connect(f).connect(g).connect(master);
      src.start(t);
    },
    lock(t) { tone(660, t, 0.15, { gain: 0.12 }); tone(440, t + 0.1, 0.3, { gain: 0.12 }); },
    unlock(t) { tone(440, t, 0.15, { gain: 0.12 }); tone(660, t + 0.1, 0.3, { gain: 0.12 }); },
    alarm(t) {
      for (let i = 0; i < 4; i++) {
        tone(988, t + i * 0.5, 0.12, { type: 'square', gain: 0.08, release: 0.05 });
        tone(988, t + i * 0.5 + 0.16, 0.12, { type: 'square', gain: 0.08, release: 0.05 });
      }
    },
    plug(t) { tone(587, t, 0.2, { gain: 0.12 }); tone(880, t + 0.12, 0.35, { gain: 0.12 }); },
    shutter(t) {
      const len = 0.12;
      const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain(); g.gain.value = 0.4;
      src.connect(g).connect(master);
      src.start(t);
    },
    volume(t) { tone(700, t, 0.12, { gain: 0.15 }); },
  };

  return {
    context,
    get master() { context(); return master; },
    level,
    play(name, force = false) {
      if (!force && !Store.get('sounds')) return;
      const c = context();
      if (!c || !sounds[name]) return;
      try { sounds[name](c.currentTime + 0.02); } catch (e) { console.warn(e); }
    },
  };
})();
