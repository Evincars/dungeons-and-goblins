import type { StatName } from '../world';
import { text } from '../core/texts';
import { statDescription, statName, statShort } from '../entities/Items';
import { keyAbilities } from '../rules/CharacterSheet';
import type { CharacterSheet, WeaponAttack } from '../rules/CharacterSheet';
import { NATURAL_CRIT, formatDamage, formatDice, formatModifier } from '../rules/Dice';
import { armorName, damageTypeName, dndClassName, featName, featureName, fightingStyleName, trainingName, weaponName } from '../rules/Names';
import { BASE_SPEED_FT } from '../rules/CharacterSheet';
import type { TipDetail, TipTopic } from './InfoTooltip';
import { THEME } from './Theme';
import type { DamageType } from '../rules/DamageTypes';

/** The note under an off-hand weapon that makes no blow. */
const BLOCKED_COLOR = 0xe85a4f;

/** Kinds of damage as a list ("slashing, piercing"), or "none". */
const typeList = (types: readonly DamageType[]): string => (types.length ? types.map(damageTypeName).join(', ') : text('sheet.ac.no_types'));

/** The character sheet's tooltips: what each value means, and how the player's own one adds up. */

export function statTopic(stat: StatName, sheet: CharacterSheet): TipTopic {
  const score = sheet.scores[stat];
  const base = sheet.baseScores[stat];
  const detail = text('stat.score_detail', { score, base, gear: formatModifier(score - base), modifier: formatModifier(sheet.modifiers[stat]) }).split('\n');
  // Why it is framed in gold: the class leans on it, or casts its spells with it.
  if (keyAbilities(sheet).has(stat)) detail.push(sheet.spell.trained && sheet.spell.ability === stat ? text('stat.key_spellcasting') : text('stat.key_primary'));
  return { title: statName(stat), body: statDescription(stat), detail };
}

export function armorClassTopic(sheet: CharacterSheet): TipTopic {
  const ac = sheet.armorClass;
  const detail = [ac.armor ? text('sheet.ac.armor', { armor: armorName(ac.armor.base), ac: ac.base }) : text('sheet.ac.unarmored')];
  const heavy = ac.armor?.category === 'heavy';
  detail.push(heavy ? text('sheet.ac.dex_heavy') : text('sheet.ac.dex', { modifier: formatModifier(ac.dex) }));
  if (ac.magic) detail.push(text('sheet.ac.magic', { bonus: formatModifier(ac.magic) }));
  if (ac.shield) detail.push(text('sheet.ac.shield', { bonus: formatModifier(ac.shield) }));
  if (ac.featureName) detail.push(text('sheet.ac.feature', { feature: fightingStyleName(ac.featureName), bonus: formatModifier(ac.feature) }));
  if (ac.feat) detail.push(text('sheet.ac.feat', { bonus: formatModifier(ac.feat) }));
  if (ac.school) detail.push(text('sheet.ac.school', { bonus: formatModifier(ac.school) }));
  if (ac.spell) detail.push(text('sheet.ac.spell', { bonus: formatModifier(ac.spell) }));
  detail.push(text('sheet.ac.total', { total: ac.total }));
  // What the hero resists (half damage) and is immune to (none), every kind of damage, weapons' and spells'.
  const { resist, immune } = sheet.defences;
  detail.push(text('sheet.ac.resistant', { types: typeList(resist) }), text('sheet.ac.immune', { types: typeList(immune) }));
  return { title: text('sheet.ac.name'), body: text('sheet.ac.description'), detail };
}

export function hitPointsTopic(sheet: CharacterSheet): TipTopic {
  const detail = [
    text('sheet.hp.detail', { current: sheet.hitPoints.current, max: sheet.hitPoints.max }),
    text('sheet.hp.hit_die', { die: sheet.heroClass.hitDie }),
  ];
  return { title: text('sheet.hp.name'), body: text('sheet.hp.description'), detail };
}

/**
 * Weapon damage: how the blow of the weapon in hand adds up, and what it adds to its d20. With a weapon in each hand the
 * main hand's blow comes first under a heading, then the off hand's, each told whole.
 */
