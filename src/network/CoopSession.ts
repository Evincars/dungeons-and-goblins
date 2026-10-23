import { gunzipJson, gzipText } from '../core/compression';
import { DEFAULT_CLASS, isHeroClassId } from '../rules/Classes';
import type { HeroClassId } from '../rules/Classes';
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { PLAYER_SLOTS, isPlayerSlot } from '../world';
import type { PlayerSlot } from '../world';
import { isSfxName, sound } from '../audio/SoundPlayer';
import type { SfxName } from '../audio/SoundPlayer';
import { cleanName, settings } from '../game/Settings';
import { text } from '../core/texts';
import { NetworkError, StateError, ValidationError, attempt, errorMessage, reportRejection } from '../core/errors';
import { isRecord } from '../core/guards';
import { createLog } from '../core/log';
import {
  MAX_GUESTS, PROTOCOL_VERSION, inviteLink, isMessage, validCommand, validInput, validRoster, validSound, validStart,
} from './protocol';
import type { GuestCommand, InputFrame, Message, RosterEntry } from './protocol';
import { validateNetState } from './WorldSync';
import type { NetState } from './WorldSync';

const log = createLog('network');

/** Signalling must reach the PeerJS server within this long, and a new peer must greet within this long. */
const SIGNAL_TIMEOUT_MS = 30000;
const HANDSHAKE_TIMEOUT_MS = 15000;
/** Links ping each other every second and are dropped after this long silent. */
const HEARTBEAT_MS = 1000;
const SILENCE_MS = 10000;
/** A refused peer gets a moment to read why before the line closes. */
const REFUSAL_LINGER_MS = 500;
// Beyond this a lossy datagram is likely to lose a fragment, so bigger packets take the reliable channel.
const FAST_LIMIT = 32000;
const FAST_CHANNEL_ID = 100;
/** A channel with more than this queued is backed up: world updates are skipped for newer ones. */
const BACKLOG_LIMIT = 262144;
const INPUT_BACKLOG_LIMIT = 65536;
/** Packet sizes beyond which a peer is not playing this game. */
const MAX_COMPRESSED = 2000000;
const MAX_DECOMPRESSED = 16000000;
const MAX_REASON = 80;

type Intents = InputFrame['input']['intents'];
/** Folds a source's one-shot button presses into the target so none is lost. */
function mergeIntents(target: Intents, source: Intents): void {
  target.use ||= source.use;
  target.attack ||= source.attack;
  target.cast ||= source.cast;
  target.inventoryOpen ||= source.inventoryOpen;
  target.swap ||= source.swap;
}
const hasIntent = (i: Intents) => i.use || i.cast || i.inventoryOpen || i.swap;

function validPacket(value: unknown): value is ArrayBuffer | Uint8Array {
  if (!(value instanceof ArrayBuffer) && !(value instanceof Uint8Array)) return false;
  if (value.byteLength > MAX_COMPRESSED) throw new ValidationError('World packet exceeds compressed size limit', { bytes: value.byteLength });
  return true;
}

/** One peer on the other end of the line: the host for a guest, each guest for the host. */
class Link {
  name = '';
  /** The hero class this guest picked (checked by the host; the default for anything else). */
  heroClass: HeroClassId = DEFAULT_CLASS;
  ready = false;
  fast: RTCDataChannel | null = null;
  sequence = -1;
  input: InputFrame | null = null;
  lastInputAt = 0;
  lastMessageAt = performance.now();
  timeout?: ReturnType<typeof setTimeout>;
  receiving: Promise<void> = Promise.resolve();
  constructor(readonly connection: DataConnection, public slot: PlayerSlot | null) {}
}

/** The slot of a host-side link; every link the host keeps has one. */
function slotOf(link: Link): PlayerSlot {
  if (!link.slot) throw new StateError('Guest link has no slot');
  return link.slot;
}

/**
 * A co-op room over PeerJS (WebRTC), host-authoritative as in Catacomb Snatch Redux: the host runs the
 * game, guests stream their controls to it and draw the world it sends back. Everyone names themselves
 * in the room; the host starts the level whenever it likes, and the guests build the same dungeon from
 * the seed it sends.
 */
