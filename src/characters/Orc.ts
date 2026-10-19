import type { CharacterDef } from './CharacterDef';

const DIR = '/Orc/Orc';

// Tiny pixel art centred in large transparent 100×100 frames: crop to the content
// (shared by every strip), kept horizontally centred so mirroring stays symmetric.
// Only idle and walk are wired to states so far.
export const ORC: CharacterDef = {
  id: 'orc',
  frameWidth: 100,
  frameHeight: 100,
  trim: { x: 31, y: 30, w: 46, h: 38 },
  scale: 1.6,
  feetY: 57,
  clips: {
    idle:    { src: `${DIR}/Orc_Idle.png`,     frameTime: 8, mode: 'loop' },
    walk:    { src: `${DIR}/Orc_Walk.png`,     frameTime: 6, mode: 'loop' },
    attack1: { src: `${DIR}/Orc_Attack01.png`, frameTime: 4, mode: 'once' },
    attack2: { src: `${DIR}/Orc_Attack02.png`, frameTime: 4, mode: 'once' },
    hurt:    { src: `${DIR}/Orc_Hurt.png`,     frameTime: 4, mode: 'once' },
    death:   { src: `${DIR}/Orc_Death.png`,    frameTime: 5, mode: 'hold' },
  },
  states: {
    idle: 'idle',
    walk: 'walk',
  },
};
