import { Container, Graphics, Sprite } from 'pixi.js';
import { STAT_NAMES } from '../world';
import type { InventoryItem } from '../world';
import { lazyTexture } from '../assets/LazyArt';
import { itemIcon, statShort } from '../entities/Items';
import { text } from '../core/texts';
import { formatDice, formatModifier } from '../rules/Dice';
import { armorRule, magicBonus, weaponRule } from '../rules/Equipment';
import type { ArmorRule } from '../rules/ArmorTable';
import { armorProficient, weaponProficient } from '../rules/Classes';
import type { HeroClass } from '../rules/Classes';
import { armorCategoryName, armorName, damageTypeName, propertyName, rangeName, weaponCategoryName, weaponName } from '../rules/Names';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

/** Space inside the tooltip's frame, and between its picture and its lines of text. */
const PAD = 8;
const GAP = 6;
/** The item's picture is drawn this big (it keeps its shape). */
const PICTURE = 64;
const LINE_H = 11;
const HEADER_H = 15;
/** The tooltip is never narrower than this. */
const MIN_W = 150;
/** The tooltip sits this far from the pointer. */
const OFFSET = 10;
const BG_ALPHA = 0.94;
/** Gear the hero is not trained in is flagged in this colour. */
const UNTRAINED_COLOR = 0xff7060;

type Line = { text: string; color: number };

/** A weapon's rules: its damage dice (and two-handed dice), its magic, its properties, and what sort it is. */
function weaponLines(item: InventoryItem): Line[] {
  const found = weaponRule(item);
  if (!found) return [];
  const { base, rule } = found;
  const lines: Line[] = [{ text: text('item.tooltip.damage', { dice: formatDice(rule.damage), type: damageTypeName(rule.type) }), color: THEME.damage }];
  if (rule.versatile) lines.push({ text: text('item.tooltip.versatile', { dice: formatDice(rule.versatile) }), color: THEME.damage });
  const magic = magicBonus(item);
  if (magic) lines.push({ text: text('item.tooltip.magic_weapon', { bonus: formatModifier(magic) }), color: THEME.title });
  if (rule.properties.length) lines.push({ text: rule.properties.map(propertyName).join(', '), color: THEME.muted });
  lines.push({ text: text('item.tooltip.weapon_kind', { base: weaponName(base), category: weaponCategoryName(rule.category), range: rangeName(rule.range) }), color: THEME.muted });
  return lines;
}

/** How armour sets Armor Class: its base, plus DEX (all, at most +2, or none); a shield simply adds. */
function armorClassLine(rule: ArmorRule): string {
  if (rule.category === 'shield') return text('item.tooltip.shield_ac', { ac: rule.ac });
  if (rule.category === 'heavy') return text('item.tooltip.armor_ac', { ac: rule.ac });
  if (rule.dexCap === null) return text('item.tooltip.armor_ac_dex', { ac: rule.ac });
  return text('item.tooltip.armor_ac_dex_max', { ac: rule.ac, cap: rule.dexCap });
}

/** Armour's or a shield's rules: the AC it gives, its magic, the STR it needs, whether it is noisy, and what sort it is. */
function armorLines(item: InventoryItem): Line[] {
  const found = armorRule(item);
  if (!found) return [];
  const { base, rule } = found;
  const lines: Line[] = [{ text: armorClassLine(rule), color: THEME.armorClass }];
  const magic = magicBonus(item);
  if (magic) lines.push({ text: text('item.tooltip.magic_armor', { bonus: formatModifier(magic) }), color: THEME.title });
  if (rule.strength) lines.push({ text: text('item.tooltip.strength_needed', { score: rule.strength }), color: THEME.muted });
  if (rule.stealthDisadvantage) lines.push({ text: text('item.tooltip.stealth'), color: THEME.muted });
  lines.push({ text: text('item.tooltip.armor_kind', { base: armorName(base), category: armorCategoryName(rule.category) }), color: THEME.muted });
  return lines;
}

/** Untrained gear is called out: armour gives disadvantage on attacks, a weapon loses the proficiency bonus. */
function trainingLine(item: InventoryItem, cls: HeroClass | undefined): Line | null {
  if (!cls) return null;
  const weapon = weaponRule(item);
  if (weapon && !weaponProficient(cls, weapon.base)) return { text: text('item.tooltip.untrained_weapon'), color: UNTRAINED_COLOR };
  const armor = armorRule(item);
  if (armor && !armorProficient(cls, armor.rule.category)) return { text: text('item.tooltip.untrained_armor'), color: UNTRAINED_COLOR };
  return null;
}

