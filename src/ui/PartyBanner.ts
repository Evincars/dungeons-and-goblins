import { Container, Graphics } from 'pixi.js';
import { localPlayer } from '../world';
import type { Entity } from '../world';
import { GAME_WIDTH } from '../render/Camera';
import { claimPointer } from '../systems/InputSystem';
import { gateCountdown } from '../systems/DoorSystem';
import { answerVote, currentParty, NOTICE_TICKS, seatOf } from '../game/Party';
import { text } from '../core/texts';
import { PixelButton } from './PixelButton';
import { PixelLabel } from './PixelText';

/** The banner's top edge, the padding round its text and the dark band behind it. */
const TOP = 34;
const PAD = 4;
const LINE = 10;
const BAND_ALPHA = 0.6;
/** A notice fades out over its last this many ticks. */
const FADE_TICKS = 40;
/** The Agree / Refuse buttons under a question to the party. */
const BUTTON_W = 56;
const BUTTON_H = 18;
const BUTTON_GAP = 8;
const NOTICE_COLOR = 0xf2e6c8;
/** The gate's countdown reads red. */
const WARNING_COLOR = 0xff7a5a;

type PartyState = NonNullable<Entity['party']>;

/**
 * What the screen says to the whole party, high in the middle: the gate shutting on the safe room (a
 * countdown), a question someone put to the party — a rest, opening the gate — with Agree and Refuse for
 * everyone who hasn't answered yet, or the last word on one (a rest taken, a refusal, why it can't be).
 */
export class PartyBanner {
  readonly view = new Container();
  private readonly band = new Graphics();
  private readonly line = new PixelLabel('', { color: NOTICE_COLOR, align: 'center', outline: true });
  private readonly sub = new PixelLabel('', { color: NOTICE_COLOR, align: 'center', outline: true });
  private readonly buttons = new Container();
  private shown = '';

  constructor() {
    this.view.eventMode = 'passive';
    this.view.visible = false;
    this.line.position.set(GAME_WIDTH / 2, TOP + PAD);
    this.sub.position.set(GAME_WIDTH / 2, TOP + PAD + LINE);
    const agree = this.addButton(text('hud.vote.agree'), true, -BUTTON_W - BUTTON_GAP / 2);
    const refuse = this.addButton(text('hud.vote.refuse'), false, BUTTON_GAP / 2);
    this.buttons.addChild(agree, refuse);
    this.buttons.position.set(GAME_WIDTH / 2, TOP + 2 * PAD + LINE);
    this.view.addChild(this.band, this.line, this.sub, this.buttons);
  }

  private addButton(label: string, agree: boolean, x: number): PixelButton {
    const button = new PixelButton(label, BUTTON_W, BUTTON_H);
    button.position.set(x, 0);
    button.onPress = () => answerVote(agree);
    button.on('pointerover', () => claimPointer(button, true));
    button.on('pointerout', () => claimPointer(button, false));
    return button;
  }

  update(): void {
    const state = currentParty();
    const me = localPlayer();
    const countdown = gateCountdown();
    if (!me || (countdown === null && !state?.vote && !state?.notice)) {
      this.hide();
      return;
    }
    this.view.visible = true;
    if (state?.vote) this.showVote(state, state.vote.agreed.includes(seatOf(me)));
    else if (countdown !== null) this.showCountdown(countdown);
    else if (state) this.showNotice(state);
  }

  /** The gate is open: everyone still in the safe room has these seconds to get out. */
  private showCountdown(seconds: number): void {
    this.setLines(text('party.gate_closing', { seconds }), '', WARNING_COLOR);
    this.view.alpha = 1;
    this.hideButtons();
  }

  /** A question to the party: who asked and what; Agree / Refuse until this player has answered. */
  private showVote(state: PartyState, answered: boolean): void {
    const vote = state.vote;
    if (!vote) return;
    const name = state.notice?.notice === 'asked' ? state.notice.name : '';
    this.setLines(text(`party.asked.${vote.kind}`, { name }), answered ? text('party.waiting') : '', NOTICE_COLOR);
    this.view.alpha = 1;
    this.buttons.visible = !answered;
    if (answered) this.releaseButtons();
  }

  /** The last word on a vote, fading out at the end of its time. */
  private showNotice(state: PartyState): void {
    const notice = state.notice;
    if (!notice) return;
    this.setLines(text(`party.notice.${notice.notice}`, { name: notice.name, what: text(`party.kind.${notice.kind}`) }), '', NOTICE_COLOR);
    this.view.alpha = Math.max(0, Math.min(1, (NOTICE_TICKS - notice.age) / FADE_TICKS));
    this.hideButtons();
  }

  private setLines(line: string, sub: string, color: number): void {
    const key = `${line}\n${sub}`;
    if (key === this.shown) return;
    this.shown = key;
    this.line.text = line;
    this.line.fill = color;
    this.sub.text = sub;
    const w = Math.max(this.line.textWidth, this.sub.textWidth) + 2 * PAD;
    const h = sub ? 2 * PAD + 2 * LINE - 2 : 2 * PAD + 8;
    this.band.clear().rect(Math.round((GAME_WIDTH - w) / 2), TOP, w, h).fill({ color: 0x000000, alpha: BAND_ALPHA });
  }

  private hideButtons(): void {
    this.buttons.visible = false;
    this.releaseButtons();
  }

  private releaseButtons(): void {
    for (const button of this.buttons.children) claimPointer(button, false);
  }

  private hide(): void {
    if (!this.view.visible) return;
    this.view.visible = false;
    this.releaseButtons();
  }

  destroy(): void {
    this.releaseButtons();
  }
}
