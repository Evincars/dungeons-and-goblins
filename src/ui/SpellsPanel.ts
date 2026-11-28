import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Player } from '../world';
import { text } from '../core/texts';
import { heroClass } from '../rules/Classes';
import type { DndClass } from '../rules/Classes';
import { CATALOG, boundAtLevel, castLevels, isCaster, isCatalogSpell, learnLevel, listedSpells, roomSomewhere, spellIconKey, spellListOf } from '../rules/Spellbook';
import type { CatalogSpell, SpellList } from '../rules/Spellbook';
import type { Build } from '../rules/Build';
import { CLASS_FEATURE_LIST, featureBinding, featuresAt } from '../rules/ClassFeatures';
import { isWizardSchool, schoolOf } from '../rules/Archetypes';
import type { WizardSchool } from '../rules/Archetypes';
import { BIND_TOP_LEVEL, bindLimit, hasBindLimits } from '../rules/Schools';
import { bindKind } from '../game/SpellBinding';
import { wrapLines } from './InfoTooltip';
import type { FeatureDef } from '../rules/ClassFeatures';
import { beginBinding } from '../game/SpellBinding';
import { lazyTexture, requestArt } from '../assets/LazyArt';
import { reportRejection } from '../core/errors';
import { preparesSpells, requestToggleFeature } from '../game/PlayerActions';
import type { TipTopic } from './InfoTooltip';
import { PixelLabel } from './PixelText';
import { castLevelTopic, damageChoiceTopic, featTopic, featureTopic, spellTopic } from './SpellTopics';
import { archetypeName, featName } from '../rules/Names';
import { FEATS, featBinding, featSpellIds } from '../rules/Feats';
import type { FeatId } from '../rules/Feats';
import { passiveFeats } from '../rules/Build';
import { featureCharges } from '../systems/SchoolSystem';
import { THEME } from './Theme';
import { DAMAGE_COLORS } from './TipText';
import { damageChoices } from '../rules/DamageChoice';
import { DAMAGE_TYPES } from '../rules/DamageTypes';
import type { DamageType } from '../rules/DamageTypes';
import { damageTypeName } from '../rules/Names';
import { SPELL_VARIANTS, variantChoices } from '../rules/SpellVariants';
import type { SpellVariant } from '../rules/SpellVariants';
import { RING_COLOURS } from '../systems/ConditionRingSystem';

type Rect = { x: number; y: number; w: number; h: number };
/**
 * A box in the list (before scrolling): a spell, a class feature or a Passive Feat; `locked` (greyed out) until the hero's
 * level reaches it. `taught`: a spell a feat taught, bound at its own level.
 */
type Box = { spell: CatalogSpell | null; feature: FeatureDef | null; feat: FeatId | null; locked: boolean; taught: boolean; rect: Rectangle };
/** What a section lists: a spell, a feature or a feat, greyed out while locked. */
type Item = { spell?: CatalogSpell; feature?: FeatureDef; feat?: FeatId; locked?: boolean; taught?: boolean };
/** A wizard's bind counter at the top right: the spell level it counts (0: cantrips) and its line. */
type Counter = { level: number; label: PixelLabel };
/** The count of charges left on a feature used by charges (Bladesong), in its box's top right corner. */
type ChargeTag = { feature: FeatureDef; label: PixelLabel };
/** One level a clicked spell can be cast at, or one kind of damage it can deal (Chromatic Orb), as a box. */
type Option = { level: number; damageType?: DamageType; variant?: SpellVariant; rect: Rectangle };
/**
 * The boxes that open under a clicked spell: one per kind of damage when its caster picks one (rules/DamageChoice.ts), then
 * one per level it can be cast at; `damageType`: the kind already picked, which the level boxes bind it with.
 */
type Choice = { spell: CatalogSpell; options: Option[]; box: Box; damageType?: DamageType; variant?: SpellVariant };

