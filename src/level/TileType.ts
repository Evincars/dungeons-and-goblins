export const enum TileType {
  Floor         = 0,
  Wall          = 1,
  BreakableWall = 2,
  Hole          = 3,
  /** Floor occupied by a solid prop (coffin, crate, post…): blocks movement, drawn as floor. */
  Obstacle      = 4,
}

/** Tiles the fog of war lifts around each player: also how far enemies see. */
export const FOG_REVEAL_TILES = 5;

export const TILE_WIDTH  = 32;
export const TILE_HEIGHT = 32;

export type TileData = {
  type: TileType;
  solid: boolean;
  passable: boolean;
  buildable: boolean;
  castsShadow: boolean;
  imageVariant: number;
  destroyable?: boolean;
  shadowedNorth: boolean;
  shadowedEast: boolean;
  shadowedWest: boolean;
  shadowedNorthEast: boolean;
  shadowedNorthWest: boolean;
};

export function createTile(type: TileType, imageVariant = 0): TileData {
  const base: TileData = {
    type,
    solid: false,
    passable: true,
    buildable: false,
    castsShadow: false,
    imageVariant,
    shadowedNorth: false,
    shadowedEast: false,
    shadowedWest: false,
    shadowedNorthEast: false,
    shadowedNorthWest: false,
  };

  switch (type) {
    case TileType.Floor:
      return { ...base, buildable: true };
    case TileType.Wall:
      return { ...base, solid: true, passable: false, castsShadow: true };
    case TileType.BreakableWall:
      return { ...base, solid: true, passable: false, castsShadow: true, destroyable: true };
    case TileType.Hole:
      return { ...base };
    case TileType.Obstacle:
      return { ...base, solid: true, passable: false };
    default:
      return base;
  }
}
