import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { q, isActivePlayer, localPlayer } from '../world';
import type { Entity } from '../world';
import { text } from '../core/texts';
import { reportRejection } from '../core/errors';
import { GAME_WIDTH, GAME_HEIGHT, screenToWorld } from '../render/Camera';
import { pointer, pointerFree } from '../systems/InputSystem';
import { conditionsOn } from '../systems/Conditions';
import type { ShownCondition } from '../systems/Conditions';
import { RING_COLOURS } from '../systems/ConditionRingSystem';
import { hiddenHere } from '../systems/Invisibility';
import { conditionIconKey } from '../assets/ConditionIcons';
import { lazyTexture, requestArt } from '../assets/LazyArt';
import { PixelLabel, measureText } from './PixelText';
import { THEME } from './Theme';

/**
 * The pointer over a hero or a foe with a ring of a condition under it (systems/ConditionRingSystem.ts): a small see-through
 * card beside it with who it is and the conditions it is in — each its icon and its name in the ring's colour, nothing more
 * (what a condition does is told by the hero's own HUD, ui/PassiveHud.ts). Only for what this screen shows (an unseen
 * invisible foe shows nothing).
 */

/** A body is under the pointer within this far across its feet (px) and this far up its body. */
const PICK_WIDE = 12;
const PICK_HIGH = 34;
/** Below its feet the pointer still finds it over its ring this far down. */
const PICK_LOW = 6;
/** The card stands this far right of and above the pointer. */
const ANCHOR = 8;
/** The card's padding, its title's height, each condition's row (icon size) and the gap between icon and name. */
const PAD = 5;
const TITLE_H = 10;
const ROW_H = 12;
const ICON = 10;
const ICON_GAP = 4;
/** The most conditions a card lists (a body is rarely in more than a few). */
const MAX_ROWS = 10;
/** The card: its dark see-through fill, its edge, the inner line in the first condition's colour, the gold corner marks. */
const FILL = 0x07080a;
const FILL_ALPHA = 0.72;
const EDGE_ALPHA = 0.85;
const INNER_INSET = 2;
const INNER_ALPHA = 0.45;
const CORNER = 4;
const CORNER_ALPHA = 0.9;
/** The text's glyphs stand this far down their row. */
const TEXT_DROP = 2;

const held: ShownCondition[] = [];
const at = { x: 0, y: 0 };

/** Whether the world point lies over the body: its feet's ring, or its body over them. */
function over(body: Entity, x: number, y: number): boolean {
  if (!body.position) return false;
  const dx = Math.abs(x - body.position.x);
  const dy = y - body.position.y;
  return dx <= (body.radius?.x ?? 0) + PICK_WIDE && dy <= PICK_LOW && dy >= -PICK_HIGH;
}

/** The body with conditions under the pointer, if any: heroes on their feet first, then live foes. */
function bodyUnder(x: number, y: number): Entity | undefined {
  for (const hero of q.players) {
    if (isActivePlayer(hero) && over(hero, x, y) && conditionsOn(hero, held).length > 0) return hero;
  }
  for (const foe of q.mobs) {
    if (foe.health.current <= 0 || foe.removed || hiddenHere(foe) || !over(foe, x, y)) continue;
    if (conditionsOn(foe, held).length > 0) return foe;
  }
  return undefined;
}

/** Who the body is, for the card's title: a hero's name, a foe's kind. */
function nameOf(body: Entity): string {
  if (body.playerName) return body.playerName;
  return body.mobType ? text(`mob.${body.mobType}`) : text('condition.tip.title');
}

type Row = { icon: Sprite; label: PixelLabel; iconKey: string };

export class ConditionTip {
  readonly view = new Container();
  private readonly frame = new Graphics();
  private readonly title = new PixelLabel('', { color: THEME.title, shadow: true });
  private readonly rows: Row[] = [];
  /** What the card shows now (redrawn only when it changes), and its size. */
  private shown = '';
  private size = { w: 0, h: 0 };

  constructor() {
    this.view.visible = false;
    this.view.eventMode = 'none';
    this.title.position.set(PAD, PAD);
    this.view.addChild(this.frame, this.title);
    for (let i = 0; i < MAX_ROWS; i++) this.rows.push(this.makeRow(i));
  }

