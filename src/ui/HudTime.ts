import { TICKS_PER_SECOND } from '../rules/Spells';

/** One minute, in seconds: a time this long or longer is told in minutes and seconds. */
const MINUTE = 60;

/** Seconds to a tenth, as the HUD counts them ("4.5s"); a minute or more as minutes and seconds ("59:12"). */
export function durationOf(ticks: number): string {
  const seconds = ticks / TICKS_PER_SECOND;
  if (seconds < MINUTE) return `${(Math.ceil(seconds * 10) / 10).toFixed(1)}s`;
  const whole = Math.ceil(seconds);
  return `${Math.floor(whole / MINUTE)}:${String(whole % MINUTE).padStart(2, '0')}`;
}
