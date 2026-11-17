// Breath-driven music. Everything is synthesised (no samples).
// The journey calls cue(seg, startTime) a moment before each segment; frame() is called every
// animation frame with the lung level so the pad filter and the "air" sound breathe with you.

let ctx = null, NOISE = null;
const N = {};                       // nodes
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const A = { ready: false, muted: false };
const M = { stage: '', kind: '', s: null, round: 0, n: 0, drums: false, chord: [50, 57, 61, 66], root: 38, pump: false, heart: false, bloom: false, bloomT: 0, collectI: 0 };
const seq = { fn: null, dur: 0.125, step: 0, nextT: 0 };

export const clock = () => (ctx ? ctx.currentTime : performance.now() / 1000);

export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  NOISE = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = NOISE.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const g = (v, to) => { const n = ctx.createGain(); n.gain.value = v; if (to) n.connect(to); return n; };

  N.master = g(0.9, ctx.destination);
  N.comp = ctx.createDynamicsCompressor(); N.comp.threshold.value = -16; N.comp.ratio.value = 4; N.comp.attack.value = 0.005; N.comp.release.value = 0.2;
  N.comp.connect(N.master);
  N.mus = g(1, N.comp);                               // ducked to near-silence in holds
  N.dry = g(1, N.comp);                               // never ducked
  N.rev = ctx.createConvolver(); N.rev.buffer = impulse(3.2, 2.4); N.rev.connect(g(0.55, N.comp));
  N.musW = g(1, N.mus); N.musW.connect(g(0.35, N.rev));
  N.dryW = g(1, N.dry); N.dryW.connect(g(0.6, N.rev));

  // pad: 4 voices x 2 detuned saws, filter follows the lungs
  N.padF = ctx.createBiquadFilter(); N.padF.type = 'lowpass'; N.padF.frequency.value = 400; N.padF.Q.value = 0.8;
  N.padG = g(0, N.musW); N.padF.connect(N.padG);
  N.pad = [];
  for (let v = 0; v < 4; v++) for (const det of [-7, 7]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.detune.value = det + rnd(-2, 2); o.frequency.value = mtof(M.chord[v]);
    o.connect(g(0.11, N.padF)); o.start(); N.pad.push({ o, v });
  }
  // air: the sound of the breath itself
  const air = ctx.createBufferSource(); air.buffer = NOISE; air.loop = true;
  N.airF = ctx.createBiquadFilter(); N.airF.type = 'bandpass'; N.airF.Q.value = 0.9; N.airF.frequency.value = 900;
  N.airG = g(0, N.dryW); air.connect(N.airF); N.airF.connect(N.airG); air.start();
  // drone for the holds
  N.droneG = g(0, N.dryW); N.drone = [];
  for (const [semi, det, lvl] of [[0, 0, 0.5], [0, 5, 0.4], [7, -3, 0.16]]) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.detune.value = det; o.frequency.value = mtof(28 + semi);
    o.connect(g(lvl, N.droneG)); o.start(); N.drone.push({ o, semi });
  }
  setInterval(tick, 25);
  A.ready = true;
}
function impulse(sec, decay) {
  const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** decay; }
  return b;
}
export function setMuted(m) { A.muted = m; if (ctx) N.master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.03); }
export function suspend(on) { if (ctx) on ? ctx.suspend() : ctx.resume(); }

// ------------------------------------------------------------------ voices
function env(gn, t, a, d, v) { gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(v, t + a); gn.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function vg(dest) { const n = ctx.createGain(); n.gain.value = 0; n.connect(dest); return n; }
function osc(type, f, t, dur, dest) { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.connect(dest); o.start(t); o.stop(t + dur + 0.1); return o; }
function noise(t, dur, dest) { const s = ctx.createBufferSource(); s.buffer = NOISE; s.loop = true; s.connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.1); return s; }
function filt(type, f, q, dest) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(dest); return n; }

