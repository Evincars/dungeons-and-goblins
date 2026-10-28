import { world, q, Team, isTarget } from '../world';
import type { Entity, Player } from '../world';
import { sound } from '../audio/SoundPlayer';
import type { SfxName } from '../audio/SoundPlayer';
import { characterSheet, weaponInHand } from '../rules/CharacterSheet';
import { weaponRule } from '../rules/Equipment';
import { LUNGE_REACH } from '../rules/Maneuvers';
import { createSwordSwingFx } from '../entities/FxFactory';
import { ATTACK_PERIOD, SWORD_STATS, swingRange } from '../entities/WeaponStats';
import { strike } from './Strike';
import type { AttackProfile } from '../rules/Combat';
import { hitMob } from './Hits';
import { lungeReady } from './ManeuverSystem';
import { characterDef, clipImpactTicks } from '../characters/Characters';
import { nearby, Sense } from '../ai/perception/spatial';
import { MAX_MOB_RADIUS } from '../entities/MobFactory';

type Swing = NonNullable<Entity['swordSwing']>;

const struck: Entity[] = [];

export { hitMob };

/**
 * A swing is a chain of blows: one, or several with Extra Attack. The blows come one after another and the whole chain is
 * over within the attack period (a second), which is also the swing's cooldown. With a melee weapon in each hand the first
 * blow is made with both at once: one swing on the screen, an attack (a d20 and a damage roll) from each weapon.
 */

/** The chain's last blow ends this many ticks before the period does, so the next swing never cuts it short. */
const CHAIN_MARGIN = 1;

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

/** Ticks the first blow winds up before it lands: the attack clip's impact frame (none for characters without one). */
function firstWindUp(player: Player): number {
  const def = player.character?.def;
  return def ? clipImpactTicks(def, 'attack') : 0;
}

/**
 * Ticks each following blow of a chain of `blows` winds up: what is left of the period after the first blow, shared out
 * between the blows that follow, so the chain of any length lands within the second.
 */
function followWindUp(player: Player, blows: number): number {
  if (blows < 2) return 0;
  const room = ATTACK_PERIOD - firstWindUp(player) - SWORD_STATS.swingTicks - CHAIN_MARGIN;
  return Math.max(0, Math.floor(room / (blows - 1)) - SWORD_STATS.swingTicks);
}

/**
 * A swing starts: its first blow lands on the attack clip's impact frame (at once for characters without one), the
 * others follow it within the second, and the next swing starts a second after this one, not before.
 */
function startSwing(player: Player): void {
  player.playerInput.intents.attack = false;
  const aim = player.aimVector ?? { x: 0, y: 1 };
  const sheet = characterSheet(player);
  const blows = sheet.attacks;
  const reach = swingRange(player.playerStats.swordTier) + (lungeReady(player) ? LUNGE_REACH : 0);
  const swing: Swing = {
    delay: firstWindUp(player),
    ticks: SWORD_STATS.swingTicks,
    dirX: aim.x,
    dirY: aim.y,
    range: reach,
    hitIds: [],
    blow: 0,
    blows,
    offHand: !!sheet.offHand,
  };
  world.addComponent(player, 'swordSwing', swing);
  player.swordCooldown = SWORD_STATS.cooldown;
  if (swing.delay === 0) swingLands(player, swing);
}

/**
 * A melee weapon attack that comes free of the swing key (War Magic, after a spell): a swing follows at once. Nothing
 * happens while a swing is already going.
 */
export function bonusSwing(player: Player): boolean {
  if (player.swordSwing || player.health.current <= 0 || player.falling) return false;
  startSwing(player);
  return true;
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

/** Whether a target stands inside the swing's arc and reach (to the edge of its body), and has not been hit by this blow yet. */
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
 * only a hit hurts it. With a weapon in each hand the first blow strikes with both.
 */
function swingAt(player: Player, target: Entity, swing: Swing): void {
  const sheet = characterSheet(player);
  strikeWith(player, target, sheet.attack, false);
  if (swing.offHand && swing.blow === 0 && sheet.offHand && (target.health?.current ?? 0) > 0) strikeWith(player, target, sheet.offHand, true);
}

/** One attack of the blow: rolled against the target's Armor Class, and a hit lands even on a target that the other weapon just struck. */
function strikeWith(player: Player, target: Entity, attack: AttackProfile, alongside: boolean): void {
  const outcome = strike(target, attack, player);
  if (target.position) sound.playSound(outcome.hit ? 'sword_hit' : 'sword_miss', target.position.x, target.position.y);
  if (outcome.hit) hitMob(target, player, outcome.damage, alongside);
}

/** Every enemy (and the training dummy) inside the live blow's arc is swung at, each once per blow. */
function resolveSwing(player: Player, swing: Swing): void {
  for (const mob of nearby(player.position.x, player.position.y, swing.range + MAX_MOB_RADIUS, Sense.mob, struck)) {
    if (!isTarget(mob) || mob.health.current <= 0 || mob.team === Team.Player) continue;
    const mobId = world.id(mob);
    if (mobId === undefined || !inArc(player, swing, mob, mobId)) continue;
    swing.hitIds.push(mobId);
    swingAt(player, mob, swing);
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

/** The blow just played out: the next one of the chain winds up, aimed anew, or the swing is over. */
function endBlow(player: Player, swing: Swing): void {
  if (swing.blow + 1 >= swing.blows) {
    world.removeComponent(player, 'swordSwing');
    return;
  }
  const aim = player.aimVector ?? { x: swing.dirX, y: swing.dirY };
  swing.blow++;
  swing.delay = followWindUp(player, swing.blows);
  swing.ticks = SWORD_STATS.swingTicks;
  swing.dirX = aim.x;
  swing.dirY = aim.y;
  swing.hitIds.length = 0;
  if (swing.delay === 0) swingLands(player, swing);
}

/** One tick of a swing: winding up to its impact, then its hitbox live for a few ticks, then the next blow or gone. */
function advanceSwing(player: Player, swing: Swing): void {
  if (swing.delay > 0) {
    if (--swing.delay === 0) swingLands(player, swing);
    return;
  }
  if (--swing.ticks <= 0) {
    endBlow(player, swing);
    return;
  }
  resolveSwing(player, swing);
}
