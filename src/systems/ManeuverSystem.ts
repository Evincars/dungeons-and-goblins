import { world, isPlayer, isActivePlayer, q } from '../world';
import type { Entity, Player, StatName } from '../world';
import { text } from '../core/texts';
import { rollCheck, rollDie } from '../rules/Dice';
import type { D20Mode } from '../rules/Dice';
import { characterSheet } from '../rules/CharacterSheet';
import { featureOn, featureOfClass } from '../rules/ClassFeatures';
import { heroClass } from '../rules/Classes';
import type { AttackOutcome, AttackProfile } from '../rules/Combat';
import {
  ALLY_REACH, DISTRACTED_TICKS, ELDRITCH_TICKS, FRIGHTENED_TICKS, GOADED_TICKS, MANEUVER_READY_TICKS, MANEUVER_RULES, PRONE_TICKS,
  PUSH_BUMP, SWEEP_REACH, isManeuver, superiorityDice, superioritySides,
} from '../rules/Maneuvers';
import { MONSTERS } from '../rules/Monsters';
import { UNARMORED_AC } from '../rules/ArmorTable';
import { nearby, Sense } from '../ai/perception/spatial';
import { MAX_MOB_RADIUS } from '../entities/MobFactory';
import { hitMob } from './Hits';
import { logLine } from './RollLogSystem';

/**
 * The Battle Master's maneuvers and the marks heroes leave on foes. A maneuver is readied from the quick bar (the
 * feature's use, see FeatureSystem.ts) and waits `MANEUVER_READY_TICKS` for its moment: the hero's next weapon blow (a rider
 * adds a superiority die to the damage and does its work if it hits; Precision Attack lifts a miss to a hit), a foe's
 * next melee blow (Parry, Riposte; see Reactions.ts) or the hero's own movement (Evasive Footwork). A die is spent only
 * when the maneuver does its work. The dice come back with a rest.
 */

const afflicted = world.with('status');
const readied = world.with('maneuver');
const neighbours: Entity[] = [];

// ── Superiority dice ──────────────────────────────────────────────────────────

/** Superiority dice the hero has left (all of them until one is spent). */
export function diceLeft(hero: Player): number {
  return hero.superiorityLeft ?? superiorityDice(hero.playerStats.level);
}

/** Spends a superiority die and rolls it: the number it shows. */
export function spendDie(hero: Player): number {
  hero.superiorityLeft = diceLeft(hero) - 1;
  return rollDie(superioritySides(hero.playerStats.level));
}

/** A rest brings all the dice back. */
export function restoreDice(hero: Player): void {
  if (hero.superiorityLeft !== undefined) world.removeComponent(hero, 'superiorityLeft');
}

/** Relentless: one die back (the hero rolled initiative with none left). */
export function regainDie(hero: Player): void {
  hero.superiorityLeft = Math.min(superiorityDice(hero.playerStats.level), diceLeft(hero) + 1);
}

// ── Readying ──────────────────────────────────────────────────────────────────

/** The nearest other hero on their feet within reach, if any. */
function nearestAlly(hero: Player): Player | undefined {
  let found: Player | undefined;
  let best = ALLY_REACH;
  for (const other of q.players) {
    if (other === hero || !isActivePlayer(other)) continue;
    const dist = Math.hypot(other.position.x - hero.position.x, other.position.y - hero.position.y);
    if (dist > best) continue;
    best = dist;
    found = other;
  }
  return found;
}

const ready = (id: string, bonus = 0): NonNullable<Entity['maneuver']> => ({ id, ticks: MANEUVER_READY_TICKS, bonus });

function setManeuver(hero: Entity, maneuver: NonNullable<Entity['maneuver']>): void {
  if (hero.maneuver) world.removeComponent(hero, 'maneuver');
  world.addComponent(hero, 'maneuver', maneuver);
}

/** Commander's Strike and Rally: an ally maneuver helps the nearest other hero, with the die rolled now. */
function helpAlly(hero: Player, id: string): boolean {
  const ally = nearestAlly(hero);
  if (!ally) return false;
  const roll = spendDie(hero);
  if (id === 'commanders_strike') {
    setManeuver(ally, ready(id, roll));
  } else {
    const amount = Math.max(1, roll + characterSheet(hero).modifiers.charisma);
    ally.tempHealth = Math.max(ally.tempHealth ?? 0, amount);
    logLine(ally, text('roll.temp_hp', { amount }), 'heal');
  }
  return true;
}

/** What readying a maneuver comes to: it is, or why it is not. */
export type ReadyResult = 'ok' | 'no_dice' | 'no_ally' | 'unknown';