/** A spell's box and the gap between boxes; space round the list; the height of a heading and the space after a section. */
const BOX = 20;
const GAP = 3;
const PAD = 6;
const HEADING_H = 11;
const SECTION_GAP = 6;
/** A spell's icon sits this far inside its box's edge. */
const ICON_INSET = 1;
/** Scrolling: design pixels moved per unit of wheel delta (a notch is about 100 units). */
const WHEEL_STEP = 0.3;
const BOX_FILL_ALPHA = 0.35;
const BOX_EDGE = 0xb4a488;
const BOX_EDGE_ALPHA = 0.55;
const CHOICE_FILL_ALPHA = 0.94;
/** A kind of damage's box is tinted this strongly in its colour, and named by this many letters of it ("ACI"). */
const TYPE_TINT_ALPHA = 0.22;
const TYPE_LETTERS = 3;
/** Kinds of damage are told apart from levels (which run 0–9) by counting from here. */
const DAMAGE_KEY_BASE = 100;
/** A choice of what the spell does (rules/SpellVariants.ts) is told apart from the levels and the kinds of damage from here on. */
const VARIANT_KEY_BASE = 2000;
const SCROLLBAR_W = 2;
const SCROLLBAR_MIN_H = 8;
const LIT_LABEL = 'lit';
/**
 * A switched-on passive (or toggle feat) is framed in gold that breathes softly, with a short bright comet running round it:
 * so many beads in its tail, this far apart and this big, moving this many px an update; the frame's alpha swings between
 * ON_EDGE_ALPHA ± ON_PULSE over one lap of the comet.
 */
const BEADS = 6;
const BEAD_GAP = 1.5;
const BEAD_SIZE = 2;
const BEAD_SPEED = 0.5;
const ON_EDGE = 0xd9a441;
const ON_COMET = 0xfff0c0;
const ON_EDGE_ALPHA = 0.75;
const ON_PULSE = 0.2;
/** The hint at the top turns this colour outside a safe room, where spells can't be prepared. */
const UNSAFE_HINT = 0xff9a6a;
/** A box greyed out (a spell or feature above the hero's level): its picture this faint, under a veil this dark. */
const LOCKED_ICON_ALPHA = 0.3;
const LOCKED_VEIL_ALPHA = 0.45;
/** A bind counter's colour: room left, full, or (after a level's limit fell short of what was bound) over. */
const COUNTER_FREE = THEME.buttonText;
const COUNTER_FULL = THEME.title;
const COUNTER_OVER = UNSAFE_HINT;
/** Space between the hint and the counters beside it; a line of the hint or a counter is this tall. */
const COUNTER_GAP = 8;
const LINE_H = 9;
/** A charges count sits this far down from its box's top edge. */
const CHARGE_TAG_DROP = 2;
/** A refusal (no room to bind) stays in the hint this many updates. */
const REFUSAL_UPDATES = 180;

/**
 * The inventory's Skills tab: first "Class features:" (what the class has given the hero by their level: a passive is
 * switched off and on by a click, and while it is on its box is framed in breathing gold with a comet running round it; an active one is bound
 * to the quick bar like a spell), then under "Cantrips:" and then "Level 1 spells:", "Level 2 spells:"… (as far as the hero
 * has slots) a small box for every spell the hero's class has learnt by their level. A spell has no picture yet, so
 * it is an empty box that tells about itself under the pointer. Click one to put it on the quick bar: a spell that can
 * be cast at several levels first opens a box for each level, each telling its own numbers. Spells are prepared only in
 * a safe room (game/PlayerActions.ts `mayPrepare`): elsewhere the hint at the top says so and a click on one does nothing.
 *
 * Spells the game does not cast yet are listed greyed out too, saying so under the pointer. A wizard sees every wizard
 * spell, those above their level greyed out, and their school's features in a section of their
 * own right after the class features (also greyed out until their level comes; its actives are bound without counting).
 * The order is: class features, the school, the Passive Feats and the spells feats taught, then cantrips and each level. At
 * the top right, counters tell how many cantrips and spells of each level are bound and how many may be
 * (src/rules/Schools.ts); with a level full, the hint says so instead of starting to bind.
 */
export class SpellsPanel {
  readonly view = new Container();
  private readonly content = new Container();
  private readonly frames = new Graphics();
  /** Dark veils over the greyed-out boxes, above their icons. */
  private readonly veils = new Graphics();
  private readonly highlight = new Graphics();
  private readonly popup = new Container();
  private readonly scrollbar = new Graphics();
  private readonly beads = new Graphics();
  private player: Player | null = null;
  /** The line at the top: how to bind, or, outside a safe room, that spells wait for one. */
  private hint: PixelLabel | null = null;
  private hintSafe: boolean | null = null;
  /** How wide the hint may run (beside the counters), and a refusal it shows for a while instead. */
  private hintWidth = 0;
  private refusal: string | null = null;
  private refusalLeft = 0;
  private counters: Counter[] = [];
  private chargeTags: ChargeTag[] = [];
  private bead = 0;
  private boxes: Box[] = [];
  private choice: Choice | null = null;
  private hovered: Box | null = null;
  private hoveredLevel = -1;
  private list: SpellList | null = null;
  private heroLevel = 0;
  private scrollY = 0;
  private contentH = 0;
  private key = '';

