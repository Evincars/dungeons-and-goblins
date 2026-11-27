import { Container, Graphics, Sprite } from 'pixi.js';
import type { Texture } from 'pixi.js';
import { STAT_NAMES } from '../world';
import type { InventoryItem, StatName } from '../world';
import { lazyTexture } from '../assets/LazyArt';
import { itemIcon, statShort } from '../entities/Items';
import { text } from '../core/texts';
import { formatModifier } from '../rules/Dice';
import type { Dice } from '../rules/Dice';
import { armorRule, magicBonus, weaponRule } from '../rules/Equipment';
import type { ArmorRule } from '../rules/ArmorTable';
import type { WeaponRule } from '../rules/WeaponTable';
import { itemTrained } from '../rules/Classes';
import type { ArmorTraining, HeroClass } from '../rules/Classes';
import { weaponActions } from '../rules/WeaponActions';
import { RARITY_COLORS, isMagicItem, rarityOf } from '../rules/Rarity';
import { compareItems } from '../game/ItemCompare';
import type { Measure, Verdict } from '../game/ItemCompare';
import { armorCategoryName, armorName, damageTypeName, propertyName, weaponName } from '../rules/Names';
import { DAMAGE_COLORS } from './TipText';
import { ACTION_LOOKS, DAMAGE_GLYPHS, diceTexture, glyphTexture, weaponGlyph } from './ItemIcons';
import type { Glyph } from './ItemIcons';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

/**
 * An item's tooltip, laid out as Baldur's Gate lays its own:
 * - its name in its rarity's colour (rules/Rarity.ts; a search's matched letters lit), what it is under it ("Uncommon Magic
 *   Weapon"), its picture in the top right corner;
 * - a weapon's damage as a range in large figures ("4~11 Damage", with the hero's ability and the magic added), its dice
 *   beside the dice ("1d8+3 Slashing") and a weapon's damage of another kind under them ("+1d4 Fire", in its colour); armour's
 *   Armor Class in large figures and how it is made up;
 * - its enchantment ("Weapon Enchantment +1") and what its damage of another kind makes it ("Ever-burning");
 * - a weapon's "Proficiency unlocks": the icons of the weapon actions it unlocks (rules/WeaponActions.ts; placeholders until
 *   their art is made), lit for a hero trained in it, greyed for one who is not; its warnings (untrained, too weak) and the
 *   abilities it adds;
 * - who wears it, and the spells on it now (Magic Weapon, Shadow Blade);
 * - at its foot its sort and properties (two-handed in yellow, as Baldur's Gate marks what binds both hands), its range, and
 *   on the right its weight and price.
 * Compared with another item (`against`), arrows beside the damage or Armor Class and the weight say which is better.
 */

/** The tooltip's inner width, the space inside its frame, and a line's height. */
const WIDTH = 214;
const PAD = 8;
const LINE_H = 10;
const TITLE_H = 12;
/** The picture in the top right corner, as large as this (it keeps its shape), and the room kept for it. */
const PICTURE = 44;
/** The big figure is drawn twice the size. */
const HEADLINE_SCALE = 2;
const HEADLINE_H = 18;
/** Glyphs are 9 px; the dice 16 × 14; a line's text starts this far right of its glyph. */
const GLYPH = 9;
const GLYPH_GAP = 4;
const DICE_W = 16;
/** A weapon action's placeholder icon: a tile this big, this far from the next; its mark drawn twice the size. */
const ACTION_ICON = 22;
const ACTION_GAP = 4;
const ACTION_MARK_SCALE = 2;
const ACTION_FACE = 0x1a1414;
/** The space either side of a rule between sections. */
const RULE_GAP = 5;
/** The tooltip sits this far from the pointer. */
const OFFSET = 10;
/** The frame: a dark face, a steel rim, a gold line on top, thin rules between its parts (as ui/InfoTooltip.ts). */
const FACE = 0x0d0f14;
const BG_ALPHA = 0.96;
const TOP_LINE = 0x8a7442;
const RULE = 0x2a303a;
/** Untrained gear and a weak hero are flagged in this colour; two-handed is marked in yellow, as Baldur's Gate does. */
const UNTRAINED_COLOR = 0xff7060;
const TWO_HANDED_COLOR = 0xf0dc8a;
const STAT_COLOR = 0x8fd18f;
const GOLD_COLOR = 0xffcc00;
const ENCHANT_COLOR = 0xd8c48a;
const UNLOCKED_ALPHA = 1;
const LOCKED_ALPHA = 0.5;
const LOCKED_TINT = 0x6a6a70;
/** The letters of the name a search matched (core/fuzzy.ts) stand out in this colour. */
export const MATCH_COLOR = 0x8fe3ff;
/**
 * In a comparison, a triangle after a figure says whether this item beats the other on it: green and pointing up when
 * better, red and pointing down when worse; this big, this far after the figure.
 */
