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
const { createChest } = await load('entities/DungeonFactory');
const { updateChests } = await load('systems/ChestSystem');
const { updateCharacterState } = await load('systems/CharacterStateSystem');
const { characterDef, facingRow } = await load('characters/Characters');
const { PROPS, HANGINGS, STORE_FURNITURE, CAVE_CENTREPIECES, CAVE_PLANTS, CAVE_CRYSTALS, CRYPT_CENTREPIECES, STORE_CENTREPIECES, HALL_CENTREPIECES } = await load('level/Props');
const { updateHoles } = await load('systems/HoleSystem');
const { moveItem, addToBag, carriedWeight } = await load('game/PlayerActions');
const { statTotals } = await load('entities/Items');
const { spawnDrops } = await load('entities/Drops');
const { createLoot, dropLoot, LOOT_KINDS } = await load('entities/LootFactory');
const { updateInventory } = await load('systems/InventorySystem');
const { updateLoot } = await load('systems/LootSystem');
const { updateArrows } = await load('systems/ArrowSystem');
const { updateDummies } = await load('systems/DummySystem');
const { createTrainingDummy } = await load('entities/DungeonFactory');
const { WEAPONS, SHIELDS, ARMORS, HAND_WEAPONS } = await load('entities/ItemCatalog');
const { EFFECT_SHAPES, EFFECT_COLOURS } = await load('assets/Effects');
const { giveStartingKit } = await load('game/Run');
const PlayerActions = await load('game/PlayerActions');
const { slotFor } = await load('entities/Items');
const { prepareLevel } = await load('level/DungeonGenerator');

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

test('enemies see players in the open within sight range, in any direction, past furniture but never through walls', () => {
  const level = arena(20, 8);
  const mob = mobAt(level, 'goblin', 4, 3, { x: 1, y: 0 });
  const player = playerAt(8, 3);
  assert.equal(canSee(level, mob, player), true, 'in range');
  mob.aimVector = { x: -1, y: 0 };
  assert.equal(canSee(level, mob, player), true, 'facing away makes no difference');
  player.position.x = mob.position.x + C.SIGHT_RANGE + TILE_WIDTH;
  assert.equal(canSee(level, mob, player), false, 'beyond sight range');
  player.position.x = centre(8);
  level.setTile(6, 3, createTile(TileType.Obstacle));
  assert.equal(canSee(level, mob, player), true, 'a crate does not hide the player');
  wallRect(level, 6, 1, 6, 6);
  assert.equal(canSee(level, mob, player), false, 'a wall blocks sight');
});

