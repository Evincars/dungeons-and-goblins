import { Container, Graphics, Rectangle } from 'pixi.js';
import type { FederatedWheelEvent } from 'pixi.js';
import { PixelLabel } from './PixelText';
import { wrapLines } from './InfoTooltip';
import type { TipTopic } from './InfoTooltip';
import { THEME } from './Theme';

/** A line's height, the gap before the numbers under the text, and their colour (as on a tooltip). */
const LINE_H = 10;
const DETAIL_GAP = 6;
const DETAIL_COLOR = 0x8fd18f;
/** Room kept for the scrollbar at the right, its width, and its shortest length. */
const SCROLLBAR_ROOM = 6;
const SCROLLBAR_W = 2;
const SCROLLBAR_MIN_H = 8;
const SCROLLBAR_ALPHA = 0.55;
/** Scrolling: pixels moved per unit of wheel delta (a notch is about 100 units). */
const WHEEL_STEP = 0.3;

/**
 * A long text in a box of fixed size, for a dialog: the description wrapped to the box, the numbers under it in
 * green, and the mouse wheel scrolling what does not fit (a thin bar at the right shows where it is).
 */
export class ScrollText {
  readonly view = new Container();
  private readonly content = new Container();
  private readonly scrollbar = new Graphics();
  private contentH = 0;
  private scrollY = 0;

  constructor(readonly width: number, readonly height: number) {
    const mask = new Graphics().rect(0, 0, width, height).fill({ color: 0xffffff });
    this.content.mask = mask;
    this.view.addChild(this.content, mask, this.scrollbar);
    this.view.eventMode = 'static';
    this.view.hitArea = new Rectangle(0, 0, width, height);
    this.view.on('wheel', (e: FederatedWheelEvent) => this.scroll(e.deltaY));
  }

  /** Shows the whole of `topic` (its text, then its numbers) from the top. */
  set(topic: TipTopic): void {
    for (const child of this.content.removeChildren()) child.destroy({ children: true });
    const wrap = this.width - SCROLLBAR_ROOM;
    const lines = wrapLines(topic.body, wrap);
    const body = new PixelLabel(lines.join('\n'), { color: THEME.text, shadow: true });
    this.content.addChild(body);
    this.contentH = lines.length * LINE_H;
    const details = topic.detail?.length ? wrapLines(topic.detail.join('\n'), wrap) : [];
    if (details.length) {
      const detail = new PixelLabel(details.join('\n'), { color: DETAIL_COLOR, shadow: true });
      detail.y = this.contentH + DETAIL_GAP;
      this.content.addChild(detail);
      this.contentH += DETAIL_GAP + details.length * LINE_H;
    }
    this.scrollY = 0;
    this.content.y = 0;
    this.drawScrollbar();
  }

  private get maxScroll(): number {
    return Math.max(0, this.contentH - this.height);
  }

  scroll(delta: number): void {
    const next = Math.max(0, Math.min(this.maxScroll, this.scrollY + delta * WHEEL_STEP));
    if (next === this.scrollY) return;
    this.scrollY = next;
    this.content.y = -next;
    this.drawScrollbar();
  }

  private drawScrollbar(): void {
    const g = this.scrollbar.clear();
    if (this.maxScroll <= 0) return;
    const barH = Math.max(SCROLLBAR_MIN_H, this.height * (this.height / this.contentH));
    const barY = (this.height - barH) * (this.scrollY / this.maxScroll);
    g.rect(this.width - SCROLLBAR_W, barY, SCROLLBAR_W, barH).fill({ color: THEME.control, alpha: SCROLLBAR_ALPHA });
  }
}
