import { world } from '../world';
import type { Entity } from '../world';
import { setVisualFrame } from '../render/AnimatedVisual';
import { PLAIN_IDLE_SHARE, TRADER_FRAMES, TRADER_FRAME_TICKS, TRADER_SHEETS } from '../entities/Trader';
import type { TraderClip } from '../entities/Trader';
import { activeTrader, isShopOpen } from './ShopSystem';

/**
 * The traders' animation, on every screen alike (presentation, not synced): one of its idles, again and again (another
 * picked at random each time one ends); talking while this screen has its trade panel open; a nod once after a trade.
 */

const traders = world.with('shopNpc', 'sprite');
type Pose = { clip: TraderClip; frame: number; ticks: number };
const poses = new WeakMap<Entity, Pose>();
/** The trader this screen just traded with, to nod once. */
let nodding: Entity | null = null;

/** A trade went through with this screen's trader: it nods (once its current frame is done). */
export function traderApproves(): void {
  nodding = activeTrader();
}

function nextIdle(): TraderClip {
  const roll = Math.random();
  if (roll < PLAIN_IDLE_SHARE) return 'idle';
  return roll < (1 + PLAIN_IDLE_SHARE) / 2 ? 'idle2' : 'idle3';
}

/** What the trader should be doing now, given what it is doing. */
function wantedClip(trader: Entity, pose: Pose): TraderClip | null {
  if (nodding === trader) return 'approval';
  const talking = isShopOpen() && activeTrader() === trader;
  if (talking && pose.clip !== 'dialogue' && pose.clip !== 'approval') return 'dialogue';
  if (!talking && pose.clip === 'dialogue') return nextIdle();
  return null;
}

function start(pose: Pose, clip: TraderClip): void {
  pose.clip = clip;
  pose.frame = 0;
  pose.ticks = 0;
}

/** One tick of a trader: a new clip when one is wanted, else the next frame (a finished clip starts what follows it). */
function animate(trader: Entity & { sprite: NonNullable<Entity['sprite']> }): void {
  let pose = poses.get(trader);
  if (!pose) poses.set(trader, (pose = { clip: 'idle', frame: 0, ticks: 0 }));
  const wanted = wantedClip(trader, pose);
  if (wanted) {
    if (wanted === 'approval') nodding = null;
    start(pose, wanted);
  } else if (++pose.ticks >= TRADER_FRAME_TICKS) {
    pose.ticks = 0;
    pose.frame++;
    // A clip played through: talking goes on talking, a nod or an idle gives way to the next idle (or talk).
    if (pose.frame >= TRADER_FRAMES[pose.clip]) start(pose, pose.clip === 'dialogue' ? 'dialogue' : nextIdle());
  }
  setVisualFrame(trader.sprite, TRADER_SHEETS[pose.clip], pose.frame, 0);
}

export function animateTraders(): void {
  for (const trader of traders) animate(trader);
}
