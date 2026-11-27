import { ensure } from '../core/errors';
import { isRecord } from '../core/guards';
import { isWeaponBase } from './WeaponTable';
import type { WeaponBase } from './WeaponTable';
import data from '../data/weapon-actions.json';

/**
 * The weapon actions a hero trained in a weapon unlocks with it (Baldur's Gate's "Proficiency unlocks"), read from
 * src/data/weapon-actions.json: a slash that leaves the foe bleeding, a blow that dazes, a sweep that topples, a shot that
 * cripples… Not played yet (`worked: false`): the weapon's tooltip shows them, each with a placeholder icon of its effect
 * (ui/ItemIcons.ts) until their art is made, lit for a hero trained in the weapon and greyed for one who is not.
 */

/** What an action leaves on its target (or what sort of action it is): its placeholder icon's look follows it. */
export const ACTION_EFFECTS = ['bleeding', 'dazed', 'prone', 'crippled', 'weakened', 'disarmed', 'cleave', 'shot', 'brace'] as const;
export type ActionEffect = (typeof ACTION_EFFECTS)[number];
const isEffect = (v: unknown): v is ActionEffect => ACTION_EFFECTS.some((e) => e === v);

export type WeaponAction = { id: string; name: string; text: string; effect: ActionEffect; worked: boolean };

/** One action from the file, checked. */
function readAction(id: string, raw: unknown): WeaponAction {
  ensure(isRecord(raw) && typeof raw.name === 'string' && typeof raw.text === 'string' && isEffect(raw.effect), `Bad weapon action ${id}`, { id });
  return { id, name: String(raw.name), text: String(raw.text), effect: isEffect(raw.effect) ? raw.effect : 'shot', worked: raw.worked === true };
}

const ACTIONS: ReadonlyMap<string, WeaponAction> = new Map(Object.entries(data.actions).map(([id, raw]) => [id, readAction(id, raw)]));

/** Each weapon's actions, checked: known weapons, known actions. */
const BY_WEAPON: ReadonlyMap<WeaponBase, readonly WeaponAction[]> = new Map(Object.entries(data.weapons).map(([base, ids]) => {
  ensure(isWeaponBase(base), `Unknown weapon ${base} in weapon-actions.json`, { base });
  const actions = ids.map((id) => {
    const action = ACTIONS.get(id);
    ensure(action !== undefined, `Unknown weapon action ${id} for ${base}`, { base, id });
    return action ?? readAction(id, null);
  });
  return [isWeaponBase(base) ? base : 'unarmed', actions];
}));

const NONE: readonly WeaponAction[] = [];

/** The actions a weapon unlocks for a hero trained in it (none for a weapon that has none). */
export function weaponActions(base: WeaponBase): readonly WeaponAction[] {
  return BY_WEAPON.get(base) ?? NONE;
}
