import { Texture, Rectangle } from 'pixi.js';
import { getTexture } from '../assets/AssetLoader';

export type SheetInfo = { frameWidth: number; frameHeight: number };

const SHEETS: Record<string, SheetInfo> = {
  floortiles:         { frameWidth: 32,  frameHeight: 32  },
  walltiles:          { frameWidth: 32,  frameHeight: 56  },
  breakwalls:         { frameWidth: 32,  frameHeight: 56  },
  dark:               { frameWidth: 32,  frameHeight: 32  },
  fighter_sheet:      { frameWidth: 32,  frameHeight: 32  },
  enemy_goblin_32:    { frameWidth: 32,  frameHeight: 32  },
  enemy_skeleton_32:  { frameWidth: 32,  frameHeight: 32  },
  enemy_orc_32:       { frameWidth: 32,  frameHeight: 32  },
  enemy_troll_48:     { frameWidth: 48,  frameHeight: 48  },
  torch_sheet:        { frameWidth: 16,  frameHeight: 32  },
  pickup_coin_16:     { frameWidth: 8,   frameHeight: 8   },
  pickup_potion:      { frameWidth: 12,  frameHeight: 16  },
  pickup_gem:         { frameWidth: 12,  frameHeight: 12  },
  spawner:            { frameWidth: 32,  frameHeight: 40  },
  chest:              { frameWidth: 32,  frameHeight: 32  },
  fx_sword_swing:     { frameWidth: 48,  frameHeight: 48  },
  fx_death:           { frameWidth: 48,  frameHeight: 48  },
  fx_dust:            { frameWidth: 16,  frameHeight: 16  },
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
  const { frameWidth } = sheetInfo(key);
  return Math.max(1, Math.floor(base.width / frameWidth));
}

export function sheetRows(key: string): number {
  const base = getTexture(key);
  const { frameHeight } = sheetInfo(key);
  return Math.max(1, Math.floor(base.height / frameHeight));
}

export function frameTexture(key: string, col: number, row: number): Texture {
  const id = `${key}:${col}:${row}`;
  const hit = cache.get(id);
  if (hit) return hit;

  const base = getTexture(key);
  if (!base.source || base.width === 0) return Texture.EMPTY;

  const { frameWidth, frameHeight } = sheetInfo(key);
  const maxCol = Math.max(0, Math.floor(base.width / frameWidth) - 1);
  const maxRow = Math.max(0, Math.floor(base.height / frameHeight) - 1);
  const c = Math.min(Math.max(col, 0), maxCol);
  const r = Math.min(Math.max(row, 0), maxRow);

  const tex = new Texture({
    source: base.source,
    frame: new Rectangle(c * frameWidth, r * frameHeight, frameWidth, frameHeight),
  });
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
