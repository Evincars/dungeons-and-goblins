import { Container, Graphics, Rectangle } from 'pixi.js';
import { localPlayer } from '../world';
import type { Player } from '../world';
import { GAME_HEIGHT, GAME_WIDTH } from '../render/Camera';
import { claimPointer, quickSlotPressed } from '../systems/InputSystem';
import { text } from '../core/texts';
import { THEME } from './Theme';
import { PixelLabel } from './PixelText';
import { HudDialog } from './HudDialog';

/** The bars, bottom left: how long, how thick, the gap between them, their corner rounding and the margin to the screen's edge. */
const BAR_W = 112;
const BAR_H = 12;
const BAR_GAP = 3;
const BAR_RADIUS = 5;
/** The fill sits this far inside the bar's gold frame; a lighter streak along its top gives it some shine. */
const BAR_INSET = 2;
const SHINE_ALPHA = 0.28;
const MARGIN = 8;
/** Gold frames round the bars and the buttons, and the dark well inside a bar. */
const GOLD = 0xc89b3c;
const GOLD_DARK = 0x6e5220;
const WELL = 0x15110d;
/** The buttons: diamonds this far from their centre to a point, climbing up and to the right of the bars. */
const DIAMOND_R = 12;
const DIAMOND_STEP_X = 13;
const DIAMOND_STEP_Y = 15;
const DIAMOND_LEFT_GAP = 6;
const HOVER_ALPHA = 0.18;
/** Quick bar: this many squares across the bottom middle, each this big, this far apart. */
export const QUICK_SLOTS = 5;
const SLOT = 22;
const SLOT_GAP = 3;
const SLOT_FILL_ALPHA = 0.55;
const SLOT_EDGE = 0xb4a488;
const SLOT_EDGE_ALPHA = 0.6;
/** A bar's name shows beside it, nudged up this much to line up with the bar. */
const TIP_RAISE = 1;


type Bar = { color: number; fill: Graphics; value: PixelLabel; current: (p: Player) => number; max: (p: Player) => number };

const BARS: ReadonlyArray<Pick<Bar, 'color' | 'current' | 'max'>> = [
  { color: 0xc8302c, current: (p) => p.health.current, max: (p) => p.health.max },
  { color: 0xd9a21e, current: (p) => p.playerStats.maxSprint - p.playerStats.sprint, max: (p) => p.playerStats.maxSprint },
];

/** A HUD button: a diamond in its own colour with a small picture, opening a dialog with its title. */
type ButtonDef = { title: string; color: number; icon: (g: Graphics) => void };

/** A sword, drawn about the diamond's centre. */
function swordIcon(g: Graphics): void {
  g.moveTo(-5, 5).lineTo(5, -5).stroke({ color: 0xdfe6ee, width: 2 });
  g.moveTo(-5, 1).lineTo(-1, 5).stroke({ color: GOLD, width: 2 });
  g.circle(-6, 6, 1.5).fill({ color: GOLD });
}

/** A small globe: blue sea, two green lands, a highlight. */
function globeIcon(g: Graphics): void {
  g.circle(0, 0, 6).fill({ color: 0x2f6fd0 }).stroke({ color: 0x9cc4ff, width: 1 });
  g.circle(-2, -2, 2.5).fill({ color: 0x4caf50 });
  g.circle(3, 2, 2).fill({ color: 0x4caf50 });
}

/** Bottom up: the map, the hero's level (its number is written on it), the character. */
const BUTTONS: readonly ButtonDef[] = [
  { title: text('hud.button.map'), color: 0x1d3f7a, icon: globeIcon },
  { title: text('hud.button.level'), color: 0x2a2433, icon: () => undefined },
  { title: text('hud.button.character'), color: 0x7a1d1d, icon: swordIcon },
];
/** The button that shows the hero's level. */
const LEVEL_BUTTON = 1;

/**
 * What stays on screen during play. Bottom left: the health and stamina bars (gold-framed, with the values on
 * them) and a column of diamond buttons that open dialogs. Bottom middle: a quick bar of five squares —
 * numbered 1–5, picked with those keys — for spells, weapons and abilities to be dragged into later.
 */
export class HudPanel {
  readonly container = new Container();
  readonly dialog = new HudDialog();
  private readonly bars: Bar[] = [];
  private readonly slots: Graphics[] = [];
  private readonly level = new PixelLabel('1', { color: THEME.title, align: 'center', outline: true });
  private activeSlot = 0;

