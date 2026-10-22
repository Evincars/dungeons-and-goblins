import { Texture, Rectangle } from 'pixi.js';
import { getTexture } from '../assets/Textures';
import { context2d, createCanvas, imageOf } from './canvas';

export type SheetInfo = {
  frameWidth: number;
  frameHeight: number;
  /** Optional sub-rect within each frame to crop to (strips transparent padding). */
  trim?: { x: number; y: number; w: number; h: number };
};

const SHEETS: Record<string, SheetInfo> = {
  // Images loaded from /public declare their frames on their SpriteSheet (see assets/SheetCatalog.ts);
  // character strips come from their CharacterDef. Only art built at load time is listed here.

  // Torch animation — 4 frames composited into one 64×16 strip
  torch:              { frameWidth: 16, frameHeight: 16 },
  // Campfire — stones and logs under torch flames, 4 frames of 24×24
  campfire:           { frameWidth: 24, frameHeight: 24 },

  // ── Procedural UI / FX sheets ───────────────────────────────────────────────
  spell_bolt:         { frameWidth: 16,  frameHeight: 16  },
  spawner:            { frameWidth: 32,  frameHeight: 40  },
  exit_button:        { frameWidth: 32,  frameHeight: 32  },
  fx_sword_swing:     { frameWidth: 48,  frameHeight: 48  },
  fx_death:           { frameWidth: 48,  frameHeight: 48  },
  dark:               { frameWidth: 32,  frameHeight: 32  },
  icon_boots:         { frameWidth: 12,  frameHeight: 12  },
  icon_ring:          { frameWidth: 10,  frameHeight: 10  },
};

const DEFAULT_SHEET: SheetInfo = { frameWidth: 32, frameHeight: 32 };

/** Frame textures by sheet, indexed `row * cols + col`, made on first use; lookups allocate nothing. */
const frames = new Map<string, Array<Texture | undefined>>();
const rects = new Map<string, Texture>();

/** Registers a sheet whose frame size is only known at load time (e.g. built atlases). */
export function registerSheet(key: string, info: SheetInfo): void {
  SHEETS[key] = info;
  frames.delete(key);
}

export function sheetInfo(key: string): SheetInfo {
  return SHEETS[key] ?? DEFAULT_SHEET;
}

export function sheetCols(key: string): number {
  return Math.max(1, Math.floor(getTexture(key).width / sheetInfo(key).frameWidth));
}

export function sheetRows(key: string): number {
  return Math.max(1, Math.floor(getTexture(key).height / sheetInfo(key).frameHeight));
}

function makeFrame(key: string, col: number, row: number): Texture {
  const base = getTexture(key);
  const { frameWidth, frameHeight, trim } = sheetInfo(key);
  // A sheet can be a region of a larger image, so frames count from the region's corner.
  const fx = base.frame.x + col * frameWidth + (trim?.x ?? 0);
  const fy = base.frame.y + row * frameHeight + (trim?.y ?? 0);
  return new Texture({ source: base.source, frame: new Rectangle(fx, fy, trim?.w ?? frameWidth, trim?.h ?? frameHeight) });
}

export function frameTexture(key: string, col: number, row: number): Texture {
  const base = getTexture(key);
  if (!base.source || base.width === 0) return Texture.EMPTY;
  const cols = sheetCols(key);
  const c = Math.min(Math.max(col, 0), cols - 1);
  const r = Math.min(Math.max(row, 0), sheetRows(key) - 1);
  let sheet = frames.get(key);
  if (!sheet) {
    sheet = [];
    frames.set(key, sheet);
  }
  const i = r * cols + c;
  return sheet[i] ?? (sheet[i] = makeFrame(key, c, r));
}

/** Build a Texture that crops a W×H pixel region at (px, py) from a terrain tileset (terrain building only). */
export function tilesetRect(px: number, py: number, w: number, h: number, sheet = 'tileset'): Texture {
  const id = `${sheet}:${px}:${py}:${w}:${h}`;
  const hit = rects.get(id);
  if (hit) return hit;
  const base = getTexture(sheet);
  if (!base.source || base.width === 0) return Texture.EMPTY;
  const tex = new Texture({ source: base.source, frame: new Rectangle(px, py, w, h) });
  rects.set(id, tex);
  return tex;
}

const whiteSheets = new Map<string, Texture>();
/** White silhouettes keyed by the frame texture they copy (frame textures are cached, so each has one). */
const whiteFrames = new WeakMap<Texture, Texture>();

/** The whole sheet as a white silhouette, for hurt and flash overlays. */
function whiteSheet(key: string): Texture | null {
  const hit = whiteSheets.get(key);
  if (hit) return hit;
  const base = getTexture(key);
  const image = imageOf(base);
  if (!image || base.width === 0) return null;
  const canvas = createCanvas(base.source.pixelWidth, base.source.pixelHeight);
  const ctx = context2d(canvas);
  ctx.drawImage(image, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const tex = Texture.from(canvas);
  whiteSheets.set(key, tex);
  return tex;
}

/** A white silhouette of the given frame of a sheet. */
export function whiteFrame(key: string, frame: Texture): Texture {
  const hit = whiteFrames.get(frame);
  if (hit) return hit;
  const sheet = whiteSheet(key);
  if (!sheet) return Texture.EMPTY;
  const f = frame.frame;
  const tex = new Texture({ source: sheet.source, frame: new Rectangle(f.x, f.y, f.width, f.height) });
  whiteFrames.set(frame, tex);
  return tex;
}

export function whiteFrameTexture(key: string, col: number, row: number): Texture {
  const base = frameTexture(key, col, row);
  return base === Texture.EMPTY ? Texture.EMPTY : whiteFrame(key, base);
}