/**
 * The lines under the header: the item's rules (and a warning when `cls` is not trained in it), each stat it
 * adds, how much it weighs and is worth, and what kind of thing it is.
 */
function detailLines(item: InventoryItem, cls: HeroClass | undefined): Line[] {
  const s = item.stats;
  const rules = [...weaponLines(item), ...armorLines(item)];
  const lines = rules.slice(0, -1);
  const untrained = trainingLine(item, cls);
  if (untrained) lines.push(untrained);
  if (s) lines.push(...STAT_NAMES.flatMap((stat) => (s[stat] ? [{ text: text('item.tooltip.stat_bonus', { amount: s[stat] ?? 0, stat: statShort(stat) }), color: 0x8fd18f }] : [])));
  if (item.weight !== undefined) lines.push({ text: text('item.tooltip.weight', { kg: item.weight }), color: THEME.text });
  lines.push({ text: text('item.tooltip.value', { gold: item.value }), color: 0xffcc00 });
  lines.push(rules.at(-1) ?? { text: item.kind ?? item.type, color: THEME.muted });
  return lines;
}

/**
 * A tooltip for any item: its name as the header, its picture, and its stats underneath. Show it over an
 * item under the pointer; it keeps itself inside the area it is given.
 */
export class ItemTooltip {
  readonly view = new Container();
  private readonly frame = new Graphics();
  private readonly picture = new Sprite();
  private readonly header = new PixelLabel('', { color: THEME.title, shadow: true });
  private readonly lines = new Container();
  private shown: InventoryItem | null = null;

  constructor() {
    this.view.visible = false;
    this.view.eventMode = 'none';
    this.picture.anchor.set(0.5);
    this.view.addChild(this.frame, this.picture, this.header, this.lines);
  }

  /** Shows `item` near (x, y), kept inside a `bounds`-sized area starting at 0, 0. */
  show(item: InventoryItem, x: number, y: number, bounds: { w: number; h: number }, cls?: HeroClass): void {
    if (this.shown !== item) this.layout(item, cls);
    this.shown = item;
    const w = this.frame.width;
    const h = this.frame.height;
    this.view.x = Math.round(Math.min(x + OFFSET, bounds.w - w));
    this.view.y = Math.round(Math.max(0, Math.min(y + OFFSET, bounds.h - h)));
    this.view.visible = true;
  }

  hide(): void {
    this.view.visible = false;
    this.shown = null;
  }

  /** Lays the tooltip out for an item: header across the top, picture on the left, details beside it. */
  private layout(item: InventoryItem, cls: HeroClass | undefined): void {
    this.header.text = item.name;
    this.header.position.set(PAD, PAD);
    const texture = lazyTexture(itemIcon(item));
    this.picture.texture = texture;
    this.picture.scale.set(Math.min(PICTURE / Math.max(1, texture.width), PICTURE / Math.max(1, texture.height)));
    this.picture.position.set(PAD + PICTURE / 2, PAD + HEADER_H + PICTURE / 2);
    for (const child of this.lines.removeChildren()) child.destroy();
    const details = detailLines(item, cls);
    details.forEach((line, i) => {
      const label = new PixelLabel(line.text, { color: line.color, shadow: true });
      label.position.set(PAD + PICTURE + GAP, PAD + HEADER_H + i * LINE_H);
      this.lines.addChild(label);
    });
    const textW = Math.max(MIN_W, this.header.textWidth, PICTURE + GAP + Math.max(0, ...this.lines.children.map((c) => c.width)));
    const bodyH = Math.max(PICTURE, details.length * LINE_H);
    this.frame.clear()
      .rect(0, 0, textW + 2 * PAD, PAD * 2 + HEADER_H + bodyH).fill({ color: THEME.panel, alpha: BG_ALPHA })
      .stroke({ color: THEME.panelBorder, width: 1, alignment: 1 });
  }

  /** Forgets the laid-out item, so the next show lays it out again (its picture may have loaded since). */
  invalidate(): void {
    this.shown = null;
  }
}
