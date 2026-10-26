import {
  world, isEquipSlot, isItemType, isLogResult, isMobType, isPlayerSlot, isRestNotice, isRollTone, isVoteKind, MOB_STATES, PLAYER_SLOTS,
  QUICK_SLOTS, TACTIC_ROLES,
} from '../world';
import type { Entity, PlayerSlot } from '../world';
import { cleanName } from '../game/Settings';
import { hasCharacter } from '../characters/Characters';
import { isDropTableId } from '../entities/Drops';
import { isCharacterState } from '../characters/CharacterDef';
import { destroyAttachments } from '../systems/BarSystem';
import { setVisualFrame } from '../render/AnimatedVisual';
import { ensure } from '../core/errors';
import { hasKey, isFiniteNumber, isRecord } from '../core/guards';
import { isFeatureId, MAX_FEATURES } from '../rules/ClassFeatures';
import { isBagSquare, isInventoryItem, validBinding } from './protocol';
import { isHeroClassId } from '../rules/Classes';
import { validBuild } from '../rules/Build';
import { isWeaponBase } from '../rules/WeaponTable';
import { MAX_ROLL_LINES } from '../systems/RollLogSystem';
import { MAX_LOG_ENTRIES, MAX_LOG_ITEM } from '../systems/CombatLogSystem';
import { isSpellId, SPELL_IDS } from '../rules/Spells';

/**
 * The live world as the co-op host sends it: every entity that is not rebuilt locally from the level
 * seed, without its display objects. Guests check it in full (the other browser is not trusted) and
 * mirror it with a WorldReplica.
 */

/** Display objects: rebuilt on each screen, never sent. */
const RUNTIME_KEYS = ['sprite', 'container', 'healthBar', 'hurtOverlay', 'sprintBar', 'fallMask', 'priceLabel'] as const satisfies readonly (keyof Entity)[];
/** Host bookkeeping a guest has no use for, or sets for itself. */
const HOST_KEYS = ['trail', 'remoteInput', 'aimWorld', 'removed', 'localOnly', 'initiative', 'lastHitBy', 'godMode'] as const satisfies readonly (keyof Entity)[];
type UnsentKey = (typeof RUNTIME_KEYS)[number] | (typeof HOST_KEYS)[number];
const UNSENT: ReadonlySet<string> = new Set([...RUNTIME_KEYS, ...HOST_KEYS]);
/** Keys an entity may never be built with, whatever a packet claims. */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);
/**
 * Presentation the guest drives itself once the entity exists (animation clocks, character clips):
 * taking the host's copy every update would make them stutter.
 */
const LOCAL_AFTER_CREATE: ReadonlySet<string> = new Set(['character', 'animation']);

const MAX_ENTITIES = 5000;
const MAX_DOOR_TILES = 16;
/** Longer than any line the roll log writes. */
const MAX_ROLL_TEXT = 40;

export type EntityState = Omit<Entity, UnsentKey>;
/** `seed` names the level the update belongs to, so a late update from the previous level is ignored. */
export type NetState = { version: 1; seed: number; paused: boolean; entities: Array<{ id: number; data: EntityState }> };

function sendable(entity: Entity): EntityState {
  const data: EntityState = {};
  for (const [key, value] of Object.entries(entity)) {
    if (!UNSENT.has(key)) Object.assign(data, { [key]: value });
  }
  // Routes are the host's planning; the guest only shows what enemies do.
  if (data.ai) data.ai = { ...data.ai, route: [] };
  return data;
}

/** The world for the guests: everything but what each browser builds from the seed. */
export function captureWorld(paused: boolean, seed: number): NetState {
  const entities: NetState['entities'] = [];
  for (const entity of world.entities) {
    const id = world.id(entity);
    if (entity.localOnly || entity.removed || id === undefined) continue;
    entities.push({ id, data: sendable(entity) });
  }
  return { version: 1, seed, paused, entities };
}

// ── Validation ────────────────────────────────────────────────────────────────

