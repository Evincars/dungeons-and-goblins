import { Container, Graphics } from 'pixi.js';
import { localPlayer } from '../world';
import type { Entity } from '../world';
import { GAME_WIDTH } from '../render/Camera';
import { claimPointer } from '../systems/InputSystem';
import { answerRest, currentRest, REST_NOTICE_TICKS, seatOf } from '../game/Rest';
import { text } from '../core/texts';
import { PixelButton } from './PixelButton';
import { PixelLabel } from './PixelText';

/** The banner's top edge, the padding round its text and the dark band behind it. */
const TOP = 34;
const PAD = 4;
const BAND_ALPHA = 0.6;
/** A notice fades out over its last this many ticks. */
const FADE_TICKS = 40;
/** The Agree / Refuse buttons under a rest someone asked for. */
const BUTTON_W = 56;
const BUTTON_H = 18;
const BUTTON_GAP = 8;
const NOTICE_COLOR = 0xf2e6c8;

type RestState = NonNullable<Entity['restState']>;

/**
 * What the screen says about resting, high in the middle: the rest just taken or why it can't be, and in
 * co-op the rest someone asked for — with Agree and Refuse for everyone who hasn't answered yet.
 */
export class RestBanner {
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
    this.sub.position.set(GAME_WIDTH / 2, TOP + PAD + 10);
    const agree = this.addButton(text('hud.rest.agree'), true, -BUTTON_W - BUTTON_GAP / 2);
    const refuse = this.addButton(text('hud.rest.refuse'), false, BUTTON_GAP / 2);
    this.buttons.addChild(agree, refuse);
    this.buttons.position.set(GAME_WIDTH / 2, TOP + 2 * PAD + 10);
    this.view.addChild(this.band, this.line, this.sub, this.buttons);
  }

  private addButton(label: string, agree: boolean, x: number): PixelButton {
    const button = new PixelButton(label, BUTTON_W, BUTTON_H);
    button.position.set(x, 0);
    button.onPress = () => answerRest(agree);
    button.on('pointerover', () => claimPointer(button, true));
    button.on('pointerout', () => claimPointer(button, false));
    return button;
  }

  update(): void {
    const state = currentRest();
    const me = localPlayer();
    if (!state || !me || !(state.vote || state.notice)) {
      this.hide();
      return;
    }
    this.view.visible = true;
    if (state.vote) this.showVote(state, state.vote.agreed.includes(seatOf(me)));
    else this.showNotice(state);
  }

  /** A rest asked for: who asked and which rest; Agree / Refuse until this player has answered. */
  private showVote(state: RestState, answered: boolean): void {
    const vote = state.vote;
    if (!vote) return;
    const name = state.notice?.notice === 'asked' ? state.notice.name : '';
    this.setLines(text('rest.notice.asked', { name, rest: text(`rest.kind.${vote.kind}` as const) }), answered ? text('rest.waiting') : '');
    this.view.alpha = 1;
    this.buttons.visible = !answered;
    if (answered) this.releaseButtons();
  }

  /** The last word on a rest, fading out at the end of its time. */
  private showNotice(state: RestState): void {
    const notice = state.notice;
    if (!notice) return;
    this.setLines(text(`rest.notice.${notice.notice}` as const, { name: notice.name, rest: text(`rest.kind.${notice.kind}` as const) }), '');
    this.view.alpha = Math.max(0, Math.min(1, (REST_NOTICE_TICKS - notice.age) / FADE_TICKS));
    this.buttons.visible = false;
    this.releaseButtons();
  }

  private setLines(line: string, sub: string): void {
    const key = `${line}\n${sub}`;
    if (key === this.shown) return;
    this.shown = key;
    this.line.text = line;
    this.sub.text = sub;
    const w = Math.max(this.line.textWidth, this.sub.textWidth) + 2 * PAD;
    const h = sub ? 2 * PAD + 18 : 2 * PAD + 8;
    this.band.clear().rect(Math.round((GAME_WIDTH - w) / 2), TOP, w, h).fill({ color: 0x000000, alpha: BAND_ALPHA });
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
