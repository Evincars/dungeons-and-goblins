import { Container, Graphics } from 'pixi.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../render/Camera';
import { PixelLabel } from './PixelText';
import type { PixelTextAlign } from './PixelText';

const BACKGROUND = 0x241b18;
const BORDER = 0xd9a454;
const TEXT = 0xffffff;
const PLACEHOLDER = 0x8a7a6a;
/** Space between the border and the text, in game pixels. */
const PADDING = 6;
/** The bitmap font's glyphs are this tall. */
const GLYPH_H = 8;
/** The caret blinks at this pace while the box has focus. */
const CARET_BLINK_MS = 500;
const CARET_W = 1;

export type Box = { x: number; y: number; w: number; h: number };

export type TextBoxOptions = {
  ariaLabel: string;
  placeholder?: string;
  maxLength?: number;
  readOnly?: boolean;
  align?: PixelTextAlign;
};

/**
 * A one-line text box written in the game's bitmap font. The box and its text are drawn by Pixi (`view`,
 * which the scene adds to its container); an invisible HTML input laid over the same spot takes the
 * typing, pasting and focus, so the keyboard works as in any other web form.
 */
export class TextBox {
  readonly element = document.createElement('input');
  readonly view = new Container();
  private readonly label: PixelLabel;
  private readonly caret = new Graphics();
  private readonly placeholder: string;
  private readonly align: PixelTextAlign;
  private readonly place: () => void;
  private readonly refresh = () => this.redraw();
  private blink?: ReturnType<typeof setInterval>;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly box: Box, options: TextBoxOptions) {
    this.placeholder = options.placeholder ?? '';
    this.align = options.align ?? 'left';
    this.label = new PixelLabel('', { color: TEXT, align: this.align });
    this.buildView();
    this.buildInput(options);
    this.place = () => this.placeInput();
    window.addEventListener('resize', this.place);
    this.place();
    this.redraw();
  }

  get value(): string {
    return this.element.value;
  }

  set value(text: string) {
    this.element.value = text;
    this.redraw();
  }

  set visible(on: boolean) {
    this.element.style.display = on ? '' : 'none';
    this.view.visible = on;
    if (on) this.place();
  }

  private buildView(): void {
    const { x, y, w, h } = this.box;
    this.view.position.set(x, y);
    const frame = new Graphics().rect(0, 0, w, h).fill({ color: BACKGROUND }).stroke({ color: BORDER, width: 1, alignment: 1 });
    // Text longer than the box is clipped to its inside.
    const clip = new Graphics().rect(PADDING / 2, 0, w - PADDING, h).fill({ color: 0xffffff });
    this.label.y = Math.floor((h - GLYPH_H) / 2);
    this.label.mask = clip;
    this.caret.rect(0, 0, CARET_W, GLYPH_H).fill({ color: TEXT });
    this.caret.y = this.label.y;
    this.caret.visible = false;
    this.view.addChild(frame, clip, this.label, this.caret);
  }

  /** The real input: transparent, caret and all, so only the bitmap text shows. */
  private buildInput(options: TextBoxOptions): void {
    const input = this.element;
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.readOnly = options.readOnly ?? false;
    if (options.maxLength) input.maxLength = options.maxLength;
    input.setAttribute('aria-label', options.ariaLabel);
    input.style.cssText = 'position:fixed;box-sizing:border-box;margin:0;padding:0;border:none;outline:none;'
      + 'background:transparent;color:transparent;caret-color:transparent;z-index:10';
    // Typing here must not walk the character or open menus.
    input.addEventListener('keydown', (event) => {
      if (event.code !== 'Escape') event.stopPropagation();
      if (event.code === 'Enter') input.blur();
    });
    input.addEventListener('input', this.refresh);
    input.addEventListener('focus', () => this.setFocused(true));
    input.addEventListener('blur', () => this.setFocused(false));
    document.body.appendChild(input);
  }

  /** Keeps the HTML input over the box, however the page is scaled. */
  private placeInput(): void {
    const rect = this.canvas.getBoundingClientRect();
    const sx = rect.width / GAME_WIDTH;
    const sy = rect.height / GAME_HEIGHT;
    const s = this.element.style;
    s.left = `${rect.left + this.box.x * sx}px`;
    s.top = `${rect.top + this.box.y * sy}px`;
    s.width = `${this.box.w * sx}px`;
    s.height = `${this.box.h * sy}px`;
  }

  private setFocused(on: boolean): void {
    clearInterval(this.blink);
    this.blink = on ? setInterval(() => { this.caret.visible = !this.caret.visible; }, CARET_BLINK_MS) : undefined;
    this.caret.visible = on && !this.element.readOnly;
    this.redraw();
  }

  /** Shows the typed text (or the placeholder), keeping its end in view while it is being typed. */
  private redraw(): void {
    const empty = this.element.value === '';
    const typing = document.activeElement === this.element;
    this.label.text = empty && !typing ? this.placeholder : this.element.value;
    this.label.fill = empty ? PLACEHOLDER : TEXT;
    const w = this.label.textWidth;
    const left = this.textLeft(w, typing);
    this.label.x = left + this.anchorShift(w);
    this.caret.x = left + (empty ? 0 : w + 1);
  }

  /** Where the text's left edge goes: by the alignment, or so its end shows once it outgrows the box. */
  private textLeft(w: number, typing: boolean): number {
    const inner = this.box.w - PADDING * 2;
    if (w > inner) return typing ? PADDING + inner - w : PADDING;
    if (this.align === 'center') return Math.floor((this.box.w - w) / 2);
    if (this.align === 'right') return PADDING + inner - w;
    return PADDING;
  }

  /** PixelLabel sets centred text out from its middle and right-aligned text back from its end. */
  private anchorShift(w: number): number {
    if (this.align === 'center') return Math.floor(w / 2);
    if (this.align === 'right') return w;
    return 0;
  }

  destroy(): void {
    clearInterval(this.blink);
    window.removeEventListener('resize', this.place);
    this.element.remove();
    this.view.destroy({ children: true });
  }
}
