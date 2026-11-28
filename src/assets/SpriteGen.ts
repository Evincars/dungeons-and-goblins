/** Procedural sprite/texture generation — UI elements only.
 *  Tiles and characters are loaded from /public assets.
 */

import { context2d, createCanvas } from '../render/canvas';
import { PUDDLE_ART_RADIUS } from '../world';

function mkCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = createCanvas(w, h);
  const ctx = context2d(c);
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function hex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, col: number, s = 1): void {
  ctx.fillStyle = hex(col);
  ctx.fillRect(x * s, y * s, s, s);
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: number, s = 1): void {
  ctx.fillStyle = hex(col);
  ctx.fillRect(x * s, y * s, w * s, h * s);
}

function noise(seed: number): number {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

// ── PICKUP SPRITES ───────────────────────────────────────────────────────────

export function genSpellBoltSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(16, 16);
  rect(ctx, 4, 4, 8, 8, 0xb8800c);
  rect(ctx, 3, 5, 10, 6, 0xb8800c);
  rect(ctx, 5, 5, 6, 6, 0xffd840);
  rect(ctx, 4, 6, 8, 4, 0xffd840);
  rect(ctx, 6, 6, 4, 4, 0xfff0a0);
  rect(ctx, 7, 7, 2, 2, 0xffffff);
  return c;
}

// ── SPAWNER (MONSTER NEST) ────────────────────────────────────────────────────

export function genSpawnerSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(128, 40);
  const STONE = 0x4a4040;
  const DARK  = 0x2a2020;
  const CRACK = 0x100808;
  const BONE  = 0xb0a090;
  const RUNE  = 0x800040;

  for (let v = 0; v < 4; v++) {
    const ox = v * 32;
    rect(ctx, ox + 2, 8, 28, 32, DARK);
    rect(ctx, ox + 3, 9, 26, 30, STONE);
    rect(ctx, ox + 4, 10, 24, 28, 0x3a3535);
    ctx.strokeStyle = hex(RUNE);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(ox + 16, 24, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(ox + 16, 24, 6, 0, Math.PI * 2); ctx.stroke();
    rect(ctx, ox + 4,  8, 4, 4, BONE);
    rect(ctx, ox + 24, 8, 4, 4, BONE);
    ctx.fillStyle = hex(CRACK);
    for (let c2 = 0; c2 <= v; c2++) {
      const crx = ox + 8 + c2 * 6;
      const cry = 12 + c2 * 4;
      ctx.fillRect(crx, cry, 1, 8);
      ctx.fillRect(crx + 1, cry + 4, 1, 6);
    }
    const glowA = (4 - v) / 4 * 0.4;
    ctx.fillStyle = `rgba(128,0,64,${glowA})`;
    ctx.beginPath(); ctx.arc(ox + 16, 24, 9, 0, Math.PI * 2); ctx.fill();
  }
  return c;
}

// ── SAFE-ROOM GATE AND LEVER ─────────────────────────────────────────────────

/**
 * A portcullis over a doorway two tiles tall, 32×72: iron bars and crossbars, spiked at the foot, rising a little above
 * the doorway. Any art will do in its place: the game fits it to the doorway (createGates).
 */
export function genPortcullis(): HTMLCanvasElement {
  const W = 32;
  const H = 72;
  const BAR_FOOT = H - 4;
  const [c, ctx] = mkCanvas(W, H);
  const IRON = 0x2b2f36;
  const LIGHT = 0x5a626e;
  const DARK = 0x15171b;
  for (let x = 2; x < W; x += 6) {
    rect(ctx, x, 0, 3, BAR_FOOT, IRON);
    rect(ctx, x, 0, 1, BAR_FOOT, LIGHT);
    rect(ctx, x + 2, 0, 1, BAR_FOOT, DARK);
    rect(ctx, x, BAR_FOOT, 3, 2, IRON);
    px(ctx, x + 1, H - 2, LIGHT);
    px(ctx, x + 1, H - 1, IRON);
  }
  for (let y = 4; y < BAR_FOOT - 4; y += 12) {
    rect(ctx, 0, y, W, 3, IRON);
    rect(ctx, 0, y, W, 1, LIGHT);
    rect(ctx, 0, y + 2, W, 1, DARK);
  }
  return c;
}

