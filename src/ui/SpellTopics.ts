import { shortText } from './InfoTooltip';
import type { TipDetail, TipHeadline, TipTopic } from './InfoTooltip';
import { DAMAGE_COLORS, HEAL_COLOR, RANGE_COLOR, SAVE_COLOR } from './TipText';
import type { TipRun } from './TipText';
import { THEME } from './Theme';
import { text } from '../core/texts';
import { isStatName } from '../world';
import type { StatName } from '../world';
import { statShort } from '../entities/Items';
import { diceRange, formatDamage } from '../rules/Dice';
import { damageTypeName, featDescription, featName } from '../rules/Names';
import { FEATS } from '../rules/Feats';
import type { FeatId } from '../rules/Feats';
import { castDef, spellIconKey, spellStats } from '../rules/Spellbook';
import { SPELLS, isSpellId } from '../rules/Spells';
import { featureCooldown, featureUses } from '../rules/ClassFeatures';
import type { FeatureDef } from '../rules/ClassFeatures';
import type { CatalogSpell } from '../rules/Spellbook';
import type { DamageType } from '../rules/DamageTypes';
import { chargesWater } from '../systems/LastingSpells';

/**
 * How a spell reads on a tooltip, as Baldur's Gate lays it out: its name, what kind of spell it is, what it does at a
 * glance in large ("3-18 Damage", and "3d6 Acid" in the colour of acid), the start of its text with its dice, saves and
 * distances lit, and its range, attack and recovery in short framed chips ("60 ft", "DEX save"). Alt shows the whole text
 * and every number for the level it is cast at.
 */

/** How the lists' texts name what a spell asks of its target. */
const MELEE_ATTACK = /melee spell attack/i;
const RANGED_ATTACK = /ranged spell attack/i;
const SAVING_THROW = /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/;
/** The chips' colours: reach in blue, the attack in gold, concentration in violet, recovery in steel. */
const REACH_CHIP = RANGE_COLOR;
const ATTACK_CHIP = SAVE_COLOR;
const CONCENTRATION_CHIP = 0xc39bff;
const RECOVERY_CHIP = THEME.muted;
/** The headline's figure, and a spell the game does not cast yet. */
const HEADLINE_COLOR = THEME.text;
const NOT_IN_GAME = 0xe8c66a;

export { shortText };

/** "Conjuration cantrip", "Level 1 Evocation spell". */
function kindLine(spell: CatalogSpell): string {
  return spell.level === 0 ? text('spell.tip.cantrip', { school: spell.school }) : text('spell.tip.level', { level: spell.level, school: spell.school });
}

/** The ability a save names, from its full name in a spell's text ("Dexterity"). */
function statNamed(name: string): StatName | null {
  const stat = name.toLowerCase();
  return isStatName(stat) ? stat : null;
}

/** An attack, the short way and the long: a chip ("DEX save") and a line of the details ("Dexterity saving throw"). */
type Attack = { chip: string; line: string };

const attack = (key: AttackKind): Attack => ({ chip: text(`spell.chip.${key}` as const), line: text(`spell.attack.${key}` as const) });
type AttackKind = 'ranged' | 'melee' | 'auto' | 'heal' | 'self' | 'none';

function saveAttack(stat: StatName): Attack {
  return { chip: text('spell.chip.save', { ability: statShort(stat) }), line: text('spell.attack.save', { ability: text(`stat.${stat}.name` as const) }) };
}

/**
 * How a spell the game casts reaches its target: a bolt rolls to hit, darts always land, a burst (or a zone with a save) is
 * saved against, a heal mends, a buff works on the caster; a puddle, a companion's buff and fog need no roll; Sleep's mote
 * always lands.
 */
function castAttack(spell: CatalogSpell): Attack | null {
  if (!isSpellId(spell.id)) return null;
  const def = SPELLS[spell.id];
  if (def.kind === 'bolt') return attack('ranged');
  if (def.kind === 'missiles') return attack('auto');
  if (def.kind === 'heal') return attack('heal');
  if (def.kind === 'buff') return attack('self');
  if (def.kind === 'water' || def.kind === 'ally' || def.kind === 'fog') return attack('none');
  return def.save ? saveAttack(def.save) : attack('auto');
}

/** How a spell reaches its target, as the game casts it or else as its text says. */
function attackOf(spell: CatalogSpell): Attack {
  const cast = castAttack(spell);
  if (cast) return cast;
  if (spell.effect?.kind === 'heal') return attack('heal');
  if (MELEE_ATTACK.test(spell.description)) return attack('melee');
  if (RANGED_ATTACK.test(spell.description)) return attack('ranged');
  const save = SAVING_THROW.exec(spell.description);
  const stat = save ? statNamed(save[1]) : null;
  return stat ? saveAttack(stat) : attack('none');
}

