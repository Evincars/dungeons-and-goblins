import { Container, Graphics } from 'pixi.js';
import { text } from '../core/texts';
import type { TextId } from '../core/texts';
import { report, reportRejection } from '../core/errors';
import type { Scene, SceneManager } from '../game/SceneManager';
import { GAME_WIDTH, GAME_HEIGHT } from '../render/Camera';
import { PixelButton } from '../ui/PixelButton';
import { PixelLabel, makeText, makeTitle } from '../ui/PixelText';
import { menuBackdrop } from '../ui/MenuBackdrop';
import { THEME } from '../ui/Theme';
import { sound } from '../audio/SoundPlayer';
import type { LevelTheme } from '../level/Theme';
import { chooseSave } from '../game/SaveGame';
import { heroName } from '../rules/Names';
import { deleteSave, exportSave, importSave, listSaves, pickSaveFile, readSave } from '../game/SaveStore';
import type { SaveEntry } from '../game/SaveStore';
import type { SaveFile } from '../game/SaveGame';
import type { Result } from '../core/errors';

/** Rows of saves on a page, each this tall, the first this far down; this far in from the screen's sides. */
const PAGE_ROWS = 5;
const ROW_H = 50;
const ROW_GAP = 4;
const TOP = 66;
const SIDE = 20;
const TITLE_Y = 22;
const STATUS_Y = 46;
/** A row's buttons: this big, this far apart, from its right edge in. */
const ROW_BTN_W = 62;
const ROW_BTN_H = 18;
const ROW_BTN_GAP = 4;
const ROW_PAD = 6;
/** The bottom buttons. */
const BOTTOM_BTN_W = 120;
const BOTTOM_BTN_H = 22;
const BOTTOM_Y = GAME_HEIGHT - 34;
const BOTTOM_GAP = 10;
/** The heroes' line of a row is cut to this many letters. */
const HEROES_MAX = 62;
const NAME_COLOR = 0xffdd88;
const INFO_COLOR = 0xb8a888;
const HEROES_COLOR = 0xffffff;
const ERROR_COLOR = 0xff8888;
const OK_COLOR = 0x9be08a;
const SMALL = 0.75;

const THEME_NAMES = {
  catacomb: 'save.theme.catacomb', castle: 'save.theme.castle', castle2: 'save.theme.castle2', mines: 'save.theme.mines',
} as const satisfies Record<LevelTheme, TextId>;

