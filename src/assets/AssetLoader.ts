import { Texture } from 'pixi.js';
import { context2d, createCanvas, imageOf } from '../render/canvas';
import { LoadError } from '../core/errors';
import { getTexture, hasTexture, setTexture } from './Textures';
import { loadSheets } from './SpriteSheet';
import { registerSheet } from '../render/Sheets';
import { allSheets, registerLazyArt } from './SheetCatalog';
import {
  genSpellBoltSheet,
  genSpawnerSheet, genExitButtonSheet,
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
  exit_button:        genExitButtonSheet,
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
/** Chests in old, dark wood, so they sit in the gloom of the dungeon instead of glowing orange. */
const DARK_WOOD: Rgb = { r: 0.72, g: 0.56, b: 0.44 };
const CHEST_FRAME = { w: 32, h: 53 };

export async function loadAllAssets(onProgress?: (fraction: number) => void): Promise<void> {
  await loadSheets(allSheets());
  registerLazyArt();
  buildTorchStrip();
  buildCampfireStrip();
  recolor('button', 'button_steel', STEEL, BUTTON_FRAME);
  recolor('chest', 'chest_dark', DARK_WOOD, CHEST_FRAME);
  for (const [key, draw] of Object.entries(PROCEDURAL)) setTexture(key, Texture.from(draw()));
  setTexture('panel_hud', Texture.from(genPanelBg(HUD_PANEL.w, HUD_PANEL.h)));
  setTexture('panel_inv', Texture.from(genPanelBg(INVENTORY_PANEL.w, INVENTORY_PANEL.h)));
  onProgress?.(1);
}

export { getTexture };
