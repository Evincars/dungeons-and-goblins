import type { Level } from '../Level';
import { TileType, TILE_WIDTH } from '../TileType';
import { forEachTile, someTile } from '../Grid';
import type { SlopeCorner } from '../Slopes';
import { cutSlantCorner, cutSlantSpur, slantFits } from './Slants';
import type { SpurSide } from './Slants';
import { MINE_FLOOR_TONES, MINE_HOLES } from '../MineTiles';
import {
  MINE_BIG_ROCKS, MINE_FRAMES, MINE_FUNGI, MINE_LANTERN_POSTS, MINE_LANTERNS, MINE_PEBBLES, MINE_PLANTS, MINE_POSTS,
  MINE_ROCKS, MINE_ROOTS, MINE_RUBBLE, MINE_SHROOM_TABLES, MINE_SMALL_STALAGMITES, MINE_STALAGMITES, MINE_STONES, MINE_WEBS,
  PROP_GROUND, PROPS,
} from '../Props';
import type { PropKind, PropPlacement } from '../Props';
import { placeFlat } from './IsoDresser';
import type { IsoSite } from './IsoDresser';
import type { Keep, RoomData, TileChange, TilePos } from './DungeonBuilder';
import { mineFloorTone } from '../MineGround';
import { tileGraphOf } from '../TileGraph';
import type { StepCost } from '../TileGraph';
import { reachableTiles } from '../TileSearch';

/**
 * Dresses the rooms of the forgotten mines (Theme 'mines'), on the layout DungeonBuilder carved. A cavern is anything but
 * a rectangle: its corners cut off on the slant, spurs of rock jutting from its north and south walls, the rock stepping
 * forward along them and bulging out of its sides, outcrops of rock standing in the bigger ones. Earth of other colours
 * lies about in patches. Some caverns have an abyss across them with a rock bridge over it, or a great ragged pit sunk
 * in the floor up to a narrow ledge along the walls, fenced off here and there (whoever walks out over either falls);
 * small holes open in the floor of any; galleries of pit props, rockfalls of great boulders. The old timbering stands
 * against the rock faces, lanterns of cold green light on posts and hung on the rock, cobwebs and bracket fungi on the
 * faces; stones to walk round, pebbles, reeds and flowers, mushroom tables and roots on the floor. Every change that could
 * cut a way off goes through `keep`, and none may cut part of a cavern off from the rest.
 */

type RoomKind = 'chasm' | 'pit' | 'gallery' | 'rockfall' | 'plain';

/** How a cavern is dressed, by a roll: each kind up to its share (if the cavern is big enough), else plain. */
const KIND_SHARES: ReadonlyArray<[RoomKind, number]> = [['chasm', 0.25], ['pit', 0.55], ['gallery', 0.7], ['rockfall', 0.88]];
/** The ground a cavern is floored with (brown earth, grey-green clay, slate, rust), by weight. */
const TONE_WEIGHTS = [0.55, 0.2, 0.1, 0.15];
/** Patches of other earth in a cavern: how many, and how big (tiles across and down). */
const PATCHES = [1, 3] as const;
const PATCH_W = [3, 9] as const;
const PATCH_H = [3, 7] as const;
/** Chance each north corner, and each south one, is cut off on the slant, and how deep a slant may go. */
const NORTH_SLANT_CHANCE = 0.9;
const SOUTH_SLANT_CHANCE = 0.8;
const SLANT_DEPTH_MAX = 4;
/**
 * Spurs of rock jutting out of a cavern's north and south walls between its corners (its walls zigzag as a cave's do):
 * each this deep (four times that across), tried every few tiles along the wall by their chance, this far from its corners.
 */
const SPUR_DEPTH = [1, 3] as const;
const SPUR_CHANCE = 0.8;
const SPUR_GAP = [0, 2] as const;
const SPUR_CORNER_GAP = 3;
/** Where no spur juts, the rock of the north or south wall steps forward this many rows over this many tiles, by chance. */
const STEP_DEPTH = [1, 2] as const;
const STEP_LEN = [3, 6] as const;
const STEP_CHANCE = 0.9;
/** The rock bulges out of the west and east walls this deep, over this many rows, by chance every few rows. */
const BULGE_DEPTH = [1, 3] as const;
const BULGE_LEN = [2, 5] as const;
const BULGE_CHANCE = 0.8;
const BULGE_GAP = [0, 1] as const;
/** Outcrops of rock standing in a cavern at least this big: how many, how big, a few tries each. */
const OUTCROP_ROOM_W = 10;
const OUTCROP_ROOM_H = 9;
const OUTCROPS = [1, 3] as const;
const OUTCROP_W = [2, 4] as const;
const OUTCROP_H = [2, 3] as const;
const OUTCROP_TRIES = 8;
/** An abyss across a cavern: this deep (its edges wandering a row either way), with a rock bridge two tiles wide over it. */
const CHASM_DEPTH = [3, 5] as const;
const CHASM_FLOOR_ABOVE = 2;
const CHASM_FLOOR_BELOW = 2;
const CHASM_MIN_W = 8;
const BRIDGE_W = 2;
/** An abyss's edges wander up to this far either way from their line, moving a row now and then (by this chance a column). */
const EDGE_WANDER = 1;
const WANDER_CHANCE = 0.4;
/** A tile of an abyss with fewer of its four neighbours in it than this is left floor: no spikes, no lone holes. */
const DROP_NEIGHBOURS = 2;
const TRIM_PASSES = 3;
/** A great pit: it eats up this share of a cavern's tiles (at most), growing out from one tile, a few tries. */
const PIT_SHARE = [0.25, 0.45] as const;
const PIT_MIN_TILES = 6;
const PIT_TRIES = 4;
/** Holes in the floor: how many in a cavern, and the chance one is bigger than a body (two tiles or more). */
const HOLES = [1, 3] as const;
const BIG_HOLE_CHANCE = 0.25;
const HOLE_TRIES = 12;
/**
 * Fences on the brink of a drop: along a stretch of its north brink by this chance, of its south one by this (never
 * all the way round: there are gaps to fall through), at least this long; a fence blocks the strip at its foot this deep.
 */
