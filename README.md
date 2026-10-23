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

### Releasing

Pushing a version tag publishes the game: `git tag v1.2.0 && git push origin v1.2.0` runs
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which checks and builds it (served from
`/dungeons-and-goblins/`, set by `VITE_BASE_URL`), deploys it to GitHub Pages and makes a GitHub release for the
tag with generated notes. In the repository's Settings → Pages, the source must be "GitHub Actions".

Controls: WASD to move, the mouse to aim, left click (or Space) to attack, Q to swap the 1st and 2nd weapon,
right click / R to cast the spell picked on the quick bar (1–5, or click a square), E to use (shop, chests, the
exit), Shift to sprint, Tab for the inventory, Esc to pause. Keys can be rebound in Settings → Key bindings.

Every game starts with typing your name and picking a hero — **Kaelen** (warrior), **Malkorath** (rogue),
**Malthus** (paladin), **Vesper** (wizard), **Xanthia** (sorcerer), or the Barbarian and the Hooded Knight
(see `classes.json` below) — then the intro plays (`public/intro-video.mp4` under the story; E, Enter or a
click skip it) and the first level fades in. The safe room starts closed: pull the lever by its door (E) to
raise the portcullis. In co-op the lever waits until every player has loaded the level.

On screen: the health bar bottom left, with four round buttons over it — character and level (placeholder
dialogs for now), the map, which shows the explored dungeon with holes and treasure marked (Esc or ✕ closes a
dialog), and rest (the moon: a short or a long rest, see below); the quick bar of the hero's spells bottom
middle (each square shows its spell's effect, shaded while it recovers; hover for what it does); the combat log
bottom right (scroll it with the mouse wheel or its scrollbar; the `–` in its corner folds it away, `+` brings it
back).

The inventory is titled with the hero's name; its sheet shows their level and experience ("XP 450/900") and
their hit dice ("Hit dice 1/2 d6": left of one a level) — click them to spend one and heal (the die + CON).

### Experience, initiative and rest (D&D rules)

- **Experience**: each kill gives its SRD monster's XP (`xp` in `stats.json`), shared among the living heroes.
  Levels come at the SRD totals (300 for level 2, 900 for 3, … 355,000 for 20), each with more hit points (the
  hit die's average + CON), one more hit die and a full heal; spells come at their `minLevel`.
- **Initiative**: when an enemy engages, it and the hero it hunts each roll d20 + DEX ("Initiative 17" over their
  heads). The winner gets the **first strike** — its next attack rolls with advantage. A hero rolls once a fight.
- **Hit dice** are spent (click on the sheet) while no enemy is hunting you.
- **Rest** (the moon button): a short rest recovers every spell — two are allowed before a long rest, and not
  while an enemy hunts the party; a long rest needs everyone in the safe room and heals all wounds, gives back
  half the hero's hit dice and recovers spells. In co-op the others are asked to agree (Agree / Refuse at the
  top of their screen; one refusal or 20 s without an answer calls it off); how it went shows at the top.

## Configuration files (JSON)

Game data you can tune without touching code. Edit a file, save, and the dev server reloads.

### [`src/data/classes.json`](src/data/classes.json) — heroes and their classes

The heroes offered on the character select, each a D&D 5e (SRD) class: `kaelen` (fighter), `malkorath`
(rogue), `malthus` (paladin), `vesper` (wizard), `xanthia` (sorcerer) — their sprites are in
`public/main-characters/<name>` — plus `barbarian` and `warrior` (the Hooded Knight). Each has:

- `character` — the sprite set, `class`, `hitDie` and `hitPoints` (10 × hit die + 5 × CON modifier),
- `abilities` — the six scores (the standard array: 15, 14, 13, 12, 10, 8),
- `armor` (`light`, `medium`, `heavy`, `shield`), `weapons` (`simple`, `martial`) and `weaponBases` (single
  weapons, e.g. a wizard's dagger) — what the class is trained in; untrained armour gives disadvantage on
  attacks, an untrained weapon loses the proficiency bonus,
- `spellcasting` — the ability spells add to hit and to their save DC (casters fly their own spell art),
- `spells` — the spells the hero casts, in quick-bar order (from `spells.json`),
- `savingThrows`, and `features`: `unarmored_defense` (no armour: AC 10 + DEX + CON), `fighting_style_defense`
  (+1 AC in armour) or `sneak_attack` (+1d6 with finesse or ranged weapons).

### [`src/data/stats.json`](src/data/stats.json) — enemies

`mobs.<type>` — one entry per kind of enemy (`goblin`, `orc`, `goblin_grunt`, `goblin_rogue`,
`goblin_warrior`, `ghost_wizard`, `evil_wizard`, …), copied from the SRD monster named in `source`:

- `health` — hit points, `ac` — Armor Class, `proficiency` — proficiency bonus,
- `abilities` — the six scores,
- `weapons` — the low-end weapons it may carry (one is picked at random when it spawns),
- `xp` — the experience it is worth (SRD, by challenge rating),
- `deathPoints` — the worth of the coins it drops when killed (a nest's experience is three times it).

Speed, size and art of each enemy live next to it in `MOB_CONFIGS` in
[`src/entities/MobFactory.ts`](src/entities/MobFactory.ts).

### [`src/data/spells.json`](src/data/spells.json) — spells

D&D 5e (SRD) spells, cast with right click / R; the quick bar picks which. There are no spell slots: each spell
has a `recovery` (seconds) before it can be cast again, and a short rest recovers them all. Each has `kind` —
`bolt` (a spell attack: d20 + proficiency + casting ability against AC), `missiles` (`count` darts that always
hit), `burst` (everyone within `radius` px of the point aimed at, at most `range` px away — or of the caster
when `range` is 0 — saves on `save` against the spell DC: full damage on a failure, half on a success) or `heal`
(the caster regains the dice + casting ability) — plus `minLevel`, `damage` (dice), `damageType` and `effect`:
`[shape, colour]` from the effects library in `public/effects/` ([`src/assets/Effects.ts`](src/assets/Effects.ts)),
played where it strikes and shown on its quick-bar square, sized by `effectScale`.

### [`src/data/weapons.json`](src/data/weapons.json) — weapons

160 entries: the weapons in `public/weapons/` and the loose blades cut from `public/weapons-1.png`. Each item:

| Field | Meaning |
|---|---|
| `id` | Unique key (also used to find the item later) |
| `name` | Name shown in the inventory and tooltips (random placeholder names for now) |
| `icon` | Texture key of its picture |
| `src` | The image file under `public/` (blades from `weapons-1.png` have none: they are cut from that sheet) |
| `kind` | What it is: `axe`, `bow`, `sword`, `wand`, … |
| `base` | The D&D weapon it plays as (`dagger`, `longsword`, `longbow`, …): its damage dice, from `src/rules/WeaponTable.ts` |
| `bonus` | Magic: `0` to `3`, added to hit and to damage |
| `type` | `weapon` or `shield` |
| `gear` | Which slot it fits: `weapon` (primary or secondary hand), `offhand` (secondary hand) |
| `cost` | Price in gold |
| `weight` | Kilograms it weighs |
| `stats` | What it adds while worn: any of `strength`, `dexterity`, `constitution`, `intelligence`, `wisdom`, `charisma` (random placeholder values for now) |

### [`src/data/shields.json`](src/data/shields.json) — shields

140 shields (pictures in `public/shields/`), with the same fields as above (`gear` is `offhand`).

### [`src/data/armors.json`](src/data/armors.json) — body armour

220 suits of armour and robes (pictures in `public/armors/`), with the same fields (`gear` is `armor`;
`base` is the D&D armour — `padded` … `plate` — that sets its Armor Class, from `src/rules/ArmorTable.ts`).

### [`src/data/medals.json`](src/data/medals.json) — medals

80 medals (pictures in `public/medals/`), worn in the inventory's Medal slot, with the same fields (`gear`
is `medal`).

### Carrying

A player carries at most **100 kg** — bag and worn gear together (`MAX_CARRY_KG` in
[`src/game/PlayerActions.ts`](src/game/PlayerActions.ts)); the inventory shows the total next to the gold.
Things too heavy to carry are left lying where they are, and the shop won't sell them. Chests drop a random
weapon, shield or suit of armour (and a few coins); walk over it to pick it up.

### What the stats do

A hero's ability scores are their class's plus what everything worn adds (shown on the inventory's Gear tab
with their modifiers, under them Armor Class, hit points, the weapon's damage roll and the class's
proficiencies). The modifier is what the rules use:

| Stat | Effect |
|---|---|
| Strength | Melee weapons add its modifier to hit and to damage; points on gear also lengthen a swing's reach |
| Dexterity | Ranged weapons add it to hit and damage (finesse weapons use the better of STR and DEX); it raises AC |
| Constitution | A Barbarian with no armour adds it to AC; points on gear give +10 ticks of sprint each |
| Intelligence | A wizard's (and rogue's) spells add it to hit and to their save DC |
| Wisdom | Nothing yet |
| Charisma | A paladin's and sorcerer's spells add it; points on gear: +5% coins dropped by enemies each |

### Fighting (D&D rules)

Every blow — sword, arrow, spell or an enemy's — rolls a d20 + attack bonus (proficiency + STR or DEX + magic)
against the target's Armor Class. A natural 20 always hits and doubles the damage dice; a natural 1 always
misses. A hit rolls the weapon's dice + the same modifier. The rolls show over the attacker's head for a
moment ("21 to hit", then "7 dmg" or "MISS"), and each blow goes into the combat log ("Evincars 21 to hit,
7 dmg", "Orc 12 to hit, miss").

### Maps as JSON

A generated level can be written out as JSON ([`src/level/LevelMap.ts`](src/level/LevelMap.ts):
`encodeLevelMap`, `decodeLevelMap`) — tiles one byte each in base64, safe rooms and cave halls as runs of
tiles, wall niches, pits, prop footprints and spawn points — and gzipped (`packLevelMap`: about 7 KB of JSON becomes about 3 KB) to
save it or send it to a client. The co-op host sends it to every guest when a level starts — terrain, decor and
the safe room's door and lever — and guests show "Loading..." until it has arrived; reading a map checks all of it.

The inventory shows each stat by its short name (STR, DEX, CON, INT, WIS, CHA); hovering it shows the full name and this description, read from `src/data/texts.json`.

Arrows have no item or count: fighting with a ranged weapon (bow, crossbow, pistol, darts — the 1st weapon, or the 2nd when the 1st hand is empty), attacking shoots.

### [`src/data/texts.json`](src/data/texts.json) — every string the player reads

Each text has a short, self-describing id (`stat.strength.name`, `menu.title.start`); code asks for it with `text(id, vars)` from [`src/core/texts.ts`](src/core/texts.ts), and `{name}` marks a value filled in at runtime. To translate, supply a file with the same ids. Key-cap names (ESC, L SHIFT) and developer logs are not in it.

## Other tuning (TypeScript)

Not JSON, but kept in one place each:

- [`src/entities/WeaponStats.ts`](src/entities/WeaponStats.ts) — sword swing, spell casting and arrow timing and reach (damage comes from the rules).
- [`src/game/Rest.ts`](src/game/Rest.ts) — short rests before a long one, how long a rest vote and its notice last.
- [`src/entities/Drops.ts`](src/entities/Drops.ts) — drop tables (what chests throw out).
- [`src/entities/LootFactory.ts`](src/entities/LootFactory.ts) — the coins and gems enemies drop, and how few.
- [`src/level/generators/DungeonConfig.ts`](src/level/generators/DungeonConfig.ts) — map size, room sizes, halls, pits, enemy density.
- [`src/level/Props.ts`](src/level/Props.ts) — every decoration and how often it appears.
- [`src/ai/constants.ts`](src/ai/constants.ts) — enemy senses, squad tactics and chase speed.

## For contributors

The project rules (code style, architecture, libraries) are in [`AGENTS.md`](AGENTS.md); `npm run check` and
`npm run build` must pass before a change is done.
