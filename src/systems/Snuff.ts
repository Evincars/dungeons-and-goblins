import { world } from '../world';
import type { Entity } from '../world';
import { SPELLS } from '../rules/Spells';
import { inArea } from '../rules/SpellArea';
import { FLAME_PROPS } from '../level/Props';
import type { VfxShot } from '../render/VfxPlayer';

/**
 * Open flames go out in the wind and catch again in fire. Gust of Wind blows out the flames it sweeps over (the tabletop
 * spell disperses gas and extinguishes candles, torches and similar unprotected flames): the catacombs' wall torches, the
 * campfires, the castles' wall candles, candelabras and candles; their light, sparks and flicker gone, their art left
 * without its flames (`torch_out`, `campfire_out`, `prop_<kind>_out`, built at load by assets/AssetLoader.ts). Fire that
 * reaches a flame blown out (a fire spell, a fire bolt, Alchemist's Fire, the Flaming Sphere: wherever fire sets grease
 * alight, systems/Surfaces.ts `igniteGrease`) lights it again, sparks and light and all.
 * Flames are built by every screen from the level's seed (`localOnly`), so every screen puts out and lights its own: the
 * host where it happens, a guest on the wind's signal (network/CoopSession.ts) or the host's word that fire lit some again
 * (`flameEvents.onKindle`, network/CoopGame.ts).
 */

/** A flame this far (px) past the edge of the wind's line, or of the fire, still gutters out or catches: a torch hangs on the wall over the line's side. */
const FLAME_REACH = 16;

/** What a flame looks like once it is out, by the sheet it burns with. */
const SNUFFED_SHEET: Readonly<Record<string, string>> = {
  torch: 'torch_out',
  campfire: 'campfire_out',
  ...Object.fromEntries(FLAME_PROPS.map((kind) => [`prop_${kind}`, `prop_${kind}_out`])),
};

const lit = world.with('position', 'visual');
const snuffedFlames = world.with('position', 'visual', 'snuffed');
const end = { x: 0, y: 0 };
const origin = { x: 0, y: 0 };

/** Observer: the co-op host tells its guests where fire lit flames again (whoever installs it clears it). */
export const flameEvents: { onKindle: ((x: number, y: number, radius: number) => void) | null } = { onKindle: null };

/** Whether a flame is one the wind can blow out: a torch, a campfire or a candle, burning (with its light). */
const snuffable = (fire: Entity): boolean => {
  if (!fire.visual || fire.snuffed || SNUFFED_SHEET[fire.visual.sheet] === undefined) return false;
  return fire.torch !== undefined || fire.glow !== undefined;
};

/** The sprite is made again from the sheet it now shows (systems/SpriteSystem.ts). */
function redraw(fire: Entity): void {
  if (!fire.sprite) return;
  fire.sprite.destroy();
  world.removeComponent(fire, 'sprite');
}

/** A flame goes out: no light, no sparks, no flicker, kept to give back; its sprite is made again from the art without flames. */
function snuff(fire: Entity): void {
  const sheet = fire.visual ? SNUFFED_SHEET[fire.visual.sheet] : undefined;
  if (!fire.visual || !sheet) return;
  world.addComponent(fire, 'snuffed', {
    sheet: fire.visual.sheet, torch: fire.torch, glow: fire.glow, sparks: fire.sparks, animation: fire.animation,
  });
  fire.visual.sheet = sheet;
  world.removeComponent(fire, 'sparks');
  world.removeComponent(fire, 'torch');
  world.removeComponent(fire, 'glow');
  world.removeComponent(fire, 'animation');
  redraw(fire);
}

/** A flame blown out catches again: its burning art, its light, its sparks and its flicker given back. */
function kindle(fire: (typeof snuffedFlames)['entities'][number]): void {
  const was = fire.snuffed;
  world.removeComponent(fire, 'snuffed');
  fire.visual.sheet = was.sheet;
  if (was.torch) world.addComponent(fire, 'torch', was.torch);
  if (was.glow) world.addComponent(fire, 'glow', was.glow);
  if (was.sparks) world.addComponent(fire, 'sparks', was.sparks);
  if (was.animation) world.addComponent(fire, 'animation', was.animation);
  redraw(fire);
}

/** The wind blows from (x, y) along (dirX, dirY), as far as Gust of Wind's line reaches: every flame in it goes out. */
export function snuffAlong(x: number, y: number, dirX: number, dirY: number): number {
  const def = SPELLS.gust_of_wind;
  origin.x = x;
  origin.y = y;
  end.x = x + dirX * def.range;
  end.y = y + dirY * def.range;
  let out = 0;
  for (let i = lit.entities.length - 1; i >= 0; i--) {
    const fire = lit.entities[i];
    if (!snuffable(fire) || !inArea(def, origin, end, fire.position.x, fire.position.y, FLAME_REACH)) continue;
    snuff(fire);
    out++;
  }
  return out;
}

/** Fire `radius` px round (x, y) lights the flames blown out within its reach, on this screen only; how many caught. */
export function kindleLocal(x: number, y: number, radius: number): number {
  const reach = radius + FLAME_REACH;
  let caught = 0;
  for (let i = snuffedFlames.entities.length - 1; i >= 0; i--) {
    const fire = snuffedFlames.entities[i];
    if (Math.hypot(fire.position.x - x, fire.position.y - y) > reach) continue;
    kindle(fire);
    caught++;
  }
  return caught;
}

/** Fire `radius` px round (x, y) lights the flames blown out within its reach, here and (told by the host) on every guest's screen. */
export function kindleAround(x: number, y: number, radius: number): number {
  // Nothing blown out, nothing to light (the Flaming Sphere asks every tick it rolls).
  if (snuffedFlames.size === 0) return 0;
  const caught = kindleLocal(x, y, radius);
  if (caught > 0) flameEvents.onKindle?.(x, y, radius);
  return caught;
}

/** A guest told of the wind's blast (its `gust-of-wind` effect) blows out its own flames along it. */
export function snuffOnSignal(shot: VfxShot): void {
  if (shot.effect === 'gust-of-wind') snuffAlong(shot.x, shot.y, shot.dirX, shot.dirY);
}
