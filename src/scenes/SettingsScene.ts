import { Container } from 'pixi.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../render/Camera';
import type { Scene, SceneManager } from '../game/SceneManager';
import { PixelButton } from '../ui/PixelButton';
import { PixelCheckbox } from '../ui/PixelCheckbox';
import { PixelSlider } from '../ui/PixelSlider';
import { makeText, makeTitle } from '../ui/PixelText';
import { NameField } from '../ui/NameField';
import { menuBackdrop } from '../ui/MenuBackdrop';
import { settings, saveSettings } from '../game/Settings';
import { sound } from '../audio/SoundPlayer';
import { reportRejection } from '../core/errors';

const COL_X = 136;
const COL_W = 240;
const ROW_H = 38;
const FIRST_ROW = 86;
const TITLE_Y = 40;

/** Settings, opened from the title or stacked over the pause menu: controls, screen, sound and your name. */
export class SettingsScene implements Scene {
  readonly container = new Container();
  private nameField: NameField;

  constructor(manager: SceneManager) {
    this.container.addChild(menuBackdrop());
    // Over the pause menu the game must not take clicks meant for these controls.
    this.container.eventMode = 'static';

    const title = makeTitle('Settings');
    title.x = GAME_WIDTH / 2;
    title.y = TITLE_Y;
    this.container.addChild(title);

    let y = FIRST_ROW;
    const bindings = new PixelButton('Key Bindings', COL_W, 26);
    bindings.x = COL_X;
    bindings.y = y;
    bindings.onPress = () => manager.open('key_bindings');
    this.container.addChild(bindings);
    y += ROW_H;

    const fullscreen = new PixelCheckbox('Fullscreen', !!document.fullscreenElement);
    fullscreen.x = COL_X;
    fullscreen.y = y;
    fullscreen.onToggle = (on) => {
      settings.fullscreen = on;
      saveSettings();
      // Fullscreen requests are only honoured from a user gesture, which this is; the browser may still refuse.
      const change = on ? document.documentElement.requestFullscreen?.() : document.exitFullscreen?.();
      if (change) reportRejection(change, 'Fullscreen change refused', 'settings');
    };
    this.container.addChild(fullscreen);
    y += ROW_H;

    const volume = new PixelSlider('Sound', settings.sfxVolume, COL_W);
    volume.x = COL_X;
    volume.y = y;
    volume.onChange = (v) => {
      settings.sfxVolume = v;
      sound.setSfxVolume(v);
      saveSettings();
    };
    this.container.addChild(volume);
    y += ROW_H;

    // The name the other players see above this character in a co-op game.
    const nameLabel = makeText('Your name', 0xffdd88, 8, 'center');
    nameLabel.x = GAME_WIDTH / 2;
    nameLabel.y = y;
    this.container.addChild(nameLabel);
    this.nameField = new NameField(manager.canvas, COL_X, y + 12, COL_W, 22);

    const back = new PixelButton('Back', COL_W, 26);
    back.x = COL_X;
    back.y = GAME_HEIGHT - 60;
    back.onPress = () => manager.back('title');
    this.container.addChild(back);
  }

  destroy(): void {
    this.nameField.destroy();
    this.container.destroy({ children: true });
  }
}