/** `object?`: an object, or null; `number?`: a number, or null. */
type FieldType = 'number' | 'string' | 'boolean' | 'object' | 'object?' | 'number?';
type Schema = Readonly<Record<string, FieldType>>;
const POINT: Schema = { x: 'number', y: 'number' };

/** Components that are objects, with the type of each field they must have. */
const SCHEMAS: Readonly<Record<string, Schema>> = {
  position: POINT, velocity: POINT, radius: POINT, aimVector: POINT, bump: POINT,
  health: { current: 'number', max: 'number' },
  dummy: { row: 'number' },
  visual: { sheet: 'string' },
  animation: { sheet: 'string', frameX: 'number', frameY: 'number', frameCount: 'number', frameTime: 'number', timer: 'number', loop: 'boolean' },
  character: { def: 'string', state: 'string', frame: 'number', timer: 'number', finished: 'boolean', flipX: 'boolean' },
  fx: { age: 'number', duration: 'number', frames: 'number' },
  playerInput: { up: 'boolean', down: 'boolean', left: 'boolean', right: 'boolean', attack: 'boolean', use: 'boolean',
    sprint: 'boolean', mouseX: 'number', mouseY: 'number', mouseAiming: 'boolean', spellSlot: 'number', intents: 'object' },
  casting: { ticks: 'number', dirX: 'number', dirY: 'number', released: 'boolean' },
  spellbook: { recovery: 'object' },
  build: { scores: 'object', locked: 'boolean', improvements: 'object' },
  projectile: { life: 'number', team: 'number', attack: 'object' },
  glow: { radius: 'number' },
  playerStats: { level: 'number', exp: 'number', gold: 'number', swordTier: 'number', hitDice: 'number', restDiceOpen: 'boolean',
    sprinting: 'boolean', sprint: 'number', maxSprint: 'number', sprintLocked: 'boolean', kills: 'number', goldEarned: 'number',
    lootBonus: 'number' },
  swordSwing: { delay: 'number', ticks: 'number', dirX: 'number', dirY: 'number', range: 'number', hitIds: 'object' },
  loot: { value: 'number', kind: 'number', velX: 'number', velY: 'number', suckRadius: 'number', glide: 'number', age: 'number', life: 'number' },
  item: { type: 'string', name: 'string', value: 'number' },
  chest: { opened: 'boolean', disappearTicks: 'number', drops: 'string' },
  spawner: { mobType: 'string', interval: 'number', timer: 'number', spawnCount: 'number', maxSpawns: 'number' },
  torch: { radius: 'number', color: 'number', flicker: 'number' },
  ai: { state: 'string', role: 'string', route: 'object', step: 'number', routeGoal: 'number', repathIn: 'number',
    senseIn: 'number', stateTicks: 'number', calmTicks: 'number', lastSeenX: 'number', lastSeenY: 'number',
    lastSeenTick: 'number', trailTick: 'number' },
  falling: { age: 'number', duration: 'number' },
  ephemeral: { age: 'number', life: 'number', drop: 'number' },
  room: { id: 'number', type: 'string', bounds: 'object' },
  exitButton: { activated: 'boolean' },
  shopNpc: { items: 'object' },
  door: { tiles: 'object', boundaryX: 'number', closed: 'boolean', locked: 'boolean', closingTicks: 'number?' },
  gate: { lift: 'number' },
  lever: { pulled: 'boolean', rest: 'number' },
  stash: { coins: 'number' },
  lootRoll: { id: 'number', item: 'object', ticks: 'number', choices: 'object' },
  inventory: {},
  featuresOff: {},
  equipped: {},
  rollLog: {},
  combatLog: { seq: 'number', entries: 'object' },
  party: { shortRestsLeft: 'number', vote: 'object?', notice: 'object?' },
};

