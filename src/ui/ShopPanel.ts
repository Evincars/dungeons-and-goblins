import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { FederatedPointerEvent, FederatedWheelEvent } from 'pixi.js';
import { localPlayer } from '../world';
import type { Entity, InventoryItem, ItemType, Player } from '../world';
import { text } from '../core/texts';
import { reportRejection } from '../core/errors';
import { fuzzyMatch } from '../core/fuzzy';
import { THEME } from './Theme';
import { PixelLabel } from './PixelText';
import { GAME_WIDTH, VIEW_HEIGHT } from '../render/Camera';
import { requestBuy, requestSell, sellPrice, shopWares } from '../game/PlayerActions';
import { sound } from '../audio/SoundPlayer';
import { lazyTexture, requestArt } from '../assets/LazyArt';
import { itemIcon } from '../entities/Items';
import { ItemTooltip, MATCH_COLOR } from './ItemTooltip';
import type { TooltipContext } from './ItemTooltip';
import { characterSheet } from '../rules/CharacterSheet';
import { heroName } from '../rules/Names';
import { claimPointer } from '../systems/InputSystem';
import { ScrollBar } from './ScrollBar';
import { TextBox } from './TextBox';
import { itemSummary } from './ItemSummary';
import { traderApproves } from '../systems/TraderSystem';

/**
 * The trade screen, as in Baldur's Gate 3: the trader's wares in a column on the left, the hero's bag on the right, and
 * between them the trader, what each side has in gold and what the last trade came to. Each column has the inventory's
 * filters (all, armour, weapons, other) and its search (the letters of a name in order, lit in the name and the
 * tooltip, core/fuzzy.ts). A row shows an item's picture, its name, what it does in a line (a weapon's damage, armour's
 * AC) and its price; under the pointer the item's whole tooltip, as in the inventory. A click asks first ("Buy Longsword
 * for 15 gold?"), then buys the ware or sells the thing from the bag (for half its price, game/PlayerActions.ts); what
 * the hero sells the trader keeps, to buy back. Esc closes the question, leaves a search, then closes the screen.
 */

/** The panel: at most this wide, this tall; the middle column this wide, the gaps. */
const MAX_W = 620;
const PANEL_H = 336;
const MARGIN = 8;
const MID_W = 132;
const PAD = 8;
const COL_GAP = 6;
/** Above each list: its heading, the filters and the search box, this tall each, this far apart. */
const HEAD_H = 14;
const FILTER_H = 12;
const FILTER_GAP = 8;
const SEARCH_H = 16;
const ABOVE_GAP = 3;
/** Each row: this tall, its picture this big. */
const ROW_H = 24;
const ROW_GAP = 2;
const ICON = 20;
const ICON_PAD = 2;
/** The bitmap font's glyphs are this tall; a row's two lines stand this far down it. */
const GLYPH_H = 8;
const NAME_Y = 3;
const SUMMARY_Y = 13;
/** A name's letters in their runs: each run starts this far after the last one's ink. */
const LETTER_GAP = 1;
/** The wheel moves a list this far. */
const WHEEL_STEP = ROW_H + ROW_GAP;
/** The trader's portrait in the middle column: its strip's frame drawn this big, this far down. */
const PORTRAIT_SCALE = 0.9;
const PORTRAIT_Y = 14;
/** The middle column's lines, from its top: the gold of each side, what the last trade came to, the question. */
const GOLD_Y = 144;
const LINE_H = 12;
const QUESTION_Y = 206;
const BUTTON_W = 44;
const BUTTON_H = 14;
/** The longest search a box takes. */
const MAX_QUERY = 24;
/** A price the hero cannot pay is shown in this colour; the line of what a thing does in this. */
const DEAR = 0xff7060;
const SUMMARY = 0x9fc79f;
const GOLD = 0xffcc00;
const BG_ALPHA = 0.96;
const NAME_COLOR = 0xe8e0d0;

/** The filters over each list: All, Armour (shields too), Weapons, Other. */
type ListFilter = { label: string; types: readonly ItemType[] | null };
const FILTERS: readonly ListFilter[] = [
  { label: text('inventory.filter.all'), types: null },
  { label: text('inventory.filter.armour'), types: ['helmet', 'armor', 'boots', 'shield'] },
  { label: text('inventory.filter.weapons'), types: ['weapon'] },
  { label: text('inventory.filter.other'), types: ['ring', 'medal'] },
];

