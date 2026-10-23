import { text } from '../core/texts';
import { Container } from 'pixi.js';
import type { Scene, SceneManager } from '../game/SceneManager';
import { coop } from '../network/CoopSession';
import { invitePeer } from '../network/protocol';
import { makeText, makeTitle } from '../ui/PixelText';
import type { PixelLabel } from '../ui/PixelText';
import { PixelButton } from '../ui/PixelButton';
import { NameField } from '../ui/NameField';
import { TextBox } from '../ui/TextBox';
import { menuBackdrop } from '../ui/MenuBackdrop';
import { HeroPicker } from '../ui/HeroPicker';
import { settings, saveSettings } from '../game/Settings';
import type { HeroClassId } from '../rules/Classes';
import { heroName } from '../rules/Names';
import { GAME_WIDTH, GAME_HEIGHT, LAYOUT_LEFT } from '../render/Camera';
import { attempt, attemptAsync, report, StateError } from '../core/errors';

const CENTER = GAME_WIDTH / 2;
const COL_X = LAYOUT_LEFT + 136;
const COL_W = 240;
const BUTTON_H = 26;
const INVITE_BOX = { x: LAYOUT_LEFT + 70, y: 108, w: 372, h: 22 };
const NAME_BOX = { x: COL_X, y: 184, w: COL_W, h: 22 };
/** The room's players, listed right of the column. */
const ROSTER = { x: COL_X + COL_W + 14, y: 172 };
/** "Your hero", and the portraits under it (the names of who took each hero above them). */
const HERO_LABEL_Y = 242;
const HEROES_Y = 266;
/** The host's Start and everyone's Cancel, under the portraits. */
const START_Y = GAME_HEIGHT - 78;
const CANCEL_Y = GAME_HEIGHT - 46;
/** How often the lobby checks whether the settings screen covers it (its text boxes must hide then). */
const OVERLAY_POLL_MS = 150;

export type CoopRole = 'host' | 'guest';

/**
 * The co-op room. Everyone types the name the others will see and picks their hero (whoever took a hero is
 * named over its portrait; two may play the same one); the host shares an invite link and starts the game
 * when the party is ready (there is no map to choose: the dungeon is generated, and every guest builds the
 * same one from the seed the host sends).
 */
export class CoopScene implements Scene {
  readonly container = new Container();
  private readonly invite: TextBox;
  private readonly nameField: NameField;
  private readonly status: PixelLabel;
  private readonly roster: PixelLabel;
  private readonly heroes: HeroPicker;
  private readonly heroLabel: PixelLabel;
  private tick = 0;
  private start: PixelButton | null = null;
  private action!: PixelButton;
  private disposed = false;
  private overlayWatch?: ReturnType<typeof setInterval>;

  constructor(private readonly manager: SceneManager, private readonly role: CoopRole, destination?: string) {
    this.container.addChild(menuBackdrop());
    const title = makeTitle(text(role === 'host' ? 'coop.host_title' : 'coop.join_title'));
    title.x = CENTER;
    title.y = 30;
    this.status = makeText('', 0xffdd88, 8, 'center');
    this.status.x = CENTER;
    this.status.y = 90;
    this.roster = makeText('', 0xffffff, 8);
    this.roster.position.set(ROSTER.x, ROSTER.y);
    this.container.addChild(title, this.status, this.roster);

    this.invite = new TextBox(manager.canvas, INVITE_BOX, {
      ariaLabel: text(role === 'host' ? 'coop.invite_aria_host' : 'coop.invite_aria_guest'),
      placeholder: text('coop.invite_placeholder'),
      readOnly: role === 'host',
    });
    this.container.addChild(this.invite.view);
    this.action = this.button(text(role === 'host' ? 'coop.action_host' : 'coop.action_guest'), 136, () => this.runAction());

    // Everyone sets the name the others will see above their character.
    const nameLabel = makeText(text('coop.name_label'), 0xffdd88, 8, 'center');
    nameLabel.x = CENTER;
    nameLabel.y = 172;
    this.container.addChild(nameLabel);
    this.nameField = new NameField(manager.canvas, NAME_BOX.x, NAME_BOX.y, NAME_BOX.w, NAME_BOX.h);
    this.container.addChild(this.nameField.view);
    this.button(text('coop.settings'), 212, () => manager.pushOverlay('settings'));

    this.heroLabel = makeText('', 0xffdd88, 8, 'center');
    this.heroLabel.position.set(CENTER, HERO_LABEL_Y);
    this.heroes = new HeroPicker(Math.round(CENTER - HeroPicker.width / 2), HEROES_Y, settings.heroClass);
    this.heroes.onPick = (id) => this.pickHero(id);
    this.container.addChild(this.heroLabel, this.heroes.view);

    if (role === 'host') {
      this.start = this.button(text('coop.start'), START_Y, () => this.startGame());
      this.start.setEnabled(false);
    }
    this.button(text('coop.cancel'), CANCEL_Y, () => manager.goto('title'));
    this.connect(destination);
    this.watchOverlays();
  }

