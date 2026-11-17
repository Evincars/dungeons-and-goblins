import { Container } from 'pixi.js';
import { localPlayer } from '../world';
import type { Player } from '../world';
import { text } from '../core/texts';
import { TICKS_PER_SECOND } from '../rules/Spells';
import { heroClass } from '../rules/Classes';
import { featureOn, featureOfClass, featuresAt } from '../rules/ClassFeatures';
import { bladesongImpeded } from '../rules/Schools';
import { undeadOf } from '../systems/SummonSystem';
import { superiorityDice, superioritySides } from '../rules/Maneuvers';
import { passiveFeats } from '../rules/Build';
import { FEATS } from '../rules/Feats';
import { featName, spellName } from '../rules/Names';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

/** Top left: this far from the screen's edges, and this far apart line from line. */
const MARGIN = 8;
const LINE_H = 10;
/** The most lines there can be (a class has fewer passives than this). */
const MAX_LINES = 18;
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

type Line = { content: string; color: number };

/**
 * A wizard's school at work: the Arcane Ward's strength, the Portent dice foreseen, the Bladesong's seconds left (impeded or
 * not), the Transmuter's Stone carried and the undead raised (systems/SchoolSystem.ts, systems/SummonSystem.ts).
 */
function schoolLines(player: Player): Line[] {
  const lines: Line[] = [];
  const arcana = player.arcana;
  if (!arcana) return lines;
  if (featureOn(player, 'arcane_ward')) lines.push({ content: text('hud.passive.ward', { amount: arcana.ward }), color: READY_COLOR });
  if (featureOn(player, 'portent')) lines.push({ content: text('hud.passive.portent', { dice: arcana.portent.join(' ') || '-' }), color: READY_COLOR });
  if (arcana.songTicks > 0) {
    const impeded = bladesongImpeded(player.equipped ?? {});
    lines.push({ content: text(impeded ? 'hud.passive.bladesong_impeded' : 'hud.passive.bladesong', { seconds: secondsOf(arcana.songTicks) }), color: impeded ? THEME.muted : BOOST_COLOR });
    // The Bladesong Charges gathered for its Climax: all of them, then how many of each kind.
    const charges = { total: arcana.damageCharges + arcana.healingCharges, damage: arcana.damageCharges, healing: arcana.healingCharges };
    lines.push({ content: text('hud.passive.song_charges', charges), color: BOOST_COLOR });
  }
  if (arcana.darkvision) lines.push({ content: text('hud.passive.darkvision'), color: READY_COLOR });
  if (arcana.seeInvisible) lines.push({ content: text('hud.passive.see_invisible'), color: READY_COLOR });
  if (arcana.stone) lines.push({ content: text(arcana.stone === 'speed' ? 'hud.passive.stone_speed' : 'hud.passive.stone_constitution'), color: READY_COLOR });
  const undead = undeadOf(player);
  if (undead > 0) lines.push({ content: text('hud.passive.undead', { count: undead }), color: READY_COLOR });
  return lines;
}

/** The spells lasting on the hero (Blade Ward, Shield, Stoneskin with their seconds; Mage Armour) and the one they concentrate on. */
function spellLines(player: Player): Line[] {
  const lines: Line[] = [];
  const buffs = player.buffs;
  for (const [key, id] of BUFF_NAMES) {
    const left = buffs?.[key] ?? 0;
    if (left > 0) lines.push({ content: text('hud.passive.recovering', { name: spellName(id), seconds: secondsOf(left) }), color: BOOST_COLOR });
  }
  if ((buffs?.mageArmor ?? 0) > 0) lines.push({ content: spellName('mage_armor'), color: BOOST_COLOR });
  const held = player.concentration;
  if (held) lines.push({ content: text('hud.passive.concentration', { spell: spellName(held.spell) }), color: BOOST_COLOR });
  return lines;
}

/**
 * The passive class features that are switched on, top left corner, a line each with its name; Protection and
 * Indomitable also show the seconds left while they recover. A passive the hero switched off in the Skills tab is not
 * listed. A boost an active feature gives (Action Surge, Remarkable Athlete) is listed with its seconds left while it
 * lasts. A Battle Master's superiority dice left and the maneuver they have readied come after them.
 */
