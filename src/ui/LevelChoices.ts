import type { Player } from '../world';
import { text } from '../core/texts';
import { requestArchetype, requestExtraStyle, requestPicks } from '../game/Customize';
import { playableArchetypes } from '../rules/Archetypes';
import type { ArchetypeId } from '../rules/Archetypes';
import { knightNeeded, maneuversNeeded } from '../rules/Build';
import type { HeroClass } from '../rules/Classes';
import { featureOfClass } from '../rules/ClassFeatures';
import { FIGHTING_STYLES } from '../rules/FightingStyles';
import type { FightingStyleId } from '../rules/FightingStyles';
import { KNIGHT_PICK_LEVELS, freeSchoolPicks } from '../rules/KnightSpells';
import { MANEUVERS, MANEUVER_LEVELS, superiorityDice, superioritySides } from '../rules/Maneuvers';
import { archetypeDescription, archetypeName, fightingStyleDescription, fightingStyleName } from '../rules/Names';
import { CATALOG, isCantripId, knightCanLearn, knightOutsideSchools } from '../rules/Spellbook';
import type { CatalogSpell } from '../rules/Spellbook';
import type { TextId } from '../core/texts';
import type { TipTopic } from './InfoTooltip';
import type { PixelButton } from './PixelButton';
import type { PixelLabel } from './PixelText';
import { spellTopic } from './SpellTopics';
import { THEME } from './Theme';

/** What the level panel hands its pages: the pieces they are drawn with. */
export type PageKit = {
  label(content: string, x: number, y: number, color?: number, align?: 'left' | 'center'): PixelLabel;
  paragraph(content: string, y: number, color?: number, width?: number): number;
  button(content: string, x: number, y: number, w: number, h: number, press: () => void, enabled?: boolean): PixelButton;
  explain(button: PixelButton, topic: TipTopic): void;
  /** A small square of colour (the key to a kind of pick). */
  swatch(x: number, y: number, color: number): void;
  /** The < page > row at `y`, the page between the arrows; `turn` goes to another page. */
  pager(y: number, page: number, pages: number, turn: (page: number) => void): void;
  /**
   * The Save row at the foot of the page: the hint, and the button, drawn disabled until `ready`; pointing at a disabled one
   * says what is still missing (`missing`).
   */
  save(press: () => void, ready: boolean, missing: string): void;
};

/** The kinds of things a page asks the player to pick, each with its colour: a stripe on its buttons, a square by its count. */
export type PickKind = 'cantrip' | 'spell' | 'weapon' | 'element';
export const PICK_KIND_COLORS = {
  cantrip: 0x7ec8ff, spell: 0xc39bff, weapon: 0xe0b46a, element: 0xff8a5c,
} as const satisfies Record<PickKind, number>;
/** A kind's name, as a tooltip says what a pick is. */
export const PICK_KIND_NAMES = {
  cantrip: 'level.picks.kind.cantrip', spell: 'level.picks.kind.spell', weapon: 'level.picks.kind.weapon', element: 'level.picks.kind.element',
} as const satisfies Record<PickKind, TextId>;

/** How far each kind of pick is ("■ cantrips 1 of 2   ■ 1st-level spells 0 of 1"), each with its colour's square; returns the y under it. */
export function drawProgress(kit: PageKit, y: number, entries: readonly { kind: PickKind; text: string; done: boolean }[]): number {
  let x = 0;
  for (const entry of entries) {
    kit.swatch(x, y + 1, PICK_KIND_COLORS[entry.kind]);
    const label = kit.label(entry.text, x + SWATCH_GAP, y, entry.done ? DONE_COLOR : THEME.buttonText);
    x += SWATCH_GAP + label.textWidth + PROGRESS_GAP;
  }
  return y + PROGRESS_H;
}

/** In the progress row: the label sits this far right of its square; entries this far apart; the row is this tall. */
const SWATCH_GAP = 9;
const PROGRESS_GAP = 14;
const PROGRESS_H = 12;
/** A kind whose picks are all made shows its count in green. */
const DONE_COLOR = 0x7ddc7d;

const BUTTON_H = 16;
const GAP = 4;
const ROW_H = BUTTON_H + GAP;
/** Archetype (or school) buttons in a row. */
const ARCHETYPES_PER_ROW = 3;
const SPELL_ROWS = 7;
const PER_PAGE = SPELL_ROWS * 2;