/** A floor lever, two 32×32 frames: the handle up and back (col 0), then pulled down and forward (col 1). */
export function genLeverSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(64, 32);
  for (let state = 0; state < 2; state++) {
    const ox = state * 32;
    // Stone block it is set in, with a slot along the top.
    rect(ctx, ox + 8, 22, 16, 9, 0x4a4440);
    rect(ctx, ox + 9, 23, 14, 7, 0x6a625a);
    rect(ctx, ox + 10, 22, 12, 2, 0x1c1a18);
    // The handle: an iron shaft from the pivot to a worn wooden grip.
    const tipX = state === 0 ? ox + 9 : ox + 23;
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(ox + 16 + ((tipX - (ox + 16)) * i) / steps);
      const y = Math.round(23 - (13 * i) / steps);
      rect(ctx, x, y, 2, 2, i > steps - 3 ? 0x8a5a2a : 0x5a626e);
    }
    rect(ctx, ox + 15, 21, 4, 3, 0x2b2f36);
  }
  return c;
}

// ── SWORD SWING FX ───────────────────────────────────────────────────────────

export function genSwordSwingSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(192, 48);
  const BLADE = 0xd8e8ff;
  const TRAIL = [0x80b0ff, 0x4080ff, 0x2040a0, 0x102060];

  for (let f = 0; f < 4; f++) {
    const ox = f * 48;
    const alpha = 1 - f * 0.25;
    ctx.globalAlpha = alpha;
    for (let i = 0; i < 4; i++) {
      const a0 = -Math.PI / 3 + (f * 0.3 + i * 0.2);
      const a1 = a0 + 0.6;
      const r0 = 10 + i * 4;
      const r1 = 14 + i * 4;
      ctx.beginPath();
      ctx.arc(ox + 24, 24, r1, a0, a1);
      ctx.arc(ox + 24, 24, r0, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = hex(f === 0 ? BLADE : TRAIL[i]);
      ctx.fill();
    }
    if (f === 0) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ox + 24 + Math.cos(-Math.PI / 3 + 0.8) * 22,
              24 + Math.sin(-Math.PI / 3 + 0.8) * 22, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  return c;
}

// ── DEATH FX ─────────────────────────────────────────────────────────────────

export function genDeathFxSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(288, 48);
  const COLORS = [0xff4400, 0xff8800, 0xffcc00, 0x800000, 0x400000, 0x100000];

  for (let f = 0; f < 6; f++) {
    const ox = f * 48;
    const radius = 4 + f * 5;
    const alpha = Math.max(0, 1 - f * 0.18);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = hex(COLORS[f]);
    ctx.beginPath(); ctx.arc(ox + 24, 24, radius, 0, Math.PI * 2); ctx.fill();
    if (f < 4) drawSparks(ctx, ox, f, radius, f === 0 ? 0xffffff : COLORS[Math.max(0, f - 1)]);
    ctx.globalAlpha = 1;
  }
  return c;
}

/** Sparks flung out around a death burst's frame `f`, fewer as it fades. */
function drawSparks(ctx: CanvasRenderingContext2D, ox: number, f: number, radius: number, color: number): void {
  const sparkCount = 8 - f * 2;
  ctx.fillStyle = hex(color);
  for (let s = 0; s < sparkCount; s++) {
    const angle = (s / sparkCount) * Math.PI * 2 + f * 0.3;
    const dist = radius + 4 + f * 2;
    ctx.fillRect(ox + 24 + Math.cos(angle) * dist - 1, 24 + Math.sin(angle) * dist - 1, 2, 2);
  }
}

// ── DARKNESS / FOG ───────────────────────────────────────────────────────────

