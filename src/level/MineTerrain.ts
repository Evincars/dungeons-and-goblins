import type { Level } from './Level';
import { mineBaseTone, mineFloorSource, mineGroundBase } from './MineGround';
import type { TerrainPiece } from './TerrainAutotile';
import { TileType, TILE_HEIGHT, TILE_WIDTH, UNDER_WALL_INSET } from './TileType';
import { forEachTile, tileHash } from './Grid';
import {
  BRINK_LINE, CLIFF_FADES, CLIFF_ROWS, FACE_ROWS, FACE_SHADOW, MINE_BRINK_E, MINE_BRINK_KNOTS, MINE_BRINK_S, MINE_BRINK_W,
  MINE_CLIFFS, MINE_CUT_FACES, MINE_CUT_SLANT_FACES, MINE_DECOR, MINE_FACE_END_LEFT, MINE_FACE_END_RIGHT, MINE_FACES,
  MINE_FILL, MINE_GROUND, MINE_KNOT, MINE_RIM_E, MINE_RIM_N, MINE_RIM_SLANT, MINE_RIM_W, MINE_SLANT_FACES,
  MINE_SUNKEN_POSTS, RIM_DEPTH, RIM_INSET, THORN_H, holeArtOffset,
} from './MineTiles';
import type { CliffFade } from './MineTiles';
import { mineHole } from './PitShapes';
import type { Pit } from './PitShapes';
import type { IsoRect, SlantStrip } from './IsoTiles';
import type { Slope } from './Slopes';
import { isSouthSlope } from './Slopes';
import { faceDepth, slantFootY, slantRimDepth } from './IsoTerrain';
import { SOUTH_WALL_RAISE } from './Theme';

/**
 * Autotiles the forgotten mines (Theme 'mines') on its 32 px tiles, from the art mapped in MineTiles.ts, as the
 * isometric castle is (IsoTerrain.ts), but with the caves' own rock:
 * - floor: its tone's earth, with patches of other earth lying on it in ragged ellipses (a FloorZone with `patch`), the
 *   tones running into each other along ragged edges that wander across the tiles (MineGround.ts);
 * - rock is dark with faint cobbles (its pieces cut by world position, so they run on whatever lies between them),
 *   rimmed with rings of stone on every side floor touches, the rims turning round its corners;
 * - a wall with floor below it is the foot of a tall rock face (its stone four tiles high under the black rock top),
 *   cut short where the rock behind it is thinner (a corridor or room close behind): its lip kept, the rim of the rock
 *   behind it over the cut;
 * - a wall cutting a north corner off on the slant shows the face on the slant, a south one the rim along it;
 * - a chasm's brinks are pebbles, dark thorns standing over the floor along its north one, from which a cliff of grey-blue
 *   cobbles falls away into the black, old pit props rising out of it now and then;
 * - a hole in the floor (a pit of shape 'hole') is its art from the set's decorations, centred on its tiles.
 * Faces stand behind whoever is in front of them; the rims along a room's south side and a chasm's north edge are
 * drawn over the feet of whoever steps up to them, as in the other themes.
 */

/** Ground under foot, a wall (or off the map), a chasm, or a slanted wall's tile. */
type Cell = 'ground' | 'wall' | 'chasm' | 'slope';

/** One chasm rim tile in this many (by hash), where the rim runs on both sides, has a pit prop rising under it. */
const POST_EVERY = 4;
/** The dark under it must run this many tiles deep; the post's top is this far below the rim's top. */
const POST_DEPTH = 3;
const POST_TOP = 6;
/** A post stands up to this far either way off its tile's middle (by hash). */
const POST_JITTER = 6;
/** Where two runs of rim meet at a corner, the ring laid over the joint sits this far in from it along each side. */
const KNOT_IN = 1;

/** A piece of the walls' sheet: r (or the h rows of it from sy, the w columns from sx) at (dx, dy), sorted at z if given. */
function piece(r: IsoRect, dx: number, dy: number, h = r.h, z?: number, sy = r.y, sx = r.x, w = r.w): TerrainPiece {
  return z === undefined ? { dx, dy, sx, sy, w, h } : { dx, dy, sx, sy, w, h, z };
}

