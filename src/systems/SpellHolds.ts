import { world, isActivePlayer, isMob, isPlayer, isTarget } from '../world';
import type { Entity, Player, SpellHold, StatName } from '../world';
import { HOLD_CONDITION, HOLD_KINDS } from '../rules/Conditions';
import type { HoldKind } from '../rules/Conditions';
import { SPELLS } from '../rules/Spells';
import type { SpellDef, SpellId } from '../rules/Spells';
import { MONSTERS, immuneTo } from '../rules/Monsters';
import { characterSheet, spellcastingFor } from '../rules/CharacterSheet';
import { rollCheck, rollDie } from '../rules/Dice';
import type { D20Mode } from '../rules/Dice';
import { feetToPx } from '../rules/Scale';
import { weaponStats } from '../rules/WeaponTable';
import { nearby, Sense } from '../ai/perception/spatial';
import { MAX_MOB_RADIUS } from '../entities/MobFactory';
import { playVfx } from '../render/VfxPlayer';
import { SPELL_VFX } from '../render/SpellVfx';
import { playEffect } from '../assets/Effects';
import { AIM_HEIGHT } from '../entities/ProjectileFactory';
import { text } from '../core/texts';
import { logAbilitySave, logLine } from './RollLogSystem';
import { recordSpell } from './CombatLogSystem';
import { heroSaveRoll } from './FeatureSystem';
import { foreseenSave } from './SchoolSystem';
import { charm } from './ManeuverSystem';
import { concentrate, endConcentration } from './LastingSpells';
import { inWeb } from './Surfaces';
import { markedSaveMode } from './WeaponMarks';

/**
 * Spells that hold a body in a condition (`kind: hex` in src/data/spells.json, and a bolt with a `condition`), heroes and foes
 * alike — the heroes cast them on the foe their crosshair is on, and enemy casters on a hero:
 * - Charm Person: charmed (a foe stands by and strikes nobody until it is hurt, systems/ManeuverSystem.ts `charm`);
 * - Tasha's Hideous Laughter: `laughing` — prone and incapacitated, it can't stand up; it saves again each time it is hurt,
 *   with advantage;
 * - Hold Person: `paralyzed` — incapacitated and frozen still (its animation too), it fails Strength and Dexterity saves, attacks
 *   against it have advantage and a hit from within 5 feet is a critical hit (systems/Strike.ts);
 * - Blindness/Deafness: `blinded` (it cannot see: its attacks at disadvantage, attacks against it at advantage) or `deafened`
 *   (it hears no shouts), as the caster bound it;
 * - Crown of Madness: `maddened` — charmed, it attacks the creature nearest it other than its charmer (systems/Madness.ts);
 * - Ray of Enfeeblement: `enfeebled` — its weapon blows that use Strength deal half damage;
 * - Web: `restrained` — it cannot move, its attacks at disadvantage and attacks against it at advantage, its Dexterity saves at
 *   disadvantage, until a Strength check breaks it free (once a round) or it is out of the webs (systems/Surfaces.ts).
 * A held body saves again at the end of each of its turns (every 6 seconds) and is free on a success; a spell held by
 * concentration lets go when its caster's concentration ends. Each condition shows as a ring under the body
 * (systems/ConditionRingSystem.ts), its name and what it does under the pointer (ui/ConditionTip.ts).
 */

/** A round of the tabletop game: a held body saves again at the end of each of its turns. */
export const TURN_TICKS = 360;
/** A foe within this far of the crosshair (px, round the middle of its body) is the one a hex picks. */
export const FOE_PICK = 20;
/** At the spell's release the foe aimed at is looked for this many times wider (it may have stepped since the cast began). */
const RELEASE_PICK = 2;
/** The middle of a body lies this far above its feet. */
const BODY_MIDDLE = 14;
/** The foes more a hex cast higher takes must stand within this far of the first (30 feet). */
const CLUSTER_FEET = 30;
/** Should a spell's duration be missing from the file, its hold lasts a minute. */
const FALLBACK_TICKS = 60 * 60;

const holders = world.with('spellHolds');
const scratch: Entity[] = [];
const picked: Entity[] = [];

// ── What holds a body ─────────────────────────────────────────────────────────

/** The hold of this kind on the body, if any. */
export function holdOf(body: Entity | undefined, kind: HoldKind): SpellHold | undefined {
  const hold = body?.spellHolds?.[kind];
  return hold && hold.ticks > 0 ? hold : undefined;
}

