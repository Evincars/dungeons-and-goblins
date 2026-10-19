import { q } from '../world';
import { characterDef, stateClip } from '../characters/Characters';
import { frameTexture, sheetCols } from '../render/Sheets';

/** Advances each character's clip and shows the current frame, mirrored when facing left. */
export function updateCharacterAnimation(): void {
  for (const entity of q.characters) {
    const c = entity.character;
    const { clip, sheet } = stateClip(characterDef(c.def), c.state)!;
    const frames = sheetCols(sheet);

    if (++c.timer >= clip.frameTime) {
      c.timer = 0;
      if (c.frame < frames - 1) c.frame++;
      else if (clip.mode === 'loop') c.frame = 0;
      else if (!c.finished) {
        c.finished = true;
        if (clip.mode === 'once') c.spent = c.state;
      }
    }

    const sprite = entity.sprite;
    sprite.texture = frameTexture(sheet, c.frame, 0);
    sprite.scale.x = (c.flipX ? -1 : 1) * Math.abs(sprite.scale.x);
  }
}
