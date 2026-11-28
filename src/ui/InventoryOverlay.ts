import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { FederatedPointerEvent, FederatedWheelEvent } from 'pixi.js';
import { EQUIP_SLOTS, localPlayer, q } from '../world';
import type { BagSquare, EquipSlot, InventoryItem, ItemType, Player } from '../world';
import { GAME_WIDTH, GAME_HEIGHT } from '../render/Camera';
import { QUICK_BAR_HEIGHT } from './QuickBar';
import { getTexture } from '../assets/Textures';
import { lazyTexture, onArtLoaded } from '../assets/LazyArt';
import { ItemTooltip } from './ItemTooltip';
import type { TooltipContext } from './ItemTooltip';
import { InfoTooltip } from './InfoTooltip';
import type { TipTopic } from './InfoTooltip';
import { SheetField } from './SheetField';
import { armorClassTopic, armorTrainingTopic, damageTopic, hitPointsTopic, statTopic, weaponTrainingTopic } from './SheetTopics';
import { ProficiencyPanel } from './ProficiencyPanel';
import { SpellsPanel } from './SpellsPanel';
import { HudDialog } from './HudDialog';
import { claimPointer, isAltHeld } from '../systems/InputSystem';
import { ABILITY_CELL_H, AbilityGrid } from './AbilityGrid';
import { SheetInfoPanel } from './SheetInfoPanel';
import { text } from '../core/texts';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';
import { INVENTORY_COLS, MAX_CARRY_KG, MAX_INVENTORY, carriedWeight, freeSquare, moveWorn, requestDrop, requestGive, requestLoadout } from '../game/PlayerActions';
import { seatOf } from '../game/Party';
import { PopupMenu } from './PopupMenu';
import type { MenuRow } from './PopupMenu';
import type { ItemPlace } from '../game/PlayerActions';
import { fitsSlot, itemIcon, slotFor, slotLabel } from '../entities/Items';
import { characterSheet } from '../rules/CharacterSheet';
import type { CharacterSheet } from '../rules/CharacterSheet';
import { formatDamage } from '../rules/Dice';
import { heroName, spellName } from '../rules/Names';
import { sound } from '../audio/SoundPlayer';
import { context2d, createCanvas, imageOf } from '../render/canvas';
import { TextBox } from './TextBox';
import { ScrollBar } from './ScrollBar';
import { fuzzyMatch } from '../core/fuzzy';
import { BAG_SORTS, bagView } from '../game/BagView';
import type { BagSort } from '../game/BagView';
import { itemTrained } from '../rules/Classes';
import { beginBinding, pendingBinding } from '../game/SpellBinding';
import { actionBinding, weaponAction } from '../rules/WeaponActions';
import type { WeaponActionId } from '../rules/WeaponActions';
import { actionTopic } from './ActionTopic';
import { QuickBarPage } from './QuickBarPage';
import { wornCounterpart } from '../game/ItemCompare';

/** inventory.png, measured in its own pixels: the leather bag panel, the cloth gear panel, and its two tabs. */
const ART = { w: 2752, h: 1536 };
const BAG_AREA = { x: 78, y: 284, w: 1108, h: 1174 };
const GEAR_AREA = { x: 1404, y: 320, w: 1264, h: 1138 };
/** Where the tabs stand over the gear panel (art pixels; the art's own tabs are not used, see tabFrameTexture). */
const TABS = [{ x: 1332, y: 6, w: 376, h: 217 }, { x: 1766, y: 6, w: 376, h: 217 }, { x: 2200, y: 6, w: 376, h: 217 }];
const TAB_TITLES = [text('inventory.tab_gear'), text('inventory.tab_stats'), text('inventory.tab_bar')];
/** The tabs, in order: the character (equipment and sheet), the skills (spells) and the quick bar (its size and presets). */
const CHARACTER_TAB = 0;
const SKILLS_TAB = 1;
const QUICK_BAR_TAB = 2;
/** The art's panels start this far down; above them its strip holds only the two tabs, which are drawn on their own. */
const PANEL_TOP = 223;
/** The bag panel's iron frame, outside edges (art pixels), and the frame's iron. */
const BAG_FRAME = { left: 19, right: 1250 };
const IRON = 0x1f222b;
const IRON_EDGE = 0x4a5563;
const IRON_OUTLINE = 0x04050a;
/**
 * A tab is drawn, not cut from the art: a band of dark forged iron round a dark opening, open at its foot, its top corners
 * cut off on the slant. In design pixels: the band's width and how much of each top corner is cut. It is drawn TAB_RES
 * times finer than the design, so its edges stay sharp scaled up to the screen.
 */
const TAB_BAND = 5;
const TAB_CHAMFER = 7;
const TAB_RES = 4;
const TAB_INSIDE = 0x030409;
/** The band's iron: lit faintly from above, darkening down to the panels; a worn highlight along its top, rivets down its sides. */
const TAB_IRON_TOP = 0x3a3f4a;
const TAB_IRON_FOOT = 0x15171d;
const TAB_HIGHLIGHT = 0x7a8492;
const TAB_RIVET = 0x6b7480;
/**
 * The tab's dressing, in design pixels: a crown of three spikes on its top with a blood-red gem set in the band under them,
 * a gothic pinnacle standing on each cut corner, a groove engraved along the band ending in curls, a fang
 * jutting into each upper corner of the opening and, inside it, a faint pointed arch with a quatrefoil under its point
 * and rivets at its feet. The spikes reach past the tab's edges by this much room.
 */
const TAB_ROOM = { side: 6, top: 11 };
/** The crown: the middle spike's height and half-width, the side spikes' height, half-width and distance from the middle. */
const CROWN = { tall: 10, wide: 2.6, short: 6, narrow: 1.8, apart: 5.5 };
/**
 * A corner's pinnacle, a gothic spire on the middle of each cut corner: its spire's height and half-width, its crockets'
 * height (leaning out from it) and how far out they stand, and the knob of its finial.
 */
const PINNACLE = { tall: 10, wide: 1.7, crocket: 5, out: 2.8, knob: 1 };
/**
 * The pointed arch inside the opening: how far in from the band it stands, where its legs end and where they spring
 * (shares of the tab's height), and how faint it is; under its point, a quatrefoil of this radius, its lobes this big.
 */
const ARCH_INSET = 2.5;
const ARCH_FOOT = 0.62;
const ARCH_SPRING = 0.42;
const ARCH_ALPHA = 0.7;
const QUATREFOIL = { r: 1.4, lobe: 1.2 };
/**
 * How the arch's sides bend: they leave the legs upright for this share of the rise, reach in towards the point from this
 * share of the half-width, and come into the point from this far below it, so the two meet at a sharp angle.
 */
const ARCH_BEND = { leg: 0.55, reach: 0.3, drop: 3.5 };
/** The spike iron: dark at the root, pale and worn at the point. */
const SPIKE_ROOT = 0x23262e;
const SPIKE_TIP = 0x9aa0aa;
/** The gem: its half-size, its fire at the middle and its dark rim; the curls' radius and the fangs' reach. */
const GEM_R = 2.5;
const GEM_FIRE = 0xff6a40;
const GEM_DARK = 0x5a0808;
const CURL_R = 1.2;
const FANG = 3.4;
/** Engraved lines: the groove's dark and the lit lip beside it, and how thick each is. */
const GROOVE_ALPHA = 0.75;
const GROOVE_LIP_ALPHA = 0.45;
const GROOVE_W = 0.4;
const OUTLINE_W = 0.5;
/**
 * The tabs stand behind the panels, their feet tucked under the panels' top edge: the others sink this many design
 * pixels further in, the open one stands out its whole height (no gap ever opens under a tab). The open one is lit from
 * below as by a lantern at its foot: a dim red glow filling its dark opening, fading up it and out to its sides, its
 * strength breathing between these on two out-of-step waves; the others are dimmed (a tab under the pointer less so).
 */
const TAB_SINK = 8;
const TAB_GLOW_COLOR = '255, 64, 32';
const TAB_GLOW_ALPHA = { low: 0.3, high: 0.45 };
const TAB_GLOW_WAVES_MS = [1700, 610];
/** The glow is strongest along the opening's foot and fades out this share of the way to each side. */
const TAB_GLOW_SIDE_FADE = 0.3;
const TAB_IDLE_ALPHA = 0.5;
const TAB_HOVER_IDLE_ALPHA = 0.8;
/**
 * Opening a tab: it rises out of the panels and its lantern fades up over this long (the one closing sinks and fades as
 * long), while its gem flares, swelling and fading out over TAB_FLARE_MS; open, the gem glows faintly with the lantern.
 * All of it is a few numbers set on sprites each update: nothing is drawn again.
 */