export class CoopSession {
  role: 'host' | 'guest' | null = null;
  status = '';
  invite = '';
  /** Host: at least one guest has joined. Guest: the host accepted this player. */
  connected = false;
  /** Which player this browser controls; the host is always 'host'. */
  slot: PlayerSlot | null = null;
  /** Everyone in the room, host first; kept current on every browser. */
  roster: RosterEntry[] = [];
  /** Set once a level is under way, so nobody else can join half-way. */
  locked = false;
  /** The level being played: the seed its dungeon is built from, and how deep it is. */
  level: { seed: number; depth: number } | null = null;
  latest: { state: NetState; paused: boolean } | null = null;
  onChange: (() => void) | null = null;
  onStart: (() => void) | null = null;
  onState: (() => void) | null = null;
  onComplete: (() => void) | null = null;
  /** Host only: a guest's connection ended. */
  onLeave: ((slot: PlayerSlot, name: string) => void) | null = null;
  /** Host only: a guest asked for something (a purchase, a change of equipment). */
  onCommand: ((slot: PlayerSlot, command: GuestCommand) => void) | null = null;
  private peer: Peer | null = null;
  private links = new Map<PlayerSlot, Link>();
  private uplink: Link | null = null;
  private timeout?: ReturnType<typeof setTimeout>;
  private sending = false;
  private stateSeqOut = 0;
  private stateSeqIn = -1;
  private decoding = false;
  private pendingState: { seq: number; bytes: Uint8Array } | null = null;
  private heartbeat?: ReturnType<typeof setInterval>;

  constructor() {
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', () => this.close());
  }

  get hostName(): string { return cleanName(settings.playerName) || text('coop.default_host_name'); }

  /** Guests that have finished joining, in slot order. */
  guestSlots(): PlayerSlot[] {
    return PLAYER_SLOTS.filter((slot) => this.links.get(slot)?.ready);
  }

  /** The hero class a seat's player picked: the host's own from its settings, a guest's from its greeting. */
  classOf(slot: PlayerSlot): HeroClassId {
    if (slot === 'host') return settings.heroClass;
    return this.links.get(slot)?.heroClass ?? DEFAULT_CLASS;
  }

  nameOf(slot: PlayerSlot): string | undefined {
    return this.roster.find((p) => p.slot === slot)?.name;
  }

  /** The latest controls of a guest, as the host knows them. */
  inputOf(slot: PlayerSlot): { frame: InputFrame | null; at: number } {
    const link = this.links.get(slot);
    return { frame: link?.input ?? null, at: link?.lastInputAt ?? 0 };
  }

  clearInputs(): void {
    for (const link of this.links.values()) link.input = null;
  }

  async open(role: 'host' | 'guest', destination?: string): Promise<void> {
    this.close();
    this.role = role;
    this.slot = role === 'host' ? 'host' : null;
    this.setStatus(text('coop.status.connecting'));
    const peer = new Peer();
    this.peer = peer;
    peer.on('error', (error) => this.fail(error.message));
    peer.on('disconnected', () => this.fail(text('coop.status.signaling_lost')));
    peer.on('connection', (connection) => this.incoming(connection));
    this.timeout = setTimeout(() => this.fail(text('coop.status.timed_out')), SIGNAL_TIMEOUT_MS);
    peer.on('open', (id) => this.signalled(peer, id, destination));
  }

  /** The PeerJS server gave this browser its id: the host publishes its invite, a guest dials the host. */
  private signalled(peer: Peer, id: string, destination: string | undefined): void {
    if (this.peer !== peer) return;
    if (this.role === 'guest') {
      if (!destination) return this.fail(text('coop.status.enter_destination'));
      this.attach(new Link(peer.connect(destination, { reliable: true, serialization: 'binary' }), null));
      return;
    }
    clearTimeout(this.timeout);
    this.invite = inviteLink(id, location.href);
    this.refreshRoster();
    this.setStatus(this.waitingText());
  }

  /** A guest dialled the host: it gets a free seat, or is told why not. */
  private incoming(connection: DataConnection): void {
    if (this.role !== 'host') return connection.close();
    const refusal = this.refusal();
    const slot = PLAYER_SLOTS.find((s) => s !== 'host' && !this.links.has(s));
    if (!refusal && slot) {
      this.attach(new Link(connection, slot));
      return;
    }
    connection.on('open', () => {
      connection.send({ type: 'refused', reason: refusal ?? text('coop.status.room_full') } satisfies Message);
      setTimeout(() => connection.close(), REFUSAL_LINGER_MS);
    });
  }

  /** Why the host cannot take another guest right now, if it cannot. */
  private refusal(): string | null {
    if (this.locked) return text('coop.status.already_started');
    if (this.links.size >= MAX_GUESTS) return text('coop.status.room_full');
    return null;
  }

