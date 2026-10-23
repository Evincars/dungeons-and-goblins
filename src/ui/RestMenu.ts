import { Container, Graphics, Rectangle } from 'pixi.js';
import { REST_KINDS } from '../world';
import type { RestKind } from '../world';
import { claimPointer } from '../systems/InputSystem';
import { currentRest, requestRest, SHORT_RESTS_PER_LONG_REST } from '../game/Rest';
import { text } from '../core/texts';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

/** The menu's rows: this wide and tall, with this padding round the text. */
const ROW_W = 104;
const ROW_H = 12;
const PAD = 4;
const BG_ALPHA = 0.94;
const HOVER_ALPHA = 0.12;

type Row = { kind: RestKind; label: PixelLabel };

/**
 * The rest button's drop-down: a short rest (with how many are left before a long one is needed) or a long
 * rest. Picking one asks the party for it (game/Rest.ts); the screen then says how it went.
 */
export class RestMenu {
  readonly view = new Container();
  private readonly rows: Row[] = [];

  /** `x`, `y`: the menu's bottom-left corner (it opens upwards, over the button). */
  constructor(x: number, y: number) {
    this.view.visible = false;
    this.view.eventMode = 'static';
    const h = REST_KINDS.length * ROW_H + 2;
    this.view.position.set(x, y - h);
    this.view.hitArea = new Rectangle(0, 0, ROW_W, h);
    this.view.on('pointerover', () => claimPointer(this, true));
    this.view.on('pointerout', () => claimPointer(this, false));
    this.view.addChild(new Graphics().rect(0, 0, ROW_W, h).fill({ color: THEME.panel, alpha: BG_ALPHA }).stroke({ color: THEME.panelBorder, width: 1, alignment: 1 }));
    REST_KINDS.forEach((kind, i) => this.addRow(kind, i));
  }

  private addRow(kind: RestKind, i: number): void {
    const row = new Container();
    row.position.set(1, 1 + i * ROW_H);
    const glow = new Graphics().rect(0, 0, ROW_W - 2, ROW_H).fill({ color: 0xffffff, alpha: HOVER_ALPHA });
    glow.visible = false;
    const label = new PixelLabel('', { color: THEME.text, shadow: true });
    label.position.set(PAD, Math.round((ROW_H - 8) / 2));
    row.addChild(glow, label);
    row.eventMode = 'static';
    row.cursor = 'pointer';
    row.hitArea = new Rectangle(0, 0, ROW_W - 2, ROW_H);
    row.on('pointerover', () => { glow.visible = true; label.fill = THEME.buttonHover; });
    row.on('pointerout', () => { glow.visible = false; label.fill = THEME.text; });
    row.on('pointertap', () => {
      requestRest(kind);
      this.hide();
    });
    this.rows.push({ kind, label });
    this.view.addChild(row);
  }

  get open(): boolean {
    return this.view.visible;
  }

  toggle(): void {
    if (this.view.visible) {
      this.hide();
      return;
    }
    const left = currentRest()?.shortRestsLeft ?? SHORT_RESTS_PER_LONG_REST;
    for (const row of this.rows) row.label.text = row.kind === 'short' ? text('hud.rest.short', { left }) : text('hud.rest.long');
    this.view.visible = true;
  }

  /** Closes it; returns whether it was open. */
  hide(): boolean {
    const wasOpen = this.view.visible;
    this.view.visible = false;
    claimPointer(this, false);
    return wasOpen;
  }

  destroy(): void {
    claimPointer(this, false);
  }
}
