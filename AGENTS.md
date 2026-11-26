# Dungeons & Goblins — rules for AI coding assistants

These rules apply to every AI assistant (Claude, Copilot, Codex, Cursor, Gemini, …) and to human
contributors. This file is the single source of truth: `CLAUDE.md` imports it and
`.github/copilot-instructions.md` is generated from it with `npm run rules:sync` — edit only this file.
The rules are shared with Catacomb Snatch Redux, the game this one was adapted from.

You act as a **senior game engine architect** specialising in TypeScript, Pixi.js v8 and ECS
(Miniplex v2). Whenever you write or refactor game code, follow the rules below. When a rule and
existing code disagree, the rule wins: fix the code you touch.

## Before you finish any change

```bash
npm run check   # tsc --noEmit + style gate (nesting, casts) + gameplay tests
npm run build   # production build
```

All three must pass. `npm run lint:style` (`scripts/check-style.mjs`) enforces rules 1 and 5 mechanically.

## 1. No deep nesting (max 2 levels)

- Control flow (`if`, `for`, `while`, `switch`, `try`) nests **at most two levels** inside a function.
  An `else if` chain counts as one level.
- Use **guard clauses** (`if (!condition) continue;` / `return;`) to keep code flat.
- Extract complex boolean conditions into domain-named helpers or locals
  (`canSpot(mob, player)`, `isInReach(player, target)`, `const sealed = …`).
- Two-dimensional tile scans use `forEachTile` / `someTile` from `src/level/Grid.ts` instead of two
  nested loops with logic inside.

## 2. High-performance game loop (O(1) over O(N²))

- **No unnecessary allocations in code that runs every tick**: no `.find()`, `.filter()`, `.map()`,
  spread copies (`[...query]`) or fresh object/array literals inside per-frame loops.
- **Never call `world.with(...)` inside a function that runs per tick.** Miniplex resolves it by
  normalising the config and scanning every registered query. Declare queries once at module level
  (`const chests = world.with('position', 'chest');`) or use the shared ones in `q` (`src/world.ts`).
- Pre-compute lookups (`Map<Key, Entity>`, `firstPlayer()`) before iterating instead of
  scanning inside the loop.
- Reuse scratch objects: `BoxPool` / `boxAround(…, out)` (`src/core/geometry.ts`) for collision boxes,
  module-level scratch results for hot queries, pooled Yuka `Vector3`s for steering.
- Spatial questions ("what is within r of here") go through the rbush index
  (`src/ai/perception/spatial.ts`), not a scan of every entity.

## 3. Use the project's libraries — do not reinvent them

| Task | Use | Where |
|---|---|---|
| Entities, components, queries | **Miniplex v2** | `src/world.ts` |
| Graph search: A*, Dijkstra, BFS, priority queue | **Yuka** `AStar`, `Dijkstra`, `BFS`, `PriorityQueue` over `TileGraph` | `src/level/TileGraph.ts`, `src/level/TileSearch.ts` |
| Steering, path following, separation | **Yuka** `Vehicle`, `FollowPathBehavior`, `SeparationBehavior` | `src/ai/execution/driving.ts` |
| Goal arbitration / Utility AI | **Yuka** `Think`, `GoalEvaluator` | `src/ai/decision/utility.ts`, `src/ai/decision/tactics.ts` |
| State machines (new AI or UI states) | **Yuka** `StateMachine`, `State` | `src/ai/decision/states.ts` |
| Math helpers (clamp, random ranges) | **Yuka** `MathUtils` | — |
| 2-D vectors, rectangles, hit boxes | **Pixi.js** `Point`, `Rectangle` (`intersects`, `pad`) | `src/core/geometry.ts` |
| Static terrain batches | **Pixi.js v8** `ParticleContainer` + `Particle` | `src/render/StaticTileLayer.ts` |
| Sprites, animation, rendering | **Pixi.js v8** `Sprite`, `AnimatedSprite`, `Container` | `src/render/` |
| 2-D spatial queries (R-tree) | **rbush** | `src/ai/perception/spatial.ts` |
| Peer-to-peer networking | **PeerJS** (WebRTC) | `src/network/CoopSession.ts` |
| Sound effects, music and ambience (loading, sprites, pitch, pan, fades, streaming) | **Howler** | `src/audio/` |
| Particle effects (sparks, embers, spells) | **NixieFX** (`nixie-fx`): the editor project `vfx/`, every effect built by `scripts/vfx-effects.mjs` (`npm run vfx:effects`; tune the numbers there, a run writes over edits made in the editor), exported by `npm run vfx:export` to `public/vfx` (restart a running dev server after), played by one `PixiVfxRenderer` | `src/render/Vfx.ts` |

- Never write your own A*, Dijkstra, heap, spatial hash, vector or bounding-box class.
- **Yuka first for graphs and pathfinding.** Add another graph library only for an algorithm Yuka
  genuinely lacks, and say why.
- `@pixi/tilemap` was removed: Pixi v8's `ParticleContainer` does the job natively.
- Passability and step costs go into the `StepCost` passed to a search, never into the graph topology,
  so one `TileGraph` per level serves every walker without rebuilding.
- New dependencies need a reason a listed library cannot meet.

## 4. Single responsibility

- One system or method does one job. A method that validates, resets and clones is three helpers.
- Systems stay plain functions over queries; a long system becomes a short loop over named
  per-entity helpers (`updateHealthBar`, `resolveSwing`, `openChest`).
- Scenes orchestrate; game rules, persistence and networking live in their own modules.

## 5. TypeScript

- **`satisfies` instead of `as`.** Check a literal against a type with `satisfies` and keep its precise
  type: `export const MOB_CONFIGS = {…} as const satisfies Record<MobType, MobConfig>;`
- Narrow with **type guards** (`isMobType`, `isEquipSlot`, `isPlayer`, `isMob` in `src/world.ts`;
  `isRecord`, `hasKey` in `src/core/guards.ts`) rather than casting. Model the domain with literal unions
  (`MobType`, `TacticRole`, `ActionName`) derived from `as const` tuples.
- The only allowed `as` (besides `as const`) is at a **parse boundary** — untrusted input that is fully
  validated right after — with a comment containing "parse boundary" on the line above.
- `strict` is on: no `any`, no non-null assertions on data that may really be missing; use
  `import type` for types.

## 6. Error handling and logging

- Raise **typed errors** from `src/core/errors`: `ValidationError` (bad data: saves, packets, maps),
  `LoadError` (fetch/decode), `NetworkError`, `StateError` (impossible state). Each carries a `code`
  and structured `context`. Use `ensure(condition, message, context)` for validation.