const NORTH_FENCE_CHANCE = 0.65;
const SOUTH_FENCE_CHANCE = 0.35;
const FENCE_MIN_RUN = 2;
/** A run of fence takes at most this share of the brink it stands on, and at most this many tiles. */
const FENCE_MAX_SHARE = 0.7;
const FENCE_MAX_RUN = 7;
const FENCE_FOOT = 6;
/** A fence stands this far down the tile below the edge it guards from the south (a foot-mounted prop's FOOT_DEPTH). */
const FRONT_FENCE_FOOT = 5;
/** The closing post of a run of fence stands this far right of the middle of its last tile. */
const END_POST_SHIFT = 19;
/** A gallery: pit props standing every few tiles, in rows this far in from the north and south walls. */
const GALLERY_MIN_W = 8;
const GALLERY_MIN_H = 7;
const POST_STEP = 3;
const POST_INSET_X = 2;
const POST_INSET_Y = 2;
/** One prop of a gallery's in this many is a lantern post. */
const LANTERN_POST_EVERY = 4;
/** A rockfall: great boulders, heaps of rubble and stalagmites. */
const ROCKFALL_BOULDERS = [1, 3] as const;
const ROCKFALL_RUBBLE = [1, 3] as const;
/**
 * Along a north face where it stands its full height (FACE_ROWS of rock): timbering every so many tiles (a frame
 * against the rock), a lantern hung on the rock between, and cobwebs (at the face's ends by their chance, and now and
 * then along it) and bracket fungi.
 */
const FACE_ROWS = 5;
const TIMBER_EVERY = [4, 7] as const;
const LANTERN_EVERY = [5, 8] as const;
const END_WEB_CHANCE = 0.6;
const WEB_CHANCE = 0.12;
const FUNGUS_CHANCE = 0.15;
/** Lantern posts standing in a cavern (at least one lights every cavern). */
const LANTERN_POSTS = [1, 2] as const;
/** The clutter of a cavern floor: stones and tables strewn about, the rest in clumps (CLUMP_SIZE each). */
const STONES = [2, 5] as const;
const SHROOM_TABLES = [0, 2] as const;
const ROOTS = [3, 8] as const;
const STALAGMITES = [1, 3] as const;
/**
 * Reeds, flowers and mushrooms grow in clumps where something breaks the floor: along the brink of a drop or a hole, at
 * the rock's feet, at the edge of a patch of other earth. Pebbles and small stalagmites gather at the rock's feet.
 */
const PLANT_CLUMPS = [2, 4] as const;
const PEBBLE_CLUMPS = [2, 3] as const;
const STALAGMITE_CLUMPS = [1, 2] as const;
const CLUMP_SIZE = [2, 5] as const;
/** A clump's members sit up to this far (px) either way off their tiles' middles, so they don't line up. */
const CLUMP_JITTER = 7;
const ROCKS = [1, 3] as const;
/** Chance a trestle stands in a cavern. */
const TRESTLE_CHANCE = 0.3;

type Cells = Array<[number, number]>;

/** The four neighbours of a tile, as [dx, dy]; and the eight round it, in order round it. */
const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const RING = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]] as const;

export class MineDresser {
  constructor(private readonly site: IsoSite) {}

  private get level(): Level {
    return this.site.level;
  }

  private countIn([min, max]: readonly [number, number]): number {
    return this.site.randInt(min, max);
  }

  private pickTone(): number {
    let roll = this.site.rng();
    for (let tone = 0; tone < MINE_FLOOR_TONES; tone++) {
      roll -= TONE_WEIGHTS[tone];
      if (roll < 0) return tone;
    }
    return 0;
  }

  // ── A cavern ─────────────────────────────────────────────────────────────────

  /** Dresses one cavern: its ground, its shape, its kind, its holes, the fences at its drops, its faces, lights and clutter. */
  dressRoom(room: RoomData, props: PropPlacement[], keepWays: Keep): void {
    const keep = this.keepWhole(room, keepWays);
    const tone = this.pickTone();
    this.level.floorZones.push({ x: room.x, y: room.y, w: room.w, h: room.h, tone });
    this.patches(room, tone);
    this.shape(room, keep);
    this.clearMouths(room);
    const kind = this.buildKind(room, props, keep);
    this.holes(room, keep);
    if (kind === 'chasm' || kind === 'pit') this.fenceDrops(room, props, keep);
    this.dressNorthFace(room, props);
    for (let i = this.countIn(LANTERN_POSTS); i > 0; i--) this.site.urnsAlongWalls(room, 1, props, keep, MINE_LANTERN_POSTS);
    this.clutter(room, props, keep);
  }

