import { Container } from 'pixi.js';
import { localPlayer } from '../world';
import { text } from '../core/texts';
import { TICKS_PER_SECOND } from '../rules/Spells';
import { heroClass } from '../rules/Classes';
import { featuresAt } from '../rules/ClassFeatures';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

/** Top left: this far from the screen's edges, and this far apart line from line. */
const MARGIN = 8;
const LINE_H = 10;
/** The most lines there can be (a class has fewer passives than this). */
const MAX_LINES = 12;
/** A passive that is ready is shown in this colour; one that is recovering is dimmed. */
const READY_COLOR = THEME.title;
/** Protection is the passive that needs time to recover between uses. */
const PROTECTION = 'protection';

/**
 * The passive class features that are switched on, top left corner, a line each with its name; Protection also
 * shows the seconds left while it recovers. A passive the hero switched off in the Skills tab is not listed.
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
    const key = `${player.heroClass}/${player.playerStats.level}/${player.build?.fightingStyle ?? ''}/${off.join(',')}/${seconds}`;
    if (key === this.shown) return;
    this.shown = key;
    const style = player.build?.fightingStyle ?? null;
    const active = featuresAt(heroClass(player.heroClass).dndClass, player.playerStats.level, style)
      .filter((f) => f.kind === 'passive' && f.worked && !off.includes(f.id));
    this.lines.forEach((line, i) => {
      const feature = active[i];
      line.visible = !!feature;
      if (!feature) return;
      const recovering = feature.id === PROTECTION && left > 0;
      line.text = recovering ? text('style.passive.recovering', { seconds: seconds.toFixed(1) }) : feature.name;
      line.fill = recovering ? THEME.muted : READY_COLOR;
    });
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
