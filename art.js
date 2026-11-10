// All the art, drawn with plain canvas calls in a soft storybook style: rounded shapes, gentle
// gradients, warm lights against a cold blue night, and an ink outline that isn't quite black.
// Things that don't animate are drawn once into small offscreen canvases ("sprites") and reused.

export const TILE = 60;
export const INK = '#2b2a48';
export const C = {
  snow: '#eef3fb', snowShade: '#cdd8ec', snowDeep: '#b3c2de',
  road: '#56607f', roadDark: '#465070',
  water: '#1d4864', waterLight: '#2d6b8a',
  ice: '#e6f4fc', iceEdge: '#9cc3dc',
  warm: '#ffd27a', warmDeep: '#f2a649',
  red: '#c9443c', green: '#2f7a55', gold: '#e8b54e',
  coat: '#8a4f9e', coatDark: '#6a3a7d', skin: '#f3cfb0', hair: '#f6f3ef',
};

const TAU = Math.PI * 2;

// ---- The hand-drawn wobble ----
// Every shape goes through sketchy(): its outline is traced as many short steps with a gentle, smooth
// wobble, the fill is traced with a different wobble so it doesn't quite meet the line, and dark ink
// lines get a second, thinner pass like a pencil going over them twice. Lines "boil": there are
// BOIL_FRAMES slightly different versions of everything, swapped a few times a second.
export const BOIL_FRAMES = 3;
const BOIL_RATE = 6;                 // swaps per second
const WOBBLE = 1.5;                  // how far lines stray, in game units
let boil = 0;
export function setTime(t) { boil = Math.floor(t * BOIL_RATE) % BOIL_FRAMES; }

const PATH_OPS = new Set(['moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'ellipse', 'rect', 'closePath']);

function sketchy(g, seed = 1, amp = WOBBLE) {
  if (g.isSketchy) return g;
  let ops = [];
  let pathSeed = seed;
  let count = 0;
  return new Proxy(g, {
    get(t, prop) {
      if (prop === 'isSketchy') return true;
      if (prop === 'beginPath') return () => { ops = []; pathSeed = seed * 977 + ++count; };
      if (PATH_OPS.has(prop)) return (...a) => { ops.push([prop, a]); };
      if (prop === 'fill' || prop === 'clip') {
        return (...a) => { trace(t, flatten(ops), amp * 0.9, pathSeed + 0.5); t[prop](...a); };
      }
      if (prop === 'stroke') {
        return () => {
          const subs = flatten(ops);
          trace(t, subs, amp, pathSeed);
          t.stroke();
          if (t.strokeStyle === INK && t.lineWidth >= 1.4 && !t.getLineDash().length) {
            t.save();
            t.lineWidth *= 0.45;
            t.globalAlpha *= 0.6;
            trace(t, subs, amp * 1.7, pathSeed + 0.25);
            t.stroke();
            t.restore();
          }
        };
      }
      const v = t[prop];
      return typeof v === 'function' ? v.bind(t) : v;
    },
    set(t, prop, v) { t[prop] = v; return true; },
  });
}

// Turn recorded path commands into lists of points, about every 4 units.
function flatten(ops) {
  const subs = [];
  let sub = null, cur = null;
  const add = (x, y) => {
    if (!sub) { sub = { pts: [], closed: false }; subs.push(sub); }
    sub.pts.push([x, y]);
    cur = [x, y];
  };
  const seg = (x1, y1) => {
    if (!sub || !cur) { add(x1, y1); return; }
    const [x0, y0] = cur;
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4));
    for (let i = 1; i <= n; i++) add(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
  };
  const curve = (pt, len) => {
    const n = Math.max(2, Math.ceil(len / 4));
    for (let i = 1; i <= n; i++) add(...pt(i / n));
  };
  const oval = (x, y, rx, ry, rot, s, e, ccw) => {
    let d = e - s;
    if (!ccw) { if (d >= TAU) d = TAU; else { d %= TAU; if (d < 0) d += TAU; } }
    else { if (-d >= TAU) d = -TAU; else { d %= TAU; if (d > 0) d -= TAU; } }
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const at = (a) => {
      const px = Math.cos(a) * rx, py = Math.sin(a) * ry;
      return [x + px * cr - py * sr, y + px * sr + py * cr];
    };
    seg(...at(s));
    const n = Math.max(6, Math.ceil((Math.abs(d) * Math.max(rx, ry)) / 4));
    for (let i = 1; i <= n; i++) add(...at(s + (d * i) / n));
  };
  for (const [op, a] of ops) {
    if (op === 'moveTo') { sub = null; add(a[0], a[1]); }
    else if (op === 'lineTo') seg(a[0], a[1]);
    else if (op === 'quadraticCurveTo') {
      if (!cur) add(a[0], a[1]);
      const [x0, y0] = cur;
      const len = Math.hypot(a[0] - x0, a[1] - y0) + Math.hypot(a[2] - a[0], a[3] - a[1]);
      curve((t) => {
        const u = 1 - t;
        return [u * u * x0 + 2 * u * t * a[0] + t * t * a[2], u * u * y0 + 2 * u * t * a[1] + t * t * a[3]];
      }, len);
    } else if (op === 'bezierCurveTo') {
      if (!cur) add(a[0], a[1]);
      const [x0, y0] = cur;
      const len = Math.hypot(a[0] - x0, a[1] - y0) + Math.hypot(a[2] - a[0], a[3] - a[1]) + Math.hypot(a[4] - a[2], a[5] - a[3]);
      curve((t) => {
        const u = 1 - t;
        return [
          u * u * u * x0 + 3 * u * u * t * a[0] + 3 * u * t * t * a[2] + t * t * t * a[4],
          u * u * u * y0 + 3 * u * u * t * a[1] + 3 * u * t * t * a[3] + t * t * t * a[5],
        ];
      }, len);
    } else if (op === 'arc') oval(a[0], a[1], a[2], a[2], 0, a[3], a[4], !!a[5]);
    else if (op === 'ellipse') oval(a[0], a[1], a[2], a[3], a[4], a[5], a[6], !!a[7]);
    else if (op === 'rect') {
      const [x, y, w, h] = a;
      sub = null; add(x, y); seg(x + w, y); seg(x + w, y + h); seg(x, y + h); seg(x, y);
      sub.closed = true; sub = null; cur = [x, y];
    } else if (op === 'closePath') {
      if (sub) { sub.closed = true; cur = sub.pts[0]; sub = null; }
    }
  }
  return subs;
}

// Draw the points back as a path with a smooth wobble. Closed shapes wobble in a loop so their
// ends meet; small shapes wobble less so eyes and buttons stay neat.
function trace(g, subs, amp, seed) {
  g.beginPath();
  subs.forEach((sp, idx) => {
    const pts = sp.pts;
    if (!pts.length) return;
    const first = pts[0], last = pts[pts.length - 1];
    const closed = sp.closed || (pts.length > 2 && Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.5);
    let L = 0;
    const along = [0];
    for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); along.push(L); }
    const a = Math.min(amp, L * 0.022);
    const r = seeded(Math.floor(seed * 131 + idx * 17) + 7);
    const p = [r() * TAU, r() * TAU, r() * TAU, r() * TAU];
    const f1 = closed ? (TAU * Math.max(1, Math.round(L / 50))) / Math.max(L, 1) : TAU / 50;
    const f2 = closed ? (TAU * Math.max(2, Math.round(L / 18))) / Math.max(L, 1) : TAU / 18;
    for (let i = 0; i < pts.length; i++) {
      const s = along[i];
      const ox = a * (0.7 * Math.sin(s * f1 + p[0]) + 0.3 * Math.sin(s * f2 + p[1]));
      const oy = a * (0.7 * Math.sin(s * f1 + p[2]) + 0.3 * Math.sin(s * f2 + p[3]));
      if (i === 0) g.moveTo(pts[i][0] + ox, pts[i][1] + oy);
      else g.lineTo(pts[i][0] + ox, pts[i][1] + oy);
    }
    if (closed) g.closePath();
  });
}

// A crayon-and-pencil texture laid over the colors of each sprite.
let crayon = null;
function crayonPattern(g) {
  if (!crayon) {
    crayon = document.createElement('canvas');
    crayon.width = crayon.height = 96;
    const c = crayon.getContext('2d');
    const r = seeded(77);
    c.lineCap = 'round';
    for (let i = 0; i < 260; i++) {
      const x = r() * 96, y = r() * 96, len = 3 + r() * 7;
      c.strokeStyle = r() < 0.55 ? `rgba(30,25,60,${0.05 + r() * 0.08})` : `rgba(255,252,240,${0.08 + r() * 0.12})`;
      c.lineWidth = 0.6 + r() * 0.9;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + len * 0.8, y - len * 0.6); c.stroke();
    }
  }
  return g.createPattern(crayon, 'repeat');
}
function crayonOver(g, x, y, w, h) {
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = crayonPattern(g);
  g.fillRect(x, y, w, h);
  g.restore();
}

// ---- Sprite cache ----
let S = 1;
const cache = new Map();
export function setScale(s) { S = s; cache.clear(); }

const hash = (str) => { let h = 7; for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 10007; };

// Each sprite is drawn once per boil frame and kept. Scenery passes still = true: one drawing that
// never boils, so big things like the house sit calmly in the background.
function sprite(key, w, h, pad, draw, still = false) {
  const frame = still ? 0 : boil;
  const k = `${key}#${still ? 's' : frame}`;
  let c = cache.get(k);
  if (!c) {
    c = document.createElement('canvas');
    c.width = Math.ceil((w + 2 * pad) * S);
    c.height = Math.ceil((h + 2 * pad) * S);
    const g = c.getContext('2d');
    g.scale(S, S);
    g.translate(pad, pad);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    draw(sketchy(g, hash(key) + frame * 101, still ? 1.1 : WOBBLE));
    crayonOver(g, -pad, -pad, w + 2 * pad, h + 2 * pad);
    c.pad = pad; c.lw = w; c.lh = h;
    cache.set(k, c);
  }
  return c;
}

// Draw a sprite with its box's top-left at (x, y); flip mirrors it so it faces left.
export function blit(ctx, c, x, y, flip = false) {
  const p = c.pad;
  if (!flip) {
    ctx.drawImage(c, x - p, y - p, c.lw + 2 * p, c.lh + 2 * p);
  } else {
    ctx.save();
    ctx.translate(x + c.lw / 2, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(c, -c.lw / 2 - p, y - p, c.lw + 2 * p, c.lh + 2 * p);
    ctx.restore();
  }
}

// ---- Little drawing helpers ----
function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); }
function circ(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
function paint(g, fill, stroke = INK, lw = 2) {
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}
function vgrad(g, y0, y1, a, b) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, a); gr.addColorStop(1, b);
  return gr;
}
function glow(g, x, y, r, color, alpha = 1) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, 2 * r, 2 * r);
  g.restore();
}
// A smooth closed shape through points.
function blob(g, pts) {
  g.beginPath();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    if (i === 0) g.moveTo(mx, my);
    else g.quadraticCurveTo(a[0], a[1], mx, my);
  }
  const a = pts[0], b = pts[1 % n];
  g.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  g.closePath();
}
// Seeded randomness so the scenery looks the same every time.
function seeded(seed) {
  let s = seed * 9301 + 49297;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}
// A lumpy cap of snow along the top of something.
function snowCap(g, x0, x1, y, thick, seed = 1) {
  const r = seeded(seed);
  g.beginPath();
  g.moveTo(x0 - 2, y + 2);
  const n = Math.max(3, Math.round((x1 - x0) / 10));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    g.lineTo(x, y - thick * (0.6 + r() * 0.5));
  }
  g.lineTo(x1 + 2, y + 2);
  for (let i = n; i >= 0; i--) {
    const x = x0 + ((x1 - x0) * i) / n;
    const drip = r() < 0.3 ? 4 + r() * 4 : 1.5;
    g.lineTo(x, y + drip);
  }
  g.closePath();
  paint(g, C.snow, INK, 1.5);
}
function wheel(g, x, y, r) {
  circ(g, x, y, r); paint(g, '#24233a', INK, 2);
  circ(g, x, y, r * 0.45); paint(g, '#a9b2cc', null);
  circ(g, x - r * 0.15, y - r * 0.15, r * 0.15); paint(g, '#e6ebf7', null);
}
function star(g, x, y, r, points = 5) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * TAU - Math.PI / 2;
    const rad = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  g.closePath();
}

