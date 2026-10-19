import { Graphics } from 'pixi.js';
import { pointer } from '../systems/InputSystem';
import { crosshairTarget } from '../systems/TargetSystem';

const SIZE = 15;
const HALF = Math.floor(SIZE / 2);
/** Pixels either side of centre left blank, as in Catacomb Snatch. */
const GAP = 1;

const COLORS = {
  none: 0xffffff,
  enemy: 0xff4a3a,
  interact: 0xffd040,
  interactFar: 0x8a8a8a,
} as const;

/** Replaces the OS pointer with a crosshair, tinted by what it's over. */
export class Crosshair {
  readonly graphics = new Graphics();

  constructor() {
    const g = this.graphics;
    g.rect(-HALF, 0, HALF - GAP, 1).fill(0xffffff);
    g.rect(GAP + 1, 0, HALF - GAP, 1).fill(0xffffff);
    g.rect(0, -HALF, 1, HALF - GAP).fill(0xffffff);
    g.rect(0, GAP + 1, 1, HALF - GAP).fill(0xffffff);
  }

  update(): void {
    const p = pointer();
    this.graphics.x = Math.round(p.x);
    this.graphics.y = Math.round(p.y);
    this.graphics.tint = COLORS[crosshairTarget() ?? 'none'];
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
