// Sippy Gone Wild: Sips with unreasonable levels. Puff goes where your breath goes; the walls do not care.
// Reuses the Sips camera tracker, art kit, setup screen and music from ../js.
import { V, vitalsFrame } from '../js/vitals.js';
import { C, TAU, clamp, lerp, smooth, puff, burst, drawParts, parts, grain, label, wrap, rr, blobPath } from '../js/gfx.js';
import * as audio from '../js/audio.js';
import { placement, drawSetup } from '../js/setup.js';

const MP_VERSION = '0.10.14';
const MP_BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const $ = (s) => document.querySelector(s);
const TOUCH = window.matchMedia?.('(pointer: coarse)').matches;
document.documentElement.classList.toggle('touch', !!TOUCH);
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    const R = (Array.isArray(r) ? r : [r, r, r, r]).map((v) => Math.min(v || 0, w / 2, h / 2));
    const [a, b, c, d] = R.length === 4 ? R : [R[0], R[0], R[0], R[0]];
    this.moveTo(x + a, y); this.arcTo(x + w, y, x + w, y + h, b); this.arcTo(x + w, y + h, x, y + h, c); this.arcTo(x, y + h, x, y, d); this.arcTo(x, y, x + w, y, a); this.closePath();
  };
}
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ================================================================== levels
// A path is a list of moves: [seconds, lung level to end at] (same level = hold).
// gap = how far Puff's centre may stray from the path, in lung units (0..1). Smaller = meaner.
// mods: tunnel (walls everywhere), wobble (gaps sway), fake (gaps jump late), flip (inhale = down),
//       dark (lights out), speedup, shrink (gaps close as you go), shake, mirror (scrolls the other way)
function P(...moves) { return moves; }
const rep = (n, f) => Array.from({ length: n }, (_, i) => f(i)).flat();
const LEVELS = [
  { name: 'hiccup ladder', sub: 'Eight tiny sips up. Dump it all. Again.',
    path: P(...rep(3, () => [...rep(8, (i) => [[0.28, (i + 1) / 8 * 0.95], [0.14, (i + 1) / 8 * 0.95]]), [0.9, 0.05], [0.5, 0.05]])),
    gap: 0.13, spacing: 0.42, sky: C.peri, wall: C.tang },
  { name: 'stairs of doom', sub: 'Up five steps, hold each one. Down five. Twice.',
    path: P(...rep(2, () => [...rep(5, (i) => [[0.45, 0.1 + (i + 1) * 0.17], [0.7, 0.1 + (i + 1) * 0.17]]), ...rep(5, (i) => [[0.45, 0.95 - (i + 1) * 0.17], [0.7, 0.95 - (i + 1) * 0.17]])])),
    gap: 0.11, spacing: 0.3, sky: C.mint, wall: C.pink },
  { name: 'flutter', sub: 'Tiny fast in-outs. Low, then middle, then way up top.',
    path: P(...[[0.3, 0.2], [0.55, 0.5], [0.85, 0.82]].flatMap(([a, c]) => [[0.6, c], ...rep(10, (i) => [[0.32, i % 2 ? c + 0.1 : c - 0.1]])])),
    gap: 0.1, spacing: 0.12, tunnel: true, sky: C.pink, wall: C.peri },
  { name: 'dead still', sub: 'Freeze your lungs exactly where the tunnel says. No wobbling.',
    path: P([0.8, 0.5], [4, 0.5], [0.6, 0.18], [3, 0.18], [0.7, 0.86], [3, 0.86], [0.6, 0.38], [3, 0.38], [0.4, 0.62], [2.5, 0.62]),
    gap: 0.07, spacing: 0.1, tunnel: true, sky: C.lemon, wall: C.ink },
  { name: 'yo-yo', sub: 'All the way in. All the way out. Faster. Faster.',
    path: P(...rep(9, () => [[0.85, 0.95], [0.85, 0.05]])),
    gap: 0.16, spacing: 0.425, speedup: 0.6, sky: C.tang, wall: C.milk },
  { name: 'upside down', sub: 'Breathing in now pushes Puff DOWN. Good luck.',
    path: P(...rep(2, () => [[0.4, 0.3], [0.2, 0.3], [0.4, 0.6], [0.2, 0.6], [0.5, 0.9], [0.4, 0.9], [1, 0.1], [0.4, 0.1], [0.6, 0.7], [0.6, 0.4], [0.5, 0.8], [0.8, 0.2]])),
    gap: 0.14, spacing: 0.35, flip: true, sky: C.night, wall: C.lemon },
  { name: 'lights out', sub: 'You can only see right around Puff. Remember the line.',
    path: P(...rep(2, () => [[0.5, 0.75], [0.6, 0.75], [0.3, 0.25], [0.5, 0.25], [0.6, 0.55], [0.25, 0.85], [0.6, 0.85], [0.8, 0.15], [0.4, 0.15], [0.5, 0.5], [0.8, 0.5]])),
    gap: 0.14, spacing: 0.3, dark: true, wobble: 0.04, sky: C.deep, wall: C.mint },
  { name: 'liar liar', sub: 'The dotted line lies. Watch the walls; they jump at the last second.',
    path: P(...rep(3, () => [[0.6, 0.7], [0.6, 0.3], [0.5, 0.8], [0.7, 0.2], [0.6, 0.5], [0.6, 0.5]])),
    gap: 0.14, spacing: 0.55, fake: true, sky: C.leaf, wall: C.tang },
  { name: 'backwards day', sub: 'The world scrolls the other way and the walls sway.',
    path: P(...rep(3, () => [[0.35, 0.65], [0.35, 0.35], [0.6, 0.9], [0.3, 0.9], [0.9, 0.1], [0.3, 0.1], [0.5, 0.5]])),
    gap: 0.13, spacing: 0.25, mirror: true, wobble: 0.06, sky: C.pink, wall: C.ink },
  { name: 'SIPPY GONE WILD', sub: 'Everything at once. Flips, fakes, lights, speed. The gaps close. Go.',
    path: null, gap: 0.16, spacing: 0.3, speedup: 0.5, shrink: 0.5, shake: true, wild: true, sky: C.night, wall: C.pink },
];
// the final level is different every time
function wildPath() {
  const out = []; let l = 0.5;
  const r = () => Math.random();
  while (out.reduce((a, m) => a + m[0], 0) < 34) {
    const k = r();
    if (k < 0.25) { for (let i = 0; i < 6; i++) out.push([0.25, clamp(l + (i % 2 ? 0.09 : -0.09), 0.08, 0.92)]); }
    else if (k < 0.45) { const to = r() < 0.5 ? 0.05 : 0.95; out.push([0.6, to], [0.3, to]); l = to; }
    else if (k < 0.65) { for (let i = 0; i < 4; i++) { l = clamp(l + (r() < 0.5 ? -0.16 : 0.16), 0.08, 0.92); out.push([0.3, l], [0.35, l]); } }
    else if (k < 0.8) { l = 0.15 + r() * 0.7; out.push([0.5, l], [1.6, l]); }
    else { l = 0.1 + r() * 0.8; out.push([0.35 + r() * 0.4, l]); }
  }
  return out;
}