  private waitingText(): string {
    const guests = this.guestSlots().length;
    return guests === 0 ? text('coop.status.invite_ready')
      : text('coop.status.players_in_room', { count: guests + 1, max: MAX_GUESTS + 1 });
  }

  private attach(link: Link): void {
    const connection = link.connection;
    // The signalling timeout is over once there is a line to the other side.
    clearTimeout(this.timeout);
    if (this.role === 'guest') this.uplink = link;
    else this.links.set(slotOf(link), link);
    this.resetStream();
    link.timeout = setTimeout(() => this.dropLink(link, text('coop.status.handshake_timed_out')), HANDSHAKE_TIMEOUT_MS);
    connection.on('open', () => {
      this.openFastChannel(link);
      // The host waits to be greeted; a guest introduces itself.
      if (this.role === 'guest') this.send(link, { type: 'hello', version: PROTOCOL_VERSION, name: cleanName(settings.playerName), heroClass: settings.heroClass });
    });
    connection.on('data', (value) => {
      link.receiving = link.receiving.then(() => this.receive(link, value)).catch((error: unknown) => {
        this.dropLink(link, errorMessage(error));
      });
    });
    connection.on('close', () => {
      if (!this.owns(link)) return;
      this.dropLink(link, this.role === 'guest'
        ? text('coop.status.host_disconnected') : text('coop.status.player_disconnected', { name: link.name || text('coop.status.unknown_player') }));
    });
    connection.on('error', (error) => this.dropLink(link, error.message));
  }

  private async receive(link: Link, value: unknown): Promise<void> {
    if (!this.owns(link)) return;
    if (!isMessage(value)) throw new NetworkError('Invalid co-op message');
    link.lastMessageAt = performance.now();
    if (this.role === 'host') this.handleAtHost(link, value);
    else await this.handleAtGuest(link, value);
  }

  private owns(link: Link): boolean {
    if (this.role === 'guest') return this.uplink === link;
    return link.slot !== null && this.links.get(link.slot) === link;
  }

  private handleAtHost(link: Link, message: Message): void {
    if (message.type === 'hello') return this.greet(link, message);
    if (!link.ready) throw new NetworkError('Unexpected co-op message');
    switch (message.type) {
      case 'ping': return;
      case 'name': return this.rename(link, message.name);
      case 'input': return this.acceptInput(link, message.frame);
      case 'command':
        if (!validCommand(message.command)) throw new NetworkError('Invalid guest command');
        this.onCommand?.(slotOf(link), message.command);
        return;
      default: throw new NetworkError('Unexpected co-op message');
    }
  }

  private async handleAtGuest(link: Link, message: Message): Promise<void> {
    if (message.type === 'welcome') return this.welcomed(link, message.slot);
    if (message.type === 'refused') {
      throw new NetworkError(typeof message.reason === 'string' ? message.reason.slice(0, MAX_REASON) : 'The host refused the connection.');
    }
    if (!link.ready) throw new NetworkError('Unexpected co-op message');
    switch (message.type) {
      case 'ping': return;
      case 'roster': return this.takeRoster(message.players);
      case 'start': return this.started(message.seed, message.depth);
      case 'complete': this.onComplete?.(); return;
      case 'sound':
        if (!validSound(message.name, message.x, message.y, isSfxName)) throw new NetworkError('Invalid sound event');
        sound.playSound(message.name, message.x, message.y);
        return;
      case 'state':
        if (!Number.isSafeInteger(message.seq) || !validPacket(message.compressed)) throw new NetworkError('Invalid world packet');
        this.queueState(link, message.seq, message.compressed instanceof ArrayBuffer
          ? new Uint8Array(message.compressed) : Uint8Array.from(message.compressed));
        return;
      default: throw new NetworkError('Unexpected co-op message');
    }
  }

  private greet(link: Link, message: Extract<Message, { type: 'hello' }>): void {
    if (link.ready) throw new NetworkError('Unexpected co-op message');
    if (message.version !== PROTOCOL_VERSION) throw new NetworkError('Multiplayer version mismatch. Reload both browsers.');
    const slot = slotOf(link);
    link.name = this.uniqueName(cleanName(message.name), slot);
    link.heroClass = isHeroClassId(message.heroClass) ? message.heroClass : DEFAULT_CLASS;
    link.ready = true;
    clearTimeout(link.timeout);
    this.connected = true;
    this.startHeartbeat();
    this.send(link, { type: 'welcome', slot });
    this.refreshRoster();
    this.broadcastRoster();
    this.setStatus(this.waitingText());
  }

