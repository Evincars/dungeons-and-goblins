/**
 * Procedural sprite/texture generation using Canvas 2D.
 * All art is created at runtime — no external PNG files needed for characters or tiles.
 */

function mkCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function hex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

// ── Pixel art helpers ──────────────────────────────────────────────────────

function px(ctx: CanvasRenderingContext2D, x: number, y: number, col: number, s = 1): void {
  ctx.fillStyle = hex(col);
  ctx.fillRect(x * s, y * s, s, s);
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: number, s = 1): void {
  ctx.fillStyle = hex(col);
  ctx.fillRect(x * s, y * s, w * s, h * s);
}

// Noise helper for tile variation
function noise(seed: number): number {
  let x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

// ── DUNGEON FLOOR TILES ────────────────────────────────────────────────────
// 32x32 per frame, 4 variants side by side → 128x32

export function genFloorTiles(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(128, 32);
  const BASE = 0x3d3530;
  const GROUT = 0x2a2420;
  const STONE_LIGHT = 0x4a413c;
  const STONE_DARK = 0x332d29;
  const CRACK = 0x1e1a17;

  for (let v = 0; v < 4; v++) {
    const ox = v * 32;
    // Base fill
    rect(ctx, ox, 0, 32, 32, BASE);

    // Stone slabs — each variant has a slightly different layout
    const layouts = [
      [[0,0,16,14],[16,0,16,14],[0,14,12,18],[12,14,20,18]],
      [[0,0,20,16],[20,0,12,16],[0,16,32,16]],
      [[0,0,32,14],[0,14,14,18],[14,14,18,18]],
      [[0,0,12,16],[12,0,20,16],[0,16,18,16],[18,16,14,16]],
    ];
    const slabs = layouts[v];

    for (let i = 0; i < slabs.length; i++) {
      const [sx, sy, sw, sh] = slabs[i];
      const seed = v * 10 + i;
      const tone = noise(seed) > 0.5 ? STONE_LIGHT : STONE_DARK;
      for (let py2 = 0; py2 < sh; py2++) {
        for (let px2 = 0; px2 < sw; px2++) {
          const n = noise(seed * 7 + px2 * 3 + py2 * 17);
          const col = n < 0.15 ? STONE_DARK : n > 0.85 ? STONE_LIGHT : tone;
          ctx.fillStyle = hex(col);
          ctx.fillRect((ox + sx + px2), (sy + py2), 1, 1);
        }
      }
      // Grout lines on right/bottom edge of each slab
      ctx.fillStyle = hex(GROUT);
      ctx.fillRect(ox + sx + sw - 1, sy, 1, sh);
      ctx.fillRect(ox + sx, sy + sh - 1, sw, 1);
    }

    // Occasional crack for variation
    if (v === 1 || v === 3) {
      ctx.fillStyle = hex(CRACK);
      const cx2 = ox + 8 + v * 4;
      const cy2 = 8 + v * 2;
      ctx.fillRect(cx2, cy2, 1, 6);
      ctx.fillRect(cx2 + 1, cy2 + 3, 1, 4);
    }
  }
  return c;
}

// ── DUNGEON WALL TILES ─────────────────────────────────────────────────────
// 32x56 per variant (wall extends 24px above tile base), 4 variants → 128x56

export function genWallTiles(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(128, 56);
  const TOP_DARK = 0x1a1412;
  const STONE1 = 0x3c3530;
  const STONE2 = 0x453e38;
  const STONE3 = 0x2e2a26;
  const MORTAR = 0x201c1a;
  const SHADOW = 0x100e0c;

  for (let v = 0; v < 4; v++) {
    const ox = v * 32;

    // Very dark top cap (ceiling shadow)
    rect(ctx, ox, 0, 32, 8, TOP_DARK);

    // Brick rows: wall face starts at y=8, each brick row 12px tall
    const brickRows = [
      { y: 8,  offsets: [0, 16] },
      { y: 20, offsets: [8, 24] },
      { y: 32, offsets: [0, 16] },
      { y: 44, offsets: [8, 24] },
    ];

    for (const row of brickRows) {
      for (const bx of row.offsets) {
        const bw = 16;
        const bh = 12;
        const seed = v * 100 + row.y + bx;
        // Fill brick with stony texture
        for (let py2 = 1; py2 < bh - 1; py2++) {
          for (let px2 = 1; px2 < bw - 1; px2++) {
            const n = noise(seed + px2 * 5 + py2 * 11);
            const col = n < 0.2 ? STONE3 : n > 0.8 ? STONE2 : STONE1;
            ctx.fillStyle = hex(col);
            ctx.fillRect(ox + bx + px2, row.y + py2, 1, 1);
          }
        }
        // Mortar lines
        ctx.fillStyle = hex(MORTAR);
        ctx.fillRect(ox + bx, row.y, bw, 1);
        ctx.fillRect(ox + bx, row.y, 1, bh);
        // Inner shadow on top-left
        ctx.fillStyle = hex(SHADOW);
        ctx.fillRect(ox + bx + 1, row.y + 1, bw - 2, 1);
        ctx.fillRect(ox + bx + 1, row.y + 1, 1, bh - 2);
      }
    }

    // Bottom shadow (wall base blending into floor)
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(ox, 48, 32, 8);
  }
  return c;
}

// ── BREAKABLE WALL TILES ───────────────────────────────────────────────────

export function genBreakableWallTiles(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(64, 56); // 2 variants
  const STONE1 = 0x3c3530;
  const STONE2 = 0x453e38;
  const STONE3 = 0x2e2a26;
  const MORTAR = 0x201c1a;
  const CRACK = 0x120e0c;
  const TOP_DARK = 0x1a1412;

  for (let v = 0; v < 2; v++) {
    const ox = v * 32;
    rect(ctx, ox, 0, 32, 8, TOP_DARK);

    // Same brick layout but with cracks
    const brickRows = [
      { y: 8,  offsets: [0, 16] },
      { y: 20, offsets: [8, 24] },
      { y: 32, offsets: [0, 16] },
      { y: 44, offsets: [8, 24] },
    ];
    for (const row of brickRows) {
      for (const bx of row.offsets) {
        const bw = 16; const bh = 12;
        const seed = v * 100 + row.y + bx + 50;
        for (let py2 = 1; py2 < bh - 1; py2++) {
          for (let px2 = 1; px2 < bw - 1; px2++) {
            const n = noise(seed + px2 * 5 + py2 * 11);
            const col = n < 0.2 ? STONE3 : n > 0.8 ? STONE2 : STONE1;
            ctx.fillStyle = hex(col);
            ctx.fillRect(ox + bx + px2, row.y + py2, 1, 1);
          }
        }
        ctx.fillStyle = hex(MORTAR);
        ctx.fillRect(ox + bx, row.y, bw, 1);
        ctx.fillRect(ox + bx, row.y, 1, bh);
      }
    }
    // Cracks overlay
    ctx.strokeStyle = hex(CRACK);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox + 8, 10); ctx.lineTo(ox + 12, 18); ctx.lineTo(ox + 10, 24);
    ctx.moveTo(ox + 20, 22); ctx.lineTo(ox + 25, 30); ctx.lineTo(ox + 23, 40);
    ctx.stroke();

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(ox, 48, 32, 8);
  }
  return c;
}

// ── FIGHTER (PLAYER) SPRITE SHEET ─────────────────────────────────────────
// 32x32 per frame, 4 walk cols × 8 direction rows → 128x256

export function genFighterSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(128, 256);

  // 8 direction rows (same as Catacomb original): 0=N,1=NE,2=E,3=SE,4=S,5=SW,6=W,7=NW
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 4; col++) {
      drawFighter(ctx, col * 32, row * 32, row, col);
    }
  }
  return c;
}

