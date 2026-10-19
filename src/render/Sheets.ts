import { Texture, Rectangle } from 'pixi.js';
import { getTexture } from '../assets/AssetLoader';

export type SheetInfo = {
  frameWidth: number;
  frameHeight: number;
  /** Optional sub-rect within each frame to crop to (strips transparent padding). */
  trim?: { x: number; y: number; w: number; h: number };
};

// Characters are tiny pixel art centred in large transparent 100×100 frames.
// These trims crop to the content (shared across every animation of a character),
// kept horizontally centred on the character so left/right flipping stays symmetric.
const SOLDIER_TRIM = { x: 33, y: 27, w: 46, h: 35 };
const ORC_TRIM     = { x: 31, y: 30, w: 46, h: 38 };

const SHEETS: Record<string, SheetInfo> = {
  // ── Real-asset sprite sheets (loaded from /public) ──────────────────────────
  // Characters: single-row strips, 100×100 per frame, facing right (cropped via trim)
  soldier_walk:       { frameWidth: 100, frameHeight: 100, trim: SOLDIER_TRIM },  // 8 frames
  soldier_idle:       { frameWidth: 100, frameHeight: 100, trim: SOLDIER_TRIM },  // 6 frames
  soldier_atk1:       { frameWidth: 100, frameHeight: 100, trim: SOLDIER_TRIM },  // 6 frames
  soldier_atk2:       { frameWidth: 100, frameHeight: 100, trim: SOLDIER_TRIM },  // 6 frames
  soldier_atk3:       { frameWidth: 100, frameHeight: 100, trim: SOLDIER_TRIM },  // 9 frames
  soldier_death:      { frameWidth: 100, frameHeight: 100, trim: SOLDIER_TRIM },  // 4 frames
  soldier_hurt:       { frameWidth: 100, frameHeight: 100, trim: SOLDIER_TRIM },  // 4 frames
  orc_walk:           { frameWidth: 100, frameHeight: 100, trim: ORC_TRIM },
  orc_idle:           { frameWidth: 100, frameHeight: 100, trim: ORC_TRIM },
  orc_atk1:           { frameWidth: 100, frameHeight: 100, trim: ORC_TRIM },
  orc_atk2:           { frameWidth: 100, frameHeight: 100, trim: ORC_TRIM },
  orc_death:          { frameWidth: 100, frameHeight: 100, trim: ORC_TRIM },
  orc_hurt:           { frameWidth: 100, frameHeight: 100, trim: ORC_TRIM },

  // Tileset (16×16 base tile, used via tilesetRect())
  tileset:            { frameWidth: 16, frameHeight: 16 },

  // HUD panel bars: 101 rows of 100×6, row 0 = full, row 100 = empty
  panel_healthbar:    { frameWidth: 100, frameHeight: 6 },
  panel_xpbar:        { frameWidth: 100, frameHeight: 6 },

  // Torch animation — 4 frames composited into one 64×16 strip
  torch:              { frameWidth: 16, frameHeight: 16 },

  // Decorative props (baked from decorative.png)
  decor_pot1:         { frameWidth: 16, frameHeight: 16 },
  decor_pot2:         { frameWidth: 16, frameHeight: 16 },

  // ── Procedural UI / FX sheets ───────────────────────────────────────────────
  pickup_coin_16:     { frameWidth: 8,   frameHeight: 8   },
  pickup_potion:      { frameWidth: 12,  frameHeight: 16  },
  pickup_gem:         { frameWidth: 12,  frameHeight: 12  },
  spawner:            { frameWidth: 32,  frameHeight: 40  },
  chest:              { frameWidth: 32,  frameHeight: 32  },
  exit_button:        { frameWidth: 32,  frameHeight: 32  },
  fx_sword_swing:     { frameWidth: 48,  frameHeight: 48  },
  fx_death:           { frameWidth: 48,  frameHeight: 48  },
  fx_dust:            { frameWidth: 16,  frameHeight: 16  },
  dark:               { frameWidth: 32,  frameHeight: 32  },
  bar_green:          { frameWidth: 32,  frameHeight: 4   },
  bar_green_underlay: { frameWidth: 32,  frameHeight: 4   },
  bar_outline:        { frameWidth: 32,  frameHeight: 4   },
  sprint_bar:         { frameWidth: 32,  frameHeight: 4   },
  font_default:       { frameWidth: 8,   frameHeight: 8   },
  button:             { frameWidth: 128, frameHeight: 24  },
};

