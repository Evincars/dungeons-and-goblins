import { world, isMob } from '../world';
import type { Entity, Mob, Player } from '../world';
import { createDecoy } from '../entities/SummonFactory';
import { playEffect } from '../assets/Effects';
import { AIM_HEIGHT } from '../entities/ProjectileFactory';
import { sound } from '../audio/SoundPlayer';

/**
 * Improved Minor Illusion's dummy (systems/SchoolSystem.ts makes it): an illusory training dummy that stands where the
 * illusionist aimed. The foes that failed their save against it are `lured`: they think of nothing else, walk to it
 * and strike it (systems/CombatSystem.ts) until its hit points are gone or its time is up; then they fight as before.
 */

/** A lured foe stops walking once its body is this near the dummy's (px), and strikes it. */
const CLOSE_ENOUGH = 4;
/** The dummy flinches this long when struck. */
const DECOY_HURT_TICKS = 25;
const FADE_EFFECT = { shape: 'swirl_bloom', colour: 'violet', scale: 1 } as const;

const decoys = world.with('decoy', 'position', 'health');
const lured = world.with('lured', 'position', 'velocity');

/** The dummy fades away where it stands. */
function fade(decoy: Entity): void {
  if (decoy.position) playEffect(FADE_EFFECT.shape, FADE_EFFECT.colour, decoy.position.x, decoy.position.y, AIM_HEIGHT, FADE_EFFECT.scale);
  if (decoy.health) decoy.health.current = 0;
  world.addComponent(decoy, 'removed', true);
}

/** A new illusion for the hero at (x, y); the one they made before fades. */
export function placeDecoy(hero: Player, x: number, y: number): Entity {
  const owner = world.id(hero) ?? -1;
  for (const old of decoys.entities.slice()) if (old.decoy.owner === owner && !old.removed) fade(old);
  return createDecoy(x, y, owner);
}

/** The foe goes for the dummy from now on (a charm that held it lets go). */
export function lure(foe: Entity, decoy: Entity): void {
  const id = world.id(decoy);
  if (id === undefined) return;
  world.addComponent(foe, 'lured', id);
  if (foe.status) foe.status.charmed = 0;
}

/** The dummy a foe was lured to, while it still stands. */
export function lureOf(foe: Entity): Entity | undefined {
  if (foe.lured === undefined) return undefined;
  const decoy = world.entity(foe.lured);
  return decoy?.decoy && !decoy.removed && (decoy.health?.current ?? 0) > 0 ? decoy : undefined;
}

/**
 * A lured foe's tick instead of its own thinking: it walks straight for the dummy and stops at it. Returns whether the
 * foe was lured (false: it thinks for itself).
 */
export function followLure(mob: Mob): boolean {
  if (mob.lured === undefined) return false;
  const decoy = lureOf(mob);
  if (!decoy?.position) {
    world.removeComponent(mob, 'lured');
    return false;
  }
  const dx = decoy.position.x - mob.position.x;
  const dy = decoy.position.y - mob.position.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= mob.radius.x + (decoy.radius?.x ?? 0) + CLOSE_ENOUGH) return true;
  const speed = mob.speed ?? 0;
  mob.velocity.x += (dx / dist) * speed;
  mob.velocity.y += (dy / dist) * speed;
  mob.aimVector ??= { x: 0, y: 1 };
  mob.aimVector.x = dx / dist;
  mob.aimVector.y = dy / dist;
  return true;
}

/** A foe's blow landed on the dummy: it loses the hit points and shakes; with none left it fades. */
export function hurtDecoy(decoy: Entity, damage: number): void {
  const h = decoy.health;
  if (!h || h.current <= 0) return;
  h.current = Math.max(0, h.current - damage);
  decoy.hurtTime = DECOY_HURT_TICKS;
  if (decoy.position) sound.playSound('hurt', decoy.position.x, decoy.position.y);
  if (h.current <= 0) fade(decoy);
}

/** The dummies' time runs down (one whose time is up fades), and foes whose dummy is gone are themselves again. */
export function updateDecoys(): void {
  for (const decoy of decoys.entities.slice()) {
    if (decoy.removed) continue;
    if ((decoy.hurtTime ?? 0) > 0) decoy.hurtTime = (decoy.hurtTime ?? 0) - 1;
    if (--decoy.decoy.ticks <= 0) fade(decoy);
  }
  for (const foe of lured.entities.slice()) {
    if (!lureOf(foe) || !isMob(foe) || foe.health.current <= 0) world.removeComponent(foe, 'lured');
  }
}

/** The dummies standing now (for the foes that strike them). */
export function standingDecoys(): readonly Entity[] {
  return decoys.entities;
}