/**
 * One of the two lists: its rows, the place they show through, how far it is scrolled, its scrollbar, its filter and
 * search; the items it shows, each with its index among the trader's wares or its square in the bag.
 */
type List = {
  view: Container;
  rows: Container;
  window: Rectangle;
  scroll: number;
  height: number;
  bar: ScrollBar;
  filter: number;
  filterLabels: PixelLabel[];
  query: string;
  search: TextBox | null;
  items: InventoryItem[];
  places: number[];
};

/** A trade waiting for the hero's yes: buying a ware (its index) or selling a bag square's item, at this price. */
type Offer = { buying: boolean; place: number; item: InventoryItem; price: number };

export class ShopPanel {
  readonly container = new Container();
  private readonly frame = new Graphics();
  private readonly wares: List;
  private readonly bag: List;
  private readonly portrait = new Sprite(Texture.EMPTY);
  private readonly traderGold = new PixelLabel('', { color: GOLD, align: 'center', shadow: true });
  private readonly heroGold = new PixelLabel('', { color: GOLD, align: 'center', shadow: true });
  private readonly message = new PixelLabel('', { color: THEME.text, align: 'center', shadow: true, lineHeight: LINE_H });
  private readonly question = new Container();
  private readonly questionText = new PixelLabel('', { color: THEME.text, align: 'center', shadow: true, lineHeight: LINE_H });
  private readonly tooltip = new ItemTooltip();
  private keeper: Entity | null = null;
  private offer: Offer | null = null;
  /** The trade the hero said yes to, until the gold shows it went through (what the message then says). */
  private agreed: Offer | null = null;
  /** What the lists show, so they are rebuilt only when the wares, the bag, the gold, a filter or a search change. */
  private shownMark = -1;
  private lastGold: number | null = null;
  private readonly width: number;
  private readonly left: number;
  private readonly top: number;
  private readonly centre: number;

  constructor() {
    this.width = Math.min(MAX_W, GAME_WIDTH - 2 * MARGIN);
    this.left = Math.floor((GAME_WIDTH - this.width) / 2);
    this.top = Math.floor((VIEW_HEIGHT - PANEL_H) / 2);
    const sideW = Math.floor((this.width - MID_W - 2 * COL_GAP - 2 * PAD) / 2);
    const listTop = this.top + PAD + HEAD_H + FILTER_H + ABOVE_GAP + SEARCH_H + ABOVE_GAP;
    const listH = this.top + PANEL_H - PAD - listTop;
    this.wares = this.makeList(new Rectangle(this.left + PAD, listTop, sideW, listH));
    this.bag = this.makeList(new Rectangle(this.left + this.width - PAD - sideW, listTop, sideW, listH));
    this.centre = this.left + PAD + sideW + COL_GAP + MID_W / 2;
    this.build();
    this.container.visible = false;
    this.container.eventMode = 'static';
    this.container.hitArea = new Rectangle(0, 0, GAME_WIDTH, VIEW_HEIGHT);
    this.container.on('globalpointermove', (e) => this.hover(e));
  }

  // ── Layout ──────────────────────────────────────────────────────────────────

  private build(): void {
    const { left, top, width } = this;
    this.frame.rect(left, top, width, PANEL_H).fill({ color: THEME.panel, alpha: BG_ALPHA }).stroke({ color: THEME.panelBorder, width: 2 });
    // The middle column's well, between the two lists.
    this.frame.rect(this.centre - MID_W / 2, top + PAD, MID_W, PANEL_H - 2 * PAD).fill({ color: THEME.well, alpha: BG_ALPHA });
    this.container.addChild(this.frame);
    this.buildHead(this.wares, text('shop.wares'));
    this.buildHead(this.bag, text('shop.your_bag'));
    this.container.addChild(this.wares.view, this.bag.view, this.wares.bar.view, this.bag.bar.view);
    this.buildMiddle();
    this.buildQuestion();
    this.container.addChild(this.tooltip.view);
  }

