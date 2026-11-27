import { Sprite } from 'pixi.js';
import { world } from '../world';
import type { AfflictionKind, Entity } from '../world';
import { hiddenHere, shownAlpha } from './Invisibility';
import { imagesLeft } from './Illusions';

/**
 * How this screen draws a body that magic hides or doubles (after systems/RenderSystem.ts has placed its sprite):
 * - invisible (systems/Invisibility.ts): a hero is a faint shimmer of themselves on every screen; a foe is not drawn at all,
 *   unless this screen's hero sees the invisible (then a shimmer);
 * - Mirror Image (systems/Illusions.ts): its duplicates, faint copies of the hero's own frame, drift round them, so the player
 *   still sees which one is theirs;
 * - Blur: two fainter copies tremble at the hero's sides and the hero wavers;
 * - the mark of a blow (systems/Afflictions.ts): for its round the body is washed in its colour — scorched, sickly green, rimed
 *   blue, or flickering white with lightning (its particles, systems/VfxSystem.ts).
 * Copies are pooled sprites beside the body's own, made again for each level's game layer.
 */

/** Mirror Image's duplicates drift round the hero this far across (px) and this far down, a turn this many ticks long. */
const IMAGE_SPREAD_X = 15;
const IMAGE_SPREAD_Y = 4;
const IMAGE_TURN_TICKS = 300;
/** A duplicate shows this faint, a little cold; it is drawn just behind or in front of the hero by where it stands. */
const IMAGE_ALPHA = 0.45;
const IMAGE_TINT = 0xd8e8ff;
/** Blur's copies tremble this far off each side (px), this faint; the hero wavers between these alphas. */
const BLUR_SHIFT = 3;
const BLUR_ALPHA = 0.28;
const BLUR_WAVER_LOW = 0.75;
const BLUR_WAVER_HIGH = 0.95;
const BLUR_WAVER_TICKS = 23;
/** The most copies a body shows: three duplicates, and Blur's two. */
const MAX_COPIES = 5;
const FULL_TURN = Math.PI * 2;

/** Each mark's wash over the body; lightning's flickers between its wash and none, a flicker this many frames long. */
const MARK_TINTS = {
  fire: 0xffcfa8, poison: 0xc4f0a0, acid: 0xc4f0a0, cold: 0xb0d4ff, lightning: 0xd4ecff,
} as const satisfies Record<AfflictionKind, number>;
const FLICKER_FRAMES = 6;
const NO_TINT = 0xffffff;

const hidden = world.with('sprite', 'invisible');
const marked = world.with('sprite', 'afflicted');
/** Bodies washed in a mark's colour last frame, and this frame. */
const washed = new Set<Entity>();
const washing = new Set<Entity>();
const doubled = world.with('sprite', 'buffs');
/** Bodies drawn otherwise last frame, to put right once nothing hides or doubles them any more. */
const touched = new Set<Entity>();
const seen = new Set<Entity>();
const pools = new Map<Entity, Sprite[]>();
let clock = 0;

/** The body's copies, made the first time they are wanted, beside its own sprite. */
function copiesOf(body: Entity, own: Sprite): Sprite[] {
  let pool = pools.get(body);
  if (pool && pool[0]?.parent === own.parent) return pool;
  pool?.forEach((copy) => copy.destroy());
  pool = Array.from({ length: MAX_COPIES }, () => {
    const copy = new Sprite();
    copy.visible = false;
    own.parent?.addChild(copy);
    return copy;
  });
  pools.set(body, pool);
  return pool;
}

/** One copy of the body's frame, at an offset, this faint. */
function placeCopy(copy: Sprite, own: Sprite, dx: number, dy: number, alpha: number, tint: number): void {
  copy.texture = own.texture;
  copy.anchor.copyFrom(own.anchor);
  copy.scale.copyFrom(own.scale);
  copy.position.set(own.x + dx, own.y + dy);
  copy.zIndex = own.zIndex + dy * 0.01 - 0.001;
  copy.alpha = alpha;
  copy.tint = tint;
  copy.visible = true;
}

