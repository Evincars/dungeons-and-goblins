import type { Level } from '../Level';
import { TileType } from '../TileType';
import { forEachTile } from '../Grid';
import type { RoomData, TileChange, TilePos } from './DungeonBuilder';

/**
 * Now and then a catacomb level runs through caverns: the rooms in the middle band of the map, and the corridors and
 * walls there, are a cave (drawn from the cave set, level/CaveTerrain.ts), and a ragged chasm runs down through it from
 * the top of the map to the bottom, crossed by wooden bridges where the ways go over it. The party comes out of the
 * catacombs into the caves, crosses, and goes back into the catacombs beyond. Every bridge is laid only where it is
 * needed to reach everything; floor the chasm cuts off from every way is lost to it.
 */

/** What the caverns need of the builder. */
export type CaveSite = {
  readonly level: Level;
  rng(): number;
  isFloor(tx: number, ty: number): boolean;
  setTiles(cells: Array<[number, number]>, type: TileType): TileChange[];
  /** Which tiles can be walked to from `from` over plain floor (1: reached), by index x + y·width. */
  reachedFrom(from: TilePos): Uint8Array;
};

/** The caverns take the rooms whose middles lie in this band of the map's width (as shares of it). */
const BAND_FROM = 0.36;
const BAND_TO = 0.64;
/** The cave reaches this many tiles round each cavern room (its walls). */
const WALL_MARGIN = 2;
/** The chasm: this many tiles across, wandering this far either side of its line as it runs down, on a wave this long. */
const CHASM_W = 3;
/** Through a cavern room the chasm opens this wide. */
const ROOM_CHASM_W = 5;
const CHASM_WANDER = 2;
const CHASM_WAVE = 0.45;
/** Where its line may run, tried in turn: through the caverns' middle, or this many tiles to one side or the other. */
const CHASM_SHIFTS = [0, -4, 4, -7, 7] as const;
/** Bridges: at most this many, never closer than this many rows to another; each two tiles wide (two rows of planks). */
const MAX_BRIDGES = 4;
const BRIDGE_ROWS = 2;
const BRIDGE_GAP = 4;

const inside = (r: RoomData, x: number, y: number, margin: number): boolean =>
  x >= r.x - margin && y >= r.y - margin && x < r.x + r.w + margin && y < r.y + r.h + margin;

/** A chasm row's run of hole tiles, and whether a bridge could cross it (floor at both ends). */
type ChasmRow = { y: number; cells: Array<[number, number]> };

export class CaveZone {
  private readonly holes = new Map<number, ChasmRow>();

  constructor(private readonly site: CaveSite) {}

  private get level(): Level {
    return this.site.level;
  }

  /**
   * Lays the caverns, if any rooms lie in the band: returns the rooms that became caves (`others`: every room left as
   * catacombs, the safe and exit rooms among them). `start` and `anchors` are what must stay reachable.
   */
  lay(rooms: readonly RoomData[], others: readonly RoomData[], start: TilePos, anchors: () => TilePos[]): RoomData[] {
    const W = this.level.width;
    const x0 = Math.floor(W * BAND_FROM);
    const x1 = Math.ceil(W * BAND_TO);
    const caves = rooms.filter((r) => r.x + r.w / 2 >= x0 && r.x + r.w / 2 <= x1);
    if (caves.length === 0) return [];
    const kept = others.filter((r) => !caves.includes(r));
    this.markZone(caves, kept, x0, x1);
    this.digChasm(caves, start, anchors);
    for (const room of caves) room.cave = true;
    return caves;
  }

  /** The cave: every cavern room and its walls, and whatever else lies in the band outside the catacomb rooms' walls. */
  private markZone(caves: readonly RoomData[], kept: readonly RoomData[], x0: number, x1: number): void {
    const { level } = this;
    forEachTile(0, 0, level.width - 1, level.height - 1, (x, y) => {
      const cave = caves.some((r) => inside(r, x, y, WALL_MARGIN));
      const band = x >= x0 && x <= x1 && !kept.some((r) => inside(r, x, y, WALL_MARGIN));
      if (!cave && !band) return;
      level.caveZone.add(x + y * level.width);
      if (this.site.isFloor(x, y)) level.caveFloor.add(x + y * level.width);
    });
  }

  /**
   * The chasm down through the caverns, its bridges, and the floor it cuts off. Its line runs through the middle of the
   * biggest cavern (wide there), or a little to one side or the other where that cannot be bridged (a corridor running
   * along it).
   */
  private digChasm(caves: readonly RoomData[], start: TilePos, anchors: () => TilePos[]): void {
    const biggest = caves.reduce((best, r) => (r.w * r.h > best.w * best.h ? r : best));
    const mid = Math.round(biggest.x + biggest.w / 2);
    for (const offset of CHASM_SHIFTS) {
      if (this.tryChasm(mid + offset, caves, start, anchors)) return;
    }
  }

