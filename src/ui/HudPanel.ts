import { Circle, Container, Graphics, Rectangle } from 'pixi.js';
import { localPlayer } from '../world';
import type { Player } from '../world';
import { GAME_HEIGHT, GAME_WIDTH } from '../render/Camera';
import { claimPointer, quickSlotPressed } from '../systems/InputSystem';
import { text } from '../core/texts';
import { THEME } from './Theme';
import { PixelLabel } from './PixelText';
import { HudDialog } from './HudDialog';
import { MinimapView } from './MinimapView';
import type { Level } from '../level/Level';

/** The health bar, bottom left: how long, how thick, its corner rounding and the margin to the screen's edge. */
const BAR_W = 112;
const BAR_H = 12;
const BAR_GAP = 3;
const BAR_RADIUS = 5;
/** The fill sits this far inside the bar's frame; a faint streak along its top gives it some shine. */
const BAR_INSET = 2;
const SHINE_ALPHA = 0.16;
const MARGIN = 8;
/** Dark antique gold for the frames round the bar and the buttons, and the near-black well inside the bar. */
const GOLD = 0x8a6a2c;
const GOLD_DARK = 0x4a3818;
const WELL = 0x0c0a08;
/**
 * The buttons: circles of this radius standing on the corners of an equilateral triangle centred over the
 * health bar (two below, one on top), this far apart edge to edge and this far above the bar.
 */
const BUTTON_R = 11;
const BUTTON_GAP = 4;
const BUTTON_LIFT = 4;
const HOVER_ALPHA = 0.14;
/** Quick bar: this many squares across the bottom middle, each this big, this far apart. */
export const QUICK_SLOTS = 5;
const SLOT = 22;
const SLOT_GAP = 3;
const SLOT_FILL_ALPHA = 0.55;
const SLOT_EDGE = 0xb4a488;
const SLOT_EDGE_ALPHA = 0.6;
/** The open map is redrawn this often (ticks). */
const MAP_REFRESH_TICKS = 20;


type Bar = { color: number; fill: Graphics; value: PixelLabel; current: (p: Player) => number; max: (p: Player) => number };

const BARS: ReadonlyArray<Pick<Bar, 'color' | 'current' | 'max'>> = [
  { color: 0x8e1f1b, current: (p) => p.health.current, max: (p) => p.health.max },
];

/** Which dialog a HUD button opens. */
export type HudButtonId = 'character' | 'level' | 'map';

/** A HUD button: a dark circle in its own colour with a small picture, opening its dialog. */
type ButtonDef = { id: HudButtonId; title: string; color: number; icon: (g: Graphics) => void };

/** A sword, drawn about the button's centre. */
function swordIcon(g: Graphics): void {
  g.moveTo(-5, 5).lineTo(5, -5).stroke({ color: 0xa9b2bc, width: 2 });
  g.moveTo(-5, 1).lineTo(-1, 5).stroke({ color: GOLD, width: 2 });
  g.circle(-6, 6, 1.5).fill({ color: GOLD });
}

/** A small globe: dark sea, two dark green lands. */
function globeIcon(g: Graphics): void {
  g.circle(0, 0, 6).fill({ color: 0x24539c }).stroke({ color: 0x6f8fbf, width: 1 });
  g.circle(-2, -2, 2.5).fill({ color: 0x3a8a3e });
  g.circle(3, 2, 2).fill({ color: 0x3a8a3e });
}

/** The triangle's corners: the character on top, the hero's level (its number on it) and the map below. */
const BUTTONS: readonly ButtonDef[] = [
  { id: 'character', title: text('hud.button.character'), color: 0x4a1414, icon: swordIcon },
  { id: 'level', title: text('hud.button.level'), color: 0x1c1824, icon: () => undefined },
  { id: 'map', title: text('hud.button.map'), color: 0x14284c, icon: globeIcon },
];

/**
 * Centres of three circles touching an equilateral triangle centred over the bar: side = two radii plus the
 * gap, height = side·√3/2. Index 0 is the top corner, then bottom left and bottom right.
 */
