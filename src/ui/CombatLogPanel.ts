import { Container, Graphics, Rectangle } from 'pixi.js';
import { isMobType } from '../world';
import type { CombatLogEntry } from '../world';
import { GAME_HEIGHT, GAME_WIDTH } from '../render/Camera';
import { claimPointer } from '../systems/InputSystem';
import { currentLog } from '../systems/CombatLogSystem';
import { text } from '../core/texts';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

/** The panel's width, the lines it shows, their height, the padding inside, and its distance from the screen's edges. */
const W = 172;
const LINES = 6;
const LINE_H = 9;
const PAD = 4;
const HEADER_H = 11;
const MARGIN = 8;
const BG_ALPHA = 0.55;
/** The minimise / show button in the header's corner. */
const TOGGLE = 9;
/** Players' blows read gold, enemies' red. */
const PLAYER_COLOR = 0xf2d27a;
const MOB_COLOR = 0xff8a7a;
/** Entries remembered for scrolling back (only the newest show). */
const HISTORY = 30;

type Line = { text: string; color: number };

/** One blow as the log writes it: "Evincars 20 to hit, 9 dmg", "Orc 12 to hit, miss". */
function describe(entry: CombatLogEntry): Line {
  const kind = entry.actor === 'mob' ? entry.name : '';
  const name = isMobType(kind) ? text(`mob.${kind}` as const) : entry.name;
  const vars = { name, total: entry.total, damage: entry.damage };
  return { text: text(`combat_log.${entry.result}` as const, vars), color: entry.actor === 'mob' ? MOB_COLOR : PLAYER_COLOR };
}

/**
 * The combat log, bottom right: the latest blows of everyone in the fight, on a see-through black panel with
 * no border. Its corner button folds it down to the header and opens it again.
 */
export class CombatLogPanel {
  readonly container = new Container();
  private readonly bg = new Graphics();
  private readonly labels: PixelLabel[] = [];
  private readonly toggleMark = new PixelLabel('-', { color: THEME.buttonText, align: 'center', shadow: true });
  private readonly history: Line[] = [];
  private lastSeq = 0;
  private open = true;

  constructor() {
    this.container.eventMode = 'static';
    const title = new PixelLabel(text('combat_log.title'), { color: THEME.muted, shadow: true });
    title.position.set(PAD, 2);
    this.container.addChild(this.bg, title);
    for (let i = 0; i < LINES; i++) {
      const label = new PixelLabel('', { shadow: true });
      label.position.set(PAD, HEADER_H + i * LINE_H);
      this.labels.push(label);
      this.container.addChild(label);
    }
    this.container.addChild(this.toggleButton());
    this.container.on('pointerover', () => claimPointer(this, true));
    this.container.on('pointerout', () => claimPointer(this, false));
    this.layout();
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

  /** Open, the header and the lines; folded, just the header. Either way it sits in the bottom-right corner. */
  private layout(): void {
    const h = this.open ? HEADER_H + LINES * LINE_H + PAD : HEADER_H;
    this.container.position.set(GAME_WIDTH - MARGIN - W, GAME_HEIGHT - MARGIN - h);
    this.container.hitArea = new Rectangle(0, 0, W, h);
    this.bg.clear().rect(0, 0, W, h).fill({ color: 0x000000, alpha: BG_ALPHA });
    this.toggleMark.text = this.open ? '-' : '+';
    for (const label of this.labels) label.visible = this.open;
  }

  /** Takes in the blows written since last time (a new level brings a new log) and shows the newest. */
  update(): void {
    const log = currentLog();
    if (!log) return;
    // A new level starts a new log, counting from 1 again (a guest's copy is replaced every update, so the
    // count is what tells).
    if (log.seq < this.lastSeq) this.lastSeq = 0;
    let changed = false;
    for (const entry of log.entries) {
      if (entry.seq <= this.lastSeq) continue;
      this.lastSeq = entry.seq;
      this.history.push(describe(entry));
      changed = true;
    }
    if (!changed) return;
    if (this.history.length > HISTORY) this.history.splice(0, this.history.length - HISTORY);
    const shown = this.history.slice(-LINES);
    this.labels.forEach((label, i) => {
      const line = shown[i];
      label.text = line?.text ?? '';
      if (line) label.fill = line.color;
    });
  }

  destroy(): void {
    claimPointer(this, false);
    this.container.destroy({ children: true });
  }
}
