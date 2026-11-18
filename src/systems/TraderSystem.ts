import { world } from '../world';
import type { Entity } from '../world';
import { setVisualFrame } from '../render/AnimatedVisual';
import { COAT_HELD_LAST, COAT_HELD_TICKS, COAT_OPEN, PLAIN_IDLE_SHARE, TRADER_FRAMES, TRADER_FRAME_TICKS, TRADER_SHEETS } from '../entities/Trader';
import type { TraderClip } from '../entities/Trader';
import { activeTrader, isShopOpen } from './ShopSystem';

/**
 * The traders' animation, on every screen alike (presentation, not synced). A trader idles (one of its idles, another
 * picked at random each time one ends). When this screen opens its trade panel it throws its coat open on its wares
 * once, then holds it open (a slow sway) for as long as the panel is open; when the panel closes it closes the coat, and
 * nods if a trade went through meanwhile.
 */

/** What a trader is doing: an idle or the nod (whole clips), or a part of the dialogue clip (the coat). */
type Act = 'idle' | 'opening' | 'open' | 'closing' | 'nod';
type Pose = { act: Act; clip: TraderClip; frame: number; ticks: number; traded: boolean; sway: 1 | -1 };

const traders = world.with('shopNpc', 'sprite');
const poses = new WeakMap<Entity, Pose>();

/** A trade went through with this screen's trader: it will nod once its coat is closed. */
export function traderApproves(): void {
  const trader = activeTrader();
  const pose = trader ? poses.get(trader) : undefined;
  if (pose) pose.traded = true;
}

function nextIdle(): TraderClip {
  const roll = Math.random();
  if (roll < PLAIN_IDLE_SHARE) return 'idle';
  return roll < (1 + PLAIN_IDLE_SHARE) / 2 ? 'idle2' : 'idle3';
}

function begin(pose: Pose, act: Act, clip: TraderClip, frame = 0): void {
  pose.act = act;
  pose.clip = clip;
  pose.frame = frame;
  pose.ticks = 0;
}

/** The panel opened or closed: the coat starts opening (from an idle or a nod) or closing (from where it is). */
function followPanel(pose: Pose, open: boolean): void {
  const coatOpen = pose.act === 'opening' || pose.act === 'open';
  if (open && !coatOpen) begin(pose, 'opening', 'dialogue');
  if (!open && coatOpen) begin(pose, 'closing', 'dialogue', Math.max(pose.frame, COAT_HELD_LAST + 1));
}

/** Held open, the coat sways between its held frames, back and forth. */
function sway(pose: Pose): void {
  const next = pose.frame + pose.sway;
  if (next < COAT_OPEN || next > COAT_HELD_LAST) pose.sway = pose.sway > 0 ? -1 : 1;
  pose.frame += pose.sway;
}

/** One frame on: the opening ends held open; the closing ends in a nod (after a trade) or an idle; a whole clip in the next idle. */
function step(pose: Pose): void {
  if (pose.act === 'open') return sway(pose);
  pose.frame++;
  if (pose.act === 'opening' && pose.frame >= COAT_OPEN) return begin(pose, 'open', 'dialogue', COAT_OPEN);
  if (pose.frame < TRADER_FRAMES[pose.clip]) return;
  if (pose.act === 'closing' && pose.traded) {
    pose.traded = false;
    return begin(pose, 'nod', 'approval');
  }
  begin(pose, 'idle', nextIdle());
}

function animate(trader: Entity & { sprite: NonNullable<Entity['sprite']> }): void {
  let pose = poses.get(trader);
  if (!pose) poses.set(trader, (pose = { act: 'idle', clip: 'idle', frame: 0, ticks: 0, traded: false, sway: 1 }));
  followPanel(pose, isShopOpen() && activeTrader() === trader);
  const frameTicks = pose.act === 'open' ? COAT_HELD_TICKS : TRADER_FRAME_TICKS;
  if (++pose.ticks >= frameTicks) {
    pose.ticks = 0;
    step(pose);
  }
  setVisualFrame(trader.sprite, TRADER_SHEETS[pose.clip], pose.frame, 0);
}

export function animateTraders(): void {
  for (const trader of traders) animate(trader);
}
