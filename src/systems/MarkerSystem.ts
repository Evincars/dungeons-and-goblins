import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { Entity } from '../world';
import { focusedEntity } from './TargetSystem';

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

function draw(g: Graphics, halfW: number, halfH: number): void {
  const arm = Math.min(ARM, halfW, halfH);
  g.clear();
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const cx = sx * halfW;
      const cy = sy * halfH;
      g.moveTo(cx - sx * arm, cy).lineTo(cx, cy).lineTo(cx, cy - sy * arm);
    }
  }
  g.stroke({ color: COLOR, width: 1, alignment: 0.5 });
  drawn.halfW = halfW;
  drawn.halfH = halfH;
}

/** Half the size of what is drawn of an entity: its sprite, or (a stash, which has none of its own) its body. */
function halfSize(e: Entity): { w: number; h: number } {
  if (e.sprite && !e.sprite.destroyed) return { w: e.sprite.width / 2, h: e.sprite.height / 2 };
  return { w: e.radius?.x ?? ARM, h: e.yOffset ?? e.radius?.y ?? ARM };
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
  const size = halfSize(target);
  const halfW = Math.round(size.w) + MARGIN + swing;
  const halfH = Math.round(size.h) + MARGIN + swing;
  if (drawn.halfW !== halfW || drawn.halfH !== halfH) draw(g, halfW, halfH);
  g.position.set(Math.round(target.position.x), Math.round(target.position.y - (target.yOffset ?? 0)));
}
