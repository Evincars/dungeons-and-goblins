import type { Level } from '../Level';
import { TileType, TILE_WIDTH } from '../TileType';
import { forEachTile, someTile, tileHash } from '../Grid';
import type { SlopeCorner } from '../Slopes';
import { cutSlantCorner, cutSlantSpur, slantFits } from './Slants';
import type { SpurSide } from './Slants';
import { MINE_FLOOR_TONES } from '../MineTiles';
import {
  MINE_BIG_ROCKS, MINE_FRAMES, MINE_FUNGI, MINE_HOLES, MINE_LANTERN_POSTS, MINE_LANTERNS, MINE_LOOSE_RUBBLE, MINE_PEBBLES,
  MINE_PLANTS, MINE_POSTS, MINE_ROCKS, MINE_ROOTS, MINE_SHROOM_TABLES, MINE_SMALL_STALAGMITES, MINE_SOLID_RUBBLE,
  MINE_STALAGMITES, MINE_SUPPORTS, MINE_WEBS, PROPS,
} from '../Props';
import type { PropKind, PropPlacement } from '../Props';
import { placeFlat } from './IsoDresser';
import type { IsoSite } from './IsoDresser';
import type { Keep, RoomData } from './DungeonBuilder';

/**
 * Dresses the rooms of the forgotten mines (Theme 'mines'), on the layout DungeonBuilder carved: caverns with their
 * corners cut off on the slant (all four, mostly), earth of other colours lying about in patches; an abyss across a
 * cavern with a rock bridge over it, or a great pit sunk in its floor, fenced off; galleries of pit props, rockfalls of
 * great boulders; the old timbering against the rock faces (frames, supports), lanterns of cold green light on posts and
 * hung on the rock, cobwebs and bracket fungi on the faces; pebbles, reeds and flowers, mushroom tables, holes and roots
 * on the floor. Every change that could cut a way off goes through `keep`.
 */

type RoomKind = 'chasm' | 'pit' | 'gallery' | 'rockfall' | 'plain';

/** How a cavern is dressed, by a roll: each kind up to its share (if the cavern is big enough), else plain. */
const KIND_SHARES: ReadonlyArray<[RoomKind, number]> = [['chasm', 0.3], ['pit', 0.55], ['gallery', 0.75], ['rockfall', 0.9]];
/** The ground a cavern is floored with (brown earth, grey-green clay, slate, rust), by weight. */
const TONE_WEIGHTS = [0.55, 0.2, 0.1, 0.15];
/** Patches of other earth in a cavern: how many, and how big (tiles across and down). */
const PATCHES = [1, 3] as const;
const PATCH_W = [3, 9] as const;
const PATCH_H = [3, 7] as const;
/** Chance each north corner, and each south one, is cut off on the slant, and how deep a slant may go. */
const NORTH_SLANT_CHANCE = 0.9;
const SOUTH_SLANT_CHANCE = 0.75;
const SLANT_DEPTH_MAX = 4;
/**
 * Spurs of rock jutting out of a cavern's north and south walls between its corners (its walls zigzag as a cave's do):
 * each this deep (four times that across), tried every few tiles along the wall by their chance.
 */
const SPUR_DEPTH = [1, 2] as const;
const SPUR_CHANCE = 0.7;
const SPUR_GAP = [1, 3] as const;
/** Spurs keep this many tiles from the cavern's corners, for the slants cut there. */
const SPUR_CORNER_GAP = 4;
/**
 * An abyss across a cavern: this deep, with this much floor kept above and below it, a ledge a tile wide along each side
 * wall, and a rock bridge two tiles wide over it.
 */
