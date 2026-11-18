import { world, isTarget } from '../world';
import type { Entity, Player } from '../world';
import type { Level } from '../level/Level';
import { nearby, Sense } from '../ai/perception/spatial';
import { MAX_MOB_RADIUS } from '../entities/MobFactory';
import { AIM_HEIGHT } from '../entities/ProjectileFactory';
import { playEffect } from '../assets/Effects';
import { FEATS } from '../rules/Feats';
import type { FeatId } from '../rules/Feats';
import { featName } from '../rules/Names';
import { standable } from './FeatureSystem';
import { holdsBow } from './ArrowSystem';
import { bonusSwing } from './SwordSystem';
import { recordEvent } from './CombatLogSystem';

/**
 * The Passive Feats used from the quick bar (\`passive: active\` in src/data/feats.json): the cast key on one does its work
 * at once and its square recovers (the spell system spends the recovery). For now only Charger.
 */

/** Charger reaches a foe this far from the hero (30 feet), and rushes in steps this long (px). */
const CHARGE_REACH = 288;
const CHARGE_STEP = 6;
/** The rush stops when the hero's body is this near the foe's (px): close enough for the blow. */
const CHARGE_GAP = 2;
const CHARGE_EFFECT = { shape: 'sparkle_ring', colour: 'white', scale: 0.8 } as const;

/** What using a feat came to: done, or why not. */
export type FeatUse = 'ok' | 'no_foe' | 'not_melee' | 'unworked';

const scratch: Entity[] = [];

/** The live foe (or the training dummy) within Charger's reach of the hero that stands nearest the point aimed at. */
function chargeTarget(hero: Player, aim: { x: number; y: number }): Entity | undefined {
  const { x, y } = hero.position;
  let found: Entity | undefined;
  let best = Infinity;
  for (const foe of nearby(x, y, CHARGE_REACH + MAX_MOB_RADIUS, Sense.mob, scratch)) {
    if (!isTarget(foe) || foe.health.current <= 0) continue;
    if (Math.hypot(foe.position.x - x, foe.position.y - y) > CHARGE_REACH + foe.radius.x) continue;
    const d = Math.hypot(foe.position.x - aim.x, foe.position.y - aim.y);
    if (d >= best) continue;
    best = d;
    found = foe;
  }
  return found;
}

/**
 * The rush: the hero goes straight at the foe, as far as the way stays open (a wall or a pit stops them short), and ends
 * beside it facing it.
 */
function rush(level: Level, hero: Player, foe: Entity & { position: { x: number; y: number } }): void {
  const from = { x: hero.position.x, y: hero.position.y };
  const dx = foe.position.x - from.x;
  const dy = foe.position.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const stop = Math.max(0, dist - (hero.radius?.x ?? 0) - (foe.radius?.x ?? 0) - CHARGE_GAP);
  let reached = 0;
  for (let d = CHARGE_STEP; d <= stop; d += CHARGE_STEP) {
    if (!standable(level, hero, from.x + (dx / dist) * d, from.y + (dy / dist) * d)) break;
    reached = d;
  }
  playEffect(CHARGE_EFFECT.shape, CHARGE_EFFECT.colour, from.x, from.y, AIM_HEIGHT, CHARGE_EFFECT.scale);
  hero.position.x = from.x + (dx / dist) * reached;
  hero.position.y = from.y + (dy / dist) * reached;
  hero.aimVector ??= { x: 0, y: 1 };
  hero.aimVector.x = dx / dist;
  hero.aimVector.y = dy / dist;
}

/** Charger: a rush at the foe nearest the aim, and a melee weapon attack at once. */
function charge(level: Level, hero: Player, aim: { x: number; y: number }): FeatUse {
  if (holdsBow(hero)) return 'not_melee';
  const foe = chargeTarget(hero, aim);
  if (!foe?.position) return 'no_foe';
  rush(level, hero, { ...foe, position: foe.position });
  bonusSwing(hero);
  return 'ok';
}

/** The hero uses a feat from the quick bar; its effect happens now. Returns why nothing happened, if nothing did. */
export function useFeat(hero: Player, feat: FeatId, level: Level, aim: { x: number; y: number }): FeatUse {
  if (!FEATS[feat].charge) return 'unworked';
  const used = charge(level, hero, aim);
  if (used === 'ok' && world.id(hero) !== undefined) recordEvent(hero, 'feature', { item: featName(feat) });
  return used;
}
