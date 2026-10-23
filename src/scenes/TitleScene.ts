import { Container, Sprite } from 'pixi.js';
import { getTexture } from '../assets/Textures';
import { PixelLabel, makeText } from '../ui/PixelText';
import { PixelButton } from '../ui/PixelButton';
import { menuBackdrop } from '../ui/MenuBackdrop';
import { GAME_WIDTH, GAME_HEIGHT } from '../render/Camera';
import type { Scene, SceneManager } from '../game/SceneManager';
import { text } from '../core/texts';
import { coop } from '../network/CoopSession';
import { startRun } from '../game/Run';
import { world } from '../world';
import { chooseHeroThen } from './CharacterSelectScene';

const BUTTON_W = 220;
const BUTTON_H = 26;
const BUTTON_GAP = 6;
const MENU_TOP = 156;
/** The logo fills the space above the buttons: this far from the top, and this tall. */
const LOGO_TOP = 10;
const LOGO_H = 138;
const HINT_Y = GAME_HEIGHT - 40;
/** The prompt pulses at this rate (radians per tick). */
const PULSE_SPEED = 0.06;

/** The entry menu: start alone, host or join a co-op room, change settings, or leave. */
export class TitleScene implements Scene {
  readonly container = new Container();
  private tick = 0;
  private farewell: PixelLabel;

  constructor(manager: SceneManager) {
    // Back at the menu: any room is left, and the next game starts from the top of the dungeon.
    coop.close();
    startRun();
    clearJoinLink();
    // Nothing of the last game is needed here; a new one fills the world again.
    world.clear();

    this.container.addChild(menuBackdrop());
    const logo = new Sprite(getTexture('logo'));
    logo.anchor.set(0.5, 0);
    logo.scale.set(LOGO_H / Math.max(1, logo.texture.height));
    logo.position.set(Math.floor(GAME_WIDTH / 2), LOGO_TOP);
    this.container.addChild(logo);

    const entries: Array<{ label: string; action: () => void }> = [
      // Every game starts with picking the hero's class, then goes on alone or to the co-op lobby.
      { label: text('menu.title.start'), action: () => chooseHeroThen(manager, 'in_game') },
      { label: text('menu.title.host'), action: () => chooseHeroThen(manager, 'coop_host') },
      { label: text('menu.title.join'), action: () => chooseHeroThen(manager, 'coop_join') },
      { label: text('menu.title.settings'), action: () => manager.goto('settings') },
      { label: text('menu.title.exit'), action: () => this.exit() },
    ];
    entries.forEach(({ label, action }, i) => {
      const button = new PixelButton(label, BUTTON_W, BUTTON_H);
      button.x = Math.floor((GAME_WIDTH - BUTTON_W) / 2);
      button.y = MENU_TOP + i * (BUTTON_H + BUTTON_GAP);
      button.onPress = action;
      this.container.addChild(button);
    });

    const hint = makeText(text('menu.title.controls_hint'), 0x776655, 8, 'center');
    hint.x = Math.floor(GAME_WIDTH / 2);
    hint.y = HINT_Y;
    this.farewell = makeText(text('menu.title.farewell'), 0xffcc44, 8, 'center');
    this.farewell.x = Math.floor(GAME_WIDTH / 2);
    this.farewell.y = MENU_TOP - 18;
    this.farewell.visible = false;
    this.container.addChild(hint, this.farewell);
  }

  /** Browsers only let a script close a tab it opened itself; otherwise say how to leave. */
  private exit(): void {
    window.close();
    this.farewell.visible = true;
  }

  update(): void {
    this.tick++;
    this.farewell.alpha = 0.6 + 0.4 * Math.sin(this.tick * PULSE_SPEED);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

/** Leaving a room drops the invite from the address bar, so a reload does not rejoin it. */
function clearJoinLink(): void {
  const url = new URL(location.href);
  if (!url.searchParams.has('join')) return;
  url.searchParams.delete('join');
  history.replaceState(null, '', url.href);
}
