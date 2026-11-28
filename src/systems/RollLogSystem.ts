import { world } from '../world';
import type { BlowResult, Entity, RollTone, StatName } from '../world';
import { text } from '../core/texts';
import type { AttackOutcome } from '../rules/Combat';
import type { DamageType } from '../rules/DamageTypes';
import { damageTypeName } from '../rules/Names';

/**
 * The dice rolls over a fighter's head, as a queue: each attack adds what it rolled to hit and how it went (a miss, a
 * critical) at the bottom; the damage shows over whoever takes it, in red, when it is dealt (`logHurt`: "7", "3 fire"). The
 * top line fades first, and the next one waits a moment after it.
 * The host keeps the log; guests are sent it with the rest of the world.
 */

/** Ticks a line is shown before it fades out (the top line first). */
export const ROLL_LINE_TICKS = 80;
/** Once the top line has gone, the next one stays at least this much longer. */
const ROLL_LINE_STAGGER = 14;
/** The most lines over one head; a new one pushes the oldest out. */
export const MAX_ROLL_LINES = 4;

const logged = world.with('rollLog');

/** Adds a line at the bottom of an entity's roll log. */
export function logLine(entity: Entity, line: string, tone: RollTone): void {
  const log = entity.rollLog ?? [];
  if (!entity.rollLog) world.addComponent(entity, 'rollLog', log);
  log.push({ text: line, tone, age: 0 });
  if (log.length > MAX_ROLL_LINES) log.shift();
}

/** What an attack roll can come to. */
export type AttackResult = Extract<BlowResult, 'hit' | 'miss' | 'crit' | 'fumble'>;

/** How a blow went: a hit, a miss, a natural 20 (critical) or a natural 1 (critical miss). */
export function blowResult(outcome: AttackOutcome): AttackResult {
  if (outcome.critical) return 'crit';
  if (outcome.fumble) return 'fumble';
  return outcome.hit ? 'hit' : 'miss';
}

/** The second line, when there is one: "MISS", "CRIT MISS" or "CRIT!" (a hit's damage shows over the one it hurts). */
function resultLine(result: AttackResult): string | null {
  if (result === 'crit') return text('roll.crit');
  if (result === 'fumble') return text('roll.crit_miss');
  return result === 'hit' ? null : text('roll.miss');
}

/** Logs an attack over the attacker's head: what it rolled to hit ("17 to hit"), then how it went if it did not simply hit. */
export function logAttack(attacker: Entity, outcome: AttackOutcome): void {
  const result = blowResult(outcome);
  logLine(attacker, text('roll.to_hit', { total: outcome.total }), result);
  const line = resultLine(result);
  if (line) logLine(attacker, line, result === 'crit' ? 'crit' : result);
}

/** The kinds of damage a weapon deals: told by their number alone (any other kind is named, "3 fire"). */
const PLAIN_TYPES: ReadonlySet<DamageType> = new Set<DamageType>(['bludgeoning', 'piercing', 'slashing']);

/**
 * Damage taken, over the head of whoever takes it, in red, when it is dealt (a blow, a spell, bleeding, burning…): "7", or
 * with its kind when that is not a weapon's ("3 fire", "4 acid").
 */
export function logHurt(body: Entity, amount: number, type?: DamageType): void {
  if (amount <= 0) return;
  const line = type && !PLAIN_TYPES.has(type) ? text('roll.hurt_typed', { amount, type: damageTypeName(type) }) : String(amount);
  logLine(body, line, 'damage');
}

/** A saving throw against a spell, over the one who rolled it: "save 14 - half", "save 6 - FAIL". */
export function logSave(target: Entity, total: number, saved: boolean): void {
  logLine(target, text(saved ? 'roll.save_half' : 'roll.save_fail', { total }), saved ? 'miss' : 'damage');
}

/**
 * A saving throw against something other than a spell's damage (keeping one's footing on grease, not catching fire, not
 * falling asleep), over the one who rolled it: "DEX save 14: safe", "DEX save 6: FAIL".
 */
export function logAbilitySave(target: Entity, stat: StatName, total: number, saved: boolean): void {
  const ability = text(`stat.${stat}.short` as const);
  logLine(target, text(saved ? 'roll.ability_save_safe' : 'roll.ability_save_fail', { ability, total }), saved ? 'miss' : 'damage');
}

/** A saving throw against a spell, over the one who rolled it: "save 14 - half" (the damage it let through follows as it is dealt). */
export function logSaveDamage(target: Entity, total: number, saved: boolean): void {
  logSave(target, total, saved);
}

/** Hit points given back, over the one healed: "+24 HP". */
export function logHeal(target: Entity, amount: number): void {
  logLine(target, text('roll.heal', { amount }), 'heal');
}

/** Ages every log; the top line goes once it has been up long enough, and the one under it lingers a little. */
export function updateRollLogs(): void {
  for (const entity of logged) {
    const log = entity.rollLog;
    for (const line of log) line.age++;
    if (!log.length || log[0].age < ROLL_LINE_TICKS) continue;
    log.shift();
    if (log.length) log[0].age = Math.min(log[0].age, ROLL_LINE_TICKS - ROLL_LINE_STAGGER);
  }
}
