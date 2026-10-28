import { hasKey } from '../core/guards';
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

/** Most recordings come in three takes, `name_01.webm` … `name_03.webm`. */
const TAKES = 3;

/** The numbered takes of a recording under public/audio. */
function takes(name: string, count = TAKES): Clip[] {
  return Array.from({ length: count }, (_, i) => ({ file: `/audio/${name}_${String(i + 1).padStart(2, '0')}.webm` }));
}

/** A single file (Catacomb Snatch's clips, kept for coins, gems and pits). */
const file = (path: string): Clip[] => [{ file: path }];

function layer(clips: readonly Clip[], volume = 1, rate = 1, delay = 0): Layer {
  return { clips, volume, rate, delay };
}

/** A hero's tread: footstep-wood holds four boot steps half a second apart; each is played on its own. */
const HERO_STEPS: Clip[] = [
  { file: '/audio/player/footstep-wood.mp3', slice: [80, 400] },
  { file: '/audio/player/footstep-wood.mp3', slice: [580, 400] },
  { file: '/audio/player/footstep-wood.mp3', slice: [1080, 400] },
  { file: '/audio/player/footstep-wood.mp3', slice: [1580, 350] },
];

/** The giant knight's footstep loop: three of its stomps, each on its own, for a troll's tread. */
const GIANT_STEPS: Clip[] = [
  { file: '/audio/enemies/giant_knight_footstep_loop_01.webm', slice: [50, 600] },
  { file: '/audio/enemies/giant_knight_footstep_loop_01.webm', slice: [2150, 650] },
  { file: '/audio/enemies/giant_knight_footstep_loop_01.webm', slice: [5150, 650] },
];

/** click_02 holds two clicks a second apart: a dialog opening plays only the first. */
const DIALOG_CLICK: Clip[] = [{ file: '/audio/interface/click_02.webm', slice: [0, 1000] }];

/** click_01 and click_03 are one short click each, then a long quiet tail: a button press plays the click alone. */
const BUTTON_CLICK: Clip[] = [
  { file: '/audio/interface/click_01.webm', slice: [0, 400] },
  { file: '/audio/interface/click_03.webm', slice: [0, 400] },
];

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
  bowDraw: takes('weapons/longbow_draw'),
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
  openMenu: takes('interface/open_menu'),
};