/** Whether a spell holds the body in this condition now. */
export function heldIn(body: Entity | undefined, kind: HoldKind): boolean {
  return holdOf(body, kind) !== undefined;
}

/** Paralysed or in fits of laughter: it neither moves nor acts. */
export function incapacitated(body: Entity | undefined): boolean {
  return heldIn(body, 'paralyzed') || heldIn(body, 'laughing');
}

/** Held where it stands: incapacitated, or restrained by webs. */
export function rooted(body: Entity | undefined): boolean {
  return incapacitated(body) || heldIn(body, 'restrained');
}

/** Paralysed: frozen still, even its animation. */
export function frozenStill(body: Entity | undefined): boolean {
  return heldIn(body, 'paralyzed');
}

/** A paralysed body fails every Strength and Dexterity saving throw. */
export function failsSave(body: Entity | undefined, stat: StatName): boolean {
  return (stat === 'strength' || stat === 'dexterity') && heldIn(body, 'paralyzed');
}

/** A restrained body makes its Dexterity saves at disadvantage, and so do the conditions weapon actions leave (systems/WeaponMarks.ts). */
export function saveMode(body: Entity | undefined, stat: StatName): D20Mode {
  if (stat === 'dexterity' && heldIn(body, 'restrained')) return 'disadvantage';
  return markedSaveMode(body, stat);
}

/** The body is held in a condition by a spell for `ticks`, saving against `dc` at the end of each of its turns. */
export function holdBody(body: Entity, kind: HoldKind, spell: SpellId, by: number, dc: number, ticks: number): void {
  const holds = body.spellHolds ?? {};
  if (!body.spellHolds) world.addComponent(body, 'spellHolds', holds);
  holds[kind] = { spell, ticks: ticks > 0 ? ticks : FALLBACK_TICKS, by, dc, pulse: TURN_TICKS };
  if (rooted(body) && body.velocity) body.velocity.x = body.velocity.y = 0;
}

/** The hold of this kind lets go of the body (said over its head when `told`). */
export function releaseHold(body: Entity, kind: HoldKind, told = true): void {
  const holds = body.spellHolds;
  if (!holds?.[kind]) return;
  delete holds[kind];
  if (told) logLine(body, text('roll.hold_ends', { condition: text(`condition.${kind}.name`) }), 'heal');
  if (Object.keys(holds).length === 0) world.removeComponent(body, 'spellHolds');
}

/** Every hold the caster's spell keeps on anyone lets go (their concentration on it ended). */
export function endHoldsOf(casterId: number, spell: SpellId): void {
  for (let i = holders.entities.length - 1; i >= 0; i--) letGoOf(holders.entities[i], casterId, spell);
}

/** Every hold of the caster's spell on one body lets go. */
function letGoOf(body: Entity, casterId: number, spell: SpellId): void {
  for (const kind of HOLD_KINDS) if (heldBy(body.spellHolds?.[kind], casterId, spell)) releaseHold(body, kind);
}

/** Whether a hold is the caster's spell's, still holding. */
const heldBy = (hold: SpellHold | undefined, casterId: number, spell: SpellId): boolean =>
  !!hold && hold.by === casterId && hold.spell === spell && hold.ticks > 0;

/** Whether the caster's spell still holds anyone. */
export function holdsAnyone(casterId: number, spell: SpellId): boolean {
  for (const body of holders) {
    if (HOLD_KINDS.some((kind) => heldBy(body.spellHolds[kind], casterId, spell))) return true;
  }
  return false;
}

// ── Who a hex takes ───────────────────────────────────────────────────────────

/** A body's Intelligence score: a foe's from its monster block, a hero's from their sheet. */
function intelligenceOf(body: Entity): number {
  if (body.mobType) return MONSTERS[body.mobType].abilities.intelligence;
  return isPlayer(body) ? characterSheet(body).scores.intelligence : 0;
}

/** Whether the spell can hold this body at all: of a creature type it takes, clever enough, not immune to its condition. */
export function takes(def: SpellDef, kind: HoldKind | 'charmed', body: Entity): boolean {
  // Every hero is a humanoid.
  const type = body.mobType ? MONSTERS[body.mobType].creature : 'humanoid';
  if (def.creatures && !def.creatures.includes(type)) return false;
  if (intelligenceOf(body) < def.minIntelligence) return false;
  const condition = kind === 'charmed' ? 'charmed' : HOLD_CONDITION[kind];
  return !(body.mobType && condition && immuneTo(body.mobType, condition));
}

