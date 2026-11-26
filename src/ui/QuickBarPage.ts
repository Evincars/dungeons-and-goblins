import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { QUICK_ROW } from '../world';
import type { Player } from '../world';
import { text } from '../core/texts';
import { reportRejection } from '../core/errors';
import { lazyTexture, requestArt } from '../assets/LazyArt';
import { codeLabel, QUICK_KEYS } from '../game/Settings';
import { preparesSpells, requestLoadBindings } from '../game/PlayerActions';
import {
  PRESET_COUNT, barPresets, clearPreset, presetInUse, setShownSquares, shownSquares, snapshotBar, storePreset,
} from '../game/profile/QuickBarProfile';
import type { BarPreset } from '../game/profile/QuickBarProfile';
import { UNBOUND, quickBinding } from '../rules/Spellbook';
import type { QuickBinding } from '../rules/Spellbook';
import type { TipTopic } from './InfoTooltip';
import { PixelButton } from './PixelButton';
import { PixelLabel } from './PixelText';
import { bindingIconKey, bindingName } from './QuickBar';
import { drawRichLines, wrapRuns } from './TipText';
import { THEME } from './Theme';

/** The page's area (the gear panel's, in the inventory's design space). */
type Area = { x: number; y: number; w: number; h: number };

/** Padding inside the page, and the space under a heading. */
const PAD = 8;
const HEADING_GAP = 12;
const LINE_H = 10;
/** The squares-shown strip: a square per quick key, this big and this far apart; the steppers beside it. */
const KEY_SQUARE = 18;
const KEY_GAP = 3;
const STEP = 14;
/** A preset's card: this tall, this far apart, its icons this big (with this gap), its buttons this wide and tall. */
const CARD_H = 46;
const CARD_GAP = 5;
const CARD_PAD = 5;
const MINI = 11;
const MINI_GAP = 1;
const CARD_BUTTON_W = 40;
const CARD_BUTTON_H = 12;
const CARD_BUTTON_GAP = 2;
/** A press that would lose something (saving over a preset, loading over a bar saved nowhere, clearing) asks for a second press within this long. */
const CONFIRM_MS = 2500;
/** Colours: a lit key square, an unlit one, a card's frame (gold for the preset in use), the hint away from a safe room. */
const KEY_LIT = 0xe8c66a;
const KEY_DIM = 0x4a515c;
const WELL_ALPHA = 0.55;
const CARD_FILL_ALPHA = 0.35;
const CARD_EDGE = 0xb4a488;
const CARD_EDGE_ALPHA = 0.35;
const IN_USE = 0x7ddc7d;
const AWAY = 0xffb060;
/** Icons of squares past those the bar shows are drawn faint (they are kept, just not shown). */
const HIDDEN_ALPHA = 0.3;
const EMPTY_ALPHA = 0.25;

type Action = 'load' | 'save' | 'clear';
/** A spot of the page that tells something under the pointer. */
type Tip = { rect: Rectangle; topic: () => TipTopic };

/**
 * The inventory's Quick bar tab: how many of the bar's squares show (a fighter may want only four), and three presets of
 * the whole bar (both rows) for each hero class, kept between games (game/profile/QuickBarProfile.ts): Save keeps the bar
 * as it is, Load (in a safe room only) puts a preset back on it, Clear empties one. A press that would lose something asks
 * for a second press first ("Sure?"). The page is drawn again only when what it shows changes.
 */
export class QuickBarPage {
  readonly view = new Container();
  private shown = '';
  private tips: Tip[] = [];
  /** The press waiting for its second one: which preset, which button, until when. */
  private armed: { index: number; action: Action; until: number } | null = null;
  private player: Player | null = null;

  constructor(private readonly area: Area) {}

  /** Called every update while the tab is open: drawn again when the bar, the presets or the safe room change. */
  update(player: Player): void {
    this.player = player;
    if (this.armed && performance.now() > this.armed.until) this.armed = null;
    const key = this.signature(player);
    if (key === this.shown) return;
    this.shown = key;
    this.draw(player);
  }

  private signature(player: Player): string {
    const presets = barPresets(player.heroClass).map((p) => (p ? `${p.savedAt}:${presetInUse(p, player)}` : '-'));
    const armed = this.armed ? `${this.armed.index}${this.armed.action}` : '';
    return [player.heroClass, shownSquares(player.heroClass), preparesSpells(player), armed, ...presets, JSON.stringify(snapshotBar(player))].join('|');
  }

