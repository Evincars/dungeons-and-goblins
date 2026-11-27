import { world } from '../world';
import type { Entity } from '../world';
import { SPELLS } from '../rules/Spells';
import { inArea } from '../rules/SpellArea';
import type { VfxShot } from '../render/VfxPlayer';

/**
 * Gust of Wind blows out the flames it sweeps over (the tabletop spell disperses gas and extinguishes candles, torches and
 * similar unprotected flames): the catacombs' wall torches and the campfires go out for good, their light, sparks and
 * flicker gone, their art left without its flames (`torch_out`, `campfire_out`, built at load by assets/AssetLoader.ts).
 * Torches and campfires are built by every screen from the level's seed (`localOnly`), so every screen snuffs its own: the
 * host where the wind blows (systems/GustOfWind.ts), a guest on the wind's signal (network/CoopSession.ts).
 */

/** A flame this far (px) past the edge of the wind's line still gutters out: a torch hangs on the wall over the line's side. */
const FLAME_REACH = 16;

/** What a flame looks like once it is out, by the sheet it burns with. */
const SNUFFED_SHEET: Readonly<Record<string, string>> = { torch: 'torch_out', campfire: 'campfire_out' };

const flames = world.with('position', 'sparks', 'visual');
const end = { x: 0, y: 0 };
const origin = { x: 0, y: 0 };

/** Whether a flame is one the wind can blow out (a torch or a campfire, still burning). */
const snuffable = (fire: Entity): boolean => fire.visual !== undefined && SNUFFED_SHEET[fire.visual.sheet] !== undefined;

/** A flame goes out: no light, no sparks, no flicker; its sprite is made again from the art without flames. */
function snuff(fire: Entity): void {
  const sheet = fire.visual ? SNUFFED_SHEET[fire.visual.sheet] : undefined;
  if (!fire.visual || !sheet) return;
  fire.visual.sheet = sheet;
  world.removeComponent(fire, 'sparks');
  world.removeComponent(fire, 'torch');
  world.removeComponent(fire, 'glow');
  world.removeComponent(fire, 'animation');
  if (!fire.sprite) return;
  fire.sprite.destroy();
  world.removeComponent(fire, 'sprite');
}

/** The wind blows from (x, y) along (dirX, dirY), as far as Gust of Wind's line reaches: every flame in it goes out. */
export function snuffAlong(x: number, y: number, dirX: number, dirY: number): number {
  const def = SPELLS.gust_of_wind;
  origin.x = x;
  origin.y = y;
  end.x = x + dirX * def.range;
  end.y = y + dirY * def.range;
  let out = 0;
  for (let i = flames.entities.length - 1; i >= 0; i--) {
    const fire = flames.entities[i];
    if (!snuffable(fire) || !inArea(def, origin, end, fire.position.x, fire.position.y, FLAME_REACH)) continue;
    snuff(fire);
    out++;
  }
  return out;
}

/** A guest told of the wind's blast (its `gust-of-wind` effect) blows out its own flames along it. */
export function snuffOnSignal(shot: VfxShot): void {
  if (shot.effect === 'gust-of-wind') snuffAlong(shot.x, shot.y, shot.dirX, shot.dirY);
}
