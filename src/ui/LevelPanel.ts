import { Container, Graphics, Rectangle } from 'pixi.js';
import { STAT_NAMES } from '../world';
import type { Player, StatName } from '../world';
import { text } from '../core/texts';
import { statShort } from '../entities/Items';
import { requestFightingStyle, requestImprovement, requestLock, requestScores } from '../game/Customize';
import { abilityModifier } from '../rules/Abilities';
import {
  archetypeLevel, baseScores, extraStyleLevel, featOpen, fightingStyleOffered, hasFeat, improvementIndexAt, levelHasChoice, maneuversNeeded,
  meetsRequirement, newBuild, picksPending, visibleLevel,
} from '../rules/Build';
import type { Build, Improvement } from '../rules/Build';
import { playableArchetypes } from '../rules/Archetypes';
import { heroClass } from '../rules/Classes';
import type { HeroClass } from '../rules/Classes';
import { featuresAt } from '../rules/ClassFeatures';
import { isManeuver } from '../rules/Maneuvers';
import { FEATS, FEAT_IDS, featAbility, featNeedsAbility } from '../rules/Feats';
import type { FeatId, FeatRequirement } from '../rules/Feats';
import { FIGHTING_STYLES } from '../rules/FightingStyles';
import type { FightingStyleId } from '../rules/FightingStyles';
import { formatModifier } from '../rules/Dice';
import {
  featDescription, featName, featureName, fightingStyleDescription, fightingStyleName, spellName, trainingName,
} from '../rules/Names';
import { ABILITY_CAP } from '../rules/Progression';
import { HUMAN_BONUS, POINT_BUY_BUDGET, canLower, canRaise, pointsLeft, scoreCost } from '../rules/PointBuy';
import { InfoTooltip, wrapLines } from './InfoTooltip';
import type { TipDetail, TipTopic } from './InfoTooltip';
import { LevelChoices } from './LevelChoices';
import { PixelButton } from './PixelButton';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

/** The panel's size (game pixels): a row of tabs on top, one page under it. */
export const LEVEL_PANEL_W = 300;
export const LEVEL_PANEL_H = 306;
const TAB_H = 18;
const TAB_MAX_W = 26;
const PAGE_TOP = TAB_H + 8;
const ROW_H = 15;
const SMALL = 15;
const STYLE_W = 146;
const STYLE_H = 16;
const STYLE_GAP = 4;
const COST_X = 196;
const POINTS_X = 120;
const SECOND_COLUMN = 150;
/** A line of wrapped text is this tall. */
const LINE_H = 10;
const SELECTED_EDGE = 0xe8c66a;
/** An Ability Score Improvement is this many points. */
const IMPROVEMENT_POINTS = 2;
/** On the Improvement page the abilities stand in two columns; their - and + buttons sit this far into a column. */
const STAT_BUTTONS_X = 100;
/** The feats are listed two columns of this many rows a page, each row this tall. */
const FEAT_ROWS = 6;
const FEATS_PER_PAGE = FEAT_ROWS * 2;
const FEAT_ROW_H = STYLE_H + 3;
const NAV_W = 20;
/** The buttons that pick the ability a feat raises: where they start, and each one's width. */
const RAISE_LABEL_X = 96;
const RAISE_X = 120;
const RAISE_W = 28;
/** A feat's requirement in its tooltip: green when the hero meets it, red when not; amber for a feat not in the game yet. */
const REQUIREMENT_MET = 0x7ddc7d;
const REQUIREMENT_MISSED = 0xe85a4f;
const NOT_WORKED = 0xe8c66a;

/** A style that has a requirement to tell about when pointed at. */
const STYLE_DETAILS: Partial<Record<FightingStyleId, 'style.protection.detail' | 'style.two_weapon_fighting.detail'>> = {
  protection: 'style.protection.detail',
  two_weapon_fighting: 'style.two_weapon_fighting.detail',
};

type Scores = Record<StatName, number>;

const zeroScores = (): Scores => ({ strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 });

