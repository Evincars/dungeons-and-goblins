// Builds the game's NixieFX particle effects into the editor project vfx/ (one JSON file each), from the library's default
// effect: `node scripts/vfx-effects.mjs`, then `npm run vfx:export` compiles them into public/vfx for the game.
// Every effect here can still be opened and tuned in the NixieFX editor (nixiefx.com/editor, the vfx/ folder) — but running
// this script again writes them over, so tune the numbers here to keep a change.
//
// Units: one unit is 16 px of the game (VFX_PIXELS_PER_UNIT), y up. Each effect plays at its root's origin: a fire's flame,
// a caster's hands (turned the way the spell goes: +x is forward), the point a spell strikes, the middle of an area. A
// flight effect is moved along with its projectile and sheds its particles where it was (world space).
// The spells' looks follow their descriptions and Baldur's Gate: a fiery mote, a pale ray of frost, a spectral green hand,
// crackling lightning, a prismatic orb, a sickly ray, darts of force; areas fill their whole radius.
import { readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { createDefaultParticleEffect } from 'nixie-fx';

const OUT = new URL('../vfx/', import.meta.url);
const base = createDefaultParticleEffect('base', 'Base');
base.targetProfile = 'pixi-ui-2d';

// ── Building blocks ───────────────────────────────────────────────────────────

const constant = (v, lo = 0, hi = 30) => ({ mode: 'constant', value: v, min: v, max: v,
  curve: [{ x: 0, y: v }, { x: 1, y: v }], curveB: [{ x: 0, y: v }, { x: 1, y: v }], editorMin: lo, editorMax: hi });
const random = (min, max, lo = 0, hi = 30) => ({ ...constant(min, lo, hi), mode: 'random', min, max });
const curve = (from, to, lo = 0, hi = 4) => ({ ...constant(from, lo, hi), mode: 'curve', curve: [{ x: 0, y: from }, { x: 1, y: to }], curveB: [{ x: 0, y: from }, { x: 1, y: to }] });
const gradient = (colors, alphas = [[0, 1], [0.6, 0.85], [1, 0]]) => ({
  mode: 'blend',
  colorStops: colors.map(([position, color]) => ({ position, color })),
  alphaStops: alphas.map(([position, alpha]) => ({ position, alpha })),
});
/** A circle of spawn rotated into the screen's plane (the library's circle lies in x–z, flat to a 2-D view). */
const SCREEN_PLANE = [90, 0, 0];

/**
 * One emitter. o: max particles, rate (a second), duration and loop (a one-shot emits for `duration` s), where they are born
 * (`box` [w, h] of the area, or `ring` radius with `filled` for a disc), life [min, max] s, velocity `vmin`/`vmax` (units/s,
 * per axis), `radial` (units/s out from the origin, negative in), `orbit` (radians/s round it), gravity, drag, size [start, end] (units), colours (a
 * gradient over life), `round` soft dots or crisp squares, `blend`, `floor` (units below the origin where they land), `at`
 * [x, y] (units: the spawn's middle, off the origin — a line along +x, a beam from above) and `start` (s: a delay before it
 * emits, so one effect can play in steps).
 */
function emitter(id, o) {
  const e = structuredClone(base.emitters[0]);
  e.id = id;
  e.name = id;
  e.maxParticles = o.max;
  e.duration = o.duration ?? 1;
  e.loop = o.loop ?? true;
  Object.assign(e.modules, { velocity: true, color: true, size: true, noise: false, collision: !!o.floor, velocityOverLifetime: !!(o.radial || o.orbit) });
  e.spawn.rate = o.rate;
  e.spawn.rateValue = constant(o.rate, 0, 3000);
  e.spawn.shape = o.ring ? 'circle' : 'box';
  e.spawn.box = [...(o.box ?? [0, 0]), 0];
  if (o.ring) {
    e.spawn.radius = o.ring;
    e.spawn.radiusValue = constant(o.ring, 0, 24);
    e.spawn.radiusThickness = o.filled ? 1 : 0;
    e.spawn.rotation = SCREEN_PLANE;
  }
  e.spawn.simulationSpace = 'world';
  if (o.at) e.spawn.position = [...o.at, 0];
  e.timeline.start = o.start ?? 0;
  const init = e.initializeParticle;
  init.lifetime = random(...o.life, 0.02, 30);
  init.size = random(0.7, 1.2, 0, 4);
  init.color.mode = 'constant';
  init.color.color = [1, 1, 1, 1];
  init.velocity = { mode: 'vector', min: [...(o.vmin ?? [0, 0]), 0], max: [...(o.vmax ?? [0, 0]), 0], speed: constant(0, 0, 16) };
  e.forces.gravity = o.gravity ?? 0;
  e.forces.gravityValue = constant(o.gravity ?? 0, 0, 20);
  e.forces.drag = o.drag ?? 0;
  e.forces.dragValue = constant(o.drag ?? 0, 0, 10);
  if (o.radial) e.advanced.velocityOverLifetime.radial = constant(o.radial, -32, 32);
  // Circling the origin in the screen's plane (radians a second; the turned circle's own axis is y).
  if (o.orbit) e.advanced.velocityOverLifetime.orbital.y = constant(o.orbit, -32, 32);
  e.render.blend = o.blend ?? 'additive';
  e.billboard.shape = o.round ? 'circle' : 'square';
  e.billboard.softness = o.round ? 0.6 : 0;
  e.billboard.sizeStart = o.size[0];
  e.billboard.sizeEnd = o.size[1];
  e.billboard.sizeValue = curve(o.size[0], o.size[1]);
  e.color.start = [1, 1, 1, 1];
  e.color.end = [1, 1, 1, 0];
  e.color.gradient = o.colors;
  if (o.floor) Object.assign(e.advanced.collision, { mode: 'plane', planeY: -o.floor, radius: 0, bounce: 0.25, dampen: 0.7, killBelow: 1 });
  return e;
}

const written = new Set();
function effect(id, duration, emitters) {
  const fx = structuredClone(base);
  fx.id = id;
  fx.name = id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  fx.timeline.duration = duration;
  fx.emitters = emitters;
  writeFileSync(new URL(`${id}.json`, OUT), `${JSON.stringify(fx, null, 2)}\n`);
  written.add(`${id}.json`);
}

/** A one-shot: emits for `duration` seconds, then is done. */
const once = (duration, o) => ({ ...o, duration, loop: false });

// ── Colours ───────────────────────────────────────────────────────────────────

const C = {
  hot: gradient([[0, [1, 0.95, 0.75]], [0.45, [1, 0.6, 0.15]], [1, [0.85, 0.18, 0.05]]], [[0, 1], [0.6, 0.9], [1, 0]]),
  ember: gradient([[0, [1, 0.75, 0.3]], [0.3, [1, 0.4, 0.08]], [1, [0.45, 0.06, 0.02]]], [[0, 1], [0.8, 0.9], [1, 0]]),
  flame: gradient([[0, [1, 1, 0.85]], [0.25, [1, 0.8, 0.3]], [0.6, [1, 0.38, 0.08]], [1, [0.5, 0.08, 0.04]]], [[0, 0.95], [0.5, 0.8], [1, 0]]),
  fireCore: gradient([[0, [1, 1, 0.9]], [0.5, [1, 0.85, 0.35]], [1, [1, 0.45, 0.1]]]),
  smoke: gradient([[0, [0.25, 0.22, 0.2]], [1, [0.12, 0.11, 0.1]]], [[0, 0], [0.2, 0.45], [1, 0]]),
  frostCore: gradient([[0, [1, 1, 1]], [1, [0.6, 0.9, 1]]]),
  frost: gradient([[0, [0.95, 1, 1]], [0.4, [0.6, 0.88, 1]], [1, [0.3, 0.55, 0.95]]], [[0, 0.9], [0.6, 0.7], [1, 0]]),
  frostMist: gradient([[0, [0.85, 0.95, 1]], [1, [0.6, 0.8, 1]]], [[0, 0], [0.25, 0.4], [1, 0]]),
  spectral: gradient([[0, [0.85, 1, 0.9]], [0.4, [0.4, 0.95, 0.65]], [1, [0.1, 0.45, 0.35]]], [[0, 0.9], [0.6, 0.65], [1, 0]]),
  shadow: gradient([[0, [0.05, 0.12, 0.08]], [1, [0.02, 0.04, 0.03]]], [[0, 0], [0.3, 0.6], [1, 0]]),
  lightning: gradient([[0, [1, 1, 1]], [0.3, [0.65, 0.95, 1]], [1, [0.25, 0.5, 1]]]),
  witch: gradient([[0, [1, 0.95, 1]], [0.35, [0.7, 0.55, 1]], [1, [0.35, 0.25, 0.95]]]),
  prism: gradient([[0, [1, 0.35, 0.35]], [0.2, [1, 0.85, 0.3]], [0.4, [0.4, 1, 0.45]], [0.6, [0.35, 0.8, 1]], [0.8, [0.7, 0.45, 1]], [1, [1, 0.4, 0.8]]], [[0, 1], [0.8, 0.8], [1, 0]]),
  acid: gradient([[0, [0.9, 1, 0.6]], [0.4, [0.45, 0.95, 0.25]], [1, [0.1, 0.45, 0.08]]]),
  acidPool: gradient([[0, [0.55, 0.95, 0.3]], [1, [0.15, 0.5, 0.1]]], [[0, 0], [0.15, 0.55], [1, 0]]),
  sick: gradient([[0, [0.95, 1, 0.55]], [0.4, [0.65, 0.85, 0.2]], [1, [0.3, 0.42, 0.08]]], [[0, 0.9], [0.6, 0.7], [1, 0]]),
  gas: gradient([[0, [0.55, 0.8, 0.25]], [1, [0.3, 0.45, 0.12]]], [[0, 0], [0.25, 0.5], [1, 0]]),
  force: gradient([[0, [1, 0.95, 1]], [0.4, [0.8, 0.6, 1]], [1, [0.45, 0.25, 0.95]]]),
  silver: gradient([[0, [1, 1, 1]], [0.5, [0.8, 0.85, 0.95]], [1, [0.5, 0.55, 0.7]]]),
  arcane: gradient([[0, [0.9, 0.95, 1]], [0.4, [0.45, 0.65, 1]], [1, [0.2, 0.3, 0.9]]]),
  life: gradient([[0, [0.85, 1, 0.85]], [0.5, [0.35, 0.85, 0.55]], [1, [0.1, 0.4, 0.3]]]),
  dust: gradient([[0, [0.75, 0.75, 0.8]], [1, [0.5, 0.5, 0.55]]], [[0, 0], [0.2, 0.35], [1, 0]]),
};

// ── Fires ─────────────────────────────────────────────────────────────────────

// Torch: a few sparks rising from the flame; now and then an ember drops to the floor at the wall's foot (36 px below).
effect('torch-sparks', 2, [
  emitter('sparks', { max: 24, rate: 7, box: [0.3, 0.2], life: [0.5, 1.1], vmin: [-0.6, 2.4], vmax: [0.6, 4], gravity: 0.6, drag: 0.4, size: [0.14, 0.05], colors: C.hot }),
  emitter('embers', { max: 4, rate: 0.35, box: [0.2, 0.1], life: [1.8, 2.6], vmin: [-0.9, 0.6], vmax: [0.9, 1.6], gravity: 4, drag: 0.1, size: [0.13, 0.1], colors: C.ember, floor: 36 / 16 }),
]);
// Campfire: more sparks over a wider fire; embers pop out sideways and land on the hearth round it (16 px below the flames).
effect('campfire-embers', 2, [
  emitter('sparks', { max: 40, rate: 11, box: [0.8, 0.25], life: [0.6, 1.3], vmin: [-0.7, 2.6], vmax: [0.7, 4.4], gravity: 0.6, drag: 0.4, size: [0.14, 0.05], colors: C.hot }),
  emitter('embers', { max: 6, rate: 0.7, box: [0.5, 0.15], life: [1.6, 2.4], vmin: [-1.8, 1.2], vmax: [1.8, 2.4], gravity: 5, drag: 0.1, size: [0.13, 0.1], colors: C.ember, floor: 1 }),
]);

// ── A spell's whole course: its casting in the hands, its flight and where it strikes ─────────────────────────────────

/** The flare in the caster's hands as a spell leaves them (+x the way it goes). */
function cast(id, colors, o = {}) {
  effect(`${id}-cast`, 1, [
    emitter('glow', once(0.08, { max: 10, rate: 120, box: [0.3, 0.3], life: [0.15, 0.25], vmin: [-0.2, -0.2], vmax: [0.6, 0.2], drag: 2, size: [0.8, 0.25], colors, round: true })),
    emitter('sparks', once(0.1, { max: 20, rate: 200, box: [0.2, 0.2], life: [0.2, 0.4], vmin: [1, -1.5], vmax: [4, 1.5], gravity: o.gravity ?? 0, drag: 2, size: [0.14, 0.04], colors, round: o.round })),
  ]);
}

// Fire Bolt: a mote of fire, flames and smoke streaming behind it; it bursts in flame, embers flying, smoke rising.
cast('fire-bolt', C.fireCore, { gravity: 1, round: true });
effect('fire-bolt-flight', 1, [
  emitter('core', { max: 30, rate: 140, life: [0.05, 0.1], vmin: [-0.3, -0.3], vmax: [0.3, 0.3], size: [0.55, 0.25], colors: C.fireCore, round: true }),
  emitter('flames', { max: 40, rate: 70, box: [0.15, 0.15], life: [0.2, 0.4], vmin: [-0.6, 0.3], vmax: [0.6, 1.2], drag: 1, size: [0.4, 0.1], colors: C.flame, round: true }),
  emitter('smoke', { max: 16, rate: 16, box: [0.1, 0.1], life: [0.4, 0.7], vmin: [-0.3, 0.5], vmax: [0.3, 1.2], drag: 0.5, size: [0.3, 0.6], colors: C.smoke, round: true, blend: 'alpha' }),
]);
effect('fire-bolt-impact', 1.6, [
  emitter('flash', once(0.05, { max: 6, rate: 120, life: [0.12, 0.2], size: [1.3, 0.4], colors: C.fireCore, round: true })),
  emitter('flames', once(0.08, { max: 50, rate: 600, box: [0.3, 0.3], life: [0.3, 0.6], vmin: [-4, -2], vmax: [4, 4], drag: 2.2, size: [0.5, 0.12], colors: C.flame, round: true })),
  emitter('embers', once(0.08, { max: 24, rate: 300, box: [0.2, 0.2], life: [0.5, 0.9], vmin: [-4, 1], vmax: [4, 5], gravity: 6, drag: 0.4, size: [0.12, 0.05], colors: C.ember })),
  emitter('smoke', once(0.12, { max: 10, rate: 80, box: [0.5, 0.3], life: [0.7, 1.1], vmin: [-0.5, 0.5], vmax: [0.5, 1.4], drag: 0.6, size: [0.4, 0.9], colors: C.smoke, round: true, blend: 'alpha' })),
]);

// Ray of Frost: a pale ray — a lingering line of frost behind a white point, ice crystals falling from it; it shatters into
// shards in a breath of cold mist.
cast('ray-of-frost', C.frostCore);
effect('ray-of-frost-flight', 1, [
  emitter('core', { max: 30, rate: 140, life: [0.05, 0.1], size: [0.4, 0.2], colors: C.frostCore, round: true }),
  emitter('beam', { max: 120, rate: 170, life: [0.35, 0.6], vmin: [-0.15, -0.15], vmax: [0.15, 0.15], size: [0.22, 0.08], colors: C.frost, round: true }),
  emitter('crystals', { max: 30, rate: 30, box: [0.2, 0.2], life: [0.5, 0.8], vmin: [-0.6, -0.4], vmax: [0.6, 0.6], gravity: 0.6, drag: 0.6, size: [0.12, 0.04], colors: C.frostCore }),
]);
effect('ray-of-frost-impact', 1.6, [
  emitter('flash', once(0.05, { max: 6, rate: 120, life: [0.1, 0.18], size: [1, 0.3], colors: C.frostCore, round: true })),
  emitter('shards', once(0.07, { max: 40, rate: 560, box: [0.2, 0.2], life: [0.3, 0.6], vmin: [-5, -5], vmax: [5, 5], gravity: 2, drag: 2.5, size: [0.18, 0.06], colors: C.frost })),
  emitter('mist', once(0.1, { max: 12, rate: 120, box: [0.6, 0.4], life: [0.7, 1.1], vmin: [-0.6, -0.2], vmax: [0.6, 0.6], drag: 1, size: [0.45, 0.95], colors: C.frostMist, round: true, blend: 'alpha' })),
]);

// Chill Touch: a ghostly hand of spectral green, wisps trailing; it closes round its victim — the wisps drawn in, a shadow
// left on them.
cast('chill-touch', C.spectral, { round: true });
effect('chill-touch-flight', 1, [
  emitter('core', { max: 30, rate: 100, life: [0.06, 0.12], vmin: [-0.3, -0.3], vmax: [0.3, 0.3], size: [0.65, 0.3], colors: C.spectral, round: true }),
  emitter('wisps', { max: 40, rate: 50, box: [0.3, 0.3], life: [0.4, 0.7], vmin: [-1, -1], vmax: [1, 1], drag: 1.2, size: [0.35, 0.12], colors: C.spectral, round: true }),
  emitter('shade', { max: 16, rate: 20, box: [0.2, 0.2], life: [0.4, 0.6], vmin: [-0.4, -0.4], vmax: [0.4, 0.4], drag: 1, size: [0.3, 0.1], colors: C.shadow, round: true, blend: 'alpha' }),
]);
effect('chill-touch-impact', 1.6, [
  emitter('grasp', once(0.1, { max: 40, rate: 400, ring: 1.4, life: [0.35, 0.5], radial: -3, size: [0.3, 0.1], colors: C.spectral, round: true })),
  emitter('flash', once(0.05, { max: 6, rate: 120, life: [0.15, 0.25], size: [1, 0.35], colors: C.spectral, round: true })),
  emitter('shade', once(0.15, { max: 12, rate: 80, box: [0.6, 0.6], life: [0.6, 1], vmin: [-0.3, 0], vmax: [0.3, 0.6], drag: 1, size: [0.4, 0.8], colors: C.shadow, round: true, blend: 'alpha' })),
]);

// Shocking Grasp: crackling lightning, sparks jumping from a white-hot point; it strikes in a flash and a spray of sparks.
cast('shocking-grasp', C.lightning);
effect('shocking-grasp-flight', 1, [
  emitter('core', { max: 30, rate: 160, life: [0.03, 0.08], vmin: [-0.5, -0.5], vmax: [0.5, 0.5], size: [0.4, 0.2], colors: C.lightning }),
  emitter('arcs', { max: 40, rate: 160, life: [0.05, 0.12], vmin: [-5, -5], vmax: [5, 5], size: [0.12, 0.06], colors: C.lightning }),
]);
effect('shocking-grasp-impact', 1, [
  emitter('flash', once(0.05, { max: 6, rate: 120, life: [0.08, 0.15], size: [1.4, 0.4], colors: C.lightning, round: true })),
  emitter('sparks', once(0.08, { max: 50, rate: 600, box: [0.2, 0.2], life: [0.1, 0.25], vmin: [-9, -9], vmax: [9, 9], drag: 2, size: [0.14, 0.05], colors: C.lightning })),
  emitter('arcs', once(0.25, { max: 30, rate: 120, ring: 0.8, life: [0.05, 0.12], vmin: [-3, -3], vmax: [3, 3], size: [0.12, 0.05], colors: C.lightning })),
]);

// Witch Bolt: an arc of blue-violet lightning, crackling and leaving motes; it crackles on its victim.
cast('witch-bolt', C.witch);
effect('witch-bolt-flight', 1, [
  emitter('core', { max: 30, rate: 140, life: [0.05, 0.1], size: [0.5, 0.2], colors: C.witch, round: true }),
  emitter('arcs', { max: 40, rate: 140, life: [0.06, 0.16], vmin: [-4, -4], vmax: [4, 4], size: [0.12, 0.05], colors: C.witch }),
  emitter('motes', { max: 30, rate: 30, life: [0.5, 0.8], vmin: [-0.4, -0.4], vmax: [0.4, 0.4], size: [0.15, 0.04], colors: C.witch, round: true }),
]);
effect('witch-bolt-impact', 1.4, [
  emitter('flash', once(0.05, { max: 6, rate: 120, life: [0.1, 0.18], size: [1.2, 0.4], colors: C.witch, round: true })),
  emitter('arcs', once(0.4, { max: 60, rate: 180, ring: 0.9, life: [0.06, 0.16], vmin: [-4, -4], vmax: [4, 4], size: [0.13, 0.05], colors: C.witch })),
  emitter('motes', once(0.1, { max: 20, rate: 200, box: [0.4, 0.4], life: [0.5, 0.9], vmin: [-1.5, -1], vmax: [1.5, 2], drag: 1, size: [0.16, 0.04], colors: C.witch, round: true })),
]);

// Chromatic Orb: an orb shimmering through every colour, prismatic sparkles and drops of acid trailing; it bursts in acid
// and a ring of prismatic light.
cast('chromatic-orb', C.prism, { round: true });
effect('chromatic-orb-flight', 1, [
  emitter('core', { max: 30, rate: 150, life: [0.06, 0.12], vmin: [-0.2, -0.2], vmax: [0.2, 0.2], size: [0.6, 0.3], colors: C.prism, round: true }),
  emitter('sparkles', { max: 30, rate: 60, life: [0.3, 0.5], vmin: [-1, -1], vmax: [1, 1], drag: 1, size: [0.12, 0.03], colors: C.prism }),
  emitter('drips', { max: 12, rate: 18, life: [0.4, 0.6], vmin: [-0.3, -0.3], vmax: [0.3, 0.3], gravity: 4, size: [0.14, 0.06], colors: C.acid, round: true }),
]);
effect('chromatic-orb-impact', 1.4, [
  emitter('ring', once(0.06, { max: 50, rate: 800, ring: 0.5, life: [0.3, 0.45], radial: 4, size: [0.16, 0.05], colors: C.prism })),
  emitter('splash', once(0.08, { max: 30, rate: 380, box: [0.3, 0.3], life: [0.4, 0.7], vmin: [-3, 0.5], vmax: [3, 4], gravity: 7, drag: 0.4, size: [0.2, 0.08], colors: C.acid, round: true })),
  emitter('flash', once(0.05, { max: 6, rate: 120, life: [0.12, 0.2], size: [1.2, 0.4], colors: C.prism, round: true })),
]);

// Ray of Sickness: a sickly yellow-green ray, a lingering line dripping poison; it splashes and leaves a puff of gas.
cast('ray-of-sickness', C.sick, { round: true });
effect('ray-of-sickness-flight', 1, [
  emitter('core', { max: 30, rate: 120, life: [0.05, 0.1], size: [0.45, 0.2], colors: C.sick, round: true }),
  emitter('beam', { max: 100, rate: 140, life: [0.3, 0.5], vmin: [-0.15, -0.15], vmax: [0.15, 0.15], size: [0.22, 0.08], colors: C.sick, round: true }),
  emitter('drips', { max: 20, rate: 25, life: [0.4, 0.7], vmin: [-0.2, -0.2], vmax: [0.2, 0.2], gravity: 5, size: [0.12, 0.05], colors: C.sick, round: true }),
]);
effect('ray-of-sickness-impact', 1.8, [
  emitter('splash', once(0.08, { max: 30, rate: 380, box: [0.3, 0.3], life: [0.4, 0.7], vmin: [-3, 0.5], vmax: [3, 3.5], gravity: 7, drag: 0.4, size: [0.18, 0.07], colors: C.sick, round: true })),
  emitter('gas', once(0.15, { max: 14, rate: 100, box: [0.6, 0.4], life: [0.8, 1.3], vmin: [-0.5, -0.1], vmax: [0.5, 0.6], drag: 0.8, size: [0.5, 1.0], colors: C.gas, round: true, blend: 'alpha' })),
]);

// Magic Missile: a glowing dart of force, a bright streak behind it; each strikes in a ring of force.
cast('magic-missile', C.force);
effect('magic-missile-flight', 1, [
  emitter('core', { max: 24, rate: 150, life: [0.04, 0.08], size: [0.45, 0.2], colors: C.force, round: true }),
  emitter('streak', { max: 50, rate: 130, life: [0.15, 0.3], vmin: [-0.1, -0.1], vmax: [0.1, 0.1], size: [0.22, 0.04], colors: C.force, round: true }),
  emitter('glints', { max: 14, rate: 25, life: [0.3, 0.5], vmin: [-0.6, -0.6], vmax: [0.6, 0.6], drag: 1, size: [0.1, 0.03], colors: C.silver }),
]);
effect('magic-missile-impact', 1, [
  emitter('ring', once(0.05, { max: 36, rate: 700, ring: 0.3, life: [0.25, 0.4], radial: 3.5, size: [0.16, 0.05], colors: C.force })),
  emitter('flash', once(0.05, { max: 6, rate: 120, life: [0.1, 0.18], size: [0.9, 0.3], colors: C.force, round: true })),
  emitter('sparks', once(0.06, { max: 16, rate: 260, life: [0.2, 0.35], vmin: [-4, -4], vmax: [4, 4], drag: 2, size: [0.1, 0.03], colors: C.silver })),
]);

// ── Areas: each fills its whole radius ────────────────────────────────────────

// Burning Hands: a sheet of flame bursting from the hands along +x, as long as the spell's cone (96 px), with sparks flung on.
effect('burning-hands', 1.2, [
  emitter('flames', once(0.35, { max: 160, rate: 320, box: [0.15, 0.15], life: [0.3, 0.55], vmin: [15, -6], vmax: [24, 6], drag: 1.1, size: [0.22, 0.6], colors: C.flame, round: true })),
  emitter('sparks', once(0.3, { max: 40, rate: 90, box: [0.1, 0.1], life: [0.5, 0.8], vmin: [16, -6.5], vmax: [26, 6.5], gravity: 1, drag: 1.2, size: [0.12, 0.04], colors: C.hot })),
]);
// Acid Splash (a bubble of acid bursting, 32 px round): drops thrown up and falling back over the whole of it, acid pooling
// there, bubbles popping.
effect('acid-splash', 1.8, [
  emitter('flash', once(0.05, { max: 6, rate: 120, life: [0.12, 0.2], size: [1.6, 0.5], colors: C.acid, round: true })),
  emitter('drops', once(0.1, { max: 70, rate: 700, ring: 2, filled: true, life: [0.5, 0.8], vmin: [-1, 1.5], vmax: [1, 4], gravity: 7, drag: 0.3, size: [0.2, 0.09], colors: C.acid, round: true })),
  emitter('pools', once(0.12, { max: 24, rate: 200, ring: 1.9, filled: true, life: [0.8, 1.3], size: [0.4, 0.6], colors: C.acidPool, round: true, blend: 'alpha' })),
  emitter('bubbles', once(0.4, { max: 24, rate: 60, ring: 1.8, filled: true, life: [0.3, 0.6], vmin: [-0.2, 0.4], vmax: [0.2, 1.2], size: [0.14, 0.2], colors: C.acid, round: true })),
]);
// Poison Spray (24 px round): a cloud of toxic gas over the whole of it, sickly motes in it.
effect('poison-spray', 2, [
  emitter('gas', once(0.15, { max: 36, rate: 240, ring: 1.5, filled: true, life: [0.9, 1.4], vmin: [-0.4, -0.3], vmax: [0.4, 0.5], drag: 0.6, size: [0.6, 1.1], colors: C.gas, round: true, blend: 'alpha' })),
  emitter('motes', once(0.4, { max: 30, rate: 75, ring: 1.5, filled: true, life: [0.5, 0.9], vmin: [-0.4, -0.2], vmax: [0.4, 0.8], drag: 0.5, size: [0.12, 0.04], colors: C.sick })),
]);
// Ice Knife (28 px round): the knife shatters — shards bursting out to the edge, a ring of ice there, cold mist over all.
effect('ice-knife', 1.6, [
  emitter('flash', once(0.05, { max: 6, rate: 120, life: [0.1, 0.18], size: [1.4, 0.4], colors: C.frostCore, round: true })),
  emitter('shards', once(0.07, { max: 50, rate: 700, box: [0.2, 0.2], life: [0.3, 0.55], vmin: [-14, -14], vmax: [14, 14], gravity: 2, drag: 3, size: [0.2, 0.06], colors: C.frost })),
  emitter('edge', once(0.08, { max: 40, rate: 500, ring: 1.75, life: [0.3, 0.5], vmin: [-0.3, -0.3], vmax: [0.3, 0.3], gravity: 1.5, size: [0.16, 0.05], colors: C.frost })),
  emitter('mist', once(0.12, { max: 18, rate: 150, ring: 1.6, filled: true, life: [0.7, 1.1], vmin: [-0.3, -0.1], vmax: [0.3, 0.5], drag: 1, size: [0.5, 0.9], colors: C.frostMist, round: true, blend: 'alpha' })),
]);
// Thunderwave (a cube 48 px each way of the caster): a wave of force flung out to its edge, the air in all of it shaken,
// dust thrown up.
effect('thunderwave', 1.4, [
  emitter('wave', once(0.06, { max: 100, rate: 1600, ring: 0.5, life: [0.28, 0.32], radial: 9, size: [0.26, 0.08], colors: C.lightning })),
  emitter('air', once(0.12, { max: 70, rate: 560, box: [6, 6], life: [0.2, 0.4], vmin: [-0.4, -0.4], vmax: [0.4, 0.4], size: [0.3, 0.08], colors: C.silver, round: true })),
  emitter('dust', once(0.15, { max: 24, rate: 160, box: [6, 6], life: [0.6, 1], vmin: [-0.3, 0], vmax: [0.3, 0.6], drag: 0.6, size: [0.5, 0.9], colors: C.dust, round: true, blend: 'alpha' })),
  emitter('flash', once(0.06, { max: 10, rate: 150, life: [0.15, 0.3], size: [1.6, 0.4], colors: C.silver, round: true })),
]);

// ── Spells that last on the caster: round their body ─────────────────────────
// A buff flashes up once as it is cast; Blade Ward and Shield keep an aura round the body while they last (the loops,
// `-aura`); Mage Armour (until a long rest) and False Life show only as they are cast.

// Blade Ward: blades of silver light flung out round the body, then glints circling it while it lasts.
effect('blade-ward', 1.2, [
  emitter('blades', once(0.06, { max: 40, rate: 700, ring: 0.5, life: [0.3, 0.45], radial: 4, orbit: 4, size: [0.2, 0.05], colors: C.silver })),
  emitter('flash', once(0.05, { max: 6, rate: 120, life: [0.12, 0.2], size: [1.6, 0.5], colors: C.silver, round: true })),
]);
effect('blade-ward-aura', 1, [
  emitter('glints', { max: 40, rate: 32, ring: 1.2, life: [0.7, 1.1], orbit: 3, size: [0.14, 0.03], colors: C.silver }),
  emitter('sheen', { max: 16, rate: 12, ring: 1, filled: true, life: [0.5, 0.8], vmin: [0, 0.2], vmax: [0, 0.5], size: [0.5, 0.8], colors: gradient([[0, [0.85, 0.9, 1]], [1, [0.6, 0.65, 0.8]]], [[0, 0], [0.4, 0.18], [1, 0]]), round: true }),
]);
// Shield: a ring of force flashing up round the body, a faint shimmer of it staying while it lasts.
effect('shield', 1, [
  emitter('ring', once(0.06, { max: 70, rate: 1200, ring: 1.4, life: [0.3, 0.5], orbit: -2, size: [0.2, 0.05], colors: C.arcane })),
  emitter('flash', once(0.05, { max: 6, rate: 120, life: [0.15, 0.25], size: [2, 0.7], colors: C.arcane, round: true })),
]);
effect('shield-aura', 1, [
  emitter('shimmer', { max: 40, rate: 40, ring: 1.4, life: [0.3, 0.5], orbit: -1.5, size: [0.12, 0.03], colors: C.arcane }),
  emitter('glow', { max: 10, rate: 8, ring: 1.3, life: [0.5, 0.8], size: [0.6, 0.9], colors: gradient([[0, [0.5, 0.7, 1]], [1, [0.3, 0.45, 1]]], [[0, 0], [0.4, 0.2], [1, 0]]), round: true }),
]);
// Mage Armour (until a long rest): a dome of force closes round the body once — a ring drawn in, a shimmer over it, motes
// rising — and nothing after.
effect('mage-armor', 1.8, [
  emitter('ring', once(0.06, { max: 60, rate: 1000, ring: 2, life: [0.35, 0.5], radial: -3.5, size: [0.2, 0.06], colors: C.arcane })),
  emitter('dome', once(0.12, { max: 24, rate: 200, ring: 1.3, filled: true, life: [0.4, 0.7], size: [0.6, 0.9], colors: gradient([[0, [0.7, 0.85, 1]], [1, [0.35, 0.5, 1]]], [[0, 0], [0.3, 0.35], [1, 0]]), round: true })),
  emitter('motes', once(0.45, { max: 40, rate: 80, box: [1.4, 1.8], life: [0.5, 0.9], vmin: [-0.3, 0.8], vmax: [0.3, 2], drag: 0.8, size: [0.16, 0.04], colors: C.arcane })),
]);
// False Life: dark green motes of borrowed life drawn into the body.
effect('false-life', 1.8, [
  emitter('motes', once(0.5, { max: 40, rate: 70, ring: 1.3, filled: true, life: [0.6, 0.9], radial: -1, vmin: [-0.2, 0.6], vmax: [0.2, 1.4], size: [0.22, 0.06], colors: C.life, round: true })),
  emitter('shade', once(0.3, { max: 10, rate: 30, box: [1, 1.4], life: [0.6, 0.9], vmin: [0, 0.3], vmax: [0, 0.8], size: [0.4, 0.2], colors: C.shadow, round: true, blend: 'alpha' })),
]);

// ── 2nd-level spells ──────────────────────────────────────────────────────────

const C2 = {
  acidArrow: gradient([[0, [0.95, 1, 0.7]], [0.35, [0.5, 1, 0.3]], [1, [0.12, 0.5, 0.1]]]),
  ray: gradient([[0, [1, 1, 0.9]], [0.3, [1, 0.75, 0.25]], [1, [0.9, 0.2, 0.05]]]),
  shatter: gradient([[0, [1, 1, 1]], [0.4, [0.8, 0.85, 1]], [1, [0.45, 0.5, 0.85]]]),
  steel: gradient([[0, [1, 1, 1]], [0.5, [0.75, 0.78, 0.85]], [1, [0.45, 0.48, 0.55]]], [[0, 1], [0.7, 0.85], [1, 0]]),
  blood: gradient([[0, [0.9, 0.2, 0.15]], [1, [0.45, 0.05, 0.05]]], [[0, 0.9], [1, 0]]),
  holy: gradient([[0, [1, 1, 0.9]], [0.4, [1, 0.9, 0.5]], [1, [0.9, 0.7, 0.3]]], [[0, 0.95], [0.6, 0.8], [1, 0]]),
};

// Melf's Acid Arrow: a shimmering green arrow of acid, dripping as it flies; it bursts in a spray of acid that keeps
// hissing (its damage goes on).
cast('melfs-acid-arrow', C2.acidArrow, { round: true });
effect('melfs-acid-arrow-flight', 1, [
  emitter('core', { max: 30, rate: 150, life: [0.05, 0.09], vmin: [-0.2, -0.2], vmax: [0.2, 0.2], size: [0.5, 0.2], colors: C2.acidArrow, round: true }),
  emitter('streak', { max: 50, rate: 120, life: [0.15, 0.3], vmin: [-0.1, -0.1], vmax: [0.1, 0.1], size: [0.24, 0.05], colors: C2.acidArrow, round: true }),
  emitter('drips', { max: 24, rate: 30, life: [0.4, 0.7], vmin: [-0.3, -0.2], vmax: [0.3, 0.2], gravity: 6, size: [0.14, 0.06], colors: C.acid, round: true }),
]);
effect('melfs-acid-arrow-impact', 2.4, [
  emitter('flash', once(0.05, { max: 6, rate: 120, life: [0.12, 0.2], size: [1.3, 0.4], colors: C2.acidArrow, round: true })),
  emitter('spray', once(0.08, { max: 40, rate: 500, box: [0.3, 0.3], life: [0.45, 0.8], vmin: [-3.5, 0.5], vmax: [3.5, 4.5], gravity: 7, drag: 0.4, size: [0.2, 0.08], colors: C.acid, round: true })),
  emitter('hiss', once(1.4, { max: 30, rate: 22, ring: 0.8, filled: true, life: [0.4, 0.8], vmin: [-0.2, 0.4], vmax: [0.2, 1.2], size: [0.14, 0.22], colors: C.acid, round: true })),
  emitter('fumes', once(1.2, { max: 14, rate: 10, ring: 0.7, filled: true, life: [0.8, 1.2], vmin: [-0.2, 0.4], vmax: [0.2, 1], size: [0.4, 0.8], colors: C.gas, round: true, blend: 'alpha' })),
]);

// Scorching Ray: three rays of fire, each a lingering line of flame behind a white-hot point; each strikes in a burst of
// flame.
cast('scorching-ray', C2.ray, { round: true, gravity: 1 });
effect('scorching-ray-flight', 1, [
  emitter('core', { max: 30, rate: 160, life: [0.04, 0.08], size: [0.45, 0.2], colors: C.fireCore, round: true }),
  emitter('beam', { max: 120, rate: 180, life: [0.2, 0.4], vmin: [-0.15, -0.15], vmax: [0.15, 0.15], size: [0.26, 0.06], colors: C2.ray, round: true }),
  emitter('embers', { max: 20, rate: 25, life: [0.3, 0.6], vmin: [-0.6, 0.2], vmax: [0.6, 1.2], gravity: 1, size: [0.1, 0.04], colors: C.ember }),
]);
effect('scorching-ray-impact', 1.2, [
  emitter('flash', once(0.05, { max: 6, rate: 120, life: [0.1, 0.18], size: [1.1, 0.35], colors: C.fireCore, round: true })),
  emitter('flames', once(0.07, { max: 36, rate: 500, box: [0.2, 0.2], life: [0.25, 0.5], vmin: [-3.5, -1.5], vmax: [3.5, 3.5], drag: 2.2, size: [0.4, 0.1], colors: C.flame, round: true })),
  emitter('embers', once(0.07, { max: 16, rate: 220, life: [0.4, 0.7], vmin: [-3, 1], vmax: [3, 4], gravity: 6, size: [0.1, 0.04], colors: C.ember })),
]);

// Shatter (40 px round): a ringing burst — a wave of sound flung to its edge, crystalline shards bursting over all of it.
effect('shatter', 1.6, [
  emitter('flash', once(0.05, { max: 8, rate: 150, life: [0.12, 0.22], size: [2, 0.5], colors: C2.shatter, round: true })),
  emitter('wave', once(0.05, { max: 90, rate: 1800, ring: 0.4, life: [0.3, 0.34], radial: 7, size: [0.24, 0.06], colors: C2.shatter })),
  emitter('shards', once(0.1, { max: 70, rate: 700, ring: 2.5, filled: true, life: [0.35, 0.6], vmin: [-2.5, -1], vmax: [2.5, 3], gravity: 5, drag: 0.6, size: [0.2, 0.06], colors: C2.shatter })),
  emitter('dust', once(0.15, { max: 20, rate: 140, ring: 2.3, filled: true, life: [0.6, 1], vmin: [-0.3, 0], vmax: [0.3, 0.6], drag: 0.6, size: [0.5, 0.9], colors: C.dust, round: true, blend: 'alpha' })),
]);

// Cloud of Daggers (28 px round, while it lasts): daggers of light whirling through it, glinting, a spatter of red now and then.
effect('cloud-of-daggers', 1, [
  emitter('daggers', { max: 90, rate: 80, ring: 1.75, filled: true, life: [0.5, 0.8], orbit: 5, vmin: [-0.4, -0.4], vmax: [0.4, 0.4], size: [0.28, 0.1], colors: C2.steel }),
  emitter('glints', { max: 30, rate: 30, ring: 1.6, filled: true, life: [0.15, 0.3], orbit: 5, size: [0.3, 0.06], colors: C.silver }),
  emitter('spatter', { max: 10, rate: 5, ring: 1.4, filled: true, life: [0.3, 0.5], vmin: [-1, 0], vmax: [1, 1.5], gravity: 5, size: [0.12, 0.05], colors: C2.blood, round: true, blend: 'alpha' }),
]);

// Prayer of Healing: warm golden light rising round each hero it mends, a ring of it at their feet.
effect('prayer-of-healing', 1.8, [
  emitter('ring', once(0.06, { max: 40, rate: 700, ring: 1.2, life: [0.4, 0.6], orbit: 2, size: [0.18, 0.05], colors: C2.holy })),
  emitter('motes', once(0.5, { max: 40, rate: 80, ring: 1, filled: true, life: [0.6, 1], vmin: [-0.2, 1], vmax: [0.2, 2.4], drag: 0.6, size: [0.2, 0.05], colors: C2.holy, round: true })),
  emitter('glow', once(0.1, { max: 8, rate: 80, life: [0.3, 0.5], size: [1.6, 0.6], colors: C2.holy, round: true })),
]);

// ── 3rd- to 6th-level spells ──────────────────────────────────────────────────
// Sizes follow src/data/spells.json (16 px a unit): keep them in step when an area changes there.

const C3 = {
  blast: gradient([[0, [1, 1, 0.85]], [0.2, [1, 0.85, 0.35]], [0.5, [1, 0.45, 0.1]], [1, [0.55, 0.1, 0.04]]], [[0, 1], [0.5, 0.85], [1, 0]]),
  soot: gradient([[0, [0.3, 0.2, 0.15]], [1, [0.1, 0.08, 0.07]]], [[0, 0], [0.2, 0.55], [1, 0]]),
  bolt: gradient([[0, [1, 1, 1]], [0.25, [0.8, 0.95, 1]], [0.7, [0.45, 0.7, 1]], [1, [0.3, 0.4, 1]]], [[0, 1], [0.6, 0.9], [1, 0]]),
  boltGlow: gradient([[0, [0.6, 0.8, 1]], [1, [0.3, 0.45, 1]]], [[0, 0.5], [1, 0]]),
  crimson: gradient([[0, [1, 0.6, 0.6]], [0.35, [0.85, 0.12, 0.18]], [1, [0.3, 0.02, 0.06]]], [[0, 0.95], [0.6, 0.8], [1, 0]]),
  necrotic: gradient([[0, [0.8, 1, 0.7]], [0.35, [0.45, 0.6, 0.25]], [1, [0.15, 0.12, 0.1]]], [[0, 0.9], [0.6, 0.7], [1, 0]]),
  rot: gradient([[0, [0.2, 0.25, 0.12]], [1, [0.05, 0.06, 0.04]]], [[0, 0], [0.25, 0.6], [1, 0]]),
  ash: gradient([[0, [0.55, 0.5, 0.4]], [1, [0.3, 0.27, 0.22]]], [[0, 0.8], [0.7, 0.6], [1, 0]]),
  psychic: gradient([[0, [1, 0.9, 1]], [0.35, [0.85, 0.45, 0.95]], [1, [0.35, 0.1, 0.5]]], [[0, 0.9], [0.6, 0.75], [1, 0]]),
  dread: gradient([[0, [0.18, 0.05, 0.25]], [1, [0.05, 0.02, 0.08]]], [[0, 0], [0.3, 0.6], [1, 0]]),
  hail: gradient([[0, [1, 1, 1]], [1, [0.75, 0.9, 1]]], [[0, 0.95], [0.8, 0.9], [1, 0]]),
  stone: gradient([[0, [0.85, 0.8, 0.7]], [0.5, [0.62, 0.56, 0.47]], [1, [0.38, 0.34, 0.3]]], [[0, 1], [0.7, 0.9], [1, 0]]),
  poison: gradient([[0, [0.75, 0.85, 0.3]], [1, [0.4, 0.5, 0.12]]], [[0, 0], [0.25, 0.42], [1, 0]]),
  deathRing: gradient([[0, [0.85, 0.95, 0.85]], [0.3, [0.45, 0.85, 0.55]], [1, [0.2, 0.15, 0.35]]], [[0, 1], [0.6, 0.8], [1, 0]]),
  ruin: gradient([[0, [0.85, 1, 0.6]], [0.4, [0.4, 1, 0.3]], [1, [0.1, 0.6, 0.1]]]),
  sun: gradient([[0, [1, 1, 0.95]], [0.4, [1, 0.95, 0.6]], [1, [1, 0.75, 0.25]]], [[0, 0.9], [0.6, 0.75], [1, 0]]),
  sunGlow: gradient([[0, [1, 0.95, 0.7]], [1, [1, 0.8, 0.4]]], [[0, 0], [0.3, 0.3], [1, 0]]),
};

// Fireball (56 px round): a bright streak leaves the hands; where it lands it blooms — a white-hot flash, a ball of fire
// swelling out to its edge, flames over all of it, embers flung and a pall of soot rising.
effect('fireball-cast', 1, [
  emitter('glow', once(0.1, { max: 12, rate: 120, box: [0.3, 0.3], life: [0.15, 0.3], vmin: [0, -0.2], vmax: [1, 0.2], drag: 2, size: [1, 0.3], colors: C.fireCore, round: true })),
  emitter('streak', once(0.12, { max: 30, rate: 250, box: [0.2, 0.2], life: [0.15, 0.3], vmin: [8, -0.4], vmax: [14, 0.4], drag: 1, size: [0.3, 0.06], colors: C.flame, round: true })),
]);
effect('fireball', 2.4, [
  emitter('flash', once(0.06, { max: 8, rate: 140, life: [0.15, 0.25], size: [4, 1.2], colors: C.fireCore, round: true })),
  emitter('ball', once(0.08, { max: 140, rate: 1800, ring: 0.5, filled: true, life: [0.3, 0.42], radial: 8, size: [0.9, 0.3], colors: C3.blast, round: true })),
  emitter('flames', once(0.25, { max: 160, rate: 640, ring: 3.4, filled: true, life: [0.35, 0.7], vmin: [-0.4, 0.4], vmax: [0.4, 1.8], drag: 0.8, size: [0.6, 0.15], colors: C.flame, round: true })),
  emitter('embers', once(0.1, { max: 60, rate: 600, ring: 0.8, filled: true, life: [0.6, 1.1], vmin: [-7, -2], vmax: [7, 8], gravity: 7, drag: 0.4, size: [0.14, 0.05], colors: C.ember })),
  emitter('soot', once(0.3, { max: 30, rate: 100, ring: 3, filled: true, life: [1, 1.6], vmin: [-0.4, 0.6], vmax: [0.4, 1.6], drag: 0.5, size: [0.8, 1.6], colors: C3.soot, round: true, blend: 'alpha', start: 0.12 })),
]);

// Lightning Bolt (a line 192 px long and 10 px each side, from the hands along +x): a stroke of lightning the whole length,
// flickering twice, a glow along it and sparks jumping off it.
effect('lightning-bolt', 1.2, [
  emitter('stroke', once(0.1, { max: 320, rate: 3000, box: [12, 0.3], at: [6, 0], life: [0.08, 0.16], vmin: [-0.4, -0.6], vmax: [0.4, 0.6], size: [0.3, 0.1], colors: C3.bolt })),
  emitter('flicker', once(0.08, { max: 240, rate: 3000, box: [12, 0.45], at: [6, 0], life: [0.06, 0.12], vmin: [-0.4, -0.8], vmax: [0.4, 0.8], size: [0.24, 0.08], colors: C3.bolt, start: 0.18 })),
  emitter('glow', once(0.08, { max: 40, rate: 500, box: [12, 0.2], at: [6, 0], life: [0.2, 0.35], size: [1.4, 0.6], colors: C3.boltGlow, round: true })),
  emitter('sparks', once(0.25, { max: 80, rate: 320, box: [12, 0.4], at: [6, 0], life: [0.12, 0.3], vmin: [-4, -5], vmax: [4, 5], drag: 2, size: [0.12, 0.04], colors: C.lightning })),
]);

// Vampiric Touch: a dark crimson grasp, shadow trailing; on its victim it draws their blood out in a spiral of red motes.
cast('vampiric-touch', C3.crimson, { round: true });
effect('vampiric-touch-flight', 1, [
  emitter('core', { max: 30, rate: 120, life: [0.06, 0.12], vmin: [-0.3, -0.3], vmax: [0.3, 0.3], size: [0.6, 0.3], colors: C3.crimson, round: true }),
  emitter('wisps', { max: 40, rate: 45, box: [0.3, 0.3], life: [0.4, 0.7], vmin: [-0.9, -0.9], vmax: [0.9, 0.9], drag: 1.2, size: [0.3, 0.1], colors: C3.crimson, round: true }),
  emitter('shade', { max: 16, rate: 22, box: [0.2, 0.2], life: [0.4, 0.6], vmin: [-0.4, -0.4], vmax: [0.4, 0.4], drag: 1, size: [0.35, 0.1], colors: C.shadow, round: true, blend: 'alpha' }),
]);
effect('vampiric-touch-impact', 1.8, [
  emitter('flash', once(0.05, { max: 6, rate: 120, life: [0.12, 0.2], size: [1.2, 0.4], colors: C3.crimson, round: true })),
  emitter('drain', once(0.4, { max: 50, rate: 140, ring: 1.4, life: [0.4, 0.6], radial: -2.6, orbit: 3, size: [0.2, 0.06], colors: C3.crimson, round: true })),
  emitter('blood', once(0.1, { max: 14, rate: 140, box: [0.4, 0.4], life: [0.3, 0.5], vmin: [-1.5, 0.5], vmax: [1.5, 2.5], gravity: 6, size: [0.12, 0.05], colors: C2.blood, round: true, blend: 'alpha' })),
]);

// The flare of a necrotic spell (Blight, Circle of Death) and of a psychic one (Phantasmal Killer) in the hands.
cast('necrotic', C3.necrotic, { round: true });
cast('psychic', C3.psychic, { round: true });

// Blight (24 px round): life drained out of whatever stands there — sickly motes drawn in, spiralling, rot seeping up, dry ash
// falling.
effect('blight', 2, [
  emitter('glow', once(0.3, { max: 10, rate: 35, life: [0.3, 0.5], size: [1.6, 0.8], colors: C3.necrotic, round: true, start: 0.25 })),
  emitter('drain', once(0.45, { max: 90, rate: 220, ring: 1.7, life: [0.4, 0.6], radial: -2.8, orbit: 2.5, size: [0.3, 0.08], colors: C3.necrotic, round: true })),
  emitter('rot', once(0.3, { max: 16, rate: 60, ring: 1.3, filled: true, life: [0.8, 1.3], vmin: [-0.2, 0.3], vmax: [0.2, 0.9], drag: 0.6, size: [0.5, 1], colors: C3.rot, round: true, blend: 'alpha' })),
  emitter('ash', once(0.5, { max: 40, rate: 80, ring: 1.4, filled: true, life: [0.7, 1.1], vmin: [-0.4, -0.2], vmax: [0.4, 0.6], gravity: 1.2, drag: 0.5, size: [0.16, 0.1], colors: C3.ash, blend: 'alpha', start: 0.2 })),
]);

// Ice Storm (56 px round): hail hammers down over all of it, shattering where it lands, cold mist settling.
effect('ice-storm', 2.4, [
  emitter('hail', once(0.8, { max: 160, rate: 200, box: [6.4, 1], at: [0, 6], life: [0.3, 0.55], vmin: [-1, -20], vmax: [1, -15], size: [0.22, 0.16], colors: C3.hail })),
  emitter('shatter', once(0.8, { max: 140, rate: 170, ring: 3.4, filled: true, life: [0.15, 0.3], vmin: [-2.5, 0.2], vmax: [2.5, 2.5], gravity: 6, drag: 1, size: [0.14, 0.04], colors: C.frost, start: 0.3 })),
  emitter('mist', once(0.6, { max: 30, rate: 50, ring: 3.3, filled: true, life: [0.9, 1.4], vmin: [-0.3, -0.1], vmax: [0.3, 0.4], drag: 0.8, size: [0.9, 1.6], colors: C.frostMist, round: true, blend: 'alpha', start: 0.3 })),
]);

// Phantasmal Killer (20 px round): a nightmare closing on its victim — violet wisps spiralling in, dread welling up, a last
// flare of terror.
effect('phantasmal-killer', 2, [
  emitter('wisps', once(0.6, { max: 60, rate: 110, ring: 1.5, life: [0.5, 0.8], radial: -1.8, orbit: -3.5, size: [0.3, 0.06], colors: C3.psychic, round: true })),
  emitter('dread', once(0.4, { max: 16, rate: 45, ring: 1, filled: true, life: [0.8, 1.2], vmin: [-0.2, 0.2], vmax: [0.2, 0.8], drag: 0.6, size: [0.6, 1.1], colors: C3.dread, round: true, blend: 'alpha' })),
  emitter('terror', once(0.06, { max: 8, rate: 140, life: [0.2, 0.35], size: [1.8, 0.4], colors: C3.psychic, round: true, start: 0.55 })),
]);

// Stoneskin (while it lasts): flakes of stone drawn onto the body, dust shaken off; then flecks of stone glinting on it.
effect('stoneskin', 1.6, [
  emitter('flakes', once(0.3, { max: 50, rate: 170, ring: 2, life: [0.35, 0.5], radial: -4, size: [0.2, 0.14], colors: C3.stone, blend: 'alpha' })),
  emitter('dust', once(0.2, { max: 14, rate: 70, ring: 1, filled: true, life: [0.6, 0.9], vmin: [-0.4, 0], vmax: [0.4, 0.5], drag: 0.8, size: [0.5, 0.9], colors: C.dust, round: true, blend: 'alpha', start: 0.25 })),
]);
effect('stoneskin-aura', 1, [
  emitter('flecks', { max: 36, rate: 22, box: [1.2, 1.8], life: [0.5, 0.9], vmin: [-0.05, -0.2], vmax: [0.05, -0.05], size: [0.14, 0.1], colors: C3.stone, blend: 'alpha' }),
]);

// Cloudkill (64 px round, while it lasts): a heavy yellow-green fog rolling over all of it, sickly motes drifting in it.
effect('cloudkill', 1, [
  emitter('fog', { max: 70, rate: 32, ring: 3.8, filled: true, life: [1.6, 2.4], vmin: [-0.3, -0.15], vmax: [0.3, 0.25], drag: 0.3, size: [1.4, 2.2], colors: C3.poison, round: true, blend: 'alpha' }),
  emitter('motes', { max: 40, rate: 20, ring: 3.6, filled: true, life: [0.9, 1.5], vmin: [-0.3, 0], vmax: [0.3, 0.5], size: [0.12, 0.04], colors: C.sick }),
]);

// Cone of Cold (from the hands along +x, 128 px long): a blast of freezing air fanning out the whole length, ice crystals
// flung along it, a cold mist lingering after.
effect('cone-of-cold', 1.8, [
  emitter('blast', once(0.35, { max: 200, rate: 420, box: [0.15, 0.15], life: [0.35, 0.6], vmin: [20, -12], vmax: [32, 12], drag: 1.1, size: [0.25, 0.7], colors: C.frost, round: true })),
  emitter('crystals', once(0.3, { max: 60, rate: 140, box: [0.1, 0.1], life: [0.45, 0.7], vmin: [18, -12], vmax: [30, 12], drag: 1.2, size: [0.14, 0.04], colors: C.frostCore })),
  emitter('mist', once(0.3, { max: 24, rate: 60, box: [5, 4], at: [5, 0], life: [0.8, 1.2], vmin: [-0.2, -0.1], vmax: [0.4, 0.3], drag: 0.8, size: [0.8, 1.5], colors: C.frostMist, round: true, blend: 'alpha', start: 0.2 })),
]);

// Chain Lightning (64 px round): a crackling burst where it is aimed, arcs leaping out to the edge; a bolt from above on
// each foe it catches (`-strike`).
effect('chain-lightning', 1.2, [
  emitter('flash', once(0.05, { max: 8, rate: 140, life: [0.1, 0.2], size: [2.4, 0.6], colors: C.lightning, round: true })),
  emitter('arcs', once(0.2, { max: 260, rate: 1300, ring: 0.3, life: [0.15, 0.28], radial: 15, size: [0.24, 0.08], colors: C3.bolt })),
  emitter('glow', once(0.1, { max: 20, rate: 200, ring: 1.5, filled: true, life: [0.2, 0.35], size: [1.4, 0.6], colors: C3.boltGlow, round: true })),
  emitter('crackle', once(0.35, { max: 70, rate: 200, ring: 3.8, filled: true, life: [0.05, 0.12], vmin: [-3, -3], vmax: [3, 3], size: [0.14, 0.05], colors: C.lightning })),
]);
effect('chain-lightning-strike', 1, [
  emitter('bolt', once(0.05, { max: 90, rate: 1800, box: [0.25, 5], at: [0, 2.5], life: [0.08, 0.15], vmin: [-0.8, -0.3], vmax: [0.8, 0.3], size: [0.26, 0.1], colors: C3.bolt })),
  emitter('flash', once(0.05, { max: 6, rate: 120, life: [0.1, 0.18], size: [1.4, 0.4], colors: C.lightning, round: true, at: [0, 1] })),
  emitter('sparks', once(0.08, { max: 30, rate: 400, box: [0.4, 0.2], life: [0.12, 0.28], vmin: [-6, -1], vmax: [6, 6], gravity: 4, drag: 2, size: [0.12, 0.04], colors: C.lightning })),
]);

// Circle of Death (96 px round): a sphere of negative energy swelling out from its middle to its edge, dark shade welling up
// over all of it, wisps of the life it takes rising.
effect('circle-of-death', 2.4, [
  emitter('flash', once(0.06, { max: 8, rate: 140, life: [0.15, 0.28], size: [3, 0.8], colors: C3.deathRing, round: true })),
  emitter('wave', once(0.08, { max: 200, rate: 2600, ring: 0.6, life: [0.42, 0.48], radial: 13, size: [0.3, 0.1], colors: C3.deathRing })),
  emitter('shade', once(0.4, { max: 60, rate: 150, ring: 5.6, filled: true, life: [0.8, 1.3], vmin: [-0.2, 0.2], vmax: [0.2, 0.8], drag: 0.6, size: [0.9, 1.6], colors: C3.rot, round: true, blend: 'alpha', start: 0.15 })),
  emitter('wisps', once(0.6, { max: 70, rate: 120, ring: 5.6, filled: true, life: [0.6, 1], vmin: [-0.2, 0.8], vmax: [0.2, 2], drag: 0.5, size: [0.18, 0.05], colors: C3.necrotic, round: true, start: 0.2 })),
]);

// Disintegrate: a thin green ray; whatever it strikes crumbles — a green flash, its dust lifted away in fine motes.
cast('disintegrate', C3.ruin);
effect('disintegrate-flight', 1, [
  emitter('core', { max: 30, rate: 170, life: [0.04, 0.08], size: [0.35, 0.15], colors: C3.ruin, round: true }),
  emitter('beam', { max: 140, rate: 200, life: [0.25, 0.45], vmin: [-0.08, -0.08], vmax: [0.08, 0.08], size: [0.2, 0.05], colors: C3.ruin, round: true }),
  emitter('motes', { max: 20, rate: 25, life: [0.3, 0.6], vmin: [-0.4, -0.4], vmax: [0.4, 0.4], size: [0.1, 0.03], colors: C3.ruin }),
]);
effect('disintegrate-impact', 2, [
  emitter('flash', once(0.05, { max: 6, rate: 120, life: [0.12, 0.22], size: [1.6, 0.4], colors: C3.ruin, round: true })),
  emitter('crumble', once(0.5, { max: 60, rate: 130, box: [1, 1.6], life: [0.7, 1.1], vmin: [-0.4, 0.6], vmax: [0.4, 1.8], drag: 0.6, size: [0.14, 0.04], colors: C3.ruin })),
  emitter('dust', once(0.4, { max: 24, rate: 60, box: [1, 1.4], life: [0.9, 1.4], vmin: [-0.4, 0.3], vmax: [0.4, 1], drag: 0.6, size: [0.5, 1], colors: C.dust, round: true, blend: 'alpha' })),
]);

// Otiluke's Freezing Sphere (60 px round): the frigid globe bursts — a white flash, shards of ice flung to its edge, a ring of
// frost there, freezing mist over all of it and snow drifting down.
effect('freezing-sphere', 2.4, [
  emitter('flash', once(0.06, { max: 8, rate: 140, life: [0.15, 0.25], size: [3.4, 1], colors: C.frostCore, round: true })),
  emitter('shards', once(0.08, { max: 120, rate: 1500, ring: 0.4, life: [0.35, 0.42], radial: 9, size: [0.24, 0.08], colors: C.frost })),
  emitter('rime', once(0.1, { max: 80, rate: 800, ring: 3.7, life: [0.5, 0.8], vmin: [-0.2, -0.2], vmax: [0.2, 0.3], size: [0.2, 0.08], colors: C.frostCore, start: 0.3 })),
  emitter('mist', once(0.3, { max: 40, rate: 130, ring: 3.5, filled: true, life: [1, 1.5], vmin: [-0.3, -0.1], vmax: [0.3, 0.4], drag: 0.8, size: [0.9, 1.6], colors: C.frostMist, round: true, blend: 'alpha', start: 0.15 })),
  emitter('snow', once(0.8, { max: 60, rate: 70, box: [7, 1], at: [0, 3], life: [1, 1.5], vmin: [-0.3, -1.6], vmax: [0.3, -0.8], size: [0.12, 0.08], colors: C3.hail, round: true, start: 0.2 })),
]);

// Sunbeam (40 px round): a beam of sunlight down from above onto it, motes of light sinking in the beam, a disc of light on
// the floor and sparks of it rising.
cast('sunbeam', C3.sun, { round: true });
effect('sunbeam', 2, [
  emitter('beam', once(0.6, { max: 140, rate: 220, box: [2.4, 9], at: [0, 4.5], life: [0.35, 0.6], vmin: [-0.1, -6], vmax: [0.1, -3], size: [0.3, 0.1], colors: C3.sun, round: true })),
  emitter('shaft', once(0.6, { max: 20, rate: 30, box: [2, 8], at: [0, 4], life: [0.4, 0.7], size: [1.6, 1.2], colors: C3.sunGlow, round: true })),
  emitter('disc', once(0.5, { max: 40, rate: 80, ring: 2.4, filled: true, life: [0.4, 0.7], size: [0.9, 0.5], colors: C3.sunGlow, round: true })),
  emitter('sparks', once(0.6, { max: 50, rate: 90, ring: 2.4, filled: true, life: [0.5, 0.9], vmin: [-0.3, 0.8], vmax: [0.3, 2.2], drag: 0.5, size: [0.14, 0.04], colors: C3.sun })),
]);

// ── Flasks, grease and fire; the dungeon's own cantrips ──────────────────────
// Sizes follow src/data/throwables.json and src/data/spells.json (16 px a unit): a flask's splash 48 px round (alchemist's
// fire) or 96 px (grease); Grease 44 px; fire on the floor about 44 px.

const C4 = {
  grease: gradient([[0, [0.75, 0.6, 0.3]], [0.5, [0.5, 0.38, 0.16]], [1, [0.3, 0.22, 0.08]]], [[0, 0.95], [0.7, 0.8], [1, 0]]),
  sheen: gradient([[0, [1, 0.95, 0.75]], [1, [0.85, 0.75, 0.45]]], [[0, 0], [0.3, 0.7], [1, 0]]),
  gold: gradient([[0, [1, 1, 0.85]], [0.4, [1, 0.85, 0.4]], [1, [0.85, 0.55, 0.15]]]),
  goldGlow: gradient([[0, [1, 0.9, 0.6]], [1, [1, 0.7, 0.25]]], [[0, 0], [0.3, 0.4], [1, 0]]),
  wisp: gradient([[0, [1, 0.98, 0.85]], [0.5, [1, 0.85, 0.5]], [1, [1, 0.6, 0.2]]], [[0, 0.9], [0.6, 0.6], [1, 0]]),
};

// Alchemist's Fire: a flask of liquid fire tumbling through the air, flames licking off it and drops of fire falling; it
// shatters in a splash of fire over the whole of its splash, glass glinting, embers and smoke.
effect('alchemists-fire-flight', 1, [
  emitter('core', { max: 20, rate: 90, life: [0.05, 0.1], size: [0.4, 0.2], colors: C.fireCore, round: true }),
  emitter('flames', { max: 40, rate: 60, box: [0.15, 0.15], life: [0.2, 0.4], vmin: [-0.5, 0.4], vmax: [0.5, 1.2], drag: 1, size: [0.32, 0.08], colors: C.flame, round: true }),
  emitter('drops', { max: 16, rate: 12, box: [0.1, 0.1], life: [0.3, 0.5], vmin: [-0.3, -0.5], vmax: [0.3, 0], gravity: 6, size: [0.12, 0.06], colors: C.hot, round: true }),
]);
effect('alchemists-fire', 2, [
  emitter('flash', once(0.05, { max: 6, rate: 120, life: [0.12, 0.2], size: [2, 0.6], colors: C.fireCore, round: true })),
  emitter('splash', once(0.1, { max: 80, rate: 800, ring: 1.2, filled: true, life: [0.35, 0.7], vmin: [-3, 0.5], vmax: [3, 4], gravity: 5, drag: 0.8, size: [0.42, 0.1], colors: C.flame, round: true })),
  emitter('glass', once(0.06, { max: 20, rate: 300, box: [0.2, 0.2], life: [0.3, 0.5], vmin: [-5, 1], vmax: [5, 5], gravity: 9, size: [0.1, 0.05], colors: C.silver })),
  emitter('embers', once(0.1, { max: 30, rate: 300, ring: 2.6, filled: true, life: [0.6, 1.1], vmin: [-1, 1], vmax: [1, 3], gravity: 3, drag: 0.4, size: [0.12, 0.05], colors: C.ember })),
  emitter('smoke', once(0.2, { max: 14, rate: 70, ring: 2, filled: true, life: [0.8, 1.3], vmin: [-0.4, 0.6], vmax: [0.4, 1.4], drag: 0.6, size: [0.5, 1.1], colors: C.smoke, round: true, blend: 'alpha' })),
]);
// Fire on the floor (while it burns): tongues of flame rising all over it, sparks and a little smoke.
effect('fire-surface', 1, [
  emitter('flames', { max: 90, rate: 70, ring: 2.6, filled: true, life: [0.35, 0.7], vmin: [-0.2, 1], vmax: [0.2, 2.4], drag: 0.6, size: [0.5, 0.12], colors: C.flame, round: true }),
  emitter('sparks', { max: 30, rate: 14, ring: 2.4, filled: true, life: [0.5, 1], vmin: [-0.5, 2], vmax: [0.5, 3.6], gravity: 0.6, drag: 0.4, size: [0.12, 0.04], colors: C.hot }),
  emitter('smoke', { max: 12, rate: 5, ring: 2.2, filled: true, life: [1, 1.6], vmin: [-0.3, 0.8], vmax: [0.3, 1.6], drag: 0.5, size: [0.6, 1.2], colors: C.smoke, round: true, blend: 'alpha' }),
]);
// A body on fire: flames climbing it, embers flying off.
effect('burning', 1, [
  emitter('flames', { max: 40, rate: 40, box: [0.7, 1], life: [0.3, 0.55], vmin: [-0.3, 1], vmax: [0.3, 2.2], drag: 0.7, size: [0.4, 0.1], colors: C.flame, round: true }),
  emitter('embers', { max: 12, rate: 6, box: [0.5, 0.8], life: [0.5, 0.9], vmin: [-0.8, 1.5], vmax: [0.8, 3], gravity: 1, size: [0.1, 0.04], colors: C.ember }),
]);
// Grease: a bottle of pale fat tumbling, oozing clumps; it bursts in a slick of brown grease spreading over its splash, a
// sickly sheen on it. Grease set alight goes up in a whoosh of flame over all of it.
effect('grease-flight', 1, [
  emitter('blob', { max: 20, rate: 70, life: [0.06, 0.12], size: [0.38, 0.2], colors: C4.grease, round: true, blend: 'alpha' }),
  emitter('drips', { max: 16, rate: 14, box: [0.1, 0.1], life: [0.3, 0.6], vmin: [-0.3, -0.4], vmax: [0.3, 0], gravity: 5, size: [0.14, 0.08], colors: C4.grease, round: true, blend: 'alpha' }),
]);
effect('grease-splash', 1.8, [
  emitter('slick', once(0.12, { max: 60, rate: 500, ring: 0.6, life: [0.5, 0.8], radial: 6, drag: 2.5, size: [0.6, 0.9], colors: C4.grease, round: true, blend: 'alpha' })),
  emitter('clumps', once(0.08, { max: 30, rate: 400, box: [0.3, 0.3], life: [0.4, 0.7], vmin: [-4, 1], vmax: [4, 4.5], gravity: 9, size: [0.24, 0.12], colors: C4.grease, round: true, blend: 'alpha', floor: 0.5 })),
  emitter('sheen', once(0.5, { max: 24, rate: 50, ring: 3, filled: true, life: [0.4, 0.8], size: [0.16, 0.05], colors: C4.sheen })),
]);
effect('grease', 1.8, [
  emitter('slick', once(0.12, { max: 50, rate: 420, ring: 0.5, life: [0.45, 0.7], radial: 5, drag: 2.5, size: [0.55, 0.85], colors: C4.grease, round: true, blend: 'alpha' })),
  emitter('sheen', once(0.5, { max: 20, rate: 40, ring: 2.6, filled: true, life: [0.4, 0.8], size: [0.16, 0.05], colors: C4.sheen })),
]);
effect('grease-ignite', 1.8, [
  emitter('flash', once(0.06, { max: 8, rate: 140, ring: 1.5, filled: true, life: [0.15, 0.25], size: [2.2, 0.8], colors: C.fireCore, round: true })),
  emitter('whoosh', once(0.15, { max: 120, rate: 800, ring: 2.8, filled: true, life: [0.4, 0.8], vmin: [-0.4, 2], vmax: [0.4, 5], drag: 0.8, size: [0.6, 0.15], colors: C.flame, round: true })),
  emitter('smoke', once(0.3, { max: 20, rate: 70, ring: 2.6, filled: true, life: [1, 1.6], vmin: [-0.4, 1], vmax: [0.4, 2], drag: 0.5, size: [0.7, 1.4], colors: C.smoke, round: true, blend: 'alpha' })),
]);
// Dancing Lights: a burst of golden motes as they are called up, then each light a warm orb of torchlight, motes drifting
// off it.
effect('dancing-lights-cast', 1.4, [
  emitter('motes', once(0.12, { max: 50, rate: 400, ring: 0.4, life: [0.5, 0.9], radial: 3, orbit: 2, size: [0.18, 0.05], colors: C4.gold })),
  emitter('glow', once(0.06, { max: 6, rate: 120, life: [0.25, 0.4], size: [2.2, 0.6], colors: C4.goldGlow, round: true })),
]);
effect('dancing-light', 1, [
  emitter('orb', { max: 12, rate: 30, life: [0.2, 0.35], size: [0.55, 0.4], colors: C4.wisp, round: true }),
  emitter('halo', { max: 6, rate: 8, life: [0.5, 0.8], size: [1.2, 1.4], colors: C4.goldGlow, round: true }),
  emitter('motes', { max: 14, rate: 7, box: [0.3, 0.3], life: [0.5, 0.9], vmin: [-0.4, -0.2], vmax: [0.4, 0.6], drag: 0.5, size: [0.1, 0.03], colors: C4.gold }),
]);
// True Strike: golden runes of insight flaring round the eyes as it is cast (and again as the blow it guides is struck);
// while it lasts, a faint ring of them circles the head.
effect('true-strike', 1.2, [
  emitter('runes', once(0.08, { max: 30, rate: 500, ring: 0.9, life: [0.35, 0.55], orbit: 3, radial: -1, size: [0.2, 0.05], colors: C4.gold })),
  emitter('flash', once(0.05, { max: 6, rate: 120, life: [0.15, 0.25], size: [1.2, 0.4], colors: C4.goldGlow, round: true })),
]);
effect('true-strike-aura', 1, [
  emitter('runes', { max: 20, rate: 14, ring: 0.8, at: [0, 0.8], life: [0.5, 0.8], orbit: 2.5, size: [0.12, 0.03], colors: C4.gold }),
]);

// ── 1st-level spells of the dungeon: Sleep, Longstrider, Protection from Evil and Good, Fog Cloud; the floor's sheen ──
// Sizes follow src/data/spells.json (16 px a unit): Fog Cloud 64 px round; a puddle's sheen is made 32 px round and scaled
// to the puddle (systems/VfxSystem.ts).

const C5 = {
  sleep: gradient([[0, [1, 0.95, 1]], [0.4, [0.78, 0.62, 1]], [1, [0.42, 0.3, 0.85]]], [[0, 0.95], [0.6, 0.7], [1, 0]]),
  sleepGlow: gradient([[0, [0.8, 0.65, 1]], [1, [0.5, 0.35, 0.9]]], [[0, 0], [0.3, 0.35], [1, 0]]),
  wind: gradient([[0, [0.95, 1, 0.9]], [0.5, [0.6, 0.95, 0.55]], [1, [0.25, 0.6, 0.35]]], [[0, 0.9], [0.6, 0.6], [1, 0]]),
  ward: gradient([[0, [1, 1, 0.95]], [0.45, [1, 0.92, 0.6]], [1, [0.85, 0.7, 0.35]]], [[0, 0.95], [0.6, 0.75], [1, 0]]),
  wardGlow: gradient([[0, [1, 0.95, 0.75]], [1, [0.9, 0.8, 0.5]]], [[0, 0], [0.4, 0.16], [1, 0]]),
  fog: gradient([[0, [0.82, 0.86, 0.9]], [1, [0.62, 0.66, 0.72]]], [[0, 0], [0.35, 0.09], [0.7, 0.07], [1, 0]]),
  fogRim: gradient([[0, [0.86, 0.9, 0.94]], [1, [0.66, 0.7, 0.76]]], [[0, 0], [0.35, 0.3], [0.75, 0.22], [1, 0]]),
  fogBillow: gradient([[0, [0.9, 0.93, 0.96]], [1, [0.7, 0.74, 0.8]]], [[0, 0], [0.2, 0.42], [1, 0]]),
  glint: gradient([[0, [1, 1, 1]], [1, [0.75, 0.9, 1]]], [[0, 0], [0.3, 0.85], [1, 0]]),
};

// Sleep: a lilac mote of slumber drifting out of the hands, a dust of sparkles trailing and sinking from it; it settles on
// its foe in a puff of that dust; a sleeper breathes out slow motes that rise and fade over its head.
cast('sleep', C5.sleep, { round: true });
effect('sleep-flight', 1, [
  emitter('core', { max: 24, rate: 110, life: [0.06, 0.12], vmin: [-0.2, -0.2], vmax: [0.2, 0.2], size: [0.5, 0.25], colors: C5.sleep, round: true }),
  emitter('halo', { max: 8, rate: 18, life: [0.25, 0.4], size: [1, 1.3], colors: C5.sleepGlow, round: true }),
  emitter('dust', { max: 40, rate: 45, box: [0.2, 0.2], life: [0.5, 0.9], vmin: [-0.3, -0.2], vmax: [0.3, 0.3], gravity: 1, drag: 1, size: [0.12, 0.03], colors: C5.sleep }),
]);
effect('sleep-impact', 1.6, [
  emitter('glow', once(0.06, { max: 6, rate: 120, life: [0.25, 0.4], size: [1.6, 0.6], colors: C5.sleepGlow, round: true })),
  emitter('dust', once(0.3, { max: 60, rate: 220, ring: 1, filled: true, at: [0, 0.8], life: [0.6, 1.1], vmin: [-0.4, -0.6], vmax: [0.4, 0.2], gravity: 0.8, drag: 0.8, size: [0.14, 0.04], colors: C5.sleep })),
]);
effect('sleep-zzz', 2, [
  emitter('motes', { max: 16, rate: 4.5, box: [0.2, 0.1], life: [1.4, 2], vmin: [0.15, 0.6], vmax: [0.45, 1], drag: 0.2, size: [0.4, 0.7], colors: C5.sleep, round: true }),
  emitter('sparkles', { max: 16, rate: 5, box: [0.6, 0.3], life: [0.6, 1], vmin: [-0.2, 0.2], vmax: [0.2, 0.6], size: [0.12, 0.03], colors: C5.sleep }),
  emitter('glow', { max: 4, rate: 1.2, life: [1.2, 1.6], size: [0.8, 1.2], colors: C5.sleepGlow, round: true }),
]);
// Longstrider: a gust of green wind wheels up round the legs as it is cast; while it lasts, wisps of it stream off the feet.
effect('longstrider', 1.4, [
  emitter('gust', once(0.25, { max: 60, rate: 260, ring: 0.9, at: [0, -0.8], life: [0.35, 0.6], orbit: 5, vmin: [0, 0.6], vmax: [0, 1.6], size: [0.16, 0.04], colors: C5.wind })),
  emitter('flash', once(0.05, { max: 6, rate: 120, at: [0, -0.4], life: [0.15, 0.25], size: [1.2, 0.4], colors: C5.wind, round: true })),
]);
effect('longstrider-aura', 1, [
  emitter('wisps', { max: 16, rate: 9, box: [0.9, 0.2], at: [0, -0.85], life: [0.35, 0.6], vmin: [-0.6, 0.1], vmax: [0.6, 0.4], drag: 1.5, size: [0.12, 0.03], colors: C5.wind }),
]);
// Protection from Evil and Good: a ring of pale golden glyphs closes in round the companion; while it holds, a few of them
// circle the body in a faint glow.
effect('protection-from-evil-and-good', 1.4, [
  emitter('glyphs', once(0.08, { max: 50, rate: 800, ring: 1.6, life: [0.35, 0.5], radial: -2.5, orbit: 2, size: [0.18, 0.05], colors: C5.ward })),
  emitter('flash', once(0.05, { max: 6, rate: 120, life: [0.18, 0.28], size: [1.8, 0.6], colors: C5.ward, round: true })),
]);
effect('protection-aura', 1, [
  emitter('glyphs', { max: 24, rate: 14, ring: 1.1, life: [0.8, 1.2], orbit: 1.6, size: [0.12, 0.03], colors: C5.ward }),
  emitter('glow', { max: 8, rate: 6, ring: 0.9, filled: true, life: [0.6, 0.9], size: [0.8, 1.1], colors: C5.wardGlow, round: true }),
]);
// Fog Cloud (64 px round): fog billows out over all of it as it is cast; while it lasts, thin banks of fog drift slowly over
// it and roll along its edge, thick at the rim and thin in the middle, so the fight inside shows through.
effect('fog-cloud-burst', 2, [
  emitter('billow', once(0.25, { max: 60, rate: 240, ring: 0.6, filled: true, life: [0.9, 1.4], radial: 4, drag: 1.6, size: [1, 2.4], colors: C5.fogBillow, round: true, blend: 'alpha' })),
]);
effect('fog-cloud', 1, [
  emitter('bank', { max: 24, rate: 7, ring: 3.2, filled: true, life: [2.6, 3.6], vmin: [-0.12, -0.06], vmax: [0.12, 0.1], orbit: 0.1, size: [1.8, 2.8], colors: C5.fog, round: true, blend: 'alpha' }),
  emitter('rim', { max: 60, rate: 22, ring: 3.9, life: [2.2, 3], vmin: [-0.1, -0.05], vmax: [0.1, 0.12], orbit: 0.16, size: [1.2, 2], colors: C5.fogRim, round: true, blend: 'alpha' }),
  emitter('curls', { max: 30, rate: 10, ring: 3.6, life: [1.6, 2.4], vmin: [-0.3, 0.1], vmax: [0.3, 0.5], orbit: -0.25, size: [0.5, 1.2], colors: C5.fogBillow, round: true, blend: 'alpha' }),
]);
// The floor's sheen (made 32 px round): glints winking on a grease slick and on still water.
effect('grease-sheen', 1, [
  emitter('glints', { max: 12, rate: 5, ring: 1.7, filled: true, life: [0.5, 1], size: [0.12, 0.04], colors: C4.sheen }),
]);
effect('water-glint', 1, [
  emitter('glints', { max: 12, rate: 4, ring: 1.7, filled: true, life: [0.4, 0.9], size: [0.12, 0.03], colors: C5.glint }),
]);

// ── Spells that hold, hide and shape: Charm Person, Tasha's, Blindness, Hold Person, Crown of Madness, Ray of
// Enfeeblement, Blur, Mirror Image, Shadow Blade, See Invisibility, Magic Weapon, Invisibility, Darkness, Flaming Sphere,
// Gust of Wind, Misty Step, Web; and the marks a blow of fire, poison or acid, cold or lightning leaves for a round ──
// Sizes follow src/data/spells.json (16 px a unit): Darkness 64 px round; Flaming Sphere a ball about 10 px round, striking
// 40 px round; Gust of Wind a line 192 px long along +x, 24 px each side; Web a square 48 px each way; See Invisibility 96 px.

const C6 = {
  charm: gradient([[0, [1, 0.9, 0.97]], [0.4, [1, 0.5, 0.78]], [1, [0.75, 0.2, 0.55]]], [[0, 0.95], [0.6, 0.75], [1, 0]]),
  laugh: gradient([[0, [1, 1, 0.85]], [0.4, [1, 0.88, 0.35]], [1, [0.9, 0.6, 0.1]]], [[0, 0.95], [0.6, 0.75], [1, 0]]),
  blind: gradient([[0, [0.5, 0.45, 0.85]], [1, [0.08, 0.05, 0.2]]], [[0, 0], [0.3, 0.75], [1, 0]]),
  hold: gradient([[0, [1, 1, 1]], [0.35, [0.55, 0.88, 1]], [1, [0.2, 0.45, 0.95]]], [[0, 0.95], [0.6, 0.7], [1, 0]]),
  madness: gradient([[0, [1, 0.85, 0.8]], [0.35, [0.95, 0.25, 0.2]], [1, [0.4, 0.05, 0.05]]], [[0, 0.95], [0.6, 0.75], [1, 0]]),
  enfeeble: gradient([[0, [0.55, 0.55, 0.6]], [0.5, [0.2, 0.2, 0.25]], [1, [0.05, 0.05, 0.08]]], [[0, 0.9], [0.6, 0.7], [1, 0]]),
  enfeebleGlow: gradient([[0, [0.6, 0.65, 0.45]], [1, [0.3, 0.32, 0.2]]], [[0, 0], [0.3, 0.5], [1, 0]]),
  blur: gradient([[0, [1, 1, 1]], [1, [0.75, 0.85, 1]]], [[0, 0], [0.3, 0.5], [1, 0]]),
  glass: gradient([[0, [1, 1, 1]], [0.4, [0.7, 0.9, 1]], [1, [0.35, 0.6, 1]]], [[0, 1], [0.6, 0.8], [1, 0]]),
  gloom: gradient([[0, [0.75, 0.6, 1]], [0.4, [0.4, 0.2, 0.75]], [1, [0.08, 0.02, 0.15]]], [[0, 0.95], [0.6, 0.75], [1, 0]]),
  gloomSmoke: gradient([[0, [0.2, 0.1, 0.3]], [1, [0.05, 0.02, 0.08]]], [[0, 0], [0.25, 0.6], [1, 0]]),
  eye: gradient([[0, [1, 1, 0.9]], [0.4, [1, 0.85, 0.4]], [1, [0.8, 0.55, 0.15]]], [[0, 0.95], [0.6, 0.7], [1, 0]]),
  arcane: gradient([[0, [1, 1, 1]], [0.35, [0.6, 0.85, 1]], [1, [0.3, 0.5, 1]]], [[0, 1], [0.6, 0.8], [1, 0]]),
  vanish: gradient([[0, [1, 1, 1]], [1, [0.8, 0.9, 1]]], [[0, 0.9], [0.5, 0.45], [1, 0]]),
  dark: gradient([[0, [0.06, 0.04, 0.1]], [1, [0.01, 0.01, 0.03]]], [[0, 0], [0.3, 0.55], [0.7, 0.45], [1, 0]]),
  darkRim: gradient([[0, [0.12, 0.08, 0.2]], [1, [0.02, 0.01, 0.05]]], [[0, 0], [0.3, 0.75], [0.75, 0.6], [1, 0]]),
  wind: gradient([[0, [1, 1, 1]], [0.5, [0.85, 0.92, 1]], [1, [0.6, 0.7, 0.85]]], [[0, 0], [0.2, 0.75], [0.7, 0.5], [1, 0]]),
  dust: gradient([[0, [0.75, 0.68, 0.55]], [1, [0.5, 0.45, 0.35]]], [[0, 0], [0.25, 0.45], [1, 0]]),
  mist: gradient([[0, [0.95, 0.97, 1]], [1, [0.7, 0.78, 0.88]]], [[0, 0], [0.25, 0.65], [1, 0]]),
  silver: gradient([[0, [1, 1, 1]], [1, [0.75, 0.8, 0.9]]], [[0, 1], [0.6, 0.7], [1, 0]]),
  web: gradient([[0, [1, 1, 1]], [1, [0.8, 0.8, 0.78]]], [[0, 0.95], [0.7, 0.6], [1, 0]]),
  poison: gradient([[0, [0.85, 1, 0.55]], [0.4, [0.45, 0.85, 0.2]], [1, [0.15, 0.4, 0.05]]], [[0, 0.95], [0.6, 0.75], [1, 0]]),
  fumes: gradient([[0, [0.5, 0.75, 0.25]], [1, [0.25, 0.4, 0.1]]], [[0, 0], [0.25, 0.4], [1, 0]]),
  rime: gradient([[0, [1, 1, 1]], [0.4, [0.75, 0.92, 1]], [1, [0.45, 0.7, 1]]], [[0, 1], [0.6, 0.8], [1, 0]]),
  spark: gradient([[0, [1, 1, 1]], [0.3, [0.7, 0.95, 1]], [1, [0.3, 0.55, 1]]], [[0, 1], [0.7, 0.9], [1, 0]]),
};

// Charm Person: pink motes spiral in round its head and a warm flush blooms over it.
effect('charm-person', 1.6, [
  emitter('motes', once(0.3, { max: 50, rate: 200, ring: 1.4, at: [0, 0.6], life: [0.5, 0.8], radial: -2, orbit: 3, size: [0.2, 0.05], colors: C6.charm, round: true })),
  emitter('flush', once(0.06, { max: 6, rate: 120, at: [0, 0.6], life: [0.3, 0.5], size: [1.4, 0.5], colors: C6.charm, round: true })),
]);
// Tasha's Hideous Laughter: golden bubbles of mirth burst up round the head; while it holds, a few keep popping over it.
effect('hideous-laughter', 1.6, [
  emitter('bubbles', once(0.35, { max: 40, rate: 140, box: [1, 0.4], at: [0, 0.6], life: [0.5, 0.9], vmin: [-0.8, 0.8], vmax: [0.8, 2.2], drag: 1, size: [0.25, 0.4], colors: C6.laugh, round: true })),
  emitter('flash', once(0.05, { max: 4, rate: 80, at: [0, 0.6], life: [0.2, 0.3], size: [1.2, 0.4], colors: C6.laugh, round: true })),
]);
effect('laughter-aura', 1, [
  emitter('bubbles', { max: 12, rate: 6, box: [0.8, 0.2], at: [0, 0.3], life: [0.5, 0.8], vmin: [-0.5, 0.6], vmax: [0.5, 1.4], size: [0.15, 0.3], colors: C6.laugh, round: true }),
]);
// Blindness/Deafness: a dark veil draws in round the eyes and settles over them.
effect('blindness', 1.6, [
  emitter('veil', once(0.3, { max: 40, rate: 160, ring: 1.3, at: [0, 0.7], life: [0.5, 0.8], radial: -1.8, size: [0.5, 0.2], colors: C6.blind, round: true, blend: 'alpha' })),
  emitter('glint', once(0.05, { max: 8, rate: 160, at: [0, 0.7], life: [0.2, 0.3], size: [0.6, 0.15], colors: C5.sleepGlow, round: true })),
]);
// Hold Person: bands of azure runes close round the body and lock; while it holds, runes hang still round it.
effect('hold-person', 1.6, [
  emitter('runes', once(0.15, { max: 60, rate: 400, ring: 1.6, life: [0.45, 0.6], radial: -2.4, orbit: 4, size: [0.2, 0.06], colors: C6.hold })),
  emitter('lock', once(0.05, { max: 6, rate: 120, life: [0.2, 0.3], size: [1.8, 0.5], colors: C6.hold, round: true })),
]);
effect('hold-aura', 1, [
  emitter('runes', { max: 20, rate: 10, ring: 0.95, life: [0.6, 1], orbit: 0.3, size: [0.12, 0.04], colors: C6.hold }),
]);
// Crown of Madness: a crown of jagged iron springs up over the head, sparks of crimson madness off it; while it holds, it
// turns there.
effect('crown-of-madness', 1.6, [
  emitter('spikes', once(0.1, { max: 30, rate: 300, ring: 0.6, at: [0, 1.6], life: [0.35, 0.5], vmin: [0, 0.8], vmax: [0, 1.6], size: [0.18, 0.05], colors: C6.madness })),
  emitter('flare', once(0.05, { max: 6, rate: 120, at: [0, 1.4], life: [0.2, 0.3], size: [1.2, 0.4], colors: C6.madness, round: true })),
]);
effect('madness-aura', 1, [
  emitter('crown', { max: 18, rate: 14, ring: 0.5, at: [0, 1.6], life: [0.3, 0.5], orbit: 3, vmin: [0, 0.2], vmax: [0, 0.6], size: [0.14, 0.04], colors: C6.madness }),
]);
// Ray of Enfeeblement: a black beam of enervating energy, grey motes sloughing off it; it strikes in a sickly pall.
cast('ray-of-enfeeblement', C6.enfeeble, { round: true });
effect('ray-of-enfeeblement-flight', 1, [
  emitter('core', { max: 30, rate: 140, life: [0.06, 0.12], size: [0.45, 0.2], colors: C6.enfeeble, round: true, blend: 'alpha' }),
  emitter('beam', { max: 60, rate: 120, life: [0.3, 0.5], size: [0.3, 0.05], colors: C6.enfeeble, round: true, blend: 'alpha' }),
  emitter('motes', { max: 20, rate: 25, box: [0.2, 0.2], life: [0.4, 0.7], vmin: [-0.3, -0.6], vmax: [0.3, 0], size: [0.12, 0.04], colors: C6.enfeebleGlow }),
]);
effect('ray-of-enfeeblement-impact', 1.6, [
  emitter('pall', once(0.2, { max: 30, rate: 160, ring: 0.6, filled: true, life: [0.6, 1], vmin: [-0.4, -0.5], vmax: [0.4, -0.1], size: [0.6, 1], colors: C6.enfeeble, round: true, blend: 'alpha' })),
  emitter('glow', once(0.06, { max: 6, rate: 100, life: [0.3, 0.45], size: [1.4, 0.6], colors: C6.enfeebleGlow, round: true })),
]);
effect('enfeebled-aura', 1, [
  emitter('motes', { max: 10, rate: 5, box: [0.8, 1.2], life: [0.8, 1.2], vmin: [-0.1, -0.5], vmax: [0.1, -0.2], size: [0.14, 0.04], colors: C6.enfeebleGlow }),
]);
// Blur: the body shudders into streaks of itself as it is cast; while it lasts, faint streaks waver off its sides.
effect('blur', 1.2, [
  emitter('streaks', once(0.2, { max: 40, rate: 200, box: [0.6, 1.6], life: [0.25, 0.4], vmin: [-3, 0], vmax: [3, 0], drag: 3, size: [0.3, 0.1], colors: C6.blur, round: true })),
]);
effect('blur-aura', 1, [
  emitter('streaks', { max: 16, rate: 10, box: [0.6, 1.4], life: [0.25, 0.4], vmin: [-1.5, 0], vmax: [1.5, 0], drag: 2, size: [0.25, 0.08], colors: C6.blur, round: true }),
]);
// Mirror Image: shards of light gather round the body into three likenesses; a duplicate struck shatters like glass.
effect('mirror-image', 1.4, [
  emitter('shards', once(0.15, { max: 60, rate: 400, ring: 1.8, life: [0.4, 0.6], radial: -3, size: [0.2, 0.05], colors: C6.glass })),
  emitter('flash', once(0.05, { max: 6, rate: 120, life: [0.2, 0.3], size: [1.6, 0.5], colors: C6.glass, round: true })),
]);
effect('mirror-image-pop', 1.2, [
  emitter('shards', once(0.06, { max: 40, rate: 700, box: [0.6, 1], life: [0.35, 0.6], vmin: [-3, -1], vmax: [3, 3], gravity: 6, size: [0.18, 0.05], colors: C6.glass })),
]);
// Shadow Blade: threads of shadow wind into a blade in the hand; while it lasts, gloom smokes off it (over the head too, where
// its sign floats: systems/WeaponSignSystem.ts).
effect('shadow-blade', 1.4, [
  emitter('threads', once(0.25, { max: 50, rate: 220, ring: 1.2, life: [0.4, 0.6], radial: -2.5, orbit: 3, size: [0.18, 0.05], colors: C6.gloom })),
  emitter('smoke', once(0.2, { max: 16, rate: 80, life: [0.5, 0.8], vmin: [-0.3, 0.3], vmax: [0.3, 0.8], size: [0.4, 0.8], colors: C6.gloomSmoke, round: true, blend: 'alpha' })),
]);
effect('shadow-blade-sign', 1, [
  emitter('smoke', { max: 16, rate: 9, box: [0.15, 0.6], life: [0.5, 0.8], vmin: [-0.2, 0.2], vmax: [0.2, 0.6], size: [0.25, 0.5], colors: C6.gloomSmoke, round: true, blend: 'alpha' }),
  emitter('motes', { max: 10, rate: 6, box: [0.15, 0.6], life: [0.4, 0.7], vmin: [-0.2, 0], vmax: [0.2, 0.4], size: [0.1, 0.03], colors: C6.gloom }),
]);
// Magic Weapon: blue sparks run up the weapon and burst off its tip; while it lasts, its sign over the head glints.
effect('magic-weapon', 1.4, [
  emitter('sparks', once(0.3, { max: 50, rate: 180, box: [0.2, 1], life: [0.35, 0.6], vmin: [-0.4, 0.8], vmax: [0.4, 2], drag: 1, size: [0.16, 0.04], colors: C6.arcane })),
  emitter('flash', once(0.05, { max: 4, rate: 80, at: [0, 0.8], life: [0.2, 0.3], size: [1.2, 0.4], colors: C6.arcane, round: true })),
]);
effect('magic-weapon-sign', 1, [
  emitter('glints', { max: 12, rate: 7, box: [0.15, 0.6], life: [0.3, 0.6], vmin: [-0.1, 0], vmax: [0.1, 0.3], size: [0.12, 0.03], colors: C6.arcane }),
]);
// See Invisibility: golden light flares at the eyes and a ring of it sweeps out as far as it sees (96 px); while it lasts, a
// glimmer of gold at the eyes.
effect('see-invisibility', 1.6, [
  emitter('eyes', once(0.06, { max: 6, rate: 100, at: [0, 1.6], life: [0.25, 0.4], size: [1, 0.3], colors: C6.eye, round: true })),
  emitter('sweep', once(0.08, { max: 80, rate: 1000, ring: 0.5, life: [0.6, 0.75], radial: 8, drag: 0.2, size: [0.18, 0.05], colors: C6.eye })),
]);
effect('see-invisibility-aura', 1, [
  emitter('glimmer', { max: 8, rate: 5, box: [0.5, 0.1], at: [0, 1.6], life: [0.3, 0.5], size: [0.12, 0.03], colors: C6.eye }),
]);
// Invisibility: the body fades in a breath of pale motes; revealed, it shimmers back into sight in a ring of gold.
effect('invisibility', 1.6, [
  emitter('motes', once(0.35, { max: 50, rate: 160, box: [0.9, 1.6], life: [0.5, 0.9], vmin: [-0.3, 0.2], vmax: [0.3, 1], drag: 1, size: [0.18, 0.04], colors: C6.vanish })),
]);
effect('invisibility-reveal', 1.4, [
  emitter('ring', once(0.08, { max: 50, rate: 700, ring: 1.6, life: [0.35, 0.5], radial: -3, size: [0.18, 0.05], colors: C6.eye })),
  emitter('flash', once(0.05, { max: 6, rate: 120, life: [0.2, 0.3], size: [1.6, 0.5], colors: C6.eye, round: true })),
]);
// Darkness (64 px round): black rolls out over all of it as it is cast; while it lasts, inky banks heave over it, darkest at
// the rim (its body is drawn by systems/CloudSystem.ts).
effect('darkness-burst', 2, [
  emitter('billow', once(0.3, { max: 70, rate: 240, ring: 0.6, filled: true, life: [1, 1.5], radial: 4, drag: 1.6, size: [1.2, 2.6], colors: C6.darkRim, round: true, blend: 'alpha' })),
]);
effect('darkness', 1, [
  emitter('bank', { max: 30, rate: 10, ring: 3.2, filled: true, life: [2.4, 3.4], vmin: [-0.12, -0.08], vmax: [0.12, 0.1], orbit: 0.1, size: [1.8, 2.8], colors: C6.dark, round: true, blend: 'alpha' }),
  emitter('rim', { max: 50, rate: 18, ring: 3.9, life: [2.2, 3], vmin: [-0.1, -0.05], vmax: [0.1, 0.1], orbit: 0.16, size: [1.4, 2.2], colors: C6.darkRim, round: true, blend: 'alpha' }),
]);
// Flaming Sphere: a ball of fire, flames licking up off it, embers and smoke; a burst of flame as it is called up.
effect('flaming-sphere', 1, [
  emitter('core', { max: 30, rate: 90, ring: 0.3, filled: true, at: [0, 0.6], life: [0.12, 0.22], size: [0.7, 0.35], colors: C.fireCore, round: true }),
  emitter('flames', { max: 60, rate: 80, ring: 0.5, filled: true, at: [0, 0.6], life: [0.3, 0.55], vmin: [-0.3, 0.8], vmax: [0.3, 2], drag: 0.8, size: [0.5, 0.1], colors: C.flame, round: true }),
  emitter('embers', { max: 20, rate: 10, ring: 0.4, at: [0, 0.6], life: [0.6, 1], vmin: [-1, 1.5], vmax: [1, 3], gravity: 1.5, size: [0.1, 0.04], colors: C.ember }),
  emitter('smoke', { max: 16, rate: 8, at: [0, 1.2], life: [0.8, 1.2], vmin: [-0.2, 0.6], vmax: [0.2, 1.2], size: [0.4, 0.9], colors: C.smoke, round: true, blend: 'alpha' }),
]);
// Gust of Wind (a line along +x, 192 px long): streaks of wind tear along the whole of it, dust whipped up along the floor.
effect('gust-of-wind', 1.2, [
  emitter('streaks', once(0.35, { max: 90, rate: 260, box: [1, 2.4], at: [0.5, 0], life: [0.5, 0.8], vmin: [16, -0.2], vmax: [22, 0.2], drag: 0.3, size: [0.35, 0.12], colors: C6.wind, round: true })),
  emitter('dust', once(0.35, { max: 40, rate: 120, box: [6, 2.4], at: [6, -0.8], life: [0.5, 0.9], vmin: [6, 0], vmax: [12, 0.6], drag: 1, size: [0.4, 0.9], colors: C6.dust, round: true, blend: 'alpha' })),
]);
// Misty Step: silver mist puffs out round the body where it leaves and where it comes out.
effect('misty-step', 1.4, [
  emitter('mist', once(0.15, { max: 40, rate: 260, ring: 0.6, filled: true, life: [0.6, 1], radial: 2, drag: 1.5, size: [0.8, 1.6], colors: C6.mist, round: true, blend: 'alpha' })),
  emitter('glints', once(0.15, { max: 24, rate: 160, box: [0.8, 1.4], life: [0.4, 0.7], vmin: [-0.4, 0.2], vmax: [0.4, 1], size: [0.12, 0.03], colors: C6.silver })),
]);
// Web (a square 48 px each way): strands fly out to its edges as it is spun.
effect('web', 1.4, [
  emitter('strands', once(0.15, { max: 80, rate: 600, life: [0.35, 0.5], radial: 7, drag: 1, size: [0.12, 0.04], colors: C6.web })),
  emitter('puff', once(0.08, { max: 10, rate: 120, ring: 1.5, filled: true, life: [0.4, 0.6], size: [1, 1.6], colors: C6.web, round: true, blend: 'alpha' })),
]);
// The marks a blow leaves for a round (systems/Afflictions.ts): poison and acid drip and fume green off the body, cold rimes it
// with frost and breathes a cold mist down it, lightning crackles over it. (Fire's is 'burning'.)
effect('afflict-poison', 1, [
  emitter('drips', { max: 24, rate: 12, box: [0.9, 1.3], life: [0.4, 0.7], vmin: [-0.1, -0.4], vmax: [0.1, 0], gravity: 3, size: [0.2, 0.1], colors: C6.poison, round: true }),
  emitter('bubbles', { max: 16, rate: 8, box: [0.8, 1.2], life: [0.3, 0.5], vmin: [-0.2, 0.2], vmax: [0.2, 0.6], size: [0.12, 0.22], colors: C6.poison, round: true }),
  emitter('fumes', { max: 16, rate: 7, box: [0.8, 1], life: [0.7, 1.1], vmin: [-0.2, 0.4], vmax: [0.2, 0.9], size: [0.5, 1], colors: C6.fumes, round: true, blend: 'alpha' }),
]);
effect('afflict-cold', 1, [
  emitter('rime', { max: 30, rate: 18, box: [1, 1.5], life: [0.5, 0.9], size: [0.24, 0.06], colors: C6.rime }),
  emitter('glow', { max: 6, rate: 4, box: [0.4, 0.8], life: [0.4, 0.7], size: [1.2, 1.6], colors: C.frostMist, round: true }),
  emitter('flakes', { max: 16, rate: 8, box: [1, 0.3], at: [0, 0.9], life: [0.8, 1.2], vmin: [-0.2, -1], vmax: [0.2, -0.5], size: [0.12, 0.08], colors: C6.rime, round: true }),
  emitter('mist', { max: 12, rate: 5, box: [0.8, 0.8], life: [0.8, 1.2], vmin: [-0.2, -0.4], vmax: [0.2, -0.1], size: [0.6, 1.1], colors: C.frostMist, round: true, blend: 'alpha' }),
]);
effect('afflict-lightning', 1, [
  emitter('sparks', { max: 40, rate: 30, box: [1, 1.5], life: [0.08, 0.18], vmin: [-4, -4], vmax: [4, 4], size: [0.18, 0.05], colors: C6.spark }),
  emitter('arcs', { max: 12, rate: 6, box: [0.8, 1.3], life: [0.06, 0.12], vmin: [-8, -8], vmax: [8, 8], size: [0.3, 0.08], colors: C6.spark }),
  emitter('glow', { max: 6, rate: 5, box: [0.6, 1], life: [0.08, 0.16], size: [1.2, 0.4], colors: C6.spark, round: true }),
]);

// Effects no longer made are dropped from the project.
for (const file of readdirSync(OUT)) {
  if (file.endsWith('.json') && !written.has(file)) unlinkSync(new URL(file, OUT));
}
console.log(`Wrote ${written.size} effects to vfx/`);