  /** One try at a chasm along column `mid`: kept if bridges can join everything again, else undone. */
  private tryChasm(mid: number, caves: readonly RoomData[], start: TilePos, anchors: () => TilePos[]): boolean {
    this.holes.clear();
    const phase = this.site.rng() * Math.PI * 2;
    const changes: TileChange[] = [];
    for (let y = 0; y < this.level.height; y++) {
      // The line wanders on a wave, and each row's edges a tile in or out at random: the brinks come out ragged.
      const centre = mid + Math.round(CHASM_WANDER * Math.sin(y * CHASM_WAVE + phase)) + this.jitter();
      const wide = caves.some((r) => y >= r.y && y < r.y + r.h && centre > r.x + 1 && centre < r.x + r.w - 2);
      changes.push(...this.chasmRow(centre, y, (wide ? ROOM_CHASM_W : CHASM_W) + this.jitter()));
    }
    if (changes.length === 0) return false;
    if (this.bridge(caves, start, anchors)) {
      this.swallowCutOff(start);
      return true;
    }
    for (const c of changes) this.site.setTiles([[c.x, c.y]], c.prev);
    this.level.bridges.clear();
    return false;
  }

  /** -1, 0 or +1: how far a row of the chasm strays from its line, or how much wider or narrower it runs. */
  private jitter(): number {
    return Math.floor(this.site.rng() * 3) - 1;
  }

  /** One row of the chasm, `width` tiles across: the floor of the cave across it becomes the dark. */
  private chasmRow(centre: number, y: number, width: number): TileChange[] {
    const cells: Array<[number, number]> = [];
    const W = this.level.width;
    for (let x = centre - (width >> 1); x < centre - (width >> 1) + width; x++) {
      if (this.chasmable(x, y)) cells.push([x, y]);
    }
    if (cells.length === 0) return [];
    this.holes.set(y, { y, cells });
    return this.site.setTiles(cells, TileType.Hole);
  }

  /**
   * The span a bridge at rows y and y + 1 takes: from the westmost to the eastmost hole of either row (the chasm wanders,
   * the deck runs straight), or null where the rows are not both chasm.
   */
  private span(y: number): { from: number; to: number } | null {
    const rows = [this.holes.get(y), this.holes.get(y + 1)];
    if (!rows[0] || !rows[1]) return null;
    const from = Math.min(rows[0].cells[0][0], rows[1].cells[0][0]);
    const to = Math.max(rows[0].cells[rows[0].cells.length - 1][0], rows[1].cells[rows[1].cells.length - 1][0]);
    return { from, to };
  }

  /** Floor of the cave the chasm may take: not the safe rooms', nor a slanted wall's. */
  private chasmable(x: number, y: number): boolean {
    const i = x + y * this.level.width;
    return this.site.isFloor(x, y) && this.level.caveZone.has(i) && !this.level.isSafeZone(x, y) && !this.level.slopes.has(i);
  }

  /** Whether a bridge can cross the chasm at rows y and y + 1: floor beyond both ends of its span on both rows. */
  private crossable(y: number): boolean {
    const span = this.span(y);
    if (!span) return false;
    for (let k = 0; k < BRIDGE_ROWS; k++) {
      if (!this.site.isFloor(span.from - 1, y + k) || !this.site.isFloor(span.to + 1, y + k)) return false;
    }
    return true;
  }

  /**
   * Bridges until everything is reachable again: those inside a cavern room first (a bridge over the chasm in a cave),
   * then the corridors'. At least one is laid; false if even all of them would leave something cut off.
   */
  private bridge(caves: readonly RoomData[], start: TilePos, anchors: () => TilePos[]): boolean {
    const inCave = (y: number) => caves.some((r) => y >= r.y && y + BRIDGE_ROWS <= r.y + r.h);
    const spots = [...this.holes.keys()].filter((y) => this.crossable(y));
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(this.site.rng() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    spots.sort((a, b) => Number(inCave(b)) - Number(inCave(a)));
    const laid: number[] = [];
    for (const y of spots) {
      if (laid.length >= MAX_BRIDGES || (laid.length > 0 && this.allReached(start, anchors()))) break;
      if (laid.some((other) => Math.abs(other - y) < BRIDGE_GAP)) continue;
      this.layBridge(y);
      laid.push(y);
    }
    return laid.length > 0 && this.allReached(start, anchors());
  }

  /** A bridge over its whole span on both rows: planks from brink to brink. */
  private layBridge(y: number): void {
    const span = this.span(y);
    if (!span) return;
    const cells: Array<[number, number]> = [];
    forEachTile(span.from, y, span.to, y + BRIDGE_ROWS - 1, (x, ty) => cells.push([x, ty]));
    this.site.setTiles(cells, TileType.Floor);
    for (const [x, ty] of cells) this.level.bridges.add(x + ty * this.level.width);
  }

  private allReached(start: TilePos, targets: readonly TilePos[]): boolean {
    const reached = this.site.reachedFrom(start);
    return targets.every((t) => reached[t.x + t.y * this.level.width] === 1);
  }

  /** Cave floor no way leads to any more (cut off by the chasm) falls into it: the chasm grows ragged. */
  private swallowCutOff(start: TilePos): void {
    const reached = this.site.reachedFrom(start);
    const lost: Array<[number, number]> = [];
    const W = this.level.width;
    for (const i of this.level.caveFloor) {
      const x = i % W;
      const y = Math.floor(i / W);
      if (reached[i] !== 1 && this.chasmable(x, y)) lost.push([x, y]);
    }
    this.site.setTiles(lost, TileType.Hole);
  }
}