/** Components that are plain values. */
const VALUES: Readonly<Record<string, FieldType>> = {
  blocking: 'boolean', physicsSlide: 'boolean', team: 'number', hurtTime: 'number', attackTime: 'number', freezeTime: 'number',
  bounceWallTime: 'number', deathPoints: 'number',
  facing: 'number', speed: 'number', friction: 'number', walkTime: 'number', limp: 'number',
  chasing: 'boolean', frame: 'number', yOffset: 'number', flashTime: 'number', healthBarOffset: 'number',
  mobType: 'string', castCooldown: 'number', swordCooldown: 'number', arrowCooldown: 'number', spawnedBy: 'number', stepTimer: 'number',
  dustTimer: 'number', respawnTicks: 'number', minimapColor: 'number', safeZone: 'boolean', playerSlot: 'string',
  playerName: 'string', heroClass: 'string', mobWeapon: 'string', protectCooldown: 'number',
};

function hasType(v: unknown, type: FieldType): boolean {
  if (type === 'number') return isFiniteNumber(v);
  if (type === 'object') return typeof v === 'object' && v !== null;
  if (type === 'object?') return typeof v === 'object';
  if (type === 'number?') return v === null || isFiniteNumber(v);
  return typeof v === type;
}

function checkComponent(key: string, value: unknown): void {
  const plain = VALUES[key];
  if (plain) {
    ensure(hasType(value, plain), `Invalid ${key} value`, { key });
    return;
  }
  const schema = SCHEMAS[key];
  ensure(schema !== undefined, `Unknown game component: ${key}`, { key });
  ensure(isRecord(value) || Array.isArray(value), `Invalid ${key} component`, { key });
  for (const [field, type] of Object.entries(schema)) {
    ensure(isRecord(value) && hasType(value[field], type), `Invalid ${key}.${field}`, { key, field });
  }
}

const isTile = (t: unknown) => isRecord(t) && Number.isInteger(t.x) && Number.isInteger(t.y);
/** A combat log entry: a player named as names may be, or a known enemy, and whole, sane numbers. */
const isLogEntry = (e: unknown) => isRecord(e) && Number.isInteger(e.seq) && Number.isInteger(e.total) && Number.isInteger(e.damage)
  && Number(e.damage) >= 0 && isLogResult(e.result) && (e.spell === undefined || isSpellId(e.spell))
  && (e.item === undefined || (typeof e.item === 'string' && e.item.length <= MAX_LOG_ITEM))
  && ((e.actor === 'mob' && typeof e.name === 'string' && isMobType(e.name)) || (e.actor === 'player' && typeof e.name === 'string' && cleanName(e.name) === e.name));
const isRollLine = (l: unknown) => isRecord(l) && typeof l.text === 'string' && l.text.length <= MAX_ROLL_TEXT && isRollTone(l.tone) && isFiniteNumber(l.age);
const isIntList = (v: unknown) => Array.isArray(v) && v.every(Number.isInteger);
/** Ticks until each of the hero's spells recovers (one a spell the game has, at most), none negative. */
const isRecoveryList = (v: unknown) => isIntList(v) && Array.isArray(v) && v.length <= SPELL_IDS.length && v.every((t) => Number(t) >= 0);
const isBoundList = (v: unknown) => Array.isArray(v) && v.length <= QUICK_SLOTS
  && v.every((b) => b === null || (isRecord(b) && validBinding(b.spell, b.level)));
const isSlotList = (v: unknown) => Array.isArray(v) && v.length <= PLAYER_SLOTS.length && v.every(isPlayerSlot);

/** A rare find being rolled for: a real item, and only known seats answering Need or Pass. */
function validLootRoll(roll: NonNullable<EntityState['lootRoll']>): boolean {
  const choices = Object.entries(roll.choices);
  return isInventoryItem(roll.item) && choices.length <= PLAYER_SLOTS.length
    && choices.every(([slot, choice]) => isPlayerSlot(slot) && (choice === 'need' || choice === 'pass'));
}

