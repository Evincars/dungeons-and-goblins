import { Container, Graphics, Sprite } from 'pixi.js';
import { lazyTexture, requestArt } from '../assets/LazyArt';
import { reportRejection } from '../core/errors';
import { isAltHeld } from '../systems/InputSystem';
import { text } from '../core/texts';
import { PixelLabel } from './PixelText';
import { drawRichLines, drawRunLine, markRuns, wrapRuns } from './TipText';
import type { TipRun } from './TipText';
import { THEME } from './Theme';

/** Space inside the tooltip's frame, the title's height, a line's height and the gap before the details. */
const PAD = 8;
const HEADER_H = 11;
const LINE_H = 10;
const DETAIL_GAP = 4;
/** The description wraps to this width. */
const WRAP_W = 170;
/** A long text (`wide`) starts this wide, and widens by this much until it fits the area it is shown in. */
const WIDE_W = 260;
const WIDEN_STEP = 40;
/** The tooltip sits this far from the pointer. */
const OFFSET = 10;
const BG_ALPHA = 0.96;
/** The frame: a dark face, a steel rim, a gold line along its top, and thin rules between its parts. */
const FACE = 0x0d0f14;
const TOP_LINE = 0x8a7442;
const RULE = 0x2a303a;
const RULE_GAP = 4;
/** The worked-out numbers under the description (how an AC or a damage roll adds up). */
const DETAIL_COLOR = 0x8fd18f;
/** The "hold Alt" line at the bottom of a tooltip with more to tell: the gap above it and its colour. */
const HINT_GAP = 4;
const HINT_COLOR = 0x9cc4ff;
/** A topic's picture (a spell's icon) stands in the top right corner, beside the title and the headline. */
const PICTURE = 40;
const PICTURE_GAP = 6;
/** The headline: its big figure is drawn twice the size, the line under it at the usual size. */
const HEADLINE_SCALE = 2;
const HEADLINE_H = 18;
/** The chips at the foot: each a framed word, this tall, this far apart and padded inside. */
const CHIP_H = 13;
const CHIP_GAP = 4;
const CHIP_PAD = 4;
const CHIP_FACE = 0x161a22;
const CHIP_RIM_ALPHA = 0.55;
/** A text longer than this, in a topic with no `more` of its own, is cut short; Alt shows all of it. */
const AUTO_SHORT_CHARS = 170;
/** A short text is cut to about this many characters (at a word), ending in "...". */
const SHORT_TEXT_CHARS = 110;
const ELLIPSIS = '...';

/** The start of a text, cut at a word to about `max` characters and ended with "..." (a short one whole). */
export function shortText(full: string, max = SHORT_TEXT_CHARS): string {
  const flat = full.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - ELLIPSIS.length);
  const word = cut.lastIndexOf(' ');
  return `${(word > 0 ? cut.slice(0, word) : cut).replace(/[\s,.;:]+$/, '')}${ELLIPSIS}`;
}

