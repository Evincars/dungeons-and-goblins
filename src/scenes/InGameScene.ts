import { Container } from 'pixi.js';
import type { Application } from 'pixi.js';
import { world, q, localPlayer } from '../world';
import type { Player } from '../world';
import type { Scene, SceneManager } from '../game/SceneManager';
import { text } from '../core/texts';
import { buildDungeon, prepareLevel, randomSeed } from '../level/DungeonGenerator';
import { buildLevelView } from '../level/TileRenderer';
import type { LevelView } from '../level/TileRenderer';
import { FogRenderer } from '../level/FogRenderer';
import { LightRenderer } from '../level/LightRenderer';
import type { LightSource } from '../level/LightRenderer';
import { createPlayer } from '../entities/PlayerFactory';
import { cleanName, settings } from '../game/Settings';
import { camera, GAME_WIDTH, VIEW_HEIGHT } from '../render/Camera';
import { TILE_WIDTH, TILE_HEIGHT, FOG_REVEAL_TILES } from '../level/TileType';
import { initInput, resetInput } from '../systems/InputSystem';
import { SIMULATION, PRESENTATION, runSystems } from '../systems/Simulation';
import type { FrameContext } from '../systems/Simulation';
import { resetNameTags, updateNameTags } from '../systems/NameTagSystem';
import { resetRollTexts } from '../systems/RollTextSystem';
import { HudPanel } from '../ui/HudPanel';
import { CombatLogPanel } from '../ui/CombatLogPanel';
import { totalXp } from '../game/Progress';
import { InventoryOverlay } from '../ui/InventoryOverlay';
import { ShopPanel } from '../ui/ShopPanel';
import { PauseMenu } from '../ui/PauseMenu';
import { closeInventory, isInventoryOpen } from '../systems/InventorySystem';
import { isShopOpen, activeShopItems, closeShop } from '../systems/ShopSystem';
import { isLevelComplete, resetLevelComplete } from '../systems/ExitSystem';
import { PixelLabel, makeText } from '../ui/PixelText';
import { Crosshair } from '../ui/Crosshair';
import { sound } from '../audio/SoundPlayer';
import type { Level } from '../level/Level';
import { exposeForDebugging } from '../core/debugHooks';
import { coop } from '../network/CoopSession';
import { GuestGame, HostGame } from '../network/CoopGame';
import { descend, restorePlayer, run, startRun } from '../game/Run';
import { ResultPanel } from '../ui/ResultPanel';
import { attempt, report } from '../core/errors';

/** Tiles revealed around each player when the level starts (every tick after, FOG_REVEAL_TILES). */
const START_REVEAL_TILES = 6;
const TORCH_LIGHT_RADIUS = 120;
/** Torch flames flicker out of step, this far apart in phase. */
const TORCH_FLICKER_STEP = 1.3;
/** The player's lantern hangs this far above their feet. */
const LANTERN_LIFT = 16;
const LANTERN_RADIUS = 110;
/** The fog of war must cover entities in unexplored areas, not just the terrain. */
const FOG_Z = 1e7;
const STATUS_Y = 6;

type Mode = 'solo' | 'host' | 'guest';
type RunTotals = { kills: number; xp: number; gold: number };

/** Everything the player has earned so far in the run. */
function totalsOf(stats: NonNullable<Player['playerStats']>): RunTotals {
  return { kills: stats.kills, xp: totalXp(stats), gold: stats.goldEarned };
}

/**
 * One dungeon level. Alone or as the co-op host this screen runs the game; as a guest it draws the host's
 * world (built from the same seed) and sends this player's controls. Escape opens the pause menu, which only
 * stops the game when playing alone. Alone, one death or fall ends the run (hardcore).
 */
export class InGameScene implements Scene {
  readonly container = new Container();
  private readonly app: Application;
  private readonly mode: Mode;
  private readonly gameLayer = new Container();
  private readonly uiLayer = new Container();
  private terrain: LevelView | null = null;
  private readonly darkness = new FogRenderer();
  private readonly lights = new LightRenderer();
  private readonly hud = new HudPanel();
  private readonly combatLog = new CombatLogPanel();
  private readonly inv = new InventoryOverlay();
  private readonly shop = new ShopPanel();
  private readonly pause: PauseMenu;
  private shopWasOpen = false;
  private readonly crosshair = new Crosshair();
  private readonly result = new ResultPanel();
  private readonly status: PixelLabel;
  private complete = false;
  private gameOverShown = false;
  /** What the player carried in, to tell this level's kills, XP and gold from the run's total. */
  private baseline: RunTotals | null = null;
  private readonly level: Level;
  private tick = 0;
  private torchSources: LightSource[] = [];
  /** This frame's lights: the torches, then pooled entries for lanterns and glowing entities. */
  private frameLights: LightSource[] = [];
  private lightPool: LightSource[] = [];
  private readonly ctx: FrameContext;
  private readonly host: HostGame | null = null;
  private readonly guest: GuestGame | null = null;
  private readonly onKeyDown: (e: KeyboardEvent) => void;

