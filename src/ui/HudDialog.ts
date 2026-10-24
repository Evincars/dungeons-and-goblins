import { Container, Graphics, Rectangle } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../render/Camera';
import { claimPointer } from '../systems/InputSystem';
import { PixelLabel } from './PixelText';
import { wrapLines } from './InfoTooltip';
import { THEME } from './Theme';
import { sound } from '../audio/SoundPlayer';

/** A dialog's size when it shows text, its header band, the padding inside it and the close button in the header's corner. */
const TEXT_W = 220;
const TEXT_H = 110;
const HEADER_H = 16;
const PAD = 8;
const CLOSE = 12;
const BG_ALPHA = 0.96;
/** It sits a little above the middle of the screen, clear of the HUD. */
const RAISE = 24;

/**
 * A plain dialog opened from the HUD's buttons: a header with the title and a close button, and the content
 * underneath — a line of text, or a view of its own (the map). The ✕ (or Escape) closes it; clicks on it
 * are never taken for attacks.
 */
export class HudDialog {
  readonly container = new Container();
  private readonly frame = new Graphics();
  private readonly title = new PixelLabel('', { color: THEME.title, shadow: true });
  private readonly body = new PixelLabel('', { color: THEME.text, shadow: true });
  private readonly content = new Container();
  private readonly closeMark = new PixelLabel('x', { color: THEME.muted, align: 'center', shadow: true });
  private readonly close = new Container();
  private view: Container | null = null;

  constructor() {
    this.container.visible = false;
    this.container.eventMode = 'static';
    this.container.on('pointerover', () => claimPointer(this, true));
    this.container.on('pointerout', () => claimPointer(this, false));
    this.title.position.set(PAD, Math.round((HEADER_H - 8) / 2));
    this.content.position.set(PAD, HEADER_H + PAD);
    this.content.addChild(this.body);
    this.buildClose();
    this.container.addChild(this.frame, this.title, this.content, this.close);
  }

  private buildClose(): void {
    const glow = new Graphics().rect(0, 0, CLOSE, CLOSE).fill({ color: 0xffffff, alpha: 0.12 });
    glow.visible = false;
    this.closeMark.position.set(CLOSE / 2, 2);
    this.close.addChild(glow, this.closeMark);
    this.close.eventMode = 'static';
    this.close.cursor = 'pointer';
    this.close.hitArea = new Rectangle(0, 0, CLOSE, CLOSE);
    this.close.on('pointerover', () => { glow.visible = true; this.closeMark.fill = THEME.buttonHover; });
    this.close.on('pointerout', () => { glow.visible = false; this.closeMark.fill = THEME.muted; });
    this.close.on('pointertap', () => this.hide());
  }

  get open(): boolean {
    return this.container.visible;
  }

  /** Whether the dialog is up showing this view. */
  showing(view: Container): boolean {
    return this.container.visible && this.view === view;
  }

  /** Opens it with a line of text, or with a view of its own `width` × `height` (game pixels). */
  show(title: string, content: string | Container, width = TEXT_W - 2 * PAD, height = TEXT_H - HEADER_H - 2 * PAD): void {
    if (this.view) this.content.removeChild(this.view);
    this.view = typeof content === 'string' ? null : content;
    this.body.visible = !this.view;
    if (this.view) this.content.addChild(this.view);
    else this.body.text = wrapLines(typeof content === 'string' ? content : '', width).join('\n');
    this.layout(width + 2 * PAD, height + HEADER_H + 2 * PAD);
    this.title.text = title;
    if (!this.container.visible) sound.playLocal('dialog');
    this.container.visible = true;
  }

  private layout(w: number, h: number): void {
    this.container.position.set(Math.round((GAME_WIDTH - w) / 2), Math.round(Math.max(4, (GAME_HEIGHT - h) / 2 - RAISE)));
    this.container.hitArea = new Rectangle(0, 0, w, h);
    this.frame.clear()
      .rect(0, 0, w, h).fill({ color: THEME.panel, alpha: BG_ALPHA }).stroke({ color: THEME.panelBorder, width: 1, alignment: 1 })
      .rect(0, 0, w, HEADER_H).fill({ color: THEME.row });
    this.close.position.set(w - CLOSE - 2, Math.round((HEADER_H - CLOSE) / 2));
  }

  /** Closes it; returns whether it was open (so Escape is used up only then). */
  hide(): boolean {
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
