# GGROBAR

It's Christmas Eve, and Grandma's walking home from the party: through the neighborhood, over the sledding hill,
across the frozen pond and through the woods. The view scrolls along with her, and the sky has a sleigh
in it that comes through every few seconds.

**Play:** https://braickish.github.io/ggrobar/

## How to play

- **Computer:** arrow keys or WASD. **Phone:** swipe, or tap on the side of Grandma you want her to go.
- When you hear **sleigh bells** and see a **red glow** at the side of a row, that's the lead reindeer's nose:
  the sleigh is about to swoop through that row. Get out of it!
- Walking into the **side** of a car, sled, bike or animal bounces Grandma back: she twirls, then stumbles
  back one more row (watch what's behind her!). Getting hit **head-on** (its front reaching her) is what flattens her.
- In the neighborhood, kids in Santa hats zoom down the streets on e-bikes, and on the sidewalks carolers stop
  to sing and dogs stop to sniff. **Presents fall out of the sky** too: a shadow with a red ring shows where one's
  about to land. Don't be under it, but once it's down, grab it for points before a bike runs it over (or it fades).
  Snowmen, bushes and Christmas trees in the front yards are in the way, like trees in the woods.
- In the forest, trees block the way, so look for the gaps. Bunnies hop in bursts, deer freeze then dash,
  foxes trot and stop, and the moose is slow but very wide.
- On the pond, stand on the ice floes. The water, and floes that drift off the edge, are a sploosh.
  Floes with cracks in them sink for a moment every few seconds.
- The **cold meter** runs down while you walk. If it runs out, Grandma turns into a snowman.
- **Checkpoints** between sections warm her back up, and she starts there again if she loses a life.
- Three lives. Lose them all and it's back to the party.
- Get her home to win. Then try **Next Christmas Eve**: everything's faster and the sleigh comes more often,
  and your score and lives carry on.

## Points

| | |
| --- | --- |
| Each new row reached | 10 |
| Reaching a checkpoint | 100, plus 3 per second left on the cold meter |
| Reading glasses, fruitcake, present | 25 each (every section has a set) |
| A present that fell from the sky | 50 |
| All three in one section | 150 bonus |
| Getting home | 300, plus 3 per second left on the cold meter, plus 100 per life left |
| Eggnog | ×2 points, then ×3, ×4… with every glass, until she loses a life. Each glass makes her tipsy for longer (12 s, then 18, 24…): her steps wander sideways sometimes |

The walk gets busier as it goes: each section is a little faster than the last, and the sleigh comes more often.

## Make it yours

- **The walk:** [`stages.js`](stages.js) lists every section of the walk and every row in it: what moves there, which
  way and how fast, and where the trees are (`'T..TT.T.T'`: T is a tree). `npm test` checks the walk can still be done.
- **Difficulty and points:** the numbers at the top of [`logic.js`](logic.js) and `buildRoute` in the same file.
- **Art:** everything is drawn in code in [`art.js`](art.js), one function per thing (`grandma`, `car`, `sleigh`, …).

## Running locally

It's a static site with no build step:

```sh
python3 -m http.server 8766
# open http://localhost:8766/
#   ?debug   adds window.ggrobar test hooks (start, move, warp, santa, invincible, kill, pause, step, stats)
npm test     # checks the walk and the rules
```