export function damageTopic(sheet: CharacterSheet): TipTopic {
  const attack = sheet.attack;
  const second = sheet.offHand ?? sheet.offHandBlocked;
  const detail: TipDetail[] = [];
  if (second) detail.push({ text: text('sheet.dmg.main_hand'), color: THEME.title });
  detail.push(...attackLines(attack));
  if (attack.critFrom < NATURAL_CRIT) detail.push(text('sheet.dmg.crit', { from: attack.critFrom }));
  if (sheet.attacks > 1) detail.push(text('sheet.dmg.attacks', { count: sheet.attacks }));
  if (second) {
    detail.push({ text: text('sheet.dmg.off_hand'), color: THEME.title });
    detail.push(...attackLines(second));
  }
  // A weapon in the second hand that makes no blow: two-weapon fighting asks for light weapons without Dual Wielder.
  if (!sheet.offHand && sheet.offHandBlocked) detail.push({ text: text('sheet.dmg.off_hand_blocked'), color: BLOCKED_COLOR });
  if (sheet.battleMaster) detail.push(text('sheet.dmg.maneuver_dc', { dc: sheet.maneuverDc }));
  const full: TipTopic = { title: text('sheet.dmg.name'), body: text('sheet.dmg.description'), detail };
  // Short, two lines: what each hand deals and how it hits; holding Alt shows the whole breakdown and the rules.
  const short: TipDetail[] = [];
  if (sheet.offHand) short.push(text('sheet.dmg.short_hand', { hand: text('sheet.dmg.off_hand'), line: shortAttack(sheet.offHand) }));
  if (sheet.butt) short.push(text('sheet.dmg.short_hand', { hand: text('sheet.dmg.butt'), line: shortAttack(sheet.butt) }));
  if (sheet.attacks > 1) short.push(text('sheet.dmg.attacks', { count: sheet.attacks }));
  const main = shortAttack(attack);
  return { title: text('sheet.dmg.name'), body: sheet.offHand ? text('sheet.dmg.short_hand', { hand: text('sheet.dmg.main_hand'), line: main }) : main, detail: short, more: full };
}

/** One hand's blow in a line: "Rapier 1d8+3 piercing, +5 to hit". */
function shortAttack(attack: WeaponAttack): string {
  const name = attack.item?.name ?? weaponName(attack.base);
  return text('sheet.dmg.short_line', { name, dice: formatDamage(attack.damage, attack.extra), type: damageTypeName(attack.rule.type), bonus: formatModifier(attack.attackBonus) });
}

/** One weapon's blow: its dice, every bonus to damage, the total, and the to-hit with what it is made of. */
function attackLines(attack: WeaponAttack): string[] {
  const base = weaponName(attack.base);
  const lines = [
    text('sheet.dmg.weapon', { name: attack.item?.name ?? base }),
    text('sheet.dmg.dice', { base, dice: formatDice(attack.rule.damage), type: damageTypeName(attack.rule.type) }),
  ];
  if (attack.twoHanded && attack.rule.versatile) lines.push(text('sheet.dmg.two_handed', { dice: formatDice(attack.rule.versatile) }));
  lines.push(abilityLine(attack));
  if (attack.magic) lines.push(text('sheet.dmg.magic', { bonus: formatModifier(attack.magic) }));
  if (attack.styleDamage && attack.styleName) lines.push(text('sheet.dmg.style', { style: fightingStyleName(attack.styleName), bonus: formatModifier(attack.styleDamage) }));
  if (attack.featDamage && attack.featName) lines.push(text('sheet.dmg.style', { style: featName(attack.featName), bonus: formatModifier(attack.featDamage) }));
  if (attack.extra) lines.push(text('sheet.dmg.sneak', { dice: formatDice(attack.extra) }));
  if (attack.rerollBelow) lines.push(text('sheet.dmg.reroll', { below: attack.rerollBelow }));
  if (attack.savage) lines.push(text('sheet.dmg.savage'));
  lines.push(text('sheet.dmg.total', { dice: formatDamage(attack.damage, attack.extra) }));
  lines.push(text('sheet.dmg.to_hit', { bonus: formatModifier(attack.attackBonus), parts: hitParts(attack) }));
  if (attack.mode === 'disadvantage') lines.push(text('sheet.dmg.disadvantage'));
  return lines;
}

/** What the ability adds to damage: all of it, or (an off-hand blow without Two-Weapon Fighting) none of it. */
function abilityLine(attack: WeaponAttack): string {
  const vars = { ability: statShort(attack.ability), modifier: formatModifier(attack.abilityDamage) };
  if (attack.abilityDamage === 0 && attack.abilityModifier > 0) return text('sheet.dmg.ability_off_hand', { ability: vars.ability, modifier: formatModifier(attack.abilityModifier) });
  return text('sheet.dmg.ability', vars);
}

