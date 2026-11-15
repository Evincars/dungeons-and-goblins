import type { Level, StairDir } from '../Level';
import { FLOOR_TONES, STAIRS_PASSAGE, STAIRS_ROWS, STAIRS_SPAN } from '../Level';
import { TileType, TILE_HEIGHT, TILE_WIDTH } from '../TileType';
import { forEachTile, someTile } from '../Grid';
import type { SlopeCorner } from '../Slopes';
import { cutSlantCorner, slantFits, slantTile } from './Slants';
import type { SlantCorner, SlantSite } from './Slants';
import { FRONT_DECOR_SMALL, ISO_DECOR, SLANT_DECOR } from '../IsoTiles';
import type { IsoDecor } from '../IsoTiles';
import {
  ISO_BOOKS, ISO_BRAZIERS, ISO_BROKEN_COLUMNS, ISO_CANDLES, ISO_LECTERNS, ISO_MOSS_BITS, ISO_PLATES, ISO_POTS, ISO_ROUND_COLUMNS,
  ISO_SLENDER_COLUMNS, ISO_SQUARE_COLUMNS, ISO_STAINS, ISO_WRECKS, PROPS,
} from '../Props';
import type { PropDef, PropKind, PropPlacement } from '../Props';
import type { Keep, RoomData, TileChange, TilePos } from './DungeonBuilder';

/**
 * Dresses the rooms of the isometric castle (Theme 'castle2'), on the layout DungeonBuilder carved: corners cut off on
 * the slant (long slants in big rooms), chasms with a bridge over them, pits sunk in the floor, halls of great columns,
 * libraries; decor set into the faces (windows, statues, shelves, crystal panes, a door), kept off their ends; crystal
 * braziers and candles to light them, pots, books and wreckage, stains and moss on the floor; and stairs in the straight
 * corridors between the rooms. Every change that could cut a way off goes through `keep`.
 */

/** What the builder lends the dresser: its level, its seeded generator and its ways of setting things down. */
export type IsoSite = SlantSite & {
  rng(): number;
  randInt(min: number, max: number): number;
  isFloor(tx: number, ty: number): boolean;
  placeSolid(cells: Array<[number, number]>, kinds: PropKind[], props: PropPlacement[], keep: Keep): boolean;
  scatterSolid(room: RoomData, open: TilePos[], kinds: readonly PropKind[], props: PropPlacement[], keep: Keep): void;
  scatterLoose(open: TilePos[], kinds: readonly PropKind[], count: number, props: PropPlacement[]): void;
  shuffledFreeTiles(room: RoomData): TilePos[];
  urnsAlongWalls(room: RoomData, count: number, props: PropPlacement[], keep: Keep, kinds: readonly PropKind[]): void;
  pickProp(kinds: readonly PropKind[]): PropKind;
};

type RoomKind = 'chasm' | 'sinkhole' | 'hall' | 'library' | 'ruin' | 'plain';

/** How a room is dressed, by a roll: each kind up to its share (if the room is big enough), else plain. */
const KIND_SHARES: ReadonlyArray<[RoomKind, number]> = [
  ['chasm', 0.3], ['sinkhole', 0.46], ['hall', 0.66], ['library', 0.8], ['ruin', 0.92],
];
/** The tones a room's floor is laid in (dark slate, oxblood, teal), by weight. */
const TONE_WEIGHTS = [0.4, 0.38, 0.22];
/**
 * Chance a north corner is cut off on the slant, and a south one. A slant is as deep as the room allows, up to
 * SLANT_DEPTH_MAX tiles (twice that across), or a tile less.
 */
const NORTH_SLANT_CHANCE = 0.8;
const SOUTH_SLANT_CHANCE = 0.5;
const SLANT_DEPTH_MAX = 3;
/** A face is two tiles tall. */
const FACE_ROWS = 2;
/**
 * A chasm across a room is 2 to 4 tiles deep, with this much floor kept above and below it, and one or two bridges.
 * Where a corridor comes in at the side, a ledge a tile wide runs along each wall past it (and a bridge only by chance).
 */
