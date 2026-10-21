import { Graphics } from 'pixi.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../render/Camera';

const BACKDROP = 0x080506;
const FRAME = 0x4a3520;
const FRAME_INSET = 6;

/** The dark stone backdrop behind every menu screen, with a thin copper frame. */
export function menuBackdrop(): Graphics {
  return new Graphics()
    .rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: BACKDROP })
    .rect(FRAME_INSET, FRAME_INSET, GAME_WIDTH - FRAME_INSET * 2, GAME_HEIGHT - FRAME_INSET * 2).stroke({ color: FRAME, width: 2 });
}
