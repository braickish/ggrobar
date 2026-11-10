import { STAGES } from './stages.js';
import * as L from './logic.js';
import * as Art from './art.js';
import { Sound } from './sound.js';

const T = Art.TILE;
const TOP = 130;                                // the sky and cottage strip above the rows
const W = L.COLS * T;                           // 540
const H = TOP + L.ROWS * T;                     // 910
const HOP_TIME = 0.17;                          // one toddling step
const GRAN_SCALE = 0.8;
const DEATH_TIME = 1.7;
const HOME_TIME = 2.4;
const BANNER_TIME = 2.2;
const START = { x: 4.5, row: 0 };

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const stageEl = $('stage');

const rowTop = (row) => TOP + (L.ROWS - 1 - row) * T;
const rowFeet = (row) => rowTop(row) + T - 10;     // she stands in the middle of the lane, like the cars
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
// Ease in and out, so each step starts gently and settles into place.
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

const load = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// ---- State ----
let state = 'title';          // title | playing | dying | home | over
let round = 0;
let setup = L.roundSetup(0);
let stage = STAGES[0];
let lanes = [];
let time = 0;
let score = 0;
let best = load('ggrobar-best', 0);
let lives = 3;
let cold = 40;
let nog = 0;
let maxRow = 0;
let pickups = [];
let gotSet = 0;
let floaters = [];
let particles = [];
let snow = [];
let banner = null;
let death = null;             // { kind, by, x, y, t }
let homeT = 0;
let invincible = false;
let paused = false;            // debug only: stop the clock to look at a moment

const gran = { x: START.x, row: START.row, fromX: START.x, fromRow: START.row, hop: 1, facing: 'up', step: 1 };
let queued = null;

let santa = { phase: 'idle', next: 5, t: 0, row: 1, dir: 1 };

// ---- Rounds and lives ----
function newGame() {
  round = 0;
  score = 0;
  lives = 3;
  startRound();
  setState('playing');
  updateHud();
}

function startRound() {
  setup = L.roundSetup(round, STAGES.length);
  stage = STAGES[setup.stage];
  lanes = L.buildLanes(stage, setup.speedMul);
  buildBackground();
  makeSnow(setup.snow);
  banner = { text: `Round ${round + 1}`, sub: stage.name, t: 0 };
  santa = { phase: 'idle', next: Math.max(3, setup.santaEvery * 0.6), t: 0, row: 1, dir: 1 };
  freshCrossing();
}

// Back to the start for a new crossing (a new round or after losing a life).
function freshCrossing() {
  Object.assign(gran, { x: START.x, row: START.row, fromX: START.x, fromRow: START.row, hop: 1, facing: 'up' });
  queued = null;
  cold = setup.coldTime;
  nog = 0;
  maxRow = 0;
  death = null;
  placePickups();
}

function placePickups() {
  const rows = L.pickupRows(stage);
  const used = new Set();
  const spot = () => {
    for (let tries = 0; tries < 50; tries++) {
      const row = rows[Math.floor(Math.random() * rows.length)];
      const col = Math.floor(Math.random() * L.COLS);
      const k = `${row},${col}`;
      if (!used.has(k)) { used.add(k); return { row, col }; }
    }
    return { row: rows[0], col: 0 };
  };
  pickups = ['glasses', 'fruitcake', 'present'].map((kind) => ({ kind, ...spot(), got: false }));
  if (Math.random() < 0.6) pickups.push({ kind: 'eggnog', ...spot(), got: false });
  gotSet = 0;
}

function setState(s) {
  state = s;
  $('title-panel').classList.toggle('hidden', s !== 'title');
  $('over-panel').classList.toggle('hidden', s !== 'over');
}

