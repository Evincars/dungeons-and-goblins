import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { FederatedPointerEvent, FederatedWheelEvent } from 'pixi.js';
import { localPlayer } from '../world';
import type { Entity, InventoryItem, Player } from '../world';
import { text } from '../core/texts';
import { THEME } from './Theme';
import { PixelLabel } from './PixelText';
import { GAME_WIDTH, VIEW_HEIGHT } from '../render/Camera';
import { requestBuy, requestSell, sellPrice, shopWares } from '../game/PlayerActions';
import { sound } from '../audio/SoundPlayer';
import { lazyTexture, requestArt } from '../assets/LazyArt';
import { reportRejection } from '../core/errors';
import { itemIcon } from '../entities/Items';
import { ItemTooltip } from './ItemTooltip';
import type { TooltipContext } from './ItemTooltip';
import { characterSheet } from '../rules/CharacterSheet';
import { claimPointer } from '../systems/InputSystem';
import { ScrollBar } from './ScrollBar';
import { itemSummary } from './ItemSummary';
import { traderApproves } from '../systems/TraderSystem';

/**
 * The trade screen, as in Baldur's Gate 3: the trader's wares in a column on the left, the hero's bag on the right, and
 * between them the trader, the hero's gold and what the last trade came to. A row shows an item's picture, its name,
 * what it does in a line (a weapon's damage, armour's AC) and its price; under the pointer the item's whole tooltip, as
 * in the inventory. A click buys a ware, or sells a thing from the bag (for half its price, game/PlayerActions.ts);
 * what the hero sells the trader keeps, to buy back. Esc closes it (the scene does).
 */

/** The panel: at most this wide, this tall; the middle column this wide, the gaps between columns. */
const MAX_W = 600;
const PANEL_H = 300;
const MARGIN = 8;
const MID_W = 128;
const PAD = 8;
const COL_GAP = 6;
/** The column headings' band, and each row: this tall, its picture this big. */
const HEAD_H = 18;
const ROW_H = 24;
const ROW_GAP = 2;
const ICON = 20;
const ICON_PAD = 2;
/** The bitmap font's glyphs are this tall; a row's two lines stand this far down it. */
const GLYPH_H = 8;
const NAME_Y = 3;
const SUMMARY_Y = 13;
/** The wheel moves a list this far. */
const WHEEL_STEP = ROW_H + ROW_GAP;
/** The trader's portrait in the middle column: its strip's frame drawn this big, this far down. */
const PORTRAIT_SCALE = 0.9;
const PORTRAIT_Y = 18;
/** A price the hero cannot pay is shown in this colour; the line of what a thing does in this. */
const DEAR = 0xff7060;
const SUMMARY = 0x9fc79f;
const BG_ALPHA = 0.96;
const NAME_COLOR = 0xe8e0d0;

/** One of the two lists: its rows, the place they show through, how far it is scrolled, and its scrollbar. */
type List = {
  view: Container;
  rows: Container;
  window: Rectangle;
  scroll: number;
  height: number;
  bar: ScrollBar;
  /** The items listed, and for the bag the square each is on. */
  items: InventoryItem[];
  squares: number[];
};

export class ShopPanel {
  readonly container = new Container();
  private readonly frame = new Graphics();
  private readonly wares: List;
  private readonly bag: List;
  private readonly portrait = new Sprite(Texture.EMPTY);
  private readonly gold = new PixelLabel('', { color: 0xffcc00, align: 'center', shadow: true });
  private readonly message = new PixelLabel('', { color: THEME.text, align: 'center', shadow: true });
  private readonly tooltip = new ItemTooltip();
  private keeper: Entity | null = null;
  /** What the lists show, so they are rebuilt only when the wares, the bag or the gold change. */
  private shownMark = -1;
  private lastGold: number | null = null;
  private readonly width: number;
  private readonly left: number;
  private readonly top: number;

