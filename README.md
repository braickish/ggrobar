# GGROBAR

It's Christmas Eve, and Grandma's walking home from the party. Get her across the roads, the
sledding hill and the frozen pond, and watch the sky: a sleigh comes through every few seconds.

**Play:** https://braickish.github.io/ggrobar/

## How to play

- **Computer:** arrow keys or WASD. **Phone:** swipe, or tap on the side of Grandma you want her to go.
- When you hear **sleigh bells**, a shadow sweeps across one row and then the sleigh swoops through it. Get out of that row!
- On the pond, stand on the ice floes. The water, and floes that drift off the edge, are a sploosh.
  Floes with cracks in them sink for a moment every few seconds.
- The **cold meter** runs down while you walk. If it runs out, Grandma turns into a snowman.
- Three lives. Lose them all and it's back to round 1.

## Points

| | |
| --- | --- |
| Each new row reached | 10 |
| Reading glasses, fruitcake, present | 25 each |
| All three in one crossing | 150 bonus |
| Getting home | 100, plus 3 per second left on the cold meter |
| Eggnog | doubles everything for 5 seconds, but she wobbles sideways sometimes |

The game cycles through three stages: Main Street, Sledding Hill and The Frozen Pond. Each time it
comes back to Main Street, everything is faster and snowier, and the sleigh comes more often.

## Make it yours

- **New stages or tweaks:** [`stages.js`](stages.js) lists every row of every stage, with what moves in it, which way, and how fast.
- **Difficulty and points:** the numbers at the top of [`logic.js`](logic.js) and `roundSetup` in the same file.
- **Art:** everything is drawn in code in [`art.js`](art.js), one function per thing (`grandma`, `car`, `sleigh`, …).

## Running locally

It's a static site with no build step:

```sh
python3 -m http.server 8766
# open http://localhost:8766/
#   ?debug   adds window.ggrobar test hooks (start, move, warp, santa, invincible, kill, pause, stats)
npm test     # checks the stages and rules
```
