import { Container, Sprite, Texture } from 'pixi.js';
import { world } from '../world';
import type { Entity } from '../world';
import { characterDef, headAboveFeet } from '../characters/Characters';
import { createCanvas, context2d } from '../render/canvas';
import { holdsShadowBlade } from '../rules/SpellWeapons';
import { hiddenHere } from './Invisibility';

/**
 * A plain sword floats over the head of a hero whose weapon a spell shapes (rules/SpellWeapons.ts), bobbing gently: steel
 * washed blue for Magic Weapon, a blade of violet gloom for Shadow Blade (their glints and smoke round it,
 * systems/VfxSystem.ts). Drawn on every screen from the hero's state; pooled, one per hero.
 */

/** The sword's art, drawn once: this many px wide and tall (point up). */
const ART_W = 7;
const ART_H = 18;
/** It floats this far over the top of the head (px) and bobs this far, a bob this many frames long. */
const HEAD_GAP = 6;
const BOB = 1.5;
const BOB_FRAMES = 70;
/** A head this far above the feet when the hero's art says nothing (px). */
const DEFAULT_HEAD = 30;
/** Magic Weapon's and Shadow Blade's washes over the steel. */
const MAGIC_TINT = 0x9fd0ff;
const BLADE_TINT = 0x8a5cff;
const SIGN_ALPHA = 0.92;

const armed = world.with('position', 'buffs');
const signs = new Map<Entity, Sprite>();
let texture: Texture | null = null;
let frame = 0;

/** How far over a hero's feet their sign floats (its point's foot): over their head. */
export function signLift(hero: Entity): number {
  const head = hero.character ? headAboveFeet(characterDef(hero.character.def), hero.visual?.scale) : DEFAULT_HEAD;
  return head + HEAD_GAP;
}

/** The sword, pale steel to be tinted: a blade with a bright edge, a crossguard, a grip and a pommel. */
function swordTexture(): Texture {
  if (texture) return texture;
  const canvas = createCanvas(ART_W, ART_H);
  const ctx = context2d(canvas);
  const mid = Math.floor(ART_W / 2);
  ctx.fillStyle = '#c8ccd4';
  ctx.fillRect(mid - 1, 1, 3, 11);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(mid, 0, 1, 12);
  ctx.fillStyle = '#9a8a60';
  ctx.fillRect(0, 12, ART_W, 1);
  ctx.fillStyle = '#5a4630';
  ctx.fillRect(mid, 13, 1, 3);
  ctx.fillStyle = '#c8b070';
  ctx.fillRect(mid - 1, 16, 3, 2);
  texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  return texture;
}

/** The hero's sign, made the first time it is wanted (again on a new level's layer). */
function signOf(hero: Entity, gameLayer: Container): Sprite {
  const have = signs.get(hero);
  if (have && !have.destroyed && have.parent === gameLayer) return have;
  const sign = new Sprite(swordTexture());
  sign.anchor.set(0.5, 1);
  gameLayer.addChild(sign);
  signs.set(hero, sign);
  return sign;
}

/** Whether a hero has a spell on their weapon now, and which wash it shows. */
function washOf(hero: (typeof armed.entities)[number]): number | null {
  if (holdsShadowBlade(hero.buffs)) return BLADE_TINT;
  return (hero.buffs.magicWeapon ?? 0) > 0 ? MAGIC_TINT : null;
}

/** A hero's sign is hidden (none on their weapon, or this screen does not show them). */
function hideSign(hero: Entity): void {
  const sign = signs.get(hero);
  if (sign) sign.visible = false;
}

/** Once a frame: a sword over each hero whose weapon a spell shapes; the rest hidden, those of heroes gone dropped. */
export function updateWeaponSigns(gameLayer: Container): void {
  frame++;
  for (const hero of armed) {
    const wash = hero.removed || hiddenHere(hero) || (hero.health?.current ?? 0) <= 0 ? null : washOf(hero);
    if (wash === null) {
      hideSign(hero);
      continue;
    }
    const sign = signOf(hero, gameLayer);
    sign.tint = wash;
    sign.alpha = SIGN_ALPHA;
    sign.position.set(Math.round(hero.position.x), Math.round(hero.position.y - signLift(hero) + Math.sin((frame / BOB_FRAMES) * Math.PI * 2) * BOB));
    sign.zIndex = hero.position.y + 1;
    sign.visible = true;
  }
  for (const [hero, sign] of signs) {
    if (world.id(hero) !== undefined && sign.parent === gameLayer) continue;
    sign.destroy();
    signs.delete(hero);
  }
}
