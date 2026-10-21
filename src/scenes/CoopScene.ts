import { Container } from 'pixi.js';
import type { Scene, SceneManager } from '../game/SceneManager';
import { coop } from '../network/CoopSession';
import { invitePeer } from '../network/protocol';
import { makeText, makeTitle } from '../ui/PixelText';
import type { PixelLabel } from '../ui/PixelText';
import { PixelButton } from '../ui/PixelButton';
import { NameField } from '../ui/NameField';
import { menuBackdrop } from '../ui/MenuBackdrop';
import { settings } from '../game/Settings';
import { GAME_WIDTH, GAME_HEIGHT } from '../render/Camera';
import { attempt, attemptAsync, report, StateError } from '../core/errors';

const CENTER = GAME_WIDTH / 2;
const COL_X = 136;
const COL_W = 240;
const BUTTON_H = 26;
const INVITE_BOX = { x: 70, y: 108, w: 372, h: 22 };
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
  private readonly invite = document.createElement('input');
  private readonly nameField: NameField;
  private readonly status: PixelLabel;
  private readonly roster: PixelLabel;
  private start: PixelButton | null = null;
  private action!: PixelButton;
  private disposed = false;
  private overlayWatch?: ReturnType<typeof setInterval>;
  private readonly place: () => void;

  constructor(private readonly manager: SceneManager, private readonly role: CoopRole, destination?: string) {
    this.container.addChild(menuBackdrop());
    const title = makeTitle(role === 'host' ? 'Host game' : 'Join game');
    title.x = CENTER;
    title.y = 30;
    this.status = makeText('', 0xffdd88, 8, 'center');
    this.status.x = CENTER;
    this.status.y = 90;
    this.roster = makeText('', 0xffffff, 8, 'center');
    this.roster.x = CENTER;
    this.roster.y = 246;
    this.container.addChild(title, this.status, this.roster);

    this.place = () => this.placeInvite();
    this.buildInviteBox();
    this.action = this.button(role === 'host' ? 'Copy invite' : 'Connect', 136, () => this.runAction());

    // Everyone sets the name the others will see above their character.
    const nameLabel = makeText('Your name', 0xffdd88, 8, 'center');
    nameLabel.x = CENTER;
    nameLabel.y = 172;
    this.container.addChild(nameLabel);
    this.nameField = new NameField(manager.canvas, NAME_BOX.x, NAME_BOX.y, NAME_BOX.w, NAME_BOX.h);
    this.button('Settings', 212, () => manager.pushOverlay('settings'));

    if (role === 'host') {
      this.start = this.button('Start game', GAME_HEIGHT - 86, () => this.startGame());
      this.start.setEnabled(false);
    }
    this.button('Cancel', GAME_HEIGHT - 52, () => manager.goto('title'));
    this.connect(destination);
    this.watchOverlays();
  }

  private buildInviteBox(): void {
    const input = this.invite;
    input.type = 'text';
    input.setAttribute('aria-label', this.role === 'host' ? 'Invite link' : 'Host invite link or peer ID');
    input.placeholder = 'Paste the invite link';
    input.style.cssText = 'position:fixed;box-sizing:border-box;padding:0 8px;background:#241b18;color:#fff;border:1px solid #d9a454;z-index:10';
    input.readOnly = this.role === 'host';
    // Typing here must not walk the character or open menus.
    input.addEventListener('keydown', (event) => {
      if (event.code !== 'Escape') event.stopPropagation();
    });
    document.body.appendChild(input);
    window.addEventListener('resize', this.place);
    this.place();
  }

  /** Keeps the HTML text box over its spot on the canvas, however the page is scaled. */
  private placeInvite(): void {
    const rect = this.manager.canvas.getBoundingClientRect();
    const sx = rect.width / GAME_WIDTH;
    const sy = rect.height / GAME_HEIGHT;
    const s = this.invite.style;
    s.left = `${rect.left + INVITE_BOX.x * sx}px`;
    s.top = `${rect.top + INVITE_BOX.y * sy}px`;
    s.width = `${INVITE_BOX.w * sx}px`;
    s.height = `${INVITE_BOX.h * sy}px`;
    s.fontSize = `${Math.max(10, 10 * sy)}px`;
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
      this.status.text = 'Paste the link your host sent you.';
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
    this.status.text = 'Invite copied. Send it to the other players.';
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
    const lines = coop.roster.map((p, i) => `${i + 1}. ${p.name}${p.slot === 'host' ? ' (host)' : ''}`);
    this.roster.text = lines.length ? `Players in the room\n${lines.join('\n')}` : '';
  }

  private showError(error: unknown): void {
    this.status.text = report(error, 'Co-op lobby', 'network').message;
  }

  /** The settings screen lies over this one; the text boxes would show through it. */
  private watchOverlays(): void {
    let covered = false;
    this.overlayWatch = setInterval(() => {
      if (this.manager.hasOverlay === covered) return;
      covered = this.manager.hasOverlay;
      this.container.interactiveChildren = !covered;
      this.invite.style.display = covered ? 'none' : '';
      this.nameField.visible = !covered;
      if (covered) return;
      this.nameField.element.value = settings.playerName;
      this.place();
    }, OVERLAY_POLL_MS);
  }

  destroy(): void {
    this.disposed = true;
    clearInterval(this.overlayWatch);
    window.removeEventListener('resize', this.place);
    // The game scene is built before this one goes, and puts in hooks of its own.
    if (coop.onChange === this.onChange) coop.onChange = null;
    if (coop.onStart === this.onStart) coop.onStart = null;
    this.nameField.destroy();
    this.invite.remove();
    this.container.destroy({ children: true });
  }
}
