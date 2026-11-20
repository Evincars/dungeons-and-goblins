import type { SpellId } from '../rules/Spells';
import type { VfxEffectId } from './Vfx';

/**
 * Which particle effects (vfx/, render/Vfx.ts) each spell plays — the wizard's cantrips and 1st-level spells for now; a
 * spell missing here plays its library effect (assets/Effects.ts) as before:
 * - `trail`: shed behind its projectile as it flies (systems/VfxSystem.ts follows every spell projectile of the world, on
 *   every screen, so a co-op guest draws it from the projectile the host sends);
 * - `impact`: where its projectile strikes or burns out;
 * - `burst`: where an area spell goes off (a cone from the hands, turned the way it was cast);
 * - `aura`: round the caster of a spell that lasts on them.
 * Impacts, bursts and auras are one-shots: the co-op host sends each guest a short signal (render/VfxPlayer.ts).
 */
export type SpellVfx = { trail?: VfxEffectId; impact?: VfxEffectId; burst?: VfxEffectId; aura?: VfxEffectId };

/** The kinds of flying spell with a trail and an impact of their own (vfx/trail-*.json, impact-*.json). */
type BoltLook = 'fire' | 'frost' | 'necrotic' | 'lightning' | 'acid' | 'poison' | 'force';
const bolt = (look: BoltLook): SpellVfx => ({ trail: `trail-${look}`, impact: `impact-${look}` });

export const SPELL_VFX: Readonly<Partial<Record<SpellId, SpellVfx>>> = {
  // Cantrips.
  fire_bolt: bolt('fire'),
  ray_of_frost: bolt('frost'),
  chill_touch: bolt('necrotic'),
  shocking_grasp: bolt('lightning'),
  acid_splash: { burst: 'acid-splash' },
  poison_spray: { burst: 'poison-spray' },
  blade_ward: { aura: 'blade-ward' },
  // 1st-level spells.
  burning_hands: { burst: 'burning-hands' },
  chromatic_orb: bolt('acid'),
  ice_knife: { burst: 'ice-knife' },
  magic_missile: bolt('force'),
  ray_of_sickness: bolt('poison'),
  witch_bolt: bolt('lightning'),
  thunderwave: { burst: 'thunderwave' },
  false_life: { aura: 'false-life' },
  mage_armor: { aura: 'mage-armor' },
  shield: { aura: 'shield' },
};
