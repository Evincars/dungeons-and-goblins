import { Container, Graphics, Rectangle } from 'pixi.js';
import { localPlayer } from '../world';
import type { Player } from '../world';
import { GAME_HEIGHT, GAME_WIDTH } from '../render/Camera';
import { quickSlotPressed } from '../systems/InputSystem';
import { THEME } from './Theme';
import { PixelLabel } from './PixelText';

/** The three bars, bottom left: how long, how thick, the gap between them and their distance from the edges. */
const BAR_W = 80;
const BAR_H = 6;
const BAR_GAP = 4;
const MARGIN = 8;
/** Quick bar: this many squares across the bottom middle, each this big, this far apart. */
export const QUICK_SLOTS = 5;
const SLOT = 22;
const SLOT_GAP = 3;
const SLOT_FILL_ALPHA = 0.55;
const SLOT_EDGE = 0xb4a488;
const SLOT_EDGE_ALPHA = 0.6;
/** A bar's name shows beside it, nudged up this much to line up with the bar. */
const TIP_RAISE = 1;

type Bar = { label: string; color: number; fill: Graphics; value: (p: Player) => number; max: (p: Player) => number };

const BARS: ReadonlyArray<Omit<Bar, 'fill'>> = [
  { label: 'Health', color: 0xd23c3c, value: (p) => p.health.current, max: (p) => p.health.max },
  { label: 'Stamina', color: 0x9acd32, value: (p) => p.playerStats.maxSprint - p.playerStats.sprint, max: (p) => p.playerStats.maxSprint },
  { label: 'Mana', color: 0x3c78dc, value: (p) => p.playerStats.mana, max: (p) => p.playerStats.maxMana },
];

/**
 * What stays on screen during play: health, stamina and mana bars (hover one to see what it is and how full),
 * and a quick bar of five squares — numbered 1–5, picked with those keys — for spells, weapons and abilities
 * to be dragged into later.
 */
export class HudPanel {
  readonly container = new Container();
  private readonly bars: Bar[] = [];
  private readonly slots: Graphics[] = [];
  private readonly tip = new PixelLabel('', { color: THEME.text, outline: true });
  private hovered: Bar | null = null;
  private activeSlot = 0;

  constructor() {
    // Only the bars listen (for their names); nothing else here may catch the pointer.
    this.container.eventMode = 'passive';
    BARS.forEach((spec, i) => this.addBar(spec, i));
    for (let i = 0; i < QUICK_SLOTS; i++) this.addSlot(i);
    this.tip.visible = false;
    this.tip.eventMode = 'none';
    this.container.addChild(this.tip);
    this.drawSlots();
  }

  /** Which quick-bar square is picked (0 for the first). */
  get quickSlot(): number {
    return this.activeSlot;
  }

  private addBar(spec: Omit<Bar, 'fill'>, i: number): void {
    const x = MARGIN;
    const y = GAME_HEIGHT - MARGIN - (BARS.length - i) * (BAR_H + BAR_GAP) + BAR_GAP;
    const frame = new Graphics().rect(x, y, BAR_W, BAR_H).fill({ color: THEME.well }).stroke({ color: THEME.panelBorder, width: 1, alignment: 1 });
    const fill = new Graphics();
    fill.eventMode = 'none';
    fill.position.set(x, y);
    const bar: Bar = { ...spec, fill };
    frame.eventMode = 'static';
    frame.hitArea = new Rectangle(x - 1, y - 2, BAR_W + 2, BAR_H + 4);
    frame.on('pointerover', () => { this.hovered = bar; });
    frame.on('pointerout', () => { if (this.hovered === bar) this.hovered = null; });
    this.bars.push(bar);
    this.container.addChild(frame, fill);
  }

  private addSlot(i: number): void {
    const total = QUICK_SLOTS * SLOT + (QUICK_SLOTS - 1) * SLOT_GAP;
    const x = Math.round((GAME_WIDTH - total) / 2) + i * (SLOT + SLOT_GAP);
    const y = GAME_HEIGHT - MARGIN - SLOT;
    const square = new Graphics();
    square.eventMode = 'none';
    square.position.set(x, y);
    const number = new PixelLabel(String(i + 1), { color: THEME.buttonText, align: 'right', outline: true });
    number.eventMode = 'none';
    number.position.set(x + SLOT - 1, y + SLOT - 9);
    this.slots.push(square);
    this.container.addChild(square, number);
  }

  /** Each square a dark well; the picked one edged in gold. */
  private drawSlots(): void {
    this.slots.forEach((square, i) => {
      const active = i === this.activeSlot;
      square.clear().rect(0, 0, SLOT, SLOT).fill({ color: 0x000000, alpha: SLOT_FILL_ALPHA })
        .stroke({ color: active ? THEME.title : SLOT_EDGE, alpha: active ? 1 : SLOT_EDGE_ALPHA, width: active ? 2 : 1, alignment: 1 });
    });
  }

  update(): void {
    const picked = quickSlotPressed();
    if (picked >= 0 && picked !== this.activeSlot) {
      this.activeSlot = picked;
      this.drawSlots();
    }
    const player = localPlayer();
    if (!player) return;
    for (const bar of this.bars) {
      const max = Math.max(1, bar.max(player));
      const share = Math.max(0, Math.min(1, bar.value(player) / max));
      bar.fill.clear().rect(0, 0, Math.round(BAR_W * share), BAR_H).fill({ color: bar.color });
    }
    this.showTip(player);
  }

  /** Over a bar, its name and how full it is, just above it. */
  private showTip(player: Player): void {
    const bar = this.hovered;
    this.tip.visible = !!bar;
    if (!bar) return;
    this.tip.text = `${bar.label} ${Math.round(bar.value(player))}/${Math.round(bar.max(player))}`;
    this.tip.position.set(MARGIN + BAR_W + 6, bar.fill.y - TIP_RAISE);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
