import { localPlayer } from '../world';
import type { Entity, Player } from '../world';
import { music } from '../audio/MusicPlayer';
import type { TrackName } from '../audio/MusicPlayer';
import { BOSS_FOES } from '../audio/SoundBank';
import { nearby, Sense } from '../ai/perception/spatial';

/**
 * The level's music, on each screen for its own hero: exploring, until enemies close by engage and the fight
 * music takes over (the boss music, when one of them is a great foe); once the last of them gives up or falls it
 * lingers a while, then exploring comes back in. The level's summary and the end of a run hold their own music.
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

type Fight = 'none' | 'fight' | 'boss';

const foes: Entity[] = [];
let checkIn = 0;
let calmTicks = FIGHT_LINGER_TICKS;
/** Whether a great foe has joined the fight under way (the boss music stays until it is over). */
let bossFight = false;
/** A track that stays whatever happens around the hero (the level's summary, the end of the run). */
let held: TrackName | null = null;

/** A level starts calm, to the exploring music (carried on from the last level, or crossfaded in from the intro). */
export function resetMusic(): void {
  checkIn = 0;
  calmTicks = FIGHT_LINGER_TICKS;
  bossFight = false;
  held = null;
  music.play('explore');
}

/** Plays `track` until the next level starts, whatever is fought around the hero meanwhile. */
export function holdMusic(track: TrackName): void {
  held = track;
  music.play(track);
}

/** The fight near the living hero, if any (fighting anyone: a friend's fight is the hero's too). */
function fightNear(hero: Player): Fight {
  if (hero.health.current <= 0) return 'none';
  let fight: Fight = 'none';
  for (const foe of nearby(hero.position.x, hero.position.y, FIGHT_RADIUS, Sense.mob, foes)) {
    if (foe.ai?.state !== 'engage' || (foe.health?.current ?? 0) <= 0) continue;
    if (foe.mobType && BOSS_FOES.has(foe.mobType)) return 'boss';
    fight = 'fight';
  }
  return fight;
}

export function updateMusic(): void {
  if (held || --checkIn > 0) return;
  checkIn = FIGHT_CHECK_TICKS;
  const hero = localPlayer();
  const fight = hero ? fightNear(hero) : 'none';
  calmTicks = fight === 'none' ? calmTicks + FIGHT_CHECK_TICKS : 0;
  const fighting = calmTicks < FIGHT_LINGER_TICKS;
  bossFight = fighting && (bossFight || fight === 'boss');
  if (!fighting) music.play('explore', FIGHT_FADE_OUT_MS);
  else music.play(bossFight ? 'boss' : 'combat', FIGHT_FADE_IN_MS);
}