const CHASM_DEPTH = [2, 4] as const;
const LEDGE_BRIDGE_CHANCE = 0.5;
const CHASM_MIN_SPAN = 4;
const CHASM_FLOOR_ABOVE = 2;
const CHASM_FLOOR_BELOW = 2;
const CHASM_MIN_W = 6;
const TWO_BRIDGES_W = 13;
/** A pit sunk in the floor: this big across and down, keeping this many tiles from the walls, found in a few tries. */
const SINKHOLE_W = [2, 5] as const;
const SINKHOLE_H = [2, 4] as const;
const SINKHOLE_MARGIN = 1;
const SINKHOLE_TRIES = 6;
/** Halls: great columns every few tiles, in rows a tile or two in from the long walls. */
const HALL_MIN_W = 8;
const HALL_MIN_H = 7;
const COLUMN_STEP = 3;
const COLUMN_INSET_X = 2;
const COLUMN_INSET_Y = 2;
/** A raised dais of another tone in a plain room or hall: its chance, and how far in from the walls it stays. */
const DAIS_CHANCE = 0.4;
const DAIS_INSET = 2;
const DAIS_MIN = 3;
/** Along a north face: the chance a spot gets decor, and a brazier; braziers keep this many tiles apart. */
const FACE_DECOR_CHANCE = 0.5;
const FACE_BRAZIER_CHANCE = 0.45;
const BRAZIER_GAP = 3;
/**
 * Chance a slanted face gets decor, and of a straight face's decor being the big crystal pane or a door. Decor keeps
 * DECOR_END_GAP tiles from the ends of its face, so nothing set into it reaches round a corner.
 */
const SLANT_DECOR_CHANCE = 0.85;
const CRYSTAL_CHANCE = 0.12;
const DOOR_CHANCE = 0.06;
const DECOR_END_GAP = 1;
/** Chance a candle (or a cluster) stands in front of a window or statue, and how many more burn about the room. */
const DECOR_CANDLE_CHANCE = 0.45;
const ROOM_CANDLES = [1, 3] as const;
/** Pots along the walls, wreckage, books and lecterns in a library, broken columns in a ruin. */
const ROOM_POTS = [1, 3] as const;
const LIBRARY_LECTERNS = [2, 3] as const;
const LIBRARY_BOOKS = [2, 5] as const;
const RUIN_COLUMNS = [2, 4] as const;
const RUIN_WRECKS = [2, 4] as const;
/** Stains and moss on the floor: how many, and how many spots are tried for each. */
const ROOM_STAINS = [0, 2] as const;
const ROOM_MOSS = [2, 5] as const;
const FLAT_TRIES = 12;
/**
 * Stairs in the corridors: a straight stretch of corridor two tiles wide, walled both sides, at least STAIRS_RUN_MIN
 * tiles long, gets a flight in its middle; up to STAIRS_PER_LEVEL flights a level, the stretches picked at random.
 */
const STAIRS_RUN_MIN = 5;
const STAIRS_PER_LEVEL = 4;

type Corner = SlantCorner;

function isSolid(kind: PropKind): boolean {
  const def: PropDef = PROPS[kind];
  return !!def.solid;
}

export class IsoDresser {
  constructor(private readonly site: IsoSite) {}

  private get level(): Level {
    return this.site.level;
  }

  private countIn([min, max]: readonly [number, number]): number {
    return this.site.randInt(min, max);
  }

