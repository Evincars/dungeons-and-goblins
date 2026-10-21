import { q } from '../world';
import type { Entity } from '../world';
import { characterDef, stateClip } from '../characters/Characters';
import type { CharacterComponent } from '../characters/Characters';
import type { CharacterDef, CharacterState } from '../characters/CharacterDef';
import { STATE_PRIORITY, TRIGGERS, sameSwing, stillTriggered } from '../characters/StateTriggers';

const rank = (state: CharacterState): number => STATE_PRIORITY.indexOf(state);

/** A one-shot clip keeps playing unless something more important comes up (the same swing on the move isn't). */
function playsOut(def: CharacterDef, c: CharacterComponent, next: CharacterState): boolean {
  const playing = stateClip(def, c.state)?.clip.mode === 'once' && !c.finished;
  return playing && (rank(c.state) <= rank(next) || sameSwing(c.state, next));
}

/** The most important state the character has a clip for and whose trigger holds (idle if none). */
function wantedState(def: CharacterDef, c: CharacterComponent, entity: Entity): CharacterState {
  for (const s of STATE_PRIORITY) {
    const spent = c.spent !== undefined && (s === c.spent || sameSwing(s, c.spent));
    if (def.states[s] && !spent && TRIGGERS[s](entity)) return s;
  }
  return 'idle';
}

/** Picks each character's animation state from what the rest of the simulation says it is doing. */
export function updateCharacterState(): void {
  for (const entity of q.characters) {
    const c = entity.character;
    const def = characterDef(c.def);

    // A one-shot that already played out stays off until its trigger lets go, so it can't replay.
    if (c.spent && !stillTriggered(c.spent, entity)) c.spent = undefined;

    let next = wantedState(def, c, entity);
    if (next !== c.state && playsOut(def, c, next)) next = c.state;
    const clip = stateClip(def, next);
    if (next === c.state || !clip) continue;

    c.state = next;
    c.frame = 0;
    c.timer = 0;
    c.finished = false;
    entity.visual.sheet = clip.sheet;
  }
}
