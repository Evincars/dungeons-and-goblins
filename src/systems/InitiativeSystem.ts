import { world, q } from '../world';
import type { Mob, Player } from '../world';
import { huntedPlayer } from '../ai/decision/states';
import { characterSheet } from '../rules/CharacterSheet';
import { MONSTERS } from '../rules/Monsters';
import { rollD20 } from '../rules/Dice';
import { logLine } from './RollLogSystem';
import { text } from '../core/texts';

/**
 * Initiative: when an enemy closes in for a fight, it and the hero it hunts each roll d20 + DEX (shown over
 * their heads). The higher roll wins the first strike — its next attack rolls with advantage (systems/Strike.ts).
 * A hero rolls once a fight: foes joining in compare against the same roll. An enemy rolls again for its next
 * fight once it has calmed down; a hero once no foe has engaged them for a while.
 */

/** Ticks a hero's initiative holds after the last foe engaged them (10 s): one fight. */
const FIGHT_TICKS = 600;

/** A hero's roll for this fight: the one they have, or a new one (said over their head). Returns it and whether it is new. */
function heroRoll(player: Player): { total: number; fresh: boolean } {
  const held = player.initiative;
  if (held) {
    held.ticks = FIGHT_TICKS;
    return { total: held.total, fresh: false };
  }
  const total = rollD20() + characterSheet(player).initiative;
  world.addComponent(player, 'initiative', { total, firstStrike: false, ticks: FIGHT_TICKS });
  logLine(player, text('roll.initiative', { total }), 'hit');
  return { total, fresh: true };
}

/** The enemy and its hero roll; the winner gets the first strike (a tie goes to the quicker, then to the hero). */
function rollInitiative(mob: Mob, player: Player): void {
  const dex = mob.mobType ? MONSTERS[mob.mobType].modifiers.dexterity : 0;
  const total = rollD20() + dex;
  world.addComponent(mob, 'initiative', { total, firstStrike: false, ticks: 0 });
  logLine(mob, text('roll.initiative', { total }), 'hit');
  const hero = heroRoll(player);
  const mobFirst = total > hero.total || (total === hero.total && dex > characterSheet(player).initiative);
  const winner = mobFirst ? mob : hero.fresh ? player : null;
  if (!winner?.initiative) return;
  winner.initiative.firstStrike = true;
  logLine(winner, text('roll.first_strike'), 'crit');
}

/** An enemy rolls when it first engages; back at rest, it will roll again for the next fight. */
function checkMob(mob: Mob): void {
  if (mob.health.current <= 0) return;
  if (mob.ai.state === 'idle' && mob.initiative) world.removeComponent(mob, 'initiative');
  if (mob.ai.state !== 'engage' || mob.initiative) return;
  const target = huntedPlayer(mob);
  if (target) rollInitiative(mob, target);
}

/** A hero's fight is over once no foe has engaged them for a while. */
function holdHero(player: Player): void {
  const held = player.initiative;
  if (held && --held.ticks <= 0) world.removeComponent(player, 'initiative');
}

export function updateInitiative(): void {
  for (const mob of q.walkingMobs) checkMob(mob);
  for (const player of q.players) holdHero(player);
}
