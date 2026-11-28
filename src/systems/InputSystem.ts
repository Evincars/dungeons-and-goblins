import { q, QUICK_ROW, QUICK_SLOTS } from '../world';
import { GAME_WIDTH, GAME_HEIGHT } from '../render/Camera';
import { bindingFor, QUICK_KEYS } from '../game/Settings';
import type { ActionName } from '../game/Settings';
import { cancelThrow, noteThrowClick, readiedThrow } from '../game/ThrowAim';

const LEFT_BUTTON = 0;
const RIGHT_BUTTON = 2;

const keys = new Set<string>();
const pending = new Set<string>();
/** Keys first pressed since the previous tick; refilled from `pending` each tick (never reallocated). */
const pressed = new Set<string>();
/** Keys let go since the previous tick, and those of this tick (as `pending` and `pressed`). */
const pendingLifts = new Set<string>();
const lifted = new Set<string>();
/** The quick-bar key held down and the square it picked (its aim guide shows while it is held; let go, it casts). */
let heldCode: string | null = null;
let heldSlot = -1;
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
/** A panel is open (the inventory, the shop, a HUD dialog, the rest menu): no click is an attack or a cast, wherever it lands. */
let panelsOpen = false;
/**
 * A button press that began on a control or while a panel was open is the interface's: it fights nobody, even once the
 * panel it closed is gone, until the button is let go.
 */
let leftForUi = false;
let rightForUi = false;

/** The level says whether one of its panels is open (every frame). */
export function setPanelsOpen(open: boolean): void {
  panelsOpen = open;
}

/** Whether a press now would be the interface's: over a control, or with a panel open. */
const uiTakesPress = (): boolean => panelsOpen || pointerOwners.size > 0;

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

/** How many of the quick bar's squares are shown (game/profile/QuickBarProfile.ts): the keys past them do nothing. */
let quickSquaresShown = QUICK_ROW;

/** The bar shows this many squares now; a square picked past them goes back to the first. */
export function setQuickSquaresShown(count: number): void {
  quickSquaresShown = count;
  if (chosenSlot % QUICK_ROW >= count) chosenSlot = 0;
}

/** A quick-bar key that went down this tick picks its square (with Shift, the one in the second row) and is held. */
function holdQuickKey(): void {
  const usable = Math.min(QUICK_KEYS.length, quickSquaresShown);
  for (let i = 0; i < usable; i++) {
    if (!pressed.has(QUICK_KEYS[i])) continue;
    heldCode = QUICK_KEYS[i];
    heldSlot = i + quickRow() * QUICK_ROW;
    chooseQuickSlot(heldSlot);
    return;
  }
}

/** The square whose held quick-bar key was let go this tick (it casts now), or -1. */
function quickKeyLetGo(): number {
  if (heldCode === null || !lifted.has(heldCode)) return -1;
  heldCode = null;
  return heldSlot;
}

/** The quick-bar square whose key is held down now (its aim guide shows), or -1. */
export function heldQuickSlot(): number {
  return heldCode === null ? -1 : heldSlot;
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
  pendingLifts.clear();
  lifted.clear();
  heldCode = null;
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
  if (e.button === LEFT_BUTTON) {
    mouseDown = true;
    clickPending = true;
    leftForUi = uiTakesPress();
  }
  if (e.button === RIGHT_BUTTON) {
    rightDown = true;
    rightForUi = uiTakesPress();
  }
}

function onMouseUp(e: MouseEvent): void {
  if (e.button === LEFT_BUTTON) mouseDown = leftForUi = false;
  if (e.button === RIGHT_BUTTON) rightDown = rightForUi = false;
}

export function initInput(canvas: HTMLCanvasElement): void {
  if (bound) return;
  bound = true;

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (!captured) pendingLifts.add(e.code);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    heldCode = null;
  });

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

/**
 * A throw held ready (game/ThrowAim.ts) takes the next press on the world: a left click throws it (and fights nobody while
 * held), a right click puts it away (and casts nothing).
 */
function aimThrow(): void {
  if (!readiedThrow() || !pointerFree() || panelsOpen) return;
  if (clicked && !leftForUi) {
    noteThrowClick();
    leftForUi = true;
  }
  if (rightDown && !rightForUi) {
    cancelThrow();
    rightForUi = true;
  }
}

/** Turns the keyboard and mouse into each player's input and one-tick intents (the Command pattern). */
export function updateInput(): void {
  pressed.clear();
  for (const code of pending) pressed.add(code);
  pending.clear();
  lifted.clear();
  for (const code of pendingLifts) lifted.add(code);
  pendingLifts.clear();
  clicked = clickPending && !captured;
  clickPending = false;
  if (!captured) aimThrow();
  // A quick-bar key picks its square while held, showing where it would go; let go, it casts (a click on a square only picks it).
  if (!captured) holdQuickKey();
  const quickCast = captured ? -1 : quickKeyLetGo();

  for (const entity of q.players) {
    // Remote players are driven by their own browser's input frames.
    if (entity.remoteInput) continue;
    const pi = entity.playerInput;
    pi.up    = isActionDown('up');
    pi.down  = isActionDown('down');
    pi.left  = isActionDown('left');
    pi.right = isActionDown('right');
    pi.sprint = isActionDown('sprint');
    // A mouse button fights only when it was pressed on the world, with no panel open and no control under the pointer.
    const mouseFree = pointerFree() && !panelsOpen;
    const leftFights = mouseDown && mouseFree && !leftForUi;
    const rightFights = rightDown && mouseFree && !rightForUi;
    pi.attack = !captured && (leftFights || isActionDown('attack'));
    pi.use    = !captured && isActionDown('use');
    pi.mouseX = mouse.x;
    pi.mouseY = mouse.y;
    pi.mouseAiming = true;
    pi.spellSlot = chosenSlot;

    const it = pi.intents;
    it.attack       = !captured && (wasActionPressed('attack') || leftFights);
    it.cast         = !captured && (wasActionPressed('cast') || quickCast >= 0 || rightFights);
    it.use          = wasActionPressed('use');
    it.inventoryOpen = wasActionPressed('inventory');
    it.swap         = !captured && wasActionPressed('swap');
  }
}
