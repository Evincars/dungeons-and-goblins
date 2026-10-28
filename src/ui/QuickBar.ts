import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { QUICK_ROW } from '../world';
import type { Player } from '../world';
import { GAME_HEIGHT, GAME_WIDTH } from '../render/Camera';
import { frameTexture } from '../render/Sheets';
import { requestArt } from '../assets/LazyArt';
import { EFFECT_COLOURS, EFFECT_SHAPES, effectSheetKey } from '../assets/Effects';
import { chooseQuickSlot, chosenQuickSlot, claimPointer, quickRow } from '../systems/InputSystem';
import { codeLabel, QUICK_KEYS } from '../game/Settings';
import { isInventoryOpen } from '../systems/InventorySystem';
import { heroClass, spellLevelFor } from '../rules/Classes';
import { SPELLS, TICKS_PER_SECOND, isSpellId } from '../rules/Spells';
import type { SpellDef } from '../rules/Spells';
import { CATALOG, castDef, quickBinding } from '../rules/Spellbook';
import type { CatalogSpell, QuickBinding } from '../rules/Spellbook';
import { abandonBinding, cancelBinding, finishBinding, pendingBinding, setOverQuickSquare } from '../game/SpellBinding';
import { bindingFeatureId, featureOfClass } from '../rules/ClassFeatures';
import type { FeatureDef } from '../rules/ClassFeatures';
import { reportRejection } from '../core/errors';
import { text } from '../core/texts';
import { InfoTooltip } from './InfoTooltip';
import type { TipTopic } from './InfoTooltip';
import { PixelLabel } from './PixelText';
import { featureTopic, spellTopic } from './SpellTopics';
import { THEME } from './Theme';

/** The squares: this big, this far apart, this far up from the bottom edge (the bar shrinks when the screen is too narrow). */
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
/** A spell with no picture yet shows the first letters of its name. */
const INITIALS = 2;
/** While a spell waits for a square, the squares swell and shrink (updates for one breath, and how much they grow). */
const BREATH_PERIOD = 60;
const BREATH_SWELL = 0.25;
/** The prompt while a spell waits for a square sits this far above the squares. */
const PROMPT_GAP = 14;
/** A square of the second row names its key with this before it ("sQ": Shift and Q). */
const SHIFT_MARK = 's';

type SlotView = {
  square: Container;
  frame: Graphics;
  icon: Sprite;
  shade: Graphics;
  /** The initials of a spell that has no effect to show, and the level it is cast at (when above its own). */
  initials: PixelLabel;
  levelTag: PixelLabel;
  /** The key that casts it ("Q", or "sQ" in the second row). */
  keyTag: PixelLabel;
  /** What it was last drawn as, so it is drawn again only when that changes. */
  bound: string | null;
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
    if (view.bound?.startsWith(def.id)) view.icon.texture = frameTexture(key, frame, EFFECT_COLOURS.indexOf(colour));
  };
  reportRejection(requestArt(key).then(show), `Spell icon ${def.id} did not load`, 'render');
}

const bindingKey = (b: QuickBinding | null): string | null => (b ? `${b.spell}/${b.level}` : null);

/** The class feature a binding names, for a hero of this class. */
function featureOfBinding(binding: QuickBinding | null, castWith: Player['heroClass']): FeatureDef | null {
  const id = binding ? bindingFeatureId(binding.spell) : null;
  return (id && featureOfClass(heroClass(castWith).dndClass, id)) || null;
}

/** What a binding is called (a spell's or a feature's name). */
function bindingName(binding: QuickBinding, castWith: Player['heroClass']): string {
  return featureOfBinding(binding, castWith)?.name ?? CATALOG[binding.spell]?.name ?? binding.spell;
}

