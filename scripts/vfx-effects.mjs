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
 * per axis), `radial` (units/s out from the origin, negative in), gravity, drag, size [start, end] (units), colours (a
 * gradient over life), `round` soft dots or crisp squares, `blend`, `floor` (units below the origin where they land).
 */
function emitter(id, o) {
  const e = structuredClone(base.emitters[0]);
  e.id = id;
  e.name = id;
  e.maxParticles = o.max;
  e.duration = o.duration ?? 1;
  e.loop = o.loop ?? true;
  Object.assign(e.modules, { velocity: true, color: true, size: true, noise: false, collision: !!o.floor, velocityOverLifetime: !!o.radial });
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

// Blade Ward: silver glints circling the body.
effect('blade-ward', 1.6, [
  emitter('glints', once(0.45, { max: 40, rate: 80, ring: 1.1, life: [0.5, 0.8], vmin: [-0.3, 0.3], vmax: [0.3, 1], size: [0.16, 0.04], colors: C.silver })),
]);
// False Life: dark green motes of borrowed life rising into the body.
effect('false-life', 1.8, [
  emitter('motes', once(0.5, { max: 40, rate: 70, ring: 1.3, filled: true, life: [0.6, 0.9], radial: -1, vmin: [-0.2, 0.6], vmax: [0.2, 1.4], size: [0.22, 0.06], colors: C.life, round: true })),
  emitter('shade', once(0.3, { max: 10, rate: 30, box: [1, 1.4], life: [0.6, 0.9], vmin: [0, 0.3], vmax: [0, 0.8], size: [0.4, 0.2], colors: C.shadow, round: true, blend: 'alpha' })),
]);
// Mage Armour: blue motes rising round the body, a shimmer settling on it.
effect('mage-armor', 1.6, [
  emitter('motes', once(0.45, { max: 40, rate: 80, box: [1.4, 1.8], life: [0.5, 0.9], vmin: [-0.3, 0.8], vmax: [0.3, 2], drag: 0.8, size: [0.16, 0.04], colors: C.arcane })),
  emitter('ring', once(0.06, { max: 40, rate: 700, ring: 1.3, life: [0.3, 0.45], radial: -1.5, size: [0.14, 0.05], colors: C.arcane })),
]);
// Shield: a ring of force flashing up round the body.
effect('shield', 1, [
  emitter('ring', once(0.06, { max: 60, rate: 1000, ring: 1.3, life: [0.25, 0.45], vmin: [-0.2, -0.2], vmax: [0.2, 0.2], size: [0.18, 0.05], colors: C.arcane })),
  emitter('flash', once(0.05, { max: 6, rate: 120, life: [0.12, 0.2], size: [1.8, 0.6], colors: C.arcane, round: true })),
]);

// Effects no longer made are dropped from the project.
for (const file of readdirSync(OUT)) {
  if (file.endsWith('.json') && !written.has(file)) unlinkSync(new URL(file, OUT));
}
console.log(`Wrote ${written.size} effects to vfx/`);
