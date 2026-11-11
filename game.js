import { SECTIONS } from './stages.js?v=202611111613';
import * as L from './logic.js?v=202611111613';
import * as Art from './art.js?v=202611111613';
import { Sound } from './sound.js?v=202611111613';

const T = Art.TILE;
const W = L.COLS * T;                           // 540
// How much of the walk you see: 910 units (a bit over 15 rows) on wide screens. On a phone held upright the
// board fills the whole width, and the view is as tall as the screen allows (more or fewer rows).
const H_WIDE = 910, H_MIN = 640, H_MAX = 1300;
let H = H_WIDE;
const SKY = 130;                                // the night sky and cottage above Grandma's yard
const HOP_TIME = 0.17;                          // one toddling step
const SPIN_TIME = 0.5;                          // the twirl when she bounces off something
const STUMBLE_TIME = 0.34;                      // ...then a slow, wobbly step backwards
const GRAN_SCALE = 1.05;                       // about as tall as the carolers and dog walkers (a bit shorter)
const GRAN_FROM_BOTTOM = 3.5;                   // the camera keeps her about this many rows up the screen
const DEATH_TIME = 1.7;
const HOME_TIME = 2.6;
const BANNER_TIME = 2.4;

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const stageEl = $('stage');

// World coordinates: row r covers y from -(r + 1) * T to -r * T, so the walk goes up the screen.
const rowTop = (row) => -(row + 1) * T;
const rowFeet = (row) => rowTop(row) + T - 10;     // she stands in the middle of the lane, like the cars
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Ease in and out, so each step starts gently and settles into place.
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

const load = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// ---- State ----
let state = 'title';          // title | playing | dying | home | won | over
let night = 0;                // 0 = the first Christmas Eve; each next one is harder
let route = L.buildRoute(SECTIONS, 0);
let lanes = L.buildLanes(route.rows);
let reached = 0;              // the furthest section whose checkpoint she's reached (where she restarts)
let cam = 0;                  // the row at the bottom of the screen (fractional while it glides)
let time = 0;
let walkTime = 0;
let score = 0;
let best = load('ggrobar-best', 0);
let lives = 3;
let cold = 40;
let nog = 0;                  // glasses of eggnog since she last lost a life: points ×(nog + 1)
let tipsy = 0;                // seconds of wobbling left
let drops = [];               // presents falling out of the sky
let coon = null;              // a raccoon: { row, col, phase: 'rattle' | 'run', t, x, dir }
let coonNext = 4;
let tipped = new Set();       // trash cans knocked over (row * 100 + col)
let maxRow = 0;
let pickups = [];
let floaters = [];
let particles = [];
let snow = [];
let banner = null;
let death = null;             // { kind, by, x, row, t }
let homeT = 0;
let invincible = false;
let paused = false;            // debug only: stop the clock to look at a moment

const gran = {
  x: 4.5, row: 0, fromX: 4.5, fromRow: 0, hop: 1, facing: 'up', step: 1,
  prevX: 4.5, prevRow: 0, prevFloe: null,      // where this step started, to bounce back to
  bouncing: false, spinT: 0, spinDir: 1,
  hopTime: HOP_TIME, stumble: null, stumbling: false,   // stumble: the way she'll stagger after a bounce
};
let queued = null;
let santa = { phase: 'idle', next: 5, t: 0, row: 1, dir: 1 };

const camMax = () => route.homeRow - (H - SKY) / T + 1;     // where the house fills the top of the screen
const camFor = (row) => clamp(row - GRAN_FROM_BOTTOM, 0, camMax());
const section = () => route.sections[reached];

// ---- Starting, checkpoints, lives ----
function newGame() {
  night = 0;
  score = 0;
  lives = 3;
  startNight();
}

function startNight() {
  nog = 0;
  maxRow = 0;
  tipped = new Set();
  route = L.buildRoute(SECTIONS, night);
  lanes = L.buildLanes(route.rows);
  reached = 0;
  walkTime = 0;
  resetRing();
  makeSnow(90 + night * 40);
  placePickups();
  respawn();
  cam = camFor(0);
  santa = { phase: 'idle', next: 5, t: 0, row: 1, dir: 1 };
  banner = { text: night ? `Christmas Eve #${night + 1}` : 'Christmas Eve', sub: route.sections[0].name, t: 0 };
  setState('playing');
  updateHud();
}

// Back to the last checkpoint (or the party) after losing a life.
function respawn() {
  const row = section().startRow;
  Object.assign(gran, { x: 4.5, row, fromX: 4.5, fromRow: row, hop: 1, facing: 'up', bouncing: false, spinT: 0, hopTime: HOP_TIME, stumble: null, stumbling: false });
  queued = null;
  cold = section().coldTime;
  nog = 0;
  tipsy = 0;
  drops = [];
  coon = null;
  coonNext = 3;
  maxRow = Math.max(maxRow, row);
  death = null;
  cam = Math.min(cam, camFor(row));
}

function placePickups() {
  pickups = [];
  route.sections.forEach((sec, i) => {
    const spots = L.pickupSpots(route, i);
    const take = () => spots.splice(Math.floor(Math.random() * spots.length), 1)[0];
    for (const kind of ['glasses', 'fruitcake', 'present']) pickups.push({ kind, section: i, ...take(), got: false });
    // eggnog: one in each half of the section, and sometimes a third anywhere
    const mid = (sec.startRow + sec.endRow) / 2;
    for (const half of [(sp) => sp.row < mid, (sp) => sp.row >= mid]) {
      const idx = spots.map((sp, j) => (half(sp) ? j : -1)).filter((j) => j >= 0);
      if (idx.length) pickups.push({ kind: 'eggnog', section: i, ...spots.splice(idx[Math.floor(Math.random() * idx.length)], 1)[0], got: false });
    }
    if (Math.random() < L.EXTRA_NOG) pickups.push({ kind: 'eggnog', section: i, ...take(), got: false });
  });
}

function setState(s) {
  state = s;
  $('title-panel').classList.toggle('hidden', s !== 'title');
  $('over-panel').classList.toggle('hidden', s !== 'over');
  $('win-panel').classList.toggle('hidden', s !== 'won');
}

const HIT_WORDS = {
  car: 'Splat!', plow: 'Plowed!', van: 'Splat!', sled: 'Wheee… oof!', skater: 'Whoops!',
  bunny: 'Bunny bonk!', deer: 'Oh deer!', moose: 'Moose on the loose!', fox: 'Outfoxed!',
  raccoon: 'Trash panda!', ebike: 'Ding ding… oof!', carolers: 'Fa-la-la-flat!', dogwalker: 'Tangled in the leash!', present: 'Special delivery!',
};

function loseLife(kind, by) {
  if (state !== 'playing' || invincible) return;
  const x = currentX(), row = currentRow();
  death = { kind, by, x, row, t: 0 };
  setState('dying');
  if (kind === 'squash') Sound.splat();
  else if (kind === 'splash') Sound.splash();
  else Sound.freeze();
  const words = kind === 'squash' ? (by === 'sleigh' ? 'Run over by a reindeer!' : HIT_WORDS[by] ?? 'Splat!') : kind === 'splash' ? 'Sploosh!' : 'Brrr!';
  floater(x * T, rowTop(row) - 6, words, '#ffffff', by === 'sleigh' ? 24 : 28);
  if (by === 'sleigh') floater(x * T, rowTop(row) + T + 26, 'Ho ho… oh no', C_GOLD, 18, 0.25);
}

function afterDeath() {
  lives--;
  updateHud();
  if (lives <= 0) {
    Sound.gameOver();
    gameOver();
    return;
  }
  Sound.lifeLost();
  respawn();
  santa.phase = 'idle';
  santa.next = Math.max(santa.next, 2.5);
  setState('playing');
}

