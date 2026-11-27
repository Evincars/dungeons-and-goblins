import type { VfxEffectId } from './render/Vfx';
import { World } from 'miniplex';
import type { Sprite, Container, Graphics } from 'pixi.js';
import type { PixelLabel } from './ui/PixelText';
import type { CharacterState } from './characters/CharacterDef';
import type { DropTableId } from './entities/Drops';
import type { ItemBase } from './rules/Equipment';
import type { HeroClassId } from './rules/Classes';
import type { Build } from './rules/Build';
import type { WeaponBase } from './rules/WeaponTable';
import type { AttackProfile } from './rules/Combat';
import type { Dice, DieSides } from './rules/Dice';
import type { SpellId } from './rules/Spells';
import type { QuickBinding } from './rules/Spellbook';
import type { ThrowableId } from './rules/Throwables';
import type { DamageType } from './rules/DamageTypes';
import type { EffectColour, EffectShape } from './assets/Effects';
import type { HoldKind } from './rules/Conditions';
import type { SpellVariant } from './rules/SpellVariants';

export const enum Team { Neutral = 0, Player = 1, Mob = 2 }

export const enum Facing { North = 0, East = 1, South = 2, West = 3 }

/** Where a player wears or holds gear, in the order the inventory screen lists them. */
export const EQUIP_SLOTS = ['head', 'armor', 'primary', 'secondary', 'medal', 'other'] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

export function isEquipSlot(value: string): value is EquipSlot {
  return EQUIP_SLOTS.some((slot) => slot === value);
}

/** What kind of gear an item is, which decides the slots it fits (see entities/Items.ts). */
export const GEAR_KINDS = ['head', 'armor', 'weapon', 'offhand', 'trinket', 'medal'] as const;
export type GearKind = (typeof GEAR_KINDS)[number];

export function isGearKind(value: unknown): value is GearKind {
  return GEAR_KINDS.some((kind) => kind === value);
}

/** A character's attributes, shown on the inventory screen; gear adds to them. */
export const STAT_NAMES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;
export type StatName = (typeof STAT_NAMES)[number];
export type ItemStats = Partial<Record<StatName, number>>;

export function isStatName(value: unknown): value is StatName {
  return STAT_NAMES.some((stat) => stat === value);
}

