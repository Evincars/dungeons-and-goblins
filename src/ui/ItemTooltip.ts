import { Container, Graphics, Sprite } from 'pixi.js';
import { STAT_NAMES } from '../world';
import type { InventoryItem } from '../world';
import { lazyTexture } from '../assets/LazyArt';
import { itemIcon, statShort } from '../entities/Items';
import { text } from '../core/texts';
import { formatDice, formatModifier } from '../rules/Dice';
import { armorRule, magicBonus, weaponRule } from '../rules/Equipment';
import type { ArmorRule } from '../rules/ArmorTable';
import { itemTrained } from '../rules/Classes';
import type { ArmorTraining, HeroClass } from '../rules/Classes';
import { compareItems } from '../game/ItemCompare';
import type { Measure, Verdict } from '../game/ItemCompare';
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
/** The letters of the name a search matched (core/fuzzy.ts) stand out in this colour. */
const MATCH_COLOR = 0x8fe3ff;
/**
 * In a comparison, a triangle after a line says whether this item beats the other on it: green and pointing up when
 * better, red and pointing down when worse; this big, this far after the line's text.
 */
const ARROW_W = 7;
const ARROW_H = 5;
const ARROW_GAP = 4;
const BETTER_COLOR = 0x5ee06a;
const WORSE_COLOR = 0xff4a3a;

/** A line of the tooltip; `measure`: what a comparison can mark on it (ItemCompare.ts). */
type Line = { text: string; color: number; measure?: Measure };

/** What the tooltip is told besides the item: about the hero, a search, and another item it is compared with. */
export type TooltipContext = {
  /** The hero's class and STR score: gear they are not trained in, or too weak to wear, is flagged. */
  cls?: HeroClass;
  strength?: number;
  /** Armour training the hero's feats give on top of their class's. */
  featArmor?: readonly ArmorTraining[];
  /** The letters of the name a search matched. */
  matched?: readonly number[];
  /** The item this one is compared with: arrows mark where this one is better or worse. */
  against?: InventoryItem;
};

/** A weapon's rules: its damage dice (and two-handed dice), its magic, its properties, and what sort it is. */
function weaponLines(item: InventoryItem): Line[] {
  const found = weaponRule(item);
  if (!found) return [];
  const { base, rule } = found;
  const lines: Line[] = [{ text: text('item.tooltip.damage', { dice: formatDice(rule.damage), type: damageTypeName(rule.type) }), color: THEME.damage, measure: 'damage' }];
  if (rule.versatile) lines.push({ text: text('item.tooltip.versatile', { dice: formatDice(rule.versatile) }), color: THEME.damage });
  const magic = magicBonus(item);
  if (magic) lines.push({ text: text('item.tooltip.magic_weapon', { bonus: formatModifier(magic) }), color: THEME.title });
  if (rule.properties.length) lines.push({ text: rule.properties.map(propertyName).join(', '), color: THEME.muted });
  if (rule.distance) lines.push({ text: text('item.tooltip.distance', { normal: rule.distance[0], long: rule.distance[1] }), color: THEME.muted });
  lines.push({ text: text('item.tooltip.weapon_kind', { base: weaponName(base), category: weaponCategoryName(rule.category), range: rangeName(rule.range) }), color: THEME.muted });
  return lines;
}

/** How armour sets Armor Class: its base, plus DEX (all, at most +2, or none); a shield simply adds. */
function armorClassLine(rule: ArmorRule): string {
  if (rule.category === 'shield') return text('item.tooltip.shield_ac', { ac: rule.ac });
  if (rule.dexCap === 0) return text('item.tooltip.armor_ac', { ac: rule.ac });
  if (rule.dexCap === null) return text('item.tooltip.armor_ac_dex', { ac: rule.ac });
  return text('item.tooltip.armor_ac_dex_max', { ac: rule.ac, cap: rule.dexCap });
}

/**
 * Armour's or a shield's rules: the AC it gives, its magic, the STR it needs (flagged when the hero, of STR `strength`,
 * lacks it and so cannot put it on), whether it is noisy, and what sort it is.
 */
