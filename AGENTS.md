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
- Art: storybook style drawn with canvas calls. Static things are cached sprites (`sprite()` in art.js,
  rebuilt when the scale changes); Grandma, the cottage lights/smoke, deaths and effects draw each frame.
  The row backgrounds and paper grain are prerendered per stage/resize.
- Fonts: Mountains of Christmas (titles) and Fredoka (UI) from Google Fonts.
- `?debug` exposes `window.ggrobar` (see README). Screenshots/play tests were done with Playwright from
  `~/workspace/projects/witches-brew/node_modules`; there's no Playwright dependency here.
- Deployed on GitHub Pages from `main` at the repo root: https://braickish.github.io/ggrobar/
- Ideas for later: leaderboard (same Supabase pattern as Witch's Brew), the kids' own drawings, more stages,
  a "cocoa" extra life.
