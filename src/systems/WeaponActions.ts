import { world, isPlayer, isTarget } from '../world';
import type { Entity, Player } from '../world';
import type { Level } from '../level/Level';
import { text } from '../core/texts';
import { characterSheet } from '../rules/CharacterSheet';
import type { CharacterSheet } from '../rules/CharacterSheet';
import { heroClass, itemTrained } from '../rules/Classes';
import { weaponRule } from '../rules/Equipment';
import type { AttackOutcome, AttackProfile } from '../rules/Combat';
import { feetToPx } from '../rules/Scale';
import { TICKS_PER_SECOND } from '../rules/Spells';
import { weaponAction, weaponActionDc, weaponHasAction } from '../rules/WeaponActions';
import type { WeaponAction, WeaponActionId } from '../rules/WeaponActions';
import type { WeaponBase } from '../rules/WeaponTable';
import { nearby, Sense } from '../ai/perception/spatial';
import { MAX_MOB_RADIUS } from '../entities/MobFactory';
import { AIM_HEIGHT } from '../entities/ProjectileFactory';
import { playEffect } from '../assets/Effects';
import { logLine } from './RollLogSystem';
import { recordEvent } from './CombatLogSystem';
import { bodySave } from './BodySaves';
import { markFoe } from './WeaponMarks';
import { standable } from './FeatureSystem';
import { hitMob } from './Hits';
import { strike } from './Strike';
import { bonusSwing } from './SwordSystem';
import { bonusShot, shoot } from './ArrowSystem';

/**
 * The heroes' weapon actions (src/rules/WeaponActions.ts), used from the quick bar with the weapon that unlocks them in the
 * main hand and proficiency in it. Each is spent until a short or long rest, hit or miss (Tenacity works by itself, as often
 * as it may). Baldur's Gate's turns become real time:
 * - a strike or a shot (Lacerate, Topple, Hamstring Shot…) is readied and goes with the hero's next blow or shot, which comes
 *   at once if the hero is not attacking already: its damage (the weapon's, or 1d4 + the better of STR and DEX, or 1d4) and,
 *   on a hit, the foe's save against its condition (systems/WeaponMarks.ts);
 * - Cleave readies a swing that sweeps a wide arc, up to 3 foes, each for half damage (systems/SwordSystem.ts);
 * - Rush Attack charges 30 feet along the aim, striking every foe in the way;
 * - Brace and Prepare are a stance for a turn (6 s): damage dice rolled twice keeping the higher, or the STR modifier more;
 * - Mobile Shot looses a bolt at once while the hero sprints, whether the weapon has reloaded or not;
 * - Tenacity: a melee miss still deals the STR modifier (at least 1) in bludgeoning damage; its square switches it off and on.
 */

/** A readied strike or shot waits this long for its blow before it is lost. */
const READY_TICKS = 10 * TICKS_PER_SECOND;
/** A stance lasts a turn. */
const STANCE_TICKS = 6 * TICKS_PER_SECOND;
/** Rush Attack charges this far, in steps this long, and strikes every foe within this far of its path. */
const RUSH_REACH = feetToPx(30);
const RUSH_STEP = 6;
const RUSH_WIDTH = 12;
const RUSH_EFFECT = { shape: 'sparkle_ring', colour: 'white', scale: 0.8 } as const;
/** A hybrid DC is the weapon action DC with this more, or the spell save DC, whichever is higher. */
const HYBRID_BONUS = 2;
/** The fewest hit points Tenacity deals on a miss. */
const TENACITY_MIN = 1;

/** What using a weapon action came to: done, or why not. */
export type ActionUse = 'ok' | 'no_weapon' | 'untrained' | 'spent' | 'not_sprinting';

const readied = world.with('weaponAction');
const braced = world.with('actionStance');
const scratch: Entity[] = [];

