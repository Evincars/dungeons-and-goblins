/**
 * The armour table of the 5th edition System Reference Document. An item's `base` in src/data/armors.json
 * (or "shield" in shields.json) names one of these; its own magic bonus comes on top.
 */

export type ArmorRule = {
  /** Light armour adds all of DEX, medium at most +2, heavy none; a shield is added on top of armour. */
  category: 'light' | 'medium' | 'heavy' | 'shield';
  /** Armor Class it gives before DEX (for a shield, what it adds). */
  ac: number;
  /** The most DEX modifier it lets count; null for no limit. */
  dexCap: number | null;
  /** STR score needed to move freely in it (heavy armour only). */
  strength?: number;
  /** Too noisy to sneak in. */
  stealthDisadvantage: boolean;
};

export const ARMOR_BASES = [
  'padded', 'leather', 'studded_leather',
  'hide', 'chain_shirt', 'scale_mail', 'breastplate', 'half_plate',
  'ring_mail', 'chain_mail', 'splint', 'plate',
  'shield',
] as const;
export type ArmorBase = (typeof ARMOR_BASES)[number];

export function isArmorBase(value: unknown): value is ArmorBase {
  return ARMOR_BASES.some((base) => base === value);
}

/** How far medium armour lets DEX help. */
const MEDIUM_DEX_CAP = 2;

export const ARMOR_TABLE = {
  padded: { category: 'light', ac: 11, dexCap: null, stealthDisadvantage: true },
  leather: { category: 'light', ac: 11, dexCap: null, stealthDisadvantage: false },
  studded_leather: { category: 'light', ac: 12, dexCap: null, stealthDisadvantage: false },
  hide: { category: 'medium', ac: 12, dexCap: MEDIUM_DEX_CAP, stealthDisadvantage: false },
  chain_shirt: { category: 'medium', ac: 13, dexCap: MEDIUM_DEX_CAP, stealthDisadvantage: false },
  scale_mail: { category: 'medium', ac: 14, dexCap: MEDIUM_DEX_CAP, stealthDisadvantage: true },
  breastplate: { category: 'medium', ac: 14, dexCap: MEDIUM_DEX_CAP, stealthDisadvantage: false },
  half_plate: { category: 'medium', ac: 15, dexCap: MEDIUM_DEX_CAP, stealthDisadvantage: true },
  ring_mail: { category: 'heavy', ac: 14, dexCap: 0, stealthDisadvantage: true },
  chain_mail: { category: 'heavy', ac: 16, dexCap: 0, strength: 13, stealthDisadvantage: true },
  splint: { category: 'heavy', ac: 17, dexCap: 0, strength: 15, stealthDisadvantage: true },
  plate: { category: 'heavy', ac: 18, dexCap: 0, strength: 15, stealthDisadvantage: true },
  shield: { category: 'shield', ac: 2, dexCap: null, stealthDisadvantage: false },
} as const satisfies Record<ArmorBase, ArmorRule>;

/** Armor Class with no armour on: 10 plus the DEX modifier. */
export const UNARMORED_AC = 10;
