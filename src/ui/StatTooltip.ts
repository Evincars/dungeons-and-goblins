import { Container, Graphics } from 'pixi.js';
import type { StatName } from '../world';
import { statDescription, statName } from '../entities/Items';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

/** Space inside the tooltip's frame, the header's height and the height of a line of description. */
const PAD = 8;
const HEADER_H = 15;
const LINE_H = 10;
/** The description wraps to this width. */
const WRAP_W = 130;
/** The tooltip sits this far from the pointer. */
const OFFSET = 10;
const BG_ALPHA = 0.94;

/** Breaks `content` into lines no wider than `maxWidth` (a single longer word keeps its own line). */
function wrapLines(content: string, maxWidth: number): string[] {
  const measure = new PixelLabel('');
  const lines: string[] = [];
  let line = '';
  for (const word of content.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    measure.text = candidate;
    if (line && measure.textWidth > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  measure.destroy();
  return line ? [...lines, line] : lines;
}

/**
 * A tooltip for a stat: its full name as the header and what it does underneath. Show it over a stat's
 * short name; it keeps itself inside the area it is given.
 */
export class StatTooltip {
  readonly view = new Container();
  private shown: StatName | null = null;

  constructor() {
    this.view.visible = false;
    this.view.eventMode = 'none';
  }

  /** Shows the tooltip for `stat` near (x, y), kept inside a `bounds`-sized area starting at 0, 0. */
  show(stat: StatName, x: number, y: number, bounds: { w: number; h: number }): void {
    if (this.shown !== stat) this.layout(stat);
    this.shown = stat;
    const w = this.view.width;
    const h = this.view.height;
    this.view.x = Math.round(Math.min(x + OFFSET, bounds.w - w));
    this.view.y = Math.round(Math.max(0, Math.min(y + OFFSET, bounds.h - h)));
    this.view.visible = true;
  }

  hide(): void {
    this.view.visible = false;
    this.shown = null;
  }

  private layout(stat: StatName): void {
    for (const child of this.view.removeChildren()) child.destroy({ children: true });
    const header = new PixelLabel(statName(stat), { color: THEME.title, shadow: true });
    header.position.set(PAD, PAD);
    const lines = wrapLines(statDescription(stat), WRAP_W);
    const body = new PixelLabel(lines.join('\n'), { color: THEME.text, shadow: true });
    body.position.set(PAD, PAD + HEADER_H);
    const w = Math.max(header.textWidth, body.textWidth) + 2 * PAD;
    const h = 2 * PAD + HEADER_H + lines.length * LINE_H;
    const frame = new Graphics()
      .rect(0, 0, w, h).fill({ color: THEME.panel, alpha: BG_ALPHA })
      .stroke({ color: THEME.panelBorder, width: 1, alignment: 1 });
    this.view.addChild(frame, header, body);
  }
}