/** The weapon in the hero's main hand, if it unlocks the action (an off-hand weapon unlocks none). */
function mainWeapon(hero: Player, id: WeaponActionId): WeaponBase | null {
  const weapon = weaponRule(hero.equipped?.primary);
  return weapon && weaponHasAction(weapon.base, id) ? weapon.base : null;
}

/** Whether the hero is proficient with the weapon in their main hand (their class's training, or a feat's). */
function trainedInMain(hero: Player, sheet: CharacterSheet): boolean {
  const item = hero.equipped?.primary;
  return !!item && itemTrained(heroClass(hero.heroClass), item, sheet.feats.armor, sheet.feats.weapons);
}

/** Whether the hero has used the action since their last rest. */
export function actionSpent(hero: Player, id: WeaponActionId): boolean {
  return weaponAction(id).perRest && !!hero.actionsSpent?.includes(id);
}

/** Whether the hero switched an action that works by itself off (Tenacity). */
export function actionOff(hero: Player, id: WeaponActionId): boolean {
  return !!hero.actionsOff?.includes(id);
}

/** Whether the hero may use the action now, or why not: the weapon in the main hand, proficiency with it, not spent. */
export function actionAvailable(hero: Player, id: WeaponActionId): ActionUse {
  if (!mainWeapon(hero, id)) return 'no_weapon';
  if (!trainedInMain(hero, characterSheet(hero))) return 'untrained';
  return actionSpent(hero, id) ? 'spent' : 'ok';
}

/** The action is used: spent until a rest, said over the hero's head and in the combat log. */
function spend(hero: Player, action: WeaponAction): void {
  if (action.perRest) hero.actionsSpent = [...(hero.actionsSpent ?? []), action.id];
  logLine(hero, action.name, 'crit');
  if (world.id(hero) !== undefined) recordEvent(hero, 'feature', { item: action.name });
}

/** The DC a foe saves against: the weapon action DC, or for a hybrid the higher of it (+2) and the spell save DC. */
export function actionDc(sheet: CharacterSheet, action: WeaponAction): number {
  const dc = weaponActionDc(action, sheet.proficiency, sheet.modifiers.strength, sheet.modifiers.dexterity);
  if (!action.hybridDc) return dc;
  return Math.max(dc + HYBRID_BONUS, sheet.spell.trained ? sheet.spell.dc : 0);
}

/** 1d4 + the better of STR and DEX, or a plain 1d4 (bludgeoning, no ability), in place of the weapon's dice. */
function actionDamage(sheet: CharacterSheet, action: WeaponAction, attack: AttackProfile): AttackProfile {
  if (action.damage === 'd4') return { ...attack, damage: { count: 1, sides: 4, bonus: 0 }, extra: undefined };
  if (action.damage !== 'd4_mod') return attack;
  const bonus = Math.max(sheet.modifiers.strength, sheet.modifiers.dexterity);
  return { ...attack, damage: { count: 1, sides: 4, bonus }, extra: undefined };
}

// ── Using one from the quick bar ─────────────────────────────────────────────

/** Rush Attack: the hero charges along the aim as far as the way is open, and strikes every foe in the path. */
function rush(level: Level, hero: Player, action: WeaponAction, aim: { x: number; y: number }): void {
  const from = { x: hero.position.x, y: hero.position.y };
  const dx = aim.x - from.x;
  const dy = aim.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  let reached = 0;
  for (let d = RUSH_STEP; d <= RUSH_REACH; d += RUSH_STEP) {
    if (!standable(level, hero, from.x + ux * d, from.y + uy * d)) break;
    reached = d;
  }
  playEffect(RUSH_EFFECT.shape, RUSH_EFFECT.colour, from.x, from.y, AIM_HEIGHT, RUSH_EFFECT.scale);
  const sheet = characterSheet(hero);
  const attack = actionDamage(sheet, action, sheet.attack);
  const midX = from.x + ux * (reached / 2);
  const midY = from.y + uy * (reached / 2);
  for (const foe of nearby(midX, midY, reached / 2 + RUSH_WIDTH + MAX_MOB_RADIUS, Sense.mob, scratch)) {
    if (!isTarget(foe) || foe.health.current <= 0 || !foe.position) continue;
    const along = (foe.position.x - from.x) * ux + (foe.position.y - from.y) * uy;
    const across = Math.abs((foe.position.x - from.x) * uy - (foe.position.y - from.y) * ux);
    if (along < 0 || along > reached + RUSH_WIDTH || across > RUSH_WIDTH + (foe.radius?.x ?? 0)) continue;
    rushStrike(hero, foe, attack, action, sheet);
  }
  hero.position.x = from.x + ux * reached;
  hero.position.y = from.y + uy * reached;
  hero.aimVector ??= { x: 0, y: 1 };
  hero.aimVector.x = ux;
  hero.aimVector.y = uy;
}

