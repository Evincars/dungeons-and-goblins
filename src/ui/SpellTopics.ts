import type { TipTopic } from './InfoTooltip';
import { text } from '../core/texts';
import { formatDamage } from '../rules/Dice';
import { damageTypeName } from '../rules/Names';
import { spellIconKey, spellStats } from '../rules/Spellbook';
import { SPELLS, isSpellId } from '../rules/Spells';
import { featureCooldown, featureUses } from '../rules/ClassFeatures';
import type { FeatureDef } from '../rules/ClassFeatures';
import type { CatalogSpell } from '../rules/Spellbook';

/**
 * How a spell reads on a tooltip: short — its name, what kind of spell it is, how far it reaches, how it attacks and
 * the start of its text — with "More info" opening the whole text and every number for the level it is cast at.
 */

/** The tooltip's text is cut to about this many characters (at a word), ending in "...". */
const SHORT_TEXT_CHARS = 110;
const ELLIPSIS = '...';
/** How the lists' texts name what a spell asks of its target. */
const MELEE_ATTACK = /melee spell attack/i;
const RANGED_ATTACK = /ranged spell attack/i;
const SAVING_THROW = /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/;

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

/** The start of a text, cut at a word to about `max` characters and ended with "..." (a short one whole). */
export function shortText(full: string, max = SHORT_TEXT_CHARS): string {
  const flat = full.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - ELLIPSIS.length);
  const word = cut.lastIndexOf(' ');
  return `${(word > 0 ? cut.slice(0, word) : cut).replace(/[\s,.;:]+$/, '')}${ELLIPSIS}`;
}

/** What kind of spell: "Evocation cantrip", "Level 1 Evocation". */
function kindLine(spell: CatalogSpell): string {
  return spell.level === 0 ? text('spell.tip.cantrip', { school: spell.school }) : text('spell.tip.level', { level: spell.level, school: spell.school });
}

/** How a spell the game casts reaches its target: a bolt rolls to hit, darts always land, a burst is saved against, a heal mends. */
function castAttack(spell: CatalogSpell): string | null {
  if (!isSpellId(spell.id)) return null;
  const def = SPELLS[spell.id];
  if (def.kind === 'bolt') return text('spell.attack.ranged');
  if (def.kind === 'missiles') return text('spell.attack.auto');
  if (def.kind === 'heal') return text('spell.attack.heal');
  return text('spell.attack.save', { ability: text(`stat.${def.save}.name`) });
}

/** How a spell reaches its target, as the game casts it or else as its text says. */
function attackKind(spell: CatalogSpell): string {
  const cast = castAttack(spell);
  if (cast) return cast;
  if (spell.effect?.kind === 'heal') return text('spell.attack.heal');
  if (MELEE_ATTACK.test(spell.description)) return text('spell.attack.melee');
  if (RANGED_ATTACK.test(spell.description)) return text('spell.attack.ranged');
  const save = SAVING_THROW.exec(spell.description);
  return save ? text('spell.attack.save', { ability: save[1] }) : text('spell.attack.none');
}

/** "Attack: ranged spell attack, 1d10 fire": how it reaches its target, and what it rolls at this cast level. */
function attackLine(spell: CatalogSpell, castLevel: number, heroLevel: number): string {
  const attack = attackKind(spell);
  const rolled = spellStats(spell, castLevel, heroLevel).dice;
  if (!rolled) return text('spell.tip.attack', { attack });
  const dice = formatDamage(rolled.roll, rolled.extra);
  const types = spell.effect?.kind === 'heal' ? '' : (spell.effect?.damageTypes ?? []).map(damageTypeName).join(' / ');
  return text('spell.tip.attack_dice', { attack, dice: types ? `${dice} ${types}` : dice });
}

/** The numbers under the description: what the spell is, what it does at this cast level, how far, how long to recover. */
function detailLines(spell: CatalogSpell, castLevel: number, heroLevel: number, learntAt?: number): string[] {
  const stats = spellStats(spell, castLevel, heroLevel);
  const lines = [kindLine(spell), text('spell.tip.attack', { attack: attackKind(spell) })];
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

/**
 * The tooltip of a spell cast at `castLevel` by a hero of `heroLevel`, kept short: its kind, reach and attack, and the
 * start of its text; `more` holds the whole text and every number for that level.
 */
export function spellTopic(spell: CatalogSpell, castLevel: number, heroLevel: number, learntAt?: number): TipTopic {
  const higher = spell.higherLevels ? `\n${text('spell.tip.higher', { text: spell.higherLevels })}` : '';
  const icon = spellIconKey(spell.id) ?? undefined;
  const more: TipTopic = { title: spell.name, body: spell.description + higher, detail: detailLines(spell, castLevel, heroLevel, learntAt), icon };
  const detail = [kindLine(spell), rangeLine(spell), attackLine(spell, castLevel, heroLevel)];
  if (castLevel > spell.level) detail.push(text('spell.tip.cast_at', { level: castLevel }));
  if (learntAt !== undefined && learntAt > heroLevel) detail.push(text('spell.tip.learnt_at', { level: learntAt }));
  return { title: spell.name, body: shortText(spell.description), detail, more, icon };
}

/** Seconds as the tooltip writes them: whole when they are, else a tenth. */
const seconds = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1));

/** The tooltip of a class feature at the hero's level: what it is, when it came, and what a click does with it. */
export function featureTopic(feature: FeatureDef, switchedOff: boolean, heroLevel: number): TipTopic {
  const detail = [text('feature.tip.level', { level: feature.level })];
  const uses = featureUses(feature, heroLevel);
  if (feature.kind === 'passive' && feature.worked) detail.push(text(switchedOff ? 'feature.tip.passive_off' : 'feature.tip.passive_on'));
  else if (feature.kind === 'active') detail.push(text('feature.tip.active', { seconds: seconds(featureCooldown(feature, heroLevel)) }));
  else if (feature.kind === 'info') detail.push(text('feature.tip.info'));
  if (uses > 1) detail.push(text('feature.tip.uses', { uses }));
  if (feature.kind !== 'info' && !feature.worked) detail.push(text('feature.tip.unworked'));
  return { title: feature.name, body: feature.description, detail, wide: true };
}
