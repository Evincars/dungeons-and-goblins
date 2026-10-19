/**
 * Turns a large character sheet (columns = facing directions, rows = animation
 * frames) into small per-animation atlases: columns = frames, rows = the kept
 * directions.
 *
 * Source cells may have fractional sizes and weapons that bleed in from the
 * neighbouring cell; fragments touching a cell's border that aren't part of the
 * character are dropped. Each direction is re-centred on its ground shadow so
 * mirroring it for the opposite side stays aligned.
 */

export type CharacterSheetLayout = {
  /** Direction columns in the source sheet. */
  cols: number;
  /** Source columns to keep, in atlas row order. */
  directions: number[];
  /** Frame rows in the source sheet. */
  rows: number;
  /** Animation name → source row indices, in play order. */
  animations: Record<string, number[]>;
  /** Height in pixels of one output cell; width follows the source aspect. */
  cellHeight: number;
};

export type CharacterAtlas = {
  /** Animation name → atlas canvas (frames across, directions down). */
  sheets: Record<string, HTMLCanvasElement>;
  cellW: number;
  cellH: number;
  /** Y of the ground contact point inside an output cell. */
  groundY: number;
};

const ALPHA_MIN = 16;

/** Clears border-touching blobs that are not the cell's main (largest) blob. */
function dropBleed(img: ImageData): void {
  const { width: w, height: h, data } = img;
  const label = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  const touches: boolean[] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || data[start * 4 + 3] < ALPHA_MIN) continue;
    const id = sizes.length;
    let size = 0;
    let edge = false;
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % w;
      const y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = nx + ny * w;
          if (label[j] !== -1 || data[j * 4 + 3] < ALPHA_MIN) continue;
          label[j] = id;
          stack.push(j);
        }
      }
    }
    sizes.push(size);
    touches.push(edge);
  }
  if (sizes.length === 0) return;
  const main = sizes.indexOf(Math.max(...sizes));
  for (let i = 0; i < w * h; i++) {
    const id = label[i];
    if (id >= 0 && id !== main && touches[id]) data[i * 4 + 3] = 0;
  }
  // Faint pixels below the threshold aren't labelled; clear them too so no halo of bleed remains.
  for (let i = 0; i < w * h; i++) if (label[i] === -1) data[i * 4 + 3] = 0;
}

/** Ground point: alpha-weighted centre of the lowest band of the figure (its shadow/feet). */
function groundPoint(img: ImageData): { x: number; y: number } {
  const { width: w, height: h, data } = img;
  let top = h, bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(x + y * w) * 4 + 3] >= ALPHA_MIN) { top = Math.min(top, y); bottom = Math.max(bottom, y); break; }
    }
  }
  if (bottom < 0) return { x: w / 2, y: h / 2 };
  const band = Math.max(2, Math.round((bottom - top) * 0.08));
  let sx = 0, sy = 0, sw = 0;
  for (let y = bottom - band; y <= bottom; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(x + y * w) * 4 + 3];
      sx += x * a; sy += y * a; sw += a;
    }
  }
  return sw ? { x: sx / sw, y: sy / sw } : { x: w / 2, y: bottom };
}

/** High-quality downscale by repeated halving, then a final step to the exact size. */
function downscale(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  let cur = src;
  while (cur.width / 2 >= w * 1.5 && cur.height / 2 >= h * 1.5) {
    const half = document.createElement('canvas');
    half.width = Math.round(cur.width / 2);
    half.height = Math.round(cur.height / 2);
    const ctx = half.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cur, 0, 0, half.width, half.height);
    cur = half;
  }
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, 0, 0, w, h);
  return out;
}

export function buildCharacterAtlas(image: CanvasImageSource, srcW: number, srcH: number, layout: CharacterSheetLayout): CharacterAtlas {
  const full = document.createElement('canvas');
  full.width = srcW; full.height = srcH;
  const fctx = full.getContext('2d', { willReadFrequently: true })!;
  fctx.drawImage(image, 0, 0);

  const cw = srcW / layout.cols;
  const ch = srcH / layout.rows;
  const bounds = (col: number, row: number) => {
    const x0 = Math.round(col * cw), x1 = Math.round((col + 1) * cw);
    const y0 = Math.round(row * ch), y1 = Math.round((row + 1) * ch);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };

  const usedRows = new Set(Object.values(layout.animations).flat());
  const cleaned = new Map<string, ImageData>();
  for (const row of usedRows) {
    for (const col of layout.directions) {
      const b = bounds(col, row);
      const img = fctx.getImageData(b.x, b.y, b.w, b.h);
      dropBleed(img);
      cleaned.set(`${col}:${row}`, img);
    }
  }

  // Anchor each direction on its first animation frame's ground point.
  const firstRow = Object.values(layout.animations)[0][0];
  const anchors = layout.directions.map((col) => groundPoint(cleaned.get(`${col}:${firstRow}`)!));
  const groundSrcY = anchors.reduce((s, a) => s + a.y, 0) / anchors.length;

  const scale = layout.cellHeight / ch;
  const cellH = layout.cellHeight;
  const cellW = Math.round(cw * scale);
  const padW = Math.ceil(cw) + 2;
  const padH = Math.ceil(ch);

  const scratch = document.createElement('canvas');
  scratch.width = padW; scratch.height = padH;
  const sctx = scratch.getContext('2d')!;
  const tmp = document.createElement('canvas');
  const tctx = tmp.getContext('2d')!;

  const sheets: Record<string, HTMLCanvasElement> = {};
  for (const [name, rows] of Object.entries(layout.animations)) {
    const atlas = document.createElement('canvas');
    atlas.width = cellW * rows.length;
    atlas.height = cellH * layout.directions.length;
    const actx = atlas.getContext('2d')!;
    rows.forEach((row, frame) => {
      layout.directions.forEach((col, dir) => {
        const img = cleaned.get(`${col}:${row}`)!;
        tmp.width = img.width; tmp.height = img.height;
        tctx.putImageData(img, 0, 0);
        // Shift so this direction's ground point lands on the cell's horizontal centre.
        sctx.clearRect(0, 0, padW, padH);
        sctx.drawImage(tmp, Math.round(padW / 2 - anchors[dir].x), 0);
        const small = downscale(scratch, Math.round(padW * scale), cellH);
        actx.drawImage(small, frame * cellW + Math.round((cellW - small.width) / 2), dir * cellH);
      });
    });
    sheets[name] = atlas;
  }

  return { sheets, cellW, cellH, groundY: groundSrcY * scale };
}

/** Isolates bright magic pixels (yellow/white) from a region and scales it to `height`. */
export function extractGlow(image: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  const img = ctx.getImageData(0, 0, sw, sh);
  const d = img.data;
  let x0 = sw, y0 = sh, x1 = -1, y1 = -1;
  for (let i = 0; i < sw * sh; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], a = d[i * 4 + 3];
    const yellow = r > 200 && g > 185 && b < 160;
    const white = r > 225 && g > 215 && b > 170;
    if (a > 40 && (yellow || white)) {
      const x = i % sw, y = (i - x) / sw;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    } else {
      d[i * 4 + 3] = 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (x1 < 0) return c;
  const trimmed = document.createElement('canvas');
  trimmed.width = x1 - x0 + 1; trimmed.height = y1 - y0 + 1;
  trimmed.getContext('2d')!.drawImage(c, -x0, -y0);
  return downscale(trimmed, Math.max(1, Math.round(trimmed.width * height / trimmed.height)), height);
}
