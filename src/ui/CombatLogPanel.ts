import { Container, Graphics, Rectangle } from 'pixi.js';
import type { FederatedPointerEvent, FederatedWheelEvent } from 'pixi.js';
import { isMobType } from '../world';
import type { CombatLogEntry } from '../world';
import { GAME_HEIGHT, GAME_WIDTH } from '../render/Camera';
import { claimPointer } from '../systems/InputSystem';
import { currentLog } from '../systems/CombatLogSystem';
import { text } from '../core/texts';
import { spellName } from '../rules/Names';
import { PixelLabel, measureText } from './PixelText';
import { COMBAT_LOG_SIZES, saveSettings, settings } from '../game/Settings';
import { THEME } from './Theme';

/**
 * The sizes the log can be drawn at (its width and how many lines it shows), smallest first; the header's − and + step
 * through them, and the step chosen is kept in the settings (game/Settings.ts `combatLogSize`).
 */
const LOG_SIZES = [{ w: 152, lines: 5 }, { w: 168, lines: 8 }, { w: 184, lines: 12 }, { w: 200, lines: 16 }] as const;
const MAX_LINES = Math.max(...LOG_SIZES.map((size) => size.lines));
const MAX_W = Math.max(...LOG_SIZES.map((size) => size.w));
/** The padding inside, the header's height, and the distance from the screen's edges. */
const PAD = 4;
const HEADER_H = 11;
const MARGIN = 8;
/** How much of the bottom edge the log takes from the right at its widest, its margin included (the quick bar keeps clear of it). */
export const COMBAT_LOG_SPAN = MAX_W + MARGIN;
const BG_ALPHA = 0.55;
/** The log's text is the pixel font at three quarters of its size (the screen draws it sharp at any scale). */
const TEXT_SCALE = 0.75;
const LINE_H = 7;
/** A line too long for the log goes on under itself, set in this far, so where one entry ends and the next starts shows. */
const WRAP_INDENT = 4;
/** The scrollbar down the right side: its width, the shortest its thumb gets, and how far a wheel notch scrolls. */
const BAR_W = 3;
const THUMB_MIN = 6;
const WHEEL_LINES = 1;
/** The header's buttons (smaller, larger, fold), this big and this far apart, from its right corner. */
const BUTTON = 9;
const BUTTON_GAP = 2;
const BUTTON_FACE_ALPHA = 0.08;
const BUTTON_HOVER_ALPHA = 0.2;
const BUTTON_OFF_ALPHA = 0.35;
/** The fold button's chevron: this wide and this tall. */
const CHEVRON_W = 5;
const CHEVRON_H = 3;
/** Players' blows read gold, enemies' red. */
const PLAYER_COLOR = 0xf2d27a;
const MOB_COLOR = 0xff8a7a;
/** Coins and finds read pale gold. */
const LOOT_COLOR = 0xffe08a;
/** Rests, kills, levels and choices read pale blue. */
const EVENT_COLOR = 0x9ad7ff;
/** Entries kept for scrolling back. */
const HISTORY = 60;

type Line = { text: string; color: number };
/** A line as drawn: an entry, or a piece of one too long for the log (`indent`: a piece after its first). */
type Row = Line & { indent: boolean };

/** Breaks an entry into rows no wider than `width` (its later rows set in by WRAP_INDENT); a word longer than a row keeps one of its own. */
export function wrapEntry(line: Line, width: number): Row[] {
  const rows: Row[] = [];
  let row = '';
  for (const word of line.text.split(' ')) {
    const room = width - (rows.length ? WRAP_INDENT : 0);
    const next = row ? `${row} ${word}` : word;
    if (!row || measureText(next, TEXT_SCALE) <= room) {
      row = next;
      continue;
    }
    rows.push({ text: row, color: line.color, indent: rows.length > 0 });
    row = word;
  }
  rows.push({ text: row, color: line.color, indent: rows.length > 0 });
  return rows;
}

/** A small square button of the header: its face lit under the pointer, faint when it can do nothing. */
type HeaderButton = { view: Container; face: Graphics; enabled: boolean; hovered: boolean };

