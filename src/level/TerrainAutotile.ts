import type { Level } from './Level';
import { TileType, TILE_WIDTH, TILE_HEIGHT } from './TileType';

/**
 * One textured quad: draw tileset rect (sx,sy,w,h) at world (dx,dy). Pieces with
 * a `z` are drawn among the entities at that depth (walls characters can stand
 * behind, arch lintels); the rest lie flat beneath everything.
 */
export type TerrainPiece = { dx: number; dy: number; sx: number; sy: number; w: number; h: number; z?: number };

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
// Tomb niche face: bones in dark recesses (rows 12–15), 4 sub-tiles wide
const NICHE_X = [80, 176];
const NICHE_CAP_Y = 192;
const NICHE_Y = [240, 224, 208];

// Arch lintel (cols 19–23, rows 1–2): angled ends with short legs, stretchable bar
const LINTEL_LEFT = [304, 16] as const;
const LINTEL_RIGHT = [368, 16] as const;
const LINTEL_MID_X = [320, 336, 352];
const LINTEL_Y = 16;
const LINTEL_END_H = 24;
const LINTEL_BAR_H = 16;
/** Lintels sit this far above the row they span, so their legs rest on it. */
const LINTEL_LIFT = 8;
const ARCH_MIN = 2;
const ARCH_MAX = 8;
/** Arch lintels are overhead: drawn above every character (the fog of war still covers them). */
export const OVERHEAD_Z = 1e6;

// Framed 2×2 pit (cols 38–43, rows 16–21): 64px hole with a 5px rim outside it
const PIT = { x: 619, y: 267, w: 74, h: 74, rim: 5 };

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

