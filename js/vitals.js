// Breathing (and heart rate, unused here) from the webcam. Shared with Body Rave and Signal Lab
// (../body-rave/js/vitals.js). Only change: the chest tracker searches 12 px instead of 6 and
// re-anchors less eagerly, so big fast Wim Hof breaths stay tracked.

export class Series {
  constructor(maxAge = 200) { this.t = []; this.v = []; this.maxAge = maxAge; }
  push(t, v) {
    this.t.push(t); this.v.push(v);
    if (this.t.length > 256 && t - this.t[0] > this.maxAge * 1.25) {
      let k = 0; while (k < this.t.length && t - this.t[k] > this.maxAge) k++;
      this.t.splice(0, k); this.v.splice(0, k);
    }
  }
  get length() { return this.t.length; }
  get last() { return this.v[this.v.length - 1]; }
  clear() { this.t.length = 0; this.v.length = 0; }
}

// ------------------------------------------------------------- DSP utilities
function lowerBound(a, x) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; }
function resample(T, V, t0, t1, fs) {
  const n = Math.floor((t1 - t0) * fs);
  if (n < 4 || T.length < 2) return null;
  const out = new Float64Array(n);
  let j = Math.max(0, lowerBound(T, t0) - 1);
  for (let i = 0; i < n; i++) {
    const t = t0 + i / fs;
    while (j < T.length - 2 && T[j + 1] <= t) j++;
    const ta = T[j], tb = T[j + 1];
    const a = tb > ta ? Math.min(1, Math.max(0, (t - ta) / (tb - ta))) : 0;
    out[i] = V[j] + a * (V[j + 1] - V[j]);
  }
  return out;
}
function biquad(type, f0, fs, Q = Math.SQRT1_2) {
  const w = 2 * Math.PI * f0 / fs, c = Math.cos(w), s = Math.sin(w), al = s / (2 * Q);
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; } else { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
  const a0 = 1 + al;
  return [b0 / a0, b1 / a0, b2 / a0, (-2 * c) / a0, (1 - al) / a0];
}
function runBiquad(x, k) {
  const y = new Float64Array(x.length);
  let x1 = x[0], x2 = x[0], y1 = 0, y2 = 0;
  if (k[0] + k[1] + k[2] > 0.5) { y1 = x[0]; y2 = x[0]; }
  for (let i = 0; i < x.length; i++) {
    const xi = x[i], yi = k[0] * xi + k[1] * x1 + k[2] * x2 - k[3] * y1 - k[4] * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = yi; y[i] = yi;
  }
  return y;
}
function bandpass(x, lo, hi, fs, sections = 2) {
  const n = x.length; if (n < 8) return new Float64Array(n);
  let mean = 0; for (let i = 0; i < n; i++) mean += x[i]; mean /= n;
  const pad = Math.min(n - 1, Math.round(1.5 * fs / lo));
  const p = new Float64Array(n + 2 * pad);
  for (let i = 0; i < pad; i++) p[i] = 2 * x[0] - x[pad - i] - mean;
  for (let i = 0; i < n; i++) p[pad + i] = x[i] - mean;
  for (let i = 0; i < pad; i++) p[pad + n + i] = 2 * x[n - 1] - x[n - 2 - i] - mean;
  const hp = biquad('hp', lo, fs), lp = biquad('lp', hi, fs);
  let y = p;
  for (let pass = 0; pass < 2; pass++) { for (let s = 0; s < sections; s++) { y = runBiquad(y, hp); y = runBiquad(y, lp); } y.reverse(); }
  return y.subarray(pad, pad + n);
}
function stats(x) {
  let m = 0; for (const v of x) m += v; m /= x.length || 1;
  let s = 0; for (const v of x) s += (v - m) * (v - m);
  return { mean: m, std: Math.sqrt(s / (x.length || 1)) };
}
function median(a) { if (!a.length) return NaN; const s = [...a].sort((p, q) => p - q); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function detrend(x) {
  const n = x.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += x[i]; sxx += i * i; sxy += i * x[i]; }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), a = (sy - b * sx) / n;
  const y = new Float64Array(n); for (let i = 0; i < n; i++) y[i] = x[i] - (a + b * i);
  return y;
}
function spectrum(x, fs, fLo, fHi, step) {
  const n = x.length, w = new Float64Array(n);
  const { mean } = stats(x);
  for (let i = 0; i < n; i++) w[i] = (x[i] - mean) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
  const freqs = [], power = [];
  for (let f = fLo; f <= fHi + 1e-9; f += step) {
    const ang = 2 * Math.PI * f / fs, c = Math.cos(ang), s = Math.sin(ang);
    let cr = 1, ci = 0, re = 0, im = 0;
    for (let i = 0; i < n; i++) { re += w[i] * cr; im -= w[i] * ci; const t = cr * c - ci * s; ci = cr * s + ci * c; cr = t; }
    freqs.push(f); power.push(re * re + im * im);
  }
  return { freqs, power };
}
function peakOf(spec, fLo, fHi) {
  let best = -1, bi = -1;
  spec.freqs.forEach((f, i) => { if (f >= fLo && f <= fHi && spec.power[i] > best) { best = spec.power[i]; bi = i; } });
  if (bi < 0) return null;
  let f = spec.freqs[bi];
  if (bi > 0 && bi < spec.freqs.length - 1) {
    const a = spec.power[bi - 1], b = spec.power[bi], c = spec.power[bi + 1], d = a - 2 * b + c;
    if (d < 0) f += 0.5 * (a - c) / d * (spec.freqs[1] - spec.freqs[0]);
  }
  return { f, i: bi, p: best };
}
function bandPower(spec, lo, hi) { let s = 0; spec.freqs.forEach((f, i) => { if (f >= lo && f <= hi) s += spec.power[i]; }); return s; }

