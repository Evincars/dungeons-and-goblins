import type { InventoryItem, Player } from '../world';
import { characterSheet } from '../rules/CharacterSheet';
import { text } from '../core/texts';
import { createItemPickup } from './LootFactory';
import { ARMORS, HAND_WEAPONS, SHIELDS, randomItem } from './ItemCatalog';
import { pay } from '../game/Purse';
import { offerLoot } from '../game/LootRoll';
import { receiveItem } from '../game/PlayerActions';

/**
 * What something leaves behind when opened or broken, as data: a table of weighted entries, each a kind
 * of drop with its own handler: coins (paid straight to whoever found them), or a piece of gear (into the
 * finder's bag; on the floor when they can't carry it; a rare one in co-op rolled for by the party). A new kind (a potion, a key) is a new member
 * of `Drop` and a handler in `DROP_HANDLERS`, and every table can use it.
 */
export type Drop =
  | { kind: 'coins'; min: number; max: number }
  /**
   * One random thing from the catalogues: a weapon, a shield or a suit of armour; `magic`: it may be magical (+1 to +3),
   * more often for a finder with the Dungeon Delver feat.
   */
  | { kind: 'gear'; magic?: boolean }
  /** Nothing at all (most kills give up no gear). */
  | { kind: 'none' };

export type DropTable = {
  /** Always dropped. */
  always: readonly Drop[];
  /** How many of the weighted entries are rolled on top. */
  rolls: number;
  entries: ReadonlyArray<{ weight: number; drop: Drop }>;
};

/** `finder`: who opened or killed it, paid the coins. */
type DropHandlers = { [K in Drop['kind']]: (x: number, y: number, drop: Extract<Drop, { kind: K }>, finder: Player | undefined) => void };

/** Gear a chest may hold: every hand weapon, shield and suit of armour. */
const GEAR = [...HAND_WEAPONS, ...SHIELDS, ...ARMORS];

const DROP_HANDLERS: DropHandlers = {
  coins: (_x, _y, drop, finder) => { if (finder) pay(finder, drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1))); },
  // Straight to whoever found it (said over their head); a rare piece in co-op goes to the party's roll instead,
  // and what the finder can't carry lands on the floor, to be taken with E.
  gear: (x, y, drop, finder) => {
    const item = randomItem(GEAR);
    if (drop.magic) enchantFound(item, finder);
    if (offerLoot(item) || (finder && receiveItem(finder, item))) return;
    createItemPickup(x, y, item);
  },
  none: () => undefined,
};

/**
 * The chance (percent) that a piece of gear from a chest is magical; a finder's Dungeon Delver adds its points
 * (src/data/feats.json `magicFind`). How magical, by weight: mostly +1, now and then +2, rarely +3.
 */
const CHEST_MAGIC_PERCENT = 20;
const MAGIC_BONUS_WEIGHTS = [{ bonus: 1, weight: 70 }, { bonus: 2, weight: 25 }, { bonus: 3, weight: 5 }] as const;
const PERCENT = 100;

/** The chance (percent) that gear this hero finds in a chest is magical. */
export function chestMagicPercent(finder: Player | undefined): number {
  return CHEST_MAGIC_PERCENT + (finder ? characterSheet(finder).feats.magicFind : 0);
}

/** A magic bonus by MAGIC_BONUS_WEIGHTS. */
function magicBonusRoll(): number {
  let roll = Math.random() * MAGIC_BONUS_WEIGHTS.reduce((sum, w) => sum + w.weight, 0);
  for (const { bonus, weight } of MAGIC_BONUS_WEIGHTS) {
    roll -= weight;
    if (roll < 0) return bonus;
  }
  return 1;
}

/** Gear found in a chest is magical by the finder's chance: a bonus, and its name says so ("Longsword +1"). */
function enchantFound(item: InventoryItem, finder: Player | undefined): void {
  if (Math.random() * PERCENT >= chestMagicPercent(finder)) return;
  enchant(item, magicBonusRoll());
}

/** The item becomes magical: +`bonus` to hit and damage (a weapon) or to AC (armour, a shield), named with it. */
export function enchant(item: InventoryItem, bonus: number): void {
  item.bonus = bonus;
  item.name = text('item.magic_name', { name: item.name, bonus });
}

/** One kill in this many gives up a piece of gear. */
const MOB_GEAR_ONE_IN = 12;

/** The drop tables, by what drops them. */
export const DROP_TABLES = {
  // A chest always holds a weapon or armour (now and then a magical one), and some coins.
  chest: { always: [{ kind: 'gear', magic: true }], rolls: 1, entries: [{ weight: 1, drop: { kind: 'coins', min: 10, max: 30 } }] },
  // An enemy's coins are its kill reward (entities/LootFactory.ts); now and then it also drops gear.
  mob: { always: [], rolls: 1, entries: [{ weight: MOB_GEAR_ONE_IN - 1, drop: { kind: 'none' } }, { weight: 1, drop: { kind: 'gear' } }] },
} as const satisfies Record<string, DropTable>;

export type DropTableId = keyof typeof DROP_TABLES;

export function isDropTableId(value: unknown): value is DropTableId {
  return typeof value === 'string' && Object.keys(DROP_TABLES).includes(value);
}

function pickEntry(table: DropTable): Drop | undefined {
  let roll = Math.random() * table.entries.reduce((sum, e) => sum + e.weight, 0);
  for (const entry of table.entries) {
    roll -= entry.weight;
    if (roll < 0) return entry.drop;
  }
  return table.entries[table.entries.length - 1]?.drop;
}

function dropOne(x: number, y: number, drop: Drop, finder: Player | undefined): void {
  switch (drop.kind) {
    case 'coins': DROP_HANDLERS.coins(x, y, drop, finder); break;
    case 'gear': DROP_HANDLERS.gear(x, y, drop, finder); break;
    case 'none': DROP_HANDLERS.none(x, y, drop, finder); break;
  }
}

/** Rolls a table and gives out what it holds at (x, y): coins to `finder`, gear on the floor or to the party's roll. */
export function spawnDrops(x: number, y: number, id: DropTableId, finder?: Player): void {
  const table: DropTable = DROP_TABLES[id];
  for (const drop of table.always) dropOne(x, y, drop, finder);
  for (let i = 0; i < table.rolls; i++) {
    const drop = pickEntry(table);
    if (drop) dropOne(x, y, drop, finder);
  }
}
