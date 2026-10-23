import type { Player } from '../world';
import { logLine } from '../systems/RollLogSystem';
import { recordGold } from '../systems/CombatLogSystem';
import { sound } from '../audio/SoundPlayer';
import { text } from '../core/texts';

/**
 * Coins a hero earns — for a kill, from a chest or a stash on the floor — go straight into their purse,
 * nothing is thrown on the ground: the sum shows over their head and in the combat log.
 */

/** A payment this big jingles like a gold coin. */
const BIG_PAYMENT = 50;

export function pay(player: Player, amount: number): void {
  const coins = Math.floor(amount);
  if (coins <= 0) return;
  const stats = player.playerStats;
  stats.gold += coins;
  stats.goldEarned += coins;
  logLine(player, text('roll.gold', { amount: coins }), 'gold');
  recordGold(player, coins);
  sound.playSound(coins >= BIG_PAYMENT ? 'coin_big' : 'coin', player.position.x, player.position.y);
}