const ARROW_W = 7;
const ARROW_H = 5;
const ARROW_GAP = 4;
const BETTER_COLOR = 0x5ee06a;
const WORSE_COLOR = 0xff4a3a;
/** A label's width stops at its last letter's ink: the next run starts this one gap further on, as letters do. */
const LETTER_GAP = 1;

/** What the tooltip is told besides the item: about the hero, a search, and another item it is compared with. */
export type TooltipContext = {
  /** The hero's class and STR score: gear they are not trained in, or too weak to wear, is flagged. */
  cls?: HeroClass;
  strength?: number;
  /** The hero's ability modifiers: a weapon's damage is told with the ability it strikes with added. */
  modifiers?: Readonly<Record<StatName, number>>;
  /** Armour training the hero's feats give on top of their class's. */
  featArmor?: readonly ArmorTraining[];
  /** Weapons the hero's feats train them in (Weapon Master). */
  featWeapons?: readonly string[];
  /** The letters of the name a search matched. */
  matched?: readonly number[];
  /** The item this one is compared with: arrows mark where this one is better or worse. */
  against?: InventoryItem;
  /** Who wears it (it is worn), and the spells on it now ("Magic Weapon"). */
  wearer?: string;
  enchantments?: readonly string[];
};

/** The triangle after a compared figure: up and green for better, down and red for worse. */
function drawArrow(g: Graphics, x: number, y: number, verdict: Verdict): void {
  if (verdict === 0) return;
  const better = verdict > 0;
  const tip = better ? y : y + ARROW_H;
  const base = better ? y + ARROW_H : y;
  g.poly([x, base, x + ARROW_W, base, x + ARROW_W / 2, tip]).fill({ color: better ? BETTER_COLOR : WORSE_COLOR });
}

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

/** The ability a weapon strikes with for this hero: DEX for a ranged one, the better of STR and DEX for finesse, else STR. */
function abilityModifier(rule: WeaponRule, modifiers: Readonly<Record<StatName, number>> | undefined): number {
  if (!modifiers) return 0;
  if (rule.properties.includes('finesse')) return Math.max(modifiers.strength, modifiers.dexterity);
  return rule.range === 'ranged' ? modifiers.dexterity : modifiers.strength;
}

/** "1d8+3": dice and what is added to them. */
function diceText(dice: Pick<Dice, 'count' | 'sides'>, add: number): string {
  return `${dice.count}d${dice.sides}${add ? formatModifier(add) : ''}`;
}

/** The kind of item, under its name: "Uncommon Magic Weapon", "Common Armour", "Rare Shield". */
function subtitleOf(item: InventoryItem): string {
  const rarity = text(`item.rarity.${rarityOf(item)}`);
  const magic = isMagicItem(item);
  const sort = weaponRule(item) ? 'weapon' : armorRule(item)?.rule.category === 'shield' ? 'shield' : item.gear === 'head' ? 'head' : armorRule(item) ? 'armor' : 'other';
  return text(magic ? `item.sort.magic_${sort}` : `item.sort.${sort}`, { rarity });
}

/** How armour sets Armor Class: its base, plus DEX (all, at most +2, or none); a shield simply adds. */
function armorClassLine(rule: ArmorRule): string {
  if (rule.category === 'shield') return text('item.tooltip.shield_ac', { ac: rule.ac });
  if (rule.dexCap === 0) return text('item.tooltip.armor_ac', { ac: rule.ac });
  if (rule.dexCap === null) return text('item.tooltip.armor_ac_dex', { ac: rule.ac });
  return text('item.tooltip.armor_ac_dex_max', { ac: rule.ac, cap: rule.dexCap });
}

/**
 * An item tooltip under the pointer, kept inside the area it is given. Given the hero's class and abilities, it tells the
 * damage they would deal with a weapon and flags gear they are not trained in or not strong enough to wear; compared with
 * another item, it marks where it is better or worse.
 */
