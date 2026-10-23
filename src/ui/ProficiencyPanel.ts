import { Container, Graphics, Rectangle } from 'pixi.js';
import { text } from '../core/texts';
import { ARMOR_TRAININGS, WEAPON_TRAININGS, armorProficient } from '../rules/Classes';
import type { ArmorTraining, WeaponTraining } from '../rules/Classes';
import type { CharacterSheet } from '../rules/CharacterSheet';
import { heroName, trainingName, weaponName } from '../rules/Names';
import { PixelLabel } from './PixelText';
import { THEME } from './Theme';

const LINE_H = 10;
/** A checkbox's side, the mark inside it, and the space after it and after its word. */
const BOX = 7;
const MARK = 3;
const BOX_GAP = 3;
const ENTRY_GAP = 8;
/** The warning when something worn or wielded is outside the hero's training. */
const WARNING_COLOR = 0xff7060;

type Check = { box: Graphics; label: PixelLabel; trained: (sheet: CharacterSheet) => boolean };

/** A read-only checkbox: a sunken square, filled gold when ticked. */
function drawBox(box: Graphics, ticked: boolean): void {
  box.clear().rect(0, 0, BOX, BOX).fill({ color: THEME.well }).stroke({ color: THEME.control, width: 1, alignment: 1 });
  if (ticked) box.rect((BOX - MARK) / 2, (BOX - MARK) / 2, MARK, MARK).fill({ color: THEME.title });
}

/**
 * What the hero is trained in, as on a character sheet: a ticked box for each kind of armour (light, medium,
 * heavy, shields) and weapon (simple, martial) of their class, and a warning when the gear in use is not.
 */
export class ProficiencyPanel {
  readonly view = new Container();
  /** Where the armour and the weapon rows are, for their tooltips. */
  readonly armorHit: Rectangle;
  readonly weaponHit: Rectangle;
  private readonly header: PixelLabel;
  private readonly warning: PixelLabel;
  /** Single weapons trained beyond the kinds ticked (a wizard's dagger and quarterstaff). */
  private readonly extraWeapons: PixelLabel;
  private readonly checks: Check[] = [];

  constructor(x: number, y: number, w: number) {
    this.view.position.set(x, y);
    this.header = new PixelLabel('', { color: THEME.title, shadow: true });
    this.view.addChild(this.header);
    this.armorHit = this.addRow(text('proficiency.armor'), ARMOR_TRAININGS, (t: ArmorTraining) => (s) => armorProficient(s.heroClass, t), LINE_H, x, y, w);
    this.weaponHit = this.addRow(text('proficiency.weapons'), WEAPON_TRAININGS, (t: WeaponTraining) => (s) => s.heroClass.weapons.includes(t), 3 * LINE_H, x, y, w);
    this.extraWeapons = new PixelLabel('', { color: THEME.text, shadow: true });
    this.extraWeapons.y = 5 * LINE_H;
    this.warning = new PixelLabel('', { color: WARNING_COLOR, shadow: true });
    this.warning.y = 6 * LINE_H;
    this.view.addChild(this.extraWeapons, this.warning);
  }

  /** A caption, then a checkbox and word for each kind of training; returns the row's area (in the parent's space). */
  private addRow<T extends ArmorTraining | WeaponTraining>(
    caption: string, trainings: readonly T[], test: (t: T) => Check['trained'], top: number, x: number, y: number, w: number,
  ): Rectangle {
    const title = new PixelLabel(caption, { color: THEME.muted, shadow: true });
    title.y = top;
    this.view.addChild(title);
    let cx = 0;
    for (const training of trainings) {
      const box = new Graphics();
      box.position.set(cx, top + LINE_H + 1);
      const label = new PixelLabel(trainingName(training), { color: THEME.text, shadow: true });
      label.position.set(cx + BOX + BOX_GAP, top + LINE_H);
      this.view.addChild(box, label);
      this.checks.push({ box, label, trained: test(training) });
      cx += BOX + BOX_GAP + label.textWidth + ENTRY_GAP;
    }
    return new Rectangle(x, y + top, w, 2 * LINE_H);
  }

  /** Ticks what the hero's class is trained in, and warns about untrained armour (disadvantage) or weapon (no bonus). */
  set(sheet: CharacterSheet): void {
    this.header.text = text('proficiency.title', { class: heroName(sheet.heroClass.id) });
    const extra = sheet.heroClass.weaponBases;
    this.extraWeapons.text = extra.length ? text('proficiency.weapons_also', { list: extra.map(weaponName).join(', ') }) : '';
    for (const check of this.checks) {
      const trained = check.trained(sheet);
      drawBox(check.box, trained);
      check.label.fill = trained ? THEME.text : THEME.muted;
    }
    const warnings = [];
    if (!sheet.armorClass.proficient) warnings.push(text('proficiency.warning_armor'));
    if (!sheet.attack.proficient) warnings.push(text('proficiency.warning_weapon'));
    this.warning.text = warnings.join('\n');
  }
}