function drawFighter(ctx: CanvasRenderingContext2D, ox: number, oy: number, facing: number, frame: number): void {
  // Catacomb-style bold palette — strong contrast, clear silhouette
  const OUTLINE     = 0x080810;
  const ARMOR_D     = 0x183050;
  const ARMOR_M     = 0x2050a0;
  const ARMOR_L     = 0x4080d0;
  const ARMOR_HL    = 0x80c0ff;
  const CHAIN_D     = 0x282428;
  const CHAIN_M     = 0x504850;
  const CHAIN_L     = 0x706870;
  const SKIN        = 0xe8b882;
  const BELT        = 0x9a6820;
  const BUCKLE      = 0xf0c840;
  const VISOR       = 0x081828;
  const VISOR_GLOW  = 0x183860;
  const SWORD_BL    = 0xe0e8f8;
  const SWORD_HL    = 0xffffff;
  const SWORD_GOLD  = 0xf0b830;
  const CAPE_L      = 0xc83030;
  const CAPE_D      = 0x781010;
  const BOOT        = 0x382818;
  const BOOT_L      = 0x504030;

  // Walk bob: frame 0/2 = neutral, frame 1/3 = step
  const step = (frame === 1 || frame === 3);
  const bob  = step ? 1 : 0;
  // Body shift for walk cycle
  const bodyY = oy + bob;

  const facingS = (facing === 4 || facing === 3 || facing === 5);
  const facingN = (facing === 0 || facing === 1 || facing === 7);
  const facingE = (facing === 2 || facing === 3 || facing === 1);
  const facingW = (facing === 6 || facing === 5 || facing === 7);

  // Ground shadow (always)
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(ox + 16, oy + 30, 8, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  if (facingS || (!facingN && !facingW)) {
    // ═══ SOUTH / FRONT VIEW ══════════════════════════════════════════════════

    // Legs (walk: alternate step up/down)
    const lL = step ? 2 : 0;   // left leg step offset
    const lR = step ? 0 : 2;   // right leg step offset
    // Left leg
    rect(ctx, ox + 10, bodyY + 21 + lL, 5, 8 - lL, CHAIN_M);
    rect(ctx, ox + 11, bodyY + 21 + lL, 2, 8 - lL, CHAIN_L);
    rect(ctx, ox +  8, bodyY + 27 + lL, 7, 3, BOOT);        // boot
    rect(ctx, ox +  8, bodyY + 27 + lL, 7, 1, BOOT_L);
    // Right leg
    rect(ctx, ox + 17, bodyY + 21 + lR, 5, 8 - lR, CHAIN_D);
    rect(ctx, ox + 18, bodyY + 21 + lR, 2, 8 - lR, CHAIN_M);
    rect(ctx, ox + 17, bodyY + 27 + lR, 7, 3, BOOT);
    rect(ctx, ox + 17, bodyY + 27 + lR, 7, 1, BOOT_L);

    // Cape (behind torso)
    rect(ctx, ox + 8,  bodyY + 14, 4, 10, CAPE_D);
    rect(ctx, ox + 20, bodyY + 14, 4, 10, CAPE_D);
    rect(ctx, ox + 9,  bodyY + 14, 3, 8,  CAPE_L);
    rect(ctx, ox + 20, bodyY + 14, 3, 8,  CAPE_L);

    // Arms / pauldrons
    rect(ctx, ox + 7,  bodyY + 14, 3, 7, CHAIN_M);
    rect(ctx, ox + 22, bodyY + 14, 3, 7, CHAIN_M);
    rect(ctx, ox + 8,  bodyY + 14, 2, 2, ARMOR_M);   // shoulder cap L
    rect(ctx, ox + 22, bodyY + 14, 2, 2, ARMOR_M);   // shoulder cap R

    // Torso (plate) — outline first
    rect(ctx, ox + 9,  bodyY + 13, 14, 9, OUTLINE);  // outline
    rect(ctx, ox + 10, bodyY + 14, 12, 7, ARMOR_D);
    rect(ctx, ox + 11, bodyY + 14, 10, 7, ARMOR_M);
    rect(ctx, ox + 12, bodyY + 14, 5,  7, ARMOR_L);  // highlight band
    rect(ctx, ox + 12, bodyY + 14, 2,  7, ARMOR_HL); // bright specular
    // Chest center line
    rect(ctx, ox + 15, bodyY + 15, 1, 5, ARMOR_D);

    // Belt
    rect(ctx, ox + 9,  bodyY + 21, 14, 3, BELT);
    rect(ctx, ox + 14, bodyY + 21, 4, 3, BUCKLE);    // buckle
    rect(ctx, ox + 15, bodyY + 22, 2, 1, ARMOR_HL);

    // Helmet — outline
    rect(ctx, ox + 10, bodyY + 3,  12, 11, OUTLINE);
    rect(ctx, ox + 11, bodyY + 2,  10, 11, OUTLINE);
    rect(ctx, ox + 11, bodyY + 3,  10, 11, ARMOR_D);
    rect(ctx, ox + 12, bodyY + 2,  8,  11, ARMOR_M);
    // Crown highlight
    rect(ctx, ox + 13, bodyY + 2,  5, 3, ARMOR_L);
    rect(ctx, ox + 14, bodyY + 2,  3, 2, ARMOR_HL);
    // Nasal guard
    rect(ctx, ox + 15, bodyY + 6,  2, 5, ARMOR_D);
    // Visor slit
    rect(ctx, ox + 11, bodyY + 8,  10, 5, VISOR);
    rect(ctx, ox + 12, bodyY + 9,  8,  2, VISOR_GLOW);
    // Cheek
    rect(ctx, ox + 11, bodyY + 12, 10, 2, SKIN);
    // Ear guard
    rect(ctx, ox +  9, bodyY + 8,  2, 5, ARMOR_M);
    rect(ctx, ox + 21, bodyY + 8,  2, 5, ARMOR_M);

    // Sword (raised when step)
    const sy = step ? 3 : 5;
    rect(ctx, ox + 24, bodyY + sy,      2, 12, SWORD_BL);
    rect(ctx, ox + 24, bodyY + sy,      1, 12, SWORD_HL);
    rect(ctx, ox + 22, bodyY + sy + 6,  6,  2, SWORD_GOLD);  // crossguard
    rect(ctx, ox + 24, bodyY + sy - 1,  2,  3, SWORD_GOLD);  // pommel
    // Arm holding sword
    rect(ctx, ox + 23, bodyY + 15,      3,  6, CHAIN_M);

  } else if (facingN) {
    // ═══ NORTH / BACK VIEW ═══════════════════════════════════════════════════

    // Legs
    const lL = step ? 2 : 0;
    const lR = step ? 0 : 2;
    rect(ctx, ox + 10, bodyY + 21 + lL, 5, 8 - lL, CHAIN_D);
    rect(ctx, ox +  8, bodyY + 27 + lL, 7, 3, BOOT);
    rect(ctx, ox + 17, bodyY + 21 + lR, 5, 8 - lR, CHAIN_M);
    rect(ctx, ox + 17, bodyY + 27 + lR, 7, 3, BOOT);

    // Cape (full back)
    rect(ctx, ox + 9,  bodyY + 13, 14, 12, CAPE_L);
    rect(ctx, ox + 10, bodyY + 14, 12, 10, CAPE_D);
    // Cape highlight stripe
    rect(ctx, ox + 10, bodyY + 14, 2, 8, CAPE_L);

    // Arms
    rect(ctx, ox + 7,  bodyY + 14, 3, 7, CHAIN_M);
    rect(ctx, ox + 22, bodyY + 14, 3, 7, CHAIN_M);

    // Back plate
    rect(ctx, ox + 9,  bodyY + 13, 14, 9, OUTLINE);
    rect(ctx, ox + 10, bodyY + 14, 12, 7, ARMOR_D);
    rect(ctx, ox + 21, bodyY + 14, 2,  7, ARMOR_M);  // spine side
    rect(ctx, ox + 10, bodyY + 14, 2,  7, ARMOR_M);

    // Belt
    rect(ctx, ox + 9, bodyY + 21, 14, 3, BELT);

    // Back of helmet
    rect(ctx, ox + 10, bodyY + 3,  12, 11, OUTLINE);
    rect(ctx, ox + 11, bodyY + 3,  10, 11, ARMOR_D);
    rect(ctx, ox + 12, bodyY + 2,  8,  11, ARMOR_M);
    rect(ctx, ox + 13, bodyY + 2,  5,   3, ARMOR_L);
    rect(ctx, ox + 14, bodyY + 2,  3,   2, ARMOR_HL);
    rect(ctx, ox +  9, bodyY + 8,  2,   5, ARMOR_M);
    rect(ctx, ox + 21, bodyY + 8,  2,   5, ARMOR_M);

    // Sword poking up behind
    rect(ctx, ox + 23, bodyY + 2, 2, 14, SWORD_BL);
    rect(ctx, ox + 23, bodyY + 2, 1, 14, SWORD_HL);
    rect(ctx, ox + 21, bodyY + 9, 6,  2, SWORD_GOLD);

  } else {
    // ═══ SIDE VIEW (E or W) ══════════════════════════════════════════════════
    const flip = facingW;
    // Mirror helper: maps a column offset from left to actual x
    const mx = flip
      ? (x: number, w2 = 1) => ox + 32 - x - w2
      : (x: number)          => ox + x;

    // Legs (side walk)
    const legFwd = step ? 6 : 2;   // forward leg x-offset
    const legBwd = step ? 2 : 6;
    // Front leg
    rect(ctx, mx(10), bodyY + 21, 4, legFwd + 5, CHAIN_M);
    rect(ctx, mx(11), bodyY + 21, 2, legFwd + 5, CHAIN_L);
    rect(ctx, mx( 9), bodyY + 27,  6, 3, BOOT);
    // Back leg (behind, darker)
    rect(ctx, mx(14), bodyY + 23, 4, legBwd + 3, CHAIN_D);
    rect(ctx, mx(13), bodyY + 27,  6, 3, CHAIN_D);

    // Cape (side, billows back on walk)
    const capeW = step ? 6 : 5;
    rect(ctx, mx(6),  bodyY + 14, capeW, 10, CAPE_L);
    rect(ctx, mx(7),  bodyY + 15, capeW - 2, 9, CAPE_D);

    // Torso side outline
    rect(ctx, mx(10), bodyY + 13, 11, 9, OUTLINE);
    rect(ctx, mx(11), bodyY + 14,  9, 7, ARMOR_D);
    rect(ctx, mx(12), bodyY + 14,  7, 7, ARMOR_M);
    rect(ctx, mx(12), bodyY + 14,  3, 7, ARMOR_L);
    rect(ctx, mx(12), bodyY + 14,  1, 7, ARMOR_HL);

    // Belt
    rect(ctx, mx(10), bodyY + 21, 11, 3, BELT);

    // Arm (front)
    const armX = facingE ? 21 : 10;
    rect(ctx, mx(armX), bodyY + 14, 3, 7, CHAIN_M);
    rect(ctx, mx(armX + 1), bodyY + 14, 1, 7, CHAIN_L);

    // Helmet side
    rect(ctx, mx(10), bodyY + 3,  11, 11, OUTLINE);
    rect(ctx, mx(11), bodyY + 3,  9,  11, ARMOR_D);
    rect(ctx, mx(12), bodyY + 2,  8,  11, ARMOR_M);
    rect(ctx, mx(13), bodyY + 2,  5,   3, ARMOR_L);
    rect(ctx, mx(14), bodyY + 2,  3,   2, ARMOR_HL);
    // Visor (side)
    rect(ctx, mx(12), bodyY + 8,  9,  4, VISOR);
    rect(ctx, mx(13), bodyY + 9,  6,  2, VISOR_GLOW);
    // Face sliver
    rect(ctx, mx(12), bodyY + 12, 5, 2, SKIN);
    // Nasal guard
    rect(ctx, mx(12), bodyY + 6,  2, 6, ARMOR_D);

    // Sword: extended forward
    const swX = facingE ? 22 : 4;
    const swY = step ? bodyY + 10 : bodyY + 12;
    rect(ctx, mx(swX), swY,    2, 12, SWORD_BL);
    rect(ctx, mx(swX), swY,    1, 12, SWORD_HL);
    rect(ctx, mx(swX - 2), swY + 5, 6, 2, SWORD_GOLD);  // crossguard
    rect(ctx, mx(swX), swY - 1,     2, 3, SWORD_GOLD);  // pommel
  }
}

// ── GOBLIN SPRITE SHEET ────────────────────────────────────────────────────
// 32x32 per frame, 4 cols (walk) × 4 rows (N,E,S,W) → 128x128

export function genGoblinSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(128, 128);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      drawGoblin(ctx, col * 32, row * 32, row, col);
    }
  }
  return c;
}