function saveBest() {
  const isBest = score > best;
  if (isBest) { best = score; save('ggrobar-best', best); }
  return isBest;
}

function gameOver() {
  const isBest = saveBest();
  $('final-score').textContent = score;
  $('final-place').textContent = route.sections[L.sectionOf(route, gran.row)].name;
  $('new-best').classList.toggle('hidden', !isBest);
  updateHud();
  setState('over');
}

function reachCheckpoint(i) {
  reached = i;
  const pts = L.CHECKPOINT_PTS + L.coldBonus(cold);
  addScore(pts, gran.x * T, rowTop(gran.row) - 6, `Checkpoint! +${pts * mult()}`);
  cold = section().coldTime;
  Sound.allSet();
  banner = { text: section().checkpoint, sub: `Next: ${section().name}`, t: 0 };
  sparkle(gran.x * T, rowTop(gran.row) + 20, '#ffd27a');
}

function reachHome() {
  const pts = L.HOME_PTS + L.coldBonus(cold) + lives * L.LIFE_PTS;
  addScore(pts, gran.x * T, rowTop(route.homeRow) + 10, `Home! +${pts * mult()}`);
  Sound.home();
  homeT = 0;
  setState('home');
  const door = rowTop(route.homeRow) - 40;
  for (let i = 0; i < 60; i++) {
    particles.push({ x: W / 2 + rand(-40, 40), y: door, vx: rand(-4, 4), vy: rand(-6, -1), life: rand(0.9, 1.8), t: 0, c: ['#ffd25a', '#ff6a5a', '#6ad08a', '#6ab4ff'][i % 4], r: rand(2, 4), star: i % 2 === 0 });
  }
}

function showWin() {
  const isBest = saveBest();
  $('win-score').textContent = score;
  const m = Math.floor(walkTime / 60), s = Math.floor(walkTime % 60);
  $('win-time').textContent = `${m}:${String(s).padStart(2, '0')}`;
  $('win-lives').textContent = lives;
  $('win-best').classList.toggle('hidden', !isBest);
  $('win-title').textContent = night ? `Home again! (Christmas Eve #${night + 1})` : 'Home for Christmas!';
  updateHud();
  setState('won');
}

function nextNight() {
  night++;
  startNight();
}

// ---- Score ----
const mult = () => nog + 1;
function addScore(pts, x, y, text) {
  const m = mult();
  score += pts * m;
  if (text !== null) floater(x, y, text ?? `+${pts * m}`, m > 1 ? '#ffe9a8' : '#ffffff', 20);
  updateHud();
}

// ---- Moving Grandma ----
const currentX = () => gran.fromX + (gran.x - gran.fromX) * ease(Math.min(1, gran.hop));
const currentRow = () => (gran.hop < 0.5 ? gran.fromRow : gran.row);

function tryMove(dir) {
  if (state !== 'playing') return;
  if (gran.bouncing || gran.stumble || gran.stumbling) return;   // she's busy staggering
  if (gran.hop < 1) { queued = dir; return; }
  hop(dir);
}

// stumble: she's staggering backwards after bouncing off something (slower, no turning round)
function hop(dir, stumble = false) {
  const fromRow = gran.row;
  let row = fromRow, x = gran.x;
  if (dir === 'up') row = Math.min(route.homeRow, row + 1);
  if (dir === 'down') row = Math.max(0, row - 1);
  if (dir === 'left') x -= 1;
  if (dir === 'right') x += 1;
  if (!stumble) gran.facing = dir;
  // She can step back a little, but not off the bottom of the screen.
  if ((row < fromRow && row < cam - 0.05) || (row === fromRow && dir !== 'left' && dir !== 'right')) { bump(); return false; }
  const toPond = route.rows[row].type === 'pond';
  // Eggnog makes her wander a little on forward/back steps (but never into a tree).
  if (!stumble && tipsy > 0 && (dir === 'up' || dir === 'down') && Math.random() < L.nogDrift(nog)) {
    const first = Math.random() < 0.5 ? -1 : 1;
    for (const dx of [first, -first]) {
      const nx = x + dx;
      if (nx < 0.5 || nx > L.COLS - 0.5) continue;                 // not off the edge
      if (!toPond && L.isBlocked(route, row, Math.floor(nx))) continue;
      x = nx;
      gran.facing = dx < 0 ? 'left' : 'right';
      break;
    }
  }
  if (!toPond) x = L.snapCol(x);
  else if (route.rows[fromRow].type !== 'pond' && (dir === 'left' || dir === 'right')) x = clamp(x, 0.5, L.COLS - 0.5);
  if (!toPond && L.isBlocked(route, row, Math.floor(x))) { bump(); return false; }
  if (row === fromRow && x === gran.x) return false;
  gran.prevX = gran.x; gran.prevRow = fromRow;
  const floe = route.rows[fromRow].type === 'pond' ? L.floeUnder(lanes[fromRow], gran.x, time) : null;
  gran.prevFloe = floe ? { o: floe, off: gran.x - floe.x } : null;
  gran.fromX = gran.x; gran.fromRow = fromRow;
  gran.x = x; gran.row = row;
  gran.hop = 0;
  gran.hopTime = stumble ? STUMBLE_TIME : HOP_TIME;
  gran.stumbling = stumble;
  gran.step = -gran.step;
  Sound.hop();
  return true;
}

// Walked into a tree (or the bottom of the screen): a little bump, no harm done.
let bumpT = 0;
function bump() {
  if (bumpT > 0) return;
  bumpT = 0.18;
  Sound.bump();
}

function landed() {
  const row = gran.row;
  if (row > maxRow) {
    const pts = L.ROW_PTS * (row - maxRow);
    score += pts * mult();
    updateHud();
    floater(gran.x * T + 34, rowTop(row) + 4, `+${pts * mult()}`, mult() > 1 ? '#ffe9a8' : 'rgba(255,255,255,0.85)', 13);
    maxRow = row;
  }
  const col = Math.floor(gran.x);
  grabDrop(row, col);
  for (const p of pickups) {
    if (p.got || p.row !== row || p.col !== col) continue;
    p.got = true;
    if (p.kind === 'eggnog') {
      nog++;
      tipsy += L.nogTime(nog);
      Sound.nog();
      floater(gran.x * T, rowTop(row) - 8, nog === 1 ? 'Eggnog! Double points' : `More eggnog! Points ×${mult()}`, '#ffe9a8', 20);
    } else {
      Sound.pickup();
      addScore(L.PICKUP_PTS, gran.x * T, rowTop(row) - 8, `${NAMES[p.kind]} +${L.PICKUP_PTS * mult()}`);
      const set = pickups.filter((q) => q.section === p.section && q.kind !== 'eggnog');
      if (set.every((q) => q.got)) {
        Sound.allSet();
        addScore(L.SET_BONUS, gran.x * T, rowTop(row) - 50, `All set! +${L.SET_BONUS * mult()}`);
      }
    }
    sparkle((p.col + 0.5) * T, rowTop(row) + T / 2, '#ffe9a8');
  }
  const def = route.rows[row];
  if (def.type === 'checkpoint' && def.section > reached) reachCheckpoint(def.section);
  if (row === route.homeRow) reachHome();
}
const NAMES = { glasses: 'Reading glasses', fruitcake: 'Fruitcake', present: 'Present' };
const C_GOLD = '#ffd27a';

