// The four games. Each draws one frame from F:
// { ctx, W, H, u, now, dt, J, seg, el, p, br, level, vel }  (u = 1% of the short side)
import { C, TAU, clamp, lerp, smooth, ramp, puff, faceFor, burst, spawn, label, wrap, rr, drawTile, blobPath, drawParts } from './gfx.js';
import * as audio from './audio.js';
import { BOX_ROUNDS, WIM_BREATHS } from './journey.js';

export const stats = { sips: 0, sipsOf: 0, tiles: 0, found: 0, breaths: 0 };
export function resetStats() { Object.assign(stats, { sips: 0, sipsOf: 0, tiles: 0, found: 0, breaths: 0 }); }

let lastBg = C.peri;                                   // colour the next title card wipes over
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function cueText(F, y, col, shade, o = {}) {
  const { ctx, W, u, seg, el } = F;
  if (seg.cue && (o.cueAlpha ?? 1) > 0.01) label(ctx, seg.cue, W / 2, y, u * (o.size || 10), col, { shade, scale: 1 + 0.3 * Math.exp(-el * 7), alpha: o.cueAlpha ?? 1 });
  const sub = o.sub ?? seg.sub;
  if (sub) wrap(ctx, sub, W / 2, y + u * (o.size || 10) * 0.78 + Math.max(0, 15 - u * 2.5) * 1.6, Math.max(15, u * 2.5), col, Math.min(W * 0.84, u * 70), (o.subAlpha ?? 1) * smooth(el / 0.6));
}
function titleCard(F, bg, fg, shade) {
  const { ctx, W, H, u, el, now, level, vel } = F;
  ctx.fillStyle = lastBg; ctx.fillRect(0, 0, W, H);
  const k = smooth(el / 0.8);
  ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(W / 2, H * 0.4, k * Math.hypot(W, H), 0, TAU); ctx.fill();
  if (k >= 1) lastBg = bg;
  puff(ctx, W / 2, H * 0.36, u * (7 + 3.5 * level) * smooth(el / 0.5), { t: now, vel, eyes: 'open', mouth: 'smile', shade });
  cueText(F, H * 0.64, fg, shade, { size: 13, sub: F.cam && F.seg.camSub ? `${F.seg.sub} ${F.seg.camSub}` : F.seg.sub });
}

