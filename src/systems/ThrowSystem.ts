import { world, q, isActivePlayer, isMob, isPlayer, Team } from '../world';
import type { Entity, InventoryItem, Player } from '../world';
import type { Level } from '../level/Level';
import { IMPROVISED_DAMAGE, IMPROVISED_RANGE_FEET, THROWABLES, isThrowableId } from '../rules/Throwables';
import type { ThrowableDef, ThrowableId, ThrownKind } from '../rules/Throwables';
import type { AttackProfile } from '../rules/Combat';
import type { DamageType } from '../rules/DamageTypes';
import { plus, rollDice } from '../rules/Dice';
import { feetToPx } from '../rules/Scale';
import { weaponRule } from '../rules/Equipment';
import { characterSheet, weaponAttack } from '../rules/CharacterSheet';
import { setDownItem } from '../entities/LootFactory';
import { strike } from './Strike';
import { hitMob } from './Hits';
import { recordEvent } from './CombatLogSystem';
import { CLOSE_QUARTERS_PX } from '../rules/CloseQuarters';
import { ATTACK_PERIOD } from '../entities/WeaponStats';
import { nearby, Sense } from '../ai/perception/spatial';
import { MAX_MOB_RADIUS } from '../entities/MobFactory';
import { playVfx } from '../render/VfxPlayer';
import { sound } from '../audio/SoundPlayer';
import { isBackingOff } from '../ai/execution/skirmish';
import { targetFor } from './EnemyRangedSystem';
import { burn, isDown, setAlight, spreadSurface } from './Surfaces';
import { logHeal, logLine } from './RollLogSystem';
import { bodySave } from './BodySaves';
import { text } from '../core/texts';

/**
 * Flasks thrown at the heroes (src/data/throwables.json): an enemy that carries one (`mobThrowable`) throws it, now and
 * then, at a hero it sees on their screen, beyond arm's reach and within the flask's range — where most heroes stand
 * together. The flask flies in an arc (`thrown`) and bursts where it lands: Alchemist's Fire splashes everyone near with
 * fire (a Dexterity save, or they burn) and leaves the floor burning; the Grease Bottle leaves slick grease (systems/Surfaces.ts).
 * A hero throws anything out of the bag (the inventory's Throw, aimed in the world: game/ThrowAim.ts): a flask splashes as an
 * enemy's does, a potion of healing heals every creature its splash wets (a foe too), and anything else strikes the foe it
 * lands on (D&D's improvised weapon, 1d4 + STR; a dagger or a javelin as its own table says) and lies where it fell.
 * The host's work alone; guests see the flask fly in the world it sends.
 */

/** An enemy weighs throwing this often (ticks), and throws on this share of those (so not the instant it sees a hero). */
const THINK_TICKS = 20;
const THROW_CHANCE = 0.5;
/** A flask is thrown only at a hero this far beyond the edge of its own splash (px), so the thrower stays out of it. */
const SPLASH_CLEARANCE = 12;
/** A flask flies this fast (px a tick), never for less than this many ticks, and rises this high (px) at the top of its arc. */
const FLASK_SPEED = 4;
const MIN_FLIGHT = 14;
const ARC_HEIGHT = 36;
/** The flask leaves the thrower's hand this high above their feet. */
const HAND_HEIGHT = 14;
/** A thrown thing is drawn this big (px, its longer side) as it flies. */
const THROWN_ICON = 12;
/** Anything thrown that is no flask strikes a foe whose feet are this near where it lands (px). */
export const OBJECT_HIT_RADIUS = 12;
/** An improvised weapon flies this far (feet) before its throw has disadvantage. */
const IMPROVISED_NORMAL_FEET = 20;
/** A healing potion's glow plays this far above the feet of whoever it heals. */
const HEAL_LIFT = 8;

const carriers = world.with('position', 'velocity', 'mobType', 'mobThrowable', 'health', 'ai');
type Carrier = (typeof carriers)['entities'][number];
const flying = world.with('thrown', 'position');
type Flask = (typeof flying)['entities'][number];
const scratch: Entity[] = [];
/** What each hero's throw carries while it flies (the host's: the item lands with it, or strikes with it). */
const carried = new Map<Entity, InventoryItem>();

