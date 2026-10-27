import { Circle, Container, Graphics } from 'pixi.js';
import { localPlayer } from '../world';
import type { Player } from '../world';
import { GAME_HEIGHT } from '../render/Camera';
import { claimPointer } from '../systems/InputSystem';
import { text } from '../core/texts';
import { THEME } from './Theme';
import { PixelLabel } from './PixelText';
import { HudDialog } from './HudDialog';
import { MinimapView } from './MinimapView';
import { QuickBar } from './QuickBar';
import { RestMenu } from './RestMenu';
import { PartyBanner } from './PartyBanner';
import { LootRollPanel } from './LootRollPanel';
import { LEVEL_PANEL_H, LEVEL_PANEL_W, LevelPanel } from './LevelPanel';
import { PassiveHud } from './PassiveHud';
import { ScrollText } from './ScrollText';
import type { TipTopic } from './InfoTooltip';
import { hasChoices } from '../rules/Build';
import { heroClass } from '../rules/Classes';
import { heroName } from '../rules/Names';
import type { Level } from '../level/Level';

/** The health bar, bottom left: how long, how thick, its corner rounding and the margin to the screen's edge. */
const BAR_W = 112;
const BAR_H = 12;
const BAR_GAP = 3;
const BAR_RADIUS = 5;
/** The fill sits this far inside the bar's frame; a faint streak along its top gives it some shine. */
const BAR_INSET = 2;
const SHINE_ALPHA = 0.16;
const MARGIN = 8;
/** Dark antique gold for the frames round the bar and the buttons, and the near-black well inside the bar. */
const GOLD = 0x8a6a2c;
const GOLD_DARK = 0x4a3818;
const WELL = 0x0c0a08;
/**
 * The buttons: circles of this radius standing on the corners of two equilateral triangles side by side over
 * the health bar (two below, two on top), this far apart edge to edge and this far above the bar.
 */
const BUTTON_R = 11;
const BUTTON_GAP = 4;
const BUTTON_LIFT = 4;
const HOVER_ALPHA = 0.14;
/** The mark on the level bubble: how big it is drawn, and how it breathes (updates for a full breath, how much it swells and how faint it gets). */
const MARK_SCALE = 2;
const BREATH_PERIOD = 100;
const BREATH_SWELL = 0.3;
const BREATH_FAINT = 0.45;
/** The open map is redrawn this often (ticks). */
const MAP_REFRESH_TICKS = 20;
/** The dialog a quick-bar tooltip's "More info" opens: its text box, in game pixels. */
const MORE_W = 280;
const MORE_H = 150;


type Bar = { color: number; fill: Graphics; value: PixelLabel; current: (p: Player) => number; max: (p: Player) => number };

const BARS: ReadonlyArray<Pick<Bar, 'color' | 'current' | 'max'>> = [
  { color: 0x8e1f1b, current: (p) => p.health.current, max: (p) => p.health.max },
];

/** Which dialog a HUD button opens. */
export type HudButtonId = 'character' | 'level' | 'map' | 'rest';

/** A HUD button: a dark circle in its own colour with a small picture, opening its dialog. */
type ButtonDef = { id: HudButtonId; title: string; color: number; icon: (g: Graphics) => void };

/** A sword, drawn about the button's centre. */
function swordIcon(g: Graphics): void {
  g.moveTo(-5, 5).lineTo(5, -5).stroke({ color: 0xa9b2bc, width: 2 });
  g.moveTo(-5, 1).lineTo(-1, 5).stroke({ color: GOLD, width: 2 });
  g.circle(-6, 6, 1.5).fill({ color: GOLD });
}

/** A small globe: dark sea, two dark green lands. */
function globeIcon(g: Graphics): void {
  g.circle(0, 0, 6).fill({ color: 0x24539c }).stroke({ color: 0x6f8fbf, width: 1 });
  g.circle(-2, -2, 2.5).fill({ color: 0x3a8a3e });
  g.circle(3, 2, 2).fill({ color: 0x3a8a3e });
}

/** A crescent moon with a star: rest. */
function moonIcon(g: Graphics): void {
  g.circle(-1, 0, 6).fill({ color: 0xe8dcae });
  g.circle(2, -2, 5).fill({ color: 0x1a2a20 });
  g.circle(4, 3, 1).fill({ color: 0xe8dcae });
}

/**
 * The corners: the character on top, the hero's level (its number on it) and the map below, and rest on top
 * beside the character (its drop-down offers a short or a long rest).
 */
const BUTTONS: readonly ButtonDef[] = [
  { id: 'character', title: text('hud.button.character'), color: 0x4a1414, icon: swordIcon },
  { id: 'level', title: text('hud.button.level'), color: 0x1c1824, icon: () => undefined },
  { id: 'map', title: text('hud.button.map'), color: 0x14284c, icon: globeIcon },
  { id: 'rest', title: text('hud.button.rest'), color: 0x1a2a20, icon: moonIcon },
];

