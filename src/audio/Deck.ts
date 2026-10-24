import { Howl } from 'howler';
import { assetUrl } from '../assets/assetUrl';
import { LoadError, report } from '../core/errors';
import { afterNextGesture } from './AudioUnlock';

/**
 * One looping piece of sound, faded in and out: a music track (its files one after another, a single file looping
 * on its own) or an ambient bed. Faded out it is paused, not stopped, and picks up where it was when it comes back.
 */

export type DeckOptions = {
  /**
   * Stream it as HTML5 audio (long music starts at once instead of first being downloaded and decoded whole), or
   * decode it for Web Audio (short ambient loops, which then loop without a gap).
   */
  html5: boolean;
};

export class Deck {
  private readonly howls: Howl[];
  private index = 0;
  private id: number | undefined;
  /** The volume it is playing at or fading to; 0 while it fades out or is paused. */
  private target = 0;

  constructor(private readonly files: readonly string[], options: DeckOptions) {
    this.howls = files.map((file) => this.load(file, options));
  }

  private load(file: string, { html5 }: DeckOptions): Howl {
    return new Howl({
      src: [assetUrl(file)],
      html5,
      loop: this.files.length === 1,
      volume: 0,
      onloaderror: (_id, error) => {
        report(new LoadError(`Sound "${file}" could not be loaded`, { context: { file, reason: String(error) } }),
          'A piece of music or ambience failed to load; it will be silent', 'audio');
      },
      // Refused all the same (the browser wants a fresh gesture): it starts on the player's next click or key.
      onplayerror: () => afterNextGesture(() => this.resume()),
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

  /** Fades to `volume` over `ms`: in (from where it was paused, or the start), up or down, or out to a pause at 0. */
  fadeTo(volume: number, ms: number): void {
    if (volume === this.target) return;
    if (volume <= 0) this.fadeOut(ms);
    else this.fadeIn(volume, ms);
  }

  private fadeIn(volume: number, ms: number): void {
    const howl = this.howl;
    if (!howl) return;
    this.target = volume;
    if (this.id === undefined || !howl.playing(this.id)) this.id = howl.play(this.id);
    howl.fade(Deck.volumeOf(howl, this.id), volume, ms, this.id);
  }

  private fadeOut(ms: number): void {
    const howl = this.howl;
    const id = this.id;
    this.target = 0;
    if (!howl || id === undefined) return;
    howl.fade(Deck.volumeOf(howl, id), 0, ms, id);
    // A fade cut short by a new one also ends with this event: only a deck still meant to be silent pauses.
    howl.once('fade', () => { if (this.target === 0) howl.pause(id); }, id);
  }

  /** Playback refused until the player's first gesture: start now, at the volume it should have. */
  private resume(): void {
    const howl = this.howl;
    if (!howl || this.target === 0) return;
    this.id = howl.play(this.id);
    howl.volume(this.target, this.id);
  }

  /** A file of several has ended: the next one follows at once (looping files end every time round, and go on). */
  private next(): void {
    if (this.files.length < 2) return;
    this.index = (this.index + 1) % this.howls.length;
    this.id = undefined;
    const howl = this.howl;
    if (!howl || this.target === 0) return;
    this.id = howl.play();
    howl.volume(this.target, this.id);
  }
}
