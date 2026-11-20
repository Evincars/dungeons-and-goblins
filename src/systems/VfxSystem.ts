import type { Container } from 'pixi.js';
import type { PixiVfxEffectInstance } from 'nixie-fx/pixi';
import type { Entity } from '../world';
import { world } from '../world';
import { TICKS_PER_SECOND } from '../rules/Spells';
import { vfxEffect, vfxPoint, vfxRenderer } from '../render/Vfx';
import { AURA_BUFFS, BUFF_AURAS, SPELL_VFX } from '../render/SpellVfx';
import type { VfxEffectId } from '../render/Vfx';
import { takeQueuedVfx } from '../render/VfxPlayer';
import type { VfxShot } from '../render/VfxPlayer';

/**
 * The particle effects on this screen (NixieFX, render/Vfx.ts): each torch's and campfire's sparks (`sparks`) playing at its
 * flame for as long as it stands, each flying spell's particles (render/SpellVfx.ts `flight`: the projectile itself and
 * what it sheds, which stays where it was shed and fades out after it is gone), and the one-shots asked for (render/VfxPlayer.ts: a spell's flames, a strike)
 * until they burn out, and what lasts: an aura round a hero while their Blade Ward or Shield holds, a zone's particles over it
 * while it lasts (both drawn from the world's state, so a co-op guest shows them too).
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
const flying = world.with('projectile', 'position');
/** Each flying spell's trail, and the point (effect units) it is shed from, moved with the projectile. */
const trails = new Map<Entity, { effect: PixiVfxEffectInstance; at: [number, number, number] }>();
/** Trails whose projectile is gone: they shed no more, and go once their last sparks have faded. */
const fading: PixiVfxEffectInstance[] = [];
const zones = world.with('position', 'zone');
const buffed = world.with('position', 'buffs');
/** Effects that follow an entity while something about it holds (an aura, a zone), by the entity and then by what they show. */
const following = new Map<Entity, Map<string, PixiVfxEffectInstance>>();
/** A hero's aura is centred this far above their feet. */
const BODY_MIDDLE = 16;
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
  dropBurntOut(shots, gameLayer);
  for (const shot of takeQueuedVfx(asked)) {
    const definition = vfxEffect(shot.effect);
    if (definition) shots.push(start(definition, gameLayer, shot.x, shot.y - shot.lift, shot.y + IN_FRONT, shot.dirX, shot.dirY));
  }
}

/** Drops what has burnt out (or was left behind on another level) from a list of effects. */
function dropBurntOut(effects: PixiVfxEffectInstance[], gameLayer: Container): void {
  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i];
    if (effect.isActive && effect.root.parent === gameLayer) continue;
    vfxRenderer().removeEffect(effect, true);
    effects.splice(i, 1);
  }
}

/** Trails whose projectile is gone stop shedding and fade out. */
function letTrailsFade(gameLayer: Container): void {
  for (const [shot, trail] of trails) {
    if (world.id(shot) !== undefined && !shot.removed && trail.effect.root.parent === gameLayer) continue;
    trail.effect.stop();
    fading.push(trail.effect);
    trails.delete(shot);
  }
  dropBurntOut(fading, gameLayer);
}

type Trail = { effect: PixiVfxEffectInstance; at: [number, number, number] };

/** Starts the trail of a flying spell that has one (none for an arrow, or before the effects are loaded). */
function startTrail(shot: (typeof flying)['entities'][number], gameLayer: Container): Trail | undefined {
  const look = shot.projectile.spell ? SPELL_VFX[shot.projectile.spell]?.flight : undefined;
  const definition = look ? vfxEffect(look) : undefined;
  if (!definition) return undefined;
  // Left at the origin, the effect is moved itself, so the sparks it has shed stay where they were.
  const trail: Trail = { effect: start(definition, gameLayer, 0, 0, 0), at: [0, 0, 0] };
  trails.set(shot, trail);
  return trail;
}

/** A trail starts behind each spell that has one; every trail is moved to where its projectile flies now. */
function followShots(gameLayer: Container): void {
  for (const shot of flying) {
    if (shot.removed) continue;
    const trail = trails.get(shot) ?? startTrail(shot, gameLayer);
    if (!trail) continue;
    const y = shot.position.y - (shot.yOffset ?? 0);
    trail.effect.setPosition(vfxPoint(shot.position.x, y, trail.at));
    trail.effect.root.zIndex = shot.position.y + IN_FRONT;
  }
}

/** Lets an effect that followed something stop and fade out. */
function letGo(effect: PixiVfxEffectInstance): void {
  effect.stop();
  fading.push(effect);
}

/** Effects following entities that are gone (or were left on another level) fade out. */
function dropGoneFollowers(gameLayer: Container): void {
  for (const [entity, mine] of following) {
    if (world.id(entity) !== undefined && !entity.removed) continue;
    for (const effect of mine.values()) letGo(effect);
    following.delete(entity);
  }
  for (const mine of following.values()) dropLeftBehind(mine, gameLayer);
}

/** Forgets an entity's followers left on another level's layer (they went with it). */
function dropLeftBehind(mine: Map<string, PixiVfxEffectInstance>, gameLayer: Container): void {
  for (const [key, effect] of mine) if (effect.root.parent !== gameLayer) mine.delete(key);
}

/** While `holds`, `look` follows `entity` with its root at (x, y), drawn by depth z; once it does not, it fades out. */
function follow(entity: Entity, key: string, look: VfxEffectId, holds: boolean, at: { x: number; y: number; z: number }, gameLayer: Container): void {
  const mine = following.get(entity) ?? following.set(entity, new Map()).get(entity);
  const effect = mine?.get(key);
  if (!mine || !holds) {
    if (effect) letGo(effect);
    mine?.delete(key);
    return;
  }
  const definition = effect ? undefined : vfxEffect(look);
  const shown = effect ?? (definition ? start(definition, gameLayer, at.x, at.y, at.z) : undefined);
  if (!shown) return;
  mine.set(key, shown);
  shown.root.position.set(at.x, at.y);
  shown.root.zIndex = at.z;
}

/** Where a follower goes this tick (reused: written, then read at once). */
const spot = { x: 0, y: 0, z: 0 };

/** Each hero's lasting buffs keep their auras round them; each zone its particles over it. */
function followLasting(gameLayer: Container): void {
  for (const hero of buffed) {
    spot.x = hero.position.x;
    spot.y = hero.position.y - BODY_MIDDLE;
    spot.z = hero.position.y + IN_FRONT;
    for (const buff of AURA_BUFFS) follow(hero, buff, BUFF_AURAS[buff], (hero.buffs[buff] ?? 0) > 0 && !hero.removed, spot, gameLayer);
  }
  for (const zone of zones) {
    const look = SPELL_VFX[zone.zone.spell]?.zone;
    if (!look) continue;
    spot.x = zone.position.x;
    spot.y = zone.position.y;
    spot.z = zone.position.y + IN_FRONT;
    follow(zone, 'zone', look, !zone.removed, spot, gameLayer);
  }
}

/** Once a tick: sparks for each new fire, trails behind flying spells, the one-shots asked for, and all of them moved on by a tick. */
export function updateVfx(gameLayer: Container): void {
  dropStale(gameLayer);
  lightFires(gameLayer);
  letTrailsFade(gameLayer);
  dropGoneFollowers(gameLayer);
  followShots(gameLayer);
  followLasting(gameLayer);
  playShots(gameLayer);
  if (loops.size || shots.length || trails.size || fading.length || following.size) vfxRenderer().update(TICK_SECONDS);
}
