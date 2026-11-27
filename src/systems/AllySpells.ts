import { world, q, isActivePlayer } from '../world';
import type { Player } from '../world';
import type { SpellDef } from '../rules/Spells';
import { SPELL_VFX } from '../render/SpellVfx';
import { playVfx } from '../render/VfxPlayer';
import { text } from '../core/texts';
import { spellName } from '../rules/Names';
import { buffsOf, concentrate } from './LastingSpells';
import { logLine } from './RollLogSystem';

/**
 * Spells a hero casts on a companion they touch, or on themselves (`kind: ally` in src/data/spells.json): the hero the
 * crosshair is on — the corner brackets of the aim guide frame them, systems/AimGuideSystem.ts — else the caster. The
 * companion must stand within the spell's reach. Longstrider gives them 10 feet more speed for an hour; Protection from Evil
 * and Good, held by the caster's concentration, wards them for a minute: undead (and fiends, fey… the game has only undead
 * of those) attack them at disadvantage (systems/Strike.ts). Each keeps an aura round them while it lasts, and their HUD
 * shows its icon and time left (ui/PassiveHud.ts).
 */

/** A hero within this far of the crosshair (px, round the middle of their body) is the one picked. */
export const ALLY_PICK = 18;
/** The middle of a hero's body lies this far above their feet. */
const BODY_MIDDLE = 14;
/** Longstrider's 10 feet more on a walking speed of 30. */
const LONGSTRIDER_FACTOR = 40 / 30;

/** The hero an ally spell aimed at (x, y) goes to: the one under the crosshair, else the caster. */
export function allyAt(caster: Player, x: number, y: number): Player {
  let best = caster;
  let bestD = ALLY_PICK;
  for (const hero of q.players) {
    if (!isActivePlayer(hero)) continue;
    const d = Math.hypot(hero.position.x - x, hero.position.y - BODY_MIDDLE - y);
    if (d > bestD) continue;
    best = hero;
    bestD = d;
  }
  return best;
}

/** Whether the companion stands within the spell's reach of the caster (the caster is always within their own). */
export function allyInReach(caster: Player, ally: Player, def: SpellDef): boolean {
  if (ally === caster) return true;
  return Math.hypot(ally.position.x - caster.position.x, ally.position.y - caster.position.y) <= def.range;
}

/** Casts an ally spell on the hero aimed at; false (nothing cast) when they stand beyond its reach. */
export function castOnAlly(caster: Player, def: SpellDef, x: number, y: number): boolean {
  const ally = allyAt(caster, x, y);
  if (!allyInReach(caster, ally, def)) return false;
  // Held by concentration: whatever the caster held before ends first (it may have been this very ward).
  if (def.concentration) concentrate(caster, def.id, world.id(ally) ?? -1, def.durationTicks);
  const buffs = buffsOf(ally);
  if (def.buff === 'longstrider') buffs.longstrider = def.durationTicks;
  else if (def.buff === 'protection_from_evil_and_good') buffs.protection = def.durationTicks;
  const look = SPELL_VFX[def.id]?.aura;
  if (look) playVfx(look, ally.position.x, ally.position.y, BODY_MIDDLE);
  logLine(ally, def.buff === 'protection_from_evil_and_good' ? text('roll.warded') : spellName(def.id), 'heal');
  return true;
}

/** How much faster a hero walks: Longstrider's 10 feet while it lasts. */
export function longstriderFactor(hero: Pick<Player, 'buffs'>): number {
  return (hero.buffs?.longstrider ?? 0) > 0 ? LONGSTRIDER_FACTOR : 1;
}
