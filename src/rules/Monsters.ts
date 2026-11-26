import { MathUtils } from 'yuka';
import { STAT_NAMES } from '../world';
import type { MobType, StatName } from '../world';
import { ensure } from '../core/errors';
import { abilityModifier } from './Abilities';
import { isWeaponBase } from './WeaponTable';
import type { WeaponBase } from './WeaponTable';
import stats from '../data/stats.json';
import { isRecord } from '../core/guards';
import { isSpellId } from './Spells';
import type { SpellId } from './Spells';
import { DAMAGE_TYPES, PHYSICAL_DAMAGE_TYPES } from './DamageTypes';
import type { DamageType, PhysicalDamageType } from './DamageTypes';
import { isThrowableId } from './Throwables';
import type { ThrowableId } from './Throwables';

/**
 * Enemies as the tabletop rules see them, from the SRD monster blocks in src/data/stats.json: Armor Class,
 * proficiency bonus, ability scores and the low-end weapons each kind may carry.
 */

export type MonsterStats = {
  /** The SRD monster it is copied from. */
  source: string;
  health: number;
  ac: number;
  proficiency: number;
  abilities: Readonly<Record<StatName, number>>;
  modifiers: Readonly<Record<StatName, number>>;
  weapons: readonly WeaponBase[];
  /** Experience for the kill (SRD, by challenge rating). */
  xp: number;
  deathPoints: number;
  /** The bows a share of this kind carry instead of their weapons (they shoot from afar), if any. */
  ranged: { weapons: readonly WeaponBase[]; share: number } | null;
  /** Casts the heroes' spells (systems/EnemyRangedSystem.ts): with this ability, these spells, at the party's level. */
  caster: { ability: StatName; spells: readonly SpellId[] } | null;
  /** The flasks a share of this kind carry to throw at the heroes (systems/ThrowSystem.ts), if any. */
  throwables: { items: readonly ThrowableId[]; share: number } | null;
  /** The kinds of damage it resists, is immune to or vulnerable to (SRD), and the weapon damage it resists only when nonmagical. */
  defences: MonsterDefences;
};

/** A monster's resistances, immunities and vulnerabilities (rules/Resistances.ts). */
export type MonsterDefences = {
  resist: readonly DamageType[]; immune: readonly DamageType[]; vulnerable: readonly DamageType[]; resistNonmagical: readonly PhysicalDamageType[];
};

const NO_DEFENCES: MonsterDefences = { resist: [], immune: [], vulnerable: [], resistNonmagical: [] };
const isDamageType = (v: unknown): v is DamageType => DAMAGE_TYPES.some((t) => t === v);
const isPhysical = (v: unknown): v is PhysicalDamageType => PHYSICAL_DAMAGE_TYPES.some((t) => t === v);

type RawMonster = (typeof stats.mobs)[MobType];

/** A kind's bows, if its block lists any. */
function readRanged(type: MobType, raw: unknown): MonsterStats['ranged'] {
  if (!isRecord(raw) || !isRecord(raw.ranged)) return null;
  const { weapons, share } = raw.ranged;
  ensure(Array.isArray(weapons) && weapons.every(isWeaponBase) && typeof share === 'number', `Bad ranged block for ${type}`, { type });
  return { weapons: weapons.filter(isWeaponBase), share };
}

/** A kind's spellcasting, if its block lists any: every spell one the heroes can cast too. */
function readCaster(type: MobType, raw: unknown): MonsterStats['caster'] {
  if (!isRecord(raw) || !isRecord(raw.spellcaster)) return null;
  const { ability, spells } = raw.spellcaster;
  const stat = STAT_NAMES.find((name) => name === ability);
  ensure(!!stat && Array.isArray(spells) && spells.every(isSpellId), `Bad spellcaster block for ${type}`, { type });
  return { ability: stat ?? 'charisma', spells: Array.isArray(spells) ? spells.filter(isSpellId) : [] };
}

