/**
 * Web Audio sound effects. Most clips are Catacomb Snatch's WAVs (footsteps,
 * coins, hits, deaths, falling); a few effects with no counterpart there are
 * synthesised.
 */
import { assetUrl } from '../assets/assetUrl';
import { hasKey } from '../core/guards';
import { LoadError, attemptAsync, report, reportRejection } from '../core/errors';
import { createLog } from '../core/log';

const log = createLog('audio');

/** Sounds farther than this from the listener are not played; nearer ones fade and pan with distance. */
const EARSHOT = 320;
const DEFAULT_SFX_VOLUME = 0.6;
/** Synthesised effects fade out over this many seconds. */
const SYNTH_TAIL = 1.5;
const SYNTH_GAIN = 0.8;
/** Exponential ramps cannot reach zero, so they fade to this. */
const SILENT = 0.001;
/** Oscillators stop a moment after their envelope ends, so the fade is never cut. */
const OSC_STOP_PAD = 0.05;

/** Clips played from files; several entries means one is picked at random. */
const CLIPS = {
  step: ['/sound/Step 1.wav'],
  step2: ['/sound/Step 2.wav'],
  coin: ['/sound/Small Coin.wav'],
  coin_big: ['/sound/Big Coin.wav'],
  gem: ['/sound/Gem.wav'],
  gem_big: ['/sound/Big Gem.wav'],
  hurt: ['/sound/hit2.wav'],
  sword_hit: ['/sound/hit1.wav', '/sound/hit3.wav'],
  death: ['/sound/Death.wav'],
  enemy_death: ['/sound/Enemy Death 1.wav', '/sound/Enemy Death 2.wav'],
  level_up: ['/sound/levelUp.wav'],
  fall: ['/sound/Fall.wav'],
  falling: ['/sound/falling_male.wav'],
  buy: ['/sound/Upgrade.wav'],
  fail: ['/sound/Fail.wav'],
} as const;

type ClipName = keyof typeof CLIPS;
type SynthName = 'sword_swing' | 'sword_miss' | 'boss_death' | 'potion' | 'chest_open' | 'door_open' | 'spell';
export type SfxName = ClipName | SynthName;

function isClip(name: SfxName): name is ClipName {
  return hasKey(CLIPS, name);
}

/** One synthesised voice: a tone or a burst of noise with a falling envelope. */
type Voice =
  | { kind: 'osc'; freq: number; wave: OscillatorType; dur: number; vol: number }
  | { kind: 'noise'; dur: number; vol: number };

const osc = (freq: number, wave: OscillatorType, dur: number, vol: number): Voice => ({ kind: 'osc', freq, wave, dur, vol });
const noise = (dur: number, vol: number): Voice => ({ kind: 'noise', dur, vol });

const SYNTHS = {
  sword_swing: [noise(0.08, 0.3), osc(400, 'sawtooth', 0.07, 0.2)],
  sword_miss: [noise(0.05, 0.15)],
  boss_death: [osc(80, 'sawtooth', 1.0, 0.5), osc(160, 'square', 0.8, 0.3), noise(0.5, 0.4)],
  potion: [osc(440, 'sine', 0.15, 0.25), osc(550, 'sine', 0.1, 0.2), noise(0.1, 0.1)],
  spell: [osc(520, 'triangle', 0.25, 0.25), osc(780, 'sine', 0.2, 0.15), noise(0.12, 0.08)],
  chest_open: [osc(220, 'sine', 0.2, 0.2), osc(330, 'sine', 0.15, 0.25), osc(440, 'sine', 0.1, 0.3)],
  door_open: [noise(0.2, 0.3), osc(100, 'sawtooth', 0.3, 0.2)],
} as const satisfies Record<SynthName, readonly Voice[]>;

/** Whether a name (e.g. from a network message) is a sound this game can play. */
export function isSfxName(value: unknown): value is SfxName {
  return typeof value === 'string' && (hasKey(CLIPS, value) || hasKey(SYNTHS, value));
}

class SoundPlayer {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private listener = { x: 0, y: 0 };
  private buffers = new Map<string, AudioBuffer>();

  sfxVolume = DEFAULT_SFX_VOLUME;
  muteInterface = false;
  /** Observer for every effect played here; the co-op host relays them to its guests. */
  onEffect: ((name: SfxName, x?: number, y?: number) => void) | null = null;

  setSfxVolume(volume: number): void {
    this.sfxVolume = volume;
    if (this.sfxGain) this.sfxGain.gain.value = volume;
  }