/** The live foe under the crosshair at (x, y): the one whose body's middle lies nearest it, within `pick` (px). */
export function foeAt(x: number, y: number, pick = FOE_PICK): Entity | undefined {
  let best: Entity | undefined;
  let bestD = pick;
  for (const foe of nearby(x, y + BODY_MIDDLE, pick + MAX_MOB_RADIUS, Sense.mob, scratch)) {
    if (!isMob(foe) || foe.health.current <= 0 || foe.invisible) continue;
    const d = Math.hypot(foe.position.x - x, foe.position.y - BODY_MIDDLE - y);
    if (d > bestD) continue;
    best = foe;
    bestD = d;
  }
  return best;
}

/** Whether the foe stands within the spell's reach of the caster. */
export function foeInReach(caster: Entity, foe: Entity | undefined, def: SpellDef): boolean {
  if (!foe?.position || !caster.position) return false;
  return Math.hypot(foe.position.x - caster.position.x, foe.position.y - caster.position.y) <= def.range;
}

/** How far a foe stands from a point (for picking the nearest; a foe with no place counts as far off). */
function distanceFrom(foe: Entity, x: number, y: number): number {
  return foe.position ? Math.hypot(foe.position.x - x, foe.position.y - y) : Infinity;
}

/** Puts a foe into the picked list (after the first), kept nearest first, no longer than `most`. */
function pickNearer(foe: Entity, x: number, y: number, most: number): void {
  const d = distanceFrom(foe, x, y);
  let at = picked.length;
  while (at > 1 && distanceFrom(picked[at - 1], x, y) > d) at--;
  if (at > most) return;
  picked.splice(at, 0, foe);
  if (picked.length > most) picked.length = most;
}

/**
 * The foes a hex cast at `first` takes: it, and for each level cast above its own one more of those standing nearest it
 * (a reused list: read it at once). The aim guide frames them all before the cast (systems/AimGuideSystem.ts).
 */
export function hexTargets(def: SpellDef, first: Entity): readonly Entity[] {
  picked.length = 0;
  picked.push(first);
  const more = def.targetsPerLevel * Math.max(0, def.level - SPELLS[def.id].level);
  if (more <= 0 || !first.position) return picked;
  const { x, y } = first.position;
  for (const foe of nearby(x, y, feetToPx(CLUSTER_FEET), Sense.mob, scratch)) {
    if (foe === first || !isMob(foe) || foe.health.current <= 0 || foe.invisible) continue;
    pickNearer(foe, x, y, more + 1);
  }
  return picked;
}

/** A foe fighting the heroes makes its save against Charm Person with advantage. */
const fighting = (foe: Entity): boolean => foe.ai?.state === 'engage' || foe.ai?.state === 'alert';

/**
 * A hex the hero casts at the foe under the crosshair (and, cast higher, the foes nearest it): each it can take saves against
 * the caster's spell DC or is held. Returns whether anyone was held (a spell held by concentration holds them from now on).
 */
export function castHex(caster: Player, def: SpellDef, x: number, y: number, kind: HoldKind | 'charmed'): boolean {
  // The foe may have stepped a little since the cast began: it is looked for a little wider.
  const first = foeAt(x, y, FOE_PICK * RELEASE_PICK);
  if (!first || !foeInReach(caster, first, def)) return false;
  const dc = spellcastingFor(characterSheet(caster), def.id).dc;
  const by = world.id(caster) ?? -1;
  let held: Entity | undefined;
  for (const foe of hexTargets(def, first)) {
    if (hexFoe(caster, def, foe, kind, dc, by)) held ??= foe;
  }
  if (def.concentration && held) concentrate(caster, def.id, world.id(held) ?? -1, def.durationTicks);
  return held !== undefined;
}

/** One foe a hex reaches: its particles on it, then a save, else the hold. Returns whether it was held. */
function hexFoe(caster: Player, def: SpellDef, foe: Entity, kind: HoldKind | 'charmed', dc: number, by: number): boolean {
  showHex(def, foe);
  if (!takes(def, kind, foe)) {
    logLine(foe, text('roll.unaffected'), 'miss');
    return false;
  }
  const stat = def.save ?? 'wisdom';
  const modifier = foe.mobType ? MONSTERS[foe.mobType].modifiers[stat] : 0;
  const save = kind === 'charmed' && fighting(foe) ? advantageSave(foe, caster, modifier, dc) : foreseenSave(foe, caster, modifier, dc);
  logAbilitySave(foe, stat, save.total, save.success);
  recordSpell(caster, def.id, save.success ? 'saved' : 'auto', 0, save.total);
  if (save.success) return false;
  layHold(foe, def, kind, by, dc);
  return true;
}

