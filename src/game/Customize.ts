import { q, STAT_NAMES } from '../world';
import type { Player, StatName } from '../world';
import { coop } from '../network/CoopSession';
import type { GuestCommand } from '../network/protocol';
import { heroClass } from '../rules/Classes';
import { baseScores, chooseFightingStyle, lockBuild, newBuild, saveBuild, setScores, takeArchetype, takeExtraStyle, takeImprovement, takePicks } from '../rules/Build';
import type { Improvement, LevelPicks } from '../rules/Build';
import type { ArchetypeId } from '../rules/Archetypes';
import type { FightingStyleId } from '../rules/FightingStyles';
import { startingHitPoints } from '../rules/HitPoints';
import { archetypeName, featName, fightingStyleName, spellName } from '../rules/Names';
import { isSpellId } from '../rules/Spells';
import { featureOfClass } from '../rules/ClassFeatures';
import { recordEvent } from '../systems/CombatLogSystem';
import { text } from '../core/texts';
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
  if (!carryOut(player, command)) return false;
  logChoice(player, command);
  return true;
}

function carryOut(player: Player, command: CustomizeCommand): boolean {
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

/** "STR +2" or "STR +1, DEX +1": the abilities an Improvement raised. */
function improvedAbilities(stats: Partial<Record<StatName, number>>): string {
  return STAT_NAMES.filter((stat) => (stats[stat] ?? 0) > 0).map((stat) => `${text(`stat.${stat}.short` as const)} +${stats[stat]}`).join(', ');
}

/** What a maneuver or a spell is called in the log. */
function learntName(player: Player, id: string): string {
  if (isSpellId(id)) return spellName(id);
  return featureOfClass(heroClass(player.heroClass).dndClass, id)?.name ?? id;
}

/** Writes a choice the player has just made to the combat log (the point buy is only logged once it is saved). */
function logChoice(player: Player, command: CustomizeCommand): void {
  if (command.kind === 'extra_style') recordEvent(player, 'style', { item: fightingStyleName(command.style) });
  else if (command.kind === 'archetype') recordEvent(player, 'archetype', { item: archetypeName(command.archetype) });
  else if (command.kind === 'lock_build') logBuildSaved(player);
  else if (command.kind === 'pick') for (const id of [...(command.maneuvers ?? []), ...(command.spells ?? [])]) recordEvent(player, 'learns', { item: learntName(player, id) });
  else if (command.kind === 'improve') logImprovement(player, command.improvement);
}

function logImprovement(player: Player, improvement: Improvement): void {
  if ('feat' in improvement) recordEvent(player, 'feat', { item: featName(improvement.feat) });
  else recordEvent(player, 'improve', { item: improvedAbilities(improvement.stats) });
}

/** The first safe room's choices become final: the abilities, and the fighting style if the class has one. */
function logBuildSaved(player: Player): void {
  recordEvent(player, 'build');
  const style = player.build?.fightingStyle;
  if (style) recordEvent(player, 'style', { item: fightingStyleName(style) });
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
    logBuildSaved(player);
  }
}