function kick(t, v = 0.8) { const gn = vg(N.mus), o = osc('sine', 150, t, 0.45, gn); o.frequency.exponentialRampToValueAtTime(43, t + 0.11); env(gn, t, 0.002, 0.38, v); }
function tom(t, f, v = 0.5) { const gn = vg(N.musW), o = osc('sine', f * 1.6, t, 0.4, gn); o.frequency.exponentialRampToValueAtTime(f, t + 0.08); env(gn, t, 0.003, 0.32, v); }
function hat(t, v = 0.2, d = 0.04) { const gn = vg(N.mus); noise(t, d, filt('highpass', 7500, 0.7, gn)); env(gn, t, 0.001, d, v); }
function rim(t, v = 0.3) { const gn = vg(N.musW); noise(t, 0.05, filt('bandpass', 1900, 2.5, gn)); osc('triangle', 420, t, 0.05, gn); env(gn, t, 0.001, 0.07, v); }
function clap(t, v = 0.3) { const gn = vg(N.musW), f = filt('bandpass', 1400, 1.2, gn); noise(t, 0.2, f); gn.gain.setValueAtTime(0.0001, t); for (const o of [0, 0.012, 0.026]) { gn.gain.setValueAtTime(v, t + o); gn.gain.exponentialRampToValueAtTime(v * 0.2, t + o + 0.01); } gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); }
function pluck(t, m, v = 0.2, d = 0.35, dest = N.musW) { const gn = vg(dest), f = filt('lowpass', 3200, 1, gn); f.frequency.setValueAtTime(4200, t); f.frequency.exponentialRampToValueAtTime(700, t + d); osc('triangle', mtof(m), t, d, f); osc('sine', mtof(m + 12), t, d, f).detune.value = 6; env(gn, t, 0.004, d, v); }
function bell(t, m, v = 0.15, d = 1.6, dest = N.dryW) { const gn = vg(dest), f = mtof(m); osc('sine', f, t, d, gn); const g2 = vg(gn); osc('sine', f * 2.76, t, d * 0.4, g2); env(g2, t, 0.001, d * 0.35, 0.35); env(gn, t, 0.002, d, v); }
function bass(t, m, d, v = 0.4, type = 'sine', cut = 600) { const gn = vg(N.mus), f = filt('lowpass', cut, 4, gn); f.frequency.setValueAtTime(cut * 2.2, t); f.frequency.exponentialRampToValueAtTime(cut, t + d * 0.7); osc(type, mtof(m), t, d, f); env(gn, t, 0.006, d, v); }
function riser(t, d, v = 0.25) { const gn = vg(N.musW), f = filt('bandpass', 300, 1.5, gn); f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(7000, t + d); noise(t, d, f); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(v, t + d); gn.gain.linearRampToValueAtTime(0, t + d + 0.05); }
function whoosh(t, d, v = 0.2) { const gn = vg(N.dryW), f = filt('bandpass', 5000, 1, gn); f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(250, t + d); noise(t, d, f); env(gn, t, 0.05, d, v); }
function boom(t) {
  const gn = vg(N.dryW), o = osc('sine', 90, t, 2.2, gn); o.frequency.exponentialRampToValueAtTime(28, t + 1.4); env(gn, t, 0.004, 2.0, 0.9);
  const g2 = vg(N.dryW), f = filt('lowpass', 6000, 0.5, g2); f.frequency.setValueAtTime(6000, t); f.frequency.exponentialRampToValueAtTime(200, t + 2.4); noise(t, 2.6, f); env(g2, t, 0.004, 2.5, 0.35);
}
function heart(t, v = 0.5) { const gn = vg(N.dry), o = osc('sine', 62, t, 0.3, gn); o.frequency.exponentialRampToValueAtTime(38, t + 0.12); env(gn, t, 0.004, 0.22, v); }

function setChord(notes, t, glide = 0.25) { M.chord = notes; if (!ctx) return; for (const p of N.pad) p.o.frequency.setTargetAtTime(mtof(notes[p.v % notes.length]), t, glide); }
function padLevel(v, t, tc = 0.4) { N.padG.gain.setTargetAtTime(v, t, tc); }
function setHold(x, t) { N.mus.gain.setTargetAtTime(1 - 0.94 * x, t, 0.12); N.droneG.gain.setTargetAtTime(0.32 * x, t, 0.8); }
function droneRoot(m, t) { for (const d of N.drone) d.o.frequency.setTargetAtTime(mtof(m + d.semi), t, 0.5); }

// one-shots the games ask for
export function collect() {
  if (!ctx || A.muted) return;
  const scale = [...M.chord, M.chord[0] + 12, M.chord[1] + 12, M.chord[2] + 12, M.chord[3] + 12];
  pluck(ctx.currentTime + 0.01, scale[M.collectI++ % scale.length] + 12, 0.16, 0.3);
}
export function sparkle(v = 0.1) { if (ctx) bell(ctx.currentTime + 0.01, pick(M.chord) + pick([12, 24]), v, 2.2); }
export function pop() { if (ctx) { const t = ctx.currentTime + 0.01; pluck(t, M.chord[0] + 24, 0.2, 0.2); pluck(t + 0.07, M.chord[2] + 24, 0.2, 0.3); } }
export function stamp() { if (ctx) { const t = ctx.currentTime + 0.01; tom(t, 90, 0.5); bell(t, M.chord[3] + 12, 0.14, 1.2); } }

