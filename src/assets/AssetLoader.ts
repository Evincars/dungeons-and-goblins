import { Texture } from 'pixi.js';
import {
  genFloorTiles, genWallTiles, genBreakableWallTiles,
  genFighterSheet, genGoblinSheet, genSkeletonSheet, genOrcSheet, genTrollSheet,
  genTorchSheet, genCoinSheet, genPotionSheet, genGemSheet,
  genSpawnerSheet, genChestSheet,
  genSwordSwingSheet, genDeathFxSheet, genDustSheet,
  genBarSheet, genBarOverlay, genDarkSheet,
  genFontSheet, genButtonSheet, genPanelBg, genPortrait, genMinimapIcons,
} from './SpriteGen';

const textures = new Map<string, Texture>();

function fromCanvas(canvas: HTMLCanvasElement): Texture {
  return Texture.from(canvas);
}

export async function loadAllAssets(_onProgress?: (f: number) => void): Promise<void> {
  // Generate all textures from canvas
  const gen: Record<string, () => HTMLCanvasElement> = {
    floortiles:        genFloorTiles,
    walltiles:         genWallTiles,
    breakwalls:        genBreakableWallTiles,
    dark:              genDarkSheet,
    fighter_sheet:     genFighterSheet,
    enemy_goblin_32:   genGoblinSheet,
    enemy_skeleton_32: genSkeletonSheet,
    enemy_orc_32:      genOrcSheet,
    enemy_troll_48:    genTrollSheet,
    torch_sheet:       genTorchSheet,
    pickup_coin_16:    genCoinSheet,
    pickup_potion:     genPotionSheet,
    pickup_gem:        genGemSheet,
    spawner:           genSpawnerSheet,
    chest:             genChestSheet,
    fx_sword_swing:    genSwordSwingSheet,
    fx_death:          genDeathFxSheet,
    fx_dust:           genDustSheet,
    bar_green:         () => genBarSheet(0x40c030),
    bar_green_underlay:() => genBarSheet(0x204018),
    bar_outline:       genBarOverlay,
    sprint_bar:        () => genBarSheet(0x2040c0),
    font_default:      genFontSheet,
    button:            genButtonSheet,
    portrait:          genPortrait,
    mapicons:          genMinimapIcons,
  };

  for (const [key, fn] of Object.entries(gen)) {
    textures.set(key, fromCanvas(fn()));
  }

  // Panel backgrounds at various sizes
  textures.set('panel_hud', fromCanvas(genPanelBg(512, 80)));
  textures.set('panel_inv', fromCanvas(genPanelBg(320, 240)));

  _onProgress?.(1);
}

export function getTexture(key: string): Texture {
  return textures.get(key) ?? Texture.EMPTY;
}
