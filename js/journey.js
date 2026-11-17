// The breathing script: a flat list of segments, and a cursor that walks it on the audio clock.
// Segment: { stage, kind: 'title'|'in'|'out'|'hold'|'free'|'end', dur, from, to, cue, sub, ... }
//   from/to = lung level 0 (empty) .. 1 (full). `bar` marks where the music restarts its count.
//   `open` holds last until the player releases (target = suggested length).

const ease = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * p));

const SIP_BEAT = 0.75;                     // 80 bpm
// each pattern is 12 beats = 9 s: [kind, beats, level it ends at, cue]
const SIP_PATTERNS = [
  [['in', 2, 0.6, 'sip'], ['in', 1, 1, 'sip'], ['hold', 1, 1, ''], ['out', 8, 0, 'long out']],
  [['in', 4, 1, 'in'], ['out', 8, 0, 'out']],
  [['in', 1, 0.4, 'sip'], ['in', 1, 0.7, 'sip'], ['in', 1, 1, 'sip'], ['hold', 1, 1, ''], ['out', 8, 0, 'long out']],
  [['in', 2, 1, 'in'], ['out', 2, 0.3, 'out'], ['in', 2, 1, 'in'], ['out', 6, 0, 'long out']],
  [['in', 2, 0.6, 'sip'], ['in', 1, 1, 'sip'], ['hold', 3, 1, 'float'], ['out', 6, 0, 'out']],
];
const SIP_ORDER = [0, 0, 1, 2, 0, 3, 4, 2, 3, 0];
export const BOX_ROUNDS = 8;
export const WIM_BREATHS = 30;
const WIM_BEAT = 60 / 128;
const WIM_TARGETS = [45, 60, 75];
const ROUND_NAMES = ['round one', 'round two', 'round three'];

export function buildJourney() {
  const S = [];
  const add = (o) => { S.push({ from: 0, to: 0, cue: '', sub: '', ...o }); return S[S.length - 1]; };

  add({ stage: 'sips', kind: 'title', dur: 6, cue: 'sips', sub: 'Small sips in, one long breath out. Follow the dotted line.' });
  SIP_ORDER.forEach((pi, k) => {
    let lvl = 0;
    SIP_PATTERNS[pi].forEach(([kind, beats, to, cue], j) => {
      add({ stage: 'sips', kind, dur: beats * SIP_BEAT, from: lvl, to, cue, bar: j === 0, pat: k, pi });
      lvl = to;
    });
  });

  add({ stage: 'box', kind: 'title', dur: 6, cue: 'box', sub: 'Four sides, four seconds each. In, hold, out, hold.' });
  for (let r = 0; r < BOX_ROUNDS; r++) {
    add({ stage: 'box', kind: 'in', dur: 4, from: 0, to: 1, cue: 'in', side: 0, round: r, bar: true });
    add({ stage: 'box', kind: 'hold', dur: 4, from: 1, to: 1, cue: 'hold', side: 1, round: r });
    add({ stage: 'box', kind: 'out', dur: 4, from: 1, to: 0, cue: 'out', side: 2, round: r });
    add({ stage: 'box', kind: 'hold', dur: 4, from: 0, to: 0, cue: 'hold', side: 3, round: r });
  }

  for (let r = 0; r < 3; r++) {
    add({ stage: 'wim', kind: 'title', dur: 7, cue: ROUND_NAMES[r], round: r,
      sub: r === 0 ? 'Thirty big breaths, then rest with empty lungs. Breathe in again whenever you like; there is nothing to beat.' : 'Thirty more, then rest empty again. Same rule: breathe in whenever you like.' });
    for (let n = 0; n < WIM_BREATHS; n++) {
      const last = n === WIM_BREATHS - 1;
      add({ stage: 'wim', kind: 'in', dur: 3 * WIM_BEAT, from: 0, to: 1, cue: 'in', round: r, n, pump: true, bar: true });
      if (!last) add({ stage: 'wim', kind: 'out', dur: 3 * WIM_BEAT, from: 1, to: 0, cue: 'out', round: r, n, pump: true });
    }
    add({ stage: 'wim', kind: 'out', dur: 8 * WIM_BEAT, from: 1, to: 0, cue: 'all the way out', round: r, drop: true, sub: 'Then rest empty for as long as it feels easy.' });
    add({ stage: 'wim', kind: 'hold', dur: 0, open: true, target: WIM_TARGETS[r], from: 0, to: 0, cue: 'hold', round: r,
      sub: 'Rest empty. Breathe in whenever you like: tap or press space when you do.' });
    add({ stage: 'wim', kind: 'in', dur: 8 * WIM_BEAT, from: 0, to: 1, cue: 'big breath in', round: r, rise: true });
    add({ stage: 'wim', kind: 'hold', dur: 32 * WIM_BEAT, from: 1, to: 1, cue: 'hold it', round: r, bloom: true, sub: 'Full. Let it glow.' });
    add({ stage: 'wim', kind: 'out', dur: 8 * WIM_BEAT, from: 1, to: 0, cue: 'let go', round: r, after: true });
    add({ stage: 'wim', kind: 'free', dur: 9, cue: '', round: r, sub: 'Breathe however you like.' });
  }

  add({ stage: 'land', kind: 'title', dur: 5, cue: 'landing', sub: 'In for four, out for eight.' });
  for (let k = 0; k < 5; k++) {
    add({ stage: 'land', kind: 'in', dur: 4, from: 0, to: 1, cue: 'in', k, bar: true });
    add({ stage: 'land', kind: 'out', dur: 8, from: 1, to: 0, cue: 'slow out', k });
  }
  add({ stage: 'land', kind: 'end', dur: 1e9, cue: '', sub: '' });
  S.forEach((s, i) => { s.i = i; });
  return S;
}