  /** What the page tells at a point (its design space), if anything. */
  topicAt(x: number, y: number): TipTopic | null {
    if (!this.view.visible) return null;
    return this.tips.find((tip) => tip.rect.contains(x, y))?.topic() ?? null;
  }

  private draw(player: Player): void {
    for (const child of this.view.removeChildren()) child.destroy({ children: true });
    this.tips = [];
    const { x, w } = this.area;
    let y = this.area.y + PAD;
    y = this.drawSquares(player, x + PAD, y, w - 2 * PAD);
    this.drawPresets(player, x + PAD, y, w - 2 * PAD);
  }

  // ── Squares shown ──────────────────────────────────────────────────────────

  /** The heading, a square per quick key (lit up to the count, a click sets it), − and + beside them, and a hint. */
  private drawSquares(player: Player, x: number, y: number, w: number): number {
    const cls = player.heroClass;
    const count = shownSquares(cls);
    this.label(text('bar.squares'), x, y, THEME.title);
    const top = y + HEADING_GAP;
    for (let i = 0; i < QUICK_ROW; i++) this.keySquare(i, i < count, x + i * (KEY_SQUARE + KEY_GAP), top, cls);
    const stepX = x + QUICK_ROW * (KEY_SQUARE + KEY_GAP) + KEY_GAP;
    const stepY = top + (KEY_SQUARE - STEP) / 2;
    const fewer = this.button('-', stepX, stepY, STEP, STEP, () => setShownSquares(cls, count - 1));
    fewer.setEnabled(count > 1);
    const more = this.button('+', stepX + STEP + KEY_GAP, stepY, STEP, STEP, () => setShownSquares(cls, count + 1));
    more.setEnabled(count < QUICK_ROW);
    this.tip(new Rectangle(stepX, stepY, STEP, STEP), () => ({ title: text('bar.fewer'), body: this.squaresBody(count - 1) }));
    this.tip(new Rectangle(stepX + STEP + KEY_GAP, stepY, STEP, STEP), () => ({ title: text('bar.more'), body: this.squaresBody(count + 1) }));
    return this.paragraph(text('bar.squares_hint'), x, top + KEY_SQUARE + 4, w, THEME.muted) + PAD;
  }

  private squaresBody(count: number): string {
    const shown = Math.max(1, Math.min(QUICK_ROW, count));
    return text('bar.tip.squares_body', { count: shown, key: codeLabel(QUICK_KEYS[shown - 1]) });
  }

  /** One quick key's square: lit when the bar shows it; a click shows the bar up to it. */
  private keySquare(i: number, lit: boolean, x: number, y: number, cls: Player['heroClass']): void {
    const square = new Container();
    square.position.set(x, y);
    const frame = new Graphics();
    const draw = (hovered: boolean): void => {
      const edge = lit || hovered ? KEY_LIT : KEY_DIM;
      frame.clear().rect(0, 0, KEY_SQUARE, KEY_SQUARE).fill({ color: 0x000000, alpha: WELL_ALPHA })
        .stroke({ color: edge, alpha: lit ? 1 : hovered ? 0.7 : 0.6, width: 1, alignment: 1 });
      if (lit) frame.rect(2, 2, KEY_SQUARE - 4, KEY_SQUARE - 4).fill({ color: KEY_LIT, alpha: hovered ? 0.22 : 0.12 });
    };
    draw(false);
    const key = new PixelLabel(codeLabel(QUICK_KEYS[i]), { color: lit ? THEME.buttonHover : KEY_DIM, align: 'center', shadow: true });
    key.position.set(KEY_SQUARE / 2, (KEY_SQUARE - 8) / 2);
    square.addChild(frame, key);
    square.eventMode = 'static';
    square.cursor = 'pointer';
    square.hitArea = new Rectangle(0, 0, KEY_SQUARE, KEY_SQUARE);
    square.on('pointerover', () => draw(true));
    square.on('pointerout', () => draw(false));
    square.on('pointertap', () => setShownSquares(cls, i + 1));
    this.view.addChild(square);
    this.tip(new Rectangle(x, y, KEY_SQUARE, KEY_SQUARE), () => ({ title: text('bar.tip.squares'), body: this.squaresBody(i + 1) }));
  }

  // ── Presets ────────────────────────────────────────────────────────────────

