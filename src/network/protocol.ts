import { isEquipSlot, isGearKind, isItemType, isPlayerSlot, isRestKind, isStatName, PLAYER_SLOTS, QUICK_SLOTS, STAT_NAMES } from '../world';
import type { BagSquare, EquipSlot, InventoryItem, PlayerInput, PlayerSlot, RestKind, StatName } from '../world';
import { validImprovement, validScores } from '../rules/Build';
import type { Improvement } from '../rules/Build';
import { isFightingStyle } from '../rules/FightingStyles';
import type { FightingStyleId } from '../rules/FightingStyles';
import type { SfxName } from '../audio/SoundPlayer';
import { cleanName } from '../game/Settings';
import { ValidationError } from '../core/errors';
import { isHeroClassId } from '../rules/Classes';
import type { HeroClassId } from '../rules/Classes';
import { isFiniteNumber, isRecord } from '../core/guards';
import { isItemBase, isMagicBonus } from '../rules/Equipment';

/**
 * What co-op peers say to each other, and the checks every incoming message passes before the game
 * believes it: the other browser is not trusted.
 */

export const PROTOCOL_VERSION = 1;
/** The most guests a room takes: the host plus three others make four players. */
export const MAX_GUESTS = PLAYER_SLOTS.length - 1;

export type InputFrame = { input: PlayerInput; aim: { x: number; y: number }; sequence: number };
/** Someone in the room: their seat, their name and the hero they picked (heroes may be picked twice). */
export type RosterEntry = { slot: PlayerSlot; name: string; heroClass: HeroClassId };

/** A square of the inventory screen: one in the bag, or an equipment slot. */
export type ItemSquare = { bag: number } | { slot: EquipSlot };

/** Things a guest asks the host to do for its character, which the host checks and carries out. */
export type GuestCommand =
  | { kind: 'buy'; index: number }
  | { kind: 'loadout'; inventory: BagSquare[]; equipped: Partial<Record<EquipSlot, InventoryItem>> }
  /** During a short rest: spend this many hit dice on healing (0: none). */
  | { kind: 'rest_dice'; count: number }
  /**
   * Ask the party for a rest (with, for a short one, how many hit dice the asker will spend in it), or answer what
   * someone else asked the party (a rest, opening the gate).
   */
  | { kind: 'rest'; rest: RestKind; dice?: number }
  | { kind: 'vote_answer'; agree: boolean }
  /** Hand the item on a square of the inventory to another player. */
  | { kind: 'give'; from: ItemSquare; to: PlayerSlot }
  /** Drop the item on a square of the inventory at the hero's feet. */
  | { kind: 'drop'; from: ItemSquare }
  /** Need or Pass on a rare find the party is rolling for (by the id the host gave the roll). */
  | { kind: 'loot'; roll: number; need: boolean }
  /** The hero's bought ability scores, their fighting style, an Ability Score Improvement or a feat (rules/Build.ts). */
  | { kind: 'scores'; scores: Record<StatName, number> }
  | { kind: 'fighting_style'; style: FightingStyleId }
  | { kind: 'improve'; improvement: Improvement }
  /** Save the starting choices for good before leaving the first safe room. */
  | { kind: 'lock_build' };

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
  /** The exit was pulled: the level is over, the host picks when the next one starts. */
  | { type: 'complete' }
  | { type: 'ping' };

const BUTTONS = ['up', 'down', 'left', 'right', 'attack', 'use', 'sprint', 'mouseAiming'] as const satisfies readonly (keyof PlayerInput)[];
const INTENTS = ['use', 'attack', 'cast', 'inventoryOpen', 'swap'] as const satisfies readonly (keyof PlayerInput['intents'])[];
/** Aim points farther than this from the origin are not a real cursor. */
const MAX_AIM = 100000;
/** More than any bag (MAX_INVENTORY) or shop holds, so honest messages always fit. */
const MAX_ITEMS = 64;
const MAX_ITEM_NAME = 40;
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

export function validRoster(value: unknown): value is RosterEntry[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > PLAYER_SLOTS.length) return false;
  const entries = value.every((p) => isRecord(p) && isPlayerSlot(p.slot) && typeof p.name === 'string' && cleanName(p.name) === p.name
    && isHeroClassId(p.heroClass));
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
const isDiceCount = (value: unknown) => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= MAX_HIT_DICE;

function isItemSquare(value: unknown): value is ItemSquare {
  if (!isRecord(value)) return false;
  if ('bag' in value) return Number.isInteger(value.bag) && Number(value.bag) >= 0 && Number(value.bag) < MAX_ITEMS;
  return typeof value.slot === 'string' && isEquipSlot(value.slot);
}

export function validCommand(value: unknown): value is GuestCommand {
  if (!isRecord(value)) return false;
  if (value.kind === 'buy') return Number.isInteger(value.index) && Number(value.index) >= 0 && Number(value.index) < MAX_ITEMS;
  if (value.kind === 'rest_dice') return isDiceCount(value.count);
  if (value.kind === 'rest') return isRestKind(value.rest) && (value.dice === undefined || isDiceCount(value.dice));
  if (value.kind === 'vote_answer') return typeof value.agree === 'boolean';
  if (value.kind === 'give') return isItemSquare(value.from) && isPlayerSlot(value.to);
  if (value.kind === 'drop') return isItemSquare(value.from);
  if (value.kind === 'loot') return Number.isSafeInteger(value.roll) && Number(value.roll) >= 0 && typeof value.need === 'boolean';
  if (value.kind === 'scores') return validScores(value.scores);
  if (value.kind === 'fighting_style') return isFightingStyle(value.style);
  if (value.kind === 'improve') return validImprovement(value.improvement);
  if (value.kind === 'lock_build') return true;
  if (value.kind !== 'loadout' || !Array.isArray(value.inventory) || value.inventory.length > MAX_ITEMS) return false;
  return value.inventory.every(isBagSquare) && validEquipped(value.equipped);
}

export function validSound(name: unknown, x: unknown, y: unknown, isSfx: (v: unknown) => v is SfxName): boolean {
  return isSfx(name) && (x === undefined || isFiniteNumber(x)) && (y === undefined || isFiniteNumber(y));
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
