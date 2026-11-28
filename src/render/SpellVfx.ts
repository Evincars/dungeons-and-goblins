import type { SpellId } from '../rules/Spells';
import type { VfxEffectId } from './Vfx';
import type { ThrownKind } from '../rules/Throwables';
import type { AfflictionKind } from '../world';

/**
 * Which particle effects (vfx/, made by scripts/vfx-effects.mjs) carry a spell through its whole course — the wizard's
 * spells, cantrips to the 6th level (as far as a wizard of the level cap casts); a spell missing here plays its library
 * effect (assets/Effects.ts) as before:
 * - `cast`: the flare in the caster's hands as it leaves them, turned the way it goes;
 * - `flight`: the projectile itself — a spell with one flies as particles alone, no sprite (systems/VfxSystem.ts follows
 *   every spell projectile of the world on every screen, so a co-op guest draws it from the projectile the host sends);
 * - `impact`: where its projectile strikes or burns out;
 * - `burst`: where an area spell goes off, over the whole of its area (a cone or a line from the hands, turned the way it was
 *   cast; one thrown at a point flares first in the hands with its `cast`);
 * - `strike`: on each body an area spell catches (Chain Lightning's bolt from above, the water conducting it included);
 * - `aura`: round the caster of a spell that lasts on them, once as it is cast (those that keep an aura while they last are
 *   BUFF_AURAS);
 * - `zone`: over a zone for as long as it lasts (Cloud of Daggers, Cloudkill: systems/VfxSystem.ts follows every zone of the
 *   world);
 * - `heal`: round each hero a healing spell mends.
 * Casts, impacts, bursts and auras are one-shots: the co-op host sends each guest a short signal (render/VfxPlayer.ts).
 */
export type SpellVfx = {
  cast?: VfxEffectId; flight?: VfxEffectId; impact?: VfxEffectId; burst?: VfxEffectId; strike?: VfxEffectId; aura?: VfxEffectId;
  zone?: VfxEffectId; heal?: VfxEffectId;
};

/** The flying spells with a course of particles of their own (vfx/<look>-cast, -flight, -impact). */
type BoltLook =
  | 'fire-bolt' | 'ray-of-frost' | 'chill-touch' | 'shocking-grasp' | 'witch-bolt' | 'chromatic-orb' | 'ray-of-sickness' | 'magic-missile'
  | 'melfs-acid-arrow' | 'scorching-ray' | 'vampiric-touch' | 'disintegrate' | 'ray-of-enfeeblement';
const bolt = (look: BoltLook): SpellVfx => ({ cast: `${look}-cast`, flight: `${look}-flight`, impact: `${look}-impact` });

export const SPELL_VFX: Readonly<Partial<Record<SpellId, SpellVfx>>> = {
  // Cantrips.
  fire_bolt: bolt('fire-bolt'),
  ray_of_frost: bolt('ray-of-frost'),
  chill_touch: bolt('chill-touch'),
  shocking_grasp: bolt('shocking-grasp'),
  acid_splash: { burst: 'acid-splash' },
  poison_spray: { burst: 'poison-spray' },
  blade_ward: { aura: 'blade-ward' },
  // 1st-level spells.
  burning_hands: { burst: 'burning-hands' },
  chromatic_orb: bolt('chromatic-orb'),
  ice_knife: { burst: 'ice-knife' },
  magic_missile: bolt('magic-missile'),
  ray_of_sickness: bolt('ray-of-sickness'),
  witch_bolt: bolt('witch-bolt'),
  thunderwave: { burst: 'thunderwave' },
  false_life: { aura: 'false-life' },
  mage_armor: { aura: 'mage-armor' },
  shield: { aura: 'shield' },
  // 2nd-level spells.
  melfs_acid_arrow: bolt('melfs-acid-arrow'),
  scorching_ray: bolt('scorching-ray'),
  shatter: { burst: 'shatter' },
  cloud_of_daggers: { zone: 'cloud-of-daggers' },
  prayer_of_healing: { heal: 'prayer-of-healing' },
  // 3rd-level spells.
  fireball: { cast: 'fireball-cast', burst: 'fireball' },
  lightning_bolt: { burst: 'lightning-bolt' },
  vampiric_touch: bolt('vampiric-touch'),
  // 4th-level spells.
  blight: { cast: 'necrotic-cast', burst: 'blight' },
  ice_storm: { cast: 'ray-of-frost-cast', burst: 'ice-storm' },
  phantasmal_killer: { cast: 'psychic-cast', burst: 'phantasmal-killer' },
  stoneskin: { aura: 'stoneskin' },
  // 5th-level spells.
  cloudkill: { zone: 'cloudkill' },
  cone_of_cold: { burst: 'cone-of-cold' },
  // 6th-level spells.
  chain_lightning: { cast: 'shocking-grasp-cast', burst: 'chain-lightning', strike: 'chain-lightning-strike' },
  circle_of_death: { cast: 'necrotic-cast', burst: 'circle-of-death' },
  disintegrate: bolt('disintegrate'),
  otilukes_freezing_sphere: { cast: 'ray-of-frost-cast', burst: 'freezing-sphere' },
  sunbeam: { cast: 'sunbeam-cast', burst: 'sunbeam' },
  // Cantrips and spells of the dungeon's own (src/data/spells.json).
  true_strike: { aura: 'true-strike' },
  grease: { burst: 'grease' },
  sleep: { cast: 'sleep-cast', flight: 'sleep-flight', impact: 'sleep-impact' },
  longstrider: { aura: 'longstrider' },
  protection_from_evil_and_good: { aura: 'protection-from-evil-and-good' },
  // Spells that hold, hide and shape (a hex's `impact` plays on each body it reaches, systems/SpellHolds.ts).
  charm_person: { cast: 'sleep-cast', impact: 'charm-person' },
  tashas_hideous_laughter: { cast: 'sleep-cast', impact: 'hideous-laughter' },
  blindness: { cast: 'necrotic-cast', impact: 'blindness' },
  hold_person: { cast: 'ray-of-frost-cast', impact: 'hold-person' },
  crown_of_madness: { cast: 'psychic-cast', impact: 'crown-of-madness' },
  ray_of_enfeeblement: bolt('ray-of-enfeeblement'),
  blur: { aura: 'blur' },
  mirror_image: { aura: 'mirror-image' },
  shadow_blade: { aura: 'shadow-blade' },
  see_invisibility: { aura: 'see-invisibility' },
  magic_weapon: { aura: 'magic-weapon' },
  flaming_sphere: { zone: 'flaming-sphere' },
  web: { burst: 'web' },
};

