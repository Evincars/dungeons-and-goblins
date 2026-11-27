import { isPlayer } from '../world';
import type { Entity, StatName } from '../world';
import { MONSTERS } from '../rules/Monsters';
import { rollDie } from '../rules/Dice';
import { heroSaveRoll } from './FeatureSystem';
import { logAbilitySave } from './RollLogSystem';

/**
 * A saving throw against something on the floor or in the air (keeping one's footing on grease, dodging a flask's splash, not
 * catching fire), shown over the head of whoever rolls it: a hero's own (their features and all), a foe's d20 + its monster
 * block's modifier. Returns whether it succeeded.
 */
export function bodySave(body: Entity, stat: StatName, dc: number): boolean {
  const save = isPlayer(body) ? heroSaveRoll(body, stat, dc) : foeSave(body, stat, dc);
  logAbilitySave(body, stat, save.total, save.success);
  return save.success;
}

function foeSave(foe: Entity, stat: StatName, dc: number): { total: number; success: boolean } {
  const total = rollDie(20) + (foe.mobType ? MONSTERS[foe.mobType].modifiers[stat] : 0);
  return { total, success: total >= dc };
}
