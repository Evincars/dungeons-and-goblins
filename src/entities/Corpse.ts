import { world } from '../world';
import type { Entity } from '../world';

/**
 * A dead enemy stays where it fell: once its death clip has played (systems/DeathSystem.ts), it is swapped for a corpse — no
 * health, no mind, nothing that fights or is fought — drawn on its last death frame over a pool of blood that spreads under
 * it (systems/CorpseSystem.ts), under everyone still standing. The level's newest corpses are kept, the oldest cleared away.
 */

/** No more than this many corpses lie about a level at once: the oldest goes for a new one. */
export const MAX_CORPSES = 80;

const corpses = world.with('corpse', 'position');

/** The dead enemy's corpse, where it lies (none for one with no character art, or one that fell into a pit). */
export function createCorpse(dead: Entity): Entity | null {
  const character = dead.character;
  const at = dead.position;
  if (!character || !at || dead.falling) return null;
  if (corpses.size >= MAX_CORPSES) world.addComponent(corpses.entities[0], 'removed', true);
  return world.add({
    position: { x: at.x, y: at.y },
    yOffset: dead.yOffset ?? 0,
    corpse: { def: character.def, flipX: character.flipX, scale: dead.visual?.scale ?? 1, seed: Math.floor(Math.random() * 2 ** 31) },
  });
}
