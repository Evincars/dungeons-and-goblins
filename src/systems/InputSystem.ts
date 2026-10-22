import { q } from '../world';
import { GAME_WIDTH, GAME_HEIGHT } from '../render/Camera';
import { bindingFor } from '../game/Settings';
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

/** The quick bar's keys: 1 to 5 along the number row. */
const QUICK_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'] as const;

/** Which quick-bar square's key went down this tick (0 for "1"), or -1. */
export function quickSlotPressed(): number {
  return QUICK_KEYS.findIndex((code) => pressed.has(code));
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
  if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
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

  for (const entity of q.players) {
    // Remote players are driven by their own browser's input frames.
    if (entity.remoteInput) continue;
    const pi = entity.playerInput;
    pi.up    = isActionDown('up');
    pi.down  = isActionDown('down');
    pi.left  = isActionDown('left');
    pi.right = isActionDown('right');
    pi.sprint = isActionDown('sprint');
    pi.attack = !captured && (mouseDown || isActionDown('attack'));
    pi.use    = !captured && isActionDown('use');
    pi.mouseX = mouse.x;
    pi.mouseY = mouse.y;
    pi.mouseAiming = true;

    const it = pi.intents;
    it.attack       = !captured && (wasActionPressed('attack') || mouseDown);
    it.cast         = !captured && (wasActionPressed('cast') || rightDown);
    it.use          = wasActionPressed('use');
    it.inventoryOpen = wasActionPressed('inventory');
  }
}
