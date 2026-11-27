import { world, isActivePlayer, isPlayer, localPlayer } from '../world';
import type { Entity, Player } from '../world';
import type { Level } from '../level/Level';
import { SPELLS } from '../rules/Spells';
import type { SpellDef } from '../rules/Spells';
import { characterSheet, spellcastingFor } from '../rules/CharacterSheet';
import { abilityModifier, proficiencyBonus } from '../rules/Abilities';
import { MONSTERS } from '../rules/Monsters';
import { playVfx } from '../render/VfxPlayer';
import { text } from '../core/texts';
import { logLine } from './RollLogSystem';
import { bodySave } from './BodySaves';
import { endConcentration } from './LastingSpells';

/**
 * Invisibility and See Invisibility (src/data/spells.json):
 * - a hero made invisible (by a companion's touch, held by their concentration) shows to every screen as a faint shimmer of
 *   themselves; foes cannot see them beyond 5 feet (ai/perception/sight.ts) nor shoot at them, attacks against them are at
 *   disadvantage and theirs at advantage (systems/Strike.ts) — until they attack or cast a spell, and it ends;
 * - an enemy caster that knows the spell turns itself invisible as it first notices the heroes, and stalks them a while before
 *   it strikes: the heroes' screens do not show it at all (nor its health, its rings, its rolls), until it attacks or casts;
 * - See Invisibility lets its caster see the invisible near them (within the spell's radius, in their sight): on their own
 *   screen they show as a shimmer, and once a round each makes a Dexterity save against the caster's DC or is revealed — its
 *   invisibility ends, for everyone. An enemy that knows it does the same to invisible heroes. Another invisible foe further
 *   off, in another room, stays unseen.
 * The host decides it all; the guests draw what the world says.
 */

/** A round of the tabletop game: an invisible creature near a seer saves once a round. */
const TURN_TICKS = 360;
/** An enemy that turns invisible holds its first blow this long (ticks), stalking its prey unseen. */
export const STALK_TICKS = 4 * 60;
/** The reveal's shimmer plays at the middle of the body, this far above its feet. */
const BODY_MIDDLE = 16;
/** Should See Invisibility's radius be missing from the file, it sees this far (px). */
const FALLBACK_SIGHT = 96;

const unseen = world.with('invisible', 'position');
const seers = world.with('seesInvisible', 'position');
/** The tick each invisible body next saves against each seer near it (host bookkeeping, not saved). */
const nextSave = new WeakMap<Entity, number>();
let clock = 0;

/** Whether the body sees the invisible: See Invisibility, or a diviner's Third Eye. */
export function seesInvisible(body: Entity | undefined): boolean {
  return !!body && ((body.seesInvisible ?? 0) > 0 || !!body.arcana?.seeInvisible);
}

/** The body turns invisible for `ticks`, by `by`'s spell. */
export function makeInvisible(body: Entity, by: number, ticks: number): void {
  if (body.invisible) {
    body.invisible.ticks = Math.max(body.invisible.ticks, ticks);
    body.invisible.by = by;
  } else {
    world.addComponent(body, 'invisible', { ticks, by });
  }
  if (body.position) playVfx('invisibility', body.position.x, body.position.y, BODY_MIDDLE);
}

/** Invisibility ends on the body (said over its head), and a companion's concentration on it with it. */
export function endInvisibility(body: Entity): void {
  const spell = body.invisible;
  if (!spell) return;
  world.removeComponent(body, 'invisible');
  logLine(body, text('roll.visible_again'), 'miss');
  if (body.position) playVfx('invisibility-reveal', body.position.x, body.position.y, BODY_MIDDLE);
  const caster = world.entity(spell.by);
  if (isPlayer(caster) && caster.concentration?.spell === 'invisibility' && caster.concentration.zone === world.id(body)) endConcentration(caster);
}

/** The body attacks or casts a spell: an invisibility on it ends. */
export function revealOnAct(body: Entity): void {
  if (body.invisible) endInvisibility(body);
}

/** A hero casts Invisibility on the companion they touch (or themselves). */
export function castInvisibility(caster: Player, ally: Player, def: SpellDef): void {
  makeInvisible(ally, world.id(caster) ?? -1, def.durationTicks);
}

