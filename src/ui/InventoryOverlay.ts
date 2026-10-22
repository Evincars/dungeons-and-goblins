import { Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import { EQUIP_SLOTS, STAT_NAMES, localPlayer } from '../world';
import type { InventoryItem, Player, StatName } from '../world';
import { GAME_WIDTH, GAME_HEIGHT } from '../render/Camera';
import { getTexture } from '../assets/Textures';
import { lazyTexture, onArtLoaded } from '../assets/LazyArt';
import { ItemTooltip } from './ItemTooltip';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';
import { INVENTORY_COLS, INVENTORY_ROWS, moveItem, requestLoadout } from '../game/PlayerActions';
import type { ItemPlace } from '../game/PlayerActions';
import { SLOT_LABELS, STAT_LABELS, itemIcon, statTotals } from '../entities/Items';

/** inventory.png, measured in its own pixels: the leather bag panel, the cloth gear panel, and its two tabs. */
const ART = { w: 2752, h: 1536 };
const BAG_AREA = { x: 78, y: 284, w: 1108, h: 1174 };
const GEAR_AREA = { x: 1404, y: 320, w: 1264, h: 1138 };
const TABS = [{ x: 1331, y: 5, w: 378, h: 210 }, { x: 1765, y: 5, w: 378, h: 210 }];
const TAB_TITLES = ['GEAR', 'STATS'];
/** The part of a tab inside its iron frame (art pixels in from its edges), which lights up. */
const TAB_INSET = { side: 44, top: 70, bottom: 6 };
/** A tab under the pointer brightens; the open one brightens more and is underlined; the others are dimmed. */
const TAB_HOVER_ALPHA = 0.06;
const TAB_ACTIVE_ALPHA = 0.12;
const TAB_IDLE_DIM = 0.35;
const TAB_UNDERLINE = 2;
/** Placeholder for the Stats tab, until it has something to show. */
const STATS_TAB_TEXT = 'test text here...';
/** Where the title sits, above the bag panel. */
const TITLE = { x: 80, y: 6 };
/** Height of a stack count, drawn in a square's bottom corner. */
const COUNT_H = 9;

/**
 * The screen is laid out once at this width (the art scaled down to it) and then scaled whole to fit the
 * screen, so it looks the same on a tablet, a small laptop or an ultra-wide monitor.
 */
const DESIGN_W = 560;
const K = DESIGN_W / ART.w;
const DESIGN_H = ART.h * K;
/** Space kept round the overlay, in screen pixels. */
const SCREEN_MARGIN = 8;
/** Inside a panel: padding to its edge, the gap between squares, and between an icon and its square. */
const PAD = 6;
const GAP = 3;
const ICON_PAD = 3;
/** Between an equipment label and its square, and between the gear and stats columns. */
const LABEL_GAP = 6;
const COLUMN_GAP = 10;
const SQUARE_FILL_ALPHA = 0.35;
const SQUARE_EDGE = 0xb4a488;
const SQUARE_EDGE_ALPHA = 0.55;
const DIM_ALPHA = 0.6;
const GHOST_ALPHA = 0.85;

type Rect = { x: number; y: number; w: number; h: number };
/** `page`: the tab page the square is on (bag squares are always shown). */
type Square = { place: ItemPlace; box: Rectangle; icon: Sprite; count: PixelLabel; page: Container | null };
type Tab = { glow: Graphics; label: PixelLabel; page: Container; hovered: boolean; w: number; h: number };

/** A rect of the art, in the overlay's design space. */
function designRect(r: Rect): Rect {
  return { x: r.x * K, y: r.y * K, w: r.w * K, h: r.h * K };
}

function samePlace(a: ItemPlace, b: ItemPlace): boolean {
  if ('bag' in a) return 'bag' in b && a.bag === b.bag;
  return 'slot' in b && a.slot === b.slot;
}


/**
 * Tab opens it: the bag as a grid of squares on the left; on the right two tabs, Gear (the equipment slots,
 * each a square of the same kind, and the stats the worn gear adds up to) and Stats (to come). Items are
 * dragged between squares.
 */
export class InventoryOverlay {
  readonly container = new Container();
  private readonly root = new Container();
  private readonly squares: Square[] = [];
  private readonly statValues = new Map<StatName, PixelLabel>();
  private readonly gold = new PixelLabel('', { color: 0xffcc00, align: 'right', shadow: true });
  private readonly tooltip = new ItemTooltip();
  private readonly ghost = new Sprite();
  private readonly tabs: Tab[] = [];
  private activeTab = 0;
  private cell = 0;
  private dragging: ItemPlace | null = null;
  private readonly stopListening: () => void;
  /** What the squares show, so they are redrawn only when the player's things change. */
  private shown: { inventory: unknown; count: number; equipped: unknown; gold: number } | null = null;

  constructor() {
    this.container.visible = false;
    this.container.addChild(new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: THEME.backdrop, alpha: DIM_ALPHA }), this.root);
    this.build();
    this.fitToScreen();
    this.listen();
    // Item pictures load the first time they are shown: draw again once they arrive.
    this.stopListening = onArtLoaded(() => {
      this.shown = null;
      this.tooltip.invalidate();
    });
  }

  setVisible(visible: boolean): void {
    if (this.container.visible === visible) return;
    this.container.visible = visible;
    this.shown = null;
    if (!visible) this.endDrag();
  }

  update(): void {
    const player = localPlayer();
    if (!this.container.visible || !player) return;
    const inventory = player.inventory ?? [];
    const equipped = player.equipped ?? {};
    const s = this.shown;
    if (s && s.inventory === inventory && s.count === inventory.length && s.equipped === equipped && s.gold === player.playerStats.gold) return;
    this.shown = { inventory, count: inventory.length, equipped, gold: player.playerStats.gold };
    this.refresh(player);
  }

  destroy(): void {
    this.stopListening();
    this.container.destroy({ children: true });
  }

  // ── Layout ──────────────────────────────────────────────────────────────────

  private build(): void {
    const art = new Sprite(getTexture('inventory_art'));
    art.scale.set(K);
    this.root.addChild(art);
    const title = new PixelLabel('INVENTORY', { color: THEME.title, scale: 2, shadow: true });
    title.position.set(TITLE.x * K, TITLE.y);
    this.gold.position.set((BAG_AREA.x + BAG_AREA.w) * K, TITLE.y + 4);
    this.root.addChild(title, this.gold);
    this.buildBag(designRect(BAG_AREA));
    const gearPage = new Container();
    const statsPage = new Container();
    this.root.addChild(gearPage, statsPage);
    this.buildGear(designRect(GEAR_AREA), gearPage);
    this.buildStatsPage(designRect(GEAR_AREA), statsPage);
    [gearPage, statsPage].forEach((page, i) => this.addTab(designRect(TABS[i]), TAB_TITLES[i], page));
    this.showTab(0);
    this.ghost.anchor.set(0.5);
    this.ghost.alpha = GHOST_ALPHA;
    this.ghost.visible = false;
    this.root.addChild(this.ghost, this.tooltip.view);
  }

  /** A clickable tab over the art's tab: it lights up under the pointer and when open, and shows its page. */
  private addTab(tab: Rect, text: string, page: Container): void {
    const inner = {
      x: tab.x + TAB_INSET.side * K, y: tab.y + TAB_INSET.top * K,
      w: tab.w - 2 * TAB_INSET.side * K, h: tab.h - (TAB_INSET.top + TAB_INSET.bottom) * K,
    };
    const glow = new Graphics();
    glow.position.set(inner.x, inner.y);
    const label = new PixelLabel(text, { color: THEME.buttonText, align: 'center', shadow: true });
    label.position.set(Math.round(inner.x + inner.w / 2), Math.round(inner.y + inner.h / 2 - 4));
    const hit = new Container();
    hit.eventMode = 'static';
    hit.cursor = 'pointer';
    hit.hitArea = new Rectangle(inner.x, inner.y, inner.w, inner.h);
    const entry: Tab = { glow, label, page, hovered: false, w: inner.w, h: inner.h };
    const index = this.tabs.length;
    hit.on('pointerover', () => this.hoverTab(entry, true));
    hit.on('pointerout', () => this.hoverTab(entry, false));
    hit.on('pointertap', () => this.showTab(index));
    this.tabs.push(entry);
    this.root.addChild(glow, label, hit);
    this.drawTab(entry);
  }

  private hoverTab(tab: Tab, hovered: boolean): void {
    tab.hovered = hovered;
    this.drawTab(tab);
  }

  /** Opens a tab: its page shows, the others hide, and every tab redraws its look. */
  private showTab(index: number): void {
    this.activeTab = index;
    this.tabs.forEach((tab, i) => {
      tab.page.visible = i === index;
      this.drawTab(tab);
    });
  }

  /** The open tab glows and is underlined in gold; one under the pointer brightens; the rest are dimmed. */
  private drawTab(tab: Tab): void {
    const { w, h } = tab;
    const active = this.tabs[this.activeTab] === tab;
    const g = tab.glow.clear();
    if (active) {
      g.rect(0, 0, w, h).fill({ color: 0xffffff, alpha: TAB_ACTIVE_ALPHA });
      g.rect(0, h - TAB_UNDERLINE, w, TAB_UNDERLINE).fill({ color: THEME.title });
    } else {
      g.rect(0, 0, w, h).fill({ color: tab.hovered ? 0xffffff : 0x000000, alpha: tab.hovered ? TAB_HOVER_ALPHA : TAB_IDLE_DIM });
    }
    tab.label.fill = active ? THEME.title : tab.hovered ? THEME.buttonHover : THEME.muted;
  }

  /** The bag: the largest square cells that fit the leather panel's grid, centred in it. */
  private buildBag(area: Rect): void {
    const cols = INVENTORY_COLS;
    const rows = INVENTORY_ROWS;
    // Bag and equipment squares are one size: as large as both the bag grid and the gear rows allow.
    const gearRow = (designRect(GEAR_AREA).h - 2 * PAD) / EQUIP_SLOTS.length - GAP;
    const bagCell = Math.min((area.w - 2 * PAD - GAP * (cols - 1)) / cols, (area.h - 2 * PAD - GAP * (rows - 1)) / rows);
    this.cell = Math.floor(Math.min(bagCell, gearRow));
    const x0 = area.x + (area.w - (cols * this.cell + (cols - 1) * GAP)) / 2;
    const y0 = area.y + (area.h - (rows * this.cell + (rows - 1) * GAP)) / 2;
    for (let i = 0; i < cols * rows; i++) {
      const x = x0 + (i % cols) * (this.cell + GAP);
      const y = y0 + Math.floor(i / cols) * (this.cell + GAP);
      this.addSquare({ bag: i }, Math.round(x), Math.round(y));
    }
  }

  /**
   * The Gear tab: each equipment square with its name to its right, a dividing line, then the stats and
   * their values.
   */
  private buildGear(area: Rect, page: Container): void {
    const rowH = (area.h - 2 * PAD) / EQUIP_SLOTS.length;
    const squareX = area.x + PAD;
    const labelX = squareX + this.cell + LABEL_GAP;
    const labels = EQUIP_SLOTS.map((slot) => new PixelLabel(SLOT_LABELS[slot], { color: THEME.text, shadow: true }));
    EQUIP_SLOTS.forEach((slot, i) => {
      const y = area.y + PAD + i * rowH;
      this.addSquare({ slot }, Math.round(squareX), Math.round(y + (rowH - this.cell) / 2), page);
      labels[i].position.set(Math.round(labelX), Math.round(y + (rowH - 8) / 2));
      page.addChild(labels[i]);
    });
    const dividerX = Math.round(labelX + Math.max(...labels.map((l) => l.textWidth)) + COLUMN_GAP);
    page.addChild(new Graphics()
      .rect(dividerX, area.y + PAD, 1, area.h - 2 * PAD).fill({ color: SQUARE_EDGE, alpha: SQUARE_EDGE_ALPHA }));
    const statsX = dividerX + COLUMN_GAP;
    const valueX = area.x + area.w - PAD;
    STAT_NAMES.forEach((stat, i) => this.addStatRow(stat, statsX, valueX, area.y + PAD + i * rowH + (rowH - 8) / 2, page));
  }

  /** The Stats tab: nothing to show yet but a placeholder line. */
  private buildStatsPage(area: Rect, page: Container): void {
    const text = new PixelLabel(STATS_TAB_TEXT, { color: THEME.muted, shadow: true });
    text.position.set(Math.round(area.x + PAD * 2), Math.round(area.y + PAD * 2));
    page.addChild(text);
  }

  private addStatRow(stat: StatName, x: number, valueX: number, y: number, page: Container): void {
    const label = new PixelLabel(STAT_LABELS[stat], { color: THEME.text, shadow: true });
    const value = new PixelLabel('0', { color: THEME.title, align: 'right', shadow: true });
    label.position.set(Math.round(x), Math.round(y));
    value.position.set(Math.round(valueX), Math.round(y));
    this.statValues.set(stat, value);
    page.addChild(label, value);
  }

  /** One square (bag cell or equipment slot): a dark well with a light edge, and the icon of what is in it. */
  private addSquare(place: ItemPlace, x: number, y: number, page: Container | null = null): void {
    const size = this.cell;
    const frame = new Graphics()
      .rect(x, y, size, size).fill({ color: 0x000000, alpha: SQUARE_FILL_ALPHA })
      .stroke({ color: SQUARE_EDGE, alpha: SQUARE_EDGE_ALPHA, width: 1, alignment: 1 });
    const icon = new Sprite();
    icon.anchor.set(0.5);
    icon.position.set(x + size / 2, y + size / 2);
    // How many are stacked here (arrows), in the square's corner.
    const count = new PixelLabel('', { color: THEME.text, align: 'right', outline: true });
    count.position.set(x + size - 1, y + size - COUNT_H);
    (page ?? this.root).addChild(frame, icon, count);
    this.squares.push({ place, box: new Rectangle(x, y, size, size), icon, count, page });
  }

  /** Scales the whole overlay to the largest size that fits the screen with a margin, centred. */
  private fitToScreen(): void {
    const scale = Math.min((GAME_WIDTH - 2 * SCREEN_MARGIN) / DESIGN_W, (GAME_HEIGHT - 2 * SCREEN_MARGIN) / DESIGN_H);
    this.root.scale.set(scale);
    this.root.position.set(Math.round((GAME_WIDTH - DESIGN_W * scale) / 2), Math.round((GAME_HEIGHT - DESIGN_H * scale) / 2));
  }

  // ── Contents ────────────────────────────────────────────────────────────────

  private itemIn(player: Player, place: ItemPlace): InventoryItem | undefined {
    return 'bag' in place ? player.inventory?.[place.bag] : player.equipped?.[place.slot];
  }

  /** Shows an item's picture in a sprite, as large as fits a square (loading it the first time). */
  private showIcon(sprite: Sprite, item: InventoryItem | undefined): void {
    sprite.visible = !!item;
    if (!item) return;
    sprite.texture = lazyTexture(itemIcon(item));
    const room = this.cell - 2 * ICON_PAD;
    sprite.scale.set(Math.min(room / Math.max(1, sprite.texture.width), room / Math.max(1, sprite.texture.height)));
  }

  private refresh(player: Player): void {
    for (const square of this.squares) {
      const item = this.itemIn(player, square.place);
      this.showIcon(square.icon, item);
      square.count.text = item?.count !== undefined ? String(item.count) : '';
    }
    const totals = statTotals(player.equipped ?? {});
    for (const [stat, label] of this.statValues) label.text = String(totals[stat]);
    this.gold.text = `Gold: ${player.playerStats.gold}`;
  }

  // ── Dragging ────────────────────────────────────────────────────────────────

  private listen(): void {
    this.root.eventMode = 'static';
    this.root.hitArea = new Rectangle(0, 0, DESIGN_W, DESIGN_H);
    this.root.on('pointerdown', (e) => this.startDrag(e));
    this.root.on('globalpointermove', (e) => this.moveDrag(e));
    this.root.on('pointerup', (e) => this.drop(e));
    this.root.on('pointerupoutside', () => this.endDrag());
  }

  private squareAt(e: FederatedPointerEvent): Square | undefined {
    const p = this.root.toLocal(e.global);
    return this.squares.find((s) => (!s.page || s.page.visible) && s.box.contains(p.x, p.y));
  }

  private startDrag(e: FederatedPointerEvent): void {
    const player = localPlayer();
    const square = this.squareAt(e);
    if (!player || !square || !this.itemIn(player, square.place)) return;
    this.dragging = square.place;
    this.showIcon(this.ghost, this.itemIn(player, square.place));
    square.icon.alpha = 0.3;
    this.moveDrag(e);
  }

  /** The ghost follows the pointer; with nothing held, the tooltip tells about the item under it. */
  private moveDrag(e: FederatedPointerEvent): void {
    if (!this.container.visible) return;
    const p = this.root.toLocal(e.global);
    this.ghost.position.set(p.x, p.y);
    const player = localPlayer();
    const square = this.squareAt(e);
    const item = player && square && !this.dragging ? this.itemIn(player, square.place) : undefined;
    if (item) this.tooltip.show(item, p.x, p.y, { w: DESIGN_W, h: DESIGN_H });
    else this.tooltip.hide();
  }

  private drop(e: FederatedPointerEvent): void {
    const player = localPlayer();
    const from = this.dragging;
    const target = this.squareAt(e);
    this.endDrag();
    if (!player || !from || !target || samePlace(from, target.place)) return;
    const next = moveItem({ inventory: player.inventory ?? [], equipped: player.equipped ?? {} }, from, target.place);
    if (next) requestLoadout(player, next);
  }

  private endDrag(): void {
    this.dragging = null;
    this.ghost.visible = false;
    for (const square of this.squares) square.icon.alpha = 1;
    this.shown = null;
  }
}