  private welcomed(link: Link, slot: unknown): void {
    if (!isPlayerSlot(slot) || slot === 'host') throw new NetworkError('Invalid host greeting');
    link.slot = slot;
    link.ready = true;
    this.slot = slot;
    clearTimeout(link.timeout);
    this.connected = true;
    this.startHeartbeat();
    this.setStatus(text('coop.status.connected'));
  }

  private rename(link: Link, name: unknown): void {
    if (this.locked) return;
    link.name = this.uniqueName(cleanName(name), slotOf(link));
    this.refreshRoster();
    this.broadcastRoster();
    this.onChange?.();
  }

  private takeRoster(players: unknown): void {
    if (!validRoster(players)) throw new NetworkError('Invalid room roster');
    this.roster = players;
    this.setStatus(this.level ? this.status : `${this.roster.length} players in the room. Waiting for the host to start.`);
  }

  private started(seed: unknown, depth: unknown): void {
    if (!validStart(seed, depth)) throw new NetworkError('Invalid level start');
    this.level = { seed: Number(seed), depth: Number(depth) };
    this.latest = null;
    this.stateSeqIn = -1;
    this.onStart?.();
  }

  /** Names must be unique in the room so nobody is mistaken for somebody else. */
  private uniqueName(wanted: string, slot: PlayerSlot): string {
    const base = wanted || text('coop.default_player_name', { number: PLAYER_SLOTS.indexOf(slot) + 1 });
    const others = [...this.links.values()].filter((l) => l.slot !== slot && l.ready).map((l) => l.name);
    const taken = new Set([this.hostName, ...others].map((n) => n.toLowerCase()));
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base.slice(0, 10)} ${n}`;
    return name;
  }

  private refreshRoster(): void {
    if (this.role !== 'host') return;
    const guests = this.guestSlots().map((slot) => ({ slot, name: this.links.get(slot)?.name ?? slot }));
    this.roster = [{ slot: 'host', name: this.hostName }, ...guests];
  }

  private broadcastRoster(): void {
    this.broadcast({ type: 'roster', players: this.roster });
  }

  /** This player's name changed: the host tells the room, a guest asks the host (who may make it unique). */
  setName(name: string): void {
    const clean = cleanName(name);
    if (this.role === 'guest' && this.uplink?.ready) {
      this.send(this.uplink, { type: 'name', name: clean });
      return;
    }
    if (this.role !== 'host' || this.locked) return;
    this.refreshRoster();
    this.broadcastRoster();
    this.onChange?.();
  }

  /** Host: a level begins. The room closes to newcomers and every guest builds the same dungeon. */
  startLevel(seed: number, depth: number): void {
    if (this.role !== 'host') return;
    this.locked = true;
    this.level = { seed, depth };
    this.broadcast({ type: 'start', seed, depth });
  }

  private startHeartbeat(): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => this.beat(), HEARTBEAT_MS);
  }

  private beat(): void {
    for (const link of this.activeLinks()) {
      if (performance.now() - link.lastMessageAt <= SILENCE_MS) this.send(link, { type: 'ping' });
      else this.dropLink(link, this.role === 'guest' ? text('coop.status.host_silent') : text('coop.status.player_silent', { name: link.name }));
    }
  }

  private activeLinks(): Link[] {
    if (this.role === 'guest') return this.uplink ? [this.uplink] : [];
    return [...this.links.values()].filter((l) => l.ready);
  }

  /** A second, unordered, no-retransmit channel so a lost packet never stalls newer game data. */
  private openFastChannel(link: Link): void {
    const opened = attempt(() => link.connection.peerConnection.createDataChannel('fast', {
      negotiated: true, id: FAST_CHANNEL_ID, ordered: false, maxRetransmits: 0,
    }), 'network');
    if (!opened.ok) {
      log.warn('Unreliable channel unavailable, using the reliable one', { error: opened.error.message });
      link.fast = null;
      return;
    }
    const fast = opened.value;
    fast.binaryType = 'arraybuffer';
    fast.onmessage = (event) => this.receiveFast(link, event.data);
    link.fast = fast;
  }

  private closeFast(link: Link): void {
    if (link.fast) link.fast.onmessage = null;
    // Closing a channel the browser already closed throws; that is the state wanted anyway.
    const closed = attempt(() => link.fast?.close(), 'network');
    if (!closed.ok) log.debug('Fast channel was already closed');
    link.fast = null;
  }

  private fastReady(link: Link, limit = BACKLOG_LIMIT): RTCDataChannel | null {
    const fast = link.fast;
    return fast && fast.readyState === 'open' && fast.bufferedAmount < limit ? fast : null;
  }

  private receiveFast(link: Link, data: unknown): void {
    if (!this.owns(link) || !link.ready) return;
    link.lastMessageAt = performance.now();
    const handled = attempt(() => this.handleFast(link, data), 'network');
    if (!handled.ok) this.dropLink(link, handled.error.message);
  }

  /** Held keys from a guest (JSON), or a world update from the host (sequence number, then gzip). */
  private handleFast(link: Link, data: unknown): void {
    if (typeof data === 'string' && this.role === 'host') {
      const message: unknown = JSON.parse(data);
      if (isRecord(message) && message.type === 'input') this.acceptInput(link, message.frame);
      return;
    }
    if (data instanceof ArrayBuffer && this.role === 'guest' && data.byteLength > 4) {
      this.queueState(link, new DataView(data).getUint32(0), new Uint8Array(data, 4));
    }
  }

  private acceptInput(link: Link, frame: unknown): void {
    if (!validInput(frame)) throw new NetworkError('Invalid remote controls');
    if (frame.sequence <= link.sequence) {
      // A late or reordered frame must not roll the controls back, but its button presses still count.
      if (link.input) mergeIntents(link.input.input.intents, frame.input.intents);
      return;
    }
    link.sequence = frame.sequence;
    if (link.input) mergeIntents(frame.input.intents, link.input.input.intents);
    link.input = frame;
    link.lastInputAt = performance.now();
  }

  /** Only the newest undecoded world update matters; older ones are dropped. */
  private queueState(link: Link, seq: number, bytes: Uint8Array): void {
    if (seq <= this.stateSeqIn) return;
    if (this.pendingState && this.pendingState.seq > seq) return;
    this.pendingState = { seq, bytes };
    if (!this.decoding) reportRejection(this.drainStates(link), 'Decoding world updates failed', 'network');
  }

  private async drainStates(link: Link): Promise<void> {
    this.decoding = true;
    try {
      while (this.pendingState && this.uplink === link) await this.decodeNext(link, this.pendingState);
    } catch (error) {
      this.dropLink(link, errorMessage(error));
    } finally {
      this.decoding = false;
    }
  }

  /** Unpacks one queued world update and, if it is still the newest, makes it the latest. */
  private async decodeNext(link: Link, { seq, bytes }: { seq: number; bytes: Uint8Array }): Promise<void> {
    this.pendingState = null;
    if (seq <= this.stateSeqIn) return;
    const decoded = await gunzipJson(bytes, MAX_DECOMPRESSED, 'World packet');
    if (this.uplink !== link || seq <= this.stateSeqIn) return;
    validateNetState(decoded);
    if (!this.slot || !decoded.entities.some((e) => e.data.playerSlot === this.slot)) return;
    this.stateSeqIn = seq;
    this.latest = { state: decoded, paused: decoded.paused };
    this.onState?.();
  }

  canSendState(): boolean {
    return this.role === 'host' && this.connected && !this.sending && this.guestSlots().length > 0;
  }

  sendState(state: NetState): void {
    if (!this.canSendState()) return;
    this.sending = true;
    const seq = this.stateSeqOut++;
    const json = JSON.stringify(state);
    const sent = gzipText(json).then((compressed) => {
      const packet = new Uint8Array(compressed.byteLength + 4);
      new DataView(packet.buffer).setUint32(0, seq);
      packet.set(compressed, 4);
      for (const link of this.activeLinks()) this.sendStatePacket(link, seq, compressed, packet);
    }).catch((error: unknown) => this.fail(errorMessage(error)))
      .finally(() => { this.sending = false; });
    reportRejection(sent, 'Sending a world update failed', 'network');
  }

  /**
   * A world update goes on the fast channel when it fits in one datagram; otherwise on the reliable one,
   * unless that is already backed up, in which case this update is skipped for a newer one.
   */
  private sendStatePacket(link: Link, seq: number, compressed: Uint8Array, packet: Uint8Array<ArrayBuffer>): void {
    if (!link.connection.open) return;
    const fits = packet.byteLength <= Math.min(FAST_LIMIT, link.connection.peerConnection.sctp?.maxMessageSize ?? FAST_LIMIT);
    const fast = fits ? this.fastReady(link) : null;
    const sent = attempt(() => {
      if (fast) fast.send(packet);
      else if (link.connection.dataChannel.bufferedAmount <= BACKLOG_LIMIT) link.connection.send({ type: 'state', seq, compressed } satisfies Message);
    }, 'network');
    if (!sent.ok) this.dropLink(link, sent.error.message);
  }

  sendInput(frame: InputFrame): void {
    const link = this.uplink;
    if (!link?.ready) return;
    // One-shot presses must not be lost, so they take the reliable channel; held keys ride the fast one.
    const fast = hasIntent(frame.input.intents) ? null : this.fastReady(link, INPUT_BACKLOG_LIMIT);
    if (!fast) {
      this.send(link, { type: 'input', frame });
      return;
    }
    const sent = attempt(() => fast.send(JSON.stringify({ type: 'input', frame } satisfies Message)), 'network');
    if (!sent.ok) this.dropLink(link, sent.error.message);
  }

  /** Guest: asks the host to do something for this player's character. */
  sendCommand(command: GuestCommand): void {
    if (this.role === 'guest' && this.uplink?.ready) this.send(this.uplink, { type: 'command', command });
  }

  sendSound(name: SfxName, x?: number, y?: number): void {
    this.broadcast({ type: 'sound', name, ...(x === undefined ? {} : { x }), ...(y === undefined ? {} : { y }) });
  }

  sendComplete(): void { this.broadcast({ type: 'complete' }); }

  private broadcast(message: Message): void {
    if (this.role !== 'host') return;
    for (const link of this.activeLinks()) this.send(link, message);
  }

  private send(link: Link, message: Message): void {
    if (!link.connection.open) return;
    const sent = attempt(() => link.connection.send(message), 'network');
    if (!sent.ok) this.dropLink(link, sent.error.message);
  }

  private setStatus(text: string): void {
    this.status = text;
    this.onChange?.();
  }

  private hangUp(link: Link): void {
    clearTimeout(link.timeout);
    this.closeFast(link);
    link.connection.removeAllListeners();
    link.connection.close();
  }

  private stopHeartbeat(): void {
    clearInterval(this.heartbeat);
    this.heartbeat = undefined;
  }

  /** Ends one line. A guest losing the host loses the game; the host only loses that guest. */
  private dropLink(link: Link, text: string): void {
    if (!this.owns(link)) return;
    log.warn('Link dropped', { reason: text, slot: link.slot });
    this.hangUp(link);
    if (this.role === 'guest') {
      this.uplink = null;
      this.connected = false;
      clearTimeout(this.timeout);
      this.stopHeartbeat();
      this.setStatus(text);
      return;
    }
    const slot = slotOf(link);
    this.links.delete(slot);
    link.input = null;
    this.connected = this.guestSlots().length > 0;
    this.refreshRoster();
    this.broadcastRoster();
    this.setStatus(link.ready ? `${link.name} left. ${this.waitingText()}` : text);
    if (link.ready) this.onLeave?.(slot, link.name);
  }

  /** A failure that affects the whole session (signalling, encoding): every line goes down. */
  private fail(text: string): void {
    log.error('Session failed', new NetworkError(text));
    this.connected = false;
    clearTimeout(this.timeout);
    this.stopHeartbeat();
    for (const link of this.allLinks()) this.hangUp(link);
    this.links.clear();
    this.uplink = null;
    this.setStatus(text);
  }

  private allLinks(): Link[] {
    return [...this.links.values(), ...(this.uplink ? [this.uplink] : [])];
  }

  close(): void {
    clearTimeout(this.timeout);
    this.stopHeartbeat();
    this.onChange = null; this.onStart = null; this.onState = null; this.onComplete = null;
    this.onLeave = null; this.onCommand = null;
    for (const link of this.allLinks()) this.hangUp(link);
    this.links.clear();
    this.uplink = null;
    this.peer?.removeAllListeners();
    this.peer?.destroy();
    this.peer = null; this.role = null; this.slot = null;
    this.connected = false; this.invite = ''; this.latest = null; this.level = null;
    this.locked = false; this.roster = [];
    this.resetStream();
  }

  private resetStream(): void {
    this.stateSeqOut = 0;
    this.stateSeqIn = -1;
    this.pendingState = null;
  }
}

export const coop = new CoopSession();