// =================================================================== 1. SIPS (glider)
const WAYS = [
  { sky: C.peri, far: C.deep, near: C.mint, sun: C.lemon, fg: C.milk, shade: C.ink },
  { sky: C.pink, far: C.tang, near: C.peri, sun: C.milk, fg: C.ink, shade: C.milk },
  { sky: C.mint, far: C.leaf, near: C.peri, sun: C.tang, fg: C.ink, shade: C.milk },
  { sky: C.lemon, far: C.tang, near: C.pink, sun: C.peri, fg: C.ink, shade: C.milk },
  { sky: C.night, far: C.peri, near: C.pink, sun: C.milk, fg: C.milk, shade: C.peri },
];
const sips = { way: 0, prev: 0, wayT: -9, lastK: 0, passed: new Set(), trail: [] };
function sipsScene(F, w, scroll, bare) {
  const { ctx, W, H, u, level, now } = F;
  ctx.fillStyle = w.sky; ctx.fillRect(0, 0, W, H);
  if (!bare) ctx.fillStyle = w.sun; if (!bare) { ctx.beginPath(); ctx.arc(W * 0.78, H * 0.24, u * (12 + 2.5 * level), 0, TAU); ctx.fill(); }
  ctx.fillStyle = C.milk; ctx.globalAlpha = 0.85;
  for (let i = 0; i < (bare ? 0 : 4); i++) {
    const x = ((hash(i) * 1.4 - scroll * 0.00012 * (1 + i * 0.3)) % 1.4 + 1.4) % 1.4 * W - W * 0.2, y = H * (0.12 + 0.13 * i);
    blobPath(ctx, x, y, u * (4 + 2 * hash(i + 9)), now * 0.3 + i, 1, 2.3, 0.75); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const [col, base, amp, f, par] of [[w.far, 0.74, 6, 0.0035, 0.35], [w.near, 0.86, 4, 0.006, 0.8]]) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 12; x += 12) { const xx = x + scroll * par; ctx.lineTo(x, H * base + (Math.sin(xx * f) * amp + Math.sin(xx * f * 2.7 + 1) * amp * 0.35) * u); }
    ctx.lineTo(W, H); ctx.fill();
  }
}
function drawSips(F) {
  const { ctx, W, H, u, now, seg, el, J, br, level, vel } = F;
  const px = W * 0.28, speed = W < 600 ? W * 0.24 : Math.max(170, W * 0.2),   // phones: slower scroll, so you still see ~3 s ahead
    yOf = (l) => lerp(H * 0.68, H * 0.2, l), scroll = now * speed;
  const w = WAYS[sips.way], wipe = smooth((now - sips.wayT) / 0.9);
  if (wipe < 1) {
    sipsScene(F, WAYS[sips.prev], scroll);
    ctx.save(); ctx.beginPath(); ctx.arc(W * 0.78, H * 0.24, wipe * Math.hypot(W, H), 0, TAU); ctx.clip(); sipsScene(F, w, scroll); ctx.restore();
  } else sipsScene(F, w, scroll);
  lastBg = w.sky;

  // the dotted line ahead, with a bigger sip to catch every fourth dot
  const STEP = 0.375, horizon = (W - px) / speed + 0.3, k0 = Math.ceil(now / STEP);
  for (let k = sips.lastK + 1; k < k0; k++) {
    if (k % 4 === 0 && seg.kind !== 'title' && sips.lastK > 0) {
      stats.sipsOf++;
      if (Math.abs(br.level - br.pacer) < 0.2) { stats.sips++; audio.collect(); burst(px, yOf(level), 7, [C.lemon, C.milk], 160, u * 0.8); }
    }
  }
  sips.lastK = k0 - 1;
  for (let k = k0; k * STEP - now < horizon; k++) {
    const dt = k * STEP - now, l = J.ahead(now, dt); if (l == null) break;
    const x = px + dt * speed, y = yOf(l), big = k % 4 === 0;
    ctx.fillStyle = big ? C.lemon : w.fg; ctx.globalAlpha = big ? 1 : 0.7;
    if (big) { ctx.fillStyle = C.ink; ctx.globalAlpha = 0.2; ctx.beginPath(); ctx.arc(x + u * 0.3, y + u * 0.3, u * 1.5, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = w.sky === C.lemon ? C.milk : C.lemon; }
    ctx.beginPath(); ctx.arc(x, y, big ? u * (1.5 + 0.2 * Math.sin(now * 5 + k)) : u * 0.55, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // gates at the top of every breath
  const gateCols = [C.tang, C.pink, C.lemon, C.milk, C.mint].filter((c) => c !== w.sky && c !== w.sun);
  for (const { seg: s, dt } of J.upcoming(now, horizon)) {
    if (!(s.kind === 'out' && s.from >= 0.99) || dt < -2.5) continue;
    const x = px + dt * speed, y = yOf(1), col = gateCols[s.i % gateCols.length], shape = s.i % 3;
    if (dt <= 0 && !sips.passed.has(s.i)) { sips.passed.add(s.i); if (dt > -0.3) { audio.pop(); burst(x, y, 16, [col, C.milk, C.lemon], 300, u); } }
    const open = sips.passed.has(s.i) ? 1 + 0.5 * smooth(-dt / 0.4) : 1;
    ctx.save(); ctx.translate(x, y); ctx.scale(open, open); ctx.lineWidth = u * 1.5; ctx.lineJoin = 'round';
    for (const [ox, c] of [[u * 0.5, C.ink], [0, col]]) {
      ctx.strokeStyle = c; ctx.globalAlpha = c === C.ink ? 0.2 : 1; ctx.beginPath();
      if (shape === 0) ctx.ellipse(ox, ox, u * 3.6, u * 9, 0, 0, TAU);
      else if (shape === 1) { ctx.moveTo(ox, ox - u * 10); ctx.lineTo(ox + u * 4.5, ox); ctx.lineTo(ox, ox + u * 10); ctx.lineTo(ox - u * 4.5, ox); ctx.closePath(); }
      else ctx.roundRect(ox - u * 4, ox - u * 9, u * 8, u * 18, u * 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Puff and the ribbon it leaves
  const py = yOf(level);
  sips.trail.push({ t: now, y: py }); while (sips.trail.length && now - sips.trail[0].t > 1.6) sips.trail.shift();
  ctx.strokeStyle = C.milk; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 1; i < sips.trail.length; i++) {
    const a = sips.trail[i - 1], b = sips.trail[i], k = 1 - (now - b.t) / 1.6;
    ctx.globalAlpha = 0.6 * k; ctx.lineWidth = u * 2.6 * k;
    ctx.beginPath(); ctx.moveTo(px - (now - a.t) * speed, a.y); ctx.lineTo(px - (now - b.t) * speed, b.y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  puff(ctx, px, py, u * (4 + 2.4 * level), { t: now, vel, ...faceFor(seg.kind, true), rot: clamp(-vel * 0.25, -0.4, 0.4) });
  cueText(F, H * 0.87, w.fg, w.shade, { size: 11 });
}

// =================================================================== 2. BOX (draw tiles, grow a town)
const box = { stampT: -9 };
const BOX_SHAPE = ['sq', 'sq', 'sq', 'dia', 'dia', 'circ', 'circ', 'sq'];
function boxPos(shape, U, cx, cy, s) {
  if (shape === 'circ') { const a = 0.75 * Math.PI + U * TAU; return [cx + Math.cos(a) * s * 1.15, cy + Math.sin(a) * s * 1.15]; }
  const P = [[-1, 1], [-1, -1], [1, -1], [1, 1], [-1, 1]], side = Math.min(3, Math.floor(U * 4)), f = U * 4 - side;
  let x = lerp(P[side][0], P[side + 1][0], f) * s, y = lerp(P[side][1], P[side + 1][1], f) * s;
  if (shape === 'dia') { const c = Math.SQRT1_2 * 0.86; [x, y] = [(x - y) * c, (x + y) * c]; }
  return [cx + x, cy + y];
}
function boxPath(ctx, shape, cx, cy, s, upTo = 1) {
  ctx.beginPath();
  const n = Math.max(2, Math.ceil(96 * upTo));
  for (let i = 0; i <= n; i++) { const [x, y] = boxPos(shape, (i / n) * upTo * 0.99999, cx, cy, s); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
}
function drawSkyline(F, base, n, growNewest) {
  const { ctx, W, H, u, now } = F, w = Math.min(u * 6.5, W / 11), gap = w * 1.3, x0 = W / 2 - gap * (BOX_ROUNDS - 1) / 2;
  ctx.fillStyle = C.leaf; ctx.fillRect(0, base, W, H - base);
  for (let i = 0; i < BOX_ROUNDS; i++) {
    const x = x0 + i * gap;
    if (i < n) drawTile(ctx, i, x, base, w, now, i === n - 1 ? growNewest : 1);
    else { ctx.fillStyle = C.ink; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(x, base - u, u * 0.6, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
  }
  return { x0, gap, w };
}
function drawBox(F) {
  const { ctx, W, H, u, now, seg, p, level, vel } = F;
  ctx.fillStyle = C.mint; ctx.fillRect(0, 0, W, H); lastBg = C.mint;
  const cx = W / 2, cy = H * 0.41, s = Math.min(W * 0.3, H * 0.25), shape = BOX_SHAPE[seg.round % 8];
  const U = (seg.side + clamp(p)) / 4, full = seg.side === 1;

  // the tile: liquid rises with the breath, holds charge it with dots
  ctx.fillStyle = C.ink; ctx.globalAlpha = 0.16; boxPath(ctx, shape, cx + u, cy + u, s); ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = C.milk; boxPath(ctx, shape, cx, cy, s); ctx.fill();
  ctx.save(); boxPath(ctx, shape, cx, cy, s); ctx.clip();
  const top = cy + s * 1.2 - level * s * 2.4;
  ctx.fillStyle = [C.tang, C.pink, C.peri, C.lemon][seg.round % 4]; ctx.beginPath(); ctx.moveTo(cx - s * 1.3, cy + s * 1.3);
  for (let x = -1.3; x <= 1.31; x += 0.1) ctx.lineTo(cx + x * s, top + Math.sin(x * 5 + now * 2.5) * u * 0.7 * (seg.kind === 'hold' ? 0.3 : 1));
  ctx.lineTo(cx + s * 1.3, cy + s * 1.3); ctx.fill();
  if (seg.kind === 'hold') {
    const beat = 1 - ((F.el % 1)), g = u * 4.2;
    ctx.fillStyle = full ? C.lemon : C.mint; ctx.globalAlpha = 0.55 * smooth(F.el / 0.5) * smooth((4 - F.el) / 0.4);
    for (let y = cy - s * 1.2; y < cy + s * 1.2; y += g) for (let x = cx - s * 1.2 + ((y / g | 0) % 2) * g / 2; x < cx + s * 1.2; x += g) { ctx.beginPath(); ctx.arc(x, y, u * (0.5 + 0.9 * clamp(p) + 0.3 * beat), 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = C.ink; ctx.globalAlpha = 0.18; ctx.lineWidth = u * 1.4; boxPath(ctx, shape, cx, cy, s); ctx.closePath(); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.lineWidth = u * 1.8; boxPath(ctx, shape, cx, cy, s, U); ctx.stroke();
  for (let j = 1; j <= 3; j++) {                       // three pips a side: count the seconds without numbers
    const uu = (seg.side + j / 4) / 4, [x, y] = boxPos(shape, uu, cx, cy, s);
    ctx.fillStyle = uu <= U ? C.lemon : C.milk; ctx.strokeStyle = C.ink; ctx.lineWidth = u * 0.5;
    ctx.beginPath(); ctx.arc(x, y, u * 1.1, 0, TAU); ctx.fill(); ctx.stroke();
  }
  label(ctx, seg.cue, cx, cy, u * 10, C.ink, { shade: C.milk, scale: 1 + 0.3 * Math.exp(-F.el * 7) });
  const [px, py] = boxPos(shape, U, cx, cy, s);
  puff(ctx, px, py, u * (3.2 + 2.6 * level), { t: now, vel, ...faceFor(seg.kind, full) });

  const grow = smooth((now - box.stampT) / 0.6);
  drawSkyline(F, H * 0.92, stats.tiles, 0.2 + 0.8 * grow + 0.25 * Math.sin(grow * Math.PI));
}

// =================================================================== 3. WIM HOF (rocket, drift, supernova)
const wim = { lines: [], stars: [], lastFound: -1, rings: [], rayA: 0, puffs: [] };
for (let i = 0; i < 26; i++) wim.lines.push({ x: Math.random(), y: Math.random(), len: 0.04 + Math.random() * 0.1, w: 0.3 + Math.random() * 0.7 });
for (let i = 0; i < 170; i++) wim.stars.push({ x: Math.random(), y: Math.random(), r: 0.15 + Math.random() * 0.4, ph: Math.random() * TAU, d: 0.3 + Math.random() });

function drawStars(F, count, bright, drift) {
  const { ctx, W, H, u, now } = F; ctx.fillStyle = C.milk;
  for (let i = 0; i < Math.min(wim.stars.length, count); i++) {
    const s = wim.stars[i], x = (((s.x - drift * s.d) % 1) + 1) % 1;
    ctx.globalAlpha = bright * (0.45 + 0.55 * Math.sin(now * 1.3 + s.ph) ** 2);
    ctx.beginPath(); ctx.arc(x * W, s.y * H, s.r * u, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawRocket(F, cx, cy, scale, flame, empty) {
  const { ctx, u, now, level, vel, seg } = F, bw = u * 13 * (1 + 0.14 * level) * scale, bh = u * 27 * scale;
  if (flame > 0.02) {
    const len = u * (5 + 24 * flame) * scale * (0.9 + 0.1 * Math.sin(now * 43));
    for (const [c, k] of [[C.tang, 1], [C.lemon, 0.55]]) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(cx - bw * 0.36 * k, cy + bh * 0.48); ctx.quadraticCurveTo(cx, cy + bh * 0.5 + len * k * 2, cx + bw * 0.36 * k, cy + bh * 0.48); ctx.fill(); }
  }
  ctx.fillStyle = C.pink;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * bw * 0.4, cy + bh * 0.15); ctx.lineTo(cx + s * bw * 0.95, cy + bh * 0.55); ctx.lineTo(cx + s * bw * 0.3, cy + bh * 0.48); ctx.fill(); }
  ctx.fillStyle = C.ink; ctx.globalAlpha = 0.2; rr(ctx, cx - bw / 2 + u * 0.8, cy - bh / 2 + u * 0.8, bw, bh, [bw / 2, bw / 2, bw * 0.15, bw * 0.15]); ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = C.milk; rr(ctx, cx - bw / 2, cy - bh / 2, bw, bh, [bw / 2, bw / 2, bw * 0.15, bw * 0.15]); ctx.fill();
  ctx.save(); rr(ctx, cx - bw / 2, cy - bh / 2, bw, bh, [bw / 2, bw / 2, bw * 0.15, bw * 0.15]); ctx.clip();
  ctx.fillStyle = C.tang; ctx.fillRect(cx - bw, cy - bh / 2, bw * 2, bh * 0.2);
  ctx.fillStyle = C.lemon; ctx.fillRect(cx - bw, cy + bh * 0.3, bw * 2, bh * 0.07);
  ctx.restore();
  ctx.fillStyle = C.peri; ctx.beginPath(); ctx.arc(cx, cy - bh * 0.05, bw * 0.34, 0, TAU); ctx.fill();
  if (!empty) puff(ctx, cx, cy - bh * 0.04, bw * 0.25 * (0.9 + 0.15 * level), { t: now, vel, ...faceFor(seg.kind, true), shade: C.deep });
}
function sunburst(F, cx, cy, alpha, cols) {
  const { ctx, W, H } = F, R = Math.hypot(W, H), n = 24;
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = cols[0]; ctx.fillRect(0, 0, W, H); ctx.fillStyle = cols[1];
  for (let i = 0; i < n; i += 2) { const a = wim.rayA + (i / n) * TAU; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a, a + TAU / n); ctx.fill(); }
  ctx.restore();
}
function spaceThing(F, type, x, y, r) {
  const { ctx, u, now } = F; ctx.save(); ctx.translate(x, y); ctx.lineCap = 'round';
  if (type === 0) {                                    // ringed planet
    ctx.fillStyle = C.lemon; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.fillStyle = C.tang; ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.2, r * 0.25, 0, TAU); ctx.fill();
    ctx.strokeStyle = C.pink; ctx.lineWidth = r * 0.16; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.7, r * 0.45, -0.3, 0, TAU); ctx.stroke();
  } else if (type === 1) {                             // sleepy moon
    puff(ctx, 0, 0, r, { t: now * 0.3, eyes: 'closed', mouth: 'smile', col: C.milk, shade: C.peri });
  } else if (type === 2) {                             // whale
    ctx.fillStyle = C.peri; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.5, r * 0.8, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(r * 1.3, 0); ctx.lineTo(r * 2.2, -r * 0.7 + Math.sin(now * 2) * r * 0.2); ctx.lineTo(r * 2.2, r * 0.6 + Math.sin(now * 2) * r * 0.2); ctx.fill();
    ctx.fillStyle = C.milk; ctx.beginPath(); ctx.ellipse(-r * 0.2, r * 0.35, r * 1.1, r * 0.35, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(-r * 0.9, -r * 0.1, r * 0.09, 0, TAU); ctx.fill();
    ctx.fillStyle = C.milk; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-r * 0.4 + (i - 1) * r * 0.3, -r * (1.2 + 0.2 * Math.sin(now * 3 + i)), r * 0.11, 0, TAU); ctx.fill(); }
  } else if (type === 3) {                             // donut
    ctx.strokeStyle = C.tang; ctx.lineWidth = r * 0.75; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = C.pink; ctx.lineWidth = r * 0.5; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    ctx.lineWidth = r * 0.08;
    for (let i = 0; i < 12; i++) { const a = i * 0.52 + now * 0.1; ctx.strokeStyle = [C.lemon, C.milk, C.mint][i % 3]; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); ctx.lineTo(Math.cos(a) * r + Math.cos(i) * r * 0.12, Math.sin(a) * r + Math.sin(i) * r * 0.12); ctx.stroke(); }
  } else puff(ctx, 0, 0, r * 0.8, { t: now, eyes: 'happy', mouth: 'smile', col: C.mint, shade: C.leaf, rot: Math.sin(now) * 0.3 });   // a friend
  ctx.restore(); void u;
}
function drawWim(F) {
  const { ctx, W, H, u, now, dt, seg, el, p, br, level, vel } = F, cx = W / 2;
  if (seg.kind === 'title') return titleCard(F, C.pink, C.ink, C.milk);

  if (seg.pump) {
    const prog = (seg.n + (seg.kind === 'in' ? p * 0.5 : 0.5 + p * 0.5)) / WIM_BREATHS;
    ctx.fillStyle = ramp([C.pink, C.peri, C.deep, C.night], prog); ctx.fillRect(0, 0, W, H); lastBg = C.night;
    if (prog > 0.45) drawStars(F, 120, (prog - 0.45) * 1.8, 0);
    ctx.strokeStyle = C.milk; ctx.lineCap = 'round';
    for (const l of wim.lines) {
      l.y += dt * (0.25 + prog * 2.4) * (0.6 + l.w); if (l.y > 1.2) { l.y = -0.2; l.x = Math.random(); }
      ctx.globalAlpha = 0.16 + 0.3 * prog; ctx.lineWidth = u * 0.5 * l.w; ctx.beginPath(); ctx.moveTo(l.x * W, l.y * H); ctx.lineTo(l.x * W, (l.y + l.len * (0.5 + prog * 2)) * H); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const sh = u * 0.6 * prog * prog, ox = Math.sin(now * 47) * sh, oy = Math.cos(now * 39) * sh, cy = H * 0.45 + clamp(vel, -1.2, 1.2) * u * 1.6;
    const R = Math.min(W * 0.44, u * 25) * (0.93 + 0.1 * level);
    // the lung: a halo that fills on the way in and empties on the way out
    for (const [c, k, a] of [[C.milk, 1.0, 0.1], [C.pink, 0.8, 0.2], [C.lemon, 0.58, 0.26]]) {
      ctx.fillStyle = c; ctx.globalAlpha = a; blobPath(ctx, cx, H * 0.45, R * (0.3 + 0.62 * (br.conf > 0.25 && br.sensed != null ? br.sensed : level)) * k, now * 1.5, 1.4); ctx.fill();
    }
    ctx.globalAlpha = 0.8; ctx.strokeStyle = C.milk; ctx.lineWidth = Math.max(2, u * 0.5); ctx.setLineDash([u * 1.6, u * 1.6]);
    ctx.beginPath(); ctx.arc(cx, H * 0.45, R * (0.3 + 0.62 * br.pacer), 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // out: a ring of air leaves with every exhale
    if (seg.kind === 'out' && el < dt * 1.5) wim.puffs.push(now);
    wim.puffs = wim.puffs.filter((t0) => now - t0 < 1.1);
    for (const t0 of wim.puffs) { const a = (now - t0) / 1.1; ctx.strokeStyle = C.milk; ctx.globalAlpha = 0.7 * (1 - a); ctx.lineWidth = u * 1.6 * (1 - a) + 1; ctx.beginPath(); ctx.arc(cx, H * 0.45, R * (0.5 + 1.3 * smooth(a)), 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // in: air streams toward you
    if (seg.kind === 'in' && vel > 0.1) for (let i = 0; i < 2; i++) {
      const a = Math.random() * TAU, d = R * (1.5 + Math.random() * 0.5), sp = d * 2.6;
      spawn({ x: cx + Math.cos(a) * d, y: H * 0.45 + Math.sin(a) * d, vx: -Math.cos(a) * sp, vy: -Math.sin(a) * sp, r: u * (0.5 + Math.random() * 0.6), max: 0.5, col: i ? C.milk : C.pink });
    }
    for (let i = 0; i < WIM_BREATHS; i++) {
      const a = -Math.PI / 2 + (i / WIM_BREATHS) * TAU, lit = i < seg.n, cur = i === seg.n;
      ctx.fillStyle = lit || cur ? C.lemon : C.milk; ctx.globalAlpha = lit || cur ? 1 : 0.35;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R, H * 0.45 + Math.sin(a) * R, u * (lit ? 0.95 : cur ? 0.6 + 0.9 * level : 0.5), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const flame = clamp(-vel * 0.9);
    if (flame > 0.15 && Math.random() < 0.6) spawn({ x: cx + (Math.random() - 0.5) * u * 5, y: cy + u * 20, vy: 420 + 500 * prog, vx: (Math.random() - 0.5) * 120, r: u * 1.6, grow: 1.6, max: 0.6, col: Math.random() < 0.5 ? C.milk : C.lemon });
    drawRocket(F, cx + ox, cy + oy, 0.88 + 0.24 * level, flame);
    drawParts(ctx, dt); F.partsDone = true;
    cueText(F, H * 0.88, C.milk, prog < 0.3 ? C.tang : C.peri, { size: 8 + 6 * level });
    return;
  }

  if (seg.drop) {                                      // engines cut: out you float
    ctx.fillStyle = C.night; ctx.fillRect(0, 0, W, H); drawStars(F, 60, 0.6, 0);
    if (p < 0.85) { ctx.save(); ctx.globalAlpha = 1 - smooth(p / 0.85); drawRocket(F, cx + p * u * 14, H * 0.45 + p * p * H * 0.5, 1 - 0.5 * p, 0, true); ctx.restore(); }
    puff(ctx, cx - smooth(p * 2) * u * 3, H * 0.45 - u * 1.4 - smooth(p) * u * 3, u * lerp(3, 5.5, smooth(p)) * (0.8 + 0.3 * level), { t: now, vel, eyes: 'happy', mouth: 'out', shade: C.peri });
    ctx.fillStyle = C.milk; ctx.globalAlpha = Math.exp(-el * 3.5); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    cueText(F, H * 0.8, C.milk, C.peri, { size: 8 });
    return;
  }

  if (seg.open) {                                      // the long empty float
    ctx.fillStyle = C.night; ctx.fillRect(0, 0, W, H); lastBg = C.night;
    drawStars(F, 30 + el * 3.5, 0.5 + 0.5 * br.still, el * 0.004);
    for (let k = Math.max(0, Math.floor((el - 8) / 12) - 1); k <= Math.floor((el - 8) / 12); k++) {
      const age = el - 8 - 12 * k; if (age < 0 || age > 18) continue;
      if (k > wim.lastFound) { wim.lastFound = k; stats.found++; audio.sparkle(0.12); }
      const seed = k + seg.round * 7;
      spaceThing(F, (k + seg.round * 2) % 5, W * (1.2 - (age / 18) * 1.4), H * (0.16 + 0.62 * hash(seed)) + Math.sin(age * 0.5) * u * 2, u * (5 + 5 * hash(seed + 3)));
    }
    const x = cx + Math.sin(el * 0.13) * W * 0.1, y = H * 0.45 + Math.cos(el * 0.11) * H * 0.05, R = u * 9;
    ctx.lineCap = 'round'; ctx.lineWidth = u * 0.7;
    ctx.strokeStyle = C.milk; ctx.globalAlpha = 0.14; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(p)); ctx.stroke();
    if (p > 1) { ctx.strokeStyle = C.lemon; ctx.lineWidth = u * (1 + 0.3 * Math.sin(now * 3)); ctx.beginPath(); ctx.arc(x, y, R + u * 1.6, -Math.PI / 2, -Math.PI / 2 + TAU * clamp((p - 1) * seg.target / 45)); ctx.stroke(); }
    ctx.globalAlpha = 1;
    puff(ctx, x, y, u * 5, { t: now * 0.4, eyes: 'closed', mouth: 'smile', rot: Math.sin(el * 0.2) * 0.35, shade: C.peri });
    const past = p >= 1;
    cueText(F, H * 0.68, C.milk, C.peri, { size: 8, cueAlpha: 1 - smooth((el - 4) / 2),
      sub: past ? 'Lovely. Stay only if it still feels easy. Tap or press space to breathe in.' : seg.sub,
      subAlpha: past ? 0.65 + 0.35 * smooth((el - seg.target) / 1.5) : 1 - 0.35 * smooth((el - 12) / 3) });
    return;
  }

  // big breath in -> supernova -> let go -> free
  const cy = H * 0.45;
  wim.rayA += dt * (seg.bloom ? lerp(0.5, 0.06, smooth(p)) : 0.08);
  if (seg.rise) {
    ctx.fillStyle = C.night; ctx.fillRect(0, 0, W, H); drawStars(F, 150, 1 - p, 0);
    for (const [c, k] of [[C.tang, 1], [C.lemon, 0.62]]) { ctx.fillStyle = c; ctx.globalAlpha = 0.85 * smooth(p * 1.5); ctx.beginPath(); ctx.arc(cx, cy, u * (8 + 34 * p * p) * k, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
    puff(ctx, cx, cy, u * lerp(5, 13, level), { t: now, vel, eyes: 'wide', mouth: 'in', shade: C.tang });
    cueText(F, H * 0.86, C.milk, C.tang, { size: 9 });
  } else if (seg.bloom) {
    sunburst(F, cx, cy, 1, [ramp([C.tang, C.pink], p), ramp([C.lemon, C.lemon, C.milk], p)]); lastBg = C.pink;
    if (wim.rings.length < 6 && (!wim.rings.length || now - wim.rings[wim.rings.length - 1] > 1.1 + p * 2)) wim.rings.push(now);
    wim.rings = wim.rings.filter((t0) => now - t0 < 3.5);
    for (const t0 of wim.rings) { const a = (now - t0) / 3.5; ctx.strokeStyle = C.milk; ctx.globalAlpha = (1 - a) * 0.8; ctx.lineWidth = u * 1.4 * (1 - a) + 1; ctx.beginPath(); ctx.arc(cx, cy, u * (13 + a * 70), 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.fillStyle = C.milk; ctx.globalAlpha = Math.exp(-el * 2.5); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    const r = u * (13 + 0.6 * Math.sin(now * 2));
    ctx.strokeStyle = C.ink; ctx.lineWidth = u * 0.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(cx, cy, r + u * 3, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - clamp(p))); ctx.stroke();
    puff(ctx, cx, cy, r, { t: now, eyes: p < 0.5 ? 'wide' : 'happy', mouth: 'smile', shade: C.tang });
    cueText(F, H * 0.86, C.ink, C.milk, { size: 9 });
  } else {
    ctx.fillStyle = C.pink; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 14; i++) {                     // slow confetti drifting up
      const yy = ((hash(i) - now * 0.02 * (0.5 + hash(i + 5))) % 1 + 1) % 1;
      ctx.fillStyle = [C.milk, C.lemon, C.tang, C.peri][i % 4]; ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.arc(W * hash(i + 20) + Math.sin(now * 0.4 + i) * u * 2, yy * H * 1.2 - H * 0.1, u * (0.8 + 1.6 * hash(i + 30)), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (seg.after) sunburst(F, cx, cy, 1 - smooth(p), [C.pink, C.milk]);
    const r = seg.after ? u * lerp(13, 6.5, smooth(p)) : u * (5.5 + 2.5 * level);
    if (seg.after && Math.random() < 0.5) spawn({ x: cx + (Math.random() - 0.5) * r, y: cy + r * 0.3, vy: 90, vx: (Math.random() - 0.5) * 240, r: u, grow: 2, max: 1, col: C.milk });
    puff(ctx, cx, cy + Math.sin(now * 1.2) * u, r, { t: now, vel, eyes: 'happy', mouth: seg.after ? 'out' : 'smile', shade: C.tang });
    cueText(F, H * 0.86, C.ink, C.milk, { size: 9 });
  }
}

// =================================================================== 4. LANDING (float home past everything)
const land = { t0: 0, total: 65, landed: false };
function drawLand(F) {
  const { ctx, W, H, u, now, seg, level, vel, J } = F, cx = W / 2;
  const q = clamp((now - land.t0) / land.total), end = seg.kind === 'end';
  ctx.fillStyle = ramp([C.night, C.deep, C.peri, C.pink, C.lemon], q); ctx.fillRect(0, 0, W, H); lastBg = C.lemon;
  const Y = (z) => H * 0.45 + (z - q) * H * 2.4;
  if (q < 0.45) drawStars(F, 150, 1 - q / 0.45, 0);
  spaceThing(F, 0, W * 0.22, Y(0.12), u * 8); spaceThing(F, 1, W * 0.8, Y(0.2), u * 7); spaceThing(F, 2, W * 0.25, Y(0.3), u * 7); spaceThing(F, 3, W * 0.78, Y(0.4), u * 5);
  ctx.fillStyle = C.milk;
  for (let i = 0; i < 7; i++) { blobPath(ctx, W * hash(i + 40), Y(0.48 + i * 0.055), u * (5 + 4 * hash(i + 50)), now * 0.3 + i, 1, 2.4, 0.8); ctx.fill(); }
  const gy = Y(1) + H * 0.36;                           // ground reaches 81% down the screen at the end
  ctx.fillStyle = C.mint; ctx.beginPath(); ctx.ellipse(cx, gy + H * 0.6, W * 1.2, H * 0.68, 0, 0, TAU); ctx.fill();
  if (gy < H * 1.6) { ctx.save(); ctx.translate(0, gy - H * 0.92 + u * 2); drawSkyline(F, H * 0.92, stats.tiles || BOX_ROUNDS, 1); ctx.restore(); }

  const r = u * (4.6 + 1.6 * level), restY = Math.min(H * 0.45, gy - r * 0.6);
  let py = restY, chute = 1;
  if (end) {
    const k = smooth(F.el / 1.6); py = lerp(H * 0.45, gy + u * 2 - r, k); chute = 1 - smooth((F.el - 1.2) / 0.8);
    if (k >= 1 && !land.landed) { land.landed = true; burst(cx, py, 60, [C.tang, C.pink, C.peri, C.milk], 520, u * 1.2, 500); audio.pop(); }
  }
  const px = cx + Math.sin(now * 0.5) * u * 3 * chute;
  if (chute > 0.02) {
    const cr = u * (9 + 3 * level) * chute, cyy = py - u * 13;
    ctx.strokeStyle = C.ink; ctx.lineWidth = u * 0.25; ctx.globalAlpha = chute;
    for (const s of [-1, -0.33, 0.33, 1]) { ctx.beginPath(); ctx.moveTo(px + s * cr, cyy); ctx.lineTo(px + s * r * 0.5, py - r * 0.7); ctx.stroke(); }
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? C.milk : C.tang; ctx.beginPath(); ctx.moveTo(px, cyy); ctx.arc(px, cyy, cr, Math.PI + (i / 6) * Math.PI, Math.PI + ((i + 1) / 6) * Math.PI); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  puff(ctx, px, py, r, { t: now, vel, ...(end ? { eyes: 'happy', mouth: 'smile' } : faceFor(seg.kind, true)), shade: C.tang });
  if (!end) cueText(F, H * 0.87, q < 0.5 ? C.milk : C.ink, q < 0.5 ? C.peri : C.milk, { size: 10 });
  void J;
}

// =================================================================== breath gauge (every stage)
// Lemon liquid = your breath as the sensor reads it. Milk arrow = where the pacer is.
export function drawGauge(F) {
  const { ctx, W, H, u, seg, br, now } = F;
  if (!seg || seg.kind === 'title' || seg.kind === 'end' || seg.kind === 'free' || seg.open) return;
  const w = Math.max(14, u * 3.4), h = Math.min(H * 0.36, u * 46), x = Math.max(18, u * 4.5), y0 = H * 0.5 - h / 2, live = br.sensed != null && br.conf > 0.25;
  const yOf = (l) => y0 + h - w / 2 - clamp(l) * (h - w);
  ctx.fillStyle = C.ink; ctx.globalAlpha = 0.34; rr(ctx, x, y0, w, h, w / 2); ctx.fill(); ctx.globalAlpha = 1;
  if (live) {
    const near = Math.abs(br.sensed - br.pacer) < 0.22, ys = yOf(br.sensed);
    ctx.save(); rr(ctx, x, y0, w, h, w / 2); ctx.clip();
    ctx.fillStyle = C.lemon; ctx.fillRect(x, ys, w, y0 + h - ys);
    ctx.restore();
    ctx.fillStyle = near ? C.milk : C.lemon; ctx.beginPath(); ctx.arc(x + w / 2, ys, w * (near ? 0.62 + 0.08 * Math.sin(now * 8) : 0.5), 0, TAU); ctx.fill();
    ctx.fillStyle = C.ink; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + w / 2 + s * w * 0.17, ys - w * 0.04, w * 0.07, 0, TAU); ctx.fill(); }
  }
  // pacer marker: an arrow that points the way to breathe
  const yp = yOf(br.pacer), mx = x + w + u * 0.8, d = seg.kind === 'in' ? -1 : seg.kind === 'out' ? 1 : 0, a = Math.max(8, u * 1.7);
  for (const [o, c, al] of [[u * 0.35, C.ink, 0.3], [0, C.milk, 1]]) {
    ctx.fillStyle = c; ctx.globalAlpha = al; ctx.beginPath();
    if (d) { ctx.moveTo(mx + o, yp + o - d * a * 0.1); ctx.lineTo(mx + o + a * 1.5, yp + o - d * a * 0.1); ctx.lineTo(mx + o + a * 0.75, yp + o + d * a * 1.1); }
    else ctx.roundRect(mx + o, yp + o - a * 0.3, a * 1.5, a * 0.6, a * 0.3);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  label(ctx, live ? 'you' : 'pacer', x + w / 2, y0 + h + Math.max(12, u * 2.2), Math.max(11, u * 2), C.milk, { body: true, weight: '700', shade: C.ink });
}

// =================================================================== plumbing
export function onSeg(seg, prev, now, J) {
  if (seg.stage === 'sips') {
    if (seg.kind === 'title') { sips.way = sips.prev = 0; sips.passed.clear(); sips.trail.length = 0; sips.lastK = 0; }
    if (seg.bar) { sips.prev = sips.way; sips.way = seg.pat % WAYS.length; if (sips.way !== sips.prev) sips.wayT = now; }
  }
  if (prev && prev.stage === 'box' && prev.side === 3 && stats.tiles < BOX_ROUNDS) { stats.tiles = prev.round + 1; box.stampT = now; audio.stamp(); }
  if (seg.stage === 'wim') {
    if (seg.pump && seg.kind === 'in') stats.breaths++;
    if (seg.open) wim.lastFound = -1;
    if (seg.bloom) wim.rings = [];
  }
  // skipped into the ending: finish the descent at once so Puff lands on the ground, not in space
  if (seg.kind === 'end' && now - land.t0 < land.total) { land.t0 = now - land.total; land.landed = false; }
  if (seg.stage === 'land' && seg.kind === 'title') { land.t0 = now; land.total = J.totalFixed('land'); land.landed = false; }
}
export function drawStage(F) {
  const s = F.seg;
  if (s.kind === 'title' && s.stage !== 'wim' && s.stage !== 'land') return titleCard(F, s.stage === 'box' ? C.mint : C.peri, s.stage === 'box' ? C.ink : C.milk, s.stage === 'box' ? C.milk : C.ink);
  if (s.stage === 'sips') return drawSips(F);
  if (s.stage === 'box') return drawBox(F);
  if (s.stage === 'wim') return drawWim(F);
  return drawLand(F);
}
// the little window on the start screen: Puff sipping along the dotted path, catching coins
const demo = { lastK: 0 };
function demoLevel(t) {
  t = ((t % 6) + 6) % 6; const e = (p) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(p));
  if (t < 1.2) return 0.6 * e(t / 1.2); if (t < 2) return 0.6 + 0.4 * e((t - 1.2) / 0.8); if (t < 2.4) return 1;
  return 1 - e((t - 2.4) / 3.6);
}
export function drawDemo(F) {
  const { ctx, W, H, u, now, dt } = F, w = WAYS[1], level = demoLevel(now), vel = (demoLevel(now + 0.05) - demoLevel(now - 0.05)) / 0.1;
  sipsScene({ ...F, level }, w, now * W * 0.25);
  const px = W * 0.27, speed = W * 0.24, yOf = (l) => lerp(H * 0.68, H * 0.2, l), STEP = 0.3, k0 = Math.ceil(now / STEP);
  if (demo.lastK && k0 - demo.lastK < 20) for (let k = demo.lastK + 1; k < k0; k++) if (k % 4 === 0) burst(px, yOf(level), 7, [C.lemon, C.milk], u * 55, u * 1.6);
  demo.lastK = k0 - 1;
  for (let g = Math.floor((now - 2.2) / 6) * 6 + 2.2, n = 0; n < 2; n++, g += 6) {            // a gate at the top of each breath
    const d = g - now; if (d < -1.6) continue;
    const s = d < 0 ? 1 + 0.5 * smooth(-d / 0.4) : 1;
    ctx.save(); ctx.translate(px + d * speed, yOf(1)); ctx.scale(s, s); ctx.lineWidth = u * 2.6;
    for (const [o, c, a] of [[u, C.ink, 0.2], [0, C.peri, 1]]) { ctx.strokeStyle = c; ctx.globalAlpha = a; ctx.beginPath(); ctx.ellipse(o, o, u * 7, u * 17, 0, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }
  for (let k = k0; k * STEP - now < (W - px) / speed + 0.3; k++) {
    const d = k * STEP - now, x = px + d * speed, y = yOf(demoLevel(now + d)), coin = k % 4 === 0;
    if (coin) { ctx.fillStyle = C.ink; ctx.globalAlpha = 0.2; ctx.beginPath(); ctx.arc(x + u * 0.6, y + u * 0.6, u * 3.2, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = coin ? 1 : 0.75; ctx.fillStyle = coin ? C.lemon : C.ink;
    ctx.beginPath(); ctx.arc(x, y, coin ? u * (3.2 + 0.4 * Math.sin(now * 5 + k)) : u * 1.1, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  puff(ctx, px, yOf(level), u * (8.5 + 4.5 * level), { t: now, vel, ...faceFor(vel > 0.05 ? 'in' : vel < -0.05 ? 'out' : 'hold', true), rot: clamp(-vel * 0.25, -0.4, 0.4) });
  drawParts(ctx, dt);
  const t = ((now % 6) + 6) % 6, word = t < 2.4 ? 'sip' : 'long out', t0 = t < 1.2 ? t : t < 2.4 ? t - 1.2 : t - 2.4;
  label(ctx, word, W / 2, H * 0.86, u * 15, C.ink, { shade: C.milk, scale: 1 + 0.3 * Math.exp(-t0 * 7) });
}

// behind the start screen: just the sky and hills (Puff lives in the demo window, drawDemo)
export function drawIdle(F) {
  sipsScene(F, WAYS[0], F.now * 40, F.W < 760);         // on phones the start text covers the whole sky
}
