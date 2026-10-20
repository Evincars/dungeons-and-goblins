import { Texture } from 'pixi.js';

/**
 * Every texture the game draws with, by key: loaded PNGs, crops cut from them and procedural art.
 * Kept apart from the loader so sheets and text can read textures without depending on what loads them.
 */
const textures = new Map<string, Texture>();

export function setTexture(key: string, texture: Texture): void {
  textures.set(key, texture);
}

/** The texture under a key, or Texture.EMPTY while it is not loaded. */
export function getTexture(key: string): Texture {
  return textures.get(key) ?? Texture.EMPTY;
}

export function hasTexture(key: string): boolean {
  return textures.has(key);
}