export const SFX = {
  // --- heroes: every hero has the ashen knight's voice and kit ---
  step: [layer(HERO_STEPS, 0.7)],
  sword_swing: [layer(KNIGHT.light, 0.98)],
  /** A heavy or two-handed weapon comes down. */
  swing_heavy: [layer(KNIGHT.heavy, 1)],
  hurt: [layer(KNIGHT.hurt, 1)],
  death: [layer(KNIGHT.die)],
  /** A foe's blow turned aside by a hero without a shield… */
  parry: [layer(KNIGHT.parry, 0.84)],
  /** …and by one with a shield. */
  shield_block: [layer(KNIGHT.block, 0.98)],
  /** A hit die spent: a swig from the flask. */
  drink: [layer(KNIGHT.drink, 1)],
  /** Weapons swapped: a shuffle of gear and a blade's ring as it leaves the scabbard. */
  swap: [layer(KNIGHT.roll, 0.7, 1.2), layer(BLADE.armor, 0.21, 1.8, 60)],
  /** Swapped to a bow: the gear shuffles and the string is drawn. */
  bow_draw: [layer(KNIGHT.roll, 0.56, 1.2), layer(BLADE.bowDraw, 0.84, 1, 80)],

  // --- weapons ---
  sword_hit: [layer(BLADE.flesh, 1)],
  /** A blow that the target's Armor Class turned: it glances off armour. */
  sword_miss: [layer(BLADE.armor, 0.63, 1.1)],
  /** A natural 20: the splatter and the crack of bone together. */
  critical: [layer(BLADE.blood, 1), layer(BLADE.bone, 0.98, 1, 40)],
  bow_shot: [layer(BLADE.bowShoot, 1)],
  arrow_hit: [layer(BLADE.arrowImpact, 0.98)],

  // --- spells: four recordings, re-pitched and layered into fourteen ---
  cast_fire_bolt: [layer(SORCERY.fire, 0.98, 1.15)],
  /** Frost: dark sorcery pitched up into a hiss, a high shimmer of the miracle over it. */
  cast_ray_of_frost: [layer(SORCERY.dark, 0.84, 1.45), layer(SORCERY.miracle, 0.35, 1.6)],
  cast_chill_touch: [layer(SORCERY.dark, 0.98, 0.85)],
  cast_eldritch_blast: [layer(SORCERY.dark, 0.98), layer(SORCERY.fire, 0.49, 0.75)],
  /** An insult with teeth: a high, snarling cackle. */
  cast_vicious_mockery: [layer(SORCERY.dark, 0.7, 1.6), layer(CREATURE.houndGrowl, 0.42, 1.5)],
  cast_sacred_flame: [layer(SORCERY.miracle, 0.84, 1.25), layer(SORCERY.fire, 0.49, 1.3)],
  cast_chromatic_orb: [layer(SORCERY.fire, 0.84, 0.8), layer(SORCERY.dark, 0.49, 1.2)],
  /** Three darts, three casts in quick succession. */
  cast_magic_missile: [layer(SORCERY.dark, 0.63, 1.3), layer(SORCERY.dark, 0.56, 1.4, 70), layer(SORCERY.dark, 0.49, 1.5, 140)],
  /** A sheet of flame: the cast with a dragon's breath under it. */
  cast_burning_hands: [layer(SORCERY.fire, 0.98), layer(CREATURE.dragonFire, 0.63, 1.2)],
  /** A boom and a gust: a slowed blast with great wings beating behind it. */
  cast_thunderwave: [layer(SORCERY.explode, 1, 0.7), layer(CREATURE.dragonWings, 0.7, 0.8)],
  cast_guiding_bolt: [layer(SORCERY.miracle, 0.77, 1.4), layer(SORCERY.fire, 0.56, 1.2)],
  cast_healing_word: [layer(SORCERY.miracle, 0.84, 1.15)],
  cast_cure_wounds: [layer(SORCERY.miracle, 0.98)],
  /** Where a spell strikes, by the kind of damage it does. */
  impact_fire: [layer(SORCERY.explode, 0.84, 1.15)],
  impact_frost: [layer(BLADE.armor, 0.56, 1.7), layer(SORCERY.explode, 0.35, 1.6)],
  impact_dark: [layer(SORCERY.dark, 0.56, 1.7), layer(BLADE.flesh, 0.49, 0.8)],
  impact_holy: [layer(SORCERY.miracle, 0.49, 1.8), layer(SORCERY.explode, 0.42, 1.4)],
  impact_force: [layer(SORCERY.explode, 0.56, 1.5), layer(BLADE.flesh, 0.49)],

  // --- enemies: five voices from four creatures' recordings ---
  /** Goblins: the plague hound's snarls and bites, pitched up to something smaller and meaner. */
  goblin_alert: [layer(CREATURE.houndGrowl, 0.84, 1.2)],
  goblin_attack: [layer(CREATURE.houndBite, 0.77, 1.2)],
  goblin_hurt: [layer(CREATURE.houndGrowl, 0.63, 1.35)],
  goblin_die: [layer(CREATURE.houndDie, 0.98, 1.2)],
  /** Orcs and goblin warriors: the hollow soldier, deeper. */
  soldier_alert: [layer(CREATURE.giantRoar, 0.56, 1.35)],
  soldier_attack: [layer(CREATURE.soldierAttack, 0.84, 0.9)],
  soldier_hurt: [layer(CREATURE.soldierHurt, 0.77, 0.9)],
  soldier_die: [layer(CREATURE.soldierDie, 1, 0.9)],
  /** Skeletons: the hollow soldier, drier and higher, and bones breaking as they fall. */
  skeleton_alert: [layer(CREATURE.soldierHurt, 0.63, 1.25)],
  skeleton_attack: [layer(CREATURE.soldierAttack, 0.77, 1.15)],
  skeleton_hurt: [layer(CREATURE.soldierHurt, 0.63, 1.2), layer(BLADE.bone, 0.28, 1.4)],
  skeleton_die: [layer(CREATURE.soldierDie, 0.84, 1.2), layer(BLADE.bone, 0.84, 0.9, 120)],
  /** Trolls: the giant knight, with a dragon's roar when it spots you. */
  troll_alert: [layer(CREATURE.dragonRoar, 0.84, 1.15)],
  troll_attack: [layer(CREATURE.giantSlam, 0.98)],
  troll_hurt: [layer(CREATURE.giantRoar, 0.49, 1.3)],
  troll_die: [layer(CREATURE.giantDie, 1)],
  /** A troll's tread shakes the floor. */
  troll_step: [layer(GIANT_STEPS, 0.63, 1.1)],
  /** Wizards: a soldier's voice, and dark sorcery in their attacks and their last breath. */
  wizard_alert: [layer(SORCERY.dark, 0.7, 0.7)],
  wizard_attack: [layer(SORCERY.dark, 0.7, 1.25), layer(CREATURE.soldierAttack, 0.42, 1.1)],
  wizard_hurt: [layer(CREATURE.soldierHurt, 0.7, 1.1)],
  wizard_die: [layer(CREATURE.soldierDie, 0.84, 1.05), layer(SORCERY.dark, 0.63, 0.6, 150)],
  /** A nest torn down: a great slam and the fanfare for a foe felled. */
  nest_destroyed: [layer(CREATURE.giantSlam, 0.84, 0.8), layer(INTERFACE.felled, 0.7)],
  /** A great foe (see BOSS_FOES) falls: the fanfare, for the whole party. */
  foe_felled: [layer(INTERFACE.felled, 0.84)],

  // --- the world ---
  chest_open: [layer(WORLD.chest, 1)],
  door_open: [layer(WORLD.door, 1)],
  /** The exit: through the fog gate to the level below. */
  level_exit: [layer(WORLD.fogGate)],
  /** A barrel, crate, coffin or sack opened and rummaged through. */
  search: [layer(WORLD.chest, 0.5, 1.25), layer(KNIGHT.roll, 0.7, 0.85, 120)],
  /** The party rests by a kindled fire. */
  rest: [layer(WORLD.kindle, 1)],
  coin: [layer(file('/sound/Small Coin.wav'))],
  coin_big: [layer(file('/sound/Big Coin.wav'))],
  gem: [layer(file('/sound/Gem.wav'))],
  gem_big: [layer(file('/sound/Big Gem.wav'))],
  fall: [layer(file('/sound/Fall.wav'))],
  falling: [layer(file('/sound/falling_male.wav'))],

  // --- interface ---
  level_up: [layer(INTERFACE.levelUp, 1)],
  you_died: [layer(INTERFACE.youDied, 1)],
  /** Something goes into a bag: picked up, given, or won in a roll. */
  pickup: [layer(INTERFACE.pickUp, 0.84)],
  /** Bought: the item into the bag, and the coins out of the purse. */
  buy: [layer(INTERFACE.pickUp, 0.77), layer(file('/sound/Small Coin.wav'), 0.84, 1, 80)],
  fail: [layer(INTERFACE.error, 0.7)],
  /** Inventory, shop, pause menu, a HUD dialog or a pop-up menu opens. */
  dialog: [layer(DIALOG_CLICK, 0.84)],
  /** Any button pressed. */
  click: [layer(BUTTON_CLICK, 0.63)],
  /** A menu screen opens: settings, key bindings, the character select, the co-op lobby. */
  open_menu: [layer(INTERFACE.openMenu, 0.56)],
} as const satisfies Record<string, readonly Layer[]>;