/** The panel's page area, as the choices lay themselves out in it. */
export type PageArea = { width: number; height: number };

const drafted = (list: readonly string[], id: string): boolean => list.includes(id);

/**
 * The pages of the level panel where the player chooses something that is final once confirmed: the Fighter's Martial
 * Archetype (level 3) or the Wizard's school (level 2), a Champion's second fighting style (level 10), a Battle Master's maneuvers and an Eldritch
 * Knight's cantrips and spells. The pick is held here as a draft until Confirm sends it (to the host, for a guest).
 */
export class LevelChoices {
  private archetype: ArchetypeId | null = null;
  private extraStyle: FightingStyleId | null = null;
  private maneuvers: string[] = [];
  private cantrips: string[] = [];
  private spells: string[] = [];
  private page = 0;

  /** Two columns of buttons fill the page's width; archetypes stand three to a row. */
  private readonly columnW: number;
  private readonly archetypeW: number;

  constructor(private readonly kit: PageKit, private readonly area: PageArea) {
    this.columnW = Math.floor((area.width - GAP) / 2);
    this.archetypeW = Math.floor((area.width - (ARCHETYPES_PER_ROW - 1) * GAP) / ARCHETYPES_PER_ROW);
  }

  /** A button in the page's two columns: the `index`th, counted row by row from `top`. */
  private columnButton(content: string, index: number, top: number, press: () => void, enabled = true): PixelButton {
    return this.kit.button(content, (index % 2) * (this.columnW + GAP), top + Math.floor(index / 2) * ROW_H, this.columnW, BUTTON_H, press, enabled);
  }

  /** The panel opens afresh: nothing is half chosen. */
  reset(): void {
    this.archetype = null;
    this.extraStyle = null;
    this.maneuvers = [];
    this.cantrips = [];
    this.spells = [];
    this.page = 0;
  }

  /** Changes whenever the draft does, so the panel draws again. */
  signature(): string {
    return JSON.stringify([this.archetype, this.extraStyle, this.maneuvers, this.cantrips, this.spells, this.page]);
  }


  // ── Martial Archetype ───────────────────────────────────────────────────────

  drawArchetype(player: Player, cls: HeroClass): void {
    const school = cls.dndClass === 'wizard';
    this.kit.label(text(school ? 'level.school.title' : 'level.archetype.title'), 0, 0, THEME.title);
    let y = this.kit.paragraph(text(school ? 'level.school.hint' : 'level.archetype.hint'), 14);
    const offered = playableArchetypes(cls.dndClass);
    offered.forEach((id, i) => {
      const name = archetypeName(id);
      const x = (i % ARCHETYPES_PER_ROW) * (this.archetypeW + GAP);
      const row = y + Math.floor(i / ARCHETYPES_PER_ROW) * ROW_H;
      const button = this.kit.button(name, x, row, this.archetypeW, BUTTON_H, () => { this.archetype = id; });
      button.setSelected(this.archetype === id);
      this.kit.explain(button, { title: name, body: archetypeDescription(id), wide: true });
    });
    y += Math.ceil(offered.length / ARCHETYPES_PER_ROW) * ROW_H + 4;
    const chosen = this.archetype;
    if (chosen) {
      this.kit.label(archetypeName(chosen), 0, y, THEME.title);
      this.kit.paragraph(archetypeDescription(chosen), y + 10, THEME.text);
    } else {
      this.kit.paragraph(text(school ? 'level.school.none' : 'level.archetype.none'), y);
    }
    this.kit.save(() => {
      if (!chosen) return;
      requestArchetype(player, chosen);
      this.archetype = null;
    }, !!chosen, text('level.confirm.need_choice'));
  }

  // ── A Champion's second fighting style ──────────────────────────────────────

