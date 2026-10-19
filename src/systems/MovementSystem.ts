import { world } from '../world';
import type { Level } from '../level/Level';
import { BB } from '../math/BB';
import { Mth } from '../math/Mth';
import { screenToWorld } from '../render/Camera';
import { TileType } from '../level/TileType';

const EPSILON = 0.01;
/** Height above the feet that the player aims from (also where spell bolts fly). */
export const AIM_HEIGHT = 22;

function partMove(
  pos: { x: number; y: number },
  radius: { x: number; y: number },
  bbs: BB[],
  xa: number,
  ya: number,
): boolean {
  const from = BB.fromCenter(pos.x, pos.y, radius.x, radius.y);

  for (const to of bbs) {
    if (from.intersects(to)) continue;
    if (ya === 0) {
      if (to.y0 >= from.y1 || to.y1 <= from.y0) continue;
      if (xa > 0) {
        const d = to.x0 - from.x1;
        if (d >= 0 && xa > d) xa = Math.max(0, d - EPSILON);
      } else if (xa < 0) {
        const d = to.x1 - from.x0;
        if (d <= 0 && xa < d) xa = Math.min(0, d + EPSILON);
      }
    }
    if (xa === 0) {
      if (to.x0 >= from.x1 || to.x1 <= from.x0) continue;
      if (ya > 0) {
        const d = to.y0 - from.y1;
        if (d >= 0 && ya > d) ya = Math.max(0, d - EPSILON);
      } else if (ya < 0) {
        const d = to.y1 - from.y0;
        if (d <= 0 && ya < d) ya = Math.min(0, d + EPSILON);
      }
    }
  }

  if (xa !== 0 || ya !== 0) {
    pos.x += xa;
    pos.y += ya;
    return true;
  }
  return false;
}

export function move(
  pos: { x: number; y: number },
  radius: { x: number; y: number },
  xa: number,
  ya: number,
  bbs: BB[],
  slide = true,
): boolean {
  let moved = false;
  if (slide || xa === 0 || ya === 0) {
    moved = partMove(pos, radius, bbs, xa, 0) || moved;
    moved = partMove(pos, radius, bbs, 0, ya) || moved;
  } else {
    moved = partMove(pos, radius, bbs, xa, 0) && moved;
    moved = partMove(pos, radius, bbs, 0, ya) && moved;
  }
  return moved;
}

export function updateMovement(level: Level, _dt: number): void {
  const allPhysical = world.with('position', 'velocity', 'radius');

  for (const entity of allPhysical) {
    const { position, velocity, radius } = entity;
    if (!position || !velocity || !radius) continue;
    if (entity.respawnTicks !== undefined) {
      velocity.x = velocity.y = 0;
      if (entity.bump) entity.bump.x = entity.bump.y = 0;
      continue;
    }

    const bump = entity.bump;
    const frozen = (entity.freezeTime ?? 0) > 0;
    let xa = frozen ? 0 : velocity.x;
    let ya = frozen ? 0 : velocity.y;
    if (bump) { xa += bump.x; ya += bump.y; }

    const bbs = level.getClipBBs(position.x, position.y, radius.x, radius.y);
    const fromX = position.x;
    const fromY = position.y;
    move(position, radius, xa, ya, bbs, entity.physicsSlide !== undefined);

    // Mobs can't step into holes
    if (entity.ai && level.getTileAt(position.x, position.y)?.type === TileType.Hole) {
      if (level.getTileAt(position.x, fromY)?.type !== TileType.Hole) position.y = fromY;
      else if (level.getTileAt(fromX, position.y)?.type !== TileType.Hole) position.x = fromX;
      else { position.x = fromX; position.y = fromY; }
      velocity.x = velocity.y = 0;
      if (bump) bump.x = bump.y = 0;
    }

    const friction = entity.friction ?? 0.4;
    velocity.x *= friction;
    velocity.y *= friction;
    if (Math.abs(velocity.x) < 0.01) velocity.x = 0;
    if (Math.abs(velocity.y) < 0.01) velocity.y = 0;

    if (bump) {
      bump.x *= 0.8; bump.y *= 0.8;
      if (Math.abs(bump.x) < 0.01) bump.x = 0;
      if (Math.abs(bump.y) < 0.01) bump.y = 0;
    }
  }

  // Player input movement
  for (const entity of world.with('position', 'playerInput', 'playerStats', 'health', 'velocity')) {
    const { playerInput: pi, velocity: vel, position: pos, playerStats } = entity;
    if (!pi || !vel || !pos || !playerStats) continue;
    if (entity.respawnTicks !== undefined || entity.health!.current <= 0) continue;
    if ((entity.freezeTime ?? 0) > 0) continue;

    // Casting roots the caster, facing where the spell was aimed.
    if (entity.casting) {
      entity.walkTime = 0;
      entity.facing = Mth.aimToFacing8(entity.casting.dirX, entity.casting.dirY);
      continue;
    }

    let spd = entity.speed ?? 1.0;
    const moving = pi.up || pi.down || pi.left || pi.right;

    // Sprint logic
    const sprintHeld = pi.sprint;
    if (!sprintHeld) playerStats.sprintLocked = false;
    playerStats.sprinting = false;
    if (moving && sprintHeld && !playerStats.sprintLocked && playerStats.sprint < playerStats.maxSprint) {
      playerStats.sprinting = true;
      playerStats.sprint++;
      spd *= 1.5;
    } else {
      if (moving && sprintHeld) playerStats.sprintLocked = true;
      if (playerStats.sprint > 0) playerStats.sprint--;
    }

    if (pi.up)    vel.y -= spd;
    if (pi.down)  vel.y += spd;
    if (pi.left)  vel.x -= spd;
    if (pi.right) vel.x += spd;

    entity.walkTime = moving ? (entity.walkTime ?? 0) + 1 : 0;

    // Aim vector from mouse
    if (pi.mouseAiming && entity.aimVector) {
      // Aim from hand height, so swings and spell bolts (drawn that high) pass through the crosshair.
      const target = screenToWorld(pi.mouseX, pi.mouseY);
      const dx = target.x - pos.x;
      const dy = target.y - (pos.y - AIM_HEIGHT);
      const len = Math.hypot(dx, dy);
      if (len > 0) { entity.aimVector.x = dx / len; entity.aimVector.y = dy / len; }
    }

    const aim = entity.aimVector;
    if (aim && (aim.x !== 0 || aim.y !== 0)) {
      entity.facing = Mth.aimToFacing8(aim.x, aim.y);
    } else if (moving) {
      entity.facing = Mth.aimToFacing8(vel.x, vel.y);
    }
  }
}
