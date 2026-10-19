import { Assets, Texture } from 'pixi.js';
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

  // Soldier (player) — 100×100/frame, single row facing right
  { alias: 'soldier_walk',  src: '/Soldier/Soldier/Soldier_Walk.png'    },
  { alias: 'soldier_idle',  src: '/Soldier/Soldier/Soldier_Idle.png'    },
  { alias: 'soldier_atk1',  src: '/Soldier/Soldier/Soldier_Attack01.png' },
  { alias: 'soldier_atk2',  src: '/Soldier/Soldier/Soldier_Attack02.png' },
  { alias: 'soldier_atk3',  src: '/Soldier/Soldier/Soldier_Attack03.png' },
  { alias: 'soldier_death', src: '/Soldier/Soldier/Soldier_Death.png'   },
  { alias: 'soldier_hurt',  src: '/Soldier/Soldier/Soldier_Hurt.png'    },

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