  constructor(private readonly area: Rect) {
    const mask = new Graphics().rect(area.x, area.y, area.w, area.h).fill({ color: 0xffffff });
    this.content.mask = mask;
    this.content.addChild(this.frames, this.veils, this.beads, this.highlight);
    this.view.addChild(this.content, mask, this.scrollbar, this.popup);
  }

  /** Lays the boxes out again when the hero's class, level or fighting style has changed. */
  set(player: Player): void {
    this.player = player;
    const cls = heroClass(player.heroClass).dndClass;
    const level = player.playerStats.level;
    const b = player.build;
    const key = JSON.stringify([cls, level, b?.fightingStyle, b?.extraStyle, b?.archetype, b?.maneuvers, b?.spells, b?.improvements]);
    if (key === this.key) return;
    this.key = key;
    this.list = spellListOf(cls, b);
    this.heroLevel = level;
    this.closeChoice();
    this.layout(cls, level, b);
  }

  private clearContent(): void {
    this.boxes = [];
    this.counters = [];
    this.chargeTags = [];
    this.hovered = null;
    this.frames.clear();
    this.veils.clear();
    this.highlight.clear();
    this.beads.clear();
    const keep: Container[] = [this.frames, this.veils, this.beads, this.highlight];
    for (const child of this.content.removeChildren()) if (!keep.includes(child)) child.destroy();
    this.content.addChild(...keep);
  }

  private addHeading(label: string, y: number, color: number): PixelLabel {
    const heading = new PixelLabel(label, { color, shadow: true });
    heading.position.set(Math.round(this.area.x + PAD), Math.round(y));
    this.content.addChild(heading);
    return heading;
  }

  /** One heading and its boxes in rows; returns where the next section starts. */
  private addSection(label: string, items: readonly Item[], top: number): number {
    this.addHeading(label, top, THEME.title);
    const cols = Math.max(1, Math.floor((this.area.w - 2 * PAD + GAP) / (BOX + GAP)));
    const first = top + HEADING_H;
    items.forEach((item, i) => {
      const rect = new Rectangle(this.area.x + PAD + (i % cols) * (BOX + GAP), first + Math.floor(i / cols) * (BOX + GAP), BOX, BOX);
      const locked = item.locked ?? false;
      this.boxes.push({ spell: item.spell ?? null, feature: item.feature ?? null, feat: item.feat ?? null, locked, taught: item.taught ?? false, rect });
      if (item.spell) this.addIcon(spellIconKey(item.spell.id), rect, locked);
      if (item.feature) this.addIcon(item.feature.icon, rect, locked);
      if (item.feat) this.addInitials(item.feat, rect);
      if (item.feature?.charges) this.addChargeTag(item.feature, rect);
    });
    const rows = Math.ceil(items.length / cols);
    return first + rows * (BOX + GAP) + SECTION_GAP;
  }

  /**
   * A spell's or a class feature's icon (src/data/spell-list.json, feature-icons.json) inside its box, once it has loaded
   * (faint while locked); one without an icon keeps an empty box.
   */
  private addIcon(key: string | null, rect: Rectangle, locked: boolean): void {
    if (!key) return;
    const icon = new Sprite(Texture.EMPTY);
    icon.alpha = locked ? LOCKED_ICON_ALPHA : 1;
    icon.position.set(rect.x + ICON_INSET, rect.y + ICON_INSET);
    this.content.addChildAt(icon, this.content.getChildIndex(this.frames) + 1);
    const show = (): void => {
      if (icon.destroyed) return;
      icon.texture = lazyTexture(key);
      icon.scale.set((BOX - 2 * ICON_INSET) / Math.max(1, icon.texture.width));
    };
    reportRejection(requestArt(key).then(show), `Icon ${key} did not load`, 'render');
  }

