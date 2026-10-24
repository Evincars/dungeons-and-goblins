import type { MobType } from '../world';
import type { SpellDamageType, SpellId } from '../rules/Spells';

/**
 * Every sound effect in the game, as recipes over the clips in public/audio (and a few of Catacomb Snatch's in
 * public/sound): an effect is one or more layers played together, each a clip picked at random from its takes,
 * at its own loudness, speed (a faster clip is higher and shorter) and delay. Layering and re-pitching the few
 * sorcery, weapon and creature recordings gives every spell and every kind of enemy a voice of its own.
 */

/** A recording, or a stretch of one: its start and length in milliseconds. */
export type Clip = { readonly file: string; readonly slice?: readonly [number, number] };

/**
 * One layer of an effect: one of `clips` (at random), at `volume` (0..1), played `rate` times as fast (higher
 * and shorter above 1, deeper and longer below), `delay` ms after the effect starts.
 */
export type Layer = { readonly clips: readonly Clip[]; readonly volume: number; readonly rate: number; readonly delay: number };

/** Most recordings come in three takes, `name_01.wav` … `name_03.wav`. */
const TAKES = 3;

/** The numbered takes of a recording under public/audio. */
function takes(name: string, count = TAKES): Clip[] {
  return Array.from({ length: count }, (_, i) => ({ file: `/audio/${name}_${String(i + 1).padStart(2, '0')}.wav` }));
}

/** A single file (Catacomb Snatch's clips, kept for coins, gems and pits). */
const file = (path: string): Clip[] => [{ file: path }];

function layer(clips: readonly Clip[], volume = 1, rate = 1, delay = 0): Layer {
  return { clips, volume, rate, delay };
}

/** The ashen knight's footsteps loop holds three steps (armour jingling on each); each is played on its own. */
const KNIGHT_STEPS: Clip[] = [
  { file: '/audio/player/ashen_knight_footsteps_loop_01.wav', slice: [0, 600] },
  { file: '/audio/player/ashen_knight_footsteps_loop_01.wav', slice: [870, 650] },
  { file: '/audio/player/ashen_knight_footsteps_loop_01.wav', slice: [1670, 680] },
];

/** click_02 holds two clicks a second apart: a dialog opening plays only the first. */
const DIALOG_CLICK: Clip[] = [{ file: '/audio/interface/click_02.wav', slice: [0, 1000] }];

const KNIGHT = {
  light: takes('player/ashen_knight_light_attack'),
  heavy: takes('player/ashen_knight_heavy_attack'),
  hurt: takes('player/ashen_knight_hurt'),
  die: takes('player/ashen_knight_die'),
  parry: takes('player/ashen_knight_parry'),
  block: takes('player/ashen_knight_shield_block'),
  drink: takes('player/ashen_knight_drink_flask'),
  roll: takes('player/ashen_knight_dodge_roll', 1),
};

const BLADE = {
  flesh: takes('weapons/longsword_hit_flesh'),
  armor: takes('weapons/longsword_hit_armor'),
  blood: takes('weapons/critical_blow_blood_splatter'),
  bone: takes('weapons/critical_blow_bone_crack'),
  bowShoot: takes('weapons/longbow_shoot'),
  arrowImpact: takes('weapons/longbow_arrow_impact'),
};

const SORCERY = {
  dark: takes('sorcery/dark_sorcery_cast'),
  fire: takes('sorcery/fire_sorcery_cast'),
  explode: takes('sorcery/fire_sorcery_explode'),
  miracle: takes('sorcery/healing_miracle_cast'),
};

const CREATURE = {
  soldierAttack: takes('enemies/hollow_soldier_attack'),
  soldierHurt: takes('enemies/hollow_soldier_hurt'),
  soldierDie: takes('enemies/hollow_soldier_die'),
  houndBite: takes('enemies/plague_hound_bite'),
  houndGrowl: takes('enemies/plague_hound_growl'),
  houndDie: takes('enemies/plague_hound_die'),
  giantRoar: takes('enemies/giant_knight_roar'),
  giantSlam: takes('enemies/giant_knight_slam'),
  giantDie: takes('enemies/giant_knight_die'),
  dragonRoar: takes('enemies/ancient_dragon_roar'),
  dragonFire: takes('enemies/ancient_dragon_breathe_fire'),
  dragonWings: takes('enemies/ancient_dragon_flap_wings'),
};

