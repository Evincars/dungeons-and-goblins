import { localPlayer } from '../world';
import type { Entity, Player } from '../world';
import { music } from '../audio/MusicPlayer';
import { nearby, Sense } from '../ai/perception/spatial';

/**
 * The level's music, on each screen for its own hero: exploring, until enemies close by engage and the fight
 * music takes over; once the last of them gives up or falls it lingers a while, then exploring comes back in.
 */

/** Looks for a fight this often (ticks): music need not answer within a frame. */
const FIGHT_CHECK_TICKS = 30;
/** Enemies engaged within this many pixels of the hero mean a fight is on. */
const FIGHT_RADIUS = 240;
/** The fight music plays on this long (ticks) after the fight seems over, so a lull doesn't flip it back and forth. */
const FIGHT_LINGER_TICKS = 360;
/** A fight's music comes in quickly (ms); exploring returns slowly. */
const FIGHT_FADE_IN_MS = 1000;
const FIGHT_FADE_OUT_MS = 3000;

const foes: Entity[] = [];
let checkIn = 0;
let calmTicks = FIGHT_LINGER_TICKS;

/** A level starts calm, to the exploring music (carried on from the last level, or crossfaded in from the intro). */
export function resetMusic(): void {
  checkIn = 0;
  calmTicks = FIGHT_LINGER_TICKS;
  music.play('explore');
}

/** Whether an enemy near the living hero is fighting (fighting anyone: a friend's fight is the hero's too). */
function inFight(hero: Player): boolean {
  if (hero.health.current <= 0) return false;
  for (const foe of nearby(hero.position.x, hero.position.y, FIGHT_RADIUS, Sense.mob, foes)) {
    if (foe.ai?.state === 'engage' && (foe.health?.current ?? 0) > 0) return true;
  }
  return false;
}

export function updateMusic(): void {
  if (--checkIn > 0) return;
  checkIn = FIGHT_CHECK_TICKS;
  const hero = localPlayer();
  calmTicks = hero && inFight(hero) ? 0 : calmTicks + FIGHT_CHECK_TICKS;
  if (calmTicks < FIGHT_LINGER_TICKS) music.play('combat', FIGHT_FADE_IN_MS);
  else music.play('explore', FIGHT_FADE_OUT_MS);
}
