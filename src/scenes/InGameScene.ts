import { Container } from 'pixi.js';
import type { Application } from 'pixi.js';
import { world, q, localPlayer } from '../world';
import type { Player } from '../world';
import type { Scene, SceneManager } from '../game/SceneManager';
import { buildDungeon, randomSeed } from '../level/DungeonGenerator';
import { buildLevelView } from '../level/TileRenderer';
import type { LevelView } from '../level/TileRenderer';
import { DarknessRenderer } from '../level/DarknessRenderer';
import { LightRenderer } from '../level/LightRenderer';
import type { LightSource } from '../level/LightRenderer';
import { createPlayer } from '../entities/PlayerFactory';
import { camera, GAME_WIDTH, VIEW_HEIGHT } from '../render/Camera';
import { TILE_WIDTH, TILE_HEIGHT } from '../level/TileType';
import { initInput, resetInput } from '../systems/InputSystem';
import { SIMULATION, PRESENTATION, runSystems } from '../systems/Simulation';
import type { FrameContext } from '../systems/Simulation';
import { resetNameTags, updateNameTags } from '../systems/NameTagSystem';
import { HudPanel } from '../ui/HudPanel';
import { InventoryPanel } from '../ui/InventoryPanel';
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
import { descend, run } from '../game/Run';

/** Tiles revealed around each player when the level starts, and every tick after. */
const START_REVEAL_TILES = 6;
const REVEAL_TILES = 5;
const TORCH_LIGHT_RADIUS = 120;
/** Torch flames flicker out of step, this far apart in phase. */
const TORCH_FLICKER_STEP = 1.3;
/** The player's lantern hangs this far above their feet. */
const LANTERN_LIFT = 16;
const LANTERN_RADIUS = 110;
/** The fog of war must cover entities in unexplored areas, not just the terrain. */
const FOG_Z = 1e7;
const BANNER_LIFT = 16;
const STATUS_Y = 6;

type Mode = 'solo' | 'host' | 'guest';

/**
 * One dungeon level. Alone or as the co-op host this screen runs the game; as a guest it draws the host's
 * world (built from the same seed) and sends this player's controls. Escape opens the pause menu.
 */
export class InGameScene implements Scene {
  readonly container = new Container();
  private readonly app: Application;
  private readonly mode: Mode;
  private readonly gameLayer = new Container();
  private readonly uiLayer = new Container();
  private terrain: LevelView | null = null;
  private readonly darkness = new DarknessRenderer();
  private readonly lights = new LightRenderer();
  private readonly hud = new HudPanel();
  private readonly inv = new InventoryPanel();
  private readonly shop = new ShopPanel();
  private readonly pause: PauseMenu;
  private shopWasOpen = false;
  private readonly crosshair = new Crosshair();
  private readonly completeBanner: PixelLabel;
  private readonly status: PixelLabel;
  private complete = false;
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
    resetLevelComplete();
    closeInventory();
    closeShop();
    world.clear();
    resetNameTags();

    this.gameLayer.sortableChildren = true;
    this.container.addChild(this.gameLayer, this.uiLayer);

