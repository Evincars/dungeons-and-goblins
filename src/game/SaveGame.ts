import { q, isPlayerSlot, PLAYER_SLOTS } from '../world';
import type { Player, PlayerSlot } from '../world';
import type { Level } from '../level/Level';
import type { LevelTheme } from '../level/Theme';
import { isLevelTheme } from '../level/Theme';
import { decodeLevelMap, encodeLevelMap } from '../level/LevelMap';
import type { LevelMap } from '../level/LevelMap';
import type { DungeonLayout } from '../level/generators/DungeonBuilder';
import { captureWorld, validateNetState } from '../network/WorldSync';
import type { NetState } from '../network/WorldSync';
import { ensure } from '../core/errors';
import { isFiniteNumber, isRecord } from '../core/guards';
import { text } from '../core/texts';
import { DEFAULT_CLASS, isHeroClassId } from '../rules/Classes';
import type { HeroClassId } from '../rules/Classes';
import { heroName } from '../rules/Names';
import { weaponInHand } from '../rules/CharacterSheet';
import { cleanName } from './Settings';

/**
 * A saved game: everything the host (or a player alone) needs to take the run up again where it stood — the level as it
 * is now (its map, tiles changed in play included, and what has been seen of it), every entity of the world (the heroes
 * with their gear, levels, bound spells and switched features, where they stand and how hurt they are; the enemies, chests,
 * doors and the rest as they are), the run's depth and the kind of dungeon. The heroes are also listed on their own, so
 * a save can be shown (the load screen, the co-op lobby) without reading the world. Kept in the browser's storage
 * (game/SaveStore.ts) and as a file to download; taken up again by game/SaveRestore.ts.
 */

export const SAVE_FORMAT = 'dungeons-and-goblins-save';
export const SAVE_VERSION = 1;
/** Deeper than any run goes: a save claiming more is not one of ours. */
const MAX_SAVED_DEPTH = 1000;
/** The longest hero level and experience a save may claim. */
const MAX_HERO_LEVEL = 20;
const MAX_EXP = 10_000_000;
/** A weapon's name in the hero list is cut to this. */
const MAX_WEAPON_NAME = 40;

/** A hero of a saved game, as the load screen and the lobby show them. */
export type SavedHero = {
  slot: PlayerSlot;
  name: string;
  heroClass: HeroClassId;
  level: number;
  exp: number;
  gold: number;
  /** The weapon in hand ('' with none). */
  weapon: string;
};

export type SaveFile = {
  format: typeof SAVE_FORMAT;
  version: typeof SAVE_VERSION;
  /** When it was saved (ms since 1970). */
  savedAt: number;
  /** What the save is called (the host's hero's name). */
  name: string;
  run: { depth: number; theme: LevelTheme; seed: number };
  heroes: SavedHero[];
  map: LevelMap;
  world: NetState;
  /** What had been seen of the level (Level.seenBits). */
  seen: string;
};

function heroOf(player: Player): SavedHero {
  return {
    slot: player.playerSlot ?? 'host',
    name: cleanName(player.playerName) || heroName(player.heroClass ?? DEFAULT_CLASS),
    heroClass: player.heroClass ?? DEFAULT_CLASS,
    level: player.playerStats.level,
    exp: player.playerStats.exp,
    gold: player.playerStats.gold,
    weapon: (weaponInHand(player.equipped ?? {})?.name ?? '').slice(0, MAX_WEAPON_NAME),
  };
}

/** The level being played, as it stands. */
export type SaveSource = { level: Level; layout: DungeonLayout; seed: number; depth: number; theme: LevelTheme };

/** The game as it stands now, as a save. */
export function captureSave(from: SaveSource, savedAt = Date.now()): SaveFile {
  const heroes: SavedHero[] = [];
  for (const player of q.players) heroes.push(heroOf(player));
  heroes.sort((a, b) => PLAYER_SLOTS.indexOf(a.slot) - PLAYER_SLOTS.indexOf(b.slot));
  const host = heroes.find((hero) => hero.slot === 'host');
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    savedAt,
    name: host?.name ?? text('save.untitled'),
    run: { depth: from.depth, theme: from.theme, seed: from.seed },
    heroes,
    map: encodeLevelMap(from.layout),
    world: captureWorld(false, from.seed),
    seen: from.level.seenBits(),
  };
}

const inRange = (value: unknown, min: number, max: number): boolean =>
  Number.isInteger(value) && Number(value) >= min && Number(value) <= max;

export function validSavedHero(value: unknown): value is SavedHero {
  if (!isRecord(value) || !isPlayerSlot(value.slot) || !isHeroClassId(value.heroClass)) return false;
  const named = typeof value.name === 'string' && cleanName(value.name) === value.name;
  const weapon = typeof value.weapon === 'string' && value.weapon.length <= MAX_WEAPON_NAME;
  return named && weapon && inRange(value.level, 1, MAX_HERO_LEVEL) && inRange(value.exp, 0, MAX_EXP) && isFiniteNumber(value.gold);
}

