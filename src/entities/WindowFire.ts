import { world } from '../world';
import type { Entity } from '../world';
import type { FrameRect } from '../assets/SpriteSheet';

/**
 * Blue fire burning beyond the barred gates set into the catacombs' faces (the fire pack's blue "Group 7 - 4": a strip of
 * 14 frames of 32×64, the flame standing on the frame's foot). It stands just behind the bars, low enough that the gate's
 * sill hides where it rises from: through the window one sees only the flames. Decor every client makes for itself.
 */

const FIRE_SRC = '/fire-pack/Pixel Fire Asset Pack  Colored/Pixel Fire Asset Pack 2 Blue/Group 7 - 4/Group 7 - 4.png';
export const BLUE_FIRE_KEY = 'blue_fire';
const FIRE_FRAME_W = 32;
const FIRE_FRAME_H = 64;
const FIRE_FRAMES = 14;
const FIRE_FRAME_TICKS = 5;
/** It lights the bars and the floor before them a little, coldly. */
const FIRE_GLOW = 44;

/** The strip, cut into its frames (assets/SheetCatalog.ts registers it). */
export function blueFireSheet(): { key: string; src: string; frames: FrameRect[] } {
  return {
    key: BLUE_FIRE_KEY,
    src: FIRE_SRC,
    frames: Array.from({ length: FIRE_FRAMES }, (_, f) => ({ x: f * FIRE_FRAME_W, y: 0, w: FIRE_FRAME_W, h: FIRE_FRAME_H })),
  };
}

/**
 * A blue flame whose foot is `rise` px above (x, y), drawn at depth y (behind whatever is drawn at y or later); `lit`:
 * it also gives off light.
 */
export function createWindowFire(x: number, y: number, rise: number, lit: boolean): Entity {
  const frameX = Math.floor(Math.random() * FIRE_FRAMES);
  return world.add({
    position: { x, y },
    visual: { sheet: BLUE_FIRE_KEY },
    animation: { sheet: BLUE_FIRE_KEY, frameX, frameY: 0, frameCount: FIRE_FRAMES, frameTime: FIRE_FRAME_TICKS, timer: 0, loop: true },
    yOffset: rise + FIRE_FRAME_H / 2,
    ...(lit ? { glow: { radius: FIRE_GLOW, cool: true } } : {}),
    localOnly: true,
  });
}
