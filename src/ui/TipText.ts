import { Container } from 'pixi.js';
import { PixelLabel } from './PixelText';
import { DAMAGE_TYPES } from '../rules/DamageTypes';
import type { DamageType } from '../rules/DamageTypes';

/**
 * Text that says what matters in colour, as Baldur's Gate's tooltips do: dice and the damage they deal in the colour of
 * that damage, healing in green, saving throws in gold, distances in blue. A tooltip's description is wrapped and drawn
 * from these runs; a headline's line under it ("3d6 Acid") is one too.
 */

/** A piece of text in one colour. */
export type TipRun = { text: string; color: number };

/** The colour each kind of damage is told in (fire orange, cold pale blue, acid green…). */
export const DAMAGE_COLORS = {
  bludgeoning: 0xd6d0c4, piercing: 0xd6d0c4, slashing: 0xd6d0c4,
  acid: 0xa6e05a, cold: 0x8fd8ff, fire: 0xff8a3c, force: 0xd59cff, lightning: 0x7fb8ff,
  necrotic: 0x9fc48a, poison: 0x7ec850, psychic: 0xff8ad8, radiant: 0xffe17a, thunder: 0xb8a4ff,
} as const satisfies Record<DamageType, number>;
/** Healing, saving throws and distances, wherever a text names them. */
export const HEAL_COLOR = 0x7ddc7d;
export const SAVE_COLOR = 0xe8c66a;
export const RANGE_COLOR = 0x9cc4ff;
/** Dice that name no damage type. */
export const DICE_COLOR = 0xffc070;

/** A space between two words drawn by separate labels: the glyph gap after the first word and the space itself (PixelText). */
const WORD_SPACE = 5;
/** Two pieces of one word drawn by separate labels ("damage" lit, its comma not) stand only the glyph gap apart. */
const GLYPH_GAP = 1;
const LINE_H = 10;

const isType = (word: string): word is DamageType => DAMAGE_TYPES.some((type) => type === word);

/** What a text names that is worth seeing at a glance, and how to colour it. */
const MARKS: readonly { pattern: RegExp; color: (match: RegExpExecArray) => number }[] = [
  // "regain 1d6 hit points": healing, dice and all, before the dice alone would take them.
  { pattern: /\b(?:regains?|heals?|restores?)\b[^.,;]*?\bhit points\b/gi, color: () => HEAL_COLOR },
  // "3d6 acid damage", "1d8 + 4 fire", "2d10": dice, with the damage they deal.
  {
    pattern: /\b\d+d\d+(?:\s*[+-]\s*\d+)?(?:\s+(acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder|bludgeoning|piercing|slashing))?(?:\s+damage)?/gi,
    color: (m) => { const type = (m[1] ?? '').toLowerCase(); return isType(type) ? DAMAGE_COLORS[type] : DICE_COLOR; },
  },
  { pattern: /\b(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throws?\b/g, color: () => SAVE_COLOR },
  { pattern: /\b\d+(?:-foot|\s+(?:feet|foot|ft))\b/g, color: () => RANGE_COLOR },
];

type Hit = { start: number; end: number; color: number };

/** Where a mark matches the text, kept only where no earlier mark has matched already. */
function addHits(content: string, mark: (typeof MARKS)[number], hits: Hit[]): void {
  for (const m of content.matchAll(mark.pattern)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (!hits.some((hit) => start < hit.end && end > hit.start)) hits.push({ start, end, color: mark.color(m) });
  }
}

/** Splits a text into runs: what MARKS finds in its colour, the rest in `plain`. */
export function markRuns(content: string, plain: number): TipRun[] {
  const hits: Hit[] = [];
  for (const mark of MARKS) addHits(content, mark, hits);
  hits.sort((a, b) => a.start - b.start);
  const runs: TipRun[] = [];
  let at = 0;
  for (const hit of hits) {
    if (hit.start > at) runs.push({ text: content.slice(at, hit.start), color: plain });
    runs.push({ text: content.slice(hit.start, hit.end), color: hit.color });
    at = hit.end;
  }
  if (at < content.length) runs.push({ text: content.slice(at), color: plain });
  return runs;
}

/**
 * One word to lay out, its colour, whether a new paragraph starts before it, and whether it carries on the word before
 * with no space between (a lit word and its comma).
 */
type Word = { text: string; color: number; breakBefore: boolean; join: boolean };

/** Spaces, line breaks and words, in order. */
const TOKENS = /(\n)|( +)|([^ \n]+)/g;

/** Where the words of a text stand so far: the words, and whether a new paragraph or a space comes before the next one. */
type WordState = { words: Word[]; paragraph: boolean; spaced: boolean };

function wordsOf(runs: readonly TipRun[]): Word[] {
  const state: WordState = { words: [], paragraph: false, spaced: true };
  for (const run of runs) addWords(run, state);
  return state.words;
}

/** The words of one run, each in its colour. */
function addWords(run: TipRun, state: WordState): void {
  for (const [, newline, space, text] of run.text.matchAll(TOKENS)) {
    if (newline) state.paragraph = true;
    if (newline || space) state.spaced = true;
    if (!text) continue;
    state.words.push({ text, color: run.color, breakBefore: state.paragraph, join: !state.spaced && !state.paragraph && state.words.length > 0 });
    state.paragraph = false;
    state.spaced = false;
  }
}

/** A line of words, each with its colour. */
export type RichLine = Word[];

/** Breaks the runs into lines no wider than `width` (a word longer than that keeps a line of its own). */
export function wrapRuns(runs: readonly TipRun[], width: number): RichLine[] {
  const measure = new PixelLabel('');
  const lines: RichLine[] = [];
  let line: RichLine = [];
  let used = 0;
  for (const word of wordsOf(runs)) {
    measure.text = word.text;
    const w = measure.textWidth;
    const gap = word.join ? GLYPH_GAP : WORD_SPACE;
    const fits = line.length === 0 || word.join || used + gap + w <= width;
    if ((word.breakBefore || !fits) && line.length) {
      lines.push(line);
      line = [];
      used = 0;
    }
    used += (line.length ? gap : 0) + w;
    line.push(word);
  }
  if (line.length) lines.push(line);
  measure.destroy();
  return lines;
}

/** The words as one label's text: a space between them, none before a word that carries on the one before. */
const joined = (words: readonly { text: string; join?: boolean }[]): string =>
  words.map((w, i) => (i > 0 && !w.join ? ` ${w.text}` : w.text)).join('');

/** Draws one line of words: words of one colour in a row share a label. Returns its width. */
export function drawRunLine(into: Container, words: readonly { text: string; color: number; join?: boolean }[], x: number, y: number, scale = 1): number {
  let at = x;
  let end = x;
  let start = 0;
  for (let i = 1; i <= words.length; i++) {
    if (i < words.length && words[i].color === words[start].color) continue;
    const label = new PixelLabel(joined(words.slice(start, i)), { color: words[start].color, shadow: true, scale });
    label.position.set(at, y);
    into.addChild(label);
    end = at + label.textWidth;
    at = end + (words[i]?.join ? GLYPH_GAP : WORD_SPACE) * scale;
    start = i;
  }
  return Math.max(0, end - x);
}

/** Draws wrapped lines one under another from (x, y). Returns the widest line's width. */
export function drawRichLines(into: Container, lines: readonly RichLine[], x: number, y: number): number {
  let widest = 0;
  lines.forEach((line, i) => { widest = Math.max(widest, drawRunLine(into, line, x, y + i * LINE_H)); });
  return widest;
}