  constructor(private readonly manager: SceneManager) {
    this.app = manager.application;
    this.mode = coop.role === 'host' ? 'host' : coop.role === 'guest' ? 'guest' : 'solo';
    // A level starts from an empty world: the previous level's entities (and their sprites, which lived in
    // its layers) are gone, along with any panel left open.
    run.hardcore = this.mode === 'solo';
    resetLevelComplete();
    closeInventory();
    closeShop();
    world.clear();
    resetNameTags();
    resetRollTexts();

    this.gameLayer.sortableChildren = true;
    this.container.addChild(this.gameLayer, this.uiLayer);

    // A guest builds the level the host announced; alone or hosting, a fresh one.
    const seed = this.mode === 'guest' ? coop.level?.seed ?? 0 : run.nextSeed ?? randomSeed();
    run.nextSeed = null;
    const depth = this.mode === 'guest' ? coop.level?.depth ?? 1 : run.depth;
    const { level, spawns } = buildDungeon(seed, this.mode !== 'guest');
    this.level = level;
    this.ctx = { level, dt: 1, tick: 0, gameLayer: this.gameLayer, rebuildTerrain: () => this.rebuildTerrain() };
    this.mountTerrain();
    level.clearDirty();
    this.torchSources = spawns.torchPositions.map((p, i) => ({
      x: p.x, y: p.y, radius: TORCH_LIGHT_RADIUS, kind: 0, flicker: i * TORCH_FLICKER_STEP,
    }));

    if (this.mode === 'guest') {
      this.guest = new GuestGame(() => this.levelComplete(), () => manager.goto('in_game'));
    } else {
      const me = createPlayer(spawns.playerSpawn.x, spawns.playerSpawn.y, settings.heroClass);
      world.addComponent(me, 'playerSlot', 'host');
      // The name typed on the character select; the combat log calls the hero by it (co-op renames it below).
      world.addComponent(me, 'playerName', cleanName(settings.playerName) || text('combat_log.default_hero'));
      restorePlayer(me);
      if (this.mode === 'host') this.host = new HostGame(me, spawns.playerSpawn, seed, depth);
    }

    this.darkness.container.zIndex = FOG_Z;
    this.gameLayer.addChild(this.darkness.container);
    // Light overlay placed in uiLayer so it sits above game but below HUD
    this.lights.init();
    this.uiLayer.addChild(this.lights.overlay, this.hud.container, this.combatLog.container, this.inv.container, this.shop.container);

    this.status = makeText('', 0xff8888, 8, 'center');
    this.status.x = GAME_WIDTH / 2;
    this.status.y = STATUS_Y;
    const levelLabel = makeText(text('game.depth', { depth }), 0x998877, 8, 'right');
    levelLabel.x = GAME_WIDTH - 6;
    levelLabel.y = STATUS_Y;
    this.uiLayer.addChild(this.status, levelLabel);

    this.pause = new PauseMenu({
      resume: () => this.setPaused(false),
      settings: () => manager.pushOverlay('settings'),
      mainMenu: () => manager.goto('title'),
      exitGame: () => this.exitGame(),
    }, this.mode === 'guest'
      ? text('menu.pause.warning_guest')
      : this.mode === 'host' ? text('menu.pause.warning_host') : text('menu.pause.warning_solo'));
    // The crosshair replaces the OS pointer and is the player's focus in the world.
    this.uiLayer.addChild(this.crosshair.graphics, this.pause.container, this.result.container);
    manager.canvas.style.cursor = 'none';
    initInput(manager.canvas);

    this.onKeyDown = (e) => this.handleKey(e);
    window.addEventListener('keydown', this.onKeyDown);
    level.reveal(Math.floor(spawns.playerSpawn.x / TILE_WIDTH), Math.floor(spawns.playerSpawn.y / TILE_HEIGHT), START_REVEAL_TILES);
    exposeForDebugging({ __world: world, __level: level });
  }

  /** Escape backs out of a sub-screen or the confirmation first, and only then opens or closes the pause menu. */
  private handleKey(e: KeyboardEvent): void {
    if (e.code === 'Enter' && this.complete && this.mode !== 'guest') {
      this.nextLevel();
      return;
    }
    if (e.code !== 'Escape') return;
    if (this.manager.hasOverlay) this.manager.escapeOverlay();
    else if (this.result.open || this.hud.closeDialog()) return;
    else if (!this.pause.handleEscape()) this.setPaused(!this.pause.open);
  }

