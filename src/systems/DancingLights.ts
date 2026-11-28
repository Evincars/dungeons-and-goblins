import { world, q, isActivePlayer, isMob, isPlayer } from '../world';
import type { Entity, Mob, Player } from '../world';
import type { SpellDef } from '../rules/Spells';
import { MONSTERS } from '../rules/Monsters';
import { rollDie } from '../rules/Dice';
import { SPELLS, TICKS_PER_SECOND } from '../rules/Spells';
import { characterSheet, spellcastingFor } from '../rules/CharacterSheet';
import { nearby, Sense } from '../ai/perception/spatial';
import { playVfx } from '../render/VfxPlayer';
import { text } from '../core/texts';
import { aimedWithin, concentrate, endConcentration } from './LastingSpells';
import { logLine } from './RollLogSystem';

/**
 * Dancing Lights, for lighting the dark or drawing foes away: four lights hover for the spell's duration (held by
 * concentration), each shedding light. Cast at oneself they circle the caster; sent somewhere within range they hover there,
 * and foes near them that fail a Wisdom save against the caster's DC are drawn to them (`entranced`) until hurt, until a hero
 * comes close, or until the lights go out. An anchor entity (`dancingLights`) carries the spell; each light is an entity of
 * its own (`wisp`) with a glow, so the light renderer lights the dark round it on every screen.
 */

/** Aimed this near the caster (px), the lights circle the caster instead of going somewhere. */
const ORBIT_PICK = 40;
/** The lights circle their anchor this far out (px), a full turn in this many ticks, bobbing this high and this often. */
const CIRCLE_RADIUS = 18;
const TURN_TICKS = 3 * TICKS_PER_SECOND;
const HOVER = 18;
const BOB = 4;
const BOB_TICKS = 80;
/** Each light sheds dim light in a 10-foot radius (px of the light renderer, a little wider so it reads as torchlight). */
const LIGHT_RADIUS = 70;
const LIGHT_FLICKER = 0.25;
/** The lights draw foes again once a round (6 s). */
const PULSE_TICKS = 6 * TICKS_PER_SECOND;
/** A foe drawn to the lights stops this far from them to stare; it shakes it off when a hero comes this near (px). */
const STARE_DISTANCE = 36;
const NOTICE_HERO = 64;
const WISPS = 4;
/** How deep the lights' circle looks against how wide (a circle on the floor seen at a slant). */
const FLAT = 0.5;

const anchors = world.with('dancingLights', 'position');
type Anchor = (typeof anchors)['entities'][number];
const wisps = world.with('wisp', 'position');
const entranced = world.with('entranced', 'position', 'velocity');
const scratch: Entity[] = [];

/** The lights the caster made before, if they are still up. */
function lightsOf(owner: number): Anchor | undefined {
  return anchors.entities.find((a) => a.dancingLights.owner === owner && !a.removed);
}

/** Casts Dancing Lights: round the caster when aimed at them, else where aimed within range. The lights they had go out. */
export function castDancingLights(caster: Player, def: SpellDef, targetX: number, targetY: number): void {
  const owner = world.id(caster) ?? -1;
  const old = lightsOf(owner);
  if (old) world.addComponent(old, 'removed', true);
  const orbit = Math.hypot(targetX - caster.position.x, targetY - caster.position.y) <= ORBIT_PICK;
  const at = orbit ? { x: caster.position.x, y: caster.position.y } : aimedWithin(caster, targetX, targetY, def.range);
  const dc = spellcastingFor(characterSheet(caster), def.id).dc;
  const anchor = world.add({ position: at, dancingLights: { owner, ticks: def.durationTicks, orbit, dc, pulse: 0 } });
  const of = world.id(anchor) ?? -1;
  for (let index = 0; index < WISPS; index++) {
    world.add({ position: { ...at }, yOffset: HOVER, wisp: { of, index }, glow: { radius: LIGHT_RADIUS, flicker: LIGHT_FLICKER } });
  }
  playVfx('dancing-lights-cast', at.x, at.y, HOVER);
  if (def.concentration) concentrate(caster, def.id, of, def.durationTicks);
}

/** Where a light circles its anchor (at x, y) this tick: round it, bobbing, each a quarter turn from the next. */
function placeWisp(wisp: Entity, x: number, y: number, tick: number): void {
  const index = wisp.wisp?.index ?? 0;
  const angle = (tick / TURN_TICKS) * Math.PI * 2 + (index * Math.PI * 2) / WISPS;
  if (!wisp.position) return;
  wisp.position.x = x + Math.cos(angle) * CIRCLE_RADIUS;
  // The circle lies flat on the floor, seen from above at a slant: half as deep as it is wide.
  wisp.position.y = y + Math.sin(angle) * CIRCLE_RADIUS * FLAT;
  wisp.yOffset = HOVER + Math.sin(((tick + index * BOB_TICKS / WISPS) / BOB_TICKS) * Math.PI * 2) * BOB;
}

