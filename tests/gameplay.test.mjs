import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { createServer } from 'vite';

// Some modules register browser listeners when they load.
globalThis.window ??= { addEventListener() {}, removeEventListener() {} };
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
after(() => server.close());
const load = (path) => server.ssrLoadModule(`/src/${path}.ts`);

const { world, isMobType } = await load('world');
const { Level } = await load('level/Level');
const { createTile, TileType, TILE_WIDTH } = await load('level/TileType');
const { tileGraphOf } = await load('level/TileGraph');
const { findRoute, reachableTiles } = await load('level/TileSearch');
const { DungeonBuilder } = await load('level/generators/DungeonBuilder');
const { DEFAULT_CONFIG } = await load('level/generators/DungeonConfig');
const { createPlayer } = await load('entities/PlayerFactory');
const { createMob } = await load('entities/MobFactory');
const { nearby, beginPerception, Sense } = await load('ai/perception/spatial');
const { canSee, spotPlayer } = await load('ai/perception/sight');
const { mobStepCosts, mobRoute } = await load('ai/perception/navigation');
const { formSquads, squadOf } = await load('ai/decision/squads');
const { assignRoles } = await load('ai/decision/tactics');
const { agentOf } = await load('ai/decision/states');
const { flank, strike } = await load('ai/execution/pursuit');
const C = await load('ai/constants');
const { updateAI } = await load('systems/AISystem');
const { updateMovement } = await load('systems/MovementSystem');
const { updateTrails } = await load('systems/TrailSystem');
const { updateContactDamage } = await load('systems/CombatSystem');
const { updateSword } = await load('systems/SwordSystem');
const { attempt, ensure, ValidationError } = await load('core/errors/index');
const { invitePeer, inviteLink, validInput, validCommand, validRoster, validStart } = await load('network/protocol');
const { captureWorld, validateNetState, WorldReplica } = await load('network/WorldSync');
const { sameItems, handleGuestCommand, playerInSlot } = await load('game/PlayerActions');
const { buildDungeon } = await load('level/DungeonGenerator');
const { createShopNpc, createTorch, SHOP_ITEMS } = await load('entities/DungeonFactory');
const { cleanName } = await load('game/Settings');
const { localPlayer, noIntents } = await load('world');
const { descend, restorePlayer, startRun } = await load('game/Run');

const centre = (t) => t * TILE_WIDTH + TILE_WIDTH / 2;
const tileOf = (level, e) => ({ x: Math.floor(e.position.x / TILE_WIDTH), y: Math.floor(e.position.y / TILE_WIDTH) });

/** An open floor level with a wall border. */
function arena(w, h) {
  const level = new Level(w, h);
  for (let x = 0; x < w; x++) {
    level.setTile(x, 0, createTile(TileType.Wall));
    level.setTile(x, h - 1, createTile(TileType.Wall));
  }
  for (let y = 0; y < h; y++) {
    level.setTile(0, y, createTile(TileType.Wall));
    level.setTile(w - 1, y, createTile(TileType.Wall));
  }
  return level;
}

function wallRect(level, x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) level.setTile(x, y, createTile(TileType.Wall));
}

/** Facing enum for a unit heading: north, east, south, west. */
const facingOf = ({ x, y }) => (Math.abs(x) > Math.abs(y) ? (x > 0 ? 1 : 3) : (y > 0 ? 2 : 0));

function mobAt(level, type, tx, ty, heading = { x: 1, y: 0 }) {
  const mob = createMob(level, type, centre(tx), centre(ty));
  mob.limp = 0;
  mob.aimVector = { ...heading };
  mob.facing = facingOf(heading);
  return mob;
}

function playerAt(tx, ty) {
  return createPlayer(centre(tx), centre(ty));
}

/** Puts a mob straight into a fight with the player, as if it had just seen them. */
function engage(mob, player, tick) {
  mob.ai.targetId = world.id(player);
  mob.ai.lastSeenX = player.position.x;
  mob.ai.lastSeenY = player.position.y;
  mob.ai.lastSeenTick = tick;
  agentOf(mob).go('engage');
}

