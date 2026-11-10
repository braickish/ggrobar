import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECTIONS } from '../stages.js';
import * as L from '../logic.js';

const route = L.buildRoute(SECTIONS);

test('the route starts at the party, has a checkpoint before each later section, and ends in the yard', () => {
  assert.equal(route.rows[0].type, 'start');
  assert.equal(route.rows[route.homeRow].type, 'yard');
  assert.equal(route.sections.length, SECTIONS.length);
  route.sections.forEach((s, i) => {
    assert.equal(route.rows[s.startRow].type, i === 0 ? 'start' : 'checkpoint', s.name);
    assert.ok(s.endRow > s.startRow, s.name);
    if (i > 0) assert.equal(s.startRow, route.sections[i - 1].endRow + 1, s.name);
  });
  const yards = route.rows.filter((r) => r.type === 'yard');
  assert.equal(yards.length, 1, "only one house, at the end");
});

test('the walk is a sensible length (about 3–4 minutes for a good player)', () => {
  assert.ok(route.rows.length >= 60 && route.rows.length <= 90, `${route.rows.length} rows`);
});

test('moving rows are fully described', () => {
  const kinds = {
    road: ['car', 'plow', 'van', 'ebike'], hill: ['sled'], rink: ['skater'], pond: ['floe'],
    trail: ['bunny', 'deer', 'moose', 'fox'], sidewalk: ['carolers', 'dogwalker'],
  };
  for (const [i, r] of route.rows.entries()) {
    if (L.SAFE_TYPES.has(r.type)) { assert.equal(r.kind, undefined, `row ${i}`); continue; }
    assert.ok(kinds[r.type], `row ${i} type ${r.type}`);
    if (r.type === 'road' && !r.kind) continue;            // an empty lane of a two-lane street
    assert.ok(kinds[r.type].includes(r.kind), `row ${i}`);
    assert.ok(r.dir === 1 || r.dir === -1, `row ${i}`);
    assert.ok(r.speed > 0 && r.count > 0, `row ${i}`);
    if (r.kind === 'floe') assert.ok(r.size >= 2, `row ${i}`);
  }
});

test('all the sleds on the hill go the same way, downhill', () => {
  const hill = SECTIONS.find((s) => s.name === 'The Sledding Hill');
  const dirs = new Set(hill.rows.filter((r) => r.kind === 'sled').map((r) => r.dir));
  assert.equal(dirs.size, 1);
});

test('tree rows are 9 columns, always leave a way through, and the whole walk can be done', () => {
  for (const r of route.rows) {
    if (r.type !== 'forest') continue;
    assert.equal(r.trees.length, L.COLS, r.trees);
    assert.ok(r.blocked.size < L.COLS, r.trees);
  }
  assert.ok(L.routeIsWalkable(route));
  // and the checker really does notice a wall of trees
  const walled = L.buildRoute([{ ...SECTIONS[0], rows: [{ type: 'forest', trees: 'TTTTTTTTT' }] }]);
  assert.equal(L.routeIsWalkable(walled), false);
});

test('trees only grow on forest rows and yard things only sit on lawns, never where Grandma starts again', () => {
  route.rows.forEach((r, i) => {
    if (r.trees) assert.equal(r.type, 'forest', `row ${i}`);
    if (r.deco) {
      assert.equal(r.type, 'lawn', `row ${i}`);
      assert.match(r.deco, /^[SBTC.]{9}$/, `row ${i}`);
      assert.ok(r.blocked.size < L.COLS, `row ${i}`);
    }
  });
  for (const s of route.sections) {
    assert.ok(!L.isBlocked(route, s.startRow, 4));
    assert.ok(!L.isBlocked(route, s.startRow + 1, 4), `${s.name}: the first step forward is open`);
  }
});

test('hazard rows always leave a gap Grandma can fit through', () => {
  for (const [i, r] of route.rows.entries()) {
    if (!L.HAZARD_TYPES.has(r.type) || !r.kind) continue;
    const gap = L.LOOP / r.count - L.widthOf(r);
    assert.ok(gap >= 1.6, `row ${i} (${r.kind}): gap ${gap.toFixed(2)}`);
  }
});

test('pond rows never leave Grandma waiting too long for a floe', () => {
  for (const [i, r] of route.rows.entries()) {
    if (r.type !== 'pond') continue;
    const gap = L.LOOP / r.count - r.size;
    assert.ok(gap <= (r.thin ? 2.0 : 2.5), `row ${i}: gap ${gap.toFixed(2)}`);
  }
});

test('movers keep their spacing as they loop round, even the stop-and-go animals', () => {
  const lanes = L.buildLanes(L.buildRoute(SECTIONS, 3).rows, L.rng(7));
  for (let i = 0; i < 6000; i++) L.stepLanes(lanes, 1 / 60);
  for (const lane of lanes) {
    if (!lane.objs.length) continue;
    const xs = lane.objs.map((o) => o.x).sort((a, b) => a - b);
    const step = L.LOOP / lane.count;
    for (let k = 1; k < xs.length; k++) assert.ok(Math.abs(xs[k] - xs[k - 1] - step) < 1e-6);
    for (const x of xs) assert.ok(x >= -L.MARGIN && x < L.COLS + L.MARGIN);
  }
});