  private layout(cls: DndClass, level: number, build: Build | undefined): void {
    const list = spellListOf(cls, build);
    this.clearContent();
    let y = this.addTop(this.area.y + PAD, level);
    const general = featuresAt(cls, level, build ?? null).filter((f) => !f.logOnly && !isWizardSchool(f.needs));
    y = this.addSection(text('skills.features'), general.map((feature) => ({ feature })), y);
    // Then the school, then what feats give (Passive Feats, and the spells they taught), then the cantrips and spells.
    const school = schoolOf(build);
    if (school) y = this.addSchool(cls, school, level, y);
    const feats = this.player ? passiveFeats(heroClass(this.player.heroClass), level, build) : [];
    if (feats.length) y = this.addSection(text('skills.passive_feats'), feats.map((feat) => ({ feat })), y);
    // The cantrips and spells feats taught (Magic Initiate, Spell Sniper): bound at their own level, counted against no limit.
    const taught = featSpellIds(build?.improvements).flatMap((id) => (isCatalogSpell(id) ? [CATALOG[id]] : []));
    if (taught.length) y = this.addSection(text('skills.feat_spells'), taught.map((spell) => ({ spell, taught: true, locked: !spell.castable })), y);
    if (!isCaster(list)) {
      this.addHeading(text('skills.none'), y, THEME.muted);
      y += HEADING_H;
    }
    listedSpells(list, level, build?.spells).forEach((spells, spellLevel) => {
      if (!spells.length) return;
      const label = spellLevel === 0 ? text('skills.cantrips') : text('skills.level', { level: spellLevel });
      // Greyed out: above the hero's level, or not cast in the game yet.
      const locked = (spell: CatalogSpell): boolean => !spell.castable || (learnLevel(list, spell) ?? Infinity) > level;
      y = this.addSection(label, spells.map((spell) => ({ spell, locked: locked(spell) })), y);
    });
    this.contentH = y - this.area.y;
    this.finishLayout();
  }

  /**
   * The wizard's school: every feature it gives, the ones above the hero's level greyed out. Its actives are bound like spells
   * but count against no limit.
   */
  private addSchool(cls: DndClass, school: WizardSchool, level: number, top: number): number {
    const features = CLASS_FEATURE_LIST[cls].filter((f) => f.needs === school);
    const label = text('skills.school', { school: archetypeName(school) });
    return this.addSection(label, features.map((feature) => ({ feature, locked: feature.level > level })), top);
  }

  /**
   * The top of the tab: a wizard's bind counters stacked at the right ("Cantrips 2/3", "Level 1 1/2"…, one for every level
   * they may bind), and the hint beside them on the left. Returns where the sections start.
   */
  private addTop(top: number, level: number): number {
    const right = this.area.x + this.area.w - PAD - SCROLLBAR_W;
    const counted = this.player && hasBindLimits(heroClass(this.player.heroClass));
    for (let spellLevel = 0; counted && spellLevel <= BIND_TOP_LEVEL; spellLevel++) {
      if (bindLimit(level, spellLevel) <= 0) continue;
      const label = new PixelLabel('', { color: COUNTER_FREE, align: 'right', shadow: true });
      label.position.set(Math.round(right), Math.round(top + this.counters.length * LINE_H));
      this.content.addChild(label);
      this.counters.push({ level: spellLevel, label });
    }
    this.updateCounters();
    const widest = this.counters.reduce((w, c) => Math.max(w, c.label.textWidth), 0);
    this.hintWidth = this.area.w - 2 * PAD - (widest ? widest + COUNTER_GAP : 0);
    this.hint = this.addHeading('', top, THEME.muted);
    this.hintSafe = null;
    this.updateHint();
    const hintH = Math.max(HEADING_H, this.hint.textHeight);
    return top + Math.max(hintH, this.counters.length * LINE_H) + SECTION_GAP;
  }

  /** Each counter says how many of its level are bound and how many may be, coloured by whether room is left. */
  private updateCounters(): void {
    const player = this.player;
    if (!player) return;
    const level = player.playerStats.level;
    for (const { level: spellLevel, label } of this.counters) {
      const used = boundAtLevel(player, spellLevel);
      const limit = bindLimit(level, spellLevel);
      label.text = spellLevel === 0 ? text('skills.binds.cantrips', { used, limit }) : text('skills.binds.level', { level: spellLevel, used, limit });
      label.fill = used > limit ? COUNTER_OVER : used === limit ? COUNTER_FULL : COUNTER_FREE;
    }
  }

  /** Draws the boxes (a veil over the locked ones) and puts the list back at the top. */
  private finishLayout(): void {
    for (const { rect } of this.boxes) this.drawBox(this.frames, rect);
    for (const { rect, locked } of this.boxes) if (locked) this.veils.rect(rect.x, rect.y, rect.width, rect.height).fill({ color: 0x000000, alpha: LOCKED_VEIL_ALPHA });
    this.scrollY = 0;
    this.content.y = 0;
    this.drawScrollbar();
  }