const CHASM_DEPTH = [3, 5] as const;
const CHASM_FLOOR_ABOVE = 2;
const CHASM_FLOOR_BELOW = 2;
const CHASM_MIN_W = 8;
const BRIDGE_W = 2;
/** A pit sunk in a cavern's floor: its main hole this big, a lobe or two off it, this far from the walls, a few tries. */
const PIT_W = [3, 8] as const;
const PIT_H = [2, 5] as const;
const PIT_LOBES = [1, 2] as const;
const PIT_MARGIN = 2;
const PIT_TRIES = 6;
/** One fence piece in this many is missing (the fences are old). */
const FENCE_GAP_EVERY = 7;
/** A side fence stands this far off its tile's middle, on the edge of the drop. */
const SIDE_FENCE_SHIFT = 13;
/** An end post stands this far right of the middle of the last fenced tile. */
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
 * Along a north face: timbering every so many tiles (a frame or a support against the rock), a lantern hung on the rock
 * between, and cobwebs (at the face's ends by their chance, and now and then along it) and bracket fungi.
 */
const TIMBER_EVERY = [4, 7] as const;
/** The share of the timbering that is a support (a post with a beam out over the floor) rather than a frame. */
const SUPPORT_SHARE = 0.4;
const LANTERN_EVERY = [5, 8] as const;
const END_WEB_CHANCE = 0.6;
const WEB_CHANCE = 0.12;
const FUNGUS_CHANCE = 0.15;
/** Lantern posts standing in a cavern (at least one lights every cavern). */
const LANTERN_POSTS = [1, 2] as const;
/** The clutter of a cavern floor. */
const PEBBLES = [4, 9] as const;
const PLANTS = [3, 8] as const;
const SHROOM_TABLES = [0, 2] as const;
const HOLES = [1, 3] as const;
const ROOTS = [3, 8] as const;
const SMALL_STALAGMITES = [2, 5] as const;
const STALAGMITES = [1, 3] as const;
const ROCKS = [1, 3] as const;
const LOOSE_RUBBLE = [1, 2] as const;
const LOGS = [0, 2] as const;
/** Chance a trestle stands in a cavern. */
const TRESTLE_CHANCE = 0.3;
/** Logs lying about (the trestle stands, and goes with the solid things). */
const LYING_LOGS: readonly PropKind[] = ['mine_log', 'mine_log2'];

type Cells = Array<[number, number]>;

export class MineDresser {
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

  private pickTone(): number {
    let roll = this.site.rng();
    for (let tone = 0; tone < MINE_FLOOR_TONES; tone++) {
      roll -= TONE_WEIGHTS[tone];
      if (roll < 0) return tone;
    }
    return 0;
  }

  // ── A cavern ─────────────────────────────────────────────────────────────────

  /** Dresses one cavern: its ground, its slants, its kind, the fences round its drops, its faces, lights and clutter. */
  dressRoom(room: RoomData, props: PropPlacement[], keep: Keep): void {
    const tone = this.pickTone();
    this.level.floorZones.push({ x: room.x, y: room.y, w: room.w, h: room.h, tone });
    this.patches(room, tone);
    for (const side of ['n', 's'] satisfies SpurSide[]) this.spurs(room, side, keep);
    this.cutCorners(room, keep);
    const kind = this.buildKind(room, props, keep);
    if (kind === 'chasm' || kind === 'pit') this.fenceDrops(room, props);
    this.dressNorthFace(room, props);
    for (let i = this.countIn(LANTERN_POSTS); i > 0; i--) this.againstWall(room, MINE_LANTERN_POSTS, props, keep);
    this.clutter(room, props, keep);
  }

  /** Lanterns hung on the north face of the safe or exit room (which is otherwise furnished as in the catacombs). */
  lightGathering(room: RoomData, props: PropPlacement[]): void {
    for (const x of [room.x + Math.floor(room.w / 3), room.x + Math.floor((room.w * 2) / 3)]) {
      if (this.straightFace(x, room.y)) props.push({ kind: this.site.pickProp(MINE_LANTERNS), tx: x, ty: room.y });
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
   * An abyss across the cavern, from a ledge along one side wall to a ledge along the other, with a rock bridge over it
   * (nobody steps into it: old pit props sink into its dark).
   */
  private chasm(room: RoomData, keep: Keep): boolean {
    const depth = this.countIn(CHASM_DEPTH);
    const lo = room.y + CHASM_FLOOR_ABOVE;
    const hi = room.y + room.h - CHASM_FLOOR_BELOW - depth;
    if (room.w < CHASM_MIN_W || hi < lo) return false;
    const top = this.site.randInt(lo, hi);
    const bridge = this.site.randInt(room.x + 2, room.x + room.w - 2 - BRIDGE_W);
    const cells: Cells = [];
    forEachTile(room.x + 1, top, room.x + room.w - 2, top + depth - 1, (x, y) => {
      if ((x < bridge || x >= bridge + BRIDGE_W) && this.site.free(x, y)) cells.push([x, y]);
    });
    if (!keep(() => this.site.setTiles(cells, TileType.Hole))) return false;
    // The bridge and the floor at either end of it stay clear, and nothing stands on the ledges.
    forEachTile(bridge, top - 1, bridge + BRIDGE_W - 1, top + depth, (x, y) => this.site.claim(x, y));
    forEachTile(room.x, top, room.x + room.w - 1, top + depth - 1, (x, y) => this.site.claim(x, y));
    return true;
  }

  /** A great pit sunk in the cavern's floor: a hole with a lobe or two off it, kept clear of the walls. */
  private pit(room: RoomData, keep: Keep): boolean {
    const x0 = room.x + PIT_MARGIN;
    const y0 = room.y + PIT_MARGIN;
    const x1 = room.x + room.w - 1 - PIT_MARGIN;
    const y1 = room.y + room.h - 1 - PIT_MARGIN;
    for (let attempt = 0; attempt < PIT_TRIES; attempt++) {
      const cells = this.pitCells(x0, y0, x1, y1);
      if (cells.length === 0 || cells.some(([x, y]) => !this.site.free(x, y))) continue;
      if (!keep(() => this.site.setTiles(cells, TileType.Hole))) continue;
      for (const [x, y] of cells) forEachTile(x - 1, y - 1, x + 1, y + 1, (tx, ty) => this.site.claim(tx, ty));
      return true;
    }
    return false;
  }

  /** The tiles of a pit inside the box (x0, y0)–(x1, y1): its main hole and its lobes, or none if it does not fit. */
  private pitCells(x0: number, y0: number, x1: number, y1: number): Cells {
    const w = Math.min(x1 - x0 + 1, this.countIn(PIT_W));
    const h = Math.min(y1 - y0 + 1, this.countIn(PIT_H));
    if (w < PIT_W[0] || h < PIT_H[0]) return [];
    const px = this.site.randInt(x0, x1 - w + 1);
    const py = this.site.randInt(y0, y1 - h + 1);
    const taken = new Set<number>();
    const cells: Cells = [];
    const add = (x: number, y: number): void => {
      const key = x + y * this.level.width;
      if (taken.has(key) || x < x0 || y < y0 || x > x1 || y > y1) return;
      taken.add(key);
      cells.push([x, y]);
    };
    forEachTile(px, py, px + w - 1, py + h - 1, add);
    for (let i = this.countIn(PIT_LOBES); i > 0; i--) {
      const lw = this.site.randInt(1, Math.max(1, w - 1));
      const lh = this.site.randInt(1, Math.max(1, h - 1));
      const lx = px + this.site.randInt(-1, w - lw + 1);
      const ly = py + this.site.randInt(-1, h - lh + 1);
      forEachTile(lx, ly, lx + lw - 1, ly + lh - 1, add);
    }
    return cells;
  }

  /**
   * Old fences round every drop in the cavern: along its north edge (on the floor at the brink), along its south edge (on
   * its lip) and down its sides, a piece missing now and then; a post where a fence along the north or south ends.
   */
  private fenceDrops(room: RoomData, props: PropPlacement[]): void {
    forEachTile(room.x - 1, room.y - 1, room.x + room.w, room.y + room.h, (x, y) => {
      if (!this.drop(x, y)) return;
      if (this.brink(x, y - 1)) this.fence(x, y - 1, 'mine_fence', 0, this.drop(x + 1, y) && this.brink(x + 1, y - 1), props);
      if (this.brink(x, y + 1)) this.fence(x, y, 'mine_fence', 0, this.drop(x + 1, y) && this.brink(x + 1, y + 1), props);
      if (this.brink(x - 1, y)) this.fence(x - 1, y, 'mine_fence_side', SIDE_FENCE_SHIFT, true, props);
      if (this.brink(x + 1, y)) this.fence(x + 1, y, 'mine_fence_side', -SIDE_FENCE_SHIFT, true, props);
    });
  }

  private fence(x: number, y: number, kind: PropKind, dx: number, runsOn: boolean, props: PropPlacement[]): void {
    if (tileHash(x, y) % FENCE_GAP_EVERY === 0) return;
    props.push(dx === 0 ? { kind, tx: x, ty: y } : { kind, tx: x, ty: y, dx });
    if (kind === 'mine_fence' && !runsOn) props.push({ kind: 'mine_fence_post', tx: x, ty: y, dx: END_POST_SHIFT });
  }

  /** A chasm or pit tile (a hole that belongs to no trap pit). */
  private drop(x: number, y: number): boolean {
    return this.level.getTile(x, y)?.type === TileType.Hole && this.level.isChasm(x, y);
  }

  /** Floor at the brink of a drop: plain floor no slant crosses. */
  private brink(x: number, y: number): boolean {
    return this.site.isFloor(x, y) && !this.level.slopes.has(x + y * this.level.width);
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
    for (let i = this.countIn(ROCKFALL_RUBBLE); i > 0; i--) this.site.scatterSolid(room, open, MINE_SOLID_RUBBLE, props, keep);
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

  /** Whether `span` tiles of straight face run on from x - half to x + half over floor row y. */
  private faceRun(x: number, y: number, span: number): boolean {
    const half = Math.floor(span / 2);
    return !someTile(x - half, y, x + half, y, (tx, ty) => !this.straightFace(tx, ty) || !this.site.free(tx, ty));
  }

  /**
   * Along the cavern's north face: the old timbering against the rock now and then (a frame or a support), lanterns hung
   * between, cobwebs at the face's ends and here and there, bracket fungi.
   */
  private dressNorthFace(room: RoomData, props: PropPlacement[]): void {
    const y = room.y;
    let nextTimber = room.x + this.countIn([1, TIMBER_EVERY[0]]);
    let nextLantern = room.x + this.countIn([2, LANTERN_EVERY[0]]);
    for (let x = room.x; x < room.x + room.w; x++) {
      if (!this.straightFace(x, y)) continue;
      if (x >= nextTimber && this.timber(x, y, props)) nextTimber = x + this.countIn(TIMBER_EVERY);
      else if (x >= nextLantern) {
        props.push({ kind: this.site.pickProp(MINE_LANTERNS), tx: x, ty: y });
        nextLantern = x + this.countIn(LANTERN_EVERY);
      }
      this.websAndFungi(x, y, props);
    }
  }

  /** A frame or support against the rock over floor tile (x, y), where the face runs on straight under all of it. */
  private timber(x: number, y: number, props: PropPlacement[]): boolean {
    const kind = this.site.pickProp(this.site.rng() < SUPPORT_SHARE ? MINE_SUPPORTS : MINE_FRAMES);
    const span = Math.ceil(PROPS[kind].rect.w / TILE_WIDTH) | 1;
    if (!this.faceRun(x, y, span)) return false;
    props.push({ kind, tx: x, ty: y });
    return true;
  }

  private websAndFungi(x: number, y: number, props: PropPlacement[]): void {
    const end = !this.straightFace(x - 1, y) || !this.straightFace(x + 1, y);
    if (this.site.rng() < (end ? END_WEB_CHANCE : WEB_CHANCE)) props.push({ kind: this.site.pickProp(MINE_WEBS), tx: x, ty: y });
    else if (this.site.rng() < FUNGUS_CHANCE) props.push({ kind: this.site.pickProp(MINE_FUNGI), tx: x, ty: y });
  }

  // ── Clutter ──────────────────────────────────────────────────────────────────

  /** Something solid against one of the cavern's walls (a lantern post), where it stands clear. */
  private againstWall(room: RoomData, kinds: readonly PropKind[], props: PropPlacement[], keep: Keep): void {
    this.site.urnsAlongWalls(room, 1, props, keep, kinds);
  }

  /** The floor's clutter: rocks, stalagmites, rubble, mushroom tables, pebbles, plants, logs, holes and roots. */
  private clutter(room: RoomData, props: PropPlacement[], keep: Keep): void {
    const open = this.site.shuffledFreeTiles(room);
    for (let i = this.countIn(ROCKS); i > 0; i--) this.site.scatterSolid(room, open, MINE_ROCKS, props, keep);
    for (let i = this.countIn(STALAGMITES); i > 0; i--) this.site.scatterSolid(room, open, MINE_STALAGMITES, props, keep);
    for (let i = this.countIn(SHROOM_TABLES); i > 0; i--) this.site.scatterSolid(room, open, MINE_SHROOM_TABLES, props, keep);
    if (this.site.rng() < TRESTLE_CHANCE) this.site.scatterSolid(room, open, ['mine_trestle'], props, keep);
    this.site.scatterLoose(open, MINE_SMALL_STALAGMITES, this.countIn(SMALL_STALAGMITES), props);
    this.site.scatterLoose(open, MINE_LOOSE_RUBBLE, this.countIn(LOOSE_RUBBLE), props);
    this.site.scatterLoose(open, MINE_PEBBLES, this.countIn(PEBBLES), props);
    this.site.scatterLoose(open, MINE_PLANTS, this.countIn(PLANTS), props);
    this.site.scatterLoose(open, LYING_LOGS, this.countIn(LOGS), props);
    for (let i = this.countIn(HOLES); i > 0; i--) placeFlat(this.site, room, this.site.pickProp(MINE_HOLES), props);
    for (let i = this.countIn(ROOTS); i > 0; i--) placeFlat(this.site, room, this.site.pickProp(MINE_ROOTS), props);
  }
}