export class ItemTooltip {
  /** How far from the point it is shown at it sits (down and to the right, off the pointer). */
  static readonly OFFSET = OFFSET;
  readonly view = new Container();
  private readonly frame = new Graphics();
  private readonly body = new Container();
  private readonly marks = new Graphics();
  private shown: InventoryItem | null = null;
  /** What the last layout was made from (a change lays it out again). */
  private key = '';
  /** Where the next part goes down the tooltip, as it is laid out. */
  private y = 0;

  constructor() {
    this.view.visible = false;
    this.view.eventMode = 'none';
    this.view.addChild(this.frame, this.body, this.marks);
  }

  /** Shows `item` near (x, y), kept inside a `bounds`-sized area starting at 0, 0. */
  show(item: InventoryItem, x: number, y: number, bounds: { w: number; h: number }, about: TooltipContext = {}): void {
    const key = [(about.matched ?? []).join(), about.wearer ?? '', (about.enchantments ?? []).join(), about.strength ?? ''].join('|');
    if (this.shown !== item || this.key !== key || this.against !== about.against) this.layout(item, about);
    this.key = key;
    this.against = about.against;
    this.shown = item;
    const w = this.frame.width;
    const h = this.frame.height;
    this.view.x = Math.round(Math.max(0, Math.min(x + OFFSET, bounds.w - w)));
    this.view.y = Math.round(Math.max(0, Math.min(y + OFFSET, bounds.h - h)));
    this.view.visible = true;
  }

  private against: InventoryItem | undefined = undefined;

  hide(): void {
    this.view.visible = false;
    this.shown = null;
  }

  /** Forgets the laid-out item, so the next show lays it out again (its picture may have loaded since). */
  invalidate(): void {
    this.shown = null;
  }

  // ── Laying it out ───────────────────────────────────────────────────────────

  private layout(item: InventoryItem, about: TooltipContext): void {
    for (const child of this.body.removeChildren()) child.destroy({ children: true });
    this.marks.clear();
    const rules: number[] = [];
    const verdicts = about.against ? compareItems(item, about.against) : {};
    this.y = PAD;
    this.top(item, about, verdicts);
    rules.push(this.rule());
    if (this.enchantment(item)) rules.push(this.rule());
    if (this.unlocks(item, about)) rules.push(this.rule());
    if (this.notes(item, about)) rules.push(this.rule());
    if (this.wearer(about)) rules.push(this.rule());
    this.foot(item, verdicts);
    const h = this.y + PAD;
    const w = WIDTH + 2 * PAD;
    this.frame.clear().rect(0, 0, w, h).fill({ color: FACE, alpha: BG_ALPHA }).stroke({ color: THEME.panelBorder, width: 1, alignment: 1 })
      .rect(0, 0, w, 1).fill({ color: TOP_LINE });
    for (const at of rules) this.frame.rect(PAD, at, WIDTH, 1).fill({ color: RULE });
  }

  /** A rule under what was laid out so far; returns its y. */
  private rule(): number {
    const at = this.y + RULE_GAP - 2;
    this.y = at + 1 + RULE_GAP;
    return at;
  }

  private label(content: string, color: number, x: number, y: number, scale = 1): PixelLabel {
    const label = new PixelLabel(content, { color, shadow: true, scale });
    label.position.set(Math.round(x), Math.round(y));
    this.body.addChild(label);
    return label;
  }

  private glyph(glyph: Glyph, color: number, x: number, y: number, scale = 1): Sprite {
    return this.sprite(glyphTexture(glyph), color, x, y, scale);
  }

  private sprite(texture: Texture, tint: number, x: number, y: number, scale = 1): Sprite {
    const sprite = new Sprite(texture);
    sprite.tint = tint;
    sprite.scale.set(scale);
    sprite.position.set(Math.round(x), Math.round(y));
    this.body.addChild(sprite);
    return sprite;
  }