export class PassiveHud {
  readonly view = new Container();
  private readonly lines: PixelLabel[] = [];
  private shown = '';

  constructor() {
    this.view.eventMode = 'none';
    for (let i = 0; i < MAX_LINES; i++) {
      const line = new PixelLabel('', { color: READY_COLOR, outline: true });
      line.position.set(MARGIN, MARGIN + i * LINE_H);
      line.visible = false;
      this.lines.push(line);
      this.view.addChild(line);
    }
  }

  update(): void {
    const player = localPlayer();
    if (!player) return;
    const off = player.featuresOff ?? [];
    const b = player.build;
    const dice = this.diceLine(player);
    const ready = player.maneuver?.id ?? '';
    const timers = [player.protectCooldown, player.indomitableCooldown, player.actionSurge, player.athleteBoost, player.duelistCooldown].map((t) => secondsOf(t ?? 0));
    const school = [...schoolLines(player), ...spellLines(player)];
    const schoolTimers = Object.values(RECOVERING).map((left) => secondsOf(left(player)));
    const key = JSON.stringify([
      player.heroClass, player.playerStats.level, b?.fightingStyle, b?.extraStyle, b?.archetype, b?.maneuvers, b?.improvements, off, timers, dice, ready,
      player.featsOn, player.bonusAttack, school, schoolTimers,
    ]);
    if (key === this.shown) return;
    this.shown = key;
    const cls = heroClass(player.heroClass).dndClass;
    // Passives with a line of their own (the ward, Portent) are told there instead.
    const active = featuresAt(cls, player.playerStats.level, b ?? null).filter((f) => f.kind === 'passive' && f.worked && !off.includes(f.id) && !TOLD_APART.has(f.id));
    const lines: { content: string; color: number }[] = active.map((f) => {
      const left = RECOVERING[f.id]?.(player) ?? 0;
      return left > 0 ? { content: text('hud.passive.recovering', { name: f.name, seconds: secondsOf(left) }), color: THEME.muted } : { content: f.name, color: READY_COLOR };
    });
    for (const boost of BOOSTS) {
      const left = boost.left(player);
      if (left > 0) lines.push({ content: text('hud.passive.recovering', { name: featureOfClass(cls, boost.id)?.name ?? boost.id, seconds: secondsOf(left) }), color: BOOST_COLOR });
    }
    lines.push(...school, ...this.featLines(player));
    if (dice) lines.push({ content: dice, color: READY_COLOR });
    if (ready) lines.push({ content: text('hud.maneuver_ready', { name: featureOfClass(cls, ready)?.name ?? ready }), color: THEME.buttonText });
    this.lines.forEach((line, i) => {
      const entry = lines[i];
      line.visible = !!entry;
      if (!entry) return;
      line.text = entry.content;
      line.fill = entry.color;
    });
  }

  /**
   * The Passive Feats at work: a toggle one while switched on, one that works by itself (with its recovery), and Great Weapon
   * Master's earned attack, in blue, until the next swing spends it.
   */
  private featLines(player: Player): { content: string; color: number }[] {
    const lines: { content: string; color: number }[] = [];
    for (const feat of passiveFeats(heroClass(player.heroClass), player.playerStats.level, player.build)) {
      const auto = FEATS[feat].passive === 'auto';
      if (!auto && !player.featsOn?.includes(feat)) continue;
      const left = feat === 'defensive_duelist' ? player.duelistCooldown ?? 0 : 0;
      lines.push(left > 0
        ? { content: text('hud.passive.recovering', { name: featName(feat), seconds: secondsOf(left) }), color: THEME.muted }
        : { content: featName(feat), color: READY_COLOR });
    }
    if (player.bonusAttack) lines.push({ content: text('hud.bonus_attack'), color: BONUS_ATTACK_COLOR });
    return lines;
  }

  /** A Battle Master's dice left, as the line reads (empty for anyone else). */
  private diceLine(player: Player): string {
    if (player.build?.archetype !== 'battle_master') return '';
    const level = player.playerStats.level;
    return text('hud.dice', { left: player.superiorityLeft ?? superiorityDice(level), max: superiorityDice(level), sides: superioritySides(level) });
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