/** What a square's spell does, for its tooltip. */
function slotTopic(binding: QuickBinding | null, heroLevel: number, castWith: Player['heroClass']): TipTopic {
  if (!binding) return { title: text('hud.slot.empty'), body: text('hud.slot.empty_body') };
  const feature = featureOfBinding(binding, castWith);
  if (feature) return featureTopic(feature, false);
  const spell: CatalogSpell = CATALOG[binding.spell];
  const cls = heroClass(castWith);
  const learntAt = isSpellId(binding.spell) ? spellLevelFor(cls, binding.spell) : undefined;
  const topic = spellTopic(spell, binding.level, heroLevel, learntAt);
  return isSpellId(binding.spell) ? topic : { ...topic, detail: [...(topic.detail ?? []), text('hud.slot.not_worked')] };
}

/**
 * The quick bar, bottom middle: a row of squares on the keys Q R T 1–5 X C holding the spells the hero bound there
 * (until they bind some, their class's own in order); a key casts its square at once, a click only picks it for right
 * click. While Shift is held the bar shows its second row, which the same keys with Shift cast (its squares default
 * to the hero's active class features). Each square shows its spell's effect; a spell recovering is shaded by the time
 * it has left, one not learnt yet is dimmed. The picked square is edged in gold; under the pointer a square says what
 * its spell does. While a spell from the inventory waits for a square, they all swell and shrink, and a click on one
 * binds it there (hold Shift to bind into the second row).
 */
export class QuickBar {
  readonly view = new Container();
  /** The squares, laid out at full size and scaled down as one when the space between the HUD's corners is too narrow. */
  private readonly row = new Container();
  private readonly slots: SlotView[] = [];
  /** The row shown (0, or 1 while Shift is held), so the key tags are rewritten only when it changes. */
  private shownRow = -1;
  private readonly left: number;
  private readonly scale: number;
  private readonly tip = new InfoTooltip();
  private readonly prompt = new PixelLabel('', { color: THEME.title, align: 'center', outline: true });
  private hovered = -1;
  /** The tooltip as last worked out, and for which square, spell and level (it changes with none of them otherwise). */
  private topic: { slot: number; bound: string | null; level: number; tip: TipTopic } | null = null;
  private player: Player | undefined;
  /** Updates spent waiting for a square, which the breathing goes by. */
  private breath = 0;

  /**
   * `freeLeft`, `freeRight`: the stretch of the bottom edge the bar may use (between the bars and buttons on the left
   * and the combat log on the right). It sits in the middle of the screen when it fits there.
   */
  constructor(freeLeft = 0, freeRight = GAME_WIDTH) {
    this.view.eventMode = 'passive';
    this.row.eventMode = 'passive';
    const full = QUICK_ROW * SLOT + (QUICK_ROW - 1) * SLOT_GAP;
    this.scale = Math.min(1, (freeRight - freeLeft) / full);
    const width = full * this.scale;
    this.left = Math.round(Math.min(Math.max(freeLeft, (GAME_WIDTH - width) / 2), freeRight - width));
    this.row.scale.set(this.scale);
    this.row.position.set(this.left, this.top);
    for (let i = 0; i < QUICK_ROW; i++) this.addSlot(i);
    this.prompt.position.set(Math.round(this.left + width / 2), this.top - PROMPT_GAP);
    this.prompt.visible = false;
    this.view.addChild(this.row, this.prompt, this.tip.view);
  }

  /** The squares' top edge on screen. */
  private get top(): number {
    return Math.round(GAME_HEIGHT - MARGIN - SLOT * this.scale);
  }

  /** A square's left edge within the row. */
  private slotX(i: number): number {
    return i * (SLOT + SLOT_GAP);
  }

  /** The quick-bar square (counting both rows) that the `i`th square on screen stands for now. */
  private slotAt(i: number): number {
    return Math.max(0, this.shownRow) * QUICK_ROW + i;
  }

