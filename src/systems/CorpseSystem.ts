import { Container, Sprite } from 'pixi.js';
import { world } from '../world';
import type { Entity } from '../world';
import { characterDef, clipAnchorX, clipAnchorY, clipFrameTexture, clipFrames, drawnMirrored, facingRow, stateClip } from '../characters/Characters';
import { frameTexture } from '../render/Sheets';
import { BLOOD_KEYS } from '../entities/Blood';

/**
 * What every screen draws of the dead (entities/Corpse.ts): each corpse on the last frame of its death clip, facing the way
 * it fell, and under it a pool of blood that spreads out over a second or so. A pool is made of the blood splashes'
 * fullest frames (public/blood), three or four of them, darkened, squashed flat onto the floor, turned, flipped and set a little apart — all of it
 * picked from the corpse's seed, so no two pools are alike and every screen draws the same one. Both lie on the floor:
 * under everyone standing, the corpse over its pool, and under the walls (as a puddle does).
 */

/** Just over what lies flat on the floor (FLAT_Z, -0.5, RenderSystem.ts): the pool, then the corpse on it (RenderSystem.ts CORPSE_Z). */
const POOL_Z = -0.49;
/** The splashes' frames that are a full spread of blood (most of a pool), by splash: a range of frames to pick from. */
const POOL_FRAMES: readonly (readonly [number, number])[] = [[4, 8], [5, 9], [4, 9], [2, 4], [6, 11]];
/** A pool is made of this many splashes, at least and at most. */
const MIN_PARTS = 3;
const MAX_PARTS = 4;
/** Each splash is drawn this big (of its 100 px frame), give or take; squashed to this share of its height onto the floor. */
const PART_SCALE = 0.5;
const PART_SCALE_SPREAD = 0.12;
const FLATTEN = 0.5;
/** Each splash lies up to this far (px) from the corpse's middle, across and along. */
const PART_SPREAD_X = 9;
const PART_SPREAD_Y = 4;
/** Old blood: darker than a fresh splash, and a little see-through. */
const POOL_TINTS: readonly number[] = [0x7a1010, 0x6a0c0c, 0x82140f, 0x5e0b0b];
const POOL_ALPHA = 0.85;
/** The pool spreads to its full size over this many ticks, from this share of it. */
const SPREAD_TICKS = 90;
const SPREAD_FROM = 0.25;

const corpses = world.with('corpse', 'position');
const pools = new Map<Entity, { pool: Container; age: number }>();

/** A small seeded random (mulberry32): the same seed lays out the same pool on every screen. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The corpse's own sprite: its death clip's last frame, anchored and mirrored as the living body was. */
function corpseSprite(corpse: (typeof corpses)['entities'][number]): Sprite | null {
  const def = characterDef(corpse.corpse.def);
  const found = stateClip(def, 'death');
  if (!found) return null;
  const last = clipFrames(found.clip, found.sheet) - 1;
  const sprite = new Sprite(clipFrameTexture(found.clip, found.sheet, last, facingRow(def, corpse.corpse.flipX)));
  sprite.anchor.set(clipAnchorX(def, found.clip), clipAnchorY(def, found.clip));
  sprite.scale.set(corpse.corpse.scale);
  if (drawnMirrored(def, corpse.corpse.flipX)) sprite.scale.x *= -1;
  return sprite;
}

/** One splash of the pool, picked by the corpse's random. */
function poolPart(random: () => number): Sprite {
  const pick = Math.floor(random() * BLOOD_KEYS.length);
  const [from, to] = POOL_FRAMES[pick] ?? [0, 0];
  const frame = from + Math.floor(random() * (to - from + 1));
  const part = new Sprite(frameTexture(BLOOD_KEYS[pick], frame, 0));
  part.anchor.set(0.5);
  const scale = PART_SCALE + (random() * 2 - 1) * PART_SCALE_SPREAD;
  part.scale.set(scale * (random() < 0.5 ? -1 : 1), scale * FLATTEN * (random() < 0.5 ? -1 : 1));
  part.rotation = (random() * 2 - 1) * 0.4;
  part.position.set((random() * 2 - 1) * PART_SPREAD_X, (random() * 2 - 1) * PART_SPREAD_Y);
  part.tint = POOL_TINTS[Math.floor(random() * POOL_TINTS.length)] ?? POOL_TINTS[0];
  return part;
}

/** The pool of blood under a corpse, laid out from its seed. */
function bloodPool(corpse: (typeof corpses)['entities'][number]): Container {
  const random = seeded(corpse.corpse.seed);
  const pool = new Container();
  const parts = MIN_PARTS + Math.floor(random() * (MAX_PARTS - MIN_PARTS + 1));
  for (let i = 0; i < parts; i++) pool.addChild(poolPart(random));
  pool.alpha = POOL_ALPHA;
  pool.zIndex = POOL_Z;
  pool.position.set(Math.round(corpse.position.x), Math.round(corpse.position.y));
  pool.scale.set(SPREAD_FROM);
  return pool;
}

/** Pools whose corpse is gone (cleared away, or a new level built) go with it. */
function dropStalePools(gameLayer: Container): void {
  for (const [corpse, shown] of pools) {
    if (world.id(corpse) !== undefined && !corpse.removed && shown.pool.parent === gameLayer) continue;
    shown.pool.destroy({ children: true });
    pools.delete(corpse);
  }
}

/** A corpse not yet drawn gets its sprite; returns whether it has one. */
function drawCorpse(corpse: (typeof corpses)['entities'][number], gameLayer: Container): boolean {
  if (corpse.sprite) return true;
  const sprite = corpseSprite(corpse);
  if (!sprite) return false;
  gameLayer.addChild(sprite);
  world.addComponent(corpse, 'sprite', sprite);
  return true;
}

/** Once a tick on every screen: each new corpse gets its sprite and its pool; pools still spreading grow a little more. */
export function updateCorpses(gameLayer: Container): void {
  dropStalePools(gameLayer);
  for (const corpse of corpses) {
    if (corpse.removed || !drawCorpse(corpse, gameLayer)) continue;
    const shown = pools.get(corpse) ?? { pool: gameLayer.addChild(bloodPool(corpse)), age: 0 };
    pools.set(corpse, shown);
    if (shown.age >= SPREAD_TICKS) continue;
    shown.age++;
    const t = shown.age / SPREAD_TICKS;
    shown.pool.scale.set(SPREAD_FROM + (1 - SPREAD_FROM) * (1 - (1 - t) * (1 - t)));
  }
}
