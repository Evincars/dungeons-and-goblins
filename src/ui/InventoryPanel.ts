import { Container, Graphics, Sprite } from 'pixi.js';
import { world } from '../world';
import type { InventoryItem, EquipSlot, Entity } from '../world';
import { PixelLabel } from './PixelText';
import { GAME_WIDTH, VIEW_HEIGHT } from '../render/Camera';

// ─── Layout constants ────────────────────────────────────────────────────────
const PW  = 492;
const PH  = 340;
const SS  = 44;          // slot size
const BORDER = 0x8a6030;
const BG     = 0x0c0a08;
const SLOT_BG     = 0x1c1610;
const SLOT_BORDER = 0x5a4030;
const SLOT_EMPTY  = 0x2c2018;

const EQUIP_SLOTS: Array<{ id: EquipSlot; label: string; dx: number; dy: number }> = [
  { id: 'helmet', label: 'HEAD',   dx:   0, dy: -92 },
  { id: 'chest',  label: 'CHEST',  dx:  88, dy: -22 },
  { id: 'weapon', label: 'WEAPON', dx: -88, dy: -22 },
  { id: 'gloves', label: 'GLOVES', dx: -88, dy:  44 },
  { id: 'boots',  label: 'BOOTS',  dx:   0, dy:  90 },
  { id: 'ring',   label: 'RING',   dx:  88, dy:  44 },
];

const BAG_COLS = 5;
const BAG_ROWS = 3;

// Item icon colors by type
const ICON_COLORS: Record<string, [number, number]> = {
  weapon:       [0xd0d8e8, 0x6060a0],
  helmet:       [0x3a6a9a, 0x1a3a5a],
  chest:        [0x2a4a7a, 0x1a2a4a],
  gloves:       [0x6a4a9a, 0x3a2a5a],
  boots:        [0x5a3a22, 0x2a1c10],
  ring:         [0xd4a030, 0x7a5010],
  health_potion:[0xd43030, 0x7a1010],
  mana_potion:  [0x3040d4, 0x10207a],
  sword_scroll: [0xf0d880, 0x8a6020],
  armor_piece:  [0x2a5a8a, 0x122a4a],
};

// ─── InventoryPanel ──────────────────────────────────────────────────────────

export class InventoryPanel {
  readonly container = new Container();

  // Slot containers: equip slots keyed by EquipSlot, bag slots by index
  private equipContainers = new Map<EquipSlot, SlotView>();
  private bagContainers: SlotView[] = [];

  // Stats labels
  private statAtk!: PixelLabel;
  private statDef!: PixelLabel;
  private statHp!: PixelLabel;
  private goldLabel!: PixelLabel;

  // Drag state
  private dragging: { item: InventoryItem; from: string } | null = null;
  private dragGhost: Graphics | null = null;
  private pointerX = 0;
  private pointerY = 0;

  // Panel origin
  private px0: number;
  private py0: number;

  constructor() {
    this.px0 = Math.floor((GAME_WIDTH - PW) / 2);
    this.py0 = Math.floor((VIEW_HEIGHT - PH) / 2);
    this.build();
    this.container.visible = false;
  }

  // ─── Build ─────────────────────────────────────────────────────────────────

