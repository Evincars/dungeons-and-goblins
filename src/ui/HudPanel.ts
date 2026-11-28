import { Container, FillGradient, Graphics, Polygon } from 'pixi.js';
import { localPlayer } from '../world';
import type { Player } from '../world';
import { GAME_HEIGHT, GAME_WIDTH } from '../render/Camera';
import { claimPointer } from '../systems/InputSystem';
import { text } from '../core/texts';
import { THEME } from './Theme';
import { PixelLabel } from './PixelText';
import { HudDialog } from './HudDialog';
import { isInventoryOpen, setInventoryOpen } from '../systems/InventorySystem';
import { MinimapView } from './MinimapView';
import { QuickBar } from './QuickBar';
import { pendingBinding } from '../game/SpellBinding';
import { COMBAT_LOG_SPAN } from './CombatLogPanel';
import { RestMenu } from './RestMenu';
import { PartyBanner } from './PartyBanner';
import { LootRollPanel } from './LootRollPanel';
import { LEVEL_PANEL_H, LEVEL_PANEL_W, LevelPanel } from './LevelPanel';
import { PassiveHud } from './PassiveHud';
import { InfoTooltip } from './InfoTooltip';
import type { TipTopic } from './InfoTooltip';
import { bindingFor, codeLabel } from '../game/Settings';
import { hasChoices } from '../rules/Build';
import { heroClass } from '../rules/Classes';
import { heroName } from '../rules/Names';
import type { Level } from '../level/Level';
import { ConditionTip } from './ConditionTip';

/** The health bar, bottom left: how thick, its corner rounding and the margin to the screen's edge. */
const BAR_H = 12;
const BAR_GAP = 3;
const BAR_RADIUS = 5;
/** The fill sits this far inside the bar's frame; a faint streak along its top gives it some shine. */
const BAR_INSET = 2;
const SHINE_ALPHA = 0.18;
const MARGIN = 8;
/** Dark antique gold for the frames round the bar and the buttons, and the near-black well inside the bar. */
const GOLD = 0x8a6a2c;
const GOLD_DARK = 0x4a3818;
const WELL = 0x07050a;
/**
 * The health bar's magic: its life a dark blood running from deep crimson at the top to near black below, a faint violet
 * haze round its frame, a crimson gem set at each end, a bright edge where it ends, and a heartbeat that quickens its light when the hero is close to death.
 */
const BLOOD = new FillGradient({
  type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
  colorStops: [{ offset: 0, color: 0xc0283a }, { offset: 0.45, color: 0x7a0f1e }, { offset: 1, color: 0x2a040c }],
});
const HAZE = 0x5a1a6a;
const HAZE_ALPHA = 0.35;
const GEM = 0x9a1020;
const GEM_LIGHT = 0xff5a6a;
const GEM_R = 3;
const EDGE_COLOR = 0xff6a7a;
const EDGE_ALPHA = 0.65;
/** Below this share of hit points the bar beats like a heart: this many updates a beat, this bright at its height. */
const LOW_HEALTH = 0.3;
const BEAT_PERIOD = 50;
const BEAT_ALPHA = 0.3;
const BEAT_COLOR = 0xff3040;
/**
 * The buttons: diamonds this far from their centre to a point, in one row over the health bar, this far apart point to
 * point (the row spans the bar exactly, see BAR_W) and this far above it.
 */
const BUTTON_R = 12;
const BUTTON_GAP = 12;
const BUTTON_LIFT = 4;
/** The three buttons over the bar span it exactly: the bar is as long as their row. */
const BAR_W = 3 * 2 * BUTTON_R + 2 * BUTTON_GAP;
const HOVER_ALPHA = 0.14;
/** The quick bar keeps this far clear of the buttons and of the combat log. */
const QUICK_BAR_CLEARANCE = 6;
/** The mark on the level bubble: how big it is drawn, and how it breathes (updates for a full breath, how much it swells and how faint it gets). */
const MARK_SCALE = 2;
const BREATH_PERIOD = 100;
const BREATH_SWELL = 0.3;
const BREATH_FAINT = 0.45;
/** The open map is redrawn this often (ticks). */
const MAP_REFRESH_TICKS = 20;


type Bar = { color: number; fill: Graphics; value: PixelLabel; current: (p: Player) => number; max: (p: Player) => number };

