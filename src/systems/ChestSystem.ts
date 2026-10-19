import { world } from '../world';
import type { Level } from '../level/Level';
import { createPotion } from '../entities/LootFactory';
import { sound } from '../audio/SoundPlayer';
import { REACH } from './TargetSystem';

/** Walking into a chest opens it; "use" (E or clicking it) works from further away. */
const OPEN_RADIUS = 24;

export function updateChests(_level: Level): void {
  for (const chest of world.with('position', 'chest')) {
    if (chest.removed || chest.chest!.opened) continue;
    const cp = chest.position!;

    for (const player of world.with('position', 'playerInput', 'health')) {
      if (player.health!.current <= 0) continue;
      const pp = player.position!;
      const dist = Math.hypot(pp.x - cp.x, pp.y - cp.y);
      const using = player.playerInput!.intents.use && dist <= REACH;
      if (dist > OPEN_RADIUS && !using) continue;

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