  /** Opens or closes the pause menu. Only alone does that stop the game; in co-op the world goes on behind it. */
  private setPaused(paused: boolean): void {
    if (paused) this.pause.show(this.mode !== 'solo' && !coop.connected ? coop.status : '');
    else this.pause.hide();
    this.showPointer(paused);
  }

  /** A menu needs the OS pointer; in the world the crosshair takes its place. */
  private showPointer(visible: boolean): void {
    this.crosshair.graphics.visible = !visible;
    this.manager.canvas.style.cursor = visible ? '' : 'none';
    resetInput();
  }

  /** Whether the world stands still: alone, behind the pause menu, the game over screen or the level summary. */
  private get frozen(): boolean {
    return this.mode === 'solo' && (this.pause.open || this.complete || run.over);
  }

  /** Browsers only let a script close a tab it opened, so fall back to the main menu. */
  private exitGame(): void {
    window.close();
    this.manager.goto('title');
  }

  private rebuildTerrain(): void {
    this.level.clearDirty();
    this.mountTerrain();
  }

  /** (Re)builds the terrain: flat layer at the bottom, wall rows/arches depth-sorted with entities. */
  private mountTerrain(): void {
    if (this.terrain) {
      this.terrain.base.destroy({ children: true });
      for (const o of this.terrain.occluders) o.destroy({ children: true });
    }
    this.terrain = buildLevelView(this.level);
    this.terrain.base.zIndex = -1;
    this.gameLayer.addChildAt(this.terrain.base, 0);
    for (const o of this.terrain.occluders) this.gameLayer.addChild(o);
  }

  update(): void {
    const frozen = this.frozen;
    if (!frozen) this.tick++;
    this.ctx.tick = this.tick;
    if (this.guest) this.guest.tick(this.level, this.pause.open || this.guest.hostPaused || !coop.connected);
    else this.simulate(frozen);
    if (this.level.tilesDirty) this.rebuildTerrain();
    // Frozen, nothing animates either: the last frame stays up behind the menu.
    if (!frozen) runSystems(PRESENTATION, this.ctx);

    const player = localPlayer();
    this.baseline ??= player ? totalsOf(player.playerStats) : null;
    if (this.mode !== 'solo') updateNameTags(this.gameLayer, player);
    if (player) this.follow(player);
    this.revealAroundPlayers();
    this.gameLayer.x = -camera.x;
    this.gameLayer.y = -camera.y;

    this.darkness.update(this.app.renderer, this.level, this.tick);
    this.lights.update(this.app, this.gatherLights(), this.tick);
    this.crosshair.update();
    this.updatePanels();
    this.updateStatus(player);
    if (this.mode !== 'guest' && !this.complete && isLevelComplete()) this.levelComplete();
    if (run.over && !this.gameOverShown) this.gameOver();
  }

  /** Alone or hosting: one tick of the game (unless frozen), and the world out to the guests. */
  private simulate(frozen: boolean): void {
    const lost = this.host?.beforeTick(false) ?? false;
    // Everyone else left: bring up the menu so the host can decide what to do.
    if (lost && !this.pause.open) this.setPaused(true);
    if (!frozen && !lost) runSystems(SIMULATION, this.ctx);
    this.host?.afterTick(false);
  }

  /** The camera and listener follow this screen's player. */
  private follow(player: Player): void {
    const pos = player.position;
    sound.setListener(pos.x, pos.y);
    camera.x = Math.max(0, Math.min(this.level.width * TILE_WIDTH - GAME_WIDTH, Math.round(pos.x - GAME_WIDTH / 2)));
    camera.y = Math.max(0, Math.min(this.level.height * TILE_HEIGHT - VIEW_HEIGHT, Math.round(pos.y - VIEW_HEIGHT / 2)));
  }

  /** The party shares its map: the fog lifts around every player. */
  private revealAroundPlayers(): void {
    for (const p of q.players) {
      this.level.reveal(Math.floor(p.position.x / TILE_WIDTH), Math.floor(p.position.y / TILE_HEIGHT), FOG_REVEAL_TILES);
    }
  }

  private pooledLight(i: number): LightSource {
    return this.lightPool[i] ?? (this.lightPool[i] = { x: 0, y: 0, radius: 0, kind: 0 });
  }

  /** Every light this frame: torches, each player's lantern, and glowing entities (spell bolts, candles). */
  private gatherLights(): LightSource[] {
    const lights = this.frameLights;
    lights.length = 0;
    for (const torch of this.torchSources) lights.push(torch);
    let used = 0;
    for (const p of q.players) {
      const lantern = this.pooledLight(used++);
      lantern.x = p.position.x;
      lantern.y = p.position.y - LANTERN_LIFT;
      lantern.radius = LANTERN_RADIUS;
      lantern.kind = 1;
      lights.push(lantern);
    }
    for (const e of q.glowing) {
      const light = this.pooledLight(used++);
      light.x = e.position.x;
      light.y = e.position.y - (e.yOffset ?? 0);
      light.radius = e.glow.radius;
      light.kind = e.glow.cool ? 1 : 0;
      light.flicker = e.glow.flicker;
      lights.push(light);
    }
    return lights;
  }

