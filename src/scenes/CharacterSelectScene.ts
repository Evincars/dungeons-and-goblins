import { Container, Graphics } from 'pixi.js';
import { STAT_NAMES } from '../world';
import type { Scene, SceneManager, SceneName } from '../game/SceneManager';
import { settings, saveSettings } from '../game/Settings';
import { text } from '../core/texts';
import { CLASSES, HERO_CLASSES } from '../rules/Classes';
import type { HeroClass, HeroClassId } from '../rules/Classes';
import { abilityModifier } from '../rules/Abilities';
import { formatModifier } from '../rules/Dice';
import { featureDescription, featureName, heroBlurb, heroName, trainingName, weaponName } from '../rules/Names';
import { statName, statShort } from '../entities/Items';
import { characterDef } from '../characters/Characters';
import { LAYOUT_LEFT, LAYOUT_WIDTH } from '../render/Camera';
import { menuBackdrop } from '../ui/MenuBackdrop';
import { PixelButton } from '../ui/PixelButton';
import { PixelLabel, makeTitle } from '../ui/PixelText';
import { wrapLines } from '../ui/InfoTooltip';
import { NameField } from '../ui/NameField';
import { HeroPicker, animatePreview, makePreview } from '../ui/HeroPicker';
import type { Preview } from '../ui/HeroPicker';
import { THEME } from '../ui/Theme';
import { playIntroThen } from './IntroScene';
import { music } from '../audio/MusicPlayer';

/** Top down: the title, the hero's name, the card of the hero picked (arrows either side), the row of portraits, the buttons. */
const TITLE_Y = 12;
const NAME = { y: 34, w: 160, h: 18, labelGap: 8 };
const CARD = { x: 40, y: 58, w: 432, h: 226, pad: 8 };
/** The hero stands in the card's left part, this wide, drawn this tall (head to feet) with its feet this far down. */
const PORTRAIT_W = 140;
const PREVIEW_H = 110;
const PREVIEW_FEET = 190;
const LINE_H = 10;
const ARROW = 22;
/** The portraits' row, under the card. */
const THUMB_Y = 292;
const BUTTON_W = 120;
const BUTTON_H = 24;
const BUTTON_GAP = 12;
const BUTTONS_Y = 340;
const CARD_ALPHA = 0.9;

type Line = { text: string; color: number };

/** What the card says about a hero: class, hit die and hit points, abilities, training, saves, spells and features. */
function cardLines(cls: HeroClass, width: number): Line[] {
  const scores = STAT_NAMES.map((stat) => text('select.ability', {
    stat: statShort(stat), score: cls.abilities[stat], modifier: formatModifier(abilityModifier(cls.abilities[stat])),
  }));
  const weapons = [...cls.weapons.map(trainingName), ...cls.weaponBases.map(weaponName)];
  const lines: Line[] = [
    ...wrapLines(heroBlurb(cls.id), width).map((line) => ({ text: line, color: THEME.muted })),
    { text: text('select.hit_points', { die: cls.hitDie, hp: cls.hitPoints }), color: THEME.hitPoints },
    { text: scores.slice(0, 3).join('  '), color: THEME.text },
    { text: scores.slice(3).join('  '), color: THEME.text },
    { text: text('select.armor', { list: cls.armor.map(trainingName).join(', ') || '-' }), color: THEME.armorClass },
    ...wrapLines(text('select.weapons', { list: weapons.join(', ') }), width).map((line) => ({ text: line, color: THEME.damage })),
    { text: text('select.saves', { list: cls.savingThrows.map(statShort).join(', ') }), color: THEME.text },
  ];
  if (cls.spellcasting) lines.push({ text: text('select.spellcasting', { stat: statName(cls.spellcasting) }), color: THEME.text });
  for (const feature of cls.features) {
    lines.push({ text: featureName(feature), color: THEME.title });
    lines.push(...wrapLines(featureDescription(feature), width).map((line) => ({ text: line, color: THEME.text })));
  }
  return lines;
}

/** Where the hero goes once picked (after the intro): a lone game, or the co-op lobby to host or join. */
let destination: SceneName = 'in_game';

/** Opens the character select; Continue plays the intro, then goes on to `next`. */
export function chooseHeroThen(manager: SceneManager, next: SceneName): void {
  destination = next;
  manager.goto('character_select');
}

/**
 * Before a game: type the hero's name and pick who they are by class. One hero's card shows at a time, the hero idling beside what their
 * class brings under the tabletop rules; the arrows (or ← →) and the portraits under it change the pick. The
 * choice is remembered for next time.
 */
export class CharacterSelectScene implements Scene {
  readonly container = new Container();
  private readonly card = new Container();
  private readonly thumbs: HeroPicker;
  private picked: HeroClassId = settings.heroClass;
  private preview: Preview | null = null;
  private tick = 0;
  private readonly nameField: NameField;
  private readonly onKeyDown = (e: KeyboardEvent) => this.handleKey(e);