// ---- Vehicles and movers (all drawn facing right; the box is w tiles × 1 tile) ----
const CAR_COLORS = [['#d24b42', '#a3332d'], ['#3f948e', '#2c6d68'], ['#e0a640', '#b47d22'], ['#5577bf', '#3d5893']];

export function car(variant) {
  const w = 1.5 * TILE;
  return sprite(`car${variant}`, w, TILE, 40, (g) => {
    const [body, dark] = CAR_COLORS[variant % CAR_COLORS.length];
    // headlight beam
    g.save();
    const beam = g.createLinearGradient(w - 4, 0, w + 40, 0);
    beam.addColorStop(0, 'rgba(255,230,160,0.45)');
    beam.addColorStop(1, 'rgba(255,230,160,0)');
    g.fillStyle = beam;
    g.beginPath(); g.moveTo(w - 6, 31); g.lineTo(w + 40, 20); g.lineTo(w + 40, 48); g.lineTo(w - 6, 37); g.fill();
    g.restore();
    ell(g, w / 2, 52, w / 2 - 4, 5); paint(g, 'rgba(20,24,50,0.3)', null);
    // cabin
    g.beginPath();
    g.moveTo(20, 27); g.quadraticCurveTo(26, 11, 38, 11); g.lineTo(58, 11); g.quadraticCurveTo(66, 12, 72, 27); g.closePath();
    paint(g, vgrad(g, 10, 27, body, dark));
    g.beginPath(); g.moveTo(27, 26); g.quadraticCurveTo(31, 15, 39, 15); g.lineTo(45, 15); g.lineTo(45, 26); g.closePath();
    paint(g, vgrad(g, 15, 26, '#33416f', '#5c6fa3'), INK, 1.5);
    g.beginPath(); g.moveTo(49, 26); g.lineTo(49, 15); g.lineTo(57, 15); g.quadraticCurveTo(63, 16, 66, 26); g.closePath();
    paint(g, vgrad(g, 15, 26, '#33416f', '#5c6fa3'), INK, 1.5);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.moveTo(33, 24); g.lineTo(38, 17); g.lineTo(40, 17); g.lineTo(35, 24); g.fill();
    // body
    rr(g, 3, 25, w - 6, 21, 9); paint(g, vgrad(g, 25, 46, body, dark));
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(47, 28); g.lineTo(47, 43); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.25)'; rr(g, 9, 28, w - 22, 3, 2); g.fill();
    // lights
    ell(g, w - 5, 33, 3, 4); paint(g, '#fff3c4', INK, 1.2);
    ell(g, 5, 33, 2.5, 3.5); paint(g, '#ff5a4a', INK, 1.2);
    glow(g, 4, 33, 10, 'rgba(255,80,60,0.6)');
    wheel(g, 22, 46, 8);
    wheel(g, w - 22, 46, 8);
    snowCap(g, 30, 64, 12, 5, variant + 3);
  });
}

export function plow() {
  const w = 2.6 * TILE;
  return sprite('plow', w, TILE, 40, (g) => {
    ell(g, w / 2, 53, w / 2 - 6, 5); paint(g, 'rgba(20,24,50,0.3)', null);
    // bed full of snow
    g.beginPath(); g.moveTo(4, 18); g.lineTo(92, 18); g.lineTo(88, 44); g.lineTo(8, 44); g.closePath();
    paint(g, vgrad(g, 18, 44, '#7c88a8', '#59637f'));
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1.5;
    for (const x of [28, 50, 72]) { g.beginPath(); g.moveTo(x, 21); g.lineTo(x - 1, 41); g.stroke(); }
    blob(g, [[6, 19], [20, 6], [40, 3], [62, 6], [84, 4], [92, 18], [50, 21]]); paint(g, C.snow, INK, 1.5);
    // cab
    g.beginPath(); g.moveTo(92, 44); g.lineTo(92, 12); g.quadraticCurveTo(93, 8, 98, 8); g.lineTo(118, 8);
    g.quadraticCurveTo(126, 9, 130, 22); g.lineTo(136, 26); g.lineTo(136, 44); g.closePath();
    paint(g, vgrad(g, 8, 44, '#f0913a', '#c9661d'));
    g.beginPath(); g.moveTo(104, 12); g.lineTo(117, 12); g.quadraticCurveTo(123, 13, 126, 24); g.lineTo(104, 24); g.closePath();
    paint(g, vgrad(g, 12, 24, '#33416f', '#5c6fa3'), INK, 1.5);
    g.fillStyle = '#2b2a48'; rr(g, 96, 30, 36, 3, 1); g.fill();
    // blade
    g.beginPath(); g.moveTo(138, 22); g.quadraticCurveTo(152, 26, 156, 52); g.lineTo(142, 52); g.quadraticCurveTo(140, 36, 136, 30); g.closePath();
    paint(g, vgrad(g, 22, 52, '#f3d258', '#d1a72c'));
    g.strokeStyle = '#2b2a48'; g.lineWidth = 2.5;
    for (const y of [32, 42]) { g.beginPath(); g.moveTo(141, y); g.lineTo(151, y + 3); g.stroke(); }
    // beacon (lit by the game)
    rr(g, 108, 2, 10, 7, 3); paint(g, '#f6b84a', INK, 1.5);
    wheel(g, 26, 46, 10); wheel(g, 66, 46, 10); wheel(g, 116, 46, 10);
    snowCap(g, 96, 126, 8, 4, 9);
  });
}

export function van(variant) {
  const w = 2.2 * TILE;
  return sprite(`van${variant}`, w, TILE, 40, (g) => {
    ell(g, w / 2, 53, w / 2 - 4, 5); paint(g, 'rgba(20,24,50,0.3)', null);
    // a little tree tied on the roof
    g.beginPath(); g.moveTo(26, 6); g.lineTo(76, 0); g.lineTo(76, 12); g.closePath(); paint(g, '#2f7a55', INK, 1.5);
    g.strokeStyle = '#7a4a2a'; g.lineWidth = 3; g.beginPath(); g.moveTo(76, 6); g.lineTo(84, 6); g.stroke();
    g.beginPath(); g.moveTo(26, 6); g.lineTo(76, 0); g.lineTo(76, 3); g.lineTo(30, 6); g.closePath(); paint(g, C.snow, null);
    // body
    g.beginPath(); g.moveTo(6, 46); g.lineTo(4, 16); g.quadraticCurveTo(4, 9, 12, 9); g.lineTo(104, 9);
    g.quadraticCurveTo(118, 10, 126, 26); g.lineTo(128, 46); g.closePath();
    paint(g, vgrad(g, 9, 46, '#f3e8cf', '#d9c8a4'));
    g.beginPath(); g.moveTo(5, 34); g.lineTo(127.5, 34); g.lineTo(128, 46); g.lineTo(6, 46); g.closePath();
    paint(g, C.green, INK, 2);
    // windshield
    g.beginPath(); g.moveTo(106, 13); g.quadraticCurveTo(116, 15, 121, 27); g.lineTo(106, 27); g.closePath();
    paint(g, vgrad(g, 13, 27, '#33416f', '#5c6fa3'), INK, 1.5);
    // windows with carolers
    const hats = ['#c9443c', '#2f7a55', '#e8b54e'];
    for (let i = 0; i < 3; i++) {
      const x = 14 + i * 29;
      rr(g, x, 13, 24, 15, 4); paint(g, vgrad(g, 13, 28, '#ffe3a0', '#f2b35e'), INK, 1.5);
      const hx = x + 12, hy = 24;
      circ(g, hx, hy, 6); paint(g, C.skin, INK, 1.2);
      g.beginPath(); g.moveTo(hx - 6, hy - 3); g.quadraticCurveTo(hx, hy - 12, hx + 6, hy - 3); g.closePath();
      paint(g, hats[(i + variant) % 3], INK, 1.2);
      circ(g, hx, hy + 1.5, 1.6); paint(g, '#5a2a2a', null);
    }
    // wreath on the side
    circ(g, 30, 40, 0.1);
    g.lineWidth = 4; g.strokeStyle = '#2f7a55'; g.beginPath(); g.arc(98, 40, 4.5, 0, TAU); g.stroke();
    circ(g, 98, 45, 1.8); paint(g, C.red, null);
    ell(g, 126, 30, 2.5, 3.5); paint(g, '#fff3c4', INK, 1.2);
    wheel(g, 26, 46, 8); wheel(g, w - 26, 46, 8);
  });
}

const KID_COATS = ['#3e7fc1', '#d24b42', '#3f948e', '#e0a640'];
export function sled(variant) {
  const w = 1.1 * TILE;
  return sprite(`sled${variant}`, w, TILE, 30, (g) => {
    const coat = KID_COATS[variant % 4];
    const hat = KID_COATS[(variant + 1) % 4];
    ell(g, w / 2, 53, w / 2, 4); paint(g, 'rgba(20,24,50,0.25)', null);
    // snow kicked up behind
    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (const [x, y, r] of [[-6, 46, 4], [-12, 42, 3], [-3, 40, 2.5]]) { circ(g, x, y, r); g.fill(); }
    // runner
    g.strokeStyle = '#7a4a2a'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(4, 50); g.lineTo(52, 50); g.quadraticCurveTo(64, 50, 62, 40); g.quadraticCurveTo(60, 35, 56, 38); g.stroke();
    rr(g, 6, 41, 48, 6, 2); paint(g, vgrad(g, 41, 47, '#c48a52', '#9a6332'), INK, 1.5);
    // kid
    g.beginPath(); g.moveTo(16, 42); g.quadraticCurveTo(18, 24, 30, 23); g.quadraticCurveTo(40, 24, 42, 42); g.closePath();
    paint(g, vgrad(g, 23, 42, coat, coat));
    ell(g, 46, 41, 7, 4); paint(g, '#3a3550', INK, 1.5);
    g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(36, 31); g.lineTo(52, 36); g.stroke();
    circ(g, 52, 36, 3); paint(g, hat, INK, 1.2);
    circ(g, 31, 17, 8); paint(g, C.skin, INK, 1.5);
    g.beginPath(); g.moveTo(23, 16); g.quadraticCurveTo(28, 4, 38, 13); g.lineTo(38, 16); g.closePath(); paint(g, hat, INK, 1.5);
    circ(g, 22, 9, 3.5); paint(g, '#fff', INK, 1.2);
    circ(g, 35, 17, 1.3); paint(g, INK, null);
    circ(g, 34, 21, 2); paint(g, 'rgba(240,120,120,0.5)', null);
    // scarf streaming behind
    g.beginPath(); g.moveTo(26, 24); g.quadraticCurveTo(14, 20, 4, 26); g.lineTo(6, 30); g.quadraticCurveTo(16, 26, 27, 28); g.closePath();
    paint(g, hat, INK, 1.2);
  });
}

export function skater(variant, frame = 0) {
  const w = 0.9 * TILE;
  return sprite(`skater${variant}-${frame}`, w, TILE, 30, (g) => {
    const coat = KID_COATS[(variant + 2) % 4];
    const scarf = KID_COATS[(variant + 3) % 4];
    ell(g, w / 2, 54, w / 2, 3.5); paint(g, 'rgba(20,24,50,0.25)', null);
    const back = frame ? 6 : 14;
    // legs
    g.strokeStyle = '#3a3550'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(28, 36); g.lineTo(32, 50); g.stroke();
    g.beginPath(); g.moveTo(25, 36); g.lineTo(25 - back, 46 - (frame ? 0 : 4)); g.stroke();
    g.strokeStyle = '#d7dff0'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(27, 52); g.lineTo(39, 52); g.stroke();
    g.beginPath(); g.moveTo(25 - back - 6, 48 - (frame ? 0 : 4)); g.lineTo(25 - back + 4, 48 - (frame ? 0 : 4)); g.stroke();
    // body leaning forward
    g.beginPath(); g.moveTo(18, 38); g.quadraticCurveTo(22, 18, 32, 17); g.quadraticCurveTo(40, 20, 36, 38); g.closePath();
    paint(g, coat);
    g.strokeStyle = coat; g.lineWidth = 4;
    g.beginPath(); g.moveTo(24, 24); g.lineTo(12, 28); g.stroke();
    g.beginPath(); g.moveTo(32, 23); g.lineTo(44, 26); g.stroke();
    circ(g, 36, 12, 7.5); paint(g, C.skin, INK, 1.5);
    g.beginPath(); g.arc(36, 11, 8, Math.PI * 1.05, Math.PI * 1.95); g.lineWidth = 3; g.strokeStyle = '#6b3d26'; g.stroke();
    circ(g, 30, 12, 3.5); paint(g, scarf, INK, 1.2);  // earmuff
    circ(g, 39, 12, 1.2); paint(g, INK, null);
    g.beginPath(); g.moveTo(30, 19); g.quadraticCurveTo(18, 16, 8, 20); g.lineTo(10, 23); g.quadraticCurveTo(20, 21, 31, 22); g.closePath();
    paint(g, scarf, INK, 1.2);
  });
}

