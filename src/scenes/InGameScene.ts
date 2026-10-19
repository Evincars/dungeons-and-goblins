import { Application, Container } from 'pixi.js';
import { world } from '../world';
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
import { GAME_WIDTH as VIEW_W, VIEW_HEIGHT as VIEW_H } from '../render/Camera';
import type { Level } from '../level/Level';

export class InGameScene {
  readonly container = new Container();
  private app!: Application;
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
  onQuit?: () => void;
  onComplete?: () => void;

  async init(app: Application): Promise<void> {
    this.app = app;
    resetLevelComplete();

    // Build layers
    this.gameLayer = new Container();
    this.gameLayer.sortableChildren = true;
    this.uiLayer = new Container();

    this.container.addChild(this.gameLayer, this.uiLayer);

    // Build dungeon
    const { level, spawns } = buildDungeon();
    this.level = level;

    // Terrain (clear dirty flag so it doesn't rebuild every frame)
    this.mountTerrain();
    level.clearDirty();

    // Spawn player
    const { playerSpawn, torchPositions } = spawns;
    createPlayer(playerSpawn.x, playerSpawn.y);

    // Build torch light sources
    this.torchSources = torchPositions.map((p, i) => ({
      x: p.x, y: p.y,
      radius: 120,
      kind: 0 as const,
      flicker: i * 1.3,
    }));

    // Fog of war
    this.darkness = new DarknessRenderer();
    // Fog of war must cover entities in unexplored areas, not just the terrain.
    this.darkness.container.zIndex = 1e7;
    this.gameLayer.addChild(this.darkness.container);

    // Lights overlay
    this.lights = new LightRenderer();
    this.lights.init(app);
    // Light overlay placed in uiLayer so it sits above game but below HUD
    this.uiLayer.addChild(this.lights.overlay);

    // HUD
    this.hud = new HudPanel();
    this.inv = new InventoryPanel();
    this.shop = new ShopPanel();
    this.uiLayer.addChild(this.hud.container, this.inv.container, this.shop.container);

    // Level-complete banner (hidden until the exit button is pulled)
    this.completeBanner = new PixelLabel('LEVEL COMPLETE\nPress ENTER', {
      color: 0xffcc44, scale: 2, align: 'center', shadow: true,
    });
    this.completeBanner.x = Math.floor(VIEW_W / 2);
    this.completeBanner.y = Math.floor(VIEW_H / 2) - 16;
    this.completeBanner.visible = false;
    this.uiLayer.addChild(this.completeBanner);

    // The crosshair replaces the OS pointer and is the player's focus in the world.
    this.uiLayer.addChild(this.crosshair.graphics);
    (app.canvas as HTMLCanvasElement).style.cursor = 'none';

    // Input
    initInput(app.canvas as HTMLCanvasElement);

    // Initial reveal around player spawn
    level.reveal(
      Math.floor(playerSpawn.x / TILE_WIDTH),
      Math.floor(playerSpawn.y / TILE_HEIGHT),
      6,
    );
  }

  /** (Re)builds the terrain: flat layer at the bottom, wall rows/arches depth-sorted with entities. */
  private mountTerrain(): void {
    if (this.terrain) {
      this.terrain.base.destroy({ children: true });
      for (const o of this.terrain.occluders) o.destroy();
    }
    this.terrain = buildLevelView(this.level);
    this.terrain.base.zIndex = -1;
    this.gameLayer.addChildAt(this.terrain.base, 0);
    for (const o of this.terrain.occluders) this.gameLayer.addChild(o);
  }

  update(): void {
    this.tick++;

    const ctx: FrameContext = {
      level: this.level,
      dt: 1,
      tick: this.tick,
      gameLayer: this.gameLayer,
      rebuildTerrain: () => {
        this.level.clearDirty();
        this.mountTerrain();
      },
    };

    runSystems(SIMULATION, ctx);
    runSystems(PRESENTATION, ctx);

    // Camera follow player
    for (const player of world.with('position', 'playerInput')) {
      const pos = player.position!;
      sound.setListener(pos.x, pos.y);
      camera.x = Math.max(0, Math.min(
        this.level.width * TILE_WIDTH - GAME_WIDTH,
        Math.round(pos.x - GAME_WIDTH / 2),
      ));
      camera.y = Math.max(0, Math.min(
        this.level.height * TILE_HEIGHT - VIEW_HEIGHT,
        Math.round(pos.y - VIEW_HEIGHT / 2),
      ));

      // Reveal tiles around player each tick
      this.level.reveal(
        Math.floor(pos.x / TILE_WIDTH),
        Math.floor(pos.y / TILE_HEIGHT),
        5,
      );
      break;
    }

    // Scroll game layer
    this.gameLayer.x = -camera.x;
    this.gameLayer.y = -camera.y;

    // Darkness fog of war
    this.darkness.update(this.level);

    // Gather all light sources for this frame
    const lights: LightSource[] = [...this.torchSources];
    // Add player lantern
    for (const player of world.with('position', 'playerInput')) {
      const pos = player.position!;
      lights.push({ x: pos.x, y: pos.y - 16, radius: 110, kind: 1 });
      break;
    }
    // Glowing entities (spell bolts, …)
    for (const e of world.with('position', 'glow')) {
      lights.push({ x: e.position!.x, y: e.position!.y - (e.yOffset ?? 0), radius: e.glow!.radius, kind: 0 });
    }
    this.lights.update(this.app, lights, this.tick);
    this.crosshair.update();

    // HUD update
    this.hud.update();
    this.inv.setVisible(isInventoryOpen());
    this.inv.update();

    // Shop: refresh its rows on the open transition, then track visibility
    const shopOpen = isShopOpen();
    if (shopOpen && !this.shopWasOpen) this.shop.setItems(activeShopItems());
    this.shopWasOpen = shopOpen;
    this.shop.setVisible(shopOpen);
    this.shop.update();

    // Level complete
    if (!this.complete && isLevelComplete()) {
      this.complete = true;
      closeShop();
      this.completeBanner.visible = true;
      const onKey = (e: KeyboardEvent) => {
        if (e.code === 'Enter' || e.code === 'Space') {
          window.removeEventListener('keydown', onKey);
          this.onComplete?.();
        }
      };
      window.addEventListener('keydown', onKey);
    }
  }

  destroy(): void {
    (this.app.canvas as HTMLCanvasElement).style.cursor = '';
    this.crosshair.destroy();
    clearSprites();
    this.darkness.destroy();
    this.lights.destroy();
    this.hud.destroy();
    this.inv.destroy();
    // Remove all world entities
    for (const e of world.with('position')) world.remove(e);
    this.container.destroy({ children: true });
  }
}