/** "STR +3, proficiency +2, Archery +2, magic +1": what the to-hit is made of (proficiency only for a weapon the hero is trained in). */
function hitParts(attack: WeaponAttack): string {
  const parts = [`${statShort(attack.ability)} ${formatModifier(attack.abilityHit)}`];
  parts.push(attack.proficient ? text('sheet.dmg.hit_proficiency', { bonus: formatModifier(attack.proficiency) }) : text('sheet.dmg.hit_untrained'));
  if (attack.styleHit && attack.styleName) parts.push(`${fightingStyleName(attack.styleName)} ${formatModifier(attack.styleHit)}`);
  if (attack.magic) parts.push(text('sheet.dmg.hit_magic', { bonus: formatModifier(attack.magic) }));
  if (attack.featHit && attack.featName) parts.push(`${featName(attack.featName)} ${formatModifier(attack.featHit)}`);
  return parts.join(', ');
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

/** The proficiency bonus: what it is added to, and this hero's at their level. */
export function proficiencyBonusTopic(sheet: CharacterSheet): TipTopic {
  const detail = [text('sheet.proficiency.detail', { level: sheet.level, bonus: formatModifier(sheet.proficiency) })];
  return { title: text('sheet.proficiency.name'), body: text('sheet.proficiency.description'), detail };
}

export function initiativeTopic(sheet: CharacterSheet): TipTopic {
  const dex = sheet.modifiers.dexterity;
  const detail = [text('sheet.initiative.detail', { modifier: formatModifier(dex) })];
  if (sheet.initiative !== dex) detail.push(text('sheet.initiative.bonus', { bonus: formatModifier(sheet.initiative - dex) }));
  return { title: text('sheet.initiative.name'), body: text('sheet.initiative.description'), detail };
}

/** Speed, and why it is down when heavy armour is too heavy for the hero. */
export function speedTopic(sheet: CharacterSheet): TipTopic {
  const armor = sheet.armorClass.armor;
  const slowed = sheet.speed < BASE_SPEED_FT && armor;
  const detail = [slowed ? text('sheet.speed.slowed', { armor: armorName(armor.base) }) : text('sheet.speed.detail', { feet: sheet.speed })];
  return { title: text('sheet.speed.name'), body: text('sheet.speed.description'), detail };
}

export function perceptionTopic(sheet: CharacterSheet): TipTopic {
  const detail = [text('sheet.passive.detail', { modifier: formatModifier(sheet.modifiers.wisdom), total: sheet.passivePerception })];
  return { title: text('sheet.passive.name'), body: text('sheet.passive.description'), detail };
}

/** Hit dice: how many are left to spend (a click spends one), and what one heals. */
export function hitDiceTopic(sheet: CharacterSheet): TipTopic {
  const { left, total } = sheet.hitDice;
  const vars = { left, total, die: sheet.heroClass.hitDie, modifier: formatModifier(sheet.modifiers.constitution) };
  const detail = [text('sheet.hit_dice.detail', vars)];
  if (!left) detail.push(text('sheet.hit_dice.none'));
  return { title: text('sheet.hit_dice.name'), body: text('sheet.hit_dice.description'), detail };
}

/** Experience: the total so far and what the next level needs. */
export function experienceTopic(sheet: CharacterSheet): TipTopic {
  const { xp, next } = sheet.experience;
  const detail = [next === null
    ? text('sheet.xp.max', { level: sheet.level, xp })
    : text('sheet.xp.detail', { level: sheet.level, xp, next: sheet.level + 1, needed: next })];
  return { title: text('sheet.xp.name'), body: text('sheet.xp.description'), detail };
}

/** Spellcasting: the ability spells use, the attack bonus and save DC it gives (and a note for non-casters). */
export function spellTopic(sheet: CharacterSheet): TipTopic {
  const s = sheet.spell;
  const detail = [text('sheet.spell.detail', { ability: statShort(s.ability), modifier: formatModifier(sheet.modifiers[s.ability]), attack: formatModifier(s.attack), dc: s.dc })];
  if (!s.trained) detail.push(text('sheet.spell.untrained'));
  return { title: text('sheet.spell.name'), body: text('sheet.spell.description'), detail };
}

/** Saving throws: how they are rolled, and the two this class is trained in. */
export function savesTopic(sheet: CharacterSheet): TipTopic {
  const trained = sheet.heroClass.savingThrows.map((stat) => `${statShort(stat)} ${formatModifier(sheet.saves[stat].bonus)}`).join(', ');
  return { title: text('sheet.saves.name'), body: text('sheet.saves.description'), detail: [text('sheet.saves.detail', { list: trained })] };
}