// An ice floe seen from above, size tiles long.
export function floe(size, variant, thin) {
  const w = size * TILE;
  return sprite(`floe${size}-${variant}-${thin ? 1 : 0}`, w, TILE, 10, (g) => {
    const r = seeded(size * 31 + variant * 7 + (thin ? 101 : 0));
    const pts = [];
    const n = 8 + size * 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const rx = w / 2 - 3 - r() * 5, ry = 22 - r() * 4;
      pts.push([w / 2 + Math.cos(a) * rx, 31 + Math.sin(a) * ry]);
    }
    g.save(); g.translate(2, 5); blob(g, pts); paint(g, 'rgba(10,30,50,0.35)', null); g.restore();
    blob(g, pts);
    paint(g, thin ? vgrad(g, 9, 53, 'rgba(214,236,250,0.85)', 'rgba(150,196,226,0.85)') : vgrad(g, 9, 53, '#f7fcff', '#c5e0f2'), C.iceEdge, 2);
    // a lip of thicker ice / snow
    g.save(); blob(g, pts); g.clip();
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < size * 2; i++) { ell(g, 10 + r() * (w - 20), 16 + r() * 26, 6 + r() * 10, 3 + r() * 3); g.fill(); }
    g.strokeStyle = 'rgba(120,170,205,0.6)'; g.lineWidth = 1.2;
    if (thin) {
      g.strokeStyle = 'rgba(60,110,150,0.8)'; g.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) {
        let x = 10 + r() * (w - 20), y = 14 + r() * 30;
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 22; y += (r() - 0.5) * 16; g.lineTo(x, y); }
        g.stroke();
      }
    } else {
      for (let i = 0; i < 2; i++) { g.beginPath(); g.moveTo(14 + r() * 20, 20 + r() * 20); g.lineTo(30 + r() * 30, 22 + r() * 20); g.stroke(); }
    }
    g.restore();
  });
}

// Santa's sleigh and reindeer, flying right. Two frames for the gallop.
export function sleigh(frame) {
  const w = 4.6 * TILE, h = 70;
  return sprite(`sleigh${frame}`, w, h, 20, (g) => {
    // reins
    g.strokeStyle = '#7a3b2a'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(92, 28); g.quadraticCurveTo(140, 42, 196, 30); g.stroke();
    g.beginPath(); g.moveTo(92, 28); g.quadraticCurveTo(170, 40, 262, 30); g.stroke();
    reindeer(g, 248, 30, frame, 1, true);
    reindeer(g, 186, 32, 1 - frame, 0.94);
    // sleigh
    g.beginPath();
    g.moveTo(8, 18); g.quadraticCurveTo(4, 50, 30, 52); g.lineTo(96, 52); g.quadraticCurveTo(112, 50, 108, 32);
    g.quadraticCurveTo(104, 28, 98, 34); g.lineTo(92, 40); g.lineTo(30, 40); g.quadraticCurveTo(22, 36, 24, 18); g.closePath();
    paint(g, vgrad(g, 18, 52, '#d9473c', '#9c2a24'));
    g.strokeStyle = C.gold; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(14, 26); g.quadraticCurveTo(14, 46, 34, 47); g.lineTo(92, 47); g.stroke();
    // runner
    g.strokeStyle = C.gold; g.lineWidth = 3;
    g.beginPath(); g.moveTo(14, 62); g.lineTo(104, 62); g.quadraticCurveTo(120, 62, 118, 50); g.quadraticCurveTo(116, 44, 110, 48); g.stroke();
    g.lineWidth = 2; for (const x of [34, 84]) { g.beginPath(); g.moveTo(x, 52); g.lineTo(x, 62); g.stroke(); }
    // sack of presents
    blob(g, [[22, 22], [26, 2], [44, -2], [52, 8], [48, 26]]); paint(g, '#a37a4f');
    rr(g, 30, -4, 10, 8, 2); paint(g, '#3f948e', INK, 1.2);
    // Santa
    g.beginPath(); g.moveTo(52, 36); g.quadraticCurveTo(52, 12, 66, 12); g.quadraticCurveTo(80, 12, 80, 36); g.closePath();
    paint(g, '#d24b42');
    g.fillStyle = '#f6f3ef'; rr(g, 52, 30, 28, 5, 2); g.fill();
    circ(g, 70, 8, 8); paint(g, C.skin, INK, 1.5);
    blob(g, [[62, 8], [66, 22], [74, 24], [80, 14], [78, 8]]); paint(g, '#f6f3ef', INK, 1.2);
    g.beginPath(); g.moveTo(61, 4); g.quadraticCurveTo(66, -12, 54, -8); g.lineTo(78, 2); g.closePath(); paint(g, '#d24b42', INK, 1.5);
    circ(g, 53, -8, 3.5); paint(g, '#f6f3ef', INK, 1.2);
    g.fillStyle = '#f6f3ef'; rr(g, 60, 1, 19, 4, 2); g.fill();
    circ(g, 74, 7, 1.3); paint(g, INK, null);
    // arm holding the reins
    g.strokeStyle = '#d24b42'; g.lineWidth = 5; g.beginPath(); g.moveTo(74, 20); g.lineTo(90, 26); g.stroke();
    circ(g, 92, 27, 3.5); paint(g, '#2b2a48', null);
  });
}
// Where the lead reindeer's glowing nose is, in the sleigh picture (the game lights it up).
export const SLEIGH_NOSE = { x: 287, y: 15 };

function reindeer(g, x, y, frame, k, lead = false) {
  g.save(); g.translate(x, y); g.scale(k, k);
  const body = '#946342', dark = '#6e452b';
  // legs
  g.strokeStyle = dark; g.lineWidth = 3.5;
  const legs = frame ? [[-18, -26, 12], [-12, -4, 14], [12, 4, 14], [18, 26, 12]] : [[-18, -10, 14], [-12, -18, 12], [12, 22, 12], [18, 10, 14]];
  for (const [x0, x1, len] of legs) { g.beginPath(); g.moveTo(x0, 8); g.lineTo(x1 * 0.5 + x0 * 0.5, 8 + len); g.stroke(); }
  // body
  ell(g, 0, 4, 24, 11); paint(g, vgrad(g, -7, 15, body, dark));
  ell(g, -22, 0, 4, 3); paint(g, '#f6f3ef', INK, 1.2);
  // harness
  g.strokeStyle = C.red; g.lineWidth = 3; g.beginPath(); g.moveTo(-8, -6); g.lineTo(-6, 14); g.stroke();
  circ(g, -7, 10, 2.5); paint(g, C.gold, INK, 1);
  // neck and head
  g.beginPath(); g.moveTo(14, -2); g.quadraticCurveTo(20, -18, 26, -20); g.lineTo(32, -14); g.quadraticCurveTo(26, -6, 22, 6); g.closePath();
  paint(g, body);
  ell(g, 31, -18, 9, 6, 0.3); paint(g, body);
  if (lead) {
    circ(g, 39, -15, 4.2); paint(g, '#ff3b30', INK, 1.4);
    circ(g, 38, -16.5, 1.4); paint(g, '#ffd0c8', null);
  } else {
    circ(g, 39, -15, 2.4); paint(g, '#3a2a2a', null);
  }
  circ(g, 30, -20, 1.4); paint(g, INK, null);
  ell(g, 24, -24, 4, 2, -0.6); paint(g, dark, INK, 1);
  // antlers
  g.strokeStyle = '#5b3a22'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(27, -24); g.lineTo(22, -38); g.moveTo(24, -32); g.lineTo(16, -36); g.moveTo(23, -36); g.lineTo(26, -42);
  g.moveTo(30, -24); g.lineTo(32, -38); g.moveTo(31, -32); g.lineTo(37, -36); g.stroke();
  g.restore();
}

// ---- The neighborhood (drawn facing right) ----
// A kid on an e-bike in a Santa hat, pom-pom streaming behind.
export function ebike(variant) {
  const w = 1.2 * TILE;
  return sprite(`ebike${variant}`, w, TILE, 34, (g) => {
    const coat = KID_COATS[variant % 4];
    ell(g, w / 2, 54, w / 2 - 2, 3.5); paint(g, 'rgba(20,24,50,0.28)', null);
    // headlight beam
    g.save();
    const beam = g.createLinearGradient(w - 6, 0, w + 34, 0);
    beam.addColorStop(0, 'rgba(255,240,180,0.5)'); beam.addColorStop(1, 'rgba(255,240,180,0)');
    g.fillStyle = beam;
    g.beginPath(); g.moveTo(w - 8, 30); g.lineTo(w + 34, 22); g.lineTo(w + 34, 44); g.lineTo(w - 8, 34); g.fill();
    g.restore();
    // wheels and frame
    for (const x of [14, 58]) {
      circ(g, x, 45, 9.5); paint(g, null, INK, 3);
      circ(g, x, 45, 2); paint(g, '#a9b2cc', INK, 1);
    }
    g.strokeStyle = '#2e9a8c'; g.lineWidth = 3.5;
    g.beginPath(); g.moveTo(14, 45); g.lineTo(28, 30); g.lineTo(52, 30); g.lineTo(58, 45); g.moveTo(28, 30); g.lineTo(34, 45); g.lineTo(52, 30); g.stroke();
    g.beginPath(); g.moveTo(52, 30); g.lineTo(54, 18); g.stroke();
    g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(50, 18); g.lineTo(58, 17); g.stroke();
    rr(g, 30, 32, 16, 7, 2); paint(g, '#3a3f5e', INK, 1.4);                    // battery
    circ(g, 41, 35.5, 1.2); paint(g, '#7cf09a', null);
    ell(g, 59, 22, 2.5, 3); paint(g, '#fff3c4', INK, 1.1);                     // lamp
    rr(g, 20, 25, 12, 4, 2); paint(g, '#3a3550', INK, 1.3);                     // seat
    // kid
    g.strokeStyle = '#3a3550'; g.lineWidth = 4.5;
    g.beginPath(); g.moveTo(26, 24); g.lineTo(36, 34); g.lineTo(34, 44); g.stroke();
    g.beginPath(); g.moveTo(22, 4); g.quadraticCurveTo(20, 16, 26, 25); g.lineTo(34, 24); g.quadraticCurveTo(34, 12, 30, 4); g.closePath();
    paint(g, coat);
    g.strokeStyle = coat; g.lineWidth = 4; g.beginPath(); g.moveTo(30, 9); g.lineTo(50, 17); g.stroke();
    circ(g, 51, 17, 2.6); paint(g, '#3a3550', INK, 1);
    circ(g, 30, -3, 8); paint(g, C.skin, INK, 1.5);
    circ(g, 34, -4, 1.3); paint(g, INK, null);
    circ(g, 33, 0, 2); paint(g, 'rgba(240,120,120,0.55)', null);
    // Santa hat flopping back in the wind
    g.beginPath(); g.moveTo(22, -6); g.quadraticCurveTo(26, -16, 36, -9); g.quadraticCurveTo(24, -14, 10, -10); g.closePath();
    paint(g, C.red, INK, 1.5);
    rr(g, 21, -9, 17, 4.5, 2); paint(g, '#fff', INK, 1.2);
    circ(g, 9, -10, 3.5); paint(g, '#fff', INK, 1.2);
    // speed lines
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.5;
    for (const y of [20, 30, 40]) { g.beginPath(); g.moveTo(-14, y); g.lineTo(-4, y); g.stroke(); }
  });
}

