import type { Entity } from '../world';
import type { Condition } from '../rules/Conditions';
import { inFog } from '../ai/perception/obscured';

/**
 * The conditions a body is in now, as the tabletop names them (rules/Conditions.ts), read from what holds it: asleep
 * (Sleep) is unconscious, slipped or tripped is prone, a charm or Dancing Lights' pull is charmed, a Menacing Attack is
 * frightened, standing in fog is blinded; and Baldur's Gate's burning. Shown as rings under the body
 * (systems/ConditionRingSystem.ts).
 */

export type ShownCondition = Condition | 'burning';

/** The conditions `body` is in, most telling first, into `out` (cleared first; reused, so it allocates nothing). */
export function conditionsOn(body: Entity, out: ShownCondition[]): ShownCondition[] {
  out.length = 0;
  const s = body.status;
  if ((s?.asleep ?? 0) > 0) out.push('unconscious');
  if ((body.knockedDown ?? 0) > 0 || (s?.prone ?? 0) > 0) out.push('prone');
  if ((s?.charmed ?? 0) > 0 || body.entranced !== undefined) out.push('charmed');
  if ((s?.frightened ?? 0) > 0) out.push('frightened');
  if (body.position && inFog(body.position.x, body.position.y)) out.push('blinded');
  if (body.burning) out.push('burning');
  return out;
}
