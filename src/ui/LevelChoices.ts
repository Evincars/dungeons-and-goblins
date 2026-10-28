import type { Player } from '../world';
import { text } from '../core/texts';
import { requestArchetype, requestExtraStyle, requestPicks } from '../game/Customize';
import { ARCHETYPES } from '../rules/Archetypes';
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
import type { TipTopic } from './InfoTooltip';
import type { PixelButton } from './PixelButton';
import type { PixelLabel } from './PixelText';
import { spellTopic } from './SpellTopics';
import { THEME } from './Theme';

/** What the level panel hands its pages: the pieces they are drawn with. */
export type PageKit = {
  label(content: string, x: number, y: number, color?: number): PixelLabel;
  paragraph(content: string, y: number, color?: number, width?: number): number;
  button(content: string, x: number, y: number, w: number, h: number, press: () => void, enabled?: boolean): PixelButton;
  explain(button: PixelButton, topic: TipTopic): void;
};

const COLUMN_W = 146;
const BUTTON_H = 16;
const GAP = 4;
const ROW_H = BUTTON_H + GAP;
const ARCHETYPE_W = 96;
const SMALL = 15;
const SPELL_ROWS = 7;
const PER_PAGE = SPELL_ROWS * 2;
const NAV_W = 20;

/** The panel's page area, as the choices lay themselves out in it. */
export type PageArea = { width: number; height: number };

const drafted = (list: readonly string[], id: string): boolean => list.includes(id);

/** Draws a name between brackets when chosen. */
const marked = (name: string, chosen: boolean): string => (chosen ? `> ${name} <` : name);

/**
 * The pages of the level panel where the player chooses something that is final once confirmed: the Fighter's Martial
 * Archetype (level 3), a Champion's second fighting style (level 10), a Battle Master's maneuvers and an Eldritch
 * Knight's cantrips and spells. The pick is held here as a draft until Confirm sends it (to the host, for a guest).
 */
export class LevelChoices {
  private archetype: ArchetypeId | null = null;
  private extraStyle: FightingStyleId | null = null;
  private maneuvers: string[] = [];
  private cantrips: string[] = [];
  private spells: string[] = [];
  private page = 0;

  constructor(private readonly kit: PageKit, private readonly area: PageArea) {}

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

  private confirmButton(press: () => void, enabled: boolean): void {
    const y = this.area.height - SMALL - 2;
    this.kit.label(text('level.final_hint'), 0, y + 4, THEME.muted);
    this.kit.button(text('level.confirm'), this.area.width - 80, y, 80, SMALL + 1, press, enabled);
  }

  // ── Martial Archetype ───────────────────────────────────────────────────────

  drawArchetype(player: Player): void {
    this.kit.label(text('level.archetype.title'), 0, 0, THEME.title);
    let y = this.kit.paragraph(text('level.archetype.hint'), 14);
    ARCHETYPES.forEach((id, i) => {
      const name = archetypeName(id);
      const button = this.kit.button(marked(name, this.archetype === id), i * (ARCHETYPE_W + GAP + 2), y, ARCHETYPE_W, BUTTON_H, () => { this.archetype = id; });
      this.kit.explain(button, { title: name, body: archetypeDescription(id), wide: true });
    });
    y += ROW_H + 4;
    const chosen = this.archetype;
    if (chosen) {
      this.kit.label(archetypeName(chosen), 0, y, THEME.title);
      this.kit.paragraph(archetypeDescription(chosen), y + 10, THEME.text);
    } else {
      this.kit.paragraph(text('level.archetype.none'), y);
    }
    this.confirmButton(() => {
      if (!chosen) return;
      requestArchetype(player, chosen);
      this.archetype = null;
    }, !!chosen);
  }

  // ── A Champion's second fighting style ──────────────────────────────────────