  drawExtraStyle(player: Player): void {
    this.kit.label(text('level.extra_style.title'), 0, 0, THEME.title);
    const first = player.build?.fightingStyle;
    let y = this.kit.paragraph(text('level.extra_style.hint'), 14);
    FIGHTING_STYLES.filter((style) => style !== first).forEach((style, i) => {
      const name = fightingStyleName(style);
      const button = this.columnButton(name, i, y, () => { this.extraStyle = style; });
      button.setSelected(this.extraStyle === style);
      this.kit.explain(button, { title: name, body: fightingStyleDescription(style) });
    });
    y += 3 * ROW_H + 2;
    const chosen = this.extraStyle;
    if (chosen) {
      this.kit.label(fightingStyleName(chosen), 0, y, THEME.title);
      this.kit.paragraph(fightingStyleDescription(chosen), y + 10, THEME.text);
    }
    this.kit.save(() => {
      if (!chosen) return;
      requestExtraStyle(player, chosen);
      this.extraStyle = null;
    }, !!chosen, text('level.confirm.need_choice'));
  }

  // ── A Battle Master's maneuvers ─────────────────────────────────────────────

  drawManeuvers(player: Player, level: number): void {
    const build = player.build;
    const need = maneuversNeeded(build, level);
    this.kit.label(text('level.maneuvers.title', { count: need, chosen: this.maneuvers.length }), 0, 0, THEME.title);
    const y = this.kit.paragraph(text('level.maneuvers.hint'), 14);
    const known = build?.maneuvers ?? [];
    MANEUVERS.forEach((id, i) => {
      const def = featureOfClass('fighter', id);
      const name = def?.name ?? id;
      const have = drafted(known, id);
      const enabled = !have && (drafted(this.maneuvers, id) || this.maneuvers.length < need);
      const button = this.columnButton(have ? `* ${name}` : name, i, y, () => this.toggleManeuver(id), enabled);
      button.setSelected(drafted(this.maneuvers, id));
      this.kit.explain(button, { title: name, body: def?.description ?? '', wide: true });
    });
    const dice = text('level.maneuvers.dice', { count: superiorityDice(level), sides: superioritySides(level) });
    this.kit.label(dice, 0, y + 8 * ROW_H + 2, THEME.buttonText);
    this.kit.save(() => {
      requestPicks(player, level, { maneuvers: this.maneuvers });
      this.maneuvers = [];
    }, this.maneuvers.length === need, text('level.confirm.need_maneuvers', { count: need, chosen: this.maneuvers.length }));
  }

  private toggleManeuver(id: string): void {
    this.maneuvers = drafted(this.maneuvers, id) ? this.maneuvers.filter((m) => m !== id) : [...this.maneuvers, id];
  }

  // ── An Eldritch Knight's spells ─────────────────────────────────────────────

  /** The spells the knight may still learn at this level: cantrips first, then by spell level, each by name. */
  private candidates(player: Player, level: number): CatalogSpell[] {
    const known = player.build?.spells ?? [];
    return Object.values(CATALOG)
      .filter((spell) => knightCanLearn(spell.id, level) && !drafted(known, spell.id))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }

  /** How many of these spells (above cantrips) are outside abjuration and evocation. */
  private outside(ids: readonly string[]): number {
    return ids.filter((id) => !isCantripId(id) && knightOutsideSchools(id)).length;
  }

