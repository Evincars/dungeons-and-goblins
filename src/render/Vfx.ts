import { createPixiVfx2dProjection, createPixiVfxProceduralTextures, PixiVfxRenderer } from 'nixie-fx/pixi';
import { loadVfxExportBundle } from 'nixie-fx/export';
import type { VfxExportBundle, VfxExportedEffect } from 'nixie-fx/export';
import { attempt, attemptAsync, LoadError, ok } from '../core/errors';
import type { Result } from '../core/errors';
import { isRecord } from '../core/guards';
import { assetUrl } from '../assets/assetUrl';

/**
 * Particle effects made with NixieFX (https://nixiefx.com): authored in its editor as the project in `vfx/` (open the
 * folder at nixiefx.com/editor; scripts/vfx-effects.mjs builds them all, `npm run vfx:effects`), compiled by `npm run vfx:export` into
 * `public/vfx` (a manifest and one JSON file per effect), loaded here once with the art and played by one shared renderer.
 * An effect's units are VFX_PIXELS_PER_UNIT pixels with y up, as the editor shows them, and it plays at its own origin: whoever
 * plays it puts the instance's root where it goes off (and turns it the way it faces). Effects are only looks: every screen
 * plays its own (systems/VfxSystem.ts), a one-shot asked for by the co-op host as a short signal (render/VfxPlayer.ts);
 * nothing of them is sent in the world's state or saved.
 */

/** The effects the game plays: the exported bundle must hold every one of them. */
export const VFX_EFFECTS = [
  'torch-sparks', 'campfire-embers',
  'fire-bolt-cast', 'fire-bolt-flight', 'fire-bolt-impact',
  'ray-of-frost-cast', 'ray-of-frost-flight', 'ray-of-frost-impact',
  'chill-touch-cast', 'chill-touch-flight', 'chill-touch-impact',
  'shocking-grasp-cast', 'shocking-grasp-flight', 'shocking-grasp-impact',
  'witch-bolt-cast', 'witch-bolt-flight', 'witch-bolt-impact',
  'chromatic-orb-cast', 'chromatic-orb-flight', 'chromatic-orb-impact',
  'ray-of-sickness-cast', 'ray-of-sickness-flight', 'ray-of-sickness-impact',
  'magic-missile-cast', 'magic-missile-flight', 'magic-missile-impact',
  'burning-hands', 'acid-splash', 'poison-spray', 'ice-knife', 'thunderwave',
  'blade-ward', 'blade-ward-aura', 'false-life', 'mage-armor', 'shield', 'shield-aura',
  'melfs-acid-arrow-cast', 'melfs-acid-arrow-flight', 'melfs-acid-arrow-impact',
  'scorching-ray-cast', 'scorching-ray-flight', 'scorching-ray-impact',
  'shatter', 'cloud-of-daggers', 'prayer-of-healing',
] as const;
export type VfxEffectId = (typeof VFX_EFFECTS)[number];

export function isVfxEffectId(value: unknown): value is VfxEffectId {
  return VFX_EFFECTS.some((id) => id === value);
}

/** One unit of an effect is this many pixels of the world. */
export const VFX_PIXELS_PER_UNIT = 16;
const VFX_ROOT = 'vfx/';

let bundle: VfxExportBundle | null = null;
let renderer: PixiVfxRenderer | null = null;

/** Checks an exported bundle (its manifest and effect files, read as JSON) and that it holds every effect the game plays. */
export function parseVfxBundle(manifest: unknown, effectsByPath: Readonly<Record<string, unknown>>): Result<VfxExportBundle> {
  return attempt(
    () => loadVfxExportBundle({ manifest, effectsByPath }, { requiredBackend: 'pixi2d', requiredEffectIds: VFX_EFFECTS }),
    'invalid-data',
  );
}

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(assetUrl(VFX_ROOT + path));
  if (!response.ok) throw new LoadError('Effect file not found', { context: { path, status: response.status } });
  const json: unknown = await response.json();
  return json;
}

/** The manifest's effect files, by the paths it lists them under. */
function effectPaths(manifest: unknown): string[] {
  if (!isRecord(manifest) || !Array.isArray(manifest.effects)) return [];
  return manifest.effects.flatMap((entry: unknown) => (isRecord(entry) && typeof entry.path === 'string' ? [entry.path] : []));
}

/** Fetches and checks the exported effects (with the art, behind the loading screen). */
export async function loadVfx(): Promise<Result<void>> {
  const fetched = await attemptAsync(async () => {
    const manifest = await fetchJson('manifest.json');
    const files = await Promise.all(effectPaths(manifest).map(async (path) => [path, await fetchJson(path)] as const));
    return { manifest, effectsByPath: Object.fromEntries(files) };
  }, 'load-failed');
  if (!fetched.ok) return fetched;
  const parsed = parseVfxBundle(fetched.value.manifest, fetched.value.effectsByPath);
  if (!parsed.ok) return parsed;
  bundle = parsed.value;
  return ok(undefined);
}

/** An effect to play, or undefined when the effects could not be loaded (the game goes on without them). */
export function vfxEffect(id: VfxEffectId): VfxExportedEffect | undefined {
  return bundle?.effectsById.get(id);
}

/**
 * The renderer every effect is played by, made on first use: effects draw in world pixels (each instance's root is put
 * in the game layer by whoever plays it), with the library's own soft dots and squares for untextured particles.
 */
export function vfxRenderer(): PixiVfxRenderer {
  renderer ??= new PixiVfxRenderer({
    projection: createPixiVfx2dProjection({ pixelsPerUnit: VFX_PIXELS_PER_UNIT, yAxis: 'up' }),
    fallbackTextures: createPixiVfxProceduralTextures(),
  });
  return renderer;
}

/** A spot in the world (px, y down) as an effect position (units, y up), written into `out`: for an effect left at its root's origin that moves (a trail). */
export function vfxPoint(x: number, y: number, out: [number, number, number]): [number, number, number] {
  out[0] = x / VFX_PIXELS_PER_UNIT;
  out[1] = -y / VFX_PIXELS_PER_UNIT;
  out[2] = 0;
  return out;
}
