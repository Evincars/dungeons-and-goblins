/** Player weapon tuning: the sword swing and the spell bolt. */

export type SwordStats = {
  /** Ticks the swing's hitbox stays live. */
  swingTicks: number;
  /** Reach of a tier-0 swing in pixels, and how much each tier adds. */
  rangeBase: number;
  rangePerTier: number;
  /** Ticks between swings. */
  cooldown: number;
  /** Damage by sword tier (tier 1 = index 0); tiers past the end use the last entry. */
  damageByTier: readonly number[];
  /** Cosine of half the swing's arc: ±60° either side of the aim. */
  arcCos: number;
  /** Shove given to whatever the swing hits. */
  knockback: number;
};

export const SWORD_STATS = {
  swingTicks: 8,
  rangeBase: 28,
  rangePerTier: 4,
  cooldown: 30,
  damageByTier: [10, 15, 22, 30],
  arcCos: 0.5,
  knockback: 4,
} as const satisfies SwordStats;

export type SpellStats = {
  /** The cast clip is 5 frames × 5 ticks; the bolt leaves the hand on its 4th frame. */
  castTicks: number;
  releaseTick: number;
  cooldown: number;
  boltSpeed: number;
  boltDamage: number;
  /** Ticks a bolt flies before fizzling out. */
  boltLife: number;
  /** Bolts start this far out from the caster's feet. */
  boltSpawnOffset: number;
  /** Light radius of a bolt in flight. */
  boltGlow: number;
  /** How far beyond a target's body a bolt still hits it, across and up the screen. */
  reachX: number;
  reachY: number;
  /** Dust puffs left where a bolt bursts. */
  burstPuffs: number;
};

export const SPELL_STATS = {
  castTicks: 25,
  releaseTick: 15,
  cooldown: 45,
  boltSpeed: 4.5,
  boltDamage: 14,
  boltLife: 80,
  boltSpawnOffset: 14,
  boltGlow: 56,
  reachX: 6,
  reachY: 14,
  burstPuffs: 3,
} as const satisfies SpellStats;

/** Reach of a swing with a sword of the given tier. */
export function swingRange(tier: number): number {
  return SWORD_STATS.rangeBase + tier * SWORD_STATS.rangePerTier;
}

/** Damage of a swing with a sword of the given tier. */
export function swingDamage(tier: number): number {
  const table = SWORD_STATS.damageByTier;
  return table[Math.max(0, Math.min(tier - 1, table.length - 1))];
}
