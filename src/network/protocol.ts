import { isDepartChoice, isEquipSlot, isGearKind, isItemType, isPlayerSlot, isRestKind, isStatName, PLAYER_SLOTS, QUICK_SLOTS, STAT_NAMES } from '../world';
import type { BagSquare, DepartChoice, EquipSlot, InventoryItem, PlayerInput, PlayerSlot, RestKind, StatName } from '../world';
import { validImprovement, validScores } from '../rules/Build';
import type { Improvement } from '../rules/Build';
import { isFightingStyle } from '../rules/FightingStyles';
import { isArchetype } from '../rules/Archetypes';
import type { ArchetypeId } from '../rules/Archetypes';
import { isManeuver } from '../rules/Maneuvers';
import { LEVEL_CAP } from '../game/Progress';
import { isVfxEffectId } from '../render/Vfx';
import type { VfxShot } from '../render/VfxPlayer';
import type { FightingStyleId } from '../rules/FightingStyles';
import type { SfxName } from '../audio/SoundPlayer';
import { cleanName } from '../game/Settings';
import { ValidationError } from '../core/errors';
import { isHeroClassId } from '../rules/Classes';
import type { HeroClassId } from '../rules/Classes';
import { isFiniteNumber, isRecord } from '../core/guards';
import { isItemBase, isMagicBonus } from '../rules/Equipment';
import { isCatalogSpell, knightListed, MAX_SPELL_LEVEL, UNBOUND } from '../rules/Spellbook';
import type { QuickBinding } from '../rules/Spellbook';
import type { DamageType } from '../rules/DamageTypes';
import { validChoice } from '../rules/DamageChoice';
import { bindingFeatureId, isFeatureId } from '../rules/ClassFeatures';
import { bindingFeatId } from '../rules/Feats';

/**
 * What co-op peers say to each other, and the checks every incoming message passes before the game
 * believes it: the other browser is not trusted.
 */

/** Bumped whenever messages or the world they describe change, so mismatched browsers are told to reload. */
export const PROTOCOL_VERSION = 12;
/** The most guests a room takes: the host plus three others make four players. */
export const MAX_GUESTS = PLAYER_SLOTS.length - 1;

export type InputFrame = { input: PlayerInput; aim: { x: number; y: number }; sequence: number };
/**
 * Someone in the room: their seat, their name and the hero they picked (heroes may be picked twice); `saved`, when the host
 * takes up a saved game, the saved hero they will play (class and level, experience, weapon: game/SaveGame.ts heroLine).
 */
export type RosterEntry = { slot: PlayerSlot; name: string; heroClass: HeroClassId; saved?: string };
/** The longest line of a saved hero in the roster. */
const MAX_SAVED_LINE = 80;

/** A square of the inventory screen: one in the bag, or an equipment slot. */
export type ItemSquare = { bag: number } | { slot: EquipSlot };

/** Things a guest asks the host to do for its character, which the host checks and carries out. */
export type GuestCommand =
  | { kind: 'buy'; index: number }
  /** Sell the item on this square of the bag to the trader within reach. */
  | { kind: 'sell'; index: number }
  | { kind: 'loadout'; inventory: BagSquare[]; equipped: Partial<Record<EquipSlot, InventoryItem>> }
  /**
   * Ask the party for a rest (with, for a short one, how many hit dice the asker will spend in it), or answer what
   * someone else asked the party (a rest — agreeing to a short one says how many hit dice to spend — or opening the gate).
   */
  | { kind: 'rest'; rest: RestKind; dice?: number }
  | { kind: 'vote_answer'; agree: boolean; dice?: number }
  /** The guest opened (or closed) the pause menu: the game stops for everyone while anyone has it open. */
  | { kind: 'pause'; paused: boolean }
  /** Hand the item on a square of the inventory to another player. */
  | { kind: 'give'; from: ItemSquare; to: PlayerSlot }
  /** Drop the item on a square of the inventory at the hero's feet. */
  | { kind: 'drop'; from: ItemSquare }
  /** Need or Pass on a rare find the party is rolling for (by the id the host gave the roll). */
  | { kind: 'loot'; roll: number; need: boolean }
  /** The hero's bought ability scores, their fighting style, an Ability Score Improvement or a feat (rules/Build.ts). */
  | { kind: 'scores'; scores: Record<StatName, number> }
  | { kind: 'fighting_style'; style: FightingStyleId }
  /** A Champion's second fighting style (level 10), a Martial Archetype (level 3) and what an archetype's level teaches: maneuvers, or an Eldritch Knight's spells. */
  | { kind: 'extra_style'; style: FightingStyleId }
  | { kind: 'archetype'; archetype: ArchetypeId }
  | { kind: 'pick'; level: number; maneuvers?: string[]; spells?: string[] }
  | { kind: 'improve'; improvement: Improvement }
  /** Save the starting choices for good before leaving the first safe room. */
  | { kind: 'lock_build' }
  /** Put a spell, cast at a level, on a quick-bar square (the host checks the hero may). */
  | { kind: 'bind_spell'; slot: number; spell: string; level: number; damageType?: DamageType }
  /** Empty a quick-bar square (a right click on it). */
  | { kind: 'unbind_spell'; slot: number }
  /** Put a saved preset on the quick bar: what every square of both rows holds (null: the class's own); in a safe room only. */
  | { kind: 'load_bindings'; bound: (QuickBinding | null)[] }
  /** Switch a passive class feature off or on. */
  | { kind: 'toggle_feature'; feature: string }
  /** In the exit room, once its button is pressed: on to the next level, or end the run. */
  | { kind: 'depart'; choice: DepartChoice };