/**
 * What the HUD's level bubble opens: a log of the hero's levels, a tab for each level reached (a red ! on a tab
 * with a choice still to make). Level 1 is where the ability scores are bought (point buy) and, for a class that
 * has one, the fighting style picked; the Save button makes both final (so does leaving the first safe room). A
 * level that offers an Ability Score Improvement lets the player give two points or take a feat. Every other tab
 * lists what the level gave. A chosen fighting style stays explained on its page, and pointing at a style or a
 * feat explains it too. The levels that offer a Fighter's Martial Archetype (3), a Champion's second style (10), a
 * Battle Master's maneuvers or an Eldritch Knight's spells have a page for that choice (ui/LevelChoices.ts).
 */
export class LevelPanel {
  readonly view = new Container();
  private readonly tabs = new Container();
  private readonly page = new Container();
  private readonly tip = new InfoTooltip();
  private readonly choices = new LevelChoices({
    label: (content, x, y, color) => this.label(content, x, y, color),
    paragraph: (content, y, color, width) => this.paragraph(content, y, color, width),
    button: (content, x, y, w, h, press, enabled) => this.button(content, x, y, w, h, press, enabled),
    explain: (button, topic) => this.explain(button, topic),
  }, { width: LEVEL_PANEL_W, height: LEVEL_PANEL_H - PAGE_TOP });
  /** The tab the player clicked (null: the newest level, which follows the hero up). */
  private selected: number | null = null;
  /** The scores being bought (sent whole with every click, so a slow answer from the host cannot undo one). */
  private draft: Scores = zeroScores();
  /** The points handed out so far for an Ability Score Improvement, or the feat picked in their place (neither is final until Save). */
  private given: Scores = zeroScores();
  private feat: FeatId | null = null;
  /** The ability the picked feat raises, for a feat that lets the player choose; and the page of the feat list shown. */
  private featStat: StatName | null = null;
  private featPage = 0;
  /** What the panel was last drawn from, so it is drawn again only when that changes. */
  private signature = '';

  constructor() {
    this.view.eventMode = 'passive';
    this.page.position.set(0, PAGE_TOP);
    this.view.addChild(this.tabs, this.page, this.tip.view);
  }

  /** Called as the panel opens: the newest level is shown, and the draft starts from the hero's own scores. */
  open(player: Player): void {
    this.selected = null;
    this.draft = { ...(player.build ?? newBuild(heroClass(player.heroClass))).scores };
    this.given = zeroScores();
    this.feat = null;
    this.featStat = null;
    this.featPage = 0;
    this.choices.reset();
    this.signature = '';
  }

  update(player: Player): void {
    const build = player.build;
    if (!build) return;
    const signature = JSON.stringify([
      build, player.playerStats.level, this.draft, this.given, this.feat, this.featStat, this.featPage, this.selected, this.choices.signature(),
    ]);
    if (signature === this.signature) return;
    this.signature = signature;
    this.draw(player);
  }

  private draw(player: Player): void {
    this.tip.hide();
    for (const child of this.tabs.removeChildren()) child.destroy({ children: true });
    for (const child of this.page.removeChildren()) child.destroy({ children: true });
    const cls = heroClass(player.heroClass);
    const current = player.playerStats.level;
    const shown = visibleLevel(cls, current, player.build);
    const tab = Math.min(this.selected ?? shown, shown);
    this.drawTabs(player, cls, shown, tab);
    this.drawPage(player, cls, tab, current);
  }

  // ── Tabs ────────────────────────────────────────────────────────────────────

  /** A tab for every level the hero may read so far (see `visibleLevel`). */
  private drawTabs(player: Player, cls: HeroClass, shown: number, selected: number): void {
    const width = Math.min(TAB_MAX_W, Math.floor(LEVEL_PANEL_W / shown));
    for (let level = 1; level <= shown; level++) this.tabs.addChild(this.tab(level, (level - 1) * width, width - 2, level === selected, levelHasChoice(cls, level, player.build)));
  }

