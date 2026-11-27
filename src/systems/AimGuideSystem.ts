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
import { bracketPath } from './MarkerSystem';
import { allyAt } from './AllySpells';
import { foeAt } from './SpellHolds';
import { hiddenHere } from './Invisibility';
import { stepTarget } from './MistyStep';
import type { Level } from '../level/Level';

/**
 * Where a shot will go, shown faintly while the hero aims. A bolt, darts or an arrow fly straight: a dotted line from the
 * hero's hands the way they aim, as far as the shot flies (it goes off there if it strikes nothing on the way) — grey, and
 * amber past a bow's normal range, where shots roll with disadvantage. A spell with an area shows only that area where it
 * will go off — a circle, a square (a cube), or a cone or a line from the hands — at the crosshair, or as far towards it as it reaches,
 * a faint mark under each enemy it would catch, and how far off it is, in feet. A spell for a companion (Longstrider,
 * Protection from Evil and Good) frames the hero it would go to in corner brackets, red beyond its reach. A spell's guide shows while its quick-bar key
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
/** The brackets round a companion an ally spell would go to: half their body's breadth and height, its middle this far up. */
const ALLY_BOX = { halfW: 11, halfH: 17, lift: 15 };
/** A foe's brackets stand this far out from its body each side, at least as wide as a hero's. */
const BOX_MARGIN = 4;
/** Where Misty Step comes out, a mark on the floor this wide and deep. */
const STEP_RX = 9;
const STEP_RY = 4;
/** Over the world, under the fog and the HUD (as the corner brackets). */
const GUIDE_Z = 999_999;

/**
 * What the hero is aiming: how far it reaches (and from where it is penalised), and the spell whose area it strikes (null
 * for a shot that flies straight). `radius` and `landsWhere` describe that area: its breadth, and whether it is thrown at
 * the crosshair or wrapped round the caster.
 */
export type Aim = {
  reach: number; normal: number; radius: number; landsWhere: 'target' | 'caster' | 'ally' | 'foe' | 'step'; area: AreaShape | null;
  /** The spell aimed, for a step (Misty Step: where it lands is worked out as the cast will). */
  spell?: SpellDef;
};

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
  // See Invisibility shows how far round the caster it sees; no other buff is aimed.
  if (def.kind === 'buff') return def.buff === 'see_invisibility' ? def : null;
  return def.kind === 'heal' && def.radius <= 0 ? null : def;
}

/** An area, thrown (to the crosshair, a cone or a line towards it) or round the caster. */
function areaAim(area: AreaShape): Aim {
  const thrown = area.range > 0 || fromHands(area);
  return { reach: area.range, normal: area.range, radius: area.radius, landsWhere: thrown ? 'target' : 'caster', area };
}

/** Whether a spell flies straight as a bolt does (Sleep's mote too). */
const fliesStraight = (def: SpellDef): boolean => def.kind === 'bolt' || def.kind === 'missiles' || def.kind === 'sleep';

