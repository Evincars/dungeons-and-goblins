import type { Container } from 'pixi.js';
import type { Level } from '../level/Level';
import { beginPerception } from '../ai/perception/spatial';
import { updateInput } from './InputSystem';
import { updateTargeting } from './TargetSystem';
import { updateSpells } from './SpellSystem';
import { updateAI } from './AISystem';
import { updateMovement } from './MovementSystem';
import { updateTrails } from './TrailSystem';
import { updateCombatTimers, updateContactDamage } from './CombatSystem';
import { updateSword } from './SwordSystem';
import { updateLoot } from './LootSystem';
import { updateSpawners } from './SpawnerSystem';
import { updateDeath } from './DeathSystem';
import { updateHoles, updateFalling } from './HoleSystem';
import { updateDoors } from './DoorSystem';
import { updateExit } from './ExitSystem';
import { updateShop } from './ShopSystem';
import { updateRespawns } from './RespawnSystem';
import { updateSprites } from './SpriteSystem';
import { updateFx } from './FxSystem';
import { updateCharacterFacing } from './CharacterFacingSystem';
import { updateCharacterState } from './CharacterStateSystem';
import { updateCharacterAnimation } from './CharacterAnimationSystem';
import { updateAnimation } from './AnimationSystem';
import { updateRender } from './RenderSystem';
import { updateBars } from './BarSystem';
import { updateFootsteps } from './FootstepSystem';
import { updateDust } from './DustSystem';
import { updateEphemerals } from './EphemeralSystem';
import { updateInventory } from './InventorySystem';
import { updateChests } from './ChestSystem';

export type FrameContext = {
  level: Level;
  dt: number;
  tick: number;
  gameLayer: Container;
  rebuildTerrain: () => void;
};

export type System = (ctx: FrameContext) => void;

/**
 * Gameplay, one fixed tick at a time, in this order. The spatial index is marked stale at the start
 * of the tick and again once everything has moved, so each phase's proximity checks read one snapshot.
 */
export const SIMULATION: readonly System[] = [
  () => beginPerception(),
  ({ level, dt }) => updateRespawns(level, dt),
  () => updateInput(),
  () => updateTargeting(),
  () => updateInventory(),
  ({ level, tick }) => updateAI(level, tick),
  () => updateSword(),
  ({ level }) => updateSpells(level),
  ({ level }) => updateMovement(level),
  () => beginPerception(),
  ({ level, tick }) => updateTrails(level, tick),
  () => updateDust(),
  () => updateFootsteps(),
  () => updateEphemerals(),
  () => updateCombatTimers(),
  ({ level }) => updateContactDamage(level),
  () => updateLoot(),
  ({ level }) => updateSpawners(level),
  ({ level }) => updateDeath(level),
  ({ level }) => updateHoles(level),
  ({ level }) => updateFalling(level),
  () => updateChests(),
  ({ level }) => updateDoors(level),
  () => updateExit(),
  () => updateShop(),
  (ctx) => { if (ctx.level.tilesDirty) ctx.rebuildTerrain(); },
];

export const PRESENTATION: readonly System[] = [
  ({ gameLayer }) => updateSprites(gameLayer),
  () => updateFx(),
  () => updateCharacterFacing(),
  () => updateCharacterState(),
  () => updateCharacterAnimation(),
  () => updateAnimation(),
  ({ level }) => updateRender(level),
  ({ gameLayer }) => updateBars(gameLayer),
];

export function runSystems(systems: readonly System[], ctx: FrameContext): void {
  for (const system of systems) system(ctx);
}
