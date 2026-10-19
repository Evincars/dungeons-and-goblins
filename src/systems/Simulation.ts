import type { Container } from 'pixi.js';
import type { Level } from '../level/Level';
import { updateInput } from './InputSystem';
import { updateTargeting } from './TargetSystem';
import { updateSpells } from './SpellSystem';
import { updateAI } from './AISystem';
import { updateMovement } from './MovementSystem';
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

export const SIMULATION: readonly System[] = [
  ({ level, dt }) => updateRespawns(level, dt),
  ({ dt }) => updateInput(dt),
  () => updateTargeting(),
  () => updateInventory(),
  ({ level, dt }) => updateAI(level, dt),
  ({ dt }) => updateSword(dt),
  ({ level }) => updateSpells(level),
  ({ level, dt }) => updateMovement(level, dt),
  () => updateDust(),
  () => updateFootsteps(),
  () => updateEphemerals(),
  ({ dt }) => updateCombatTimers(dt),
  ({ level, dt }) => updateContactDamage(level, dt),
  ({ dt }) => updateLoot(dt),
  ({ level, dt }) => updateSpawners(level, dt),
  ({ level, dt }) => updateDeath(level, dt),
  ({ level }) => updateHoles(level),
  ({ level }) => updateFalling(level),
  ({ level }) => updateChests(level),
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
  ({ dt }) => updateAnimation(dt),
  ({ level }) => updateRender(level),
  ({ gameLayer }) => updateBars(gameLayer),
];

export function runSystems(systems: readonly System[], ctx: FrameContext): void {
  for (const system of systems) system(ctx);
}
