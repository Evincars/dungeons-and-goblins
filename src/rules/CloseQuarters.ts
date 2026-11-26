import { feetToPx } from './Scale';
import { CATALOG, isCatalogSpell } from './Spellbook';
import type { AttackProfile } from './Combat';

/**
 * Ranged attacks in close quarters (the tabletop's rule): an attacker who makes a ranged attack — loosing a bow or
 * crossbow, throwing, or casting a ranged spell attack — while a hostile creature stands within 5 feet of them has
 * disadvantage on the roll. A melee spell attack (Shocking Grasp, Inflict Wounds…) is made at arm's length and is not
 * touched. Whether a shooter is pressed is asked as the shot leaves their hands (systems/CloseQuarters.ts).
 */

/** How near a hostile creature must stand (feet) for a ranged attack to be at disadvantage. */
export const CLOSE_QUARTERS_FEET = 5;
/** The same, between the two bodies' middles on the map (one 5-foot square). */
export const CLOSE_QUARTERS_PX = feetToPx(CLOSE_QUARTERS_FEET);

/** A spell's rules text names a melee spell attack: it is made at arm's length. */
const MELEE_SPELL_ATTACK = /melee spell attack/i;

/** Whether a spell is a melee spell attack (made at arm's length, so close quarters do not hinder it). */
export function isMeleeSpell(spell: string | undefined): boolean {
  return !!spell && isCatalogSpell(spell) && MELEE_SPELL_ATTACK.test(CATALOG[spell].description);
}

/** Whether a body at (bx, by) stands within 5 feet of an attacker at (ax, ay). */
export function withinCloseQuarters(ax: number, ay: number, bx: number, by: number): boolean {
  return Math.hypot(bx - ax, by - ay) <= CLOSE_QUARTERS_PX;
}

/** The attack rolled with disadvantage (which cancels an advantage instead). */
export function withDisadvantage(attack: AttackProfile): AttackProfile {
  return { ...attack, mode: attack.mode === 'advantage' ? 'normal' : 'disadvantage' };
}
