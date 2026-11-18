import type { Player } from '../world';
import { text } from '../core/texts';
import type { TextId } from '../core/texts';
import { featEffects } from '../rules/Build';
import type { HeroClass } from '../rules/Classes';
import type { FeatId } from '../rules/Feats';
import { pickOptions, picksWanted } from '../rules/FeatPicks';
import type { PickOption } from '../rules/FeatPicks';
import { featName, weaponCategoryName } from '../rules/Names';
import { isWeaponBase, weaponStats } from '../rules/WeaponTable';
import type { TipTopic } from './InfoTooltip';
import type { PageArea, PageKit } from './LevelChoices';
import { spellTopic } from './SpellTopics';
import { THEME } from './Theme';

const COLUMN_W = 146;
const BUTTON_H = 16;
const GAP = 4;
const ROW_H = BUTTON_H + GAP;
const SMALL = 15;
const NAV_W = 20;
/** The options stand in two columns of this many rows a page. */
const ROWS = 7;
const PER_PAGE = ROWS * 2;
/** Room kept under the options for the ability buttons and the Save button of the level panel. */
const FOOT_H = 2 * ROW_H + 4;
const BACK_W = 50;

type Group = PickOption['group'];
const GROUPS: readonly Group[] = ['cantrip', 'spell', 'weapon', 'element'];
/** How far each group of picks is, as the page says it. */
const GROUP_TEXT = {
  cantrip: 'level.picks.cantrip', spell: 'level.picks.spell', weapon: 'level.picks.weapon_count', element: 'level.picks.element_count',
} as const satisfies Record<Group, TextId>;

/**
 * The box that opens in the level panel once a feat that asks for picks is chosen (Magic Initiate, Spell Sniper, Weapon
 * Master, Elemental Adept): what it offers, a page at a time, the ones the hero can't pick greyed out. The picks are a
 * draft until the panel's Save sends them with the feat.
 */
export class FeatPicksView {
  private picks: string[] = [];
  private page = 0;

  constructor(private readonly kit: PageKit, private readonly area: PageArea) {}

  /** A new feat chosen (or none): nothing is picked yet. */
  reset(): void {
    this.picks = [];
    this.page = 0;
  }

  signature(): string {
    return JSON.stringify([this.picks, this.page]);
  }

  /** What has been picked so far. */
  chosen(): string[] {
    return [...this.picks];
  }

  /** Every group has as many picks as the feat asks for. */
  complete(player: Player, cls: HeroClass, level: number, feat: FeatId): boolean {
    const options = this.options(player, cls, level, feat);
    const wanted = picksWanted(feat, options);
    return GROUPS.every((group) => this.count(options, group) === wanted[group]);
  }

  private options(player: Player, cls: HeroClass, level: number, feat: FeatId): PickOption[] {
    return pickOptions(cls, feat, featEffects(cls, level, player.build).weapons);
  }

  private count(options: readonly PickOption[], group: Group): number {
    return this.picks.filter((id) => options.find((option) => option.id === id)?.group === group).length;
  }

  /** "Cantrips 1 of 2, spells 0 of 1": how far each group is. */
  private progress(options: readonly PickOption[], feat: FeatId): string {
    const wanted = picksWanted(feat, options);
    return GROUPS.filter((group) => wanted[group] > 0)
      .map((group) => text(GROUP_TEXT[group], { chosen: this.count(options, group), count: wanted[group] }))
      .join(', ');
  }

  /** The page: the feat's name and how far the picks are, the options, the pages, and a Back button that lets the feat go. */
  draw(player: Player, cls: HeroClass, level: number, feat: FeatId, back: () => void): void {
    const options = this.options(player, cls, level, feat);
    this.kit.label(text('level.picks.title', { feat: featName(feat) }), 0, 0, THEME.title);
    this.kit.button(text('level.picks.back'), this.area.width - BACK_W, -3, BACK_W, SMALL, back);
    this.kit.label(this.progress(options, feat), 0, 12, THEME.buttonText);
    const top = this.kit.paragraph(text('level.picks.hint'), 24);
    const pages = Math.max(1, Math.ceil(options.length / PER_PAGE));
    this.page = Math.min(this.page, pages - 1);
    const wanted = picksWanted(feat, options);
    options.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE).forEach((option, i) => {
      const room = this.count(options, option.group) < wanted[option.group];
      this.option(option, room, level, (i % 2) * (COLUMN_W + GAP), top + Math.floor(i / 2) * ROW_H);
    });
    const navY = Math.min(top + ROWS * ROW_H, this.area.height - FOOT_H - ROW_H);
    this.kit.button(text('level.page_prev'), 0, navY, NAV_W, SMALL, () => { this.page = Math.max(0, this.page - 1); }, this.page > 0);
    this.kit.label(text('level.page', { page: this.page + 1, pages }), NAV_W + 8, navY + 4, THEME.muted);
    this.kit.button(text('level.page_next'), NAV_W + 50, navY, NAV_W, SMALL, () => { this.page = Math.min(pages - 1, this.page + 1); }, this.page < pages - 1);
  }

  /** Where the ability buttons go: under the pages. */
  footY(): number {
    return this.area.height - FOOT_H;
  }

  private option(option: PickOption, room: boolean, level: number, x: number, y: number): void {
    const picked = this.picks.includes(option.id);
    const label = option.group === 'spell' ? `${text('skills.cast_level', { level: 1 })} ${option.name}` : option.name;
    const button = this.kit.button(picked ? `> ${label} <` : label, x, y, COLUMN_W, BUTTON_H, () => this.toggle(option.id), picked || (option.open && room));
    this.kit.explain(button, optionTopic(option, level));
  }

  private toggle(id: string): void {
    this.picks = this.picks.includes(id) ? this.picks.filter((p) => p !== id) : [...this.picks, id];
  }
}

/** What pointing at an option tells: a spell its numbers, a weapon its kind (or that the hero is trained in it already). */
function optionTopic(option: PickOption, level: number): TipTopic {
  if (option.spell) return spellTopic(option.spell, option.spell.level, level);
  if (option.group !== 'weapon' || !isWeaponBase(option.id)) return { title: option.name, body: text('level.picks.element') };
  const kind = weaponCategoryName(weaponStats(option.id).category);
  return { title: option.name, body: text(option.open ? 'level.picks.weapon' : 'level.picks.weapon_known', { kind }) };
}