  /** The name, what it is, the picture, and the big figure with its dice or how its Armor Class is made up. */
  private top(item: InventoryItem, about: TooltipContext, verdicts: Partial<Record<Measure, Verdict>>): void {
    const picture = new Sprite(lazyTexture(itemIcon(item)));
    const fit = Math.min(PICTURE / Math.max(1, picture.texture.width), PICTURE / Math.max(1, picture.texture.height));
    picture.scale.set(fit);
    picture.anchor.set(0.5);
    picture.position.set(PAD + WIDTH - PICTURE / 2, PAD + PICTURE / 2);
    this.body.addChild(picture);
    this.name(item.name, about.matched ?? [], RARITY_COLORS[rarityOf(item)]);
    this.y += TITLE_H;
    this.label(subtitleOf(item), THEME.muted, PAD, this.y);
    this.y += LINE_H + 2;
    const weapon = weaponRule(item);
    if (weapon) this.weaponFigures(item, weapon.rule, about, verdicts.damage);
    const armor = armorRule(item);
    if (armor) this.armorFigures(item, armor.rule, verdicts.ac);
    this.y = Math.max(this.y, PAD + PICTURE);
  }

  /** The name across the top: runs of letters, those a search matched in their own colour. */
  private name(name: string, matched: readonly number[], color: number): void {
    let x = PAD;
    for (const run of runs(name, new Set(matched))) {
      const label = this.label(run.text, run.matched ? MATCH_COLOR : color, x, this.y);
      x += label.textWidth + LETTER_GAP;
    }
  }

  /** A weapon's damage: the range in large figures, its dice beside the dice, its damage of another kind, two hands' dice. */
  private weaponFigures(item: InventoryItem, rule: WeaponRule, about: TooltipContext, verdict: Verdict | undefined): void {
    const add = abilityModifier(rule, about.modifiers) + magicBonus(item);
    const extra = item.extraDamage;
    const min = Math.max(1, rule.damage.count + add) + (extra ? extra.count : 0);
    const max = Math.max(1, rule.damage.count * rule.damage.sides + add) + (extra ? extra.count * extra.sides : 0);
    const big = this.label(text('item.tip.damage_range', { min, max }), THEME.text, PAD, this.y, HEADLINE_SCALE);
    if (verdict !== undefined) drawArrow(this.marks, big.x + big.textWidth + ARROW_GAP, big.y + HEADLINE_H / 2 - ARROW_H, verdict);
    this.y += HEADLINE_H + 2;
    this.sprite(diceTexture(), 0xffffff, PAD, this.y);
    const x = PAD + DICE_W + GLYPH_GAP;
    this.damageLine(diceText(rule.damage, add), rule.type, x, THEME.text);
    if (extra) this.damageLine(`+${diceText(extra, 0)}`, extra.type, x, DAMAGE_COLORS[extra.type]);
    if (rule.versatile) {
      this.label(text('item.tooltip.versatile', { dice: diceText(rule.versatile, add) }), THEME.muted, x, this.y);
      this.y += LINE_H;
    }
  }

  /** One line of damage: its dice, the mark of its kind, and the kind in its colour. */
  private damageLine(dice: string, type: WeaponRule['type'] | NonNullable<InventoryItem['extraDamage']>['type'], x: number, diceColor: number): void {
    const label = this.label(dice, diceColor, x, this.y);
    const gx = label.x + label.textWidth + GLYPH_GAP;
    this.glyph(DAMAGE_GLYPHS[type], DAMAGE_COLORS[type], gx, this.y - 1);
    this.label(capitalised(damageTypeName(type)), DAMAGE_COLORS[type], gx + GLYPH + 2, this.y);
    this.y += LINE_H;
  }

  /** Armour's Armor Class in large figures (with its magic), and how it is made up. */
  private armorFigures(item: InventoryItem, rule: ArmorRule, verdict: Verdict | undefined): void {
    const ac = rule.ac + magicBonus(item);
    const key = rule.category === 'shield' ? 'item.tip.shield_class' : 'item.tip.armor_class';
    const big = this.label(text(key, { ac }), THEME.armorClass, PAD, this.y, HEADLINE_SCALE);
    if (verdict !== undefined) drawArrow(this.marks, big.x + big.textWidth + ARROW_GAP, big.y + HEADLINE_H / 2 - ARROW_H, verdict);
    this.y += HEADLINE_H + 2;
    this.label(armorClassLine(rule), THEME.muted, PAD, this.y);
    this.y += LINE_H;
  }