export class Journey {
  constructor(segs) { this.segs = segs; this.i = 0; this.t0 = 0; this.onSeg = null; this.holds = []; this.running = false; }
  get seg() { return this.segs[this.i]; }
  start(now, i = 0) { this.i = i; this.t0 = now; this.holds = []; this.running = true; this.onSeg?.(this.seg, now); }
  el(now) { return now - this.t0; }
  p(now) { const s = this.seg; return (now - this.t0) / (s.open ? s.target : s.dur); }
  _go(i, at) { this.i = Math.min(i, this.segs.length - 1); this.t0 = at; this.onSeg?.(this.seg, at); }
  _next(at) { const s = this.seg; if (s.open) this.holds.push({ round: s.round, dur: at - this.t0, target: s.target }); this._go(this.i + 1, at); }
  update(now) {
    for (let guard = 0; guard < 40; guard++) {
      const s = this.seg;
      if (s.kind === 'end') return;
      if (s.open) { if (now - this.t0 > s.target + 45) this._next(now); return; }
      if (now - this.t0 >= s.dur) this._next(this.t0 + s.dur); else return;
    }
    this.t0 = now;                                   // fell far behind (tab was asleep): resync
  }
  release(now) { if (this.seg.open && now - this.t0 > 2) { this._next(now); return true; } return false; }
  skip(now) {                                        // jump to the next title card
    let j = this.i + 1;
    while (j < this.segs.length - 1 && this.segs[j].kind !== 'title') j++;
    this._go(j, now);
  }
  jumpTo(stage, now) { const j = this.segs.findIndex((s) => s.stage === stage); if (j >= 0) this._go(j, now); }
  // the segment that will be playing at time t, if that is knowable (used to cue the music early)
  peek(t) {
    const s = this.seg;
    if (s.open || s.kind === 'end' || t - this.t0 < s.dur) return null;
    return { seg: this.segs[this.i + 1], start: this.t0 + s.dur };
  }
  static levelOf(s, el) {
    if (s.kind === 'in' || s.kind === 'out') return s.from + (s.to - s.from) * ease(el / s.dur);
    if (s.kind === 'hold') return s.from;
    return 0.45 - 0.3 * Math.cos((el * 2 * Math.PI) / 8);     // title / free: an easy 8 s breath
  }
  level(now) { return Journey.levelOf(this.seg, now - this.t0); }
  dir() { const k = this.seg.kind; return k === 'in' ? 1 : k === 'out' ? -1 : 0; }
  // every segment of this stage that overlaps [now, now + horizon]: [{ seg, dt }] (dt = start - now)
  upcoming(now, horizon) {
    const out = []; let i = this.i, t = this.t0 - now;
    const stage = this.seg.stage;
    while (i < this.segs.length && t < horizon) {
      const s = this.segs[i];
      if (s.stage !== stage || s.kind === 'end') break;
      out.push({ seg: s, dt: t });
      if (s.open) break;
      t += s.dur; i++;
    }
    return out;
  }
  // pacer lung level dt seconds from now, or null if that is past this stage or an open hold
  ahead(now, dt) {
    let i = this.i, t = now - this.t0 + dt;
    const stage = this.seg.stage;
    for (;;) {
      const s = this.segs[i];
      if (!s || s.stage !== stage || s.kind === 'end') return null;
      if (s.open) return t < 0.01 ? s.from : null;
      if (t < s.dur) return s.kind === 'title' ? 0 : Journey.levelOf(s, t);
      t -= s.dur; i++;
    }
  }
  totalFixed(stage) { return this.segs.filter((s) => s.stage === stage && !s.open && s.kind !== 'end').reduce((a, s) => a + s.dur, 0); }
}
