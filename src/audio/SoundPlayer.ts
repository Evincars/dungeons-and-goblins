/**
 * Web Audio sound effects. Most clips are Catacomb Snatch's WAVs (footsteps,
 * coins, hits, deaths, falling); a few effects with no counterpart there are
 * synthesised.
 */
import { assetUrl } from '../assets/assetUrl';

const EARSHOT = 320;

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

class SoundPlayer {
  private ctx: AudioContext | null = null;
  private sfxGain!: GainNode;
  private listener = { x: 0, y: 0 };
  private buffers = new Map<string, AudioBuffer>();

  sfxVolume = 0.6;
  muteInterface = false;

  private context(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /** Decodes every clip up front; safe before any user gesture. */
  async load(): Promise<void> {
    const ctx = this.context();
    const paths = [...new Set(Object.values(CLIPS).flat())];
    await Promise.all(paths.map(async (path) => {
      try {
        const res = await fetch(assetUrl(path));
        if (res.ok) this.buffers.set(path, await ctx.decodeAudioData(await res.arrayBuffer()));
      } catch {
        // One unplayable clip must not break the game.
      }
    }));
  }

  /** Browsers start audio suspended; resume it on the first key press or click. */
  autoStart(): void {
    const ctx = this.context();
    const events = ['pointerdown', 'keydown', 'touchend'] as const;
    const unlock = () => {
      void ctx.resume();
      if (ctx.state === 'running') events.forEach((e) => window.removeEventListener(e, unlock, true));
    };
    events.forEach((e) => window.addEventListener(e, unlock, true));
    void ctx.resume().catch(() => {});
  }

  setListener(x: number, y: number): void { this.listener.x = x; this.listener.y = y; }

  playSound(name: SfxName, x?: number, y?: number): void {
    try {
      const ctx = this.context();
      if (ctx.state !== 'running') return;
      let out: AudioNode = this.sfxGain;
      if (x !== undefined && y !== undefined) {
        const dx = x - this.listener.x;
        const dy = y - this.listener.y;
        const dist = Math.hypot(dx, dy);
        if (dist > EARSHOT) return;
        const gain = ctx.createGain();
        gain.gain.value = 1 - dist / EARSHOT;
        const pan = ctx.createStereoPanner();
        pan.pan.value = Math.max(-1, Math.min(1, dx / EARSHOT));
        gain.connect(pan);
        pan.connect(this.sfxGain);
        out = gain;
      }
      if (name in CLIPS) {
        const options = CLIPS[name as ClipName];
        const buffer = this.buffers.get(options[Math.floor(Math.random() * options.length)]);
        if (!buffer) return;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(out);
        src.start();
      } else {
        this.synth(ctx, name as SynthName, out);
      }
    } catch { /* audio blocked */ }
  }

  private synth(ctx: AudioContext, name: SynthName, out: AudioNode): void {
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.connect(out);

    const osc = (freq: number, type: OscillatorType, dur: number, vol: number) => {
      const o = ctx.createOscillator();
      const gn = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, now);
      gn.gain.setValueAtTime(vol, now);
      gn.gain.exponentialRampToValueAtTime(0.001, now + dur);
      o.connect(gn); gn.connect(g);
      o.start(now); o.stop(now + dur + 0.05);
    };

    const buf = (dur: number, vol: number) => {
      const buf2 = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buf2.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = ctx.createBufferSource();
      const gn = ctx.createGain();
      src.buffer = buf2;
      gn.gain.setValueAtTime(vol, now);
      gn.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(gn); gn.connect(g);
      src.start(now);
    };

    switch (name) {
      case 'sword_swing':
        buf(0.08, 0.3);
        osc(400, 'sawtooth', 0.07, 0.2);
        break;
      case 'sword_miss':
        buf(0.05, 0.15);
        break;
      case 'boss_death':
        osc(80, 'sawtooth', 1.0, 0.5);
        osc(160, 'square', 0.8, 0.3);
        buf(0.5, 0.4);
        break;
      case 'potion':
        osc(440, 'sine', 0.15, 0.25);
        osc(550, 'sine', 0.1, 0.2);
        buf(0.1, 0.1);
        break;
      case 'spell':
        osc(520, 'triangle', 0.25, 0.25);
        osc(780, 'sine', 0.2, 0.15);
        buf(0.12, 0.08);
        break;
      case 'chest_open':
        osc(220, 'sine', 0.2, 0.2);
        osc(330, 'sine', 0.15, 0.25);
        osc(440, 'sine', 0.1, 0.3);
        break;
      case 'door_open':
        buf(0.2, 0.3);
        osc(100, 'sawtooth', 0.3, 0.2);
        break;
    }

    g.gain.setValueAtTime(0.8, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
  }
}

export const sound = new SoundPlayer();