  /** Its enchantment and what its damage of another kind makes it; returns whether it has any. */
  private enchantment(item: InventoryItem): boolean {
    const bonus = magicBonus(item);
    const extra = item.extraDamage;
    if (!bonus && !extra) return false;
    if (bonus) {
      this.glyph('sparkle', ENCHANT_COLOR, PAD, this.y);
      const key = weaponRule(item) ? 'item.tip.weapon_enchantment' : 'item.tip.armor_enchantment';
      this.label(text(key, { bonus: formatModifier(bonus) }), THEME.text, PAD + GLYPH + GLYPH_GAP, this.y);
      this.y += LINE_H + 2;
    }
    if (extra) {
      this.glyph(DAMAGE_GLYPHS[extra.type], DAMAGE_COLORS[extra.type], PAD + GLYPH + GLYPH_GAP, this.y - 1);
      this.label(text(`item.extra.${extra.type}`), THEME.text, PAD + 2 * (GLYPH + GLYPH_GAP), this.y);
      this.y += LINE_H + 2;
    }
    return true;
  }

  /**
   * A weapon's "Proficiency unlocks": the placeholder icons of the actions it unlocks, lit for a hero trained in it (greyed
   * for one who is not), their names under them. Returns whether it shows any.
   */
  private unlocks(item: InventoryItem, about: TooltipContext): boolean {
    const weapon = weaponRule(item);
    const actions = weapon ? weaponActions(weapon.base) : [];
    if (!actions.length) return false;
    const trained = !about.cls || itemTrained(about.cls, item, about.featArmor ?? [], about.featWeapons ?? []);
    this.glyph('medal', THEME.title, PAD, this.y);
    this.label(text('item.tip.proficiency_unlocks'), THEME.text, PAD + GLYPH + GLYPH_GAP, this.y);
    this.y += LINE_H + 3;
    actions.forEach((action, i) => {
      const look = ACTION_LOOKS[action.effect];
      const x = PAD + i * (ACTION_ICON + ACTION_GAP);
      const tile = new Graphics().rect(x, this.y, ACTION_ICON, ACTION_ICON).fill({ color: ACTION_FACE })
        .stroke({ color: look.color, width: 1, alignment: 1 });
      tile.alpha = trained ? UNLOCKED_ALPHA : LOCKED_ALPHA;
      this.body.addChild(tile);
      // Locked (not trained in the weapon): greyed.
      const colour = trained ? look.color : LOCKED_TINT;
      const mark = this.glyph(look.glyph, colour, x + (ACTION_ICON - GLYPH * ACTION_MARK_SCALE) / 2, this.y + (ACTION_ICON - GLYPH * ACTION_MARK_SCALE) / 2, ACTION_MARK_SCALE);
      mark.alpha = tile.alpha;
    });
    this.y += ACTION_ICON + 3;
    this.label(actions.map((action) => action.name).join(', '), trained ? THEME.muted : UNTRAINED_COLOR, PAD, this.y);
    this.y += LINE_H;
    return true;
  }

  /** Warnings (untrained, too weak) and what it adds or asks for; returns whether there were any. */
  private notes(item: InventoryItem, about: TooltipContext): boolean {
    const lines: { text: string; color: number; warn?: true }[] = [];
    const untrained = about.cls && !itemTrained(about.cls, item, about.featArmor ?? [], about.featWeapons ?? []);
    if (untrained) lines.push({ text: text(weaponRule(item) ? 'item.tooltip.untrained_weapon' : 'item.tooltip.untrained_armor'), color: UNTRAINED_COLOR, warn: true });
    const armor = armorRule(item)?.rule;
    const weak = !!armor?.strength && about.strength !== undefined && about.strength < armor.strength;
    if (armor?.strength) lines.push({ text: text(weak ? 'item.tooltip.too_weak' : 'item.tooltip.strength_needed', { score: armor.strength }), color: weak ? UNTRAINED_COLOR : THEME.muted, ...(weak ? { warn: true as const } : {}) });
    if (armor?.stealthDisadvantage) lines.push({ text: text('item.tooltip.stealth'), color: THEME.muted });
    const s = item.stats;
    for (const stat of STAT_NAMES) if (s?.[stat]) lines.push({ text: text('item.tooltip.stat_bonus', { amount: s[stat] ?? 0, stat: statShort(stat) }), color: STAT_COLOR });
    for (const line of lines) {
      if (line.warn) this.glyph('warning', line.color, PAD, this.y);
      this.label(line.text, line.color, PAD + (line.warn ? GLYPH + GLYPH_GAP : 0), this.y);
      this.y += LINE_H;
    }
    return lines.length > 0;
  }

