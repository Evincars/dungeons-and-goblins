import { world, isActivePlayer, isPlayer } from '../world';
import type { Player } from '../world';
import type { SpellDef } from '../rules/Spells';
import { playVfx } from '../render/VfxPlayer';
import { aimedWithin, concentrate, endConcentration } from './LastingSpells';

/**
 * Fog Cloud: a sphere of thick fog where the caster aims, for the spell's duration, held by concentration. Whoever is in it is
 * heavily obscured (ai/perception/obscured.ts): attacks into it, out of it and within it are at disadvantage, and enemies
 * cannot see a hero in it or behind it. Its fog (systems/CloudSystem.ts: rolling banks, thick at the rim and thin in the middle,
 * so the fight inside shows; wisps of it drifting, systems/VfxSystem.ts) is scattered by a gust of wind. Darkness is the same
 * cloud of magical darkness (`dark`): black, and no light shines in it (scenes/InGameScene.ts leaves out the lights inside).
 */

const clouds = world.with('fogCloud', 'position');
type Cloud = (typeof clouds)['entities'][number];

/** Casts Fog Cloud where aimed, within the spell's reach. */
export function castFogCloud(caster: Player, def: SpellDef, targetX: number, targetY: number): void {
  const at = aimedWithin(caster, targetX, targetY, def.range);
  const cloud = world.add({ position: at, fogCloud: { owner: world.id(caster) ?? -1, radius: def.radius, ticks: def.durationTicks, ...(def.dark ? { dark: true } : {}) } });
  playVfx(def.dark ? 'darkness-burst' : 'fog-cloud-burst', at.x, at.y);
  if (def.concentration) concentrate(caster, def.id, world.id(cloud) ?? -1, def.durationTicks);
}

/** A cloud a tick on: it lifts when its time is up or its caster no longer holds it (fallen, or holding another spell). */
function updateCloud(cloud: Cloud): void {
  const caster = world.entity(cloud.fogCloud.owner);
  const id = world.id(cloud);
  const held = isPlayer(caster) && isActivePlayer(caster) && caster.concentration?.zone === id;
  if (held && --cloud.fogCloud.ticks > 0) return;
  world.addComponent(cloud, 'removed', true);
  if (isPlayer(caster) && caster.concentration?.zone === id) endConcentration(caster);
}

/** The fog clouds' tick. */
export function updateFogClouds(): void {
  for (const cloud of clouds) if (!cloud.removed) updateCloud(cloud);
}
