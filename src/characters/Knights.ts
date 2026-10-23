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
 * reaches out) and its power-up (played for casting) 180 px tall, each with the body where the idle has it;
 * it has no walk, hurt or death strips, so it glides in its idle pose and simply stands when struck.
 */
export const HOODED_KNIGHT: CharacterDef = {
  id: 'hooded_knight',
  frameWidth: 100,
  frameHeight: 100,
  scale: 0.42,
  feetY: 91,
  headY: 9,
  bodyX: 33,
  clips: {
    idle:   { src: '/hooded-knight/hooded_knight_idle.png', frameTime: 7, mode: 'loop' },
    attack: { src: '/hooded-knight/hooded_knight_attack.png', frameTime: 1, mode: 'once', impactFrame: 9, frameWidth: 180, bodyX: 33 },
    cast:   { src: '/hooded-knight/hooded_knight_powerup.png', frameTime: 1, mode: 'once', frameHeight: 180, feetY: 169 },
  },
  states: { idle: 'idle', walk: 'idle', run: 'idle', attack: 'attack', cast: 'cast' },
};
