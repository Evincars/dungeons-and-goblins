import type { ShownCondition } from '../systems/Conditions';

/**
 * Each condition's icon: Baldur's Gate's, downloaded from bg3.wiki's Condition Icons by scripts/download-condition-icons.py
 * and pixelated into public/conditions by scripts/condition-icons.sh (`<name>_pixelart.png`, twice the original's size).
 * A condition Baldur's Gate draws no icon for borrows a like one (deafened: the figure in sound waves; enfeebled: Feeble), and
 * one it draws under another name takes that (maimed: Crippled; gaping wounds: Open Wound).
 * Loaded the first time one is drawn (assets/SheetCatalog.ts).
 */
export const CONDITION_ICONS = {
  unconscious: 'unconscious', paralyzed: 'paralysed', laughing: 'hideous-laughter', prone: 'prone', restrained: 'restrained',
  charmed: 'charmed', maddened: 'crown-of-madness', frightened: 'frightened', blinded: 'blinded',
  deafened: 'absorb-elements-thunder-damage', enfeebled: 'feeble', poisoned: 'poisoned', incapacitated: 'incapacitated',
  invisible: 'invisible', burning: 'burning', bleeding: 'bleeding', dazed: 'dazed', maimed: 'crippled', off_balance: 'off-balance',
  weak_grip: 'weak-grip', chest_trauma: 'chest-trauma', gaping_wounds: 'open-wound', hamstrung: 'hamstrung', disarmed: 'disarmed',
} as const satisfies Record<ShownCondition, string>;

/** The texture key of a condition's icon. */
export function conditionIconKey(condition: string): string {
  return `condition_icon_${condition}`;
}

/** Every condition's icon: its texture key and its file under public/. */
export function conditionIconSources(): { key: string; src: string }[] {
  return Object.entries(CONDITION_ICONS).map(([condition, file]) => ({
    key: conditionIconKey(condition), src: `/conditions/${file}_pixelart.png`,
  }));
}