// ---- Santa ----
const santaCanUse = (row) => {
  const t = route.rows[row]?.type;
  return t && t !== 'start' && t !== 'checkpoint' && t !== 'yard';
};
function updateSanta(dt) {
  if (santa.phase === 'idle') {
    santa.next -= dt;
    if (santa.next <= 0 && state === 'playing') {
      const lo = Math.ceil(cam) + 1, hi = Math.min(route.homeRow - 1, Math.floor(cam + H / T) - 2);
      const row = L.pickSantaRow(gran.row, lo, hi, santaCanUse);
      if (row === null) { santa.next = 1; return; }
      const dir = Math.random() < 0.5 ? 1 : -1;
      const sec = route.sections[L.sectionOf(route, gran.row)];
      if (sec.presents) {
        // first he flies over the other way, too high up to see (you only hear the bells), and drops a
        // present near her; then he turns round
        const spot = L.pickDropSpot(route, L.sectionOf(route, gran.row), gran.row, Math.floor(gran.x), drops);
        Object.assign(santa, { phase: 'fly', t: 0, row, dir: -dir, drop: spot });
      } else {
        Object.assign(santa, { phase: 'warn', t: 0, row, dir });
      }
      Sound.sleighBells();
    }
  } else if (santa.phase === 'fly') {
    santa.t += dt;
    const d = santa.drop;
    if (d && (santa.dir > 0 ? L.flySackX(1, santa.t) >= d.col + 0.5 : L.flySackX(-1, santa.t) <= d.col + 0.5)) {
      santa.drop = null;
      if (!L.isBlocked(route, d.row, d.col) && !drops.some((q) => q.row === d.row && q.col === d.col)) {
        drops.push({ ...d, t: 0, variant: Math.floor(Math.random() * 4), landed: false, dir: santa.dir });
        Sound.fall();
      }
    }
    if (L.flyDone(santa.dir, santa.t)) { santa.phase = 'turn'; santa.t = 0; }
  } else if (santa.phase === 'turn') {
    // out of sight, turning round; then he comes back low along a row near her
    santa.t += dt;
    if (santa.t >= 0.5) {
      const lo = Math.ceil(cam) + 1, hi = Math.min(route.homeRow - 1, Math.floor(cam + H / T) - 2);
      const row = L.pickSantaRow(gran.row, lo, hi, santaCanUse);
      if (row === null) { santa.phase = 'idle'; santa.next = 2; return; }
      Object.assign(santa, { phase: 'warn', t: 0, row, dir: -santa.dir });
      Sound.sleighBells();
    }
  } else if (santa.phase === 'warn') {
    santa.t += dt;
    if (santa.t >= L.SANTA_WARN) { santa.phase = 'swoop'; santa.t = 0; Sound.whoosh(); Sound.ho(); }
  } else if (santa.phase === 'swoop') {
    santa.t += dt;
    if (Math.random() < 30 * dt) {
      const sx = L.sleighX(santa.dir, santa.t) + (santa.dir > 0 ? 0 : L.SLEIGH_W);
      particles.push({ x: sx * T, y: rowTop(santa.row) + rand(10, 40), vx: -santa.dir * rand(0.5, 2), vy: rand(-0.5, 0.5), life: rand(0.4, 0.9), t: 0, c: '#fff6d0', r: rand(1.5, 3), star: true });
    }
    if (state === 'playing' && currentRow() === santa.row && L.sleighHits(santa.dir, santa.t, currentX())) {
      loseLife('squash', 'sleigh');
    }
    if (L.sleighDone(santa.dir, santa.t)) {
      santa.phase = 'idle';
      const sec = route.sections[L.sectionOf(route, gran.row)];
      santa.next = sec.santaEvery * rand(0.8, 1.2);
    }
  }
}

// ---- Update ----
function update(dt) {
  time += dt;
  L.stepLanes(lanes, dt);
  for (let r = Math.max(0, Math.floor(cam)); r < Math.min(lanes.length, cam + 16); r++) {
    const lane = lanes[r];
    if (lane.kind === 'van' || lane.kind === 'carolers') {
      const singing = L.laneTarget(lane) === 0;
      if (singing && !lane.wasSinging) Sound.sing();
      lane.wasSinging = singing;
    }
  }
  updateSnow(dt);
  updateParticles(dt);
  if (banner) { banner.t += dt; if (banner.t > BANNER_TIME) banner = null; }
  if (bumpT > 0) bumpT = Math.max(0, bumpT - dt);

  if (state === 'playing' || state === 'dying') walkTime += dt;
  if (state === 'playing') {
    cold -= dt;
    if (tipsy > 0) tipsy = Math.max(0, tipsy - dt);
    if (gran.hop < 1) {
      gran.hop += dt / gran.hopTime;
      if (gran.hop >= 1) {
        gran.hop = 1; gran.fromX = gran.x; gran.fromRow = gran.row; gran.bouncing = false; gran.stumbling = false; gran.hopTime = HOP_TIME;
        landed();
      }
    }
    // After a bounce she finishes her twirl, then staggers back one more row.
    if (state === 'playing' && gran.hop >= 1 && gran.stumble && gran.spinT <= 0.05) {
      const d = gran.stumble;
      gran.stumble = null;
      if (!hop(d, true)) gran.spinT = 0;
    }
    if (state === 'playing' && gran.hop >= 1 && queued) { const d = queued; queued = null; hop(d); }
    if (state === 'playing') updateDrops(dt);
    if (state === 'playing') updateRaccoon(dt);
    if (state === 'playing') checkGround(dt);
    if (state === 'playing' && cold <= 0) loseLife('freeze');
    if (gran.spinT > 0) gran.spinT = Math.max(0, gran.spinT - dt);
    updateColdBar();
  }
  // The camera glides forward to keep up with her, and never goes back on its own.
  const target = camFor(gran.row);
  if (target > cam) cam += (target - cam) * Math.min(1, dt * 5);
  updateSanta(dt);
  if (state === 'dying') {
    death.t += dt;
    if (death.kind === 'splash') {
      const lane = lanes[death.row];
      if (lane.type === 'pond') death.x += lane.v * lane.moving * dt * 0.5;
    }
    if (death.t >= DEATH_TIME) afterDeath();
  }
  if (state === 'home') {
    homeT += dt;
    if (homeT >= HOME_TIME) showWin();
  }
}

function checkGround(dt) {
  const row = currentRow();
  const lane = lanes[row];
  const x = currentX();
  if (L.HAZARD_TYPES.has(lane.type)) {
    if (gran.bouncing || invincible) return;
    const o = L.hazardAt(lane, x);
    if (o) {
      const vehicle = lane.kind === 'car' || lane.kind === 'van' || lane.kind === 'plow';
      if (vehicle) Sound.honk();
      if (L.hitKind(o, lane.dir, x) === 'front') loseLife('squash', lane.kind);
      else bounceOff(lane);
    }
  } else if (lane.type === 'pond' && gran.hop >= 1) {
    const f = L.floeUnder(lane, gran.x, time);
    if (!f) { loseLife('splash'); return; }
    if (L.floeState(f, time) === 'cracking' && !f.creaked) { f.creaked = true; Sound.crack(); }
    if (L.floeState(f, time) === 'solid') f.creaked = false;
    gran.x += lane.v * lane.moving * dt;
    gran.fromX = gran.x;
    if (gran.x < 0.15 || gran.x > L.COLS - 0.15) loseLife('splash');
  }
}