const WORLD = {
  chest: takes('world/treasure_chest_open'),
  door: takes('world/cathedral_door_open'),
  fogGate: takes('world/fog_gate_pass'),
  kindle: takes('world/bonfire_kindle'),
};

const INTERFACE = {
  levelUp: takes('interface/level_up'),
  youDied: takes('interface/you_died'),
  felled: takes('interface/enemy_felled'),
  error: takes('interface/error'),
  pickUp: takes('interface/pick_up_item'),
};

export const SFX = {
  // --- heroes: every hero has the ashen knight's voice and kit ---
  step: [layer(KNIGHT_STEPS, 0.35)],
  sword_swing: [layer(KNIGHT.light, 0.7)],
  /** A heavy or two-handed weapon comes down. */
  swing_heavy: [layer(KNIGHT.heavy, 0.8)],
  hurt: [layer(KNIGHT.hurt, 0.8)],
  death: [layer(KNIGHT.die)],
  /** A foe's blow turned aside by a hero without a shield… */
  parry: [layer(KNIGHT.parry, 0.6)],
  /** …and by one with a shield. */
  shield_block: [layer(KNIGHT.block, 0.7)],
  /** A hit die spent: a swig from the flask. */
  drink: [layer(KNIGHT.drink, 0.8)],
  /** Weapons swapped: a shuffle of gear and a blade's ring as it leaves the scabbard. */
  swap: [layer(KNIGHT.roll, 0.5, 1.2), layer(BLADE.armor, 0.15, 1.8, 60)],

  // --- weapons ---
  sword_hit: [layer(BLADE.flesh, 0.8)],
  /** A blow that the target's Armor Class turned: it glances off armour. */
  sword_miss: [layer(BLADE.armor, 0.45, 1.1)],
  /** A natural 20: the splatter and the crack of bone together. */
  critical: [layer(BLADE.blood, 0.8), layer(BLADE.bone, 0.7, 1, 40)],
  bow_shot: [layer(BLADE.bowShoot, 0.8)],
  arrow_hit: [layer(BLADE.arrowImpact, 0.7)],

  // --- spells: four recordings, re-pitched and layered into fourteen ---
  cast_fire_bolt: [layer(SORCERY.fire, 0.7, 1.15)],
  /** Frost: dark sorcery pitched up into a hiss, a high shimmer of the miracle over it. */
  cast_ray_of_frost: [layer(SORCERY.dark, 0.6, 1.45), layer(SORCERY.miracle, 0.25, 1.6)],
  cast_chill_touch: [layer(SORCERY.dark, 0.7, 0.85)],
  cast_eldritch_blast: [layer(SORCERY.dark, 0.7), layer(SORCERY.fire, 0.35, 0.75)],
  /** An insult with teeth: a high, snarling cackle. */
  cast_vicious_mockery: [layer(SORCERY.dark, 0.5, 1.6), layer(CREATURE.houndGrowl, 0.3, 1.5)],
  cast_sacred_flame: [layer(SORCERY.miracle, 0.6, 1.25), layer(SORCERY.fire, 0.35, 1.3)],
  cast_chromatic_orb: [layer(SORCERY.fire, 0.6, 0.8), layer(SORCERY.dark, 0.35, 1.2)],
  /** Three darts, three casts in quick succession. */
  cast_magic_missile: [layer(SORCERY.dark, 0.45, 1.3), layer(SORCERY.dark, 0.4, 1.4, 70), layer(SORCERY.dark, 0.35, 1.5, 140)],
  /** A sheet of flame: the cast with a dragon's breath under it. */
  cast_burning_hands: [layer(SORCERY.fire, 0.7), layer(CREATURE.dragonFire, 0.45, 1.2)],
  /** A boom and a gust: a slowed blast with great wings beating behind it. */
  cast_thunderwave: [layer(SORCERY.explode, 0.75, 0.7), layer(CREATURE.dragonWings, 0.5, 0.8)],
  cast_arms_of_hadar: [layer(SORCERY.dark, 0.7, 0.7), layer(CREATURE.giantSlam, 0.25, 1.2)],
  cast_guiding_bolt: [layer(SORCERY.miracle, 0.55, 1.4), layer(SORCERY.fire, 0.4, 1.2)],
  cast_healing_word: [layer(SORCERY.miracle, 0.6, 1.15)],
  cast_cure_wounds: [layer(SORCERY.miracle, 0.7)],
  /** Where a spell strikes, by the kind of damage it does. */
  impact_fire: [layer(SORCERY.explode, 0.6, 1.15)],
  impact_frost: [layer(BLADE.armor, 0.4, 1.7), layer(SORCERY.explode, 0.25, 1.6)],
  impact_dark: [layer(SORCERY.dark, 0.4, 1.7), layer(BLADE.flesh, 0.35, 0.8)],
  impact_holy: [layer(SORCERY.miracle, 0.35, 1.8), layer(SORCERY.explode, 0.3, 1.4)],
  impact_force: [layer(SORCERY.explode, 0.4, 1.5), layer(BLADE.flesh, 0.35)],

  // --- enemies: five voices from four creatures' recordings ---
  /** Goblins: the plague hound's snarls and bites, pitched up to something smaller and meaner. */
  goblin_alert: [layer(CREATURE.houndGrowl, 0.6, 1.2)],
  goblin_attack: [layer(CREATURE.houndBite, 0.55, 1.2)],
  goblin_hurt: [layer(CREATURE.houndGrowl, 0.45, 1.35)],
  goblin_die: [layer(CREATURE.houndDie, 0.7, 1.2)],
  /** Orcs and goblin warriors: the hollow soldier, deeper. */
  soldier_alert: [layer(CREATURE.giantRoar, 0.4, 1.35)],
  soldier_attack: [layer(CREATURE.soldierAttack, 0.6, 0.9)],
  soldier_hurt: [layer(CREATURE.soldierHurt, 0.55, 0.9)],
  soldier_die: [layer(CREATURE.soldierDie, 0.75, 0.9)],
  /** Skeletons: the hollow soldier, drier and higher, and bones breaking as they fall. */
  skeleton_alert: [layer(CREATURE.soldierHurt, 0.45, 1.25)],
  skeleton_attack: [layer(CREATURE.soldierAttack, 0.55, 1.15)],
  skeleton_hurt: [layer(CREATURE.soldierHurt, 0.45, 1.2), layer(BLADE.bone, 0.2, 1.4)],
  skeleton_die: [layer(CREATURE.soldierDie, 0.6, 1.2), layer(BLADE.bone, 0.6, 0.9, 120)],
  /** Trolls: the giant knight, with a dragon's roar when it spots you. */
  troll_alert: [layer(CREATURE.dragonRoar, 0.6, 1.15)],
  troll_attack: [layer(CREATURE.giantSlam, 0.7)],
  troll_hurt: [layer(CREATURE.giantRoar, 0.35, 1.3)],
  troll_die: [layer(CREATURE.giantDie, 0.85)],
  /** Wizards: a soldier's voice, and dark sorcery in their attacks and their last breath. */
  wizard_alert: [layer(SORCERY.dark, 0.5, 0.7)],
  wizard_attack: [layer(SORCERY.dark, 0.5, 1.25), layer(CREATURE.soldierAttack, 0.3, 1.1)],
  wizard_hurt: [layer(CREATURE.soldierHurt, 0.5, 1.1)],
  wizard_die: [layer(CREATURE.soldierDie, 0.6, 1.05), layer(SORCERY.dark, 0.45, 0.6, 150)],
  /** A nest torn down: a great slam and the fanfare for a foe felled. */
  nest_destroyed: [layer(CREATURE.giantSlam, 0.6, 0.8), layer(INTERFACE.felled, 0.5)],

  // --- the world ---
  chest_open: [layer(WORLD.chest, 0.8)],
  door_open: [layer(WORLD.door, 0.8)],
  /** The exit: through the fog gate to the level below. */
  level_exit: [layer(WORLD.fogGate)],
  /** The party rests by a kindled fire. */
  rest: [layer(WORLD.kindle, 0.8)],
  coin: [layer(file('/sound/Small Coin.wav'))],
  coin_big: [layer(file('/sound/Big Coin.wav'))],
  gem: [layer(file('/sound/Gem.wav'))],
  gem_big: [layer(file('/sound/Big Gem.wav'))],
  fall: [layer(file('/sound/Fall.wav'))],
  falling: [layer(file('/sound/falling_male.wav'))],

  // --- interface ---
  level_up: [layer(INTERFACE.levelUp, 0.9)],
  you_died: [layer(INTERFACE.youDied, 0.9)],
  /** Something goes into a bag: picked up, given, or won in a roll. */
  pickup: [layer(INTERFACE.pickUp, 0.6)],
  /** Bought: the item into the bag, and the coins out of the purse. */
  buy: [layer(INTERFACE.pickUp, 0.55), layer(file('/sound/Small Coin.wav'), 0.6, 1, 80)],
  fail: [layer(INTERFACE.error, 0.5)],
  /** Inventory, shop, pause menu, a HUD dialog or a pop-up menu opens. */
  dialog: [layer(DIALOG_CLICK, 0.6)],
} as const satisfies Record<string, readonly Layer[]>;

