// The game's rules with no drawing or sound, so they can be tested in Node.
// Positions are in tiles: x runs 0..COLS left to right; rows count up from 0 (the party) to the yard.

export const COLS = 9;
export const MARGIN = 3;                       // tiles of loop hidden off each side
export const LOOP = COLS + 2 * MARGIN;          // how far a mover travels before it comes round again

// How long each kind of mover is, in tiles.
export const KIND_W = {
  car: 1.5, plow: 2.6, van: 2.2, sled: 1.1, skater: 0.9,
  bunny: 0.7, deer: 1.4, moose: 2.2, fox: 1.1,
  ebike: 1.2, carolers: 2.0, dogwalker: 1.8,
};
// How quickly a lane gets going again after a stop (bunnies hop off at once, vans pull away slowly).
export const KIND_ACCEL = { van: 2.5, bunny: 14, deer: 9, fox: 5, carolers: 3, dogwalker: 4 };
export const HAZARD_TYPES = new Set(['road', 'hill', 'rink', 'trail', 'sidewalk']);
export const SAFE_TYPES = new Set(['walk', 'forest', 'lawn', 'checkpoint', 'start', 'yard']);

export const GRANDMA_HALF = 0.28;              // half of Grandma's width, for being hit
export const SLEIGH_W = 4.6;                   // reindeer plus sleigh
export const SLEIGH_SPEED = 13;                // tiles per second when it swoops
export const SANTA_WARN = 1.4;                 // seconds of shadow and bells before the swoop

// Points.
export const ROW_PTS = 10;
export const CHECKPOINT_PTS = 100;
export const HOME_PTS = 300;
export const LIFE_PTS = 100;                   // per life left when she gets home
export const PICKUP_PTS = 25;
export const SET_BONUS = 150;                  // glasses + fruitcake + present in one section
export const COLD_PTS = 3;                     // per second left on the cold meter
// Eggnog: each glass adds one to the points multiplier (×2, ×3, ×4…), kept until she loses a life.
// It also makes her tipsy for a while, longer with every glass, and tipsier.
export const EXTRA_NOG = 0.5;                  // two glasses per section, plus this chance of a third
export const NOG_TIME = 12;                    // seconds of wobble from the first glass
export const NOG_TIME_EACH = 6;                // ...and this much more for every glass after it
export const nogTime = (glasses) => NOG_TIME + NOG_TIME_EACH * (glasses - 1);
export const nogDrift = (glasses) => Math.min(0.85, 0.5 + 0.12 * glasses);    // chance a step forward or back veers left or right

// Presents falling out of the sky (the neighborhood): a shadow grows for DROP_WARN seconds, then it lands.
export const DROP_WARN = 1.3;
export const DROP_STAY = 5;                    // a landed present stays this long, then pops...
export const DROP_PTS = 50;                    // ...for Grandma to grab, unless something runs it over first

// A small seeded random number generator, so a layout can be repeated.
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// Stitch the sections into one long path: the start, then each section (with a checkpoint row
// before every section after the first), then Grandma's yard. night 0 is the first Christmas Eve;
// each night after that is faster and the sleigh comes more often.
export function buildRoute(sections, night = 0) {
  const rows = [{ type: 'start', section: 0 }];
  const info = [];
  sections.forEach((sec, i) => {
    if (i > 0) rows.push({ type: 'checkpoint', name: sec.checkpoint, section: i });
    const startRow = rows.length - 1;          // the start row, or the checkpoint just added
    for (const def of sec.rows) {
      rows.push({ ...def, section: i, mul: (sec.speed ?? 1) * (1 + 0.15 * night) });
    }
    info.push({
      name: sec.name,
      checkpoint: sec.checkpoint ?? null,
      startRow,                                // the start or checkpoint row she respawns on
      endRow: rows.length - 1,
      coldTime: Math.round(sec.rows.length * 2.6 + 10),
      santaEvery: Math.max(3.5, sec.santaEvery * (1 - 0.1 * night)),
      raccoonsEvery: sec.raccoonsEvery ?? 0,
      presentsEvery: sec.presentsEvery ? Math.max(1.6, sec.presentsEvery * (1 - 0.1 * night)) : 0,
    });
  });
  rows.push({ type: 'yard', section: sections.length - 1 });
  for (const r of rows) if (r.trees || r.deco) r.blocked = treeCols(r.trees ?? r.deco);
  return { rows, sections: info, homeRow: rows.length - 1 };
}

// Columns with something in the way: a tree in the woods, or a snowman, bush or Christmas tree in a front yard.
export function treeCols(pattern) {
  const s = new Set();
  [...pattern].forEach((ch, i) => { if (ch !== '.' && ch !== ' ') s.add(i); });
  return s;
}

export function isBlocked(route, row, col) {
  const def = route.rows[row];
  return !!(def && def.blocked && def.blocked.has(col));
}

export function sectionOf(route, row) {
  return route.rows[Math.max(0, Math.min(route.rows.length - 1, row))].section;
}

export function widthOf(def) {
  return def.kind === 'floe' ? def.size : KIND_W[def.kind];
}

// Give every moving row its movers, spread evenly round the loop.
// (A road row with no kind is an empty lane: the quiet side of a neighborhood street.)
export function buildLanes(rows, rand = Math.random) {
  return rows.map((def, row) => {
    const lane = { ...def, row, objs: [], v: 0, moving: 1, clock: rand() * 10, accel: KIND_ACCEL[def.kind] ?? 2.5 };
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
    lane.v = def.dir * def.speed * (def.mul ?? 1);
    return lane;
  });
}

