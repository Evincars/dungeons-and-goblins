import { isEquipSlot, isGearKind, isItemType, isPlayerSlot, isStatName, PLAYER_SLOTS, STAT_NAMES } from '../world';
import type { BagSquare, EquipSlot, InventoryItem, PlayerInput, PlayerSlot } from '../world';
import type { SfxName } from '../audio/SoundPlayer';
import { cleanName } from '../game/Settings';
import { ValidationError } from '../core/errors';
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
export type RosterEntry = { slot: PlayerSlot; name: string };

/** Things a guest asks the host to do for its character, which the host checks and carries out. */
export type GuestCommand =
  | { kind: 'buy'; index: number }
  | { kind: 'loadout'; inventory: BagSquare[]; equipped: Partial<Record<EquipSlot, InventoryItem>> };

export type Message =
  | { type: 'hello'; version: number; name: string }
  | { type: 'welcome'; slot: PlayerSlot }
  | { type: 'refused'; reason: string }
  | { type: 'roster'; players: RosterEntry[] }
  | { type: 'name'; name: string }
  /** The host started a level: every guest builds the same dungeon from this seed. */
  | { type: 'start'; seed: number; depth: number }
  | { type: 'state'; seq: number; compressed: ArrayBuffer | Uint8Array }
  | { type: 'input'; frame: InputFrame }
  | { type: 'command'; command: GuestCommand }
  | { type: 'sound'; name: SfxName; x?: number; y?: number }
  /** The exit was pulled: the level is over, the host picks when the next one starts. */
  | { type: 'complete' }
  | { type: 'ping' };

const BUTTONS = ['up', 'down', 'left', 'right', 'attack', 'use', 'sprint', 'mouseAiming'] as const satisfies readonly (keyof PlayerInput)[];
const INTENTS = ['use', 'attack', 'cast', 'inventoryOpen'] as const satisfies readonly (keyof PlayerInput['intents'])[];
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
  return isFiniteNumber(i.mouseX) && isFiniteNumber(i.mouseY) && (i.keyAim === null || validPoint(i.keyAim, 1));
}

export function validRoster(value: unknown): value is RosterEntry[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > PLAYER_SLOTS.length) return false;
  const entries = value.every((p) => isRecord(p) && isPlayerSlot(p.slot) && typeof p.name === 'string' && cleanName(p.name) === p.name);
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

export function validCommand(value: unknown): value is GuestCommand {
  if (!isRecord(value)) return false;
  if (value.kind === 'buy') return Number.isInteger(value.index) && Number(value.index) >= 0 && Number(value.index) < MAX_ITEMS;
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