function drawGoblin(ctx: CanvasRenderingContext2D, ox: number, oy: number, facing: number, frame: number): void {
  const SKIN    = 0x4a7a3a;
  const DARK    = 0x2a4a22;
  const EYE     = 0xffff00;
  const EYE_P   = 0x000000;
  const LEATHER = 0x6a4420;
  const LEATHER2 = 0x3a2410;
  const WEAPON  = 0x808070;
  const WEAPON_H = 0x5a3a10;
  const TOOTH   = 0xf0f0d0;

  const legShift = (frame === 1 || frame === 3) ? 1 : 0;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(ox + 16, oy + 29, 7, 2.5, 0, 0, Math.PI * 2); ctx.fill();

  if (facing === 2) { // South
    // Legs
    rect(ctx, ox + 12, oy + 22 + legShift, 4, 7, DARK);
    rect(ctx, ox + 17, oy + 22 - legShift, 4, 7, DARK);
    // Body
    rect(ctx, ox + 10, oy + 15, 12, 8, LEATHER);
    rect(ctx, ox + 11, oy + 16, 10, 6, LEATHER2);
    // Head
    rect(ctx, ox + 10, oy + 7, 12, 10, SKIN);
    rect(ctx, ox + 9,  oy + 8, 14, 8, SKIN);
    rect(ctx, ox + 11, oy + 7, 10, 2, DARK);
    // Ears
    rect(ctx, ox + 8,  oy + 9, 3, 4, SKIN);
    rect(ctx, ox + 21, oy + 9, 3, 4, SKIN);
    // Eyes
    rect(ctx, ox + 12, oy + 10, 3, 3, EYE);
    rect(ctx, ox + 18, oy + 10, 3, 3, EYE);
    px(ctx, ox + 13, oy + 11, EYE_P);
    px(ctx, ox + 19, oy + 11, EYE_P);
    // Teeth
    rect(ctx, ox + 13, oy + 15, 2, 2, TOOTH);
    rect(ctx, ox + 17, oy + 15, 2, 2, TOOTH);
    // Arms
    rect(ctx, ox + 8, oy + 16, 2, 5, SKIN);
    rect(ctx, ox + 22, oy + 16, 2, 5, SKIN);
    // Club
    ctx.fillStyle = hex(WEAPON_H);
    ctx.fillRect(ox + 24, oy + 14, 2, 10);
    ctx.fillStyle = hex(WEAPON);
    ctx.fillRect(ox + 22, oy + 10, 6, 6);

  } else if (facing === 0) { // North
    rect(ctx, ox + 12, oy + 22 + legShift, 4, 7, DARK);
    rect(ctx, ox + 17, oy + 22 - legShift, 4, 7, DARK);
    rect(ctx, ox + 10, oy + 15, 12, 8, LEATHER);
    rect(ctx, ox + 11, oy + 7, 10, 10, SKIN);
    rect(ctx, ox + 9,  oy + 8, 14, 8, SKIN);
    rect(ctx, ox + 8,  oy + 9, 3, 4, SKIN);
    rect(ctx, ox + 21, oy + 9, 3, 4, SKIN);
    // Back of head
    rect(ctx, ox + 11, oy + 6, 10, 3, DARK);
    ctx.fillStyle = hex(WEAPON_H);
    ctx.fillRect(ox + 24, oy + 14, 2, 10);
    ctx.fillStyle = hex(WEAPON); ctx.fillRect(ox + 22, oy + 10, 6, 5);

  } else { // East/West
    const flip = (facing === 3);
    const sx = flip ? (x: number) => ox + 32 - x - 1 : (x: number) => ox + x;
    const legA = frame % 2 === 0 ? 7 : 6;
    const legB = frame % 2 === 0 ? 6 : 7;
    rect(ctx, sx(12), oy + 22, 4, legA, DARK, 1);
    rect(ctx, sx(17), oy + 22, 4, legB, DARK, 1);
    rect(ctx, sx(11), oy + 15, 10, 8, LEATHER, 1);
    rect(ctx, sx(10), oy + 7, 12, 10, SKIN, 1);
    rect(ctx, sx(9),  oy + 8, 2, 6, SKIN, 1);
    // Eye facing front
    rect(ctx, sx(16), oy + 10, 3, 3, EYE, 1);
    px(ctx, sx(17), oy + 11, EYE_P);
    // Ear
    rect(ctx, sx(9), oy + 9, 3, 4, SKIN, 1);
    // Snout/teeth
    rect(ctx, sx(10), oy + 14, 4, 3, SKIN, 1);
    px(ctx, sx(11), oy + 16, TOOTH);
    px(ctx, sx(13), oy + 16, TOOTH);
    // Club
    ctx.fillStyle = hex(WEAPON_H);
    ctx.fillRect(sx(22), oy + 12, 2, 10);
    ctx.fillStyle = hex(WEAPON); ctx.fillRect(sx(20), oy + 8, 6, 6);
  }
}

