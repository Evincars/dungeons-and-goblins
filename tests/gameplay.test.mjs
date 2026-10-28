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
const { resolveUses } = await load('systems/TargetSystem');
/** The inventory's Drop, for a hero with nothing to take it from: the item is put down at their feet. */
const setDown = (hero, item) => hero.inventory.push(structuredClone(item)) && PlayerActions.dropItem(hero, { bag: hero.inventory.length - 1 });
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
const { createLoot, killReward, LOOT_KINDS } = await load('entities/LootFactory');
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
const { updateDeath } = await load('systems/DeathSystem');
const { currentLog } = await load('systems/CombatLogSystem');

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

/** A hero standing on a tile: the second Fighter unless told (its swing lands at once, with no wind-up). */
function playerAt(tx, ty, heroClass = 'fighter2') {
  return createPlayer(centre(tx), centre(ty), heroClass);
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

const { useDieRoller } = await load('rules/Dice');
/** Loaded dice for the gameplay tests: every d20 a 19 (a hit against any AC here, not a critical), every other die its top face. */
const SURE_HIT = (sides) => (sides === 20 ? 19 : sides);

beforeEach(() => {
  world.clear();
  beginPerception();
  useDieRoller(SURE_HIT);
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
  resolveUses();
  updateChests();
  assert.equal(chest.chest.opened, true);
  assert.equal(far.chest.opened, false, 'out of reach');
});

test('one press of E uses one thing: what the brackets frame, not everything in reach', async () => {
  const { createStash } = await load('entities/DungeonFactory');
  const player = playerAt(4, 2);
  const near = createChest(centre(4) + 8, centre(2));
  const stash = createStash({ kind: 'barrel', tx: 4, ty: 2 });
  stash.position.x = centre(4) + 30;
  stash.stash.coins = 0;
  player.playerInput.intents.use = true;
  beginPerception();
  resolveUses();
  updateChests();
  assert.equal(near.chest.opened, true, 'the nearest is used');
  assert.ok(!stash.removed && !(player.rollLog ?? []).some((l) => l.text === 'Empty'), 'the barrel beside it is left alone');
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
  assert.equal(moveItem(start, { bag: 1 }, { slot: 'primary' }), null, 'a helm is not a weapon');
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

test('an opened chest pays its coins and hands its weapon or armour straight to the opener; a dropped item is taken back with E', () => {
  const player = playerAt(3, 3);
  player.inventory = [];
  const before = player.playerStats.gold;
  spawnDrops(centre(3), centre(3), 'chest', player);
  assert.equal(world.entities.filter((e) => e.loot).length, 0, 'no coins on the floor');
  const paid = player.playerStats.gold - before;
  assert.ok(paid >= 10 && paid <= 30, `paid ${paid}`);
  assert.equal(world.entities.filter((e) => e.item).length, 0, 'nothing on the floor');
  const [found] = player.inventory.filter(Boolean);
  assert.ok(['weapon', 'offhand', 'armor'].includes(found.gear), 'the gear is in the bag');
  assert.ok(player.rollLog.some((l) => l.text === `You've received ${found.name}`));
  assert.ok(PlayerActions.dropItem(player, { bag: 0 }));
  updateInventory();
  const [lying] = world.entities.filter((e) => e.item);
  assert.ok(lying && !player.inventory.some(Boolean), 'dropped at the hero\'s feet');
  player.position.x = lying.position.x;
  player.position.y = lying.position.y;
  beginPerception();
  updateInventory();
  assert.ok(!lying.removed, 'standing on it does not pick it up');
  player.playerInput.intents.use = true;
  resolveUses();
  updateInventory();
  assert.equal(player.inventory.filter(Boolean).length, 1, 'E takes it back');
  assert.ok(lying.removed);
  const gem = createLoot(0, 0, 0, 0, 200, true);
  assert.equal(LOOT_KINDS[gem.loot.kind].sheet, 'pickup_gem_ruby_12', 'an exact 200 is a ruby');
});

test('a kill pays 3d20 gold, shared by the whole party, and nobody carries more than 115 kg', () => {
  assert.equal(killReward(), 57, 'the loaded dice roll 19 on each d20');
  useDieRoller(() => 1);
  assert.equal(killReward(), 3, 'and at the least 3');
  useDieRoller(SURE_HIT);
  world.clear();
  const level = arena(10, 6);
  const killer = playerAt(2, 2);
  const other = playerAt(2, 4);
  const goblin = mobAt(level, 'goblin', 6, 2);
  const [killerGold, otherGold] = [killer.playerStats.gold, other.playerStats.gold];
  goblin.lastHitBy = world.id(killer);
  goblin.health.current = 0;
  updateDeath(level);
  assert.equal(killer.playerStats.gold - killerGold, 29, 'half of 57 each');
  assert.equal(other.playerStats.gold - otherGold, 29, 'the other hero gets the same');
  assert.equal(world.entities.filter((e) => e.loot).length, 0, 'no coins on the floor');
  assert.equal(killer.playerStats.exp, other.playerStats.exp, 'the experience is shared by everyone');
  world.clear();
  const player = playerAt(2, 2);
  player.inventory = [];
  assert.equal(addToBag(player, { type: 'armor', name: 'Anvil', value: 1, weight: 90 }), true);
  assert.equal(addToBag(player, { type: 'armor', name: 'Ingot', value: 1, weight: 20 }), true, 'up to 115 kg is a strain, not a stop');
  assert.equal(PlayerActions.receiveItem(player, { type: 'armor', name: 'Second anvil', value: 1, weight: 10 }), false, 'over 115 kg');
  assert.ok(player.rollLog.some((l) => l.text === "You're overloaded"));
  assert.equal(carriedWeight(player), 110);
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

test('a new run starts with one weapon of every type, a shield and every type of armour in the bag', async () => {
  const { WEAPON_BASES } = await load('rules/WeaponTable');
  const { ARMOR_BASES } = await load('rules/ArmorTable');
  const player = playerAt(2, 2);
  giveStartingKit(player);
  const bag = player.inventory;
  const bases = new Set(bag.map((i) => i.base));
  const inCatalogue = new Set([...HAND_WEAPONS, ...SHIELDS, ...ARMORS].map((i) => i.base));
  for (const base of [...WEAPON_BASES, ...ARMOR_BASES].filter((b) => inCatalogue.has(b))) assert.ok(bases.has(base), `${base} is in the bag`);
  assert.ok(bases.size >= 39, 'every weapon and armour type the catalogue has');
  assert.equal(bag.length, bases.size, 'one of each');
  assert.ok(bag.length <= PlayerActions.MAX_INVENTORY, 'and it all fits');
  assert.notEqual(bag[0], HAND_WEAPONS.find((w) => w.base === bag[0].base), 'copies, not the catalogue entries');
});

test('worn gear applies all its stats, and an item dropped on the gear panel finds its slot', () => {
  const player = playerAt(2, 2);
  const gear = { primary: { type: 'weapon', name: 'w', value: 1, gear: 'weapon', stats: { strength: 3, intelligence: 2 } },
    armor: { type: 'armor', name: 'a', value: 1, gear: 'armor', stats: { dexterity: 4, constitution: 2, wisdom: 3, charisma: 2 } } };
  const { applyLoadout } = PlayerActions;
  applyLoadout(player, { inventory: [], equipped: gear });
  const ps = player.playerStats;
  assert.equal(ps.swordTier, 4);
  assert.equal(ps.maxSprint, 140);
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
      mouseX: 10, mouseY: 20, mouseAiming: true, keyAim: null, spellSlot: 0, intents: noIntents(),
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

  const slotted = inputFrame();
  slotted.input.spellSlot = 20;
  assert.equal(validInput(slotted), false, 'the quick bar has two rows of ten squares');
  slotted.input.spellSlot = 19;
  assert.equal(validInput(slotted), true);
  assert.equal(validCommand({ kind: 'rest_dice', count: 2 }), false, 'hit dice are chosen when asking or agreeing');
  assert.equal(validCommand({ kind: 'vote_answer', agree: true, dice: 2 }), true);
  assert.equal(validCommand({ kind: 'vote_answer', agree: true, dice: 99 }), false, 'no hero has that many hit dice');
  assert.equal(validCommand({ kind: 'pause', paused: true }), true);
  assert.equal(validCommand({ kind: 'pause', paused: 'yes' }), false);
  assert.equal(validCommand({ kind: 'rest', rest: 'short', dice: 1 }), true);
  assert.equal(validCommand({ kind: 'drop', from: { bag: 3 } }), true);
  assert.equal(validCommand({ kind: 'drop', from: { bag: -1 } }), false);
  assert.equal(validCommand({ kind: 'rest', rest: 'long' }), true);
  assert.equal(validCommand({ kind: 'rest', rest: 'nap' }), false);
  assert.equal(validCommand({ kind: 'vote_answer', agree: 'yes' }), false);
  assert.equal(validCommand({ kind: 'buy', index: 2 }), true);
  assert.equal(validCommand({ kind: 'buy', index: 1.5 }), false);
  const helm = SHOP_ITEMS.find((item) => item.gear === 'head');
  assert.equal(validCommand({ kind: 'loadout', inventory: [SHOP_ITEMS[0]], equipped: { head: helm } }), true);
  assert.equal(validCommand({ kind: 'loadout', inventory: [{ ...SHOP_ITEMS[0], stats: { attack: 9 } }], equipped: {} }), false, 'unknown stat');
  assert.equal(validCommand({ kind: 'loadout', inventory: [{ type: 'dragon', name: 'x', value: 1 }], equipped: {} }), false);
  assert.equal(validCommand({ kind: 'loadout', inventory: [], equipped: { hat: helm } }), false);

  assert.equal(validRoster([{ slot: 'host', name: 'Ana', heroClass: 'wizard' }, { slot: 'p2', name: 'Bo', heroClass: 'wizard' }]), true, 'two may play one hero');
  assert.equal(validRoster([{ slot: 'host', name: 'Ana', heroClass: 'wizard' }, { slot: 'host', name: 'Bo', heroClass: 'fighter' }]), false, 'seats are unique');
  assert.equal(validRoster([{ slot: 'host', name: '<script>', heroClass: 'wizard' }]), false, 'names arrive clean');
  assert.equal(validRoster([{ slot: 'host', name: 'Ana', heroClass: 'dragon' }]), false, 'only known heroes');
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

test('every machine builds the same level from a seed; only the authority adds what changes in play (and bars the safe room)', () => {
  const guestSide = buildDungeon(4242, false);
  const decor = world.entities.filter((e) => e.localOnly).length;
  assert.ok(decor > 0);
  assert.equal(world.entities.filter((e) => e.ai || e.door || e.shopNpc).length, 0, 'guests get those from the host');
  world.clear();
  const hostSide = buildDungeon(4242, true);
  assert.equal(world.entities.filter((e) => e.localOnly).length, decor);
  assert.ok(world.entities.some((e) => e.ai) && world.entities.some((e) => e.door));
  assert.deepEqual(hostSide.spawns, guestSide.spawns);
  const doorway = new Set(hostSide.layout.safeDoor.tiles.map((t) => t.x + t.y * hostSide.level.width));
  for (let i = 0; i < hostSide.level.width * hostSide.level.height; i++) {
    const x = i % hostSide.level.width, y = Math.floor(i / hostSide.level.width);
    const expected = doorway.has(i) ? TileType.Obstacle : guestSide.level.getTile(x, y).type;
    assert.equal(hostSide.level.getTile(x, y).type, expected, doorway.has(i) ? 'the host bars the doorway until the lever is pulled' : undefined);
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

test('dice: notation, ranges, criticals, advantage and attack rolls', async () => {
  const { parseDice, formatDice, diceRange, rollDice, rollD20, rollAttack, rollCheck, dice } = await load('rules/Dice');
  assert.deepEqual(parseDice('2d6+3'), { count: 2, sides: 6, bonus: 3 });
  assert.deepEqual(parseDice('1d20 - 1'), { count: 1, sides: 20, bonus: -1 });
  assert.equal(parseDice('1d7'), null, 'no seven-sided dice');
  assert.equal(parseDice('d20'), null);
  assert.equal(formatDice(dice(1, 4, 1)), '1d4 + 1');
  assert.equal(formatDice(dice(1, 8, -1)), '1d8 - 1');
  assert.equal(formatDice(dice(1, 12, 3), true), '1d12+3');
  assert.equal(formatDice(dice(0, 4, 1)), '1', 'a punch is a flat number');
  assert.deepEqual(diceRange(dice(2, 6, 1)), { min: 3, max: 13, average: 8 });
  const sixes = () => 6;
  assert.equal(rollDice(dice(2, 6, 1), false, sixes), 13);
  assert.equal(rollDice(dice(2, 6, 1), true, sixes), 25, 'a critical doubles the dice, not the bonus');
  const rolls = [3, 17];
  const next = () => rolls.shift();
  assert.equal(rollD20('advantage', next), 17);
  useDieRoller(null);
  for (let i = 0; i < 200; i++) {
    const r = rollDice(dice(1, 4));
    assert.ok(r >= 1 && r <= 4 && Number.isInteger(r));
  }
  assert.deepEqual(rollAttack(5, 30, 'normal', () => 20), { natural: 20, total: 25, hit: true, critical: true }, 'a natural 20 always hits');
  assert.equal(rollAttack(50, 10, 'normal', () => 1).hit, false, 'a natural 1 always misses');
  assert.equal(rollAttack(3, 15, 'normal', () => 12).hit, true, 'meeting the AC hits');
  assert.equal(rollCheck(-1, 10, 'normal', () => 10).success, false);
});

test('ability modifiers and proficiency follow the tabletop tables', async () => {
  const { abilityModifier, abilities, proficiencyBonus } = await load('rules/Abilities');
  const table = { 1: -5, 3: -4, 8: -1, 9: -1, 10: 0, 11: 0, 12: 1, 15: 2, 18: 4, 20: 5, 30: 10 };
  for (const [score, mod] of Object.entries(table)) assert.equal(abilityModifier(Number(score)), mod, `score ${score}`);
  const base = { strength: 8, dexterity: 8, constitution: 8, intelligence: 8, wisdom: 8, charisma: 8 };
  const { scores, modifiers } = abilities({ primary: { type: 'weapon', name: 'w', value: 1, gear: 'weapon', stats: { strength: 4 } } }, base);
  assert.equal(scores.strength, 12);
  assert.equal(modifiers.strength, 1);
  assert.equal(modifiers.dexterity, -1, '8 gives -1');
  assert.deepEqual([1, 4, 5, 9, 13, 17, 20].map(proficiencyBonus), [2, 2, 3, 4, 5, 6, 6]);
});

test('Armor Class: 10 + DEX bare, armour sets its own base, heavy ignores DEX, medium caps it, a shield adds 2', async () => {
  const { armorClass } = await load('rules/CharacterSheet');
  const dexOf = (dexterity) => ({ strength: 0, dexterity, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 });
  const armor = (base, bonus) => ({ type: 'armor', name: base, value: 1, gear: 'armor', base, bonus });
  const shield = { type: 'shield', name: 's', value: 1, gear: 'offhand', base: 'shield' };
  assert.equal(armorClass({}, dexOf(-1)).total, 9, 'no armour: 10 + DEX');
  assert.equal(armorClass({}, dexOf(3)).total, 13);
  assert.equal(armorClass({ armor: armor('leather') }, dexOf(3)).total, 14, 'light armour adds all of DEX');
  assert.equal(armorClass({ armor: armor('breastplate') }, dexOf(4)).total, 16, 'medium armour adds at most +2');
  assert.equal(armorClass({ armor: armor('breastplate') }, dexOf(-1)).total, 13, 'but a penalty still counts');
  assert.equal(armorClass({ armor: armor('chain_mail') }, dexOf(4)).total, 16, 'heavy armour ignores DEX');
  assert.equal(armorClass({ armor: armor('plate') }, dexOf(-1)).total, 18, 'either way');
  assert.equal(armorClass({ armor: armor('plate', 1), secondary: shield }, dexOf(0)).total, 21, 'plate +1 with a shield');
  assert.equal(armorClass({ secondary: { ...shield, bonus: 2 } }, dexOf(0)).total, 14, 'a +2 shield adds 4');
});

test('weapon damage: the dice, plus STR in melee, DEX at range, the better for finesse, plus magic', async () => {
  const { weaponAttack, characterSheet } = await load('rules/CharacterSheet');
  const { formatDice } = await load('rules/Dice');
  const mods = (strength, dexterity) => ({ strength, dexterity, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 });
  const weapon = (base, bonus) => ({ type: 'weapon', name: base, value: 1, gear: 'weapon', base, bonus });
  const damage = (equipped, m) => formatDice(weaponAttack(equipped, m, 1).damage);
  assert.equal(damage({ primary: weapon('dagger', 1) }, mods(-1, -1)), '1d4', 'a +1 dagger with STR and DEX -1');
  assert.equal(damage({ primary: weapon('dagger') }, mods(-1, 3)), '1d4 + 3', 'finesse takes the better ability');
  assert.equal(damage({ primary: weapon('longbow', 2) }, mods(4, 1)), '1d8 + 3', 'ranged uses DEX');
  assert.equal(damage({ primary: weapon('greataxe') }, mods(2, 5)), '1d12 + 2', 'melee uses STR');
  assert.equal(damage({ primary: weapon('greatsword') }, mods(0, 0)), '2d6');
  assert.equal(damage({ primary: weapon('longsword') }, mods(1, 0)), '1d10 + 1', 'versatile, the other hand free');
  assert.equal(damage({ primary: weapon('longsword'), secondary: { type: 'shield', name: 's', value: 1, gear: 'offhand', base: 'shield' } }, mods(1, 0)), '1d8 + 1');
  assert.equal(damage({ secondary: weapon('shortsword') }, mods(0, 2)), '1d6 + 2', 'a weapon in the second hand when the first is empty');
  assert.equal(damage({}, mods(3, 0)), '4', 'bare-handed: 1 + STR');
  const attack = weaponAttack({ primary: weapon('scimitar', 3) }, mods(0, 2), 5);
  assert.equal(attack.attackBonus, 3 + 2 + 3, 'to hit: proficiency + DEX + magic');
  const player = playerAt(2, 2);
  player.equipped = { primary: weapon('dagger', 1), armor: { type: 'armor', name: 'a', value: 1, gear: 'armor', base: 'chain_shirt' } };
  const sheet = characterSheet(player);
  assert.equal(sheet.heroClass.id, 'fighter2');
  assert.equal(sheet.armorClass.total, 15, 'chain shirt 13 + DEX +2 (the medium cap), no fighting style');
  assert.equal(formatDice(sheet.attack.damage), '1d4 + 4', 'the +1 dagger with STR 16 (+3), better than DEX +2');
  assert.deepEqual(sheet.hitPoints, { current: 12, max: 12 }, 'a fighter: d10 + CON +2, as in the SRD');
});

test('every catalogue weapon, armour and shield plays as a D&D base, and a guest cannot forge a better one', async () => {
  const { isWeaponBase } = await load('rules/WeaponTable');
  const { isArmorBase } = await load('rules/ArmorTable');
  for (const item of HAND_WEAPONS) assert.ok(isWeaponBase(item.base), `${item.id} has a weapon base`);
  for (const item of [...ARMORS, ...SHIELDS]) assert.ok(isArmorBase(item.base), `${item.id} has an armour base`);
  assert.ok(HAND_WEAPONS.every((w) => (w.bonus ?? 0) <= 3) && HAND_WEAPONS.some((w) => w.bonus === 3), 'magic up to +3');
  const sword = HAND_WEAPONS.find((w) => !w.bonus);
  assert.equal(validCommand({ kind: 'loadout', inventory: [{ ...sword, bonus: 4 }], equipped: {} }), false, 'no +4');
  assert.equal(validCommand({ kind: 'loadout', inventory: [{ ...sword, base: 'vorpal_sword' }], equipped: {} }), false);
  assert.equal(sameItems({ inventory: [sword], equipped: {} }, { inventory: [{ ...sword, bonus: 3 }], equipped: {} }), false, 'enchanting it in a loadout is caught');
});

test('the Fighter and the Cleric: both are trained in every armour, the Cleric with simple weapons only', async () => {
  const { CLASSES } = await load('rules/Classes');
  const { characterSheet } = await load('rules/CharacterSheet');
  const plate = { type: 'armor', name: 'p', value: 1, gear: 'armor', base: 'plate' };
  assert.deepEqual([...CLASSES.fighter.armor], ['light', 'medium', 'heavy', 'shield']);
  assert.deepEqual([...CLASSES.cleric.armor], ['light', 'medium', 'heavy', 'shield'], 'the Life domain adds heavy armour');
  assert.deepEqual([...CLASSES.cleric.weapons], ['simple']);
  const fighter = createPlayer(centre(2), centre(2), 'fighter2');
  assert.equal(fighter.character.def, 'fighter');
  assert.equal(createPlayer(centre(2), centre(2), 'fighter').character.def, 'kaelen', 'a second fighter hero has the other sprites');
  assert.equal(characterSheet(fighter).armorClass.total, 10 + 2, 'no armour: 10 + DEX');
  fighter.build.fightingStyle = 'defense';
  fighter.equipped = { armor: plate };
  const heavy = characterSheet(fighter);
  assert.equal(heavy.armorClass.total, 19, 'plate 18 + the Defense style 1');
  assert.equal(heavy.attack.mode, 'normal');
  assert.equal(heavy.attack.proficient, true);
  const cleric = createPlayer(centre(4), centre(2), 'cleric');
  assert.equal(cleric.character.def, 'hooded_knight');
  assert.equal(cleric.heroClass, 'cleric');
  cleric.equipped = { armor: plate, primary: { type: 'weapon', name: 'l', value: 1, gear: 'weapon', base: 'longsword' } };
  const sheet = characterSheet(cleric);
  assert.equal(sheet.armorClass.total, 18, 'plate 18, no Defense style');
  assert.equal(sheet.armorClass.proficient, true);
  assert.equal(sheet.attack.proficient, false, 'a cleric is not trained in martial weapons');
  assert.equal(cleric.health.max, 10, 'd8 + CON +2');
});

test('enemies follow their SRD monster blocks and carry a random low-end weapon', async () => {
  const { MONSTERS } = await load('rules/Monsters');
  const { monsterAttack } = await load('rules/CharacterSheet');
  const { formatDice } = await load('rules/Dice');
  assert.equal(MONSTERS.orc.ac, 13);
  assert.equal(MONSTERS.orc.health, 15);
  assert.equal(MONSTERS.orc.modifiers.strength, 3);
  const club = monsterAttack('orc', 'club');
  assert.equal(club.attackBonus, 5, 'proficiency +2 and STR +3, as the SRD orc');
  assert.equal(formatDice(club.damage), '1d4 + 3');
  assert.equal(monsterAttack('goblin', 'dagger').attackBonus, 4, 'a goblin stabs with DEX (finesse)');
  const level = arena(8, 6);
  for (let i = 0; i < 20; i++) {
    const orc = mobAt(level, 'orc', 3, 3);
    assert.ok(MONSTERS.orc.weapons.includes(orc.mobWeapon), orc.mobWeapon);
    assert.equal(orc.health.max, 15);
  }
});

test('an attack: d20 + bonus against AC, natural 20 always hits and doubles the dice, natural 1 always misses', async () => {
  const { resolveAttack, MIN_HIT_DAMAGE } = await load('rules/Combat');
  const { dice } = await load('rules/Dice');
  const attack = { attackBonus: 4, damage: dice(1, 6, 2), mode: 'normal' };
  const rolls = (...values) => () => values.shift();
  const hit = resolveAttack(attack, 15, rolls(11, 5));
  assert.deepEqual([hit.hit, hit.total, hit.damage], [true, 15, 7], 'meets the AC: 1d6+2 rolled 5');
  assert.equal(resolveAttack(attack, 15, rolls(10)).hit, false, 'one short misses');
  const crit = resolveAttack(attack, 30, rolls(20, 6, 6));
  assert.deepEqual([crit.hit, crit.critical, crit.damage, crit.damageDice.count], [true, true, 14, 2]);
  const fumble = resolveAttack({ ...attack, attackBonus: 40 }, 10, rolls(1));
  assert.deepEqual([fumble.hit, fumble.fumble, fumble.damage], [false, true, 0]);
  assert.equal(resolveAttack({ ...attack, damage: dice(1, 4, -5) }, 5, rolls(15, 1)).damage, MIN_HIT_DAMAGE, 'a hit always hurts');
  assert.equal(resolveAttack({ ...attack, mode: 'disadvantage' }, 15, rolls(18, 3)).hit, false, 'disadvantage keeps the lower d20');
});

test('every blow is rolled and shown over the attacker: hits hurt, misses do not', async () => {
  const level = arena(10, 6);
  const player = playerAt(4, 2);
  player.aimVector = { x: 1, y: 0 };
  const goblin = mobAt(level, 'goblin', 4.5, 2);
  useDieRoller(() => 1);
  player.playerInput.intents.attack = true;
  updateSword();
  updateSword();
  assert.equal(goblin.health.current, goblin.health.max, 'a natural 1 misses');
  assert.deepEqual(player.rollLog.map((l) => [l.text, l.tone]), [['6 to hit', 'fumble'], ['CRIT MISS', 'fumble']], 'd20 1 + proficiency 2 + STR 3');
  useDieRoller((sides) => (sides === 20 ? 15 : 3));
  world.removeComponent(player, 'swordSwing');
  player.swordCooldown = 0;
  player.playerInput.intents.attack = true;
  updateSword();
  updateSword();
  assert.equal(goblin.health.current, goblin.health.max - 4, 'a bare-handed fighter punches for 1 + STR +3');
  assert.equal(player.rollLog.at(-2).text, '20 to hit', 'd20 15 + proficiency 2 + STR 3 against the goblin\'s AC 15');
  assert.deepEqual([player.rollLog.at(-1).text, player.rollLog.at(-1).tone], ['4 dmg', 'damage']);
});

test('a pack spreads round the player instead of piling up on one side, and every one of them strikes', async () => {
  const { updateCombatTimers } = await load('systems/CombatSystem');
  const level = arena(16, 12);
  const player = playerAt(9, 6);
  player.godMode = true;
  const pack = [[3, 5], [3, 6], [3, 7], [2, 6], [4, 6]].map(([x, y]) => mobAt(level, 'goblin_grunt', x, y));
  for (const mob of pack) engage(mob, player, 0);
  for (let tick = 1; tick <= 600; tick++) {
    tickWorld(level, tick);
    for (const mob of pack) mob.ai.lastSeenTick = tick;
    updateCombatTimers();
    updateContactDamage(level);
  }
  pack.forEach((mob, i) => assert.ok(mob.rollLog?.length, `goblin ${i} got to strike`));
  const quarter = (m) => (((Math.round(Math.atan2(m.position.y - player.position.y, m.position.x - player.position.x) / (Math.PI / 2))) % 4) + 4) % 4;
  assert.ok(new Set(pack.map(quarter)).size >= 3, 'they came at the player from three sides or more');
});

test('an enemy that touches the player rolls against their Armor Class, and the roll shows over its head', () => {
  const level = arena(12, 6);
  const player = playerAt(6, 3);
  const orc = mobAt(level, 'orc', 5.4, 3);
  useDieRoller(() => 1);
  beginPerception();
  const before = player.health.current;
  for (let t = 0; t < 120; t++) updateContactDamage(level);
  assert.equal(player.health.current, before, 'natural 1s never hit');
  assert.ok(orc.rollLog?.length, 'the misses are shown over the orc');
  assert.deepEqual(orc.rollLog.slice(0, 2).map((l) => l.text), ['6 to hit', 'CRIT MISS'], 'd20 1 + 5');
});

test('the roll log is a queue: newest at the bottom, the top line fades first, at most four lines', async () => {
  const { logLine, updateRollLogs, ROLL_LINE_TICKS, MAX_ROLL_LINES } = await load('systems/RollLogSystem');
  const player = playerAt(2, 2);
  for (let i = 0; i < 6; i++) logLine(player, `line ${i}`, 'hit');
  assert.equal(player.rollLog.length, MAX_ROLL_LINES);
  assert.equal(player.rollLog[0].text, 'line 2', 'the oldest were pushed out');
  for (let t = 0; t < ROLL_LINE_TICKS; t++) updateRollLogs();
  assert.equal(player.rollLog[0].text, 'line 3', 'the top line went first');
  assert.equal(player.rollLog.length, MAX_ROLL_LINES - 1, 'the next one lingers a moment longer');
  for (let t = 0; t < ROLL_LINE_TICKS * MAX_ROLL_LINES; t++) updateRollLogs();
  assert.equal(player.rollLog.length, 0);
});

test('the swap key trades the 1st and 2nd weapon; a shield in the second hand stays put', async () => {
  const { swapWeapons } = PlayerActions;
  const player = playerAt(2, 2);
  const sword = SHOP_ITEMS.find((i) => i.name === 'Short Sword');
  const axe = SHOP_ITEMS.find((i) => i.name === 'Hand Axe');
  const shield = SHOP_ITEMS.find((i) => i.gear === 'offhand');
  player.equipped = { primary: sword, secondary: axe };
  assert.equal(swapWeapons(player), true);
  assert.equal(player.equipped.primary, axe);
  assert.equal(player.equipped.secondary, sword);
  player.equipped = { primary: sword, secondary: shield };
  assert.equal(swapWeapons(player), false);
  assert.equal(player.equipped.primary, sword);
  const { updateWeaponSwap } = await load('systems/WeaponSwapSystem');
  player.equipped = { primary: sword, secondary: axe };
  player.playerInput.intents.swap = true;
  updateWeaponSwap();
  assert.equal(player.equipped.primary, axe, 'the Q intent does it in play');
  assert.equal(player.playerInput.intents.swap, false);
});

test('enemies cannot walk or be knocked into a safe room', () => {
  const level = arena(12, 6);
  for (let y = 1; y < 5; y++) for (let x = 7; x < 11; x++) level.markSafeZone(x, y);
  const mob = mobAt(level, 'orc', 5.5, 3);
  for (let t = 0; t < 120; t++) {
    mob.velocity.x = 2;
    beginPerception();
    updateMovement(level);
  }
  assert.ok(!level.isWorldPosSafe(mob.position.x, mob.position.y), 'it stopped at the edge');
  assert.ok(mob.position.x > centre(6), 'having walked right up to it');
  mob.bump = { x: 30, y: 0 };
  updateMovement(level);
  assert.ok(!level.isWorldPosSafe(mob.position.x, mob.position.y), 'nor shoved in');
});

test('saved key bindings on the quick bar\'s keys move off them; no action can be bound to one', async () => {
  const { mergeBindings, bind, settings, resetBindings } = await load('game/Settings');
  const old = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', attack: 'Space', cast: 'KeyQ', use: 'KeyE', inventory: 'Tab' };
  const merged = mergeBindings(old);
  assert.equal(merged.swap, 'KeyG', 'weapon swap leaves Q');
  assert.equal(merged.cast, 'KeyF', 'the spell leaves Q (and R)');
  assert.equal(mergeBindings({ ...old, cast: 'KeyR', swap: 'KeyQ' }).swap, 'KeyG', 'the last defaults moved too');
  assert.equal(mergeBindings({ ...old, cast: 'KeyV', swap: 'KeyB' }).cast, 'KeyV', 'chosen keys are kept');
  assert.equal(bind('use', 'Digit3'), false, 'quick-bar keys are refused');
  assert.equal(settings.bindings.use, 'KeyE');
  resetBindings();
});

test('hero class, enemy weapon and roll log reach guests, and bad ones are refused', () => {
  const host = playerAt(2, 2);
  world.addComponent(host, 'playerSlot', 'host');
  const level = arena(8, 6);
  const orc = mobAt(level, 'orc', 4, 3);
  world.addComponent(orc, 'rollLog', [{ text: '12+5=17 HIT', tone: 'hit', age: 3 }]);
  const state = JSON.parse(JSON.stringify(captureWorld(false, 7)));
  validateNetState(state);
  const orcData = state.entities.find((e) => e.data.mobType === 'orc').data;
  assert.equal(orcData.mobWeapon, orc.mobWeapon);
  assert.equal(state.entities.find((e) => e.data.playerSlot === 'host').data.heroClass, 'fighter2');
  const tamper = (edit) => {
    const copy = JSON.parse(JSON.stringify(state));
    edit(copy.entities.find((e) => e.data.mobType === 'orc').data);
    return attempt(() => validateNetState(copy)).ok;
  };
  assert.equal(tamper((d) => { d.rollLog[0].tone = 'boom'; }), false);
  assert.equal(tamper((d) => { d.mobWeapon = 'vorpal_sword'; }), false);
  assert.equal(tamper((d) => { d.heroClass = 'paladin'; }), false);
});

test('the warrior\'s wide attack and tall power-up keep the body where the idle has it', async () => {
  const { clipAnchorX, clipAnchorY } = await load('characters/Characters');
  const def = characterDef('hooded_knight');
  assert.equal(clipAnchorX(def, def.clips.idle), 0.33);
  assert.equal(clipAnchorX(def, def.clips.attack), 33 / 180);
  assert.equal(clipAnchorY(def, def.clips.idle), 0.5);
  assert.equal(clipAnchorY(def, def.clips.cast), (169 - 91 + 50) / 180, 'the feet stay on the same line');
});

test('the fog redraws only when something new has been seen', () => {
  const level = arena(10, 10);
  const before = level.seenRevision;
  level.reveal(5, 5, 3);
  const after = level.seenRevision;
  assert.ok(after > before);
  level.reveal(5, 5, 3);
  assert.equal(level.seenRevision, after, 'seeing the same tiles again changes nothing');
});

test('the combat log names who struck and how it went, and reaches guests checked', async () => {
  const { currentLog, MAX_LOG_ENTRIES } = await load('systems/CombatLogSystem');
  const level = arena(12, 6);
  const player = playerAt(4, 2);
  world.addComponent(player, 'playerName', 'Evincars');
  world.addComponent(player, 'playerSlot', 'host');
  player.aimVector = { x: 1, y: 0 };
  const orc = mobAt(level, 'orc', 4.6, 2);
  player.playerInput.intents.attack = true;
  updateSword();
  updateSword();
  const [blow] = currentLog().entries;
  assert.deepEqual(blow, { seq: 1, actor: 'player', name: 'Evincars', total: 24, result: 'hit', damage: 4 }, 'loaded d20 19 + 5');
  useDieRoller(() => 1);
  beginPerception();
  for (let t = 0; t < 120; t++) updateContactDamage(level);
  const orcBlow = currentLog().entries.find((e) => e.actor === 'mob');
  assert.deepEqual([orcBlow.name, orcBlow.result, orcBlow.damage], ['orc', 'fumble', 0]);
  assert.ok(currentLog().entries.length <= MAX_LOG_ENTRIES);
  const state = JSON.parse(JSON.stringify(captureWorld(false, 3)));
  validateNetState(state);
  const logData = state.entities.find((e) => e.data.combatLog).data;
  logData.combatLog.entries[0].name = 'goblin_king';
  logData.combatLog.entries[0].actor = 'mob';
  assert.equal(attempt(() => validateNetState(state)).ok, false, 'an unknown enemy is refused');
  void orc;
});

test('the warrior\'s blow lands on its attack clip\'s impact frame, and the next waits for the clip', async () => {
  const { SWORD_STATS } = await load('entities/WeaponStats');
  const Characters = await load('characters/Characters');
  const level = arena(10, 6);
  const warrior = createPlayer(centre(4), centre(2), 'cleric');
  warrior.aimVector = { x: 1, y: 0 };
  const goblin = mobAt(level, 'goblin', 4.6, 2);
  warrior.playerInput.intents.attack = true;
  updateSword();
  const delay = warrior.swordSwing.delay;
  assert.equal(delay + 1, Characters.clipImpactTicks('hooded_knight', 'attack'), 'the first tick of the wind-up has passed');
  assert.ok(delay > 0);
  assert.ok(warrior.swordCooldown >= SWORD_STATS.cooldown);
  for (let t = 0; t < delay; t++) updateSword();
  assert.equal(goblin.health.current, goblin.health.max, 'nothing lands while the blade comes round');
  updateSword();
  assert.ok(goblin.health.current < goblin.health.max, 'then it does');
  assert.equal(characterDef('hooded_knight').swingFx, false, 'its own art draws the slash');
  assert.ok(characterDef('hooded_knight').clips.walk && characterDef('hooded_knight').clips.run, 'it walks and runs');
});

test('where kinds of ground meet, the softer spills over the edge of the harder', async () => {
  const { groundBlends } = await load('level/GroundBlend');
  const { groundAt } = await load('level/TerrainAutotile');
  const level = arena(10, 6);
  for (let y = 1; y < 5; y++) for (let x = 1; x < 4; x++) level.markSafeZone(x, y);
  const blends = groundBlends(level);
  assert.equal(groundAt(level, 2, 2).kind, 'safe');
  assert.ok(blends.length > 0);
  assert.ok(blends.every((b) => b.from.kind !== 'safe'), 'the corridor spills onto the safe room, never the other way');
  const onto = blends.map((b) => Math.floor(b.dx / TILE_WIDTH));
  assert.ok(onto.every((x) => x === 3), 'only along the safe room\'s edge');
  assert.ok(blends.some((b) => b.side === 'e'));
  assert.equal(groundAt(level, 0, 0), null, 'walls are not ground');
});

test('a generated level saves to JSON and gzip, and comes back the same; a damaged map is refused', async () => {
  const { encodeLevelMap, decodeLevelMap, packLevelMap, unpackLevelMap } = await load('level/LevelMap');
  const { level, spawns, layout } = buildDungeon(1234, true);
  const map = encodeLevelMap(layout);
  const json = JSON.stringify(map);
  const back = decodeLevelMap(JSON.parse(json));
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      assert.equal(back.level.getTile(x, y).type, level.getTile(x, y).type);
      assert.equal(back.level.getTile(x, y).imageVariant, level.getTile(x, y).imageVariant);
      assert.equal(back.level.isSafeZone(x, y), level.isSafeZone(x, y));
    }
  }
  assert.deepEqual([...back.level.caveFloor].sort(), [...level.caveFloor].sort());
  assert.deepEqual([...back.level.wallDecor], [...level.wallDecor]);
  assert.deepEqual([...back.level.blockBoxes], [...level.blockBoxes]);
  assert.deepEqual(back.level.pits, level.pits);
  assert.deepEqual(back.playerSpawn, spawns.playerSpawn);
  assert.deepEqual(back.torchPositions, spawns.torchPositions);
  assert.deepEqual(back.rooms, layout.rooms, 'the rooms');
  assert.deepEqual(back.props, layout.props, 'the props: the assets every screen draws');
  assert.deepEqual([back.leverPos, back.safeDoor, back.shopPos], [layout.leverPos, layout.safeDoor, layout.shopPos]);
  assert.deepEqual([back.exitLeverPos, back.exitDoor], [layout.exitLeverPos, layout.exitDoor], "the exit room's lever and door");
  const packed = await packLevelMap(map);
  assert.ok(packed.byteLength < json.length / 2, `gzip shrinks it (${json.length} → ${packed.byteLength} bytes)`);
  const unpacked = await unpackLevelMap(packed);
  assert.equal(unpacked.level.width, level.width);
  const broken = (edit) => attempt(() => decodeLevelMap(edit(JSON.parse(json)))).ok;
  assert.equal(broken((m) => ({ ...m, version: 99 })), false);
  assert.equal(broken((m) => ({ ...m, safe: [[0, 1e9]] })), false, 'a run off the map');
  assert.equal(broken((m) => ({ ...m, wallDecor: [[1, 'fresco']] })), false);
  assert.equal(broken((m) => ({ ...m, tiles: btoa('xyz') })), false, 'tiles that do not fill the map');
  assert.equal(broken((m) => ({ ...m, props: [['dragon_statue', 1, 1]] })), false, 'an unknown prop');
});

test('the five main characters: each with their D&D class, sprite and training', async () => {
  const { CLASSES } = await load('rules/Classes');
  const { characterSheet, weaponAttack } = await load('rules/CharacterSheet');
  const { formatDamage } = await load('rules/Dice');
  const expect = { fighter: 'fighter', wizard: 'wizard', rogue: 'rogue', warlock: 'warlock', bard: 'bard' };
  for (const [id, cls] of Object.entries(expect)) {
    assert.equal(CLASSES[id].dndClass, cls, id);
    const hero = createPlayer(centre(2), centre(2), id);
    assert.equal(hero.character.def, CLASSES[id].character, `${id} is drawn with its own sprites`);
    const def = characterDef(CLASSES[id].character);
    for (const state of ['idle', 'walk', 'run', 'attack', 'cast', 'hurt', 'death']) assert.ok(def.states[state], `${id} ${state}`);
  }
  assert.equal(CLASSES.wizard.spellcasting, 'intelligence');
  assert.equal(CLASSES.warlock.spellcasting, 'charisma');
  assert.equal(CLASSES.bard.spellcasting, 'charisma');
  assert.equal(CLASSES.cleric.spellcasting, 'wisdom');
  assert.equal(CLASSES.fighter.spellcasting, null);
  assert.equal(CLASSES.rogue.spellcasting, null, 'a rogue casts nothing');
  assert.deepEqual([...CLASSES.wizard.armor], [], 'a wizard wears no armour');
  const wizard = createPlayer(centre(2), centre(2), 'wizard');
  wizard.equipped = { primary: { type: 'weapon', name: 'g', value: 1, gear: 'weapon', base: 'greatsword' } };
  assert.equal(characterSheet(wizard).attack.proficient, false, 'nor knows the greatsword');
  wizard.equipped = { primary: { type: 'weapon', name: 'q', value: 1, gear: 'weapon', base: 'quarterstaff' } };
  assert.equal(characterSheet(wizard).attack.proficient, true, 'but the quarterstaff, by name');
  wizard.equipped = { primary: { type: 'weapon', name: 's', value: 1, gear: 'weapon', base: 'sling' } };
  assert.equal(characterSheet(wizard).attack.proficient, true, 'and the sling');
  const rogue = createPlayer(centre(2), centre(2), 'rogue');
  rogue.equipped = { primary: { type: 'weapon', name: 'd', value: 1, gear: 'weapon', base: 'dagger' } };
  assert.equal(formatDamage(characterSheet(rogue).attack.damage, characterSheet(rogue).attack.extra), '1d4 + 1d6 + 3', 'Sneak Attack with a finesse dagger, DEX 16');
  rogue.equipped = { primary: { type: 'weapon', name: 'r', value: 1, gear: 'weapon', base: 'rapier' } };
  assert.equal(characterSheet(rogue).attack.proficient, true, 'a rogue knows the rapier by name');
  const mods = { strength: 2, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 };
  assert.equal(weaponAttack({ primary: { type: 'weapon', name: 'm', value: 1, gear: 'weapon', base: 'mace' } }, mods, 1, CLASSES.rogue).extra, undefined, 'not with a mace');
  const kaelen = createPlayer(centre(2), centre(2), 'fighter');
  assert.equal(kaelen.health.max, 12);
  const hit = (id) => createPlayer(centre(2), centre(2), id).health.max;
  assert.deepEqual([hit('wizard'), hit('rogue'), hit('warlock'), hit('bard'), hit('cleric')], [8, 10, 10, 10, 10], 'hit die + CON, as in the SRD');
  const die = (id) => CLASSES[id].hitDie;
  assert.deepEqual([die('fighter'), die('wizard'), die('rogue'), die('warlock'), die('bard'), die('cleric')], [10, 6, 8, 8, 8, 8], "each class's SRD hit die");
});

test('the safe room opens with its lever: barred until pulled, then the portcullis rises and the way is clear', async () => {
  const { updateLevers } = await load('systems/LeverSystem');
  const { updateDoors } = await load('systems/DoorSystem');
  const { level, layout } = buildDungeon(777, true);
  const door = world.entities.find((e) => e.door);
  const lever = world.entities.find((e) => e.lever);
  assert.ok(door.door.locked && lever);
  for (const t of layout.safeDoor.tiles) assert.equal(level.getTile(t.x, t.y).type, TileType.Obstacle, 'barred');
  const gates = world.entities.filter((e) => e.gate);
  assert.equal(gates.length, layout.safeDoor.tiles.length, 'a portcullis on every doorway tile');
  const hero = createPlayer(lever.position.x + 6, lever.position.y);
  beginPerception();
  for (let t = 0; t < 120; t++) updateDoors(level);
  assert.ok(door.door.locked && !door.door.closed, 'nobody can leave, so nothing seals');
  assert.equal(world.entities.filter((e) => e.stash && level.isWorldPosSafe(e.position.x, e.position.y)).length, 0,
    'nothing in the safe room is there to be searched');
  hero.playerInput.intents.use = true;
  beginPerception();
  resolveUses();
  updateLevers(level);
  assert.equal(lever.lever.pulled, true);
  assert.equal(door.door.locked, false);
  for (const t of layout.safeDoor.tiles) assert.equal(level.getTile(t.x, t.y).type, TileType.Floor, 'the way is open');
  for (let t = 0; t < 60; t++) updateDoors(level);
  assert.ok(gates.every((g) => g.removed), 'the portcullis has risen out of sight');
});

test('a co-op guest builds the dungeon the host sent: the same terrain (gate and all) and the same decor', async () => {
  const { encodeLevelMap, packLevelMap, unpackLevelMap } = await load('level/LevelMap');
  const { buildSentDungeon } = await load('level/DungeonGenerator');
  const host = buildDungeon(31337, true);
  const hostDecor = world.entities.filter((e) => e.localOnly).length;
  const packed = await packLevelMap(encodeLevelMap(host.layout));
  world.clear();
  const guest = buildSentDungeon(await unpackLevelMap(packed));
  assert.equal(world.entities.filter((e) => e.localOnly).length, hostDecor, 'every torch, prop and room');
  assert.equal(world.entities.filter((e) => e.ai || e.door || e.lever).length, 0, 'the live pieces come with the world updates');
  for (let i = 0; i < host.level.width * host.level.height; i++) {
    const x = i % host.level.width, y = Math.floor(i / host.level.width);
    assert.equal(guest.level.getTile(x, y).type, host.level.getTile(x, y).type);
  }
  assert.deepEqual(guest.spawns, host.spawns);
});

test('every character strip the game loads is a file in public/ (a moved folder fails here, not at start-up)', async () => {
  const { existsSync } = await import('node:fs');
  const { allCharacters } = await load('characters/Characters');
  const missing = allCharacters().flatMap((def) => Object.values(def.clips).map((c) => c.src)).filter((src) => !existsSync(`public${src}`));
  assert.deepEqual(missing, []);
});

test('the character sheet: proficiency, initiative, speed, passive Perception, saving throws and spellcasting', async () => {
  const { characterSheet } = await load('rules/CharacterSheet');
  const vesper = createPlayer(centre(2), centre(2), 'warlock');
  const sheet = characterSheet(vesper);
  assert.equal(sheet.proficiency, 2);
  assert.equal(sheet.initiative, 2, 'DEX 14');
  assert.equal(sheet.speed, 30);
  assert.equal(sheet.passivePerception, 11, '10 + WIS +1');
  assert.deepEqual(sheet.saves.wisdom, { bonus: 3, proficient: true }, 'a warlock is trained in WIS saves');
  assert.deepEqual(sheet.saves.charisma, { bonus: 5, proficient: true }, 'and CHA');
  assert.deepEqual(sheet.saves.strength, { bonus: -1, proficient: false });
  assert.deepEqual([sheet.spell.ability, sheet.spell.attack, sheet.spell.dc], ['charisma', 5, 13], 'CHA 16: +3 +2, DC 8 + 2 + 3');
  vesper.equipped = { primary: { type: 'weapon', name: 'g', value: 1, gear: 'weapon', base: 'greatsword' } };
  assert.equal(characterSheet(vesper).spell.attack, 5, 'an untrained weapon in hand does not spoil the spell');
  const plate = { armor: { type: 'armor', name: 'p', value: 1, gear: 'armor', base: 'plate' } };
  vesper.equipped = plate;
  assert.equal(characterSheet(vesper).speed, 20, 'plate needs STR 15: Vesper (STR 9) is slowed');
  const fighter = playerAt(2, 2);
  fighter.equipped = plate;
  assert.equal(characterSheet(fighter).speed, 30, 'the fighter (STR 16) is not');
});

test('everyone is proficient with an unarmed strike, even a wizard', async () => {
  const { characterSheet } = await load('rules/CharacterSheet');
  const sheet = characterSheet(createPlayer(centre(2), centre(2), 'warlock'));
  assert.equal(sheet.attack.base, 'unarmed');
  assert.equal(sheet.attack.proficient, true);
  assert.equal(sheet.attack.attackBonus, 2 - 1, 'proficiency +2, STR -1');
});

// ── Spells, initiative, hit dice, rests and experience ───────────────────────

const { updateSpells } = await load('systems/SpellSystem');
const { SPELLS } = await load('rules/Spells');
const { SPELL_STATS } = await load('entities/WeaponStats');
const { updateInitiative } = await load('systems/InitiativeSystem');
const Strike = await load('systems/Strike');
const Rest = await load('game/Rest');
const Party = await load('game/Party');
/** One tick of the party's answers, then of the rests acting on them (the game's order). */
const tickParty = (level) => { Party.updateParty(); Rest.updateRest(level); };
const { levelForXp, nextLevelXp } = await load('game/Progress');

/** A caster aiming east at a point, with the quick-bar square picked (standing where spells may be prepared). */
function casterAt(tx, ty, heroClass, slot) {
  const caster = playerAt(tx, ty, heroClass);
  caster.inSafeRoom = true;
  caster.aimVector = { x: 1, y: 0 };
  world.addComponent(caster, 'aimWorld', { x: caster.position.x + 48, y: caster.position.y });
  caster.playerInput.spellSlot = slot;
  return caster;
}

/** Presses cast for one tick, then lets the spell play out (and its bolts fly) for `ticks`. */
function cast(level, caster, ticks = 90) {
  caster.playerInput.intents.cast = true;
  for (let i = 0; i < ticks; i++) {
    beginPerception();
    updateSpells(level);
    caster.playerInput.intents.cast = false;
  }
}

const rollLines = (entity) => (entity.rollLog ?? []).map((line) => line.text);

test('a bolt spell is rolled to hit and strikes with its effect; the spell then recovers before it can be cast again', () => {
  const level = arena(12, 6);
  const vesper = casterAt(2, 2, 'wizard', 0);
  const orc = mobAt(level, 'orc', 6, 2);
  const before = orc.health.current;
  cast(level, vesper, 1);
  assert.equal(vesper.spellbook.recovery[0], SPELLS.fire_bolt.recoveryTicks, 'recovering from the moment it is cast');
  cast(level, vesper, SPELLS.fire_bolt.recoveryTicks);
  assert.ok(orc.health.current < before, 'Fire Bolt hit the orc');
  const entry = currentLog().entries.at(-1);
  assert.equal(entry.spell, 'fire_bolt');
  assert.equal(entry.result, 'hit');
  assert.equal(vesper.spellbook.recovery[0], 0, 'recovered in its own time');
});

test('magic missile always hits with its three darts; cast again too soon, it says how long it still needs', () => {
  const level = arena(12, 6);
  const vesper = casterAt(2, 2, 'wizard', 2);
  const orc = mobAt(level, 'orc', 5, 2);
  useDieRoller((sides) => (sides === 20 ? 1 : sides));
  cast(level, vesper);
  const darts = currentLog().entries.filter((e) => e.spell === 'magic_missile');
  assert.equal(darts.length, 3, 'three darts, though every d20 would have been a 1');
  assert.ok(darts.every((e) => e.result === 'auto' && e.damage === 5), '1d4+1 each');
  assert.ok(orc.health.current < orc.health.max);
  cast(level, vesper, SPELL_STATS.cooldown + 2);
  assert.equal(vesper.casting, undefined, 'nothing cast while it recovers');
  assert.ok(rollLines(vesper).some((line) => line.startsWith('READY IN')), rollLines(vesper).join('|'));
});

test('a burst makes every foe in it save against the spell DC: half damage on a success, nothing beyond its reach', () => {
  const level = arena(14, 6);
  const xanthia = casterAt(3, 2, 'bard', 2);
  const near = mobAt(level, 'orc', 4, 2);
  const far = mobAt(level, 'orc', 10, 2);
  cast(level, xanthia, SPELL_STATS.castTicks + 1);
  // Loaded dice: the orc's save is 19 + CON against DC 13, made; 2d8 at most is 16, halved to 8.
  const saved = currentLog().entries.filter((e) => e.spell === 'thunderwave');
  assert.equal(saved.length, 1, 'only the orc within the wave');
  assert.equal(saved[0].result, 'saved');
  assert.equal(saved[0].damage, 8);
  assert.equal(near.health.current, near.health.max - 8);
  assert.equal(far.health.current, far.health.max);
  useDieRoller((sides) => (sides === 20 ? 2 : sides));
  for (let i = 0; i < SPELLS.thunderwave.recoveryTicks; i++) updateSpells(level);
  cast(level, xanthia, SPELL_STATS.castTicks + 1);
  const failed = currentLog().entries.at(-1);
  assert.equal(failed.result, 'auto', 'a failed save takes it all');
  assert.equal(failed.damage, 16);
  assert.equal(near.health.current, 0);
});

test('a spell is learnt at its level, and a healing spell mends the caster by the dice + casting ability + Disciple of Life', () => {
  const level = arena(10, 6);
  const wizard = casterAt(2, 4, 'wizard', 4);
  cast(level, wizard);
  assert.equal(wizard.casting, undefined, 'Chromatic Orb is learnt at level 2');
  assert.ok(rollLines(wizard).includes('LEVEL 2'));
  const cleric = casterAt(2, 2, 'cleric', 2);
  cleric.health.max = 50;
  cleric.health.current = 10;
  cast(level, cleric);
  // 1d8 (loaded: 8) + WIS +3 + Disciple of Life 2 + the spell's level 1, as at the table.
  assert.equal(cleric.health.current, 10 + 8 + 3 + 3);
  assert.equal(currentLog().entries.at(-1).result, 'heal');
  const empty = casterAt(2, 4, 'fighter', 0);
  cast(level, empty);
  assert.equal(empty.casting, undefined, 'a hero without spells casts nothing');
});

test('Eldritch Blast adds the casting ability once the Warlock has Agonizing Blast (level 2)', () => {
  const level = arena(12, 6);
  const warlock = casterAt(2, 2, 'warlock', 0);
  const orc = mobAt(level, 'orc', 6, 2);
  useDieRoller(SURE_HIT);
  cast(level, warlock, SPELLS.eldritch_blast.recoveryTicks + 90);
  const first = currentLog().entries.at(-1);
  assert.equal(first.spell, 'eldritch_blast');
  assert.equal(first.damage, 10, '1d10, loaded to its highest');
  warlock.playerStats.level = 2;
  warlock.castCooldown = 0;
  warlock.spellbook.recovery[0] = 0;
  cast(level, warlock, 90);
  assert.equal(currentLog().entries.at(-1).damage, 10 + 3, 'plus CHA +3');
  assert.ok(orc.health.current < orc.health.max);
});

test('initiative: an enemy that engages and its hero each roll d20 + DEX; the winner gets the first strike, with advantage', () => {
  const level = arena(12, 6);
  const hero = playerAt(2, 2, 'cleric');
  const goblin = mobAt(level, 'goblin', 5, 2);
  engage(goblin, hero, 0);
  // Loaded dice: both roll 19; the goblin's DEX +2 beats the Cleric's +0.
  updateInitiative();
  assert.equal(goblin.initiative.total, 21);
  assert.equal(hero.initiative.total, 19);
  assert.equal(goblin.initiative.firstStrike, true);
  assert.equal(hero.initiative.firstStrike, false);
  assert.ok(rollLines(goblin).includes('FIRST STRIKE') && rollLines(hero).includes('Initiative 19'));
  let d20s = 0;
  useDieRoller((sides) => { if (sides === 20) d20s++; return SURE_HIT(sides); });
  Strike.strike(hero, { attackBonus: 4, damage: SPELLS.fire_bolt.damage, mode: 'normal' }, goblin);
  assert.equal(d20s, 2, 'the first strike rolls with advantage');
  Strike.strike(hero, { attackBonus: 4, damage: SPELLS.fire_bolt.damage, mode: 'normal' }, goblin);
  assert.equal(d20s, 3, 'and only the first');

  const rolls = [2];
  useDieRoller((sides) => (sides === 20 ? rolls.shift() ?? 19 : sides));
  const second = mobAt(level, 'goblin', 6, 3);
  engage(second, hero, 0);
  updateInitiative();
  assert.equal(second.initiative.total, 4);
  assert.equal(hero.initiative.firstStrike, false, 'a hero wins the first strike only when their roll is new');
  agentOf(second).go('idle');
  updateInitiative();
  assert.equal(second.initiative, undefined, 'calmed down, it rolls again next time');
});

test('hit dice are spent in a short rest, as many as the hero chooses: each the class die + CON', () => {
  const level = arena(12, 6);
  const hero = playerAt(2, 2);
  world.addComponent(hero, 'playerSlot', 'host');
  hero.playerStats.level = 3;
  hero.playerStats.hitDice = 3;
  hero.health.max = 40;
  hero.health.current = 5;
  Rest.queueRestRequest('host', 'short', 2);
  tickParty(level);
  // Two of the Fighter's d10 (loaded: 10) + CON +2 each: 24, as at the table.
  assert.equal(hero.health.current, 5 + 2 * 12);
  assert.equal(hero.playerStats.hitDice, 1, 'one left for the next short rest');
  assert.ok(rollLines(hero).includes('Hit dice 2d10+4 = 24'));
  assert.equal(Rest.hitDiceLabel(hero, 1), '1d10+2');
  hero.health.current = 35;
  Rest.queueRestRequest('host', 'short', 5);
  tickParty(level);
  assert.equal(hero.playerStats.hitDice, 0, 'no more than are left');
  assert.equal(hero.health.current, 40, 'healing stops at the maximum');
  hero.health.current = 20;
  hero.playerStats.hitDice = 2;
  Rest.takeRest('short');
  assert.equal(hero.health.current, 20, 'a short rest with no hit dice chosen heals nothing');
  assert.equal(hero.playerStats.hitDice, 2);
});

test('in co-op each companion chooses their hit dice as they agree to a short rest; one refusal and nobody heals', () => {
  const level = arena(12, 6);
  const host = playerAt(2, 2, 'wizard');
  const guest = playerAt(4, 2, 'bard');
  world.addComponent(host, 'playerSlot', 'host');
  world.addComponent(guest, 'playerSlot', 'p2');
  for (const hero of [host, guest]) {
    hero.playerStats.level = 3;
    hero.playerStats.hitDice = 3;
    hero.health.max = 40;
    hero.health.current = 5;
  }
  Rest.queueRestRequest('p2', 'short', 2);
  tickParty(level);
  assert.equal(Party.currentParty().vote.kind, 'short', 'the guest asked: the host is asked too');
  assert.equal(guest.health.current, 5, 'nobody heals before everyone agrees');
  Party.queueAnswer('host', false);
  tickParty(level);
  assert.equal(Party.currentParty().vote, null);
  assert.equal(guest.health.current, 5, 'refused: not even the guest who asked heals');
  assert.equal(guest.playerStats.hitDice, 3);
  for (let i = 0; i <= Party.NOTICE_TICKS; i++) tickParty(level);
  Rest.queueRestRequest('p2', 'short', 2);
  tickParty(level);
  Party.queueAnswer('host', true, 1);
  tickParty(level);
  // The wizard's d6 and the bard's d8 (loaded to their highest), each + CON: the wizard's +2, the bard's +2.
  assert.equal(host.health.current, 5 + 6 + 2, 'the host spent the one die they chose');
  assert.equal(guest.health.current, 5 + 2 * (8 + 2), 'the guest spent the two they asked with');
  assert.equal(host.playerStats.hitDice, 2);
  assert.equal(guest.playerStats.hitDice, 1);
});

test('rests: a short one recovers spells (two before a long one), a long one heals all and needs the safe room', () => {
  const level = arena(12, 6);
  const hero = playerAt(2, 2, 'warlock');
  world.addComponent(hero, 'playerSlot', 'host');
  hero.spellbook.recovery[0] = 40;
  hero.health.current = 10;
  hero.playerStats.level = 4;
  hero.playerStats.hitDice = 0;
  const rest = (kind) => { Rest.queueRestRequest('host', kind); tickParty(level); };
  rest('short');
  assert.deepEqual(hero.spellbook.recovery, Array(20).fill(0), 'one for each quick-bar square');
  assert.equal(Party.currentParty().shortRestsLeft, 1);
  assert.equal(Party.currentParty().notice.notice, 'short_done');
  assert.equal(hero.health.current, 10, 'a short rest heals nothing by itself');
  rest('short');
  rest('short');
  assert.equal(Party.currentParty().notice.notice, 'no_short_left');
  rest('long');
  assert.equal(Party.currentParty().notice.notice, 'unsafe');
  level.markSafeZone(2, 2);
  rest('long');
  assert.equal(Party.currentParty().notice.notice, 'long_done');
  assert.equal(hero.health.current, hero.health.max);
  assert.equal(hero.playerStats.hitDice, 2, 'half the level back');
  assert.equal(Party.currentParty().shortRestsLeft, Rest.SHORT_RESTS_PER_LONG_REST);
  const goblin = mobAt(level, 'goblin', 8, 3);
  engage(goblin, hero, 0);
  rest('short');
  assert.equal(Party.currentParty().notice.notice, 'hunted');
  for (let i = 0; i <= Party.NOTICE_TICKS; i++) tickParty(level);
  assert.equal(Party.currentParty().notice, null, 'the notice goes after a while');
});

test('in co-op a rest waits for every companion to agree; one refusal calls it off', () => {
  const level = arena(12, 6);
  const host = playerAt(2, 2, 'warlock');
  world.addComponent(host, 'playerSlot', 'host');
  world.addComponent(host, 'playerName', 'Ana');
  const guest = playerAt(3, 2, 'bard');
  world.addComponent(guest, 'playerSlot', 'p2');
  world.addComponent(guest, 'playerName', 'Bo');
  host.spellbook.recovery[1] = 30;
  Rest.queueRestRequest('host', 'short');
  tickParty(level);
  const state = Party.currentParty();
  assert.deepEqual(state.vote.agreed, ['host']);
  assert.equal(state.notice.notice, 'asked');
  assert.equal(state.notice.name, 'Ana');
  assert.equal(host.spellbook.recovery[1] > 0, true, 'not yet');
  handleGuestCommand('p2', { kind: 'vote_answer', agree: true });
  tickParty(level);
  assert.equal(state.vote, null);
  assert.equal(state.notice.notice, 'short_done');
  assert.equal(host.spellbook.recovery[1], 0);

  handleGuestCommand('p2', { kind: 'rest', rest: 'short' });
  tickParty(level);
  Party.queueAnswer('host', false);
  tickParty(level);
  assert.equal(state.vote, null);
  assert.equal(state.notice.notice, 'declined');
  assert.equal(state.notice.name, 'Ana');
  assert.equal(state.shortRestsLeft, 1, 'the refused rest was not taken');

  const sent = JSON.parse(JSON.stringify(captureWorld(false, 7)));
  validateNetState(sent);
  assert.ok(sent.entities.some((e) => e.data.party), 'guests see the rest state');
  const tamper = (edit) => {
    const copy = JSON.parse(JSON.stringify(sent));
    edit(copy.entities);
    return attempt(() => validateNetState(copy)).ok;
  };
  assert.equal(tamper((es) => { es.find((e) => e.data.party).data.party.vote = { kind: 'nap', by: 'host', agreed: [], ticks: 1 }; }), false);
  assert.equal(tamper((es) => { es.find((e) => e.data.party).data.party.notice.name = '<b>'; }), false);
  assert.equal(tamper((es) => { es.find((e) => e.data.playerSlot === 'p2').data.spellbook.recovery = [-1]; }), false);
  assert.equal(tamper((es) => { es.find((e) => e.data.playerSlot === 'p2').data.spellbook.recovery = Array(20).fill(0); }), true,
    'one recovery a quick-bar square');
  assert.equal(tamper((es) => { es.find((e) => e.data.playerSlot === 'p2').data.spellbook.recovery = Array(21).fill(0); }), false);
  assert.equal(tamper((es) => { es.find((e) => e.data.playerSlot === 'p2').data.playerInput.spellSlot = 20; }), false);
  assert.equal(tamper((es) => { es.find((e) => e.data.playerSlot === 'p2').data.casting = { ticks: 1, dirX: 1, dirY: 0, released: false, spell: 'wish' }; }), false);
});

test('experience by the SRD: kills give their challenge rating\'s XP, and 300 reaches level 2 with another hit die', () => {
  assert.equal(levelForXp(299), 1);
  assert.equal(levelForXp(300), 2);
  assert.equal(levelForXp(355000), 20);
  assert.equal(nextLevelXp(1), 300);
  assert.equal(nextLevelXp(20), null);
  const level = arena(14, 6);
  const hero = playerAt(2, 2);
  const maxBefore = hero.health.max;
  for (let i = 0; i < 6; i++) {
    const goblin = mobAt(level, 'goblin', 5 + i, 3);
    goblin.health.current = 0;
    updateDeath(level);
  }
  assert.equal(hero.playerStats.exp, 300, 'six goblins at 50 XP each');
  assert.equal(hero.playerStats.level, 2);
  assert.equal(hero.playerStats.hitDice, 2);
  // The Fighter's d10 at its average (6) + CON +2, at five hit points a tabletop point.
  assert.equal(hero.health.max, maxBefore + 8, "a d10's average 6 + CON +2");
  assert.equal(hero.health.current, hero.health.max);
});

// ── Class progression: what each level hands out ─────────────────────────────

test('progression: a class hands out its features, spells and choices by level, and the file is checked', async () => {
  const { CLASSES, heroGains } = await load('rules/Classes');
  const { readProgression, gainsAt } = await load('rules/Progression');
  assert.equal(heroGains(CLASSES.fighter, 1).fightingStyle, true, 'a fighter offers a style from level 1');
  assert.equal(heroGains(CLASSES.wizard, 1).fightingStyle, false);
  assert.equal(heroGains(CLASSES.fighter, 3).improvements, 0);
  assert.equal(heroGains(CLASSES.fighter, 4).improvements, 1);
  assert.equal(heroGains(CLASSES.fighter, 20).improvements, 7, 'levels 4, 6, 8, 12, 14, 16 and 19');
  assert.equal(heroGains(CLASSES.rogue, 20).improvements, 6, 'levels 4, 8, 10, 12, 16 and 19');
  assert.equal(heroGains(CLASSES.cleric, 20).improvements, 5);
  const flat = readProgression('t', { 4: [{ ability: 'wisdom', amount: 2 }] });
  assert.equal(gainsAt(flat, 4).abilityBonus.wisdom, 2, 'a fixed bonus');
  assert.throws(() => readProgression('t', { 4: [{ spell: 'wish' }] }), 'an unknown reward stops the game');
  assert.throws(() => readProgression('t', { 21: [] }), 'a level past 20');
  const hero = createPlayer(centre(2), centre(2), 'fighter');
  const { characterSheet } = await load('rules/CharacterSheet');
  hero.playerStats.level = 4;
  assert.equal(characterSheet(hero).proficiency, 2);
  hero.playerStats.level = 5;
  assert.equal(characterSheet(hero).proficiency, 3);
});

test('progression: spells are learnt at their level, features arrive with theirs', async () => {
  const { CLASSES, hasFeature, spellLevelFor } = await load('rules/Classes');
  assert.deepEqual([...CLASSES.wizard.spells], ['fire_bolt', 'ray_of_frost', 'magic_missile', 'burning_hands', 'chromatic_orb', 'thunderwave']);
  assert.equal(spellLevelFor(CLASSES.wizard, 'fire_bolt'), 1);
  assert.equal(spellLevelFor(CLASSES.wizard, 'chromatic_orb'), 2);
  assert.equal(spellLevelFor(CLASSES.wizard, 'thunderwave'), 3);
  assert.deepEqual([...CLASSES.fighter.spells], []);
  assert.equal(hasFeature(CLASSES.warlock, 'agonizing_blast', 1), false);
  assert.equal(hasFeature(CLASSES.warlock, 'agonizing_blast', 2), true);
  assert.deepEqual([...CLASSES.bard.features], [], 'a bard has nothing at level 1 but spells');
  assert.deepEqual([...CLASSES.cleric.features], ['disciple_of_life']);
});

test('progression: Sneak Attack gains a d6 every two levels, Jack of All Trades and the Alert feat add to initiative', async () => {
  const { CLASSES } = await load('rules/Classes');
  const { characterSheet, weaponAttack } = await load('rules/CharacterSheet');
  const { formatDamage } = await load('rules/Dice');
  const { readProgression } = await load('rules/Progression');
  const mods = { strength: 0, dexterity: 2, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 };
  const dagger = { primary: { type: 'weapon', name: 'd', value: 1, gear: 'weapon', base: 'dagger' } };
  const dice = (level) => formatDamage(weaponAttack(dagger, mods, level, CLASSES.rogue).damage, weaponAttack(dagger, mods, level, CLASSES.rogue).extra);
  assert.equal(dice(1), '1d4 + 1d6 + 2');
  assert.equal(dice(2), '1d4 + 1d6 + 2');
  assert.equal(dice(3), '1d4 + 2d6 + 2');
  assert.equal(dice(20), '1d4 + 10d6 + 2');
  const bard = createPlayer(centre(2), centre(2), 'bard');
  assert.equal(characterSheet(bard).initiative, 2, 'DEX +2 at level 1');
  bard.playerStats.level = 2;
  assert.equal(characterSheet(bard).initiative, 3, 'Jack of All Trades: half of +2');
  bard.playerStats.level = 5;
  assert.equal(characterSheet(bard).initiative, 3, 'half of +3, rounded down: +1');
  const rogue = createPlayer(centre(2), centre(2), 'rogue');
  const original = CLASSES.rogue.progression;
  CLASSES.rogue.progression = readProgression('t', { 1: [{ feat: 'alert' }] });
  try {
    assert.equal(characterSheet(rogue).initiative, 3 + 5, 'DEX +3, Alert +5');
  } finally {
    CLASSES.rogue.progression = original;
  }
});

test('progression: Tough adds its hit points each level, and for every level already gained when taken', async () => {
  const { CLASSES } = await load('rules/Classes');
  const { hitPointsPerLevel, startingHitPoints } = await load('rules/HitPoints');
  const { readProgression } = await load('rules/Progression');
  assert.equal(startingHitPoints(10, 15), 12);
  assert.equal(startingHitPoints(6, 15), 8);
  assert.equal(startingHitPoints(6, 3), 2, 'CON -4 still leaves the die');
  const tough = { ...CLASSES.fighter, progression: readProgression('t', { 4: [{ feat: 'tough' }] }) };
  const plain = hitPointsPerLevel(CLASSES.fighter, 2, 3);
  assert.equal(plain, 5 + 1 + 2, 'a d10 at its average 6, plus CON');
  assert.equal(hitPointsPerLevel(tough, 2, 3), plain, 'before the feat');
  assert.equal(hitPointsPerLevel(tough, 2, 4), plain + 2 * 4, 'taken at level 4: 2 for each of the four levels');
  assert.equal(hitPointsPerLevel(tough, 2, 5), plain + 2, '2 more every level after');
});

// ── Character customisation: point buy, fighting styles, Improvements, Protection ─

test('point buy: 27 points, scores 8 to 15, a human\'s +1 on top, and the class defaults are a valid buy', async () => {
  const PointBuy = await load('rules/PointBuy');
  const { CLASSES } = await load('rules/Classes');
  const { newBuild, validScores } = await load('rules/Build');
  assert.deepEqual([8, 9, 10, 11, 12, 13, 14, 15].map(PointBuy.scoreCost), [0, 1, 2, 3, 4, 5, 7, 9]);
  assert.equal(PointBuy.scoreCost(7), null);
  assert.equal(PointBuy.scoreCost(16), null);
  const all8 = { strength: 8, dexterity: 8, constitution: 8, intelligence: 8, wisdom: 8, charisma: 8 };
  assert.equal(PointBuy.pointsLeft(all8), 27);
  assert.equal(PointBuy.canLower(all8, 'strength'), false);
  assert.equal(PointBuy.canRaise({ ...all8, strength: 15, dexterity: 15, constitution: 15 }, 'wisdom'), false, 'out of points');
  assert.equal(PointBuy.validPointBuy({ ...all8, strength: 15, dexterity: 15, constitution: 15 }), true, '9 + 9 + 9');
  assert.equal(PointBuy.validPointBuy({ ...all8, strength: 15, dexterity: 15, constitution: 15, wisdom: 9 }), false, 'over the budget');
  for (const id of ['fighter', 'wizard', 'rogue', 'warlock', 'bard', 'fighter2', 'cleric']) {
    const build = newBuild(CLASSES[id]);
    assert.equal(PointBuy.pointsLeft(build.scores), 0, `${id}: the standard array costs exactly 27`);
    assert.equal(validScores(build.scores), true);
  }
  assert.equal(newBuild(CLASSES.fighter).scores.strength, 15, 'the +1 of a human is not part of the buy');
});

test('customising: the hero buys scores and picks a fighting style in the first safe room, and it is final once they leave', async () => {
  const { applyCustomization, updateBuildLock } = await load('game/Customize');
  const { characterSheet } = await load('rules/CharacterSheet');
  const { run } = await load('game/Run');
  const level = arena(10, 6);
  level.markSafeZone(2, 2);
  const hero = createPlayer(centre(2), centre(2), 'fighter');
  const bought = { strength: 15, dexterity: 13, constitution: 15, intelligence: 8, wisdom: 8, charisma: 8 };
  assert.equal(applyCustomization(hero, { kind: 'scores', scores: bought }), true);
  const sheet = characterSheet(hero);
  assert.equal(sheet.scores.constitution, 16, 'bought 15 + the human\'s 1');
  assert.equal(hero.health.max, 10 + 3, 'hit points follow the new CON +3');
  assert.equal(applyCustomization(hero, { kind: 'scores', scores: { ...bought, wisdom: 15 } }), false, 'more than 27 points');
  assert.equal(applyCustomization(hero, { kind: 'fighting_style', style: 'dueling' }), true);
  assert.equal(applyCustomization(hero, { kind: 'fighting_style', style: 'archery' }), true, 'it may be changed while in the room');
  assert.equal(hero.build.fightingStyle, 'archery');
  const caster = createPlayer(centre(2), centre(2), 'wizard');
  assert.equal(applyCustomization(caster, { kind: 'fighting_style', style: 'defense' }), false, 'a wizard has no fighting style');
  run.depth = 1;
  updateBuildLock(level);
  assert.equal(hero.build.locked, false, 'still in the safe room');
  hero.position.x = centre(6);
  updateBuildLock(level);
  assert.equal(hero.build.locked, true, 'left it');
  assert.equal(applyCustomization(hero, { kind: 'scores', scores: bought }), false);
  assert.equal(applyCustomization(hero, { kind: 'fighting_style', style: 'defense' }), false);
  assert.equal(hero.build.fightingStyle, 'archery');
  const idle = createPlayer(centre(2), centre(2), 'fighter');
  idle.position.x = centre(6);
  updateBuildLock(level);
  assert.equal(idle.build.fightingStyle, 'defense', 'a fighter who never chose gets Defense');
});

test('fighting styles: Archery, Defense, Dueling and Great Weapon Fighting change the blow and the armour', async () => {
  const { weaponAttack, armorClass } = await load('rules/CharacterSheet');
  const { CLASSES } = await load('rules/Classes');
  const { rollDice, dice } = await load('rules/Dice');
  const mods = { strength: 3, dexterity: 2, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 };
  const weapon = (base) => ({ type: 'weapon', name: base, value: 1, gear: 'weapon', base });
  const shield = { type: 'shield', name: 's', value: 1, gear: 'offhand', base: 'shield' };
  const attack = (equipped, style) => weaponAttack(equipped, mods, 1, CLASSES.fighter, true, style);
  assert.equal(attack({ primary: weapon('longbow') }, 'archery').attackBonus, attack({ primary: weapon('longbow') }, null).attackBonus + 2, 'Archery: +2 to hit at range');
  assert.equal(attack({ primary: weapon('longsword') }, 'archery').attackBonus, attack({ primary: weapon('longsword') }, null).attackBonus, 'not in melee');
  const sword = { primary: weapon('longsword'), secondary: shield };
  assert.equal(attack(sword, 'dueling').damage.bonus, attack(sword, null).damage.bonus + 2, 'Dueling: one-handed with a shield');
  assert.equal(attack({ primary: weapon('longsword') }, 'dueling').damage.bonus, attack({ primary: weapon('longsword') }, null).damage.bonus, 'a versatile sword held in both hands is not one-handed');
  assert.equal(attack({ primary: weapon('shortsword') }, 'dueling').damage.bonus, attack({ primary: weapon('shortsword') }, null).damage.bonus + 2, 'a one-handed sword with the other hand empty');
  assert.equal(attack({ primary: weapon('shortsword'), secondary: weapon('dagger') }, 'dueling').damage.bonus, attack({ primary: weapon('shortsword') }, null).damage.bonus, 'no other weapon');
  assert.equal(attack({ primary: weapon('greatsword') }, 'great_weapon_fighting').rerollBelow, 2);
  assert.equal(attack({ primary: weapon('longsword') }, 'great_weapon_fighting').rerollBelow, 2, 'a versatile weapon in both hands');
  assert.equal(attack(sword, 'great_weapon_fighting').rerollBelow, undefined, 'not with a shield');
  assert.equal(attack({ primary: weapon('longbow') }, 'great_weapon_fighting').rerollBelow, undefined, 'not at range');
  const rolls = [1, 5, 6];
  assert.equal(rollDice(dice(2, 6), false, () => rolls.shift(), 2), 5 + 6, 'the 1 is rolled again (a 5) and the 6 stays');
  const unlucky = [2, 1, 4];
  assert.equal(rollDice(dice(1, 6), false, () => unlucky.shift(), 2), 1, 'the new roll stands even when it is worse');
  const breastplate = { armor: { type: 'armor', name: 'b', value: 1, gear: 'armor', base: 'breastplate' } };
  assert.equal(armorClass(breastplate, mods, CLASSES.fighter, 'defense').total, armorClass(breastplate, mods, CLASSES.fighter, null).total + 1);
  assert.equal(armorClass({}, mods, CLASSES.fighter, 'defense').total, armorClass({}, mods, CLASSES.fighter, null).total, 'no armour, no bonus');
});

test('Ability Score Improvements: a level offers one, taken as two points or a feat, once and for good', async () => {
  const { CLASSES } = await load('rules/Classes');
  const Build = await load('rules/Build');
  const { characterSheet } = await load('rules/CharacterSheet');
  const hero = createPlayer(centre(2), centre(2), 'fighter');
  const { build } = hero;
  const cls = CLASSES.fighter;
  assert.equal(Build.improvementsPending(cls, 3, build), 0, 'nothing before level 4');
  assert.equal(Build.improvementsPending(cls, 4, build), 1);
  assert.equal(Build.improvementsPending(cls, 6, build), 2, 'a fighter has another at level 6');
  assert.equal(Build.improvementsPending(CLASSES.wizard, 6, createPlayer(centre(2), centre(2), 'wizard').build), 1, 'a wizard does not');
  assert.equal(Build.takeImprovement(cls, build, 3, { stats: { strength: 2 } }), false, 'too early');
  assert.equal(Build.takeImprovement(cls, build, 4, { stats: { strength: 3 } }), false, 'three points');
  assert.equal(Build.takeImprovement(cls, build, 4, { stats: { strength: 1 } }), false, 'one point');
  assert.equal(Build.takeImprovement(cls, build, 4, { stats: { strength: 2 } }), true);
  hero.playerStats.level = 4;
  assert.equal(characterSheet(hero).scores.strength, 18);
  assert.equal(Build.takeImprovement(cls, build, 4, { stats: { strength: 2 } }), false, 'only one on offer');
  assert.equal(Build.takeImprovement(cls, build, 6, { stats: { strength: 2 } }), true, 'STR 18 to 20');
  assert.equal(Build.improvementsPending(cls, 8, build), 1);
  assert.equal(Build.takeImprovement(cls, build, 8, { stats: { strength: 1, dexterity: 1 } }), false, 'STR 20 is the cap');
  assert.equal(Build.takeImprovement(cls, build, 8, { stats: { dexterity: 1, wisdom: 1 } }), true, 'two abilities, one point each');
  assert.equal(Build.takeImprovement(cls, build, 12, { feat: 'alert' }), true, 'a feat in place of the points');
  assert.equal(Build.hasFeat(cls, 12, build, 'alert'), true);
  hero.playerStats.level = 12;
  assert.equal(characterSheet(hero).initiative, 2 + 5, 'DEX 15 (+2) and Alert +5');
  assert.equal(Build.takeImprovement(cls, build, 16, { feat: 'alert' }), false, 'a feat only once');
  assert.equal(Build.takeImprovement(cls, build, 16, { feat: 'wish' }), false);
});

test('Protection: a hero with the style and a shield spoils an attack on the nearest ally, then needs 5 seconds', async () => {
  const { protectFrom, updateProtection, canProtect, protectedAlly } = await load('systems/ProtectionSystem');
  const { PROTECTION_COOLDOWN_TICKS } = await load('rules/FightingStyles');
  const shield = { type: 'shield', name: 's', value: 1, gear: 'offhand', base: 'shield' };
  const hero = createPlayer(centre(2), centre(2), 'fighter');
  const near = createPlayer(centre(3), centre(2), 'wizard');
  const nearer = createPlayer(centre(2) + 20, centre(2), 'bard');
  const far = createPlayer(centre(8), centre(2), 'rogue');
  hero.build.fightingStyle = 'protection';
  assert.equal(canProtect(hero), false, 'no shield');
  hero.equipped = { secondary: shield };
  assert.equal(canProtect(hero), true);
  assert.equal(protectedAlly(hero), nearer, 'the closest ally');
  assert.equal(protectFrom(far), false, 'an ally out of reach');
  assert.equal(protectFrom(near), false, 'not the closest one');
  assert.equal(protectFrom(nearer), true);
  assert.equal(hero.protectCooldown, PROTECTION_COOLDOWN_TICKS);
  assert.equal(protectFrom(nearer), false, 'recovering');
  for (let i = 0; i < PROTECTION_COOLDOWN_TICKS; i++) updateProtection();
  assert.equal(hero.protectCooldown, 0);
  assert.equal(protectFrom(nearer), true, 'ready again');
  assert.equal(protectFrom(hero), false, 'it does not protect its own owner');
  hero.build.fightingStyle = 'defense';
  hero.protectCooldown = 0;
  assert.equal(protectFrom(nearer), false, 'another style');
});

test('Protection makes an enemy\'s strike on the ally roll with disadvantage', async () => {
  const { updateContactDamage } = await load('systems/CombatSystem');
  const level = arena(10, 6);
  const shield = { type: 'shield', name: 's', value: 1, gear: 'offhand', base: 'shield' };
  const hero = createPlayer(centre(2), centre(2), 'fighter');
  hero.build.fightingStyle = 'protection';
  hero.equipped = { secondary: shield };
  const ally = createPlayer(centre(3), centre(2), 'wizard');
  const orc = mobAt(level, 'orc', 3.6, 2);
  const d20s = [];
  useDieRoller((sides) => { if (sides === 20) d20s.push(1); return sides === 20 ? 15 : 1; });
  beginPerception();
  for (let t = 0; t < 120 && !d20s.length; t++) updateContactDamage(level);
  assert.equal(d20s.length, 2, 'two d20s: disadvantage');
  assert.equal(hero.protectCooldown > 0, true);
  assert.ok(hero.rollLog.some((l) => l.text === 'PROTECTION'), 'said over the protector');
  assert.ok(orc.health.current > 0 && ally.health.max > 0);
});

test('a build crosses the network checked: scores, style and Improvements', async () => {
  const { validBuild, validImprovement } = await load('rules/Build');
  const { validCommand } = await load('network/protocol');
  const good = { scores: { strength: 15, dexterity: 13, constitution: 14, intelligence: 8, wisdom: 12, charisma: 10 }, locked: false, improvements: [] };
  assert.equal(validBuild(good), true);
  assert.equal(validBuild({ ...good, fightingStyle: 'protection' }), true);
  assert.equal(validBuild({ ...good, fightingStyle: 'smiting' }), false);
  assert.equal(validBuild({ ...good, scores: { ...good.scores, strength: 18 } }), false, 'not a point buy');
  assert.equal(validBuild({ ...good, scores: { ...good.scores, strength: 15, dexterity: 15, constitution: 15 } }), false, 'over 27 points');
  assert.equal(validBuild({ ...good, improvements: [{ stats: { strength: 2 } }, { feat: 'tough' }] }), true);
  assert.equal(validBuild({ ...good, improvements: [{ stats: { strength: 5 } }] }), false);
  assert.equal(validBuild({ ...good, improvements: [{ feat: 'wish' }] }), false);
  assert.equal(validImprovement({ stats: { strength: 1, wisdom: 1 } }), true);
  assert.equal(validImprovement({ stats: { strength: 1 } }), false);
  assert.equal(validCommand({ kind: 'fighting_style', style: 'dueling' }), true);
  assert.equal(validCommand({ kind: 'fighting_style', style: 'dueling2' }), false);
  assert.equal(validCommand({ kind: 'scores', scores: good.scores }), true);
  assert.equal(validCommand({ kind: 'scores', scores: { ...good.scores, strength: 20 } }), false);
  assert.equal(validCommand({ kind: 'improve', improvement: { feat: 'alert' } }), true);
  assert.equal(validCommand({ kind: 'improve', improvement: { stats: { strength: 1 } } }), false);
  const hero = createPlayer(centre(2), centre(2), 'fighter');
  world.addComponent(hero, 'playerSlot', 'host');
  const state = JSON.parse(JSON.stringify(captureWorld(false, 3)));
  validateNetState(state);
  const data = state.entities.find((e) => e.data.playerSlot === 'host');
  assert.ok(data.data.build, 'the build is sent');
  data.data.build.scores.strength = 99;
  assert.equal(attempt(() => validateNetState(state)).ok, false, 'a tampered build is refused');
});

test('the level log: each level knows whether it has a choice, and Save makes the starting ones final early', async () => {
  const { CLASSES } = await load('rules/Classes');
  const Build = await load('rules/Build');
  const { applyCustomization } = await load('game/Customize');
  const { validCommand } = await load('network/protocol');
  const fighter = CLASSES.fighter;
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map((level) => Build.improvementIndexAt(fighter, level)), [-1, -1, -1, 0, -1, 1, -1, 2]);
  const hero = createPlayer(centre(2), centre(2), 'fighter');
  const { build } = hero;
  assert.equal(Build.levelHasChoice(fighter, 1, build), true, 'the starting scores');
  assert.equal(Build.levelHasChoice(fighter, 2, build), false);
  assert.equal(Build.hasChoices(fighter, 1, build), true);
  assert.equal(applyCustomization(hero, { kind: 'lock_build' }), false, 'a fighter must pick a fighting style first');
  assert.equal(build.locked, false);
  applyCustomization(hero, { kind: 'fighting_style', style: 'dueling' });
  assert.equal(applyCustomization(hero, { kind: 'lock_build' }), true, 'saved before leaving the room');
  assert.equal(build.locked, true);
  assert.equal(applyCustomization(hero, { kind: 'lock_build' }), false, 'only once');
  assert.equal(applyCustomization(hero, { kind: 'fighting_style', style: 'archery' }), false);
  assert.equal(Build.levelHasChoice(fighter, 1, build), false);
  assert.equal(Build.hasChoices(fighter, 3, build), false);
  assert.equal(Build.levelHasChoice(fighter, 4, build), true, 'level 4 offers an Improvement');
  assert.equal(Build.hasChoices(fighter, 5, build), true, 'and it is still waiting at level 5');
  Build.takeImprovement(fighter, build, 4, { feat: 'tough' });
  assert.equal(Build.hasChoices(fighter, 5, build), false);
  const wizard = createPlayer(centre(2), centre(2), 'wizard');
  assert.equal(applyCustomization(wizard, { kind: 'lock_build' }), true, 'a class without a style can save at once');
  assert.equal(validCommand({ kind: 'lock_build' }), true);
});

// ── The party's lever, loot rolls, stashes, gifts and the console ────────────

const { updateLevers } = await load('systems/LeverSystem');
const { updateDoors, GATE_CLOSE_TICKS, gateCountdown } = await load('systems/DoorSystem');
const LootRoll = await load('game/LootRoll');
const { runCommand } = await load('game/Console');
const { updateStashes } = await load('systems/StashSystem');
const { createStash } = await load('entities/DungeonFactory');
const { hurtPlayer } = await load('systems/CombatSystem');

/** A player in a seat, with a name. */
function seated(tx, ty, slot, name) {
  const player = playerAt(tx, ty);
  world.addComponent(player, 'playerSlot', slot);
  world.addComponent(player, 'playerName', name);
  return player;
}

test('in co-op the lever asks the others first; once all agree the gate opens and shuts after 10 s on whoever stayed inside', () => {
  const { level } = buildDungeon(777, true);
  const door = world.entities.find((e) => e.door);
  const lever = world.entities.find((e) => e.lever);
  const ana = seated(0, 0, 'host', 'Ana');
  const bo = seated(0, 0, 'p2', 'Bo');
  ana.position.x = lever.position.x + 6;
  ana.position.y = lever.position.y;
  bo.position.x = lever.position.x + 10;
  bo.position.y = lever.position.y;
  const pull = () => { ana.playerInput.intents.use = true; beginPerception(); resolveUses(); Party.updateParty(); updateLevers(level); ana.playerInput.intents.use = false; };
  pull();
  assert.equal(lever.lever.pulled, false, 'not before Bo agrees');
  assert.equal(Party.currentParty().vote.kind, 'gate');
  pull();
  assert.ok(lever.rollLog.some((l) => l.text === 'Waiting for an answer...'), 'one pull at a time');
  Party.queueAnswer('p2', false);
  pull();
  assert.equal(Party.currentParty().notice.notice, 'declined');
  pull();
  assert.equal(Party.currentParty().vote, null, 'the lever rests a moment after a refusal');
  for (let i = 0; i < 200; i++) updateLevers(level);
  pull();
  Party.queueAnswer('p2', true);
  Party.updateParty();
  updateLevers(level);
  assert.equal(lever.lever.pulled, true, 'everyone agreed');
  assert.equal(door.door.locked, false);
  assert.equal(gateCountdown(), GATE_CLOSE_TICKS / 60);
  bo.position.x = door.door.boundaryX + 40;
  for (let t = 0; t < GATE_CLOSE_TICKS; t++) updateDoors(level);
  assert.equal(door.door.closed, true, 'shut at the end of the countdown');
  assert.equal(ana.health.current, 0, 'Ana stayed inside');
  assert.ok(bo.health.current > 0, 'Bo got out');
  assert.equal(gateCountdown(), null);
});

test('a rare find in co-op is rolled for: Need rolls a d20, ties roll again, the winner gets it; nobody needing it, it is gone', () => {
  const ana = seated(2, 2, 'host', 'Ana');
  const bo = seated(3, 2, 'p2', 'Bo');
  const cy = seated(4, 2, 'p3', 'Cy');
  for (const p of [ana, bo, cy]) p.inventory = [];
  const sword = { ...WEAPONS.find((w) => (w.bonus ?? 0) >= 2), weight: 1 };
  assert.equal(LootRoll.offerLoot({ ...sword, bonus: 0 }), false, 'a common find just drops');
  assert.equal(LootRoll.offerLoot(sword), true);
  const roll = world.entities.find((e) => e.lootRoll).lootRoll;
  LootRoll.chooseLoot('host', roll.id, true);
  handleGuestCommand('p2', { kind: 'loot', roll: roll.id, need: true });
  LootRoll.chooseLoot('p3', roll.id, false);
  // Ana and Bo tie on 12; rolling again, the second of them to roll gets the 17.
  const d20s = [12, 12, 5, 17];
  useDieRoller((sides) => (sides === 20 ? d20s.shift() : sides));
  LootRoll.updateLootRolls();
  const lines = currentLog().entries.filter((e) => e.result === 'need' || e.result === 'won');
  assert.deepEqual(lines.map((e) => [e.result, e.total]), [['need', 12], ['need', 12], ['need', 5], ['need', 17], ['won', 0]]);
  assert.deepEqual(lines.slice(0, 2).map((e) => e.name).sort(), ['Ana', 'Bo'], 'Cy passed');
  const winner = lines[3].name === 'Ana' ? ana : bo;
  assert.equal(lines[4].name, lines[3].name, 'the 17 wins');
  assert.equal(winner.inventory.filter(Boolean).length, 1, 'into the winner\'s bag');
  assert.equal([ana, bo, cy].reduce((n, p) => n + p.inventory.filter(Boolean).length, 0), 1, 'and nobody else\'s');
  assert.ok(world.entities.find((e) => e.lootRoll).removed);

  LootRoll.offerLoot(sword);
  const second = world.entities.filter((e) => e.lootRoll && !e.removed).at(-1);
  for (let t = 0; t < LootRoll.LOOT_ROLL_TICKS; t++) LootRoll.updateLootRolls();
  assert.ok(second.removed, 'no answer in 30 s counts as a Pass: gone');
  assert.equal(winner.inventory.filter(Boolean).length, 1);

  const sent = JSON.parse(JSON.stringify(captureWorld(false, 7)));
  LootRoll.offerLoot(sword);
  const withRoll = JSON.parse(JSON.stringify(captureWorld(false, 7)));
  validateNetState(withRoll);
  const tampered = JSON.parse(JSON.stringify(withRoll));
  tampered.entities.find((e) => e.data.lootRoll).data.lootRoll.choices = { p9: 'need' };
  assert.equal(attempt(() => validateNetState(tampered)).ok, false, 'only real seats choose');
  assert.ok(sent.entities.length < withRoll.entities.length);
});

test('barrels, crates, coffins, urns and sacks can be searched: E (in reach) opens one, once; most are empty', async () => {
  const { isOpenable } = await load('entities/DungeonFactory');
  const { stashCoins } = await load('entities/LootFactory');
  for (const kind of ['barrel', 'crate', 'coffin', 'sarcophagus', 'urn', 'sack', 'supplies_jar']) assert.ok(isOpenable(kind), kind);
  for (const kind of ['banner_red', 'bowl_apples', 'urn_broken', 'coffin_open', 'shelf_goods', 'cauldron']) assert.equal(isOpenable(kind), false, kind);
  assert.equal(createStash({ kind: 'banner_red', tx: 3, ty: 3 }), null, 'a banner holds nothing to find');
  const finds = Array.from({ length: 2000 }, () => stashCoins());
  const empty = finds.filter((c) => c === 0).length;
  assert.ok(empty > 1100 && empty < 1500, `${empty} of 2000 empty`);
  assert.ok(finds.every((c) => c >= 0 && c <= 40), 'at most 2d20');
  const finder = playerAt(3, 3);
  const full = createStash({ kind: 'barrel', tx: 3, ty: 3 });
  full.stash.coins = 12;
  const before = finder.playerStats.gold;
  finder.playerInput.intents.use = true;
  beginPerception();
  resolveUses();
  updateStashes();
  assert.equal(finder.playerStats.gold, before + 12);
  assert.ok(full.removed);
  const bare = createStash({ kind: 'crate', tx: 3, ty: 3 });
  bare.stash.coins = 0;
  finder.playerInput.intents.use = true;
  beginPerception();
  resolveUses();
  updateStashes();
  assert.ok(bare.removed, 'searched');
  assert.equal(finder.playerStats.gold, before + 12, 'nothing in it');
  assert.equal(finder.rollLog.at(-1).text, 'Empty');
});

test('the inventory sends an item to another player, into their bag', () => {
  const ana = seated(2, 2, 'host', 'Ana');
  const bo = seated(3, 2, 'p2', 'Bo');
  const dagger = { ...WEAPONS[0], weight: 1 };
  ana.inventory = [dagger];
  bo.inventory = [];
  bo.equipped = {};
  assert.equal(validCommand({ kind: 'give', from: { bag: 0 }, to: 'host' }), true);
  assert.equal(validCommand({ kind: 'give', from: { slot: 'hat' }, to: 'host' }), false);
  assert.equal(PlayerActions.giveItem(ana, { bag: 0 }, 'p2'), true);
  assert.equal(ana.inventory.filter(Boolean).length, 0);
  assert.equal(bo.inventory[0].name, dagger.name);
  handleGuestCommand('p2', { kind: 'give', from: { bag: 0 }, to: 'host' });
  assert.equal(ana.inventory[0].name, dagger.name, 'and back, asked by the guest');
  assert.equal(PlayerActions.giveItem(ana, { bag: 3 }, 'p2'), false, 'nothing on that square');
});

test('the ~ console: money, god mode, experience and any item by its id; not in co-op', () => {
  const hero = playerAt(2, 2);
  hero.inventory = [];
  const run = (line) => runCommand(line, { player: hero, allowed: true });
  const gold = hero.playerStats.gold;
  run('/money 500');
  assert.equal(hero.playerStats.gold, gold + 500);
  run('/god on');
  const health = hero.health.current;
  hurtPlayer(hero, hero, 50);
  assert.equal(hero.health.current, health, 'no harm in god mode');
  run('/god off');
  assert.equal(hero.godMode, undefined);
  run('/xp 300');
  assert.equal(hero.playerStats.level, 2);
  const id = WEAPONS[1].id;
  run(`/addItem ${id.replace(/_/g, '-')}`);
  assert.equal(hero.inventory[0].id, id, 'ids in any case, with dashes');
  assert.match(run('/additem nothing_like_it')[0], /No item/);
  assert.ok(run('/items axe').length > 0);
  assert.match(run('money 5')[0], /slash/);
  assert.match(runCommand('/money 5', { player: hero, allowed: false })[0], /co-op/);
});

// ── Sound ────────────────────────────────────────────────────────────────────

const { sound } = await load('audio/SoundPlayer');
const { allClips, MUSIC_TRACKS, AMBIENCE } = await load('audio/SoundBank');
const { music } = await load('audio/MusicPlayer');
const { resetMusic, holdMusic, updateMusic } = await load('systems/MusicSystem');
const { updateFootsteps } = await load('systems/FootstepSystem');

/** Runs `play` and returns the names of the effects it sounded (as the co-op host would relay them). */
function soundsOf(play) {
  const heard = [];
  sound.onEffect = (name) => heard.push(name);
  try {
    play();
  } finally {
    sound.onEffect = null;
  }
  return heard;
}

test('sounds: every clip the effects play, every piece of music and every ambient bed is a file under public/', async () => {
  const { existsSync } = await import('node:fs');
  const files = new Set([...allClips().map((clip) => clip.file), ...Object.values(MUSIC_TRACKS).flatMap((track) => track.files),
    ...Object.values(AMBIENCE).flatMap((bed) => bed.takes)]);
  assert.deepEqual([...files].filter((file) => !existsSync(`public${file}`)), []);
});

test('sounds: an enemy cries as it swings; a blow turned aside is parried, or caught on a shield', () => {
  const shield = { type: 'shield', name: 's', value: 1, gear: 'offhand', base: 'shield' };
  const level = arena(12, 6);
  const player = playerAt(6, 3);
  mobAt(level, 'orc', 5.4, 3);
  useDieRoller(() => 1);
  player.equipped = {};
  beginPerception();
  const bare = soundsOf(() => { for (let t = 0; t < 120; t++) updateContactDamage(level); });
  assert.ok(bare.includes('soldier_attack'), 'an orc swings with the hollow soldier\'s cry');
  assert.ok(bare.includes('parry') && !bare.includes('shield_block'), 'without a shield the hero parries');
  player.equipped = { secondary: shield };
  const shielded = soundsOf(() => { for (let t = 0; t < 120; t++) updateContactDamage(level); });
  assert.ok(shielded.includes('shield_block') && !shielded.includes('parry'), 'with one the blow rings off it');
});

test('sounds: a critical hit cracks bone, and the enemy it leaves standing cries out', () => {
  const level = arena(12, 6);
  const player = playerAt(4, 2);
  player.aimVector = { x: 1, y: 0 };
  const troll = mobAt(level, 'troll', 4.8, 2);
  useDieRoller((sides) => (sides === 20 ? 20 : 1));
  player.playerInput.intents.attack = true;
  const heard = soundsOf(() => { updateSword(); updateSword(); });
  assert.ok(troll.health.current > 0);
  for (const name of ['sword_swing', 'critical', 'sword_hit', 'troll_hurt']) assert.ok(heard.includes(name), name);
});

test('music: exploring until enemies nearby engage; a great foe brings the boss music; the summary holds its own', () => {
  const level = arena(12, 6);
  const player = playerAt(3, 3);
  resetMusic();
  assert.equal(music.track, 'explore');
  const goblin = mobAt(level, 'goblin', 6, 3);
  goblin.ai.state = 'engage';
  beginPerception();
  updateMusic();
  assert.equal(music.track, 'combat', 'a goblin fight');
  const troll = mobAt(level, 'troll', 7, 3);
  troll.ai.state = 'engage';
  beginPerception();
  for (let t = 0; t < 30; t++) updateMusic();
  assert.equal(music.track, 'boss', 'a troll joins: the boss music');
  goblin.ai.state = 'idle';
  troll.ai.state = 'idle';
  for (let t = 0; t < 30; t++) updateMusic();
  assert.equal(music.track, 'boss', 'it lingers a while after the fight');
  for (let t = 0; t < 600; t++) updateMusic();
  assert.equal(music.track, 'explore', 'then exploring comes back');
  holdMusic('rest');
  troll.ai.state = 'engage';
  beginPerception();
  for (let t = 0; t < 60; t++) updateMusic();
  assert.equal(music.track, 'rest', 'the level\'s summary keeps its music');
  assert.ok(player);
});

test('sounds: a troll is heard walking; smaller enemies are not', () => {
  const level = arena(12, 6);
  const troll = mobAt(level, 'troll', 6, 3);
  const goblin = mobAt(level, 'goblin', 8, 3);
  const heard = soundsOf(() => {
    for (let t = 1; t <= 60; t++) {
      troll.walkTime = t;
      goblin.walkTime = t;
      updateFootsteps();
    }
  });
  assert.ok(heard.includes('troll_step'));
  assert.equal(heard.filter((name) => name !== 'troll_step').length, 0);
});

test('music: an enemy that keeps the hero in sight but never comes to blows is a stand-off, and exploring comes back', () => {
  const level = arena(12, 6);
  playerAt(3, 3);
  resetMusic();
  const troll = mobAt(level, 'troll', 7, 3);
  troll.ai.state = 'engage';
  beginPerception();
  for (let t = 0; t < 30; t++) updateMusic();
  assert.equal(music.track, 'boss', 'it comes for the hero');
  for (let t = 0; t < 30 * 40; t++) updateMusic();
  assert.equal(music.track, 'explore', 'no blow in a long while: back to exploring, though it still stares');
  troll.attackTime = 20;
  for (let t = 0; t < 30; t++) updateMusic();
  assert.equal(music.track, 'boss', 'it swings again: the fight is back');
});

test('wounds never close on their own: no regeneration, a new level is no heal, and neither is the next one', async () => {
  const { updateCombatTimers } = await load('systems/CombatSystem');
  const { grantExperience } = await load('systems/DeathSystem');
  startRun();
  const hero = playerAt(2, 2);
  const level = arena(10, 6);
  const goblin = mobAt(level, 'goblin', 6, 2);
  hero.health.current = hero.health.max - 10;
  goblin.health.current = goblin.health.max - 3;
  for (let t = 0; t < 3000; t++) updateCombatTimers();
  assert.equal(hero.health.current, hero.health.max - 10, 'the hero stays wounded');
  assert.equal(goblin.health.current, goblin.health.max - 3, 'and so does the goblin');
  const max = hero.health.max;
  grantExperience(hero, 300);
  assert.equal(hero.playerStats.level, 2);
  assert.equal(hero.health.max - max, hero.health.current - (max - 10), 'a new level adds its hit points, nothing more');
  assert.ok(hero.health.current < hero.health.max);
  const wounded = hero.health.current;
  descend();
  world.clear();
  const below = playerAt(2, 2);
  restorePlayer(below);
  assert.equal(below.health.current, wounded, 'the wounds come down to the next level');
  startRun();
});

test('the big glowing crystals are left out of the dungeon for now', () => {
  for (const seed of [1, 7, 42, 777, 31337]) {
    const { props } = new DungeonBuilder({ ...DEFAULT_CONFIG, seed }).build();
    assert.equal(props.filter((p) => p.kind.startsWith('gem_crystal')).length, 0, `seed ${seed}`);
  }
});

test('dropped items spread round the hero, one per spot and never into a wall; picking one up leaves the brackets on nothing', async () => {
  const { focusedEntity } = await load('systems/TargetSystem');
  const level = arena(12, 12);
  wallRect(level, 8, 1, 8, 10);
  const hero = playerAt(7, 5);
  const sword = { type: 'weapon', name: 'Sword', value: 1, gear: 'weapon', base: 'longsword', weight: 1 };
  for (let i = 0; i < 40; i++) setDown(hero, sword);
  updateInventory(level);
  const lying = world.entities.filter((e) => e.item);
  assert.equal(lying.length, 40);
  for (const a of lying) {
    assert.ok(level.canPass(a.position.x, a.position.y), 'on the floor, not in the wall');
    const crowd = lying.filter((b) => b !== a && Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) < 11);
    assert.equal(crowd.length, 0, 'each on a spot of its own');
  }
  hero.inventory = [];
  hero.playerInput.intents.use = true;
  beginPerception();
  resolveUses();
  updateInventory(level);
  assert.equal(world.entities.filter((e) => e.item && !e.removed).length, 39, 'E takes one');
  assert.equal(focusedEntity(), null, 'the brackets let go of what was taken');
});

test('the safe room shuts behind the party with its portcullis dropping back down, not a wall', async () => {
  const { updateLevers } = await load('systems/LeverSystem');
  const { updateDoors } = await load('systems/DoorSystem');
  const { level, layout } = buildDungeon(777, true);
  const door = world.entities.find((e) => e.door);
  const lever = world.entities.find((e) => e.lever);
  const hero = createPlayer(lever.position.x + 6, lever.position.y);
  hero.playerInput.intents.use = true;
  beginPerception();
  resolveUses();
  updateLevers(level);
  hero.playerInput.intents.use = false;
  for (let t = 0; t < 60; t++) updateDoors(level);
  hero.position.x = door.door.boundaryX + 40;
  updateDoors(level);
  assert.equal(door.door.closed, true);
  for (const t of layout.safeDoor.tiles) assert.equal(level.getTile(t.x, t.y).type, TileType.Obstacle, 'barred, drawn as floor');
  const gates = world.entities.filter((e) => e.gate && !e.removed);
  assert.equal(gates.length, layout.safeDoor.tiles.length, 'a portcullis on every doorway tile');
  assert.ok(gates.every((g) => g.gate.dropping && g.gate.lift === 1), 'up in the wall, about to drop');
  for (let t = 0; t < 30; t++) updateDoors(level);
  assert.ok(gates.every((g) => g.gate.lift === 0 && !g.gate.dropping && !g.removed), 'down and staying down');
});

// ── The spell lists, the quick bar's bindings and damage types ───────────────

const Spellbook = await load('rules/Spellbook');
const DamageTypes = await load('rules/DamageTypes');
const { bindSpell } = await load('game/PlayerActions');

test('every spell of the lists is read with a range, the classes that learn it and the hero level they do', () => {
  const spells = Object.values(Spellbook.CATALOG);
  assert.ok(spells.length > 400, 'the whole of the lists');
  for (const spell of spells) {
    assert.ok(Object.keys(spell.classes).length > 0, `${spell.id} is learnt by some class`);
    assert.ok(Object.values(spell.classes).every((level) => level >= 1 && level <= 20), `${spell.id} is learnt at a real hero level`);
  }
  const eldritch = Spellbook.CATALOG.eldritch_blast;
  assert.deepEqual([eldritch.range.feet, eldritch.range.px], [120, 1152], '5 feet are 48 px');
  assert.deepEqual(eldritch.classes, { warlock: 1 });
  assert.equal(Spellbook.CATALOG.cure_wounds.range.px, 48, 'touch is 5 feet');
  assert.ok(spells.every((s) => s.effect === null || s.effect.damageTypes.every(DamageTypes.isDamageType)));
  for (const id of Object.keys(SPELLS)) assert.ok(Spellbook.isCatalogSpell(id), `${id} is in the lists`);
});

test('every kind of damage is named, weapons and spells alike', () => {
  assert.equal(DamageTypes.DAMAGE_TYPES.length, 13);
  for (const type of ['bludgeoning', 'piercing', 'slashing', 'acid', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'poison', 'psychic', 'radiant', 'thunder']) {
    assert.ok(DamageTypes.isDamageType(type), type);
  }
  assert.equal(Spellbook.CATALOG.eldritch_blast.effect.damageTypes[0], 'force');
});

test('a cantrip grows with the hero level; a spell with the level it is cast at, and recovers more slowly', () => {
  const blast = Spellbook.CATALOG.eldritch_blast;
  const dice = (level) => Spellbook.spellDice(blast, 0, level).roll.count;
  assert.deepEqual([1, 4, 5, 10, 11, 16, 17, 20].map(dice), [1, 1, 2, 2, 3, 3, 4, 4], 'dice multiply at 5th, 11th and 17th level');
  const fireball = Spellbook.CATALOG.fireball;
  assert.equal(Spellbook.spellDice(fireball, 3, 5).roll.count, 8);
  assert.equal(Spellbook.spellDice(fireball, 5, 9).roll.count, 10, '1d6 more for each level above the third');
  assert.equal(Spellbook.cooldownSeconds('fireball', 3), 5, 'five seconds by default');
  assert.ok(Spellbook.cooldownSeconds('fireball', 5) > Spellbook.cooldownSeconds('fireball', 4));
});

test('a class opens spell levels as the tabletop rules give them', () => {
  const open = (cls, levels) => levels.map((level) => Spellbook.highestSpellLevel(cls, level));
  assert.deepEqual(open('bard', [1, 2, 3, 4, 5, 17]), [1, 1, 2, 2, 3, 9], 'a bard gets level 2 slots at 3 and level 3 slots at 5');
  assert.deepEqual(open('cleric', [1, 3, 5]), [1, 2, 3]);
  assert.deepEqual(open('warlock', [1, 3, 9, 20]), [1, 2, 5, 5], 'pact slots stop at 5th level');
  assert.equal(Spellbook.highestSpellLevel('fighter', 20), 0);
  const level1 = Spellbook.learntSpells('cleric', 1).map((list) => list.length);
  assert.ok(level1[0] > 0 && level1[1] > 0, 'a first-level cleric has cantrips and level 1 spells');
  assert.ok(level1.slice(2).every((n) => n === 0), 'and nothing higher');
  const bless = Spellbook.CATALOG.bless;
  assert.deepEqual(Spellbook.castLevels('cleric', 1, bless), [1]);
  assert.deepEqual(Spellbook.castLevels('cleric', 3, bless), [1, 2], 'a third-level cleric may bind Bless at level 2');
  assert.deepEqual(Spellbook.castLevels('cleric', 1, Spellbook.CATALOG.sacred_flame), [0], 'a cantrip has one level');
});

test('a hero binds only spells their class has learnt, at levels they can cast; a bound spell replaces the class order', () => {
  const cleric = createPlayer(0, 0, 'cleric');
  assert.deepEqual(Spellbook.quickBinding(cleric, 0), { spell: 'sacred_flame', level: 0 }, 'the class order until something is bound');
  assert.equal(bindSpell(cleric, 3, 'bless', 1), false, 'spells are prepared only in a safe room');
  cleric.inSafeRoom = true;
  assert.equal(bindSpell(cleric, 3, 'fireball', 3), false, 'a cleric does not learn Fireball');
  assert.equal(bindSpell(cleric, 3, 'bless', 2), false, 'no level 2 slots yet');
  assert.equal(bindSpell(cleric, 3, 'bless', 1), true);
  assert.deepEqual(Spellbook.quickBinding(cleric, 3), { spell: 'bless', level: 1 });
  assert.deepEqual(Spellbook.quickBinding(cleric, 0), { spell: 'sacred_flame', level: 0 }, 'the other squares keep theirs');
  cleric.playerStats.level = 3;
  assert.equal(bindSpell(cleric, 3, 'bless', 2), true);
  assert.equal(Spellbook.quickBinding(cleric, 3).level, 2);
  assert.equal(bindSpell(cleric, 13, 'bless', 1), true, 'the second row takes spells too');
  assert.equal(bindSpell(cleric, 20, 'bless', 1), false, 'there are twenty squares');
  assert.ok(validCommand({ kind: 'bind_spell', slot: 3, spell: 'bless', level: 2 }));
  assert.ok(!validCommand({ kind: 'bind_spell', slot: 3, spell: 'not_a_spell', level: 2 }));
  assert.ok(!validCommand({ kind: 'bind_spell', slot: 20, spell: 'bless', level: 2 }));
});

test('the quick bar\'s second row holds the hero\'s active class features until something else is bound there', () => {
  const fighter = createPlayer(0, 0, 'fighter');
  assert.deepEqual(Spellbook.quickBinding(fighter, 10), { spell: 'feature:second_wind', level: 0 });
  assert.equal(Spellbook.quickBinding(fighter, 11), null, 'Action Surge comes at level 2');
  fighter.playerStats.level = 2;
  assert.deepEqual(Spellbook.quickBinding(fighter, 11), { spell: 'feature:action_surge', level: 0 });
});

test('a spell cast at a higher level hits harder and recovers more slowly; a bound spell that is not worked yet casts nothing', () => {
  const level = arena(12, 6);
  const wizard = casterAt(2, 2, 'wizard', 0);
  wizard.playerStats.level = 5;
  assert.equal(bindSpell(wizard, 0, 'burning_hands', 3), true);
  cast(level, wizard, 1);
  const stretched = SPELLS.burning_hands.recoveryTicks + 2 * Spellbook.UPCAST_COOLDOWN_SECONDS * 60;
  assert.equal(wizard.spellbook.recovery[0], stretched, 'two levels above its own, so a longer recovery');
  assert.equal(wizard.casting.level, 3);
  const mage = casterAt(2, 4, 'wizard', 1);
  assert.equal(bindSpell(mage, 1, 'shield', 1), true);
  cast(level, mage, 90);
  assert.equal(mage.casting, undefined, 'Shield is bound but only a name for now');
});

test('a guest\'s synced spellbook is checked: bound spells must be real', () => {
  arena(8, 6);
  const hero = playerAt(2, 2, 'cleric');
  world.addComponent(hero, 'playerSlot', 'host');
  bindSpell(hero, 3, 'bless', 1);
  const good = () => JSON.parse(JSON.stringify(captureWorld(false, 7)));
  assert.doesNotThrow(() => validateNetState(good()));
  const tampered = (bound) => { const w = good(); w.entities.find((e) => e.data.spellbook).data.spellbook.bound = bound; return w; };
  assert.throws(() => validateNetState(tampered([null, null, null, { spell: 'made_up', level: 1 }])), ValidationError);
  assert.throws(() => validateNetState(tampered([null, null, null, { spell: 'bless', level: 12 }])), ValidationError);
  assert.throws(() => validateNetState(tampered(Array(21).fill(null))), ValidationError, 'only twenty squares');
});

test('a spell tooltip is short (kind, range, attack, the start of its text); "More info" holds the whole text and numbers', async () => {
  const { shortText, spellTopic } = await load('ui/SpellTopics');
  const bless = Spellbook.CATALOG.bless;
  const base = spellTopic(bless, 1, 3);
  const upgraded = spellTopic(bless, 2, 3);
  assert.ok(base.body.startsWith('You bless up to three creatures') && base.body.endsWith('...'), 'the start of the text, cut short');
  assert.ok(base.body.length <= 110);
  assert.deepEqual(base.detail, ['Level 1 Enchantment', 'Range: 30 ft (288 px)', 'Attack: no attack roll']);
  assert.ok(base.more.body.includes('You bless up to three creatures') && base.more.body.includes('one additional creature'), 'the whole text and its higher levels');
  assert.ok(base.more.detail.includes('Range: 30 ft (288 px)') && base.more.detail.includes('Cooldown: 5.0s'), 'range in feet and px, five seconds');
  assert.ok(upgraded.detail.includes('Cast at level 2'));
  assert.ok(upgraded.more.detail.includes('Cooldown: 7.5s'), 'a higher level recovers more slowly');
  const blast = Spellbook.CATALOG.eldritch_blast;
  assert.ok(spellTopic(blast, 0, 1).detail.includes('Attack: ranged spell attack, 1d10 force'));
  assert.ok(spellTopic(blast, 0, 5).detail.includes('Attack: ranged spell attack, 2d10 force'), 'twice the dice at level 5');
  assert.ok(spellTopic(blast, 0, 5).more.detail.includes('Damage: 2d10 force'));
  assert.ok(spellTopic(Spellbook.CATALOG.burning_hands, 1, 1).detail.includes('Attack: Dexterity saving throw, 3d6 fire'));
  assert.ok(spellTopic(Spellbook.CATALOG.magic_missile, 1, 1).detail.some((line) => line.startsWith('Attack: always hits')));
  assert.equal(shortText('A short one.'), 'A short one.', 'a short text stays whole');
  assert.equal(shortText('one two three four', 12), 'one two...', 'cut at a word');
});

test('binding a spell from the inventory: it shuts, a square is chosen, and it comes back where it was', async () => {
  const Binding = await load('game/SpellBinding');
  const { isInventoryOpen, setInventoryOpen } = await load('systems/InventorySystem');
  const cleric = createPlayer(0, 0, 'cleric');
  cleric.playerStats.level = 3;
  cleric.inSafeRoom = true;
  setInventoryOpen(true);
  Binding.beginBinding({ spell: 'bless', level: 2 });
  assert.equal(isInventoryOpen(), false, 'the inventory shuts while a square is chosen');
  Binding.finishBinding(cleric, 4);
  assert.deepEqual(Spellbook.quickBinding(cleric, 4), { spell: 'bless', level: 2 });
  assert.equal(Binding.pendingBinding(), null);
  assert.equal(isInventoryOpen(), true, 'and comes back');
  Binding.beginBinding({ spell: 'bless', level: 1 });
  Binding.cancelBinding();
  assert.equal(Binding.pendingBinding(), null, 'giving up binds nothing');
  assert.deepEqual(Spellbook.quickBinding(cleric, 4), { spell: 'bless', level: 2 });
  assert.equal(isInventoryOpen(), true);
  setInventoryOpen(false);
});

// ── Class features ───────────────────────────────────────────────────────────

const Features = await load('rules/ClassFeatures');
const { toggleFeature } = await load('game/PlayerActions');
const { usedFeature } = await load('systems/FeatureSystem');
const { characterSheet: sheetOf } = await load('rules/CharacterSheet');

test('every class lists its features by level, in a file that names real kinds', () => {
  const at = (cls, level) => Features.featuresAt(cls, level, null).map((f) => f.id);
  assert.ok(at('fighter', 1).includes('second_wind') && !at('fighter', 1).includes('action_surge'));
  assert.ok(at('fighter', 2).includes('action_surge'));
  assert.ok(at('fighter', 20).includes('extra_attack') && !at('fighter', 20).includes('protection'), 'Protection only for the style');
  assert.ok(Features.featuresAt('fighter', 1, 'protection').some((f) => f.id === 'protection'));
  assert.ok(at('rogue', 20).includes('stroke_of_luck') && at('cleric', 17).includes('supreme_healing'));
  for (const cls of ['fighter', 'wizard', 'rogue', 'warlock', 'bard', 'cleric']) {
    assert.ok(Features.CLASS_FEATURE_LIST[cls].length > 3, cls);
    for (const f of Features.CLASS_FEATURE_LIST[cls]) assert.ok(f.description.length > 20 && f.level >= 1 && f.level <= 20, f.id);
  }
});

test('a passive is switched off and on by its hero, and its effect goes with it', () => {
  const rogue = createPlayer(0, 0, 'rogue');
  rogue.equipped = { primary: { ...HAND_WEAPONS.find((w) => w.kind === 'dagger') } };
  assert.ok(sheetOf(rogue).attack.extra, 'Sneak Attack from level 1 with a finesse weapon');
  assert.equal(toggleFeature(rogue, 'sneak_attack'), true);
  assert.deepEqual(rogue.featuresOff, ['sneak_attack']);
  assert.equal(sheetOf(rogue).attack.extra, undefined, 'switched off, no extra dice');
  toggleFeature(rogue, 'sneak_attack');
  assert.ok(sheetOf(rogue).attack.extra);
  assert.equal(toggleFeature(rogue, 'evasion'), false, 'not had yet (and not played out)');
  assert.equal(toggleFeature(rogue, 'cunning_action'), false, 'an active is bound, not switched');
  const bard = createPlayer(0, 0, 'bard');
  bard.playerStats.level = 2;
  const before = sheetOf(bard).initiative;
  toggleFeature(bard, 'jack_of_all_trades');
  assert.ok(sheetOf(bard).initiative < before);
  const cleric = createPlayer(0, 0, 'cleric');
  cleric.playerStats.level = 8;
  assert.equal(sheetOf(cleric).attack.extra.sides, 8, 'Divine Strike: +1d8');
  cleric.playerStats.level = 14;
  assert.equal(sheetOf(cleric).attack.extra.count, 2);
  assert.ok(validCommand({ kind: 'toggle_feature', feature: 'sneak_attack' }));
  assert.ok(!validCommand({ kind: 'toggle_feature', feature: 'nonsense' }));
});

test('actives go on the quick bar and are used with the cast key', () => {
  const level = arena(10, 6);
  const fighter = casterAt(2, 2, 'fighter', 0);
  fighter.inSafeRoom = false;
  assert.equal(bindSpell(fighter, 0, 'feature:second_wind', 0), true, 'a class feature is bound anywhere');
  assert.equal(bindSpell(fighter, 1, 'feature:action_surge', 0), false, 'level 2');
  assert.equal(bindSpell(fighter, 1, 'feature:extra_attack', 0), false, 'a passive is not bound');
  fighter.health.max = 40;
  fighter.health.current = 10;
  useDieRoller(() => 10);
  cast(level, fighter, 1);
  useDieRoller(null);
  assert.equal(fighter.health.current, 10 + 10 + 1, '1d10 (loaded: 10) + level 1');
  assert.equal(fighter.spellbook.recovery[0], 30 * 60, 'recovering for its 30 seconds');
  fighter.playerStats.level = 2;
  bindSpell(fighter, 1, 'feature:action_surge', 0);
  fighter.spellbook.recovery[3] = 500;
  fighter.playerInput.spellSlot = 1;
  fighter.castCooldown = 0;
  cast(level, fighter, 1);
  assert.equal(fighter.spellbook.recovery[3], 0, 'Action Surge readies the rest of the bar');
  assert.equal(fighter.spellbook.recovery[1], 60 * 60, 'and it recovers for a minute itself');
  const wizard = casterAt(2, 4, 'wizard', 0);
  bindSpell(wizard, 0, 'feature:arcane_recovery', 0);
  wizard.spellbook.recovery[2] = 300;
  assert.equal(usedFeature(wizard, 'arcane_recovery', 0), true);
  assert.equal(wizard.spellbook.recovery[2], 0);
  assert.equal(usedFeature(wizard, 'indomitable', 0), false, 'not played out yet');
});

// ── Bolts against walls, the guest's view of the floor, long names ───────────

const { createSpellBolt } = await load('entities/ProjectileFactory');
const { createItemPickup } = await load('entities/LootFactory');
const { WALL_SINK } = await load('level/Level');

test('a spell flies on over the strip of a wall that feet stand in, and bursts on the wall itself', () => {
  const level = arena(8, 9);
  wallRect(level, 1, 6, 6, 6);
  const wallTop = 6 * TILE_WIDTH;
  assert.equal(level.blocksPoint(centre(3), wallTop + 10), false, 'where a hero may stand, at the foot of the wall');
  assert.equal(level.blocksPoint(centre(3), wallTop + WALL_SINK + 1), true, 'the wall itself');
  level.setTile(5, 2, createTile(TileType.Obstacle));
  level.blockBoxes.set(level.tileIndex(5, 2), { x0: 4, y0: 20, x1: 28, y1: 30 });
  assert.equal(level.blocksPoint(5 * TILE_WIDTH + 16, 2 * TILE_WIDTH + 5), false, 'above a prop, clear of its foot');
  assert.equal(level.blocksPoint(5 * TILE_WIDTH + 16, 2 * TILE_WIDTH + 25), true, 'the foot of the prop');

  const bolt = createSpellBolt(centre(3), centre(2), 0, 1, {});
  for (let t = 0; t < 120 && !bolt.removed; t++) updateSpells(level);
  assert.ok(bolt.removed, 'it burst');
  assert.ok(bolt.position.y > wallTop + WALL_SINK, `not before it reached the wall (burst at ${bolt.position.y})`);
});

test('a guest draws an item on the floor whole, not the top-left corner of it cut as a frame', () => {
  seated(1, 1, 'host', 'Ana');
  createItemPickup(centre(2), centre(2), WEAPONS[0]);
  const wire = JSON.parse(JSON.stringify(captureWorld(false, 7)));
  world.clear();
  const replica = new WorldReplica();
  replica.localSlot = 'p2';
  replica.apply(wire);
  const copy = world.entities.find((e) => e.item);
  const sprite = { texture: 'the whole icon' };
  world.addComponent(copy, 'sprite', sprite);
  replica.apply(wire);
  assert.equal(sprite.texture, 'the whole icon', 'later updates leave the picture as it was made');
});

test('a find with a long name keeps the world update valid, so the guest is not dropped from the game', () => {
  const ana = seated(2, 2, 'host', 'Ana');
  const longest = WEAPONS.reduce((a, b) => (b.name.length > a.name.length ? b : a));
  ana.inventory = [];
  assert.ok(PlayerActions.receiveItem(ana, longest));
  assert.ok(ana.rollLog.at(-1).text.length > 40, 'a line longer than the old limit');
  assert.doesNotThrow(() => validateNetState(JSON.parse(JSON.stringify(captureWorld(false, 7)))));
});

// ── Death in a run, and leaving through the exit room ────────────────────────

const { updateRespawns } = await load('systems/RespawnSystem');
const { updateFalling, FALL_TICKS } = await load('systems/HoleSystem');
const { updateExit, inExitRoom, chooseDeparture } = await load('systems/ExitSystem');
const { exitCountdown, EXIT_CLOSE_TICKS } = await load('systems/DoorSystem');
const { playerUsing } = await load('systems/TargetSystem');
const { run } = await load('game/Run');
const Fallen = await load('game/Fallen');

test('in co-op a hero who dies stays down where they fell, their gear and gold left there; the run ends when all are down', () => {
  run.over = false;
  const level = arena(14, 8);
  const ana = seated(3, 3, 'host', 'Ana');
  const bo = seated(10, 3, 'p2', 'Bo');
  ana.inventory = [structuredClone(WEAPONS[0])];
  ana.equipped = { armor: structuredClone(ARMORS[0]) };
  ana.playerStats.gold = 40;
  ana.health.current = 0;
  updateDeath(level);
  assert.equal(ana.inventory.length, 0);
  assert.deepEqual(ana.equipped, {});
  assert.equal(ana.playerStats.gold, 0);
  assert.equal(world.entities.filter((e) => e.item).length, 2, 'the sword and the armour lie on the floor');
  for (const item of world.entities.filter((e) => e.item)) {
    const off = { x: (item.position.x - ana.position.x) / 30, y: (item.position.y - ana.position.y) / 14 };
    assert.ok(off.x ** 2 + off.y ** 2 >= 1, 'round the body, never on it: the fallen hero stays in sight');
  }
  const purse = () => world.entities.filter((e) => e.loot && !e.removed).reduce((sum, e) => sum + e.loot.value, 0);
  assert.equal(purse(), 40, 'every coin of the purse spilt');
  for (let t = 0; t < 2000; t++) {
    updateRespawns(1);
    updateLoot(level);
  }
  assert.equal(ana.health.current, 0, 'nobody gets up again');
  assert.equal(ana.respawnTicks, 0, 'the death has played out');
  assert.equal(purse(), 40, 'the coins wait for somebody to come for them');
  assert.equal(run.over, false, 'Bo is still standing');
  bo.health.current = 0;
  updateDeath(level);
  for (let t = 0; t < 2000; t++) updateRespawns(1);
  assert.equal(Fallen.partyFallen(), true);
  assert.equal(run.over, true, 'the whole party is down');
  run.over = false;
});

test('a fallen hero gets no share of a kill: its experience and gold go to those still standing', () => {
  const level = arena(14, 8);
  const ana = seated(3, 3, 'host', 'Ana');
  const bo = seated(5, 3, 'p2', 'Bo');
  bo.health.current = 0;
  updateDeath(level);
  const mob = mobAt(level, 'goblin', 9, 3);
  mob.health.current = 0;
  updateDeath(level);
  assert.ok(ana.playerStats.exp > 0 && ana.playerStats.gold > 0);
  assert.equal(ana.playerStats.kills, 1);
  assert.deepEqual([bo.playerStats.exp, bo.playerStats.gold, bo.playerStats.kills], [0, 0, 0]);
});

test('in co-op a hero who falls into a pit stays at its bottom; what they carried is left at its edge', () => {
  const level = arena(12, 10);
  for (const [x, y] of [[5, 4], [6, 4], [5, 5], [6, 5]]) level.setTile(x, y, createTile(TileType.Hole));
  const ana = seated(2, 2, 'host', 'Ana');
  seated(9, 8, 'p2', 'Bo');
  ana.position.x = 6 * TILE_WIDTH;
  ana.position.y = 5 * TILE_WIDTH;
  ana.inventory = [structuredClone(WEAPONS[0])];
  ana.playerStats.gold = 10;
  updateHoles(level);
  assert.ok(ana.falling);
  for (let t = 0; t < FALL_TICKS + 30; t++) updateFalling(level);
  assert.equal(ana.health.current, 0);
  assert.equal(ana.respawnTicks, 0);
  assert.deepEqual([ana.position.x, ana.position.y], [6 * TILE_WIDTH, 5 * TILE_WIDTH], 'still down in the pit');
  const sword = world.entities.find((e) => e.item);
  assert.ok(level.canHold(sword.position.x, sword.position.y), 'on the floor at the edge, not in the pit');
  const god = seated(2, 6, 'p3', 'Cy');
  god.godMode = true;
  god.position.x = ana.position.x;
  god.position.y = ana.position.y;
  updateHoles(level);
  assert.equal(god.falling, undefined, "the console's god mode walks over pits");
});

test('going deeper brings the fallen back whole, with their experience but without gear or gold', () => {
  startRun();
  const ana = seated(2, 2, 'host', 'Ana');
  const bo = seated(3, 2, 'p2', 'Bo');
  ana.health.current = 5;
  ana.playerStats.gold = 12;
  ana.inventory = [structuredClone(WEAPONS[0])];
  Object.assign(bo.playerStats, { exp: 400, level: 2, gold: 30 });
  bo.inventory = [structuredClone(WEAPONS[0])];
  bo.equipped = { armor: structuredClone(ARMORS[0]) };
  bo.health.current = 0;
  descend();
  world.clear();
  const ana2 = seated(2, 2, 'host', 'Ana');
  const bo2 = seated(3, 2, 'p2', 'Bo');
  restorePlayer(ana2);
  restorePlayer(bo2);
  assert.deepEqual([ana2.health.current, ana2.playerStats.gold, ana2.inventory.length], [5, 12, 1], 'the standing keep everything');
  assert.deepEqual([bo2.playerStats.exp, bo2.playerStats.level], [400, 2], 'the fallen keep what they learnt');
  assert.deepEqual([bo2.playerStats.gold, bo2.inventory, bo2.equipped], [0, [], {}], 'but nothing they had');
  assert.equal(bo2.health.current, bo2.health.max, 'and are whole again');
  startRun();
});

test('the fallen have no say: votes go on without them, and no rest brings them back', () => {
  const ana = seated(2, 2, 'host', 'Ana');
  const bo = seated(3, 2, 'p2', 'Bo');
  const cy = seated(4, 2, 'p3', 'Cy');
  cy.health.current = 0;
  assert.equal(Party.isAlone(), false);
  Party.openVote(ana, 'short');
  Party.queueAnswer('p3', false);
  Party.updateParty();
  assert.ok(Party.currentParty().vote, "Cy's refusal does not count");
  Party.queueAnswer('p2', true);
  Party.updateParty();
  assert.ok(Party.takeAgreedVote(['short']), 'everyone still standing agreed');
  ana.health.current = 1;
  Rest.takeRest('long');
  assert.equal(ana.health.current, ana.health.max);
  assert.equal(cy.health.current, 0, 'a long rest is no revival');
  bo.health.current = 0;
  assert.equal(Party.isAlone(), true, 'with the others down, Ana acts alone');
});

/** A dungeon with three heroes: one by the exit button, one further into the exit room, one back in the safe room. */
function atTheExit() {
  const { level, layout } = buildDungeon(777, true);
  const button = world.entities.find((e) => e.exitButton);
  const room = layout.rooms.find((r) => r.type === 'exit');
  const ana = seated(0, 0, 'host', 'Ana');
  const bo = seated(0, 0, 'p2', 'Bo');
  const cy = seated(0, 0, 'p3', 'Cy');
  Object.assign(ana.position, { x: button.position.x + 6, y: button.position.y });
  Object.assign(bo.position, { x: centre(room.x + 1), y: centre(room.y + 1) });
  Object.assign(cy.position, layout.playerSpawn);
  const press = () => {
    ana.playerInput.intents.use = true;
    beginPerception();
    resolveUses();
    updateExit();
    ana.playerInput.intents.use = false;
  };
  return { level, layout, button, ana, bo, cy, press };
}

test('the exit button asks only the heroes in the exit room; they go deeper together, and whoever is outside is left behind', () => {
  const { layout, button, ana, bo, cy, press } = atTheExit();
  press();
  assert.equal(button.exitButton.activated, true);
  assert.deepEqual([inExitRoom(ana), inExitRoom(bo), inExitRoom(cy)], [true, true, false]);
  chooseDeparture('p3', 'end');
  updateExit();
  assert.deepEqual(button.exitButton.choices, {}, 'Cy is not in the room, so she is not asked');
  chooseDeparture('host', 'next');
  updateExit();
  assert.equal(button.exitButton.outcome, null, 'Bo has yet to choose');
  Object.assign(cy.position, { x: bo.position.x + 12, y: bo.position.y });
  chooseDeparture('p2', 'next');
  updateExit();
  assert.equal(button.exitButton.outcome, null, 'Cy walked in before it was settled: she is asked too');
  Object.assign(cy.position, layout.playerSpawn);
  updateExit();
  assert.equal(button.exitButton.outcome, 'next', 'everyone in the room chose to go deeper');
  assert.equal(cy.health.current, 0, 'Cy is left behind');
  assert.ok(cy.rollLog.some((l) => l.text === 'LEFT BEHIND'));
  assert.ok(ana.health.current > 0 && bo.health.current > 0);
});

test('anyone in the exit room choosing to end the run ends it; if everyone walks out first, the button can be pressed again', () => {
  const { layout, button, ana, bo, press } = atTheExit();
  const anaAt = { ...ana.position };
  press();
  Object.assign(ana.position, layout.playerSpawn);
  Object.assign(bo.position, layout.playerSpawn);
  updateExit();
  assert.equal(button.exitButton.activated, false, 'nobody left to ask');
  assert.equal(button.visual.col, 0, 'the button is back up');
  Object.assign(ana.position, anaAt);
  press();
  assert.equal(button.exitButton.activated, true, 'pressed again');
  chooseDeparture('host', 'end');
  updateExit();
  assert.equal(button.exitButton.outcome, 'end', 'only Ana was in the room');
  assert.ok(ana.health.current > 0);
});

test("the exit room's lever drops its portcullis 5 s after one pull, for good; nothing else moves", () => {
  const { level, layout } = buildDungeon(777, true);
  const lever = world.entities.find((e) => e.lever?.exit);
  const door = world.entities.find((e) => e.door?.exit);
  assert.ok(lever && door && !door.door.locked && !door.door.closed, 'the exit room stands open');
  for (const t of layout.exitDoor.tiles) assert.equal(level.getTile(t.x, t.y).type, TileType.Floor);
  assert.ok(level.isWorldPosSafe(lever.position.x, lever.position.y), 'the lever is inside the exit room');
  const hero = createPlayer(lever.position.x + 6, lever.position.y);
  hero.playerInput.intents.use = true;
  beginPerception();
  resolveUses();
  updateLevers(level);
  assert.equal(lever.lever.pulled, true, 'nobody is asked');
  assert.equal(exitCountdown(), EXIT_CLOSE_TICKS / 60);
  assert.equal(world.entities.find((e) => e.lever && !e.lever.exit).lever.pulled, false, "the safe room's lever is untouched");
  for (let t = 0; t < EXIT_CLOSE_TICKS; t++) updateDoors(level);
  assert.equal(door.door.closed, true);
  assert.equal(exitCountdown(), null);
  for (const t of layout.exitDoor.tiles) assert.equal(level.getTile(t.x, t.y).type, TileType.Obstacle, 'barred');
  assert.equal(world.entities.filter((e) => e.gate?.dropping).length, layout.exitDoor.tiles.length, 'its portcullis drops');
  assert.ok(world.entities.filter((e) => e.gate && !e.gate.dropping).every((g) => g.gate.lift === 0), "the safe room's stays down");
  beginPerception();
  resolveUses();
  assert.equal(playerUsing(lever), null, 'it cannot be pulled again');
});

test('a guest may only answer the exit button with a known choice, and its state must hold together', () => {
  assert.ok(validCommand({ kind: 'depart', choice: 'next' }));
  assert.ok(!validCommand({ kind: 'depart', choice: 'stay' }));
  const { button } = atTheExit();
  button.exitButton.choices = { p2: 'next' };
  const good = () => JSON.parse(JSON.stringify(captureWorld(false, 7)));
  assert.doesNotThrow(() => validateNetState(good()));
  const tamper = (fn) => {
    const w = good();
    fn(w.entities.find((e) => e.data.exitButton).data.exitButton);
    return w;
  };
  assert.throws(() => validateNetState(tamper((b) => { b.outcome = 'stay'; })), ValidationError);
  assert.throws(() => validateNetState(tamper((b) => { b.choices = { p9: 'next' }; })), ValidationError);
});

// ── Co-op pause, the fallen watching, preparing spells ────────────────────────

test('in co-op the pause menu stops the game for everyone until the last player with it open closes theirs', async () => {
  const Pause = await load('game/Pause');
  Pause.resetPause();
  assert.equal(Pause.isGamePaused(), false);
  world.addComponent(playerAt(1, 2), 'playerSlot', 'host');
  const ana = playerAt(2, 2);
  world.addComponent(ana, 'playerSlot', 'p2');
  handleGuestCommand('p2', { kind: 'pause', paused: true });
  assert.equal(Pause.isGamePaused(), true, 'a guest pausing stops the host too');
  assert.equal(Pause.pausingSeat(), 'p2');
  Pause.setSeatPaused('host', true);
  handleGuestCommand('p2', { kind: 'pause', paused: false });
  assert.equal(Pause.isGamePaused(), true, 'still the host\'s menu');
  ana.health.current = 0;
  handleGuestCommand('p2', { kind: 'pause', paused: true });
  assert.equal(Pause.pausingSeat(), 'host', 'the host first');
  Pause.setSeatPaused('host', false);
  assert.equal(Pause.pausingSeat(), 'p2', 'a fallen hero may pause too');
  Pause.resetPause();
  const state = JSON.parse(JSON.stringify(captureWorld(true, 7, 'Ana')));
  validateNetState(state);
  assert.equal(state.pausedBy, 'Ana');
  assert.throws(() => validateNetState({ ...state, pausedBy: '<b>Ana</b>' }), ValidationError, 'a name as names may be');
  assert.throws(() => validateNetState({ ...state, pausedBy: undefined }), ValidationError);
});

test('a fallen hero watches their own body, then the companions still standing, round and round both ways', async () => {
  const { nextWatched, stillWatchable } = await load('game/Spectate');
  const seated = (tx, slot) => {
    const hero = playerAt(tx, 2);
    world.addComponent(hero, 'playerSlot', slot);
    return hero;
  };
  const me = seated(2, 'host');
  const ana = seated(3, 'p2');
  const bo = seated(4, 'p3');
  const cy = seated(5, 'p4');
  me.health.current = 0;
  bo.health.current = 0;
  assert.equal(nextWatched(me, null, 1), ana, 'from the body, the first companion standing');
  assert.equal(nextWatched(me, null, -1), cy, 'or the last');
  assert.equal(nextWatched(me, ana, 1), cy, 'the fallen are skipped');
  assert.equal(nextWatched(me, cy, 1), ana, 'and round again');
  assert.equal(nextWatched(me, ana, -1), cy);
  assert.equal(stillWatchable(cy), true);
  cy.health.current = 0;
  assert.equal(stillWatchable(cy), false, 'a companion who falls is watched no longer');
  ana.health.current = 0;
  assert.equal(nextWatched(me, null, 1), null, 'nobody left standing');
});

test('heroes know whether they stand in a safe room, and only there are spells prepared (class features anywhere)', async () => {
  const { updateSafeRooms } = await load('systems/SafeRoomSystem');
  const { mayPrepare } = await load('game/PlayerActions');
  const level = arena(10, 6);
  level.markSafeZone(2, 2);
  const inside = playerAt(2, 2, 'wizard');
  const outside = playerAt(6, 3, 'wizard');
  updateSafeRooms(level);
  assert.equal(inside.inSafeRoom, true);
  assert.equal(outside.inSafeRoom, false);
  assert.equal(mayPrepare(outside, 'fire_bolt'), false);
  assert.equal(mayPrepare(outside, 'feature:second_wind'), true);
  assert.equal(bindSpell(outside, 1, 'fire_bolt', 0), false);
  assert.equal(bindSpell(inside, 1, 'fire_bolt', 0), true);
  inside.position.x = centre(6);
  updateSafeRooms(level);
  assert.equal(inside.inSafeRoom, false, 'worked out again each tick');
});