/** Whether a foe is already busy: lured by an illusion, drawn already, or close to a hero. */
function busy(foe: Mob): boolean {
  return foe.lured !== undefined || foe.entranced !== undefined || heroClose(foe);
}

/** Foes near the lights sent somewhere make a Wisdom save, or are drawn to them. */
function drawFoes(anchor: Anchor, radius: number): void {
  const { x, y } = anchor.position;
  const id = world.id(anchor);
  if (id === undefined) return;
  for (const foe of nearby(x, y, radius, Sense.mob, scratch)) {
    if (!isMob(foe) || foe.health.current <= 0 || busy(foe) || Math.hypot(foe.position.x - x, foe.position.y - y) > radius) continue;
    const save = rollDie(20) + (foe.mobType ? MONSTERS[foe.mobType].modifiers.wisdom : 0);
    if (save >= anchor.dancingLights.dc) continue;
    world.addComponent(foe, 'entranced', id);
    logLine(foe, text('roll.entranced'), 'damage');
  }
}

/** The anchor's tick: it follows its caster when circling them, its time runs down, and once a round it draws foes. */
function updateAnchor(anchor: Anchor, radius: number): void {
  const lights = anchor.dancingLights;
  const caster = world.entity(lights.owner);
  const holding = isPlayer(caster) && isActivePlayer(caster) && caster.concentration?.zone === world.id(anchor);
  if (!holding || --lights.ticks <= 0) {
    world.addComponent(anchor, 'removed', true);
    if (isPlayer(caster) && caster.concentration?.zone === world.id(anchor)) endConcentration(caster);
    return;
  }
  if (lights.orbit) {
    anchor.position.x = caster.position.x;
    anchor.position.y = caster.position.y;
    return;
  }
  if (--lights.pulse > 0) return;
  lights.pulse = PULSE_TICKS;
  drawFoes(anchor, radius);
}

/** A light follows its anchor round; with its anchor gone, it goes out. */
function updateWisp(wisp: Entity, tick: number): void {
  const anchor = wisp.wisp ? world.entity(wisp.wisp.of) : undefined;
  if (!anchor?.dancingLights || anchor.removed || !anchor.position) {
    world.addComponent(wisp, 'removed', true);
    return;
  }
  placeWisp(wisp, anchor.position.x, anchor.position.y, tick);
}

/**
 * A foe drawn to the lights, instead of its own thinking: it walks to them and stares. Hurt, with a hero close, or with the
 * lights gone, it shakes it off and thinks for itself again. Returns whether it is still drawn.
 */
export function followLights(mob: Mob): boolean {
  if (mob.entranced === undefined) return false;
  const anchor = world.entity(mob.entranced);
  const shaken = (mob.hurtTime ?? 0) > 0 || heroClose(mob);
  if (!anchor?.dancingLights || anchor.removed || !anchor.position || shaken) {
    world.removeComponent(mob, 'entranced');
    return false;
  }
  const dx = anchor.position.x - mob.position.x;
  const dy = anchor.position.y - mob.position.y;
  const dist = Math.hypot(dx, dy) || 1;
  mob.aimVector ??= { x: 0, y: 1 };
  mob.aimVector.x = dx / dist;
  mob.aimVector.y = dy / dist;
  if (dist <= STARE_DISTANCE) return true;
  const speed = mob.speed ?? 0;
  mob.velocity.x += (dx / dist) * speed;
  mob.velocity.y += (dy / dist) * speed;
  return true;
}

/** Whether a hero on their feet stands close enough to the foe to break the lights' hold. */
function heroClose(mob: Mob): boolean {
  for (const hero of q.players) {
    if (isActivePlayer(hero) && Math.hypot(hero.position.x - mob.position.x, hero.position.y - mob.position.y) <= NOTICE_HERO) return true;
  }
  return false;
}

/** The lights' tick: anchors follow, last and draw foes; the lights circle them; foes whose lights went out come to. */
export function updateDancingLights(tick: number): void {
  for (const anchor of anchors) if (!anchor.removed) updateAnchor(anchor, SPELLS.dancing_lights.radius);
  for (const wisp of wisps) if (!wisp.removed) updateWisp(wisp, tick);
  // Backwards: a foe that comes to leaves the query as it is walked.
  const drawn = entranced.entities;
  for (let i = drawn.length - 1; i >= 0; i--) {
    const foe = drawn[i];
    const anchor = foe.entranced === undefined ? undefined : world.entity(foe.entranced);
    if (!anchor?.dancingLights || anchor.removed) world.removeComponent(foe, 'entranced');
  }
}
