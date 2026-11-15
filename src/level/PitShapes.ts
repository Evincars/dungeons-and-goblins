import { TILE_HEIGHT, TILE_WIDTH } from './TileType';
import { MINE_HOLES, holeArtOffset } from './MineTiles';

/**
 * The shapes pits are dug in, from the catacomb tileset's pit pieces (mainlevbuild.png): a framed square, the same
 * square with rounded lobes bulging from some of its sides (an arched alcove on the north side), and a quatrefoil;
 * and in a castle, a long framed pit of spikes (castle mainlevbuild.png). Each catacomb pit sits on 2×2 Hole tiles,
 * a castle's on SPIKE_PIT_W×SPIKE_PIT_H; and in the mines, holes in the floor of every size (MineTiles.ts MINE_HOLES,
 * `lobes` saying which), from one a body's size on a single tile to great ragged ones. A pit's open ground is a union of
 * boxes and discs (in pixels from the top-left corner of its tiles), so falling in, keeping enemies out and hiding a
 * faller all follow the drawn edge, not the tiles.
 */

export const PIT_SHAPES = ['square', 'lobed', 'quatrefoil', 'spikes', 'hole'] as const;
export type PitShape = (typeof PIT_SHAPES)[number];

export function isPitShape(value: unknown): value is PitShape {
  return PIT_SHAPES.some((shape) => shape === value);
}

/** A lobed pit's lobes, as bits: an arched alcove on the north side, half-discs on the east, south and west. */
export const LOBE_N = 1;
export const LOBE_E = 2;
export const LOBE_S = 4;
export const LOBE_W = 8;
export const ALL_LOBES = LOBE_N | LOBE_E | LOBE_S | LOBE_W;

/** A castle's spike pit takes this many Hole tiles across and down. */
export const SPIKE_PIT_W = 4;
export const SPIKE_PIT_H = 2;

/**
 * A pit: the top-left of its Hole tiles, its shape, and (for a lobed one) which lobes it has, or (for a mine's hole)
 * which of MINE_HOLES it is.
 */
export type Pit = { x: number; y: number; shape: PitShape; lobes: number };

/** The mine hole a pit of shape 'hole' is, if `lobes` names one. */
export function mineHole(pit: Pit): (typeof MINE_HOLES)[number] | undefined {
  return pit.shape === 'hole' ? MINE_HOLES[pit.lobes] : undefined;
}

/** Whether a pit's `lobes` fit its shape: lobe bits for the catacombs' pits, a hole's index for a mine's. */
export function validPitDetail(shape: PitShape, lobes: number): boolean {
  return shape === 'hole' ? lobes >= 0 && lobes < MINE_HOLES.length : lobes >= 0 && lobes <= ALL_LOBES;
}

/** The Hole tiles a pit is dug on: its width and height in tiles. */
export function pitTiles(pit: Pit): { w: number; h: number } {
  const hole = mineHole(pit);
  if (hole) return { w: hole.w, h: hole.h };
  return pit.shape === 'spikes' ? { w: SPIKE_PIT_W, h: SPIKE_PIT_H } : { w: 2, h: 2 };
}

type Box = { x0: number; y0: number; x1: number; y1: number };
type Disc = { cx: number; cy: number; r: number };
/** A pit's open ground, relative to its top-left corner, and the box round all of it. */
export type Outline = { boxes: readonly Box[]; discs: readonly Disc[]; bounds: Box };

/** The pit's 2×2 tiles, in pixels. */
const SIDE = 2 * TILE_WIDTH;
/**
 * A lobe is a half-disc this wide (its flat side against the square) whose open middle has this radius, set this far
 * into the square so it covers the square's rim where they join (as the art is drawn, TerrainAutotile.ts).
 */
const LOBE_R = 14;
const LOBE_OVERLAP = 4;
/** The arched alcove is as wide as a lobe and reaches this far north of the square. */
const ARCH_REACH = 44;
/** The quatrefoil's four round lobes, each centred this far in from its edge, with the same open radius. */
const FOIL_INSET = 18;
/** A faller is pulled at least this far inside the edge of the square they dropped into (half of a narrower box). */
const DROP_MARGIN = 14;

const CORE: Box = { x0: 0, y0: 0, x1: SIDE, y1: SIDE };
const MID = SIDE / 2;
const LOBE_DISCS: ReadonlyArray<[number, Disc]> = [
  [LOBE_E, { cx: SIDE - LOBE_OVERLAP, cy: MID, r: LOBE_R }],
  [LOBE_S, { cx: MID, cy: SIDE - LOBE_OVERLAP, r: LOBE_R }],
  [LOBE_W, { cx: LOBE_OVERLAP, cy: MID, r: LOBE_R }],
];
/** The arched alcove: a column as wide as a lobe, rounded at its north end. */
const ARCH_TOP = LOBE_OVERLAP - ARCH_REACH + LOBE_R;
const ARCH_BOX: Box = { x0: MID - LOBE_R, y0: ARCH_TOP, x1: MID + LOBE_R, y1: LOBE_OVERLAP };
const ARCH_DISC: Disc = { cx: MID, cy: ARCH_TOP, r: LOBE_R };
const QUATREFOIL: Outline = withBounds(
  [{ x0: FOIL_INSET, y0: FOIL_INSET, x1: SIDE - FOIL_INSET, y1: SIDE - FOIL_INSET }],
  [
    { cx: MID, cy: FOIL_INSET, r: LOBE_R }, { cx: MID, cy: SIDE - FOIL_INSET, r: LOBE_R },
    { cx: FOIL_INSET, cy: MID, r: LOBE_R }, { cx: SIDE - FOIL_INSET, cy: MID, r: LOBE_R },
  ],
);

