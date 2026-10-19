import { Texture, Rectangle } from 'pixi.js';
import { getTexture } from '../assets/AssetLoader';

export type SheetInfo = {
  frameWidth: number;
  frameHeight: number;
  /** Optional sub-rect within each frame to crop to (strips transparent padding). */
  trim?: { x: number; y: number; w: number; h: number };
};

const SHEETS: Record<string, SheetInfo> = {
  // ── Real-asset sprite sheets (loaded from /public) ──────────────────────────
  // Character strips are registered from their CharacterDef (see characters/Characters.ts).

  // Tileset (16×16 base tile, used via tilesetRect())
  tileset:            { frameWidth: 16, frameHeight: 16 },

  // HUD panel bars: 101 rows of 100×6, row 0 = full, row 100 = empty
  panel_healthbar:    { frameWidth: 100, frameHeight: 6 },
  panel_xpbar:        { frameWidth: 100, frameHeight: 6 },

  // Torch animation — 4 frames composited into one 64×16 strip
  torch:              { frameWidth: 16, frameHeight: 16 },

  // ── Procedural UI / FX sheets ───────────────────────────────────────────────
  pickup_coin_16:     { frameWidth: 8,   frameHeight: 8   },
  pickup_potion:      { frameWidth: 12,  frameHeight: 16  },
  pickup_gem:         { frameWidth: 12,  frameHeight: 12  },
  spell_bolt:         { frameWidth: 16,  frameHeight: 16  },
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

/** Registers a sheet whose frame size is only known at load time (e.g. built atlases). */
export function registerSheet(key: string, info: SheetInfo): void {
  SHEETS[key] = info;
}

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
