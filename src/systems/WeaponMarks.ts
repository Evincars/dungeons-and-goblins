import { world } from '../world';
import type { Entity, StatName, WeaponMarks } from '../world';
import type { D20Mode } from '../rules/Dice';
import type { WeaponCondition } from '../rules/WeaponActions';
import { MONSTERS } from '../rules/Monsters';
import { text } from '../core/texts';
import { TICKS_PER_SECOND } from '../rules/Spells';
import { logLine } from './RollLogSystem';
import { statusOf } from './ManeuverSystem';

/**
 * The conditions the heroes' weapon actions leave on foes (systems/WeaponActions.ts), as Baldur's Gate 3 has them, each for
 * a number of turns (6 s each):
 * - Bleeding: 2 slashing damage at the end of each turn; Constitution saves at disadvantage.
 * - Dazed: no Dexterity to its Armor Class; Wisdom saves at disadvantage.
 * - Maimed: it cannot move; Dexterity saves at disadvantage.
 * - Off Balance: attacks against it have advantage; Strength and Dexterity saves at disadvantage; the next damage ends it.
 * - Weak Grip: its attacks have disadvantage; Strength and Dexterity saves at disadvantage.
 * - Chest Trauma: one action fewer: it strikes half as often.
 * - Gaping Wounds: every attack that hurts it deals 2 piercing damage more.
 * - Hamstrung: it moves at half its pace.
 * Prone is the foe's own mark (`status.prone`, systems/ManeuverSystem.ts); Disarmed drops its weapon (`mobWeapon`).
 */

/** A turn of the tabletop game: the conditions last so many of them. */
const TURN_TICKS = 6 * TICKS_PER_SECOND;
/** Bleeding deals this much slashing damage a turn; Gaping Wounds add this much piercing damage to every blow that hurts. */
const BLEED_DAMAGE = 2;
export const GAPING_DAMAGE = 2;
/** A hamstrung foe moves at this share of its pace (a maimed one not at all); one with Chest Trauma strikes this many times slower. */
const HAMSTRUNG_PACE = 0.5;
const TRAUMA_SLOWER = 2;

const markedFoes = world.with('weaponMarks');
/**
 * Foes marked during this tick: the blow that laid a mark is dealt after it (the caller applies the damage), and must neither
 * end its own Off Balance nor be made worse by its own Gaping Wounds.
 */
const justMarked = new Set<Entity>();

/** The field of the marks each condition keeps its ticks in (prone and disarmed are kept elsewhere). */
const FIELDS = {
  bleeding: 'bleeding', dazed: 'dazed', maimed: 'maimed', off_balance: 'offBalance', weak_grip: 'weakGrip', chest_trauma: 'chestTrauma',
  gaping_wounds: 'gapingWounds', hamstrung: 'hamstrung', prone: null, disarmed: null,
} as const satisfies Record<WeaponCondition, keyof WeaponMarks | null>;

/** A foe's marks, made the first time one is given (`by`: whoever gave the latest). */
function marksOf(foe: Entity, by: number): WeaponMarks {
  const marks = foe.weaponMarks ?? {
    bleeding: 0, dazed: 0, maimed: 0, offBalance: 0, weakGrip: 0, chestTrauma: 0, gapingWounds: 0, hamstrung: 0, by,
  };
  if (!foe.weaponMarks) world.addComponent(foe, 'weaponMarks', marks);
  marks.by = by;
  return marks;
}

/** A foe suffers a weapon action's condition for so many turns (said over its head). */
export function markFoe(foe: Entity, condition: WeaponCondition, turns: number, by: number): void {
  const ticks = Math.max(1, turns) * TURN_TICKS;
  if (condition === 'prone') statusOf(foe, by).prone = Math.max(statusOf(foe, by).prone, ticks);
  else if (condition === 'disarmed') foe.mobWeapon = 'unarmed';
  const field = FIELDS[condition];
  if (field) {
    justMarked.add(foe);
    const marks = marksOf(foe, by);
    marks[field] = Math.max(marks[field], ticks);
  }
  logLine(foe, text(`condition.${condition}.name`), 'damage');
}

/** Whether a foe suffers a condition now. */
export function marked(foe: Entity | undefined, condition: WeaponCondition): boolean {
  if (!foe) return false;
  if (condition === 'prone') return (foe.status?.prone ?? 0) > 0;
  if (condition === 'disarmed') return foe.mobWeapon === 'unarmed';
  const field = FIELDS[condition];
  return !!field && (foe.weaponMarks?.[field] ?? 0) > 0;
}