  constructor() {
    this.width = Math.min(MAX_W, GAME_WIDTH - 2 * MARGIN);
    this.left = Math.floor((GAME_WIDTH - this.width) / 2);
    this.top = Math.floor((VIEW_HEIGHT - PANEL_H) / 2);
    const sideW = Math.floor((this.width - MID_W - 2 * COL_GAP - 2 * PAD) / 2);
    const listTop = this.top + PAD + HEAD_H;
    const listH = PANEL_H - 2 * PAD - HEAD_H;
    this.wares = this.makeList(new Rectangle(this.left + PAD, listTop, sideW, listH));
    this.bag = this.makeList(new Rectangle(this.left + this.width - PAD - sideW, listTop, sideW, listH));
    this.build(sideW);
    this.container.visible = false;
    this.container.eventMode = 'static';
    this.container.hitArea = new Rectangle(0, 0, GAME_WIDTH, VIEW_HEIGHT);
    this.container.on('globalpointermove', (e) => this.hover(e));
  }

  // ── Layout ──────────────────────────────────────────────────────────────────

  private build(sideW: number): void {
    const { left, top, width } = this;
    this.frame.rect(left, top, width, PANEL_H).fill({ color: THEME.panel, alpha: BG_ALPHA }).stroke({ color: THEME.panelBorder, width: 2 });
    // The middle column's well, between the two lists.
    const midX = left + PAD + sideW + COL_GAP;
    this.frame.rect(midX, top + PAD, MID_W, PANEL_H - 2 * PAD).fill({ color: THEME.well, alpha: BG_ALPHA });
    this.container.addChild(this.frame);
    this.addHeading(text('shop.wares'), this.wares.window.x, top + PAD);
    this.addHeading(text('shop.your_bag'), this.bag.window.x, top + PAD);
    this.container.addChild(this.wares.view, this.bag.view, this.wares.bar.view, this.bag.bar.view);
    this.buildMiddle(midX + MID_W / 2);
    this.container.addChild(this.tooltip.view);
  }

  private addHeading(label: string, x: number, y: number): void {
    const heading = new PixelLabel(label, { color: THEME.title, shadow: true });
    heading.position.set(x + 2, y + Math.round((HEAD_H - GLYPH_H) / 2) - 2);
    this.container.addChild(heading);
  }

  /** The middle column: the trader's name and portrait, the hero's gold, what the last trade came to, and how to close. */
  private buildMiddle(centre: number): void {
    const { top } = this;
    const name = new PixelLabel(text('shop.trader'), { color: THEME.title, align: 'center', shadow: true });
    name.position.set(centre, top + PAD + 4);
    this.portrait.anchor.set(0.5, 0);
    this.portrait.scale.set(PORTRAIT_SCALE);
    this.portrait.position.set(centre, top + PAD + PORTRAIT_Y);
    this.gold.position.set(centre, top + PANEL_H / 2 + 44);
    this.message.position.set(centre, top + PANEL_H / 2 + 60);
    const hint = new PixelLabel(text('shop.close_hint'), { color: THEME.muted, align: 'center', shadow: true });
    hint.position.set(centre, top + PANEL_H - PAD - GLYPH_H - 4);
    const how = new PixelLabel(`${text('shop.buy_hint')}\n${text('shop.sell_hint')}`, { color: THEME.muted, align: 'center', shadow: true, lineHeight: 11 });
    how.position.set(centre, top + PANEL_H - PAD - GLYPH_H - 34);
    this.container.addChild(name, this.portrait, this.gold, this.message, how, hint);
  }

  private makeList(window: Rectangle): List {
    const view = new Container();
    const rows = new Container();
    view.addChild(rows);
    const mask = new Graphics().rect(window.x, window.y, window.width, window.height).fill({ color: 0xffffff });
    view.addChild(mask);
    rows.mask = mask;
    const bar = new ScrollBar(new Rectangle(window.x + window.width - ScrollBar.WIDTH, window.y, ScrollBar.WIDTH, window.height));
    const list: List = { view, rows, window, scroll: 0, height: 0, bar, items: [], squares: [] };
    view.eventMode = 'static';
    view.hitArea = window;
    view.on('wheel', (e: FederatedWheelEvent) => this.scroll(list, Math.sign(e.deltaY) * WHEEL_STEP));
    return list;
  }