// POS rPPG (Wang, den Brinker, Stuijk, de Haan 2017)
function pos(R, G, B, fs) {
  const n = R.length, l = Math.round(1.6 * fs), H = new Float64Array(n);
  const s1 = new Float64Array(l), s2 = new Float64Array(l);
  for (let m = 0; m + l <= n; m++) {
    let mr = 0, mg = 0, mb = 0;
    for (let k = 0; k < l; k++) { mr += R[m + k]; mg += G[m + k]; mb += B[m + k]; }
    mr /= l; mg /= l; mb /= l;
    if (!mr || !mg || !mb) continue;
    for (let k = 0; k < l; k++) { const r = R[m + k] / mr, g = G[m + k] / mg, b = B[m + k] / mb; s1[k] = g - b; s2[k] = g + b - 2 * r; }
    const a = stats(s1).std / (stats(s2).std || 1e-9);
    let hm = 0; for (let k = 0; k < l; k++) hm += s1[k] + a * s2[k]; hm /= l;
    for (let k = 0; k < l; k++) H[m + k] += s1[k] + a * s2[k] - hm;
  }
  return H;
}
function findPeaks(x, fs, minDist) {
  const n = x.length, h = Math.max(1, Math.floor(minDist * fs / 2)), out = [];
  const { std } = stats(x);
  for (let i = 1; i < n - 1; i++) {
    if (!(x[i] > x[i - 1] && x[i] >= x[i + 1] && x[i] > 0.25 * std)) continue;
    let isMax = true;
    for (let k = Math.max(0, i - h); k <= Math.min(n - 1, i + h); k++) if (x[k] > x[i]) { isMax = false; break; }
    if (!isMax) continue;
    const a = x[i - 1], b = x[i], c = x[i + 1], d = a - 2 * b + c;
    out.push(i + (d < 0 ? 0.5 * (a - c) / d : 0));
  }
  return out;
}

// ------------------------------------------------------------------ state
export const V = {
  W: 640, H: 480, wctx: null,
  r: new Series(), g: new Series(), b: new Series(), chest: new Series(), head: new Series(), hrSpec: new Series(),
  camBeats: [], beatCount: 0,
  pulse: null, breath: null, m: {},
  smooth: null, geom: null, chestRef: null, chestDisp: 0, bviz: null, hrTrack: null,
  nose: null, motionEMA: 0, fps: 30, lastFaceT: 0,
};

