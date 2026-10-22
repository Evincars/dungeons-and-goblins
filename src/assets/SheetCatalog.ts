import { SpriteSheet, frameRun } from './SpriteSheet';
import type { Rect, SheetRegion } from './SpriteSheet';
import { characterSheets } from '../characters/Characters';
import { PROPS, PROP_IMAGES } from '../level/Props';
import type { PropDef, PropImage } from '../level/Props';

/**
 * Every image the game loads from /public, and how each is cut up. Characters and props declare their own
 * parts (CharacterDefs, PROPS); everything else is listed here.
 */

const OBJECTS = '/objects-assets';

// ── Traps (mapped for later; nothing places them yet) ──────────────────────────

/** Pressure plates: four looks side by side, eight frames down (flat → spikes up → back), bottom-aligned 32px apart. */
const PLATE_TOPS = [0, 29, 59, 93, 128, 157, 187, 221];
const PLATE_BOTTOM = 16;
const PLATE_W = 16;
const PLATE_ROW = 32;
function plateFrames(x: number): Rect[] {
  return PLATE_TOPS.map((top, i) => ({ x, y: top, w: PLATE_W, h: PLATE_BOTTOM + i * PLATE_ROW - top }));
}

/** Saws: six frames 32px apart down the sheet; the second half of the sheet is the dark-steel set. */
const SAW_FRAMES = 6;
const SAW_ROW = 32;
const SAW_DARK = 192;
/** The long vertical track plays down its first column, then back up its second. */
function sawTrackFrames(x: number): Rect[] {
  const down = frameRun(x, 0, 16, 64, 3, 0, 64);
  const up = frameRun(x + 16, 0, 16, 64, 3, 0, 64);
  return [...down, ...up];
}
function sawRegions(prefix: string, dx: number): Record<string, SheetRegion> {
  return {
    [prefix]:               { frames: frameRun(dx, 0, 32, 32, SAW_FRAMES, 0, SAW_ROW) },
    [`${prefix}_side`]:     { frames: frameRun(dx + 48, 0, 16, 32, SAW_FRAMES, 0, SAW_ROW) },
    [`${prefix}_track`]:    { frames: frameRun(dx + 80, 0, 64, 32, SAW_FRAMES, 0, SAW_ROW) },
    [`${prefix}_track_v`]:  { frames: sawTrackFrames(dx + 160) },
  };
}

/** Fire jets: nine frames 112px apart, each holding every nozzle (two floor ones, one in a wall, two sideways). */
const FIRE_FRAMES = 9;
const FIRE_STEP = 112;
const fireRun = (x: number, y: number, w: number, h: number): { frames: Rect[] } =>
  ({ frames: frameRun(x, y, w, h, FIRE_FRAMES, FIRE_STEP) });

const TRAP_SHEETS = [
  new SpriteSheet('trap_plate', `${OBJECTS}/trap_plate.png`, {
    regions: {
      trap_plate:        { frames: plateFrames(0) },
      trap_plate_dark:   { frames: plateFrames(32) },
      trap_plate_b:      { frames: plateFrames(57) },
      trap_plate_b_dark: { frames: plateFrames(89) },
    },
  }),
  new SpriteSheet('trap_saw', `${OBJECTS}/trap_saw.png`, {
    regions: {
      ...sawRegions('trap_saw', 0),
      ...sawRegions('trap_saw_dark', SAW_DARK),
      trap_saw_blade: { frames: frameRun(0, 192, 32, 32, SAW_FRAMES, 32) },
      trap_saw_slot:  { frames: frameRun(0, 224, 16, 32, SAW_FRAMES, 16) },
      trap_saw_rail_v:      { x: 262, y: 194, w: 5, h: 45 },
      trap_saw_rail_h:      { x: 274, y: 205, w: 45, h: 5 },
      trap_saw_base:        { x: 272, y: 224, w: 48, h: 16 },
      trap_saw_dark_rail_v: { x: 326, y: 194, w: 5, h: 45 },
      trap_saw_dark_rail_h: { x: 338, y: 205, w: 45, h: 5 },
      trap_saw_dark_base:   { x: 336, y: 224, w: 48, h: 16 },
    },
  }),
  new SpriteSheet('trap_fire', `${OBJECTS}/fire_trap.png`, {
    regions: {
      trap_fire_floor:      fireRun(0, 0, 32, 64),
      trap_fire_floor_dark: fireRun(48, 0, 32, 64),
      trap_fire_wall:       fireRun(80, 0, 32, 64),
      trap_fire_right:      fireRun(0, 64, 80, 32),
      trap_fire_left:       fireRun(0, 96, 80, 32),
    },
  }),
];

// ── Item icons (loose weapons and shields, for inventories later) ─────────────

