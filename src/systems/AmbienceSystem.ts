import { localPlayer } from '../world';
import type { Entity } from '../world';
import type { Level } from '../level/Level';
import { ambience } from '../audio/AmbiencePlayer';
import type { AmbienceName } from '../audio/AmbiencePlayer';
import { HALL_BEDS } from '../audio/SoundBank';
import { nearby, Sense } from '../ai/perception/spatial';

/**
 * The sound of the place, on each screen for its own hero: a bed for the area they stand in (the safe room's
 * chapel hush, dripping caves, the catacombs' halls — which change with depth), crossfading as they walk from one
 * into another, and over it what is near: torches crackling, war drums from a nest that still stands, a draught
 * from the way down.
 */

/** Listens around this often (ticks). */
const AMBIENCE_CHECK_TICKS = 30;
/** Walking from one area into another crossfades their beds over this long (ms)… */
const AREA_FADE_MS = 2500;
/** …and what is near swells and fades over this long (ms), about the time between checks. */
const NEAR_FADE_MS = 600;
/** Pixels from a torch at which its crackle dies away. */
const CRACKLE_RADIUS = 80;
/** Pixels from a nest at which its drums can no longer be heard (through walls: you hear them before you see them). */
const DRUM_RADIUS = 360;
/** Pixels from the exit at which its draught can no longer be heard. */
const WIND_RADIUS = 200;

const AREA_BEDS: readonly AmbienceName[] = ['cathedral', 'swamp', ...HALL_BEDS];
const near: Entity[] = [];
let hallBed: AmbienceName = 'catacombs';
let checkIn = 0;

/** A level starts: its halls get the bed for its depth, and the next check comes at once. */
export function resetAmbience(depth: number): void {
  hallBed = HALL_BEDS[Math.max(0, depth - 1) % HALL_BEDS.length] ?? 'catacombs';
  checkIn = 0;
}

/** The bed for where the hero stands. */
function bedAt(level: Level, x: number, y: number): AmbienceName {
  if (level.isWorldPosSafe(x, y)) return 'cathedral';
  return level.caveFloor.has(level.tileIndexAt(x, y)) ? 'swamp' : hallBed;
}

const anything = () => true;
const isExit = (e: Entity) => !!e.exitButton;

/** 1 at the nearest thing of `kind` (that `accept`s) to (x, y), falling to 0 at `radius` pixels or with none. */
function nearness(x: number, y: number, radius: number, kind: number, accept: (e: Entity) => boolean): number {
  let closest = radius;
  for (const e of nearby(x, y, radius, kind, near)) {
    if (!e.position || !accept(e)) continue;
    closest = Math.min(closest, Math.hypot(e.position.x - x, e.position.y - y));
  }
  return 1 - closest / radius;
}

export function updateAmbience(level: Level): void {
  if (--checkIn > 0) return;
  checkIn = AMBIENCE_CHECK_TICKS;
  const hero = localPlayer();
  if (!hero) return;
  const { x, y } = hero.position;
  const bed = bedAt(level, x, y);
  for (const name of AREA_BEDS) ambience.fadeTo(name, name === bed ? 1 : 0, AREA_FADE_MS);
  ambience.fadeTo('crackle', nearness(x, y, CRACKLE_RADIUS, Sense.torch, anything), NEAR_FADE_MS);
  ambience.fadeTo('drums', nearness(x, y, DRUM_RADIUS, Sense.nest, anything), NEAR_FADE_MS);
  ambience.fadeTo('wind', nearness(x, y, WIND_RADIUS, Sense.usable, isExit), NEAR_FADE_MS);
}