// Is the lane moving right now? Some lanes stop and start together: carolers stop to sing,
// bunnies hop in bursts, deer freeze and then dash.
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
    lane.moving += Math.sign(target - lane.moving) * Math.min(Math.abs(target - lane.moving), dt * lane.accel);
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

// Was that a head-on hit (the mover's front reached her: splat) or did she walk into its side or back
// (she just bounces off)? At the moment they first touch, the front has only just reached her; if it's
// already well past her, she must have stepped into the side.
export const HEAD_ON_DEPTH = 0.35;
export function hitKind(o, dir, x, half = GRANDMA_HALF) {
  const depth = dir > 0 ? (o.x + o.w - 0.12) - (x - half) : (x + half) - (o.x + 0.12);
  return depth < HEAD_ON_DEPTH ? 'front' : 'side';
}

// Raccoons: a trash can on a lawn rattles (eyes peeking out) for RACCOON_WARN seconds, tips over, and a
// raccoon dashes out along the row. Pick an upright can just ahead of Grandma, if there is one.
export const RACCOON_WARN = 1.2;
export const RACCOON_SPEED = 5;               // tiles per second
export const RACCOON_W = 0.9;
export function pickRaccoonCan(route, gRow, tipped, rand = Math.random) {
  const cans = [];
  for (let row = gRow; row <= gRow + 4; row++) {
    const def = route.rows[row];
    if (!def || !def.deco) continue;
    [...def.deco].forEach((ch, col) => { if (ch === 'C' && !tipped.has(row * 100 + col)) cans.push({ row, col }); });
  }
  return cans.length ? cans[Math.floor(rand() * cans.length)] : null;
}

// Has something in this lane run over the present sitting in column col?
export function presentRunOver(lane, col) {
  return !!(lane && lane.objs.length && lane.type !== 'pond' && hazardAt(lane, col + 0.5, 0.3));
}

// The floe Grandma is standing on, if any.
export function floeUnder(lane, x, time) {
  for (const o of lane.objs) {
    if (floeState(o, time) === 'sunk') continue;
    if (x > o.x + 0.08 && x < o.x + o.w - 0.08) return o;
  }
  return null;
}

// Santa picks a row he can swoop through (rows lo..hi, skipping ones canUse rejects):
// usually one near Grandma.
export function pickSantaRow(grandmaRow, lo, hi, canUse = () => true, rand = Math.random) {
  if (rand() < 0.65) {
    for (let tries = 0; tries < 6; tries++) {
      const r = grandmaRow + Math.round(rand() * 4 - 2);
      if (r >= lo && r <= hi && canUse(r)) return r;
    }
  }
  const options = [];
  for (let r = lo; r <= hi; r++) if (canUse(r)) options.push(r);
  return options.length ? options[Math.floor(rand() * options.length)] : null;
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

// Places a pickup can sit in a section: solid rows inside it, not on a tree.
export function pickupSpots(route, section) {
  const spots = [];
  route.rows.forEach((def, row) => {
    if (def.section !== section) return;
    if (def.type === 'pond' || def.type === 'start' || def.type === 'checkpoint' || def.type === 'yard') return;
    for (let col = 0; col < COLS; col++) if (!isBlocked(route, row, col)) spots.push({ row, col });
  });
  return spots;
}

// Can Grandma get from the start to the yard, walking round the trees? (Movers are ignored:
// they always leave gaps, which the tests check separately.)
export function routeIsWalkable(route) {
  const seen = new Set();
  const key = (r, c) => r * 100 + c;
  const queue = [];
  for (let c = 0; c < COLS; c++) if (!isBlocked(route, 0, c)) { queue.push([0, c]); seen.add(key(0, c)); }
  while (queue.length) {
    const [r, c] = queue.shift();
    if (r === route.homeRow) return true;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr > route.homeRow || nc < 0 || nc >= COLS) continue;
      if (isBlocked(route, nr, nc) || seen.has(key(nr, nc))) continue;
      seen.add(key(nr, nc));
      queue.push([nr, nc]);
    }
  }
  return false;
}

// When she bounces off something she twirls, then stumbles back one more row: away from where she was
// heading (back down if she was stepping sideways).
export function stumbleDir(fromRow, toRow) {
  return toRow < fromRow ? 'up' : 'down';
}

// Where to drop the next present: near Grandma (mostly just ahead of her), inside the section, on open
// ground, and not where one is already falling. Returns { row, col } or null.
export function pickDropSpot(route, section, gRow, gCol, taken = [], rand = Math.random) {
  for (let tries = 0; tries < 12; tries++) {
    const row = gRow + Math.floor(rand() * 4) - 1;            // one behind to two ahead
    const col = Math.max(0, Math.min(COLS - 1, gCol + Math.floor(rand() * 5) - 2));
    const def = route.rows[row];
    if (!def || def.section !== section) continue;
    if (def.type === 'start' || def.type === 'checkpoint' || def.type === 'yard' || def.type === 'pond') continue;
    if (isBlocked(route, row, col)) continue;
    if (taken.some((d) => d.row === row && d.col === col)) continue;
    return { row, col };
  }
  return null;
}
