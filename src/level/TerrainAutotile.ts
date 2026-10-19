import type { Level } from './Level';
import { TileType, TILE_WIDTH, TILE_HEIGHT } from './TileType';

/** One textured quad: draw tileset rect (sx,sy,w,h) at world (dx,dy). */
export type TerrainPiece = { dx: number; dy: number; sx: number; sy: number; w: number; h: number };

// Terrain is autotiled on 16px sub-tiles (the tileset's native grid); walls are
// outlined with 8px quarter pieces. A wall mass renders as black void with a
// stone border wherever it meets floor, and a brick face on its south side —
// the way catacombs maps are built with mainlevbuild.png.
const SUB = 16;
const Q = 8;

// ── Tileset coordinates (mainlevbuild.png) ───────────────────────────────────
// Wall-top outline quarters (from the framed block at cols 4–15, rows 3–6)
const OUTER_TL = [64, 48] as const;
const OUTER_TR = [248, 48] as const;
const EDGE_TOP_L = [96, 48] as const;
const EDGE_TOP_R = [104, 48] as const;
const EDGE_LEFT = [[64, 80], [64, 88]] as const;    // [upper, lower] quarter
const EDGE_RIGHT = [[248, 80], [248, 88]] as const;

// South face: cap molding (row 7) over three brick rows (rows 8–10)
const FACE_CAP_Y = 112;
const FACE_BRICK_Y = [160, 144, 128]; // k=1 (lowest), k=2, k=3
const FACE_LEFT_X = 64;    // pillar strip on the left
const FACE_RIGHT_X = 240;  // pillar strip on the right
const FACE_MID_X = [80, 96, 112, 128];
const PILLAR_X = [144, 160];           // 32px column centred on the pair
const WINDOW_X = [272, 288, 304, 320, 336];
const WINDOW_Y = [240, 224, 208];      // arched-window bricks, k=1..3
const CRACKED_Y = [304, 288, 272];     // crumbling bricks for breakable walls
const BASE_Y = 176;                    // 8px plinth under the face, drawn on the floor

// Floors (32×32, each window sits on a fully opaque band)
// Main floor: teal cobble variants that share one hue, so they blend seamlessly.
const FLOOR_MAIN: Array<[number, number]> = [
  [832, 272], [880, 272], [832, 320], [880, 320], [832, 368], [880, 368],
];
// Low-frequency patches: mossy cobble, and rarer crumbled earth.
const FLOOR_PATCH: Array<[number, number]> = [[928, 272], [976, 272], [928, 320], [976, 320]];
const FLOOR_ROUGH: Array<[number, number]> = [[304, 336], [336, 336], [304, 400], [336, 400]];
const FLOOR_SAFE: Array<[number, number]> = [[832, 208]];
const FLOOR_GRATE: [number, number] = [496, 288];

// Pit interior: dark bricks just under the floor lip, black below
const PIT_WALL: Array<[number, number]> = [[384, 208], [384, 224]];

/** Every Nth tile column of a full-height face gets a stone pillar. */
export const PILLAR_EVERY = 6;
export const PILLAR_PHASE = 3;

function hash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Smooth value noise in [0,1) for floor patches. */
function noise(x: number, y: number, scale: number): number {
  const fx = x / scale, fy = y / scale;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const r = (a: number, b: number) => (hash(a, b) & 0xffff) / 0x10000;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const top = r(x0, y0) + (r(x0 + 1, y0) - r(x0, y0)) * sx;
  const bot = r(x0, y0 + 1) + (r(x0 + 1, y0 + 1) - r(x0, y0 + 1)) * sx;
  return top + (bot - top) * sy;
}

