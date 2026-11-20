import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { localPlayer } from '../world';
import type { Player } from '../world';
import { text } from '../core/texts';
import { reportRejection } from '../core/errors';
import { TICKS_PER_SECOND } from '../rules/Spells';
import { heroClass } from '../rules/Classes';
import type { DndClass } from '../rules/Classes';
import { featureOn, featureOfClass, featuresAt } from '../rules/ClassFeatures';
import type { FeatureDef } from '../rules/ClassFeatures';
import { bladesongImpeded } from '../rules/Schools';
import { undeadOf } from '../systems/SummonSystem';
import { claimPointer } from '../systems/InputSystem';
import { superiorityDice, superioritySides } from '../rules/Maneuvers';
import { passiveFeats } from '../rules/Build';
import { FEATS } from '../rules/Feats';
import type { FeatId } from '../rules/Feats';
import { featName, spellName } from '../rules/Names';
import { CATALOG, spellIconKey } from '../rules/Spellbook';
import { lazyTexture, requestArt } from '../assets/LazyArt';
import { GAME_WIDTH, GAME_HEIGHT } from '../render/Camera';
import { InfoTooltip } from './InfoTooltip';
import type { TipTopic } from './InfoTooltip';
import { featTopic, featureTopic, spellTopic } from './SpellTopics';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

/** Top left: this far from the screen's edges; a line this tall, its icon this big and its words this far right of it. */
const MARGIN = 8;
const LINE_H = 14;
const ICON = 12;
const TEXT_GAP = 4;
/** The words sit this far down their line (centred on the icon). */
const TEXT_DROP = 2;
/** The most lines there can be (a class has fewer passives than this). */
const MAX_LINES = 18;
/** An icon box: its dark fill and edge; a feat (no icon) shows its initials, so many letters at most. */
const BOX_FILL = 0x000000;
const BOX_FILL_ALPHA = 0.55;
const BOX_EDGE_ALPHA = 0.6;
const INITIALS = 2;
/** A timer's clock over its icon: the time gone darkens it this much, the time left runs round it as a ring this wide. */
const CLOCK_VEIL_ALPHA = 0.62;
const CLOCK_RING_WIDTH = 1;
const CLOCK_RING_ALPHA = 0.9;
/** The clock starts at the top and runs clockwise. */
const CLOCK_START = -Math.PI / 2;
const FULL_TURN = Math.PI * 2;
/** A passive that is ready is shown in this colour; one that is recovering is dimmed. */
const READY_COLOR = THEME.title;
/** The passives that need time to recover between uses, and the ticks each has left. */
const RECOVERING: Readonly<Record<string, (player: Player) => number>> = {
  protection: (player) => player.protectCooldown ?? 0,
  indomitable: (player) => player.indomitableCooldown ?? 0,
  grim_harvest: (player) => player.arcana?.harvestTicks ?? 0,
  instinctive_charm: (player) => player.arcana?.charmTicks ?? 0,
  illusory_self: (player) => player.arcana?.illusoryTicks ?? 0,
  song_of_defence: (player) => player.arcana?.defenceTicks ?? 0,
};
/** The boosts an active feature gives while they last (Action Surge, Remarkable Athlete), and the ticks each has left. */
const BOOSTS = [
  { id: 'action_surge', left: (player: Player): number => player.actionSurge ?? 0 },
  { id: 'remarkable_athlete', left: (player: Player): number => player.athleteBoost ?? 0 },
] as const;
/** Passives whose own line (systems/SchoolSystem.ts state) says more than their name. */
const TOLD_APART: ReadonlySet<string> = new Set(['arcane_ward', 'portent']);
/** Each buff a hero may carry and the spell it comes from. */
const BUFF_NAMES = [['bladeWard', 'blade_ward'], ['shield', 'shield'], ['stoneskin', 'stoneskin']] as const;
/** A boost that is running is shown in this colour. */
const BOOST_COLOR = 0x40e0d0;
/** Great Weapon Master's earned attack, waiting for the next swing, is shown in blue. */
const BONUS_ATTACK_COLOR = 0x5aa8ff;