/** Adds one paragraph to `lines`, broken into lines no wider than `maxWidth` (a single longer word keeps its own line). */
function wrapParagraph(paragraph: string, maxWidth: number, measure: PixelLabel, lines: string[]): void {
  let line = '';
  for (const word of paragraph.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    measure.text = candidate;
    if (line && measure.textWidth > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  lines.push(line);
}

/** Breaks `content` into lines no wider than `maxWidth`; each `\n` starts a new paragraph. */
export function wrapLines(content: string, maxWidth: number): string[] {
  const measure = new PixelLabel('');
  const lines: string[] = [];
  for (const paragraph of content.split('\n')) wrapParagraph(paragraph, maxWidth, measure, lines);
  measure.destroy();
  return lines;
}

/**
 * What a tooltip tells: a header, a description, and optionally the numbers behind a value. `more`: the whole story;
 * the tooltip stays short and says to hold Alt, and shows the whole story while Alt is held (a long description with no
 * `more` of its own is cut short the same way). `icon`: the texture key of a picture shown in the corner (a spell's icon).
 * As Baldur's Gate lays its tooltips out: `subtitle`, what kind of thing it is, quietly under the title; `headline`, the
 * figure that matters most, large ("3-18 Damage"), with a line under it ("3d6 Acid"); `chips`, short facts framed at the
 * foot ("60 ft", "DEX save").
 */
export type TipTopic = {
  title: string; body: string; detail?: readonly TipDetail[]; wide?: boolean; more?: TipTopic; icon?: string;
  subtitle?: string; headline?: TipHeadline; chips?: readonly TipRun[];
};

/** The figure that matters most, and the line under it. */
export type TipHeadline = { text: string; color: number; under?: readonly TipRun[] };

/** A line of the details: in the usual green, or in a colour of its own (a heading, a requirement met or missed). */
export type TipDetail = string | { text: string; color: number };

const detailText = (line: TipDetail): string => (typeof line === 'string' ? line : line.text);
const detailColor = (line: TipDetail): number => (typeof line === 'string' ? DETAIL_COLOR : line.color);

/** One wrapped line of the details, with its colour. */
type DetailLine = { text: string; color: number };

type Bounds = { w: number; h: number };
type Anchor = { x: number; y: number; w: number; h: number };
/**
 * Where a tooltip shown for a box sits: beside it (to its right, or its left where there is no room), above it, or clear
 * of it (under it, or over it where there is no room below), never covering it.
 */
export type TipSide = 'beside' | 'above' | 'clear';

/** The whole story, laid out wide (made once per topic). */
const wideStories = new WeakMap<TipTopic, TipTopic>();

function wideStory(more: TipTopic): TipTopic {
  let wide = wideStories.get(more);
  if (!wide) wideStories.set(more, (wide = { ...more, wide: true }));
  return wide;
}

/** A topic whose description is too long to read at a glance, cut short with the whole of it for Alt (made once per topic). */
const shortened = new WeakMap<TipTopic, TipTopic>();

function readable(topic: TipTopic): TipTopic {
  if (topic.more || topic.body.length <= AUTO_SHORT_CHARS) return topic;
  let short = shortened.get(topic);
  if (!short) shortened.set(topic, (short = { ...topic, body: shortText(topic.body, AUTO_SHORT_CHARS), more: topic }));
  return short;
}

/**
 * A tooltip for a term on the character sheet (a stat, Armor Class, hit points…) or a spell: its full name as the
 * header, what it does underneath, then how the current value adds up. It keeps itself inside the area it is given
 * and never takes the pointer, so it always tells about whatever is under it. One with more to tell says so; holding
 * Alt shows all of it.
 */
export class InfoTooltip {
  readonly view = new Container();
  private shown: string | null = null;
  /** What was asked for last and where, so holding or letting go of Alt can lay it out again in place. */
  private topic: TipTopic | null = null;
  private bounds: Bounds = { w: 0, h: 0 };
  private pointer = { x: 0, y: 0 };
  private anchor: Anchor | null = null;
  private side: TipSide = 'beside';
  /** Whether the whole story is showing. */
  private full = false;

  constructor() {
    this.view.visible = false;
    this.view.eventMode = 'none';
  }

  private keyOf(topic: TipTopic): string {
    const details = (topic.detail ?? []).map((line) => `${detailColor(line)}:${detailText(line)}`);
    const chips = (topic.chips ?? []).map((chip) => chip.text);
    return [topic.title, topic.subtitle ?? '', topic.headline?.text ?? '', topic.body, ...details, ...chips, topic.more ? '+' : '', this.full ? 'full' : ''].join('\n');
  }

  /** Lays the tooltip out for `topic` (its whole story while Alt is held) unless it already shows it; returns whether it was new. */
  private prepare(asked: TipTopic, bounds: Bounds): boolean {
    const topic = readable(asked);
    this.topic = topic;
    this.bounds = bounds;
    this.full = !!topic.more && isAltHeld();
    const key = this.keyOf(topic);
    if (this.shown === key) return false;
    this.layout(this.full && topic.more ? wideStory(topic.more) : topic, bounds);
    this.shown = key;
    return true;
  }

  /** Shows `topic` near (x, y), kept inside a `bounds`-sized area starting at 0, 0. */
  show(topic: TipTopic, x: number, y: number, bounds: Bounds): void {
    this.anchor = null;
    this.pointer.x = x;
    this.pointer.y = y;
    this.prepare(topic, bounds);
    this.place(x + OFFSET, y + OFFSET, bounds);
  }

  /** Shows `topic` for `anchor` (the box it tells about), touching it on the given side. */
  showAt(topic: TipTopic, anchor: Anchor, bounds: Bounds, side: TipSide = 'beside'): void {
    this.anchor = anchor;
    this.side = side;
    if (!this.prepare(topic, bounds) && this.view.visible) return;
    this.placeBy(anchor, side, bounds);
  }

  /** Alt held or let go while a tooltip with more to tell is up: it is laid out again, short or whole. Call every update. */
  refresh(): void {
    const topic = this.topic;
    if (!topic?.more || !this.view.visible || isAltHeld() === this.full) return;
    if (this.anchor) this.showAt(topic, this.anchor, this.bounds, this.side);
    else this.show(topic, this.pointer.x, this.pointer.y, this.bounds);
  }

  private placeBy(anchor: Anchor, side: TipSide, bounds: Bounds): void {
    const w = this.view.width;
    const h = this.view.height;
    if (side === 'above') {
      this.place(anchor.x, anchor.y - h, bounds);
      return;
    }
    if (side === 'clear') {
      const below = anchor.y + anchor.h;
      this.place(anchor.x, below + h <= bounds.h ? below : anchor.y - h, bounds);
      return;
    }
    const right = anchor.x + anchor.w;
    this.place(right + w <= bounds.w ? right : anchor.x - w, anchor.y, bounds);
  }

  private place(x: number, y: number, bounds: Bounds): void {
    this.view.x = Math.round(Math.max(0, Math.min(x, bounds.w - this.view.width)));
    this.view.y = Math.round(Math.max(0, Math.min(y, bounds.h - this.view.height)));
    this.view.visible = true;
  }

  hide(): void {
    this.view.visible = false;
    this.shown = null;
    this.topic = null;
    this.anchor = null;
  }

  /** The text's width: the usual one, or for a `wide` topic, widened until the whole tooltip fits `bounds`. */
  private widthFor(topic: TipTopic, bounds: Bounds): number {
    let width = topic.wide ? WIDE_W : WRAP_W;
    while (topic.wide && measureHeight(topic, width) > bounds.h && width + 2 * PAD < bounds.w) width += WIDEN_STEP;
    return width;
  }

  private layout(topic: TipTopic, bounds: Bounds): void {
    for (const child of this.view.removeChildren()) child.destroy({ children: true });
    const width = this.widthFor(topic, bounds);
    const content = new Container();
    const top = drawTop(content, topic);
    let y = top.y;
    const lines = wrapRuns(markRuns(topic.body, THEME.text), width);
    const bodyW = drawRichLines(content, lines, PAD, y);
    y += lines.length * LINE_H;
    const chips = drawChips(content, topic.chips ?? [], width, y);
    y = chips.y;
    const details = wrapDetails(topic.detail ?? [], width);
    let detailW = 0;
    if (details.length) {
      const box = detailLabels(details);
      box.position.set(PAD, y + DETAIL_GAP);
      content.addChild(box);
      detailW = box.width;
      y += DETAIL_GAP + details.length * LINE_H;
    }
    // A short tooltip with more to tell says how to see it.
    const hint = topic.more ? new PixelLabel(text('spell.tip.more'), { color: HINT_COLOR, shadow: true }) : null;
    if (hint) {
      hint.position.set(PAD, y + HINT_GAP);
      content.addChild(hint);
      y += HINT_GAP + LINE_H;
    }
    const frameW = Math.max(top.w, bodyW, chips.w, detailW, hint?.textWidth ?? 0) + 2 * PAD;
    const h = y + PAD;
    this.view.addChild(drawFrame(frameW, h, top.rule), content);
    if (topic.icon) this.addPicture(topic.icon, frameW);
  }

  /** The topic's picture in the top right corner, fitted to PICTURE once it has loaded. */
  private addPicture(key: string, frameW: number): void {
    const picture = new Sprite();
    picture.anchor.set(0.5);
    picture.position.set(frameW - PAD - PICTURE / 2, PAD + PICTURE / 2);
    this.view.addChild(picture);
    const show = (): void => {
      if (picture.destroyed) return;
      picture.texture = lazyTexture(key);
      picture.scale.set(PICTURE / Math.max(1, picture.texture.width, picture.texture.height));
    };
    reportRejection(requestArt(key).then(show), `Tooltip picture ${key} did not load`, 'render');
  }
}

/** The height a topic's tooltip comes to at this width (to widen a long one until it fits). */
function measureHeight(topic: TipTopic, width: number): number {
  const lines = wrapRuns(markRuns(topic.body, THEME.text), width).length;
  const details = wrapDetails(topic.detail ?? [], width).length;
  const chips = topic.chips?.length ? CHIP_H + CHIP_GAP : 0;
  return topHeight(topic) + lines * LINE_H + chips + (details ? DETAIL_GAP + details * LINE_H : 0) + (topic.more ? HINT_GAP + LINE_H : 0) + PAD;
}

/** How tall the top is: the title, the subtitle, the headline, beside the picture; then the rule under them. */
function topHeight(topic: TipTopic): number {
  let y = PAD + HEADER_H;
  if (topic.subtitle) y += LINE_H;
  if (topic.headline) y += 2 + HEADLINE_H + (topic.headline.under?.length ? LINE_H : 0);
  if (topic.icon) y = Math.max(y, PAD + PICTURE);
  return y + 2 * RULE_GAP + 1;
}

/**
 * The top of the tooltip: the title in gold, what kind of thing it is under it, and the headline; the picture's room kept
 * on the right. Returns the y under the rule that ends it, the rule's own y and the widest line.
 */
function drawTop(into: Container, topic: TipTopic): { y: number; rule: number; w: number } {
  const room = topic.icon ? PICTURE + PICTURE_GAP : 0;
  const header = new PixelLabel(topic.title, { color: THEME.title, shadow: true });
  header.position.set(PAD, PAD);
  into.addChild(header);
  let y = PAD + HEADER_H;
  let w = header.textWidth;
  if (topic.subtitle) {
    const sub = new PixelLabel(topic.subtitle, { color: THEME.muted, shadow: true });
    sub.position.set(PAD, y);
    into.addChild(sub);
    w = Math.max(w, sub.textWidth);
    y += LINE_H;
  }
  if (topic.headline) {
    const big = new PixelLabel(topic.headline.text, { color: topic.headline.color, shadow: true, scale: HEADLINE_SCALE });
    big.position.set(PAD, y + 2);
    into.addChild(big);
    w = Math.max(w, big.textWidth);
    y += 2 + HEADLINE_H;
    if (topic.headline.under?.length) {
      w = Math.max(w, drawRunLine(into, topic.headline.under, PAD, y));
      y += LINE_H;
    }
  }
  if (topic.icon) y = Math.max(y, PAD + PICTURE);
  const rule = y + RULE_GAP;
  return { y: rule + 1 + RULE_GAP, rule, w: w + room };
}

/** The short facts at the foot, each framed in its colour, wrapping to `width`. Returns the y under them and the widest row. */
function drawChips(into: Container, chips: readonly TipRun[], width: number, top: number): { y: number; w: number } {
  if (!chips.length) return { y: top, w: 0 };
  let x = 0;
  let y = top + CHIP_GAP;
  let widest = 0;
  for (const chip of chips) {
    const label = new PixelLabel(chip.text, { color: chip.color, shadow: true });
    const w = label.textWidth + 2 * CHIP_PAD;
    if (x > 0 && x + w > width) {
      x = 0;
      y += CHIP_H + CHIP_GAP;
    }
    const box = new Graphics().rect(PAD + x, y, w, CHIP_H).fill({ color: CHIP_FACE }).stroke({ color: chip.color, alpha: CHIP_RIM_ALPHA, width: 1, alignment: 1 });
    label.position.set(PAD + x + CHIP_PAD, y + 2);
    into.addChild(box, label);
    x += w + CHIP_GAP;
    widest = Math.max(widest, x - CHIP_GAP);
  }
  return { y: y + CHIP_H, w: widest };
}

/** The frame: a dark face with a steel rim, a gold line along the top, and a rule under the title and headline. */
function drawFrame(w: number, h: number, rule: number): Graphics {
  return new Graphics()
    .rect(0, 0, w, h).fill({ color: FACE, alpha: BG_ALPHA })
    .stroke({ color: THEME.panelBorder, width: 1, alignment: 1 })
    .rect(0, 0, w, 1).fill({ color: TOP_LINE })
    .rect(PAD, rule, w - 2 * PAD, 1).fill({ color: RULE });
}

/** The details broken into lines no wider than `width`, each keeping its entry's colour. */
function wrapDetails(detail: readonly TipDetail[], width: number): DetailLine[] {
  const out: DetailLine[] = [];
  for (const entry of detail) {
    const color = detailColor(entry);
    for (const line of wrapLines(detailText(entry), width)) out.push({ text: line, color });
  }
  return out;
}

/** The details drawn line under line, each in its colour (lines of one colour in a row share a label). */
function detailLabels(details: readonly DetailLine[]): Container {
  const box = new Container();
  let start = 0;
  for (let i = 1; i <= details.length; i++) {
    if (i < details.length && details[i].color === details[start].color) continue;
    const run = new PixelLabel(details.slice(start, i).map((d) => d.text).join('\n'), { color: details[start].color, shadow: true });
    run.position.set(0, start * LINE_H);
    box.addChild(run);
    start = i;
  }
  return box;
}

export type { TipRun };