/** One simulation tick of the systems the AI depends on, in the game's order. */
function tickWorld(level, tick) {
  beginPerception();
  updateAI(level, tick);
  updateMovement(level);
  beginPerception();
  updateTrails(level, tick);
}

beforeEach(() => {
  world.clear();
  beginPerception();
});

// ── Library-backed infrastructure ────────────────────────────────────────────

test('Yuka A* routes around a wall instead of through it', () => {
  const level = arena(10, 8);
  wallRect(level, 5, 1, 5, 5);
  const graph = tileGraphOf(level);
  const step = (_f, to) => (level.getTile(to % level.width, Math.floor(to / level.width)).passable ? 1 : Infinity);
  const route = findRoute(graph, 2 + 3 * 10, 8 + 3 * 10, step);
  assert.ok(route.length > 6, 'goes the long way round');
  assert.ok(route.every((t) => level.getTile(t % 10, Math.floor(t / 10)).passable), 'never steps on a wall');
  assert.ok(route.some((t) => Math.floor(t / 10) === 6), 'passes below the wall');
});

test('dungeon generation is deterministic per seed and every room is reachable (Yuka BFS)', () => {
  const a = new DungeonBuilder({ ...DEFAULT_CONFIG, seed: 42 }).build();
  const b = new DungeonBuilder({ ...DEFAULT_CONFIG, seed: 42 }).build();
  assert.deepEqual(a.rooms, b.rooms);
  assert.deepEqual(a.props, b.props);
  const L = a.level;
  const floorStep = (_f, to) => (L.getTile(to % L.width, Math.floor(to / L.width)).type === TileType.Floor ? 1 : Infinity);
  const spawn = L.tileIndexAt(a.playerSpawn.x, a.playerSpawn.y);
  const reached = reachableTiles(tileGraphOf(L), spawn, floorStep);
  assert.equal(reached[L.tileIndexAt(a.exitButtonPos.x, a.exitButtonPos.y)], 1, 'exit reachable');
});

test('collision boxes come from a pool and walls with floor above let feet sink in', () => {
  const level = arena(6, 6);
  level.setTile(3, 3, createTile(TileType.Wall));
  const first = level.getClipBBs(centre(3), centre(2), 10, 10);
  const box = first.find((r) => r.x === 3 * TILE_WIDTH && r.width === TILE_WIDTH && r.y > 3 * TILE_WIDTH);
  assert.ok(box, 'the wall below has a sunk box');
  const second = level.getClipBBs(centre(3), centre(2), 10, 10);
  assert.equal(first, second, 'the same array is reused');
});

test('the rbush index answers by kind and radius, and sees moves after beginPerception', () => {
  const level = arena(10, 10);
  const player = playerAt(2, 2);
  const mob = mobAt(level, 'goblin', 3, 2);
  assert.deepEqual(nearby(centre(2), centre(2), 40, Sense.mob), [mob]);
  assert.deepEqual(nearby(centre(2), centre(2), 40, Sense.player), [player]);
  mob.position.x = centre(8);
  assert.equal(nearby(centre(2), centre(2), 40, Sense.mob).length, 0, 'live position is checked');
  beginPerception();
  assert.equal(nearby(centre(8), centre(2), 40, Sense.mob).length, 1, 'rebuilt where it is now');
});

// ── Senses ───────────────────────────────────────────────────────────────────

test('enemies see players in the open as far as the fog lifts, in any direction, never through walls', () => {
  const level = arena(20, 8);
  const mob = mobAt(level, 'goblin', 4, 3, { x: 1, y: 0 });
  const player = playerAt(8, 3);
  assert.equal(canSee(level, mob, player), true, 'in range');
  mob.aimVector = { x: -1, y: 0 };
  assert.equal(canSee(level, mob, player), true, 'facing away makes no difference');
  player.position.x = centre(10);
  assert.equal(canSee(level, mob, player), false, 'beyond the fog radius');
  player.position.x = centre(8);
  wallRect(level, 6, 1, 6, 6);
  assert.equal(canSee(level, mob, player), false, 'a wall blocks sight');
});