const TAB_RISE_MS = 180;
const TAB_FLARE_MS = 450;
const TAB_FLARE_SCALE = { from: 0.35, to: 1.4 };
const TAB_GEM_GLOW = 0.35;
/** The flare's size in design pixels at scale 1, and the longest step one update may take (a stalled frame does not jump). */
const TAB_FLARE_SIZE = 22;
const TAB_MAX_STEP_MS = 50;
/** The mouse button that opens an item's menu. */
const RIGHT_BUTTON = 2;
/** Two items compared stand side by side, this far apart. */
const COMPARE_GAP = 4;
/** Where the title (the hero's name) sits, above the bag panel. */
const TITLE = { x: 80, y: 6 };
/**
 * The gold and the weight carried stand on a plate of the bag frame's iron, fused to the frame's top right corner
 * (this tall, its text this far in); the weight turns orange past this share of what can be carried.
 */
const PURSE_H = 24;
const PURSE_PAD = 6;
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
const FIELD_H = 32;
/** Space round each rule, and between the fields. */
const RULE_GAP = 4;
const FIELD_GAP = 4;
/** An item square: a lighter, more solid well than the art, so the items stand out on it. */
const SQUARE_FILL = 0x3b342c;
const SQUARE_FILL_ALPHA = 0.88;
/**
 * A bag cell: a lighter, cooler well than the leather (the darkest weapons are near black), faintly edged, so the
 * items read against it without the cells shouting.
 */
const BAG_CELL_FILL = 0x564c42;
const BAG_CELL_FILL_ALPHA = 0.9;
const BAG_CELL_EDGE_ALPHA = 0.3;
const SQUARE_EDGE = 0xb4a488;
const SQUARE_EDGE_ALPHA = 0.55;
const DIM_ALPHA = 0.6;
/** While a spell waits for its quick-bar square the inventory is shaded this much more, so the bar in front of it stands out. */
const BINDING_SHADE_ALPHA = 0.5;
/** The bag shows this many of its rows at a time; the wheel or the scrollbar at its right edge (ui/ScrollBar.ts) moves through the rest. */
const BAG_VISIBLE_ROWS = 7;
const BAG_SCROLLBAR_W = ScrollBar.WIDTH;
/**
 * The character sheet's column scrolls when it is taller than the page (a long list of trained weapons, warnings): the
 * wheel over it moves it this far, and its scrollbar stands this far from it.
 */
const SHEET_WHEEL_STEP = 12;
const SHEET_SCROLLBAR_GAP = 4;
/** The filter buttons stand in a row this tall over the bag, this far apart. */
const FILTER_H = 12;
const FILTER_GAP = 8;
/** Under them, the search box (this tall: its letters well clear of its edges; this far above the bag); the sort button at the row's right end, this big. */
const SEARCH_H = 18;
const SEARCH_GAP = 3;
const SORT_SIZE = 10;
/** The count of items a search finds shows at the box's right, this far in. */
const FOUND_PAD = 3;
/** The bitmap font's glyphs are this tall. */
const GLYPH_H = 8;
/** The longest search the box takes. */
const MAX_QUERY = 24;
/** An item marked (clicked, or Ctrl+clicked to mark one more) is tinted gold this much and framed in gold. */
const MARK_ALPHA = 0.28;
/** The square under the pointer is edged faintly (a whisper of fill inside); a dragged item's landing square brighter, in gold. */
const HOVER_FILL_ALPHA = 0.08;
const HOVER_ALPHA = 0.55;
const LANDING_ALPHA = 0.95;
const GHOST_ALPHA = 0.85;
/**
 * Gear the hero is not trained in has a red aura behind its picture, so it shows at a glance: this colour, filling its
 * square, strong out to this share of its reach (round the edges of a large picture, a suit of armour) before it fades.
 */
const AURA_COLOR = '255, 40, 24';
const AURA_SHARE = 1;
const AURA_ALPHA = 0.45;
const AURA_HOLD = 0.6;

type Rect = { x: number; y: number; w: number; h: number };
/** `page`: the tab page the square is on (bag squares are always shown). */
/** `box` is the square drawn; `zone` the area that takes a dropped item (a gear slot's whole row). */
type Square = { place: ItemPlace; box: Rectangle; zone: Rectangle; icon: Sprite; aura: Sprite; mark: Graphics; hover: Graphics; page: Container | null };

/** A filter over the bag: the kinds of item it shows (null: everything, empty squares too). */
type BagFilter = { label: string; types: readonly ItemType[] | null };
const BAG_FILTERS: readonly BagFilter[] = [
  { label: text('inventory.filter.all'), types: null },
  { label: text('inventory.filter.weapons'), types: ['weapon'] },
  { label: text('inventory.filter.armour'), types: ['helmet', 'armor', 'boots'] },
  { label: text('inventory.filter.shields'), types: ['shield'] },
  { label: text('inventory.filter.other'), types: ['ring', 'medal'] },
];

/** What the "Equip" menu calls the hands, when a weapon may go in either. */
const HAND_CHOICES: Partial<Record<EquipSlot, string>> = {
  primary: text('inventory.menu.equip_primary'),
  secondary: text('inventory.menu.equip_secondary'),
};

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
/** A tab: what stands out of the panels and slides (its frame, glow and title), its page, and where it stands open. */
/**
 * A tab: what stands out of the panels and slides (its frame, glow, the gem's flare and its title), its page, where it
 * stands open, and how far it has risen (0: sunk in behind the panels, 1: standing open) and when it last opened.
 */
type Tab = {
  stand: Container; frame: Sprite; glow: Sprite; flare: Sprite; label: PixelLabel; page: Container; hovered: boolean; rect: Rect;
  lift: number; openedAt: number;
};


const css = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/** The outline of a tab `w` by `h` with its top corners cut `cut` on the slant, `inset` in from its edges (open at the foot). */
function tabPath(ctx: CanvasRenderingContext2D, w: number, h: number, cut: number, inset: number): void {
  ctx.beginPath();
  ctx.moveTo(inset, h);
  ctx.lineTo(inset, cut + inset * 0.6);
  ctx.lineTo(cut + inset * 0.6, inset);
  ctx.lineTo(w - cut - inset * 0.6, inset);
  ctx.lineTo(w - inset, cut + inset * 0.6);
  ctx.lineTo(w - inset, h);
  ctx.closePath();
}

/**
 * A tab's frame (made once for its size), drawn in design pixels on a canvas TAB_RES times finer with TAB_ROOM round it
 * for what juts out: the corner pinnacles behind it; a black outline and a band of dark iron lit faintly from above, darkening towards
 * the panels, with a worn highlight along its top; the dark opening, open down to its foot, with a fang in each upper
 * corner and the faint arch inside; the engraved groove and its curls, rivets down the sides, and the crown with its gem.
 */
const tabFrames = new Map<string, Texture>();
function tabFrameTexture(w: number, h: number): Texture {
  const key = `${w}x${h}`;
  const made = tabFrames.get(key);
  if (made) return made;
  const canvas = createCanvas(Math.round((w + 2 * TAB_ROOM.side) * TAB_RES), Math.round((h + TAB_ROOM.top) * TAB_RES));
  const ctx = context2d(canvas);
  ctx.scale(TAB_RES, TAB_RES);
  ctx.translate(TAB_ROOM.side, TAB_ROOM.top);
  drawPinnacles(ctx, w);
  drawTabBand(ctx, w, h);
  drawTabOpening(ctx, w, h);
  drawArch(ctx, w, h);
  drawEngraving(ctx, w, h);
  drawCrown(ctx, w / 2);
  const texture = Texture.from(canvas);
  tabFrames.set(key, texture);
  return texture;
}

/** The outline and the iron band, and the worn highlight where the light falls on its top and cut corners. */
function drawTabBand(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = css(IRON_OUTLINE);
  tabPath(ctx, w, h, TAB_CHAMFER, 0);
  ctx.fill();
  const iron = ctx.createLinearGradient(0, 0, 0, h);
  iron.addColorStop(0, css(TAB_IRON_TOP));
  iron.addColorStop(1, css(TAB_IRON_FOOT));
  ctx.fillStyle = iron;
  tabPath(ctx, w, h, TAB_CHAMFER, 1);
  ctx.fill();
  ctx.strokeStyle = css(TAB_HIGHLIGHT);
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(1.5, TAB_CHAMFER + 1);
  ctx.lineTo(TAB_CHAMFER + 1, 1.5);
  ctx.lineTo(w - TAB_CHAMFER - 1, 1.5);
  ctx.lineTo(w - 1.5, TAB_CHAMFER + 1);
  ctx.stroke();
}