// Three carolers in a row with songbooks. frame swings their legs.
const CAROL_COATS = [['#c9443c', '#2f7a55'], ['#2f7a55', '#e8b54e'], ['#5577bf', '#c9443c'], ['#8a5a9e', '#e8b54e']];
export function carolers(variant, frame = 0) {
  const w = 2.0 * TILE;
  return sprite(`carolers${variant}-${frame}`, w, TILE, 30, (g) => {
    ell(g, w / 2, 54, w / 2 - 4, 3.5); paint(g, 'rgba(20,24,50,0.28)', null);
    for (let i = 0; i < 3; i++) {
      const [coat, scarf] = CAROL_COATS[(variant + i) % 4];
      const x = 22 + i * 38, tall = i === 1 ? 4 : 0;
      const sw = (frame + i) % 2 ? 4 : -4;
      g.strokeStyle = '#3a3550'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(x - 4, 40); g.lineTo(x - 4 + sw, 53); g.moveTo(x + 4, 40); g.lineTo(x + 4 - sw, 53); g.stroke();
      // long coat
      g.beginPath(); g.moveTo(x - 13, 44); g.quadraticCurveTo(x - 12, 18 - tall, x, 16 - tall); g.quadraticCurveTo(x + 12, 18 - tall, x + 13, 44); g.closePath();
      paint(g, vgrad(g, 16, 44, coat, coat));
      // songbook
      rr(g, x + 2, 24 - tall, 14, 10, 1.5); paint(g, '#fff6d8', INK, 1.3);
      g.strokeStyle = INK; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 9, 24 - tall); g.lineTo(x + 9, 34 - tall); g.stroke();
      circ(g, x + 3, 30 - tall, 3); paint(g, C.skin, INK, 1);
      // scarf, head, singing mouth
      rr(g, x - 9, 14 - tall, 18, 5, 2.5); paint(g, scarf, INK, 1.2);
      circ(g, x, 6 - tall, 8.5); paint(g, C.skin, INK, 1.5);
      circ(g, x + 3, 4 - tall, 1.2); paint(g, INK, null);
      ell(g, x + 4, 9 - tall, 1.8, 2.4); paint(g, '#7a2a2a', null);
      if (i === 1) { // top hat
        rr(g, x - 9, -4 - tall, 18, 3.5, 1.5); paint(g, '#2b2a48', INK, 1.2);
        rr(g, x - 6, -15 - tall, 12, 12, 1.5); paint(g, '#2b2a48', INK, 1.2);
        g.fillStyle = C.red; g.fillRect(x - 6, -7 - tall, 12, 3);
      } else { // bobble hat
        g.beginPath(); g.moveTo(x - 9, 3 - tall); g.quadraticCurveTo(x, -10 - tall, x + 9, 3 - tall); g.closePath(); paint(g, scarf, INK, 1.3);
        circ(g, x, -7 - tall, 3.2); paint(g, '#fff', INK, 1.1);
      }
    }
  });
}

// Someone walking a dog in a sweater. The dog leads the way. frame swings legs.
export function dogwalker(variant, frame = 0) {
  const w = 1.8 * TILE;
  return sprite(`dogwalker${variant}-${frame}`, w, TILE, 30, (g) => {
    const coat = ['#5577bf', '#3f948e', '#d24b42', '#8a5a9e'][variant % 4];
    const sweater = ['#c9443c', '#2f7a55', '#e8b54e', '#3e7fc1'][variant % 4];
    const fur = ['#b9814a', '#f1ece2', '#3a3238', '#d9a25c'][variant % 4];
    ell(g, w / 2, 54, w / 2 - 4, 3.5); paint(g, 'rgba(20,24,50,0.28)', null);
    const sw = frame ? 4 : -4;
    // person
    g.strokeStyle = '#3a3550'; g.lineWidth = 4.5;
    g.beginPath(); g.moveTo(18, 38); g.lineTo(18 + sw, 53); g.moveTo(26, 38); g.lineTo(26 - sw, 53); g.stroke();
    g.beginPath(); g.moveTo(9, 42); g.quadraticCurveTo(10, 12, 22, 10); g.quadraticCurveTo(34, 12, 35, 42); g.closePath();
    paint(g, vgrad(g, 10, 42, coat, coat));
    g.strokeStyle = coat; g.lineWidth = 5; g.beginPath(); g.moveTo(30, 18); g.lineTo(40, 28); g.stroke();
    circ(g, 41, 29, 3); paint(g, '#3a3550', INK, 1);
    circ(g, 22, 0, 9); paint(g, C.skin, INK, 1.5);
    circ(g, 26, -1, 1.3); paint(g, INK, null);
    g.beginPath(); g.moveTo(14, -2); g.quadraticCurveTo(22, -16, 30, -2); g.closePath(); paint(g, sweater, INK, 1.4);
    for (const ex of [13, 31]) { circ(g, ex, 1, 3.6); paint(g, '#fff', INK, 1.1); }   // earmuffs
    // leash
    g.strokeStyle = C.red; g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(42, 29); g.quadraticCurveTo(58, 42, 74, 30); g.stroke();
    // dog
    const legs = frame ? [[66, 4], [72, -4], [88, 4], [94, -4]] : [[66, -4], [72, 4], [88, -4], [94, 4]];
    g.strokeStyle = '#3a2a28'; g.lineWidth = 3.5;
    for (const [x0, d] of legs) { g.beginPath(); g.moveTo(x0, 40); g.lineTo(x0 + d, 53); g.stroke(); }
    g.strokeStyle = fur; g.lineWidth = 3; g.beginPath(); g.moveTo(62, 34); g.quadraticCurveTo(54, 30, 56, 22); g.stroke();   // waggy tail
    ell(g, 80, 37, 18, 8); paint(g, fur);
    g.beginPath(); g.moveTo(70, 30); g.lineTo(90, 30); g.lineTo(92, 44); g.lineTo(68, 44); g.closePath(); paint(g, sweater, INK, 1.5);
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(70, 37); g.lineTo(91, 37); g.stroke();
    ell(g, 100, 28, 9, 7.5); paint(g, fur);
    ell(g, 108, 31, 4.5, 3.5); paint(g, fur, INK, 1.3);
    circ(g, 112, 30, 1.8); paint(g, INK, null);
    circ(g, 102, 25, 1.3); paint(g, INK, null);
    ell(g, 96, 29, 3.5, 7, 0.3); paint(g, '#5a4030', INK, 1.3);              // floppy ear
  });
}

// Front-yard things that are in the way, like trees in the woods: S snowman, B bush with lights,
// T a little Christmas tree. (C, a trash can, has its own sprites: trashCan / trashTipped.) Same box as a tree (it's drawn RISE higher).
export function yardDeco(kind, variant = 0) {
  return sprite(`deco-${kind}${variant}`, TILE, TILE + RISE, 6, (g) => {
    g.translate(0, RISE);
    ell(g, 30, 53, 22, 6); paint(g, 'rgba(60,80,130,0.25)', null);
    if (kind === 'S') {
      circ(g, 30, 38, 15); paint(g, vgrad(g, 23, 53, '#ffffff', C.snowShade), INK, 1.8);
      circ(g, 30, 16, 11); paint(g, vgrad(g, 5, 27, '#ffffff', C.snowShade), INK, 1.8);
      rr(g, 19, 22, 22, 5, 2.5); paint(g, ['#c9443c', '#2f7a55', '#5577bf'][variant % 3], INK, 1.3);
      g.beginPath(); g.moveTo(34, 25); g.lineTo(38, 36); g.lineTo(33, 35); g.closePath(); paint(g, ['#c9443c', '#2f7a55', '#5577bf'][variant % 3], INK, 1.1);
      g.fillStyle = INK; for (const y of [33, 41]) { circ(g, 30, y, 1.8); g.fill(); }
      for (const ex of [26, 34]) { circ(g, ex, 13, 1.6); g.fill(); }
      g.beginPath(); g.moveTo(30, 16); g.lineTo(39, 18); g.lineTo(30, 19); g.closePath(); paint(g, '#f08a3a', INK, 1);
      g.strokeStyle = '#6e452b'; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(16, 34); g.lineTo(4, 24); g.moveTo(8, 27); g.lineTo(5, 31); g.moveTo(44, 34); g.lineTo(56, 26); g.stroke();
      rr(g, 20, 3, 20, 3.5, 1.5); paint(g, '#2b2a48', INK, 1.2);         // top hat
      rr(g, 23, -9, 14, 13, 1.5); paint(g, '#2b2a48', INK, 1.2);
    } else if (kind === 'B') {
      blob(g, [[6, 50], [4, 34], [14, 20], [30, 14], [46, 20], [56, 34], [54, 50], [30, 54]]);
      paint(g, vgrad(g, 14, 54, '#3a7d5a', '#285c44'));
      snowCap(g, 10, 50, 20, 6, variant + 2);
      const r = seeded(variant + 9);
      for (let i = 0; i < 9; i++) {
        const bx = 10 + r() * 40, by = 26 + r() * 22;
        glow(g, bx, by, 7, BULBS[i % 4], 0.6);
        circ(g, bx, by, 2.4); paint(g, BULBS[i % 4], INK, 0.8);
      }
    } else {
      g.fillStyle = '#7a4a2a'; g.fillRect(27, 44, 6, 9);
      rr(g, 20, 46, 20, 8, 2); paint(g, C.red, INK, 1.3);                  // pot
      pine(g, 30, 46, 0.95);
      for (const [bx, by, c] of [[22, 30, '#ff6a5a'], [36, 26, '#ffd25a'], [28, 14, '#6ab4ff'], [40, 38, '#6ad08a'], [20, 40, '#ffd25a']]) {
        circ(g, bx, by, 2.8); paint(g, c, INK, 0.8);
      }
      star(g, 30, -14, 6); paint(g, C.gold, INK, 1.2);
    }
  }, true);
}

// A metal trash can with its lid on (one of the yard things), and the same can knocked over by a raccoon.
function canBody(g) {
  g.beginPath(); g.moveTo(14, 18); g.lineTo(46, 18); g.lineTo(43, 52); g.lineTo(17, 52); g.closePath();
  paint(g, vgrad(g, 18, 52, '#a9b4c9', '#7d89a3'));
  g.strokeStyle = 'rgba(40,45,80,0.45)'; g.lineWidth = 1.5;
  for (const x of [22, 30, 38]) { g.beginPath(); g.moveTo(x, 21); g.lineTo(x - (x - 30) * 0.1, 50); g.stroke(); }
  rr(g, 13, 30, 34, 3, 1.5); paint(g, '#c3cbdc', INK, 1);
}
function canLid(g) {
  ell(g, 30, 17, 19, 5); paint(g, '#b9c2d6', INK, 1.8);
  rr(g, 26, 9, 8, 5, 2); paint(g, '#8e99b3', INK, 1.3);
  snowCap(g, 13, 47, 15, 4, 5);
}
export function trashCan() {
  return sprite('trashcan', TILE, TILE + RISE, 6, (g) => {
    g.translate(0, RISE);
    ell(g, 30, 53, 20, 5); paint(g, 'rgba(60,80,130,0.25)', null);
    canBody(g); canLid(g);
  }, true);
}
// peek: eyes shining out from under the lid while it rattles
export function trashEyes() {
  return sprite('trasheyes', 24, 8, 4, (g) => {
    for (const x of [6, 18]) { circ(g, x, 4, 2.6); paint(g, '#ffe36a', INK, 1); circ(g, x, 4, 1); paint(g, INK, null); }
  });
}
export function trashTipped() {
  return sprite('trashtipped', TILE, TILE + RISE, 6, (g) => {
    g.translate(0, RISE);
    ell(g, 30, 52, 26, 6); paint(g, 'rgba(60,80,130,0.25)', null);
    // spilled trash
    for (const [x, y, c] of [[50, 48, '#e8d9b0'], [56, 44, '#d0634e'], [44, 52, '#8fb36a'], [58, 51, '#f0ead8']]) {
      ell(g, x, y, 4, 2.5, 0.4); paint(g, c, INK, 1);
    }
    g.strokeStyle = '#e8b54e'; g.lineWidth = 2; g.beginPath(); g.moveTo(40, 46); g.quadraticCurveTo(46, 40, 52, 46); g.stroke();   // banana peel
    // the can on its side, open end to the right
    g.save(); g.translate(30, 44); g.rotate(-Math.PI / 2); g.translate(-30, -36);
    canBody(g);
    g.restore();
    ell(g, 46, 44, 4, 9); paint(g, '#3a3f5e', INK, 1.5);
    ell(g, 10, 50, 10, 3, 0.2); paint(g, '#b9c2d6', INK, 1.5);   // the lid, rolled off
  }, true);
}