function trianglePoints(barX: number, barY: number): Array<{ x: number; y: number }> {
  const side = 2 * BUTTON_R + BUTTON_GAP;
  const cx = barX + BAR_W / 2;
  const bottom = barY - BUTTON_LIFT - BUTTON_R;
  const top = bottom - (side * Math.sqrt(3)) / 2;
  return [{ x: cx, y: top }, { x: cx - side / 2, y: bottom }, { x: cx + side / 2, y: bottom }];
}

/**
 * What stays on screen during play. Bottom left: the health bar (dark gold frame, the value on it) and three
 * round buttons in a triangle over it — the character, the hero's level and the map (which shows what has
 * been explored). Bottom middle: a quick bar of five squares — numbered 1–5, picked with those keys — for
 * spells, weapons and abilities to be dragged into later.
 */
export class HudPanel {
  readonly container = new Container();
  readonly dialog = new HudDialog();
  private readonly bars: Bar[] = [];
  private readonly slots: Graphics[] = [];
  private readonly level = new PixelLabel('1', { color: THEME.title, align: 'center', outline: true });
  private readonly minimap = new MinimapView();
  /** The level being played, as of the last update (the map draws it). */
  private levelShown: Level | null = null;
  /** Ticks until the open map is redrawn (the party keeps exploring while it is up). */
  private mapRefresh = 0;
  private activeSlot = 0;

  constructor() {
    // Only the buttons and the dialog listen; nothing else here may catch the pointer.
    this.container.eventMode = 'passive';
    BARS.forEach((spec, i) => this.addBar(spec, i));
    const corners = trianglePoints(MARGIN, GAME_HEIGHT - MARGIN - BARS.length * BAR_H - (BARS.length - 1) * BAR_GAP);
    BUTTONS.forEach((def, i) => this.addButton(def, corners[i]));
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

  /** A round button: dark gold rim, its colour inside, its picture; it lights up under the pointer and opens its dialog. */
  private addButton(def: ButtonDef, at: { x: number; y: number }): void {
    const button = new Container();
    button.position.set(Math.round(at.x), Math.round(at.y));
    const r = BUTTON_R;
    const art = new Graphics()
      .circle(0, 0, r).fill({ color: GOLD })
      .circle(0, 0, r - 2).fill({ color: def.color })
      .circle(0, 0, r - 4).stroke({ color: 0xffffff, alpha: 0.08, width: 1 });
    const icon = new Graphics();
    def.icon(icon);
    const glow = new Graphics().circle(0, 0, r - 2).fill({ color: 0xffffff, alpha: HOVER_ALPHA });
    glow.visible = false;
    button.addChild(art, icon, glow);
    if (def.id === 'level') {
      this.level.position.set(0, -4);
      button.addChild(this.level);
    }
    button.eventMode = 'static';
    button.cursor = 'pointer';
    button.hitArea = new Circle(0, 0, r);
    button.on('pointerover', () => { glow.visible = true; claimPointer(button, true); });
    button.on('pointerout', () => { glow.visible = false; claimPointer(button, false); });
    button.on('pointertap', () => this.open(def));
    this.container.addChild(button);
  }

  /** The map button shows the explored dungeon; the others, for now, a placeholder. */
  private open(def: ButtonDef): void {
    if (def.id !== 'map') {
      this.dialog.show(def.title, text('hud.dialog.placeholder'));
      return;
    }
    if (!this.levelShown) return;
    this.minimap.draw(this.levelShown);
    this.mapRefresh = MAP_REFRESH_TICKS;
    this.dialog.show(def.title, this.minimap.view, this.minimap.width, this.minimap.height);
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

  update(level: Level): void {
    const picked = quickSlotPressed();
    if (picked >= 0 && picked !== this.activeSlot) {
      this.activeSlot = picked;
      this.drawSlots();
    }
    this.levelShown = level;
    this.refreshMap(level);
    const player = localPlayer();
    if (!player) return;
    for (const bar of this.bars) this.drawBar(bar, player);
    this.level.text = String(player.playerStats.level);
  }

  /** While the map is open, it is drawn again now and then, so newly explored ground appears on it. */
  private refreshMap(level: Level): void {
    if (!this.dialog.showing(this.minimap.view) || --this.mapRefresh > 0) return;
    this.mapRefresh = MAP_REFRESH_TICKS;
    this.minimap.draw(level);
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
    return this.dialog.hide();
  }

  destroy(): void {
    this.dialog.destroy();
    this.container.destroy({ children: true });
  }
}
