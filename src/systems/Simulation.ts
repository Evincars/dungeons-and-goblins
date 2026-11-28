import type { Container } from 'pixi.js';
import type { Level } from '../level/Level';
import { beginPerception } from '../ai/perception/spatial';
import { updateInput } from './InputSystem';
import { updateTargeting, resolveUses } from './TargetSystem';
import { updateSpells } from './SpellSystem';
import { updateAI } from './AISystem';
import { updateEnemyRanged } from './EnemyRangedSystem';
import { updateMovement } from './MovementSystem';
import { updateTrails } from './TrailSystem';
import { updateCombatTimers, updateContactDamage } from './CombatSystem';
import { updateSword } from './SwordSystem';
import { updateArrows } from './ArrowSystem';
import { updateLoot } from './LootSystem';
import { updateSpawners } from './SpawnerSystem';
import { updateDeath } from './DeathSystem';
import { updateHoles, updateFalling } from './HoleSystem';
import { updateDoors } from './DoorSystem';
import { updateExit } from './ExitSystem';
import { updateTraps } from './TrapSystem';
import { updateMist } from './MistSystem';
import { updateVfx } from './VfxSystem';
import { updateAimGuide } from './AimGuideSystem';
import { updateThrowAim } from './ThrowAimSystem';
import { updateShop } from './ShopSystem';
import { animateTraders } from './TraderSystem';
import { updateRespawns } from './RespawnSystem';
import { updateSprites } from './SpriteSystem';
import { updateCorpses } from './CorpseSystem';
import { updateFx } from './FxSystem';
import { animateDummies, updateDummies } from './DummySystem';
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
import { updateDecoys } from './DecoySystem';
import { updateWeaponSwap } from './WeaponSwapSystem';
import { updateLevers } from './LeverSystem';
import { updateRollLogs } from './RollLogSystem';
import { updateRollTexts } from './RollTextSystem';
import { updateInitiative } from './InitiativeSystem';
import { updateRest } from '../game/Rest';
import { updateParty } from '../game/Party';
import { updateLootRolls } from '../game/LootRoll';
import { updateStashes } from './StashSystem';
import { updateMarker } from './MarkerSystem';
import { updateConditionRings } from './ConditionRingSystem';
import { updateBuildLock } from '../game/Customize';
import { updateSafeRooms } from './SafeRoomSystem';
import { updateProtection } from './ProtectionSystem';
import { updateManeuvers } from './ManeuverSystem';
import { updateWeaponActions } from './WeaponActions';
import { updateWeaponMarks } from './WeaponMarks';
import { hitMob } from './Hits';
import { updateFeatureTimers, updateSurvivor } from './FeatureSystem';
import { updateSchools } from './SchoolSystem';
import { updateLastingSpells } from './LastingSpells';
import { updateSurfaces } from './Surfaces';
import { updateDancingLights } from './DancingLights';
import { updateFogClouds } from './FogCloud';
import { updateSpellHolds } from './SpellHolds';
import { updateInvisibility } from './Invisibility';
import { updateGusts } from './GustOfWind';
import { updateAfflictions } from './Afflictions';
import { updateImages } from './ImageSystem';
import { updateWeaponSigns } from './WeaponSignSystem';
import { updateClouds } from './CloudSystem';
import { updateThrows } from './ThrowSystem';
import { updateSummons } from './SummonSystem';
import { updateMusic } from './MusicSystem';
import { updateAmbience } from './AmbienceSystem';

export type FrameContext = {
  level: Level;
  dt: number;
  tick: number;
  gameLayer: Container;
  /** The world again, laid over its light and fog (moved and zoomed with the game layer): guides drawn unshaded. */
  overLayer: Container;
  rebuildTerrain: () => void;
};

export type System = (ctx: FrameContext) => void;

/**
 * Gameplay, one fixed tick at a time, in this order. The spatial index is marked stale at the start
 * of the tick and again once everything has moved, so each phase's proximity checks read one snapshot.
 */
