import { ensure } from '../core/errors';
import { isRecord } from '../core/guards';
import { isStatName } from '../world';
import type { StatName } from '../world';
import { isWeaponBase } from './WeaponTable';
import type { WeaponBase } from './WeaponTable';
import data from '../data/weapon-actions.json';

/**
 * The weapon actions a hero trained in a weapon unlocks with it while it is in their main hand (Baldur's Gate 3's
 * "Proficiency unlocks", as bg3.wiki's Weapon actions page gives them), read from src/data/weapon-actions.json and checked:
 * Lacerate leaves a foe Bleeding, Concussive Smash Dazed, Topple Prone, Hamstring Shot Hamstrung… Each is bound to the quick
 * bar from the weapon's tooltip (`action:<id>`), used with its key and, unless it says otherwise, spent until a short or long
 * rest, even on a miss (systems/WeaponActions.ts). Its target saves against the weapon action DC: 8 + proficiency + the
 * better of STR and DEX + the action's own bonus (most +2); a hybrid DC takes the spell save DC instead when that is higher.
 */

export const WEAPON_ACTION_IDS = [
  'backbreaker', 'brace_melee', 'cleave', 'concussive_smash', 'maiming_strike', 'disarming_strike', 'flourish', 'heartstopper',
  'lacerate', 'piercing_strike', 'pommel_strike', 'prepare', 'rush_attack', 'tenacity', 'topple', 'weakening_strike',
  'brace_ranged', 'hamstring_shot', 'mobile_shot', 'piercing_shot',
] as const;
export type WeaponActionId = (typeof WEAPON_ACTION_IDS)[number];

export function isWeaponActionId(value: unknown): value is WeaponActionId {
  return WEAPON_ACTION_IDS.some((id) => id === value);
}

/** The conditions weapon actions lay on a foe (systems/WeaponMarks.ts; prone is the foe's own mark, ManeuverSystem.ts). */
export const WEAPON_CONDITIONS = [
  'bleeding', 'dazed', 'maimed', 'off_balance', 'prone', 'weak_grip', 'chest_trauma', 'gaping_wounds', 'hamstrung', 'disarmed',
] as const;
export type WeaponCondition = (typeof WEAPON_CONDITIONS)[number];
const isCondition = (v: unknown): v is WeaponCondition => WEAPON_CONDITIONS.some((c) => c === v);

const COSTS = ['action', 'bonus', 'movement', 'reaction'] as const;
const KINDS = ['strike', 'shot', 'cleave', 'rush', 'stance', 'reaction', 'mobile'] as const;
const DAMAGES = ['weapon', 'd4_mod', 'd4', 'half_weapon', 'none'] as const;
const RECHARGES = ['short_rest', 'unlimited'] as const;
export type ActionCost = (typeof COSTS)[number];
export type ActionKind = (typeof KINDS)[number];
export type ActionDamage = (typeof DAMAGES)[number];

/** One of a list of literals, or undefined. */
function oneOf<T extends string>(list: readonly T[], value: unknown): T | undefined {
  return list.find((item) => item === value);
}

export type WeaponAction = {
  id: WeaponActionId; name: string; icon: string; cost: ActionCost; kind: ActionKind; reach: 'melee' | 'ranged';
  damage: ActionDamage; save: StatName | null; dcBonus: number; hybridDc: boolean; condition: WeaponCondition | null;
  /** How long its condition lasts, in turns (6 s each). */
  turns: number;
  /** Once until a rest (false: as often as the hero likes). */
  perRest: boolean;
  text: string; playedAs: string | null; worked: boolean;
};

/** One action from the file, checked. */
function readAction(id: WeaponActionId, raw: unknown): WeaponAction {
  ensure(isRecord(raw) && typeof raw.name === 'string' && typeof raw.text === 'string' && typeof raw.icon === 'string', `Bad weapon action ${id}`, { id });
  const record = isRecord(raw) ? raw : {};
  const cost = oneOf(COSTS, record.cost);
  const kind = oneOf(KINDS, record.kind);
  const damage = oneOf(DAMAGES, record.damage);
  const recharge = oneOf(RECHARGES, record.recharge);
  const reach = record.reach === 'ranged' ? 'ranged' : 'melee';
  ensure(!!cost && !!kind && !!damage && !!recharge, `Bad weapon action ${id}: cost, kind, damage or recharge`, { id });
  ensure(record.save === undefined || isStatName(record.save), `Bad save for weapon action ${id}`, { id });
  ensure(record.condition === undefined || isCondition(record.condition), `Bad condition for weapon action ${id}`, { id });
  return {
    id, name: String(record.name), icon: String(record.icon), cost: cost ?? 'action', kind: kind ?? 'strike', reach, damage: damage ?? 'none',
    save: isStatName(record.save) ? record.save : null, dcBonus: typeof record.dcBonus === 'number' ? record.dcBonus : 0,
    hybridDc: record.hybridDc === true, condition: isCondition(record.condition) ? record.condition : null,
    turns: typeof record.turns === 'number' ? record.turns : 0, perRest: recharge !== 'unlimited',
    text: String(record.text), playedAs: typeof record.playedAs === 'string' ? record.playedAs : null, worked: record.worked === true,
  };
}