/** Weapons and shields lying loose at the bottom of supplies_objects.png, in reading order. */
const ARMS_ICONS = {
  item_arms_00: { x: 197, y: 491, w: 7, h: 20 },
  item_arms_01: { x: 35, y: 517, w: 10, h: 10 },
  item_arms_02: { x: 50, y: 514, w: 13, h: 13 },
  item_arms_03: { x: 64, y: 512, w: 15, h: 15 },
  item_arms_04: { x: 85, y: 514, w: 7, h: 13 },
  item_arms_05: { x: 102, y: 514, w: 5, h: 13 },
  item_arms_06: { x: 115, y: 517, w: 10, h: 10 },
  item_arms_07: { x: 131, y: 514, w: 11, h: 13 },
  item_arms_08: { x: 145, y: 513, w: 14, h: 14 },
  item_arms_09: { x: 5, y: 525, w: 7, h: 34 },
  item_arms_10: { x: 19, y: 525, w: 11, h: 34 },
  item_arms_11: { x: 36, y: 539, w: 9, h: 20 },
  item_arms_12: { x: 50, y: 541, w: 11, h: 18 },
  item_arms_13: { x: 66, y: 541, w: 11, h: 18 },
  item_arms_14: { x: 81, y: 541, w: 13, h: 18 },
  item_arms_15: { x: 97, y: 536, w: 10, h: 23 },
  item_arms_16: { x: 114, y: 535, w: 9, h: 24 },
  item_arms_17: { x: 130, y: 536, w: 11, h: 23 },
  item_arms_18: { x: 146, y: 529, w: 8, h: 30 },
  item_arms_19: { x: 165, y: 513, w: 7, h: 30 },
  item_arms_20: { x: 179, y: 513, w: 9, h: 30 },
  item_arms_21: { x: 195, y: 525, w: 9, h: 34 },
  item_arms_22: { x: 81, y: 561, w: 15, h: 14 },
  item_arms_23: { x: 112, y: 561, w: 16, h: 15 },
  item_arms_24: { x: 130, y: 565, w: 12, h: 11 },
  item_arms_25: { x: 146, y: 560, w: 12, h: 11 },
  item_arms_26: { x: 161, y: 555, w: 14, h: 20 },
  item_arms_27: { x: 179, y: 557, w: 11, h: 18 },
  item_arms_28: { x: 0, y: 560, w: 16, h: 21 },
  item_arms_29: { x: 16, y: 564, w: 16, h: 21 },
  item_arms_30: { x: 33, y: 561, w: 13, h: 19 },
  item_arms_31: { x: 50, y: 566, w: 13, h: 19 },
  item_arms_32: { x: 65, y: 566, w: 15, h: 14 },
  item_arms_33: { x: 96, y: 566, w: 16, h: 15 },
} as const satisfies Record<string, Rect>;

/** Arrows, spears, hammers, sickles and knives along the bottom of pedestals.png, left to right. */
const MISSILE_ICONS = {
  item_missile_00: { x: 12, y: 110, w: 24, h: 8 },
  item_missile_01: { x: 51, y: 119, w: 24, h: 8 },
  item_missile_02: { x: 52, y: 103, w: 24, h: 8 },
  item_missile_03: { x: 84, y: 109, w: 42, h: 11 },
  item_missile_04: { x: 140, y: 103, w: 42, h: 11 },
  item_missile_05: { x: 206, y: 103, w: 42, h: 11 },
  item_missile_06: { x: 268, y: 111, w: 25, h: 8 },
  item_missile_07: { x: 308, y: 103, w: 25, h: 8 },
  item_missile_08: { x: 309, y: 119, w: 25, h: 8 },
  item_missile_09: { x: 352, y: 108, w: 15, h: 12 },
  item_missile_10: { x: 375, y: 116, w: 15, h: 12 },
  item_missile_11: { x: 376, y: 100, w: 15, h: 12 },
  item_missile_12: { x: 415, y: 111, w: 19, h: 7 },
  item_missile_13: { x: 455, y: 103, w: 19, h: 7 },
  item_missile_14: { x: 455, y: 119, w: 19, h: 7 },
  item_missile_15: { x: 482, y: 111, w: 12, h: 6 },
  item_missile_16: { x: 506, y: 104, w: 12, h: 6 },
  item_missile_17: { x: 506, y: 120, w: 12, h: 6 },
} as const satisfies Record<string, Rect>;

/** Extra regions cut from the prop images besides the props themselves. */
const PROP_IMAGE_EXTRAS: Partial<Record<PropImage, Record<string, SheetRegion>>> = {
  supplies: ARMS_ICONS,
  pedestals: MISSILE_ICONS,
};

/** A prop's region: its still rect, or its animation frames (which may lie in other prop images). */
function propRegion(def: PropDef): SheetRegion {
  if (!def.frames) return def.rect;
  return { frames: def.frames.map((f) => ({ ...f, image: f.image && propSheetKey(f.image) })) };
}

const propSheetKey = (image: string): string => `props_${image}`;

