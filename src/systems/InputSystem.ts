import { q, QUICK_ROW, QUICK_SLOTS } from '../world';
import { GAME_WIDTH, GAME_HEIGHT } from '../render/Camera';
import { bindingFor, QUICK_KEYS } from '../game/Settings';
import type { ActionName } from '../game/Settings';

const LEFT_BUTTON = 0;
const RIGHT_BUTTON = 2;

const keys = new Set<string>();
const pending = new Set<string>();
/** Keys first pressed since the previous tick; refilled from `pending` each tick (never reallocated). */
const pressed = new Set<string>();
/** Pointer position in game pixels; handed out read-only so callers allocate nothing. */
const mouse = { x: 0, y: 0 };
let mouseDown = false;
let rightDown = false;
let clickPending = false;
let clicked = false;
let bound = false;
let captured = false;

/** On-screen controls under the pointer (HUD buttons, the combat log, a dialog): their clicks are not attacks. */
const pointerOwners = new Set<object>();

/** A control says the pointer is over it (or has left); while any is under it, mouse buttons don't fight. */
export function claimPointer(owner: object, over: boolean): void {
  if (over) pointerOwners.add(owner);
  else pointerOwners.delete(owner);
}

/** Whether no on-screen control (or panel laid over the screen) has the pointer: a click there is for the world. */
export function pointerFree(): boolean {
  return pointerOwners.size === 0;
}

export function setInputCaptured(on: boolean): void {
  captured = on;
  keys.clear();
  resetInput();
}

export function pointer(): Readonly<{ x: number; y: number }> {
  return mouse;
}

/** True on the tick the left mouse button went down. */
export function wasClicked(): boolean {
  return clicked;
}

export function isMouseDown(): boolean {
  return mouseDown;
}

export function isKeyDown(code: string): boolean {
  return keys.has(code);
}

function isActionDown(action: ActionName): boolean {
  return keys.has(bindingFor(action));
}

/**
 * The quick-bar square this screen's player has picked. It is kept here, not only on the player: a guest's
 * copy of its character is overwritten by every update from the host.
 */
let chosenSlot = 0;

/** Shift (either one) held: the quick bar's keys reach its second row, and the bar shows that row. */
function shiftHeld(): boolean {
  return keys.has('ShiftLeft') || keys.has('ShiftRight');
}

/** Alt (either one) held: tooltips show the whole story of what they tell about. */
export function isAltHeld(): boolean {
  return keys.has('AltLeft') || keys.has('AltRight');
}

/** The quick-bar row the keys reach now: 0, or 1 while Shift is held. */
export function quickRow(): number {
  return !captured && shiftHeld() ? 1 : 0;
}

/** Which quick-bar square's key went down this tick (with Shift, the square in the second row), or -1. */
function quickSlotPressed(): number {
  for (let i = 0; i < QUICK_KEYS.length; i++) if (pressed.has(QUICK_KEYS[i])) return i + quickRow() * QUICK_ROW;
  return -1;
}

/** The quick-bar square picked on this screen (shown at once, before a guest's host has heard of it). */
export function chosenQuickSlot(): number {
  return chosenSlot;
}

/** Picks a quick-bar square (a click on it); its key does the same and casts it too. */
export function chooseQuickSlot(slot: number): void {
  if (Number.isInteger(slot) && slot >= 0 && slot < QUICK_SLOTS) chosenSlot = slot;
}

function wasActionPressed(action: ActionName): boolean {
  return pressed.has(bindingFor(action));
}

export function resetInput(): void {
  pending.clear();
  pressed.clear();
  clickPending = false;
  clicked = false;
  mouseDown = false;
  rightDown = false;
}

function onKeyDown(e: KeyboardEvent): void {
  // Alt alone would move the browser's focus to its menu bar; here it opens tooltips' whole story.
  if (e.code === 'Space' || e.code === 'Tab' || e.code === 'AltLeft' || e.code === 'AltRight') e.preventDefault();
  if (captured) return;
  keys.add(e.code);
  if (!e.repeat) pending.add(e.code);
}

function onMouseDown(e: MouseEvent): void {
  if (e.button === LEFT_BUTTON) { mouseDown = true; clickPending = true; }
  if (e.button === RIGHT_BUTTON) rightDown = true;
}

function onMouseUp(e: MouseEvent): void {
  if (e.button === LEFT_BUTTON) mouseDown = false;
  if (e.button === RIGHT_BUTTON) rightDown = false;
}

export function initInput(canvas: HTMLCanvasElement): void {
  if (bound) return;
  bound = true;

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * GAME_WIDTH;
    mouse.y = ((e.clientY - rect.top) / rect.height) * GAME_HEIGHT;
  });
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', () => { mouseDown = false; rightDown = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

/** Turns the keyboard and mouse into each player's input and one-tick intents (the Command pattern). */
export function updateInput(): void {
  pressed.clear();
  for (const code of pending) pressed.add(code);
  pending.clear();
  clicked = clickPending && !captured;
  clickPending = false;
  // A quick-bar key picks its square and casts it at once (a click on a square only picks it).
  const quickCast = captured ? -1 : quickSlotPressed();
  chooseQuickSlot(quickCast);

  for (const entity of q.players) {
    // Remote players are driven by their own browser's input frames.
    if (entity.remoteInput) continue;
    const pi = entity.playerInput;
    pi.up    = isActionDown('up');
    pi.down  = isActionDown('down');
    pi.left  = isActionDown('left');
    pi.right = isActionDown('right');
    pi.sprint = isActionDown('sprint');
    const mouseFree = pointerFree();
    pi.attack = !captured && ((mouseDown && mouseFree) || isActionDown('attack'));
    pi.use    = !captured && isActionDown('use');
    pi.mouseX = mouse.x;
    pi.mouseY = mouse.y;
    pi.mouseAiming = true;
    pi.spellSlot = chosenSlot;

    const it = pi.intents;
    it.attack       = !captured && (wasActionPressed('attack') || (mouseDown && mouseFree));
    it.cast         = !captured && (wasActionPressed('cast') || quickCast >= 0 || (rightDown && mouseFree));
    it.use          = wasActionPressed('use');
    it.inventoryOpen = wasActionPressed('inventory');
    it.swap         = !captured && wasActionPressed('swap');
  }
}
