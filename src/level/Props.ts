/**
 * Dungeon props, each cut to its exact sprite bounds from one of the prop images: the catacomb decor
 * (/catacombs/decorative.png), the objects in /objects-assets (wall decor, supplies, pedestals) and the
 * cave decor and plants in /caves.
 */

export const PROP_IMAGES = {
  decorative: '/catacombs/decorative.png',
  // The catacomb tileset itself, for its free-standing columns.
  mainlev: '/catacombs/mainlevbuild-isometric.png',
  // The castle: its decor (banners, bones, pots, rubble, rugs) and its tileset (for the columns), and its two lights,
  // a standing candelabra and a wall candle, three frames each, one file per frame.
  castle_decor: '/castle/decorative.png',
  castle_main: '/castle/mainlevbuild-isometric.png',
  light_a_1: '/castle/lightA01.png',
  light_a_2: '/castle/lightA02.png',
  light_a_3: '/castle/lightA03.png',
  light_b_1: '/castle/lightB01.png',
  light_b_2: '/castle/lightB02.png',
  light_b_3: '/castle/lightB03.png',
  // The isometric castle (/castle-izometric): its decor (crystal braziers, lecterns, books, pots), its tileset (for the
  // columns), its floors' sheet (moss, the plates columns stand on), its stains, and its candles, one file per frame.
  iso_decor: '/castle-izometric/decorative.png',
  iso_main: '/castle-izometric/mainlevbuild1.png',
  iso_ground: '/castle-izometric/mainlevbuild2.png',
  iso_stains: '/castle-izometric/mainlevbuild3.png',
  // Its gateways (scripts/iso-gateways.py): an arch, the arch with its doors open, the arch barred.
  iso_gates: '/castle-izometric/gateways.png',
  iso_candle_1: '/castle-izometric/anim/candle-01.png',
  iso_candle_2: '/castle-izometric/anim/candle-02.png',
  iso_candle_3: '/castle-izometric/anim/candle-03.png',
  iso_candle_4: '/castle-izometric/anim/candle-04.png',
  iso_candles_1: '/castle-izometric/anim/candles-01.png',
  iso_candles_2: '/castle-izometric/anim/candles-02.png',
  iso_candles_3: '/castle-izometric/anim/candles-03.png',
  iso_candles_4: '/castle-izometric/anim/candles-04.png',
  // The forgotten mines (/caves2, level/MineProps.ts): cave decor, rocks and stalagmites, and the pit timbering.
  mine_decor: '/caves2/other_decoratives.png',
  mine_rocks: '/caves2/rocks_stones.png',
  mine_wood: '/caves2/wood_el.png',
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
import { MINE_PROPS } from './MineProps';

type Rect = { x: number; y: number; w: number; h: number };

/** Floor props rest this far down their tile (just above its bottom edge), so they depth-sort with whoever stands around them. */
export const PROP_GROUND = TILE_HEIGHT - 4;
/**
 * A solid prop blocks only a strip at its foot this deep (or its own height, if shorter), as wide as its
 * art less a little each side: characters walk right up to an urn, and behind a large crate.
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
  /**
   * 'floor' stands on its tile; 'wall' hangs on the brick face above its tile; 'foot' stands at the very foot of that
   * face (in an alcove of it); 'front' hangs on the front of the solid prop standing on its tile (a flag on a column).
   */
  mount: 'floor' | 'wall' | 'foot' | 'front';
  /** Occupies its tile as an obstacle (coffins, crates, posts). */
  solid?: boolean;
  /** A tall thing (a column, a rock spire) that clears over whoever stands behind it (render/SeeThrough.ts). */
  seeThrough?: boolean;
  /**
   * Tiles a large solid prop takes: `w` across (odd, centred on its tile) and `h` up from its tile. Only its base stops
   * bodies: whoever comes from the north walks on behind the rest of it.
   */
  footprint?: { w: number; h: number };
  /**
   * How much of its foot a solid prop blocks, when not worked out from its art: `w` wide, `d` deep, its middle `dx` px off
   * the tile's (a rock drawn with its shadow to one side).
   */
  base?: { w: number; d: number; dx?: number };
  /** How far above the foot of the face a 'wall' prop's top hangs (the mines' faces are taller), when not the usual. */
  hang?: number;
  /** Light radius, for candles and crystals. */
  glow?: number;
  /** The glow is cold (crystals) rather than firelight. */
  coolGlow?: boolean;
  /**
   * A cold glow that is still a flame's (the mines' lanterns burn green) and flickers as one; firelight always flickers,
   * a crystal's shine never does.
   */
  flame?: true;
  /** How often it is picked against the others in its group (default 1): rare finds weigh less. */
  weight?: number;
  /** Lies flat on the floor (a rug): drawn under everything that stands or walks on it. */
  flat?: boolean;
  /**
   * Something drawn just behind it (from the same image): `rect`, its foot `lift` px above the prop's (the dark behind a
   * gate's bars, where the art leaves its opening clear).
   */
  backing?: { rect: Rect; lift: number };
  /**
   * Fire burning behind it, seen through it (a barred gate's window, entities/WindowFire.ts): a flame at each of `at` (px
   * from the prop's middle), its foot `rise` px above the prop's (low enough for the sill to hide it).
   */
  fire?: { at: readonly number[]; rise: number };
  /** Mist breathes faintly out of it (the portals of the safe and exit rooms, systems/MistSystem.ts). */
  smoke?: true;
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
/** The castle's lights: a standing candelabra (16×48) and a wall candle (8×18), three frames each. */
const LIGHT_A = ['light_a_1', 'light_a_2', 'light_a_3'] as const;
const LIGHT_B = ['light_b_1', 'light_b_2', 'light_b_3'] as const;
const LIGHT_FRAME_TICKS = 8;
/** The isometric castle's candles: a single one (8×16) and a cluster (16×24), four frames each. */
const ISO_CANDLE = ['iso_candle_1', 'iso_candle_2', 'iso_candle_3', 'iso_candle_4'] as const;
const ISO_CANDLE_CLUSTER = ['iso_candles_1', 'iso_candles_2', 'iso_candles_3', 'iso_candles_4'] as const;
/** Its crystal braziers: a violet crystal burning cold on a wooden pedestal, lighting the room round it. */
const BRAZIER_GLOW = 64;
const ISO_BRAZIER = { image: 'iso_decor', mount: 'floor', solid: true, base: { w: 12, d: 7 }, glow: BRAZIER_GLOW, coolGlow: true } as const;
/** Its columns: the great square ones, slender ones, round ones and broken stumps. */
const ISO_COLUMN = { image: 'iso_main', mount: 'floor', solid: true, seeThrough: true } as const;
const SQUARE_BASE = { w: 26, d: 14 };
const SLENDER_BASE = { w: 14, d: 9 };
const ROUND_BASE = { w: 28, d: 12 };
/** Things lying flat on its floor: stains, moss and the carved plates its columns stand on. */
const ISO_STAIN = { image: 'iso_stains', mount: 'floor', flat: true } as const;
const ISO_MOSS = { image: 'iso_ground', mount: 'floor', flat: true } as const;
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
  // The large crates stand alone: the broken one drawn under each in the sheet is a prop of its own (crate_large_broken).
  crate_large:       { image: 'decorative', rect: { x: 144, y: 71, w: 16, h: 25 }, mount: 'floor', solid: true },
  crate_large2:      { image: 'decorative', rect: { x: 200, y: 71, w: 16, h: 25 }, mount: 'floor', solid: true },
  post:              { image: 'decorative', rect: { x: 1, y: 20, w: 13, h: 44 }, mount: 'floor', solid: true },
  post2:             { image: 'decorative', rect: { x: 65, y: 16, w: 13, h: 48 }, mount: 'floor', solid: true },
  urn:               { image: 'decorative', rect: { x: 144, y: 124, w: 16, h: 20 }, mount: 'floor', solid: true },
  urn_small:         { image: 'decorative', rect: { x: 162, y: 128, w: 12, h: 16 }, mount: 'floor', solid: true },
  urn_green:         { image: 'decorative', rect: { x: 144, y: 172, w: 16, h: 20 }, mount: 'floor', solid: true },
  urn_green_small:   { image: 'decorative', rect: { x: 162, y: 176, w: 12, h: 16 }, mount: 'floor', solid: true },
  urn_broken:        { image: 'decorative', rect: { x: 144, y: 147, w: 16, h: 13 }, mount: 'floor' },
  crate_broken:      { image: 'decorative', rect: { x: 130, y: 97, w: 12, h: 15 }, mount: 'floor' },
  sarcophagus_broken:  { image: 'decorative', rect: { x: 5, y: 136, w: 37, h: 24 }, mount: 'floor', solid: true, base: { w: 30, d: 18 } },
  sarcophagus_broken2: { image: 'decorative', rect: { x: 5, y: 232, w: 37, h: 24 }, mount: 'floor', solid: true, base: { w: 30, d: 18 } },
  crate_broken2:     { image: 'decorative', rect: { x: 170, y: 97, w: 12, h: 15 }, mount: 'floor' },
  crate_large_broken:  { image: 'decorative', rect: { x: 144, y: 96, w: 16, h: 16 }, mount: 'floor' },
  crate_large_broken2: { image: 'decorative', rect: { x: 200, y: 96, w: 16, h: 16 }, mount: 'floor' },
  post_cauldron:     { image: 'decorative', rect: { x: 17, y: 16, w: 14, h: 48 }, mount: 'floor', solid: true },
  post_chain:        { image: 'decorative', rect: { x: 49, y: 22, w: 13, h: 42 }, mount: 'floor', solid: true },
  post_broken:       { image: 'decorative', rect: { x: 33, y: 36, w: 13, h: 28 }, mount: 'floor', solid: true },
  // Urns large to small (the two largest are above), whole and broken, in both glazes.
  urn_m:             { image: 'decorative', rect: { x: 179, y: 129, w: 9, h: 15 }, mount: 'floor', solid: true },
  urn_s:             { image: 'decorative', rect: { x: 196, y: 132, w: 8, h: 12 }, mount: 'floor', solid: true },
  urn_xs:            { image: 'decorative', rect: { x: 212, y: 133, w: 8, h: 11 }, mount: 'floor', solid: true },
  urn_broken_l:      { image: 'decorative', rect: { x: 162, y: 148, w: 12, h: 12 }, mount: 'floor' },
  urn_broken_m:      { image: 'decorative', rect: { x: 179, y: 150, w: 9, h: 10 }, mount: 'floor' },
  urn_broken_s:      { image: 'decorative', rect: { x: 196, y: 152, w: 8, h: 8 }, mount: 'floor' },
  urn_broken_xs:     { image: 'decorative', rect: { x: 212, y: 151, w: 8, h: 9 }, mount: 'floor' },
  urn_green_m:       { image: 'decorative', rect: { x: 179, y: 177, w: 9, h: 15 }, mount: 'floor', solid: true },
  urn_green_s:       { image: 'decorative', rect: { x: 196, y: 180, w: 8, h: 12 }, mount: 'floor', solid: true },
  urn_green_xs:      { image: 'decorative', rect: { x: 212, y: 181, w: 8, h: 11 }, mount: 'floor', solid: true },
  urn_green_broken:    { image: 'decorative', rect: { x: 144, y: 195, w: 16, h: 13 }, mount: 'floor' },
  urn_green_broken_l:  { image: 'decorative', rect: { x: 162, y: 196, w: 12, h: 12 }, mount: 'floor' },
  urn_green_broken_m:  { image: 'decorative', rect: { x: 179, y: 198, w: 9, h: 10 }, mount: 'floor' },
  urn_green_broken_s:  { image: 'decorative', rect: { x: 196, y: 200, w: 8, h: 8 }, mount: 'floor' },
  urn_green_broken_xs: { image: 'decorative', rect: { x: 212, y: 199, w: 8, h: 9 }, mount: 'floor' },
  // Burnt-out candles (no flame, no light), walk-through.
  candles_cold:      { image: 'decorative', rect: { x: 162, y: 20, w: 10, h: 11 }, mount: 'floor' },
  candles_cold2:     { image: 'decorative', rect: { x: 178, y: 20, w: 13, h: 11 }, mount: 'floor' },
  candle_cold:       { image: 'decorative', rect: { x: 197, y: 21, w: 5, h: 9 }, mount: 'floor' },
  candle_stub:       { image: 'decorative', rect: { x: 212, y: 27, w: 5, h: 5 }, mount: 'floor' },
  // Each candle frame is its own file, padded to the same height with the base at the bottom, so only the flame moves.
  candles: {
    image: 'candle_b_1', rect: { x: 0, y: 0, w: 13, h: 16 }, mount: 'floor', glow: 44,
    frames: framesFromImages(CANDLE_B, 13, 16), frameTime: CANDLE_FRAME_TICKS,
  },
  candle: {
    image: 'candle_a_1', rect: { x: 0, y: 0, w: 7, h: 16 }, mount: 'floor', glow: 36,
    frames: framesFromImages(CANDLE_A, 7, 16), frameTime: CANDLE_FRAME_TICKS,
  },
  cauldron:          { image: 'decorative', rect: { x: 81, y: 16, w: 14, h: 32 }, mount: 'wall', weight: 1.5 },
  cauldron_water:    { image: 'decorative', rect: { x: 97, y: 16, w: 14, h: 32 }, mount: 'wall', weight: 1.5 },
  shackles:          { image: 'decorative', rect: { x: 113, y: 16, w: 14, h: 22 }, mount: 'wall', weight: 1.5 },
  chain:             { image: 'decorative', rect: { x: 148, y: 16, w: 7, h: 30 }, mount: 'wall', weight: 1.5 },
  // Free-standing stone columns (mainlevbuild.png): two broad, two slender.
  column:            { image: 'mainlev', rect: { x: 592, y: 135, w: 32, h: 57 }, mount: 'floor', solid: true, seeThrough: true, base: { w: 28, d: 12 } },
  column_low:        { image: 'mainlev', rect: { x: 704, y: 144, w: 32, h: 48 }, mount: 'floor', solid: true, seeThrough: true, base: { w: 28, d: 12 } },
  column_slender:    { image: 'mainlev', rect: { x: 640, y: 112, w: 16, h: 80 }, mount: 'floor', solid: true, seeThrough: true, base: { w: 14, d: 10 } },
  column_slender_low: { image: 'mainlev', rect: { x: 672, y: 144, w: 16, h: 48 }, mount: 'floor', solid: true, seeThrough: true, base: { w: 14, d: 10 } },
  chain_short:       { image: 'decorative', rect: { x: 132, y: 16, w: 7, h: 22 }, mount: 'wall', weight: 1.5 },
  // A barred gate into the dark (the tileset's framed bars, cols 31–36, rows 2–6), set into a catacomb face three tiles
  // wide; the dark between its bars is the wall top's black from the same sheet.
  barred_gate: {
    image: 'mainlev', rect: { x: 496, y: 32, w: 96, h: 80 }, mount: 'foot', weight: 0,
    backing: { rect: { x: 80, y: 56, w: 94, h: 56 }, lift: 20 },
    fire: { at: [-8, 9], rise: 12 },
  },
  // The portals (the castle tileset's great arches, set into the north wall of the safe and exit rooms): the stairs the
  // heroes came down by, and the dark way on, smoke breathing out of both.
  portal_stairs:     { image: 'castle_main', rect: { x: 416, y: 208, w: 80, h: 96 }, mount: 'foot', smoke: true, weight: 0 },
  portal_dark:       { image: 'castle_main', rect: { x: 512, y: 208, w: 80, h: 96 }, mount: 'foot', smoke: true, weight: 0 },
  hook_bracket:      { image: 'decorative', rect: { x: 32, y: 20, w: 16, h: 12 }, mount: 'wall', weight: 1 },

  // ── The isometric castle (/castle-izometric) ──
  iso_brazier:   { ...ISO_BRAZIER, rect: { x: 16, y: 9, w: 16, h: 44 } },
  iso_brazier2:  { ...ISO_BRAZIER, rect: { x: 55, y: 9, w: 18, h: 43 } },
  iso_brazier3:  { ...ISO_BRAZIER, rect: { x: 87, y: 9, w: 18, h: 43 } },
  iso_brazier4:  { ...ISO_BRAZIER, rect: { x: 128, y: 9, w: 16, h: 44 } },
  iso_brazier5:  { ...ISO_BRAZIER, rect: { x: 160, y: 9, w: 16, h: 44 } },
  iso_lectern:   { image: 'iso_decor', rect: { x: 19, y: 81, w: 22, h: 38 }, mount: 'floor', solid: true, base: { w: 18, d: 8 } },
  iso_lectern2:  { image: 'iso_decor', rect: { x: 52, y: 78, w: 22, h: 41 }, mount: 'floor', solid: true, base: { w: 18, d: 8 } },
  iso_lectern3:  { image: 'iso_decor', rect: { x: 84, y: 78, w: 22, h: 41 }, mount: 'floor', solid: true, base: { w: 18, d: 8 } },
  iso_lectern4:  { image: 'iso_decor', rect: { x: 117, y: 81, w: 22, h: 38 }, mount: 'floor', solid: true, base: { w: 18, d: 8 } },
  iso_books:     { image: 'iso_decor', rect: { x: 197, y: 58, w: 17, h: 29 }, mount: 'floor', solid: true },
  iso_books2:    { image: 'iso_decor', rect: { x: 165, y: 108, w: 17, h: 29 }, mount: 'floor', solid: true },
  iso_book:      { image: 'iso_decor', rect: { x: 165, y: 70, w: 16, h: 17 }, mount: 'floor' },
  iso_book2:     { image: 'iso_decor', rect: { x: 198, y: 120, w: 16, h: 17 }, mount: 'floor' },
  iso_wreck:     { image: 'iso_decor', rect: { x: 16, y: 132, w: 48, h: 25 }, mount: 'floor' },
  iso_wreck2:    { image: 'iso_decor', rect: { x: 86, y: 132, w: 36, h: 24 }, mount: 'floor' },
  iso_wreck3:    { image: 'iso_decor', rect: { x: 24, y: 164, w: 36, h: 24 }, mount: 'floor' },
  iso_wreck4:    { image: 'iso_decor', rect: { x: 80, y: 164, w: 48, h: 25 }, mount: 'floor' },
  iso_pot_red:      { image: 'iso_decor', rect: { x: 35, y: 225, w: 11, h: 13 }, mount: 'floor', solid: true },
  iso_pot_green:    { image: 'iso_decor', rect: { x: 83, y: 225, w: 11, h: 13 }, mount: 'floor', solid: true },
  iso_pot_violet:   { image: 'iso_decor', rect: { x: 131, y: 225, w: 11, h: 13 }, mount: 'floor', solid: true },
  iso_jar_red:      { image: 'iso_decor', rect: { x: 21, y: 226, w: 7, h: 11 }, mount: 'floor' },
  iso_jar_green:    { image: 'iso_decor', rect: { x: 69, y: 226, w: 7, h: 11 }, mount: 'floor' },
  iso_jar_violet:   { image: 'iso_decor', rect: { x: 117, y: 226, w: 7, h: 11 }, mount: 'floor' },
  iso_bowl_red:     { image: 'iso_decor', rect: { x: 51, y: 228, w: 9, h: 9 }, mount: 'floor' },
  iso_bowl_green:   { image: 'iso_decor', rect: { x: 99, y: 228, w: 9, h: 9 }, mount: 'floor' },
  iso_bowl_violet:  { image: 'iso_decor', rect: { x: 147, y: 228, w: 9, h: 9 }, mount: 'floor' },
  iso_candle: {
    image: 'iso_candle_1', rect: { x: 0, y: 0, w: 8, h: 16 }, mount: 'floor', glow: 38,
    frames: framesFromImages(ISO_CANDLE, 8, 16), frameTime: CANDLE_FRAME_TICKS,
  },
  iso_candles: {
    image: 'iso_candles_1', rect: { x: 0, y: 0, w: 16, h: 24 }, mount: 'floor', glow: 48,
    frames: framesFromImages(ISO_CANDLE_CLUSTER, 16, 24), frameTime: CANDLE_FRAME_TICKS,
  },
  iso_column:         { ...ISO_COLUMN, rect: { x: 848, y: 783, w: 32, h: 113 }, base: SQUARE_BASE },
  iso_column2:        { ...ISO_COLUMN, rect: { x: 976, y: 783, w: 33, h: 113 }, base: SQUARE_BASE },
  iso_column_slender: { ...ISO_COLUMN, rect: { x: 784, y: 784, w: 16, h: 94 }, base: SLENDER_BASE },
  iso_column_slender2: { ...ISO_COLUMN, rect: { x: 817, y: 784, w: 16, h: 94 }, base: SLENDER_BASE },
  iso_column_slender3: { ...ISO_COLUMN, rect: { x: 903, y: 784, w: 16, h: 94 }, base: SLENDER_BASE },
  iso_column_slender4: { ...ISO_COLUMN, rect: { x: 936, y: 784, w: 16, h: 94 }, base: SLENDER_BASE },
  iso_column_round:   { ...ISO_COLUMN, rect: { x: 743, y: 928, w: 32, h: 74 }, base: ROUND_BASE },
  iso_column_round2:  { ...ISO_COLUMN, rect: { x: 800, y: 928, w: 32, h: 74 }, base: ROUND_BASE },
  iso_column_broken:  { ...ISO_COLUMN, rect: { x: 848, y: 912, w: 32, h: 64 }, base: SQUARE_BASE },
  iso_column_broken2: { ...ISO_COLUMN, rect: { x: 976, y: 912, w: 32, h: 64 }, base: SQUARE_BASE },
  iso_column_cross:   { ...ISO_COLUMN, rect: { x: 912, y: 912, w: 32, h: 102 }, base: SQUARE_BASE },
  // Gateways where a straight corridor leaves a room through its north wall (IsoDresser.ts `layGateways`): the arch's
  // pillars stand on the faces either side, the way between them two tiles wide.
  iso_gate_arch:  { image: 'iso_gates', rect: { x: 0, y: 0, w: 160, h: 84 }, mount: 'foot', weight: 0 },
  iso_gate_door:  { image: 'iso_gates', rect: { x: 160, y: 0, w: 160, h: 84 }, mount: 'foot', weight: 0 },
  iso_gate_grate: { image: 'iso_gates', rect: { x: 320, y: 0, w: 160, h: 84 }, mount: 'foot', weight: 0 },
  iso_plate:       { ...ISO_MOSS, rect: { x: 288, y: 208, w: 32, h: 32 } },
  iso_plate2:      { ...ISO_MOSS, rect: { x: 336, y: 208, w: 32, h: 32 } },
  iso_stain_brown:   { ...ISO_STAIN, rect: { x: 13, y: 16, w: 136, h: 127 } },
  iso_stain_green:   { ...ISO_STAIN, rect: { x: 173, y: 16, w: 136, h: 127 } },
  iso_stain_violet:  { ...ISO_STAIN, rect: { x: 333, y: 16, w: 136, h: 127 } },
  iso_stain_brown2:  { ...ISO_STAIN, rect: { x: 16, y: 160, w: 127, h: 136 } },
  iso_stain_green2:  { ...ISO_STAIN, rect: { x: 176, y: 160, w: 127, h: 136 } },
  iso_stain_violet2: { ...ISO_STAIN, rect: { x: 336, y: 160, w: 127, h: 136 } },
  iso_stain_brown3:  { ...ISO_STAIN, rect: { x: 27, y: 379, w: 105, h: 58 } },
  iso_stain_green3:  { ...ISO_STAIN, rect: { x: 187, y: 379, w: 105, h: 58 } },
  iso_stain_violet3: { ...ISO_STAIN, rect: { x: 347, y: 379, w: 105, h: 58 } },
  iso_moss:   { ...ISO_MOSS, rect: { x: 16, y: 800, w: 48, h: 29 } },
  iso_moss2:  { ...ISO_MOSS, rect: { x: 320, y: 800, w: 48, h: 29 } },
  iso_moss3:  { ...ISO_MOSS, rect: { x: 96, y: 832, w: 32, h: 27 } },
  iso_moss4:  { ...ISO_MOSS, rect: { x: 256, y: 832, w: 32, h: 27 } },
  iso_moss5:  { ...ISO_MOSS, rect: { x: 8, y: 868, w: 61, h: 44 } },
  iso_moss6:  { ...ISO_MOSS, rect: { x: 315, y: 868, w: 61, h: 44 } },
  iso_moss7:  { ...ISO_MOSS, rect: { x: 132, y: 894, w: 49, h: 23 } },
  iso_moss8:  { ...ISO_MOSS, rect: { x: 203, y: 894, w: 49, h: 23 } },
  iso_moss9:  { ...ISO_MOSS, rect: { x: 59, y: 945, w: 35, h: 30 } },
  iso_moss10: { ...ISO_MOSS, rect: { x: 290, y: 945, w: 35, h: 30 } },
  iso_moss_patch:  { ...ISO_MOSS, rect: { x: 19, y: 612, w: 125, h: 160 }, weight: 0.3 },
  iso_moss_patch2: { ...ISO_MOSS, rect: { x: 208, y: 612, w: 126, h: 160 }, weight: 0.3 },

  // ── The castle (/castle): nothing of it is used in the catacombs, nor theirs in it ──
  castle_banner:        { image: 'castle_decor', rect: { x: 16, y: 17, w: 48, h: 46 }, mount: 'wall', weight: 2 },
  castle_banner_m:      { image: 'castle_decor', rect: { x: 80, y: 17, w: 32, h: 41 }, mount: 'wall', weight: 2 },
  castle_banner_s:      { image: 'castle_decor', rect: { x: 116, y: 17, w: 25, h: 30 }, mount: 'wall', weight: 1.5 },
  castle_banner_teal:   { image: 'castle_decor', rect: { x: 16, y: 65, w: 48, h: 46 }, mount: 'wall', weight: 2 },
  castle_banner_teal_m: { image: 'castle_decor', rect: { x: 80, y: 65, w: 32, h: 41 }, mount: 'wall', weight: 2 },
  castle_banner_teal_s: { image: 'castle_decor', rect: { x: 116, y: 65, w: 25, h: 30 }, mount: 'wall', weight: 1.5 },
  castle_bones:         { image: 'castle_decor', rect: { x: 192, y: 67, w: 28, h: 25 }, mount: 'floor' },
  castle_bones2:        { image: 'castle_decor', rect: { x: 372, y: 67, w: 28, h: 25 }, mount: 'floor' },
  castle_skeleton:      { image: 'castle_decor', rect: { x: 200, y: 29, w: 18, h: 19 }, mount: 'floor' },
  castle_skeleton2:     { image: 'castle_decor', rect: { x: 377, y: 21, w: 18, h: 19 }, mount: 'floor' },
  castle_skull:         { image: 'castle_decor', rect: { x: 270, y: 73, w: 18, h: 19 }, mount: 'floor' },
  castle_skull2:        { image: 'castle_decor', rect: { x: 304, y: 73, w: 18, h: 19 }, mount: 'floor' },
  castle_ribs:          { image: 'castle_decor', rect: { x: 257, y: 37, w: 15, h: 18 }, mount: 'floor' },
  castle_ribs2:         { image: 'castle_decor', rect: { x: 320, y: 37, w: 15, h: 18 }, mount: 'floor' },
  castle_bone:          { image: 'castle_decor', rect: { x: 274, y: 18, w: 11, h: 13 }, mount: 'floor' },
  castle_bone2:         { image: 'castle_decor', rect: { x: 307, y: 18, w: 11, h: 13 }, mount: 'floor' },
  castle_bone3:         { image: 'castle_decor', rect: { x: 240, y: 48, w: 15, h: 15 }, mount: 'floor' },
  castle_bone4:         { image: 'castle_decor', rect: { x: 337, y: 48, w: 15, h: 15 }, mount: 'floor' },
  castle_bone5:         { image: 'castle_decor', rect: { x: 272, y: 49, w: 13, h: 15 }, mount: 'floor' },
  castle_bone6:         { image: 'castle_decor', rect: { x: 307, y: 49, w: 13, h: 15 }, mount: 'floor' },
  castle_jaw:           { image: 'castle_decor', rect: { x: 240, y: 82, w: 16, h: 12 }, mount: 'floor' },
  castle_jaw2:          { image: 'castle_decor', rect: { x: 336, y: 82, w: 16, h: 12 }, mount: 'floor' },
  castle_urn:           { image: 'castle_decor', rect: { x: 50, y: 139, w: 12, h: 21 }, mount: 'floor', solid: true },
  castle_urn_m:         { image: 'castle_decor', rect: { x: 34, y: 145, w: 12, h: 15 }, mount: 'floor', solid: true },
  castle_urn_s:         { image: 'castle_decor', rect: { x: 20, y: 151, w: 8, h: 9 }, mount: 'floor' },
  castle_pot:           { image: 'castle_decor', rect: { x: 50, y: 171, w: 12, h: 21 }, mount: 'floor', solid: true },
  castle_pot_m:         { image: 'castle_decor', rect: { x: 34, y: 177, w: 12, h: 15 }, mount: 'floor', solid: true },
  castle_pot_s:         { image: 'castle_decor', rect: { x: 20, y: 183, w: 8, h: 9 }, mount: 'floor' },
  castle_barrel:        { image: 'castle_decor', rect: { x: 80, y: 131, w: 16, h: 29 }, mount: 'floor', solid: true },
  castle_bucket:        { image: 'castle_decor', rect: { x: 112, y: 136, w: 16, h: 19 }, mount: 'floor', solid: true },
  castle_chests:        { image: 'castle_decor', rect: { x: 448, y: 16, w: 32, h: 16 }, mount: 'floor', solid: true },
  castle_rubble:        { image: 'castle_decor', rect: { x: 211, y: 131, w: 37, h: 27 }, mount: 'floor', solid: true, base: { w: 32, d: 14 } },
  castle_rubble2:       { image: 'castle_decor', rect: { x: 280, y: 132, w: 37, h: 27 }, mount: 'floor', solid: true, base: { w: 32, d: 14 } },
  castle_rock:          { image: 'castle_decor', rect: { x: 164, y: 133, w: 26, h: 18 }, mount: 'floor', solid: true },
  castle_rock2:         { image: 'castle_decor', rect: { x: 338, y: 134, w: 26, h: 18 }, mount: 'floor', solid: true },
  castle_stone:         { image: 'castle_decor', rect: { x: 193, y: 161, w: 26, h: 26 }, mount: 'floor', solid: true },
  castle_stone2:        { image: 'castle_decor', rect: { x: 309, y: 162, w: 26, h: 26 }, mount: 'floor', solid: true },
  castle_shard:         { image: 'castle_decor', rect: { x: 165, y: 165, w: 20, h: 23 }, mount: 'floor', solid: true },
  castle_shard2:        { image: 'castle_decor', rect: { x: 343, y: 166, w: 20, h: 23 }, mount: 'floor', solid: true },
  castle_candelabra_cold: { image: 'castle_decor', rect: { x: 432, y: 80, w: 16, h: 32 }, mount: 'floor', solid: true, base: { w: 10, d: 6 } },
  castle_candle_cold:   { image: 'castle_decor', rect: { x: 453, y: 101, w: 6, h: 11 }, mount: 'floor' },
  castle_candle_cold2:  { image: 'castle_decor', rect: { x: 464, y: 101, w: 6, h: 11 }, mount: 'floor' },
  castle_candle_cold3:  { image: 'castle_decor', rect: { x: 490, y: 101, w: 6, h: 11 }, mount: 'floor' },
  // Rugs, laid flat in the middle of a hall: wide and tall, in four colours.
  castle_rug_green:     { image: 'castle_decor', rect: { x: 16, y: 240, w: 95, h: 64 }, mount: 'floor', flat: true },
  castle_rug_green_v:   { image: 'castle_decor', rect: { x: 128, y: 240, w: 64, h: 95 }, mount: 'floor', flat: true },
  castle_rug_teal:      { image: 'castle_decor', rect: { x: 208, y: 240, w: 95, h: 64 }, mount: 'floor', flat: true },
  castle_rug_teal_v:    { image: 'castle_decor', rect: { x: 320, y: 240, w: 64, h: 95 }, mount: 'floor', flat: true },
  castle_rug_brown:     { image: 'castle_decor', rect: { x: 16, y: 369, w: 95, h: 64 }, mount: 'floor', flat: true },
  castle_rug_brown_v:   { image: 'castle_decor', rect: { x: 128, y: 369, w: 64, h: 95 }, mount: 'floor', flat: true },
  castle_rug_olive:     { image: 'castle_decor', rect: { x: 208, y: 368, w: 95, h: 64 }, mount: 'floor', flat: true },
  castle_rug_olive_v:   { image: 'castle_decor', rect: { x: 320, y: 368, w: 64, h: 95 }, mount: 'floor', flat: true },
  // Free-standing columns (castle tileset): plain ones for halls, mossy-footed ones for standing in a pool.
  castle_column:        { image: 'castle_main', rect: { x: 336, y: 208, w: 16, h: 80 }, mount: 'floor', solid: true, seeThrough: true, base: { w: 14, d: 10 } },
  castle_column_block:  { image: 'castle_main', rect: { x: 368, y: 208, w: 32, h: 80 }, mount: 'floor', solid: true, seeThrough: true, base: { w: 28, d: 12 } },
  castle_column_moss:   { image: 'castle_main', rect: { x: 410, y: 432, w: 29, h: 80 }, mount: 'floor', solid: true, seeThrough: true, base: { w: 16, d: 10 } },
  castle_column_moss_block: { image: 'castle_main', rect: { x: 459, y: 432, w: 44, h: 80 }, mount: 'floor', solid: true, seeThrough: true, base: { w: 30, d: 12 } },
  castle_column_moss2:  { image: 'castle_main', rect: { x: 410, y: 592, w: 29, h: 80 }, mount: 'floor', solid: true, seeThrough: true, base: { w: 16, d: 10 } },
  castle_column_moss_block2: { image: 'castle_main', rect: { x: 459, y: 592, w: 44, h: 80 }, mount: 'floor', solid: true, seeThrough: true, base: { w: 30, d: 12 } },
  // The lights, which stand in for the catacombs' torches and candles: a candelabra on the floor, a candle on a wall.
  castle_candelabra: {
    image: 'light_a_1', rect: { x: 0, y: 0, w: 16, h: 48 }, mount: 'floor', solid: true, base: { w: 10, d: 6 }, glow: 52,
    frames: framesFromImages(LIGHT_A, 16, 48), frameTime: LIGHT_FRAME_TICKS,
  },
  castle_sconce: {
    image: 'light_b_1', rect: { x: 0, y: 0, w: 8, h: 18 }, mount: 'wall', glow: 40, weight: 0,
    frames: framesFromImages(LIGHT_B, 8, 18), frameTime: LIGHT_FRAME_TICKS,
  },
  // The same candle standing on the floor of an arched alcove in a wall.
  castle_candle: {
    image: 'light_b_1', rect: { x: 0, y: 0, w: 8, h: 18 }, mount: 'foot', glow: 36, weight: 0,
    frames: framesFromImages(LIGHT_B, 8, 18), frameTime: LIGHT_FRAME_TICKS,
  },
  // Flags hung on the front of a square column (the smallest banners, narrower than the column).
  castle_flag:      { image: 'castle_decor', rect: { x: 116, y: 17, w: 25, h: 30 }, mount: 'front', weight: 0 },
  castle_flag_teal: { image: 'castle_decor', rect: { x: 116, y: 65, w: 25, h: 30 }, mount: 'front', weight: 0 },

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
  cave_spires:      { image: 'cave_decor', rect: { x: 4, y: 37, w: 84, h: 91 }, mount: 'floor', solid: true, seeThrough: true, footprint: { w: 3, h: 2 } },
  cave_spire_twin:  { image: 'cave_decor', rect: { x: 96, y: 50, w: 64, h: 78 }, mount: 'floor', solid: true, seeThrough: true, footprint: { w: 3, h: 1 } },
  cave_spire_pair:  { image: 'cave_decor', rect: { x: 161, y: 61, w: 62, h: 67 }, mount: 'floor', solid: true, seeThrough: true, footprint: { w: 3, h: 1 } },
  cave_spire:       { image: 'cave_decor', rect: { x: 235, y: 77, w: 49, h: 51 }, mount: 'floor', solid: true, seeThrough: true },
  cave_spire_s:     { image: 'cave_decor', rect: { x: 303, y: 80, w: 40, h: 48 }, mount: 'floor', solid: true, seeThrough: true },
  cave_spire_xs:    { image: 'cave_decor', rect: { x: 355, y: 103, w: 26, h: 25 }, mount: 'floor', solid: true, seeThrough: true },
  cave_spires_b:     { image: 'cave_decor', rect: { x: 296, y: 165, w: 84, h: 91 }, mount: 'floor', solid: true, seeThrough: true, footprint: { w: 3, h: 2 } },
  cave_spire_twin_b: { image: 'cave_decor', rect: { x: 224, y: 178, w: 64, h: 78 }, mount: 'floor', solid: true, seeThrough: true, footprint: { w: 3, h: 1 } },
  cave_spire_pair_b: { image: 'cave_decor', rect: { x: 161, y: 189, w: 62, h: 67 }, mount: 'floor', solid: true, seeThrough: true, footprint: { w: 3, h: 1 } },
  cave_spire_b:      { image: 'cave_decor', rect: { x: 100, y: 205, w: 49, h: 51 }, mount: 'floor', solid: true, seeThrough: true },
  cave_spire_s_b:    { image: 'cave_decor', rect: { x: 41, y: 208, w: 40, h: 48 }, mount: 'floor', solid: true, seeThrough: true },
  cave_spire_xs_b:   { image: 'cave_decor', rect: { x: 3, y: 231, w: 26, h: 25 }, mount: 'floor', solid: true, seeThrough: true },
  // Dark spires fading to black at the foot (mapped for later; nothing places them yet).
  cave_dark_spire:     { image: 'cave_decor', rect: { x: 225, y: 267, w: 96, h: 117 }, mount: 'floor', solid: true, seeThrough: true, footprint: { w: 3, h: 2 } },
  cave_dark_spire_m:   { image: 'cave_decor', rect: { x: 128, y: 301, w: 64, h: 83 }, mount: 'floor', solid: true, seeThrough: true, footprint: { w: 3, h: 1 } },
  cave_dark_spire_s:   { image: 'cave_decor', rect: { x: 67, y: 346, w: 27, h: 38 }, mount: 'floor', solid: true, seeThrough: true },
  cave_dark_spire_b:   { image: 'cave_decor', rect: { x: 0, y: 395, w: 96, h: 117 }, mount: 'floor', solid: true, seeThrough: true, footprint: { w: 3, h: 2 } },
  cave_dark_spire_m_b: { image: 'cave_decor', rect: { x: 128, y: 429, w: 64, h: 83 }, mount: 'floor', solid: true, seeThrough: true, footprint: { w: 3, h: 1 } },
  cave_dark_spire_s_b: { image: 'cave_decor', rect: { x: 225, y: 474, w: 27, h: 38 }, mount: 'floor', solid: true, seeThrough: true },
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

  // ── The forgotten mines (/caves2) ──
  ...MINE_PROPS,
} as const satisfies Record<string, PropDef>;

