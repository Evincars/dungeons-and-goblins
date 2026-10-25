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
import { music } from '../audio/MusicPlayer';
import { ambience } from '../audio/AmbiencePlayer';

const BUTTON_W = 220;
const BUTTON_H = 26;
const BUTTON_GAP = 6;
const MENU_TOP = 156;
/** The logo fills the space above the buttons: this far from the top, and this tall. */
const LOGO_TOP = 10;
const LOGO_H = 138;
/** The tagline sits under the buttons, this far from the bottom. */
const TAGLINE_Y = GAME_HEIGHT - 44;
const TAGLINE_COLOR = 0xb89a6a;
/** The credits (bottom left) and the version (bottom right): this far in from the corners, in a smaller hand. */
const CORNER_INSET = 6;
const CORNER_Y = GAME_HEIGHT - 12;
const CORNER_SCALE = 0.75;
const CORNER_COLOR = 0x9a8a72;
/** The dungeon's ambience fades away over this long (ms) back at the menu. */
const AMBIENCE_FADE_MS = 1500;
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
    music.play('menu');
    ambience.silence(AMBIENCE_FADE_MS);

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

    const tagline = makeText(text('menu.title.tagline'), TAGLINE_COLOR, 8, 'center');
    tagline.x = Math.floor(GAME_WIDTH / 2);
    tagline.y = TAGLINE_Y;
    this.container.addChild(tagline, ...cornerLabels());
    this.farewell = makeText(text('menu.title.farewell'), 0xffcc44, 8, 'center');
    this.farewell.x = Math.floor(GAME_WIDTH / 2);
    this.farewell.y = MENU_TOP - 18;
    this.farewell.visible = false;
    this.container.addChild(this.farewell);
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

/** Who made the game, in the bottom-left corner, and its version (from package.json) in the bottom-right. */
function cornerLabels(): PixelLabel[] {
  const style = { color: CORNER_COLOR, scale: CORNER_SCALE, shadow: true } as const;
  const credits = new PixelLabel(text('menu.title.credits'), { ...style, align: 'left' });
  credits.position.set(CORNER_INSET, CORNER_Y);
  const version = new PixelLabel(text('menu.title.version', { version: __GAME_VERSION__ }), { ...style, align: 'right' });
  version.position.set(GAME_WIDTH - CORNER_INSET, CORNER_Y);
  return [credits, version];
}

/** Leaving a room drops the invite from the address bar, so a reload does not rejoin it. */
function clearJoinLink(): void {
  const url = new URL(location.href);
  if (!url.searchParams.has('join')) return;
  url.searchParams.delete('join');
  history.replaceState(null, '', url.href);
}
