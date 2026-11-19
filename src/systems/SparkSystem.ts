import type { Container } from 'pixi.js';
import type { PixiVfxEffectInstance } from 'nixie-fx/pixi';
import type { Entity } from '../world';
import { world } from '../world';
import { TICKS_PER_SECOND } from '../rules/Spells';
import { vfxEffect, vfxPoint, vfxRenderer } from '../render/Vfx';

/**
 * Sparks flying up from the torches' flames: the `torch-sparks` NixieFX effect (vfx/torch-sparks.json, render/Vfx.ts),
 * one playing at each flame, drawn just in front of its torch. Every screen plays its own; they freeze with the game.
 */

/** Just in front of the torch. */
const IN_FRONT = 0.5;
/** How much time one tick moves the sparks on (s). */
const TICK_SECONDS = 1 / TICKS_PER_SECOND;

const sparking = world.with('position', 'sparks');
const playing = new Map<Entity, PixiVfxEffectInstance>();

/** Drops the sparks of torches that are gone (a new level was built). */
function dropStale(gameLayer: Container): void {
  for (const [torch, effect] of playing) {
    if (world.id(torch) !== undefined && effect.root.parent === gameLayer) continue;
    vfxRenderer().removeEffect(effect, true);
    playing.delete(torch);
  }
}

/** Starts the sparks of a torch at its flame; null when the effects are not loaded. */
function startSparks(torch: (typeof sparking)['entities'][number], gameLayer: Container): PixiVfxEffectInstance | null {
  const definition = vfxEffect('torch-sparks');
  if (!definition) return null;
  const { x, y } = torch.position;
  // A position of its own (the effect keeps it), made once when the torch first shows.
  const effect = vfxRenderer().createEffect(definition, { position: vfxPoint(x, y - torch.sparks.lift, [0, 0, 0]), addToStage: false });
  effect.root.zIndex = y + IN_FRONT;
  gameLayer.addChild(effect.root);
  return effect;
}

/** Once a tick: sparks started at each new torch, and all of them moved on by a tick. */
export function updateSparks(gameLayer: Container): void {
  dropStale(gameLayer);
  for (const torch of sparking) {
    if (playing.has(torch)) continue;
    const effect = startSparks(torch, gameLayer);
    if (effect) playing.set(torch, effect);
  }
  if (playing.size) vfxRenderer().update(TICK_SECONDS);
}