  private drawPresets(player: Player, x: number, y: number, w: number): void {
    const safe = preparesSpells(player);
    this.label(text('bar.presets'), x, y, THEME.title);
    const top = this.paragraph(text(safe ? 'bar.presets_safe' : 'bar.presets_away'), x, y + HEADING_GAP, w, safe ? THEME.muted : AWAY) + 4;
    const presets = barPresets(player.heroClass);
    const saved = presets.some((preset) => preset && presetInUse(preset, player));
    for (let i = 0; i < PRESET_COUNT; i++) this.card(player, i, presets[i], { safe, saved }, x, top + i * (CARD_H + CARD_GAP), w);
  }

  /** A preset's card: its name (and IN USE), its bar in small icons (both rows), and Load, Save and Clear down its right side. */
  private card(player: Player, index: number, preset: BarPreset | null, state: { safe: boolean; saved: boolean }, x: number, y: number, w: number): void {
    const inUse = !!preset && presetInUse(preset, player);
    const frame = new Graphics().rect(x, y, w, CARD_H).fill({ color: 0x000000, alpha: CARD_FILL_ALPHA })
      .stroke({ color: inUse ? THEME.title : CARD_EDGE, alpha: inUse ? 0.9 : CARD_EDGE_ALPHA, width: 1, alignment: 1 });
    this.view.addChild(frame);
    const name = this.label(text('bar.preset_name', { n: index + 1 }), x + CARD_PAD, y + CARD_PAD, inUse ? THEME.title : THEME.buttonText);
    const after = x + CARD_PAD + name.textWidth + 6;
    if (inUse) this.label(text('bar.in_use'), after, y + CARD_PAD, IN_USE);
    else if (preset) this.label(text('bar.summary', { bound: boundCount(preset) }), after, y + CARD_PAD, THEME.muted);
    const iconsY = y + CARD_PAD + LINE_H + 2;
    if (preset) this.miniBar(player, preset, x + CARD_PAD, iconsY);
    else this.label(text('bar.empty'), x + CARD_PAD, iconsY + MINI / 2, THEME.muted);
    this.cardButtons(player, index, preset, { ...state, inUse }, x + w - CARD_PAD - CARD_BUTTON_W, y + (CARD_H - 3 * CARD_BUTTON_H - 2 * CARD_BUTTON_GAP) / 2);
  }

  private cardButtons(player: Player, index: number, preset: BarPreset | null, state: { safe: boolean; saved: boolean; inUse: boolean }, x: number, y: number): void {
    const cls = player.heroClass;
    const canLoad = !!preset && state.safe && !state.inUse;
    const rows: { action: Action; enabled: boolean; risky: boolean; run: () => void; topic: () => TipTopic }[] = [
      {
        action: 'load', enabled: canLoad, risky: !state.saved, run: () => { if (preset) requestLoadBindings(player, preset.bound); },
        topic: () => ({ title: text('bar.tip.load'), body: text('bar.tip.load_body'), detail: this.loadDetail(preset, state) }),
      },
      {
        action: 'save', enabled: !state.inUse, risky: !!preset, run: () => storePreset(cls, index, snapshotBar(player)),
        topic: () => ({ title: text('bar.tip.save'), body: text('bar.tip.save_body'), detail: preset && !state.inUse ? [{ text: text('bar.tip.save_over'), color: AWAY }] : [] }),
      },
      {
        action: 'clear', enabled: !!preset, risky: true, run: () => clearPreset(cls, index),
        topic: () => ({ title: text('bar.tip.clear'), body: text('bar.tip.clear_body'), detail: preset ? [{ text: text('bar.tip.confirm'), color: THEME.muted }] : [] }),
      },
    ];
    rows.forEach((row, i) => {
      const by = y + i * (CARD_BUTTON_H + CARD_BUTTON_GAP);
      const armed = this.armed?.index === index && this.armed.action === row.action;
      const button = this.button(armed ? text('bar.sure') : text(`bar.${row.action}`), x, by, CARD_BUTTON_W, CARD_BUTTON_H, () => this.press(index, row.action, row.risky, row.run));
      button.setEnabled(row.enabled);
      button.setSelected(armed);
      this.tip(new Rectangle(x, by, CARD_BUTTON_W, CARD_BUTTON_H), row.topic);
    });
  }

