// Sips: wiring. Camera -> vitals.js -> breath.js; journey.js drives stages.js and audio.js.
import { V, vitalsFrame } from './vitals.js';
import { Br, updateBreath, press } from './breath.js';
import { buildJourney, Journey } from './journey.js';
import * as audio from './audio.js';
import { drawStage, drawIdle, drawGauge, onSeg, stats, resetStats } from './stages.js';
import { drawParts, grain, parts } from './gfx.js';

const MP_VERSION = '0.10.14';
const MP_BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const $ = (s) => document.querySelector(s);
const TOUCH = window.matchMedia?.('(pointer: coarse)').matches;
document.documentElement.classList.toggle('touch', !!TOUCH);
if (!CanvasRenderingContext2D.prototype.roundRect) {          // older phones
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    const R = (Array.isArray(r) ? r : [r, r, r, r]).map((v) => Math.min(v || 0, w / 2, h / 2));
    const [a, b, c, d] = R.length === 4 ? R : [R[0], R[0], R[0], R[0]];
    this.moveTo(x + a, y); this.arcTo(x + w, y, x + w, y + h, b); this.arcTo(x + w, y + h, x, y + h, c); this.arcTo(x, y + h, x, y, d); this.arcTo(x, y, x + w, y, a); this.closePath();
  };
}
// keep the screen awake: nobody touches a phone for twelve minutes of breathing
let wake = null;
async function keepAwake() { try { if (navigator.wakeLock && !document.hidden) { wake = await navigator.wakeLock.request('screen'); } } catch (e) { /* not allowed right now */ } }
const canvas = $('#c'), ctx = canvas.getContext('2d'), video = $('#video');
const work = document.createElement('canvas'), wctx = work.getContext('2d', { willReadFrequently: true });
V.wctx = wctx;

const J = new Journey(buildJourney());
Br.allowKeys = new URLSearchParams(location.search).has('keys');
const st = { W: 0, H: 0, u: 1, playing: false, cam: false, face: null, last: 0, cued: null, prev: null, endT: 0, resultsShown: false };
// overall progress: time through the whole script (open holds count as their suggested length)
const durOf = (s) => (s.kind === 'end' ? 0 : s.open ? s.target : s.dur);
const cum = []; let total = 0;
for (const s of J.segs) { cum.push(total); total += durOf(s); }
$('#barMarks').innerHTML = J.segs.filter((s) => s.kind === 'title' && s.i > 0).map((s) => `<i style="left:${(100 * cum[s.i] / total).toFixed(2)}%"></i>`).join('');

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  st.W = window.innerWidth; st.H = window.innerHeight; st.u = Math.min(st.W, st.H) / 100;
  canvas.width = Math.round(st.W * dpr); canvas.height = Math.round(st.H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize); resize();

// ------------------------------------------------------------------ camera
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
    if (st.face) { try { const r = st.face.detectForVideo(video, performance.now()); if (r.faceLandmarks?.length) lm = r.faceLandmarks[0]; } catch (e) { /* skip this frame */ } }
    vitalsFrame(t, lm);
  };
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) { const cb = () => { step(); video.requestVideoFrameCallback(cb); }; video.requestVideoFrameCallback(cb); }
  else setInterval(step, 33);
  loadFace();
}
async function loadFace() {
  try {
    const vision = await import(MP_BUNDLE);
    const files = await vision.FilesetResolver.forVisionTasks(MP_WASM);
    const make = (delegate) => vision.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: FACE_MODEL, delegate }, runningMode: 'VIDEO', numFaces: 1 });
    try { st.face = await make('GPU'); } catch (e) { st.face = await make('CPU'); }
  } catch (e) { console.warn('Face tracker unavailable; the game runs on the pacer.', e); st.faceFailed = true; }
}

