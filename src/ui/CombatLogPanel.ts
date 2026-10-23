import { Container, Graphics, Rectangle } from 'pixi.js';
import type { FederatedPointerEvent, FederatedWheelEvent } from 'pixi.js';
import { isMobType } from '../world';
import type { CombatLogEntry } from '../world';
import { GAME_HEIGHT, GAME_WIDTH } from '../render/Camera';
import { claimPointer } from '../systems/InputSystem';
import { currentLog } from '../systems/CombatLogSystem';
import { text } from '../core/texts';
import { spellName } from '../rules/Names';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

/** The panel's width, the lines it shows, the padding inside, and its distance from the screen's edges. */
const W = 168;
const LINES = 8;
const PAD = 4;
const HEADER_H = 11;
const MARGIN = 8;
const BG_ALPHA = 0.55;
/** The log's text is the pixel font at three quarters of its size (the screen draws it sharp at any scale). */
const TEXT_SCALE = 0.75;
const LINE_H = 7;
/** The scrollbar down the right side: its width, the shortest its thumb gets, and how far a wheel notch scrolls. */
const BAR_W = 3;
const THUMB_MIN = 6;
const WHEEL_LINES = 1;
/** The minimise / show button in the header's corner. */
const TOGGLE = 9;
/** Players' blows read gold, enemies' red. */
const PLAYER_COLOR = 0xf2d27a;
const MOB_COLOR = 0xff8a7a;
/** Coins and finds read pale gold. */
const LOOT_COLOR = 0xffe08a;
/** Entries kept for scrolling back. */
const HISTORY = 60;

type Line = { text: string; color: number };

/** One line as the log writes it: "Evincars 20 to hit, 9 dmg", "Orc 12 to hit, miss", "Evincars +12 gold". */
function describe(entry: CombatLogEntry): Line {
  const kind = entry.actor === 'mob' ? entry.name : '';
  const name = isMobType(kind) ? text(`mob.${kind}` as const) : entry.name;
  const vars = { name, total: entry.total, damage: entry.damage, spell: entry.spell ? spellName(entry.spell) : '', item: entry.item ?? '' };
  const result = entry.result;
  if (result === 'gold' || result === 'need' || result === 'won') return { text: text(`combat_log.${result}`, vars), color: LOOT_COLOR };
  const line = entry.spell ? text(`combat_log.spell.${result}`, vars) : text(`combat_log.${result}`, vars);
  return { text: line, color: entry.actor === 'mob' ? MOB_COLOR : PLAYER_COLOR };
}

/**
 * The combat log, bottom right: everyone's blows, newest at the bottom, on a see-through black panel with no
 * border. It scrolls back (mouse wheel, or the bar on its right: drag the thumb or click the track), and its
 * corner button folds it down to the header and opens it again.
 */
export class CombatLogPanel {
  readonly container = new Container();
  private readonly bg = new Graphics();
  private readonly track = new Graphics();
  private readonly thumb = new Graphics();
  private readonly labels: PixelLabel[] = [];
  private readonly toggleMark = new PixelLabel('-', { color: THEME.buttonText, align: 'center', shadow: true });
  private readonly history: Line[] = [];
  private lastSeq = 0;
  /** Lines scrolled up from the newest (0: following the fight). */
  private scroll = 0;
  /** While the thumb is dragged: where the pointer took it, and the scroll then. */
  private drag: { y: number; scroll: number } | null = null;
  private open = true;

  constructor() {
    this.container.eventMode = 'static';
    const title = new PixelLabel(text('combat_log.title'), { color: THEME.muted, shadow: true });
    title.position.set(PAD, 2);
    this.container.addChild(this.bg, title);
    for (let i = 0; i < LINES; i++) {
      const label = new PixelLabel('', { scale: TEXT_SCALE, shadow: true });
      label.position.set(PAD, HEADER_H + 1 + i * LINE_H);
      this.labels.push(label);
      this.container.addChild(label);
    }
    this.container.addChild(this.track, this.thumb, this.toggleButton());
    this.listen();
    this.layout();
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

  private toggleButton(): Container {
    const button = new Container();
    button.position.set(W - TOGGLE - 2, 1);
    this.toggleMark.position.set(TOGGLE / 2, 0);
    button.addChild(new Graphics().rect(0, 0, TOGGLE, TOGGLE).fill({ color: 0xffffff, alpha: 0.08 }), this.toggleMark);
    button.eventMode = 'static';
    button.cursor = 'pointer';
    button.hitArea = new Rectangle(0, 0, TOGGLE, TOGGLE);
    button.on('pointertap', () => {
      this.open = !this.open;
      this.layout();
    });
    return button;
  }

  /** Lines that can be scrolled through beyond those shown. */
  private get hidden(): number {
    return Math.max(0, this.history.length - LINES);
  }

  private scrollBy(lines: number): void {
    this.scroll = Math.max(0, Math.min(this.hidden, this.scroll + lines));
    this.showLines();
  }

  /** A click on the track above the thumb scrolls a page back, below it a page forward. */
  private page(e: FederatedPointerEvent): void {
    const y = this.container.toLocal(e.global).y;
    const above = y < this.thumb.y + this.thumb.height / 2;
    this.scrollBy(above ? LINES : -LINES);
  }

  /** Dragging the thumb: the track's length stands for every hidden line. */
  private dragTo(e: FederatedPointerEvent): void {
    if (!this.drag || !this.hidden) return;
    const travel = this.trackH() - this.thumbH();
    if (travel <= 0) return;
    const lines = Math.round(((this.drag.y - e.global.y) / this.container.worldTransform.d / travel) * this.hidden);
    this.scroll = Math.max(0, Math.min(this.hidden, this.drag.scroll + lines));
    this.showLines();
  }

  private trackH(): number {
    return LINES * LINE_H;
  }

  private thumbH(): number {
    const total = Math.max(LINES, this.history.length);
    return Math.max(THUMB_MIN, Math.round((this.trackH() * LINES) / total));
  }

  /** Open, the header, the lines and the scrollbar; folded, just the header. Either way it sits in the bottom-right corner. */
  private layout(): void {
    const h = this.open ? HEADER_H + LINES * LINE_H + PAD : HEADER_H;
    this.container.position.set(GAME_WIDTH - MARGIN - W, GAME_HEIGHT - MARGIN - h);
    this.container.hitArea = new Rectangle(0, 0, W, h);
    this.bg.clear().rect(0, 0, W, h).fill({ color: 0x000000, alpha: BG_ALPHA });
    this.toggleMark.text = this.open ? '-' : '+';
    for (const label of this.labels) label.visible = this.open;
    this.track.visible = this.open;
    this.thumb.visible = this.open;
    this.showLines();
  }

  /** The lines at the current scroll, and the thumb where they are in the history. */
  private showLines(): void {
    const end = this.history.length - this.scroll;
    const shown = this.history.slice(Math.max(0, end - LINES), end);
    this.labels.forEach((label, i) => {
      const line = shown[i];
      label.text = line?.text ?? '';
      if (line) label.fill = line.color;
    });
    const x = W - PAD - BAR_W;
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
    for (const entry of log.entries) {
      if (entry.seq <= this.lastSeq) continue;
      this.lastSeq = entry.seq;
      this.history.push(describe(entry));
      added++;
    }
    if (!added) return;
    if (this.history.length > HISTORY) this.history.splice(0, this.history.length - HISTORY);
    if (this.scroll > 0) this.scroll = Math.min(this.hidden, this.scroll + added);
    this.showLines();
  }

  destroy(): void {
    claimPointer(this, false);
    this.container.destroy({ children: true });
  }
}
