import { world } from '../world';
import type { Entity, MobType } from '../world';
import type { DamageType } from '../rules/DamageTypes';
import { TICKS_PER_SECOND } from '../rules/Spells';
import { spawnBlood } from '../entities/Blood';

/**
 * The fallen foes' bodies: a foe with a death clip lies where it fell, fresh for FRESH_CORPSE_TICKS, then is cleared away
 * (systems/DeathSystem.ts). A fresh body is what Bursting Sinew bursts — if it is fit: a body of flesh (not a specter's or a
 * shadow's) that fire, acid or radiance did not burn to a husk. A body used is left a smear of blood and gone.
 */

/** How long a fallen foe's body lies there, fresh (ticks). */
export const FRESH_CORPSE_TICKS = 30 * TICKS_PER_SECOND;
/** Foes that leave no body of flesh to burst. */
const BODILESS: ReadonlySet<MobType> = new Set<MobType>(['ghost_wizard', 'shade']);
/** Damage that leaves a body burnt to a husk, of no use to Bursting Sinew. */
const SPOILING: ReadonlySet<DamageType> = new Set<DamageType>(['fire', 'acid', 'radiant']);

const corpses = world.with('corpse', 'position');

/** Whether the body a foe leaves can be burst: flesh, not burnt by its death blow. */
export function fitCorpse(foe: Pick<Entity, 'mobType' | 'lastDamageType'>): boolean {
  if (!foe.mobType || BODILESS.has(foe.mobType)) return false;
  return !foe.lastDamageType || !SPOILING.has(foe.lastDamageType);
}

/** A foe fell: its body lies there, fresh (and fit or not). */
export function layCorpse(foe: Entity): void {
  world.addComponent(foe, 'corpse', { fresh: FRESH_CORPSE_TICKS, fit: fitCorpse(foe) });
}

/** The fresh, fit body nearest (x, y), no further than `reach`, or null. */
export function freshCorpseNear(x: number, y: number, reach: number): Entity | null {
  let best: Entity | null = null;
  let bestD = reach;
  for (const body of corpses) {
    if (!body.corpse.fit || body.corpse.fresh <= 0 || body.removed) continue;
    const d = Math.hypot(body.position.x - x, body.position.y - y);
    if (d > bestD) continue;
    best = body;
    bestD = d;
  }
  return best;
}

/** A body burst: a smear of blood where it lay, and it is gone. */
export function spendCorpse(body: Entity): void {
  spawnBlood(body);
  world.addComponent(body, 'removed', true);
}

/** The bodies go stale a tick at a time. */
export function updateCorpses(): void {
  for (const body of corpses) if (body.corpse.fresh > 0) body.corpse.fresh--;
}
