import { Application } from 'pixi.js';
import { loadAllAssets as loadAssets } from '../assets/AssetLoader';
import { GAME_WIDTH, GAME_HEIGHT, SCALE } from '../render/Camera';
import { TitleScene } from '../scenes/TitleScene';
import { InGameScene } from '../scenes/InGameScene';
import { sound } from '../audio/SoundPlayer';

type SceneId = 'title' | 'ingame';

/** The simulation is tick-based (speeds, timers, animations), so it always runs at this rate. */
const TICK_MS = 1000 / 60;
/** Longest stall to catch up on, so a hidden tab doesn't fast-forward the game on return. */
const MAX_CATCH_UP_TICKS = 5;
/** Frame times jitter around 16.67ms; this keeps a 60Hz display from skipping or doubling ticks. */
const TICK_SLACK_MS = 1;

export class Game {
  private app!: Application;
  private currentScene?: TitleScene | InGameScene;
  private currentId?: SceneId;
  private tickDebt = 0;

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

    sound.autoStart();
    await Promise.all([loadAssets(), sound.load()]);
    await this.goto('title');

    this.app.ticker.add(() => this.tick());
  }

  /** Runs fixed 60Hz steps, so 144Hz displays don't play faster than 60Hz ones. */
  private tick(): void {
    if (!this.currentScene) return;
    this.tickDebt = Math.min(this.tickDebt + this.app.ticker.deltaMS, TICK_MS * MAX_CATCH_UP_TICKS);
    while (this.tickDebt >= TICK_MS - TICK_SLACK_MS && this.currentScene) {
      this.tickDebt -= TICK_MS;
      this.currentScene.update();
    }
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