/**
 * Centres of four circles on the corners of two equilateral triangles side by side over the bar: side = two
 * radii plus the gap, height = side·√3/2. Index 0 is the top left corner, then bottom left, bottom right and
 * top right.
 */
function buttonPoints(barX: number, barY: number): Array<{ x: number; y: number }> {
  const side = 2 * BUTTON_R + BUTTON_GAP;
  const cx = barX + BAR_W / 2;
  const bottom = barY - BUTTON_LIFT - BUTTON_R;
  const top = bottom - (side * Math.sqrt(3)) / 2;
  return [{ x: cx, y: top }, { x: cx - side / 2, y: bottom }, { x: cx + side / 2, y: bottom }, { x: cx + side, y: top }];
}

/**
 * What stays on screen during play. Bottom left: the health bar (dark gold frame, the value on it) and four
 * round buttons over it — the character, the hero's level, the map (which shows what has been explored) and
 * rest (a short or a long rest). Bottom middle: the quick bar of the hero's spells (ui/QuickBar.ts). High in
 * the middle: what the party is asked, or how it went, and the gate's countdown (ui/PartyBanner.ts).
 */
export class HudPanel {
  readonly container = new Container();
  readonly dialog = new HudDialog();
  private readonly bars: Bar[] = [];
  private readonly quickBar = new QuickBar();
  private readonly partyBanner = new PartyBanner();
  private readonly lootRolls = new LootRollPanel();
  private readonly restMenu: RestMenu;
  private readonly level = new PixelLabel('1', { color: THEME.title, align: 'center', outline: true });
  private readonly minimap = new MinimapView();
  private readonly levelPanel = new LevelPanel();
  private readonly passives = new PassiveHud();
  /** A spell's whole story, opened from its quick-bar tooltip. */
  private readonly moreText = new ScrollText(MORE_W, MORE_H);
  /** A mark on the level bubble while the hero has a choice to make. */
  private readonly choiceMark = new PixelLabel('!', { color: THEME.hitPoints, scale: MARK_SCALE, align: 'center', outline: true });
  /** Updates so far, which the choice mark breathes by. */
  private breath = 0;
  /** The level being played, as of the last update (the map draws it). */
  private levelShown: Level | null = null;
  /** Ticks until the open map is redrawn (the party keeps exploring while it is up). */
  private mapRefresh = 0;

  constructor() {
    // Only the buttons and the dialog listen; nothing else here may catch the pointer.
    this.container.eventMode = 'passive';
    BARS.forEach((spec, i) => this.addBar(spec, i));
    const corners = buttonPoints(MARGIN, GAME_HEIGHT - MARGIN - BARS.length * BAR_H - (BARS.length - 1) * BAR_GAP);
    BUTTONS.forEach((def, i) => this.addButton(def, corners[i]));
    const rest = corners[3];
    this.restMenu = new RestMenu(Math.round(rest.x - BUTTON_R), Math.round(rest.y - BUTTON_R - 2));
    this.container.addChild(this.quickBar.view, this.partyBanner.view, this.lootRolls.view, this.passives.view, this.restMenu.view, this.dialog.container);
    this.quickBar.onMore = (more) => this.showMore(more);
  }

  /** "More info" on a quick-bar tooltip: the spell's whole text and numbers, in the HUD's dialog. */
  private showMore(more: TipTopic): void {
    this.moreText.set(more);
    this.dialog.show(more.title, this.moreText.view, MORE_W, MORE_H);
  }

  private addBar(spec: Pick<Bar, 'color' | 'current' | 'max'>, i: number): void {
    const x = MARGIN;
    const y = GAME_HEIGHT - MARGIN - (BARS.length - i) * BAR_H - (BARS.length - 1 - i) * BAR_GAP;
    const frame = new Graphics()
      .roundRect(x, y, BAR_W, BAR_H, BAR_RADIUS).fill({ color: WELL }).stroke({ color: GOLD, width: 1, alignment: 1 })
      .roundRect(x + 1, y + 1, BAR_W - 2, BAR_H - 2, BAR_RADIUS - 1).stroke({ color: GOLD_DARK, width: 1, alignment: 1 });
    frame.eventMode = 'none';
    const fill = new Graphics();
    fill.eventMode = 'none';
    fill.position.set(x + BAR_INSET, y + BAR_INSET);
    const value = new PixelLabel('', { color: THEME.text, align: 'center', outline: true });
    value.eventMode = 'none';
    value.position.set(x + BAR_W / 2, y + Math.round((BAR_H - 8) / 2));
    this.bars.push({ ...spec, fill, value });
    this.container.addChild(frame, fill, value);
  }

