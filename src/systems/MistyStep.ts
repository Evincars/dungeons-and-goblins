import type { Player } from '../world';
import type { Level } from '../level/Level';
import type { SpellDef } from '../rules/Spells';
import { playVfx } from '../render/VfxPlayer';
import { aimedWithin } from './LastingSpells';

/**
 * Misty Step: briefly wrapped in silver mist, the caster steps to a free place they can see within 30 feet — where they aim, or
 * as far that way as it reaches. A place in a wall, over a drop or out of sight will not do: the
 * nearest one that will back along the way is taken (none at all: nothing is cast). Mist where they left and where they come
 * out (the particles, systems/VfxSystem.ts). The cast is refused before it starts when there is nowhere to go
 * (systems/SpellSystem.ts), so its recovery is not spent.
 */

/** Back along the way from the point aimed at, the places tried are this far apart (px). */
const STEP_BACK = 8;
/** The caster's mist rises round their middle, this far above their feet. */
const BODY_MIDDLE = 14;
/** A place counts as free with this much floor round it (px each way: about a body's half-width). */
const ROOM = 6;

/** Whether the caster may stand at (x, y): open floor round it, no drop under it, and in their sight from where they stand. */
function freePlace(level: Level, caster: Player, x: number, y: number): boolean {
  if (level.blocksPoint(x - ROOM, y) || level.blocksPoint(x + ROOM, y) || level.blocksPoint(x, y - ROOM) || level.blocksPoint(x, y)) return false;
  if (level.overPit(x, y)) return false;
  return level.checkLineOfSight(caster.position.x, caster.position.y, x, y);
}

/** Where a Misty Step aimed at (x, y) takes the caster: the free place nearest the aim back along the way, if any. */
export function stepTarget(level: Level, caster: Player, def: SpellDef, x: number, y: number): { x: number; y: number } | null {
  const far = aimedWithin(caster, x, y, def.range);
  const dx = far.x - caster.position.x;
  const dy = far.y - caster.position.y;
  const dist = Math.hypot(dx, dy);
  if (dist < STEP_BACK) return null;
  for (let along = dist; along >= STEP_BACK; along -= STEP_BACK) {
    const px = caster.position.x + (dx / dist) * along;
    const py = caster.position.y + (dy / dist) * along;
    if (freePlace(level, caster, px, py)) return { x: px, y: py };
  }
  return null;
}

/** The step: mist where the caster stood, and they come out of it at the place chosen when the cast began. */
export function castMistyStep(caster: Player, x: number, y: number): void {
  playVfx('misty-step', caster.position.x, caster.position.y, BODY_MIDDLE);
  caster.position.x = x;
  caster.position.y = y;
  if (caster.velocity) caster.velocity.x = caster.velocity.y = 0;
  if (caster.bump) caster.bump.x = caster.bump.y = 0;
  playVfx('misty-step', x, y, BODY_MIDDLE);
}
