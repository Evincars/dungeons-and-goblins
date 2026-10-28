import { q } from '../world';
import type { Player, StatName } from '../world';
import { coop } from '../network/CoopSession';
import type { GuestCommand } from '../network/protocol';
import { heroClass } from '../rules/Classes';
import { baseScores, chooseFightingStyle, lockBuild, newBuild, saveBuild, setScores, takeArchetype, takeExtraStyle, takeImprovement, takePicks } from '../rules/Build';
import type { Improvement, LevelPicks } from '../rules/Build';
import type { ArchetypeId } from '../rules/Archetypes';
import type { FightingStyleId } from '../rules/FightingStyles';
import { startingHitPoints } from '../rules/HitPoints';
import type { Level } from '../level/Level';
import { run } from './Run';

/**
 * What a player decides for their hero from the level panel: the point buy and fighting style in the first safe
 * room, an Ability Score Improvement or a feat when a level offers one. Alone or on the host it happens at once;
 * a guest's screen only asks, and the host checks the request (the same pattern as the shop and rests).
 */

export const CUSTOMIZE_KINDS = ['scores', 'fighting_style', 'extra_style', 'archetype', 'pick', 'improve', 'lock_build'] as const;
export type CustomizeCommand = Extract<GuestCommand, { kind: (typeof CUSTOMIZE_KINDS)[number] }>;

/** Whether a guest's command is one of the choices of the level panel. */
export function isCustomizeCommand(command: GuestCommand): command is CustomizeCommand {
  return CUSTOMIZE_KINDS.some((kind) => kind === command.kind);
}

/** Host or alone: carries a customisation out for this player, if it is allowed. Returns whether it was. */
export function applyCustomization(player: Player, command: CustomizeCommand): boolean {
  const cls = heroClass(player.heroClass);
  const level = player.playerStats.level;
  const build = player.build ?? (player.build = newBuild(cls));
  if (command.kind === 'fighting_style') return chooseFightingStyle(cls, build, level, command.style);
  if (command.kind === 'extra_style') return takeExtraStyle(cls, build, level, command.style);
  if (command.kind === 'archetype') return takeArchetype(cls, build, level, command.archetype);
  if (command.kind === 'pick') return command.level <= level && takePicks(cls, build, command.level, { maneuvers: command.maneuvers, spells: command.spells });
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

/** A Champion's second fighting style, from the tab of the level that offers it. */
export function requestExtraStyle(player: Player, style: FightingStyleId): void {
  send(player, { kind: 'extra_style', style });
}

export function requestArchetype(player: Player, archetype: ArchetypeId): void {
  send(player, { kind: 'archetype', archetype });
}

/** What the tab of `level` teaches: maneuvers, or an Eldritch Knight's cantrips and spells. */
export function requestPicks(player: Player, level: number, picks: LevelPicks): void {
  send(player, { kind: 'pick', level, ...picks });
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