  private build(): void {
    const { px0, py0 } = this;

    // Capture pointer events over entire panel to track mouse during drag
    this.container.eventMode = 'static';
    this.container.hitArea = {
      contains: (x: number, y: number) => x >= px0 && y >= py0 && x < px0 + PW && y < py0 + PH,
    } as any;
    this.container.on('pointermove', (e) => {
      this.pointerX = e.global.x;
      this.pointerY = e.global.y;
      if (this.dragGhost) {
        this.dragGhost.x = this.pointerX - SS / 2;
        this.dragGhost.y = this.pointerY - SS / 2;
      }
    });
    this.container.on('pointerup', () => this.cancelDrag());
    this.container.on('pointerupoutside', () => this.cancelDrag());

    // ── Background ────────────────────────────────────────────────────────────
    const bg = new Graphics();
    // main fill
    bg.rect(px0, py0, PW, PH).fill({ color: BG, alpha: 0.97 });
    // outer border
    bg.rect(px0, py0, PW, 2).fill({ color: BORDER });
    bg.rect(px0, py0 + PH - 2, PW, 2).fill({ color: BORDER });
    bg.rect(px0, py0, 2, PH).fill({ color: BORDER });
    bg.rect(px0 + PW - 2, py0, 2, PH).fill({ color: BORDER });
    // inner border
    bg.rect(px0 + 4, py0 + 4, PW - 8, 1).fill({ color: 0x4a3018 });
    bg.rect(px0 + 4, py0 + PH - 5, PW - 8, 1).fill({ color: 0x4a3018 });
    // title bar
    bg.rect(px0, py0, PW, 20).fill({ color: 0x14100a });
    // divider between left & right halves
    bg.rect(px0 + 242, py0 + 20, 2, PH - 20).fill({ color: 0x3a2810 });
    // bottom stats bar
    bg.rect(px0, py0 + PH - 22, PW, 1).fill({ color: 0x3a2810 });
    this.container.addChild(bg);

    // ── Title ─────────────────────────────────────────────────────────────────
    const title = new PixelLabel('INVENTORY', { color: 0xffcc44, shadow: true, scale: 1 });
    title.x = px0 + Math.floor(PW / 2 - title.textWidth / 2);
    title.y = py0 + 6;
    this.container.addChild(title);

    const hint = new PixelLabel('[Tab] Close', { color: 0x554433 });
    hint.x = px0 + PW - hint.textWidth - 10;
    hint.y = py0 + 6;
    this.container.addChild(hint);

    // ── Paper doll (left half) ─────────────────────────────────────────────────
    const dollX = px0 + 120;  // center of figure in world
    const dollY = py0 + 168;

    this.buildPaperDollFigure(dollX, dollY);
    this.buildEquipSlots(dollX, dollY);

    // ── Section label ─────────────────────────────────────────────────────────
    const eqLabel = new PixelLabel('EQUIPMENT', { color: 0x665544 });
    eqLabel.x = px0 + 8;
    eqLabel.y = py0 + 24;
    this.container.addChild(eqLabel);

    // ── Backpack (right half) ─────────────────────────────────────────────────
    const bagLabel = new PixelLabel('BACKPACK', { color: 0x665544 });
    bagLabel.x = px0 + 250;
    bagLabel.y = py0 + 24;
    this.container.addChild(bagLabel);

    this.buildBackpack(px0 + 250, py0 + 36);

    // ── Stats bar ─────────────────────────────────────────────────────────────
    const statY = py0 + PH - 16;
    const atkLbl = new PixelLabel('ATK:', { color: 0x888877 });
    atkLbl.x = px0 + 8; atkLbl.y = statY;
    this.container.addChild(atkLbl);

    this.statAtk = new PixelLabel('+0', { color: 0xffcc44 });
    this.statAtk.x = px0 + 8 + atkLbl.textWidth + 2; this.statAtk.y = statY;
    this.container.addChild(this.statAtk);

    const defLbl = new PixelLabel('DEF:', { color: 0x888877 });
    defLbl.x = px0 + 80; defLbl.y = statY;
    this.container.addChild(defLbl);

    this.statDef = new PixelLabel('+0', { color: 0x44aaff });
    this.statDef.x = px0 + 80 + defLbl.textWidth + 2; this.statDef.y = statY;
    this.container.addChild(this.statDef);

    const hpLbl = new PixelLabel('HP:', { color: 0x888877 });
    hpLbl.x = px0 + 152; hpLbl.y = statY;
    this.container.addChild(hpLbl);

    this.statHp = new PixelLabel('+0', { color: 0x44dd44 });
    this.statHp.x = px0 + 152 + hpLbl.textWidth + 2; this.statHp.y = statY;
    this.container.addChild(this.statHp);

    const goldLbl = new PixelLabel('GOLD:', { color: 0x888877 });
    goldLbl.x = px0 + 250; goldLbl.y = statY;
    this.container.addChild(goldLbl);

    this.goldLabel = new PixelLabel('0', { color: 0xffcc00 });
    this.goldLabel.x = px0 + 250 + goldLbl.textWidth + 2; this.goldLabel.y = statY;
    this.container.addChild(this.goldLabel);
  }

