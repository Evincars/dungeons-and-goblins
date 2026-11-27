import { q, isActivePlayer, localPlayer } from '../world';
import type { Entity } from '../world';
import { text } from '../core/texts';
import { GAME_WIDTH, GAME_HEIGHT, screenToWorld } from '../render/Camera';
import { pointer, pointerFree } from '../systems/InputSystem';
import { conditionsOn } from '../systems/Conditions';
import type { ShownCondition } from '../systems/Conditions';
import { RING_COLOURS } from '../systems/ConditionRingSystem';
import { holdOf } from '../systems/SpellHolds';
import { hiddenHere } from '../systems/Invisibility';
import { isHoldKind } from '../rules/Conditions';
import { spellName } from '../rules/Names';
import { InfoTooltip } from './InfoTooltip';
import type { TipDetail, TipTopic } from './InfoTooltip';
import { durationOf } from './HudTime';

/**
 * The pointer over a hero or a foe with a ring of a condition under it (systems/ConditionRingSystem.ts): a tooltip beside it
 * names who it is and every condition it is in, in the ring's colour — what each does (the tabletop's rule as the game plays
 * it), how long it may still last and which spell holds it there. Only for what this screen shows (an unseen invisible foe
 * shows nothing).
 */

/** A body is under the pointer within this far across its feet (px) and this far up its body. */
const PICK_WIDE = 12;
const PICK_HIGH = 34;
/** Below its feet the pointer still finds it over its ring this far down. */
const PICK_LOW = 6;
/** The tooltip stands this far from the pointer. */
const ANCHOR = 6;

const held: ShownCondition[] = [];
const at = { x: 0, y: 0 };

/** Whether the world point lies over the body: its feet's ring, or its body over them. */
function over(body: Entity, x: number, y: number): boolean {
  if (!body.position) return false;
  const dx = Math.abs(x - body.position.x);
  const dy = y - body.position.y;
  return dx <= (body.radius?.x ?? 0) + PICK_WIDE && dy <= PICK_LOW && dy >= -PICK_HIGH;
}

/** The body with conditions under the pointer, if any: heroes on their feet first, then live foes. */
function bodyUnder(x: number, y: number): Entity | undefined {
  for (const hero of q.players) {
    if (isActivePlayer(hero) && over(hero, x, y) && conditionsOn(hero, held).length > 0) return hero;
  }
  for (const foe of q.mobs) {
    if (foe.health.current <= 0 || foe.removed || hiddenHere(foe) || !over(foe, x, y)) continue;
    if (conditionsOn(foe, held).length > 0) return foe;
  }
  return undefined;
}

/** What one condition says: its name and time left (and the spell holding it), then what it does. */
function conditionLines(body: Entity, condition: ShownCondition): TipDetail[] {
  const colour = RING_COLOURS[condition];
  const kind = isHoldKind(condition) ? condition : null;
  const hold = kind ? holdOf(body, kind) : undefined;
  const name = text(`condition.${condition}.name`);
  const left = hold ? ` - ${text('condition.tip.left', { left: durationOf(hold.ticks) })}` : '';
  const lines: TipDetail[] = [{ text: `${name}${left}`, color: colour }, text(`condition.${condition}.text`)];
  if (hold) lines.push(text('condition.tip.by', { spell: spellName(hold.spell) }));
  return lines;
}

/** Who the body is, for the tooltip's title: a hero's name, a foe's kind. */
function nameOf(body: Entity): string {
  if (body.playerName) return body.playerName;
  return body.mobType ? text(`mob.${body.mobType}`) : text('condition.tip.title');
}

/** The tooltip for a body's conditions. */
function topicFor(body: Entity): TipTopic {
  conditionsOn(body, held);
  const detail = held.flatMap((condition) => conditionLines(body, condition));
  return { title: nameOf(body), subtitle: text('condition.tip.title'), body: '', detail };
}

export class ConditionTip {
  private readonly tip = new InfoTooltip();
  private showing: Entity | undefined;

  get view(): InfoTooltip['view'] {
    return this.tip.view;
  }

  /** Once a frame: the tooltip of the body under the pointer, beside the pointer, or none. */
  update(): void {
    const mouse = pointer();
    screenToWorld(mouse.x, mouse.y, at);
    const body = localPlayer() && pointerFree() ? bodyUnder(at.x, at.y) : undefined;
    if (!body) {
      if (this.showing) this.tip.hide();
      this.showing = undefined;
      return;
    }
    this.showing = body;
    this.tip.showAt(topicFor(body), { x: mouse.x + ANCHOR, y: mouse.y - ANCHOR, w: ANCHOR, h: ANCHOR }, { w: GAME_WIDTH, h: GAME_HEIGHT }, 'beside');
  }

  destroy(): void {
    this.tip.hide();
  }
}
