import type { PropDef } from './Props';

/**
 * The forgotten mines' props, cut to their sprite bounds from the cave set in /caves2 (RPGFW Set 2): other_decoratives.png
 * (mushroom tables, flowers, reeds, bracket fungi, holes, pebbles, cobwebs, roots), rocks_stones.png (rock formations,
 * rubble, stalagmites) and wood_el.png (the pit timbering: frames, posts, lantern posts and lanterns, fences, logs).
 * Spread into PROPS (Props.ts); the groups the dresser picks from are there too.
 */

type Box = readonly [number, number, number, number];
/** How much of its foot a solid prop blocks: `w` wide, `d` deep. */
type BlockSize = { w: number; d: number };

const rect = ([x, y, w, h]: Box) => ({ x, y, w, h });

/** Lying on the floor, walked over (pebbles, flowers, reeds). */
function loose(image: 'mine_decor' | 'mine_rocks', box: Box): PropDef {
  return { image, rect: rect(box), mount: 'floor' };
}

/** Flat on the floor, under everything (holes, roots, cracks). */
function flat(box: Box): PropDef {
  return { image: 'mine_decor', rect: rect(box), mount: 'floor', flat: true };
}

/** Hung on a rock face, its top `hang` px above the face's foot. */
function hung(box: Box, hang: number): PropDef {
  return { image: 'mine_decor', rect: rect(box), mount: 'wall', hang };
}

/**
 * Standing in the way: only its base blocks (a strip `base` at its foot, over the `across` tiles of its footprint), and a
 * tall one clears over whoever stands behind it.
 */
function solid(image: 'mine_decor' | 'mine_rocks' | 'mine_wood', box: Box, across: number, base: BlockSize): PropDef {
  const tall = box[3] >= TALL;
  const def: PropDef = { image, rect: rect(box), mount: 'floor', solid: true, base };
  if (tall) def.seeThrough = true;
  if (across > 1) def.footprint = { w: across, h: 1 };
  return def;
}

/** Things this tall (px) clear over whoever stands behind them. */
const TALL = 56;
/** A small rock or stalagmite's base, a medium one's, a great formation's. */
const SMALL_BASE = { w: 14, d: 8 };
const MID_BASE = { w: 26, d: 12 };
const BIG_BASE = { w: 76, d: 18 };
const HUGE_BASE = { w: 92, d: 24 };
/** A lantern's cold green light, hung on a post or the rock. */
const LANTERN_GLOW = 84;
const HUNG_LANTERN_GLOW = 56;
/** How high on the rock face (above its foot) webs, fungi and lanterns hang. */
const WEB_HANG = 118;
const FUNGUS_HANG = 70;
const LANTERN_HANG = 64;