function loseLife(kind, by) {
  if (state !== 'playing' || invincible) return;
  const x = currentX(), row = currentRow();
  death = { kind, by, x, row, t: 0 };
  setState('dying');
  if (kind === 'squash') Sound.splat();
  else if (kind === 'splash') Sound.splash();
  else Sound.freeze();
  const words = { squash: by === 'sleigh' ? 'Run over by a reindeer!' : 'Splat!', splash: 'Sploosh!', freeze: 'Brrr!' };
  floater(x * T, rowTop(row) - 6, words[kind], '#ffffff', by === 'sleigh' ? 24 : 28);
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
  freshCrossing();
  santa.phase = 'idle';
  santa.next = Math.max(santa.next, 2.5);
  setState('playing');
}

function gameOver() {
  const isBest = score > best;
  if (isBest) { best = score; save('ggrobar-best', best); }
  $('final-score').textContent = score;
  $('final-round').textContent = round + 1;
  $('new-best').classList.toggle('hidden', !isBest);
  updateHud();
  setState('over');
}

function reachHome() {
  const bonus = L.HOME_PTS + L.coldBonus(cold);
  addScore(bonus, gran.x * T, rowTop(L.HOME_ROW) + 10, `Home! +${bonus}`);
  Sound.home();
  homeT = 0;
  setState('home');
  for (let i = 0; i < 40; i++) {
    particles.push({ x: W / 2 + rand(-30, 30), y: TOP - 30, vx: rand(-3, 3), vy: rand(-5, -1), life: rand(0.8, 1.6), t: 0, c: ['#ffd25a', '#ff6a5a', '#6ad08a', '#6ab4ff'][i % 4], r: rand(2, 4) });
  }
}

function nextRound() {
  round++;
  startRound();
  setState('playing');
  updateHud();
}

// ---- Score ----
function addScore(pts, x, y, text) {
  const mult = nog > 0 ? 2 : 1;
  score += pts * mult;
  if (text !== null) floater(x, y, text ?? `+${pts * mult}`, mult > 1 ? '#ffe9a8' : '#ffffff', 20);
  updateHud();
}

// ---- Moving Grandma ----
const currentX = () => gran.fromX + (gran.x - gran.fromX) * ease(Math.min(1, gran.hop));
const currentRow = () => (gran.hop < 0.5 ? gran.fromRow : gran.row);

function tryMove(dir) {
  if (state !== 'playing') return;
  if (gran.hop < 1) { queued = dir; return; }
  hop(dir);
}

function hop(dir) {
  const fromRow = gran.row;
  let row = fromRow, x = gran.x;
  if (dir === 'up') row = Math.min(L.HOME_ROW, row + 1);
  if (dir === 'down') row = Math.max(0, row - 1);
  if (dir === 'left') x -= 1;
  if (dir === 'right') x += 1;
  gran.facing = dir;
  // Eggnog makes her wander a little on forward/back hops.
  if (nog > 0 && (dir === 'up' || dir === 'down') && Math.random() < L.NOG_DRIFT) x += Math.random() < 0.5 ? -1 : 1;
  const toType = stage.rows[row].type;
  if (toType !== 'pond') x = L.snapCol(x);
  else if (stage.rows[fromRow].type !== 'pond' && (dir === 'left' || dir === 'right')) x = Math.min(L.COLS - 0.5, Math.max(0.5, x));
  if (row === fromRow && x === gran.x) return;
  gran.fromX = gran.x; gran.fromRow = fromRow;
  gran.x = x; gran.row = row;
  gran.hop = 0;
  gran.step = -gran.step;
  Sound.hop();
}

function landed() {
  const row = gran.row;
  if (row > maxRow) {
    addScore(L.ROW_PTS * (row - maxRow), gran.x * T, rowTop(row) - 4, null);
    maxRow = row;
  }
  const col = Math.floor(gran.x);
  for (const p of pickups) {
    if (p.got || p.row !== row || p.col !== col) continue;
    p.got = true;
    if (p.kind === 'eggnog') {
      nog = L.NOG_TIME;
      Sound.nog();
      floater(gran.x * T, rowTop(row) - 8, 'Eggnog! Double points', '#ffe9a8', 20);
    } else {
      Sound.pickup();
      addScore(L.PICKUP_PTS, gran.x * T, rowTop(row) - 8, `${NAMES[p.kind]} +${L.PICKUP_PTS * (nog > 0 ? 2 : 1)}`);
      gotSet++;
      if (gotSet === 3) {
        Sound.allSet();
        addScore(L.SET_BONUS, W / 2, H / 2, `All set! +${L.SET_BONUS * (nog > 0 ? 2 : 1)}`);
      }
    }
    sparkle((p.col + 0.5) * T, rowTop(row) + T / 2, '#ffe9a8');
  }
  if (row === L.HOME_ROW) reachHome();
}
const NAMES = { glasses: 'Reading glasses', fruitcake: 'Fruitcake', present: 'Present' };
const C_GOLD = '#ffd27a';