/** One line as the log writes it: "Evincars 20 to hit, 9 dmg", "Orc 12 to hit, miss", "Evincars +12 gold". */
function describe(entry: CombatLogEntry): Line {
  const kind = entry.actor === 'mob' ? entry.name : '';
  const name = isMobType(kind) ? text(`mob.${kind}` as const) : entry.name;
  const vars = { name, total: entry.total, damage: entry.damage, spell: entry.spell ? spellName(entry.spell) : '', item: entry.item ?? '' };
  const result = entry.result;
  if (result === 'event' && entry.event) return { text: text(`combat_log.event.${entry.event}` as const, vars), color: EVENT_COLOR };
  if (result === 'event') return { text: '', color: EVENT_COLOR };
  if (result === 'gold' || result === 'need' || result === 'won') return { text: text(`combat_log.${result}`, vars), color: LOOT_COLOR };
  const line = entry.spell ? text(`combat_log.spell.${result}`, vars) : text(`combat_log.${result}`, vars);
  return { text: line, color: entry.actor === 'mob' ? MOB_COLOR : PLAYER_COLOR };
}

/**
 * The combat log, bottom right: everyone's blows, newest at the bottom, on a see-through black panel with no
 * border; an entry too long for it goes on under itself. It scrolls back (mouse wheel, or the bar on its right: drag the
 * thumb or click the track); the header's − and + make it smaller and larger, and its corner button folds it down to the
 * header and opens it again.
 */
export class CombatLogPanel {
  readonly container = new Container();
  private readonly bg = new Graphics();
  private readonly track = new Graphics();
  private readonly thumb = new Graphics();
  private readonly labels: PixelLabel[] = [];
  private readonly chevron = new Graphics();
  private readonly smaller: HeaderButton;
  private readonly larger: HeaderButton;
  private readonly fold: HeaderButton;
  /** The entries kept, and the rows they wrap into at the log's width. */
  private readonly history: Line[] = [];
  private rows: Row[] = [];
  private lastSeq = 0;
  /** Rows scrolled up from the newest (0: following the fight). */
  private scroll = 0;
  /** While the thumb is dragged: where the pointer took it, and the scroll then. */
  private drag: { y: number; scroll: number } | null = null;
  private open = true;
  private size = settings.combatLogSize;

  constructor() {
    this.container.eventMode = 'static';
    const title = new PixelLabel(text('combat_log.title'), { color: THEME.muted, shadow: true });
    title.position.set(PAD, 2);
    this.container.addChild(this.bg, title);
    for (let i = 0; i < MAX_LINES; i++) {
      const label = new PixelLabel('', { scale: TEXT_SCALE, shadow: true });
      this.labels.push(label);
      this.container.addChild(label);
    }
    this.smaller = this.headerButton(new PixelLabel('-', { color: THEME.buttonText, align: 'center', shadow: true }), () => this.resize(-1));
    this.larger = this.headerButton(new PixelLabel('+', { color: THEME.buttonText, align: 'center', shadow: true }), () => this.resize(1));
    this.fold = this.headerButton(this.chevron, () => {
      this.open = !this.open;
      this.layout();
    });
    this.container.addChild(this.track, this.thumb, this.smaller.view, this.larger.view, this.fold.view);
    this.listen();
    this.layout();
  }

  private get lines(): number {
    return LOG_SIZES[this.size].lines;
  }

  private get w(): number {
    return LOG_SIZES[this.size].w;
  }

