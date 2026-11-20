import { Container, Graphics } from 'pixi.js';
import { GAME_WIDTH, GAME_HEIGHT, LAYOUT_LEFT, LAYOUT_WIDTH } from '../render/Camera';
import { PixelButton } from './PixelButton';
import { THEME } from './Theme';
import { makeText } from './PixelText';
import { sound } from '../audio/SoundPlayer';

const DIM_ALPHA = 0.75;
const PANEL = { x: LAYOUT_LEFT + 90, y: 90, w: LAYOUT_WIDTH - 180, h: 220 };
const TITLE_Y = 18;
const LINES_Y = 62;
const LINE_HEIGHT = 18;
const BUTTON_W = 150;
const BUTTON_H = 26;
const BUTTON_GAP = 12;
const BUTTONS_BOTTOM = 18;
/** The wide panel for a table: this wide at most, kept this far from the screen's sides. */
const WIDE_W = 470;
const WIDE_MARGIN = 16;
/** The table: inset from the panel's sides, the share of it the names take, a row's height, and the spacing round it. */
const TABLE_PAD = 16;
const NAME_SHARE = 0.3;
const TABLE_ROW_H = 16;
const TABLE_GAP = 6;
const TABLE_RULE_Y = 13;
const TABLE_RULE_GAP = 4;
const TABLE_BOTTOM = 14;
const RULE_ALPHA = 0.5;
/** A victory: a lighter veil over the game, the panel itself a little see-through, a gold glow round it. */
const VICTORY_DIM_ALPHA = 0.45;
const VICTORY_FILL_ALPHA = 0.82;
const VICTORY_GLOW = 0xffb030;
const GLOW_RINGS = 4;
const GLOW_STEP = 3;
const GLOW_ALPHA = 0.18;
const INNER_RULE = 4;

export type ResultContent = {
  title: string;
  titleColor: number;
  lines: string[];
  /** A table under the lines (a row per hero): its header, then its rows, each cell a column. */
  table?: { header: string[]; rows: string[][] };
  /** A victory: the panel glows gold over a lighter veil, the title shines. */
  victory?: boolean;
  /** Shown instead of the buttons when the player can't choose (a co-op guest waits for the host). */
  waiting?: string;
  buttons: Array<{ label: string; action: () => void }>;
};

type Box = { x: number; y: number; w: number; h: number };

/** The panel's box: the plain one, or wider and as tall as its table needs. */
function panelFor(content: ResultContent): Box {
  if (!content.table) return PANEL;
  const w = Math.min(GAME_WIDTH - 2 * WIDE_MARGIN, WIDE_W);
  const h = LINES_Y + content.lines.length * LINE_HEIGHT + TABLE_GAP + TABLE_ROW_H * (content.table.rows.length + 1) + TABLE_RULE_GAP
    + TABLE_BOTTOM + BUTTON_H + BUTTONS_BOTTOM;
  return { x: Math.round((GAME_WIDTH - w) / 2), y: Math.round((GAME_HEIGHT - h) / 2), w, h };
}

function plainPanel(box: Box): Graphics {
  return new Graphics().rect(box.x, box.y, box.w, box.h).fill(THEME.panel).stroke({ color: THEME.panelBorder, width: 2 });
}

/** A victory's panel: see-through dark, a gold double border and a soft gold glow round it. */
function victoryPanel(box: Box): Graphics {
  const g = new Graphics();
  for (let i = GLOW_RINGS; i > 0; i--) {
    g.rect(box.x - i * GLOW_STEP, box.y - i * GLOW_STEP, box.w + 2 * i * GLOW_STEP, box.h + 2 * i * GLOW_STEP)
      .fill({ color: VICTORY_GLOW, alpha: GLOW_ALPHA / i });
  }
  g.rect(box.x, box.y, box.w, box.h).fill({ color: THEME.panel, alpha: VICTORY_FILL_ALPHA })
    .stroke({ color: THEME.title, width: 2 })
    .rect(box.x + INNER_RULE, box.y + INNER_RULE, box.w - 2 * INNER_RULE, box.h - 2 * INNER_RULE).stroke({ color: THEME.title, width: 1, alpha: RULE_ALPHA });
  return g;
}

