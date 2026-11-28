import { isPlayer } from '../world';
import type { Entity } from '../world';
import { resolveAttack } from '../rules/Combat';
import type { AttackOutcome, AttackProfile } from '../rules/Combat';
import { characterSheet } from '../rules/CharacterSheet';
import { rollDie } from '../rules/Dice';
import { playVfx } from '../render/VfxPlayer';
import { text } from '../core/texts';
import { logLine } from './RollLogSystem';
import { heldIn } from './SpellHolds';

/**
 * Mirror Image's duplicates at work (the spell, src/data/spells.json; drawn round the hero by systems/ImageSystem.ts): each time
 * a creature attacks the hero, a d20 decides whether it goes for a duplicate instead — 6 or higher with three left, 8 with two,
 * 11 with one. A duplicate's Armor Class is 10 + the hero's Dexterity modifier; a hit destroys it (and harms nobody), and the
 * spell ends with the last one. A creature that cannot see (blinded) is not fooled. Blur's disadvantage is in systems/Strike.ts.
 */

/** The d20 a blow needs to go for a duplicate, by how many are left (none: never). */
const IMAGE_ROLL = [Infinity, 11, 8, 6] as const;
/** A duplicate's Armor Class before the hero's Dexterity modifier. */
const DUPLICATE_AC_BASE = 10;
/** A destroyed duplicate bursts in glass-like shards at the hero's middle, this far above their feet. */
const BODY_MIDDLE = 16;

/** The duplicates left round a hero (none once the spell has run out). */
export function imagesLeft(body: Entity | undefined): number {
  const buffs = body?.buffs;
  return buffs && (buffs.mirrorImage ?? 0) > 0 ? buffs.images ?? 0 : 0;
}

/**
 * The blow went for a duplicate: it is rolled against the duplicate's Armor Class, a hit destroys it, and the hero takes
 * nothing either way (a miss to the caller). Null: the blow goes for the hero, as usual.
 */
export function imageTakes(target: Entity, attack: AttackProfile, attacker: Entity | undefined): AttackOutcome | null {
  const left = imagesLeft(target);
  if (left <= 0 || !isPlayer(target) || heldIn(attacker, 'blinded')) return null;
  if (rollDie(20) < IMAGE_ROLL[Math.min(IMAGE_ROLL.length - 1, left)]) return null;
  const outcome = resolveAttack(attack, DUPLICATE_AC_BASE + characterSheet(target).modifiers.dexterity);
  if (outcome.hit) destroyImage(target, left);
  else logLine(target, text('roll.image_missed'), 'miss');
  return { ...outcome, hit: false, critical: false, damage: 0 };
}

/** A duplicate is struck and shatters; with the last of them the spell ends. */
function destroyImage(hero: Entity, left: number): void {
  const buffs = hero.buffs;
  if (!buffs) return;
  buffs.images = left - 1;
  if (buffs.images <= 0) buffs.mirrorImage = 0;
  logLine(hero, text('roll.image_destroyed', { left: buffs.images }), 'hit');
  if (hero.position) playVfx('mirror-image-pop', hero.position.x, hero.position.y, BODY_MIDDLE);
}
