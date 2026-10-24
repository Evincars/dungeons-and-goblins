/** Persisted player preferences and key bindings. */
import { MathUtils } from 'yuka';
import { attempt } from '../core/errors';
import { hasKey, isFiniteNumber, isRecord } from '../core/guards';
import { createLog } from '../core/log';
import { text } from '../core/texts';
import { DEFAULT_CLASS, isHeroClassId } from '../rules/Classes';
import type { HeroClassId } from '../rules/Classes';

const log = createLog('settings');

export const ACTIONS = ['up', 'down', 'left', 'right', 'sprint', 'attack', 'cast', 'swap', 'use', 'inventory', 'console'] as const;
export type ActionName = (typeof ACTIONS)[number];

/** How the key bindings screen names an action. */
export function actionLabel(action: ActionName): string {
  return text(`keys.action.${action}` as const);
}

const DEFAULT_BINDINGS = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
  attack: 'Space',
  cast: 'KeyR',
  swap: 'KeyQ',
  use: 'KeyE',
  inventory: 'Tab',
  // The classic ~ key.
  console: 'Backquote',
} as const satisfies Record<ActionName, string>;

export type Settings = {
  bindings: Record<ActionName, string>;
  /** The hero class picked for the next game (character select). */
  heroClass: HeroClassId;
  sfxVolume: number;
  musicVolume: number;
  fullscreen: boolean;
  /** Name the other players see above this character in multiplayer. */
  playerName: string;
};

export const NAME_MAX = 12;
const DEFAULT_SFX_VOLUME = 0.6;
const DEFAULT_MUSIC_VOLUME = 0.5;

/** Trims and strips anything but letters, digits, spaces and a few separators. */
export function cleanName(text: unknown): string {
  return typeof text === 'string'
    ? text.replace(/[^\p{L}\p{N} _.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '';
}

const STORAGE_KEY = 'dungeons-and-goblins-settings';

function defaults(): Settings {
  return { bindings: { ...DEFAULT_BINDINGS }, heroClass: DEFAULT_CLASS, sfxVolume: DEFAULT_SFX_VOLUME, musicVolume: DEFAULT_MUSIC_VOLUME, fullscreen: false, playerName: '' };
}

function isActionName(key: string): key is ActionName {
  return hasKey(DEFAULT_BINDINGS, key);
}

/** Saved key bindings: known actions bound to key codes, anything else ignored. */
function readBindings(value: unknown): Partial<Record<ActionName, string>> {
  const bindings: Partial<Record<ActionName, string>> = {};
  if (!isRecord(value)) return bindings;
  for (const [action, code] of Object.entries(value)) {
    if (isActionName(action) && typeof code === 'string') bindings[action] = code;
  }
  return bindings;
}

/**
 * Stored bindings over the defaults. An action added since they were saved takes its default key, and an older
 * action still on that key moves to its own new default (Q became weapon swap; the spell moved to R).
 */
export function mergeBindings(stored: Partial<Record<ActionName, string>>): Record<ActionName, string> {
  const merged: Record<ActionName, string> = { ...DEFAULT_BINDINGS, ...stored };
  for (const added of ACTIONS) if (stored[added] === undefined) giveDefaultKey(merged, added);
  return merged;
}

/** `action` gets its default key; any other action holding it goes back to its own default. */
function giveDefaultKey(bindings: Record<ActionName, string>, action: ActionName): void {
  const key = DEFAULT_BINDINGS[action];
  for (const other of ACTIONS) if (other !== action && bindings[other] === key) bindings[other] = DEFAULT_BINDINGS[other];
}

/** Takes what is valid from stored settings, keeping the default for anything missing or damaged. */
function parseSettings(value: unknown, base: Settings): Settings {
  if (!isRecord(value)) return base;
  return {
    bindings: mergeBindings(readBindings(value.bindings)),
    heroClass: isHeroClassId(value.heroClass) ? value.heroClass : base.heroClass,
    sfxVolume: isFiniteNumber(value.sfxVolume) ? MathUtils.clamp(value.sfxVolume, 0, 1) : base.sfxVolume,
    musicVolume: isFiniteNumber(value.musicVolume) ? MathUtils.clamp(value.musicVolume, 0, 1) : base.musicVolume,
    fullscreen: typeof value.fullscreen === 'boolean' ? value.fullscreen : base.fullscreen,
    playerName: cleanName(value.playerName),
  };
}

function load(): Settings {
  const base = defaults();
  // Corrupt or unavailable storage (tests, private browsing) must not stop the game from starting.
  const stored = attempt(() => {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
    return raw ? parseSettings(JSON.parse(raw), base) : base;
  });
  if (stored.ok) return stored.value;
  log.warn('Stored settings unreadable; using defaults', { reason: stored.error.message });
  return base;
}

export const settings: Settings = load();

export function saveSettings(): void {
  // Private browsing and the like: preferences simply will not persist.
  const saved = attempt(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)));
  if (!saved.ok) log.warn('Settings could not be saved', { reason: saved.error.message });
}

export function resetBindings(): void {
  settings.bindings = { ...DEFAULT_BINDINGS };
  saveSettings();
}

export function bindingFor(action: ActionName): string {
  return settings.bindings[action];
}

/** Binds a key to an action, clearing it from any other action so bindings stay unique. */
export function bind(action: ActionName, code: string): void {
  for (const other of ACTIONS) if (other !== action && settings.bindings[other] === code) settings.bindings[other] = '';
  settings.bindings[action] = code;
  saveSettings();
}

/** Human-readable form of a KeyboardEvent.code, for menus and prompts. */
export function codeLabel(code: string): string {
  if (!code) return '-';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return code.slice(5).toUpperCase();
  switch (code) {
    case 'ShiftLeft': return 'L SHIFT';
    case 'ShiftRight': return 'R SHIFT';
    case 'ControlLeft': return 'L CTRL';
    case 'ControlRight': return 'R CTRL';
    case 'AltLeft': return 'L ALT';
    case 'AltRight': return 'R ALT';
    case 'Space': return 'SPACE';
    case 'Escape': return 'ESC';
    case 'Backquote': return '~';
    default: return code.toUpperCase();
  }
}