  private buildPaperDollFigure(dollX: number, dollY: number): void {
    const g = new Graphics();

    // Drop shadow
    g.ellipse(dollX, dollY + 62, 24, 8).fill({ color: 0x000000, alpha: 0.35 });

    // ── Cape (behind) ──
    g.rect(dollX - 14, dollY - 36, 6, 30).fill({ color: 0x6a1818 });
    g.rect(dollX +  8, dollY - 36, 6, 30).fill({ color: 0x6a1818 });

    // ── Legs ──
    g.rect(dollX - 12, dollY + 14, 10, 28).fill({ color: 0x3a3830 });
    g.rect(dollX +   2, dollY + 14, 10, 28).fill({ color: 0x3a3830 });
    // leg highlight
    g.rect(dollX - 11, dollY + 15, 2, 10).fill({ color: 0x4a4840 });
    g.rect(dollX +   3, dollY + 15, 2, 10).fill({ color: 0x4a4840 });

    // ── Boots ──
    g.rect(dollX - 14, dollY + 40, 12, 10).fill({ color: 0x2a2010 });
    g.rect(dollX +   2, dollY + 40, 12, 10).fill({ color: 0x2a2010 });
    g.rect(dollX - 14, dollY + 42, 12, 2).fill({ color: 0x3a3020 });

    // ── Chain arms ──
    g.rect(dollX - 22, dollY - 40, 8, 22).fill({ color: 0x3a6070 });
    g.rect(dollX + 14, dollY - 40, 8, 22).fill({ color: 0x3a6070 });
    // arm highlight
    g.rect(dollX - 21, dollY - 39, 2, 10).fill({ color: 0x5a8090 });
    g.rect(dollX + 15, dollY - 39, 2, 10).fill({ color: 0x5a8090 });

    // ── Belt ──
    g.rect(dollX - 14, dollY + 12, 28, 5).fill({ color: 0x8a5a1a });
    g.rect(dollX +  9, dollY + 12, 6, 5).fill({ color: 0x6a4010 });  // buckle bg
    g.rect(dollX + 10, dollY + 14, 4, 3).fill({ color: 0xd4a030 });  // buckle

    // ── Torso (plate) ──
    g.rect(dollX - 14, dollY - 40, 28, 54).fill({ color: 0x1c3855 });
    g.rect(dollX - 12, dollY - 38, 24, 50).fill({ color: 0x2a4a6a });
    // plate highlight
    g.rect(dollX -  9, dollY - 36, 6, 44).fill({ color: 0x3a6a9a });
    g.rect(dollX -  9, dollY - 36, 3, 44).fill({ color: 0x4a7aaa });
    // center line
    g.rect(dollX -  1, dollY - 38, 2, 52).fill({ color: 0x1a3050 });

    // ── Sword ──
    g.rect(dollX + 22, dollY - 58, 3, 40).fill({ color: 0xd0d8e8 });
    g.rect(dollX + 18, dollY - 36, 11, 3).fill({ color: 0xd4a030 });  // crossguard
    g.rect(dollX + 23, dollY - 60, 2, 4).fill({ color: 0xd4a030 });   // pommel
    g.rect(dollX + 23, dollY - 58, 1, 2).fill({ color: 0xfff0a0 });   // highlight

    // ── Helmet ──
    g.rect(dollX - 14, dollY - 80, 28, 28).fill({ color: 0x1c3855 });
    g.rect(dollX - 12, dollY - 78, 24, 26).fill({ color: 0x2a4a6a });
    g.rect(dollX - 10, dollY - 76, 20, 22).fill({ color: 0x3a6a9a });
    // helmet highlight
    g.rect(dollX -  8, dollY - 74, 4, 14).fill({ color: 0x5a8aba });
    // visor
    g.rect(dollX - 10, dollY - 62, 20, 8).fill({ color: 0x0a1828 });
    g.rect(dollX -  9, dollY - 60, 18, 4).fill({ color: 0x1a3050 });
    // face visible below visor
    g.rect(dollX -  8, dollY - 54, 16, 3).fill({ color: 0xd4a07a });
    // nasal guard
    g.rect(dollX -  1, dollY - 68, 2, 6).fill({ color: 0x2a4a6a });

    this.container.addChild(g);
  }