const BARS: ReadonlyArray<Pick<Bar, 'color' | 'current' | 'max'>> = [
  { color: 0x8e1f1b, current: (p) => p.health.current, max: (p) => p.health.max },
];

/** Which dialog a HUD button opens. */
export type HudButtonId = 'character' | 'level' | 'map' | 'rest';

/** A HUD button: a dark diamond in its own colour with a small picture, opening its dialog; pointing at it says what it is. */
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
 * The row, left to right: the character, the hero's level (its number on it) and rest (its drop-down offers a short or
 * a long rest). The map button is left out of the HUD for now; its dialog (MinimapView) still works, so putting the
 * line back brings it again.
 */
const BUTTONS: readonly ButtonDef[] = [
  { id: 'character', title: text('hud.button.character'), color: 0x4a1414, icon: swordIcon },
  { id: 'level', title: text('hud.button.level'), color: 0x1c1824, icon: () => undefined },
  // { id: 'map', title: text('hud.button.map'), color: 0x14284c, icon: globeIcon },
  { id: 'rest', title: text('hud.button.rest'), color: 0x1a2a20, icon: moonIcon },
];

/** Centres of the diamonds, left to right like BUTTONS, in a row just over the bar whose top-left corner is (barX, barY). */
function buttonPoints(barX: number, barY: number): Array<{ x: number; y: number }> {
  const y = barY - BUTTON_LIFT - BUTTON_R;
  return BUTTONS.map((_, i) => ({ x: barX + BUTTON_R + i * (2 * BUTTON_R + BUTTON_GAP), y }));
}

/** The right edge of the bar and the buttons over it, which the quick bar keeps clear of. */
const BUTTONS_RIGHT = MARGIN + BAR_W;

/** A diamond (a square on its corner) this far from its centre to a point. */
const diamond = (g: Graphics, r: number): Graphics => g.poly([0, -r, r, 0, 0, r, -r, 0]);

/**
 * What stays on screen during play. Bottom left: the health bar (dark gold frame, the value on it) and a row of
 * diamond buttons over it — the character, the hero's level and rest (a short or a long rest). Bottom middle: the quick bar of the hero's spells (ui/QuickBar.ts). High in the middle: what the party
 * is asked, or how it went, and the gate's countdown (ui/PartyBanner.ts).
 */
export class HudPanel {
  readonly container = new Container();
  /** Laid by the scene over the inventory and the shop: the quick bar stands here while a spell waits for its square. */
  readonly front = new Container();
  readonly dialog = new HudDialog();
  private readonly bars: Bar[] = [];
  private readonly quickBar = new QuickBar(BUTTONS_RIGHT + QUICK_BAR_CLEARANCE, GAME_WIDTH - COMBAT_LOG_SPAN - QUICK_BAR_CLEARANCE);
  private readonly partyBanner = new PartyBanner();
  private readonly lootRolls = new LootRollPanel();
  private readonly restMenu: RestMenu;
  private readonly level = new PixelLabel('1', { color: THEME.title, align: 'center', outline: true });
  private readonly minimap = new MinimapView();
  private readonly levelPanel = new LevelPanel();
  private readonly passives = new PassiveHud();
  private readonly conditions = new ConditionTip();
  /** A mark on the level bubble while the hero has a choice to make. */
  private readonly choiceMark = new PixelLabel('!', { color: THEME.hitPoints, scale: MARK_SCALE, align: 'center', outline: true });
  /** Updates so far, which the choice mark breathes by. */
  private breath = 0;
  /** Updates so far, which the health bar's heartbeat runs by. */
  private pulse = 0;
  /** What a HUD button is, told while the pointer is on it. */
  private readonly tip = new InfoTooltip();
  /** The level being played, as of the last update (the map draws it). */
  private levelShown: Level | null = null;
  /** Ticks until the open map is redrawn (the party keeps exploring while it is up). */
  private mapRefresh = 0;

  constructor() {
    // Only the buttons and the dialog listen; nothing else here may catch the pointer.
    this.container.eventMode = 'passive';
    BARS.forEach((spec, i) => this.addBar(spec, i));
    const points = buttonPoints(MARGIN, GAME_HEIGHT - MARGIN - BAR_H);
    BUTTONS.forEach((def, i) => this.addButton(def, points[i]));
    // The rest menu opens upwards from over the rest button.
    const rest = points[BUTTONS.findIndex((def) => def.id === 'rest')];
    this.restMenu = new RestMenu(Math.round(rest.x - BUTTON_R), Math.round(rest.y - BUTTON_R - 2));
    this.container.addChild(this.quickBar.view, this.partyBanner.view, this.lootRolls.view, this.passives.view, this.restMenu.view, this.dialog.container, this.tip.view, this.conditions.view);
  }

