/**
 * The trader who stands in the safe rooms (public/trader): its clips, strips of 128 px frames, each frame shown this
 * many ticks. It idles (one of three idles, picked at random after each), talks while a hero has its trade panel open,
 * and nods after a trade (systems/TraderSystem.ts).
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
/** Each frame shows this many ticks (10 a second). */
export const TRADER_FRAME_TICKS = 6;
/** Of the idles, the plain one comes this often; the other two share the rest. */
export const PLAIN_IDLE_SHARE = 0.6;