  /**
   * Lanterns hung on the north face of the safe or exit room (which is otherwise furnished as in the catacombs), clear of
   * its portal (`taken`: a face column the portal and its candelabras keep).
   */
  lightGathering(room: RoomData, props: PropPlacement[], taken: (tx: number) => boolean): void {
    for (const x of [room.x + Math.floor(room.w / 3), room.x + Math.floor((room.w * 2) / 3)]) {
      if (this.straightFace(x, room.y) && !taken(x)) props.push({ kind: this.site.pickProp(MINE_LANTERNS), tx: x, ty: room.y });
    }
  }

  /** Patches of earth of other tones lying on the cavern's ground. */
  private patches(room: RoomData, tone: number): void {
    for (let i = this.countIn(PATCHES); i > 0; i--) {
      const w = Math.min(room.w, this.countIn(PATCH_W));
      const h = Math.min(room.h, this.countIn(PATCH_H));
      const x = this.site.randInt(room.x, room.x + room.w - w);
      const y = this.site.randInt(room.y, room.y + room.h - h);
      const other = (tone + 1 + Math.floor(this.site.rng() * (MINE_FLOOR_TONES - 1))) % MINE_FLOOR_TONES;
      this.level.floorZones.push({ x, y, w, h, tone: other, patch: true });
    }
  }

  // ── The cavern's shape ───────────────────────────────────────────────────────

  /** Breaks the cavern's rectangle up: spurs, slanted corners, steps in its walls, bulges from its sides, outcrops. */
  private shape(room: RoomData, keep: Keep): void {
    for (const side of ['n', 's'] satisfies SpurSide[]) this.spurs(room, side, keep);
    this.cutCorners(room, keep);
    for (const north of [true, false]) this.steps(room, north, keep);
    for (const west of [true, false]) this.bulges(room, west, keep);
    if (room.w >= OUTCROP_ROOM_W && room.h >= OUTCROP_ROOM_H) {
      for (let i = this.countIn(OUTCROPS); i > 0; i--) this.outcrop(room, keep);
    }
  }

  /** Cuts the cavern's corners off on the slant, each by its chance, as deep as it allows. */
  private cutCorners(room: RoomData, keep: Keep): void {
    let deepest = SLANT_DEPTH_MAX;
    while (deepest > 1 && !slantFits(room, deepest)) deepest--;
    for (const corner of ['nw', 'ne', 'sw', 'se'] satisfies SlopeCorner[]) {
      const chance = corner === 'nw' || corner === 'ne' ? NORTH_SLANT_CHANCE : SOUTH_SLANT_CHANCE;
      const depth = this.site.randInt(Math.max(1, deepest - 1), deepest);
      if (this.site.rng() < chance) cutSlantCorner(this.site, room, corner, depth, keep);
    }
  }

  /** Spurs of rock along one wall, left to right, each by its chance where one fits. */
  private spurs(room: RoomData, side: SpurSide, keep: Keep): void {
    for (let x = room.x + SPUR_CORNER_GAP; x < room.x + room.w;) {
      const depth = this.countIn(SPUR_DEPTH);
      const roomy = x + depth * 4 + SPUR_CORNER_GAP <= room.x + room.w;
      const cut = roomy && this.site.rng() < SPUR_CHANCE && cutSlantSpur(this.site, room, x, depth, side, keep);
      x += (cut ? depth * 4 : 1) + this.countIn(SPUR_GAP);
    }
  }

  /** Along the north (or south) wall, where nothing else changed it, the rock steps forward a row or two now and then. */
  private steps(room: RoomData, north: boolean, keep: Keep): void {
    for (let x = room.x + 1; x < room.x + room.w - 1; x++) {
      if (this.site.rng() >= STEP_CHANCE / STEP_LEN[1]) continue;
      const len = this.countIn(STEP_LEN);
      const depth = this.countIn(STEP_DEPTH);
      const y0 = north ? room.y : room.y + room.h - depth;
      const beyond = north ? room.y - 1 : room.y + room.h;
      // The rock behind it runs on unbroken (no corridor comes in there) and the floor it takes is free, a tile either side too.
      const walled = !someTile(x - 1, beyond, x + len, beyond, (tx, ty) => !this.site.isWall(tx, ty));
      const clear = !someTile(x - 1, y0, x + len, y0 + depth - 1, (tx, ty) => !this.site.free(tx, ty));
      if (!walled || !clear || room.h - depth < OUTCROP_H[1] + 2) continue;
      if (this.carve(this.box(x, y0, len, depth), keep)) x += len + 1;
    }
  }

