import type { Level } from '../Level';
import { FLOOR_TONES, STAIRS_H, STAIRS_W } from '../Level';
import { TileType, TILE_HEIGHT, TILE_WIDTH } from '../TileType';
import { forEachTile, someTile } from '../Grid';
import type { Slope, SlopeCorner } from '../Slopes';
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
 * the slant, galleries raised along a room's north side with stairs down their face, chasms with a bridge over them,
 * pits sunk in the floor, halls of great columns, libraries; decor set into the faces (windows, statues, shelves,
 * crystal panes, a door, an alcove of stairs), crystal braziers and candles to light them, pots, books and wreckage,
 * stains and moss on the floor. Every change that could cut a way off goes through `keep`.
 */

/** What the builder lends the dresser: its level, its seeded generator and its ways of setting things down. */
export type IsoSite = {
  readonly level: Level;
  rng(): number;
  randInt(min: number, max: number): number;
  free(tx: number, ty: number): boolean;
  claim(tx: number, ty: number): void;
  isWall(tx: number, ty: number): boolean;
  isFloor(tx: number, ty: number): boolean;
  setTiles(cells: Array<[number, number]>, type: TileType): TileChange[];
  placeSolid(cells: Array<[number, number]>, kinds: PropKind[], props: PropPlacement[], keep: Keep): boolean;
  scatterSolid(room: RoomData, open: TilePos[], kinds: readonly PropKind[], props: PropPlacement[], keep: Keep): void;
  scatterLoose(open: TilePos[], kinds: readonly PropKind[], count: number, props: PropPlacement[]): void;
  shuffledFreeTiles(room: RoomData): TilePos[];
  urnsAlongWalls(room: RoomData, count: number, props: PropPlacement[], keep: Keep, kinds: readonly PropKind[]): void;
  pickProp(kinds: readonly PropKind[]): PropKind;
};

type RoomKind = 'gallery' | 'chasm' | 'sinkhole' | 'hall' | 'library' | 'ruin' | 'plain';

/** How a room is dressed, by a roll: each kind up to its share (if the room is big enough), else plain. */
const KIND_SHARES: ReadonlyArray<[RoomKind, number]> = [
  ['gallery', 0.28], ['chasm', 0.5], ['sinkhole', 0.62], ['hall', 0.76], ['library', 0.86], ['ruin', 0.93],
];
/** The tones a room's floor is laid in (dark slate, oxblood, teal), by weight. */
const TONE_WEIGHTS = [0.4, 0.38, 0.22];
/** Chance a north corner is cut off on the slant, and a south one; slants are 1 or 2 tiles deep (2 in big rooms). */
const NORTH_SLANT_CHANCE = 0.8;
const SOUTH_SLANT_CHANCE = 0.45;
const DEEP_SLANT_MIN_W = 10;
const DEEP_SLANT_MIN_H = 8;
/** A room needs this much more than its slants across and down to have them (its middle stays open). */
const SLANT_ROOM_SPARE_W = 2;
const SLANT_ROOM_SPARE_H = 3;
/** A gallery is 2 or 3 tiles deep over a face two tiles tall, leaves this much floor below, and needs this width. */
const GALLERY_DEPTH = [2, 3] as const;
const FACE_ROWS = 2;
const GALLERY_FLOOR_BELOW = 4;
const GALLERY_MIN_W = 7;
/** A gallery this wide gets two flights of stairs, and keeps its stairs this far in from its ends. */
const TWO_FLIGHTS_W = 12;
const STAIRS_INSET = 1;
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
/** Chance a slanted face gets decor, of decor being the big crystal pane or a door, and of the stair alcove. */
const SLANT_DECOR_CHANCE = 0.75;
const CRYSTAL_CHANCE = 0.12;
const DOOR_CHANCE = 0.05;
const ALCOVE_CHANCE = 0.35;
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

