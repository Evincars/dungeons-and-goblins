import type { StatName } from '../world';
import { text } from '../core/texts';
import { statDescription, statName, statShort } from '../entities/Items';
import { BASE_ABILITIES } from '../rules/Abilities';
import type { CharacterSheet } from '../rules/CharacterSheet';
import { formatDice, formatModifier } from '../rules/Dice';
import { armorName, damageTypeName, weaponName } from '../rules/Names';
import type { TipTopic } from './InfoTooltip';

/** The character sheet's tooltips: what each value means, and how the player's own one adds up. */

export function statTopic(stat: StatName, sheet: CharacterSheet): TipTopic {
  const score = sheet.scores[stat];
  const base = BASE_ABILITIES[stat];
  const detail = text('stat.score_detail', { score, base, gear: formatModifier(score - base), modifier: formatModifier(sheet.modifiers[stat]) });
  return { title: statName(stat), body: statDescription(stat), detail: detail.split('\n') };
}

export function armorClassTopic(sheet: CharacterSheet): TipTopic {
  const ac = sheet.armorClass;
  const detail = [ac.armor ? text('sheet.ac.armor', { armor: armorName(ac.armor.base), ac: ac.base }) : text('sheet.ac.unarmored')];
  const heavy = ac.armor && ac.dex === 0 && sheet.modifiers.dexterity !== 0;
  detail.push(heavy ? text('sheet.ac.dex_heavy') : text('sheet.ac.dex', { modifier: formatModifier(ac.dex) }));
  if (ac.magic) detail.push(text('sheet.ac.magic', { bonus: formatModifier(ac.magic) }));
  if (ac.shield) detail.push(text('sheet.ac.shield', { bonus: formatModifier(ac.shield) }));
  detail.push(text('sheet.ac.total', { total: ac.total }));
  return { title: text('sheet.ac.name'), body: text('sheet.ac.description'), detail };
}

export function hitPointsTopic(sheet: CharacterSheet): TipTopic {
  const detail = [text('sheet.hp.detail', { current: sheet.hitPoints.current, max: sheet.hitPoints.max })];
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
  detail.push(text('sheet.dmg.total', { dice: formatDice(attack.damage) }));
  detail.push(text('sheet.dmg.to_hit', { bonus: formatModifier(attack.attackBonus), proficiency: formatModifier(attack.proficiency) }));
  return { title: text('sheet.dmg.name'), body: text('sheet.dmg.description'), detail };
}
