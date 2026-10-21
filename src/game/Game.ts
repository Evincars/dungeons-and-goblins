import { Application } from 'pixi.js';
import { loadAllAssets } from '../assets/AssetLoader';
import { GAME_WIDTH, GAME_HEIGHT, displayScale } from '../render/Camera';
import { SceneManager } from './SceneManager';
import { TitleScene } from '../scenes/TitleScene';
import { InGameScene } from '../scenes/InGameScene';
import { SettingsScene } from '../scenes/SettingsScene';
import { KeyBindingsScene } from '../scenes/KeyBindingsScene';
import { CoopScene } from '../scenes/CoopScene';
import { sound } from '../audio/SoundPlayer';
import { settings } from './Settings';
import { exposeForDebugging } from '../core/debugHooks';
import { coop } from '../network/CoopSession';

/** The simulation is tick-based (speeds, timers, animations), so it always runs at this rate. */
const TICK_MS = 1000 / 60;
/** Longest stall to catch up on, so a hidden tab doesn't fast-forward the game on return. */
const MAX_CATCH_UP_TICKS = 5;
/** Frame times jitter around 16.67ms; this keeps a 60Hz display from skipping or doubling ticks. */
const TICK_SLACK_MS = 1;
const BACKGROUND = 0x0a0608;

/** The invite link's peer id, when the page was opened from one. */
function joinParam(): string | undefined {
  return new URL(location.href).searchParams.get('join') ?? undefined;
}

export class Game {
  private readonly app = new Application();
  private manager!: SceneManager;
  private tickDebt = 0;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    await this.app.init({
      canvas,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      resolution: this.renderResolution(),
      backgroundColor: BACKGROUND,
      antialias: false,
    });
    this.fitToWindow(canvas);
    window.addEventListener('resize', () => this.fitToWindow(canvas));

    sound.setSfxVolume(settings.sfxVolume);
    sound.autoStart();
    await Promise.all([loadAllAssets(), sound.load()]);

    this.manager = new SceneManager(this.app, canvas)
      .register('title', (m) => new TitleScene(m))
      .register('settings', (m) => new SettingsScene(m))
      .register('key_bindings', (m) => new KeyBindingsScene(m))
      .register('coop_host', (m) => new CoopScene(m, 'host'))
      .register('coop_join', (m) => new CoopScene(m, 'guest', joinParam()))
      .register('in_game', (m) => new InGameScene(m));
    // An invite link opens straight into the room it invites to.
    this.manager.goto(joinParam() ? 'coop_join' : 'title');
    this.app.ticker.add(() => this.tick());
    exposeForDebugging({ __app: this.app, __scenes: this.manager, __coop: coop });
  }

  /** Draws at the screen's own pixel density, so scaled sprites stay sharp however large the window is. */
  private renderResolution(): number {
    return displayScale() * (window.devicePixelRatio || 1);
  }

  /** Scales the canvas to fill the window (the game's own size stays put), re-rendering at the new size. */
  private fitToWindow(canvas: HTMLCanvasElement): void {
    const scale = displayScale();
    this.app.renderer.resize(GAME_WIDTH, GAME_HEIGHT, this.renderResolution());
    canvas.style.width  = `${Math.floor(GAME_WIDTH * scale)}px`;
    canvas.style.height = `${Math.floor(GAME_HEIGHT * scale)}px`;
  }

  /** Runs fixed 60Hz steps, so 144Hz displays don't play faster than 60Hz ones. */
  private tick(): void {
    this.tickDebt = Math.min(this.tickDebt + this.app.ticker.deltaMS, TICK_MS * MAX_CATCH_UP_TICKS);
    while (this.tickDebt >= TICK_MS - TICK_SLACK_MS) {
      this.tickDebt -= TICK_MS;
      this.manager.update();
    }
  }
}
