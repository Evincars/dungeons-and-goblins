import { Application } from 'pixi.js';
import { loadAllAssets as loadAssets } from '../assets/AssetLoader';
import { GAME_WIDTH, GAME_HEIGHT, SCALE } from '../render/Camera';
import { TitleScene } from '../scenes/TitleScene';
import { InGameScene } from '../scenes/InGameScene';

type SceneId = 'title' | 'ingame';

export class Game {
  private app!: Application;
  private currentScene?: TitleScene | InGameScene;
  private currentId?: SceneId;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.app = new Application();
    await this.app.init({
      canvas,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      backgroundColor: 0x0a0608,
      antialias: false,
    });

    canvas.style.width  = `${GAME_WIDTH * SCALE}px`;
    canvas.style.height = `${GAME_HEIGHT * SCALE}px`;

    await loadAssets();
    await this.goto('title');

    this.app.ticker.add(() => this.tick());
  }

  private tick(): void {
    if (!this.currentScene) return;
    this.currentScene.update();
  }

  private async goto(id: SceneId): Promise<void> {
    if (this.currentScene) {
      this.app.stage.removeChild(this.currentScene.container);
      this.currentScene.destroy();
    }
    this.currentId = id;

    if (id === 'title') {
      const scene = new TitleScene();
      scene.onStart = () => this.goto('ingame');
      this.app.stage.addChild(scene.container);
      this.currentScene = scene;
    } else if (id === 'ingame') {
      const scene = new InGameScene();
      scene.onComplete = () => this.goto('ingame');
      scene.onQuit = () => this.goto('title');
      await scene.init(this.app);
      this.app.stage.addChild(scene.container);
      this.currentScene = scene;
    }
  }
}
