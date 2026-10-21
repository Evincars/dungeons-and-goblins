import { q } from '../world';
import { characterDef, facingRow, stateClip } from '../characters/Characters';
import type { CharacterComponent } from '../characters/Characters';
import type { ClipDef } from '../characters/CharacterDef';
import { frameTexture, sheetCols } from '../render/Sheets';

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

/**
 * Advances each character's clip and shows the current frame from the row for the side it faces;
 * characters drawn only facing right are mirrored to face left.
 */
export function updateCharacterAnimation(): void {
  for (const entity of q.characters) {
    const c = entity.character;
    const def = characterDef(c.def);
    const found = stateClip(def, c.state);
    if (!found) continue;
    advance(c, found.clip, sheetCols(found.sheet));
    const sprite = entity.sprite;
    sprite.texture = frameTexture(found.sheet, c.frame, facingRow(def, c.flipX));
    const mirrored = c.flipX && !def.facingRows;
    sprite.scale.x = (mirrored ? -1 : 1) * Math.abs(sprite.scale.x);
  }
}
