// "Find your spot": shown after "Start with camera". A see-through mirror of the camera with a rough
// head-and-shoulders outline, and one plain instruction, so people place themselves before the game starts.
import { V } from './vitals.js';
import { C, TAU, label, wrap, rr, smooth } from './gfx.js';

// where the person is, judged from the face tracker (all in fractions of the camera picture)
export function placement(faceReady, faceFailed) {
  if (faceFailed) return { ok: false, msg: 'Face tracking did not load', sub: 'You can still play: just follow along.' };
  if (!faceReady) return { ok: false, msg: 'Warming up the camera', sub: '' };
  const g = V.geom;
  if (!g) return { ok: false, msg: 'Looking for your face', sub: 'Sit facing the camera, with light on your face.' };
  const nx = g.nose.x / V.W, ny = g.nose.y / V.H, fh = g.faceH / V.H;
  const chestOk = g.chest && g.chest.h >= 0.5 * g.faceH;
  if (fh > 0.42) return { ok: false, msg: 'Move back a little', sub: 'The camera needs your chest as well as your face.' };
  if (!chestOk || ny > 0.52) return { ok: false, msg: 'Show more of your chest', sub: 'Move back, or tilt the camera down a little.' };
  if (fh < 0.16) return { ok: false, msg: 'Come a little closer', sub: '' };
  if (Math.abs(nx - 0.5) > 0.2) return { ok: false, msg: 'Move to the middle', sub: '' };
  if (V.motionEMA > 0.3) return { ok: false, msg: 'Hold still', sub: '' };
  return { ok: true, msg: 'Perfect. Stay right there', sub: '' };
}

// F: { ctx, W, H, u, now }, video element, p = placement(), held = seconds it has been ok, touch = on a phone
export function drawSetup(F, video, p, held, touch) {
  const { ctx, W, H, u, now } = F;
  ctx.fillStyle = C.peri; ctx.fillRect(0, 0, W, H);
  label(ctx, 'find your spot', W / 2, H * 0.085, Math.max(26, u * 7), C.milk, { shade: C.ink });

  // the mirror window
  const ar = (V.W || 4) / (V.H || 3), maxW = W * 0.9, maxH = H * 0.56;
  const wh = Math.min(maxH, maxW / ar), ww = wh * ar, x0 = (W - ww) / 2, y0 = H * 0.15;
  ctx.fillStyle = C.ink; ctx.globalAlpha = 0.9; rr(ctx, x0 + u, y0 + u * 1.2, ww, wh, u * 3); ctx.fill(); ctx.globalAlpha = 1;
  ctx.save(); rr(ctx, x0, y0, ww, wh, u * 3); ctx.clip();
  ctx.fillStyle = C.deep; ctx.fillRect(x0, y0, ww, wh);
  if (video.readyState >= 2) { ctx.save(); ctx.globalAlpha = 0.6; ctx.translate(x0 + ww, y0); ctx.scale(-1, 1); ctx.drawImage(video, 0, 0, ww, wh); ctx.restore(); }
  // where the game watches your breath
  const g = V.geom;
  if (g && g.chest) {
    const sx = ww / V.W, sy = wh / V.H, c = g.chest;
    ctx.strokeStyle = C.lemon; ctx.globalAlpha = 0.9; ctx.lineWidth = Math.max(2, u * 0.5); ctx.setLineDash([u * 1.5, u * 1.2]);
    rr(ctx, x0 + ww - (c.x + c.w) * sx, y0 + c.y * sy, c.w * sx, c.h * sy, u * 1.5); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  // rough outline: a head and two shoulders
  const cx = x0 + ww / 2, col = p.ok ? C.lemon : C.milk, pulse = p.ok ? 1 : 0.75 + 0.25 * Math.sin(now * 3);
  ctx.strokeStyle = col; ctx.globalAlpha = pulse; ctx.lineWidth = Math.max(3, u * 0.9); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.ellipse(cx, y0 + wh * 0.36, wh * 0.15, wh * 0.2, 0, 0, TAU); ctx.stroke();
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * wh * 0.1, y0 + wh * 0.62); ctx.quadraticCurveTo(cx + s * wh * 0.4, y0 + wh * 0.66, cx + s * wh * 0.44, y0 + wh * 0.98); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.restore();

  // one instruction, and a ring that fills while you are in place
  const ty = y0 + wh + Math.max(34, u * 7);
  label(ctx, p.msg, W / 2, ty, Math.max(22, u * 5), p.ok ? C.lemon : C.milk, { shade: C.ink });
  const sub = p.sub || (touch && !p.ok ? 'Stand your phone on a table, leaning on something. Do not hold it.' : '');
  if (sub) wrap(ctx, sub, W / 2, ty + Math.max(30, u * 5), Math.max(15, u * 2.4), C.milk, Math.min(W * 0.86, u * 70));
  if (p.ok) { ctx.strokeStyle = C.lemon; ctx.lineWidth = Math.max(4, u); ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(W / 2, ty + Math.max(40, u * 7.5), Math.max(12, u * 2.4), -Math.PI / 2, -Math.PI / 2 + TAU * smooth(held / 2)); ctx.stroke(); }
}