// A raccoon dashing away with its prize (drawn facing right; two frames for its legs).
export function raccoon(frame) {
  const w = 0.9 * TILE;
  return sprite(`raccoon${frame}`, w, TILE, 24, (g) => {
    ell(g, w / 2, 54, 22, 3.5); paint(g, 'rgba(20,24,50,0.28)', null);
    // striped tail
    g.save(); g.translate(8, 38); g.rotate(frame ? -0.5 : -0.3);
    ell(g, -8, 0, 11, 5); paint(g, '#8a8794');
    g.fillStyle = '#3b3842'; for (const x of [-14, -8, -2]) { g.fillRect(x, -5, 2.8, 10); }
    ell(g, -8, 0, 11, 5); paint(g, null, INK, 1.4);
    g.restore();
    g.strokeStyle = '#2f2c36'; g.lineWidth = 3.2;
    const legs = frame ? [[14, 6], [20, -4], [34, 6], [40, -4]] : [[14, -4], [20, 6], [34, -4], [40, 6]];
    for (const [x0, d] of legs) { g.beginPath(); g.moveTo(x0, 42); g.lineTo(x0 + d, 53); g.stroke(); }
    ell(g, 27, 40, 17, 9); paint(g, vgrad(g, 31, 49, '#9a97a3', '#76737f'));
    // head with the mask
    circ(g, 46, 34, 9); paint(g, '#9a97a3');
    for (const ex of [40, 49]) { g.beginPath(); g.moveTo(ex - 3, 27); g.lineTo(ex, 20); g.lineTo(ex + 3, 27); g.closePath(); paint(g, '#76737f', INK, 1.2); }
    ell(g, 47, 33, 8, 3.5); paint(g, '#2f2c36', null);
    circ(g, 44, 33, 1.6); paint(g, '#fff', null); circ(g, 50, 33, 1.6); paint(g, '#fff', null);
    ell(g, 53, 37, 4, 3); paint(g, '#e6e2ea', INK, 1.1);
    circ(g, 57, 36, 1.6); paint(g, INK, null);
    // a fish bone in its mouth
    g.strokeStyle = '#f6f0e0'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(54, 40); g.lineTo(64, 42); for (const x of [57, 60]) { g.moveTo(x, 38.5); g.lineTo(x + 1, 44.5); } g.stroke();
  });
}

// A present falling out of the sky (no glow, unlike the ones to pick up).
const WRAP = [['#d9473c', C.gold], ['#3f948e', '#f6f0e0'], ['#5577bf', '#ffd25a'], ['#e0a640', '#c9443c']];
export function fallingPresent(variant) {
  return sprite(`drop${variant}`, TILE, TILE, 8, (g) => {
    const [box, ribbon] = WRAP[variant % 4];
    rr(g, 12, 22, 36, 28, 3); paint(g, vgrad(g, 22, 50, box, box));
    rr(g, 9, 15, 42, 10, 3); paint(g, box);
    g.fillStyle = ribbon; g.fillRect(27, 15, 6, 35);
    g.strokeStyle = INK; g.lineWidth = 1.2; g.strokeRect(27, 15, 6, 35);
    ell(g, 22, 11, 7, 4.5, -0.4); paint(g, ribbon, INK, 1.5);
    ell(g, 38, 11, 7, 4.5, 0.4); paint(g, ribbon, INK, 1.5);
    circ(g, 30, 13, 3); paint(g, ribbon, INK, 1.2);
  });
}

// ---- Scenery sprites ----
// A snowy pine standing in one tile. It's taller than the tile, so its picture is RISE units taller
// and is drawn that much higher (kept tight, because there can be thirty trees on screen).
export const RISE = 42;
export function tree(variant) {
  return sprite(`tree${variant}`, TILE, TILE + RISE, 6, (g) => {
    g.translate(0, RISE);
    const r = seeded(variant * 13 + 5);
    ell(g, 30, 52, 24, 7); paint(g, 'rgba(60,80,130,0.25)', null);
    blob(g, [[8, 54], [16, 46], [30, 44], [46, 46], [54, 54], [30, 58]]); paint(g, '#f4f7fd', 'rgba(150,170,210,0.8)', 1.2);
    g.save(); g.translate(30, 52); g.rotate((r() - 0.5) * 0.08); g.translate(-30, -52);
    pine(g, 30, 52, 1.15 + r() * 0.25);
    g.restore();
  }, true);
}

export function lamppost() {
  return sprite('lamppost', 24, TILE + RISE, 6, (g) => {
    g.translate(2, RISE);
    ell(g, 10, 54, 9, 3); paint(g, 'rgba(40,40,80,0.3)', null);
    g.strokeStyle = INK; g.lineWidth = 4.5; g.beginPath(); g.moveTo(10, 54); g.lineTo(10, -14); g.stroke();
    g.strokeStyle = '#3c3f5e'; g.lineWidth = 3; g.stroke();
    rr(g, 2, -30, 16, 18, 4); paint(g, vgrad(g, -30, -12, '#fff1c2', '#ffc76a'), INK, 2);
    g.beginPath(); g.moveTo(0, -30); g.lineTo(10, -38); g.lineTo(20, -30); g.closePath(); paint(g, '#3c3f5e', INK, 1.6);
    g.lineWidth = 4; g.strokeStyle = C.green; g.beginPath(); g.arc(10, 6, 5, 0, TAU); g.stroke();
    circ(g, 10, 11, 2); paint(g, C.red, null);
    snowCap(g, 0, 20, -36, 3, 4);
  }, true);
}

// ---- Woodland animals (drawn facing right; two frames for their legs) ----
export function bunny(frame) {
  const w = 0.7 * TILE;
  return sprite(`bunny${frame}`, w, TILE, 20, (g) => {
    ell(g, w / 2, 53, 14, 3.5); paint(g, 'rgba(20,24,50,0.25)', null);
    const up = frame ? -7 : 0;
    g.save(); g.translate(0, up); if (frame) { g.translate(21, 44); g.rotate(-0.25); g.translate(-21, -44); }
    // back feet
    ell(g, frame ? 8 : 14, 50 - up * (frame ? 0.4 : 0), 6, 3); paint(g, '#e6e1d8');
    circ(g, 8, 40, 4.5); paint(g, '#ffffff', INK, 1.5);                   // tail
    ell(g, 20, 42, 12, 9); paint(g, vgrad(g, 33, 51, '#f5f2ec', '#d9d2c6'));
    ell(g, frame ? 34 : 30, 50, 4, 2.5); paint(g, '#e6e1d8', INK, 1.3);    // front foot
    circ(g, 31, 34, 7); paint(g, '#f5f2ec');
    for (const [ex, rot] of [[28, -0.25], [33, 0.15]]) {
      ell(g, ex, 21, 2.8, 9, rot); paint(g, '#f5f2ec', INK, 1.4);
      ell(g, ex, 22, 1.2, 6, rot); paint(g, '#f2b3c0', null);
    }
    circ(g, 34, 33, 1.4); paint(g, INK, null);
    circ(g, 38, 36, 1.4); paint(g, '#e88a9a', null);
    g.restore();
  });
}

export function fox(frame) {
  const w = 1.1 * TILE;
  return sprite(`fox${frame}`, w, TILE, 24, (g) => {
    ell(g, w / 2, 54, 26, 3.5); paint(g, 'rgba(20,24,50,0.25)', null);
    // bushy tail with a white tip
    g.beginPath(); g.moveTo(16, 36); g.quadraticCurveTo(-2, 30, -6, 18); g.quadraticCurveTo(6, 26, 18, 30); g.closePath();
    paint(g, '#d8692c');
    ell(g, -4, 20, 4.5, 3.5, -0.8); paint(g, '#fbf6ef', INK, 1.3);
    // legs
    g.strokeStyle = '#3b2a2a'; g.lineWidth = 3.2;
    const legs = frame ? [[20, 14], [26, 30], [40, 34], [46, 50]] : [[20, 24], [26, 22], [40, 44], [46, 42]];
    for (const [x0, x1] of legs) { g.beginPath(); g.moveTo(x0, 42); g.lineTo(x1 * 0.5 + x0 * 0.5, 53); g.stroke(); }
    ell(g, 32, 38, 18, 8); paint(g, vgrad(g, 30, 46, '#ea8040', '#c45a22'));
    ell(g, 40, 42, 7, 3.5); paint(g, '#fbf6ef', null);
    // head
    g.beginPath(); g.moveTo(44, 34); g.lineTo(52, 22); g.lineTo(58, 26); g.lineTo(66, 34); g.lineTo(56, 38); g.closePath();
    paint(g, '#ea8040');
    g.beginPath(); g.moveTo(56, 38); g.lineTo(66, 34); g.lineTo(58, 33); g.closePath(); paint(g, '#fbf6ef', null);
    for (const ex of [50, 56]) { g.beginPath(); g.moveTo(ex - 3, 26); g.lineTo(ex, 16); g.lineTo(ex + 3, 25); g.closePath(); paint(g, '#d8692c', INK, 1.4); }
    circ(g, 66, 34, 1.6); paint(g, INK, null);
    circ(g, 57, 29, 1.3); paint(g, INK, null);
  });
}

export function deer(frame) {
  const w = 1.4 * TILE;
  return sprite(`deer${frame}`, w, TILE, 30, (g) => {
    ell(g, w / 2, 55, 30, 3.5); paint(g, 'rgba(20,24,50,0.25)', null);
    const legs = frame ? [[22, 6], [28, 16], [52, 64], [58, 74]] : [[22, 22], [28, 28], [52, 52], [58, 58]];
    g.strokeStyle = '#7a5434'; g.lineWidth = 3.4;
    for (const [x0, x1] of legs) { g.beginPath(); g.moveTo(x0, 34); g.lineTo(x1, 54); g.stroke(); }
    ell(g, 40, 30, 24, 10); paint(g, vgrad(g, 20, 40, '#c99462', '#a87342'));
    ell(g, 40, 36, 14, 3.5); paint(g, 'rgba(255,248,236,0.8)', null);
    ell(g, 16, 25, 4, 3); paint(g, '#fbf6ef', INK, 1.3);            // white tail
    g.beginPath(); g.moveTo(56, 26); g.quadraticCurveTo(60, 12, 66, 6); g.lineTo(72, 10); g.quadraticCurveTo(66, 20, 64, 34); g.closePath();
    paint(g, '#c99462');
    ell(g, 72, 8, 9, 5.5, 0.35); paint(g, '#c99462');
    circ(g, 80, 11, 2); paint(g, '#2b2020', null);
    circ(g, 70, 6, 1.5); paint(g, INK, null);
    ell(g, 64, 1, 4, 2, -0.7); paint(g, '#a87342', INK, 1.2);
    g.strokeStyle = '#6b4a2e'; g.lineWidth = 1.8;                      // small antlers
    g.beginPath(); g.moveTo(68, 2); g.lineTo(66, -8); g.moveTo(67, -4); g.lineTo(62, -7); g.moveTo(71, 2); g.lineTo(74, -7); g.stroke();
  });
}

export function moose(frame) {
  const w = 2.2 * TILE;
  return sprite(`moose${frame}`, w, TILE, 30, (g) => {
    ell(g, w / 2, 56, 50, 4); paint(g, 'rgba(20,24,50,0.3)', null);
    const sw = frame ? 5 : -5;
    g.strokeStyle = '#3c2818'; g.lineWidth = 6;
    for (const [x0, d] of [[34, sw], [44, -sw], [86, -sw], [96, sw]]) { g.beginPath(); g.moveTo(x0, 30); g.lineTo(x0 + d, 55); g.stroke(); }
    // body with a shoulder hump
    g.beginPath(); g.moveTo(22, 32); g.quadraticCurveTo(22, 10, 50, 12); g.quadraticCurveTo(76, 2, 100, 10);
    g.quadraticCurveTo(110, 20, 104, 38); g.quadraticCurveTo(64, 46, 22, 32); g.closePath();
    paint(g, vgrad(g, 4, 42, '#6a4529', '#4a2f1b'));
    g.beginPath(); g.moveTo(20, 18); g.lineTo(14, 22); g.lineTo(21, 24); g.closePath(); paint(g, '#4a2f1b', INK, 1.3);
    // head and droopy nose
    g.beginPath(); g.moveTo(100, 12); g.quadraticCurveTo(110, 10, 120, 18); g.quadraticCurveTo(134, 24, 130, 34);
    g.quadraticCurveTo(122, 38, 114, 32); g.quadraticCurveTo(106, 28, 102, 26); g.closePath();
    paint(g, '#5a3a22');
    g.beginPath(); g.moveTo(108, 28); g.quadraticCurveTo(110, 42, 104, 44); g.quadraticCurveTo(102, 34, 104, 28); g.closePath();
    paint(g, '#4a2f1b', INK, 1.4);                                       // the dangly bell under his chin
    circ(g, 116, 18, 1.8); paint(g, INK, null);
    ell(g, 128, 29, 2, 1.5); paint(g, '#2a1a10', null);
    // big flat antlers
    for (const [ax, flip] of [[104, -1], [114, 1]]) {
      g.save(); g.translate(ax, 10); g.scale(flip, 1);
      blob(g, [[0, 0], [8, -6], [18, -4], [22, -12], [26, -6], [30, -14], [32, -4], [24, 4], [10, 4]]);
      paint(g, vgrad(g, -14, 4, '#e2c690', '#bf9c62'), INK, 1.6);
      g.restore();
    }
  });
}