class MineTerrainBuilder {
  private readonly floors: TerrainPiece[] = [];
  private readonly walls: TerrainPiece[] = [];
  private readonly over: TerrainPiece[] = [];
  private readonly raise: number;

  constructor(private readonly level: Level) {
    this.raise = SOUTH_WALL_RAISE[level.theme];
  }

  build(): TerrainPiece[] {
    const { level } = this;
    forEachTile(0, 0, level.width - 1, level.height - 1, this.addTile);
    for (const pit of level.pits) this.addHole(pit);
    return [...this.floors, ...this.walls, ...this.over];
  }

  /** A hole in the floor: its art centred on its tiles, over the ground they are floored with. */
  private addHole(pit: Pit): void {
    const hole = mineHole(pit);
    if (!hole) return;
    const at = holeArtOffset(hole);
    const { art } = hole;
    this.walls.push({ dx: pit.x * TILE_WIDTH + at.x, dy: pit.y * TILE_HEIGHT + at.y, sx: art.x, sy: art.y, w: art.w, h: art.h, sheet: MINE_DECOR });
  }

  // ── What a tile is ───────────────────────────────────────────────────────────

  private cell(tx: number, ty: number): Cell {
    const tile = this.level.getTile(tx, ty);
    if (!tile) return 'wall';
    if (this.level.slopes.has(tx + ty * this.level.width)) return 'slope';
    if (tile.type === TileType.Wall || tile.type === TileType.BreakableWall) return 'wall';
    return this.level.isChasm(tx, ty) ? 'chasm' : 'ground';
  }

  private ground(tx: number, ty: number): boolean {
    return this.cell(tx, ty) === 'ground';
  }

  /** The bottom row of a face: a wall with ground right below it. */
  private faceFoot(tx: number, ty: number): boolean {
    return this.cell(tx, ty) === 'wall' && this.ground(tx, ty + 1);
  }

  private northSlope(tx: number, ty: number): boolean {
    const slope = this.level.slopes.get(tx + ty * this.level.width);
    return !!slope && !isSouthSlope(slope);
  }

  /** The depth of the face (straight or slanted) drawn over a wall tile from below, or -1 if none reaches it. */
  private faceBelow(tx: number, ty: number): number {
    for (let k = 1; k < FACE_ROWS; k++) {
      if (this.northSlope(tx, ty + k)) return faceDepth(ty + k);
      if (this.cell(tx, ty + k) !== 'wall') return -1;
      if (this.faceFoot(tx, ty + k)) return faceDepth(ty + k);
    }
    return -1;
  }

  /** How many rows of rock stand from row ty upward (ty itself counted when `self`), up to FACE_ROWS. */
  private rockAbove(tx: number, ty: number, self: boolean): number {
    let rows = self ? 1 : 0;
    while (rows < FACE_ROWS && this.cell(tx, ty - rows - (self ? 0 : 1)) === 'wall') rows++;
    return rows;
  }

  // ── Per tile ─────────────────────────────────────────────────────────────────

  private readonly addTile = (tx: number, ty: number): void => {
    const cell = this.cell(tx, ty);
    if (cell === 'ground' || cell === 'slope') this.addFloor(tx, ty);
    else if (cell === 'wall') this.addFloorUnderWall(tx, ty);
    if (cell === 'slope') this.addSlant(tx, ty);
    else if (cell === 'chasm') this.addChasm(tx, ty);
    else if (cell === 'wall') this.addWall(tx, ty);
  };

  private addWall(tx: number, ty: number): void {
    const foot = this.faceFoot(tx, ty);
    const covered = foot ? faceDepth(ty) : this.faceBelow(tx, ty);
    // The top of a face cut short: the rock behind it, its rim, drawn first so the face's lip lies over its dark.
    if (covered >= 0 && this.ground(tx, ty - 1)) this.addRockTop(tx, ty, covered, (ty + 1) * TILE_HEIGHT);
    if (foot) this.addFace(tx, ty);
    // Under a face, the rock's dark (showing only where the face's art leaves a gap, as over its top row's first pixels).
    if (covered >= 0 && !this.ground(tx, ty - 1)) this.fill(tx * TILE_WIDTH, ty * TILE_HEIGHT, (tx + 1) * TILE_WIDTH, (ty + 1) * TILE_HEIGHT);
    if (covered >= 0) return;
    // A room's south edge is drawn over whoever steps up to it; any other rock top lies under everyone.
    this.addRockTop(tx, ty, this.ground(tx, ty - 1) ? (ty + 1) * TILE_HEIGHT : undefined, (ty + 1) * TILE_HEIGHT);
  }

