import { MathUtils } from 'yuka';
import { STAT_NAMES } from '../world';
import type { MobType, StatName } from '../world';
import { ensure } from '../core/errors';
import { abilityModifier } from './Abilities';
import { isWeaponBase } from './WeaponTable';
import type { WeaponBase } from './WeaponTable';
import stats from '../data/stats.json';

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
  deathPoints: number;
};

type RawMonster = (typeof stats.mobs)[MobType];

function readMonster(type: MobType, raw: RawMonster): MonsterStats {
  const abilities: Record<StatName, number> = raw.abilities;
  ensure(STAT_NAMES.every((stat) => Number.isFinite(abilities[stat])), `Missing ability score for ${type}`, { type });
  ensure(raw.weapons.length > 0 && raw.weapons.every(isWeaponBase), `Unknown weapon for ${type}`, { type, weapons: raw.weapons.join(', ') });
  const modifiers = { ...abilities };
  for (const stat of STAT_NAMES) modifiers[stat] = abilityModifier(abilities[stat]);
  return {
    source: raw.source, health: raw.health, ac: raw.ac, proficiency: raw.proficiency,
    abilities, modifiers, weapons: raw.weapons.filter(isWeaponBase), deathPoints: raw.deathPoints,
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
} as const satisfies Record<MobType, MonsterStats>;

/** One of the weapons this kind of enemy may carry, picked at random. */
export function randomMonsterWeapon(type: MobType): WeaponBase {
  const weapons = MONSTERS[type].weapons;
  return weapons[MathUtils.randInt(0, weapons.length - 1)];
}