/** Draws a body as what is on it says, and its copies; returns whether anything was drawn otherwise than plain. */
function drawBody(body: Entity, own: Sprite): boolean {
  const alpha = shownAlpha(body);
  const images = imagesLeft(body);
  const blur = (body.buffs?.blur ?? 0) > 0;
  if (alpha === 1 && images === 0 && !blur) return false;
  const waver = blur ? BLUR_WAVER_LOW + (BLUR_WAVER_HIGH - BLUR_WAVER_LOW) * (0.5 + 0.5 * Math.sin(clock / BLUR_WAVER_TICKS)) : 1;
  if (!body.falling) own.alpha = alpha * waver;
  if (body.hurtOverlay && alpha === 0) body.hurtOverlay.visible = false;
  const pool = copiesOf(body, own);
  let used = 0;
  const shown = alpha > 0 && own.visible;
  for (let i = 0; shown && i < images; i++) {
    const angle = (clock / IMAGE_TURN_TICKS) * FULL_TURN + (i * FULL_TURN) / images;
    placeCopy(pool[used++], own, Math.cos(angle) * IMAGE_SPREAD_X, Math.sin(angle) * IMAGE_SPREAD_Y, IMAGE_ALPHA * alpha, IMAGE_TINT);
  }
  const tremble = clock % 4 < 2 ? BLUR_SHIFT : BLUR_SHIFT - 1;
  if (shown && blur) placeCopy(pool[used++], own, -tremble, 0, BLUR_ALPHA * alpha, 0xffffff);
  if (shown && blur) placeCopy(pool[used++], own, tremble, 0, BLUR_ALPHA * alpha, 0xffffff);
  for (let i = used; i < pool.length; i++) pool[i].visible = false;
  return true;
}

/** A body nothing hides or doubles any more: its own sprite as it is, its copies hidden. */
function putRight(body: Entity): void {
  if (body.sprite && !body.falling && !body.sprite.destroyed) body.sprite.alpha = 1;
  for (const copy of pools.get(body) ?? []) copy.visible = false;
}

/** Copies of bodies that are gone (or were left on another level) go with them. */
function dropGone(): void {
  for (const [body, pool] of pools) {
    if (world.id(body) !== undefined && !body.removed && body.sprite && !body.sprite.destroyed) continue;
    pool.forEach((copy) => copy.destroy());
    pools.delete(body);
    touched.delete(body);
  }
}

/** The wash a mark puts on its body this frame (lightning flickers). */
function washOf(kind: AfflictionKind): number {
  if (kind !== 'lightning') return MARK_TINTS[kind];
  return clock % FLICKER_FRAMES < FLICKER_FRAMES / 2 ? MARK_TINTS.lightning : NO_TINT;
}

/** Bodies with a blow's mark on them washed in its colour; those whose mark has faded back to their own. */
function washMarks(): void {
  washing.clear();
  for (const body of marked) {
    if (hiddenHere(body) || body.sprite.destroyed) continue;
    body.sprite.tint = washOf(body.afflicted.kind);
    washing.add(body);
  }
  for (const body of washed) {
    if (!washing.has(body) && body.sprite && !body.sprite.destroyed) body.sprite.tint = body.visual?.tint ?? NO_TINT;
  }
  washed.clear();
  for (const body of washing) washed.add(body);
}

/** Once a frame: every invisible, mirrored or blurred body drawn as it should be; the rest put right; marks washed on. */
export function updateImages(): void {
  washMarks();
  clock++;
  seen.clear();
  for (const body of hidden) if (drawBody(body, body.sprite)) seen.add(body);
  for (const body of doubled) if (!seen.has(body) && drawBody(body, body.sprite)) seen.add(body);
  for (const body of touched) if (!seen.has(body)) putRight(body);
  touched.clear();
  for (const body of seen) touched.add(body);
  dropGone();
}
