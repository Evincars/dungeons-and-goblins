<p align="center"><img src="public/logo.png" alt="Dungeons & Goblins" width="560"></p>

# Dungeons & Goblins

A top-down dungeon crawler in TypeScript, Pixi.js v8 and Miniplex, adapted from Catacomb Snatch Redux.
Fight through a procedurally generated dungeon (sword, spells and arrows), loot coins and gear, and take
the exit down to the next level — alone, or with up to three friends in peer-to-peer co-op.

## Running it locally

You need [Node.js](https://nodejs.org/) 20 or newer.

```bash
npm install      # once
npm run dev      # starts the dev server; open the address it prints (http://localhost:5173 by default)
```

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serves the production build locally |
| `npm run check` | Type check, style rules, rules-file sync and the gameplay tests (run before committing) |
| `npm test` | Just the gameplay tests (`tests/gameplay.test.mjs`) |

Controls: WASD to move, the mouse to aim, left click (or Space) to attack, right click / Q for a spell,
E to use (shop, chests, the exit), Shift to sprint, Tab for the inventory, Esc to pause, 1–5 for the quick
bar. Keys can be rebound in Settings → Key bindings.

## Configuration files (JSON)

Game data you can tune without touching code. Edit a file, save, and the dev server reloads.

### [`src/data/stats.json`](src/data/stats.json) — health and damage

- `player.health` — the player's starting health.
- `mobs.<type>` — one entry per kind of enemy (`goblin`, `orc`, `goblin_grunt`, `goblin_rogue`,
  `goblin_warrior`, `ghost_wizard`, `evil_wizard`, …):
  - `health` — hit points,
  - `strength` — damage per hit on the player,
  - `deathPoints` — experience (and the worth of the coins) it drops when killed.

Speed, size and art of each enemy live next to it in `MOB_CONFIGS` in
[`src/entities/MobFactory.ts`](src/entities/MobFactory.ts).

### [`src/data/weapons.json`](src/data/weapons.json) — weapons

160 entries: the weapons in `public/weapons/` and the loose blades cut from `public/weapons-1.png`. Each item:

| Field | Meaning |
|---|---|
| `id` | Unique key (also used to find the item later) |
| `name` | Name shown in the inventory and tooltips (random placeholder names for now) |
| `icon` | Texture key of its picture |
| `src` | The image file under `public/` (blades from `weapons-1.png` have none: they are cut from that sheet) |
| `kind` | What it is: `axe`, `bow`, `sword`, `wand`, … |
| `type` | `weapon` or `shield` |
| `gear` | Which slot it fits: `weapon` (primary or secondary hand), `offhand` (secondary hand) |
| `cost` | Price in gold |
| `weight` | Kilograms it weighs |
| `stats` | What it adds while worn: any of `strength`, `dexterity`, `constitution`, `intelligence`, `wisdom`, `charisma` (random placeholder values for now) |

### [`src/data/shields.json`](src/data/shields.json) — shields

140 shields (pictures in `public/shields/`), with the same fields as above (`gear` is `offhand`).

### [`src/data/armors.json`](src/data/armors.json) — body armour

220 suits of armour and robes (pictures in `public/armors/`), with the same fields (`gear` is `armor`).

### [`src/data/medals.json`](src/data/medals.json) — medals

80 medals (pictures in `public/medals/`), worn in the inventory's Medal slot, with the same fields (`gear`
is `medal`).

### Carrying

A player carries at most **100 kg** — bag and worn gear together (`MAX_CARRY_KG` in
[`src/game/PlayerActions.ts`](src/game/PlayerActions.ts)); the inventory shows the total next to the gold.
Things too heavy to carry are left lying where they are, and the shop won't sell them. Chests drop a random
weapon, shield or suit of armour (and a few coins); walk over it to pick it up.

### What the stats do

Stats of everything worn add up (shown on the inventory's Gear tab) and take effect at once:

| Stat | Effect |
|---|---|
| Strength | +1 sword tier per point (more damage and reach), and +1 arrow damage |
| Dexterity | Each point takes 5% off every hit taken (at most 75%) |
| Constitution | +10 ticks of sprint per point |
| Intelligence | +2 spell damage per point |
| Wisdom | Nothing yet |
| Charisma | +5% coins dropped by enemies per point |

The inventory shows each stat by its short name (STR, DEX, CON, INT, WIS, CHA); hovering it shows the full name and this description, read from `src/data/texts.json`.

Arrows have no item or count: with a bow or crossbow in either hand, attacking looses an arrow.

### [`src/data/texts.json`](src/data/texts.json) — every string the player reads

Each text has a short, self-describing id (`stat.strength.name`, `menu.title.start`); code asks for it with `text(id, vars)` from [`src/core/texts.ts`](src/core/texts.ts), and `{name}` marks a value filled in at runtime. To translate, supply a file with the same ids. Key-cap names (ESC, L SHIFT) and developer logs are not in it.

## Other tuning (TypeScript)

Not JSON, but kept in one place each:

- [`src/entities/WeaponStats.ts`](src/entities/WeaponStats.ts) — sword swing, spell bolt (damage) and arrow numbers.
- [`src/entities/Drops.ts`](src/entities/Drops.ts) — drop tables (what chests throw out).
- [`src/entities/LootFactory.ts`](src/entities/LootFactory.ts) — the coins and gems enemies drop, and how few.
- [`src/level/generators/DungeonConfig.ts`](src/level/generators/DungeonConfig.ts) — map size, room sizes, halls, pits, enemy density.
- [`src/level/Props.ts`](src/level/Props.ts) — every decoration and how often it appears.
- [`src/ai/constants.ts`](src/ai/constants.ts) — enemy senses, squad tactics and chase speed.

## For contributors

The project rules (code style, architecture, libraries) are in [`AGENTS.md`](AGENTS.md); `npm run check` and
`npm run build` must pass before a change is done.