function armorLines(item: InventoryItem, strength: number | undefined): Line[] {
  const found = armorRule(item);
  if (!found) return [];
  const { base, rule } = found;
  const lines: Line[] = [{ text: armorClassLine(rule), color: THEME.armorClass, measure: 'ac' }];
  const magic = magicBonus(item);
  if (magic) lines.push({ text: text('item.tooltip.magic_armor', { bonus: formatModifier(magic) }), color: THEME.title });
  const weak = rule.strength !== null && strength !== undefined && strength < rule.strength;
  if (rule.strength) lines.push({ text: text(weak ? 'item.tooltip.too_weak' : 'item.tooltip.strength_needed', { score: rule.strength }), color: weak ? UNTRAINED_COLOR : THEME.muted });
  if (rule.stealthDisadvantage) lines.push({ text: text('item.tooltip.stealth'), color: THEME.muted });
  lines.push({ text: text('item.tooltip.armor_kind', { base: armorName(base), category: armorCategoryName(rule.category) }), color: THEME.muted });
  return lines;
}

/**
 * Untrained gear is called out: armour gives disadvantage on attacks, a weapon loses the proficiency bonus. `featArmor`:
 * the armour training the hero's feats give on top of their class's.
 */
function trainingLine(item: InventoryItem, cls: HeroClass | undefined, featArmor: readonly ArmorTraining[]): Line | null {
  if (!cls || itemTrained(cls, item, featArmor)) return null;
  return { text: text(weaponRule(item) ? 'item.tooltip.untrained_weapon' : 'item.tooltip.untrained_armor'), color: UNTRAINED_COLOR };
}

/**
 * The lines under the header: the item's rules (and a warning when `cls` is not trained in it), each stat it
 * adds, how much it weighs and is worth, and what kind of thing it is.
 */
function detailLines(item: InventoryItem, cls: HeroClass | undefined, strength: number | undefined, featArmor: readonly ArmorTraining[]): Line[] {
  const s = item.stats;
  const rules = [...weaponLines(item), ...armorLines(item, strength)];
  const lines = rules.slice(0, -1);
  const untrained = trainingLine(item, cls, featArmor);
  if (untrained) lines.push(untrained);
  if (s) lines.push(...STAT_NAMES.flatMap((stat) => (s[stat] ? [{ text: text('item.tooltip.stat_bonus', { amount: s[stat] ?? 0, stat: statShort(stat) }), color: 0x8fd18f }] : [])));
  if (item.weight !== undefined) lines.push({ text: text('item.tooltip.weight', { kg: item.weight }), color: THEME.text, measure: 'weight' });
  lines.push({ text: text('item.tooltip.value', { gold: item.value }), color: 0xffcc00 });
  lines.push(rules.at(-1) ?? { text: item.kind ?? item.type, color: THEME.muted });
  return lines;
}

/** A label's width stops at its last letter's ink: the next run starts this one gap further on, as letters do. */
const LETTER_GAP = 1;

/** A name cut into runs of letters that were matched and that were not. */
function runs(name: string, matched: ReadonlySet<number>): Array<{ text: string; matched: boolean }> {
  const out: Array<{ text: string; matched: boolean }> = [];
  for (let i = 0; i < name.length; i++) {
    const hit = matched.has(i);
    const last = out.at(-1);
    if (last && last.matched === hit) last.text += name[i];
    else out.push({ text: name[i], matched: hit });
  }
  return out;
}

/** The triangle after a compared line: up and green for better, down and red for worse. */
function drawArrow(g: Graphics, x: number, y: number, verdict: Verdict): void {
  if (verdict === 0) return;
  const better = verdict > 0;
  const tip = better ? y : y + ARROW_H;
  const base = better ? y + ARROW_H : y;
  g.poly([x, base, x + ARROW_W, base, x + ARROW_W / 2, tip]).fill({ color: better ? BETTER_COLOR : WORSE_COLOR });
}