// Pit interior for holes that aren't part of a framed 2×2 pit
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

  /** Depth of a wall sub-tile whose tile has walkable floor directly north (drawn over characters there). */
  const occluderZ = (sx: number, sy: number): number | undefined => {
    const tx = sx >> 1, ty = sy >> 1;
    if (!level.getTile(tx, ty - 1)?.passable) return undefined;
    return (ty + 1) * TILE_HEIGHT;
  };

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

  type FaceStyle = 'left' | 'right' | 'mid' | 'pillarL' | 'pillarR' | 'window' | 'cracked' | 'niche';
  const faceStyle = (sx: number, sy: number): FaceStyle => {
    const i = sx + sy * W;
    const h = faceH[i];
    const k = faceK[i];
    const bottom = sy + k - 1;
    if (!solid(sx - 1, sy)) return 'left';
    if (!solid(sx + 1, sy)) return 'right';
    if (tileAt(sx, sy)?.type === TileType.BreakableWall) return 'cracked';
    const tx = sx >> 1;
    if (h === 4 && level.wallDecor.get(tx + (bottom >> 1) * level.width)?.startsWith('niche')) return 'niche';
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
  const quad = (out: TerrainPiece[], dx: number, dy: number, s: readonly [number, number], w: number, h: number, z?: number) =>
    out.push(z === undefined ? { dx, dy, sx: s[0], sy: s[1], w, h } : { dx, dy, sx: s[0], sy: s[1], w, h, z });

  // ── Floors (per 32px game tile; obstacles stand on floor) ──────────────────
  for (let ty = 0; ty < level.height; ty++) {
    for (let tx = 0; tx < level.width; tx++) {
      const t = level.getTile(tx, ty);
      if (!t || (t.type !== TileType.Floor && t.type !== TileType.Obstacle)) continue;
      const v = hash(tx, ty);
      let src: [number, number];
      if (level.isSafeZone(tx, ty)) {
        src = FLOOR_SAFE[v % FLOOR_SAFE.length];
      } else {
        const n = noise(tx, ty, 6);
        if (v % 53 === 0 && t.type === TileType.Floor) src = FLOOR_GRATE;
        else if (n > 0.82) src = FLOOR_ROUGH[v % FLOOR_ROUGH.length];
        else if (n > 0.64) src = FLOOR_PATCH[v % FLOOR_PATCH.length];
        else src = FLOOR_MAIN[v % FLOOR_MAIN.length];
      }
      quad(floorPieces, tx * TILE_WIDTH, ty * TILE_HEIGHT, src, TILE_WIDTH, TILE_HEIGHT);
    }
  }

  // ── Framed pits (2×2 holes) — rims spill onto the surrounding floor ────────
  const framed = new Set<number>();
  for (const p of level.pits) {
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) framed.add(p.x * 2 + dx + (p.y * 2 + dy) * W);
    overlayPieces.push({
      dx: p.x * TILE_WIDTH - PIT.rim, dy: p.y * TILE_HEIGHT - PIT.rim,
      sx: PIT.x, sy: PIT.y, w: PIT.w, h: PIT.h,
    });
  }

  // ── Walls, loose holes and plinths (per 16px sub-tile) ─────────────────────
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
        // A hole outside a framed pit: dark brick lip under open floor, then black
        if (hole(sx, sy) && !framed.has(sx + sy * W)) {
          if (!solid(sx, sy - 1) && !hole(sx, sy - 1)) quad(wallPieces, dx, dy, PIT_WALL[0], SUB, SUB);
          else if (hole(sx, sy - 1) && !solid(sx, sy - 2) && !hole(sx, sy - 2)) quad(wallPieces, dx, dy, PIT_WALL[1], SUB, SUB);
        }
        continue;
      }

      const z = occluderZ(sx, sy);
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
          case 'niche': {
            const wallRow = (sy + k - 1) >> 1;
            const decor = level.wallDecor.get((sx >> 1) + wallRow * level.width);
            const right = decor === 'niche1';
            const col = (right ? 2 : 0) + (sx & 1);
            // Both tiles of a niche pick the same art, keyed by the segment's left tile.
            const base = NICHE_X[hash((sx >> 1) - (right ? 1 : 0), wallRow) % NICHE_X.length];
            src = [base + col * SUB, cap ? NICHE_CAP_Y : NICHE_Y[k - 1]];
            break;
          }
          case 'window':
            src = cap ? [FACE_MID_X[sx % 4], FACE_CAP_Y] : [WINDOW_X[(sx >> 1) % WINDOW_X.length], WINDOW_Y[k - 1]];
            break;
          case 'cracked':
            src = cap ? [FACE_MID_X[sx % 4], FACE_CAP_Y] : [272 + (sx % 8) * 16, CRACKED_Y[k - 1]];
            break;
          default:
            src = [FACE_MID_X[sx % 4], cap ? FACE_CAP_Y : FACE_BRICK_Y[k - 1]];
        }
        quad(wallPieces, dx, dy, src, SUB, SUB, z);
        continue;
      }

      // Wall top: void with a stone outline toward open floor (or a face beside it)
      const openN = !solid(sx, sy - 1);
      const sideW = !solid(sx - 1, sy) || isFace(sx - 1, sy);
      const sideE = !solid(sx + 1, sy) || isFace(sx + 1, sy);
      const diagNW = !solid(sx - 1, sy - 1);
      const diagNE = !solid(sx + 1, sy - 1);

      // upper-left quarter
      if (sideW && openN) quad(wallPieces, dx, dy, OUTER_TL, Q, Q, z);
      else if (sideW) quad(wallPieces, dx, dy, EDGE_LEFT[0], Q, Q, z);
      else if (openN) quad(wallPieces, dx, dy, EDGE_TOP_L, Q, Q, z);
      else if (diagNW) quad(wallPieces, dx, dy, EDGE_LEFT[0], Q, Q, z);
      // upper-right quarter
      if (sideE && openN) quad(wallPieces, dx + Q, dy, OUTER_TR, Q, Q, z);
      else if (sideE) quad(wallPieces, dx + Q, dy, EDGE_RIGHT[0], Q, Q, z);
      else if (openN) quad(wallPieces, dx + Q, dy, EDGE_TOP_R, Q, Q, z);
      else if (diagNE) quad(wallPieces, dx + Q, dy, EDGE_RIGHT[0], Q, Q, z);
      // lower quarters (south is never open here — that would make this a face)
      if (sideW) quad(wallPieces, dx, dy + Q, EDGE_LEFT[1], Q, Q, z);
      if (sideE) quad(wallPieces, dx + Q, dy + Q, EDGE_RIGHT[1], Q, Q, z);
      // The void itself must also cover anyone standing behind this wall row.
      if (z !== undefined) overlayPieces.push({ dx, dy, sx: VOID[0], sy: VOID[1], w: SUB, h: SUB, z: z - 0.5 });
    }
  }

  // ── Arches over openings: corridors through a south face, or out of a room's bottom wall ──
  const lintel = (x0: number, x1: number, sy: number, z: number) => {
    const y = sy * SUB - LINTEL_LIFT;
    quad(overlayPieces, x0 * SUB, y, LINTEL_LEFT, SUB, LINTEL_END_H, z);
    for (let x = x0 + 1; x < x1; x++) {
      quad(overlayPieces, x * SUB, y, [LINTEL_MID_X[(x - x0 - 1) % LINTEL_MID_X.length], LINTEL_Y], SUB, LINTEL_BAR_H, z);
    }
    quad(overlayPieces, x1 * SUB, y, LINTEL_RIGHT, SUB, LINTEL_END_H, z);
  };
  for (let sy = 0; sy < H; sy++) {
    for (let sx = 0; sx < W - 2; sx++) {
      if (!solid(sx, sy) || solid(sx + 1, sy)) continue;
      let n = 0;
      while (sx + 1 + n < W && !solid(sx + 1 + n, sy)) n++;
      const ex = sx + 1 + n;
      if (n < ARCH_MIN || n > ARCH_MAX || !solid(ex, sy)) continue;
      const a = sx + sy * W, b = ex + sy * W;
      // Opening in a south face, at the cap row of both sides
      const capRow = faceK[a] > 0 && faceK[a] === faceH[a] && faceK[b] === faceH[b] && faceH[a] === faceH[b] && faceH[a] === 4;
      // Opening in a wall mass's top edge (room floor directly above both sides)
      const topRow = faceK[a] === 0 && faceK[b] === 0 && !solid(sx, sy - 1) && !solid(ex, sy - 1)
        && !solid(sx + 1, sy - 1) && !solid(sx + n, sy - 1);
      if (!capRow && !topRow) continue;
      // Only openings that lead on (a corridor), not a notch.
      if (capRow && solid(sx + 1, sy - 1)) continue;
      if (topRow && solid(sx + 1, sy + 1)) continue;
      lintel(sx, ex, sy, OVERHEAD_Z);
    }
  }

  return [...floorPieces, ...wallPieces, ...overlayPieces];
}

/** A sub-tile of plain black wall-top void (inside the framed block at col 6, row 5). */
const VOID = [96, 80] as const;

/** World-space tile columns where a full-height face shows a pillar (no torch there). */
export function isPillarColumn(tx: number): boolean {
  return tx % PILLAR_EVERY === PILLAR_PHASE;
}
