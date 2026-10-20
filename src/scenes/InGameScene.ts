import { Application, Container } from 'pixi.js';
import { world, q, firstPlayer } from '../world';
import type { Player } from '../world';
import { buildDungeon } from '../level/DungeonGenerator';
import { buildLevelView } from '../level/TileRenderer';
import type { LevelView } from '../level/TileRenderer';
import { DarknessRenderer } from '../level/DarknessRenderer';
import { LightRenderer } from '../level/LightRenderer';
import type { LightSource } from '../level/LightRenderer';
import { createPlayer } from '../entities/PlayerFactory';
import { camera, GAME_WIDTH, VIEW_HEIGHT } from '../render/Camera';
import { TILE_WIDTH, TILE_HEIGHT } from '../level/TileType';
import { initInput } from '../systems/InputSystem';
import { SIMULATION, PRESENTATION, runSystems } from '../systems/Simulation';
import type { FrameContext } from '../systems/Simulation';
import { clearSprites } from '../systems/SpriteSystem';
import { HudPanel } from '../ui/HudPanel';
import { InventoryPanel } from '../ui/InventoryPanel';
import { ShopPanel } from '../ui/ShopPanel';
import { isInventoryOpen } from '../systems/InventorySystem';
import { isShopOpen, activeShopItems, closeShop } from '../systems/ShopSystem';
import { isLevelComplete, resetLevelComplete } from '../systems/ExitSystem';
import { PixelLabel } from '../ui/PixelText';
import { Crosshair } from '../ui/Crosshair';
import { sound } from '../audio/SoundPlayer';
import type { Level } from '../level/Level';
import { exposeForDebugging } from '../core/debugHooks';

/** Tiles revealed around the player when the level starts, and every tick after. */
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

export class InGameScene {
  readonly container = new Container();
  private app!: Application;
  private canvas!: HTMLCanvasElement;
  private gameLayer!: Container;
  private uiLayer!: Container;
  private terrain: LevelView | null = null;
  private darkness!: DarknessRenderer;
  private lights!: LightRenderer;
  private hud!: HudPanel;
  private inv!: InventoryPanel;
  private shop!: ShopPanel;
  private shopWasOpen = false;
  private crosshair = new Crosshair();
  private completeBanner!: PixelLabel;
  private complete = false;
  private level!: Level;
  private tick = 0;
  private torchSources: LightSource[] = [];
  /** This frame's lights: the torches, then pooled entries for the lantern and glowing entities. */
  private frameLights: LightSource[] = [];
  private lightPool: LightSource[] = [];
  /** What every system is handed each tick; made once the level exists. */
  private ctx!: FrameContext;
  onQuit?: () => void;
  onComplete?: () => void;

  async init(app: Application, canvas: HTMLCanvasElement): Promise<void> {
    this.app = app;
    this.canvas = canvas;
    resetLevelComplete();

    // Build layers
    this.gameLayer = new Container();
    this.gameLayer.sortableChildren = true;
    this.uiLayer = new Container();
    this.container.addChild(this.gameLayer, this.uiLayer);

    const { level, spawns } = buildDungeon();
    this.level = level;
    this.ctx = { level, dt: 1, tick: 0, gameLayer: this.gameLayer, rebuildTerrain: () => this.rebuildTerrain() };

    // Terrain (clear dirty flag so it doesn't rebuild every frame)
    this.mountTerrain();
    level.clearDirty();

    const { playerSpawn, torchPositions } = spawns;
    createPlayer(playerSpawn.x, playerSpawn.y);
    this.torchSources = torchPositions.map((p, i) => ({
      x: p.x, y: p.y, radius: TORCH_LIGHT_RADIUS, kind: 0, flicker: i * TORCH_FLICKER_STEP,
    }));

    this.darkness = new DarknessRenderer();
    this.darkness.container.zIndex = FOG_Z;
    this.gameLayer.addChild(this.darkness.container);

    // Light overlay placed in uiLayer so it sits above game but below HUD
    this.lights = new LightRenderer();
    this.lights.init();
    this.uiLayer.addChild(this.lights.overlay);

    this.hud = new HudPanel();
    this.inv = new InventoryPanel();
    this.shop = new ShopPanel();
    this.uiLayer.addChild(this.hud.container, this.inv.container, this.shop.container);
    this.buildBanner();

    // The crosshair replaces the OS pointer and is the player's focus in the world.
    this.uiLayer.addChild(this.crosshair.graphics);
    canvas.style.cursor = 'none';
    initInput(canvas);

    level.reveal(Math.floor(playerSpawn.x / TILE_WIDTH), Math.floor(playerSpawn.y / TILE_HEIGHT), START_REVEAL_TILES);
    exposeForDebugging({ __world: world, __level: level });
  }