export type Message =
  /** `heroClass`: the class the guest picked (the host checks it). */
  | { type: 'hello'; version: number; name: string; heroClass?: unknown }
  | { type: 'welcome'; slot: PlayerSlot }
  | { type: 'refused'; reason: string }
  | { type: 'roster'; players: RosterEntry[] }
  | { type: 'name'; name: string }
  /** A guest picked another hero in the lobby (the host checks it). */
  | { type: 'hero'; heroClass: unknown }
  /** The host started a level; the dungeon itself follows in a `map` message (level/LevelMap.ts, gzipped). */
  | { type: 'start'; seed: number; depth: number }
  | { type: 'map'; seed: number; data: ArrayBuffer | Uint8Array }
  /** A guest has built the level it was sent and stands in the safe room. */
  | { type: 'loaded'; seed: number }
  | { type: 'state'; seq: number; compressed: ArrayBuffer | Uint8Array }
  | { type: 'input'; frame: InputFrame }
  | { type: 'command'; command: GuestCommand }
  | { type: 'sound'; name: SfxName; x?: number; y?: number }
  /** A one-shot particle effect the host played (render/VfxPlayer.ts): each guest renders it itself. */
  | { type: 'vfx'; shot: unknown }
  | { type: 'ping' };

const BUTTONS = ['up', 'down', 'left', 'right', 'attack', 'use', 'sprint', 'mouseAiming'] as const satisfies readonly (keyof PlayerInput)[];
const INTENTS = ['use', 'attack', 'cast', 'inventoryOpen', 'swap'] as const satisfies readonly (keyof PlayerInput['intents'])[];
/** Aim points farther than this from the origin are not a real cursor. */
const MAX_AIM = 100000;
/** More than any bag (MAX_INVENTORY, 120 squares) or shop holds, so honest messages always fit. */
const MAX_ITEMS = 128;
/** The longest name an item may have (every line written about an item has room for it). */
export const MAX_ITEM_NAME = 40;
const MAX_ITEM_STAT = 1000;
const MAX_ITEM_VALUE = 1e6;
export const MAX_SEED = 2 ** 32;
const MAX_DEPTH = 1000;

/** Just the envelope; the session checks each message type's own fields with the guards below. */
export function isMessage(value: unknown): value is Message {
  return isRecord(value) && typeof value.type === 'string';
}

function validPoint(p: unknown, limit: number): boolean {
  return isRecord(p) && isFiniteNumber(p.x) && isFiniteNumber(p.y) && Math.abs(p.x) <= limit && Math.abs(p.y) <= limit;
}

function validIntents(intents: unknown): boolean {
  return isRecord(intents) && INTENTS.every((k) => typeof intents[k] === 'boolean');
}

export function validInput(value: unknown): value is InputFrame {
  if (!isRecord(value) || !Number.isSafeInteger(value.sequence) || Number(value.sequence) < 0) return false;
  if (!validPoint(value.aim, MAX_AIM)) return false;
  const i = value.input;
  if (!isRecord(i) || !BUTTONS.every((k) => typeof i[k] === 'boolean') || !validIntents(i.intents)) return false;
  const slotOk = Number.isInteger(i.spellSlot) && Number(i.spellSlot) >= 0 && Number(i.spellSlot) < QUICK_SLOTS;
  return slotOk && isFiniteNumber(i.mouseX) && isFiniteNumber(i.mouseY) && (i.keyAim === null || validPoint(i.keyAim, 1));
}