  private addSlot(i: number): void {
    const square = new Container();
    // Scaled about its middle when the squares breathe.
    square.pivot.set(SLOT / 2, SLOT / 2);
    square.position.set(this.slotX(i) + SLOT / 2, SLOT / 2);
    const frame = new Graphics();
    const icon = new Sprite();
    icon.anchor.set(0.5);
    icon.position.set(SLOT / 2, SLOT / 2);
    icon.scale.set((SLOT / EFFECT_FRAME) * ICON_ZOOM);
    const mask = new Graphics().rect(1, 1, SLOT - 2, SLOT - 2).fill({ color: 0xffffff });
    icon.mask = mask;
    const shade = new Graphics();
    const initials = new PixelLabel('', { color: THEME.buttonText, align: 'center', shadow: true });
    initials.position.set(SLOT / 2, SLOT / 2 - 4);
    const levelTag = new PixelLabel('', { color: THEME.title, outline: true });
    levelTag.position.set(2, 2);
    const keyTag = new PixelLabel(codeLabel(QUICK_KEYS[i]), { color: THEME.buttonText, align: 'right', outline: true });
    keyTag.position.set(SLOT - 1, SLOT - 9);
    square.addChild(frame, mask, icon, initials, shade, levelTag, keyTag);
    square.eventMode = 'static';
    square.cursor = 'pointer';
    square.hitArea = new Rectangle(0, 0, SLOT, SLOT);
    square.on('pointerover', () => { this.hovered = i; claimPointer(square, true); setOverQuickSquare(true); });
    square.on('pointerout', () => { if (this.hovered === i) this.hovered = -1; claimPointer(square, false); setOverQuickSquare(false); });
    square.on('pointertap', () => this.pick(i));
    this.slots.push({ square, frame, icon, shade, initials, levelTag, keyTag, bound: null, active: false, locked: false, shadeH: -1 });
    this.row.addChild(square);
    this.drawFrame(this.slots[i]);
  }

  /** A click on a square: it binds the spell waiting for one, or else picks the square (in the row shown). */
  private pick(i: number): void {
    const slot = this.slotAt(i);
    if (pendingBinding() && this.player) finishBinding(this.player, slot);
    else chooseQuickSlot(slot);
  }

  /** A dark well; the picked one edged in gold. */
  private drawFrame(view: SlotView): void {
    view.frame.clear().rect(0, 0, SLOT, SLOT).fill({ color: 0x000000, alpha: SLOT_FILL_ALPHA })
      .stroke({ color: view.active ? THEME.title : SLOT_EDGE, alpha: view.active ? 1 : SLOT_EDGE_ALPHA, width: view.active ? 2 : 1, alignment: 1 });
  }

  /** A square shows a new spell: its picture (or initials, for a spell with none yet) and the level it is cast at. */
  private showBinding(view: SlotView, binding: QuickBinding | null, castWith: Player['heroClass']): void {
    view.bound = bindingKey(binding);
    const spell = binding ? CATALOG[binding.spell] : null;
    const worked = !!binding && isSpellId(binding.spell);
    view.icon.visible = worked;
    if (binding && isSpellId(binding.spell)) showIcon(view, SPELLS[binding.spell]);
    view.initials.text = binding && !worked ? bindingName(binding, castWith).slice(0, INITIALS).toUpperCase() : '';
    view.levelTag.text = binding && spell && binding.level > spell.level ? text('skills.cast_level', { level: binding.level }) : '';
  }

  /** One square for the player's spell in it: its picture, whether it is picked, learnt and recovering. */
  private updateSlot(view: SlotView, slot: number, player: Player): void {
    const binding = quickBinding(player, slot);
    if (view.bound !== bindingKey(binding)) this.showBinding(view, binding, player.heroClass);
    const active = chosenQuickSlot() === slot;
    if (view.active !== active) {
      view.active = active;
      this.drawFrame(view);
    }
    const locked = !!binding && isSpellId(binding.spell) && player.playerStats.level < spellLevelFor(heroClass(player.heroClass), binding.spell);
    if (view.locked !== locked) {
      view.locked = locked;
      view.icon.alpha = locked ? LOCKED_ALPHA : 1;
    }
    this.updateShade(view, binding, player.spellbook?.recovery[slot] ?? 0, player);
  }

