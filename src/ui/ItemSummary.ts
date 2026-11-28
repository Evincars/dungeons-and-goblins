import { STAT_NAMES } from '../world';
import type { InventoryItem } from '../world';
import { text } from '../core/texts';
import { formatDice, formatModifier } from '../rules/Dice';
import { armorRule, magicBonus, weaponRule } from '../rules/Equipment';
import { damageTypeName } from '../rules/Names';
import { statShort } from '../entities/Items';
import { THROWABLES, isThrowableId } from '../rules/Throwables';
import type { ThrowableDef } from '../rules/Throwables';
import { pxToFeet } from '../rules/Scale';

/**
 * An item in a line, for a list (the trade panel): a weapon's damage (and its magic, added to hit and to damage),
 * armour's Armor Class (and how much DEX adds), a shield's, or what else the item adds.
 */
export function itemSummary(item: InventoryItem): string {
  const summary = ruleSummary(item) ?? statSummary(item);
  const magic = magicBonus(item);
  return magic && summary ? text('shop.summary.magic', { summary, bonus: formatModifier(magic) }) : summary;
}

function ruleSummary(item: InventoryItem): string | null {
  if (item.type === 'consumable' && isThrowableId(item.kind)) return flaskSummary(THROWABLES[item.kind]);
  const weapon = weaponRule(item);
  if (weapon) return text('shop.summary.weapon', { dice: formatDice(weapon.rule.damage), type: damageTypeName(weapon.rule.type) });
  const armor = armorRule(item);
  if (!armor) return null;
  const { ac, category, dexCap } = armor.rule;
  if (category === 'shield') return text('item.tooltip.shield_ac', { ac });
  if (dexCap === 0) return text('item.tooltip.armor_ac', { ac });
  if (dexCap === null) return text('item.tooltip.armor_ac_dex', { ac });
  return text('item.tooltip.armor_ac_dex_max', { ac, cap: dexCap });
}

/** A potion's healing or a flask's splash, in a few words ("Heals 2d4+2", "1d4 Fire, 10 ft splash", "10 ft splash"). */
function flaskSummary(def: ThrowableDef): string {
  const radius = pxToFeet(def.radius);
  if (def.heal) return text('shop.summary.potion', { dice: formatDice(def.heal), radius });
  if (def.damage) return text('shop.summary.flask', { dice: formatDice(def.damage), type: damageTypeName(def.damageType), radius });
  return text('shop.summary.splash', { radius });
}

function statSummary(item: InventoryItem): string {
  const s = item.stats;
  if (!s) return '';
  return STAT_NAMES.flatMap((stat) => (s[stat] ? [text('shop.stat_bonus', { amount: s[stat] ?? 0, stat: statShort(stat) })] : [])).join('  ');
}
