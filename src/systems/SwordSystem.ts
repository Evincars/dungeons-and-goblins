import { world, q, Team, isTarget } from '../world';
import type { Entity, Player } from '../world';
import { sound } from '../audio/SoundPlayer';
import type { SfxName } from '../audio/SoundPlayer';
import { MOB_CRIES } from '../audio/SoundBank';
import { characterSheet, weaponInHand } from '../rules/CharacterSheet';
import { weaponRule } from '../rules/Equipment';
import { createSwordSwingFx } from '../entities/FxFactory';
import { SWORD_STATS, swingRange } from '../entities/WeaponStats';
import { strike } from './Strike';
import { characterDef, clipImpactTicks, stateDuration } from '../characters/Characters';
import { nearby, Sense } from '../ai/perception/spatial';
import { MAX_MOB_RADIUS } from '../entities/MobFactory';

/** A mob that takes a hit flinches (can't act) for this long, and shows hurt for this long. */
const MOB_FREEZE_TICKS = 6;
const MOB_HURT_TICKS = 40;
const DEFAULT_REGEN_TICKS = 180;

type Swing = NonNullable<Entity['swordSwing']>;

const struck: Entity[] = [];

/**
 * Applies a hit to a target and shoves them back (`evenIfFlinching`: land even while it flinches from the last one).
 * An enemy cries out when a hit catches it unhurt and leaves it standing (the blow itself is the caller's to sound:
 * a blade, an arrow or a spell).
 */
export function hitMob(mob: Entity, attacker: Entity, damage: number, evenIfFlinching = false): void {
  const h = mob.health;
  if (!h || h.current <= 0) return;
  // A flinching target shrugs off a second blow in the same instant — but not a spell's darts or blast.
  if ((mob.freezeTime ?? 0) > 0 && !evenIfFlinching) return;

  const flinched = (mob.hurtTime ?? 0) > 0;
  // The kill (and its coins) goes to whoever struck last: a projectile's shooter, not the projectile.
  mob.lastHitBy = attacker.projectile?.owner ?? world.id(attacker);
  mob.hurtTime = MOB_HURT_TICKS;
  mob.attackTime = 0;
  mob.freezeTime = MOB_FREEZE_TICKS;
  mob.regenTimer = mob.regenInterval ?? DEFAULT_REGEN_TICKS;
  h.current = Math.max(0, h.current - damage);

  const ap = attacker.position;
  const mp = mob.position;
  if (ap && mp) {
    const dx = mp.x - ap.x;
    const dy = mp.y - ap.y;
    const dist = Math.hypot(dx, dy) || 1;
    mob.bump ??= { x: 0, y: 0 };
    mob.bump.x = (dx / dist) * SWORD_STATS.knockback;
    mob.bump.y = (dy / dist) * SWORD_STATS.knockback;
  }

  if (mob.mobType && mp && !flinched && h.current > 0) sound.playSound(MOB_CRIES[mob.mobType].hurt, mp.x, mp.y);
}

/** A heavy or two-handed weapon swings with a heavier grunt. */
function swingSound(player: Player): SfxName {
  const properties = weaponRule(weaponInHand(player.equipped ?? {}) ?? undefined)?.rule.properties ?? [];
  return properties.includes('heavy') || properties.includes('two_handed') ? 'swing_heavy' : 'sword_swing';
}

/** How far a body stretches from its centre: a blow that reaches its edge lands. */
function bodyReach(target: Entity): number {
  return Math.max(target.radius?.x ?? 0, target.radius?.y ?? 0);
}

function canSwing(player: Player): boolean {
  return player.playerInput.intents.attack && player.swordCooldown === 0 && player.health.current > 0
    && !player.casting && !player.falling;
}

/**
 * A swing starts: its blow lands on the attack clip's impact frame (at once for characters without one), and
 * the next swing can't start before the clip has played (or the usual cooldown, if longer).
 */
function startSwing(player: Player): void {
  player.playerInput.intents.attack = false;
  const aim = player.aimVector ?? { x: 0, y: 1 };
  const def = player.character?.def;
  const swing: Swing = {
    delay: def ? clipImpactTicks(def, 'attack') : 0,
    ticks: SWORD_STATS.swingTicks,
    dirX: aim.x,
    dirY: aim.y,
    range: swingRange(player.playerStats.swordTier),
    hitIds: [],
  };
  world.addComponent(player, 'swordSwing', swing);
  player.swordCooldown = Math.max(SWORD_STATS.cooldown, def ? stateDuration(def, 'attack') : 0);
  if (swing.delay === 0) swingLands(player, swing);
}

/** The blow comes down: its whoosh, and the slash effect (unless the character's art draws its own). */
function swingLands(player: Player, swing: Swing): void {
  const pos = player.position;
  const def = player.character ? characterDef(player.character.def) : null;
  if (def?.swingFx !== false) {
    createSwordSwingFx(pos.x + swing.dirX * swing.range * 0.5, pos.y + swing.dirY * swing.range * 0.5, swing.dirX, swing.dirY);
  }
  sound.playSound(swingSound(player), pos.x, pos.y);
}

/** Whether a target stands inside the swing's arc and reach (to the edge of its body), and has not been hit by this swing yet. */
function inArc(player: Player, swing: Swing, mob: Entity, mobId: number): boolean {
  if (!mob.position || swing.hitIds.includes(mobId)) return false;
  const dx = mob.position.x - player.position.x;
  const dy = mob.position.y - player.position.y;
  const dist = Math.hypot(dx, dy);
  if (dist > swing.range + bodyReach(mob)) return false;
  return (dx * swing.dirX + dy * swing.dirY) / (dist || 1) >= SWORD_STATS.arcCos;
}

/**
 * The swing meets a target: the attack is rolled against its Armor Class (shown over the player's head), and
 * only a hit hurts it.
 */
function swingAt(player: Player, target: Entity): void {
  const outcome = strike(target, characterSheet(player).attack, player);
  if (target.position) sound.playSound(outcome.hit ? 'sword_hit' : 'sword_miss', target.position.x, target.position.y);
  if (outcome.hit) hitMob(target, player, outcome.damage);
}

/** Every enemy (and the training dummy) inside the live swing's arc is swung at, each once per swing. */
function resolveSwing(player: Player, swing: Swing): void {
  for (const mob of nearby(player.position.x, player.position.y, swing.range + MAX_MOB_RADIUS, Sense.mob, struck)) {
    if (!isTarget(mob) || mob.health.current <= 0 || mob.team === Team.Player) continue;
    const mobId = world.id(mob);
    if (mobId === undefined || !inArc(player, swing, mob, mobId)) continue;
    swing.hitIds.push(mobId);
    swingAt(player, mob);
  }
}

export function updateSword(): void {
  for (const player of q.players) {
    if ((player.swordCooldown ?? 0) > 0) player.swordCooldown = (player.swordCooldown ?? 0) - 1;
    if (canSwing(player)) startSwing(player);

    const swing = player.swordSwing;
    if (swing) advanceSwing(player, swing);
  }
}

/** One tick of a swing: winding up to its impact, then its hitbox live for a few ticks, then gone. */
function advanceSwing(player: Player, swing: Swing): void {
  if (swing.delay > 0) {
    if (--swing.delay === 0) swingLands(player, swing);
    return;
  }
  if (--swing.ticks <= 0) {
    world.removeComponent(player, 'swordSwing');
    return;
  }
  resolveSwing(player, swing);
}
