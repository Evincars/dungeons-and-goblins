/**
 * Dungeon props, each cut to its exact sprite bounds from one of the prop images: the catacomb decor
 * (/catacombs/decorative.png) and the objects in /objects-assets (wall decor, supplies, pedestals).
 */

export const PROP_IMAGES = {
  decorative: '/catacombs/decorative.png',
  wall_decor: '/objects-assets/Other_objects.png',
  supplies:   '/objects-assets/supplies_objects.png',
  pedestals:  '/objects-assets/pedestals.png',
} as const satisfies Record<string, string>;

export type PropImage = keyof typeof PROP_IMAGES;

export type PropDef = {
  image: PropImage;
  rect: { x: number; y: number; w: number; h: number };
  /** 'floor' stands on its tile; 'wall' hangs on the brick face above its tile. */
  mount: 'floor' | 'wall';
  /** Occupies its tile as an obstacle (coffins, crates, posts). */
  solid?: boolean;
  /** Light radius, for candles. */
  glow?: number;
  /** How often it is picked against the others in its group (default 1): rare finds weigh less. */
  weight?: number;
};

export const PROPS = {
  // ── Catacomb decor ──────────────────────────────────────────────────────────
  coffin:            { image: 'decorative', rect: { x: 87, y: 69, w: 18, h: 43 }, mount: 'floor', solid: true },
  coffin_cracked:    { image: 'decorative', rect: { x: 55, y: 69, w: 18, h: 43 }, mount: 'floor', solid: true },
  coffin_open:       { image: 'decorative', rect: { x: 87, y: 122, w: 18, h: 38 }, mount: 'floor', solid: true },
  sarcophagus:       { image: 'decorative', rect: { x: 5, y: 101, w: 37, h: 27 }, mount: 'floor', solid: true },
  sarcophagus2:      { image: 'decorative', rect: { x: 5, y: 197, w: 37, h: 27 }, mount: 'floor', solid: true },
  sarcophagus_open:  { image: 'decorative', rect: { x: 5, y: 69, w: 37, h: 27 }, mount: 'floor', solid: true },
  sarcophagus_open2: { image: 'decorative', rect: { x: 5, y: 165, w: 37, h: 27 }, mount: 'floor', solid: true },
  crate:             { image: 'decorative', rect: { x: 130, y: 75, w: 12, h: 21 }, mount: 'floor', solid: true },
  crate2:            { image: 'decorative', rect: { x: 170, y: 75, w: 12, h: 21 }, mount: 'floor', solid: true },
  crate_stack:       { image: 'decorative', rect: { x: 144, y: 71, w: 16, h: 41 }, mount: 'floor', solid: true },
  crate_stack2:      { image: 'decorative', rect: { x: 200, y: 71, w: 16, h: 41 }, mount: 'floor', solid: true },
  post:              { image: 'decorative', rect: { x: 1, y: 20, w: 13, h: 44 }, mount: 'floor', solid: true },
  post2:             { image: 'decorative', rect: { x: 65, y: 16, w: 13, h: 48 }, mount: 'floor', solid: true },
  urn:               { image: 'decorative', rect: { x: 144, y: 124, w: 16, h: 20 }, mount: 'floor' },
  urn_small:         { image: 'decorative', rect: { x: 162, y: 128, w: 12, h: 16 }, mount: 'floor' },
  urn_green:         { image: 'decorative', rect: { x: 144, y: 172, w: 16, h: 20 }, mount: 'floor' },
  urn_green_small:   { image: 'decorative', rect: { x: 162, y: 176, w: 12, h: 16 }, mount: 'floor' },
  urn_broken:        { image: 'decorative', rect: { x: 144, y: 147, w: 16, h: 13 }, mount: 'floor' },
  crate_broken:      { image: 'decorative', rect: { x: 130, y: 97, w: 12, h: 15 }, mount: 'floor' },
  candles:           { image: 'decorative', rect: { x: 178, y: 20, w: 13, h: 11 }, mount: 'floor', glow: 44 },
  candle:            { image: 'decorative', rect: { x: 162, y: 20, w: 10, h: 11 }, mount: 'floor', glow: 36 },
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
} as const satisfies Record<string, PropDef>;

export type PropKind = keyof typeof PROPS;

export type PropPlacement = { kind: PropKind; tx: number; ty: number };

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
