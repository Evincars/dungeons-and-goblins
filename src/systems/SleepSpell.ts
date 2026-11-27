import { world, isPlayer } from '../world';
import type { Entity, Player } from '../world';
import type { SpellDef, SpellId } from '../rules/Spells';
import { SPELLS, TICKS_PER_SECOND } from '../rules/Spells';
import { MONSTERS, immuneTo } from '../rules/Monsters';
import { characterSheet, spellcastingFor } from '../rules/CharacterSheet';
import { rollDice } from '../rules/Dice';
import type { Dice } from '../rules/Dice';
import { createSpellBolt } from '../entities/ProjectileFactory';
import { text } from '../core/texts';
import { logLine } from './RollLogSystem';
import { notePressed } from './CloseQuarters';
import { statusOf } from './ManeuverSystem';

/**
 * Sleep, as this game plays it: a mote of slumber flies the way the caster aims, as a bolt does, and settles on the first
 * foe it touches. Its dice (5d8, 2d8 more for each level it is cast above the 1st) are the hit points it lulls: a foe with no
 * more than that falls asleep — unconscious (`status.asleep`): it neither moves nor acts, attacks against it have advantage
 * and a hit from within 5 feet is a critical hit (systems/Strike.ts) — until the spell's time runs out or it is hurt
 * (systems/Hits.ts wakes it). Undead, and those immune to being charmed or knocked out, are not affected.
 */

/** The dice Sleep adds for each level it is cast above the 1st. */
const DICE_PER_LEVEL = 2;
/** Casts Sleep: its mote flies from the hands the way the caster aims. */
export function castSleep(caster: Player, def: SpellDef, dirX: number, dirY: number): void {
  const attack = { attackBonus: spellcastingFor(characterSheet(caster), def.id).attack, damage: def.damage, mode: 'normal' as const };
  const mote = createSpellBolt(caster.position.x, caster.position.y, dirX, dirY, attack, world.id(caster), caster.character?.def,
    { spell: def.id, autoHit: true, castLevel: def.level });
  notePressed(mote, caster, def.id);
}

/** Whether a projectile's spell is Sleep (its mote lulls instead of striking). */
export function lulls(spell: SpellId | undefined): boolean {
  return spell !== undefined && SPELLS[spell].kind === 'sleep';
}

/** The hit points Sleep cast at this level lulls: its dice, grown for each level above its own. */
export function sleepPool(castLevel: number): Dice {
  const base = SPELLS.sleep.damage;
  return { ...base, count: base.count + DICE_PER_LEVEL * Math.max(0, castLevel - SPELLS.sleep.level) };
}

/** Whether a foe cannot be put to sleep: undead, or immune to being charmed or knocked out. */
export function sleepless(foe: Entity): boolean {
  if (!foe.mobType) return true;
  return MONSTERS[foe.mobType].creature === 'undead' || immuneTo(foe.mobType, 'charmed') || immuneTo(foe.mobType, 'unconscious');
}

/** Sleep's mote settles on a foe: the dice are rolled against its hit points, and it falls asleep if they are enough. */
export function lull(foe: Entity, castLevel: number, by: Entity | undefined): void {
  if (!foe.health || !foe.position || isPlayer(foe)) return;
  if (sleepless(foe)) {
    logLine(foe, text('roll.sleep_immune'), 'miss');
    return;
  }
  const pool = rollDice(sleepPool(castLevel));
  if (foe.health.current > pool) {
    logLine(foe, text('roll.sleep_resisted'), 'miss');
    return;
  }
  const status = statusOf(foe, by ? world.id(by) ?? -1 : -1);
  status.asleep = Math.max(status.asleep ?? 0, SPELLS.sleep.durationTicks || SLEEP_FALLBACK_TICKS);
  if (foe.velocity) foe.velocity.x = foe.velocity.y = 0;
  logLine(foe, text('roll.asleep'), 'hit');
}

/** Should the spell's duration be missing from the file, a sleeper sleeps a minute. */
const SLEEP_FALLBACK_TICKS = 60 * TICKS_PER_SECOND;

/** Whether a foe lies asleep (it neither moves nor acts). */
export function isAsleep(body: Entity): boolean {
  return (body.status?.asleep ?? 0) > 0;
}

/** A sleeper is hurt: it wakes at once. */
export function wake(foe: Entity): void {
  const status = foe.status;
  if (!status || (status.asleep ?? 0) <= 0) return;
  status.asleep = 0;
  logLine(foe, text('roll.woke'), 'miss');
}
