import { Assets, Texture } from 'pixi.js';
import { registerSheet } from '../render/Sheets';
import { context2d, createCanvas, imageOf } from '../render/canvas';
import { characterAssets, registerCharacterSheets } from '../characters/Characters';
import { PROPS } from '../level/Props';
import { LoadError } from '../core/errors';
import { getTexture, hasTexture, setTexture } from './Textures';
import {
  genCoinSheet, genPotionSheet, genGemSheet, genSpellBoltSheet,
  genSpawnerSheet, genChestSheet, genExitButtonSheet,
  genSwordSwingSheet, genDeathFxSheet, genDustSheet,
  genDarkSheet,
  genFontSheet, genButtonSheet, genPanelBg, genPortrait, genMinimapIcons,
} from './SpriteGen';

/** The torch animation is four separate 16×16 images, composited into one strip. */
const TORCH_FRAMES = 4;
const TORCH_FRAME_SIZE = 16;
/** Sizes of the generated HUD and inventory panel backgrounds. */
const HUD_PANEL = { w: 512, h: 80 };
const INVENTORY_PANEL = { w: 320, h: 240 };

// ── PNG assets loaded from /public ───────────────────────────────────────────

const PNG_ASSETS = [
  // Tileset
  { alias: 'tileset',       src: '/catacombs/mainlevbuild.png' },

  // Character strips (fighter, orc, …) come from their CharacterDefs
  ...characterAssets(),

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

/** Procedural UI/FX textures, drawn on canvases at load time. */
const PROCEDURAL: Record<string, () => HTMLCanvasElement> = {
  pickup_coin_16:     genCoinSheet,
  pickup_potion:      genPotionSheet,
  pickup_gem:         genGemSheet,
  spell_bolt:         genSpellBoltSheet,
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

function nearest(texture: Texture): Texture {
  texture.source.scaleMode = 'nearest';
  return texture;
}

/** A loaded image as a drawable source; missing art is a load failure, not something to draw around. */
function imageFor(alias: string): CanvasImageSource {
  const image = hasTexture(alias) ? imageOf(getTexture(alias)) : null;
  if (!image) throw new LoadError(`Image "${alias}" did not load`, { context: { alias } });
  return image;
}

/** Crop a pixel region from a loaded image into its own nearest-filtered Texture. */
function cropTexture(alias: string, sx: number, sy: number, sw: number, sh: number): Texture {
  const canvas = createCanvas(sw, sh);
  context2d(canvas).drawImage(imageFor(alias), sx, sy, sw, sh, 0, 0, sw, sh);
  return nearest(Texture.from(canvas));
}

async function loadImages(): Promise<void> {
  try {
    await Assets.load(PNG_ASSETS);
  } catch (cause) {
    throw new LoadError('Could not load the game art', { cause });
  }
  for (const { alias } of PNG_ASSETS) setTexture(alias, nearest(Assets.get<Texture>(alias)));
}

/** Props from decorative.png, each cut to its exact sprite bounds. */
function cutProps(): void {
  for (const [kind, def] of Object.entries(PROPS)) {
    const { x, y, w, h } = def.rect;
    setTexture(`prop_${kind}`, cropTexture('decorative', x, y, w, h));
    registerSheet(`prop_${kind}`, { frameWidth: w, frameHeight: h });
  }
}

/** Composite the four 16×16 torch frames into one 64×16 animation strip. */
function buildTorchStrip(): void {
  const canvas = createCanvas(TORCH_FRAMES * TORCH_FRAME_SIZE, TORCH_FRAME_SIZE);
  const ctx = context2d(canvas);
  for (let i = 0; i < TORCH_FRAMES; i++) ctx.drawImage(imageFor(`torch_${i + 1}`), i * TORCH_FRAME_SIZE, 0);
  setTexture('torch', nearest(Texture.from(canvas)));
}

export async function loadAllAssets(onProgress?: (fraction: number) => void): Promise<void> {
  await loadImages();
  registerCharacterSheets();
  cutProps();
  buildTorchStrip();
  for (const [key, draw] of Object.entries(PROCEDURAL)) setTexture(key, Texture.from(draw()));
  setTexture('panel_hud', Texture.from(genPanelBg(HUD_PANEL.w, HUD_PANEL.h)));
  setTexture('panel_inv', Texture.from(genPanelBg(INVENTORY_PANEL.w, INVENTORY_PANEL.h)));
  onProgress?.(1);
}

export { getTexture };
