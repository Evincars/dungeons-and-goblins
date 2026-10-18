import { world } from '../world';
import type { Level } from '../level/Level';
import { createPotion } from '../entities/LootFactory';
import { sound } from '../audio/SoundPlayer';

const OPEN_RADIUS = 24;

export function updateChests(_level: Level): void {
  for (const chest of world.with('position', 'chest')) {
    if (chest.removed || chest.chest!.opened) continue;
    const cp = chest.position!;

    for (const player of world.with('position', 'playerInput', 'health')) {
      if (player.health!.current <= 0) continue;
      const pp = player.position!;
      if (Math.hypot(pp.x - cp.x, pp.y - cp.y) > OPEN_RADIUS) continue;

      chest.chest!.opened = true;
      sound.playSound('chest_open', cp.x, cp.y);

      // Spawn a few potions
      const count = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        createPotion(cp.x, cp.y, Math.cos(angle) * 0.6, Math.sin(angle) * 0.6);
      }
      break;
    }
  }
}