/** How many heroes on their feet stand within the splash if it lands at (x, y). */
function heroesNear(x: number, y: number, radius: number): number {
  let count = 0;
  for (const hero of q.players) if (isActivePlayer(hero) && Math.hypot(hero.position.x - x, hero.position.y - y) <= radius) count++;
  return count;
}

/** Whether the enemy could throw now: carrying a flask, fighting, on its feet, not backing off, its arm free. */
function readyToThrow(mob: Carrier, tick: number): boolean {
  if (mob.mobThrowable.count <= 0 || mob.removed || mob.health.current <= 0 || isDown(mob)) return false;
  if (mob.ai.state !== 'engage' || (mob.attackCooldown ?? 0) > 0 || (isMob(mob) && isBackingOff(mob))) return false;
  return (tick + (world.id(mob) ?? 0)) % THINK_TICKS === 0 && Math.random() < THROW_CHANCE;
}

/** Throws the enemy's flask at the hero it sees, if one stands beyond arm's reach and within range, where most heroes stand. */
function considerThrow(level: Level, mob: Carrier, tick: number): void {
  if (!readyToThrow(mob, tick)) return;
  const def = THROWABLES[mob.mobThrowable.item];
  const hero = targetFor(level, mob, def.range);
  if (!hero) return;
  const d = Math.hypot(hero.position.x - mob.position.x, hero.position.y - mob.position.y);
  // Not into its own face: a flask is thrown from beyond arm's reach, and from outside its own splash.
  if (d <= Math.max(CLOSE_QUARTERS_PX, def.radius + SPLASH_CLEARANCE)) return;
  throwFlask(mob, def, hero.position.x, hero.position.y);
  if (heroesNear(hero.position.x, hero.position.y, def.radius) > 1) logLine(mob, text('roll.throws'), 'damage');
}

/** The flask leaves the hand towards (x, y): it flies for as long as the distance takes, in an arc. */
export function throwFlask(thrower: Entity, def: ThrowableDef, x: number, y: number): Entity {
  if (thrower.mobThrowable) thrower.mobThrowable.count--;
  return launch(thrower, def.id, x, y);
}

/** Something leaves the thrower's hand towards (x, y), in an arc, drawn as `icon` if given (a flask flies as its trail). */
function launch(thrower: Entity, item: ThrownKind, x: number, y: number, icon?: string): Entity {
  const from = thrower.position ?? { x, y };
  const total = Math.max(MIN_FLIGHT, Math.round(Math.hypot(x - from.x, y - from.y) / FLASK_SPEED));
  thrower.attackCooldown = ATTACK_PERIOD;
  thrower.attackTime = ATTACK_PERIOD / 2;
  sound.playSound('sword_swing', from.x, from.y);
  const team = isPlayer(thrower) ? Team.Player : Team.Mob;
  return world.add({
    position: { x: from.x, y: from.y }, yOffset: HAND_HEIGHT,
    thrown: { item, owner: world.id(thrower) ?? -1, team, fromX: from.x, fromY: from.y, toX: x, toY: y, ticks: 0, total },
    ...(icon ? { visual: { sheet: icon, fit: THROWN_ICON } } : {}),
  });
}

/** What an item flies as when a hero throws it: its flask or potion, or anything else. */
export function thrownKindOf(item: InventoryItem): ThrownKind {
  return item.type === 'consumable' && isThrowableId(item.kind) ? item.kind : 'object';
}

/** How far a hero can throw an item (px): a flask's or potion's range, a throwing weapon's long range, else 60 feet. */
export function throwReach(item: InventoryItem): number {
  const kind = thrownKindOf(item);
  if (kind !== 'object') return THROWABLES[kind].range;
  const distance = weaponRule(item)?.rule.distance;
  return feetToPx(distance?.[1] ?? IMPROVISED_RANGE_FEET);
}

