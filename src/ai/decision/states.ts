import { GameEntity, State, StateMachine } from 'yuka';
import type { Level } from '../../level/Level';
import { isActivePlayer, isMob, isPlayer, world, MOB_STATES } from '../../world';
import type { Entity, Mob, MobState, Player } from '../../world';
import { ALERT_RADIUS, ALERT_TICKS, LOSE_SIGHT_TICKS, SENSE_TICKS } from '../constants';
import { canSee, huntable, spotPlayer } from '../perception/sight';
import { nearby, Sense } from '../perception/spatial';
import { faceTowards, wander } from '../execution/locomotion';
import { flank, followTrail, strike, support } from '../execution/pursuit';
import { squadOf } from './squads';

/**
 * An enemy's behaviour as a Yuka state machine:
 *   idle   — wanders, looking around now and then; spotting a player sends it to alert.
 *   alert  — stops for a beat facing the player (and shouts, so idle allies nearby join in).
 *   engage — fights in the role its squad gave it (direct / flank / support); when the whole squad has
 *            lost sight of the target for a while, it starts searching. Hunts never time out: only the
 *            player reaching a safe room or dying (or the enemy dying) ends one.
 *   search — follows the player's trail from where they were last seen; a sighting re-engages, a cold
 *            trail sends it back to a direct chase.
 */
export class MobAgent extends GameEntity {
  readonly mob: Mob;
  readonly fsm: StateMachine<MobAgent>;
  /** What the current tick is about; set before every update. */
  level: Level | null = null;
  tick = 0;

  constructor(mob: Mob) {
    super();
    this.mob = mob;
    this.fsm = new StateMachine<MobAgent>(this);
    for (const id of MOB_STATES) this.fsm.add(id, STATES[id]);
    // Adopt the state the enemy is already in, without entering it again: entering resets the target,
    // which an ally that was shouted at before it ever thought would otherwise lose.
    this.fsm.currentState = STATES[mob.ai.state];
  }

  /** Runs one tick of the current state. */
  think(level: Level, tick: number): void {
    this.level = level;
    this.tick = tick;
    this.fsm.update();
  }

  go(state: MobState): void {
    this.fsm.changeTo(state);
  }
}

const agents = new WeakMap<Entity, MobAgent>();
const shoutees: Entity[] = [];

/** The enemy's state machine, made on first use. */
export function agentOf(mob: Mob): MobAgent {
  let agent = agents.get(mob);
  if (!agent) {
    agent = new MobAgent(mob);
    agents.set(mob, agent);
  }
  return agent;
}

/** Counts down to the next look around; true when it is due. */
function senseDue(mob: Mob): boolean {
  if (--mob.ai.senseIn > 0) return false;
  mob.ai.senseIn = SENSE_TICKS;
  return true;
}

function noteSighting(mob: Mob, player: Player, tick: number): void {
  mob.ai.lastSeenX = player.position.x;
  mob.ai.lastSeenY = player.position.y;
  mob.ai.lastSeenTick = tick;
}

/** The player the enemy is after, while it is still a valid target. */
function huntedPlayer(mob: Mob): Player | undefined {
  const target = mob.ai.targetId === undefined ? undefined : world.entity(mob.ai.targetId);
  return isPlayer(target) && isActivePlayer(target) ? target : undefined;
}

/** Whether an ally can be called into a fight: idle and not sulking after being crowded out of one. */
function callable(ally: Entity, shouter: Mob): ally is Mob {
  return ally !== shouter && isMob(ally) && ally.ai.state === 'idle' && ally.ai.calmTicks <= 0;
}

/** The shout: idle allies within ALERT_RADIUS learn where the player is and come to help the shouter. */
function alertAllies(mob: Mob, player: Player, tick: number): void {
  const shouterId = world.id(mob);
  for (const ally of nearby(mob.position.x, mob.position.y, ALERT_RADIUS, Sense.mob, shoutees)) {
    if (!callable(ally, mob)) continue;
    ally.ai.targetId = mob.ai.targetId;
    ally.ai.allyId = shouterId;
    noteSighting(ally, player, tick);
    agentOf(ally).go('alert');
  }
}