// ---- Santa ----
function updateSanta(dt) {
  if (santa.phase === 'idle') {
    santa.next -= dt;
    if (santa.next <= 0 && state === 'playing') {
      santa.phase = 'warn';
      santa.t = 0;
      santa.row = L.pickSantaRow(gran.row);
      santa.dir = Math.random() < 0.5 ? 1 : -1;
      Sound.sleighBells();
    }
  } else if (santa.phase === 'warn') {
    santa.t += dt;
    if (santa.t >= L.SANTA_WARN) { santa.phase = 'swoop'; santa.t = 0; Sound.whoosh(); Sound.ho(); }
  } else if (santa.phase === 'swoop') {
    santa.t += dt;
    if (Math.random() < 0.5) {
      const sx = L.sleighX(santa.dir, santa.t) + (santa.dir > 0 ? 0 : L.SLEIGH_W);
      particles.push({ x: sx * T, y: rowTop(santa.row) + rand(10, 40), vx: -santa.dir * rand(0.5, 2), vy: rand(-0.5, 0.5), life: rand(0.4, 0.9), t: 0, c: '#fff6d0', r: rand(1.5, 3), star: true });
    }
    if (state === 'playing' && currentRow() === santa.row && L.sleighHits(santa.dir, santa.t, currentX())) {
      loseLife('squash', 'sleigh');
    }
    if (L.sleighDone(santa.dir, santa.t)) {
      santa.phase = 'idle';
      santa.next = setup.santaEvery * rand(0.8, 1.2);
    }
  }
}

// ---- Update ----
function update(dt) {
  time += dt;
  L.stepLanes(lanes, dt);
  for (const lane of lanes) {
    if (lane.stops) {
      const singing = L.laneTarget(lane) === 0;
      if (singing && !lane.wasSinging) Sound.sing();
      lane.wasSinging = singing;
    }
  }
  updateSnow(dt);
  updateParticles(dt);
  if (banner) { banner.t += dt; if (banner.t > BANNER_TIME) banner = null; }

  if (state === 'playing') {
    cold -= dt;
    if (nog > 0) nog = Math.max(0, nog - dt);
    if (gran.hop < 1) {
      gran.hop += dt / HOP_TIME;
      if (gran.hop >= 1) { gran.hop = 1; gran.fromX = gran.x; gran.fromRow = gran.row; landed(); }
    }
    if (state === 'playing' && gran.hop >= 1 && queued) { const d = queued; queued = null; hop(d); }
    if (state === 'playing') checkGround(dt);
    if (state === 'playing' && cold <= 0) loseLife('freeze');
    updateColdBar();
  }
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
    if (homeT >= HOME_TIME) nextRound();
  }
}

function checkGround(dt) {
  const row = currentRow();
  const lane = lanes[row];
  const x = currentX();
  if (L.HAZARD_TYPES.has(lane.type)) {
    const o = L.hazardAt(lane, x);
    if (o) {
      if (lane.kind === 'car' || lane.kind === 'van' || lane.kind === 'plow') Sound.honk();
      loseLife('squash', lane.kind);
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

// ---- Effects ----
function floater(x, y, text, color, size = 20, delay = 0) {
  floaters.push({ x: Math.min(W - 70, Math.max(70, x)), y, text, color, size, t: -delay });
}
function sparkle(x, y, c) {
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, s = rand(1, 3);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: rand(0.4, 0.8), t: 0, c, r: rand(1.5, 3), star: true });
  }
}
function updateParticles(dt) {
  for (const p of particles) { p.t += dt; p.x += p.vx; p.y += p.vy; p.vy += 0.06; }
  particles = particles.filter((p) => p.t < p.life);
  for (const f of floaters) f.t += dt;
  floaters = floaters.filter((f) => f.t < 1.4);
}

