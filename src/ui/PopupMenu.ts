import { Container, Graphics, Rectangle } from 'pixi.js';
import type { PointData } from 'pixi.js';
import { claimPointer } from '../systems/InputSystem';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

/** The menu's rows: this tall, with this padding round the text; it is as wide as its longest row. */
const ROW_H = 12;
const PAD = 4;
const MIN_W = 60;
const BG_ALPHA = 0.94;
const HOVER_ALPHA = 0.12;

/** A row: what it says, and what a click on it does (null: shown greyed out, does nothing). */
export type MenuRow = { label: string; action: (() => void) | null };

/**
 * A small drop-down of choices on a dark panel (the rest button's, an item's right-click menu). A click on a
 * row runs it and closes the menu; it keeps itself inside the area it is given. Clicks on it are never attacks.
 */
export class PopupMenu {
  readonly view = new Container();

  constructor() {
    this.view.visible = false;
    this.view.eventMode = 'static';
    this.view.on('pointerover', () => claimPointer(this, true));
    this.view.on('pointerout', () => claimPointer(this, false));
  }

  get open(): boolean {
    return this.view.visible;
  }

  /**
   * Opens it at (x, y) — its top-left corner, or with `above` its bottom-left — kept inside a `bounds`-sized
   * area starting at 0, 0.
   */
  show(rows: readonly MenuRow[], x: number, y: number, bounds: { w: number; h: number }, above = false): void {
    for (const child of this.view.removeChildren()) child.destroy({ children: true });
    const labels = rows.map((row) => new PixelLabel(row.label, { color: row.action ? THEME.text : THEME.muted, shadow: true }));
    const w = Math.max(MIN_W, ...labels.map((label) => label.textWidth + 2 * PAD));
    const h = rows.length * ROW_H + 2;
    this.view.addChild(new Graphics().rect(0, 0, w, h).fill({ color: THEME.panel, alpha: BG_ALPHA }).stroke({ color: THEME.panelBorder, width: 1, alignment: 1 }));
    rows.forEach((row, i) => this.addRow(row, labels[i], i, w));
    this.view.hitArea = new Rectangle(0, 0, w, h);
    const top = above ? y - h : y;
    this.view.position.set(Math.round(Math.max(0, Math.min(x, bounds.w - w))), Math.round(Math.max(0, Math.min(top, bounds.h - h))));
    this.view.visible = true;
  }

  private addRow(row: MenuRow, label: PixelLabel, i: number, w: number): void {
    const box = new Container();
    box.position.set(1, 1 + i * ROW_H);
    const glow = new Graphics().rect(0, 0, w - 2, ROW_H).fill({ color: 0xffffff, alpha: HOVER_ALPHA });
    glow.visible = false;
    label.position.set(PAD, Math.round((ROW_H - 8) / 2));
    box.addChild(glow, label);
    this.view.addChild(box);
    const action = row.action;
    if (!action) return;
    box.eventMode = 'static';
    box.cursor = 'pointer';
    box.hitArea = new Rectangle(0, 0, w - 2, ROW_H);
    box.on('pointerover', () => { glow.visible = true; label.fill = THEME.buttonHover; });
    box.on('pointerout', () => { glow.visible = false; label.fill = THEME.text; });
    box.on('pointertap', (e) => {
      e.stopPropagation();
      this.hide();
      action();
    });
  }

  /** Whether a point on the screen is on the open menu (a press there is the menu's, not what lies under it). */
  covers(global: PointData): boolean {
    if (!this.view.visible || !(this.view.hitArea instanceof Rectangle)) return false;
    const p = this.view.toLocal(global);
    return this.view.hitArea.contains(p.x, p.y);
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