/** A modal over the game that reports how things stand and offers a choice: game over, level complete. */
export class ResultPanel {
  readonly container = new Container();

  constructor() {
    this.container.visible = false;
    this.container.eventMode = 'static';
  }

  get open(): boolean {
    return this.container.visible;
  }

  show(content: ResultContent): void {
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    const box = panelFor(content);
    const dim = new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x000000, alpha: content.victory ? VICTORY_DIM_ALPHA : DIM_ALPHA });
    dim.eventMode = 'static';
    this.container.addChild(dim, content.victory ? victoryPanel(box) : plainPanel(box));
    if (content.victory) this.container.addChild(makeText(content.title, VICTORY_GLOW, 16, 'center')).position.set(GAME_WIDTH / 2 + 1, box.y + TITLE_Y + 1);
    const title = makeText(content.title, content.titleColor, 16, 'center');
    title.x = GAME_WIDTH / 2;
    title.y = box.y + TITLE_Y;
    this.container.addChild(title);
    content.lines.forEach((line, i) => {
      const text = makeText(line, 0xffffff, 10, 'center');
      text.x = GAME_WIDTH / 2;
      text.y = box.y + LINES_Y + i * LINE_HEIGHT;
      this.container.addChild(text);
    });
    if (content.table) this.addTable(content.table, box, box.y + LINES_Y + content.lines.length * LINE_HEIGHT + TABLE_GAP);
    if (content.waiting) this.addWaiting(content.waiting, box);
    else this.addButtons(content.buttons, box);
    this.container.visible = true;
    sound.playLocal(content.victory ? 'level_up' : 'dialog');
  }

  /** The table: its header in gold over a rule, then a row per hero, each column centred in its share of the panel. */
  private addTable(table: NonNullable<ResultContent['table']>, box: Box, top: number): void {
    const columns = table.header.length;
    const inner = box.w - 2 * TABLE_PAD;
    // The first column (the hero's name) takes a wider share; the numbers share the rest.
    const nameW = inner * NAME_SHARE;
    const cellW = (inner - nameW) / Math.max(1, columns - 1);
    const xOf = (c: number): number => (c === 0 ? box.x + TABLE_PAD + nameW / 2 : box.x + TABLE_PAD + nameW + cellW * (c - 0.5));
    const row = (cells: readonly string[], y: number, color: number): void => {
      cells.forEach((cell, c) => {
        const text = makeText(cell, color, 10, 'center');
        text.position.set(Math.round(xOf(c)), y);
        this.container.addChild(text);
      });
    };
    row(table.header, top, THEME.title);
    this.container.addChild(new Graphics().rect(box.x + TABLE_PAD, top + TABLE_RULE_Y, inner, 1).fill({ color: THEME.title, alpha: RULE_ALPHA }));
    table.rows.forEach((cells, i) => row(cells, top + TABLE_ROW_H * (i + 1) + TABLE_RULE_GAP, 0xffffff));
  }

  private addWaiting(message: string, box: Box): void {
    const text = makeText(message, 0xffcc44, 10, 'center');
    text.x = GAME_WIDTH / 2;
    text.y = box.y + box.h - BUTTONS_BOTTOM - BUTTON_H / 2;
    this.container.addChild(text);
  }

  private addButtons(buttons: ResultContent['buttons'], box: Box): void {
    const total = buttons.length * BUTTON_W + (buttons.length - 1) * BUTTON_GAP;
    buttons.forEach(({ label, action }, i) => {
      const button = new PixelButton(label, BUTTON_W, BUTTON_H);
      button.x = (GAME_WIDTH - total) / 2 + i * (BUTTON_W + BUTTON_GAP);
      button.y = box.y + box.h - BUTTONS_BOTTOM - BUTTON_H;
      button.onPress = action;
      this.container.addChild(button);
    });
  }

  hide(): void {
    this.container.visible = false;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