/** How wide what an item does where it lands (px): a flask's or potion's splash, else the reach of its blow. */
export function throwRadius(item: InventoryItem): number {
  const kind = thrownKindOf(item);
  return kind === 'object' ? OBJECT_HIT_RADIUS : THROWABLES[kind].radius;
}

/** Where a throw at (x, y) lands: there, or as far that way as the hero can throw it (written into `out`). */
export function landingPoint(from: { x: number; y: number }, reach: number, x: number, y: number, out: { x: number; y: number }): { x: number; y: number } {
  const d = Math.hypot(x - from.x, y - from.y);
  const k = d > reach && d > 0 ? reach / d : 1;
  out.x = from.x + (x - from.x) * k;
  out.y = from.y + (y - from.y) * k;
  return out;
}

const landing = { x: 0, y: 0 };

/**
 * A hero throws an item already taken out of their bag (game/PlayerActions.ts `throwFromBag`) at (x, y), as far as it goes:
 * a flask or potion bursts where it lands; anything else strikes the foe there and lies where it fell.
 */
export function throwItem(hero: Player, item: InventoryItem, x: number, y: number): Entity {
  const to = landingPoint(hero.position, throwReach(item), x, y, landing);
  const kind = thrownKindOf(item);
  const flask = launch(hero, kind, to.x, to.y, item.icon);
  carried.set(flask, item);
  if (kind === 'object') logLine(hero, text('roll.throws_item', { item: item.name }), 'damage');
  return flask;
}

/** A flask a tick further along its arc; it bursts where it lands. */
function fly(flask: Flask): void {
  const t = flask.thrown;
  t.ticks++;
  const share = Math.min(1, t.ticks / t.total);
  flask.position.x = t.fromX + (t.toX - t.fromX) * share;
  flask.position.y = t.fromY + (t.toY - t.fromY) * share;
  flask.yOffset = HAND_HEIGHT * (1 - share) + Math.sin(share * Math.PI) * ARC_HEIGHT;
  if (share < 1) return;
  world.addComponent(flask, 'removed', true);
  const item = carried.get(flask);
  carried.delete(flask);
  if (t.item === 'object') landObject(item, t.toX, t.toY, t.owner, Math.hypot(t.toX - t.fromX, t.toY - t.fromY));
  else land(t.item, t.toX, t.toY, t.owner);
}

/** A save against the flask's splash, shown over the head of whoever rolls it (systems/BodySaves.ts). */
const dodges = (body: Entity, def: ThrowableDef): boolean => def.save !== null && bodySave(body, def.save, def.dc);

/** One body in the splash of liquid fire: a save, or it takes the fire and burns on. */
function splash(body: Entity, def: ThrowableDef, owner: number): void {
  if (dodges(body, def)) return;
  if (def.damage) burn(body, owner, def.damage, def.damageType);
  if (def.burnTicks > 0) setAlight(body, owner, def.burnTicks);
}

/** Every hero on their feet and live foe within the splash of a flask that landed at (x, y). */
function splashed(x: number, y: number, radius: number, act: (body: Entity) => void): void {
  for (const hero of q.players) if (isActivePlayer(hero) && Math.hypot(hero.position.x - x, hero.position.y - y) <= radius) act(hero);
  for (const foe of nearby(x, y, radius + MAX_MOB_RADIUS, Sense.mob, scratch)) {
    if (isMob(foe) && foe.health.current > 0 && Math.hypot(foe.position.x - x, foe.position.y - y) <= radius) act(foe);
  }
}

/**
 * A healing potion mends a body (drunk, or wet by its splash): up to its full health, with the healing light, the number
 * over its head and a line in the combat log. Returns how much it healed.
 */
export function quaff(body: Entity, def: ThrowableDef): number {
  const h = body.health;
  if (!def.heal || !h || !body.position || h.current <= 0) return 0;
  const healed = Math.min(h.max - h.current, Math.max(1, rollDice(def.heal)));
  h.current += healed;
  playVfx('prayer-of-healing', body.position.x, body.position.y, HEAL_LIFT);
  logHeal(body, healed);
  recordEvent(body, 'regain', { item: def.name, amount: healed });
  return healed;
}