  private addFloor(tx: number, ty: number): void {
    this.floors.push(...mineGroundBase(this.level, tx, ty));
  }

  /** A tile's earth (h rows of it from its top) in a tone, laid by position so it runs on. */
  private earth(tx: number, ty: number, tone: number, h: number): TerrainPiece {
    const { sx, sy } = mineFloorSource(this.level, tx, ty, tone);
    return { dx: tx * TILE_WIDTH, dy: ty * TILE_HEIGHT, sx, sy, w: TILE_WIDTH, h, sheet: MINE_GROUND, floor: true };
  }

  /**
   * The earth under a wall tile: run on under a south wall from the room north of it (what shows where the wall clears
   * over someone), and under a rock top floor touches at its side (showing between the rings of its rim).
   */
  private addFloorUnderWall(tx: number, ty: number): void {
    const slope = this.level.slopes.get(tx + (ty - 1) * this.level.width);
    const southSlant = !!slope && isSouthSlope(slope);
    const beside = this.faceOver(tx, ty) ? null : this.besideFloor(tx, ty);
    if (!southSlant && !this.ground(tx, ty - 1) && beside === null) return;
    const reach = slope && southSlant ? Math.min(TILE_HEIGHT, slantRimDepth(slope, tx, ty - 1) - ty * TILE_HEIGHT) : TILE_HEIGHT;
    const h = beside !== null ? TILE_HEIGHT : reach - UNDER_WALL_INSET;
    if (h <= 0) return;
    const from = beside ?? [tx, ty - 1];
    this.floors.push(this.earth(tx, ty, mineBaseTone(this.level, from[0], from[1]), h));
  }

  /** Whether a face stands over a wall tile (its foot, or a face rising from below reaches it). */
  private faceOver(tx: number, ty: number): boolean {
    return this.faceFoot(tx, ty) || this.faceBelow(tx, ty) >= 0;
  }

  /** The floor tile beside a wall tile (west, east, or at a corner) whose earth shows round its rim, if any. */
  private besideFloor(tx: number, ty: number): [number, number] | null {
    for (const [ox, oy] of NEIGHBOURS) {
      if (this.ground(tx + ox, ty + oy)) return [tx + ox, ty + oy];
    }
    return null;
  }

  // ── Rock tops ────────────────────────────────────────────────────────────────

  /**
   * The rock's dark over a box, cut from the fill by world position so it runs on from every other piece of it, in tile
   * windows; sorted at z (drawn over whoever stands behind it) or under everyone.
   */
  private fill(x0: number, y0: number, x1: number, y1: number, z?: number): void {
    const out = z === undefined ? this.walls : this.over;
    for (let y = y0; y < y1; y = nextTileEdge(y, TILE_HEIGHT, y1)) {
      for (let x = x0; x < x1; x = nextTileEdge(x, TILE_WIDTH, x1)) {
        const w = nextTileEdge(x, TILE_WIDTH, x1) - x;
        const h = nextTileEdge(y, TILE_HEIGHT, y1) - y;
        out.push(piece(MINE_FILL, x, y, h, z, MINE_FILL.y + mod(y, TILE_HEIGHT), MINE_FILL.x + mod(x, TILE_WIDTH), w));
      }
    }
  }