  private drawBox(g: Graphics, rect: Rectangle): void {
    g.rect(rect.x, rect.y, rect.width, rect.height).fill({ color: 0x000000, alpha: BOX_FILL_ALPHA })
      .stroke({ color: BOX_EDGE, alpha: BOX_EDGE_ALPHA, width: 1, alignment: 1 });
  }

  private get maxScroll(): number {
    return Math.max(0, this.contentH - this.area.h);
  }

  private drawScrollbar(): void {
    const g = this.scrollbar.clear();
    if (this.maxScroll <= 0) return;
    const barH = Math.max(SCROLLBAR_MIN_H, this.area.h * (this.area.h / this.contentH));
    const barY = this.area.y + (this.area.h - barH) * (this.scrollY / this.maxScroll);
    g.rect(this.area.x + this.area.w - SCROLLBAR_W, barY, SCROLLBAR_W, barH).fill({ color: BOX_EDGE, alpha: BOX_EDGE_ALPHA });
  }

  // ── Pointer ─────────────────────────────────────────────────────────────────

  private inArea(x: number, y: number): boolean {
    const a = this.area;
    return x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h;
  }

  private boxAt(x: number, y: number): Box | null {
    if (!this.inArea(x, y)) return null;
    const contentY = y + this.scrollY;
    return this.boxes.find((box) => box.rect.contains(x, contentY)) ?? null;
  }

  /** What tells the boxes of a choice apart (a level, or a kind of damage's place in the list): which one is lit. */
  private optionKey(option: Option): number {
    if (option.variant) return VARIANT_KEY_BASE + SPELL_VARIANTS.indexOf(option.variant);
    return option.damageType ? DAMAGE_KEY_BASE + DAMAGE_TYPES.indexOf(option.damageType) : option.level;
  }

  private optionAt(x: number, y: number): Option | null {
    return this.choice?.options.find((option) => option.rect.contains(x, y)) ?? null;
  }

  /** The pointer moved: the box (or level box) under it lights up. */
  hover(x: number, y: number): void {
    const option = this.optionAt(x, y);
    const box = option ? null : this.boxAt(x, y);
    const level = option ? this.optionKey(option) : -1;
    if (box === this.hovered && level === this.hoveredLevel) return;
    this.hovered = box;
    this.hoveredLevel = level;
    this.drawHighlight();
    this.drawChoice();
  }

  private drawHighlight(): void {
    const g = this.highlight.clear();
    const box = this.hovered;
    if (!box) return;
    g.rect(box.rect.x, box.rect.y, box.rect.width, box.rect.height).stroke({ color: THEME.title, width: 1, alignment: 1 });
  }

  /** Whether this hero may prepare spells here (in a safe room). */
  private get preparing(): boolean {
    return !!this.player && preparesSpells(this.player);
  }

  /** The top line says how to bind, or (in warning colour) that spells wait for a safe room, or that a level has no room left. */
  private updateHint(): void {
    if (this.refusalLeft > 0 && --this.refusalLeft === 0) this.refusal = null;
    const safe = this.preparing && !this.refusal;
    if (!this.hint || safe === this.hintSafe) return;
    this.hintSafe = safe;
    const line = this.refusal ?? text(safe ? 'skills.hint' : 'skills.safe_room_only');
    this.hint.text = wrapLines(line, this.hintWidth).join('\n');
    this.hint.fill = safe ? THEME.muted : UNSAFE_HINT;
  }

  /** The hint says for a while that no room is left to bind another spell of this kind (a cantrip, a level 2 spell). */
  private refuse(what: string): void {
    this.refusal = text('skills.bind_full', { what });
    this.refusalLeft = REFUSAL_UPDATES;
    this.hintSafe = null;
  }

  /** Starts binding the spell at this level (with the kind of damage picked for it), if a square can take it; else the hint says why not. */
  private bind(spell: CatalogSpell, level: number, damageType?: DamageType, variant?: SpellVariant): void {
    if (this.player && !roomSomewhere(this.player, spell.id, level)) {
      this.refuse(bindKind({ spell: spell.id, level }));
      return;
    }
    beginBinding({ spell: spell.id, level, ...(damageType ? { damageType } : {}), ...(variant ? { variant } : {}) });
  }

  /** The levels a spell can be bound at: a spell a feat taught only at its own. */
  private levelsOf(box: Box, spell: CatalogSpell): readonly number[] {
    return box.taught || !this.list ? [spell.level] : castLevels(this.list, this.heroLevel, spell);
  }