function makeSnow(n) {
  snow = [];
  for (let i = 0; i < n; i++) {
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
let bg = null, grain = null;

function resize() {
  const r = stageEl.getBoundingClientRect();
  scale = Math.min((r.width - 16) / W, (r.height - 4) / H);
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.style.width = `${Math.floor(W * scale)}px`;
  canvas.style.height = `${Math.floor(H * scale)}px`;
  canvas.width = Math.floor(W * scale * dpr);
  canvas.height = Math.floor(H * scale * dpr);
  Art.setScale(scale * dpr);
  buildBackground();
  grain = offscreen((g) => Art.drawGrain(g, W, H));
}

function offscreen(draw) {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const g = c.getContext('2d');
  g.scale(scale * dpr, scale * dpr);
  g.lineJoin = 'round'; g.lineCap = 'round';
  draw(g);
  return c;
}

function buildBackground() {
  if (!canvas.width) return;
  bg = offscreen((g) => {
    Art.drawSkyBand(g, W, TOP, setup.stage + 1);
    for (let row = 0; row < L.ROWS; row++) {
      const type = stage.rows[row].type;
      const above = row + 1 < L.ROWS ? stage.rows[row + 1].type : 'sky';
      const below = row > 0 ? stage.rows[row - 1].type : 'none';
      Art.drawRow(g, type, rowTop(row), W, above, below, setup.stage * 100 + row + 1);
    }
  });
}

function draw() {
  Art.setTime(time);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (bg) ctx.drawImage(bg, 0, 0);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  Art.cottage(ctx, W / 2, TOP - 2, time);

  // Santa's warning shadow sits on the ground under everything.
  drawSantaShadow();

  // Pickups.
  for (const p of pickups) {
    if (p.got) continue;
    const bob = Math.sin(time * 3 + p.col) * 2;
    Art.blit(ctx, Art.pickup(p.kind), p.col * T, rowTop(p.row) + bob);
  }

  // Rows from the top down, so things lower on the screen overlap those above.
  const gRow = state === 'dying' || (state === 'over' && death) ? -1 : currentRow();
  for (let row = L.ROWS - 1; row >= 0; row--) {
    drawLane(lanes[row]);
    if (row === gRow) drawGrandma();
    if (death && death.row === row) drawDeath();
  }

  drawSleigh();

  // Effects.
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
    if (p.star) { Art.star(ctx, p.x, p.y, p.r * 1.4, 4); ctx.fillStyle = p.c; ctx.fill(); }
    else { Art.circ(ctx, p.x, p.y, p.r); ctx.fillStyle = p.c; ctx.fill(); }
  }
  ctx.globalAlpha = 1;
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

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (grain) ctx.drawImage(grain, 0, 0);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);

  drawText();
}