// ---- Pickups ----
export function pickup(kind) {
  return sprite(`pick-${kind}`, TILE, TILE, 10, (g) => {
    glow(g, 30, 32, 26, 'rgba(255,220,140,0.55)');
    ell(g, 30, 48, 14, 4); paint(g, 'rgba(20,24,50,0.25)', null);
    if (kind === 'glasses') {
      g.strokeStyle = '#b48a3a'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(16, 30); g.quadraticCurveTo(30, 46, 44, 30); g.stroke();
      for (const x of [21, 39]) { circ(g, x, 30, 8); paint(g, 'rgba(200,230,255,0.5)', INK, 2.5); }
      g.strokeStyle = INK; g.lineWidth = 2.5; g.beginPath(); g.moveTo(28, 29); g.quadraticCurveTo(30, 26, 32, 29); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1.5;
      for (const x of [18, 36]) { g.beginPath(); g.arc(x + 2, 29, 4, Math.PI * 1.1, Math.PI * 1.5); g.stroke(); }
    } else if (kind === 'fruitcake') {
      g.beginPath(); g.moveTo(12, 30); g.lineTo(48, 30); g.lineTo(46, 46); g.lineTo(14, 46); g.closePath();
      paint(g, vgrad(g, 30, 46, '#9a5a2c', '#6e3b1a'));
      blob(g, [[10, 30], [16, 22], [30, 19], [44, 22], [50, 30], [42, 34], [34, 31], [24, 35], [16, 31]]);
      paint(g, '#f8f1e4', INK, 1.5);
      for (const [x, y, c] of [[22, 25, '#d63a3a'], [34, 23, '#3fae5a'], [40, 27, '#d63a3a'], [20, 40, '#d63a3a'], [32, 42, '#3fae5a'], [40, 38, '#e8b54e']]) {
        circ(g, x, y, 2.6); paint(g, c, null);
      }
    } else if (kind === 'present') {
      rr(g, 14, 24, 32, 24, 3); paint(g, vgrad(g, 24, 48, '#d9473c', '#a3332d'));
      rr(g, 11, 18, 38, 9, 3); paint(g, '#e2564b');
      g.fillStyle = C.gold; g.fillRect(27, 18, 6, 30);
      g.strokeStyle = INK; g.lineWidth = 1.2; g.strokeRect(27, 18, 6, 30);
      ell(g, 23, 14, 7, 4.5, -0.4); paint(g, C.gold, INK, 1.5);
      ell(g, 37, 14, 7, 4.5, 0.4); paint(g, C.gold, INK, 1.5);
      circ(g, 30, 16, 3); paint(g, '#c9922e', INK, 1.2);
    } else if (kind === 'eggnog') {
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2;
      for (const x of [24, 32]) { g.beginPath(); g.moveTo(x, 16); g.quadraticCurveTo(x - 4, 10, x, 4); g.stroke(); }
      g.beginPath(); g.arc(44, 34, 7, -Math.PI / 2, Math.PI / 2); g.lineWidth = 3.5; g.strokeStyle = INK; g.stroke();
      g.lineWidth = 2; g.strokeStyle = '#fbf2dc'; g.stroke();
      rr(g, 16, 20, 28, 28, 6); paint(g, vgrad(g, 20, 48, '#fbf2dc', '#e4d2a6'));
      ell(g, 30, 22, 13, 4); paint(g, '#fff8e8', INK, 1.5);
      g.fillStyle = '#9a5a2c'; for (const [x, y] of [[26, 22], [31, 21], [34, 23]]) { circ(g, x, y, 1); g.fill(); }
      g.strokeStyle = '#8a4a22'; g.lineWidth = 3; g.beginPath(); g.moveTo(36, 22); g.lineTo(42, 8); g.stroke();
      g.strokeStyle = C.red; g.lineWidth = 3; g.beginPath(); g.moveTo(17, 36); g.lineTo(43, 36); g.stroke();
    }
  });
}

// ---- Grandma ----
// Drawn every frame at her feet (x, y). facing: up | down | left | right.
// She toddles rather than hops: a small lift, a rock to one side, and one boot off the ground.
// spin: an extra turn (radians) around her middle, for when she bounces off something.
export function grandma(g, x, y, { facing = 'up', hop = 0, step = 1, tilt = 0, shiver = 0, scale = 1, spin = 0 } = {}) {
  const k = Math.sin(Math.PI * hop);
  g.save();
  g.translate(x, y);
  ell(g, 0, 0, 15 * scale, 5 * scale); g.fillStyle = 'rgba(20,24,50,0.28)'; g.fill();
  g.translate(shiver ? (Math.random() - 0.5) * shiver : 0, -k * 4);
  if (spin) { g.translate(0, -24 * scale); g.rotate(spin); g.translate(0, 24 * scale); }
  g.rotate(tilt + k * 0.13 * step);
  g.scale(scale, scale * (1 + k * 0.03));
  blit(g, grandmaPose(facing, Math.round(k * 4) / 4, step), -24, -62);
  g.restore();
}

// Her body in one pose (k = how far through a step), drawn once per boil frame and reused.
function grandmaPose(facing, k, step) {
  return sprite(`gran-${facing}-${k}-${step}`, 48, 66, 4, (g) => {
    g.translate(24, 62);
    const back = facing === 'up';
    const look = facing === 'left' ? -2 : facing === 'right' ? 2 : 0;
    // boots: the leading one lifts while she steps
    ell(g, -6, -3 - (step < 0 ? k * 4 : 0), 5, 3.5); paint(g, '#3b2b30', INK, 1.5);
    ell(g, 6, -3 - (step > 0 ? k * 4 : 0), 5, 3.5); paint(g, '#3b2b30', INK, 1.5);
    // handbag on her arm, swinging a little as she walks
    g.save(); g.translate(16, -22); g.rotate(-k * 0.35 * step);
    g.strokeStyle = INK; g.lineWidth = 1.5;
    g.beginPath(); g.arc(0, 4, 4, Math.PI, 0); g.stroke();
    rr(g, -5, 4, 11, 9, 3); paint(g, '#3f7f5a', INK, 1.5);
    g.restore();
    // coat
    g.beginPath();
    g.moveTo(-15, -6); g.quadraticCurveTo(-14, -26, -9, -31); g.lineTo(9, -31); g.quadraticCurveTo(14, -26, 15, -6);
    g.quadraticCurveTo(0, -2, -15, -6); g.closePath();
    paint(g, vgrad(g, -31, -4, C.coat, C.coatDark));
    g.beginPath(); g.moveTo(-15, -6); g.quadraticCurveTo(0, -1, 15, -6); g.lineTo(15, -9); g.quadraticCurveTo(0, -4, -15, -9); g.closePath();
    paint(g, '#f6f0e6', INK, 1.2);
    if (!back) {
      g.fillStyle = C.gold; for (const by of [-24, -17]) { circ(g, 0, by, 1.6); g.fill(); }
    } else {
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, -28); g.lineTo(0, -9); g.stroke();
    }
    // mittens
    circ(g, -15, -15, 3.8); paint(g, C.red, INK, 1.4);
    circ(g, 12, -16, 3.8); paint(g, C.red, INK, 1.4);
    // scarf
    rr(g, -10, -33, 20, 6, 3); paint(g, C.red, INK, 1.4);
    g.beginPath(); g.moveTo(back ? -4 : 4, -29); g.lineTo(back ? -8 : 8, -18); g.lineTo(back ? -3 : 3, -18); g.lineTo(back ? -1 : 1, -29); g.closePath();
    paint(g, C.red, INK, 1.2);
    // head
    circ(g, 0, -40, 10); paint(g, C.skin, INK, 1.8);
    if (back) {
      g.beginPath(); g.arc(0, -40, 10.5, Math.PI * 0.85, Math.PI * 2.15); g.closePath(); paint(g, C.hair, INK, 1.6);
      g.strokeStyle = 'rgba(150,150,170,0.6)'; g.lineWidth = 1;
      for (const a of [-6, -2, 2, 6]) { g.beginPath(); g.moveTo(a, -49); g.quadraticCurveTo(a * 1.2, -42, a, -35); g.stroke(); }
    } else {
      g.beginPath(); g.arc(0, -41, 10.6, Math.PI * 1.02, Math.PI * 1.98); g.quadraticCurveTo(0, -44, -10.6, -42); g.closePath();
      paint(g, C.hair, INK, 1.6);
      ell(g, -10, -38, 3, 4); paint(g, C.hair, INK, 1.2);
      ell(g, 10, -38, 3, 4); paint(g, C.hair, INK, 1.2);
      circ(g, -6.5 + look, -35, 2.4); paint(g, 'rgba(240,120,130,0.45)', null);
      circ(g, 6.5 + look, -35, 2.4); paint(g, 'rgba(240,120,130,0.45)', null);
      g.strokeStyle = INK; g.lineWidth = 1.5;
      for (const ex of [-4, 4]) { circ(g, ex + look, -39, 3.4); g.fillStyle = 'rgba(210,235,255,0.5)'; g.fill(); g.stroke(); }
      g.beginPath(); g.moveTo(-0.8 + look, -39.5); g.lineTo(0.8 + look, -39.5); g.stroke();
      circ(g, -4 + look * 1.3, -39, 1.1); paint(g, INK, null);
      circ(g, 4 + look * 1.3, -39, 1.1); paint(g, INK, null);
      g.beginPath(); g.arc(look, -34.5, 2.5, 0.2, Math.PI - 0.2); g.lineWidth = 1.3; g.stroke();
    }
    // bun
    circ(g, 0, -52, 5.5); paint(g, C.hair, INK, 1.6);
    g.strokeStyle = C.red; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-4, -50); g.lineTo(5, -55); g.stroke();
  });
}

// Grandma's face, for the lives counter.
export function headIcon(size = 28) {
  const c = document.createElement('canvas');
  c.width = c.height = size * 2;
  const g = c.getContext('2d');
  g.scale((size * 2) / 32, (size * 2) / 32);
  g.translate(16, 59);
  g.lineJoin = 'round';
  // draw the whole front-facing Grandma; the canvas edge crops it to her head
  grandma(g, 0, 0, { facing: 'down' });
  return c.toDataURL();
}

// ---- What happens to Grandma ----
export function pancake(g, x, y, t, by) {
  g = sketchy(g, 11 + boil * 31);
  g.save(); g.translate(x, y - 6);
  g.lineJoin = 'round';
  const spread = Math.min(1, t * 6);
  g.scale(0.6 + 0.4 * spread, 1);
  ell(g, 0, 4, 26, 7); paint(g, 'rgba(20,24,50,0.25)', null);
  // splayed limbs
  for (const [ax, ay] of [[-20, -8], [20, -8], [-14, 10], [14, 10]]) { ell(g, ax, ay, 5, 3.5); paint(g, ax < 0 === ay < 0 ? C.red : '#3b2b30', INK, 1.3); }
  ell(g, 0, 2, 21, 9); paint(g, vgrad(g, -7, 11, C.coat, C.coatDark));
  ell(g, 0, -10, 12, 6); paint(g, C.skin, INK, 1.6);
  ell(g, 0, -15, 11, 3.5); paint(g, C.hair, INK, 1.3);
  ell(g, 0, -19, 5, 2.5); paint(g, C.hair, INK, 1.2);
  g.strokeStyle = INK; g.lineWidth = 1.4;
  for (const ex of [-4, 4]) { g.beginPath(); g.moveTo(ex - 2, -11); g.lineTo(ex + 2, -9); g.moveTo(ex + 2, -11); g.lineTo(ex - 2, -9); g.stroke(); }
  // what flattened her
  g.fillStyle = 'rgba(60,40,30,0.55)';
  if (by === 'sleigh') {
    for (const [hx, hy] of [[-9, 2], [7, 5]]) {
      ell(g, hx - 2, hy, 1.8, 3); g.fill(); ell(g, hx + 2, hy, 1.8, 3); g.fill();
    }
  } else {
    g.fillStyle = 'rgba(30,30,50,0.4)';
    g.fillRect(-21, -1, 42, 3); g.fillRect(-21, 5, 42, 3);
  }
  // spinning stars
  g.restore();
  g.save(); g.translate(x, y - 34);
  for (let i = 0; i < 3; i++) {
    const a = t * 5 + (i * TAU) / 3;
    star(g, Math.cos(a) * 16, Math.sin(a) * 5, 4.5); paint(g, C.warm, INK, 1.2);
  }
  g.restore();
}

