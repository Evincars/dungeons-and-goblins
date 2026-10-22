import { NAME_MAX, cleanName, saveSettings, settings } from '../game/Settings';
import { text } from '../core/texts';
import { coop } from '../network/CoopSession';
import { TextBox } from './TextBox';

/**
 * The text box for the player's name. Whatever is typed is cleaned, saved to the settings and handed to
 * the room, if there is one. Add `view` to the scene to show it.
 */
export class NameField {
  private readonly box: TextBox;

  /** `x`, `y`, `width` and `height` are in game pixels. */
  constructor(canvas: HTMLCanvasElement, x: number, y: number, width: number, height: number) {
    this.box = new TextBox(canvas, { x, y, w: width, h: height }, {
      ariaLabel: text('settings.player_name_aria'), placeholder: text('settings.player_name'), maxLength: NAME_MAX, align: 'center',
    });
    this.box.value = settings.playerName;
    this.box.element.addEventListener('change', () => this.commit());
  }

  get view(): TextBox['view'] {
    return this.box.view;
  }

  set visible(on: boolean) {
    this.box.visible = on;
  }

  /** Shows the saved name again (after another screen changed it). */
  reload(): void {
    this.box.value = settings.playerName;
  }

  /** Cleans, stores and shares the typed name. */
  commit(): void {
    const name = cleanName(this.box.value);
    this.box.value = name;
    if (name === settings.playerName) return;
    settings.playerName = name;
    saveSettings();
    coop.setName(name);
  }

  destroy(): void {
    this.commit();
    this.box.destroy();
  }
}
