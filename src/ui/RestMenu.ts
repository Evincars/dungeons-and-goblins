import { REST_KINDS } from '../world';
import type { Player, RestKind } from '../world';
import { GAME_HEIGHT, GAME_WIDTH } from '../render/Camera';
import { hitDiceLabel, requestRest } from '../game/Rest';
import { currentParty, SHORT_RESTS_PER_LONG_REST } from '../game/Party';
import { text } from '../core/texts';
import { PopupMenu } from './PopupMenu';
import type { MenuRow } from './PopupMenu';

/**
 * How many of the hero's hit dice to spend in a short rest, then `choose` it: none, then one, two, … up to all they
 * have left, each shown as it rolls (the class's die + CON a die: "2d8+4").
 */
export function hitDiceRows(hero: Player, choose: (count: number) => void): MenuRow[] {
  const rows: MenuRow[] = [{ label: text('hud.rest.no_dice'), action: () => choose(0) }];
  for (let count = 1; count <= hero.playerStats.hitDice; count++) {
    rows.push({ label: text('hud.rest.spend_dice', { count, dice: hitDiceLabel(hero, count) }), action: () => choose(count) });
  }
  return rows;
}

/**
 * The rest button's drop-down: a short rest (with how many are left before a long one is needed, and beside it
 * how many hit dice to spend in it) or a long rest. Picking one asks the party for it (game/Rest.ts); the screen
 * then says how it went. The others choose their own hit dice as they agree (ui/PartyBanner.ts).
 */
export class RestMenu {
  private readonly menu = new PopupMenu();
  readonly view = this.menu.view;

  /** `x`, `y`: the menu's bottom-left corner (it opens upwards, over the button). */
  constructor(private readonly x: number, private readonly y: number) {}

  get open(): boolean {
    return this.menu.open;
  }

  private row(kind: RestKind, hero: Player | undefined): MenuRow {
    if (kind === 'long') return { label: text('hud.rest.long'), action: () => requestRest('long') };
    const left = currentParty()?.shortRestsLeft ?? SHORT_RESTS_PER_LONG_REST;
    const label = text('hud.rest.short', { left });
    if (!hero || hero.playerStats.hitDice <= 0) return { label, action: () => requestRest('short', 0) };
    return { label, action: null, submenu: hitDiceRows(hero, (count) => requestRest('short', count)) };
  }

  /** The rest button: the rests to ask for. */
  toggle(hero: Player | undefined): void {
    if (this.menu.hide()) return;
    this.menu.show(REST_KINDS.map((kind) => this.row(kind, hero)), this.x, this.y, { w: GAME_WIDTH, h: GAME_HEIGHT }, true);
  }

  /** Closes it; returns whether it was open. */
  hide(): boolean {
    return this.menu.hide();
  }

  destroy(): void {
    this.menu.destroy();
  }
}
