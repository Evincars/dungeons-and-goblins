
/**
 * Player weapon tuning: the sword swing, the spell bolt and arrows. What a blow deals comes from the D&D
 * rules (the weapon's dice, src/rules/WeaponTable.ts); these are the feel of it: reach, timing, speed.
 */

export type SwordStats = {
  /** Ticks the swing's hitbox stays live. */
  swingTicks: number;
  /** Reach of a tier-0 swing in pixels, and how much each tier adds. */
  rangeBase: number;
  rangePerTier: number;
  /** Ticks between swings. */
  cooldown: number;
  /** Cosine of half the swing's arc: ±60° either side of the aim. */
  arcCos: number;
  /** Shove given to whatever the swing hits. */
  knockback: number;
};

export const SWORD_STATS = {
  swingTicks: 8,
  rangeBase: 19,
  rangePerTier: 3,
  cooldown: 30,
  arcCos: 0.5,
  knockback: 4,
} as const satisfies SwordStats;

export type SpellStats = {
  /**
   * The cast clip is 5 frames × 5 ticks; the spell goes off on its 4th frame. `cooldown`: ticks before the
   * next cast of any spell (each spell's own recovery is in src/data/spells.json).
   */
  castTicks: number;
  releaseTick: number;
  cooldown: number;
  boltSpeed: number;
  /** Ticks a bolt flies before fizzling out. */
  boltLife: number;
  /** Bolts start this far out from the caster's feet. */
  boltSpawnOffset: number;
  /** Light radius of a bolt in flight. */
  boltGlow: number;
  /** How far beyond a target's body a bolt still hits it, across and up the screen. */
  reachX: number;
  reachY: number;
};

export const SPELL_STATS = {
  castTicks: 25,
  releaseTick: 15,
  cooldown: 45,
  boltSpeed: 4.5,
  boltLife: 80,
  boltSpawnOffset: 9,
  boltGlow: 56,
  reachX: 6,
  reachY: 14,
} as const satisfies SpellStats;

/** Reach of a swing with a sword of the given tier. */
export function swingRange(tier: number): number {
  return SWORD_STATS.rangeBase + tier * SWORD_STATS.rangePerTier;
}

export type ArrowStats = {
  /** Pixels an arrow flies per tick, and ticks before it drops. */
  speed: number;
  life: number;
  /** Ticks between shots, and how long the archer holds the release pose. */
  cooldown: number;
  drawTicks: number;
  /** Arrows leave this far out from the archer's feet. */
  spawnOffset: number;
};

export const ARROW_STATS = {
  speed: 6,
  life: 70,
  cooldown: 22,
  drawTicks: 12,
  spawnOffset: 10,
} as const satisfies ArrowStats;

