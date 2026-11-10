// Grandma's walk home, from the party (bottom) to her front door (top), in sections.
// Between sections there's a checkpoint: it warms her up, and she starts there again if she loses a life.
// The game adds the start row, the checkpoint rows and her yard at the very end; each section just lists
// its own rows, bottom to top.
//
// Row types:
//   walk    safe snowy ground          road   cars, plows and vans          hill   kids on sleds
//   lawn    a front yard with snowmen, bushes and Christmas trees to walk around (no movers)
//   sidewalk  kids on e-bikes, carolers, people walking dogs
//   rink    solid ice with skaters     pond   open water: ride the ice floes or fall in
//   forest  trees Grandma has to walk around (no movers)
//   trail   a path through the woods that animals cross
//
// Rows that move also say:
//   dir    1 = left to right, -1 = right to left
//   speed  tiles per second (Grandma steps one tile at a time)
//   kind   car, plow, van, sled, skater, floe, bunny, deer, moose, fox, ebike, carolers or dogwalker
//   count  how many of them go round the loop (the loop is 15 tiles: the 9 you see plus 3 off each side)
//   size   (floes only) how many tiles long each floe is
//   thin   (floes only) every other floe is thin ice that cracks and sinks for a moment
//   stops  [seconds going, seconds stopped]: carolers stop to sing, dogs stop to sniff, bunnies hop in bursts, deer freeze then dash
//
// forest rows say where the trees are, one letter per column: T is a tree, . is open snow.
// lawn rows say the same with deco: S is a snowman, B a bush with lights, T a little Christmas tree.
//
// Each section also sets:
//   checkpoint  the name of the stop at its start (the first section starts at the party instead)
//   speed       a multiplier on everything that moves in it
//   santaEvery  about how many seconds between sleigh swoops
//   presentsEvery  (optional) about how many seconds between presents dropping out of the sky