// ── SKELETON SPRITE SHEET ─────────────────────────────────────────────────
// 32x32 per frame, 4 cols × 4 rows → 128x128

export function genSkeletonSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(128, 128);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      drawSkeleton(ctx, col * 32, row * 32, row, col);
    }
  }
  return c;
}

function drawSkeleton(ctx: CanvasRenderingContext2D, ox: number, oy: number, facing: number, frame: number): void {
  const BONE    = 0xe8e0d0;
  const BONE_D  = 0xb0a890;
  const SOCKET  = 0x101010;
  const RUST    = 0x6a4a30;
  const DAGGER  = 0xc0c8d8;

  const legShift = (frame === 1 || frame === 3) ? 1 : 0;

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(ox + 16, oy + 29, 7, 2, 0, 0, Math.PI * 2); ctx.fill();

  if (facing === 2) { // South
    // Legs (bones)
    rect(ctx, ox + 12, oy + 22 + legShift, 3, 8, BONE);
    rect(ctx, ox + 18, oy + 22 - legShift, 3, 8, BONE);
    rect(ctx, ox + 12, oy + 28 + legShift, 5, 2, BONE_D); // foot
    rect(ctx, ox + 16, oy + 28 - legShift, 5, 2, BONE_D);
    // Pelvis / hips
    rect(ctx, ox + 10, oy + 21, 12, 3, BONE_D);
    // Ribcage
    for (let i = 0; i < 3; i++) {
      rect(ctx, ox + 10, oy + 13 + i * 3, 12, 2, BONE);
      rect(ctx, ox + 10, oy + 14 + i * 3, 1, 1, BONE_D);
      rect(ctx, ox + 21, oy + 14 + i * 3, 1, 1, BONE_D);
    }
    rect(ctx, ox + 10, oy + 13, 2, 8, BONE_D);
    rect(ctx, ox + 20, oy + 13, 2, 8, BONE_D);
    // Arms
    rect(ctx, ox + 7, oy + 14, 3, 7, BONE);
    rect(ctx, ox + 22, oy + 14, 3, 7, BONE);
    rect(ctx, ox + 7, oy + 20, 4, 2, BONE_D);
    rect(ctx, ox + 21, oy + 20, 4, 2, BONE_D);
    // Skull
    rect(ctx, ox + 10, oy + 5, 12, 9, BONE);
    rect(ctx, ox + 9,  oy + 7, 14, 6, BONE);
    // Eye sockets
    rect(ctx, ox + 11, oy + 7, 4, 4, SOCKET);
    rect(ctx, ox + 17, oy + 7, 4, 4, SOCKET);
    // Jaw
    rect(ctx, ox + 11, oy + 13, 10, 2, BONE);
    rect(ctx, ox + 12, oy + 14, 2, 2, SOCKET);
    rect(ctx, ox + 15, oy + 14, 2, 2, SOCKET);
    rect(ctx, ox + 18, oy + 14, 2, 2, SOCKET);
    // Rusty weapon
    ctx.fillStyle = hex(RUST);
    ctx.fillRect(ox + 24, oy + 12, 2, 12);
    ctx.fillStyle = hex(DAGGER);
    ctx.fillRect(ox + 23, oy + 8, 4, 5);

  } else if (facing === 0) { // North (back)
    rect(ctx, ox + 12, oy + 22 + legShift, 3, 8, BONE);
    rect(ctx, ox + 18, oy + 22 - legShift, 3, 8, BONE);
    rect(ctx, ox + 10, oy + 21, 12, 3, BONE_D);
    rect(ctx, ox + 10, oy + 13, 12, 8, BONE_D);
    rect(ctx, ox + 11, oy + 14, 10, 6, BONE);
    rect(ctx, ox + 7, oy + 14, 3, 7, BONE);
    rect(ctx, ox + 22, oy + 14, 3, 7, BONE);
    rect(ctx, ox + 10, oy + 4, 12, 10, BONE);
    ctx.fillStyle = hex(RUST);
    ctx.fillRect(ox + 24, oy + 12, 2, 12);
    ctx.fillStyle = hex(DAGGER); ctx.fillRect(ox + 23, oy + 8, 4, 5);

  } else { // Side
    const flip = (facing === 3);
    const sx = flip ? (x: number) => ox + 32 - x - 1 : (x: number) => ox + x;
    const legA = frame % 2 === 0 ? 8 : 6;
    const legB = frame % 2 === 0 ? 6 : 8;
    rect(ctx, sx(12), oy + 22, 3, legA, BONE, 1);
    rect(ctx, sx(17), oy + 22, 3, legB, BONE, 1);
    rect(ctx, sx(10), oy + 21, 12, 3, BONE_D, 1);
    for (let i = 0; i < 3; i++) rect(ctx, sx(10), oy + 13 + i * 3, 12, 2, BONE, 1);
    rect(ctx, sx(10), oy + 13, 2, 8, BONE_D, 1);
    rect(ctx, sx(22), oy + 14, 3, 7, BONE, 1);
    rect(ctx, sx(10), oy + 5, 12, 9, BONE, 1);
    rect(ctx, sx(14), oy + 7, 4, 4, SOCKET, 1);
    rect(ctx, sx(11), oy + 13, 5, 2, BONE, 1);
    ctx.fillStyle = hex(RUST); ctx.fillRect(sx(24), oy + 12, 2, 12);
    ctx.fillStyle = hex(DAGGER); ctx.fillRect(sx(22), oy + 8, 4, 5);
  }
}

