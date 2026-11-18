/**
 * The trader who stands in the safe rooms (public/trader): its clips, strips of 128 px frames, each frame shown this
 * many ticks. It idles (one of three idles, picked at random after each); when a hero opens its trade panel it throws
 * its coat open on its wares and holds it open, and closes it when the panel closes, nodding if they traded
 * (systems/TraderSystem.ts).
 */

export const TRADER_CLIPS = ['idle', 'idle2', 'idle3', 'dialogue', 'approval'] as const;
export type TraderClip = (typeof TRADER_CLIPS)[number];

/** Each clip's file in public/trader, its texture key and its frame count. */
export const TRADER_FILES = { idle: 'Idle', idle2: 'Idle_2', idle3: 'Idle_3', dialogue: 'Dialogue', approval: 'Approval' } as const satisfies Record<TraderClip, string>;
export const TRADER_SHEETS = {
  idle: 'trader_idle', idle2: 'trader_idle2', idle3: 'trader_idle3', dialogue: 'trader_dialogue', approval: 'trader_approval',
} as const satisfies Record<TraderClip, string>;
export const TRADER_FRAMES = { idle: 6, idle2: 11, idle3: 7, dialogue: 16, approval: 8 } as const satisfies Record<TraderClip, number>;

/** A frame of the strips is this big; the trader stands on its foot. */
export const TRADER_FRAME = 128;
/** Drawn at this scale, the trader stands a little taller than the heroes. */
export const TRADER_SCALE = 0.55;
/**
 * What of a frame the trader's figure fills (measured from the strips, coat open), in frame pixels: the corner brackets
 * frame it rather than the whole mostly empty frame.
 */
export const TRADER_FIGURE = { x0: 38, y0: 57, x1: 84, y1: TRADER_FRAME } as const;
/** Each frame shows this many ticks (10 a second). */
export const TRADER_FRAME_TICKS = 6;
/** Of the idles, the plain one comes this often; the other two share the rest. */
export const PLAIN_IDLE_SHARE = 0.6;
/**
 * The dialogue clip's parts: its first frames throw the coat open (up to COAT_OPEN), the next few hold it open (played
 * back and forth while the panel is open), the rest close it.
 */
export const COAT_OPEN = 8;
export const COAT_HELD_LAST = 10;
/** Held open, each frame shows this many ticks (a slow sway). */
export const COAT_HELD_TICKS = 12;

