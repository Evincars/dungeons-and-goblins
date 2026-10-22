import type { CharacterDef } from './CharacterDef';

/**
 * The wizards: three heroes' worth (wanderer, light, fire) for later, and two enemies — the evil wizard and
 * the ghost wizard. Feet, head and body columns are measured from their idle frames; scales bring them to
 * the size of the other characters.
 */

export const WANDERER_WIZARD: CharacterDef = {
  id: 'wanderer_wizard',
  frameWidth: 128,
  frameHeight: 128,
  scale: 0.48,
  feetY: 127,
  headY: 62,
  bodyX: 64,
  clips: {
    idle:   { src: '/wanderer-wizard/Idle.png', frameTime: 7, mode: 'loop' },
    walk:   { src: '/wanderer-wizard/Walk.png', frameTime: 6, mode: 'loop' },
    run:    { src: '/wanderer-wizard/Run.png', frameTime: 5, mode: 'loop' },
    attack: { src: '/wanderer-wizard/Attack_1.png', frameTime: 4, mode: 'once', impactFrame: 4 },
    cast:   { src: '/wanderer-wizard/Magic_arrow.png', frameTime: 4, mode: 'once' },
    hurt:   { src: '/wanderer-wizard/Hurt.png', frameTime: 4, mode: 'once' },
    death:  { src: '/wanderer-wizard/Dead.png', frameTime: 6, mode: 'hold' },
  },
  states: { idle: 'idle', walk: 'walk', run: 'run', attack: 'attack', cast: 'cast', hurt: 'hurt', death: 'death' },
};

export const LIGHT_WIZARD: CharacterDef = {
  id: 'light_wizard',
  frameWidth: 128,
  frameHeight: 128,
  scale: 0.48,
  feetY: 127,
  headY: 66,
  bodyX: 56,
  clips: {
    idle:   { src: '/light-wizard/Idle.png', frameTime: 7, mode: 'loop' },
    walk:   { src: '/light-wizard/Walk.png', frameTime: 6, mode: 'loop' },
    run:    { src: '/light-wizard/Run.png', frameTime: 5, mode: 'loop' },
    attack: { src: '/light-wizard/Attack_1.png', frameTime: 3, mode: 'once', impactFrame: 5 },
    cast:   { src: '/light-wizard/Light_ball.png', frameTime: 4, mode: 'once' },
    hurt:   { src: '/light-wizard/Hurt.png', frameTime: 4, mode: 'once' },
    death:  { src: '/light-wizard/Dead.png', frameTime: 6, mode: 'hold' },
  },
  states: { idle: 'idle', walk: 'walk', run: 'run', attack: 'attack', cast: 'cast', hurt: 'hurt', death: 'death' },
};

export const FIRE_WIZARD: CharacterDef = {
  id: 'fire_wizard',
  frameWidth: 128,
  frameHeight: 128,
  scale: 0.48,
  feetY: 127,
  headY: 62,
  bodyX: 50,
  clips: {
    idle:   { src: '/fire-wizard/Idle.png', frameTime: 7, mode: 'loop' },
    walk:   { src: '/fire-wizard/Walk.png', frameTime: 6, mode: 'loop' },
    run:    { src: '/fire-wizard/Run.png', frameTime: 5, mode: 'loop' },
    attack: { src: '/fire-wizard/Attack_1.png', frameTime: 5, mode: 'once', impactFrame: 2 },
    cast:   { src: '/fire-wizard/Fireball.png', frameTime: 4, mode: 'once' },
    hurt:   { src: '/fire-wizard/Hurt.png', frameTime: 4, mode: 'once' },
    death:  { src: '/fire-wizard/Dead.png', frameTime: 6, mode: 'hold' },
  },
  states: { idle: 'idle', walk: 'walk', run: 'run', attack: 'attack', cast: 'cast', hurt: 'hurt', death: 'death' },
};

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
