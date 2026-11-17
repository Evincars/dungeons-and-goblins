import { Container, Graphics, Sprite } from 'pixi.js';
import { lazyTexture, requestArt } from '../assets/LazyArt';
import { reportRejection } from '../core/errors';
import { isAltHeld } from '../systems/InputSystem';
import { text } from '../core/texts';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

/** Space inside the tooltip's frame, the header's height, a line's height and the gap before the details. */
const PAD = 8;
const HEADER_H = 15;
const LINE_H = 10;
const DETAIL_GAP = 4;
/** The description wraps to this width. */
const WRAP_W = 150;
/** A long text (`wide`) starts this wide, and widens by this much until it fits the area it is shown in. */
const WIDE_W = 260;
const WIDEN_STEP = 40;
/** The tooltip sits this far from the pointer. */
const OFFSET = 10;
const BG_ALPHA = 0.94;
/** The worked-out numbers under the description (how an AC or a damage roll adds up). */
const DETAIL_COLOR = 0x8fd18f;
/** The "hold Alt" line at the bottom of a tooltip with more to tell: the gap above it and its colour. */
const HINT_GAP = 4;
const HINT_COLOR = 0x9cc4ff;
/** A topic's picture (a spell's icon) sits under the header on the left, as large as an item's in its tooltip, this far from the text. */
const PICTURE = 64;
const PICTURE_GAP = 6;

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
 * the tooltip stays short and says to hold Alt, and shows the whole story while Alt is held. `icon`: the texture key of
 * a picture shown beside the text (a spell's icon).
 */
export type TipTopic = { title: string; body: string; detail?: readonly TipDetail[]; wide?: boolean; more?: TipTopic; icon?: string };

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
    return [topic.title, topic.body, ...details, topic.more ? '+' : '', this.full ? 'full' : ''].join('\n');
  }

  /** Lays the tooltip out for `topic` (its whole story while Alt is held) unless it already shows it; returns whether it was new. */
  private prepare(topic: TipTopic, bounds: Bounds): boolean {
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

  /** The lines of a text: at the usual width, or for a `wide` one, widened until the whole tooltip fits `bounds`. */
  private wrap(topic: TipTopic, bounds: { w: number; h: number }): { lines: string[]; details: DetailLine[] } {
    let width = topic.wide ? WIDE_W : WRAP_W;
    for (;;) {
      const lines = wrapLines(topic.body, width);
      const details = wrapDetails(topic.detail ?? [], width);
      const height = 2 * PAD + HEADER_H + (lines.length + details.length) * LINE_H + (details.length ? DETAIL_GAP : 0);
      if (!topic.wide || height <= bounds.h || width + 2 * PAD >= bounds.w) return { lines, details };
      width += WIDEN_STEP;
    }
  }

  private layout(topic: TipTopic, bounds: { w: number; h: number }): void {
    for (const child of this.view.removeChildren()) child.destroy({ children: true });
    const header = new PixelLabel(topic.title, { color: THEME.title, shadow: true });
    header.position.set(PAD, PAD);
    // With a picture, the text stands to its right and the tooltip is at least as tall as the picture.
    const left = topic.icon ? PAD + PICTURE + PICTURE_GAP : PAD;
    const { lines, details } = this.wrap(topic, bounds);
    const body = new PixelLabel(lines.join('\n'), { color: THEME.text, shadow: true });
    body.position.set(left, PAD + HEADER_H);
    const detail = detailLabels(details);
    detail.position.set(left, PAD + HEADER_H + lines.length * LINE_H + DETAIL_GAP);
    const linesH = lines.length * LINE_H + (details.length ? DETAIL_GAP + details.length * LINE_H : 0);
    const textH = 2 * PAD + HEADER_H + Math.max(linesH, topic.icon ? PICTURE : 0);
    // A short tooltip with more to tell says how to see it.
    const hint = topic.more ? new PixelLabel(text('spell.tip.more'), { color: HINT_COLOR, shadow: true }) : null;
    hint?.position.set(PAD, textH - PAD + HINT_GAP);
    const w = Math.max(header.textWidth + PAD, left + Math.max(body.textWidth, detail.width), PAD + (hint?.textWidth ?? 0)) + PAD;
    const h = hint ? textH + HINT_GAP + LINE_H : textH;
    const frame = new Graphics()
      .rect(0, 0, w, h).fill({ color: THEME.panel, alpha: BG_ALPHA })
      .stroke({ color: THEME.panelBorder, width: 1, alignment: 1 });
    this.view.addChild(frame, header, body, detail);
    if (hint) this.view.addChild(hint);
    if (topic.icon) this.addPicture(topic.icon);
  }

  /** The topic's picture under the header, fitted to PICTURE once it has loaded. */
  private addPicture(key: string): void {
    const picture = new Sprite();
    picture.anchor.set(0.5);
    picture.position.set(PAD + PICTURE / 2, PAD + HEADER_H + PICTURE / 2);
    this.view.addChild(picture);
    const show = (): void => {
      if (picture.destroyed) return;
      picture.texture = lazyTexture(key);
      picture.scale.set(PICTURE / Math.max(1, picture.texture.width, picture.texture.height));
    };
    reportRejection(requestArt(key).then(show), `Tooltip picture ${key} did not load`, 'render');
  }
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