export function buildTerrainPieces(level: Level): TerrainPiece[] {
  const W = level.width * 2;
  const H = level.height * 2;

  const tileAt = (sx: number, sy: number) =>
    sx < 0 || sy < 0 || sx >= W || sy >= H ? null : level.getTile(sx >> 1, sy >> 1);
  const solid = (sx: number, sy: number) => {
    const t = tileAt(sx, sy);
    return !t || t.type === TileType.Wall || t.type === TileType.BreakableWall;
  };
  const hole = (sx: number, sy: number) => tileAt(sx, sy)?.type === TileType.Hole;

  // ── Faces: up to 4 solid sub-tiles directly above an open one ──────────────
  const faceK = new Int8Array(W * H);
  const faceH = new Int8Array(W * H);
  for (let sx = 0; sx < W; sx++) {
    for (let sy = 1; sy < H; sy++) {
      if (solid(sx, sy) || !solid(sx, sy - 1)) continue;
      let t = 0;
      while (t < 4 && solid(sx, sy - 1 - t)) t++;
      for (let k = 1; k <= t; k++) {
        const y = sy - k;
        if (y < 0) break;
        faceK[sx + y * W] = k;
        faceH[sx + y * W] = t;
      }
    }
  }
  const isFace = (sx: number, sy: number) =>
    sx >= 0 && sy >= 0 && sx < W && sy < H && faceK[sx + sy * W] > 0;

  /** Column style of the face whose lowest sub-tile is at (sx, sy). */
  type FaceStyle = 'left' | 'right' | 'mid' | 'pillarL' | 'pillarR' | 'window' | 'cracked';
  const faceStyle = (sx: number, sy: number): FaceStyle => {
    const i = sx + sy * W;
    const h = faceH[i];
    const k = faceK[i];
    const bottom = sy + k - 1;
    if (!solid(sx - 1, sy)) return 'left';
    if (!solid(sx + 1, sy)) return 'right';
    if (tileAt(sx, sy)?.type === TileType.BreakableWall) return 'cracked';
    const tx = sx >> 1;
    if (h === 4 && tx % PILLAR_EVERY === PILLAR_PHASE) {
      // A pillar needs both halves of the tile to be plain full-height face.
      const lx = tx * 2, rx = lx + 1;
      const ok = [lx, rx].every((x) => isFace(x, bottom) && faceH[x + bottom * W] === 4
        && solid(x - 1, bottom) && solid(x + 1, bottom));
      if (ok) return sx === lx ? 'pillarL' : 'pillarR';
    }
    if (h === 4 && hash(tx, bottom) % 9 === 0) return 'window';
    return 'mid';
  };

  const floorPieces: TerrainPiece[] = [];
  const wallPieces: TerrainPiece[] = [];
  const overlayPieces: TerrainPiece[] = [];
  const quad = (out: TerrainPiece[], dx: number, dy: number, s: readonly [number, number], w: number, h: number) =>
    out.push({ dx, dy, sx: s[0], sy: s[1], w, h });

  // ── Floors (per 32px game tile) ────────────────────────────────────────────
  for (let ty = 0; ty < level.height; ty++) {
    for (let tx = 0; tx < level.width; tx++) {
      const t = level.getTile(tx, ty);
      if (!t || t.type !== TileType.Floor) continue;
      const v = hash(tx, ty);
      let src: [number, number];
      if (level.isSafeZone(tx, ty)) {
        src = FLOOR_SAFE[v % FLOOR_SAFE.length];
      } else {
        const n = noise(tx, ty, 6);
        if (v % 53 === 0) src = FLOOR_GRATE;
        else if (n > 0.82) src = FLOOR_ROUGH[v % FLOOR_ROUGH.length];
        else if (n > 0.64) src = FLOOR_PATCH[v % FLOOR_PATCH.length];
        else src = FLOOR_MAIN[v % FLOOR_MAIN.length];
      }
      quad(floorPieces, tx * TILE_WIDTH, ty * TILE_HEIGHT, src, TILE_WIDTH, TILE_HEIGHT);
    }
  }

  // ── Walls, pits and plinths (per 16px sub-tile) ────────────────────────────
  for (let sy = 0; sy < H; sy++) {
    for (let sx = 0; sx < W; sx++) {
      const dx = sx * SUB;
      const dy = sy * SUB;

      if (!solid(sx, sy)) {
        // Plinth along the foot of a face, laid over the floor
        if (!hole(sx, sy) && isFace(sx, sy - 1) && faceK[sx + (sy - 1) * W] === 1) {
          const style = faceStyle(sx, sy - 1);
          const bx = style === 'left' ? FACE_LEFT_X : style === 'right' ? FACE_RIGHT_X
            : style === 'pillarL' ? PILLAR_X[0] : style === 'pillarR' ? PILLAR_X[1] : FACE_MID_X[1];
          quad(overlayPieces, dx, dy, [bx, BASE_Y], SUB, Q);
        }
        // Pit: dark brick lip under open floor, then black
        if (hole(sx, sy)) {
          if (!solid(sx, sy - 1) && !hole(sx, sy - 1)) quad(wallPieces, dx, dy, PIT_WALL[0], SUB, SUB);
          else if (hole(sx, sy - 1) && !solid(sx, sy - 2) && !hole(sx, sy - 2)) quad(wallPieces, dx, dy, PIT_WALL[1], SUB, SUB);
        }
        continue;
      }

      const i = sx + sy * W;
      if (faceK[i] > 0) {
        const k = faceK[i];
        const h = faceH[i];
        const style = faceStyle(sx, sy);
        const cap = k === h;
        let src: [number, number];
        switch (style) {
          case 'left': src = [FACE_LEFT_X, cap ? FACE_CAP_Y : FACE_BRICK_Y[k - 1]]; break;
          case 'right': src = [FACE_RIGHT_X, cap ? FACE_CAP_Y : FACE_BRICK_Y[k - 1]]; break;
          case 'pillarL': src = [PILLAR_X[0], cap ? FACE_CAP_Y : FACE_BRICK_Y[k - 1]]; break;
          case 'pillarR': src = [PILLAR_X[1], cap ? FACE_CAP_Y : FACE_BRICK_Y[k - 1]]; break;
          case 'window':
            src = cap ? [FACE_MID_X[sx % 4], FACE_CAP_Y] : [WINDOW_X[(sx >> 1) % WINDOW_X.length], WINDOW_Y[k - 1]];
            break;
          case 'cracked':
            src = cap ? [FACE_MID_X[sx % 4], FACE_CAP_Y] : [272 + (sx % 8) * 16, CRACKED_Y[k - 1]];
            break;
          default:
            src = [FACE_MID_X[sx % 4], cap ? FACE_CAP_Y : FACE_BRICK_Y[k - 1]];
        }
        quad(wallPieces, dx, dy, src, SUB, SUB);
        continue;
      }

      // Wall top: void with a stone outline toward open floor (or a face beside it)
      const openN = !solid(sx, sy - 1);
      const sideW = !solid(sx - 1, sy) || isFace(sx - 1, sy);
      const sideE = !solid(sx + 1, sy) || isFace(sx + 1, sy);
      const diagNW = !solid(sx - 1, sy - 1);
      const diagNE = !solid(sx + 1, sy - 1);

      // upper-left quarter
      if (sideW && openN) quad(wallPieces, dx, dy, OUTER_TL, Q, Q);
      else if (sideW) quad(wallPieces, dx, dy, EDGE_LEFT[0], Q, Q);
      else if (openN) quad(wallPieces, dx, dy, EDGE_TOP_L, Q, Q);
      else if (diagNW) quad(wallPieces, dx, dy, EDGE_LEFT[0], Q, Q);
      // upper-right quarter
      if (sideE && openN) quad(wallPieces, dx + Q, dy, OUTER_TR, Q, Q);
      else if (sideE) quad(wallPieces, dx + Q, dy, EDGE_RIGHT[0], Q, Q);
      else if (openN) quad(wallPieces, dx + Q, dy, EDGE_TOP_R, Q, Q);
      else if (diagNE) quad(wallPieces, dx + Q, dy, EDGE_RIGHT[0], Q, Q);
      // lower quarters (south is never open here — that would make this a face)
      if (sideW) quad(wallPieces, dx, dy + Q, EDGE_LEFT[1], Q, Q);
      if (sideE) quad(wallPieces, dx + Q, dy + Q, EDGE_RIGHT[1], Q, Q);
    }
  }

  return [...floorPieces, ...wallPieces, ...overlayPieces];
}

/** World-space tile columns where a full-height face shows a pillar (no torch there). */
export function isPillarColumn(tx: number): boolean {
  return tx % PILLAR_EVERY === PILLAR_PHASE;
}
