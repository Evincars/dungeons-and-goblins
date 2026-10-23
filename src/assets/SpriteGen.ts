/** Procedural sprite/texture generation — UI elements only.
 *  Tiles and characters are loaded from /public assets.
 */

import { context2d, createCanvas } from '../render/canvas';

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

// ── EXIT BUTTON (lever/pull) ──────────────────────────────────────────────────

export function genExitButtonSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(64, 32);
  // Two states: inactive (col 0) and active/pulled (col 1)
  for (let state = 0; state < 2; state++) {
    const ox = state * 32;
    const BASE = state === 1 ? 0x3a8040 : 0x3a3030;
    const GLOW = state === 1 ? 0x40ff80 : 0x808060;
    rect(ctx, ox + 4,  12, 24, 20, 0x2a2020);
    rect(ctx, ox + 5,  13, 22, 18, BASE);
    rect(ctx, ox + 6,  14, 20, 16, 0x3a3535);
    // Rune circle
    ctx.strokeStyle = hex(GLOW);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(ox + 16, 21, 7, 0, Math.PI * 2); ctx.stroke();
    // Central symbol
    ctx.fillStyle = hex(GLOW);
    ctx.fillRect(ox + 14, 21, 4, 1);
    ctx.fillRect(ox + 16, 19, 1, 4);
    // Pedestal top
    rect(ctx, ox + 2, 10, 28, 4, 0x5a5048);
    rect(ctx, ox + 3, 11, 26, 2, 0x7a6858);
    // Glow ring if active
    if (state === 1) {
      ctx.fillStyle = 'rgba(64,255,128,0.25)';
      ctx.beginPath(); ctx.arc(ox + 16, 21, 10, 0, Math.PI * 2); ctx.fill();
    }
  }
  return c;
}

// ── SAFE-ROOM GATE AND LEVER ─────────────────────────────────────────────────

/** A portcullis over one doorway tile, 32×40: iron bars and crossbars, spiked at the foot, rising above the tile. */
export function genPortcullis(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(32, 40);
  const IRON = 0x2b2f36;
  const LIGHT = 0x5a626e;
  const DARK = 0x15171b;
  for (let x = 2; x < 32; x += 6) {
    rect(ctx, x, 0, 3, 36, IRON);
    rect(ctx, x, 0, 1, 36, LIGHT);
    rect(ctx, x + 2, 0, 1, 36, DARK);
    rect(ctx, x, 36, 3, 2, IRON);
    px(ctx, x + 1, 38, LIGHT);
    px(ctx, x + 1, 39, IRON);
  }
  for (const y of [4, 16, 28]) {
    rect(ctx, 0, y, 32, 3, IRON);
    rect(ctx, 0, y, 32, 1, LIGHT);
    rect(ctx, 0, y + 2, 32, 1, DARK);
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