  private tab(level: number, x: number, w: number, selected: boolean, pending: boolean): Container {
    const tab = new Container();
    tab.position.set(x, 0);
    const bg = new Graphics().rect(0, 0, w, TAB_H).fill({ color: selected ? THEME.rowHover : THEME.row });
    if (selected) bg.rect(0, TAB_H - 2, w, 2).fill({ color: SELECTED_EDGE });
    const number = new PixelLabel(text('level.tab', { level }), { color: selected ? THEME.title : THEME.buttonText, align: 'center', shadow: true });
    number.position.set(Math.round(w / 2), Math.round((TAB_H - 8) / 2) - 1);
    tab.addChild(bg, number);
    if (pending) tab.addChild(this.pendingMark(w));
    tab.eventMode = 'static';
    tab.cursor = 'pointer';
    tab.hitArea = new Rectangle(0, 0, w, TAB_H);
    tab.on('pointertap', () => { this.selected = level; });
    return tab;
  }

  private pendingMark(tabWidth: number): PixelLabel {
    const mark = new PixelLabel('!', { color: THEME.hitPoints, align: 'center', outline: true });
    mark.position.set(tabWidth - 3, -1);
    mark.eventMode = 'none';
    return mark;
  }

  // ── Pieces ──────────────────────────────────────────────────────────────────

  private label(content: string, x: number, y: number, color: number = THEME.text): PixelLabel {
    const label = new PixelLabel(content, { color, shadow: true });
    label.position.set(x, y);
    label.eventMode = 'none';
    this.page.addChild(label);
    return label;
  }

  /** Text wrapped to `width`; returns the y under it. */
  private paragraph(content: string, y: number, color: number = THEME.muted, width = LEVEL_PANEL_W): number {
    const lines = wrapLines(content, width);
    this.label(lines.join('\n'), 0, y, color);
    return y + lines.length * LINE_H + 4;
  }

  private button(content: string, x: number, y: number, w: number, h: number, press: () => void, enabled = true): PixelButton {
    const button = new PixelButton(content, w, h);
    button.position.set(x, y);
    button.setEnabled(enabled);
    button.onPress = press;
    this.page.addChild(button);
    return button;
  }

  /** Reading the topic while the pointer is on a button. */
  private explain(button: PixelButton, topic: TipTopic): void {
    button.on('pointermove', (event) => {
      const at = event.getLocalPosition(this.view);
      this.tip.show(topic, at.x, at.y, { w: LEVEL_PANEL_W, h: LEVEL_PANEL_H });
    });
    button.on('pointerout', () => this.tip.hide());
  }

  // ── Which page ──────────────────────────────────────────────────────────────

  /**
   * The page of a tab: the choice it still asks for, else what it gave. A level may ask for more than one thing (an
   * Eldritch Knight's level 4 has an Improvement and new spells): each comes in turn, the Improvement first.
   */
  private drawPage(player: Player, cls: HeroClass, tab: number, current: number): void {
    const build = player.build ?? newBuild(cls);
    if (tab === 1 && !build.locked) this.drawCreation(player, cls, current);
    else if (this.improvementOpen(cls, tab, build)) this.drawImprovementPage(player, cls, tab, current);
    else if (archetypeLevel(cls, tab) && !build.archetype && playableArchetypes(cls.dndClass).length > 1) this.choices.drawArchetype(player, cls);
    else if (extraStyleLevel(cls, tab) && build.archetype === 'champion' && !build.extraStyle) this.choices.drawExtraStyle(player);
    else if (picksPending(build, tab)) this.drawPicks(player, tab);
    else if (improvementIndexAt(cls, tab) >= 0) this.drawImprovementPage(player, cls, tab, current);
    else this.drawRecord(player, cls, tab);
  }

  /** The tab's level offers an Improvement that has not been taken yet. */
  private improvementOpen(cls: HeroClass, tab: number, build: Build): boolean {
    const index = improvementIndexAt(cls, tab);
    return index >= 0 && !build.improvements[index];
  }

  // ── Level 1: point buy, fighting style, Save ───────────────────────────────

