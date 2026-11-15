import type { Level } from '../Level';
import { TileType } from '../TileType';
import { forEachTile, someTile } from '../Grid';
import type { Slope, SlopeCorner } from '../Slopes';
import { isSouthSlope } from '../Slopes';
import type { Keep, RoomData, TileChange, TilePos } from './DungeonBuilder';

/**
 * Walls laid on the slant (Slopes.ts: two tiles across for each tile down), for every theme: a room's corner cut off on
 * the slant, and a corridor that runs down the slant between two rooms. Each slant crosses two tiles in every row it
 * passes through: the one on the wall's side is mostly wall (a Wall tile, `major`), the other only a corner of it (a
 * Floor tile, `minor`).
 */

/** What laying slants needs of the builder. */
export type SlantSite = {
  readonly level: Level;
  isWall(tx: number, ty: number): boolean;
  free(tx: number, ty: number): boolean;
  claim(tx: number, ty: number): void;
  setTiles(cells: Array<[number, number]>, type: TileType): TileChange[];
};

/** A room's corner cut off on the slant: which corner, and how many tiles deep (twice that across). */
export type SlantCorner = { corner: SlopeCorner; depth: number };

/** A room keeps at least this much floor across and down besides its slants (its middle stays open). */
const SLANT_ROOM_SPARE_W = 2;
const SLANT_ROOM_SPARE_H = 3;

const isLeft = (corner: SlopeCorner): boolean => corner === 'nw' || corner === 'sw';
const isTop = (corner: SlopeCorner): boolean => corner === 'nw' || corner === 'ne';

/** Whether a room is big enough to have its corners cut this deep. */
export function slantFits(room: RoomData, depth: number): boolean {
  return room.w >= depth * 4 + SLANT_ROOM_SPARE_W && room.h >= depth * 2 + SLANT_ROOM_SPARE_H;
}

/**
 * Cuts one corner off on the slant, `depth` tiles down and twice that across: the tiles beyond the slant become wall,
 * and the two it crosses in each row are marked as slopes. Not where a corridor comes in, nor over anything set down.
 */
export function cutSlantCorner(site: SlantSite, room: RoomData, corner: SlopeCorner, depth: number, keep: Keep): boolean {
  const across = depth * 2;
  if (!slantFits(room, depth)) return false;
  const left = isLeft(corner);
  const top = isTop(corner);
  const x0 = left ? room.x : room.x + room.w - across;
  const y0 = top ? room.y : room.y + room.h - depth;
  const outside = (x: number, y: number): boolean => x < room.x || y < room.y || x >= room.x + room.w || y >= room.y + room.h;
  if (someTile(x0 - 1, y0 - 1, x0 + across, y0 + depth, (x, y) => outside(x, y) && !site.isWall(x, y))) return false;
  if (someTile(x0, y0, x0 + across - 1, y0 + depth - 1, (x, y) => !site.free(x, y))) return false;
  const walls: Array<[number, number]> = [];
  const slopes: Array<[number, Slope]> = [];
  forEachTile(0, 0, across - 1, depth - 1, (j, k) => {
    const x = left ? room.x + j : room.x + room.w - 1 - j;
    const y = top ? room.y + k : room.y + room.h - 1 - k;
    // In row k from the corner, the slant crosses columns lx (mostly wall) and lx + 1 (a corner of wall).
    const lx = 2 * (depth - 1 - k);
    if (j <= lx) walls.push([x, y]);
    if (j === lx || j === lx + 1) slopes.push([x + y * site.level.width, { corner, major: j === lx }]);
  });
  if (!keep(() => site.setTiles(walls, TileType.Wall))) return false;
  for (const [i, slope] of slopes) site.level.slopes.set(i, slope);
  forEachTile(x0, y0, x0 + across - 1, y0 + depth - 1, (x, y) => site.claim(x, y));
  return true;
}

/** The slope tile a slanted corner's slant crosses in its column `j` (counted from the corner). */
export function slantTile(room: RoomData, c: SlantCorner, j: number): TilePos {
  const k = c.depth - 1 - Math.floor(j / 2);
  return {
    x: isLeft(c.corner) ? room.x + j : room.x + room.w - 1 - j,
    y: isTop(c.corner) ? room.y + k : room.y + room.h - 1 - k,
  };
}

// ── Spurs of rock ───────────────────────────────────────────────────────────────

/** The side of a room a spur of rock juts out from. */
export type SpurSide = 'n' | 's';

