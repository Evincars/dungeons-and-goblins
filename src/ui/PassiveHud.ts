import { Container } from 'pixi.js';
import { localPlayer } from '../world';
import { text } from '../core/texts';
import { TICKS_PER_SECOND } from '../rules/Spells';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

/** Top left: this far from the screen's edges. */
const MARGIN = 8;
/** A passive that is ready is shown in this colour; one that is recovering is dimmed. */
const READY_COLOR = THEME.title;

/**
 * The passive abilities, top left corner: for now the Protection fighting style, a line with its name and, while
 * it recovers, the seconds left. Nothing is shown for a hero without it.
 */
export class PassiveHud {
  readonly view = new Container();
  private readonly protection = new PixelLabel('', { color: READY_COLOR, outline: true });
  private shown = '';

  constructor() {
    this.view.eventMode = 'none';
    this.protection.position.set(MARGIN, MARGIN);
    this.protection.visible = false;
    this.view.addChild(this.protection);
  }

  update(): void {
    const player = localPlayer();
    const has = player?.build?.fightingStyle === 'protection';
    this.protection.visible = has;
    if (!player || !has) return;
    const left = player.protectCooldown ?? 0;
    const line = left > 0 ? text('style.passive.recovering', { seconds: (left / TICKS_PER_SECOND).toFixed(1) }) : text('style.passive.ready');
    if (line === this.shown) return;
    this.shown = line;
    this.protection.text = line;
    this.protection.fill = left > 0 ? THEME.muted : READY_COLOR;
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