  private drawCreation(player: Player, cls: HeroClass, level: number): void {
    let y = this.paragraph(text('level.scores.hint'), 0);
    this.label(text('level.scores.title'), 0, y, THEME.title);
    this.label(text('level.scores.points', { points: pointsLeft(this.draft), budget: POINT_BUY_BUDGET }), POINTS_X, y, THEME.buttonText);
    this.button(text('level.scores.reset'), LEVEL_PANEL_W - 60, y - 3, 60, SMALL, () => this.reset(player, cls));
    y += ROW_H;
    for (const stat of STAT_NAMES) {
      this.scoreRow(player, stat, y);
      y += ROW_H;
    }
    y += 4;
    const offered = fightingStyleOffered(cls, level);
    if (offered) y = this.drawStyles(player, y);
    this.drawSave(player, offered && !player.build?.fightingStyle);
  }

  private reset(player: Player, cls: HeroClass): void {
    this.draft = { ...newBuild(cls).scores };
    requestScores(player, this.draft);
  }

  /** One ability: its name, what it comes to with the human's point, and buttons to buy it up or down. */
  private scoreRow(player: Player, stat: StatName, y: number): void {
    const total = this.draft[stat] + HUMAN_BONUS;
    this.label(text('level.scores.row', { stat: statShort(stat), score: total, modifier: formatModifier(abilityModifier(total)) }), 0, y + 4);
    this.button('-', POINTS_X, y, SMALL, SMALL, () => this.buy(player, stat, -1), canLower(this.draft, stat));
    this.button('+', POINTS_X + SMALL + 4, y, SMALL, SMALL, () => this.buy(player, stat, 1), canRaise(this.draft, stat));
    this.label(text('level.scores.cost', { cost: scoreCost(this.draft[stat]) ?? 0 }), COST_X, y + 4, THEME.muted);
  }

  private buy(player: Player, stat: StatName, by: 1 | -1): void {
    this.draft = { ...this.draft, [stat]: this.draft[stat] + by };
    requestScores(player, this.draft);
  }

  /** The five styles as buttons, and under them what the chosen one does (it stays up). Returns the y under it all. */
  private drawStyles(player: Player, top: number): number {
    this.label(text('level.style.title'), 0, top, THEME.title);
    this.label(text('level.style.hint'), 80, top, THEME.muted);
    const chosen = player.build?.fightingStyle;
    const start = top + ROW_H;
    FIGHTING_STYLES.forEach((style, i) => {
      const x = (i % 2) * (STYLE_W + STYLE_GAP);
      const y = start + Math.floor(i / 2) * (STYLE_H + STYLE_GAP);
      this.styleButton(player, style, chosen === style, x, y);
    });
    return this.styleDescription(chosen, start + 3 * (STYLE_H + STYLE_GAP) + 2);
  }

  private styleButton(player: Player, style: FightingStyleId, chosen: boolean, x: number, y: number): void {
    const name = fightingStyleName(style);
    const button = this.button(chosen ? `> ${name} <` : name, x, y, STYLE_W, STYLE_H, () => requestFightingStyle(player, style));
    const detail = STYLE_DETAILS[style] ? [text(STYLE_DETAILS[style])] : undefined;
    this.explain(button, { title: name, body: fightingStyleDescription(style), detail });
  }

  /** The chosen style's name and what it does, always on show; a hint to pick one while none is. */
  private styleDescription(style: FightingStyleId | undefined, y: number): number {
    if (!style) return this.paragraph(text('level.style.none'), y);
    this.label(fightingStyleName(style), 0, y, THEME.title);
    return this.paragraph(fightingStyleDescription(style), y + LINE_H, THEME.text);
  }

  private drawSave(player: Player, needsStyle: boolean): void {
    const y = LEVEL_PANEL_H - PAGE_TOP - SMALL - 2;
    this.label(text(needsStyle ? 'level.save.need_style' : 'level.save.hint'), 0, y + 4, THEME.muted);
    this.button(text('level.save'), LEVEL_PANEL_W - 70, y, 70, SMALL + 1, () => requestLock(player), !needsStyle);
  }

  // ── A level with an Ability Score Improvement ──────────────────────────────