const LEAD = 2.4;          // seconds of empty sky before the first wall
const TAIL = 1.2;
const LIVES = 3;

function makePath(moves) {
  const segs = []; let t = LEAD, from = 0.5;
  segs.push({ t0: 0, d: LEAD, from: 0.5, to: 0.5 });
  for (const [d, to] of moves) { segs.push({ t0: t, d, from, to }); t += d; from = to; }
  segs.push({ t0: t, d: TAIL, from, to: from });
  const end = t + TAIL;
  const at = (tt) => {
    if (tt <= 0) return 0.5;
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (segs[m].t0 <= tt) lo = m; else hi = m - 1; }
    const s = segs[lo], p = clamp((tt - s.t0) / s.d);
    return s.from + (s.to - s.from) * (0.5 - 0.5 * Math.cos(Math.PI * p));
  };
  return { at, end, segs };
}

function buildWalls(L, path) {
  const walls = []; let k = 0;
  for (let t = LEAD; t < path.end - TAIL; t += L.spacing, k++) {
    const w = { t, k, c: path.at(t), passed: false, hit: false, fake: 0 };
    if (L.fake && k % 2 === 1) w.fake = (hash(k + 3) < 0.5 ? -1 : 1) * (0.2 + 0.15 * hash(k));
    walls.push(w);
  }
  return walls;
}

