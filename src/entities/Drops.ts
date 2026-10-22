import { spillMoney } from './LootFactory';

/**
 * What something leaves behind when opened or broken, as data: a table of weighted entries, each a kind
 * of drop with its own handler. Only coins exist so far; a new kind (an item, a potion, a key) is a new
 * member of `Drop` and a handler in `DROP_HANDLERS`, and every table can use it.
 */
export type Drop = { kind: 'coins'; min: number; max: number };

export type DropTable = {
  /** How many entries are rolled. */
  rolls: number;
  entries: ReadonlyArray<{ weight: number; drop: Drop }>;
};

type DropHandlers = { [K in Drop['kind']]: (x: number, y: number, drop: Extract<Drop, { kind: K }>) => void };

const DROP_HANDLERS: DropHandlers = {
  coins: (x, y, drop) => spillMoney(x, y, drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1))),
};

/** The drop tables, by what drops them. */
export const DROP_TABLES = {
  chest: { rolls: 1, entries: [{ weight: 1, drop: { kind: 'coins', min: 20, max: 60 } }] },
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

function dropOne(x: number, y: number, drop: Drop): void {
  switch (drop.kind) {
    case 'coins': DROP_HANDLERS.coins(x, y, drop); break;
  }
}

/** Rolls a table and throws out what it gives, at (x, y). */
export function spawnDrops(x: number, y: number, id: DropTableId): void {
  const table: DropTable = DROP_TABLES[id];
  for (let i = 0; i < table.rolls; i++) {
    const drop = pickEntry(table);
    if (drop) dropOne(x, y, drop);
  }
}
