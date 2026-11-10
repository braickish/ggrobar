# GGROBAR

A Christmas lane-crossing browser game: Grandma walks home on Christmas Eve past cars, sleds, thin ice
and a regularly swooping sleigh. Built for a parent and their kids; keep it approachable and kid-friendly
(getting hit is cartoonish: pancake, ice cube, snowman).

- The name is an acronym the user chose. Keep the song's lyrics, melody and full title out of the game,
  and don't copy Frogger's look, layout or sounds; the lane-crossing genre itself is fine.
- Static site, no build step, ES modules: `index.html`, `style.css`, `stages.js` (row layouts, meant to be
  edited by hand), `logic.js` (pure rules, imported by the game and by Node tests), `art.js` (all drawing),
  `sound.js` (Web Audio synth, no files; iPhone unlock copied from Witch's Brew), `game.js` (loop, input, rendering).
- Board: 9 columns × 13 rows of 60-unit tiles under a 130-unit sky strip with the cottage (540×910 logical),
  scaled to fit. Row 0 is the start; row 12 is the yard (home). Fixed 60 Hz update.
- Movers loop over a 15-tile track (3 hidden tiles each side) with even spacing, so gaps never change.
  `tests/logic.test.mjs` checks every hazard row leaves a gap ≥ 1.8 tiles and pond rows don't leave long waits.
- Santa: idle → warn (bells, bell icon and a growing shadow on the chosen row, `SANTA_WARN` s) → swoop.
  Row picking favours rows near Grandma (`pickSantaRow`). Interval comes from `roundSetup(r).santaEvery`.
- Art: hand-drawn storybook style drawn with canvas calls. Every shape goes through `sketchy()` in art.js, a
  Proxy over the 2D context that records path commands and redraws them as wobbly lines (fill and outline
  wobble differently; dark ink outlines get a second thinner pass). Lines "boil": `sprite()` caches
  `BOIL_FRAMES` versions of everything and `setTime()` swaps them ~6×/s. Sprites get a crayon texture.
  Don't draw complex sketchy shapes every frame (it cost frames on a slowed CPU); cache them as sprites.
  Grandma is cached per pose (`grandmaPose`: facing × step progress in quarters × which foot), the cottage
  as one sprite with smoke and twinkle glows drawn live. Deaths draw sketchy live (they're brief).
  Row backgrounds (with pencil hatching on snow) and the crayon grain are prerendered per stage/resize.
- Grandma toddles (`HOP_TIME` 0.17 s, eased, 4-unit lift, rocks side to side, alternating foot) at 0.8 scale
  with her feet 10 units above the lane's bottom so she sits in the lane like the vehicles.
- Fonts: Mountains of Christmas (titles) and Gaegu (handwritten UI and in-game text) from Google Fonts.
- `?debug` exposes `window.ggrobar` (see README). Screenshots/play tests were done with Playwright from
  `~/workspace/projects/witches-brew/node_modules`; there's no Playwright dependency here.
- Deployed on GitHub Pages from `main` at the repo root: https://braickish.github.io/ggrobar/
- Ideas for later: leaderboard (same Supabase pattern as Witch's Brew), the kids' own drawings, more stages,
  a "cocoa" extra life.