/** A saved hero's line: none, or short text with no control characters. */
function validSavedLine(value: unknown): boolean {
  if (value === undefined) return true;
  return typeof value === 'string' && value.length <= MAX_SAVED_LINE && !/\p{Cc}/u.test(value);
}

export function validRoster(value: unknown): value is RosterEntry[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > PLAYER_SLOTS.length) return false;
  const entries = value.every((p) => isRecord(p) && isPlayerSlot(p.slot) && typeof p.name === 'string' && cleanName(p.name) === p.name
    && isHeroClassId(p.heroClass) && validSavedLine(p.saved));
  return entries && new Set(value.map((p) => (isRecord(p) ? p.slot : null))).size === value.length;
}

export function validStart(seed: unknown, depth: unknown): boolean {
  return Number.isInteger(seed) && Number(seed) >= 0 && Number(seed) < MAX_SEED
    && Number.isInteger(depth) && Number(depth) >= 1 && Number(depth) <= MAX_DEPTH;
}

/** Heaviest a single item may claim to be, in kilograms. */
const MAX_ITEM_WEIGHT = 500;
/** A bag square: an item, or empty. */
export function isBagSquare(value: unknown): boolean {
  return value === null || isInventoryItem(value);
}

const SHORT_KEY = /^[a-z0-9_]{1,40}$/;

/** A texture key or catalogue id: lower-case letters, digits and underscores. */
function isShortKey(value: unknown): boolean {
  return typeof value === 'string' && SHORT_KEY.test(value);
}

function validStats(stats: unknown): boolean {
  if (stats === undefined) return true;
  if (!isRecord(stats)) return false;
  return Object.keys(stats).every((k) => isStatName(k)) && STAT_NAMES.every((k) => stats[k] === undefined
    || (isFiniteNumber(stats[k]) && Math.abs(Number(stats[k])) <= MAX_ITEM_STAT));
}

export function isInventoryItem(value: unknown): value is InventoryItem {
  if (!isRecord(value) || !isItemType(value.type) || typeof value.name !== 'string' || value.name.length > MAX_ITEM_NAME) return false;
  if (!isFiniteNumber(value.value) || value.value < 0 || value.value > MAX_ITEM_VALUE) return false;
  const gearOk = value.gear === undefined || isGearKind(value.gear);
  const iconOk = value.icon === undefined || isShortKey(value.icon);
  const idOk = (value.id === undefined || isShortKey(value.id)) && (value.kind === undefined || isShortKey(value.kind));
  const weightOk = value.weight === undefined || (isFiniteNumber(value.weight) && Number(value.weight) >= 0 && Number(value.weight) <= MAX_ITEM_WEIGHT);
  const rulesOk = (value.base === undefined || isItemBase(value.base)) && (value.bonus === undefined || isMagicBonus(value.bonus));
  return gearOk && iconOk && idOk && weightOk && rulesOk && validStats(value.stats);
}

function validEquipped(value: unknown): value is Partial<Record<EquipSlot, InventoryItem>> {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([slot, item]) => isEquipSlot(slot) && isInventoryItem(item));
}

/** A hero has at most one hit die a level (20). */
const MAX_HIT_DICE = 20;
export const isDiceCount = (value: unknown): boolean => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= MAX_HIT_DICE;

function isItemSquare(value: unknown): value is ItemSquare {
  if (!isRecord(value)) return false;
  if ('bag' in value) return Number.isInteger(value.bag) && Number(value.bag) >= 0 && Number(value.bag) < MAX_ITEMS;
  return typeof value.slot === 'string' && isEquipSlot(value.slot);
}

/** A spell on the quick bar: one of the lists' spells, at a level from 0 to 9 (or a square the player emptied). */
export function validBinding(spell: unknown, level: unknown, damageType?: unknown): boolean {
  if (spell === UNBOUND) return level === 0 && damageType === undefined;
  if (typeof spell === 'string' && !validChoice(spell, damageType)) return false;
  const named = typeof spell === 'string' && (bindingFeatureId(spell) !== null ? isFeatureId(bindingFeatureId(spell)) : bindingFeatId(spell) !== null || isCatalogSpell(spell));
  return named && Number.isInteger(level) && Number(level) >= 0 && Number(level) <= MAX_SPELL_LEVEL;
}

/** A whole quick bar a guest sent: a square for each of both rows, each empty (null) or a binding there may be. */
function validBindings(bound: unknown): boolean {
  if (!Array.isArray(bound) || bound.length !== QUICK_SLOTS) return false;
  return bound.every((b) => b === null || (isRecord(b) && validBinding(b.spell, b.level, b.damageType)));
}

