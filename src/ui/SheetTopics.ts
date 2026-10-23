import type { StatName } from '../world';
import { text } from '../core/texts';
import { statDescription, statName, statShort } from '../entities/Items';
import type { CharacterSheet } from '../rules/CharacterSheet';
import { formatDamage, formatDice, formatModifier } from '../rules/Dice';
import { armorName, damageTypeName, featureName, trainingName, weaponName } from '../rules/Names';
import type { TipTopic } from './InfoTooltip';

/** The character sheet's tooltips: what each value means, and how the player's own one adds up. */

export function statTopic(stat: StatName, sheet: CharacterSheet): TipTopic {
  const score = sheet.scores[stat];
  const base = sheet.heroClass.abilities[stat];
  const detail = text('stat.score_detail', { score, base, gear: formatModifier(score - base), modifier: formatModifier(sheet.modifiers[stat]) });
  return { title: statName(stat), body: statDescription(stat), detail: detail.split('\n') };
}

export function armorClassTopic(sheet: CharacterSheet): TipTopic {
  const ac = sheet.armorClass;
  const detail = [ac.armor ? text('sheet.ac.armor', { armor: armorName(ac.armor.base), ac: ac.base }) : text('sheet.ac.unarmored')];
  const heavy = ac.armor?.category === 'heavy';
  detail.push(heavy ? text('sheet.ac.dex_heavy') : text('sheet.ac.dex', { modifier: formatModifier(ac.dex) }));
  if (ac.magic) detail.push(text('sheet.ac.magic', { bonus: formatModifier(ac.magic) }));
  if (ac.shield) detail.push(text('sheet.ac.shield', { bonus: formatModifier(ac.shield) }));
  if (ac.featureName) detail.push(text('sheet.ac.feature', { feature: featureName(ac.featureName), bonus: formatModifier(ac.feature) }));
  detail.push(text('sheet.ac.total', { total: ac.total }));
  return { title: text('sheet.ac.name'), body: text('sheet.ac.description'), detail };
}

export function hitPointsTopic(sheet: CharacterSheet): TipTopic {
  const detail = [
    text('sheet.hp.detail', { current: sheet.hitPoints.current, max: sheet.hitPoints.max }),
    text('sheet.hp.hit_die', { die: sheet.heroClass.hitDie }),
  ];
  return { title: text('sheet.hp.name'), body: text('sheet.hp.description'), detail };
}

export function damageTopic(sheet: CharacterSheet): TipTopic {
  const attack = sheet.attack;
  const base = weaponName(attack.base);
  const detail = [
    text('sheet.dmg.weapon', { name: attack.item?.name ?? base }),
    text('sheet.dmg.dice', { base, dice: formatDice(attack.rule.damage), type: damageTypeName(attack.rule.type) }),
  ];
  if (attack.twoHanded && attack.rule.versatile) detail.push(text('sheet.dmg.two_handed', { dice: formatDice(attack.rule.versatile) }));
  detail.push(text('sheet.dmg.ability', { ability: statShort(attack.ability), modifier: formatModifier(attack.abilityModifier) }));
  if (attack.magic) detail.push(text('sheet.dmg.magic', { bonus: formatModifier(attack.magic) }));
  if (attack.extra) detail.push(text('sheet.dmg.sneak', { dice: formatDice(attack.extra) }));
  detail.push(text('sheet.dmg.total', { dice: formatDamage(attack.damage, attack.extra) }));
  detail.push(text('sheet.dmg.to_hit', { bonus: formatModifier(attack.attackBonus), proficiency: formatModifier(attack.proficiency) }));
  if (attack.mode === 'disadvantage') detail.push(text('sheet.dmg.disadvantage'));
  return { title: text('sheet.dmg.name'), body: text('sheet.dmg.description'), detail };
}

/** Armour training: what it means, and whether what is worn now is covered. */
export function armorTrainingTopic(sheet: CharacterSheet): TipTopic {
  const worn = sheet.armorClass.armor;
  const detail = [worn
    ? text(sheet.armorClass.proficient ? 'proficiency.armor_trained' : 'proficiency.armor_untrained', { armor: armorName(worn.base), kind: trainingName(worn.category) })
    : text('sheet.ac.unarmored')];
  return { title: text('proficiency.armor_title'), body: text('proficiency.armor_description'), detail };
}

/** Weapon training: what it means, and whether the weapon in hand is covered. */
export function weaponTrainingTopic(sheet: CharacterSheet): TipTopic {
  const attack = sheet.attack;
  const vars = { weapon: weaponName(attack.base), kind: trainingName(attack.rule.category), bonus: formatModifier(attack.proficiency) };
  const detail = [text(attack.proficient ? 'proficiency.weapon_trained' : 'proficiency.weapon_untrained', vars)];
  return { title: text('proficiency.weapons_title'), body: text('proficiency.weapons_description'), detail };
}
