import { Container } from 'pixi.js';
import { localPlayer } from '../world';
import type { Player } from '../world';
import { text } from '../core/texts';
import { TICKS_PER_SECOND } from '../rules/Spells';
import { heroClass } from '../rules/Classes';
import { featureOfClass, featuresAt } from '../rules/ClassFeatures';
import { superiorityDice, superioritySides } from '../rules/Maneuvers';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

/** Top left: this far from the screen's edges, and this far apart line from line. */
const MARGIN = 8;
const LINE_H = 10;
/** The most lines there can be (a class has fewer passives than this). */
const MAX_LINES = 14;
/** A passive that is ready is shown in this colour; one that is recovering is dimmed. */
const READY_COLOR = THEME.title;
/** Protection is the passive that needs time to recover between uses. */
const PROTECTION = 'protection';

/**
 * The passive class features that are switched on, top left corner, a line each with its name; Protection also
 * shows the seconds left while it recovers. A passive the hero switched off in the Skills tab is not listed. A Battle
 * Master's superiority dice left and the maneuver they have readied come after them.
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
    const left = player.protectCooldown ?? 0;
    const seconds = Math.ceil((left / TICKS_PER_SECOND) * 10) / 10;
    const off = player.featuresOff ?? [];
    const b = player.build;
    const dice = this.diceLine(player);
    const ready = player.maneuver?.id ?? '';
    const key = JSON.stringify([player.heroClass, player.playerStats.level, b?.fightingStyle, b?.extraStyle, b?.archetype, b?.maneuvers, off, seconds, dice, ready]);
    if (key === this.shown) return;
    this.shown = key;
    const cls = heroClass(player.heroClass).dndClass;
    const active = featuresAt(cls, player.playerStats.level, b ?? null).filter((f) => f.kind === 'passive' && f.worked && !off.includes(f.id));
    const lines: { content: string; color: number }[] = active.map((f) => (f.id === PROTECTION && left > 0
      ? { content: text('style.passive.recovering', { seconds: seconds.toFixed(1) }), color: THEME.muted }
      : { content: f.name, color: READY_COLOR }));
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