/** Seconds to a tenth, as the HUD counts them. */
const secondsOf = (ticks: number): string => (Math.ceil((ticks / TICKS_PER_SECOND) * 10) / 10).toFixed(1);

/** What a line's icon and tooltip tell about: a class feature, a spell or a feat. */
type About = { feature: FeatureDef } | { spell: string } | { feat: FeatId } | null;

/** One line: its words and colour, what it is about (its icon and tooltip), and its timer (ticks left), if one runs. */
type Line = { content: string; color: number; about: About; timer?: { key: string; left: number } };

const featureAbout = (cls: DndClass, id: string): About => {
  const feature = featureOfClass(cls, id);
  return feature ? { feature } : null;
};

/**
 * A wizard's school at work: the Arcane Ward's strength, the Portent dice foreseen, the Bladesong's seconds left (impeded or
 * not), the Transmuter's Stone carried and the undead raised (systems/SchoolSystem.ts, systems/SummonSystem.ts).
 */
function schoolLines(player: Player, cls: DndClass): Line[] {
  const lines: Line[] = [];
  const arcana = player.arcana;
  if (!arcana) return lines;
  if (featureOn(player, 'arcane_ward')) lines.push({ content: text('hud.passive.ward', { amount: arcana.ward }), color: READY_COLOR, about: featureAbout(cls, 'arcane_ward') });
  if (featureOn(player, 'portent')) lines.push({ content: text('hud.passive.portent', { dice: arcana.portent.join(' ') || '-' }), color: READY_COLOR, about: featureAbout(cls, 'portent') });
  if (arcana.songTicks > 0) {
    const impeded = bladesongImpeded(player.equipped ?? {});
    const song = featureAbout(cls, 'bladesong');
    lines.push({
      content: text(impeded ? 'hud.passive.bladesong_impeded' : 'hud.passive.bladesong', { seconds: secondsOf(arcana.songTicks) }),
      color: impeded ? THEME.muted : BOOST_COLOR, about: song, timer: { key: 'bladesong', left: arcana.songTicks },
    });
    // The Bladesong Charges gathered for its Climax: all of them, then how many of each kind.
    const charges = { total: arcana.damageCharges + arcana.healingCharges, damage: arcana.damageCharges, healing: arcana.healingCharges };
    lines.push({ content: text('hud.passive.song_charges', charges), color: BOOST_COLOR, about: featureAbout(cls, 'bladesong_climax') });
  }
  if (arcana.darkvision) lines.push({ content: text('hud.passive.darkvision'), color: READY_COLOR, about: featureAbout(cls, 'third_eye_darkvision') });
  if (arcana.seeInvisible) lines.push({ content: text('hud.passive.see_invisible'), color: READY_COLOR, about: featureAbout(cls, 'third_eye_see_invisibility') });
  if (arcana.stone) {
    const speed = arcana.stone === 'speed';
    lines.push({
      content: text(speed ? 'hud.passive.stone_speed' : 'hud.passive.stone_constitution'), color: READY_COLOR,
      about: featureAbout(cls, speed ? 'transmuters_stone_speed' : 'transmuters_stone_constitution'),
    });
  }
  const undead = undeadOf(player);
  if (undead > 0) lines.push({ content: text('hud.passive.undead', { count: undead }), color: READY_COLOR, about: featureAbout(cls, 'undead_thralls') });
  return lines;
}

/** The spells lasting on the hero (Blade Ward, Shield, Stoneskin with their seconds; Mage Armour) and the one they concentrate on. */
function spellLines(player: Player): Line[] {
  const lines: Line[] = [];
  const buffs = player.buffs;
  for (const [key, id] of BUFF_NAMES) {
    const left = buffs?.[key] ?? 0;
    if (left > 0) lines.push({ content: text('hud.passive.recovering', { name: spellName(id), seconds: secondsOf(left) }), color: BOOST_COLOR, about: { spell: id }, timer: { key: `buff:${id}`, left } });
  }
  if ((buffs?.mageArmor ?? 0) > 0) lines.push({ content: spellName('mage_armor'), color: BOOST_COLOR, about: { spell: 'mage_armor' } });
  const held = player.concentration;
  if (held) lines.push({ content: text('hud.passive.concentration', { spell: spellName(held.spell) }), color: BOOST_COLOR, about: { spell: held.spell } });
  return lines;
}

