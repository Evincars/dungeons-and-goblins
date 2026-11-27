import { Texture } from 'pixi.js';
import { createCanvas, context2d } from '../render/canvas';
import type { DamageType } from '../rules/DamageTypes';
import type { ActionEffect } from '../rules/WeaponActions';
import type { WeaponBase } from '../rules/WeaponTable';

/**
 * The small pictures of the item tooltip (ui/ItemTooltip.ts), drawn once in pixels as Baldur's Gate's are painted: the dice
 * by the damage, a mark for each kind of damage, a weapon's or armour's sort, the enchantment's star, weight and coin, a
 * warning, who wears it — and, until their art is made, a placeholder icon for each weapon action (rules/WeaponActions.ts):
 * its effect's mark on a dark tile edged in the effect's colour.
 */

/** A glyph: 9 × 9 pixels, `#` lit. */
const GLYPHS = {
  blade: ['        #', '       # ', '      #  ', '     #   ', ' # #    ', '  #      ', ' # #     ', '#        ', '         '],
  point: ['    #####', '      ###', '     # ##', '    #   #', '   #     ', '  #      ', ' #       ', '#        ', '         '],
  hammer: [' #####   ', ' #####   ', ' #####   ', '   #     ', '    #    ', '     #   ', '      #  ', '       # ', '        #'],
  flame: ['    #    ', '   ##    ', '   ###   ', '  ####   ', '  ## ##  ', ' ##  ##  ', ' ## ###  ', '  #####  ', '   ###   '],
  flake: ['    #    ', ' #  #  # ', '  # # #  ', '   ###   ', '#########', '   ###   ', '  # # #  ', ' #  #  # ', '    #    '],
  bolt: ['     ##  ', '    ##   ', '   ##    ', '  #####  ', '    ##   ', '   ##    ', '  ##     ', ' ##      ', ' #       '],
  drop: ['    #    ', '    #    ', '   ###   ', '   ###   ', '  #####  ', '  #####  ', '  #####  ', '   ###   ', '         '],
  wave: ['         ', '  ##     ', ' #  #  # ', '#    ##  ', '         ', '  ##     ', ' #  #  # ', '#    ##  ', '         '],
  star: ['    #    ', '    #    ', '   ###   ', '#########', ' ####### ', '  #####  ', '  ## ##  ', ' ##   ## ', ' #     # '],
  axe: ['   ##    ', '  ####   ', ' ######  ', ' ### #   ', '  ## #   ', '     #   ', '     #   ', '     #   ', '     #   '],
  spear: ['        #', '       ##', '      ## ', '     #   ', '    #    ', '   #     ', '  #      ', ' #       ', '#        '],
  bow: ['  ###    ', ' #   #   ', '#     #  ', '#      # ', '#########', '#      # ', '#     #  ', ' #   #   ', '  ###    '],
  crossbow: ['    #    ', '   ###   ', '  # # #  ', ' #  #  # ', '#   #   #', '    #    ', '    #    ', '   ###   ', '    #    '],
  dagger: ['         ', '      #  ', '     #   ', '    #    ', '   #     ', ' ##      ', '  #      ', ' # #     ', '         '],
  armor: [' ##   ## ', '#########', '#########', ' ####### ', ' ####### ', ' ####### ', ' ####### ', ' ####### ', '  #####  '],
  shield: ['#########', '#########', '#########', '#########', ' ####### ', ' ####### ', '  #####  ', '   ###   ', '    #    '],
  helmet: ['   ###   ', '  #####  ', ' ####### ', ' ####### ', ' ##   ## ', ' ##   ## ', ' ##   ## ', '         ', '         '],
  sparkle: ['    #    ', '    #    ', '   ###   ', '#########', '   ###   ', '    #    ', '    #    ', '         ', '         '],
  weight: ['   ###   ', '   # #   ', '  #####  ', ' ####### ', ' ####### ', '#########', '#########', '#########', '         '],
  coin: ['  #####  ', ' ##   ## ', '## ### ##', '## #   ##', '## ### ##', '##   # ##', '## ### ##', ' ##   ## ', '  #####  '],
  warning: ['    #    ', '   ###   ', '   # #   ', '  ## ##  ', '  ## ##  ', ' ####### ', ' ### ### ', '#########', '         '],
  person: ['   ###   ', '   ###   ', '    #    ', ' ####### ', '#  ###  #', '   ###   ', '  #   #  ', '  #   #  ', '  #   #  '],
  medal: ['  #   #  ', '   # #   ', '    #    ', '   ###   ', '  #####  ', ' ### ### ', '  #####  ', '   ###   ', '         '],
  down: ['   ###   ', '   ###   ', '   ###   ', '   ###   ', '#########', ' ####### ', '  #####  ', '   ###   ', '    #    '],
  chevrons: ['#       #', ' #     # ', '  #   #  ', '   # #   ', '#   #   #', ' #     # ', '  #   #  ', '   # #   ', '    #    '],
  arc: ['  #####  ', ' #     # ', '#       #', '#       #', '         ', '         ', '    #    ', '   ###   ', '    #    '],
} as const satisfies Record<string, readonly string[]>;
export type Glyph = keyof typeof GLYPHS;

