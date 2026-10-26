import type { LevelMap } from '../level/LevelMap';
import { world, localPlayer, noIntents, releaseControls } from '../world';
import type { Entity, PlayerSlot } from '../world';
import type { Level } from '../level/Level';
import { createPlayer } from '../entities/PlayerFactory';
import { handleGuestCommand, playerInSlot } from '../game/PlayerActions';
import { restorePlayer } from '../game/Run';
import { sound } from '../audio/SoundPlayer';
import type { SfxName } from '../audio/SoundPlayer';
import { screenToWorld } from '../render/Camera';
import { beginPerception } from '../ai/perception/spatial';
import { updateInput } from '../systems/InputSystem';
import { updateTargeting } from '../systems/TargetSystem';
import { updateInventoryToggle } from '../systems/InventorySystem';
import { updateShop } from '../systems/ShopSystem';
import { mirrorSealedDoors } from '../systems/DoorSystem';
import { flushRemoved } from '../systems/DeathSystem';
import { coop } from './CoopSession';
import { captureWorld, WorldReplica } from './WorldSync';

/** Guests start beside the host, by join order, so nobody stands inside anyone else. */
const GUEST_OFFSETS = [[28, 0], [0, 28], [28, 28]] as const;
/** A guest's controls older than this are treated as let go. */
const STALE_INPUT_MS = 500;
/** The host sends the world every this many ticks: 20 updates a second. */
const SEND_EVERY_TICKS = 3;
const GUEST_MINIMAP_COLOR = 0x40c0ff;

/** Names a player's character for the others to see. */
function setName(entity: Entity, name: string): void {
  if (entity.playerName === undefined) world.addComponent(entity, 'playerName', name);
  else entity.playerName = name;
}

/**
 * The host's side of a co-op level: it runs the game for everyone. Each guest gets a character steered
 * by the controls its browser sends; the world goes back out twenty times a second.
 */
export class HostGame {
  private departed: PlayerSlot[] = [];
  private networkTick = 0;
  private readonly seed: number;
  private wasConnected = coop.connected;
  // The hooks this level installed; the next level's are put in before this one is torn down.
  private readonly onLeave = (slot: PlayerSlot) => { this.departed.push(slot); };
  private readonly onEffect = (name: SfxName, x?: number, y?: number) => coop.sendSound(name, x, y);

  /** `map`: the dungeon just built, sent to every guest so they build the very same one. */
  constructor(host: Entity, spawn: { x: number; y: number }, seed: number, depth: number, map: LevelMap) {
    setName(host, coop.nameOf('host') ?? coop.hostName);
    coop.guestSlots().forEach((slot, i) => this.addGuest(slot, spawn, i));
    coop.onLeave = this.onLeave;
    coop.onCommand = handleGuestCommand;
    sound.onEffect = this.onEffect;
    this.seed = seed;
    coop.startLevel(seed, depth, map);
  }

  private addGuest(slot: PlayerSlot, spawn: { x: number; y: number }, index: number): void {
    const [dx, dy] = GUEST_OFFSETS[index] ?? [0, 0];
    const guest = createPlayer(spawn.x + dx, spawn.y + dy, coop.classOf(slot));
    world.addComponent(guest, 'playerSlot', slot);
    restorePlayer(guest);
    world.addComponent(guest, 'remoteInput', true);
    world.addComponent(guest, 'aimWorld', { x: spawn.x + dx, y: spawn.y + dy + 1 });
    setName(guest, coop.nameOf(slot) ?? slot);
    guest.minimapColor = GUEST_MINIMAP_COLOR;
  }

  /** Before the simulation runs: guests who left take their character with them, the rest steer theirs. Returns true when every guest just dropped out. */
  beforeTick(paused: boolean): boolean {
    this.removeDeparted();
    const lost = this.wasConnected && !coop.connected;
    this.wasConnected = coop.connected;
    if (paused) coop.clearInputs();
    else this.applyGuestInput();
    return lost;
  }

  /** After the simulation: the world goes out to the guests, with whether the host has paused. */
  afterTick(paused: boolean): void {
    if (++this.networkTick % SEND_EVERY_TICKS !== 0 || !coop.connected) return;
    coop.sendState(captureWorld(paused, this.seed));
  }

  private applyGuestInput(): void {
    const now = performance.now();
    for (const slot of coop.guestSlots()) {
      const guest = playerInSlot(slot);
      if (!guest) continue;
      const { frame, at } = coop.inputOf(slot);
      // Controls that stopped arriving are let go of, rather than held down for ever.
      if (!frame || now - at > STALE_INPUT_MS) {
        releaseControls(guest.playerInput);
        continue;
      }
      guest.playerInput = structuredClone(frame.input);
      guest.aimWorld ??= { x: 0, y: 0 };
      guest.aimWorld.x = frame.aim.x;
      guest.aimWorld.y = frame.aim.y;
      // Button presses count once; the next stale tick must not repeat them.
      frame.input.intents = noIntents();
    }
  }

  private removeDeparted(): void {
    for (const slot of this.departed.splice(0)) {
      const leaver = playerInSlot(slot);
      if (leaver) world.addComponent(leaver, 'removed', true);
    }
    flushRemoved();
  }

  dispose(): void {
    if (coop.onLeave === this.onLeave) coop.onLeave = null;
    if (sound.onEffect === this.onEffect) sound.onEffect = null;
  }
}

/**
 * A guest's side of a co-op level: it builds the dungeon from the host's seed, draws the world the host
 * sends, and sends back what this player presses. Panels (shop, inventory) open here; what they change
 * is asked of the host.
 */
export class GuestGame {
  readonly replica = new WorldReplica();
  hostPaused = false;
  private readonly aim = { x: 0, y: 0 };

  private readonly onState = () => this.applyHostState();

  /** `onStart`: the host began the next level. */
  constructor(private readonly onStart: () => void) {
    this.replica.localSlot = coop.slot;
    coop.onState = this.onState;
    coop.onStart = onStart;
  }

  private applyHostState(): void {
    // An update still in flight from the previous level must not be drawn into this one.
    if (!coop.latest || coop.latest.state.seed !== coop.level?.seed) return;
    this.replica.apply(coop.latest.state);
    this.hostPaused = coop.latest.paused;
  }

  /** One tick of the guest's own work; `idle` (paused, disconnected) sends no keys at all. */
  tick(level: Level, idle: boolean): void {
    beginPerception();
    updateInput();
    if (!idle) {
      updateTargeting();
      updateInventoryToggle();
      updateShop();
    }
    this.sendInput(idle);
    this.replica.glide(performance.now());
    mirrorSealedDoors(level);
  }

  private sendInput(idle: boolean): void {
    const me = localPlayer();
    if (!me) return;
    const input = structuredClone(me.playerInput);
    if (idle || me.respawnTicks !== undefined) releaseControls(input);
    const aim = screenToWorld(input.mouseX, input.mouseY, this.aim);
    coop.sendInput(input, { x: aim.x, y: aim.y });
  }

  dispose(): void {
    if (coop.onState === this.onState) coop.onState = null;
    if (coop.onStart === this.onStart) coop.onStart = null;
  }
}
