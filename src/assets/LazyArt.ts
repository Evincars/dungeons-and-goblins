import { Assets, Texture } from 'pixi.js';
import type { SpriteSheet } from './SpriteSheet';
import { getTexture, hasTexture } from './Textures';
import { reportRejection } from '../core/errors';

/**
 * Art that loads the first time it is asked for: item and HUD icons and the effects are hundreds of files
 * (the effects alone 66 MB), far too much to fetch before the title screen. Ask for a texture by key; it
 * is there at once if loaded, otherwise it loads and listeners hear when it arrives.
 */

/** The sheet that provides each texture key. */
const providers = new Map<string, SpriteSheet>();
const loads = new Map<SpriteSheet, Promise<void>>();
const listeners = new Set<() => void>();

/** Makes the textures `keys` (the sheet's own key, or its regions) loadable on demand. */
export function registerLazy(sheet: SpriteSheet, keys: readonly string[]): void {
  for (const key of keys) providers.set(key, sheet);
}

async function loadSheet(sheet: SpriteSheet): Promise<void> {
  await Assets.load(sheet.asset);
  sheet.register();
  for (const listener of listeners) listener();
}

/** Loads the art behind a key (once); resolves when it can be drawn. Keys nobody provides resolve at once. */
export function requestArt(key: string): Promise<void> {
  const sheet = providers.get(key);
  if (!sheet || hasTexture(key)) return Promise.resolve();
  let load = loads.get(sheet);
  if (!load) {
    load = loadSheet(sheet);
    loads.set(sheet, load);
  }
  return load;
}

/** The texture under a key: at once if loaded, otherwise Texture.EMPTY while it loads. */
export function lazyTexture(key: string): Texture {
  if (hasTexture(key)) return getTexture(key);
  reportRejection(requestArt(key), `Art "${key}" did not load`, 'render');
  return Texture.EMPTY;
}

/** Calls `listener` whenever lazily loaded art arrives; returns the call that stops it. */
export function onArtLoaded(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
