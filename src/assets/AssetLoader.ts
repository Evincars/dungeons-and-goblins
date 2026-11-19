import { Texture } from 'pixi.js';
import { context2d, createCanvas, imageOf } from '../render/canvas';
import { LoadError, report } from '../core/errors';
import { getTexture, hasTexture, setTexture } from './Textures';
import { loadSheets } from './SpriteSheet';
import { registerSheet } from '../render/Sheets';
import { allSheets, registerLazyArt } from './SheetCatalog';
import { loadVfx } from '../render/Vfx';
import {
  CAVE_ROCK_CUT, CAVE_SHEET, ROCK_BLACK, ROCK_CUT, SLANT_FACE, SLANT_RIM, SLANT_SHEAR,
  caveSlantKey, slantShift,
} from '../level/CaveTerrain';
import type { SlantLean } from '../level/CaveTerrain';
import {
  genSpellBoltSheet, genPuddleSheet,
  genSpawnerSheet, genLeverSheet, genPortcullis,
  genSwordSwingSheet, genDeathFxSheet,
  genDarkSheet,
  genPanelBg, genPortrait, genMinimapIcons,
  CAMPFIRE_CELL, drawCampfireBase, genArrowSprite, genBootsIcon, genRingIcon,
} from './SpriteGen';

/** The torch animation is four separate 16×16 images, composited into one strip. */
const TORCH_FRAMES = 4;
const TORCH_FRAME_SIZE = 16;
/** The flame in each torch frame (above its wall bracket), and where a campfire's three flames stand. */
const TORCH_FLAME = { x: 6, y: 0, w: 4, h: 7 };
const CAMPFIRE_FLAMES: ReadonlyArray<{ x: number; y: number; scale: number; lag: number }> = [
  { x: 6, y: 9, scale: 1, lag: 1 },
  { x: 14, y: 9, scale: 1, lag: 2 },
  { x: 8, y: 2, scale: 2, lag: 0 },
];
/** Sizes of the generated HUD and inventory panel backgrounds. */
const HUD_PANEL = { w: 512, h: 80 };
const INVENTORY_PANEL = { w: 320, h: 240 };

/** Procedural UI/FX textures, drawn on canvases at load time. */
const PROCEDURAL: Record<string, () => HTMLCanvasElement> = {
  spell_bolt:         genSpellBoltSheet,
  spawner:            genSpawnerSheet,
  puddle:             genPuddleSheet,
  portcullis:         genPortcullis,
  lever:              genLeverSheet,
  fx_sword_swing:     genSwordSwingSheet,
  fx_death:           genDeathFxSheet,
  dark:               genDarkSheet,
  portrait:           genPortrait,
  mapicons:           genMinimapIcons,
  icon_boots:         genBootsIcon,
  icon_ring:          genRingIcon,
  arrow_projectile:   genArrowSprite,
};

/** A loaded image as a drawable source; missing art is a load failure, not something to draw around. */
function imageFor(alias: string): CanvasImageSource {
  const image = hasTexture(alias) ? imageOf(getTexture(alias)) : null;
  if (!image) throw new LoadError(`Image "${alias}" did not load`, { context: { alias } });
  return image;
}

/** Composite the four 16×16 torch frames into one 64×16 animation strip. */
function buildTorchStrip(): void {
  const canvas = createCanvas(TORCH_FRAMES * TORCH_FRAME_SIZE, TORCH_FRAME_SIZE);
  const ctx = context2d(canvas);
  for (let i = 0; i < TORCH_FRAMES; i++) ctx.drawImage(imageFor(`torch_${i + 1}`), i * TORCH_FRAME_SIZE, 0);
  const strip = Texture.from(canvas);
  strip.source.scaleMode = 'nearest';
  setTexture('torch', strip);
}

/**
 * The exit room's campfires: stones and logs drawn here, under three torch flames each a frame out of
 * step with the others, so the fire never repeats one shape.
 */
function buildCampfireStrip(): void {
  const canvas = createCanvas(TORCH_FRAMES * CAMPFIRE_CELL, CAMPFIRE_CELL);
  const ctx = context2d(canvas);
  ctx.imageSmoothingEnabled = false;
  const f = TORCH_FLAME;
  for (let frame = 0; frame < TORCH_FRAMES; frame++) {
    const ox = frame * CAMPFIRE_CELL;
    drawCampfireBase(ctx, ox, frame);
    for (const flame of CAMPFIRE_FLAMES) {
      const torch = imageFor(`torch_${((frame + flame.lag) % TORCH_FRAMES) + 1}`);
      ctx.drawImage(torch, f.x, f.y, f.w, f.h, ox + flame.x, flame.y, f.w * flame.scale, f.h * flame.scale);
    }
  }
  const strip = Texture.from(canvas);
  strip.source.scaleMode = 'nearest';
  setTexture('campfire', strip);
}

/**
 * The hearth under a campfire: a ring of the tileset's warm cobbles (the cobblestone face's stones, cols 5–8, rows
 * 22–24), unlike the floor round it, darkening a little to a sooty rim.
 */
