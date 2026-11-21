import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import { localPlayer } from '../world';
import type { Entity, Player } from '../world';
import { screenToWorld } from '../render/Camera';
import { heldQuickSlot, pointer, pointerFree } from './InputSystem';
import { isInventoryOpen } from './InventorySystem';
import { isShopOpen } from './ShopSystem';
import { holdsBow } from './ArrowSystem';
import { SPELLS, isSpellId } from '../rules/Spells';
import type { SpellDef } from '../rules/Spells';
import { castDef, quickBinding } from '../rules/Spellbook';
import type { QuickBinding } from '../rules/Spellbook';
import { weaponRule } from '../rules/Equipment';
import { weaponInHand } from '../rules/CharacterSheet';
import { feetToPx, pxToFeet } from '../rules/Scale';
import { areaBounds, areaCentre, coneCorners, fromHands, inArea, lineCorners } from '../rules/SpellArea';
import type { AreaShape, Point } from '../rules/SpellArea';
import { bindingFeatureId } from '../rules/ClassFeatures';
import { FEATURE_AREAS } from './SchoolSystem';
import { SPELL_STATS } from '../entities/WeaponStats';
import { AIM_HEIGHT } from '../entities/ProjectileFactory';
import { nearby, Sense } from '../ai/perception/spatial';
import { PixelLabel } from '../ui/PixelText';

/**
 * Where a shot will go, shown faintly while the hero aims. A bolt, darts or an arrow fly straight: a dotted line from the
 * hero's hands the way they aim, as far as the shot flies (it goes off there if it strikes nothing on the way) — grey, and
 * amber past a bow's normal range, where shots roll with disadvantage. A spell with an area shows only that area where it
 * will go off — a circle, a square (a cube), or a cone or a line from the hands — at the crosshair, or as far towards it as it reaches,
 * a faint mark under each enemy it would catch, and how far off it is, in feet. A spell's guide shows while its quick-bar key
 * is held (let go, it casts) or while it is cast; a bow's or crossbow's while it is in hand. Drawn on this screen only.
 */

/** Colours and how faint the guide is: its line's dots, the area's edge and fill. */
export const IN_REACH = 0xd8d8d8;
export const PENALISED = 0xd8b060;
export const OUT_OF_REACH = 0xe06a5a;
const DOT_ALPHA = 0.4;
const RING_ALPHA = 0.35;
const FILL_ALPHA = 0.06;
const CAUGHT_ALPHA = 0.55;
/** The line: a dot every so many px along it, so big; a ring this big where it ends. */
const DOT_STEP = 7;
const DOT_RADIUS = 0.8;
const END_RADIUS = 2.5;
/** The mark under an enemy the area would catch: an ellipse this wide and tall. */
const CAUGHT_RX = 8;
const CAUGHT_RY = 3;
/** The distance label sits this far right of and above the point it measures to. */
const LABEL_DX = 6;
const LABEL_DY = -12;
/** Over the world, under the fog and the HUD (as the corner brackets). */
const GUIDE_Z = 999_999;

/**
 * What the hero is aiming: how far it reaches (and from where it is penalised), and the spell whose area it strikes (null
 * for a shot that flies straight). `radius` and `landsWhere` describe that area: its breadth, and whether it is thrown at
 * the crosshair or wrapped round the caster.
 */
export type Aim = { reach: number; normal: number; radius: number; landsWhere: 'target' | 'caster'; area: AreaShape | null };

let guide: Graphics | null = null;
let label: PixelLabel | null = null;
let shownFeet = -1;
const aim = { x: 0, y: 0 };
const centre: Point = { x: 0, y: 0 };
const bounds = { x: 0, y: 0, r: 0 };
const corners: [Point, Point, Point] = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
const lineEnds: [Point, Point, Point, Point] = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
const caught: Entity[] = [];