  private updatePanels(): void {
    this.hud.update(this.level);
    this.combatLog.update();
    this.inv.setVisible(isInventoryOpen());
    this.inv.update();
    // Shop: refresh its rows on the open transition, then track visibility
    const shopOpen = isShopOpen();
    if (shopOpen && !this.shopWasOpen) this.shop.setItems(activeShopItems());
    this.shopWasOpen = shopOpen;
    this.shop.setVisible(shopOpen);
    this.shop.update();
  }

  /** A line at the top of the screen when co-op is not running normally. */
  private updateStatus(player: Player | undefined): void {
    let line = '';
    if (this.mode !== 'solo' && !coop.connected) line = coop.status;
    else if (this.guest?.hostPaused) line = text('game.host_paused');
    else if (this.mode === 'guest' && !player) line = text('game.joining');
    this.status.text = line;
  }

  /** The exit was pulled: the summary of the level comes up. Alone or hosting, Enter goes deeper; a guest waits for the host. */
  private levelComplete(): void {
    if (this.complete) return;
    this.complete = true;
    closeShop();
    this.host?.levelComplete();
    if (this.mode !== 'guest') this.prepareNextLevel();
    const gained = this.levelTotals();
    this.result.show({
      title: text('game.level_complete.title'),
      titleColor: 0xffcc44,
      lines: [
        text('game.level_complete.kills', { count: gained.kills }),
        text('game.level_complete.xp', { count: gained.xp }),
        text('game.level_complete.gold', { count: gained.gold }),
      ],
      waiting: this.mode === 'guest' ? text('game.level_complete.waiting') : undefined,
      buttons: [
        { label: text('game.level_complete.next'), action: () => this.nextLevel() },
        { label: text('game.level_complete.end_run'), action: () => this.manager.goto('title') },
      ],
    });
    this.showPointer(true);
  }

  /** Picks the next level and generates its map in the background, once the summary has drawn. */
  private prepareNextLevel(): void {
    const seed = randomSeed();
    run.nextSeed = seed;
    setTimeout(() => {
      const ready = attempt(() => prepareLevel(seed));
      if (!ready.ok) report(ready.error, 'Could not prepare the next level', 'level');
    }, 0);
  }

  /** Kills, XP and gold earned on this level alone. */
  private levelTotals(): RunTotals {
    const stats = localPlayer()?.playerStats;
    const now = stats ? totalsOf(stats) : { kills: 0, xp: 0, gold: 0 };
    const start = this.baseline ?? { kills: 0, xp: 0, gold: 0 };
    return { kills: now.kills - start.kills, xp: now.xp - start.xp, gold: now.gold - start.gold };
  }

  /** Alone, dying or falling into a pit ends the run: the world stays as it was, with the choice on top. */
  private gameOver(): void {
    this.gameOverShown = true;
    this.pause.hide();
    closeShop();
    closeInventory();
    const stats = localPlayer()?.playerStats;
    const total = stats ? totalsOf(stats) : { kills: 0, xp: 0, gold: 0 };
    this.result.show({
      title: text('game.game_over.title'),
      titleColor: 0xff5544,
      lines: [
        text('game.game_over.depth', { depth: run.depth }),
        text('game.game_over.kills', { count: total.kills }),
        text('game.game_over.xp', { count: total.xp }),
        text('game.game_over.gold', { count: total.gold }),
      ],
      buttons: [
        { label: text('game.game_over.new_game'), action: () => this.newGame() },
        { label: text('game.game_over.main_menu'), action: () => this.manager.goto('title') },
      ],
    });
    this.showPointer(true);
  }

  /** A fresh run from the first level's starting safe room. */
  private newGame(): void {
    startRun();
    this.manager.goto('in_game');
  }

  private nextLevel(): void {
    descend();
    this.manager.goto('in_game');
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.host?.dispose();
    this.guest?.dispose();
    this.manager.canvas.style.cursor = '';
    this.crosshair.destroy();
    this.darkness.destroy();
    this.lights.destroy();
    this.hud.destroy();
    this.combatLog.destroy();
    this.inv.destroy();
    this.pause.destroy();
    this.result.destroy();
    // The next scene is built before this one goes and owns the world by now (a new level has already
    // cleared it and filled it): only this scene's display objects go, the entities' sprites with them.
    this.container.destroy({ children: true });
  }
}
