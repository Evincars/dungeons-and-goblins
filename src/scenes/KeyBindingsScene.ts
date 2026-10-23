import { text } from '../core/texts';
import { Container } from 'pixi.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../render/Camera';
import type { Scene, SceneManager } from '../game/SceneManager';
import { PixelButton } from '../ui/PixelButton';
import { makeText, makeTitle } from '../ui/PixelText';
import { menuBackdrop } from '../ui/MenuBackdrop';
import { ACTIONS, actionLabel, bind, codeLabel, resetBindings, settings } from '../game/Settings';
import type { ActionName } from '../game/Settings';

/** Rows this far apart: eleven actions fit above Reset and Back. */
const ROW_H = 24;
const BTN_W = 120;
const BTN_H = 20;
const TOP = 72;
const LABEL_RIGHT = GAME_WIDTH / 2 - 8;
const TITLE_Y = 26;
const HINT_Y = 50;

/** Rebinding the game's actions: click one, then press the key it should use (Escape cancels). */
export class KeyBindingsScene implements Scene {
  readonly container = new Container();
  /** Set while waiting for the next key press to assign. */
  private capturing: ActionName | null = null;
  private buttons = new Map<ActionName, PixelButton>();
  private readonly onKeyDown: (e: KeyboardEvent) => void;

  constructor(manager: SceneManager) {
    this.container.addChild(menuBackdrop());
    this.container.eventMode = 'static';
    const title = makeTitle(text('keys.title'));
    title.x = GAME_WIDTH / 2;
    title.y = TITLE_Y;
    const hint = makeText(text('keys.hint'), 0xaaaaaa, 9, 'center');
    hint.x = GAME_WIDTH / 2;
    hint.y = HINT_Y;
    this.container.addChild(title, hint);

    ACTIONS.forEach((action, i) => this.addRow(action, TOP + i * ROW_H));

    const reset = new PixelButton(text('keys.reset'), 100, BTN_H);
    reset.x = GAME_WIDTH / 2 - 110;
    reset.y = GAME_HEIGHT - 34;
    reset.onPress = () => {
      resetBindings();
      this.capturing = null;
      this.refresh();
    };
    const back = new PixelButton(text('keys.back'), 100, BTN_H);
    back.x = GAME_WIDTH / 2 + 10;
    back.y = GAME_HEIGHT - 34;
    back.onPress = () => manager.back('settings');
    this.container.addChild(reset, back);

    this.onKeyDown = (e: KeyboardEvent) => {
      if (!this.capturing) return;
      e.preventDefault();
      if (e.code !== 'Escape') bind(this.capturing, e.code);
      this.capturing = null;
      this.refresh();
    };
    window.addEventListener('keydown', this.onKeyDown);
    this.refresh();
  }

  /** Escape while waiting for a key cancels that, rather than closing the screen. */
  handleEscape(): boolean {
    return this.capturing !== null;
  }

  private addRow(action: ActionName, y: number): void {
    const label = makeText(text('keys.action_label', { action: actionLabel(action) }), 0xffffff, 8, 'right');
    label.x = LABEL_RIGHT;
    label.y = y + 7;
    const button = new PixelButton('', BTN_W, BTN_H);
    button.x = GAME_WIDTH / 2;
    button.y = y;
    button.onPress = () => {
      this.capturing = action;
      this.refresh();
    };
    this.container.addChild(label, button);
    this.buttons.set(action, button);
  }

  private refresh(): void {
    for (const [action, button] of this.buttons) {
      button.setText(this.capturing === action ? '...' : codeLabel(settings.bindings[action]));
    }
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.container.destroy({ children: true });
  }
}