const GLYPH_SIZE = 9;
const cache = new Map<string, Texture>();

/** A glyph drawn white (tint it), pixel for pixel. */
export function glyphTexture(glyph: Glyph): Texture {
  const have = cache.get(glyph);
  if (have) return have;
  const canvas = createCanvas(GLYPH_SIZE, GLYPH_SIZE);
  const ctx = context2d(canvas);
  ctx.fillStyle = '#ffffff';
  GLYPHS[glyph].forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') ctx.fillRect(x, y, 1, 1);
  });
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  cache.set(glyph, texture);
  return texture;
}

/** Each kind of damage's mark. */
export const DAMAGE_GLYPHS = {
  slashing: 'blade', piercing: 'point', bludgeoning: 'hammer', fire: 'flame', cold: 'flake', lightning: 'bolt', acid: 'drop',
  poison: 'drop', thunder: 'wave', force: 'star', psychic: 'star', radiant: 'sparkle', necrotic: 'star',
} as const satisfies Record<DamageType, Glyph>;

/** A weapon's sort, for the tooltip's foot. */
export function weaponGlyph(base: WeaponBase): Glyph {
  if (base.includes('crossbow')) return 'crossbow';
  if (base.endsWith('bow')) return 'bow';
  if (base.includes('axe') || base === 'sickle') return 'axe';
  if (['club', 'greatclub', 'mace', 'maul', 'flail', 'morningstar', 'warhammer', 'light_hammer', 'war_pick'].includes(base)) return 'hammer';
  if (['spear', 'pike', 'halberd', 'glaive', 'trident', 'lance', 'javelin', 'quarterstaff'].includes(base)) return 'spear';
  if (['dagger', 'dart'].includes(base)) return 'dagger';
  if (['whip', 'sling', 'blowgun', 'net'].includes(base)) return 'wave';
  return 'blade';
}

/** Each weapon action's effect: its placeholder icon's mark and edge colour. */
export const ACTION_LOOKS = {
  bleeding: { glyph: 'drop', color: 0xe03a3a }, dazed: { glyph: 'star', color: 0xf0d050 }, prone: { glyph: 'down', color: 0xe8913a },
  crippled: { glyph: 'chevrons', color: 0xb070ff }, weakened: { glyph: 'chevrons', color: 0x8fcf5a }, disarmed: { glyph: 'blade', color: 0x60b0ff },
  cleave: { glyph: 'arc', color: 0xd8d8e0 }, shot: { glyph: 'point', color: 0x9fd0a0 }, brace: { glyph: 'shield', color: 0xc8a060 },
} as const satisfies Record<ActionEffect, { glyph: Glyph; color: number }>;

/** The dice beside a weapon's damage: a grey six-sided die and an orange four-sided one, drawn once. */
let dice: Texture | null = null;
export function diceTexture(): Texture {
  if (dice) return dice;
  const canvas = createCanvas(16, 14);
  const ctx = context2d(canvas);
  ctx.fillStyle = '#9aa0aa';
  ctx.fillRect(1, 4, 9, 9);
  ctx.fillStyle = '#d8dce4';
  ctx.fillRect(2, 5, 7, 7);
  ctx.fillStyle = '#2a2e36';
  for (const [x, y] of [[3, 6], [7, 6], [5, 8], [3, 10], [7, 10]]) ctx.fillRect(x, y, 1, 1);
  ctx.fillStyle = '#e07a2a';
  ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(16, 8); ctx.lineTo(8, 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffd0a0';
  ctx.fillRect(11, 5, 2, 1);
  dice = Texture.from(canvas);
  dice.source.scaleMode = 'nearest';
  return dice;
}
