import { Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import type { FederatedPointerEvent, FederatedWheelEvent } from 'pixi.js';
import { EQUIP_SLOTS, localPlayer, q } from '../world';
import type { BagSquare, EquipSlot, InventoryItem, ItemType, Player } from '../world';
import { GAME_WIDTH, GAME_HEIGHT } from '../render/Camera';
import { getTexture } from '../assets/Textures';
import { lazyTexture, onArtLoaded } from '../assets/LazyArt';
import { ItemTooltip } from './ItemTooltip';
import { InfoTooltip } from './InfoTooltip';
import type { TipTopic } from './InfoTooltip';
import { SheetField } from './SheetField';
import { armorClassTopic, armorTrainingTopic, damageTopic, hitPointsTopic, statTopic, weaponTrainingTopic } from './SheetTopics';
import { ProficiencyPanel } from './ProficiencyPanel';
import { SpellsPanel } from './SpellsPanel';
import { HudDialog } from './HudDialog';
import { claimPointer } from '../systems/InputSystem';
import { ABILITY_CELL_H, AbilityGrid } from './AbilityGrid';
import { SheetInfoPanel } from './SheetInfoPanel';
import { text } from '../core/texts';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';
import { INVENTORY_COLS, MAX_CARRY_KG, MAX_INVENTORY, carriedWeight, freeSquare, moveItem, requestDrop, requestGive, requestLoadout } from '../game/PlayerActions';
import { seatOf } from '../game/Party';
import { PopupMenu } from './PopupMenu';
import type { MenuRow } from './PopupMenu';
import type { ItemPlace } from '../game/PlayerActions';
import { itemIcon, slotFor, slotLabel } from '../entities/Items';
import { characterSheet } from '../rules/CharacterSheet';
import type { CharacterSheet } from '../rules/CharacterSheet';
import { formatDamage } from '../rules/Dice';
import { heroName } from '../rules/Names';
import { sound } from '../audio/SoundPlayer';

/** inventory.png, measured in its own pixels: the leather bag panel, the cloth gear panel, and its two tabs. */
const ART = { w: 2752, h: 1536 };
const BAG_AREA = { x: 78, y: 284, w: 1108, h: 1174 };
const GEAR_AREA = { x: 1404, y: 320, w: 1264, h: 1138 };
const TABS = [{ x: 1331, y: 5, w: 378, h: 210 }, { x: 1765, y: 5, w: 378, h: 210 }];
const TAB_TITLES = [text('inventory.tab_gear'), text('inventory.tab_stats')];
/** The tabs, in order: the character (equipment and sheet) and the skills (spells). */
const CHARACTER_TAB = 0;
const SKILLS_TAB = 1;
/** The part of a tab inside its iron frame (art pixels in from its edges), which lights up. */
const TAB_INSET = { side: 44, top: 70, bottom: 6 };
/** A tab under the pointer brightens; the open one brightens more and is underlined; the others are dimmed. */
const TAB_HOVER_ALPHA = 0.06;
const TAB_ACTIVE_ALPHA = 0.12;
const TAB_IDLE_DIM = 0.35;
const TAB_UNDERLINE = 2;
/** The mouse button that opens an item's menu. */
const RIGHT_BUTTON = 2;
/** Two items compared stand side by side, this far apart. */
const COMPARE_GAP = 4;
/** Where the title (the hero's name) sits, above the bag panel. */
const TITLE = { x: 80, y: 6 };
/** The weight carried shows under the gold; it turns orange past this share of what can be carried. */
const WEIGHT_ROW = 11;
const HEAVY_SHARE = 0.9;

/**
 * The screen is laid out once at this width (the art scaled down to it) and then scaled whole to fit the
 * screen, so it looks the same on a tablet, a small laptop or an ultra-wide monitor. The wider it is laid
 * out, the smaller its text looks next to the art.
 */
const DESIGN_W = 680;
const K = DESIGN_W / ART.w;
const DESIGN_H = ART.h * K;
/** Space kept round the overlay, in screen pixels. */
const SCREEN_MARGIN = 8;
/** Inside a panel: padding to its edge, the gap between squares, and between an icon and its square. */
const PAD = 6;
const GAP = 3;
const ICON_PAD = 3;
/** The bag grid reaches this close to the leather's edges, and its cells stay this far apart. */
const BAG_PAD = 2;
const BAG_GAP = 1;
/** Two presses on one square this quickly (the usual desktop double-click time) is a double-click: it puts the item on, or takes it off. */
const DOUBLE_CLICK_MS = 500;
/** Between an equipment label and its square, and between the gear and stats columns. */
const LABEL_GAP = 6;
const COLUMN_GAP = 10;
/**
 * The stats column, top down: the six abilities in a row of cells, a rule, the Armor Class, hit point and
 * damage fields (this tall), a rule, the rest of the character sheet, a rule, and the hero's proficiencies.
 */
const FIELD_H = 24;
/** Space round each rule, and between the fields. */
const RULE_GAP = 4;
const FIELD_GAP = 4;
/** An item square: a lighter, more solid well than the art, so the items stand out on it. */
const SQUARE_FILL = 0x3b342c;
const SQUARE_FILL_ALPHA = 0.88;
const SQUARE_EDGE = 0xb4a488;
const SQUARE_EDGE_ALPHA = 0.55;
const DIM_ALPHA = 0.6;
/** The bag shows this many of its rows at a time; the wheel or the scrollbar at its right edge moves through the rest. */
const BAG_VISIBLE_ROWS = 7;
const BAG_SCROLLBAR_W = 3;
const BAG_SCROLLBAR_MIN_H = 10;
/** The filter buttons stand in a row this tall over the bag, this far apart. */
const FILTER_H = 12;
const FILTER_GAP = 8;
/** An item marked with Ctrl+click is tinted gold this much and framed in gold. */
const MARK_ALPHA = 0.28;
const GHOST_ALPHA = 0.85;

type Rect = { x: number; y: number; w: number; h: number };
/** `page`: the tab page the square is on (bag squares are always shown). */
/** `box` is the square drawn; `zone` the area that takes a dropped item (a gear slot's whole row). */
type Square = { place: ItemPlace; box: Rectangle; zone: Rectangle; icon: Sprite; mark: Graphics; page: Container | null };

/** A filter over the bag: the kinds of item it shows (null: everything, empty squares too). */
type BagFilter = { label: string; types: readonly ItemType[] | null };
const BAG_FILTERS: readonly BagFilter[] = [
  { label: text('inventory.filter.all'), types: null },
  { label: text('inventory.filter.weapons'), types: ['weapon'] },
  { label: text('inventory.filter.armour'), types: ['helmet', 'armor', 'boots'] },
  { label: text('inventory.filter.shields'), types: ['shield'] },
  { label: text('inventory.filter.other'), types: ['ring', 'medal'] },
];

/** Adds the bag's free squares to `view`, in order. */
function pushFreeSquares(inventory: readonly BagSquare[], view: number[]): void {
  for (let i = 0; i < MAX_INVENTORY; i++) if (!inventory[i]) view.push(i);
}

/** A place to keep: a bag square's own place changes as the bag scrolls. */
function copyPlace(place: ItemPlace): ItemPlace {
  return 'bag' in place ? { bag: place.bag } : { slot: place.slot };
}

/** A key for a square that stays the same while the bag scrolls (a bag square by its index, a gear slot by its name). */
function placeKey(place: ItemPlace): string {
  return 'bag' in place ? `bag:${place.bag}` : `slot:${place.slot}`;
}
/** A read-only field of the character sheet: what it shows, and its tooltip. */
type FieldDef = { caption: string; accent: number; value: (sheet: CharacterSheet) => string; topic: (sheet: CharacterSheet) => TipTopic };
type Field = { field: SheetField; def: FieldDef };

/** Under the stats, side by side: Armor Class, hit points (left of the most) and the weapon's damage roll. */
const FIELDS: readonly FieldDef[] = [
  { caption: text('sheet.ac.short'), accent: THEME.armorClass, value: (s) => String(s.armorClass.total), topic: armorClassTopic },
  { caption: text('sheet.hp.short'), accent: THEME.hitPoints, value: (s) => text('sheet.hp.value', { current: s.hitPoints.current, max: s.hitPoints.max }), topic: hitPointsTopic },
  { caption: text('sheet.dmg.short'), accent: THEME.damage, value: (s) => formatDamage(s.attack.damage, s.attack.extra, true), topic: damageTopic },
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
 * Tab opens it: the bag as a grid of squares on the left; on the right two tabs, Character (the equipment slots,
 * each a square of the same kind, the six ability scores and modifiers, and the Armor Class, hit points and
 * weapon damage the rules make of them) and Skills (the spells the hero has learnt, to bind to the quick bar).
 * Items are dragged between squares, and every value is worked out again whenever the gear changes. It lies over the
 * whole screen: while it is open, no click reaches the world under it. A spell's "More info" opens a dialog over it.
 */
export class InventoryOverlay {
  readonly container = new Container();
  private readonly root = new Container();
  private readonly squares: Square[] = [];
  /** The bag's squares on screen; each shows the bag square `bagView[bagRow * cols + i]` (-1: none). */
  private readonly bagSquares: Square[] = [];
  /** The bag squares in the order shown: all of them, or under a filter the items it shows and then the free squares. */
  private readonly bagView: number[] = [];
  private bagRow = 0;
  private filter = 0;
  private readonly filterLabels: PixelLabel[] = [];
  private readonly bagScrollbar = new Graphics();
  private scrollTrack: Rectangle | null = null;
  /** Dragging the bag's scrollbar. */
  private scrolling = false;
  /** Items marked with Ctrl+click, by where they are, for one menu over them all. */
  private readonly marked = new Map<string, ItemPlace>();
  private abilities: AbilityGrid | null = null;
  private info: SheetInfoPanel | null = null;
  private readonly fields: Field[] = [];
  private proficiencies: ProficiencyPanel | null = null;
  private spells: SpellsPanel | null = null;
  /** What the rules make of the player's gear, as last drawn (for the tooltips). */
  private sheet: CharacterSheet | null = null;
  private readonly infoTip = new InfoTooltip();
  /** An item's right-click menu (send it to another player). */
  private readonly itemMenu = new PopupMenu();
  private readonly gold = new PixelLabel('', { color: 0xffcc00, align: 'right', shadow: true });
  private readonly tooltip = new ItemTooltip();
  /** The other item in a comparison, beside the first. */
  private readonly compareTip = new ItemTooltip();
  /** While two items are compared, the tooltips stay put (until the next press) instead of following the pointer. */
  private comparing = false;
  private readonly ghost = new Sprite();
  private readonly tabs: Tab[] = [];
  private activeTab = 0;
  private cell = 0;
  /** The last press, to spot a double-click. */
  private lastPress: { place: ItemPlace; at: number } | null = null;
  private dragging: ItemPlace | null = null;
  private readonly stopListening: () => void;
  /** What the screen shows, so it is redrawn only when the player's things change. */
  private shown: { inventory: unknown; equipped: unknown; contents: number; gold: number; hp: number; maxHp: number; progress: string } | null = null;
  /** The title: the hero's name. */
  private readonly title = new PixelLabel('', { color: THEME.title, scale: 2, shadow: true });
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
    // An overlay: while it is up, the pointer is the inventory's wherever it is (no swings, no picking things up).
    claimPointer(this, visible);
    if (visible) sound.playLocal('dialog');
    if (!visible) {
      this.endDrag();
      this.endCompare();
      this.infoTip.hide();
      this.itemMenu.hide();
      this.spells?.closeChoice();
    }
  }

  /**
   * Escape while the inventory is open closes the topmost thing inside it — an item's menu, a spell's level boxes or a
   * comparison — and returns true; with nothing of its own open, false (the inventory itself goes).
   */
  handleEscape(): boolean {
    if (this.itemMenu.hide()) return true;
    if (this.comparing) {
      this.endCompare();
      return true;
    }
    return this.spells?.closeChoice() ?? false;
  }

  update(): void {
    const player = localPlayer();
    if (!this.container.visible || !player) return;
    if (this.activeTab === SKILLS_TAB) this.spells?.animate();
    // Alt held or let go: the tooltip up shows its whole story, or its short one again.
    this.infoTip.refresh();
    const inventory = player.inventory ?? [];
    const equipped = player.equipped ?? {};
    const contents = contentsMark(inventory, equipped);
    const s = this.shown;
    const { gold, level, exp, hitDice } = player.playerStats;
    const { current: hp, max: maxHp } = player.health;
    // Level, experience and hit dice change rarely; one key covers all three.
    const progress = `${level}/${exp}/${hitDice}/${player.playerName ?? ''}`;
    const same = s && s.inventory === inventory && s.equipped === equipped && s.contents === contents && s.gold === gold;
    if (same && s.hp === hp && s.maxHp === maxHp && s.progress === progress) return;
    this.shown = { inventory, equipped, contents, gold, hp, maxHp, progress };
    this.refresh(player);
  }

  destroy(): void {
    this.stopListening();
    claimPointer(this, false);
    this.infoTip.hide();
    this.container.destroy({ children: true });
  }

  // ── Layout ──────────────────────────────────────────────────────────────────

  private build(): void {
    const art = new Sprite(getTexture('inventory_art'));
    art.scale.set(K);
    this.root.addChild(art);
    const title = this.title;
    title.position.set(TITLE.x * K, TITLE.y);
    this.gold.position.set((BAG_AREA.x + BAG_AREA.w) * K, TITLE.y);
    this.weight.position.set((BAG_AREA.x + BAG_AREA.w) * K, TITLE.y + WEIGHT_ROW);
    this.root.addChild(title, this.gold, this.weight);
    this.buildBag(designRect(BAG_AREA));
    const gearPage = new Container();
    const skillsPage = new Container();
    this.root.addChild(gearPage, skillsPage);
    this.buildGear(designRect(GEAR_AREA), gearPage);
    this.buildSkillsPage(designRect(GEAR_AREA), skillsPage);
    [gearPage, skillsPage].forEach((page, i) => this.addTab(designRect(TABS[i]), TAB_TITLES[i], page));
    this.showTab(CHARACTER_TAB);
    this.ghost.anchor.set(0.5);
    this.ghost.alpha = GHOST_ALPHA;
    this.ghost.visible = false;
    this.root.addChild(this.ghost, this.tooltip.view, this.compareTip.view, this.infoTip.view, this.itemMenu.view);
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
    this.spells?.closeChoice();
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

  /**
   * The bag: borderless cells packed close together and stretched to the leather's corners (a little wider
   * than tall where the leather is); icons fit the smaller side.
   */
  private buildBag(bag: Rect): void {
    this.buildFilters(bag);
    const area = { x: bag.x, y: bag.y + FILTER_H, w: bag.w - BAG_SCROLLBAR_W - BAG_GAP, h: bag.h - FILTER_H };
    const cols = INVENTORY_COLS;
    const rows = BAG_VISIBLE_ROWS;
    const cellW = (area.w - 2 * BAG_PAD - BAG_GAP * (cols - 1)) / cols;
    const cellH = (area.h - 2 * BAG_PAD - BAG_GAP * (rows - 1)) / rows;
    this.cell = Math.floor(Math.min(cellW, cellH));
    for (let i = 0; i < cols * rows; i++) {
      const x = Math.round(area.x + BAG_PAD + (i % cols) * (cellW + BAG_GAP));
      const y = Math.round(area.y + BAG_PAD + Math.floor(i / cols) * (cellH + BAG_GAP));
      const right = Math.round(area.x + BAG_PAD + (i % cols) * (cellW + BAG_GAP) + cellW);
      const bottom = Math.round(area.y + BAG_PAD + Math.floor(i / cols) * (cellH + BAG_GAP) + cellH);
      this.bagSquares.push(this.addSquare({ bag: i }, x, y, right - x, null, undefined, false, bottom - y));
    }
    this.scrollTrack = new Rectangle(bag.x + bag.w - BAG_SCROLLBAR_W, area.y + BAG_PAD, BAG_SCROLLBAR_W, area.h - 2 * BAG_PAD);
    this.root.addChild(this.bagScrollbar);
  }

  /** The filters over the bag, as words in a row: a click shows only that kind of item (the open one in gold). */
  private buildFilters(bag: Rect): void {
    let x = bag.x + BAG_PAD;
    BAG_FILTERS.forEach((filter, i) => {
      const label = new PixelLabel(filter.label, { color: THEME.muted, shadow: true });
      label.position.set(Math.round(x), Math.round(bag.y + 1));
      label.eventMode = 'static';
      label.cursor = 'pointer';
      label.hitArea = new Rectangle(-1, -1, label.textWidth + 2, FILTER_H);
      label.on('pointertap', () => this.setFilter(i));
      this.filterLabels.push(label);
      this.root.addChild(label);
      x += label.textWidth + FILTER_GAP;
    });
    this.setFilter(0);
  }

  private setFilter(index: number): void {
    this.filter = index;
    this.bagRow = 0;
    this.filterLabels.forEach((label, i) => { label.fill = i === index ? THEME.title : THEME.muted; });
    this.shown = null;
  }

  /**
   * Which bag square each square on screen shows: the filter's view of the bag (everything; or the items it lets
   * through, then the free squares to drop onto), from the row scrolled to.
   */
  private layoutBag(player: Player): void {
    const view = this.bagView;
    view.length = 0;
    const types = BAG_FILTERS[this.filter].types;
    const inventory = player.inventory ?? [];
    for (let i = 0; i < MAX_INVENTORY; i++) {
      const item = inventory[i];
      if (!types || (item && types.includes(item.type))) view.push(i);
    }
    // Under a filter, the free squares follow the items, to drop things onto.
    if (types) pushFreeSquares(inventory, view);
    this.bagRow = Math.max(0, Math.min(this.bagRow, this.lastBagRow()));
    this.bagSquares.forEach((square, i) => {
      if ('bag' in square.place) square.place.bag = view[this.bagRow * INVENTORY_COLS + i] ?? -1;
    });
    this.drawBagScrollbar();
  }

  /** The furthest row the bag can be scrolled to. */
  private lastBagRow(): number {
    return Math.max(0, Math.ceil(this.bagView.length / INVENTORY_COLS) - BAG_VISIBLE_ROWS);
  }

  /** A thin track down the bag's right edge, with a thumb as long as the share of the rows on screen. */
  private drawBagScrollbar(): void {
    const track = this.scrollTrack;
    const g = this.bagScrollbar.clear();
    const last = this.lastBagRow();
    if (!track || last === 0) return;
    const rows = last + BAG_VISIBLE_ROWS;
    const thumbH = Math.max(BAG_SCROLLBAR_MIN_H, (track.height * BAG_VISIBLE_ROWS) / rows);
    const y = track.y + ((track.height - thumbH) * this.bagRow) / last;
    g.rect(track.x, track.y, track.width, track.height).fill({ color: 0x000000, alpha: SQUARE_FILL_ALPHA })
      .rect(track.x, y, track.width, thumbH).fill({ color: SQUARE_EDGE, alpha: SQUARE_EDGE_ALPHA });
  }

  /** Scrolls the bag by whole rows. */
  private scrollBag(rows: number): void {
    const next = Math.max(0, Math.min(this.bagRow + rows, this.lastBagRow()));
    if (next === this.bagRow) return;
    this.bagRow = next;
    this.shown = null;
  }

  /** The scrollbar dragged: the bag shows the rows where the pointer is along its track. */
  private scrollBagTo(y: number): void {
    const track = this.scrollTrack;
    if (!track) return;
    const share = Math.max(0, Math.min(1, (y - track.y) / track.height));
    this.scrollBag(Math.round(share * this.lastBagRow()) - this.bagRow);
  }

  /**
   * The Gear tab: each equipment square with its name to its right, a dividing line, then the character
   * sheet: the abilities in a row of cells, the Armor Class, hit point and damage fields, the hero's other
   * numbers and saving throws, and their proficiencies. A whole row (square and name) takes a dropped item.
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
    const statsX = Math.round(dividerX + COLUMN_GAP);
    const colW = Math.round(area.x + area.w - PAD - statsX);
    const top = Math.round(area.y + PAD);
    this.abilities = new AbilityGrid(statsX, top, colW);
    page.addChild(this.abilities.view);
    this.buildSheet(statsX, top + ABILITY_CELL_H, colW, page);
  }

  /** Under the abilities: the sheet's fields side by side, the rest of the sheet, then the proficiencies, ruled apart. */
  private buildSheet(x: number, y: number, w: number, page: Container): void {
    const top = this.addRule(x, y, w, page);
    const fieldW = Math.floor((w - FIELD_GAP * (FIELDS.length - 1)) / FIELDS.length);
    FIELDS.forEach((def, i) => {
      const field = new SheetField(def.caption, Math.round(x + i * (fieldW + FIELD_GAP)), top, fieldW, FIELD_H, def.accent);
      this.fields.push({ field, def });
      page.addChild(field.view);
    });
    const infoTop = this.addRule(x, top + FIELD_H, w, page);
    this.info = new SheetInfoPanel(x, infoTop, w, this.abilities?.columnCentres() ?? []);
    page.addChild(this.info.view);
    const below = this.addRule(x, infoTop + this.info.height, w, page);
    this.proficiencies = new ProficiencyPanel(x, below, w);
    page.addChild(this.proficiencies.view);
  }

  /** A thin rule across the column just under `y`; returns where what follows it starts. */
  private addRule(x: number, y: number, w: number, page: Container): number {
    const ruleY = Math.round(y + RULE_GAP);
    page.addChild(new Graphics().rect(Math.round(x), ruleY, Math.round(w), 1).fill({ color: SQUARE_EDGE, alpha: SQUARE_EDGE_ALPHA }));
    return ruleY + 1 + RULE_GAP;
  }

  /** The Skills tab: the spells the hero has learnt, as boxes by spell level (rebuilt when the hero levels up). */
  private buildSkillsPage(area: Rect, page: Container): void {
    this.spells = new SpellsPanel(area);
    page.addChild(this.spells.view);
  }

  /**
   * One cell (bag square or equipment slot), `size` wide and `height` tall (square unless given): a dark well
   * (with a light edge if `edged`), and the icon of what is in it.
   */
  private addSquare(place: ItemPlace, x: number, y: number, size: number, page: Container | null = null, zone?: Rectangle, edged = true, height = size): Square {
    const frame = new Graphics().rect(x, y, size, height).fill({ color: SQUARE_FILL, alpha: SQUARE_FILL_ALPHA });
    if (edged) frame.stroke({ color: SQUARE_EDGE, alpha: SQUARE_EDGE_ALPHA, width: 1, alignment: 1 });
    const icon = new Sprite();
    icon.anchor.set(0.5);
    icon.position.set(x + size / 2, y + height / 2);
    const mark = new Graphics().rect(x, y, size, height).fill({ color: THEME.title, alpha: MARK_ALPHA })
      .stroke({ color: THEME.title, width: 1, alignment: 1 });
    mark.visible = false;
    (page ?? this.root).addChild(frame, icon, mark);
    const box = new Rectangle(x, y, size, height);
    const square: Square = { place, box, zone: zone ?? box, icon, mark, page };
    this.squares.push(square);
    return square;
  }

  /** Scales the whole overlay to the largest size that fits the screen with a margin, centred. */
  private fitToScreen(): void {
    const scale = Math.min((GAME_WIDTH - 2 * SCREEN_MARGIN) / DESIGN_W, (GAME_HEIGHT - 2 * SCREEN_MARGIN) / DESIGN_H);
    this.root.scale.set(scale);
    this.root.position.set(Math.round((GAME_WIDTH - DESIGN_W * scale) / 2), Math.round((GAME_HEIGHT - DESIGN_H * scale) / 2));
  }

  // ── Contents ────────────────────────────────────────────────────────────────

  private itemIn(player: Player, place: ItemPlace): InventoryItem | undefined {
    if ('bag' in place && place.bag < 0) return undefined;
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
    this.layoutBag(player);
    for (const square of this.squares) {
      const item = this.itemIn(player, square.place);
      this.showIcon(square.icon, item, Math.min(square.box.width, square.box.height));
      square.mark.visible = !!item && this.marked.has(placeKey(square.place));
    }
    const sheet = characterSheet(player);
    this.sheet = sheet;
    this.title.text = player.playerName || heroName(sheet.heroClass.id);
    this.abilities?.set(sheet);
    for (const { field, def } of this.fields) field.set(def.value(sheet));
    this.info?.set(sheet);
    this.proficiencies?.set(sheet);
    this.spells?.set(player);
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
    this.root.on('wheel', (e) => this.wheel(e));
  }

  /** The wheel scrolls the bag while the pointer is over it, else the spell list while the Skills tab is open. */
  private wheel(e: FederatedWheelEvent): void {
    const p = this.root.toLocal(e.global);
    const bag = designRect(BAG_AREA);
    if (p.x >= bag.x && p.x <= bag.x + bag.w && p.y >= bag.y && p.y <= bag.y + bag.h) {
      this.scrollBag(Math.sign(e.deltaY));
      return;
    }
    if (this.activeTab !== SKILLS_TAB) return;
    this.spells?.scroll(e.deltaY);
  }

  /** The square under the pointer; `forDrop` also counts a gear slot's whole row. */
  private squareAt(e: FederatedPointerEvent, forDrop = false): Square | undefined {
    const p = this.root.toLocal(e.global);
    const shown = (s: Square): boolean => (!s.page || s.page.visible) && !('bag' in s.place && s.place.bag < 0);
    return this.squares.find((s) => shown(s) && (forDrop ? s.zone : s.box).contains(p.x, p.y));
  }

  /**
   * Right-click on an item: a menu of what can be done with it — drop it at the hero's feet, compare it with
   * another of its kind, or send it to another player (into the first free square of their bag).
   */
  private openItemMenu(player: Player, e: FederatedPointerEvent): void {
    const square = this.squareAt(e);
    const item = square ? this.itemIn(player, square.place) : undefined;
    const p = this.root.toLocal(e.global);
    if (square && this.marked.has(placeKey(square.place))) {
      this.openMarkedMenu(player, p.x, p.y);
      return;
    }
    this.clearMarks();
    if (!square || !item) return;
    const place = copyPlace(square.place);
    const rows: MenuRow[] = [
      { label: text('inventory.menu.drop'), action: () => requestDrop(player, place) },
      { label: text('inventory.menu.compare'), action: null, submenu: this.compareRows(player, item, p.x, p.y) },
    ];
    for (const other of q.players) {
      if (other === player) continue;
      const name = other.playerName ?? '';
      rows.push({ label: text('inventory.menu.send_to', { name }), action: () => requestGive(player, place, seatOf(other)) });
    }
    this.tooltip.hide();
    this.itemMenu.show(rows, p.x, p.y, { w: DESIGN_W, h: DESIGN_H });
  }

  /** Right-click on a marked item: drop all the marked items, or send them all to another player. */
  private openMarkedMenu(player: Player, x: number, y: number): void {
    const places = [...this.marked.values()];
    const count = places.length;
    const rows: MenuRow[] = [{ label: text('inventory.menu.drop_marked', { count }), action: () => this.forMarked(places, (place) => requestDrop(player, place)) }];
    for (const other of q.players) {
      if (other === player) continue;
      const label = text('inventory.menu.send_marked_to', { count, name: other.playerName ?? '' });
      rows.push({ label, action: () => this.forMarked(places, (place) => requestGive(player, place, seatOf(other))) });
    }
    this.tooltip.hide();
    this.itemMenu.show(rows, x, y, { w: DESIGN_W, h: DESIGN_H });
  }

  /** Does the same to each marked item (one square at a time: the others keep theirs), then unmarks them. */
  private forMarked(places: readonly ItemPlace[], act: (place: ItemPlace) => void): void {
    for (const place of places) act(place);
    this.clearMarks();
  }

  /** Ctrl+click on an item marks it, or unmarks it if it was. */
  private toggleMark(place: ItemPlace): void {
    const key = placeKey(place);
    if (this.marked.has(key)) this.marked.delete(key);
    else this.marked.set(key, copyPlace(place));
    this.shown = null;
  }

  private clearMarks(): void {
    if (this.marked.size === 0) return;
    this.marked.clear();
    this.shown = null;
  }

  /** "Compare": every other item of the same kind the hero has (weapon with weapon, armour with armour), worn ones marked. */
  private compareRows(player: Player, item: InventoryItem, x: number, y: number): MenuRow[] {
    const rows: MenuRow[] = [];
    for (const other of player.inventory ?? []) {
      if (other && other !== item && other.type === item.type) rows.push({ label: other.name, action: () => this.compare(item, other, x, y) });
    }
    for (const other of Object.values(player.equipped ?? {})) {
      if (!other || other === item || other.type !== item.type) continue;
      rows.push({ label: text('inventory.menu.compare_worn', { name: other.name }), action: () => this.compare(item, other, x, y) });
    }
    return rows.length ? rows : [{ label: text('inventory.menu.compare_none'), action: null }];
  }

  /** The two items side by side (the second to the right of the first, or to its left where there is no room). */
  private compare(item: InventoryItem, other: InventoryItem, x: number, y: number): void {
    const bounds = { w: DESIGN_W, h: DESIGN_H };
    this.comparing = true;
    this.tooltip.show(item, x, y, bounds, this.sheet?.heroClass);
    const first = this.tooltip.view;
    const right = first.x + first.width + COMPARE_GAP;
    this.compareTip.show(other, right - ItemTooltip.OFFSET, y, bounds, this.sheet?.heroClass);
    if (this.compareTip.view.x < right) this.compareTip.view.x = Math.max(0, first.x - this.compareTip.view.width - COMPARE_GAP);
    this.compareTip.view.y = first.y;
  }

  /** The next press ends a comparison. */
  private endCompare(): void {
    if (!this.comparing) return;
    this.comparing = false;
    this.tooltip.hide();
    this.compareTip.hide();
  }

  /** Whether the pointer is over the Gear page (anywhere on it). */
  private overGear(e: FederatedPointerEvent): boolean {
    const p = this.root.toLocal(e.global);
    const area = designRect(GEAR_AREA);
    return this.activeTab === CHARACTER_TAB && p.x >= area.x && p.x <= area.x + area.w && p.y >= area.y && p.y <= area.y + area.h;
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

  /** A press on the Skills tab goes to the spell list (a spell, or one of its level boxes). */
  private pressSkills(e: FederatedPointerEvent): boolean {
    const p = this.root.toLocal(e.global);
    return this.spells?.press(p.x, p.y) ?? false;
  }

  private startDrag(e: FederatedPointerEvent): void {
    const player = localPlayer();
    // A press on the menu is for its rows; anywhere else closes the menu.
    if (this.itemMenu.covers(e.global)) return;
    this.itemMenu.hide();
    this.endCompare();
    const p = this.root.toLocal(e.global);
    if (this.scrollTrack?.contains(p.x, p.y)) {
      this.scrolling = true;
      this.scrollBagTo(p.y);
      return;
    }
    if (player && e.button === RIGHT_BUTTON) {
      this.openItemMenu(player, e);
      return;
    }
    const square = this.squareAt(e);
    // Ctrl+click marks an item (or unmarks it); any other click unmarks them all.
    if (player && square && (e.ctrlKey || e.metaKey) && this.itemIn(player, square.place)) {
      this.toggleMark(square.place);
      return;
    }
    this.clearMarks();
    if (this.activeTab === SKILLS_TAB && this.pressSkills(e)) return;
    if (!player || !square || !this.itemIn(player, square.place)) return;
    const place = copyPlace(square.place);
    if (this.doubleClicked(place, e)) {
      this.quickMove(player, place);
      return;
    }
    this.dragging = place;
    this.showIcon(this.ghost, this.itemIn(player, square.place));
    square.icon.alpha = 0.3;
    this.moveDrag(e);
  }

  /** The ghost follows the pointer; with nothing held, the tooltip tells about the item under it. */
  private moveDrag(e: FederatedPointerEvent): void {
    if (!this.container.visible) return;
    const p = this.root.toLocal(e.global);
    if (this.scrolling) {
      this.scrollBagTo(p.y);
      return;
    }
    this.ghost.position.set(p.x, p.y);
    const player = localPlayer();
    const square = this.squareAt(e);
    if (this.comparing) return;
    if (this.activeTab === SKILLS_TAB) this.spells?.hover(p.x, p.y);
    const item = player && square && !this.dragging && !this.itemMenu.open ? this.itemIn(player, square.place) : undefined;
    if (item) this.tooltip.show(item, p.x, p.y, { w: DESIGN_W, h: DESIGN_H }, this.sheet?.heroClass);
    else this.tooltip.hide();
    this.updateInfoTip(p.x, p.y);
  }

  /**
   * Over a stat or a sheet field on the Gear page, or a spell on the Skills tab (and nothing held): its full name, what
   * it does and how it adds up, following the pointer.
   */
  private updateInfoTip(x: number, y: number): void {
    const bounds = { w: DESIGN_W, h: DESIGN_H };
    const skills = this.activeTab === SKILLS_TAB;
    const topic = this.dragging ? null : skills ? this.spells?.topicAt(x, y) ?? null : this.topicAt(x, y);
    if (topic) this.infoTip.show(topic, x, y, bounds);
    else this.infoTip.hide();
  }

  private topicAt(x: number, y: number): TipTopic | null {
    const sheet = this.sheet;
    if (!sheet) return null;
    const stat = this.abilities?.statAt(x, y);
    if (stat) return statTopic(stat, sheet);
    const fact = this.info?.topicAt(x, y, sheet);
    if (fact) return fact;
    const entry = this.fields.find((f) => f.field.hit.contains(x, y));
    if (entry) return entry.def.topic(sheet);
    if (this.proficiencies?.armorHit.contains(x, y)) return armorTrainingTopic(sheet);
    return this.proficiencies?.weaponHit.contains(x, y) ? weaponTrainingTopic(sheet) : null;
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
    this.scrolling = false;
    this.dragging = null;
    this.ghost.visible = false;
    for (const square of this.squares) square.icon.alpha = 1;
    this.shown = null;
  }
}