  constructor() {
    // Only the buttons and the dialog listen; nothing else here may catch the pointer.
    this.container.eventMode = 'passive';
    BARS.forEach((spec, i) => this.addBar(spec, i));
    BUTTONS.forEach((def, i) => this.addButton(def, i));
    for (let i = 0; i < QUICK_SLOTS; i++) this.addSlot(i);
    this.container.addChild(this.dialog.container);
    this.drawSlots();
  }

  /** Which quick-bar square is picked (0 for the first). */
  get quickSlot(): number {
    return this.activeSlot;
  }

  private addBar(spec: Pick<Bar, 'color' | 'current' | 'max'>, i: number): void {
    const x = MARGIN;
    const y = GAME_HEIGHT - MARGIN - (BARS.length - i) * BAR_H - (BARS.length - 1 - i) * BAR_GAP;
    const frame = new Graphics()
      .roundRect(x, y, BAR_W, BAR_H, BAR_RADIUS).fill({ color: WELL }).stroke({ color: GOLD, width: 1, alignment: 1 })
      .roundRect(x + 1, y + 1, BAR_W - 2, BAR_H - 2, BAR_RADIUS - 1).stroke({ color: GOLD_DARK, width: 1, alignment: 1 });
    frame.eventMode = 'none';
    const fill = new Graphics();
    fill.eventMode = 'none';
    fill.position.set(x + BAR_INSET, y + BAR_INSET);
    const value = new PixelLabel('', { color: THEME.text, align: 'center', outline: true });
    value.eventMode = 'none';
    value.position.set(x + BAR_W / 2, y + Math.round((BAR_H - 8) / 2));
    this.bars.push({ ...spec, fill, value });
    this.container.addChild(frame, fill, value);
  }

  /** A diamond button: gold rim, its colour inside, its picture; it lights up under the pointer and opens its dialog. */
  private addButton(def: ButtonDef, i: number): void {
    const cx = MARGIN + BAR_W + DIAMOND_LEFT_GAP + DIAMOND_R + i * DIAMOND_STEP_X;
    const cy = GAME_HEIGHT - MARGIN - DIAMOND_R - i * DIAMOND_STEP_Y;
    const button = new Container();
    button.position.set(cx, cy);
    const r = DIAMOND_R;
    const diamond = (g: Graphics, d: number) => g.poly([0, -d, d, 0, 0, d, -d, 0]);
    const art = new Graphics();
    diamond(art, r).fill({ color: GOLD });
    diamond(art, r - 2).fill({ color: def.color });
    diamond(art, r - 4).stroke({ color: 0xffffff, alpha: 0.15, width: 1 });
    const icon = new Graphics();
    def.icon(icon);
    const glow = diamond(new Graphics(), r - 2).fill({ color: 0xffffff, alpha: HOVER_ALPHA });
    glow.visible = false;
    button.addChild(art, icon, glow);
    if (i === LEVEL_BUTTON) button.addChild(this.level);
    this.level.position.set(0, -4);
    button.eventMode = 'static';
    button.cursor = 'pointer';
    button.hitArea = new Rectangle(-r, -r, 2 * r, 2 * r);
    button.on('pointerover', () => { glow.visible = true; claimPointer(button, true); });
    button.on('pointerout', () => { glow.visible = false; claimPointer(button, false); });
    button.on('pointertap', () => this.dialog.show(def.title, text('hud.dialog.placeholder')));
    this.container.addChild(button);
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
    for (const bar of this.bars) this.drawBar(bar, player);
    this.level.text = String(player.playerStats.level);
  }

  /** A bar filled as far as its value goes, with the value written on it ("50/50"). */
  private drawBar(bar: Bar, player: Player): void {
    const max = Math.max(1, Math.round(bar.max(player)));
    const current = Math.max(0, Math.round(bar.current(player)));
    const w = Math.round((BAR_W - 2 * BAR_INSET) * Math.min(1, current / max));
    const h = BAR_H - 2 * BAR_INSET;
    bar.fill.clear();
    if (w > 0) bar.fill.roundRect(0, 0, w, h, BAR_RADIUS - BAR_INSET).fill({ color: bar.color }).rect(1, 1, Math.max(0, w - 2), 1).fill({ color: 0xffffff, alpha: SHINE_ALPHA });
    bar.value.text = text('hud.bar.value', { current, max });
  }

  /** Closes the HUD's dialog if it is open; returns whether it was (Escape uses this before the pause menu). */
  closeDialog(): boolean {
    return this.dialog.close();
  }

  destroy(): void {
    this.dialog.destroy();
    this.container.destroy({ children: true });
  }
}
