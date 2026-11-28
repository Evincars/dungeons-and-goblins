import { Container, Sprite, Texture } from 'pixi.js';
import { q, isActivePlayer } from '../world';
import type { Entity } from '../world';
import { createCanvas, context2d } from '../render/canvas';
import { conditionsOn } from './Conditions';
import type { ShownCondition } from './Conditions';
import { hiddenHere } from './Invisibility';
import { conditionIconKey } from '../assets/ConditionIcons';
import { lazyTexture } from '../assets/LazyArt';

/**
 * A ring on the floor under every hero and foe in a condition (systems/Conditions.ts), one in each condition's colour, the
 * next a little wider round the last: a band of runes turning slowly and breathing in brightness, lying flat on the floor
 * as the aim guide's marks under foes do; and over its head, above its health bar, a row of the conditions' icons. Drawn on
 * this screen from the world's state, so co-op guests show them too.
 */

/** Each condition's colour. */
export const RING_COLOURS = {
  unconscious: 0x8a7cff, paralyzed: 0x5ad2ff, laughing: 0xffd84a, prone: 0xd88a3a, restrained: 0xe8e0c8, charmed: 0xff6fc8,
  maddened: 0xe0303a, frightened: 0x9b4dff, blinded: 0xb4bcc8, deafened: 0x7f8aa0, enfeebled: 0x7a8a5a, poisoned: 0x7fc23a,
  incapacitated: 0xc0c0c0, invisible: 0xffffff, burning: 0xff5a1a,
  bleeding: 0xc8102e, dazed: 0xf0d050, maimed: 0xb070ff, off_balance: 0xffa040, weak_grip: 0x8fcf5a, chest_trauma: 0xff4a6a,
  gaping_wounds: 0xa01818, hamstrung: 0x9a7aff, disarmed: 0x60b0ff,
} as const satisfies Record<ShownCondition, number>;

/** The ring's art: a band of runes this wide (px of its radius) at scale 1. */
const ART_RADIUS = 32;
const ART_SIZE = ART_RADIUS * 2 + 4;
/** Notches round the band (runes), and how thick it is. */
const RUNES = 12;
const BAND = 3;
/** Rings lie flat on the floor: this deep against how wide (as the aim guide's marks under foes). */
const FLAT = 0.42;
/** The first ring stands this far out from the body (px beyond its radius), each next one this much further; at least this wide. */
const RING_MARGIN = 4;
const RING_STEP = 4;
const MIN_RING = 10;
/** How fast the runes turn (radians a tick, each ring the other way round from the last) and breathe (ticks a breath). */
const TURN = 0.02;
const BREATH_TICKS = 70;
const BASE_ALPHA = 0.72;
const BREATH_ALPHA = 0.25;
/** Over the puddles and rugs (at -0.5), under everything that stands. */
const RING_Z = -0.4;
/** The icons over a head: this big (px), this far apart, their foot this far over the health bar's place (or the feet). */
const HEAD_ICON = 9;
const HEAD_ICON_GAP = 1;
const OVER_BAR = 3;
const HEAD_FALLBACK = -40;
/** Drawn just in front of the body (and its bar), a touch see-through. */
const HEAD_DEPTH_BIAS = 0.6;
const HEAD_ALPHA = 0.92;

/** The pool of icons over heads, in the game layer (each sorts by depth with its body). */
const heads: Sprite[] = [];

type Ring = { holder: Container; sprite: Sprite };

const rings: Ring[] = [];
const held: ShownCondition[] = [];
let texture: Texture | null = null;
let layer: Container | null = null;
let clock = 0;