  /** The shade over a spell recovering, by the share of its recovery left. */
  private updateShade(view: SlotView, binding: QuickBinding | null, left: number, player: Player): void {
    const spell = binding && isSpellId(binding.spell) ? castDef(SPELLS[binding.spell], binding.level, player.playerStats.level) : null;
    const feature = featureOfBinding(binding, player.heroClass);
    const total = spell ? spell.recoveryTicks : feature ? feature.cooldown * TICKS_PER_SECOND : 0;
    const shadeH = total > 0 && left > 0 ? Math.ceil(SLOT * Math.min(1, left / total)) : 0;
    if (view.shadeH === shadeH) return;
    view.shadeH = shadeH;
    view.shade.clear();
    if (shadeH > 0) view.shade.rect(0, 0, SLOT, shadeH).fill({ color: 0x000000, alpha: SHADE_ALPHA });
  }

  update(player: Player | undefined): void {
    this.player = player;
    if (!player) return;
    this.updateRow();
    for (let i = 0; i < this.slots.length; i++) this.updateSlot(this.slots[i], this.slotAt(i), player);
    this.updateBinding();
    this.updateTip(player);
  }

  /** Shift held or let go: the squares show the other row, their key tags saying so ("sQ"). */
  private updateRow(): void {
    const row = quickRow();
    if (row === this.shownRow) return;
    this.shownRow = row;
    const mark = row > 0 ? SHIFT_MARK : '';
    this.slots.forEach((view, i) => { view.keyTag.text = mark + codeLabel(QUICK_KEYS[i]); });
  }

  /** While a spell waits for a square the squares breathe and a line says what to do; the inventory coming back ends the wait. */
  private updateBinding(): void {
    const waiting = pendingBinding();
    if (waiting && isInventoryOpen()) cancelBinding();
    this.prompt.visible = !!waiting && !isInventoryOpen();
    if (!waiting) {
      this.breath = 0;
      for (const view of this.slots) view.square.scale.set(1);
      return;
    }
    const spell = CATALOG[waiting.spell] ?? { name: this.player ? bindingName(waiting, this.player.heroClass) : waiting.spell, level: 0 };
    const level = waiting.level > spell.level ? ` (${text('skills.cast_level', { level: waiting.level })})` : '';
    this.prompt.text = text('skills.bind_prompt', { spell: spell.name, level });
    const phase = (Math.sin((this.breath++ / BREATH_PERIOD) * 2 * Math.PI) + 1) / 2;
    for (const view of this.slots) view.square.scale.set(1 + BREATH_SWELL * phase);
  }

  /** Where a "More info" on a square's tooltip goes (the HUD opens it in its dialog). */
  set onMore(handler: ((more: TipTopic) => void) | null) {
    this.tip.onMore = handler;
  }

  /**
   * The tooltip of the square under the pointer, pinned just over it; it stays while the pointer is on it, so its
   * "More info" can be clicked.
   */
  private updateTip(player: Player): void {
    if (this.tip.hovered && !pendingBinding()) return;
    const view = this.slots[this.hovered];
    if (!view || pendingBinding()) {
      this.tip.hide();
      return;
    }
    const level = player.playerStats.level;
    const slot = this.slotAt(this.hovered);
    const shown = this.topic;
    if (!shown || shown.slot !== slot || shown.bound !== view.bound || shown.level !== level) {
      const tip = slotTopic(quickBinding(player, slot), level, player.heroClass);
      this.topic = { slot, bound: view.bound, level, tip };
    }
    // Asked for at the bar itself, it is kept inside the area above it: just over the squares.
    const top = this.top;
    const size = SLOT * this.scale;
    const square = { x: this.left + this.slotX(this.hovered) * this.scale, y: top, w: size, h: size };
    if (this.topic) this.tip.showAt(this.topic.tip, square, { w: GAME_WIDTH, h: top }, 'above');
  }


  destroy(): void {
    for (const view of this.slots) view.icon.mask = null;
    this.tip.hide();
    abandonBinding();
  }
}
