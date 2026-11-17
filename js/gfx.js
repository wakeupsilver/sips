// Shared drawing kit: palette, Puff (the hero), particles, paper grain, type.
export const C = {
  peri: '#5b6cff', deep: '#3442c9', tang: '#ff7a1a', lemon: '#ffe45c', milk: '#fff8ef',
  ink: '#17123a', mint: '#7df0c0', leaf: '#22b98a', pink: '#ff9ecf', night: '#0d0a2b',
};
export const DISPLAY = '"Bagel Fat One", "Arial Rounded MT Bold", system-ui, sans-serif';
export const BODY = '"Onest", system-ui, sans-serif';
export const TAU = Math.PI * 2;
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, p) => a + (b - a) * p;
export const smooth = (p) => { p = clamp(p); return p * p * (3 - 2 * p); };

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export function mix(a, b, p) { const x = hex(a), y = hex(b); p = clamp(p); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * p)).join(',')})`; }
export function ramp(stops, p) {                    // stops: [hex, hex, ...] evenly spaced
  p = clamp(p) * (stops.length - 1); const i = Math.min(stops.length - 2, Math.floor(p));
  return mix(stops[i], stops[i + 1], p - i);
}

export function blobPath(ctx, x, y, r, t, wob = 1, sx = 1, sy = 1) {
  ctx.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * TAU;
    const rr = r * (1 + wob * (0.035 * Math.sin(3 * a + t * 1.6) + 0.025 * Math.sin(5 * a - t * 1.1)));
    const px = x + Math.cos(a) * rr * sx, py = y + Math.sin(a) * rr * sy;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

// Puff. o: { lung 0..1, eyes 'open'|'closed'|'wide'|'happy', mouth 'in'|'out'|'smile'|'none', t, col, shade, rot, vel }
export function puff(ctx, x, y, r, o = {}) {
  const t = o.t || 0, vel = clamp(o.vel || 0, -1.5, 1.5);
  const sx = 1 - 0.05 * vel, sy = 1 + 0.07 * vel;
  ctx.save(); ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot);
  ctx.fillStyle = o.shade || C.pink; blobPath(ctx, r * 0.09, r * 0.1, r, t, 1, sx, sy); ctx.fill();   // misprinted second colour
  ctx.fillStyle = o.col || C.milk; blobPath(ctx, 0, 0, r, t, 1, sx, sy); ctx.fill();
  const ex = r * 0.3, ey = -r * 0.12, er = r * 0.085;
  ctx.fillStyle = C.ink; ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(1.5, r * 0.06); ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    if (o.eyes === 'closed') { ctx.beginPath(); ctx.arc(s * ex, ey, er * 1.3, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
    else if (o.eyes === 'happy') { ctx.beginPath(); ctx.arc(s * ex, ey + er, er * 1.3, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(s * ex, ey, er * (o.eyes === 'wide' ? 1.5 : 1), 0, TAU); ctx.fill(); }
  }
  ctx.fillStyle = 'rgba(255,110,160,.55)';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * r * 0.5, r * 0.12, r * 0.11, r * 0.07, 0, 0, TAU); ctx.fill(); }
  ctx.fillStyle = C.ink;
  const my = r * 0.2;
  if (o.mouth === 'in') { ctx.beginPath(); ctx.ellipse(0, my, r * 0.1, r * (0.08 + 0.1 * clamp(vel)), 0, 0, TAU); ctx.fill(); }
  else if (o.mouth === 'out') { ctx.beginPath(); ctx.ellipse(0, my, r * 0.06, r * 0.05, 0, 0, TAU); ctx.fill(); }
  else if (o.mouth !== 'none') { ctx.beginPath(); ctx.arc(0, my - r * 0.05, r * 0.14, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
  ctx.restore();
}
export function faceFor(kind, full) {               // sensible face for a breath phase
  if (kind === 'in') return { eyes: 'open', mouth: 'in' };
  if (kind === 'out') return { eyes: 'happy', mouth: 'out' };
  if (kind === 'hold') return full ? { eyes: 'wide', mouth: 'smile' } : { eyes: 'closed', mouth: 'smile' };
  return { eyes: 'open', mouth: 'smile' };
}

// ------------------------------------------------------------------ particles
export const parts = [];
export function burst(x, y, n, cols, speed = 220, size = 6, grav = 0) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, v = speed * (0.3 + Math.random() * 0.8);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.5 + Math.random() * 0.6, r: size * (0.5 + Math.random()), col: cols[i % cols.length], grav });
  }
}
export function spawn(p) { parts.push({ life: 0, max: 1, r: 5, vx: 0, vy: 0, grav: 0, col: C.milk, ...p }); }
export function drawParts(ctx, dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life += dt;
    if (p.life > p.max) { parts.splice(i, 1); continue; }
    p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 1.5 * dt; p.vy *= 1 - 1.5 * dt;
    const k = 1 - p.life / p.max;
    ctx.globalAlpha = Math.min(1, k * 2); ctx.fillStyle = p.col;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (p.grow ? 1 + p.grow * (1 - k) : k), 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (parts.length > 600) parts.splice(0, parts.length - 600);
}

// ------------------------------------------------------------------ paper grain
let grainPat = null;
export function grain(ctx, W, H) {
  if (!grainPat) {
    const c = document.createElement('canvas'); c.width = c.height = 160;
    const g = c.getContext('2d'), d = g.createImageData(160, 160);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 26; }
    g.putImageData(d, 0, 0); grainPat = ctx.createPattern(c, 'repeat');
  }
  ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.fillStyle = grainPat; ctx.fillRect(0, 0, W, H); ctx.restore();
}

export function label(ctx, text, x, y, size, col, o = {}) {
  ctx.save();
  ctx.font = `${o.weight || ''} ${size}px ${o.body ? BODY : DISPLAY}`; ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
  ctx.globalAlpha = o.alpha ?? 1;
  if (o.scale && o.scale !== 1) { ctx.translate(x, y); ctx.scale(o.scale, o.scale); ctx.translate(-x, -y); }
  if (o.shade) { ctx.fillStyle = o.shade; ctx.fillText(text, x + size * 0.05, y + size * 0.06); }
  ctx.fillStyle = col; ctx.fillText(text, x, y);
  ctx.restore();
}
export function wrap(ctx, text, x, y, size, col, maxW, alpha = 1) {
  ctx.save(); ctx.font = `500 ${size}px ${BODY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = col; ctx.globalAlpha = alpha;
  const words = text.split(' '), lines = []; let line = '';
  for (const w of words) { const tryL = line ? line + ' ' + w : w; if (ctx.measureText(tryL).width > maxW && line) { lines.push(line); line = w; } else line = tryL; }
  lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * size * 1.35));
  ctx.restore();
}
export function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

