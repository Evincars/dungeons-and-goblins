import { Container, Graphics, Rectangle } from 'pixi.js';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

/** Height of the field's caption band, and the bevel lines along its edges. */
const CAPTION_H = 10;
const BEVEL = 1;
const WELL_ALPHA = 0.9;
const BEVEL_LIGHT_ALPHA = 0.5;
const BEVEL_DARK_ALPHA = 0.8;
const GLYPH_H = 8;

/**
 * A read-only field of the character sheet (Armor Class, hit points, damage): a sunken steel box with its
 * short name in a caption band and its value underneath, in the field's own accent colour.
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
    label.position.set(Math.round(w / 2), 1);
    this.value = new PixelLabel('', { color: accent, align: 'center', shadow: true });
    this.value.position.set(Math.round(w / 2), Math.round(CAPTION_H + (h - CAPTION_H - GLYPH_H) / 2));
    this.view.addChild(label, this.value);
    this.view.position.set(x, y);
  }

  set(value: string): void {
    this.value.text = value;
  }
}

/** The box: a dark well, a lit top-left and shaded bottom-right edge, and a caption band underlined in the accent. */
function frame(w: number, h: number, accent: number): Graphics {
  return new Graphics()
    .rect(0, 0, w, h).fill({ color: THEME.well, alpha: WELL_ALPHA })
    .rect(0, 0, w, CAPTION_H).fill({ color: THEME.row })
    .rect(0, CAPTION_H, w, BEVEL).fill({ color: accent })
    .rect(0, 0, w, BEVEL).fill({ color: THEME.control, alpha: BEVEL_LIGHT_ALPHA })
    .rect(0, 0, BEVEL, h).fill({ color: THEME.control, alpha: BEVEL_LIGHT_ALPHA })
    .rect(0, h - BEVEL, w, BEVEL).fill({ color: 0x000000, alpha: BEVEL_DARK_ALPHA })
    .rect(w - BEVEL, 0, BEVEL, h).fill({ color: 0x000000, alpha: BEVEL_DARK_ALPHA })
    .rect(-BEVEL, -BEVEL, w + 2 * BEVEL, h + 2 * BEVEL).stroke({ color: THEME.panelBorder, width: 1, alignment: 1 });
}