/** The heroes of a save: one to four, each in a seat of their own, the host among them. */
export function validSavedHeroes(value: unknown): value is SavedHero[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > PLAYER_SLOTS.length || !value.every(validSavedHero)) return false;
  const slots = new Set(value.map((hero: SavedHero) => hero.slot));
  return slots.size === value.length && slots.has('host');
}

/** Throws a ValidationError unless `value` is a whole save of this game: its map and its world checked in full. */
export function validateSave(value: unknown): asserts value is SaveFile {
  ensure(isRecord(value) && value.format === SAVE_FORMAT, 'This is not a saved game of Dungeons & Goblins');
  ensure(value.version === SAVE_VERSION, 'This save was made by another version of the game', { version: String(value.version) });
  ensure(isFiniteNumber(value.savedAt) && typeof value.name === 'string' && cleanName(value.name) === value.name, 'Invalid save header');
  const run = value.run;
  ensure(isRecord(run) && inRange(run.depth, 1, MAX_SAVED_DEPTH) && isLevelTheme(run.theme) && Number.isInteger(run.seed), 'Invalid run in save');
  ensure(validSavedHeroes(value.heroes), 'Invalid heroes in save');
  ensure(typeof value.seen === 'string' && /^[01]*$/.test(value.seen), 'Invalid fog in save');
  decodeLevelMap(value.map);
  validateNetState(value.world);
}

/** The dungeon of a save, built again from its map (checked in full). */
export function savedLayout(save: SaveFile): DungeonLayout {
  return decodeLevelMap(save.map);
}

/** The heroes' level in a save (their mean, rounded): what its enemy spellcasters cast at. */
export function savedPartyLevel(save: SaveFile): number {
  let sum = 0;
  for (const hero of save.heroes) sum += hero.level;
  return Math.max(1, Math.round(sum / save.heroes.length));
}

/** A hero of a save in one line: class and level, experience, weapon. */
export function heroLine(hero: SavedHero): string {
  const line = text('save.hero_line', { hero: heroName(hero.heroClass), level: hero.level, exp: hero.exp });
  return hero.weapon ? `${line} - ${hero.weapon}` : line;
}

/** Someone in the room taking up a save: their seat and the name they go by. */
export type Seat = { slot: PlayerSlot; name: string };

/** The first hero still free that passes `test`, taken out of `free`. */
function takeHero(free: SavedHero[], test: (hero: SavedHero) => boolean): SavedHero | undefined {
  const i = free.findIndex(test);
  return i < 0 ? undefined : free.splice(i, 1)[0];
}

/**
 * Which saved hero each player in the room plays (saved seat → seat now): the host takes up the host's hero; a guest
 * the hero saved under their name, else the one who sat in their seat, else whoever is left. A player with no hero
 * left starts a fresh one; a saved hero nobody takes stays out of the game.
 */
export function seatsFor(save: SaveFile, seats: readonly Seat[]): Map<PlayerSlot, PlayerSlot> {
  const free = [...save.heroes];
  const taken = new Map<PlayerSlot, PlayerSlot>();
  const open: Seat[] = [];
  for (const seat of seats) {
    const lower = seat.name.toLowerCase();
    const hero = seat.slot === 'host'
      ? takeHero(free, (h) => h.slot === 'host')
      : takeHero(free, (h) => h.slot !== 'host' && h.name.toLowerCase() === lower);
    if (hero) taken.set(hero.slot, seat.slot);
    else if (seat.slot !== 'host') open.push(seat);
  }
  for (const seat of open) {
    const hero = takeHero(free, (h) => h.slot === seat.slot) ?? takeHero(free, (h) => h.slot !== 'host');
    if (hero) taken.set(hero.slot, seat.slot);
  }
  return taken;
}

/** For the lobby: the line of the saved hero each seat will play (seats with none are left out). */
export function seatHeroLines(save: SaveFile, seats: readonly Seat[]): Map<PlayerSlot, string> {
  const lines = new Map<PlayerSlot, string>();
  for (const [saved, seat] of seatsFor(save, seats)) {
    const hero = save.heroes.find((h) => h.slot === saved);
    if (hero) lines.set(seat, heroLine(hero));
  }
  return lines;
}

/** The save the next game takes up (picked on the load screen), if any. */
let chosen: SaveFile | null = null;

export function chooseSave(save: SaveFile | null): void {
  chosen = save;
}

export function chosenSave(): SaveFile | null {
  return chosen;
}

/** The save to take up, handed over once: the level that takes it up clears it. */
export function takeChosenSave(): SaveFile | null {
  const save = chosen;
  chosen = null;
  return save;
}
