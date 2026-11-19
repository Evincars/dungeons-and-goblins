import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import { localPlayer } from '../world';
import type { Entity, Player } from '../world';
import { screenToWorld } from '../render/Camera';
import { chosenQuickSlot, pointer, pointerFree } from './InputSystem';
import { isInventoryOpen } from './InventorySystem';
import { isShopOpen } from './ShopSystem';
import { holdsBow } from './ArrowSystem';
import { SPELLS, isSpellId } from '../rules/Spells';
import type { SpellDef } from '../rules/Spells';
import { castDef, quickBinding } from '../rules/Spellbook';
import { weaponRule } from '../rules/Equipment';
import { weaponInHand } from '../rules/CharacterSheet';
import { metresToPx } from '../rules/Scale';
import { SPELL_STATS } from '../entities/WeaponStats';
import { nearby, Sense } from '../ai/perception/spatial';
import { PixelLabel } from '../ui/PixelText';

/**
 * Where a shot will go, shown faintly while the hero aims: a soft arc from the hero to the crosshair, the area a spell
 * will strike (where it will really go off, no further than it reaches) with a faint mark under each enemy it would catch,
 * and how far that is, in metres. Grey within reach; amber past a bow's normal range (shots roll with disadvantage
 * there); red past what it can reach at all. It follows the spell being cast (the cast key or the right button held),
 * else the bow or crossbow in hand, else the spell picked on the quick bar. Drawn on this screen only.
 */

/** Colours and how faint the guide is: its arc's dots, the area's ring and fill. */
export const IN_REACH = 0xd8d8d8;
export const PENALISED = 0xd8b060;
export const OUT_OF_REACH = 0xe06a5a;
const DOT_ALPHA = 0.4;
const RING_ALPHA = 0.35;
const FILL_ALPHA = 0.06;
const CAUGHT_ALPHA = 0.55;
/** The arc: a dot every so many px along it, so big; it bows up by this share of its length (at most ARC_RISE_MAX px). */
const DOT_STEP = 7;
const DOT_RADIUS = 0.8;
const ARC_RISE = 0.16;
const ARC_RISE_MAX = 40;
/** The arc leaves the hero this far above their feet (where a spell or arrow leaves their hands). */
const HAND_HEIGHT = 12;
/** A mark across the arc where its reach ends, when the crosshair lies past it: this long. */
const REACH_TICK = 4;
/** The mark under an enemy the area would catch: an ellipse this wide and tall. */
const CAUGHT_RX = 8;
const CAUGHT_RY = 3;
/** The distance label sits this far right of and above the crosshair. */
const LABEL_DX = 6;
const LABEL_DY = -12;
/** Over the world, under the fog and the HUD (as the corner brackets). */
const GUIDE_Z = 999_999;
/** A pixel of the map in metres (a 5-foot square, 1.5 m, is 48 px). */
const METRES_PER_PX = 1.5 / metresToPx(1.5);

/** What the hero is aiming: how far it reaches (and from where it is penalised), and the area it strikes. */
export type Aim = { reach: number; normal: number; radius: number; landsWhere: 'target' | 'caster' };

let guide: Graphics | null = null;
let label: PixelLabel | null = null;
let shownMetres = -1;
const aim = { x: 0, y: 0 };
const caught: Entity[] = [];

/** The spell a binding casts, at the level it is cast, if it is one that is aimed (a bolt, darts, an area). */
function aimedSpell(player: Player, slot: number): SpellDef | null {
  const binding = quickBinding(player, slot);
  if (!binding || !isSpellId(binding.spell)) return null;
  const def = castDef(SPELLS[binding.spell], binding.level, player.playerStats.level);
  return def.kind === 'buff' ? null : def;
}

function spellAim(def: SpellDef): Aim {
  if (def.kind === 'bolt' || def.kind === 'missiles') {
    const reach = SPELL_STATS.boltSpeed * SPELL_STATS.boltLife;
    return { reach, normal: reach, radius: 0, landsWhere: 'target' };
  }
  const landsWhere = def.range > 0 ? 'target' : 'caster';
  return { reach: def.range, normal: def.range, radius: def.radius, landsWhere };
}