test('an enemy whose feet sink into the wall edge still sees a player right beside it', () => {
  const level = arena(10, 8);
  // The bottom border is wall with floor above it: feet may step into it, as in the screenshot.
  const mob = mobAt(level, 'goblin_rogue', 4, 6);
  mob.position.y = 7 * TILE_WIDTH + 6;
  const above = playerAt(4, 5);
  assert.equal(canSee(level, mob, above), true, 'player just above');
  above.position.x = centre(6);
  above.position.y = 7 * TILE_WIDTH + 6;
  assert.equal(canSee(level, mob, above), true, 'player beside it, both sunk into the wall');
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
  const level = arena(28, 14);
  // A wall with a gap at the bottom: the player slips round it, out of sight.
  wallRect(level, 9, 1, 10, 9);
  const mob = mobAt(level, 'goblin', 3, 5, { x: 1, y: 0 });
  // A slow chaser, left behind once the player is round the wall, so it has to track them.
  mob.speed /= C.CHASE_SPEED_FACTOR;
  const player = playerAt(7, 5);
  mob.ai.senseIn = 1;
  const path = [];
  for (let y = 5; y <= 11; y++) path.push([7, y]);
  for (let x = 8; x <= 21; x++) path.push([x, 11]);
  for (let y = 10; y >= 4; y--) path.push([21, y]);
  let tick = 0;
  let searched = false;
  let trailAdvanced = false;
  for (const [x, y] of path) {
    for (let i = 0; i < 12; i++) {
      player.position.x = centre(x);
      player.position.y = centre(y);
      tickWorld(level, ++tick);
      if (mob.ai.state === 'search') searched = true;
      if (mob.ai.state === 'search' && mob.ai.trailTick > mob.ai.lastSeenTick) trailAdvanced = true;
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

test('two enemies after a player hidden behind a block come at them both ways round', () => {
  const level = arena(22, 14);
  // A block with a way round above it and below it.
  wallRect(level, 9, 3, 12, 10);
  const player = playerAt(16, 6);
  // Both start above the block's middle, so the shortest way for each is over it; orcs take players head on,
  // so neither flanks: only the squad's split routes can send one round the other side.
  const a = mobAt(level, 'orc', 5, 5);
  const b = mobAt(level, 'orc', 4, 5);
  for (const m of [a, b]) {
    m.ai.targetId = world.id(player);
    engage(m, player, 0);
    m.ai.role = 'direct';
  }
  const sides = new Map([[a, new Set()], [b, new Set()]]);
  for (let tick = 1; tick <= 600; tick++) {
    tickWorld(level, tick);
    for (const [m, seen] of sides) {
      const ty = Math.floor(m.position.y / TILE_WIDTH);
      if (m.position.x > centre(9) && m.position.x < centre(12)) seen.add(ty < 3 ? 'over' : ty > 10 ? 'under' : 'through');
    }
  }
  const ways = [...sides.values()].map((seen) => [...seen].join('+'));
  assert.deepEqual(ways.sort(), ['over', 'under'], `one went over, the other under (${ways})`);
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

test('an enemy on the same tile as a player hugging a wall still closes in and strikes', () => {
  const level = arena(10, 6);
  const player = playerAt(4, 1);
  player.position.y = TILE_WIDTH + 4;
  const mob = mobAt(level, 'goblin', 4, 1);
  mob.position.x = player.position.x + 14;
  mob.position.y = player.position.y + 26;
  engage(mob, player, 0);
  const before = player.health.current;
  for (let tick = 1; tick <= 120; tick++) {
    tickWorld(level, tick);
    updateContactDamage(level);
  }
  assert.ok(player.health.current < before, 'it did not stand still short of the player');
});

test('an enemy does not dither at the wall edge when the player stands sunk into it', () => {
  const level = arena(10, 6);
  const player = playerAt(4, 4);
  player.position.y = 5 * TILE_WIDTH + 12;
  const mob = mobAt(level, 'goblin', 4, 3);
  engage(mob, player, 0);
  const before = player.health.current;
  for (let tick = 1; tick <= 240; tick++) {
    tickWorld(level, tick);
    updateContactDamage(level);
  }
  assert.ok(player.health.current < before, 'it pressed on into reach');
});

test('an enemy reaches and hurts a player standing at a pit edge, without falling in', () => {
  const level = arena(10, 8);
  for (let x = 1; x < 9; x++) level.setTile(x, 5, createTile(TileType.Hole));
  const player = playerAt(4, 4);
  player.position.y = 5 * TILE_WIDTH - 4;
  const mob = mobAt(level, 'goblin', 4, 2);
  engage(mob, player, 0);
  const before = player.health.current;
  for (let tick = 1; tick <= 240; tick++) {
    tickWorld(level, tick);
    updateContactDamage(level);
    assert.notEqual(level.getTileAt(mob.position.x, mob.position.y).type, TileType.Hole, `tick ${tick}`);
  }
  assert.ok(player.health.current < before, 'it stepped up to the edge and struck');
});

test('kills, XP, gold and gear carry down to the next level, and a new run starts clean', () => {
  startRun();
  const player = playerAt(2, 2);
  player.playerStats.kills = 7;
  player.playerStats.exp = 40;
  player.playerStats.goldEarned = 90;
  player.playerStats.gold = 25;
  player.inventory.push({ type: 'weapon', name: 'Short Sword', value: 50, gear: 'weapon' });
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
  const front = mobAt(level, 'goblin', 4.5, 2);
  const behind = mobAt(level, 'goblin', 3.5, 2);
  player.playerInput.intents.attack = true;
  updateSword();
  updateSword();
  assert.ok(front.health.current < front.health.max);
  assert.equal(behind.health.current, behind.health.max);
});

test('a chest opens only when a player within reach presses use (E), never by walking into it', () => {
  const player = playerAt(4, 2);
  const chest = createChest(centre(4) + 10, centre(2));
  const far = createChest(centre(8), centre(2));
  beginPerception();
  updateChests();
  assert.equal(chest.chest.opened, false, 'standing right against it does nothing');
  player.playerInput.intents.use = true;
  updateChests();
  assert.equal(chest.chest.opened, true);
  assert.equal(far.chest.opened, false, 'out of reach');
});

test('the new goblins are drawn from their side rows and swing once, standing or on the move', () => {
  const level = arena(10, 6);
  const rogue = mobAt(level, 'goblin_rogue', 4, 2);
  const oldGoblin = mobAt(level, 'goblin', 6, 2);
  assert.equal(rogue.character.def, 'goblin_rogue');
  assert.equal(oldGoblin.character.def, 'orc', 'the old goblin keeps its art');
  assert.equal(facingRow(characterDef('goblin_rogue'), true), 2, 'left row');
  assert.equal(facingRow(characterDef('goblin_rogue'), false), 3, 'right row');
  assert.equal(facingRow(characterDef('orc'), true), 0, 'single-row art is mirrored instead');

  world.addComponent(rogue, 'sprite', {});
  rogue.attackTime = 100;
  rogue.velocity = { x: 1, y: 0 };
  updateCharacterState();
  assert.equal(rogue.character.state, 'walkAttack');
  // The moving swing plays out; stopping must not start the same blow again standing.
  rogue.character.finished = true;
  rogue.character.spent = 'walkAttack';
  rogue.velocity = { x: 0, y: 0 };
  updateCharacterState();
  assert.notEqual(rogue.character.state, 'attack');
  rogue.attackTime = 0;
  updateCharacterState();
  assert.equal(rogue.character.spent, undefined, 'the next blow may swing again');
});

test('wall decor hangs only on north-wall faces, and storerooms are rare corners backed onto them', () => {
  let dungeonRooms = 0;
  const stores = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const { level, props, rooms } = new DungeonBuilder({ ...DEFAULT_CONFIG, seed }).build();
    dungeonRooms += rooms.filter((r) => r.type === 'dungeon').length;
    const roomAt = (p) => rooms.find((r) => p.tx >= r.x && p.tx < r.x + r.w && p.ty >= r.y && p.ty < r.y + r.h);
    for (const p of props) {
      const backed = level.getTile(p.tx, p.ty - 1)?.type === TileType.Wall;
      if (HANGINGS.includes(p.kind)) assert.ok(backed, `${p.kind} hangs on a wall face`);
      // The safe and exit rooms are dressed as gathering places, casks in every corner.
      if (!STORE_FURNITURE.includes(p.kind) || roomAt(p)?.type !== 'dungeon') continue;
      assert.ok(backed, `${p.kind} stands against a north wall`);
      assert.equal(PROPS[p.kind].solid, true);
      stores.add(`${seed}:${roomAt(p)?.id}`);
    }
  }
  assert.ok(stores.size > 0, 'some rooms keep a storeroom corner');
  assert.ok(stores.size < dungeonRooms * 0.35, `but most rooms do not (${stores.size} of ${dungeonRooms})`);
});

test('about one room in five is a cave hall: bigger, floored with cave ground and furnished as a cave', () => {
  let rooms = 0, halls = 0, bigHalls = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { level, rooms: all, props } = new DungeonBuilder({ ...DEFAULT_CONFIG, seed }).build();
    const dungeon = all.filter((r) => r.type === 'dungeon');
    rooms += dungeon.length;
    for (const hall of dungeon.filter((r) => r.hall)) {
      halls++;
      if (Math.max(hall.w, hall.h) > DEFAULT_CONFIG.maxRoomSize) bigHalls++;
      assert.ok(level.caveFloor.has(hall.x + hall.y * level.width), 'cave ground');
      const inside = props.filter((p) => p.tx >= hall.x && p.tx < hall.x + hall.w && p.ty >= hall.y && p.ty < hall.y + hall.h);
      assert.ok(inside.some((p) => CAVE_PLANTS.includes(p.kind) || CAVE_CRYSTALS.includes(p.kind)), 'cave decor');
    }
  }
  assert.ok(halls / rooms > 0.1 && halls / rooms < 0.35, `${halls} halls of ${rooms} rooms`);
  assert.ok(bigHalls > 0, 'halls outgrow ordinary rooms');
});

test('rooms get a centrepiece in the middle (or nearby) with open floor around it', () => {
  const CENTRES = [...CRYPT_CENTREPIECES, ...STORE_CENTREPIECES, ...HALL_CENTREPIECES, ...CAVE_CENTREPIECES];
  let rooms = 0, centred = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const { level, rooms: all, props } = new DungeonBuilder({ ...DEFAULT_CONFIG, seed }).build();
    for (const room of all.filter((r) => r.type === 'dungeon')) {
      rooms++;
      const cx = room.x + (room.w - 1) / 2, cy = room.y + (room.h - 1) / 2;
      const piece = props.find((p) => CENTRES.includes(p.kind) && Math.max(Math.abs(p.tx - cx), Math.abs(p.ty - cy)) <= 3.5);
      if (!piece) continue;
      centred++;
      const below = level.getTile(piece.tx, piece.ty + 1)?.type;
      assert.notEqual(below, TileType.Hole, 'never at the lip of a pit');
    }
  }
  assert.ok(centred > rooms * 0.3, `${centred} of ${rooms} rooms have something in the middle`);
});

test('the safe and exit rooms have campfires (two beside the exit) and banners on their walls', () => {
  const { campfires, rooms, props, exitButtonPos, level } = new DungeonBuilder({ ...DEFAULT_CONFIG, seed: 7 }).build();
  const exit = rooms.find((r) => r.type === 'exit');
  const safe = rooms.find((r) => r.type === 'safe');
  const inRoom = (r) => (c) => c.x >= r.x * 32 && c.x < (r.x + r.w) * 32;
  assert.equal(campfires.filter(inRoom(exit)).length, 2);
  assert.equal(campfires.filter(inRoom(safe)).length, 1, 'a fire in the safe room too');
  for (const c of campfires) assert.equal(level.getTileAt(c.x, c.y).type, TileType.Obstacle, 'a campfire blocks its tile');
  assert.equal(level.getTileAt(exitButtonPos.x, exitButtonPos.y).type, TileType.Floor, 'the exit stays clear');
  assert.ok(props.some((p) => p.ty === exit.y && HANGINGS.includes(p.kind)), 'banners');
});

test('falling into a pit pops a "!" over the player that follows them down', () => {
  const level = arena(8, 6);
  level.setTile(4, 2, createTile(TileType.Hole));
  const player = playerAt(4, 2);
  updateHoles(level);
  assert.ok(player.falling);
  const mark = world.entities.find((e) => e.visual?.sheet === 'exclamation_mark');
  assert.ok(mark, 'an exclamation mark');
  assert.equal(mark.fx.orderId, world.id(player));
  assert.equal(mark.fx.duration, player.falling.duration);
});

test('a level generated ahead of time is the same level the seed builds on the spot', () => {
  const fresh = buildDungeon(99, false);
  const props = world.entities.filter((e) => e.localOnly).length;
  world.clear();
  prepareLevel(99);
  const ready = buildDungeon(99, false);
  assert.equal(world.entities.filter((e) => e.localOnly).length, props);
  assert.deepEqual(ready.spawns, fresh.spawns);
});

test('dragging items: they stay on the square they are dropped on, gear is worn only where it fits, swaps and comes off', () => {
  const sword = SHOP_ITEMS.find((i) => i.name === 'Short Sword');
  const axe = SHOP_ITEMS.find((i) => i.name === 'Hand Axe');
  const helm = SHOP_ITEMS.find((i) => i.gear === 'head');
  const start = { inventory: [sword, helm, axe], equipped: {} };
  const corner = moveItem(start, { bag: 0 }, { bag: 41 });
  assert.equal(corner.inventory[41], sword, 'moved to the bottom corner, and it stays there');
  assert.equal(corner.inventory[0], null, 'leaving its square empty');
  assert.equal(moveItem(start, { bag: 1 }, { slot: 'legs' }), null, 'a helm is not worn on the legs');
  const armed = moveItem(start, { bag: 0 }, { slot: 'primary' });
  assert.equal(armed.equipped.primary, sword);
  assert.deepEqual(armed.inventory, [null, helm, axe]);
  const swapped = moveItem(armed, { bag: 2 }, { slot: 'primary' });
  assert.equal(swapped.equipped.primary, axe, 'the axe takes the sword hand');
  assert.equal(swapped.inventory[2], sword, 'and the sword takes the square the axe left');
  const offhand = moveItem(swapped, { slot: 'primary' }, { slot: 'secondary' });
  assert.equal(offhand.equipped.secondary, axe, 'weapons fit either hand');
  const off = moveItem(offhand, { slot: 'secondary' }, { bag: 5 });
  assert.deepEqual(off.equipped, {});
  assert.equal(off.inventory[5], axe, 'taken off onto the square it was dropped on');
  assert.equal(moveItem(off, { bag: 1 }, { slot: 'medal' }), null, 'only medals go in the medal slot');
  assert.equal(start.inventory.length, 3, 'the old arrangement is left alone');
  assert.deepEqual(statTotals({ primary: axe, head: helm }), { strength: 3, dexterity: 1, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 });
});

test('an opened chest throws out a weapon or armour and some coins; walking over the gear picks it up', () => {
  spawnDrops(centre(3), centre(3), 'chest');
  const coins = world.entities.filter((e) => e.loot);
  const gear = world.entities.filter((e) => e.item);
  assert.equal(gear.length, 1, 'one piece of gear');
  assert.ok(['weapon', 'offhand', 'armor'].includes(gear[0].item.gear));
  const total = coins.reduce((sum, e) => sum + e.loot.value, 0);
  assert.ok(total >= 10 && total <= 30, `coins worth ${total}`);
  const player = playerAt(3, 3);
  player.inventory = [];
  player.position.x = gear[0].position.x;
  player.position.y = gear[0].position.y;
  beginPerception();
  updateInventory();
  assert.equal(player.inventory.filter(Boolean).length, 1, 'it is in the bag now');
  assert.ok(gear[0].removed);
  const gem = createLoot(0, 0, 0, 0, 200, true);
  assert.equal(LOOT_KINDS[gem.loot.kind].sheet, 'pickup_gem_ruby_12', 'an exact 200 is a ruby');
});

test('a kill drops only a few coins (gems are rare), and nobody carries more than 100 kg', () => {
  let gems = 0;
  for (let i = 0; i < 200; i++) {
    world.clear();
    dropLoot(0, 0, 200);
    const drops = world.entities.filter((e) => e.loot);
    const coins = drops.filter((e) => LOOT_KINDS[e.loot.kind].sheet.includes('coin'));
    assert.ok(coins.length >= 1 && coins.length <= 3, `${coins.length} coins`);
    gems += drops.length - coins.length;
  }
  assert.ok(gems < 20, `${gems} gems in 200 kills`);
  world.clear();
  const player = playerAt(2, 2);
  player.inventory = [];
  assert.equal(addToBag(player, { type: 'armor', name: 'Anvil', value: 1, weight: 90 }), true);
  assert.equal(addToBag(player, { type: 'armor', name: 'Second anvil', value: 1, weight: 20 }), false, 'over 100 kg');
  assert.equal(carriedWeight(player), 90);
});

test('solid props block only the strip at their foot, so characters walk behind tall ones and up to urns', () => {
  const { level, props } = new DungeonBuilder({ ...DEFAULT_CONFIG, seed: 11 }).build();
  const solid = props.filter((p) => PROPS[p.kind].solid && !PROPS[p.kind].footprint);
  assert.ok(solid.length > 0);
  const covers = (x, y) => level.getClipBBs(x, y, 1, 1).some((b) => b.contains(x, y));
  for (const p of solid) {
    const x = p.tx * 32 + 16;
    assert.equal(covers(x, p.ty * 32 + 4), false, `${p.kind}: the top of its tile is open`);
    assert.equal(covers(x, p.ty * 32 + 26), true, `${p.kind}: its foot blocks`);
  }
});

test('coins flung at a wall stop at its edge instead of landing on top of it', () => {
  const level = arena(8, 8);
  for (let i = 0; i < 12; i++) createLoot(centre(4), centre(1), (Math.random() - 0.5) * 3, -3, 5);
  for (let t = 0; t < 60; t++) updateLoot(level);
  for (const coin of world.entities.filter((e) => e.loot)) {
    const { x, y } = coin.position;
    assert.ok(level.getTileAt(x, y).passable && level.getTileAt(x, y - 4).passable, `coin at ${Math.round(x)},${Math.round(y)}`);
  }
});

test('the item catalogues load every weapon, shield and armour, each with a name and stats to tune', () => {
  assert.equal(WEAPONS.length, 160);
  assert.equal(SHIELDS.length, 140);
  assert.equal(ARMORS.length, 220);
  for (const item of [...WEAPONS, ...SHIELDS, ...ARMORS]) {
    assert.ok(item.name && item.icon && item.gear && item.stats, item.id);
    assert.ok(validCommand({ kind: 'loadout', inventory: [item], equipped: {} }), `${item.id} passes the network checks`);
  }
  assert.ok(WEAPONS.every((w) => w.gear !== 'ammo' && w.kind !== 'arrows'), 'arrows are not items');
  assert.equal(Object.keys(EFFECT_SHAPES).length, 252, 'every effect sheet has a shape name');
  assert.equal(EFFECT_COLOURS.length, 9);
});

test('a new run starts with random weapons, a shield and armour in the bag', () => {
  const player = playerAt(2, 2);
  giveStartingKit(player);
  const bag = player.inventory;
  assert.equal(bag.filter((i) => HAND_WEAPONS.some((w) => w.id === i.id)).length, 4);
  assert.equal(bag.filter((i) => i.gear === 'armor').length, 4);
  assert.equal(bag.filter((i) => i.gear === 'offhand').length, 1);
  assert.equal(bag.filter((i) => i.gear === 'medal').length, 2, 'and two medals for the medal slot');
});

test('worn gear applies all its stats, and an item dropped on the gear panel finds its slot', () => {
  const player = playerAt(2, 2);
  const gear = { primary: { type: 'weapon', name: 'w', value: 1, gear: 'weapon', stats: { strength: 3, intelligence: 2 } },
    armor: { type: 'armor', name: 'a', value: 1, gear: 'armor', stats: { dexterity: 4, constitution: 2, wisdom: 3, charisma: 2 } } };
  const { applyLoadout } = PlayerActions;
  applyLoadout(player, { inventory: [], equipped: gear });
  const ps = player.playerStats;
  assert.equal(ps.swordTier, 4);
  assert.equal(ps.armorTier, 4);
  assert.equal(ps.maxSprint, 140);
  assert.equal(ps.spellBonus, 4);
  assert.ok(Math.abs(ps.lootBonus - 0.1) < 1e-9);
  assert.equal(slotFor({ primary: gear.primary }, HAND_WEAPONS[0]), 'secondary', 'a second weapon goes to the free hand');
});

test('enemies cannot walk onto the player: bodies collide, and touching still hurts', () => {
  const level = arena(12, 6);
  const player = playerAt(6, 3);
  const mob = mobAt(level, 'goblin', 4, 3);
  for (let t = 0; t < 60; t++) {
    mob.velocity.x = 2;
    beginPerception();
    updateMovement(level);
  }
  const gap = player.position.x - mob.position.x;
  assert.ok(gap >= player.radius.x + mob.radius.x - 0.5, `kept apart (${gap.toFixed(1)})`);
  const before = player.health.current;
  updateContactDamage(level);
  assert.ok(player.health.current < before, 'a touch still hurts');
});

test('with a bow in hand an attack looses an arrow at the crosshair (no swing), and arrows never run out', () => {
  const player = playerAt(3, 3);
  player.aimVector = { x: 1, y: 0 };
  player.equipped = { primary: { ...HAND_WEAPONS.find((w) => w.kind === 'bow') } };
  for (let shot = 0; shot < 3; shot++) {
    player.arrowCooldown = 0;
    player.playerInput.intents.attack = true;
    updateArrows();
    updateSword();
    assert.equal(player.swordSwing, undefined, 'no swing');
  }
  const arrows = world.entities.filter((e) => e.projectile?.arrow);
  assert.equal(arrows.length, 3, 'three arrows in flight');
  assert.ok(arrows.every((arrow) => arrow.velocity.x > 0), 'flying right');
  player.equipped = {};
  player.arrowCooldown = 0;
  player.playerInput.intents.attack = true;
  updateArrows();
  updateSword();
  assert.ok(player.swordSwing, 'without a bow the sword is back');
});

test('the training dummy takes sword hits but never falls', () => {
  const player = playerAt(4, 2);
  player.aimVector = { x: 1, y: 0 };
  const dummy = createTrainingDummy(centre(4.5), centre(2));
  beginPerception();
  player.playerInput.intents.attack = true;
  updateSword();
  updateSword();
  assert.ok(dummy.health.current < dummy.health.max, 'the blow lands');
  updateDummies();
  assert.equal(dummy.health.current, dummy.health.max, 'and it is whole again');
  assert.notEqual(dummy.dummy.row, 0, 'playing its hit');
});

test('the wizards spawn as enemies with their own art', () => {
  const level = arena(8, 6);
  const ghost = mobAt(level, 'ghost_wizard', 3, 3);
  const evil = mobAt(level, 'evil_wizard', 5, 3);
  assert.equal(ghost.character.def, 'ghost_wizard');
  assert.equal(evil.character.def, 'evil_wizard');
  assert.equal(isMobType('ghost_wizard'), true);
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
  const helm = SHOP_ITEMS.find((item) => item.gear === 'head');
  assert.equal(validCommand({ kind: 'loadout', inventory: [SHOP_ITEMS[0]], equipped: { head: helm } }), true);
  assert.equal(validCommand({ kind: 'loadout', inventory: [{ ...SHOP_ITEMS[0], stats: { attack: 9 } }], equipped: {} }), false, 'unknown stat');
  assert.equal(validCommand({ kind: 'loadout', inventory: [{ type: 'dragon', name: 'x', value: 1 }], equipped: {} }), false);
  assert.equal(validCommand({ kind: 'loadout', inventory: [], equipped: { hat: helm } }), false);

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
  handleGuestCommand('p2', { kind: 'loadout', inventory: [], equipped: { head: sword } });
  assert.deepEqual(guest.equipped, {}, 'a sword is not a helmet');
  handleGuestCommand('p2', { kind: 'loadout', inventory: [], equipped: { secondary: sword } });
  assert.equal(guest.equipped.secondary.name, sword.name, 'a sword fits either hand');
  handleGuestCommand('p2', { kind: 'loadout', inventory: [], equipped: { primary: sword } });
  assert.equal(guest.equipped.primary.name, sword.name);
  assert.equal(guest.playerStats.swordTier, 1 + sword.stats.strength, 'strength sharpens the sword');
  assert.equal(playerInSlot('p2'), guest);
  assert.ok(sameItems({ inventory: [sword], equipped: {} }, { inventory: [], equipped: { primary: sword } }));
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

test('the six stats are Strength to Charisma, each with a short name, a full name and a description in the texts file', async () => {
  const { STAT_NAMES } = await load('world');
  const { text } = await load('core/texts');
  assert.deepEqual([...STAT_NAMES], ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']);
  for (const stat of STAT_NAMES) {
    assert.equal(text(`stat.${stat}.short`).length, 3, `${stat} has a three-letter short name`);
    assert.ok(text(`stat.${stat}.name`).toLowerCase() === stat);
    assert.ok(text(`stat.${stat}.description`).length > 10);
  }
  assert.equal(text('inventory.gold', { amount: 7 }), 'Gold: 7', 'placeholders are filled in');
});
