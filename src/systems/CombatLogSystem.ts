import { world, isPlayer } from '../world';
import type { CombatLogEntry, Entity } from '../world';
import { text } from '../core/texts';
import type { AttackOutcome } from '../rules/Combat';
import { blowResult } from './RollLogSystem';

/**
 * The combat log: every blow of the level, who struck and how it went, kept on one entity so co-op guests
 * receive it with the world. Whoever runs the game writes it; every screen reads it (ui/CombatLogPanel.ts).
 */

/** The latest blows kept on the log entity: more than a screen shows, enough to survive a slow update. */
export const MAX_LOG_ENTRIES = 12;

const logs = world.with('combatLog');

/** The level's log, made the first time anything strikes. */
function theLog(): NonNullable<Entity['combatLog']> {
  for (const entity of logs) return entity.combatLog;
  return world.add({ combatLog: { seq: 0, entries: [] } }).combatLog ?? { seq: 0, entries: [] };
}

/** A player by the name they gave (or a stand-in), an enemy by its kind. */
function actorOf(attacker: Entity): Pick<CombatLogEntry, 'actor' | 'name'> {
  if (attacker.mobType) return { actor: 'mob', name: attacker.mobType };
  return { actor: 'player', name: (isPlayer(attacker) && attacker.playerName) || text('combat_log.default_hero') };
}

/** Writes one blow into the log. */
export function recordBlow(attacker: Entity, outcome: AttackOutcome): void {
  const log = theLog();
  log.seq++;
  log.entries.push({ seq: log.seq, ...actorOf(attacker), total: outcome.total, result: blowResult(outcome), damage: outcome.damage });
  if (log.entries.length > MAX_LOG_ENTRIES) log.entries.shift();
}

/** The level's log as a screen sees it (its own, or the copy a guest was sent), if anything has struck yet. */
export function currentLog(): Entity['combatLog'] {
  for (const entity of logs) return entity.combatLog;
  return undefined;
}