/** The flasks' flight, a trail of particles behind them (systems/ThrowSystem.ts). */
export const FLASK_FLIGHT: Readonly<Partial<Record<ThrownKind, VfxEffectId>>> = { alchemists_fire: 'alchemists-fire-flight', grease_bottle: 'grease-flight' };

/**
 * The buffs that keep an aura round the hero for as long as they last (`buffs` ticks left), drawn on every screen from the
 * hero's state: Blade Ward's circling glints, Shield's shimmer, Stoneskin's flecks of stone, True Strike's golden runes
 * round the eyes until the blow it guides, Longstrider's wisps of wind at the feet, Protection from Evil and Good's pale
 * golden glyphs, Blur's streaks wavering off the sides. Mage Armour, for a whole day, shows only as it is cast.
 */
export const BUFF_AURAS = {
  bladeWard: 'blade-ward-aura', shield: 'shield-aura', stoneskin: 'stoneskin-aura', trueStrike: 'true-strike-aura',
  longstrider: 'longstrider-aura', protection: 'protection-aura', blur: 'blur-aura',
} as const satisfies Readonly<Record<string, VfxEffectId>>;
export type AuraBuff = keyof typeof BUFF_AURAS;
export const AURA_BUFFS: readonly AuraBuff[] = ['bladeWard', 'shield', 'stoneskin', 'trueStrike', 'longstrider', 'protection', 'blur'];

/**
 * What a spell's hold keeps on a body while it lasts (systems/SpellHolds.ts; under it, its ring): Hold Person's runes hanging
 * still, Tasha's bubbles of mirth, the crown of iron, an enfeebled body's grey motes.
 */
export const HOLD_AURAS = {
  paralyzed: 'hold-aura', laughing: 'laughter-aura', maddened: 'madness-aura', enfeebled: 'enfeebled-aura',
} as const satisfies Readonly<Record<string, VfxEffectId>>;
export type AuraHold = keyof typeof HOLD_AURAS;
export const AURA_HOLDS: readonly AuraHold[] = ['paralyzed', 'laughing', 'maddened', 'enfeebled'];

/** The mark a blow leaves for a round on a body (systems/Afflictions.ts), by its kind; acid's is poison's. */
export const AFFLICTION_VFX = {
  fire: 'burning', poison: 'afflict-poison', acid: 'afflict-poison', cold: 'afflict-cold', lightning: 'afflict-lightning',
} as const satisfies Readonly<Record<AfflictionKind, VfxEffectId>>;

/** What lasts on the floor and on bodies with particles of its own: a fog cloud's banks, a sleeper's motes, a puddle's sheen. */
export const LASTING_VFX = {
  fog: 'fog-cloud', darkness: 'darkness', sleep: 'sleep-zzz', grease: 'grease-sheen', water: 'water-glint', seer: 'see-invisibility-aura',
  magicWeapon: 'magic-weapon-sign', shadowBlade: 'shadow-blade-sign',
} as const satisfies Readonly<Record<string, VfxEffectId>>;
/** A puddle's sheen is made this wide (px of its radius) and scaled to the puddle. */
export const SHEEN_RADIUS = 32;
