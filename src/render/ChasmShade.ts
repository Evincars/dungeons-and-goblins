import { Sprite, Texture } from 'pixi.js';
import type { Level } from '../level/Level';
import { TILE_HEIGHT, TILE_WIDTH } from '../level/TileType';
import { context2d, createCanvas } from './canvas';

/**
 * The dark of the caverns' chasm (level.caveZone), drawn as one soft shape over the ground rather than tile by tile: a
 * blob of black round each of its tiles, each a little bigger or smaller and off its middle, the blobs run together and
 * blurred, so its brinks wander in curves and the ground fades into the dark over a few pixels instead of stopping at a
 * tile's straight edge. Drawn at a quarter of the world's resolution and stretched smoothly over it.
 */

/** World pixels per texel of the shade. */
const SHADE_RES = 4;
/** Each tile's blob: its radius (in tiles), how much that varies, and how far its middle may stray (in tiles). */
const BLOB_RADIUS = 0.62;
const BLOB_SPREAD = 0.16;
const BLOB_STRAY = 0.14;
/** A chasm tile's body stops this far (in tiles) short of a side that faces ground. */
const BODY_INSET = 0.25;
/** How soft the brinks are (texels of blur). */
const SHADE_BLUR = 2;

function hash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A value in [-1, 1) from a tile and a salt. */
function jitter(tx: number, ty: number, salt: number): number {
  return ((hash(tx * 3 + salt, ty) & 0xffff) / 0x8000) - 1;
}

/** Whether a tile of the caverns is chasm (its dark goes on under a bridge's planks). */
function chasmTile(level: Level, i: number): boolean {
  const tx = i % level.width;
  const ty = Math.floor(i / level.width);
  return level.bridges.has(i) || level.isChasm(tx, ty);
}

/** The chasm's shade for a level, or null when it has none. */
export function chasmShade(level: Level): Sprite | null {
  const tiles = [...level.caveZone].filter((i) => chasmTile(level, i));
  if (tiles.length === 0) return null;
  const tw = TILE_WIDTH / SHADE_RES;
  const th = TILE_HEIGHT / SHADE_RES;
  const canvas = createCanvas(Math.ceil(level.width * tw), Math.ceil(level.height * th));
  const ctx = context2d(canvas);
  ctx.filter = `blur(${SHADE_BLUR}px)`;
  ctx.fillStyle = '#000';
  const chasm = (x: number, y: number) => x >= 0 && y >= 0 && x < level.width && chasmTile(level, x + y * level.width);
  for (const i of tiles) {
    const tx = i % level.width;
    const ty = Math.floor(i / level.width);
    // The tile's body, drawn in from its sides that face ground (the blobs round those off), so no ground shows between
    // its blobs inside the chasm.
    const x0 = tx + (chasm(tx - 1, ty) ? 0 : BODY_INSET);
    const x1 = tx + 1 - (chasm(tx + 1, ty) ? 0 : BODY_INSET);
    const y0 = ty + (chasm(tx, ty - 1) ? 0 : BODY_INSET);
    const y1 = ty + 1 - (chasm(tx, ty + 1) ? 0 : BODY_INSET);
    ctx.fillRect(x0 * tw, y0 * th, (x1 - x0) * tw, (y1 - y0) * th);
    const r = BLOB_RADIUS + BLOB_SPREAD * jitter(tx, ty, 0);
    const cx = (tx + 0.5 + BLOB_STRAY * jitter(tx, ty, 1)) * tw;
    const cy = (ty + 0.5 + BLOB_STRAY * jitter(tx, ty, 2)) * th;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * tw, r * th, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const sprite = new Sprite(Texture.from(canvas));
  sprite.texture.source.scaleMode = 'linear';
  sprite.scale.set(SHADE_RES);
  return sprite;
}
