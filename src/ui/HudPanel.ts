import { Container, Sprite, Graphics } from 'pixi.js';
import { world } from '../world';
import { frameTexture } from '../render/Sheets';
import { GAME_WIDTH, VIEW_HEIGHT } from '../render/Camera';
import { PixelLabel } from './PixelText';

export function xpForLevel(level: number): number {
  return level * 100;
}

export class HudPanel {
  readonly container = new Container();
  private bg!: Sprite;
  private hpLabel!: PixelLabel;
  private goldLabel!: PixelLabel;
  private levelLabel!: PixelLabel;
  private swordLabel!: PixelLabel;
  private killsLabel!: PixelLabel;
  private hpBar!: Graphics;
  private xpBar!: Graphics;

  constructor() {
    this.build();
  }

  private build(): void {
    // Dark HUD panel background
    const bg = new Graphics();
    bg.rect(0, 0, GAME_WIDTH, 80).fill({ color: 0x0a0608, alpha: 0.92 });
    bg.rect(0, 0, GAME_WIDTH, 2).fill({ color: 0x4a3520 });
    this.container.addChild(bg);

    this.hpBar = new Graphics();
    this.container.addChild(this.hpBar);
    this.xpBar = new Graphics();
    this.container.addChild(this.xpBar);

    this.hpLabel    = new PixelLabel('HP: 100/100', { color: 0xff6666, shadow: true });
    this.goldLabel  = new PixelLabel('Gold: 0',     { color: 0xffcc00, shadow: true });
    this.levelLabel = new PixelLabel('Lv.1',        { color: 0x88ccff, shadow: true });
    this.swordLabel = new PixelLabel('Sword+1',     { color: 0xdddddd, shadow: true });
    this.killsLabel = new PixelLabel('Kills: 0',    { color: 0xff8844, shadow: true });

    this.hpLabel.x    = 8;   this.hpLabel.y    = 6;
    this.goldLabel.x  = 8;   this.goldLabel.y  = 20;
    this.levelLabel.x = 8;   this.levelLabel.y = 34;
    this.swordLabel.x = 140; this.swordLabel.y = 6;
    this.killsLabel.x = 140; this.killsLabel.y = 20;

    this.container.addChild(this.hpLabel, this.goldLabel, this.levelLabel, this.swordLabel, this.killsLabel);
    this.container.y = VIEW_HEIGHT;
  }

  update(): void {
    for (const player of world.with('health', 'playerStats')) {
      const h = player.health!;
      const s = player.playerStats!;
      this.hpLabel.text    = `HP: ${Math.max(0, Math.floor(h.current))}/${h.max}`;
      this.goldLabel.text  = `Gold: ${s.gold}`;
      this.levelLabel.text = `Lv.${s.level} (${s.exp}/${xpForLevel(s.level)} xp)`;
      this.swordLabel.text = `Sword+${s.swordTier} Armor+${s.armorTier}`;
      this.killsLabel.text = `Kills: ${s.kills}`;

      // HP bar: 120px wide, 6px tall
      const fraction = Math.max(0, h.current / h.max);
      const barColor = fraction > 0.6 ? 0x44cc44 : fraction > 0.3 ? 0xddaa00 : 0xcc2222;
      this.hpBar.clear()
        .rect(8, 50, 120, 7).fill({ color: 0x111111 })
        .rect(8, 50, Math.round(120 * fraction), 7).fill({ color: barColor });

      // XP bar
      const xpFraction = s.exp / xpForLevel(s.level);
      this.xpBar.clear()
        .rect(8, 62, 120, 4).fill({ color: 0x111111 })
        .rect(8, 62, Math.round(120 * xpFraction), 4).fill({ color: 0x4488ff });
      break;
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
