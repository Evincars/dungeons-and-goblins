import { world } from '../world';
import type { BlowResult, Entity, RollTone } from '../world';
import { text } from '../core/texts';
import type { AttackOutcome } from '../rules/Combat';

/**
 * The dice rolls over a fighter's head, as a queue: each attack adds what it rolled to hit and how it went
 * (the damage, or a miss) at the bottom; the top line fades first, and the next one waits a moment after it.
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

/** The second line: "MISS", "CRIT MISS", "7 dmg" or "CRIT! 14 dmg". */
function resultLine(result: AttackResult, damage: number): string {
  if (result === 'crit') return text('roll.crit_damage', { amount: damage });
  if (result === 'fumble') return text('roll.crit_miss');
  return result === 'hit' ? text('roll.damage', { amount: damage }) : text('roll.miss');
}

/** Logs an attack over the attacker's head: what it rolled to hit ("17 to hit"), then how it went. */
export function logAttack(attacker: Entity, outcome: AttackOutcome): void {
  const result = blowResult(outcome);
  logLine(attacker, text('roll.to_hit', { total: outcome.total }), result);
  logLine(attacker, resultLine(result, outcome.damage), result === 'hit' || result === 'crit' ? 'damage' : result);
}

/** A spell's damage that needed no attack roll (a magic missile's dart): "4 dmg" over the caster. */
export function logSpellDamage(caster: Entity, damage: number): void {
  logLine(caster, text('roll.damage', { amount: damage }), 'damage');
}

/** A saving throw against a spell, over the one who rolled it: "save 14 - half", "save 6 - FAIL". */
export function logSave(target: Entity, total: number, saved: boolean): void {
  logLine(target, text(saved ? 'roll.save_half' : 'roll.save_fail', { total }), saved ? 'miss' : 'damage');
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
