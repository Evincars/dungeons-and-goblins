import type { Entity } from '../world';
import { StateError } from '../core/errors';
import { sheetCols } from '../render/Sheets';
import { SpriteSheet } from '../assets/SpriteSheet';
import type { CharacterDef, CharacterState, ClipDef } from './CharacterDef';
import { FIGHTER } from './Fighter';
import { ORC } from './Orc';
import { GOBLIN_GRUNT, GOBLIN_ROGUE, GOBLIN_WARRIOR } from './Goblins';
import { EVIL_WIZARD, FIRE_WIZARD, GHOST_WIZARD, LIGHT_WIZARD, WANDERER_WIZARD } from './Wizards';
import { HERO_KNIGHT, HOODED_KNIGHT } from './Knights';

const REGISTRY = new Map<string, CharacterDef>([
  FIGHTER, ORC, GOBLIN_GRUNT, GOBLIN_ROGUE, GOBLIN_WARRIOR,
  WANDERER_WIZARD, LIGHT_WIZARD, FIRE_WIZARD, EVIL_WIZARD, GHOST_WIZARD, HERO_KNIGHT, HOODED_KNIGHT,
].map((def) => [def.id, def]));

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
  return allCharacters().flatMap((def) => Object.entries(def.clips).map(([clip, c]) =>
    new SpriteSheet(clipSheetKey(def, clip), c.src, {
      grid: { frameWidth: c.frameWidth ?? def.frameWidth, frameHeight: c.frameHeight ?? def.frameHeight, trim: def.trim },
      keyColor: def.keyColor,
    })));
}

/** Where across its frame a character's sprite is anchored: at the middle of its body (or of the frame). */
export function anchorX(def: CharacterDef): number {
  const width = def.trim?.w ?? def.frameWidth;
  return ((def.bodyX ?? (def.trim?.x ?? 0) + width / 2) - (def.trim?.x ?? 0)) / width;
}

/**
 * The sprite anchor for a clip with its own body or feet position (a wider or taller strip), so the body
 * stays where the character's other clips put it; other clips use the character's anchor.
 */
export function clipAnchorX(def: CharacterDef, clip: ClipDef): number {
  if (clip.bodyX === undefined) return anchorX(def);
  return clip.bodyX / (clip.frameWidth ?? def.frameWidth);
}

export function clipAnchorY(def: CharacterDef, clip: ClipDef): number {
  if (clip.feetY === undefined) return 0.5;
  const height = def.trim?.h ?? def.frameHeight;
  return (clip.feetY - def.feetY + height / 2) / (clip.frameHeight ?? def.frameHeight);
}

/** Whether a character looking the given way is drawn mirrored. */
export function drawnMirrored(def: CharacterDef, flipX: boolean): boolean {
  if (def.facingRows) return false;
  return def.facesLeft ? !flipX : flipX;
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

/** Ticks into a state's clip at which its strike lands, from the clip's own definition (0 without an impact frame). */
export function clipImpactTicks(characterId: string, state: CharacterState): number {
  const found = stateClip(characterDef(characterId), state);
  return found?.clip.impactFrame ? found.clip.impactFrame * found.clip.frameTime : 0;
}

/** How far above the ground position a sprite's centre sits so its feet land on the position. */
export function groundOffset(def: CharacterDef, scale = def.scale): number {
  const centerY = (def.trim?.y ?? 0) + (def.trim?.h ?? def.frameHeight) / 2;
  return Math.round((def.feetY - centerY) * scale);
}

/** How far above the ground position the top of the head is drawn. */
export function headAboveFeet(def: CharacterDef, scale = def.scale): number {
  return Math.round((def.feetY - def.headY) * scale);
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