export const SIMULATION: readonly System[] = [
  () => beginPerception(),
  ({ dt }) => updateRespawns(dt),
  () => updateInput(),
  () => updateThrowAim(),
  () => updateTargeting(),
  () => resolveUses(),
  ({ level }) => updateInventory(level),
  () => updateWeaponSwap(),
  ({ level, tick }) => updateAI(level, tick),
  ({ level }) => updateEnemyRanged(level),
  ({ level }) => updateSummons(level),
  () => updateDecoys(),
  ({ level, tick }) => updateThrows(level, tick),
  () => updateInitiative(),
  () => updateArrows(),
  () => updateSword(),
  ({ level }) => updateSpells(level),
  () => updateDummies(),
  ({ level }) => updateMovement(level),
  () => beginPerception(),
  ({ level, tick }) => updateTrails(level, tick),
  () => updateDust(),
  () => updateFootsteps(),
  () => updateEphemerals(),
  () => updateCombatTimers(),
  () => updateRollLogs(),
  ({ level }) => updateContactDamage(level),
  ({ level }) => updateLoot(level),
  ({ level }) => updateSpawners(level),
  ({ level }) => updateDeath(level),
  ({ level }) => updateHoles(level),
  ({ level }) => updateFalling(level),
  () => updateTraps(),
  () => updateChests(),
  () => updateStashes(),
  () => updateLootRolls(),
  // The party's answers first: the lever and rests act on a vote everyone agreed to this tick.
  () => updateParty(),
  ({ level }) => updateLevers(level),
  ({ level }) => updateDoors(level),
  () => updateExit(),
  () => updateShop(),
  ({ level }) => updateRest(level),
  ({ level }) => updateBuildLock(level),
  ({ level }) => updateSafeRooms(level),
  () => updateProtection(),
  () => updateManeuvers(),
  () => updateWeaponActions(),
  // Bleeding foes bleed: its slashing damage, credited to whoever opened the wound.
  () => updateWeaponMarks((foe, by, damage) => hitMob(foe, by, damage, true, 'slashing')),
  () => updateSurvivor(),
  () => updateFeatureTimers(),
  () => updateSchools(),
  ({ level }) => updateLastingSpells(level),
  () => updateSpellHolds(),
  ({ level }) => updateInvisibility(level),
  () => updateGusts(),
  () => updateAfflictions(),
  () => updateSurfaces(),
  ({ tick }) => updateDancingLights(tick),
  () => updateFogClouds(),
  (ctx) => { if (ctx.level.tilesDirty) ctx.rebuildTerrain(); },
];

export const PRESENTATION: readonly System[] = [
  ({ gameLayer }) => updateSprites(gameLayer),
  ({ gameLayer }) => updateCorpses(gameLayer),
  () => updateFx(),
  () => animateDummies(),
  () => animateTraders(),
  () => updateCharacterFacing(),
  () => updateCharacterState(),
  () => updateCharacterAnimation(),
  () => updateAnimation(),
  ({ level }) => updateRender(level),
  () => updateImages(),
  ({ gameLayer }) => updateWeaponSigns(gameLayer),
  ({ gameLayer }) => updateClouds(gameLayer),
  ({ gameLayer }) => updateBars(gameLayer),
  ({ gameLayer }) => updateRollTexts(gameLayer),
  ({ gameLayer }) => updateConditionRings(gameLayer),
  ({ gameLayer }) => updateMarker(gameLayer),
  ({ overLayer, level }) => updateAimGuide(overLayer, level),
  ({ gameLayer, tick }) => updateMist(gameLayer, tick),
  ({ gameLayer }) => updateVfx(gameLayer),
  () => updateMusic(),
  ({ level }) => updateAmbience(level),
];

export function runSystems(systems: readonly System[], ctx: FrameContext): void {
  for (const system of systems) system(ctx);
}