test('stop-and-go lanes really stop and go', () => {
  const lanes = L.buildLanes(route.rows, L.rng(3));
  for (const kind of ['van', 'bunny', 'deer', 'fox', 'carolers', 'dogwalker']) {
    const lane = lanes.find((l) => l.kind === kind);
    let stopped = 0, moved = 0;
    for (let i = 0; i < 900; i++) {
      const before = lane.objs[0].x;
      L.stepLanes([lane], 1 / 60);
      if (lane.objs[0].x === before) stopped++; else moved++;
    }
    assert.ok(stopped > 30 && moved > 100, `${kind}: stopped ${stopped}, moved ${moved}`);
  }
});

test('head-on hits splat; stepping into the side or back just bounces', () => {
  const car = { x: 2, w: 1.5 };                          // covers 2..3.5
  // going right: its front is at 3.5. Just touching her from behind her left side = head-on.
  assert.equal(L.hitKind(car, 1, 3.5 + L.GRANDMA_HALF - 0.12 - 0.05), 'front');
  // she stepped into its middle or its back end
  assert.equal(L.hitKind(car, 1, 2.75), 'side');
  assert.equal(L.hitKind(car, 1, 2.1), 'side');
  // going left: its front is at 2
  assert.equal(L.hitKind(car, -1, 2 - L.GRANDMA_HALF + 0.12 + 0.05), 'front');
  assert.equal(L.hitKind(car, -1, 3.3), 'side');
  // a mover catching up with a still Grandma always touches with its front first, even the fastest deer
  const fastest = 4.4 * 1.15 * 1.45;                      // deer speed × woods section × a late night
  for (const dir of [1, -1]) {
    const o = { x: dir > 0 ? 4.5 - L.GRANDMA_HALF - 1.4 + 0.12 - fastest / 120 : 4.5 + L.GRANDMA_HALF - 0.12 + fastest / 120, w: 1.4 };
    if (L.hazardAt({ objs: [o] }, 4.5)) assert.equal(L.hitKind(o, dir, 4.5), 'front');
    o.x += dir * fastest / 60;
    assert.ok(L.hazardAt({ objs: [o] }, 4.5));
    assert.equal(L.hitKind(o, dir, 4.5), 'front');
  }
});

test('hits and floes', () => {
  const lane = { objs: [{ x: 2, w: 1.5 }] };
  assert.ok(L.hazardAt(lane, 2.5));
  assert.equal(L.hazardAt(lane, 0.5), null);
  assert.equal(L.hazardAt(lane, 4.3), null);
  const pond = { objs: [{ x: 3, w: 3, thin: false, phase: 0 }] };
  assert.ok(L.floeUnder(pond, 4.5, 0));
  assert.equal(L.floeUnder(pond, 2.5, 0), null);
});

test('thin floes crack, sink, and come back', () => {
  const o = { thin: true, phase: 0 };
  assert.equal(L.floeState(o, 1), 'solid');
  assert.equal(L.floeState(o, 4), 'cracking');
  assert.equal(L.floeState(o, 5), 'sunk');
  assert.equal(L.floeState(o, 7), 'solid');
  assert.equal(L.floeUnder({ objs: [{ x: 0, w: 3, ...o }] }, 1.5, 5), null);
});

test('the sleigh crosses the whole row and hits what is in it', () => {
  for (const dir of [1, -1]) {
    assert.ok(!L.sleighHits(dir, 0, 4.5), 'starts off screen');
    let t = 0, hit = false;
    while (!L.sleighDone(dir, t)) { if (L.sleighHits(dir, t, 4.5)) hit = true; t += 1 / 60; }
    assert.ok(hit);
    assert.ok(t < 1.5, `takes ${t.toFixed(2)}s`);
  }
});

test('Santa only picks rows on screen that he is allowed to use', () => {
  const r = L.rng(11);
  const ok = (row) => row % 5 !== 0;
  for (let g = 10; g < 30; g++) {
    for (let i = 0; i < 100; i++) {
      const row = L.pickSantaRow(g, 8, 22, ok, r);
      assert.ok(row >= 8 && row <= 22 && ok(row), `got ${row}`);
    }
  }
  assert.equal(L.pickSantaRow(5, 3, 4, () => false, r), null);
});

test('later nights are faster and Santa comes more often', () => {
  const r0 = L.buildRoute(SECTIONS, 0), r2 = L.buildRoute(SECTIONS, 2);
  const firstCar = (r) => r.rows.find((x) => x.kind === 'car');
  assert.ok(firstCar(r2).mul > firstCar(r0).mul);
  r0.sections.forEach((s, i) => assert.ok(r2.sections[i].santaEvery <= s.santaEvery));
  assert.ok(r0.sections.every((s, i) => i === 0 || s.santaEvery <= r0.sections[i - 1].santaEvery), 'gets busier along the walk');
});

