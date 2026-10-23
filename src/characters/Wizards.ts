import type { CharacterDef } from './CharacterDef';

/**
 * The wizards fought as enemies. (The three wizards that were here — wanderer, light and fire — became the
 * heroes Malkorath, Xanthia and Vesper: their art moved to /main-characters, see Heroes.ts.)
 */

/** An enemy: a crowned sorcerer that breathes fire at close range. */
export const EVIL_WIZARD: CharacterDef = {
  id: 'evil_wizard',
  frameWidth: 150,
  frameHeight: 150,
  scale: 0.62,
  feetY: 101,
  headY: 44,
  bodyX: 72,
  clips: {
    idle:   { src: '/evil-wizard/Idle.png', frameTime: 7, mode: 'loop' },
    move:   { src: '/evil-wizard/Move.png', frameTime: 6, mode: 'loop' },
    attack: { src: '/evil-wizard/Attack.png', frameTime: 4, mode: 'once', impactFrame: 5 },
    hurt:   { src: '/evil-wizard/Take Hit.png', frameTime: 4, mode: 'once' },
    death:  { src: '/evil-wizard/Death.png', frameTime: 7, mode: 'hold' },
  },
  states: { idle: 'idle', walk: 'move', run: 'move', attack: 'attack', hurt: 'hurt', death: 'death' },
};

/**
 * An enemy: a hooded ghost that floats about and hurls green flame. Its strips are drawn facing left on a
 * grey background (keyed out); its attack is downscaled from a 16× sheet into one strip.
 */
export const GHOST_WIZARD: CharacterDef = {
  id: 'ghost_wizard',
  frameWidth: 80,
  frameHeight: 80,
  scale: 0.6,
  feetY: 69,
  headY: 13,
  bodyX: 37,
  facesLeft: true,
  keyColor: 0x3a4041,
  clips: {
    idle:   { src: '/ghost-wizard/ghost_wizard_idle.png', frameTime: 7, mode: 'loop' },
    fly:    { src: '/ghost-wizard/ghost_wizard_fly_forward.png', frameTime: 6, mode: 'loop' },
    attack: { src: '/ghost-wizard/ghost_wizard_attack_strip.png', frameTime: 4, mode: 'once', impactFrame: 6 },
    death:  { src: '/ghost-wizard/ghost_wizard_death.png', frameTime: 6, mode: 'hold' },
  },
  states: { idle: 'idle', walk: 'fly', run: 'fly', attack: 'attack', death: 'death' },
};