  private addBar(spec: Pick<Bar, 'color' | 'current' | 'max'>, i: number): void {
    const x = MARGIN;
    const y = GAME_HEIGHT - MARGIN - (BARS.length - i) * BAR_H - (BARS.length - 1 - i) * BAR_GAP;
    const frame = new Graphics()
      .roundRect(x - 1, y - 1, BAR_W + 2, BAR_H + 2, BAR_RADIUS + 1).stroke({ color: HAZE, alpha: HAZE_ALPHA, width: 2, alignment: 0 })
      .roundRect(x, y, BAR_W, BAR_H, BAR_RADIUS).fill({ color: WELL }).stroke({ color: GOLD, width: 1, alignment: 1 })
      .roundRect(x + 1, y + 1, BAR_W - 2, BAR_H - 2, BAR_RADIUS - 1).stroke({ color: GOLD_DARK, width: 1, alignment: 1 });
    frame.eventMode = 'none';
    const gems = new Graphics();
    for (const gx of [x, x + BAR_W]) this.gem(gems, gx, y + BAR_H / 2);
    gems.eventMode = 'none';
    const fill = new Graphics();
    fill.eventMode = 'none';
    fill.position.set(x + BAR_INSET, y + BAR_INSET);
    const value = new PixelLabel('', { color: THEME.text, align: 'center', outline: true });
    value.eventMode = 'none';
    value.position.set(x + BAR_W / 2, y + Math.round((BAR_H - 8) / 2));
    this.bars.push({ ...spec, fill, value });
    this.container.addChild(frame, fill, gems, value);
  }

  /** A crimson gem in a gold setting, at (x, y). */
  private gem(g: Graphics, x: number, y: number): void {
    g.poly([x, y - GEM_R - 1, x + GEM_R + 1, y, x, y + GEM_R + 1, x - GEM_R - 1, y]).fill({ color: GOLD });
    g.poly([x, y - GEM_R, x + GEM_R, y, x, y + GEM_R, x - GEM_R, y]).fill({ color: GEM });
    g.rect(x - 1, y - GEM_R + 1, 1, 1).fill({ color: GEM_LIGHT });
  }

  /** A diamond button: dark gold rim, its colour inside, its picture; it lights up under the pointer and opens its dialog. */
  private addButton(def: ButtonDef, at: { x: number; y: number }): void {
    const button = new Container();
    button.position.set(Math.round(at.x), Math.round(at.y));
    const r = BUTTON_R;
    const art = new Graphics();
    diamond(art, r).fill({ color: GOLD });
    diamond(art, r - 1).stroke({ color: GOLD_DARK, width: 1 });
    diamond(art, r - 2).fill({ color: def.color });
    diamond(art, r - 4).stroke({ color: 0xffffff, alpha: 0.08, width: 1 });
    const icon = new Graphics();
    def.icon(icon);
    const glow = diamond(new Graphics(), r - 2).fill({ color: 0xffffff, alpha: HOVER_ALPHA });
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
    button.hitArea = new Polygon([0, -r, r, 0, 0, r, -r, 0]);
    const anchor = { x: at.x - r, y: at.y - r, w: 2 * r, h: 2 * r };
    button.on('pointerover', () => {
      glow.visible = true;
      claimPointer(button, true);
      this.tip.showAt(this.buttonTopic(def), anchor, { w: GAME_WIDTH, h: GAME_HEIGHT }, 'above');
    });
    button.on('pointerout', () => { glow.visible = false; claimPointer(button, false); this.tip.hide(); });
    button.on('pointertap', () => { this.tip.hide(); this.open(def); });
    this.container.addChild(button);
  }

