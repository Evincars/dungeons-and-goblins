import { isMob, world } from '../../world';
import type { Entity, Mob, TacticRole } from '../../world';
import {
  MAX_FLANKERS, MELEE_RANGE, ROLE_SCORES, SUPPORT_HEALTH, SUPPORT_RANGE, TACTICS_TICKS, TEMPERAMENT, maxTemperament,
} from '../constants';
import { nearby, Sense } from '../perception/spatial';
import { squadOf } from './squads';
import type { Squad } from './squads';
import { OptionArbiter, Planner } from './utility';
import type { Option } from './utility';

/**
 * Squad tactics by Utility AI. Each engaged enemy, nearest to the target first, scores three roles
 * against the squad as it stands so far: the first takes the player head on, later ones go round the
 * block to hit them from behind while the lead keeps them busy, or hurry to an ally that is hurt or
 * fighting alone. Each kind of enemy leans its own way (TEMPERAMENT), and a role it already has wins
 * close calls so roles don't flicker.
 */

export type TacticSituation = {
  mob: Mob;
  mobId: number;
  squad: Squad;
  /** Pixels between the enemy and its target. */
  dist: number;
  /** An engaged ally nearby that could use help, with its share of health left. */
  ally: Mob | null;
  allyHealth: number;
};

export type TacticPlan = { role: TacticRole; allyId?: number };

function biased(s: TacticSituation, role: TacticRole, base: number): number {
  const sticky = s.mob.ai.role === role ? ROLE_SCORES.stickiness : 0;
  return (base + sticky) * TEMPERAMENT[s.mob.mobType ?? 'goblin'][role];
}

function ceilingOf(role: TacticRole, maxBase: number): number {
  return (maxBase + ROLE_SCORES.stickiness) * maxTemperament(role);
}

const DIRECT: Option<TacticSituation, TacticPlan> = {
  id: 'direct',
  ceiling: ceilingOf('direct', ROLE_SCORES.inMelee),
  evaluate(s) {
    let base: number = ROLE_SCORES.followAttack;
    if (s.squad.leadId === undefined) base = ROLE_SCORES.leadAttack;
    if (s.dist <= MELEE_RANGE) base = ROLE_SCORES.inMelee;
    return { score: biased(s, 'direct', base), plan: { role: 'direct' } };
  },
};

const FLANK: Option<TacticSituation, TacticPlan> = {
  id: 'flank',
  ceiling: ceilingOf('flank', ROLE_SCORES.flank),
  evaluate(s) {
    const lead = s.squad.leadId;
    const possible = lead !== undefined && lead !== s.mobId && s.squad.flankers < MAX_FLANKERS && s.dist > MELEE_RANGE;
    return possible ? { score: biased(s, 'flank', ROLE_SCORES.flank), plan: { role: 'flank' } } : null;
  },
};

const SUPPORT: Option<TacticSituation, TacticPlan> = {
  id: 'support',
  ceiling: ceilingOf('support', ROLE_SCORES.support + ROLE_SCORES.supportPerMissingHealth),
  evaluate(s) {
    if (!s.ally || s.dist <= MELEE_RANGE) return null;
    const base = ROLE_SCORES.support + (1 - s.allyHealth) * ROLE_SCORES.supportPerMissingHealth;
    return { score: biased(s, 'support', base), plan: { role: 'support', allyId: world.id(s.ally) } };
  },
};

export const TACTICS: readonly Option<TacticSituation, TacticPlan>[] = [DIRECT, FLANK, SUPPORT];

/** Enemies think one at a time, so one Yuka planner and arbiter serve them all. */
const arbiter = new OptionArbiter(new Planner<TacticSituation, TacticPlan>(), TACTICS);
const allies: Entity[] = [];

function distance(a: Mob, b: { position: { x: number; y: number } }): number {
  return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
}

/** How many of a squad's members are within striking distance of its target. */
function inMelee(squad: Squad): number {
  let n = 0;
  for (const m of squad.members) if (distance(m, squad.target) <= MELEE_RANGE) n++;
  return n;
}

/** Whether an ally is in a fight and losing it: hurt, or the only one of its squad at the player. */
function needsHelp(ally: Mob): boolean {
  const squad = squadOf(ally.ai.targetId);
  if (!squad || distance(ally, squad.target) > MELEE_RANGE) return false;
  return ally.health.current / ally.health.max < SUPPORT_HEALTH || inMelee(squad) <= 1;
}

/** The worst-off engaged ally within reach that needs help, or null. */
function allyInTrouble(mob: Mob): Mob | null {
  let best: Mob | null = null;
  let bestHealth = Infinity;
  for (const e of nearby(mob.position.x, mob.position.y, SUPPORT_RANGE, Sense.mob, allies)) {
    if (e === mob || !isMob(e) || e.ai.state !== 'engage' || !needsHelp(e)) continue;
    const share = e.health.current / e.health.max;
    if (share >= bestHealth) continue;
    bestHealth = share;
    best = e;
  }
  return best;
}

/** Puts a chosen plan into effect and books it in the squad, so later members see it taken. */
function commit(mob: Mob, mobId: number, squad: Squad, plan: TacticPlan): void {
  if (mob.ai.role !== plan.role) mob.ai.repathIn = 0;
  mob.ai.role = plan.role;
  mob.ai.allyId = plan.allyId;
  if (plan.role === 'direct' && squad.leadId === undefined) squad.leadId = mobId;
  if (plan.role === 'flank') squad.flankers++;
  // Helping an ally that fights another player means joining that fight.
  const ally = plan.allyId === undefined ? undefined : world.entity(plan.allyId);
  if (isMob(ally) && ally.ai.targetId !== undefined) mob.ai.targetId = ally.ai.targetId;
}

function assignSquad(squad: Squad): void {
  squad.leadId = undefined;
  squad.flankers = 0;
  squad.assignedSize = squad.members.length;
  for (const mob of squad.members) {
    const mobId = world.id(mob);
    if (mobId === undefined) continue;
    const ally = allyInTrouble(mob);
    const allyHealth = ally ? ally.health.current / ally.health.max : 1;
    const choice = arbiter.decide({ mob, mobId, squad, dist: distance(mob, squad.target), ally, allyHealth });
    if (choice) commit(mob, mobId, squad, choice.proposal.plan);
  }
}

/** Re-assigns roles every TACTICS_TICKS, and at once in a squad that gained or lost a member. */
export function assignRoles(squads: ReadonlyMap<number, Squad>, tick: number): void {
  const due = tick % TACTICS_TICKS === 0;
  for (const squad of squads.values()) {
    if (!due && squad.members.length === squad.assignedSize) continue;
    assignSquad(squad);
  }
}
