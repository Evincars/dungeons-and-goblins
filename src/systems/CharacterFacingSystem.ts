import { q } from '../world';
import type { Entity } from '../world';
import { characterDef, stateClip } from '../characters/Characters';

const LOOK_DEADZONE = 0.05;

/** Players look where they aim; everything else looks where it moves. */
function lookX(e: Entity): number | undefined {
  return e.playerInput ? e.aimVector?.x : e.velocity?.x;
}

/** Mirrors characters toward their look direction, except mid-action so swings and casts don't flip. */
export function updateCharacterFacing(): void {
  for (const entity of q.characters) {
    const c = entity.character;
    const { clip } = stateClip(characterDef(c.def), c.state)!;
    if (clip.mode === 'hold' || (clip.mode === 'once' && !c.finished)) continue;

    const x = lookX(entity);
    if (x === undefined) continue;
    if (x < -LOOK_DEADZONE) c.flipX = true;
    else if (x > LOOK_DEADZONE) c.flipX = false;
  }
}
