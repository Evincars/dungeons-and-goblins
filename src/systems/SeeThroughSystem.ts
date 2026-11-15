import { world } from '../world';
import type { Entity } from '../world';
import type { SeeThroughWalls } from '../render/SeeThrough';
import { characterDef, headAboveFeet } from '../characters/Characters';
import { TILE_WIDTH } from '../level/TileType';

/**
 * Turns the walls see-through over the heroes and their foes standing behind them (render/SeeThrough.ts), so a fight
 * by a south wall can be followed: only near the hero this screen follows, so a wall in the dark never gives away what
 * stands behind it.
 */

/** How near the followed hero (in px) a figure must be for the walls over it to clear. */
const SEE_THROUGH_RANGE = 10 * TILE_WIDTH;
/** The box a figure is taken to fill when it has no character art to measure: this tall over its feet, this wide. */
const FIGURE_HEIGHT = 40;
const FIGURE_HALF_WIDTH = 12;

const figures = world.with('position', 'sprite', 'health');
type Figure = (typeof figures)['entities'][number];

/** Whether a figure is on its feet and drawn (not respawning, not falling into a pit). */
function standing(entity: Figure): boolean {
  return entity.sprite.visible && entity.respawnTicks === undefined && !entity.falling;
}

/** How tall a figure stands over its feet: to the top of its head, for a character. */
function figureHeight(entity: Entity): number {
  const character = entity.character;
  if (!character) return FIGURE_HEIGHT;
  return headAboveFeet(characterDef(character.def), entity.visual?.scale);
}

export function updateSeeThrough(walls: SeeThroughWalls, viewer: { x: number; y: number } | undefined): void {
  walls.begin();
  for (const entity of figures) {
    if (!viewer || !standing(entity)) continue;
    const { x, y } = entity.position;
    const dx = x - viewer.x;
    const dy = y - viewer.y;
    if (dx * dx + dy * dy > SEE_THROUGH_RANGE * SEE_THROUGH_RANGE) continue;
    const halfWidth = Math.max(FIGURE_HALF_WIDTH, entity.radius?.x ?? 0);
    walls.reveal(x - halfWidth, y - figureHeight(entity), x + halfWidth, y, y);
  }
  walls.settle();
}