/** A vote under way and the notice on screen: known kinds, seats and notices, a name as names may be. */
function validParty(party: NonNullable<EntityState['party']>): boolean {
  const { vote, notice } = party;
  const voteOk = vote === null || (isRecord(vote) && isVoteKind(vote.kind) && isPlayerSlot(vote.by) && isSlotList(vote.agreed) && isFiniteNumber(vote.ticks));
  const noticeOk = notice === null || (isRecord(notice) && isRestNotice(notice.notice) && isVoteKind(notice.kind)
    && typeof notice.name === 'string' && cleanName(notice.name) === notice.name && isFiniteNumber(notice.age));
  return voteOk && noticeOk;
}

/** Rules beyond field types: known names and kinds, clean player names, well-formed lists. */
function checkDetails(data: EntityState): void {
  ensure(data.playerSlot === undefined || isPlayerSlot(data.playerSlot), 'Invalid player slot');
  ensure(data.playerName === undefined || cleanName(data.playerName) === data.playerName, 'Invalid player name');
  ensure(data.mobType === undefined || isMobType(data.mobType), 'Invalid mob type');
  ensure(data.mobWeapon === undefined || isWeaponBase(data.mobWeapon), 'Invalid enemy weapon');
  ensure(data.heroClass === undefined || isHeroClassId(data.heroClass), 'Invalid hero class');
  ensure(!data.combatLog || (Array.isArray(data.combatLog.entries) && data.combatLog.entries.length <= MAX_LOG_ENTRIES
    && data.combatLog.entries.every(isLogEntry)), 'Invalid combat log');
  ensure(!data.rollLog || (Array.isArray(data.rollLog) && data.rollLog.length <= MAX_ROLL_LINES && data.rollLog.every(isRollLine)), 'Invalid roll log');
  ensure(!data.chest || isDropTableId(data.chest.drops), 'Invalid chest');
  ensure(!data.spawner || isMobType(data.spawner.mobType), 'Invalid spawner');
  ensure(!data.character || (hasCharacter(data.character.def) && isCharacterState(data.character.state)), 'Invalid character');
  ensure(!data.ai || (MOB_STATES.includes(data.ai.state) && TACTIC_ROLES.includes(data.ai.role)), 'Invalid enemy state');
  ensure(!data.item || isItemType(data.item.type), 'Invalid item');
  ensure(!data.featuresOff || (Array.isArray(data.featuresOff) && data.featuresOff.length <= MAX_FEATURES && data.featuresOff.every(isFeatureId)), 'Invalid switched-off features');
  ensure(!data.inventory || (Array.isArray(data.inventory) && data.inventory.every(isBagSquare)), 'Invalid inventory');
  ensure(!data.item || isInventoryItem(data.item), 'Invalid item');
  ensure(!data.equipped || Object.entries(data.equipped).every(([slot, item]) => isEquipSlot(slot) && isInventoryItem(item)), 'Invalid equipment');
  ensure(!data.shopNpc || (Array.isArray(data.shopNpc.items) && data.shopNpc.items.every(isInventoryItem)), 'Invalid shop');
  ensure(!data.door || (Array.isArray(data.door.tiles) && data.door.tiles.length <= MAX_DOOR_TILES && data.door.tiles.every(isTile)), 'Invalid door');
  ensure(!data.swordSwing || isIntList(data.swordSwing.hitIds), 'Invalid sword swing');
  ensure(!data.build || validBuild(data.build), 'Invalid build');
  ensure(!data.spellbook || (isRecoveryList(data.spellbook.recovery) && (data.spellbook.bound === undefined || isBoundList(data.spellbook.bound))), 'Invalid spellbook');
  ensure(!data.casting?.spell || isSpellId(data.casting.spell), 'Invalid spell');
  ensure(!data.projectile?.spell || isSpellId(data.projectile.spell), 'Invalid spell');
  ensure(!data.party || validParty(data.party), 'Invalid party state');
  ensure(!data.lootRoll || validLootRoll(data.lootRoll), 'Invalid loot roll');
  const slot = data.playerInput?.spellSlot;
  ensure(slot === undefined || (Number.isInteger(slot) && slot >= 0 && slot < QUICK_SLOTS), 'Invalid quick-bar square');
  const intents = data.playerInput?.intents;
  ensure(!intents || ['use', 'attack', 'cast', 'inventoryOpen', 'swap'].every((k) => hasKey(intents, k) && typeof intents[k] === 'boolean'),
    'Invalid controls');
}

