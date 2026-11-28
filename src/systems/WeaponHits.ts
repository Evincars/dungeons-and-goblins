import { world, isPlayer } from '../world';
import type { Entity } from '../world';
import type { AttackProfile } from '../rules/Combat';
import { rollDice } from '../rules/Dice';
import { TICKS_PER_SECOND } from '../rules/Spells';
import { text } from '../core/texts';
import { damageTypeName } from '../rules/Names';
import { hitMob } from './Hits';
import { hurtPlayer } from './CombatSystem';
import { setAlight } from './Surfaces';
import { logLine } from './RollLogSystem';

/**
 * A weapon's damage of another kind (an item's `extraDamage`: a flaming sword's 1d4 fire, carried on its attack as
 * `elemental`): every blow or shot of it that hits deals it on top of its own, rolled apart (doubled on a critical) and
 * resisted by its own kind; it leaves its mark for a round (systems/Afflictions.ts), and fire sets the one struck alight for
 * a couple of rounds (systems/Surfaces.ts `burning`), hero or foe alike.
 */

/** A weapon's fire keeps the one it struck burning this long (two rounds of the tabletop game). */
export const WEAPON_BURN_TICKS = 2 * 6 * TICKS_PER_SECOND;

/** A hit with a weapon that deals damage of another kind: that damage too, and fire sets the target alight. */
export function elementalHit(target: Entity, attacker: Entity, attack: AttackProfile, critical: boolean): void {
  const extra = attack.elemental;
  if (!extra || (target.health?.current ?? 0) <= 0) return;
  const damage = Math.max(1, rollDice(extra.dice, critical));
  if (isPlayer(target)) hurtPlayer(target, attacker, damage, extra.type);
  else hitMob(target, attacker, damage, true, extra.type);
  logLine(target, text('roll.extra_damage', { amount: damage, type: damageTypeName(extra.type) }), 'damage');
  if (extra.type === 'fire') setAlight(target, attacker.projectile?.owner ?? world.id(attacker) ?? -1, WEAPON_BURN_TICKS);
}
