import { world, q } from '../world';
import type { Entity, Player } from '../world';
import { TILE_HEIGHT, TILE_WIDTH } from '../level/TileType';
import { rollDie } from '../rules/Dice';
import type { DieSides } from '../rules/Dice';
import { setVisualFrame } from '../render/AnimatedVisual';
import { sound } from '../audio/SoundPlayer';
import { text } from '../core/texts';
import { run } from '../game/Run';
import { isStanding } from '../game/Fallen';
import { hurtPlayer } from './CombatSystem';
import { logLine } from './RollLogSystem';
import { recordEvent } from './CombatLogSystem';

/**
 * The catacombs' spike traps (entities/DungeonFactory.ts `createSpikeTrap`, set in their corridors by the builder). The
 * first hero whose feet come onto one springs it: the spikes thrust up, the hero takes a die of piercing damage (bigger
 * the deeper the party has gone, `spikeDie`), told over their head and in the combat log. Sprung, the trap stays up and
 * hurts nobody again. Run by whoever runs the game; guests see the frame it shows.
 */

/** The spike sheet's frames (public/catacombs/spikes.png, scripts/spike-sheet.py): holes, then the spikes rising. */
export const SPIKE_FRAMES = 5;
/** Each frame of the spikes rising shows this many ticks. */
const SPIKE_FRAME_TICKS = 2;
/** A hero springs a trap with their feet this far inside its tile (stepping on its edge does not). */
const TRAP_INSET = 5;
/**
 * The trap's die by depth: up to the second level a d4, then a d6, a d8 and a d10 two levels each, a d12 from then on
 * (the first depth each die starts at).
 */
const SPIKE_DICE: ReadonlyArray<{ from: number; die: DieSides }> = [
  { from: 1, die: 4 }, { from: 3, die: 6 }, { from: 5, die: 8 }, { from: 7, die: 10 }, { from: 9, die: 12 },
];

const traps = world.with('position', 'spikeTrap');
type Trap = (typeof traps)['entities'][number];

/** The die a spike trap rolls at a depth. */
export function spikeDie(depth: number): DieSides {
  let die: DieSides = SPIKE_DICE[0].die;
  for (const step of SPIKE_DICE) if (depth >= step.from) die = step.die;
  return die;
}

/** Whether a hero's feet are on the trap's tile (well inside it), on their feet and not falling. */
function standsOn(player: Player, trap: Trap): boolean {
  if (!isStanding(player) || player.falling) return false;
  const halfW = TILE_WIDTH / 2 - TRAP_INSET;
  const halfH = TILE_HEIGHT / 2 - TRAP_INSET;
  return Math.abs(player.position.x - trap.position.x) <= halfW && Math.abs(player.position.y - trap.position.y) <= halfH;
}

function victimOf(trap: Trap): Player | undefined {
  for (const player of q.players) if (standsOn(player, trap)) return player;
  return undefined;
}

/** The trap goes off under a hero: they are hurt, and told so over their head and in the log. */
function spring(trap: Trap, player: Player): void {
  trap.spikeTrap.sprung = true;
  trap.spikeTrap.ticks = 0;
  const die = spikeDie(run.depth);
  const damage = rollDie(die);
  const dice = `1d${die}`;
  sound.playSound('sword_hit', trap.position.x, trap.position.y);
  logLine(player, text('roll.trap', { damage, dice }), 'hit');
  recordEvent(player, 'trap', { item: dice, amount: damage });
  hurtPlayer(player, trap, damage, 'piercing');
}

/** The spikes rise frame by frame once sprung, and stay up. */
function raise(trap: Trap): void {
  if (trap.spikeTrap.ticks >= SPIKE_FRAMES * SPIKE_FRAME_TICKS) return;
  trap.spikeTrap.ticks++;
  showFrame(trap, Math.min(SPIKE_FRAMES - 1, Math.floor(trap.spikeTrap.ticks / SPIKE_FRAME_TICKS)));
}

/** Shows a frame of the spikes (kept in the visual too, so co-op guests, who mirror components, see it). */
function showFrame(trap: Entity, col: number): void {
  if (!trap.visual || trap.visual.col === col) return;
  trap.visual.col = col;
  if (trap.sprite) setVisualFrame(trap.sprite, trap.visual.sheet, col, 0);
}

/** Host, each tick: a hero stepping on a trap springs it; a sprung one raises its spikes. */
export function updateTraps(): void {
  for (const trap of traps) {
    if (trap.spikeTrap.sprung) {
      raise(trap);
      continue;
    }
    const victim = victimOf(trap);
    if (victim) spring(trap, victim);
  }
}
