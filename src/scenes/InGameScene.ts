import { Container, Graphics } from 'pixi.js';
import type { Application } from 'pixi.js';
import { world, q, localPlayer } from '../world';
import type { DepartChoice, Entity, Player } from '../world';
import type { Scene, SceneManager } from '../game/SceneManager';
import { text } from '../core/texts';
import { buildDungeon, buildSentDungeon, prepareLevel, randomSeed } from '../level/DungeonGenerator';
import { encodeLevelMap } from '../level/LevelMap';
import { buildLevelView } from '../level/TileRenderer';
import type { LevelView } from '../level/TileRenderer';
import { FogRenderer } from '../level/FogRenderer';
import { LightRenderer } from '../level/LightRenderer';
import type { LightSource } from '../level/LightRenderer';
import { createPlayer } from '../entities/PlayerFactory';
import { bindingFor, cleanName, settings } from '../game/Settings';
import { camera, GAME_HEIGHT, GAME_WIDTH, VIEW_HEIGHT } from '../render/Camera';
import { TILE_WIDTH, TILE_HEIGHT, FOG_REVEAL_TILES } from '../level/TileType';
import { initInput, resetInput, setInputCaptured } from '../systems/InputSystem';
import { runCommand } from '../game/Console';
import { ConsoleView } from '../ui/ConsoleView';
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
import { isGamePaused, setSeatPaused } from '../game/Pause';
import { anyoneToWatch, nextWatched, stillWatchable } from '../game/Spectate';
import { FallenBanner } from '../ui/FallenBanner';
import { cancelBinding, pendingBinding } from '../game/SpellBinding';
import { isShopOpen, activeShopItems, closeShop } from '../systems/ShopSystem';
import { departure, inExitRoom, requestDeparture } from '../systems/ExitSystem';
import { partyFallen, isStanding } from '../game/Fallen';
import { seatOf } from '../game/Party';
import { PixelLabel, makeText } from '../ui/PixelText';
import { Crosshair } from '../ui/Crosshair';
import { sound } from '../audio/SoundPlayer';
import { holdMusic, resetMusic } from '../systems/MusicSystem';
import { resetAmbience } from '../systems/AmbienceSystem';
import type { Level } from '../level/Level';
import { exposeForDebugging } from '../core/debugHooks';
import { coop } from '../network/CoopSession';
import { GuestGame, HostGame, pauserName } from '../network/CoopGame';
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
/** Each level opens out of black over this many ticks. */
const FADE_IN_TICKS = 70;
/** The loading screen hides the level behind it almost entirely. */
const LOADING_ALPHA = 0.92;
/** The mouse buttons a fallen hero picks the next and the previous companion to watch with. */
const NEXT_BUTTON = 0;
const PREVIOUS_BUTTON = 2;

type Mode = 'solo' | 'host' | 'guest';
type RunTotals = { kills: number; xp: number; gold: number };
/**
 * What the exit button puts on this screen: nothing, its question (this hero is in the exit room and hasn't chosen),
 * a wait for the others there, or — on every screen — the party's decision to end the run.
 */
type Prompt = 'none' | 'ask' | 'wait' | 'ended';
type ExitState = NonNullable<Entity['exitButton']>;

/** Everything the player has earned so far in the run. */
function totalsOf(stats: NonNullable<Player['playerStats']>): RunTotals {
  return { kills: stats.kills, xp: totalXp(stats), gold: stats.goldEarned };
}

