import { world } from '../world';
import type { Entity } from '../world';
import type { FrameRect } from '../assets/SpriteSheet';
import { characterDef, headAboveFeet } from '../characters/Characters';
import { spawnFx } from './FxFactory';

/**
 * Blood spattering from whoever a blow or a spell's attack hurts (public/blood): five splashes, each a 6×6 grid of
 * 100 px frames that bursts and thins away (the frames past its end are empty). One is picked at random for each hit,
 * drawn small, in front of the one hit and moving with them, at the middle of their body.
 */

export const BLOOD_FRAME = 100;
const BLOOD_COLS = 6;
/** Each splash's frames before its strip runs empty (measured from the art). */
const BLOOD_FRAMES = [22, 21, 24, 13, 30] as const;
/** The splashes' texture keys: blood_1…blood_5. */
export const BLOOD_KEYS = BLOOD_FRAMES.map((_, i) => `blood_${i + 1}`);

/** Each splash's frames, read row by row from its grid, as one strip (assets/SheetCatalog.ts registers them). */
export function bloodSheets(): Array<{ key: string; src: string; frames: FrameRect[] }> {
  return BLOOD_FRAMES.map((count, i) => ({
    key: BLOOD_KEYS[i],
    src: `/blood/${i + 1}_100x100px.png`,
    frames: Array.from({ length: count }, (_, f) => ({
      x: (f % BLOOD_COLS) * BLOOD_FRAME, y: Math.floor(f / BLOOD_COLS) * BLOOD_FRAME, w: BLOOD_FRAME, h: BLOOD_FRAME,
    })),
  }));
}

/** Drawn this small (a splash is about a quarter of its frame), a little bigger or smaller each time. */
const BLOOD_SCALE = 0.32;
const BLOOD_SCALE_SPREAD = 0.12;
/** Each frame shows this many ticks. */
const BLOOD_FRAME_TICKS = 2;
/** It bursts from this share of the body's height over the feet (the middle of the chest), give or take a few pixels. */
const BODY_SHARE = 0.55;
const BODY_SPREAD = 6;
/** For a body with no character art to measure: this tall. */
const DEFAULT_HEIGHT = 32;
/** Drawn just in front of the one hit. */
const IN_FRONT = 0.5;

function bodyHeight(target: Entity): number {
  const character = target.character;
  return character ? headAboveFeet(characterDef(character.def), target.visual?.scale) : DEFAULT_HEIGHT;
}

/** Whether a hit draws blood: heroes and foes do, training dummies and things do not. */
export function bleeds(target: Entity): boolean {
  return !!target.position && (target.playerStats !== undefined || target.mobType !== undefined);
}

/** A splash of blood from a body that was hit, in front of it and moving with it while it plays. */
export function spawnBlood(target: Entity): void {
  const pos = target.position;
  if (!pos) return;
  const pick = Math.floor(Math.random() * BLOOD_FRAMES.length);
  const frames = BLOOD_FRAMES[pick];
  const spread = (Math.random() * 2 - 1) * BODY_SPREAD;
  spawnFx(pos.x + spread, pos.y, BLOOD_KEYS[pick], frames, frames * BLOOD_FRAME_TICKS, {
    scale: BLOOD_SCALE + (Math.random() * 2 - 1) * BLOOD_SCALE_SPREAD,
    yOffset: bodyHeight(target) * BODY_SHARE + spread / 2,
    orderId: world.id(target),
    orderBias: IN_FRONT,
    follow: world.id(target),
  });
}
