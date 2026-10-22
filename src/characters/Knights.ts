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

/** Its attack frames are 102 px wide (the rest 100), and it has no walk: it glides in its idle pose. */
export const HOODED_KNIGHT: CharacterDef = {
  id: 'hooded_knight',
  frameWidth: 100,
  frameHeight: 100,
  scale: 0.42,
  feetY: 90,
  headY: 9,
  bodyX: 50,
  clips: {
    idle:   { src: '/hooded-knight/hooded_knight_idle.png', frameTime: 7, mode: 'loop' },
    attack: { src: '/hooded-knight/hooded_knight_attack.png', frameTime: 2, mode: 'once', impactFrame: 14, frameWidth: 102 },
  },
  states: { idle: 'idle', walk: 'idle', attack: 'attack' },
};
