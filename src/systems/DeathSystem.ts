import { world, q } from '../world';
import type { Entity, MobType } from '../world';
import type { Level } from '../level/Level';
import { dropLoot } from '../entities/LootFactory';
import { createDeathFx } from '../entities/FxFactory';
import { sound } from '../audio/SoundPlayer';
import type { SfxName } from '../audio/SoundPlayer';
import { destroyAttachments } from './BarSystem';
import { startDying } from './RespawnSystem';
import { xpForLevel } from '../ui/HudPanel';

const DEATH_SOUNDS = {
  goblin: 'enemy_death',
  skeleton: 'enemy_death',
  orc: 'enemy_death',
  troll: 'enemy_death',
} as const satisfies Record<MobType, SfxName>;

/** A destroyed nest is worth this many times its own death points. */
const NEST_XP_FACTOR = 3;
/** Each level up raises max health by this much (and heals fully). */
const HEALTH_PER_LEVEL = 5;

const mortal = world.with('health', 'position');
const earners = world.with('playerStats', 'health');
type Earner = (typeof earners)['entities'][number];

function levelUp(player: Earner): void {
  const stats = player.playerStats;
  stats.exp -= xpForLevel(stats.level);
  stats.level++;
  player.health.max += HEALTH_PER_LEVEL;
  player.health.current = player.health.max;
  sound.playSound('level_up');
}

function awardExperience(points: number): void {
  if (points <= 0) return;
  for (const player of earners) {
    if (player.health.current <= 0) continue;
    player.playerStats.exp += points;
    player.playerStats.kills++;
    while (player.playerStats.exp >= xpForLevel(player.playerStats.level)) levelUp(player);
  }
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
    awardExperience(deathPts);
    dropLoot(pos.x, pos.y, deathPts);
  }
}

export function updateDeath(level: Level): void {
  for (const entity of mortal) {
    if (entity.health.current > 0 || entity.removed || entity.respawnTicks !== undefined) continue;
    if (entity.playerInput) {
      sound.playSound('death');
      startDying(entity, level);
      continue;
    }
    die(entity, entity.position);
    world.addComponent(entity, 'removed', true);
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
