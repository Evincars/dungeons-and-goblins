import { Container, Graphics, Rectangle } from 'pixi.js';
import type { PointData } from 'pixi.js';
import { claimPointer } from '../systems/InputSystem';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';
import { sound } from '../audio/SoundPlayer';

/** The menu's rows: this tall, with this padding round the text; it is as wide as its longest row. */
const ROW_H = 12;
const PAD = 4;
const MIN_W = 60;
const BG_ALPHA = 0.94;
const HOVER_ALPHA = 0.12;

/** A row's mark for its submenu. */
const SUBMENU_MARK = ' >';

/**
 * A row: what it says, and what a click on it does (null: shown greyed out, does nothing); or, with `submenu`,
 * more rows that open beside it while the pointer is on it.
 */
export type MenuRow = { label: string; action: (() => void) | null; submenu?: readonly MenuRow[] };

/**
 * A small drop-down of choices on a dark panel (the rest button's, an item's right-click menu). A click on a
 * row runs it and closes the menu; it keeps itself inside the area it is given. Clicks on it are never attacks.
 */
export class PopupMenu {
  readonly view = new Container();
  /** The submenu open beside a row, made when first needed. */
  private child: PopupMenu | null = null;
  private bounds = { w: 0, h: 0 };

  /** `parent`: the menu this one opens beside, as a submenu (a pick in it closes both). */
  constructor(private readonly parent: PopupMenu | null = null) {
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
    this.child?.hide();
    this.bounds = bounds;
    const labels = rows.map((row) => new PixelLabel(row.submenu ? row.label + SUBMENU_MARK : row.label,
      { color: row.action || row.submenu ? THEME.text : THEME.muted, shadow: true }));
    const w = Math.max(MIN_W, ...labels.map((label) => label.textWidth + 2 * PAD));
    const h = rows.length * ROW_H + 2;
    this.view.addChild(new Graphics().rect(0, 0, w, h).fill({ color: THEME.panel, alpha: BG_ALPHA }).stroke({ color: THEME.panelBorder, width: 1, alignment: 1 }));
    rows.forEach((row, i) => this.addRow(row, labels[i], i, w));
    this.view.hitArea = new Rectangle(0, 0, w, h);
    const top = above ? y - h : y;
    this.view.position.set(Math.round(Math.max(0, Math.min(x, bounds.w - w))), Math.round(Math.max(0, Math.min(top, bounds.h - h))));
    this.view.visible = true;
    if (!this.parent) sound.playLocal('dialog');
  }

  /** Opens `rows` beside row `i` (to the right, or to the left where the right has no room). */
  private openSubmenu(rows: readonly MenuRow[], i: number, w: number): void {
    const child = this.child ?? (this.child = new PopupMenu(this));
    if (!child.view.parent) this.view.parent?.addChild(child.view);
    const right = this.view.x + w - 1;
    child.show(rows, right, this.view.y + i * ROW_H, this.bounds);
    const childW = child.view.hitArea instanceof Rectangle ? child.view.hitArea.width : 0;
    if (child.view.x < right) child.view.x = Math.max(0, this.view.x - childW + 1);
  }

  private addRow(row: MenuRow, label: PixelLabel, i: number, w: number): void {
    const box = new Container();
    box.position.set(1, 1 + i * ROW_H);
    const glow = new Graphics().rect(0, 0, w - 2, ROW_H).fill({ color: 0xffffff, alpha: HOVER_ALPHA });
    glow.visible = false;
    label.position.set(PAD, Math.round((ROW_H - 8) / 2));
    box.addChild(glow, label);
    this.view.addChild(box);
    const { action, submenu } = row;
    box.eventMode = 'static';
    box.hitArea = new Rectangle(0, 0, w - 2, ROW_H);
    // Moving onto any row shows its submenu, or closes the one another row opened.
    box.on('pointerover', () => (submenu ? this.openSubmenu(submenu, i, w) : this.child?.hide()));
    if (!action && !submenu) return;
    box.cursor = 'pointer';
    box.on('pointerover', () => { glow.visible = true; label.fill = THEME.buttonHover; });
    box.on('pointerout', () => { glow.visible = false; label.fill = THEME.text; });
    if (!action) return;
    box.on('pointertap', (e) => {
      e.stopPropagation();
      this.hide();
      this.parent?.hide();
      action();
    });
  }

  /** Whether a point on the screen is on the open menu (a press there is the menu's, not what lies under it). */
  covers(global: PointData): boolean {
    if (this.child?.covers(global)) return true;
    if (!this.view.visible || !(this.view.hitArea instanceof Rectangle)) return false;
    const p = this.view.toLocal(global);
    return this.view.hitArea.contains(p.x, p.y);
  }

  /** Closes it (and its submenu); returns whether it was open. */
  hide(): boolean {
    const wasOpen = this.view.visible;
    this.view.visible = false;
    this.child?.hide();
    claimPointer(this, false);
    return wasOpen;
  }

  destroy(): void {
    claimPointer(this, false);
    this.child?.destroy();
  }
}
