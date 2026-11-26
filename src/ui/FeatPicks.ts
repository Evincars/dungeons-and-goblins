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
import { PICK_KIND_COLORS, drawProgress, withKind } from './LevelChoices';
import type { PageArea, PageKit } from './LevelChoices';
import { spellTopic } from './SpellTopics';
import { THEME } from './Theme';

const BUTTON_H = 16;
const GAP = 4;
const ROW_H = BUTTON_H + GAP;
const SMALL = 15;
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

  /** Two columns of options fill the page's width. */
  private readonly columnW: number;

  constructor(private readonly kit: PageKit, private readonly area: PageArea) {
    this.columnW = Math.floor((area.width - GAP) / 2);
  }

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

  /** "Cantrips 1 of 2, spells 0 of 1": how far each group is, each in its kind's colour. */
  private progress(options: readonly PickOption[], feat: FeatId): { kind: Group; text: string; done: boolean }[] {
    const wanted = picksWanted(feat, options);
    return GROUPS.filter((group) => wanted[group] > 0).map((group) => {
      const chosen = this.count(options, group);
      return { kind: group, text: text(GROUP_TEXT[group], { chosen, count: wanted[group] }), done: chosen === wanted[group] };
    });
  }

  /** What is still to pick, said by a Save that is not ready yet. */
  missing(player: Player, cls: HeroClass, level: number, feat: FeatId): string {
    const progress = this.progress(this.options(player, cls, level, feat), feat);
    return text('level.save.need_picks', { progress: progress.map((entry) => entry.text).join(', ') });
  }

  /** The page: the feat's name and how far the picks are, the options, the pages, and a Back button that lets the feat go. */
  draw(player: Player, cls: HeroClass, level: number, feat: FeatId, back: () => void): void {
    const options = this.options(player, cls, level, feat);
    this.kit.label(text('level.picks.title', { feat: featName(feat) }), 0, 0, THEME.title);
    this.kit.button(text('level.picks.back'), this.area.width - BACK_W, -3, BACK_W, SMALL, back);
    drawProgress(this.kit, 13, this.progress(options, feat));
    const top = this.kit.paragraph(text('level.picks.hint'), 27);
    const pages = Math.max(1, Math.ceil(options.length / PER_PAGE));
    this.page = Math.min(this.page, pages - 1);
    const wanted = picksWanted(feat, options);
    options.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE).forEach((option, i) => {
      const room = this.count(options, option.group) < wanted[option.group];
      this.option(option, room, level, (i % 2) * (this.columnW + GAP), top + Math.floor(i / 2) * ROW_H);
    });
    const navY = Math.min(top + ROWS * ROW_H, this.area.height - FOOT_H - ROW_H);
    this.kit.pager(navY, this.page, pages, (page) => { this.page = page; });
  }

  /** Where the ability buttons go: under the pages. */
  footY(): number {
    return this.area.height - FOOT_H;
  }

  private option(option: PickOption, room: boolean, level: number, x: number, y: number): void {
    const picked = this.picks.includes(option.id);
    const label = option.group === 'spell' ? `${text('skills.cast_level', { level: 1 })} ${option.name}` : option.name;
    const button = this.kit.button(label, x, y, this.columnW, BUTTON_H, () => this.toggle(option.id), picked || (option.open && room));
    button.setSelected(picked);
    button.setAccent(PICK_KIND_COLORS[option.group]);
    this.kit.explain(button, withKind(optionTopic(option, level), option.group));
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
