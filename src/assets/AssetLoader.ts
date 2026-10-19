import { Assets, Texture } from 'pixi.js';
import { buildCharacterAtlas, extractGlow } from './CharacterSheet';
import type { CharacterSheetLayout } from './CharacterSheet';
import { registerSheet } from '../render/Sheets';
import {
  genCoinSheet, genPotionSheet, genGemSheet,
  genSpawnerSheet, genChestSheet, genExitButtonSheet,
  genSwordSwingSheet, genDeathFxSheet, genDustSheet,
  genDarkSheet,
  genFontSheet, genButtonSheet, genPanelBg, genPortrait, genMinimapIcons,
} from './SpriteGen';

const textures = new Map<string, Texture>();

function fromCanvas(canvas: HTMLCanvasElement): Texture {
  return Texture.from(canvas);
}

// ── PNG assets loaded from /public ───────────────────────────────────────────

const PNG_ASSETS = [
  // Tileset
  { alias: 'tileset',       src: '/catacombs/mainlevbuild.png' },

  // Orc (enemy) — 100×100/frame, single row facing right
  { alias: 'orc_walk',  src: '/Orc/Orc/Orc_Walk.png'    },
  { alias: 'orc_idle',  src: '/Orc/Orc/Orc_Idle.png'    },
  { alias: 'orc_atk1',  src: '/Orc/Orc/Orc_Attack01.png' },
  { alias: 'orc_atk2',  src: '/Orc/Orc/Orc_Attack02.png' },
  { alias: 'orc_death', src: '/Orc/Orc/Orc_Death.png'   },
  { alias: 'orc_hurt',  src: '/Orc/Orc/Orc_Hurt.png'    },

  // Torch frames (16×16 each) — composited into a single 'torch' strip below
  { alias: 'torch_1', src: '/catacombs/torch_1.png' },
  { alias: 'torch_2', src: '/catacombs/torch_2.png' },
  { alias: 'torch_3', src: '/catacombs/torch_3.png' },
  { alias: 'torch_4', src: '/catacombs/torch_4.png' },

  // Decorative objects (props)
  { alias: 'decorative', src: '/catacombs/decorative.png' },

  // Bars (from Catacomb Snatch): world bars are 21 steps of 32×4,
  // HUD panel bars are 101 steps of 100×6 (step 0 = full).
  { alias: 'bar_green',          src: '/ui/bar_green.png' },
  { alias: 'bar_green_underlay', src: '/ui/bar_green_underlay.png' },
  { alias: 'bar_outline',        src: '/ui/bar_outline.png' },
  { alias: 'sprint_bar',         src: '/ui/sprint_bar.png' },
  { alias: 'panel_healthbar',    src: '/ui/panel_healthbar.png' },
  { alias: 'panel_xpbar',        src: '/ui/panel_xpbar.png' },
];

// ── Player character sheet ───────────────────────────────────────────────────
// test-character-1.png: 5 direction columns × 16 frame rows. Columns 0–3 are
// S, SE, E, N; column 4 flips between back and side views from frame to frame,
// so it's skipped (up-diagonals use the back view). West is mirrored east.
const HERO_SRC = '/test-character-1.png';
const HERO_LAYOUT: CharacterSheetLayout = {
  cols: 5,
  directions: [0, 1, 2, 3],
  rows: 16,
  animations: {
    idle:  [0, 1],   /* CCC */
    walk:  [1, 2, 3, 4],
    sword: [5, 6, 7, 8],
    cast:  [11, 12, 13, 14, 15],
  },
  cellHeight: 58,
};
/** The glowing orb in the south-east cast frame (row 14), used as the spell bolt. */
const HERO_BOLT_RECT = { x: 346, y: 3672, w: 62, h: 72 };

/** Ground point inside a hero cell, filled in once the atlas is built. */
export const heroMeta = { cellW: 0, cellH: 0, groundY: 0 };

