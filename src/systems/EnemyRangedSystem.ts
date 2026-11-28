import { world, q, isActivePlayer, isMob, Team } from '../world';
import type { Entity, Player } from '../world';
import type { Level } from '../level/Level';
import { GAME_WIDTH, VIEW_HEIGHT } from '../render/Camera';
import { weaponStats } from '../rules/WeaponTable';
import { monsterAttack } from '../rules/CharacterSheet';
import { MONSTERS } from '../rules/Monsters';
import { abilityModifier, proficiencyBonus } from '../rules/Abilities';
import { SPELLS } from '../rules/Spells';
import type { SpellDef } from '../rules/Spells';
import { castDef } from '../rules/Spellbook';
import { diceRange, rollDice, rollDie } from '../rules/Dice';
import { feetToPx } from '../rules/Scale';
import { areaCentre, areaReach, inArea } from '../rules/SpellArea';
import type { Point } from '../rules/SpellArea';
import { MIN_HIT_DAMAGE } from '../rules/Combat';
import { createArrow, createSpellBolt } from '../entities/ProjectileFactory';
import { ARROW_STATS, ATTACK_PERIOD, SPELL_STATS } from '../entities/WeaponStats';
import { sound } from '../audio/SoundPlayer';
import { MOB_CRIES, SPELL_SOUNDS } from '../audio/SoundBank';
import { heroSavingThrow } from './FeatureSystem';
import { hurtPlayer } from './CombatSystem';
import { impactOf, playBurstArt, playCastArt, playStrikeArt } from './SpellSystem';
import { chargesWater, conducted, electrifyArea } from './LastingSpells';
import { notePressed } from './CloseQuarters';
import { isBackingOff } from '../ai/execution/skirmish';
import { sightObscured, unseenBy } from '../ai/perception/obscured';
import { igniteGrease } from './Surfaces';
import { heldIn, hexHero, incapacitated, takes } from './SpellHolds';
import { STALK_TICKS, castSeeInvisibility, makeInvisible, revealOnAct, seesInvisible } from './Invisibility';
import { dropAlong, gustFrom } from './GustOfWind';
import type { SpellId } from '../rules/Spells';

/**
 * Enemies that fight from afar: goblins with a bow or crossbow, and the spellcasters (the red ghost a sorcerer, the evil
 * wizard a wizard, the shades with their chill), casting the heroes' own spells (src/data/spells.json, scaled for their
 * level as a hero's are, castDef) so that whatever changes in a spell changes for them too. They only ever shoot at a hero
 * who could see them: in the line of sight, and inside the screen that hero sees (never from somewhere off it). They
 * stand to shoot, lead a running target, and a caster picks the spell that does the most harm now: a burst where several
 * heroes stand together, the strongest bolt at one. The host's work alone.
 */

/** How far inside the edges of a hero's screen an enemy must stand to shoot at them (px). */
const SCREEN_MARGIN = 24;
/** Nearer than this an archer fights hand to hand (it has no room to draw); it shoots from no further than its long range. */
const POINT_BLANK = 40;
/** An archer looses an arrow this often (ticks): a little slower than a sword is swung. */
const SHOT_PERIOD = Math.round(ATTACK_PERIOD * 1.5);
/** A caster casts at most this often (ticks), whatever its spells' recovery. */
const CAST_PERIOD = ATTACK_PERIOD * 2;
/** The highest level of spell a caster of a level can cast (a full caster's: half its level, rounded up, up to 9th). */
const MAX_SPELL_LEVEL = 9;
const LEVELS_PER_SPELL_LEVEL = 2;
/** A spell's base DC, before proficiency and the ability. */
const DC_BASE = 8;

const ranged = world.with('position', 'velocity', 'mobType', 'health', 'ai');
type Shooter = (typeof ranged)['entities'][number];

/** Whether an enemy carries a bow or crossbow. */
function archer(mob: Shooter): boolean {
  return !!mob.mobWeapon && weaponStats(mob.mobWeapon).range === 'ranged';
}