  /** A list's heading and its filters, as words in a row: a click shows only that kind of item (the one on in gold). */
  private buildHead(list: List, heading: string): void {
    const x = list.window.x + 2;
    const y = this.top + PAD;
    const label = new PixelLabel(heading, { color: THEME.title, shadow: true });
    label.position.set(x, y);
    this.container.addChild(label);
    let fx = x;
    FILTERS.forEach((filter, i) => {
      const word = new PixelLabel(filter.label, { color: THEME.muted, shadow: true });
      word.position.set(fx, y + HEAD_H);
      word.eventMode = 'static';
      word.cursor = 'pointer';
      word.hitArea = new Rectangle(-1, -1, word.textWidth + 2, FILTER_H);
      word.on('pointertap', () => this.setFilter(list, i));
      list.filterLabels.push(word);
      this.container.addChild(word);
      fx += word.textWidth + FILTER_GAP;
    });
    this.setFilter(list, 0);
  }

  private setFilter(list: List, index: number): void {
    list.filter = index;
    list.scroll = 0;
    list.filterLabels.forEach((label, i) => { label.fill = i === index ? THEME.title : THEME.muted; });
    this.shownMark = -1;
  }

  /** The middle column: the trader's name and portrait, each side's gold, what the last trade came to, and how to trade. */
  private buildMiddle(): void {
    const { top, centre } = this;
    const name = new PixelLabel(text('shop.trader'), { color: THEME.title, align: 'center', shadow: true });
    name.position.set(centre, top + PAD + 2);
    this.portrait.anchor.set(0.5, 0);
    this.portrait.scale.set(PORTRAIT_SCALE);
    this.portrait.position.set(centre, top + PAD + PORTRAIT_Y);
    this.traderGold.position.set(centre, top + GOLD_Y);
    this.heroGold.position.set(centre, top + GOLD_Y + LINE_H);
    this.message.position.set(centre, top + GOLD_Y + 2 * LINE_H + 4);
    const how = new PixelLabel(`${text('shop.buy_hint')}\n${text('shop.sell_hint')}`, { color: THEME.muted, align: 'center', shadow: true, lineHeight: LINE_H });
    how.position.set(centre, top + PANEL_H - PAD - GLYPH_H - 4 - 3 * LINE_H);
    const hint = new PixelLabel(text('shop.close_hint'), { color: THEME.muted, align: 'center', shadow: true });
    hint.position.set(centre, top + PANEL_H - PAD - GLYPH_H - 4);
    this.container.addChild(name, this.portrait, this.traderGold, this.heroGold, this.message, how, hint);
  }

  /** The question a click asks ("Buy Longsword for 15 gold?"), with its two answers; hidden until there is one. */
  private buildQuestion(): void {
    const { centre, top } = this;
    const y = top + QUESTION_Y;
    const box = new Graphics().rect(centre - MID_W / 2 + 4, y - 4, MID_W - 8, 2 * LINE_H + BUTTON_H + 14)
      .fill({ color: THEME.panel }).stroke({ color: THEME.title, width: 1, alignment: 1 });
    this.questionText.position.set(centre, y);
    const yes = this.button(text('shop.yes'), centre - BUTTON_W - 3, y + 2 * LINE_H + 4, () => this.answer(true));
    const no = this.button(text('shop.no'), centre + 3, y + 2 * LINE_H + 4, () => this.answer(false));
    this.question.addChild(box, this.questionText, yes, no);
    this.question.visible = false;
    this.container.addChild(this.question);
  }

