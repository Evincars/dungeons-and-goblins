import type { Container } from 'pixi.js';
import type { PixiVfxEffectInstance } from 'nixie-fx/pixi';
import type { Entity } from '../world';
import { world } from '../world';
import { TICKS_PER_SECOND } from '../rules/Spells';
import { vfxEffect, vfxRenderer } from '../render/Vfx';
import { takeQueuedVfx } from '../render/VfxPlayer';
import type { VfxShot } from '../render/VfxPlayer';

/**
 * The particle effects on this screen (NixieFX, render/Vfx.ts): each torch's and campfire's sparks (`sparks`) playing at its
 * flame for as long as it stands, and the one-shots asked for (render/VfxPlayer.ts: a spell's flames) until they burn out.
 * Each effect's root is put where it plays and drawn among the entities by depth. They move on a tick at a time, so they
 * freeze with the game.
 */

/** Just in front of whatever it plays at (the torch, the caster). */
const IN_FRONT = 0.5;
/** How much time one tick moves them on (s). */
const TICK_SECONDS = 1 / TICKS_PER_SECOND;

const sparking = world.with('position', 'sparks');
type Sparking = (typeof sparking)['entities'][number];
const loops = new Map<Entity, PixiVfxEffectInstance>();
const shots: PixiVfxEffectInstance[] = [];
const asked: VfxShot[] = [];

/** Starts an effect with its root at (x, y), turned to face (dirX, dirY), drawn by depth `z` in the game layer. */
function start(definition: unknown, gameLayer: Container, x: number, y: number, z: number, dirX = 1, dirY = 0): PixiVfxEffectInstance {
  const effect = vfxRenderer().createEffect(definition, { addToStage: false });
  effect.root.position.set(x, y);
  effect.root.rotation = Math.atan2(dirY, dirX);
  effect.root.zIndex = z;
  gameLayer.addChild(effect.root);
  return effect;
}

/** Drops the sparks of fires that are gone (a new level was built). */
function dropStale(gameLayer: Container): void {
  for (const [fire, effect] of loops) {
    if (world.id(fire) !== undefined && effect.root.parent === gameLayer) continue;
    vfxRenderer().removeEffect(effect, true);
    loops.delete(fire);
  }
}

/** Starts the sparks of each fire not yet throwing them (once the effects are loaded). */
function lightFires(gameLayer: Container): void {
  for (const fire of sparking) {
    if (loops.has(fire)) continue;
    const definition = vfxEffect(fire.sparks.effect);
    if (definition) loops.set(fire, start(definition, gameLayer, fire.position.x, flameY(fire), fire.position.y + IN_FRONT));
  }
}

const flameY = (fire: Sparking): number => fire.position.y - fire.sparks.lift;

/** Plays the one-shots asked for since the last tick; drops those burnt out (or left behind on another level). */
function playShots(gameLayer: Container): void {
  for (let i = shots.length - 1; i >= 0; i--) {
    const effect = shots[i];
    if (effect.isActive && effect.root.parent === gameLayer) continue;
    vfxRenderer().removeEffect(effect, true);
    shots.splice(i, 1);
  }
  for (const shot of takeQueuedVfx(asked)) {
    const definition = vfxEffect(shot.effect);
    if (definition) shots.push(start(definition, gameLayer, shot.x, shot.y - shot.lift, shot.y + IN_FRONT, shot.dirX, shot.dirY));
  }
}

/** Once a tick: sparks for each new fire, the one-shots asked for, and all of them moved on by a tick. */
export function updateVfx(gameLayer: Container): void {
  dropStale(gameLayer);
  lightFires(gameLayer);
  playShots(gameLayer);
  if (loops.size || shots.length) vfxRenderer().update(TICK_SECONDS);
}
