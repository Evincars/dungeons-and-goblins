import { q, isPlayer } from '../world';
import type { Entity } from '../world';
import { createPotion } from '../entities/LootFactory';
import { sound } from '../audio/SoundPlayer';
import { REACH } from './TargetSystem';
import { nearby, Sense } from '../ai/perception/spatial';

/** Walking into a chest opens it; "use" (E or clicking it) works from further away. */
const OPEN_RADIUS = 24;
/** A chest holds two or three potions, flung out at this speed. */
const MIN_POTIONS = 2;
const EXTRA_POTIONS = 2;
const POTION_FLING = 0.6;

type Chest = (typeof q.chests)['entities'][number];
const openers: Entity[] = [];

/** Whether a living player is touching the chest, or within reach and pressing "use". */
function opened(chest: Chest): boolean {
  const cp = chest.position;
  for (const e of nearby(cp.x, cp.y, Math.max(REACH, OPEN_RADIUS), Sense.player, openers)) {
    if (!isPlayer(e) || e.health.current <= 0) continue;
    const dist = Math.hypot(e.position.x - cp.x, e.position.y - cp.y);
    if (dist <= OPEN_RADIUS || (e.playerInput.intents.use && dist <= REACH)) return true;
  }
  return false;
}

function spill(chest: Chest): void {
  const cp = chest.position;
  chest.chest.opened = true;
  sound.playSound('chest_open', cp.x, cp.y);
  const count = MIN_POTIONS + Math.floor(Math.random() * EXTRA_POTIONS);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    createPotion(cp.x, cp.y, Math.cos(angle) * POTION_FLING, Math.sin(angle) * POTION_FLING);
  }
}

export function updateChests(): void {
  for (const chest of q.chests) {
    if (chest.removed || chest.chest.opened) continue;
    if (opened(chest)) spill(chest);
  }
}