    // A guest builds the level the host announced; alone or hosting, a fresh one.
    const seed = this.mode === 'guest' ? coop.level?.seed ?? 0 : randomSeed();
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
      const me = createPlayer(spawns.playerSpawn.x, spawns.playerSpawn.y);
      world.addComponent(me, 'playerSlot', 'host');
      if (this.mode === 'host') this.host = new HostGame(me, spawns.playerSpawn, seed, depth);
    }

    this.darkness.container.zIndex = FOG_Z;
    this.gameLayer.addChild(this.darkness.container);
    // Light overlay placed in uiLayer so it sits above game but below HUD
    this.lights.init();
    this.uiLayer.addChild(this.lights.overlay, this.hud.container, this.inv.container, this.shop.container);

    this.completeBanner = new PixelLabel('', { color: 0xffcc44, scale: 2, align: 'center', shadow: true });
    this.completeBanner.x = Math.floor(GAME_WIDTH / 2);
    this.completeBanner.y = Math.floor(VIEW_HEIGHT / 2) - BANNER_LIFT;
    this.completeBanner.visible = false;
    this.status = makeText('', 0xff8888, 8, 'center');
    this.status.x = GAME_WIDTH / 2;
    this.status.y = STATUS_Y;
    const levelLabel = makeText(`Depth ${depth}`, 0x998877, 8, 'right');
    levelLabel.x = GAME_WIDTH - 6;
    levelLabel.y = STATUS_Y;
    this.uiLayer.addChild(this.completeBanner, this.status, levelLabel);

    this.pause = new PauseMenu({
      resume: () => this.setPaused(false),
      settings: () => manager.pushOverlay('settings'),
      mainMenu: () => manager.goto('title'),
      exitGame: () => this.exitGame(),
    }, this.mode === 'guest'
      ? 'You will leave the co-op game.'
      : this.mode === 'host' ? 'The co-op game ends for everyone.' : 'This dungeon run will be lost.');
    // The crosshair replaces the OS pointer and is the player's focus in the world.
    this.uiLayer.addChild(this.crosshair.graphics, this.pause.container);
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
    else if (!this.pause.handleEscape()) this.setPaused(!this.pause.open);
  }

  /** Alone or hosting, pausing stops the world (for everyone); a guest's game goes on behind its menu. */
  private setPaused(paused: boolean): void {
    if (paused) this.pause.show(this.mode !== 'solo' && !coop.connected ? coop.status : '');
    else this.pause.hide();
    this.crosshair.graphics.visible = !paused;
    this.manager.canvas.style.cursor = paused ? '' : 'none';
    resetInput();
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
    this.tick++;
    this.ctx.tick = this.tick;
    const paused = this.pause.open;
    if (this.guest) this.guest.tick(this.level, paused || this.guest.hostPaused || !coop.connected);
    else this.simulate(paused);
    if (this.level.tilesDirty) this.rebuildTerrain();
    runSystems(PRESENTATION, this.ctx);

    const player = localPlayer();
    if (this.mode !== 'solo') updateNameTags(this.gameLayer, player);
    if (player) this.follow(player);
    this.revealAroundPlayers();
    this.gameLayer.x = -camera.x;
    this.gameLayer.y = -camera.y;

    this.darkness.update(this.level);
    this.lights.update(this.app, this.gatherLights(), this.tick);
    this.crosshair.update();
    this.updatePanels();
    this.updateStatus(player);
    if (this.mode !== 'guest' && !this.complete && isLevelComplete()) this.levelComplete();
  }

  /** Alone or hosting: one tick of the game (unless paused), and the world out to the guests. */
  private simulate(paused: boolean): void {
    const lost = this.host?.beforeTick(paused) ?? false;
    // Everyone else left: stop the world so the host can decide what to do.
    if (lost && !paused) this.setPaused(true);
    if (!paused && !lost) runSystems(SIMULATION, this.ctx);
    this.host?.afterTick(this.pause.open);
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
      this.level.reveal(Math.floor(p.position.x / TILE_WIDTH), Math.floor(p.position.y / TILE_HEIGHT), REVEAL_TILES);
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
      light.kind = 0;
      lights.push(light);
    }
    return lights;
  }

  private updatePanels(): void {
    this.hud.update();
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
    let text = '';
    if (this.mode !== 'solo' && !coop.connected) text = coop.status;
    else if (this.guest?.hostPaused) text = 'The host paused the game';
    else if (this.mode === 'guest' && !player) text = 'Joining the host...';
    this.status.text = text;
  }

  /** The exit was pulled. Alone or hosting, Enter goes deeper; a guest waits for the host. */
  private levelComplete(): void {
    if (this.complete) return;
    this.complete = true;
    closeShop();
    this.host?.levelComplete();
    this.completeBanner.text = this.mode === 'guest' ? 'LEVEL COMPLETE\nWaiting for the host' : 'LEVEL COMPLETE\nPress ENTER';
    this.completeBanner.visible = true;
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
    this.inv.destroy();
    this.pause.destroy();
    // The next scene is built before this one goes and owns the world by now (a new level has already
    // cleared it and filled it): only this scene's display objects go, the entities' sprites with them.
    this.container.destroy({ children: true });
  }
}
