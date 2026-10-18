/** Minimal web-audio sound player for dungeon ambience and effects. */

const EARSHOT = 320;

export type SfxName =
  | 'sword_hit' | 'sword_swing' | 'sword_miss'
  | 'death' | 'enemy_death' | 'boss_death'
  | 'step' | 'step2'
  | 'coin' | 'gem' | 'potion'
  | 'level_up' | 'hurt' | 'chest_open' | 'door_open';

class SoundPlayer {
  private ctx: AudioContext | null = null;
  private sfxGain!: GainNode;
  private listener = { x: 0, y: 0 };

  sfxVolume = 0.5;
  muteInterface = false;

  /** Generate a tone programmatically — no external audio files needed. */
  private context(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  unlock(): void { this.context(); }

  setListener(x: number, y: number): void { this.listener.x = x; this.listener.y = y; }

  playSound(name: SfxName, x?: number, y?: number): void {
    try {
      const ctx = this.context();
      if (ctx.state === 'suspended') return;
      if (x !== undefined && y !== undefined) {
        const dist = Math.hypot(x - this.listener.x, y - this.listener.y);
        if (dist > EARSHOT) return;
      }
      this.synth(ctx, name);
    } catch { /* audio blocked */ }
  }

  private synth(ctx: AudioContext, name: SfxName): void {
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.connect(this.sfxGain);

    const osc = (freq: number, type: OscillatorType, dur: number, vol: number, decay = 0.8) => {
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
      case 'sword_hit':
        buf(0.06, 0.5);
        osc(180, 'square', 0.12, 0.3);
        osc(90, 'sawtooth', 0.1, 0.2);
        break;
      case 'sword_miss':
        buf(0.05, 0.15);
        break;
      case 'death':
        osc(200, 'sawtooth', 0.5, 0.4);
        osc(100, 'sine', 0.6, 0.3);
        buf(0.3, 0.3);
        break;
      case 'enemy_death':
        osc(300, 'sawtooth', 0.2, 0.3);
        buf(0.15, 0.25);
        break;
      case 'boss_death':
        osc(80, 'sawtooth', 1.0, 0.5);
        osc(160, 'square', 0.8, 0.3);
        buf(0.5, 0.4);
        break;
      case 'step': case 'step2':
        buf(0.04, 0.15);
        osc(60, 'sine', 0.04, 0.2);
        break;
      case 'coin':
        osc(880, 'sine', 0.1, 0.25);
        osc(1320, 'sine', 0.08, 0.2);
        break;
      case 'gem':
        osc(660, 'sine', 0.12, 0.3);
        osc(990, 'sine', 0.1, 0.2);
        osc(1320, 'sine', 0.08, 0.15);
        break;
      case 'potion':
        osc(440, 'sine', 0.15, 0.25);
        osc(550, 'sine', 0.1, 0.2);
        buf(0.1, 0.1);
        break;
      case 'level_up':
        osc(440, 'sine', 0.1, 0.3);
        osc(550, 'sine', 0.1, 0.3);
        osc(660, 'sine', 0.15, 0.3);
        osc(880, 'sine', 0.2, 0.3);
        break;
      case 'hurt':
        osc(150, 'square', 0.15, 0.4);
        buf(0.1, 0.2);
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

  startBackgroundMusic(): void { /* ambient generated tones could go here */ }
  stopBackgroundMusic(): void {}
}

export const sound = new SoundPlayer();
