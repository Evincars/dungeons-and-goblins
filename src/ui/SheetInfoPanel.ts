import { Container, Rectangle } from 'pixi.js';
import { STAT_NAMES } from '../world';
import { text } from '../core/texts';
import type { CharacterSheet } from '../rules/CharacterSheet';
import { formatModifier } from '../rules/Dice';
import { statShort } from '../entities/Items';
import { dndClassName, heroName } from '../rules/Names';
import type { TipTopic } from './InfoTooltip';
import { hitDiceTopic, initiativeTopic, perceptionTopic, proficiencyBonusTopic, savesTopic, speedTopic, spellTopic } from './SheetTopics';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

const LINE_H = 10;
/** The saving throws' values are drawn this much smaller than plain text, under their abilities' columns. */
const SAVE_SCALE = 0.75;
const HIT_PAD = 1;

/** One fact on the sheet: what it reads for this hero, and its tooltip. */
type InfoDef = { line: (s: CharacterSheet) => string; topic: (s: CharacterSheet) => TipTopic };
type Info = { label: PixelLabel; def: InfoDef; hit: Rectangle };

/** Two facts a row: proficiency and initiative, speed and passive Perception, hit dice and spellcasting. */
const INFO: readonly InfoDef[] = [
  { line: (s) => text('sheet.info.proficiency', { value: formatModifier(s.proficiency) }), topic: proficiencyBonusTopic },
  { line: (s) => text('sheet.info.initiative', { value: formatModifier(s.initiative) }), topic: initiativeTopic },
  { line: (s) => text('sheet.info.speed', { value: s.speed }), topic: speedTopic },
  { line: (s) => text('sheet.info.passive', { value: s.passivePerception }), topic: perceptionTopic },
  { line: (s) => text('sheet.info.hit_dice', { count: s.level, die: s.heroClass.hitDie }), topic: hitDiceTopic },
  { line: (s) => text('sheet.info.spell', { attack: formatModifier(s.spell.attack), dc: s.spell.dc }), topic: spellTopic },
];

/**
 * The rest of the character sheet a player needs, under the Armor Class, hit points and damage: who the hero
 * is (name, class, level), the proficiency bonus, initiative, speed, passive Perception, hit dice and spell
 * attack and save DC, then the six saving throws (the class's two trained ones in gold) lined up under the
 * abilities. Each shows what it means under the pointer.
 */
export class SheetInfoPanel {
  readonly view = new Container();
  /** How tall it is, for what comes under it. */
  readonly height: number;
  private readonly header = new PixelLabel('', { color: THEME.title, shadow: true });
  private readonly infos: Info[] = [];
  private readonly saves: PixelLabel[] = [];
  private readonly savesHit: Rectangle;

  /** `columns`: where each ability's column is centred (the saving throws line up under them). */
  constructor(x: number, y: number, w: number, columns: readonly number[]) {
    this.header.position.set(x, y);
    this.view.addChild(this.header);
    const half = Math.floor(w / 2);
    INFO.forEach((def, i) => {
      const label = new PixelLabel('', { color: THEME.text, shadow: true });
      const lx = x + (i % 2) * half;
      const ly = y + LINE_H * (1 + Math.floor(i / 2));
      label.position.set(lx, ly);
      this.view.addChild(label);
      this.infos.push({ label, def, hit: new Rectangle(lx - HIT_PAD, ly - HIT_PAD, half, LINE_H) });
    });
    const savesY = y + LINE_H * (1 + Math.ceil(INFO.length / 2));
    const caption = new PixelLabel(text('sheet.info.saves'), { color: THEME.muted, shadow: true });
    caption.position.set(x, savesY);
    this.view.addChild(caption);
    for (const centre of columns) {
      const save = new PixelLabel('', { scale: SAVE_SCALE, align: 'center', shadow: true });
      save.position.set(centre, savesY + LINE_H);
      this.saves.push(save);
      this.view.addChild(save);
    }
    this.height = savesY + 2 * LINE_H - y;
    this.savesHit = new Rectangle(x, savesY, w, 2 * LINE_H);
  }

  set(sheet: CharacterSheet): void {
    this.header.text = text('sheet.info.header', { hero: heroName(sheet.heroClass.id), class: dndClassName(sheet.heroClass.dndClass), level: sheet.level });
    for (const info of this.infos) info.label.text = info.def.line(sheet);
    STAT_NAMES.forEach((stat, i) => {
      const save = sheet.saves[stat];
      this.saves[i].text = text('sheet.info.save', { stat: statShort(stat), bonus: formatModifier(save.bonus) });
      this.saves[i].fill = save.proficient ? THEME.title : THEME.muted;
    });
  }

  /** The tooltip of the fact under the point, if any. */
  topicAt(x: number, y: number, sheet: CharacterSheet): TipTopic | null {
    for (const info of this.infos) if (info.hit.contains(x, y)) return info.def.topic(sheet);
    return this.savesHit.contains(x, y) ? savesTopic(sheet) : null;
  }
}
