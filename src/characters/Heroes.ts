import type { CharacterDef } from './CharacterDef';

/**
 * The main characters, from /main-characters/<name>: every strip in each folder is mapped as a clip (those
 * the game has no state for yet — jumps, climbs, rolls, charge-ups — are there for when it does). All face
 * right. Kaelen's sheets are grids of frames read row by row; the others are single rows. Casters carry a
 * `bolt`: the projectile strip their spell flies as, and the frames it bursts in.
 */

const K = '/main-characters/kaelen';
/** Kaelen, the warrior: 128×64 frames in 2×N grids; Attacks.png holds five 8-frame attacks, one per row. */
export const KAELEN: CharacterDef = {
  id: 'kaelen',
  frameWidth: 128,
  frameHeight: 64,
  scale: 0.74,
  feetY: 64,
  headY: 18,
  bodyX: 60,
  clips: {
    idle:          { src: `${K}/Idle.png`, frameTime: 6, mode: 'loop', grid: true },
    walk:          { src: `${K}/Run.png`, frameTime: 6, mode: 'loop', grid: true },
    run:           { src: `${K}/Run.png`, frameTime: 4, mode: 'loop', grid: true },
    attack:        { src: `${K}/Attacks.png`, frameTime: 3, mode: 'once', grid: true, frameCount: 8, impactFrame: 4 },
    attack2:       { src: `${K}/Attacks.png`, frameTime: 3, mode: 'once', grid: true, firstFrame: 8, frameCount: 8 },
    attack3:       { src: `${K}/Attacks.png`, frameTime: 3, mode: 'once', grid: true, firstFrame: 16, frameCount: 8 },
    attack4:       { src: `${K}/Attacks.png`, frameTime: 3, mode: 'once', grid: true, firstFrame: 24, frameCount: 8 },
    attack5:       { src: `${K}/Attacks.png`, frameTime: 3, mode: 'once', grid: true, firstFrame: 32, frameCount: 8 },
    pray:          { src: `${K}/Pray.png`, frameTime: 3, mode: 'once', grid: true },
    hurt:          { src: `${K}/Hurt.png`, frameTime: 4, mode: 'once', grid: true, frameCount: 3 },
    death:         { src: `${K}/Death.png`, frameTime: 6, mode: 'hold', grid: true },
    jump:          { src: `${K}/Jump.png`, frameTime: 4, mode: 'once', grid: true },
    climb:         { src: `${K}/Climb.png`, frameTime: 5, mode: 'loop', grid: true },
    hanging:       { src: `${K}/Hanging.png`, frameTime: 6, mode: 'loop', grid: true },
    heal:          { src: `${K}/Health.png`, frameTime: 4, mode: 'once', grid: true },
    roll:          { src: `${K}/Roll.png`, frameTime: 4, mode: 'once', grid: true },
    slide:         { src: `${K}/Slide.png`, frameTime: 4, mode: 'once', grid: true, frameCount: 10 },
    airAttack:     { src: `${K}/attack_from_air.png`, frameTime: 3, mode: 'once', grid: true },
    crouchAttack:  { src: `${K}/crouch_attacks.png`, frameTime: 3, mode: 'once', grid: true, frameCount: 7 },
    crouch:        { src: `${K}/crouch_idle.png`, frameTime: 6, mode: 'loop', grid: true },
  },
  states: { idle: 'idle', walk: 'walk', run: 'run', attack: 'attack', cast: 'pray', hurt: 'hurt', death: 'death' },
};

const MK = '/main-characters/malkorath';
/** Malkorath, the rogue: 128×128 frames; his magic arrow (Charge_2) is his spell. */
export const MALKORATH: CharacterDef = {
  id: 'malkorath',
  frameWidth: 128,
  frameHeight: 128,
  scale: 0.52,
  feetY: 128,
  headY: 63,
  bodyX: 64,
  clips: {
    idle:        { src: `${MK}/Idle.png`, frameTime: 6, mode: 'loop' },
    walk:        { src: `${MK}/Walk.png`, frameTime: 5, mode: 'loop' },
    run:         { src: `${MK}/Run.png`, frameTime: 4, mode: 'loop' },
    attack:      { src: `${MK}/Attack_1.png`, frameTime: 3, mode: 'once', impactFrame: 4 },
    attack2:     { src: `${MK}/Attack_2.png`, frameTime: 3, mode: 'once' },
    cast:        { src: `${MK}/Magic_arrow.png`, frameTime: 3, mode: 'once' },
    sphere:      { src: `${MK}/Magic_sphere.png`, frameTime: 3, mode: 'once' },
    hurt:        { src: `${MK}/Hurt.png`, frameTime: 4, mode: 'once' },
    death:       { src: `${MK}/Dead.png`, frameTime: 6, mode: 'hold' },
    jump:        { src: `${MK}/Jump.png`, frameTime: 4, mode: 'once' },
    charge:      { src: `${MK}/Charge_1.png`, frameTime: 3, mode: 'once', frameWidth: 64 },
    bolt:        { src: `${MK}/Charge_2.png`, frameTime: 3, mode: 'loop', frameWidth: 64 },
  },
  states: { idle: 'idle', walk: 'walk', run: 'run', attack: 'attack', cast: 'cast', hurt: 'hurt', death: 'death' },
  bolt: { clip: 'bolt', fly: { first: 1, count: 5 }, scale: 0.6 },
};

