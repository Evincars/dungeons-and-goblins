import { Container } from 'pixi.js';
import { world } from '../world';
import type { Entity, RollTone } from '../world';
import { PixelLabel } from '../ui/PixelText';
import { characterDef, headAboveFeet } from '../characters/Characters';
import { MAX_ROLL_LINES, ROLL_LINE_TICKS } from './RollLogSystem';

const logged = world.with('rollLog', 'position');

/** Line spacing, the gap above the head (or health bar), and the lift for anything without a head. */
const LINE_H = 9;
const HEAD_GAP = 10;
const BAR_GAP = 6;
const DEFAULT_LIFT = 32;
/**
 * Lines hang off to the side a fighter faces away from (reaching this far past its middle the other way), so
 * two fighters trading blows face to face don't write over each other.
 */
const SIDE_OVERLAP = 6;
/** A line fades out over its last ticks. */
const FADE_TICKS = 16;
/** Above everything in the world but the fog. */
const ROLL_Z = 9e6;

/** Hits read white, misses grey, natural 20s gold, natural 1s dark red, damage red, healing green. */
const TONE_COLORS = {
  hit: 0xffffff,
  miss: 0x9aa2ac,
  crit: 0xffd040,
  fumble: 0xc04040,
  damage: 0xff6b6b,
  heal: 0x7fe07f,
} as const satisfies Record<RollTone, number>;

type View = { container: Container; labels: PixelLabel[] };
const views = new Map<Entity, View>();

function createView(gameLayer: Container): View {
  const container = new Container();
  container.zIndex = ROLL_Z;
  const labels = Array.from({ length: MAX_ROLL_LINES }, () => new PixelLabel('', { outline: true }));
  container.addChild(...labels);
  gameLayer.addChild(container);
  return { container, labels };
}

/** How far above its feet an entity's rolls start: over its health bar, or over its head. */
function liftOf(entity: Entity): number {
  if (entity.healthBarOffset !== undefined) return -entity.healthBarOffset + BAR_GAP;
  if (entity.character) return headAboveFeet(characterDef(entity.character.def), entity.visual?.scale) + HEAD_GAP;
  return DEFAULT_LIFT;
}

/**
 * Draws one entity's log: oldest line on top, newest just over the head, each fading at the end of its time,
 * hanging off the side the fighter turns its back to.
 */
function drawLog(entity: Entity & { rollLog: NonNullable<Entity['rollLog']>; position: { x: number; y: number } }, view: View): void {
  const log = entity.rollLog;
  const facingRight = !(entity.character?.flipX ?? false);
  view.container.visible = log.length > 0 && entity.respawnTicks === undefined;
  view.container.position.set(Math.round(entity.position.x), Math.round(entity.position.y - liftOf(entity)));
  view.labels.forEach((label, i) => {
    const line = log[i];
    label.visible = !!line;
    if (!line) return;
    label.text = line.text;
    label.fill = TONE_COLORS[line.tone];
    label.alpha = Math.min(1, (ROLL_LINE_TICKS - line.age) / FADE_TICKS);
    label.y = -(log.length - i) * LINE_H;
    label.x = facingRight ? SIDE_OVERLAP - label.textWidth : -SIDE_OVERLAP;
  });
}

/** Forgets every view; the display objects go with their scene. */
export function resetRollTexts(): void {
  for (const view of views.values()) if (!view.container.destroyed) view.container.destroy({ children: true });
  views.clear();
}

/** The roll logs over every fighter's head, as the host keeps them (a guest draws the copies it is sent). */
export function updateRollTexts(gameLayer: Container): void {
  for (const [entity, view] of views) {
    if (world.has(entity) && !entity.removed && entity.rollLog) continue;
    if (!view.container.destroyed) view.container.destroy({ children: true });
    views.delete(entity);
  }
  for (const entity of logged) {
    if (entity.removed) continue;
    let view = views.get(entity);
    if (!view) {
      view = createView(gameLayer);
      views.set(entity, view);
    }
    drawLog(entity, view);
  }
}
