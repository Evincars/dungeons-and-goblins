import type { Player } from '../world';
import { ensure } from '../core/errors';
import { hasKey, isRecord } from '../core/guards';
import { heroClass } from './Classes';
import { DND_CLASSES } from './DndClasses';
import type { DndClass } from './DndClasses';
import { hasPick } from './Archetypes';
import type { Picks } from './Archetypes';
import features from '../data/features.json';

/**
 * Every class feature of the 5th edition SRD for the classes in play, read from src/data/features.json: the Skills
 * tab lists them by hero level. A passive is on from the level it comes at and a click switches it off and on
 * (`featuresOff` on the player holds the ones switched off); an active goes on the quick bar and is used with the cast
 * key; an info feature is a rule or a choice with nothing to switch.
 */

export const FEATURE_KINDS = ['passive', 'active', 'info'] as const;
export type FeatureKind = (typeof FEATURE_KINDS)[number];

/** The word that makes a quick-bar binding a class feature instead of a spell (`feature:second_wind`). */
export const FEATURE_PREFIX = 'feature:';
/** The most a hero can have switched off (every feature there is would be fewer). */
export const MAX_FEATURES = 64;

export type FeatureDef = {
  id: string;
  name: string;
  level: number;
  kind: FeatureKind;
  /** Whether the game plays the feature out. */
  worked: boolean;
  /** An active's recovery, in seconds (shared out among its uses). */
  cooldown: number;
  /** The hero levels at which an active has more uses (Action Surge: 2 uses at level 17); sorted, the first is its starting level. */
  uses: readonly { level: number; uses: number }[];
  /** Only for a hero who chose this fighting style, archetype or maneuver. */
  needs: string | null;
  /** Off the list once this choice is made (the entry that asks for a style or an archetype goes when it is picked). */
  unless: string | null;
  /** The feature this one takes the place of from the level it comes (Superior Critical for Improved Critical). */
  replaces: string | null;
  /** The feature that takes this one's place, found when the file is read. */
  supersededBy: FeatureDef | null;
  description: string;
};

const isKind = (v: unknown): v is FeatureKind => FEATURE_KINDS.some((k) => k === v);

/** An active's uses by level, as `{ "2": 1, "17": 2 }` in the file. */
function readUses(cls: string, raw: unknown): { level: number; uses: number }[] {
  if (raw === undefined) return [];
  ensure(isRecord(raw), `Bad uses in class ${cls}`, { cls });
  const entries = Object.entries(isRecord(raw) ? raw : {}).map(([level, uses]) => ({ level: Number(level), uses: Number(uses) }));
  ensure(entries.every((e) => Number.isInteger(e.level) && Number.isInteger(e.uses) && e.uses >= 1), `Bad uses in class ${cls}`, { cls });
  return entries.sort((a, b) => a.level - b.level);
}

function readFeature(cls: string, raw: unknown): FeatureDef {
  ensure(isRecord(raw) && typeof raw.id === 'string' && typeof raw.name === 'string' && isKind(raw.kind), `Bad feature in class ${cls}`, { cls });
  const r = isRecord(raw) ? raw : {};
  return {
    id: String(r.id),
    name: String(r.name),
    level: typeof r.level === 'number' ? r.level : 1,
    kind: isKind(r.kind) ? r.kind : 'info',
    worked: r.worked === true,
    cooldown: typeof r.cooldown === 'number' ? r.cooldown : 0,
    needs: typeof r.needs === 'string' ? r.needs : null,
    unless: typeof r.unless === 'string' ? r.unless : null,
    replaces: typeof r.replaces === 'string' ? r.replaces : null,
    supersededBy: null,
    uses: readUses(cls, r.uses),
    description: String(r.description ?? ''),
  };
}

function listOf(cls: DndClass): FeatureDef[] {
  const raw: unknown = hasKey(features.classes, cls) ? features.classes[cls] : [];
  const list = (Array.isArray(raw) ? raw : []).map((entry) => readFeature(cls, entry));
  for (const feature of list) {
    const old = feature.replaces === null ? undefined : list.find((f) => f.id === feature.replaces);
    ensure(feature.replaces === null || !!old, `Feature ${feature.id} replaces an unknown feature in class ${cls}`, { cls });
    if (old) old.supersededBy = feature;
  }
  return list;
}

