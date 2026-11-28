import { localPlayer } from '../world';
import { screenToWorld } from '../render/Camera';
import { pointer } from './InputSystem';
import { takeThrowClick } from '../game/ThrowAim';
import { requestThrow } from '../game/PlayerActions';

const aim = { x: 0, y: 0 };

/**
 * Once a tick, after the input: a throw aimed on this screen (game/ThrowAim.ts) and clicked for goes towards the crosshair —
 * at once for the host or a player alone, asked of the host for a guest.
 */
export function updateThrowAim(): void {
  const place = takeThrowClick();
  const player = localPlayer();
  if (!place || !player) return;
  const p = pointer();
  screenToWorld(p.x, p.y, aim);
  requestThrow(player, place, aim.x, aim.y);
}