/** Whether a point lies inside the screen a hero sees (centred on them, as their camera is). */
function onTheirScreen(hero: Player, x: number, y: number): boolean {
  return Math.abs(x - hero.position.x) <= GAME_WIDTH / 2 - SCREEN_MARGIN && Math.abs(y - hero.position.y) <= VIEW_HEIGHT / 2 - SCREEN_MARGIN;
}

/** The nearest hero within `reach` who can see the enemy (line of sight, on their screen). */
export function targetFor(level: Level, mob: Shooter, reach: number): Player | null {
  let best: Player | null = null;
  let bestD = reach;
  for (const hero of q.players) {
    if (!isActivePlayer(hero) || level.isWorldPosSafe(hero.position.x, hero.position.y)) continue;
    const d = Math.hypot(hero.position.x - mob.position.x, hero.position.y - mob.position.y);
    if (d > bestD || !onTheirScreen(hero, mob.position.x, mob.position.y)) continue;
    if (!level.checkLineOfSight(mob.position.x, mob.position.y, hero.position.x, hero.position.y)) continue;
    // A hero in fog, or behind it, is not seen (ai/perception/obscured.ts); nor by a blinded foe, nor an invisible hero.
    if (sightObscured(mob.position.x, mob.position.y, hero.position.x, hero.position.y) || unseenBy(mob, hero)) continue;
    best = hero;
    bestD = d;
  }
  return best;
}

/** The way to aim (a unit vector, reused every tick): reworked by `aimAt`. */
const aim = { x: 0, y: 1 };
/** Where the burst being weighed or cast goes off (areaCentre writes it). */
const centreAt: Point = { x: 0, y: 0 };

/** Aims at a hero so a shot `speed` px a tick meets them: ahead of where they run. */
function aimAt(mob: Shooter, hero: Player, speed: number): typeof aim {
  const d = Math.hypot(hero.position.x - mob.position.x, hero.position.y - mob.position.y);
  const t = d / speed;
  const dx = hero.position.x + (hero.velocity?.x ?? 0) * t - mob.position.x;
  const dy = hero.position.y + (hero.velocity?.y ?? 0) * t - mob.position.y;
  const len = Math.hypot(dx, dy) || 1;
  aim.x = dx / len;
  aim.y = dy / len;
  return aim;
}

/** The enemy stands to shoot or cast: it stops where it is this tick, facing its mark. */
function standAndAim(mob: Shooter, dir: typeof aim): void {
  mob.velocity.x = 0;
  mob.velocity.y = 0;
  if (mob.aimVector) {
    mob.aimVector.x = dir.x;
    mob.aimVector.y = dir.y;
  }
}

/** An archer looses at the hero it sees, from beyond arm's reach and within its long range. */
function shoot(level: Level, mob: Shooter): boolean {
  if (!archer(mob) || !mob.mobWeapon) return false;
  const distance = weaponStats(mob.mobWeapon).distance;
  if (!distance) return false;
  const reach = { normal: feetToPx(distance[0]), long: feetToPx(distance[1]) };
  const hero = targetFor(level, mob, reach.long);
  if (!hero || Math.hypot(hero.position.x - mob.position.x, hero.position.y - mob.position.y) < POINT_BLANK) return false;
  const dir = aimAt(mob, hero, ARROW_STATS.speed);
  standAndAim(mob, dir);
  if ((mob.attackCooldown ?? 0) > 0) return true;
  mob.attackCooldown = SHOT_PERIOD;
  mob.attackTime = SHOT_PERIOD / 2;
  revealOnAct(mob);
  const arrow = createArrow(mob.position.x, mob.position.y, dir.x, dir.y, monsterAttack(mob.mobType, mob.mobWeapon), world.id(mob), reach, Team.Mob);
  notePressed(arrow, mob);
  sound.playSound('bow_shot', mob.position.x, mob.position.y);
  return true;
}

/** How far a spell reaches from its caster: a bolt as far as it flies, a hex or gust its range, a burst its range plus its breadth. */
function spellReach(def: SpellDef): number {
  if (def.kind === 'bolt' || def.kind === 'missiles') return SPELL_STATS.boltSpeed * SPELL_STATS.boltLife;
  if (def.kind === 'hex' || def.kind === 'gust') return def.range;
  if (def.kind === 'buff') return 0;
  return areaReach(def);
}