  /** A round button: dark gold rim, its colour inside, its picture; it lights up under the pointer and opens its dialog. */
  private addButton(def: ButtonDef, at: { x: number; y: number }): void {
    const button = new Container();
    button.position.set(Math.round(at.x), Math.round(at.y));
    const r = BUTTON_R;
    const art = new Graphics()
      .circle(0, 0, r).fill({ color: GOLD })
      .circle(0, 0, r - 2).fill({ color: def.color })
      .circle(0, 0, r - 4).stroke({ color: 0xffffff, alpha: 0.08, width: 1 });
    const icon = new Graphics();
    def.icon(icon);
    const glow = new Graphics().circle(0, 0, r - 2).fill({ color: 0xffffff, alpha: HOVER_ALPHA });
    glow.visible = false;
    button.addChild(art, icon, glow);
    if (def.id === 'level') {
      this.level.position.set(0, -4);
      this.choiceMark.pivot.set(0, this.choiceMark.textHeight / 2);
      this.choiceMark.position.set(r - 1, -r + 3);
      this.choiceMark.visible = false;
      this.choiceMark.eventMode = 'none';
      button.addChild(this.level, this.choiceMark);
    }
    button.eventMode = 'static';
    button.cursor = 'pointer';
    button.hitArea = new Circle(0, 0, r);
    button.on('pointerover', () => { glow.visible = true; claimPointer(button, true); });
    button.on('pointerout', () => { glow.visible = false; claimPointer(button, false); });
    button.on('pointertap', () => this.open(def));
    this.container.addChild(button);
  }

  /** The map button shows the explored dungeon, rest opens its drop-down; the others, for now, a placeholder. */
  private open(def: ButtonDef): void {
    if (def.id === 'rest') {
      this.restMenu.toggle(localPlayer());
      return;
    }
    if (def.id === 'level') {
      this.openLevel();
      return;
    }
    if (def.id !== 'map') {
      this.dialog.show(def.title, text('hud.dialog.placeholder'));
      return;
    }
    if (!this.levelShown) return;
    this.minimap.draw(this.levelShown);
    this.mapRefresh = MAP_REFRESH_TICKS;
    this.dialog.show(def.title, this.minimap.view, this.minimap.width, this.minimap.height);
  }

  /** The level bubble: what the hero can decide at their level. */
  private openLevel(): void {
    const player = localPlayer();
    if (!player) return;
    this.levelPanel.open(player);
    this.levelPanel.update(player);
    const title = text('level.title', { hero: heroName(heroClass(player.heroClass).id), level: player.playerStats.level });
    this.dialog.show(title, this.levelPanel.view, LEVEL_PANEL_W, LEVEL_PANEL_H);
  }

  update(level: Level): void {
    this.levelShown = level;
    this.refreshMap(level);
    const player = localPlayer();
    this.partyBanner.update();
    this.lootRolls.update();
    this.quickBar.update(player);
    this.passives.update();
    if (!player) return;
    if (this.dialog.showing(this.levelPanel.view)) this.levelPanel.update(player);
    this.choiceMark.visible = hasChoices(heroClass(player.heroClass), player.playerStats.level, player.build);
    if (this.choiceMark.visible) this.breathe();
    for (const bar of this.bars) this.drawBar(bar, player);
    this.level.text = String(player.playerStats.level);
  }

  /** The choice mark swells and fades back and forth, like breathing, so it catches the eye. */
  private breathe(): void {
    const phase = (Math.sin((this.breath++ / BREATH_PERIOD) * 2 * Math.PI) + 1) / 2;
    this.choiceMark.scale.set(1 + BREATH_SWELL * phase);
    this.choiceMark.alpha = 1 - BREATH_FAINT * (1 - phase);
  }

  /** While the map is open, it is drawn again now and then, so newly explored ground appears on it. */
  private refreshMap(level: Level): void {
    if (!this.dialog.showing(this.minimap.view) || --this.mapRefresh > 0) return;
    this.mapRefresh = MAP_REFRESH_TICKS;
    this.minimap.draw(level);
  }

  /** A bar filled as far as its value goes, with the value written on it ("50/50"). */
  private drawBar(bar: Bar, player: Player): void {
    const max = Math.max(1, Math.round(bar.max(player)));
    const current = Math.max(0, Math.round(bar.current(player)));
    const w = Math.round((BAR_W - 2 * BAR_INSET) * Math.min(1, current / max));
    const h = BAR_H - 2 * BAR_INSET;
    bar.fill.clear();
    if (w > 0) bar.fill.roundRect(0, 0, w, h, BAR_RADIUS - BAR_INSET).fill({ color: bar.color }).rect(1, 1, Math.max(0, w - 2), 1).fill({ color: 0xffffff, alpha: SHINE_ALPHA });
    bar.value.text = text('hud.bar.value', { current, max });
  }

  /**
   * Closes the topmost of the HUD's dialog, the rest menu and the hit dice to agree a rest with, if one is open; returns
   * whether one was (Escape uses this before the pause menu).
   */
  closeDialog(): boolean {
    return this.partyBanner.hideMenu() || this.restMenu.hide() || this.dialog.hide();
  }

  destroy(): void {
    this.dialog.destroy();
    this.levelPanel.destroy();
    this.passives.destroy();
    this.quickBar.destroy();
    this.restMenu.destroy();
    this.partyBanner.destroy();
    this.lootRolls.destroy();
    this.container.destroy({ children: true });
  }
}
