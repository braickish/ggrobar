# GGROBAR

A Christmas lane-crossing browser game: Grandma walks home on Christmas Eve past cars, sleds, thin ice
and a regularly swooping sleigh. Built for a parent and their kids; keep it approachable and kid-friendly
(getting hit is cartoonish: pancake, ice cube, snowman).

- The name is an acronym the user chose. Keep the song's lyrics, melody and full title out of the game,
  and don't copy Frogger's look, layout or sounds; the lane-crossing genre itself is fine.
- Static site, no build step, ES modules: `index.html`, `style.css`, `stages.js` (the walk's sections and rows,
  meant to be edited by hand), `logic.js` (pure rules, imported by the game and by Node tests), `art.js` (all
  drawing), `sound.js` (Web Audio synth, no files; iPhone unlock copied from Witch's Brew), `game.js` (loop, input, rendering).
- One long walk, not rounds: `buildRoute` stitches the sections into ~68 rows: a `start` row, each section's rows,
  a `checkpoint` row before every section after the first, and Grandma's `yard` (the only house) at the end.
  Checkpoints refill the cold meter (per-section `coldTime`) and are where she respawns. Reaching the yard is the
  win; "Next Christmas Eve" rebuilds the route with `night + 1` (faster, more sleigh) keeping score and lives.
- Scrolling: world coordinates, row r spans y = -(r+1)·T..-r·T. `cam` is the row at the bottom of the 910-unit view;
  it glides forward to keep her `GRAN_FROM_BOTTOM` rows up and never moves back except on respawn. She can't step
  below the screen. The sky + cottage sit above the yard, and `camMax` stops the camera with them filling the top.
- Neighborhood (first section, "Holly Lane"): `lawn` rows have `deco: 'S..B.T...'` (snowman / lit bush / little tree,
  blocking like trees, drawn by `Art.yardDeco`); `sidewalk` rows have `ebike`, `carolers` (stop to sing) and `dogwalker`
  (stops to sniff); e-bikes ride the `road` rows. The user wanted it to feel like a real neighborhood: blocks of yard /
  sidewalk / two-lane street (a `road` row with no `kind` is an empty lane) / sidewalk (never two sidewalks in a row, tested), quiet at first, then Main Street at the top.
  Sections with `presentsEvery` drop presents near her (`pickDropSpot`): shadow + red ring for `DROP_WARN` s, then it
  lands and squashes her if she's on that tile. A landed present is worth `DROP_PTS` if she steps on it, vanishes if a
  mover drives over its tile (`presentRunOver`), and fades after `DROP_STAY` s (blinking for the last 2).
  Lawn `C` is a trash can (the user found the lit bushes `B` too busy, so they're unused but still drawable). Sections
  with `raccoonsEvery` pick an upright can just ahead of her (`pickRaccoonCan`): it rattles with eyes peeking out for
  `RACCOON_WARN` s, tips over for good (`tipped`, reset each night), and a raccoon dashes along the row at
  `RACCOON_SPEED`, splatting her ("Trash panda!") and taking any landed present it passes.
- Forest: `forest` rows have `trees: 'T..TT.T.T'` (blocking tiles, drawn as tall still sprites); `trail` rows have
  animals. Animal personalities are lane-wide stop/go cycles (`stops`, `KIND_ACCEL`) so spacing stays even.
  `routeIsWalkable` (BFS) and the gap tests in `tests/logic.test.mjs` guard against impossible layouts.
- Movers loop over a 15-tile track (3 hidden tiles each side) with even spacing, so gaps never change.
- Santa: idle → warn (bells, plus a red glow washing in from the row's edge with the lead reindeer's red nose
  peeking in, `SANTA_WARN` s) → swoop (the nose lights the row ahead). The lead reindeer has a red nose but is
  deliberately not named (the well-known red-nosed reindeer is a trademarked character). Row picking favours
  rows near Grandma (`pickSantaRow`), limited to rows on screen. Interval comes from each section's `santaEvery`.
- Hits: `hitKind` decides head-on (the mover's front has only just reached her → splat) vs side (she stepped into
  its side/back → `bounceOff`: she reverses her step from exactly where she is and twirls the way it was going,
  no life lost), and after the twirl she stumbles one more row back (`stumbleDir`, slower `STUMBLE_TIME` step, input
  ignored meanwhile; no second stumble if she bounces mid-stumble). The user asked for this to make bounces cost
  something. A still Grandma is always reached front-first (tested, even for the fastest deer). The sleigh
  always splats.
- Art: hand-drawn storybook style drawn with canvas calls. Every shape goes through `sketchy()` in art.js, a
  Proxy over the 2D context that records path commands and redraws them as wobbly lines (fill and outline
  wobble differently; dark ink outlines get a second thinner pass). Moving things "boil": `sprite()` caches
  `BOIL_FRAMES` versions and `setTime()` swaps them ~6×/s. Scenery (house, trees, lampposts) uses `still`
  sprites that never boil (the boiling house looked like it was shaking). Sprites get a crayon texture.
- Performance (tested with Chrome's CPU throttled 4×, phone-sized at DPR 3): don't draw complex sketchy shapes every
  frame; cache them. Grandma is cached per pose (`grandmaPose`), the cottage as one sprite with smoke and twinkle
  live. The ground is a ring of 32 row slots on one canvas (`paintRow`/`drawGround`), copied to the screen
  pixel-for-pixel in ≤2 runs; `scale` is rounded so a row is a whole number of pixels. Drawing many separate
  scaled row images per frame, or one scaled strip, halved the frame rate. Tree/lamppost sprites are kept
  tight (`RISE`) because 30 trees can be on screen. `Art.warmTasks()` pre-builds every sprite a few ms per
  frame after load. Sleigh bells were trimmed to ~22 audio nodes for the same reason.
- Grandma toddles (`HOP_TIME` 0.17 s, eased, 4-unit lift, rocks side to side, alternating foot) at `GRAN_SCALE` 1.05
  (the user found 0.8 too small next to the carolers; she's now a little shorter than the adults)
  with her feet 10 units above the lane's bottom so she sits in the lane like the vehicles.
- Eggnog stacks: `nog` counts glasses, points ×(nog + 1), kept through checkpoints until she loses a life (reset each
  night). `tipsy` seconds (`nogTime`, longer per glass) make forward steps drift sideways (`nogDrift`, higher per glass).
- Fonts: Mountains of Christmas (titles) and Gaegu (handwritten UI and in-game text) from Google Fonts.
- `?debug` exposes `window.ggrobar` (see README). Screenshots/play tests were done with Playwright from
  `~/workspace/projects/witches-brew/node_modules`; there's no Playwright dependency here.
- Deployed on GitHub Pages from `main` at the repo root: https://braickish.github.io/ggrobar/
- **Before every push: `npm run bump`.** It stamps a new `?v=` on the stylesheet, `game.js` and every module
  import. Pages lets browsers cache each file ~10 min, and a browser holding the previous release could mix an old
  module with a new one (e.g. old `stages.js` without `SECTIONS`), which stops the game loading: a blank board.
  index.html also shows a "reload" card if the game hasn't started 4 s after load.
- Ideas for later: leaderboard (same Supabase pattern as Witch's Brew; a fixed-length walk suits it), the kids'
  own drawings, more sections, a "cocoa" extra life.
