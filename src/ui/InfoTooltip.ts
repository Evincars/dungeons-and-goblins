import { Container, Graphics, Rectangle } from 'pixi.js';
import { claimPointer } from '../systems/InputSystem';
import { text } from '../core/texts';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

/** Space inside the tooltip's frame, the header's height, a line's height and the gap before the details. */
const PAD = 8;
const HEADER_H = 15;
const LINE_H = 10;
const DETAIL_GAP = 4;
/** The description wraps to this width. */
const WRAP_W = 150;
/** A long text (`wide`) starts this wide, and widens by this much until it fits the area it is shown in. */
const WIDE_W = 260;
const WIDEN_STEP = 40;
/** The tooltip sits this far from the pointer. */
const OFFSET = 10;
const BG_ALPHA = 0.94;
/** The worked-out numbers under the description (how an AC or a damage roll adds up). */
const DETAIL_COLOR = 0x8fd18f;
/** The "More info" link at the bottom: the gap above it, its colour, and its colour under the pointer. */
const LINK_GAP = 4;
const LINK_COLOR = 0x9cc4ff;
const LINK_UNDERLINE_Y = 9;
/**
 * A pinned tooltip stays while the pointer, off its box, keeps getting closer to it, and this long (ms) after it last
 * did: the pointer can cross other boxes and the gaps between them on its way to the link without the tooltip turning
 * into theirs.
 */
const PIN_LINGER_MS = 300;

