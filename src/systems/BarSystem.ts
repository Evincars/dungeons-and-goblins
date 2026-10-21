import { Container, Sprite } from 'pixi.js';
import { world } from '../world';
import type { Entity } from '../world';
import { frameTexture, whiteFrameTexture } from '../render/Sheets';

const BAR_STEPS = 20;
const BAR_HALF_WIDTH = 16;
/** Bars sort just in front of the entity they belong to. */
const BAR_DEPTH_BIAS = 0.5;
/** The stamina bar hangs this far below a player's feet. */
const SPRINT_BAR_OFFSET = 8;

const barred = world.with('position', 'health', 'healthBarOffset');
const sprinters = world.with('position', 'playerStats');
type Sprinter = (typeof sprinters)['entities'][number];
type Barred = (typeof barred)['entities'][number];
type HealthBar = NonNullable<Entity['healthBar']>;

/** Green when healthy, through yellow and orange, to red near death. */
function fillColor(value: number, max: number): number {
  const tenth = max / 10;
  if (value < tenth * 3) return 0xf62800;
  if (value < tenth * 6) return 0xfe7700;
  if (value < tenth * 8) return 0xfef115;
  return 0x8af116;
}

function createHealthBar(gameLayer: Container): HealthBar {
  const container = new Container();
  const fill = new Sprite();
  container.addChild(
    new Sprite(frameTexture('bar_green_underlay', 0, 0)),
    fill,
    new Sprite(frameTexture('bar_outline', 0, 0)),
  );
  gameLayer.addChild(container);
  return { container, fill };
}

/** Bars show only while hurt, and never for the dead or respawning. */
function showsBar(entity: Barred): boolean {
  const { current, max } = entity.health;
  return !entity.removed && entity.respawnTicks === undefined && current < max && Math.trunc(max) > 0;
}

function drawBar(entity: Barred, bar: HealthBar): void {
  const maxValue = Math.trunc(entity.health.max);
  const value = Math.max(0, Math.trunc(entity.health.current));
  const pos = entity.position;
  bar.fill.texture = whiteFrameTexture('bar_green', Math.trunc((value * BAR_STEPS) / maxValue), 0);
  bar.fill.tint = fillColor(value, maxValue);
  bar.container.x = Math.round(pos.x) - BAR_HALF_WIDTH;
  bar.container.y = Math.round(pos.y) + entity.healthBarOffset;
  bar.container.zIndex = pos.y + BAR_DEPTH_BIAS;
  bar.container.visible = true;
}

function barOf(entity: Barred, gameLayer: Container): HealthBar {
  if (entity.healthBar) return entity.healthBar;
  const bar = createHealthBar(gameLayer);
  world.addComponent(entity, 'healthBar', bar);
  return bar;
}

function sprintBarOf(player: Sprinter, gameLayer: Container): Sprite {
  if (player.sprintBar) return player.sprintBar;
  const bar = new Sprite();
  gameLayer.addChild(bar);
  world.addComponent(player, 'sprintBar', bar);
  return bar;
}

/** The stamina bar under a player who has been sprinting, emptying as stamina runs out (as in Catacomb Snatch Redux). */
function updateSprintBar(player: Sprinter, gameLayer: Container): void {
  const stats = player.playerStats;
  if (stats.sprint <= 0 || player.removed || player.respawnTicks !== undefined || player.falling) {
    if (player.sprintBar) player.sprintBar.visible = false;
    return;
  }
  const bar = sprintBarOf(player, gameLayer);
  const pos = player.position;
  bar.texture = frameTexture('sprint_bar', Math.trunc((stats.sprint * BAR_STEPS) / stats.maxSprint), 0);
  bar.x = Math.round(pos.x) - BAR_HALF_WIDTH;
  bar.y = Math.round(pos.y) + SPRINT_BAR_OFFSET;
  bar.zIndex = pos.y + BAR_DEPTH_BIAS;
  bar.visible = true;
}

/** Health bars under hurt mobs and nests, and the stamina bar under a sprinting player. */
export function updateBars(gameLayer: Container): void {
  for (const entity of barred) {
    if (showsBar(entity)) drawBar(entity, barOf(entity, gameLayer));
    else if (entity.healthBar) entity.healthBar.container.visible = false;
  }
  for (const player of sprinters) updateSprintBar(player, gameLayer);
}

export function destroyAttachments(entity: Entity): void {
  entity.healthBar?.container.destroy({ children: true });
  entity.hurtOverlay?.destroy();
  entity.sprintBar?.destroy();
  entity.fallMask?.destroy();
  entity.priceLabel?.destroy();
}
