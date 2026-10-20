import { Container, Graphics } from 'pixi.js';
import { firstPlayer } from '../world';
import type { InventoryItem, Player } from '../world';
import { PixelLabel } from './PixelText';
import { GAME_WIDTH, VIEW_HEIGHT } from '../render/Camera';
import { sound } from '../audio/SoundPlayer';

const PW = 320;
const ROW_H = 26;
const PAD = 12;
const BORDER = 0x8a6030;
const BG = 0x0c0a08;
const ROW_BG = 0x1c1610;
const ROW_HOVER = 0x2c2418;

const MAX_INVENTORY = 8;

function statText(item: InventoryItem): string {
  const s = item.stats;
  if (!s) return '';
  const parts: string[] = [];
  if (s.attack) parts.push(`+${s.attack} ATK`);
  if (s.defense) parts.push(`+${s.defense} DEF`);
  if (s.hp) parts.push(`+${s.hp} HP`);
  return parts.join('  ');
}

export class ShopPanel {
  readonly container = new Container();
  private rows = new Container();
  private goldLabel!: PixelLabel;
  private items: InventoryItem[] = [];

  constructor() {
    this.build();
    this.container.visible = false;
  }

  private build(): void {
    const title = new PixelLabel('SHOP', { color: 0xffcc44, scale: 1, shadow: true });
    title.x = PAD;
    title.y = PAD;
    this.container.addChild(title);

    const hint = new PixelLabel('E to close', { color: 0x887766, shadow: true });
    hint.x = PW - PAD - 64;
    hint.y = PAD + 1;
    this.container.addChild(hint);

    this.goldLabel = new PixelLabel('Gold: 0', { color: 0xffcc00, shadow: true });
    this.goldLabel.x = PAD;
    this.goldLabel.y = PAD + 14;
    this.container.addChild(this.goldLabel);

    this.container.addChild(this.rows);
    this.rows.y = PAD + 32;
  }

  setItems(items: InventoryItem[]): void {
    this.items = items;
    this.rows.removeChildren().forEach(c => c.destroy({ children: true }));

    items.forEach((item, i) => {
      const row = new Container();
      row.y = i * ROW_H;
      row.eventMode = 'static';
      row.cursor = 'pointer';

      const bg = new Graphics();
      const draw = (color: number) => bg.clear()
        .rect(PAD, 0, PW - PAD * 2, ROW_H - 4).fill({ color })
        .rect(PAD, 0, PW - PAD * 2, ROW_H - 4).stroke({ color: BORDER, width: 1 });
      draw(ROW_BG);
      row.addChild(bg);
      row.hitArea = { contains: (x: number, y: number) => x >= PAD && x <= PW - PAD && y >= 0 && y <= ROW_H - 4 };
      row.on('pointerover', () => draw(ROW_HOVER));
      row.on('pointerout', () => draw(ROW_BG));
      row.on('pointertap', () => this.buy(item));

      const name = new PixelLabel(item.name, { color: 0xe8e0d0, shadow: true });
      name.x = PAD + 6;
      name.y = 5;
      row.addChild(name);

      const stats = statText(item);
      if (stats) {
        const st = new PixelLabel(stats, { color: 0x88cc88, shadow: true });
        st.x = PAD + 6;
        st.y = 14;
        row.addChild(st);
      }

      const price = new PixelLabel(`${item.value}g`, { color: 0xffcc00, align: 'right', shadow: true });
      price.x = PW - PAD - 6;
      price.y = 9;
      row.addChild(price);

      this.rows.addChild(row);
    });

    const h = PAD + 32 + items.length * ROW_H + PAD;
    this.redrawFrame(h);
    this.container.x = Math.floor((GAME_WIDTH - PW) / 2);
    this.container.y = Math.floor((VIEW_HEIGHT - h) / 2);
  }

  private frame = new Graphics();
  private redrawFrame(h: number): void {
    if (!this.frame.parent) this.container.addChildAt(this.frame, 0);
    this.frame.clear()
      .rect(0, 0, PW, h).fill({ color: BG, alpha: 0.96 })
      .rect(0, 0, PW, h).stroke({ color: BORDER, width: 2 });
  }

  private player(): Player | null {
    return firstPlayer() ?? null;
  }

  private buy(item: InventoryItem): void {
    const player = this.player();
    if (!player) return;
    const stats = player.playerStats;
    const inv = player.inventory ?? (player.inventory = []);
    if (stats.gold < item.value) { sound.playSound('fail'); return; }
    if (inv.length >= MAX_INVENTORY) { sound.playSound('fail'); return; }
    stats.gold -= item.value;
    inv.push({ ...item });
    sound.playSound('buy');
  }

  setVisible(visible: boolean): void {
    this.container.visible = visible;
  }

  update(): void {
    if (!this.container.visible) return;
    const player = this.player();
    if (player) this.goldLabel.text = `Gold: ${player.playerStats.gold}`;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