/** The spell a binding casts, at the level it is cast, if it is one that is aimed (a bolt, darts, an area). */
function aimedSpell(player: Player, binding: QuickBinding): SpellDef | null {
  if (!isSpellId(binding.spell)) return null;
  const def = castDef(SPELLS[binding.spell], binding.level, player.playerStats.level);
  if (def.kind === 'buff') return null;
  return def.kind === 'heal' && def.radius <= 0 ? null : def;
}

/** An area, thrown (to the crosshair, a cone or a line towards it) or round the caster. */
function areaAim(area: AreaShape): Aim {
  const thrown = area.range > 0 || fromHands(area);
  return { reach: area.range, normal: area.range, radius: area.radius, landsWhere: thrown ? 'target' : 'caster', area };
}

/** A shot that flies straight (as far as a spell bolt flies), or a spell's area. */
function spellAim(def: SpellDef): Aim {
  if (def.kind !== 'bolt' && def.kind !== 'missiles') return areaAim(def);
  const reach = SPELL_STATS.boltSpeed * SPELL_STATS.boltLife;
  return { reach, normal: reach, radius: 0, landsWhere: 'target', area: null };
}

/** What a quick-bar square aims, if anything: its spell, or a class feature aimed at an area (Minor Conjuration's water). */
function slotAim(player: Player, slot: number): Aim | null {
  const binding = slot < 0 ? null : quickBinding(player, slot);
  if (!binding) return null;
  const feature = bindingFeatureId(binding.spell);
  const area = feature ? FEATURE_AREAS[feature] : undefined;
  if (area) return areaAim(area);
  const spell = aimedSpell(player, binding);
  return spell ? spellAim(spell) : null;
}

/** What the hero aims now, if anything: the spell or feature being cast or whose key is held, else the bow in hand. */
export function currentAim(player: Player): Aim | null {
  const slot = player.casting ? player.playerInput.spellSlot : heldQuickSlot();
  const aimed = slotAim(player, slot);
  if (aimed) return aimed;
  const distance = holdsBow(player) ? weaponRule(weaponInHand(player.equipped ?? {}) ?? undefined)?.rule.distance : undefined;
  if (!distance) return null;
  return { reach: feetToPx(distance[1]), normal: feetToPx(distance[0]), radius: 0, landsWhere: 'target', area: null };
}

function layers(gameLayer: Container): { g: Graphics; text: PixelLabel } {
  if (!guide || guide.destroyed || guide.parent !== gameLayer) {
    guide = new Graphics();
    guide.zIndex = GUIDE_Z;
    gameLayer.addChild(guide);
    label = new PixelLabel('', { color: IN_REACH, outline: true });
    label.zIndex = GUIDE_Z;
    label.alpha = RING_ALPHA * 2;
    gameLayer.addChild(label);
    shownFeet = -1;
  }
  return { g: guide, text: label ?? new PixelLabel('') };
}

/** Whether the hero can aim now: alive and on their feet, with nothing over the world taking the pointer. */
function aiming(player: Player | undefined): player is Player {
  if (!player || player.health.current <= 0 || player.falling || player.respawnTicks !== undefined) return false;
  return pointerFree() && !isInventoryOpen() && !isShopOpen();
}

/** The colour of a shot this far: grey within its normal reach, amber past it (bows), red past all it can reach. */
export function colourFor(dist: number, a: Aim): number {
  if (dist > a.reach) return OUT_OF_REACH;
  return dist > a.normal ? PENALISED : IN_REACH;
}

/** Dots from `from` px to `to` px along the unit direction (ux, uy) out of (x0, y0), in one colour. */
function dots(g: Graphics, x0: number, y0: number, ux: number, uy: number, from: number, to: number, colour: number): void {
  if (to <= from) return;
  for (let d = from + DOT_STEP; d < to; d += DOT_STEP) g.circle(x0 + ux * d, y0 + uy * d, DOT_RADIUS);
  g.fill({ color: colour, alpha: DOT_ALPHA });
}

