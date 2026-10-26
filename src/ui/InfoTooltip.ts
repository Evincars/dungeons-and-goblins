import { Container, Graphics } from 'pixi.js';
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

/** What a tooltip tells: a header, a description, and optionally the numbers behind a value. */
export type TipTopic = { title: string; body: string; detail?: readonly string[]; wide?: boolean };

/**
 * A tooltip for a term on the character sheet (a stat, Armor Class, hit points…): its full name as the
 * header, what it does underneath, then how the current value adds up. It keeps itself inside the area it is given.
 */
export class InfoTooltip {
  readonly view = new Container();
  private shown: string | null = null;

  constructor() {
    this.view.visible = false;
    this.view.eventMode = 'none';
  }

  /** Shows `topic` near (x, y), kept inside a `bounds`-sized area starting at 0, 0. */
  show(topic: TipTopic, x: number, y: number, bounds: { w: number; h: number }): void {
    const key = [topic.title, topic.body, ...(topic.detail ?? [])].join('\n');
    if (this.shown !== key) this.layout(topic, bounds);
    this.shown = key;
    const w = this.view.width;
    const h = this.view.height;
    this.view.x = Math.round(Math.max(0, Math.min(x + OFFSET, bounds.w - w)));
    this.view.y = Math.round(Math.max(0, Math.min(y + OFFSET, bounds.h - h)));
    this.view.visible = true;
  }

  hide(): void {
    this.view.visible = false;
    this.shown = null;
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
    const h = 2 * PAD + HEADER_H + lines.length * LINE_H + (details.length ? DETAIL_GAP + details.length * LINE_H : 0);
    const frame = new Graphics()
      .rect(0, 0, w, h).fill({ color: THEME.panel, alpha: BG_ALPHA })
      .stroke({ color: THEME.panelBorder, width: 1, alignment: 1 });
    this.view.addChild(frame, header, body, detail);
  }
}