/** The heroes on their feet a burst cast from the enemy, going off at `centre`, would catch. */
function heroesCaught(mob: Shooter, def: SpellDef, centre: Point): number {
  let count = 0;
  for (const hero of q.players) {
    if (isActivePlayer(hero) && inArea(def, mob.position, centre, hero.position.x, hero.position.y)) count++;
  }
  return count;
}

/** Where a burst cast at a hero goes off: on them, or as far towards them as it reaches (a cone, its tip that way). */
function burstCentre(mob: Shooter, def: SpellDef, hero: Player): Point {
  return areaCentre(def, mob.position, hero.position, centreAt);
}

/**
 * What a spell would be worth now: its mean damage, times the darts it looses or the heroes its burst catches; holding a hero
 * not yet held (Hold Person) as much as a strong blow; a gust of wind only where it would blow a hero over a brink.
 */
function spellValue(level: Level, mob: Shooter, def: SpellDef, hero: Player): number {
  const mean = diceRange(def.damage).average;
  if (def.kind === 'bolt') return mean;
  if (def.kind === 'missiles') return mean * def.count;
  if (def.kind === 'hex') return def.condition && def.condition !== 'charmed' && !heldIn(hero, def.condition) && takes(def, def.condition, hero) ? HEX_WORTH : 0;
  if (def.kind === 'gust') return gustWorth(level, mob, def, hero);
  if (def.kind !== 'burst') return 0;
  const centre = burstCentre(mob, def, hero);
  return mean * heroesCaught(mob, def, centre);
}

/** Holding a hero (paralysed: every blow at them has advantage, a critical from close by) is worth this much harm. */
const HEX_WORTH = 14;
/** Blowing a hero over the brink of a drop is worth this much (they fall). */
const DROP_WORTH = 40;

/** A gust at the hero is worth casting only if it would blow them (in its line, beyond the caster) over a drop. */
function gustWorth(level: Level, mob: Shooter, def: SpellDef, hero: Player): number {
  const dx = hero.position.x - mob.position.x;
  const dy = hero.position.y - mob.position.y;
  const d = Math.hypot(dx, dy);
  if (d === 0 || d > def.range) return 0;
  return dropAlong(level, hero.position.x, hero.position.y, dx / d, dy / d, def.push) ? DROP_WORTH : 0;
}

type Caster = NonNullable<Entity['mobCaster']>;

/** The caster's spell attack bonus and save DC: proficiency for its level and its casting ability. */
function castingOf(mob: Shooter, caster: Caster): { attack: number; dc: number } {
  const bonus = proficiencyBonus(caster.level) + abilityModifier(MONSTERS[mob.mobType].abilities[caster.ability]);
  return { attack: bonus, dc: DC_BASE + bonus };
}

/** A spell as a caster of a level casts it (its cantrip dice grown), worked out once per spell and level. */
const scaled = new Map<SpellDef, Map<number, SpellDef>>();
function scaledSpell(base: SpellDef, level: number): SpellDef {
  let byLevel = scaled.get(base);
  if (!byLevel) {
    byLevel = new Map();
    scaled.set(base, byLevel);
  }
  let def = byLevel.get(level);
  if (!def) {
    def = castDef(base, base.level, level);
    byLevel.set(level, def);
  }
  return def;
}

/** The spell (its index) that does the most harm at a hero now, of those recovered, known at its level and in reach. */
function bestSpell(level: Level, mob: Shooter, caster: Caster, hero: Player): { index: number; def: SpellDef } | null {
  const maxLevel = Math.min(MAX_SPELL_LEVEL, Math.ceil(caster.level / LEVELS_PER_SPELL_LEVEL));
  const d = Math.hypot(hero.position.x - mob.position.x, hero.position.y - mob.position.y);
  let best = -1;
  let bestDef: SpellDef | null = null;
  let bestValue = 0;
  for (let index = 0; index < caster.spells.length; index++) {
    const base = SPELLS[caster.spells[index]];
    if (caster.recovery[index] > 0 || base.level > maxLevel) continue;
    const def = scaledSpell(base, caster.level);
    const value = d > spellReach(def) ? 0 : spellValue(level, mob, def, hero);
    if (value <= bestValue) continue;
    bestValue = value;
    best = index;
    bestDef = def;
  }
  return bestDef ? { index: best, def: bestDef } : null;
}