  private drawImprovementPage(player: Player, cls: HeroClass, tab: number, current: number): void {
    const index = improvementIndexAt(cls, tab);
    const taken = player.build?.improvements[index];
    if (taken) this.drawTaken(player, cls, taken, tab);
    else if (index === (player.build?.improvements.length ?? 0)) this.drawImprovement(player, cls, tab, current);
    else this.paragraph(text('level.waiting'), 0);
  }

  /** What the Improvement of this level was spent on, and the rest the level gave. */
  private drawTaken(player: Player, cls: HeroClass, taken: Improvement, level: number): void {
    const list = 'feat' in taken ? this.featTaken(taken.feat, taken.ability) : this.pointsList(taken.stats);
    let y = this.paragraph(text('level.taken', { level, list }), 0, THEME.title);
    if ('feat' in taken) y = this.paragraph(featDescription(taken.feat), y, THEME.text);
    const gained = this.gainedList(player, cls, level);
    if (gained) this.paragraph(text('level.gained', { level, list: gained }), y + 4, THEME.buttonText);
  }

  /** "the Athlete feat (+1 DEX)": a feat, and the ability it raised. */
  private featTaken(feat: FeatId, ability: StatName | undefined): string {
    const raised = featAbility(feat, ability);
    const name = text('level.taken_feat', { feat: featName(feat) });
    return raised ? `${name} (${text('level.taken_points', { amount: 1, stat: statShort(raised) })})` : name;
  }

  private pointsList(stats: Partial<Record<StatName, number>>): string {
    return STAT_NAMES.filter((stat) => (stats[stat] ?? 0) > 0).map((stat) => text('level.taken_points', { amount: stats[stat] ?? 0, stat: statShort(stat) })).join(', ');
  }

  private drawImprovement(player: Player, cls: HeroClass, tab: number, current: number): void {
    const scores = baseScores(cls, current, player.build);
    const left = IMPROVEMENT_POINTS - this.pointsGiven();
    this.label(text('level.improve.title', { level: tab }), 0, 0, THEME.title);
    let y = this.paragraph(text('level.improve.hint'), 14);
    this.label(text(this.feat ? 'level.improve.feat_picked' : 'level.improve.points', { points: left }), 0, y, THEME.buttonText);
    y += ROW_H;
    STAT_NAMES.forEach((stat, i) => {
      const score = scores[stat] + this.given[stat];
      this.improveRow(stat, score, (i % 2) * SECOND_COLUMN, y + Math.floor(i / 2) * ROW_H, left > 0 && score < ABILITY_CAP, this.given[stat] > 0);
    });
    y += Math.ceil(STAT_NAMES.length / 2) * ROW_H + 2;
    this.drawFeats(player, cls, current, y);
    this.drawImprovementSave(player, left === 0 || this.featReady());
  }

  /** A feat is picked, with the ability it raises when it lets the player choose one. */
  private featReady(): boolean {
    return this.feat !== null && (!featNeedsAbility(this.feat) || this.featStat !== null);
  }

  /** The Save button, as on the first page: nothing is applied until it is pressed. */
  private drawImprovementSave(player: Player, ready: boolean): void {
    const y = LEVEL_PANEL_H - PAGE_TOP - SMALL - 2;
    this.label(text('level.improve.save_hint'), 0, y + 4, THEME.muted);
    this.button(text('level.save'), LEVEL_PANEL_W - 70, y, 70, SMALL + 1, () => this.confirm(player), ready);
  }

  private pointsGiven(): number {
    return STAT_NAMES.reduce((sum, stat) => sum + this.given[stat], 0);
  }

  private improveRow(stat: StatName, score: number, x: number, y: number, canGive: boolean, canTake: boolean): void {
    this.label(text('level.scores.row', { stat: statShort(stat), score, modifier: formatModifier(abilityModifier(score)) }), x, y + 4);
    this.button('-', x + STAT_BUTTONS_X, y, SMALL, SMALL, () => this.give(stat, -1), canTake);
    this.button('+', x + STAT_BUTTONS_X + SMALL + 4, y, SMALL, SMALL, () => this.give(stat, 1), canGive);
  }

