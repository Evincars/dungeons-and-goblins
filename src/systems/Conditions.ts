import type { Entity } from '../world';
import type { Condition } from '../rules/Conditions';
import { inFog } from '../ai/perception/obscured';
import { heldIn } from './SpellHolds';
import { marked } from './WeaponMarks';
import type { WeaponCondition } from '../rules/WeaponActions';

/**
 * The conditions a body is in now, as the tabletop names them (rules/Conditions.ts), read from what holds it: asleep
 * (Sleep) is unconscious, slipped or tripped is prone, a charm or Dancing Lights' pull is charmed, a Menacing Attack is
 * frightened, standing in fog is blinded; what a spell holds it in (systems/SpellHolds.ts): paralysed, Tasha's laughter,
 * restrained in webs, Crown of Madness, blinded or deafened, enfeebled; Baldur's Gate's burning, and what the heroes' weapon
 * actions leave (bleeding, dazed, maimed, off balance, weak grip, chest trauma, gaping wounds, hamstrung, disarmed). Shown as rings under the
 * body (systems/ConditionRingSystem.ts), told under the pointer (ui/ConditionTip.ts).
 */

export type ShownCondition = Condition | Exclude<WeaponCondition, 'prone'> | 'burning' | 'laughing' | 'enfeebled' | 'maddened';

/** The weapon actions' conditions a foe may be in (systems/WeaponMarks.ts; prone is told with the rest). */
const WEAPON_MARKS = ['bleeding', 'dazed', 'maimed', 'off_balance', 'weak_grip', 'chest_trauma', 'gaping_wounds', 'hamstrung', 'disarmed'] as const;

/** The conditions `body` is in, most telling first, into `out` (cleared first; reused, so it allocates nothing). */
export function conditionsOn(body: Entity, out: ShownCondition[]): ShownCondition[] {
  out.length = 0;
  const s = body.status;
  if ((s?.asleep ?? 0) > 0) out.push('unconscious');
  if (heldIn(body, 'paralyzed')) out.push('paralyzed');
  if (heldIn(body, 'laughing')) out.push('laughing');
  if ((body.knockedDown ?? 0) > 0 || (s?.prone ?? 0) > 0) out.push('prone');
  if (heldIn(body, 'restrained')) out.push('restrained');
  if ((s?.charmed ?? 0) > 0 || body.entranced !== undefined) out.push('charmed');
  if (heldIn(body, 'maddened')) out.push('maddened');
  if ((s?.frightened ?? 0) > 0) out.push('frightened');
  if (heldIn(body, 'blinded') || (body.position && inFog(body.position.x, body.position.y))) out.push('blinded');
  if (heldIn(body, 'deafened')) out.push('deafened');
  if (heldIn(body, 'enfeebled')) out.push('enfeebled');
  if (body.burning) out.push('burning');
  if (body.weaponMarks || body.mobWeapon === 'unarmed') pushWeaponMarks(body, out);
  return out;
}

/** What the heroes' weapon actions left on a body (systems/WeaponMarks.ts), into `out`. */
function pushWeaponMarks(body: Entity, out: ShownCondition[]): void {
  for (const mark of WEAPON_MARKS) if (marked(body, mark)) out.push(mark);
}