// ================================================================== state
const canvas = $('#c'), ctx = canvas.getContext('2d'), video = $('#video');
const work = document.createElement('canvas'), wctx = work.getContext('2d', { willReadFrequently: true });
V.wctx = wctx;
const st = { W: 0, H: 0, u: 1, mode: 'intro', cam: false, face: null, last: 0, lv: 0, t: 0, lives: LIVES, inv: 0, modeT: 0,
  shake: 0, flip: false, flipShown: 0, hits: 0, trail: [], best: {} };
const br = { level: 0.5, vel: 0, key: false, keyLevel: 0.5, conf: 0, source: 'touch', sensed: null };
let L = null, path = null, walls = [];

try { st.best = JSON.parse(localStorage.getItem('sgw-best') || '{}'); } catch (e) { st.best = {}; }
const unlocked = () => { try { return Math.max(1, +(localStorage.getItem('sgw-unlocked') || 1)); } catch (e) { return 1; } };
function unlock(n) { try { if (n > unlocked()) localStorage.setItem('sgw-unlocked', String(n)); } catch (e) { /* private mode */ } }
if (new URLSearchParams(location.search).has('all')) unlock(LEVELS.length);

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  st.W = window.innerWidth; st.H = window.innerHeight; st.u = Math.min(st.W, st.H) / 100;
  canvas.width = Math.round(st.W * dpr); canvas.height = Math.round(st.H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize); resize();

function levelButtons() {
  const n = unlocked();
  $('#lvRow').innerHTML = LEVELS.map((l, i) => `<button data-i="${i}" ${i < n ? '' : 'disabled'} class="${i === st.lv ? 'on' : ''}" title="${i < n ? l.name : 'locked'}">${i < n ? i + 1 : '🔒'}</button>`).join('');
  for (const b of $('#lvRow').querySelectorAll('button:not([disabled])')) b.onclick = () => { st.lv = +b.dataset.i; levelButtons(); };
}
st.lv = Math.min(unlocked(), LEVELS.length) - 1; levelButtons();

// ================================================================== camera
async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: 'user' }, audio: false });
  video.srcObject = stream; await video.play();
  V.W = work.width = video.videoWidth || 640; V.H = work.height = video.videoHeight || 480;
  st.cam = true;
  const step = () => {
    if (video.readyState < 2) return;
    const t = performance.now() / 1000;
    wctx.drawImage(video, 0, 0, V.W, V.H);
    let lm = null;
    if (st.face) { try { const r = st.face.detectForVideo(video, performance.now()); if (r.faceLandmarks?.length) lm = r.faceLandmarks[0]; } catch (e) { /* skip frame */ } }
    vitalsFrame(t, lm);
  };
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) { const cb = () => { step(); video.requestVideoFrameCallback(cb); }; video.requestVideoFrameCallback(cb); }
  else setInterval(step, 33);
  try {
    const vision = await import(MP_BUNDLE);
    const files = await vision.FilesetResolver.forVisionTasks(MP_WASM);
    const make = (delegate) => vision.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: FACE_MODEL, delegate }, runningMode: 'VIDEO', numFaces: 1 });
    try { st.face = await make('GPU'); } catch (e) { st.face = await make('CPU'); }
  } catch (e) { console.warn('Face tracker unavailable; using touch breathing.', e); st.faceFailed = true; }
}

// ================================================================== breath -> Puff
// Puff goes exactly where your breath goes. No pacer pulling it back to safety.
function readBreath(dt, tPerf) {
  br.keyLevel = clamp(br.keyLevel + (br.key ? dt / 0.55 : -dt / 0.7));
  const b = V.bviz, fresh = st.cam && b && V.geom && V.chest.length && tPerf - V.chest.t[V.chest.length - 1] < 0.5;
  let target;
  if (fresh && !br.keysOverride) {
    const amp = Math.sqrt(b.ms);
    const conf = clamp((amp - 0.05) / 0.25) * (V.motionEMA < 0.25 ? 1 : 0.3);
    br.conf += (dt / 0.3) * (conf - br.conf);
    br.sensed = clamp(0.5 + (b.norm || 0) / 2.0);
    br.source = 'camera';
    target = br.conf > 0.12 ? br.sensed : br.level - dt * 0.35;     // lost you? Puff sinks
  } else {
    br.source = st.cam && !st.faceFailed && !br.keysOverride ? 'looking' : 'touch';
    br.conf = br.source === 'touch' ? 1 : 0;
    target = br.source === 'touch' ? br.keyLevel : br.level - dt * 0.35;
  }
  const prev = br.level;
  br.level += (1 - Math.exp(-dt / 0.06)) * (clamp(target) - br.level);
  br.vel += (1 - Math.exp(-dt / 0.1)) * ((br.level - prev) / Math.max(dt, 1e-3) - br.vel);
}

