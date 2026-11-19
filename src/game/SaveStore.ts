import { attempt, attemptAsync, err, ok, StateError } from '../core/errors';
import type { Result } from '../core/errors';
import { isFiniteNumber, isRecord } from '../core/guards';
import { createLog } from '../core/log';
import { base64ToBytes, bytesToBase64, gunzipJson, gzipText } from '../core/compression';
import { isLevelTheme } from '../level/Theme';
import type { LevelTheme } from '../level/Theme';
import { validSavedHeroes, validateSave } from './SaveGame';
import type { SaveFile, SavedHero } from './SaveGame';

/**
 * Saved games in the browser's storage, and as files to download and bring back. Each save is kept gzipped (as base64
 * text) under a key of its own; a small index beside them lists them with their heroes, so the load screen shows them
 * without unpacking any. The newest MAX_SAVES are kept; saving one more drops the oldest.
 */

const log = createLog('save');

const INDEX_KEY = 'dungeons-and-goblins-saves';
const SAVE_KEY_PREFIX = 'dungeons-and-goblins-save:';
/** How many saves the browser keeps. */
export const MAX_SAVES = 12;
/** A save unpacks to no more than this (bytes): anything bigger is refused rather than read. */
const MAX_UNPACKED = 64 * 1024 * 1024;
/** An id: letters, digits and dashes. */
const ID_PATTERN = /^[a-z0-9-]{1,40}$/;
/** Digits of the random part of a new save's id. */
const ID_RANDOM_DIGITS = 6;
const ID_RADIX = 36;

/** A save as the load screen lists it. */
export type SaveEntry = { id: string; name: string; savedAt: number; depth: number; theme: LevelTheme; heroes: SavedHero[] };

function validEntry(value: unknown): value is SaveEntry {
  if (!isRecord(value) || typeof value.id !== 'string' || !ID_PATTERN.test(value.id)) return false;
  const header = typeof value.name === 'string' && isFiniteNumber(value.savedAt) && Number.isInteger(value.depth);
  return header && isLevelTheme(value.theme) && validSavedHeroes(value.heroes);
}

const storage = (): Storage | null => (typeof localStorage === 'undefined' ? null : localStorage);

/** The saves the browser keeps, newest first (an unreadable index lists none). */
export function listSaves(): SaveEntry[] {
  const read = attempt(() => {
    const raw = storage()?.getItem(INDEX_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(validEntry) : [];
  });
  if (!read.ok) log.warn('Save list unreadable', { reason: read.error.message });
  const entries = read.ok ? read.value : [];
  return entries.sort((a, b) => b.savedAt - a.savedAt);
}

function writeIndex(entries: readonly SaveEntry[]): void {
  storage()?.setItem(INDEX_KEY, JSON.stringify(entries));
}

function entryOf(id: string, save: SaveFile): SaveEntry {
  return { id, name: save.name, savedAt: save.savedAt, depth: save.run.depth, theme: save.run.theme, heroes: save.heroes };
}

function newId(savedAt: number): string {
  const random = Math.floor(Math.random() * ID_RADIX ** ID_RANDOM_DIGITS).toString(ID_RADIX);
  return `${savedAt.toString(ID_RADIX)}-${random}`;
}

/** Keeps a save in the browser (dropping the oldest past MAX_SAVES). Fails when storage is full or unavailable. */
export async function storeSave(save: SaveFile): Promise<Result<SaveEntry>> {
  return attemptAsync(async () => {
    const store = storage();
    if (!store) throw new StateError('This browser keeps no saved games');
    const packed = bytesToBase64(await gzipText(JSON.stringify(save)));
    const entry = entryOf(newId(save.savedAt), save);
    store.setItem(SAVE_KEY_PREFIX + entry.id, packed);
    const entries = [entry, ...listSaves()];
    for (const old of entries.splice(MAX_SAVES)) store.removeItem(SAVE_KEY_PREFIX + old.id);
    writeIndex(entries);
    return entry;
  }, 'load-failed');
}

/** A save the browser keeps, unpacked and checked in full. */
export async function readSave(id: string): Promise<Result<SaveFile>> {
  return attemptAsync(async () => {
    const packed = storage()?.getItem(SAVE_KEY_PREFIX + id);
    if (!packed) throw new StateError('This save is gone', { id });
    const save: unknown = await gunzipJson(base64ToBytes(packed), MAX_UNPACKED, 'Save');
    validateSave(save);
    return save;
  }, 'load-failed');
}

/** Forgets a save. */
export function deleteSave(id: string): Result<void> {
  return attempt(() => {
    storage()?.removeItem(SAVE_KEY_PREFIX + id);
    writeIndex(listSaves().filter((entry) => entry.id !== id));
  }, 'load-failed');
}

/** The file name a save downloads as: the game, its name and the day. */
function fileNameOf(save: SaveFile): string {
  const day = new Date(save.savedAt).toISOString().slice(0, 10);
  const name = save.name.replace(/[^\p{L}\p{N}_-]+/gu, '-');
  return `dungeons-and-goblins-${name}-depth${save.run.depth}-${day}.json`;
}

/** Downloads a save as a JSON file to the player's computer. */
export function exportSave(save: SaveFile): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(save)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileNameOf(save);
  link.click();
  URL.revokeObjectURL(url);
}

/** A save file's text, checked in full. */
export function parseSave(textOfFile: string): Result<SaveFile> {
  return attempt(() => {
    const save: unknown = JSON.parse(textOfFile);
    validateSave(save);
    return save;
  }, 'invalid-data');
}

/** Lets the player pick a save file from their computer; resolves to null when they cancel. */
export function pickSaveFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

/** A save file from the player's computer, checked and kept in the browser. */
export async function importSave(file: File): Promise<Result<SaveEntry>> {
  const parsed = parseSave(await file.text());
  if (!parsed.ok) return err(parsed.error);
  const stored = await storeSave(parsed.value);
  return stored.ok ? ok(stored.value) : stored;
}