/**
 * A tooltip for any item: its name as the header, its picture, and its stats underneath. Show it over an
 * item under the pointer; it keeps itself inside the area it is given. Given the hero's class and STR score, it
 * flags gear they are not trained in or not strong enough to wear; compared with another item, it marks where it is
 * better or worse.
 */
export class ItemTooltip {
  /** How far from the point it is shown at it sits (down and to the right, off the pointer). */
  static readonly OFFSET = OFFSET;
  readonly view = new Container();
  private readonly frame = new Graphics();
  private readonly picture = new Sprite();
  /** The name, in runs of plain and matched letters. */
  private readonly header = new Container();
  private headerW = 0;
  private readonly lines = new Container();
  private readonly arrows = new Graphics();
  private shown: InventoryItem | null = null;
  /** The letters of the name a search matched, and the item compared with, as last laid out. */
  private matched = '';
  private against: InventoryItem | undefined = undefined;

  constructor() {
    this.view.visible = false;
    this.view.eventMode = 'none';
    this.picture.anchor.set(0.5);
    this.view.addChild(this.frame, this.picture, this.header, this.lines, this.arrows);
  }

  /** Shows `item` near (x, y), kept inside a `bounds`-sized area starting at 0, 0. */
  show(item: InventoryItem, x: number, y: number, bounds: { w: number; h: number }, about: TooltipContext = {}): void {
    const key = (about.matched ?? []).join();
    if (this.shown !== item || this.matched !== key || this.against !== about.against) this.layout(item, about);
    this.matched = key;
    this.against = about.against;
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

  /** Lays the tooltip out for an item: header across the top, picture on the left, details beside it (compared lines marked). */
  private layout(item: InventoryItem, about: TooltipContext): void {
    this.setHeader(item.name, about.matched ?? []);
    this.header.position.set(PAD, PAD);
    const texture = lazyTexture(itemIcon(item));
    this.picture.texture = texture;
    this.picture.scale.set(Math.min(PICTURE / Math.max(1, texture.width), PICTURE / Math.max(1, texture.height)));
    this.picture.position.set(PAD + PICTURE / 2, PAD + HEADER_H + PICTURE / 2);
    for (const child of this.lines.removeChildren()) child.destroy();
    this.arrows.clear();
    const details = detailLines(item, about.cls, about.strength, about.featArmor ?? []);
    const verdicts = about.against ? compareItems(item, about.against) : {};
    let widest = 0;
    details.forEach((line, i) => {
      const label = new PixelLabel(line.text, { color: line.color, shadow: true });
      label.position.set(PAD + PICTURE + GAP, PAD + HEADER_H + i * LINE_H);
      this.lines.addChild(label);
      const verdict = line.measure ? verdicts[line.measure] : undefined;
      const marked = verdict !== undefined && verdict !== 0;
      if (marked) drawArrow(this.arrows, label.x + label.textWidth + ARROW_GAP, label.y + 1, verdict);
      widest = Math.max(widest, label.textWidth + (marked ? ARROW_GAP + ARROW_W : 0));
    });
    const textW = Math.max(MIN_W, this.headerW, PICTURE + GAP + widest);
    const bodyH = Math.max(PICTURE, details.length * LINE_H);
    this.frame.clear()
      .rect(0, 0, textW + 2 * PAD, PAD * 2 + HEADER_H + bodyH).fill({ color: THEME.panel, alpha: BG_ALPHA })
      .stroke({ color: THEME.panelBorder, width: 1, alignment: 1 });
  }

  /** The name across the top: runs of letters, those a search matched in their own colour. */
  private setHeader(name: string, matched: readonly number[]): void {
    for (const child of this.header.removeChildren()) child.destroy();
    let x = 0;
    for (const run of runs(name, new Set(matched))) {
      const label = new PixelLabel(run.text, { color: run.matched ? MATCH_COLOR : THEME.title, shadow: true });
      label.x = x;
      this.header.addChild(label);
      x += label.textWidth + LETTER_GAP;
    }
    this.headerW = Math.max(0, x - LETTER_GAP);
  }

  /** Forgets the laid-out item, so the next show lays it out again (its picture may have loaded since). */
  invalidate(): void {
    this.shown = null;
  }
}
