// Every sound is synthesized with the Web Audio API, so there are no files to load.
// The iPhone handling is the same as Witch's Brew's (see its git history for why).
export const Sound = (() => {
  let ctx = null;
  let master = null;
  let muted = false;
  try { muted = localStorage.getItem('ggrobar-muted') === '1'; } catch {}

  const rand = (lo, hi) => lo + Math.random() * (hi - lo);

  function silentWavUrl() {
    const samples = 4410;
    const b = new DataView(new ArrayBuffer(44 + samples));
    const str = (o, s) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); b.setUint32(4, 36 + samples, true); str(8, 'WAVE');
    str(12, 'fmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
    b.setUint32(24, 44100, true); b.setUint32(28, 44100, true); b.setUint16(32, 1, true); b.setUint16(34, 8, true);
    str(36, 'data'); b.setUint32(40, samples, true);
    for (let i = 0; i < samples; i++) b.setUint8(44 + i, 128);
    return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
  }

  // iPhones silence Web Audio with the ring/silent switch unless the page is playing "media".
  let keepAlive = null;
  function asMedia() {
    try {
      if (navigator.audioSession) { navigator.audioSession.type = 'playback'; return; }
    } catch {}
    if (!/iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent))) return;
    if (!keepAlive) {
      keepAlive = new Audio(silentWavUrl());
      keepAlive.loop = true;
      keepAlive.setAttribute('playsinline', '');
    }
    if (keepAlive.paused) keepAlive.play().catch(() => {});
  }

  // Browsers only allow audio after a tap or key press, so this runs on every one.
  function unlock() {
    asMedia();
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.6;
      master.connect(ctx.destination);
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    makeNoise();
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    src.connect(ctx.destination);
    src.start(0);
  }

  const ready = () => ctx && ctx.state === 'running' && !muted;

  function tone(freq, dur, { type = 'sine', vol = 0.15, to = null, at = 0, attack = 0.005 } = {}) {
    if (!ready()) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  let noiseBuf = null;
  function makeNoise() {
    if (noiseBuf || !ctx) return;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  function noise(dur, { vol = 0.15, filter = 'lowpass', freq = 1000, to = null, q = 1, at = 0 } = {}) {
    if (!ready()) return;
    makeNoise();
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // A little bell: a few inharmonic partials that ring out.
  function bell(freq, at = 0, vol = 0.06, dur = 0.5) {
    tone(freq, dur, { at, vol });
    tone(freq * 2.76, dur * 0.6, { at, vol: vol * 0.5 });
    tone(freq * 5.4, dur * 0.3, { at, vol: vol * 0.25 });
  }

  return {
    unlock,
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('ggrobar-muted', muted ? '1' : '0'); } catch {}
      if (master) master.gain.value = muted ? 0 : 0.6;
      return muted;
    },
    hop() {
      const f = rand(480, 560);
      tone(f, 0.08, { to: f * 1.4, vol: 0.08, type: 'triangle' });
      noise(0.05, { vol: 0.03, filter: 'highpass', freq: 3000 });
    },
    // Sleigh bells: a shaken cluster of tiny bells over a shimmer. Kept to a couple of dozen sound
    // nodes, because making many at once caused a visible hitch on slow phones.
    sleighBells() {
      for (let i = 0; i < 10; i++) {
        const at = i * 0.1 + rand(0, 0.02);
        const f = rand(2600, 3400);
        tone(f, 0.18, { at, vol: 0.035 });
        tone(f * 2.76, 0.1, { at, vol: 0.015 });
      }
      noise(1.1, { vol: 0.03, filter: 'highpass', freq: 7000 });
    },
    boing() {
      tone(260, 0.25, { to: 620, vol: 0.09, type: 'triangle' });
      tone(520, 0.2, { to: 1100, vol: 0.03, at: 0.05 });
    },
    bump() {
      tone(140, 0.12, { to: 90, vol: 0.1, type: 'triangle' });
      noise(0.08, { vol: 0.08, freq: 500 });
    },
    whoosh() { noise(0.7, { vol: 0.12, filter: 'bandpass', freq: 400, to: 2400, q: 0.8 }); },
    ho() {
      // A low, jolly "ho ho" made of two bumps.
      for (const at of [0, 0.22]) tone(150, 0.18, { type: 'sawtooth', vol: 0.05, to: 120, at, attack: 0.03 });
    },
    honk() {
      tone(330, 0.22, { type: 'square', vol: 0.05 });
      tone(415, 0.22, { type: 'square', vol: 0.04 });
    },
    splat() {
      noise(0.25, { vol: 0.2, freq: 900, to: 150 });
      tone(240, 0.3, { to: 60, vol: 0.12, type: 'triangle' });
      tone(700, 0.35, { to: 1400, vol: 0.05, at: 0.25 });
    },
    splash() {
      noise(0.6, { vol: 0.18, filter: 'bandpass', freq: 1800, to: 300, q: 0.7 });
      for (let i = 0; i < 4; i++) tone(rand(500, 900), 0.08, { to: rand(1200, 1600), vol: 0.04, at: 0.15 + i * 0.08 });
    },
    freeze() {
      for (let i = 0; i < 6; i++) bell(rand(1400, 2400), i * 0.07, 0.025, 0.4);
      noise(0.9, { vol: 0.08, filter: 'bandpass', freq: 600, to: 250, q: 0.5 });
    },
    crack() {
      noise(0.06, { vol: 0.12, filter: 'highpass', freq: 2500 });
      noise(0.05, { vol: 0.08, filter: 'highpass', freq: 3500, at: 0.07 });
    },
    pickup() {
      bell(1320, 0, 0.05, 0.3);
      bell(1760, 0.08, 0.05, 0.4);
    },
    allSet() { [1047, 1319, 1568, 2093].forEach((f, i) => bell(f, i * 0.09, 0.05, 0.5)); },
    // A present whistling down out of the sky, then landing in the snow.
    fall() { tone(1400, 1.2, { to: 500, vol: 0.035, type: 'sine', attack: 0.3 }); },
    thud() {
      noise(0.18, { vol: 0.16, freq: 500, to: 120 });
      tone(150, 0.18, { to: 70, vol: 0.12, type: 'triangle' });
      bell(1760, 0.05, 0.02, 0.25);
    },
    // A raccoon rummaging in a trash can, then the can going over.
    rattle() {
      for (let i = 0; i < 7; i++) noise(0.05, { vol: 0.07, filter: 'bandpass', freq: rand(2500, 4000), q: 3, at: i * 0.15 + rand(0, 0.05) });
    },
    clatter() {
      for (let i = 0; i < 5; i++) noise(0.09, { vol: 0.12, filter: 'bandpass', freq: rand(1800, 3500), q: 2, at: i * 0.06 });
      for (let i = 0; i < 3; i++) tone(rand(900, 1300), 0.05, { to: rand(1400, 1800), vol: 0.035, at: 0.25 + i * 0.07, type: 'square' });
    },
    nog() { for (let i = 0; i < 3; i++) tone(260 - i * 30, 0.1, { to: 180 - i * 20, vol: 0.08, at: i * 0.12, type: 'triangle' }); },
    home() {
      // A door chime, then a warm chord.
      [784, 659, 523].forEach((f, i) => bell(f, i * 0.28, 0.07, 0.9));
      [523, 659, 784].forEach((f) => tone(f, 1.2, { vol: 0.03, at: 0.9, attack: 0.08, type: 'triangle' }));
    },
    lifeLost() { [440, 392].forEach((f, i) => tone(f, 0.25, { vol: 0.06, at: i * 0.18, type: 'triangle' })); },
    gameOver() { [523, 440, 349, 262].forEach((f, i) => tone(f, 0.4, { vol: 0.07, at: i * 0.25, type: 'triangle' })); },
    sing() {
      // Carolers: a soft "ooh" chord with a little vibrato feel.
      const base = [392, 494, 587];
      base.forEach((f, i) => tone(f * rand(0.995, 1.005), 0.9, { vol: 0.018, at: i * 0.02, attack: 0.15, type: 'triangle' }));
    },
  };
})();
