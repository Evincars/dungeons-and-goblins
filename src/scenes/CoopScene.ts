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
import { GAME_WIDTH, GAME_HEIGHT, LAYOUT_LEFT } from '../render/Camera';
import { attempt, attemptAsync, report, StateError } from '../core/errors';

const CENTER = GAME_WIDTH / 2;
const COL_X = LAYOUT_LEFT + 136;
const COL_W = 240;
const BUTTON_H = 26;
const INVITE_BOX = { x: LAYOUT_LEFT + 70, y: 108, w: 372, h: 22 };
const NAME_BOX = { x: COL_X, y: 184, w: COL_W, h: 22 };
/** How often the lobby checks whether the settings screen covers it (its text boxes must hide then). */
const OVERLAY_POLL_MS = 150;

export type CoopRole = 'host' | 'guest';

/**
 * The co-op room. Everyone types the name the others will see; the host shares an invite link and starts
 * the game when the party is ready (there is no map to choose: the dungeon is generated, and every guest
 * builds the same one from the seed the host sends).
 */
export class CoopScene implements Scene {
  readonly container = new Container();
  private readonly invite: TextBox;
  private readonly nameField: NameField;
  private readonly status: PixelLabel;
  private readonly roster: PixelLabel;
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
    this.roster = makeText('', 0xffffff, 8, 'center');
    this.roster.x = CENTER;
    this.roster.y = 246;
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

    if (role === 'host') {
      this.start = this.button(text('coop.start'), GAME_HEIGHT - 86, () => this.startGame());
      this.start.setEnabled(false);
    }
    this.button(text('coop.cancel'), GAME_HEIGHT - 52, () => manager.goto('title'));
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