test('players inside a safe room are never spotted, and enemies never path into one', () => {
  const level = arena(12, 6);
  for (let x = 1; x <= 4; x++) for (let y = 1; y <= 4; y++) level.markSafeZone(x, y);
  const mob = mobAt(level, 'goblin', 8, 2, { x: -1, y: 0 });
  playerAt(4, 2);
  assert.equal(spotPlayer(level, mob), null);
  assert.equal(mobStepCosts(level)[level.tileIndex(3, 2)], Infinity);
  assert.deepEqual(mobRoute(level, level.tileIndex(8, 2), level.tileIndex(3, 2)), []);
});

// ── State machine ────────────────────────────────────────────────────────────

test('spotting a player alerts the enemy and its idle allies, then they engage', () => {
  const level = arena(20, 8);
  const scout = mobAt(level, 'goblin', 4, 3, { x: 1, y: 0 });
  const buddy = mobAt(level, 'orc', 3, 5, { x: -1, y: 0 });
  const far = mobAt(level, 'goblin', 18, 6, { x: 1, y: 0 });
  const player = playerAt(8, 3);
  for (const m of [scout, buddy, far]) m.ai.senseIn = 1;
  tickWorld(level, 1);
  assert.equal(scout.ai.state, 'alert');
  assert.equal(scout.ai.targetId, world.id(player));
  assert.equal(buddy.ai.state, 'alert', 'the shout brings the ally nearby');
  assert.equal(buddy.ai.allyId, world.id(scout));
  assert.equal(far.ai.state, 'idle', 'out of earshot');
  for (let t = 2; t <= C.ALERT_TICKS + 2; t++) tickWorld(level, t);
  assert.equal(scout.ai.state, 'engage');
  assert.equal(buddy.ai.state, 'engage');
});

// ── Squad tactics ────────────────────────────────────────────────────────────

test('the nearest enemy leads the attack, goblins go round to flank, and the rest pile in', () => {
  const level = arena(24, 14);
  const player = playerAt(12, 7);
  const lead = mobAt(level, 'orc', 9, 7);
  const sneak1 = mobAt(level, 'goblin', 5, 4);
  const sneak2 = mobAt(level, 'goblin', 5, 10);
  const extra = mobAt(level, 'goblin', 3, 7);
  for (const m of [lead, sneak1, sneak2, extra]) engage(m, player, 0);
  beginPerception();
  assignRoles(formSquads(), 0);
  const squad = squadOf(world.id(player));
  assert.equal(squad.leadId, world.id(lead));
  assert.equal(lead.ai.role, 'direct');
  assert.equal(sneak1.ai.role, 'flank');
  assert.equal(sneak2.ai.role, 'flank');
  assert.equal(squad.flankers, C.MAX_FLANKERS);
  assert.equal(extra.ai.role, 'direct', 'no more flank slots: it joins the frontal attack');
});

test('an enemy hurries to support an ally that is hurt in the fight', () => {
  const level = arena(24, 14);
  const player = playerAt(12, 7);
  const fighter = mobAt(level, 'orc', 11, 7);
  fighter.health.current = Math.floor(fighter.health.max * 0.3);
  const helper = mobAt(level, 'skeleton', 4, 7);
  for (const m of [fighter, helper]) engage(m, player, 0);
  beginPerception();
  assignRoles(formSquads(), 0);
  assert.equal(fighter.ai.role, 'direct');
  assert.equal(helper.ai.role, 'support');
  assert.equal(helper.ai.allyId, world.id(fighter));
});

