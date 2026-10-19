import { Application, Container } from 'pixi.js';
import { world } from '../world';
import { buildDungeon } from '../level/DungeonGenerator';
import { buildLevelView, syncWalls } from '../level/TileRenderer';
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
import { GAME_WIDTH as VIEW_W, VIEW_HEIGHT as VIEW_H } from '../render/Camera';
import type { Level } from '../level/Level';

export class InGameScene {
  readonly container = new Container();
  private app!: Application;
  private gameLayer!: Container;
  private uiLayer!: Container;
  private terrainContainer!: Container;
  private darkness!: DarknessRenderer;
  private lights!: LightRenderer;
  private hud!: HudPanel;
  private inv!: InventoryPanel;
  private shop!: ShopPanel;
  private shopWasOpen = false;
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
    this.terrainContainer = buildLevelView(level);
    this.gameLayer.addChild(this.terrainContainer);
    syncWalls(level);
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

    // Input
    initInput(app.canvas as HTMLCanvasElement);

    // Initial reveal around player spawn
    level.reveal(
      Math.floor(playerSpawn.x / TILE_WIDTH),
      Math.floor(playerSpawn.y / TILE_HEIGHT),
      6,
    );
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
        this.terrainContainer.destroy();
        this.terrainContainer = buildLevelView(this.level);
        this.gameLayer.addChildAt(this.terrainContainer, 0);
        syncWalls(this.level);
      },
    };

    runSystems(SIMULATION, ctx);
    runSystems(PRESENTATION, ctx);

    // Camera follow player
    for (const player of world.with('position', 'playerInput')) {
      const pos = player.position!;
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
      lights.push({ x: pos.x, y: pos.y, radius: 70, kind: 1 });
      break;
    }
    this.lights.update(this.app, lights, this.tick);

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