/** Adds one paragraph to `lines`, broken into lines no wider than `maxWidth` (a single longer word keeps its own line). */
function wrapParagraph(paragraph: string, maxWidth: number, measure: PixelLabel, lines: string[]): void {
  let line = '';
  for (const word of paragraph.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    measure.text = candidate;
    if (line && measure.textWidth > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  lines.push(line);
}

/** Breaks `content` into lines no wider than `maxWidth`; each `\n` starts a new paragraph. */
export function wrapLines(content: string, maxWidth: number): string[] {
  const measure = new PixelLabel('');
  const lines: string[] = [];
  for (const paragraph of content.split('\n')) wrapParagraph(paragraph, maxWidth, measure, lines);
  measure.destroy();
  return lines;
}

/**
 * What a tooltip tells: a header, a description, and optionally the numbers behind a value. `more`: the whole story,
 * which a "More info" link at the bottom opens in a dialog (the tooltip itself then stays short).
 */
export type TipTopic = { title: string; body: string; detail?: readonly string[]; wide?: boolean; more?: TipTopic };

type Bounds = { w: number; h: number };
type Anchor = { x: number; y: number; w: number; h: number };
/** Where a pinned tooltip sits: beside the thing it tells about (to its right, or its left where there is no room), or above it. */
export type TipSide = 'beside' | 'above';

/**
 * A tooltip for a term on the character sheet (a stat, Armor Class, hit points…): its full name as the
 * header, what it does underneath, then how the current value adds up. It keeps itself inside the area it is given.
 * One with more to tell is pinned beside what it tells about, so the pointer can move onto it and click "More info".
 */
export class InfoTooltip {
  readonly view = new Container();
  /** "More info" was clicked: the whole story is the caller's to show. */
  onMore: ((more: TipTopic) => void) | null = null;
  private shown: string | null = null;
  private more: TipTopic | null = null;
  private pointerOver = false;
  /** The box a pinned tooltip tells about; when the pointer last came closer to the tooltip off it (0: it is on it), and how far it was. */
  private pinned: Anchor | null = null;
  private leftAt = 0;
  private gap = Infinity;

  constructor() {
    this.view.visible = false;
    this.view.eventMode = 'none';
    this.view.on('pointerover', () => this.setPointerOver(true));
    this.view.on('pointerout', () => this.setPointerOver(false));
  }

  /** Whether the pointer is on the tooltip (one with a link): it stays up, and a click there is its, not the world's. */
  get hovered(): boolean {
    return this.view.visible && this.pointerOver;
  }

  private setPointerOver(over: boolean): void {
    this.pointerOver = over;
    claimPointer(this, over);
  }

  private keyOf(topic: TipTopic): string {
    return [topic.title, topic.body, ...(topic.detail ?? []), topic.more ? '+' : ''].join('\n');
  }

  /** Lays the tooltip out for `topic` unless it already shows it; returns whether it was new. */
  private prepare(topic: TipTopic, bounds: Bounds): boolean {
    const key = this.keyOf(topic);
    if (this.shown === key) return false;
    this.layout(topic, bounds);
    this.shown = key;
    this.more = topic.more ?? null;
    return true;
  }

  /** Shows `topic` near (x, y), kept inside a `bounds`-sized area starting at 0, 0. */
  show(topic: TipTopic, x: number, y: number, bounds: Bounds): void {
    this.pinned = null;
    this.prepare(topic, bounds);
    this.place(x + OFFSET, y + OFFSET, bounds);
  }

  /**
   * Whether a pinned tooltip should stay up although the pointer (at x, y, in its parent's space) is off its box:
   * for a moment after it leaves, while it may be on its way to the tooltip.
   */
  lingers(x: number, y: number, now: number): boolean {
    const box = this.pinned;
    if (!box || !this.view.visible) return false;
    if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
      this.leftAt = 0;
      this.gap = Infinity;
      return false;
    }
    const gap = this.distanceTo(x, y);
    if (this.leftAt === 0 || gap < this.gap) this.leftAt = now;
    this.gap = gap;
    return now - this.leftAt < PIN_LINGER_MS;
  }

  /** How far (x, y) is from the tooltip's edge (0 on it). */
  private distanceTo(x: number, y: number): number {
    const v = this.view;
    const dx = Math.max(v.x - x, 0, x - (v.x + v.width));
    const dy = Math.max(v.y - y, 0, y - (v.y + v.height));
    return Math.hypot(dx, dy);
  }

  /** Whether a pinned tooltip's pointer has left its box and the tooltip is waiting to see where it goes. */
  get lingering(): boolean {
    return this.view.visible && this.leftAt > 0;
  }

  /**
   * Shows `topic` pinned to `anchor` (the box it tells about): touching it on the given side, so the pointer can go
   * straight from the box onto the tooltip, and kept where it first came up while it shows the same thing.
   */
  showAt(topic: TipTopic, anchor: Anchor, bounds: Bounds, side: TipSide = 'beside'): void {
    this.leftAt = 0;
    if (!this.prepare(topic, bounds) && this.view.visible) return;
    this.pinned = { ...anchor };
    const w = this.view.width;
    const h = this.view.height;
    if (side === 'above') {
      this.place(anchor.x, anchor.y - h, bounds);
      return;
    }
    const right = anchor.x + anchor.w;
    this.place(right + w <= bounds.w ? right : anchor.x - w, anchor.y, bounds);
  }

  private place(x: number, y: number, bounds: Bounds): void {
    this.view.x = Math.round(Math.max(0, Math.min(x, bounds.w - this.view.width)));
    this.view.y = Math.round(Math.max(0, Math.min(y, bounds.h - this.view.height)));
    this.view.visible = true;
  }

  hide(): void {
    this.view.visible = false;
    this.shown = null;
    this.more = null;
    this.pinned = null;
    this.leftAt = 0;
    this.gap = Infinity;
    this.setPointerOver(false);
  }

  /** The lines of a text: at the usual width, or for a `wide` one, widened until the whole tooltip fits `bounds`. */
  private wrap(topic: TipTopic, bounds: { w: number; h: number }): { lines: string[]; details: string[] } {
    const detail = topic.detail?.length ? topic.detail.join('\n') : '';
    let width = topic.wide ? WIDE_W : WRAP_W;
    for (;;) {
      const lines = wrapLines(topic.body, width);
      const details = detail ? wrapLines(detail, width) : [];
      const height = 2 * PAD + HEADER_H + (lines.length + details.length) * LINE_H + (details.length ? DETAIL_GAP : 0);
      if (!topic.wide || height <= bounds.h || width + 2 * PAD >= bounds.w) return { lines, details };
      width += WIDEN_STEP;
    }
  }

  private layout(topic: TipTopic, bounds: { w: number; h: number }): void {
    for (const child of this.view.removeChildren()) child.destroy({ children: true });
    const header = new PixelLabel(topic.title, { color: THEME.title, shadow: true });
    header.position.set(PAD, PAD);
    const { lines, details } = this.wrap(topic, bounds);
    const body = new PixelLabel(lines.join('\n'), { color: THEME.text, shadow: true });
    body.position.set(PAD, PAD + HEADER_H);
    const detail = new PixelLabel(details.join('\n'), { color: DETAIL_COLOR, shadow: true });
    detail.position.set(PAD, PAD + HEADER_H + lines.length * LINE_H + DETAIL_GAP);
    const w = Math.max(header.textWidth, body.textWidth, detail.textWidth) + 2 * PAD;
    const textH = 2 * PAD + HEADER_H + lines.length * LINE_H + (details.length ? DETAIL_GAP + details.length * LINE_H : 0);
    const h = topic.more ? textH + LINK_GAP + LINE_H : textH;
    const frame = new Graphics()
      .rect(0, 0, w, h).fill({ color: THEME.panel, alpha: BG_ALPHA })
      .stroke({ color: THEME.panelBorder, width: 1, alignment: 1 });
    this.view.addChild(frame, header, body, detail);
    // Only a tooltip with a link listens to the pointer; the others never get in the way of what is under them.
    this.view.eventMode = topic.more ? 'static' : 'none';
    this.view.hitArea = topic.more ? new Rectangle(0, 0, w, h) : null;
    if (topic.more) this.addLink(textH - PAD + LINK_GAP);
  }

  /** "More info", underlined, at the bottom: a click opens the whole story. */
  private addLink(y: number): void {
    const link = new PixelLabel(text('spell.tip.more'), { color: LINK_COLOR, shadow: true });
    link.position.set(PAD, y);
    const underline = new Graphics().rect(PAD, y + LINK_UNDERLINE_Y, link.textWidth, 1).fill({ color: LINK_COLOR });
    const hit = new Container();
    hit.eventMode = 'static';
    hit.cursor = 'pointer';
    hit.hitArea = new Rectangle(PAD, y - 1, link.textWidth, LINE_H + 1);
    hit.on('pointerover', () => { link.fill = THEME.buttonHover; underline.tint = THEME.buttonHover; });
    hit.on('pointerout', () => { link.fill = LINK_COLOR; underline.tint = 0xffffff; });
    hit.on('pointertap', () => this.openMore());
    this.view.addChild(underline, link, hit);
  }

  private openMore(): void {
    const more = this.more;
    if (!more) return;
    this.hide();
    this.onMore?.(more);
  }
}