test('squads never grow past MAX_SQUAD; the farthest drop out and calm down', () => {
  const level = arena(30, 14);
  const player = playerAt(15, 7);
  const mobs = [];
  for (let i = 0; i < C.MAX_SQUAD + 2; i++) mobs.push(mobAt(level, 'goblin', 2 + i, 2));
  for (const m of mobs) engage(m, player, 0);
  tickWorld(level, 1);
  const engaged = mobs.filter((m) => m.ai.state === 'engage');
  assert.equal(engaged.length, C.MAX_SQUAD);
  const dropped = mobs.filter((m) => m.ai.state === 'idle');
  assert.ok(dropped.every((m) => m.ai.calmTicks > 0));
});

test('a flanker goes round the other side of the block from the lead attacker', () => {
  const level = arena(26, 14);
  wallRect(level, 9, 4, 15, 9);
  const player = playerAt(18, 6);
  const lead = mobAt(level, 'orc', 7, 6);
  const flanker = mobAt(level, 'goblin', 4, 7);
  for (const m of [lead, flanker]) engage(m, player, 0);
  beginPerception();
  const squad = formSquads().get(world.id(player));
  assignRoles(formSquads(), 0);
  assert.equal(flanker.ai.role, 'flank');
  strike(level, lead, player, 0);
  flank(level, flanker, squad, player, 0);
  const side = (route) => {
    const rows = route.map((t) => Math.floor(t / level.width)).filter((y, i) => {
      const x = route[i] % level.width;
      return x >= 9 && x <= 15;
    });
    if (rows.every((y) => y < 4)) return 'top';
    if (rows.every((y) => y > 9)) return 'bottom';
    return 'mixed';
  };
  const leadSide = side(lead.ai.route);
  const flankSide = side(flanker.ai.route);
  assert.notEqual(leadSide, 'mixed');
  assert.notEqual(flankSide, 'mixed');
  assert.notEqual(flankSide, leadSide, 'the flanker takes the other way round');
});

// ── Pursuit ──────────────────────────────────────────────────────────────────

test('an enemy that loses sight of the player follows their trail and finds them again', () => {
  const level = arena(22, 14);
  // A wall with a gap at the bottom: the player slips round it, out of sight.
  wallRect(level, 9, 1, 10, 9);
  const mob = mobAt(level, 'goblin', 3, 5, { x: 1, y: 0 });
  const player = playerAt(7, 5);
  mob.ai.senseIn = 1;
  const path = [];
  for (let y = 5; y <= 11; y++) path.push([7, y]);
  for (let x = 8; x <= 15; x++) path.push([x, 11]);
  for (let y = 10; y >= 4; y--) path.push([15, y]);
  let tick = 0;
  let searched = false;
  let trailAdvanced = false;
  for (const [x, y] of path) {
    for (let i = 0; i < 12; i++) {
      player.position.x = centre(x);
      player.position.y = centre(y);
      tickWorld(level, ++tick);
    }
  }
  for (let i = 0; i < 1500 && !(mob.ai.state === 'engage' && searched); i++) {
    tickWorld(level, ++tick);
    if (mob.ai.state === 'search') searched = true;
    if (mob.ai.state === 'search' && mob.ai.trailTick > mob.ai.lastSeenTick) trailAdvanced = true;
  }
  assert.ok(searched, 'it went searching once the player was out of sight');
  assert.ok(trailAdvanced, 'it walked along the trail crumbs');
  assert.equal(mob.ai.state, 'engage', 'it found the player again');
  assert.ok(tileOf(level, mob).x > 10, 'it came round the wall');
});

test('an enemy reaches a player whose feet sink into the wall edge, and hurts them', () => {
  const level = arena(20, 10);
  const player = playerAt(12, 5);
  player.position.y = 9 * TILE_WIDTH + 6;
  const mob = mobAt(level, 'orc', 6, 4);
  engage(mob, player, 0);
  const before = player.health.current;
  for (let tick = 1; tick <= 600; tick++) {
    tickWorld(level, tick);
    updateContactDamage(level);
  }
  assert.ok(player.health.current < before, 'it got close enough to strike');
});

