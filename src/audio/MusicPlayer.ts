/**
 * Music, streamed through Howler as HTML5 audio (a long piece starts at once instead of first being downloaded
 * and decoded whole). One track plays at a time; changing it is a crossfade, the old one fading out as the new
 * one fades in. A track faded out is paused, not stopped, and picks up where it was when it comes back
 * (exploring, a fight, exploring again).
 */
import { Howl } from 'howler';
import { assetUrl } from '../assets/assetUrl';
import { LoadError, report } from '../core/errors';
import { MUSIC_TRACKS } from './SoundBank';
import type { Track, TrackName } from './SoundBank';

export type { TrackName } from './SoundBank';

/** A change of track crossfades over this long (ms) unless the caller asks for another length. */
export const CROSSFADE_MS = 2000;

/** Tests run the game's modules under Node, which has no HTML5 audio. */
const hasAudio = typeof Audio !== 'undefined';
const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const;

/** Runs `action` on the player's next click, tap or key press (browsers only start audio after one). */
function afterGesture(action: () => void): void {
  const once = () => {
    GESTURES.forEach((e) => window.removeEventListener(e, once, true));
    action();
  };
  GESTURES.forEach((e) => window.addEventListener(e, once, true));
}

/** One track's player: its files one after another (a single file loops on its own), faded in and out. */
class Deck {
  private readonly howls: Howl[];
  private index = 0;
  private id: number | undefined;
  /** The volume it is playing at or fading to; 0 while it fades out or is paused. */
  private target = 0;

  constructor(private readonly track: Track) {
    this.howls = track.files.map((file) => this.load(file));
  }

  private load(file: string): Howl {
    return new Howl({
      src: [assetUrl(file)],
      html5: true,
      loop: this.track.files.length === 1,
      volume: 0,
      onloaderror: (_id, error) => {
        report(new LoadError(`Music "${file}" could not be loaded`, { context: { file, reason: String(error) } }),
          'A piece of music failed to load; it will be silent', 'audio');
      },
      // The title screen asks for its music before the player has touched anything: it starts on their first click.
      onplayerror: () => afterGesture(() => this.resume()),
      onend: () => this.next(),
    });
  }

  private get howl(): Howl | undefined {
    return this.howls[this.index];
  }

  /** The sound's volume right now, part way through a fade or not. */
  private static volumeOf(howl: Howl, id: number): number {
    const volume = howl.volume(id);
    return typeof volume === 'number' ? volume : 0;
  }

  /** Fades in to `volume` from where it is, picking up where it was paused (or from the start). */
  fadeIn(volume: number, ms: number): void {
    const howl = this.howl;
    if (!howl) return;
    this.target = volume;
    if (this.id === undefined || !howl.playing(this.id)) this.id = howl.play(this.id);
    howl.fade(Deck.volumeOf(howl, this.id), volume, ms, this.id);
  }

  /** Fades out, then pauses, unless it is called back in before the fade ends. */
  fadeOut(ms: number): void {
    const howl = this.howl;
    const id = this.id;
    if (!howl || id === undefined) return;
    this.target = 0;
    howl.fade(Deck.volumeOf(howl, id), 0, ms, id);
    // A fade cut short by a new one also ends with this event: only a deck still meant to be silent pauses.
    howl.once('fade', () => { if (this.target === 0) howl.pause(id); }, id);
  }

  setVolume(volume: number): void {
    this.target = volume;
    if (this.id !== undefined) this.howl?.volume(volume, this.id);
  }

  /** Playback refused until the player's first gesture: start now, at the volume it should have. */
  private resume(): void {
    const howl = this.howl;
    if (!howl || this.target === 0) return;
    this.id = howl.play(this.id);
    howl.volume(this.target, this.id);
  }

  /** A file of several has ended: the next one follows at once (looping tracks end every time round, and go on). */
  private next(): void {
    if (this.track.files.length < 2) return;
    this.index = (this.index + 1) % this.howls.length;
    this.id = undefined;
    const howl = this.howl;
    if (!howl || this.target === 0) return;
    this.id = howl.play();
    howl.volume(this.target, this.id);
  }
}

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
    if (this.current) this.deck(this.current)?.setVolume(this.levelOf(this.current));
  }

  /** Crossfades to `track` over `fadeMs`; nothing changes if it is already the one playing. */
  play(track: TrackName, fadeMs = CROSSFADE_MS): void {
    if (track === this.current) return;
    this.fadeOutCurrent(fadeMs);
    this.current = track;
    this.deck(track)?.fadeIn(this.levelOf(track), fadeMs);
  }

  /** Fades the music out to silence (the intro film brings its own sound). */
  stop(fadeMs = CROSSFADE_MS): void {
    this.fadeOutCurrent(fadeMs);
    this.current = null;
  }

  private fadeOutCurrent(fadeMs: number): void {
    if (this.current) this.decks.get(this.current)?.fadeOut(fadeMs);
  }

  private levelOf(track: TrackName): number {
    return MUSIC_TRACKS[track].level * this.volume;
  }

  /** A track's player, made the first time it is played. */
  private deck(track: TrackName): Deck | null {
    if (!hasAudio) return null;
    const made = this.decks.get(track);
    if (made) return made;
    const deck = new Deck(MUSIC_TRACKS[track]);
    this.decks.set(track, deck);
    return deck;
  }
}

export const music = new MusicPlayer();
