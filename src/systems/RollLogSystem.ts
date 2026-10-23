import { world } from '../world';
import type { Entity, RollTone } from '../world';
import { text } from '../core/texts';
import { formatDice, formatModifier } from '../rules/Dice';
import type { AttackOutcome } from '../rules/Combat';

/**
 * The dice rolls over a fighter's head, as a queue: each attack adds its d20 line (and, on a hit, its
 * damage line) at the bottom; the top line fades first, and the next one waits a moment after it.
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

/** The d20 line of an attack: "NAT 20 CRIT HIT!", "NAT 1 CRIT MISS", or "17+5=22 HIT" / "9+5=14 MISS". */
function attackLine(outcome: AttackOutcome): { line: string; tone: RollTone } {
  const vars = { natural: outcome.natural, bonus: formatModifier(outcome.attackBonus), total: outcome.total };
  if (outcome.critical) return { line: text('roll.crit_hit', vars), tone: 'crit' };
  if (outcome.fumble) return { line: text('roll.crit_miss', vars), tone: 'fumble' };
  return outcome.hit ? { line: text('roll.hit', vars), tone: 'hit' } : { line: text('roll.miss', vars), tone: 'miss' };
}

/** The damage line: "1d8+3: 7", or "3 dmg" for a blow with no dice (a punch). */
function damageLine(outcome: AttackOutcome): string {
  if (outcome.damageDice.count === 0) return text('roll.damage_flat', { amount: outcome.damage });
  return text('roll.damage', { dice: formatDice(outcome.damageDice, true), amount: outcome.damage });
}

/** Logs an attack over the attacker's head: the d20 roll, then (if it hit) what the damage dice came to. */
export function logAttack(attacker: Entity, outcome: AttackOutcome): void {
  const { line, tone } = attackLine(outcome);
  logLine(attacker, line, tone);
  if (outcome.hit) logLine(attacker, damageLine(outcome), 'damage');
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
