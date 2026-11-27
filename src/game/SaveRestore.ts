import { world } from '../world';
import type { Entity, Player, PlayerSlot } from '../world';
import type { Level } from '../level/Level';
import { createTrail } from '../ai/perception/trail';
import { casterOf } from '../entities/MobFactory';
import type { EntityState } from '../network/WorldSync';
import { playerInSlot } from './PlayerActions';
import type { SaveFile } from './SaveGame';

/**
 * A saved game taken up again: the level's live entities made anew from the save (the level itself is built from its
 * map first, its decor laid as for any level), every reference from one entity to another (who is targeted, whose spell
 * zone, whose undead…) pointed at the new entities, the host's own bookkeeping the save leaves out given back (a hero's
 * trail for the enemies to follow, an enemy spellcaster's spells), and the fog as far as it had been lifted. Each saved
 * hero goes to the seat that takes them up now (game/SaveGame.ts seatsFor); a hero nobody takes up stays out.
 */

/** Saved entity id → the entity made from it. */
type Made = Map<number, Entity>;

/** The world's id of the entity made from a saved id (undefined when it was not made). */
function idIn(made: Made, saved: number | undefined): number | undefined {
  const entity = saved === undefined ? undefined : made.get(saved);
  return entity ? world.id(entity) : undefined;
}

/** For ids that must be a number: an owner no longer there is nobody (-1). */
const ownerIn = (made: Made, saved: number): number => idIn(made, saved) ?? -1;

/** Sets or clears an optional id component through the world, so the queries over it stay right. */
function setId(entity: Entity, key: 'spawnedBy' | 'lured' | 'entranced', id: number | undefined): void {
  if (id === undefined) world.removeComponent(entity, key);
  else entity[key] = id;
}

/** Points every entity id inside an entity's components at the entity made from it. */
function remapIds(entity: Entity, made: Made): void {
  if (entity.spawnedBy !== undefined) setId(entity, 'spawnedBy', idIn(made, entity.spawnedBy));
  if (entity.lured !== undefined) setId(entity, 'lured', idIn(made, entity.lured));
  if (entity.entranced !== undefined) setId(entity, 'entranced', idIn(made, entity.entranced));
  if (entity.ai) {
    entity.ai.targetId = idIn(made, entity.ai.targetId);
    entity.ai.allyId = idIn(made, entity.ai.allyId);
  }
  if (entity.status) entity.status.by = ownerIn(made, entity.status.by);
  if (entity.projectile?.owner !== undefined) entity.projectile.owner = idIn(made, entity.projectile.owner);
  if (entity.fx?.follow !== undefined) entity.fx.follow = idIn(made, entity.fx.follow);
  remapOwners(entity, made);
}

/** The spells and summons that belong to someone. */
function remapOwners(entity: Entity, made: Made): void {
  if (entity.sculpt) entity.sculpt.owner = ownerIn(made, entity.sculpt.owner);
  if (entity.decoy) entity.decoy.owner = ownerIn(made, entity.decoy.owner);
  if (entity.zone) entity.zone.owner = ownerIn(made, entity.zone.owner);
  if (entity.surface) entity.surface.owner = ownerIn(made, entity.surface.owner);
  if (entity.summon) entity.summon.owner = ownerIn(made, entity.summon.owner);
  if (entity.burning) entity.burning.by = ownerIn(made, entity.burning.by);
  if (entity.thrown) entity.thrown.owner = ownerIn(made, entity.thrown.owner);
  if (entity.dancingLights) entity.dancingLights.owner = ownerIn(made, entity.dancingLights.owner);
  if (entity.wisp) entity.wisp.of = ownerIn(made, entity.wisp.of);
  if (entity.fogCloud) entity.fogCloud.owner = ownerIn(made, entity.fogCloud.owner);
  // What a spell held by concentration made or holds (a zone, the lights, a fog, the hero it wards).
  if (entity.concentration && entity.concentration.zone >= 0) entity.concentration.zone = ownerIn(made, entity.concentration.zone);
}

/** What the host keeps for itself and the save leaves out, made again. */
function giveHostBookkeeping(entity: Entity): void {
  if (entity.playerSlot && !entity.trail) world.addComponent(entity, 'trail', createTrail());
  if (!entity.mobType || entity.mobCaster) return;
  const { mobCaster } = casterOf(entity.mobType);
  if (mobCaster) world.addComponent(entity, 'mobCaster', mobCaster);
}

/** A saved entity's data, ready to add: a hero moved to the seat taking them up, or null when nobody does. */
function seated(data: EntityState, seats: ReadonlyMap<PlayerSlot, PlayerSlot>): EntityState | null {
  const copy = structuredClone(data);
  if (!copy.playerSlot) return copy;
  const seat = seats.get(copy.playerSlot);
  if (!seat) return null;
  copy.playerSlot = seat;
  return copy;
}

/**
 * Makes the save's entities in the (cleared) world for a level built from the save's map, and brings back its fog.
 * `seats`: saved seat → seat now. Returns the host's hero, if the save gave one.
 */
export function restoreSavedWorld(save: SaveFile, level: Level, seats: ReadonlyMap<PlayerSlot, PlayerSlot>): Player | undefined {
  const made: Made = new Map();
  for (const { id, data } of save.world.entities) {
    const entity = seated(data, seats);
    if (entity) made.set(id, world.add(entity));
  }
  for (const entity of made.values()) {
    remapIds(entity, made);
    giveHostBookkeeping(entity);
  }
  level.restoreSeen(save.seen);
  return playerInSlot('host');
}