/** Whether a burst from the enemy going off at `centre` reaches this hero: in its area, or in water it charged (`wet`). */
function burstReaches(mob: Shooter, def: SpellDef, centre: Point, hero: Player, wet: boolean): boolean {
  if (!isActivePlayer(hero)) return false;
  const { x, y } = hero.position;
  return inArea(def, mob.position, centre, x, y) || (wet && conducted(x, y));
}

/**
 * A burst on the heroes: each in it saves against the caster's DC, taking half on a success (none, from a cantrip). Thunder
 * and lightning charge the water they reach, and the water conducts them to every hero standing in it.
 */
function burstOnHeroes(mob: Shooter, def: SpellDef, centre: Point, dc: number): void {
  playBurstArt(mob, def, centre);
  if (def.damageType === 'fire') igniteGrease(centre.x, centre.y, def.radius, world.id(mob) ?? -1);
  const wet = chargesWater(def.damageType) && electrifyArea(def, mob.position, centre) > 0;
  for (const hero of q.players) {
    if (!burstReaches(mob, def, centre, hero, wet)) continue;
    playStrikeArt(def, hero.position.x, hero.position.y);
    const saved = heroSavingThrow(hero, def.save ?? 'dexterity', dc, rollDie, mob);
    const rolled = Math.max(MIN_HIT_DAMAGE, rollDice(def.damage, false, rollDie, 0));
    const damage = saved ? (def.level === 0 ? 0 : Math.floor(rolled / 2)) : rolled;
    if (damage > 0) hurtPlayer(hero, mob, damage, def.damageType);
  }
}

/** A caster casts the spell that does the most harm at the hero it sees, standing to cast it. */
function cast(level: Level, mob: Shooter): boolean {
  const caster = mob.mobCaster;
  if (!caster) return false;
  let reach = 0;
  for (const id of caster.spells) reach = Math.max(reach, spellReach(SPELLS[id]));
  const hero = targetFor(level, mob, reach);
  // Spells on itself first: See Invisibility when an invisible hero is near, Invisibility as it first notices the heroes.
  if (castOnSelf(mob, caster, hero)) return true;
  if (!hero) return false;
  const pick = bestSpell(level, mob, caster, hero);
  if (!pick) return false;
  const dir = aimAt(mob, hero, SPELL_STATS.boltSpeed);
  standAndAim(mob, dir);
  if ((mob.attackCooldown ?? 0) > 0) return true;
  const { def, index } = pick;
  const { attack, dc } = castingOf(mob, caster);
  caster.recovery[index] = Math.max(def.recoveryTicks, CAST_PERIOD);
  mob.attackCooldown = CAST_PERIOD;
  mob.attackTime = CAST_PERIOD / 2;
  sound.playSound(SPELL_SOUNDS[def.id] ?? MOB_CRIES[mob.mobType].attack, mob.position.x, mob.position.y);
  // Casting a spell at the heroes ends its invisibility (systems/Invisibility.ts).
  revealOnAct(mob);
  release(mob, def, dir, hero, { attackBonus: attack, damage: def.damage, mode: 'normal' }, dc);
  return true;
}

/** The index of a spell the caster knows, has recovered and can cast at its level, else -1. */
function readySpell(caster: Caster, id: SpellId): number {
  const index = caster.spells.indexOf(id);
  const maxLevel = Math.min(MAX_SPELL_LEVEL, Math.ceil(caster.level / LEVELS_PER_SPELL_LEVEL));
  return index >= 0 && caster.recovery[index] <= 0 && SPELLS[id].level <= maxLevel ? index : -1;
}

/** Whether an invisible hero stands within See Invisibility's reach of the enemy. */
function invisibleHeroNear(mob: Shooter): boolean {
  const reach = SPELLS.see_invisibility.radius;
  for (const hero of q.players) {
    if (isActivePlayer(hero) && hero.invisible && Math.hypot(hero.position.x - mob.position.x, hero.position.y - mob.position.y) <= reach) return true;
  }
  return false;
}

