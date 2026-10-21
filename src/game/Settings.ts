/** Persisted player preferences and key bindings. */
import { MathUtils } from 'yuka';
import { attempt } from '../core/errors';
import { hasKey, isFiniteNumber, isRecord } from '../core/guards';
import { createLog } from '../core/log';

const log = createLog('settings');

export const ACTIONS = ['up', 'down', 'left', 'right', 'sprint', 'attack', 'cast', 'use', 'inventory'] as const;
export type ActionName = (typeof ACTIONS)[number];

export const ACTION_LABELS = {
  up: 'UP',
  down: 'DOWN',
  left: 'LEFT',
  right: 'RIGHT',
  sprint: 'SPRINT',
  attack: 'SWORD',
  cast: 'SPELL',
  use: 'USE',
  inventory: 'INVENTORY',
} as const satisfies Record<ActionName, string>;

const DEFAULT_BINDINGS = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
  attack: 'Space',
  cast: 'KeyQ',
  use: 'KeyE',
  inventory: 'Tab',
} as const satisfies Record<ActionName, string>;

export type Settings = {
  bindings: Record<ActionName, string>;
  sfxVolume: number;
  fullscreen: boolean;
  /** Name the other players see above this character in multiplayer. */
  playerName: string;
};

export const NAME_MAX = 12;
const DEFAULT_SFX_VOLUME = 0.6;

/** Trims and strips anything but letters, digits, spaces and a few separators. */
export function cleanName(text: unknown): string {
  return typeof text === 'string'
    ? text.replace(/[^\p{L}\p{N} _.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '';
}

const STORAGE_KEY = 'dungeons-and-goblins-settings';

function defaults(): Settings {
  return { bindings: { ...DEFAULT_BINDINGS }, sfxVolume: DEFAULT_SFX_VOLUME, fullscreen: false, playerName: '' };
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

/** Takes what is valid from stored settings, keeping the default for anything missing or damaged. */
function parseSettings(value: unknown, base: Settings): Settings {
  if (!isRecord(value)) return base;
  return {
    bindings: { ...base.bindings, ...readBindings(value.bindings) },
    sfxVolume: isFiniteNumber(value.sfxVolume) ? MathUtils.clamp(value.sfxVolume, 0, 1) : base.sfxVolume,
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
