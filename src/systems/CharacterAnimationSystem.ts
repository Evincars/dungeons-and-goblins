import { q } from '../world';
import { characterDef, clipAnchorX, clipAnchorY, clipFrameTexture, clipFrames, drawnMirrored, facingRow, stateClip } from '../characters/Characters';
import type { CharacterComponent } from '../characters/Characters';
import type { ClipDef } from '../characters/CharacterDef';
import { isSwing } from '../characters/StateTriggers';
import type { Entity } from '../world';
import { attackTempo } from './SwordSystem';
import { frozenStill } from './SpellHolds';

/** Steps a character's clip on by one frame when its time is up, then loops, holds or finishes it. */
function advance(c: CharacterComponent, clip: ClipDef, frames: number): void {
  if (++c.timer < clip.frameTime) return;
  c.timer = 0;
  if (c.frame < frames - 1) {
    c.frame++;
  } else if (clip.mode === 'loop') {
    c.frame = 0;
  } else if (!c.finished) {
    c.finished = true;
    if (clip.mode === 'once') c.spent = c.state;
  }
}

/** How fast a swing clip plays: the tempo of the blow under way, else (an archer's release) Action Surge's. */
function swingRate(entity: Entity): number {
  return entity.swordSwing?.tempo ?? attackTempo(entity);
}

/**
 * Advances each character's clip and shows the current frame from the row for the side it faces;
 * characters drawn facing only one way are mirrored to face the other.
 */
export function updateCharacterAnimation(): void {
  for (const entity of q.characters) {
    const c = entity.character;
    const def = characterDef(c.def);
    const found = stateClip(def, c.state);
    if (!found) continue;
    const frames = clipFrames(found.clip, found.sheet);
    // A swing clip keeps pace with the blow it shows (twice as fast under Action Surge, faster for a long chain).
    // Paralysed (Hold Person): frozen still, its clip too.
    const rate = frozenStill(entity) ? 0 : isSwing(c.state) ? swingRate(entity) : 1;
    const carried = (c.carry ?? 0) + rate;
    const steps = Math.floor(carried);
    c.carry = carried - steps;
    for (let i = 0; i < steps; i++) advance(c, found.clip, frames);
    const sprite = entity.sprite;
    sprite.texture = clipFrameTexture(found.clip, found.sheet, c.frame, facingRow(def, c.flipX));
    sprite.anchor.set(clipAnchorX(def, found.clip), clipAnchorY(def, found.clip));
    sprite.scale.x = (drawnMirrored(def, c.flipX) ? -1 : 1) * Math.abs(sprite.scale.x);
  }
}