// ------------------------------------------------------------------ per-frame
export function frame(level, vel) {
  if (!ctx) return;
  const t = ctx.currentTime, bright = M.bloom ? 1.8 : 1;
  N.padF.frequency.setTargetAtTime(Math.min(9000, (170 + level * level * 3800) * bright), t, 0.06);
  N.airF.frequency.setTargetAtTime(500 + level * 2600, t, 0.05);
  N.airG.gain.setTargetAtTime(Math.min(0.11, Math.abs(vel) * 0.16), t, 0.06);
}

// ------------------------------------------------------------------ sequencer
function tick() {
  if (!ctx || ctx.state !== 'running' || !seq.fn) return;
  while (seq.nextT < ctx.currentTime + 0.12) {
    if (seq.nextT > ctx.currentTime - 0.05) seq.fn(seq.step, seq.nextT);
    seq.step++; seq.nextT += seq.dur;
  }
}
function groove(fn, dur, start) {            // (re)phase the step counter so step 0 lands on `start`
  const from = Math.max(seq.fn ? seq.nextT : 0, ctx.currentTime);
  const k = Math.max(0, Math.ceil((from - start) / dur - 1e-6));
  seq.fn = fn; seq.dur = dur; seq.step = k; seq.nextT = start + k * dur;
}

const SIP_PROG = [[50, 57, 61, 66], [47, 54, 57, 62], [43, 50, 54, 59], [45, 52, 54, 61]];   // Dmaj7 Bm7 Gmaj7 A6
const SIP_ROOT = [38, 35, 31, 33];
const BOX_CH = [[53, 56, 60, 63], [53, 56, 63, 67], [49, 53, 56, 60], [51, 56, 58, 63]];      // Fm7 Fm9 Dbmaj7 Ebsus
const BOX_ROOT = [41, 41, 37, 39];

function gSips(step, t) {
  const s = step % 16, sw = s % 2 ? 0.035 : 0, tt = t + sw;
  if (M.drums) {
    if (s === 0 || s === 10) kick(tt, 0.7); if (s === 7) kick(tt, 0.35);
    if (s === 4 || s === 12) rim(tt, 0.3);
    if (s % 2 === 0) hat(tt, s % 4 === 2 ? 0.16 : 0.08); else if (Math.random() < 0.3) hat(tt, 0.05);
    if (s === 0) bass(tt, M.root, 0.5, 0.42); if (s === 7 || s === 10) bass(tt, M.root + (s === 7 ? 12 : 7), 0.25, 0.3);
  }
  if ([3, 6, 9, 14].includes(s) && Math.random() < (M.drums ? 0.45 : 0.25)) pluck(tt, pick(M.chord) + 12, 0.07, 0.4);
}
function gBox(step, t) {
  const k = step % 32, moving = M.kind === 'in' || M.kind === 'out', r = M.round;
  if (M.kind === 'title') { if (k % 16 === 0) bell(t, M.chord[k / 16 | 0] + 12, 0.06, 2); return; }
  if (k % 8 === 0) bell(t, M.chord[(k / 8) % 4] + 12, moving ? 0.1 : 0.16, 1.0);     // one ping a second: count the side
  if (!moving) return;
  if (k % 4 === 0) kick(t, 0.6);
  if (k % 4 === 2) bass(t, M.root, 0.2, 0.36, 'triangle', 500);
  if (r >= 2 && k % 4 === 2) hat(t, 0.14);
  if (r >= 4 && k % 2 === 0) pluck(t, M.chord[(k / 2) % 4] + (k % 16 < 8 ? 12 : 24), 0.07, 0.18);
  if (r >= 6 && k % 8 === 4) clap(t, 0.22);
}
function gWim(step, t) {
  const k = step % 24;
  if (M.pump) {
    const n = M.n;
    if (k === 0) tom(t, 70, 0.55); if (k === 12) tom(t, 105, 0.42);
    if (n >= 5 && k % 4 === 0) kick(t, 0.7);
    if (n >= 10 && k % 4 === 2) hat(t, 0.16, n >= 20 ? 0.09 : 0.04);
    if (n >= 15 && k % 2 === 0) bass(t, M.root + (k % 12 === 10 ? 12 : 0), 0.1, 0.3, 'sawtooth', 250 + (n - 15) * 90);
    if (n >= 20 && (k === 4 || k === 12 || k === 20)) clap(t, 0.2);
    if (n >= 26 && (n >= 28 || k % 2 === 0)) rim(t, 0.12 + 0.02 * (n - 26) + 0.004 * k);
    return;
  }
  if (M.heart) { const h = step % 10; if (h === 0) heart(t, 0.5); if (h === 3) heart(t, 0.3); return; }
  if (M.bloom) {
    const age = t - M.bloomT, dens = Math.max(0.08, 0.7 - age * 0.045);
    if (Math.random() < dens) bell(t, M.root + 24 + pick([0, 4, 7, 11, 14, 16, 19, 24]), 0.07, 2.4);
    if (step % 16 === 0) bass(t, M.root, 1.6, 0.4);
  }
}
function gLand(step, t) {
  const k = step % 48;
  if (M.kind === 'in') { if (k % 4 === 0 && k < 16) pluck(t, M.chord[(k / 4) % 4] + 12, 0.14, 0.9, N.dryW); if (k === 0) bass(t, M.root, 3.5, 0.3); }
  else if (M.kind === 'out') { if (k % 8 === 0) bell(t, M.chord[3 - ((k / 8) % 4)] + 12, 0.08, 2.6); }
  else if (k % 16 === 0) bell(t, pick(M.chord) + 12, 0.06, 2.4);
}

