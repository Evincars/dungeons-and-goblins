import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Scene, SceneManager, SceneName } from '../game/SceneManager';
import { bindingFor, settings } from '../game/Settings';
import { text } from '../core/texts';
import { reportRejection } from '../core/errors';
import { assetUrl } from '../assets/assetUrl';
import { context2d, createCanvas } from '../render/canvas';
import { GAME_HEIGHT, GAME_WIDTH } from '../render/Camera';
import { PixelLabel } from '../ui/PixelText';
import { wrapLines } from '../ui/InfoTooltip';

/** The intro film, played under the story; its frames are copied at this many times the game's resolution. */
const VIDEO = '/intro-video.mp4';
const FILM_SCALE = 2;
/** The video has a frame to show from this ready state on (HAVE_CURRENT_DATA). */
const HAS_FRAME = 2;
/** The film is darkened this much so the story reads over it. */
const VEIL_ALPHA = 0.5;
/** Ticks (60 a second) of each fade: from black at the start, the text in and out, and to black at the end. */
const FADE_TICKS = 60;
/** Each half of the story stays up long enough to read: this many ticks a letter, and never less than this. */
const READ_TICKS_PER_CHAR = 3;
const MIN_HOLD_TICKS = 480;
/** The story wraps to this width (game pixels), and the hint to skip sits this far from the bottom. */
const TEXT_W = 440;
const HINT_BOTTOM = 18;
const TEXT_COLOR = 0xe8dcc0;
const HINT_COLOR = 0x8a929c;
/** Keys that skip it, besides the use key (E) and a click. */
const SKIP_KEYS: readonly string[] = ['Enter', 'Escape', 'Space'];

/** Where the intro leads once it has played (or been skipped). */
let destination: SceneName = 'in_game';

/** Plays the intro, then goes on to `next` (the dungeon, or the co-op lobby). */
export function playIntroThen(manager: SceneManager, next: SceneName): void {
  destination = next;
  manager.goto('intro');
}

/** One stretch of the timeline: a fade, a half of the story held on screen, or the closing fade. */
type Step = { ticks: number; black: (t: number) => number; text: (t: number) => number; part: 0 | 1 };

/** A value easing 0 → 1 over a step (`t` in 0..1). */
const rise = (t: number) => t * t * (3 - 2 * t);

/**
 * The story before the first level: the intro film under a dark veil, the tale in pixel text in two halves
 * (each fading in, held while it is read, fading out), opening from black and closing to black. E (the use
 * key), Enter, Escape, Space or a click skip it.
 */
export class IntroScene implements Scene {
  readonly container = new Container();
  private readonly video: HTMLVideoElement;
  /**
   * The film is drawn through a canvas, frame by frame, rather than uploaded straight from the video: some
   * browsers and GPUs draw a video texture black, a canvas never.
   */
  private readonly frame = createCanvas(Math.round(GAME_WIDTH * FILM_SCALE), Math.round(GAME_HEIGHT * FILM_SCALE));
  private readonly film = new Sprite(Texture.from(this.frame));
  private readonly black = new Graphics();
  private readonly story: PixelLabel[];
  private readonly steps: Step[];
  private step = 0;
  private tick = 0;
  private leaving = false;
  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (SKIP_KEYS.includes(e.code) || e.code === bindingFor('use')) this.skip();
  };
  private readonly onClick = () => this.skip();

  constructor(private readonly manager: SceneManager) {
    this.video = document.createElement('video');
    this.video.src = assetUrl(VIDEO);
    this.video.loop = true;
    this.video.playsInline = true;
    this.video.volume = Math.max(0, Math.min(1, settings.sfxVolume));
    this.film.width = GAME_WIDTH;
    this.film.height = GAME_HEIGHT;
    reportRejection(this.video.play(), 'The intro film could not start', 'intro');
    const veil = new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x000000, alpha: VEIL_ALPHA });
    this.story = [text('intro.part1'), text('intro.part2')].map((part) => this.storyLabel(part));
    const hint = new PixelLabel(text('intro.skip'), { color: HINT_COLOR, align: 'center', shadow: true });
    hint.position.set(Math.round(GAME_WIDTH / 2), GAME_HEIGHT - HINT_BOTTOM);
    this.black.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x000000 });
    this.container.addChild(new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x000000 }), this.film, veil, ...this.story, hint, this.black);
    this.steps = this.timeline();
    window.addEventListener('keydown', this.onKeyDown);
    manager.canvas.addEventListener('pointerdown', this.onClick);
  }

  /** A half of the story, wrapped and centred on the screen, hidden until its turn. */
  private storyLabel(content: string): PixelLabel {
    const label = new PixelLabel(wrapLines(content, Math.min(TEXT_W, GAME_WIDTH - 40)).join('\n'), { color: TEXT_COLOR, align: 'center', shadow: true });
    label.position.set(Math.round(GAME_WIDTH / 2), Math.round((GAME_HEIGHT - label.textHeight) / 2));
    label.alpha = 0;
    return label;
  }

  /** Copies the video's current frame onto the screen, filling it whatever its shape (cropping the overflow), centred. */
  private drawFilm(): void {
    const v = this.video;
    if (v.readyState < HAS_FRAME || !v.videoWidth || !v.videoHeight) return;
    const { width, height } = this.frame;
    const scale = Math.max(width / v.videoWidth, height / v.videoHeight);
    const sw = width / scale;
    const sh = height / scale;
    context2d(this.frame).drawImage(v, (v.videoWidth - sw) / 2, (v.videoHeight - sh) / 2, sw, sh, 0, 0, width, height);
    this.film.texture.source.update();
  }

  /** From black; the first half in, held, out; the second half in, held, out; to black. */
  private timeline(): Step[] {
    const hold = (i: 0 | 1) => Math.max(MIN_HOLD_TICKS, this.story[i].text.length * READ_TICKS_PER_CHAR);
    const steps: Step[] = [{ ticks: FADE_TICKS, black: (t) => 1 - rise(t), text: () => 0, part: 0 }];
    for (const part of [0, 1] as const) {
      steps.push({ ticks: FADE_TICKS, black: () => 0, text: (t) => rise(t), part });
      steps.push({ ticks: hold(part), black: () => 0, text: () => 1, part });
      steps.push({ ticks: FADE_TICKS, black: () => 0, text: (t) => 1 - rise(t), part });
    }
    steps.push({ ticks: FADE_TICKS, black: (t) => rise(t), text: () => 0, part: 1 });
    return steps;
  }

  /** Skipping fades straight to black. */
  private skip(): void {
    if (this.leaving) return;
    this.step = this.steps.length - 1;
    this.tick = Math.round(this.steps[this.step].ticks * (1 - this.black.alpha));
  }

  update(): void {
    this.drawFilm();
    const step = this.steps[this.step];
    if (!step) return;
    const t = Math.min(1, this.tick / step.ticks);
    this.black.alpha = step.black(t);
    this.story.forEach((label, i) => { label.alpha = i === step.part ? step.text(t) : 0; });
    if (++this.tick < step.ticks) return;
    this.tick = 0;
    this.step++;
    if (this.step < this.steps.length || this.leaving) return;
    this.leaving = true;
    this.manager.goto(destination);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.manager.canvas.removeEventListener('pointerdown', this.onClick);
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.container.destroy({ children: true });
  }
}
