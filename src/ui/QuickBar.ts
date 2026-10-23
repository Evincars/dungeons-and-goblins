import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { QUICK_SLOTS } from '../world';
import type { Player } from '../world';
import { GAME_HEIGHT, GAME_WIDTH } from '../render/Camera';
import { frameTexture } from '../render/Sheets';
import { requestArt } from '../assets/LazyArt';
import { EFFECT_COLOURS, EFFECT_SHAPES, effectSheetKey } from '../assets/Effects';
import { chooseQuickSlot, chosenQuickSlot, claimPointer } from '../systems/InputSystem';
import { heroClass, spellLevelFor } from '../rules/Classes';
import { SPELLS, TICKS_PER_SECOND } from '../rules/Spells';
import type { SpellDef, SpellId } from '../rules/Spells';
import { formatDice } from '../rules/Dice';
import { damageTypeName, spellDescription, spellName } from '../rules/Names';
import { statShort } from '../entities/Items';
import { reportRejection } from '../core/errors';
import { text } from '../core/texts';
import { InfoTooltip } from './InfoTooltip';
import type { TipTopic } from './InfoTooltip';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

/** The squares: this big, this far apart, this far up from the bottom edge. */
const SLOT = 22;
const SLOT_GAP = 3;
const MARGIN = 8;
const SLOT_FILL_ALPHA = 0.55;
const SLOT_EDGE = 0xb4a488;
const SLOT_EDGE_ALPHA = 0.6;
/** Effect frames are 64 px with room round the flash: drawn this much bigger than the square, clipped to it. */
const EFFECT_FRAME = 64;
const ICON_ZOOM = 1.7;
/** A spell recovering is shaded from the top by the share of its recovery left; one not learnt yet is dimmed. */
const SHADE_ALPHA = 0.65;
const LOCKED_ALPHA = 0.3;

type SlotView = {
  frame: Graphics;
  icon: Sprite;
  shade: Graphics;
  /** What it was last drawn as, so it is drawn again only when that changes. */
  spell: SpellId | null;
  active: boolean;
  locked: boolean;
  shadeH: number;
};

/** The effect a spell strikes with, at the middle of its animation (its brightest), as the spell's picture. */
function showIcon(view: SlotView, def: SpellDef): void {
  const { shape, colour } = def.effect;
  const key = effectSheetKey(shape);
  const frame = Math.floor(EFFECT_SHAPES[shape][2] / 2);
  view.icon.texture = Texture.EMPTY;
  const show = (): void => {
    if (view.spell === def.id) view.icon.texture = frameTexture(key, frame, EFFECT_COLOURS.indexOf(colour));
  };
  reportRejection(requestArt(key).then(show), `Spell icon ${def.id} did not load`, 'render');
}

/** What a square's spell does, for its tooltip. */
function spellTopic(def: SpellDef | null, level: number, castWith: Player['heroClass']): TipTopic {
  if (!def) return { title: text('hud.slot.empty'), body: text('hud.slot.empty_body') };
  const seconds = (def.recoveryTicks / TICKS_PER_SECOND).toFixed(1);
  const cls = heroClass(castWith);
  const ability = statShort(cls.spellcasting ?? 'intelligence');
  const detail = [def.kind === 'heal'
    ? text('hud.slot.heal_detail', { dice: formatDice(def.damage), ability, seconds })
    : text('hud.slot.detail', { dice: formatDice(def.damage), type: damageTypeName(def.damageType), seconds })];
  const learntAt = spellLevelFor(cls, def.id);
  if (level < learntAt) detail.push(text('hud.slot.locked', { level: learntAt }));
  return { title: spellName(def.id), body: spellDescription(def.id), detail };
}

/**
 * The quick bar, bottom middle: five squares holding the hero's spells in their class's order, picked with
 * keys 1–5 or a click. Each shows its spell's effect; a spell recovering is shaded by the time it has left,
 * one not learnt yet is dimmed. The picked square is edged in gold; under the pointer a square says what its
 * spell does.
 */
export class QuickBar {
  readonly view = new Container();
  private readonly slots: SlotView[] = [];
  private readonly tip = new InfoTooltip();
  private hovered = -1;
  /** The tooltip as last worked out, and for which square and level (it changes with neither otherwise). */
  private topic: { slot: number; level: number; tip: TipTopic } | null = null;

  constructor() {
    this.view.eventMode = 'passive';
    for (let i = 0; i < QUICK_SLOTS; i++) this.addSlot(i);
    this.view.addChild(this.tip.view);
  }

