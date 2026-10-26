import type { TipTopic } from './InfoTooltip';
import { text } from '../core/texts';
import { formatDamage } from '../rules/Dice';
import { damageTypeName } from '../rules/Names';
import { spellStats } from '../rules/Spellbook';
import type { FeatureDef } from '../rules/ClassFeatures';
import type { CatalogSpell } from '../rules/Spellbook';

/** How a spell reads on a tooltip: its text from the lists, then the numbers for the level it is cast at. */

/** "1d10 force", or "3d8 acid / cold / fire" where the caster picks the type. */
function damageLine(spell: CatalogSpell, dice: string): string {
  const types = spell.effect?.damageTypes ?? [];
  return text('spell.tip.damage', { dice, type: types.map(damageTypeName).join(' / ') });
}

function rangeLine(spell: CatalogSpell): string {
  const { feet, px } = spell.range;
  const range = feet === null || px === null || feet === 0 ? spell.range.text : text('spell.tip.range_px', { feet, px });
  return text('spell.tip.range', { range });
}

/** The numbers under the description: what the spell is, what it does at this cast level, how far, how long to recover. */
function detailLines(spell: CatalogSpell, castLevel: number, heroLevel: number, learntAt?: number): string[] {
  const stats = spellStats(spell, castLevel, heroLevel);
  const lines = [spell.level === 0 ? text('spell.tip.cantrip', { school: spell.school }) : text('spell.tip.level', { level: spell.level, school: spell.school })];
  if (castLevel > spell.level) lines.push(text('spell.tip.cast_at', { level: castLevel }));
  if (stats.dice) {
    const dice = formatDamage(stats.dice.roll, stats.dice.extra);
    lines.push(spell.effect?.kind === 'heal' ? text('spell.tip.heal', { dice }) : damageLine(spell, dice));
  }
  lines.push(rangeLine(spell), text('spell.tip.cooldown', { seconds: stats.cooldown.toFixed(1) }));
  lines.push(text('spell.tip.casting', { time: spell.castingTime }), text('spell.tip.duration', { duration: spell.duration }));
  if (learntAt !== undefined && learntAt > heroLevel) lines.push(text('spell.tip.learnt_at', { level: learntAt }));
  return lines;
}

/** The tooltip of a spell cast at `castLevel` by a hero of `heroLevel`: its whole text, and the numbers for that level. */
export function spellTopic(spell: CatalogSpell, castLevel: number, heroLevel: number, learntAt?: number): TipTopic {
  const higher = spell.higherLevels ? `\n${text('spell.tip.higher', { text: spell.higherLevels })}` : '';
  return { title: spell.name, body: spell.description + higher, detail: detailLines(spell, castLevel, heroLevel, learntAt), wide: true };
}

/** The tooltip of a class feature: what it is, when it came, and what a click does with it. */
export function featureTopic(feature: FeatureDef, switchedOff: boolean): TipTopic {
  const detail = [text('feature.tip.level', { level: feature.level })];
  if (feature.kind === 'passive' && feature.worked) detail.push(text(switchedOff ? 'feature.tip.passive_off' : 'feature.tip.passive_on'));
  else if (feature.kind === 'active') detail.push(text('feature.tip.active', { seconds: feature.cooldown }));
  else if (feature.kind === 'info') detail.push(text('feature.tip.info'));
  if (feature.kind !== 'info' && !feature.worked) detail.push(text('feature.tip.unworked'));
  return { title: feature.name, body: feature.description, detail, wide: true };
}