// little buildings made from finished box-breathing tiles
const TILE_COLS = [C.tang, C.lemon, C.pink, C.peri, C.milk, C.tang, C.pink, C.lemon];
export function drawTile(ctx, i, x, base, w, t, grow = 1) {
  const kind = i % 4, h = w * [1.5, 2.6, 1.9, 3.2, 1.2, 2.2, 2.9, 1.7][i % 8] * grow, col = TILE_COLS[i % 8];
  if (kind !== 2) { ctx.fillStyle = C.ink; ctx.globalAlpha = 0.18; rr(ctx, x - w / 2 + w * 0.08, base - h + w * 0.08, w, h, w * 0.18); ctx.fill(); ctx.globalAlpha = 1; }
  if (kind === 2) {                                   // tree
    ctx.fillStyle = C.ink; ctx.fillRect(x - w * 0.06, base - h * 0.5, w * 0.12, h * 0.5);
    ctx.fillStyle = C.leaf; ctx.beginPath(); ctx.arc(x, base - h * 0.62, w * 0.55, 0, TAU); ctx.fill();
    return;
  }
  ctx.fillStyle = col; rr(ctx, x - w / 2, base - h, w, h, kind === 1 ? [w * 0.5, w * 0.5, 0, 0] : w * 0.16); ctx.fill();
  ctx.fillStyle = C.ink;
  if (kind === 3) {                                   // the one with a face
    const blink = (t % 3.1) < 0.14, ey = base - h + w * 0.55;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + s * w * 0.2, ey, w * 0.07, blink ? w * 0.012 : w * 0.07, 0, 0, TAU); ctx.fill(); }
    ctx.lineWidth = w * 0.05; ctx.strokeStyle = C.ink; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, ey + w * 0.16, w * 0.14, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  } else {
    const rows = Math.max(1, Math.floor(h / (w * 0.5)) - 1);
    for (let r = 0; r < rows; r++) for (const s of [-1, 1]) { rr(ctx, x + s * w * 0.2 - w * 0.09, base - h + w * 0.3 + r * w * 0.48, w * 0.18, w * 0.22, w * 0.04); ctx.fill(); }
  }
}