const cache = new Map<string, Texture>();

export function sheetInfo(key: string): SheetInfo {
  return SHEETS[key] ?? { frameWidth: 32, frameHeight: 32 };
}

export function sheetCols(key: string): number {
  const base = getTexture(key);
  return Math.max(1, Math.floor(base.width / sheetInfo(key).frameWidth));
}

export function sheetRows(key: string): number {
  const base = getTexture(key);
  return Math.max(1, Math.floor(base.height / sheetInfo(key).frameHeight));
}

export function frameTexture(key: string, col: number, row: number): Texture {
  const id = `${key}:${col}:${row}`;
  const hit = cache.get(id);
  if (hit) return hit;

  const base = getTexture(key);
  if (!base.source || base.width === 0) return Texture.EMPTY;

  const { frameWidth, frameHeight, trim } = sheetInfo(key);
  const maxCol = Math.max(0, Math.floor(base.width / frameWidth) - 1);
  const maxRow = Math.max(0, Math.floor(base.height / frameHeight) - 1);
  const c = Math.min(Math.max(col, 0), maxCol);
  const r = Math.min(Math.max(row, 0), maxRow);

  const fx = c * frameWidth + (trim?.x ?? 0);
  const fy = r * frameHeight + (trim?.y ?? 0);
  const fw = trim?.w ?? frameWidth;
  const fh = trim?.h ?? frameHeight;

  const tex = new Texture({
    source: base.source,
    frame: new Rectangle(fx, fy, fw, fh),
  });
  cache.set(id, tex);
  return tex;
}

/** Build a Texture that crops a W×H pixel region at (px, py) from the tileset. */
export function tilesetRect(px: number, py: number, w: number, h: number): Texture {
  const id = `tileset:${px}:${py}:${w}:${h}`;
  const hit = cache.get(id);
  if (hit) return hit;
  const base = getTexture('tileset');
  if (!base.source || base.width === 0) return Texture.EMPTY;
  const tex = new Texture({ source: base.source, frame: new Rectangle(px, py, w, h) });
  cache.set(id, tex);
  return tex;
}

const whiteSheets = new Map<string, Texture>();
const whiteFrames = new Map<string, Texture>();

function whiteSheet(key: string): Texture | null {
  const hit = whiteSheets.get(key);
  if (hit) return hit;
  const base = getTexture(key);
  const resource = base.source?.resource as CanvasImageSource | undefined;
  if (!resource || base.width === 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = base.source.pixelWidth;
  canvas.height = base.source.pixelHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(resource, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const tex = Texture.from(canvas);
  whiteSheets.set(key, tex);
  return tex;
}

export function whiteFrame(key: string, frame: Rectangle): Texture {
  const id = `${key}:${frame.x}:${frame.y}:${frame.width}:${frame.height}`;
  const hit = whiteFrames.get(id);
  if (hit) return hit;
  const sheet = whiteSheet(key);
  if (!sheet) return Texture.EMPTY;
  const tex = new Texture({ source: sheet.source, frame: new Rectangle(frame.x, frame.y, frame.width, frame.height) });
  whiteFrames.set(id, tex);
  return tex;
}

export function whiteFrameTexture(key: string, col: number, row: number): Texture {
  const base = frameTexture(key, col, row);
  return base === Texture.EMPTY ? Texture.EMPTY : whiteFrame(key, base.frame);
}