/** The flask bursts where it landed: its particles, its splash (fire hurts and sets alight, a potion heals), and what it leaves on the floor. */
export function land(item: ThrowableId, x: number, y: number, owner: number): void {
  const def = THROWABLES[item];
  if (def.heal) {
    sound.playSound('cast_healing_word', x, y);
    splashed(x, y, def.radius, (body) => quaff(body, def));
    return;
  }
  playVfx(def.surface === 'fire' ? 'alchemists-fire' : 'grease-splash', x, y);
  sound.playSound(def.surface === 'fire' ? 'impact_fire' : 'impact_dark', x, y);
  if (def.damage || def.burnTicks > 0) splashed(x, y, def.radius, (body) => splash(body, def, owner));
  if (def.surface) spreadSurface(def.surface, x, y, def.radius, owner, def.surfaceTicks, def.surfaceDc);
}

/** The foe nearest (x, y) within an object's reach, if any (alive, and not whoever threw it). */
export function foeHitAt(x: number, y: number, owner: number): Entity | undefined {
  let best: Entity | undefined;
  let bestDistance = OBJECT_HIT_RADIUS;
  for (const foe of nearby(x, y, OBJECT_HIT_RADIUS + MAX_MOB_RADIUS, Sense.mob, scratch)) {
    if (!isMob(foe) || foe.health.current <= 0 || world.id(foe) === owner) continue;
    const d = Math.hypot(foe.position.x - x, foe.position.y - y);
    if (d > bestDistance) continue;
    best = foe;
    bestDistance = d;
  }
  return best;
}

/**
 * The attack an object thrown `distance` px makes: a weapon made for throwing as its own table says (its dice, the hero's
 * training, finesse), with disadvantage past its normal range; anything else as an improvised weapon (1d4 + STR, no
 * proficiency, disadvantage past 20 feet).
 */
export function objectAttack(hero: Player, item: InventoryItem, distance: number): { attack: AttackProfile; type: DamageType } {
  const sheet = characterSheet(hero);
  const weapon = weaponRule(item);
  if (weapon?.rule.properties.includes('thrown')) {
    const attack: AttackProfile = weaponAttack({ primary: item }, sheet.modifiers, sheet.level, sheet.heroClass, true, null, [], sheet.feats);
    const far = distance > feetToPx(weapon.rule.distance?.[0] ?? IMPROVISED_NORMAL_FEET);
    return { attack: far ? { ...attack, mode: 'disadvantage' } : attack, type: weapon.rule.type };
  }
  const strength = sheet.modifiers.strength;
  const mode = distance > feetToPx(IMPROVISED_NORMAL_FEET) ? 'disadvantage' : 'normal';
  return { attack: { attackBonus: strength, damage: plus(IMPROVISED_DAMAGE, strength), mode }, type: 'bludgeoning' };
}

/** Something thrown lands: it strikes the foe there (rolled to hit, the blood and the numbers as any blow's) and lies where it fell. */
function landObject(item: InventoryItem | undefined, x: number, y: number, owner: number, distance: number): void {
  const hero = world.entity(owner);
  const foe = foeHitAt(x, y, owner);
  if (foe && isPlayer(hero) && item) {
    const { attack, type } = objectAttack(hero, item, distance);
    const outcome = strike(foe, attack, hero);
    sound.playSound(outcome.hit ? 'sword_hit' : 'sword_miss', x, y);
    if (outcome.hit) hitMob(foe, hero, outcome.damage, false, type);
  }
  if (item) setDownItem(x, y, item);
}

/** Host, after the enemies have moved: those carrying a flask may throw it, and flasks in the air fly on and burst. */
export function updateThrows(level: Level, tick: number): void {
  for (const mob of carriers) considerThrow(level, mob, tick);
  for (const flask of flying.entities.slice()) if (!flask.removed) fly(flask);
}
