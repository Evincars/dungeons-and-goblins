import { Container, Graphics, Sprite } from 'pixi.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../render/Camera';
import { getTexture } from '../assets/Textures';
import { THEME } from './Theme';

/** The painting is darkened this much so menu text stays readable over it. */
const SHADE_ALPHA = 0.45;
const FRAME_INSET = 6;

/** The painting, scaled to cover the screen whatever its shape (cropping the overflow), centred. */
function cover(sprite: Sprite): void {
  const tex = sprite.texture;
  const scale = Math.max(GAME_WIDTH / tex.width, GAME_HEIGHT / tex.height);
  sprite.scale.set(scale);
  sprite.x = Math.round((GAME_WIDTH - tex.width * scale) / 2);
  sprite.y = Math.round((GAME_HEIGHT - tex.height * scale) / 2);
}

/** The backdrop behind every menu screen: the dungeon-door painting, shaded, inside a thin steel frame. */
export function menuBackdrop(): Container {
  const backdrop = new Container();
  const art = new Sprite(getTexture('menu_background'));
  if (art.texture.width > 0) cover(art);
  const shade = new Graphics()
    .rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: THEME.backdrop, alpha: SHADE_ALPHA })
    .rect(FRAME_INSET, FRAME_INSET, GAME_WIDTH - FRAME_INSET * 2, GAME_HEIGHT - FRAME_INSET * 2).stroke({ color: THEME.frame, width: 2 });
  backdrop.addChild(new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: THEME.backdrop }), art, shade);
  return backdrop;
}