  drawExtraStyle(player: Player): void {
    this.kit.label(text('level.extra_style.title'), 0, 0, THEME.title);
    const first = player.build?.fightingStyle;
    let y = this.kit.paragraph(text('level.extra_style.hint'), 14);
    FIGHTING_STYLES.filter((style) => style !== first).forEach((style, i) => {
      const name = fightingStyleName(style);
      const button = this.kit.button(marked(name, this.extraStyle === style), (i % 2) * (COLUMN_W + GAP), y + Math.floor(i / 2) * ROW_H, COLUMN_W, BUTTON_H, () => { this.extraStyle = style; });
      this.kit.explain(button, { title: name, body: fightingStyleDescription(style) });
    });
    y += 3 * ROW_H + 2;
    const chosen = this.extraStyle;
    if (chosen) {
      this.kit.label(fightingStyleName(chosen), 0, y, THEME.title);
      this.kit.paragraph(fightingStyleDescription(chosen), y + 10, THEME.text);
    }
    this.confirmButton(() => {
      if (!chosen) return;
      requestExtraStyle(player, chosen);
      this.extraStyle = null;
    }, !!chosen);
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
      const label = have ? `* ${name}` : marked(name, drafted(this.maneuvers, id));
      const enabled = !have && (drafted(this.maneuvers, id) || this.maneuvers.length < need);
      const button = this.kit.button(label, (i % 2) * (COLUMN_W + GAP), y + Math.floor(i / 2) * ROW_H, COLUMN_W, BUTTON_H, () => this.toggleManeuver(id), enabled);
      this.kit.explain(button, { title: name, body: def?.description ?? '', wide: true });
    });
    const dice = text('level.maneuvers.dice', { count: superiorityDice(level), sides: superioritySides(level) });
    this.kit.label(dice, 0, y + 8 * ROW_H + 2, THEME.buttonText);
    this.confirmButton(() => {
      requestPicks(player, level, { maneuvers: this.maneuvers });
      this.maneuvers = [];
    }, this.maneuvers.length === need);
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
    this.kit.label(text('level.spells.need', { cantrips: this.cantrips.length, cantripsNeed: need.cantrips, spells: this.spells.length, spellsNeed: need.spells }), 0, 0, THEME.title);
    const y = this.kit.paragraph(text('level.spells.hint', { free: Math.max(0, free) }), 14);
    const all = this.candidates(player, level);
    const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
    this.page = Math.min(this.page, pages - 1);
    all.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE).forEach((spell, i) => {
      this.spellButton(spell, level, need, free - this.outside(this.spells), (i % 2) * (COLUMN_W + GAP), y + Math.floor(i / 2) * ROW_H);
    });
    const navY = y + SPELL_ROWS * ROW_H + 2;
    this.kit.button(text('level.page_prev'), 0, navY, NAV_W, SMALL, () => { this.page = Math.max(0, this.page - 1); }, this.page > 0);
    this.kit.label(text('level.page', { page: this.page + 1, pages }), NAV_W + 8, navY + 4, THEME.muted);
    this.kit.button(text('level.page_next'), NAV_W + 50, navY, NAV_W, SMALL, () => { this.page = Math.min(pages - 1, this.page + 1); }, this.page < pages - 1);
    this.confirmButton(() => {
      requestPicks(player, level, { spells: [...this.cantrips, ...this.spells] });
      this.cantrips = [];
      this.spells = [];
    }, this.cantrips.length === need.cantrips && this.spells.length === need.spells);
  }

  private spellButton(spell: CatalogSpell, level: number, need: { cantrips: number; spells: number }, freeLeft: number, x: number, y: number): void {
    const cantrip = spell.level === 0;
    const mine = cantrip ? this.cantrips : this.spells;
    const chosen = drafted(mine, spell.id);
    const room = mine.length < (cantrip ? need.cantrips : need.spells);
    const school = cantrip || !knightOutsideSchools(spell.id) || freeLeft > 0;
    const name = cantrip ? spell.name : text('skills.cast_level', { level: spell.level }) + ` ${spell.name}`;
    const button = this.kit.button(marked(name, chosen), x, y, COLUMN_W, BUTTON_H, () => this.toggleSpell(spell), chosen || (room && school));
    this.kit.explain(button, spellTopic(spell, spell.level, level));
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
      this.kit.label(text('level.archetype.chosen', { name: archetypeName(archetype) }), 0, y, THEME.title);
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

function names(ids: readonly string[]): string {
  return ids.map((id) => featureOfClass('fighter', id)?.name ?? id).join(', ');
}