/** What the hero aims now, if anything: the spell being cast, else the bow in hand, else the spell picked. */
export function currentAim(player: Player): Aim | null {
  const picked = aimedSpell(player, player.casting ? player.playerInput.spellSlot : chosenQuickSlot());
  if (player.casting && picked) return spellAim(picked);
  const distance = holdsBow(player) ? weaponRule(weaponInHand(player.equipped ?? {}) ?? undefined)?.rule.distance : undefined;
  if (distance) return { reach: metresToPx(distance[1]), normal: metresToPx(distance[0]), radius: 0, landsWhere: 'target' };
  return picked ? spellAim(picked) : null;
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
    shownMetres = -1;
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

/** The soft arc from (x0, y0) to (x1, y1), dot by dot; a tick across it where it reaches `reach` px out, if it is short of the end. */
function drawArc(g: Graphics, x0: number, y0: number, x1: number, y1: number, colour: number, reach: number): void {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const rise = Math.min(ARC_RISE_MAX, dist * ARC_RISE);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2 - rise;
  const steps = Math.max(2, Math.floor(dist / DOT_STEP));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    g.circle(u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1, DOT_RADIUS);
  }
  g.fill({ color: colour, alpha: DOT_ALPHA });
  if (reach <= 0 || reach >= dist) return;
  const t = reach / dist;
  const u = 1 - t;
  const px = u * u * x0 + 2 * u * t * cx + t * t * x1;
  const py = u * u * y0 + 2 * u * t * cy + t * t * y1;
  g.moveTo(px, py - REACH_TICK).lineTo(px, py + REACH_TICK).stroke({ color: OUT_OF_REACH, alpha: RING_ALPHA * 2, width: 1 });
}

/** The area a spell strikes, and a faint mark under each enemy standing in it. */
function drawArea(g: Graphics, x: number, y: number, radius: number, colour: number): void {
  g.circle(x, y, radius).fill({ color: colour, alpha: FILL_ALPHA }).stroke({ color: colour, alpha: RING_ALPHA, width: 1 });
  for (const foe of nearby(x, y, radius, Sense.mob, caught)) {
    if (!foe.position || (foe.health?.current ?? 0) <= 0) continue;
    g.ellipse(foe.position.x, foe.position.y, CAUGHT_RX, CAUGHT_RY);
  }
  g.stroke({ color: OUT_OF_REACH, alpha: CAUGHT_ALPHA, width: 1 });
}

/** The distance to the crosshair, in metres to a tenth, by it (written again only when it changes). */
function showDistance(text: PixelLabel, dist: number, colour: number): void {
  const metres = Math.round(dist * METRES_PER_PX * 10);
  text.position.set(Math.round(aim.x + LABEL_DX), Math.round(aim.y + LABEL_DY));
  text.tint = colour;
  if (metres === shownMetres) return;
  shownMetres = metres;
  text.text = `${(metres / 10).toFixed(1)} m`;
}

/** Once a tick: the guide for what this screen's hero aims, or nothing. */
export function updateAimGuide(gameLayer: Container): void {
  const { g, text } = layers(gameLayer);
  g.clear();
  const player = localPlayer();
  const a = aiming(player) ? currentAim(player) : null;
  text.visible = !!a;
  if (!player || !a) return;
  const p = pointer();
  screenToWorld(p.x, p.y, aim);
  const { x, y } = player.position;
  const dist = Math.hypot(aim.x - x, aim.y - y);
  const colour = colourFor(dist, a);
  showDistance(text, dist, colour);
  if (a.landsWhere === 'caster') {
    if (a.radius > 0) drawArea(g, x, y, a.radius, IN_REACH);
    return;
  }
  drawArc(g, x, y - HAND_HEIGHT, aim.x, aim.y, colour, a.reach);
  if (a.radius <= 0) return;
  // An area goes off where the shot gets to: at the crosshair, or as far towards it as it reaches.
  const share = dist > a.reach && dist > 0 ? a.reach / dist : 1;
  drawArea(g, x + (aim.x - x) * share, y + (aim.y - y) * share, a.radius, colour === OUT_OF_REACH ? PENALISED : colour);
}
