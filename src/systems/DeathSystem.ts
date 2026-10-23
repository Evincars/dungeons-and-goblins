import { world, q, isPlayer } from '../world';
import type { Entity, MobType, Player } from '../world';
import type { Level } from '../level/Level';
import { killReward } from '../entities/LootFactory';
import { spawnDrops } from '../entities/Drops';
import { pay } from '../game/Purse';
import { createDeathFx } from '../entities/FxFactory';
import { sound } from '../audio/SoundPlayer';
import type { SfxName } from '../audio/SoundPlayer';
import { destroyAttachments } from './BarSystem';
import { stateDuration } from '../characters/Characters';
import { startDying } from './RespawnSystem';
import { levelForXp } from '../game/Progress';
import { MONSTERS } from '../rules/Monsters';
import { characterSheet } from '../rules/CharacterSheet';
import { hitPointsPerLevel } from '../rules/HitPoints';
import { logLine } from './RollLogSystem';
import { text } from '../core/texts';

const DEATH_SOUNDS = {
  goblin: 'enemy_death',
  skeleton: 'enemy_death',
  orc: 'enemy_death',
  troll: 'enemy_death',
  goblin_grunt: 'enemy_death',
  goblin_rogue: 'enemy_death',
  goblin_warrior: 'enemy_death',
  ghost_wizard: 'enemy_death',
  evil_wizard: 'enemy_death',
} as const satisfies Record<MobType, SfxName>;

/** Ticks a dead mob stays on its last death frame before it is cleared away. */
const CORPSE_LINGER = 60;

/** A destroyed nest is worth this many times its own death points in experience. */
const NEST_XP_FACTOR = 3;

const mortal = world.with('health', 'position');
const earners = world.with('playerStats', 'health');
type Earner = (typeof earners)['entities'][number];

/**
 * A level gained: hit points by the class's hit die (at its average) plus CON, one more hit die to spend,
 * and a full heal; the proficiency bonus and spells follow from the new level.
 */
function levelUp(player: Earner): void {
  const stats = player.playerStats;
  stats.level++;
  stats.hitDice++;
  const sheet = characterSheet(player);
  player.health.max += hitPointsPerLevel(sheet.heroClass, sheet.modifiers.constitution, stats.level, player.build);
  player.health.current = player.health.max;
  logLine(player, text('roll.level_up', { level: stats.level }), 'crit');
  sound.playSound('level_up');
}

/** Experience for one hero, with every level it reaches. */
export function grantExperience(player: Earner, points: number): void {
  player.playerStats.exp += Math.max(0, Math.floor(points));
  while (player.playerStats.level < levelForXp(player.playerStats.exp)) levelUp(player);
}

/** The party shares a kill's experience, as at the table: every hero in the game gets an equal part. */
function awardExperience(points: number): void {
  const heroes = earners.entities.length;
  if (points <= 0 || heroes === 0) return;
  const share = Math.floor(points / heroes);
  for (const player of earners) {
    player.playerStats.kills++;
    grantExperience(player, share);
  }
}

/** Who is paid for a kill: whoever struck last, or failing that (a fall, a trap) the nearest living hero. */
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

/** What dying leaves behind, by kind of entity: sound, smoke, experience and loot. */
function die(entity: Entity, pos: { x: number; y: number }): void {
  const deathPts = entity.deathPoints ?? 0;
  if (entity.spawner) {
    sound.playSound('enemy_death', pos.x, pos.y);
    createDeathFx(pos.x, pos.y);
    awardExperience(deathPts * NEST_XP_FACTOR);
  } else if (entity.chest) {
    sound.playSound('chest_open', pos.x, pos.y);
    createDeathFx(pos.x, pos.y);
  } else if (entity.ai) {
    sound.playSound(entity.mobType ? DEATH_SOUNDS[entity.mobType] : 'enemy_death', pos.x, pos.y);
    createDeathFx(pos.x, pos.y);
    awardExperience(entity.mobType ? MONSTERS[entity.mobType].xp : deathPts);
    // The coins go straight to the killer (their Charisma makes kills richer); gear, now and then, drops.
    const killer = killerOf(entity, pos);
    if (killer) pay(killer, killReward(Math.round(deathPts * (1 + killer.playerStats.lootBonus))));
    spawnDrops(pos.x, pos.y, 'mob', killer);
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
    if (entity.playerInput) {
      sound.playSound('death');
      startDying(entity, level);
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