// ================================================================== flow
function setMode(m) { st.mode = m; st.modeT = st.now || 0; }
function loadLevel(i) {
  st.lv = i; L = LEVELS[i];
  path = makePath(L.wild ? wildPath() : L.path);
  walls = buildWalls(L, path);
  st.t = 0; st.lives = LIVES; st.inv = 0; st.hits = 0; st.trail = []; st.flip = !!L.flip; st.flipShown = -9; parts.length = 0;
  $('#lvl').textContent = `level ${i + 1}`; drawLives();
  document.body.className = 'play';
  setMode('title');
  audio.cue({ stage: 'sips', kind: 'title', dur: 3, cue: '' }, audio.clock());
}
function drawLives() { $('#lives').textContent = '♥'.repeat(Math.max(0, st.lives)) + '♡'.repeat(Math.max(0, LIVES - st.lives)); }
function go() { setMode('play'); audio.cue({ stage: 'sips', kind: 'in', dur: 2, cue: '', bar: true, pat: st.lv }, audio.clock()); }

async function begin(withCam) {
  audio.initAudio();
  try { if (navigator.wakeLock) await navigator.wakeLock.request('screen'); } catch (e) { /* fine */ }
  document.fonts?.load('10px "Bagel Fat One"');
  br.keysOverride = !withCam;
  if (withCam && !st.cam) { try { await startCamera(); } catch (e) { console.warn('No camera', e); br.keysOverride = true; } }
  if (withCam && st.cam) { st.setupHeld = 0; st.okSince = null; document.body.className = 'setup'; setMode('setup'); return; }
  loadLevel(st.lv);
}
function quit() { audio.stopMusic(); document.body.className = 'pre'; setMode('intro'); levelButtons(); }
function hit(px, py) {
  st.lives--; st.hits++; st.inv = 1.2; st.shake = 1; drawLives();
  burst(px, py, 26, [C.milk, C.pink, C.lemon, C.tang], 420, st.u * 1.2);
  audio.stamp();
  if (st.lives <= 0) { setMode('popped'); audio.stopMusic(); }
}
function clear() {
  const stars = 3 - Math.min(2, st.hits);
  st.lastStars = stars;
  if ((st.best[st.lv] || 0) < stars) { st.best[st.lv] = stars; try { localStorage.setItem('sgw-best', JSON.stringify(st.best)); } catch (e) { /* private */ } }
  unlock(st.lv + 2);
  setMode(st.lv === LEVELS.length - 1 ? 'won' : 'cleared');
  audio.cue({ stage: 'land', kind: 'end', dur: 1, cue: '' }, audio.clock());
  for (let i = 0; i < 5; i++) burst(st.W * (0.2 + 0.15 * i), st.H * 0.4, 20, [C.lemon, C.milk, C.pink, C.mint], 500, st.u * 1.3, 300);
}
// tap / space: hold = breathe in (no camera), and also "skip the wait" on cards
function tap() {
  if (st.mode === 'title' && st.now - st.modeT > 0.6) go();
  else if (st.mode === 'popped' && st.now - st.modeT > 0.8) loadLevel(st.lv);
  else if (st.mode === 'cleared' && st.now - st.modeT > 3) loadLevel(st.lv + 1);
  else if (st.mode === 'won' && st.now - st.modeT > 2) quit();
}

$('#start').onclick = () => begin(true);
$('#startNo').onclick = () => begin(false);
$('#setupGo').onclick = () => loadLevel(st.lv);
$('#bQuit').onclick = quit;
function setSound(on) {
  audio.setMuted(!on); const b = $('#bSound'); b.textContent = on ? 'Sound on' : 'Sound off'; b.setAttribute('aria-pressed', String(on));
  try { localStorage.setItem('bt-sound', on ? 'on' : 'off'); } catch (e) { /* private */ }
}
$('#bSound').onclick = () => setSound(audio.A.muted);
try { audio.setKit(localStorage.getItem('bt-music') || 'pop'); if (localStorage.getItem('bt-sound') === 'off') setSound(false); } catch (e) { /* private */ }
canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); br.key = true; tap(); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) canvas.addEventListener(ev, () => { br.key = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('button') && e.code === 'Space') return;
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) { br.key = true; tap(); } }
  else if (e.code === 'Escape' && st.mode !== 'intro') quit();
  else if (e.code === 'KeyM') $('#bSound').click();
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space') br.key = false; });
document.addEventListener('visibilitychange', () => audio.suspend(document.hidden));

