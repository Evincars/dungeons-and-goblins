import { Container, Graphics } from 'pixi.js';
import { GAME_WIDTH } from '../render/Camera';
import { text } from '../core/texts';
import { makeText } from './PixelText';
import type { PixelLabel } from './PixelText';
import { sound } from '../audio/SoundPlayer';

const VISIBLE_LINES = 10;
const MAX_INPUT = 80;
const PANEL_HEIGHT = 150;
const PANEL_ALPHA = 0.6;
/** The cursor blinks: on for half of this many ticks, off for the other half. */
const BLINK_TICKS = 40;
const DASH = 5;

/** The ~ console (from Catacomb Snatch Redux): a text box over the top of the game that reads one command line at a time. */
export class ConsoleView {
  readonly container = new Container();
  private output: string[] = [];
  private readonly history: string[] = [];
  private recall = -1;
  private input = '/';
  private blink = 0;
  private readonly outputLabel: PixelLabel;
  private readonly inputLabel: PixelLabel;

  constructor(private readonly run: (line: string) => string[]) {
    const panel = new Graphics().rect(0, 0, GAME_WIDTH, PANEL_HEIGHT).fill({ color: 0x000000, alpha: PANEL_ALPHA });
    const header = makeText(text('console.header'), 0xffffff, 8);
    header.position.set(10, 9);
    this.outputLabel = makeText('', 0xffffff, 8);
    this.outputLabel.position.set(8, 46);
    this.inputLabel = makeText('/', 0xffffff, 8);
    this.inputLabel.position.set(8, PANEL_HEIGHT - 14);
    this.container.addChild(panel, this.dashedBox(6, 6, GAME_WIDTH - 12, 34), header, this.outputLabel, this.inputLabel);
    this.container.visible = false;
  }

  get visible(): boolean {
    return this.container.visible;
  }

  open(): void {
    sound.playLocal('dialog');
    this.container.visible = true;
    this.input = '/';
    this.recall = -1;
    this.redraw();
  }

  close(): void {
    this.container.visible = false;
  }

  /** Reads one key press while the console is open. */
  handleKey(e: KeyboardEvent): void {
    e.preventDefault();
    if (e.key === 'Enter') this.submit();
    else if (e.key === 'Backspace') this.input = this.input.slice(0, -1);
    else if (e.key === 'ArrowUp') this.step(1);
    else if (e.key === 'ArrowDown') this.step(-1);
    else if (this.typeable(e)) this.input += e.key;
    this.redraw();
  }

  /** A character to add to the line (the line opens with its slash already typed). */
  private typeable(e: KeyboardEvent): boolean {
    const printable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && this.input.length < MAX_INPUT;
    return printable && !(e.key === '/' && this.input === '/');
  }

  /** Blinks the text cursor. */
  update(): void {
    if (!this.visible) return;
    this.blink = (this.blink + 1) % BLINK_TICKS;
    if (this.blink === 0 || this.blink === BLINK_TICKS / 2) this.redraw();
  }

  private submit(): void {
    const line = this.input.trim();
    if (line && line !== '/') {
      this.history.unshift(line);
      this.print([`>${line}`, ...this.run(line)]);
    }
    this.recall = -1;
    this.input = '/';
  }

  /** Up and down walk back through the lines typed before. */
  private step(direction: number): void {
    const next = Math.max(-1, Math.min(this.history.length - 1, this.recall + direction));
    this.recall = next;
    this.input = next < 0 ? '/' : this.history[next];
  }

  private print(lines: string[]): void {
    this.output.push(...lines);
    if (this.output.length > VISIBLE_LINES) this.output = this.output.slice(-VISIBLE_LINES);
  }

  private redraw(): void {
    this.outputLabel.text = this.output.join('\n');
    this.inputLabel.text = this.input + (this.blink < BLINK_TICKS / 2 ? '_' : ' ');
  }

  private dashedBox(x: number, y: number, w: number, h: number): Graphics {
    const g = new Graphics();
    const edges: Array<[number, number, number, number]> = [
      [x, y, x + w, y], [x, y + h, x + w, y + h], [x, y, x, y + h], [x + w, y, x + w, y + h],
    ];
    for (const [x0, y0, x1, y1] of edges) this.dashes(g, x0, y0, x1, y1);
    return g.stroke({ color: 0xffffff, width: 1 });
  }

  private dashes(g: Graphics, x0: number, y0: number, x1: number, y1: number): void {
    const length = Math.hypot(x1 - x0, y1 - y0);
    for (let d = 0; d < length; d += DASH * 2) {
      const end = Math.min(d + DASH, length);
      g.moveTo(x0 + ((x1 - x0) * d) / length, y0 + ((y1 - y0) * d) / length);
      g.lineTo(x0 + ((x1 - x0) * end) / length, y0 + ((y1 - y0) * end) / length);
    }
  }
}