/** How the marks on two fighters change an attack roll: an Off Balance target is struck at advantage, a Weak Grip strikes at disadvantage. */
export function markedAttackMode(mode: D20Mode, attacker: Entity | undefined, target: Entity): D20Mode {
  let next = mode;
  if ((target.weaponMarks?.offBalance ?? 0) > 0) next = next === 'disadvantage' ? 'normal' : 'advantage';
  if ((attacker?.weaponMarks?.weakGrip ?? 0) > 0) next = next === 'advantage' ? 'normal' : 'disadvantage';
  return next;
}

/** What Dazed takes off a foe's Armor Class: its Dexterity, if that adds any. */
export function dazedArmorPenalty(foe: Entity): number {
  if ((foe.weaponMarks?.dazed ?? 0) <= 0 || !foe.mobType) return 0;
  return Math.max(0, MONSTERS[foe.mobType].modifiers.dexterity);
}

/** The share of its pace a foe moves at: none Maimed, half Hamstrung. */
export function markedPace(body: Entity): number {
  const marks = body.weaponMarks;
  if (!marks) return 1;
  if (marks.maimed > 0) return 0;
  return marks.hamstrung > 0 ? HAMSTRUNG_PACE : 1;
}

/** How many times slower a foe strikes: twice with Chest Trauma (one action fewer), else at its own pace. */
export function traumaSlowdown(foe: Entity): number {
  return (foe.weaponMarks?.chestTrauma ?? 0) > 0 ? TRAUMA_SLOWER : 1;
}

/**
 * Whether the marks put a save at disadvantage: Constitution while Bleeding, Wisdom while Dazed, Dexterity while Maimed, and
 * Strength and Dexterity while Off Balance or with a Weak Grip.
 */
function penalised(marks: WeaponMarks, stat: StatName): boolean {
  if (stat === 'constitution') return marks.bleeding > 0;
  if (stat === 'wisdom') return marks.dazed > 0;
  const shaken = marks.offBalance > 0 || marks.weakGrip > 0;
  if (stat === 'dexterity') return shaken || marks.maimed > 0;
  return stat === 'strength' && shaken;
}

/** A save the marks put at disadvantage. */
export function markedSaveMode(foe: Entity | undefined, stat: StatName): D20Mode {
  return foe?.weaponMarks && penalised(foe.weaponMarks, stat) ? 'disadvantage' : 'normal';
}

/** A blow that hurts the foe: Gaping Wounds add their piercing damage; the hurt ends Off Balance. Returns the damage to deal. */
export function woundedFurther(foe: Entity, damage: number): number {
  const marks = foe.weaponMarks;
  if (!marks || damage <= 0 || justMarked.has(foe)) return damage;
  marks.offBalance = 0;
  return marks.gapingWounds > 0 ? damage + GAPING_DAMAGE : damage;
}

/** The bleeding at the end of a turn: its slashing damage, dealt by whoever opened the wound. */
function bleed(foe: Entity, marks: WeaponMarks, hurt: (foe: Entity, by: Entity, damage: number) => void): void {
  if (marks.bleeding <= 0 || --marks.bleeding % TURN_TICKS !== 0) return;
  hurt(foe, world.entity(marks.by) ?? foe, BLEED_DAMAGE);
}

/** Once a tick on the host: the marks wear off, the bleeding bleeds (`hurt` deals its damage), and a foe free of them loses the component. */
export function updateWeaponMarks(hurt: (foe: Entity, by: Entity, damage: number) => void): void {
  justMarked.clear();
  for (let i = markedFoes.entities.length - 1; i >= 0; i--) {
    const foe = markedFoes.entities[i];
    const m = foe.weaponMarks;
    bleed(foe, m, hurt);
    m.dazed = Math.max(0, m.dazed - 1);
    m.maimed = Math.max(0, m.maimed - 1);
    m.offBalance = Math.max(0, m.offBalance - 1);
    m.weakGrip = Math.max(0, m.weakGrip - 1);
    m.chestTrauma = Math.max(0, m.chestTrauma - 1);
    m.gapingWounds = Math.max(0, m.gapingWounds - 1);
    m.hamstrung = Math.max(0, m.hamstrung - 1);
    const left = m.bleeding + m.dazed + m.maimed + m.offBalance + m.weakGrip + m.chestTrauma + m.gapingWounds + m.hamstrung;
    if (left <= 0 || (foe.health?.current ?? 0) <= 0) world.removeComponent(foe, 'weaponMarks');
  }
}
