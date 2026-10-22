/**
 * Dungeon props, each cut to its exact sprite bounds from one of the prop images: the catacomb decor
 * (/catacombs/decorative.png), the objects in /objects-assets (wall decor, supplies, pedestals) and the
 * cave decor and plants in /caves.
 */

export const PROP_IMAGES = {
  decorative: '/catacombs/decorative.png',
  wall_decor: '/objects-assets/Other_objects.png',
  supplies:   '/objects-assets/supplies_objects.png',
  pedestals:  '/objects-assets/pedestals.png',
  // Candle flames, one image per frame.
  candle_a_1: '/catacombs/candleA_01.png',
  candle_a_2: '/catacombs/candleA_02.png',
  candle_a_3: '/catacombs/candleA_03.png',
  candle_a_4: '/catacombs/candleA_04.png',
  candle_b_1: '/catacombs/candleB_01.png',
  candle_b_2: '/catacombs/candleB_02.png',
  candle_b_3: '/catacombs/candleB_03.png',
  candle_b_4: '/catacombs/candleB_04.png',
  cave_decor: '/caves/decorative.png',
  // Cave plants: one layout in four colours, each plant swaying through four frames in a row.
  cave_plants_yellow: '/caves/LedA.png',
  cave_plants_red:    '/caves/LedB.png',
  cave_plants_lilac:  '/caves/LedC.png',
  cave_plants_teal:   '/caves/LedD.png',
  // Big glowing crystals (/crystals), four frames each, one file per frame.
  gem_crystal_blue_1: '/crystals/Blue/blue_crystal_0000.png',
  gem_crystal_blue_2: '/crystals/Blue/blue_crystal_0001.png',
  gem_crystal_blue_3: '/crystals/Blue/blue_crystal_0002.png',
  gem_crystal_blue_4: '/crystals/Blue/blue_crystal_0003.png',
  gem_crystal_green_1: '/crystals/Green/green_crystal_0000.png',
  gem_crystal_green_2: '/crystals/Green/green_crystal_0001.png',
  gem_crystal_green_3: '/crystals/Green/green_crystal_0002.png',
  gem_crystal_green_4: '/crystals/Green/green_crystal_0003.png',
  gem_crystal_pink_1: '/crystals/Pink/pink_crystal_0000.png',
  gem_crystal_pink_2: '/crystals/Pink/pink_crystal_0001.png',
  gem_crystal_pink_3: '/crystals/Pink/pink_crystal_0002.png',
  gem_crystal_pink_4: '/crystals/Pink/pink_crystal_0003.png',
  gem_crystal_purple_1: '/crystals/Purple/purple_crystal_0000.png',
  gem_crystal_purple_2: '/crystals/Purple/purple_crystal_0001.png',
  gem_crystal_purple_3: '/crystals/Purple/purple_crystal_0002.png',
  gem_crystal_purple_4: '/crystals/Purple/purple_crystal_0003.png',
  gem_crystal_red_1: '/crystals/Red/red_crystal_0000.png',
  gem_crystal_red_2: '/crystals/Red/red_crystal_0001.png',
  gem_crystal_red_3: '/crystals/Red/red_crystal_0002.png',
  gem_crystal_red_4: '/crystals/Red/red_crystal_0003.png',
} as const satisfies Record<string, string>;

export type PropImage = keyof typeof PROP_IMAGES;

import { TILE_HEIGHT, TILE_WIDTH } from './TileType';

type Rect = { x: number; y: number; w: number; h: number };

/** Floor props rest this far down their tile (just above its bottom edge), so they depth-sort with whoever stands around them. */
export const PROP_GROUND = TILE_HEIGHT - 4;
/**
 * A solid prop blocks only a strip at its foot this deep (or its own height, if shorter), as wide as its
 * art less a little each side: characters walk right up to an urn, and behind a tall crate stack.
 */
const BASE_DEPTH = 12;
const BASE_INSET = 2;

/** Where a prop blocks, in pixels from the top-left of its tile (it may reach into the tiles of its footprint). */
export type BlockRect = { x0: number; y0: number; x1: number; y1: number };
/** One frame of an animated prop; it may come from another prop image than the prop's own. */
export type PropFrame = Rect & { image?: PropImage };

export type PropDef = {
  image: PropImage;
  /** The sprite's bounds (an animated prop's first frame). */
  rect: Rect;
  /** 'floor' stands on its tile; 'wall' hangs on the brick face above its tile. */
  mount: 'floor' | 'wall';
  /** Occupies its tile as an obstacle (coffins, crates, posts). */
  solid?: boolean;
  /** Tiles a large solid prop blocks: `w` across (odd, centred on its tile) and `h` up from its tile. */
  footprint?: { w: number; h: number };
  /** How much of its foot a solid prop blocks, when not worked out from its art (`w` wide, `d` deep). */
  base?: { w: number; d: number };
  /** Light radius, for candles and crystals. */
  glow?: number;
  /** The glow is cold (crystals) rather than firelight. */
  coolGlow?: boolean;
  /** How often it is picked against the others in its group (default 1): rare finds weigh less. */
  weight?: number;
  /** Animation frames, played in a loop `frameTime` ticks each. */
  frames?: readonly PropFrame[];
  frameTime?: number;
};

/** The same rect in each of several images: an animation stored one frame per file. */
function framesFromImages(images: readonly PropImage[], w: number, h: number): PropFrame[] {
  return images.map((image) => ({ x: 0, y: 0, w, h, image }));
}

/** `count` frames side by side, `step` apart. */
function framesInRow(r: Rect, count: number, step: number): PropFrame[] {
  return Array.from({ length: count }, (_, i) => ({ ...r, x: r.x + i * step }));
}

const CANDLE_A = ['candle_a_1', 'candle_a_2', 'candle_a_3', 'candle_a_4'] as const;
const CANDLE_B = ['candle_b_1', 'candle_b_2', 'candle_b_3', 'candle_b_4'] as const;
const CANDLE_FRAME_TICKS = 7;
/** Cave plants: four frames 32px apart, each row 64px below the last plant's. */
const PLANT_FRAMES = 4;
const PLANT_STEP = 32;
const PLANT_FRAME_TICKS = 12;
const PLANT_RECTS = [
  { x: 11, y: 8, w: 15, h: 17 },
  { x: 9, y: 72, w: 14, h: 17 },
  { x: 8, y: 136, w: 15, h: 17 },
  { x: 0, y: 198, w: 32, h: 26 },
] as const;
/** The big crystals: a 24×51 crystal (in 64×64 files) slowly glinting, with a cold glow; very rare. */
const GEM_CRYSTAL_RECT = { x: 19, y: 9, w: 24, h: 51 };
const GEM_CRYSTAL_FRAME_TICKS = 9;
const GEM_CRYSTAL_GLOW = 52;
function gemCrystal(images: readonly PropImage[]): PropDef {
  const { x, y, w, h } = GEM_CRYSTAL_RECT;
  return {
    image: images[0], rect: GEM_CRYSTAL_RECT, mount: 'floor', solid: true, base: { w: 14, d: 6 },
    glow: GEM_CRYSTAL_GLOW, coolGlow: true,
    frames: images.map((image) => ({ x, y, w, h, image })), frameTime: GEM_CRYSTAL_FRAME_TICKS,
  };
}

