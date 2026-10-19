import { q } from '../world';
import { GAME_WIDTH, GAME_HEIGHT } from '../render/Camera';
import { Settings } from '../game/Settings';

const keys = new Set<string>();
const pending = new Set<string>();
let pressed = new Set<string>();
let mouseX = 0;
let mouseY = 0;
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

export function pointer(): { x: number; y: number } {
  return { x: mouseX, y: mouseY };
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

function isActionDown(action: string): boolean {
  const b = Settings.bindings[action];
  return b !== undefined && keys.has(b.key);
}

function wasActionPressed(action: string): boolean {
  const b = Settings.bindings[action];
  return b !== undefined && pressed.has(b.key);
}

export function resetInput(): void {
  pending.clear();
  pressed.clear();
}

export function initInput(canvas: HTMLCanvasElement): void {
  if (bound) return;
  bound = true;

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    if (captured) return;
    keys.add(e.code);
    if (!e.repeat) pending.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = ((e.clientX - rect.left) / rect.width) * GAME_WIDTH;
    mouseY = ((e.clientY - rect.top) / rect.height) * GAME_HEIGHT;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { mouseDown = true; clickPending = true; }
    if (e.button === 2) rightDown = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseDown = false;
    if (e.button === 2) rightDown = false;
  });
  window.addEventListener('blur', () => { mouseDown = false; rightDown = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function updateInput(_dt: number): void {
  pressed = new Set(pending);
  pending.clear();
  clicked = clickPending && !captured;
  clickPending = false;

  for (const entity of q.players) {
    const pi = entity.playerInput!;
    pi.up    = isActionDown('up');
    pi.down  = isActionDown('down');
    pi.left  = isActionDown('left');
    pi.right = isActionDown('right');
    pi.sprint = isActionDown('sprint');
    pi.attack = !captured && (mouseDown || isActionDown('attack'));
    pi.use    = !captured && isActionDown('use');
    pi.mouseX = mouseX;
    pi.mouseY = mouseY;
    pi.mouseAiming = true;

    const it = pi.intents;
    it.attack       = !captured && (wasActionPressed('attack') || mouseDown);
    it.cast         = !captured && (wasActionPressed('cast') || rightDown);
    it.use          = wasActionPressed('use');
    it.inventoryOpen = wasActionPressed('inventory');
    it.inventoryUse  = false;
  }
}