// ── ORC SPRITE SHEET ──────────────────────────────────────────────────────
// 32x32 per frame, 4 cols × 4 rows → 128x128 (bigger/burlier than goblin)

export function genOrcSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(128, 128);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      drawOrc(ctx, col * 32, row * 32, row, col);
    }
  }
  return c;
}

function drawOrc(ctx: CanvasRenderingContext2D, ox: number, oy: number, facing: number, frame: number): void {
  const SKIN    = 0x3a6a2a;
  const DARK    = 0x1e3a14;
  const EYE     = 0xff4400;
  const EYE_P   = 0x000000;
  const ARMOR   = 0x4a4440;
  const ARMOR2  = 0x2a2420;
  const AXE_B   = 0x888078;
  const AXE_H   = 0x5a3a10;
  const TUSK    = 0xf8f0d0;

  const legShift = (frame === 1 || frame === 3) ? 1 : 0;

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(ox + 16, oy + 30, 9, 3, 0, 0, Math.PI * 2); ctx.fill();

  if (facing === 2) { // South
    rect(ctx, ox + 10, oy + 23 + legShift, 5, 7, DARK);
    rect(ctx, ox + 18, oy + 23 - legShift, 5, 7, DARK);
    rect(ctx, ox + 8, oy + 15, 16, 10, ARMOR);
    rect(ctx, ox + 9, oy + 16, 14, 8, ARMOR2);
    rect(ctx, ox + 10, oy + 16, 6, 8, SKIN);
    rect(ctx, ox + 8, oy + 24, 16, 2, DARK);
    rect(ctx, ox + 6, oy + 16, 2, 8, SKIN);
    rect(ctx, ox + 24, oy + 16, 2, 8, SKIN);
    // Head
    rect(ctx, ox + 9, oy + 5, 14, 12, SKIN);
    rect(ctx, ox + 8, oy + 7, 16, 10, SKIN);
    rect(ctx, ox + 10, oy + 4, 12, 3, DARK);
    // Horns
    rect(ctx, ox + 8, oy + 4, 3, 5, DARK);
    rect(ctx, ox + 21, oy + 4, 3, 5, DARK);
    // Eyes
    rect(ctx, ox + 11, oy + 9, 4, 4, EYE);
    rect(ctx, ox + 17, oy + 9, 4, 4, EYE);
    px(ctx, ox + 12, oy + 10, EYE_P); px(ctx, ox + 18, oy + 10, EYE_P);
    // Tusks
    rect(ctx, ox + 13, oy + 15, 2, 3, TUSK);
    rect(ctx, ox + 18, oy + 15, 2, 3, TUSK);
    // Axe
    ctx.fillStyle = hex(AXE_H); ctx.fillRect(ox + 26, oy + 10, 2, 16);
    ctx.fillStyle = hex(AXE_B); ctx.fillRect(ox + 22, oy + 8, 8, 8);

  } else if (facing === 0) { // North
    rect(ctx, ox + 10, oy + 23 + legShift, 5, 7, DARK);
    rect(ctx, ox + 18, oy + 23 - legShift, 5, 7, DARK);
    rect(ctx, ox + 8, oy + 15, 16, 10, ARMOR);
    rect(ctx, ox + 9, oy + 5, 14, 12, SKIN);
    rect(ctx, ox + 8, oy + 7, 16, 10, SKIN);
    rect(ctx, ox + 8, oy + 4, 3, 5, DARK);
    rect(ctx, ox + 21, oy + 4, 3, 5, DARK);
    ctx.fillStyle = hex(AXE_H); ctx.fillRect(ox + 26, oy + 10, 2, 16);
    ctx.fillStyle = hex(AXE_B); ctx.fillRect(ox + 22, oy + 8, 8, 8);

  } else {
    const flip = (facing === 3);
    const sx = flip ? (x: number) => ox + 32 - x - 1 : (x: number) => ox + x;
    const legA = frame % 2 === 0 ? 7 : 6;
    const legB = frame % 2 === 0 ? 6 : 7;
    rect(ctx, sx(10), oy + 23, 5, legA, DARK, 1);
    rect(ctx, sx(18), oy + 23, 5, legB, DARK, 1);
    rect(ctx, sx(8), oy + 15, 16, 10, ARMOR, 1);
    rect(ctx, sx(10), oy + 16, 8, 8, SKIN, 1);
    rect(ctx, sx(9), oy + 5, 14, 12, SKIN, 1);
    rect(ctx, sx(8), oy + 4, 3, 5, DARK, 1);
    rect(ctx, sx(15), oy + 9, 4, 4, EYE, 1);
    px(ctx, sx(16), oy + 10, EYE_P);
    rect(ctx, sx(8), oy + 14, 4, 3, TUSK, 1);
    ctx.fillStyle = hex(AXE_H); ctx.fillRect(sx(26), oy + 10, 2, 16);
    ctx.fillStyle = hex(AXE_B); ctx.fillRect(sx(22), oy + 7, 8, 8);
  }
}

// ── TROLL (BOSS) SPRITE SHEET ─────────────────────────────────────────────
// 48x48 per frame, 4 cols × 4 rows → 192x192

export function genTrollSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(192, 192);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      drawTroll(ctx, col * 48, row * 48, row, col);
    }
  }
  return c;
}