/** A shot that flies straight (as far as a spell bolt flies), a companion to touch, or a spell's area. */
function spellAim(def: SpellDef): Aim {
  if (def.kind === 'ally') return { reach: def.range, normal: def.range, radius: 0, landsWhere: 'ally', area: null };
  if (def.kind === 'hex') return { reach: def.range, normal: def.range, radius: 0, landsWhere: 'foe', area: null };
  if (def.kind === 'teleport') return { reach: def.range, normal: def.range, radius: 0, landsWhere: 'step', area: null, spell: def };
  if (!fliesStraight(def)) return areaAim(def);
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

/** The corners of an area's outline are rounded this much (px), no more than this share of its breadth (a small area stays a shape). */
const CORNER_RADIUS = 6;
const CORNER_SHARE = 0.3;
/** A soft halo round the area's edge, this wide and this faint, and a second faint line this far inside it. */
const HALO_WIDTH = 4;
const HALO_ALPHA = 0.08;
const INSET = 3;
const INSET_ALPHA = 0.14;
/** The mark at the middle of an area thrown at a point: a small diamond this big. */
const MIDDLE_MARK = 2.5;

/** How round an area's corners are: CORNER_RADIUS, smaller for a small area. */
const cornerOf = (def: AreaShape): number => Math.min(CORNER_RADIUS, def.radius * CORNER_SHARE);

/** Traces an area's outline, `inset` px inside its edge (a circle and a square only), with rounded corners. */
function traceShape(g: Graphics, def: AreaShape, from: Point, at: Point, inset: number): void {
  const corner = cornerOf(def);
  const r = def.radius - inset;
  if (def.area === 'cube') g.roundRect(at.x - r, at.y - r, r * 2, r * 2, Math.max(0, corner - inset));
  else if (def.area === 'sphere') g.circle(at.x, at.y, r);
  else if (def.area === 'line') g.roundShape(lineCorners(def, from, at, lineEnds), corner);
  else g.roundShape(coneCorners(def, from, at, corners), corner);
}

/**
 * A spell's area as it will go off: a circle, a square (a cube), or a cone or a line from the caster's hands, its corners
 * rounded, a faint fill under a soft halo and a clean edge; a circle or a square has a faint line just inside its edge and a
 * small mark at its middle.
 */
function drawShape(g: Graphics, def: AreaShape, from: Point, at: Point): void {
  traceShape(g, def, from, at, 0);
  g.stroke({ color: IN_REACH, alpha: HALO_ALPHA, width: HALO_WIDTH })
    .fill({ color: IN_REACH, alpha: FILL_ALPHA })
    .stroke({ color: IN_REACH, alpha: RING_ALPHA, width: 1 });
  if (fromHands(def) || def.radius <= INSET * 2) return;
  traceShape(g, def, from, at, INSET);
  g.stroke({ color: IN_REACH, alpha: INSET_ALPHA, width: 1 });
  g.poly([at.x, at.y - MIDDLE_MARK, at.x + MIDDLE_MARK, at.y, at.x, at.y + MIDDLE_MARK, at.x - MIDDLE_MARK, at.y])
    .fill({ color: IN_REACH, alpha: RING_ALPHA });
}

/** The area, and a faint mark under each enemy standing in it. */
function drawArea(g: Graphics, def: AreaShape, from: Point, at: Point): void {
  drawShape(g, def, from, at);
  const near = areaBounds(def, from, at, bounds);
  for (const foe of nearby(near.x, near.y, near.r, Sense.mob, caught)) {
    if (!foe.position || (foe.health?.current ?? 0) <= 0 || hiddenHere(foe)) continue;
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

/**
 * A spell for a companion: corner brackets round the hero it would go to (the one under the crosshair, else the caster), grey
 * within its reach, red beyond it, and how far off they are.
 */
function guideAlly(g: Graphics, text: PixelLabel, player: Player, a: Aim): void {
  const ally = allyAt(player, aim.x, aim.y);
  const x = ally.position.x;
  const y = ally.position.y - ALLY_BOX.lift;
  const dist = Math.hypot(ally.position.x - player.position.x, ally.position.y - player.position.y);
  const colour = ally === player || dist <= a.reach ? IN_REACH : OUT_OF_REACH;
  bracketPath(g, x, y, ALLY_BOX.halfW, ALLY_BOX.halfH).stroke({ color: colour, alpha: RING_ALPHA * 2, width: 1 });
  if (ally !== player) showDistance(text, x + ALLY_BOX.halfW, y - ALLY_BOX.halfH, dist, colour);
}

/**
 * A hex (Hold Person, Charm Person…): corner brackets round the foe it would go to (the one under the crosshair), grey within
 * its range, red beyond it, and how far off it is; with no foe there, a small red mark at the crosshair.
 */
function guideFoe(g: Graphics, text: PixelLabel, player: Player, a: Aim): void {
  const foe = foeAt(aim.x, aim.y);
  if (!foe?.position) {
    g.circle(aim.x, aim.y, END_RADIUS).stroke({ color: OUT_OF_REACH, alpha: RING_ALPHA * 2, width: 1 });
    return;
  }
  const x = foe.position.x;
  const y = foe.position.y - ALLY_BOX.lift;
  const dist = Math.hypot(foe.position.x - player.position.x, foe.position.y - player.position.y);
  const colour = dist <= a.reach ? IN_REACH : OUT_OF_REACH;
  const halfW = Math.max(ALLY_BOX.halfW, (foe.radius?.x ?? 0) + BOX_MARGIN);
  bracketPath(g, x, y, halfW, ALLY_BOX.halfH).stroke({ color: colour, alpha: RING_ALPHA * 2, width: 1 });
  showDistance(text, x + halfW, y - ALLY_BOX.halfH, dist, colour);
}

/** Misty Step: dots to where the caster would come out of the mist, a ring there and how far it is; red at the crosshair if nowhere. */
function guideStep(g: Graphics, text: PixelLabel, player: Player, a: Aim, level: Level | undefined): void {
  const to = level && a.spell ? stepTarget(level, player, a.spell, aim.x, aim.y) : null;
  if (!to) {
    g.circle(aim.x, aim.y, END_RADIUS).stroke({ color: OUT_OF_REACH, alpha: RING_ALPHA * 2, width: 1 });
    return;
  }
  const { x, y } = player.position;
  const dist = Math.hypot(to.x - x, to.y - y);
  if (dist > 0) dots(g, x, y, (to.x - x) / dist, (to.y - y) / dist, 0, dist, IN_REACH);
  g.ellipse(to.x, to.y, STEP_RX, STEP_RY).fill({ color: IN_REACH, alpha: FILL_ALPHA }).stroke({ color: IN_REACH, alpha: RING_ALPHA * 2, width: 1 });
  showDistance(text, to.x, to.y, dist, IN_REACH);
}

/** Once a tick: the guide for what this screen's hero aims, or nothing. */
export function updateAimGuide(gameLayer: Container, level?: Level): void {
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
  if (a.landsWhere === 'ally') {
    guideAlly(g, text, player, a);
    return;
  }
  if (a.landsWhere === 'foe') {
    guideFoe(g, text, player, a);
    return;
  }
  if (a.landsWhere === 'step') {
    guideStep(g, text, player, a, level);
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
