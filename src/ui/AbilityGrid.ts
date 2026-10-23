import { Container, Graphics, Rectangle } from 'pixi.js';
import { STAT_NAMES } from '../world';
import type { StatName } from '../world';
import { statShort } from '../entities/Items';
import type { CharacterSheet } from '../rules/CharacterSheet';
import { formatModifier } from '../rules/Dice';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

/** Each cell: this tall, this far from the next; its name band, the small score under it, the modifier large below. */
export const ABILITY_CELL_H = 38;
const CELL_GAP = 3;
const NAME_H = 10;
const SCORE_SCALE = 0.75;
const SCORE_Y = 12;
const MODIFIER_SCALE = 2;
const MODIFIER_Y = 19;
const WELL_ALPHA = 0.85;

type Cell = { stat: StatName; hit: Rectangle; score: PixelLabel; modifier: PixelLabel; centre: number };

/**
 * The six abilities side by side, as on a character sheet: in each cell the ability's short name on top, its
 * score small under it, and its modifier — what every roll adds, the number that matters — large below.
 */
export class AbilityGrid {
  readonly view = new Container();
  private readonly cells: Cell[] = [];

  constructor(x: number, y: number, w: number) {
    const cellW = Math.floor((w - CELL_GAP * (STAT_NAMES.length - 1)) / STAT_NAMES.length);
    STAT_NAMES.forEach((stat, i) => this.addCell(stat, Math.round(x + i * (cellW + CELL_GAP)), y, cellW));
  }

  private addCell(stat: StatName, x: number, y: number, w: number): void {
    const frame = new Graphics()
      .rect(x, y, w, ABILITY_CELL_H).fill({ color: THEME.well, alpha: WELL_ALPHA }).stroke({ color: THEME.panelBorder, width: 1, alignment: 1 })
      .rect(x, y, w, NAME_H).fill({ color: THEME.row });
    const centre = Math.round(x + w / 2);
    const name = new PixelLabel(statShort(stat), { color: THEME.title, align: 'center', shadow: true });
    name.position.set(centre, y + 1);
    const score = new PixelLabel('', { color: THEME.muted, scale: SCORE_SCALE, align: 'center', shadow: true });
    score.position.set(centre, y + SCORE_Y);
    const modifier = new PixelLabel('', { color: THEME.text, scale: MODIFIER_SCALE, align: 'center', shadow: true });
    modifier.position.set(centre, y + MODIFIER_Y);
    this.view.addChild(frame, name, score, modifier);
    this.cells.push({ stat, hit: new Rectangle(x, y, w, ABILITY_CELL_H), score, modifier, centre });
  }

  set(sheet: CharacterSheet): void {
    for (const cell of this.cells) {
      cell.score.text = String(sheet.scores[cell.stat]);
      cell.modifier.text = formatModifier(sheet.modifiers[cell.stat]);
    }
  }

  /** The ability whose cell is under the point, if any. */
  statAt(x: number, y: number): StatName | null {
    for (const cell of this.cells) if (cell.hit.contains(x, y)) return cell.stat;
    return null;
  }

  /** Where each ability's column is centred, so rows under the grid (saving throws) line up with it. */
  columnCentres(): readonly number[] {
    return this.cells.map((cell) => cell.centre);
  }
}