export type SfxName = keyof typeof SFX;

/** The cries each enemy makes: on spotting a hero, as it swings, when it is hurt and as it dies. */
export type MobCries = {
  readonly alert: SfxName; readonly attack: SfxName; readonly hurt: SfxName; readonly die: SfxName;
  /** A footfall heavy enough to be heard (only the biggest enemies). */
  readonly step?: SfxName;
};

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
  troll: { ...cries('troll'), step: 'troll_step' },
  ghost_wizard: cries('wizard'),
  evil_wizard: cries('wizard'),
} as const satisfies Record<MobType, MobCries>;

/** Enemies whose fight has the boss music, and whose fall the fanfare for a foe felled. */
export const BOSS_FOES: ReadonlySet<MobType> = new Set<MobType>(['troll', 'evil_wizard']);

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
  guiding_bolt: 'cast_guiding_bolt',
  healing_word: 'cast_healing_word',
  cure_wounds: 'cast_cure_wounds',
} as const satisfies Record<SpellId, SfxName>;

export const SPELL_IMPACTS = {
  fire: 'impact_fire',
  acid: 'impact_fire',
  poison: 'impact_dark',
  cold: 'impact_frost',
  necrotic: 'impact_dark',
  psychic: 'impact_dark',
  radiant: 'impact_holy',
  force: 'impact_force',
  lightning: 'impact_force',
  thunder: 'impact_force',
} as const satisfies Record<SpellDamageType, SfxName>;