/** A foe's save with advantage (Charm Person on a foe it is fighting): the better of two. */
function advantageSave(foe: Entity, caster: Player, modifier: number, dc: number): { total: number; success: boolean } {
  const first = foreseenSave(foe, caster, modifier, dc);
  if (first.success) return first;
  return foreseenSave(foe, caster, modifier, dc);
}

/** The hold takes the body, and it is said over its head; a hero it incapacitates loses the spell they concentrate on. */
function layHold(body: Entity, def: SpellDef, kind: HoldKind | 'charmed', by: number, dc: number): void {
  if (kind === 'charmed') charm(body, by, def.durationTicks);
  else holdBody(body, kind, def.id, by, dc, def.durationTicks);
  logLine(body, text(`condition.${kind}.name`), 'hit');
  if (isPlayer(body) && incapacitated(body)) endConcentration(body);
}

/** A hex's particles on the body it reaches (render/SpellVfx.ts), else its library effect there. */
function showHex(def: SpellDef, body: Entity): void {
  if (!body.position) return;
  const look = SPELL_VFX[def.id]?.impact;
  if (look) playVfx(look, body.position.x, body.position.y, AIM_HEIGHT);
  else playEffect(def.effect.shape, def.effect.colour, body.position.x, body.position.y, AIM_HEIGHT, def.effect.scale);
}

/** A bolt with a condition struck (Ray of Enfeeblement): its target is held in it, with no save until its turn ends. */
export function holdOnHit(caster: Entity | undefined, def: SpellDef, target: Entity): void {
  if (!def.condition || def.condition === 'charmed' || !caster) return;
  const dc = isPlayer(caster) ? spellcastingFor(characterSheet(caster), def.id).dc : 0;
  holdBody(target, def.condition, def.id, world.id(caster) ?? -1, dc, def.durationTicks);
  logLine(target, text(`condition.${def.condition}.name`), 'hit');
  if (isPlayer(caster) && def.concentration) concentrate(caster, def.id, world.id(target) ?? -1, def.durationTicks);
}

/**
 * An enemy caster's hex on a hero (Hold Person): a save against its DC (the hero's features and all), else the hero is held.
 * Returns whether they were.
 */
export function hexHero(mob: Entity, def: SpellDef, hero: Player, dc: number): boolean {
  if (!def.condition || def.condition === 'charmed') return false;
  showHex(def, hero);
  if (!takes(def, def.condition, hero)) return false;
  const stat = def.save ?? 'wisdom';
  const save = heroSaveRoll(hero, stat, dc, rollDie, mob);
  logAbilitySave(hero, stat, save.total, save.success);
  if (save.success) return false;
  layHold(hero, def, def.condition, world.id(mob) ?? -1, dc);
  return true;
}

// ── Every round ───────────────────────────────────────────────────────────────

/** The save that ends a hold (a Strength check to break out of webs), shown over the head; `advantage` when hurt. */
function savesOut(body: Entity, kind: HoldKind, hold: SpellHold, advantage: boolean): boolean {
  const stat: StatName = kind === 'restrained' ? 'strength' : SPELLS[hold.spell].save ?? 'wisdom';
  const save = isPlayer(body) ? heroSave(body, stat, hold.dc, advantage) : foeSave(body, stat, hold.dc, advantage);
  logAbilitySave(body, stat, save.total, save.success);
  return save.success;
}

function heroSave(hero: Player, stat: StatName, dc: number, advantage: boolean): { total: number; success: boolean } {
  const first = heroSaveRoll(hero, stat, dc);
  return first.success || !advantage ? first : heroSaveRoll(hero, stat, dc);
}

function foeSave(foe: Entity, stat: StatName, dc: number, advantage: boolean): { total: number; success: boolean } {
  if (failsSave(foe, stat)) return { total: 0, success: false };
  const modifier = foe.mobType ? MONSTERS[foe.mobType].modifiers[stat] : 0;
  return rollCheck(modifier, dc, advantage ? 'advantage' : saveMode(foe, stat));
}

