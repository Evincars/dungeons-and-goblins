import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Player } from '../world';
import { text } from '../core/texts';
import { reportRejection } from '../core/errors';
import { SPELLS } from '../rules/Spells';
import { spellName } from '../rules/Names';
import { CATALOG, spellIconKey } from '../rules/Spellbook';
import { lazyTexture, requestArt } from '../assets/LazyArt';
import { GAME_WIDTH, GAME_HEIGHT } from '../render/Camera';
import { claimPointer } from '../systems/InputSystem';
import { InfoTooltip } from './InfoTooltip';
import type { TipTopic } from './InfoTooltip';
import { spellTopic } from './SpellTopics';
import { PixelLabel } from './PixelText';
import { FULL_TURN, drawIconClock } from './IconClock';
import { durationOf } from './HudTime';

/**
 * Top left, beside the icons of what the hero has at work: the spell they concentrate on, if any — its icon in a frame of
 * violet light that breathes, "Concentration" beside it, a clock over it emptying as its time runs out. The pointer over it
 * shows the spell's tooltip, opening with how long it may still last and what ends it.
 */

const ICON = 24;
/** The frame's violet light and how it breathes (its alpha, between these, a breath this many updates long). */
const FRAME_COLOR = 0xb08cff;
const FRAME_WIDTH = 2;
const FRAME_DIM = 0.45;
const FRAME_BRIGHT = 1;
const BREATH_UPDATES = 90;
const BOX_FILL_ALPHA = 0.6;
/** The word beside the icon: this far right of it, this far down. */
const LABEL_GAP = 4;
const LABEL_DROP = 9;

export class ConcentrationBadge {
  readonly view = new Container();
  private readonly frame = new Graphics();
  private readonly icon = new Sprite(Texture.EMPTY);
  private readonly clock = new Graphics();
  private readonly label = new PixelLabel(text('hud.concentration'), { color: FRAME_COLOR, scale: 0.75, outline: true });
  private readonly tip = new InfoTooltip();
  private iconKey: string | null = null;
  private hovered = false;
  private breath = 0;

  constructor() {
    this.view.visible = false;
    this.view.eventMode = 'static';
    this.view.hitArea = new Rectangle(0, 0, ICON, ICON);
    this.view.on('pointerover', () => { this.hovered = true; claimPointer(this.view, true); });
    this.view.on('pointerout', () => { this.hovered = false; claimPointer(this.view, false); });
    const box = new Graphics().rect(0, 0, ICON, ICON).fill({ color: 0x000000, alpha: BOX_FILL_ALPHA });
    this.label.position.set(ICON + LABEL_GAP, LABEL_DROP);
    this.view.addChild(box, this.icon, this.frame, this.clock, this.label);
  }

  /** The tooltip, added where it may draw over everything else of the HUD. */
  get tipView(): Container {
    return this.tip.view;
  }

  /** Shows the spell's icon (loaded the first time it is asked for). */
  private setIcon(key: string | null): void {
    if (this.iconKey === key) return;
    this.iconKey = key;
    this.icon.texture = Texture.EMPTY;
    if (!key) return;
    const show = (): void => {
      if (this.icon.destroyed || this.iconKey !== key) return;
      this.icon.texture = lazyTexture(key);
      this.icon.scale.set(ICON / Math.max(1, this.icon.texture.width));
    };
    reportRejection(requestArt(key).then(show), `Icon ${key} did not load`, 'render');
  }

  /** The clock over the icon, as Shield's shows: the time gone darkens it, the time left runs round it in violet, shrinking. */
  private drawClock(left: number, total: number): void {
    if (total <= 0) {
      this.clock.clear();
      return;
    }
    drawIconClock(this.clock, ICON, left / total, FRAME_COLOR);
  }

  /** The violet frame, breathing. */
  private drawFrame(): void {
    this.breath = (this.breath + 1) % BREATH_UPDATES;
    const alpha = FRAME_DIM + (FRAME_BRIGHT - FRAME_DIM) * (0.5 + 0.5 * Math.sin((this.breath / BREATH_UPDATES) * FULL_TURN));
    this.frame.clear().rect(0, 0, ICON, ICON).stroke({ color: FRAME_COLOR, alpha, width: FRAME_WIDTH, alignment: 1 });
  }

  /** The tooltip of the spell held, opening with its time left and what ends it. */
  private topic(player: Player, spell: string, left: string): TipTopic | null {
    const entry = CATALOG[spell];
    if (!entry) return null;
    const story = spellTopic(entry, entry.level, player.playerStats.level);
    const now = { text: text('hud.concentration_left', { spell: entry.name, seconds: left }), color: FRAME_COLOR };
    return { ...story, detail: [now, ...(story.detail ?? [])] };
  }

  /** Placed at (x, y); shows what the hero concentrates on now, or hides. */
  update(player: Player, x: number, y: number): void {
    const held = player.concentration;
    this.view.visible = !!held;
    if (!held) {
      if (this.hovered) this.tip.hide();
      return;
    }
    this.view.position.set(x, y);
    this.setIcon(spellIconKey(held.spell));
    const total = SPELLS[held.spell].durationTicks;
    this.drawClock(held.ticks ?? total, total);
    this.drawFrame();
    if (!this.hovered) {
      this.tip.hide();
      return;
    }
    const topic = this.topic(player, held.spell, held.ticks === undefined ? spellName(held.spell) : durationOf(held.ticks));
    if (!topic) return;
    this.tip.showAt(topic, { x, y, w: ICON, h: ICON }, { w: GAME_WIDTH, h: GAME_HEIGHT }, 'beside');
    this.tip.refresh();
  }

  destroy(): void {
    claimPointer(this.view, false);
    this.tip.hide();
    this.view.destroy({ children: true });
  }
}
