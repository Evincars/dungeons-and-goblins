import { Container, Graphics, Sprite } from 'pixi.js';
import { GAME_WIDTH, GAME_HEIGHT, LAYOUT_LEFT, LAYOUT_WIDTH } from '../render/Camera';
import { getTexture } from '../assets/Textures';
import { PixelButton } from './PixelButton';
import { THEME } from './Theme';
import { makeText } from './PixelText';

const BTN_W = 220;
const BTN_H = 26;
const BTN_GAP = 4;
const MENU_TOP = 92;
const STATUS_Y = 66;
const DIM_ALPHA = 0.6;
const DIALOG_ALPHA = 0.85;
const DIALOG = { x: LAYOUT_LEFT + 90, y: 112, w: LAYOUT_WIDTH - 180, h: 148 };

export type PauseActions = {
  resume: () => void;
  settings: () => void;
  mainMenu: () => void;
  exitGame: () => void;
};

/**
 * The Escape menu, drawn with Catacomb Snatch Redux's PAUSE art and buttons. Leaving for the main menu
 * asks first, since the dungeon run (and, for a guest, the co-op game) would be lost.
 */
export class PauseMenu {
  readonly container = new Container();
  private dialog: Container | null = null;

  constructor(private readonly actions: PauseActions, private readonly warning: string) {
    this.container.visible = false;
    this.container.eventMode = 'static';
  }

  get open(): boolean {
    return this.container.visible;
  }

  show(status = ''): void {
    this.closeDialog();
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    const dim = new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x000000, alpha: DIM_ALPHA });
    const title = new Sprite(getTexture('pause_screen'));
    // The PAUSE art is drawn for the 4:3 screen; wider screens show it centred, unstretched.
    title.x = LAYOUT_LEFT;
    title.width = LAYOUT_WIDTH;
    title.height = GAME_HEIGHT;
    this.container.addChild(dim, title);
    if (status) {
      const note = makeText(status.slice(0, 60), 0xff8888, 8, 'center');
      note.x = GAME_WIDTH / 2;
      note.y = STATUS_Y;
      this.container.addChild(note);
    }
    const entries: Array<{ label: string; action: () => void }> = [
      { label: 'Resume', action: this.actions.resume },
      { label: 'Settings', action: this.actions.settings },
      { label: 'Main Menu', action: () => this.confirmMainMenu() },
      { label: 'Exit Game', action: this.actions.exitGame },
    ];
    entries.forEach(({ label, action }, i) => {
      const button = new PixelButton(label, BTN_W, BTN_H);
      button.x = (GAME_WIDTH - BTN_W) / 2;
      button.y = MENU_TOP + i * (BTN_H + BTN_GAP);
      button.onPress = action;
      this.container.addChild(button);
    });
    this.container.visible = true;
  }

  hide(): void {
    this.closeDialog();
    this.container.visible = false;
  }

  /** Escape inside the menu: closes the confirmation if it is up; true when it did. */
  handleEscape(): boolean {
    if (!this.dialog) return false;
    this.closeDialog();
    return true;
  }

  private closeDialog(): void {
    this.dialog?.destroy({ children: true });
    this.dialog = null;
  }

  private confirmMainMenu(): void {
    if (this.dialog) return;
    const dialog = new Container();
    const dim = new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x000000, alpha: DIALOG_ALPHA });
    dim.eventMode = 'static';
    const panel = new Graphics().rect(DIALOG.x, DIALOG.y, DIALOG.w, DIALOG.h).fill(THEME.panel).stroke({ color: THEME.panelBorder, width: 2 });
    const title = makeText('RETURN TO MAIN MENU?', 0xffdd88, 16, 'center');
    title.x = GAME_WIDTH / 2;
    title.y = DIALOG.y + 18;
    const warning = makeText(this.warning, 0xffffff, 10, 'center');
    warning.x = GAME_WIDTH / 2;
    warning.y = DIALOG.y + 51;
    const cancel = new PixelButton('Cancel', 126, BTN_H);
    cancel.x = GAME_WIDTH / 2 - 136;
    cancel.y = DIALOG.y + 103;
    cancel.onPress = () => this.closeDialog();
    const leave = new PixelButton('Main Menu', 126, BTN_H);
    leave.x = GAME_WIDTH / 2 + 10;
    leave.y = DIALOG.y + 103;
    leave.onPress = this.actions.mainMenu;
    dialog.addChild(dim, panel, title, warning, cancel, leave);
    this.dialog = dialog;
    this.container.addChild(dialog);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
