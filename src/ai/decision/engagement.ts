import { isActivePlayer, q, world } from '../../world';
import type { Mob, Player } from '../../world';
import type { Level } from '../../level/Level';
import { weaponStats } from '../../rules/WeaponTable';
import { MELEE_SLOTS, RETARGET_RANGE, RETARGET_TICKS } from '../constants';
import { canSee, huntable } from '../perception/sight';
import type { Squad } from './squads';

/**
 * How the members of a squad share the fight (on top of their roles, decision/tactics.ts): an enemy that fights from afar
 * (a bow, a crossbow, spells) skirmishes — it keeps its distance and shoots (execution/skirmish.ts). Of the rest, only the
 * MELEE_SLOTS nearest the hero press in hand to hand; the others wait their turn a little way off, and step in as soon as
 * a place frees up. A waiting enemy that sees another hero with a free place near enough goes for that one instead, so a
 * crowd spreads itself over the party rather than piling on one hero.
 */

export type Engagement = 'press' | 'wait' | 'skirmish';

type Part = { part: Engagement; tick: number };
const parts = new WeakMap<Mob, Part>();
/** Melee fighters hunting each hero this tick, by the hero's entity id (counted afresh every tick). */
const crowding = new Map<number, number>();

/** Whether an enemy fights from afar: it carries a bow or crossbow, or casts spells. */
export function fightsFromAfar(mob: Mob): boolean {
  if (mob.mobCaster) return true;
  return !!mob.mobWeapon && weaponStats(mob.mobWeapon).range === 'ranged';
}

function setPart(mob: Mob, part: Engagement, tick: number): void {
  const known = parts.get(mob);
  if (known) {
    known.part = part;
    known.tick = tick;
  } else {
    parts.set(mob, { part, tick });
  }
}

/** The squad's members, nearest the hero first (squads.ts sorts them): the first MELEE_SLOTS melee fighters press in. */
function share(squad: Squad, tick: number): void {
  let pressing = 0;
  for (const mob of squad.members) {
    if (fightsFromAfar(mob)) {
      setPart(mob, 'skirmish', tick);
      continue;
    }
    setPart(mob, pressing < MELEE_SLOTS ? 'press' : 'wait', tick);
    pressing++;
  }
  crowding.set(squad.targetId, Math.min(pressing, MELEE_SLOTS + 1));
}

/** Another hero this enemy sees, near enough, with a free place round them (the nearest such), or null. */
function freeHero(level: Level, mob: Mob, current: number): Player | null {
  let best: Player | null = null;
  let bestD = RETARGET_RANGE;
  for (const hero of q.players) {
    const id = world.id(hero);
    if (id === undefined || id === current || !isActivePlayer(hero) || (crowding.get(id) ?? 0) >= MELEE_SLOTS) continue;
    const d = Math.hypot(hero.position.x - mob.position.x, hero.position.y - mob.position.y);
    if (d >= bestD || !huntable(level, hero) || !canSee(level, mob, hero)) continue;
    best = hero;
    bestD = d;
  }
  return best;
}

/** A waiting enemy turns to a hero with room round them: it hunts them from now on, knowing where they stand. */
function retarget(level: Level, mob: Mob, tick: number): void {
  const current = mob.ai.targetId;
  if (current === undefined) return;
  const hero = freeHero(level, mob, current);
  const id = hero ? world.id(hero) : undefined;
  if (!hero || id === undefined) return;
  mob.ai.targetId = id;
  mob.ai.lastSeenTick = tick;
  mob.ai.lastSeenX = hero.position.x;
  mob.ai.lastSeenY = hero.position.y;
  crowding.set(id, (crowding.get(id) ?? 0) + 1);
  crowding.set(current, Math.max(0, (crowding.get(current) ?? 1) - 1));
  setPart(mob, 'press', tick);
}

/** Every tick, after the squads form: who presses, who waits, who skirmishes; now and then the waiting look for another hero. */
export function shareFights(level: Level, squads: ReadonlyMap<number, Squad>, tick: number): void {
  crowding.clear();
  for (const squad of squads.values()) share(squad, tick);
  if (tick % RETARGET_TICKS !== 0) return;
  for (const squad of squads.values()) retargetWaiting(level, squad, tick);
}

/** The squad's members waiting their turn look for another hero with room round them. */
function retargetWaiting(level: Level, squad: Squad, tick: number): void {
  for (const mob of squad.members) if (engagementOf(mob, tick) === 'wait') retarget(level, mob, tick);
}

/** How the enemy takes part in its squad's fight this tick (press in when it was given no part). */
export function engagementOf(mob: Mob, tick: number): Engagement {
  const part = parts.get(mob);
  return part && part.tick === tick ? part.part : 'press';
}
