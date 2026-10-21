/**
 * Data describing a side-view character: which sprite strip plays for which
 * state. Strips are horizontal rows of equally sized frames drawn facing right;
 * facing left mirrors them. Frame counts are read from the loaded images.
 */

export const CHARACTER_STATES = ['idle', 'walk', 'run', 'attack', 'cast', 'hurt', 'death'] as const;
export type CharacterState = (typeof CHARACTER_STATES)[number];

export function isCharacterState(value: unknown): value is CharacterState {
  return CHARACTER_STATES.some((state) => state === value);
}

/**
 * What a clip does after its last frame:
 * - `loop`: starts over.
 * - `once`: plays through, then the character falls back to whatever state applies.
 * - `hold`: stays on the last frame for as long as the state applies (death).
 */
export type ClipMode = 'loop' | 'once' | 'hold';

export type ClipDef = {
  /** Image path under /public. */
  src: string;
  /** Ticks each frame is shown. */
  frameTime: number;
  mode: ClipMode;
  /** Frame at which the strike lands, for clips that carry a hit (attacks). */
  impactFrame?: number;
};

export type CharacterDef = {
  id: string;
  frameWidth: number;
  frameHeight: number;
  /** Crop applied to every frame; keep it centred on the body so mirroring stays aligned. */
  trim?: { x: number; y: number; w: number; h: number };
  /** Default draw scale. */
  scale: number;
  /** Row of the source frame (from its top) where the feet touch the ground. */
  feetY: number;
  /** Every strip the character owns, by name. */
  clips: Record<string, ClipDef>;
  /** Which clip plays for each state; states left out are skipped. Every character idles. */
  states: Partial<Record<CharacterState, string>> & { idle: string };
};
