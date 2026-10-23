/**
 * Data describing a side-view character: which sprite strip plays for which
 * state. Strips are horizontal rows of equally sized frames drawn facing right;
 * facing left mirrors them, unless the sheets carry a row of their own for each
 * side (`facingRows`). Frame counts are read from the loaded images.
 */

/** `walkAttack` and `runAttack` are swings made on the move; characters without them swing standing. */
export const CHARACTER_STATES = ['idle', 'walk', 'run', 'attack', 'walkAttack', 'runAttack', 'cast', 'hurt', 'death'] as const;
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
  /** This strip's frames, when they differ from the character's (a wider attack). */
  frameWidth?: number;
  frameHeight?: number;
  /**
   * Where the body's middle and the feet are in this strip's frames, when they differ from the character's
   * (a wider or taller strip): the sprite is anchored so the body stays put as the clip changes.
   */
  bodyX?: number;
  feetY?: number;
  /** The sheet is a grid of frames read row by row (instead of a single row). */
  grid?: boolean;
  /** The clip plays only part of its sheet: from this frame, this many (a sheet holding several attacks). */
  firstFrame?: number;
  frameCount?: number;
};

/** A run of frames within a strip. */
export type FrameRun = { first: number; count: number };

/** A caster's spell projectile: the clip its frames come from, the frames it flies and bursts on, and its size. */
export type BoltDef = { clip: string; fly: FrameRun; burst?: FrameRun; scale: number };

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
  /** Row of the source frame where the top of the head is, so health bars float just above it. */
  headY: number;
  /**
   * Sheet rows drawn for each side the character looks to. Four-direction sheets (down, up, left, right)
   * use only their side rows; sheets without this are single rows facing right, mirrored for the left.
   */
  facingRows?: { left: number; right: number };
  /** Column of the source frame (before trimming) where the body's middle is; the sprite turns about it. */
  bodyX?: number;
  /** The art is drawn facing left (everything else faces right). */
  facesLeft?: boolean;
  /** A solid background colour drawn into every strip, made transparent when it loads. */
  keyColor?: number;
  /** Every strip the character owns, by name. */
  clips: Record<string, ClipDef>;
  /** Its art swings its own blade, so the generic sword-swing effect is not drawn over it (default: drawn). */
  swingFx?: boolean;
  /** What its spell flies as (default: the generic spell bolt). */
  bolt?: BoltDef;
  /** Which clip plays for each state; states left out are skipped. Every character idles. */
  states: Partial<Record<CharacterState, string>> & { idle: string };
};
