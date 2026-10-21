import type { Entity } from '../world';
import { StateError } from '../core/errors';
import { sheetCols } from '../render/Sheets';
import { SpriteSheet } from '../assets/SpriteSheet';
import type { CharacterDef, CharacterState, ClipDef } from './CharacterDef';
import { FIGHTER } from './Fighter';
import { ORC } from './Orc';
import { GOBLIN_GRUNT, GOBLIN_ROGUE, GOBLIN_WARRIOR } from './Goblins';

const REGISTRY = new Map<string, CharacterDef>(
  [FIGHTER, ORC, GOBLIN_GRUNT, GOBLIN_ROGUE, GOBLIN_WARRIOR].map((def) => [def.id, def]),
);

export function characterDef(id: string): CharacterDef {
  const def = REGISTRY.get(id);
  if (!def) throw new StateError(`Unknown character "${id}"`, { id });
  return def;
}

/** Whether a character id (e.g. from a network message) names a registered character. */
export function hasCharacter(id: unknown): id is string {
  return typeof id === 'string' && REGISTRY.has(id);
}

export function allCharacters(): CharacterDef[] {
  return [...REGISTRY.values()];
}

/** Texture/sheet key a clip is loaded under. */
export function clipSheetKey(def: CharacterDef, clip: string): string {
  return `${def.id}_${clip}`;
}

/** One sheet per clip of every registered character, sliced into the character's frames. */
export function characterSheets(): SpriteSheet[] {
  return allCharacters().flatMap((def) => Object.entries(def.clips).map(([clip, { src }]) =>
    new SpriteSheet(clipSheetKey(def, clip), src, {
      grid: { frameWidth: def.frameWidth, frameHeight: def.frameHeight, trim: def.trim },
    })));
}

/** The sheet row a character is drawn from: its own side row, or the single row (mirrored for the left). */
export function facingRow(def: CharacterDef, flipX: boolean): number {
  if (!def.facingRows) return 0;
  return flipX ? def.facingRows.left : def.facingRows.right;
}

export type CharacterComponent = NonNullable<Entity['character']>;

export type StateClip = { readonly clip: ClipDef; readonly sheet: string };

/** Resolved state clips per character, so the per-frame character systems look them up without allocating. */
const clipCache = new Map<CharacterDef, Map<CharacterState, StateClip | null>>();

function resolveClip(def: CharacterDef, state: CharacterState): StateClip | null {
  const name = def.states[state];
  return name ? { clip: def.clips[name], sheet: clipSheetKey(def, name) } : null;
}

/** The clip a character state plays, with the sheet key it is loaded under. */
export function stateClip(def: CharacterDef, state: CharacterState): StateClip | undefined {
  let byState = clipCache.get(def);
  if (!byState) {
    byState = new Map();
    clipCache.set(def, byState);
  }
  let found = byState.get(state);
  if (found === undefined) {
    found = resolveClip(def, state);
    byState.set(state, found);
  }
  return found ?? undefined;
}

/** Ticks a state's clip takes to play once through (0 if the character has no clip for it). */
export function stateDuration(characterId: string, state: CharacterState): number {
  const def = characterDef(characterId);
  const found = stateClip(def, state);
  return found ? sheetCols(found.sheet) * found.clip.frameTime : 0;
}

/** Ticks into a state's clip at which its strike lands (0 if the clip has no impact frame). */
export function stateImpact(characterId: string, state: CharacterState): number {
  const found = stateClip(characterDef(characterId), state);
  if (!found?.clip.impactFrame) return 0;
  return Math.min(found.clip.impactFrame, sheetCols(found.sheet) - 1) * found.clip.frameTime;
}

/** How far above the ground position a sprite's centre sits so its feet land on the position. */
export function groundOffset(def: CharacterDef, scale = def.scale): number {
  const centerY = (def.trim?.y ?? 0) + (def.trim?.h ?? def.frameHeight) / 2;
  return Math.round((def.feetY - centerY) * scale);
}

/** How far above the sprite's centre the top of the head is drawn. */
export function headAboveCenter(def: CharacterDef, scale = def.scale): number {
  const centerY = (def.trim?.y ?? 0) + (def.trim?.h ?? def.frameHeight) / 2;
  return Math.round((centerY - def.headY) * scale);
}

/** Components that turn an entity into a character; spread them into `world.add`. */
export function characterComponents(id: string, scale?: number): Pick<Entity, 'character' | 'visual' | 'yOffset'> {
  const def = characterDef(id);
  return {
    character: { def: id, state: 'idle', frame: 0, timer: 0, finished: false, flipX: false },
    visual: { sheet: clipSheetKey(def, def.states.idle), scale: scale ?? def.scale },
    yOffset: groundOffset(def, scale),
  };
}
