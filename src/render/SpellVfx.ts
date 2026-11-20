import type { SpellId } from '../rules/Spells';
import type { VfxEffectId } from './Vfx';

/**
 * Which particle effects (vfx/, made by scripts/vfx-effects.mjs) carry a spell through its whole course — the wizard's
 * cantrips, 1st- and 2nd-level spells for now; a spell missing here plays its library effect (assets/Effects.ts) as before:
 * - `cast`: the flare in the caster's hands as it leaves them, turned the way it goes;
 * - `flight`: the projectile itself — a spell with one flies as particles alone, no sprite (systems/VfxSystem.ts follows
 *   every spell projectile of the world on every screen, so a co-op guest draws it from the projectile the host sends);
 * - `impact`: where its projectile strikes or burns out;
 * - `burst`: where an area spell goes off, over the whole of its area (a cone from the hands, turned the way it was cast);
 * - `aura`: round the caster of a spell that lasts on them, once as it is cast (those that keep an aura while they last are
 *   BUFF_AURAS);
 * - `zone`: over a zone for as long as it lasts (Cloud of Daggers: systems/VfxSystem.ts follows every zone of the world);
 * - `heal`: round each hero a healing spell mends.
 * Casts, impacts, bursts and auras are one-shots: the co-op host sends each guest a short signal (render/VfxPlayer.ts).
 */
export type SpellVfx = {
  cast?: VfxEffectId; flight?: VfxEffectId; impact?: VfxEffectId; burst?: VfxEffectId; aura?: VfxEffectId; zone?: VfxEffectId; heal?: VfxEffectId;
};

/** The flying spells with a course of particles of their own (vfx/<look>-cast, -flight, -impact). */
type BoltLook =
  | 'fire-bolt' | 'ray-of-frost' | 'chill-touch' | 'shocking-grasp' | 'witch-bolt' | 'chromatic-orb' | 'ray-of-sickness' | 'magic-missile'
  | 'melfs-acid-arrow' | 'scorching-ray';
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
};

/**
 * The buffs that keep an aura round the hero for as long as they last (`buffs` ticks left), drawn on every screen from the
 * hero's state: Blade Ward's circling glints, Shield's shimmer. Mage Armour, for a whole day, shows only as it is cast.
 */
export const BUFF_AURAS = { bladeWard: 'blade-ward-aura', shield: 'shield-aura' } as const satisfies Readonly<Record<string, VfxEffectId>>;
export type AuraBuff = keyof typeof BUFF_AURAS;
export const AURA_BUFFS: readonly AuraBuff[] = ['bladeWard', 'shield'];
