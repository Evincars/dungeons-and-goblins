import { Graphics, Rectangle } from 'pixi.js';

/**
 * A slim scrollbar for the inventory's lists (the bag, the character sheet): a groove of the panels' iron with a brass
 * thumb as long as the share of the list on screen, standing out from the leather and cloth behind it. Under the
 * pointer, or while dragged, it widens (into the list, its outer edge kept) and brightens, and it takes the pointer a
 * little either side of it, so it needn't be hit exactly. It is hidden while everything fits.
 */

const W = 3;
const HOVER_W = 5;
/** How far either side of the groove the bar takes the pointer. */
const REACH = 4;
/** The thumb is never shorter than this. */
const MIN_THUMB = 10;
const GROOVE = 0x1f222b;
const OUTLINE = 0x04050a;
const THUMB = 0xa8834a;
const THUMB_LIT = 0xe0b464;
const THUMB_SHINE_ALPHA = 0.25;

export class ScrollBar {
  /** The narrow width it is laid out with, for the space to keep for it. */
  static readonly WIDTH = W;
  readonly view = new Graphics();
  private readonly grip: Rectangle;
  /** Where the view is along the list (0: the top, 1: the end) and what share of it is on screen (1: all). */
  private position = 0;
  private share = 1;
  private hovered = false;
  private held = false;

  /** `track`: the groove's place, `WIDTH` wide. */
  constructor(private readonly track: Rectangle) {
    this.grip = track.clone().pad(REACH, 0);
  }

  /** Whether there is anything to scroll. */
  get active(): boolean {
    return this.share < 1;
  }

  /** Whether the thumb is being dragged. */
  get dragging(): boolean {
    return this.held;
  }

  /** Shows where the list is scrolled to, and how much of it shows. */
  set(position: number, share: number): void {
    this.position = Math.max(0, Math.min(1, position));
    this.share = Math.max(0, Math.min(1, share));
    this.draw();
  }

  /** Whether a press here is the bar's (to drag it). */
  grips(x: number, y: number): boolean {
    return this.active && this.grip.contains(x, y);
  }

  /** The pointer moved: the bar widens while it is over it. */
  hover(x: number, y: number): void {
    const over = this.grips(x, y);
    if (over === this.hovered) return;
    this.hovered = over;
    this.draw();
  }

  /** A press on the bar starts a drag; let go, it ends. */
  hold(held: boolean): void {
    if (held === this.held) return;
    this.held = held;
    this.draw();
  }

  /** Where along the track a point lies: 0 at its top, 1 at its foot. */
  positionAt(y: number): number {
    return Math.max(0, Math.min(1, (y - this.track.y) / this.track.height));
  }

  private draw(): void {
    const g = this.view.clear();
    if (!this.active) return;
    const track = this.track;
    const lit = this.hovered || this.held;
    const w = lit ? HOVER_W : W;
    const x = track.x + track.width - w;
    const thumbH = Math.round(Math.max(MIN_THUMB, track.height * this.share));
    const y = Math.round(track.y + (track.height - thumbH) * this.position);
    g.rect(x - 1, track.y - 1, w + 2, track.height + 2).fill({ color: OUTLINE })
      .rect(x, track.y, w, track.height).fill({ color: GROOVE })
      .rect(x, y, w, thumbH).fill({ color: lit ? THUMB_LIT : THUMB })
      .rect(x, y, 1, thumbH).fill({ color: 0xffffff, alpha: THUMB_SHINE_ALPHA });
  }
}