// ================================================================== drawing
const chip = $('#chip'), chipText = chip.querySelector('span');
let chipState = '';
function setChip(text, live) { if (text !== chipState) { chipState = text; chipText.textContent = text; chip.classList.toggle('live', live); } }

function geometry() {
  const { W, H } = st, top = H * 0.15, bot = H * 0.9;
  const flip = st.flip;
  const yOf = (l) => (flip ? lerp(top, bot, l) : lerp(bot, top, l));
  const px = L?.mirror ? W * 0.72 : W * 0.28;
  const speed = (W < 600 ? W * 0.32 : Math.max(220, W * 0.26)) * (L?.mirror ? -1 : 1);
  return { top, bot, yOf, px, speed, range: bot - top };
}
function gapAt(w, base = w.c) {               // current half-gap and centre for a wall
  let g = L.gap;
  if (L.shrink) g *= 1 - L.shrink * clamp(w.t / path.end);
  let c = base;
  if (L.wobble) c += L.wobble * Math.sin(st.t * 3.1 + w.k * 0.7);
  if (w.fake) { const until = w.t - st.t; c += w.fake * smooth((0.85 - until) / 0.25); }
  if (L.wild && w.k % 5 === 2) c += (hash(w.k) < 0.5 ? -1 : 1) * 0.22 * smooth((0.8 - (w.t - st.t)) / 0.25);
  return { c, g };
}