  private button(label: string, x: number, y: number, act: () => void): Container {
    const button = new Container();
    button.position.set(x, y);
    const bg = new Graphics();
    const draw = (hover: boolean): void => {
      bg.clear().rect(0, 0, BUTTON_W, BUTTON_H).fill({ color: hover ? THEME.rowHover : THEME.row }).stroke({ color: THEME.panelBorder, width: 1, alignment: 1 });
    };
    draw(false);
    const word = new PixelLabel(label, { color: THEME.buttonText, align: 'center', shadow: true });
    word.position.set(BUTTON_W / 2, Math.round((BUTTON_H - GLYPH_H) / 2));
    button.addChild(bg, word);
    button.eventMode = 'static';
    button.cursor = 'pointer';
    button.hitArea = new Rectangle(0, 0, BUTTON_W, BUTTON_H);
    button.on('pointerover', () => draw(true));
    button.on('pointerout', () => draw(false));
    button.on('pointertap', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      act();
    });
    return button;
  }

  private makeList(window: Rectangle): List {
    const view = new Container();
    const rows = new Container();
    view.addChild(rows);
    const mask = new Graphics().rect(window.x, window.y, window.width, window.height).fill({ color: 0xffffff });
    view.addChild(mask);
    rows.mask = mask;
    const bar = new ScrollBar(new Rectangle(window.x + window.width - ScrollBar.WIDTH, window.y, ScrollBar.WIDTH, window.height));
    const list: List = { view, rows, window, scroll: 0, height: 0, bar, filter: 0, filterLabels: [], query: '', search: null, items: [], places: [] };
    view.eventMode = 'static';
    view.hitArea = window;
    view.on('wheel', (e: FederatedWheelEvent) => this.scroll(list, Math.sign(e.deltaY) * WHEEL_STEP));
    return list;
  }

  /** The search boxes over the two lists, typed into through the page's canvas (the scene hands it over). */
  attachSearch(canvas: HTMLCanvasElement): void {
    for (const list of [this.wares, this.bag]) {
      if (list.search) continue;
      const box = { x: list.window.x, y: list.window.y - ABOVE_GAP - SEARCH_H, w: list.window.width - ScrollBar.WIDTH - 2, h: SEARCH_H };
      const search = new TextBox(canvas, box, { ariaLabel: text('inventory.search'), placeholder: text('inventory.search'), maxLength: MAX_QUERY });
      search.element.addEventListener('input', () => this.setQuery(list, search.value));
      search.visible = this.container.visible;
      list.search = search;
      this.container.addChildAt(search.view, this.container.getChildIndex(this.question));
    }
  }

  private setQuery(list: List, query: string): void {
    list.query = query.trim();
    list.scroll = 0;
    this.shownMark = -1;
  }

  // ── Contents ────────────────────────────────────────────────────────────────

  /** Opens the panel on a trader's wares (or closes it). */
  setVisible(visible: boolean, keeper: Entity | null = this.keeper): void {
    const opening = visible && !this.container.visible;
    if (opening) {
      sound.playLocal('dialog');
      this.message.text = '';
      this.lastGold = null;
      this.shownMark = -1;
    }
    if (!visible && this.container.visible) this.closed();
    this.keeper = keeper;
    this.container.visible = visible;
    for (const list of [this.wares, this.bag]) if (list.search) list.search.visible = visible;
    claimPointer(this, visible);
  }

  private closed(): void {
    this.tooltip.hide();
    this.ask(null);
    for (const list of [this.wares, this.bag]) list.search?.element.blur();
  }

  /** Esc inside the screen: closes the question, or leaves a search; false when neither was open (the screen goes). */
  handleEscape(): boolean {
    if (this.offer) {
      this.ask(null);
      return true;
    }
    for (const list of [this.wares, this.bag]) {
      if (!list.search || document.activeElement !== list.search.element) continue;
      list.search.element.blur();
      return true;
    }
    return false;
  }

  /** Each tick while open: the portrait moves with the trader, and the lists follow the wares, the bag, the gold and the filters. */
  update(): void {
    const player = localPlayer();
    if (!this.container.visible || !player || !this.keeper) return;
    for (const list of [this.wares, this.bag]) if (list.search) list.search.clickable = !this.offer;
    if (this.keeper.sprite) this.portrait.texture = this.keeper.sprite.texture;
    this.showGold(player);
    const mark = this.contentsMark(player);
    if (mark === this.shownMark) return;
    this.shownMark = mark;
    this.fillWares(player);
    this.fillBag(player);
  }

  /** Each side's gold; once the hero's has changed after a yes, what the trade came to, and the trader will nod. */
  private showGold(player: Player): void {
    const gold = player.playerStats.gold;
    this.traderGold.text = text('shop.has_gold', { name: text('shop.trader'), amount: this.keeper?.shopNpc?.gold ?? 0 });
    this.heroGold.text = text('shop.has_gold', { name: player.playerName || heroName(characterSheet(player).heroClass.id), amount: gold });
    const last = this.lastGold;
    this.lastGold = gold;
    const deal = this.agreed;
    if (last === null || last === gold || !deal) return;
    this.agreed = null;
    this.say(text(deal.buying ? 'shop.bought' : 'shop.sold', { item: clip(deal.item.name, MID_W - 30), amount: deal.price }), deal.buying ? THEME.text : GOLD);
    traderApproves();
  }

  /** What the last trade came to (or why it could not be), each of its lines cut to the middle column. */
  private say(lines: string, color: number): void {
    this.message.text = lines.split('\n').map((line) => clip(line, MID_W - 6)).join('\n');
    this.message.fill = color;
  }

  /** A number that changes with the trader's offer, the bag's contents, the gold, the filters and the searches, built without allocating. */
  private contentsMark(player: Player): number {
    let mark = player.playerStats.gold * 7919;
    const inventory = player.inventory ?? [];
    for (let i = 0; i < inventory.length; i++) if (inventory[i]) mark += (i + 1) * 31;
    const shop = this.keeper?.shopNpc;
    mark += (shop?.items.length ?? 0) * 100003 + (shop?.resale?.length ?? 0) * 1000003;
    return mark + (this.wares.filter + 1) * 13 + (this.bag.filter + 1) * 17 + this.wares.query.length * 101 + this.bag.query.length * 103;
  }

  /** Whether a list shows an item: of its filter's kinds, its name holding the letters searched for. */
  private shows(list: List, item: InventoryItem): boolean {
    const types = FILTERS[list.filter].types;
    return (!types || types.includes(item.type)) && (list.query === '' || fuzzyMatch(list.query, item.name) !== null);
  }

  private fillWares(player: Player): void {
    const items: InventoryItem[] = [];
    const places: number[] = [];
    shopWares(this.keeper ?? {}).forEach((item, i) => {
      if (!this.shows(this.wares, item)) return;
      items.push(item);
      places.push(i);
    });
    this.fill(this.wares, items, places, false, player);
  }

  private fillBag(player: Player): void {
    const items: InventoryItem[] = [];
    const places: number[] = [];
    (player.inventory ?? []).forEach((item, i) => {
      if (!item || !this.shows(this.bag, item)) return;
      items.push(item);
      places.push(i);
    });
    this.fill(this.bag, items, places, true, player);
  }

  /** Lays a list's rows out afresh: the wares at their price, or the bag's things at what the trader pays. */
  private fill(list: List, items: InventoryItem[], places: number[], selling: boolean, player: Player): void {
    for (const child of list.rows.removeChildren()) child.destroy({ children: true });
    list.items = items;
    list.places = places;
    items.forEach((item, i) => {
      const price = selling ? sellPrice(item) : item.value;
      const affordable = selling ? (this.keeper?.shopNpc?.gold ?? price) >= price : player.playerStats.gold >= price;
      list.rows.addChild(this.row(list, item, i, price, affordable, selling));
    });
    if (items.length === 0) {
      const empty = new PixelLabel(text(selling && list.query === '' && list.filter === 0 ? 'shop.empty_bag' : 'shop.nothing_found'), { color: THEME.muted, shadow: true });
      empty.position.set(list.window.x + PAD, list.window.y + PAD);
      list.rows.addChild(empty);
    }
    list.height = items.length * (ROW_H + ROW_GAP);
    this.scroll(list, 0);
  }

  /** One row: the item's picture, its name (the letters a search matched lit) and what it does, its price (red where it cannot be paid). */
  private row(list: List, item: InventoryItem, i: number, price: number, affordable: boolean, selling: boolean): Container {
    const w = list.window.width - ScrollBar.WIDTH - 2;
    const row = new Container();
    row.position.set(list.window.x, list.window.y + i * (ROW_H + ROW_GAP));
    const bg = new Graphics();
    const draw = (hover: boolean): void => {
      bg.clear().rect(0, 0, w, ROW_H).fill({ color: hover ? THEME.rowHover : THEME.row }).stroke({ color: THEME.panelBorder, width: 1, alignment: 1 });
    };
    draw(false);
    const icon = this.icon(item);
    const priceLabel = new PixelLabel(text('shop.price', { price }), { color: affordable ? GOLD : DEAR, align: 'right', shadow: true });
    priceLabel.position.set(w - 4, Math.round((ROW_H - GLYPH_H) / 2));
    const textX = ICON_PAD * 2 + ICON + 2;
    const room = w - textX - priceLabel.textWidth - 8;
    const name = nameRuns(clip(item.name, room), list.query ? fuzzyMatch(list.query, item.name) ?? [] : []);
    name.position.set(textX, NAME_Y);
    const summary = new PixelLabel(clip(itemSummary(item), room), { color: SUMMARY, scale: 0.75, shadow: true });
    summary.position.set(textX, SUMMARY_Y);
    row.addChild(bg, icon, name, summary, priceLabel);
    row.eventMode = 'static';
    row.cursor = 'pointer';
    row.hitArea = new Rectangle(0, 0, w, ROW_H);
    row.on('pointerover', () => draw(true));
    row.on('pointerout', () => draw(false));
    row.on('pointertap', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.ask({ buying: !selling, place: list.places[i] ?? -1, item, price });
    });
    return row;
  }

  /** An item's picture, fitted to the row once it has loaded (it loads the first time it is shown). */
  private icon(item: InventoryItem): Sprite {
    const icon = new Sprite(Texture.EMPTY);
    icon.anchor.set(0.5);
    icon.position.set(ICON_PAD + ICON / 2, ROW_H / 2);
    const key = itemIcon(item);
    const show = (): void => {
      if (icon.destroyed) return;
      icon.texture = lazyTexture(key);
      icon.scale.set(ICON / Math.max(1, icon.texture.width, icon.texture.height));
    };
    reportRejection(requestArt(key).then(show), `Item icon ${key} did not load`, 'render');
    return icon;
  }

  // ── Trading ─────────────────────────────────────────────────────────────────

  /** Asks the hero to confirm a trade (or, with null, puts the question away). */
  private ask(offer: Offer | null): void {
    this.offer = offer;
    this.question.visible = !!offer;
    this.tooltip.hide();
    if (!offer) return;
    const what = text(offer.buying ? 'shop.confirm_buy' : 'shop.confirm_sell', { item: clip(offer.item.name, MID_W - 12) });
    this.questionText.text = `${what}\n${text('shop.confirm_price', { amount: offer.price })}`;
  }

  /** The hero's answer: yes buys or sells (if each side can pay), no just puts the question away. */
  private answer(yes: boolean): void {
    const offer = this.offer;
    const player = localPlayer();
    this.ask(null);
    if (!yes || !offer || !player) return;
    const traderGold = this.keeper?.shopNpc?.gold;
    if (offer.buying && player.playerStats.gold < offer.price) return this.refuse('shop.too_poor');
    if (!offer.buying && traderGold !== undefined && traderGold < offer.price) return this.refuse('shop.trader_too_poor');
    this.agreed = offer;
    if (offer.buying) requestBuy(player, offer.place);
    else requestSell(player, offer.place);
  }

  private refuse(why: 'shop.too_poor' | 'shop.trader_too_poor'): void {
    this.say(text(why), DEAR);
    sound.playLocal('fail');
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
    const list = this.wares.window.contains(p.x, p.y) ? this.wares : this.bag;
    const item = this.offer ? null : this.itemAt(list, p.x, p.y);
    if (!item || !player) {
      this.tooltip.hide();
      return;
    }
    const matched = list.query ? fuzzyMatch(list.query, item.name) ?? [] : [];
    this.tooltip.show(item, p.x, p.y, { w: GAME_WIDTH, h: VIEW_HEIGHT }, { ...tipContext(player), matched });
  }

  private itemAt(list: List, x: number, y: number): InventoryItem | null {
    if (!list.window.contains(x, y)) return null;
    const i = Math.floor((y - list.window.y + list.scroll) / (ROW_H + ROW_GAP));
    return list.items[i] ?? null;
  }

  destroy(): void {
    claimPointer(this, false);
    for (const list of [this.wares, this.bag]) list.search?.destroy();
    this.container.destroy({ children: true });
  }
}