/** Whether whoever cast a hold has let go of it: fallen, gone, or no longer concentrating on it. */
function casterLetGo(hold: SpellHold): boolean {
  const caster = world.entity(hold.by);
  if (!caster || caster.removed || (caster.health?.current ?? 0) <= 0) return true;
  return isPlayer(caster) && SPELLS[hold.spell].concentration && caster.concentration?.spell !== hold.spell;
}

/** One hold a tick on: it ends with its time, its caster's hold on it, or (webs) once out of them; each round a save. */
function tickHold(body: Entity, kind: HoldKind, hold: SpellHold): void {
  const out = kind === 'restrained' && body.position ? !inWeb(body.position.x, body.position.y) : false;
  if (--hold.ticks <= 0 || out || casterLetGo(hold)) {
    releaseHold(body, kind);
    return;
  }
  if (--hold.pulse > 0) return;
  hold.pulse = TURN_TICKS;
  if (savesOut(body, kind, hold, false)) releaseHold(body, kind);
}

/** Each hold on a body a tick on. */
function tickHolds(body: Entity): void {
  for (const kind of HOLD_KINDS) {
    const hold = body.spellHolds?.[kind];
    if (hold) tickHold(body, kind, hold);
  }
}

/** Whether a body is still there to be held. */
const standing = (body: Entity): boolean => !body.removed && (body.health?.current ?? 0) > 0 && (!isPlayer(body) || isActivePlayer(body));

/** Every held body: its holds run down and are saved against; one held where it stands does not move. */
export function updateSpellHolds(): void {
  for (let i = holders.entities.length - 1; i >= 0; i--) {
    const body = holders.entities[i];
    if (!standing(body)) {
      world.removeComponent(body, 'spellHolds');
      continue;
    }
    tickHolds(body);
    if (rooted(body) && body.velocity) body.velocity.x = body.velocity.y = 0;
  }
}

/** A body in fits of laughter is hurt: it saves again, with advantage, and is free on a success. */
export function shakeOff(body: Entity): void {
  const hold = holdOf(body, 'laughing');
  if (hold && savesOut(body, 'laughing', hold, true)) releaseHold(body, 'laughing');
}

// ── What holds do to blows ────────────────────────────────────────────────────

/** Whether the attacker's weapon blow uses Strength (Ray of Enfeeblement halves it): a hero's sheet says; a foe's weapon does. */
function strengthBlow(attacker: Entity): boolean {
  if (isPlayer(attacker)) return characterSheet(attacker).attack.ability === 'strength';
  if (!attacker.mobType || !attacker.mobWeapon) return true;
  const rule = weaponStats(attacker.mobWeapon);
  const mods = MONSTERS[attacker.mobType].modifiers;
  if (rule.properties.includes('finesse')) return mods.strength >= mods.dexterity;
  return rule.range !== 'ranged';
}

/** The damage of a weapon blow by an enfeebled attacker using Strength: half of it. */
export function enfeebledDamage(attacker: Entity | undefined, damage: number): number {
  if (!attacker || !heldIn(attacker, 'enfeebled') || !strengthBlow(attacker)) return damage;
  return Math.floor(damage / 2);
}

/** Every live foe that is not this one, the nearest first within `reach` (for a maddened foe, systems/Madness.ts). */
export function nearestOther(body: Entity, reach: number): Entity | undefined {
  if (!body.position) return undefined;
  let best: Entity | undefined;
  let bestD = reach;
  for (const other of nearby(body.position.x, body.position.y, reach, Sense.mob, scratch)) {
    if (other === body || !isTarget(other) || other.health.current <= 0 || !other.ai) continue;
    const d = Math.hypot(other.position.x - body.position.x, other.position.y - body.position.y);
    if (d > bestD) continue;
    best = other;
    bestD = d;
  }
  return best;
}

/** Whether a hero cannot act now: held by a spell (paralysed, laughing) or down on the floor (slipped): no swing, shot nor spell. */
export function heroHeld(hero: Pick<Player, 'spellHolds' | 'knockedDown'>): boolean {
  return incapacitated(hero) || (hero.knockedDown ?? 0) > 0;
}

/** The holds on a body, in the order of HOLD_KINDS (for the HUD's lines and the condition tooltip). */
export function holdsOn(body: Entity): { kind: HoldKind; hold: SpellHold }[] {
  const list: { kind: HoldKind; hold: SpellHold }[] = [];
  for (const kind of HOLD_KINDS) {
    const hold = holdOf(body, kind);
    if (hold) list.push({ kind, hold });
  }
  return list;
}
