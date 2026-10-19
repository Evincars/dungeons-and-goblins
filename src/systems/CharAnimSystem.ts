import { world } from '../world';
import type { Entity } from '../world';

type AnimDef = { sheet: string; frames: number; frameTime: number; loop: boolean };

const PLAYER: Record<string, AnimDef> = {
  idle:   { sheet: 'soldier_idle', frames: 6, frameTime: 8, loop: true },
  walk:   { sheet: 'soldier_walk', frames: 8, frameTime: 4, loop: true },
  attack: { sheet: 'soldier_atk1', frames: 6, frameTime: 3, loop: false },
};

const ORC: Record<string, AnimDef> = {
  idle: { sheet: 'orc_idle', frames: 6, frameTime: 8, loop: true },
  walk: { sheet: 'orc_walk', frames: 8, frameTime: 6, loop: true },
};

// Hold the attack pose for the full clip even after the (shorter) swing hitbox ends.
const ATTACK_HOLD = PLAYER.attack.frames * PLAYER.attack.frameTime;

function apply(e: Entity, def: AnimDef, state: string): void {
  if (e.animState === state) return;
  e.animState = state;
  const a = e.animation!;
  a.sheet = def.sheet;
  a.frameCount = def.frames;
  a.frameTime = def.frameTime;
  a.loop = def.loop;
  a.frameX = 0;
  a.timer = 0;
  if (e.visual) e.visual.sheet = def.sheet;
}

/** Drives each character's animation sheet from its movement/combat state. */
export function updateCharAnim(): void {
  for (const p of world.with('playerInput', 'animation', 'velocity')) {
    const attacking = !!p.swordSwing || (p.swordCooldown ?? 0) > 30 - ATTACK_HOLD;
    const moving = (p.walkTime ?? 0) > 0;
    const state = attacking ? 'attack' : moving ? 'walk' : 'idle';
    apply(p, PLAYER[state], state);
  }

  for (const m of world.with('ai', 'animation', 'velocity')) {
    const v = m.velocity!;
    const moving = m.chasing || Math.hypot(v.x, v.y) > 0.15;
    apply(m, ORC[moving ? 'walk' : 'idle'], moving ? 'walk' : 'idle');
  }
}
