import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES } from '../stages.js';
import * as L from '../logic.js';

test('every stage has 13 rows, starts on safe ground and ends in the yard', () => {
  for (const s of STAGES) {
    assert.equal(s.rows.length, L.ROWS, s.name);
    assert.equal(s.rows[0].type, 'walk', s.name);
    assert.equal(s.rows[L.HOME_ROW].type, 'yard', s.name);
    for (const r of s.rows.slice(1, -1)) assert.notEqual(r.type, 'yard', s.name);
  }
});

test('moving rows are fully described', () => {
  const kinds = { road: ['car', 'plow', 'van'], hill: ['sled'], rink: ['skater'], pond: ['floe'] };
  for (const s of STAGES) {
    for (const [i, r] of s.rows.entries()) {
      if (r.type === 'walk' || r.type === 'yard') { assert.equal(r.kind, undefined); continue; }
      const where = `${s.name} row ${i}`;
      assert.ok(kinds[r.type].includes(r.kind), where);
      assert.ok(r.dir === 1 || r.dir === -1, where);
      assert.ok(r.speed > 0 && r.count > 0, where);
      if (r.kind === 'floe') assert.ok(r.size >= 2, where);
    }
  }
});

test('hazard rows always leave a gap Grandma can fit through', () => {
  for (const s of STAGES) {
    for (const [i, r] of s.rows.entries()) {
      if (!L.HAZARD_TYPES.has(r.type)) continue;
      const gap = L.LOOP / r.count - L.widthOf(r);
      assert.ok(gap >= 1.8, `${s.name} row ${i}: gap ${gap.toFixed(2)}`);
    }
  }
});

test('pond rows never leave Grandma waiting too long for a floe', () => {
  for (const s of STAGES) {
    for (const [i, r] of s.rows.entries()) {
      if (r.type !== 'pond') continue;
      const gap = L.LOOP / r.count - r.size;
      // Thin floes sink, so their gap can briefly double; keep the plain gap small.
      assert.ok(gap <= (r.thin ? 2.0 : 2.5), `${s.name} row ${i}: gap ${gap.toFixed(2)}`);
    }
  }
});

test('movers keep their spacing as they loop round', () => {
  const lanes = L.buildLanes(STAGES[0], 1.6, L.rng(7));
  for (let i = 0; i < 6000; i++) L.stepLanes(lanes, 1 / 60);
  for (const lane of lanes) {
    if (!lane.objs.length) continue;
    const xs = lane.objs.map((o) => o.x).sort((a, b) => a - b);
    const step = L.LOOP / lane.count;
    for (let k = 1; k < xs.length; k++) assert.ok(Math.abs(xs[k] - xs[k - 1] - step) < 1e-6);
    for (const x of xs) assert.ok(x >= -L.MARGIN && x < L.COLS + L.MARGIN);
  }
});

test('the carolers van lane stops and starts again', () => {
  const lanes = L.buildLanes(STAGES[0], 1, L.rng(3));
  const van = lanes.find((l) => l.kind === 'van');
  let stopped = 0, moved = 0;
  for (let i = 0; i < 600; i++) {
    const before = van.objs[0].x;
    L.stepLanes(lanes, 1 / 60);
    if (van.objs[0].x === before) stopped++; else moved++;
  }
  assert.ok(stopped > 30 && moved > 200, `stopped ${stopped}, moved ${moved}`);
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

test('Santa never picks the start row or the yard', () => {
  const r = L.rng(11);
  for (let g = 0; g < L.ROWS; g++) {
    for (let i = 0; i < 200; i++) {
      const row = L.pickSantaRow(g, r);
      assert.ok(row >= 1 && row <= L.HOME_ROW - 1, `got ${row}`);
    }
  }
});

test('rounds get harder', () => {
  let prev = L.roundSetup(0);
  assert.equal(prev.santaEvery, 8);
  for (let r = 1; r < 12; r++) {
    const cur = L.roundSetup(r);
    assert.equal(cur.stage, r % 3);
    assert.ok(cur.speedMul >= prev.speedMul - 0.09 || cur.cycle > prev.cycle);
    assert.ok(cur.santaEvery <= prev.santaEvery && cur.santaEvery >= 4);
    assert.ok(cur.snow >= prev.snow);
    prev = cur;
  }
  assert.ok(L.roundSetup(3).speedMul > L.roundSetup(2).speedMul);
});

test('scoring helpers', () => {
  assert.equal(L.coldBonus(10.2), 33);
  assert.equal(L.coldBonus(-3), 0);
  assert.equal(L.snapCol(3.9), 3.5);
  assert.equal(L.snapCol(-0.4), 0.5);
  assert.equal(L.snapCol(9.6), 8.5);
  for (const s of STAGES) {
    const rows = L.pickupRows(s);
    assert.ok(rows.length >= 4, s.name);
    for (const r of rows) assert.ok(s.rows[r].type !== 'pond' && r > 0 && r < L.HOME_ROW);
  }
});