// ------------------------------------------------------------------ flow
J.onSeg = (seg, at) => {
  if (st.cued !== seg) { audio.cue(seg, at); st.cued = seg; }
  onSeg(seg, st.prev, at, J); st.prev = seg;
  $('#air').classList.toggle('show', !!seg.open);
  if (seg.kind === 'end') st.endT = at;
};
async function begin(withCam) {
  audio.initAudio(); keepAwake();
  document.fonts?.load('10px "Bagel Fat One"');
  if (withCam) { try { await startCamera(); } catch (e) { console.warn('No camera', e); st.camDenied = true; } }
  resetStats(); parts.length = 0; Br.syncSum = Br.syncN = 0; st.prev = null; st.cued = null; st.resultsShown = false;
  document.body.className = 'play'; $('#results').hidden = true;
  st.playing = true;
  J.start(audio.clock() + 0.05);
  const want = new URLSearchParams(location.search).get('stage');
  if (want) J.jumpTo(want, audio.clock());
}
function release() { if (st.playing) J.release(audio.clock()); }
function fmt(s) { s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function showResults() {
  st.resultsShown = true; document.body.className = 'done';
  const holds = J.holds.map((h) => h.dur), best = holds.length ? Math.max(...holds) : 0;
  $('#rHold').textContent = fmt(best);
  const rows = [];
  if (holds.length > 1) rows.push(['Each hold', holds.map(fmt).join(', ')]);
  rows.push(['Big breaths', stats.breaths]);
  rows.push(['Sips caught', `${stats.sips} of ${stats.sipsOf}`]);
  rows.push(['Tiles in your town', stats.tiles]);
  rows.push(['Things met in space', stats.found]);
  if (Br.syncN > 20) rows.push(['In step with the pacer', Math.round((100 * Br.syncSum) / Br.syncN) + '%']);
  $('#rRows').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  st.shareText = `I held my breath for ${fmt(best)} in Sips, a game you play by breathing. ${stats.breaths} big breaths, ${stats.found} things met in space.`;
  $('#share').textContent = 'Share with a friend';
  $('#results').hidden = false;
}

// ------------------------------------------------------------------ input
$('#start').onclick = () => begin(true);
$('#startNo').onclick = () => begin(false);
$('#again').onclick = () => begin(false);
// share sheet where the device has one (phones, Safari); otherwise copy the message and link
$('#share').onclick = async () => {
  const url = location.origin + location.pathname, text = `${st.shareText} Try to beat me:`, b = $('#share');
  if (navigator.share) { try { await navigator.share({ title: 'Sips', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(`${text} ${url}`); b.textContent = 'Copied. Paste it to a friend'; }
  catch (e) { window.prompt('Copy this and send it to a friend', `${text} ${url}`); }
  setTimeout(() => { b.textContent = 'Share with a friend'; }, 4000);
};
$('#air').onclick = release;
canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); press(true); release(); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) canvas.addEventListener(ev, () => press(false));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
$('#bSkip').onclick = () => st.playing && J.skip(audio.clock());
// sound on/off: on the start screen and in the top bar, remembered on this device
function setSound(on) {
  audio.setMuted(!on);
  for (const b of [$('#bSound'), $('#introSound')]) { b.textContent = on ? 'Sound on' : 'Sound off'; b.setAttribute('aria-pressed', String(on)); }
  try { localStorage.setItem('bt-sound', on ? 'on' : 'off'); } catch (e) { /* private mode */ }
}
$('#bSound').onclick = $('#introSound').onclick = () => setSound(audio.A.muted);
try { if (localStorage.getItem('bt-sound') === 'off') setSound(false); } catch (e) { /* private mode */ }
window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('button') && e.code === 'Space') return;
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) { press(true); release(); } }
  else if (e.code === 'ArrowRight' && st.playing) J.skip(audio.clock());
  else if (e.code === 'KeyM') $('#bSound').click();
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space') press(false); });
document.addEventListener('visibilitychange', () => { audio.suspend(document.hidden); if (!document.hidden && st.playing) keepAwake(); });

// ------------------------------------------------------------------ frame
const chip = $('#chip'), chipText = chip.querySelector('span');
let chipState = '';
function setChip(text, live) { if (text !== chipState) { chipState = text; chipText.textContent = text; chip.classList.toggle('live', live); } }

function frame() {
  requestAnimationFrame(frame);
  const tPerf = performance.now() / 1000, now = st.playing ? audio.clock() : tPerf;
  const dt = Math.min(0.1, Math.max(0.001, now - st.last)); st.last = now;
  const { W, H, u } = st;
  const F = { ctx, W, H, u, now, dt, J, br: Br };

  if (!st.playing) {
    const pacer = 0.5 - 0.42 * Math.cos((tPerf * 2 * Math.PI) / 8);
    updateBreath(dt, tPerf, pacer, 0, false);
    F.level = Br.level; F.vel = Br.vel; drawIdle(F); grain(ctx, W, H);
    return;
  }
  J.update(now);
  const pk = J.peek(now + 0.14);
  if (pk && st.cued !== pk.seg) { audio.cue(pk.seg, pk.start); st.cued = pk.seg; }
  const seg = J.seg;
  updateBreath(dt, tPerf, J.level(now), J.dir(), st.cam);
  // after the target, a clear big inhale seen by the camera ends the hold by itself
  if (seg.open && J.p(now) >= 1 && Br.source === 'camera' && Br.conf > 0.5 && Br.bigInhale > 0.5) J.release(now);
  audio.frame(Br.level, Br.vel);

  F.seg = J.seg; F.el = J.el(now); F.p = J.p(now); F.level = Br.level; F.vel = Br.vel;
  ctx.globalAlpha = 1; drawStage(F); if (!F.partsDone) drawParts(ctx, dt); drawGauge(F); grain(ctx, W, H);

  if (Br.source === 'camera' && Br.conf > 0.35) setChip('Seeing your breath', true);
  else if (Br.source === 'keys') setChip(TOUCH ? 'Touch breathing' : 'Space bar is your breath', true);
  else if (st.cam && !st.faceFailed) setChip(V.geom ? 'Finding your breath' : 'Looking for you', false);
  else setChip('Follow the pacer', false);
  chip.style.setProperty('--s', (0.7 + 0.8 * (Br.sensed ?? Br.level)).toFixed(2));

  const prog = 100 * (cum[seg.i] + Math.min(durOf(seg), J.el(now))) / total;
  if (Math.abs(prog - (st.prog ?? -1)) > 0.05) { st.prog = prog; $('#barFill').style.width = prog + '%'; $('#barHead').style.left = prog + '%'; $('#bar').setAttribute('aria-valuenow', Math.round(prog)); }

  if (seg.kind === 'end' && !st.resultsShown && now - st.endT > 4.5) showResults();
}
requestAnimationFrame(frame);
// unreleased features live outside site/ and load only on this machine (see ../plus)
if (['localhost', '127.0.0.1'].includes(location.hostname)) import('../plus/teaser.js').then((m) => m.default($('#plusSlot'))).catch(() => {});
window.bt = { J, Br, V, st, stats, audio };