  /**
   * A rock top's tile, down to `bottom`: its dark, and its rim of rings along each side floor touches (the north one
   * raised over the floor a little, SOUTH_WALL_RAISE), turning round where two sides meet and knotted where the floor
   * only touches a corner.
   */
  private addRockTop(tx: number, ty: number, z: number | undefined, bottom: number): void {
    const dx = tx * TILE_WIDTH;
    const north = this.ground(tx, ty - 1);
    const west = this.ground(tx - 1, ty);
    const east = this.ground(tx + 1, ty);
    const top = ty * TILE_HEIGHT - (north ? this.raise : 0);
    const out = z === undefined ? this.walls : this.over;
    const left = dx + (west ? RIM_INSET : 0);
    const right = dx + TILE_WIDTH - (east ? RIM_INSET : 0);
    this.fill(left, top + (north ? RIM_INSET : 0), right, bottom, z);
    const cutW = west && north ? RIM_DEPTH : 0;
    const cutE = east && north ? RIM_DEPTH : 0;
    if (north) {
      const rim = MINE_RIM_N[mod(tx, MINE_RIM_N.length)];
      out.push(piece(rim, dx + cutW, top, rim.h, z, rim.y, rim.x + cutW, rim.w - cutW - cutE));
    }
    if (west) this.sideRim(out, MINE_RIM_W[mod(-ty, MINE_RIM_W.length)], dx, top + cutW, bottom, z);
    if (east) this.sideRim(out, MINE_RIM_E[mod(ty, MINE_RIM_E.length)], dx + TILE_WIDTH - RIM_DEPTH, top + cutE, bottom, z);
    if (west && north) out.push(piece(MINE_KNOT, dx + KNOT_IN, top + KNOT_IN, MINE_KNOT.h, z));
    if (east && north) out.push(piece(MINE_KNOT, dx + TILE_WIDTH - MINE_KNOT.w - KNOT_IN, top + KNOT_IN, MINE_KNOT.h, z));
    this.cornerKnots(out, tx, ty, { north, west, east }, z);
  }

  /** A west or east rim from `top` down to `bottom`, in strips a tile tall (its art repeats every tile). */
  private sideRim(out: TerrainPiece[], rim: IsoRect, dx: number, top: number, bottom: number, z: number | undefined): void {
    for (let y = top; y < bottom; y += rim.h) {
      out.push(piece(rim, dx, y, Math.min(rim.h, bottom - y), z, rim.y + mod(y, rim.h)));
    }
  }

  /** Where floor only touches a rock top's north corner (the rims of the rock either side meet there), a knot of rim. */
  private cornerKnots(out: TerrainPiece[], tx: number, ty: number, sides: { north: boolean; west: boolean; east: boolean }, z: number | undefined): void {
    if (sides.north) return;
    const dx = tx * TILE_WIDTH;
    const dy = ty * TILE_HEIGHT;
    const half = Math.floor(MINE_KNOT.w / 2);
    if (!sides.west && this.ground(tx - 1, ty - 1)) out.push(piece(MINE_KNOT, dx - half + RIM_INSET / 2, dy - half + RIM_INSET / 2, MINE_KNOT.h, z));
    if (!sides.east && this.ground(tx + 1, ty - 1)) out.push(piece(MINE_KNOT, dx + TILE_WIDTH - half - RIM_INSET / 2, dy - half + RIM_INSET / 2, MINE_KNOT.h, z));
  }

  // ── Faces ────────────────────────────────────────────────────────────────────

  /**
   * A face from its foot tile up, as tall as the rock behind it allows (cut short, its lip kept, under the rim of whatever
   * lies behind), the rock's outline down whichever end of it meets the floor. Drawn among the entities, in front of
   * whoever stands behind it.
   */
  private addFace(tx: number, ty: number): void {
    const dx = tx * TILE_WIDTH;
    const z = faceDepth(ty);
    const rows = this.rockAbove(tx, ty, true);
    const art = rows >= FACE_ROWS ? MINE_FACES[mod(tx, MINE_FACES.length)] : MINE_CUT_FACES[rows - 1][mod(tx, MINE_FACES.length)];
    const dy = (ty + 1) * TILE_HEIGHT + FACE_SHADOW - art.h;
    this.over.push(piece(art, dx, dy, art.h, z));
    if (this.faceEnds(tx - 1, ty)) this.addFaceEnd(MINE_FACE_END_LEFT, dx, dy, art.h, z);
    if (this.faceEnds(tx + 1, ty)) this.addFaceEnd(MINE_FACE_END_RIGHT, dx + TILE_WIDTH - MINE_FACE_END_RIGHT.w, dy, art.h, z);
  }