function when(savedAt: number): string {
  return new Date(savedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function heroesOf(entry: SaveEntry): string {
  const line = entry.heroes.map((hero) => `${hero.name} (${text('save.hero_short', { hero: heroName(hero.heroClass), level: hero.level })})`).join(', ');
  return line.length > HEROES_MAX ? `${line.slice(0, HEROES_MAX - 3)}...` : line;
}

/**
 * The saved games the browser keeps (game/SaveStore.ts), newest first, a page at a time: each taken up alone (Play, only
 * the host's hero) or hosted for the party (Host: the co-op lobby, where each guest takes up their saved hero),
 * downloaded as a file (Export) or forgotten (Delete, asked twice). A save file from the computer comes in by Import.
 */
export class LoadGameScene implements Scene {
  readonly container = new Container();
  private readonly rows = new Container();
  private readonly status: PixelLabel;
  private readonly prev: PixelButton;
  private readonly next: PixelButton;
  private saves: SaveEntry[] = [];
  private page = 0;
  /** The save whose Delete was pressed once (a second press forgets it). */
  private doomed: string | null = null;
  private busy = false;
  private disposed = false;

  constructor(private readonly manager: SceneManager) {
    sound.playLocal('open_menu');
    this.container.addChild(menuBackdrop());
    this.container.eventMode = 'static';
    const title = makeTitle(text('save.load_title'));
    title.position.set(GAME_WIDTH / 2, TITLE_Y);
    this.status = makeText('', INFO_COLOR, 8, 'center');
    this.status.position.set(GAME_WIDTH / 2, STATUS_Y);
    this.container.addChild(title, this.status, this.rows);

    const bottom = [
      this.bottomButton(text('save.import'), () => this.later(this.importFile())),
      (this.prev = this.bottomButton(text('save.previous'), () => this.turn(-1))),
      (this.next = this.bottomButton(text('save.next'), () => this.turn(1))),
      this.bottomButton(text('save.back'), () => manager.goto('title')),
    ];
    const total = bottom.length * BOTTOM_BTN_W + (bottom.length - 1) * BOTTOM_GAP;
    bottom.forEach((button, i) => button.position.set(Math.round((GAME_WIDTH - total) / 2) + i * (BOTTOM_BTN_W + BOTTOM_GAP), BOTTOM_Y));
    this.reload();
  }

  private bottomButton(label: string, action: () => void): PixelButton {
    const button = new PixelButton(label, BOTTOM_BTN_W, BOTTOM_BTN_H);
    button.onPress = action;
    this.container.addChild(button);
    return button;
  }

  private reload(): void {
    this.saves = listSaves();
    this.page = Math.min(this.page, Math.max(0, Math.ceil(this.saves.length / PAGE_ROWS) - 1));
    this.doomed = null;
    this.showPage();
    if (!this.saves.length) this.say(text('save.none'));
  }

  private turn(by: number): void {
    this.page += by;
    this.doomed = null;
    this.showPage();
  }

  private say(message: string, color = INFO_COLOR): void {
    this.status.text = message;
    this.status.fill = color;
  }

  private showPage(): void {
    this.rows.removeChildren().forEach((child) => child.destroy({ children: true }));
    const first = this.page * PAGE_ROWS;
    this.saves.slice(first, first + PAGE_ROWS).forEach((entry, i) => this.rows.addChild(this.row(entry, TOP + i * (ROW_H + ROW_GAP))));
    this.prev.setEnabled(this.page > 0);
    this.next.setEnabled(first + PAGE_ROWS < this.saves.length);
  }

  /** One save: its name, depth, dungeon and when it was saved, its heroes, and what can be done with it. */
  private row(entry: SaveEntry, y: number): Container {
    const row = new Container();
    const width = GAME_WIDTH - 2 * SIDE;
    row.addChild(new Graphics().rect(SIDE, y, width, ROW_H).fill({ color: THEME.panel, alpha: 0.85 }).stroke({ color: THEME.panelBorder, width: 1 }));
    const name = makeText(entry.name, NAME_COLOR, 8);
    name.position.set(SIDE + ROW_PAD, y + ROW_PAD);
    const info = new PixelLabel(text('save.row_info', { depth: entry.depth, dungeon: text(THEME_NAMES[entry.theme]), when: when(entry.savedAt) }),
      { color: INFO_COLOR, scale: SMALL, shadow: true });
    info.position.set(SIDE + ROW_PAD, y + ROW_PAD + 13);
    const heroes = new PixelLabel(heroesOf(entry), { color: HEROES_COLOR, scale: SMALL, shadow: true });
    heroes.position.set(SIDE + ROW_PAD, y + ROW_PAD + 25);
    row.addChild(name, info, heroes);
    const actions: Array<[string, () => void]> = [
      [text('save.play'), () => this.later(this.take(entry, 'in_game'))],
      [text('save.host'), () => this.later(this.take(entry, 'coop_host'))],
      [text('save.export'), () => this.later(this.download(entry))],
      [this.doomed === entry.id ? text('save.delete_sure') : text('save.delete'), () => this.forget(entry)],
    ];
    const right = SIDE + width - ROW_PAD;
    actions.forEach(([label, action], i) => {
      const button = new PixelButton(label, ROW_BTN_W, ROW_BTN_H);
      button.position.set(right - (actions.length - i) * ROW_BTN_W - (actions.length - 1 - i) * ROW_BTN_GAP, y + (ROW_H - ROW_BTN_H) / 2);
      button.onPress = action;
      row.addChild(button);
    });
    return row;
  }

  /** A button's work that finishes later: anything it throws on the way is logged. */
  private later(work: Promise<void>): void {
    reportRejection(work, text('save.read_failed'), 'save');
  }

  /** Reads a save in full, saying so while it unpacks; null (and why, on the status line) when it cannot be read. */
  private async open(entry: SaveEntry): Promise<SaveFile | null> {
    if (this.busy) return null;
    this.busy = true;
    this.say(text('save.reading'));
    const read: Result<SaveFile> = await readSave(entry.id);
    this.busy = false;
    if (this.disposed) return null;
    if (read.ok) return read.value;
    this.say(report(read.error, text('save.read_failed'), 'save').message, ERROR_COLOR);
    return null;
  }

  /** Takes a save up: alone straight into its level, or hosting, into the lobby to gather the party. */
  private async take(entry: SaveEntry, where: 'in_game' | 'coop_host'): Promise<void> {
    const save = await this.open(entry);
    if (!save) return;
    chooseSave(save);
    this.manager.goto(where);
  }

  private async download(entry: SaveEntry): Promise<void> {
    const save = await this.open(entry);
    if (!save) return;
    exportSave(save);
    this.say(text('save.exported'), OK_COLOR);
  }

  private forget(entry: SaveEntry): void {
    if (this.doomed !== entry.id) {
      this.doomed = entry.id;
      this.showPage();
      return;
    }
    const gone = deleteSave(entry.id);
    if (!gone.ok) this.say(report(gone.error, text('save.delete_failed'), 'save').message, ERROR_COLOR);
    this.reload();
  }

  private async importFile(): Promise<void> {
    const file = await pickSaveFile();
    if (!file || this.disposed) return;
    const stored = await importSave(file);
    if (this.disposed) return;
    this.page = 0;
    this.reload();
    if (stored.ok) this.say(text('save.imported', { name: stored.value.name }), OK_COLOR);
    else this.say(report(stored.error, text('save.import_failed'), 'save').message, ERROR_COLOR);
  }

  destroy(): void {
    this.disposed = true;
    this.container.destroy({ children: true });
  }
}
