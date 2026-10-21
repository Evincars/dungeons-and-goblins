import type { CharacterDef } from './CharacterDef';

const DIR = '/Fighter';

// 112×96 frames; the body sits ~54px from the left edge, so crop to 108 to centre it for mirroring.
// Jump and block strips exist in the folder but aren't wired up yet.
export const FIGHTER: CharacterDef = {
  id: 'fighter',
  frameWidth: 112,
  frameHeight: 96,
  trim: { x: 0, y: 0, w: 108, h: 96 },
  scale: 0.83,
  feetY: 84,
  headY: 49,
  clips: {
    idle:    { src: `${DIR}/IDLE.png`,     frameTime: 6, mode: 'loop' },
    walk:    { src: `${DIR}/WALK.png`,     frameTime: 5, mode: 'loop' },
    run:     { src: `${DIR}/RUN.png`,      frameTime: 4, mode: 'loop' },
    attack1: { src: `${DIR}/ATTACK 1.png`, frameTime: 2, mode: 'once' },
    attack2: { src: `${DIR}/ATTACK 2.png`, frameTime: 3, mode: 'once' },
    attack3: { src: `${DIR}/ATTACK 3.png`, frameTime: 3, mode: 'once' },
    hurt:    { src: `${DIR}/HURT.png`,     frameTime: 3, mode: 'once' },
    death:   { src: `${DIR}/DEATH.png`,    frameTime: 5, mode: 'hold' },
  },
  states: {
    idle: 'idle',
    walk: 'walk',
    run: 'run',
    attack: 'attack1',
    cast: 'attack2',
    hurt: 'hurt',
    death: 'death',
  },
};
