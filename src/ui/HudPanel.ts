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
  private hpBar!: Sprite;
  private xpBar!: Sprite;

  constructor() {
    this.build();
  }

  private build(): void {
    // Dark HUD panel background
    const bg = new Graphics();
    bg.rect(0, 0, GAME_WIDTH, 80).fill({ color: 0x0a0608 });
    bg.rect(0, 0, GAME_WIDTH, 2).fill({ color: 0x4a3520 });
    this.container.addChild(bg);

    // Panel bars hold 101 fill steps, row 0 = full, row 100 = empty.
    this.hpBar = new Sprite(frameTexture('panel_healthbar', 0, 0));
    this.hpBar.x = 8; this.hpBar.y = 50;
    this.hpBar.scale.set(1.2, 1);
    this.xpBar = new Sprite(frameTexture('panel_xpbar', 0, 100));
    this.xpBar.x = 8; this.xpBar.y = 62;
    this.xpBar.scale.set(1.2, 1);
    this.container.addChild(this.hpBar, this.xpBar);

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

      const hpPct = Math.round(100 * Math.max(0, Math.min(1, h.current / h.max)));
      this.hpBar.texture = frameTexture('panel_healthbar', 0, 100 - hpPct);
      const xpPct = Math.round(100 * Math.max(0, Math.min(1, s.exp / xpForLevel(s.level))));
      this.xpBar.texture = frameTexture('panel_xpbar', 0, 100 - xpPct);
      break;
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