function drawTroll(ctx: CanvasRenderingContext2D, ox: number, oy: number, facing: number, frame: number): void {
  const SKIN    = 0x5a5040;
  const DARK    = 0x2a2520;
  const EYE     = 0xff2200;
  const EYE_P   = 0x000000;
  const ROCK    = 0x706860;
  const ROCK_D  = 0x3a3530;
  const VEIN    = 0x0a3a0a;
  const TOOTH   = 0xd8d0b8;

  const legShift = (frame === 1 || frame === 3) ? 2 : 0;

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(ox + 24, oy + 45, 14, 4, 0, 0, Math.PI * 2); ctx.fill();

  if (facing === 2) { // South
    // Legs
    rect(ctx, ox + 10, oy + 32 + legShift, 8, 14, DARK);
    rect(ctx, ox + 30, oy + 32 - legShift, 8, 14, DARK);
    rect(ctx, ox + 9,  oy + 32 + legShift, 10, 3, DARK);
    rect(ctx, ox + 29, oy + 32 - legShift, 10, 3, DARK);
    // Body
    rect(ctx, ox + 8, oy + 14, 32, 22, SKIN);
    rect(ctx, ox + 9, oy + 15, 30, 20, DARK);
    rect(ctx, ox + 10, oy + 15, 12, 18, SKIN);
    rect(ctx, ox + 26, oy + 15, 12, 18, SKIN);
    // Vein details
    ctx.strokeStyle = hex(VEIN);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox + 16, oy + 18); ctx.lineTo(ox + 14, oy + 28);
    ctx.moveTo(ox + 32, oy + 16); ctx.lineTo(ox + 34, oy + 26);
    ctx.stroke();
    // Arms
    rect(ctx, ox + 4, oy + 16, 6, 16, SKIN);
    rect(ctx, ox + 38, oy + 16, 6, 16, SKIN);
    rect(ctx, ox + 2, oy + 28, 8, 4, DARK);
    rect(ctx, ox + 38, oy + 28, 8, 4, DARK);
    // Head
    rect(ctx, ox + 8, oy + 2, 32, 16, SKIN);
    rect(ctx, ox + 6, oy + 5, 36, 12, SKIN);
    rect(ctx, ox + 10, oy + 1, 28, 4, DARK);
    // Eye sockets (large)
    rect(ctx, ox + 10, oy + 6, 8, 7, EYE);
    rect(ctx, ox + 30, oy + 6, 8, 7, EYE);
    px(ctx, ox + 13, oy + 9, EYE_P); px(ctx, ox + 33, oy + 9, EYE_P);
    // Teeth/tusks
    rect(ctx, ox + 15, oy + 16, 4, 6, TOOTH);
    rect(ctx, ox + 29, oy + 16, 4, 6, TOOTH);
    rect(ctx, ox + 21, oy + 16, 6, 4, TOOTH);
    // Rock club
    ctx.fillStyle = hex(ROCK_D); ctx.fillRect(ox + 43, oy + 10, 4, 24);
    ctx.fillStyle = hex(ROCK); ctx.fillRect(ox + 38, oy + 4, 12, 14);
    ctx.fillStyle = hex(DARK); ctx.fillRect(ox + 40, oy + 6, 8, 10);
    ctx.fillStyle = hex(ROCK); ctx.fillRect(ox + 41, oy + 7, 6, 8);

  } else if (facing === 0) { // North
    rect(ctx, ox + 10, oy + 32 + legShift, 8, 14, DARK);
    rect(ctx, ox + 30, oy + 32 - legShift, 8, 14, DARK);
    rect(ctx, ox + 8, oy + 14, 32, 22, DARK);
    rect(ctx, ox + 10, oy + 14, 28, 20, SKIN);
    rect(ctx, ox + 4, oy + 16, 6, 16, SKIN);
    rect(ctx, ox + 38, oy + 16, 6, 16, SKIN);
    rect(ctx, ox + 8, oy + 2, 32, 16, SKIN);
    rect(ctx, ox + 6, oy + 5, 36, 12, SKIN);
    ctx.fillStyle = hex(ROCK_D); ctx.fillRect(ox + 43, oy + 10, 4, 24);
    ctx.fillStyle = hex(ROCK); ctx.fillRect(ox + 38, oy + 4, 12, 14);

  } else {
    const flip = (facing === 3);
    const sx = flip ? (x: number) => ox + 48 - x - 1 : (x: number) => ox + x;
    const legA = frame % 2 === 0 ? 14 : 12;
    const legB = frame % 2 === 0 ? 12 : 14;
    rect(ctx, sx(10), oy + 32, 8, legA, DARK, 1);
    rect(ctx, sx(30), oy + 32, 8, legB, DARK, 1);
    rect(ctx, sx(8), oy + 14, 32, 22, SKIN, 1);
    rect(ctx, sx(4), oy + 16, 6, 16, SKIN, 1);
    rect(ctx, sx(8), oy + 2, 32, 16, SKIN, 1);
    rect(ctx, sx(12), oy + 6, 8, 7, EYE, 1);
    px(ctx, sx(15), oy + 9, EYE_P);
    rect(ctx, sx(10), oy + 15, 6, 6, TOOTH, 1);
    ctx.fillStyle = hex(ROCK_D); ctx.fillRect(sx(43), oy + 10, 4, 24);
    ctx.fillStyle = hex(ROCK); ctx.fillRect(sx(38), oy + 4, 12, 14);
  }
}

// ── TORCH ANIMATION ────────────────────────────────────────────────────────
// 16x32 per frame, 4 frames → 64x32

export function genTorchSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(64, 32);
  const IRON   = 0x605850;
  const IRON_D = 0x302820;
  const FIRE   = [0xffee44, 0xff8800, 0xff4400, 0xffcc00];
  const EMBER  = 0xff2200;

  for (let f = 0; f < 4; f++) {
    const ox = f * 16;
    // Bracket/holder
    rect(ctx, ox + 6, 20, 4, 12, IRON_D);
    rect(ctx, ox + 7, 21, 2, 10, IRON);
    rect(ctx, ox + 4, 20, 8, 4, IRON);
    // Flame layers (different shapes per frame for flicker)
    const flames = [
      [[5,4,6,16],[6,2,4,8],[7,1,2,6],[6,8,4,6]],
      [[5,5,6,15],[6,3,4,7],[7,2,2,5],[5,9,6,5]],
      [[4,4,8,16],[5,3,6,7],[6,2,4,6],[7,8,2,7]],
      [[5,3,6,17],[6,1,4,9],[7,0,2,7],[5,7,6,6]],
    ];
    const layers = flames[f];
    for (let i = 0; i < layers.length; i++) {
      const [fx2, fy2, fw2, fh2] = layers[i];
      const col = FIRE[i % FIRE.length];
      ctx.fillStyle = hex(col);
      for (let py2 = 0; py2 < fh2; py2++) {
        const spread = Math.max(0, Math.floor((fh2 - py2) * fw2 / fh2 / 2));
        const w2 = fw2 - spread * 2;
        if (w2 > 0) ctx.fillRect(ox + fx2 + spread, fy2 + py2, w2, 1);
      }
    }
    // Ember glow at base of flame
    ctx.fillStyle = hex(EMBER);
    ctx.fillRect(ox + 6, 18, 4, 2);
    // Warm light hint
    ctx.fillStyle = 'rgba(255,160,0,0.15)';
    ctx.fillRect(ox + 2, 4, 12, 18);
  }
  return c;
}

// ── LOOT SPRITES ───────────────────────────────────────────────────────────
// Coins: 8x8, 4 frames → 32x8
// Potion: 12x16, single
// Gem: 12x12

export function genCoinSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(32, 8);
  const GOLD = [0xffd840, 0xffb820, 0xffe870, 0xffa000];
  const EDGE = 0xa06800;
  for (let f = 0; f < 4; f++) {
    const ox = f * 8;
    if (f === 1 || f === 3) {
      // Edge-on view
      rect(ctx, ox + 3, 2, 2, 5, GOLD[f]);
      rect(ctx, ox + 3, 2, 2, 1, GOLD[0]);
    } else {
      rect(ctx, ox + 1, 1, 6, 6, EDGE);
      rect(ctx, ox + 2, 1, 4, 6, GOLD[f]);
      rect(ctx, ox + 1, 2, 6, 4, GOLD[f]);
      rect(ctx, ox + 3, 2, 2, 1, 0xfff0a0);
    }
  }
  return c;
}

export function genPotionSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(12, 16);
  // Cork
  rect(ctx, 4, 0, 4, 3, 0x8a6030);
  // Bottle neck
  rect(ctx, 4, 2, 4, 3, 0x5088b0);
  // Bottle body
  rect(ctx, 2, 5, 8, 10, 0x4070a0);
  rect(ctx, 3, 6, 6, 8, 0x60a0d0);
  // Liquid
  rect(ctx, 3, 8, 6, 6, 0xff2050);
  rect(ctx, 4, 8, 4, 6, 0xff4060);
  // Shine
  rect(ctx, 3, 6, 2, 3, 0xa0d0f0);
  // Bottom
  rect(ctx, 2, 14, 8, 1, 0x304050);
  return c;
}

export function genGemSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(12, 12);
  // Diamond shape
  const GEM = 0x40d0ff;
  const GEM_L = 0xa0f0ff;
  const GEM_D = 0x2080a0;
  const EDGE = 0x104060;
  ctx.fillStyle = hex(EDGE);
  ctx.beginPath();
  ctx.moveTo(6, 0); ctx.lineTo(12, 5); ctx.lineTo(6, 12); ctx.lineTo(0, 5);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = hex(GEM);
  ctx.beginPath();
  ctx.moveTo(6, 1); ctx.lineTo(11, 5); ctx.lineTo(6, 11); ctx.lineTo(1, 5);
  ctx.closePath(); ctx.fill();
  // Facets
  ctx.fillStyle = hex(GEM_L);
  ctx.beginPath();
  ctx.moveTo(6, 1); ctx.lineTo(11, 5); ctx.lineTo(6, 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = hex(GEM_D);
  ctx.beginPath();
  ctx.moveTo(6, 6); ctx.lineTo(11, 5); ctx.lineTo(6, 11); ctx.closePath(); ctx.fill();
  // Shine
  rect(ctx, 4, 2, 2, 2, 0xffffff);
  return c;
}