export const SFX_NAMES: readonly SfxName[] = Object.keys(SFX).filter((name) => hasKey(SFX, name));

/** The effects the menus play, loaded behind the loading screen; every other one loads lazily, in the background. */
export const MENU_SOUNDS: readonly SfxName[] = ['click', 'open_menu', 'dialog', 'fail'];

/** Every clip the given effects play (a recording once for each effect layer that uses it). */
export function clipsOf(names: readonly SfxName[]): Clip[] {
  return names.flatMap((name) => SFX[name].flatMap((l: Layer) => l.clips));
}

/** Every clip any effect plays. */
export function allClips(): Clip[] {
  return clipsOf(SFX_NAMES);
}

// --- music ---

/** A piece of music: its files, played in turn and round again, and how loud it sits in the mix (0..1). */
export type Track = { readonly files: readonly string[]; readonly level: number };

/** Every take of a recording, as files. */
const allTakes = (name: string): string[] => takes(name).map((clip) => clip.file);

export const MUSIC_TRACKS = {
  /** The title, settings, character select and co-op lobby. */
  menu: { files: ['/audio/music/main_theme_loop_03.webm'], level: 0.7 },
  /** Exploring a level: the two exploration loops, one after the other. */
  explore: { files: ['/audio/music/dark-fantasy-exploration-1.ogg', '/audio/music/dark-fantasy-exploration-2.ogg'], level: 0.4 },
  /** Enemies engaged nearby. */
  combat: { files: ['/audio/music/dark-fantasy-combat.ogg'], level: 0.5 },
  /** A fight with a great foe (BOSS_FOES). */
  boss: { files: allTakes('music/boss_battle_loop'), level: 0.5 },
  /** The level's summary, by the fire, before going deeper. */
  rest: { files: allTakes('music/bonfire_rest_loop'), level: 0.5 },
  /** The run is over. */
  lament: { files: allTakes('music/lament_loop'), level: 0.55 },
} as const satisfies Record<string, Track>;

export type TrackName = keyof typeof MUSIC_TRACKS;

// --- ambience ---

/**
 * A looping bed of sound under the music: one of its takes (picked at random for the game), and how loud it is at
 * full strength (0..1, times the sound volume). The area beds fade with where the hero stands; the others swell
 * with nearness to what makes them.
 */
export type Ambience = { readonly takes: readonly string[]; readonly level: number };

export const AMBIENCE = {
  /** The safe room: a hushed, ruined chapel. */
  cathedral: { takes: allTakes('ambience/ruined_cathedral_loop'), level: 0.25 },
  /** Cave halls: dripping, and something in the dark water. */
  swamp: { takes: allTakes('ambience/cursed_swamp_loop'), level: 0.25 },
  /** The catacombs' halls and rooms, by depth (HALL_BEDS): stone and echoes, water seeping through, a war above. */
  catacombs: { takes: allTakes('ambience/catacombs_loop'), level: 0.25 },
  rain: { takes: allTakes('ambience/rain_loop'), level: 0.22 },
  battlefield: { takes: allTakes('ambience/distant_battlefield_loop'), level: 0.22 },
  /** A draught from the way down, near the exit. */
  wind: { takes: allTakes('ambience/wind_loop'), level: 0.28 },
  /** Torches and campfires, close by. */
  crackle: { takes: allTakes('world/bonfire_crackle_loop'), level: 0.35 },
  /** Goblin war drums, from a nest that still stands. */
  drums: { takes: allTakes('world/war_drum_beat_loop'), level: 0.35 },
} as const satisfies Record<string, Ambience>;

export type AmbienceName = keyof typeof AMBIENCE;
export const AMBIENCE_NAMES: readonly AmbienceName[] = Object.keys(AMBIENCE).filter((name) => hasKey(AMBIENCE, name));

/** The bed under the catacombs' halls on each depth, round again after the last. */
export const HALL_BEDS: readonly AmbienceName[] = ['catacombs', 'rain', 'battlefield'];
