import { Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import { CLASSES, HERO_CLASSES } from '../rules/Classes';
import type { HeroClassId } from '../rules/Classes';
import { characterDef, clipAnchorX, clipAnchorY, clipFrameTexture, clipFrames, clipSheetKey } from '../characters/Characters';
import type { CharacterDef } from '../characters/CharacterDef';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

/** The portraits: this big, this far apart; each hero drawn this tall inside. */
const THUMB = 34;
const THUMB_GAP = 6;
const THUMB_H_SHOWN = 26;
const PANEL_ALPHA = 0.9;
const HOVER_ALPHA = 0.1;
/** The names of the players who took a hero sit over its portrait, this far up a line. */
const NAME_LINE = 8;
const NAME_SCALE = 0.75;
/** A name longer than this is cut short over its portrait, so it doesn't run into the next one (the room's list has it whole). */
const NAME_CHARS = 7;

const shortName = (name: string): string => (name.length > NAME_CHARS ? `${name.slice(0, NAME_CHARS - 1)}.` : name);

/** A sprite showing a character's idle, stood with its feet at (x, feetY) and `height` tall. */
export type Preview = { sprite: Sprite; def: CharacterDef };

export function makePreview(def: CharacterDef, x: number, feetY: number, height: number): Preview {
  const sprite = new Sprite();
  sprite.scale.set(height / Math.max(1, def.feetY - def.headY));
  sprite.position.set(Math.round(x), Math.round(feetY - (def.feetY - (def.trim?.h ?? def.frameHeight) / 2) * sprite.scale.y));
  return { sprite, def };
}

/** Shows the idle frame for `tick`. */
export function animatePreview(preview: Preview, tick: number): void {
  const name = preview.def.states.idle;
  const clip = preview.def.clips[name];
  const sheet = clipSheetKey(preview.def, name);
  const frame = Math.floor(tick / clip.frameTime) % clipFrames(clip, sheet);
  preview.sprite.texture = clipFrameTexture(clip, sheet, frame, 0);
  preview.sprite.anchor.set(clipAnchorX(preview.def, clip), clipAnchorY(preview.def, clip));
}

type Thumb = { id: HeroClassId; frame: Graphics; preview: Preview; names: PixelLabel };

/**
 * A row of every hero's portrait, idling; the one picked is framed in gold, a click picks another. In the
 * co-op lobby the names of the players who took a hero show above it — any hero can still be picked (two
 * players may play the same one).
 */
export class HeroPicker {
  readonly view = new Container();
  /** How wide the row is. */
  static readonly width = HERO_CLASSES.length * THUMB + (HERO_CLASSES.length - 1) * THUMB_GAP;
  onPick: ((id: HeroClassId) => void) | null = null;
  private readonly thumbs: Thumb[] = [];
  private chosen: HeroClassId;

  /** (`x`, `y`): the row's top-left corner. */
  constructor(x: number, y: number, picked: HeroClassId) {
    this.chosen = picked;
    this.view.position.set(x, y);
    HERO_CLASSES.forEach((id, i) => this.addThumb(id, i));
  }

  private addThumb(id: HeroClassId, i: number): void {
    const box = new Container();
    box.position.set(i * (THUMB + THUMB_GAP), 0);
    const frame = new Graphics();
    const preview = makePreview(characterDef(CLASSES[id].character), THUMB / 2, THUMB - 3, THUMB_H_SHOWN);
    const hover = new Graphics().rect(0, 0, THUMB, THUMB).fill({ color: 0xffffff, alpha: HOVER_ALPHA });
    hover.visible = false;
    const names = new PixelLabel('', { color: THEME.title, scale: NAME_SCALE, align: 'center', outline: true });
    names.position.set(THUMB / 2, 0);
    box.addChild(frame, preview.sprite, hover, names);
    box.eventMode = 'static';
    box.cursor = 'pointer';
    box.hitArea = new Rectangle(0, 0, THUMB, THUMB);
    box.on('pointerover', () => { hover.visible = true; });
    box.on('pointerout', () => { hover.visible = false; });
    box.on('pointertap', () => this.onPick?.(id));
    this.view.addChild(box);
    const thumb = { id, frame, preview, names };
    this.thumbs.push(thumb);
    this.drawThumb(thumb);
  }

  private drawThumb(thumb: Thumb): void {
    const picked = thumb.id === this.chosen;
    thumb.frame.clear().rect(0, 0, THUMB, THUMB).fill({ color: THEME.panel, alpha: PANEL_ALPHA })
      .stroke({ color: picked ? THEME.title : THEME.panelBorder, width: picked ? 2 : 1, alignment: 1 });
  }

  set picked(id: HeroClassId) {
    this.chosen = id;
    for (const thumb of this.thumbs) this.drawThumb(thumb);
  }

  /** The players on each hero, written over its portrait (one name a line, the lowest just above it). */
  setTakers(takers: ReadonlyMap<HeroClassId, readonly string[]>): void {
    for (const thumb of this.thumbs) {
      const names = takers.get(thumb.id) ?? [];
      thumb.names.text = names.map(shortName).join('\n');
      thumb.names.y = -NAME_LINE * names.length - 1;
    }
  }

  update(tick: number): void {
    for (const thumb of this.thumbs) animatePreview(thumb.preview, tick);
  }
}
