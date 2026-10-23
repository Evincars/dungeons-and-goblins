import type { CharacterDef } from './CharacterDef';

/** Two knights for later: the hero knight, and the tall crowned knight from /hooded-knight. */

export const HERO_KNIGHT: CharacterDef = {
  id: 'hero_knight',
  frameWidth: 180,
  frameHeight: 180,
  scale: 0.6,
  feetY: 113,
  headY: 63,
  bodyX: 96,
  clips: {
    idle:   { src: '/hero-knight/Idle.png', frameTime: 6, mode: 'loop' },
    run:    { src: '/hero-knight/Run.png', frameTime: 5, mode: 'loop' },
    attack: { src: '/hero-knight/Attack1.png', frameTime: 3, mode: 'once', impactFrame: 3 },
    cast:   { src: '/hero-knight/Attack2.png', frameTime: 3, mode: 'once' },
    hurt:   { src: '/hero-knight/Take Hit.png', frameTime: 4, mode: 'once' },
    death:  { src: '/hero-knight/Death.png', frameTime: 5, mode: 'hold' },
  },
  states: { idle: 'idle', walk: 'run', run: 'run', attack: 'attack', cast: 'cast', hurt: 'hurt', death: 'death' },
};

/**
 * The crowned knight from /hooded-knight, played as the Warrior. Its attack strip is 180 px wide (the sword
 * reaches out, and the knight spins on frames 8–13) and its power-up (played for casting) 180 px tall, each
 * with the body where the idle has it. The art has no walk or run: those strips are made from the idle
 * frames (each leg swung about its hip through a stride, the body bobbing as the feet pass). It has no hurt
 * or death strips, so it stands when struck.
 */
export const HOODED_KNIGHT: CharacterDef = {
  id: 'hooded_knight',
  frameWidth: 100,
  frameHeight: 100,
  scale: 0.42,
  feetY: 91,
  headY: 9,
  bodyX: 33,
  swingFx: false,
  clips: {
    idle:   { src: '/hooded-knight/hooded_knight_idle.png', frameTime: 8, mode: 'loop' },
    walk:   { src: '/hooded-knight/hooded_knight_walk.png', frameTime: 3, mode: 'loop' },
    run:    { src: '/hooded-knight/hooded_knight_run.png', frameTime: 2, mode: 'loop' },
    attack: { src: '/hooded-knight/hooded_knight_attack.png', frameTime: 2, mode: 'once', impactFrame: 9, frameWidth: 180, bodyX: 33 },
    cast:   { src: '/hooded-knight/hooded_knight_powerup.png', frameTime: 2, mode: 'once', frameHeight: 180, feetY: 169 },
  },
  states: { idle: 'idle', walk: 'walk', run: 'run', attack: 'attack', cast: 'cast' },
};