/**
 * Juts a spur of rock out of a room's north (or south) wall: a wedge `depth` tiles deep and four times that across, from
 * column x0, with a slant down each side meeting at its point (the zigzag of a cave wall). Not where a corridor comes in,
 * nor over anything set down, nor if the room is too shallow for it.
 */
export function cutSlantSpur(site: SlantSite, room: RoomData, x0: number, depth: number, side: SpurSide, keep: Keep): boolean {
  const across = depth * 4;
  const north = side === 'n';
  const edge = north ? room.y : room.y + room.h - 1;
  const beyond = north ? edge - 1 : edge + 1;
  const fits = room.h >= depth * 2 + SLANT_ROOM_SPARE_H && x0 > room.x && x0 + across < room.x + room.w;
  if (!fits || someTile(x0 - 1, beyond, x0 + across, beyond, (x, y) => !site.isWall(x, y))) return false;
  const y0 = north ? edge : edge - depth + 1;
  if (someTile(x0 - 1, y0, x0 + across, y0 + depth - 1, (x, y) => !site.free(x, y))) return false;
  const walls: Array<[number, number]> = [];
  const slopes: Array<[number, Slope]> = [];
  // The spur's two halves are corners cut off back to back: its left half's wall lies right of its slant, its right's left.
  const halves: ReadonlyArray<[SlopeCorner, number, 1 | -1]> = north
    ? [['ne', x0 + depth * 2 - 1, -1], ['nw', x0 + depth * 2, 1]]
    : [['se', x0 + depth * 2 - 1, -1], ['sw', x0 + depth * 2, 1]];
  for (const [corner, apex, dir] of halves) {
    forEachTile(0, 0, depth * 2 - 1, depth - 1, (j, k) => {
      const x = apex + dir * j;
      const y = north ? edge + k : edge - k;
      const lx = 2 * (depth - 1 - k);
      if (j <= lx) walls.push([x, y]);
      if (j === lx || j === lx + 1) slopes.push([x + y * site.level.width, { corner, major: j === lx }]);
    });
  }
  if (!keep(() => site.setTiles(walls, TileType.Wall))) return false;
  for (const [i, slope] of slopes) site.level.slopes.set(i, slope);
  forEachTile(x0 - 1, y0, x0 + across, y0 + depth - 1, (x, y) => site.claim(x, y));
  return true;
}

// ── Corridors down the slant ────────────────────────────────────────────────────

/**
 * A corridor's cells: the floor of its straight stretches (which may cross a corridor already there), the floor of the
 * band down the slant, and the slopes along the band's sides (their major tiles stay wall).
 */
export type SlantedRun = { straight: Array<[number, number]>; band: Array<[number, number]>; slopes: Array<[number, number, Slope]> };

/** A face (straight or on the slant) is two tiles tall. */
const FACE_ROWS = 2;
/** A corridor runs at least this many rows down the slant (fewer would hardly read as one). */
const SLANTED_MIN_ROWS = 2;

/** The frame a slanted corridor between two rooms is worked in (see planSlantedRun). */
type SlantFrame = { rows: number; dir: 1 | -1; bEdge: number; lo: number; hi: number };

function slantFrame(top: RoomData, bottom: RoomData, width: number): SlantFrame | null {
  const rows = bottom.y - (top.y + top.h);
  if (rows < SLANTED_MIN_ROWS) return null;
  const dir = bottom.x * 2 + bottom.w > top.x * 2 + top.w ? 1 : -1;
  const bEdge = dir > 0 ? bottom.x - (top.x + top.w - 1) : top.x - (bottom.x + bottom.w - 1);
  const bEnd = bEdge + bottom.w - 1;
  // The rim below the band starts under the upper room's floor (or the stretch out of it), the face above it over wall;
  // at the bottom the rim ends over wall and the face over the lower room's floor (or the stretch into it).
  const lo = Math.max(1 - width, 3 - top.w);
  const hi = Math.min(bEdge, bEnd - width - 1) - 2 * (rows - 1);
  return lo > hi ? null : { rows, dir, bEdge, lo, hi };
}

/** Where a corridor down the slant between two rooms may start its band (see planSlantedRun); none if they are too close. */
export function slantedStarts(top: RoomData, bottom: RoomData, width: number): number[] {
  const frame = slantFrame(top, bottom, width);
  const starts: number[] = [];
  for (let x0 = frame?.lo ?? 0; frame && x0 <= frame.hi; x0++) starts.push(x0);
  return starts;
}