/** The hero readies a maneuver from the quick bar. A rider, Precision Attack and the reactions wait for their moment; the rest work at once. */
export function readyManeuver(hero: Player, id: string): ReadyResult {
  if (!isManeuver(id)) return 'unknown';
  if (diceLeft(hero) <= 0) return 'no_dice';
  const kind = MANEUVER_RULES[id].kind;
  if (kind === 'ally' && !helpAlly(hero, id)) return 'no_ally';
  if (kind === 'stance') setManeuver(hero, ready(id, spendDie(hero)));
  else if (kind !== 'ally') setManeuver(hero, ready(id));
  const name = featureOfClass(heroClass(hero.heroClass).dndClass, id)?.name ?? id;
  logLine(hero, name, 'crit');
  return 'ok';
}

/** Whether a lunging attack is readied: the next swing reaches further. */
export function lungeReady(hero: Player): boolean {
  return hero.maneuver?.id === 'lunging_attack' && diceLeft(hero) > 0;
}

/** The die Evasive Footwork added to the hero's Armor Class, while they are moving. */
export function evasiveBonus(target: Entity): number {
  const stance = target.maneuver;
  return stance?.id === 'evasive_footwork' && (target.walkTime ?? 0) > 0 ? stance.bonus : 0;
}

// ── Marks on foes ─────────────────────────────────────────────────────────────

function statusOf(foe: Entity, by: number): NonNullable<Entity['status']> {
  const status = foe.status ?? { prone: 0, frightened: 0, goaded: 0, distracted: 0, eldritch: 0, by };
  if (!foe.status) world.addComponent(foe, 'status', status);
  status.by = by;
  return status;
}

/** Marks a foe for a spell's sake: Eldritch Strike. */
export function markEldritch(foe: Entity, by: number): void {
  statusOf(foe, by).eldritch = ELDRITCH_TICKS;
}

/** A foe's saving throw against a spell is at disadvantage if a weapon blow marked it (once). */
export function spellSaveMode(foe: Entity): D20Mode {
  const status = foe.status;
  if (!status || status.eldritch <= 0) return 'normal';
  status.eldritch = 0;
  return 'disadvantage';
}

/**
 * How the marks on the two fighters change a roll: a prone or distracted target is attacked with advantage (the
 * distraction is spent by the first attacker who is not the one who caused it); a prone, frightened or goaded attacker
 * rolls with disadvantage (frightened: against whoever frightened it; goaded: against anyone else).
 */
function markedMode(mode: D20Mode, attacker: Entity | undefined, target: Entity): D20Mode {
  const attackerId = attacker ? world.id(attacker) : undefined;
  const targetId = world.id(target);
  let next = mode;
  const mark = target.status;
  if (mark && (mark.prone > 0 || (mark.distracted > 0 && attackerId !== mark.by))) {
    if (mark.prone <= 0) mark.distracted = 0;
    next = next === 'disadvantage' ? 'normal' : 'advantage';
  }
  const own = attacker?.status;
  if (own && (own.prone > 0 || (own.frightened > 0 && targetId === own.by) || (own.goaded > 0 && targetId !== own.by))) {
    next = next === 'advantage' ? 'normal' : 'disadvantage';
  }
  return next;
}

// ── A blow ────────────────────────────────────────────────────────────────────

/** A readied rider adds its die to the damage (rolled with the damage, doubled on a critical hit). */
const ADDS_DIE = new Set(['disarming_attack', 'distracting_strike', 'feinting_attack', 'goading_attack', 'lunging_attack',
  'maneuvering_attack', 'menacing_attack', 'pushing_attack', 'trip_attack']);

/** What the hero's readied maneuver and the marks on the fighters do to the blow before it is rolled. */
export function prepareBlow(attack: AttackProfile, attacker: Entity | undefined, target: Entity): AttackProfile {
  const mode = markedMode(attack.mode, attacker, target);
  let profile = mode === attack.mode ? attack : { ...attack, mode };
  const hero = isPlayer(attacker) ? attacker : undefined;
  const maneuver = hero?.maneuver;
  if (!hero || !maneuver || maneuver.ticks <= 0) return profile;
  if (maneuver.id === 'commanders_strike') return { ...profile, extra: { count: 0, sides: 4, bonus: maneuver.bonus } };
  if (diceLeft(hero) <= 0) return profile;
  const sides = superioritySides(hero.playerStats.level);
  if (maneuver.id === 'precision_attack') profile = { ...profile, precisionSides: sides };
  if (maneuver.id === 'feinting_attack') profile = { ...profile, mode: profile.mode === 'disadvantage' ? 'normal' : 'advantage' };
  if (ADDS_DIE.has(maneuver.id) && !profile.extra) profile = { ...profile, extra: { count: 1, sides, bonus: 0 } };
  return profile;
}

/** The foe makes the saving throw against the hero's maneuver DC; whether it resisted is said over its head. */
function resists(foe: Entity, save: StatName, dc: number): boolean {
  const modifier = foe.mobType ? MONSTERS[foe.mobType].modifiers[save] : 0;
  const roll = rollCheck(modifier, dc);
  logLine(foe, text(roll.success ? 'roll.maneuver_resisted' : 'roll.maneuver_failed', { total: roll.total }), roll.success ? 'miss' : 'damage');
  return roll.success;
}

