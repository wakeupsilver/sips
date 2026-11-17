// One breath signal for the games, whatever the source.
// The pacer (the script) always leads; the camera or the space bar colours it.
import { V } from './vitals.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const Br = {
  level: 0.5,        // lung level the games draw, 0 empty .. 1 full
  vel: 0,            // its speed, per second (+ = filling)
  pacer: 0.5,        // what the script asks for
  sensed: null,      // what the body is doing (null = no reading)
  conf: 0,           // how much we trust the reading, 0..1
  still: 1,          // stillness during holds, 0..1
  sync: 0.5,         // slow average of "moving the way the pacer asks"
  syncSum: 0, syncN: 0,
  source: 'pacer',   // 'pacer' | 'camera' | 'keys'
  key: false, keyLevel: 0, keyT: -99, keyDownT: -99, keyMode: false, bigInhale: 0,
};

// space bar or a finger on the screen: down = breathing in
export function press(down) {
  const t = performance.now() / 1000;
  if (down && !Br.key) Br.keyDownT = t;
  Br.key = down; Br.keyT = t;
}

export function updateBreath(dt, tPerf, pacer, pacerDir, camOn) {
  const B = Br; B.pacer = pacer;
  let sensed = null, conf = 0, dir = 0;

  // space bar: hold = breathe in
  B.keyLevel = clamp(B.keyLevel + (B.key ? dt / 1.3 : -dt / 2.2), 0, 1);
  // hold-to-breathe is a testing aid only (?keys=1): without a camera people simply follow the pacer
  if (B.key && B.allowKeys) { B.keyT = tPerf; if (!camOn || tPerf - B.keyDownT > 0.4) B.keyMode = true; }
  if (tPerf - B.keyT > 20) B.keyMode = false;
  const keysActive = B.keyMode;

  const b = V.bviz, fresh = camOn && b && V.geom && V.chest.length && tPerf - V.chest.t[V.chest.length - 1] < 0.5;
  if (fresh && !keysActive) {
    const amp = Math.sqrt(b.ms);                                  // typical chest travel, px
    conf = clamp((amp - 0.05) / 0.25, 0, 1) * (V.motionEMA < 0.25 ? 1 : 0.3);
    sensed = clamp(0.5 + (b.norm || 0) / 2.2, 0, 1);
    dir = b.dir;
    const thr = 0.15 * amp || 1e-6;
    B.still += (dt / 0.6) * (clamp(1 - Math.abs(b.vel) / (thr * 5), 0, 1) - B.still);
    B.bigInhale = b.dir > 0 && (b.norm || 0) > 0.9 ? B.bigInhale + dt : 0;
    B.source = 'camera';
  } else if (keysActive) {
    sensed = B.keyLevel; conf = 0.9; dir = B.key ? 1 : (B.keyLevel > 0.02 ? -1 : 0);
    B.still = 1; B.bigInhale = 0; B.source = 'keys';
  } else { B.still = 1; B.bigInhale = 0; B.source = 'pacer'; }

  B.sensed = sensed; B.conf += (dt / 0.5) * (conf - B.conf);
  if (pacerDir !== 0 && B.conf > 0.3 && dir !== 0) {
    const hit = dir === pacerDir ? 1 : 0;
    B.sync += (dt / 2.5) * (hit - B.sync); B.syncSum += hit * dt; B.syncN += dt;
  }
  // during in/out the body pulls the level; during holds the pacer owns it
  const w = sensed == null || pacerDir === 0 ? 0 : B.conf * (B.source === 'keys' ? 0.9 : 0.85);
  const target = pacer * (1 - w) + (sensed ?? pacer) * w;
  const prev = B.level;
  B.level += (1 - Math.exp(-dt / 0.07)) * (target - B.level);
  B.vel += (1 - Math.exp(-dt / 0.1)) * ((B.level - prev) / Math.max(dt, 1e-3) - B.vel);
}