const LM = { top: 10, glabella: 9, left: 234, right: 454, chin: 152, nose: 1, cheekL: 50, cheekR: 280, eyeL: 33, eyeR: 263 };
function smoothPoints(lm) {
  const pts = {};
  for (const [k, idx] of Object.entries(LM)) pts[k] = { x: lm[idx].x * V.W, y: lm[idx].y * V.H };
  if (!V.smooth) { V.smooth = pts; return pts; }
  const faceW = Math.hypot(pts.right.x - pts.left.x, pts.right.y - pts.left.y) || 1;
  const move = Math.hypot(pts.nose.x - V.smooth.nose.x, pts.nose.y - V.smooth.nose.y) / faceW;
  const a = Math.min(0.9, 0.25 + 12 * move);
  for (const k of Object.keys(pts)) { V.smooth[k].x += a * (pts[k].x - V.smooth[k].x); V.smooth[k].y += a * (pts[k].y - V.smooth[k].y); }
  return V.smooth;
}
function rect(cx, cy, w, h) {
  const x = Math.max(0, Math.round(cx - w / 2)), y = Math.max(0, Math.round(cy - h / 2));
  return { x, y, w: Math.max(2, Math.min(V.W - x, Math.round(w))), h: Math.max(2, Math.min(V.H - y, Math.round(h))) };
}
function geomFromPoints(p) {
  const faceW = Math.hypot(p.right.x - p.left.x, p.right.y - p.left.y);
  const faceH = Math.hypot(p.chin.x - p.top.x, p.chin.y - p.top.y);
  const ang = Math.atan2(p.eyeR.y - p.eyeL.y, p.eyeR.x - p.eyeL.x);
  const vx = -Math.sin(ang), vy = Math.cos(ang);
  const fh = Math.max(6, 0.7 * Math.hypot(p.glabella.x - p.top.x, p.glabella.y - p.top.y));
  const forehead = { cx: (p.top.x + p.glabella.x) / 2, cy: (p.top.y + p.glabella.y) / 2, w: 0.42 * faceW, h: fh, ang };
  const cs = 0.15 * faceW, dn = 0.02 * faceH;
  const cheeks = [
    { cx: p.cheekL.x + vx * dn, cy: p.cheekL.y + vy * dn, w: cs, h: cs, ang },
    { cx: p.cheekR.x + vx * dn, cy: p.cheekR.y + vy * dn, w: cs, h: cs, ang },
  ];
  const chestTop = p.chin.y + 0.35 * faceH;
  let chest = null;
  if (chestTop < V.H - 20) { const h = Math.min(0.75 * faceH, V.H - chestTop - 2); chest = rect(p.chin.x, chestTop + h / 2, 1.7 * faceW, h); }
  return { faceW, faceH, forehead, cheeks, chest, nose: p.nose };
}
function roiSums(r, acc) {
  const c = Math.cos(r.ang), s = Math.sin(r.ang), hw = r.w / 2, hh = r.h / 2;
  const cs = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([u, v]) => [r.cx + u * c - v * s, r.cy + u * s + v * c]);
  const x0 = Math.max(0, Math.floor(Math.min(...cs.map((q) => q[0])))), x1 = Math.min(V.W, Math.ceil(Math.max(...cs.map((q) => q[0]))));
  const y0 = Math.max(0, Math.floor(Math.min(...cs.map((q) => q[1])))), y1 = Math.min(V.H, Math.ceil(Math.max(...cs.map((q) => q[1]))));
  const bw = x1 - x0, bh = y1 - y0; if (bw < 2 || bh < 2) return;
  const d = V.wctx.getImageData(x0, y0, bw, bh).data;
  for (let y = 0; y < bh; y++) {
    const dy = y0 + y + 0.5 - r.cy;
    for (let x = 0; x < bw; x++) {
      const dx = x0 + x + 0.5 - r.cx, lu = dx * c + dy * s, lv = -dx * s + dy * c;
      if (Math.abs(lu) > hw || Math.abs(lv) > hh) continue;
      const i = (y * bw + x) * 4, R = d[i], G = d[i + 1], B = d[i + 2];
      if (R < 20 || R > 250 || G > 250 || B > 250 || R < B) continue;
      acc.r += R; acc.g += G; acc.b += B; acc.n++;
    }
  }
}
function chestProfile(r) {
  const { data: d } = V.wctx.getImageData(r.x, r.y, r.w, r.h);
  const p = new Float64Array(r.h);
  for (let y = 0; y < r.h; y++) {
    let s = 0, c = 0;
    for (let x = 0; x < r.w; x += 2) { const i = (y * r.w + x) * 4; s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; c++; }
    p[y] = s / c;
  }
  const { mean } = stats(p); for (let y = 0; y < p.length; y++) p[y] -= mean;
  return p;
}
function profileShift(cur, ref, maxS) {
  const n = cur.length, errs = [];
  for (let s = -maxS; s <= maxS; s++) {
    let e = 0, c = 0;
    for (let i = maxS; i < n - maxS; i++) { const d = cur[i] - ref[i + s]; e += d * d; c++; }
    errs.push(e / (c || 1));
  }
  let bi = 0; for (let i = 1; i < errs.length; i++) if (errs[i] < errs[bi]) bi = i;
  let s = bi - maxS;
  if (bi > 0 && bi < errs.length - 1) { const a = errs[bi - 1], b = errs[bi], c = errs[bi + 1], d = a - 2 * b + c; if (d > 0) s += 0.5 * (a - c) / d; }
  return s;
}
// breathing visual signal: de-drifted chest shift, its running power, in/out direction
function updateBreathViz(t) {
  const fs = Math.min(60, Math.max(10, V.fps || 30)), d = V.chestDisp;
  let b = V.bviz;
  if (!b) b = V.bviz = { base: d, v: 0, ms: 0.04, vel: 0, dir: 0 };
  b.base += (1 / (fs * 6)) * (d - b.base);
  const v = b.v + (1 - Math.exp(-1 / (fs * 0.2))) * ((d - b.base) - b.v);
  b.vel += 0.15 * ((v - b.v) * fs - b.vel); b.v = v;
  b.ms += (1 / (fs * 10)) * (v * v - b.ms);
  const thr = 0.15 * Math.sqrt(b.ms);
  if (b.vel > thr) b.dir = 1; else if (b.vel < -thr) b.dir = -1;
  b.norm = Math.max(-1.5, Math.min(1.5, v / (Math.sqrt(b.ms) * 1.6 || 1)));
}

