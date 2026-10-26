import type { Player } from '../world';
import { ensure } from '../core/errors';
import { hasKey, isRecord } from '../core/guards';
import { DND_CLASSES, heroClass } from './Classes';
import type { DndClass } from './Classes';
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
  /** An active's recovery, in seconds. */
  cooldown: number;
  /** Only for a hero who took this fighting style. */
  needs: 'protection' | null;
  description: string;
};

const isKind = (v: unknown): v is FeatureKind => FEATURE_KINDS.some((k) => k === v);

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
    needs: r.needs === 'protection' ? 'protection' : null,
    description: String(r.description ?? ''),
  };
}

function listOf(cls: DndClass): FeatureDef[] {
  const raw: unknown = hasKey(features.classes, cls) ? features.classes[cls] : [];
  return (Array.isArray(raw) ? raw : []).map((entry) => readFeature(cls, entry));
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

/** What a hero of this class, level and fighting style has been given, in level order. */
export function featuresAt(cls: DndClass, level: number, style: string | null): FeatureDef[] {
  return CLASS_FEATURE_LIST[cls].filter((f) => f.level <= level && (f.needs === null || f.needs === style));
}

type Bearer = Pick<Player, 'heroClass' | 'playerStats' | 'featuresOff' | 'build'>;

/** Whether a class has the feature at this level (and fighting style). */
export function classHasFeature(cls: DndClass, level: number, id: string, style: string | null = null): boolean {
  const def = featureOfClass(cls, id);
  return !!def && def.level <= level && (def.needs === null || def.needs === style);
}

/** Whether a hero has the feature at their level (and fighting style), switched on or not. */
export function hasClassFeature(player: Bearer, id: string): boolean {
  return classHasFeature(heroClass(player.heroClass).dndClass, player.playerStats.level, id, player.build?.fightingStyle ?? null);
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