/**
 * The spike pit's dark inside: its art (124×66) is centred on its 4×2 tiles, and its frame is 6px wide, so the open
 * ground runs from 8 to 120 across and from just under the top frame to the bottom one.
 */
const SPIKE_PIT: Outline = withBounds([{ x0: 8, y0: 6, x1: 120, y1: 56 }], []);

function withBounds(boxes: Box[], discs: Disc[]): Outline {
  const bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const b of boxes) {
    bounds.x0 = Math.min(bounds.x0, b.x0); bounds.y0 = Math.min(bounds.y0, b.y0);
    bounds.x1 = Math.max(bounds.x1, b.x1); bounds.y1 = Math.max(bounds.y1, b.y1);
  }
  for (const d of discs) {
    bounds.x0 = Math.min(bounds.x0, d.cx - d.r); bounds.y0 = Math.min(bounds.y0, d.cy - d.r);
    bounds.x1 = Math.max(bounds.x1, d.cx + d.r); bounds.y1 = Math.max(bounds.y1, d.cy + d.r);
  }
  return { boxes, discs, bounds };
}

/** A mine hole's open dark: its boxes, moved from its art onto its tiles. */
function holeOutline(lobes: number): Outline {
  const hole = MINE_HOLES[lobes] ?? MINE_HOLES[0];
  const at = holeArtOffset(hole);
  return withBounds(hole.open.map(([x0, y0, x1, y1]) => ({ x0: at.x + x0, y0: at.y + y0, x1: at.x + x1, y1: at.y + y1 })), []);
}

function lobedOutline(lobes: number): Outline {
  const boxes: Box[] = [CORE];
  const discs: Disc[] = [];
  for (const [bit, disc] of LOBE_DISCS) if (lobes & bit) discs.push(disc);
  if (lobes & LOBE_N) {
    boxes.push(ARCH_BOX);
    discs.push(ARCH_DISC);
  }
  return withBounds(boxes, discs);
}

/** Outlines by shape and lobes, worked out once each (there are only a few). */
const outlines = new Map<string, Outline>();

export function pitOutline(pit: Pit): Outline {
  const key = `${pit.shape}/${pit.lobes}`;
  let outline = outlines.get(key);
  if (outline) return outline;
  if (pit.shape === 'quatrefoil') outline = QUATREFOIL;
  else if (pit.shape === 'spikes') outline = SPIKE_PIT;
  else if (pit.shape === 'hole') outline = holeOutline(pit.lobes);
  else outline = pit.shape === 'lobed' ? lobedOutline(pit.lobes) : withBounds([CORE], []);
  outlines.set(key, outline);
  return outline;
}

/** Whether a world point is over the pit's open ground. */
export function insidePit(pit: Pit, x: number, y: number): boolean {
  const { boxes, discs } = pitOutline(pit);
  const px = x - pit.x * TILE_WIDTH;
  const py = y - pit.y * TILE_HEIGHT;
  for (const b of boxes) if (px >= b.x0 && px < b.x1 && py >= b.y0 && py < b.y1) return true;
  for (const d of discs) if ((px - d.cx) ** 2 + (py - d.cy) ** 2 < d.r * d.r) return true;
  return false;
}

/** The pit's open ground in world pixels: every box and disc, for drawing a mask. */
export function worldOutline(pit: Pit): { ox: number; oy: number; outline: Outline } {
  return { ox: pit.x * TILE_WIDTH, oy: pit.y * TILE_HEIGHT, outline: pitOutline(pit) };
}

/** The tiles the pit's open ground reaches into (a lobe reaches half a tile past the square). */
export function pitTileBounds(pit: Pit): Box {
  const { bounds } = pitOutline(pit);
  return {
    x0: pit.x + Math.floor(bounds.x0 / TILE_WIDTH), y0: pit.y + Math.floor(bounds.y0 / TILE_HEIGHT),
    x1: pit.x + Math.ceil(bounds.x1 / TILE_WIDTH) - 1, y1: pit.y + Math.ceil(bounds.y1 / TILE_HEIGHT) - 1,
  };
}

/**
 * Where someone who stepped in at (x, y) drops to: the middle of the part of the pit they are over (the lobe or the
 * square), so a faller on the very lip is drawn down into the dark rather than beside it. Written into `out`.
 */
export function dropPoint(pit: Pit, x: number, y: number, out: { x: number; y: number }): { x: number; y: number } {
  const { boxes, discs } = pitOutline(pit);
  const ox = pit.x * TILE_WIDTH;
  const oy = pit.y * TILE_HEIGHT;
  const px = x - ox;
  const py = y - oy;
  for (const d of discs) {
    if ((px - d.cx) ** 2 + (py - d.cy) ** 2 >= d.r * d.r) continue;
    out.x = ox + d.cx;
    out.y = oy + d.cy;
    return out;
  }
  const box = boxes.find((b) => px >= b.x0 && px < b.x1 && py >= b.y0 && py < b.y1) ?? boxes[0];
  // Into the square by a margin from whichever edge it was entered at, not all the way to its middle.
  const mx = Math.min(DROP_MARGIN, (box.x1 - box.x0) / 2);
  const my = Math.min(DROP_MARGIN, (box.y1 - box.y0) / 2);
  out.x = ox + Math.min(Math.max(px, box.x0 + mx), box.x1 - mx);
  out.y = oy + Math.min(Math.max(py, box.y0 + my), box.y1 - my);
  return out;
}