// Per video frame: lm = face landmarks (normalised) or null. Needs V.wctx to hold the frame.
export function vitalsFrame(t, lm) {
  if (V.lastT) { const dt = t - V.lastT; if (dt > 0) V.fps += 0.05 * (1 / dt - V.fps); }
  V.lastT = t;
  if (lm) { V.geom = geomFromPoints(smoothPoints(lm)); V.lastFaceT = t; }
  else if (!(V.geom && t - V.lastFaceT < 0.3)) { V.geom = null; V.smooth = null; }
  const g = V.geom; if (!g) { V.nose = null; return; }
  const acc = { r: 0, g: 0, b: 0, n: 0 };
  roiSums(g.forehead, acc); roiSums(g.cheeks[0], acc); roiSums(g.cheeks[1], acc);
  if (acc.n > 40) { V.r.push(t, acc.r / acc.n); V.g.push(t, acc.g / acc.n); V.b.push(t, acc.b / acc.n); }
  if (g.chest) {
    const ref = V.chestRef;
    const moved = ref && (Math.abs(ref.rect.x + ref.rect.w / 2 - (g.chest.x + g.chest.w / 2)) > 0.15 * g.faceW || Math.abs(ref.rect.y - g.chest.y) > 0.15 * g.faceH);
    if (!ref || moved) V.chestRef = { rect: g.chest, prof: chestProfile(g.chest), offset: V.chestDisp, t };
    else {
      const cur = chestProfile(ref.rect), s = profileShift(cur, ref.prof, 12);
      V.chestDisp = ref.offset + s; V.chest.push(t, V.chestDisp); updateBreathViz(t);
      if (Math.abs(s) > 9 || t - ref.t > 20) V.chestRef = { rect: ref.rect, prof: cur, offset: V.chestDisp, t };
    }
  }
  if (lm && g.nose) {
    const n = g.nose;
    V.head.push(t, -n.y);
    if (V.nose) { const sp = Math.hypot(n.x - V.nose.x, n.y - V.nose.y) / (g.faceW || 1) * V.fps; V.motionEMA += 0.1 * (sp - V.motionEMA); }
    V.nose = { x: n.x, y: n.y };
  }
}

