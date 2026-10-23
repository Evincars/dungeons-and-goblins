import { Container, Graphics, Rectangle } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../render/Camera';
import { claimPointer } from '../systems/InputSystem';
import { PixelLabel } from './PixelText';
import { wrapLines } from './InfoTooltip';
import { THEME } from './Theme';

/** The dialog's size, its header band, the padding inside it and the close button in the header's corner. */
const W = 220;
const H = 110;
const HEADER_H = 16;
const PAD = 8;
const CLOSE = 12;
const BG_ALPHA = 0.96;
/** It sits a little above the middle of the screen, clear of the HUD. */
const RAISE = 24;

/**
 * A plain dialog opened from the HUD's buttons: a header with the title and a close button, and the content
 * underneath. The ✕ (or Escape) closes it; clicks on it are never taken for attacks.
 */
export class HudDialog {
  readonly container = new Container();
  private readonly title = new PixelLabel('', { color: THEME.title, shadow: true });
  private readonly body = new PixelLabel('', { color: THEME.text, shadow: true });
  private readonly closeMark = new PixelLabel('x', { color: THEME.muted, align: 'center', shadow: true });

  constructor() {
    const x = Math.round((GAME_WIDTH - W) / 2);
    const y = Math.round((GAME_HEIGHT - H) / 2 - RAISE);
    this.container.position.set(x, y);
    this.container.visible = false;
    this.container.eventMode = 'static';
    this.container.hitArea = new Rectangle(0, 0, W, H);
    this.container.on('pointerover', () => claimPointer(this, true));
    this.container.on('pointerout', () => claimPointer(this, false));
    const frame = new Graphics()
      .rect(0, 0, W, H).fill({ color: THEME.panel, alpha: BG_ALPHA }).stroke({ color: THEME.panelBorder, width: 1, alignment: 1 })
      .rect(0, 0, W, HEADER_H).fill({ color: THEME.row });
    this.title.position.set(PAD, Math.round((HEADER_H - 8) / 2));
    this.body.position.set(PAD, HEADER_H + PAD);
    this.container.addChild(frame, this.title, this.body, this.closeButton());
  }

  private closeButton(): Container {
    const button = new Container();
    button.position.set(W - CLOSE - 2, Math.round((HEADER_H - CLOSE) / 2));
    const glow = new Graphics().rect(0, 0, CLOSE, CLOSE).fill({ color: 0xffffff, alpha: 0.12 });
    glow.visible = false;
    this.closeMark.position.set(CLOSE / 2, 2);
    button.addChild(glow, this.closeMark);
    button.eventMode = 'static';
    button.cursor = 'pointer';
    button.hitArea = new Rectangle(0, 0, CLOSE, CLOSE);
    button.on('pointerover', () => { glow.visible = true; this.closeMark.fill = THEME.buttonHover; });
    button.on('pointerout', () => { glow.visible = false; this.closeMark.fill = THEME.muted; });
    button.on('pointertap', () => this.close());
    return button;
  }

  get open(): boolean {
    return this.container.visible;
  }

  show(title: string, content: string): void {
    this.title.text = title;
    this.body.text = wrapLines(content, W - 2 * PAD).join('\n');
    this.container.visible = true;
  }

  /** Closes it; returns whether it was open (so Escape is used up only then). */
  close(): boolean {
    const wasOpen = this.container.visible;
    this.container.visible = false;
    claimPointer(this, false);
    return wasOpen;
  }

  destroy(): void {
    claimPointer(this, false);
    this.container.destroy({ children: true });
  }
}