/** The first effect of a rider that landed: what the foe suffers if it failed its saving throw. */
function suffer(hero: Player, foe: Entity, id: string, dc: number): void {
  const by = world.id(hero) ?? -1;
  const rule = isManeuver(id) ? MANEUVER_RULES[id] : null;
  if (rule?.save && resists(foe, rule.save, dc)) return;
  if (id === 'disarming_attack' && foe.mobWeapon) {
    foe.mobWeapon = 'unarmed';
    logLine(foe, text('roll.disarmed'), 'damage');
  } else if (id === 'distracting_strike') {
    statusOf(foe, by).distracted = DISTRACTED_TICKS;
  } else if (id === 'goading_attack') {
    statusOf(foe, by).goaded = GOADED_TICKS;
    logLine(foe, text('roll.goaded'), 'damage');
  } else if (id === 'menacing_attack') {
    statusOf(foe, by).frightened = FRIGHTENED_TICKS;
    logLine(foe, text('roll.frightened'), 'damage');
  } else if (id === 'trip_attack') {
    statusOf(foe, by).prone = PRONE_TICKS;
    logLine(foe, text('roll.tripped'), 'damage');
  } else if (id === 'pushing_attack') {
    push(hero, foe);
  }
}

function push(hero: Player, foe: Entity): void {
  if (!foe.position) return;
  const dx = foe.position.x - hero.position.x;
  const dy = foe.position.y - hero.position.y;
  const dist = Math.hypot(dx, dy) || 1;
  foe.bump ??= { x: 0, y: 0 };
  foe.bump.x = (dx / dist) * PUSH_BUMP;
  foe.bump.y = (dy / dist) * PUSH_BUMP;
  logLine(foe, text('roll.pushed'), 'damage');
}

/** Sweeping Attack: another foe next to the one struck takes the die as damage, if the roll would have hit it. */
function sweep(hero: Player, foe: Entity, total: number, die: number): void {
  if (!foe.position) return;
  for (const other of nearby(foe.position.x, foe.position.y, SWEEP_REACH + MAX_MOB_RADIUS, Sense.mob, neighbours)) {
    if (other === foe || !other.position || (other.health?.current ?? 0) <= 0 || other.team === hero.team) continue;
    const gap = Math.hypot(other.position.x - foe.position.x, other.position.y - foe.position.y);
    if (gap > SWEEP_REACH + Math.max(other.radius?.x ?? 0, other.radius?.y ?? 0)) continue;
    const armor = other.mobType ? MONSTERS[other.mobType].ac : UNARMORED_AC;
    if (total < armor) continue;
    logLine(other, text('roll.sweep'), 'damage');
    hitMob(other, hero, die, true);
    return;
  }
}

/** The blow was rolled: a spent die for a rider that landed or a Precision Attack that turned a miss into a hit, and what it does to the foe. */
export function afterBlow(attacker: Entity | undefined, foe: Entity, outcome: AttackOutcome): void {
  if (!isPlayer(attacker)) return;
  if (outcome.hit && featureOn(attacker, 'eldritch_strike')) markEldritch(foe, world.id(attacker) ?? -1);
  const maneuver = attacker.maneuver;
  if (!maneuver || maneuver.ticks <= 0) return;
  if (maneuver.id === 'commanders_strike') {
    if (outcome.hit) world.removeComponent(attacker, 'maneuver');
    return;
  }
  if (maneuver.id === 'precision_attack') {
    if (outcome.precision <= 0) return;
    spendDie(attacker);
    world.removeComponent(attacker, 'maneuver');
    return;
  }
  const rule = isManeuver(maneuver.id) ? MANEUVER_RULES[maneuver.id] : null;
  if (!outcome.hit || rule?.kind !== 'rider' || diceLeft(attacker) <= 0) return;
  const die = spendDie(attacker);
  world.removeComponent(attacker, 'maneuver');
  suffer(attacker, foe, maneuver.id, characterSheet(attacker).maneuverDc);
  if (maneuver.id === 'sweeping_attack') sweep(attacker, foe, outcome.total, die);
}

// ── Timers ────────────────────────────────────────────────────────────────────

/** A readied maneuver lapses if its moment does not come; marks on foes wear off. */
export function updateManeuvers(): void {
  for (const hero of readied) if (--hero.maneuver.ticks <= 0) world.removeComponent(hero, 'maneuver');
  for (const foe of afflicted) {
    const s = foe.status;
    s.prone = Math.max(0, s.prone - 1);
    s.frightened = Math.max(0, s.frightened - 1);
    s.goaded = Math.max(0, s.goaded - 1);
    s.distracted = Math.max(0, s.distracted - 1);
    s.eldritch = Math.max(0, s.eldritch - 1);
    if (s.prone + s.frightened + s.goaded + s.distracted + s.eldritch === 0) world.removeComponent(foe, 'status');
  }
}
