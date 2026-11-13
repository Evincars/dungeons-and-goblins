import { TILE_HEIGHT, TILE_WIDTH } from './TileType';

/**
 * The shapes pits are dug in, from the catacomb tileset's pit pieces (mainlevbuild.png): a framed square, the same
 * square with rounded lobes bulging from some of its sides (an arched alcove on the north side), and a quatrefoil.
 * Each pit sits on 2×2 Hole tiles; its open ground is a union of boxes and discs (in pixels from the top-left corner
 * of those tiles), so falling in, keeping enemies out and hiding a faller all follow the drawn edge, not the tiles.
 */

export const PIT_SHAPES = ['square', 'lobed', 'quatrefoil'] as const;
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

/** A pit: the top-left of its 2×2 Hole tiles, its shape, and (for a lobed one) which lobes it has. */
export type Pit = { x: number; y: number; shape: PitShape; lobes: number };

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
/** A faller is pulled at least this far inside the edge of the square they dropped into. */
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
  out.x = ox + Math.min(Math.max(px, box.x0 + DROP_MARGIN), box.x1 - DROP_MARGIN);
  out.y = oy + Math.min(Math.max(py, box.y0 + DROP_MARGIN), box.y1 - DROP_MARGIN);
  return out;
}