const HEARTH = { w: 50, h: 22 };
const HEARTH_STONES = { x: 80, y: 352, w: 64, h: 48 };
const HEARTH_SOOT = 0.35;
const HEARTH_RIM = 'rgba(24,18,14,0.9)';

function buildCampfireFloor(): void {
  const { w, h } = HEARTH;
  const canvas = createCanvas(w, h);
  const ctx = context2d(canvas);
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2);
  ctx.clip();
  const stones = HEARTH_STONES;
  ctx.drawImage(imageFor('tileset'), stones.x, stones.y, stones.w, stones.h, (w - stones.w) / 2, (h - stones.h) / 2, stones.w, stones.h);
  ctx.translate(w / 2, h / 2);
  ctx.scale(1, h / w);
  const soot = ctx.createRadialGradient(0, 0, w * 0.15, 0, 0, w / 2);
  soot.addColorStop(0, 'rgba(0,0,0,0)');
  soot.addColorStop(1, `rgba(0,0,0,${HEARTH_SOOT})`);
  ctx.fillStyle = soot;
  ctx.fillRect(-w / 2, -w / 2, w, w);
  ctx.restore();
  ctx.strokeStyle = HEARTH_RIM;
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2);
  ctx.stroke();
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  setTexture('campfire_floor', texture);
}

/** The caverns' rock sheared down the slant, each column pushed down by half its distance along: slanted walls lean. */
function buildCaveSlants(): void {
  for (const [part, art] of [['rim', SLANT_RIM], ['face', SLANT_FACE]] as const) {
    for (const lean of ['down', 'up'] as const) setTexture(caveSlantKey(part, lean), shearedRock(art, lean));
  }
}

/** A piece of the cave set sheared down the slant (two across for one down), leaning `lean`. */
function shearedRock(art: { x: number; y: number; w: number; h: number }, lean: SlantLean): Texture {
  const image = imageFor(CAVE_SHEET);
  const canvas = createCanvas(art.w, art.h + art.w / SLANT_SHEAR);
  const ctx = context2d(canvas);
  ctx.imageSmoothingEnabled = false;
  for (let c = 0; c < art.w; c++) ctx.drawImage(image, art.x + c, art.y, 1, art.h, c, slantShift(c, art.w, lean), 1, art.h);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  return texture;
}

/** The caverns' rock with its black cleared: what spills over the ground beside a wall is only its stones. */
function buildCaveRockCut(): void {
  const { x, y, w, h } = ROCK_CUT;
  const canvas = createCanvas(w, h);
  const ctx = context2d(canvas, { willReadFrequently: true });
  ctx.drawImage(imageFor(CAVE_SHEET), x, y, w, h, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h);
  const d = pixels.data;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.max(d[i], d[i + 1], d[i + 2]) <= ROCK_BLACK) d[i + 3] = 0;
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  setTexture(CAVE_ROCK_CUT, texture);
}

type Rgb = { r: number; g: number; b: number };

/**
 * A loaded image redrawn in other colours, registered under `key` with the same frames: every pixel's
 * brightness is mapped to `tint` (each channel a share of the brightness), keeping its alpha.
 */
function recolor(sourceKey: string, key: string, tint: Rgb, frame: { w: number; h: number }): void {
  const source = getTexture(sourceKey);
  const canvas = createCanvas(source.width, source.height);
  const ctx = context2d(canvas, { willReadFrequently: true });
  ctx.drawImage(imageFor(sourceKey), 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = pixels.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
    d[i] = lum * tint.r;
    d[i + 1] = lum * tint.g;
    d[i + 2] = lum * tint.b;
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  setTexture(key, texture);
  registerSheet(key, { frameWidth: frame.w, frameHeight: frame.h });
}

/** The menu buttons: Redux's copper button art turned to cold steel, to match the dark interface. */
const STEEL: Rgb = { r: 0.62, g: 0.68, b: 0.78 };
const BUTTON_FRAME = { w: 128, h: 24 };

/** Loads and builds every picture, reporting how many of the image files are in (for the loading screen). */
export async function loadAllAssets(onProgress?: (done: number, total: number) => void): Promise<void> {
  const sheets = allSheets();
  await loadSheets(sheets, (fraction) => onProgress?.(Math.floor(fraction * sheets.length), sheets.length));
  registerLazyArt();
  buildTorchStrip();
  buildCampfireStrip();
  buildCampfireFloor();
  buildCaveRockCut();
  buildCaveSlants();
  recolor('button', 'button_steel', STEEL, BUTTON_FRAME);
  for (const [key, draw] of Object.entries(PROCEDURAL)) setTexture(key, Texture.from(draw()));
  setTexture('panel_hud', Texture.from(genPanelBg(HUD_PANEL.w, HUD_PANEL.h)));
  setTexture('panel_inv', Texture.from(genPanelBg(INVENTORY_PANEL.w, INVENTORY_PANEL.h)));
  // The particle effects are only looks: without them the game plays on, and the log says why.
  const vfx = await loadVfx();
  if (!vfx.ok) report(vfx.error, 'Particle effects could not be loaded', 'assets');
  onProgress?.(sheets.length, sheets.length);
}

export { getTexture };