export function iceCube(g, x, y, t) {
  g = sketchy(g, 13 + boil * 31);
  const bob = Math.sin(t * 4) * 2;
  g.save(); g.translate(x, y - 18 + bob);
  g.rotate(Math.sin(t * 2.5) * 0.06);
  g.lineJoin = 'round';
  ell(g, 0, 18, 24, 5); paint(g, 'rgba(255,255,255,0.35)', null);
  // her head frozen inside
  g.save(); g.translate(0, 34); g.scale(0.8, 0.8);
  g.beginPath(); g.rect(-30, -70, 60, 50); g.clip();
  grandma(g, 0, 0, { facing: 'down' });
  g.restore();
  rr(g, -20, -20, 40, 36, 6); paint(g, 'rgba(190,228,250,0.55)', '#7fb2d4', 2);
  g.beginPath(); g.moveTo(-16, -16); g.lineTo(-8, -16); g.lineTo(-16, -6); g.closePath(); paint(g, 'rgba(255,255,255,0.75)', null);
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(12, -14); g.lineTo(14, 8); g.stroke();
  g.restore();
}

export function snowman(g, x, y, t) {
  g = sketchy(g, 17 + boil * 31);
  const grow = Math.min(1, t * 3);
  g.save(); g.translate(x, y); g.scale(grow, grow);
  g.lineJoin = 'round';
  ell(g, 0, 0, 16, 5); paint(g, 'rgba(20,24,50,0.25)', null);
  circ(g, 0, -14, 14); paint(g, vgrad(g, -28, 0, '#ffffff', C.snowShade), INK, 1.8);
  circ(g, 0, -36, 10); paint(g, vgrad(g, -46, -26, '#ffffff', C.snowShade), INK, 1.8);
  rr(g, -10, -30, 20, 5, 2.5); paint(g, C.red, INK, 1.3);
  g.beginPath(); g.moveTo(5, -27); g.lineTo(9, -17); g.lineTo(5, -17); g.closePath(); paint(g, C.red, INK, 1.1);
  g.fillStyle = INK; for (const by of [-18, -11]) { circ(g, 0, by, 1.8); g.fill(); }
  g.strokeStyle = INK; g.lineWidth = 1.5;
  for (const ex of [-4, 4]) { circ(g, ex, -38, 3.2); g.stroke(); }
  g.beginPath(); g.moveTo(-0.8, -38); g.lineTo(0.8, -38); g.stroke();
  g.beginPath(); g.moveTo(0, -35); g.lineTo(7, -34); g.lineTo(0, -33); g.closePath(); paint(g, '#f08a3a', INK, 1);
  g.strokeStyle = '#6e452b'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(-13, -18); g.lineTo(-24, -26); g.moveTo(13, -18); g.lineTo(24, -26); g.stroke();
  circ(g, 0, -47, 5); paint(g, C.hair, INK, 1.5);
  g.restore();
}

// ---- Scenery ----
// The strip at the top: night sky, hills, and Grandma's cottage.
export function drawSkyBand(g, W, H, seed = 1) {
  g = sketchy(g, 23 + seed);
  const r = seeded(seed);
  g.fillStyle = vgrad(g, 0, H, '#141b3f', '#34407a');
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) {
    const x = r() * W, y = r() * H * 0.7, s = r();
    g.fillStyle = `rgba(255,248,220,${0.3 + s * 0.6})`;
    circ(g, x, y, 0.6 + s * 1.2); g.fill();
  }
  glow(g, W - 70, 34, 50, 'rgba(255,240,200,0.35)');
  circ(g, W - 70, 34, 16); paint(g, '#fbf3d8', null);
  circ(g, W - 64, 30, 14); g.fillStyle = 'rgba(52,64,122,0.0)'; g.fill();
  // far hills
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x += 20) g.lineTo(x, H - 40 - Math.sin(x / 70 + seed) * 12 - Math.sin(x / 23) * 4);
  g.lineTo(W, H); g.closePath(); g.fillStyle = '#5a6aa3'; g.fill();
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x += 20) g.lineTo(x, H - 22 - Math.sin(x / 50 + 2) * 8);
  g.lineTo(W, H); g.closePath(); g.fillStyle = '#c4d0ea'; g.fill();
  // pines
  for (const [x, s] of [[30, 1.1], [72, 0.8], [112, 0.95], [430, 0.9], [470, 1.15], [515, 0.8]]) pine(g, x, H - 6, s);
}

// The cottage: the house itself is a cached sprite; smoke and twinkling lights are drawn live.
const BULBS = ['#ff6a5a', '#ffd25a', '#6ad08a', '#6ab4ff'];
const bulbAt = (i) => [-110 + (220 * i) / 12, -40 + (i % 2 ? 4 : 0)];   // relative to (cx, base)

export function cottage(g, cx, base, time) {
  g.save();
  g.fillStyle = 'rgb(230,236,250)';
  for (let i = 0; i < 4; i++) {
    const k = (time * 0.35 + i / 4) % 1;
    circ(g, cx - 61 + Math.sin(k * 6 + i) * 6 + k * 14, base - 96 - k * 40, 4 + k * 9);
    g.globalAlpha = 0.3 * (1 - k); g.fill();
  }
  g.restore();
  blit(g, cottageSprite(), cx - 125, base - 112);
  for (let i = 0; i <= 12; i++) {
    const [bx, by] = bulbAt(i);
    const on = (Math.sin(time * 3 + i * 1.7) + 1) / 2;
    glow(g, cx + bx, base + by, 9, BULBS[i % 4], 0.2 + on * 0.6);
  }
}

function cottageSprite() {
  return sprite('cottage', 250, 114, 12, (g) => {
    g.translate(125, 112);
    const cx = 0, base = 0;
    const L = cx - 100, R = cx + 100, top = base - 50;
    rr(g, L + 30, top - 42, 18, 34, 2); paint(g, '#9a4a3c');
    // walls
    rr(g, L, top, 200, 50, 3); paint(g, vgrad(g, top, base, '#efe2c6', '#d8c49f'));
    g.strokeStyle = 'rgba(120,80,50,0.5)'; g.lineWidth = 2;
    for (const x of [L + 66, R - 66]) { g.beginPath(); g.moveTo(x, top + 2); g.lineTo(x, base - 1); g.stroke(); }
    // windows
    for (const wx of [L + 18, R - 52]) {
      glow(g, wx + 17, top + 24, 34, 'rgba(255,200,110,0.45)');
      rr(g, wx, top + 10, 34, 26, 3); paint(g, vgrad(g, top + 10, top + 36, '#ffe9a8', '#f6b860'), INK, 2);
      g.strokeStyle = '#7a4a2a'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(wx + 17, top + 10); g.lineTo(wx + 17, top + 36); g.moveTo(wx, top + 23); g.lineTo(wx + 34, top + 23); g.stroke();
      rr(g, wx - 3, top + 35, 40, 5, 2); paint(g, C.snow, INK, 1.2);
    }
    // door with wreath and lamp
    glow(g, cx, top + 26, 46, 'rgba(255,190,100,0.35)');
    g.beginPath(); g.moveTo(cx - 15, base); g.lineTo(cx - 15, top + 14); g.quadraticCurveTo(cx, top + 2, cx + 15, top + 14); g.lineTo(cx + 15, base); g.closePath();
    paint(g, vgrad(g, top + 6, base, '#c8453a', '#94302a'));
    circ(g, cx + 9, top + 32, 1.8); paint(g, C.gold, null);
    g.strokeStyle = C.green; g.lineWidth = 4.5; g.beginPath(); g.arc(cx, top + 20, 6, 0, TAU); g.stroke();
    g.fillStyle = C.red; for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; circ(g, cx + Math.cos(a) * 6, top + 20 + Math.sin(a) * 6, 1.3); g.fill(); }
    // roof with thick snow
    g.beginPath(); g.moveTo(L - 16, top + 4); g.lineTo(cx, top - 52); g.lineTo(R + 16, top + 4); g.closePath();
    paint(g, vgrad(g, top - 52, top + 4, '#4a5f86', '#33456b'));
    g.beginPath(); g.moveTo(L - 20, top + 6);
    g.lineTo(cx, top - 56); g.lineTo(R + 20, top + 6);
    for (let x = R + 20; x >= L - 20; x -= 14) g.lineTo(x, top + 2 + (Math.round(x / 14) % 2 ? 5 : 1));
    g.closePath();
    g.save(); g.clip();
    g.fillStyle = vgrad(g, top - 56, top + 6, '#ffffff', '#dbe4f4'); g.fillRect(L - 30, top - 60, 260, 70);
    g.fillStyle = 'rgba(74,95,134,0.9)';
    g.beginPath(); g.moveTo(L - 4, top + 6); g.lineTo(cx, top - 34); g.lineTo(R + 4, top + 6); g.closePath(); g.fill();
    g.restore();
    g.strokeStyle = INK; g.lineWidth = 2;
    g.beginPath(); g.moveTo(L - 20, top + 6); g.lineTo(cx, top - 56); g.lineTo(R + 20, top + 6); g.stroke();
    // string lights along the eave
    g.strokeStyle = 'rgba(40,40,60,0.8)'; g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i <= 12; i++) { const [bx, by] = bulbAt(i); g.lineTo(bx, by - 2); }
    g.stroke();
    for (let i = 0; i <= 12; i++) { const [bx, by] = bulbAt(i); ell(g, bx, by, 2.4, 3.2); paint(g, BULBS[i % 4], INK, 0.8); }
  }, true);
}

function pine(g, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = '#6e452b'; g.fillRect(-3, -8, 6, 8);
  for (let i = 0; i < 3; i++) {
    const w = 22 - i * 5, yy = -8 - i * 14;
    g.beginPath(); g.moveTo(-w, yy); g.lineTo(0, yy - 22); g.lineTo(w, yy); g.closePath();
    paint(g, i === 0 ? '#2a5e48' : '#2f6d52', INK, 1.5);
    g.beginPath(); g.moveTo(-w * 0.7, yy - 6); g.lineTo(0, yy - 22); g.lineTo(w * 0.7, yy - 6); g.quadraticCurveTo(0, yy - 10, -w * 0.7, yy - 6); g.closePath();
    paint(g, C.snow, null);
  }
  g.restore();
}

