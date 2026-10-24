import { text } from '../core/texts';

/**
 * The loading screen in index.html (the menu art, a bar and how much is in, as a percentage): up from the moment
 * the page opens, kept current here while the game's art and sounds download, and faded away once they are in.
 */

/** How long the screen takes to fade away (ms), as in its CSS transition. */
const FADE_MS = 700;

/** How many files of one kind are in so far, out of how many. */
type Part = { done: number; total: number };

const parts = new Map<string, Part>();
/** The percentage shown; it never goes back when a kind of file reports its total late. */
let shown = 0;

/** Something that reports how many of one kind of file are in (`done`) out of how many (`total`). */
export type ProgressReport = (done: number, total: number) => void;

/** The report for one kind of file (art, sounds, ambience): every part counts by its number of files. */
export function loadingPart(name: string): ProgressReport {
  return (done, total) => {
    parts.set(name, { done, total });
    render();
  };
}

function render(): void {
  let done = 0;
  let total = 0;
  for (const part of parts.values()) {
    done += part.done;
    total += part.total;
  }
  shown = Math.max(shown, total > 0 ? Math.floor((100 * done) / total) : 0);
  const fill = document.getElementById('loading-fill');
  const percent = document.getElementById('loading-percent');
  const label = document.getElementById('loading-label');
  if (fill) fill.style.width = `${shown}%`;
  if (percent) percent.textContent = `${shown}%`;
  if (label) label.textContent = text('loading.title');
}

/** Everything is in: the screen shows 100%, then fades away and is removed. */
export function hideLoadingScreen(): void {
  const screen = document.getElementById('loading');
  if (!screen) return;
  shown = 100;
  render();
  screen.classList.add('done');
  setTimeout(() => screen.remove(), FADE_MS);
}