  /** Giving points drops a feat that was picked: it is one or the other. */
  private give(stat: StatName, by: 1 | -1): void {
    this.feat = null;
    this.featStat = null;
    this.given = { ...this.given, [stat]: this.given[stat] + by };
  }

  /** Picking a feat gives the points back; picking it again lets it go. */
  private pickFeat(feat: FeatId): void {
    this.given = zeroScores();
    this.feat = this.feat === feat ? null : feat;
    this.featStat = null;
  }

  /** Save: the feat picked (with the ability it raises), or the points given, becomes final. */
  private confirm(player: Player): void {
    const feat = this.feat;
    const ability = this.featStat;
    requestImprovement(player, feat ? { feat, ...(ability ? { ability } : {}) } : { stats: this.pointsDraft() });
    this.feat = null;
    this.featStat = null;
    this.given = zeroScores();
  }

  /** The points handed out so far, as an Improvement's stats. */
  private pointsDraft(): Partial<Record<StatName, number>> {
    const stats: Partial<Record<StatName, number>> = {};
    for (const stat of STAT_NAMES) if (this.given[stat] > 0) stats[stat] = this.given[stat];
    return stats;
  }

  /**
   * Every feat, a page at a time: one the hero may take is a button, one whose requirement they miss (or that the game does
   * not play out yet, or that they have) is greyed out, and pointing at any tells what it does and what it asks for. Under
   * them, the pages, and the ability the picked feat raises.
   */
  private drawFeats(player: Player, cls: HeroClass, level: number, top: number): void {
    this.label(text('level.improve.feats'), 0, top, THEME.title);
    const pages = Math.ceil(FEAT_IDS.length / FEATS_PER_PAGE);
    this.featPage = Math.min(this.featPage, pages - 1);
    const start = top + ROW_H;
    FEAT_IDS.slice(this.featPage * FEATS_PER_PAGE, (this.featPage + 1) * FEATS_PER_PAGE).forEach((feat, i) => {
      this.featButton(player, cls, level, feat, (i % 2) * (STYLE_W + STYLE_GAP), start + Math.floor(i / 2) * FEAT_ROW_H);
    });
    const navY = start + FEAT_ROWS * FEAT_ROW_H;
    this.button(text('level.page_prev'), 0, navY, NAV_W, SMALL, () => { this.featPage = Math.max(0, this.featPage - 1); }, this.featPage > 0);
    this.label(text('level.page', { page: this.featPage + 1, pages }), NAV_W + 8, navY + 4, THEME.muted);
    this.button(text('level.page_next'), NAV_W + 50, navY, NAV_W, SMALL, () => { this.featPage = Math.min(pages - 1, this.featPage + 1); }, this.featPage < pages - 1);
    this.drawFeatAbility(cls, level, player.build, navY);
  }

  private featButton(player: Player, cls: HeroClass, level: number, feat: FeatId, x: number, y: number): void {
    const name = featName(feat);
    const open = featOpen(cls, level, player.build, feat);
    const button = this.button(this.feat === feat ? `> ${name} <` : name, x, y, STYLE_W, STYLE_H, () => this.pickFeat(feat), open);
    this.explain(button, { title: name, body: featDescription(feat), detail: this.featDetails(cls, level, player.build, feat), wide: true });
  }

  /** Under a feat's text: the abilities it raises, its requirement (green when met, red when not), and why it can't be taken. */
  private featDetails(cls: HeroClass, level: number, build: Build | undefined, feat: FeatId): TipDetail[] {
    const def = FEATS[feat];
    const lines: TipDetail[] = [];
    if (def.abilities.length) lines.push(text('level.feat.raises', { list: def.abilities.map(statShort).join(', ') }));
    if (def.requires) {
      const met = meetsRequirement(cls, level, build, def.requires);
      lines.push({ text: text('level.feat.requires', { requirement: requirementText(def.requires) }), color: met ? REQUIREMENT_MET : REQUIREMENT_MISSED });
    }
    if (!def.worked) lines.push({ text: text('level.feat.unworked'), color: NOT_WORKED });
    if (hasFeat(cls, level, build, feat)) lines.push({ text: text('level.feat.taken'), color: THEME.muted });
    return lines;
  }

