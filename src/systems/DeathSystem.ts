import { world, q, isPlayer } from '../world';
import type { Entity, Player } from '../world';
import type { Level } from '../level/Level';
import { killReward } from '../entities/LootFactory';
import { spawnDrops } from '../entities/Drops';
import { pay } from '../game/Purse';
import { createDeathFx } from '../entities/FxFactory';
import { sound } from '../audio/SoundPlayer';
import { BOSS_FOES, MOB_CRIES } from '../audio/SoundBank';
import { destroyAttachments } from './BarSystem';
import { stateDuration } from '../characters/Characters';
import { startDying } from './RespawnSystem';
import { levelForXp } from '../game/Progress';
import { MONSTERS } from '../rules/Monsters';
import { characterSheet } from '../rules/CharacterSheet';
import { hitPointsPerLevel } from '../rules/HitPoints';
import { logLine } from './RollLogSystem';
import { recordEvent } from './CombatLogSystem';
import { text } from '../core/texts';
import { isStanding, leaveBelongings, standingHeroes } from '../game/Fallen';

/** Ticks a dead mob stays on its last death frame before it is cleared away. */
const CORPSE_LINGER = 60;

/** A destroyed nest is worth this many times its own death points in experience. */
const NEST_XP_FACTOR = 3;

const mortal = world.with('health', 'position');
const earners = world.with('playerStats', 'health');
type Earner = (typeof earners)['entities'][number];

/**
 * A level gained: hit points by the class's hit die (at its average) plus CON, added to the maximum and to the
 * hit points the hero has now (it is not a heal: wounds stay until rested off), and one more hit die to spend;
 * the proficiency bonus and spells follow from the new level.
 */
function levelUp(player: Earner): void {
  const stats = player.playerStats;
  stats.level++;
  stats.hitDice++;
  const sheet = characterSheet(player);
  const gained = hitPointsPerLevel(sheet.heroClass, sheet.modifiers.constitution, stats.level, player.build);
  player.health.max += gained;
  player.health.current += gained;
  logLine(player, text('roll.level_up', { level: stats.level }), 'crit');
  recordEvent(player, 'level_up', { total: stats.level });
  sound.playSound('level_up');
}

/** Experience for one hero, with every level it reaches. */
export function grantExperience(player: Earner, points: number): void {
  player.playerStats.exp += Math.max(0, Math.floor(points));
  while (player.playerStats.level < levelForXp(player.playerStats.exp)) levelUp(player);
}

/**
 * The party shares a kill's experience, as at the table: every hero still on their feet gets an equal part (a fallen
 * hero, down until the party goes deeper, earns nothing meanwhile).
 */
function awardExperience(points: number): void {
  const heroes = standingHeroes();
  if (points <= 0 || heroes === 0) return;
  const share = Math.floor(points / heroes);
  for (const player of q.players) {
    if (!isStanding(player)) continue;
    player.playerStats.kills++;
    grantExperience(player, share);
  }
}

/**
 * A kill's gold is the party's, as its experience is: every hero still on their feet gets an equal part (and their own
 * Charisma's share more on top).
 */
function shareKillGold(total: number): void {
  const heroes = standingHeroes();
  if (heroes === 0) return;
  const share = total / heroes;
  for (const hero of q.players) {
    if (isStanding(hero)) pay(hero, Math.round(share * (1 + hero.playerStats.lootBonus)));
  }
}

/** Who finds a kill's gear: whoever struck last, or failing that (a fall, a trap) the nearest living hero. */
function killerOf(entity: Entity, pos: { x: number; y: number }): Player | undefined {
  const struck = entity.lastHitBy === undefined ? undefined : world.entity(entity.lastHitBy);
  if (isPlayer(struck)) return struck;
  let nearest: Player | undefined;
  let best = Infinity;
  for (const player of q.players) {
    const d = Math.hypot(player.position.x - pos.x, player.position.y - pos.y);
    if (player.health.current <= 0 || d >= best) continue;
    best = d;
    nearest = player;
  }
  return nearest;
}

/** A kill is written to the combat log: who struck last (an arrow's or a spell's caster, not the missile), or that it died alone. */
function logDeath(entity: Entity): void {
  const name = entity.mobType ? text(`mob.${entity.mobType}` as const) : (isPlayer(entity) && entity.playerName) || text('combat_log.default_hero');
  const struck = entity.lastHitBy === undefined ? undefined : world.entity(entity.lastHitBy);
  if (struck && struck !== entity && (struck.mobType || isPlayer(struck))) recordEvent(struck, 'slain', { item: name });
  else recordEvent(entity, 'died');
}

/** What dying leaves behind, by kind of entity: sound, smoke, experience and loot. */
function die(entity: Entity, pos: { x: number; y: number }): void {
  const deathPts = entity.deathPoints ?? 0;
  if (entity.spawner) {
    sound.playSound('nest_destroyed', pos.x, pos.y);
    createDeathFx(pos.x, pos.y);
    awardExperience(deathPts * NEST_XP_FACTOR);
  } else if (entity.chest) {
    sound.playSound('chest_open', pos.x, pos.y);
    createDeathFx(pos.x, pos.y);
  } else if (entity.ai) {
    logDeath(entity);
    if (entity.mobType) sound.playSound(MOB_CRIES[entity.mobType].die, pos.x, pos.y);
    if (entity.mobType && BOSS_FOES.has(entity.mobType)) sound.playSound('foe_felled');
    createDeathFx(pos.x, pos.y);
    awardExperience(entity.mobType ? MONSTERS[entity.mobType].xp : deathPts);
    // The coins go straight into the party's purses; gear, now and then, to whoever struck last.
    shareKillGold(killReward());
    spawnDrops(pos.x, pos.y, 'mob', killerOf(entity, pos));
  }
}

/** A mob with a death clip lies there while it plays, then is cleared away; others vanish at once. */
function killMob(entity: Entity): void {
  const clipTicks = entity.character && entity.ai ? stateDuration(entity.character.def, 'death') : 0;
  if (clipTicks === 0) {
    world.addComponent(entity, 'removed', true);
    return;
  }
  world.addComponent(entity, 'respawnTicks', clipTicks + CORPSE_LINGER);
  entity.hurtTime = 0;
  entity.attackTime = 0;
}

/** Counts down a dead mob's clip and linger time, then clears it away (players wait on {@link updateRespawns}). */
function tickCorpse(entity: Entity): void {
  if (entity.playerInput || entity.respawnTicks === undefined) return;
  if (--entity.respawnTicks <= 0) world.addComponent(entity, 'removed', true);
}

export function updateDeath(level: Level): void {
  for (const entity of mortal) {
    if (entity.health.current > 0 || entity.removed) continue;
    if (entity.respawnTicks !== undefined) {
      tickCorpse(entity);
      continue;
    }
    if (isPlayer(entity)) {
      sound.playSound('death');
      logDeath(entity);
      leaveBelongings(entity, level);
      startDying(entity);
      continue;
    }
    die(entity, entity.position);
    killMob(entity);
  }
  flushRemoved();
}

export function flushRemoved(): void {
  for (const entity of q.removed) {
    destroyAttachments(entity);
    if (entity.sprite) entity.sprite.destroy({ children: true });
    world.remove(entity);
  }
}