  /**
   * Whether a face ends against the tile beside its foot: no face runs on into it, straight or slanted (a slanted face
   * runs on from the slope tile beside the foot, or from the one under it).
   */
  private faceEnds(tx: number, ty: number): boolean {
    return !this.faceFoot(tx, ty) && this.cell(tx, ty) !== 'slope' && !this.northSlope(tx, ty + 1);
  }

  /** The rock's outline down a face's end, as tall as the face (its lower part when the face is cut short). */
  private addFaceEnd(art: IsoRect, dx: number, dy: number, h: number, z: number): void {
    this.over.push(piece(art, dx, dy, h, z, art.y + art.h - h));
  }

  // ── Chasms ───────────────────────────────────────────────────────────────────

  /**
   * A chasm tile: where floor lies north, its pebbles, thorns over the floor and the cliff falling away under it (as
   * deep as the chasm runs), drawn over the feet of whoever stands at its edge; pebbles along its other brinks, knotted
   * where two brinks meet.
   */
  private addChasm(tx: number, ty: number): void {
    const dx = tx * TILE_WIDTH;
    const dy = ty * TILE_HEIGHT;
    const north = this.ground(tx, ty - 1);
    const west = this.ground(tx - 1, ty);
    const east = this.ground(tx + 1, ty);
    const south = this.ground(tx, ty + 1);
    const z = north ? (ty + 1) * TILE_HEIGHT : undefined;
    const out = north ? this.over : this.walls;
    if (north) {
      const rows = this.chasmBelow(tx, ty, CLIFF_ROWS);
      const cliff = MINE_CLIFFS[CLIFF_FADES.indexOf(this.cliffFade(tx, ty))][mod(tx, MINE_CLIFFS[0].length)];
      this.over.push(piece(cliff, dx, dy - THORN_H, THORN_H + rows * TILE_HEIGHT, z));
      this.addPost(tx, ty, z);
    }
    if (south) {
      const brink = MINE_BRINK_S[mod(tx, MINE_BRINK_S.length)];
      this.walls.push(piece(brink, dx, dy + TILE_HEIGHT - BRINK_LINE, brink.h));
    }
    if (west) this.brinkSide(out, MINE_BRINK_W[mod(ty, MINE_BRINK_W.length)], dx - BRINK_LINE, dy, z);
    if (east) this.brinkSide(out, MINE_BRINK_E[mod(ty, MINE_BRINK_E.length)], dx + TILE_WIDTH - MINE_BRINK_E[0].w + BRINK_LINE, dy, z);
    this.brinkKnots(out, tx, ty, { north, west, east, south }, z);
  }

  private brinkSide(out: TerrainPiece[], art: IsoRect, dx: number, dy: number, z: number | undefined): void {
    out.push(piece(art, dx, dy, art.h, z));
  }

  /** A knot of pebbles at each corner of a chasm tile where two brinks meet, or where floor only touches the corner. */
  private brinkKnots(out: TerrainPiece[], tx: number, ty: number, sides: { north: boolean; west: boolean; east: boolean; south: boolean }, z: number | undefined): void {
    for (const [ox, oy] of CORNERS) {
      const alongX = ox < 0 ? sides.west : sides.east;
      const alongY = oy < 0 ? sides.north : sides.south;
      const meets = alongX && alongY;
      const touches = !alongX && !alongY && this.ground(tx + ox, ty + oy);
      if (!meets && !touches) continue;
      const knot = MINE_BRINK_KNOTS[tileHash(tx + ox, ty + oy) % MINE_BRINK_KNOTS.length];
      const cx = (tx + (ox > 0 ? 1 : 0)) * TILE_WIDTH;
      const cy = (ty + (oy > 0 ? 1 : 0)) * TILE_HEIGHT;
      out.push(piece(knot, cx - knot.w / 2, cy - knot.h / 2, knot.h, z));
    }
  }

  /** Which sides of the cliff under a north brink fade out: those where the dark beside it has no cliff of its own. */
  private cliffFade(tx: number, ty: number): CliffFade {
    const left = this.cell(tx - 1, ty) === 'chasm' && !this.underCliff(tx - 1, ty);
    const right = this.cell(tx + 1, ty) === 'chasm' && !this.underCliff(tx + 1, ty);
    if (left && right) return 'both';
    if (left) return 'left';
    return right ? 'right' : 'none';
  }

