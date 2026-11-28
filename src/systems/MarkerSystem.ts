import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { Entity } from '../world';
import { focusedEntity } from './TargetSystem';
import { TRADER_FIGURE, TRADER_FRAME, TRADER_SCALE } from '../entities/Trader';

/**
 * The corner brackets (from Catacomb Snatch Redux) framing what this screen's player would use — a chest, the
 * lever, the shop keeper, the exit, a stash on the floor — breathing in and out a little.
 */

/** How far the brackets stand off the thing's picture, how far they swing, and how many ticks a full swing takes. */
const MARGIN = 3;
const SWING = 2;
const CYCLE_TICKS = 36;
/** Each bracket's arms are this long (shorter on a small thing). */
const ARM = 6;
const COLOR = 0xffffff;
/** Above every actor, below the fog. */
const MARKER_Z = 1_000_000;

let marker: Graphics | null = null;
let clock = 0;
/** What it was last drawn for, so it is drawn again only when that changes. */
const drawn = { halfW: -1, halfH: -1 };

/** The four corner brackets round a box `2 halfW` × `2 halfH` centred on (x, y), as a path to stroke. */
export function bracketPath(g: Graphics, x: number, y: number, halfW: number, halfH: number): Graphics {
  const arm = Math.min(ARM, halfW, halfH);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const cx = x + sx * halfW;
      const cy = y + sy * halfH;
      g.moveTo(cx - sx * arm, cy).lineTo(cx, cy).lineTo(cx, cy - sy * arm);
    }
  }
  return g;
}

function draw(g: Graphics, halfW: number, halfH: number): void {
  g.clear();
  bracketPath(g, 0, 0, halfW, halfH).stroke({ color: COLOR, width: 1, alignment: 0.5 });
  drawn.halfW = halfW;
  drawn.halfH = halfH;
}

/**
 * Where the brackets go on an entity: half the size of what is drawn of it and how far its middle lies off the sprite's
 * (the trader's figure fills only part of its frame; a stash, which has no sprite of its own, by its body).
 */
const box = { w: 0, h: 0, dx: 0, dy: 0 };
const TRADER_BOX = {
  w: ((TRADER_FIGURE.x1 - TRADER_FIGURE.x0) * TRADER_SCALE) / 2,
  h: ((TRADER_FIGURE.y1 - TRADER_FIGURE.y0) * TRADER_SCALE) / 2,
  dx: ((TRADER_FIGURE.x0 + TRADER_FIGURE.x1) / 2 - TRADER_FRAME / 2) * TRADER_SCALE,
  dy: ((TRADER_FIGURE.y0 + TRADER_FIGURE.y1) / 2 - TRADER_FRAME / 2) * TRADER_SCALE,
};

/** A chest's box: the chest itself, not its tall frame (most of it empty above a closed lid). */
const CHEST_BOX = { w: 11, h: 10, dx: 0, dy: 8 };

function boxOf(e: Entity): typeof box {
  if (e.shopNpc) return Object.assign(box, TRADER_BOX);
  if (e.chest) return Object.assign(box, CHEST_BOX);
  box.dx = 0;
  box.dy = 0;
  if (e.sprite && !e.sprite.destroyed) {
    box.w = e.sprite.width / 2;
    box.h = e.sprite.height / 2;
    return box;
  }
  box.w = e.radius?.x ?? ARM;
  box.h = e.yOffset ?? e.radius?.y ?? ARM;
  return box;
}

/** The brackets' graphic, made again for each level's layer. */
function markerIn(gameLayer: Container): Graphics {
  if (marker && !marker.destroyed && marker.parent === gameLayer) return marker;
  marker = new Graphics();
  marker.zIndex = MARKER_Z;
  gameLayer.addChild(marker);
  drawn.halfW = -1;
  return marker;
}

export function updateMarker(gameLayer: Container): void {
  const g = markerIn(gameLayer);
  const target = focusedEntity();
  g.visible = !!target?.position;
  if (!target?.position) return;
  clock = (clock + 1) % CYCLE_TICKS;
  const swing = Math.round(SWING * Math.sin((clock / CYCLE_TICKS) * Math.PI * 2));
  const size = boxOf(target);
  const halfW = Math.round(size.w) + MARGIN + swing;
  const halfH = Math.round(size.h) + MARGIN + swing;
  if (drawn.halfW !== halfW || drawn.halfH !== halfH) draw(g, halfW, halfH);
  g.position.set(Math.round(target.position.x + size.dx), Math.round(target.position.y - (target.yOffset ?? 0) + size.dy));
}
