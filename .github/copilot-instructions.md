<!-- Generated from AGENTS.md by `npm run rules:sync`. Edit AGENTS.md instead. -->

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
  `src/entities/MobFactory.ts` (`MOB_CONFIGS`); dungeon generation in
  `src/level/generators/DungeonConfig.ts`; enemy AI knobs (sight, squad sizes, flanking, trail
  following) in `src/ai/constants.ts`; the D&D rules tables (SRD weapons and armour) in `src/rules/WeaponTable.ts`
  and `src/rules/ArmorTable.ts`; hero classes (abilities, hit points, proficiencies, features) in
  `src/data/classes.json`; enemies' SRD monster blocks (AC, abilities, weapons, hit points, XP) in `src/data/stats.json`;
  spells (dice, recovery, save, area, effect) in `src/data/spells.json`; sound effects (clips layered, re-pitched
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
- **Spatial partitioning** — rbush R-tree rebuilt once per tick for senses and proximity checks.
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
  `playerUsing` (`TargetSystem.ts`), which also picks what the corner brackets frame (`MarkerSystem.ts`).
- `src/ai/` — enemy AI: `perception/` (rbush index, sight, player trails) → `decision/` (Yuka
  `StateMachine` states, squad tactics by Yuka `Think`) → `execution/` (Yuka steering).
- `src/level/` — `Level` tiles, `TileGraph`/`TileSearch` (Yuka graph search), procedural generation
  (`generators/`), terrain autotiling and rendering, soft edges between kinds of ground (`GroundBlend.ts`, baked
  into one atlas by `render/BlendAtlas.ts`), fog of war (`FogRenderer.ts`: per-corner fading buffer, blurred, with
  drifting mist), lighting, and `LevelMap.ts` (a generated level as validated JSON, gzipped to send or save).
- `src/characters/` — side-view `CharacterDef`s (`Heroes.ts`: the main characters from `public/main-characters`; clips may
  be grids read row by row, or a frame range of a sheet; casters carry a `bolt`) and their animation-state triggers.
- `src/rules/` — the tabletop rules: dice (`Dice.ts`: d4–d20 rolls, attacks, checks; tests load the dice with
  `useDieRoller`), ability modifiers and proficiency (`Abilities.ts`), the SRD weapon and armour tables, classes
  (`Classes.ts`) and monsters (`Monsters.ts`) read from `src/data/`, `CharacterSheet.ts` (Armor Class, weapon
  damage and to-hit, proficiency, for heroes and enemies) and `Combat.ts` (one blow: d20 vs AC, then damage).
  Items name their rules entry with `base` and their magic with `bonus` (+0…+3) in `src/data/*.json`. Every blow
  in play goes through `systems/Strike.ts`, which logs the roll over the attacker's head (`RollLogSystem.ts`,
  drawn by `RollTextSystem.ts`) and into the level's combat log (`CombatLogSystem.ts`, one synced entity, shown by
  `ui/CombatLogPanel.ts`), and spends a won initiative's first strike as advantage (`systems/InitiativeSystem.ts`).
  Spells (`Spells.ts`, from `src/data/spells.json`: bolt, missiles, burst with a save, heal) have no slots but a
  recovery each (`spellbook.recovery`), are picked on the quick bar (`playerInput.spellSlot`) and cast by
  `systems/SpellSystem.ts` with effects from the library (`assets/Effects.ts`). Experience follows the SRD
  (`game/Progress.ts`, monster `xp`); hit points per level and hit dice are in `rules/HitPoints.ts`.
- `src/audio/` — Howler: `SoundBank.ts` (the effect recipes, music tracks and ambient beds), `SoundPlayer.ts` (effects,
  faded and panned by distance; `playSound` is relayed to co-op guests, `playLocal` is not), `Deck.ts` (one looping
  piece, faded in and out, paused when silent), `MusicPlayer.ts` (one track at a time, crossfaded; menus play `menu`,
  the intro crossfades the film's sound in and out, levels play `explore`, `systems/MusicSystem.ts` switches to
  `combat` or `boss` while enemies nearby are engaged and holds `rest` / `lament` on the level's summary and the end
  of a run) and `AmbiencePlayer.ts` (beds by area and nearness, driven by `systems/AmbienceSystem.ts`). Only the art
  and the menus' sounds load behind the loading screen in `index.html` (`ui/LoadingScreen.ts`); audio is otherwise
  lazy: the other effects load in the background once the title is up, a bed when first heard, music streams.
- `src/entities/` — factories and stat tables. `src/render/` — sheets, camera, terrain layers.
- `src/core/` — cross-cutting: `errors/`, `log/`, `geometry.ts`, `guards.ts`, `debugHooks.ts`, `compression.ts` (gzip with a size limit).
- `src/game/` — game loop, `SceneManager`, persisted settings, player actions (item gifts too), the party's votes
  (`Party.ts`: one synced `party` entity; rests and the lever ask through it, and act once everyone agrees), resting
  (`Rest.ts`: hit dice, short and long rests), payments (`Purse.ts`: kills, chests and stashes pay straight into the
  purse), Need / Pass rolls for rare finds (`LootRoll.ts`) and the ~ console's commands (`Console.ts`). `src/scenes/` — title, settings,
  key bindings, character select, co-op lobby and the level itself. `src/ui/` — buttons, HUD (health bar, round
  buttons, `HudDialog`, `MinimapView`, `QuickBar`, `RestMenu`, `PartyBanner`, `LootRollPanel`), `PopupMenu`, `HeroPicker`,
  `ConsoleView`, combat log, the inventory's character sheet (`AbilityGrid`, `SheetField`,
  `SheetInfoPanel`, `ProficiencyPanel`, tooltips in `SheetTopics`), panels, pause menu. On-screen controls call `claimPointer` (systems/InputSystem.ts) while
  under the pointer, so their clicks are not attacks.
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
