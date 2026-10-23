import { REST_KINDS } from '../world';
import type { RestKind } from '../world';
import { GAME_HEIGHT, GAME_WIDTH } from '../render/Camera';
import { requestRest } from '../game/Rest';
import { currentParty, SHORT_RESTS_PER_LONG_REST } from '../game/Party';
import { text } from '../core/texts';
import { PopupMenu } from './PopupMenu';

/**
 * The rest button's drop-down: a short rest (with how many are left before a long one is needed) or a long
 * rest. Picking one asks the party for it (game/Rest.ts); the screen then says how it went.
 */
export class RestMenu {
  private readonly menu = new PopupMenu();
  readonly view = this.menu.view;

  /** `x`, `y`: the menu's bottom-left corner (it opens upwards, over the button). */
  constructor(private readonly x: number, private readonly y: number) {}

  get open(): boolean {
    return this.menu.open;
  }

  private label(kind: RestKind): string {
    const left = currentParty()?.shortRestsLeft ?? SHORT_RESTS_PER_LONG_REST;
    return kind === 'short' ? text('hud.rest.short', { left }) : text('hud.rest.long');
  }

  toggle(): void {
    if (this.menu.hide()) return;
    const rows = REST_KINDS.map((kind) => ({ label: this.label(kind), action: () => requestRest(kind) }));
    this.menu.show(rows, this.x, this.y, { w: GAME_WIDTH, h: GAME_HEIGHT }, true);
  }

  /** Closes it; returns whether it was open. */
  hide(): boolean {
    return this.menu.hide();
  }

  destroy(): void {
    this.menu.destroy();
  }
}