/** A straight shot's line, the way the hero aims, all the way it flies: grey to its normal range, amber past it; a ring where it ends. */
function drawLine(g: Graphics, x0: number, y0: number, ux: number, uy: number, a: Aim): void {
  dots(g, x0, y0, ux, uy, 0, a.normal, IN_REACH);
  dots(g, x0, y0, ux, uy, a.normal - DOT_STEP, a.reach, PENALISED);
  const end = a.reach > a.normal ? PENALISED : IN_REACH;
  g.circle(x0 + ux * a.reach, y0 + uy * a.reach, END_RADIUS).stroke({ color: end, alpha: RING_ALPHA * 2, width: 1 });
}

/** A spell's area as it will go off: a circle, a square (a cube), or a cone or a line from the caster's hands. */
function drawShape(g: Graphics, def: AreaShape, from: Point, at: Point): void {
  if (def.area === 'cube') g.rect(at.x - def.radius, at.y - def.radius, def.radius * 2, def.radius * 2);
  else if (def.area === 'sphere') g.circle(at.x, at.y, def.radius);
  else if (def.area === 'line') {
    const [a, b, c, d] = lineCorners(def, from, at, lineEnds);
    g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]);
  } else {
    const [a, b, c] = coneCorners(def, from, at, corners);
    g.poly([a.x, a.y, b.x, b.y, c.x, c.y]);
  }
  g.fill({ color: IN_REACH, alpha: FILL_ALPHA }).stroke({ color: IN_REACH, alpha: RING_ALPHA, width: 1 });
}

/** The area, and a faint mark under each enemy standing in it. */
function drawArea(g: Graphics, def: AreaShape, from: Point, at: Point): void {
  drawShape(g, def, from, at);
  const near = areaBounds(def, from, at, bounds);
  for (const foe of nearby(near.x, near.y, near.r, Sense.mob, caught)) {
    if (!foe.position || (foe.health?.current ?? 0) <= 0) continue;
    if (inArea(def, from, at, foe.position.x, foe.position.y)) g.ellipse(foe.position.x, foe.position.y, CAUGHT_RX, CAUGHT_RY);
  }
  g.stroke({ color: OUT_OF_REACH, alpha: CAUGHT_ALPHA, width: 1 });
}

/** How far off (x, y) lies, in feet, beside it (written again only when it changes). */
function showDistance(text: PixelLabel, x: number, y: number, dist: number, colour: number): void {
  const feet = pxToFeet(dist);
  text.visible = true;
  text.position.set(Math.round(x + LABEL_DX), Math.round(y + LABEL_DY));
  text.tint = colour;
  if (feet === shownFeet) return;
  shownFeet = feet;
  text.text = `${feet} ft`;
}

/** An area spell: only its area, where it will go off; thrown ones say how far off that is. */
function guideArea(g: Graphics, text: PixelLabel, player: Player, def: AreaShape, thrown: boolean): void {
  const from = player.position;
  areaCentre(def, from, aim, centre, player.aimVector);
  drawArea(g, def, from, centre);
  if (!thrown) return;
  const dist = Math.hypot(centre.x - from.x, centre.y - from.y);
  showDistance(text, centre.x, centre.y, dist, IN_REACH);
}

/** Once a tick: the guide for what this screen's hero aims, or nothing. */
export function updateAimGuide(gameLayer: Container): void {
  const { g, text } = layers(gameLayer);
  g.clear();
  text.visible = false;
  const player = localPlayer();
  const a = aiming(player) ? currentAim(player) : null;
  if (!player || !a) return;
  const p = pointer();
  screenToWorld(p.x, p.y, aim);
  if (a.area) {
    guideArea(g, text, player, a.area, a.landsWhere === 'target');
    return;
  }
  // A shot leaves from hand height and flies at the crosshair (the hero's aim is taken from there, MovementSystem.ts), so
  // its line runs from the hands through the crosshair.
  const x = player.position.x;
  const y = player.position.y - AIM_HEIGHT;
  const dist = Math.hypot(aim.x - x, aim.y - y);
  if (dist <= 0) return;
  drawLine(g, x, y, (aim.x - x) / dist, (aim.y - y) / dist, a);
  showDistance(text, aim.x, aim.y, dist, colourFor(dist, a));
}
