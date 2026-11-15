import type { SlopeCorner } from './Slopes';

/**
 * The slanted wall pieces of the catacombs' and the castle's tilesets, in the band scripts/iso-sheets.py adds under each
 * one's original art (`mainlevbuild-isometric.png`): their faces and a couple of arched pieces turned onto the slant (two
 * pixels across for every pixel down), the wall top's rim along a south slant, and a tile of plain black. Keep these in
 * step with that script.
 */

/** A piece drawn along a slant: where its foot (the slant) is down the piece at its left and right edges. */
export type SlantArt = { x: number; y: number; w: number; h: number; footLeft: number; footRight: number };
/**
 * A rim along a south slant: solid down to `solidH` in every column; below that, its shearing leaves a corner open
 * (the dark laid under it starts there, so no floor shows through).
 */
export type SlantRim = SlantArt & { solidH: number };

/** A face block is 64 px of face over an 8 px plinth, sheared: a tile's strip drops 16 px across, two tiles 32. */
const FACE_FOOT = 64;
const TILE_DROP = 16;
const STRIP_W = 32;
const RIM_H = 48;

/** The two tiles of a plain slanted face cut from a 64 px block (the stone runs on from one to the next). */
function faceStrips(x: number, y: number, corner: 'nw' | 'ne'): readonly [SlantArt, SlantArt] {
  const h = FACE_FOOT + 8 + 2 * TILE_DROP;
  const foot = (i: number): number => FACE_FOOT + (corner === 'nw' ? 2 - i : i) * TILE_DROP;
  return [
    { x, y, w: STRIP_W, h, footLeft: foot(0), footRight: foot(1) },
    { x: x + STRIP_W, y, w: STRIP_W, h, footLeft: foot(1), footRight: foot(2) },
  ];
}

/** A whole arched piece, `tiles` wide, sheared. */
function slantDecor(x: number, y: number, tiles: number, corner: 'nw' | 'ne'): SlantArt {
  const drop = tiles * TILE_DROP;
  const footLow = FACE_FOOT + drop;
  return {
    x, y, w: tiles * STRIP_W, h: FACE_FOOT + 8 + drop,
    footLeft: corner === 'nw' ? footLow : FACE_FOOT, footRight: corner === 'nw' ? FACE_FOOT : footLow,
  };
}

/** The rim along a south slant (a tile), the dark under it: the south-west one drops to the right, the south-east to the left. */
function rimStrip(x: number, y: number, corner: 'sw' | 'se'): SlantRim {
  return {
    x, y, w: STRIP_W, h: RIM_H, solidH: RIM_H - TILE_DROP,
    footLeft: corner === 'sw' ? 0 : TILE_DROP, footRight: corner === 'sw' ? TILE_DROP : 0,
  };
}

export type SlantSet = {
  /** The plain slanted faces, two tiles each, by corner; `cobble` the cobblestone walls' (the castle has none). */
  face: Readonly<Record<'nw' | 'ne', readonly [SlantArt, SlantArt]>>;
  cobble?: Readonly<Record<'nw' | 'ne', readonly [SlantArt, SlantArt]>>;
  rim: Readonly<Record<'sw' | 'se', SlantRim>>;
  void: { x: number; y: number; w: number; h: number };
  /** Arched pieces set into slanted faces now and then: a tile wide (a window), and two (a niche, an alcove). */
  narrow: Readonly<Record<'nw' | 'ne', SlantArt>>;
  wide: Readonly<Record<'nw' | 'ne', SlantArt>>;
};

const CATACOMB_Y = 640;
const CASTLE_Y = 736;

export const CATACOMB_SLANTS: SlantSet = {
  face: { nw: faceStrips(0, CATACOMB_Y, 'nw'), ne: faceStrips(64, CATACOMB_Y, 'ne') },
  cobble: { nw: faceStrips(128, CATACOMB_Y, 'nw'), ne: faceStrips(192, CATACOMB_Y, 'ne') },
  rim: { sw: rimStrip(256, CATACOMB_Y, 'sw'), se: rimStrip(288, CATACOMB_Y, 'se') },
  void: { x: 320, y: CATACOMB_Y, w: 32, h: 32 },
  narrow: { nw: slantDecor(352, CATACOMB_Y, 1, 'nw'), ne: slantDecor(384, CATACOMB_Y, 1, 'ne') },
  wide: { nw: slantDecor(416, CATACOMB_Y, 2, 'nw'), ne: slantDecor(480, CATACOMB_Y, 2, 'ne') },
};

export const CASTLE_SLANTS: SlantSet = {
  face: { nw: faceStrips(0, CASTLE_Y, 'nw'), ne: faceStrips(64, CASTLE_Y, 'ne') },
  rim: { sw: rimStrip(128, CASTLE_Y, 'sw'), se: rimStrip(160, CASTLE_Y, 'se') },
  void: { x: 192, y: CASTLE_Y, w: 32, h: 32 },
  narrow: { nw: slantDecor(224, CASTLE_Y, 1, 'nw'), ne: slantDecor(256, CASTLE_Y, 1, 'ne') },
  wide: { nw: slantDecor(288, CASTLE_Y, 2, 'nw'), ne: slantDecor(352, CASTLE_Y, 2, 'ne') },
};

/** North corners show a face on the slant, south ones a rim. */
export function northCorner(corner: SlopeCorner): corner is 'nw' | 'ne' {
  return corner === 'nw' || corner === 'ne';
}
