import { isFiniteNumber, isRecord } from '../../core/guards';
import { createLog } from '../../core/log';
import { reportRejection } from '../../core/errors';
import { QUICK_ROW, QUICK_SLOTS } from '../../world';
import type { Player } from '../../world';
import { DEFAULT_CLASS, HERO_CLASSES } from '../../rules/Classes';
import type { HeroClassId } from '../../rules/Classes';
import { MAX_SPELL_LEVEL } from '../../rules/Spellbook';
import type { QuickBinding } from '../../rules/Spellbook';
import { profileStore } from './ProfileStore';

/**
 * The player's own quick bar, kept between games for each hero class (game/profile/ProfileStore.ts): how many of its
 * squares are shown (a fighter may want only four; Shift's second row shows as many), and up to PRESET_COUNT presets, the
 * whole bar as it was bound when saved, to load again in a safe room (a caster switching between sets of spells).
 */

const log = createLog('profile');

/** How many presets each hero class keeps. */
export const PRESET_COUNT = 3;
/** The fewest squares the bar may show. */
export const MIN_SHOWN = 1;
/** The document the quick bar is kept in. */
const DOC = 'quick-bar';
/** The longest name a binding may have in a stored preset (spell ids and `feature:`/`feat:` ids are far shorter). */
const MAX_BINDING_NAME = 64;

/** A preset: what each square of both rows held (null: the class's own default), and when it was saved. */
export type BarPreset = { bound: (QuickBinding | null)[]; savedAt: number };
/** One hero class's bar: how many squares show, and its presets (null: an empty one). */
type ClassBar = { shown: number; presets: (BarPreset | null)[] };
type Profile = Partial<Record<HeroClassId, ClassBar>>;

let profile: Profile = {};
/** Changed since the game started: the stored profile, if it arrives after, does not overwrite what the player did. */
let changed = false;

const emptyBar = (): ClassBar => ({ shown: QUICK_ROW, presets: Array.from({ length: PRESET_COUNT }, () => null) });

/** A hero's class, as the profile keys it (a hero with none is the default class). */
type ClassKey = HeroClassId | undefined;

function barOf(cls: ClassKey): ClassBar {
  return profile[cls ?? DEFAULT_CLASS] ?? emptyBar();
}

/** A binding as stored: a name and a level that might be a binding's (whether the hero may bind it is asked when loaded). */
function readBinding(value: unknown): QuickBinding | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.spell !== 'string' || value.spell.length === 0 || value.spell.length > MAX_BINDING_NAME) return undefined;
  const level = value.level;
  if (!Number.isInteger(level) || !isFiniteNumber(level) || level < 0 || level > MAX_SPELL_LEVEL) return undefined;
  return { spell: value.spell, level };
}

/** A stored preset, or null when it is empty or damaged. */
function readPreset(value: unknown): BarPreset | null {
  if (!isRecord(value) || !Array.isArray(value.bound) || value.bound.length !== QUICK_SLOTS || !isFiniteNumber(value.savedAt)) return null;
  const bound = value.bound.map(readBinding);
  return bound.every((b) => b !== undefined) ? { bound: bound.map((b) => b ?? null), savedAt: value.savedAt } : null;
}

/** A stored class bar, whatever of it is valid (the rest at its default). */
function readClassBar(value: unknown): ClassBar {
  const bar = emptyBar();
  if (!isRecord(value)) return bar;
  const shown = value.shown;
  if (Number.isInteger(shown) && isFiniteNumber(shown)) bar.shown = Math.max(MIN_SHOWN, Math.min(QUICK_ROW, shown));
  const presets = Array.isArray(value.presets) ? value.presets : [];
  bar.presets = bar.presets.map((_, i) => readPreset(presets[i]));
  return bar;
}

/** The stored profile, checked: only known hero classes, each bar read as far as it is valid. */
export function readProfile(value: unknown): Profile {
  const read: Profile = {};
  if (!isRecord(value)) return read;
  for (const cls of HERO_CLASSES) if (value[cls] !== undefined) read[cls] = readClassBar(value[cls]);
  return read;
}

/** Reads the stored profile (once, at start-up); until it arrives every class shows the whole bar and has no presets. */
export async function loadQuickBarProfile(): Promise<void> {
  const stored = await profileStore().read(DOC);
  if (!stored.ok) {
    log.warn('Quick bar profile unreadable; using defaults', { reason: stored.error.message });
    return;
  }
  if (!changed) profile = readProfile(stored.value);
}

/** Keeps the profile as it stands now (in the background; a failure is logged, the game goes on with it in memory). */
function persist(): void {
  changed = true;
  const written = profileStore().write(DOC, profile).then((result) => {
    if (!result.ok) log.warn('Quick bar profile could not be saved', { reason: result.error.message });
  });
  reportRejection(written, 'Quick bar profile could not be saved', 'profile');
}

function update(cls: ClassKey, change: (bar: ClassBar) => void): void {
  const bar = barOf(cls);
  change(bar);
  profile = { ...profile, [cls ?? DEFAULT_CLASS]: bar };
  persist();
}

/** How many squares this class's bar shows (and how many of the quick keys cast). */
export function shownSquares(cls: ClassKey): number {
  return barOf(cls).shown;
}

export function setShownSquares(cls: ClassKey, shown: number): void {
  const clamped = Math.max(MIN_SHOWN, Math.min(QUICK_ROW, Math.round(shown)));
  if (clamped === shownSquares(cls)) return;
  update(cls, (bar) => { bar.shown = clamped; });
}

/** This class's presets, in order (null: empty). */
export function barPresets(cls: ClassKey): readonly (BarPreset | null)[] {
  return barOf(cls).presets;
}

/** The hero's quick bar as it is bound now, to keep as a preset. */
export function snapshotBar(player: Player): (QuickBinding | null)[] {
  const bound = player.spellbook?.bound;
  return Array.from({ length: QUICK_SLOTS }, (_, i) => {
    const binding = bound?.[i];
    return binding ? { spell: binding.spell, level: binding.level } : null;
  });
}

/** Keeps the hero's bar as it is now in preset `index`. */
export function storePreset(cls: ClassKey, index: number, bound: readonly (QuickBinding | null)[], savedAt = Date.now()): void {
  if (index < 0 || index >= PRESET_COUNT) return;
  update(cls, (bar) => { bar.presets[index] = { bound: bound.map((b) => (b ? { ...b } : null)), savedAt }; });
}

export function clearPreset(cls: ClassKey, index: number): void {
  if (!barPresets(cls)[index]) return;
  update(cls, (bar) => { bar.presets[index] = null; });
}

const sameBinding = (a: QuickBinding | null | undefined, b: QuickBinding | null | undefined): boolean =>
  (a ?? null) === null ? (b ?? null) === null : !!b && a?.spell === b.spell && a.level === b.level;

/** Whether the hero's bar is bound exactly as this preset is (it is the one in use). */
export function presetInUse(preset: BarPreset, player: Player): boolean {
  const bound = player.spellbook?.bound;
  return preset.bound.every((binding, i) => sameBinding(binding, bound?.[i]));
}

/** Forgets the profile (tests). */
export function resetQuickBarProfile(): void {
  profile = {};
  changed = false;
}