  /** The picked feat's ability: a button for each it may raise (none above 20), or the one it raises. */
  private drawFeatAbility(cls: HeroClass, level: number, build: Build | undefined, y: number): void {
    const feat = this.feat;
    if (!feat || !FEATS[feat].abilities.length) return;
    this.label(text('level.feat.raise'), RAISE_LABEL_X, y + 4, THEME.buttonText);
    const scores = baseScores(cls, level, build);
    FEATS[feat].abilities.forEach((stat, i) => {
      const chosen = featAbility(feat, this.featStat ?? undefined) === stat;
      const name = statShort(stat);
      this.button(chosen ? `>${name}<` : name, RAISE_X + i * (RAISE_W + 2), y, RAISE_W, SMALL, () => { this.featStat = stat; }, scores[stat] < ABILITY_CAP);
    });
  }

  // ── A level that teaches a Battle Master maneuvers or an Eldritch Knight spells ──

  private drawPicks(player: Player, tab: number): void {
    if (maneuversNeeded(player.build, tab) > 0) this.choices.drawManeuvers(player, tab);
    else this.choices.drawSpells(player, tab);
  }

  // ── A level already settled: what it gave and what was chosen ──────────────

  private drawRecord(player: Player, cls: HeroClass, tab: number): void {
    let y = 0;
    if (tab === 1) y = this.drawSettled(player, cls);
    y = this.choices.drawSettled(player, cls, tab, y);
    const gained = this.gainedList(player, cls, tab);
    if (gained) this.paragraph(text('level.gained', { level: tab, list: gained }), y, THEME.buttonText);
    else if (tab > 1 && y === 0) this.paragraph(text('level.nothing', { level: tab }), y);
  }

  /** Level 1 after Save: the bought scores and the chosen style with what it does. Returns the y under them. */
  private drawSettled(player: Player, cls: HeroClass): number {
    const build = player.build ?? newBuild(cls);
    let y = this.paragraph(text('level.saved'), 0);
    STAT_NAMES.forEach((stat, i) => {
      const total = build.scores[stat] + HUMAN_BONUS;
      const line = text('level.scores.row', { stat: statShort(stat), score: total, modifier: formatModifier(abilityModifier(total)) });
      this.label(line, (i % 2) * SECOND_COLUMN, y + Math.floor(i / 2) * ROW_H);
    });
    y += 3 * ROW_H + 6;
    if (fightingStyleOffered(cls, 1)) y = this.styleDescription(build.fightingStyle, y);
    return y + 4;
  }

  /** The class features (the hero's archetype's too), spells and feats a level hands out, named; a maneuver is told with the ones chosen. */
  private gainedList(player: Player, cls: HeroClass, level: number): string {
    const names: string[] = [];
    for (const feature of featuresAt(cls.dndClass, level, player.build ?? null)) {
      if (feature.level === level && !isManeuver(feature.needs)) names.push(feature.name);
    }
    for (const reward of cls.progression.rewards[level - 1] ?? []) {
      if ('feature' in reward && !names.includes(featureName(reward.feature))) names.push(featureName(reward.feature));
      else if ('spell' in reward) names.push(spellName(reward.spell));
      else if ('feat' in reward) names.push(featName(reward.feat));
    }
    return names.join(', ');
  }

  destroy(): void {
    this.tip.hide();
    this.view.destroy({ children: true });
  }
}

/** "medium armour training", "the ability to cast spells", "INT or WIS 13 or higher": what a feat asks for. */
function requirementText(requires: FeatRequirement): string {
  if ('armor' in requires) return requires.armor === 'shield' ? text('level.feat.req_shield') : text('level.feat.req_armor', { armor: trainingName(requires.armor) });
  if ('spellcaster' in requires) return text('level.feat.req_spellcaster');
  const { abilities, score } = requires.abilityAtLeast;
  return text('level.feat.req_ability', { abilities: abilities.map(statShort).join(text('level.feat.req_or')), score });
}