  /** Who wears it, and the spells on it now; returns whether it is worn. */
  private wearer(about: TooltipContext): boolean {
    if (!about.wearer) return false;
    this.glyph('person', THEME.muted, PAD, this.y);
    this.label(text('item.tip.equipped_by', { name: about.wearer }), THEME.muted, PAD + GLYPH + GLYPH_GAP, this.y);
    this.y += LINE_H + 2;
    for (const spell of about.enchantments ?? []) {
      this.glyph('sparkle', ENCHANT_COLOR, PAD + GLYPH + GLYPH_GAP, this.y);
      this.label(text('item.tip.spell_on', { name: spell }), THEME.text, PAD + 2 * (GLYPH + GLYPH_GAP), this.y);
      this.y += LINE_H + 2;
    }
    return true;
  }

  /** The foot: its sort and properties (two-handed in yellow), its range; on the right its weight and price. */
  private foot(item: InventoryItem, verdicts: Partial<Record<Measure, Verdict>>): void {
    const right = this.price(item, verdicts.weight);
    const words = this.footWords(item);
    let x = PAD;
    for (const word of words) {
      const w = (word.glyph ? GLYPH + 2 : 0) + measure(word.text);
      if (x > PAD && x + w > PAD + WIDTH - (this.y === right.y ? right.w + GLYPH_GAP : 0)) {
        x = PAD;
        this.y += LINE_H + 1;
      }
      if (word.glyph) this.glyph(word.glyph, word.color, x, this.y - 1);
      const label = this.label(word.text, word.color, x + (word.glyph ? GLYPH + 2 : 0), this.y);
      x = label.x + label.textWidth + 2 * GLYPH_GAP;
    }
    this.y += LINE_H;
  }

  /** The words at the foot: the sort (with its mark), each property, the range. */
  private footWords(item: InventoryItem): { text: string; color: number; glyph?: Glyph }[] {
    const weapon = weaponRule(item);
    if (weapon) {
      const { base, rule } = weapon;
      const props = rule.properties.map((p) => ({ text: propertyName(p), color: p === 'two_handed' ? TWO_HANDED_COLOR : THEME.muted }));
      const range = rule.distance ? [{ text: text('item.tooltip.distance', { normal: rule.distance[0], long: rule.distance[1] }), color: THEME.muted }] : [];
      return [{ text: weaponName(base), color: THEME.text, glyph: weaponGlyph(base) }, ...props, ...range];
    }
    const armor = armorRule(item);
    if (armor) {
      const glyph: Glyph = armor.rule.category === 'shield' ? 'shield' : item.gear === 'head' ? 'helmet' : 'armor';
      return [{ text: armorName(armor.base), color: THEME.text, glyph }, { text: armorCategoryName(armor.rule.category), color: THEME.muted }];
    }
    return [{ text: item.kind ?? item.type, color: THEME.muted }];
  }

  /** Weight and price at the foot's right (arrows beside the weight when compared); returns how wide they are and where. */
  private price(item: InventoryItem, verdict: Verdict | undefined): { w: number; y: number } {
    let x = PAD + WIDTH;
    x -= GLYPH;
    this.glyph('coin', GOLD_COLOR, x, this.y - 1);
    const gold = this.label(String(item.value), GOLD_COLOR, 0, this.y);
    x -= gold.textWidth + 2;
    gold.x = x;
    if (item.weight !== undefined) {
      x -= GLYPH + GLYPH_GAP + 2;
      this.glyph('weight', THEME.muted, x, this.y - 1);
      const kg = this.label(String(item.weight), THEME.text, 0, this.y);
      x -= kg.textWidth + 2;
      kg.x = x;
      if (verdict !== undefined && verdict !== 0) {
        x -= ARROW_W + ARROW_GAP;
        drawArrow(this.marks, x, this.y + 1, verdict);
      }
    }
    return { w: PAD + WIDTH - x, y: this.y };
  }
}

/** How wide a run of text is drawn (for the foot's wrapping). */
function measure(content: string): number {
  const probe = new PixelLabel(content);
  const w = probe.textWidth;
  probe.destroy();
  return w;
}

/** "Slashing": a name as a heading writes it. */
function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