async function loadHero(): Promise<void> {
  const src = await Assets.load<Texture>(HERO_SRC);
  const image = src.source.resource as CanvasImageSource;
  const atlas = buildCharacterAtlas(image, src.width, src.height, HERO_LAYOUT);
  for (const [name, canvas] of Object.entries(atlas.sheets)) {
    const key = `hero_${name}`;
    const tex = Texture.from(canvas);
    tex.source.scaleMode = 'nearest';
    textures.set(key, tex);
    registerSheet(key, { frameWidth: atlas.cellW, frameHeight: atlas.cellH });
  }
  Object.assign(heroMeta, { cellW: atlas.cellW, cellH: atlas.cellH, groundY: atlas.groundY });

  const b = HERO_BOLT_RECT;
  const bolt = Texture.from(extractGlow(image, b.x, b.y, b.w, b.h, 16));
  textures.set('spell_bolt', bolt);
  registerSheet('spell_bolt', { frameWidth: bolt.width, frameHeight: bolt.height });

  // The source is taller than some GPUs' texture limit and only needed for slicing.
  await Assets.unload(HERO_SRC);
}

/** Crop a pixel region from a loaded texture's image into its own nearest-filtered Texture. */
function cropTexture(src: Texture, sx: number, sy: number, sw: number, sh: number): Texture {
  const res = src.source.resource as CanvasImageSource;
  const c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  c.getContext('2d')!.drawImage(res, sx, sy, sw, sh, 0, 0, sw, sh);
  const tex = Texture.from(c);
  tex.source.scaleMode = 'nearest';
  return tex;
}

export async function loadAllAssets(_onProgress?: (f: number) => void): Promise<void> {
  // Load all PNGs
  await Assets.load(PNG_ASSETS);
  for (const { alias } of PNG_ASSETS) {
    const tex = Assets.get(alias) as Texture;
    tex.source.scaleMode = 'nearest';
    textures.set(alias, tex);
  }
  await loadHero();

  // Decorative props from decorative.png (clay pots)
  const decor = textures.get('decorative')!;
  textures.set('decor_pot1', cropTexture(decor, 144, 128, 16, 16));
  textures.set('decor_pot2', cropTexture(decor, 144, 176, 16, 16));

  // Composite the four 16×16 torch frames into one 64×16 animation strip
  const torchCanvas = document.createElement('canvas');
  torchCanvas.width = 64; torchCanvas.height = 16;
  const tctx = torchCanvas.getContext('2d')!;
  for (let i = 0; i < 4; i++) {
    const frame = textures.get(`torch_${i + 1}`)!;
    tctx.drawImage(frame.source.resource as CanvasImageSource, i * 16, 0);
  }
  const torchTex = Texture.from(torchCanvas);
  torchTex.source.scaleMode = 'nearest';
  textures.set('torch', torchTex);

  // Procedural UI/FX textures
  const proc: Record<string, () => HTMLCanvasElement> = {
    pickup_coin_16:     genCoinSheet,
    pickup_potion:      genPotionSheet,
    pickup_gem:         genGemSheet,
    spawner:            genSpawnerSheet,
    chest:              genChestSheet,
    exit_button:        genExitButtonSheet,
    fx_sword_swing:     genSwordSwingSheet,
    fx_death:           genDeathFxSheet,
    fx_dust:            genDustSheet,
    dark:               genDarkSheet,
    font_default:       genFontSheet,
    button:             genButtonSheet,
    portrait:           genPortrait,
    mapicons:           genMinimapIcons,
  };

  for (const [key, fn] of Object.entries(proc)) {
    textures.set(key, fromCanvas(fn()));
  }

  textures.set('panel_hud', fromCanvas(genPanelBg(512, 80)));
  textures.set('panel_inv', fromCanvas(genPanelBg(320, 240)));

  _onProgress?.(1);
}

export function getTexture(key: string): Texture {
  return textures.get(key) ?? Texture.EMPTY;
}