/**
 * A caster's spells on itself: See Invisibility once an invisible hero is near and it cannot see them; Invisibility when it
 * sees a hero and is not invisible yet, then it stalks them unseen a while before it strikes. Returns whether it cast.
 */
function castOnSelf(mob: Shooter, caster: Caster, hero: Player | null): boolean {
  if ((mob.attackCooldown ?? 0) > 0) return false;
  const see = readySpell(caster, 'see_invisibility');
  if (see >= 0 && !seesInvisible(mob) && invisibleHeroNear(mob)) {
    selfCast(mob, caster, see);
    castSeeInvisibility(mob, SPELLS.see_invisibility);
    return true;
  }
  const hide = readySpell(caster, 'invisibility');
  if (hide < 0 || mob.invisible || !hero) return false;
  selfCast(mob, caster, hide);
  makeInvisible(mob, world.id(mob) ?? -1, SPELLS.invisibility.durationTicks);
  mob.attackCooldown = STALK_TICKS;
  return true;
}

/** The caster spends a spell on itself: its recovery runs, and its sound. */
function selfCast(mob: Shooter, caster: Caster, index: number): void {
  const def = SPELLS[caster.spells[index]];
  caster.recovery[index] = Math.max(def.recoveryTicks, CAST_PERIOD);
  mob.attackCooldown = CAST_PERIOD;
  mob.attackTime = CAST_PERIOD / 2;
  sound.playSound(SPELL_SOUNDS[def.id], mob.position.x, mob.position.y);
}

/** The spell goes off: its bolt or darts fly (the enemy's own, striking heroes), or its burst bursts among them. */
function release(mob: Shooter, def: SpellDef, dir: typeof aim, hero: Player, attack: { attackBonus: number; damage: SpellDef['damage']; mode: 'normal' }, dc: number): void {
  if (def.kind === 'burst') {
    burstOnHeroes(mob, def, burstCentre(mob, def, hero), dc);
    return;
  }
  // Hold Person on the hero; a gust of wind blowing them back along it (systems/GustOfWind.ts).
  if (def.kind === 'hex') {
    hexHero(mob, def, hero, dc);
    return;
  }
  if (def.kind === 'gust') {
    gustFrom(mob, def, dir.x, dir.y, dc);
    return;
  }
  playCastArt(mob, def, dir.x, dir.y);
  const darts = def.kind === 'missiles' ? def.count : 1;
  for (let i = 0; i < darts; i++) {
    const bolt = createSpellBolt(mob.position.x, mob.position.y, dir.x, dir.y, attack, world.id(mob), mob.character?.def,
      { spell: def.id, impact: impactOf(def), castLevel: def.level, team: Team.Mob, autoHit: def.kind === 'missiles', wait: i * DART_GAP });
    if (def.kind === 'bolt') notePressed(bolt, mob, def.id);
  }
}

/** Darts of one casting leave the hand this many ticks apart. */
const DART_GAP = 6;

/** A caster's spells recover a tick. */
function recover(caster: Caster | undefined): void {
  if (!caster) return;
  for (let i = 0; i < caster.recovery.length; i++) if (caster.recovery[i] > 0) caster.recovery[i]--;
}

/** Host, after the enemies have chosen where to go: those that fight from afar stand and shoot or cast instead. */
export function updateEnemyRanged(level: Level): void {
  for (const mob of ranged) {
    recover(mob.mobCaster);
    if (mob.removed || mob.health.current <= 0 || mob.falling || (mob.freezeTime ?? 0) > 0 || (mob.status?.asleep ?? 0) > 0 || incapacitated(mob)) continue;
    if (mob.ai.state !== 'engage' && mob.ai.state !== 'alert') continue;
    // Backing off from a hero too close (ai/execution/skirmish.ts): it shoots once it has its distance.
    if (isMob(mob) && isBackingOff(mob)) continue;
    if (!cast(level, mob)) shoot(level, mob);
  }
}
