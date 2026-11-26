import { Container, Graphics } from 'pixi.js';
import type { LevelTheme } from '../level/Theme';
import type { Application } from 'pixi.js';
import { world, q, localPlayer } from '../world';
import type { Entity, Player, PlayerSlot } from '../world';
import { heroName } from '../rules/Names';
import { heroClass } from '../rules/Classes';
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
import { camera, GAME_HEIGHT, GAME_WIDTH, viewHeight, viewWidth, zoomBy } from '../render/Camera';
import { TILE_WIDTH, TILE_HEIGHT, FOG_REVEAL_TILES } from '../level/TileType';
import { initInput, pointerFree, resetInput, setInputCaptured, setPanelsOpen } from '../systems/InputSystem';
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
import { isShopOpen, activeTrader, closeShop } from '../systems/ShopSystem';
import { departure, inExitRoom, requestDeparture } from '../systems/ExitSystem';
import { partyFallen, isStanding } from '../game/Fallen';
import { seatOf } from '../game/Party';
import { PixelLabel, makeText } from '../ui/PixelText';
import { setPointerAim } from '../ui/Pointer';
import type { PointerAim } from '../ui/Pointer';
import { crosshairTarget } from '../systems/TargetSystem';
import { sound } from '../audio/SoundPlayer';
import { holdMusic, resetMusic } from '../systems/MusicSystem';
import { resetAmbience } from '../systems/AmbienceSystem';
import type { Level } from '../level/Level';
import { exposeForDebugging } from '../core/debugHooks';
import { coop } from '../network/CoopSession';
import { GuestGame, HostGame, pauserName } from '../network/CoopGame';
import { carriedPartyLevel, descend, nextTheme, rebuildLevelAs, restorePlayer, resumeRun, run, startRun } from '../game/Run';
import { captureSave, savedLayout, savedPartyLevel, seatsFor, takeChosenSave } from '../game/SaveGame';
import type { SaveFile, SaveSource } from '../game/SaveGame';
import { storeSave } from '../game/SaveStore';
import { restoreSavedWorld } from '../game/SaveRestore';
import { setDifficulty } from '../game/Difficulty';
import { ResultPanel } from '../ui/ResultPanel';
import { updateSeeThrough } from '../systems/SeeThroughSystem';
import { attempt, report, reportRejection } from '../core/errors';

