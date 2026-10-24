/**
 * Sound effects, played through Howler (Web Audio): the recipes in SoundBank.ts, each of their layers a clip
 * picked from its takes, faded and panned by its distance from the listener.
 */
import { Howl, Howler } from 'howler';
import { MathUtils } from 'yuka';
import { assetUrl } from '../assets/assetUrl';
import { hasKey } from '../core/guards';
import { LoadError, report } from '../core/errors';
import { SFX, allClips } from './SoundBank';
import type { Layer, SfxName } from './SoundBank';

export type { SfxName } from './SoundBank';

/** Sounds farther than this from the listener are not played; nearer ones fade and pan with distance. */
const EARSHOT = 320;
const DEFAULT_SFX_VOLUME = 0.6;
/** Each layer plays up to this much faster or slower at random, so a sound repeated never rings quite the same. */
const RATE_JITTER = 0.06;
/**
 * The same effect again within this many milliseconds is not played (it is still relayed to co-op guests, who
 * drop it the same way): a volley of darts striking, or the whole party levelling up on one kill, is heard once
 * instead of stacking into one loud blare.
 */
const REPEAT_GAP_MS = 50;

/** Tests run the game's modules under Node, which has no Web Audio. */
const hasAudio = typeof AudioContext !== 'undefined';

/** Whether a name (e.g. from a network message) is a sound this game can play. */
export function isSfxName(value: unknown): value is SfxName {
  return typeof value === 'string' && hasKey(SFX, value);
}

/** The Howler sprite that plays a stretch of a recording. */
const spriteName = (slice: readonly [number, number]) => `${slice[0]}+${slice[1]}`;

/** Every recording the effects use, with the stretches of it (Howler sprites) they play. */
function recordings(): Map<string, Record<string, [number, number]>> {
  const files = new Map<string, Record<string, [number, number]>>();
  for (const clip of allClips()) {
    const sprites = files.get(clip.file) ?? {};
    if (clip.slice) sprites[spriteName(clip.slice)] = [clip.slice[0], clip.slice[1]];
    files.set(clip.file, sprites);
  }
  return files;
}

/** How loud (0..1) and where (-1 left … 1 right) the sound being placed is heard; reused by every play. */
const heard = { gain: 1, pan: 0 };

class SoundPlayer {
  private readonly howls = new Map<string, Howl>();
  private readonly listener = { x: 0, y: 0 };
  /** When each effect last played (ms), so a burst of the same one is heard once. */
  private readonly lastPlayed = new Map<SfxName, number>();

  sfxVolume = DEFAULT_SFX_VOLUME;
  /** Observer for every effect played here; the co-op host relays them to its guests. */
  onEffect: ((name: SfxName, x?: number, y?: number) => void) | null = null;

  setSfxVolume(volume: number): void {
    this.sfxVolume = volume;
  }

  /**
   * Starts loading every recording in the background: the game need not wait for them, and an effect is silent
   * until its clips have arrived. Howler resumes the audio itself on the first key press or click.
   */
  load(): void {
    if (!hasAudio || this.howls.size > 0) return;
    // Otherwise Howler suspends the audio after half a minute of quiet, and the next sound comes late.
    Howler.autoSuspend = false;
    for (const [file, sprites] of recordings()) this.howls.set(file, this.loadRecording(file, sprites));
  }

  /** One recording; one that cannot be played stays silent rather than breaking the game. */
  private loadRecording(file: string, sprites: Record<string, [number, number]>): Howl {
    return new Howl({
      src: [assetUrl(file)],
      sprite: Object.keys(sprites).length > 0 ? sprites : undefined,
      onloaderror: (_id, error) => {
        report(new LoadError(`Sound "${file}" could not be loaded`, { context: { file, reason: String(error) } }),
          'A sound clip failed to load; it will be silent', 'audio');
      },
    });
  }

  setListener(x: number, y: number): void { this.listener.x = x; this.listener.y = y; }

  /** Places a sound at (x, y) in `heard` (everywhere at full volume without a position); false out of earshot. */
  private place(x?: number, y?: number): boolean {
    heard.gain = 1;
    heard.pan = 0;
    if (x === undefined || y === undefined) return true;
    const dx = x - this.listener.x;
    const dist = Math.hypot(dx, y - this.listener.y);
    if (dist > EARSHOT) return false;
    heard.gain = 1 - dist / EARSHOT;
    heard.pan = MathUtils.clamp(dx / EARSHOT, -1, 1);
    return true;
  }

  /** Whether the effect already played a moment ago (and if not, notes that it plays now). */
  private repeated(name: SfxName): boolean {
    const now = Date.now();
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < REPEAT_GAP_MS) return true;
    this.lastPlayed.set(name, now);
    return false;
  }

  /** An effect at (x, y) in the world (or everywhere, without a position), heard by every player in the game. */
  playSound(name: SfxName, x?: number, y?: number): void {
    this.onEffect?.(name, x, y);
    this.play(name, x, y);
  }

  /** An effect for this screen alone (a dialog opening, your own death): never sent to the other players. */
  playLocal(name: SfxName): void {
    this.play(name);
  }

  private play(name: SfxName, x?: number, y?: number): void {
    if (!hasAudio || !this.place(x, y) || this.repeated(name)) return;
    try {
      for (const layer of SFX[name]) this.playLayer(layer, heard.gain, heard.pan);
    } catch (thrown) {
      report(thrown, `Sound "${name}" could not be played`, 'audio');
    }
  }

  private playLayer(layer: Layer, gain: number, pan: number): void {
    if (layer.delay <= 0) {
      this.startLayer(layer, gain, pan);
      return;
    }
    setTimeout(() => this.startLayer(layer, gain, pan), layer.delay);
  }

  /** One of the layer's clips, at its loudness and speed (nudged a little at random), faded and panned. */
  private startLayer(layer: Layer, gain: number, pan: number): void {
    const clip = layer.clips[Math.floor(Math.random() * layer.clips.length)];
    const howl = clip ? this.howls.get(clip.file) : undefined;
    if (!clip || !howl || howl.state() !== 'loaded') return;
    const id = clip.slice ? howl.play(spriteName(clip.slice)) : howl.play();
    howl.volume(layer.volume * gain * this.sfxVolume, id);
    howl.rate(layer.rate * MathUtils.randFloat(1 - RATE_JITTER, 1 + RATE_JITTER), id);
    if (pan !== 0) howl.stereo(pan, id);
  }
}

export const sound = new SoundPlayer();