function drawLane(lane) {
  if (!lane.objs.length) return;
  const flip = lane.dir < 0;
  for (const o of lane.objs) {
    if (o.x > L.COLS + 0.5 || o.x + o.w < -0.5) continue;
    const x = o.x * T;
    // a little bounce: cars on their springs, sleds over bumps
    const bounce = lane.kind === 'floe' ? 0 : Math.abs(Math.sin(time * (lane.kind === 'sled' ? 9 : 6) + o.phase * 3)) * (lane.kind === 'sled' ? 2.5 : 1.2) * lane.moving;
    const y = rowTop(lane.row) - bounce;
    if (lane.kind === 'floe') {
      const st = L.floeState(o, time);
      ctx.save();
      if (st === 'sunk') ctx.globalAlpha = 0.18;
      if (st === 'cracking') ctx.translate(Math.sin(time * 40) * 1.2, 0);
      Art.blit(ctx, Art.floe(o.w, o.variant % 3, o.thin), x, y);
      ctx.restore();
      continue;
    }
    if (lane.kind === 'car') Art.blit(ctx, Art.car(o.variant), x, y, flip);
    else if (lane.kind === 'plow') {
      Art.blit(ctx, Art.plow(), x, y, flip);
      // spinning beacon and slush spray off the blade
      const bx = flip ? x + o.w * T - 113 : x + 113;
      Art.glow(ctx, bx, y + 5, 22, 'rgba(255,170,60,0.9)', 0.4 + 0.6 * Math.max(0, Math.sin(time * 9)));
      if (Math.random() < 0.4 * lane.moving) {
        const fx = flip ? x : x + o.w * T;
        particles.push({ x: fx, y: y + rand(30, 50), vx: lane.dir * rand(1, 3), vy: rand(-2.5, -0.5), life: rand(0.3, 0.6), t: 0, c: '#e8eef8', r: rand(1.5, 3.5) });
      }
    } else if (lane.kind === 'van') {
      Art.blit(ctx, Art.van(o.variant), x, y, flip);
      if (lane.moving < 0.3) {
        for (let i = 0; i < 2; i++) {
          const k = (time * 0.6 + i * 0.5) % 1;
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = '#fff6d0';
          ctx.font = '700 20px Gaegu, sans-serif';
          ctx.fillText(i ? '♫' : '♪', x + o.w * T * (0.3 + i * 0.3) + Math.sin(k * 6) * 4, y + 6 - k * 26);
        }
        ctx.globalAlpha = 1;
      }
    } else if (lane.kind === 'sled') Art.blit(ctx, Art.sled(o.variant), x, y, flip);
    else if (lane.kind === 'skater') Art.blit(ctx, Art.skater(o.variant, Math.floor(time * 3 + o.phase) % 2), x, y, flip);
  }
}

function drawGrandma() {
  const x = currentX() * T;
  const y = rowFeet(gran.fromRow) + (rowFeet(gran.row) - rowFeet(gran.fromRow)) * ease(Math.min(1, gran.hop));
  let tilt = nog > 0 ? Math.sin(time * 5) * 0.12 : 0;
  const shiver = state === 'playing' && cold < 8 ? 2.5 : 0;
  if (state === 'home') {
    // she toddles up the path and in through the door
    const k = Math.min(1, homeT / 1.2);
    const hx = x + (W / 2 - x) * k;
    const hy = y - 30 * k;
    if (k < 1) Art.grandma(ctx, hx, hy, { facing: 'up', hop: (homeT * 3) % 1, step: Math.floor(homeT * 3) % 2 ? 1 : -1, scale: GRAN_SCALE * (1 - 0.25 * k) });
    return;
  }
  // on a thin floe that's cracking? wobble
  const lane = lanes[gran.row];
  if (lane.type === 'pond' && gran.hop >= 1) {
    const f = L.floeUnder(lane, gran.x, time);
    if (f && L.floeState(f, time) === 'cracking') tilt += Math.sin(time * 30) * 0.06;
  }
  Art.grandma(ctx, x, y, { facing: gran.facing, hop: gran.hop < 1 ? gran.hop : 0, step: gran.step, tilt, shiver, scale: GRAN_SCALE });
}

function drawDeath() {
  const x = death.x * T, y = rowFeet(death.row);
  ctx.save();
  ctx.translate(x, y); ctx.scale(0.95, 0.95); ctx.translate(-x, -y);
  if (death.kind === 'squash') Art.pancake(ctx, x, y, death.t, death.by);
  else if (death.kind === 'splash') {
    if (death.t < 0.3) {
      for (let i = 0; i < 3; i++) particles.push({ x: x + rand(-14, 14), y: y - 10, vx: rand(-2, 2), vy: rand(-4, -2), life: 0.5, t: 0, c: '#bfe3f7', r: rand(2, 4) });
    }
    Art.iceCube(ctx, x, y, death.t);
  } else Art.snowman(ctx, x, y, death.t);
  ctx.restore();
}

