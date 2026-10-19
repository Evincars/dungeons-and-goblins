/** Dungeon props cut from /catacombs/decorative.png (exact sprite bounds). */

export type PropDef = {
  rect: { x: number; y: number; w: number; h: number };
  /** 'floor' stands on its tile; 'wall' hangs on the brick face above its tile. */
  mount: 'floor' | 'wall';
  /** Occupies its tile as an obstacle (coffins, crates, posts). */
  solid?: boolean;
  /** Light radius, for candles. */
  glow?: number;
};

export const PROPS = {
  coffin:            { rect: { x: 87, y: 69, w: 18, h: 43 }, mount: 'floor', solid: true },
  coffin_cracked:    { rect: { x: 55, y: 69, w: 18, h: 43 }, mount: 'floor', solid: true },
  coffin_open:       { rect: { x: 87, y: 122, w: 18, h: 38 }, mount: 'floor', solid: true },
  sarcophagus:       { rect: { x: 5, y: 101, w: 37, h: 27 }, mount: 'floor', solid: true },
  sarcophagus2:      { rect: { x: 5, y: 197, w: 37, h: 27 }, mount: 'floor', solid: true },
  sarcophagus_open:  { rect: { x: 5, y: 69, w: 37, h: 27 }, mount: 'floor', solid: true },
  sarcophagus_open2: { rect: { x: 5, y: 165, w: 37, h: 27 }, mount: 'floor', solid: true },
  crate:             { rect: { x: 130, y: 75, w: 12, h: 21 }, mount: 'floor', solid: true },
  crate2:            { rect: { x: 170, y: 75, w: 12, h: 21 }, mount: 'floor', solid: true },
  crate_stack:       { rect: { x: 144, y: 71, w: 16, h: 41 }, mount: 'floor', solid: true },
  crate_stack2:      { rect: { x: 200, y: 71, w: 16, h: 41 }, mount: 'floor', solid: true },
  post:              { rect: { x: 1, y: 20, w: 13, h: 44 }, mount: 'floor', solid: true },
  post2:             { rect: { x: 65, y: 16, w: 13, h: 48 }, mount: 'floor', solid: true },
  urn:               { rect: { x: 144, y: 124, w: 16, h: 20 }, mount: 'floor' },
  urn_small:         { rect: { x: 162, y: 128, w: 12, h: 16 }, mount: 'floor' },
  urn_green:         { rect: { x: 144, y: 172, w: 16, h: 20 }, mount: 'floor' },
  urn_green_small:   { rect: { x: 162, y: 176, w: 12, h: 16 }, mount: 'floor' },
  urn_broken:        { rect: { x: 144, y: 147, w: 16, h: 13 }, mount: 'floor' },
  crate_broken:      { rect: { x: 130, y: 97, w: 12, h: 15 }, mount: 'floor' },
  candles:           { rect: { x: 178, y: 20, w: 13, h: 11 }, mount: 'floor', glow: 44 },
  candle:            { rect: { x: 162, y: 20, w: 10, h: 11 }, mount: 'floor', glow: 36 },
  cauldron:          { rect: { x: 81, y: 16, w: 14, h: 32 }, mount: 'wall' },
  cauldron_water:    { rect: { x: 97, y: 16, w: 14, h: 32 }, mount: 'wall' },
  shackles:          { rect: { x: 113, y: 16, w: 14, h: 22 }, mount: 'wall' },
  chain:             { rect: { x: 148, y: 16, w: 7, h: 30 }, mount: 'wall' },
} as const satisfies Record<string, PropDef>;

export type PropKind = keyof typeof PROPS;

export type PropPlacement = { kind: PropKind; tx: number; ty: number };

export const COFFINS: PropKind[] = ['coffin', 'coffin_cracked', 'coffin_open'];
export const SARCOPHAGI: PropKind[] = ['sarcophagus', 'sarcophagus2', 'sarcophagus_open', 'sarcophagus_open2'];
export const CRATES: PropKind[] = ['crate', 'crate2', 'crate_stack', 'crate_stack2'];
export const URNS: PropKind[] = ['urn', 'urn_small', 'urn_green', 'urn_green_small', 'urn_broken', 'crate_broken'];
export const POSTS: PropKind[] = ['post', 'post2'];
export const HANGINGS: PropKind[] = ['cauldron', 'cauldron_water', 'shackles', 'chain'];
