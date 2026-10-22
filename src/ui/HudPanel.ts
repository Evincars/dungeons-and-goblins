import { Container, Sprite, Graphics } from 'pixi.js';
import { localPlayer } from '../world';
import { frameTexture } from '../render/Sheets';
import { GAME_WIDTH, VIEW_HEIGHT } from '../render/Camera';
import { THEME } from './Theme';
import { PixelLabel } from './PixelText';

export function xpForLevel(level: number): number {
  return level * 100;
}

/** All the experience a player has earned, counting what went into the levels they have already gained. */
export function totalXp(stats: { level: number; exp: number }): number {
  let total = stats.exp;
  for (let l = 1; l < stats.level; l++) total += xpForLevel(l);
  return total;
}

/** Panel bars hold this many fill steps below full: row 0 is full, the last row empty. */
const BAR_ROWS = 100;

/** The panel-bar row showing a fill fraction. */
function barRow(fraction: number): number {
  return BAR_ROWS - Math.round(BAR_ROWS * Math.max(0, Math.min(1, fraction)));
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
    bg.rect(0, 0, GAME_WIDTH, 80).fill({ color: THEME.panel });
    bg.rect(0, 0, GAME_WIDTH, 2).fill({ color: THEME.panelBorder });
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
    const player = localPlayer();
    if (!player) return;
    const h = player.health;
    const s = player.playerStats;
    this.hpLabel.text    = `HP: ${Math.max(0, Math.floor(h.current))}/${h.max}`;
    this.goldLabel.text  = `Gold: ${s.gold}`;
    this.levelLabel.text = `Lv.${s.level} (${s.exp}/${xpForLevel(s.level)} xp)`;
    this.swordLabel.text = `Sword+${s.swordTier} Armor+${s.armorTier}`;
    this.killsLabel.text = `Kills: ${s.kills}`;
    this.hpBar.texture = frameTexture('panel_healthbar', 0, barRow(h.current / h.max));
    this.xpBar.texture = frameTexture('panel_xpbar', 0, barRow(s.exp / xpForLevel(s.level)));
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
