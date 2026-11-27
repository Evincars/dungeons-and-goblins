import { world, isAfflictionKind } from '../world';
import type { AfflictionKind, Entity } from '../world';
import type { DamageType } from '../rules/DamageTypes';
import { TICKS_PER_SECOND } from '../rules/Spells';

/**
 * The mark a blow leaves for a round on whoever it hurt, heroes and foes alike, by its kind of damage: fire leaves them aflame,
 * poison and acid dripping and fuming, cold rimed with frost, lightning crackling (their particles, systems/VfxSystem.ts). Only
 * a look: what burns on and hurts is `burning` (systems/Surfaces.ts). The host sets it; guests draw it from the world it sends.
 */

/** A round of the tabletop game: the mark lasts that long after the blow. */
export const AFFLICTION_TICKS = 6 * TICKS_PER_SECOND;

const marked = world.with('afflicted');

/** The kind of mark a kind of damage leaves, if any. */
function markOf(type: DamageType | undefined): AfflictionKind | null {
  return isAfflictionKind(type) ? type : null;
}

/** A blow of this kind hurt the body: its mark shows on it for a round (the last kind to hurt it). */
export function afflict(body: Entity, type: DamageType | undefined): void {
  const kind = markOf(type);
  if (!kind || (body.health?.current ?? 0) <= 0) return;
  if (body.afflicted) {
    body.afflicted.kind = kind;
    body.afflicted.ticks = AFFLICTION_TICKS;
    return;
  }
  world.addComponent(body, 'afflicted', { kind, ticks: AFFLICTION_TICKS });
}

/** The marks fade: each a tick nearer gone, and gone from the fallen. */
export function updateAfflictions(): void {
  for (let i = marked.entities.length - 1; i >= 0; i--) {
    const body = marked.entities[i];
    if (--body.afflicted.ticks <= 0 || (body.health?.current ?? 0) <= 0) world.removeComponent(body, 'afflicted');
  }
}