/** One foe in the rush's path: the attack, and on a hit its damage and the foe's save against the condition. */
function rushStrike(hero: Player, foe: Entity, attack: AttackProfile, action: WeaponAction, sheet: CharacterSheet): void {
  const outcome = strike(foe, attack, hero);
  if (!outcome.hit) return;
  hitMob(foe, hero, outcome.damage, true);
  laySave(hero, foe, action, sheet);
}

/** A strike, a shot or a Cleave is readied for the next blow, which comes at once if the hero is not attacking already. */
function ready(hero: Player, action: WeaponAction): void {
  if (hero.weaponAction) world.removeComponent(hero, 'weaponAction');
  world.addComponent(hero, 'weaponAction', { id: action.id, ticks: READY_TICKS });
  if (action.reach === 'ranged') bonusShot(hero);
  else bonusSwing(hero);
}

/** A stance for a turn: Brace, Prepare. */
function stand(hero: Player, action: WeaponAction): void {
  if (hero.actionStance) world.removeComponent(hero, 'actionStance');
  world.addComponent(hero, 'actionStance', { id: action.id, ticks: STANCE_TICKS });
}

/** Tenacity's square: it is switched off, or on again. */
function toggle(hero: Player, id: WeaponActionId): void {
  const off = hero.actionsOff ?? [];
  hero.actionsOff = off.includes(id) ? off.filter((other) => other !== id) : [...off, id];
  logLine(hero, actionOff(hero, id) ? text('action.tip.off') : weaponAction(id).name, 'miss');
}

/** The hero uses a weapon action from the quick bar (with the crosshair at `aim`). Returns why nothing happened, if nothing did. */
export function useWeaponAction(hero: Player, id: WeaponActionId, level: Level, aim: { x: number; y: number }): ActionUse {
  const can = actionAvailable(hero, id);
  if (can !== 'ok') return can;
  const action = weaponAction(id);
  if (action.kind === 'reaction') {
    toggle(hero, id);
    return 'ok';
  }
  if (action.kind === 'mobile' && !hero.playerStats.sprinting) return 'not_sprinting';
  spend(hero, action);
  if (action.kind === 'stance') stand(hero, action);
  else if (action.kind === 'rush') rush(level, hero, action, aim);
  else if (action.kind === 'mobile') shoot(hero);
  else ready(hero, action);
  return 'ok';
}

// ── The blow it goes with ────────────────────────────────────────────────────

/** Whether the hero's blow is a shot (a bow or crossbow in the main hand) rather than a melee blow. */
function shooting(hero: Player): boolean {
  return weaponRule(hero.equipped?.primary)?.rule.range === 'ranged';
}

/** A stance shapes every blow while it lasts: Brace rolls the damage twice (melee or ranged as it says), Prepare adds STR. */
function withStance(hero: Player, attack: AttackProfile): AttackProfile {
  const stance = hero.actionStance;
  if (!stance || stance.ticks <= 0) return attack;
  const ranged = shooting(hero);
  if (stance.id === 'brace_melee' && !ranged) return { ...attack, savage: true };
  if (stance.id === 'brace_ranged' && ranged) return { ...attack, savage: true };
  if (stance.id !== 'prepare' || ranged) return attack;
  const strength = characterSheet(hero).modifiers.strength;
  return { ...attack, damage: { ...attack.damage, bonus: attack.damage.bonus + Math.max(0, strength) } };
}