  // ── Contents ────────────────────────────────────────────────────────────────

  /** Opens the panel on a trader's wares (or closes it). */
  setVisible(visible: boolean, keeper: Entity | null = this.keeper): void {
    if (visible && !this.container.visible) {
      sound.playLocal('dialog');
      this.message.text = '';
      this.lastGold = null;
      this.shownMark = -1;
    }
    if (!visible) this.tooltip.hide();
    this.keeper = keeper;
    this.container.visible = visible;
    claimPointer(this, visible);
  }

  /** Each tick while open: the portrait moves with the trader, and the lists follow the wares, the bag and the gold. */
  update(): void {
    const player = localPlayer();
    if (!this.container.visible || !player || !this.keeper) return;
    if (this.keeper.sprite) this.portrait.texture = this.keeper.sprite.texture;
    this.noteGold(player);
    const mark = this.contentsMark(player);
    if (mark === this.shownMark) return;
    this.shownMark = mark;
    this.fill(this.wares, shopWares(this.keeper), null, player);
    this.fillBag(player);
  }

  /** The gold changed (a trade went through): what it came to, and the trader nods. */
  private noteGold(player: Player): void {
    const gold = player.playerStats.gold;
    this.gold.text = text('shop.gold', { amount: gold });
    const last = this.lastGold;
    this.lastGold = gold;
    if (last === null || last === gold) return;
    this.message.text = gold > last ? text('shop.got', { amount: gold - last }) : text('shop.paid', { amount: last - gold });
    this.message.fill = gold > last ? 0xffcc00 : THEME.text;
    traderApproves();
  }

  /** A number that changes with the trader's offer, the bag's contents and the gold, built without allocating. */
  private contentsMark(player: Player): number {
    let mark = player.playerStats.gold * 7919;
    const inventory = player.inventory ?? [];
    for (let i = 0; i < inventory.length; i++) if (inventory[i]) mark += (i + 1) * 31;
    const shop = this.keeper?.shopNpc;
    return mark + (shop?.items.length ?? 0) * 100003 + (shop?.resale?.length ?? 0) * 1000003;
  }

  private fillBag(player: Player): void {
    const items: InventoryItem[] = [];
    const squares: number[] = [];
    (player.inventory ?? []).forEach((item, i) => {
      if (!item) return;
      items.push(item);
      squares.push(i);
    });
    this.fill(this.bag, items, squares, player);
  }

  /** Lays a list's rows out afresh: the wares at their price, or the bag's things at what the trader pays. */
  private fill(list: List, items: InventoryItem[], squares: number[] | null, player: Player): void {
    for (const child of list.rows.removeChildren()) child.destroy({ children: true });
    list.items = items;
    list.squares = squares ?? [];
    const selling = squares !== null;
    items.forEach((item, i) => {
      const price = selling ? sellPrice(item) : item.value;
      const affordable = selling || player.playerStats.gold >= price;
      list.rows.addChild(this.row(list, item, i, price, affordable));
    });
    if (selling && items.length === 0) {
      const empty = new PixelLabel(text('shop.empty_bag'), { color: THEME.muted, shadow: true });
      empty.position.set(list.window.x + PAD, list.window.y + PAD);
      list.rows.addChild(empty);
    }
    list.height = items.length * (ROW_H + ROW_GAP);
    this.scroll(list, 0);
  }