type Corner = { corner: SlopeCorner; depth: number };

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
    const kind = this.buildKind(room, tone, props, keep);
    if ((kind === 'plain' || kind === 'hall') && this.site.rng() < DAIS_CHANCE) this.dais(room, tone);
    this.decorateNorthFace(room, room.y, kind === 'library' || kind === 'gallery', props, keep);
    for (const c of corners) this.decorateSlant(room, c);
    this.clutter(room, kind, props, keep);
  }

  /**
   * Builds the room's kind: the one the roll picks, or if the room has no room for it, the kinds after it in turn (so a
   * small room still gets something); a roll past every share leaves it plain.
   */
  private buildKind(room: RoomData, tone: number, props: PropPlacement[], keep: Keep): RoomKind {
    const roll = this.site.rng();
    const first = KIND_SHARES.findIndex(([, share]) => roll < share);
    if (first < 0) return 'plain';
    for (let i = 0; i < KIND_SHARES.length; i++) {
      const kind = KIND_SHARES[(first + i) % KIND_SHARES.length][0];
      if (this.build(kind, room, tone, props, keep)) return kind;
    }
    return 'plain';
  }

  private build(kind: RoomKind, room: RoomData, tone: number, props: PropPlacement[], keep: Keep): boolean {
    switch (kind) {
      case 'gallery': return this.gallery(room, tone, props, keep);
      case 'chasm': return this.chasm(room, keep);
      case 'sinkhole': return this.sinkhole(room, keep);
      case 'hall': return this.hall(room, props, keep);
      case 'library': return true;
      case 'ruin': return true;
      default: return false;
    }
  }

  // ── Slanted corners ──────────────────────────────────────────────────────────

  /** Cuts the room's corners off on the slant, each by its chance; returns the corners cut. */
  private cutCorners(room: RoomData, keep: Keep): Corner[] {
    const depth = room.w >= DEEP_SLANT_MIN_W && room.h >= DEEP_SLANT_MIN_H ? 2 : 1;
    const cut: Corner[] = [];
    for (const corner of ['nw', 'ne', 'sw', 'se'] satisfies SlopeCorner[]) {
      const chance = corner === 'nw' || corner === 'ne' ? NORTH_SLANT_CHANCE : SOUTH_SLANT_CHANCE;
      if (this.site.rng() < chance && this.cutCorner(room, corner, depth, keep)) cut.push({ corner, depth });
    }
    return cut;
  }

  /**
   * Cuts one corner off on the slant, `depth` tiles down and twice that across: the tiles beyond the slant become wall,
   * and the two tiles it crosses in each row are marked as slopes (Slopes.ts). Not where a corridor comes in.
   */
  private cutCorner(room: RoomData, corner: SlopeCorner, depth: number, keep: Keep): boolean {
    const across = depth * 2;
    if (room.w < across * 2 + SLANT_ROOM_SPARE_W || room.h < depth * 2 + SLANT_ROOM_SPARE_H) return false;
    const left = corner === 'nw' || corner === 'sw';
    const top = corner === 'nw' || corner === 'ne';
    const x0 = left ? room.x : room.x + room.w - across;
    const y0 = top ? room.y : room.y + room.h - depth;
    const outside = (x: number, y: number): boolean => x < room.x || y < room.y || x >= room.x + room.w || y >= room.y + room.h;
    if (someTile(x0 - 1, y0 - 1, x0 + across, y0 + depth, (x, y) => outside(x, y) && !this.site.isWall(x, y))) return false;
    if (someTile(x0, y0, x0 + across - 1, y0 + depth - 1, (x, y) => !this.site.free(x, y))) return false;
    const walls: Array<[number, number]> = [];
    const slopes: Array<[number, Slope]> = [];
    forEachTile(0, 0, across - 1, depth - 1, (j, k) => {
      const x = left ? room.x + j : room.x + room.w - 1 - j;
      const y = top ? room.y + k : room.y + room.h - 1 - k;
      // In row k from the corner, the slant crosses columns lx (mostly wall) and lx + 1 (a corner of wall).
      const lx = 2 * (depth - 1 - k);
      if (j <= lx) walls.push([x, y]);
      if (j === lx || j === lx + 1) slopes.push([x + y * this.level.width, { corner, major: j === lx }]);
    });
    if (!keep(() => this.site.setTiles(walls, TileType.Wall))) return false;
    for (const [i, slope] of slopes) this.level.slopes.set(i, slope);
    forEachTile(x0, y0, x0 + across - 1, y0 + depth - 1, (x, y) => this.site.claim(x, y));
    return true;
  }

  /** The slope tile a slanted corner's slant crosses in its column `j` (counted from the corner). */
  private slantTile(room: RoomData, c: Corner, j: number): TilePos {
    const left = c.corner === 'nw' || c.corner === 'sw';
    const top = c.corner === 'nw' || c.corner === 'ne';
    const k = c.depth - 1 - Math.floor(j / 2);
    return { x: left ? room.x + j : room.x + room.w - 1 - j, y: top ? room.y + k : room.y + room.h - 1 - k };
  }

  /** Decor set into a north slanted face, by its chance: the biggest that fits, or a smaller one. */
  private decorateSlant(room: RoomData, c: Corner): void {
    if (c.corner !== 'nw' && c.corner !== 'ne') return;
    if (this.site.rng() >= SLANT_DECOR_CHANCE) return;
    const fits = SLANT_DECOR[c.corner].filter((decor) => ISO_DECOR[decor].span <= c.depth * 2);
    const decor = this.pick(fits);
    // Decor is keyed by the slope tile of its leftmost column: the slant's first on the west, its span-th on the east.
    const span = ISO_DECOR[decor].span;
    const at = this.slantTile(room, c, c.corner === 'nw' ? 0 : span - 1);
    this.level.wallDecor.set(at.x + at.y * this.level.width, decor);
  }

  // ── Kinds of room ────────────────────────────────────────────────────────────

  /**
   * A gallery raised along the room's north side: its floor (another tone) over a face two tiles tall, with one or
   * two flights of stairs down it, braziers at its foot either side of each flight.
   */
  private gallery(room: RoomData, tone: number, props: PropPlacement[], keep: Keep): boolean {
    const depth = this.countIn(GALLERY_DEPTH);
    const faceY = room.y + depth;
    if (room.w < GALLERY_MIN_W || room.h - depth - FACE_ROWS < GALLERY_FLOOR_BELOW) return false;
    // A corridor coming in from the side at the face's rows would end against it.
    const sideOpen = (x: number): boolean => someTile(x, faceY, x, faceY + FACE_ROWS - 1, (tx, ty) => !this.site.isWall(tx, ty));
    if (sideOpen(room.x - 1) || sideOpen(room.x + room.w)) return false;
    const faceRow = (x: number): boolean => this.site.free(x, faceY) && this.site.free(x, faceY + 1);
    if (someTile(room.x, faceY, room.x + room.w - 1, faceY, (x) => !faceRow(x))) return false;
    const flights = this.flightsFor(room);
    const onStairs = (x: number): boolean => flights.some((sx) => x >= sx && x < sx + STAIRS_W);
    const cells: Array<[number, number]> = [];
    forEachTile(room.x, faceY, room.x + room.w - 1, faceY + FACE_ROWS - 1, (x, y) => {
      if (!onStairs(x)) cells.push([x, y]);
    });
    if (!keep(() => this.site.setTiles(cells, TileType.Wall))) return false;
    this.level.floorZones.push({ x: room.x, y: room.y, w: room.w, h: depth, tone: this.otherTone(tone) });
    for (const sx of flights) this.layFlight(sx, faceY, props, keep);
    return true;
  }

  /** Where a gallery's flights of stairs start: one off the middle, or two at a quarter and three quarters across. */
  private flightsFor(room: RoomData): number[] {
    const lo = room.x + STAIRS_INSET;
    const hi = room.x + room.w - STAIRS_INSET - STAIRS_W;
    if (room.w < TWO_FLIGHTS_W) return [Math.min(hi, Math.max(lo, room.x + Math.floor((room.w - STAIRS_W) / 2) + this.site.randInt(-1, 1)))];
    return [lo + Math.floor((hi - lo) / 4), lo + Math.ceil(((hi - lo) * 3) / 4)];
  }

  /** A flight of stairs down the face at column sx: its tiles kept clear (and the landing above and below), braziers by its foot. */
  private layFlight(sx: number, faceY: number, props: PropPlacement[], keep: Keep): void {
    this.level.stairs.push({ x: sx, y: faceY });
    forEachTile(sx, faceY - 1, sx + STAIRS_W - 1, faceY + STAIRS_H, (x, y) => this.site.claim(x, y));
    const foot = faceY + STAIRS_H;
    for (const x of [sx - 1, sx + STAIRS_W]) this.site.placeSolid([[x, foot]], [this.site.pickProp(ISO_BRAZIERS)], props, keep);
  }

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
   * Whether `span` faces from x over floor row y are all plain; for decor rising above the face (`tall`), with the dark
   * above them too (not the floor of a gallery or a room behind).
   */
  private faceRun(x: number, y: number, span: number, tall = false): boolean {
    for (let i = 0; i < span; i++) if (!this.plainFace(x + i, y) || (tall && !this.site.isWall(x + i, y - FACE_ROWS - 1))) return false;
    return true;
  }

  /**
   * Along the face over the room's floor row `y`, left to right: decor set into it now and then (in a library, shelves;
   * now and then a crystal pane, the stair alcove, a door), braziers in front of the bare stretches, candles before
   * windows and statues.
   */
  private decorateNorthFace(room: RoomData, y: number, library: boolean, props: PropPlacement[], keep: Keep): void {
    let lastBrazier = -Infinity;
    this.maybeAlcove(room, y);
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

  /** The stair alcove in the middle of the face, by its chance, where four tiles of plain face are free for it. */
  private maybeAlcove(room: RoomData, y: number): void {
    const span = ISO_DECOR.isoAlcove.span;
    const x = room.x + Math.floor((room.w - span) / 2);
    if (this.site.rng() >= ALCOVE_CHANCE || !this.faceRun(x, y, span, true)) return;
    if (someTile(x, y, x + span - 1, y, (tx, ty) => !this.site.free(tx, ty))) return;
    this.level.wallDecor.set(x + (y - 1) * this.level.width, 'isoAlcove');
    // The steps come out onto the floor: nothing stands on them.
    forEachTile(x, y, x + span - 1, y, (tx, ty) => this.site.claim(tx, ty));
  }

  /** Decor for the face at x over floor row y, if one fits there. */
  private faceDecorAt(x: number, y: number, library: boolean): IsoDecor | null {
    const roll = this.site.rng();
    if (roll < DOOR_CHANCE && this.faceRun(x, y, ISO_DECOR.isoDoor.span, true)) return 'isoDoor';
    if (roll < DOOR_CHANCE + CRYSTAL_CHANCE && this.faceRun(x, y, ISO_DECOR.isoCrystal.span, true)) return 'isoCrystal';
    if (library) return 'isoShelf';
    return this.pick(FRONT_DECOR_SMALL);
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

  /** Floor (or a prop's tile) with no slant, stairs or face decor coming down onto it. */
  private openGround(x: number, y: number): boolean {
    const type = this.level.getTile(x, y)?.type;
    if (type !== TileType.Floor && type !== TileType.Obstacle) return false;
    const W = this.level.width;
    if (this.level.slopes.has(x + y * W) || this.level.wallDecor.has(x + (y - 1) * W)) return false;
    return !this.level.stairs.some((s) => x >= s.x && x < s.x + STAIRS_W && y >= s.y && y < s.y + STAIRS_H);
  }
}