/** The features of each D&D class in play, by level. */
export const CLASS_FEATURE_LIST = {
  fighter: listOf('fighter'),
  wizard: listOf('wizard'),
  rogue: listOf('rogue'),
  warlock: listOf('warlock'),
  bard: listOf('bard'),
  cleric: listOf('cleric'),
} as const satisfies Record<DndClass, readonly FeatureDef[]>;

/** One class's feature by id (the same id may be in several classes, with each its own text). */
export function featureOfClass(cls: DndClass, id: string): FeatureDef | undefined {
  return CLASS_FEATURE_LIST[cls].find((f) => f.id === id);
}

const chosen = (f: FeatureDef, level: number, picks: Picks | null): boolean =>
  f.level <= level && (f.needs === null || hasPick(picks, f.needs)) && (f.unless === null || !hasPick(picks, f.unless));

/** The hero has the feature: it has come, they chose what it asks for, and a better one has not taken its place. */
const given = (f: FeatureDef, level: number, picks: Picks | null): boolean =>
  chosen(f, level, picks) && !(f.supersededBy && chosen(f.supersededBy, level, picks));

/** What a hero of this class, level and choices (styles, archetype, maneuvers) has been given, in level order. */
export function featuresAt(cls: DndClass, level: number, picks: Picks | null): FeatureDef[] {
  return CLASS_FEATURE_LIST[cls].filter((f) => given(f, level, picks));
}

/** How many times an active can be used in a row at this hero level (its recovery is shared among them). */
export function featureUses(def: FeatureDef, level: number): number {
  let uses = 1;
  for (const step of def.uses) if (level >= step.level) uses = step.uses;
  return uses;
}

/** An active's recovery, in seconds, at this hero level: each use recovers in its share of the whole. */
export function featureCooldown(def: FeatureDef, level: number): number {
  return def.cooldown / featureUses(def, level);
}

/** The `n`th active feature (0: the first) a hero of this class, level and fighting style has, in level order. */
export function nthActiveFeature(cls: DndClass, level: number, style: string | null, n: number): FeatureDef | undefined {
  let left = n;
  for (const f of CLASS_FEATURE_LIST[cls]) {
    if (f.kind !== 'active' || f.level > level || (f.needs !== null && f.needs !== style)) continue;
    if (left-- === 0) return f;
  }
  return undefined;
}

type Bearer = Pick<Player, 'heroClass' | 'playerStats' | 'featuresOff' | 'build'>;

/** Whether a class has the feature at this level (and choices). */
export function classHasFeature(cls: DndClass, level: number, id: string, picks: Picks | null = null): boolean {
  const def = featureOfClass(cls, id);
  return !!def && given(def, level, picks);
}

/** Whether a hero has the feature at their level (and choices), switched on or not. */
export function hasClassFeature(player: Bearer, id: string): boolean {
  return classHasFeature(heroClass(player.heroClass).dndClass, player.playerStats.level, id, player.build ?? null);
}

/** The hero has the feature and has not switched it off: its effect applies. */
export function featureOn(player: Bearer, id: string): boolean {
  return hasClassFeature(player, id) && !player.featuresOff?.includes(id);
}

/** The feature id a quick-bar binding names, if it names one. */
export function bindingFeatureId(spell: string): string | null {
  return spell.startsWith(FEATURE_PREFIX) ? spell.slice(FEATURE_PREFIX.length) : null;
}

export const featureBinding = (id: string): string => `${FEATURE_PREFIX}${id}`;

/** Every feature id in the file, for checking what comes over the network. */
const ALL_IDS = new Set(DND_CLASSES.flatMap((cls) => CLASS_FEATURE_LIST[cls].map((f) => f.id)));
export const isFeatureId = (id: unknown): id is string => typeof id === 'string' && ALL_IDS.has(id);

/** Whether a hero of this class and level may switch this feature (a worked passive they have). */
export function canToggle(player: Bearer, id: unknown): boolean {
  if (!isFeatureId(id)) return false;
  const def = featureOfClass(heroClass(player.heroClass).dndClass, id);
  return !!def && def.kind === 'passive' && def.worked && hasClassFeature(player, id);
}