/** One sheet per prop image (frame-per-file images too); each prop is a region keyed `prop_<kind>`. */
function propSheets(): SpriteSheet[] {
  const regions = new Map<string, Record<string, SheetRegion>>();
  for (const image of Object.keys(PROP_IMAGES)) regions.set(image, {});
  for (const [image, extras] of Object.entries(PROP_IMAGE_EXTRAS)) Object.assign(regions.get(image) ?? {}, extras);
  for (const [kind, def] of Object.entries<PropDef>(PROPS)) {
    const parts = regions.get(def.image);
    if (parts) parts[`prop_${kind}`] = propRegion(def);
  }
  return Object.entries(PROP_IMAGES).map(([image, src]) => new SpriteSheet(propSheetKey(image), src, { regions: regions.get(image) }));
}

// ── Everything else ───────────────────────────────────────────────────────────

const UI_SHEETS = [
  // Terrain tiles (16×16 base tile, used via tilesetRect())
  new SpriteSheet('tileset', '/catacombs/mainlevbuild.png', { grid: { frameWidth: 16, frameHeight: 16 } }),

  // Cave tileset: its ground tiles floor the cave halls (see level/TerrainAutotile.ts)
  new SpriteSheet('cave_ground', '/caves/MainLev2.0.png'),

  // Torch frames (16×16 each) — composited into a single 'torch' strip by the loader
  new SpriteSheet('torch_1', '/catacombs/torch_1.png'),
  new SpriteSheet('torch_2', '/catacombs/torch_2.png'),
  new SpriteSheet('torch_3', '/catacombs/torch_3.png'),
  new SpriteSheet('torch_4', '/catacombs/torch_4.png'),

  // Bars (from Catacomb Snatch): world bars are 21 steps of 32×4,
  // HUD panel bars are 101 rows of 100×6 (row 0 = full).
  new SpriteSheet('bar_green',          '/ui/bar_green.png',          { grid: { frameWidth: 32, frameHeight: 4 } }),
  new SpriteSheet('bar_green_underlay', '/ui/bar_green_underlay.png', { grid: { frameWidth: 32, frameHeight: 4 } }),
  new SpriteSheet('bar_outline',        '/ui/bar_outline.png',        { grid: { frameWidth: 32, frameHeight: 4 } }),
  new SpriteSheet('sprint_bar',         '/ui/sprint_bar.png',         { grid: { frameWidth: 32, frameHeight: 4 } }),
  new SpriteSheet('panel_healthbar',    '/ui/panel_healthbar.png',    { grid: { frameWidth: 100, frameHeight: 6 } }),
  new SpriteSheet('panel_xpbar',        '/ui/panel_xpbar.png',        { grid: { frameWidth: 100, frameHeight: 6 } }),

  // Menu art from Catacomb Snatch Redux: three 128×24 button states, and the PAUSE title overlay.
  new SpriteSheet('button',       '/ui/button.png', { grid: { frameWidth: 128, frameHeight: 24 } }),
  new SpriteSheet('pause_screen', '/ui/pause_screen.png'),
  // Painted art: the menu background, and the inventory's two framed panels.
  new SpriteSheet('menu_background', '/menu-1.jpg', { smooth: true }),
  // The inventory art has a stray white strip down its right edge; the region stops short of it.
  new SpriteSheet('inventory_panels', '/inventory.png', {
    smooth: true, regions: { inventory_art: { x: 0, y: 0, w: 2732, h: 1536 } },
  }),

  // Catacomb Snatch Redux's main font: 16×16 glyphs of 8×8 for character codes 0–255, drawn white and tinted.
  new SpriteSheet('font_default', '/ui/fonts/font_default.png', { grid: { frameWidth: 8, frameHeight: 8 } }),

  // Coins and gems from Catacomb Snatch Redux, each a strip of spin frames.
  ...[
    ['pickup_coin_bronze_small_8', 8], ['pickup_coin_silver_small_8', 8], ['pickup_coin_gold_small_8', 8],
    ['pickup_coin_bronze_16', 16], ['pickup_coin_silver_16', 16], ['pickup_coin_gold_16', 16],
    ['pickup_gem_emerald_12', 16], ['pickup_gem_ruby_12', 16], ['pickup_gem_diamond_24', 24],
  ].map(([key, size]) => new SpriteSheet(String(key), `/ui/pickup/${key}.png`, { grid: { frameWidth: Number(size), frameHeight: Number(size) } })),

  // Effects from Catacomb Snatch Redux: the "!" over a falling player, and footstep dust recoloured to dark dirt.
  new SpriteSheet('exclamation_mark', '/ui/effects/exclamation_mark.png', { grid: { frameWidth: 4, frameHeight: 13 } }),
  new SpriteSheet('fx_dirt', '/ui/effects/fx_dirt_12.png', { grid: { frameWidth: 12, frameHeight: 12 } }),

  // Chests: closed and open, side by side (the open lid reaches up to the top of the frame).
  new SpriteSheet('chest',       `${OBJECTS}/chest_small.png`, { grid: { frameWidth: 32, frameHeight: 53 } }),
  new SpriteSheet('chest_large', `${OBJECTS}/chest_large.png`, { grid: { frameWidth: 64, frameHeight: 53 } }),
];

/** Every image to load, in one list for the loader. */
export function allSheets(): SpriteSheet[] {
  return [...UI_SHEETS, ...characterSheets(), ...propSheets(), ...TRAP_SHEETS];
}