/**
 * One dungeon level. Alone or as the co-op host this screen runs the game; as a guest it draws the host's
 * world (built from the same seed) and sends this player's controls. Escape closes the topmost thing open (a dialog,
 * then the panel under it) and, with nothing open, brings up the pause menu, which stops the game for everyone (in
 * co-op until the last player with it open closes theirs). The run is over once the whole party is down (alone, the
 * first death or fall); in co-op a fallen hero watches their companions meanwhile, picking whom with the mouse buttons.
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
  /** Black over everything as the level starts, lifting over FADE_IN_TICKS. */
  private readonly fadeIn = new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x000000 });
  private fadeTicks = 0;
  /** A guest between levels: the host has started the next one and its map is on the way. */
  private readonly loading = new Container();
  private readonly combatLog = new CombatLogPanel();
  private readonly inv = new InventoryOverlay();
  private readonly shop = new ShopPanel();
  private readonly pause: PauseMenu;
  private shopWasOpen = false;
  private readonly crosshair = new Crosshair();
  private readonly result = new ResultPanel();
  private readonly fallen = new FallenBanner();
  /** The companion this screen's fallen hero is watching (null: their own body). */
  private watched: Player | null = null;
  private readonly onPointerDown: (e: MouseEvent) => void;
  private readonly status: PixelLabel;
  private prompt: Prompt = 'none';
  /** Whether this screen's hero was alive last tick, to toll their death the moment it comes. */
  private heroAlive = true;
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
  /** The ~ console, for testing: alone only (in co-op its commands say so). */
  private readonly console = new ConsoleView((line) => runCommand(line, { player: localPlayer(), allowed: this.mode === 'solo' }));

  constructor(private readonly manager: SceneManager) {
    this.app = manager.application;
    this.mode = coop.role === 'host' ? 'host' : coop.role === 'guest' ? 'guest' : 'solo';
    // A level starts from an empty world: the previous level's entities (and their sprites, which lived in
    // its layers) are gone, along with any panel left open.
    closeInventory();
    closeShop();
    world.clear();
    resetNameTags();
    resetRollTexts();
    resetMusic();

    this.gameLayer.sortableChildren = true;
    this.container.addChild(this.gameLayer, this.uiLayer);

    // A guest builds the level the host announced; alone or hosting, a fresh one.
    const seed = this.mode === 'guest' ? coop.level?.seed ?? 0 : run.nextSeed ?? randomSeed();
    run.nextSeed = null;
    const depth = this.mode === 'guest' ? coop.level?.depth ?? 1 : run.depth;
    resetAmbience(depth);
    // A guest builds the very dungeon the host sent (its map came before this scene); the host sends its own.
    const sent = this.mode === 'guest' ? coop.level?.layout : undefined;
    const built = sent ? { ...buildSentDungeon(sent), layout: sent } : buildDungeon(seed, this.mode !== 'guest');
    const { level, spawns } = built;
    this.level = level;
    this.ctx = { level, dt: 1, tick: 0, gameLayer: this.gameLayer, rebuildTerrain: () => this.rebuildTerrain() };
    this.mountTerrain();
    level.clearDirty();
    this.torchSources = spawns.torchPositions.map((p, i) => ({
      x: p.x, y: p.y, radius: TORCH_LIGHT_RADIUS, kind: 0, flicker: i * TORCH_FLICKER_STEP,
    }));

    if (this.mode === 'guest') {
      this.guest = new GuestGame(() => manager.goto('in_game'));
      coop.sendLoaded(seed);
    } else {
      const me = createPlayer(spawns.playerSpawn.x, spawns.playerSpawn.y, settings.heroClass);
      world.addComponent(me, 'playerSlot', 'host');
      // The name typed on the character select; the combat log calls the hero by it (co-op renames it below).
      world.addComponent(me, 'playerName', cleanName(settings.playerName) || text('combat_log.default_hero'));
      restorePlayer(me);
      if (this.mode === 'host') this.host = new HostGame(me, spawns.playerSpawn, seed, depth, encodeLevelMap(built.layout));
    }

    this.darkness.container.zIndex = FOG_Z;
    this.gameLayer.addChild(this.darkness.container);
    // Light overlay placed in uiLayer so it sits above game but below HUD
    this.lights.init();
    this.uiLayer.addChild(this.lights.overlay, this.hud.container, this.fallen.view, this.combatLog.container, this.inv.container, this.shop.container);

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
    this.uiLayer.addChild(this.crosshair.graphics, this.console.container, this.pause.container, this.result.container, this.loading, this.fadeIn);
    this.buildLoadingOverlay();
    manager.canvas.style.cursor = 'none';
    initInput(manager.canvas);

    this.onKeyDown = (e) => this.handleKey(e);
    window.addEventListener('keydown', this.onKeyDown);
    this.onPointerDown = (e) => this.switchWatched(e);
    manager.canvas.addEventListener('mousedown', this.onPointerDown);
    level.reveal(Math.floor(spawns.playerSpawn.x / TILE_WIDTH), Math.floor(spawns.playerSpawn.y / TILE_HEIGHT), START_REVEAL_TILES);
    exposeForDebugging({ __world: world, __level: level });
  }

  /**
   * Escape closes one thing a press, the topmost first: a spell waiting for its square, a sub-screen over the pause
   * menu, the pause menu's confirmation and then the menu itself; with no menu, a dialog inside a panel, the panel (the
   * inventory, the shop), the HUD's dialogs and drop-downs. Only with nothing open does it bring up the pause menu.
   */
  private handleKey(e: KeyboardEvent): void {
    if (this.consoleKey(e)) return;
    if (e.code === 'Enter' && this.prompt === 'ask') {
      requestDeparture('next');
      return;
    }
    if (e.code !== 'Escape') return;
    if (pendingBinding()) {
      cancelBinding();
      return;
    }
    if (this.manager.hasOverlay) {
      this.manager.escapeOverlay();
      return;
    }
    if (this.pause.open) {
      if (!this.pause.handleEscape()) this.setPaused(false);
      return;
    }
    if (this.result.open || this.closeTopmost()) return;
    this.setPaused(true);
  }

  /** Escape outside the pause menu: closes the topmost panel or dialog; false when none is open. */
  private closeTopmost(): boolean {
    if (isInventoryOpen()) {
      if (!this.inv.handleEscape()) closeInventory();
      return true;
    }
    if (isShopOpen()) {
      closeShop();
      return true;
    }
    return this.hud.closeDialog();
  }

  /** The console key opens or closes it; while it is open every key types into it (Escape closes it). Returns whether the key was its. */
  private consoleKey(e: KeyboardEvent): boolean {
    if (e.code === bindingFor('console')) {
      e.preventDefault();
      this.toggleConsole();
      return true;
    }
    if (!this.console.visible) return false;
    if (e.code === 'Escape') this.toggleConsole();
    else this.console.handleKey(e);
    return true;
  }

  private toggleConsole(): void {
    if (this.pause.open || this.result.open) return;
    const open = !this.console.visible;
    if (open) this.console.open();
    else this.console.close();
    setInputCaptured(open);
  }

  /**
   * Opens or closes the pause menu, which stops the game: alone at once; in co-op for everyone, the host keeping who
   * has it open (a guest tells the host), until the last of them closes it.
   */
  private setPaused(paused: boolean): void {
    if (paused) this.pause.show(this.mode !== 'solo' && !coop.connected ? coop.status : '');
    else this.pause.hide();
    if (this.mode === 'host') setSeatPaused('host', paused);
    if (this.mode === 'guest') coop.sendCommand({ kind: 'pause', paused });
    this.showPointer(paused);
  }

  /** A menu needs the OS pointer; in the world the crosshair takes its place. */
  private showPointer(visible: boolean): void {
    this.crosshair.graphics.visible = !visible;
    this.manager.canvas.style.cursor = visible ? '' : 'none';
    resetInput();
  }

  /**
   * Whether the world stands still: alone, behind the pause menu or the game over screen; in co-op while anyone has
   * the pause menu open (the host knows who; a guest goes by what the host last said).
   */
  private get frozen(): boolean {
    if (this.mode === 'host') return isGamePaused();
    if (this.guest) return this.guest.hostPaused;
    return this.pause.open || run.over;
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
    if (this.fadeTicks < FADE_IN_TICKS) this.fadeIn.alpha = 1 - ++this.fadeTicks / FADE_IN_TICKS;
    this.ctx.tick = this.tick;
    if (this.guest) this.guest.tick(this.level, this.pause.open || this.guest.hostPaused || !coop.connected);
    else this.simulate(frozen);
    if (this.level.tilesDirty) this.rebuildTerrain();
    // Frozen, nothing animates either: the last frame stays up behind the menu.
    if (!frozen) runSystems(PRESENTATION, this.ctx);

    const player = localPlayer();
    this.baseline ??= player ? totalsOf(player.playerStats) : null;
    if (this.mode !== 'solo') updateNameTags(this.gameLayer, player);
    this.noticeDeath(player);
    const view = this.viewOf(player);
    if (view) this.follow(view);
    this.updateFallen(player);
    this.revealAroundPlayers();
    this.gameLayer.x = -camera.x;
    this.gameLayer.y = -camera.y;

    this.darkness.update(this.app.renderer, this.level, this.tick);
    this.lights.update(this.app, this.gatherLights(), this.tick);
    this.crosshair.update();
    this.console.update();
    this.updatePanels();
    this.updateStatus(player);
    this.updateDeparture(player);
    // A guest's copy of the world tells it too when the whole party is down.
    const lost = run.over || (this.mode === 'guest' && partyFallen());
    if (lost && !this.gameOverShown) this.gameOver();
  }

  /** Alone or hosting: one tick of the game (unless frozen), and the world out to the guests (with whether it is paused). */
  private simulate(frozen: boolean): void {
    const lost = this.host?.beforeTick(frozen) ?? false;
    // Everyone else left: bring up the menu so the host can decide what to do.
    if (lost && !this.pause.open) this.setPaused(true);
    if (!frozen && !lost) runSystems(SIMULATION, this.ctx);
    this.host?.afterTick(frozen);
  }

  /** The camera and listener follow this screen's player. */
  private follow(player: Player): void {
    const pos = player.position;
    sound.setListener(pos.x, pos.y);
    camera.x = Math.max(0, Math.min(this.level.width * TILE_WIDTH - GAME_WIDTH, Math.round(pos.x - GAME_WIDTH / 2)));
    camera.y = Math.max(0, Math.min(this.level.height * TILE_HEIGHT - VIEW_HEIGHT, Math.round(pos.y - VIEW_HEIGHT / 2)));
  }

  /**
   * This screen's hero has just fallen: the toll is for them alone (everyone near hears their death cry), and the
   * panels and HUD dialogs they had open close (they have nothing left to do).
   */
  private noticeDeath(player: Player | undefined): void {
    const alive = !player || player.health.current > 0;
    if (this.heroAlive && !alive) this.fall();
    this.heroAlive = alive;
  }

  private fall(): void {
    sound.playLocal('you_died');
    this.watched = null;
    if (pendingBinding()) cancelBinding();
    closeInventory();
    closeShop();
    while (this.hud.closeDialog());
  }

  /** Whether this screen's hero is down while the run goes on in co-op: they watch the others. */
  private spectating(player: Player | undefined): player is Player {
    return this.mode !== 'solo' && !!player && !isStanding(player) && !this.gameOverShown;
  }

  /** Whom the camera follows: this screen's hero, or — fallen — the companion they watch (their own body until they pick one). */
  private viewOf(player: Player | undefined): Player | undefined {
    if (!this.spectating(player)) return player;
    // The one being watched fell too, or left: on to the next still standing.
    if (this.watched && !stillWatchable(this.watched)) this.watched = nextWatched(player, this.watched, 1);
    return this.watched ?? player;
  }

  /** A fallen hero's click: the left button watches the next companion, the right one the one before. */
  private switchWatched(e: MouseEvent): void {
    const me = localPlayer();
    if (!this.spectating(me) || this.pause.open || this.result.open || this.manager.hasOverlay) return;
    if (e.button === NEXT_BUTTON) this.watched = nextWatched(me, this.watched, 1);
    else if (e.button === PREVIOUS_BUTTON) this.watched = nextWatched(me, this.watched, -1);
  }

  /** While this screen's hero is down in co-op, their HUD gives way to the banner saying so (and whom they watch). */
  private updateFallen(player: Player | undefined): void {
    const down = this.spectating(player);
    this.hud.container.visible = !down;
    if (!down) {
      this.fallen.hide();
      return;
    }
    const watched = this.watched?.playerName ?? null;
    this.fallen.show(watched, anyoneToWatch(player));
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
    this.loading.visible = this.mode === 'guest' && coop.loadingLevel;
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

  /** Black with "Loading…" in the middle, shown while a guest waits for the next level's map. */
  private buildLoadingOverlay(): void {
    const label = makeText(text('game.loading'), 0xe8dcc0, 12, 'center');
    label.position.set(Math.round(GAME_WIDTH / 2), Math.round(GAME_HEIGHT / 2 - 8));
    this.loading.addChild(new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x000000, alpha: LOADING_ALPHA }), label);
    this.loading.visible = false;
  }

  /** A line at the top of the screen when co-op is not running normally. */
  private updateStatus(player: Player | undefined): void {
    let line = '';
    const pausedBy = this.pausedBy();
    if (this.mode !== 'solo' && !coop.connected) line = coop.status;
    else if (pausedBy !== null) line = text('game.paused_by', { name: pausedBy });
    else if (this.mode === 'guest' && !player) line = text('game.joining');
    else if (this.leavingWithout(player)) line = text('game.departing');
    this.status.text = line;
  }

  /** Who has the co-op game paused, when it is someone else's menu that holds it (null: nobody, or only this screen). */
  private pausedBy(): string | null {
    if (this.pause.open || !this.frozen || this.mode === 'solo') return null;
    return this.guest ? this.guest.pausedBy : pauserName();
  }

  /** Whether the party is choosing to leave at the exit room while this hero, on their feet, is elsewhere: they had better hurry. */
  private leavingWithout(player: Player | undefined): boolean {
    const exit = departure();
    return !!exit?.activated && !exit.outcome && !!player && isStanding(player) && !inExitRoom(player);
  }

  /**
   * The exit button (systems/ExitSystem.ts): once pressed, the next level is made ready in the background; once the
   * party has chosen, alone or hosting this screen goes deeper (the guests follow the host), and alone ending the run
   * goes back to the title. Meanwhile the question, a wait or the run's end shows as this screen's hero calls for.
   */
  private updateDeparture(player: Player | undefined): void {
    if (this.gameOverShown) return;
    const exit = departure();
    const runsGame = this.mode !== 'guest';
    if (runsGame && exit?.activated && run.nextSeed === null) this.prepareNextLevel();
    if (runsGame && exit?.outcome === 'next') {
      this.nextLevel();
      return;
    }
    if (this.mode === 'solo' && exit?.outcome === 'end') {
      this.manager.goto('title');
      return;
    }
    this.showPrompt(this.promptFor(exit, player));
  }

  private promptFor(exit: ExitState | undefined, player: Player | undefined): Prompt {
    if (exit?.outcome === 'end') return 'ended';
    if (!exit?.activated || exit.outcome || !player || !inExitRoom(player)) return 'none';
    return exit.choices[seatOf(player)] ? 'wait' : 'ask';
  }

  private showPrompt(prompt: Prompt): void {
    if (prompt === this.prompt) return;
    this.prompt = prompt;
    if (prompt === 'none') {
      this.result.hide();
      this.showPointer(this.pause.open);
      return;
    }
    if (prompt === 'ended') this.runEnded();
    else this.askToLeave(prompt === 'wait');
    this.showPointer(true);
  }

  /** The level's summary, with the choice to go deeper or end the run here (once chosen, a wait for the others in the room). */
  private askToLeave(chosen: boolean): void {
    holdMusic('rest');
    closeShop();
    const gained = this.levelTotals();
    const choose = (choice: DepartChoice) => () => requestDeparture(choice);
    this.result.show({
      title: text('game.level_complete.title'),
      titleColor: 0xffcc44,
      lines: [
        text('game.level_complete.kills', { count: gained.kills }),
        text('game.level_complete.xp', { count: gained.xp }),
        text('game.level_complete.gold', { count: gained.gold }),
      ],
      waiting: chosen ? text('game.level_complete.waiting') : undefined,
      buttons: [
        { label: text('game.level_complete.next'), action: choose('next') },
        { label: text('game.level_complete.end_run'), action: choose('end') },
      ],
    });
  }

  /** Someone in the exit room chose to end the run: every screen shows the run's totals, and the way out. */
  private runEnded(): void {
    holdMusic('rest');
    closeShop();
    closeInventory();
    this.result.show({
      title: text('game.run_ended.title'),
      titleColor: 0xffcc44,
      lines: this.runLines(),
      buttons: this.endButtons(),
    });
  }

  /** The run's totals so far, for the game over and the run's end. */
  private runLines(): string[] {
    const stats = localPlayer()?.playerStats;
    const total = stats ? totalsOf(stats) : { kills: 0, xp: 0, gold: 0 };
    return [
      text('game.game_over.depth', { depth: this.mode === 'guest' ? coop.level?.depth ?? run.depth : run.depth }),
      text('game.game_over.kills', { count: total.kills }),
      text('game.game_over.xp', { count: total.xp }),
      text('game.game_over.gold', { count: total.gold }),
    ];
  }

  /** After the run: a new one (alone or hosting; the guests follow the host into it), or the main menu. */
  private endButtons(): Array<{ label: string; action: () => void }> {
    const menu = { label: text('game.game_over.main_menu'), action: () => this.manager.goto('title') };
    if (this.mode === 'guest') return [menu];
    return [{ label: text('game.game_over.new_game'), action: () => this.newGame() }, menu];
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

  /** The whole party is down (alone, the first death or fall): the world stays as it was, with the choice on top. */
  private gameOver(): void {
    this.gameOverShown = true;
    holdMusic('lament');
    // Through setPaused, so a co-op host lets go of the game too.
    if (this.pause.open) this.setPaused(false);
    closeShop();
    closeInventory();
    this.result.show({
      title: text('game.game_over.title'),
      titleColor: 0xff5544,
      lines: this.runLines(),
      buttons: this.endButtons(),
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
    this.manager.canvas.removeEventListener('mousedown', this.onPointerDown);
    // Leaving with the menu open: the game is this screen's no longer to hold.
    if (this.mode === 'host' && this.pause.open) setSeatPaused('host', false);
    if (this.console.visible) setInputCaptured(false);
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