  /** Down the west (or east) wall, the rock bulges out into the cavern now and then. */
  private bulges(room: RoomData, west: boolean, keep: Keep): void {
    for (let y = room.y + 1; y < room.y + room.h - 1;) {
      const len = this.countIn(BULGE_LEN);
      const depth = this.countIn(BULGE_DEPTH);
      const x0 = west ? room.x : room.x + room.w - depth;
      const beyond = west ? room.x - 1 : room.x + room.w;
      const walled = !someTile(beyond, y - 1, beyond, y + len, (tx, ty) => !this.site.isWall(tx, ty));
      const clear = !someTile(x0, y - 1, x0 + depth - 1, y + len, (tx, ty) => !this.site.free(tx, ty));
      const fits = room.w - depth >= CHASM_MIN_W && y + len < room.y + room.h - 1;
      const bulged = walled && clear && fits && this.site.rng() < BULGE_CHANCE && this.carve(this.box(x0, y, depth, len), keep);
      y += (bulged ? len + 1 : 1) + this.countIn(BULGE_GAP);
    }
  }

  /** An outcrop of rock standing in the cavern, open floor all round it. */
  private outcrop(room: RoomData, keep: Keep): void {
    for (let attempt = 0; attempt < OUTCROP_TRIES; attempt++) {
      const w = this.countIn(OUTCROP_W);
      const h = this.countIn(OUTCROP_H);
      const x = this.site.randInt(room.x + 2, room.x + room.w - 2 - w);
      const y = this.site.randInt(room.y + 2, room.y + room.h - 2 - h);
      if (someTile(x - 2, y - 2, x + w + 1, y + h + 1, (tx, ty) => !this.site.free(tx, ty))) continue;
      if (this.carve(this.box(x, y, w, h), keep)) return;
    }
  }

  private box(x: number, y: number, w: number, h: number): Cells {
    const cells: Cells = [];
    forEachTile(x, y, x + w - 1, y + h - 1, (tx, ty) => cells.push([tx, ty]));
    return cells;
  }

  /** Walls the cells up, if every way stays open and no part of the cavern is cut off from the rest. */
  private carve(cells: Cells, keep: Keep): boolean {
    const done = this.change(cells, TileType.Wall, keep);
    if (done) for (const [x, y] of cells) this.site.claim(x, y);
    return done;
  }

  /** Sets the cells to `type`, if `keep` keeps it. */
  private change(cells: Cells, type: TileType, keep: Keep): boolean {
    return cells.length > 0 && keep(() => this.site.setTiles(cells, type));
  }

  /**
   * The builder's `keep` (every way stays open), and besides it undone if it splits the cavern's floor into more pieces
   * than before: a rock, a fence or a drop must not shut a corner of the cavern off, even one nobody needs to reach.
   */
  private keepWhole(room: RoomData, keep: Keep): Keep {
    return (apply) => {
      const before = this.floorPieces(room);
      return keep(() => {
        const changes = apply();
        if (this.floorPieces(room) <= before) return changes;
        this.undo(changes);
        return [];
      });
    };
  }

  private undo(changes: readonly TileChange[]): void {
    for (const c of changes) this.site.setTiles([[c.x, c.y]], c.prev);
  }

  /**
   * How many separate stretches of floor lie in the box a tile round the cavern (so the corridors' mouths count), floor
   * joining floor side by side, each found by Yuka's BFS over the tile graph: a change that adds one has cut part of the
   * cavern off.
   */
  private floorPieces(room: RoomData): number {
    const level = this.level;
    const W = level.width;
    const x0 = room.x - 1;
    const y0 = room.y - 1;
    const x1 = room.x + room.w;
    const y1 = room.y + room.h;
    const inBox = (i: number): boolean => {
      const x = i % W;
      const y = Math.floor(i / W);
      return x >= x0 && y >= y0 && x <= x1 && y <= y1 && this.site.isFloor(x, y);
    };
    const step: StepCost = (_from, to) => (inBox(to) ? 1 : Infinity);
    const graph = tileGraphOf(level);
    const seen = new Uint8Array(W * level.height);
    let pieces = 0;
    forEachTile(x0, y0, x1, y1, (x, y) => {
      const i = x + y * W;
      if (seen[i] || !this.site.isFloor(x, y)) return;
      pieces++;
      const reached = reachableTiles(graph, i, step);
      for (let t = 0; t < reached.length; t++) seen[t] |= reached[t];
    });
    return pieces;
  }

  /** Keeps the floor at every corridor's mouth, and a tile round it, clear of drops and things set down. */
  private clearMouths(room: RoomData): void {
    forEachTile(room.x, room.y, room.x + room.w - 1, room.y + room.h - 1, (x, y) => {
      if (!this.mouth(room, x, y)) return;
      forEachTile(x - 1, y - 1, x + 1, y + 1, (tx, ty) => this.site.claim(tx, ty));
    });
  }

  /** A floor tile at the cavern's edge with open ground beyond it: where a corridor comes in. */
  private mouth(room: RoomData, x: number, y: number): boolean {
    if (!this.site.isFloor(x, y)) return false;
    const outside = (tx: number, ty: number): boolean => tx < room.x || ty < room.y || tx >= room.x + room.w || ty >= room.y + room.h;
    return STEPS.some(([dx, dy]) => outside(x + dx, y + dy) && !this.site.isWall(x + dx, y + dy));
  }

  // ── Kinds of cavern ──────────────────────────────────────────────────────────