// She walked into the side or back of something: she bounces back to where she stepped from,
// twirling the way it was going. No harm done.
function bounceOff(lane) {
  const h = Math.min(1, gran.hop);
  // she twirls and then stumbles one more row back (but not again if she bounced off something mid-stumble)
  gran.stumble = gran.stumbling ? null : L.stumbleDir(gran.prevRow, gran.row);
  gran.stumbling = false;
  gran.hopTime = HOP_TIME;
  let backX = gran.prevX;
  if (route.rows[gran.prevRow].type === 'pond' && gran.prevFloe) backX = gran.prevFloe.o.x + gran.prevFloe.off;
  // reverse the step from exactly where she is (the easing is symmetric, so 1 - h picks up seamlessly)
  gran.fromX = gran.x; gran.fromRow = gran.row;
  gran.x = backX; gran.row = gran.prevRow;
  gran.hop = 1 - h;
  gran.bouncing = true;
  gran.spinT = SPIN_TIME;
  gran.spinDir = lane.dir;
  queued = null;
  Sound.boing();
  const animal = ['bunny', 'deer', 'moose', 'fox', 'dogwalker'].includes(lane.kind);
  floater(currentX() * T, rowTop(gran.fromRow) - 4, animal ? 'Boop!' : 'Bonk!', '#ffffff', 22);
}

// ---- Presents Santa drops as he flies over (sections with presents; see updateSanta) ----
function updateDrops(dt) {
  for (const d of drops) {
    d.t += dt;
    if (d.landed && !d.gone) {
      // run over by a bike or car: it's gone
      if (L.presentRunOver(lanes[d.row], d.col)) {
        d.gone = true;
        poof(d);
        if (d.row >= cam && d.row <= cam + H / T) Sound.crack();
      } else if (d.t >= L.DROP_WARN + L.DROP_STAY) { d.gone = true; poof(d); }
    }
    if (!d.landed && d.t >= L.DROP_WARN) {
      d.landed = true;
      Sound.thud();
      const cx = (d.col + 0.5) * T, cy = rowTop(d.row) + T - 8;
      for (let i = 0; i < 10; i++) particles.push({ x: cx + rand(-20, 20), y: cy, vx: rand(-2, 2), vy: rand(-2.5, -0.5), life: rand(0.3, 0.6), t: 0, c: '#ffffff', r: rand(1.5, 3.5) });
      if (currentRow() === d.row && Math.abs(currentX() - (d.col + 0.5)) < 0.55) { d.gone = true; loseLife('squash', 'present'); }
    }
  }
  drops = drops.filter((d) => !d.gone);
}
function poof(d) { sparkle((d.col + 0.5) * T, rowTop(d.row) + T / 2, WRAP_SPARK[d.variant]); }

// She stepped onto a present that landed: it's hers.
function grabDrop(row, col) {
  const d = drops.find((q) => q.landed && !q.gone && q.row === row && q.col === col);
  if (!d) return;
  d.gone = true;
  Sound.pickup();
  poof(d);
  addScore(L.DROP_PTS, gran.x * T, rowTop(row) - 8, `Present! +${L.DROP_PTS * mult()}`);
  drops = drops.filter((q) => !q.gone);
}
const WRAP_SPARK = ['#ff6a5a', '#6ad08a', '#6ab4ff', '#ffd25a'];

function drawDropShadows() {
  for (const d of drops) {
    const k = Math.min(1, d.t / L.DROP_WARN);
    const cx = (d.col + 0.5) * T, cy = rowTop(d.row) + T - 10;
    ctx.fillStyle = `rgba(30,30,70,${0.12 + 0.3 * k})`;
    Art.ell(ctx, cx, cy, 6 + 18 * k, 2 + 5 * k);
    ctx.fill();
  }
}
function drawDrops(landed) {
  for (const d of drops) {
    if (d.landed !== landed) continue;
    // it drops in from high above (Santa's out of sight), carried on a little the way he was going
    const fall = 0.4;                                        // it comes into view for the last bit
    const left = L.DROP_WARN - d.t, k = Math.max(0, left / fall);
    let y = rowTop(d.row) - 4, sq = 1;
    if (left > fall) continue;
    if (left > 0) y -= k ** 2 * 520;
    else { const b = d.t - L.DROP_WARN; sq = 1 - 0.25 * Math.exp(-b * 9) * Math.cos(b * 30); }
    const cx = d.col * T + T / 2 - (d.dir ?? 0) * k * T * 0.8;
    ctx.save();
    ctx.translate(cx, y + T); ctx.scale(1 / sq, sq); ctx.translate(-cx, -(y + T));
    if (left > 0) { ctx.translate(cx, y + T / 2); ctx.rotate(left * 4); ctx.translate(-cx, -(y + T / 2)); }
    Art.blit(ctx, Art.fallingPresent(d.variant), cx - T / 2, y);
    ctx.restore();
  }
}

// ---- Raccoons in the trash cans (sections with raccoonsEvery) ----
function updateRaccoon(dt) {
  const sec = route.sections[L.sectionOf(route, gran.row)];
  if (!coon) {
    if (!sec.raccoonsEvery) return;
    coonNext -= dt;
    if (coonNext > 0) return;
    coonNext = sec.raccoonsEvery * rand(0.7, 1.3);
    const can = L.pickRaccoonCan(route, gran.row, tipped);
    if (!can) { coonNext = 1.5; return; }
    coon = { ...can, phase: 'rattle', t: 0, dir: can.col + 0.5 < currentX() ? 1 : -1 };
    if (Math.random() < 0.35) coon.dir = -coon.dir;
    Sound.rattle();
    return;
  }
  coon.t += dt;
  if (coon.phase === 'rattle') {
    if (coon.t >= L.RACCOON_WARN) {
      tipped.add(coon.row * 100 + coon.col);
      coon.phase = 'run';
      coon.x = coon.col + 0.5 - L.RACCOON_W / 2;
      Sound.clatter();
      const cx = (coon.col + 0.5) * T, cy = rowTop(coon.row) + T - 12;
      for (let i = 0; i < 8; i++) particles.push({ x: cx + rand(-16, 16), y: cy, vx: rand(-2, 2), vy: rand(-2, -0.5), life: rand(0.3, 0.6), t: 0, c: '#ffffff', r: rand(1.5, 3) });
    }
    return;
  }
  coon.x += coon.dir * L.RACCOON_SPEED * dt;
  // it grabs any present it runs past
  for (const d of drops) {
    if (d.landed && !d.gone && d.row === coon.row && Math.abs(d.col + 0.5 - (coon.x + L.RACCOON_W / 2)) < 0.4) {
      d.gone = true; poof(d);
      floater((d.col + 0.5) * T, rowTop(d.row) - 4, 'Mine!', '#ffffff', 18);
    }
  }
  drops = drops.filter((d) => !d.gone);
  if (state === 'playing' && !invincible && currentRow() === coon.row && Math.abs(currentX() - (coon.x + L.RACCOON_W / 2)) < L.GRANDMA_HALF + 0.3) {
    loseLife('squash', 'raccoon');
  }
  if (coon.x > L.COLS + 1 || coon.x + L.RACCOON_W < -1) coon = null;
}

function drawRaccoon(row) {
  if (!coon || coon.row !== row || coon.phase !== 'run') return;
  Art.blit(ctx, Art.raccoon(Math.floor(time * 12) % 2), coon.x * T, rowTop(row) - Math.abs(Math.sin(time * 18)) * 3, coon.dir < 0);
}

// ---- Effects ----
function floater(x, y, text, color, size = 20, delay = 0) {
  floaters.push({ x: clamp(x, 80, W - 80), y, text, color, size, t: -delay });
}
function sparkle(x, y, c) {
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, s = rand(1, 3);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: rand(0.4, 0.8), t: 0, c, r: rand(1.5, 3), star: true });
  }
}
function updateParticles(dt) {
  const k = dt * 60;                              // particle speeds are per 1/60 s
  for (const p of particles) { p.t += dt; p.x += p.vx * k; p.y += p.vy * k; p.vy += 0.06 * k; }
  particles = particles.filter((p) => p.t < p.life);
  for (const f of floaters) f.t += dt;
  floaters = floaters.filter((f) => f.t < 1.4);
}