  private buildEquipSlots(dollX: number, dollY: number): void {
    // Connector lines
    const lines = new Graphics();
    lines.setStrokeStyle({ width: 1, color: 0x3a2810, alpha: 0.6 });

    for (const { id, label, dx, dy } of EQUIP_SLOTS) {
      const cx = dollX + dx;
      const cy = dollY + dy;

      // Draw connector line from slot center toward figure
      const tx = dollX + dx * 0.4;
      const ty = dollY + dy * 0.35;
      lines.moveTo(cx, cy);
      lines.lineTo(tx, ty);
      lines.stroke();

      const view = new SlotView(cx - SS / 2, cy - SS / 2, SS, SS, label);
      view.onDragStart = (item) => this.startDrag(item, `equip:${id}`, view);
      view.onDropped   = (item) => this.dropInto(`equip:${id}`, item);

      this.container.addChild(view.container);
      this.equipContainers.set(id, view);
    }

    this.container.addChild(lines);
  }

  private buildBackpack(bx: number, by: number): void {
    for (let i = 0; i < BAG_COLS * BAG_ROWS; i++) {
      const col = i % BAG_COLS;
      const row = Math.floor(i / BAG_COLS);
      const sx = bx + col * (SS + 4);
      const sy = by + row * (SS + 4);

      const view = new SlotView(sx, sy, SS, SS, '');
      view.onDragStart = (item) => this.startDrag(item, `bag:${i}`, view);
      view.onDropped   = (item) => this.dropInto(`bag:${i}`, item);

      this.container.addChild(view.container);
      this.bagContainers.push(view);
    }
  }

  // ─── Drag & Drop ───────────────────────────────────────────────────────────

  private startDrag(item: InventoryItem, from: string, source: SlotView): void {
    this.dragging = { item, from };
    source.setItem(null);

    // Create ghost
    const g = new Graphics();
    drawItemIcon(g, 0, 0, SS, SS, item);
    g.alpha = 0.8;
    g.x = this.pointerX - SS / 2;
    g.y = this.pointerY - SS / 2;
    this.container.addChild(g);
    this.dragGhost = g;
  }

  private dropInto(target: string, _item?: InventoryItem): void {
    if (!this.dragging) return;
    const { item, from } = this.dragging;

    const player = this.getPlayer();
    if (!player) { this.cancelDrag(); return; }

    this.clearDragGhost();
    this.dragging = null;

    const targetView = this.resolveView(target);
    const existing = targetView?.getItem() ?? null;

    // Place dragged item in target
    if (targetView) targetView.setItem(item);

    // If target had something, place it where we came from
    if (existing) {
      const fromView = this.resolveView(from);
      if (fromView) fromView.setItem(existing);
    }

    // Sync back to entity
    this.syncToEntity(player);
  }

  private cancelDrag(): void {
    if (!this.dragging) return;
    const { item, from } = this.dragging;
    this.dragging = null;
    this.clearDragGhost();
    const view = this.resolveView(from);
    if (view) view.setItem(item);
  }

  private clearDragGhost(): void {
    if (this.dragGhost) {
      this.dragGhost.destroy();
      this.dragGhost = null;
    }
  }

  private resolveView(key: string): SlotView | null {
    if (key.startsWith('equip:')) {
      const id = key.slice(6) as EquipSlot;
      return this.equipContainers.get(id) ?? null;
    }
    if (key.startsWith('bag:')) {
      const idx = parseInt(key.slice(4), 10);
      return this.bagContainers[idx] ?? null;
    }
    return null;
  }

  // ─── Sync to/from entity ───────────────────────────────────────────────────

  private getPlayer(): Entity | null {
    for (const p of world.with('inventory', 'equipped', 'playerStats')) return p;
    return null;
  }

  private syncFromEntity(player: Entity): void {
    const inv = player.inventory ?? [];
    const eq  = player.equipped  ?? {};

    // Equip slots
    for (const [id, view] of this.equipContainers) {
      view.setItem(eq[id] ?? null);
    }

    // Bag slots
    for (let i = 0; i < this.bagContainers.length; i++) {
      this.bagContainers[i].setItem(inv[i] ?? null);
    }
  }