  /** A box of the open choice was pressed: a kind of damage goes on to the levels (or binds, with one level), a level binds. */
  private pickOption(option: Option, choice: Choice): void {
    this.closeChoice();
    if (!option.damageType && !option.variant) {
      this.bind(choice.spell, option.level, choice.damageType, choice.variant);
      return;
    }
    // A kind of damage (Chromatic Orb) or what the spell does (Blindness or Deafness) picked: the levels next.
    const levels = this.levelsOf(choice.box, choice.spell);
    if (levels.length === 1) this.bind(choice.spell, levels[0], option.damageType, option.variant);
    else this.openChoice(choice.box, levels, option.damageType, option.variant);
  }

  /**
   * A level box under the pointer: a small tooltip of what casting at that level changes, and the row of level boxes it
   * must keep clear of (it sits under or over them, never on them).
   */
  levelTipAt(x: number, y: number): { topic: TipTopic; clear: Rect } | null {
    const option = this.optionAt(x, y);
    const choice = this.choice;
    if (!option || !choice?.options.length) return null;
    const first = choice.options[0].rect;
    const last = choice.options[choice.options.length - 1].rect;
    const clear = { x: first.x - GAP, y: first.y - GAP, w: last.x + last.width - first.x + 2 * GAP, h: first.height + 2 * GAP };
    const topic = option.variant ? variantTopic(option.variant)
      : option.damageType ? damageChoiceTopic(choice.spell, option.damageType) : castLevelTopic(choice.spell, option.level, this.heroLevel);
    return { topic, clear };
  }

  /** What the pointer is over tells about itself: a spell box its base numbers, a feature its text (a level box has `levelTipAt`). */
  topicAt(x: number, y: number): TipTopic | null {
    // With a spell's level boxes open, its tooltip would lie over them: only a level box's own tip shows then.
    if (this.choice) return null;
    const box = this.boxAt(x, y);
    if (!box || !this.list) return null;
    if (box.feature) return featureTopic(box.feature, this.isOff(box.feature), this.heroLevel);
    if (box.feat) return featTopic(box.feat, this.featOn(box.feat));
    return box.spell ? spellTopic(box.spell, box.spell.level, this.heroLevel, learnLevel(this.list, box.spell)) : null;
  }

  /** A press on the tab: a level box binds that level; a spell box binds it, or opens its level boxes. Returns whether it was used. */
  press(x: number, y: number): boolean {
    const option = this.optionAt(x, y);
    if (option && this.choice) {
      this.pickOption(option, this.choice);
      return true;
    }
    const wasOpen = this.choice !== null;
    this.closeChoice();
    const box = this.boxAt(x, y);
    if (!box || !this.list) return wasOpen;
    // Greyed out: nothing to do yet (its tooltip tells the level it comes at).
    if (box.locked) return true;
    if (box.feature) return this.pressFeature(box.feature);
    if (box.feat) return this.pressFeat(box.feat);
    // Outside a safe room a spell can't be prepared: the hint at the top already says so.
    if (!box.spell || !this.preparing) return true;
    // A spell whose caster picks its kind of damage (Chromatic Orb): the kinds first.
    const types = damageChoices(box.spell.id);
    if (types.length > 0) {
      this.openTypeChoice(box, types);
      return true;
    }
    // A spell whose caster picks what it does (Blindness/Deafness): the choices first.
    const variants = variantChoices(box.spell.id);
    if (variants.length > 0) {
      this.openVariantChoice(box, variants);
      return true;
    }
    if (box.taught) {
      this.bind(box.spell, box.spell.level);
      return true;
    }
    const levels = castLevels(this.list, this.heroLevel, box.spell);
    if (levels.length === 1) this.bind(box.spell, levels[0]);
    else this.openChoice(box, levels);
    return true;
  }

  /** A toggle or used Passive Feat waits for a quick-bar square (its key switches or uses it); one that works by itself has nothing to bind. */
  private pressFeat(feat: FeatId): boolean {
    if (FEATS[feat].passive !== 'auto') beginBinding({ spell: featBinding(feat), level: 0 });
    return true;
  }

  /** A toggle feat switched on, or one that works by itself (always on). */
  private featOn(feat: FeatId): boolean {
    return FEATS[feat].passive === 'auto' || !!this.player?.featsOn?.includes(feat);
  }

  /** A feature used by charges shows how many are left in its box's top right corner (kept up to date in `animate`), as on the quick bar. */
  private addChargeTag(feature: FeatureDef, rect: Rectangle): void {
    const label = new PixelLabel('', { color: THEME.title, align: 'right', outline: true });
    label.position.set(Math.round(rect.x + BOX - 1), Math.round(rect.y + CHARGE_TAG_DROP));
    this.content.addChild(label);
    this.chargeTags.push({ feature, label });
  }

