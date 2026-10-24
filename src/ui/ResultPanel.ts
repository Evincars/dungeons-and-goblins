import { Container, Graphics } from 'pixi.js';
import { GAME_WIDTH, GAME_HEIGHT, LAYOUT_LEFT, LAYOUT_WIDTH } from '../render/Camera';
import { PixelButton } from './PixelButton';
import { THEME } from './Theme';
import { makeText } from './PixelText';
import { sound } from '../audio/SoundPlayer';

const DIM_ALPHA = 0.75;
const PANEL = { x: LAYOUT_LEFT + 90, y: 90, w: LAYOUT_WIDTH - 180, h: 220 };
const TITLE_Y = 18;
const LINES_Y = 62;
const LINE_HEIGHT = 18;
const BUTTON_W = 150;
const BUTTON_H = 26;
const BUTTON_GAP = 12;
const BUTTONS_BOTTOM = 18;

export type ResultContent = {
  title: string;
  titleColor: number;
  lines: string[];
  /** Shown instead of the buttons when the player can't choose (a co-op guest waits for the host). */
  waiting?: string;
  buttons: Array<{ label: string; action: () => void }>;
};

/** A modal over the game that reports how things stand and offers a choice: game over, level complete. */
export class ResultPanel {
  readonly container = new Container();

  constructor() {
    this.container.visible = false;
    this.container.eventMode = 'static';
  }

  get open(): boolean {
    return this.container.visible;
  }

  show(content: ResultContent): void {
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    const dim = new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x000000, alpha: DIM_ALPHA });
    dim.eventMode = 'static';
    const panel = new Graphics().rect(PANEL.x, PANEL.y, PANEL.w, PANEL.h).fill(THEME.panel).stroke({ color: THEME.panelBorder, width: 2 });
    const title = makeText(content.title, content.titleColor, 16, 'center');
    title.x = GAME_WIDTH / 2;
    title.y = PANEL.y + TITLE_Y;
    this.container.addChild(dim, panel, title);
    content.lines.forEach((line, i) => {
      const text = makeText(line, 0xffffff, 10, 'center');
      text.x = GAME_WIDTH / 2;
      text.y = PANEL.y + LINES_Y + i * LINE_HEIGHT;
      this.container.addChild(text);
    });
    if (content.waiting) this.addWaiting(content.waiting);
    else this.addButtons(content.buttons);
    this.container.visible = true;
    sound.playLocal('dialog');
  }

  private addWaiting(message: string): void {
    const text = makeText(message, 0xffcc44, 10, 'center');
    text.x = GAME_WIDTH / 2;
    text.y = PANEL.y + PANEL.h - BUTTONS_BOTTOM - BUTTON_H / 2;
    this.container.addChild(text);
  }

  private addButtons(buttons: ResultContent['buttons']): void {
    const total = buttons.length * BUTTON_W + (buttons.length - 1) * BUTTON_GAP;
    buttons.forEach(({ label, action }, i) => {
      const button = new PixelButton(label, BUTTON_W, BUTTON_H);
      button.x = (GAME_WIDTH - total) / 2 + i * (BUTTON_W + BUTTON_GAP);
      button.y = PANEL.y + PANEL.h - BUTTONS_BOTTOM - BUTTON_H;
      button.onPress = action;
      this.container.addChild(button);
    });
  }

  hide(): void {
    this.container.visible = false;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