export type SfxName = keyof typeof SFX;

/** The cries each enemy makes: on spotting a hero, as it swings, when it is hurt and as it dies. */
export type MobCries = { readonly alert: SfxName; readonly attack: SfxName; readonly hurt: SfxName; readonly die: SfxName };

const cries = (voice: 'goblin' | 'soldier' | 'skeleton' | 'troll' | 'wizard'): MobCries => ({
  alert: `${voice}_alert`, attack: `${voice}_attack`, hurt: `${voice}_hurt`, die: `${voice}_die`,
});

export const MOB_CRIES = {
  goblin: cries('goblin'),
  goblin_grunt: cries('goblin'),
  goblin_rogue: cries('goblin'),
  goblin_warrior: cries('soldier'),
  orc: cries('soldier'),
  skeleton: cries('skeleton'),
  troll: cries('troll'),
  ghost_wizard: cries('wizard'),
  evil_wizard: cries('wizard'),
} as const satisfies Record<MobType, MobCries>;

export const SPELL_SOUNDS = {
  fire_bolt: 'cast_fire_bolt',
  ray_of_frost: 'cast_ray_of_frost',
  chill_touch: 'cast_chill_touch',
  eldritch_blast: 'cast_eldritch_blast',
  vicious_mockery: 'cast_vicious_mockery',
  sacred_flame: 'cast_sacred_flame',
  chromatic_orb: 'cast_chromatic_orb',
  magic_missile: 'cast_magic_missile',
  burning_hands: 'cast_burning_hands',
  thunderwave: 'cast_thunderwave',
  arms_of_hadar: 'cast_arms_of_hadar',
  guiding_bolt: 'cast_guiding_bolt',
  healing_word: 'cast_healing_word',
  cure_wounds: 'cast_cure_wounds',
} as const satisfies Record<SpellId, SfxName>;