/** The Third Eye's darkvision lifts the fog this many times as far round its hero. */
const DARKVISION_FACTOR = 2;
/** Tiles revealed around each player when the level starts (every tick after, FOG_REVEAL_TILES). */
const START_REVEAL_TILES = 6;
const TORCH_LIGHT_RADIUS = 120;
/** Torch flames flicker out of step, this far apart in phase. */
const TORCH_FLICKER_STEP = 1.3;
/** Each hero carries a torch this far above their feet, its firelight reaching this far and flickering as a flame does. */
const HERO_TORCH_LIFT = 16;
const HERO_TORCH_RADIUS = 150;
/** Heroes' torches flicker out of step with each other and with the wall torches. */
const HERO_TORCH_PHASE = 0.7;
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
 * What the exit portal puts on this screen: nothing, its question (this hero is in the exit room and hasn't chosen),
 * a wait for the others there, or — on every screen — the party's decision to end the run.
 */
type Prompt = 'none' | 'ask' | 'wait' | 'ended';
type ExitState = NonNullable<Entity['exitButton']>;

/** What a hero has done over the run, for a level's summary (its share is now less then). */
type LevelTally = { kills: number; xp: number; damage: number; crits: number; fumbles: number };
const TALLY_KEYS = ['kills', 'xp', 'damage', 'crits', 'fumbles'] as const satisfies ReadonlyArray<keyof LevelTally>;
const SUMMARY_COLUMNS = [
  'game.level_complete.col.hero', 'game.level_complete.col.kills', 'game.level_complete.col.xp', 'game.level_complete.col.damage',
  'game.level_complete.col.crits', 'game.level_complete.col.fumbles',
] as const;

/** The note in the pause menu that the game was saved. */
const SAVED_COLOR = 0x9be08a;

/** A new hero for this screen's player, at the level's start (with what they carried, or the starting kit). */
function freshHero(spawn: { x: number; y: number }): Entity {
  const me = createPlayer(spawn.x, spawn.y, settings.heroClass);
  world.addComponent(me, 'playerSlot', 'host');
  restorePlayer(me);
  return me;
}

function tallyOf(stats: NonNullable<Player['playerStats']>): LevelTally {
  return { kills: stats.kills, xp: totalXp(stats), damage: stats.damageDealt ?? 0, crits: stats.critHits ?? 0, fumbles: stats.critMisses ?? 0 };
}

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
  /** The world drawn over its light and fog (the aim guide), placed and zoomed as the game layer is. */
  private readonly overLayer = new Container();
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
  /**
   * What the game's pointer (ui/Pointer.ts) is over: a menu, a panel or the HUD (the hand), or the world (the cross,
   * red over an enemy).
   */
  private readonly aim: PointerAim = () => (this.pointerOnUi() ? 'ui' : crosshairTarget());
  private readonly result = new ResultPanel();
  private readonly fallen = new FallenBanner();
  /** The companion this screen's fallen hero is watching (null: their own body). */
  private watched: Player | null = null;
  private readonly onPointerDown: (e: MouseEvent) => void;
  /**
   * The mouse wheel over the world zooms in and out (render/Camera.ts); over a panel or a control it is theirs (to scroll
   * a list), and while the game is paused or a panel is open it does nothing.
   */
  private readonly onWheel = (e: WheelEvent): void => {
    if (!pointerFree() || this.pause.open || isInventoryOpen() || isShopOpen() || e.deltaY === 0) return;
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1 : -1);
  };
  private readonly status: PixelLabel;
  private prompt: Prompt = 'none';
  /** Whether this screen's hero was alive last tick, to toll their death the moment it comes. */
  private heroAlive = true;
  private gameOverShown = false;
  /** What the player carried in, to tell this level's kills, XP and gold from the run's total. */
  private baseline: RunTotals | null = null;
  /** Each hero's tallies as this level began (seen first), for the level's summary table. */
  private readonly levelStart = new Map<PlayerSlot, LevelTally>();
  private readonly level: Level;
  /** What a save of this level is made from. */
  private readonly saveSource: SaveSource;
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
  private readonly console = new ConsoleView((line) => runCommand(line, {
    player: localPlayer(), allowed: this.mode === 'solo', rebuild: (theme) => this.rebuildAs(theme),
  }));

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

    // A saved game picked on the load screen is taken up (alone or hosting): its depth, its kind of dungeon, its map.
    const loaded = this.mode === 'guest' ? null : takeChosenSave();
    if (loaded) resumeRun(loaded.run.depth, loaded.run.theme, loaded.run.seed);
    // A guest builds the level the host announced; alone or hosting, a fresh one (or the saved one).
    const seed = this.mode === 'guest' ? coop.level?.seed ?? 0 : run.nextSeed ?? randomSeed();
    run.nextSeed = null;
    const depth = this.mode === 'guest' ? coop.level?.depth ?? 1 : run.depth;
    resetAmbience(depth);
    // A guest builds the very dungeon the host sent (its map came before this scene); the host sends its own. A saved
    // game's dungeon is built from its map, its live pieces made from the saved world below.
    const sent = this.mode === 'guest' ? coop.level?.layout : loaded ? savedLayout(loaded) : undefined;
    // How hard the level is: by its depth, the heroes in the party and their level (game/Difficulty.ts).
    const players = this.mode === 'host' ? coop.guestSlots().length + 1 : 1;
    setDifficulty({ depth, players, partyLevel: loaded ? savedPartyLevel(loaded) : carriedPartyLevel() });
    const built = sent ? { ...buildSentDungeon(sent), layout: sent } : buildDungeon(seed, this.mode !== 'guest', run.theme);
    const { level, spawns } = built;
    this.level = level;
    this.saveSource = { level, layout: built.layout, seed, depth, theme: run.theme };
    this.ctx = { level, dt: 1, tick: 0, gameLayer: this.gameLayer, overLayer: this.overLayer, rebuildTerrain: () => this.rebuildTerrain() };
    this.mountTerrain();
    level.clearDirty();
    this.torchSources = spawns.torchPositions.map((p, i) => ({
      x: p.x, y: p.y, radius: TORCH_LIGHT_RADIUS, kind: 0, flicker: i * TORCH_FLICKER_STEP,
    }));

    if (this.mode === 'guest') {
      this.guest = new GuestGame(() => manager.goto('in_game'));
      coop.sendLoaded(seed);
    } else {
      const me = (loaded && this.restoreSave(loaded)) || freshHero(spawns.playerSpawn);
      // The name typed on the character select; the combat log calls the hero by it (co-op renames it below).
      const name = cleanName(settings.playerName) || text('combat_log.default_hero');
      if (me.playerName === undefined) world.addComponent(me, 'playerName', name);
      else me.playerName = name;
      if (this.mode === 'host') this.host = new HostGame(me, spawns.playerSpawn, seed, depth, encodeLevelMap(built.layout));
    }

    this.darkness.container.zIndex = FOG_Z;
    this.gameLayer.addChild(this.darkness.container);
    // Light overlay placed in uiLayer so it sits above game but below HUD
    this.lights.init();
    this.overLayer.sortableChildren = true;
    // The combat log lies under the HUD, so the HUD's tooltips and dialogs open over it.
    this.uiLayer.addChild(this.lights.overlay, this.overLayer, this.combatLog.container, this.hud.container, this.fallen.view, this.inv.container, this.shop.container, this.hud.front);

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
      // Whoever runs the game keeps it: the host (for the whole party) or a player alone.
      saveGame: this.mode === 'guest' ? undefined : () => this.saveGame(),
      mainMenu: () => manager.goto('title'),
      exitGame: () => this.exitGame(),
    }, this.mode === 'guest'
      ? text('menu.pause.warning_guest')
      : this.mode === 'host' ? text('menu.pause.warning_host') : text('menu.pause.warning_solo'));
    this.uiLayer.addChild(this.console.container, this.pause.container, this.result.container, this.loading, this.fadeIn);
    this.buildLoadingOverlay();
    setPointerAim(this.aim);
    initInput(manager.canvas);
    this.inv.attachSearch(manager.canvas);
    this.shop.attachSearch(manager.canvas);

    this.onKeyDown = (e) => this.handleKey(e);
    window.addEventListener('keydown', this.onKeyDown);
    this.onPointerDown = (e) => this.switchWatched(e);
    manager.canvas.addEventListener('mousedown', this.onPointerDown);
    manager.canvas.addEventListener('wheel', this.onWheel, { passive: false });
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
      if (!this.shop.handleEscape()) closeShop();
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
    resetInput();
  }

  /** Whether the pointer is the hand: over a menu, a sub-screen, a panel or a HUD control rather than the world. */
  private pointerOnUi(): boolean {
    return this.pause.open || this.result.open || this.manager.hasOverlay || !pointerFree();
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
  /** The save's heroes put back in the seats taking them up now (the host's own, and each guest's in co-op). */
  private restoreSave(save: SaveFile): Player | undefined {
    const guests = this.mode === 'host' ? coop.guestSlots().map((slot) => ({ slot, name: coop.nameOf(slot) ?? slot })) : [];
    return restoreSavedWorld(save, this.level, seatsFor(save, [{ slot: 'host', name: '' }, ...guests]));
  }

  /** Keeps the game as it stands in the browser (the load screen lists it, and downloads it as a file). */
  private saveGame(): void {
    const save = captureSave(this.saveSource);
    reportRejection(storeSave(save).then((stored) => {
      if (!this.pause.open) return;
      if (stored.ok) this.pause.show(text('menu.pause.saved', { name: stored.value.name }), SAVED_COLOR);
      else this.pause.show(report(stored.error, text('menu.pause.save_failed'), 'save').message);
    }), text('menu.pause.save_failed'), 'save');
  }

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
    for (const hero of q.players) if (!this.levelStart.has(seatOf(hero))) this.levelStart.set(seatOf(hero), tallyOf(hero.playerStats));
    if (this.mode !== 'solo') updateNameTags(this.gameLayer, player);
    this.noticeDeath(player);
    const view = this.viewOf(player);
    if (view) this.follow(view);
    this.updateFallen(player);
    this.revealAroundPlayers();
    // Zoomed in, the world (and its light) is drawn larger about the view's top left; the HUD stays as it is.
    this.gameLayer.scale.set(camera.zoom);
    this.gameLayer.x = -camera.x * camera.zoom;
    this.gameLayer.y = -camera.y * camera.zoom;
    this.lights.overlay.scale.set(camera.zoom);
    this.overLayer.scale.set(camera.zoom);
    this.overLayer.position.copyFrom(this.gameLayer.position);
    // Walls, columns and rocks clear over whoever stands behind them near the hero followed (where this frame draws them).
    if (this.terrain) updateSeeThrough(this.terrain.seeThrough, view?.position, this.gameLayer, this.level.width * TILE_WIDTH);

    this.darkness.update(this.app.renderer, this.level, this.tick);
    this.lights.update(this.app, this.gatherLights(), this.tick);
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
    const w = viewWidth();
    const h = viewHeight();
    camera.x = Math.max(0, Math.min(this.level.width * TILE_WIDTH - w, Math.round(pos.x - w / 2)));
    camera.y = Math.max(0, Math.min(this.level.height * TILE_HEIGHT - h, Math.round(pos.y - h / 2)));
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

  /** The party shares its map: the fog lifts around every player (twice as far round one with a diviner's Third Eye). */
  private revealAroundPlayers(): void {
    for (const p of q.players) {
      const tiles = p.arcana?.darkvision ? FOG_REVEAL_TILES * DARKVISION_FACTOR : FOG_REVEAL_TILES;
      this.level.reveal(Math.floor(p.position.x / TILE_WIDTH), Math.floor(p.position.y / TILE_HEIGHT), tiles);
    }
  }

  private pooledLight(i: number): LightSource {
    return this.lightPool[i] ?? (this.lightPool[i] = { x: 0, y: 0, radius: 0, kind: 0 });
  }

  /** Every light this frame: wall torches, each hero's torch, and glowing entities (spell bolts, candles, lanterns). */
  private gatherLights(): LightSource[] {
    const lights = this.frameLights;
    lights.length = 0;
    for (const torch of this.torchSources) lights.push(torch);
    let used = 0;
    for (const p of q.players) {
      const torch = this.pooledLight(used);
      torch.x = p.position.x;
      torch.y = p.position.y - HERO_TORCH_LIFT;
      torch.radius = HERO_TORCH_RADIUS;
      torch.kind = 0;
      torch.flicker = HERO_TORCH_PHASE + used * TORCH_FLICKER_STEP;
      lights.push(torch);
      used++;
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
    // While a panel is open a click is the interface's, never a blow or a cast.
    setPanelsOpen(isInventoryOpen() || isShopOpen() || this.hud.panelOpen || this.pause.open || this.result.open || this.manager.hasOverlay);
    this.loading.visible = this.mode === 'guest' && coop.loadingLevel;
    this.hud.update(this.level);
    this.combatLog.update();
    this.inv.setVisible(isInventoryOpen());
    this.inv.update();
    // The trade panel follows the trader this screen's hero is trading with.
    this.shop.setVisible(isShopOpen(), activeTrader());
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
   * The exit portal (systems/ExitSystem.ts): once used, the next level is made ready in the background; once the
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
      resetInput();
      return;
    }
    if (prompt === 'ended') this.runEnded();
    else this.askToLeave(prompt === 'wait');
    resetInput();
  }

  /**
   * The level's summary, a victory: what every hero did on it, in a table, and the way on to the next dungeon (once
   * chosen, a wait for the others in the room).
   */
  private askToLeave(chosen: boolean): void {
    holdMusic('rest');
    closeShop();
    this.result.show({
      title: text('game.level_complete.title'),
      titleColor: 0xffdd66,
      victory: true,
      lines: [text('game.level_complete.subtitle', { depth: this.mode === 'guest' ? coop.level?.depth ?? run.depth : run.depth })],
      table: { header: SUMMARY_COLUMNS.map((key) => text(key)), rows: this.summaryRows() },
      waiting: chosen ? text('game.level_complete.waiting') : undefined,
      buttons: [{ label: text('game.level_complete.next'), action: () => requestDeparture('next') }],
    });
  }

  /** A row per hero: their name, then what they did on this level (kills, experience, damage dealt, 20s and 1s rolled). */
  private summaryRows(): string[][] {
    const rows: string[][] = [];
    for (const hero of q.players) {
      const now = tallyOf(hero.playerStats);
      const start = this.levelStart.get(seatOf(hero)) ?? now;
      const name = hero.playerName || heroName(heroClass(hero.heroClass).id);
      rows.push([name, ...TALLY_KEYS.map((key) => String(now[key] - start[key]))]);
    }
    return rows;
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

  /** The console's /dungeon: this level, built again as another kind of dungeon, the heroes keeping what they have. */
  private rebuildAs(theme: LevelTheme): void {
    rebuildLevelAs(theme);
    this.manager.goto('in_game');
  }

  /** Picks the next level and generates its map in the background, once the summary has drawn. */
  private prepareNextLevel(): void {
    const seed = randomSeed();
    run.nextSeed = seed;
    run.theme = nextTheme();
    setTimeout(() => {
      const ready = attempt(() => prepareLevel(seed, run.theme));
      if (!ready.ok) report(ready.error, 'Could not prepare the next level', 'level');
    }, 0);
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
    resetInput();
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
    this.manager.canvas.removeEventListener('wheel', this.onWheel);
    // Leaving with the menu open: the game is this screen's no longer to hold.
    if (this.mode === 'host' && this.pause.open) setSeatPaused('host', false);
    if (this.console.visible) setInputCaptured(false);
    this.host?.dispose();
    this.guest?.dispose();
    setPointerAim(null, this.aim);
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