  /** Why Load cannot be pressed, or what pressing it would lose. */
  private loadDetail(preset: BarPreset | null, state: { safe: boolean; saved: boolean; inUse: boolean }): TipTopic['detail'] {
    if (!preset) return [{ text: text('bar.tip.load_empty'), color: AWAY }];
    if (!state.safe) return [{ text: text('bar.tip.load_away'), color: AWAY }];
    if (state.inUse) return [{ text: text('bar.tip.load_in_use'), color: IN_USE }];
    return state.saved ? [] : [{ text: text('bar.tip.load_unsaved'), color: AWAY }];
  }

  /** A press: done at once, or (when it would lose something) on the second press while "Sure?" shows. */
  private press(index: number, action: Action, risky: boolean, run: () => void): void {
    const confirmed = this.armed?.index === index && this.armed.action === action;
    if (risky && !confirmed) {
      this.armed = { index, action, until: performance.now() + CONFIRM_MS };
      this.redraw();
      return;
    }
    this.armed = null;
    run();
    this.redraw();
  }

  private redraw(): void {
    this.shown = '';
    if (this.player) this.update(this.player);
  }

  /** A preset's bar in small icons: the first row, and under it the second (Shift); squares the bar does not show are faint. */
  private miniBar(player: Player, preset: BarPreset, x: number, y: number): void {
    // The preset as the hero's bar would be: its squares left to the class show the class's own.
    const book = { recovery: player.spellbook?.recovery ?? [], bound: preset.bound };
    const preview: Player = { ...player, spellbook: book };
    const count = shownSquares(player.heroClass);
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < QUICK_ROW; i++) this.mini(quickBinding(preview, row * QUICK_ROW + i), player, x + i * (MINI + MINI_GAP), y + row * (MINI + MINI_GAP), i < count);
    }
    this.label(text('bar.shift_row'), x + QUICK_ROW * (MINI + MINI_GAP) + 3, y + MINI + MINI_GAP + 2, THEME.muted);
  }

  /** One small square of a preset: its icon, or the first letters of its name. */
  private mini(binding: QuickBinding | null, player: Player, x: number, y: number, shown: boolean): void {
    const cell = new Container();
    cell.position.set(x, y);
    cell.alpha = shown ? 1 : HIDDEN_ALPHA;
    cell.addChild(new Graphics().rect(0, 0, MINI, MINI).fill({ color: 0x000000, alpha: WELL_ALPHA })
      .stroke({ color: CARD_EDGE, alpha: binding ? CARD_EDGE_ALPHA : EMPTY_ALPHA, width: 1, alignment: 1 }));
    this.view.addChild(cell);
    if (!binding) return;
    const key = bindingIconKey(binding, player.heroClass);
    if (!key) {
      const initial = new PixelLabel(bindingName(binding, player.heroClass).slice(0, 1).toUpperCase(), { color: THEME.buttonText, align: 'center' });
      initial.position.set(MINI / 2, 1);
      cell.addChild(initial);
      return;
    }
    const icon = new Sprite(Texture.EMPTY);
    icon.position.set(1, 1);
    cell.addChild(icon);
    const show = (): void => {
      if (icon.destroyed) return;
      icon.texture = lazyTexture(key);
      icon.scale.set((MINI - 2) / Math.max(1, icon.texture.width));
    };
    reportRejection(requestArt(key).then(show), `Preset icon ${binding.spell} did not load`, 'render');
  }

  // ── Pieces ─────────────────────────────────────────────────────────────────

  private label(content: string, x: number, y: number, color: number): PixelLabel {
    const label = new PixelLabel(content, { color, shadow: true });
    label.position.set(Math.round(x), Math.round(y));
    this.view.addChild(label);
    return label;
  }

  /** A paragraph wrapped to `w`; returns the y under it. */
  private paragraph(content: string, x: number, y: number, w: number, color: number): number {
    const lines = wrapRuns([{ text: content, color }], w);
    const box = new Container();
    drawRichLines(box, lines, Math.round(x), Math.round(y));
    this.view.addChild(box);
    return y + lines.length * LINE_H;
  }

  private button(label: string, x: number, y: number, w: number, h: number, press: () => void): PixelButton {
    const button = new PixelButton(label, w, h);
    button.position.set(Math.round(x), Math.round(y));
    button.onPress = press;
    this.view.addChild(button);
    return button;
  }

  private tip(rect: Rectangle, topic: () => TipTopic): void {
    this.tips.push({ rect, topic });
  }
}

/** How many squares of a preset hold something of the hero's choosing (not left to the class, not emptied). */
function boundCount(preset: BarPreset): number {
  return preset.bound.filter((binding) => binding && binding.spell !== UNBOUND).length;
}