/** Starts hunting a player that was just seen, and calls the allies around. */
function spot(agent: MobAgent, player: Player): void {
  const mob = agent.mob;
  mob.ai.targetId = world.id(player);
  mob.ai.allyId = undefined;
  noteSighting(mob, player, agent.tick);
  agent.go('alert');
  alertAllies(mob, player, agent.tick);
}

function enterState(mob: Mob, state: MobState): void {
  mob.ai.state = state;
  mob.ai.stateTicks = 0;
  mob.ai.route = [];
  mob.ai.step = 0;
  mob.ai.routeGoal = -1;
  mob.ai.repathIn = 0;
}

class IdleState extends State<MobAgent> {
  override enter(agent: MobAgent): void {
    const mob = agent.mob;
    enterState(mob, 'idle');
    mob.ai.targetId = undefined;
    mob.ai.allyId = undefined;
    mob.ai.role = 'direct';
    mob.chasing = false;
  }

  override execute(agent: MobAgent): void {
    const { mob, level } = agent;
    if (!level) return;
    wander(level, mob);
    if (mob.ai.calmTicks > 0) {
      mob.ai.calmTicks--;
      return;
    }
    if (!senseDue(mob)) return;
    const player = spotPlayer(level, mob);
    if (player) spot(agent, player);
  }
}

class AlertState extends State<MobAgent> {
  override enter(agent: MobAgent): void {
    enterState(agent.mob, 'alert');
    agent.mob.chasing = false;
  }

  override execute(agent: MobAgent): void {
    const mob = agent.mob;
    faceTowards(mob, mob.ai.lastSeenX - mob.position.x, mob.ai.lastSeenY - mob.position.y);
    if (++mob.ai.stateTicks >= ALERT_TICKS) agent.go('engage');
  }
}

class EngageState extends State<MobAgent> {
  override enter(agent: MobAgent): void {
    enterState(agent.mob, 'engage');
    // Called in by an ally: go to its side until the squad's tactics say otherwise.
    agent.mob.ai.role = agent.mob.ai.allyId === undefined ? 'direct' : 'support';
  }

  override execute(agent: MobAgent): void {
    const { mob, level, tick } = agent;
    const target = huntedPlayer(mob);
    if (!level || !target || !huntable(level, target)) {
      agent.go('idle');
      return;
    }
    mob.ai.stateTicks++;
    if (senseDue(mob) && canSee(level, mob, target)) noteSighting(mob, target, tick);
    if (tick - mob.ai.lastSeenTick > LOSE_SIGHT_TICKS) {
      agent.go('search');
      return;
    }
    mob.chasing = true;
    fight(level, mob, target, tick);
  }
}

/** One tick of fighting in the enemy's squad role. */
function fight(level: Level, mob: Mob, target: Player, tick: number): void {
  switch (mob.ai.role) {
    case 'flank': flank(level, mob, squadOf(mob.ai.targetId), target, tick); break;
    case 'support': support(level, mob, target, tick); break;
    default: strike(level, mob, target, tick);
  }
}

class SearchState extends State<MobAgent> {
  override enter(agent: MobAgent): void {
    const mob = agent.mob;
    enterState(mob, 'search');
    // The trail is followed from the moment the player was last seen.
    mob.ai.trailTick = mob.ai.lastSeenTick;
    mob.chasing = true;
  }

  override execute(agent: MobAgent): void {
    const { mob, level, tick } = agent;
    const target = huntedPlayer(mob);
    if (!level || !target || !huntable(level, target)) {
      agent.go('idle');
      return;
    }
    if (senseDue(mob) && canSee(level, mob, target)) {
      noteSighting(mob, target, tick);
      alertAllies(mob, target, tick);
      agent.go('engage');
      return;
    }
    if (followTrail(level, mob, target)) return;
    // A cold trail doesn't end the hunt: the enemy goes straight for the player for a while, then tries the trail again.
    noteSighting(mob, target, tick);
    agent.go('engage');
  }
}

const STATES = {
  idle: new IdleState(),
  alert: new AlertState(),
  engage: new EngageState(),
  search: new SearchState(),
} as const satisfies Record<MobState, State<MobAgent>>;
