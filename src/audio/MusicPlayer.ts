/**
 * Music, streamed through Howler as HTML5 audio. One track plays at a time; changing it is a crossfade, the old
 * one fading out as the new one fades in. A track faded out is paused, not stopped, and picks up where it was
 * when it comes back (exploring, a fight, exploring again).
 */
import { Deck } from './Deck';
import { MUSIC_TRACKS } from './SoundBank';
import type { TrackName } from './SoundBank';

export type { TrackName } from './SoundBank';

/** A change of track crossfades over this long (ms) unless the caller asks for another length. */
export const CROSSFADE_MS = 2000;
/** A volume slider's change is eased in over this long (ms). */
const VOLUME_FADE_MS = 100;

/** Tests run the game's modules under Node, which has no HTML5 audio. */
const hasAudio = typeof Audio !== 'undefined';

class MusicPlayer {
  private readonly decks = new Map<TrackName, Deck>();
  private current: TrackName | null = null;
  private volume = 0;

  /** The track playing (or fading in), if any. */
  get track(): TrackName | null {
    return this.current;
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.current) this.deck(this.current)?.fadeTo(this.levelOf(this.current), VOLUME_FADE_MS);
  }

  /** Crossfades to `track` over `fadeMs`; nothing changes if it is already the one playing. */
  play(track: TrackName, fadeMs = CROSSFADE_MS): void {
    if (track === this.current) return;
    this.fadeOutCurrent(fadeMs);
    this.current = track;
    this.deck(track)?.fadeTo(this.levelOf(track), fadeMs);
  }

  /** Fades the music out to silence (the intro film brings its own sound). */
  stop(fadeMs = CROSSFADE_MS): void {
    this.fadeOutCurrent(fadeMs);
    this.current = null;
  }

  private fadeOutCurrent(fadeMs: number): void {
    if (this.current) this.decks.get(this.current)?.fadeTo(0, fadeMs);
  }

  private levelOf(track: TrackName): number {
    return MUSIC_TRACKS[track].level * this.volume;
  }

  /** A track's player, made the first time it is played. */
  private deck(track: TrackName): Deck | null {
    if (!hasAudio) return null;
    const made = this.decks.get(track);
    if (made) return made;
    const deck = new Deck(MUSIC_TRACKS[track].files, { html5: true });
    this.decks.set(track, deck);
    return deck;
  }
}

export const music = new MusicPlayer();
