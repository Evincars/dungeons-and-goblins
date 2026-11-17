import { world, Facing, Team } from '../world';
import type { Entity, SummonKind } from '../world';
import { characterComponents, characterDef, groundOffset, headAboveCenter } from '../characters/Characters';
import { ORC } from '../characters/Orc';
import { UNDEAD_STATS } from '../rules/Schools';

/**
 * The undead of Animate Dead (systems/SummonSystem.ts). They have no art of their own yet: they wear the orc's, tinted
 * the brown-green of the grave, smaller for the skeleton, and a green aura (played by the system) marks them as raised.
 */

/** How each kind looks: the orc's art at this scale, tinted. */
const UNDEAD_LOOKS = {
  zombie: { scale: 1.3, tint: 0x8f9a5a },
  skeleton: { scale: 1.15, tint: 0xb8b07a },
} as const satisfies Record<SummonKind, { scale: number; tint: number }>;

/** Their walking pace (an enemy's is 0.4 to 0.85), and how quickly a push fades. */
const UNDEAD_SPEED = 0.6;
const UNDEAD_FRICTION = 0.2;
const UNDEAD_RADIUS = { x: 10, y: 10 } as const;
/** Gap between the top of the head and the health bar. */
const HEALTH_BAR_GAP = 6;
/** The minimap shows them in the heroes' green. */
const UNDEAD_MINIMAP = 0x60c060;

/**
 * An undead of this kind for the hero `owner` (an entity id) at (x, y): `extraHealth` from Undead Thralls, `damageBonus`
 * (the necromancer's proficiency bonus) added to its blow.
 */
export function createUndead(kind: SummonKind, x: number, y: number, owner: number, extraHealth: number, damageBonus: number): Entity {
  const stats = UNDEAD_STATS[kind];
  const look = UNDEAD_LOOKS[kind];
  const def = characterDef(ORC.id);
  const health = stats.health + extraHealth;
  const parts = characterComponents(ORC.id, look.scale);
  const yOffset = groundOffset(ORC, look.scale);
  return world.add({
    position: { x, y },
    velocity: { x: 0, y: 0 },
    radius: { ...UNDEAD_RADIUS },
    physicsSlide: true,
    team: Team.Player,
    health: { current: health, max: health },
    healthBarOffset: -(yOffset + headAboveCenter(def, look.scale) + HEALTH_BAR_GAP),
    hurtTime: 0,
    freezeTime: 0,
    speed: UNDEAD_SPEED,
    friction: UNDEAD_FRICTION,
    facing: Facing.South,
    aimVector: { x: 0, y: 1 },
    bump: { x: 0, y: 0 },
    summon: { kind, owner, attackBonus: stats.attackBonus, damage: { ...stats.damage, bonus: stats.damage.bonus + damageBonus }, ac: stats.ac, cooldown: 0 },
    ...parts,
    visual: parts.visual && { ...parts.visual, tint: look.tint },
    yOffset,
    minimapColor: UNDEAD_MINIMAP,
  });
}