export function genDarkSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(160, 160);
  ctx.fillStyle = 'rgba(0,0,0,1)';
  ctx.fillRect(0, 0, 160, 160);

  const draw = (col: number, row: number, fn: (ctx: CanvasRenderingContext2D, x: number, y: number) => void) => {
    fn(ctx, col * 32, row * 32);
  };

  draw(1, 1, (g, x, y) => { g.fillStyle = 'rgba(0,0,0,1)'; g.fillRect(x, y, 32, 32); });

  const edgeGrad = (g: CanvasRenderingContext2D, x: number, y: number, dir: 'top' | 'bottom' | 'left' | 'right') => {
    const grad = dir === 'top'    ? g.createLinearGradient(x, y, x, y + 32)
      : dir === 'bottom' ? g.createLinearGradient(x, y + 32, x, y)
      : dir === 'left'   ? g.createLinearGradient(x, y, x + 32, y)
      : g.createLinearGradient(x + 32, y, x, y);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.8)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = grad; g.fillRect(x, y, 32, 32);
  };

  draw(1, 0, (g, x, y) => edgeGrad(g, x, y, 'top'));
  draw(1, 4, (g, x, y) => edgeGrad(g, x, y, 'bottom'));
  draw(0, 1, (g, x, y) => edgeGrad(g, x, y, 'left'));
  draw(2, 1, (g, x, y) => edgeGrad(g, x, y, 'right'));

  const cornerGrad = (g: CanvasRenderingContext2D, x: number, y: number, cx: number, cy: number) => {
    const grad = g.createRadialGradient(x + cx * 32, y + cy * 32, 0, x + cx * 32, y + cy * 32, 40);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.6)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = grad; g.fillRect(x, y, 32, 32);
  };

  draw(0, 0, (g, x, y) => cornerGrad(g, x, y, 0, 0));
  draw(2, 0, (g, x, y) => cornerGrad(g, x, y, 1, 0));
  draw(0, 4, (g, x, y) => cornerGrad(g, x, y, 0, 1));
  draw(2, 4, (g, x, y) => cornerGrad(g, x, y, 1, 1));

  draw(2, 2, (g, x, y) => {
    const gd = g.createLinearGradient(x, y, x + 32, y + 32);
    gd.addColorStop(0, 'rgba(0,0,0,0)'); gd.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = gd; g.fillRect(x, y, 32, 32);
  });
  draw(2, 3, (g, x, y) => {
    const gd = g.createLinearGradient(x + 32, y, x, y + 32);
    gd.addColorStop(0, 'rgba(0,0,0,0)'); gd.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = gd; g.fillRect(x, y, 32, 32);
  });
  draw(0, 2, (g, x, y) => {
    const gd = g.createLinearGradient(x + 32, y, x, y + 32);
    gd.addColorStop(0, 'rgba(0,0,0,1)'); gd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gd; g.fillRect(x, y, 32, 32);
  });
  draw(0, 3, (g, x, y) => {
    const gd = g.createLinearGradient(x, y, x + 32, y + 32);
    gd.addColorStop(0, 'rgba(0,0,0,1)'); gd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gd; g.fillRect(x, y, 32, 32);
  });

  draw(1, 2, (g, x, y) => { g.fillStyle = 'rgba(0,0,0,1)'; g.fillRect(x, y, 32, 32); });
  draw(1, 3, (g, x, y) => { g.fillStyle = 'rgba(0,0,0,1)'; g.fillRect(x, y, 32, 32); });

  return c;
}

// ── PANEL BG ─────────────────────────────────────────────────────────────────

export function genPanelBg(w: number, h: number): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(w, h);
  ctx.fillStyle = '#0e0a08';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#4a3820';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  ctx.strokeStyle = '#2a1e10';
  ctx.lineWidth = 1;
  ctx.strokeRect(3, 3, w - 6, h - 6);
  return c;
}

// ── PORTRAIT ─────────────────────────────────────────────────────────────────

export function genPortrait(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(32, 32);
  rect(ctx, 8, 4, 16, 18, 0x3a6a9a);
  rect(ctx, 9, 5, 14, 14, 0x2a4a6a);
  rect(ctx, 10, 12, 12, 4, 0x1a2a3a);
  rect(ctx, 10, 16, 12, 6, 0xd4a07a);
  rect(ctx, 8, 14, 2, 8, 0x3a6a9a);
  rect(ctx, 22, 14, 2, 8, 0x3a6a9a);
  return c;
}

// ── MINIMAP ICONS ─────────────────────────────────────────────────────────────