/** A hero casts See Invisibility: for its time they see the invisible near them. */
export function castSeeInvisibility(body: Entity, def: SpellDef): void {
  if (body.seesInvisible === undefined) world.addComponent(body, 'seesInvisible', def.durationTicks);
  else body.seesInvisible = Math.max(body.seesInvisible, def.durationTicks);
}

/** How far a seer sees the invisible: See Invisibility's radius. */
const sightOf = (): number => SPELLS.see_invisibility.radius || FALLBACK_SIGHT;

/** A spell's DC before proficiency and the casting ability. */
const DC_BASE = 8;

/** A seer's DC: a hero's spell DC, an enemy caster's from its level and casting ability. */
function seerDc(seer: Entity): number {
  if (isPlayer(seer)) return spellcastingFor(characterSheet(seer), 'see_invisibility').dc;
  const caster = seer.mobCaster;
  if (!caster || !seer.mobType) return DC_BASE;
  return DC_BASE + proficiencyBonus(caster.level) + abilityModifier(MONSTERS[seer.mobType].abilities[caster.ability]);
}

/** Whether an invisible body is the seer's to reveal: of the other side, near, in sight. */
function inSight(level: Level, seer: Entity & { position: { x: number; y: number } }, body: Entity & { position: { x: number; y: number } }): boolean {
  if (isPlayer(seer) === isPlayer(body) || body.removed || (body.health?.current ?? 0) <= 0) return false;
  const { x, y } = seer.position;
  if (Math.hypot(body.position.x - x, body.position.y - y) > sightOf()) return false;
  return level.checkLineOfSight(x, y, body.position.x, body.position.y);
}

/** Once a round an invisible body in a seer's sight saves (Dexterity) against the seer's DC, or is revealed to everyone. */
function revealNear(level: Level, seer: (typeof seers.entities)[number]): void {
  for (let i = unseen.entities.length - 1; i >= 0; i--) {
    const body = unseen.entities[i];
    if (!inSight(level, seer, body) || (nextSave.get(body) ?? 0) > clock) continue;
    nextSave.set(body, clock + TURN_TICKS);
    if (!bodySave(body, 'dexterity', seerDc(seer))) endInvisibility(body);
  }
}

/** A seer's sight runs down; at its end it is gone. */
function runDown(seer: Entity): void {
  if ((seer.seesInvisible ?? 0) > 1) seer.seesInvisible = (seer.seesInvisible ?? 0) - 1;
  else world.removeComponent(seer, 'seesInvisible');
}

/** Whether an invisibility has run out, or its body is gone or fallen. */
const spent = (body: (typeof unseen.entities)[number]): boolean =>
  --body.invisible.ticks <= 0 || body.removed || (body.health?.current ?? 0) <= 0 || (isPlayer(body) && !isActivePlayer(body));

/** Host, each tick: invisibilities run out, seers reveal the invisible near them, and their sight runs down. */
export function updateInvisibility(level: Level): void {
  clock++;
  for (let i = unseen.entities.length - 1; i >= 0; i--) {
    const body = unseen.entities[i];
    if (spent(body)) endInvisibility(body);
  }
  for (let i = seers.entities.length - 1; i >= 0; i--) {
    const seer = seers.entities[i];
    revealNear(level, seer);
    runDown(seer);
  }
}

/**
 * How this screen shows a body (systems/ImageSystem.ts): 1 as it is; an invisible hero, or an invisible foe this screen's hero
 * sees through See Invisibility, a faint shimmer; an invisible foe otherwise not at all.
 */
export function shownAlpha(body: Entity): number {
  if (!body.invisible) return 1;
  if (isPlayer(body) || seesInvisible(localPlayer())) return SHIMMER_ALPHA;
  return 0;
}
/** An invisible body that is shown at all shows this faint. */
export const SHIMMER_ALPHA = 0.35;

/** Whether this screen hides the body altogether (an invisible foe its hero does not see): no health bar, rings or rolls. */
export function hiddenHere(body: Entity): boolean {
  return shownAlpha(body) === 0;
}