  private pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.site.rng() * list.length)];
  }

  /** A floor tone by TONE_WEIGHTS. */
  private pickTone(): number {
    let roll = this.site.rng();
    for (let tone = 0; tone < FLOOR_TONES; tone++) {
      roll -= TONE_WEIGHTS[tone];
      if (roll < 0) return tone;
    }
    return 0;
  }

  /** A tone other than `tone`. */
  private otherTone(tone: number): number {
    return (tone + 1 + Math.floor(this.site.rng() * (FLOOR_TONES - 1))) % FLOOR_TONES;
  }

  // ── A room ───────────────────────────────────────────────────────────────────

  /** Dresses one dungeon room: its tone, its slants, its kind, its faces, its lights, its clutter. */
  dressRoom(room: RoomData, props: PropPlacement[], keep: Keep): void {
    const tone = this.pickTone();
    this.level.floorZones.push({ x: room.x, y: room.y, w: room.w, h: room.h, tone });
    const corners = this.cutCorners(room, keep);
    const kind = this.buildKind(room, props, keep);
    if ((kind === 'plain' || kind === 'hall') && this.site.rng() < DAIS_CHANCE) this.dais(room, tone);
    this.decorateNorthFace(room, room.y, kind === 'library', props, keep);
    for (const c of corners) this.decorateSlant(c, room);
    this.clutter(room, kind, props, keep);
  }

  /**
   * Builds the room's kind: the one the roll picks, or if the room has no room for it, the kinds after it in turn (so a
   * small room still gets something); a roll past every share leaves it plain.
   */
  private buildKind(room: RoomData, props: PropPlacement[], keep: Keep): RoomKind {
    const roll = this.site.rng();
    const first = KIND_SHARES.findIndex(([, share]) => roll < share);
    if (first < 0) return 'plain';
    for (let i = 0; i < KIND_SHARES.length; i++) {
      const kind = KIND_SHARES[(first + i) % KIND_SHARES.length][0];
      if (this.build(kind, room, props, keep)) return kind;
    }
    return 'plain';
  }

  private build(kind: RoomKind, room: RoomData, props: PropPlacement[], keep: Keep): boolean {
    switch (kind) {
      case 'chasm': return this.chasm(room, keep);
      case 'sinkhole': return this.sinkhole(room, keep);
      case 'hall': return this.hall(room, props, keep);
      case 'library': return true;
      case 'ruin': return true;
      default: return false;
    }
  }

  // ── Slanted corners ──────────────────────────────────────────────────────────

  /** Cuts the room's corners off on the slant, each by its chance, as deep as it allows; returns the corners cut. */
  private cutCorners(room: RoomData, keep: Keep): Corner[] {
    let deepest = SLANT_DEPTH_MAX;
    while (deepest > 1 && !slantFits(room, deepest)) deepest--;
    const cut: Corner[] = [];
    for (const corner of ['nw', 'ne', 'sw', 'se'] satisfies SlopeCorner[]) {
      const chance = corner === 'nw' || corner === 'ne' ? NORTH_SLANT_CHANCE : SOUTH_SLANT_CHANCE;
      const depth = this.site.randInt(Math.max(1, deepest - 1), deepest);
      if (this.site.rng() < chance && cutSlantCorner(this.site, room, corner, depth, keep)) cut.push({ corner, depth });
    }
    return cut;
  }

  /**
   * Decor set into a north slanted face, by its chance, in its middle and clear of both its ends (so nothing reaches
   * round onto the straight face or the side wall): any that fits there.
   */
  private decorateSlant(c: Corner, room: RoomData): void {
    if (c.corner !== 'nw' && c.corner !== 'ne') return;
    const columns = c.depth * 2;
    const fits = SLANT_DECOR[c.corner].filter((decor) => ISO_DECOR[decor].span <= columns - DECOR_END_GAP * 2);
    if (!fits.length || this.site.rng() >= SLANT_DECOR_CHANCE) return;
    const decor = this.pick(fits);
    const span = ISO_DECOR[decor].span;
    // Columns counted from the corner; decor is keyed by the slope tile of its leftmost column.
    const first = Math.floor((columns - span) / 2);
    const at = slantTile(room, c, c.corner === 'nw' ? first : first + span - 1);
    this.level.wallDecor.set(at.x + at.y * this.level.width, decor);
  }

  // ── Kinds of room ────────────────────────────────────────────────────────────

  /**
   * A chasm across the whole room, wall to wall, two or three tiles deep, with one or two bridges over it (a chasm is no
   * trap: nobody steps into it, but the dark below has columns sinking into it).
   */
  private chasm(room: RoomData, keep: Keep): boolean {
    const depth = this.countIn(CHASM_DEPTH);
    const lo = room.y + CHASM_FLOOR_ABOVE;
    const hi = room.y + room.h - CHASM_FLOOR_BELOW - depth;
    if (room.w < CHASM_MIN_W || hi < lo) return false;
    const top = this.site.randInt(lo, hi);
    const sideOpen = (x: number): boolean => someTile(x, top, x, top + depth - 1, (tx, ty) => !this.site.isWall(tx, ty));
    const closed = !sideOpen(room.x - 1) && !sideOpen(room.x + room.w);
    const x0 = closed ? room.x : room.x + 1;
    const x1 = closed ? room.x + room.w - 1 : room.x + room.w - 2;
    if (x1 - x0 + 1 < CHASM_MIN_SPAN) return false;
    const bridges = closed || this.site.rng() < LEDGE_BRIDGE_CHANCE ? this.bridgesFor(room) : [];
    const onBridge = (x: number): boolean => bridges.some((bx) => x >= bx && x < bx + 2);
    const cells: Array<[number, number]> = [];
    forEachTile(x0, top, x1, top + depth - 1, (x, y) => {
      if (!onBridge(x) && this.site.free(x, y)) cells.push([x, y]);
    });
    if (!keep(() => this.site.setTiles(cells, TileType.Hole))) return false;
    // The bridges and the floor at either end of them stay clear.
    for (const bx of bridges) forEachTile(bx, top - 1, bx + 1, top + depth, (x, y) => this.site.claim(x, y));
    forEachTile(room.x, top, room.x + room.w - 1, top + depth - 1, (x, y) => this.site.claim(x, y));
    return true;
  }

  private bridgesFor(room: RoomData): number[] {
    const lo = room.x + 1;
    const hi = room.x + room.w - 3;
    if (room.w < TWO_BRIDGES_W) return [this.site.randInt(lo, hi)];
    const mid = room.x + Math.floor(room.w / 2);
    return [this.site.randInt(lo, mid - 3), this.site.randInt(mid + 1, hi)];
  }

  /** A pit sunk in the floor, with a ring of floor round it and clear of the walls. */
  private sinkhole(room: RoomData, keep: Keep): boolean {
    const w = this.countIn(SINKHOLE_W);
    const h = this.countIn(SINKHOLE_H);
    const maxX = room.x + room.w - SINKHOLE_MARGIN - w;
    const maxY = room.y + room.h - SINKHOLE_MARGIN - h;
    for (let attempt = 0; attempt < SINKHOLE_TRIES && maxX >= room.x + SINKHOLE_MARGIN && maxY >= room.y + SINKHOLE_MARGIN; attempt++) {
      const px = this.site.randInt(room.x + SINKHOLE_MARGIN, maxX);
      const py = this.site.randInt(room.y + SINKHOLE_MARGIN, maxY);
      if (someTile(px - 1, py - 1, px + w, py + h, (x, y) => !this.site.free(x, y))) continue;
      const cells: Array<[number, number]> = [];
      forEachTile(px, py, px + w - 1, py + h - 1, (x, y) => cells.push([x, y]));
      if (!keep(() => this.site.setTiles(cells, TileType.Hole))) continue;
      forEachTile(px - 1, py - 1, px + w, py + h, (x, y) => this.site.claim(x, y));
      return true;
    }
    return false;
  }

  /** A hall of great square columns, each on a carved plate, in rows in from the north and south walls. */
  private hall(room: RoomData, props: PropPlacement[], keep: Keep): boolean {
    if (room.w < HALL_MIN_W || room.h < HALL_MIN_H) return false;
    const kind = this.pick(ISO_SQUARE_COLUMNS);
    const plate = this.pick(ISO_PLATES);
    const rows = [room.y + COLUMN_INSET_Y, room.y + room.h - 1 - COLUMN_INSET_Y];
    let placed = 0;
    for (let x = room.x + COLUMN_INSET_X; x <= room.x + room.w - 1 - COLUMN_INSET_X; x += COLUMN_STEP) {
      for (const y of rows) placed += this.column(x, y, kind, plate, props, keep) ? 1 : 0;
    }
    return placed > 0;
  }

  private column(x: number, y: number, kind: PropKind, plate: PropKind, props: PropPlacement[], keep: Keep): boolean {
    if (!this.site.placeSolid([[x, y]], [kind], props, keep)) return false;
    props.push({ kind: plate, tx: x, ty: y });
    return true;
  }

  /** A raised dais of another tone in the room's middle. */
  private dais(room: RoomData, tone: number): void {
    const w = room.w - DAIS_INSET * 2;
    const h = room.h - DAIS_INSET * 2;
    if (w < DAIS_MIN || h < DAIS_MIN) return;
    this.level.floorZones.push({ x: room.x + DAIS_INSET, y: room.y + DAIS_INSET, w, h, tone: this.otherTone(tone) });
  }

  // ── The north face ───────────────────────────────────────────────────────────

  /** Whether the wall over floor tile (x, y) is a plain full face: two rows of wall, nothing set into it yet. */
  private plainFace(x: number, y: number): boolean {
    const W = this.level.width;
    const slope = this.level.slopes.has(x + y * W) || this.level.slopes.has(x + (y - 1) * W);
    return !slope && this.site.isFloor(x, y) && this.site.isWall(x, y - 1) && this.site.isWall(x, y - 2) && !this.level.wallDecor.has(x + (y - 1) * W);
  }

  /**
   * Whether `span` faces from x over floor row y are all plain, and the face runs on plain for DECOR_END_GAP tiles either
   * side (decor is kept off a face's ends); for decor rising above the face (`tall`), with the dark above them too (not
   * the floor of a room behind).
   */
  private faceRun(x: number, y: number, span: number, tall = false): boolean {
    for (let i = -DECOR_END_GAP; i < span + DECOR_END_GAP; i++) {
      if (!this.plainFace(x + i, y)) return false;
      if (tall && i >= 0 && i < span && !this.site.isWall(x + i, y - FACE_ROWS - 1)) return false;
    }
    return true;
  }

  /**
   * Along the face over the room's floor row `y`, left to right: decor set into it now and then (in a library, shelves;
   * now and then a crystal pane or a door), braziers in front of the bare stretches, candles before windows and statues.
   */
  private decorateNorthFace(room: RoomData, y: number, library: boolean, props: PropPlacement[], keep: Keep): void {
    let lastBrazier = -Infinity;
    for (let x = room.x; x < room.x + room.w; x++) {
      if (!this.plainFace(x, y)) continue;
      const decor = this.site.rng() < FACE_DECOR_CHANCE ? this.faceDecorAt(x, y, library) : null;
      if (decor) {
        this.setFaceDecor(x, y, decor, props);
        x += ISO_DECOR[decor].span;
        continue;
      }
      if (x - lastBrazier < BRAZIER_GAP || this.site.rng() >= FACE_BRAZIER_CHANCE) continue;
      if (this.site.placeSolid([[x, y]], [this.site.pickProp(ISO_BRAZIERS)], props, keep)) lastBrazier = x;
    }
  }

  /** Decor for the face at x over floor row y, if one fits there. */
  private faceDecorAt(x: number, y: number, library: boolean): IsoDecor | null {
    const roll = this.site.rng();
    if (roll < DOOR_CHANCE && this.faceRun(x, y, ISO_DECOR.isoDoor.span, true)) return 'isoDoor';
    if (roll < DOOR_CHANCE + CRYSTAL_CHANCE && this.faceRun(x, y, ISO_DECOR.isoCrystal.span, true)) return 'isoCrystal';
    if (!this.faceRun(x, y, 1)) return null;
    return library ? 'isoShelf' : this.pick(FRONT_DECOR_SMALL);
  }

  /** Sets decor into the face over floor tile (x, y), and maybe a candle in front of a window or statue. */
  private setFaceDecor(x: number, y: number, decor: IsoDecor, props: PropPlacement[]): void {
    this.level.wallDecor.set(x + (y - 1) * this.level.width, decor);
    if (decor === 'isoDoor') forEachTile(x, y, x + 1, y, (tx, ty) => this.site.claim(tx, ty));
    if (ISO_DECOR[decor].span !== 1 || this.site.rng() >= DECOR_CANDLE_CHANCE) return;
    this.loose(x, y, this.pick(ISO_CANDLES), props);
  }

  /** A walk-through prop on a free tile. */
  private loose(x: number, y: number, kind: PropKind, props: PropPlacement[]): void {
    if (!this.site.free(x, y)) return;
    this.site.claim(x, y);
    props.push({ kind, tx: x, ty: y });
  }

  // ── Clutter ──────────────────────────────────────────────────────────────────

  /** Pots, candles, the furniture of a library or the wreck of a ruin, stains and moss. */
  private clutter(room: RoomData, kind: RoomKind, props: PropPlacement[], keep: Keep): void {
    this.site.urnsAlongWalls(room, this.countIn(ROOM_POTS), props, keep, ISO_POTS);
    const open = this.site.shuffledFreeTiles(room);
    if (kind === 'library') this.library(room, open, props, keep);
    if (kind === 'ruin') this.ruin(room, open, props, keep);
    this.site.scatterLoose(open, ISO_CANDLES, this.countIn(ROOM_CANDLES), props);
    for (let i = this.countIn(ROOM_STAINS); i > 0; i--) this.flat(room, this.site.pickProp(ISO_STAINS), props);
    for (let i = this.countIn(ROOM_MOSS); i > 0; i--) this.flat(room, this.site.pickProp(ISO_MOSS_BITS), props);
  }

  private library(room: RoomData, open: TilePos[], props: PropPlacement[], keep: Keep): void {
    for (let i = this.countIn(LIBRARY_LECTERNS); i > 0; i--) this.site.scatterSolid(room, open, ISO_LECTERNS, props, keep);
    this.site.scatterLoose(open, ISO_BOOKS.filter((kind) => !isSolid(kind)), this.countIn(LIBRARY_BOOKS), props);
  }

  private ruin(room: RoomData, open: TilePos[], props: PropPlacement[], keep: Keep): void {
    const columns = [...ISO_BROKEN_COLUMNS, ...ISO_ROUND_COLUMNS, ...ISO_SLENDER_COLUMNS];
    for (let i = this.countIn(RUIN_COLUMNS); i > 0; i--) this.site.scatterSolid(room, open, columns, props, keep);
    this.site.scatterLoose(open, ISO_WRECKS, this.countIn(RUIN_WRECKS), props);
  }

  /**
   * Something lying flat (a stain, moss) centred on a tile of the room, only where all of it lies on open floor: it is
   * drawn over the terrain, so it must not reach onto a wall, a rim, the stairs or a chasm.
   */
  private flat(room: RoomData, kind: PropKind, props: PropPlacement[]): void {
    const { w, h } = PROPS[kind].rect;
    for (let attempt = 0; attempt < FLAT_TRIES; attempt++) {
      const tx = this.site.randInt(room.x, room.x + room.w - 1);
      const ty = this.site.randInt(room.y, room.y + room.h - 1);
      if (!this.flatFits(tx, ty, w, h)) continue;
      props.push({ kind, tx, ty });
      return;
    }
  }

  private flatFits(tx: number, ty: number, w: number, h: number): boolean {
    const cx = tx * TILE_WIDTH + TILE_WIDTH / 2;
    const cy = ty * TILE_HEIGHT + TILE_HEIGHT / 2;
    const x0 = Math.floor((cx - w / 2) / TILE_WIDTH);
    const x1 = Math.floor((cx + w / 2 - 1) / TILE_WIDTH);
    const y0 = Math.floor((cy - h / 2) / TILE_HEIGHT);
    const y1 = Math.floor((cy + h / 2 - 1) / TILE_HEIGHT);
    return !someTile(x0, y0, x1, y1, (x, y) => !this.openGround(x, y));
  }

  /** Floor (or a prop's tile) with no slant or face decor coming down onto it. */
  private openGround(x: number, y: number): boolean {
    const type = this.level.getTile(x, y)?.type;
    if (type !== TileType.Floor && type !== TileType.Obstacle) return false;
    const W = this.level.width;
    return !this.level.slopes.has(x + y * W) && !this.level.wallDecor.has(x + (y - 1) * W);
  }

  // ── Stairs in the corridors ──────────────────────────────────────────────────

  /**
   * Flights of stairs in the corridors between the rooms: across a north–south stretch (steps), or seen from the side in
   * an east–west one (rising one way or the other), each in the middle of a straight stretch walled both sides.
   */
  layCorridorStairs(): void {
    const spots: Array<{ x: number; y: number; dir: StairDir }> = [];
    const { level } = this;
    forEachTile(1, 1, level.width - 2, level.height - 2, (x, y) => {
      if (this.startsRun(x, y, 0, 1)) this.middleOfRun(x, y, 0, 1, spots);
      if (this.startsRun(x, y, 1, 0)) this.middleOfRun(x, y, 1, 0, spots);
    });
    for (let i = 0; i < STAIRS_PER_LEVEL && spots.length; i++) {
      const spot = spots.splice(Math.floor(this.site.rng() * spots.length), 1)[0];
      if (this.stairsNear(spot.x, spot.y)) continue;
      level.stairs.push(spot);
      const [w, h] = spot.dir === 'across' ? [STAIRS_PASSAGE, STAIRS_ROWS] : [STAIRS_SPAN, STAIRS_PASSAGE];
      forEachTile(spot.x, spot.y, spot.x + w - 1, spot.y + h - 1, (x, y) => this.site.claim(x, y));
    }
  }

  /**
   * Whether (x, y) is a slice of a straight corridor two tiles wide, running along (dx, dy): both its tiles plain floor
   * (no slant, no safe room), with plain wall either side of it.
   */
  private passage(x: number, y: number, dx: number, dy: number): boolean {
    const W = this.level.width;
    const open = (tx: number, ty: number): boolean => this.site.isFloor(tx, ty) && !this.level.slopes.has(tx + ty * W) && !this.level.isSafeZone(tx, ty);
    const wall = (tx: number, ty: number): boolean => this.site.isWall(tx, ty) && !this.level.slopes.has(tx + ty * W);
    // Across the corridor: its two tiles, and the walls beyond them.
    const ax = dy, ay = dx;
    return open(x, y) && open(x + ax, y + ay) && wall(x - ax, y - ay) && wall(x + STAIRS_PASSAGE * ax, y + STAIRS_PASSAGE * ay);
  }

  /** Whether a straight corridor slice starts at (x, y) (none just before it). */
  private startsRun(x: number, y: number, dx: number, dy: number): boolean {
    return this.passage(x, y, dx, dy) && !this.passage(x - dx, y - dy, dx, dy);
  }

  /** The middle of the straight stretch starting at (x, y), if it is long enough, as a spot for stairs. */
  private middleOfRun(x: number, y: number, dx: number, dy: number, out: Array<{ x: number; y: number; dir: StairDir }>): void {
    let n = 1;
    while (this.passage(x + n * dx, y + n * dy, dx, dy)) n++;
    if (n < STAIRS_RUN_MIN) return;
    if (dy === 1) {
      out.push({ x, y: y + Math.floor((n - STAIRS_ROWS) / 2), dir: 'across' });
      return;
    }
    out.push({ x: x + Math.floor((n - STAIRS_SPAN) / 2), y, dir: 'over' });
  }

  /** Whether stairs already stand within a few tiles (two flights side by side would read as one muddle). */
  private stairsNear(x: number, y: number): boolean {
    return this.level.stairs.some((s) => Math.abs(s.x - x) + Math.abs(s.y - y) < STAIRS_RUN_MIN);
  }
}
