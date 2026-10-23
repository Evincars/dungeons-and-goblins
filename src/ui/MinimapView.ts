import { Container, Graphics } from 'pixi.js';
import { q, localPlayer } from '../world';
import type { Level } from '../level/Level';
import { TileType, TILE_WIDTH, TILE_HEIGHT } from '../level/TileType';
import { text } from '../core/texts';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

/** The map fits in this much of the dialog (game pixels); each tile is a whole number of pixels, at least this many. */
const MAX_W = 360;
const MAX_H = 200;
const MIN_CELL = 2;
/** Room under the map for the key to its marks. */
const LEGEND_H = 14;
const LEGEND_GAP = 10;
const LEGEND_MARK = 6;

/** The map's colours: unexplored dark, floor (safe room and cave tinted), walls, holes outlined in red. */
const COLORS = {
  unseen: 0x07080a,
  floor: 0x5b6573,
  safe: 0x4e7a62,
  cave: 0x5d5446,
  wall: 0x23272e,
  hole: 0x2a0808,
  holeEdge: 0xc04040,
  treasure: 0xffcc33,
  openedTreasure: 0x7a6a3a,
  you: 0xffffff,
  ally: 0x6fa8ff,
} as const;

type Shade = Exclude<keyof typeof COLORS, 'holeEdge' | 'treasure' | 'openedTreasure' | 'you' | 'ally'>;

/** A tile counts as explored once all four of its corners have been seen. */
function explored(level: Level, tx: number, ty: number): boolean {
  return level.isSeen(tx, ty) && level.isSeen(tx + 1, ty) && level.isSeen(tx, ty + 1) && level.isSeen(tx + 1, ty + 1);
}

/** What an explored tile is drawn as. */
function shadeOf(level: Level, tx: number, ty: number): Shade {
  if (!explored(level, tx, ty)) return 'unseen';
  const type = level.getTile(tx, ty)?.type;
  if (type === TileType.Hole) return 'hole';
  if (type === TileType.Wall || type === TileType.BreakableWall) return 'wall';
  if (level.isSafeZone(tx, ty)) return 'safe';
  return level.caveFloor.has(tx + ty * level.width) ? 'cave' : 'floor';
}

/**
 * The explored dungeon in plain shapes, for the HUD's map: floor, walls and holes as squares, treasure chests
 * as gold dots (dim once opened), the hero white and the other players blue. Only what has been seen shows.
 */
export class MinimapView {
  readonly view = new Container();
  private readonly shapes = new Graphics();
  private readonly marks = new Graphics();
  private readonly key: Container;
  private cell = MIN_CELL;
  /** The view's size, set by the last draw (the dialog is sized to it). */
  width = MAX_W;
  height = MAX_H;

  constructor() {
    this.key = this.legend();
    this.view.addChild(this.shapes, this.marks, this.key);
  }

  /** A key under the map: what the dots and red squares mean. */
  private legend(): Container {
    const legend = new Container();
    const entries = [
      { color: COLORS.you, label: text('map.legend.you'), round: true },
      { color: COLORS.treasure, label: text('map.legend.treasure'), round: true },
      { color: COLORS.holeEdge, label: text('map.legend.hole'), round: false },
    ];
    let x = 0;
    for (const entry of entries) {
      const mark = new Graphics();
      if (entry.round) mark.circle(x + LEGEND_MARK / 2, LEGEND_MARK / 2 + 1, LEGEND_MARK / 2).fill({ color: entry.color });
      else mark.rect(x, 1, LEGEND_MARK, LEGEND_MARK).fill({ color: COLORS.hole }).stroke({ color: entry.color, width: 1, alignment: 1 });
      const label = new PixelLabel(entry.label, { color: THEME.muted, shadow: true });
      label.position.set(x + LEGEND_MARK + 3, 0);
      legend.addChild(mark, label);
      x += LEGEND_MARK + 3 + label.textWidth + LEGEND_GAP;
    }
    return legend;
  }

  /** Draws the level as it has been explored so far. */
  draw(level: Level): void {
    this.cell = Math.max(MIN_CELL, Math.floor(Math.min(MAX_W / level.width, MAX_H / level.height)));
    this.width = this.cell * level.width;
    const mapH = this.cell * level.height;
    this.height = mapH + LEGEND_H;
    this.key.position.set(0, mapH + 4);
    this.shapes.clear();
    for (let ty = 0; ty < level.height; ty++) this.drawRow(level, ty);
    this.drawPits(level);
    this.drawMarks(level);
  }

  /** One row of tiles, neighbours of the same shade drawn as one strip. */
  private drawRow(level: Level, ty: number): void {
    let start = 0;
    let shade = shadeOf(level, 0, ty);
    for (let tx = 1; tx <= level.width; tx++) {
      const next = tx < level.width ? shadeOf(level, tx, ty) : null;
      if (next === shade) continue;
      this.shapes.rect(start * this.cell, ty * this.cell, (tx - start) * this.cell, this.cell).fill({ color: COLORS[shade] });
      start = tx;
      if (next) shade = next;
    }
  }

  /** A red outline round every hole that has been seen: a framed 2×2 pit as one square, a loose hole on its own. */
  private drawPits(level: Level): void {
    const c = this.cell;
    const inPit = new Set<number>();
    for (const pit of level.pits) {
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) inPit.add(pit.x + dx + (pit.y + dy) * level.width);
      if (!explored(level, pit.x, pit.y)) continue;
      this.shapes.rect(pit.x * c, pit.y * c, 2 * c, 2 * c).stroke({ color: COLORS.holeEdge, width: 1, alignment: 1 });
    }
    for (let i = 0; i < level.width * level.height; i++) {
      const tx = i % level.width;
      const ty = Math.floor(i / level.width);
      if (inPit.has(i) || shadeOf(level, tx, ty) !== 'hole') continue;
      this.shapes.rect(tx * c, ty * c, c, c).stroke({ color: COLORS.holeEdge, width: 1, alignment: 1 });
    }
  }

  /** Treasure chests where the ground under them has been seen, then every player (the hero last, on top). */
  private drawMarks(level: Level): void {
    const c = this.cell;
    const dot = Math.max(1.5, c * 0.7);
    this.marks.clear();
    for (const chest of q.chests) {
      const tx = Math.floor(chest.position.x / TILE_WIDTH);
      const ty = Math.floor(chest.position.y / TILE_HEIGHT);
      if (!explored(level, tx, ty)) continue;
      this.marks.circle((tx + 0.5) * c, (ty + 0.5) * c, dot).fill({ color: chest.chest.opened ? COLORS.openedTreasure : COLORS.treasure });
    }
    const me = localPlayer();
    for (const player of q.players) {
      if (player === me) continue;
      this.marks.circle((player.position.x / TILE_WIDTH) * c, (player.position.y / TILE_HEIGHT) * c, dot).fill({ color: COLORS.ally });
    }
    if (me) this.marks.circle((me.position.x / TILE_WIDTH) * c, (me.position.y / TILE_HEIGHT) * c, dot + 0.5).fill({ color: COLORS.you }).stroke({ color: 0x000000, width: 1 });
  }
}