/** What an item's tooltip is told about the hero: their class, STR and the armour training their feats give. */
function tipContext(player: Player): TooltipContext {
  const sheet = characterSheet(player);
  return { cls: sheet.heroClass, strength: sheet.scores.strength, modifiers: sheet.modifiers, featArmor: sheet.feats.armor, featWeapons: sheet.feats.weapons };
}

/** A name in runs of letters, those a search matched (`matched`, indices) lit, as the tooltip's header shows it. */
function nameRuns(name: string, matched: readonly number[]): Container {
  const lit = new Set(matched);
  const out = new Container();
  let x = 0;
  let start = 0;
  for (let i = 1; i <= name.length; i++) {
    if (i < name.length && lit.has(i) === lit.has(start)) continue;
    const run = new PixelLabel(name.slice(start, i), { color: lit.has(start) ? MATCH_COLOR : NAME_COLOR, shadow: true });
    run.x = x;
    out.addChild(run);
    x += run.textWidth + LETTER_GAP;
    start = i;
  }
  return out;
}

/** A line cut short (with an ellipsis) to about `width` pixels of the 8 px font. */
function clip(line: string, width: number): string {
  const chars = Math.max(4, Math.floor(width / 6));
  return line.length <= chars ? line : `${line.slice(0, chars - 1)}…`;
}