  private syncToEntity(player: Entity): void {
    const newEquipped: Partial<Record<EquipSlot, InventoryItem>> = {};
    for (const [id, view] of this.equipContainers) {
      const item = view.getItem();
      if (item) newEquipped[id] = item;
    }
    player.equipped = newEquipped;

    const newInv: InventoryItem[] = [];
    for (const view of this.bagContainers) {
      const item = view.getItem();
      if (item) newInv.push(item);
    }
    player.inventory = newInv;

    // Recalculate stats bonuses
    const stats = player.playerStats!;
    let atk = 0, def = 0;
    for (const item of Object.values(newEquipped)) {
      atk += item?.stats?.attack  ?? 0;
      def += item?.stats?.defense ?? 0;
    }
    stats.swordTier = 1 + atk;
    stats.armorTier = def;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  setVisible(visible: boolean): void {
    this.container.visible = visible;
    if (visible) {
      const player = this.getPlayer();
      if (player) this.syncFromEntity(player);
    }
  }

  update(): void {
    if (!this.container.visible) return;

    const player = this.getPlayer();
    if (!player) return;

    // Update stats bar
    const eq = player.equipped ?? {};
    let atk = 0, def = 0, hp = 0;
    for (const item of Object.values(eq)) {
      atk += item?.stats?.attack  ?? 0;
      def += item?.stats?.defense ?? 0;
      hp  += item?.stats?.hp      ?? 0;
    }
    this.statAtk.text = `+${atk}`;
    this.statDef.text = `+${def}`;
    this.statHp.text  = `+${hp}`;
    this.goldLabel.text = String(player.playerStats?.gold ?? 0);
  }

  destroy(): void {
    this.clearDragGhost();
    this.container.destroy({ children: true });
  }
}

// ─── SlotView ─────────────────────────────────────────────────────────────────

class SlotView {
  readonly container = new Container();
  onDragStart?: (item: InventoryItem) => void;
  onDropped?:   (item?: InventoryItem) => void;

  private item: InventoryItem | null = null;
  private bg!: Graphics;
  private icon!: Graphics;
  private nameLabel!: PixelLabel;
  private w: number;
  private h: number;

  constructor(x: number, y: number, w: number, h: number, private label: string) {
    this.w = w; this.h = h;
    this.container.x = x;
    this.container.y = y;
    this.build();
  }

  private build(): void {
    const { w, h } = this;

    // Slot background
    this.bg = new Graphics();
    this.bg.rect(0, 0, w, h).fill({ color: SLOT_BG });
    this.bg.rect(0, 0, w, 1).fill({ color: SLOT_BORDER });
    this.bg.rect(0, 0, 1, h).fill({ color: SLOT_BORDER });
    this.bg.rect(0, h-1, w, 1).fill({ color: 0x241808 });
    this.bg.rect(w-1, 0, 1, h).fill({ color: 0x241808 });
    this.container.addChild(this.bg);

    // Empty slot indicator (subtle cross)
    const empty = new Graphics();
    empty.setStrokeStyle({ width: 1, color: SLOT_EMPTY, alpha: 0.5 });
    empty.moveTo(4, h/2).lineTo(w-4, h/2).stroke();
    empty.moveTo(w/2, 4).lineTo(w/2, h-4).stroke();
    this.container.addChild(empty);

    // Icon area
    this.icon = new Graphics();
    this.container.addChild(this.icon);

    // Slot label (for equip slots)
    if (this.label) {
      const lbl = new PixelLabel(this.label, { color: 0x554433 });
      lbl.x = Math.floor(w / 2 - lbl.textWidth / 2);
      lbl.y = -10;
      this.container.addChild(lbl);
    }

    // Item name label at bottom of slot
    this.nameLabel = new PixelLabel('', { color: 0xccbbaa });
    this.nameLabel.x = 2;
    this.nameLabel.y = h - 10;
    this.container.addChild(this.nameLabel);

    // Interactivity
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    this.container.hitArea = {
      contains: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h,
    } as any;
    this.container.on('pointerdown', () => {
      if (this.item && this.onDragStart) this.onDragStart(this.item);
    });
    this.container.on('pointerup', () => {
      if (this.onDropped) this.onDropped(this.item ?? undefined);
    });
    this.container.on('pointerover', () => {
      this.bg.tint = this.item ? 0xdddddd : 0xbbbbbb;
    });
    this.container.on('pointerout', () => {
      this.bg.tint = 0xffffff;
    });
  }

  setItem(item: InventoryItem | null): void {
    this.item = item;
    this.icon.clear();
    if (item) {
      drawItemIcon(this.icon, 4, 4, this.w - 8, this.h - 8, item);
      const short = item.name.length > 7 ? item.name.substring(0, 6) + '.' : item.name;
      this.nameLabel.text = short;
    } else {
      this.nameLabel.text = '';
    }
  }