  /** Level-complete banner (hidden until the exit button is pulled). */
  private buildBanner(): void {
    this.completeBanner = new PixelLabel('LEVEL COMPLETE\nPress ENTER', {
      color: 0xffcc44, scale: 2, align: 'center', shadow: true,
    });
    this.completeBanner.x = Math.floor(GAME_WIDTH / 2);
    this.completeBanner.y = Math.floor(VIEW_HEIGHT / 2) - BANNER_LIFT;
    this.completeBanner.visible = false;
    this.uiLayer.addChild(this.completeBanner);
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
    runSystems(SIMULATION, this.ctx);
    runSystems(PRESENTATION, this.ctx);

    const player = firstPlayer();
    if (player) this.follow(player);
    this.gameLayer.x = -camera.x;
    this.gameLayer.y = -camera.y;

    this.darkness.update(this.level);
    this.lights.update(this.app, this.gatherLights(player), this.tick);
    this.crosshair.update();
    this.updatePanels();
    this.checkComplete();
  }

  /** Camera and listener follow the player, and the fog lifts around them. */
  private follow(player: Player): void {
    const pos = player.position;
    sound.setListener(pos.x, pos.y);
    camera.x = Math.max(0, Math.min(this.level.width * TILE_WIDTH - GAME_WIDTH, Math.round(pos.x - GAME_WIDTH / 2)));
    camera.y = Math.max(0, Math.min(this.level.height * TILE_HEIGHT - VIEW_HEIGHT, Math.round(pos.y - VIEW_HEIGHT / 2)));
    this.level.reveal(Math.floor(pos.x / TILE_WIDTH), Math.floor(pos.y / TILE_HEIGHT), REVEAL_TILES);
  }

  private pooledLight(i: number): LightSource {
    return this.lightPool[i] ?? (this.lightPool[i] = { x: 0, y: 0, radius: 0, kind: 0 });
  }

  /** Every light this frame: torches, the player's lantern, and glowing entities (spell bolts, candles). */
  private gatherLights(player: Player | undefined): LightSource[] {
    const lights = this.frameLights;
    lights.length = 0;
    for (const torch of this.torchSources) lights.push(torch);
    let used = 0;
    if (player) {
      const lantern = this.pooledLight(used++);
      lantern.x = player.position.x;
      lantern.y = player.position.y - LANTERN_LIFT;
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

  private checkComplete(): void {
    if (this.complete || !isLevelComplete()) return;
    this.complete = true;
    closeShop();
    this.completeBanner.visible = true;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Enter' && e.code !== 'Space') return;
      window.removeEventListener('keydown', onKey);
      this.onComplete?.();
    };
    window.addEventListener('keydown', onKey);
  }

  destroy(): void {
    this.canvas.style.cursor = '';
    this.crosshair.destroy();
    clearSprites();
    this.darkness.destroy();
    this.lights.destroy();
    this.hud.destroy();
    this.inv.destroy();
    // Every entity belongs to this level, including the ones without a position (rooms).
    world.clear();
    this.container.destroy({ children: true });
  }
}