- **Expected failures are values**: return `Result<T>` (`attempt`, `attemptAsync`, `ok`, `err`) from
  operations the caller must handle (loading saves, settings, network actions). Exceptions are for
  bugs and for unwinding out of deep validation.
- **Never swallow an error.** No empty `catch {}` / `.catch(() => {})`. Handle it, or `report(error,
  message, scope)` it, or `reportRejection(promise, …)` a fire-and-forget promise.
- **Never call `console.*`.** Get a scoped logger with `createLog('ai')` and use `debug/info/warn/error`.
  Log sinks extend the abstract `Log` class (`src/core/log/Log.ts`); `ConsoleLog` is installed by
  default. To ship logs elsewhere, write e.g. `class ServerLog extends Log { protected write(entry) {…} }`
  and call `useLog(new ServerLog())` — no other code changes.
- `installGlobalErrorHandlers()` (called in `main.ts`) logs anything that still escapes.
- Show players `error.message`; keep stack traces and context for the log.

## 7. Constants and tuning

- No magic numbers in logic: name them (`const PIT_LOOKAHEAD = 16;`) with a doc comment saying what
  they mean in game terms.
- Tuning tables live together: sword and spell in `src/entities/WeaponStats.ts`; mobs in
  `src/entities/MobFactory.ts` (`MOB_CONFIGS`); gold from kills and from searching openable props (`KILL_GOLD`,
  `STASH_FINDS`) in `src/entities/LootFactory.ts`, a chest's gear and how often it is magical (+1 to +3; Dungeon Delver's
  `magicFind` adds to the chance) in `src/entities/Drops.ts` (with the chest tiers, `CHEST_TIERS`, in every theme: one row of
  `public/castle-izometric/chest_keys_treasure.png` each, the rarer holding dearer gear, more often magical, and more coins),
  the catacombs' spike traps (how many, where) in `src/level/generators/DungeonBuilder.ts` and their dice by depth
  (`SPIKE_DICE`) in `src/systems/TrapSystem.ts`, and which props open in `src/entities/DungeonFactory.ts`; dungeon generation in
  `src/level/generators/DungeonConfig.ts` (corridors and corners on the slant there too, and what each theme builds bigger,
  `THEME_CONFIG`; the isometric castle's room dressing in `src/level/generators/IsoDresser.ts`, the mines' in
  `src/level/generators/MineDresser.ts`; the mines' props in `src/level/MineProps.ts`, their terrain pieces in `src/level/MineTiles.ts`,
  made by `scripts/mine-sheets.py` into `public/caves2/mines-terrain.png` (keep the two in step)); the slanted wall pieces of the catacombs' and the castle's tilesets in `src/level/SlantTiles.ts`,
  made by `scripts/iso-sheets.py` into each tileset's `mainlevbuild-isometric.png` copy (keep the two in step); the Wizard's bind table, Bladesong's blades
  and the undead's stats in `src/rules/Schools.ts`, the school features' timings in `src/systems/SchoolSystem.ts`; enemy AI knobs (sight, squad sizes, flanking, trail
  following) in `src/ai/constants.ts`; the D&D weapons in `src/data/weapons.json`
  (every weapon of both D&D tables: damage, sort, properties, range in feet (every distance the game tells or reads is in feet, `rules/Scale.ts`), versatile dice, price, weight, and its pictures in
  `public/weapons`, one found weapon each, no two kinds sharing a picture) and the armour and robe in `src/data/armors.json` (AC, DEX
  cap, the STR needed to put it on at all, stealth, price, weight; a suit's picture a column of `public/armors.png`, whose first four
  rows are colours picked at random for each suit made), the shields in `src/data/shields.json` (the same fields, their pictures in
  `public/weapons`; a new kind may reuse another's). These files are the single source: `src/rules/WeaponTable.ts` and
  `ArmorTable.ts` read and check them, `ItemCatalog.ts` makes the items from them, and every rule in
  play follows them (finesse, light for two-weapon fighting, two-handed, reach, loading, range and its disadvantage, versatile,
  heavy armour's STR); no magic bonuses or ability stats on gear yet; hero classes (abilities, hit points, proficiencies, features) in
  `src/data/classes.json`; feats (the Baldur's Gate 3 list: requirement, the ability each raises, `worked`, effects) in
  `src/data/feats.json`, read by `src/rules/Feats.ts` and summed per hero as `FeatEffects` (`featEffects` in `rules/Build.ts`;
  Passive Feats have their own section in the Skills tab: a toggle one is bound to the quick bar as `feat:<id>` and its key
  switches it, `player.featsOn`; an `active` one (Charger) is used with its key and recovers, `systems/FeatActions.ts`; what a
  feat asks the player to pick — Magic Initiate's cantrips and spell, Spell Sniper's cantrip, Weapon Master's weapons, an
  Elemental Adept's damage type — is offered in the level panel (`ui/FeatPicks.ts`), checked by `rules/FeatPicks.ts` and kept
  as the Improvement's `picks`; a feat's spells sit in the Skills tab's Feat spells row, are bound at their own level, count
  against no bind limit and are cast with the feat's ability, `spellcastingFor`; the Skills tab runs: class features, the
  school, Passive Feats and feat spells, then cantrips and each spell level; only `worked` feats are offered, `OFFERED_FEATS`); enemies' SRD monster blocks (AC, abilities, weapons, hit points, XP) in `src/data/stats.json`
  (with which kinds carry a bow or crossbow and how often, `ranged`, and which cast spells as what class and with which
  ability, `spellcaster`: their spells are the heroes' own from `spells.json`, cast at the party's level, so a change to a
  spell changes it for both); how hard a level is (more and tougher enemies the deeper it lies and in direct proportion
  to the heroes playing, which kinds turn up at which depth) in `src/game/Difficulty.ts`;
  castable spells (dice, recovery, save, area and its shape — sphere, cube, cone or line (Lightning Bolt), `rules/SpellArea.ts`, shared by the heroes, the enemies and the aim guide — effect; a buff, zone or puddle's duration and concentration) in
  `src/data/spells.json`; every spell of Baldur's Gate 3 the game knows (name, level, school, the classes that learn it,
  the Eldritch Knight's, its BG3 text and icon) in `src/data/spell-list.json`, made by `scripts/bg3-spells.mjs` from the BG3
  wiki (it matches spells to the icons `scripts/spell-icons.sh` pixelates in `public/spells-icons` into
  `<name>_pixelart.png`, lightly and at twice the size, for tooltips; the class features' icons lie flat in
  `public/class-features-icons` as `<class>-[<subclass>-]<feature>.png` beside a `_pixelart` copy made the same way, by
  `scripts/class-feature-icons.sh` from what `scripts/download-class-features-icons.py` downloads from bg3.wiki, and which
  feature shows which icon in `src/data/feature-icons.json`, made by `scripts/feature-icons.py` (by name, the rest by its `ALIASES`); only spells with numbers in `spells.json` are cast, the rest show greyed out, not in the game yet);
  the D&D rules behind them (range in feet and px, dice, damage types, text, At Higher Levels) in `src/data/spellbook.json`,
  made by `scripts/scrape-spells.mjs`; the SRD class features by level (passive, active or info; `worked` says whether the game plays
  them) in `src/data/features.json`; every damage type, weapon and spell, in `src/rules/DamageTypes.ts`; sound effects (clips layered, re-pitched
  and delayed into recipes; each enemy's cries, each spell's cast and impact), the music tracks and the ambient
  beds in `src/audio/SoundBank.ts` (recordings are `.webm`, the long music `.ogg`).
- Type such tables with `satisfies Record<Key, Shape>` so a missing or misspelt key is a compile error.

## 8. Design patterns for 2-D games in TypeScript (as used here)

- **Entity Component System** — entities are plain objects of optional components (`Entity` in
  `src/world.ts`); systems are functions over Miniplex queries, run in a fixed order
  (`src/systems/Simulation.ts`). Add a feature by adding a component, a factory change and a system.
- **Factory** — every entity is created by a factory in `src/entities/` (`createPlayer`, `createMob`).
- **Flyweight / data-driven config** — shared immutable stats (`SWORD_STATS`, `MOB_CONFIGS`, `PROPS`,
  `CharacterDef`s) referenced by many entities.
- **Object pool** — reuse hot-path objects (`BoxPool`, the darkness and light sprite pools, scratch vectors).
- **Spatial partitioning** — rbush R-trees for senses and proximity checks: what moves is indexed afresh every
  tick; what stays put (floor items, things to use, nests, torches) has its own tree, rebuilt only when one comes or goes.
- **Fixed-timestep game loop** — simulation advances in whole ticks; presentation runs once per frame;
  animation is driven by ticks, never by Pixi's shared ticker, so pause and co-op stay in sync.
- **Command** — input becomes data (`playerInput`, one-shot `intents`) that systems consume; the same
  path serves co-op guests, whose input frames and shop/equipment commands the host checks and applies.
- **Strategy / Utility AI** — interchangeable tactics (`direct`, `flank`, `support`) scored by Yuka
  `GoalEvaluator`s; the arbiter picks the best one for each enemy in a squad.
- **State** — scenes (`SceneManager`, with overlays such as settings over the pause menu) and enemy behaviour
  (`ai.state`: idle → alert → engage → search, run by Yuka's `StateMachine`) are explicit states.
- **Observer** — narrow callback hooks (`coop.onState`, `coop.onStart`, `sound.onEffect`) instead of globals; whoever
  installs a hook clears it only while it is still theirs (the next scene is built before the old one goes).
- **Dirty flag** — `level.tilesDirty` triggers terrain rebuilds only when tiles change.

## 9. Project map

- `src/world.ts` — Miniplex world, `Entity` component types, shared queries `q`.
- `src/systems/` — gameplay and presentation systems; `Simulation.ts` orders them. Using things goes through
  `playerUsing` (`TargetSystem.ts`): each press of "use" goes to one thing, the one the corner brackets frame
  (`MarkerSystem.ts`; `resolveUses` decides it each tick), items on the floor included. Spells and arrows stop on the
  boxes bodies bump into (`Level.blocksPoint`), not on whole wall tiles. The heroes come into a level by the stairs
  of a portal in the safe room's north wall (`portal_stairs`, they start before it) and leave by the dark portal in the exit
  room's (`portal_dark`; the castle tileset's great arches, a candelabra either side, mist breathing out of the doorway, the fog's drifting
  cloud in two thin rising sheets fading out on every side (rising out of the steps from nowhere), `systems/MistSystem.ts`; the campfires smoke, `entities/Smoke.ts`). Leaving a level goes through the exit room
  (`ExitSystem.ts`): using its portal (the `exitButton` entity, no picture of its own, its body the arch) asks only the heroes standing in that room (and whoever walks in before it is settled)
  whether to go deeper or end the run; deeper needs all of them, and whoever is outside then is left behind, dead. Its
  lever (`LeverSystem.ts`, `lever.exit`) drops the room's portcullis 5 s after one pull, for good (`DoorSystem.ts`, `door.exit`).
- `src/ai/` — enemy AI: `perception/` (rbush index, sight, player trails) → `decision/` (Yuka
  `StateMachine` states, squad tactics by Yuka `Think`, each squad member's place in a ring round its target,
  `surround.ts`) → `execution/` (Yuka steering).
- `src/level/` — `Level` tiles, `TileGraph`/`TileSearch` (Yuka graph search), procedural generation
  (`generators/`: BSP rooms, some with a corner or two cut back into the wall, squared off or on the slant, each dressed by
  theme — crypt, storeroom or plain hall with a colonnade and floor grates — with brick or cobblestone walls,
  `level.cobbleWalls`; now and then a corridor runs down the slant between two rooms lying diagonally apart,
  `generators/Slants.ts`), shaped pits (`PitShapes.ts`: square, lobed or quatrefoil on 2×2
  Hole tiles; `level.overPit` tests the drawn shape, for falling in, keeping enemies out and hiding a faller), terrain
  autotiling and rendering (`TerrainAutotile.ts`, from `public/catacombs/mainlevbuild-isometric.png`: the original tileset
  with slanted faces, rims and arched pieces added under it, `SlantTiles.ts`). Slanted walls (`level.slopes`, `Slopes.ts`, in
  every theme: two tiles across for every tile down) push bodies back over the slant (`Level.pushOutOfSlopes`) rather than
  blocking whole tiles; a north one shows its face on the slant, a south one a rim that feet reach WALL_SINK behind (into the
  wall tile under it, `Level.slopeRow`) and that is drawn over them, as a straight south wall is. The castles' south walls
  (straight or slanted) are drawn a little higher over the floor (`SOUTH_WALL_RAISE`, `Theme.ts`; drawing only, not where
  bodies stop), and faces and slanted faces are drawn among the entities (`faceDepth`), in front of the dark of whatever lies
  north of them; a slanted face that ends with no face running on gets a straight face's end column. Walls, columns and
  rock spires (`PropDef.seeThrough`; only their base stops bodies, so one walks on behind them) clear in a soft ellipse
  over the heroes and foes standing behind them near the hero followed (`render/SeeThrough.ts`, `render/RevealFilter.ts`,
  `systems/SeeThroughSystem.ts`; every wall piece the ellipse spans clears, so a slant's pieces at their several depths clear
  as one), easing in and out; the floor runs on under south walls so it shows there, and the dark
  beyond the walls and off the map is the theme's void colour (`THEME_VOID`). Feet over a chasm's north rim stand on it. A level is built as the
  catacombs or a castle (`Theme.ts`, `level.theme`, `run.theme`; the ~ console's `/dungeon catacomb | castle | castle2 | mines` rebuilds the
  level as either): a castle uses only `public/castle` (its tileset's `-isometric` copy) — its tileset's pieces are mapped in `CastleTiles.ts` (stone faces
  with pilasters (also framing each decorated stretch), windows and arrow slits, arched alcoves (candles stand lit in them),
  ornate panels and gothic windows (candelabras beside them) as `wallDecor`, the great arch over passages, its legs on the
  walls beside them, stairs across north–south passages, its floors, pools `level.pools` (nobody wades in; spells and arrows
  fly over them) and 4×2 spike pits), its decor
  are the `castle_*` props (flags hang on square columns, mount `front`), and wall candles and candelabras (lightB,
  lightA) light it in place of torches and candles; its safe and exit rooms keep their own design. The third theme
  (`castle2`, `/dungeon castle2`), is the isometric castle of `public/castle-izometric` alone: its art is mapped in `IsoTiles.ts` and laid
  by `IsoTerrain.ts` (a wall with floor below shows its face two tiles tall; north slants show their face on the slant, south
  ones a rim; every other edge of the dark is rimmed, chasms more darkly; the rims along a room's south side and a chasm's
  north rim are drawn over the feet of whoever steps up to them; columns sink into the deep dark, under a rim now and then
  but never at its corner, and out in the dark on their own, never behind a face), its rooms dressed by
  `generators/IsoDresser.ts` (long slanted corners, chasms and pits of `Hole` tiles that belong to no pit — nobody steps in,
  sight and shots cross — floor tones `level.floorZones`, decor set into the faces as `wallDecor`, kept off a face's ends,
  crystal braziers and candles for light, its own foes `shade` and `grick`, `characters/IsoFoes.ts`; more
  corridors run down the slant than in the other themes; where a straight corridor two tiles wide comes out through a room's
  north wall a gateway stands over it, `layGateways`: an arch, the arch with its doors open, or the arch barred by a grate
  (its tiles `Obstacle` with a strip at their foot, seen and shot through, kept only where there is another way round) —
  the `iso_gate_*` props, made of the sheet's straight pieces by `scripts/iso-gateways.py` into `gateways.png`). Its stairs (`level.stairs`: the U-shaped block of `mainlevbuild1.png` is stairs, never
  face decor) lie only across straight north–south corridors two tiles wide (its middle, the steps; for now never in an
  east–west one). The fourth theme, the forgotten mines (`mines`, `/dungeon mines`), is built from the cave set of `public/caves2`
  alone, on a bigger map of smaller caverns joined by many corridors down the slant (`THEME_CONFIG`): no cavern is a rectangle
  (`generators/MineDresser.ts`): its corners are cut on the slant, spurs of rock jut from its north and south walls
  (`cutSlantSpur`, `generators/Slants.ts`), the rock steps forward along them and bulges from its sides, outcrops stand in the
  bigger ones, and nothing (rock, drop, fence) may cut a part of it off from the rest (`keepWhole`, Yuka BFS); their faces
  (`MineTerrain.ts`) stand four tiles tall over the dark rock tops, cut short where whatever lies close behind leaves less rock
  (the lip of the face kept, the rim of the rock behind it over the cut; no end drawn where a face runs on into a slanted one);
  the rock tops are the set's faint dark cobbles, cut by world position so every piece of them runs on (`MINE_FILL`), rimmed
  with rings of stone on every side floor touches (the west and east rims the north one turned), knotted where rims meet;
  patches of other earth lie about (a `FloorZone` with `patch`, a ragged ellipse), and where tones of earth meet the edge wanders
  across the tiles (`MineGround.ts`: a dual grid of cells between tile middles, each tone's share fading from its corners and
  moved by world-position noise; the cuts baked into one atlas by `render/MineGroundAtlas.ts`); an abyss with ragged edges and a
  rock bridge, or a great ragged pit grown up to a ledge a tile wide along the rock, is a drop anyone falls into (`OPEN_CHASMS`,
  `Theme.ts`: no box stops them), drawn as the set's pit is (pebbles round its brinks, dark thorns over the floor along the north
  one, a cliff of grey-blue cobbles under it fading into the dark, and out at a side where no cliff runs on), fenced only along
  stretches of its straight brinks (a fence blocks the strip at its foot), old pit props sinking into its dark; holes a body's size and bigger open in the floor (pits of shape `hole`, `PitShapes.ts`, their art
  and open dark in `MINE_HOLES`, `MineTiles.ts`; feet over the dark fall in); the old timbering (whole frames only, never the
  sheet's loose beam heads and lengths) stands against faces of full height, lanterns of cold light that flicker (no torches) on
  posts and hung on the rock with cobwebs and bracket fungi, and rocks, stones and rubble (their bases measured from the art, as
  deep as their bulk stands, so nobody stands inside one), stalagmites, mushroom tables and roots strew the floor, reeds, flowers
  and mushrooms grow in clumps by the brinks of drops and holes, the rock's feet and the edges of other earth, pebbles and small
  stalagmites gather at the rock's feet (wall props hang as high as `PropDef.hang` says). Where two slants meet back to back (a spur's point) each corner of a body is pushed
  back by the slant it lies over (`Level.pushOutOfSlopes`). Soft edges between kinds of ground (`GroundBlend.ts`: the softer, mossy patches included, runs over the harder along a
  ragged line that wanders by world position and runs on from tile to tile; baked into one atlas by `render/BlendAtlas.ts`), fog of war (`FogRenderer.ts`: per-corner fading buffer, blurred, with
  drifting mist), lighting (`LightRenderer.ts`: a dim ambient multiplied over the scene; every flame, the torch each hero carries
  included, breathes in reach and brightness on three out-of-step waves; crystals shine steadily), and `LevelMap.ts` (a generated
  level as validated JSON, gzipped to send or save).
- Now and then (`CAVE_ZONE_CHANCE`, `DungeonBuilder.ts`) a catacomb level (its maps are bigger, 112×52, `THEME_CONFIG`) runs
  through caverns in its middle (`generators/CaveZone.ts`: the rooms in the middle band of the map become caves, `room.cave`,
  furnished as cave halls, `level.caveZone`): a ragged chasm runs down through them from the top of the map to the bottom
  (`Hole` tiles of no pit, a drop, `OPEN_CHASMS`: whoever steps out over its dark falls, a little reserve at a brink but
  none off a bridge's edge; tiles of ground it leaves jutting into it fall in too), wide through the biggest cavern, crossed by wooden
  bridges (`level.bridges`, floor nothing is set on) only where they are needed to reach everything; floor it cuts off is
  lost to it. The caverns are drawn from the cave set `public/caves/MainLev2.0.png` (`level/CaveTerrain.ts`): rock walls of
  heaped stones (their rims and cliffs read quarter by quarter from the dark rock block, the side rims' stones spilling a
  few pixels over the ground so the edges wander — drawn from the block with its black cleared, `cave_rock_cut`, and
  stopping bodies only where its stones are, below a wall's top edge, `level/CaveShape.ts` — as do the stones at a cliff's
  foot; a corridor down the slant leans: its rim (with the dark under it) or cliff is the rock sheared down the slant at
  load, `cave_slant_*`, `buildCaveSlants`, with the rim or cliff's end where it meets open ground; where the caverns meet the catacombs the bricks end in their edge), cave ground with patches of
  purplish heath, the chasm drawn from the set's chasm block (its ragged brinks cut from the block's ring with the ground cleared,
  `cave_brinks`, `buildCaveBrinks`, over the ground beside it; the cliff falling into the dark under ground to its north; the
  even dark of the block's middle), and the bridge's planks (their
  ends resting on the ground beyond the brinks, under the rock where they run into a wall) and legs (only where all below is
  dark); the rock spires block a broad base (`spireBase`, `Props.ts`); the catacombs' torches, hangings and
  spike traps stay out of them.
- Animated decor stored one frame per file (`public/catacombs` torches and candles) is padded to one height with the base
  at the bottom, so only the flame moves; the catacombs' spikes (`spike_0…4.png`) are laid two by two into a tile's frame
  by `scripts/spike-sheet.py` (`public/catacombs/spikes.png`). The catacombs' rooms have their wooden pillars (`POSTS`: solid,
  never cleared over) and stone columns standing about them, their faces hung only with their own iron
  (`CATACOMB_FIXTURES`, no trophies or armour; every other tile at most, beside torches and over anything low at the
  wall's foot) and now and then a barred gate (`barred_gate`, from the tileset, with the wall top's black behind its bars,
  `PropDef.backing`, and blue fire burning beyond them, `PropDef.fire`, `entities/WindowFire.ts`, its foot hidden by the
  sill); drain grates keep a tile clear of any wall; their faces also show stretches with vents and dark cracked stretches (`TerrainAutotile.ts` face
  styles), and where a wall juts out past another's face it ends in its edge strip all the way up its face
  (`shallowerFace`) and on up to the wall's north edge (`seamW`/`seamE`). Wall torches and campfires throw sparks from their flames, now and then an ember dropping to the
  floor (`sparks`, `systems/VfxSystem.ts`: the NixieFX effects `vfx/torch-sparks.json` and `campfire-embers.json`, one unit 16 px
  with y up, played at the root's origin, moved on a tick at a time). The wizard's spells, cantrips to the 6th level,
  play particles their whole course (`render/SpellVfx.ts`, `SPELL_VFX`): a flare in the hands as a flying spell leaves them,
  the projectile itself as particles (no sprite, no caster's bolt art: every screen follows the projectiles it has, guests'
  from the host's state), its impact where it ends, an area spell's burst over the whole of its area (a cone's or a line's
  from the hands — Burning Hands, Cone of Cold, Lightning Bolt —, one thrown at a point after a flare in the hands; Chain
  Lightning's bolt from above on each body it catches, `strike`), a buff's flash round the caster as it is cast (no library halo with it) — Blade Ward, Shield and Stoneskin keep an aura round the hero
  while they last (`BUFF_AURAS`), Mage Armour shows only as it is cast —, a zone's particles over it while it lasts (Cloud of
  Daggers, Cloudkill), a healing spell's light round each hero mended (Prayer of Healing); each spell its own look, after its description
  and Baldur's Gate.
  One-shots are asked for with `playVfx` (`render/VfxPlayer.ts`): the co-op host sends each guest only a short `vfx` signal
  (which effect, where, which way) and every screen renders it itself. A spell without particles plays its library effect.
  The library's circle of spawn lies flat to a 2-D view: turn it into the screen's plane (`SCREEN_PLANE`, the script). Campfires stand on a ring of cobbles
  (`campfire_floor`, built at load in `assets/AssetLoader.ts`). Coffins and sarcophagi are searched like
  other stashes and may hold gear (`TOMB_GEAR_CHANCE`, `entities/LootFactory.ts`). A spike trap in a
  corridor (`spikeTrap`, `systems/TrapSystem.ts`) bites the first hero to step on it, told over their head and in the
  combat log, and stays up, harmless, after.
- `src/characters/` — side-view `CharacterDef`s (`Heroes.ts`: the main characters from `public/main-characters`; clips may
  be grids read row by row, or a frame range of a sheet; casters carry a `bolt`) and their animation-state triggers.
- `src/rules/` — the tabletop rules: dice (`Dice.ts`: d4–d20 rolls, attacks, checks; tests load the dice with
  `useDieRoller`), ability modifiers and proficiency (`Abilities.ts`), the SRD weapon and armour tables, classes
  (`Classes.ts`) and monsters (`Monsters.ts`) read from `src/data/`, `CharacterSheet.ts` (Armor Class, weapon
  damage and to-hit, the critical range, the attacks a swing makes and the off-hand blow of two-weapon fighting,
  proficiency, for heroes and enemies) and `Combat.ts` (one blow: d20 vs AC, then damage).
  Items name their rules entry with `base` and their magic with `bonus` (+0…+3) in `src/data/*.json`. Every blow
  in play goes through `systems/Strike.ts`, which logs the roll over the attacker's head (`RollLogSystem.ts`,
  drawn by `RollTextSystem.ts`) and into the level's combat log (`CombatLogSystem.ts`, one synced entity, shown by
  `ui/CombatLogPanel.ts`; `recordEvent` also writes rests, healing, kills, levels and level-panel choices, `LOG_EVENTS` in `world.ts`), and spends a won initiative's first strike as advantage (`systems/InitiativeSystem.ts`).
  Spells (`Spells.ts`, from `src/data/spells.json`: bolt, missiles, burst with a save, heal; buff, zone and water last, in
  `systems/LastingSpells.ts`: buffs on the caster (`buffs`: Blade Ward, Shield, Mage Armour, Stoneskin; False Life's temporary
  hit points), zones that strike every 6 s (`zone`, `q.zones`), puddles a thunder or lightning spell charges (a lightning bolt flying over them too) and that conduct the burst that
  charged them to everyone standing in them (`electrifyArea`, `conducted`) (`surface`, `q.surfaces`),
  and one spell held by `concentration` that a failed Constitution save on every hurt ends (DC 10 or half the damage,
  whichever is higher, `keepConcentration`); what lasts until a long rest also
  ends on a fall, `endUntilRest`) have no slots but a
  recovery each (`spellbook.recovery`), sit on the quick bar (two rows of ten at most — the player picks how many squares show, for each hero class, and Shift's row shows as many; the keys past them do nothing —: Q R T 1–5 X C cast the first row's squares — held, the key shows the spell's aim guide, let go, it casts —
  Shift with them the second, whose squares hold the active class features until bound; `playerInput.spellSlot`) and are cast by
  `systems/SpellSystem.ts` with effects from the library (`assets/Effects.ts`). `Spellbook.ts` reads the whole list: a class opens
  spell levels as the tabletop does, a cantrip's dice grow at hero levels 5/11/17, and a spell cast above its own level
  (the Skills tab of the inventory offers a box per level, `ui/SpellsPanel.ts`) rolls more and recovers more slowly. A click (the inventory stays open, shaded, the quick bar brought in front of it, `HudPanel.front`) binds it
  to a quick-bar square (`game/SpellBinding.ts`, `spellbook.bound`, the `bind_spell` command), and a right click on a square empties
  it (`UNBOUND`, the `unbind_spell` command; nothing comes back in its place); only a spell with its numbers in `spells.json`
  is bound and goes off (`castable`; a heal with a `radius` mends every hero within it). Damage reaching a hero carries its
  type (`hurtPlayer`): resistances halve it and immunities take it all (`rules/Resistances.ts`, listed in the Armor Class
  tooltip, `sheet.defences`). Tooltips with
  more to tell show it while Alt is held (`ui/InfoTooltip.ts`; a long text with no `more` of its own is cut short by itself),
  laid out as Baldur's Gate's: the title, a quiet `subtitle` (what kind of thing), a large `headline` ("3-18 Damage" over
  "3d6 Acid", each damage type in its colour), the text with its dice, saves and distances lit (`ui/TipText.ts`), and
  short facts in framed `chips` ("60 ft", "DEX save"; never pixels). The inventory stands at the top of the screen, clear
  of the quick bar's strip (`QUICK_BAR_HEIGHT`); the HUD's buttons say what they are under the pointer. Class features (`rules/ClassFeatures.ts`) fill the Skills tab above the cantrips: a worked passive is on from its
  level and a click switches it off and on (`featuresOff`, the `toggle_feature` command; `featureOn` is what effects ask, and the
  HUD's top left shows the ones on, `ui/PassiveHud.ts`: icons only, stacked down a column, what is the hero's for good
  (passives, Passive Feats, the ward, a Battle Master's dice) at the top and what comes and goes (boosts, buffs, concentration)
  under them; a clock over an icon empties while it recovers or lasts, a count sits in its corner, and its tooltip under the
  pointer says how it stands now); an active (Second Wind, Action Surge…) is bound to a quick-bar square as
  `feature:<id>` and used with the cast key (`systems/FeatureSystem.ts`; an active with several uses recovers in its share, `featureCooldown`).
  Every blow of a chain plays at the hero's own swing pace, one after another (`blowTiming`; the attack clip follows
  `swordSwing.tempo`), and the next click waits for the attack period. Action Surge doubles the attacks of every swing and
  volley for 6 s (`actionSurge`), each blow at twice its pace (`attackTempo`); Remarkable Athlete doubles the speed for 6 s (`athleteBoost`); Indomitable rerolls a failed save
  (`heroSavingThrow`) then recovers 30 s (`indomitableCooldown`); a rest makes all of them ready.
  A swing is a chain of blows (`swordSwing.blow`/`blows`: Extra Attack, Improved Extra Attack at 11; the first blow also strikes with the off-hand weapon, `systems/SwordSystem.ts`); a bow looses a
  volley (`volley`, `ArrowSystem.ts`). Every attack, the heroes' (`swordCooldown`, `arrowCooldown`) and the enemies' (`attackCooldown`),
  comes once an `ATTACK_PERIOD` (60 ticks, `entities/WeaponStats.ts`), with the blows of a chain or volley spread inside it. The Fighter's Martial Archetype (`rules/Archetypes.ts`; only the Champion is on offer
  for now, `playableArchetypes`, given at level 3 by `grantArchetype`; with more than one it is chosen in `ui/LevelChoices.ts`) gates features by `needs` in `features.json`: the Champion's critical range and Survivor, the Battle Master's
  superiority dice and maneuvers (`rules/Maneuvers.ts`, `systems/ManeuverSystem.ts`: a maneuver is readied from the quick bar and
  spends a die on the blow or the enemy blow it waits for, `Reactions.ts` for Parry and Riposte; marks on foes are the `status` component),
  and the Eldritch Knight's wizard spells (`rules/KnightSpells.ts`, a spell list of its own in `Spellbook.ts`, War Magic after a cast).
  The Wizard follows Baldur's Gate 3 to level 12: it sees the whole wizard list (greyed above its level) but keeps only as many
  cantrips and spells of each level bound as its level allows (`rules/Schools.ts`, `roomToBind`; counted at the Skills tab's top
  right); Arcane Recovery readies the spells of 5th level and below, 60 s less 6 s a charge (`cuts` in `features.json`; `logOnly`
  entries are told only in the level panel). Its school, chosen at level 2 like an archetype (`WIZARD_SCHOOLS`), has a Skills tab
  section of its own (Transmutation is not offered for now, the Savants are left out); a wizard starts with an empty quick bar;
  the schools play out in
  `systems/SchoolSystem.ts` (`arcana`: Arcane Ward, fed by Abjuration spells, Portent, charms through the `status.charmed` hold,
  Illusory Self, Split Enchantment, Sculpt Spells' bubble (`sculpt`: heroes in it succeed on every save), Create Water's
  puddle, the Third Eye's darkvision (the fog lifts twice as far) and the sight of the invisible,
  Bladesong (a feature used by `charges`, shown on its square) with its Bladesong Charges and Climax, Song of Defence, the
  Transmuter's Stone, Grim Harvest, Empowered Evocation, Potent Cantrip; Focused Conjuration and Inured to Undeath work through
  concentration and resistance; a turn is 6 s and a rest's charge a cooldown), Improved Minor Illusion's dummy in
  `systems/DecoySystem.ts` (`decoy`; the foes it `lured` go for it and strike nothing else until it is gone) and Animate Dead's
  undead in `systems/SummonSystem.ts` (`entities/SummonFactory.ts`, `q.summons`: one for every three wizard levels, the oldest
  crumbling for a new one; they follow their master and fight; foes touching one strike it). A feature with no
  counterpart in the game yet is an info entry, `worked: false`.
  Experience follows the SRD
  (`game/Progress.ts`, monster `xp`; heroes stop at `LEVEL_CAP`, 12 for now, while the tables keep all 20 levels); hit points (SRD, unscaled: hit die + CON at level 1) and hit dice are in `rules/HitPoints.ts`.
  Spells go on the quick bar only in a safe room (`player.inSafeRoom`, `systems/SafeRoomSystem.ts`); class features anywhere.
- `src/audio/` — Howler: `SoundBank.ts` (the effect recipes, music tracks and ambient beds), `SoundPlayer.ts` (effects,
  faded and panned by distance; `playSound` is relayed to co-op guests, `playLocal` is not), `Deck.ts` (one looping
  piece, faded in and out, paused when silent), `MusicPlayer.ts` (one track at a time, crossfaded; menus play `menu`,
  the intro crossfades the film's sound in and out, levels play `explore`, `systems/MusicSystem.ts` switches to
  `combat` or `boss` while enemies nearby are engaged and holds `rest` / `lament` on the level's summary (the exit
  button's question) and the end of a run) and `AmbiencePlayer.ts` (beds by area and nearness, driven by `systems/AmbienceSystem.ts`). Nothing sounds before the
  player's first click or key: `AudioUnlock.ts` holds music back until Howler has unlocked the audio on it. Only the art
  and the menus' sounds load behind the loading screen in `index.html` (`ui/LoadingScreen.ts`); audio is otherwise
  lazy: the other effects load in the background once the title is up, a bed when first heard, music streams.
- `src/entities/` — factories and stat tables. The safe rooms' trader (`entities/Trader.ts`, `public/trader`; animated by
  `systems/TraderSystem.ts`: it idles, throws its coat open when its panel opens and holds it open, closes it when the panel
  closes, nodding if they traded) sells everything there is for now (`SHOP_ITEMS`) and has a purse of its own
  (`shopNpc.gold`, `TRADER_GOLD`). Its trade screen (`ui/ShopPanel.ts`, as in Baldur's Gate 3: its wares left, the hero's bag
  right, the trader and both sides' gold between; each column with the inventory's filters and search; a row's icon, a line of
  what it does (`ui/ItemSummary.ts`) and price, the inventory's tooltip under the pointer) asks before each trade; it buys for
  half the price, `SELL_SHARE`, and offers what it bought back once, `shopNpc.resale`. Heroes set out with 10 gold
  (`STARTING_GOLD`) and one of each weapon, shield and armour they are trained in, as long as it does not slow them
  (`giveStartingKit`); past 80 % of what they carry they slow, to a walk with no sprint at all of it (`rules/Encumbrance.ts`).
  Blood splashes from a hero or a foe a blow
  hurts (`entities/Blood.ts`, `public/blood`, small). `src/render/` — sheets, camera, terrain layers.
- The picture is 16:9 (`render/Camera.ts`), wider (up to 21:9) only on an ultrawide monitor, by the monitor's shape, not the
  window's; the window shows it as large as fits, with bars. In a level the mouse wheel zooms the world (not the HUD) in and
  out between the picture as made and twice as close (`camera.zoom`, `zoomBy`; `screenToWorld` follows it); the game layer
  and the light overlay are scaled, the camera follows the hero over the smaller stretch of world in view.
- While the hero aims, a faint guide (`systems/AimGuideSystem.ts`, drawn over the light and fog, `overLayer`) shows where
  it goes, for the spell being cast or whose quick-bar key is held, else the bow or crossbow in hand: a shot that flies
  straight (a bolt, darts, an arrow) is a dotted straight line from the hands (AIM_HEIGHT, where shots leave) through the crosshair, as far as it flies (where
  it goes off if it strikes nothing), grey, amber past a bow's normal range (disadvantage); a spell with an area shows only
  that area — a circle, a square (cube) or a cone from the hands — where it will go off (aimed past its reach, as far that
  way as it reaches), a mark under each enemy it would catch, and how far off it is, in feet. A quick-bar square recovering shows its time left over its shade (tenths under 10 s). A class feature bg3.wiki
  has no icon for shows another feature's of a like name, each borrowed icon shown by that feature alone
  (`scripts/feature-icons.py` `BORROWED`). The exit room has one campfire, in its middle, and a candelabra either side of
  its gate inside it (its lever beside the upper one).
- Enemies with a bow or crossbow and enemy spellcasters (`systems/EnemyRangedSystem.ts`) shoot and cast only at a hero
  in sight whose screen shows them (never from off-screen), stand to do it, lead a moving target and pick the spell that
  harms most (a burst by how many heroes it catches); their shots are the heroes' bolts and arrows on the enemies' side
  (`Team.Mob`), striking heroes; they draw no aim guide. The level's summary (the exit's question) is a victory panel
  (`ui/ResultPanel.ts` `victory`) with one button, Go to next dungeon, and a table of each hero's kills, experience,
  damage dealt, natural 20s and 1s on this level (`playerStats.damageDealt`, `critHits`, `critMisses`). The training dummy
  stands still until struck, then plays one of its three hit rows (a heavy blow spins it, `systems/DummySystem.ts`);
  Burning Hands is a cone of flame particles from the caster's hands towards the aim (`vfx/burning-hands.json`, played by
  `playBurstArt` in `systems/SpellSystem.ts`). The combat log lies under the HUD, so tooltips and dialogs open over it; its header's − and + step it through `LOG_SIZES` (kept as `settings.combatLogSize`), and an entry too long for it wraps under itself, set in.
- Enemies walk on steadily (no limp: `MOB_CONFIGS` speeds are their steady pace), and one whose place in the ring round its
  target lies further round walks round to it on a wider ring (`RING_WALK_ROUND`, `ai/execution/pursuit.ts`) rather than
  pressing into the target's body. An enemy knocked back hard by a blow may be driven over a pit's or chasm's edge, and falls (`MovementSystem.ts`
  `KNOCKED_OVER_SPEED`); walking, enemies keep out of holes. A spike trap springs under feet two pixels inside its tile.
- `src/core/` — cross-cutting: `errors/`, `log/`, `geometry.ts`, `guards.ts`, `debugHooks.ts`, `compression.ts` (gzip with a size limit).
- `src/game/` — game loop, `SceneManager`, persisted settings, the player's own preferences kept between games
  (`game/profile/ProfileStore.ts`: the abstract `ProfileStore` of JSON documents, `LocalProfileStore` in localStorage beside
  the saves by default — to keep them elsewhere (Firebase), extend it and call `useProfileStore` at start-up —;
  `QuickBarProfile.ts`: for each hero class how many quick-bar squares show and three presets of the whole bar, loaded with
  `loadBindings` (the `load_bindings` command) in a safe room only, a square it cannot bind any more left empty), player actions (item gifts too), the party's votes
  (`Party.ts`: one synced `party` entity; rests and the lever ask through it, and act once everyone agrees), death
  (`Fallen.ts`: a hero who dies or falls into a pit stays down until the party goes deeper, leaving their gear and gold
  on the floor; the fallen get no share of experience or gold and no say in votes or loot rolls; the run is over when
  the whole party is down, and `Run.ts` `descend` brings the fallen back with their experience but nothing else (every hero
  keeps their quick-bar bindings and switched features and feats); in co-op
  the fallen watch their companions, `Spectate.ts`), resting (`Rest.ts`: short and long rests; in a short rest each hero
  spends the hit dice they chose as they asked or agreed, and one refusal means nobody rests), pausing (`Pause.ts`: in
  co-op the game stops for everyone while anyone has the pause menu open), payments (`Purse.ts`: kills, chests and stashes pay straight into the
  purse), Need / Pass rolls for rare finds (`LootRoll.ts`) and the ~ console's commands (`Console.ts`; `/freeze` and `/killall` for testing, the switches in `Cheats.ts`).
  Saved games (`SaveGame.ts`: the level's map as it stands, what has been seen of it, every entity of the world as
  `captureWorld` sends it, the run's depth and theme, and the heroes listed for show; `validateSave` checks it all;
  `SaveStore.ts`: kept gzipped in localStorage, the newest `MAX_SAVES`, downloaded and imported as JSON files;
  `SaveRestore.ts`: the world made again from it, every entity id inside components remapped and the host's own
  bookkeeping, `trail` and `mobCaster`, given back). The host or a player alone saves from the pause menu; the title's Load
  game lists the saves (`scenes/LoadGameScene.ts`): Play takes one up alone, Host opens the lobby, where each player is
  shown the saved hero they will take up (`seatsFor`: the host's own, a guest's by name, else by seat; the roster's
  `saved` line) and the level starts from the save. After the first level each level is a dungeon of any theme at random
  (`Run.ts` `nextTheme`). `src/scenes/` — title, settings,
  key bindings, character select, co-op lobby, the load screen and the level itself. `src/ui/` — buttons, HUD (health bar, round
  buttons — the sword opens and shuts the inventory as Tab does —, `HudDialog`, `MinimapView`, `QuickBar`, `RestMenu`, `PartyBanner`, `LootRollPanel`), `PopupMenu`, `HeroPicker`,
  `ConsoleView`, combat log, the inventory (`InventoryOverlay`: three tabs over the gear panel — Character, Skills and Quick bar
  (`ui/QuickBarPage.ts`: the squares shown, the presets with Load, Save and Clear, a second press confirming one that would
  lose something) —, drawn as gothic forged iron round a dark opening (a pinnacle on each cut corner, a crown of spikes over a blood-red gem, an
  engraved groove ending in curls, fangs in the opening's corners, a faint pointed arch with a quatrefoil inside;
  `tabFrameTexture`, made once), not cut from the art; a tab opened rises, its lantern fading up and its gem flaring, the
  one closed sinks (`placeTab`: only sprite positions and alphas each update); the bag filtered, searched as typed — the letters of a name in order,
  `core/fuzzy.ts`, matched ones lit in the tooltip — and sorted by price, weight or training, `game/BagView.ts`, without moving a
  thing; a right-click menu to equip — a weapon in the primary hand or the off-hand — take off, drop, compare or send; a click
  marks an item, Ctrl+click marks a second and the two are compared side by side, the second's AC, damage and weight marked
  better or worse, `game/ItemCompare.ts`; gear the hero is not trained in, `itemTrained` in `rules/Classes.ts`, has a red aura
  behind it), its character sheet (`AbilityGrid`, `SheetField`, `SheetInfoPanel`, `ProficiencyPanel`, tooltips in
  `SheetTopics`; the column scrolls when it is too tall), the lists' scrollbars (`ScrollBar`), panels, pause menu. The game
  draws its own pointer over every scene (`ui/Pointer.ts`, from `public/ui/pointer.png`, made from `public/dng-pointer.png` by
  `scripts/pointer-sheet.py`, lifted and outlined to stand out on the dark; keep the hot spots in step): the hand over menus, the HUD and panels (pressing over anything
  clickable), the battle cross in the world, red over an enemy; the level tells it which (`setPointerAim`). On-screen controls
  call `claimPointer` (systems/InputSystem.ts) while under the pointer, so their clicks are not attacks.
- `src/network/` — co-op: `protocol.ts` (messages and their validators), `CoopSession.ts` (PeerJS room),
  `WorldSync.ts` (the host's world snapshot, its validation and the guest's replica), `CoopGame.ts` (host and
  guest per-tick work). The host is the authority: it sends each guest the level it built (`level/LevelMap.ts`,
  gzipped), guests build it, say `loaded`, and send input; the safe room's lever waits for every guest.
- `tests/gameplay.test.mjs` — Node test runner over the real modules via Vite SSR.

## 10. Working conventions

- Match the surrounding code: comment density, naming, doc comments that explain game intent ("why").
- Keep behaviour identical when refactoring; add or update a test in `tests/gameplay.test.mjs` for any
  behaviour change.
- Do not commit, push or publish unless asked.