  private addSlot(i: number): void {
    const total = QUICK_SLOTS * SLOT + (QUICK_SLOTS - 1) * SLOT_GAP;
    const x = Math.round((GAME_WIDTH - total) / 2) + i * (SLOT + SLOT_GAP);
    const y = GAME_HEIGHT - MARGIN - SLOT;
    const square = new Container();
    square.position.set(x, y);
    const frame = new Graphics();
    const icon = new Sprite();
    icon.anchor.set(0.5);
    icon.position.set(SLOT / 2, SLOT / 2);
    icon.scale.set((SLOT / EFFECT_FRAME) * ICON_ZOOM);
    const mask = new Graphics().rect(1, 1, SLOT - 2, SLOT - 2).fill({ color: 0xffffff });
    icon.mask = mask;
    const shade = new Graphics();
    const number = new PixelLabel(String(i + 1), { color: THEME.buttonText, align: 'right', outline: true });
    number.position.set(SLOT - 1, SLOT - 9);
    square.addChild(frame, mask, icon, shade, number);
    square.eventMode = 'static';
    square.cursor = 'pointer';
    square.hitArea = new Rectangle(0, 0, SLOT, SLOT);
    square.on('pointerover', () => { this.hovered = i; claimPointer(square, true); });
    square.on('pointerout', () => { if (this.hovered === i) this.hovered = -1; claimPointer(square, false); });
    square.on('pointertap', () => chooseQuickSlot(i));
    this.slots.push({ frame, icon, shade, spell: null, active: false, locked: false, shadeH: -1 });
    this.view.addChild(square);
    this.drawFrame(this.slots[i]);
  }

  /** A dark well; the picked one edged in gold. */
  private drawFrame(view: SlotView): void {
    view.frame.clear().rect(0, 0, SLOT, SLOT).fill({ color: 0x000000, alpha: SLOT_FILL_ALPHA })
      .stroke({ color: view.active ? THEME.title : SLOT_EDGE, alpha: view.active ? 1 : SLOT_EDGE_ALPHA, width: view.active ? 2 : 1, alignment: 1 });
  }

  /** One square for the player's spell in it: its picture, whether it is picked, learnt and recovering. */
  private updateSlot(view: SlotView, i: number, player: Player): void {
    const id = heroClass(player.heroClass).spells[i] ?? null;
    const def = id ? SPELLS[id] : null;
    if (view.spell !== id) {
      view.spell = id;
      view.icon.visible = !!def;
      if (def) showIcon(view, def);
    }
    const active = chosenQuickSlot() === i;
    if (view.active !== active) {
      view.active = active;
      this.drawFrame(view);
    }
    const locked = !!id && player.playerStats.level < spellLevelFor(heroClass(player.heroClass), id);
    if (view.locked !== locked) {
      view.locked = locked;
      view.icon.alpha = locked ? LOCKED_ALPHA : 1;
    }
    const left = def ? (player.spellbook?.recovery[i] ?? 0) : 0;
    const shadeH = def && left > 0 ? Math.ceil(SLOT * Math.min(1, left / def.recoveryTicks)) : 0;
    if (view.shadeH === shadeH) return;
    view.shadeH = shadeH;
    view.shade.clear();
    if (shadeH > 0) view.shade.rect(0, 0, SLOT, shadeH).fill({ color: 0x000000, alpha: SHADE_ALPHA });
  }

  update(player: Player | undefined): void {
    if (!player) return;
    this.slots.forEach((view, i) => this.updateSlot(view, i, player));
    this.updateTip(player);
  }

  /** The tooltip of the square under the pointer, above the bar. */
  private updateTip(player: Player): void {
    const view = this.slots[this.hovered];
    if (!view) {
      this.tip.hide();
      return;
    }
    const level = player.playerStats.level;
    if (this.topic?.slot !== this.hovered || this.topic.level !== level) {
      this.topic = { slot: this.hovered, level, tip: spellTopic(view.spell ? SPELLS[view.spell] : null, level, player.heroClass) };
    }
    const total = QUICK_SLOTS * SLOT + (QUICK_SLOTS - 1) * SLOT_GAP;
    const x = Math.round((GAME_WIDTH - total) / 2) + this.hovered * (SLOT + SLOT_GAP);
    // Shown above the bar: kept inside an area that ends just over the squares.
    this.tip.show(this.topic.tip, x, 0, { w: GAME_WIDTH, h: GAME_HEIGHT - MARGIN - SLOT - 2 });
  }

  destroy(): void {
    for (const view of this.slots) view.icon.mask = null;
    this.tip.hide();
  }
}