test('pickup spots and scoring helpers', () => {
  for (const [i] of route.sections.entries()) {
    const spots = L.pickupSpots(route, i);
    assert.ok(spots.length >= 20, `section ${i}`);
    for (const { row, col } of spots) {
      assert.notEqual(route.rows[row].type, 'pond');
      assert.ok(!L.isBlocked(route, row, col));
    }
  }
  assert.equal(L.coldBonus(10.2), 33);
  assert.equal(L.coldBonus(-3), 0);
  assert.equal(L.snapCol(3.9), 3.5);
  assert.equal(L.snapCol(-0.4), 0.5);
  assert.equal(L.snapCol(9.6), 8.5);
});

test('the first section is a neighborhood: yards, sidewalks, two-lane streets, bikes in the street', () => {
  const town = SECTIONS[0];
  town.rows.forEach((r, i) => {
    if (r.type === 'sidewalk') assert.notEqual(town.rows[i + 1]?.type, 'sidewalk', `rows ${i}-${i + 1}: two sidewalks in a row`);
    if (r.kind === 'ebike') assert.equal(r.type, 'road', `row ${i}`);
    // streets come in pairs of lanes, with a sidewalk or more street on each side
    if (r.type === 'road' && town.rows[i - 1]?.type !== 'road') assert.equal(town.rows[i + 1]?.type, 'road', `row ${i}: one-lane street`);
  });
  assert.ok(town.rows.filter((r) => r.type === 'sidewalk').length >= 6);
  assert.ok(town.presentsEvery > 0 && town.raccoonsEvery > 0);
  const busy = (rows) => rows.reduce((n, r) => n + (r.count ?? 0), 0);
  assert.ok(busy(town.rows.slice(0, 6)) < busy(town.rows.slice(11, 17)));
  // yards are two rows deep, and the two rows never have things in the same column (tall ones would overlap)
  town.rows.forEach((r, i) => {
    if (r.type !== 'lawn') return;
    const other = town.rows[i + 1]?.type === 'lawn' ? town.rows[i + 1] : town.rows[i - 1];
    assert.equal(other?.type, 'lawn', `row ${i}: a one-row yard`);
    for (let c = 0; c < L.COLS; c++) assert.ok(r.deco[c] === '.' || other.deco[c] === '.', `row ${i} col ${c}`);
  });
});

test('raccoons come out of upright trash cans just ahead of Grandma', () => {
  const cans = [];
  route.rows.forEach((r, row) => r.deco && [...r.deco].forEach((ch, col) => ch === 'C' && cans.push(row * 100 + col)));
  assert.ok(cans.length >= 3);
  const first = Math.floor(cans[0] / 100);
  const spot = L.pickRaccoonCan(route, first - 2, new Set());
  assert.ok(spot && route.rows[spot.row].deco[spot.col] === 'C');
  assert.equal(L.pickRaccoonCan(route, first - 2, new Set([cans[0]])), null, 'a tipped can stays empty');
  for (let i = 0; i < 50; i++) {
    const s2 = L.pickRaccoonCan(route, first + 1, new Set());
    assert.ok(!s2 || s2.row > first, 'cans behind her are ignored');
  }
});

test('a landed present is run over by whatever drives over its tile, but not by something elsewhere', () => {
  const lane = { type: 'road', objs: [{ x: 2, w: 1.2 }] };
  assert.ok(L.presentRunOver(lane, 2));
  assert.ok(!L.presentRunOver(lane, 5));
  assert.ok(!L.presentRunOver({ type: 'lawn', objs: [] }, 2));
});

test('eggnog stacks: each glass wobbles longer and a bit more, within reason', () => {
  assert.ok(L.nogTime(2) > L.nogTime(1) && L.nogTime(3) > L.nogTime(2));
  assert.ok(L.nogTime(1) >= 10);
  assert.ok(L.nogDrift(1) < L.nogDrift(3));
  assert.ok(L.nogDrift(1) >= 0.5, 'the first glass already makes her veer most steps');
  assert.ok(L.nogDrift(20) <= 0.85);
});

test('after a bounce she stumbles away from where she was going', () => {
  assert.equal(L.stumbleDir(5, 6), 'down');      // stepping forward → staggers back
  assert.equal(L.stumbleDir(5, 4), 'up');        // stepping back → staggers forward
  assert.equal(L.stumbleDir(5, 5), 'down');      // stepping sideways → staggers back
});

test('presents only drop near Grandma, in her section, on open ground', () => {
  const rand = L.rng(11);
  const s0 = route.sections[0];
  for (let i = 0; i < 500; i++) {
    const gRow = s0.startRow + 1 + Math.floor(rand() * (s0.endRow - s0.startRow - 1));
    const gCol = Math.floor(rand() * L.COLS);
    const spot = L.pickDropSpot(route, 0, gRow, gCol, [], rand);
    if (!spot) continue;
    assert.equal(route.rows[spot.row].section, 0);
    assert.notEqual(route.rows[spot.row].type, 'start');
    assert.ok(!L.isBlocked(route, spot.row, spot.col));
    assert.ok(Math.abs(spot.row - gRow) <= 2 && Math.abs(spot.col - gCol) <= 2);
  }
  assert.equal(route.sections[1].presentsEvery, 0, 'only the neighborhood has falling presents');
});