  /** Builds the kind the roll picks, or failing that the kinds after it in turn; past every share, plain. */
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
      case 'pit': return this.pit(room, keep);
      case 'gallery': return this.gallery(room, props, keep);
      case 'rockfall': return this.rockfall(room, props, keep);
      default: return false;
    }
  }

  // ── Drops ────────────────────────────────────────────────────────────────────

  /**
   * Whether a tile may be dug out of the floor: free, inside the cavern a tile from its edge, and with floor all round
   * it (no wall, no slant), so a ledge always runs between a drop and the rock.
   */
  private diggable(room: RoomData, x: number, y: number, dug: ReadonlySet<number>): boolean {
    const inside = x > room.x && y > room.y && x < room.x + room.w - 1 && y < room.y + room.h - 1;
    if (!inside || !this.site.free(x, y)) return false;
    const W = this.level.width;
    return !someTile(x - 1, y - 1, x + 1, y + 1, (tx, ty) => !dug.has(tx + ty * W) && !this.site.free(tx, ty) && !this.claimedFloor(tx, ty));
  }

  /** Plain floor something has claimed (a corridor's mouth kept clear): still floor beside a drop. */
  private claimedFloor(x: number, y: number): boolean {
    return this.site.isFloor(x, y) && !this.level.slopes.has(x + y * this.level.width);
  }

  /**
   * An abyss across the cavern, its edges wandering a row either way, a ledge along the rock at either side and a rock
   * bridge over it.
   */
  private chasm(room: RoomData, keep: Keep): boolean {
    const depth = this.countIn(CHASM_DEPTH);
    const lo = room.y + CHASM_FLOOR_ABOVE;
    const hi = room.y + room.h - CHASM_FLOOR_BELOW - depth;
    if (room.w < CHASM_MIN_W || hi < lo) return false;
    const top = this.site.randInt(lo, hi);
    const bridge = this.site.randInt(room.x + 2, room.x + room.w - 2 - BRIDGE_W);
    const dug = new Set<number>();
    const cells: Cells = [];
    let upper = 0;
    let lower = 0;
    for (let x = room.x + 1; x < room.x + room.w - 1; x++) {
      upper = this.wander(upper);
      lower = this.wander(lower);
      if (x >= bridge && x < bridge + BRIDGE_W) continue;
      for (let y = top + upper; y <= top + depth - 1 + lower; y++) this.dig(room, x, y, dug, cells);
    }
    const kept = this.trimDrop(cells, dug);
    if (kept.length === 0 || !this.change(kept, TileType.Hole, keep)) return false;
    // The bridge and the floor at either end of it stay clear, and nothing stands at the brink.
    forEachTile(bridge, top - EDGE_WANDER - 1, bridge + BRIDGE_W - 1, top + depth + EDGE_WANDER, (x, y) => this.site.claim(x, y));
    this.claimBrink(kept);
    return true;
  }

  /** An edge's next column: a row further one way or the other now and then, never more than EDGE_WANDER from its line. */
  private wander(at: number): number {
    if (this.site.rng() >= WANDER_CHANCE) return at;
    const next = at + (this.site.rng() < 0.5 ? -1 : 1);
    return Math.max(-EDGE_WANDER, Math.min(EDGE_WANDER, next));
  }

  /** The tiles of a drop with its spikes and lone tiles (those with too few neighbours in it) left as floor. */
  private trimDrop(cells: Cells, dug: Set<number>): Cells {
    const W = this.level.width;
    const inDrop = ([x, y]: [number, number]): boolean => STEPS.filter(([dx, dy]) => dug.has(x + dx + (y + dy) * W)).length >= DROP_NEIGHBOURS;
    let kept = cells;
    for (let pass = 0; pass < TRIM_PASSES; pass++) {
      const next = kept.filter(inDrop);
      if (next.length === kept.length) break;
      dug.clear();
      for (const [x, y] of next) dug.add(x + y * W);
      kept = next;
    }
    return kept;
  }

  /** Adds (x, y) to a drop being dug, if it may be. */
  private dig(room: RoomData, x: number, y: number, dug: Set<number>, cells: Cells): void {
    if (!this.diggable(room, x, y, dug)) return;
    dug.add(x + y * this.level.width);
    cells.push([x, y]);
  }

  /** Nothing is set down on the floor round a drop. */
  private claimBrink(cells: Cells): void {
    for (const [x, y] of cells) forEachTile(x - 1, y - 1, x + 1, y + 1, (tx, ty) => this.site.claim(tx, ty));
  }

  /**
   * A great ragged pit sunk in the cavern's floor, grown out from one tile in every direction it may go, up to the ledge
   * along the rock; a tile is left out where it would cut part of the cavern off.
   */
  private pit(room: RoomData, keep: Keep): boolean {
    for (let attempt = 0; attempt < PIT_TRIES; attempt++) {
      const cells = this.growPit(room);
      if (cells.length < PIT_MIN_TILES || !this.change(cells, TileType.Hole, keep)) continue;
      this.claimBrink(cells);
      return true;
    }
    return false;
  }

  /** The tiles of a great pit: from a tile near the cavern's middle, out to the frontier tile the dice pick, again and again. */
  private growPit(room: RoomData): Cells {
    const target = Math.floor(room.w * room.h * (PIT_SHARE[0] + this.site.rng() * (PIT_SHARE[1] - PIT_SHARE[0])));
    const W = this.level.width;
    const sx = room.x + Math.floor(room.w / 4) + this.site.randInt(0, Math.floor(room.w / 2));
    const sy = room.y + Math.floor(room.h / 4) + this.site.randInt(0, Math.floor(room.h / 2));
    const dug = new Set<number>();
    const cells: Cells = [];
    const frontier: Cells = [[sx, sy]];
    while (cells.length < target && frontier.length) {
      const [x, y] = frontier.splice(Math.floor(this.site.rng() * frontier.length), 1)[0];
      if (dug.has(x + y * W) || !this.diggable(room, x, y, dug) || this.splits(x, y, dug)) continue;
      dug.add(x + y * W);
      cells.push([x, y]);
      for (const [dx, dy] of STEPS) frontier.push([x + dx, y + dy]);
    }
    return cells;
  }

  /**
   * Whether digging (x, y) out, with what is already dug, might cut the floor round it in two: walking round the eight
   * tiles about it, more than one run of floor among them means it may be what holds them together.
   */
  private splits(x: number, y: number, dug: ReadonlySet<number>): boolean {
    const W = this.level.width;
    const open = RING.map(([dx, dy]) => this.site.isFloor(x + dx, y + dy) && !dug.has(x + dx + (y + dy) * W));
    let runs = 0;
    for (let i = 0; i < open.length; i++) if (open[i] && !open[(i + open.length - 1) % open.length]) runs++;
    return runs > 1;
  }

  /** Small holes in the floor (a body's size, now and then bigger), with floor all round each. */
  private holes(room: RoomData, keep: Keep): void {
    const small = MINE_HOLES.flatMap((hole, i) => (hole.w === 1 && hole.h === 1 ? [i] : []));
    const big = MINE_HOLES.flatMap((hole, i) => (hole.w > 1 || hole.h > 1 ? [i] : []));
    for (let i = this.countIn(HOLES); i > 0; i--) {
      const kinds = this.site.rng() < BIG_HOLE_CHANCE ? big : small;
      this.hole(room, kinds[Math.floor(this.site.rng() * kinds.length)], keep);
    }
  }

  private hole(room: RoomData, which: number, keep: Keep): void {
    const { w, h } = MINE_HOLES[which];
    for (let attempt = 0; attempt < HOLE_TRIES; attempt++) {
      const x = this.site.randInt(room.x + 1, room.x + room.w - 1 - w);
      const y = this.site.randInt(room.y + 1, room.y + room.h - 1 - h);
      const cells = this.box(x, y, w, h);
      const dug = new Set(cells.map(([cx, cy]) => cx + cy * this.level.width));
      if (!cells.every(([cx, cy]) => this.diggable(room, cx, cy, dug))) continue;
      if (!this.change(cells, TileType.Hole, keep)) continue;
      this.level.addPit({ x, y, shape: 'hole', lobes: which });
      this.claimBrink(cells);
      return;
    }
  }

  /** A chasm or great pit tile (a hole that belongs to no pit of its own). */
  private drop(x: number, y: number): boolean {
    return this.level.isChasm(x, y);
  }

  /** Floor at the brink of a drop: plain floor no slant crosses. */
  private brink(x: number, y: number): boolean {
    return this.site.isFloor(x, y) && !this.level.slopes.has(x + y * this.level.width);
  }

  /**
   * Old fences at the drops in the cavern, never all the way round: by their chance, along a stretch of a drop's north
   * brink (on the floor behind its edge) or of its south one (on the floor below its lip), a run of whole pieces with a
   * post closing it. Each blocks the strip at its foot, so nobody walks through a fence into the dark.
   */
  private fenceDrops(room: RoomData, props: PropPlacement[], keep: Keep): void {
    for (let y = room.y; y < room.y + room.h; y++) {
      const straight = (x: number): boolean => this.brink(x, y) && !this.drop(x - 1, y) && !this.drop(x + 1, y);
      this.fenceRow(room, y, (x) => straight(x) && this.drop(x, y + 1), NORTH_FENCE_CHANCE, false, props, keep);
      this.fenceRow(room, y, (x) => straight(x) && this.drop(x, y - 1), SOUTH_FENCE_CHANCE, true, props, keep);
    }
  }

  /**
   * Along one row, each stretch of brink (where `edge` holds, on a straight edge: not a spit of floor with the drop
   * beside it too) is fenced by its chance, along part of it.
   */
  private fenceRow(room: RoomData, y: number, edge: (x: number) => boolean, chance: number, front: boolean, props: PropPlacement[], keep: Keep): void {
    let x = room.x;
    while (x < room.x + room.w) {
      if (!edge(x)) { x++; continue; }
      let end = x;
      while (end + 1 < room.x + room.w && edge(end + 1)) end++;
      const len = end - x + 1;
      if (len >= FENCE_MIN_RUN && this.site.rng() < chance) {
        const run = this.site.randInt(FENCE_MIN_RUN, Math.max(FENCE_MIN_RUN, Math.min(FENCE_MAX_RUN, Math.ceil(len * FENCE_MAX_SHARE))));
        this.fence(room, this.site.randInt(x, end - run + 1), y, run, front, props, keep);
      }
      x = end + 1;
    }
  }

  /**
   * A run of fence `len` tiles long from (x, y) to the right, with a post at its right end; kept only if no way is cut
   * and no part of the cavern shut off.
   */
  private fence(room: RoomData, x: number, y: number, len: number, front: boolean, props: PropPlacement[], keep: Keep): void {
    const cells = this.box(x, y, len, 1);
    if (!this.change(cells, TileType.Obstacle, keep)) return;
    const W = this.level.width;
    const strip = front ? { y0: 0, y1: FRONT_FENCE_FOOT + 1 } : { y0: PROP_GROUND - FENCE_FOOT, y1: PROP_GROUND };
    for (const [cx] of cells) {
      this.level.blockBoxes.set(cx + y * W, { x0: 0, x1: TILE_WIDTH, ...strip });
      props.push({ kind: front ? 'mine_fence_front' : 'mine_fence', tx: cx, ty: y });
    }
    props.push({ kind: front ? 'mine_fence_front_post' : 'mine_fence_post', tx: x + len - 1, ty: y, dx: END_POST_SHIFT });
  }

  // ── Kinds of cavern ──────────────────────────────────────────────────────────

  /** A gallery: pit props standing in rows in from the north and south walls, a lantern post among them. */
  private gallery(room: RoomData, props: PropPlacement[], keep: Keep): boolean {
    if (room.w < GALLERY_MIN_W || room.h < GALLERY_MIN_H) return false;
    const rows = [room.y + POST_INSET_Y, room.y + room.h - 1 - POST_INSET_Y];
    let placed = 0;
    for (let x = room.x + POST_INSET_X; x <= room.x + room.w - 1 - POST_INSET_X; x += POST_STEP) {
      for (const y of rows) placed += this.galleryPost(x, y, placed, props, keep) ? 1 : 0;
    }
    return placed > 0;
  }

  /** One of a gallery's props at (x, y): a lantern post now and then, else a plain one. */
  private galleryPost(x: number, y: number, placed: number, props: PropPlacement[], keep: Keep): boolean {
    const kind = this.site.pickProp(placed % LANTERN_POST_EVERY === 1 ? MINE_LANTERN_POSTS : MINE_POSTS);
    return this.site.placeSolid([[x, y]], [kind], props, keep);
  }

  /** A rockfall: great boulders, heaps of rubble and clusters of stalagmites. */
  private rockfall(room: RoomData, props: PropPlacement[], keep: Keep): boolean {
    const open = this.site.shuffledFreeTiles(room);
    for (let i = this.countIn(ROCKFALL_BOULDERS); i > 0; i--) this.site.scatterSolid(room, open, MINE_BIG_ROCKS, props, keep);
    for (let i = this.countIn(ROCKFALL_RUBBLE); i > 0; i--) this.site.scatterSolid(room, open, MINE_RUBBLE, props, keep);
    for (let i = this.countIn(STALAGMITES); i > 0; i--) this.site.scatterSolid(room, open, MINE_STALAGMITES, props, keep);
    return true;
  }

  // ── The north face ───────────────────────────────────────────────────────────

  /** Whether the wall over floor tile (x, y) is a straight face (wall above, no slant), with plain floor at its foot. */
  private straightFace(x: number, y: number): boolean {
    const W = this.level.width;
    const slanted = this.level.slopes.has(x + y * W) || this.level.slopes.has(x + (y - 1) * W);
    return !slanted && this.site.isFloor(x, y) && this.site.isWall(x, y - 1);
  }

  /** A straight face standing its full height over floor tile (x, y): not cut short by anything close behind it. */
  private fullFace(x: number, y: number): boolean {
    return this.straightFace(x, y) && !someTile(x, y - FACE_ROWS, x, y - 1, (tx, ty) => !this.site.isWall(tx, ty));
  }

  /** Whether `span` tiles of full face run on from x - half to x + half over floor row y, their floor free. */
  private faceRun(x: number, y: number, span: number): boolean {
    const half = Math.floor(span / 2);
    return !someTile(x - half, y, x + half, y, (tx, ty) => !this.fullFace(tx, ty) || !this.site.free(tx, ty));
  }

  /**
   * Along the cavern's north face, wherever it stands its full height: the old timbering against the rock now and then,
   * lanterns hung between, cobwebs at the face's ends and here and there, bracket fungi. Its foot may have stepped
   * forward here and there (a step in the wall), so every row of the cavern is looked along.
   */
  private dressNorthFace(room: RoomData, props: PropPlacement[]): void {
    for (let y = room.y; y < room.y + room.h; y++) this.dressFaceRow(room, y, props);
  }

  private dressFaceRow(room: RoomData, y: number, props: PropPlacement[]): void {
    let nextTimber = room.x + this.countIn([1, TIMBER_EVERY[0]]);
    let nextLantern = room.x + this.countIn([2, LANTERN_EVERY[0]]);
    for (let x = room.x; x < room.x + room.w; x++) {
      if (!this.fullFace(x, y)) continue;
      if (x >= nextTimber && this.timber(x, y, props)) nextTimber = x + this.countIn(TIMBER_EVERY);
      else if (x >= nextLantern) {
        props.push({ kind: this.site.pickProp(MINE_LANTERNS), tx: x, ty: y });
        nextLantern = x + this.countIn(LANTERN_EVERY);
      }
      this.websAndFungi(x, y, props);
    }
  }

  /** A frame against the rock over floor tile (x, y), where the face stands full under all of it. */
  private timber(x: number, y: number, props: PropPlacement[]): boolean {
    const kind = this.site.pickProp(MINE_FRAMES);
    const span = Math.ceil(PROPS[kind].rect.w / TILE_WIDTH) | 1;
    if (!this.faceRun(x, y, span)) return false;
    props.push({ kind, tx: x, ty: y });
    return true;
  }

  private websAndFungi(x: number, y: number, props: PropPlacement[]): void {
    const end = !this.fullFace(x - 1, y) || !this.fullFace(x + 1, y);
    if (this.site.rng() < (end ? END_WEB_CHANCE : WEB_CHANCE)) props.push({ kind: this.site.pickProp(MINE_WEBS), tx: x, ty: y });
    else if (this.site.rng() < FUNGUS_CHANCE) props.push({ kind: this.site.pickProp(MINE_FUNGI), tx: x, ty: y });
  }

  // ── Clutter ──────────────────────────────────────────────────────────────────

  /** The floor's clutter: rocks, stones, stalagmites, mushroom tables, pebbles, plants and roots. */
  private clutter(room: RoomData, props: PropPlacement[], keep: Keep): void {
    const open = this.site.shuffledFreeTiles(room);
    const solid = (count: readonly [number, number], kinds: readonly PropKind[]): void => {
      for (let i = this.countIn(count); i > 0; i--) this.site.scatterSolid(room, open, kinds, props, keep);
    };
    solid(ROCKS, MINE_ROCKS);
    solid(STONES, MINE_STONES);
    solid(STALAGMITES, MINE_STALAGMITES);
    solid(SHROOM_TABLES, MINE_SHROOM_TABLES);
    if (this.site.rng() < TRESTLE_CHANCE) this.site.scatterSolid(room, open, ['mine_trestle'], props, keep);
    this.clumps(open, MINE_PLANTS, PLANT_CLUMPS, props, (x, y) => this.byDrop(x, y) || this.byRock(x, y) || this.byOtherEarth(x, y));
    this.clumps(open, MINE_PEBBLES, PEBBLE_CLUMPS, props, (x, y) => this.byRock(x, y));
    this.clumps(open, MINE_SMALL_STALAGMITES, STALAGMITE_CLUMPS, props, (x, y) => this.byRock(x, y));
    for (let i = this.countIn(ROOTS); i > 0; i--) placeFlat(this.site, room, this.site.pickProp(MINE_ROOTS), props);
  }

  /** Clumps of walk-through props, each grown from a free tile where `grows` (the clump spreads to the tiles round it). */
  private clumps(open: TilePos[], kinds: readonly PropKind[], count: readonly [number, number], props: PropPlacement[], grows: (x: number, y: number) => boolean): void {
    const seeds = open.filter((t) => grows(t.x, t.y));
    for (let i = this.countIn(count); i > 0 && seeds.length > 0; i--) {
      const [seed] = seeds.splice(Math.floor(this.site.rng() * seeds.length), 1);
      this.clump(seed, kinds, this.countIn(CLUMP_SIZE), props);
    }
  }

  /** One clump: its first prop on the seed, the rest on free tiles round it (in a random order), each nudged off-centre. */
  private clump(seed: TilePos, kinds: readonly PropKind[], size: number, props: PropPlacement[]): void {
    const round = RING.map(([dx, dy]) => ({ x: seed.x + dx, y: seed.y + dy })).sort(() => this.site.rng() - 0.5);
    let placed = 0;
    for (const spot of [seed, ...round]) {
      if (placed >= size || !this.site.free(spot.x, spot.y)) continue;
      this.site.claim(spot.x, spot.y);
      const dx = Math.round((this.site.rng() * 2 - 1) * CLUMP_JITTER);
      props.push({ kind: this.site.pickProp(kinds), tx: spot.x, ty: spot.y, dx });
      placed++;
    }
  }

  /** Whether a tile lies beside a drop or a hole in the floor. */
  private byDrop(x: number, y: number): boolean {
    return RING.some(([dx, dy]) => this.level.getTile(x + dx, y + dy)?.type === TileType.Hole);
  }

  /** Whether a tile lies at the rock's feet (the rock beside it, or a slanted wall). */
  private byRock(x: number, y: number): boolean {
    return STEPS.some(([dx, dy]) => this.site.isWall(x + dx, y + dy) || this.level.slopes.has(x + dx + (y + dy) * this.level.width));
  }

  /** Whether a tile lies at the edge of a patch of other earth (a neighbour's earth is another tone). */
  private byOtherEarth(x: number, y: number): boolean {
    const tone = mineFloorTone(this.level, x, y);
    return STEPS.some(([dx, dy]) => this.site.isFloor(x + dx, y + dy) && mineFloorTone(this.level, x + dx, y + dy) !== tone);
  }
}