function plant(image: PropImage, kind: number): PropDef {
  const rect = PLANT_RECTS[kind];
  return { image, rect, mount: 'floor', frames: framesInRow(rect, PLANT_FRAMES, PLANT_STEP), frameTime: PLANT_FRAME_TICKS };
}

export const PROPS = {
  // ── Catacomb decor ──────────────────────────────────────────────────────────
  coffin:            { image: 'decorative', rect: { x: 87, y: 69, w: 18, h: 43 }, mount: 'floor', solid: true },
  coffin_cracked:    { image: 'decorative', rect: { x: 55, y: 69, w: 18, h: 43 }, mount: 'floor', solid: true },
  coffin_open:       { image: 'decorative', rect: { x: 87, y: 122, w: 18, h: 38 }, mount: 'floor', solid: true },
  sarcophagus:       { image: 'decorative', rect: { x: 5, y: 101, w: 37, h: 27 }, mount: 'floor', solid: true, base: { w: 30, d: 20 } },
  sarcophagus2:      { image: 'decorative', rect: { x: 5, y: 197, w: 37, h: 27 }, mount: 'floor', solid: true, base: { w: 30, d: 20 } },
  sarcophagus_open:  { image: 'decorative', rect: { x: 5, y: 69, w: 37, h: 27 }, mount: 'floor', solid: true, base: { w: 30, d: 20 } },
  sarcophagus_open2: { image: 'decorative', rect: { x: 5, y: 165, w: 37, h: 27 }, mount: 'floor', solid: true, base: { w: 30, d: 20 } },
  crate:             { image: 'decorative', rect: { x: 130, y: 75, w: 12, h: 21 }, mount: 'floor', solid: true },
  crate2:            { image: 'decorative', rect: { x: 170, y: 75, w: 12, h: 21 }, mount: 'floor', solid: true },
  crate_stack:       { image: 'decorative', rect: { x: 144, y: 71, w: 16, h: 41 }, mount: 'floor', solid: true },
  crate_stack2:      { image: 'decorative', rect: { x: 200, y: 71, w: 16, h: 41 }, mount: 'floor', solid: true },
  post:              { image: 'decorative', rect: { x: 1, y: 20, w: 13, h: 44 }, mount: 'floor', solid: true },
  post2:             { image: 'decorative', rect: { x: 65, y: 16, w: 13, h: 48 }, mount: 'floor', solid: true },
  urn:               { image: 'decorative', rect: { x: 144, y: 124, w: 16, h: 20 }, mount: 'floor', solid: true },
  urn_small:         { image: 'decorative', rect: { x: 162, y: 128, w: 12, h: 16 }, mount: 'floor', solid: true },
  urn_green:         { image: 'decorative', rect: { x: 144, y: 172, w: 16, h: 20 }, mount: 'floor', solid: true },
  urn_green_small:   { image: 'decorative', rect: { x: 162, y: 176, w: 12, h: 16 }, mount: 'floor', solid: true },
  urn_broken:        { image: 'decorative', rect: { x: 144, y: 147, w: 16, h: 13 }, mount: 'floor' },
  crate_broken:      { image: 'decorative', rect: { x: 130, y: 97, w: 12, h: 15 }, mount: 'floor' },
  candles: {
    image: 'candle_b_1', rect: { x: 0, y: 0, w: 13, h: 16 }, mount: 'floor', glow: 44,
    frames: framesFromImages(CANDLE_B, 13, 16), frameTime: CANDLE_FRAME_TICKS,
  },
  candle: {
    image: 'candle_a_1', rect: { x: 0, y: 0, w: 7, h: 14 }, mount: 'floor', glow: 36,
    frames: framesFromImages(CANDLE_A, 7, 14), frameTime: CANDLE_FRAME_TICKS,
  },
  cauldron:          { image: 'decorative', rect: { x: 81, y: 16, w: 14, h: 32 }, mount: 'wall', weight: 1.5 },
  cauldron_water:    { image: 'decorative', rect: { x: 97, y: 16, w: 14, h: 32 }, mount: 'wall', weight: 1.5 },
  shackles:          { image: 'decorative', rect: { x: 113, y: 16, w: 14, h: 22 }, mount: 'wall', weight: 1.5 },
  chain:             { image: 'decorative', rect: { x: 148, y: 16, w: 7, h: 30 }, mount: 'wall', weight: 1.5 },

  // ── Wall decor (Other_objects.png): trophies, armour and banners hung on north walls ──
  dragon_skull:        { image: 'wall_decor', rect: { x: 7, y: 5, w: 34, h: 43 }, mount: 'wall', weight: 1 },
  skull_horned:        { image: 'wall_decor', rect: { x: 52, y: 12, w: 24, h: 25 }, mount: 'wall', weight: 2 },
  skull_crested:       { image: 'wall_decor', rect: { x: 87, y: 9, w: 19, h: 28 }, mount: 'wall', weight: 2 },
  dragon_skull_axe:    { image: 'wall_decor', rect: { x: 118, y: 5, w: 42, h: 43 }, mount: 'wall', weight: 0.6 },
  skull_horned_sword:  { image: 'wall_decor', rect: { x: 164, y: 12, w: 27, h: 25 }, mount: 'wall', weight: 1 },
  skull_crested_sword: { image: 'wall_decor', rect: { x: 199, y: 9, w: 20, h: 28 }, mount: 'wall', weight: 1 },
  dragon_skull_gold:   { image: 'wall_decor', rect: { x: 230, y: 5, w: 42, h: 45 }, mount: 'wall', weight: 0.25 },
  skull_horned_gold:   { image: 'wall_decor', rect: { x: 276, y: 12, w: 27, h: 28 }, mount: 'wall', weight: 0.4 },
  skull_crested_gold:  { image: 'wall_decor', rect: { x: 309, y: 9, w: 22, h: 31 }, mount: 'wall', weight: 0.4 },
  armor_bust:          { image: 'wall_decor', rect: { x: 70, y: 59, w: 21, h: 27 }, mount: 'wall', weight: 1.5 },
  armor_bust2:         { image: 'wall_decor', rect: { x: 102, y: 59, w: 19, h: 27 }, mount: 'wall', weight: 1.5 },
  armor_bust3:         { image: 'wall_decor', rect: { x: 133, y: 60, w: 21, h: 26 }, mount: 'wall', weight: 1.5 },
  banner_red:          { image: 'wall_decor', rect: { x: 164, y: 64, w: 23, h: 30 }, mount: 'wall', weight: 3 },
  banner_blue:         { image: 'wall_decor', rect: { x: 196, y: 64, w: 23, h: 30 }, mount: 'wall', weight: 3 },
  pennant_red:         { image: 'wall_decor', rect: { x: 225, y: 64, w: 15, h: 19 }, mount: 'wall', weight: 3 },
  pennant_blue:        { image: 'wall_decor', rect: { x: 241, y: 64, w: 15, h: 19 }, mount: 'wall', weight: 3 },
  // The cask fronts stand on the floor, backed against the wall.
  barrel:              { image: 'wall_decor', rect: { x: 2, y: 55, w: 29, h: 41 }, mount: 'floor', solid: true },
  barrel2:             { image: 'wall_decor', rect: { x: 34, y: 55, w: 29, h: 41 }, mount: 'floor', solid: true },

  // ── Supplies (supplies_objects.png): storeroom furniture backed against north walls ──
  shelf:               { image: 'supplies', rect: { x: 2, y: 12, w: 45, h: 43 }, mount: 'floor', solid: true, weight: 0.5 },
  shelf_goods:         { image: 'supplies', rect: { x: 50, y: 12, w: 45, h: 43 }, mount: 'floor', solid: true },
  shelf_goods2:        { image: 'supplies', rect: { x: 98, y: 12, w: 45, h: 43 }, mount: 'floor', solid: true },
  shelf_narrow:        { image: 'supplies', rect: { x: 146, y: 10, w: 29, h: 45 }, mount: 'floor', solid: true },
  shelf_narrow2:       { image: 'supplies', rect: { x: 178, y: 11, w: 29, h: 44 }, mount: 'floor', solid: true },
  shelf_dark:          { image: 'supplies', rect: { x: 2, y: 76, w: 45, h: 43 }, mount: 'floor', solid: true, weight: 0.5 },
  shelf_dark_goods:    { image: 'supplies', rect: { x: 50, y: 75, w: 45, h: 44 }, mount: 'floor', solid: true },
  shelf_dark_goods2:   { image: 'supplies', rect: { x: 98, y: 74, w: 45, h: 45 }, mount: 'floor', solid: true },
  shelf_dark_narrow:   { image: 'supplies', rect: { x: 146, y: 76, w: 29, h: 43 }, mount: 'floor', solid: true },
  shelf_dark_narrow2:  { image: 'supplies', rect: { x: 178, y: 76, w: 29, h: 43 }, mount: 'floor', solid: true },
  supplies_barrel:     { image: 'supplies', rect: { x: 148, y: 138, w: 28, h: 36 }, mount: 'floor', solid: true },
  supplies_crates:     { image: 'supplies', rect: { x: 182, y: 139, w: 26, h: 34 }, mount: 'floor', solid: true },
  supplies_vase:       { image: 'supplies', rect: { x: 148, y: 183, w: 28, h: 36 }, mount: 'floor', solid: true },
  supplies_crate:      { image: 'supplies', rect: { x: 179, y: 188, w: 28, h: 34 }, mount: 'floor', solid: true },
  supplies_greens:     { image: 'supplies', rect: { x: 177, y: 226, w: 27, h: 37 }, mount: 'floor', solid: true },
  supplies_stack:      { image: 'supplies', rect: { x: 151, y: 238, w: 25, h: 33 }, mount: 'floor', solid: true },
  supplies_heap:       { image: 'supplies', rect: { x: 146, y: 275, w: 30, h: 43 }, mount: 'floor', solid: true },
  supplies_heap2:      { image: 'supplies', rect: { x: 176, y: 283, w: 27, h: 35 }, mount: 'floor', solid: true },
  supplies_cart:       { image: 'supplies', rect: { x: 7, y: 324, w: 33, h: 40 }, mount: 'floor', solid: true },
  supplies_jar:        { image: 'supplies', rect: { x: 54, y: 329, w: 24, h: 31 }, mount: 'floor', solid: true },
  supplies_gold:       { image: 'supplies', rect: { x: 82, y: 334, w: 29, h: 30 }, mount: 'floor', solid: true, weight: 0.3 },
  rack:                { image: 'supplies', rect: { x: 1, y: 384, w: 47, h: 25 }, mount: 'floor', solid: true, weight: 0.5 },
  rack_spears:         { image: 'supplies', rect: { x: 49, y: 368, w: 47, h: 45 }, mount: 'floor', solid: true },
  rack_axes:           { image: 'supplies', rect: { x: 97, y: 372, w: 47, h: 39 }, mount: 'floor', solid: true },
  rack_shield:         { image: 'supplies', rect: { x: 145, y: 384, w: 31, h: 30 }, mount: 'floor', solid: true },
  rack_blade:          { image: 'supplies', rect: { x: 176, y: 378, w: 32, h: 31 }, mount: 'floor', solid: true },
  rack_dark:           { image: 'supplies', rect: { x: 1, y: 432, w: 47, h: 25 }, mount: 'floor', solid: true, weight: 0.5 },
  rack_dark_shields:   { image: 'supplies', rect: { x: 49, y: 416, w: 47, h: 46 }, mount: 'floor', solid: true },
  rack_dark_spears:    { image: 'supplies', rect: { x: 96, y: 416, w: 48, h: 45 }, mount: 'floor', solid: true },
  rack_dark_shield:    { image: 'supplies', rect: { x: 145, y: 420, w: 31, h: 39 }, mount: 'floor', solid: true },
  rack_dark_blade:     { image: 'supplies', rect: { x: 177, y: 426, w: 31, h: 31 }, mount: 'floor', solid: true },
  stand:               { image: 'supplies', rect: { x: 4, y: 472, w: 24, h: 33 }, mount: 'floor', solid: true, weight: 0.5 },
  stand2:              { image: 'supplies', rect: { x: 36, y: 472, w: 24, h: 33 }, mount: 'floor', solid: true, weight: 0.5 },
  stand_swords:        { image: 'supplies', rect: { x: 64, y: 472, w: 32, h: 33 }, mount: 'floor', solid: true },
  stand_spears:        { image: 'supplies', rect: { x: 98, y: 472, w: 30, h: 35 }, mount: 'floor', solid: true },
  stand_axe:           { image: 'supplies', rect: { x: 130, y: 472, w: 25, h: 33 }, mount: 'floor', solid: true },
  stand_shield:        { image: 'supplies', rect: { x: 160, y: 472, w: 32, h: 37 }, mount: 'floor', solid: true },

  // Small goods left lying around a storeroom (walk-through; the spilt ones lie in a mess).
  bowl_apples:         { image: 'supplies', rect: { x: 0, y: 133, w: 16, h: 15 }, mount: 'floor' },
  bowl_apples_m:       { image: 'supplies', rect: { x: 18, y: 134, w: 13, h: 14 }, mount: 'floor' },
  bowl_apples_s:       { image: 'supplies', rect: { x: 34, y: 136, w: 10, h: 12 }, mount: 'floor' },
  bowl_herbs:          { image: 'supplies', rect: { x: 48, y: 133, w: 16, h: 15 }, mount: 'floor' },
  bowl_herbs_m:        { image: 'supplies', rect: { x: 66, y: 134, w: 13, h: 14 }, mount: 'floor' },
  bowl_herbs_s:        { image: 'supplies', rect: { x: 82, y: 136, w: 11, h: 12 }, mount: 'floor' },
  bowl_grain:          { image: 'supplies', rect: { x: 96, y: 133, w: 16, h: 15 }, mount: 'floor' },
  bowl_grain_m:        { image: 'supplies', rect: { x: 114, y: 135, w: 13, h: 13 }, mount: 'floor' },
  bowl_grain_s:        { image: 'supplies', rect: { x: 130, y: 136, w: 10, h: 12 }, mount: 'floor' },
  bowl_apples_spilt:   { image: 'supplies', rect: { x: 0, y: 165, w: 16, h: 18 }, mount: 'floor' },
  bowl_apples_spilt_m: { image: 'supplies', rect: { x: 18, y: 166, w: 13, h: 17 }, mount: 'floor' },
  bowl_apples_spilt_s: { image: 'supplies', rect: { x: 33, y: 168, w: 13, h: 16 }, mount: 'floor' },
  bowl_herbs_spilt:    { image: 'supplies', rect: { x: 48, y: 165, w: 16, h: 17 }, mount: 'floor' },
  bowl_herbs_spilt_m:  { image: 'supplies', rect: { x: 66, y: 166, w: 13, h: 16 }, mount: 'floor' },
  bowl_herbs_spilt_s:  { image: 'supplies', rect: { x: 82, y: 168, w: 11, h: 14 }, mount: 'floor' },
  bowl_grain_spilt:    { image: 'supplies', rect: { x: 96, y: 165, w: 16, h: 20 }, mount: 'floor' },
  bowl_grain_spilt_m:  { image: 'supplies', rect: { x: 113, y: 167, w: 15, h: 16 }, mount: 'floor' },
  bowl_grain_spilt_s:  { image: 'supplies', rect: { x: 129, y: 168, w: 11, h: 15 }, mount: 'floor' },
  sack:                { image: 'supplies', rect: { x: 0, y: 258, w: 16, h: 18 }, mount: 'floor' },
  sack_m:              { image: 'supplies', rect: { x: 17, y: 261, w: 13, h: 15 }, mount: 'floor' },
  sack_s:              { image: 'supplies', rect: { x: 34, y: 264, w: 12, h: 12 }, mount: 'floor' },
  sack_xs:             { image: 'supplies', rect: { x: 52, y: 266, w: 9, h: 9 }, mount: 'floor' },
  bowl_empty:          { image: 'supplies', rect: { x: 64, y: 263, w: 16, h: 13 }, mount: 'floor' },
  bowl_empty_m:        { image: 'supplies', rect: { x: 82, y: 264, w: 13, h: 12 }, mount: 'floor' },
  bowl_empty_s:        { image: 'supplies', rect: { x: 98, y: 266, w: 10, h: 10 }, mount: 'floor' },
  sack2:               { image: 'supplies', rect: { x: 112, y: 258, w: 16, h: 18 }, mount: 'floor' },
  sack2_m:             { image: 'supplies', rect: { x: 129, y: 261, w: 13, h: 15 }, mount: 'floor' },
  sacks_spilt:         { image: 'supplies', rect: { x: 0, y: 290, w: 32, h: 22 }, mount: 'floor' },
  sack_spilt_m:        { image: 'supplies', rect: { x: 33, y: 296, w: 13, h: 15 }, mount: 'floor' },
  sack_spilt_s:        { image: 'supplies', rect: { x: 51, y: 298, w: 10, h: 12 }, mount: 'floor' },
  bowl_dark:           { image: 'supplies', rect: { x: 64, y: 295, w: 16, h: 13 }, mount: 'floor' },
  bowl_dark_m:         { image: 'supplies', rect: { x: 82, y: 296, w: 13, h: 12 }, mount: 'floor' },
  bowl_dark_s:         { image: 'supplies', rect: { x: 98, y: 298, w: 10, h: 10 }, mount: 'floor' },
  sack2_s:             { image: 'supplies', rect: { x: 114, y: 295, w: 12, h: 13 }, mount: 'floor' },
  sack2_xs:            { image: 'supplies', rect: { x: 132, y: 298, w: 9, h: 9 }, mount: 'floor' },
  sacks_pile:          { image: 'supplies', rect: { x: 117, y: 337, w: 22, h: 21 }, mount: 'floor' },
  sacks_pile2:         { image: 'supplies', rect: { x: 148, y: 337, w: 23, h: 24 }, mount: 'floor' },
  sacks_pile3:         { image: 'supplies', rect: { x: 180, y: 338, w: 23, h: 22 }, mount: 'floor' },

  // ── Pedestals (pedestals.png): plain, red- or blue-draped, large to small, grey or pale stone ──
  pedestal_plain:           { image: 'pedestals', rect: { x: 5, y: 5, w: 38, h: 37 }, mount: 'floor', solid: true },
  pedestal_plain_m:         { image: 'pedestals', rect: { x: 48, y: 0, w: 32, h: 32 }, mount: 'floor', solid: true },
  pedestal_plain_s:         { image: 'pedestals', rect: { x: 83, y: 3, w: 26, h: 26 }, mount: 'floor', solid: true },
  pedestal_plain_pale:      { image: 'pedestals', rect: { x: 5, y: 53, w: 38, h: 37 }, mount: 'floor', solid: true },
  pedestal_plain_m_pale:    { image: 'pedestals', rect: { x: 48, y: 48, w: 32, h: 32 }, mount: 'floor', solid: true },
  pedestal_plain_s_pale:    { image: 'pedestals', rect: { x: 83, y: 51, w: 26, h: 26 }, mount: 'floor', solid: true },
  pedestal_red:             { image: 'pedestals', rect: { x: 117, y: 5, w: 38, h: 37 }, mount: 'floor', solid: true },
  pedestal_red_m:           { image: 'pedestals', rect: { x: 160, y: 0, w: 32, h: 32 }, mount: 'floor', solid: true },
  pedestal_red_s:           { image: 'pedestals', rect: { x: 195, y: 2, w: 26, h: 27 }, mount: 'floor', solid: true },
  pedestal_red_pale:        { image: 'pedestals', rect: { x: 117, y: 53, w: 38, h: 37 }, mount: 'floor', solid: true },
  pedestal_red_m_pale:      { image: 'pedestals', rect: { x: 160, y: 48, w: 32, h: 32 }, mount: 'floor', solid: true },
  pedestal_red_s_pale:      { image: 'pedestals', rect: { x: 195, y: 50, w: 26, h: 27 }, mount: 'floor', solid: true },
  pedestal_blue:            { image: 'pedestals', rect: { x: 229, y: 5, w: 38, h: 37 }, mount: 'floor', solid: true },
  pedestal_blue_m:          { image: 'pedestals', rect: { x: 272, y: 0, w: 32, h: 32 }, mount: 'floor', solid: true },
  pedestal_blue_s:          { image: 'pedestals', rect: { x: 307, y: 2, w: 26, h: 27 }, mount: 'floor', solid: true },
  pedestal_blue_pale:       { image: 'pedestals', rect: { x: 229, y: 53, w: 38, h: 37 }, mount: 'floor', solid: true },
  pedestal_blue_m_pale:     { image: 'pedestals', rect: { x: 272, y: 48, w: 32, h: 32 }, mount: 'floor', solid: true },
  pedestal_blue_s_pale:     { image: 'pedestals', rect: { x: 307, y: 50, w: 26, h: 27 }, mount: 'floor', solid: true },
  pedestal_red_top:         { image: 'pedestals', rect: { x: 341, y: 5, w: 38, h: 37 }, mount: 'floor', solid: true },
  pedestal_red_top_m:       { image: 'pedestals', rect: { x: 384, y: 0, w: 32, h: 32 }, mount: 'floor', solid: true },
  pedestal_red_top_s:       { image: 'pedestals', rect: { x: 419, y: 3, w: 26, h: 26 }, mount: 'floor', solid: true },
  pedestal_red_top_pale:    { image: 'pedestals', rect: { x: 341, y: 53, w: 38, h: 37 }, mount: 'floor', solid: true },
  pedestal_red_top_m_pale:  { image: 'pedestals', rect: { x: 384, y: 48, w: 32, h: 32 }, mount: 'floor', solid: true },
  pedestal_red_top_s_pale:  { image: 'pedestals', rect: { x: 419, y: 51, w: 26, h: 26 }, mount: 'floor', solid: true },
  pedestal_blue_top:        { image: 'pedestals', rect: { x: 453, y: 5, w: 38, h: 37 }, mount: 'floor', solid: true },
  pedestal_blue_top_m:      { image: 'pedestals', rect: { x: 496, y: 0, w: 32, h: 32 }, mount: 'floor', solid: true },
  pedestal_blue_top_s:      { image: 'pedestals', rect: { x: 531, y: 3, w: 26, h: 26 }, mount: 'floor', solid: true },
  pedestal_blue_top_pale:   { image: 'pedestals', rect: { x: 453, y: 53, w: 38, h: 37 }, mount: 'floor', solid: true },
  pedestal_blue_top_m_pale: { image: 'pedestals', rect: { x: 496, y: 48, w: 32, h: 32 }, mount: 'floor', solid: true },
  pedestal_blue_top_s_pale: { image: 'pedestals', rect: { x: 531, y: 51, w: 26, h: 26 }, mount: 'floor', solid: true },

  // ── Cave decor (/caves/decorative.png): rock spires, crystals and stones for cave halls ──
  // Light spires, then the same set mirrored; the widest block three tiles across.
  cave_spires:      { image: 'cave_decor', rect: { x: 4, y: 37, w: 84, h: 91 }, mount: 'floor', solid: true, footprint: { w: 3, h: 2 } },
  cave_spire_twin:  { image: 'cave_decor', rect: { x: 96, y: 50, w: 64, h: 78 }, mount: 'floor', solid: true, footprint: { w: 3, h: 1 } },
  cave_spire_pair:  { image: 'cave_decor', rect: { x: 161, y: 61, w: 62, h: 67 }, mount: 'floor', solid: true, footprint: { w: 3, h: 1 } },
  cave_spire:       { image: 'cave_decor', rect: { x: 235, y: 77, w: 49, h: 51 }, mount: 'floor', solid: true },
  cave_spire_s:     { image: 'cave_decor', rect: { x: 303, y: 80, w: 40, h: 48 }, mount: 'floor', solid: true },
  cave_spire_xs:    { image: 'cave_decor', rect: { x: 355, y: 103, w: 26, h: 25 }, mount: 'floor', solid: true },
  cave_spires_b:     { image: 'cave_decor', rect: { x: 296, y: 165, w: 84, h: 91 }, mount: 'floor', solid: true, footprint: { w: 3, h: 2 } },
  cave_spire_twin_b: { image: 'cave_decor', rect: { x: 224, y: 178, w: 64, h: 78 }, mount: 'floor', solid: true, footprint: { w: 3, h: 1 } },
  cave_spire_pair_b: { image: 'cave_decor', rect: { x: 161, y: 189, w: 62, h: 67 }, mount: 'floor', solid: true, footprint: { w: 3, h: 1 } },
  cave_spire_b:      { image: 'cave_decor', rect: { x: 100, y: 205, w: 49, h: 51 }, mount: 'floor', solid: true },
  cave_spire_s_b:    { image: 'cave_decor', rect: { x: 41, y: 208, w: 40, h: 48 }, mount: 'floor', solid: true },
  cave_spire_xs_b:   { image: 'cave_decor', rect: { x: 3, y: 231, w: 26, h: 25 }, mount: 'floor', solid: true },
  // Dark spires fading to black at the foot (mapped for later; nothing places them yet).
  cave_dark_spire:     { image: 'cave_decor', rect: { x: 225, y: 267, w: 96, h: 117 }, mount: 'floor', solid: true, footprint: { w: 3, h: 2 } },
  cave_dark_spire_m:   { image: 'cave_decor', rect: { x: 128, y: 301, w: 64, h: 83 }, mount: 'floor', solid: true, footprint: { w: 3, h: 1 } },
  cave_dark_spire_s:   { image: 'cave_decor', rect: { x: 67, y: 346, w: 27, h: 38 }, mount: 'floor', solid: true },
  cave_dark_spire_b:   { image: 'cave_decor', rect: { x: 0, y: 395, w: 96, h: 117 }, mount: 'floor', solid: true, footprint: { w: 3, h: 2 } },
  cave_dark_spire_m_b: { image: 'cave_decor', rect: { x: 128, y: 429, w: 64, h: 83 }, mount: 'floor', solid: true, footprint: { w: 3, h: 1 } },
  cave_dark_spire_s_b: { image: 'cave_decor', rect: { x: 225, y: 474, w: 27, h: 38 }, mount: 'floor', solid: true },
  // Crystal clusters (blue, then green) that glow faintly, and loose stones (two colourings), all walk-through.
  crystal_blue_00: { image: 'cave_decor', rect: { x: 16, y: 594, w: 12, h: 12 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_blue_01: { image: 'cave_decor', rect: { x: 46, y: 576, w: 14, h: 19 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_blue_02: { image: 'cave_decor', rect: { x: 68, y: 581, w: 25, h: 21 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_blue_03: { image: 'cave_decor', rect: { x: 107, y: 584, w: 11, h: 12 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_blue_04: { image: 'cave_decor', rect: { x: 10, y: 618, w: 15, h: 18 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_blue_05: { image: 'cave_decor', rect: { x: 40, y: 608, w: 18, h: 22 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_blue_06: { image: 'cave_decor', rect: { x: 65, y: 610, w: 31, h: 27 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_blue_07: { image: 'cave_decor', rect: { x: 103, y: 614, w: 18, h: 22 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_blue_08: { image: 'cave_decor', rect: { x: 8, y: 651, w: 11, h: 12 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_blue_09: { image: 'cave_decor', rect: { x: 33, y: 648, w: 25, h: 21 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_blue_10: { image: 'cave_decor', rect: { x: 66, y: 643, w: 14, h: 19 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_blue_11: { image: 'cave_decor', rect: { x: 98, y: 661, w: 12, h: 12 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_blue_12: { image: 'cave_decor', rect: { x: 5, y: 681, w: 18, h: 22 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_blue_13: { image: 'cave_decor', rect: { x: 68, y: 675, w: 18, h: 22 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_blue_14: { image: 'cave_decor', rect: { x: 101, y: 685, w: 15, h: 18 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_blue_15: { image: 'cave_decor', rect: { x: 32, y: 677, w: 31, h: 27 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_green_00: { image: 'cave_decor', rect: { x: 167, y: 584, w: 11, h: 12 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_green_01: { image: 'cave_decor', rect: { x: 192, y: 581, w: 25, h: 21 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_green_02: { image: 'cave_decor', rect: { x: 225, y: 576, w: 14, h: 19 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_green_03: { image: 'cave_decor', rect: { x: 257, y: 594, w: 12, h: 12 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_green_04: { image: 'cave_decor', rect: { x: 164, y: 614, w: 18, h: 22 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_green_05: { image: 'cave_decor', rect: { x: 189, y: 610, w: 31, h: 27 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_green_06: { image: 'cave_decor', rect: { x: 227, y: 608, w: 18, h: 22 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_green_07: { image: 'cave_decor', rect: { x: 260, y: 618, w: 15, h: 18 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_green_08: { image: 'cave_decor', rect: { x: 207, y: 643, w: 14, h: 19 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_green_09: { image: 'cave_decor', rect: { x: 229, y: 648, w: 25, h: 21 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_green_10: { image: 'cave_decor', rect: { x: 268, y: 651, w: 11, h: 12 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_green_11: { image: 'cave_decor', rect: { x: 177, y: 661, w: 12, h: 12 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_green_12: { image: 'cave_decor', rect: { x: 171, y: 685, w: 15, h: 18 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_green_13: { image: 'cave_decor', rect: { x: 201, y: 675, w: 18, h: 22 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_green_14: { image: 'cave_decor', rect: { x: 264, y: 681, w: 18, h: 22 }, mount: 'floor', glow: 28, coolGlow: true },
  crystal_green_15: { image: 'cave_decor', rect: { x: 224, y: 677, w: 31, h: 27 }, mount: 'floor', glow: 28, coolGlow: true },
  cave_stone_00: { image: 'cave_decor', rect: { x: 43, y: 736, w: 17, h: 14 }, mount: 'floor' },
  cave_stone_01: { image: 'cave_decor', rect: { x: 64, y: 736, w: 13, h: 14 }, mount: 'floor' },
  cave_stone_02: { image: 'cave_decor', rect: { x: 4, y: 754, w: 7, h: 7 }, mount: 'floor' },
  cave_stone_03: { image: 'cave_decor', rect: { x: 16, y: 740, w: 12, h: 13 }, mount: 'floor' },
  cave_stone_04: { image: 'cave_decor', rect: { x: 34, y: 754, w: 12, h: 10 }, mount: 'floor' },
  cave_stone_05: { image: 'cave_decor', rect: { x: 49, y: 755, w: 7, h: 8 }, mount: 'floor' },
  cave_stone_06: { image: 'cave_decor', rect: { x: 15, y: 768, w: 17, h: 14 }, mount: 'floor' },
  cave_stone_07: { image: 'cave_decor', rect: { x: 104, y: 750, w: 24, h: 18 }, mount: 'floor' },
  cave_stone_08: { image: 'cave_decor', rect: { x: 41, y: 768, w: 23, h: 18 }, mount: 'floor' },
  cave_stone_09: { image: 'cave_decor', rect: { x: 98, y: 771, w: 27, h: 23 }, mount: 'floor' },
  cave_stone_10: { image: 'cave_decor', rect: { x: 64, y: 785, w: 17, h: 15 }, mount: 'floor' },
  cave_stone_11: { image: 'cave_decor', rect: { x: 0, y: 820, w: 7, h: 7 }, mount: 'floor' },
  cave_stone_12: { image: 'cave_decor', rect: { x: 36, y: 809, w: 12, h: 13 }, mount: 'floor' },
  cave_stone_13: { image: 'cave_decor', rect: { x: 82, y: 810, w: 12, h: 10 }, mount: 'floor' },
  cave_stone_14: { image: 'cave_decor', rect: { x: 121, y: 823, w: 7, h: 8 }, mount: 'floor' },
  cave_stone_15: { image: 'cave_decor', rect: { x: 51, y: 832, w: 13, h: 14 }, mount: 'floor' },
  cave_stone_16: { image: 'cave_decor', rect: { x: 68, y: 832, w: 17, h: 14 }, mount: 'floor' },
  cave_stone_17: { image: 'cave_decor', rect: { x: 72, y: 851, w: 7, h: 8 }, mount: 'floor' },
  cave_stone_18: { image: 'cave_decor', rect: { x: 82, y: 850, w: 12, h: 10 }, mount: 'floor' },
  cave_stone_19: { image: 'cave_decor', rect: { x: 100, y: 836, w: 12, h: 13 }, mount: 'floor' },
  cave_stone_20: { image: 'cave_decor', rect: { x: 117, y: 850, w: 7, h: 7 }, mount: 'floor' },
  cave_stone_21: { image: 'cave_decor', rect: { x: 0, y: 846, w: 24, h: 18 }, mount: 'floor' },
  cave_stone_22: { image: 'cave_decor', rect: { x: 96, y: 864, w: 17, h: 14 }, mount: 'floor' },
  cave_stone_23: { image: 'cave_decor', rect: { x: 3, y: 867, w: 27, h: 23 }, mount: 'floor' },
  cave_stone_24: { image: 'cave_decor', rect: { x: 64, y: 864, w: 23, h: 18 }, mount: 'floor' },
  cave_stone_25: { image: 'cave_decor', rect: { x: 47, y: 881, w: 17, h: 15 }, mount: 'floor' },
  cave_stone_26: { image: 'cave_decor', rect: { x: 0, y: 919, w: 7, h: 8 }, mount: 'floor' },
  cave_stone_27: { image: 'cave_decor', rect: { x: 34, y: 906, w: 12, h: 10 }, mount: 'floor' },
  cave_stone_28: { image: 'cave_decor', rect: { x: 80, y: 905, w: 12, h: 13 }, mount: 'floor' },
  cave_stone_29: { image: 'cave_decor', rect: { x: 121, y: 916, w: 7, h: 7 }, mount: 'floor' },
  cave_stone_b_00: { image: 'cave_decor', rect: { x: 171, y: 736, w: 17, h: 14 }, mount: 'floor' },
  cave_stone_b_01: { image: 'cave_decor', rect: { x: 192, y: 736, w: 13, h: 14 }, mount: 'floor' },
  cave_stone_b_02: { image: 'cave_decor', rect: { x: 132, y: 754, w: 7, h: 7 }, mount: 'floor' },
  cave_stone_b_03: { image: 'cave_decor', rect: { x: 144, y: 740, w: 12, h: 13 }, mount: 'floor' },
  cave_stone_b_04: { image: 'cave_decor', rect: { x: 162, y: 754, w: 12, h: 10 }, mount: 'floor' },
  cave_stone_b_05: { image: 'cave_decor', rect: { x: 177, y: 755, w: 7, h: 8 }, mount: 'floor' },
  cave_stone_b_06: { image: 'cave_decor', rect: { x: 143, y: 768, w: 17, h: 14 }, mount: 'floor' },
  cave_stone_b_07: { image: 'cave_decor', rect: { x: 232, y: 750, w: 24, h: 18 }, mount: 'floor' },
  cave_stone_b_08: { image: 'cave_decor', rect: { x: 169, y: 768, w: 23, h: 18 }, mount: 'floor' },
  cave_stone_b_09: { image: 'cave_decor', rect: { x: 226, y: 771, w: 27, h: 23 }, mount: 'floor' },
  cave_stone_b_10: { image: 'cave_decor', rect: { x: 192, y: 785, w: 17, h: 15 }, mount: 'floor' },
  cave_stone_b_11: { image: 'cave_decor', rect: { x: 128, y: 820, w: 7, h: 7 }, mount: 'floor' },
  cave_stone_b_12: { image: 'cave_decor', rect: { x: 164, y: 809, w: 12, h: 13 }, mount: 'floor' },
  cave_stone_b_13: { image: 'cave_decor', rect: { x: 210, y: 810, w: 12, h: 10 }, mount: 'floor' },
  cave_stone_b_14: { image: 'cave_decor', rect: { x: 249, y: 823, w: 7, h: 8 }, mount: 'floor' },
  cave_stone_b_15: { image: 'cave_decor', rect: { x: 179, y: 832, w: 13, h: 14 }, mount: 'floor' },
  cave_stone_b_16: { image: 'cave_decor', rect: { x: 196, y: 832, w: 17, h: 14 }, mount: 'floor' },
  cave_stone_b_17: { image: 'cave_decor', rect: { x: 200, y: 851, w: 7, h: 8 }, mount: 'floor' },
  cave_stone_b_18: { image: 'cave_decor', rect: { x: 210, y: 850, w: 12, h: 10 }, mount: 'floor' },
  cave_stone_b_19: { image: 'cave_decor', rect: { x: 228, y: 836, w: 12, h: 13 }, mount: 'floor' },
  cave_stone_b_20: { image: 'cave_decor', rect: { x: 245, y: 850, w: 7, h: 7 }, mount: 'floor' },
  cave_stone_b_21: { image: 'cave_decor', rect: { x: 128, y: 846, w: 24, h: 18 }, mount: 'floor' },
  cave_stone_b_22: { image: 'cave_decor', rect: { x: 224, y: 864, w: 17, h: 14 }, mount: 'floor' },
  cave_stone_b_23: { image: 'cave_decor', rect: { x: 131, y: 867, w: 27, h: 23 }, mount: 'floor' },
  cave_stone_b_24: { image: 'cave_decor', rect: { x: 192, y: 864, w: 23, h: 18 }, mount: 'floor' },
  cave_stone_b_25: { image: 'cave_decor', rect: { x: 175, y: 881, w: 17, h: 15 }, mount: 'floor' },
  cave_stone_b_26: { image: 'cave_decor', rect: { x: 128, y: 919, w: 7, h: 8 }, mount: 'floor' },
  cave_stone_b_27: { image: 'cave_decor', rect: { x: 162, y: 906, w: 12, h: 10 }, mount: 'floor' },
  cave_stone_b_28: { image: 'cave_decor', rect: { x: 208, y: 905, w: 12, h: 13 }, mount: 'floor' },
  cave_stone_b_29: { image: 'cave_decor', rect: { x: 249, y: 916, w: 7, h: 7 }, mount: 'floor' },

  // ── Cave plants (/caves/Led*.png): four kinds in four colours, swaying ──
  cave_plant_yellow:   plant('cave_plants_yellow', 0),
  cave_plant_yellow_2: plant('cave_plants_yellow', 1),
  cave_plant_yellow_3: plant('cave_plants_yellow', 2),
  cave_grass_yellow:   plant('cave_plants_yellow', 3),
  cave_plant_red:      plant('cave_plants_red', 0),
  cave_plant_red_2:    plant('cave_plants_red', 1),
  cave_plant_red_3:    plant('cave_plants_red', 2),
  cave_grass_red:      plant('cave_plants_red', 3),
  cave_plant_lilac:    plant('cave_plants_lilac', 0),
  cave_plant_lilac_2:  plant('cave_plants_lilac', 1),
  cave_plant_lilac_3:  plant('cave_plants_lilac', 2),
  cave_grass_lilac:    plant('cave_plants_lilac', 3),
  cave_plant_teal:     plant('cave_plants_teal', 0),
  cave_plant_teal_2:   plant('cave_plants_teal', 1),
  cave_plant_teal_3:   plant('cave_plants_teal', 2),
  cave_grass_teal:     plant('cave_plants_teal', 3),

  // ── Big crystals (/crystals), very rare finds ──
  gem_crystal_blue: gemCrystal(['gem_crystal_blue_1', 'gem_crystal_blue_2', 'gem_crystal_blue_3', 'gem_crystal_blue_4']),
  gem_crystal_green: gemCrystal(['gem_crystal_green_1', 'gem_crystal_green_2', 'gem_crystal_green_3', 'gem_crystal_green_4']),
  gem_crystal_pink: gemCrystal(['gem_crystal_pink_1', 'gem_crystal_pink_2', 'gem_crystal_pink_3', 'gem_crystal_pink_4']),
  gem_crystal_purple: gemCrystal(['gem_crystal_purple_1', 'gem_crystal_purple_2', 'gem_crystal_purple_3', 'gem_crystal_purple_4']),
  gem_crystal_red: gemCrystal(['gem_crystal_red_1', 'gem_crystal_red_2', 'gem_crystal_red_3', 'gem_crystal_red_4']),
} as const satisfies Record<string, PropDef>;

export type PropKind = keyof typeof PROPS;

export type PropPlacement = { kind: PropKind; tx: number; ty: number };

/** The strip at a solid prop's foot that blocks movement (the rest of its tile can be walked through, behind it). */
export function propBlockRect(def: PropDef): BlockRect {
  const across = def.footprint?.w ?? 1;
  const up = def.footprint?.h ?? 1;
  const w = def.base?.w ?? Math.min(def.rect.w - 2 * BASE_INSET, across * TILE_WIDTH);
  const d = def.base?.d ?? Math.min(BASE_DEPTH, def.rect.h);
  const cx = TILE_WIDTH / 2;
  return { x0: cx - w / 2, x1: cx + w / 2, y0: PROP_GROUND - d - (up - 1) * TILE_HEIGHT, y1: PROP_GROUND };
}

/** How often a prop is picked against the others in its group. */
export function propWeight(kind: PropKind): number {
  const def: PropDef = PROPS[kind];
  return def.weight ?? 1;
}

/** Every prop whose key starts with one of the prefixes, in table order. */
function propsStarting(...prefixes: string[]): PropKind[] {
  return keysOf(PROPS).filter((kind) => prefixes.some((p) => kind.startsWith(p)));
}

function keysOf<T extends object>(table: T): Array<keyof T & string> {
  return Object.keys(table).filter((key): key is keyof T & string => key in table);
}

export const COFFINS: PropKind[] = ['coffin', 'coffin_cracked', 'coffin_open'];
export const SARCOPHAGI: PropKind[] = ['sarcophagus', 'sarcophagus2', 'sarcophagus_open', 'sarcophagus_open2'];
export const CRATES: PropKind[] = ['crate', 'crate2', 'crate_stack', 'crate_stack2'];
export const URNS: PropKind[] = ['urn', 'urn_small', 'urn_green', 'urn_green_small', 'urn_broken', 'crate_broken'];
export const POSTS: PropKind[] = ['post', 'post2'];
/** Everything hung on north-wall faces: the catacomb fixtures and the trophies, armour and banners. */
export const HANGINGS: PropKind[] = keysOf(PROPS).filter((kind) => PROPS[kind].mount === 'wall');
/** Storeroom furniture backed against a north wall: shelves, weapon racks and stands, supply heaps and casks. */
export const STORE_FURNITURE: PropKind[] = propsStarting('shelf', 'supplies_', 'rack', 'stand', 'barrel');
/** Goods scattered in front of the furniture. */
export const STORE_GOODS: PropKind[] = propsStarting('bowl_', 'sack');
/** Large pedestals, set out in pairs in plain halls. */
export const PEDESTALS: PropKind[] = propsStarting('pedestal_').filter((kind) => PROPS[kind].rect.w > 32);
/** Something to stand in the middle of a room, by theme. */
export const CRYPT_CENTREPIECES: PropKind[] = [...SARCOPHAGI, 'coffin_open'];
export const STORE_CENTREPIECES: PropKind[] = ['crate_stack', 'crate_stack2', 'crate', 'crate2'];
export const HALL_CENTREPIECES: PropKind[] = [...PEDESTALS, ...POSTS];
/** Cave halls: rock spires (the great clusters for the middle), crystals, stones and plants. */
export const CAVE_CENTREPIECES: PropKind[] = ['cave_spires', 'cave_spires_b', 'cave_spire_twin', 'cave_spire_twin_b'];
export const CAVE_SPIRES: PropKind[] = ['cave_spire', 'cave_spire_s', 'cave_spire_xs', 'cave_spire_b', 'cave_spire_s_b', 'cave_spire_xs_b'];
export const CAVE_CRYSTALS: PropKind[] = propsStarting('crystal_');
export const CAVE_STONES: PropKind[] = propsStarting('cave_stone_');
export const CAVE_PLANTS: PropKind[] = propsStarting('cave_plant_', 'cave_grass_');
/** The big glowing crystals, found very rarely in a room. */
export const GEM_CRYSTALS: PropKind[] = propsStarting('gem_crystal_');