const PULSE_FS = 30, PULSE_WIN = 16;
export function vitalsPulse(t1) {
  if (V.g.length < 60) return;
  const t0 = Math.max(V.g.t[0], t1 - PULSE_WIN);
  if (t1 - t0 < 4) return;
  const R = resample(V.r.t, V.r.v, t0, t1, PULSE_FS), G = resample(V.g.t, V.g.v, t0, t1, PULSE_FS), B = resample(V.b.t, V.b.v, t0, t1, PULSE_FS);
  if (!R) return;
  const h = bandpass(pos(R, G, B, PULSE_FS), 0.7, 3.5, PULSE_FS);
  const { std } = stats(h.subarray(Math.max(0, h.length - 8 * PULSE_FS)));
  const x = new Float64Array(h.length); for (let i = 0; i < h.length; i++) x[i] = h[i] / (std || 1);
  V.pulse = { t0, fs: PULSE_FS, x };
  const hr = V.m.hrSpec && V.m.snr > -3 ? V.m.hrSpec : 72, period = 60 / hr, minDist = Math.max(0.3, 0.6 * period);
  const tEnd = t0 + (x.length - 1) / PULSE_FS;
  for (const p of findPeaks(x, PULSE_FS, minDist)) {
    const tb = t0 + p / PULSE_FS;
    if (tb > tEnd - 0.5) continue;
    const prev = V.camBeats[V.camBeats.length - 1];
    if (prev && tb <= prev.t + minDist) continue;
    const ibi = prev ? tb - prev.t : null;
    let valid = false;
    if (ibi && ibi > 0.3 && ibi < 1.6 && V.motionEMA < 0.15) {
      const recent = V.camBeats.slice(-8).filter((b) => b.valid).map((b) => b.ibi);
      valid = recent.length < 4 || Math.abs(ibi - median(recent)) / median(recent) < 0.25;
    }
    V.camBeats.push({ t: tb, ibi, valid }); V.beatCount++;
    if (V.camBeats.length > 400) V.camBeats.splice(0, 100);
  }
}
function trackedPeak(spec) {
  const df = spec.freqs[1] - spec.freqs[0];
  const P = (f) => { const i = Math.round((f - spec.freqs[0]) / df); return i >= 0 && i < spec.power.length ? spec.power[i] : 0; };
  const prev = V.hrTrack?.f; let best = null, free = null;
  for (const f of spec.freqs) {
    if (f < 0.7 || f > 3.3) continue;
    const sc = P(f) + 0.5 * P(2 * f);
    if (!free || sc > free.sc) free = { f, sc };
    const prior = prev ? Math.exp(-0.5 * (((f - prev) * 60) / 10) ** 2) : 1;
    if (!best || sc * prior > best.sc) best = { f, sc: sc * prior };
  }
  if (!best) return null;
  const tr = V.hrTrack ||= { f: free.f, away: 0 };
  if (Math.abs(free.f - best.f) * 60 > 12) { if (++tr.away >= 4) { best = free; tr.away = 0; } } else tr.away = 0;
  tr.f = best.f;
  return peakOf(spec, best.f - 0.04, best.f + 0.04) || { f: best.f };
}
function analyseBreath(t1) {
  const doOne = (ser) => {
    if (ser.length < 60) return null;
    const t0 = Math.max(ser.t[0], t1 - 60);
    if (t1 - t0 < 12) return null;
    const raw = resample(ser.t, ser.v, t0, t1, 10); if (!raw) return null;
    const f = bandpass(detrend(raw), 0.07, 0.7, 10);
    const n = Math.min(f.length, 320);
    const spec = spectrum(f.subarray(f.length - n), 10, 0.05, 0.7, 0.0025);
    const pk = peakOf(spec, 0.05, 0.7); if (!pk) return null;
    const q = bandPower(spec, pk.f - 0.02, pk.f + 0.02) / (bandPower(spec, 0.05, 0.7) || 1);
    return { rate: pk.f * 60, quality: q };
  };
  const c = doOne(V.chest), h = doOne(V.head);
  const best = c && (!h || c.quality >= h.quality * 0.9) ? c : h;
  V.breath = best;
}
export function vitalsSlow(t) {
  const p = V.pulse;
  if (p) {
    const n = Math.min(p.x.length, 12 * PULSE_FS);
    if (n >= 6 * PULSE_FS) {
      const x = p.x.subarray(p.x.length - n), spec = spectrum(x, PULSE_FS, 0.7, 4.0, 0.0125);
      const pk = trackedPeak(spec) || peakOf(spec, 0.7, 3.3);
      if (pk) {
        const sig = bandPower(spec, pk.f - 0.1, pk.f + 0.1) + bandPower(spec, 2 * pk.f - 0.2, 2 * pk.f + 0.2), tot = bandPower(spec, 0.7, 4.0);
        V.m.snr = 10 * Math.log10(sig / Math.max(1e-12, tot - sig));
        V.hrSpec.push(t, pk.f * 60);
        V.m.hrSpec = median(V.hrSpec.v.slice(-5));
      }
    }
  }
  analyseBreath(t);
}
// is the heart reading trustworthy right now? (good SNR and a still-ish head)
export function hrGood() { return V.m.hrSpec && V.m.snr > -1.5 && V.motionEMA < 0.12 && V.geom; }