function drawSantaShadow() {
  if (santa.phase === 'idle') return;
  const y = rowTop(santa.row) + T / 2;
  ctx.save();
  if (santa.phase === 'warn') {
    const k = santa.t / L.SANTA_WARN;
    // the shadow grows in from the side the sleigh will come from
    const len = W * (0.25 + 0.75 * k);
    const x0 = santa.dir > 0 ? 0 : W - len;
    const gr = ctx.createLinearGradient(x0, 0, x0 + len, 0);
    const a = 0.25 + 0.4 * k;
    // the whole row darkens a little, pulsing with the bells
    ctx.fillStyle = `rgba(15,15,45,${0.08 + 0.08 * Math.sin(time * 14) ** 2})`;
    ctx.fillRect(0, rowTop(santa.row), W, T);
    if (santa.dir > 0) { gr.addColorStop(0, `rgba(15,15,45,${a})`); gr.addColorStop(1, 'rgba(15,15,45,0)'); }
    else { gr.addColorStop(0, 'rgba(15,15,45,0)'); gr.addColorStop(1, `rgba(15,15,45,${a})`); }
    ctx.fillStyle = gr;
    Art.ell(ctx, x0 + len / 2, y + 6, len / 2, 12 + 12 * k);
    ctx.fill();
    // a jingling bell at the edge it comes from
    const bx = santa.dir > 0 ? 22 : W - 22;
    const swing = Math.sin(time * 26) * 0.4;
    ctx.translate(bx, y - 8);
    ctx.rotate(swing);
    Art.glow(ctx, 0, 6, 26, 'rgba(255,215,120,0.8)', 0.5 + 0.5 * Math.sin(time * 14));
    Art.circ(ctx, 0, 8, 10); Art.paint(ctx, '#e8b54e', Art.INK, 2);
    ctx.fillStyle = Art.INK; ctx.fillRect(-6, 9, 12, 2);
    Art.circ(ctx, 0, 14, 2.5); ctx.fill();
    Art.circ(ctx, 0, -3, 3); Art.paint(ctx, null, Art.INK, 2);
  } else {
    const sx = L.sleighX(santa.dir, santa.t) * T;
    ctx.fillStyle = 'rgba(15,15,45,0.4)';
    Art.ell(ctx, sx + (L.SLEIGH_W * T) / 2, y + 8, (L.SLEIGH_W * T) / 2, 12);
    ctx.fill();
  }
  ctx.restore();
}

function drawSleigh() {
  if (santa.phase !== 'swoop') return;
  const sx = L.sleighX(santa.dir, santa.t) * T;
  const y = rowTop(santa.row) - 22 + Math.sin(santa.t * 12) * 3;
  Art.blit(ctx, Art.sleigh(Math.floor(santa.t * 10) % 2), sx, y, santa.dir < 0);
}

function drawText() {
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
  if (banner) {
    const k = banner.t / BANNER_TIME;
    const a = Math.min(1, banner.t * 4, (1 - k) * 4);
    ctx.globalAlpha = a;
    const y = H * 0.46;
    ctx.fillStyle = 'rgba(25,30,70,0.6)';
    Art.rr(ctx, W / 2 - 170, y - 50, 340, 100, 22); ctx.fill();
    ctx.font = '700 46px "Mountains of Christmas", serif';
    ctx.fillStyle = '#fff6d8';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(30,30,70,0.9)';
    ctx.strokeText(banner.text, W / 2, y - 14);
    ctx.fillText(banner.text, W / 2, y - 14);
    ctx.font = '700 28px Gaegu, sans-serif';
    ctx.fillStyle = '#ffd27a';
    ctx.fillText(banner.sub, W / 2, y + 26);
    ctx.globalAlpha = 1;
  }
}

