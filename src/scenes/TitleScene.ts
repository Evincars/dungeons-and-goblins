import { Container, Graphics } from 'pixi.js';
import { PixelLabel } from '../ui/PixelText';
import { GAME_WIDTH, GAME_HEIGHT } from '../render/Camera';

export class TitleScene {
  readonly container = new Container();
  private tick = 0;
  private pressLabel!: PixelLabel;
  onStart?: () => void;

  constructor() {
    this.build();
    this.bindKeys();
  }

  private build(): void {
    const bg = new Graphics();
    bg.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x080506 });
    this.container.addChild(bg);

    // Title stone-carved style
    const title = new PixelLabel('DUNGEONS & GOBLINS', { color: 0xddaa44, scale: 2, align: 'center', shadow: true });
    title.x = Math.floor(GAME_WIDTH / 2);
    title.y = 80;
    this.container.addChild(title);

    const sub = new PixelLabel('A Dungeon Crawler', { color: 0x888877, align: 'center', shadow: true });
    sub.x = Math.floor(GAME_WIDTH / 2);
    sub.y = 120;
    this.container.addChild(sub);

    // Controls hint
    const controls = new PixelLabel(
      'WASD - Move      Mouse - Aim\n' +
      'Left click - Sword   Right click/Q - Spell\n' +
      'E/Click - Use   TAB - Inventory   SHIFT - Sprint',
      { color: 0x887766, align: 'center' }
    );
    controls.x = Math.floor(GAME_WIDTH / 2);
    controls.y = 180;
    this.container.addChild(controls);

    this.pressLabel = new PixelLabel('Press ENTER to start', { color: 0xffcc44, align: 'center', shadow: true });
    this.pressLabel.x = Math.floor(GAME_WIDTH / 2);
    this.pressLabel.y = 280;
    this.container.addChild(this.pressLabel);
  }

  private bindKeys(): void {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        window.removeEventListener('keydown', onKey);
        this.onStart?.();
      }
    };
    window.addEventListener('keydown', onKey);
  }

  update(): void {
    this.tick++;
    this.pressLabel.alpha = 0.5 + 0.5 * Math.sin(this.tick * 0.06);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
