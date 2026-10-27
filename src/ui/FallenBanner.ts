import { Container, Graphics } from 'pixi.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../render/Camera';
import { text } from '../core/texts';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

/** The banner's top edge (in the lower part of the screen, clear of the party's banner), its padding and line height. */
const TOP = Math.round(GAME_HEIGHT * 0.7);
const PAD = 5;
const LINE = 11;
const BAND_ALPHA = 0.65;
const TITLE_COLOR = 0xff6b5a;
const HINT_COLOR = THEME.muted;

/**
 * A fallen hero's screen in co-op: that they have fallen, that they will rise again should a companion reach the exit's
 * safe room, whom they are watching, and that the mouse buttons pick another companion to watch.
 */
export class FallenBanner {
  readonly view = new Container();
  private readonly band = new Graphics();
  private readonly title = new PixelLabel(text('game.fallen.title'), { color: TITLE_COLOR, align: 'center', outline: true, scale: 2 });
  private readonly respawn = new PixelLabel(text('game.fallen.respawn'), { color: THEME.text, align: 'center', outline: true });
  private readonly watching = new PixelLabel('', { color: THEME.title, align: 'center', outline: true });
  private readonly hint = new PixelLabel(text('game.fallen.switch'), { color: HINT_COLOR, align: 'center', outline: true });
  private shown: string | null = null;

  constructor() {
    this.view.visible = false;
    this.view.eventMode = 'none';
    const x = Math.round(GAME_WIDTH / 2);
    this.title.position.set(x, TOP + PAD);
    this.respawn.position.set(x, TOP + PAD + 2 * LINE);
    this.watching.position.set(x, TOP + PAD + 3 * LINE);
    this.hint.position.set(x, TOP + PAD + 4 * LINE);
    this.view.addChild(this.band, this.title, this.respawn, this.watching, this.hint);
  }

  /** Shows the banner, saying whom the screen follows (`watched`: a companion's name, or null for the hero's own body). */
  show(watched: string | null, companionsLeft: boolean): void {
    this.view.visible = true;
    const line = watched === null ? text('game.fallen.own_body') : text('game.fallen.watching', { name: watched });
    const key = `${line}/${companionsLeft}`;
    if (key === this.shown) return;
    this.shown = key;
    this.watching.text = line;
    this.hint.visible = companionsLeft;
    const w = Math.max(this.title.textWidth, this.respawn.textWidth, this.hint.textWidth, this.watching.textWidth) + 2 * PAD;
    const h = 2 * PAD + 5 * LINE;
    this.band.clear().rect(Math.round((GAME_WIDTH - w) / 2), TOP, w, h).fill({ color: 0x000000, alpha: BAND_ALPHA });
  }

  hide(): void {
    this.view.visible = false;
  }
}