/** How far it reaches: "60 ft", or what the list says where it is no distance ("Self", "Touch"). */
function reach(spell: CatalogSpell): string {
  const { feet } = spell.range;
  return feet === null || feet === 0 ? spell.range.text : text('spell.tip.feet', { feet });
}

const capitalised = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/** "3-18 Damage" over "3d6 Acid" (each type in its colour), or "2-8 Healing" over "1d8": what it rolls at this cast level. */
function headline(spell: CatalogSpell, castLevel: number, heroLevel: number): TipHeadline | undefined {
  const rolled = spellStats(spell, castLevel, heroLevel).dice;
  if (!rolled) return undefined;
  const range = diceRange(rolled.roll);
  const extra = rolled.extra ? diceRange(rolled.extra) : { min: 0, max: 0 };
  const values = { min: range.min + extra.min, max: range.max + extra.max };
  const heal = spell.effect?.kind === 'heal';
  const under: TipRun[] = [{ text: formatDamage(rolled.roll, rolled.extra), color: heal ? HEAL_COLOR : HEADLINE_COLOR }];
  if (!heal) (spell.effect?.damageTypes ?? []).forEach((type, i) => under.push({ text: (i ? '/ ' : '') + capitalised(damageTypeName(type)), color: DAMAGE_COLORS[type] }));
  return { text: text(heal ? 'spell.tip.headline_heal' : 'spell.tip.headline_damage', values), color: heal ? HEAL_COLOR : HEADLINE_COLOR, under };
}

/** The chips at the foot: how far, how it attacks, whether it is held by concentration, how long it recovers. */
function chips(spell: CatalogSpell, castLevel: number, heroLevel: number): TipRun[] {
  const out: TipRun[] = [{ text: reach(spell), color: REACH_CHIP }, { text: attackOf(spell).chip, color: ATTACK_CHIP }];
  if (spell.concentration) out.push({ text: text('spell.chip.concentration'), color: CONCENTRATION_CHIP });
  if (spell.castable) out.push({ text: text('spell.chip.recovery', { seconds: seconds(spellStats(spell, castLevel, heroLevel).cooldown) }), color: RECOVERY_CHIP });
  return out;
}

/** What is worth a word under the chips: a higher cast level, a level still to reach, a spell not in the game yet. */
function notes(spell: CatalogSpell, castLevel: number, heroLevel: number, learntAt?: number): TipDetail[] {
  const lines: TipDetail[] = [];
  if (castLevel > spell.level) lines.push(text('spell.tip.cast_at', { level: castLevel }));
  if (learntAt !== undefined && learntAt > heroLevel) lines.push(text('spell.tip.learnt_at', { level: learntAt }));
  if (!spell.castable) lines.push({ text: text('spell.tip.not_in_game'), color: NOT_IN_GAME });
  return lines;
}

/**
 * The tooltip of a spell cast at `castLevel` by a hero of `heroLevel`, kept short: its kind, what it rolls, the start of its
 * text and its chips; `more` (Alt) holds the whole text, its higher levels, and its attack, casting time and duration in full.
 */
export function spellTopic(spell: CatalogSpell, castLevel: number, heroLevel: number, learntAt?: number): TipTopic {
  const icon = spellIconKey(spell.id) ?? undefined;
  const shared = { title: spell.name, subtitle: kindLine(spell), headline: headline(spell, castLevel, heroLevel), chips: chips(spell, castLevel, heroLevel), icon };
  const higher = spell.higherLevels ? `\n${text('spell.tip.higher', { text: spell.higherLevels })}` : '';
  const full = [
    text('spell.tip.attack', { attack: attackOf(spell).line }),
    text('spell.tip.casting', { time: spell.castingTime }),
    text('spell.tip.duration', { duration: spell.duration }),
  ];
  const more: TipTopic = { ...shared, body: spell.description + higher, detail: [...full, ...notes(spell, castLevel, heroLevel, learntAt)] };
  return { ...shared, body: shortText(spell.description), detail: notes(spell, castLevel, heroLevel, learntAt), more };
}

/** "from -> to" when a number changes with the cast level, else null. */
function change(label: string, from: string, to: string): string | null {
  return from === to ? null : text('spell.tip.change', { label, from, to });
}

/**
 * The small tooltip of a level box: only what casting the spell at `castLevel` changes from its own level (its dice, a
 * magic missile's darts, its range, its cooldown).
 */