test('kills, XP, gold and gear carry down to the next level, and a new run starts clean', () => {
  startRun();
  const player = playerAt(2, 2);
  player.playerStats.kills = 7;
  player.playerStats.exp = 40;
  player.playerStats.goldEarned = 90;
  player.playerStats.gold = 25;
  player.inventory.push({ id: 'potion' });
  descend();
  world.clear();
  const next = playerAt(2, 2);
  restorePlayer(next);
  assert.equal(next.playerStats.kills, 7);
  assert.equal(next.playerStats.exp, 40);
  assert.equal(next.playerStats.goldEarned, 90);
  assert.equal(next.playerStats.gold, 25);
  assert.equal(next.inventory.length, 1);
  startRun();
  const fresh = playerAt(2, 2);
  restorePlayer(fresh);
  assert.equal(fresh.playerStats.kills, 0);
});

test('chasing enemies never step into a pit', () => {
  const level = arena(16, 10);
  for (const [x, y] of [[7, 3], [8, 3], [7, 4], [8, 4], [7, 5], [8, 5]]) level.setTile(x, y, createTile(TileType.Hole));
  const mob = mobAt(level, 'goblin', 3, 4);
  const player = playerAt(12, 4);
  engage(mob, player, 0);
  for (let t = 1; t <= 600; t++) {
    tickWorld(level, t);
    mob.ai.lastSeenTick = t;
    assert.notEqual(level.getTileAt(mob.position.x, mob.position.y).type, TileType.Hole, `tick ${t}`);
  }
});

// ── Combat through the spatial index ─────────────────────────────────────────

test('touching an enemy hurts the player, except inside a safe room', () => {
  const level = arena(10, 6);
  const player = playerAt(4, 2);
  mobAt(level, 'orc', 4, 2);
  const before = player.health.current;
  updateContactDamage(level);
  assert.ok(player.health.current < before);
  player.hurtTime = 0;
  level.markSafeZone(4, 2);
  const safe = player.health.current;
  updateContactDamage(level);
  assert.equal(player.health.current, safe);
});

test('a sword swing hits enemies in its arc only', () => {
  const level = arena(10, 6);
  const player = playerAt(4, 2);
  player.aimVector = { x: 1, y: 0 };
  const front = mobAt(level, 'goblin', 5, 2);
  const behind = mobAt(level, 'goblin', 3, 2);
  player.playerInput.intents.attack = true;
  updateSword();
  updateSword();
  assert.ok(front.health.current < front.health.max);
  assert.equal(behind.health.current, behind.health.max);
});

// ── Typed errors ─────────────────────────────────────────────────────────────

test('typed errors and results', () => {
  const failed = attempt(() => ensure(false, 'bad', { field: 'x' }));
  assert.equal(failed.ok, false);
  assert.ok(failed.error instanceof ValidationError);
  assert.equal(failed.error.code, 'invalid-data');
  assert.deepEqual(failed.error.context, { field: 'x' });
  assert.equal(isMobType('orc'), true);
  assert.equal(isMobType('dragon'), false);
});

// ── Co-op ────────────────────────────────────────────────────────────────────

function inputFrame(sequence = 1) {
  return {
    sequence,
    aim: { x: 100, y: 50 },
    input: {
      up: true, down: false, left: false, right: false, attack: false, use: false, sprint: false,
      mouseX: 10, mouseY: 20, mouseAiming: true, keyAim: null, intents: noIntents(),
    },
  };
}

test('invite links and peer ids are parsed, and anything else is refused', () => {
  const link = inviteLink('abc-123', 'https://example.org/game/?x=1#top');
  assert.equal(link, 'https://example.org/game/?join=abc-123');
  assert.equal(invitePeer(link), 'abc-123');
  assert.equal(invitePeer('  peer_ID-9 '), 'peer_ID-9');
  assert.throws(() => invitePeer('not a peer!'), ValidationError);
  assert.throws(() => invitePeer('https://example.org/?nojoin=1'), ValidationError);
});

