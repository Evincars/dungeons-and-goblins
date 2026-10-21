import { FOG_REVEAL_TILES, TILE_WIDTH } from '../level/TileType';
import type { MobType, TacticRole } from '../world';

/** Enemy AI tuning: senses, squad tactics, routing and trail following. */

// ── Senses ────────────────────────────────────────────────────────────────────

/** How far an enemy sees a player in the open, in every direction: as far as the fog of war lifts. */
export const SIGHT_RANGE = FOG_REVEAL_TILES * TILE_WIDTH;
/** Ticks between looks around: sight is a ray march, too costly every tick for every enemy. */
export const SENSE_TICKS = 6;
/** An enemy that spots a player shouts; idle allies this close join the hunt. */
export const ALERT_RADIUS = 5 * TILE_WIDTH;

// ── States ────────────────────────────────────────────────────────────────────

/** The beat between spotting someone and charging, long enough for the player to read it. */
export const ALERT_TICKS = 24;
/** With nobody in the squad seeing the target for this long, the hunt turns into a search. */
export const LOSE_SIGHT_TICKS = 90;
/** Wandering enemies pick a new direction this often. */
export const WANDER_TURN_TICKS = 60;

// ── Squads and tactics ────────────────────────────────────────────────────────

/** No more enemies than this hunt one player at once; the farthest ones drop out. */
export const MAX_SQUAD = 5;
/** Ticks an enemy dropped from a crowded squad ignores players. */
export const DROPPED_CALM_TICKS = 180;
/** Squad roles are re-assigned this often (and whenever a squad gains or loses a member). */
export const TACTICS_TICKS = 30;
/** At most this many squad members go round to the player's back. */
export const MAX_FLANKERS = 2;
/** Flankers aim for a spot this far behind the player, as seen from the direct attacker. */
export const FLANK_DISTANCE = 2.5 * TILE_WIDTH;
/** Tiles searched around the flank spot for one an enemy can stand on. */
export const FLANK_SNAP_TILES = 2;
/** Extra step cost of tiles on or beside the direct attacker's route, so a flanker goes round the block. */
export const FLANK_AVOID_COST = 12;
/** A flank detour longer than this many times the direct route (plus slack) is not worth it. */
export const FLANK_MAX_DETOUR = 3;
export const FLANK_DETOUR_SLACK = 4;
/** Within this range a flanker or supporter stops manoeuvring and strikes. */
export const STRIKE_RANGE = 1.5 * TILE_WIDTH;
/** Enemies within this range of their target are in the fight; everyone that close simply attacks. */
export const MELEE_RANGE = 2.5 * TILE_WIDTH;
/** An ally below this share of its health, or fighting alone, gets help. */
export const SUPPORT_HEALTH = 0.6;
/** Supporters head for allies no farther than this. */
export const SUPPORT_RANGE = 8 * TILE_WIDTH;
/** A supporter this close to its ally joins the fight directly. */
export const ASSIST_RADIUS = 1.5 * TILE_WIDTH;

/** Base utility of each role, before temperament: what the squad needs most scores highest. */
export const ROLE_SCORES = {
  /** Someone must take the player head on. */
  leadAttack: 1.0,
  /** Already in the thick of it: just fight. */
  inMelee: 1.2,
  /** Piling in behind the lead attacker. */
  followAttack: 0.5,
  /** Going round to the player's back while the lead keeps them busy. */
  flank: 0.8,
  /** Helping an ally that is hurt or alone; more the worse off it is. */
  support: 0.7,
  supportPerMissingHealth: 0.5,
  /** A role an enemy already has wins close calls, so roles don't flicker. */
  stickiness: 0.15,
} as const;

/**
 * How much each kind of enemy leans towards each role (Yuka's characterBias): goblins sneak, orcs and trolls
 * charge; among the new goblins the grunt goes straight in, the rogue slips round the back and the warrior leads.
 */
export const TEMPERAMENT = {
  goblin:   { direct: 0.9,  flank: 1.3, support: 1.0 },
  skeleton: { direct: 1.0,  flank: 1.0, support: 1.1 },
  orc:      { direct: 1.25, flank: 0.8, support: 1.1 },
  troll:    { direct: 1.4,  flank: 0.5, support: 0.8 },
  goblin_grunt:   { direct: 1.1, flank: 0.9, support: 1.1 },
  goblin_rogue:   { direct: 0.7, flank: 1.6, support: 0.9 },
  goblin_warrior: { direct: 1.3, flank: 0.7, support: 1.1 },
} as const satisfies Record<MobType, Record<TacticRole, number>>;

/** The largest temperament for a role, which bounds what its option can ever score. */
export function maxTemperament(role: TacticRole): number {
  return Math.max(...Object.values(TEMPERAMENT).map((t) => t[role]));
}

// ── Movement ──────────────────────────────────────────────────────────────────

/** Routes are re-planned this often: A* per enemy per tick would be far too costly. */
export const REPATH_TICKS = 20;
/** Fallback walk push for enemies without their own speed. */
export const WALK_SPEED = 0.8;
/** How far ahead of its feet an enemy checks for a pit before stepping. */
export const PIT_LOOKAHEAD = 16;
/** Extra step cost of a tile beside a pit, where a shove would tip an enemy in. */
export const PIT_EDGE_COST = 3;
/** Tiles of route looked ahead for a point in clear sight to walk straight at. */
export const LOOKAHEAD_TILES = 8;
/** Pixels at which enemies crowding each other start to push apart. */
export const PERSONAL_SPACE = 24;

/** "Never": the tick of a sighting that has not happened yet (finite, so it survives JSON over the network). */
export const NEVER_TICK = -1e9;

// ── Trails ────────────────────────────────────────────────────────────────────

/** Players drop a crumb on every new tile; the trail keeps this many. */
export const TRAIL_LENGTH = 48;
/** Crumbs looked ahead while following a trail, for one in clear sight to cut the corner to. */
export const TRAIL_LOOKAHEAD = 6;
