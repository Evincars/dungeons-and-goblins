import { q } from '../world';
import type { Player, StatName } from '../world';
import { coop } from '../network/CoopSession';
import type { GuestCommand } from '../network/protocol';
import { heroClass } from '../rules/Classes';
import { baseScores, chooseFightingStyle, lockBuild, newBuild, saveBuild, setScores, takeImprovement } from '../rules/Build';
import type { Improvement } from '../rules/Build';
import type { FightingStyleId } from '../rules/FightingStyles';
import { startingHitPoints } from '../rules/HitPoints';
import type { Level } from '../level/Level';
import { run } from './Run';

/**
 * What a player decides for their hero from the level panel: the point buy and fighting style in the first safe
 * room, an Ability Score Improvement or a feat when a level offers one. Alone or on the host it happens at once;
 * a guest's screen only asks, and the host checks the request (the same pattern as the shop and rests).
 */

export type CustomizeCommand = Extract<GuestCommand, { kind: 'scores' | 'fighting_style' | 'improve' | 'lock_build' }>;

/** Host or alone: carries a customisation out for this player, if it is allowed. Returns whether it was. */
export function applyCustomization(player: Player, command: CustomizeCommand): boolean {
  const cls = heroClass(player.heroClass);
  const level = player.playerStats.level;
  const build = player.build ?? (player.build = newBuild(cls));
  if (command.kind === 'fighting_style') return chooseFightingStyle(cls, build, level, command.style);
  if (command.kind === 'improve') return takeImprovement(cls, build, level, command.improvement);
  if (command.kind === 'lock_build') return saveBuild(cls, build, level);
  if (!setScores(build, level, command.scores)) return false;
  fitHitPoints(player);
  return true;
}

/** New Constitution at level 1 changes the hit points the hero starts with (only then: nothing has been gained yet). */
function fitHitPoints(player: Player): void {
  const cls = heroClass(player.heroClass);
  const con = baseScores(cls, 1, player.build).constitution;
  const max = startingHitPoints(cls.hitDie, con);
  player.health.max = max;
  player.health.current = max;
}

function send(player: Player, command: CustomizeCommand): void {
  if (coop.role === 'guest') coop.sendCommand(command);
  else applyCustomization(player, command);
}

export function requestScores(player: Player, scores: Record<StatName, number>): void {
  send(player, { kind: 'scores', scores });
}

export function requestFightingStyle(player: Player, style: FightingStyleId): void {
  send(player, { kind: 'fighting_style', style });
}

/** The Save button: the starting choices become final. */
export function requestLock(player: Player): void {
  send(player, { kind: 'lock_build' });
}

export function requestImprovement(player: Player, improvement: Improvement): void {
  send(player, { kind: 'improve', improvement });
}

/**
 * Host, each tick: a hero who has left the first safe room (or is past the first level) keeps what they chose
 * for good, and one who never picked a fighting style gets the default.
 */
export function updateBuildLock(level: Level): void {
  for (const player of q.players) {
    const build = player.build;
    if (!build || build.locked) continue;
    const away = run.depth > 1 || !level.isWorldPosSafe(player.position.x, player.position.y);
    if (!away) continue;
    lockBuild(heroClass(player.heroClass), build, player.playerStats.level);
  }
}