function checkEntry(entry: unknown, ids: Set<number>): void {
  ensure(isRecord(entry) && Number.isInteger(entry.id) && isRecord(entry.data), 'Invalid entity');
  const id = Number(entry.id);
  ensure(!ids.has(id), 'Duplicate entity', { id });
  ids.add(id);
  const data = entry.data;
  ensure(isRecord(data), 'Invalid entity');
  for (const [key, value] of Object.entries(data)) {
    ensure(!FORBIDDEN_KEYS.has(key) && !UNSENT.has(key), `Forbidden component: ${key}`, { key });
    checkComponent(key, value);
  }
}

/** Throws a ValidationError unless `value` is a complete, self-consistent world update. */
export function validateNetState(value: unknown): asserts value is NetState {
  ensure(isRecord(value) && value.version === 1 && typeof value.paused === 'boolean' && Number.isInteger(value.seed),
    'Unsupported world update');
  ensure(Array.isArray(value.entities) && value.entities.length <= MAX_ENTITIES, 'Malformed world update');
  const ids = new Set<number>();
  const slots = new Set<PlayerSlot>();
  for (const entry of value.entities) checkEntry(entry, ids);
  // A parse boundary: checkEntry has established every field of each entry that this cast claims.
  const entries = value.entities as NetState['entities'];
  for (const { data } of entries) {
    checkDetails(data);
    if (!data.playerSlot) continue;
    ensure(!slots.has(data.playerSlot) && !!data.playerInput && !!data.playerStats && !!data.health, 'Invalid player');
    slots.add(data.playerSlot);
  }
  ensure(slots.has('host'), 'World update has no host player');
}

// ── Replica ───────────────────────────────────────────────────────────────────

/** Pixels beyond which a host correction snaps instead of sliding. */
const MAX_GLIDE = 96;
/** Expected gap between updates, and the bounds it adapts within (ms). */
const DEFAULT_INTERVAL = 50;
const MIN_INTERVAL = 33;
const MAX_INTERVAL = 150;
const INTERVAL_SMOOTHING = 0.2;

type Glide = { fromX: number; fromY: number; toX: number; toY: number };

/** Mirrors the host's world on a guest, keeping display objects alive and remapping entity ids to local ones. */
export class WorldReplica {
  private entities = new Map<number, Entity>();
  /** The player this screen controls; every other character takes remote input. */
  localSlot: PlayerSlot | null = null;
  private glides = new Map<Entity, Glide>();
  private arrivedAt = 0;
  private interval = DEFAULT_INTERVAL;

  /** Moves entities smoothly from where they were drawn to where the last update put them. */
  glide(now: number): void {
    const t = Math.min(1, (now - this.arrivedAt) / this.interval);
    for (const [entity, g] of this.glides) {
      if (!entity.position || !world.has(entity)) {
        this.glides.delete(entity);
        continue;
      }
      entity.position.x = g.fromX + (g.toX - g.fromX) * t;
      entity.position.y = g.fromY + (g.toY - g.fromY) * t;
    }
  }