/** A kind's flasks, if its block lists any. */
function readThrowables(type: MobType, raw: unknown): MonsterStats['throwables'] {
  if (!isRecord(raw) || !isRecord(raw.throwables)) return null;
  const { items, share } = raw.throwables;
  ensure(Array.isArray(items) && items.every(isThrowableId) && typeof share === 'number', `Bad throwables block for ${type}`, { type });
  return { items: Array.isArray(items) ? items.filter(isThrowableId) : [], share: typeof share === 'number' ? share : 0 };
}

/** A list of damage types from a defences block, checked. */
function typeList<T extends DamageType>(type: MobType, field: string, raw: unknown, guard: (v: unknown) => v is T): T[] {
  if (raw === undefined) return [];
  ensure(Array.isArray(raw) && raw.every(guard), `Bad ${field} defences for ${type}`, { type, field });
  return Array.isArray(raw) ? raw.filter(guard) : [];
}

/** A kind's resistances, immunities and vulnerabilities, if its block lists any. */
function readDefences(type: MobType, raw: unknown): MonsterDefences {
  if (!isRecord(raw) || !isRecord(raw.defences)) return NO_DEFENCES;
  const d = raw.defences;
  return {
    resist: typeList(type, 'resist', d.resist, isDamageType),
    immune: typeList(type, 'immune', d.immune, isDamageType),
    vulnerable: typeList(type, 'vulnerable', d.vulnerable, isDamageType),
    resistNonmagical: typeList(type, 'resistNonmagical', d.resistNonmagical, isPhysical),
  };
}

function readMonster(type: MobType, raw: RawMonster): MonsterStats {
  const abilities: Record<StatName, number> = raw.abilities;
  ensure(STAT_NAMES.every((stat) => Number.isFinite(abilities[stat])), `Missing ability score for ${type}`, { type });
  ensure(raw.weapons.length > 0 && raw.weapons.every(isWeaponBase), `Unknown weapon for ${type}`, { type, weapons: raw.weapons.join(', ') });
  const modifiers = { ...abilities };
  for (const stat of STAT_NAMES) modifiers[stat] = abilityModifier(abilities[stat]);
  return {
    source: raw.source, health: raw.health, ac: raw.ac, proficiency: raw.proficiency,
    abilities, modifiers, weapons: raw.weapons.filter(isWeaponBase), xp: raw.xp, deathPoints: raw.deathPoints,
    ranged: readRanged(type, raw), caster: readCaster(type, raw), throwables: readThrowables(type, raw), defences: readDefences(type, raw),
  };
}

export const MONSTERS = {
  goblin: readMonster('goblin', stats.mobs.goblin),
  skeleton: readMonster('skeleton', stats.mobs.skeleton),
  orc: readMonster('orc', stats.mobs.orc),
  troll: readMonster('troll', stats.mobs.troll),
  goblin_grunt: readMonster('goblin_grunt', stats.mobs.goblin_grunt),
  goblin_rogue: readMonster('goblin_rogue', stats.mobs.goblin_rogue),
  goblin_warrior: readMonster('goblin_warrior', stats.mobs.goblin_warrior),
  ghost_wizard: readMonster('ghost_wizard', stats.mobs.ghost_wizard),
  evil_wizard: readMonster('evil_wizard', stats.mobs.evil_wizard),
  shade: readMonster('shade', stats.mobs.shade),
  grick: readMonster('grick', stats.mobs.grick),
} as const satisfies Record<MobType, MonsterStats>;

/** The flask a new enemy of this kind carries, now and then (a kind that carries some), or null. */
export function randomMonsterThrowable(type: MobType, roll = Math.random()): ThrowableId | null {
  const carried = MONSTERS[type].throwables;
  if (!carried || carried.items.length === 0 || roll >= carried.share) return null;
  return carried.items[Math.floor((roll / carried.share) * carried.items.length) % carried.items.length];
}

/** One of the weapons this kind of enemy may carry, picked at random: now and then a bow, for a kind that has some. */
export function randomMonsterWeapon(type: MobType): WeaponBase {
  const { ranged } = MONSTERS[type];
  const weapons = ranged && Math.random() < ranged.share ? ranged.weapons : MONSTERS[type].weapons;
  return weapons[MathUtils.randInt(0, weapons.length - 1)];
}