function scene(G) {
  const { W, H, u } = st, now = st.now, scroll = st.t * Math.abs(G.speed) * (L.mirror ? -1 : 1);
  ctx.fillStyle = L.sky; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.milk; ctx.globalAlpha = L.sky === C.lemon || L.sky === C.mint ? 0.6 : 0.18;
  for (let i = 0; i < 6; i++) {
    const x = ((((hash(i) * 1.4 - scroll * 0.0003 * (1 + i * 0.3) / W * 600) % 1.4) + 1.4) % 1.4) * W - W * 0.2;
    blobPath(ctx, x, H * (0.1 + 0.15 * i), u * (4 + 2 * hash(i + 9)), now * 0.3 + i, 1, 2.3, 0.75); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawWalls(G) {
  const { W, u } = st, ww = L.tunnel ? Math.abs(G.speed) * L.spacing + 1 : u * 7;
  for (const w of walls) {
    const x = G.px + (w.t - st.t) * G.speed;
    if (x < -ww * 2 || x > W + ww * 2) continue;
    const { c, g } = gapAt(w), pr = (u * 3.4) / G.range;   // drawn gap includes Puff's own size
    const yA = G.yOf(c + g + pr), yB = G.yOf(c - g - pr);
    const yTop = Math.min(yA, yB), yBot = Math.max(yA, yB);
    const col = w.hit ? C.milk : L.wall;
    if (!L.tunnel) { ctx.fillStyle = C.ink; ctx.globalAlpha = 0.22; rr(ctx, x - ww / 2 + u * 0.7, -20, ww, yTop + 20 + u * 0.7, u * 2); ctx.fill(); rr(ctx, x - ww / 2 + u * 0.7, yBot + u * 0.7, ww, st.H, u * 2); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.fillStyle = col;
    if (L.tunnel) { ctx.fillRect(x - ww / 2, -20, ww, yTop + 20); ctx.fillRect(x - ww / 2, yBot, ww, st.H); }
    else {
      rr(ctx, x - ww / 2, -20, ww, yTop + 20, u * 2); ctx.fill(); rr(ctx, x - ww / 2, yBot, ww, st.H, u * 2); ctx.fill();
      ctx.fillStyle = C.ink;                                // angry little eyes on every wall
      for (const yy of [yTop - u * 3.2, yBot + u * 3.2]) for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + s * u * 1.4, yy, u * 0.55, 0, TAU); ctx.fill(); }
    }
  }
  if (L.tunnel) {                                       // ink edge so the tunnel reads as one shape
    ctx.strokeStyle = C.ink; ctx.globalAlpha = 0.35; ctx.lineWidth = u * 0.6;
    for (const side of [1, -1]) {
      ctx.beginPath(); let started = false;
      for (const w of walls) {
        const x = G.px + (w.t - st.t) * G.speed; if (x < -ww || x > W + ww) continue;
        const { c, g } = gapAt(w), y = G.yOf(c + side * (g + (u * 3.4) / G.range));
        started ? ctx.lineTo(x, y) : (ctx.moveTo(x, y), started = true);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
function drawDots(G) {
  const { W, u } = st, step = 0.09;
  ctx.fillStyle = L.sky === C.lemon || L.sky === C.mint ? C.ink : C.milk;
  for (let k = Math.ceil(st.t / step); ; k++) {
    const t = k * step, x = G.px + (t - st.t) * G.speed;
    if (x < -10 || x > W + 10 || t > path.end) break;
    if (L.dark && t - st.t > 0.7) break;                 // lights out: only a short look ahead
    ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(x, G.yOf(path.at(t)), u * 0.45, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function darkness(G, py) {
  const { W, H, u } = st, r = u * (L.wild ? 20 : 17);
  ctx.save(); ctx.fillStyle = C.night; ctx.globalAlpha = 0.97;
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(G.px + (L.mirror ? -r * 0.4 : r * 0.4), py, r, 0, TAU, true); ctx.fill('evenodd');
  ctx.restore();
}

function playFrame(dt) {
  const { W, H, u } = st;
  // time runs faster on speedup levels
  const speedK = 1 + (L.speedup || 0) * clamp(st.t / path.end);
  st.t += dt * speedK;
  // the final level flips gravity and the lights on its own
  if (L.wild) {
    const ph = Math.floor((st.t - LEAD) / 6);
    const flip = ph > 0 && ph % 2 === 1, dark = ph > 0 && ph % 3 === 2;
    if (flip !== st.flip) { st.flip = flip; st.flipShown = st.t; audio.pop(); }
    L.dark = dark;
  }
  const G = geometry(), py = G.yOf(br.level);

  // collisions: any wall overlapping Puff
  st.inv = Math.max(0, st.inv - dt);
  const reach = (L.tunnel ? 0.02 : (u * 3.5 + u * 3) / Math.abs(G.speed));
  for (const w of walls) {
    if (Math.abs(w.t - st.t) > reach) { if (!w.passed && w.t < st.t - reach) { w.passed = true; if (!w.hit && !L.tunnel) { audio.collect(); burst(G.px, py, 5, [C.lemon, C.milk], 140, u * 0.6); } } continue; }
    const { c, g } = gapAt(w, path.at(st.t));          // judged against the line where Puff is right now
    if (Math.abs(br.level - c) > g && st.inv <= 0 && st.mode === 'play') { w.hit = true; hit(G.px, py); }
  }
  if (st.mode === 'play' && st.t >= path.end) clear();

  // draw
  const sh = st.shake * u * 2.2 + (L.shake ? u * 0.35 * (1 + Math.sin(st.t * 2)) : 0);
  st.shake = Math.max(0, st.shake - dt * 2.5);
  ctx.save(); if (sh > 0) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
  scene(G); drawDots(G); drawWalls(G);
  // Puff's ribbon
  st.trail.push({ t: st.t, y: py }); while (st.trail.length && st.t - st.trail[0].t > 1.2) st.trail.shift();
  ctx.strokeStyle = C.milk; ctx.lineCap = 'round';
  for (let i = 1; i < st.trail.length; i++) {
    const a = st.trail[i - 1], b = st.trail[i], k = 1 - (st.t - b.t) / 1.2;
    ctx.globalAlpha = 0.55 * k; ctx.lineWidth = u * 2.4 * k;
    ctx.beginPath(); ctx.moveTo(G.px - (st.t - a.t) * G.speed, a.y); ctx.lineTo(G.px - (st.t - b.t) * G.speed, b.y); ctx.stroke();
  }
  ctx.globalAlpha = st.inv > 0 && Math.floor(st.inv * 12) % 2 ? 0.35 : 1;
  const face = st.inv > 0 ? { eyes: 'wide', mouth: 'out' } : br.vel > 0.15 ? { eyes: 'open', mouth: 'in' } : br.vel < -0.15 ? { eyes: 'happy', mouth: 'out' } : { eyes: 'wide', mouth: 'smile' };
  puff(ctx, G.px, py, u * 3.6, { t: st.now, vel: br.vel * (st.flip ? -1 : 1), ...face, rot: clamp(-br.vel * 0.3 * (st.flip ? -1 : 1), -0.5, 0.5) * (L.mirror ? -1 : 1) });
  ctx.globalAlpha = 1;
  drawParts(ctx, dt);
  if (L.dark) darkness(G, py);
  ctx.restore();

  // big words
  const since = st.t;
  if (since < LEAD) label(ctx, since < LEAD - 0.8 ? 'ready' : 'GO', W / 2, H * 0.5, u * 14, C.milk, { shade: C.ink, scale: 1 + 0.2 * Math.exp(-((since * 3) % 1) * 4) });
  if (st.t - st.flipShown < 1.1) label(ctx, st.flip ? 'FLIPPED' : 'UNFLIPPED', W / 2, H * 0.5, u * 13, C.lemon, { shade: C.ink, scale: 1 + 0.4 * Math.exp(-(st.t - st.flipShown) * 6) });
  if (st.flip) label(ctx, 'in = down', W / 2, H * 0.95, u * 4.5, C.milk, { shade: C.ink, alpha: 0.8 });

  const prog = 100 * clamp(st.t / path.end);
  $('#barFill').style.width = prog + '%'; $('#barHead').style.left = prog + '%';
}

function card(title, col, lines, foot, bg = C.ink) {
  const { W, H, u } = st, k = smooth((st.now - st.modeT) / 0.4);
  ctx.fillStyle = bg; ctx.globalAlpha = 0.86 * k; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  label(ctx, title, W / 2, H * 0.36, Math.min(u * 15, W / (title.length * 0.62)), col, { shade: C.ink, scale: 0.7 + 0.3 * k });
  const size = Math.max(16, u * 3), maxW = Math.min(W * 0.86, u * 80);
  let y = H * 0.48;
  ctx.font = `500 ${size}px "Onest", system-ui, sans-serif`;
  for (const l of lines) {                               // stack paragraphs by how many lines each wraps to
    let n = 1, line = '';
    for (const w of l.split(' ')) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { n++; line = w; } else line = t; }
    wrap(ctx, l, W / 2, y, size, C.milk, maxW, k); y += n * size * 1.35 + size * 0.7;
  }
  if (foot) label(ctx, foot, W / 2, H * 0.8, Math.max(18, u * 4), C.lemon, { body: true, weight: '700', alpha: k * (0.6 + 0.4 * Math.sin(st.now * 4) ** 2) });
}

function frame() {
  requestAnimationFrame(frame);
  const tPerf = performance.now() / 1000, now = tPerf;     // game time never waits on the audio clock
  const dt = Math.min(0.05, Math.max(0.001, now - st.last)); st.last = now; st.now = now;
  const { W, H, u } = st;
  readBreath(dt, tPerf);
  audio.frame(br.level, br.vel);

  if (st.mode === 'intro') { drawIntro(dt); return; }
  if (st.mode === 'setup') {
    const p = placement(!!st.face, !!st.faceFailed);
    if (!p.ok) st.okSince = null; else if (st.okSince == null) st.okSince = now;
    st.setupHeld = p.ok ? now - st.okSince : 0;
    drawSetup({ ctx, W, H, u, now }, video, p, st.setupHeld, TOUCH); grain(ctx, W, H);
    if (st.setupHeld > 2 || st.faceFailed) loadLevel(st.lv);
    return;
  }

  if (st.mode === 'title') {
    const G = geometry(); scene(G); drawDots(G); drawWalls(G);
    puff(ctx, G.px, G.yOf(br.level), u * 3.6, { t: now, vel: br.vel, eyes: 'wide', mouth: 'smile' });
    const left = Math.max(0, 5 - (now - st.modeT));
    card(`${st.lv + 1}. ${L.name}`, C.lemon, [L.sub, st.lv > 0 ? 'Breathe normally for a moment first.' : (br.source === 'touch' ? 'Hold the screen (or space) to breathe in, let go to breathe out.' : 'Your breath moves Puff. Nothing else does.')],
      left > 0 ? `starts in ${Math.ceil(left)}  ·  tap to go now` : '', C.ink);
    if (left <= 0) go();
  } else if (st.mode === 'play') playFrame(dt);
  else if (st.mode === 'popped') {
    playFrame(0);
    const left = Math.max(0, 4 - (now - st.modeT));
    card('POPPED', C.pink, [`You made it ${Math.round(100 * clamp(st.t / path.end))}% of the way.`, 'Breathe normally. Puff is fine.'], left > 0 ? `again in ${Math.ceil(left)}  ·  tap to retry` : '', C.night);
    if (left <= 0) loadLevel(st.lv);
  } else if (st.mode === 'cleared' || st.mode === 'won') {
    playFrame(0);
    const stars = '★'.repeat(st.lastStars) + '☆'.repeat(3 - st.lastStars);
    if (st.mode === 'won') card('YOU ARE WILD', C.lemon, [stars, 'You beat every level. Nobody breathes like that. Now breathe normally for a while.'], 'tap for the menu', C.night);
    else {
      const left = Math.max(0, 9 - (now - st.modeT));
      card('CLEARED', C.mint, [stars + (st.hits ? `  ·  ${st.hits} bonk${st.hits > 1 ? 's' : ''}` : '  ·  flawless'), 'Rest. Slow, easy breaths before the next one.'], left > 0 ? (now - st.modeT > 3 ? `next level in ${Math.ceil(left)}  ·  tap to go` : `resting ${Math.ceil(left)}`) : '', C.ink);
      if (left <= 0) loadLevel(st.lv + 1);
    }
  }
  grain(ctx, W, H);

  if (br.source === 'camera' && br.conf > 0.3) setChip('Seeing your breath', true);
  else if (br.source === 'touch') setChip(TOUCH ? 'Hold the screen to breathe in' : 'Hold space to breathe in', true);
  else setChip(!V.geom ? 'Looking for your face' : !V.geom.chest ? 'Move back: show your chest' : V.motionEMA > 0.25 ? 'Hold still' : 'Finding your breath', false);
}

// the start-screen preview: Puff dodging pillars on its own
const hero = $('#hero'), hctx = hero.getContext('2d');
function drawIntro() {
  const { W, H } = st, now = st.now;
  ctx.fillStyle = C.tang; ctx.fillRect(0, 0, W, H);
  const hw = hero.clientWidth, hh = hero.clientHeight; if (hw < 10) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (hero.width !== Math.round(hw * dpr)) { hero.width = Math.round(hw * dpr); hero.height = Math.round(hh * dpr); }
  hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const u = Math.min(hw, hh) / 100, g = hctx, speed = hw * 0.35, px = hw * 0.3;
  const lv = (t) => 0.5 + 0.32 * Math.sin(t * 2.3) * Math.cos(t * 0.9);
  g.fillStyle = C.night; g.fillRect(0, 0, hw, hh);
  const yOf = (l) => lerp(hh * 0.88, hh * 0.12, l);
  for (let k = Math.floor(now / 0.5) - 2; k < now / 0.5 + 6; k++) {
    const t = k * 0.5, x = px + (t - now) * speed, c = lv(t), gp = 0.17;
    g.fillStyle = [C.tang, C.pink, C.lemon, C.mint][((k % 4) + 4) % 4];
    rr(g, x - u * 6, -10, u * 12, yOf(c + gp) + 10, u * 3); g.fill();
    rr(g, x - u * 6, yOf(c - gp), u * 12, hh, u * 3); g.fill();
  }
  g.fillStyle = C.milk; g.globalAlpha = 0.5;
  for (let t = now; t < now + 3; t += 0.08) { g.beginPath(); g.arc(px + (t - now) * speed, yOf(lv(t)), u * 0.7, 0, TAU); g.fill(); }
  g.globalAlpha = 1;
  puff(g, px, yOf(lv(now)), u * 7, { t: now, vel: 2.3 * 0.32 * Math.cos(now * 2.3), eyes: 'wide', mouth: Math.cos(now * 2.3) > 0 ? 'in' : 'out' });
  grain(g, hw, hh);
}

requestAnimationFrame(frame);
window.sgw = { st, br, LEVELS, V, loadLevel, get path() { return path; } };