  /** One row: the item's picture, its name and what it does, its price (red where the hero cannot pay it). */
  private row(list: List, item: InventoryItem, i: number, price: number, affordable: boolean): Container {
    const w = list.window.width - ScrollBar.WIDTH - 2;
    const row = new Container();
    row.position.set(list.window.x, list.window.y + i * (ROW_H + ROW_GAP));
    const bg = new Graphics();
    const draw = (hover: boolean): void => {
      bg.clear().rect(0, 0, w, ROW_H).fill({ color: hover ? THEME.rowHover : THEME.row }).stroke({ color: THEME.panelBorder, width: 1, alignment: 1 });
    };
    draw(false);
    const icon = new Sprite(Texture.EMPTY);
    icon.anchor.set(0.5);
    icon.position.set(ICON_PAD + ICON / 2, ROW_H / 2);
    // The picture loads the first time it is shown: fitted to the row once it is there.
    const key = itemIcon(item);
    const show = (): void => {
      if (icon.destroyed) return;
      icon.texture = lazyTexture(key);
      icon.scale.set(ICON / Math.max(1, icon.texture.width, icon.texture.height));
    };
    reportRejection(requestArt(key).then(show), `Item icon ${key} did not load`, 'render');
    const priceLabel = new PixelLabel(text('shop.price', { price }), { color: affordable ? 0xffcc00 : DEAR, align: 'right', shadow: true });
    priceLabel.position.set(w - 4, Math.round((ROW_H - GLYPH_H) / 2));
    const textX = ICON_PAD * 2 + ICON + 2;
    const room = w - textX - priceLabel.textWidth - 8;
    const name = new PixelLabel(clip(item.name, room), { color: NAME_COLOR, shadow: true });
    name.position.set(textX, NAME_Y);
    const summary = new PixelLabel(clip(itemSummary(item), room), { color: SUMMARY, scale: 0.75, shadow: true });
    summary.position.set(textX, SUMMARY_Y);
    row.addChild(bg, icon, name, summary, priceLabel);
    row.eventMode = 'static';
    row.cursor = 'pointer';
    row.hitArea = new Rectangle(0, 0, w, ROW_H);
    row.on('pointerover', () => draw(true));
    row.on('pointerout', () => draw(false));
    row.on('pointertap', (e: FederatedPointerEvent) => this.trade(list, i, e));
    return row;
  }

  /** A click on a row: buys the ware, or sells the thing from the bag. */
  private trade(list: List, i: number, e: FederatedPointerEvent): void {
    e.stopPropagation();
    const player = localPlayer();
    if (!player) return;
    this.tooltip.hide();
    if (list === this.wares) requestBuy(player, i);
    else requestSell(player, list.squares[i] ?? -1);
  }

  /** Scrolls a list by `dy` (kept within it) and shows where it is on its scrollbar. */
  private scroll(list: List, dy: number): void {
    const view = list.window.height;
    const room = Math.max(0, list.height - view);
    list.scroll = Math.round(Math.max(0, Math.min(room, list.scroll + dy)));
    list.rows.y = -list.scroll;
    list.bar.set(room ? list.scroll / room : 0, room ? view / (room + view) : 1);
  }

  // ── Tooltips ────────────────────────────────────────────────────────────────

  /** Under the pointer, a row's item tells about itself as in the inventory (the hero's training, STR and feats flagged). */
  private hover(e: FederatedPointerEvent): void {
    if (!this.container.visible) return;
    const player = localPlayer();
    const p = this.container.toLocal(e.global);
    const item = this.itemAt(this.wares, p.x, p.y) ?? this.itemAt(this.bag, p.x, p.y);
    if (!item || !player) {
      this.tooltip.hide();
      return;
    }
    this.tooltip.show(item, p.x, p.y, { w: GAME_WIDTH, h: VIEW_HEIGHT }, tipContext(player));
  }

  private itemAt(list: List, x: number, y: number): InventoryItem | null {
    if (!list.window.contains(x, y)) return null;
    const i = Math.floor((y - list.window.y + list.scroll) / (ROW_H + ROW_GAP));
    return list.items[i] ?? null;
  }

  destroy(): void {
    claimPointer(this, false);
    this.container.destroy({ children: true });
  }
}

/** What an item's tooltip is told about the hero: their class, STR and the armour training their feats give. */
function tipContext(player: Player): TooltipContext {
  const sheet = characterSheet(player);
  return { cls: sheet.heroClass, strength: sheet.scores.strength, featArmor: sheet.feats.armor };
}

/** A line cut short (with an ellipsis) to about `width` pixels of the 8 px font. */
function clip(line: string, width: number): string {
  const chars = Math.max(4, Math.floor(width / 6));
  return line.length <= chars ? line : `${line.slice(0, chars - 1)}…`;
}
