import { world } from '../world';
import type { Entity } from '../world';
import type { Level } from '../level/Level';
import { TileType } from '../level/TileType';
import { createCoin } from '../entities/LootFactory';
import { spawnExclamation } from '../entities/FxFactory';
import { characterDef, headAboveFeet } from '../characters/Characters';
import { sound } from '../audio/SoundPlayer';
import { clearTrail } from '../ai/perception/trail';
import { run } from '../game/Run';

/** Ticks from stepping off the edge to landing at the spawn; matches the falling cry's length. */
export const FALL_TICKS = 60;
/** How far the sprite sinks into the pit over the fall. */
export const FALL_DEPTH = 48;
/** Max health lost per fall, and the least max health a player keeps. */
const FALL_PENALTY = 5;
const MIN_MAX_HEALTH = 10;
/** Half-size of the support box under the feet that must be entirely over a hole to fall. */
const SUPPORT_HALF = 6;
/** A fall scatters the purse in at most this many coins. */
const MAX_SCATTER_COINS = 8;
/** Players coming back from death can't be hurt for this long. */
const RESPAWN_GRACE_TICKS = 60;

const grounded = world.with('position', 'health');
const fallers = world.with('position', 'falling');

function holeAt(level: Level, x: number, y: number): boolean {
  return level.getTileAt(x, y)?.type === TileType.Hole;
}

/** Feet can overhang an edge while any part of their small support box has floor under it. */
export function overHole(level: Level, entity: Entity): boolean {
  const p = entity.position;
  if (!p) return false;
  const rx = Math.min(SUPPORT_HALF, entity.radius?.x ?? 0);
  const ry = Math.min(SUPPORT_HALF, entity.radius?.y ?? 0);
  return holeAt(level, p.x - rx, p.y - ry) && holeAt(level, p.x - rx, p.y + ry)
    && holeAt(level, p.x + rx, p.y - ry) && holeAt(level, p.x + rx, p.y + ry);
}

/** The player slips over the edge: input stops, a "!" pops up over their head and a cry plays. */
function startFall(player: Entity & { position: { x: number; y: number } }): void {
  const { x, y } = player.position;
  world.addComponent(player, 'falling', { age: 0, duration: FALL_TICKS });
  sound.playSound('falling', x, y);
  const head = player.character ? headAboveFeet(characterDef(player.character.def), player.visual?.scale) : 0;
  spawnExclamation(player, x, y, head, FALL_TICKS);
}

/** Anything that walks onto a hole falls in: mobs are lost, players drop and respawn. */
export function updateHoles(level: Level): void {
  for (const entity of grounded) {
    if (entity.removed || entity.respawnTicks !== undefined || !overHole(level, entity)) continue;
    if (!entity.playerInput) {
      sound.playSound('fall', entity.position.x, entity.position.y);
      world.addComponent(entity, 'removed', true);
    } else if (!entity.falling) {
      startFall(entity);
    }
  }
}

/** Holds a falling player still while they drop, then lands them at spawn. */
export function updateFalling(level: Level): void {
  for (const player of fallers) {
    const fall = player.falling;
    // Hardcore: the pit is the end of the run; they stay at the bottom.
    if (run.hardcore && fall.age >= fall.duration) {
      run.over = true;
      continue;
    }
    fall.age++;
    player.freezeTime = Math.max(player.freezeTime ?? 0, 2);
    if (player.velocity) player.velocity.x = player.velocity.y = 0;
    if (player.bump) player.bump.x = player.bump.y = 0;
    if (fall.age < fall.duration) continue;
    world.removeComponent(player, 'falling');
    respawnPlayer(player, level, 'fall');
  }
}

/** Half the purse scatters where they fell, as in Catacomb Snatch. */
function scatterPurse(player: Entity, x: number, y: number): void {
  const stats = player.playerStats;
  if (!stats || stats.gold <= 0) return;
  let remaining = Math.floor(stats.gold / 2);
  stats.gold -= remaining;
  for (let i = 0; remaining > 0 && i < MAX_SCATTER_COINS; i++) {
    const value = Math.max(1, Math.floor(remaining / 2));
    const dir = Math.random() * Math.PI * 2;
    createCoin(x, y, Math.cos(dir), Math.sin(dir), value);
    remaining -= value;
  }
}

export function respawnPlayer(player: Entity, level: Level, reason: 'fall' | 'death' = 'fall'): void {
  const pos = player.position;
  const health = player.health;
  if (!pos || !health) return;

  if (reason === 'fall') {
    sound.playSound('fall', pos.x, pos.y);
    scatterPurse(player, pos.x, pos.y);
    health.max = Math.max(MIN_MAX_HEALTH, health.max - FALL_PENALTY);
  }

  const spawn = level.getRandomSpawnPoint();
  if (spawn) { pos.x = spawn.x; pos.y = spawn.y; }
  health.current = health.max;
  // The old trail no longer leads to them.
  if (player.trail) clearTrail(player.trail);

  if (player.velocity) player.velocity.x = player.velocity.y = 0;
  if (player.bump) player.bump.x = player.bump.y = 0;
  player.hurtTime = reason === 'death' ? RESPAWN_GRACE_TICKS : 0;
  player.freezeTime = 0;
  if (player.falling) world.removeComponent(player, 'falling');
}
