import { q } from '../world';
import { characterDef, clipSheetKey, stateClip } from '../characters/Characters';
import type { CharacterDef, CharacterState } from '../characters/CharacterDef';
import { STATE_PRIORITY, TRIGGERS } from '../characters/StateTriggers';
import type { CharacterComponent } from '../characters/Characters';

const rank = (state: CharacterState): number => STATE_PRIORITY.indexOf(state);

/** A one-shot clip keeps playing unless something more important comes up. */
function playsOut(def: CharacterDef, c: CharacterComponent, next: CharacterState): boolean {
  return stateClip(def, c.state)!.clip.mode === 'once' && !c.finished && rank(c.state) <= rank(next);
}

/** Picks each character's animation state from what the rest of the simulation says it is doing. */
export function updateCharacterState(): void {
  for (const entity of q.characters) {
    const c = entity.character;
    const def = characterDef(c.def);

    // A one-shot that already played out stays off until its trigger lets go, so it can't replay.
    if (c.spent && !TRIGGERS[c.spent](entity)) c.spent = undefined;

    let next = STATE_PRIORITY.find((s) => def.states[s] && s !== c.spent && TRIGGERS[s](entity)) ?? 'idle';
    if (next !== c.state && playsOut(def, c, next)) next = c.state;
    if (next === c.state) continue;

    c.state = next;
    c.frame = 0;
    c.timer = 0;
    c.finished = false;
    entity.visual.sheet = stateClip(def, next)!.sheet;
  }
}