/** The band of runes, white, to be tinted: a soft glow inside, a ring with notches round it. */
function ringTexture(): Texture {
  if (texture) return texture;
  const canvas = createCanvas(ART_SIZE, ART_SIZE);
  const ctx = context2d(canvas);
  const c = ART_SIZE / 2;
  const glow = ctx.createRadialGradient(c, c, ART_RADIUS * 0.4, c, c, ART_RADIUS);
  glow.addColorStop(0, 'rgba(255,255,255,0)');
  glow.addColorStop(1, 'rgba(255,255,255,0.28)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(c, c, ART_RADIUS, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = BAND;
  ctx.beginPath(); ctx.arc(c, c, ART_RADIUS - BAND, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2;
  for (let i = 0; i < RUNES; i++) {
    const a = (i / RUNES) * Math.PI * 2;
    const inner = ART_RADIUS - BAND * 3;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * inner, c + Math.sin(a) * inner);
    ctx.lineTo(c + Math.cos(a + 0.12) * (inner + BAND), c + Math.sin(a + 0.12) * (inner + BAND));
    ctx.stroke();
  }
  texture = Texture.from(canvas);
  return texture;
}

/** The rings' layer, made again for each level's game layer. */
function ringsIn(gameLayer: Container): Container {
  if (layer && !layer.destroyed && layer.parent === gameLayer) return layer;
  layer = new Container();
  layer.zIndex = RING_Z;
  gameLayer.addChild(layer);
  rings.length = 0;
  return layer;
}

/** The i-th ring of the pool, made the first time it is wanted. */
function ringAt(i: number, parent: Container): Ring {
  const have = rings[i];
  if (have) return have;
  const holder = new Container();
  holder.scale.y = FLAT;
  const sprite = new Sprite(ringTexture());
  sprite.anchor.set(0.5);
  holder.addChild(sprite);
  parent.addChild(holder);
  const ring = { holder, sprite };
  rings.push(ring);
  return ring;
}

/** Lays a body's rings under its feet from the pool, from `next` on; returns the next free one. */
function ringBody(body: Entity, parent: Container, next: number): number {
  // An invisible foe this screen does not see shows no rings either (systems/Invisibility.ts).
  if (!body.position || hiddenHere(body)) return next;
  const breath = BASE_ALPHA + BREATH_ALPHA * Math.sin((clock / BREATH_TICKS) * Math.PI * 2);
  const base = Math.max(MIN_RING, (body.radius?.x ?? MIN_RING) + RING_MARGIN);
  conditionsOn(body, held);
  for (let i = 0; i < held.length; i++) {
    const ring = ringAt(next++, parent);
    ring.holder.visible = true;
    ring.holder.position.set(Math.round(body.position.x), Math.round(body.position.y));
    ring.sprite.tint = RING_COLOURS[held[i]];
    ring.sprite.alpha = breath;
    ring.sprite.scale.set((base + i * RING_STEP) / ART_RADIUS);
    ring.sprite.rotation = clock * TURN * (i % 2 === 0 ? 1 : -1);
  }
  return next;
}

/** The i-th icon over a head, made the first time it is wanted (the pool starts afresh on each level's game layer). */
function headIconAt(i: number, gameLayer: Container): Sprite {
  // A new level's game layer: the icons left on the last one went with it.
  if (heads.length > 0 && (heads[0].destroyed || heads[0].parent !== gameLayer)) heads.length = 0;
  const have = heads[i];
  if (have) return have;
  const icon = new Sprite(Texture.EMPTY);
  icon.anchor.set(0, 1);
  gameLayer.addChild(icon);
  heads.push(icon);
  return icon;
}

/** Lays a row of the body's conditions' icons (in `held`) over its head, centred, from `next` on; returns the next free one. */
function iconsOverHead(body: Entity, gameLayer: Container, next: number): number {
  if (!body.position || held.length === 0) return next;
  const width = held.length * HEAD_ICON + (held.length - 1) * HEAD_ICON_GAP;
  const left = Math.round(body.position.x - width / 2);
  const foot = Math.round(body.position.y + (body.healthBarOffset ?? HEAD_FALLBACK) - OVER_BAR);
  for (let i = 0; i < held.length; i++) {
    const icon = headIconAt(next++, gameLayer);
    const texture = lazyTexture(conditionIconKey(held[i]));
    if (icon.texture !== texture) icon.texture = texture;
    icon.width = icon.height = HEAD_ICON;
    icon.position.set(left + i * (HEAD_ICON + HEAD_ICON_GAP), foot);
    icon.zIndex = body.position.y + HEAD_DEPTH_BIAS;
    icon.alpha = HEAD_ALPHA;
    icon.visible = texture !== Texture.EMPTY;
  }
  return next;
}

/** One body: its rings under its feet and its icons over its head. */
function markBody(body: Entity, parent: Container, gameLayer: Container, at: { ring: number; icon: number }): void {
  at.ring = ringBody(body, parent, at.ring);
  // ringBody filled `held` with the body's conditions (none for a body this screen does not see).
  if (body.position && !hiddenHere(body)) at.icon = iconsOverHead(body, gameLayer, at.icon);
}

const next = { ring: 0, icon: 0 };

/**
 * Once a tick: a ring under the feet and an icon over the head for each condition of every hero on their feet and every live
 * foe; the rest of the pools hidden.
 */
export function updateConditionRings(gameLayer: Container): void {
  const parent = ringsIn(gameLayer);
  clock++;
  next.ring = 0;
  next.icon = 0;
  for (const hero of q.players) if (isActivePlayer(hero)) markBody(hero, parent, gameLayer, next);
  for (const foe of q.mobs) if (foe.health.current > 0 && !foe.removed) markBody(foe, parent, gameLayer, next);
  for (let i = next.ring; i < rings.length; i++) rings[i].holder.visible = false;
  for (let i = next.icon; i < heads.length; i++) heads[i].visible = false;
}
