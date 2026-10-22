import { Container, Graphics, Sprite } from 'pixi.js';
import { STAT_NAMES } from '../world';
import type { InventoryItem } from '../world';
import { lazyTexture } from '../assets/LazyArt';
import { itemIcon, STAT_LABELS } from '../entities/Items';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

/** Space inside the tooltip's frame, and between its picture and its lines of text. */
const PAD = 5;
const GAP = 4;
/** The item's picture is drawn this big (it keeps its shape). */
const PICTURE = 48;
const LINE_H = 10;
const HEADER_H = 12;
/** The tooltip sits this far from the pointer. */
const OFFSET = 10;
const BG_ALPHA = 0.94;

/** The lines under the header: each stat the item adds, how many there are, and what kind of thing it is. */
function detailLines(item: InventoryItem): Array<{ text: string; color: number }> {
  const s = item.stats;
  const lines = s ? STAT_NAMES.flatMap((stat) => (s[stat] ? [{ text: `+${s[stat]} ${STAT_LABELS[stat]}`, color: 0x8fd18f }] : [])) : [];
  if (item.count !== undefined) lines.push({ text: `Count: ${item.count}`, color: THEME.text });
  lines.push({ text: item.kind ?? item.type, color: THEME.muted });
  return lines;
}

/**
 * A tooltip for any item: its name as the header, its picture, and its stats underneath. Show it over an
 * item under the pointer; it keeps itself inside the area it is given.
 */
export class ItemTooltip {
  readonly view = new Container();
  private readonly frame = new Graphics();
  private readonly picture = new Sprite();
  private readonly header = new PixelLabel('', { color: THEME.title, shadow: true });
  private readonly lines = new Container();
  private shown: InventoryItem | null = null;

  constructor() {
    this.view.visible = false;
    this.view.eventMode = 'none';
    this.picture.anchor.set(0.5);
    this.view.addChild(this.frame, this.picture, this.header, this.lines);
  }

  /** Shows `item` near (x, y), kept inside a `bounds`-sized area starting at 0, 0. */
  show(item: InventoryItem, x: number, y: number, bounds: { w: number; h: number }): void {
    if (this.shown !== item) this.layout(item);
    this.shown = item;
    const w = this.frame.width;
    const h = this.frame.height;
    this.view.x = Math.round(Math.min(x + OFFSET, bounds.w - w));
    this.view.y = Math.round(Math.max(0, Math.min(y + OFFSET, bounds.h - h)));
    this.view.visible = true;
  }

  hide(): void {
    this.view.visible = false;
    this.shown = null;
  }

  /** Lays the tooltip out for an item: header across the top, picture on the left, details beside it. */
  private layout(item: InventoryItem): void {
    this.header.text = item.name;
    this.header.position.set(PAD, PAD);
    const texture = lazyTexture(itemIcon(item));
    this.picture.texture = texture;
    this.picture.scale.set(Math.min(PICTURE / Math.max(1, texture.width), PICTURE / Math.max(1, texture.height)));
    this.picture.position.set(PAD + PICTURE / 2, PAD + HEADER_H + PICTURE / 2);
    for (const child of this.lines.removeChildren()) child.destroy();
    const details = detailLines(item);
    details.forEach((line, i) => {
      const label = new PixelLabel(line.text, { color: line.color, shadow: true });
      label.position.set(PAD + PICTURE + GAP, PAD + HEADER_H + i * LINE_H);
      this.lines.addChild(label);
    });
    const textW = Math.max(this.header.textWidth, PICTURE + GAP + Math.max(0, ...this.lines.children.map((c) => c.width)));
    const bodyH = Math.max(PICTURE, details.length * LINE_H);
    this.frame.clear()
      .rect(0, 0, textW + 2 * PAD, PAD * 2 + HEADER_H + bodyH).fill({ color: THEME.panel, alpha: BG_ALPHA })
      .stroke({ color: THEME.panelBorder, width: 1, alignment: 1 });
  }

  /** Forgets the laid-out item, so the next show lays it out again (its picture may have loaded since). */
  invalidate(): void {
    this.shown = null;
  }
}