// One row of ground. rowsAround tells it what's above and below so edges can blend.
export function drawRow(g, def, y, W, above, below, seed) {
  const type = def.type;
  g = sketchy(g, seed * 3 + 1, 2);
  const r = seeded(seed);
  const T = TILE;
  if (type === 'start' || type === 'checkpoint') {
    // a cozy stop: warm light on the snow, a garland, and its name trodden into the snow
    g.fillStyle = vgrad(g, y, y + T, '#fbf3e4', '#eadfcb'); g.fillRect(0, y, W, T);
    glow(g, W / 2, y + T / 2, 200, 'rgba(255,200,120,0.25)');
    hatch(g, r, y, W, 3, 'rgba(190,150,110,0.35)');
    g.strokeStyle = C.green; g.lineWidth = 5;
    g.beginPath(); g.moveTo(0, y + 5);
    for (let x = 0; x <= W; x += 45) g.quadraticCurveTo(x + 22, y + 14, x + 45, y + 5);
    g.stroke();
    const bulbs = ['#ff6a5a', '#ffd25a', '#6ad08a', '#6ab4ff'];
    for (let i = 0, x = 22; x < W; x += 45, i++) { ell(g, x, y + 11, 2.6, 3.4); paint(g, bulbs[i % 4], INK, 0.8); }
    const name = type === 'start' ? 'The party' : def.name;
    g.save();
    g.font = '700 22px Gaegu, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(140,90,50,0.55)';
    g.fillText(`★ ${name} ★`, W * 0.3, y + 38);
    g.restore();
  } else if (type === 'forest') {
    g.fillStyle = vgrad(g, y, y + T, '#e3e9f5', '#cdd7ec'); g.fillRect(0, y, W, T);
    g.fillStyle = 'rgba(70,110,90,0.35)';
    for (let i = 0; i < 30; i++) { const x = r() * W, yy = y + r() * T; g.save(); g.translate(x, yy); g.rotate(r() * TAU); g.fillRect(-3, -0.6, 6, 1.2); g.restore(); }
    hatch(g, r, y, W, 4, 'rgba(120,140,190,0.45)');
  } else if (type === 'trail') {
    g.fillStyle = vgrad(g, y, y + T, '#edf1f9', '#d9e1f0'); g.fillRect(0, y, W, T);
    // a trodden path along the row, with little tracks in it
    g.fillStyle = 'rgba(176,160,150,0.35)';
    g.beginPath(); g.moveTo(0, y + 18);
    for (let x = 0; x <= W; x += 30) g.lineTo(x, y + 16 + Math.sin(x / 60 + seed) * 3);
    for (let x = W; x >= 0; x -= 30) g.lineTo(x, y + 46 + Math.sin(x / 50 + seed) * 3);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(110,100,120,0.45)';
    for (let x = 10 + r() * 20; x < W; x += 26 + r() * 10) {
      const yy = y + 26 + r() * 12;
      ell(g, x, yy, 1.8, 2.6); g.fill(); ell(g, x + 4, yy - 3, 1.8, 2.6); g.fill();
    }
    hatch(g, r, y, W, 2, 'rgba(140,160,205,0.4)');
  } else if (type === 'lawn') {
    // a neighbor's front yard: deep snow, a footpath, and warm light from the windows
    g.fillStyle = vgrad(g, y, y + T, '#f4f7fd', '#dfe6f4'); g.fillRect(0, y, W, T);
    for (let i = 0; i < 3; i++) glow(g, 40 + r() * (W - 80), y + 8, 90, 'rgba(255,200,110,0.22)');
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 8; i++) { ell(g, r() * W, y + r() * T, 8 + r() * 12, 2 + r() * 2); g.fill(); }
    // holly sprigs
    for (let i = 0; i < 4; i++) {
      const hx = r() * W, hy = y + 12 + r() * 36;
      ell(g, hx - 3, hy, 4, 2, -0.5); paint(g, '#2f7a55', null);
      ell(g, hx + 3, hy, 4, 2, 0.5); paint(g, '#2f7a55', null);
      circ(g, hx, hy - 1, 1.6); paint(g, C.red, null);
    }
    hatch(g, r, y, W, 3, 'rgba(140,160,205,0.45)');
  } else if (type === 'sidewalk') {
    // shoveled paving slabs, one per column, with salt and a snowbank on each side
    g.fillStyle = C.snow; g.fillRect(0, y, W, T);
    g.fillStyle = vgrad(g, y, y + T, '#c3c8da', '#aab1c8'); g.fillRect(0, y + 6, W, T - 12);
    g.strokeStyle = 'rgba(80,90,130,0.35)'; g.lineWidth = 1.5;
    for (let x = T; x < W; x += T) { g.beginPath(); g.moveTo(x, y + 8); g.lineTo(x, y + T - 8); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 40; i++) { circ(g, r() * W, y + 10 + r() * (T - 20), 0.6 + r()); g.fill(); }
    g.fillStyle = 'rgba(110,100,120,0.3)';
    for (let x = 14 + r() * 30; x < W; x += 34 + r() * 20) {
      const yy = y + 24 + r() * 12;
      ell(g, x, yy, 2, 3); g.fill(); ell(g, x + 5, yy - 4, 2, 3); g.fill();
    }
    for (const [yy, up] of [[y + 6, true], [y + T - 6, false]]) {
      g.beginPath(); g.moveTo(0, up ? y : y + T);
      for (let x = 0; x <= W; x += 10) g.lineTo(x, yy + (up ? 1 : -1) * (r() * 4));
      g.lineTo(W, up ? y : y + T); g.closePath();
      g.fillStyle = C.snow; g.fill();
    }
  } else if (type === 'walk' || type === 'yard') {
    g.fillStyle = vgrad(g, y, y + T, type === 'yard' ? '#f6f9ff' : C.snow, type === 'yard' ? '#e2e9f6' : '#dbe3f2');
    g.fillRect(0, y, W, T);
    g.fillStyle = 'rgba(170,186,220,0.45)';
    for (let i = 0; i < 6; i++) {
      const fx = r() * W, fy = y + 14 + r() * 32;
      for (let k = 0; k < 3; k++) { ell(g, fx + k * 12, fy + (k % 2) * 7, 2.8, 4, 0.2); g.fill(); }
    }
    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 10; i++) { ell(g, r() * W, y + r() * T, 6 + r() * 10, 2 + r() * 2); g.fill(); }
    hatch(g, r, y, W, 4, 'rgba(140,160,205,0.45)');
    if (type === 'walk') {
      for (const x of [r() * 120 + 30, W - 40 - r() * 120]) glow(g, x, y + T / 2, 60, 'rgba(255,205,120,0.22)');
    } else {
      // a stone path up to the door, with candy canes
      g.fillStyle = 'rgba(150,160,190,0.55)';
      for (let i = 0; i < 3; i++) { ell(g, W / 2 + (i % 2 ? 4 : -4), y + 10 + i * 18, 12, 6); g.fill(); }
      for (const x of [W / 2 - 34, W / 2 + 34]) candyCane(g, x, y + 46);
    }
  } else if (type === 'road') {
    g.fillStyle = vgrad(g, y, y + T, C.road, C.roadDark);
    g.fillRect(0, y, W, T);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(0, y + 18, W, 5); g.fillRect(0, y + 38, W, 5);
    g.fillStyle = 'rgba(220,230,250,0.25)';
    for (let i = 0; i < 8; i++) { ell(g, r() * W, y + r() * T, 8 + r() * 14, 2 + r() * 2); g.fill(); }
    if (above === 'road') {
      g.fillStyle = 'rgba(250,240,200,0.75)';
      for (let x = 10; x < W; x += 46) { rr(g, x, y, 24, 3.5, 1.5); g.fill(); }
    }
  } else if (type === 'hill') {
    const gr = g.createLinearGradient(0, y, W, y + T);
    const alt = seed % 2 === 0;
    gr.addColorStop(0, alt ? '#f1f5fc' : '#e6edf9'); gr.addColorStop(1, alt ? '#c9d6ee' : '#bccbe6');
    g.fillStyle = gr; g.fillRect(0, y, W, T);
    if (above === 'hill') {
      g.fillStyle = 'rgba(150,170,210,0.35)';
      g.fillRect(0, y - 1, W, 2);
    }
    g.strokeStyle = 'rgba(140,160,200,0.45)'; g.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const yy = y + 16 + r() * 30;
      g.beginPath(); g.moveTo(0, yy); g.bezierCurveTo(W * 0.3, yy - 4, W * 0.6, yy + 4, W, yy); g.stroke();
      g.beginPath(); g.moveTo(0, yy + 8); g.bezierCurveTo(W * 0.3, yy + 4, W * 0.6, yy + 12, W, yy + 8); g.stroke();
    }
    hatch(g, r, y, W, 3, 'rgba(130,150,200,0.4)');
  } else if (type === 'rink') {
    g.fillStyle = vgrad(g, y, y + T, '#d4ecf8', '#b5d8ee'); g.fillRect(0, y, W, T);
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.2;
    for (let i = 0; i < 7; i++) {
      const cx = r() * W, cy = y + 10 + r() * 40, rad = 10 + r() * 30;
      g.beginPath(); g.arc(cx, cy, rad, r() * TAU, r() * TAU + 1.5); g.stroke();
    }
  } else if (type === 'pond') {
    g.fillStyle = vgrad(g, y, y + T, C.water, C.waterLight); g.fillRect(0, y, W, T);
    g.strokeStyle = 'rgba(180,220,245,0.35)'; g.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) {
      const x = r() * W, yy = y + 8 + r() * 44;
      g.beginPath(); g.moveTo(x, yy); g.quadraticCurveTo(x + 8, yy - 3, x + 16, yy); g.stroke();
    }
  }
  // Snowy edges where this row meets a different kind.
  const edge = (yy, up) => {
    // the snow starts a little past the row's edge (it's clipped there) so no sliver of road shows
    const base = yy + (up ? 4 : -4);
    g.beginPath(); g.moveTo(0, base);
    for (let x = 0; x <= W; x += 12) g.lineTo(x, yy + (up ? -1 : 1) * (2 + r() * 5));
    g.lineTo(W, base); g.closePath();
    g.fillStyle = type === 'pond' ? C.ice : C.snow; g.fill();
  };
  if (type === 'road' || type === 'pond' || type === 'rink') {
    if (above !== type) edge(y, false);
    if (below !== type) edge(y + T, true);
  }
}

// Little clusters of pencil hatching, the way you'd shade snow in a picture book.
function hatch(g, r, y, W, clusters, color) {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = 1.1;
  for (let c = 0; c < clusters; c++) {
    const cx = r() * W, cy = y + 12 + r() * 36, n = 4 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const x = cx + i * 4;
      g.beginPath(); g.moveTo(x, cy + 5); g.lineTo(x + 6, cy - 4); g.stroke();
    }
  }
  g.restore();
}

function candyCane(g, x, y) {
  g.save(); g.translate(x, y);
  g.lineCap = 'round';
  g.strokeStyle = INK; g.lineWidth = 6;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -18); g.arc(-5, -18, 5, 0, Math.PI, true); g.stroke();
  g.strokeStyle = '#fff'; g.lineWidth = 3.5; g.stroke();
  g.strokeStyle = C.red; g.setLineDash([3, 3]); g.stroke();
  g.restore();
}

// Paper grain and a soft vignette laid over everything for the storybook feel.
export function drawGrain(g, W, H) {
  g.save();
  g.globalAlpha = 0.6;
  g.fillStyle = crayonPattern(g);
  g.fillRect(0, 0, W, H);
  g.restore();
  const v = g.createRadialGradient(W / 2, H * 0.55, H * 0.3, W / 2, H * 0.55, H * 0.8);
  v.addColorStop(0, 'rgba(20,20,60,0)');
  v.addColorStop(1, 'rgba(20,20,60,0.35)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
}

// Everything worth drawing ahead of time (in every boil frame), so nothing stalls the first time it
// appears. The game works through this list a few milliseconds per frame.
export function warmTasks() {
  const makers = [];
  for (let v = 0; v < 4; v++) makers.push(() => car(v), () => van(v), () => sled(v), () => skater(v, 0), () => skater(v, 1));
  makers.push(plow, () => sleigh(0), () => sleigh(1));
  for (let v = 0; v < 4; v++) makers.push(() => ebike(v), () => carolers(v, 0), () => carolers(v, 1), () => dogwalker(v, 0), () => dogwalker(v, 1), () => fallingPresent(v));
  makers.push(() => raccoon(0), () => raccoon(1), trashEyes);
  for (const f of [0, 1]) makers.push(() => bunny(f), () => fox(f), () => deer(f), () => moose(f));
  for (const k of ['glasses', 'fruitcake', 'present', 'eggnog']) makers.push(() => pickup(k));
  for (const size of [2, 3]) for (let v = 0; v < 3; v++) for (const thin of [false, true]) makers.push(() => floe(size, v, thin));
  for (const facing of ['up', 'down', 'left', 'right']) for (let k = 0; k <= 4; k++) for (const step of [1, -1]) makers.push(() => grandmaPose(facing, k / 4, step));
  const tasks = [];
  for (let v = 0; v < 3; v++) tasks.push(() => tree(v));
  tasks.push(lamppost, cottageSprite);
  for (const k of ['S', 'B', 'T']) for (let v = 0; v < 3; v++) tasks.push(() => yardDeco(k, v));
  tasks.push(trashCan, trashTipped);
  for (let f = 0; f < BOIL_FRAMES; f++) {
    for (const m of makers) tasks.push(() => { const keep = boil; boil = f; m(); boil = keep; });
  }
  return tasks;
}

export { star, glow, circ, ell, paint, rr };