  /** Whether a chasm tile lies within CLIFF_ROWS under a north brink (its cliff falls past it). */
  private underCliff(tx: number, ty: number): boolean {
    for (let k = 0; k < CLIFF_ROWS; k++) {
      if (this.ground(tx, ty - k - 1)) return true;
      if (this.cell(tx, ty - k - 1) !== 'chasm') return false;
    }
    return false;
  }

  /** How many chasm rows run down from (tx, ty), up to `most`. */
  private chasmBelow(tx: number, ty: number, most: number): number {
    let rows = 0;
    while (rows < most && this.cell(tx, ty + rows) === 'chasm') rows++;
    return rows;
  }

  /** Now and then, under a chasm's north rim running on both sides with the dark deep below, an old pit prop. */
  private addPost(tx: number, ty: number, z: number | undefined): void {
    const v = tileHash(tx, ty);
    const runs = (x: number): boolean => this.cell(x, ty) === 'chasm' && this.ground(x, ty - 1);
    if (v % POST_EVERY !== 0 || !runs(tx - 1) || !runs(tx + 1)) return;
    const depth = this.chasmBelow(tx, ty, POST_DEPTH + 2);
    if (depth < POST_DEPTH) return;
    const post = MINE_SUNKEN_POSTS[(v >>> 8) % MINE_SUNKEN_POSTS.length];
    const shift = ((v >>> 4) % (POST_JITTER * 2 + 1)) - POST_JITTER;
    this.over.push(piece(post, tx * TILE_WIDTH + shift, ty * TILE_HEIGHT + POST_TOP, Math.min(post.h, depth * TILE_HEIGHT - POST_TOP), z));
  }

  // ── Slants ───────────────────────────────────────────────────────────────────

  /**
   * A slanted wall's tile: its column of the slanted face (north corners), as tall as the rock behind it allows, or of
   * the rim along the slant (south), drawn over whoever stands behind it with the rock's dark under it as deep as feet
   * reach.
   */
  private addSlant(tx: number, ty: number): void {
    const slope = this.level.slopes.get(tx + ty * this.level.width);
    if (!slope) return;
    const footLeft = slantFootY(slope, tx, ty, false);
    const dx = tx * TILE_WIDTH;
    if (!isSouthSlope(slope)) {
      this.addSlantFace(slope, tx, ty, footLeft);
      return;
    }
    const strips = MINE_RIM_SLANT[slope.corner === 'sw' ? 'sw' : 'se'];
    const strip: SlantStrip = strips[mod(tx, strips.length)];
    const top = footLeft - strip.footLeft - this.raise;
    const z = slantRimDepth(slope, tx, ty);
    this.over.push(piece(strip, dx, top, strip.h, z));
    this.fill(dx, top + strip.h, dx + TILE_WIDTH, z, z);
  }

  private addSlantFace(slope: Slope, tx: number, ty: number, footLeft: number): void {
    const corner = slope.corner === 'nw' ? 'nw' : 'ne';
    const rows = this.rockAbove(tx, ty, false) + 1;
    const strips = rows >= FACE_ROWS ? MINE_SLANT_FACES[corner] : MINE_CUT_SLANT_FACES[rows - 1][corner];
    const strip: SlantStrip = strips[mod(tx, strips.length)];
    this.over.push(piece(strip, tx * TILE_WIDTH, footLeft - strip.footLeft, strip.h, faceDepth(ty)));
  }
}

/** The sides and corners of a tile, in the order their floor is looked for under a rock top's rim. */
const NEIGHBOURS = [[-1, 0], [1, 0], [-1, -1], [1, -1]] as const;
/** A tile's four corners, as the offsets of the tile diagonally beyond each. */
const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const;

/** n mod m, never negative. */
function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** The next multiple of `step` after v, but no further than `end`. */
function nextTileEdge(v: number, step: number, end: number): number {
  return Math.min(end, (Math.floor(v / step) + 1) * step);
}

/** Every piece of a mine level's terrain, floors first. */
export function buildMineTerrain(level: Level): TerrainPiece[] {
  return new MineTerrainBuilder(level).build();
}