export const SPELL_IMPACTS = {
  fire: 'impact_fire',
  acid: 'impact_fire',
  cold: 'impact_frost',
  necrotic: 'impact_dark',
  psychic: 'impact_dark',
  radiant: 'impact_holy',
  force: 'impact_force',
  lightning: 'impact_force',
  thunder: 'impact_force',
} as const satisfies Record<SpellDamageType, SfxName>;

/** Every clip the effects play (a recording once for each effect layer that uses it). */
export function allClips(): Clip[] {
  return Object.values(SFX).flatMap((layers: readonly Layer[]) => layers.flatMap((l) => l.clips));
}

// --- music ---

/** A piece of music: its files, played in turn and round again, and how loud it sits in the mix (0..1). */
export type Track = { readonly files: readonly string[]; readonly level: number };

export const MUSIC_TRACKS = {
  /** The title, settings, character select and co-op lobby. */
  menu: { files: ['/audio/music/main_theme_loop_03.wav'], level: 0.8 },
  /** Exploring a level: the two exploration loops, one after the other. */
  explore: { files: ['/audio/music/dark-fantasy-exploration-1.ogg', '/audio/music/dark-fantasy-exploration-2.ogg'], level: 0.6 },
  /** Enemies engaged nearby. */
  combat: { files: ['/audio/music/dark-fantasy-combat.ogg'], level: 0.7 },
} as const satisfies Record<string, Track>;

export type TrackName = keyof typeof MUSIC_TRACKS;