export function genMinimapIcons(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(64, 8);
  const icons = [0x4080ff, 0xff4040, 0xffd040, 0xff8000];
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = hex(icons[i]);
    ctx.fillRect(i * 8 + 2, 2, 4, 4);
  }
  return c;
}

// ── SHADOW ───────────────────────────────────────────────────────────────────

export function genShadow(w: number, h: number): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(w, h);
  const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.5)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  return c;
}

// ── CAMPFIRE ─────────────────────────────────────────────────────────────────

/** A campfire cell is this big; the flames (from the torch art) are laid on by the loader. */
export const CAMPFIRE_CELL = 24;
const CAMPFIRE_STONES: ReadonlyArray<[number, number]> = [
  [3, 18], [6, 20], [10, 21], [14, 21], [18, 20], [21, 18], [19, 15], [5, 15],
];
const STONE = 0x6a6660;
const STONE_DARK = 0x3e3a36;
const LOG = 0x5a3a22;
const LOG_LIGHT = 0x7a5232;
const EMBER = 0xff7a1a;
const EMBER_HOT = 0xffd040;

/** One frame's ring of stones, crossed logs and glowing embers, without flames; `frame` flickers the embers. */
export function drawCampfireBase(ctx: CanvasRenderingContext2D, ox: number, frame: number): void {
  for (const [x, y] of CAMPFIRE_STONES) {
    rect(ctx, ox + x - 1, y - 1, 3, 2, STONE);
    px(ctx, ox + x - 1, y, STONE_DARK);
  }
  for (let i = 0; i < 12; i++) {
    px(ctx, ox + 6 + i, 19 - Math.floor(i / 3), LOG);
    px(ctx, ox + 6 + i, 15 + Math.floor(i / 3), LOG);
    px(ctx, ox + 6 + i, 18 - Math.floor(i / 3), LOG_LIGHT);
  }
  for (let i = 0; i < 5; i++) px(ctx, ox + 9 + i + (frame % 2), 17 + (i % 2), (i + frame) % 3 === 0 ? EMBER_HOT : EMBER);
}

// ── ITEM ICONS (no art for these in the asset packs) ─────────────────────────

const LEATHER = 0x6a4428;
const LEATHER_DARK = 0x3e2614;
const LEATHER_LIGHT = 0x8a5c38;
const GOLD = 0xd4a030;
const GOLD_DARK = 0x7a5010;
const GOLD_LIGHT = 0xf4d070;

/** A pair of leather boots, 12×12. */
export function genBootsIcon(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(12, 12);
  for (const ox of [1, 6]) {
    rect(ctx, ox, 1, 3, 7, LEATHER);
    rect(ctx, ox, 8, 5, 3, LEATHER);
    rect(ctx, ox, 1, 1, 7, LEATHER_LIGHT);
    rect(ctx, ox, 10, 5, 1, LEATHER_DARK);
    rect(ctx, ox, 3, 3, 1, LEATHER_DARK);
  }
  return c;
}

/** A gold ring with a little gem, 10×10. */
export function genRingIcon(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(10, 10);
  rect(ctx, 2, 3, 6, 1, GOLD_LIGHT);
  rect(ctx, 1, 4, 1, 4, GOLD);
  rect(ctx, 8, 4, 1, 4, GOLD_DARK);
  rect(ctx, 2, 8, 6, 1, GOLD_DARK);
  rect(ctx, 4, 1, 2, 2, 0x50c8e8);
  px(ctx, 4, 1, 0xc8f4ff);
  return c;
}

// ── ARROW IN FLIGHT ──────────────────────────────────────────────────────────

const SHAFT = 0x8a6038;
const ARROWHEAD = 0xd8dce4;
const FLETCHING = 0xc03030;

/** An arrow pointing right, 14×5: red fletching, a wooden shaft and a steel head (turned to fly). */
export function genArrowSprite(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(14, 5);
  rect(ctx, 0, 1, 3, 1, FLETCHING);
  rect(ctx, 0, 3, 3, 1, FLETCHING);
  rect(ctx, 1, 2, 10, 1, SHAFT);
  rect(ctx, 10, 1, 2, 3, ARROWHEAD);
  px(ctx, 12, 2, ARROWHEAD);
  px(ctx, 13, 2, ARROWHEAD);
  return c;
}


