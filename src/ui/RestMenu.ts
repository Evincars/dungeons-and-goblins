import { REST_KINDS } from '../world';
import type { Player, RestKind } from '../world';
import { GAME_HEIGHT, GAME_WIDTH } from '../render/Camera';
import { requestRest, requestRestDice } from '../game/Rest';
import { currentParty, SHORT_RESTS_PER_LONG_REST } from '../game/Party';
import { heroClass } from '../rules/Classes';
import { text } from '../core/texts';
import { PopupMenu } from './PopupMenu';
import type { MenuRow } from './PopupMenu';

/**
 * The rest button's drop-down: a short rest (with how many are left before a long one is needed, and beside it
 * how many hit dice to spend in it) or a long rest. Picking one asks the party for it (game/Rest.ts); the screen
 * then says how it went. After a short rest someone else asked for, it opens by itself with the hit dice to spend.
 */
export class RestMenu {
  private readonly menu = new PopupMenu();
  readonly view = this.menu.view;
  /** Whether this hero's hit dice were last seen waiting to be chosen (so the menu opens once for them). */
  private diceWaiting = false;

  /** `x`, `y`: the menu's bottom-left corner (it opens upwards, over the button). */
  constructor(private readonly x: number, private readonly y: number) {}

  get open(): boolean {
    return this.menu.open;
  }

  /** `count` hit dice to spend, then `choose` it: none, then one, two, … up to all the hero has left. */
  private diceRows(hero: Player, choose: (count: number) => void): MenuRow[] {
    const die = heroClass(hero.heroClass).hitDie;
    const rows: MenuRow[] = [{ label: text('hud.rest.no_dice'), action: () => choose(0) }];
    for (let count = 1; count <= hero.playerStats.hitDice; count++) {
      rows.push({ label: text('hud.rest.spend_dice', { count, dice: `${count}d${die}` }), action: () => choose(count) });
    }
    return rows;
  }

  private row(kind: RestKind, hero: Player | undefined): MenuRow {
    if (kind === 'long') return { label: text('hud.rest.long'), action: () => requestRest('long') };
    const left = currentParty()?.shortRestsLeft ?? SHORT_RESTS_PER_LONG_REST;
    const label = text('hud.rest.short', { left });
    if (!hero || hero.playerStats.hitDice <= 0) return { label, action: () => requestRest('short', 0) };
    return { label, action: null, submenu: this.diceRows(hero, (count) => requestRest('short', count)) };
  }

  /** The rest button: the rests to ask for — or, while this hero's short-rest hit dice wait, those. */
  toggle(hero: Player | undefined): void {
    if (this.menu.hide()) return;
    if (hero?.playerStats.restDiceOpen) {
      this.offerDice(hero);
      return;
    }
    this.menu.show(REST_KINDS.map((kind) => this.row(kind, hero)), this.x, this.y, { w: GAME_WIDTH, h: GAME_HEIGHT }, true);
  }

  /** A short rest is under way: how many of this hero's hit dice to spend in it. */
  private offerDice(hero: Player): void {
    this.menu.show(this.diceRows(hero, (count) => requestRestDice(hero, count)), this.x, this.y, { w: GAME_WIDTH, h: GAME_HEIGHT }, true);
  }

  /** Each frame: when a short rest leaves this hero's hit dice waiting, the menu opens by itself to ask. */
  update(hero: Player | undefined): void {
    const waiting = !!hero?.playerStats.restDiceOpen;
    if (hero && waiting && !this.diceWaiting) this.offerDice(hero);
    this.diceWaiting = waiting;
  }

  /** Closes it; returns whether it was open. */
  hide(): boolean {
    return this.menu.hide();
  }

  destroy(): void {
    this.menu.destroy();
  }
}
