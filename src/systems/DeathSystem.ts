import { world } from '../world';
import type { Level } from '../level/Level';
import { dropLoot } from '../entities/LootFactory';
import { createDeathFx } from '../entities/FxFactory';
import { sound } from '../audio/SoundPlayer';
import { destroyAttachments } from './BarSystem';
import { respawnPlayer } from './HoleSystem';
import { xpForLevel } from '../ui/HudPanel';

const DEATH_SOUNDS: Record<string, 'enemy_death'> = {
  goblin: 'enemy_death',
  skeleton: 'enemy_death',
  orc: 'enemy_death',
  troll: 'enemy_death',
};

function awardExperience(points: number): void {
  if (points <= 0) return;
  for (const player of world.with('playerStats', 'health')) {
    if (player.health!.current <= 0) continue;
    const stats = player.playerStats!;
    stats.exp += points;
    stats.kills++;
    while (stats.exp >= xpForLevel(stats.level)) {
      stats.exp -= xpForLevel(stats.level);
      stats.level++;
      player.health!.max += 5;
      player.health!.current = player.health!.max;
      sound.playSound('level_up');
    }
  }
}

export function updateDeath(level: Level, _dt: number): void {
  for (const entity of world.with('health', 'position')) {
    const h = entity.health!;
    if (h.current > 0) continue;
    if (entity.removed || entity.respawnTicks !== undefined) continue;

    const pos = entity.position!;
    const deathPts = entity.deathPoints ?? 0;

    if (entity.playerInput) {
      sound.playSound('death');
      respawnPlayer(entity, level, 'death');
      continue;
    } else if (entity.spawner) {
      sound.playSound('enemy_death', pos.x, pos.y);
      createDeathFx(pos.x, pos.y);
      awardExperience(deathPts * 3);
    } else if (entity.chest) {
      sound.playSound('chest_open', pos.x, pos.y);
      createDeathFx(pos.x, pos.y);
    } else if (entity.ai) {
      sound.playSound(DEATH_SOUNDS[entity.mobType ?? ''] ?? 'enemy_death', pos.x, pos.y);
      createDeathFx(pos.x, pos.y);
      awardExperience(deathPts);
      dropLoot(pos.x, pos.y, deathPts);
    }

    world.addComponent(entity, 'removed', true);
  }

  flushRemoved();
}

export function flushRemoved(): void {
  for (const entity of world.with('removed')) {
    destroyAttachments(entity);
    if (entity.sprite) entity.sprite.destroy({ children: true });
    world.remove(entity);
  }
}