const ACTIONS: ReadonlyMap<WeaponActionId, WeaponAction> = new Map(Object.entries(data.actions).map(([id, raw]) => {
  ensure(isWeaponActionId(id), `Unknown weapon action ${id} in weapon-actions.json`, { id });
  const known = isWeaponActionId(id) ? id : 'cleave';
  return [known, readAction(known, raw)];
}));
ensure(WEAPON_ACTION_IDS.every((id) => ACTIONS.has(id)), 'A weapon action is missing from weapon-actions.json');

/** Each weapon's actions, checked: known weapons, known actions. */
const BY_WEAPON: ReadonlyMap<WeaponBase, readonly WeaponAction[]> = new Map(Object.entries(data.weapons).map(([base, ids]) => {
  ensure(isWeaponBase(base), `Unknown weapon ${base} in weapon-actions.json`, { base });
  const actions = ids.map((id) => {
    const action = isWeaponActionId(id) ? ACTIONS.get(id) : undefined;
    ensure(action !== undefined, `Unknown weapon action ${id} for ${base}`, { base, id });
    return action ?? weaponAction('cleave');
  });
  return [isWeaponBase(base) ? base : 'unarmed', actions];
}));

const NONE: readonly WeaponAction[] = [];

/** A weapon action by its id. */
export function weaponAction(id: WeaponActionId): WeaponAction {
  const action = ACTIONS.get(id);
  ensure(action !== undefined, `Unknown weapon action ${id}`, { id });
  return action ?? readAction(id, null);
}

/** The actions a weapon unlocks for a hero trained in it (none for a weapon that has none). */
export function weaponActions(base: WeaponBase): readonly WeaponAction[] {
  return BY_WEAPON.get(base) ?? NONE;
}

/** Whether a weapon unlocks the action. */
export function weaponHasAction(base: WeaponBase, id: WeaponActionId): boolean {
  return weaponActions(base).some((action) => action.id === id);
}

/** The weapons that unlock an action (for a binding: a hero trained in one of them may put it on the quick bar). */
export function weaponsWithAction(id: WeaponActionId): WeaponBase[] {
  const bases: WeaponBase[] = [];
  for (const [base, actions] of BY_WEAPON) if (actions.some((action) => action.id === id)) bases.push(base);
  return bases;
}

/** The word that makes a quick-bar binding a weapon action (`action:lacerate`). */
export const ACTION_PREFIX = 'action:';

/** The weapon action a quick-bar binding uses, if it is one. */
export function bindingActionId(spell: string): WeaponActionId | null {
  if (!spell.startsWith(ACTION_PREFIX)) return null;
  const id = spell.slice(ACTION_PREFIX.length);
  return isWeaponActionId(id) ? id : null;
}

export const actionBinding = (id: WeaponActionId): string => `${ACTION_PREFIX}${id}`;

/** The texture key of an action's icon (assets/SheetCatalog.ts registers them). */
export const actionIconKey = (id: WeaponActionId): string => `weapon_action_icon_${id}`;

/** Every action's icon: its texture key and its file under public/. */
export function actionIconSources(): { key: string; src: string }[] {
  return WEAPON_ACTION_IDS.map((id) => ({ key: actionIconKey(id), src: `/weapon-actions/${weaponAction(id).icon}_pixelart.png` }));
}

/** The weapon action DC: 8 + proficiency + the better of STR and DEX + the action's own bonus. */
export function weaponActionDc(action: WeaponAction, proficiency: number, strength: number, dexterity: number): number {
  return 8 + proficiency + Math.max(strength, dexterity) + action.dcBonus;
}