export const SECTIONS = [
  {
    // Grandma's neighbors' front yards and the sidewalks between them. Presents keep falling out of the
    // sky here (watch for their shadows), and at the top she crosses Main Street to the park.
    name: 'Holly Lane',
    speed: 1,
    santaEvery: 9,
    presentsEvery: 2.8,
    rows: [
      { type: 'lawn', deco: 'S...B..T.' },
      { type: 'sidewalk', dir: 1, speed: 2.4, kind: 'ebike', count: 3 },
      { type: 'sidewalk', dir: -1, speed: 0.8, kind: 'carolers', count: 3, stops: [2.6, 1.8] },
      { type: 'lawn', deco: '.B..S..B.' },
      { type: 'sidewalk', dir: 1, speed: 1.3, kind: 'dogwalker', count: 3, stops: [2.2, 0.9] },
      { type: 'sidewalk', dir: -1, speed: 3.0, kind: 'ebike', count: 2 },
      { type: 'lawn', deco: 'T..S.B..S' },
      { type: 'sidewalk', dir: 1, speed: 0.9, kind: 'carolers', count: 3, stops: [2.4, 2.0] },
      { type: 'sidewalk', dir: -1, speed: 2.7, kind: 'ebike', count: 3 },
      { type: 'sidewalk', dir: 1, speed: 1.5, kind: 'dogwalker', count: 3, stops: [1.8, 1.0] },
      { type: 'lawn', deco: '.S.T..B.T' },
      { type: 'sidewalk', dir: 1, speed: 3.3, kind: 'ebike', count: 2 },
      { type: 'sidewalk', dir: -1, speed: 1.0, kind: 'carolers', count: 3, stops: [2.2, 1.6] },
      { type: 'walk' },
      { type: 'road', dir: 1, speed: 1.8, kind: 'car', count: 3 },
      { type: 'road', dir: -1, speed: 1.5, kind: 'van', count: 2, stops: [3.0, 1.6] },
    ],
  },
  {
    name: 'The Sledding Hill',
    checkpoint: 'The lamppost on the corner',
    speed: 1.05,
    santaEvery: 7,
    // The hill slopes down to the right, so every sled goes that way.
    rows: [
      { type: 'forest', trees: 'TT..T..TT' },
      { type: 'hill', dir: 1, speed: 2.4, kind: 'sled', count: 3 },
      { type: 'hill', dir: 1, speed: 3.0, kind: 'sled', count: 2 },
      { type: 'forest', trees: 'T.T..TT.T' },
      { type: 'hill', dir: 1, speed: 2.0, kind: 'sled', count: 4 },
      { type: 'hill', dir: 1, speed: 3.2, kind: 'sled', count: 2 },
      { type: 'hill', dir: 1, speed: 2.6, kind: 'sled', count: 3 },
      { type: 'forest', trees: '.TT.T..TT' },
      { type: 'trail', dir: -1, speed: 2.6, kind: 'bunny', count: 4, stops: [0.35, 0.5] },
      { type: 'hill', dir: 1, speed: 2.8, kind: 'sled', count: 3 },
      { type: 'hill', dir: 1, speed: 2.2, kind: 'sled', count: 3 },
      { type: 'forest', trees: 'TT.T.TT..' },
      { type: 'hill', dir: 1, speed: 3.4, kind: 'sled', count: 2 },
      { type: 'hill', dir: 1, speed: 2.5, kind: 'sled', count: 3 },
      { type: 'walk' },
    ],
  },
  {
    name: 'The Frozen Pond',
    checkpoint: 'The warming hut',
    speed: 1.1,
    santaEvery: 6.5,
    rows: [
      { type: 'pond', dir: 1, speed: 1.0, kind: 'floe', size: 3, count: 3 },
      { type: 'pond', dir: -1, speed: 1.3, kind: 'floe', size: 2, count: 4, thin: true },
      { type: 'pond', dir: 1, speed: 1.6, kind: 'floe', size: 3, count: 3 },
      { type: 'rink', dir: -1, speed: 2.2, kind: 'skater', count: 3 },
      { type: 'pond', dir: 1, speed: 1.2, kind: 'floe', size: 2, count: 4 },
      { type: 'pond', dir: -1, speed: 1.0, kind: 'floe', size: 3, count: 3, thin: true },
      { type: 'walk' },
      { type: 'road', dir: 1, speed: 1.6, kind: 'car', count: 3 },
      { type: 'walk' },
      { type: 'pond', dir: -1, speed: 1.4, kind: 'floe', size: 3, count: 3 },
      { type: 'pond', dir: 1, speed: 1.1, kind: 'floe', size: 2, count: 4, thin: true },
      { type: 'rink', dir: 1, speed: 2.4, kind: 'skater', count: 3 },
      { type: 'pond', dir: -1, speed: 1.3, kind: 'floe', size: 3, count: 3 },
      { type: 'pond', dir: 1, speed: 1.5, kind: 'floe', size: 2, count: 4 },
      { type: 'walk' },
    ],
  },
  {
    name: 'The Woods',
    checkpoint: "The neighbor's porch",
    speed: 1.15,
    santaEvery: 5.5,
    rows: [
      { type: 'forest', trees: 'T..TT.TT.' },
      { type: 'trail', dir: 1, speed: 4.0, kind: 'deer', count: 2, stops: [0.8, 2.0] },
      { type: 'forest', trees: '.T.T..T.T' },
      { type: 'trail', dir: -1, speed: 1.6, kind: 'fox', count: 3, stops: [1.6, 0.8] },
      { type: 'trail', dir: 1, speed: 2.8, kind: 'bunny', count: 4, stops: [0.35, 0.45] },
      { type: 'forest', trees: 'TT..T.TT.' },
      { type: 'trail', dir: -1, speed: 0.8, kind: 'moose', count: 2 },
      { type: 'forest', trees: 'T.TT..T.T' },
      { type: 'trail', dir: -1, speed: 4.4, kind: 'deer', count: 2, stops: [0.7, 1.8] },
      { type: 'trail', dir: 1, speed: 2.6, kind: 'bunny', count: 4, stops: [0.4, 0.5] },
      { type: 'forest', trees: '.TT.T.T.T' },
      { type: 'trail', dir: 1, speed: 0.9, kind: 'moose', count: 2 },
      { type: 'trail', dir: -1, speed: 1.8, kind: 'fox', count: 3, stops: [1.4, 0.7] },
      { type: 'forest', trees: 'T..T.TT.T' },
      { type: 'road', dir: 1, speed: 1.5, kind: 'car', count: 3 },
      { type: 'road', dir: -1, speed: 2.0, kind: 'car', count: 2 },
    ],
  },
];
