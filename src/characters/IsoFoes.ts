import type { CharacterDef, ClipDef } from './CharacterDef';

/**
 * The enemies drawn for the isometric castle (/castle-izometric): each is one strip of 48×48 frames facing right,
 * its clips in a row — idle, walk, attack, hurt, death — so every clip is a run of the one sheet.
 */

const DIR = '/castle-izometric/PSD';
const FRAME = 48;

type Runs = { idle: number; walk: number; attack: number; hurt: number; death: number };

/** The clips of a strip whose runs follow one another in the order of `runs`, each `frameTime` ticks a frame. */
function stripClips(src: string, runs: Runs, impactFrame: number): Record<keyof Runs, ClipDef> {
  let first = 0;
  const run = (count: number, frameTime: number, mode: ClipDef['mode']): ClipDef => {
    const clip: ClipDef = { src, frameTime, mode, firstFrame: first, frameCount: count };
    first += count;
    return clip;
  };
  return {
    idle: run(runs.idle, 8, 'loop'),
    walk: run(runs.walk, 6, 'loop'),
    attack: { ...run(runs.attack, 4, 'once'), impactFrame },
    hurt: run(runs.hurt, 4, 'once'),
    death: run(runs.death, 6, 'hold'),
  };
}

const STATES = { idle: 'idle', walk: 'walk', run: 'walk', attack: 'attack', hurt: 'hurt', death: 'death' } as const;

/** A shade: a hooded wraith of teal rags trailing thorny tendrils, which lashes out in a spray of blood. */
export const SHADE: CharacterDef = {
  id: 'shade',
  frameWidth: FRAME,
  frameHeight: FRAME,
  scale: 1,
  feetY: 44,
  headY: 7,
  bodyX: 20,
  clips: stripClips(`${DIR}/enemy1/enemy1_spritesheet.png`, { idle: 4, walk: 5, attack: 7, hurt: 4, death: 6 }, 4),
  states: STATES,
};

/**
 * A grick: a pale, segmented worm that rears up and spits. (Its spat ball, ball-01…03 and its burst ball-hit-01…02,
 * waits for enemies that shoot; for now it bites like the rest.) The strip's last frame, its head alone, is not played.
 */
export const GRICK: CharacterDef = {
  id: 'grick',
  frameWidth: FRAME,
  frameHeight: FRAME,
  scale: 1,
  feetY: 40,
  headY: 11,
  bodyX: 24,
  clips: stripClips(`${DIR}/enemy2/enemy2_spritesheet.png`, { idle: 4, walk: 5, attack: 6, hurt: 3, death: 5 }, 3),
  states: STATES,
};