  constructor(private readonly manager: SceneManager) {
    music.play('menu');
    this.container.addChild(menuBackdrop());
    const title = makeTitle(text('select.title'));
    title.position.set(LAYOUT_LEFT + LAYOUT_WIDTH / 2, TITLE_Y);
    this.card.position.set(LAYOUT_LEFT + CARD.x, CARD.y);
    this.container.addChild(title, this.card);
    this.nameField = this.addNameField();
    this.addArrows();
    this.thumbs = new HeroPicker(LAYOUT_LEFT + Math.round((LAYOUT_WIDTH - HeroPicker.width) / 2), THUMB_Y, this.picked);
    this.thumbs.onPick = (id) => this.pick(id);
    this.container.addChild(this.thumbs.view);
    this.addButtons();
    this.showCard();
    window.addEventListener('keydown', this.onKeyDown);
  }

  /** "Your name" and a box to type it: the name the combat log (and, in co-op, the others) call the hero. */
  private addNameField(): NameField {
    const centre = LAYOUT_LEFT + LAYOUT_WIDTH / 2;
    const label = new PixelLabel(text('select.name'), { color: THEME.text, align: 'right', shadow: true });
    label.position.set(Math.round(centre - NAME.w / 2 - NAME.labelGap), NAME.y + Math.round((NAME.h - 8) / 2));
    const field = new NameField(this.manager.canvas, Math.round(centre - NAME.w / 2), NAME.y, NAME.w, NAME.h);
    this.container.addChild(label, field.view);
    return field;
  }

  /** The card of the hero picked: a dark panel framed in gold, the hero on the left, the rules on the right. */
  private showCard(): void {
    for (const child of this.card.removeChildren()) child.destroy({ children: true });
    const cls = CLASSES[this.picked];
    const frame = new Graphics()
      .rect(0, 0, CARD.w, CARD.h).fill({ color: THEME.panel, alpha: CARD_ALPHA })
      .stroke({ color: THEME.title, width: 2, alignment: 1 });
    this.preview = makePreview(characterDef(cls.character), PORTRAIT_W / 2, PREVIEW_FEET, PREVIEW_H);
    animatePreview(this.preview, this.tick);
    const name = new PixelLabel(heroName(cls.id), { color: THEME.title, scale: 2, shadow: true });
    name.position.set(PORTRAIT_W, CARD.pad);
    this.card.addChild(frame, this.preview.sprite, name);
    const width = CARD.w - PORTRAIT_W - CARD.pad;
    cardLines(cls, width).forEach((line, i) => {
      const label = new PixelLabel(line.text, { color: line.color, shadow: true });
      label.position.set(PORTRAIT_W, CARD.pad + 22 + i * LINE_H);
      this.card.addChild(label);
    });
    this.thumbs.picked = this.picked;
  }

  private addArrows(): void {
    const y = CARD.y + Math.round((CARD.h - ARROW) / 2);
    const back = new PixelButton(text('select.prev'), ARROW, ARROW);
    back.position.set(LAYOUT_LEFT + CARD.x - ARROW - 8, y);
    back.onPress = () => this.step(-1);
    const next = new PixelButton(text('select.next'), ARROW, ARROW);
    next.position.set(LAYOUT_LEFT + CARD.x + CARD.w + 8, y);
    next.onPress = () => this.step(1);
    this.container.addChild(back, next);
  }

  private addButtons(): void {
    const centre = LAYOUT_LEFT + LAYOUT_WIDTH / 2;
    const back = new PixelButton(text('select.back'), BUTTON_W, BUTTON_H);
    back.position.set(Math.round(centre - BUTTON_W - BUTTON_GAP / 2), BUTTONS_Y);
    back.onPress = () => this.manager.goto('title');
    const go = new PixelButton(text('select.continue'), BUTTON_W, BUTTON_H);
    go.position.set(Math.round(centre + BUTTON_GAP / 2), BUTTONS_Y);
    go.onPress = () => this.confirm();
    this.container.addChild(back, go);
  }

  private handleKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === 'ArrowLeft') this.step(-1);
    else if (e.code === 'ArrowRight') this.step(1);
    else if (e.code === 'Enter') this.confirm();
  }

  /** The previous or next hero (wrapping round). */
  private step(by: number): void {
    const i = HERO_CLASSES.indexOf(this.picked);
    this.pick(HERO_CLASSES[(i + by + HERO_CLASSES.length) % HERO_CLASSES.length]);
  }

  private pick(id: HeroClassId): void {
    if (id === this.picked) return;
    this.picked = id;
    this.showCard();
  }

  private confirm(): void {
    this.nameField.commit();
    settings.heroClass = this.picked;
    saveSettings();
    playIntroThen(this.manager, destination);
  }

  /** The heroes idle, on the card and in their portraits. */
  update(): void {
    this.tick++;
    if (this.preview) animatePreview(this.preview, this.tick);
    this.thumbs.update(this.tick);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.nameField.destroy();
    this.container.destroy({ children: true });
  }
}
