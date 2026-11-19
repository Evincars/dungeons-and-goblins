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
const { createTile, TileType, TILE_WIDTH, TILE_HEIGHT } = await load('level/TileType');
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

test('the safe and exit rooms have campfires (two beside the exit), banners, and a portal each in their north walls', () => {
  const { campfires, rooms, props, exitButtonPos, level } = new DungeonBuilder({ ...DEFAULT_CONFIG, seed: 7 }).build();
  const exit = rooms.find((r) => r.type === 'exit');
  const safe = rooms.find((r) => r.type === 'safe');
  const inRoom = (r) => (c) => c.x >= r.x * 32 && c.x < (r.x + r.w) * 32;
  assert.equal(campfires.filter(inRoom(exit)).length, 2);
  assert.equal(campfires.filter(inRoom(safe)).length, 1, 'a fire in the safe room too');
  for (const c of campfires) assert.equal(level.getTileAt(c.x, c.y).type, TileType.Obstacle, 'a campfire blocks its tile');
  assert.equal(level.getTileAt(exitButtonPos.x, exitButtonPos.y).type, TileType.Floor, 'the floor before the exit portal stays clear');
  const hung = [7, 11, 23, 31].some((seed) => {
    const built = new DungeonBuilder({ ...DEFAULT_CONFIG, seed }).build();
    const gathering = built.rooms.filter((r) => r.type !== 'dungeon');
    return built.props.some((p) => gathering.some((r) => p.ty === r.y && p.tx >= r.x && p.tx < r.x + r.w) && HANGINGS.includes(p.kind));
  });
  assert.ok(hung, 'banners where the north walls have room for them beside the portal');
  const portal = (kind, room) => props.find((p) => p.kind === kind && p.ty === room.y && p.tx > room.x && p.tx < room.x + room.w - 1);
  const stairs = portal('portal_stairs', safe);
  const way = portal('portal_dark', exit);
  assert.ok(stairs && way, 'the stairs the heroes came down by, and the dark way on');
  assert.equal(exitButtonPos.x, way.tx * 32 + 16, 'the exit is the portal');
  assert.equal(exitButtonPos.y, exit.y * 32, 'at the foot of its wall');
  for (const p of [stairs, way]) {
    const lit = props.filter((q) => q.kind === 'castle_candelabra' && q.ty === p.ty && Math.abs(q.tx - p.tx) === 2);
    assert.equal(lit.length, 2, 'a candelabra either side');
    assert.ok(!props.some((q) => q.ty === p.ty && HANGINGS.includes(q.kind) && Math.abs(q.tx - p.tx) <= 3), 'nothing hung over the portal');
  }
});

test('a shaped pit swallows what stands over its drawn ground: its lobes, not the corners of a quatrefoil', async () => {
  const { insidePit, LOBE_W, LOBE_N } = await load('level/PitShapes');
  const level = arena(14, 12);
  const pit = { x: 5, y: 5, shape: 'lobed', lobes: LOBE_W | LOBE_N };
  for (const [x, y] of [[5, 5], [6, 5], [5, 6], [6, 6]]) level.setTile(x, y, createTile(TileType.Hole));
  level.addPit(pit);
  const left = 5 * TILE_WIDTH;
  const mid = 6 * TILE_WIDTH;
  assert.ok(level.overPit(left - 6, mid), 'the west lobe reaches into the floor tile beside the square');
  assert.ok(!level.overPit(left - 20, mid), 'past it is floor');
  assert.ok(level.overPit(mid, 5 * TILE_WIDTH - 14), 'the arched alcove north of it');
  assert.ok(!level.overPit(mid, 5 * TILE_WIDTH - 24), 'past the alcove\'s arch is floor');
  assert.ok(!level.overPit(left + 6, 5 * TILE_WIDTH - 10), 'beside the alcove is floor');
  assert.ok(!level.overPit(left - 6, 5 * TILE_WIDTH + 2), 'the corner beside a lobe is floor');
  assert.ok(insidePit(pit, mid, mid));
  const foil = { x: 10, y: 2, shape: 'quatrefoil', lobes: 0 };
  level.addPit(foil);
  assert.ok(level.overPit(11 * TILE_WIDTH, 3 * TILE_WIDTH), 'the middle of a quatrefoil');
  assert.ok(!level.overPit(10 * TILE_WIDTH + 2, 2 * TILE_WIDTH + 2), 'its tile corners are floor');
  assert.ok(!level.canHold(left - 6, mid), 'nothing set down in a lobe stays on the floor');
});

test('a hero who steps into a lobe falls, and is drawn down into the pit; an enemy will not step in', async () => {
  const { updateFalling: fallTick } = await load('systems/HoleSystem');
  const level = arena(14, 12);
  for (const [x, y] of [[5, 5], [6, 5], [5, 6], [6, 6]]) level.setTile(x, y, createTile(TileType.Hole));
  level.addPit({ x: 5, y: 5, shape: 'lobed', lobes: 8 });
  const player = playerAt(4, 6);
  // Feet over the lobe's bulge, just west of the square: their whole support box fits inside it.
  player.position.x = 5 * TILE_WIDTH - 2;
  player.position.y = 6 * TILE_WIDTH;
  updateHoles(level);
  assert.ok(player.falling, 'over the west lobe, off the square');
  const startX = player.position.x;
  for (let t = 0; t < 10; t++) fallTick(level);
  assert.ok(player.position.x > startX, 'pulled in towards the middle of the lobe');
  const mob = mobAt(level, 'goblin', 3, 6);
  mob.position.y = 6 * TILE_WIDTH;
  mob.velocity.x = 8;
  for (let t = 0; t < 10; t++) { mob.velocity.x = 2; updateMovement(level); }
  assert.ok(!level.overPit(mob.position.x, mob.position.y), 'the enemy stops at the lobe\'s edge');
});

test('falling into a pit pops a "!" over the player that follows them down', () => {
  const level = arena(8, 6);
  level.setTile(4, 2, createTile(TileType.Hole));
  level.setTile(4, 3, createTile(TileType.Hole));
  const player = playerAt(4, 3);
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
  const sword = SHOP_ITEMS.find((i) => i.base === 'shortsword');
  const axe = SHOP_ITEMS.find((i) => i.base === 'handaxe');
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
  assert.deepEqual(statTotals({ primary: axe, head: helm }), { strength: 0, dexterity: 1, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 });
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
  assert.equal(WEAPONS.length, 59, 'a weapon for each picture the weapons table names');
  assert.equal(SHIELDS.length, 4, 'the four shields of /weapons: two shields, two tower shields');
  assert.equal(ARMORS.length, 13, 'the twelve D&D armours and a robe');
  for (const item of [...WEAPONS, ...SHIELDS, ...ARMORS]) {
    assert.ok(item.name && item.icon && item.gear && item.stats, item.id);
    assert.ok(validCommand({ kind: 'loadout', inventory: [item], equipped: {} }), `${item.id} passes the network checks`);
  }
  assert.ok(WEAPONS.every((w) => w.gear !== 'ammo' && w.kind !== 'arrows'), 'arrows are not items');
  assert.equal(Object.keys(EFFECT_SHAPES).length, 252, 'every effect sheet has a shape name');
  assert.equal(EFFECT_COLOURS.length, 9);
});

test('weapons and armour come from their JSON tables alone: D&D stats, the table\'s price and weight, no bonuses; suits in four colours', async () => {
  const { weaponStats, isWeaponBase, WEAPON_BASES } = await load('rules/WeaponTable');
  const { armorStats, ARMOR_BASES } = await load('rules/ArmorTable');
  const { freshCopy, randomItem, armorIconRegions, ARMOR_COLOURS, catalogIconSources } = await load('entities/ItemCatalog');
  const { formatDice } = await load('rules/Dice');
  const { default: weaponsJson } = await import('../src/data/weapons.json', { with: { type: 'json' } });
  const { default: armorsJson } = await import('../src/data/armors.json', { with: { type: 'json' } });
  const { default: shieldsJson } = await import('../src/data/shields.json', { with: { type: 'json' } });
  // Every weapon of both D&D tables is known to the rules, pictures or not.
  for (const base of ['club', 'whip', 'war_pick', 'lance', 'flail', 'greatsword', 'pike', 'sling', 'blowgun', 'net', 'dart', 'sickle', 'spear']) assert.ok(isWeaponBase(base), base);
  for (const base of ['pistol', 'musket', 'punch_dagger']) assert.ok(!isWeaponBase(base), `${base} is not a D&D weapon`);
  assert.equal(WEAPON_BASES.length, 38, 'the 37 of the tables and a punch');
  // The rules read each weapon exactly as the data file writes it.
  for (const [base, raw] of Object.entries(weaponsJson.weapons)) {
    const rule = weaponStats(base);
    assert.equal(rule.name, raw.name);
    assert.equal(raw.damage === null ? rule.damage.count + rule.damage.bonus : formatDice(rule.damage, true), raw.damage === null ? 0 : raw.damage, `${base} damage`);
    assert.deepEqual([rule.category, rule.range, [...rule.properties], rule.distance && [...rule.distance], rule.cost, rule.weight], [raw.category, raw.range, raw.properties, raw.distance, raw.cost, raw.weight], base);
    for (const item of WEAPONS.filter((w) => w.base === base)) assert.deepEqual([item.name, item.weight, item.value], [raw.name, raw.weight, Math.ceil(raw.cost)], `${item.id} is the table's`);
  }
  for (const [base, raw] of [...Object.entries(armorsJson.armors), ...Object.entries(shieldsJson.shields)]) {
    const rule = armorStats(base);
    assert.deepEqual([rule.name, rule.category, rule.ac, rule.dexCap, rule.strength, rule.stealthDisadvantage, rule.cost, rule.weight], [raw.name, raw.category, raw.ac, raw.dexCap, raw.strength, raw.stealthDisadvantage, raw.cost, raw.weight], base);
  }
  assert.deepEqual(weaponStats('longbow').distance, [30, 120], 'metres, as the Czech table gives them');
  assert.equal(formatDice(weaponStats('blowgun').damage), '1', 'a flat 1');
  assert.deepEqual([armorStats('plate').strength, armorStats('chain_mail').strength, armorStats('leather').strength], [15, 13, null]);
  assert.equal(SHIELDS.every((s) => ['shield', 'tower_shield'].includes(s.base) && s.type === 'shield' && s.gear === 'offhand'), true);
  assert.deepEqual([armorStats('shield').ac, armorStats('tower_shield').ac, armorStats('shield').category], [2, 2, 'shield'], 'shields from shields.json');
  assert.ok(catalogIconSources().filter((s) => /^(weapon|shield)_/.test(s.key)).every((s) => s.src.startsWith('/weapons/WR_NightBoundSet_') && !s.src.includes(' ')), 'art from /weapons, no spaces');
  // Each kind has pictures of its own, so the bag isn't three alike crossbows: the four crossbow pictures shared out.
  const crossbows = ['hand_crossbow', 'light_crossbow', 'heavy_crossbow'].flatMap((b) => weaponStats(b).art);
  assert.equal(new Set(crossbows).size, 4, 'four crossbow pictures, none shared');
  assert.equal(new Set([...weaponStats('shortbow').art, ...weaponStats('longbow').art]).size, 5, 'and the five bows');
  const pictures = WEAPONS.map((w) => w.id);
  assert.equal(new Set(pictures).size, pictures.length);
  for (const item of [...WEAPONS, ...SHIELDS, ...ARMORS]) assert.deepEqual(item.stats, {}, `${item.id} adds no ability scores`);
  assert.ok([...HAND_WEAPONS, ...SHIELDS, ...ARMORS].every((w) => w.bonus === undefined), 'no magic yet');
  assert.equal(WEAPONS.find((w) => w.base === 'quarterstaff').value, 1, 'a quarterstaff\'s 2 sp is paid as a gold piece');
  // The suits' art: a column of armors.png, its first four rows the colours.
  const plate = ARMORS.find((a) => a.base === 'plate');
  const robe = ARMORS.find((a) => a.base === 'robe');
  const regions = armorIconRegions();
  assert.equal(Object.keys(regions).length, ARMORS.length * ARMOR_COLOURS);
  assert.deepEqual(regions.armor_plate_1, { x: 8 * 32, y: 0, w: 32, h: 32 }, 'plate is the ninth column');
  assert.deepEqual(regions.armor_splint_4, { x: 15 * 32, y: 3 * 32, w: 32, h: 32 });
  assert.ok(Object.values(regions).every((r) => r.y < ARMOR_COLOURS * 32), 'only the first four rows');
  const colours = new Set();
  for (let i = 0; i < 80; i++) colours.add(freshCopy(plate).icon);
  assert.deepEqual([...colours].sort(), ['armor_plate_1', 'armor_plate_2', 'armor_plate_3', 'armor_plate_4'], 'each suit made in a colour picked at random');
  assert.equal(plate.icon, 'armor_plate_1', 'the catalogue entry itself is left as it is');
  assert.ok(regions[randomItem([robe]).icon], 'every colour handed out has its art');
  const dagger = WEAPONS.find((w) => w.base === 'dagger');
  assert.equal(freshCopy(dagger).icon, dagger.icon, 'a weapon keeps its one picture');
  assert.equal(ARMOR_BASES.includes('robe') && ARMOR_BASES.includes('shield') && ARMOR_BASES.includes('tower_shield'), true);
});

test('a new run starts with one of each weapon, shield and armour the hero is trained in, light enough not to slow them', async () => {
  const { itemTrained, heroClass } = await load('rules/Classes');
  const { MAX_CARRY_KG, LOAD_EASY } = await load('rules/Encumbrance');
  const wizard = playerAt(2, 2, 'wizard');
  giveStartingKit(wizard);
  const bases = new Set(wizard.inventory.map((i) => i.base));
  for (const base of ['dagger', 'quarterstaff', 'light_crossbow', 'robe']) assert.ok(bases.has(base), `a wizard has a ${base}`);
  for (const base of ['longsword', 'plate', 'shield']) assert.ok(!bases.has(base), `but no ${base}`);
  assert.ok(wizard.inventory.every((item) => itemTrained(heroClass('wizard'), item)), 'nothing a wizard is not trained in');
  assert.equal(wizard.inventory.length, bases.size, 'one of each');
  const fighter = playerAt(2, 2, 'fighter');
  giveStartingKit(fighter);
  const kg = fighter.inventory.reduce((sum, i) => sum + (i.weight ?? 0), 0);
  assert.ok(kg <= MAX_CARRY_KG * LOAD_EASY, `a fighter's kit is not a burden: ${kg} kg`);
  assert.ok(fighter.inventory.some((i) => i.base === 'longsword'), 'martial arms');
  assert.notEqual(fighter.inventory[0], HAND_WEAPONS.find((w) => w.base === fighter.inventory[0].base), 'copies, not the catalogue entries');
});