  private button(text: string, y: number, action: () => void): PixelButton {
    const button = new PixelButton(text, COL_W, BUTTON_H);
    button.x = COL_X;
    button.y = y;
    button.onPress = action;
    this.container.addChild(button);
    return button;
  }

  /** Host: opens the room. Guest: dials the host from the invite in the address bar, or waits for a pasted one. */
  private connect(destination: string | undefined): void {
    // Opening a session starts by closing any old one, hooks and all, so the hooks go on afterwards.
    if (this.role === 'host') {
      coop.open('host').catch((error: unknown) => this.showError(error));
      this.watchSession();
      return;
    }
    if (!destination) {
      this.status.text = text('coop.paste_prompt');
      return;
    }
    this.invite.value = destination;
    const peer = attempt(() => invitePeer(destination));
    if (!peer.ok) return this.showError(peer.error);
    coop.open('guest', peer.value).catch((error: unknown) => this.showError(error));
    this.watchSession();
  }

  private async copyInvite(): Promise<void> {
    if (!coop.invite) throw new StateError('The invite is not ready yet');
    await navigator.clipboard.writeText(coop.invite);
    this.status.text = text('coop.invite_copied');
  }

  private async dial(): Promise<void> {
    await coop.open('guest', invitePeer(this.invite.value));
    this.watchSession();
  }

  private async runAction(): Promise<void> {
    const done = await attemptAsync(() => (this.role === 'host' ? this.copyInvite() : this.dial()), 'network');
    if (!done.ok) this.showError(done.error);
  }

  /** The host starts once at least one guest is in (to play alone, use Start on the title screen). */
  private startGame(): void {
    if (this.role === 'host' && coop.connected) this.manager.goto('in_game');
  }

  private readonly onChange = () => this.refresh();
  // The host started the game: the guest follows it in.
  private readonly onStart = () => {
    if (!this.disposed) this.manager.goto('in_game');
  };

  private watchSession(): void {
    coop.onChange = this.onChange;
    coop.onStart = this.onStart;
    this.refresh();
  }

  private refresh(): void {
    if (this.disposed) return;
    this.status.text = coop.status;
    if (this.role === 'host') this.invite.value = coop.invite;
    this.start?.setEnabled(coop.connected);
    this.action.setEnabled(this.role !== 'host' || !!coop.invite);
    const lines = coop.roster.map((p, i) => `${i + 1}. ${p.name}${p.slot === 'host' ? text('coop.roster_host_tag') : ''}`);
    this.roster.text = lines.length ? text('coop.roster', { players: lines.join('\n') }) : '';
    this.showTakers();
  }

  /** Another hero: remembered for next time, and told to the room. */
  private pickHero(id: HeroClassId): void {
    if (coop.locked) return;
    settings.heroClass = id;
    saveSettings();
    this.heroes.picked = id;
    coop.setHero(id);
    this.refresh();
  }

  /** Who in the room took which hero, for the names over the portraits. */
  private showTakers(): void {
    const takers = new Map<HeroClassId, string[]>();
    for (const p of coop.roster) takers.set(p.heroClass, [...(takers.get(p.heroClass) ?? []), p.name]);
    this.heroes.setTakers(takers);
    this.heroLabel.text = text('coop.your_hero', { hero: heroName(settings.heroClass) });
  }

  update(): void {
    this.heroes.update(++this.tick);
  }

  private showError(error: unknown): void {
    this.status.text = report(error, text('coop.lobby_error_scope'), 'network').message;
  }

  /** The settings screen lies over this one; the text boxes would show through it. */
  private watchOverlays(): void {
    let covered = false;
    this.overlayWatch = setInterval(() => {
      if (this.manager.hasOverlay === covered) return;
      covered = this.manager.hasOverlay;
      this.container.interactiveChildren = !covered;
      this.invite.visible = !covered;
      this.nameField.visible = !covered;
      if (!covered) this.nameField.reload();
    }, OVERLAY_POLL_MS);
  }

  destroy(): void {
    this.disposed = true;
    clearInterval(this.overlayWatch);
    // The game scene is built before this one goes, and puts in hooks of its own.
    if (coop.onChange === this.onChange) coop.onChange = null;
    if (coop.onStart === this.onStart) coop.onStart = null;
    this.nameField.destroy();
    this.invite.destroy();
    this.container.destroy({ children: true });
  }
}