  drawSpells(player: Player, level: number): void {
    const need = knightNeeded(player.build, level);
    const known = player.build?.spells ?? [];
    const free = freeSchoolPicks(level) - this.outside(known);
    const progress = this.spellProgress(need);
    let y = drawProgress(this.kit, 0, progress);
    y = this.kit.paragraph(text('level.spells.hint', { free: Math.max(0, free) }), y + 2);
    const all = this.candidates(player, level);
    const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
    this.page = Math.min(this.page, pages - 1);
    all.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE).forEach((spell, i) => {
      this.spellButton(spell, level, need, free - this.outside(this.spells), i, y);
    });
    this.kit.pager(y + SPELL_ROWS * ROW_H + 2, this.page, pages, (page) => { this.page = page; });
    const ready = progress.every((entry) => entry.done);
    this.kit.save(() => {
      requestPicks(player, level, { spells: [...this.cantrips, ...this.spells] });
      this.cantrips = [];
      this.spells = [];
    }, ready, text('level.confirm.need_spells', { progress: progress.map((entry) => entry.text).join(', ') }));
  }

  /** How far the cantrips and the spells are, each in its kind's colour (a kind the level asks none of is left out). */
  private spellProgress(need: { cantrips: number; spells: number }): { kind: PickKind; text: string; done: boolean }[] {
    const entries: { kind: PickKind; text: string; done: boolean }[] = [];
    if (need.cantrips > 0) entries.push({ kind: 'cantrip', text: text('level.picks.cantrip', { chosen: this.cantrips.length, count: need.cantrips }), done: this.cantrips.length === need.cantrips });
    if (need.spells > 0) entries.push({ kind: 'spell', text: text('level.picks.spells_any', { chosen: this.spells.length, count: need.spells }), done: this.spells.length === need.spells });
    return entries;
  }

  private spellButton(spell: CatalogSpell, level: number, need: { cantrips: number; spells: number }, freeLeft: number, index: number, top: number): void {
    const cantrip = spell.level === 0;
    const mine = cantrip ? this.cantrips : this.spells;
    const chosen = drafted(mine, spell.id);
    const room = mine.length < (cantrip ? need.cantrips : need.spells);
    const school = cantrip || !knightOutsideSchools(spell.id) || freeLeft > 0;
    const name = cantrip ? spell.name : text('skills.cast_level', { level: spell.level }) + ` ${spell.name}`;
    const button = this.columnButton(name, index, top, () => this.toggleSpell(spell), chosen || (room && school));
    const kind: PickKind = cantrip ? 'cantrip' : 'spell';
    button.setSelected(chosen);
    button.setAccent(PICK_KIND_COLORS[kind]);
    this.kit.explain(button, withKind(spellTopic(spell, spell.level, level), kind));
  }

  private toggleSpell(spell: CatalogSpell): void {
    const cantrip = spell.level === 0;
    const mine = cantrip ? this.cantrips : this.spells;
    const next = drafted(mine, spell.id) ? mine.filter((id) => id !== spell.id) : [...mine, spell.id];
    if (cantrip) this.cantrips = next;
    else this.spells = next;
  }

  // ── What was chosen, once settled ───────────────────────────────────────────

  /** The archetype's name and text, the second style, and the maneuvers or spells known, for a tab already settled. Returns the y under them. */
  drawSettled(player: Player, cls: HeroClass, tab: number, top: number): number {
    const build = player.build;
    let y = top;
    if (!build) return y;
    const { archetype, extraStyle, maneuvers, spells } = build;
    if (archetype && this.isArchetypeTab(cls, tab)) {
      this.kit.label(text(cls.dndClass === 'wizard' ? 'level.school.chosen' : 'level.archetype.chosen', { name: archetypeName(archetype) }), 0, y, THEME.title);
      y = this.kit.paragraph(archetypeDescription(archetype), y + 10, THEME.text);
    }
    if (extraStyle && tab === extraStyleTab(cls)) {
      this.kit.label(text('level.extra_style.chosen', { name: fightingStyleName(extraStyle) }), 0, y, THEME.title);
      y = this.kit.paragraph(fightingStyleDescription(extraStyle), y + 10, THEME.text);
    }
    if (maneuvers?.length && archetype === 'battle_master' && MANEUVER_LEVELS.includes(tab)) y = this.kit.paragraph(text('level.maneuvers.known', { list: names(maneuvers) }), y, THEME.buttonText);
    if (spells?.length && archetype === 'eldritch_knight' && KNIGHT_PICK_LEVELS.includes(tab)) y = this.kit.paragraph(text('level.spells.known', { list: spells.map((id) => CATALOG[id]?.name ?? id).join(', ') }), y, THEME.buttonText);
    return y;
  }

  private isArchetypeTab(cls: HeroClass, tab: number): boolean {
    return cls.progression.rewards[tab - 1]?.some((reward) => 'choice' in reward && reward.choice === 'archetype') ?? false;
  }
}

/** The level at which a class's second fighting style comes (the tab that tells about it). */
function extraStyleTab(cls: HeroClass): number {
  const index = cls.progression.gains.findIndex((gains) => gains.fightingStyles >= 2);
  return index < 0 ? Infinity : index + 1;
}

/** A pick's tooltip, its kind told first in the kind's colour ("Cantrip"), so nobody has to guess what a button is. */
export function withKind(topic: TipTopic, kind: PickKind): TipTopic {
  return { ...topic, detail: [{ text: text(PICK_KIND_NAMES[kind]), color: PICK_KIND_COLORS[kind] }, ...(topic.detail ?? [])] };
}

function names(ids: readonly string[]): string {
  return ids.map((id) => featureOfClass('fighter', id)?.name ?? id).join(', ');
}