test('guest controls, commands, rosters and level starts are checked before they are believed', () => {
  assert.equal(validInput(inputFrame()), true);
  assert.equal(validInput({ ...inputFrame(), sequence: -1 }), false);
  const broken = inputFrame();
  broken.input.intents = { use: 'yes' };
  assert.equal(validInput(broken), false);
  assert.equal(validInput({ ...inputFrame(), aim: { x: Infinity, y: 0 } }), false);

  assert.equal(validCommand({ kind: 'buy', index: 2 }), true);
  assert.equal(validCommand({ kind: 'buy', index: 1.5 }), false);
  assert.equal(validCommand({ kind: 'loadout', inventory: [SHOP_ITEMS[0]], equipped: { helmet: SHOP_ITEMS[2] } }), true);
  assert.equal(validCommand({ kind: 'loadout', inventory: [{ type: 'dragon', name: 'x', value: 1 }], equipped: {} }), false);
  assert.equal(validCommand({ kind: 'loadout', inventory: [], equipped: { hat: SHOP_ITEMS[2] } }), false);

  assert.equal(validRoster([{ slot: 'host', name: 'Ana' }, { slot: 'p2', name: 'Bo' }]), true);
  assert.equal(validRoster([{ slot: 'host', name: 'Ana' }, { slot: 'host', name: 'Bo' }]), false, 'seats are unique');
  assert.equal(validRoster([{ slot: 'host', name: '<script>' }]), false, 'names arrive clean');
  assert.equal(validStart(123, 1), true);
  assert.equal(validStart(-1, 1), false);
  assert.equal(cleanName('  Sir   Lance<>lot!!  the brave '), 'Sir Lancelot', 'stripped, squeezed and cut to 12');
});

test('the world a host sends is validated and mirrored on a guest, with ids remapped', () => {
  const level = arena(12, 8);
  const host = playerAt(2, 2);
  world.addComponent(host, 'playerSlot', 'host');
  world.addComponent(host, 'playerName', 'Ana');
  const guest = playerAt(3, 2);
  world.addComponent(guest, 'playerSlot', 'p2');
  world.addComponent(guest, 'playerName', 'Bo');
  const mob = mobAt(level, 'goblin', 8, 2);
  mob.ai.targetId = world.id(guest);
  createTorch(centre(5), centre(1));
  createShopNpc(centre(4), centre(4));

  const wire = JSON.parse(JSON.stringify(captureWorld(false, 7)));
  validateNetState(wire);
  assert.ok(wire.entities.every((e) => !e.data.localOnly && !e.data.trail), 'decor and host bookkeeping stay home');

  world.clear();
  const replica = new WorldReplica();
  replica.localSlot = 'p2';
  replica.apply(wire);
  const players = world.entities.filter((e) => e.playerInput);
  assert.equal(players.length, 2);
  const mine = players.find((p) => p.playerSlot === 'p2');
  const theirs = players.find((p) => p.playerSlot === 'host');
  assert.equal(mine.remoteInput, undefined, 'this screen drives its own character');
  assert.equal(theirs.remoteInput, true);
  assert.equal(localPlayer(), mine);
  const mirroredMob = world.entities.find((e) => e.ai);
  assert.equal(world.entity(mirroredMob.ai.targetId), mine, 'the enemy hunts the local copy of the guest');
  assert.ok(!world.entities.some((e) => e.torch), 'the torch is not sent: the guest builds its own');

  // Presentation the guest drives itself survives later updates.
  mine.character.frame = 3;
  replica.apply(wire);
  assert.equal(mine.character.frame, 3);
});