// Snow falls in screen space, so it doesn't scroll with the walk.
function makeSnow(n) {
  snow = [];
  for (let i = 0; i < Math.min(n, 280); i++) {
    const z = Math.random();
    snow.push({ x: Math.random() * W, y: Math.random() * H, z, r: 0.8 + z * 2.4, sway: Math.random() * 6 });
  }
}
function updateSnow(dt) {
  for (const s of snow) {
    s.y += (18 + s.z * 40) * dt;
    s.x += Math.sin(time * 0.8 + s.sway) * (6 + s.z * 10) * dt - 6 * dt;
    if (s.y > H + 5) { s.y = -5; s.x = Math.random() * W; }
    if (s.x < -5) s.x = W + 5;
  }
}

// ---- Drawing ----
let scale = 1, dpr = 1;
let warm = [];                 // sprites still to draw ahead of time
let grain = null, sky = null;
// The ground lives in a ring of RING row-sized slots on one canvas. Row r always uses slot r % RING, so
// as she walks on, new rows are painted into the slots of rows that have scrolled away, a frame or two
// before they're needed, and each frame copies at most two runs of slots to the screen, pixel for pixel.
// (Drawing ~17 separate scaled row pictures every frame halved the frame rate on slow phones.)
const RING = 32;
let ring = null;
const ringRow = new Array(RING).fill(-1);       // which row each slot holds
const slotOf = (row) => ((row % RING) + RING) % RING;
const rowPx = () => Math.round(T * scale * dpr);

function resetRing() { ring = null; ringRow.fill(-1); }

function paintRow(row) {
  if (!ring) {
    ring = document.createElement('canvas');
    ring.width = Math.round(W * scale * dpr);
    ring.height = RING * rowPx();
  }
  const slot = slotOf(row);
  const g = ring.getContext('2d');
  const k = scale * dpr;
  g.setTransform(1, 0, 0, 1, 0, (RING - 1 - slot) * rowPx());
  g.clearRect(0, 0, ring.width, rowPx());
  g.scale(k, k);
  g.save();
  g.beginPath(); g.rect(0, 0, W, T); g.clip();
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.fillStyle = '#dfe6f3'; g.fillRect(0, 0, W, T);     // snow under the wobbly edges, so no dark slivers show
  const def = route.rows[row];
  Art.drawRow(g, def, 0, W, route.rows[row + 1]?.type ?? 'sky', route.rows[row - 1]?.type ?? 'none', row + 1);
  g.restore();
  ringRow[slot] = row;
}
const hasRow = (row) => ringRow[slotOf(row)] === row;

function drawGround(lo, hi) {
  for (let r = lo; r <= hi; r++) if (!hasRow(r)) paintRow(r);
  // get one upcoming row ready each frame
  for (let r = hi + 1; r <= Math.min(route.homeRow, lo + RING - 1); r++) if (!hasRow(r)) { paintRow(r); break; }
  const px = rowPx();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  let top = hi;
  while (top >= lo) {
    // a run of rows whose slots sit next to each other (it breaks where the ring wraps round)
    let bottom = top;
    while (bottom - 1 >= lo && slotOf(bottom - 1) === slotOf(bottom) - 1) bottom--;
    const sy = (RING - 1 - slotOf(top)) * px;
    const dy = Math.round((rowTop(top) + H + cam * T) * scale * dpr);
    const h = (top - bottom + 1) * px;
    ctx.drawImage(ring, 0, sy, ring.width, h, 0, dy, ring.width, h);
    top = bottom - 1;
  }
  ctx.restore();
}

// Resizing clears the canvas and every cached drawing, so only do it when the size really changes, and draw
// straight away afterwards (otherwise the board flashes black for a frame and stutters while sprites redraw).
function resize() {
  const upright = window.innerHeight > window.innerWidth * 1.2;
  stageEl.classList.toggle('fill', upright);
  const box = stageEl.getBoundingClientRect();
  const r = { width: box.width, height: box.height - parseFloat(getComputedStyle(stageEl).paddingBottom || 0) };
  // full-width phone boards are big, so they draw at up to 2× pixel density (still crisp) to keep the frame rate
  const d = Math.min(window.devicePixelRatio || 1, upright ? 2 : 2.5);
  const h = upright ? clamp((W * r.height) / r.width, H_MIN, H_MAX) : H_WIDE;
  const gutter = upright ? 0 : 16;
  let s = Math.min((r.width - gutter) / W, (r.height - (upright ? 0 : 4)) / h);
  // round so a row is a whole number of pixels, which keeps the ground copy pixel-exact
  s = Math.max(1, Math.floor(T * s * d)) / (T * d);
  if (s === scale && d === dpr && h === H && grain) return;
  scale = s; dpr = d; H = h;
  cam = Math.min(cam, Math.max(0, camMax()));
  makeSnow(snow.length || 90);
  canvas.style.width = `${Math.floor(W * scale)}px`;
  canvas.style.height = `${Math.floor(H * scale)}px`;
  document.documentElement.style.setProperty('--board-w', `${Math.floor(W * scale)}px`);
  canvas.width = Math.floor(W * scale * dpr);
  canvas.height = Math.floor(H * scale * dpr);
  Art.setScale(scale * dpr);
  resetRing();
  warm = Art.warmTasks();
  grain = offscreen(W, H, (g) => Art.drawGrain(g, W, H));
  sky = offscreen(W, SKY, (g) => Art.drawSkyBand(g, W, SKY, 1));
  draw();
}

function offscreen(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * scale * dpr); c.height = Math.ceil(h * scale * dpr);
  const g = c.getContext('2d');
  g.scale(scale * dpr, scale * dpr);
  g.lineJoin = 'round'; g.lineCap = 'round';
  draw(g);
  return c;
}

function visibleRows() {
  const lo = Math.max(0, Math.floor(cam) - 1);
  const hi = Math.min(route.homeRow, Math.ceil(cam + H / T) + 1);
  return [lo, hi];
}

