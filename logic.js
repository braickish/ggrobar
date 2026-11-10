// The game's rules with no drawing or sound, so they can be tested in Node.
// Positions are in tiles: x runs 0..COLS left to right, rows run 0 (bottom) .. ROWS-1 (Grandma's yard).

export const COLS = 9;
export const ROWS = 13;
export const HOME_ROW = ROWS - 1;
export const MARGIN = 3;                       // tiles of loop hidden off each side
export const LOOP = COLS + 2 * MARGIN;          // how far a mover travels before it comes round again

// How long each kind of mover is, in tiles.
export const KIND_W = { car: 1.5, plow: 2.6, van: 2.2, sled: 1.1, skater: 0.9 };
export const HAZARD_TYPES = new Set(['road', 'hill', 'rink']);

export const GRANDMA_HALF = 0.28;              // half of Grandma's width, for being hit
export const SLEIGH_W = 4.6;                   // reindeer plus sleigh
export const SLEIGH_SPEED = 13;                // tiles per second when it swoops
export const SANTA_WARN = 1.4;                 // seconds of shadow and bells before the swoop

// Points.
export const ROW_PTS = 10;
export const HOME_PTS = 100;
export const PICKUP_PTS = 25;
export const SET_BONUS = 150;                  // glasses + fruitcake + present in one crossing
export const COLD_PTS = 3;                     // per second left on the cold meter
export const NOG_TIME = 5;
export const NOG_DRIFT = 0.35;                 // chance each forward hop wobbles sideways

// A small seeded random number generator, so a lane layout can be repeated.
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// How hard round r (0, 1, 2, ...) is.
export function roundSetup(r, stageCount = 3) {
  const cycle = Math.floor(r / stageCount);
  return {
    stage: r % stageCount,
    cycle,
    speedMul: 1 + 0.15 * cycle + 0.04 * (r % stageCount),
    santaEvery: Math.max(4, 8 - 0.8 * r),
    coldTime: Math.max(28, 40 - 3 * cycle),
    snow: Math.min(260, 70 + 30 * r),
  };
}

export function widthOf(def) {
  return def.kind === 'floe' ? def.size : KIND_W[def.kind];
}

// Turn a stage's row list into live lanes with their movers spread evenly round the loop.
export function buildLanes(stage, speedMul = 1, rand = Math.random) {
  return stage.rows.map((def, row) => {
    const lane = { ...def, row, objs: [], v: 0, moving: 1, clock: rand() * 10 };
    if (!def.kind) return lane;
    const w = widthOf(def);
    const step = LOOP / def.count;
    const start = rand() * step;
    for (let i = 0; i < def.count; i++) {
      lane.objs.push({
        x: -MARGIN + start + i * step,
        w,
        thin: !!def.thin && i % 2 === 0,
        phase: rand() * 6,
        variant: Math.floor(rand() * 4),
      });
    }
    lane.v = def.dir * def.speed * speedMul;
    return lane;
  });
}

// Is the lane moving right now? Vans stop together to sing, then pull away again.
export function laneTarget(lane) {
  if (!lane.stops) return 1;
  const [go, halt] = lane.stops;
  return lane.clock % (go + halt) < go ? 1 : 0;
}

export function stepLanes(lanes, dt) {
  for (const lane of lanes) {
    if (!lane.objs.length) continue;
    lane.clock += dt;
    const target = laneTarget(lane);
    lane.moving += Math.sign(target - lane.moving) * Math.min(Math.abs(target - lane.moving), dt * 2.5);
    const dx = lane.v * lane.moving * dt;
    for (const o of lane.objs) {
      o.x += dx;
      if (o.x >= COLS + MARGIN) o.x -= LOOP;
      else if (o.x < -MARGIN) o.x += LOOP;
    }
  }
}

// Thin floes: solid, then cracking (still safe), then sunk for a moment.
export const THIN_CYCLE = 6;
export function floeState(o, time) {
  if (!o.thin) return 'solid';
  const t = (time + o.phase) % THIN_CYCLE;
  if (t < 3.6) return 'solid';
  if (t < 4.6) return 'cracking';
  return 'sunk';
}

// The mover hitting Grandma at x (center), if any. Edges are forgiven a little.
export function hazardAt(lane, x, half = GRANDMA_HALF) {
  for (const o of lane.objs) {
    if (x + half > o.x + 0.12 && x - half < o.x + o.w - 0.12) return o;
  }
  return null;
}

// The floe Grandma is standing on, if any.
export function floeUnder(lane, x, time) {
  for (const o of lane.objs) {
    if (floeState(o, time) === 'sunk') continue;
    if (x > o.x + 0.08 && x < o.x + o.w - 0.08) return o;
  }
  return null;
}

// Santa picks a row: usually one near Grandma, never the start or her yard.
export function pickSantaRow(grandmaRow, rand = Math.random) {
  if (rand() < 0.65) {
    const r = grandmaRow + Math.round(rand() * 4 - 2);
    if (r >= 1 && r <= HOME_ROW - 1) return r;
  }
  return 1 + Math.floor(rand() * (HOME_ROW - 1));
}

// Where the sleigh's front is at time t after the warning ends (dir 1 enters from the left).
export function sleighX(dir, t) {
  return dir > 0 ? -SLEIGH_W - 1 + SLEIGH_SPEED * t : COLS + 1 - SLEIGH_SPEED * t;
}

export function sleighDone(dir, t) {
  const x = sleighX(dir, t);
  return dir > 0 ? x > COLS + 1 : x + SLEIGH_W < -1;
}

export function sleighHits(dir, t, x, half = GRANDMA_HALF) {
  const left = sleighX(dir, t);
  return x + half > left + 0.2 && x - half < left + SLEIGH_W - 0.2;
}

// Grandma lands back on whole columns when she steps onto solid ground.
export function snapCol(x) {
  return Math.min(COLS - 1, Math.max(0, Math.floor(x))) + 0.5;
}

export function coldBonus(secondsLeft) {
  return Math.ceil(Math.max(0, secondsLeft)) * COLD_PTS;
}

// Rows where pickups can sit: solid rows that aren't the start or the yard.
export function pickupRows(stage) {
  return stage.rows
    .map((def, row) => ({ def, row }))
    .filter(({ def, row }) => row > 0 && row < HOME_ROW && def.type !== 'pond')
    .map(({ row }) => row);
}