/** A puddle's frame: a square, the patch a circle filling it (a radius-PUDDLE_ART_RADIUS patch at scale 1, as round as the aim guide's). */
const PUDDLE_SIZE = PUDDLE_ART_RADIUS * 2;

/**
 * Each patch's look: its colour from the middle out to its rim (`stops`: share of the radius, colour), a bright ring just
 * inside the edge, and what lies on it — ripples on water, crackling bolts on charged water, swirls of oily sheen on grease,
 * glowing cracks in scorched floor.
 */
type PuddleLook = { stops: readonly (readonly [number, string])[]; rim: string; marks: 'ripples' | 'bolts' | 'swirls' | 'cracks'; mark: string; glint: string };
const PUDDLE_LOOKS: readonly PuddleLook[] = [
  { stops: [[0, 'rgba(34,72,124,0.74)'], [0.7, 'rgba(46,96,156,0.66)'], [0.92, 'rgba(84,140,200,0.6)'], [1, 'rgba(84,140,200,0)']],
    rim: 'rgba(170,215,250,0.55)', marks: 'ripples', mark: 'rgba(160,205,245,0.28)', glint: 'rgba(230,245,255,0.85)' },
  { stops: [[0, 'rgba(70,130,230,0.8)'], [0.7, 'rgba(80,150,240,0.72)'], [0.92, 'rgba(140,200,255,0.7)'], [1, 'rgba(140,200,255,0)']],
    rim: 'rgba(220,240,255,0.85)', marks: 'bolts', mark: 'rgba(240,250,255,0.9)', glint: 'rgba(255,255,255,0.95)' },
  // Grease: a slick of brown-amber fat, darker where it lies thick, swirls of a sickly, oily sheen on it.
  { stops: [[0, 'rgba(62,44,16,0.8)'], [0.6, 'rgba(92,68,26,0.74)'], [0.9, 'rgba(132,102,44,0.66)'], [1, 'rgba(132,102,44,0)']],
    rim: 'rgba(196,164,92,0.6)', marks: 'swirls', mark: 'rgba(214,190,120,0.32)', glint: 'rgba(245,228,170,0.8)' },
  // Fire: the floor scorched black, cracks glowing in it (the flames themselves are particles, systems/VfxSystem.ts).
  { stops: [[0, 'rgba(18,9,5,0.86)'], [0.65, 'rgba(34,15,8,0.8)'], [0.9, 'rgba(90,32,10,0.6)'], [1, 'rgba(90,32,10,0)']],
    rim: 'rgba(160,60,16,0.5)', marks: 'cracks', mark: 'rgba(255,140,50,0.85)', glint: 'rgba(255,200,110,0.95)' },
];

/** A wandering line out from (x, y) at `angle`, `steps` steps of `step` px, turning by noise (a crack, a bolt). */
function wander(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, steps: number, step: number, seed: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  let a = angle;
  for (let i = 0; i < steps; i++) {
    a += (noise(seed + i * 7.3) - 0.5) * 1.4;
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/** What lies on a patch, drawn within its circle (r) round (cx, cy). */
function drawPuddleMarks(ctx: CanvasRenderingContext2D, look: PuddleLook, cx: number, cy: number, r: number, seed: number): void {
  ctx.strokeStyle = look.mark;
  ctx.lineWidth = 1;
  if (look.marks === 'ripples') {
    for (const share of [0.32, 0.56, 0.78]) {
      ctx.beginPath(); ctx.arc(cx, cy, r * share, 0, Math.PI * 2); ctx.stroke();
    }
  } else if (look.marks === 'swirls') {
    for (let i = 0; i < 5; i++) {
      const a = noise(seed + i) * Math.PI * 2;
      const d = r * (0.2 + noise(seed + i + 11) * 0.55);
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * (0.12 + noise(seed + i + 23) * 0.18), a, a + Math.PI * 1.2); ctx.stroke();
    }
  } else {
    // Bolts or cracks: lines wandering out from near the middle towards the rim.
    ctx.lineWidth = look.marks === 'bolts' ? 1.2 : 1.5;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + noise(seed + i) * 0.6;
      wander(ctx, cx + Math.cos(a) * r * 0.12, cy + Math.sin(a) * r * 0.12, a, 7, r * 0.11, seed + i * 31);
    }
  }
}