  /** What a button is and does, for its tooltip (the level button's says whether a choice is waiting). */
  private buttonTopic(def: ButtonDef): TipTopic {
    const player = localPlayer();
    if (def.id === 'character') return { title: text('hud.tip.character.title'), subtitle: text('hud.tip.key', { key: codeLabel(bindingFor('inventory')) }), body: text('hud.tip.character.body') };
    if (def.id === 'rest') return { title: text('hud.tip.rest.title'), body: text('hud.tip.rest.body') };
    if (def.id === 'map') return { title: text('hud.button.map'), body: text('hud.tip.map.body') };
    const level = player?.playerStats.level ?? 1;
    const waiting = !!player && hasChoices(heroClass(player.heroClass), level, player.build);
    const detail = waiting ? [{ text: text('hud.tip.level.waiting'), color: THEME.hitPoints }] : [];
    return { title: text('hud.tip.level.title', { level }), body: text('hud.tip.level.body'), detail };
  }

  /** The character button opens and shuts the inventory (as Tab does), rest opens its drop-down, the map shows the explored dungeon. */
  private open(def: ButtonDef): void {
    if (def.id === 'character') {
      this.toggleInventory();
      return;
    }
    if (def.id === 'rest') {
      this.restMenu.toggle(localPlayer());
      return;
    }
    if (def.id === 'level') {
      this.openLevel();
      return;
    }
    if (!this.levelShown) return;
    this.minimap.draw(this.levelShown);
    this.mapRefresh = MAP_REFRESH_TICKS;
    this.dialog.show(def.title, this.minimap.view, this.minimap.width, this.minimap.height);
  }

  /** Opens or shuts this screen's inventory (a fallen hero carries nothing: theirs stays shut). */
  private toggleInventory(): void {
    const player = localPlayer();
    if (!player || player.health.current <= 0) return;
    this.dialog.hide();
    setInventoryOpen(!isInventoryOpen());
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
    this.raiseQuickBar();
    this.passives.update();
    this.conditions.update();
    if (!player) return;
    if (this.dialog.showing(this.levelPanel.view)) this.levelPanel.update(player);
    this.choiceMark.visible = hasChoices(heroClass(player.heroClass), player.playerStats.level, player.build);
    if (this.choiceMark.visible) this.breathe();
    this.pulse++;
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
    if (w > 0) this.drawBlood(bar.fill, w, h, current / max, w < BAR_W - 2 * BAR_INSET);
    bar.value.text = text('hud.bar.value', { current, max });
  }

  /** The blood in the bar, `w` wide: its gradient, its shine, its bright edge, and the heartbeat when low (nothing runs along it). */
  private drawBlood(g: Graphics, w: number, h: number, share: number, partial: boolean): void {
    g.roundRect(0, 0, w, h, BAR_RADIUS - BAR_INSET).fill(BLOOD).rect(1, 1, Math.max(0, w - 2), 1).fill({ color: 0xffffff, alpha: SHINE_ALPHA });
    if (partial) g.rect(w - 1, 1, 1, h - 2).fill({ color: EDGE_COLOR, alpha: EDGE_ALPHA });
    if (share >= LOW_HEALTH) return;
    const beat = (Math.sin((this.pulse / BEAT_PERIOD) * 2 * Math.PI) + 1) / 2;
    g.roundRect(0, 0, w, h, BAR_RADIUS - BAR_INSET).fill({ color: BEAT_COLOR, alpha: BEAT_ALPHA * beat });
  }

  /**
   * Closes the topmost of the HUD's dialog, the rest menu and the hit dice to agree a rest with, if one is open; returns
   * whether one was (Escape uses this before the pause menu).
   */
  /** Whether a dialog, the rest menu or the hit-dice menu of a rest vote is open (clicks then fight nobody). */
  /** While a spell waits for its square, the quick bar stands in `front`, over the inventory; else back in its place, under the HUD's other parts. */
  private raiseQuickBar(): void {
    const view = this.quickBar.view;
    const raised = !!pendingBinding();
    if (raised === (view.parent === this.front)) return;
    if (raised) this.front.addChild(view);
    else this.container.addChildAt(view, 0);
  }

  get panelOpen(): boolean {
    return this.dialog.open || this.restMenu.open || this.partyBanner.menuOpen;
  }

  closeDialog(): boolean {
    return this.partyBanner.hideMenu() || this.restMenu.hide() || this.dialog.hide();
  }

  destroy(): void {
    this.tip.hide();
    this.dialog.destroy();
    this.levelPanel.destroy();
    this.passives.destroy();
    this.conditions.destroy();
    this.quickBar.destroy();
    this.restMenu.destroy();
    this.partyBanner.destroy();
    this.lootRolls.destroy();
    this.container.destroy({ children: true });
  }
}