  apply(state: NetState, now = performance.now()): void {
    if (this.arrivedAt) {
      const gap = now - this.arrivedAt;
      this.interval = Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, this.interval * (1 - INTERVAL_SMOOTHING) + gap * INTERVAL_SMOOTHING));
    }
    this.arrivedAt = now;
    this.glides.clear();
    this.dropVanished(new Set(state.entities.map((e) => e.id)));
    for (const { id } of state.entities) this.ensureEntity(id);
    for (const { id, data } of state.entities) {
      const entity = this.entities.get(id);
      if (entity) this.update(entity, data);
    }
  }

  /** The local entity mirroring the host's `id`, made when it first appears. */
  private ensureEntity(id: number): void {
    const entity = this.entities.get(id);
    if (!entity || !world.has(entity)) this.entities.set(id, world.add({}));
  }

  /** Entities the host no longer has are removed here too, display objects and all. */
  private dropVanished(present: ReadonlySet<number>): void {
    for (const [id, entity] of this.entities) {
      if (present.has(id)) continue;
      this.entities.delete(id);
      if (!world.has(entity)) continue;
      destroyAttachments(entity);
      entity.sprite?.destroy({ children: true });
      world.remove(entity);
    }
  }

  /** The local ECS id of the entity the host calls `id`. */
  private local(id: number | undefined): number | undefined {
    const target = id === undefined ? undefined : this.entities.get(id);
    return target ? world.id(target) : undefined;
  }

  /** Host entity ids inside components are rewritten to the matching local ones. */
  private remap(next: EntityState): void {
    next.spawnedBy = this.local(next.spawnedBy);
    if (next.ai) next.ai = { ...next.ai, targetId: this.local(next.ai.targetId), allyId: this.local(next.ai.allyId) };
    if (next.swordSwing) next.swordSwing = { ...next.swordSwing, hitIds: [] };
  }

  /** Whether the guest keeps its own copy of a component once the entity exists. */
  private keepsLocal(entity: Entity, key: string): boolean {
    // A character's sheet follows its clip, which the guest picks itself.
    const owned = LOCAL_AFTER_CREATE.has(key) || (key === 'visual' && !!entity.character);
    return owned && hasKey(entity, key) && entity[key] !== undefined;
  }

  /** Brings the entity's components in line with the host's, adding and removing them through the world. */
  private syncComponents(entity: Entity, next: EntityState): void {
    for (const key of Object.keys(entity)) {
      if (hasKey(entity, key) && !UNSENT.has(key) && !(key in next)) world.removeComponent(entity, key);
    }
    for (const key of Object.keys(next)) {
      if (hasKey(next, key) && !this.keepsLocal(entity, key)) this.syncComponent(entity, key, next[key]);
    }
  }

  private syncComponent<K extends keyof EntityState>(entity: Entity, key: K, value: EntityState[K]): void {
    if (value === undefined) {
      if (key in entity) world.removeComponent(entity, key);
    } else if (entity[key] === undefined) {
      world.addComponent(entity, key, value);
    } else {
      Object.assign(entity, { [key]: value });
    }
  }

  /** Small moves slide over the next update; teleports (respawns, falls) and big corrections snap. */
  private glideFrom(entity: Entity, before: { x: number; y: number } | undefined): void {
    if (!before || !entity.position) return;
    const { x: toX, y: toY } = entity.position;
    const distance = Math.hypot(toX - before.x, toY - before.y);
    if (distance === 0 || distance >= MAX_GLIDE) return;
    this.glides.set(entity, { fromX: before.x, fromY: before.y, toX, toY });
    entity.position.x = before.x;
    entity.position.y = before.y;
  }

  private update(entity: Entity, data: EntityState): void {
    const next = structuredClone(data);
    const before = entity.position ? { x: entity.position.x, y: entity.position.y } : undefined;
    this.remap(next);
    this.syncComponents(entity, next);
    this.glideFrom(entity, before);
    if (entity.sprite && entity.visual && !entity.animation && !entity.character) {
      setVisualFrame(entity.sprite, entity.visual.sheet, entity.visual.col ?? 0, entity.visual.row ?? 0);
    }
    if (!entity.playerSlot) return;
    if (entity.playerSlot !== this.localSlot) world.addComponent(entity, 'remoteInput', true);
    else world.removeComponent(entity, 'remoteInput');
  }

  /** The local entity mirroring a host entity (for tests and debugging). */
  entityFor(id: number): Entity | undefined {
    return this.entities.get(id);
  }
}