  /** The audio context, made on first use; null where there is no Web Audio (tests, old browsers). */
  private context(): AudioContext | null {
    if (this.ctx || typeof AudioContext === 'undefined') return this.ctx;
    this.ctx = new AudioContext();
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.ctx.destination);
    return this.ctx;
  }

  private async loadClip(ctx: AudioContext, path: string): Promise<void> {
    const res = await fetch(assetUrl(path));
    if (!res.ok) throw new LoadError(`Sound "${path}" could not be fetched`, { context: { path, status: res.status } });
    this.buffers.set(path, await ctx.decodeAudioData(await res.arrayBuffer()));
  }

  /** Decodes every clip up front; safe before any user gesture. One unplayable clip must not break the game. */
  async load(): Promise<void> {
    const ctx = this.context();
    if (!ctx) return;
    const paths = [...new Set(Object.values(CLIPS).flat())];
    const results = await Promise.all(paths.map((path) => attemptAsync(() => this.loadClip(ctx, path), 'load-failed')));
    for (const result of results) {
      if (!result.ok) report(result.error, 'A sound clip failed to load; it will be silent', 'audio');
    }
  }

  /** Browsers start audio suspended; resume it on the first key press or click. */
  autoStart(): void {
    const ctx = this.context();
    if (!ctx) return;
    const events = ['pointerdown', 'keydown', 'touchend'] as const;
    const unlock = () => {
      reportRejection(ctx.resume(), 'Audio could not be resumed', 'audio');
      if (ctx.state === 'running') events.forEach((e) => window.removeEventListener(e, unlock, true));
    };
    events.forEach((e) => window.addEventListener(e, unlock, true));
    // Until a gesture, browsers refuse to start audio; that refusal is expected, so it is only noted.
    ctx.resume().catch((thrown: unknown) => log.debug('Audio is waiting for a user gesture', { reason: String(thrown) }));
  }

  setListener(x: number, y: number): void { this.listener.x = x; this.listener.y = y; }

  /** Where a sound at (x, y) plays: through a distance fade and pan, straight to the mix, or nowhere (out of earshot). */
  private outputFor(ctx: AudioContext, mix: GainNode, x?: number, y?: number): AudioNode | null {
    if (x === undefined || y === undefined) return mix;
    const dx = x - this.listener.x;
    const dist = Math.hypot(dx, y - this.listener.y);
    if (dist > EARSHOT) return null;
    const gain = ctx.createGain();
    gain.gain.value = 1 - dist / EARSHOT;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, dx / EARSHOT));
    gain.connect(pan);
    pan.connect(mix);
    return gain;
  }

  playSound(name: SfxName, x?: number, y?: number): void {
    this.onEffect?.(name, x, y);
    const ctx = this.context();
    const mix = this.sfxGain;
    if (!ctx || !mix || ctx.state !== 'running') return;
    try {
      const out = this.outputFor(ctx, mix, x, y);
      if (!out) return;
      if (isClip(name)) this.playClip(ctx, name, out);
      else this.synth(ctx, SYNTHS[name], out);
    } catch (thrown) {
      report(thrown, `Sound "${name}" could not be played`, 'audio');
    }
  }

  private playClip(ctx: AudioContext, name: ClipName, out: AudioNode): void {
    const options = CLIPS[name];
    const buffer = this.buffers.get(options[Math.floor(Math.random() * options.length)]);
    if (!buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(out);
    src.start();
  }

  private voice(ctx: AudioContext, v: Voice, out: AudioNode, now: number): void {
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(v.vol, now);
    gn.gain.exponentialRampToValueAtTime(SILENT, now + v.dur);
    gn.connect(out);
    if (v.kind === 'osc') {
      const o = ctx.createOscillator();
      o.type = v.wave;
      o.frequency.setValueAtTime(v.freq, now);
      o.connect(gn);
      o.start(now);
      o.stop(now + v.dur + OSC_STOP_PAD);
      return;
    }
    const buffer = ctx.createBuffer(1, ctx.sampleRate * v.dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(gn);
    src.start(now);
  }

  private synth(ctx: AudioContext, voices: readonly Voice[], out: AudioNode): void {
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.connect(out);
    for (const v of voices) this.voice(ctx, v, g, now);
    g.gain.setValueAtTime(SYNTH_GAIN, now);
    g.gain.exponentialRampToValueAtTime(SILENT, now + SYNTH_TAIL);
  }
}

export const sound = new SoundPlayer();
