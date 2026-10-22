import { Container, Graphics, Rectangle } from 'pixi.js';
import { localPlayer, STAT_NAMES } from '../world';
import type { InventoryItem, Player, StatName } from '../world';
import { THEME } from './Theme';
import { PixelLabel } from './PixelText';
import { GAME_WIDTH, VIEW_HEIGHT } from '../render/Camera';
import { requestBuy } from '../game/PlayerActions';

const PW = 320;
const ROW_H = 26;
const PAD = 12;
const BORDER = THEME.panelBorder;
const BG = THEME.panel;
const ROW_BG = THEME.row;
const ROW_HOVER = THEME.rowHover;

/** Three-letter names for the stats a shop row lists. */
const STAT_SHORT = {
  strength: 'STR', intelligence: 'INT', stamina: 'STA', defence: 'DEF', luck: 'LCK', mana: 'MNA',
} as const satisfies Record<StatName, string>;

function statText(item: InventoryItem): string {
  const s = item.stats;
  if (!s) return '';
  return STAT_NAMES.flatMap((stat) => (s[stat] ? [`+${s[stat]} ${STAT_SHORT[stat]}`] : [])).join('  ');
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
      row.hitArea = new Rectangle(PAD, 0, PW - PAD * 2, ROW_H - 4);
      row.on('pointerover', () => draw(ROW_HOVER));
      row.on('pointerout', () => draw(ROW_BG));
      row.on('pointertap', () => {
        const player = this.player();
        if (player) requestBuy(player, this.items, i);
      });

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
    return localPlayer() ?? null;
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
