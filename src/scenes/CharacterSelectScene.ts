import { Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import { STAT_NAMES } from '../world';
import type { Scene, SceneManager, SceneName } from '../game/SceneManager';
import { settings, saveSettings } from '../game/Settings';
import { text } from '../core/texts';
import { CLASSES, HERO_CLASSES } from '../rules/Classes';
import type { HeroClass, HeroClassId } from '../rules/Classes';
import { abilityModifier } from '../rules/Abilities';
import { formatModifier } from '../rules/Dice';
import { classBlurb, className, featureDescription, featureName, trainingName } from '../rules/Names';
import { statShort } from '../entities/Items';
import { characterDef, clipAnchorX, clipAnchorY, clipSheetKey } from '../characters/Characters';
import type { CharacterDef } from '../characters/CharacterDef';
import { frameTexture, sheetCols } from '../render/Sheets';
import { GAME_HEIGHT, LAYOUT_LEFT, LAYOUT_WIDTH } from '../render/Camera';
import { menuBackdrop } from '../ui/MenuBackdrop';
import { PixelButton } from '../ui/PixelButton';
import { PixelLabel, makeTitle } from '../ui/PixelText';
import { wrapLines } from '../ui/InfoTooltip';
import { THEME } from '../ui/Theme';

/** Two cards side by side under the title, the buttons under them. */
const TITLE_Y = 22;
const CARD_TOP = 52;
const CARD_GAP = 12;
const CARD_H = 268;
const CARD_PAD = 8;
const BUTTON_W = 120;
const BUTTON_H = 24;
const BUTTON_GAP = 12;
/** The hero is drawn this tall (top of the head to the feet), standing this far below the card's top. */
const PREVIEW_H = 74;
const PREVIEW_FEET = 92;
const LINE_H = 10;
/** The card picked is framed in gold; the one under the pointer brightens. */
const PICKED_BORDER = 2;
const HOVER_ALPHA = 0.08;
const CARD_ALPHA = 0.9;

/** Where the hero goes once a class is picked: a lone game, or the co-op lobby to host or join. */
let destination: SceneName = 'in_game';

/** Opens the character select; Continue then goes on to `next`. */
export function chooseHeroThen(manager: SceneManager, next: SceneName): void {
  destination = next;
  manager.goto('character_select');
}

type Card = { id: HeroClassId; frame: Graphics; hover: Graphics; preview: Sprite; def: CharacterDef; w: number };

/** The lines under a class's name: hit die and hit points, abilities, training, saving throws and features. */
function cardLines(cls: HeroClass, width: number): Array<{ text: string; color: number }> {
  type Line = { text: string; color: number };
  const scores = STAT_NAMES.map((stat) => text('select.ability', {
    stat: statShort(stat), score: cls.abilities[stat], modifier: formatModifier(abilityModifier(cls.abilities[stat])),
  }));
  const lines: Line[] = [
    ...wrapLines(classBlurb(cls.id), width).map((line) => ({ text: line, color: THEME.muted })),
    { text: text('select.hit_points', { die: cls.hitDie, hp: cls.hitPoints }), color: THEME.hitPoints },
    { text: scores.slice(0, 3).join('  '), color: THEME.text },
    { text: scores.slice(3).join('  '), color: THEME.text },
    { text: text('select.armor', { list: cls.armor.map(trainingName).join(', ') }), color: THEME.armorClass },
    { text: text('select.weapons', { list: cls.weapons.map(trainingName).join(', ') }), color: THEME.damage },
    { text: text('select.saves', { list: cls.savingThrows.map(statShort).join(', ') }), color: THEME.text },
  ];
  for (const feature of cls.features) {
    lines.push({ text: featureName(feature), color: THEME.title });
    lines.push(...wrapLines(featureDescription(feature), width).map((line) => ({ text: line, color: THEME.text })));
  }
  return lines;
}

/**
 * Before a game: pick the hero's class (Barbarian or Warrior), each shown as a card with the hero idling and
 * what the class brings under the tabletop rules. The choice is remembered for next time.
 */
export class CharacterSelectScene implements Scene {
  readonly container = new Container();
  private readonly cards: Card[] = [];
  private picked: HeroClassId = settings.heroClass;
  private tick = 0;

  constructor(private readonly manager: SceneManager) {
    this.container.addChild(menuBackdrop());
    const title = makeTitle(text('select.title'));
    title.position.set(LAYOUT_LEFT + LAYOUT_WIDTH / 2, TITLE_Y);
    this.container.addChild(title);
    const cardW = Math.floor((LAYOUT_WIDTH - CARD_GAP * 3) / 2);
    HERO_CLASSES.forEach((id, i) => this.addCard(CLASSES[id], LAYOUT_LEFT + CARD_GAP + i * (cardW + CARD_GAP), cardW));
    this.addButtons();
    this.drawCards();
  }

  private addCard(cls: HeroClass, x: number, w: number): void {
    const card = new Container();
    card.position.set(x, CARD_TOP);
    const frame = new Graphics();
    const hover = new Graphics().rect(0, 0, w, CARD_H).fill({ color: 0xffffff, alpha: HOVER_ALPHA });
    hover.visible = false;
    const def = characterDef(cls.character);
    const preview = new Sprite();
    preview.scale.set(PREVIEW_H / Math.max(1, def.feetY - def.headY));
    preview.position.set(Math.round(w / 2), PREVIEW_FEET - (def.feetY - (def.trim?.h ?? def.frameHeight) / 2) * preview.scale.y);
    const name = new PixelLabel(className(cls.id), { color: THEME.title, scale: 2, align: 'center', shadow: true });
    name.position.set(Math.round(w / 2), PREVIEW_FEET + 6);
    card.addChild(frame, hover, preview, name);
    cardLines(cls, w - 2 * CARD_PAD).forEach((line, i) => {
      const label = new PixelLabel(line.text, { color: line.color, shadow: true });
      label.position.set(CARD_PAD, PREVIEW_FEET + 28 + i * LINE_H);
      card.addChild(label);
    });
    card.eventMode = 'static';
    card.cursor = 'pointer';
    card.hitArea = new Rectangle(0, 0, w, CARD_H);
    card.on('pointerover', () => { hover.visible = true; });
    card.on('pointerout', () => { hover.visible = false; });
    card.on('pointertap', () => this.pick(cls.id));
    this.container.addChild(card);
    this.cards.push({ id: cls.id, frame, hover, preview, def, w });
  }

  private addButtons(): void {
    const y = Math.min(GAME_HEIGHT - BUTTON_H - 8, CARD_TOP + CARD_H + 10);
    const centre = LAYOUT_LEFT + LAYOUT_WIDTH / 2;
    const back = new PixelButton(text('select.back'), BUTTON_W, BUTTON_H);
    back.position.set(Math.round(centre - BUTTON_W - BUTTON_GAP / 2), y);
    back.onPress = () => this.manager.goto('title');
    const go = new PixelButton(text('select.continue'), BUTTON_W, BUTTON_H);
    go.position.set(Math.round(centre + BUTTON_GAP / 2), y);
    go.onPress = () => this.confirm();
    this.container.addChild(back, go);
  }

  private pick(id: HeroClassId): void {
    this.picked = id;
    this.drawCards();
  }

  private confirm(): void {
    settings.heroClass = this.picked;
    saveSettings();
    this.manager.goto(destination);
  }

  /** The picked card is framed in gold, the other in steel. */
  private drawCards(): void {
    for (const card of this.cards) {
      const picked = card.id === this.picked;
      card.frame.clear()
        .rect(0, 0, card.w, CARD_H).fill({ color: THEME.panel, alpha: CARD_ALPHA })
        .stroke({ color: picked ? THEME.title : THEME.panelBorder, width: picked ? PICKED_BORDER : 1, alignment: 1 });
    }
  }

  /** Each hero idles on its card. */
  update(): void {
    this.tick++;
    for (const card of this.cards) {
      const clipName = card.def.states.idle;
      const clip = card.def.clips[clipName];
      const sheet = clipSheetKey(card.def, clipName);
      const frames = Math.max(1, sheetCols(sheet));
      card.preview.texture = frameTexture(sheet, Math.floor(this.tick / clip.frameTime) % frames, 0);
      card.preview.anchor.set(clipAnchorX(card.def, clip), clipAnchorY(card.def, clip));
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