// ── SPAWNER (MONSTER NEST) ─────────────────────────────────────────────────
// 32x40, 4 crack variants → 128x40

export function genSpawnerSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(128, 40);
  const STONE = 0x4a4040;
  const DARK  = 0x2a2020;
  const CRACK = 0x100808;
  const BONE  = 0xb0a090;
  const RUNE  = 0x800040;

  for (let v = 0; v < 4; v++) {
    const ox = v * 32;
    // Base stone slab
    rect(ctx, ox + 2, 8, 28, 32, DARK);
    rect(ctx, ox + 3, 9, 26, 30, STONE);
    rect(ctx, ox + 4, 10, 24, 28, 0x3a3535);
    // Rune circle (top)
    ctx.strokeStyle = hex(RUNE);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ox + 16, 24, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.arc(ox + 16, 24, 6, 0, Math.PI * 2); ctx.stroke();
    // Bone decorations
    rect(ctx, ox + 4,  8, 4, 4, BONE);
    rect(ctx, ox + 24, 8, 4, 4, BONE);
    // Cracks progress with variant index
    ctx.fillStyle = hex(CRACK);
    for (let c2 = 0; c2 <= v; c2++) {
      const crx = ox + 8 + c2 * 6;
      const cry = 12 + c2 * 4;
      ctx.fillRect(crx, cry, 1, 8);
      ctx.fillRect(crx + 1, cry + 4, 1, 6);
    }
    // Portal glow (more active at higher damage = lower variant index)
    const glowA = (4 - v) / 4 * 0.4;
    ctx.fillStyle = `rgba(128,0,64,${glowA})`;
    ctx.beginPath(); ctx.arc(ox + 16, 24, 9, 0, Math.PI * 2); ctx.fill();
  }
  return c;
}

// ── CHEST ──────────────────────────────────────────────────────────────────
// 32x32 → closed and open (64x32)

export function genChestSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(64, 32);
  const WOOD  = 0x6a4020;
  const WOOD2 = 0x4a2c14;
  const IRON  = 0x605848;
  const IRON2 = 0x403c34;
  const GOLD  = 0xd4a030;
  const GEM_C = 0x4060d0;

  for (let state = 0; state < 2; state++) {
    const ox = state * 32;
    const lidY = state === 1 ? 2 : 8; // open lid is raised

    // Body
    rect(ctx, ox + 2, 14, 28, 18, WOOD2);
    rect(ctx, ox + 3, 15, 26, 16, WOOD);
    // Lid
    rect(ctx, ox + 2, lidY, 28, 8, WOOD2);
    rect(ctx, ox + 3, lidY + 1, 26, 6, WOOD);
    // Metal bands
    ctx.fillStyle = hex(IRON2);
    ctx.fillRect(ox + 2, 14, 4, 18);
    ctx.fillRect(ox + 26, 14, 4, 18);
    ctx.fillRect(ox + 2, lidY, 4, 8);
    ctx.fillRect(ox + 26, lidY, 4, 8);
    // Horizontal band
    ctx.fillStyle = hex(IRON);
    ctx.fillRect(ox + 2, 14, 28, 3);
    ctx.fillStyle = hex(IRON2);
    ctx.fillRect(ox + 3, 24, 26, 2);
    // Latch
    ctx.fillStyle = hex(GOLD);
    ctx.fillRect(ox + 14, 13, 4, 5);
    ctx.fillRect(ox + 13, 14, 6, 3);
    // Gems on lid
    if (state === 0) {
      ctx.fillStyle = hex(GEM_C);
      ctx.fillRect(ox + 8, lidY + 2, 4, 4);
      ctx.fillRect(ox + 20, lidY + 2, 4, 4);
    } else {
      // Open: show gold spill
      ctx.fillStyle = 'rgba(255,200,0,0.6)';
      ctx.fillRect(ox + 6, 16, 20, 10);
      ctx.fillStyle = hex(0xffd030);
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(ox + 7 + i * 4, 15, 3, 3);
      }
    }
  }
  return c;
}

// ── SWORD SWING FX ─────────────────────────────────────────────────────────
// 48x48, 4 frames for slash arc → 192x48

export function genSwordSwingSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(192, 48);
  const BLADE = 0xd8e8ff;
  const TRAIL = [0x80b0ff, 0x4080ff, 0x2040a0, 0x102060];

  for (let f = 0; f < 4; f++) {
    const ox = f * 48;
    // Swing arc fades out
    const alpha = 1 - f * 0.25;
    // Draw arc segments
    ctx.globalAlpha = alpha;
    for (let i = 0; i < 4; i++) {
      const a0 = -Math.PI / 3 + (f * 0.3 + i * 0.2);
      const a1 = a0 + 0.6;
      const r0 = 10 + i * 4;
      const r1 = 14 + i * 4;
      ctx.beginPath();
      ctx.arc(ox + 24, 24, r1, a0, a1);
      ctx.arc(ox + 24, 24, r0, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = hex(f === 0 ? BLADE : TRAIL[i]);
      ctx.fill();
    }
    // Bright tip flash on first frame
    if (f === 0) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ox + 24 + Math.cos(-Math.PI / 3 + 0.8) * 22, 24 + Math.sin(-Math.PI / 3 + 0.8) * 22, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  return c;
}

// ── DEATH FX ───────────────────────────────────────────────────────────────
// 48x48, 6 frames → 288x48

export function genDeathFxSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(288, 48);
  const COLORS = [0xff4400, 0xff8800, 0xffcc00, 0x800000, 0x400000, 0x100000];

  for (let f = 0; f < 6; f++) {
    const ox = f * 48;
    const radius = 4 + f * 5;
    const alpha = Math.max(0, 1 - f * 0.18);
    ctx.globalAlpha = alpha;
    // Outer ring
    ctx.fillStyle = hex(COLORS[f]);
    ctx.beginPath(); ctx.arc(ox + 24, 24, radius, 0, Math.PI * 2); ctx.fill();
    // Sparks
    if (f < 4) {
      const sparkCount = 8 - f * 2;
      for (let s = 0; s < sparkCount; s++) {
        const angle = (s / sparkCount) * Math.PI * 2 + f * 0.3;
        const dist = radius + 4 + f * 2;
        ctx.fillStyle = hex(f === 0 ? 0xffffff : COLORS[Math.max(0, f - 1)]);
        ctx.fillRect(
          ox + 24 + Math.cos(angle) * dist - 1,
          24 + Math.sin(angle) * dist - 1, 2, 2
        );
      }
    }
    ctx.globalAlpha = 1;
  }
  return c;
}

// ── DUST FX ────────────────────────────────────────────────────────────────
// 16x16, 4 frames → 64x16

