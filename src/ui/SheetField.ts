import { Container, Graphics, Rectangle } from 'pixi.js';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

/** Height of the field's caption band (its caption this far down it), and the accent line under it. */
const CAPTION_H = 13;
const CAPTION_Y = 3;
const ACCENT_H = 1;
const WELL_ALPHA = 0.9;
const GLYPH_H = 8;

/**
 * A read-only field of the character sheet (Armor Class, hit points, damage): a dark well with its short name in a
 * caption band and its value underneath, in the field's own accent colour; plain colours, no edges.
 */
export class SheetField {
  readonly view = new Container();
  /** The area that shows the field's tooltip. */
  readonly hit: Rectangle;
  private readonly value: PixelLabel;

  constructor(caption: string, x: number, y: number, w: number, h: number, accent: number) {
    this.hit = new Rectangle(x, y, w, h);
    this.view.addChild(frame(w, h, accent));
    const label = new PixelLabel(caption, { color: THEME.title, align: 'center', shadow: true });
    label.position.set(Math.round(w / 2), CAPTION_Y);
    this.value = new PixelLabel('', { color: accent, align: 'center', shadow: true });
    this.value.position.set(Math.round(w / 2), Math.round(CAPTION_H + ACCENT_H + (h - CAPTION_H - ACCENT_H - GLYPH_H) / 2));
    this.view.addChild(label, this.value);
    this.view.position.set(x, y);
  }

  set(value: string): void {
    this.value.text = value;
  }
}

/** The box: a dark well, a caption band over it underlined in the accent. */
function frame(w: number, h: number, accent: number): Graphics {
  return new Graphics()
    .rect(0, 0, w, h).fill({ color: THEME.well, alpha: WELL_ALPHA })
    .rect(0, 0, w, CAPTION_H).fill({ color: THEME.row })
    .rect(0, CAPTION_H, w, ACCENT_H).fill({ color: accent });
}
