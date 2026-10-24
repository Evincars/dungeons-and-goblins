/**
 * The ambient beds under the music (src/audio/SoundBank.ts AMBIENCE): looping sound of a place (a chapel, caves,
 * the catacombs) and of things nearby (torches, war drums, a draught). Each is faded toward a strength from 0 to 1
 * by systems/AmbienceSystem.ts; they are sound, so the sound volume sets how loud they are at full strength. A bed
 * loads the first time it is asked to play: one of its takes, picked at random for the game, decoded whole (Web
 * Audio) so it loops without a gap.
 */
import { MathUtils } from 'yuka';
import { Deck } from './Deck';
import { AMBIENCE, AMBIENCE_NAMES } from './SoundBank';
import type { AmbienceName } from './SoundBank';

export type { AmbienceName } from './SoundBank';

/** A volume slider's change is eased in over this long (ms). */
const VOLUME_FADE_MS = 100;

/** Tests run the game's modules under Node, which has no Web Audio. */
const hasAudio = typeof AudioContext !== 'undefined';

class AmbiencePlayer {
  private readonly decks = new Map<AmbienceName, Deck>();
  /** How strongly each bed is asked to play (0..1). */
  private readonly strength = new Map<AmbienceName, number>();
  private volume = 0;

  /** The sound volume (0..1): every bed's loudness at full strength follows it. */
  setVolume(volume: number): void {
    this.volume = volume;
    for (const name of AMBIENCE_NAMES) this.apply(name, VOLUME_FADE_MS);
  }

  /** Fades a bed toward `strength` (0 silent … 1 full) over `ms`. */
  fadeTo(name: AmbienceName, strength: number, ms: number): void {
    this.strength.set(name, strength);
    this.apply(name, ms);
  }

  /** Every bed fades out (back at the menu). */
  silence(ms: number): void {
    for (const name of AMBIENCE_NAMES) this.fadeTo(name, 0, ms);
  }

  private apply(name: AmbienceName, ms: number): void {
    const volume = (this.strength.get(name) ?? 0) * AMBIENCE[name].level * this.volume;
    // A bed never heard yet is not loaded just to be silent.
    const deck = volume > 0 ? this.deck(name) : this.decks.get(name);
    deck?.fadeTo(volume, ms);
  }

  /** A bed's player, loaded the first time it is needed (playing starts once it has decoded). */
  private deck(name: AmbienceName): Deck | null {
    if (!hasAudio) return null;
    const made = this.decks.get(name);
    if (made) return made;
    const takes = AMBIENCE[name].takes;
    const deck = new Deck([takes[MathUtils.randInt(0, takes.length - 1)]], { html5: false });
    this.decks.set(name, deck);
    return deck;
  }
}

export const ambience = new AmbiencePlayer();