export type PropKind = keyof typeof PROPS;

/** A prop on a tile; `dx` moves it that many pixels across from the tile's middle (a column centred in a pool). */
export type PropPlacement = { kind: PropKind; tx: number; ty: number; dx?: number };

/** The strip at a solid prop's foot that blocks movement (the rest of its tile can be walked through, behind it). */
export function propBlockRect(def: PropDef): BlockRect {
  const across = def.footprint?.w ?? 1;
  const w = def.base?.w ?? Math.min(def.rect.w - 2 * BASE_INSET, across * TILE_WIDTH);
  const d = def.base?.d ?? Math.min(BASE_DEPTH, def.rect.h);
  const cx = TILE_WIDTH / 2 + (def.base?.dx ?? 0);
  return { x0: cx - w / 2, x1: cx + w / 2, y0: PROP_GROUND - d, y1: PROP_GROUND };
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
export const SARCOPHAGI: PropKind[] = ['sarcophagus', 'sarcophagus2', 'sarcophagus_open', 'sarcophagus_open2', 'sarcophagus_broken', 'sarcophagus_broken2'];
export const CRATES: PropKind[] = ['crate', 'crate2', 'crate_large', 'crate_large2'];
/** Urns of every size and glaze, whole and broken, and a broken crate or two among them. */
export const URNS: PropKind[] = [...propsStarting('urn'), 'crate_broken', 'crate_broken2', 'crate_large_broken', 'crate_large_broken2'];
export const POSTS: PropKind[] = ['post', 'post2', 'post_cauldron', 'post_chain', 'post_broken'];
/** The catacombs' own iron on its walls: cauldrons hung on chains, shackles, chains and hooks. */
export const CATACOMB_FIXTURES: PropKind[] = ['cauldron', 'cauldron_water', 'shackles', 'chain', 'chain_short', 'hook_bracket'];
/** Burnt-out candles, left on crypt floors. */
export const COLD_CANDLES: PropKind[] = ['candles_cold', 'candles_cold2', 'candle_cold', 'candle_stub'];
/** Whether a prop belongs to the castle (its images are the castle's own, never seen in the catacombs). */
export function isCastleProp(kind: PropKind): boolean {
  const image: PropImage = PROPS[kind].image;
  return image.startsWith('castle_') || image.startsWith('light_');
}

/** Whether a prop belongs to the isometric castle (drawn from /castle-izometric). */
export function isIsoProp(kind: PropKind): boolean {
  return PROPS[kind].image.startsWith('iso_');
}

/** Whether a prop belongs to the forgotten mines (drawn from /caves2). */
export function isMineProp(kind: PropKind): boolean {
  return PROPS[kind].image.startsWith('mine_');
}

/** Everything hung on north-wall faces: the catacomb fixtures and the trophies, armour and banners. */
export const HANGINGS: PropKind[] = keysOf(PROPS).filter((kind) => PROPS[kind].mount === 'wall' && !isCastleProp(kind) && !isIsoProp(kind) && !isMineProp(kind));
/** The castle's banners, hung on its walls. */
export const CASTLE_BANNERS: PropKind[] = propsStarting('castle_banner');
export const CASTLE_BONES: PropKind[] = propsStarting('castle_bone', 'castle_skeleton', 'castle_skull', 'castle_ribs', 'castle_jaw');
export const CASTLE_POTS: PropKind[] = propsStarting('castle_urn', 'castle_pot');
export const CASTLE_STORES: PropKind[] = ['castle_barrel', 'castle_bucket', 'castle_chests', 'castle_urn', 'castle_pot'];
export const CASTLE_RUBBLE: PropKind[] = propsStarting('castle_rubble', 'castle_rock', 'castle_stone', 'castle_shard');
export const CASTLE_RUGS: PropKind[] = propsStarting('castle_rug_');
export const CASTLE_POOL_COLUMNS: PropKind[] = propsStarting('castle_column_moss');
export const CASTLE_COLD_CANDLES: PropKind[] = propsStarting('castle_candle_cold');
export const CASTLE_FLAGS: PropKind[] = propsStarting('castle_flag');
/** Storeroom furniture backed against a north wall: shelves, weapon racks and stands, supply heaps and casks. */
export const STORE_FURNITURE: PropKind[] = propsStarting('shelf', 'supplies_', 'rack', 'stand', 'barrel');
/** Goods scattered in front of the furniture. */
export const STORE_GOODS: PropKind[] = propsStarting('bowl_', 'sack');
/** Something to stand in the middle of a room, by theme. */
export const CRYPT_CENTREPIECES: PropKind[] = [...SARCOPHAGI, 'coffin_open'];
export const STORE_CENTREPIECES: PropKind[] = ['crate_large', 'crate_large2', 'crate', 'crate2'];
/** Free-standing columns: in rows along a hall's long walls, or alone in its middle. */
export const COLUMNS: PropKind[] = ['column', 'column_low', 'column_slender', 'column_slender_low'];
export const HALL_CENTREPIECES: PropKind[] = [...POSTS, 'column', 'column_low'];
/** Cave halls: rock spires (the great clusters for the middle), crystals, stones and plants. */
export const CAVE_CENTREPIECES: PropKind[] = ['cave_spires', 'cave_spires_b', 'cave_spire_twin', 'cave_spire_twin_b'];
export const CAVE_SPIRES: PropKind[] = ['cave_spire', 'cave_spire_s', 'cave_spire_xs', 'cave_spire_b', 'cave_spire_s_b', 'cave_spire_xs_b'];
export const CAVE_CRYSTALS: PropKind[] = propsStarting('crystal_');
export const CAVE_STONES: PropKind[] = propsStarting('cave_stone_');
export const CAVE_PLANTS: PropKind[] = propsStarting('cave_plant_', 'cave_grass_');
/** The big glowing crystals, found very rarely in a room. */
export const GEM_CRYSTALS: PropKind[] = propsStarting('gem_crystal_');

// ── The isometric castle ──────────────────────────────────────────────────────
export const ISO_BRAZIERS: PropKind[] = propsStarting('iso_brazier');
export const ISO_LECTERNS: PropKind[] = propsStarting('iso_lectern');
export const ISO_BOOKS: PropKind[] = propsStarting('iso_book');
export const ISO_WRECKS: PropKind[] = propsStarting('iso_wreck');
export const ISO_POTS: PropKind[] = propsStarting('iso_pot_', 'iso_jar_', 'iso_bowl_');
export const ISO_CANDLES: PropKind[] = ['iso_candle', 'iso_candles'];
/** The great square columns (and the cross-topped one), which hold up a hall; slender and round ones line it. */
export const ISO_SQUARE_COLUMNS: PropKind[] = ['iso_column', 'iso_column2', 'iso_column_cross'];
export const ISO_SLENDER_COLUMNS: PropKind[] = propsStarting('iso_column_slender');
export const ISO_ROUND_COLUMNS: PropKind[] = propsStarting('iso_column_round');
export const ISO_BROKEN_COLUMNS: PropKind[] = propsStarting('iso_column_broken');
export const ISO_PLATES: PropKind[] = propsStarting('iso_plate');
export const ISO_STAINS: PropKind[] = propsStarting('iso_stain_');
export const ISO_MOSS_BITS: PropKind[] = propsStarting('iso_moss');

// ── The forgotten mines ───────────────────────────────────────────────────────
export const MINE_SHROOM_TABLES: PropKind[] = propsStarting('mine_shroom_table');
export const MINE_PLANTS: PropKind[] = propsStarting('mine_flower_', 'mine_sprout', 'mine_reeds', 'mine_shroom_stool');
export const MINE_FUNGI: PropKind[] = propsStarting('mine_fungus_');
export const MINE_WEBS: PropKind[] = propsStarting('mine_web_');
export const MINE_ROOTS: PropKind[] = propsStarting('mine_root_');
/** Stones underfoot: pebbles too small to stop anyone, and stones and heaps of rubble one must walk round. */
function isSolid(kind: PropKind): boolean {
  const def: PropDef = PROPS[kind];
  return def.solid === true;
}
export const MINE_PEBBLES: PropKind[] = propsStarting('mine_pebble_').filter((kind) => !isSolid(kind));
export const MINE_STONES: PropKind[] = propsStarting('mine_pebble_', 'mine_rubble_s_').filter(isSolid);
/** Rocks by size: small and middling ones about a room, the great formations for its middle. */
export const MINE_ROCKS: PropKind[] = propsStarting('mine_rock_s_', 'mine_rock_m_');
export const MINE_BIG_ROCKS: PropKind[] = propsStarting('mine_rock_l_', 'mine_rock_xl_');
/** Great heaps of rubble (not the small heaps among MINE_STONES). */
export const MINE_RUBBLE: PropKind[] = propsStarting('mine_rubble_').filter((kind) => !kind.startsWith('mine_rubble_s_'));
export const MINE_STALAGMITES: PropKind[] = propsStarting('mine_stalagmite_', 'mine_stalagmites_').filter((kind) => !kind.includes('_xs_'));
export const MINE_SMALL_STALAGMITES: PropKind[] = propsStarting('mine_stalagmite_xs_');
/** The timbering: frames against a face, posts standing free, lantern posts and lanterns. */
export const MINE_FRAMES: PropKind[] = ['mine_frame', 'mine_frame_wide', 'mine_frame_door'];
export const MINE_POSTS: PropKind[] = ['mine_post', 'mine_post2', 'mine_post3'];
export const MINE_LANTERN_POSTS: PropKind[] = propsStarting('mine_lantern_post');
export const MINE_LANTERNS: PropKind[] = ['mine_lantern', 'mine_lantern2', 'mine_lantern3', 'mine_lantern4'];