/** The dark opening with a black lip, and a fang of iron jutting into each of its upper corners. */
function drawTabOpening(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cut = TAB_CHAMFER - 1;
  ctx.fillStyle = css(IRON_OUTLINE);
  tabPath(ctx, w, h + 1, cut, TAB_BAND - 1);
  ctx.fill();
  ctx.fillStyle = css(TAB_INSIDE);
  tabPath(ctx, w, h + 1, cut, TAB_BAND);
  ctx.fill();
  // The fang stands on the middle of the opening's cut corner, pointing in along the diagonal.
  for (const side of [1, -1]) {
    const x0 = side > 0 ? 0 : w;
    const base = { x: x0 + side * (TAB_BAND + cut * 0.25), y: TAB_BAND + cut * 0.55 };
    const base2 = { x: x0 + side * (TAB_BAND + cut * 0.55), y: TAB_BAND + cut * 0.25 };
    const tip = { x: (base.x + base2.x) / 2 + side * FANG * Math.SQRT1_2, y: (base.y + base2.y) / 2 + FANG * Math.SQRT1_2 };
    drawSpike(ctx, [base, tip, base2], tip);
  }
}

/**
 * A gothic pinnacle on the middle of each cut corner: a slender spire straight up, a crocket leaning out on either side
 * of its foot, and a knob for a finial on its point.
 */
