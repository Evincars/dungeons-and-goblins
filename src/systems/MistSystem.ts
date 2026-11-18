import { Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { Entity } from '../world';
import { world } from '../world';
import { mistTexture } from '../level/FogRenderer';
import { context2d, createCanvas } from '../render/canvas';

/**
 * Mist breathing out of the portals of the safe and exit rooms: the same drifting cloud as the fog over the unexplored
 * (level/FogRenderer.ts), in two thin sheets rising out of the doorway, densest at its foot and thinning upward and to
 * the sides, never thick. Every screen draws it for itself, just in front of the portal's arch.
 */

/** The patch of mist: this wide and tall, its foot this far below the portal's foot (spilling onto the floor). */
const MIST_W = 76;
const MIST_H = 92;
const MIST_SPILL = 8;
/** How see-through it is at most, and how it swells and thins (by this much, over a breath this many ticks long). */
const MIST_ALPHA = 0.9;
const BREATH = 0.15;
const BREATH_TICKS = 240;
/** Two sheets rising (px per tick) and drifting aside at different sizes. */
const MIST_LAYERS = [
  { scale: 1.1, alpha: 0.85, tint: 0xc4cad4, rise: 0.32, drift: 0.05 },
  { scale: 1.9, alpha: 0.6, tint: 0x9098a6, rise: 0.18, drift: -0.04 },
] as const;
/** The shape of the patch: an ellipse this far up its height and this wide, fading out from there. */
const SHAPE_CENTRE_Y = 0.82;
const SHAPE_RADIUS = 0.72;
const SHAPE_SQUASH = 0.75;
/** Just in front of the arch. */
const IN_FRONT = 0.5;

const portals = world.with('position', 'mist');
type MistView = { root: Container; layers: TilingSprite[]; phase: number };
const views = new Map<Entity, MistView>();
let cloud: Texture | null = null;
let shape: Texture | null = null;

/** The mask: white, strongest low in the middle (the doorway's foot), fading to nothing at the patch's edges. */
function shapeTexture(): Texture {
  const canvas = createCanvas(MIST_W, MIST_H);
  const ctx = context2d(canvas);
  ctx.save();
  ctx.translate(MIST_W / 2, MIST_H * SHAPE_CENTRE_Y);
  ctx.scale(SHAPE_SQUASH, 1);
  const radius = MIST_H * SHAPE_RADIUS;
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.7)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(-radius / SHAPE_SQUASH, -radius, (radius * 2) / SHAPE_SQUASH, radius * 2);
  ctx.restore();
  return Texture.from(canvas);
}

function createView(portal: (typeof portals)['entities'][number], gameLayer: Container): MistView {
  cloud ??= mistTexture();
  shape ??= shapeTexture();
  const root = new Container();
  const layers = MIST_LAYERS.map((layer) => {
    const sheet = new TilingSprite({ texture: cloud ?? Texture.EMPTY, width: MIST_W, height: MIST_H });
    sheet.tileScale.set(layer.scale);
    sheet.tint = layer.tint;
    sheet.alpha = layer.alpha;
    root.addChild(sheet);
    return sheet;
  });
  const mask = new Sprite(shape);
  root.addChild(mask);
  root.mask = mask;
  root.position.set(Math.round(portal.position.x - MIST_W / 2), Math.round(portal.position.y + MIST_SPILL - MIST_H));
  root.zIndex = portal.position.y + IN_FRONT;
  gameLayer.addChild(root);
  return { root, layers, phase: Math.random() * BREATH_TICKS };
}

/** The sheets rise and drift, and the whole patch breathes. */
function animate(view: MistView, tick: number): void {
  for (let i = 0; i < view.layers.length; i++) {
    const layer = MIST_LAYERS[i];
    view.layers[i].tilePosition.set(tick * layer.drift, -tick * layer.rise);
  }
  view.root.alpha = MIST_ALPHA * (1 - BREATH + BREATH * Math.sin(((tick + view.phase) / BREATH_TICKS) * Math.PI * 2));
}

/** Drops the mist of portals that are gone (a new level was built). */
function dropStale(gameLayer: Container): void {
  for (const [portal, view] of views) {
    if (world.id(portal) !== undefined && view.root.parent === gameLayer) continue;
    view.root.destroy({ children: true });
    views.delete(portal);
  }
}

/** Once a tick: mist made for each new portal, every patch of it moved on. */
export function updateMist(gameLayer: Container, tick: number): void {
  dropStale(gameLayer);
  for (const portal of portals) {
    let view = views.get(portal);
    if (!view) {
      view = createView(portal, gameLayer);
      views.set(portal, view);
    }
    animate(view, tick);
  }
}