/** The switched-on passives (and their recovery), then the boosts an active feature gives while they last. */
function featureLines(player: Player, cls: DndClass): Line[] {
  const off = player.featuresOff ?? [];
  // Passives with a line of their own (the ward, Portent) are told there instead.
  const active = featuresAt(cls, player.playerStats.level, player.build ?? null)
    .filter((f) => f.kind === 'passive' && f.worked && !off.includes(f.id) && !TOLD_APART.has(f.id));
  const lines: Line[] = active.map((feature) => {
    const left = RECOVERING[feature.id]?.(player) ?? 0;
    if (left <= 0) return { content: feature.name, color: READY_COLOR, about: { feature } };
    return { content: text('hud.passive.recovering', { name: feature.name, seconds: secondsOf(left) }), color: THEME.muted, about: { feature }, timer: { key: feature.id, left } };
  });
  for (const boost of BOOSTS) {
    const left = boost.left(player);
    const feature = featureOfClass(cls, boost.id);
    if (left <= 0) continue;
    lines.push({
      content: text('hud.passive.recovering', { name: feature?.name ?? boost.id, seconds: secondsOf(left) }), color: BOOST_COLOR,
      about: feature ? { feature } : null, timer: { key: boost.id, left },
    });
  }
  return lines;
}

/**
 * The Passive Feats at work: a toggle one while switched on, one that works by itself (with its recovery), and Great Weapon
 * Master's earned attack, in blue, until the next swing spends it.
 */
function featLines(player: Player): Line[] {
  const lines: Line[] = [];
  for (const feat of passiveFeats(heroClass(player.heroClass), player.playerStats.level, player.build)) {
    const auto = FEATS[feat].passive === 'auto';
    if (!auto && !player.featsOn?.includes(feat)) continue;
    const left = feat === 'defensive_duelist' ? player.duelistCooldown ?? 0 : 0;
    lines.push(left > 0
      ? { content: text('hud.passive.recovering', { name: featName(feat), seconds: secondsOf(left) }), color: THEME.muted, about: { feat }, timer: { key: `feat:${feat}`, left } }
      : { content: featName(feat), color: READY_COLOR, about: { feat } });
  }
  if (player.bonusAttack) lines.push({ content: text('hud.bonus_attack'), color: BONUS_ATTACK_COLOR, about: player.bonusAttack ? { feat: 'great_weapon_master' } : null });
  return lines;
}

/** A Battle Master's dice left, and the maneuver they have readied. */
function battleLines(player: Player, cls: DndClass): Line[] {
  const lines: Line[] = [];
  if (player.build?.archetype === 'battle_master') {
    const level = player.playerStats.level;
    const dice = text('hud.dice', { left: player.superiorityLeft ?? superiorityDice(level), max: superiorityDice(level), sides: superioritySides(level) });
    lines.push({ content: dice, color: READY_COLOR, about: featureAbout(cls, 'combat_superiority') });
  }
  const ready = player.maneuver?.id;
  if (ready) lines.push({ content: text('hud.maneuver_ready', { name: featureOfClass(cls, ready)?.name ?? ready }), color: THEME.buttonText, about: featureAbout(cls, ready) });
  return lines;
}

/** Every line the hero's HUD lists now. */
function linesOf(player: Player): Line[] {
  const cls = heroClass(player.heroClass).dndClass;
  return [...featureLines(player, cls), ...schoolLines(player, cls), ...spellLines(player), ...featLines(player), ...battleLines(player, cls)];
}

