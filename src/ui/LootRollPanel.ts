import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { world, localPlayer } from '../world';
import type { Entity, InventoryItem } from '../world';
import { GAME_HEIGHT, GAME_WIDTH } from '../render/Camera';
import { claimPointer } from '../systems/InputSystem';
import { lazyTexture } from '../assets/LazyArt';
import { itemIcon } from '../entities/Items';
import { heroClass } from '../rules/Classes';
import { LOOT_ROLL_TICKS, requestLootChoice } from '../game/LootRoll';
import { seatOf } from '../game/Party';
import { text } from '../core/texts';
import { ItemTooltip } from './ItemTooltip';
import { PixelButton } from './PixelButton';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

/** A row a find: this big, stacked up from this far over the bottom edge (clear of the combat log), at most this many at once. */
const ROW_W = 236;
const ROW_H = 26;
const ROW_GAP = 3;
const BOTTOM = 84;
const MAX_ROWS = 3;
const PAD = 4;
const ICON = 18;
const BUTTON_W = 40;
const BUTTON_H = 16;
/** The time left runs down a thin bar along the row's foot. */
const BAR_H = 2;
const BG_ALPHA = 0.85;
/** A rare find's name reads blue, a very rare one's purple (the tabletop game's colours). */
const RARE_COLOR = 0x5aa8ff;
const VERY_RARE_COLOR = 0xc07bff;
const VERY_RARE_BONUS = 3;

type Row = {
  box: Container; icon: Sprite; name: PixelLabel; bar: Graphics; need: PixelButton; pass: PixelButton; chosen: PixelLabel;
  /** The roll it shows (its id), and the find. */
  roll: number; item: InventoryItem | null;
};

const rolls = world.with('lootRoll');

/**
 * Rare finds the party rolls for (game/LootRoll.ts), bottom middle over the quick bar: each with its picture
 * (hover it for its stats), its name, Need and Pass, and the time left; once this player has chosen, what
 * they chose shows instead of the buttons.
 */
export class LootRollPanel {
  readonly view = new Container();
  private readonly rows: Row[] = [];
  private readonly tooltip = new ItemTooltip();
  private hovered: Row | null = null;

  constructor() {
    this.view.eventMode = 'passive';
    for (let i = 0; i < MAX_ROWS; i++) this.rows.push(this.addRow(i));
    this.view.addChild(this.tooltip.view);
  }

  private addRow(i: number): Row {
    const box = new Container();
    box.position.set(Math.round((GAME_WIDTH - ROW_W) / 2), GAME_HEIGHT - BOTTOM - (i + 1) * ROW_H - i * ROW_GAP);
    box.visible = false;
    const bg = new Graphics().rect(0, 0, ROW_W, ROW_H).fill({ color: THEME.panel, alpha: BG_ALPHA }).stroke({ color: THEME.panelBorder, width: 1, alignment: 1 });
    const icon = new Sprite();
    icon.anchor.set(0.5);
    icon.position.set(PAD + ICON / 2, ROW_H / 2);
    const name = new PixelLabel('', { shadow: true });
    name.position.set(2 * PAD + ICON, Math.round((ROW_H - 8) / 2));
    const bar = new Graphics();
    const need = this.button(text('loot.need'), ROW_W - 2 * BUTTON_W - 2 * PAD, () => this.choose(row, true));
    const pass = this.button(text('loot.pass'), ROW_W - BUTTON_W - PAD, () => this.choose(row, false));
    const chosen = new PixelLabel('', { color: THEME.muted, align: 'right', shadow: true });
    chosen.position.set(ROW_W - PAD, Math.round((ROW_H - 8) / 2));
    box.addChild(bg, icon, name, bar, need, pass, chosen);
    box.eventMode = 'static';
    box.hitArea = new Rectangle(0, 0, ROW_W, ROW_H);
    box.on('pointerover', () => { this.hovered = row; claimPointer(box, true); });
    box.on('pointerout', () => { if (this.hovered === row) this.hovered = null; claimPointer(box, false); });
    this.view.addChild(box);
    const row: Row = { box, icon, name, bar, need, pass, chosen, roll: -1, item: null };
    return row;
  }

  private button(label: string, x: number, press: () => void): PixelButton {
    const button = new PixelButton(label, BUTTON_W, BUTTON_H);
    button.position.set(x, Math.round((ROW_H - BUTTON_H) / 2));
    button.onPress = press;
    return button;
  }

  private choose(row: Row, need: boolean): void {
    if (row.roll >= 0) requestLootChoice(row.roll, need);
  }

  update(): void {
    let i = 0;
    for (const entity of rolls) {
      if (i >= MAX_ROWS) break;
      if (!entity.removed) this.show(this.rows[i++], entity.lootRoll);
    }
    for (; i < MAX_ROWS; i++) this.hideRow(this.rows[i]);
    this.updateTooltip();
  }

  /** One find: its picture and name (a new one), whether this player has chosen, and the time left. */
  private show(row: Row, roll: NonNullable<Entity['lootRoll']>): void {
    row.box.visible = true;
    if (row.roll !== roll.id) {
      row.roll = roll.id;
      row.item = roll.item;
      row.icon.texture = Texture.EMPTY;
      row.name.text = text('loot.item', { name: roll.item.name, bonus: roll.item.bonus ?? 0 });
      row.name.fill = (roll.item.bonus ?? 0) >= VERY_RARE_BONUS ? VERY_RARE_COLOR : RARE_COLOR;
    }
    // The picture loads the first time it is shown: it is asked for again until it is there.
    if (row.icon.texture === Texture.EMPTY) this.showIcon(row, roll.item);
    const me = localPlayer();
    const choice = me ? roll.choices[seatOf(me)] : undefined;
    row.need.visible = !choice;
    row.pass.visible = !choice;
    row.chosen.text = choice ? text(choice === 'need' ? 'loot.chose_need' : 'loot.chose_pass') : '';
    const w = Math.round((ROW_W - 2) * Math.max(0, roll.ticks / LOOT_ROLL_TICKS));
    row.bar.clear().rect(1, ROW_H - BAR_H - 1, w, BAR_H).fill({ color: THEME.title });
  }

  private showIcon(row: Row, item: InventoryItem): void {
    const texture = lazyTexture(itemIcon(item));
    row.icon.texture = texture;
    row.icon.scale.set(ICON / Math.max(1, texture.width, texture.height));
  }

  private hideRow(row: Row): void {
    if (!row.box.visible) return;
    row.box.visible = false;
    row.roll = -1;
    row.item = null;
    claimPointer(row.box, false);
    if (this.hovered === row) this.hovered = null;
  }

  /** The stats of the find under the pointer, above its row. */
  private updateTooltip(): void {
    const item = this.hovered?.item;
    const me = localPlayer();
    if (!item || !this.hovered) {
      this.tooltip.hide();
      return;
    }
    const at = this.hovered.box.position;
    // Asked for at the row itself, it is kept inside the area above it: just over the row.
    this.tooltip.show(item, at.x, at.y, { w: GAME_WIDTH, h: at.y - 2 }, me ? heroClass(me.heroClass) : undefined);
  }

  destroy(): void {
    for (const row of this.rows) claimPointer(row.box, false);
  }
}