function drawPinnacles(ctx: CanvasRenderingContext2D, w: number): void {
  const mid = TAB_CHAMFER / 2;
  for (const x of [mid, w - mid]) {
    const foot = mid + 0.8;
    for (const side of [-1, 1]) {
      const root = x + side * PINNACLE.wide;
      const tip = { x: root + side * PINNACLE.out, y: foot - PINNACLE.crocket };
      drawSpike(ctx, [{ x: root - PINNACLE.wide * 0.7, y: foot }, tip, { x: root + PINNACLE.wide * 0.7, y: foot }], tip);
    }
    const tip = { x, y: mid - PINNACLE.tall };
    drawSpike(ctx, [{ x: x - PINNACLE.wide, y: foot }, tip, { x: x + PINNACLE.wide, y: foot }], tip);
    ctx.fillStyle = css(SPIKE_TIP);
    ctx.strokeStyle = css(IRON_OUTLINE);
    ctx.lineWidth = OUTLINE_W * 0.6;
    ctx.beginPath();
    ctx.arc(x, tip.y + PINNACLE.knob * 1.6, PINNACLE.knob, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

/**
 * Inside the opening, faint so the title reads over it: a pointed gothic arch engraved in pale iron, its legs rising
 * from rivets at their feet and curving in to meet in a point under the gem, a quatrefoil of tracery under the point.
 */
function drawArch(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const left = TAB_BAND + ARCH_INSET;
  const right = w - left;
  const foot = h * ARCH_FOOT;
  const spring = h * ARCH_SPRING;
  const point = { x: w / 2, y: TAB_BAND + ARCH_INSET * 0.6 };
  ctx.globalAlpha = ARCH_ALPHA;
  ctx.strokeStyle = css(TAB_HIGHLIGHT);
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(left, foot);
  ctx.lineTo(left, spring);
  // Each side bends in from upright to meet the other at an angle: the point of a gothic arch.
  ctx.bezierCurveTo(left, point.y + (spring - point.y) * ARCH_BEND.leg, point.x - (point.x - left) * ARCH_BEND.reach, point.y + ARCH_BEND.drop, point.x, point.y);
  ctx.bezierCurveTo(point.x + (right - point.x) * ARCH_BEND.reach, point.y + ARCH_BEND.drop, right, point.y + (spring - point.y) * ARCH_BEND.leg, right, spring);
  ctx.lineTo(right, foot);
  ctx.stroke();
  drawQuatrefoil(ctx, point.x, point.y + QUATREFOIL.r + QUATREFOIL.lobe + 2.5);
  ctx.globalAlpha = 1;
  drawRivet(ctx, left, foot);
  drawRivet(ctx, right, foot);
}

/** Four lobes round a point, the tracery of a gothic window, with an ember-red heart. */
function drawQuatrefoil(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const cx = x + Math.cos(angle) * QUATREFOIL.r;
    const cy = y + Math.sin(angle) * QUATREFOIL.r;
    ctx.moveTo(cx + QUATREFOIL.lobe, cy);
    ctx.arc(cx, cy, QUATREFOIL.lobe, 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.fillStyle = css(GEM_FIRE);
  ctx.beginPath();
  ctx.arc(x, y, QUATREFOIL.lobe * 0.45, 0, Math.PI * 2);
  ctx.fill();
}

/** Three spikes on the top's middle, the middle one tallest, and the gem set in the band under them. */
function drawCrown(ctx: CanvasRenderingContext2D, cx: number): void {
  for (const side of [-1, 1]) {
    const x = cx + side * CROWN.apart;
    const tip = { x: x + side * 0.6, y: -CROWN.short };
    drawSpike(ctx, [{ x: x - CROWN.narrow, y: 0.6 }, tip, { x: x + CROWN.narrow, y: 0.6 }], tip);
  }
  const tip = { x: cx, y: -CROWN.tall };
  drawSpike(ctx, [{ x: cx - CROWN.wide, y: 0.6 }, tip, { x: cx + CROWN.wide, y: 0.6 }], tip);
  drawGem(ctx, cx, TAB_BAND / 2);
}

/** A spike of iron: the polygon given, filled from its root to its pale tip, outlined, its left edge lit. */
function drawSpike(ctx: CanvasRenderingContext2D, points: readonly { x: number; y: number }[], tip: { x: number; y: number }): void {
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  const root = { x: (points[0].x + points[points.length - 1].x) / 2, y: (points[0].y + points[points.length - 1].y) / 2 };
  fillSpike(ctx, root, tip);
  ctx.strokeStyle = css(TAB_HIGHLIGHT);
  ctx.lineWidth = 0.25;
  ctx.beginPath();
  ctx.moveTo(points[0].x + (tip.x - points[0].x) * 0.15, points[0].y + (tip.y - points[0].y) * 0.15);
  ctx.lineTo(tip.x + (points[0].x - tip.x) * 0.15, tip.y + (points[0].y - tip.y) * 0.15);
  ctx.stroke();
}

/** Fills and outlines the current path as iron, dark at `root` and pale towards `tip`. */
function fillSpike(ctx: CanvasRenderingContext2D, root: { x: number; y: number }, tip: { x: number; y: number }): void {
  const iron = ctx.createLinearGradient(root.x, root.y, tip.x, tip.y);
  iron.addColorStop(0, css(SPIKE_ROOT));
  iron.addColorStop(1, css(SPIKE_TIP));
  ctx.fillStyle = iron;
  ctx.fill();
  ctx.strokeStyle = css(IRON_OUTLINE);
  ctx.lineWidth = OUTLINE_W;
  ctx.stroke();
}

/** A blood-red gem cut as a diamond: fire in its middle, dark at its rim, a spark of light on its upper left. */
function drawGem(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - GEM_R);
  ctx.lineTo(x + GEM_R, y);
  ctx.lineTo(x, y + GEM_R);
  ctx.lineTo(x - GEM_R, y);
  ctx.closePath();
  const fire = ctx.createRadialGradient(x, y, 0, x, y, GEM_R);
  fire.addColorStop(0, css(GEM_FIRE));
  fire.addColorStop(1, css(GEM_DARK));
  ctx.fillStyle = fire;
  ctx.fill();
  ctx.strokeStyle = css(IRON_OUTLINE);
  ctx.lineWidth = OUTLINE_W;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 230, 220, 0.85)';
  ctx.fillRect(x - GEM_R * 0.45, y - GEM_R * 0.45, 0.35, 0.35);
}

/**
 * A groove engraved along the band (its dark line and the lit lip under it): along the top, broken for the gem and ending
 * in a curl before each cut corner, and down each side; a rivet on each side below the corner.
 */
function drawEngraving(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const y = TAB_BAND * 0.55;
  const x = TAB_BAND * 0.5;
  const left = TAB_CHAMFER + 1.5;
  const gap = GEM_R + 1.5;
  const cx = w / 2;
  const lines: [number, number, number, number][] = [
    [left + CURL_R, y, cx - gap, y], [cx + gap, y, w - left - CURL_R, y],
    [x, TAB_CHAMFER + 4, x, h - 2], [w - x, TAB_CHAMFER + 4, w - x, h - 2],
  ];
  for (const [x1, y1, x2, y2] of lines) engrave(ctx, x1, y1, x2, y2);
  for (const side of [1, -1]) {
    ctx.beginPath();
    ctx.arc(side > 0 ? left : w - left, y - CURL_R * 0.2, CURL_R, side > 0 ? 0.1 * Math.PI : 0.9 * Math.PI, side > 0 ? 1.8 * Math.PI : -0.8 * Math.PI, side < 0);
    ctx.strokeStyle = `rgba(4, 5, 10, ${GROOVE_ALPHA})`;
    ctx.lineWidth = GROOVE_W;
    ctx.stroke();
  }
  for (const rx of [x, w - x]) drawRivet(ctx, rx, TAB_CHAMFER + 2.2);
}

/** One engraved line: the dark groove and the light catching its lower lip. */
function engrave(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.lineWidth = GROOVE_W;
  ctx.strokeStyle = `rgba(4, 5, 10, ${GROOVE_ALPHA})`;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = `rgba(93, 102, 115, ${GROOVE_LIP_ALPHA})`;
  ctx.beginPath();
  ctx.moveTo(x1 + 0.35, y1 + 0.35);
  ctx.lineTo(x2 + 0.35, y2 + 0.35);
  ctx.stroke();
}

/** A rivet head on the band: a dark dot with a pale spot on its upper left. */
function drawRivet(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = css(IRON_OUTLINE);
  ctx.beginPath();
  ctx.arc(x, y, 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(TAB_RIVET);
  ctx.beginPath();
  ctx.arc(x - 0.25, y - 0.25, 0.6, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * The lantern's light in the open tab's opening (made once, stretched over it): red, strongest along its foot, fading up
 * it and out towards its sides, so neither its edges nor its corners show.
 */
let tabGlow: Texture | null = null;
function tabGlowTexture(): Texture {
  if (tabGlow) return tabGlow;
  const size = 64;
  const canvas = createCanvas(size, size);
  const ctx = context2d(canvas);
  const up = ctx.createLinearGradient(0, size, 0, 0);
  up.addColorStop(0, `rgba(${TAB_GLOW_COLOR}, 1)`);
  up.addColorStop(0.5, `rgba(${TAB_GLOW_COLOR}, 0.3)`);
  up.addColorStop(1, `rgba(${TAB_GLOW_COLOR}, 0)`);
  ctx.fillStyle = up;
  ctx.fillRect(0, 0, size, size);
  // Faded out to the sides: only what the side mask keeps stays.
  const sides = ctx.createLinearGradient(0, 0, size, 0);
  sides.addColorStop(0, 'rgba(0, 0, 0, 0)');
  sides.addColorStop(TAB_GLOW_SIDE_FADE, 'rgba(0, 0, 0, 1)');
  sides.addColorStop(1 - TAB_GLOW_SIDE_FADE, 'rgba(0, 0, 0, 1)');
  sides.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = sides;
  ctx.fillRect(0, 0, size, size);
  tabGlow = Texture.from(canvas);
  return tabGlow;
}

/** The gem's flare (made once): a soft red-orange light, white-hot at its middle. */
const FLARE_TEXTURE_SIZE = 32;
let flareTexture: Texture | null = null;
function gemFlareTexture(): Texture {
  if (flareTexture) return flareTexture;
  const size = FLARE_TEXTURE_SIZE;
  const ctx = context2d(createCanvas(size, size));
  const light = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  light.addColorStop(0, 'rgba(255, 230, 200, 1)');
  light.addColorStop(0.25, `rgba(${TAB_GLOW_COLOR}, 0.8)`);
  light.addColorStop(1, `rgba(${TAB_GLOW_COLOR}, 0)`);
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, size, size);
  flareTexture = Texture.from(ctx.canvas);
  return flareTexture;
}

/** The aura behind untrained gear: a soft red glow, strongest in the middle (made once). */
let auraTexture: Texture | null = null;
function untrainedAura(): Texture {
  if (auraTexture) return auraTexture;
  const size = 64;
  const canvas = createCanvas(size, size);
  const ctx = context2d(canvas);
  const glow = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  glow.addColorStop(0, `rgba(${AURA_COLOR}, 1)`);
  glow.addColorStop(AURA_HOLD, `rgba(${AURA_COLOR}, 0.8)`);
  glow.addColorStop(1, `rgba(${AURA_COLOR}, 0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  auraTexture = Texture.from(canvas);
  return auraTexture;
}

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
  /**
   * Over the root and the search box (whose own Pixi drawing lies in screen space, over the root): the dragged item, the
   * tooltips and the menus, laid out in the root's space.
   */
  private readonly top = new Container();
  private readonly squares: Square[] = [];
  /** The bag's squares on screen; each shows the bag square `bagView[bagRow * cols + i]` (-1: none). */
  private readonly bagSquares: Square[] = [];
  /** The bag squares in the order shown: all of them, or under a filter the items it shows and then the free squares. */
  private readonly bagView: number[] = [];
  private bagRow = 0;
  private filter = 0;
  private readonly filterLabels: PixelLabel[] = [];
  private bagScrollbar: ScrollBar | null = null;
  /** The character sheet's column: what scrolls, the part of the page it shows through, its scrollbar, and how far it is scrolled. */
  private readonly sheetView = new Container();
  private sheetWindow = new Rectangle();
  private sheetScrollbar: ScrollBar | null = null;
  private sheetScroll = 0;
  /** Items marked with Ctrl+click, by where they are, for one menu over them all. */
  private readonly marked = new Map<string, ItemPlace>();
  private abilities: AbilityGrid | null = null;
  private info: SheetInfoPanel | null = null;
  private readonly fields: Field[] = [];
  private proficiencies: ProficiencyPanel | null = null;
  private spells: SpellsPanel | null = null;
  private quickBarPage: QuickBarPage | null = null;
  /** What the rules make of the player's gear, as last drawn (for the tooltips). */
  private sheet: CharacterSheet | null = null;
  private readonly infoTip = new InfoTooltip();
  /** A weapon action's tooltip, beside its icon in the item's tooltip while Alt is held. */
  private readonly actionTip = new InfoTooltip();
  /** An item's right-click menu (send it to another player). */
  private readonly itemMenu = new PopupMenu();
  private readonly gold = new PixelLabel('', { color: 0xffcc00, align: 'right', shadow: true });
  /** The plate the gold and weight stand on, sized to them. */
  private readonly purse = new Graphics();
  /** The search over the bag (made once the canvas it types into is known), and what it holds. */
  private search: TextBox | null = null;
  private query = '';
  private readonly found = new PixelLabel('', { color: THEME.muted, align: 'right', shadow: true });
  private sort: BagSort = 'none';
  private readonly sortButton = new Graphics();
  private readonly tooltip = new ItemTooltip();
  /** The other item in a comparison, beside the first. */
  private readonly compareTip = new ItemTooltip();
  /** While two items are compared, the tooltips stay put (until the next press) instead of following the pointer. */
  private comparing = false;
  private readonly ghost = new Sprite();
  private readonly tabs: Tab[] = [];
  private activeTab = -1;
  /** When the tabs were last moved on (performance.now()), so they move by the time passed. */
  private tabsAt = 0;
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

  /** Over the whole inventory while a spell waits for its quick-bar square (clicks pass through: another spell may be picked). */
  private readonly bindShade = new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT - QUICK_BAR_HEIGHT).fill({ color: THEME.backdrop, alpha: BINDING_SHADE_ALPHA });

  constructor() {
    this.container.visible = false;
    // The game dims under it, all but the quick bar's strip at the foot.
    this.container.addChild(new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT - QUICK_BAR_HEIGHT).fill({ color: THEME.backdrop, alpha: DIM_ALPHA }), this.root);
    this.build();
    this.fitToScreen();
    this.listen();
    this.bindShade.eventMode = 'none';
    this.bindShade.visible = false;
    this.container.addChild(this.bindShade);
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
    if (this.search) this.search.visible = visible;
    if (!visible) {
      this.search?.element.blur();
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
    if (this.search && document.activeElement === this.search.element) {
      this.search.element.blur();
      return true;
    }
    if (this.comparing) {
      this.endCompare();
      return true;
    }
    return this.spells?.closeChoice() ?? false;
  }

  /** A spell waiting for its square: the inventory shaded behind the quick bar, its tooltip put away. */
  private shadeForBinding(): void {
    const binding = !!pendingBinding();
    if (binding) this.infoTip.hide();
    this.bindShade.visible = binding;
  }

  update(): void {
    const player = localPlayer();
    if (!this.container.visible || !player) return;
    this.animateTabs();
    this.shadeForBinding();
    // The search's HTML input lies over the canvas: while a menu is open over it, clicks go through to the menu.
    if (this.search) this.search.clickable = !this.itemMenu.open;
    if (this.activeTab === SKILLS_TAB) this.spells?.animate();
    if (this.activeTab === QUICK_BAR_TAB) this.quickBarPage?.update(player);
    // Alt held or let go: the tooltip up shows its whole story, or its short one again; an action's goes with Alt.
    this.infoTip.refresh();
    if (!isAltHeld()) this.releaseActions();
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
    this.search?.destroy();
    claimPointer(this, false);
    this.infoTip.hide();
    this.container.destroy({ children: true });
  }

  // ── Layout ──────────────────────────────────────────────────────────────────

  private build(): void {
    // The art from its panels down: the strip above holds the two tabs, drawn on their own (addTab).
    const whole = getTexture('inventory_art');
    const art = new Sprite(new Texture({ source: whole.source, frame: new Rectangle(whole.frame.x, whole.frame.y + PANEL_TOP, whole.frame.width, whole.frame.height - PANEL_TOP) }));
    art.scale.set(K);
    art.y = PANEL_TOP * K;
    this.root.addChild(art);
    const title = this.title;
    title.position.set(TITLE.x * K, TITLE.y);
    this.root.addChild(title, this.purse, this.gold, this.weight);
    this.buildBag(designRect(BAG_AREA));
    const gearPage = new Container();
    const skillsPage = new Container();
    this.root.addChild(gearPage, skillsPage);
    this.buildGear(designRect(GEAR_AREA), gearPage);
    this.buildSkillsPage(designRect(GEAR_AREA), skillsPage);
    const barPage = new Container();
    this.root.addChild(barPage);
    this.quickBarPage = new QuickBarPage(designRect(GEAR_AREA));
    barPage.addChild(this.quickBarPage.view);
    [gearPage, skillsPage, barPage].forEach((page, i) => this.addTab(designRect(TABS[i]), TAB_TITLES[i], page));
    this.showTab(CHARACTER_TAB, true);
    this.ghost.anchor.set(0.5);
    this.ghost.alpha = GHOST_ALPHA;
    this.ghost.visible = false;
    this.top.addChild(this.ghost, this.tooltip.view, this.compareTip.view, this.infoTip.view, this.actionTip.view, this.itemMenu.view);
    this.container.addChild(this.top);
  }

  /**
   * A tab: its forged iron frame round a dark opening (tabFrameTexture), its title in it, standing behind the panels with
   * its foot tucked under them; the whole of it a button that shows its page.
   */
  private addTab(tab: Rect, title: string, page: Container): void {
    const stand = new Container();
    stand.position.set(tab.x, tab.y);
    const frame = new Sprite(tabFrameTexture(tab.w, tab.h));
    frame.scale.set(1 / TAB_RES);
    // Its horns and spikes reach past the tab's edges.
    frame.position.set(-TAB_ROOM.side, -TAB_ROOM.top);
    // The glow fills the tab's dark opening: the lantern below lights it and the title from underneath.
    const glow = new Sprite(tabGlowTexture());
    glow.position.set(TAB_BAND, TAB_BAND);
    glow.width = tab.w - 2 * TAB_BAND;
    glow.height = tab.h - TAB_BAND;
    glow.blendMode = 'add';
    // The gem's flare, over the frame where the gem sits in the band.
    const flare = new Sprite(gemFlareTexture());
    flare.anchor.set(0.5);
    flare.position.set(tab.w / 2, TAB_BAND / 2);
    flare.blendMode = 'add';
    flare.alpha = 0;
    const label = new PixelLabel(title, { color: THEME.buttonText, align: 'center', shadow: true });
    label.position.set(Math.round(tab.w / 2), Math.round((TAB_BAND + tab.h) / 2 - GLYPH_H / 2));
    stand.addChild(frame, glow, flare, label);
    const hit = new Container();
    hit.eventMode = 'static';
    hit.cursor = 'pointer';
    hit.hitArea = new Rectangle(tab.x, tab.y, tab.w, tab.h);
    const entry: Tab = { stand, frame, glow, flare, label, page, hovered: false, rect: tab, lift: 0, openedAt: -Infinity };
    const index = this.tabs.length;
    hit.on('pointerover', () => this.hoverTab(entry, true));
    hit.on('pointerout', () => this.hoverTab(entry, false));
    hit.on('pointertap', () => this.showTab(index));
    this.tabs.push(entry);
    // Behind the panels' art (the first thing in the root), the button over everything.
    this.root.addChildAt(stand, 0);
    this.root.addChild(hit);
    this.drawTab(entry);
  }

  private hoverTab(tab: Tab, hovered: boolean): void {
    tab.hovered = hovered;
    this.drawTab(tab);
  }

  /**
   * Opens a tab: its page shows, the others hide. Pressed, it rises and its gem flares (animateTabs); `snap` sets every
   * tab where it belongs at once (the screen being built).
   */
  private showTab(index: number, snap = false): void {
    const opened = index !== this.activeTab;
    this.activeTab = index;
    this.infoTip.hide();
    this.spells?.closeChoice();
    this.tabs.forEach((tab, i) => {
      tab.page.visible = i === index;
      if (snap) tab.lift = i === index ? 1 : 0;
      this.drawTab(tab);
    });
    const tab = this.tabs[index];
    if (tab && opened && !snap) tab.openedAt = performance.now();
    this.placeTabs(0);
  }

  /** The title's colour: bright when open or under the pointer. */
  private drawTab(tab: Tab): void {
    const active = this.tabs[this.activeTab] === tab;
    tab.label.fill = active || tab.hovered ? THEME.buttonHover : THEME.buttonText;
    this.placeTab(tab, 0, performance.now(), 0);
  }

  /** Every update while the screen is up: the tabs rise and sink towards where they belong, the open one's lantern flickers. */
  private animateTabs(): void {
    const now = performance.now();
    const step = Math.min(TAB_MAX_STEP_MS, now - (this.tabsAt || now));
    this.tabsAt = now;
    this.placeTabs(step);
  }

  private placeTabs(step: number): void {
    const now = performance.now();
    const wave = TAB_GLOW_WAVES_MS.reduce((sum, period) => sum + Math.sin((now / period) * Math.PI * 2), 0) / TAB_GLOW_WAVES_MS.length;
    const lantern = TAB_GLOW_ALPHA.low + (TAB_GLOW_ALPHA.high - TAB_GLOW_ALPHA.low) * (wave + 1) / 2;
    for (const tab of this.tabs) this.placeTab(tab, step, now, lantern);
  }

  /**
   * One tab `step` ms on: risen as far as it has got (eased), its frame and title as strong, its lantern as bright as its
   * rise times the flicker, its gem flaring just after it opened, else glowing faintly while open.
   */
  private placeTab(tab: Tab, step: number, now: number, lantern: number): void {
    const target = this.tabs[this.activeTab] === tab ? 1 : 0;
    const move = step / TAB_RISE_MS;
    tab.lift = target > tab.lift ? Math.min(target, tab.lift + move) : Math.max(target, tab.lift - move);
    const eased = tab.lift * tab.lift * (3 - 2 * tab.lift);
    const idle = tab.hovered ? TAB_HOVER_IDLE_ALPHA : TAB_IDLE_ALPHA;
    const alpha = idle + (1 - idle) * eased;
    tab.stand.y = tab.rect.y + (1 - eased) * TAB_SINK;
    tab.frame.alpha = alpha;
    tab.label.alpha = alpha;
    tab.glow.visible = eased > 0;
    tab.glow.alpha = lantern * eased;
    const t = (now - tab.openedAt) / TAB_FLARE_MS;
    const flaring = t >= 0 && t < 1;
    tab.flare.alpha = flaring ? 1 - t : TAB_GEM_GLOW * lantern * eased;
    tab.flare.scale.set((flaring ? TAB_FLARE_SCALE.from + (TAB_FLARE_SCALE.to - TAB_FLARE_SCALE.from) * t : TAB_FLARE_SCALE.from) * TAB_FLARE_SIZE / FLARE_TEXTURE_SIZE);
  }

  /**
   * The bag: borderless cells packed close together and stretched to the leather's corners (a little wider
   * than tall where the leather is); icons fit the smaller side.
   */
  private buildBag(bag: Rect): void {
    this.buildFilters(bag);
    this.buildSortButton(bag);
    const head = FILTER_H + SEARCH_H + SEARCH_GAP;
    const area = { x: bag.x, y: bag.y + head, w: bag.w - BAG_SCROLLBAR_W - BAG_GAP, h: bag.h - head };
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
      this.bagSquares.push(this.addSquare({ bag: i }, x, y, right - x, null, undefined, 'bag', bottom - y));
    }
    this.bagScrollbar = new ScrollBar(new Rectangle(bag.x + bag.w - BAG_SCROLLBAR_W, area.y + BAG_PAD, BAG_SCROLLBAR_W, area.h - 2 * BAG_PAD));
    this.root.addChild(this.bagScrollbar.view);
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

  /** The sort button at the filter row's right end: three bars, longest on top; a click opens the ways to order the bag. */
  private buildSortButton(bag: Rect): void {
    const x = Math.round(bag.x + bag.w - BAG_SCROLLBAR_W - SORT_SIZE);
    const y = Math.round(bag.y);
    const button = this.sortButton;
    button.position.set(x, y);
    button.eventMode = 'static';
    button.cursor = 'pointer';
    button.hitArea = new Rectangle(-2, -1, SORT_SIZE + 4, FILTER_H);
    button.on('pointertap', () => this.openSortMenu(x, y + FILTER_H));
    this.root.addChild(button);
    this.drawSortButton();
  }

  /** Gold while the bag is sorted, muted while it lies as it is. */
  private drawSortButton(): void {
    const color = this.sort === 'none' ? THEME.muted : THEME.title;
    const g = this.sortButton.clear();
    [SORT_SIZE, SORT_SIZE - 3, SORT_SIZE - 6].forEach((w, i) => g.rect(0, 1 + i * 3, w, 2).fill({ color }));
  }

  /** The ways to order the bag, the one in use marked. */
  private openSortMenu(x: number, y: number): void {
    const rows: MenuRow[] = BAG_SORTS.map((sort) => ({
      label: `${sort === this.sort ? '> ' : ''}${text(`inventory.sort.${sort}`)}`,
      action: () => this.setSort(sort),
    }));
    this.hideItemTips();
    this.itemMenu.show(rows, x, y, { w: DESIGN_W, h: DESIGN_H });
  }

  private setSort(sort: BagSort): void {
    this.sort = sort;
    this.bagRow = 0;
    this.drawSortButton();
    this.shown = null;
  }

  /**
   * The search box under the filters, typed into through the page's canvas (scene/InGameScene.ts hands it over): the
   * bag shows only the items whose names hold the letters typed, in order (core/fuzzy.ts), as they are typed.
   */
  attachSearch(canvas: HTMLCanvasElement): void {
    if (this.search) return;
    const bag = designRect(BAG_AREA);
    const scale = this.root.scale.x;
    const box = {
      x: Math.round(this.root.x + bag.x * scale), y: Math.round(this.root.y + (bag.y + FILTER_H) * scale),
      w: Math.round((bag.w - BAG_SCROLLBAR_W) * scale), h: Math.round(SEARCH_H * scale),
    };
    this.search = new TextBox(canvas, box, { ariaLabel: text('inventory.search'), placeholder: text('inventory.search'), maxLength: MAX_QUERY });
    this.search.element.addEventListener('input', () => this.setQuery(this.search?.value ?? ''));
    this.search.visible = this.container.visible;
    // The count of what was found sits inside the box's right end, over it.
    this.found.position.set(box.x + box.w - FOUND_PAD, box.y + Math.round((box.h - GLYPH_H) / 2));
    // Under the tooltips and menus, which open over it.
    this.container.addChildAt(this.search.view, this.container.getChildIndex(this.top));
    this.container.addChildAt(this.found, this.container.getChildIndex(this.top));
  }

  private setQuery(query: string): void {
    this.query = query.trim();
    this.bagRow = 0;
    this.shown = null;
  }

  /**
   * What an item's tooltip is told: the hero (training, STR, the abilities its damage adds), the letters a search matched, the
   * item it is compared with, and — worn — who wears it and the spells on it now.
   */
  private tipContext(item: InventoryItem, against?: InventoryItem): TooltipContext {
    const sheet = this.sheet;
    const player = localPlayer();
    const worn = !!player && Object.values(player.equipped ?? {}).includes(item);
    const wearer = worn && player ? { wearer: player.playerName || heroName(player.heroClass ?? 'fighter'), enchantments: spellsOn(player, item) } : {};
    return {
      cls: sheet?.heroClass, strength: sheet?.scores.strength, modifiers: sheet?.modifiers, featArmor: sheet?.feats.armor, featWeapons: sheet?.feats.weapons,
      matched: this.matchedLetters(item), against, ...wearer,
    };
  }

  /** The letters of an item's name the search matched (none while nothing is typed). */
  private matchedLetters(item: InventoryItem): readonly number[] {
    return this.query ? fuzzyMatch(this.query, item.name) ?? [] : [];
  }

  /**
   * Which bag square each square on screen shows: the filter's view of the bag (everything; or the items it lets
   * through, then the free squares to drop onto), from the row scrolled to.
   */
  private layoutBag(player: Player): void {
    const inventory = player.inventory ?? [];
    const view = bagView(inventory, MAX_INVENTORY, { types: BAG_FILTERS[this.filter].types, search: this.query, sort: this.sort, trained: (item) => this.trained(item) }, this.bagView);
    this.found.text = this.query ? text('inventory.search_found', { count: view.filter((i) => inventory[i]).length }) : '';
    this.bagRow = Math.max(0, Math.min(this.bagRow, this.lastBagRow()));
    this.bagSquares.forEach((square, i) => {
      if ('bag' in square.place) square.place.bag = view[this.bagRow * INVENTORY_COLS + i] ?? -1;
    });
    const last = this.lastBagRow();
    this.bagScrollbar?.set(last ? this.bagRow / last : 0, BAG_VISIBLE_ROWS / (last + BAG_VISIBLE_ROWS));
  }

  /** Whether the hero is trained in an item (a weapon, armour or a shield, feats counted; anything else needs no training). */
  private trained(item: InventoryItem): boolean {
    const sheet = this.sheet;
    return !sheet || itemTrained(sheet.heroClass, item, sheet.feats.armor, sheet.feats.weapons);
  }

  /** The furthest row the bag can be scrolled to. */
  private lastBagRow(): number {
    return Math.max(0, Math.ceil(this.bagView.length / INVENTORY_COLS) - BAG_VISIBLE_ROWS);
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
    const share = this.bagScrollbar?.positionAt(y) ?? 0;
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
    const right = Math.round(area.x + area.w - PAD);
    // Room kept at the column's right for its scrollbar.
    const colW = right - statsX - BAG_SCROLLBAR_W - SHEET_SCROLLBAR_GAP;
    const top = Math.round(area.y + PAD);
    const bottom = Math.round(area.y + area.h - PAD);
    const sheet = this.sheetView;
    this.abilities = new AbilityGrid(statsX, top, colW);
    sheet.addChild(this.abilities.view);
    this.buildSheet(statsX, top + ABILITY_CELL_H, colW, sheet);
    this.sheetWindow = new Rectangle(statsX, top, right - statsX, bottom - top);
    const window = this.sheetWindow;
    const mask = new Graphics().rect(window.x, window.y, window.width, window.height).fill({ color: 0xffffff });
    sheet.mask = mask;
    this.sheetScrollbar = new ScrollBar(new Rectangle(right - BAG_SCROLLBAR_W, top, BAG_SCROLLBAR_W, window.height));
    page.addChild(sheet, mask, this.sheetScrollbar.view);
  }

  /** How tall the character sheet's column is, from its top. */
  private sheetHeight(): number {
    const prof = this.proficiencies;
    return prof ? prof.view.y + prof.height - this.sheetWindow.y : 0;
  }

  /** Scrolls the character sheet's column by `dy` (kept within it), and shows where it is on its scrollbar. */
  private scrollSheet(dy: number): void {
    const view = this.sheetWindow.height;
    const room = Math.max(0, this.sheetHeight() - view);
    this.sheetScroll = Math.round(Math.max(0, Math.min(room, this.sheetScroll + dy)));
    this.sheetView.y = -this.sheetScroll;
    this.sheetScrollbar?.set(room ? this.sheetScroll / room : 0, room ? view / (room + view) : 1);
  }

  /** The scrollbar dragged: the sheet shows the part where the pointer is along its track. */
  private scrollSheetTo(y: number): void {
    const room = Math.max(0, this.sheetHeight() - this.sheetWindow.height);
    this.scrollSheet((this.sheetScrollbar?.positionAt(y) ?? 0) * room - this.sheetScroll);
  }

  /**
   * A point on the page in the character sheet's own space (its column scrolled), or null when it is not over the part
   * of the column shown.
   */
  private sheetPoint(x: number, y: number): { x: number; y: number } | null {
    if (!this.sheetWindow.contains(x, y)) return null;
    return { x, y: y + this.sheetScroll };
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
   * One cell (bag square or equipment slot), `size` wide and `height` tall (square unless given): a well with a light
   * edge (a bag cell's darker, its edge fainter), and the icon of what is in it.
   */
  private addSquare(place: ItemPlace, x: number, y: number, size: number, page: Container | null = null, zone?: Rectangle, look: 'slot' | 'bag' = 'slot', height = size): Square {
    const bag = look === 'bag';
    const frame = new Graphics().rect(x, y, size, height).fill({ color: bag ? BAG_CELL_FILL : SQUARE_FILL, alpha: bag ? BAG_CELL_FILL_ALPHA : SQUARE_FILL_ALPHA })
      .stroke({ color: SQUARE_EDGE, alpha: bag ? BAG_CELL_EDGE_ALPHA : SQUARE_EDGE_ALPHA, width: 1, alignment: 1 });
    const icon = new Sprite();
    icon.anchor.set(0.5);
    icon.position.set(x + size / 2, y + height / 2);
    const aura = new Sprite(untrainedAura());
    aura.anchor.set(0.5);
    aura.position.copyFrom(icon.position);
    aura.width = aura.height = Math.min(size, height) * AURA_SHARE;
    aura.alpha = AURA_ALPHA;
    aura.visible = false;
    const mark = new Graphics().rect(x, y, size, height).fill({ color: THEME.title, alpha: MARK_ALPHA })
      .stroke({ color: THEME.title, width: 1, alignment: 1 });
    mark.visible = false;
    // Edged under the pointer, or as the square a dragged item would land in (drawn white, tinted then).
    const hover = new Graphics().rect(x, y, size, height).fill({ color: 0xffffff, alpha: HOVER_FILL_ALPHA })
      .stroke({ color: 0xffffff, width: 1, alignment: 1 });
    hover.visible = false;
    (page ?? this.root).addChild(frame, aura, icon, mark, hover);
    const box = new Rectangle(x, y, size, height);
    const square: Square = { place, box, zone: zone ?? box, icon, aura, mark, hover, page };
    this.squares.push(square);
    return square;
  }

  /**
   * Scales the whole overlay to the largest size that fits the screen with a margin, centred across and set at the top, so
   * the quick bar at the foot stays in sight under it (a spell is bound to it from here).
   */
  private fitToScreen(): void {
    const tall = GAME_HEIGHT - SCREEN_MARGIN - QUICK_BAR_HEIGHT;
    const scale = Math.min((GAME_WIDTH - 2 * SCREEN_MARGIN) / DESIGN_W, tall / DESIGN_H);
    this.root.scale.set(scale);
    this.root.position.set(Math.round((GAME_WIDTH - DESIGN_W * scale) / 2), SCREEN_MARGIN);
    this.top.scale.copyFrom(this.root.scale);
    this.top.position.copyFrom(this.root.position);
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
    for (const square of this.squares) {
      const item = this.itemIn(player, square.place);
      square.aura.visible = !!item && !this.trained(item);
    }
    this.title.text = player.playerName || heroName(sheet.heroClass.id);
    this.abilities?.set(sheet);
    for (const { field, def } of this.fields) field.set(def.value(sheet));
    this.info?.set(sheet);
    this.proficiencies?.set(sheet);
    // The column's height may have changed: kept scrolled within it.
    this.scrollSheet(0);
    this.spells?.set(player);
    this.gold.text = text('inventory.gold', { amount: player.playerStats.gold });
    const kg = carriedWeight(player);
    this.weight.text = text('inventory.weight', { carried: kg.toFixed(1), max: MAX_CARRY_KG });
    this.weight.fill = kg > MAX_CARRY_KG * HEAVY_SHARE ? 0xffa060 : THEME.buttonText;
    this.drawPurse();
  }

  /**
   * The plate the gold and weight stand on: the bag frame's iron, standing on the frame's top right corner and open at
   * its foot, so it reads as part of the bag, sized to the longer line.
   */
  private drawPurse(): void {
    const right = Math.round(BAG_FRAME.right * K);
    const bottom = Math.round(PANEL_TOP * K) + 1;
    const w = Math.ceil(Math.max(this.gold.textWidth, this.weight.textWidth)) + 2 * PURSE_PAD;
    const x = right - w;
    const y = bottom - PURSE_H;
    this.purse.clear()
      .rect(x - 1, y - 1, w + 2, PURSE_H + 1).fill({ color: IRON_OUTLINE })
      .rect(x, y, w, PURSE_H).fill({ color: IRON })
      .rect(x, y, w, 1).fill({ color: IRON_EDGE })
      .rect(x, y, 1, PURSE_H - 1).fill({ color: IRON_EDGE });
    this.gold.position.set(right - PURSE_PAD, y + 3);
    this.weight.position.set(right - PURSE_PAD, y + 3 + WEIGHT_ROW);
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
    if (this.activeTab === CHARACTER_TAB && this.sheetPoint(p.x, p.y)) {
      this.scrollSheet(Math.sign(e.deltaY) * SHEET_WHEEL_STEP);
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
   * Right-click on an item: a menu of what can be done with it — put it on (or take it off), drop it at the hero's
   * feet, compare it with another of its kind, or send it to another player (into the first free square of their bag).
   */
  private openItemMenu(player: Player, e: FederatedPointerEvent): void {
    const square = this.squareAt(e);
    const item = square ? this.itemIn(player, square.place) : undefined;
    const p = this.root.toLocal(e.global);
    if (square && this.marked.size > 1 && this.marked.has(placeKey(square.place))) {
      this.openMarkedMenu(player, p.x, p.y);
      return;
    }
    this.markOnly(square && item ? square.place : null);
    if (!square || !item) return;
    const place = copyPlace(square.place);
    const rows: MenuRow[] = [];
    const equip = 'bag' in place ? this.equipRow(player, place, item) : null;
    if (equip) rows.push(equip);
    if ('slot' in place && freeSquare(player.inventory ?? []) >= 0) rows.push({ label: text('inventory.menu.take_off'), action: () => this.quickMove(player, place) });
    rows.push(
      { label: text('inventory.menu.drop'), action: () => requestDrop(player, place) },
      { label: text('inventory.menu.compare'), action: null, submenu: this.compareRows(player, item, p.x, p.y) },
    );
    for (const other of q.players) {
      if (other === player) continue;
      const name = other.playerName ?? '';
      rows.push({ label: text('inventory.menu.send_to', { name }), action: () => requestGive(player, place, seatOf(other)) });
    }
    this.hideItemTips();
    this.itemMenu.show(rows, p.x, p.y, { w: DESIGN_W, h: DESIGN_H });
  }

  /**
   * "Equip" for an item in the bag: put on where it goes (a shield on the off-hand, armour on the body); a weapon, which
   * either hand can hold, opens a choice of the main hand or the off-hand. Null for what cannot be worn.
   */
  private equipRow(player: Player, place: ItemPlace, item: InventoryItem): MenuRow | null {
    const slots = EQUIP_SLOTS.filter((slot) => fitsSlot(item, slot));
    if (slots.length === 0) return null;
    const label = text('inventory.menu.equip');
    if (slots.length === 1) return { label, action: () => this.equipTo(player, place, slots[0]) };
    const submenu = slots.map((slot) => ({ label: HAND_CHOICES[slot] ?? slotLabel(slot), action: () => this.equipTo(player, place, slot) }));
    return { label, action: null, submenu };
  }

  /** Puts an item on in a slot, whatever is worn there going back where the item was (refused if the rules forbid it). */
  private equipTo(player: Player, from: ItemPlace, slot: EquipSlot): void {
    const next = moveWorn(player, from, { slot });
    if (!next) return;
    requestLoadout(player, next);
    this.clearMarks();
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
    this.hideItemTips();
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

  /** A plain click: the item clicked becomes the only one marked (none, for a click on nothing). */
  private markOnly(place: ItemPlace | null): void {
    const key = place ? placeKey(place) : null;
    if (key && this.marked.size === 1 && this.marked.has(key)) return;
    this.clearMarks();
    if (!place || !key) return;
    this.marked.set(key, copyPlace(place));
    this.shown = null;
  }

  /** Two items marked (one clicked, the other Ctrl+clicked): shown side by side, the second against the first. */
  private compareMarked(x: number, y: number): void {
    const player = localPlayer();
    if (!player || this.marked.size !== 2) return;
    const [first, second] = [...this.marked.values()].map((place) => this.itemIn(player, place));
    if (!first || !second) return;
    this.tooltip.hide();
    this.compare(first, second, x, y);
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

  /**
   * The two items side by side (the second to the right of the first, or to its left where there is no room), the
   * second marked where it beats the first or falls short of it (green and red arrows, for two of a kind).
   */
  private compare(item: InventoryItem, other: InventoryItem, x: number, y: number): void {
    this.comparing = true;
    this.sideBySide(item, other, x, y, this.tipContext(item), this.tipContext(other, item));
  }

  /** Two tooltips side by side: the first at the pointer, the second right of it (or left, where there is no room). */
  private sideBySide(item: InventoryItem, other: InventoryItem, x: number, y: number, about: TooltipContext, otherAbout: TooltipContext): void {
    const bounds = { w: DESIGN_W, h: DESIGN_H };
    this.tooltip.show(item, x, y, bounds, about);
    const first = this.tooltip.view;
    const right = first.x + first.width + COMPARE_GAP;
    this.compareTip.show(other, right - ItemTooltip.OFFSET, y, bounds, otherAbout);
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
    const item = this.itemIn(player, place);
    if (!item) return;
    const slot = 'bag' in place ? slotFor(player.equipped ?? {}, item, true) : null;
    const free = freeSquare(player.inventory ?? []);
    const to: ItemPlace | null = 'bag' in place ? (slot ? { slot } : null) : (free >= 0 ? { bag: free } : null);
    const next = to ? moveWorn(player, place, to) : null;
    if (!next) return;
    requestLoadout(player, next);
    this.clearMarks();
  }

  /** A press on the Skills tab goes to the spell list (a spell, or one of its level boxes). */
  private pressSkills(e: FederatedPointerEvent): boolean {
    const p = this.root.toLocal(e.global);
    return this.spells?.press(p.x, p.y) ?? false;
  }

  private startDrag(e: FederatedPointerEvent): void {
    const player = localPlayer();
    if (e.button !== RIGHT_BUTTON && this.bindActionAt(e)) return;
    // A press on the menu is for its rows; anywhere else closes the menu.
    if (this.itemMenu.covers(e.global)) return;
    this.itemMenu.hide();
    this.endCompare();
    const p = this.root.toLocal(e.global);
    if (this.bagScrollbar?.grips(p.x, p.y)) {
      this.bagScrollbar.hold(true);
      this.scrollBagTo(p.y);
      return;
    }
    if (this.activeTab === CHARACTER_TAB && this.sheetScrollbar?.grips(p.x, p.y)) {
      this.sheetScrollbar.hold(true);
      this.scrollSheetTo(p.y);
      return;
    }
    if (player && e.button === RIGHT_BUTTON) {
      this.openItemMenu(player, e);
      return;
    }
    const square = this.squareAt(e);
    const item = player && square ? this.itemIn(player, square.place) : undefined;
    // Ctrl+click marks one more item (or unmarks it): with two marked, they are compared.
    if (square && item && (e.ctrlKey || e.metaKey)) {
      this.toggleMark(square.place);
      this.compareMarked(p.x, p.y);
      return;
    }
    // A click on an item marks it alone (as it is picked up); anywhere else unmarks them all.
    this.markOnly(square && item ? square.place : null);
    if (this.activeTab === SKILLS_TAB && this.pressSkills(e)) return;
    if (!player || !square || !item) return;
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
    if (this.bagScrollbar?.dragging) {
      this.scrollBagTo(p.y);
      return;
    }
    if (this.sheetScrollbar?.dragging) {
      this.scrollSheetTo(p.y);
      return;
    }
    if (!this.dragging) {
      this.bagScrollbar?.hover(p.x, p.y);
      this.sheetScrollbar?.hover(p.x, p.y);
    }
    this.ghost.position.set(p.x, p.y);
    const player = localPlayer();
    const square = this.squareAt(e);
    // While Alt is held the tooltips stay put for their weapon actions (a comparison's too).
    if (!this.dragging && this.pinnedForActions(e)) return;
    if (this.comparing) return;
    if (this.activeTab === SKILLS_TAB) this.spells?.hover(p.x, p.y);
    const item = player && square && !this.dragging && !this.itemMenu.open ? this.itemIn(player, square.place) : undefined;
    // The square under the pointer is edged; while an item is dragged, the square it would land in.
    this.highlight(this.dragging ? this.squareAt(e, true) : item ? square : undefined, !!this.dragging);
    if (player && square && item) this.showItem(player, square.place, item, p.x, p.y);
    else this.hideItemTips();
    this.updateInfoTip(p.x, p.y);
  }

  /**
   * The tooltip of the item under the pointer; one in the bag that would take the place of something worn (a weapon, body
   * armour, headwear) is shown beside the worn one, arrows saying where it is better or worse.
   */
  private showItem(player: Player, place: ItemPlace, item: InventoryItem, x: number, y: number): void {
    const worn = 'bag' in place ? wornCounterpart(player.equipped ?? {}, item) : undefined;
    if (!worn) {
      this.compareTip.hide();
      this.tooltip.show(item, x, y, { w: DESIGN_W, h: DESIGN_H }, this.tipContext(item));
      return;
    }
    this.sideBySide(item, worn, x, y, this.tipContext(item, worn), this.tipContext(worn));
  }

  private hideItemTips(): void {
    this.tooltip.hide();
    this.compareTip.hide();
    this.actionTip.hide();
  }

  /**
   * While Alt is held an item's tooltip stays where it is, so the pointer can go over the weapon actions it unlocks: the one
   * under it is edged and shows its own tooltip beside it. Returns whether the tooltip is held so (the item under the pointer
   * is not looked for).
   */
  private pinnedForActions(e: FederatedPointerEvent): boolean {
    const player = localPlayer();
    if (!isAltHeld() || !(this.tooltip.visible || this.compareTip.visible) || !player) {
      this.releaseActions();
      return false;
    }
    const at = this.actionUnder(e);
    // Only the tooltip under the pointer edges an action; the other forgets its edge.
    for (const tip of [this.tooltip, this.compareTip]) tip.hoverAction(at?.tip === tip ? at.id : null);
    const box = at ? at.tip.actionBox(at.id) : null;
    if (!at || !box) {
      this.actionTip.hide();
      return true;
    }
    this.actionTip.showAt(actionTopic(weaponAction(at.id), player), box, { w: DESIGN_W, h: DESIGN_H }, 'beside');
    return true;
  }

  /** The weapon action under the pointer in either item tooltip (the item's, or the one it is compared with), and which. */
  private actionUnder(e: FederatedPointerEvent): { tip: ItemTooltip; id: WeaponActionId } | null {
    for (const tip of [this.tooltip, this.compareTip]) {
      const id = tip.actionAt(e.global);
      if (id) return { tip, id };
    }
    return null;
  }

  /** Alt let go: the action's tooltip goes and the items' follow the pointer again. */
  private releaseActions(): void {
    this.actionTip.hide();
    this.tooltip.hoverAction(null);
    this.compareTip.hoverAction(null);
  }

  /**
   * A click on a weapon action's icon while Alt holds the item's tooltip: the action waits for a quick-bar square, as a spell
   * does (game/SpellBinding.ts; the host checks the hero may bind it). Locked (untrained), it says so. Returns whether the
   * click was for an action.
   */
  private bindActionAt(e: FederatedPointerEvent): boolean {
    if (!isAltHeld()) return false;
    const at = this.actionUnder(e);
    if (!at) return false;
    const { tip, id } = at;
    if (!tip.actionsUnlocked) {
      sound.playLocal('fail');
      return true;
    }
    this.endCompare();
    this.hideItemTips();
    beginBinding({ spell: actionBinding(id), level: 0 });
    return true;
  }

  /** Edges the square (the pointer's, or a dragged item's landing place, in gold) and no other. */
  private highlight(square: Square | undefined, landing: boolean): void {
    for (const s of this.squares) {
      const lit = s === square;
      s.hover.visible = lit;
      if (!lit) continue;
      s.hover.tint = landing ? THEME.title : 0xffffff;
      s.hover.alpha = landing ? LANDING_ALPHA : HOVER_ALPHA;
    }
  }

  /**
   * Over a stat or a sheet field on the Gear page, or a spell on the Skills tab (and nothing held): its full name, what
   * it does and how it adds up, following the pointer.
   */
  private updateInfoTip(x: number, y: number): void {
    const bounds = { w: DESIGN_W, h: DESIGN_H };
    const skills = this.activeTab === SKILLS_TAB;
    // A level box of a spell being bound: a small tooltip of what that level changes, clear of the row of level boxes.
    const level = !this.dragging && skills ? this.spells?.levelTipAt(x, y) : null;
    if (level) {
      this.infoTip.showAt(level.topic, level.clear, bounds, 'clear');
      return;
    }
    const topic = this.dragging ? null : skills ? this.spells?.topicAt(x, y) ?? null : this.pageTopicAt(x, y);
    if (topic) this.infoTip.show(topic, x, y, bounds);
    else this.infoTip.hide();
  }

  /** What the open page (the character sheet, or the quick bar's) tells at a point, if anything. */
  private pageTopicAt(x: number, y: number): TipTopic | null {
    return this.activeTab === QUICK_BAR_TAB ? this.quickBarPage?.topicAt(x, y) ?? null : this.topicAt(x, y);
  }

  /** The tooltip topic under a point of the character sheet's column (scrolled as it is), if any. */
  private topicAt(px: number, py: number): TipTopic | null {
    const sheet = this.sheet;
    const at = this.sheetPoint(px, py);
    if (!sheet || !at) return null;
    const { x, y } = at;
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
    const next = moveWorn(player, from, target);
    if (!next) return;
    requestLoadout(player, next);
    this.clearMarks();
  }

  private endDrag(): void {
    this.highlight(undefined, false);
    this.bagScrollbar?.hold(false);
    this.sheetScrollbar?.hold(false);
    this.dragging = null;
    this.ghost.visible = false;
    for (const square of this.squares) square.icon.alpha = 1;
    this.shown = null;
  }
}

/** The spells on a worn item now, by name: Magic Weapon or Shadow Blade on the weapon in the main hand. */
function spellsOn(player: Player, item: InventoryItem): string[] {
  const buffs = player.buffs;
  if (!buffs || player.equipped?.primary !== item) return [];
  const spells: string[] = [];
  if ((buffs.magicWeapon ?? 0) > 0) spells.push(spellName('magic_weapon'));
  if ((buffs.shadowBlade ?? 0) > 0) spells.push(spellName('shadow_blade'));
  return spells;
}
