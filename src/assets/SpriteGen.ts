/** Procedural sprite/texture generation — UI elements only.
 *  Tiles and characters are loaded from /public assets.
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

function px(ctx: CanvasRenderingContext2D, x: number, y: number, col: number, s = 1): void {
  ctx.fillStyle = hex(col);
  ctx.fillRect(x * s, y * s, s, s);
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: number, s = 1): void {
  ctx.fillStyle = hex(col);
  ctx.fillRect(x * s, y * s, w * s, h * s);
}

function noise(seed: number): number {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

// ── PICKUP SPRITES ───────────────────────────────────────────────────────────

export function genCoinSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(32, 8);
  const GOLD = [0xffd840, 0xffb820, 0xffe870, 0xffa000];
  const EDGE = 0xa06800;
  for (let f = 0; f < 4; f++) {
    const ox = f * 8;
    if (f === 1 || f === 3) {
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
  rect(ctx, 4, 0, 4, 3, 0x8a6030);
  rect(ctx, 4, 2, 4, 3, 0x5088b0);
  rect(ctx, 2, 5, 8, 10, 0x4070a0);
  rect(ctx, 3, 6, 6, 8, 0x60a0d0);
  rect(ctx, 3, 8, 6, 6, 0xff2050);
  rect(ctx, 4, 8, 4, 6, 0xff4060);
  rect(ctx, 3, 6, 2, 3, 0xa0d0f0);
  rect(ctx, 2, 14, 8, 1, 0x304050);
  return c;
}

export function genGemSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(12, 12);
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
  ctx.fillStyle = hex(GEM_L);
  ctx.beginPath();
  ctx.moveTo(6, 1); ctx.lineTo(11, 5); ctx.lineTo(6, 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = hex(GEM_D);
  ctx.beginPath();
  ctx.moveTo(6, 6); ctx.lineTo(11, 5); ctx.lineTo(6, 11); ctx.closePath(); ctx.fill();
  rect(ctx, 4, 2, 2, 2, 0xffffff);
  return c;
}

// ── SPAWNER (MONSTER NEST) ────────────────────────────────────────────────────

export function genSpawnerSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(128, 40);
  const STONE = 0x4a4040;
  const DARK  = 0x2a2020;
  const CRACK = 0x100808;
  const BONE  = 0xb0a090;
  const RUNE  = 0x800040;

  for (let v = 0; v < 4; v++) {
    const ox = v * 32;
    rect(ctx, ox + 2, 8, 28, 32, DARK);
    rect(ctx, ox + 3, 9, 26, 30, STONE);
    rect(ctx, ox + 4, 10, 24, 28, 0x3a3535);
    ctx.strokeStyle = hex(RUNE);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(ox + 16, 24, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(ox + 16, 24, 6, 0, Math.PI * 2); ctx.stroke();
    rect(ctx, ox + 4,  8, 4, 4, BONE);
    rect(ctx, ox + 24, 8, 4, 4, BONE);
    ctx.fillStyle = hex(CRACK);
    for (let c2 = 0; c2 <= v; c2++) {
      const crx = ox + 8 + c2 * 6;
      const cry = 12 + c2 * 4;
      ctx.fillRect(crx, cry, 1, 8);
      ctx.fillRect(crx + 1, cry + 4, 1, 6);
    }
    const glowA = (4 - v) / 4 * 0.4;
    ctx.fillStyle = `rgba(128,0,64,${glowA})`;
    ctx.beginPath(); ctx.arc(ox + 16, 24, 9, 0, Math.PI * 2); ctx.fill();
  }
  return c;
}

// ── CHEST ─────────────────────────────────────────────────────────────────────

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
    const lidY = state === 1 ? 2 : 8;
    rect(ctx, ox + 2, 14, 28, 18, WOOD2);
    rect(ctx, ox + 3, 15, 26, 16, WOOD);
    rect(ctx, ox + 2, lidY, 28, 8, WOOD2);
    rect(ctx, ox + 3, lidY + 1, 26, 6, WOOD);
    ctx.fillStyle = hex(IRON2);
    ctx.fillRect(ox + 2, 14, 4, 18);
    ctx.fillRect(ox + 26, 14, 4, 18);
    ctx.fillRect(ox + 2, lidY, 4, 8);
    ctx.fillRect(ox + 26, lidY, 4, 8);
    ctx.fillStyle = hex(IRON);
    ctx.fillRect(ox + 2, 14, 28, 3);
    ctx.fillStyle = hex(IRON2);
    ctx.fillRect(ox + 3, 24, 26, 2);
    ctx.fillStyle = hex(GOLD);
    ctx.fillRect(ox + 14, 13, 4, 5);
    ctx.fillRect(ox + 13, 14, 6, 3);
    if (state === 0) {
      ctx.fillStyle = hex(GEM_C);
      ctx.fillRect(ox + 8, lidY + 2, 4, 4);
      ctx.fillRect(ox + 20, lidY + 2, 4, 4);
    } else {
      ctx.fillStyle = 'rgba(255,200,0,0.6)';
      ctx.fillRect(ox + 6, 16, 20, 10);
      ctx.fillStyle = hex(0xffd030);
      for (let i = 0; i < 5; i++) ctx.fillRect(ox + 7 + i * 4, 15, 3, 3);
    }
  }
  return c;
}

// ── EXIT BUTTON (lever/pull) ──────────────────────────────────────────────────

export function genExitButtonSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(64, 32);
  // Two states: inactive (col 0) and active/pulled (col 1)
  for (let state = 0; state < 2; state++) {
    const ox = state * 32;
    const BASE = state === 1 ? 0x3a8040 : 0x3a3030;
    const GLOW = state === 1 ? 0x40ff80 : 0x808060;
    rect(ctx, ox + 4,  12, 24, 20, 0x2a2020);
    rect(ctx, ox + 5,  13, 22, 18, BASE);
    rect(ctx, ox + 6,  14, 20, 16, 0x3a3535);
    // Rune circle
    ctx.strokeStyle = hex(GLOW);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(ox + 16, 21, 7, 0, Math.PI * 2); ctx.stroke();
    // Central symbol
    ctx.fillStyle = hex(GLOW);
    ctx.fillRect(ox + 14, 21, 4, 1);
    ctx.fillRect(ox + 16, 19, 1, 4);
    // Pedestal top
    rect(ctx, ox + 2, 10, 28, 4, 0x5a5048);
    rect(ctx, ox + 3, 11, 26, 2, 0x7a6858);
    // Glow ring if active
    if (state === 1) {
      ctx.fillStyle = 'rgba(64,255,128,0.25)';
      ctx.beginPath(); ctx.arc(ox + 16, 21, 10, 0, Math.PI * 2); ctx.fill();
    }
  }
  return c;
}

// ── SWORD SWING FX ───────────────────────────────────────────────────────────

export function genSwordSwingSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(192, 48);
  const BLADE = 0xd8e8ff;
  const TRAIL = [0x80b0ff, 0x4080ff, 0x2040a0, 0x102060];

  for (let f = 0; f < 4; f++) {
    const ox = f * 48;
    const alpha = 1 - f * 0.25;
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
    if (f === 0) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ox + 24 + Math.cos(-Math.PI / 3 + 0.8) * 22,
              24 + Math.sin(-Math.PI / 3 + 0.8) * 22, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  return c;
}

// ── DEATH FX ─────────────────────────────────────────────────────────────────

export function genDeathFxSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(288, 48);
  const COLORS = [0xff4400, 0xff8800, 0xffcc00, 0x800000, 0x400000, 0x100000];

  for (let f = 0; f < 6; f++) {
    const ox = f * 48;
    const radius = 4 + f * 5;
    const alpha = Math.max(0, 1 - f * 0.18);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = hex(COLORS[f]);
    ctx.beginPath(); ctx.arc(ox + 24, 24, radius, 0, Math.PI * 2); ctx.fill();
    if (f < 4) {
      const sparkCount = 8 - f * 2;
      for (let s = 0; s < sparkCount; s++) {
        const angle = (s / sparkCount) * Math.PI * 2 + f * 0.3;
        const dist = radius + 4 + f * 2;
        ctx.fillStyle = hex(f === 0 ? 0xffffff : COLORS[Math.max(0, f - 1)]);
        ctx.fillRect(ox + 24 + Math.cos(angle) * dist - 1,
                     24 + Math.sin(angle) * dist - 1, 2, 2);
      }
    }
    ctx.globalAlpha = 1;
  }
  return c;
}

// ── DUST FX ──────────────────────────────────────────────────────────────────

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

// ── DARKNESS / FOG ───────────────────────────────────────────────────────────

export function genDarkSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(160, 160);
  ctx.fillStyle = 'rgba(0,0,0,1)';
  ctx.fillRect(0, 0, 160, 160);

  const draw = (col: number, row: number, fn: (ctx: CanvasRenderingContext2D, x: number, y: number) => void) => {
    fn(ctx, col * 32, row * 32);
  };

  draw(1, 1, (g, x, y) => { g.fillStyle = 'rgba(0,0,0,1)'; g.fillRect(x, y, 32, 32); });

  const edgeGrad = (g: CanvasRenderingContext2D, x: number, y: number, dir: 'top' | 'bottom' | 'left' | 'right') => {
    const grad = dir === 'top'    ? g.createLinearGradient(x, y, x, y + 32)
      : dir === 'bottom' ? g.createLinearGradient(x, y + 32, x, y)
      : dir === 'left'   ? g.createLinearGradient(x, y, x + 32, y)
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

  draw(2, 2, (g, x, y) => {
    const gd = g.createLinearGradient(x, y, x + 32, y + 32);
    gd.addColorStop(0, 'rgba(0,0,0,0)'); gd.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = gd; g.fillRect(x, y, 32, 32);
  });
  draw(2, 3, (g, x, y) => {
    const gd = g.createLinearGradient(x + 32, y, x, y + 32);
    gd.addColorStop(0, 'rgba(0,0,0,0)'); gd.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = gd; g.fillRect(x, y, 32, 32);
  });
  draw(0, 2, (g, x, y) => {
    const gd = g.createLinearGradient(x + 32, y, x, y + 32);
    gd.addColorStop(0, 'rgba(0,0,0,1)'); gd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gd; g.fillRect(x, y, 32, 32);
  });
  draw(0, 3, (g, x, y) => {
    const gd = g.createLinearGradient(x, y, x + 32, y + 32);
    gd.addColorStop(0, 'rgba(0,0,0,1)'); gd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gd; g.fillRect(x, y, 32, 32);
  });

  draw(1, 2, (g, x, y) => { g.fillStyle = 'rgba(0,0,0,1)'; g.fillRect(x, y, 32, 32); });
  draw(1, 3, (g, x, y) => { g.fillStyle = 'rgba(0,0,0,1)'; g.fillRect(x, y, 32, 32); });

  return c;
}

// ── FONT ─────────────────────────────────────────────────────────────────────

export function genFontSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(128, 128);
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

// ── BUTTON ───────────────────────────────────────────────────────────────────

export function genButtonSheet(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(128, 72);
  const styles = [
    { fill: 0x2a1e14, border: 0x6a4a2a },
    { fill: 0x3a2a18, border: 0xd4a030 },
    { fill: 0x1a1410, border: 0x3a2a20 },
  ];
  for (let row = 0; row < 3; row++) {
    const s = styles[row];
    const oy = row * 24;
    ctx.fillStyle = hex(s.fill);
    ctx.fillRect(0, oy, 128, 24);
    ctx.strokeStyle = hex(s.border);
    ctx.lineWidth = 2;
    ctx.strokeRect(1, oy + 1, 126, 22);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(2, oy + 2, 124, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(2, oy + 20, 124, 2);
  }
  return c;
}

// ── PANEL BG ─────────────────────────────────────────────────────────────────

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

// ── PORTRAIT ─────────────────────────────────────────────────────────────────

export function genPortrait(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(32, 32);
  rect(ctx, 8, 4, 16, 18, 0x3a6a9a);
  rect(ctx, 9, 5, 14, 14, 0x2a4a6a);
  rect(ctx, 10, 12, 12, 4, 0x1a2a3a);
  rect(ctx, 10, 16, 12, 6, 0xd4a07a);
  rect(ctx, 8, 14, 2, 8, 0x3a6a9a);
  rect(ctx, 22, 14, 2, 8, 0x3a6a9a);
  return c;
}

// ── MINIMAP ICONS ─────────────────────────────────────────────────────────────

export function genMinimapIcons(): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(64, 8);
  const icons = [0x4080ff, 0xff4040, 0xffd040, 0xff8000];
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = hex(icons[i]);
    ctx.fillRect(i * 8 + 2, 2, 4, 4);
  }
  return c;
}

// ── SHADOW ───────────────────────────────────────────────────────────────────

export function genShadow(w: number, h: number): HTMLCanvasElement {
  const [c, ctx] = mkCanvas(w, h);
  const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.5)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  return c;
}