export function castLevelTopic(spell: CatalogSpell, castLevel: number, heroLevel: number): TipTopic {
  const own = spellStats(spell, spell.level, heroLevel);
  const at = spellStats(spell, castLevel, heroLevel);
  const dice = (stats: typeof own): string => (stats.dice ? formatDamage(stats.dice.roll, stats.dice.extra) : '-');
  const darts = (level: number): string => (isSpellId(spell.id) && SPELLS[spell.id].kind === 'missiles' ? String(castDef(SPELLS[spell.id], level, heroLevel).count) : '');
  const range = (stats: typeof own): string => (stats.rangeFeet === null ? spell.range.text : text('spell.tip.feet', { feet: stats.rangeFeet }));
  const label = spell.effect?.kind === 'heal' ? text('spell.tip.change_heal') : text('spell.tip.change_damage');
  const lines = [
    change(label, dice(own), dice(at)),
    change(text('spell.tip.change_darts'), darts(spell.level), darts(castLevel)),
    change(text('spell.tip.change_range'), range(own), range(at)),
    change(text('spell.tip.change_cooldown'), `${seconds(own.cooldown)}s`, `${seconds(at.cooldown)}s`),
  ].filter((line): line is string => line !== null);
  const title = text('spell.tip.cast_at', { level: castLevel });
  if (castLevel === spell.level) return { title, body: text('spell.tip.own_level') };
  return { title, body: text('spell.tip.compared', { level: spell.level }), detail: lines };
}

/**
 * The small tooltip of a kind of damage's box (Chromatic Orb): the kind in its colour, and what follows from it (thunder and
 * lightning charge water; fire sets grease alight).
 */
export function damageChoiceTopic(spell: CatalogSpell, type: DamageType): TipTopic {
  const name = capitalised(damageTypeName(type));
  const follows = type === 'fire' ? text('skills.damage_choice.fire') : chargesWater(type) ? text('skills.damage_choice.water') : '';
  return {
    title: name,
    subtitle: text('skills.damage_choice.subtitle', { spell: spell.name }),
    headline: { text: name, color: DAMAGE_COLORS[type] },
    body: [text('skills.damage_choice.body', { spell: spell.name, type: name.toLowerCase() }), follows].filter(Boolean).join(' '),
  };
}

/** A spell's tooltip for one kind of damage chosen for it (Chromatic Orb bound as fire): its headline names that kind alone. */
export function withChosenDamage(topic: TipTopic, type: DamageType): TipTopic {
  const head = topic.headline;
  if (!head?.under?.length) return topic;
  const under = [head.under[0], { text: capitalised(damageTypeName(type)), color: DAMAGE_COLORS[type] }];
  return { ...topic, headline: { ...head, under } };
}

/** Seconds as the tooltip writes them: whole when they are, else a tenth. */
const seconds = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1));

/** What a feature's recovery line says: an active's recovery, one used by charges how many it has, none for one that has none. */
function recoveryLine(feature: FeatureDef, heroLevel: number): string | null {
  const wait = featureCooldown(feature, heroLevel);
  if (feature.charges) return text('feature.tip.charges', { charges: featureUses(feature, heroLevel) });
  return wait > 0 ? text('feature.tip.active', { seconds: seconds(wait) }) : text('feature.tip.active_now');
}

/** What kind of feature: an active one used from the quick bar, a passive one, or a rule of the class. */
const FEATURE_KINDS = { active: 'feature.tip.kind_active', passive: 'feature.tip.kind_passive', info: 'feature.tip.kind_info' } as const;

/**
 * The tooltip of a class feature at the hero's level: what kind it is and when it came, what it does (a long text cut
 * short, Alt showing all of it), and what a click does with it.
 */
export function featureTopic(feature: FeatureDef, switchedOff: boolean, heroLevel: number): TipTopic {
  const detail: string[] = [];
  const uses = featureUses(feature, heroLevel);
  if (feature.kind === 'passive' && feature.worked) detail.push(text(switchedOff ? 'feature.tip.passive_off' : 'feature.tip.passive_on'));
  else if (feature.kind === 'active') detail.push(recoveryLine(feature, heroLevel) ?? '');
  else if (feature.kind === 'info') detail.push(text('feature.tip.info'));
  if (uses > 1 && !feature.charges) detail.push(text('feature.tip.uses', { uses }));
  const unworked = feature.kind !== 'info' && !feature.worked;
  const subtitle = `${text(FEATURE_KINDS[feature.kind])} - ${text('feature.tip.level', { level: feature.level })}`;
  const lines: TipDetail[] = unworked ? [...detail, { text: text('feature.tip.unworked'), color: NOT_IN_GAME }] : detail;
  return { title: feature.name, subtitle, body: feature.description, detail: lines, wide: true, icon: feature.icon ?? undefined };
}

/** A Passive Feat in the Skills tab or on the quick bar: what it does, and how it is used (and whether it is on). */
export function featTopic(feat: FeatId, on: boolean): TipTopic {
  const detail: string[] = [];
  const kind = FEATS[feat].passive;
  if (kind === 'toggle') detail.push(text(on ? 'feat.tip.toggle_on' : 'feat.tip.toggle_off'));
  else if (kind === 'active') detail.push(text('feat.tip.active', { seconds: FEATS[feat].cooldown }));
  else detail.push(text('feat.tip.auto'));
  return { title: featName(feat), subtitle: text('feat.tip.passive'), body: featDescription(feat), detail, wide: true };
}