/**
 * A corridor `width` tiles wide from the upper room's bottom rows to the lower room's top rows, running down the slant
 * between them: a stretch straight out of the upper room's side, a band moving two tiles across for every tile down
 * through the rows between the rooms (slanted walls either side: a face above, a rim below), and a stretch straight into
 * the lower room. Worked in a frame where the lower room lies to the right of the upper one (columns counted out from
 * the upper room's last column on that side), then mirrored if it lies to the left; `x0` (one of slantedStarts) is where
 * the band starts in that frame.
 */
export function planSlantedRun(top: RoomData, bottom: RoomData, width: number, x0: number): SlantedRun | null {
  const frame = slantFrame(top, bottom, width);
  if (!frame || x0 < frame.lo || x0 > frame.hi) return null;
  const { rows, dir, bEdge } = frame;
  const real = (cx: number): number => (dir > 0 ? top.x + top.w - 1 + cx : top.x - cx);
  const low: SlopeCorner = dir > 0 ? 'sw' : 'se';
  const high: SlopeCorner = dir > 0 ? 'ne' : 'nw';
  const run: SlantedRun = { straight: [], band: [], slopes: [] };
  const straight = (cx: number, y: number): void => { run.straight.push([real(cx), y]); };
  const band = (cx: number, y: number): void => { run.band.push([real(cx), y]); };
  const slope = (cx: number, y: number, corner: SlopeCorner, major: boolean): void => { run.slopes.push([real(cx), y, { corner, major }]); };
  // Out of the upper room along its last two rows, to the band's first row.
  forEachTile(1, top.y + top.h - 2, x0 + width - 1, top.y + top.h - 1, straight);
  for (let i = 0; i < rows; i++) {
    const y = top.y + top.h + i;
    const from = x0 + 2 * i;
    forEachTile(from, y, from + width - 1, y, band);
    slope(from - 2, y, low, true);
    slope(from - 1, y, low, false);
    slope(from + width, y, high, false);
    slope(from + width + 1, y, high, true);
  }
  // From the band's last row into the lower room along its first two rows.
  forEachTile(x0 + 2 * (rows - 1), bottom.y, bEdge - 1, bottom.y + 1, straight);
  return run;
}

/** Whether a tile lies inside a room's rectangle. */
function inRoom(room: RoomData, x: number, y: number): boolean {
  return x >= room.x && y >= room.y && x < room.x + room.w && y < room.y + room.h;
}

/**
 * Whether a slanted corridor can be carved as planned: its band and the slopes along it take only wall, with nothing
 * round them but wall, its own tiles or the two rooms it joins (it grazes no other room or corridor); its straight
 * stretches may cross a corridor already there, but no slant.
 */
export function slantedRunFits(site: SlantSite, run: SlantedRun, a: RoomData, b: RoomData): boolean {
  const W = site.level.width;
  const planned = new Set<number>();
  for (const [x, y] of run.straight) planned.add(x + y * W);
  for (const [x, y] of run.band) planned.add(x + y * W);
  for (const [x, y] of run.slopes) planned.add(x + y * W);
  const clear = (x: number, y: number): boolean => planned.has(x + y * W) || inRoom(a, x, y) || inRoom(b, x, y) || site.isWall(x, y);
  const unsloped = (x: number, y: number): boolean => !site.level.slopes.has(x + y * W);
  const isolated = ([x, y]: readonly [number, number, ...unknown[]]): boolean =>
    site.isWall(x, y) && unsloped(x, y) && !someTile(x - 1, y - 1, x + 1, y + 1, (nx, ny) => !clear(nx, ny));
  const crossing = ([x, y]: readonly [number, number]): boolean => !someTile(x - 1, y - 1, x + 1, y + 1, (nx, ny) => !unsloped(nx, ny));
  // A face on the slant rises two tiles: wall must stand behind it, not a floor it would be drawn over. Under a rim on
  // the slant the dark runs three tiles deep, so no face of the floor beyond (two tiles tall) rises into the dark that
  // covers the feet behind the rim.
  const opened = new Set<number>();
  for (const [x, y] of [...run.straight, ...run.band]) opened.add(x + y * W);
  const solid = (wx: number, wy: number): boolean => site.isWall(wx, wy) && !opened.has(wx + wy * W);
  const backed = ([x, y, slope]: readonly [number, number, Slope]): boolean => (isSouthSlope(slope)
    ? !someTile(x, y + 1, x, y + FACE_ROWS + 1, (wx, wy) => !solid(wx, wy))
    : !someTile(x, y - FACE_ROWS, x, y - 1, (wx, wy) => !solid(wx, wy)));
  return run.band.every(isolated) && run.slopes.every(isolated) && run.slopes.every(backed) && run.straight.every(crossing);
}