  getItem(): InventoryItem | null {
    return this.item;
  }
}

// ─── Item icon rendering ──────────────────────────────────────────────────────

function drawItemIcon(g: Graphics, x: number, y: number, w: number, h: number, item: InventoryItem): void {
  const [light, dark] = ICON_COLORS[item.type] ?? [0x808080, 0x404040];

  switch (item.type) {
    case 'weapon': {
      // Sword icon
      g.rect(x + w/2 - 2, y + 2, 4, h - 8).fill({ color: 0xd0d8e8 });
      g.rect(x + w/2 - 7, y + h/2 - 2, 14, 4).fill({ color: 0xd4a030 }); // crossguard
      g.rect(x + w/2 - 2, y, 4, 5).fill({ color: 0xd4a030 });              // pommel
      g.rect(x + w/2 - 1, y + 3, 1, h - 9).fill({ color: 0xffffff, alpha: 0.4 });
      break;
    }
    case 'helmet': {
      // Helmet icon
      g.rect(x + 4, y + 4, w - 8, h - 10).fill({ color: light });
      g.rect(x + 5, y + 5, w - 10, h - 12).fill({ color: dark });
      g.rect(x + 5, y + 5, 4, h - 14).fill({ color: light });              // highlight stripe
      g.rect(x + 4, y + h/2, w - 8, 4).fill({ color: 0x0a1828 });          // visor
      g.rect(x + 2, y + h - 8, w - 4, 4).fill({ color: dark });            // cheek guards
      break;
    }
    case 'chest': {
      // Chest armor icon
      g.rect(x + 4, y + 4, w - 8, h - 8).fill({ color: dark });
      g.rect(x + 5, y + 5, w - 10, h - 10).fill({ color: light });
      g.rect(x + 6, y + 5, 4, h - 10).fill({ color: 0x5a8aba });            // highlight
      g.rect(x + w/2 - 1, y + 5, 2, h - 10).fill({ color: dark });          // center line
      g.rect(x + 4, y + 4, w - 8, 3).fill({ color: 0x5a8aba });              // collar
      break;
    }
    case 'gloves': {
      // Gauntlet icon
      g.rect(x + 4, y + 6, w - 8, h - 10).fill({ color: light });
      g.rect(x + 6, y + 4, 4, h - 6).fill({ color: dark });   // finger 1
      g.rect(x + 12, y + 4, 4, h - 6).fill({ color: dark });  // finger 2
      g.rect(x + 5, y + 6, w - 10, 4).fill({ color: 0x5a8aba }); // knuckles
      break;
    }
    case 'boots': {
      // Boot icon
      g.rect(x + 6, y + 2, w - 10, h - 6).fill({ color: light });
      g.rect(x + 4, y + h - 6, w - 4, 4).fill({ color: dark });  // sole
      g.rect(x + 7, y + 3, 4, h - 10).fill({ color: light === dark ? light : (light + dark) >> 1 }); // highlight
      g.rect(x + 6, y + 2, 2, h - 6).fill({ color: dark });  // seam
      break;
    }
    case 'ring': {
      // Ring icon
      g.circle(x + w/2, y + h/2, Math.min(w, h) / 2 - 4).stroke({ width: 3, color: light });
      g.circle(x + w/2, y + h/2 - 2, 3).fill({ color: 0xff4466 }); // gem
      break;
    }
    case 'health_potion': {
      // Red flask
      g.rect(x + w/2 - 4, y + 4, 8, 3).fill({ color: 0x888888 });   // stopper
      g.rect(x + w/2 - 6, y + 7, 12, h - 12).fill({ color: light });
      g.rect(x + w/2 - 5, y + 8, 4, h - 14).fill({ color: 0xff8888, alpha: 0.6 }); // highlight
      break;
    }
    case 'mana_potion': {
      // Blue flask
      g.rect(x + w/2 - 4, y + 4, 8, 3).fill({ color: 0x888888 });
      g.rect(x + w/2 - 6, y + 7, 12, h - 12).fill({ color: light });
      g.rect(x + w/2 - 5, y + 8, 4, h - 14).fill({ color: 0x8888ff, alpha: 0.6 });
      break;
    }
    default: {
      // Generic item
      g.rect(x + 4, y + 4, w - 8, h - 8).fill({ color: light });
      g.rect(x + 6, y + 6, 4, 4).fill({ color: dark });
    }
  }
}