test('tampered world updates are refused', () => {
  const level = arena(8, 6);
  const host = playerAt(2, 2);
  world.addComponent(host, 'playerSlot', 'host');
  mobAt(level, 'orc', 5, 2);
  const good = () => JSON.parse(JSON.stringify(captureWorld(false, 7)));
  const tamper = (edit) => { const w = good(); edit(w); return w; };
  assert.throws(() => validateNetState(tamper((w) => { w.entities[0].data.hack = 1; })), ValidationError);
  assert.throws(() => validateNetState(tamper((w) => { w.entities[0].data.position = { x: 'a', y: 0 }; })), ValidationError);
  assert.throws(() => validateNetState(tamper((w) => { w.entities.find((e) => e.data.ai).data.mobType = 'dragon'; })), ValidationError);
  assert.throws(() => validateNetState(tamper((w) => { w.entities.find((e) => e.data.playerSlot).data.playerName = '<evil>'; })), ValidationError);
  assert.throws(() => validateNetState(tamper((w) => { w.entities.find((e) => e.data.playerSlot).data.playerSlot = 'p2'; })), ValidationError, 'no host');
  assert.throws(() => validateNetState(tamper((w) => { w.entities[0].data.sprite = {}; })), ValidationError);
  assert.throws(() => validateNetState(tamper((w) => { delete w.seed; })), ValidationError, 'updates name their level');
  assert.equal(good().seed, 7);
});

test('the host carries out guest purchases near the shop, and only rearrangements of their own items', () => {
  const level = arena(12, 8);
  const host = playerAt(2, 2);
  world.addComponent(host, 'playerSlot', 'host');
  const guest = playerAt(6, 4);
  world.addComponent(guest, 'playerSlot', 'p2');
  world.addComponent(guest, 'remoteInput', true);
  createShopNpc(centre(9), centre(4));
  guest.playerStats.gold = 100;
  beginPerception();

  handleGuestCommand('p2', { kind: 'buy', index: 0 });
  assert.equal(guest.inventory.length, 0, 'too far from the shop');
  guest.position.x = centre(8);
  beginPerception();
  handleGuestCommand('p2', { kind: 'buy', index: 0 });
  assert.equal(guest.inventory.length, 1);
  assert.equal(guest.playerStats.gold, 100 - SHOP_ITEMS[0].value);

  const sword = guest.inventory[0];
  handleGuestCommand('p2', { kind: 'loadout', inventory: [sword, SHOP_ITEMS[1]], equipped: {} });
  assert.equal(guest.inventory.length, 1, 'cannot conjure a second sword');
  handleGuestCommand('p2', { kind: 'loadout', inventory: [], equipped: { helmet: sword } });
  assert.deepEqual(guest.equipped, {}, 'a sword is not a helmet');
  handleGuestCommand('p2', { kind: 'loadout', inventory: [], equipped: { weapon: sword } });
  assert.equal(guest.equipped.weapon.name, sword.name);
  assert.equal(guest.playerStats.swordTier, 1 + sword.stats.attack);
  assert.equal(playerInSlot('p2'), guest);
  assert.ok(sameItems({ inventory: [sword], equipped: {} }, { inventory: [], equipped: { weapon: sword } }));
});

test('every machine builds the same level from a seed; only the authority adds what changes in play', () => {
  const guestSide = buildDungeon(4242, false);
  const decor = world.entities.filter((e) => e.localOnly).length;
  assert.ok(decor > 0);
  assert.equal(world.entities.filter((e) => e.ai || e.door || e.shopNpc).length, 0, 'guests get those from the host');
  world.clear();
  const hostSide = buildDungeon(4242, true);
  assert.equal(world.entities.filter((e) => e.localOnly).length, decor);
  assert.ok(world.entities.some((e) => e.ai) && world.entities.some((e) => e.door));
  assert.deepEqual(hostSide.spawns, guestSide.spawns);
  for (let i = 0; i < hostSide.level.width * hostSide.level.height; i++) {
    const x = i % hostSide.level.width, y = Math.floor(i / hostSide.level.width);
    assert.equal(hostSide.level.getTile(x, y).type, guestSide.level.getTile(x, y).type);
  }
});
