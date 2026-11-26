import { Container, Graphics, NineSliceSprite } from 'pixi.js';
import { frameTexture } from '../render/Sheets';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';
import { sound } from '../audio/SoundPlayer';

const BUTTON_W = 128;
const BUTTON_H = 24;
const NORMAL_COLOR = THEME.buttonText;
const HOVER_COLOR = THEME.buttonHover;
/** A disabled button's label, and the tint that darkens its art: it reads as out of reach at a glance. */
const DISABLED_COLOR = 0x5f6670;
const DISABLED_TINT = 0x6e6e6e;
/** A chosen button (a picked feat, spell, style…): a gold frame and a gold label, in place of brackets round its name. */
const SELECTED_COLOR = THEME.title;
/** The steel version of Redux's button art (see AssetLoader). */
const SHEET = 'button_steel';
/** Border of the stone frame in the button art, kept unstretched (less on a button too small for two of them). */
const BORDER = 8;
/** Frame rows in button.png. */
const STATE_NORMAL = 0;
const STATE_HOVER = 1;
const STATE_DISABLED = 2;
/** The light laid over a button under the pointer: a pale frame just inside its rim and a faint glow over its face. */
const RIM_INSET = 1;
const GLOW_INSET = 3;
const HOVER_RIM_ALPHA = 0.55;
const HOVER_GLOW_ALPHA = 0.1;
const SELECTED_RIM_ALPHA = 0.95;
const SELECTED_GLOW_ALPHA = 0.12;
/** A coloured stripe down a button's left edge says what kind of thing it is (a cantrip, a spell…). */
const ACCENT_X = 3;
const ACCENT_W = 2;
const ACCENT_INSET = 4;

/** A button drawn from the original's three-state button art, lit under the pointer, dimmed when disabled, framed in gold when chosen. */
export class PixelButton extends Container {
  private bg: NineSliceSprite;
  private btnLabel: PixelLabel;
  /** The hover and chosen light, and the kind's stripe, drawn over the art. */
  private readonly light = new Graphics();
  private readonly w: number;
  private readonly h: number;
  private _hovered = false;
  private _enabled = true;
  private _selected = false;
  private accent: number | null = null;

  onPress: (() => void) | null = null;

  constructor(text: string, width = BUTTON_W, height = BUTTON_H) {
    super();
    this.w = width;
    this.h = height;

    const side = Math.min(BORDER, Math.floor(width / 2));
    const cap = Math.min(BORDER, Math.floor(height / 2));
    this.bg = new NineSliceSprite({
      texture: frameTexture(SHEET, 0, STATE_NORMAL),
      leftWidth: side,
      topHeight: cap,
      rightWidth: side,
      bottomHeight: cap,
      width,
      height,
    });
    this.light.eventMode = 'none';
    this.addChild(this.bg, this.light);

    this.btnLabel = new PixelLabel(text.toUpperCase(), {
      color: NORMAL_COLOR,
      scale: height >= 30 ? 2 : 1,
      align: 'center',
      shadow: true,
    });
    this.addChild(this.btnLabel);
    this.positionLabel();

    this.eventMode = 'static';
    this.cursor = 'pointer';

    this.on('pointerover', () => {
      this._hovered = true;
      this.refresh();
    });
    this.on('pointerout', () => {
      this._hovered = false;
      this.refresh();
    });
    this.on('pointertap', () => {
      if (!this._enabled || !this.onPress) return;
      sound.playLocal('click');
      this.onPress();
    });
  }

  /** Whether the pointer is over the button now. */
  get hovered(): boolean {
    return this._hovered;
  }

  private positionLabel(): void {
    this.btnLabel.x = Math.round(this.w / 2);
    this.btnLabel.y = Math.round((this.h - this.btnLabel.textHeight + 1) / 2);
  }

  private refresh(): void {
    const lit = this._hovered && this._enabled;
    const state = !this._enabled ? STATE_DISABLED : lit ? STATE_HOVER : STATE_NORMAL;
    this.bg.texture = frameTexture(SHEET, 0, state);
    this.bg.tint = this._enabled ? 0xffffff : DISABLED_TINT;
    this.btnLabel.fill = this.labelColor(lit);
    this.cursor = this._enabled ? 'pointer' : 'default';
    this.drawLight(lit);
  }

  private labelColor(lit: boolean): number {
    if (!this._enabled) return DISABLED_COLOR;
    if (this._selected) return SELECTED_COLOR;
    return lit ? HOVER_COLOR : NORMAL_COLOR;
  }

  /** The rim and glow (gold when chosen, pale under the pointer) and the kind's stripe. */
  private drawLight(lit: boolean): void {
    const g = this.light.clear();
    if (this._selected || lit) {
      const color = this._selected ? SELECTED_COLOR : HOVER_COLOR;
      g.rect(GLOW_INSET, GLOW_INSET, this.w - 2 * GLOW_INSET, this.h - 2 * GLOW_INSET)
        .fill({ color, alpha: this._selected ? SELECTED_GLOW_ALPHA : HOVER_GLOW_ALPHA });
      g.rect(RIM_INSET + 0.5, RIM_INSET + 0.5, this.w - 2 * RIM_INSET - 1, this.h - 2 * RIM_INSET - 1)
        .stroke({ color, alpha: this._selected ? SELECTED_RIM_ALPHA : HOVER_RIM_ALPHA, width: 1 });
    }
    if (this.accent === null) return;
    g.rect(ACCENT_X, ACCENT_INSET, ACCENT_W, this.h - 2 * ACCENT_INSET).fill({ color: this.accent, alpha: this._enabled ? 1 : 0.4 });
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    this.refresh();
  }

  /** Marks the button as the one chosen (a gold frame and label). */
  setSelected(selected: boolean): void {
    this._selected = selected;
    this.refresh();
  }

  /** A stripe of this colour down the left edge, saying what kind of thing the button stands for (null: none). */
  setAccent(color: number | null): void {
    this.accent = color;
    this.refresh();
  }

  setText(text: string): void {
    this.btnLabel.text = text.toUpperCase();
    this.positionLabel();
  }
}