export const ITEM_TYPES = ['weapon', 'shield', 'helmet', 'armor', 'boots', 'ring', 'medal'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export function isItemType(value: unknown): value is ItemType {
  return ITEM_TYPES.some((type) => type === value);
}

export type InventoryItem = {
  type: ItemType;
  name: string;
  value: number;
  /** The catalogue entry it came from (src/data/*.json), if any. */
  id?: string;
  /** What sort of weapon or thing it is ('bow', 'axe'…), for game rules and tooltips. */
  kind?: string;
  /** The D&D weapon or armour it plays as (its damage dice or Armor Class, src/rules/). */
  base?: ItemBase;
  /** Magic +1…+3: to hit and damage for a weapon, to Armor Class for armour or a shield. */
  bonus?: number;
  /** Equipment fits the slots of its kind; anything without one only goes in the bag. */
  gear?: GearKind;
  /** Texture key of its picture. */
  icon?: string;
  stats?: ItemStats;
  /** Kilograms it weighs; what a player carries is limited. */
  weight?: number;
  /**
   * A weapon's damage of another kind on every hit, on top of its own (a flaming sword's 1d4 fire): rolled with the blow
   * (doubled on a critical), and fire sets the one struck alight for a couple of rounds (systems/WeaponHits.ts).
   */
  extraDamage?: { count: number; sides: DieSides; type: DamageType };
};

/** A square of the bag: an item, or empty (the bag keeps items where they were put). */
export type BagSquare = InventoryItem | null;

/** How a line of the roll log reads: a hit, a miss, a natural 20 or 1, or the damage dealt. */
export const ROLL_TONES = ['hit', 'miss', 'crit', 'fumble', 'damage', 'heal', 'gold'] as const;
export type RollTone = (typeof ROLL_TONES)[number];

export function isRollTone(value: unknown): value is RollTone {
  return ROLL_TONES.some((tone) => tone === value);
}

/** An effect from the library (assets/Effects.ts): its shape, colour and size. */
export type SpellEffect = { shape: EffectShape; colour: EffectColour; scale: number };

/** The strip a projectile bursts in when it strikes (a caster's own spell art): its sheet, frames and size. */
export type ProjectileBurst = { sheet: string; first: number; count: number; frameTime: number; scale: number };

/** One line over a fighter's head ("17 to hit", "7 dmg"), and the ticks it has been shown. */
export type RollLine = { text: string; tone: RollTone; age: number };

/**
 * How a blow went: a hit, a miss, a natural 20 or a natural 1; for spells also one that needs no roll (magic
 * missile, a failed save: `auto`), a save that halved it (`saved`) and a healing (`heal`).
 */
export const BLOW_RESULTS = ['hit', 'miss', 'crit', 'fumble', 'auto', 'saved', 'heal'] as const;
export type BlowResult = (typeof BLOW_RESULTS)[number];

export function isBlowResult(value: unknown): value is BlowResult {
  return BLOW_RESULTS.some((result) => result === value);
}

/**
 * What the combat log writes besides blows: coins a hero was paid (`gold`, the sum in `damage`), a roll of
 * need for a rare find (`need`, the d20 in `total`), who won it (`won`), and an `event` of the run (see LOG_EVENTS).
 */
export const LOG_RESULTS = [...BLOW_RESULTS, 'gold', 'need', 'won', 'event'] as const;
export type LogResult = (typeof LOG_RESULTS)[number];

export function isLogResult(value: unknown): value is LogResult {
  return LOG_RESULTS.some((result) => result === value);
}

/**
 * The things that happen in a run besides blows, each written to the combat log: rests (hit dice spent in `total`, hit
 * points regained in `damage`), hit points regained, a kill or a death (`item`: who), a level reached (`total`), and
 * the choices of the level panel (`item`: the feat, the improved abilities, the style, archetype or what was learnt).
 */
export const LOG_EVENTS = [
  'short_rest', 'long_rest', 'regain', 'slain', 'died', 'level_up', 'feat', 'improve', 'build', 'style', 'archetype',
  'learns', 'feature', 'parry', 'riposte', 'trap',
] as const;
export type LogEvent = (typeof LOG_EVENTS)[number];

export function isLogEvent(value: unknown): value is LogEvent {
  return LOG_EVENTS.some((event) => event === value);
}

/**
 * One line of the combat log: who (a player by name, an enemy by kind), what they rolled, how it went and the
 * damage (or coins); `spell` and `item` name what it was about, `event` which event it records. `seq` counts up, so a
 * screen shows each once.
 */
export type CombatLogEntry = {
  seq: number; actor: 'player' | 'mob'; name: string; total: number; result: LogResult; damage: number; spell?: SpellId; item?: string;
  event?: LogEvent;
};

/**
 * The quick bar: a row of squares on its keys (Q R T 1–5 X C, game/Settings.ts `QUICK_KEYS`), each key casting
 * its square at once, and a second row behind it reached with Shift and the same keys. Squares are numbered row by
 * row: the second row's first square is QUICK_ROW.
 */
export const QUICK_ROW = 10;
export const QUICK_ROWS = 2;
export const QUICK_SLOTS = QUICK_ROW * QUICK_ROWS;

/** A short rest (spells recovered, out of the enemies' sight) or a long one (all healed, in the safe room). */
export const REST_KINDS = ['short', 'long'] as const;
export type RestKind = (typeof REST_KINDS)[number];

export function isRestKind(value: unknown): value is RestKind {
  return REST_KINDS.some((kind) => kind === value);
}

/** What the party may be asked to agree to: a rest, or opening the safe room's gate (the lever). */
export const VOTE_KINDS = [...REST_KINDS, 'gate'] as const;
export type VoteKind = (typeof VOTE_KINDS)[number];

export function isVoteKind(value: unknown): value is VoteKind {
  return VOTE_KINDS.some((kind) => kind === value);
}

/** What the screen says about a vote: a rest taken, a vote asked for, turned down or unanswered, or why it can't be now. */
export const REST_NOTICES = ['short_done', 'long_done', 'asked', 'declined', 'timeout', 'hunted', 'unsafe', 'no_short_left'] as const;
export type RestNotice = (typeof REST_NOTICES)[number];

export function isRestNotice(value: unknown): value is RestNotice {
  return REST_NOTICES.some((notice) => notice === value);
}

/** How many hit dice each hero will spend in a short rest, by seat (no entry: none). */
export type HitDiceChoices = Partial<Record<PlayerSlot, number>>;
/**
 * Something asked of the party in co-op: by whom, who has agreed so far (the asker included), and ticks left to answer.
 * For a short rest, `dice`: the hit dice each who agreed chose to spend in it.
 */
export type PartyVote = { kind: VoteKind; by: PlayerSlot; agreed: PlayerSlot[]; ticks: number; dice?: HitDiceChoices };
/** The notice over the screen: which, about whom and which vote, and the ticks it has shown. */
export type PartyNoticeShown = { notice: RestNotice; name: string; kind: VoteKind; age: number };

/** A Need or Pass on a rare find; a player who hasn't chosen yet has no entry. */
export type LootChoice = 'need' | 'pass';

/** What a hero in the exit room answers once someone uses the exit portal: on to the next level, or end the run here. */
export const DEPART_CHOICES = ['next', 'end'] as const;
export type DepartChoice = (typeof DEPART_CHOICES)[number];

export function isDepartChoice(value: unknown): value is DepartChoice {
  return DEPART_CHOICES.some((choice) => choice === value);
}

/** The undead Animate Dead raises. */
export const SUMMON_KINDS = ['zombie', 'skeleton'] as const;
export type SummonKind = (typeof SUMMON_KINDS)[number];

export function isSummonKind(value: unknown): value is SummonKind {
  return SUMMON_KINDS.some((kind) => kind === value);
}

/** What a Transmuter's Stone gives its carrier: 10 feet of speed, or training in Constitution saving throws. */
export const TRANSMUTER_STONES = ['speed', 'constitution'] as const;
export type TransmuterStone = (typeof TRANSMUTER_STONES)[number];

export function isTransmuterStone(value: unknown): value is TransmuterStone {
  return TRANSMUTER_STONES.some((stone) => stone === value);
}

/**
 * What covers a patch of floor (systems/LastingSpells.ts, systems/Surfaces.ts): water, water a thunder spell has charged with
 * lightning, slick grease (the Grease spell, a thrown grease bottle: difficult terrain where feet slip), or fire (alchemist's
 * fire, grease set alight: it burns whoever stands in it), or webs (Web: difficult terrain that holds whoever fails to slip
 * through, and burns away in a breath).
 */
export const SURFACE_KINDS = ['water', 'shock', 'grease', 'fire', 'web'] as const;
export type SurfaceKind = (typeof SURFACE_KINDS)[number];

export function isSurfaceKind(value: unknown): value is SurfaceKind {
  return SURFACE_KINDS.some((kind) => kind === value);
}

/** The frame of the puddle art (assets/SpriteGen.ts genPuddleSheet) each kind of puddle shows. */
export const PUDDLE_FRAMES = { water: 0, shock: 1, grease: 2, fire: 3, web: 4 } as const satisfies Record<SurfaceKind, number>;

/**
 * A spell holding a body in a condition (systems/SpellHolds.ts): the spell, the ticks it may still last, its caster's entity id,
 * the DC of the save that ends it and the ticks until that save comes round again (at the end of each of its turns).
 */
export type SpellHold = { spell: SpellId; ticks: number; by: number; dc: number; pulse: number };

/** The kinds of damage that leave their mark on a body for a while after the blow (systems/Afflictions.ts). */
export const AFFLICTION_KINDS = ['fire', 'poison', 'acid', 'cold', 'lightning'] as const;
export type AfflictionKind = (typeof AFFLICTION_KINDS)[number];

export function isAfflictionKind(value: unknown): value is AfflictionKind {
  return AFFLICTION_KINDS.some((kind) => kind === value);
}
/** The puddle art's circle is this wide (px of its radius) at scale 1: a patch of another radius is scaled to fit. */
export const PUDDLE_ART_RADIUS = 48;

/** Who controls a player character: the host, or one of up to three guests in a co-op room. */
export const PLAYER_SLOTS = ['host', 'p2', 'p3', 'p4'] as const;
export type PlayerSlot = (typeof PLAYER_SLOTS)[number];

export function isPlayerSlot(value: unknown): value is PlayerSlot {
  return PLAYER_SLOTS.some((slot) => slot === value);
}

/** The goblin_* kinds are the three goblins drawn in /other-orcs, the wizards have art of their own; the rest share the old orc art. */
export const MOB_TYPES = [
  'goblin', 'skeleton', 'orc', 'troll', 'goblin_grunt', 'goblin_rogue', 'goblin_warrior', 'ghost_wizard', 'evil_wizard',
  // The isometric castle's own (characters/IsoFoes.ts).
  'shade', 'grick',
] as const;
export type MobType = (typeof MOB_TYPES)[number];

export function isMobType(value: string): value is MobType {
  return MOB_TYPES.some((type) => type === value);
}

/**
 * What an enemy is doing (its Yuka StateMachine state): ambling about unaware, the beat after it
 * spots someone, the fight itself, and the hunt along the player's trail once it has lost sight of them.
 */
export const MOB_STATES = ['idle', 'alert', 'engage', 'search'] as const;
export type MobState = (typeof MOB_STATES)[number];

/**
 * How an engaged enemy fights as part of its squad: straight at the player, round the block to take
 * them from behind, or over to an ally that needs help.
 */
export const TACTIC_ROLES = ['direct', 'flank', 'support'] as const;
export type TacticRole = (typeof TACTIC_ROLES)[number];

/** Enemy brain state; the decisions themselves live in src/ai. */
export type MobAI = {
  state: MobState;
  role: TacticRole;
  /** Player being hunted. */
  targetId?: number;
  /** Ally being helped while in the support role. */
  allyId?: number;
  /** Tiles still to walk, as `tx + ty * width`; `step` is the next one. */
  route: number[];
  step: number;
  /** Tile the route leads to (-1 when there is none). */
  routeGoal: number;
  /** Ticks until the route is planned again. */
  repathIn: number;
  /** Ticks until it next looks around for players. */
  senseIn: number;
  /** Ticks spent in the current state. */
  stateTicks: number;
  /** Ticks during which it ignores players after being dropped from a crowded squad. */
  calmTicks: number;
  /** Where the target was last seen (by it or by its squad), and on which tick. */
  lastSeenX: number;
  lastSeenY: number;
  lastSeenTick: number;
  /** Tick of the newest trail crumb it has already walked past while searching. */
  trailTick: number;
};

/**
 * The way a player walked, as a ring of the tile centres they entered, oldest overwritten first.
 * Enemies that lose sight of a player follow it to where they went.
 */
export type Trail = {
  xs: Float32Array;
  ys: Float32Array;
  ticks: Float64Array;
  /** Next slot to write. */
  head: number;
  count: number;
  /** Tile the newest crumb was dropped on. */
  lastTile: number;
};

export type Entity = {
  // --- spatial ---
  position?: { x: number; y: number };
  velocity?: { x: number; y: number };
  radius?: { x: number; y: number };
  blocking?: true;
  physicsSlide?: true;

  // --- team ---
  team?: Team;

  // --- health / combat ---
  health?: { current: number; max: number };
  hurtTime?: number;
  /** Ticks left on a mob's attack animation, started when it lands a hit. */
  attackTime?: number;
  /** Ticks until an enemy may start its next attack (a second from the last one's start, however it went). */
  attackCooldown?: number;
  freezeTime?: number;
  bounceWallTime?: number;
  deathPoints?: number;

  // --- movement ---
  facing?: number;
  speed?: number;
  friction?: number;
  aimVector?: { x: number; y: number };
  walkTime?: number;
  bump?: { x: number; y: number };
  chasing?: boolean;

  // --- rendering ---
  /**
   * `rotation`: radians the sprite is turned (an arrow points where it flies). `fit`: drawn so its longer
   * side is this many pixels, whatever size its art is — the whole picture, not a frame of it (icons of things
   * lying on the floor).
   */
  /** `size`: drawn exactly this big (px), whatever size its art is (a portcullis fills its doorway). */
  visual?: { sheet: string; col?: number; row?: number; scale?: number; rotation?: number; fit?: number; tint?: number; alpha?: number; size?: { w: number; h: number } };
  frame?: number;
  sprite?: Sprite;
  container?: Container;
  yOffset?: number;
  flashTime?: number;
  healthBarOffset?: number;
  healthBar?: { container: Container; fill: Sprite };
  hurtOverlay?: Sprite;
  /** The stamina bar under a player while their sprint is used up (presentation only). */
  sprintBar?: Sprite;
  fallMask?: Graphics;
  mobType?: MobType;
  /** The weapon an enemy carries (its dice, src/rules/WeaponTable.ts), picked when it spawns. */
  mobWeapon?: WeaponBase;
  /**
   * An enemy spellcaster (systems/EnemyRangedSystem.ts): the level it casts at, the ability it casts with, its spells (the
   * heroes' own, src/data/spells.json) and each one's recovery (ticks). The host's alone: guests never see it.
   */
  mobCaster?: { level: number; ability: StatName; spells: SpellId[]; recovery: number[] };
  /** A player's hero class (src/data/classes.json): their abilities, hit points and training. */
  heroClass?: HeroClassId;
  /** What the player decided for their hero: bought ability scores, fighting style, Improvements (src/rules/Build.ts). */
  build?: Build;
  /** The class features the player switched off (rules/ClassFeatures.ts): a passive stays off until they switch it on again. */
  featuresOff?: string[];
  /** Ticks until a Protection fighting style protects an ally again (systems/ProtectionSystem.ts). */
  protectCooldown?: number;
  /** Ticks until a Champion's Survivor mends the hero again (systems/FeatureSystem.ts). */
  survivorCooldown?: number;
  /** Ticks left of Action Surge: every swing and volley makes twice its attacks, played at double speed (systems/FeatureSystem.ts). */
  actionSurge?: number;
  /** Ticks left of a Champion's Remarkable Athlete: the hero moves at twice their speed (systems/FeatureSystem.ts). */
  athleteBoost?: number;
  /** Ticks until a Fighter's Indomitable rerolls a failed saving throw again (systems/FeatureSystem.ts; a rest makes it ready). */
  indomitableCooldown?: number;
  /** The toggle Passive Feats switched on from the quick bar (Great Weapon Master's and Sharpshooter's -5/+10, rules/Feats.ts). */
  featsOn?: string[];
  /** Great Weapon Master: a critical hit or a kill earned an attack more for the next swing (systems/SwordSystem.ts). */
  bonusAttack?: boolean;
  /** Ticks until Defensive Duellist turns another blow aside (systems/CombatSystem.ts; a rest makes it ready). */
  duelistCooldown?: number;
  /** The Battle Master's superiority dice left (none set: all of them; a rest restores them, systems/ManeuverSystem.ts). */
  superiorityLeft?: number;
  /**
   * The maneuver the hero has readied (a feature id, src/rules/Maneuvers.ts), the ticks it waits for its moment, and the
   * die rolled for it when that die is rolled up front (Evasive Footwork's Armor Class, a commanded ally's damage, Rally's hit points).
   */
  maneuver?: { id: string; ticks: number; bonus: number };
  /** Hit points the hero loses before their own (Rally's temporary hit points). */
  tempHealth?: number;
  /**
   * What a hero's maneuvers or spells have done to a foe, as ticks left of each: tripped, frightened, goaded (disadvantage
   * against anyone but `by`, the entity id of whoever did it), distracted (the next attacker of someone else has advantage)
   * eldritch (its next saving throw against a spell is at disadvantage) and charmed (an enchanter's Hypnotic Gaze or an
   * illusion holds it: it stands still and strikes nobody until the ticks run out or it is hurt), and asleep (Sleep: it lies
   * unconscious until the ticks run out or it is hurt, systems/SleepSpell.ts; left out until a foe is first lulled).
   */
  status?: { prone: number; frightened: number; goaded: number; distracted: number; eldritch: number; charmed: number; by: number; asleep?: number };
  /**
   * What a wizard's school keeps going between uses (systems/SchoolSystem.ts): the Arcane Ward's strength; the Portent dice
   * foreseen and the ticks until a used one is foreseen again; the ticks until Grim Harvest, Instinctive Charm, Illusory Self and
   * Song of Defence work again; the ticks of Bladesong left; and the Transmuter's Stone carried ('' for none). The Bladesong's
   * charges to start it (`songCharges`, all back with a long rest or a new depth) and the Bladesong Charges gathered while
   * it is sung, for its Climax (`damageCharges` from spells, `healingCharges` from weapon attacks). The Third Eye's
   * darkvision and the sight of the invisible (Third Eye, an illusionist's See Invisibility), on until a long rest. The ticks
   * until Split Enchantment works again.
   */
  arcana?: {
    ward: number; portent: number[]; portentTicks: number; harvestTicks: number; charmTicks: number; illusoryTicks: number;
    songTicks: number; defenceTicks: number; stone: TransmuterStone | '';
    songCharges: number; damageCharges: number; healingCharges: number;
    darkvision: boolean; seeInvisible: boolean; splitTicks: number;
  };
  /**
   * An evoker's Sculpt Spells bubble where their Evocation spell landed (systems/SchoolSystem.ts): its maker's entity id, the
   * ticks it lasts and how wide it is (px). Every hero in it succeeds on every saving throw.
   */
  sculpt?: { owner: number; ticks: number; radius: number };
  /**
   * An illusionist's dummy (Improved Minor Illusion, systems/DecoySystem.ts): its maker's entity id, its Armor Class and the
   * ticks it lasts. Foes lured to it strike it until it is gone.
   */
  decoy?: { owner: number; ac: number; ticks: number };
  /** A foe lured by an illusion: the entity id of the dummy it goes for and strikes, and nobody else, until it is gone. */
  lured?: number;
  /**
   * A foe nobody sees coming (invisible): it wins the first strike outright when it closes in, unless the hero it hunts has
   * the Alert feat, who rolls initiative as usual (systems/InitiativeSystem.ts).
   */
  unseen?: boolean;
  /** A hero's Charger rush under way (systems/FeatActions.ts): the foe's entity id and the ticks the rush may still take. */
  charge?: { target: number; ticks: number };
  /**
   * Spells that last on a hero (systems/LastingSpells.ts), as ticks left (0: off): Blade Ward and Stoneskin (resistance to
   * weapons' damage), Shield (+5 AC), True Strike (advantage on the next attack roll); Mage Armour is 1 while it lasts (until a
   * long rest). Cast on them by a companion or themselves (systems/AllySpells.ts): Longstrider (10 feet more speed) and
   * Protection from Evil and Good (undead attack them at disadvantage).
   */
  buffs?: {
    bladeWard: number; shield: number; mageArmor: number; stoneskin: number; trueStrike?: number; longstrider?: number; protection?: number;
    /** Blur (attacks at disadvantage), Mirror Image (its ticks, and the duplicates left), Shadow Blade (its ticks and dice). */
    blur?: number; mirrorImage?: number; images?: number; shadowBlade?: number; bladeDice?: number;
    /** Magic Weapon: its ticks, and the bonus it gives the weapon in hand (+1, more cast higher). */
    magicWeapon?: number; weaponBonus?: number;
  };
  /**
   * The conditions spells hold the body in (heroes and foes alike, systems/SpellHolds.ts): Hold Person's paralysis, Tasha's
   * laughter, Blindness/Deafness, Ray of Enfeeblement, Crown of Madness, Web.
   */
  spellHolds?: Partial<Record<HoldKind, SpellHold>>;
  /**
   * Invisible (systems/Invisibility.ts): the ticks it lasts and who made it so (a hero's companion holding it by concentration,
   * or a foe its own spell). It ends when the body attacks or casts a spell, or is revealed by See Invisibility.
   */
  invisible?: { ticks: number; by: number };
  /** See Invisibility (systems/Invisibility.ts): the ticks it lasts. Invisible creatures near are seen, and save or are revealed. */
  seesInvisible?: number;
  /** The mark a blow of fire, poison, acid, cold or lightning leaves on a body for a round (systems/Afflictions.ts). */
  afflicted?: { kind: AfflictionKind; ticks: number };
  /** A push under way (Gust of Wind): px a tick across and down, for this many ticks more; it may drive the body over a brink. */
  shove?: { x: number; y: number; ticks: number };
  /**
   * Gust of Wind (systems/GustOfWind.ts): its caster's entity id, the ticks it lasts and until it pushes again, and the way it
   * blows (it follows the caster and turns where they aim).
   */
  gust?: { owner: number; ticks: number; pulse: number; dirX: number; dirY: number; level: number };
  /**
   * The spell a hero holds by concentration (one at a time: another such spell ends it; damage may break it), the entity id of
   * what it made or holds (a zone, Dancing Lights, a fog cloud, the hero warded; -1: none) and the ticks it may still last (left
   * out: as long as what it holds lasts).
   */
  concentration?: { spell: SpellId; zone: number; ticks?: number };
  /**
   * A spell that lingers where it was cast (Cloud of Daggers, Cloudkill, Spirit Guardians…, systems/LastingSpells.ts): the
   * spell, its caster's entity id, the level it was cast at, the ticks it lasts and until it strikes again; `follow`: it
   * moves with its caster; `stopped`: a rolling one (Flaming Sphere) rammed someone and rolls no further for these ticks.
   */
  zone?: { spell: SpellId; owner: number; castLevel: number; ticks: number; pulse: number; follow: boolean; stopped?: number };
  /**
   * A patch of floor covered (Create Water, Grease, a thrown flask): what covers it, how wide (px), its maker's entity id, the
   * ticks until it strikes again (charged water, fire), the ticks it lasts (left out: for good) and the DC of the save its
   * grease asks (left out: the default).
   */
  surface?: { kind: SurfaceKind; radius: number; owner: number; pulse: number; ticks?: number; dc?: number };
  /**
   * Someone on fire (alchemist's fire, a fire surface): ticks left, ticks until the next round's burn, and who set them alight
   * (their entity id). Standing in water puts it out (systems/Surfaces.ts).
   */
  burning?: { ticks: number; pulse: number; by: number };
  /** A hero knocked off their feet (slipped on grease): ticks until they are up again; till then they neither move nor act. */
  knockedDown?: number;
  /** A flask an enemy carries to throw (src/data/throwables.json), and how many. */
  mobThrowable?: { item: ThrowableId; count: number };
  /**
   * A flask in the air (systems/ThrowSystem.ts): what it is, its thrower's entity id and team, where it was thrown from and
   * lands, the ticks it has flown and will fly; it bursts where it lands.
   */
  thrown?: { item: ThrowableId; owner: number; team: number; fromX: number; fromY: number; toX: number; toY: number; ticks: number; total: number };
  /**
   * Dancing Lights (systems/DancingLights.ts): the hovering lights' anchor — its caster's entity id, the ticks the spell
   * lasts, whether the lights circle their caster (else they hover where they were sent), the caster's spell DC (foes nearby
   * save against it or are drawn to the lights) and the ticks until they draw foes again.
   */
  dancingLights?: { owner: number; ticks: number; orbit: boolean; dc: number; pulse: number };
  /** One of the four lights of Dancing Lights: its anchor's entity id and its place round it (0–3). */
  wisp?: { of: number; index: number };
  /** A foe drawn to Dancing Lights: the anchor's entity id; it drifts over to gaze at them until hurt, or a hero comes close. */
  entranced?: number;
  /**
   * Fog Cloud (systems/FogCloud.ts): its caster's entity id, how wide it is (px) and the ticks it lasts. Whoever is in it is
   * heavily obscured (ai/perception/obscured.ts). `dark`: it is Darkness, black, and no light shines in it.
   */
  fogCloud?: { owner: number; radius: number; ticks: number; dark?: boolean };
  /** The damage type of the last blow a foe took (for its resistances, rules/Resistances.ts). */
  lastDamageType?: DamageType;
  /**
   * An undead a necromancer raised (systems/SummonSystem.ts): its kind, its master's entity id, and its blow (to hit,
   * damage), Armor Class and the ticks until it may strike again.
   */
  summon?: { kind: SummonKind; owner: number; attackBonus: number; damage: Dice; ac: number; cooldown: number };
  /** The dice rolls shown over the head, oldest first; each fades after a while (systems/RollLogSystem.ts). */
  rollLog?: RollLine[];
  /** The level's combat log (one entity holds it): the latest blows, newest last (systems/CombatLogSystem.ts). */
  combatLog?: { seq: number; entries: CombatLogEntry[] };
  /** Runtime display label (price etc.) */
  priceLabel?: PixelLabel;

  // --- animation ---
  animation?: {
    sheet: string;
    /** Frames count from this one of the strip (a strip holding a projectile's flight and its burst). */
    firstFrame?: number;
    frameX: number;
    frameY: number;
    frameCount: number;
    frameTime: number;
    timer: number;
    loop: boolean;
  };
  /**
   * Side-view character driven by a CharacterDef (see characters/ and the Character*System files):
   * the state picks the clip, `flipX` mirrors it to face left.
   */
  character?: {
    def: string;
    state: CharacterState;
    frame: number;
    timer: number;
    /** The current clip has shown its last frame (one-shot and hold clips). */
    finished: boolean;
    /** A one-shot state that has played out while its trigger still holds; it can't replay until the trigger lets go. */
    spent?: CharacterState;
    /** The blow of a swing chain whose clip is playing (a new blow restarts the swing clip). */
    blow?: number;
    /** The part of a frame step carried over when the clip plays faster than its own pace (a quick swing chain). */
    carry?: number;
    flipX: boolean;
  };

  // --- short-lived effects ---
  fx?: {
    age: number;
    duration: number;
    frames: number;
    /** The effect's frames start at this one of its strip (a projectile's burst after its flight). */
    first?: number;
    cycle?: boolean;
    scale?: number;
    rise?: number;
    orderId?: number;
    orderBias?: number;
    /** The entity (by id) the effect moves with: an aura. */
    follow?: number;
  };

  // --- player ---
  /** Which seat in the room controls this character. */
  playerSlot?: PlayerSlot;
  /** Name shown above the character in multiplayer. */
  playerName?: string;
  /** Controlled from elsewhere (a guest's browser, or the host's on a guest): local input never touches it. */
  remoteInput?: true;
  /** A remote player's crosshair, in world pixels (local players aim with this screen's pointer). */
  aimWorld?: { x: number; y: number };
  playerInput?: {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
    attack: boolean;
    use: boolean;
    sprint: boolean;
    mouseX: number;
    mouseY: number;
    mouseAiming: boolean;
    keyAim: { x: number; y: number } | null;
    /** The quick-bar square last picked (its key, or a click): the spell right click and the cast key cast. */
    spellSlot: number;
    /** One-tick commands raised by key presses; `swap` trades the 1st and 2nd weapon. */
    intents: { use: boolean; attack: boolean; cast: boolean; inventoryOpen: boolean; swap: boolean };
  };
  /** Breadcrumbs of where this player walked, for enemies to follow. */
  trail?: Trail;

  // --- spellcasting ---
  /** A spell being cast: its progress, the way it was aimed and the point it was aimed at, and which spell. */
  casting?: {
    ticks: number; dirX: number; dirY: number; released: boolean; spell?: SpellId; level?: number; targetX?: number; targetY?: number; damageType?: DamageType;
    /** What the caster picked when binding it (Blindness/Deafness: blinded or deafened, rules/SpellVariants.ts). */
    variant?: SpellVariant;
  };
  /**
   * Ticks until the spell on each quick-bar square can be cast again (0: ready), and what the player bound to
   * each square (a missing or empty entry: the class's own spell for that square, see rules/Spellbook.ts).
   */
  spellbook?: { recovery: number[]; bound?: (QuickBinding | null)[] };
  castCooldown?: number;
  /**
   * The initiative this fighter rolled when a fight broke out (d20 + DEX), and whether they won it: the
   * winner's next attack has advantage. A player's lasts `ticks` more (each new foe starts it again).
   */
  initiative?: { total: number; firstStrike: boolean; ticks: number };

  // --- projectiles ---
  /**
   * `arrow`: an arrow, which glints where it strikes. `attack`: the shooter's roll to hit and damage (rolled against the AC of whatever it strikes); `owner`:
   * the shooter's entity id, whose head shows the roll.
   */
  projectile?: {
    life: number; team: number; arrow?: boolean; attack: AttackProfile; owner?: number; burst?: ProjectileBurst;
    /** The spell it carries (for the combat log), whether it always hits (magic missile), and the effect it strikes with. */
    spell?: SpellId; autoHit?: boolean; impact?: SpellEffect;
    /** Ticks it waits in the caster's hand before it flies: a magic missile's darts go one after another. */
    wait?: number;
    /** The level the spell was cast at (a necromancer's Grim Harvest heals by it). */
    castLevel?: number;
    /** A shot's `life` once it has flown past its weapon's normal range: below it, the shot rolls with disadvantage. */
    closeLife?: number;
    /** Loosed with a hostile creature within 5 feet of the shooter (rules/CloseQuarters.ts): it rolls with disadvantage. */
    pressed?: boolean;
    /** The damage type the caster chose for it (Chromatic Orb), in place of its spell's own. */
    damageType?: DamageType;
  };

  /** Point light this entity emits (spell bolts, …). */
  glow?: {
    radius: number;
    /** A cold light (crystals) instead of firelight. */
    cool?: boolean;
    /** Phase of a flame's flicker; steady when left out. */
    flicker?: number;
  };
  playerStats?: {
    level: number;
    exp: number;
    gold: number;
    swordTier: number;
    /** Hit dice left to spend on healing (a level's worth at most; a long rest gives half back). */
    hitDice: number;
    sprinting: boolean;
    sprint: number;
    maxSprint: number;
    sprintLocked: boolean;
    kills: number;
    /** All gold picked up this level, whatever was spent since. */
    goldEarned: number;
    /** The share more coins enemies drop (from Charisma). */
    lootBonus: number;
    /** Over the run: damage dealt to foes, and the natural 20s and 1s of the hero's attack rolls (for the level's summary). */
    damageDealt: number;
    critHits: number;
    critMisses: number;
  };
  /** The bag, square by square (index = grid square); empty squares are null. */
  inventory?: BagSquare[];
  equipped?: Partial<Record<EquipSlot, InventoryItem>>;

  // --- sword melee ---
  /** Active swing hitbox: ticks remaining, direction, damage */
  swordSwing?: {
    /** Ticks before the blow lands (the attack clip's impact frame); then `ticks` with the hitbox live. */
    delay: number;
    ticks: number;
    dirX: number;
    dirY: number;
    range: number;
    /** Entities this blow already hit (a list: a swing meets a handful at most, and it travels as JSON). */
    hitIds: number[];
    /** A swing is a chain of blows (Extra Attack): this is blow `blow` (from 0) of `blows`. */
    blow: number;
    blows: number;
    /** The first blow is made with the off-hand weapon as well (a melee weapon in each hand). */
    offHand: boolean;
    /** How many times faster than its natural pace each blow plays (Action Surge, or a long chain squeezed into the second); the attack clip follows it. */
    tempo: number;
  };
  swordCooldown?: number;
  /** Ticks until the next arrow can be loosed. */
  arrowCooldown?: number;
  /** Arrows still to follow the one just loosed (Extra Attack shoots several in a row). */
  volley?: number;

  // --- loot ---
  loot?: {
    value: number;
    /** Index into LOOT_KINDS (entities/LootFactory.ts): which coin or gem it is. */
    kind: number;
    velX: number;
    velY: number;
    suckRadius: number;
    glide: number;
    age: number;
    life: number;
    burstTicks?: number;
  };

  // --- world item (picked up to inventory) ---
  /** A thing lying on the floor, picked up by walking over it. */
  item?: InventoryItem;

  // --- chest ---
  /** `drops`: the DROP_TABLES entry (entities/Drops.ts) it throws out when opened. */
  /**
   * A chest: opened yet, and what it holds (its drop table). `open`: the frame of its picture opened, when not the one
   * after its closed frame (the isometric castle's chests face four ways, each closed and open).
   */
  chest?: { opened: boolean; disappearTicks: number; drops: DropTableId; closed?: number; open?: number };

  // --- training dummy (safe room): takes every kind of hit, never falls ---
  /** `row`: the strip it is playing (0 idle, 1 a hit, 2 a heavy hit). */
  dummy?: { row: number };

  // --- spawner / nest ---
  spawner?: {
    mobType: MobType;
    interval: number;
    timer: number;
    spawnCount: number;
    maxSpawns: number;
  };
  spawnedBy?: number;

  // --- torch (light source) ---
  torch?: { radius: number; color: number; flicker: number };
  /** Sparks fly from its flame (a looping NixieFX effect, systems/VfxSystem.ts), this far above its position (px). */
  sparks?: { effect: VfxEffectId; lift: number };

  // --- AI ---
  ai?: MobAI;

  // --- falling ---
  /** A fall into a pit: how far it has gone, and the point inside the pit the faller is drawn down to (see HoleSystem.ts). */
  falling?: { age: number; duration: number; toX?: number; toY?: number };

  // --- ephemeral ---
  ephemeral?: { age: number; life: number; drop: number };

  // --- footstep / dust ---
  stepTimer?: number;
  dustTimer?: number;

  // --- dying ---
  /**
   * Ticks left of a death playing out (the death clip, then a moment lying still); 0 once it has. A fallen hero then
   * lies there until the party goes deeper (game/Fallen.ts); a dead enemy is cleared away.
   */
  respawnTicks?: number;

  // --- minimap ---
  minimapColor?: number;

  // --- dungeon room (ECS room metadata) ---
  room?: {
    id: number;
    type: 'safe' | 'dungeon' | 'exit';
    bounds: { x: number; y: number; w: number; h: number };
  };

  // --- safe zone (enemies can't attack inside) ---
  safeZone?: true;
  /** A hero standing in a safe room (the first one or the exit's), worked out each tick: only there are spells prepared. */
  inSafeRoom?: boolean;

  // --- the exit portal (players use it to leave the level) ---
  /**
   * The exit room's portal (systems/ExitSystem.ts): `activated` once used, while the heroes in the exit room choose;
   * what each has chosen so far; and what they decided once everyone there has (null until then).
   */
  exitButton?: { activated: boolean; choices: Partial<Record<PlayerSlot, DepartChoice>>; outcome: DepartChoice | null };

  // --- shop NPC ---
  /**
   * A trader: `items` its wares (never sold out), `resale` what heroes sold it, each bought back once (oldest first gone
   * when it holds MAX_RESALE, game/PlayerActions.ts); `gold` what it has to buy with (what heroes pay it adds to it).
   */
  shopNpc?: { items: InventoryItem[]; resale?: InventoryItem[]; gold?: number };

  // --- door (seals the safe room once players leave) ---
  /**
   * The starting safe room's door: `locked` until the lever is pulled (its doorway barred by a portcullis), then
   * open, and `closed` (walled up) once everyone has gone through. The exit room's door (`exit`) starts open and
   * shuts, for good, a few seconds after its own lever is pulled.
   */
  door?: {
    tiles: Array<{ x: number; y: number }>; boundaryX: number; closed: boolean; locked: boolean;
    /** Ticks until the opened gate shuts (null: not counting down). */
    closingTicks: number | null;
    exit?: true;
  };
  /**
   * A portcullis over a doorway tile: `lift` from 0 (down, barring the way) to 1 (risen out of sight); `dropping`
   * while it falls back down onto the doorway as the safe room is shut.
   */
  /** `rest`: how far up (yOffset) it is drawn when down over its doorway; `lift` 0 (down) to 1 (risen into the wall). */
  gate?: { lift: number; dropping?: boolean; rest: number };
  /**
   * The lever by the safe room's door: pulled opens the way into the dungeon (in co-op once everyone agrees).
   * `rest`: ticks before it can be pulled again after the others turned it down. The exit room's lever (`exit`) shuts
   * its door instead, once and for all.
   */
  lever?: { pulled: boolean; rest: number; exit?: true };
  /**
   * Something on the floor worth searching (an urn, a coffin, a bowl): the coins in it, found once, and (`gear`, a tomb's)
   * a piece of gear buried with its dead.
   */
  stash?: { coins: number; gear?: boolean };
  /** Mist breathes out of it (a portal; drawn by systems/MistSystem.ts, every screen for itself). */
  mist?: true;
  /**
   * A spike trap in the catacombs' floor (systems/TrapSystem.ts): the first hero to step on it springs it (`sprung`) and is
   * hurt; it stays up, harmless, from then on. `ticks`: how long since it was sprung (its spikes rise frame by frame).
   */
  spikeTrap?: { sprung: boolean; ticks: number };
  /**
   * A rare find the party rolls for: the item, the ticks left to choose, each player's Need or Pass, and the
   * id the host gave it (guests answer by it).
   */
  lootRoll?: { id: number; item: InventoryItem; ticks: number; choices: Partial<Record<PlayerSlot, LootChoice>> };
  /** The entity id of whoever last hurt this enemy (a shooter, not their arrow): they are paid for the kill. */
  lastHitBy?: number;
  /** The console's god mode: this hero takes no harm. */
  godMode?: true;

  // --- resting (one entity a level, sent to guests) ---
  /**
   * The party's rests: short rests left before a long rest is needed, a rest one player asked for that the
   * others must agree to, and the last word on it shown over the screen.
   */
  party?: { shortRestsLeft: number; vote: PartyVote | null; notice: PartyNoticeShown | null };

  // --- lifecycle ---
  removed?: true;
  /** Lies flat on the floor (a rug): drawn under every entity, just over the terrain. */
  flat?: true;
  /** A tall prop (a column, a rock spire) that clears over whoever stands behind it (render/SeeThrough.ts). */
  seeThrough?: true;
  /**
   * Built on every machine from the level seed (torches, props, rooms), so it is never sent over the
   * network: each browser makes its own.
   */
  localOnly?: true;
};

export const world = new World<Entity>();

/** Queries shared by several systems; declared once, because resolving one scans every registered query. */
export const q = {
  positioned:  world.with('position'),
  physical:    world.with('position', 'velocity', 'radius'),
  renderable:  world.with('position', 'sprite'),
  animated:    world.with('animation', 'sprite'),
  characters:  world.with('character', 'visual', 'sprite'),
  needsSprite: world.with('visual', 'position').without('sprite'),
  players:     world.with('position', 'playerInput', 'playerStats', 'health'),
  mobs:        world.with('position', 'health', 'ai'),
  walkingMobs: world.with('position', 'velocity', 'radius', 'health', 'ai'),
  loot:        world.with('position', 'loot'),
  spawners:    world.with('position', 'spawner'),
  torches:     world.with('position', 'torch'),
  chests:      world.with('position', 'chest'),
  items:       world.with('position', 'item'),
  ephemerals:  world.with('position', 'ephemeral'),
  glowing:     world.with('position', 'glow'),
  removed:     world.with('removed'),
  summons:     world.with('position', 'velocity', 'radius', 'health', 'summon'),
  zones:       world.with('position', 'zone'),
  surfaces:    world.with('position', 'surface'),
};

export type Player = (typeof q.players)['entities'][number];
export type Mob = (typeof q.walkingMobs)['entities'][number];
export type Summon = (typeof q.summons)['entities'][number];

/** The player this screen controls, for input, the camera, HUD and panels; undefined between levels. */
export function localPlayer(): Player | undefined {
  for (const player of q.players) if (!player.remoteInput) return player;
  return undefined;
}

export type PlayerInput = NonNullable<Entity['playerInput']>;
export type Intents = PlayerInput['intents'];

export function noIntents(): Intents {
  return { use: false, attack: false, cast: false, inventoryOpen: false, swap: false };
}

/** Lets go of every key and button, e.g. for a remote player whose input stopped arriving. */
export function releaseControls(input: PlayerInput): void {
  input.up = input.down = input.left = input.right = false;
  input.attack = input.use = input.sprint = false;
  input.intents = noIntents();
}

export function isPlayer(e: Entity | undefined): e is Player {
  return !!e && !!e.position && !!e.playerInput && !!e.playerStats && !!e.health;
}

export function isMob(e: Entity | undefined): e is Mob {
  return !!e && !!e.position && !!e.velocity && !!e.radius && !!e.health && !!e.ai;
}

/** Something a sword, spell or arrow can hit: a live enemy, or the training dummy. */
export type Target = Entity & { position: { x: number; y: number }; radius: { x: number; y: number }; health: { current: number; max: number } };

export function isTarget(e: Entity | undefined): e is Target {
  return !!e && !!e.position && !!e.radius && !!e.health && (!!e.ai || !!e.dummy);
}

/** Whether a player can be hurt, hunted or interact right now. */
export function isActivePlayer(player: Player): boolean {
  return player.health.current > 0 && player.respawnTicks === undefined && !player.removed;
}
