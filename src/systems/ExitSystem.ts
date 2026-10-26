import { world, q, localPlayer } from '../world';
import type { DepartChoice, Entity, Player, PlayerSlot } from '../world';
import { TILE_WIDTH, TILE_HEIGHT } from '../level/TileType';
import { setVisualFrame } from '../render/AnimatedVisual';
import { sound } from '../audio/SoundPlayer';
import { coop } from '../network/CoopSession';
import { text } from '../core/texts';
import { seatOf } from '../game/Party';
import { isStanding } from '../game/Fallen';
import { playerUsing } from './TargetSystem';
import { logLine } from './RollLogSystem';

/**
 * Leaving the level. A hero pressing the exit room's button asks every hero standing in the exit room — and anyone
 * who walks in before it is settled — whether to go on to the next level or end the run there; nobody outside the
 * room is asked. Once every hero in the room has chosen, the party goes deeper if they all chose to, and the run ends
 * if anyone chose to end it. Heroes outside the room when the party goes deeper are left behind, dead, and come back
 * on the next level with nothing (game/Fallen.ts). Should everyone walk out before it is settled, the button can be
 * pressed again.
 */

/** Frame of the exit button once pressed. */
const PRESSED_FRAME = 1;
/** Choices waiting for the next tick, at most this many (a flood from one guest is cut off). */
const MAX_QUEUED = 16;

type ExitState = NonNullable<Entity['exitButton']>;

const buttons = world.with('position', 'exitButton');
const rooms = world.with('room');
const choices: Array<{ slot: PlayerSlot; choice: DepartChoice }> = [];

type Button = (typeof buttons)['entities'][number];

function exitRoom(): NonNullable<Entity['room']> | undefined {
  for (const entity of rooms) if (entity.room.type === 'exit') return entity.room;
  return undefined;
}

/** Whether a hero stands in the exit room, on their feet: the heroes the exit button asks. */
export function inExitRoom(player: Player): boolean {
  const room = exitRoom();
  if (!room || !isStanding(player)) return false;
  const tx = Math.floor(player.position.x / TILE_WIDTH);
  const ty = Math.floor(player.position.y / TILE_HEIGHT);
  const { x, y, w, h } = room.bounds;
  return tx >= x && ty >= y && tx < x + w && ty < y + h;
}

/** The exit button's state as this screen sees it (its own, or the copy a guest was sent); undefined between levels. */
export function departure(): ExitState | undefined {
  for (const button of buttons) return button.exitButton;
  return undefined;
}

/** Host: a seat's choice, counted on the next tick. */
export function chooseDeparture(slot: PlayerSlot, choice: DepartChoice): void {
  if (choices.length < MAX_QUEUED) choices.push({ slot, choice });
}

/** The prompt's buttons: this screen's player chooses, through the host for a guest. */
export function requestDeparture(choice: DepartChoice): void {
  if (coop.role === 'guest') {
    coop.sendCommand({ kind: 'depart', choice });
    return;
  }
  const me = localPlayer();
  if (me) chooseDeparture(seatOf(me), choice);
}

/** Shows the button pressed (kept in the visual too, so co-op guests, who mirror components, see it) or back up. */
function showPressed(button: Button, pressed: boolean): void {
  const col = pressed ? PRESSED_FRAME : 0;
  if (button.visual) button.visual.col = col;
  if (button.visual && button.sprite) setVisualFrame(button.sprite, button.visual.sheet, col, 0);
}

function press(button: Button): void {
  button.exitButton.activated = true;
  button.exitButton.choices = {};
  showPressed(button, true);
  sound.playSound('level_exit', button.position.x, button.position.y);
}

/** Everyone walked out before choosing: the question is dropped, and the button can be pressed again. */
function release(button: Button): void {
  button.exitButton.activated = false;
  button.exitButton.choices = {};
  showPressed(button, false);
}

function playerAt(slot: PlayerSlot): Player | undefined {
  for (const player of q.players) if (seatOf(player) === slot) return player;
  return undefined;
}

/** The choices that came in, from heroes in the exit room who haven't chosen yet. */
function takeChoices(exit: ExitState): void {
  for (const { slot, choice } of choices) {
    const player = playerAt(slot);
    if (player && inExitRoom(player) && !exit.choices[slot]) exit.choices[slot] = choice;
  }
}

/** The party goes deeper: whoever is not in the exit room is left behind, and dies there. */
function leaveBehind(): void {
  for (const player of q.players) {
    if (!isStanding(player) || inExitRoom(player)) continue;
    player.health.current = 0;
    logLine(player, text('roll.left_behind'), 'fumble');
  }
}

/** Once every hero in the exit room has chosen: deeper if they all chose it, the end of the run if anyone did. */
function settle(button: Button): void {
  const exit = button.exitButton;
  let asked = 0;
  let waiting = false;
  let ending = false;
  for (const player of q.players) {
    if (!inExitRoom(player)) continue;
    asked++;
    const choice = exit.choices[seatOf(player)];
    waiting ||= !choice;
    ending ||= choice === 'end';
  }
  if (asked === 0) release(button);
  if (asked === 0 || waiting) return;
  exit.outcome = ending ? 'end' : 'next';
  if (exit.outcome === 'next') leaveBehind();
}

/** Host, each tick: a press of the exit button, the choices that came in, and the decision once everyone asked has made it. */
export function updateExit(): void {
  for (const button of buttons) {
    const exit = button.exitButton;
    if (exit.outcome) continue;
    if (!exit.activated && playerUsing(button)) press(button);
    else if (exit.activated) answer(button);
  }
  choices.length = 0;
}

/** The question is open: the choices that came in, then the decision if everyone asked has made it. */
function answer(button: Button): void {
  takeChoices(button.exitButton);
  settle(button);
}