// ---- HUD ----
const livesEl = $('lives');
let headUrl = null;
function updateHud() {
  $('score').textContent = score;
  $('best').textContent = Math.max(best, score);
  $('round').textContent = round + 1;
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
  const k = Math.max(0, cold / setup.coldTime);
  coldFill.style.transform = `scaleX(${k})`;
  coldFill.classList.toggle('low', k < 0.25);
  $('nog').classList.toggle('hidden', nog <= 0);
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
    if (state === 'title' || state === 'over') return;
    tryMove(dir);
  } else if ((e.key === 'Enter' || e.key === ' ') && (state === 'title' || state === 'over')) {
    e.preventDefault();
    Sound.unlock();
    newGame();
  }
});

// Swipe anywhere, or tap toward where you want her to go.
let touch = null;
stageEl.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, .panel')) return;
  Sound.unlock();
  touch = { x: e.clientX, y: e.clientY, id: e.pointerId };
});
stageEl.addEventListener('pointerup', (e) => {
  if (!touch || touch.id !== e.pointerId) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
  touch = null;
  if (state !== 'playing' && state !== 'dying' && state !== 'home') return;
  let dir;
  if (Math.hypot(dx, dy) > 22) {
    dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  } else {
    // a tap: which way is it from Grandma?
    const r = canvas.getBoundingClientRect();
    const gx = r.left + currentX() * T * scale;
    const gy = r.top + (rowFeet(currentRow()) - 20) * scale;
    const tx = e.clientX - gx, ty = e.clientY - gy;
    if (Math.hypot(tx, ty) < 10) return;
    dir = Math.abs(tx) > Math.abs(ty) ? (tx > 0 ? 'right' : 'left') : (ty > 0 ? 'down' : 'up');
  }
  tryMove(dir);
});
stageEl.addEventListener('pointercancel', () => { touch = null; });
document.addEventListener('touchmove', (e) => { if (state !== 'title' && state !== 'over') e.preventDefault(); }, { passive: false });

$('start-btn').addEventListener('click', () => { Sound.unlock(); newGame(); });
$('again-btn').addEventListener('click', () => { Sound.unlock(); newGame(); });
$('restart-btn').addEventListener('click', () => { Sound.unlock(); newGame(); });
const muteBtn = $('mute-btn');
const showMute = () => { muteBtn.textContent = Sound.muted ? '🔇' : '🔊'; muteBtn.setAttribute('aria-label', Sound.muted ? 'Sound off' : 'Sound on'); };
muteBtn.addEventListener('click', () => { Sound.unlock(); Sound.toggleMute(); showMute(); });
showMute();

// ---- Loop ----
let last = performance.now();
let acc = 0;
const STEP = 1 / 60;
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  if (paused) acc = 0;
  while (acc >= STEP) { update(STEP); acc -= STEP; }
  draw();
  requestAnimationFrame(frame);
}

new ResizeObserver(resize).observe(stageEl);
resize();
lanes = L.buildLanes(stage, 1);
makeSnow(setup.snow);
updateHud();
updateColdBar();
requestAnimationFrame(frame);
if (document.fonts) document.fonts.ready.then(() => { headUrl = null; livesEl.replaceChildren(); updateHud(); });

// Test hooks, only with ?debug in the address.
if (DEBUG) {
  window.ggrobar = {
    stats: () => ({ state, round, score, lives, cold: +cold.toFixed(1), row: gran.row, x: +gran.x.toFixed(2), santa: santa.phase, stage: stage.name }),
    start: newGame,
    move: tryMove,
    setRound(r) { round = r; startRound(); setState('playing'); updateHud(); },
    warp(row, x = gran.x) { Object.assign(gran, { row, fromRow: row, x, fromX: x, hop: 1 }); },
    santa(row, dir = 1) { santa = { phase: 'warn', t: 0, row, dir, next: 0 }; Sound.sleighBells(); },
    santaSwoop(t = 0.4) { santa.phase = 'swoop'; santa.t = t; },
    invincible(on = true) { invincible = on; },
    kill(kind = 'squash', by = 'car') { loseLife(kind, by); },
    pause(on = true) { paused = on; },
    step(seconds) { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) update(1 / 60); },
  };
}
