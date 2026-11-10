// The stages Grandma walks through. The game cycles through them in order, and each time it
// comes back around to the first one everything gets faster and snowier.
//
// Each stage lists its 13 rows from the BOTTOM (where Grandma starts) to the TOP (her front yard).
//
// Row types:
//   walk  safe snowy ground        road  cars, plows and vans       hill  kids on sleds
//   rink  solid ice with skaters   pond  open water: ride the ice floes or fall in
//   yard  Grandma's front yard (reaching it finishes the round)
//
// Rows that move also say:
//   dir    1 = left to right, -1 = right to left
//   speed  tiles per second (Grandma hops one tile at a time)
//   kind   car, plow, van, sled, skater or floe
//   count  how many of them go round the loop (the loop is 15 tiles: the 9 you see plus 3 off each side)
//   size   (floes only) how many tiles long each floe is
//   thin   (floes only) every other floe is thin ice that cracks and sinks for a moment
//   stops  (vans only) the carolers stop to sing: [seconds driving, seconds stopped]

export const STAGES = [
  {
    name: 'Main Street',
    rows: [
      { type: 'walk' },
      { type: 'road', dir: 1, speed: 1.3, kind: 'car', count: 3 },
      { type: 'road', dir: -1, speed: 1.7, kind: 'car', count: 3 },
      { type: 'road', dir: 1, speed: 1.0, kind: 'plow', count: 2 },
      { type: 'walk' },
      { type: 'road', dir: -1, speed: 1.5, kind: 'van', count: 2, stops: [3.2, 1.6] },
      { type: 'road', dir: 1, speed: 2.3, kind: 'car', count: 2 },
      { type: 'road', dir: -1, speed: 1.4, kind: 'car', count: 3 },
      { type: 'walk' },
      { type: 'hill', dir: 1, speed: 2.6, kind: 'sled', count: 3 },
      { type: 'hill', dir: -1, speed: 2.0, kind: 'sled', count: 3 },
      { type: 'road', dir: 1, speed: 1.6, kind: 'car', count: 3 },
      { type: 'yard' },
    ],
  },
  {
    name: 'Sledding Hill',
    rows: [
      { type: 'walk' },
      { type: 'road', dir: -1, speed: 1.5, kind: 'car', count: 3 },
      { type: 'walk' },
      { type: 'hill', dir: 1, speed: 2.4, kind: 'sled', count: 3 },
      { type: 'hill', dir: -1, speed: 3.0, kind: 'sled', count: 2 },
      { type: 'hill', dir: 1, speed: 1.8, kind: 'sled', count: 4 },
      { type: 'hill', dir: -1, speed: 2.7, kind: 'sled', count: 3 },
      { type: 'hill', dir: 1, speed: 3.3, kind: 'sled', count: 2 },
      { type: 'walk' },
      { type: 'hill', dir: -1, speed: 2.2, kind: 'sled', count: 4 },
      { type: 'hill', dir: 1, speed: 2.9, kind: 'sled', count: 3 },
      { type: 'road', dir: -1, speed: 1.2, kind: 'plow', count: 2 },
      { type: 'yard' },
    ],
  },
  {
    name: 'The Frozen Pond',
    rows: [
      { type: 'walk' },
      { type: 'road', dir: 1, speed: 1.6, kind: 'car', count: 3 },
      { type: 'walk' },
      { type: 'pond', dir: 1, speed: 1.0, kind: 'floe', size: 3, count: 3 },
      { type: 'pond', dir: -1, speed: 1.3, kind: 'floe', size: 2, count: 4, thin: true },
      { type: 'pond', dir: 1, speed: 1.6, kind: 'floe', size: 3, count: 3 },
      { type: 'rink', dir: -1, speed: 2.2, kind: 'skater', count: 3 },
      { type: 'pond', dir: 1, speed: 1.2, kind: 'floe', size: 2, count: 4 },
      { type: 'pond', dir: -1, speed: 1.0, kind: 'floe', size: 3, count: 3, thin: true },
      { type: 'pond', dir: 1, speed: 1.5, kind: 'floe', size: 2, count: 4 },
      { type: 'walk' },
      { type: 'road', dir: -1, speed: 1.4, kind: 'van', count: 2, stops: [3.0, 1.8] },
      { type: 'yard' },
    ],
  },
];