/** The icon of what a line is about: a feature's or a spell's (a feat has none). */
function iconOf(about: About): string | null {
  if (!about) return null;
  if ('feature' in about) return about.feature.icon;
  return 'spell' in about ? spellIconKey(about.spell) : null;
}

/** "GW": a feat's initials, for its box. */
function initialsOf(about: About): string {
  if (!about || !('feat' in about)) return '';
  return featName(about.feat).split(/[\s:]+/).filter(Boolean).map((word) => word[0]).join('').slice(0, INITIALS).toUpperCase();
}

/** One line's view: its icon in a box (or a feat's initials), its clock, its words, and the area that takes the pointer. */
type Row = { root: Container; box: Graphics; icon: Sprite; initials: PixelLabel; clock: Graphics; label: PixelLabel; iconKey: string | null };

/**
 * The passive class features that are switched on, top left corner, a line each with its icon and name; whatever recovers
 * or lasts for a while (Protection, Indomitable, Action Surge, a Shield spell…) shows its seconds left and a clock over its
 * icon that empties as they run out. A passive switched off in the Skills tab is not listed. The school's state, the spells
 * lasting on the hero, the Passive Feats at work and a Battle Master's dice come after them. The pointer over a line shows
 * the tooltip of what it is about.
 */
export class PassiveHud {
  readonly view = new Container();
  private readonly rows: Row[] = [];
  private readonly tip = new InfoTooltip();
  private lines: Line[] = [];
  private shown = '';
  private hovered = -1;
  /** Each timer's whole length (ticks), taken when it starts, and its ticks left last update (a rise means it started again). */
  private readonly totals = new Map<string, number>();
  private readonly lastLeft = new Map<string, number>();

  constructor() {
    this.view.eventMode = 'passive';
    for (let i = 0; i < MAX_LINES; i++) this.rows.push(this.makeRow(i));
    this.view.addChild(this.tip.view);
  }

  private makeRow(i: number): Row {
    const root = new Container();
    root.position.set(MARGIN, MARGIN + i * LINE_H);
    root.visible = false;
    root.eventMode = 'static';
    root.hitArea = new Rectangle(0, 0, ICON + TEXT_GAP, ICON);
    root.on('pointerover', () => { this.hovered = i; claimPointer(root, true); });
    root.on('pointerout', () => { if (this.hovered === i) this.hovered = -1; claimPointer(root, false); });
    const box = new Graphics().rect(0, 0, ICON, ICON).fill({ color: BOX_FILL, alpha: BOX_FILL_ALPHA }).stroke({ color: THEME.panelBorder, alpha: BOX_EDGE_ALPHA, width: 1, alignment: 1 });
    const icon = new Sprite(Texture.EMPTY);
    const initials = new PixelLabel('', { color: THEME.buttonText, align: 'center', scale: 0.75, shadow: true });
    initials.position.set(ICON / 2, TEXT_DROP);
    const clock = new Graphics();
    const label = new PixelLabel('', { color: READY_COLOR, outline: true });
    label.position.set(ICON + TEXT_GAP, TEXT_DROP);
    root.addChild(box, icon, initials, clock, label);
    this.view.addChild(root);
    return { root, box, icon, initials, clock, label, iconKey: null };
  }

  /** Shows a line's icon (loaded the first time it is asked for). */
  private setIcon(row: Row, key: string | null): void {
    if (row.iconKey === key) return;
    row.iconKey = key;
    row.icon.texture = Texture.EMPTY;
    if (!key) return;
    const show = (): void => {
      if (row.icon.destroyed || row.iconKey !== key) return;
      row.icon.texture = lazyTexture(key);
      row.icon.scale.set(ICON / Math.max(1, row.icon.texture.width));
    };
    reportRejection(requestArt(key).then(show), `Icon ${key} did not load`, 'render');
  }