export const MINE_PROPS = {
  // ── other_decoratives.png ──
  mine_shroom_table:  solid('mine_decor', [2, 0, 29, 30], 1, { w: 22, d: 8 }),
  mine_shroom_table2: solid('mine_decor', [33, 32, 29, 30], 1, { w: 22, d: 8 }),
  mine_shroom_stool:  loose('mine_decor', [38, 11, 14, 13]),
  mine_shroom_stool2: loose('mine_decor', [8, 40, 14, 13]),
  mine_flower_00: loose('mine_decor', [75, 9, 14, 17]),
  mine_flower_01: loose('mine_decor', [104, 14, 13, 16]),
  mine_flower_02: loose('mine_decor', [136, 7, 15, 20]),
  mine_flower_03: loose('mine_decor', [171, 9, 14, 17]),
  mine_flower_04: loose('mine_decor', [200, 14, 13, 16]),
  mine_flower_05: loose('mine_decor', [232, 7, 15, 20]),
  mine_flower_06: loose('mine_decor', [72, 36, 15, 20]),
  mine_flower_07: loose('mine_decor', [106, 43, 13, 16]),
  mine_flower_08: loose('mine_decor', [134, 38, 14, 17]),
  mine_flower_09: loose('mine_decor', [168, 36, 15, 20]),
  mine_flower_10: loose('mine_decor', [202, 43, 13, 16]),
  mine_flower_11: loose('mine_decor', [230, 38, 14, 17]),
  mine_sprout:    loose('mine_decor', [264, 6, 13, 20]),
  mine_sprout2:   loose('mine_decor', [296, 6, 13, 20]),
  mine_reeds:     loose('mine_decor', [258, 32, 25, 32]),
  mine_reeds2:    loose('mine_decor', [291, 32, 29, 32]),
  mine_fungus_blue_0: hung([324, 7, 24, 20], FUNGUS_HANG),
  mine_fungus_blue_1: hung([359, 9, 18, 18], FUNGUS_HANG - 12),
  mine_fungus_blue_2: hung([389, 5, 24, 22], FUNGUS_HANG + 14),
  mine_fungus_blue_3: hung([424, 10, 18, 16], FUNGUS_HANG - 24),
  mine_fungus_blue_4: hung([325, 40, 18, 16], FUNGUS_HANG + 26),
  mine_fungus_blue_5: hung([354, 35, 24, 22], FUNGUS_HANG - 4),
  mine_fungus_blue_6: hung([390, 39, 18, 18], FUNGUS_HANG + 8),
  mine_fungus_blue_7: hung([419, 37, 24, 20], FUNGUS_HANG - 18),
  mine_fungus_brown_0: hung([325, 72, 24, 20], FUNGUS_HANG),
  mine_fungus_brown_1: hung([360, 74, 18, 18], FUNGUS_HANG - 12),
  mine_fungus_brown_2: hung([390, 70, 24, 22], FUNGUS_HANG + 14),
  mine_fungus_brown_3: hung([425, 75, 18, 16], FUNGUS_HANG - 24),
  mine_fungus_brown_4: hung([326, 105, 18, 16], FUNGUS_HANG + 26),
  mine_fungus_brown_5: hung([355, 100, 24, 22], FUNGUS_HANG - 4),
  mine_fungus_brown_6: hung([391, 104, 18, 18], FUNGUS_HANG + 8),
  mine_fungus_brown_7: hung([420, 102, 24, 20], FUNGUS_HANG - 18),
  mine_hole_00: flat([449, 1, 77, 63]),
  mine_hole_01: flat([498, 193, 77, 63]),
  mine_hole_02: flat([470, 139, 65, 42]),
  mine_hole_03: flat([489, 331, 65, 42]),
  mine_hole_04: flat([551, 11, 18, 12]),
  mine_hole_05: flat([546, 40, 26, 18]),
  mine_hole_06: flat([512, 70, 30, 19]),
  mine_hole_07: flat([553, 74, 21, 12]),
  mine_hole_08: flat([452, 99, 57, 25]),
  mine_hole_09: flat([521, 97, 45, 28]),
  mine_hole_10: flat([455, 203, 18, 12]),
  mine_hole_11: flat([452, 232, 26, 18]),
  mine_hole_12: flat([450, 266, 21, 12]),
  mine_hole_13: flat([482, 262, 30, 19]),
  mine_hole_14: flat([458, 289, 45, 28]),
  mine_hole_15: flat([515, 291, 57, 25]),
  mine_pebble_00: loose('mine_decor', [7, 72, 9, 8]),
  mine_pebble_01: loose('mine_decor', [44, 72, 7, 5]),
  mine_pebble_02: loose('mine_decor', [64, 72, 12, 11]),
  mine_pebble_03: loose('mine_decor', [97, 74, 18, 14]),
  mine_pebble_04: loose('mine_decor', [135, 73, 10, 8]),
  mine_pebble_05: loose('mine_decor', [166, 72, 21, 16]),
  mine_pebble_06: loose('mine_decor', [199, 72, 21, 19]),
  mine_pebble_07: loose('mine_decor', [235, 77, 9, 7]),
  mine_pebble_08: loose('mine_decor', [264, 71, 17, 18]),
  mine_pebble_09: loose('mine_decor', [0, 98, 24, 25]),
  mine_pebble_10: loose('mine_decor', [39, 103, 17, 18]),
  mine_pebble_11: loose('mine_decor', [76, 109, 9, 7]),
  mine_pebble_12: loose('mine_decor', [100, 104, 21, 19]),
  mine_pebble_13: loose('mine_decor', [133, 104, 21, 16]),
  mine_pebble_14: loose('mine_decor', [175, 105, 10, 8]),
  mine_pebble_15: loose('mine_decor', [205, 106, 18, 14]),
  mine_pebble_16: loose('mine_decor', [244, 104, 12, 11]),
  mine_pebble_17: loose('mine_decor', [269, 104, 7, 5]),
  mine_pebble_18: loose('mine_decor', [304, 104, 9, 8]),
  mine_web_00: hung([0, 134, 39, 70], WEB_HANG),
  mine_web_01: hung([64, 134, 30, 62], WEB_HANG),
  mine_web_02: hung([230, 143, 36, 68], WEB_HANG),
  mine_web_03: hung([295, 128, 50, 64], WEB_HANG),
  mine_web_04: hung([352, 142, 57, 45], WEB_HANG),
  mine_web_05: hung([423, 143, 25, 35], WEB_HANG),
  mine_web_06: hung([101, 148, 54, 51], WEB_HANG),
  mine_web_07: hung([169, 148, 47, 68], WEB_HANG),
  mine_web_08: hung([354, 198, 30, 62], WEB_HANG),
  mine_web_09: hung([409, 198, 39, 70], WEB_HANG),
  mine_web_10: hung([293, 212, 54, 51], WEB_HANG),
  mine_web_11: hung([0, 239, 25, 35], WEB_HANG),
  mine_web_12: hung([39, 238, 57, 45], WEB_HANG),
  mine_web_13: hung([103, 224, 50, 64], WEB_HANG),
  mine_web_14: hung([182, 239, 36, 68], WEB_HANG),
  mine_web_15: hung([232, 244, 47, 68], WEB_HANG),
  mine_root_00: flat([9, 291, 10, 22]),
  mine_root_01: flat([44, 297, 8, 9]),
  mine_root_02: flat([71, 306, 6, 8]),
  mine_root_03: flat([105, 297, 13, 14]),
  mine_root_04: flat([135, 296, 13, 12]),
  mine_root_05: flat([166, 296, 14, 15]),
  mine_root_06: flat([300, 296, 13, 12]),
  mine_root_07: flat([330, 297, 13, 14]),
  mine_root_08: flat([371, 306, 6, 8]),
  mine_root_09: flat([396, 297, 8, 9]),
  mine_root_10: flat([429, 291, 10, 22]),
  mine_root_11: flat([7, 329, 13, 15]),
  mine_root_12: flat([38, 321, 20, 29]),
  mine_root_13: flat([71, 320, 18, 31]),
  mine_root_14: flat([103, 328, 16, 12]),
  mine_root_15: flat([134, 325, 17, 8]),
  mine_root_16: flat([162, 320, 26, 31]),
  mine_root_17: flat([234, 330, 14, 15]),
  mine_root_18: flat([260, 320, 26, 31]),
  mine_root_19: flat([297, 325, 17, 8]),
  mine_root_20: flat([329, 328, 16, 12]),
  mine_root_21: flat([359, 320, 18, 31]),
  mine_root_22: flat([390, 321, 20, 29]),
  mine_root_23: flat([428, 329, 13, 15]),
  mine_root_24: flat([9, 355, 10, 22]),
  mine_root_25: flat([44, 361, 8, 9]),
  mine_root_26: flat([71, 370, 6, 8]),
  mine_root_27: flat([105, 361, 13, 14]),
  mine_root_28: flat([135, 360, 13, 12]),
  mine_root_29: flat([166, 360, 14, 15]),
  mine_root_30: flat([300, 360, 13, 12]),
  mine_root_31: flat([330, 361, 13, 14]),
  mine_root_32: flat([371, 370, 6, 8]),
  mine_root_33: flat([396, 361, 8, 9]),
  mine_root_34: flat([429, 355, 10, 22]),
  mine_root_35: flat([7, 393, 13, 15]),
  mine_root_36: flat([38, 385, 20, 29]),
  mine_root_37: flat([71, 384, 18, 31]),
  mine_root_38: flat([103, 392, 16, 12]),
  mine_root_39: flat([134, 389, 17, 8]),
  mine_root_40: flat([162, 384, 26, 31]),
  mine_root_41: flat([234, 394, 14, 15]),
  mine_root_42: flat([260, 384, 26, 31]),
  mine_root_43: flat([297, 389, 17, 8]),
  mine_root_44: flat([329, 392, 16, 12]),
  mine_root_45: flat([359, 384, 18, 31]),
  mine_root_46: flat([390, 385, 20, 29]),
  mine_root_47: flat([428, 393, 13, 15]),

  // ── rocks_stones.png ──
  mine_rock_s_0: solid('mine_rocks', [77, 0, 39, 64], 1, MID_BASE),
  mine_rock_s_1: solid('mine_rocks', [130, 18, 28, 46], 1, SMALL_BASE),
  mine_rock_s_2: solid('mine_rocks', [290, 338, 28, 46], 1, SMALL_BASE),
  mine_rock_m_0: solid('mine_rocks', [2, 3, 61, 60], 1, MID_BASE),
  mine_rock_m_1: solid('mine_rocks', [172, 5, 67, 59], 1, MID_BASE),
  mine_rock_m_2: solid('mine_rocks', [262, 10, 50, 49], 1, MID_BASE),
  mine_rock_m_3: solid('mine_rocks', [136, 330, 50, 49], 1, MID_BASE),
  mine_rock_m_4: solid('mine_rocks', [209, 325, 67, 59], 1, MID_BASE),
  mine_rock_m_5: solid('mine_rocks', [385, 323, 61, 60], 1, MID_BASE),
  mine_rock_l_0: solid('mine_rocks', [13, 79, 83, 78], 3, BIG_BASE),
  mine_rock_l_1: solid('mine_rocks', [109, 75, 69, 78], 3, BIG_BASE),
  mine_rock_l_2: solid('mine_rocks', [336, 143, 97, 73], 3, BIG_BASE),
  mine_rock_l_3: solid('mine_rocks', [270, 395, 69, 78], 3, BIG_BASE),
  mine_rock_l_4: solid('mine_rocks', [352, 399, 83, 78], 3, BIG_BASE),
  mine_rock_l_5: solid('mine_rocks', [15, 463, 97, 73], 3, BIG_BASE),
  mine_rock_l_6: solid('mine_rocks', [14, 548, 103, 92], 3, BIG_BASE),
  mine_rock_xl_0: solid('mine_rocks', [320, 7, 127, 111], 3, HUGE_BASE),
  mine_rock_xl_1: solid('mine_rocks', [195, 71, 119, 121], 3, HUGE_BASE),
  mine_rock_xl_2: solid('mine_rocks', [3, 171, 154, 140], 5, HUGE_BASE),
  mine_rock_xl_3: solid('mine_rocks', [167, 192, 132, 128], 5, HUGE_BASE),
  mine_rock_xl_4: solid('mine_rocks', [1, 327, 127, 111], 3, HUGE_BASE),
  mine_rock_xl_5: solid('mine_rocks', [134, 391, 119, 121], 3, HUGE_BASE),
  mine_rock_xl_6: solid('mine_rocks', [291, 491, 154, 140], 5, HUGE_BASE),
  mine_rock_xl_7: solid('mine_rocks', [149, 512, 132, 128], 5, HUGE_BASE),
  mine_rubble_s_0: loose('mine_rocks', [455, 80, 48, 34]),
  mine_rubble_s_1: loose('mine_rocks', [512, 102, 61, 23]),
  mine_rubble_s_2: loose('mine_rocks', [544, 128, 32, 32]),
  mine_rubble_s_3: loose('mine_rocks', [521, 400, 48, 34]),
  mine_rubble_s_4: loose('mine_rocks', [451, 422, 61, 23]),
  mine_rubble_s_5: loose('mine_rocks', [448, 448, 32, 32]),
  mine_rubble_0: solid('mine_rocks', [451, 12, 56, 42], 1, MID_BASE),
  mine_rubble_1: solid('mine_rocks', [517, 332, 56, 42], 1, MID_BASE),
  mine_rubble_2: solid('mine_rocks', [450, 135, 90, 52], 3, BIG_BASE),
  mine_rubble_3: solid('mine_rocks', [449, 198, 78, 57], 3, BIG_BASE),
  mine_rubble_4: solid('mine_rocks', [462, 258, 71, 62], 3, BIG_BASE),
  mine_rubble_5: solid('mine_rocks', [484, 455, 90, 52], 3, BIG_BASE),
  mine_rubble_6: solid('mine_rocks', [465, 518, 78, 57], 3, BIG_BASE),
  mine_rubble_7: solid('mine_rocks', [459, 578, 71, 62], 3, BIG_BASE),
  mine_stalagmite_xs_0: loose('mine_rocks', [555, 165, 12, 24]),
  mine_stalagmite_xs_1: loose('mine_rocks', [555, 201, 10, 19]),
  mine_stalagmite_xs_2: loose('mine_rocks', [584, 201, 13, 15]),
  mine_stalagmite_xs_3: loose('mine_rocks', [617, 201, 9, 16]),
  mine_stalagmite_xs_4: loose('mine_rocks', [555, 235, 10, 36]),
  mine_stalagmite_xs_5: loose('mine_rocks', [585, 234, 10, 38]),
  mine_stalagmite_xs_6: loose('mine_rocks', [616, 240, 15, 36]),
  mine_stalagmite_xs_7: loose('mine_rocks', [589, 488, 9, 16]),
  mine_stalagmite_xs_8: loose('mine_rocks', [617, 485, 12, 24]),
  mine_stalagmite_xs_9: loose('mine_rocks', [555, 521, 10, 19]),
  mine_stalagmite_xs_10: loose('mine_rocks', [584, 527, 15, 36]),
  mine_stalagmite_xs_11: loose('mine_rocks', [555, 555, 10, 36]),
  mine_stalagmite_xs_12: loose('mine_rocks', [584, 590, 10, 38]),
  mine_stalagmite_xs_13: loose('mine_rocks', [552, 616, 13, 15]),
  mine_stalagmite_0: solid('mine_rocks', [592, 4, 32, 57], 1, SMALL_BASE),
  mine_stalagmite_1: solid('mine_rocks', [592, 69, 34, 58], 1, SMALL_BASE),
  mine_stalagmite_2: solid('mine_rocks', [615, 140, 21, 45], 1, SMALL_BASE),
  mine_stalagmite_3: solid('mine_rocks', [580, 145, 25, 36], 1, SMALL_BASE),
  mine_stalagmite_4: solid('mine_rocks', [591, 291, 32, 57], 1, SMALL_BASE),
  mine_stalagmite_5: solid('mine_rocks', [589, 356, 34, 58], 1, SMALL_BASE),
  mine_stalagmite_6: solid('mine_rocks', [579, 427, 21, 45], 1, SMALL_BASE),
  mine_stalagmite_7: solid('mine_rocks', [610, 432, 25, 36], 1, SMALL_BASE),
  mine_stalagmites_0: solid('mine_rocks', [648, 14, 40, 70], 1, MID_BASE),
  mine_stalagmites_1: solid('mine_rocks', [652, 109, 40, 70], 1, MID_BASE),
  mine_stalagmites_2: solid('mine_rocks', [640, 192, 49, 80], 1, MID_BASE),
  mine_stalagmites_3: solid('mine_rocks', [655, 288, 49, 80], 1, MID_BASE),
  mine_stalagmites_4: solid('mine_rocks', [640, 401, 46, 79], 1, MID_BASE),
  mine_stalagmites_5: solid('mine_rocks', [658, 497, 46, 79], 1, MID_BASE),
  mine_stalagmites_6: solid('mine_rocks', [608, 576, 64, 59], 3, BIG_BASE),

  // ── wood_el.png: the pit timbering ──
  mine_frame:      { image: 'mine_wood', rect: rect([289, 0, 62, 110]), mount: 'foot' },
  mine_frame_wide: { image: 'mine_wood', rect: rect([352, 0, 128, 110]), mount: 'foot' },
  mine_frame_door: { image: 'mine_wood', rect: rect([640, 0, 96, 110]), mount: 'foot' },
  mine_support:    { image: 'mine_wood', rect: rect([287, 128, 62, 170]), mount: 'foot' },
  mine_support2:   { image: 'mine_wood', rect: rect([419, 128, 61, 170]), mount: 'foot' },
  mine_post:        solid('mine_wood', [487, 0, 18, 110], 1, SMALL_BASE),
  mine_post2:       solid('mine_wood', [340, 193, 12, 106], 1, SMALL_BASE),
  mine_post3:       solid('mine_wood', [73, 337, 14, 111], 1, SMALL_BASE),
  mine_post_broken: solid('mine_wood', [359, 131, 24, 167], 1, SMALL_BASE),
  mine_post_broken2: solid('mine_wood', [384, 131, 25, 167], 1, SMALL_BASE),
  mine_lantern_post:  { ...solid('mine_wood', [426, 192, 22, 106], 1, SMALL_BASE), glow: LANTERN_GLOW, coolGlow: true },
  mine_lantern_post2: { ...solid('mine_wood', [704, 192, 26, 106], 1, SMALL_BASE), glow: LANTERN_GLOW, coolGlow: true },
  mine_lantern_post3: { ...solid('mine_wood', [742, 192, 26, 106], 1, SMALL_BASE), glow: LANTERN_GLOW, coolGlow: true },
  mine_lantern:  { image: 'mine_wood', rect: rect([779, 211, 10, 33]), mount: 'wall', hang: LANTERN_HANG, glow: HUNG_LANTERN_GLOW, coolGlow: true },
  mine_lantern2: { image: 'mine_wood', rect: rect([587, 275, 10, 33]), mount: 'wall', hang: LANTERN_HANG, glow: HUNG_LANTERN_GLOW, coolGlow: true },
  mine_lantern3: { image: 'mine_wood', rect: rect([618, 279, 10, 29]), mount: 'wall', hang: LANTERN_HANG, glow: HUNG_LANTERN_GLOW, coolGlow: true },
  mine_lantern4: { image: 'mine_wood', rect: rect([778, 279, 10, 29]), mount: 'wall', hang: LANTERN_HANG, glow: HUNG_LANTERN_GLOW, coolGlow: true },
  mine_fence:      { image: 'mine_wood', rect: rect([93, 14, 32, 38]), mount: 'floor' },
  mine_fence_post: { image: 'mine_wood', rect: rect([93, 14, 7, 38]), mount: 'floor' },
  mine_fence_side: { image: 'mine_wood', rect: rect([12, 92, 12, 32]), mount: 'floor' },
  mine_trestle: solid('mine_wood', [111, 432, 66, 39], 3, BIG_BASE),
  mine_log:     { image: 'mine_wood', rect: rect([83, 448, 32, 23]), mount: 'floor' },
  mine_log2:    { image: 'mine_wood', rect: rect([97, 481, 37, 31]), mount: 'floor' },
} as const satisfies Record<string, PropDef>;