  /** Each charge tag says how many charges its feature has left. */
  private updateChargeTags(): void {
    const player = this.player;
    if (!player) return;
    for (const { feature, label } of this.chargeTags) {
      const left = String(featureCharges(player, feature.id) ?? '');
      if (label.text !== left) label.text = left;
    }
  }

  /** A Passive Feat's box shows its initials (feats have no icons). */
  private addInitials(feat: FeatId, rect: Rectangle): void {
    const label = new PixelLabel(featInitials(feat), { color: THEME.buttonText, align: 'center', shadow: true });
    label.position.set(Math.round(rect.x + BOX / 2), Math.round(rect.y + (BOX - 8) / 2));
    this.content.addChild(label);
  }

  private isOff(feature: FeatureDef): boolean {
    return !!this.player?.featuresOff?.includes(feature.id);
  }

  /** A passive that is played out is switched off or on; an active one waits for a quick-bar square. */
  private pressFeature(feature: FeatureDef): boolean {
    if (feature.kind === 'active') beginBinding({ spell: featureBinding(feature.id), level: 0 });
    else if (feature.kind === 'passive' && feature.worked && this.player) requestToggleFeature(this.player, feature.id);
    return true;
  }

  /** Every update: the hint follows whether the hero is in a safe room, and each switched-on passive's gold frame breathes, a comet running round it. */
  animate(): void {
    this.updateHint();
    this.updateCounters();
    this.updateChargeTags();
    const g = this.beads.clear();
    this.bead = (this.bead + BEAD_SPEED) % (4 * BOX);
    for (const { feature, rect, locked } of this.boxes) {
      if (!locked && feature?.kind === 'passive' && feature.worked && !this.isOff(feature)) this.drawBeads(g, rect);
    }
    for (const { feat, rect } of this.boxes) if (feat && this.featOn(feat)) this.drawBeads(g, rect);
  }

  private drawBeads(g: Graphics, rect: Rectangle): void {
    const perimeter = 4 * BOX;
    const pulse = ON_EDGE_ALPHA + ON_PULSE * Math.sin((this.bead / perimeter) * Math.PI * 2);
    g.rect(rect.x, rect.y, rect.width, rect.height).stroke({ color: ON_EDGE, alpha: pulse, width: 1, alignment: 1 });
    for (let i = 0; i < BEADS; i++) {
      const t = (this.bead - i * BEAD_GAP + perimeter) % perimeter;
      const side = Math.floor(t / BOX);
      const along = t - side * BOX;
      const x = side === 0 ? along : side === 1 ? BOX : side === 2 ? BOX - along : 0;
      const y = side === 0 ? 0 : side === 1 ? along : side === 2 ? BOX : BOX - along;
      // The comet's head is brightest, its tail fading out behind it.
      g.rect(rect.x + x - BEAD_SIZE / 2, rect.y + y - BEAD_SIZE / 2, BEAD_SIZE, BEAD_SIZE).fill({ color: ON_COMET, alpha: 1 - i / BEADS });
    }
  }

  scroll(delta: number): void {
    const next = Math.max(0, Math.min(this.maxScroll, this.scrollY + delta * WHEEL_STEP));
    if (next === this.scrollY) return;
    this.closeChoice();
    this.scrollY = next;
    this.content.y = -next;
    this.drawScrollbar();
  }

  // ── The level boxes ─────────────────────────────────────────────────────────

  /** A box for each level the spell can be cast at (bound with the kind of damage picked, if any). */
  private openChoice(box: Box, levels: readonly number[], damageType?: DamageType, variant?: SpellVariant): void {
    this.openRow(box, levels.length, (i, rect) => ({ level: levels[i], rect }), damageType, variant);
  }

  /** A box for each thing the spell can be bound to do (Blindness or Deafness). */
  private openVariantChoice(box: Box, variants: readonly SpellVariant[]): void {
    const level = box.spell?.level ?? 0;
    this.openRow(box, variants.length, (i, rect) => ({ level, variant: variants[i], rect }));
  }

  /** A box for each kind of damage the spell can deal, each in its colour. */
  private openTypeChoice(box: Box, types: readonly DamageType[]): void {
    const level = box.spell?.level ?? 0;
    this.openRow(box, types.length, (i, rect) => ({ level, damageType: types[i], rect }));
  }