/** A few glints of light on the patch: a bright arc up and left, as of a light above, and specks. */
function drawPuddleGlints(ctx: CanvasRenderingContext2D, look: PuddleLook, cx: number, cy: number, r: number, seed: number): void {
  ctx.strokeStyle = look.glint;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.7, Math.PI * 1.1, Math.PI * 1.4); ctx.stroke();
  ctx.fillStyle = look.glint;
  for (let i = 0; i < 6; i++) {
    const a = noise(seed + i * 3) * Math.PI * 2;
    const d = r * noise(seed + i * 5 + 1) * 0.8;
    ctx.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), 2, 1);
  }
}

/** Webs: this many strands out from the middle, this many rings of silk round it, their silk and the haze under them. */
const WEB_SPOKES = 16;
const WEB_RINGS = 7;
const WEB_SILK = 'rgba(236,236,228,0.8)';
const WEB_HAZE = 'rgba(220,220,210,0.18)';
/** A ring sags to this share of its reach between two strands, and wobbles by this share either way. */
const WEB_SAG = 0.93;
const WEB_WOBBLE = 0.08;

/**
 * Web's webs, filling the square (a cube on the map, as the aim guide shows it): a pale haze of silk, strands out from the middle
 * to the edges and corners, and rings of it sagging between them, a little ragged.
 */
function drawWeb(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, seed: number): void {
  ctx.fillStyle = WEB_HAZE;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.strokeStyle = WEB_SILK;
  ctx.lineWidth = 1;
  const reach = (a: number): number => r / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
  for (let i = 0; i < WEB_SPOKES; i++) {
    const a = (i / WEB_SPOKES) * Math.PI * 2 + (noise(seed + i) - 0.5) * 0.15;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * reach(a), cy + Math.sin(a) * reach(a)); ctx.stroke();
  }
  for (let ring = 1; ring <= WEB_RINGS; ring++) drawWebRing(ctx, cx, cy, ring / (WEB_RINGS + 0.4), reach, seed + ring * 13);
}

/** One ring of silk round the web's middle at a share of the way out, sagging a little between strands and wobbling by noise. */
function drawWebRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, share: number, reach: (a: number) => number, seed: number): void {
  ctx.beginPath();
  for (let i = 0; i <= WEB_SPOKES; i++) {
    const a = (i / WEB_SPOKES) * Math.PI * 2;
    const sag = i % 2 === 0 ? 1 : WEB_SAG;
    const d = reach(a) * share * sag * (1 - WEB_WOBBLE / 2 + noise(seed + i) * WEB_WOBBLE);
    if (i === 0) ctx.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
    else ctx.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
  }
  ctx.stroke();
}

/**
 * The patches of floor spells and flasks leave, each a circle as round and as wide as the aim guide showed it: frame 0 water
 * (Create Water), 1 water charged with lightning, 2 grease, 3 burning floor (systems/LastingSpells.ts, systems/Surfaces.ts);
 * frame 4 Web's webs, a square (its cube).
 */
export function genPuddleSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(PUDDLE_SIZE * (PUDDLE_LOOKS.length + 1), PUDDLE_SIZE);
  drawWeb(ctx, PUDDLE_LOOKS.length * PUDDLE_SIZE + PUDDLE_ART_RADIUS, PUDDLE_ART_RADIUS, PUDDLE_ART_RADIUS - 1, 977);
  const r = PUDDLE_ART_RADIUS;
  PUDDLE_LOOKS.forEach((look, i) => {
    const cx = i * PUDDLE_SIZE + r;
    const cy = r;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    const fill = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    for (const [at, colour] of look.stops) fill.addColorStop(at, colour);
    ctx.fillStyle = fill;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    drawPuddleMarks(ctx, look, cx, cy, r, i * 101 + 7);
    drawPuddleGlints(ctx, look, cx, cy, r, i * 53 + 3);
    ctx.strokeStyle = look.rim;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r - 3, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  });
  return c;
}