export function genDustSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(64, 16);
  for (let f = 0; f < 4; f++) {
    const ox = f * 16;
    const alpha = 1 - f * 0.25;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#7a6a58';
    const r = 3 + f * 2;
    ctx.beginPath(); ctx.arc(ox + 8, 8, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a09080';
    ctx.beginPath(); ctx.arc(ox + 5, 6, r / 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a7868';
    ctx.beginPath(); ctx.arc(ox + 11, 10, r / 2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  return c;
}

// ── HEALTH / SPRINT BARS ───────────────────────────────────────────────────
// 32x4, 21 fill steps → 672x4

export function genBarSheet(color: number): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(32 * 21, 4);
  for (let step = 0; step < 21; step++) {
    const w = step * 1.5;
    ctx.fillStyle = hex(color);
    ctx.fillRect(step * 32, 0, w > 0 ? w : 0, 4);
  }
  return c;
}

export function genBarOverlay(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(32, 4);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, 31, 3);
  return c;
}

// ── DARKNESS / FOG TILES ───────────────────────────────────────────────────
// Same layout as original dark.png: 32x32, multiple variants in a 5×5+ grid

export function genDarkSheet(): HTMLCanvasElement {
  // Exact same structure as the original dark.png that DarknessRenderer references
  // 5 cols × 5 rows of 32x32 tiles = 160x160
  const [c, ctx] = mkCanvas(160, 160);
  // Fill with fully opaque black for most; the renderer picks the right variant
  ctx.fillStyle = 'rgba(0,0,0,1)';
  ctx.fillRect(0, 0, 160, 160);

  // The corner/edge variants that DarknessRenderer addresses are:
  // (1,1) = full dark, (0,0), (1,0), (0,1), (1,4), (0,4), (1,3), (0,3) = edge
  // (2,2), (0,2), (2,0), (0,0), ... = corner incuts
  // For a dungeon game, we draw soft dark with gradient edges

  const draw = (col: number, row: number, fn: (ctx: CanvasRenderingContext2D, x: number, y: number) => void) => {
    fn(ctx, col * 32, row * 32);
  };

  // (1,1) = fully dark tile
  draw(1, 1, (g, x, y) => {
    g.fillStyle = 'rgba(0,0,0,1)'; g.fillRect(x, y, 32, 32);
  });

  // Edge tiles (one side open)
  const edgeGrad = (g: CanvasRenderingContext2D, x: number, y: number, dir: 'top' | 'bottom' | 'left' | 'right') => {
    const grad = dir === 'top' ? g.createLinearGradient(x, y, x, y + 32)
      : dir === 'bottom' ? g.createLinearGradient(x, y + 32, x, y)
      : dir === 'left' ? g.createLinearGradient(x, y, x + 32, y)
      : g.createLinearGradient(x + 32, y, x, y);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.8)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = grad; g.fillRect(x, y, 32, 32);
  };

  draw(1, 0, (g, x, y) => edgeGrad(g, x, y, 'top'));
  draw(1, 4, (g, x, y) => edgeGrad(g, x, y, 'bottom'));
  draw(0, 1, (g, x, y) => edgeGrad(g, x, y, 'left'));
  draw(2, 1, (g, x, y) => edgeGrad(g, x, y, 'right'));

  // Corner tiles (two sides open — inner corners)
  const cornerGrad = (g: CanvasRenderingContext2D, x: number, y: number, cx: number, cy: number) => {
    const grad = g.createRadialGradient(x + cx * 32, y + cy * 32, 0, x + cx * 32, y + cy * 32, 40);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.6)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = grad; g.fillRect(x, y, 32, 32);
  };

  draw(0, 0, (g, x, y) => cornerGrad(g, x, y, 0, 0));
  draw(2, 0, (g, x, y) => cornerGrad(g, x, y, 1, 0));
  draw(0, 4, (g, x, y) => cornerGrad(g, x, y, 0, 1));
  draw(2, 4, (g, x, y) => cornerGrad(g, x, y, 1, 1));

  // Diagonal strips (two adjacent sides open)
  draw(2, 2, (g, x, y) => {
    const gd = g.createLinearGradient(x, y, x + 32, y + 32);
    gd.addColorStop(0, 'rgba(0,0,0,0)');
    gd.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = gd; g.fillRect(x, y, 32, 32);
  });
  draw(2, 3, (g, x, y) => {
    const gd = g.createLinearGradient(x + 32, y, x, y + 32);
    gd.addColorStop(0, 'rgba(0,0,0,0)');
    gd.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = gd; g.fillRect(x, y, 32, 32);
  });
  draw(0, 2, (g, x, y) => {
    const gd = g.createLinearGradient(x + 32, y, x, y + 32);
    gd.addColorStop(0, 'rgba(0,0,0,1)');
    gd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gd; g.fillRect(x, y, 32, 32);
  });
  draw(0, 3, (g, x, y) => {
    const gd = g.createLinearGradient(x, y, x + 32, y + 32);
    gd.addColorStop(0, 'rgba(0,0,0,1)');
    gd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gd; g.fillRect(x, y, 32, 32);
  });

  // Extra row used by DarknessRenderer — fill remaining cells as full dark
  draw(1, 2, (g, x, y) => { g.fillStyle = 'rgba(0,0,0,1)'; g.fillRect(x, y, 32, 32); });
  draw(1, 3, (g, x, y) => { g.fillStyle = 'rgba(0,0,0,1)'; g.fillRect(x, y, 32, 32); });

  return c;
}

// ── FONT ────────────────────────────────────────────────────────────────────
// Simple 8x8 bitmap font. We generate a minimal 16x16 glyph grid = 128×128
// covering ASCII 32–127. Characters look rough but readable.

export function genFontSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(128, 128);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = '#ffffff';
  ctx.font = '7px monospace';
  ctx.textBaseline = 'top';

  for (let i = 32; i < 128; i++) {
    const ch = String.fromCharCode(i);
    const col = i % 16;
    const row = Math.floor(i / 16);
    ctx.fillText(ch, col * 8 + 1, row * 8 + 1);
  }
  return c;
}

// ── BUTTON ──────────────────────────────────────────────────────────────────
// 128x24, 3 rows (normal, hover, disabled) → 128x72

export function genButtonSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(128, 72);
  const styles = [
    { fill: 0x2a1e14, border: 0x6a4a2a, text: false },
    { fill: 0x3a2a18, border: 0xd4a030, text: false },
    { fill: 0x1a1410, border: 0x3a2a20, text: false },
  ];
  for (let row = 0; row < 3; row++) {
    const s = styles[row];
    const oy = row * 24;
    ctx.fillStyle = hex(s.fill);
    ctx.fillRect(0, oy, 128, 24);
    ctx.strokeStyle = hex(s.border);
    ctx.lineWidth = 2;
    ctx.strokeRect(1, oy + 1, 126, 22);
    // Inner bevel
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(2, oy + 2, 124, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(2, oy + 20, 124, 2);
  }
  return c;
}

// ── PANEL / HUD BACKGROUND ─────────────────────────────────────────────────

export function genPanelBg(w: number, h: number): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(w, h);
  ctx.fillStyle = '#0e0a08';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#4a3820';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  ctx.strokeStyle = '#2a1e10';
  ctx.lineWidth = 1;
  ctx.strokeRect(3, 3, w - 6, h - 6);
  return c;
}

// ── PLAYER ICON FOR HUD ────────────────────────────────────────────────────

export function genPortrait(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(32, 32);
  const ARMOR  = 0x3a6a9a;
  const SKIN   = 0xd4a07a;
  const VISOR  = 0x1a2a3a;
  // Simple face portrait
  rect(ctx, 8, 4, 16, 18, ARMOR);
  rect(ctx, 9, 5, 14, 14, 0x2a4a6a);
  rect(ctx, 10, 12, 12, 4, VISOR);
  rect(ctx, 10, 16, 12, 6, SKIN);
  rect(ctx, 8, 14, 2, 8, ARMOR);
  rect(ctx, 22, 14, 2, 8, ARMOR);
  return c;
}

// ── MINIMAP ICONS ──────────────────────────────────────────────────────────

export function genMinimapIcons(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(64, 8);
  // 4 icons, 8x8 each: player (blue), enemy (red), chest (gold), torch (orange)
  const icons = [0x4080ff, 0xff4040, 0xffd040, 0xff8000];
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = hex(icons[i]);
    ctx.fillRect(i * 8 + 2, 2, 4, 4);
  }
  return c;
}

// ── SHADOW ELLIPSE ─────────────────────────────────────────────────────────

export function genShadow(w: number, h: number): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(w, h);
  const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.5)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  return c;
}