  private makeRow(i: number): Row {
    const y = PAD + TITLE_H + i * ROW_H;
    const icon = new Sprite(Texture.EMPTY);
    icon.position.set(PAD, y);
    const label = new PixelLabel('', { shadow: true });
    label.position.set(PAD + ICON + ICON_GAP, y + TEXT_DROP);
    this.view.addChild(icon, label);
    return { icon, label, iconKey: '' };
  }

  /** Shows a condition's icon in a row (loaded the first time it is asked for). */
  private setIcon(row: Row, key: string): void {
    if (row.iconKey === key) return;
    row.iconKey = key;
    const show = (): void => {
      if (row.icon.destroyed || row.iconKey !== key) return;
      row.icon.texture = lazyTexture(key);
      row.icon.scale.set(ICON / Math.max(1, row.icon.texture.width));
    };
    row.icon.texture = Texture.EMPTY;
    reportRejection(requestArt(key).then(show), `Icon ${key} did not load`, 'render');
  }

  /** The card's frame: a dark see-through fill, a thin edge, an inner line in the first condition's colour and gold corners. */
  private drawFrame(w: number, h: number, accent: number): void {
    const g = this.frame.clear();
    g.rect(0, 0, w, h).fill({ color: FILL, alpha: FILL_ALPHA }).stroke({ color: THEME.panelBorder, alpha: EDGE_ALPHA, width: 1, alignment: 1 });
    g.rect(INNER_INSET, INNER_INSET, w - INNER_INSET * 2, h - INNER_INSET * 2).stroke({ color: accent, alpha: INNER_ALPHA, width: 1, alignment: 1 });
    // Gold corner marks, an L at each corner.
    g.moveTo(0, CORNER).lineTo(0, 0).lineTo(CORNER, 0);
    g.moveTo(w - CORNER, 0).lineTo(w, 0).lineTo(w, CORNER);
    g.moveTo(w, h - CORNER).lineTo(w, h).lineTo(w - CORNER, h);
    g.moveTo(CORNER, h).lineTo(0, h).lineTo(0, h - CORNER);
    g.stroke({ color: THEME.title, alpha: CORNER_ALPHA, width: 1, alignment: 0.5 });
  }

  /** Lays the card out for a body's conditions (in `held`). */
  private layout(name: string): void {
    this.title.text = name;
    let width = measureText(name);
    this.rows.forEach((row, i) => {
      const condition = held[i];
      row.icon.visible = row.label.visible = condition !== undefined;
      if (condition === undefined) return;
      row.label.text = text(`condition.${condition}.name`);
      row.label.fill = RING_COLOURS[condition];
      this.setIcon(row, conditionIconKey(condition));
      width = Math.max(width, ICON + ICON_GAP + measureText(row.label.text));
    });
    this.size.w = Math.ceil(width) + PAD * 2;
    this.size.h = PAD * 2 + TITLE_H + Math.min(held.length, MAX_ROWS) * ROW_H - (ROW_H - ICON);
    this.drawFrame(this.size.w, this.size.h, RING_COLOURS[held[0]] ?? THEME.panelBorder);
  }

  /** Once a frame: the card of the body under the pointer, beside the pointer (kept on the screen), or none. */
  update(): void {
    const mouse = pointer();
    screenToWorld(mouse.x, mouse.y, at);
    const body = localPlayer() && pointerFree() ? bodyUnder(at.x, at.y) : undefined;
    if (!body) {
      this.view.visible = false;
      return;
    }
    const name = nameOf(body);
    const key = `${name}|${held.join(',')}`;
    if (key !== this.shown) {
      this.shown = key;
      this.layout(name);
    }
    const { w, h } = this.size;
    const x = mouse.x + ANCHOR + w > GAME_WIDTH ? mouse.x - ANCHOR - w : mouse.x + ANCHOR;
    const y = Math.max(0, Math.min(GAME_HEIGHT - h, mouse.y - ANCHOR - h));
    this.view.position.set(Math.round(x), Math.round(y));
    this.view.visible = true;
  }

  destroy(): void {
    this.view.visible = false;
  }
}