/** What the hero's readied action and stance do to a weapon blow before it is rolled (systems/Strike.ts). */
export function actionBlow(attack: AttackProfile, attacker: Entity | undefined): AttackProfile {
  if (!isPlayer(attacker)) return attack;
  const hero = attacker;
  const stanced = withStance(hero, attack);
  const readiedAction = attacker.weaponAction;
  if (!readiedAction || readiedAction.ticks <= 0 || readiedAction.id === 'cleave') return stanced;
  return actionDamage(characterSheet(hero), weaponAction(readiedAction.id), stanced);
}

/** On a hit, the foe saves against the action's condition (said over its head) or suffers it. */
function laySave(hero: Player, foe: Entity, action: WeaponAction, sheet: CharacterSheet): void {
  if (!action.condition || !action.save || (foe.health?.current ?? 0) <= 0) return;
  if (bodySave(foe, action.save, actionDc(sheet, action))) return;
  markFoe(foe, action.condition, action.turns, world.id(hero) ?? -1);
}

/** Tenacity: a melee miss still deals the STR modifier in bludgeoning damage (at least 1), while the hero wields its weapon. */
function tenacity(hero: Player, foe: Entity, sheet: CharacterSheet): void {
  if (!hero.equipped?.primary || hero.actionsOff?.includes('tenacity')) return;
  const weapon = weaponRule(hero.equipped.primary);
  if (!weapon || weapon.rule.range === 'ranged' || !weaponHasAction(weapon.base, 'tenacity')) return;
  if (!itemTrained(sheet.heroClass, hero.equipped.primary, sheet.feats.armor, sheet.feats.weapons)) return;
  logLine(hero, text('roll.tenacity'), 'damage');
  hitMob(foe, hero, Math.max(TENACITY_MIN, sheet.modifiers.strength), true, 'bludgeoning');
}

/**
 * The blow was rolled (systems/Strike.ts): the readied strike or shot is spent on it, hit or miss, and on a hit the foe saves
 * against its condition; a melee miss may still hurt through Tenacity.
 */
export function afterActionBlow(attacker: Entity | undefined, foe: Entity, outcome: AttackOutcome): void {
  if (!isPlayer(attacker)) return;
  const sheet = characterSheet(attacker);
  if (!outcome.hit) tenacity(attacker, foe, sheet);
  const readiedAction = attacker.weaponAction;
  if (!readiedAction || readiedAction.id === 'cleave') return;
  world.removeComponent(attacker, 'weaponAction');
  if (outcome.hit) laySave(attacker, foe, weaponAction(readiedAction.id), sheet);
}

/** Whether the hero's next swing is a Cleave: it is taken up by the swing (systems/SwordSystem.ts), which sweeps wide. */
export function takeCleave(hero: Player): boolean {
  if (hero.weaponAction?.id !== 'cleave') return false;
  world.removeComponent(hero, 'weaponAction');
  return true;
}

/** A rest gives the weapon actions back. */
export function restoreActions(hero: Player): void {
  if (hero.actionsSpent) world.removeComponent(hero, 'actionsSpent');
}

/** Once a tick: a readied action not used in time is lost, a stance wears off. */
export function updateWeaponActions(): void {
  for (let i = readied.entities.length - 1; i >= 0; i--) {
    const hero = readied.entities[i];
    if (--hero.weaponAction.ticks <= 0) world.removeComponent(hero, 'weaponAction');
  }
  for (let i = braced.entities.length - 1; i >= 0; i--) {
    const hero = braced.entities[i];
    if (--hero.actionStance.ticks <= 0) world.removeComponent(hero, 'actionStance');
  }
}
