import { world } from '../world';
import type { InventoryItem, Player } from '../world';
import { ARMORS, MEDALS, SHIELDS, WEAPONS } from '../entities/ItemCatalog';
import { grantExperience } from '../systems/DeathSystem';
import { text } from '../core/texts';
import { applyLoadout, freeSquare } from './PlayerActions';

/**
 * The ~ console's commands, for testing (as in Catacomb Snatch Redux): money, god mode, experience and any
 * item by its catalogue id. Lines start with a slash ("/money 500"); each returns what to print.
 */

/** The most coins or experience one command may give or take. */
const AMOUNT_MAX = 1_000_000;
/** At most this many ids are listed by /items. */
const ITEMS_LISTED = 12;

/** `allowed`: false in co-op, where the console would change the others' game too. */
export type ConsoleContext = { player: Player | undefined; allowed: boolean };

/** Every item the console can hand out, by its catalogue id. */
const CATALOGUE: ReadonlyMap<string, InventoryItem> = new Map(
  [...WEAPONS, ...SHIELDS, ...ARMORS, ...MEDALS].flatMap((item) => (item.id ? [[item.id, item] as const] : [])),
);

function parseAmount(arg: string | undefined): number | null {
  if (arg === undefined || !/^-?\d+$/.test(arg)) return null;
  const amount = Number(arg);
  return amount === 0 || Math.abs(amount) > AMOUNT_MAX ? null : amount;
}

function giveMoney(player: Player, amount: number | null): string[] {
  if (amount === null) return [text('console.money.usage', { max: AMOUNT_MAX })];
  const stats = player.playerStats;
  stats.gold = Math.max(0, stats.gold + amount);
  return [text(amount > 0 ? 'console.money.gave' : 'console.money.took', { amount: Math.abs(amount), total: stats.gold })];
}

function setGod(player: Player, arg: string | undefined): string[] {
  if (arg !== undefined && arg !== 'on' && arg !== 'off') return [text('console.god.usage')];
  const on = arg === undefined ? !player.godMode : arg === 'on';
  if (on) {
    world.addComponent(player, 'godMode', true);
    player.health.current = player.health.max;
  } else if (player.godMode) {
    world.removeComponent(player, 'godMode');
  }
  return [text(on ? 'console.god.on' : 'console.god.off')];
}

function giveExperience(player: Player, amount: number | null): string[] {
  if (amount === null || amount < 0) return [text('console.xp.usage', { max: AMOUNT_MAX })];
  grantExperience(player, amount);
  return [text('console.xp.gave', { amount, total: player.playerStats.exp, level: player.playerStats.level })];
}

/** Ids are written as in the catalogue, any case, dashes for underscores ("weapon-axe-001"). */
const normaliseId = (id: string): string => id.toLowerCase().replace(/-/g, '_');

/** The item, into the first free square of the bag (the console ignores what the hero can carry). */
function addItem(player: Player, id: string | undefined): string[] {
  if (!id) return [text('console.item.usage')];
  const item = CATALOGUE.get(normaliseId(id));
  if (!item) return [text('console.item.unknown', { id })];
  const inventory = [...(player.inventory ?? [])];
  const square = freeSquare(inventory);
  if (square < 0) return [text('console.item.bag_full')];
  inventory[square] = structuredClone(item);
  applyLoadout(player, { inventory, equipped: player.equipped ?? {} });
  return [text('console.item.added', { name: item.name })];
}

/** Item ids containing the filter (all of them without one), a page at a time. */
function listItems(filter: string | undefined): string[] {
  const wanted = filter ? normaliseId(filter) : '';
  const ids = [...CATALOGUE.keys()].filter((id) => id.includes(wanted));
  const shown = ids.slice(0, ITEMS_LISTED);
  const more = ids.length - shown.length;
  return [...shown, ...(more > 0 ? [text('console.items.more', { count: more })] : []), ...(ids.length ? [] : [text('console.items.none')])];
}

/** Runs one console line and returns what to print. */
export function runCommand(line: string, ctx: ConsoleContext): string[] {
  const typed = line.trim();
  if (!typed) return [];
  if (!typed.startsWith('/')) return [text('console.slash')];
  const [name = '', ...args] = typed.slice(1).split(/\s+/);
  const player = ctx.player;
  const command = name.toLowerCase();
  if (command === 'help') return text('console.help').split('\n');
  if (command === 'items') return listItems(args[0]);
  if (!ctx.allowed) return [text('console.coop')];
  if (!player) return [text('console.no_player')];
  switch (command) {
    case 'money': return giveMoney(player, parseAmount(args[0]));
    case 'give': return args[0]?.toLowerCase() === 'money' ? giveMoney(player, parseAmount(args[1])) : [text('console.give.usage')];
    case 'god': return setGod(player, args[0]?.toLowerCase());
    case 'xp': case 'exp': case 'addxp': return giveExperience(player, parseAmount(args[0]));
    case 'additem': case 'item': return addItem(player, args[0]);
    default: return [text('console.unknown', { name: command })];
  }
}