/** The most maneuvers or spells a hero picks at once. */
const MAX_PICK_BATCH = 8;

/** A pick of what a level teaches: a level a hero can reach (up to the cap), and only known maneuvers or spells, a handful at most. */
function validPick(value: Record<string, unknown>): boolean {
  const { level, maneuvers, spells } = value;
  const listOk = (list: unknown, valid: (id: unknown) => boolean): boolean => list === undefined || (Array.isArray(list) && list.length <= MAX_PICK_BATCH && list.every(valid));
  return Number.isInteger(level) && Number(level) >= 1 && Number(level) <= LEVEL_CAP && listOk(maneuvers, isManeuver) && listOk(spells, knightListed);
}

export function validCommand(value: unknown): value is GuestCommand {
  if (!isRecord(value)) return false;
  if (value.kind === 'buy' || value.kind === 'sell') return Number.isInteger(value.index) && Number(value.index) >= 0 && Number(value.index) < MAX_ITEMS;
  if (value.kind === 'rest') return isRestKind(value.rest) && (value.dice === undefined || isDiceCount(value.dice));
  if (value.kind === 'vote_answer') return typeof value.agree === 'boolean' && (value.dice === undefined || isDiceCount(value.dice));
  if (value.kind === 'pause') return typeof value.paused === 'boolean';
  if (value.kind === 'give') return isItemSquare(value.from) && isPlayerSlot(value.to);
  if (value.kind === 'drop') return isItemSquare(value.from);
  if (value.kind === 'loot') return Number.isSafeInteger(value.roll) && Number(value.roll) >= 0 && typeof value.need === 'boolean';
  if (value.kind === 'scores') return validScores(value.scores);
  if (value.kind === 'fighting_style' || value.kind === 'extra_style') return isFightingStyle(value.style);
  if (value.kind === 'archetype') return isArchetype(value.archetype);
  if (value.kind === 'pick') return validPick(value);
  if (value.kind === 'improve') return validImprovement(value.improvement);
  if (value.kind === 'lock_build') return true;
  if (value.kind === 'toggle_feature') return isFeatureId(value.feature);
  if (value.kind === 'depart') return isDepartChoice(value.choice);
  if (value.kind === 'unbind_spell') return Number.isInteger(value.slot) && Number(value.slot) >= 0 && Number(value.slot) < QUICK_SLOTS;
  if (value.kind === 'load_bindings') return validBindings(value.bound);
  if (value.kind === 'bind_spell') return validBinding(value.spell, value.level, value.damageType) && Number.isInteger(value.slot) && Number(value.slot) >= 0 && Number(value.slot) < QUICK_SLOTS;
  if (value.kind !== 'loadout' || !Array.isArray(value.inventory) || value.inventory.length > MAX_ITEMS) return false;
  return value.inventory.every(isBagSquare) && validEquipped(value.equipped);
}

export function validSound(name: unknown, x: unknown, y: unknown, isSfx: (v: unknown) => v is SfxName): boolean {
  return isSfx(name) && (x === undefined || isFiniteNumber(x)) && (y === undefined || isFiniteNumber(y));
}

/** How far a one-shot may go off above its feet, and how far from a unit vector its facing may stray (rounding). */
const MAX_VFX_LIFT = 256;
const UNIT_SLACK = 0.01;

/** A one-shot particle effect the host sent: a known effect, a place within the world, a lift and a unit facing. */
export function validVfxShot(value: unknown): value is VfxShot {
  if (!isRecord(value) || !isVfxEffectId(value.effect) || !validPoint(value, MAX_AIM)) return false;
  const { lift, dirX, dirY } = value;
  if (!isFiniteNumber(lift) || lift < 0 || lift > MAX_VFX_LIFT || !isFiniteNumber(dirX) || !isFiniteNumber(dirY)) return false;
  return Math.abs(Math.hypot(dirX, dirY) - 1) <= UNIT_SLACK;
}

/** The peer id in an invite link (…?join=<id>) or a bare peer id. */
export function invitePeer(text: string): string {
  const trimmed = text.trim();
  const id = trimmed.includes('://') ? new URL(trimmed).searchParams.get('join') : trimmed;
  if (!id || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new ValidationError('Invalid invite link or peer ID');
  return id;
}

/** The invite guests open to join: this page with the host's peer id. */
export function inviteLink(peerId: string, page: string): string {
  const url = new URL(page);
  url.search = '';
  url.hash = '';
  url.searchParams.set('join', peerId);
  return url.href;
}
