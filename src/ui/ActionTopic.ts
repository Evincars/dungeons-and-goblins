import type { Player } from '../world';
import { text } from '../core/texts';
import { statShort } from '../entities/Items';
import { characterSheet } from '../rules/CharacterSheet';
import { weaponName } from '../rules/Names';
import { actionIconKey, weaponsWithAction } from '../rules/WeaponActions';
import type { WeaponAction } from '../rules/WeaponActions';
import { RING_COLOURS } from '../systems/ConditionRingSystem';
import { actionAvailable, actionDc, actionOff } from '../systems/WeaponActions';
import type { TipDetail, TipTopic } from './InfoTooltip';
import type { TipRun } from './TipText';
import { THEME } from './Theme';

/**
 * What a weapon action's tooltip tells, as Baldur's Gate tells it: its name and icon, "Weapon Action", what it does, then in
 * framed chips its cost and how often it may be used, and in lines its damage, the save its target makes (with the hero's DC)
 * and the condition it lays, in the condition's colour with what that does; how the game plays it where real time asks
 * otherwise; and how it stands for the hero now (ready, used until a short rest, needs proficiency or the weapon).
 */

const COST_COLOR = 0x5ee06a;
const BONUS_COLOR = 0xf0a030;
const PLAYED_COLOR = 0x9fb4c8;
const STATE_READY = 0x8fd18f;
const STATE_BLOCKED = 0xff7060;

/** A cost in its colour: an action green, a bonus action orange (as Baldur's Gate marks them), the rest plain. */
function costRun(action: WeaponAction): TipRun {
  const color = action.cost === 'action' ? COST_COLOR : action.cost === 'bonus' ? BONUS_COLOR : THEME.buttonText;
  return { text: text(`action.cost.${action.cost}`), color };
}

/** How the action stands for the hero now. */
function stateLine(action: WeaponAction, hero: Player): TipDetail {
  if (action.kind === 'reaction' && actionOff(hero, action.id)) return { text: text('action.tip.off'), color: THEME.muted };
  const can = actionAvailable(hero, action.id);
  if (can === 'ok') return { text: text('action.tip.ready'), color: STATE_READY };
  if (can === 'spent') return { text: text('action.tip.spent'), color: STATE_BLOCKED };
  if (can === 'untrained') return { text: text('action.tip.untrained'), color: STATE_BLOCKED };
  const weapons = weaponsWithAction(action.id).map((base) => weaponName(base)).join(', ');
  return { text: text('action.tip.needs', { weapons }), color: STATE_BLOCKED };
}

/** The save and the condition it lays: "CON save DC 14", then "Bleeding: 2 turns" in its colour and what it does. */
function conditionLines(action: WeaponAction, hero: Player | undefined): TipDetail[] {
  const lines: TipDetail[] = [];
  if (action.save) {
    const dc = hero ? actionDc(characterSheet(hero), action) : null;
    lines.push(dc === null ? statShort(action.save) : text('action.tip.save', { stat: statShort(action.save), dc }));
  }
  const condition = action.condition;
  if (!condition) return lines;
  const turns = action.turns === 1 ? text('action.tip.turn') : text('action.tip.turns', { turns: action.turns });
  lines.push({ text: `${text(`condition.${condition}.name`)}: ${turns}`, color: RING_COLOURS[condition] });
  lines.push(text(`condition.${condition}.text`));
  return lines;
}

/** A weapon action's tooltip, for this hero (their DC and how the action stands for them) when one is given. */
export function actionTopic(action: WeaponAction, hero?: Player): TipTopic {
  const chips: TipRun[] = [costRun(action), { text: text(`action.recharge.${action.perRest ? 'short_rest' : 'unlimited'}`), color: THEME.muted }];
  const detail: TipDetail[] = [];
  if (action.damage !== 'none') detail.push(text(`action.damage.${action.damage}`));
  detail.push(...conditionLines(action, hero));
  if (action.playedAs) detail.push({ text: text('action.tip.played', { text: action.playedAs }), color: PLAYED_COLOR });
  if (hero) detail.push(stateLine(action, hero));
  return { title: action.name, subtitle: text('action.tip.subtitle'), body: action.text, icon: actionIconKey(action.id), chips, detail, wide: true };
}