  /** A timer's share still left (1 when it has just started, 0 when it runs out). */
  private share(timer: { key: string; left: number }): number {
    const last = this.lastLeft.get(timer.key) ?? 0;
    if (timer.left > last || !this.totals.has(timer.key)) this.totals.set(timer.key, timer.left);
    this.lastLeft.set(timer.key, timer.left);
    return timer.left / Math.max(1, this.totals.get(timer.key) ?? timer.left);
  }

  /** The clock over a line's icon: the time gone darkens it clockwise from the top, the time left runs round it in the line's colour. */
  private drawClock(row: Row, line: Line): void {
    const g = row.clock.clear();
    if (!line.timer) return;
    const left = this.share(line.timer);
    const c = ICON / 2;
    const gone = CLOCK_START + FULL_TURN * (1 - left);
    if (left < 1) squareWedge(g, c, CLOCK_START, gone).fill({ color: 0x000000, alpha: CLOCK_VEIL_ALPHA });
    g.arc(c, c, c, gone, CLOCK_START + FULL_TURN).stroke({ color: line.color, alpha: CLOCK_RING_ALPHA, width: CLOCK_RING_WIDTH });
  }

  /** Lays the lines out again (only when what they say changes). */
  private layout(lines: Line[]): void {
    this.rows.forEach((row, i) => {
      const line = lines[i];
      row.root.visible = !!line;
      if (!line) return;
      row.label.text = line.content;
      row.label.fill = line.color;
      row.initials.text = initialsOf(line.about);
      this.setIcon(row, iconOf(line.about));
      row.root.hitArea = new Rectangle(0, 0, ICON + TEXT_GAP + row.label.textWidth, ICON);
    });
  }

  /** The tooltip of what the line under the pointer is about, beside it. */
  private updateTip(player: Player): void {
    const line = this.lines[this.hovered];
    const topic = line ? topicOf(line.about, player) : null;
    if (!topic) {
      this.tip.hide();
      return;
    }
    const row = this.rows[this.hovered].root;
    const anchor = { x: row.x, y: row.y, w: ICON + TEXT_GAP + this.rows[this.hovered].label.textWidth, h: ICON };
    this.tip.showAt(topic, anchor, { w: GAME_WIDTH, h: GAME_HEIGHT }, 'beside');
    this.tip.refresh();
  }

  update(): void {
    const player = localPlayer();
    if (!player) return;
    const lines = linesOf(player);
    const key = JSON.stringify(lines.map((line) => [line.content, line.color, iconOf(line.about), initialsOf(line.about)]));
    this.lines = lines;
    if (key !== this.shown) {
      this.shown = key;
      this.layout(lines);
    }
    lines.forEach((line, i) => { if (this.rows[i]) this.drawClock(this.rows[i], line); });
    this.updateTip(player);
  }

  destroy(): void {
    for (const row of this.rows) claimPointer(row.root, false);
    this.tip.hide();
    this.view.destroy({ children: true });
  }
}

/** The clock's steps round a turn (its wedge's edge follows the box's square in steps this fine). */
const WEDGE_STEPS = 48;

/** A wedge of a square `2c` across, from its middle, between two angles (clockwise): the time gone over an icon. */
function squareWedge(g: Graphics, c: number, from: number, to: number): Graphics {
  g.moveTo(c, c);
  const steps = Math.max(1, Math.ceil(((to - from) / FULL_TURN) * WEDGE_STEPS));
  for (let i = 0; i <= steps; i++) {
    const angle = from + ((to - from) * i) / steps;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Out along the ray to the square's edge.
    const reach = c / Math.max(Math.abs(cos), Math.abs(sin));
    g.lineTo(c + cos * reach, c + sin * reach);
  }
  return g.closePath();
}

/** What a line's tooltip tells: its feature's, spell's or feat's story. */
function topicOf(about: About, player: Player): TipTopic | null {
  if (!about) return null;
  const level = player.playerStats.level;
  if ('feature' in about) return featureTopic(about.feature, false, level);
  if ('feat' in about) return featTopic(about.feat, true);
  const spell = CATALOG[about.spell];
  return spell ? spellTopic(spell, spell.level, level) : null;
}