  private listen(): void {
    this.container.on('pointerover', () => claimPointer(this, true));
    this.container.on('pointerout', () => { if (!this.drag) claimPointer(this, false); });
    this.container.on('wheel', (e: FederatedWheelEvent) => this.scrollBy(e.deltaY > 0 ? -WHEEL_LINES : WHEEL_LINES));
    this.track.eventMode = 'static';
    this.track.cursor = 'pointer';
    this.track.on('pointerdown', (e: FederatedPointerEvent) => this.page(e));
    this.thumb.eventMode = 'static';
    this.thumb.cursor = 'grab';
    this.thumb.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.drag = { y: e.global.y, scroll: this.scroll };
    });
    this.container.on('globalpointermove', (e: FederatedPointerEvent) => this.dragTo(e));
    const endDrag = () => {
      this.drag = null;
    };
    this.container.on('pointerup', endDrag);
    this.container.on('pointerupoutside', () => {
      endDrag();
      claimPointer(this, false);
    });
  }

  /** A square button of the header holding `mark` (its middle at the button's middle, a label's top a little down). */
  private headerButton(mark: Container, press: () => void): HeaderButton {
    const view = new Container();
    const face = new Graphics();
    if (mark instanceof PixelLabel) mark.position.set(BUTTON / 2, 0);
    view.addChild(face, mark);
    view.eventMode = 'static';
    view.cursor = 'pointer';
    view.hitArea = new Rectangle(0, 0, BUTTON, BUTTON);
    const button: HeaderButton = { view, face, enabled: true, hovered: false };
    view.on('pointerover', () => { button.hovered = true; this.drawButton(button); });
    view.on('pointerout', () => { button.hovered = false; this.drawButton(button); });
    view.on('pointertap', () => { if (button.enabled) press(); });
    return button;
  }

  private drawButton(button: HeaderButton): void {
    const lit = button.hovered && button.enabled;
    button.face.clear().rect(0, 0, BUTTON, BUTTON).fill({ color: 0xffffff, alpha: lit ? BUTTON_HOVER_ALPHA : BUTTON_FACE_ALPHA });
    button.view.alpha = button.enabled ? 1 : BUTTON_OFF_ALPHA;
    button.view.cursor = button.enabled ? 'pointer' : 'default';
  }

  /** The fold button's chevron: pointing down while the log is open (fold it away), up while folded (open it). */
  private drawChevron(): void {
    const x = (BUTTON - CHEVRON_W) / 2;
    const y = (BUTTON - CHEVRON_H) / 2;
    const tip = this.open ? y + CHEVRON_H : y;
    const base = this.open ? y : y + CHEVRON_H;
    this.chevron.clear().poly([x, base, x + CHEVRON_W, base, x + CHEVRON_W / 2, tip]).fill({ color: THEME.buttonText });
  }

  /** One step smaller or larger, kept for next time; the rows wrap again to the new width. */
  private resize(step: number): void {
    const size = Math.max(0, Math.min(COMBAT_LOG_SIZES - 1, LOG_SIZES.length - 1, this.size + step));
    if (size === this.size) return;
    this.size = size;
    settings.combatLogSize = size;
    saveSettings();
    this.rewrap();
    this.layout();
  }

  /** The width the text may take: inside the padding, clear of the scrollbar. */
  private textW(): number {
    return this.w - 2 * PAD - BAR_W - 2;
  }

  /** Every entry kept, wrapped again (the width changed). */
  private rewrap(): void {
    const width = this.textW();
    this.rows = this.history.flatMap((line) => wrapEntry(line, width));
    this.scroll = Math.min(this.scroll, this.hidden);
  }

  /** Rows that can be scrolled through beyond those shown. */
  private get hidden(): number {
    return Math.max(0, this.rows.length - this.lines);
  }

  private scrollBy(lines: number): void {
    this.scroll = Math.max(0, Math.min(this.hidden, this.scroll + lines));
    this.showLines();
  }

  /** A click on the track above the thumb scrolls a page back, below it a page forward. */
  private page(e: FederatedPointerEvent): void {
    const y = this.container.toLocal(e.global).y;
    const above = y < this.thumb.y + this.thumb.height / 2;
    this.scrollBy(above ? this.lines : -this.lines);
  }

  /** Dragging the thumb: the track's length stands for every hidden row. */
  private dragTo(e: FederatedPointerEvent): void {
    if (!this.drag || !this.hidden) return;
    const travel = this.trackH() - this.thumbH();
    if (travel <= 0) return;
    const lines = Math.round(((this.drag.y - e.global.y) / this.container.worldTransform.d / travel) * this.hidden);
    this.scroll = Math.max(0, Math.min(this.hidden, this.drag.scroll + lines));
    this.showLines();
  }

  private trackH(): number {
    return this.lines * LINE_H;
  }

  private thumbH(): number {
    const total = Math.max(this.lines, this.rows.length);
    return Math.max(THUMB_MIN, Math.round((this.trackH() * this.lines) / total));
  }

  /** Open, the header, the lines and the scrollbar; folded, just the header. Either way it sits in the bottom-right corner. */
  private layout(): void {
    const w = this.w;
    const h = this.open ? HEADER_H + this.lines * LINE_H + PAD : HEADER_H;
    this.container.position.set(GAME_WIDTH - MARGIN - w, GAME_HEIGHT - MARGIN - h);
    this.container.hitArea = new Rectangle(0, 0, w, h);
    this.bg.clear().rect(0, 0, w, h).fill({ color: 0x000000, alpha: BG_ALPHA });
    [this.fold, this.larger, this.smaller].forEach((button, i) => button.view.position.set(w - 2 - BUTTON - i * (BUTTON + BUTTON_GAP), 1));
    this.smaller.enabled = this.open && this.size > 0;
    this.larger.enabled = this.open && this.size < LOG_SIZES.length - 1;
    for (const button of [this.smaller, this.larger, this.fold]) this.drawButton(button);
    this.smaller.view.visible = this.open;
    this.larger.view.visible = this.open;
    this.drawChevron();
    this.labels.forEach((label, i) => { label.visible = this.open && i < this.lines; });
    this.track.visible = this.open;
    this.thumb.visible = this.open;
    this.showLines();
  }

  /** The rows at the current scroll, and the thumb where they are in the history. */
  private showLines(): void {
    const lines = this.lines;
    const end = this.rows.length - this.scroll;
    const first = Math.max(0, end - lines);
    for (let i = 0; i < lines; i++) {
      const row = first + i < end ? this.rows[first + i] : undefined;
      const label = this.labels[i];
      label.text = row?.text ?? '';
      label.position.set(PAD + (row?.indent ? WRAP_INDENT : 0), HEADER_H + 1 + i * LINE_H);
      if (row) label.fill = row.color;
    }
    const x = this.w - PAD - BAR_W;
    const top = HEADER_H + 1;
    this.track.clear().rect(x, top, BAR_W, this.trackH()).fill({ color: 0xffffff, alpha: 0.08 });
    this.track.hitArea = new Rectangle(x - 1, top, BAR_W + 2, this.trackH());
    const thumbH = this.thumbH();
    const travel = this.trackH() - thumbH;
    const at = this.hidden ? travel * (1 - this.scroll / this.hidden) : travel;
    this.thumb.clear().rect(0, 0, BAR_W, thumbH).fill({ color: THEME.control, alpha: this.hidden ? 0.9 : 0.35 });
    this.thumb.position.set(x, Math.round(top + at));
    this.thumb.hitArea = new Rectangle(-1, 0, BAR_W + 2, thumbH);
  }

  /** Takes in the blows written since last time; scrolled back, the view stays on the lines it was showing. */
  update(): void {
    const log = currentLog();
    if (!log) return;
    // A new level starts a new log, counting from 1 again (a guest's copy is replaced every update, so the
    // count is what tells).
    if (log.seq < this.lastSeq) this.lastSeq = 0;
    let added = 0;
    const width = this.textW();
    for (const entry of log.entries) {
      if (entry.seq <= this.lastSeq) continue;
      this.lastSeq = entry.seq;
      const line = describe(entry);
      this.history.push(line);
      const rows = wrapEntry(line, width);
      this.rows.push(...rows);
      added += rows.length;
    }
    if (!added) return;
    if (this.history.length > HISTORY) {
      this.history.splice(0, this.history.length - HISTORY);
      this.rewrap();
    }
    if (this.scroll > 0) this.scroll = Math.min(this.hidden, this.scroll + added);
    this.showLines();
  }

  destroy(): void {
    claimPointer(this, false);
    this.container.destroy({ children: true });
  }
}
