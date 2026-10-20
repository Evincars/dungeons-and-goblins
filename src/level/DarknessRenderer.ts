import { Container, Sprite } from 'pixi.js';
import type { Texture } from 'pixi.js';
import type { Level } from './Level';
import { TILE_WIDTH, TILE_HEIGHT } from './TileType';
import { frameTexture } from '../render/Sheets';
import { camera, GAME_WIDTH, VIEW_HEIGHT } from '../render/Camera';
import { forEachTile } from './Grid';

const Y_OFFSET = -16;
/** The 'dark' sheet is a 3×5 grid of fog edge and corner pieces. */
const DARK_COLS = 3;
const DARK_ROWS = 5;

/**
 * Fog of war: each tile's four corners are seen or not, and the mix picks a soft edge piece. Sprites
 * come from a pool that grows to the busiest view and is reused every frame.
 */
export class DarknessRenderer {
  readonly container = new Container();
  private pool: Sprite[] = [];
  private used = 0;
  private level: Level | null = null;
  /** Fog pieces by [col][row], resolved once the sheet is loaded. */
  private pieces: Texture[][] | null = null;

  private piece(col: number, row: number): Texture {
    if (!this.pieces) {
      this.pieces = Array.from({ length: DARK_COLS }, (_, c) =>
        Array.from({ length: DARK_ROWS }, (_unused, r) => frameTexture('dark', c, r)));
    }
    return this.pieces[col][row];
  }

  private take(col: number, row: number, x: number, y: number): void {
    let sprite = this.pool[this.used];
    if (!sprite) {
      sprite = new Sprite();
      this.container.addChild(sprite);
      this.pool.push(sprite);
    }
    sprite.texture = this.piece(col, row);
    sprite.x = x;
    sprite.y = y;
    sprite.visible = true;
    this.used++;
  }

  update(level: Level): void {
    this.used = 0;
    this.level = level;

    const tx0 = Math.max(0, Math.floor(camera.x / TILE_WIDTH) - 1);
    const ty0 = Math.max(0, Math.floor(camera.y / TILE_HEIGHT) - 1);
    const tx1 = Math.min(level.width - 1, Math.ceil((camera.x + GAME_WIDTH) / TILE_WIDTH) + 1);
    const ty1 = Math.min(level.height - 1, Math.ceil((camera.y + VIEW_HEIGHT) / TILE_HEIGHT) + 1);
    forEachTile(tx0, ty0, tx1, ty1, this.drawCell);

    for (let i = this.used; i < this.pool.length; i++) this.pool[i].visible = false;
  }

  /** Covers one tile with the fog piece matching which of its corners are unseen. */
  private readonly drawCell = (tx: number, ty: number): void => {
    const level = this.level;
    if (!level) return;
    const c0 = !level.isSeen(tx, ty);
    const c1 = !level.isSeen(tx + 1, ty);
    const c2 = !level.isSeen(tx, ty + 1);
    const c3 = !level.isSeen(tx + 1, ty + 1);
    const count = (c0 ? 1 : 0) + (c1 ? 1 : 0) + (c2 ? 1 : 0) + (c3 ? 1 : 0);
    if (count === 0) return;

    const x = tx * TILE_WIDTH;
    const y = ty * TILE_HEIGHT + Y_OFFSET;
    if (count === 4) {
      this.take(1, 1, x, y);
    } else if (count === 3) {
      if (!c0) this.take(1, 4, x, y);
      if (!c1) this.take(0, 4, x, y);
      if (!c2) this.take(1, 3, x, y);
      if (!c3) this.take(0, 3, x, y);
    } else if (count === 1) {
      if (c0) this.take(2, 2, x, y);
      if (c1) this.take(0, 2, x, y);
      if (c2) this.take(2, 0, x, y);
      if (c3) this.take(0, 0, x, y);
    } else {
      this.drawPair(c0, c1, c2, c3, x, y);
    }
  };

  /** Two unseen corners: a straight edge, or a diagonal pair. */
  private drawPair(c0: boolean, c1: boolean, c2: boolean, c3: boolean, x: number, y: number): void {
    if (c0 && c3) this.take(2, 4, x, y);
    if (c1 && c2) this.take(2, 3, x, y);
    if (c0 && c1) this.take(1, 2, x, y);
    if (c2 && c3) this.take(1, 0, x, y);
    if (c0 && c2) this.take(2, 1, x, y);
    if (c1 && c3) this.take(0, 1, x, y);
  }

  destroy(): void { this.container.destroy({ children: true }); }
}
