import { Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import { EQUIP_SLOTS, STAT_NAMES, localPlayer } from '../world';
import type { BagSquare, EquipSlot, InventoryItem, Player, StatName } from '../world';
import { GAME_WIDTH, GAME_HEIGHT } from '../render/Camera';
import { getTexture } from '../assets/Textures';
import { lazyTexture, onArtLoaded } from '../assets/LazyArt';
import { ItemTooltip } from './ItemTooltip';
import { InfoTooltip } from './InfoTooltip';
import type { TipTopic } from './InfoTooltip';
import { SheetField } from './SheetField';
import { armorClassTopic, damageTopic, hitPointsTopic, statTopic } from './SheetTopics';
import { text } from '../core/texts';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';
import { INVENTORY_COLS, INVENTORY_ROWS, MAX_CARRY_KG, carriedWeight, freeSquare, moveItem, requestLoadout } from '../game/PlayerActions';
import type { ItemPlace } from '../game/PlayerActions';
import { itemIcon, slotFor, slotLabel, statShort } from '../entities/Items';
import { characterSheet } from '../rules/CharacterSheet';
import type { CharacterSheet } from '../rules/CharacterSheet';
import { formatDice, formatModifier } from '../rules/Dice';

/** inventory.png, measured in its own pixels: the leather bag panel, the cloth gear panel, and its two tabs. */
const ART = { w: 2752, h: 1536 };
const BAG_AREA = { x: 78, y: 284, w: 1108, h: 1174 };
const GEAR_AREA = { x: 1404, y: 320, w: 1264, h: 1138 };
const TABS = [{ x: 1331, y: 5, w: 378, h: 210 }, { x: 1765, y: 5, w: 378, h: 210 }];
const TAB_TITLES = [text('inventory.tab_gear'), text('inventory.tab_stats')];
/** The part of a tab inside its iron frame (art pixels in from its edges), which lights up. */
const TAB_INSET = { side: 44, top: 70, bottom: 6 };
/** A tab under the pointer brightens; the open one brightens more and is underlined; the others are dimmed. */
const TAB_HOVER_ALPHA = 0.06;
const TAB_ACTIVE_ALPHA = 0.12;
const TAB_IDLE_DIM = 0.35;
const TAB_UNDERLINE = 2;
/** Where the title sits, above the bag panel. */
const TITLE = { x: 80, y: 6 };
/** The weight carried shows under the gold; it turns orange past this share of what can be carried. */
const WEIGHT_ROW = 11;
const HEAVY_SHARE = 0.9;

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
/** The bag grid keeps this far inside the leather's edges, and its squares this far apart (the grid is centred). */
const BAG_PAD = 2;
const BAG_GAP = 1;
/** Two presses on one square this quickly (the usual desktop double-click time) is a double-click: it puts the item on, or takes it off. */
const DOUBLE_CLICK_MS = 500;
/** The part of a stat's short name that reacts to the pointer reaches this far past the letters. */
const STAT_HIT_PAD = 2;
/** Between an equipment label and its square, and between the gear and stats columns. */
const LABEL_GAP = 6;
const COLUMN_GAP = 10;
/** The stats take this share of the Gear page's height; the Armor Class, hit point and damage fields fill the rest. */
const STATS_SHARE = 0.6;
/** A stat's score sits this far left of its modifier (the modifier, what rolls add, is the number that matters). */
const SCORE_COLUMN = 24;
/** Space round the rule under the stats, and between the fields. */
const RULE_GAP = 4;
const FIELD_GAP = 4;
const SQUARE_FILL_ALPHA = 0.35;
const SQUARE_EDGE = 0xb4a488;
const SQUARE_EDGE_ALPHA = 0.55;
const DIM_ALPHA = 0.6;
const GHOST_ALPHA = 0.85;

type Rect = { x: number; y: number; w: number; h: number };
/** `page`: the tab page the square is on (bag squares are always shown). */
/** `box` is the square drawn; `zone` the area that takes a dropped item (a gear slot's whole row). */
type Square = { place: ItemPlace; box: Rectangle; zone: Rectangle; icon: Sprite; page: Container | null };
/** A stat's row on the Gear page, and the area that shows its tooltip. */
type StatRow = { stat: StatName; hit: Rectangle };
type StatValue = { score: PixelLabel; modifier: PixelLabel };
/** A read-only field of the character sheet: what it shows, and its tooltip. */
type FieldDef = { caption: string; accent: number; value: (sheet: CharacterSheet) => string; topic: (sheet: CharacterSheet) => TipTopic };
type Field = { field: SheetField; def: FieldDef };

/** Under the stats: Armor Class and hit points side by side, the weapon's damage roll across the row below. */
const FIELDS: readonly FieldDef[] = [
  { caption: text('sheet.ac.short'), accent: THEME.armorClass, value: (s) => String(s.armorClass.total), topic: armorClassTopic },
  { caption: text('sheet.hp.short'), accent: THEME.hitPoints, value: (s) => String(s.hitPoints.current), topic: hitPointsTopic },
  { caption: text('sheet.dmg.short'), accent: THEME.damage, value: (s) => formatDice(s.attack.damage, true), topic: damageTopic },
];
type Tab = { glow: Graphics; label: PixelLabel; page: Container; hovered: boolean; w: number; h: number };

/** A rect of the art, in the overlay's design space. */
function designRect(r: Rect): Rect {
  return { x: r.x * K, y: r.y * K, w: r.w * K, h: r.h * K };
}

/**
 * A number that changes when what the bag and slots hold changes in place (an item picked up into an empty
 * square), without building anything.
 */
function contentsMark(inventory: readonly BagSquare[], equipped: Partial<Record<EquipSlot, InventoryItem>>): number {
  let mark = 0;
  for (let i = 0; i < inventory.length; i++) if (inventory[i]) mark += i + 1;
  return mark * 1000 + Object.keys(equipped).length * 100000;
}

function samePlace(a: ItemPlace, b: ItemPlace): boolean {
  if ('bag' in a) return 'bag' in b && a.bag === b.bag;
  return 'slot' in b && a.slot === b.slot;
}


/**
 * Tab opens it: the bag as a grid of squares on the left; on the right two tabs, Gear (the equipment slots,
 * each a square of the same kind, the six ability scores and modifiers, and the Armor Class, hit points and
 * weapon damage the rules make of them) and Stats (to come). Items are dragged between squares, and every
 * value is worked out again whenever the gear changes.
 */
export class InventoryOverlay {
  readonly container = new Container();
  private readonly root = new Container();
  private readonly squares: Square[] = [];
  private readonly statValues = new Map<StatName, StatValue>();
  private readonly statRows: StatRow[] = [];
  private readonly fields: Field[] = [];
  /** What the rules make of the player's gear, as last drawn (for the tooltips). */
  private sheet: CharacterSheet | null = null;
  private readonly infoTip = new InfoTooltip();
  private readonly gold = new PixelLabel('', { color: 0xffcc00, align: 'right', shadow: true });
  private readonly tooltip = new ItemTooltip();
  private readonly ghost = new Sprite();
  private readonly tabs: Tab[] = [];
  private activeTab = 0;
  private cell = 0;
  /** The last press, to spot a double-click. */
  private lastPress: { place: ItemPlace; at: number } | null = null;
  private dragging: ItemPlace | null = null;
  private readonly stopListening: () => void;
  /** What the screen shows, so it is redrawn only when the player's things change. */
  private shown: { inventory: unknown; equipped: unknown; contents: number; gold: number; hp: number; maxHp: number } | null = null;
  private readonly weight = new PixelLabel('', { color: THEME.buttonText, align: 'right', shadow: true });

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
    if (!visible) {
      this.endDrag();
      this.infoTip.hide();
    }
  }

  update(): void {
    const player = localPlayer();
    if (!this.container.visible || !player) return;
    const inventory = player.inventory ?? [];
    const equipped = player.equipped ?? {};
    const contents = contentsMark(inventory, equipped);
    const s = this.shown;
    const { gold } = player.playerStats;
    const { current: hp, max: maxHp } = player.health;
    if (s && s.inventory === inventory && s.equipped === equipped && s.contents === contents && s.gold === gold && s.hp === hp && s.maxHp === maxHp) return;
    this.shown = { inventory, equipped, contents, gold, hp, maxHp };
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
    const title = new PixelLabel(text('inventory.title'), { color: THEME.title, scale: 2, shadow: true });
    title.position.set(TITLE.x * K, TITLE.y);
    this.gold.position.set((BAG_AREA.x + BAG_AREA.w) * K, TITLE.y);
    this.weight.position.set((BAG_AREA.x + BAG_AREA.w) * K, TITLE.y + WEIGHT_ROW);
    this.root.addChild(title, this.gold, this.weight);
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
    this.root.addChild(this.ghost, this.tooltip.view, this.infoTip.view);
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
    this.infoTip.hide();
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

  /** The bag: borderless square cells as large as fit, packed close together and centred on the leather. */
  private buildBag(area: Rect): void {
    const cols = INVENTORY_COLS;
    const rows = INVENTORY_ROWS;
    const innerW = area.w - 2 * BAG_PAD;
    const innerH = area.h - 2 * BAG_PAD;
    this.cell = Math.floor(Math.min((innerW - BAG_GAP * (cols - 1)) / cols, (innerH - BAG_GAP * (rows - 1)) / rows));
    const left = area.x + (area.w - (cols * this.cell + (cols - 1) * BAG_GAP)) / 2;
    const top = area.y + (area.h - (rows * this.cell + (rows - 1) * BAG_GAP)) / 2;
    for (let i = 0; i < cols * rows; i++) {
      const x = left + (i % cols) * (this.cell + BAG_GAP);
      const y = top + Math.floor(i / cols) * (this.cell + BAG_GAP);
      this.addSquare({ bag: i }, Math.round(x), Math.round(y), this.cell, null, undefined, false);
    }
  }

  /**
   * The Gear tab: each equipment square with its name to its right, a dividing line, then the stats (score
   * and modifier) in the upper part and the Armor Class, hit point and damage fields under them. A whole
   * row (square and name) takes a dropped item.
   */
  private buildGear(area: Rect, page: Container): void {
    const rowH = (area.h - 2 * PAD) / EQUIP_SLOTS.length;
    const size = Math.floor(Math.min(this.cell, rowH - GAP));
    const squareX = area.x + PAD;
    const labelX = squareX + size + LABEL_GAP;
    const labels = EQUIP_SLOTS.map((slot) => new PixelLabel(slotLabel(slot), { color: THEME.text, shadow: true }));
    const dividerX = Math.round(labelX + Math.max(...labels.map((l) => l.textWidth)) + COLUMN_GAP);
    EQUIP_SLOTS.forEach((slot, i) => {
      const y = area.y + PAD + i * rowH;
      const zone = new Rectangle(area.x, y, dividerX - area.x, rowH);
      this.addSquare({ slot }, Math.round(squareX), Math.round(y + (rowH - size) / 2), size, page, zone);
      labels[i].position.set(Math.round(labelX), Math.round(y + (rowH - 8) / 2));
      page.addChild(labels[i]);
    });
    page.addChild(new Graphics()
      .rect(dividerX, area.y + PAD, 1, area.h - 2 * PAD).fill({ color: SQUARE_EDGE, alpha: SQUARE_EDGE_ALPHA }));
    const statsX = dividerX + COLUMN_GAP;
    const valueX = area.x + area.w - PAD;
    const statsH = (area.h - 2 * PAD) * STATS_SHARE;
    const statRowH = statsH / STAT_NAMES.length;
    STAT_NAMES.forEach((stat, i) => this.addStatRow(stat, statsX, valueX, area.y + PAD + i * statRowH + (statRowH - 8) / 2, page));
    this.buildFields({ x: statsX, y: area.y + PAD + statsH, w: valueX - statsX, h: area.h - 2 * PAD - statsH }, page);
  }

  /** A rule across the stats column, then the sheet's fields: two side by side, the last across the row below. */
  private buildFields(area: Rect, page: Container): void {
    const ruleY = Math.round(area.y + RULE_GAP / 2);
    page.addChild(new Graphics().rect(Math.round(area.x), ruleY, Math.round(area.w), 1).fill({ color: SQUARE_EDGE, alpha: SQUARE_EDGE_ALPHA }));
    const top = ruleY + 1 + RULE_GAP;
    const h = Math.floor((area.y + area.h - top - FIELD_GAP) / 2);
    const halfW = Math.floor((area.w - FIELD_GAP) / 2);
    const boxes = [
      { x: area.x, y: top, w: halfW },
      { x: area.x + area.w - halfW, y: top, w: halfW },
      { x: area.x, y: top + h + FIELD_GAP, w: area.w },
    ];
    FIELDS.forEach((def, i) => {
      const box = boxes[i];
      const field = new SheetField(def.caption, Math.round(box.x), Math.round(box.y), Math.round(box.w), h, def.accent);
      this.fields.push({ field, def });
      page.addChild(field.view);
    });
  }

  /** The Stats tab: nothing to show yet but a placeholder line. */
  private buildStatsPage(area: Rect, page: Container): void {
    const placeholder = new PixelLabel(text('inventory.stats_tab_placeholder'), { color: THEME.muted, shadow: true });
    placeholder.position.set(Math.round(area.x + PAD * 2), Math.round(area.y + PAD * 2));
    page.addChild(placeholder);
  }

  /** A stat's row: its short name, its score (quiet) and its modifier (bright); the whole row shows its tooltip. */
  private addStatRow(stat: StatName, x: number, valueX: number, y: number, page: Container): void {
    const label = new PixelLabel(statShort(stat), { color: THEME.text, shadow: true });
    const score = new PixelLabel('0', { color: THEME.muted, align: 'right', shadow: true });
    const modifier = new PixelLabel('+0', { color: THEME.title, align: 'right', shadow: true });
    label.position.set(Math.round(x), Math.round(y));
    score.position.set(Math.round(valueX - SCORE_COLUMN), Math.round(y));
    modifier.position.set(Math.round(valueX), Math.round(y));
    this.statValues.set(stat, { score, modifier });
    this.statRows.push({ stat, hit: new Rectangle(x - STAT_HIT_PAD, y - STAT_HIT_PAD, valueX - x + 2 * STAT_HIT_PAD, 8 + 2 * STAT_HIT_PAD) });
    page.addChild(label, score, modifier);
  }

  /** One square (bag cell or equipment slot): a dark well (with a light edge if `edged`), and the icon of what is in it. */
  private addSquare(place: ItemPlace, x: number, y: number, size: number, page: Container | null = null, zone?: Rectangle, edged = true): void {
    const frame = new Graphics().rect(x, y, size, size).fill({ color: 0x000000, alpha: SQUARE_FILL_ALPHA });
    if (edged) frame.stroke({ color: SQUARE_EDGE, alpha: SQUARE_EDGE_ALPHA, width: 1, alignment: 1 });
    const icon = new Sprite();
    icon.anchor.set(0.5);
    icon.position.set(x + size / 2, y + size / 2);
    (page ?? this.root).addChild(frame, icon);
    const box = new Rectangle(x, y, size, size);
    this.squares.push({ place, box, zone: zone ?? box, icon, page });
  }

  /** Scales the whole overlay to the largest size that fits the screen with a margin, centred. */
  private fitToScreen(): void {
    const scale = Math.min((GAME_WIDTH - 2 * SCREEN_MARGIN) / DESIGN_W, (GAME_HEIGHT - 2 * SCREEN_MARGIN) / DESIGN_H);
    this.root.scale.set(scale);
    this.root.position.set(Math.round((GAME_WIDTH - DESIGN_W * scale) / 2), Math.round((GAME_HEIGHT - DESIGN_H * scale) / 2));
  }

  // ── Contents ────────────────────────────────────────────────────────────────

  private itemIn(player: Player, place: ItemPlace): InventoryItem | undefined {
    return ('bag' in place ? player.inventory?.[place.bag] : player.equipped?.[place.slot]) ?? undefined;
  }

  /** Shows an item's picture in a sprite, as large as fits a square of `size` (loading it the first time). */
  private showIcon(sprite: Sprite, item: InventoryItem | undefined, size = this.cell): void {
    sprite.visible = !!item;
    if (!item) return;
    sprite.texture = lazyTexture(itemIcon(item));
    const room = size - 2 * ICON_PAD;
    sprite.scale.set(Math.min(room / Math.max(1, sprite.texture.width), room / Math.max(1, sprite.texture.height)));
  }

  private refresh(player: Player): void {
    for (const square of this.squares) {
      const item = this.itemIn(player, square.place);
      this.showIcon(square.icon, item, square.box.width);
    }
    const sheet = characterSheet(player);
    this.sheet = sheet;
    for (const [stat, row] of this.statValues) {
      row.score.text = String(sheet.scores[stat]);
      row.modifier.text = formatModifier(sheet.modifiers[stat]);
    }
    for (const { field, def } of this.fields) field.set(def.value(sheet));
    this.gold.text = text('inventory.gold', { amount: player.playerStats.gold });
    const kg = carriedWeight(player);
    this.weight.text = text('inventory.weight', { carried: kg.toFixed(1), max: MAX_CARRY_KG });
    this.weight.fill = kg > MAX_CARRY_KG * HEAVY_SHARE ? 0xffa060 : THEME.buttonText;
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

  /** The square under the pointer; `forDrop` also counts a gear slot's whole row. */
  private squareAt(e: FederatedPointerEvent, forDrop = false): Square | undefined {
    const p = this.root.toLocal(e.global);
    return this.squares.find((s) => (!s.page || s.page.visible) && (forDrop ? s.zone : s.box).contains(p.x, p.y));
  }

  /** Whether the pointer is over the Gear page (anywhere on it). */
  private overGear(e: FederatedPointerEvent): boolean {
    const p = this.root.toLocal(e.global);
    const area = designRect(GEAR_AREA);
    return this.activeTab === 0 && p.x >= area.x && p.x <= area.x + area.w && p.y >= area.y && p.y <= area.y + area.h;
  }

  /** A second press on the same square soon after the first: true when this one completes a double-click. */
  private doubleClicked(place: ItemPlace, e: FederatedPointerEvent): boolean {
    // Timed by when the press happened, not when a slow frame got round to handling it.
    const native = e.nativeEvent;
    const now = 'timeStamp' in native ? native.timeStamp : performance.now();
    const last = this.lastPress;
    this.lastPress = { place, at: now };
    if (!last || now - last.at > DOUBLE_CLICK_MS || !samePlace(last.place, place)) return false;
    this.lastPress = null;
    return true;
  }

  /** Double-click: an item in the bag is put on, replacing whatever is worn there; a worn one goes back in the bag. */
  private quickMove(player: Player, place: ItemPlace): void {
    const loadout = { inventory: player.inventory ?? [], equipped: player.equipped ?? {} };
    const item = this.itemIn(player, place);
    if (!item) return;
    const slot = 'bag' in place ? slotFor(loadout.equipped, item, true) : null;
    const free = freeSquare(loadout.inventory);
    const to: ItemPlace | null = 'bag' in place ? (slot ? { slot } : null) : (free >= 0 ? { bag: free } : null);
    const next = to ? moveItem(loadout, place, to) : null;
    if (next) requestLoadout(player, next);
  }

  private startDrag(e: FederatedPointerEvent): void {
    const player = localPlayer();
    const square = this.squareAt(e);
    if (!player || !square || !this.itemIn(player, square.place)) return;
    if (this.doubleClicked(square.place, e)) {
      this.quickMove(player, square.place);
      return;
    }
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
    this.updateInfoTip(p.x, p.y);
  }

  /** Over a stat or a sheet field on the Gear page (and nothing held): its full name, what it does and how it adds up. */
  private updateInfoTip(x: number, y: number): void {
    const topic = this.activeTab === 0 && !this.dragging ? this.topicAt(x, y) : null;
    if (topic) this.infoTip.show(topic, x, y, { w: DESIGN_W, h: DESIGN_H });
    else this.infoTip.hide();
  }

  private topicAt(x: number, y: number): TipTopic | null {
    const sheet = this.sheet;
    if (!sheet) return null;
    const row = this.statRows.find((r) => r.hit.contains(x, y));
    if (row) return statTopic(row.stat, sheet);
    const entry = this.fields.find((f) => f.field.hit.contains(x, y));
    return entry ? entry.def.topic(sheet) : null;
  }

  /**
   * Where a dragged item lands: the square (or gear row) under the pointer; dropped anywhere else on the Gear
   * page, the slot it fits.
   */
  private dropTarget(e: FederatedPointerEvent, player: Player, from: ItemPlace): ItemPlace | null {
    const square = this.squareAt(e, true);
    if (square) return square.place;
    const item = this.itemIn(player, from);
    const slot = item && this.overGear(e) ? slotFor(player.equipped ?? {}, item) : null;
    return slot ? { slot } : null;
  }

  private drop(e: FederatedPointerEvent): void {
    const player = localPlayer();
    const from = this.dragging;
    this.endDrag();
    if (!player || !from) return;
    const target = this.dropTarget(e, player, from);
    if (!target || samePlace(from, target)) return;
    const next = moveItem({ inventory: player.inventory ?? [], equipped: player.equipped ?? {} }, from, target);
    if (next) requestLoadout(player, next);
  }

  private endDrag(): void {
    this.dragging = null;
    this.ghost.visible = false;
    for (const square of this.squares) square.icon.alpha = 1;
    this.shown = null;
  }
}
