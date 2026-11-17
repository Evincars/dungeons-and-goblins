import { Sprite } from 'pixi.js';
import type { Application, Texture } from 'pixi.js';
import { frameTexture } from '../render/Sheets';
import type { CrosshairTarget } from '../systems/TargetSystem';

/**
 * The game's own pointer, drawn over everything in place of the OS one (public/ui/pointer.png, made from
 * public/dng-pointer.png by scripts/pointer-sheet.py): a skeletal hand over menus, the HUD and the inventory, pressing
 * (sparks at its fingertip) over anything clickable; in the world the battle cross, red over an enemy.
 */

/**
 * The frames of the pointer sheet, in its order: each one's hot spot (in the sheet's pixels; keep in step with the
 * script) and how big its frame is drawn, in game pixels (the hand fills less of its frame than the cross; the old
 * crosshair was 15).
 */
const POINTER_FRAMES = {
  hand: { frame: 0, x: 15, y: 16, size: 30 },
  hand_press: { frame: 1, x: 15, y: 19, size: 30 },
  cross: { frame: 2, x: 33, y: 36, size: 18 },
  cross_enemy: { frame: 3, x: 32, y: 36, size: 18 },
} as const satisfies Record<string, { frame: number; x: number; y: number; size: number }>;
type PointerLook = keyof typeof POINTER_FRAMES;

const SHEET_FRAME = 64;
/** Something usable but out of reach: the cross is dimmed. */
const OUT_OF_REACH_TINT = 0x8a8a8a;
/** Pixi's cursor modes the game's controls use: over these the hand presses. */
const CLICKABLE_MODES = ['pointer', 'grab'] as const;

/**
 * What the pointer is over in the world, asked once a frame: 'ui' while a menu or panel has it, otherwise what the
 * crosshair is over (systems/TargetSystem.ts). Unset outside a level: the hand.
 */
export type PointerAim = () => CrosshairTarget | 'ui';
let aim: PointerAim | null = null;

/** The level installs what its pointer aims at; it clears it (null) only while the hook is still its own. */
export function setPointerAim(next: PointerAim | null, owner?: PointerAim): void {
  if (next === null && owner !== undefined && aim !== owner) return;
  aim = next;
}

/** The look for what the pointer is over: the cross in the world (red on an enemy), else the hand (pressing over a control). */
function lookFor(target: CrosshairTarget | 'ui', clickable: boolean): PointerLook {
  if (target === 'ui') return clickable ? 'hand_press' : 'hand';
  return target === 'enemy' ? 'cross_enemy' : 'cross';
}

export class Pointer {
  private readonly sprite = new Sprite();
  private readonly textures = new Map<PointerLook, Texture>();
  /** The control under the pointer is clickable (Pixi's cursor mode for it). */
  private clickable = false;
  /** The pointer is over the page (it hides once it leaves; moving over an HTML text box laid on the canvas still counts). */
  private inside = false;
  private readonly onMove = () => { this.inside = true; };
  private readonly onLeave = () => { this.inside = false; };

  constructor(private readonly app: Application) {
    this.sprite.eventMode = 'none';
    this.sprite.visible = false;
    this.watchCursorModes();
    app.canvas.style.cursor = 'none';
    window.addEventListener('pointermove', this.onMove);
    document.documentElement.addEventListener('pointerleave', this.onLeave);
    app.ticker.add(this.draw, this);
  }

  /**
   * Pixi sets the canvas's CSS cursor for the control under the pointer: instead, note whether it is clickable and keep
   * the OS pointer hidden.
   */
  private watchCursorModes(): void {
    const styles = this.app.renderer.events.cursorStyles;
    styles.default = () => { this.clickable = false; };
    for (const mode of CLICKABLE_MODES) styles[mode] = () => { this.clickable = true; };
  }

  private texture(look: PointerLook): Texture {
    let texture = this.textures.get(look);
    if (!texture || texture.width === 0) {
      texture = frameTexture('pointer', POINTER_FRAMES[look].frame, 0);
      this.textures.set(look, texture);
    }
    return texture;
  }

  /** Once a frame: on top of whatever the scenes put on the stage, at the pointer, in the look for what it is over. */
  private draw(): void {
    const stage = this.app.stage;
    if (stage.children[stage.children.length - 1] !== this.sprite) stage.addChild(this.sprite);
    this.sprite.visible = this.inside;
    if (!this.inside) return;
    const target = aim ? aim() : 'ui';
    const look = lookFor(target, this.clickable);
    const spot = POINTER_FRAMES[look];
    this.sprite.texture = this.texture(look);
    this.sprite.pivot.set(spot.x, spot.y);
    this.sprite.scale.set(spot.size / SHEET_FRAME);
    this.sprite.tint = target === 'interactFar' ? OUT_OF_REACH_TINT : 0xffffff;
    const at = this.app.renderer.events.pointer.global;
    this.sprite.position.set(at.x, at.y);
  }
}