test('a load past 80 % of what a hero carries slows them, to a walk at all of it; then they cannot sprint', async () => {
  const { loadPace, fullyLaden, loadKg } = await load('rules/Encumbrance');
  assert.equal(loadPace(50), 1);
  assert.equal(loadPace(80), 1, 'free up to 80 %');
  assert.ok(loadPace(90) < 1 && loadPace(90) > loadPace(100), 'slower and slower');
  assert.equal(loadPace(100), loadPace(115), 'a walk at the whole load and past it');
  assert.ok(fullyLaden(100) && !fullyLaden(99));
  assert.equal(loadKg([{ weight: 2 }, null, { weight: 3 }], { armor: { weight: 10 } }), 15);
  const hero = playerAt(2, 2);
  hero.inventory = [];
  hero.equipped = {};
  hero.playerInput.right = true;
  updateMovement(arena(10, 10));
  const free = hero.velocity.x;
  hero.velocity.x = 0;
  hero.inventory = [{ type: 'armor', name: 'Lead', value: 1, weight: 100 }];
  updateMovement(arena(10, 10));
  assert.ok(hero.velocity.x < free * 0.6, `laden: ${hero.velocity.x} vs ${free}`);
  hero.playerInput.right = false;
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
  player.equipped = { primary: { ...HAND_WEAPONS.find((w) => w.base === 'longbow') } };
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
  assert.equal(guest.playerStats.swordTier, 1, 'a plain D&D sword adds no strength of its own');
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
  for (const item of [...ARMORS, ...SHIELDS]) assert.ok(isArmorBase(item.base) || item.id === 'armor_robe', `${item.id} has an armour base`);
  assert.ok([...HAND_WEAPONS, ...ARMORS].every((w) => w.bonus === undefined), 'no magic yet');
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
  const sword = SHOP_ITEMS.find((i) => i.base === 'shortsword');
  const axe = SHOP_ITEMS.find((i) => i.base === 'handaxe');
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

test('the combat log writes rests, healing, kills, deaths, levels and the choices of the level panel', async () => {
  const { currentLog, MAX_LOG_ENTRIES } = await load('systems/CombatLogSystem');
  const { takeRest } = await load('game/Rest');
  const { applyCustomization } = await load('game/Customize');
  const { grantExperience } = await load('systems/DeathSystem');
  const { usedFeature } = await load('systems/FeatureSystem');
  startRun();
  world.clear();
  const level = arena(12, 6);
  const hero = playerAt(3, 3, 'fighter');
  world.addComponent(hero, 'playerName', 'Evincars');
  world.addComponent(hero, 'playerSlot', 'host');
  const seen = [];
  let last = currentLog()?.seq ?? 0;
  const news = () => {
    const entries = (currentLog()?.entries ?? []).filter((e) => e.seq > last && e.result === 'event');
    last = currentLog()?.seq ?? last;
    seen.push(...entries);
    return entries.map((e) => [e.event, e.item ?? '', e.total, e.damage]);
  };
  news();

  hero.health.current = hero.health.max - 10;
  hero.playerStats.hitDice = 1;
  takeRest('short', undefined, { host: 1 });
  const [short] = news();
  assert.deepEqual([short[0], short[2]], ['short_rest', 1], 'a short rest names the hit dice spent');
  assert.ok(short[3] > 0 && short[3] <= 10, 'and the hit points they gave back');
  hero.health.current = hero.health.max - 7;
  takeRest('long');
  assert.deepEqual(news()[0], ['long_rest', '', 0, 7], 'a long rest heals every wound');

  hero.health.current = 1;
  usedFeature(hero, 'second_wind', 0, level);
  const [used, regained] = news();
  assert.deepEqual([used[0], used[1]], ['feature', 'Second Wind']);
  assert.deepEqual([regained[0], regained[1]], ['regain', 'Second Wind']);
  assert.ok(regained[3] >= 2, 'with the hit points it gave');

  grantExperience(hero, 300);
  assert.deepEqual(news()[0], ['level_up', '', 2, 0]);

  hero.playerStats.level = 4;
  hero.build.locked = true;
  hero.build.fightingStyle = 'dueling';
  hero.build.archetype = 'champion';
  assert.equal(applyCustomization(hero, { kind: 'improve', improvement: { stats: { strength: 1, dexterity: 1 } } }), true);
  assert.deepEqual(news()[0], ['improve', 'STR +1, DEX +1', 0, 0]);
  hero.playerStats.level = 6;
  assert.equal(applyCustomization(hero, { kind: 'improve', improvement: { feat: 'tough' } }), true);
  assert.deepEqual(news()[0], ['feat', 'Tough', 0, 0]);
  assert.equal(applyCustomization(hero, { kind: 'improve', improvement: { feat: 'tough' } }), false);
  assert.deepEqual(news(), [], 'a refused choice is not written');
  const caster = playerAt(5, 3, 'fighter');
  caster.playerStats.level = 3;
  assert.equal(applyCustomization(caster, { kind: 'archetype', archetype: 'champion' }), true);
  assert.equal(news()[0][0], 'archetype');

  const goblin = mobAt(level, 'goblin', 8, 3);
  goblin.lastHitBy = world.id(hero);
  goblin.health.current = 0;
  updateDeath(level);
  const [slain] = news();
  assert.deepEqual([slain[0], slain[1]], ['slain', 'Goblin'], 'the kill is the hero\'s');
  const hunter = mobAt(level, 'orc', 9, 3);
  hero.lastHitBy = world.id(hunter);
  hero.health.current = 0;
  updateDeath(level);
  assert.deepEqual(news()[0].slice(0, 2), ['slain', 'Evincars'], 'and so is the hero\'s fall to the orc');
  assert.ok(seen.some((e) => e.actor === 'mob' && e.name === 'orc'), 'written under the orc');

  const state = JSON.parse(JSON.stringify(captureWorld(false, 3)));
  validateNetState(state);
  assert.ok(currentLog().entries.length <= MAX_LOG_ENTRIES);
  state.entities.find((e) => e.data.combatLog).data.combatLog.entries.find((e) => e.event).event = 'cheat';
  assert.equal(attempt(() => validateNetState(state)).ok, false, 'an unknown event is refused');
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
  const ontoSafe = blends.filter((b) => groundAt(level, b.dx / TILE_WIDTH, b.dy / TILE_HEIGHT).kind === 'safe');
  assert.ok(ontoSafe.length > 0);
  assert.ok(ontoSafe.every((b) => b.dx / TILE_WIDTH === 3), 'onto the safe room only along its edge');
  assert.ok(ontoSafe.some((b) => b.side === 'e'));
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
  assert.deepEqual([...back.level.cobbleWalls].sort(), [...level.cobbleWalls].sort(), 'cobblestone walls');
  assert.deepEqual(back.level.grates, level.grates, 'floor grates');
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
  // Plate needs STR 15: Vesper (STR 9) cannot put it on at all; the fighter (STR 16) can, and is not slowed.
  const plate = { type: 'armor', name: 'Plate armour', value: 1, gear: 'armor', base: 'plate' };
  vesper.equipped = {};
  vesper.inventory = [plate];
  assert.equal(PlayerActions.moveWorn(vesper, { bag: 0 }, { slot: 'armor' }), null, 'too weak to wear plate');
  assert.match(vesper.rollLog.at(-1).text, /STR 15/, 'and says so');
  const fighter = playerAt(2, 2);
  fighter.inventory = [plate];
  assert.equal(PlayerActions.moveWorn(fighter, { bag: 0 }, { slot: 'armor' }).equipped.armor, plate);
  fighter.equipped = { armor: plate };
  assert.equal(characterSheet(fighter).speed, 30);
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

/** Puts a spell straight on a quick-bar square (at its own level unless told), as a bind in a safe room would. */
function boundOn(caster, slot, spell, level = SPELLS[spell].level) {
  const book = caster.spellbook ?? (caster.spellbook = { recovery: Array.from({ length: 20 }, () => 0) });
  const bound = Array.from({ length: 20 }, (_, i) => book.bound?.[i] ?? null);
  bound[slot] = { spell, level };
  book.bound = bound;
  return caster;
}

test('a bolt spell is rolled to hit and strikes with its effect; the spell then recovers before it can be cast again', () => {
  const level = arena(12, 6);
  const vesper = boundOn(casterAt(2, 2, 'wizard', 0), 0, 'fire_bolt');
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

test('magic missile\'s darts fly the aimed line one after another, not fanned out', () => {
  const level = arena(16, 6);
  const caster = boundOn(casterAt(2, 3, 'wizard', 2), 2, 'magic_missile');
  const volley = () => [...world.with('projectile')].filter((e) => e.projectile.spell === 'magic_missile');
  cast(level, caster, 1);
  for (let t = 0; t < 120 && volley().length === 0; t++) updateSpells(level);
  const darts = volley();
  assert.equal(darts.length, 3);
  for (const dart of darts) assert.deepEqual([Math.sign(dart.velocity.x), dart.velocity.y], [1, 0], 'every dart along the aim');
  for (let t = 0; t < 12; t++) updateSpells(level);
  // In launch order: the first away has the least life left.
  const xs = [...darts].sort((a, b) => a.projectile.life - b.projectile.life).map((d) => d.position.x);
  assert.ok(xs[0] > xs[1] && xs[1] > xs[2], 'each dart behind the one before it');
  assert.ok(darts.every((d) => d.position.y === darts[0].position.y), 'in single file');
});

test('magic missile always hits with its three darts; cast again too soon, it says how long it still needs', () => {
  const level = arena(12, 6);
  const vesper = boundOn(casterAt(2, 2, 'wizard', 2), 2, 'magic_missile');
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

test('a wizard starts with an empty quick bar, and a healing spell mends the caster by the dice + casting ability + Disciple of Life', async () => {
  const { quickBinding } = await load('rules/Spellbook');
  const level = arena(10, 6);
  const wizard = casterAt(2, 4, 'wizard', 0);
  assert.ok(Array.from({ length: 10 }, (_, slot) => quickBinding(wizard, slot)).every((b) => b === null), 'no spell bound for them (the second row holds their class features)');
  cast(level, wizard);
  assert.equal(wizard.casting, undefined, 'so nothing is cast');
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
  assert.ok(rollLines(hero).includes('Heal dice 2d10+4 = 24'));
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
  assert.equal(levelForXp(100000), 12);
  assert.equal(levelForXp(355000), 12, 'level 12 is the cap for now');
  assert.equal(nextLevelXp(1), 300);
  assert.equal(nextLevelXp(11), 100000);
  assert.equal(nextLevelXp(12), null, 'nothing past the cap');
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
  assert.equal(heroGains(CLASSES.fighter, 1).fightingStyles, 1, 'a fighter offers a style from level 1');
  assert.equal(heroGains(CLASSES.fighter, 9).fightingStyles, 1);
  assert.equal(heroGains(CLASSES.fighter, 10).fightingStyles, 2, 'and a second one at level 10 (a Champion takes it)');
  assert.equal(heroGains(CLASSES.fighter, 2).archetype, false);
  assert.equal(heroGains(CLASSES.fighter, 3).archetype, true, 'the Martial Archetype comes at level 3');
  assert.equal(heroGains(CLASSES.wizard, 1).fightingStyles, 0);
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
  assert.deepEqual([...CLASSES.wizard.spells], [], 'a wizard is given no spells: they bind what they choose');
  assert.deepEqual([...CLASSES.warlock.spells], ['eldritch_blast', 'chill_touch']);
  assert.equal(spellLevelFor(CLASSES.warlock, 'eldritch_blast'), 1);
  assert.equal(spellLevelFor(CLASSES.wizard, 'thunderwave'), 1, 'nothing waits for a later level');
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
  const picks = (style) => (style ? { fightingStyle: style } : null);
  const attack = (equipped, style) => weaponAttack(equipped, mods, 1, CLASSES.fighter, true, picks(style));
  assert.equal(attack({ primary: weapon('longbow') }, 'archery').attackBonus, attack({ primary: weapon('longbow') }, null).attackBonus + 2, 'Archery: +2 to hit at range');
  assert.equal(attack({ primary: weapon('longsword') }, 'archery').attackBonus, attack({ primary: weapon('longsword') }, null).attackBonus, 'not in melee');
  const sword = { primary: weapon('longsword'), secondary: shield };
  const short = { primary: weapon('shortsword'), secondary: shield };
  assert.equal(attack(short, 'dueling').damage.bonus, attack(short, null).damage.bonus + 2, 'Dueling: one-handed with a shield');
  assert.equal(attack(short, 'dueling').styleDamage, 2, 'told apart for the tooltip');
  assert.equal(attack(sword, 'dueling').damage.bonus, attack(sword, null).damage.bonus + 2, 'a versatile weapon beside a shield is held in one hand');
  assert.equal(attack({ primary: weapon('longbow') }, 'archery').styleHit, 2, 'Archery told apart for the tooltip');
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
  assert.equal(armorClass(breastplate, mods, CLASSES.fighter, picks('defense')).total, armorClass(breastplate, mods, CLASSES.fighter, null).total + 1);
  assert.equal(armorClass({}, mods, CLASSES.fighter, picks('defense')).total, armorClass({}, mods, CLASSES.fighter, null).total, 'no armour, no bonus');
  assert.equal(armorClass(breastplate, mods, CLASSES.fighter, { fightingStyle: 'archery', extraStyle: 'defense' }).total, armorClass(breastplate, mods, CLASSES.fighter, null).total + 1, 'a second style counts too');
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
  assert.equal(Build.hasChoices(fighter, 2, build), false);
  assert.equal(Build.levelHasChoice(fighter, 3, build), false, 'level 3 makes the hero a Champion: nothing to choose');
  hero.playerStats.level = 3;
  assert.equal(applyCustomization(hero, { kind: 'archetype', archetype: 'champion' }), true);
  assert.equal(applyCustomization(hero, { kind: 'archetype', archetype: 'battle_master' }), false, 'it is final');
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
  const sword = { ...WEAPONS[0], bonus: 2, weight: 1 };
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
  for (const kind of ['banner_red', 'bowl_apples', 'urn_broken', 'shelf_goods', 'cauldron']) assert.equal(isOpenable(kind), false, kind);
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

test('the game knows the spells of BG3 and no others, and every spell a class learns or casts is in it', async () => {
  const { existsSync, readFileSync } = await import('node:fs');
  const { CLASSES } = await load('rules/Classes');
  const list = JSON.parse(readFileSync(new URL('../src/data/spell-list.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(Spellbook.CATALOG).sort(), Object.keys(list.spells).sort());
  assert.ok(Spellbook.CATALOG.find_familiar && !Spellbook.CATALOG.find_familiar.castable, 'a BG3 spell the game does not cast yet is listed, not castable');
  assert.equal(Spellbook.CATALOG.wish, undefined, 'a D&D spell BG3 does not have is not');
  assert.equal(Spellbook.CATALOG.selunes_dream, undefined, 'nor one only an item gives');
  assert.equal(Spellbook.CATALOG.chill_touch.name, 'Bone Chill', 'spells go by their BG3 names');
  assert.equal(Spellbook.CATALOG.acid_splash.school, 'Conjuration', 'and schools');
  assert.equal(Spellbook.CATALOG.burning_hands.school, 'Evocation');
  const { SPELL_IDS } = await load('rules/Spells');
  for (const id of SPELL_IDS) assert.ok(Spellbook.CATALOG[id], `${id} can be cast, so it is in the list`);
  for (const cls of Object.values(CLASSES)) for (const id of cls.spells) assert.ok(Spellbook.CATALOG[id], `${cls.id} learns ${id}`);
  assert.equal(Spellbook.spellIconKey('fire_bolt'), 'spell_icon_fire_bolt', 'Fire Bolt has its icon');
  for (const [id, { img }] of Object.entries(list.spells)) {
    if (img) assert.ok(existsSync(new URL(`../public/${img}`, import.meta.url)), `${id}: ${img} is there`);
  }
});

test('the spells the game casts are the ones with numbers, and a heal with a radius mends the heroes near', async () => {
  const { SPELL_IDS } = await load('rules/Spells');
  for (const spell of Object.values(Spellbook.CATALOG)) assert.equal(spell.castable, SPELL_IDS.includes(spell.id), `${spell.id}: castable when it has its numbers in spells.json`);
  assert.equal(Spellbook.canBind('wizard', 5, 'fly', 3), false, 'a spell not cast yet is not bound');
  const level = arena(12, 6);
  const cleric = casterAt(2, 2, 'cleric', 0);
  const ally = playerAt(3, 2);
  const far = playerAt(10, 4);
  for (const hero of [cleric, ally, far]) hero.health.current = 1;
  cleric.playerStats.level = 3;
  assert.equal(bindSpell(cleric, 0, 'prayer_of_healing', 2), true);
  cast(level, cleric, 90);
  assert.ok(cleric.health.current > 1 && ally.health.current > 1, 'the caster and the ally beside them are mended');
  assert.equal(far.health.current, 1, 'a hero out of reach is not');
});

test('the sheet marks each class\'s key abilities: its primary one and the one it casts with', async () => {
  const { characterSheet, keyAbilities } = await load('rules/CharacterSheet');
  const keys = (cls) => [...keyAbilities(characterSheet(createPlayer(0, 0, cls)))].sort();
  assert.deepEqual(keys('wizard'), ['intelligence']);
  assert.deepEqual(keys('cleric'), ['wisdom']);
  assert.deepEqual(keys('warlock'), ['charisma']);
  assert.deepEqual(keys('rogue'), ['dexterity']);
  const fighter = createPlayer(0, 0, 'fighter');
  const sheet = characterSheet(fighter);
  const better = sheet.scores.strength >= sheet.scores.dexterity ? 'strength' : 'dexterity';
  assert.deepEqual([...keyAbilities(sheet)], [better], 'a Fighter: STR or DEX, whichever is higher');
});

test('the bag holds 120 items over 20 rows, and a guest\'s full bag still passes the network checks', async () => {
  const { INVENTORY_COLS, INVENTORY_ROWS } = await load('game/PlayerActions');
  assert.equal(PlayerActions.MAX_INVENTORY, INVENTORY_COLS * INVENTORY_ROWS);
  assert.equal(PlayerActions.MAX_INVENTORY, 120);
});

test('every spell of the lists is read with a range, the classes that learn it and the hero level they do', () => {
  const spells = Object.values(Spellbook.CATALOG);
  assert.ok(spells.length > 150 && spells.length < 250, 'the game\'s own list (src/data/spell-list.json, the BG3 spells)');
  for (const spell of spells) {
    assert.ok(Object.values(spell.classes).every((level) => level >= 1 && level <= 20), `${spell.id} is learnt at a real hero level`);
  }
  // Only a subclass learns these in BG3 (a Hexblade, a Death Domain cleric): no hero learns them yet.
  assert.deepEqual(Spellbook.CATALOG.booming_blade.classes, {});
  assert.deepEqual(Spellbook.CATALOG.burning_hands.classes, { wizard: 1, sorcerer: 1, warlock: 1 }, 'a spell level opens with the class');
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
  assert.equal(Spellbook.cooldownSeconds('fireball', 3), 16, 'its own recovery from spells.json');
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
  const cure = Spellbook.CATALOG.cure_wounds;
  assert.deepEqual(Spellbook.castLevels('cleric', 1, cure), [1]);
  assert.deepEqual(Spellbook.castLevels('cleric', 3, cure), [1, 2], 'a third-level cleric may bind Cure Wounds at level 2');
  assert.deepEqual(Spellbook.castLevels('cleric', 1, Spellbook.CATALOG.sacred_flame), [0], 'a cantrip has one level');
});

test('a hero binds only spells their class has learnt, at levels they can cast; a bound spell replaces the class order', () => {
  const cleric = createPlayer(0, 0, 'cleric');
  assert.deepEqual(Spellbook.quickBinding(cleric, 0), { spell: 'sacred_flame', level: 0 }, 'the class order until something is bound');
  assert.equal(bindSpell(cleric, 3, 'cure_wounds', 1), false, 'spells are prepared only in a safe room');
  cleric.inSafeRoom = true;
  assert.equal(bindSpell(cleric, 3, 'fireball', 3), false, 'a cleric does not learn Fireball');
  assert.equal(bindSpell(cleric, 3, 'cure_wounds', 2), false, 'no level 2 slots yet');
  assert.equal(bindSpell(cleric, 3, 'cure_wounds', 1), true);
  assert.deepEqual(Spellbook.quickBinding(cleric, 3), { spell: 'cure_wounds', level: 1 });
  assert.deepEqual(Spellbook.quickBinding(cleric, 0), { spell: 'sacred_flame', level: 0 }, 'the other squares keep theirs');
  cleric.playerStats.level = 3;
  assert.equal(bindSpell(cleric, 3, 'cure_wounds', 2), true);
  assert.equal(Spellbook.quickBinding(cleric, 3).level, 2);
  assert.equal(bindSpell(cleric, 13, 'cure_wounds', 1), true, 'the second row takes spells too');
  assert.equal(bindSpell(cleric, 20, 'cure_wounds', 1), false, 'there are twenty squares');
  assert.ok(validCommand({ kind: 'bind_spell', slot: 3, spell: 'cure_wounds', level: 2 }));
  assert.ok(!validCommand({ kind: 'bind_spell', slot: 3, spell: 'not_a_spell', level: 2 }));
  assert.ok(!validCommand({ kind: 'bind_spell', slot: 20, spell: 'cure_wounds', level: 2 }));
});

test('the quick bar\'s second row holds the hero\'s active class features until something else is bound there', () => {
  const fighter = createPlayer(0, 0, 'fighter');
  assert.deepEqual(Spellbook.quickBinding(fighter, 10), { spell: 'feature:second_wind', level: 0 });
  assert.equal(Spellbook.quickBinding(fighter, 11), null, 'Action Surge comes at level 2');
  fighter.playerStats.level = 2;
  assert.deepEqual(Spellbook.quickBinding(fighter, 11), { spell: 'feature:action_surge', level: 0 });
});

test('a spell cast at a higher level hits harder and recovers more slowly; any spell on the list can be cast', () => {
  const level = arena(12, 6);
  const wizard = casterAt(2, 2, 'wizard', 0);
  wizard.playerStats.level = 5;
  assert.equal(bindSpell(wizard, 0, 'burning_hands', 3), true);
  cast(level, wizard, 1);
  const stretched = SPELLS.burning_hands.recoveryTicks + 2 * Spellbook.UPCAST_COOLDOWN_SECONDS * 60;
  assert.equal(wizard.spellbook.recovery[0], stretched, 'two levels above its own, so a longer recovery');
  assert.equal(wizard.casting.level, 3);
  // A first-level wizard keeps two first-level spells on the bar: Ice Knife takes Magic Missile's square.
  const mage = casterAt(2, 4, 'wizard', 2);
  assert.equal(bindSpell(mage, 2, 'ice_knife', 1), true);
  cast(level, mage, 1);
  assert.equal(mage.casting?.spell, 'ice_knife', 'every spell on the list is cast');
});

test('a guest\'s synced spellbook is checked: bound spells must be real', () => {
  arena(8, 6);
  const hero = playerAt(2, 2, 'cleric');
  world.addComponent(hero, 'playerSlot', 'host');
  bindSpell(hero, 3, 'cure_wounds', 1);
  const good = () => JSON.parse(JSON.stringify(captureWorld(false, 7)));
  assert.doesNotThrow(() => validateNetState(good()));
  const tampered = (bound) => { const w = good(); w.entities.find((e) => e.data.spellbook).data.spellbook.bound = bound; return w; };
  assert.throws(() => validateNetState(tampered([null, null, null, { spell: 'made_up', level: 1 }])), ValidationError);
  assert.throws(() => validateNetState(tampered([null, null, null, { spell: 'cure_wounds', level: 12 }])), ValidationError);
  assert.throws(() => validateNetState(tampered(Array(21).fill(null))), ValidationError, 'only twenty squares');
});

test('a spell tooltip is short (kind, range, attack, the start of its text); "More info" holds the whole text and numbers', async () => {
  const { shortText, spellTopic } = await load('ui/SpellTopics');
  const sickness = Spellbook.CATALOG.ray_of_sickness;
  const base = spellTopic(sickness, 1, 3);
  const upgraded = spellTopic(sickness, 2, 3);
  assert.ok(base.body.startsWith('A ray of sickening greenish energy') && base.body.endsWith('...'), 'the start of the text, cut short');
  assert.ok(base.body.length <= 110);
  assert.deepEqual(base.detail.slice(0, 2), ['Level 1 Necromancy', 'Range: 60 ft (576 px)']);
  assert.ok(base.more.body.includes('A ray of sickening greenish energy') && base.more.body.includes('2nd level or higher'), 'the whole text and its higher levels');
  assert.ok(base.more.detail.includes('Range: 60 ft (576 px)') && base.more.detail.includes('Cooldown: 5.0s'), 'range in feet and px, five seconds');
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
  Binding.beginBinding({ spell: 'cure_wounds', level: 2 });
  assert.equal(isInventoryOpen(), false, 'the inventory shuts while a square is chosen');
  Binding.finishBinding(cleric, 4);
  assert.deepEqual(Spellbook.quickBinding(cleric, 4), { spell: 'cure_wounds', level: 2 });
  assert.equal(Binding.pendingBinding(), null);
  assert.equal(isInventoryOpen(), true, 'and comes back');
  Binding.beginBinding({ spell: 'cure_wounds', level: 1 });
  Binding.cancelBinding();
  assert.equal(Binding.pendingBinding(), null, 'giving up binds nothing');
  assert.deepEqual(Spellbook.quickBinding(cleric, 4), { spell: 'cure_wounds', level: 2 });
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
  assert.ok(at('fighter', 20).includes('extra_attack_3') && !at('fighter', 20).includes('protection'), 'Protection only for the style');
  assert.ok(at('fighter', 11).includes('improved_extra_attack') && !at('fighter', 11).includes('extra_attack'), 'Improved Extra Attack takes the place of Extra Attack');
  assert.ok(Features.featuresAt('fighter', 1, { fightingStyle: 'protection' }).some((f) => f.id === 'protection'));
  assert.ok(Features.featuresAt('fighter', 1, { extraStyle: 'protection' }).some((f) => f.id === 'protection'), 'a second style opens it too');
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
  assert.equal(fighter.actionSurge, 6 * 60, 'Action Surge doubles the attacks for 6 seconds');
  assert.ok(fighter.spellbook.recovery[3] > 0, 'the rest of the bar keeps recovering');
  assert.equal(fighter.spellbook.recovery[1], 60 * 60, 'and it recovers for a minute itself');
  const wizard = boundOn(casterAt(2, 4, 'wizard', 0), 2, 'magic_missile');
  bindSpell(wizard, 0, 'feature:arcane_recovery', 0);
  wizard.spellbook.recovery[2] = 300;
  assert.equal(usedFeature(wizard, 'arcane_recovery', 0, level), 'ok');
  assert.equal(wizard.spellbook.recovery[2], 0);
  assert.equal(usedFeature(wizard, 'indomitable', 0, level), 'unworked', 'not played out yet');
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
  const longest = { ...WEAPONS[0], name: 'Rusted Axe of the Goblin King' };
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

test('a castle is built of its own pieces alone: no caves, no cobble, castle props, spike pits and pools', async () => {
  const { isCastleProp, PROPS: ALL_PROPS } = await load('level/Props');
  const { encodeLevelMap, decodeLevelMap } = await load('level/LevelMap');
  const { layout, level } = buildDungeon(4242, true, 'castle');
  assert.equal(level.theme, 'castle');
  assert.equal(level.caveFloor.size, 0, 'no cave halls');
  assert.equal(level.cobbleWalls.size, 0, 'no catacomb cobblestone');
  const gathering = layout.rooms.filter((r) => r.type !== 'dungeon');
  const inGathering = (p) => gathering.some((r) => p.tx >= r.x - 1 && p.tx < r.x + r.w + 1 && p.ty >= r.y - 1 && p.ty < r.y + r.h + 1);
  const foreign = layout.props.filter((p) => !inGathering(p) && !isCastleProp(p.kind));
  assert.deepEqual(foreign.map((p) => p.kind), [], 'the castle rooms hold castle things only (the safe and exit rooms keep theirs)');
  assert.ok(layout.props.some((p) => ALL_PROPS[p.kind].image.startsWith('light_')) || layout.torchPositions.length > 0, 'lit by its own lights');
  for (const pit of level.pits) assert.equal(pit.shape, 'spikes');
  for (const pool of level.pools) assert.equal(level.getTile(pool.x + 1, pool.y + 1).type, TileType.Obstacle, 'a pool is not walked through');
  const back = decodeLevelMap(JSON.parse(JSON.stringify(encodeLevelMap(layout))));
  assert.equal(back.level.theme, 'castle');
  assert.deepEqual(back.level.pools, level.pools);
  assert.deepEqual(back.props, layout.props, 'props, a column moved to the middle of its pool too');
});

test('a castle\'s spike pit swallows whoever steps over its dark inside, not its frame', () => {
  const level = arena(12, 8);
  for (let x = 3; x < 7; x++) for (const y of [3, 4]) level.setTile(x, y, createTile(TileType.Hole));
  level.addPit({ x: 3, y: 3, shape: 'spikes', lobes: 0 });
  assert.ok(level.overPit(3 * TILE_WIDTH + 64, 3 * TILE_WIDTH + 30), 'its middle');
  assert.ok(!level.overPit(3 * TILE_WIDTH + 3, 3 * TILE_WIDTH + 30), 'its frame, at the west end of its tiles');
  const player = playerAt(5, 4);
  player.position.y = 3 * TILE_WIDTH + 40;
  updateHoles(level);
  assert.ok(player.falling);
});

test('the console\'s /dungeon builds the level again as a castle or the catacombs', async () => {
  const { runCommand } = await load('game/Console');
  const asked = [];
  const ctx = { player: playerAt(2, 2), allowed: true, rebuild: (theme) => asked.push(theme) };
  runCommand('/dungeon castle', ctx);
  runCommand('/dungeon catacomb', ctx);
  assert.deepEqual(asked, ['castle', 'catacomb']);
  assert.match(runCommand('/dungeon moon', ctx)[0], /Usage/);
});

test('the isometric castle is built of its own pieces: slanted corners and corridors, chasms, stairs, its props and foes; its map keeps them', async () => {
  const { isIsoProp } = await load('level/Props');
  const { encodeLevelMap, decodeLevelMap } = await load('level/LevelMap');
  let chasms = 0;
  let stairs = 0;
  let slantedCorridors = 0;
  for (const seed of [7, 11, 23, 31]) {
    world.clear();
    const { layout, level } = buildDungeon(seed, true, 'castle2');
    assert.equal(level.theme, 'castle2');
    assert.ok(level.slopes.size > 0, 'corners cut off on the slant');
    assert.ok(level.floorZones.length > 0, 'floors laid in tones');
    assert.deepEqual(layout.torchPositions, [], 'no torches: crystal braziers light it');
    const portals = ['portal_stairs', 'portal_dark', 'castle_candelabra'];
    assert.deepEqual(layout.props.filter((p) => !isIsoProp(p.kind) && !portals.includes(p.kind)).map((p) => p.kind), [], 'its own props only (and the portals)');
    assert.ok(layout.props.some((p) => p.kind.startsWith('iso_brazier')), 'braziers');
    const foes = [...world.with('mobType')].map((m) => m.mobType);
    assert.ok(foes.length > 0 && foes.every((t) => t === 'shade' || t === 'grick'), 'haunted by its own foes');
    const inRoom = (x, y) => layout.rooms.some((r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h);
    for (const [i, slope] of level.slopes) {
      const x = i % level.width;
      const y = Math.floor(i / level.width);
      assert.equal(level.getTile(x, y).type, slope.major ? TileType.Wall : TileType.Floor, 'a slant\'s major tile is wall, its minor one floor');
      const south = slope.corner === 'sw' || slope.corner === 'se';
      if (south && !level.slopes.has(i + level.width)) assert.equal(level.getTile(x, y + 1).type, TileType.Wall, 'wall under a south slant');
      if (!inRoom(x, y)) slantedCorridors++;
    }
    for (let i = 0; i < level.width * level.height; i++) chasms += level.isChasm(i % level.width, Math.floor(i / level.width)) ? 1 : 0;
    stairs += level.stairs.length;
    const floor = (x, y) => level.getTile(x, y).type === TileType.Floor && !level.slopes.has(x + y * level.width);
    const wall = (x, y) => level.getTile(x, y).type === TileType.Wall;
    for (const s of level.stairs) {
      // Only across a straight north–south corridor two tiles wide.
      for (const y of [s.y, s.y + 1]) assert.ok(floor(s.x, y) && floor(s.x + 1, y) && wall(s.x - 1, y) && wall(s.x + 2, y), 'stairs across a corridor');
    }
    assert.ok(![...level.wallDecor.values()].includes('isoAlcove'), 'the stairs art is never set into a face');
    const back = decodeLevelMap(JSON.parse(JSON.stringify(encodeLevelMap(layout))));
    assert.equal(back.level.theme, 'castle2');
    assert.deepEqual([...back.level.slopes], [...level.slopes]);
    assert.deepEqual(back.level.floorZones, level.floorZones);
    assert.deepEqual(back.level.stairs, level.stairs);
  }
  assert.ok(chasms > 0, 'some rooms are cut by chasms or sunk in pits');
  assert.ok(stairs > 0, 'some corridors have stairs');
  assert.ok(slantedCorridors > 0, 'some corridors run down the slant');
});

test('a slanted wall pushes a body back over its slant (it slides along it); a chasm stops bodies, not shots or sight', async () => {
  const { slopeClearance } = await load('level/Slopes');
  const level = new Level(12, 10, 'castle2');
  // A north-west corner cut off on the slant across tiles (2,2) and (3,2): the slant runs from (2,3) up to (4,2).
  level.setTile(2, 2, createTile(TileType.Wall));
  level.slopes.set(2 + 2 * 12, { corner: 'nw', major: true });
  level.slopes.set(3 + 2 * 12, { corner: 'nw', major: false });
  const minor = level.slopes.get(3 + 2 * 12);
  assert.ok(level.blocksPoint(3 * TILE_WIDTH + 2, 2 * TILE_WIDTH + 2), 'the corner of wall in the minor tile');
  assert.ok(!level.blocksPoint(3 * TILE_WIDTH + 20, 2 * TILE_WIDTH + 20), 'the rest of it is floor');
  assert.ok(level.blocksPoint(2 * TILE_WIDTH + 10, 2 * TILE_WIDTH + 10), 'most of the major tile is wall');
  assert.ok(!level.blocksPoint(2 * TILE_WIDTH + 30, 2 * TILE_WIDTH + 30), 'but not its far corner');
  const pos = { x: 3 * TILE_WIDTH + 6, y: 2 * TILE_WIDTH + 6 };
  level.pushOutOfSlopes(pos, 4, 4);
  assert.ok(slopeClearance(minor, 3, 2, pos.x - 4, pos.y - 4) > -0.01, 'its top-left corner is back on the slant');
  assert.ok(pos.x > 3 * TILE_WIDTH + 6 && pos.y > 2 * TILE_WIDTH + 6, 'pushed down and to the right, along the slant\'s normal');
  assert.ok(!level.getClipBBs(3 * TILE_WIDTH, 2 * TILE_WIDTH, 4, 4).some((b) => b.contains(3 * TILE_WIDTH + 20, 2 * TILE_WIDTH + 20)),
    'no box over the slope tiles: the slant pushes on its own');

  level.setTile(6, 5, createTile(TileType.Hole));
  assert.ok(level.isChasm(6, 5));
  assert.ok(level.getClipBBs(6 * TILE_WIDTH + 16, 4 * TILE_WIDTH + 16, 4, 4).some((b) => b.contains(6 * TILE_WIDTH + 16, 5 * TILE_WIDTH + 28)),
    'a chasm is a box nobody walks into');
  assert.ok(!level.blocksPoint(6 * TILE_WIDTH + 16, 5 * TILE_WIDTH + 16), 'shots fly over it');
  assert.ok(level.checkLineOfSight(5 * TILE_WIDTH + 16, 5 * TILE_WIDTH + 16, 8 * TILE_WIDTH + 16, 5 * TILE_WIDTH + 16), 'and sight crosses it');
  assert.ok(!level.canHold(6 * TILE_WIDTH + 16, 5 * TILE_WIDTH + 16), 'nothing is set down in it');
  const { WALL_SINK } = await load('level/Level');
  assert.ok(level.getClipBBs(6 * TILE_WIDTH + 16, 4 * TILE_WIDTH + 16, 4, 4).every((b) => !b.contains(6 * TILE_WIDTH + 16, 5 * TILE_WIDTH + WALL_SINK - 2)),
    'feet reach over its north rim as over a wall\'s');
});

test('a south slant lets feet reach behind its rim as a south wall does, into the tile under it, and no further', () => {
  const level = new Level(12, 10, 'catacomb');
  // A south-east corner cut off on the slant across tiles (5,4) (major) and (4,4) (minor); wall under both.
  for (let x = 0; x < 12; x++) level.setTile(x, 5, createTile(TileType.Wall));
  level.setTile(5, 4, createTile(TileType.Wall));
  level.slopes.set(5 + 4 * 12, { corner: 'se', major: true });
  level.slopes.set(4 + 4 * 12, { corner: 'se', major: false });
  // The minor tile's slant runs from its bottom-left corner up to the middle of its right edge.
  const left = 4 * TILE_WIDTH + 2;
  assert.ok(!level.blocksPoint(left, 5 * TILE_WIDTH + 20), 'feet reach past the slant into the wall tile under it');
  assert.ok(level.blocksPoint(left, 5 * TILE_WIDTH + 30), 'but no further than a wall lets them');
  assert.ok(!level.getClipBBs(left, 5 * TILE_WIDTH, 4, 4).some((b) => b.contains(left, 5 * TILE_WIDTH + 10)), 'the tile under the slant has no box of its own');
  const pos = { x: left + 6, y: 5 * TILE_WIDTH + 20 };
  level.pushOutOfSlopes(pos, 4, 4);
  assert.ok(pos.y < 5 * TILE_WIDTH + 20 && pos.x < left + 6, 'a body pushed back out of it, up and to the left');
  // A straight south wall beside it lets feet in just as far.
  assert.ok(!level.blocksPoint(2 * TILE_WIDTH + 16, 5 * TILE_WIDTH + 20) && level.blocksPoint(2 * TILE_WIDTH + 16, 5 * TILE_WIDTH + 30));
});

test('spells and arrows fly over a castle pool, which nobody wades into', () => {
  const level = new Level(12, 10, 'castle');
  for (let y = 3; y < 6; y++) for (let x = 3; x < 7; x++) level.setTile(x, y, createTile(TileType.Obstacle));
  level.addPool({ x: 3, y: 3, kind: 'water' });
  assert.ok(!level.blocksPoint(4 * TILE_WIDTH + 16, 4 * TILE_WIDTH + 16), 'shots cross it');
  assert.ok(level.getClipBBs(4 * TILE_WIDTH + 16, 2 * TILE_WIDTH + 16, 4, 4).some((b) => b.contains(4 * TILE_WIDTH + 16, 3 * TILE_WIDTH + 16)), 'bodies do not');
  level.setTile(8, 4, createTile(TileType.Obstacle));
  assert.ok(level.blocksPoint(8 * TILE_WIDTH + 16, 4 * TILE_WIDTH + 16), 'other furniture still stops them');
});

test('the console\'s /dungeon builds the level as the isometric castle or the mines too', async () => {
  const { runCommand } = await load('game/Console');
  const asked = [];
  const ctx = { player: playerAt(2, 2), allowed: true, rebuild: (theme) => asked.push(theme) };
  runCommand('/dungeon castle2', ctx);
  runCommand('/dungeon mines', ctx);
  assert.deepEqual(asked, ['castle2', 'mines']);
  assert.match(runCommand('/dungeon', ctx)[0], /<catacomb \| castle \| castle2 \| mines>/, 'the usage lists every kind, spaced');
});

test('the console\'s /freeze stops every enemy and its blows until switched off; /killall kills them all', async () => {
  const { runCommand } = await load('game/Console');
  const { cheats } = await load('game/Cheats');
  const { updateDeath } = await load('systems/DeathSystem');
  const level = arena(10, 6);
  const player = playerAt(4, 2);
  const mob = mobAt(level, 'goblin', 5, 2);
  const other = mobAt(level, 'orc', 7, 3);
  engage(mob, player, 0);
  const ctx = { player, allowed: true };
  try {
    assert.match(runCommand('/freeze', ctx)[0], /frozen/);
    const at = { ...mob.position };
    const before = player.health.current;
    for (let tick = 1; tick <= 180; tick++) {
      tickWorld(level, tick);
      updateContactDamage(level);
    }
    assert.deepEqual(mob.position, at, 'it stands where it stood');
    assert.equal(player.health.current, before, 'and strikes nobody');
    assert.match(runCommand('/freeze off', ctx)[0], /again/);
    assert.equal(cheats.foesFrozen, false);
    assert.match(runCommand('/freeze sideways', ctx)[0], /Usage/);
  } finally {
    cheats.foesFrozen = false;
  }
  assert.match(runCommand('/killall', ctx)[0], /Killed 2/);
  assert.ok(mob.health.current <= 0 && other.health.current <= 0);
  updateDeath(level);
  assert.match(runCommand('/killall', ctx)[0], /Killed 0/, 'the dead are not killed twice');
});

test('every theme\'s south walls are drawn raised over the floor', async () => {
  const { buildTerrainPieces } = await load('level/TerrainAutotile');
  const { SOUTH_WALL_RAISE } = await load('level/Theme');
  for (const theme of ['catacomb', 'castle', 'castle2', 'mines']) {
    const level = new Level(8, 8, theme);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) level.setTile(x, y, createTile(x === 0 || y === 0 || x === 7 || y >= 5 ? TileType.Wall : TileType.Floor));
    const wallTop = 5 * TILE_WIDTH;
    // The pieces sorted at the south wall's row (they cover whoever steps up to it) reach up over the floor by the raise.
    const top = Math.min(...buildTerrainPieces(level).filter((p) => p.z === 6 * TILE_WIDTH && p.dx === 3 * TILE_WIDTH).map((p) => p.dy));
    assert.equal(top, wallTop - SOUTH_WALL_RAISE[theme], theme);
  }
  assert.ok(Object.values(SOUTH_WALL_RAISE).every((raise) => raise > 0));
});

test('the mines are built as caverns: tall faces cut short under thin rock, spurs, fenced drops, lanterns', async () => {
  const { buildTerrainPieces } = await load('level/TerrainAutotile');
  const { FACE_FOOT, MINE_FACES, MINE_CUT_FACES, MINE_RIM_N } = await load('level/MineTiles');
  const { dungeonConfig } = await load('level/generators/DungeonConfig');
  const { PROPS } = await load('level/Props');
  const { encodeLevelMap, decodeLevelMap } = await load('level/LevelMap');
  // A room under 5 rows of rock, and one with a corridor only two rows of rock above its face.
  const level = new Level(12, 16, 'mines');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 12; x++) {
    const open = (y >= 6 && y <= 9 && x >= 1 && x <= 5) || (y === 3 && x >= 7 && x <= 10) || (y >= 6 && y <= 9 && x >= 7 && x <= 10);
    level.setTile(x, y, createTile(open ? TileType.Floor : TileType.Wall));
  }
  const pieces = buildTerrainPieces(level);
  const isArt = (p, art) => p.sx === art.x && p.sy === art.y && p.w === art.w && p.h === art.h;
  const full = pieces.find((p) => p.dx === 2 * TILE_WIDTH && p.z === 5 * TILE_WIDTH && isArt(p, MINE_FACES[2]));
  assert.ok(full, 'a face stands over the room');
  assert.equal(full.dy + FACE_FOOT, 6 * TILE_WIDTH, 'its foot on the room\'s top edge');
  // Two rows of rock behind it: the face cut to them, its lip kept over its lowest stones.
  const cutIndex = pieces.findIndex((p) => p.dx === 8 * TILE_WIDTH && p.z === 5 * TILE_WIDTH && isArt(p, MINE_CUT_FACES[1][8 % 3]));
  const cut = pieces[cutIndex];
  assert.ok(cut, 'the face under the corridor is cut short, from the art of a face two rows tall');
  assert.equal(cut.dy + FACE_FOOT - (MINE_FACES[0].h - cut.h), 6 * TILE_WIDTH, 'its foot where a whole face\'s would be');
  assert.ok(cut.dy >= 4 * TILE_WIDTH, 'and stays off the corridor\'s floor');
  const rimIndex = pieces.findIndex((p) => p.dx === 8 * TILE_WIDTH && p.sy === MINE_RIM_N[0].y && p.sx === MINE_RIM_N[8 % 3].x && p.z === cut.z);
  assert.ok(rimIndex >= 0 && rimIndex < cutIndex, 'the corridor\'s rim is drawn over the cut, before the face so its lip lies over the rock\'s dark');

  // Whole levels: bigger maps, caverns with spurs on the slant, drops fenced here and there, lit by lanterns, no torches.
  const cfg = dungeonConfig('mines', 7);
  assert.ok(cfg.mapWidth > DEFAULT_CONFIG.mapWidth && cfg.northMargin > DEFAULT_CONFIG.northMargin);
  const layout = new DungeonBuilder(cfg).build();
  const L = layout.level;
  assert.equal(L.theme, 'mines');
  assert.equal(layout.torchPositions.length, 0);
  assert.ok(L.slopes.size > 0, 'caverns have slanted walls');
  assert.ok(layout.props.some((p) => PROPS[p.kind].glow && p.kind.startsWith('mine_lantern')), 'lanterns light them');
  assert.ok(L.floorZones.some((z) => z.patch), 'patches of other earth lie about');
  const decoded = decodeLevelMap(JSON.parse(JSON.stringify(encodeLevelMap(layout))));
  assert.equal(decoded.level.theme, 'mines');
  assert.deepEqual(decoded.level.floorZones, L.floorZones, 'patches go to co-op guests');
  assert.deepEqual(decoded.level.pits, L.pits, 'and the holes in the floor');
});

test('mine caverns: holes and drops to fall into, fenced only in part, timbering on whole faces, no floor cut off', async () => {
  const { dungeonConfig } = await load('level/generators/DungeonConfig');
  const { PROPS } = await load('level/Props');
  let holes = 0;
  let fenced = 0;
  let unfenced = 0;
  for (const seed of [3, 7, 11, 19]) {
    const layout = new DungeonBuilder(dungeonConfig('mines', seed)).build();
    const L = layout.level;
    const W = L.width;
    holes += L.pits.filter((p) => p.shape === 'hole').length;
    for (const p of layout.props) {
      const def = PROPS[p.kind];
      assert.ok(!p.kind.startsWith('mine_log') && !p.kind.startsWith('mine_support'), 'no loose lengths of beam lie about');
      if (p.kind === 'mine_fence' || p.kind === 'mine_fence_front') {
        assert.equal(L.getTile(p.tx, p.ty).type, TileType.Obstacle, 'a fence stops whoever walks into it');
        assert.ok(L.blockBoxes.has(p.tx + p.ty * W), 'along the strip at its foot');
        const guards = p.kind === 'mine_fence' ? p.ty + 1 : p.ty - 1;
        assert.ok(L.isChasm(p.tx, guards), 'it stands at a drop\'s edge');
      }
      if (def.mount === 'foot' && p.kind.startsWith('mine_frame')) {
        for (let k = 1; k <= 5; k++) assert.equal(L.getTile(p.tx, p.ty - k).type, TileType.Wall, 'timbering stands against a whole face');
      }
    }
    // Brinks of the drops left open, to fall from.
    for (let y = 1; y < L.height - 1; y++) for (let x = 0; x < W; x++) {
      if (!L.isChasm(x, y + 1) || L.getTile(x, y).type === TileType.Wall || L.slopes.has(x + y * W)) continue;
      if (L.getTile(x, y).type === TileType.Obstacle) fenced++;
      else unfenced++;
    }
    // Every bit of floor can be walked to from the start.
    const start = Math.floor(layout.playerSpawn.x / TILE_WIDTH) + Math.floor(layout.playerSpawn.y / TILE_WIDTH) * W;
    const reached = reachableTiles(tileGraphOf(L), start, (_f, to) => (L.getTile(to % W, Math.floor(to / W)).type === TileType.Floor ? 1 : Infinity));
    for (let i = 0; i < W * L.height; i++) {
      if (L.getTile(i % W, Math.floor(i / W)).type === TileType.Floor) assert.equal(reached[i], 1, `floor at ${i % W},${Math.floor(i / W)} is reached`);
    }
  }
  assert.ok(holes > 0, 'holes open in the floor');
  assert.ok(fenced > 0 && unfenced > fenced, 'drops are fenced along stretches, not all round');
});

test('mine rock is rimmed on every side floor touches, its dark cut by world position, faces running on into slanted ones', async () => {
  const { buildTerrainPieces } = await load('level/TerrainAutotile');
  const { MINE_FILL, MINE_RIM_N, MINE_RIM_W, MINE_KNOT, RIM_DEPTH, RIM_INSET, MINE_FACE_END_LEFT, MINE_FACE_END_RIGHT } = await load('level/MineTiles');
  const { SOUTH_WALL_RAISE } = await load('level/Theme');
  const { dungeonConfig } = await load('level/generators/DungeonConfig');
  // A hall along the top, a corridor down the west side, rock everywhere else (no face: the rock runs to the map's foot).
  const level = new Level(10, 10, 'mines');
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    const open = (y >= 1 && y <= 2 && x >= 1 && x <= 8) || (x >= 1 && x <= 2 && y >= 3 && y <= 8);
    level.setTile(x, y, createTile(open ? TileType.Floor : TileType.Wall));
  }
  const pieces = buildTerrainPieces(level);
  const at = (tx, ty) => pieces.filter((p) => p.dx >= tx * TILE_WIDTH && p.dx < (tx + 1) * TILE_WIDTH && p.dy >= ty * TILE_WIDTH - 16 && p.dy < (ty + 1) * TILE_WIDTH && !p.floor);
  const isFill = (p) => p.sx >= MINE_FILL.x && p.sx + p.w <= MINE_FILL.x + MINE_FILL.w && p.sy >= MINE_FILL.y && p.sy + p.h <= MINE_FILL.y + MINE_FILL.h && p.sy < MINE_RIM_N[0].y + 64 && p.sx < 64;
  // The rock's corner by the hall and the corridor: rims north and west, turning round the corner with a knot.
  const corner = at(3, 3);
  const raise = SOUTH_WALL_RAISE.mines;
  const north = corner.find((p) => p.sy === MINE_RIM_N[0].y && p.sx === MINE_RIM_N[3 % 3].x + RIM_DEPTH);
  assert.ok(north && north.dy === 3 * TILE_WIDTH - raise && north.z === 4 * TILE_WIDTH, 'its north rim, raised over the hall and drawn over feet');
  assert.ok(corner.some((p) => p.sx === MINE_RIM_W[(3 - (3 % 3)) % 3].x && p.dx === 3 * TILE_WIDTH), 'its west rim');
  assert.ok(corner.some((p) => p.sx === MINE_KNOT.x && p.sy === MINE_KNOT.y), 'a knot of rim where the two meet');
  // Down the corridor: the west rim runs on, the earth showing between its rings, the rock's dark inside it.
  const side = at(3, 6);
  assert.ok(side.some((p) => p.sx === MINE_RIM_W[(3 - (6 % 3)) % 3].x && p.z === undefined), 'the west rim lies under everyone');
  assert.ok(pieces.some((p) => p.floor && p.dx === 3 * TILE_WIDTH && p.dy === 6 * TILE_WIDTH), 'earth under the rock beside the corridor');
  const fills = pieces.filter((p) => !p.floor && p.sx < 64 && p.sy < 64 && p.w <= 32 && p.h <= 32 && !(p.sx === MINE_KNOT.x && p.sy === MINE_KNOT.y));
  assert.ok(fills.some((p) => p.dx === 3 * TILE_WIDTH + RIM_INSET && p.dy === 6 * TILE_WIDTH), 'the dark starts inside the rim');
  for (const p of fills) {
    assert.ok(isFill(p), 'the dark is cut from its window');
    assert.equal(p.sx - MINE_FILL.x, ((p.dx % 32) + 32) % 32, 'by world position across');
    assert.equal(p.sy - MINE_FILL.y, ((p.dy % 32) + 32) % 32, 'and down, so every piece of it runs on');
  }

  // In whole levels, a face running on into a slanted one has no end drawn between them.
  for (const seed of [7, 11]) {
    const L = new DungeonBuilder(dungeonConfig('mines', seed)).build().level;
    const all = buildTerrainPieces(L);
    const W = L.width;
    const northSlope = (x, y) => { const s = L.slopes.get(x + y * W); return !!s && (s.corner === 'nw' || s.corner === 'ne'); };
    let checked = 0;
    for (let y = 1; y < L.height - 1; y++) for (let x = 1; x < W - 1; x++) {
      const foot = L.getTile(x, y).type === TileType.Wall && !L.slopes.has(x + y * W) && L.getTile(x, y + 1).type === TileType.Floor && !L.slopes.has(x + (y + 1) * W);
      if (!foot) continue;
      for (const [end, side] of [[MINE_FACE_END_LEFT, -1], [MINE_FACE_END_RIGHT, 1]]) {
        if (!northSlope(x + side, y + 1)) continue;
        checked++;
        assert.ok(!all.some((p) => p.sx === end.x && p.z === y * TILE_WIDTH && Math.abs(p.dx - x * TILE_WIDTH) < TILE_WIDTH), `no end between the face at ${x},${y} and the slant beside it`);
      }
    }
    assert.ok(checked > 0, 'faces meet slanted ones');
  }
});

test('mine chasms: a cliff under the north brink, as deep as the drop, fading where none runs on beside it; pebbles round the rest', async () => {
  const { buildTerrainPieces } = await load('level/TerrainAutotile');
  const { MINE_CLIFFS, CLIFF_FADES, THORN_H, MINE_BRINK_S, MINE_BRINK_W, MINE_BRINK_E, MINE_BRINK_KNOTS } = await load('level/MineTiles');
  const level = new Level(10, 10, 'mines');
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    const inside = x >= 1 && x <= 8 && y >= 1 && y <= 8;
    const chasm = (x >= 3 && x <= 5 && y >= 4 && y <= 5) || (x === 6 && y >= 1 && y <= 5);
    level.setTile(x, y, createTile(!inside ? TileType.Wall : chasm ? TileType.Hole : TileType.Floor));
  }
  const pieces = buildTerrainPieces(level);
  const cliffAt = (tx) => pieces.find((p) => p.dx === tx * TILE_WIDTH && p.dy === 4 * TILE_WIDTH - THORN_H && MINE_CLIFFS.some((v) => v.some((c) => c.x === p.sx && c.y === p.sy)));
  const fadeOf = (p) => CLIFF_FADES[MINE_CLIFFS.findIndex((v) => v.some((c) => c.x === p.sx))];
  for (const tx of [3, 4, 5]) {
    const cliff = cliffAt(tx);
    assert.ok(cliff, `a cliff under the brink at ${tx}`);
    assert.equal(cliff.h, THORN_H + 2 * TILE_WIDTH, 'cut off where the drop ends, under its far brink');
    assert.equal(cliff.z, 5 * TILE_WIDTH, 'drawn over the feet of whoever stands at the brink');
  }
  assert.equal(fadeOf(cliffAt(3)), 'none', 'floor beside it: its pebbles cover the cliff\'s side');
  assert.equal(fadeOf(cliffAt(5)), 'right', 'the dark beside it has no cliff of its own: the cliff fades out there');
  assert.ok(pieces.some((p) => MINE_BRINK_S.some((b) => b.x === p.sx && b.y === p.sy) && p.dy > 5 * TILE_WIDTH), 'pebbles along the far brink');
  assert.ok(pieces.some((p) => MINE_BRINK_W.some((b) => b.x === p.sx && b.y === p.sy) && p.dx < 3 * TILE_WIDTH), 'down the west brink');
  assert.ok(pieces.some((p) => MINE_BRINK_E.some((b) => b.x === p.sx && b.y === p.sy) && p.dx > 6 * TILE_WIDTH), 'down the east brink of the narrow drop');
  assert.ok(pieces.some((p) => MINE_BRINK_KNOTS.some((b) => b.x === p.sx && b.y === p.sy)), 'knotted where brinks meet');
});

test('mine earth: where tones meet, the edge wanders across the tiles; one tone lies whole; plants grow in clumps by edges', async () => {
  const { mineGroundOverlays, mineGroundBase, overlayCovers, groundNoise, NOISE_PERIOD } = await load('level/MineGround');
  const { dungeonConfig } = await load('level/generators/DungeonConfig');
  const { MINE_PLANTS } = await load('level/Props');
  const level = new Level(12, 8, 'mines');
  for (let y = 0; y < 8; y++) for (let x = 0; x < 12; x++) level.setTile(x, y, createTile(x === 0 || y === 0 || x === 11 || y === 7 ? TileType.Wall : TileType.Floor));
  level.floorZones.push({ x: 0, y: 0, w: 6, h: 8, tone: 0 }, { x: 6, y: 0, w: 6, h: 8, tone: 2 });
  // Away from the edge, a tile is one piece of its own tone; at it, quarters of the lower tone with the higher laid over.
  assert.equal(mineGroundBase(level, 2, 3).length, 1);
  assert.equal(mineGroundBase(level, 5, 3).length, 4);
  const overlays = mineGroundOverlays(level);
  assert.ok(overlays.length > 0 && overlays.every((o) => o.tone === 2 && Math.abs(o.dx + o.w / 2 - 6 * TILE_WIDTH) <= TILE_WIDTH), 'the higher tone over the lower, only near the edge');
  // Along the rows, the edge wanders: not one straight line down the tiles' sides.
  const edges = new Set();
  for (let y = TILE_WIDTH + 4; y < 6 * TILE_WIDTH; y += 3) {
    for (let x = 5 * TILE_WIDTH; x < 7 * TILE_WIDTH; x++) {
      const o = overlays.find((q) => q.dx <= x && x < q.dx + q.w && q.dy <= y && y < q.dy + q.h);
      if (o && overlayCovers(o.corners, o.px, o.py, o.sx + x - o.dx, o.sy + y - o.dy)) { edges.add(x); break; }
    }
  }
  assert.ok(edges.size > 3, 'the edge wanders');
  assert.ok([...edges].every((x) => Math.abs(x - 6 * TILE_WIDTH) <= TILE_WIDTH / 2), 'within half a tile of where the tones meet');
  for (let k = 0; k < 64; k++) {
    assert.ok(overlayCovers(15, 16, 48, k % 32, Math.floor(k / 2) % 32), 'a cell all of the tone is covered');
    assert.ok(!overlayCovers(0, 16, 48, k % 32, Math.floor(k / 2) % 32), 'one with none of it is not');
    assert.equal(groundNoise(k * 3, k * 5), groundNoise(k * 3 + NOISE_PERIOD, k * 5 - NOISE_PERIOD), 'the noise repeats as the ground does');
  }

  // Plants grow in clumps where something breaks the floor: a drop or a hole, the rock, other earth.
  for (const seed of [3, 7]) {
    const layout = new DungeonBuilder(dungeonConfig('mines', seed)).build();
    const L = layout.level;
    const W = L.width;
    const { mineFloorTone } = await load('level/MineGround');
    const edgy = (x, y) => L.getTile(x, y)?.type === TileType.Hole || L.getTile(x, y)?.type === TileType.Wall || L.slopes.has(x + y * W);
    const plants = layout.props.filter((p) => MINE_PLANTS.includes(p.kind));
    assert.ok(plants.length > 0);
    for (const p of plants) {
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2 && !near; dx++) {
        near = edgy(p.tx + dx, p.ty + dy) || mineFloorTone(L, p.tx + dx, p.ty + dy) !== mineFloorTone(L, p.tx, p.ty);
      }
      assert.ok(near, `the plant at ${p.tx},${p.ty} grows by an edge`);
      assert.ok(Math.abs(p.dx ?? 0) <= 7, 'nudged a little off its tile\'s middle');
    }
  }
});

test('in the mines, whoever walks out over a drop or a hole falls; the castle\'s chasms stay gaps', async () => {
  const { overHole } = await load('systems/HoleSystem');
  const { MINE_HOLES, holeArtOffset } = await load('level/MineTiles');
  const { dropPoint, validPitDetail } = await load('level/PitShapes');
  const { encodeLevelMap, decodeLevelMap } = await load('level/LevelMap');
  const mines = new Level(12, 10, 'mines');
  mines.setTile(6, 5, createTile(TileType.Hole));
  mines.setTile(6, 6, createTile(TileType.Hole));
  assert.ok(mines.isChasm(6, 5));
  assert.ok(!mines.getClipBBs(6 * TILE_WIDTH + 16, 4 * TILE_WIDTH + 16, 7, 7).some((b) => b.contains(6 * TILE_WIDTH + 16, 5 * TILE_WIDTH + 20)),
    'nothing stops a body at a mine\'s drop');
  assert.ok(!overHole(mines, { position: { x: 6 * TILE_WIDTH + 16, y: 5 * TILE_WIDTH + 12 }, radius: { x: 7, y: 7 } }), 'feet on its rim stand');
  assert.ok(overHole(mines, { position: { x: 6 * TILE_WIDTH + 16, y: 6 * TILE_WIDTH + 8 }, radius: { x: 7, y: 7 } }), 'past it, a body falls');
  const castle = new Level(12, 10, 'castle2');
  castle.setTile(6, 5, createTile(TileType.Hole));
  assert.ok(castle.getClipBBs(6 * TILE_WIDTH + 16, 4 * TILE_WIDTH + 16, 7, 7).some((b) => b.contains(6 * TILE_WIDTH + 16, 5 * TILE_WIDTH + 29)),
    'the isometric castle\'s chasm is still a gap nobody steps into');

  // A hole a body's size: whoever's feet are over its dark falls in; beside it, nobody does.
  const hole = { x: 3, y: 3, shape: 'hole', lobes: 0 };
  mines.setTile(3, 3, createTile(TileType.Hole));
  mines.addPit(hole);
  const at = holeArtOffset(MINE_HOLES[0]);
  const [x0, y0, x1, y1] = MINE_HOLES[0].open[0];
  const mid = { x: 3 * TILE_WIDTH + at.x + (x0 + x1) / 2, y: 3 * TILE_WIDTH + at.y + (y0 + y1) / 2 };
  assert.equal(mines.pitAt(mid.x, mid.y), hole);
  assert.ok(overHole(mines, { position: mid, radius: { x: 7, y: 7 } }), 'feet over the hole fall in');
  assert.ok(!overHole(mines, { position: { x: 3 * TILE_WIDTH + 1, y: 3 * TILE_WIDTH + 30 }, radius: { x: 7, y: 7 } }), 'feet at its tile\'s corner do not');
  const drop = dropPoint(hole, mid.x + 3, mid.y, { x: 0, y: 0 });
  assert.ok(mines.pitAt(drop.x, drop.y) === hole, 'a faller drops inside its dark');
  assert.ok(validPitDetail('hole', MINE_HOLES.length - 1) && !validPitDetail('hole', MINE_HOLES.length), 'a hole is one of the set\'s');
  const layout = { level: mines, rooms: [], playerSpawn: { x: 40, y: 40 }, torchPositions: [], props: [], campfires: [], spikes: [],
    exitButtonPos: { x: 0, y: 0 }, shopPos: { x: 0, y: 0 }, dummyPos: { x: 0, y: 0 }, safeDoor: { tiles: [], boundaryX: 0 },
    leverPos: { x: 0, y: 0 }, exitDoor: { tiles: [], boundaryX: 0 }, exitLeverPos: { x: 0, y: 0 } };
  const back = decodeLevelMap(JSON.parse(JSON.stringify(encodeLevelMap(layout))));
  assert.deepEqual(back.level.pits, [hole], 'a hole goes to co-op guests');
});

test('the point of a spur, where two slants meet back to back, pushes a body back as each slant does', () => {
  // A spur of rock jutting north out of a south wall (rows 5 and down): its point between tiles (5,4) and (6,4).
  const level = new Level(12, 10, 'mines');
  for (let y = 5; y < 10; y++) for (let x = 0; x < 12; x++) level.setTile(x, y, createTile(TileType.Wall));
  for (const x of [5, 6]) level.setTile(x, 4, createTile(TileType.Wall));
  level.slopes.set(5 + 4 * 12, { corner: 'se', major: true });
  level.slopes.set(4 + 4 * 12, { corner: 'se', major: false });
  level.slopes.set(6 + 4 * 12, { corner: 'sw', major: true });
  level.slopes.set(7 + 4 * 12, { corner: 'sw', major: false });
  const pos = { x: 6 * TILE_WIDTH, y: 3 * TILE_WIDTH + 16 };
  // Walking straight down onto the point, a step at a time.
  for (let i = 0; i < 40; i++) {
    pos.y += 2;
    level.pushOutOfSlopes(pos, 7, 7);
  }
  // Feet reach WALL_SINK behind a south slant's rim, as behind a south wall's, but no further: not into the rock below.
  assert.ok(pos.y + 7 < 5 * TILE_WIDTH, `the body stays out of the rock (feet at ${pos.y + 7})`);
  assert.ok(Math.abs(pos.x - 6 * TILE_WIDTH) < 1, 'pushed straight back, the two slants evening out');
});

test('the mines\' stones block as far back as their bulk stands, thin timbers never clear, and flames flicker', async () => {
  const { PROPS, MINE_STONES, MINE_BIG_ROCKS, MINE_POSTS, propBlockRect, PROP_GROUND } = await load('level/Props');
  const { createProp } = await load('entities/DungeonFactory');
  assert.ok(MINE_STONES.length > 0 && MINE_STONES.every((k) => PROPS[k].solid), 'small stones and heaps of rubble are walked round');
  for (const kind of MINE_BIG_ROCKS) {
    const def = PROPS[kind];
    const block = propBlockRect(def);
    const rows = def.footprint?.h ?? 1;
    const across = def.footprint?.w ?? 1;
    assert.ok(block.y0 >= PROP_GROUND - rows * TILE_WIDTH, `${kind}'s base lies within the tiles it takes`);
    assert.ok(block.x0 >= TILE_WIDTH / 2 - (across * TILE_WIDTH) / 2 && block.x1 <= TILE_WIDTH / 2 + (across * TILE_WIDTH) / 2, `${kind} across`);
  }
  assert.ok(MINE_BIG_ROCKS.some((k) => (PROPS[k].footprint?.h ?? 1) > 1), 'a great rock blocks into the tile behind its foot');
  assert.ok(MINE_POSTS.every((k) => PROPS[k].solid && !PROPS[k].seeThrough), 'posts stop bodies but never clear');
  world.clear();
  const lantern = createProp({ kind: 'mine_lantern', tx: 2, ty: 2 });
  const crystal = createProp({ kind: 'crystal_blue_00', tx: 4, ty: 4 });
  const candle = createProp({ kind: 'candle', tx: 6, ty: 6 });
  assert.ok(lantern.glow.cool && lantern.glow.flicker !== undefined, 'a lantern\'s green flame flickers');
  assert.ok(candle.glow.flicker !== undefined, 'so does a candle');
  assert.equal(crystal.glow.flicker, undefined, 'a crystal shines steadily');
  world.clear();
});

test('in the isometric castle, faces and slanted faces are drawn in front of whoever stands behind them, and a chasm\'s side rims reach its top', async () => {
  const { buildTerrainPieces } = await load('level/TerrainAutotile');
  // A wall only as thick as a face is tall between two floors: the face (rows 3–4) is drawn over feet sinking into row 3.
  const level = new Level(8, 9, 'castle2');
  for (let y = 0; y < 9; y++) for (let x = 0; x < 8; x++) level.setTile(x, y, createTile(x === 0 || x === 7 || y === 0 || y === 8 || y === 3 || y === 4 ? TileType.Wall : TileType.Floor));
  const feet = 3 * TILE_WIDTH + 20;
  const face = buildTerrainPieces(level).find((p) => p.dx === 3 * TILE_WIDTH && p.dy === 3 * TILE_WIDTH && p.h === 64);
  assert.ok(face && face.z > feet, 'the face hides the feet of whoever stands at its top');
  // A chasm: its west and east rims on its top row are laid over its north rim (the same depth, after it).
  const pit = new Level(8, 8, 'castle2');
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) pit.setTile(x, y, createTile(x === 0 || x === 7 || y === 0 || y === 7 ? TileType.Wall : TileType.Floor));
  for (let y = 3; y <= 4; y++) for (let x = 2; x <= 5; x++) pit.setTile(x, y, createTile(TileType.Hole));
  assert.ok(pit.isChasm(2, 3), 'holes that belong to no pit are a chasm');
  const pieces = buildTerrainPieces(pit);
  const rowZ = 4 * TILE_WIDTH;
  const west = pieces.findIndex((p) => p.dx === 2 * TILE_WIDTH && p.dy === 3 * TILE_WIDTH && p.w === 8 && p.z === rowZ);
  const north = pieces.findIndex((p) => p.dx === 2 * TILE_WIDTH && p.z === rowZ && p.w === 32);
  assert.ok(west > north && north >= 0, 'the west rim runs up over the north rim');
});

test('a wall clears in a soft ellipse over a figure behind it, easing in and back out once it has gone', async () => {
  const { SeeThroughWalls, Revealer } = await load('render/SeeThrough');
  const layer = { filters: null, destroyed: false };
  const cleared = [];
  const walls = new SeeThroughWalls(320);
  // The dark of a south wall over the tile row 5, drawn at the row's foot; a figure's feet sink into it.
  walls.addPiece(layer, 6 * TILE_WIDTH, 3 * TILE_WIDTH, 5 * TILE_WIDTH - 8, 32, 40);
  // A stand-in for the filter, noting each ellipse's strength as it is set.
  const revealer = new Revealer(() => ({ reset() {}, set: (i, x, y, rx, ry, strength) => cleared.push(strength), commit() {} }));
  const view = { a: 1, d: 1, tx: 0, ty: 0 };
  const frame = (feetY) => {
    const over = [];
    walls.collect(3 * TILE_WIDTH, feetY - 40, 4 * TILE_WIDTH, feetY, feetY, over);
    revealer.begin();
    revealer.figure(layer, 3 * TILE_WIDTH + 16, feetY - 18, 24, 27, over);
    revealer.settle(view);
    return over.length;
  };
  assert.equal(frame(5 * TILE_WIDTH + 20), 1, 'the wall is over the figure behind it');
  assert.equal(layer.filters?.length, 1, 'and is cleared round it');
  for (let i = 0; i < 30; i++) frame(5 * TILE_WIDTH + 20);
  assert.ok(cleared[0] < 0.2 && cleared.at(-1) === 1, 'it eases in, all the way');
  assert.equal(frame(7 * TILE_WIDTH), 0, 'a figure in front of the wall is not behind it');
  assert.equal(layer.filters?.length, 1, 'the clearing eases out, not off at once');
  for (let i = 0; i < 30; i++) frame(7 * TILE_WIDTH);
  assert.equal(layer.filters, null, 'and is gone once it has');
});

test('along a slant, the rim\'s pieces at their several depths all clear round a figure, not just the one over its feet', async () => {
  const { SeeThroughWalls } = await load('render/SeeThrough');
  const { wallsOverFigure, revealHalfWidth } = await load('systems/SeeThroughSystem');
  const walls = new SeeThroughWalls(640);
  // A south slant's rim: a tile's column each, each sorted a little deeper than the one before.
  const columns = [0, 1, 2, 3].map((k) => ({ filters: null, k }));
  columns.forEach((layer, k) => walls.addPiece(layer, 6 * TILE_WIDTH + 16 * k, (4 + k) * TILE_WIDTH, 5 * TILE_WIDTH + 16 * k - 8, 32, 48));
  const over = [];
  // Feet in the second column, behind all of them.
  wallsOverFigure(walls, 5 * TILE_WIDTH + 16, 6 * TILE_WIDTH - 4, 40, over);
  assert.ok(revealHalfWidth(40) > 16, 'the ellipse is wider than a figure');
  assert.deepEqual(over.map((s) => s.target.k).sort(), [0, 1, 2], 'every column the ellipse spans clears, not only the one over the feet');
});

test('a hero sinking over a chasm\'s north rim stands on it; one stepping onto a loose hole falls', async () => {
  const level = arena(8, 8);
  for (let y = 3; y <= 4; y++) for (let x = 2; x <= 5; x++) level.setTile(x, y, createTile(TileType.Hole));
  const hero = playerAt(3, 2);
  hero.position.y = 3 * TILE_WIDTH + 18;
  updateHoles(level);
  assert.equal(hero.falling, undefined, 'feet over the rim stand on it');
  hero.position.y = 4 * TILE_WIDTH + 16;
  updateHoles(level);
  assert.ok(hero.falling, 'out over the dark, they fall');
});

test('only a tall prop\'s base stops bodies: from the north one walks on behind its column; a rock spire\'s base is broad', async () => {
  const { PROPS, propBlockRect, PROP_GROUND } = await load('level/Props');
  for (const kind of ['cave_spires', 'cave_spire', 'iso_column', 'castle_column']) {
    const def = PROPS[kind];
    assert.ok(def.seeThrough, `${kind} clears over whoever is behind it`);
    const block = propBlockRect(def);
    assert.equal(block.y1, PROP_GROUND, `${kind} blocks from its foot`);
    if (!kind.startsWith('cave_')) {
      assert.ok(block.y0 >= PROP_GROUND - 16, `${kind} blocks only its base`);
      continue;
    }
    const depth = block.y1 - block.y0;
    assert.ok(depth >= def.rect.h * 0.3 && depth < def.rect.h * 0.6, `${kind}: a heap of stones stops one well short of its peak, not at its front`);
  }
  assert.ok(!PROPS.crystal_blue_00.seeThrough && !PROPS.shelf_narrow.seeThrough, 'decor never clears');
});

test('the floor runs on under a south wall (straight or slanted), to show where the wall clears', async () => {
  const { buildTerrainPieces } = await load('level/TerrainAutotile');
  for (const theme of ['catacomb', 'castle', 'castle2']) {
    const level = new Level(8, 8, theme);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) level.setTile(x, y, createTile(x === 0 || y === 0 || x === 7 || y >= 5 ? TileType.Wall : TileType.Floor));
    const floors = buildTerrainPieces(level).filter((p) => p.floor);
    assert.ok(floors.some((p) => p.dx === 3 * TILE_WIDTH && p.dy === 5 * TILE_WIDTH), `${theme}: floor under the wall row`);
    assert.ok(!floors.some((p) => p.dy === 6 * TILE_WIDTH), `${theme}: but not deeper`);
  }
});

test('rooms are not all rectangles: some lose a corner to the wall, squared off or on the slant', () => {
  let cut = 0;
  for (const [seed, theme] of [[11, 'catacomb'], [22, 'catacomb'], [33, 'castle'], [44, 'castle']]) {
    const { layout, level } = buildDungeon(seed, true, theme);
    for (const r of layout.rooms.filter((room) => room.type === 'dungeon')) {
      const corners = [[r.x, r.y], [r.x + r.w - 1, r.y], [r.x, r.y + r.h - 1], [r.x + r.w - 1, r.y + r.h - 1]];
      cut += corners.filter(([x, y]) => level.getTile(x, y).type === TileType.Wall).length;
    }
  }
  assert.ok(cut > 0);
});

test('the catacombs and the castle have slanted walls now and then, drawn from their tilesets\' slanted pieces', async () => {
  const { buildTerrainPieces } = await load('level/TerrainAutotile');
  const { CATACOMB_SLANTS, CASTLE_SLANTS } = await load('level/SlantTiles');
  for (const [theme, set] of [['catacomb', CATACOMB_SLANTS], ['castle', CASTLE_SLANTS]]) {
    let slopes = 0;
    let slantArt = 0;
    for (const seed of [7, 23, 31]) {
      const { level } = buildDungeon(seed, true, theme);
      slopes += level.slopes.size;
      // The slanted pieces lie in the band the -isometric copy adds under the original art.
      slantArt += buildTerrainPieces(level).filter((p) => p.sy >= set.void.y && !p.sheet).length;
      for (const [i, slope] of level.slopes) {
        assert.equal(level.getTile(i % level.width, Math.floor(i / level.width)).type, slope.major ? TileType.Wall : TileType.Floor);
      }
    }
    assert.ok(slopes > 0, `${theme}: some slanted corners or corridors`);
    assert.ok(slantArt > 0, `${theme}: drawn with the slanted pieces`);
  }
});

test('in a castle, lit candles stand in the arched alcoves and flags hang only on square columns', () => {
  let candles = 0;
  let flags = 0;
  for (const seed of [4242, 77, 1234, 9, 31, 5150, 1, 4, 6]) {
    const { layout, level } = buildDungeon(seed, true, 'castle');
    for (const p of layout.props) {
      if (p.kind === 'castle_candle') {
        candles++;
        assert.equal(level.wallDecor.get(p.tx + (p.ty - 1) * level.width), 'door0', 'under the alcove');
      }
      if (!p.kind.startsWith('castle_flag')) continue;
      flags++;
      assert.ok(layout.props.some((c) => c.kind === 'castle_column_block' && c.tx === p.tx && c.ty === p.ty), 'on a column');
    }
  }
  assert.ok(candles > 0, 'some alcove has its candles');
  assert.ok(flags > 0, 'some column has its flag');
});

test('a castle passage running north and south has stairs in it; the great arch stands on the walls beside its opening', async () => {
  const { buildTerrainPieces } = await load('level/TerrainAutotile');
  const { castleArchPieces, stairsPiece } = await load('level/CastleTiles');
  const level = new Level(16, 12, 'castle');
  for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) level.setTile(x, y, createTile(TileType.Wall));
  const passages = [2, 6, 10];
  for (const x of passages) {
    for (let y = 1; y < 11; y++) for (const px of [x, x + 1]) level.setTile(px, y, createTile(TileType.Floor));
  }
  const art = stairsPiece(0, 0);
  const stairs = buildTerrainPieces(level).filter((p) => p.sx === art.sx && p.sy === art.sy);
  assert.ok(stairs.length > 0, 'stairs in at least one of the passages');
  for (const step of stairs) assert.ok(passages.includes(step.dx / TILE_WIDTH), 'across a passage, never on a wall');
  const [left, crown, right] = castleArchPieces(100, 300);
  assert.equal(left.dx, 100 - 16, 'the left leg stands on the face beside the opening');
  assert.equal(right.dx + right.w, 100 + 64 + 16, 'and the right one on the face beyond it');
  assert.ok([left, crown, right].every((p) => p.z === 300), 'sorted at the foot of the wall: under it in the passage, over it in front');
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

test('anyone in the exit room choosing to end the run ends it; if everyone walks out first, the portal can be used again', () => {
  const { layout, button, ana, bo, press } = atTheExit();
  const anaAt = { ...ana.position };
  press();
  Object.assign(ana.position, layout.playerSpawn);
  Object.assign(bo.position, layout.playerSpawn);
  updateExit();
  assert.equal(button.exitButton.activated, false, 'nobody left to ask');
  Object.assign(ana.position, anaAt);
  press();
  assert.equal(button.exitButton.activated, true, 'used again');
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

// ── The Fighter: Two-Weapon Fighting, Extra Attack and the three Martial Archetypes ─────────────

const weaponItem = (base, bonus) => ({ type: 'weapon', name: base, value: 1, gear: 'weapon', base, ...(bonus ? { bonus } : {}) });
const heroWith = (archetype, level, extra = {}) => {
  const hero = playerAt(2, 2, 'fighter');
  hero.playerStats.level = level;
  hero.build.archetype = archetype;
  Object.assign(hero.build, extra);
  hero.equipped = { primary: weaponItem('longsword') };
  hero.aimVector = { x: 1, y: 0 };
  return hero;
};
/** A roller that answers a d20 from `d20` in turn (then 1s) and every other die with `other`. */
const rollerOf = (d20, other = 4) => {
  const queue = [...d20];
  return (sides) => (sides === 20 ? (queue.length ? queue.shift() : 1) : other);
};

test('two-weapon fighting: a weapon in each hand lands a second attack, with the ability modifier only for the style', async () => {
  const { offHandAttack, characterSheet } = await load('rules/CharacterSheet');
  const { CLASSES } = await load('rules/Classes');
  const mods = { strength: 3, dexterity: 1, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 };
  const both = { primary: weaponItem('shortsword'), secondary: weaponItem('dagger') };
  assert.equal(offHandAttack(both, mods, 1, CLASSES.fighter, true, null).damage.bonus, 0, 'the modifier is not added to the second blow');
  assert.equal(offHandAttack(both, mods, 1, CLASSES.fighter, true, { fightingStyle: 'two_weapon_fighting' }).damage.bonus, 3, 'the style adds it');
  assert.equal(offHandAttack(both, mods, 1, CLASSES.fighter, true, { extraStyle: 'two_weapon_fighting' }).damage.bonus, 3, 'as a second style too');
  const magic = { primary: weaponItem('shortsword'), secondary: weaponItem('dagger', 1) };
  assert.equal(offHandAttack(magic, mods, 1, CLASSES.fighter, true, null).damage.bonus, 1, 'the magic bonus stays');
  assert.equal(offHandAttack(both, { ...mods, strength: -1, dexterity: -1 }, 1, CLASSES.fighter, true, null).damage.bonus, -1, 'a penalty always counts');
  assert.equal(offHandAttack({ primary: weaponItem('scimitar'), secondary: weaponItem('handaxe') }, mods, 1, CLASSES.fighter).base, 'handaxe', 'any light melee weapons');
  assert.equal(offHandAttack({ primary: weaponItem('longsword'), secondary: weaponItem('dagger') }, mods, 1, CLASSES.fighter), null, 'both must be light: not a longsword');
  assert.equal(offHandAttack({ primary: weaponItem('dagger'), secondary: weaponItem('rapier') }, mods, 1, CLASSES.fighter), null, 'nor a rapier');
  const { NO_FEATS } = await load('rules/Feats');
  const wielder = { ...NO_FEATS, dualWield: true };
  assert.equal(offHandAttack({ primary: weaponItem('longsword'), secondary: weaponItem('dagger') }, mods, 1, CLASSES.fighter, true, null, wielder).base, 'dagger', 'Dual Wielder: any one-handed weapon');
  assert.equal(offHandAttack({ primary: weaponItem('dagger'), secondary: weaponItem('rapier') }, mods, 1, CLASSES.fighter, true, null, wielder).base, 'rapier', 'and in the second hand');
  assert.equal(offHandAttack(both, mods, 1, CLASSES.fighter, true, null).attackBonus, 2 + 3, 'the off hand\'s to-hit is whole: proficiency and STR');
  assert.equal(offHandAttack({ primary: weaponItem('greatsword'), secondary: weaponItem('dagger') }, mods, 1, CLASSES.fighter), null, 'a two-handed weapon needs both hands');
  assert.equal(offHandAttack({ primary: weaponItem('dagger'), secondary: weaponItem('greatsword') }, mods, 1, CLASSES.fighter), null, 'either way round');
  assert.equal(offHandAttack({ primary: weaponItem('dagger'), secondary: { type: 'shield', name: 's', value: 1, gear: 'offhand', base: 'shield' } }, mods, 1, CLASSES.fighter), null, 'a shield is no weapon');
  assert.equal(offHandAttack({ primary: weaponItem('hand_crossbow'), secondary: weaponItem('dagger') }, mods, 1, CLASSES.fighter), null, 'melee only');
  const hero = playerAt(2, 2, 'fighter');
  hero.equipped = both;
  assert.ok(characterSheet(hero).offHand, 'the sheet knows the second blow');
  hero.equipped = { primary: weaponItem('longsword') };
  assert.equal(characterSheet(hero).offHand, null);
});

test('two-weapon fighting is one of six styles, and a hero cannot take the same one twice', async () => {
  const { FIGHTING_STYLES, hasStyle } = await load('rules/FightingStyles');
  const Build = await load('rules/Build');
  const { CLASSES } = await load('rules/Classes');
  assert.ok(FIGHTING_STYLES.includes('two_weapon_fighting') && FIGHTING_STYLES.length === 6);
  const hero = heroWith('champion', 10);
  hero.build.fightingStyle = 'dueling';
  assert.equal(Build.takeExtraStyle(CLASSES.fighter, hero.build, 9, 'archery'), false, 'not before level 10');
  assert.equal(Build.takeExtraStyle(CLASSES.fighter, hero.build, 10, 'dueling'), false, 'not the same one');
  assert.equal(Build.levelHasChoice(CLASSES.fighter, 10, hero.build), true);
  assert.equal(Build.takeExtraStyle(CLASSES.fighter, hero.build, 10, 'two_weapon_fighting'), true);
  assert.equal(Build.takeExtraStyle(CLASSES.fighter, hero.build, 10, 'archery'), false, 'once');
  assert.equal(Build.levelHasChoice(CLASSES.fighter, 10, hero.build), false);
  assert.ok(hasStyle(hero.build, 'dueling') && hasStyle(hero.build, 'two_weapon_fighting') && !hasStyle(hero.build, 'archery'));
  const battleMaster = heroWith('battle_master', 10);
  battleMaster.build.fightingStyle = 'dueling';
  assert.equal(Build.takeExtraStyle(CLASSES.fighter, battleMaster.build, 10, 'archery'), false, 'only a Champion');
  assert.equal(Build.levelHasChoice(CLASSES.fighter, 10, { ...battleMaster.build, maneuvers: ['parry', 'riposte', 'trip_attack', 'rally', 'pushing_attack', 'sweeping_attack', 'lunging_attack'] }), false, 'a Battle Master has no style to take at level 10');
  assert.equal(Build.validBuild({ ...hero.build, extraStyle: 'dueling' }), false, 'a build may not name one style twice');
});

test('Extra Attack: a swing strikes two, three and four times as the fighter levels', async () => {
  const { attacksPerAction } = await load('rules/CharacterSheet');
  const { CLASSES } = await load('rules/Classes');
  const { updateCombatTimers } = await load('systems/CombatSystem');
  assert.deepEqual([1, 4, 5, 10, 11, 19, 20].map((level) => attacksPerAction(CLASSES.fighter, level)), [1, 1, 2, 2, 3, 3, 4]);
  assert.equal(attacksPerAction(CLASSES.wizard, 20), 1);
  assert.equal(attacksPerAction(CLASSES.fighter, 5, ['extra_attack']), 1, 'switched off');
  const swingAt = (hero) => {
    const dummy = createTrainingDummy(centre(4.7), centre(2));
    hero.position.x = centre(4);
    hero.position.y = centre(2);
    const before = currentLog()?.seq ?? 0;
    hero.playerInput.intents.attack = true;
    for (let t = 0; t < 120 && (t === 0 || hero.swordSwing); t++) {
      beginPerception();
      updateSword();
      updateCombatTimers();
    }
    world.remove(dummy);
    return (currentLog()?.seq ?? 0) - before;
  };
  const hero = heroWith('champion', 5);
  assert.equal(swingAt(hero), 2, 'two blows at level 5');
  hero.swordCooldown = 0;
  hero.playerStats.level = 11;
  assert.equal(swingAt(hero), 3);
  hero.swordCooldown = 0;
  hero.playerStats.level = 20;
  assert.equal(swingAt(hero), 4);
  hero.swordCooldown = 0;
  hero.equipped = { primary: weaponItem('shortsword'), secondary: weaponItem('dagger') };
  hero.playerStats.level = 5;
  hero.playerInput.intents.attack = true;
  beginPerception();
  updateSword();
  assert.deepEqual([hero.swordSwing.blows, hero.swordSwing.offHand], [2, true], 'two blows, the first made with both weapons');
  assert.equal(hero.swordCooldown, 60, 'the whole chain fits in the second');
});

test('Extra Attack: a bow looses a volley, one arrow after another', () => {
  const hero = playerAt(3, 3, 'fighter');
  hero.playerStats.level = 5;
  hero.aimVector = { x: 1, y: 0 };
  hero.equipped = { primary: weaponItem('longbow') };
  hero.playerInput.intents.attack = true;
  updateArrows();
  const arrows = () => world.entities.filter((e) => e.projectile?.arrow).length;
  assert.equal(arrows(), 1);
  assert.equal(hero.volley, 1, 'one more is to follow');
  // The archer's pace: the release pose and its recovery (12 + 10 ticks), not half the second.
  for (let t = 0; t < 21; t++) updateArrows();
  assert.equal(arrows(), 1, 'the second arrow waits for the first shot to play out');
  updateArrows();
  assert.equal(arrows(), 2, 'and follows 22 ticks after the first');
  assert.equal(hero.volley, 0);
  assert.ok(hero.arrowCooldown > 0, 'the next volley is still a second off');
  hero.arrowCooldown = 0;
  hero.playerStats.level = 1;
  hero.playerInput.intents.attack = true;
  updateArrows();
  assert.equal(arrows(), 3);
  assert.equal(hero.volley, 0, 'a level-1 fighter shoots a single arrow');
});

test('attacks come once a second however hard the key is spammed, and Extra Attack fits its blows inside that second', async () => {
  const { updateCombatTimers } = await load('systems/CombatSystem');
  const run = (hero, ticks) => {
    const dummy = createTrainingDummy(centre(4.7), centre(2));
    hero.position.x = centre(4);
    hero.position.y = centre(2);
    const starts = [];
    const lands = [];
    let seen = currentLog()?.seq ?? 0;
    for (let t = 0; t < ticks; t++) {
      hero.playerInput.intents.attack = true;
      beginPerception();
      updateSword();
      updateCombatTimers();
      if (hero.swordCooldown === 60) starts.push(t);
      const seq = currentLog()?.seq ?? 0;
      for (; seen < seq; seen++) lands.push(t);
    }
    world.remove(dummy);
    return { starts, lands };
  };
  for (const [level, blows] of [[1, 1], [5, 2], [11, 3], [20, 4]]) {
    const hero = heroWith('champion', level);
    const { starts, lands } = run(hero, 125);
    assert.deepEqual(starts, [0, 60, 120], `level ${level}: a swing every 60 ticks`);
    assert.equal(lands.filter((t) => t < 60).length, blows, `level ${level}: ${blows} attacks within the first second`);
    assert.equal(lands.filter((t) => t >= 60 && t < 120).length, blows, `level ${level}: and within the next`);
    assert.ok(Math.max(...lands.filter((t) => t < 60)) < 60 && Math.min(...lands.filter((t) => t >= 60)) >= 60, 'none spills over into the next second');
    world.remove(hero);
  }
});

test('with a melee weapon in each hand one click makes an attack with each, rolled and dealt on their own', async () => {
  const { updateCombatTimers } = await load('systems/CombatSystem');
  const { characterSheet } = await load('rules/CharacterSheet');
  const hero = heroWith('champion', 1);
  hero.equipped = { primary: weaponItem('shortsword'), secondary: weaponItem('dagger') };
  const dummy = createTrainingDummy(centre(4.7), centre(2));
  hero.position.x = centre(4);
  hero.position.y = centre(2);
  const rolled = [];
  useDieRoller((sides) => {
    rolled.push(sides);
    return sides === 20 ? 15 : Math.min(sides, 3);
  });
  const sheet = characterSheet(hero);
  assert.equal(sheet.attacks + (sheet.offHand ? 1 : 0), 2, 'two attacks at level 1');
  const before = currentLog()?.seq ?? 0;
  hero.playerInput.intents.attack = true;
  for (let t = 0; t < 60; t++) {
    beginPerception();
    updateSword();
    updateCombatTimers();
  }
  const entries = currentLog().entries.filter((e) => e.seq > before);
  assert.equal(entries.length, 2, 'both weapons swing for the one click');
  assert.equal(hero.rollLog.length, 4, 'and both show over the hero head: a roll to hit and a result each');
  assert.equal(entries.map((e) => e.result).join(), 'hit,hit', 'the second hits although the first just struck');
  assert.equal(dummy.health.current, dummy.health.max - entries[0].damage - entries[1].damage, 'and both damage rolls count');
  assert.ok(rolled.filter((sides) => sides === 20).length >= 2, 'each rolls its own d20');
  assert.ok(rolled.includes(6) && rolled.includes(4), 'the shortsword rolls its d6 and the dagger its d4');
  assert.deepEqual(entries.map((e) => e.damage), [3 + sheet.attack.damage.bonus, 3 + sheet.offHand.damage.bonus], 'each deals its own damage');
  world.remove(dummy);
  world.remove(hero);
});

test('an enemy attacks once a second, and a hit that interrupts its swing does not shorten the wait', async () => {
  const { updateCombatTimers } = await load('systems/CombatSystem');
  const { hitMob } = await load('systems/Hits');
  const level = arena(12, 6);
  const player = playerAt(6, 3);
  player.godMode = true;
  const orc = mobAt(level, 'orc', 5.4, 3);
  useDieRoller(() => 1);
  const lands = [];
  let seen = currentLog()?.seq ?? 0;
  for (let t = 0; t < 200; t++) {
    beginPerception();
    updateCombatTimers();
    updateContactDamage(level);
    const seq = currentLog()?.seq ?? 0;
    for (; seen < seq; seen++) lands.push(t);
    if (t === 70) hitMob(orc, player, 1);
  }
  assert.ok(lands.length >= 2, 'it keeps swinging');
  for (let i = 1; i < lands.length; i++) assert.ok(lands[i] - lands[i - 1] >= 60, 'never twice within a second');
  assert.equal(lands[1] - lands[0], 60, 'exactly a second apart');
  world.remove(orc);
  world.remove(player);
});

test('critical hits: a d20 of the critical range always hits and doubles the dice; a Champion widens the range', async () => {
  const { resolveAttack } = await load('rules/Combat');
  const { characterSheet } = await load('rules/CharacterSheet');
  const attack = { attackBonus: -50, damage: { count: 1, sides: 8, bonus: 0 }, mode: 'normal' };
  const roll = (natural, critFrom) => resolveAttack({ ...attack, critFrom }, 30, (sides) => (sides === 20 ? natural : 3));
  assert.equal(roll(19, undefined).hit, false, 'a 19 is no critical by default');
  assert.equal(roll(20, undefined).critical, true);
  const wide = roll(19, 19);
  assert.deepEqual([wide.hit, wide.critical, wide.damageDice.count], [true, true, 2]);
  assert.equal(roll(18, 19).hit, false);
  assert.equal(roll(18, 18).critical, true);
  const critOf = (archetype, level, off) => {
    const hero = heroWith(archetype, level);
    if (off) hero.featuresOff = off;
    return characterSheet(hero).attack.critFrom;
  };
  assert.equal(critOf('champion', 2), 20, 'before the archetype');
  assert.equal(critOf('champion', 3), 19, 'Improved Critical');
  assert.equal(critOf('champion', 14), 19);
  assert.equal(critOf('champion', 15), 18, 'Superior Critical');
  assert.equal(critOf('champion', 15, ['superior_critical']), 20, 'Superior Critical takes the place of Improved Critical: switched off, neither applies');
  assert.equal(critOf('champion', 14, ['improved_critical']), 20, 'Improved Critical switched off');
  assert.equal(critOf('battle_master', 20), 20, 'only a Champion');
  assert.equal(critOf('eldritch_knight', 20), 20);
  const wizard = createPlayer(0, 0, 'wizard');
  wizard.playerStats.level = 20;
  assert.equal(characterSheet(wizard).attack.critFrom, 20);
});

test('Champion: Remarkable Athlete doubles the speed for 6 seconds, Survivor mends a hero at half health, the archetype is final', async () => {
  const { characterSheet } = await load('rules/CharacterSheet');
  const { CLASSES } = await load('rules/Classes');
  const Build = await load('rules/Build');
  const { updateSurvivor, updateFeatureTimers, athleteSpeedFactor } = await load('systems/FeatureSystem');
  const champ = heroWith('champion', 7);
  const master = heroWith('battle_master', 7);
  assert.equal(characterSheet(champ).initiative, characterSheet(master).initiative, 'no longer an initiative bonus');
  assert.equal(Features.featureOfClass('fighter', 'remarkable_athlete').kind, 'active');
  assert.equal(usedFeature(champ, 'remarkable_athlete', 0, arena(6, 6)), 'ok');
  assert.equal(athleteSpeedFactor(champ), 2, 'twice the speed');
  for (let t = 0; t < 360; t++) updateFeatureTimers();
  assert.equal(athleteSpeedFactor(champ), 1, 'for 6 seconds');
  const hero = heroWith('champion', 18);
  hero.health.max = 200;
  hero.health.current = 150;
  updateSurvivor();
  assert.equal(hero.health.current, 150, 'above half: nothing');
  hero.health.current = 100;
  updateSurvivor();
  const con = characterSheet(hero).modifiers.constitution;
  assert.equal(hero.health.current, 100 + 5 + con, '5 + CON');
  const after = hero.health.current;
  updateSurvivor();
  assert.equal(hero.health.current, after, 'every 6 seconds, not every tick');
  hero.health.current = 100;
  for (let t = 0; t < 360; t++) updateSurvivor();
  assert.ok(hero.health.current > 100, 'and again after them');
  hero.health.current = 0;
  hero.survivorCooldown = 0;
  updateSurvivor();
  assert.equal(hero.health.current, 0, 'not at 0 hit points');
  const lowLevel = heroWith('champion', 17);
  lowLevel.health.max = 200;
  lowLevel.health.current = 50;
  updateSurvivor();
  assert.equal(lowLevel.health.current, 50, 'not before level 18');
  const fresh = playerAt(2, 2, 'fighter');
  assert.equal(Build.takeArchetype(CLASSES.fighter, fresh.build, 2, 'champion'), false, 'not before level 3');
  assert.equal(Build.takeArchetype(CLASSES.fighter, fresh.build, 3, 'champion'), true);
  assert.equal(Build.takeArchetype(CLASSES.fighter, fresh.build, 3, 'eldritch_knight'), false, 'once and for good');
  assert.equal(Build.takeArchetype(CLASSES.wizard, createPlayer(0, 0, 'wizard').build, 3, 'champion'), false, 'a wizard has none');
});

test('the Fighter has every feature of the level table, each gated by its archetype, with a description', async () => {
  const Features = await load('rules/ClassFeatures');
  const { MANEUVERS } = await load('rules/Maneuvers');
  const ids = (picks, level) => Features.featuresAt('fighter', level, picks).map((f) => f.id);
  const champion = ids({ archetype: 'champion' }, 20);
  for (const id of ['champion', 'remarkable_athlete', 'additional_fighting_style', 'superior_critical', 'survivor', 'extra_attack_3', 'indomitable']) {
    assert.ok(champion.includes(id), id);
  }
  assert.ok(!champion.includes('improved_critical'), 'Superior Critical takes its place');
  assert.ok(!champion.includes('martial_archetype'), 'the chosen archetype takes the place of the one that asks for a choice');
  assert.ok(!champion.includes('combat_superiority') && !champion.includes('war_magic'));
  assert.deepEqual(ids({ archetype: 'champion' }, 6).filter((id) => Features.featureOfClass('fighter', id).needs), ['champion', 'improved_critical'], 'level 3 gives the archetype and Improved Critical');
  assert.ok(ids({ archetype: 'champion' }, 14).includes('improved_critical') && !ids({ archetype: 'champion' }, 15).includes('improved_critical'));
  assert.ok(!ids({ archetype: 'champion' }, 14).includes('superior_critical') && ids({ archetype: 'champion' }, 15).includes('superior_critical'));
  const master = ids({ archetype: 'battle_master', maneuvers: ['parry', 'trip_attack'] }, 20);
  for (const id of ['combat_superiority', 'student_of_war', 'know_your_enemy', 'improved_combat_superiority', 'relentless', 'parry', 'trip_attack']) assert.ok(master.includes(id), id);
  assert.ok(!master.includes('rally') && !master.includes('improved_critical'), 'only the maneuvers that were chosen');
  const knight = ids({ archetype: 'eldritch_knight' }, 20);
  for (const id of ['spellcasting_knight', 'weapon_bond', 'war_magic', 'eldritch_strike', 'arcane_charge', 'improved_war_magic']) assert.ok(knight.includes(id), id);
  assert.ok(!ids({ archetype: 'eldritch_knight' }, 6).includes('war_magic'), 'War Magic is level 7');
  for (const id of MANEUVERS) {
    const def = Features.featureOfClass('fighter', id);
    assert.ok(def && def.kind === 'active' && def.needs === id && def.worked && def.description.length > 40, id);
  }
  for (const f of Features.CLASS_FEATURE_LIST.fighter) {
    assert.ok(f.needs === null || ['champion', 'battle_master', 'eldritch_knight', 'archery', 'defense', 'dueling', 'great_weapon_fighting', 'protection', 'two_weapon_fighting'].includes(f.needs) || MANEUVERS.includes(f.needs), `${f.id} needs a real choice`);
  }
  const surge = Features.featureOfClass('fighter', 'action_surge');
  assert.deepEqual([2, 16, 17, 20].map((level) => Features.featureCooldown(surge, level)), [60, 60, 30, 30], 'Action Surge twice from level 17: half the wait');
  const indomitable = Features.featureOfClass('fighter', 'indomitable');
  assert.deepEqual([9, 13, 17].map((level) => Features.featureUses(indomitable, level)), [1, 1, 1], 'one reroll, then 30 seconds to recover');
  assert.equal(indomitable.kind, 'passive');
});

test('Action Surge recovers in 30 seconds from level 17', () => {
  const level = arena(10, 6);
  const fighter = casterAt(2, 2, 'fighter', 0);
  fighter.playerStats.level = 17;
  bindSpell(fighter, 0, 'feature:action_surge', 0);
  cast(level, fighter, 1);
  assert.equal(fighter.spellbook.recovery[0], 30 * 60);
  fighter.playerStats.level = 2;
  fighter.castCooldown = 0;
  fighter.spellbook.recovery[0] = 0;
  cast(level, fighter, 1);
  assert.equal(fighter.spellbook.recovery[0], 60 * 60);
});

test('Battle Master: superiority dice and maneuvers known follow the table, and the picks are checked', async () => {
  const M = await load('rules/Maneuvers');
  const Build = await load('rules/Build');
  const { CLASSES } = await load('rules/Classes');
  assert.deepEqual([2, 3, 6, 7, 14, 15, 20].map(M.superiorityDice), [0, 4, 4, 5, 5, 6, 6]);
  assert.deepEqual([3, 9, 10, 17, 18].map(M.superioritySides), [8, 8, 10, 10, 12]);
  assert.deepEqual([2, 3, 6, 7, 9, 10, 14, 15, 20].map(M.maneuversKnown), [0, 3, 3, 5, 5, 7, 7, 9, 9]);
  assert.equal(M.MANEUVERS.length, 16);
  const hero = heroWith('battle_master', 3);
  const { build } = hero;
  assert.equal(Build.levelHasChoice(CLASSES.fighter, 3, build), true);
  assert.equal(Build.takePicks(CLASSES.fighter, build, 3, { maneuvers: ['parry', 'riposte'] }), false, 'three are owed');
  assert.equal(Build.takePicks(CLASSES.fighter, build, 3, { maneuvers: ['parry', 'parry', 'riposte'] }), false, 'each once');
  assert.equal(Build.takePicks(CLASSES.fighter, build, 3, { maneuvers: ['parry', 'riposte', 'smite'] }), false, 'a real maneuver');
  assert.equal(Build.takePicks(CLASSES.fighter, build, 3, { maneuvers: ['parry', 'riposte', 'trip_attack'] }), true);
  assert.deepEqual(build.maneuvers, ['parry', 'riposte', 'trip_attack']);
  assert.equal(Build.takePicks(CLASSES.fighter, build, 3, { maneuvers: ['rally', 'pushing_attack', 'precision_attack'] }), false, 'no more at level 3');
  assert.equal(Build.levelHasChoice(CLASSES.fighter, 3, build), false);
  assert.equal(Build.levelHasChoice(CLASSES.fighter, 7, build), true, 'two more at level 7');
  assert.equal(Build.takePicks(CLASSES.fighter, build, 7, { maneuvers: ['parry', 'rally'] }), false, 'not one already known');
  assert.equal(Build.takePicks(CLASSES.fighter, build, 7, { maneuvers: ['rally', 'pushing_attack'] }), true);
  assert.equal(Build.takePicks(CLASSES.fighter, heroWith('champion', 3).build, 3, { maneuvers: ['parry', 'riposte', 'trip_attack'] }), false, 'only a Battle Master');
  assert.equal(Build.validBuild({ ...build, maneuvers: ['parry', 'kick'] }), false);
  assert.equal(Build.validBuild(JSON.parse(JSON.stringify(build))), true);
});

test('Battle Master: a readied rider spends a die on the blow that lands, adds it to the damage and trips a foe that fails its save', async () => {
  const { diceLeft, restoreDice } = await load('systems/ManeuverSystem');
  const { strike } = await load('systems/Strike');
  const { characterSheet } = await load('rules/CharacterSheet');
  const level = arena(10, 6);
  const hero = heroWith('battle_master', 3, { maneuvers: ['parry', 'riposte', 'trip_attack'] });
  const goblin = mobAt(level, 'goblin', 3, 2);
  assert.equal(diceLeft(hero), 4);
  assert.equal(usedFeature(hero, 'trip_attack', 0, level), 'ok');
  assert.equal(hero.maneuver.id, 'trip_attack');
  assert.equal(diceLeft(hero), 4, 'a die is spent only when the blow lands');
  const attack = characterSheet(hero).attack;
  useDieRoller(rollerOf([2]));
  assert.equal(strike(goblin, attack, hero).hit, false, 'a miss spends nothing');
  assert.equal(diceLeft(hero), 4);
  assert.equal(hero.maneuver.id, 'trip_attack', 'and the maneuver waits');
  useDieRoller(rollerOf([18, 1], 4));
  const outcome = strike(goblin, attack, hero);
  useDieRoller(SURE_HIT);
  assert.equal(outcome.hit, true);
  assert.equal(outcome.damage, 4 + 3 + 4, 'the weapon die, STR +3 and the superiority die (d8: 4)');
  assert.equal(diceLeft(hero), 3);
  assert.equal(hero.maneuver, undefined);
  assert.ok(goblin.status.prone > 0, 'a failed Strength save');
  restoreDice(hero);
  assert.equal(diceLeft(hero), 4, 'a rest brings them back');
  hero.superiorityLeft = 0;
  assert.equal(usedFeature(hero, 'trip_attack', 0, level), 'no_dice');
  assert.equal(hero.maneuver, undefined);
});

test('Battle Master: a foe that saves is not tripped, a prone foe is attacked with advantage and fights with disadvantage', async () => {
  const { strike } = await load('systems/Strike');
  const { characterSheet } = await load('rules/CharacterSheet');
  const level = arena(10, 6);
  const hero = heroWith('battle_master', 3, { maneuvers: ['trip_attack'] });
  const goblin = mobAt(level, 'goblin', 3, 2);
  const attack = characterSheet(hero).attack;
  usedFeature(hero, 'trip_attack', 0, level);
  useDieRoller(rollerOf([18, 20], 4));
  strike(goblin, attack, hero);
  useDieRoller(SURE_HIT);
  assert.equal(goblin.status, undefined, 'a natural 20 on the save resists it');
  assert.equal(hero.superiorityLeft, 3, 'the die is spent all the same');
  world.addComponent(goblin, 'status', { prone: 100, frightened: 0, goaded: 0, distracted: 0, eldritch: 0, charmed: 0, by: world.id(hero) });
  const seen = [];
  useDieRoller((sides) => { seen.push(sides); return 10; });
  strike(goblin, attack, hero);
  assert.equal(seen.filter((s) => s === 20).length, 2, 'two d20s: advantage');
  seen.length = 0;
  strike(hero, { attackBonus: 0, damage: { count: 1, sides: 4, bonus: 0 }, mode: 'normal' }, goblin);
  assert.equal(seen.filter((s) => s === 20).length, 2, 'the tripped goblin rolls two d20s too (disadvantage)');
  useDieRoller(SURE_HIT);
});

test("Battle Master: Precision Attack lifts a miss to a hit, Parry and Riposte answer the enemy's blow, Evasive Footwork adds to AC", async () => {
  const { strike, armorClassOf } = await load('systems/Strike');
  const { parried, riposted } = await load('systems/Reactions');
  const { characterSheet } = await load('rules/CharacterSheet');
  const level = arena(10, 6);
  const hero = heroWith('battle_master', 3, { maneuvers: ['precision_attack', 'parry', 'riposte', 'evasive_footwork'] });
  const goblin = mobAt(level, 'goblin', 3, 2);
  const attack = characterSheet(hero).attack;
  const bonus = attack.attackBonus;
  usedFeature(hero, 'precision_attack', 0, level);
  useDieRoller(rollerOf([15 - bonus - 1], 4));
  assert.equal(strike(goblin, attack, hero).hit, true, 'one short, and the die (4) makes up for it');
  useDieRoller(SURE_HIT);
  assert.equal(hero.superiorityLeft, 3);
  usedFeature(hero, 'precision_attack', 0, level);
  useDieRoller(rollerOf([2], 4));
  assert.equal(strike(goblin, attack, hero).hit, false, 'too far off: nothing is spent');
  useDieRoller(SURE_HIT);
  assert.equal(hero.superiorityLeft, 3);

  usedFeature(hero, 'parry', 0, level);
  useDieRoller(rollerOf([], 4));
  assert.equal(parried(hero, 10), 10 - (4 + characterSheet(hero).modifiers.dexterity), 'the die and DEX come off');
  useDieRoller(SURE_HIT);
  assert.equal(hero.superiorityLeft, 2);
  assert.equal(parried(hero, 10), 10, 'once');

  goblin.health.current = goblin.health.max = 500;
  usedFeature(hero, 'riposte', 0, level);
  useDieRoller(rollerOf([18], 4));
  riposted(hero, goblin);
  useDieRoller(SURE_HIT);
  assert.ok(goblin.health.current < 500, 'a counter-attack hit the foe');
  assert.equal(hero.superiorityLeft, 1);

  const plain = armorClassOf(hero);
  hero.superiorityLeft = 4;
  useDieRoller(rollerOf([], 5));
  usedFeature(hero, 'evasive_footwork', 0, level);
  useDieRoller(SURE_HIT);
  assert.equal(armorClassOf(hero), plain, 'standing still');
  hero.walkTime = 5;
  assert.equal(armorClassOf(hero), plain + 5, 'on the move, the die (5) is added');
});

test('Battle Master: Rally gives an ally temporary hit points that soak damage, and both ally maneuvers need an ally', async () => {
  const { hurtPlayer } = await load('systems/CombatSystem');
  const level = arena(10, 6);
  const hero = heroWith('battle_master', 3, { maneuvers: ['rally', 'commanders_strike'] });
  assert.equal(usedFeature(hero, 'rally', 0, level), 'no_ally');
  assert.equal(usedFeature(hero, 'commanders_strike', 0, level), 'no_ally');
  assert.equal(hero.superiorityLeft, undefined, 'nothing spent');
  const ally = playerAt(3, 2, 'fighter');
  useDieRoller(rollerOf([], 6));
  assert.equal(usedFeature(hero, 'rally', 0, level), 'ok');
  useDieRoller(SURE_HIT);
  assert.ok(ally.tempHealth >= 5, 'a die and CHA');
  const temp = ally.tempHealth;
  const health = ally.health.current;
  hurtPlayer(ally, hero, 3);
  assert.equal(ally.health.current, health, 'the damage is taken from the temporary hit points first');
  assert.equal(ally.tempHealth, temp - 3);
  useDieRoller(rollerOf([], 6));
  assert.equal(usedFeature(hero, 'commanders_strike', 0, level), 'ok');
  useDieRoller(SURE_HIT);
  assert.equal(ally.maneuver.id, 'commanders_strike');
  assert.equal(ally.maneuver.bonus, 6);
});

test('Battle Master: Disarming, Pushing, Distracting, Goading, Menacing and Sweeping work on the foe', async () => {
  const { strike } = await load('systems/Strike');
  const { characterSheet } = await load('rules/CharacterSheet');
  const level = arena(12, 6);
  const hero = heroWith('battle_master', 15, { maneuvers: ['disarming_attack', 'pushing_attack', 'distracting_strike', 'goading_attack', 'menacing_attack', 'sweeping_attack'] });
  const attack = characterSheet(hero).attack;
  const hitWith = (id, foe, d20 = [18, 1]) => {
    usedFeature(hero, id, 0, level);
    useDieRoller(rollerOf(d20, 4));
    const outcome = strike(foe, attack, hero);
    useDieRoller(SURE_HIT);
    return outcome;
  };
  const orc = mobAt(level, 'orc', 3, 2);
  orc.health.current = orc.health.max = 500;
  orc.mobWeapon = 'club';
  hitWith('disarming_attack', orc);
  assert.equal(orc.mobWeapon, 'unarmed', 'it drops its weapon');
  hitWith('pushing_attack', orc);
  assert.ok(Math.hypot(orc.bump.x, orc.bump.y) > 20, 'shoved hard');
  hitWith('distracting_strike', orc);
  assert.ok(orc.status.distracted > 0);
  hitWith('goading_attack', orc);
  assert.ok(orc.status.goaded > 0);
  hitWith('menacing_attack', orc);
  assert.ok(orc.status.frightened > 0);
  const near = mobAt(level, 'goblin', 3.7, 2);
  const far = mobAt(level, 'goblin', 8, 2);
  beginPerception();
  hitWith('sweeping_attack', orc, [18]);
  assert.ok(near.health.current < near.health.max, 'the foe next to it takes the die');
  assert.equal(far.health.current, far.health.max, 'the far one does not');
  assert.equal(hero.superiorityLeft, 0, 'six dice, six maneuvers');
});

test('marked foes: a frightened or goaded enemy attacks with disadvantage, a goaded one only against others', async () => {
  const { strike } = await load('systems/Strike');
  const level = arena(10, 6);
  const hero = heroWith('battle_master', 3);
  const other = playerAt(4, 2, 'fighter');
  const goblin = mobAt(level, 'goblin', 3, 2);
  const by = world.id(hero);
  const d20s = (attacker, target) => {
    const seen = [];
    useDieRoller((sides) => { seen.push(sides); return 10; });
    strike(target, { attackBonus: 0, damage: { count: 1, sides: 4, bonus: 0 }, mode: 'normal' }, attacker);
    useDieRoller(SURE_HIT);
    return seen.filter((s) => s === 20).length;
  };
  assert.equal(d20s(goblin, hero), 1);
  world.addComponent(goblin, 'status', { prone: 0, frightened: 100, goaded: 0, distracted: 0, eldritch: 0, charmed: 0, by });
  assert.equal(d20s(goblin, hero), 2, 'frightened of the hero: disadvantage against them');
  assert.equal(d20s(goblin, other), 1, 'and not against anyone else');
  goblin.status.frightened = 0;
  goblin.status.goaded = 100;
  assert.equal(d20s(goblin, hero), 1, 'goaded by the hero: fine against them');
  assert.equal(d20s(goblin, other), 2, 'disadvantage against everyone else');
});

test('Eldritch Knight: cantrips and spells known follow the table and are chosen from the wizard list', async () => {
  const K = await load('rules/KnightSpells');
  const Build = await load('rules/Build');
  const Spellbook = await load('rules/Spellbook');
  const { CLASSES } = await load('rules/Classes');
  assert.deepEqual([2, 3, 9, 10, 20].map(K.knightCantripsKnown), [0, 2, 2, 3, 3]);
  assert.deepEqual([2, 3, 4, 7, 8, 10, 11, 13, 14, 16, 19, 20].map(K.knightSpellsKnown), [0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.deepEqual([2, 3, 6, 7, 12, 13, 18, 19].map(K.knightSlotLevel), [0, 1, 1, 2, 2, 3, 3, 4]);
  assert.deepEqual([...K.KNIGHT_PICK_LEVELS], [3, 4, 7, 8, 10, 11, 13, 14, 16, 19, 20]);
  const hero = heroWith('eldritch_knight', 3);
  const { build } = hero;
  assert.deepEqual(Build.knightNeeded(build, 3), { cantrips: 2, spells: 3 });
  const take = (level, ids) => Build.takePicks(CLASSES.fighter, build, level, { spells: ids });
  assert.equal(take(3, ['fire_bolt', 'magic_missile', 'chromatic_orb', 'burning_hands']), false, 'one cantrip too few');
  assert.equal(take(3, ['fire_bolt', 'ray_of_frost', 'magic_missile', 'chromatic_orb']), false, 'one spell too few');
  assert.equal(take(3, ['fire_bolt', 'ray_of_frost', 'cure_wounds', 'chromatic_orb', 'burning_hands']), false, 'not a wizard spell');
  assert.equal(take(3, ['fire_bolt', 'ray_of_frost', 'fireball', 'chromatic_orb', 'burning_hands']), false, 'no slots of that level yet');
  assert.equal(take(3, ['fire_bolt', 'ray_of_frost', 'ice_knife', 'magic_missile', 'chromatic_orb']), false, 'only Player\'s Handbook spells');
  assert.ok(Spellbook.knightOutsideSchools('ray_of_sickness') && !Spellbook.knightOutsideSchools('magic_missile'), 'necromancy is outside abjuration and evocation');
  assert.equal(take(3, ['fire_bolt', 'ray_of_frost', 'ray_of_sickness', 'magic_missile', 'chromatic_orb']), true, 'one spell may be outside the schools');
  assert.deepEqual(Build.knightNeeded(build, 3), { cantrips: 0, spells: 0 });
  assert.deepEqual(Build.knightNeeded(build, 4), { cantrips: 0, spells: 1 });
  assert.equal(take(4, ['thunderwave']), true);
  assert.equal(Build.validBuild(JSON.parse(JSON.stringify(build))), true);
  assert.equal(Build.takePicks(CLASSES.fighter, heroWith('champion', 3).build, 3, { spells: ['fire_bolt', 'ray_of_frost', 'magic_missile', 'chromatic_orb', 'thunderwave'] }), false, 'only a Knight');
  const list = Spellbook.spellListOf('fighter', build);
  assert.equal(list, 'eldritch_knight');
  assert.equal(Spellbook.spellListOf('fighter', heroWith('champion', 3).build), 'fighter');
  assert.equal(Spellbook.spellListOf('wizard', build), 'wizard');
  const learnt = Spellbook.learntSpells(list, 3, build.spells).map((spells) => spells.map((s) => s.id));
  assert.deepEqual(learnt[0].sort(), ['fire_bolt', 'ray_of_frost']);
  assert.deepEqual(learnt[1].sort(), ['chromatic_orb', 'magic_missile', 'ray_of_sickness', 'thunderwave']);
  assert.equal(Spellbook.highestSpellLevel(list, 3), 1);
  assert.equal(Spellbook.highestSpellLevel(list, 19), 4);
  assert.equal(Spellbook.canBind(list, 3, 'fire_bolt', 0, build.spells), true);
  assert.equal(Spellbook.canBind(list, 3, 'burning_hands', 1, build.spells), false, 'a wizard spell the Knight has not chosen');
});

test('Eldritch Knight: a chosen spell goes on the quick bar and is cast, and War Magic follows a cantrip with a weapon attack', () => {
  const level = arena(12, 6);
  const knight = casterAt(2, 2, 'fighter', 0);
  knight.build.archetype = 'eldritch_knight';
  knight.build.spells = ['fire_bolt', 'ray_of_frost', 'magic_missile'];
  knight.equipped = { primary: weaponItem('longsword') };
  knight.playerStats.level = 3;
  assert.equal(bindSpell(knight, 0, 'fire_bolt', 0), true);
  assert.equal(bindSpell(knight, 1, 'burning_hands', 1), false, 'not one of theirs');
  const orc = mobAt(level, 'orc', 6, 2);
  const before = orc.health.current;
  cast(level, knight, 70);
  assert.ok(orc.health.current < before, 'a Fire Bolt hits');
  assert.equal(knight.swordSwing, undefined, 'no War Magic before level 7');
  knight.playerStats.level = 7;
  knight.spellbook.recovery[0] = 0;
  knight.castCooldown = 0;
  cast(level, knight, 20);
  assert.ok(knight.swordSwing, 'a swing followed the cantrip');
  world.removeComponent(knight, 'swordSwing');
  bindSpell(knight, 2, 'magic_missile', 1);
  knight.playerInput.spellSlot = 2;
  knight.castCooldown = 0;
  knight.casting = undefined;
  cast(level, knight, 30);
  assert.equal(knight.swordSwing, undefined, 'a 1st-level spell does not, before Improved War Magic');
  knight.playerStats.level = 18;
  knight.spellbook.recovery[2] = 0;
  knight.castCooldown = 0;
  cast(level, knight, 30);
  assert.ok(knight.swordSwing, 'Improved War Magic: any spell');
});

test('Eldritch Knight: Eldritch Strike makes the next saving throw against a spell harder, Arcane Charge steps through the air', async () => {
  const { strike } = await load('systems/Strike');
  const { characterSheet } = await load('rules/CharacterSheet');
  const { spellSaveMode } = await load('systems/ManeuverSystem');
  const level = arena(16, 6);
  const knight = heroWith('eldritch_knight', 10);
  const goblin = mobAt(level, 'goblin', 3, 2);
  strike(goblin, characterSheet(knight).attack, knight);
  assert.ok(goblin.status.eldritch > 0, 'a weapon hit marks the foe');
  assert.equal(spellSaveMode(goblin), 'disadvantage');
  assert.equal(spellSaveMode(goblin), 'normal', 'only the next one');
  const early = heroWith('eldritch_knight', 9);
  const other = mobAt(level, 'goblin', 3, 2);
  strike(other, characterSheet(early).attack, early);
  assert.equal(other.status, undefined, 'not before level 10');

  const charger = heroWith('eldritch_knight', 15);
  charger.position.x = centre(2);
  charger.position.y = centre(2);
  const from = charger.position.x;
  assert.equal(usedFeature(charger, 'action_surge', 0, level), 'ok');
  assert.ok(charger.position.x - from > 200, `teleported east about 30 feet (${charger.position.x - from})`);
  assert.ok(charger.position.x - from <= 288 + 1);
  const walled = heroWith('eldritch_knight', 15);
  walled.position.x = centre(13);
  walled.position.y = centre(2);
  usedFeature(walled, 'action_surge', 0, level);
  assert.ok(walled.position.x < 15 * TILE_WIDTH, 'a wall stops the step short');
  const plain = heroWith('champion', 15);
  plain.position.x = centre(2);
  plain.position.y = centre(2);
  usedFeature(plain, 'action_surge', 0, level);
  assert.equal(plain.position.x, centre(2), 'only a Knight');
});

test('the new Fighter components cross the network checked', () => {
  const hero = heroWith('battle_master', 3, { maneuvers: ['parry', 'riposte', 'trip_attack'] });
  world.addComponent(hero, 'playerSlot', 'host');
  hero.superiorityLeft = 2;
  hero.tempHealth = 10;
  hero.survivorCooldown = 5;
  hero.volley = 1;
  world.addComponent(hero, 'maneuver', { id: 'parry', ticks: 50, bonus: 0 });
  const goblin = mobAt(arena(6, 6), 'goblin', 3, 3);
  world.addComponent(goblin, 'status', { prone: 5, frightened: 0, goaded: 0, distracted: 0, eldritch: 0, charmed: 0, by: 1 });
  const snapshot = () => JSON.parse(JSON.stringify(captureWorld(false, 7)));
  assert.doesNotThrow(() => validateNetState(snapshot()));
  const bad = snapshot();
  bad.entities.find((e) => e.data.maneuver).data.maneuver.id = 'fireball';
  assert.throws(() => validateNetState(bad), ValidationError);
  assert.ok(validCommand({ kind: 'archetype', archetype: 'champion' }));
  assert.ok(!validCommand({ kind: 'archetype', archetype: 'paladin' }));
  assert.ok(validCommand({ kind: 'extra_style', style: 'two_weapon_fighting' }));
  assert.ok(!validCommand({ kind: 'extra_style', style: 'smiting' }));
  assert.ok(validCommand({ kind: 'pick', level: 3, maneuvers: ['parry', 'riposte', 'trip_attack'] }));
  assert.ok(validCommand({ kind: 'pick', level: 3, spells: ['fire_bolt', 'magic_missile'] }));
  assert.ok(!validCommand({ kind: 'pick', level: 3, maneuvers: ['kick'] }));
  assert.ok(!validCommand({ kind: 'pick', level: 3, spells: ['cure_wounds'] }), 'not a wizard spell');
  assert.ok(!validCommand({ kind: 'pick', level: 99, maneuvers: ['parry'] }));
  assert.ok(!validCommand({ kind: 'pick', level: 3, maneuvers: Array.from({ length: 20 }, () => 'parry') }));
});

test('a guest picks an archetype and maneuvers; the host checks each', () => {
  const hero = playerAt(2, 2, 'fighter');
  world.addComponent(hero, 'playerSlot', 'p2');
  hero.playerStats.level = 3;
  handleGuestCommand('p2', { kind: 'archetype', archetype: 'battle_master' });
  assert.equal(hero.build.archetype, undefined, 'only the Champion is on offer for now');
  // A Battle Master from before the archetypes were narrowed down still learns their maneuvers.
  hero.build.archetype = 'battle_master';
  handleGuestCommand('p2', { kind: 'pick', level: 3, maneuvers: ['parry', 'riposte', 'rally'] });
  assert.deepEqual(hero.build.maneuvers, ['parry', 'riposte', 'rally']);
  handleGuestCommand('p2', { kind: 'pick', level: 7, maneuvers: ['trip_attack', 'pushing_attack'] });
  assert.equal(hero.build.maneuvers.length, 3, 'level 7 has not been reached');
  assert.equal(bindSpell(hero, 0, 'feature:parry', 0), true);
  assert.equal(bindSpell(hero, 1, 'feature:trip_attack', 0), false, 'not a maneuver they know');
});

test('the Skills tab shows the style and the archetype the hero chose in place of the entries that ask for them', async () => {
  const Features = await load('rules/ClassFeatures');
  const ids = (picks, level) => Features.featuresAt('fighter', level, picks).map((f) => f.id);
  assert.ok(ids({}, 3).includes('fighting_style') && ids({}, 3).includes('martial_archetype'), 'before they choose');
  const dueling = ids({ fightingStyle: 'dueling' }, 3);
  assert.ok(!dueling.includes('fighting_style') && dueling.includes('dueling'), 'the chosen style is listed instead');
  assert.ok(!dueling.includes('archery') && !dueling.includes('protection'), 'and no other');
  const two = Features.featureOfClass('fighter', 'two_weapon_fighting');
  assert.equal(two.kind, 'info', 'a style with a rule only is told about');
  const protection = Features.featuresAt('fighter', 1, { fightingStyle: 'protection' }).find((f) => f.id === 'protection');
  assert.equal(protection.kind, 'passive', 'Protection is a passive');
  assert.ok(!ids({ fightingStyle: 'protection' }, 1).includes('fighting_style'));
  const both = ids({ fightingStyle: 'dueling', archetype: 'champion', extraStyle: 'archery' }, 10);
  assert.ok(both.includes('dueling') && both.includes('archery') && !both.includes('additional_fighting_style'), 'the second style too');
  assert.ok(ids({ fightingStyle: 'dueling', archetype: 'champion' }, 10).includes('additional_fighting_style'), 'until it is chosen');
  assert.ok(ids({ archetype: 'battle_master' }, 3).includes('battle_master') && !ids({ archetype: 'battle_master' }, 3).includes('martial_archetype'));
});

test('the level log shows a level only once the choices before it are made', async () => {
  const { CLASSES } = await load('rules/Classes');
  const Build = await load('rules/Build');
  const fighter = CLASSES.fighter;
  const hero = playerAt(2, 2, 'fighter');
  const { build } = hero;
  assert.equal(Build.visibleLevel(fighter, 5, build), 1, 'level 1 is still open: nothing else shows');
  build.fightingStyle = 'dueling';
  build.locked = true;
  assert.equal(Build.visibleLevel(fighter, 2, build), 2, 'no choice at level 2');
  assert.equal(Build.visibleLevel(fighter, 5, build), 4, 'level 3 makes the hero a Champion by itself: level 4 offers an Improvement');
  build.archetype = 'champion';
  assert.equal(Build.visibleLevel(fighter, 5, build), 4, 'level 4 offers an Improvement');
  Build.takeImprovement(fighter, build, 4, { feat: 'tough' });
  assert.equal(Build.visibleLevel(fighter, 5, build), 5);
  assert.equal(Build.visibleLevel(fighter, 7, build), 6, 'level 6 is waiting');
  assert.equal(Build.visibleLevel(CLASSES.wizard, 4, createPlayer(0, 0, 'wizard').build), 1, 'the wizard has not saved their scores');
});

// ── Level cap, Fighter features reworked, feats ────────────────────────────

test('experience stops at level 12 for now, though the tables go on to 20', async () => {
  const { grantExperience } = await load('systems/DeathSystem');
  const { LEVEL_CAP, MAX_LEVEL } = await load('game/Progress');
  assert.equal(LEVEL_CAP, 12);
  assert.equal(MAX_LEVEL, 20, 'the rules tables keep every level');
  const hero = playerAt(2, 2, 'fighter');
  grantExperience(hero, 1_000_000);
  assert.equal(hero.playerStats.level, 12);
  assert.equal(Features.featuresAt('fighter', 20, { archetype: 'champion' }).some((f) => f.id === 'survivor'), true, 'what lies above 12 is still there');
});

test('Second Wind: refused at full health (nothing spent), a turquoise aura follows the fighter when used', async () => {
  const level = arena(10, 6);
  const fighter = casterAt(2, 2, 'fighter', 0);
  fighter.inSafeRoom = false;
  fighter.health.current = fighter.health.max;
  assert.equal(usedFeature(fighter, 'second_wind', 0, level), 'hp_full');
  bindSpell(fighter, 0, 'feature:second_wind', 0);
  fighter.playerInput.spellSlot = 0;
  fighter.castCooldown = 0;
  cast(level, fighter, 1);
  assert.equal(fighter.spellbook.recovery[0], 0, 'its square does not start recovering');
  fighter.health.current = 1;
  assert.equal(usedFeature(fighter, 'second_wind', 0, level), 'ok');
  // The aura's sheet loads first (at once here: no art in the tests).
  await new Promise((resolve) => setTimeout(resolve, 0));
  const aura = world.entities.find((e) => e.fx?.follow === world.id(fighter));
  assert.ok(aura, 'an aura that follows the fighter');
  assert.equal(aura.visual.tint, 0x40e0d0, 'turquoise');
});

test('Action Surge doubles every swing\'s attacks for 6 seconds, and the whole chain still lands within the attack period', async () => {
  const { characterSheet } = await load('rules/CharacterSheet');
  const { updateFeatureTimers } = await load('systems/FeatureSystem');
  const { ATTACK_PERIOD } = await load('entities/WeaponStats');
  const { blowTiming } = await load('systems/SwordSystem');
  for (const [lvl, normal] of [[2, 1], [5, 2], [11, 3], [12, 3]]) {
    const hero = heroWith('champion', lvl);
    assert.equal(characterSheet(hero).attacks, normal, `level ${lvl}`);
    assert.equal(usedFeature(hero, 'action_surge', 0, arena(6, 6)), 'ok');
    assert.equal(characterSheet(hero).attacks, normal * 2, `level ${lvl} under Action Surge`);
    hero.playerInput.intents.attack = true;
    let blows = 0;
    let over = -1;
    let waiting = 0;
    for (let t = 0; t < ATTACK_PERIOD; t++) {
      updateSword();
      hero.playerInput.intents.attack = false;
      blows = Math.max(blows, (hero.swordSwing?.blow ?? -1) + 1);
      if (over < 0 && !hero.swordSwing) {
        over = t;
        waiting = hero.swordCooldown;
      }
    }
    assert.equal(blows, normal * 2, `level ${lvl}: every blow of the chain comes`);
    assert.ok(over >= 0 && over < ATTACK_PERIOD, `level ${lvl}: and it is over within the second`);
    // Each blow takes half its natural time, one after another: not spread over the whole second.
    const surged = blowTiming(hero, normal * 2);
    const plain = blowTiming({ ...hero, actionSurge: 0 }, 1);
    assert.ok(surged.windUp + surged.live <= Math.ceil((plain.windUp + plain.live) / 2), `level ${lvl}: half the time a blow`);
    assert.ok(over <= normal * 2 * (surged.windUp + surged.live) + 1, `level ${lvl}: the chain ends as its last blow does`);
    assert.equal(waiting, ATTACK_PERIOD - over, 'the next click still waits for the rest of the second');
    for (let t = 0; t < 360; t++) updateFeatureTimers();
    assert.equal(characterSheet(hero).attacks, normal, 'back to normal after 6 seconds');
  }
});

test('Improved Extra Attack comes at level 11 in place of Extra Attack, and the level log names it', async () => {
  const { attacksPerAction } = await load('rules/CharacterSheet');
  const { CLASSES } = await load('rules/Classes');
  assert.deepEqual([4, 5, 10, 11, 19, 20].map((lvl) => attacksPerAction(CLASSES.fighter, lvl)), [1, 2, 2, 3, 3, 4]);
  assert.equal(attacksPerAction(CLASSES.fighter, 11, ['improved_extra_attack']), 1, 'switched off');
  const at11 = Features.featuresAt('fighter', 11, { archetype: 'champion' }).filter((f) => f.level === 11).map((f) => f.name);
  assert.deepEqual(at11, ['Improved Extra Attack']);
  assert.equal(Features.featureOfClass('fighter', 'improved_extra_attack').kind, 'passive');
});

test('Indomitable rerolls a failed saving throw, then needs 30 seconds or a rest', async () => {
  const { heroSavingThrow, updateFeatureTimers } = await load('systems/FeatureSystem');
  const { takeRest } = await load('game/Rest');
  const hero = heroWith('champion', 9);
  const rolls = [1, 20, 1, 1];
  const die = () => rolls.shift() ?? 1;
  assert.equal(heroSavingThrow(hero, 'wisdom', 15, die), true, 'the 1 is rolled again: 20');
  assert.equal(hero.indomitableCooldown, 30 * 60);
  assert.equal(heroSavingThrow(hero, 'wisdom', 15, die), false, 'recovering: the 1 stands');
  for (let t = 0; t < 30 * 60; t++) updateFeatureTimers();
  assert.equal(hero.indomitableCooldown, 0);
  hero.indomitableCooldown = 500;
  takeRest('short');
  assert.equal(hero.indomitableCooldown, 0, 'a rest makes it ready');
  assert.equal(heroSavingThrow(heroWith('champion', 8), 'wisdom', 15, () => 1), false, 'not before level 9');
});

test('a Fighter becomes a Champion at level 3 by themselves; the other archetypes are not on offer', async () => {
  const { CLASSES } = await load('rules/Classes');
  const Build = await load('rules/Build');
  const { updateBuildLock } = await load('game/Customize');
  const level = arena(6, 6);
  const hero = playerAt(2, 2, 'fighter');
  hero.build.fightingStyle = 'defense';
  hero.build.locked = true;
  hero.playerStats.level = 2;
  updateBuildLock(level);
  assert.equal(hero.build.archetype, undefined, 'not before level 3');
  hero.playerStats.level = 3;
  updateBuildLock(level);
  assert.equal(hero.build.archetype, 'champion');
  assert.equal(Build.takeArchetype(CLASSES.fighter, playerAt(2, 2, 'fighter').build, 3, 'eldritch_knight'), false);
});

test('Tough: +2 for every level already gained when taken, and +2 with every level after', async () => {
  const { applyCustomization } = await load('game/Customize');
  const { grantExperience } = await load('systems/DeathSystem');
  const { LEVEL_THRESHOLDS } = await load('game/Progress');
  const fourth = () => {
    const hero = playerAt(2, 2, 'fighter');
    hero.build.fightingStyle = 'defense';
    hero.build.locked = true;
    hero.build.archetype = 'champion';
    grantExperience(hero, LEVEL_THRESHOLDS[3]);
    return hero;
  };
  const hero = fourth();
  assert.equal(hero.playerStats.level, 4);
  const before = hero.health.max;
  assert.equal(applyCustomization(hero, { kind: 'improve', improvement: { feat: 'tough' } }), true);
  assert.equal(hero.health.max, before + 2 * 4, 'four levels so far');
  const plain = fourth();
  applyCustomization(plain, { kind: 'improve', improvement: { stats: { wisdom: 1, intelligence: 1 } } });
  const gap = hero.health.max - plain.health.max;
  grantExperience(hero, LEVEL_THRESHOLDS[4] - LEVEL_THRESHOLDS[3]);
  grantExperience(plain, LEVEL_THRESHOLDS[4] - LEVEL_THRESHOLDS[3]);
  assert.equal(hero.health.max - plain.health.max, gap + 2, 'and 2 more at level 5');
});

test('feats: every Baldur\'s Gate 3 feat is listed; requirements, worked ones and the ability they raise decide which can be taken', async () => {
  const { CLASSES } = await load('rules/Classes');
  const Build = await load('rules/Build');
  const { FEAT_IDS, FEATS } = await load('rules/Feats');
  const { characterSheet } = await load('rules/CharacterSheet');
  const { text } = await load('core/texts');
  assert.equal(FEAT_IDS.length, 41);
  for (const id of FEAT_IDS) assert.ok(text(`feat.${id}.name`) !== `feat.${id}.name` && text(`feat.${id}.description`) !== `feat.${id}.description`, id);
  const wizard = createPlayer(0, 0, 'wizard').build;
  const fighter = playerAt(2, 2, 'fighter').build;
  assert.equal(Build.featOpen(CLASSES.wizard, 4, wizard, 'heavily_armoured'), false, 'a wizard is not trained in medium armour');
  assert.equal(Build.featOpen(CLASSES.fighter, 4, fighter, 'heavily_armoured'), true);
  assert.equal(Build.meetsRequirement(CLASSES.fighter, 4, fighter, FEATS.war_caster.requires), false, 'a fighter casts no spells');
  assert.equal(Build.meetsRequirement(CLASSES.wizard, 4, wizard, FEATS.war_caster.requires), true);
  assert.equal(Build.featOpen(CLASSES.wizard, 4, wizard, 'war_caster'), false, 'not worked yet');
  assert.equal(Build.takeImprovement(CLASSES.wizard, wizard, 4, { feat: 'athlete' }), false, 'Athlete asks which ability it raises');
  assert.equal(Build.takeImprovement(CLASSES.wizard, wizard, 4, { feat: 'athlete', ability: 'wisdom' }), false, 'one it offers');
  const dex = Build.baseScores(CLASSES.wizard, 4, wizard).dexterity;
  assert.equal(Build.takeImprovement(CLASSES.wizard, wizard, 4, { feat: 'athlete', ability: 'dexterity' }), true);
  assert.equal(Build.baseScores(CLASSES.wizard, 4, wizard).dexterity, dex + 1);
  const resilient = playerAt(2, 2, 'wizard');
  resilient.playerStats.level = 4;
  assert.equal(characterSheet(resilient).saves.constitution.proficient, false);
  Build.takeImprovement(CLASSES.wizard, resilient.build, 4, { feat: 'resilient', ability: 'constitution' });
  assert.equal(characterSheet(resilient).saves.constitution.proficient, true, 'Resilient: trained in its save');
  const armoured = playerAt(2, 2, 'wizard');
  armoured.playerStats.level = 4;
  armoured.equipped = { armor: { type: 'armor', name: 'a', value: 1, gear: 'armor', base: 'leather' } };
  assert.equal(characterSheet(armoured).armorClass.proficient, false);
  Build.takeImprovement(CLASSES.wizard, armoured.build, 4, { feat: 'lightly_armoured', ability: 'strength' });
  assert.equal(characterSheet(armoured).armorClass.proficient, true, 'Lightly Armoured: trained in light armour');
});

test('feats in play: Savage Attacker, Dual Wielder, Heavy Armour Master, Mobile, Observant, Durable', async () => {
  const { CLASSES } = await load('rules/Classes');
  const Build = await load('rules/Build');
  const { characterSheet, heavyArmorReduction } = await load('rules/CharacterSheet');
  const { resolveAttack } = await load('rules/Combat');
  const { takeRest } = await load('game/Rest');
  const hero = heroWith('champion', 12, { fightingStyle: 'defense', locked: true });
  const take = (feat, ability) => assert.ok(Build.takeImprovement(CLASSES.fighter, hero.build, 12, { feat, ...(ability ? { ability } : {}) }), feat);
  take('savage_attacker');
  const rolls = [15, 2, 7];
  const attack = characterSheet(hero).attack;
  const outcome = resolveAttack(attack, 10, () => rolls.shift() ?? 1);
  assert.equal(outcome.damage - attack.damage.bonus, 7, 'the higher of the two damage rolls');
  hero.equipped = { primary: weaponItem('longsword'), secondary: weaponItem('rapier') };
  const acBefore = characterSheet(hero).armorClass.total;
  assert.equal(characterSheet(hero).offHand, null);
  take('dual_wielder');
  assert.equal(characterSheet(hero).offHand.base, 'rapier', 'two weapons that are not light');
  assert.equal(characterSheet(hero).armorClass.total, acBefore + 1, '+1 AC');
  take('heavy_armour_master', 'strength');
  hero.equipped = { armor: { type: 'armor', name: 'p', value: 1, gear: 'armor', base: 'plate' } };
  assert.equal(heavyArmorReduction(characterSheet(hero)), 3);
  const speed = characterSheet(hero).speed;
  take('mobile');
  assert.equal(characterSheet(hero).speed, speed + 10);
  const perception = characterSheet(hero).passivePerception;
  // Four Improvements by level 12: the rest are put straight into the build.
  hero.build.improvements.push({ feat: 'observant', ability: 'wisdom' });
  assert.ok(characterSheet(hero).passivePerception >= perception + 5);
  hero.build.improvements.push({ feat: 'durable' });
  hero.health.current = 1;
  hero.playerStats.hitDice = 0;
  takeRest('short');
  assert.equal(hero.health.current, hero.health.max, 'Durable: a short rest heals all');
});

test('Extra Attack: each blow lands on its own swing\'s impact frame, the blows back to back, and the next click a second later', async () => {
  const { blowTiming } = await load('systems/SwordSystem');
  const { clipImpactTicks } = await load('characters/Characters');
  const { ATTACK_PERIOD } = await load('entities/WeaponStats');
  const hero = heroWith('champion', 5);
  const impact = clipImpactTicks(hero.character.def, 'attack');
  const timing = blowTiming(hero, 2);
  assert.equal(timing.windUp, impact, 'the second blow lands where its swing clip strikes, not half a second later');
  assert.equal(timing.tempo, 1, 'at the hero\'s own pace');
  hero.playerInput.intents.attack = true;
  const landed = [];
  let blow = -1;
  for (let t = 0; t < ATTACK_PERIOD; t++) {
    updateSword();
    hero.playerInput.intents.attack = false;
    const swing = hero.swordSwing;
    if (swing && swing.blow !== blow && swing.delay === 0) {
      blow = swing.blow;
      landed.push(t);
    }
  }
  assert.equal(landed.length, 2);
  assert.equal(landed[1] - landed[0], timing.windUp + timing.live, 'the second follows the first by one blow');
  hero.playerInput.intents.attack = true;
  updateSword();
  assert.ok(hero.swordSwing, 'the next click a second later swings again');
});

test('a long chain that would not fit the second at its pace plays faster, the clip with it', async () => {
  const { blowTiming } = await load('systems/SwordSystem');
  const { ATTACK_PERIOD } = await load('entities/WeaponStats');
  const hero = heroWith('champion', 12);
  hero.actionSurge = 360;
  const timing = blowTiming(hero, 6);
  assert.ok(6 * (timing.windUp + timing.live) < ATTACK_PERIOD, 'six blows fit');
  assert.ok(timing.tempo >= 2, 'at least twice as fast');
});

test('Great Weapon Master: a crit or a kill earns an attack for the next swing; its -5/+10 is switched from the quick bar', async () => {
  const { CLASSES } = await load('rules/Classes');
  const Build = await load('rules/Build');
  const { characterSheet } = await load('rules/CharacterSheet');
  const level = arena(10, 6);
  const hero = heroWith('champion', 4, { fightingStyle: 'defense', locked: true });
  assert.ok(Build.takeImprovement(CLASSES.fighter, hero.build, 4, { feat: 'great_weapon_master' }));
  assert.deepEqual(Build.passiveFeats(CLASSES.fighter, 4, hero.build), ['great_weapon_master']);
  hero.equipped = { primary: weaponItem('greatsword') };
  const plain = characterSheet(hero).attack;
  hero.inSafeRoom = false;
  assert.equal(bindSpell(hero, 0, 'feat:great_weapon_master', 0), true, 'bound anywhere');
  assert.equal(bindSpell(hero, 1, 'feat:sharpshooter', 0), false, 'not a feat they have');
  hero.playerInput.spellSlot = 0;
  hero.castCooldown = 0;
  cast(level, hero, 1);
  assert.deepEqual(hero.featsOn, ['great_weapon_master'], 'its key switches it on');
  const power = characterSheet(hero).attack;
  assert.equal(power.attackBonus, plain.attackBonus - 5);
  assert.equal(power.damage.bonus, plain.damage.bonus + 10);
  hero.equipped = { primary: weaponItem('longsword') };
  assert.equal(characterSheet(hero).attack.featDamage, 0, 'only with a heavy weapon');
  hero.equipped = { primary: weaponItem('greatsword') };
  // A kill earns the attack.
  const dummy = createTrainingDummy(centre(4.7), centre(2));
  hero.position.x = centre(4);
  hero.position.y = centre(2);
  useDieRoller((sides) => (sides === 20 ? 20 : 1));
  hero.playerInput.intents.attack = true;
  for (let t = 0; t < 60; t++) {
    beginPerception();
    updateSword();
    hero.playerInput.intents.attack = false;
  }
  useDieRoller(null);
  world.remove(dummy);
  assert.equal(hero.bonusAttack, true, 'a critical hit earns it');
  hero.playerInput.intents.attack = true;
  updateSword();
  assert.equal(hero.swordSwing.blows, characterSheet(hero).attacks + 1, 'the next swing makes one blow more');
  assert.equal(hero.bonusAttack, false, 'and spends it');
});

test('Defensive Duellist turns aside a blow its proficiency bonus would, with a finesse weapon, then needs 30 seconds', async () => {
  const { CLASSES } = await load('rules/Classes');
  const Build = await load('rules/Build');
  const { duelistTurnsAside } = await load('systems/Reactions');
  const { armorClassOf } = await load('systems/Strike');
  const hero = heroWith('champion', 4, { fightingStyle: 'defense', locked: true });
  hero.equipped = { primary: weaponItem('rapier') };
  const ac = armorClassOf(hero);
  const blow = (total, natural = 10) => ({ hit: true, total, natural, critical: natural === 20 });
  assert.equal(duelistTurnsAside(hero, blow(ac)), false, 'not without the feat');
  assert.ok(Build.takeImprovement(CLASSES.fighter, hero.build, 4, { feat: 'defensive_duelist' }));
  assert.equal(duelistTurnsAside(hero, blow(ac + 2, 20)), false, 'a natural 20 still hits');
  assert.equal(duelistTurnsAside(hero, blow(ac + 2)), false, 'proficiency +2 would not turn a total of AC + 2');
  assert.equal(duelistTurnsAside(hero, blow(ac + 1)), true);
  assert.equal(hero.duelistCooldown, 30 * 60);
  assert.equal(duelistTurnsAside(hero, blow(ac)), false, 'recovering');
  hero.duelistCooldown = 0;
  hero.equipped = { primary: weaponItem('longsword') };
  assert.equal(duelistTurnsAside(hero, blow(ac)), false, 'only with a finesse weapon');
});

test('the DMG tooltip names both weapons: the off hand with its whole blow, or why it makes none', async () => {
  const { characterSheet } = await load('rules/CharacterSheet');
  const { damageTopic } = await load('ui/SheetTopics');
  const hero = heroWith('champion', 1, { fightingStyle: 'defense', locked: true });
  hero.equipped = { primary: weaponItem('longsword'), secondary: weaponItem('dagger') };
  const sheet = characterSheet(hero);
  assert.equal(sheet.offHand, null, 'a longsword is not light');
  assert.equal(sheet.offHandBlocked.base, 'dagger');
  const lines = damageTopic(sheet).more.detail.map((l) => (typeof l === 'string' ? l : l.text));
  assert.ok(lines.includes('Main hand:') && lines.includes('Off hand:'));
  assert.ok(lines.some((l) => l.startsWith('The off hand makes no blow')));
  hero.equipped = { primary: weaponItem('shortsword'), secondary: weaponItem('dagger') };
  const both = damageTopic(characterSheet(hero)).more.detail.map((l) => (typeof l === 'string' ? l : l.text));
  assert.ok(both.includes('Off hand:') && !both.some((l) => l.startsWith('The off hand makes no blow')));
  assert.equal(both.filter((l) => l.startsWith('To hit:')).length, 2, 'each hand with its to-hit');
});

test('what the tables say is what plays: range, loading, reach, both hands, the STR to wear armour, clothes', async () => {
  const { characterSheet, armorClass } = await load('rules/CharacterSheet');
  const { metresToPx } = await load('rules/Scale');
  const { wearRefusal } = PlayerActions;
  const { ARROW_STATS } = await load('entities/WeaponStats');
  const hero = heroWith('champion', 5);
  hero.aimVector = { x: 1, y: 0 };
  // A longbow's shot flies its long range (120 m), past its normal range (30 m) with disadvantage.
  hero.equipped = { primary: weaponItem('longbow') };
  hero.arrowCooldown = 0;
  hero.playerInput.intents.attack = true;
  updateArrows();
  const shots = () => world.entities.filter((e) => e.projectile?.arrow && e.projectile.owner === world.id(hero));
  const arrow = shots()[0];
  assert.equal(arrow.projectile.life, Math.ceil(metresToPx(120) / ARROW_STATS.speed), 'it drops at its long range');
  assert.equal(arrow.projectile.life - arrow.projectile.closeLife, Math.ceil(metresToPx(30) / ARROW_STATS.speed), 'past its normal range it rolls with disadvantage');
  for (let t = 0; t < 120; t++) updateArrows();
  assert.equal(shots().length, 2, 'Extra Attack: two arrows a volley');
  for (const e of shots()) world.remove(e);
  // A crossbow is loading: one bolt an attack, Extra Attack or not.
  hero.equipped = { primary: weaponItem('heavy_crossbow') };
  hero.arrowCooldown = 0;
  hero.playerInput.intents.attack = true;
  for (let t = 0; t < 120; t++) updateArrows();
  assert.equal(shots().length, 1, 'one bolt');
  for (const e of shots()) world.remove(e);
  hero.equipped = {};
  // Reach weapons strike further.
  hero.equipped = { primary: weaponItem('glaive') };
  hero.playerInput.intents.attack = true;
  updateSword();
  const long = hero.swordSwing.range;
  hero.swordSwing = undefined;
  hero.swordCooldown = 0;
  hero.equipped = { primary: weaponItem('greatsword') };
  hero.playerInput.intents.attack = true;
  updateSword();
  assert.ok(long > hero.swordSwing.range, 'a glaive reaches further than a greatsword');
  hero.swordSwing = undefined;
  world.remove(hero);
  // A two-handed weapon leaves no hand for a shield; armour asks its STR of whoever puts it on.
  const shield = SHIELDS[0];
  assert.match(wearRefusal({}, { primary: weaponItem('greatsword'), secondary: shield }, 18), /both hands/);
  assert.equal(wearRefusal({}, { primary: weaponItem('longsword'), secondary: shield }, 18), null);
  const plate = { type: 'armor', name: 'Plate armour', value: 1, gear: 'armor', base: 'plate' };
  assert.match(wearRefusal({}, { armor: plate }, 14), /STR 15/);
  assert.equal(wearRefusal({}, { armor: plate }, 15), null);
  assert.equal(wearRefusal({ armor: plate }, { armor: plate, primary: weaponItem('dagger') }, 9), null, 'worn already: it can be kept on');
  // A robe is clothes: AC 10 + DEX, and anyone may wear it.
  const mods = { strength: 0, dexterity: 3, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 };
  const robe = ARMORS.find((a) => a.base === 'robe');
  assert.equal(armorClass({ armor: robe }, mods).total, 13);
  const wizard = playerAt(2, 2, 'wizard');
  wizard.equipped = { armor: robe };
  assert.ok(characterSheet(wizard).armorClass.proficient, 'no training needed for clothes');
});

test('the inventory\'s search finds the letters typed in order, any case, spaces skipped; the bag sorts and filters without moving a thing', async () => {
  const { fuzzyMatch } = await load('core/fuzzy');
  const { bagView } = await load('game/BagView');
  assert.deepEqual(fuzzyMatch('vybow', 'Heavy crossbow'), [3, 4, 11, 12, 13], 'heaV-Y cross-B-O-W');
  assert.deepEqual(fuzzyMatch('HV CB', 'Heavy crossbow'), [0, 3, 6, 11]);
  assert.equal(fuzzyMatch('bowv', 'Heavy crossbow'), null, 'the letters in their order');
  assert.deepEqual(fuzzyMatch('', 'Dagger'), []);
  const item = (name, type, value, weight) => ({ name, type, value, weight, gear: type === 'weapon' ? 'weapon' : 'armor', stats: {} });
  const bag = [item('Plate armour', 'armor', 1500, 32), null, item('Dagger', 'weapon', 2, 0.5), item('Heavy crossbow', 'weapon', 50, 5), null, item('Longsword', 'weapon', 15, 1.5)];
  const query = (over) => ({ types: null, search: '', sort: 'none', trained: (i) => i.name !== 'Heavy crossbow', ...over });
  assert.deepEqual(bagView(bag, 6, query({}), []), [0, 1, 2, 3, 4, 5], 'as it lies, free squares and all');
  assert.deepEqual(bagView(bag, 6, query({ search: 'vybow' }), []), [3, 1, 4], 'searched: what matches, then the free squares');
  assert.deepEqual(bagView(bag, 6, query({ types: ['weapon'], sort: 'price' }), []), [3, 5, 2, 1, 4], 'weapons, dearest first');
  assert.deepEqual(bagView(bag, 6, query({ sort: 'weight' }), []), [0, 3, 5, 2, 1, 4], 'heaviest first');
  assert.deepEqual(bagView(bag, 6, query({ sort: 'training' }), []), [0, 2, 5, 3, 1, 4], 'trained first, ties as they lie');
  assert.equal(bag[0].name, 'Plate armour', 'the bag itself is left as it is');
});

test('the quick bar\'s bindings and the switched features and feats come down to the next level', () => {
  startRun();
  const hero = playerAt(2, 2, 'fighter');
  hero.spellbook.bound = ['feature:second_wind', null, 'feature:action_surge'];
  hero.featuresOff = ['fighting_style'];
  hero.featsOn = ['great_weapon_master'];
  descend();
  world.clear();
  const below = playerAt(2, 2, 'fighter');
  restorePlayer(below);
  assert.deepEqual(below.spellbook.bound, ['feature:second_wind', null, 'feature:action_surge']);
  assert.deepEqual(below.featuresOff, ['fighting_style']);
  assert.deepEqual(below.featsOn, ['great_weapon_master']);
  hero.spellbook.bound[0] = null;
  assert.equal(below.spellbook.bound[0], 'feature:second_wind', 'a copy, not the old hero\'s list');
  startRun();
});

test('two items of a kind compared: more AC or damage is better, less weight is; different kinds are not weighed', async () => {
  const { compareItems } = await load('game/ItemCompare');
  const { itemTrained, heroClass } = await load('rules/Classes');
  const armor = (base) => ARMORS.find((a) => a.base === base);
  const weapon = (base) => WEAPONS.find((w) => w.base === base);
  assert.deepEqual(compareItems(armor('plate'), armor('leather')), { ac: 1, weight: -1 }, 'plate: AC 18 over 11, but far heavier');
  assert.deepEqual(compareItems(armor('leather'), armor('plate')), { ac: -1, weight: 1 });
  assert.equal(compareItems(weapon('greataxe'), weapon('dagger')).damage, 1, 'd12 over d4');
  assert.equal(compareItems({ ...weapon('dagger'), bonus: 3 }, weapon('dagger')).damage, 1, 'magic counts');
  assert.equal(compareItems(weapon('dagger'), weapon('dagger')).damage, 0);
  assert.deepEqual(compareItems(weapon('dagger'), armor('plate')), {}, 'a sword and a suit are not compared');
  // Training: a wizard is trained in daggers and robes, not in plate or greataxes; a fighter in all of them.
  const wizard = heroClass('wizard');
  assert.ok(itemTrained(wizard, weapon('dagger')));
  assert.ok(itemTrained(wizard, armor('robe')));
  assert.ok(!itemTrained(wizard, armor('plate')));
  assert.ok(!itemTrained(wizard, weapon('greataxe')));
  assert.ok(itemTrained(wizard, armor('plate'), ['heavy']), 'a feat\'s armour training counts');
  assert.ok(itemTrained(heroClass('fighter'), armor('plate')));
  assert.ok(itemTrained(wizard, { type: 'medal', name: 'Medal', value: 1 }), 'a medal needs no training');
});

test('only heroes and foes clear the walls over them: a pot or a chest by a south wall leaves it be', async () => {
  const { clearsWalls } = await load('systems/SeeThroughSystem');
  const sprite = { visible: true };
  const hero = { position: { x: 0, y: 0 }, sprite, health: { current: 5, max: 5 }, playerStats: {} };
  const goblin = { position: { x: 0, y: 0 }, sprite, health: { current: 5, max: 5 }, mobType: 'goblin' };
  const urn = { position: { x: 0, y: 0 }, sprite, health: { current: 1, max: 1 } };
  assert.ok(clearsWalls(hero));
  assert.ok(clearsWalls(goblin));
  assert.ok(!clearsWalls(urn), 'a breakable thing has hit points but clears nothing');
  assert.ok(!clearsWalls({ ...goblin, falling: { ticks: 1 } }), 'nor one falling into a pit');
});

// ── The Wizard: bind limits, Arcane Recovery, the schools ────────────────────

const Schools = await load('rules/Schools');
const SchoolSystem = await load('systems/SchoolSystem');
const SummonSystem = await load('systems/SummonSystem');
const WizardBuild = await load('rules/Build');
const { CLASSES: WizardClasses } = await load('rules/Classes');
const { unbindSpell } = await load('game/PlayerActions');
const { updateManeuvers } = await load('systems/ManeuverSystem');
const { hitMob } = await load('systems/Hits');
const { resolveAttack } = await load('rules/Combat');

/** A wizard of this level who studies `school`, standing in a safe room (spells are bound only there). */
function wizardOf(school, level, tx = 2, ty = 2) {
  const wizard = casterAt(tx, ty, 'wizard', 0);
  wizard.playerStats.level = level;
  wizard.build = { ...(wizard.build ?? WizardBuild.newBuild(WizardClasses.wizard)), archetype: school };
  return wizard;
}

test('a wizard keeps only as many cantrips and spells of each level on the quick bar as the table of their level allows', () => {
  assert.deepEqual([0, 1, 2].map((l) => Schools.bindLimit(1, l)), [3, 2, 0], 'level 1: 3 cantrips, 2 first-level spells');
  assert.deepEqual([0, 1, 2, 3].map((l) => Schools.bindLimit(5, l)), [4, 4, 3, 2]);
  assert.deepEqual([0, 5, 6].map((l) => Schools.bindLimit(12, l)), [5, 2, 1]);
  arena(12, 6);
  const wizard = casterAt(2, 2, 'wizard', 0);
  assert.equal(Spellbook.boundAtLevel(wizard, 0), 0, 'nothing bound to begin with');
  for (const [slot, spell] of [[0, 'fire_bolt'], [1, 'ray_of_frost']]) assert.equal(bindSpell(wizard, slot, spell, 0), true);
  for (const [slot, spell] of [[2, 'magic_missile'], [3, 'burning_hands']]) assert.equal(bindSpell(wizard, slot, spell, 1), true);
  assert.equal(Spellbook.boundAtLevel(wizard, 0), 2, 'cantrips bound count');
  assert.equal(Spellbook.boundAtLevel(wizard, 1), 2, 'and spells');
  assert.equal(bindSpell(wizard, 5, 'ice_knife', 1), false, 'no room for a third first-level spell');
  assert.equal(bindSpell(wizard, 2, 'ice_knife', 1), true, 'but it may take the place of one');
  assert.equal(bindSpell(wizard, 6, 'chill_touch', 0), true, 'a third cantrip');
  assert.equal(bindSpell(wizard, 7, 'acid_splash', 0), false, 'not a fourth');
  assert.equal(bindSpell(wizard, 11, 'feature:arcane_recovery', 0), true, 'class features are not counted');
  assert.equal(unbindSpell(wizard, 6), true);
  assert.equal(Spellbook.quickBinding(wizard, 6), null, 'an emptied square holds nothing');
  assert.equal(unbindSpell(wizard, 0), true);
  assert.equal(Spellbook.quickBinding(wizard, 0), null, 'emptied');
  assert.equal(Spellbook.boundAtLevel(wizard, 0), 1);
  assert.equal(bindSpell(wizard, 7, 'acid_splash', 0), true, 'room again');
  const cleric = casterAt(2, 4, 'cleric', 0);
  for (let slot = 3; slot < 9; slot++) assert.equal(bindSpell(cleric, slot, 'cure_wounds', 1), true, 'other classes are not counted');
  assert.ok(validCommand({ kind: 'unbind_spell', slot: 4 }));
  assert.ok(!validCommand({ kind: 'unbind_spell', slot: 20 }));
  world.addComponent(wizard, 'playerSlot', 'host');
  assert.doesNotThrow(() => validateNetState(JSON.parse(JSON.stringify(captureWorld(false, 7)))), 'an emptied square travels to guests');
});

test('a wizard sees every wizard spell, and an extra cantrip and Arcane Recovery\'s charges are told in the level panel', () => {
  const listed = Spellbook.listedSpells('wizard', 1);
  assert.ok(listed[6].some((s) => s.id === 'chain_lightning'), 'a 6th-level spell is listed at level 1');
  assert.equal(Spellbook.learnLevel('wizard', Spellbook.CATALOG.chain_lightning), 11, 'greyed out until level 11');
  assert.ok(!Spellbook.listedSpells('cleric', 1)[6].length, 'a cleric sees only what they have learnt');
  const logged = (level) => Features.featuresAt('wizard', level, null).filter((f) => f.level === level && f.logOnly).map((f) => f.name);
  assert.deepEqual(logged(3), ['Arcane Recovery cooldown shortened by 6 seconds']);
  assert.deepEqual(logged(4), ['Additional Cantrip able to be bound']);
  assert.deepEqual(logged(10), ['Additional Cantrip able to be bound']);
  assert.deepEqual(logged(2), []);
});

test('Arcane Recovery readies the spells of 5th level and below, and recovers 6 seconds sooner for every charge', () => {
  const recovery = Features.featureOfClass('wizard', 'arcane_recovery');
  assert.deepEqual([1, 2, 3, 5, 9, 11, 12].map((l) => Features.featureCooldown(recovery, l)), [60, 60, 54, 48, 36, 30, 30]);
  assert.deepEqual([1, 3, 11].map(Schools.arcaneRecoveryCharges), [1, 2, 6]);
  const level = arena(12, 6);
  const wizard = wizardOf('evocation', 11);
  assert.equal(bindSpell(wizard, 4, 'fireball', 3), true);
  assert.equal(bindSpell(wizard, 5, 'chain_lightning', 6), true);
  wizard.spellbook.recovery[4] = 300;
  wizard.spellbook.recovery[5] = 300;
  wizard.spellbook.recovery[12] = 300;
  assert.equal(usedFeature(wizard, 'arcane_recovery', 10, level), 'ok');
  assert.equal(wizard.spellbook.recovery[4], 0, 'a 3rd-level spell is ready');
  assert.equal(wizard.spellbook.recovery[5], 300, 'a 6th-level one is not');
});

test('a wizard chooses a school at level 2: one of the nine, and only a wizard', () => {
  const cls = WizardClasses.wizard;
  const build = WizardBuild.newBuild(cls);
  build.locked = true;
  assert.equal(WizardBuild.levelHasChoice(cls, 2, build), true, 'the school is chosen at level 2');
  assert.equal(WizardBuild.takeArchetype(cls, build, 2, 'champion'), false, 'a Fighter\'s archetype is not on offer');
  assert.equal(WizardBuild.takeArchetype(cls, build, 2, 'necromancy'), true);
  assert.equal(WizardBuild.levelHasChoice(cls, 2, build), false);
  assert.equal(WizardBuild.takeArchetype(WizardClasses.fighter, WizardBuild.newBuild(WizardClasses.fighter), 3, 'evocation'), false);
  const at = (school, lvl) => Features.featuresAt('wizard', lvl, { archetype: school }).map((f) => f.id);
  assert.ok(at('evocation', 2).includes('sculpt_spells') && !at('evocation', 2).includes('arcane_ward'));
  assert.ok(!at('evocation', 2).includes('arcane_tradition'), 'the entry that asks for a school goes once one is chosen');
  arena(12, 6);
  const illusionist = wizardOf('illusion', 2);
  assert.deepEqual(Spellbook.quickBinding(illusionist, 11), { spell: 'feature:improved_minor_illusion', level: 0 }, 'the school\'s actives fill the second row');
});

test('Evocation adds Intelligence to its spells\' damage, and Potent Cantrip keeps half of a saved cantrip', () => {
  arena(12, 6);
  const evoker = wizardOf('evocation', 10);
  const int = sheetOf(evoker).modifiers.intelligence;
  assert.ok(int > 0);
  assert.equal(SchoolSystem.spellDamageBonus(evoker, 'fire_bolt'), int, 'Empowered Evocation');
  assert.equal(SchoolSystem.spellDamageBonus(evoker, 'chill_touch'), 0, 'a Necromancy cantrip gets nothing');
  assert.equal(SchoolSystem.spellDamageBonus(wizardOf('evocation', 9, 2, 4), 'fire_bolt'), 0, 'not before level 10');
  assert.equal(SchoolSystem.savedDamage(evoker, 0, 10), 5, 'Potent Cantrip: half');
  assert.equal(SchoolSystem.savedDamage(wizardOf('abjuration', 10, 4, 4), 0, 10), 0, 'a saved cantrip does nothing without it');
  assert.equal(SchoolSystem.savedDamage(wizardOf('abjuration', 10, 6, 4), 1, 10), 5, 'a spell of 1st level or higher still does half');
});

test('an Arcane Ward blocks as much as its strength, weakening by 1, and with Projected Ward shields an ally near', () => {
  const level = arena(12, 6);
  const abjurer = wizardOf('abjuration', 6);
  const goblin = mobAt(level, 'goblin', 8, 2);
  SchoolSystem.updateSchools();
  assert.equal(abjurer.arcana.ward, 6, 'it starts at the wizard\'s level');
  const before = abjurer.health.current;
  hurtPlayer(abjurer, goblin, 10);
  assert.equal(abjurer.health.current, before - 4, 'the ward blocked 6');
  assert.equal(abjurer.arcana.ward, 5);
  const ally = playerAt(3, 2, 'fighter');
  const allyBefore = ally.health.current;
  hurtPlayer(ally, goblin, 3);
  assert.equal(ally.health.current, allyBefore, 'Projected Ward: the ally took nothing');
  assert.equal(abjurer.arcana.ward, 4);
  SchoolSystem.restSchool(abjurer, true);
  assert.equal(abjurer.arcana.ward, 6, 'a long rest sets it to the wizard\'s level');
});

test('a diviner\'s Portent die turns a foe\'s blow into a miss, and is foreseen again in time', () => {
  const level = arena(12, 6);
  const diviner = wizardOf('divination', 2);
  const fighter = playerAt(3, 2, 'fighter');
  mobAt(level, 'goblin', 4, 2);
  SchoolSystem.updateSchools();
  diviner.arcana.portent = [3, 18];
  const attack = { attackBonus: 4, damage: { count: 1, sides: 6, bonus: 2 }, mode: 'normal' };
  const hit = resolveAttack(attack, 10);
  assert.ok(hit.hit);
  const turned = SchoolSystem.turnBlow(fighter, attack, hit);
  assert.equal(turned.hit, false, 'a 3 + 4 misses');
  assert.deepEqual(diviner.arcana.portent, [18], 'the low die is spent');
  for (let t = 0; t < 3600 && diviner.arcana.portent.length < 2; t++) SchoolSystem.updateSchools();
  assert.equal(diviner.arcana.portent.length, 2, 'foreseen again within a minute');
});

test('Hypnotic Gaze roots a foe that fails its save until it is hurt; Illusory Self turns one blow every 30 seconds', () => {
  const level = arena(12, 6);
  const enchanter = wizardOf('enchantment', 2);
  const goblin = mobAt(level, 'goblin', 3, 2);
  beginPerception();
  useDieRoller(() => 1);
  assert.equal(usedFeature(enchanter, 'hypnotic_gaze', 11, level), 'ok');
  useDieRoller(SURE_HIT);
  assert.ok(goblin.status.charmed > 0, 'charmed');
  updateManeuvers();
  assert.ok(goblin.freezeTime > 0, 'it stands still');
  hitMob(goblin, enchanter, 1, true);
  assert.equal(goblin.status.charmed, 0, 'a blow breaks it');
  assert.equal(usedFeature(wizardOf('enchantment', 2, 9, 4), 'hypnotic_gaze', 11, level), 'no_foe', 'nobody near');

  const illusionist = wizardOf('illusion', 10, 8, 2);
  SchoolSystem.updateSchools();
  const attack = { attackBonus: 4, damage: { count: 1, sides: 6, bonus: 2 }, mode: 'normal' };
  assert.equal(SchoolSystem.turnBlow(illusionist, attack, resolveAttack(attack, 10)).hit, false, 'the double takes it');
  assert.equal(SchoolSystem.turnBlow(illusionist, attack, resolveAttack(attack, 10)).hit, true, 'then it recovers');
});

test('a Bladesinger is trained in light blades, and Bladesong adds the proficiency bonus to AC unless impeded', () => {
  const level = arena(12, 6);
  const singer = wizardOf('bladesinging', 6);
  singer.equipped = { primary: { ...WEAPONS.find((w) => w.base === 'rapier') } };
  const before = sheetOf(singer);
  assert.ok(before.attack.proficient, 'trained in the rapier');
  assert.equal(before.attacks, 2, 'Extra Attack at level 6');
  assert.equal(usedFeature(singer, 'bladesong', 11, level), 'ok');
  const song = sheetOf(singer);
  assert.equal(song.armorClass.total, before.armorClass.total + song.proficiency);
  assert.equal(song.speed, before.speed + 10);
  assert.equal(song.saves.constitution.bonus, before.saves.constitution.bonus + song.proficiency);
  singer.equipped = { primary: { ...WEAPONS.find((w) => w.base === 'quarterstaff') } };
  assert.equal(sheetOf(singer).armorClass.school, 0, 'a quarterstaff impedes it');
});

test('Animate Dead raises undead that fight for the necromancer, one for every three wizard levels; the oldest crumble', () => {
  const level = arena(12, 6);
  const necromancer = wizardOf('necromancy', 6);
  const goblin = mobAt(level, 'goblin', 4, 2);
  assert.equal(SummonSystem.undeadCap(necromancer), 2, 'two at level 6');
  assert.equal(usedFeature(necromancer, 'animate_dead_zombie', 11, level), 'ok');
  const raised = [...world.with('summon')];
  assert.equal(raised.length, 2, 'Undead Thralls raises two');
  assert.equal(raised[0].health.max, 22 + 6, 'Better Summons: the wizard level in hit points');
  assert.equal(raised[0].summon.damage.bonus, 1 + 3, 'and the proficiency bonus on their damage');
  assert.equal(usedFeature(necromancer, 'animate_dead_skeleton', 12, level), 'ok');
  assert.ok(raised.every((u) => u.removed), 'both zombies crumble: two skeletons take their places');
  necromancer.playerStats.level = 12;
  assert.equal(SummonSystem.undeadCap(necromancer), 4, 'four at level 12');
  assert.equal(usedFeature(necromancer, 'animate_dead_zombie', 13, level), 'ok');
  assert.equal(SummonSystem.undeadOf(necromancer), 4, 'the skeletons stay beside two new zombies');
  necromancer.playerStats.level = 6;
  const goblinBefore = goblin.health.current;
  for (let t = 0; t < 240 && goblin.health.current === goblinBefore; t++) {
    beginPerception();
    SummonSystem.updateSummons(level);
    updateMovement(level);
  }
  assert.ok(goblin.health.current < goblinBefore, 'a skeleton struck the goblin');
  SchoolSystem.updateSchools();
  necromancer.health.current = 1;
  goblin.health.current = 0;
  SchoolSystem.grimHarvest(necromancer, goblin, 'fireball', 3, true);
  assert.equal(necromancer.health.current, 1 + 6, 'Grim Harvest: twice the spell\'s level');
  world.addComponent(necromancer, 'playerSlot', 'host');
  assert.doesNotThrow(() => validateNetState(JSON.parse(JSON.stringify(captureWorld(false, 7)))), 'undead and the school state travel to guests');
});

test('a Transmuter\'s Stone makes its carrier faster or trained in Constitution saves; Benign Transposition teleports', () => {
  const level = arena(14, 6);
  const transmuter = wizardOf('transmutation', 6);
  const base = sheetOf(transmuter);
  assert.equal(usedFeature(transmuter, 'transmuters_stone_speed', 11, level), 'ok');
  assert.equal(sheetOf(transmuter).speed, base.speed + 10);
  assert.equal(usedFeature(transmuter, 'transmuters_stone_constitution', 12, level), 'ok');
  assert.equal(sheetOf(transmuter).speed, base.speed, 'the new stone takes the old one\'s place');
  assert.ok(sheetOf(transmuter).saves.constitution.proficient);
  const conjurer = wizardOf('conjuration', 6, 2, 3);
  const from = conjurer.position.x;
  assert.equal(usedFeature(conjurer, 'benign_transposition', 11, level, { x: from + 200, y: conjurer.position.y }), 'ok');
  assert.ok(conjurer.position.x > from + 150 && conjurer.position.x <= from + 288, 'it stepped through the air toward the aim');
});

// ── Lasting spells, resistances, and the schools' later features ─────────────

const LastingSpells = await load('systems/LastingSpells');

const Resistances = await load('rules/Resistances');

/** Lasting spells run for `ticks` (the spatial index rebuilt each tick, as the game does). */
function lastFor(ticks) {
  for (let t = 0; t < ticks; t++) {
    beginPerception();
    LastingSpells.updateLastingSpells();
  }
}

test('Blade Ward halves weapons\' damage while it lasts, and the Armor Class tooltip lists what the hero resists', async () => {
  const level = arena(12, 6);
  const wizard = casterAt(2, 2, 'wizard', 0);
  wizard.health.max = wizard.health.current = 100;
  assert.equal(bindSpell(wizard, 0, 'blade_ward', 0), true);
  cast(level, wizard);
  assert.ok(wizard.buffs.bladeWard > 0, 'Blade Ward is on');
  const goblin = mobAt(level, 'goblin', 6, 2);
  hurtPlayer(wizard, goblin, 10, 'slashing');
  assert.equal(wizard.health.current, 95, 'half of 10 slashing');
  hurtPlayer(wizard, goblin, 10, 'fire');
  assert.equal(wizard.health.current, 85, 'fire is not resisted');
  assert.deepEqual(sheetOf(wizard).defences, { resist: ['bludgeoning', 'piercing', 'slashing'], immune: [] });
  const { armorClassTopic } = await load('ui/SheetTopics');
  const lines = armorClassTopic(sheetOf(wizard)).detail.map(String);
  assert.ok(lines.some((line) => line.startsWith('Resistant') && line.includes('slashing')), 'the tooltip lists the resistances');
  assert.ok(lines.some((line) => line.startsWith('Immune') && line.endsWith('none')), 'and that there is no immunity');
  lastFor(12 * 60);
  assert.equal(sheetOf(wizard).defences.resist.length, 0, 'it wears off after 12 seconds');
});

test('Mage Armour makes a hero in no armour AC 13 + DEX until a long rest; Shield adds 5 for 6 seconds', () => {
  const level = arena(12, 6);
  // Squares 2 and 3 hold the wizard's own first-level spells: the new ones take their places (two of that level at level 1).
  const wizard = casterAt(2, 2, 'wizard', 2);
  wizard.equipped = {};
  const bare = sheetOf(wizard).armorClass.total;
  assert.equal(bindSpell(wizard, 2, 'mage_armor', 1), true);
  cast(level, wizard);
  assert.equal(sheetOf(wizard).armorClass.total, bare + 3);
  assert.equal(bindSpell(wizard, 3, 'shield', 1), true);
  wizard.playerInput.spellSlot = 3;
  cast(level, wizard);
  assert.equal(sheetOf(wizard).armorClass.total, bare + 8);
  assert.equal(sheetOf(wizard).armorClass.spell, 8, 'told apart in the breakdown');
  lastFor(6 * 60);
  assert.equal(sheetOf(wizard).armorClass.total, bare + 3, 'Shield is gone, Mage Armour stays');
  LastingSpells.endUntilRest(wizard);
  assert.equal(sheetOf(wizard).armorClass.total, bare, 'a long rest (or a fall) ends Mage Armour');
});

test('a zone strikes the foes in it every round while its caster keeps concentration; Focused Conjuration keeps it whatever the damage', () => {
  const level = arena(14, 6);
  const wizard = wizardOf('conjuration', 10);
  wizard.health.max = wizard.health.current = 200;
  const goblin = mobAt(level, 'goblin', 5, 2);
  goblin.health.max = goblin.health.current = 500;
  wizard.aimWorld.x = goblin.position.x;
  wizard.aimWorld.y = goblin.position.y;
  assert.equal(bindSpell(wizard, 0, 'cloud_of_daggers', 2), true);
  cast(level, wizard);
  const [zone] = world.with('zone');
  assert.ok(zone, 'the daggers stay where they were cast');
  assert.equal(wizard.concentration.spell, 'cloud_of_daggers');
  lastFor(1);
  const first = goblin.health.current;
  assert.ok(first < 500, 'they strike at once');
  lastFor(360);
  assert.ok(goblin.health.current < first, 'and again a round later');
  useDieRoller(() => 1);
  hurtPlayer(wizard, goblin, 40, 'slashing');
  assert.equal(wizard.concentration?.spell, 'cloud_of_daggers', 'Focused Conjuration: no save, damage does not break it');
  wizard.featuresOff = ['focused_conjuration'];
  hurtPlayer(wizard, goblin, 40, 'slashing');
  assert.equal(wizard.concentration, undefined, 'without it a failed Constitution save does');
  assert.ok(zone.removed, 'and the daggers go');
});

test('Create Water leaves a puddle for good; thunder charges it, and then it shocks whoever stands in it every round', () => {
  const level = arena(14, 6);
  const conjurer = wizardOf('conjuration', 6);
  const at = { x: conjurer.position.x + 48, y: conjurer.position.y };
  assert.equal(usedFeature(conjurer, 'minor_conjuration', 11, level, at), 'ok');
  const [puddle] = world.with('surface');
  assert.equal(puddle.surface.kind, 'water');
  const goblin = mobAt(level, 'goblin', 5, 2);
  goblin.position.x = puddle.position.x;
  goblin.position.y = puddle.position.y;
  goblin.health.max = goblin.health.current = 500;
  lastFor(400);
  assert.equal(goblin.health.current, 500, 'still water hurts nobody');
  assert.equal(bindSpell(conjurer, 2, 'thunderwave', 1), true, 'in place of Magic Missile');
  conjurer.playerInput.spellSlot = 2;
  cast(level, conjurer);
  assert.equal(puddle.surface.kind, 'shock', 'thunder charged it');
  const charged = goblin.health.current;
  lastFor(1);
  assert.equal(goblin.health.current, charged - 4, '1d4 lightning (the loaded die: 4)');
  lastFor(360);
  assert.equal(goblin.health.current, charged - 8, 'once a round');
  assert.equal(conjurer.health.current, conjurer.health.max, 'the conjurer outside the puddle is not hurt');
  world.addComponent(conjurer, 'playerSlot', 'host');
  assert.doesNotThrow(() => validateNetState(JSON.parse(JSON.stringify(captureWorld(false, 7)))), 'puddles travel to guests');
});

test('Bladesong spends a charge and gathers Bladesong Charges for its Climax, which strikes and heals and ends the song', () => {
  const level = arena(14, 6);
  const singer = wizardOf('bladesinging', 3);
  singer.health.max = 40;
  singer.equipped = { primary: { ...WEAPONS.find((w) => w.base === 'rapier') } };
  assert.equal(SchoolSystem.featureCharges(singer, 'bladesong'), 2, '2 charges at level 3');
  assert.equal(usedFeature(singer, 'bladesong_climax', 12, level), 'not_singing');
  assert.equal(usedFeature(singer, 'bladesong', 11, level), 'ok');
  assert.equal(SchoolSystem.featureCharges(singer, 'bladesong'), 1, 'a charge spent');
  for (let i = 0; i < 5; i++) SchoolSystem.bladeAttack(singer);
  SchoolSystem.bladeAttack(singer);
  for (let i = 0; i < 2; i++) SchoolSystem.spellCast(singer, 'magic_missile', 1);
  SchoolSystem.spellCast(singer, 'fire_bolt', 0);
  assert.deepEqual([singer.arcana.damageCharges, singer.arcana.healingCharges], [2, 3],
    'spells of 1st level and up give damage, weapon attacks healing (a cantrip none), up to the hero\'s level of each');
  const dummy = createTrainingDummy(centre(4), centre(2));
  const full = dummy.health.current;
  singer.health.current = 1;
  assert.equal(usedFeature(singer, 'bladesong_climax', 12, level, dummy.position), 'ok');
  assert.ok(dummy.health.current < full, 'the training dummy takes the force damage');
  const goblin = mobAt(level, 'goblin', 4, 4);
  goblin.health.max = goblin.health.current = 100;
  assert.equal(singer.health.current, 1 + 24, '1d6 and 3d6 more for the Healing Charges (the loaded dice: 24)');
  assert.equal(singer.arcana.songTicks, 0, 'the song ends');
  assert.deepEqual([singer.arcana.damageCharges, singer.arcana.healingCharges], [0, 0]);
  assert.equal(usedFeature(singer, 'bladesong', 11, level), 'ok', 'the last charge');
  beginPerception();
  assert.equal(usedFeature(singer, 'bladesong_climax', 12, level, goblin.position), 'ok', 'with no charges gathered it still rolls its own die');
  assert.equal(goblin.health.current, 100 - 3, '1d6 force (the loaded die: 6), halved by a saved Intelligence throw');
  for (let t = 0; t < 3600; t++) SchoolSystem.updateSchools();
  SchoolSystem.restSchool(singer, false);
  assert.equal(SchoolSystem.featureCharges(singer, 'bladesong'), 0, 'neither time nor a short rest brings a charge back');
  assert.equal(usedFeature(singer, 'bladesong', 11, level), 'no_charges');
  SchoolSystem.restSchool(singer, true);
  assert.equal(SchoolSystem.featureCharges(singer, 'bladesong'), 2, 'a long rest brings them all back');
});

test('the point buy can be changed until it is saved, even past level 1, and the sheet and hit points follow it', async () => {
  const { applyCustomization } = await load('game/Customize');
  const hero = playerAt(2, 2, 'wizard');
  hero.playerStats.level = 3;
  hero.build = WizardBuild.newBuild(WizardClasses.wizard);
  const scores = { ...hero.build.scores };
  const before = sheetOf(hero);
  const hp = hero.health.max;
  // CON 14 to 15 costs the 2 points WIS 12 to 10 frees (27 in all); with the human's +1, CON 15 becomes 16.
  const bought = { ...scores, constitution: scores.constitution + 1, wisdom: scores.wisdom - 2 };
  assert.equal(applyCustomization(hero, { kind: 'scores', scores: bought }), true);
  assert.equal(sheetOf(hero).scores.constitution, before.scores.constitution + 1, 'the inventory\'s sheet follows');
  assert.equal(hero.health.max, hp + 3, '+1 Constitution modifier: a hit point for each of the 3 levels');
  assert.equal(applyCustomization(hero, { kind: 'lock_build' }), true);
  assert.equal(hero.build.scores.constitution, scores.constitution + 1, 'the saved scores are the bought ones');
  assert.equal(applyCustomization(hero, { kind: 'scores', scores }), false, 'and final once saved');
});

test('the Third Eye and See Invisibility last until a long rest; Inured to Undeath halves necrotic damage; no Savants, no Transmutation on offer', async () => {
  const level = arena(12, 6);
  const diviner = wizardOf('divination', 10);
  assert.equal(usedFeature(diviner, 'third_eye_darkvision', 11, level), 'ok');
  assert.ok(diviner.arcana.darkvision);
  LastingSpells.endUntilRest(diviner);
  assert.equal(diviner.arcana.darkvision, false, 'closed by a long rest, a fall or death');
  const illusionist = wizardOf('illusion', 6);
  assert.equal(usedFeature(illusionist, 'see_invisibility', 11, level), 'ok');
  assert.ok(illusionist.arcana.seeInvisible);
  const necromancer = wizardOf('necromancy', 10);
  assert.equal(Resistances.damageTaken(necromancer, 10, 'necrotic'), 5);
  assert.equal(Resistances.damageTaken(wizardOf('necromancy', 9), 10, 'necrotic'), 10, 'from level 10');
  const { playableArchetypes } = await load('rules/Archetypes');
  assert.ok(!playableArchetypes('wizard').includes('transmutation'));
  assert.equal(playableArchetypes('wizard').length, 8);
  const Features = await load('rules/ClassFeatures');
  assert.ok(!Features.CLASS_FEATURE_LIST.wizard.some((f) => f.id.endsWith('_savant')), 'the Savants are gone');
});

test('every blow of a swing during the Bladesong (Extra Attack\'s too) gathers a Healing Charge, and the Climax shows its damage over the dummy', () => {
  const level = arena(14, 6);
  const singer = wizardOf('bladesinging', 6);
  singer.equipped = { primary: { ...WEAPONS.find((w) => w.base === 'rapier') } };
  assert.equal(sheetOf(singer).attacks, 2, 'Extra Attack at level 6');
  assert.equal(usedFeature(singer, 'bladesong', 11, level), 'ok');
  singer.playerInput.intents.attack = true;
  for (let t = 0; t < 50; t++) {
    beginPerception();
    updateSword();
    singer.playerInput.intents.attack = false;
  }
  assert.equal(singer.arcana.healingCharges, 2, 'one swing, two blows, two charges');
  const dummy = createTrainingDummy(centre(4), centre(2));
  beginPerception();
  assert.equal(usedFeature(singer, 'bladesong_climax', 12, level, dummy.position), 'ok');
  const lines = rollLines(dummy);
  assert.ok(lines.some((line) => line.startsWith('save')), 'the save over the dummy');
  assert.ok(lines.some((line) => line.endsWith('dmg')), 'and the damage under it');
});

test('a level box of a spell tells only what that level changes: dice, darts and cooldown', async () => {
  const { castLevelTopic } = await load('ui/SpellTopics');
  const missile = castLevelTopic(Spellbook.CATALOG.magic_missile, 3, 5);
  const lines = missile.detail.map(String);
  assert.ok(lines.some((line) => line.startsWith('Darts: 3 -> 5')), 'two darts more');
  assert.ok(lines.some((line) => line.startsWith('Cooldown')), 'and a longer cooldown');
  assert.ok(!lines.some((line) => line.startsWith('Range')), 'the range does not change, so it is not told');
  assert.equal(castLevelTopic(Spellbook.CATALOG.fireball, 3, 5).detail, undefined, 'its own level: nothing changes');
  assert.ok(castLevelTopic(Spellbook.CATALOG.fireball, 4, 7).detail.map(String).some((line) => line.startsWith('Damage: 8d6 -> 9d6')));
});

test('ground spills over its neighbour along a ragged line that wanders across the tile and runs on from tile to tile', async () => {
  const { blendCovers, BLEND_PERIOD } = await load('level/GroundBlend');
  // How deep the spill from the north reaches in each column, over a whole period of tiles side by side.
  const reach = [];
  for (let v = 0; v < BLEND_PERIOD; v++) {
    for (let x = 0; x < TILE_WIDTH; x++) {
      let y = 0;
      while (y < TILE_HEIGHT && blendCovers('n', v, x, y)) y++;
      reach.push(y);
    }
  }
  assert.ok(Math.min(...reach) >= 2 && Math.max(...reach) <= TILE_HEIGHT, 'it always spills a little, never past the tile');
  assert.ok(Math.max(...reach) - Math.min(...reach) >= 10, 'reaching far into the tile here, only a little there');
  assert.ok(reach.some((r) => r >= 20), 'well into the other ground somewhere');
  // From one tile's edge to the next (and round the period) the line runs on without a jump.
  for (let v = 0; v < BLEND_PERIOD; v++) {
    const last = reach[v * TILE_WIDTH + TILE_WIDTH - 1];
    const next = reach[((v + 1) % BLEND_PERIOD) * TILE_WIDTH];
    assert.ok(Math.abs(last - next) <= 8, `tile ${v} meets the next: ${last} vs ${next}`);
  }
});

test('the floor something stands on keeps the wall south of it drawn as any other: raised, its dark over the floor under it', async () => {
  const { buildTerrainPieces } = await load('level/TerrainAutotile');
  const level = arena(10, 8);
  // A room's south wall, two rows thick down to the arena's own: its top row has the room's floor north of it.
  for (let x = 1; x < 9; x++) for (const y of [5, 6]) level.setTile(x, y, createTile(TileType.Wall));
  level.setTile(4, 4, createTile(TileType.Obstacle));
  const pieces = buildTerrainPieces(level);
  // The dark laid over the floor run on under a south wall, sorted among the entities: there under the pot as elsewhere.
  const darkOver = (tx) => pieces.some((p) => p.z !== undefined && !p.floor && p.dx >= tx * TILE_WIDTH && p.dx < (tx + 1) * TILE_WIDTH
    && p.dy >= 4 * TILE_HEIGHT && p.dy < 6 * TILE_HEIGHT && p.sx === 96 && p.sy === 80);
  assert.ok(darkOver(3), 'beside the pot');
  assert.ok(darkOver(4), 'under the pot too');
});

// ── The Wizard's newer school features, and the feats ────────────────────────

const FeatSystemForSaves = await load('systems/FeatureSystem');
const DecoySystem = await load('systems/DecoySystem');
const { updateCombatTimers } = await load('systems/CombatSystem');
const FeatBuild = await load('rules/Build');
const FeatPicks = await load('rules/FeatPicks');
const { CLASSES: FeatClasses } = await load('rules/Classes');
const { FEATS: FeatTable } = await load('rules/Feats');
const { applyLoadout } = await load('game/PlayerActions');
const Drops = await load('entities/Drops');
const { spellcastingFor } = await load('rules/CharacterSheet');

/** The hero has taken these feats (Improvements), as the level panel would have them. */
function withFeats(hero, ...improvements) {
  hero.build = { ...hero.build, improvements };
  return hero;
}

test('Mage Armour is switched: cast again it ends; it recovers in 6 seconds, and putting on body armour ends it', () => {
  const level = arena(12, 6);
  const wizard = casterAt(2, 2, 'wizard', 2);
  wizard.equipped = {};
  const bare = sheetOf(wizard).armorClass.total;
  assert.equal(SPELLS.mage_armor.recoveryTicks, 6 * 60, 'it recovers in 6 seconds');
  assert.equal(bindSpell(wizard, 2, 'mage_armor', 1), true);
  cast(level, wizard);
  assert.equal(sheetOf(wizard).armorClass.total, bare + 3, 'on');
  for (let t = 0; t < SPELLS.mage_armor.recoveryTicks; t++) updateSpells(level);
  cast(level, wizard);
  assert.equal(sheetOf(wizard).armorClass.total, bare, 'cast again, it is switched off');
  assert.ok(rollLines(wizard).includes('MAGE ARMOUR: OFF'));
  for (let t = 0; t < SPELLS.mage_armor.recoveryTicks; t++) updateSpells(level);
  cast(level, wizard);
  assert.equal(sheetOf(wizard).armorClass.total, bare + 3, 'and on again');
  applyLoadout(wizard, { inventory: [], equipped: { armor: { ...ARMORS.find((a) => a.base === 'leather') } } });
  assert.equal(wizard.buffs.mageArmor, 0, 'body armour put on ends it');
});

test('Split Enchantment: an Enchantment spell that hurts a foe hurts the one nearest it too, once a round', () => {
  const level = arena(14, 6);
  const enchanter = wizardOf('enchantment', 10);
  const struck = mobAt(level, 'orc', 3, 2);
  const next = mobAt(level, 'orc', 4, 2);
  struck.health.max = struck.health.current = next.health.max = next.health.current = 100;
  beginPerception();
  SchoolSystem.updateSchools();
  SchoolSystem.splitEnchantment(enchanter, struck, 'dissonant_whispers', 7);
  assert.equal(next.health.current, 93, 'the same damage');
  SchoolSystem.splitEnchantment(enchanter, struck, 'dissonant_whispers', 7);
  assert.equal(next.health.current, 93, 'not again this round');
  for (let t = 0; t < 6 * 60; t++) SchoolSystem.updateSchools();
  SchoolSystem.splitEnchantment(enchanter, struck, 'fireball', 7);
  assert.equal(next.health.current, 93, 'an Evocation spell does not split');
  SchoolSystem.splitEnchantment(enchanter, struck, 'dissonant_whispers', 7);
  assert.equal(next.health.current, 86, 'a round later it works again');
});

test('Sculpt Spells: where an Evocation spell lands a bubble lets every hero in it succeed on every save, for a round', () => {
  arena(14, 6);
  const evoker = wizardOf('evocation', 2);
  const ally = playerAt(10, 2, 'fighter');
  useDieRoller(() => 1);
  assert.equal(FeatSystemForSaves.heroSavingThrow(evoker, 'dexterity', 25), false, 'no bubble: a 1 fails');
  SchoolSystem.sculptAt(evoker, 'chill_touch', evoker.position.x, evoker.position.y, 40);
  assert.equal(FeatSystemForSaves.heroSavingThrow(evoker, 'dexterity', 25), false, 'a Necromancy spell leaves none');
  SchoolSystem.sculptAt(evoker, 'fireball', evoker.position.x + 10, evoker.position.y, 40);
  assert.equal(FeatSystemForSaves.heroSavingThrow(evoker, 'dexterity', 25), true, 'in the bubble every save succeeds');
  assert.equal(FeatSystemForSaves.heroSavingThrow(ally, 'dexterity', 25), false, 'far from it, not');
  for (let t = 0; t < 6 * 60; t++) SchoolSystem.updateSchools();
  assert.equal(FeatSystemForSaves.heroSavingThrow(evoker, 'dexterity', 25), false, 'it lasts a round');
});

test('Improved Minor Illusion: a dummy (AC 10, 20 HP) that the foes who fail their save go for and strike until it is gone', () => {
  const level = arena(16, 8);
  const illusionist = wizardOf('illusion', 2, 2, 4);
  const goblin = mobAt(level, 'goblin', 8, 4);
  beginPerception();
  useDieRoller((sides) => (sides === 20 ? 1 : sides));
  const aim = { x: goblin.position.x + 40, y: goblin.position.y };
  assert.equal(usedFeature(illusionist, 'improved_minor_illusion', 11, level, aim), 'ok');
  assert.equal(Features.featureOfClass('wizard', 'improved_minor_illusion').cooldown, 30, 'it recovers in 30 seconds');
  const decoy = [...world.with('decoy')][0];
  assert.ok(decoy, 'a dummy stands');
  assert.deepEqual([decoy.decoy.ac, decoy.health.max], [10, 20]);
  assert.equal(goblin.lured, world.id(decoy), 'the goblin failed its save and is lured');
  useDieRoller(SURE_HIT);
  const heroHealth = illusionist.health.current;
  for (let t = 0; t < 900 && !decoy.removed; t++) {
    beginPerception();
    updateAI(level, t);
    updateMovement(level);
    updateCombatTimers();
    updateContactDamage(level);
    DecoySystem.updateDecoys();
  }
  assert.ok(decoy.removed, 'the goblin broke the dummy');
  assert.equal(illusionist.health.current, heroHealth, 'and struck nobody else meanwhile');
  DecoySystem.updateDecoys();
  assert.equal(goblin.lured, undefined, 'then it is itself again');
});

test('feats the game does not play are not offered at all (but stay in the data); Great Weapon Master switches only its power attack', async () => {
  const { OFFERED_FEATS } = await load('rules/Feats');
  const wizard = createPlayer(0, 0, 'wizard').build;
  for (const id of ['actor', 'crossbow_expert', 'lucky', 'martial_adept', 'performer', 'ritual_caster', 'sentinel', 'skilled', 'war_caster']) {
    assert.equal(FeatBuild.featOpen(FeatClasses.wizard, 4, wizard, id), false, id);
    assert.ok(!OFFERED_FEATS.includes(id), `${id} is not listed in the level panel`);
    assert.ok(FeatTable[id], `${id} is still known to the game`);
  }
  assert.ok(OFFERED_FEATS.includes('weapon_master') && OFFERED_FEATS.includes('alert'));
  for (const id of ['charger', 'dungeon_delver', 'elemental_adept', 'mage_slayer', 'magic_initiate_cleric', 'polearm_master', 'shield_master', 'spell_sniper', 'weapon_master']) {
    assert.equal(FeatTable[id].worked, true, id);
  }
  const hero = withFeats(playerAt(2, 2, 'fighter'), { feat: 'great_weapon_master' });
  assert.equal(sheetOf(hero).feats.bonusAttack, true, 'the extra attack after a kill is always on');
  assert.equal(sheetOf(hero).feats.powerAttacks.length, 0, 'the power attack only when switched on');
});

test('Magic Initiate and Spell Sniper teach the spells picked with them, bound at their own level and counted against no limit', () => {
  const hero = createPlayer(centre(2), centre(2), 'wizard');
  hero.inSafeRoom = true;
  hero.playerStats.level = 4;
  const build = hero.build;
  const cleric = FeatPicks.pickOptions(FeatClasses.wizard, 'magic_initiate_cleric');
  assert.deepEqual(FeatPicks.picksWanted('magic_initiate_cleric', cleric), { cantrip: 1, spell: 1, weapon: 0, element: 0 }, 'the one cleric cantrip the game casts yet');
  assert.ok(cleric.some((o) => o.id === 'guiding_bolt' && o.open));
  assert.ok(cleric.some((o) => o.id === 'bless' && !o.open), 'a spell not in the game yet is greyed out');
  assert.equal(FeatBuild.takeImprovement(FeatClasses.wizard, build, 4, { feat: 'magic_initiate_cleric' }), false, 'its picks are needed');
  assert.equal(FeatBuild.takeImprovement(FeatClasses.wizard, build, 4, { feat: 'magic_initiate_cleric', picks: ['fire_bolt', 'guiding_bolt'] }), false, 'from the cleric list only');
  assert.equal(FeatBuild.takeImprovement(FeatClasses.wizard, build, 4, { feat: 'magic_initiate_cleric', picks: ['sacred_flame', 'guiding_bolt'] }), true);
  const cantrips = ['fire_bolt', 'ray_of_frost', 'acid_splash', 'chill_touch', 'poison_spray', 'shocking_grasp'];
  const limit = Schools.bindLimit(4, 0);
  cantrips.slice(0, limit).forEach((spell, slot) => assert.equal(bindSpell(hero, slot, spell, 0), true));
  assert.equal(bindSpell(hero, limit, cantrips[limit], 0), false, 'the wizard\'s cantrips are all bound');
  assert.equal(bindSpell(hero, limit, 'sacred_flame', 0), true, 'a feat\'s cantrip is not counted');
  assert.equal(bindSpell(hero, limit + 1, 'guiding_bolt', 2), false, 'only at its own level');
  assert.equal(bindSpell(hero, limit + 1, 'guiding_bolt', 1), true);
  assert.equal(Spellbook.boundAtLevel(hero, 0), limit);
  const sheet = sheetOf(hero);
  assert.equal(spellcastingFor(sheet, 'sacred_flame').ability, 'wisdom', 'cast with the cleric\'s Wisdom');
  assert.equal(spellcastingFor(sheet, 'fire_bolt').ability, 'intelligence');
  const sniper = FeatPicks.pickOptions(FeatClasses.wizard, 'spell_sniper');
  assert.ok(sniper.every((o) => o.group === 'cantrip' && o.spell.effect?.kind === 'damage'), 'only cantrips that deal damage');
  assert.ok(sniper.some((o) => o.id === 'eldritch_blast'), 'from any class');
});

test('Weapon Master: four weapons picked, those the hero is trained in already greyed out', async () => {
  const wizard = createPlayer(0, 0, 'wizard');
  const options = FeatPicks.pickOptions(FeatClasses.wizard, 'weapon_master');
  assert.ok(options.some((o) => o.id === 'dagger' && !o.open), 'a wizard knows the dagger');
  assert.ok(options.some((o) => o.id === 'longsword' && o.open));
  const picks = ['longsword', 'rapier', 'longbow', 'warhammer'];
  assert.equal(FeatBuild.takeImprovement(FeatClasses.wizard, wizard.build, 4, { feat: 'weapon_master', ability: 'dexterity', picks: ['dagger', 'rapier', 'longbow', 'warhammer'] }), false);
  assert.equal(FeatBuild.takeImprovement(FeatClasses.wizard, wizard.build, 4, { feat: 'weapon_master', ability: 'dexterity', picks: picks.slice(0, 3) }), false, 'four of them');
  assert.equal(FeatBuild.takeImprovement(FeatClasses.wizard, wizard.build, 4, { feat: 'weapon_master', ability: 'dexterity', picks }), true);
  wizard.equipped = { primary: { ...WEAPONS.find((w) => w.base === 'longsword') } };
  assert.ok(sheetOf(wizard).attack.proficient, 'trained in the longsword now');
  const { alsoTrained } = await load('ui/ProficiencyPanel');
  const listed = alsoTrained(sheetOf(wizard));
  assert.ok(picks.every((base) => listed.includes(base)), 'the character tab lists them under the weapon proficiencies');
  assert.ok(listed.includes('dagger'), 'beside the class\'s own');
  const fighter = createPlayer(0, 0, 'fighter');
  assert.ok(FeatPicks.pickOptions(FeatClasses.fighter, 'weapon_master').every((o) => !o.open), 'a fighter knows every weapon already');
});

test('Elemental Adept: the damage dice of the picked type never count a 1', () => {
  const level = arena(14, 6);
  const wizard = withFeats(casterAt(2, 2, 'wizard', 0), { feat: 'elemental_adept', picks: ['cold'] });
  assert.deepEqual(sheetOf(wizard).feats.elements, ['cold']);
  const orc = mobAt(level, 'orc', 6, 2);
  orc.health.max = orc.health.current = 100;
  boundOn(wizard, 0, 'ray_of_frost');
  useDieRoller((sides) => (sides === 20 ? 19 : 1));
  cast(level, wizard, SPELLS.ray_of_frost.recoveryTicks);
  assert.equal(orc.health.current, 100 - 2, 'a 1 on the d8 counts as a 2');
  assert.equal(FeatBuild.takeImprovement(FeatClasses.wizard, createPlayer(0, 0, 'wizard').build, 4, { feat: 'elemental_adept', picks: ['necrotic'] }), false, 'acid, cold, fire, lightning or thunder');
});

test('Polearm Master strikes again with the butt end: 1d4 bludgeoning, rolled as the weapon\'s own blow', () => {
  const hero = withFeats(playerAt(2, 2, 'fighter'), { feat: 'polearm_master' });
  hero.equipped = { primary: { ...WEAPONS.find((w) => w.base === 'glaive') } };
  const sheet = sheetOf(hero);
  assert.ok(sheet.butt, 'a glaive has a butt end');
  assert.deepEqual([sheet.butt.damage.count, sheet.butt.damage.sides, sheet.butt.damage.bonus], [1, 4, 0]);
  assert.equal(sheet.butt.rule.type, 'bludgeoning');
  assert.equal(sheet.butt.attackBonus, sheet.attack.attackBonus, 'the same to hit');
  hero.equipped = { primary: { ...WEAPONS.find((w) => w.base === 'longsword') } };
  assert.equal(sheetOf(hero).butt, null, 'not with a longsword');
});

test('Sharpshooter: a kill with a ranged weapon earns a shot more for the next volley', async () => {
  const SwordSystem = await load('systems/SwordSystem');
  const archer = withFeats(playerAt(2, 2, 'fighter'), { feat: 'sharpshooter' });
  SwordSystem.earnBonusAttack(archer, true);
  assert.equal(archer.bonusAttack, true);
  const brute = withFeats(playerAt(4, 2, 'fighter'), { feat: 'great_weapon_master' });
  SwordSystem.earnBonusAttack(brute, true);
  assert.equal(brute.bonusAttack, undefined, 'Great Weapon Master does not earn it with a bow');
});

test('Alert: a foe nobody sees coming strikes first without a roll, unless the hero is Alert', () => {
  const level = arena(12, 6);
  const hero = playerAt(2, 2, 'fighter');
  const goblin = mobAt(level, 'goblin', 3, 2);
  world.addComponent(goblin, 'unseen', true);
  engage(goblin, hero, 0);
  updateInitiative();
  assert.equal(goblin.initiative?.firstStrike, true, 'a surprise');
  assert.equal(hero.initiative, undefined, 'the hero never rolled');
  const alert = withFeats(playerAt(6, 4, 'fighter'), { feat: 'alert' });
  const shade = mobAt(level, 'goblin', 7, 4);
  world.addComponent(shade, 'unseen', true);
  engage(shade, alert, 0);
  updateInitiative();
  assert.ok(alert.initiative, 'the Alert hero rolls as usual');
});

test('Athlete and Mobile never fall into a pit: the hero leaps to its far side, or springs back when it is too wide', () => {
  const level = arena(16, 10);
  level.setTile(6, 2, createTile(TileType.Hole));
  level.setTile(6, 3, createTile(TileType.Hole));
  const leaper = withFeats(playerAt(5, 3, 'fighter'), { feat: 'athlete', ability: 'dexterity' });
  updateHoles(level);
  leaper.position.x = centre(6);
  updateHoles(level);
  assert.equal(leaper.falling, undefined, 'no fall');
  assert.ok(leaper.position.x > centre(6), 'on, over to the far side');
  updateHoles(level);
  assert.equal(leaper.falling, undefined, 'standing on its far edge');
  for (let x = 6; x <= 12; x++) for (const y of [6, 7]) level.setTile(x, y, createTile(TileType.Hole));
  const mobile = withFeats(playerAt(5, 7, 'fighter'), { feat: 'mobile' });
  updateHoles(level);
  mobile.position.x = centre(6);
  updateHoles(level);
  assert.equal(mobile.falling, undefined);
  assert.equal(mobile.position.x, centre(5), 'too wide to clear: back where they came from');
});

test('Charger rushes at the foe nearest the aim and strikes it at once; then it recovers', () => {
  const level = arena(16, 6);
  const hero = withFeats(casterAt(2, 2, 'fighter', 0), { feat: 'charger' });
  hero.equipped = { primary: { ...WEAPONS.find((w) => w.base === 'longsword') } };
  const orc = mobAt(level, 'orc', 7, 2);
  hero.aimWorld.x = orc.position.x;
  beginPerception();
  assert.equal(bindSpell(hero, 0, 'feat:charger', 0), true, 'bound like a toggle feat');
  const from = hero.position.x;
  cast(level, hero, 1);
  assert.ok(hero.position.x > from + 3 * TILE_WIDTH, 'it rushed at the orc');
  assert.ok(hero.swordSwing, 'and swings at once');
  assert.equal(hero.spellbook.recovery[0], 12 * 60, 'it recovers in 12 seconds');
});

test('Dungeon Delver makes the gear in a chest magical more often; Shield Master and Mage Slayer help with saves', () => {
  const level = arena(12, 6);
  const plain = playerAt(2, 2, 'fighter');
  const delver = withFeats(playerAt(4, 2, 'fighter'), { feat: 'dungeon_delver' });
  assert.equal(Drops.chestMagicPercent(plain), 20);
  assert.equal(Drops.chestMagicPercent(delver), 50, '30 points more');
  const item = { ...WEAPONS.find((w) => w.base === 'longsword') };
  Drops.enchant(item, 2);
  assert.equal(item.bonus, 2);
  assert.equal(item.name, 'Longsword +2');
  const guard = withFeats(playerAt(6, 2, 'fighter'), { feat: 'shield_master' });
  guard.equipped = { secondary: { ...SHIELDS[0] } };
  const dc = 19 + sheetOf(guard).saves.dexterity.bonus + 2;
  useDieRoller(() => 19);
  assert.equal(FeatSystemForSaves.heroSavingThrow(guard, 'dexterity', dc), true, '+2 with a shield');
  guard.equipped = {};
  assert.equal(FeatSystemForSaves.heroSavingThrow(guard, 'dexterity', dc), false, 'not without one');
  const slayer = withFeats(playerAt(8, 2, 'fighter'), { feat: 'mage_slayer' });
  const caster = mobAt(level, 'goblin', 8, 2);
  let rolls = 0;
  useDieRoller(() => (++rolls === 1 ? 1 : 20));
  assert.equal(FeatSystemForSaves.heroSavingThrow(slayer, 'wisdom', 15, undefined, caster), true, 'advantage against a caster at arm\'s length');
});

test('the trader buys from a hero for half the price and keeps what it bought, to sell back once; its wares never run out', () => {
  const { sell, buyFrom, sellPrice, shopWares } = PlayerActions;
  const hero = playerAt(2, 2);
  const keeper = createShopNpc(2 * TILE_WIDTH + 20, 2 * TILE_WIDTH);
  const sword = { ...SHOP_ITEMS.find((i) => i.base === 'longsword') };
  hero.inventory = [sword, null];
  hero.playerStats.gold = 0;
  const wares = keeper.shopNpc.items.length;
  assert.ok(sell(hero, keeper, 0));
  assert.equal(hero.inventory[0], null, 'gone from the bag');
  assert.equal(hero.playerStats.gold, sellPrice(sword));
  assert.equal(sellPrice(sword), Math.floor(sword.value / 2));
  assert.equal(sellPrice({ ...sword, value: 1 }), 1, 'never less than a gold piece');
  assert.equal(shopWares(keeper).length, wares + 1, 'the trader offers it back');
  assert.ok(!sell(hero, keeper, 0), 'an empty square sells nothing');
  hero.playerStats.gold = 1000;
  assert.ok(buyFrom(hero, keeper, wares), 'bought back');
  assert.equal(shopWares(keeper).length, wares, 'once');
  assert.ok(buyFrom(hero, keeper, 0));
  assert.equal(shopWares(keeper).length, wares, 'a ware stays on offer');
  world.remove(keeper);
});

test('class features show their bg3.wiki icons: every icon named in feature-icons.json is in public/, keyed by class', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { featureOfClass, featureIconSources } = await load('rules/ClassFeatures');
  const icons = JSON.parse(readFileSync('src/data/feature-icons.json', 'utf8'));
  for (const cls of ['fighter', 'rogue', 'cleric', 'wizard']) {
    for (const [id, src] of Object.entries(icons[cls])) {
      assert.ok(existsSync(`public/${src}`), `${cls}.${id}: ${src}`);
      assert.ok(featureOfClass(cls, id), `${cls} has a feature ${id}`);
    }
  }
  assert.equal(featureOfClass('fighter', 'second_wind').icon, 'feature_icon_fighter_second_wind');
  assert.notEqual(featureOfClass('fighter', 'extra_attack').icon, featureOfClass('wizard', 'extra_attack').icon, 'each class its own');
  assert.equal(featureOfClass('fighter', 'fighting_style').icon, null, 'a feature with no icon shows its initials');
  assert.ok(featureIconSources().every((s) => s.src.startsWith('/class-features-icons/')));
});

test('a blow that hurts a hero or a foe splashes blood from their body; a dummy does not bleed', async () => {
  const { bleeds, spawnBlood, bloodSheets } = await load('entities/Blood');
  const goblin = mobAt(arena(8, 8), 'goblin', 3, 3);
  const before = world.entities.filter((e) => e.fx).length;
  assert.ok(bleeds(goblin));
  spawnBlood(goblin);
  const splash = world.entities.filter((e) => e.fx).at(-1);
  assert.equal(world.entities.filter((e) => e.fx).length, before + 1);
  assert.ok(splash.visual.sheet.startsWith('blood_'));
  assert.ok(splash.visual.scale < 0.5, 'drawn small');
  assert.equal(splash.fx.follow, world.id(goblin), 'moving with the one hit');
  assert.ok(!bleeds({ position: { x: 0, y: 0 }, dummy: { row: 0 } }));
  assert.ok(bloodSheets().every((s) => s.frames.length > 10 && s.frames.every((f) => f.x < 600 && f.y < 600)));
});

test('the trader sells everything there is and has a purse of its own: what heroes pay it adds up, and it cannot buy past it', async () => {
  const { sell, buyFrom } = PlayerActions;
  const { WEAPON_BASES } = await load('rules/WeaponTable');
  const { MEDALS } = await load('entities/ItemCatalog');
  const { TRADER_GOLD } = await load('entities/DungeonFactory');
  const bases = new Set(SHOP_ITEMS.map((i) => i.base));
  for (const base of WEAPON_BASES.filter((b) => HAND_WEAPONS.some((w) => w.base === b))) assert.ok(bases.has(base), `${base} on offer`);
  for (const base of ['shield', 'tower_shield', 'plate', 'robe']) assert.ok(bases.has(base), `${base} on offer`);
  assert.ok(MEDALS.every((m) => SHOP_ITEMS.some((i) => i.id === m.id)), 'every medal');
  const hero = playerAt(2, 2);
  const keeper = createShopNpc(2 * TILE_WIDTH + 20, 2 * TILE_WIDTH);
  assert.equal(keeper.shopNpc.gold, TRADER_GOLD);
  hero.playerStats.gold = 100;
  const price = keeper.shopNpc.items[0].value;
  assert.ok(buyFrom(hero, keeper, 0));
  assert.equal(keeper.shopNpc.gold, TRADER_GOLD + price, 'paid to the trader');
  keeper.shopNpc.gold = 0;
  hero.inventory = [{ ...SHOP_ITEMS.find((i) => i.base === 'longsword') }];
  assert.ok(!sell(hero, keeper, 0), 'a trader with no gold buys nothing');
  assert.ok(hero.inventory[0], 'the hero keeps it');
  world.remove(keeper);
});

test('every hero sets out with 10 gold, and the console adds more with /gold', () => {
  const hero = playerAt(2, 2);
  assert.equal(hero.playerStats.gold, 10);
  runCommand('/gold 500', { player: hero, allowed: true });
  assert.equal(hero.playerStats.gold, 510);
});

// ── Spike traps, chests of the isometric castle, gateways, portals, catacomb decor ──

test("the catacombs' spike traps lie in their corridors, never shutting a way; one bites the first hero on it once, by depth", async () => {
  const { updateTraps, spikeDie } = await load('systems/TrapSystem');
  const { createSpikeTrap } = await load('entities/DungeonFactory');
  let traps = 0;
  for (const seed of [3, 7, 11]) {
    const { spikes, rooms, level } = new DungeonBuilder({ ...DEFAULT_CONFIG, seed }).build();
    traps += spikes.length;
    for (const s of spikes) {
      const tx = Math.floor(s.x / TILE_WIDTH);
      const ty = Math.floor(s.y / TILE_HEIGHT);
      assert.equal(level.getTile(tx, ty).type, TileType.Floor, 'a trap is floor anyone can walk over');
      assert.ok(!rooms.some((r) => tx >= r.x && ty >= r.y && tx < r.x + r.w && ty < r.y + r.h), 'in a corridor, not a room');
    }
  }
  assert.ok(traps >= 6, `${traps} traps in three dungeons`);
  assert.deepEqual([1, 2, 3, 4, 5, 7, 9, 15].map(spikeDie), [4, 4, 6, 6, 8, 10, 12, 12], 'd4 to the 2nd level, then bigger dice');

  startRun();
  world.clear();
  const trap = createSpikeTrap(centre(5), centre(3));
  const hero = playerAt(3, 3, 'fighter');
  world.addComponent(hero, 'playerName', 'Evincars');
  const full = hero.health.current;
  updateTraps();
  assert.equal(trap.spikeTrap.sprung, false, 'nobody on it');
  hero.position.x = centre(5);
  updateTraps();
  assert.equal(trap.spikeTrap.sprung, true);
  assert.equal(hero.health.current, full - 4, 'the loaded d4 shows its top face');
  const logged = currentLog().entries.filter((e) => e.event === 'trap');
  assert.deepEqual(logged.map((e) => [e.item, e.damage]), [['1d4', 4]], 'told in the combat log');
  hero.hurtTime = 0;
  for (let t = 0; t < 30; t++) updateTraps();
  assert.equal(hero.health.current, full - 4, 'sprung, it hurts nobody again');
  assert.equal(trap.visual.col, 4, 'its spikes stay up');
});

test("the isometric castle's chests are its own, mostly plain, some rarer with dearer things; they open on their own frame", async () => {
  const { CHEST_TIERS, DROP_TABLES } = await load('entities/Drops');
  const { isoChest } = await load('entities/DungeonFactory');
  const weights = CHEST_TIERS.map((t) => t.weight);
  assert.ok(weights[0] > weights[1] && weights[1] > weights[2], 'the plain ones are the most common');
  const coins = CHEST_TIERS.map((t) => DROP_TABLES[t.drops].entries[0].drop.max);
  assert.ok(coins[0] < coins[1] && coins[1] < coins[2], 'the rarer, the richer');
  const picks = CHEST_TIERS.map((t) => DROP_TABLES[t.drops].always[0].picks ?? 1);
  assert.deepEqual(picks, [1, 2, 3], 'and the dearer their gear');
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const look = isoChest();
    assert.equal(look.visual.sheet, 'iso_chests');
    assert.equal(CHEST_TIERS[look.visual.row].drops, look.chest.drops, 'its row is its tier');
    assert.notEqual(look.chest.open, look.chest.closed, 'it opens on a frame of its own');
    seen.add(look.visual.row);
  }
  assert.equal(seen.size, 3, 'every tier turns up');
  world.clear();
  buildDungeon(11, true, 'castle2');
  const chests = [...world.with('chest')];
  assert.ok(chests.length > 0 && chests.every((c) => c.visual.sheet === 'iso_chests'), 'its chests are its own');
  world.clear();
  buildDungeon(11, true, 'catacomb');
  assert.ok([...world.with('chest')].every((c) => c.visual.sheet === 'iso_chests'), 'and the catacombs have them too');
});

test("the isometric castle's corridors come out through a room's north wall under gateways: arches, open doors, or a grate that bars the way", async () => {
  const { dungeonConfig } = await load('level/generators/DungeonConfig');
  const kinds = new Set();
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const { props, level } = new DungeonBuilder(dungeonConfig('castle2', seed)).build();
    for (const gate of props.filter((p) => p.kind.startsWith('iso_gate'))) {
      kinds.add(gate.kind);
      const way = [level.getTile(gate.tx, gate.ty - 1), level.getTile(gate.tx + 1, gate.ty - 1)];
      const faces = [level.getTile(gate.tx - 1, gate.ty - 1), level.getTile(gate.tx + 2, gate.ty - 1)];
      assert.ok(faces.every((t) => t.type === TileType.Wall), 'its pillars stand on the faces either side of the way');
      if (gate.kind !== 'iso_gate_grate') {
        assert.ok(way.every((t) => t.type === TileType.Floor), 'an arch is walked under');
        continue;
      }
      assert.ok(way.every((t) => t.type === TileType.Obstacle), 'a grate bars the way');
      const box = level.blockBoxes.get(gate.tx + (gate.ty - 1) * level.width);
      assert.ok(box && box.y1 === TILE_HEIGHT && box.y0 > TILE_HEIGHT / 2, 'only its foot stops bodies');
      assert.ok(level.checkLineOfSight(centre(gate.tx), centre(gate.ty), centre(gate.tx), centre(gate.ty - 3)), 'it is seen through');
    }
  }
  assert.deepEqual([...kinds].sort(), ['iso_gate_arch', 'iso_gate_door', 'iso_gate_grate']);
});

test('catacomb rooms have pillars standing about them, their own iron and barred gates on the walls; campfires smoke, portals breathe mist', async () => {
  const { POSTS, COLUMNS, CATACOMB_FIXTURES, PROPS } = await load('level/Props');
  const { createCampfire, createProp } = await load('entities/DungeonFactory');
  let pillars = 0;
  let iron = 0;
  let rooms = 0;
  for (const seed of [3, 7, 11]) {
    const layout = new DungeonBuilder({ ...DEFAULT_CONFIG, seed }).build();
    rooms += layout.rooms.filter((r) => r.type === 'dungeon').length;
    pillars += layout.props.filter((p) => POSTS.includes(p.kind) || COLUMNS.includes(p.kind)).length;
    iron += layout.props.filter((p) => CATACOMB_FIXTURES.includes(p.kind)).length;
  }
  assert.ok(pillars >= rooms * 0.6, `${pillars} pillars in ${rooms} rooms`);
  assert.ok(iron >= 30, `${iron} cauldrons, chains and shackles`);
  let gates = 0;
  for (const seed of [1, 2, 3, 4]) gates += new DungeonBuilder({ ...DEFAULT_CONFIG, seed }).build().props.filter((p) => p.kind === 'barred_gate').length;
  assert.ok(gates > 0, 'barred gates set into the faces');
  assert.ok(POSTS.every((kind) => PROPS[kind].solid && !PROPS[kind].seeThrough), 'pillars block and never clear');
  world.clear();
  createCampfire(100, 100);
  const portal = createProp({ kind: 'portal_dark', tx: 5, ty: 5 });
  assert.equal(world.entities.filter((e) => e.visual?.sheet === 'smoke').length, 1, 'a column of smoke over the fire');
  assert.equal(portal.mist, true, 'mist breathes out of the portal');
});

test('tombs can be searched: coins, and now and then what their dead were buried with', async () => {
  const { createStash } = await load('entities/DungeonFactory');
  const { updateStashes } = await load('systems/StashSystem');
  const random = Math.random;
  Math.random = () => 0;
  try {
    for (const kind of ['coffin_open', 'sarcophagus_open', 'sarcophagus_broken2']) assert.ok(createStash({ kind, tx: 3, ty: 3 }), `${kind} is searched`);
    world.clear();
    const tomb = createStash({ kind: 'sarcophagus', tx: 3, ty: 3 });
    assert.equal(tomb.stash.gear, true, 'gear buried with the dead');
    const hero = playerAt(3, 4, 'fighter');
    const carried = hero.inventory.length;
    hero.playerInput.intents.use = true;
    beginPerception();
    resolveUses();
    updateStashes();
    assert.equal(tomb.removed, true, 'searched once');
    assert.equal(hero.inventory.length, carried + 1, 'the find goes into the bag');
  } finally {
    Math.random = random;
  }
});

test("a wall jutting out past another's face runs its edge on up to the top of the wall", async () => {
  const { buildTerrainPieces } = await load('level/TerrainAutotile');
  // A wall mass across rows 2–4 with open floor north of it (row 1); its east part (x 7–10) juts down to row 6.
  const level = arena(12, 10);
  wallRect(level, 1, 2, 10, 4);
  wallRect(level, 7, 5, 10, 6);
  const pieces = buildTerrainPieces(level);
  const edgeAt = (dx, dy) => pieces.some((p) => p.dx === dx && p.dy === dy && p.sx === 64 && p.w === 8);
  // Column x 7's west sub-tile (sub-x 14) beside the face of x 6 (rows 3–4), and the wall top above it (row 2).
  assert.ok(edgeAt(14 * 16, 3 * 32) && edgeAt(14 * 16, 3 * 32 + 8), 'its edge along the other face');
  assert.ok(edgeAt(14 * 16, 2 * 32 + 8) && edgeAt(14 * 16, 2 * 32), 'and on up to the open floor north');

  // Now the east part juts down only one row (to row 5): its face (rows 4–5) stands beside the other's (rows 3–4).
  const step = arena(12, 10);
  wallRect(step, 1, 2, 10, 4);
  wallRect(step, 7, 5, 10, 5);
  const faces = buildTerrainPieces(step);
  const endAt = (dy) => faces.some((p) => p.dx === 14 * 16 && p.dy === dy && p.sx === 64 && p.w === 16);
  assert.ok([8, 9, 10, 11].every((sy) => endAt(sy * 16)), 'its face ends in its edge all the way up, not only below the other face');
});

test('now and then a catacomb level runs through caverns: rock and cave ground, a chasm down through them, bridges over it', async () => {
  const { dungeonConfig } = await load('level/generators/DungeonConfig');
  const { buildTerrainPieces } = await load('level/TerrainAutotile');
  const { CAVE_SHEET, CAVE_BRINKS } = await load('level/CaveTerrain');
  const { encodeLevelMap, decodeLevelMap } = await load('level/LevelMap');
  let caves = 0;
  for (const seed of [1, 4, 7, 10, 12, 15]) {
    const layout = new DungeonBuilder(dungeonConfig('catacomb', seed)).build();
    const { level } = layout;
    if (level.caveZone.size === 0) continue;
    caves++;
    const W = level.width;
    const at = (i) => level.getTile(i % W, Math.floor(i / W));
    const chasm = [...level.caveZone].filter((i) => at(i).type === TileType.Hole);
    assert.ok(chasm.length > 0 && level.bridges.size > 0, 'a chasm, and a bridge over it');
    for (const i of level.bridges) {
      assert.equal(at(i).type, TileType.Floor, 'a bridge is walked on');
      assert.ok(level.caveZone.has(i), 'in the caverns');
      assert.ok(!layout.props.some((p) => p.tx + p.ty * W === i), 'nothing stands on it');
    }
    assert.ok(chasm.every((i) => !level.slopes.has(i) && !level.isSafeZone(i % W, Math.floor(i / W))));
    assert.ok(layout.rooms.some((r) => r.cave), 'some rooms are caverns');
    const reached = reachableTiles(tileGraphOf(level), Math.floor(layout.playerSpawn.x / 32) + Math.floor(layout.playerSpawn.y / 32) * W,
      (_f, to) => (level.getTile(to % W, Math.floor(to / W)).type === TileType.Floor ? 1 : Infinity));
    for (const r of layout.rooms) {
      const floor = [];
      forEachTileIn(r, (x, y) => { if (level.getTile(x, y).type === TileType.Floor) floor.push(x + y * W); });
      assert.ok(floor.every((i) => reached[i] === 1), `every floor of room ${r.id} can be reached: the bridges join it`);
    }
    const pieces = buildTerrainPieces(level);
    assert.ok(pieces.some((p) => p.sheet === CAVE_SHEET && !p.floor), 'rock and chasm from the cave set');
    assert.ok(pieces.some((p) => p.sheet === CAVE_BRINKS), 'ragged brinks round the chasm');
    const back = decodeLevelMap(JSON.parse(JSON.stringify(encodeLevelMap(layout))));
    assert.deepEqual([...back.level.caveZone].sort(), [...level.caveZone].sort(), 'co-op guests get the caverns');
    assert.deepEqual([...back.level.bridges].sort(), [...level.bridges].sort(), 'and the bridges');
  }
  assert.ok(caves >= 2, `${caves} of six levels run through caverns`);
});

function forEachTileIn(r, fn) {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) fn(x, y);
}

test("off a bridge's edge there is nothing to stand on; drain grates keep clear of walls; fire burns behind a barred gate's bars", async () => {
  const { overHole } = await load('systems/HoleSystem');
  const level = arena(8, 8);
  for (let x = 1; x < 7; x++) level.setTile(x, 4, createTile(TileType.Hole));
  level.setTile(3, 3, createTile(TileType.Floor));
  level.bridges.add(3 + 3 * level.width);
  const justOff = { position: { x: 3 * 32 + 16, y: 4 * 32 + 8 }, radius: { x: 7, y: 7 } };
  assert.equal(level.getClipBBs(justOff.position.x, justOff.position.y, 7, 7).some((b) => b.y >= 4 * 32 - 1 && b.y < 5 * 32 && b.x === 3 * 32), false,
    'the caverns\' chasm is a drop, not a wall');
  assert.equal(overHole(level, justOff), true, 'stepping off the planks, one falls at once');
  level.bridges.clear();
  assert.equal(overHole(level, justOff), false, 'off plain ground, feet reach over the brink a little');

  for (const seed of [3, 7, 11, 23]) {
    const { level: built } = new DungeonBuilder({ ...DEFAULT_CONFIG, seed }).build();
    for (const g of built.grates) {
      for (let y = g.y - 1; y <= g.y + 2; y++) {
        for (let x = g.x - 1; x <= g.x + 2; x++) assert.notEqual(built.getTile(x, y).type, TileType.Wall, `grate at ${g.x},${g.y} keeps off the walls`);
      }
    }
  }

  const { createProp } = await load('entities/DungeonFactory');
  world.clear();
  const gate = createProp({ kind: 'barred_gate', tx: 4, ty: 4 });
  const fires = world.entities.filter((e) => e.visual?.sheet === 'blue_fire');
  assert.equal(fires.length, 2, 'two blue flames');
  assert.ok(fires.every((f) => f.position.y < gate.position.y), 'drawn behind the bars');
  assert.ok(fires.some((f) => f.glow?.cool), 'giving off a cold light');
});

test('a blow can knock an enemy over the edge of a pit, where it falls; the mouse wheel zooms the view, not the HUD', async () => {
  const { updateMovement } = await load('systems/MovementSystem');
  const { updateHoles } = await load('systems/HoleSystem');
  const { camera, zoomBy, screenToWorld, ZOOM_MAX } = await load('render/Camera');
  world.clear();
  const level = arena(12, 8);
  for (const [x, y] of [[6, 3], [7, 3], [6, 4], [7, 4]]) level.setTile(x, y, createTile(TileType.Hole));
  level.addPit({ x: 6, y: 3, shape: 'square' });
  const mob = mobAt(level, 'goblin', 5, 4);
  mob.position.x = 6 * 32 - 2;
  for (let t = 0; t < 10; t++) updateMovement(level);
  assert.ok(mob.position.x < 6 * 32, 'walking, it keeps out of the pit');
  mob.bump = { x: 4, y: 0 };
  for (let t = 0; t < 12; t++) {
    updateMovement(level);
    updateHoles(level);
  }
  assert.equal(mob.removed, true, 'knocked back over the edge, it is lost');

  camera.x = 100;
  camera.y = 50;
  camera.zoom = 1;
  zoomBy(1);
  assert.equal(camera.zoom, 1.25);
  for (let i = 0; i < 20; i++) zoomBy(1);
  assert.equal(camera.zoom, ZOOM_MAX, 'never closer than twice');
  assert.deepEqual(screenToWorld(40, 20), { x: 120, y: 60 }, 'the mouse points into the zoomed world');
  for (let i = 0; i < 20; i++) zoomBy(-1);
  assert.equal(camera.zoom, 1, 'and back out to the picture as made, no further');
});