// called a moment before each segment starts (t = its start on the audio clock)
export function cue(s, t) {
  if (!ctx) return;
  t = Math.max(t, ctx.currentTime);
  const stageChange = s.stage !== M.stage;
  M.stage = s.stage; M.kind = s.kind; M.s = s; M.round = s.round || 0; M.n = s.n || 0;
  M.pump = !!s.pump; M.heart = !!s.open; M.bloom = !!s.bloom;

  if (s.stage === 'sips') {
    if (stageChange || s.bar) groove(gSips, 0.1875, t);
    M.drums = s.kind !== 'title'; setHold(0, t); padLevel(0.5, t);
    if (s.kind === 'title') { setChord(SIP_PROG[0], t); M.root = SIP_ROOT[0]; }
    if (s.bar) { const c = s.pat % 4; setChord(SIP_PROG[c], t); M.root = SIP_ROOT[c]; M.collectI = 0; }
    if (s.cue === 'long out' || s.cue === 'out') whoosh(t, Math.min(2, s.dur * 0.4), 0.05);
  } else if (s.stage === 'box') {
    if (stageChange || s.bar) groove(gBox, 0.125, t);
    setHold(0, t); padLevel(s.kind === 'title' ? 0.35 : 0.5, t);
    const c = s.side ?? 0; setChord(BOX_CH[c], t, 0.12); M.root = BOX_ROOT[c];
  } else if (s.stage === 'wim') {
    const root = 40 + 2 * M.round;                       // E, F#, G#
    M.root = root - 12;
    if (stageChange || s.bar || s.kind === 'title' || s.open || s.bloom) groove(gWim, 60 / 128 / 4, t);
    if (s.kind === 'title' || s.kind === 'free') { setHold(0, t); padLevel(0.35, t, 1); setChord([root + 12, root + 15, root + 19, root + 22], t, 0.6); }
    else if (s.pump) {
      setHold(0, t); padLevel(0.42 + 0.01 * M.n, t, 0.2);
      const inv = M.n < 10 ? 0 : M.n < 20 ? 1 : 2;
      if (s.kind === 'in') setChord([[12, 15, 19, 22], [15, 19, 24, 27], [19, 24, 27, 31]][inv].map((x) => root + x), t, 0.1);
      if (s.kind === 'in' && M.n === 25) riser(t, 5 * 6 * (60 / 128), 0.22);
    } else if (s.drop) { boom(t); whoosh(t, s.dur, 0.25); padLevel(0, t, 0.5); droneRoot(M.root, t); }
    else if (s.open) { setHold(1, t); padLevel(0, t, 0.3); }
    else if (s.rise) { setHold(0, t); riser(t, s.dur, 0.2); padLevel(0.55, t, 1.2); setChord([root + 12, root + 19, root + 24, root + 28], t, 0.4); }
    else if (s.bloom) { M.bloomT = t; boom(t); padLevel(0.6, t, 0.3); setChord([root + 12, root + 19, root + 26, root + 28], t, 0.2); }
    else if (s.after) { whoosh(t, s.dur, 0.22); padLevel(0.35, t, 1.5); }
  } else if (s.stage === 'land') {
    if (stageChange || s.bar) groove(gLand, 0.25, t);
    setHold(0, t); padLevel(s.kind === 'end' ? 0.25 : 0.42, t, 1.5);
    const c = s.kind === 'end' ? 0 : (s.k ?? 0) % 4;
    if (s.bar || s.kind !== 'out') { setChord(SIP_PROG[c], t, 0.8); M.root = SIP_ROOT[c]; }
    if (s.kind === 'end') { bell(t, 74, 0.2, 5); bell(t + 0.3, 78, 0.16, 5); bell(t + 0.6, 81, 0.14, 6); }
  }
}
export function stopMusic() { if (!ctx) return; const t = ctx.currentTime; seq.fn = null; padLevel(0, t, 0.5); setHold(0, t); N.droneG.gain.setTargetAtTime(0, t, 0.3); M.stage = ''; }