const ML = '/main-characters/malthus';
/** Malthus, the paladin: 180×180 frames with the body drawn small in them. */
export const MALTHUS: CharacterDef = {
  id: 'malthus',
  frameWidth: 180,
  frameHeight: 180,
  scale: 0.67,
  feetY: 114,
  headY: 63,
  bodyX: 96,
  clips: {
    idle:    { src: `${ML}/Idle.png`, frameTime: 6, mode: 'loop' },
    walk:    { src: `${ML}/Run.png`, frameTime: 6, mode: 'loop' },
    run:     { src: `${ML}/Run.png`, frameTime: 4, mode: 'loop' },
    attack:  { src: `${ML}/Attack1.png`, frameTime: 3, mode: 'once', impactFrame: 4 },
    cast:    { src: `${ML}/Attack2.png`, frameTime: 3, mode: 'once' },
    hurt:    { src: `${ML}/Take Hit.png`, frameTime: 4, mode: 'once' },
    death:   { src: `${ML}/Death.png`, frameTime: 5, mode: 'hold' },
    jump:    { src: `${ML}/Jump.png`, frameTime: 4, mode: 'once' },
    fall:    { src: `${ML}/Fall.png`, frameTime: 4, mode: 'loop' },
  },
  states: { idle: 'idle', walk: 'walk', run: 'run', attack: 'attack', cast: 'cast', hurt: 'hurt', death: 'death' },
};

const V = '/main-characters/vesper';
/** Vesper, the wizard: 128×128 frames; her fireball (Charge, 64×64) flies on frames 0–4 and bursts on 5–11. */
export const VESPER: CharacterDef = {
  id: 'vesper',
  frameWidth: 128,
  frameHeight: 128,
  scale: 0.52,
  feetY: 128,
  headY: 62,
  bodyX: 51,
  clips: {
    idle:      { src: `${V}/Idle.png`, frameTime: 6, mode: 'loop' },
    walk:      { src: `${V}/Walk.png`, frameTime: 5, mode: 'loop' },
    run:       { src: `${V}/Run.png`, frameTime: 4, mode: 'loop' },
    attack:    { src: `${V}/Attack_1.png`, frameTime: 4, mode: 'once', impactFrame: 2 },
    attack2:   { src: `${V}/Attack_2.png`, frameTime: 4, mode: 'once' },
    cast:      { src: `${V}/Fireball.png`, frameTime: 3, mode: 'once' },
    flameJet:  { src: `${V}/Flame_jet.png`, frameTime: 3, mode: 'once' },
    hurt:      { src: `${V}/Hurt.png`, frameTime: 4, mode: 'once' },
    death:     { src: `${V}/Dead.png`, frameTime: 6, mode: 'hold' },
    jump:      { src: `${V}/Jump.png`, frameTime: 4, mode: 'once' },
    bolt:      { src: `${V}/Charge.png`, frameTime: 3, mode: 'loop', frameWidth: 64, frameHeight: 64 },
  },
  states: { idle: 'idle', walk: 'walk', run: 'run', attack: 'attack', cast: 'cast', hurt: 'hurt', death: 'death' },
  bolt: { clip: 'bolt', fly: { first: 0, count: 5 }, burst: { first: 5, count: 7 }, scale: 0.6 },
};

const X = '/main-characters/xanthia';
/** Xanthia, the sorcerer: 128×128 frames; her light orb (Charge, 64×64) crackles as it flies. */
export const XANTHIA: CharacterDef = {
  id: 'xanthia',
  frameWidth: 128,
  frameHeight: 128,
  scale: 0.47,
  feetY: 128,
  headY: 53,
  bodyX: 53,
  clips: {
    idle:        { src: `${X}/Idle.png`, frameTime: 6, mode: 'loop' },
    walk:        { src: `${X}/Walk.png`, frameTime: 5, mode: 'loop' },
    run:         { src: `${X}/Run.png`, frameTime: 4, mode: 'loop' },
    attack:      { src: `${X}/Attack_1.png`, frameTime: 3, mode: 'once', impactFrame: 6 },
    attack2:     { src: `${X}/Attack_2.png`, frameTime: 4, mode: 'once' },
    cast:        { src: `${X}/Light_ball.png`, frameTime: 3, mode: 'once' },
    lightCharge: { src: `${X}/Light_charge.png`, frameTime: 3, mode: 'once', frameCount: 12 },
    hurt:        { src: `${X}/Hurt.png`, frameTime: 4, mode: 'once' },
    death:       { src: `${X}/Dead.png`, frameTime: 6, mode: 'hold' },
    jump:        { src: `${X}/Jump.png`, frameTime: 4, mode: 'once' },
    bolt:        { src: `${X}/Charge.png`, frameTime: 3, mode: 'loop', frameWidth: 64, frameHeight: 64 },
  },
  states: { idle: 'idle', walk: 'walk', run: 'run', attack: 'attack', cast: 'cast', hurt: 'hurt', death: 'death' },
  bolt: { clip: 'bolt', fly: { first: 0, count: 9 }, scale: 0.6 },
};

export const HEROES = [KAELEN, MALKORATH, MALTHUS, VESPER, XANTHIA] as const;