  /** `count` boxes in a row under the spell's box (above it where there is no room), made by `option`. */
  private openRow(box: Box, count: number, option: (i: number, rect: Rectangle) => Option, damageType?: DamageType, variant?: SpellVariant): void {
    const w = count * BOX + (count - 1) * GAP + 2 * GAP;
    const h = BOX + 2 * GAP;
    const a = this.area;
    const boxTop = box.rect.y - this.scrollY;
    const left = Math.max(a.x, Math.min(box.rect.x - GAP, a.x + a.w - w));
    const below = boxTop + BOX + GAP;
    const top = below + h <= a.y + a.h ? below : Math.max(a.y, boxTop - h - GAP);
    const options = Array.from({ length: count }, (_, i) => option(i, new Rectangle(left + GAP + i * (BOX + GAP), top + GAP, BOX, BOX)));
    if (!box.spell) return;
    this.choice = { spell: box.spell, options, box, ...(damageType ? { damageType } : {}), ...(variant ? { variant } : {}) };
    this.hoveredLevel = -1;
    this.clearPopup();
    this.popup.addChild(new Graphics().rect(left, top, w, h).fill({ color: THEME.panel, alpha: CHOICE_FILL_ALPHA })
      .stroke({ color: THEME.panelBorder, width: 1, alignment: 1 }));
    for (const option of options) this.addOption(option);
  }

  /** A level box ("L2"), or a kind of damage's box: tinted in its colour, with the first letters of its name. */
  private addOption(option: Option): void {
    if (option.variant) {
      this.addVariantOption(option.rect, option.variant);
      return;
    }
    const r = option.rect;
    const g = new Graphics();
    this.drawBox(g, r);
    const type = option.damageType;
    if (type) g.rect(r.x + 1, r.y + 1, r.width - 2, r.height - 2).fill({ color: DAMAGE_COLORS[type], alpha: TYPE_TINT_ALPHA });
    const caption = type ? damageTypeName(type).slice(0, TYPE_LETTERS).toUpperCase() : text('skills.cast_level', { level: option.level });
    const label = new PixelLabel(caption, { color: type ? DAMAGE_COLORS[type] : THEME.buttonText, align: 'center', shadow: true });
    label.position.set(Math.round(r.x + r.width / 2), Math.round(r.y + (r.height - 8) / 2));
    this.popup.addChild(g, label);
  }

  /** A box of what the spell can be bound to do: tinted in its condition's ring colour, with a short word ("BLND", "DEAF"). */
  private addVariantOption(r: Rectangle, variant: SpellVariant): void {
    const g = new Graphics();
    this.drawBox(g, r);
    const colour = RING_COLOURS[variant];
    g.rect(r.x + 1, r.y + 1, r.width - 2, r.height - 2).fill({ color: colour, alpha: TYPE_TINT_ALPHA });
    const label = new PixelLabel(text(`skills.variant.${variant}`), { color: colour, align: 'center', shadow: true });
    label.position.set(Math.round(r.x + r.width / 2), Math.round(r.y + (r.height - 8) / 2));
    this.popup.addChild(g, label);
  }

  /** The level box under the pointer is edged in gold. */
  private drawChoice(): void {
    const choice = this.choice;
    if (!choice) return;
    for (const child of this.popup.children.filter((c) => c.label === LIT_LABEL)) child.destroy();
    const lit = choice.options.find((option) => this.optionKey(option) === this.hoveredLevel);
    if (!lit) return;
    const edge = new Graphics().rect(lit.rect.x, lit.rect.y, lit.rect.width, lit.rect.height).stroke({ color: THEME.title, width: 1, alignment: 1 });
    edge.label = LIT_LABEL;
    this.popup.addChild(edge);
  }

  private clearPopup(): void {
    for (const child of this.popup.removeChildren()) child.destroy({ children: true });
  }

  /** Closes a spell's level boxes; returns whether they were open. */
  closeChoice(): boolean {
    const wasOpen = this.choice !== null;
    this.choice = null;
    this.hoveredLevel = -1;
    this.clearPopup();
    return wasOpen;
  }
}

/** "GWM": the first letters of a feat's words, for its box. */
function featInitials(feat: FeatId): string {
  return featName(feat).split(/[\s:]+/).filter(Boolean).map((word) => word[0]).join('').slice(0, 3).toUpperCase();
}

/** The tooltip of a choice of what a spell does: the condition it lays, and what that does. */
function variantTopic(variant: SpellVariant): TipTopic {
  return { title: text(`condition.${variant}.name`), body: text(`condition.${variant}.text`) };
}