function draw() {
  const t0 = performance.now();
  while (warm.length && performance.now() - t0 < 4) warm.shift()();
  Art.setTime(time);
  const [lo, hi] = visibleRows();

  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  ctx.translate(0, H + cam * T);
  const shake = bumpT > 0 ? Math.sin(bumpT * 90) * 2 : 0;

  drawGround(lo, hi);

  // The sky and cottage, beyond her yard.
  const skyY = rowTop(route.homeRow) - SKY;
  if (skyY + SKY + cam * T + H > 0) {
    ctx.drawImage(sky, 0, skyY, W, SKY);
    Art.cottage(ctx, W / 2, rowTop(route.homeRow) - 2, time);
  }

  drawSantaWarning();
  drawDropShadows();

  for (const p of pickups) {
    if (p.got || p.row < lo || p.row > hi) continue;
    const bob = Math.sin(time * 3 + p.col) * 2;
    Art.blit(ctx, Art.pickup(p.kind), p.col * T, rowTop(p.row) + bob);
  }
  drawDrops(true);

  // Things standing in the rows, from the top down, so lower things overlap higher ones.
  const gRow = state === 'dying' || state === 'won' || ((state === 'over') && death) ? -1 : currentRow();
  for (let row = hi; row >= lo; row--) {
    const def = route.rows[row];
    if (def.blocked && !def.scene) {
      for (const col of def.blocked) {
        const ch = def.deco?.[col];
        if (ch === 'C') { drawCan(row, col); continue; }
        const pic = def.deco ? Art.yardDeco(ch, (col + row) % 3) : Art.tree((col + row) % 3);
        Art.blit(ctx, pic, col * T, rowTop(row) - Art.RISE);
      }
    }
    if (def.scene) drawScene(row, def.scene);
    drawLane(lanes[row]);
    drawRaccoon(row);
    if (row === gRow) drawGrandma(shake);
    if (death && death.row === row) drawDeath();
  }

  drawDrops(false);
  drawSantaNose();
  drawSleigh();

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
    if (p.star) { Art.star(ctx, p.x, p.y, p.r * 1.4, 4); ctx.fillStyle = p.c; ctx.fill(); }
    else { Art.circ(ctx, p.x, p.y, p.r); ctx.fillStyle = p.c; ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  drawFloaters();

  // Screen-space layers: the dark beyond the next stretch of road, falling snow, paper grain, banners.
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  const ahead = clamp((camMax() - cam) / 2, 0, 1);
  if (ahead > 0) {
    const fog = ctx.createLinearGradient(0, 0, 0, 120);
    fog.addColorStop(0, `rgba(20,27,63,${0.85 * ahead})`);
    fog.addColorStop(1, 'rgba(20,27,63,0)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, W, 120);
  }
  drawSnow();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (grain) ctx.drawImage(grain, 0, 0);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  drawBanner();
}

function drawSnow() {
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 1.3;
  for (const s of snow) {
    ctx.globalAlpha = 0.45 + s.z * 0.5;
    if (s.z > 0.8) {
      const r = s.r * 1.8, a = time * 0.8 + s.sway;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const ang = a + (i * Math.PI) / 3;
        ctx.moveTo(s.x - Math.cos(ang) * r, s.y - Math.sin(ang) * r);
        ctx.lineTo(s.x + Math.cos(ang) * r, s.y + Math.sin(ang) * r);
      }
      ctx.stroke();
    } else {
      Art.circ(ctx, s.x, s.y, s.r);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawLane(lane) {
  if (!lane.objs.length) return;
  const flip = lane.dir < 0;
  for (const o of lane.objs) {
    if (o.x > L.COLS + 0.5 || o.x + o.w < -0.5) continue;
    const x = o.x * T;
    const k = lane.kind;
    // a little bounce: cars on their springs, sleds over bumps
    const bouncy = { car: 1.2, plow: 1.2, van: 1.2, sled: 2.5, skater: 1, fox: 1.5, deer: 2, moose: 1, ebike: 1.5, carolers: 1, dogwalker: 1 }[k] ?? 0;
    const bounce = Math.abs(Math.sin(time * (k === 'sled' ? 9 : 6) + o.phase * 3)) * bouncy * lane.moving;
    const y = rowTop(lane.row) - bounce;
    if (k === 'floe') {
      const st = L.floeState(o, time);
      ctx.save();
      if (st === 'sunk') ctx.globalAlpha = 0.18;
      if (st === 'cracking') ctx.translate(Math.sin(time * 40) * 1.2, 0);
      Art.blit(ctx, Art.floe(o.w, o.variant % 3, o.thin), x, y);
      ctx.restore();
      continue;
    }
    const going = lane.moving > 0.4;
    if (k === 'car') Art.blit(ctx, Art.car(o.variant), x, y, flip);
    else if (k === 'plow') {
      Art.blit(ctx, Art.plow(), x, y, flip);
      // spinning beacon and slush spray off the blade
      const bx = flip ? x + o.w * T - 113 : x + 113;
      Art.glow(ctx, bx, y + 5, 22, 'rgba(255,170,60,0.9)', 0.4 + 0.6 * Math.max(0, Math.sin(time * 9)));
      if (Math.random() < 0.4 * lane.moving) {
        const fx = flip ? x : x + o.w * T;
        particles.push({ x: fx, y: y + rand(30, 50), vx: lane.dir * rand(1, 3), vy: rand(-2.5, -0.5), life: rand(0.3, 0.6), t: 0, c: '#e8eef8', r: rand(1.5, 3.5) });
      }
    } else if (k === 'van') {
      Art.blit(ctx, Art.van(o.variant), x, y, flip);
      if (lane.moving < 0.3) singingNotes(x, y, o.w);
    } else if (k === 'carolers') {
      Art.blit(ctx, Art.carolers(o.variant, going ? Math.floor(time * 4 + o.phase) % 2 : 0), x, y, flip);
      if (lane.moving < 0.3) singingNotes(x, y, o.w);
    } else if (k === 'ebike') Art.blit(ctx, Art.ebike(o.variant), x, y, flip);
    else if (k === 'dogwalker') Art.blit(ctx, Art.dogwalker(o.variant, going ? Math.floor(time * 5 + o.phase) % 2 : 0), x, y, flip);
    else if (k === 'sled') Art.blit(ctx, Art.sled(o.variant), x, y, flip);
    else if (k === 'skater') Art.blit(ctx, Art.skater(o.variant, Math.floor(time * 3 + o.phase) % 2), x, y, flip);
    else if (k === 'bunny') Art.blit(ctx, Art.bunny(going ? 1 : 0), x, y - (going ? Math.abs(Math.sin(time * 18)) * 4 : 0), flip);
    else if (k === 'deer') Art.blit(ctx, Art.deer(going ? Math.floor(time * 10) % 2 : 0), x, y, flip);
    else if (k === 'fox') Art.blit(ctx, Art.fox(going ? Math.floor(time * 7 + o.phase) % 2 : 0), x, y, flip);
    else if (k === 'moose') Art.blit(ctx, Art.moose(Math.floor(time * 2.5 + o.phase) % 2), x, y, flip);
  }
}

// A trash can: upright, rattling with eyes peeking out, or knocked over.
// A stop's scenery (the party porch, the corner lamppost, the warming hut, the neighbor's porch). Tall
// parts reach up over the rows behind them, so they turn see-through while Grandma is back there.
function drawScene(row, name) {
  Art.sceneLive(ctx, name, 0, rowTop(row), time);
  const gr = gran.row, gx = gran.x;
  for (const p of Art.scene(name)) {
    const behind = gr > row && gr <= row + Math.ceil(p.rise / T) && gx > p.col && gx < p.col + p.pic.lw / T;
    if (behind) ctx.globalAlpha = 0.45;
    Art.blit(ctx, p.pic, p.col * T, rowTop(row) - p.rise, p.flip);
    ctx.globalAlpha = 1;
  }
}

function drawCan(row, col) {
  const x = col * T, y = rowTop(row) - Art.RISE;
  if (tipped.has(row * 100 + col)) { Art.blit(ctx, Art.trashTipped(), x, y); return; }
  if (coon && coon.phase === 'rattle' && coon.row === row && coon.col === col) {
    const k = coon.t / L.RACCOON_WARN;
    const cx = x + T / 2, base = rowTop(row) + T - 8;
    ctx.save();
    ctx.translate(cx, base); ctx.rotate(Math.sin(time * 40) * 0.08 * (0.4 + k)); ctx.translate(-cx, -base);
    Art.blit(ctx, Art.trashCan(), x, y);
    // the lid lifts and eyes peek out
    if (Math.sin(time * 9) > 0) Art.blit(ctx, Art.trashEyes(), cx - 12, rowTop(row) + 18 - 4 * k);
    ctx.restore();
    return;
  }
  Art.blit(ctx, Art.trashCan(), x, y);
}

function singingNotes(x, y, w) {
  ctx.fillStyle = '#fff6d0';
  ctx.font = '700 20px Gaegu, sans-serif';
  for (let i = 0; i < 2; i++) {
    const n = (time * 0.6 + i * 0.5) % 1;
    ctx.globalAlpha = 1 - n;
    ctx.fillText(i ? '♫' : '♪', x + w * T * (0.3 + i * 0.3) + Math.sin(n * 6) * 4, y + 6 - n * 26);
  }
  ctx.globalAlpha = 1;
}

function drawGrandma(shake = 0) {
  const x = currentX() * T + shake;
  const y = rowFeet(gran.fromRow) + (rowFeet(gran.row) - rowFeet(gran.fromRow)) * ease(Math.min(1, gran.hop));
  let tilt = tipsy > 0 ? Math.sin(time * 5) * Math.min(0.22, 0.08 + 0.04 * nog) : 0;
  // staggering backwards: lean back and wobble
  if (gran.stumbling) tilt += Math.sin(Math.PI * gran.hop) * 0.35 * (gran.step > 0 ? 1 : -1);
  else if (gran.stumble) tilt += Math.sin(time * 22) * 0.08;
  const shiver = state === 'playing' && cold < 8 ? 2.5 : 0;
  if (state === 'home') {
    // she toddles up the path and in through the door
    const k = Math.min(1, homeT / 1.3);
    const hx = x + (W / 2 - x) * k;
    const hy = y - 34 * k;
    if (k < 1) Art.grandma(ctx, hx, hy, { facing: 'up', hop: (homeT * 3) % 1, step: Math.floor(homeT * 3) % 2 ? 1 : -1, scale: GRAN_SCALE * (1 - 0.25 * k) });
    return;
  }
  const lane = lanes[gran.row];
  if (lane.type === 'pond' && gran.hop >= 1) {
    const f = L.floeUnder(lane, gran.x, time);
    if (f && L.floeState(f, time) === 'cracking') tilt += Math.sin(time * 30) * 0.06;
  }
  const turn = gran.spinT > 0 ? gran.spinDir * Math.PI * 2 * (1 - (gran.spinT / SPIN_TIME) ** 2) : 0;
  Art.grandma(ctx, x, y, { facing: gran.facing, hop: gran.hop < 1 ? gran.hop : 0, step: gran.step, tilt, shiver, scale: GRAN_SCALE, spin: turn });
}

function drawDeath() {
  const x = death.x * T, y = rowFeet(death.row);
  ctx.save();
  ctx.translate(x, y); ctx.scale(1.2, 1.2); ctx.translate(-x, -y);
  if (death.kind === 'squash') {
    Art.pancake(ctx, x, y, death.t, death.by);
    if (death.by === 'present') Art.blit(ctx, Art.fallingPresent(0), x - T / 2, y - T + 4);
  }
  else if (death.kind === 'splash') {
    if (death.t < 0.3) {
      for (let i = 0; i < 3; i++) particles.push({ x: x + rand(-14, 14), y: y - 10, vx: rand(-2, 2), vy: rand(-4, -2), life: 0.5, t: 0, c: '#bfe3f7', r: rand(2, 4) });
    }
    Art.iceCube(ctx, x, y, death.t);
  } else Art.snowman(ctx, x, y, death.t);
  ctx.restore();
}

// The warning: a red glow at the edge of the row the sleigh will come from, getting brighter and
// spreading into the row (it's the lead reindeer's nose, just out of sight). During the swoop, the nose
// lights up the row ahead of the sleigh.
function drawSantaWarning() {
  if (santa.phase !== 'warn' && santa.phase !== 'swoop') return;
  const top = rowTop(santa.row), mid = top + T / 2;
  const dir = santa.dir;
  ctx.save();
  if (santa.phase === 'warn') {
    const k = santa.t / L.SANTA_WARN;
    const blink = 0.75 + 0.25 * Math.sin(time * 16);
    const edge = dir > 0 ? 0 : W;
    const reach = W * (0.3 + 0.7 * k);
    const gr = ctx.createLinearGradient(edge, 0, edge + dir * reach, 0);
    gr.addColorStop(0, `rgba(255,50,40,${(0.22 + 0.33 * k) * blink})`);
    gr.addColorStop(1, 'rgba(255,50,40,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(Math.min(edge, edge + dir * reach), top, reach, T);
  } else {
    const sx = L.sleighX(dir, santa.t) * T;
    ctx.fillStyle = 'rgba(15,15,45,0.2)';
    Art.ell(ctx, sx + (L.SLEIGH_W * T) / 2, mid + 8, (L.SLEIGH_W * T) / 2, 10);
    ctx.fill();
    const nx = sleighNoseX(sx);
    const gr = ctx.createLinearGradient(nx, 0, nx + dir * 220, 0);
    gr.addColorStop(0, 'rgba(255,50,40,0.4)');
    gr.addColorStop(1, 'rgba(255,50,40,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(Math.min(nx, nx + dir * 220), top, 220, T);
  }
  ctx.restore();
}
// The nose itself, peeking in at the edge of the row, drawn above the trees and everything else.
function drawSantaNose() {
  if (santa.phase !== 'warn') return;
  const k = santa.t / L.SANTA_WARN;
  const blink = 0.7 + 0.3 * Math.sin(time * 16);
  const nx = (santa.dir > 0 ? 0 : W) + santa.dir * (-4 + 18 * k);
  const ny = rowTop(santa.row) + T / 2 - 8;
  Art.glow(ctx, nx, ny, 46 + 50 * k, 'rgba(255,40,30,1)', blink);
  Art.glow(ctx, nx, ny, 22 + 10 * k, 'rgba(255,40,30,1)', blink);
  const r = 6 + 3 * k;
  Art.circ(ctx, nx, ny, r); Art.paint(ctx, '#ff2a1f', Art.INK, 2);
  Art.circ(ctx, nx - r * 0.3, ny - r * 0.35, r * 0.35); Art.paint(ctx, `rgba(255,225,215,${blink})`, null);
}
const sleighNoseX = (sx) => (santa.dir > 0 ? sx + Art.SLEIGH_NOSE.x : sx + L.SLEIGH_W * T - Art.SLEIGH_NOSE.x);

function drawSleigh() {
  if (santa.phase !== 'swoop') return;
  const sx = L.sleighX(santa.dir, santa.t) * T;
  const y = rowTop(santa.row) - 22 + Math.sin(santa.t * 12) * 3;
  Art.blit(ctx, Art.sleigh(Math.floor(santa.t * 10) % 2), sx, y, santa.dir < 0);
  const nx = sleighNoseX(sx), ny = y + Art.SLEIGH_NOSE.y;
  Art.glow(ctx, nx, ny, 38, 'rgba(255,60,40,0.9)', 0.9);
  Art.glow(ctx, nx, ny, 9, 'rgba(255,230,210,1)', 1);
}

function drawFloaters() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of floaters) {
    if (f.t < 0) continue;
    const k = f.t / 1.4;
    ctx.globalAlpha = Math.min(1, (1 - k) * 2.5);
    ctx.font = `700 ${Math.round(f.size * 1.2)}px Gaegu, sans-serif`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(30,30,70,0.85)';
    const y = f.y - k * 34;
    ctx.strokeText(f.text, f.x, y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, y);
  }
  ctx.globalAlpha = 1;
}

function drawBanner() {
  if (!banner) return;
  const k = banner.t / BANNER_TIME;
  ctx.globalAlpha = Math.min(1, banner.t * 4, (1 - k) * 4);
  const y = H * 0.4;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 40px "Mountains of Christmas", serif';
  const wBox = Math.min(W - 30, Math.max(300, ctx.measureText(banner.text).width + 60));
  ctx.fillStyle = 'rgba(25,30,70,0.6)';
  Art.rr(ctx, W / 2 - wBox / 2, y - 50, wBox, 100, 22); ctx.fill();
  ctx.fillStyle = '#fff6d8';
  ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(30,30,70,0.9)';
  ctx.strokeText(banner.text, W / 2, y - 14);
  ctx.fillText(banner.text, W / 2, y - 14);
  ctx.font = '700 28px Gaegu, sans-serif';
  ctx.fillStyle = '#ffd27a';
  ctx.fillText(banner.sub, W / 2, y + 26);
  ctx.globalAlpha = 1;
}

// ---- HUD ----
const livesEl = $('lives');
let headUrl = null;
function updateHud() {
  $('score').textContent = score;
  $('best').textContent = Math.max(best, score);
  $('night').textContent = night + 1;
  if (!headUrl) headUrl = Art.headIcon(26);
  const want = Math.max(0, lives);
  if (livesEl.childElementCount !== want) {
    livesEl.replaceChildren(...Array.from({ length: want }, () => {
      const img = new Image(); img.src = headUrl; img.alt = ''; return img;
    }));
    livesEl.setAttribute('aria-label', `${want} ${want === 1 ? 'life' : 'lives'} left`);
  }
}
const coldFill = $('cold-fill');
function updateColdBar() {
  const k = Math.max(0, cold / section().coldTime);
  coldFill.style.transform = `scaleX(${k})`;
  coldFill.classList.toggle('low', k < 0.25);
  const nogEl = $('nog');
  nogEl.classList.toggle('hidden', nog <= 0);
  nogEl.classList.toggle('tipsy', tipsy > 0);
  const label = `🥛 ×${mult()}`;
  if (nogEl.textContent !== label) nogEl.textContent = label;
}

// ---- Input ----
const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
};
window.addEventListener('keydown', (e) => {
  const dir = KEYS[e.key];
  if (dir) {
    e.preventDefault();
    Sound.unlock();
    tryMove(dir);
  } else if ((e.key === 'Enter' || e.key === ' ') && (state === 'title' || state === 'over')) {
    e.preventDefault();
    Sound.unlock();
    newGame();
  } else if ((e.key === 'Enter' || e.key === ' ') && state === 'won') {
    e.preventDefault();
    Sound.unlock();
    nextNight();
  }
});

// Swipe anywhere, or tap toward where you want her to go.
let touch = null;
// A swipe moves her as soon as the finger has gone SWIPE_PX in one direction (no waiting for it to lift);
// a tap (lifted without swiping) moves her toward where you tapped.
const SWIPE_PX = 14;
const canSteer = () => state === 'playing' || state === 'dying' || state === 'home';
stageEl.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, .panel')) return;
  Sound.unlock();
  touch = { x: e.clientX, y: e.clientY, id: e.pointerId, swiped: false };
});
stageEl.addEventListener('pointermove', (e) => {
  if (!touch || touch.id !== e.pointerId || touch.swiped) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
  if (Math.hypot(dx, dy) < SWIPE_PX) return;
  touch.swiped = true;
  if (canSteer()) tryMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
});
stageEl.addEventListener('pointerup', (e) => {
  if (!touch || touch.id !== e.pointerId) return;
  const swiped = touch.swiped;
  touch = null;
  if (swiped || !canSteer()) return;
  // a tap: which way is it from Grandma?
  const r = canvas.getBoundingClientRect();
  const gx = r.left + currentX() * T * scale;
  const gy = r.top + (rowFeet(currentRow()) - 28 + H + cam * T) * scale;
  const tx = e.clientX - gx, ty = e.clientY - gy;
  if (Math.hypot(tx, ty) < 10) return;
  tryMove(Math.abs(tx) > Math.abs(ty) ? (tx > 0 ? 'right' : 'left') : (ty > 0 ? 'down' : 'up'));
});
stageEl.addEventListener('pointercancel', () => { touch = null; });
document.addEventListener('touchmove', (e) => { if (state !== 'title' && state !== 'over' && state !== 'won') e.preventDefault(); }, { passive: false });

const go = (fn) => () => { Sound.unlock(); fn(); };
$('start-btn').addEventListener('click', go(newGame));
$('again-btn').addEventListener('click', go(newGame));
$('restart-btn').addEventListener('click', go(newGame));
$('next-btn').addEventListener('click', go(nextNight));
$('fresh-btn').addEventListener('click', go(newGame));
const muteBtn = $('mute-btn');
const showMute = () => { muteBtn.textContent = Sound.muted ? '🔇' : '🔊'; muteBtn.setAttribute('aria-label', Sound.muted ? 'Sound off' : 'Sound on'); };
muteBtn.addEventListener('click', () => { Sound.unlock(); Sound.toggleMute(); showMute(); });
showMute();

// ---- Loop ----
let last = performance.now();
const STEP = 1 / 60;
// Every frame moves the game on by exactly the time since the last one (in steps of at most 1/60 s), so a
// 120 Hz screen gets smooth motion on every frame instead of a fixed 60 Hz tick that judders.
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused && dt > 0) {
    const n = Math.max(1, Math.ceil(dt / STEP - 0.05));
    for (let i = 0; i < n; i++) update(dt / n);
  }
  draw();
  requestAnimationFrame(frame);
}

