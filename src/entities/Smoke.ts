import { world } from '../world';
import type { Entity } from '../world';
import type { FrameRect } from '../assets/SpriteSheet';

/**
 * Smoke curling up (the fire pack's "Smoke 5": a strip of 14 frames of 48×112, a thin column rising and swaying) over
 * the safe rooms' campfires. Decor every client makes for itself, looping forever. (The portals breathe mist instead,
 * systems/MistSystem.ts.)
 */

const SMOKE_SRC = '/fire-pack/Pixel Fire Asset Pack  Colored/Pixel Fire Asset Pack 2 Smokes/Smoke 5/Smoke 5.png';
export const SMOKE_KEY = 'smoke';
const SMOKE_FRAME_W = 48;
const SMOKE_FRAME_H = 112;
const SMOKE_FRAMES = 14;
/** The column's foot lies this far below the frame's middle (measured from the art). */
const SMOKE_FOOT = 52;
const SMOKE_FRAME_TICKS = 6;

/** How the smoke over a campfire looks: its size, how see-through, and how high its foot. */
export type SmokeLook = { scale: number; alpha: number; rise: number };
/** Over a campfire: a thin, pale column from just above its flames. */
export const CAMPFIRE_SMOKE: SmokeLook = { scale: 0.55, alpha: 0.5, rise: 22 };
/** Drawn just in front of what it rises from. */
const IN_FRONT = 0.5;

/** The smoke strip, cut into its frames (assets/SheetCatalog.ts registers it). */
export function smokeSheet(): { key: string; src: string; frames: FrameRect[] } {
  return {
    key: SMOKE_KEY,
    src: SMOKE_SRC,
    frames: Array.from({ length: SMOKE_FRAMES }, (_, f) => ({ x: f * SMOKE_FRAME_W, y: 0, w: SMOKE_FRAME_W, h: SMOKE_FRAME_H })),
  };
}

/** A column of smoke whose foot is `look.rise` px above (x, y), looping from a random frame. */
export function createSmoke(x: number, y: number, look: SmokeLook): Entity {
  return world.add({
    position: { x, y: y + IN_FRONT },
    visual: { sheet: SMOKE_KEY, scale: look.scale, alpha: look.alpha },
    animation: {
      sheet: SMOKE_KEY, frameX: Math.floor(Math.random() * SMOKE_FRAMES), frameY: 0, frameCount: SMOKE_FRAMES,
      frameTime: SMOKE_FRAME_TICKS, timer: Math.floor(Math.random() * SMOKE_FRAME_TICKS), loop: true,
    },
    yOffset: look.rise + IN_FRONT + SMOKE_FOOT * look.scale,
    localOnly: true,
  });
}
