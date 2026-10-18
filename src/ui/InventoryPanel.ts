import { Container, Graphics } from 'pixi.js';
import { world } from '../world';
import { PixelLabel } from './PixelText';
import { GAME_WIDTH, VIEW_HEIGHT } from '../render/Camera';

const SLOT_SIZE = 36;
const SLOT_COLS = 4;
const SLOT_ROWS = 2;
const PANEL_W = SLOT_COLS * SLOT_SIZE + 24;
const PANEL_H = SLOT_ROWS * SLOT_SIZE + 64;

export class InventoryPanel {
  readonly container = new Container();
  private title!: PixelLabel;
  private hint!: PixelLabel;
  private slots: PixelLabel[] = [];
  private bg!: Graphics;

  constructor() {
    this.build();
    this.container.visible = false;
  }

  private build(): void {
    const ox = Math.floor((GAME_WIDTH - PANEL_W) / 2);
    const oy = Math.floor((VIEW_HEIGHT - PANEL_H) / 2);

    this.bg = new Graphics();
    this.bg.rect(ox, oy, PANEL_W, PANEL_H).fill({ color: 0x0d0a08, alpha: 0.95 });
    this.bg.rect(ox, oy, PANEL_W, 2).fill({ color: 0x6a4520 });
    this.bg.rect(ox, oy + PANEL_H - 2, PANEL_W, 2).fill({ color: 0x6a4520 });
    this.bg.rect(ox, oy, 2, PANEL_H).fill({ color: 0x6a4520 });
    this.bg.rect(ox + PANEL_W - 2, oy, 2, PANEL_H).fill({ color: 0x6a4520 });
    this.container.addChild(this.bg);

    this.title = new PixelLabel('INVENTORY', { color: 0xffcc44, shadow: true });
    this.title.x = ox + Math.floor(PANEL_W / 2) - Math.floor(this.title.textWidth / 2);
    this.title.y = oy + 8;
    this.container.addChild(this.title);

    this.hint = new PixelLabel('[Tab] Close  [E] Use', { color: 0x888888, shadow: true });
    this.hint.x = ox + 8;
    this.hint.y = oy + PANEL_H - 12;
    this.container.addChild(this.hint);

    // Slot labels (name + value)
    for (let i = 0; i < SLOT_COLS * SLOT_ROWS; i++) {
      const col = i % SLOT_COLS;
      const row = Math.floor(i / SLOT_COLS);
      const sx = ox + 12 + col * SLOT_SIZE;
      const sy = oy + 28 + row * SLOT_SIZE;

      const slotBg = new Graphics();
      slotBg.rect(sx, sy, SLOT_SIZE - 4, SLOT_SIZE - 4).fill({ color: 0x1a1410 });
      slotBg.rect(sx, sy, SLOT_SIZE - 4, 1).fill({ color: 0x4a3520 });
      this.container.addChild(slotBg);

      const lbl = new PixelLabel('', { color: 0xdddddd });
      lbl.x = sx + 2;
      lbl.y = sy + 2;
      this.container.addChild(lbl);
      this.slots.push(lbl);
    }
  }

  setVisible(visible: boolean): void {
    this.container.visible = visible;
  }

  update(): void {
    if (!this.container.visible) return;
    for (const player of world.with('inventory', 'playerStats')) {
      const inv = player.inventory!;
      for (let i = 0; i < this.slots.length; i++) {
        const item = inv[i];
        if (!item) { this.slots[i].text = ''; continue; }
        const short = item.name.substring(0, 5);
        this.slots[i].text = short;
      }
      break;
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