new ResizeObserver(resize).observe(stageEl);
resize();
makeSnow(90);
updateHud();
requestAnimationFrame(frame);
// The row pictures include handwritten names, so redraw them once the font has arrived.
if (document.fonts) document.fonts.ready.then(() => { headUrl = null; livesEl.replaceChildren(); resetRing(); updateHud(); });

window.ggrobarStarted = true;   // tells the page's safety net the game loaded

// Test hooks, only with ?debug in the address.
if (DEBUG) {
  window.ggrobar = {
    stats: () => ({
      state, night, score, lives, cold: +cold.toFixed(1), row: gran.row, x: +gran.x.toFixed(2), cam: +cam.toFixed(2),
      reached, section: route.sections[L.sectionOf(route, gran.row)].name, homeRow: route.homeRow, santa: santa.phase,
      nogsOnRoute: pickups.filter((q) => q.kind === 'eggnog').map((q) => q.section).join(''),
      nog, tipsy: +tipsy.toFixed(1), stumble: gran.stumble, stumbling: gran.stumbling, drops: drops.length,
    }),
    route: () => route.rows.map((r) => r.type),
    lane: (row) => ({ dir: lanes[row].dir, kind: lanes[row].kind, objs: lanes[row].objs.map((o) => ({ x: o.x, w: o.w })) }),
    start: newGame,
    move: tryMove,
    nextNight,
    warp(row, x = 4.5) { Object.assign(gran, { row, fromRow: row, x, fromX: x, prevRow: row, prevX: x, hop: 1 }); cam = camFor(row); maxRow = Math.max(maxRow, row); },
    santa(row, dir = 1) { santa = { phase: 'warn', t: 0, row, dir, next: 0 }; Sound.sleighBells(); },
    santaSwoop(t = 0.4) { santa.phase = 'swoop'; santa.t = t; },
    santaFly() { santa.phase = 'idle'; santa.next = 0; },
    invincible(on = true) { invincible = on; },
    nog(n = 1) { nog += n; tipsy += L.nogTime(nog); },
    raccoon(row, col, dir = 1) { coon = { row, col, phase: 'rattle', t: 0, dir }; },
    drop(row, col) { drops.push({ row, col, t: 0, variant: 0, landed: false }); },
    kill(kind = 'squash', by = 'car') { loseLife(kind, by); },
    pause(on = true) { paused = on; },
    step(seconds) { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) update(1 / 60); },
  };
}
