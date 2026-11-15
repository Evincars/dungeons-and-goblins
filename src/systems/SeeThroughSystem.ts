import type { Container } from 'pixi.js';
import { world } from '../world';
import type { Entity } from '../world';
import { Revealer, collectIn, fileBox } from '../render/SeeThrough';
import type { Screen, ScreenTransform, SeeThroughWalls } from '../render/SeeThrough';
import { characterDef, headAboveFeet } from '../characters/Characters';
import { TILE_WIDTH } from '../level/TileType';

/**
 * Clears the walls, columns and rocks over the heroes and their foes standing behind them (render/SeeThrough.ts), so a
 * fight by a south wall or behind a column can be followed: only near the hero this screen follows, so a wall in the
 * dark never gives away what stands behind it.
 */

/** How near the followed hero (in px) a figure must be for what stands over it to clear. */
const SEE_THROUGH_RANGE = 10 * TILE_WIDTH;
/** The box a figure is taken to fill when it has no character art to measure: this tall over its feet, this wide. */
const FIGURE_HEIGHT = 40;
const FIGURE_HALF_WIDTH = 12;
/**
 * The ellipse cleared round a figure: its middle this share of the figure's height above its feet, its radii these
 * shares of that height (down to a smallest width), so it holds the whole figure and fades out round it.
 */
const ELLIPSE_MIDDLE = 0.45;
const ELLIPSE_RX = 0.85;
const ELLIPSE_RY = 0.95;
const ELLIPSE_MIN_RX = 36;
/** Tall props are filed by grid cells this many pixels square, like the walls. */
const CELL = 32;

const figures = world.with('position', 'sprite', 'health');
type Figure = (typeof figures)['entities'][number];
const tallProps = world.with('seeThrough', 'sprite', 'position');

const revealer = new Revealer();
/** Where the game layer puts the world on screen this frame; reused. */
const view: ScreenTransform = { a: 1, d: 1, tx: 0, ty: 0 };
/** The screens over the figure being looked at; reused each time. */
const over: Screen[] = [];

/** The tall props' screens, filed by cell, for the level's walls they were filed with (refiled when either changes). */
const tallCells = new Map<number, Array<{ screen: Screen; x0: number; y0: number; x1: number; y1: number }>>();
let tallColumns = 0;
let filedFor: SeeThroughWalls | null = null;
let filedCount = -1;

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

/** Files every tall prop's sprite as a screen drawn at its feet, over the box its art fills. */
function fileTallProps(levelWidth: number): void {
  tallCells.clear();
  tallColumns = Math.ceil(levelWidth / CELL) + 1;
  for (const prop of tallProps) {
    const s = prop.sprite;
    const w = Math.abs(s.width);
    const h = Math.abs(s.height);
    const x0 = s.x - s.anchor.x * w;
    const y0 = s.y - s.anchor.y * h;
    const screen: Screen = { target: s, z: prop.position.y, filter: null, reveals: [] };
    fileBox(tallCells, tallColumns, { screen, x0, y0, x1: x0 + w, y1: y0 + h });
  }
  filedCount = tallProps.size;
}

/** Keeps the ellipses and the tall props' screens for the walls they go with: a level built anew starts afresh. */
function refile(walls: SeeThroughWalls, levelWidth: number): void {
  if (filedFor !== walls) {
    revealer.clear();
    filedFor = walls;
    filedCount = -1;
  }
  if (filedCount !== tallProps.size) fileTallProps(levelWidth);
}

/** A figure near the hero followed: the walls and tall props drawn over it, and its ellipse. */
function lookAt(entity: Figure, walls: SeeThroughWalls): void {
  const { x, y } = entity.position;
  const height = figureHeight(entity);
  const half = Math.max(FIGURE_HALF_WIDTH, entity.radius?.x ?? 0);
  over.length = 0;
  walls.collect(x - half, y - height, x + half, y, y, over);
  collectIn(tallCells, tallColumns, x - half, y - height, x + half, y, y, over);
  const rx = Math.max(ELLIPSE_MIN_RX, height * ELLIPSE_RX);
  revealer.figure(entity, x, y - height * ELLIPSE_MIDDLE, rx, height * ELLIPSE_RY, over);
}

/**
 * Where the game layer puts the world on screen once moved to this frame's camera (its own transform is only worked out
 * as it is drawn): its parent's scale and offset, with the layer's own offset.
 */
function viewOf(layer: Container): ScreenTransform {
  const parent = layer.parent?.worldTransform;
  view.a = parent?.a ?? 1;
  view.d = parent?.d ?? 1;
  view.tx = (parent?.tx ?? 0) + view.a * layer.x;
  view.ty = (parent?.ty ?? 0) + view.d * layer.y;
  return view;
}

/**
 * Clears what stands over the figures near `viewer` (the hero followed) in the level's walls, drawn on screen through
 * `layer` (the game layer).
 */
export function updateSeeThrough(walls: SeeThroughWalls, viewer: { x: number; y: number } | undefined, layer: Container, levelWidth: number): void {
  refile(walls, levelWidth);
  revealer.begin();
  for (const entity of figures) {
    if (!viewer || !standing(entity)) continue;
    const dx = entity.position.x - viewer.x;
    const dy = entity.position.y - viewer.y;
    if (dx * dx + dy * dy <= SEE_THROUGH_RANGE * SEE_THROUGH_RANGE) lookAt(entity, walls);
  }
  revealer.settle(viewOf(layer));
}
