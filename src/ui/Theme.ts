/**
 * The colours every menu, panel and control is drawn in: dark slate and cold steel (the menus used to be
 * copper and brown). Change them here and the whole interface follows.
 */
export const THEME = {
  /** Behind the menu art, and the dim laid over the game under a panel. */
  backdrop: 0x07080a,
  /** Thin frame round a menu screen. */
  frame: 0x2e343e,
  /** Panels and dialogs. */
  panel: 0x0f1115,
  panelBorder: 0x3c4452,
  /** List rows inside a panel, and a row under the pointer. */
  row: 0x161a20,
  rowHover: 0x232934,
  /** Sliders and checkboxes: the empty well, its border, the filled part and the knob or tick. */
  well: 0x0b0d10,
  control: 0x5a6676,
  fill: 0x34404f,
  knob: 0xc9d3de,
  /** Button labels, and a label under the pointer. */
  buttonText: 0xd2d8e0,
  buttonHover: 0xffffff,
  /** Headings stay warm, so they read against the cold colours. */
  title: 0xe8c66a,
  /** Text boxes. */
  input: 0x14171c,
  inputBorder: 0x6a7686,
  placeholder: 0x6c7480,
  /** Plain text, and quieter hints. */
  text: 0xffffff,
  muted: 0x8a929c,
  /** The character sheet's fields: steel-blue Armor Class, blood-red hit points, ember-orange damage. */
  armorClass: 0x9cc4ff,
  hitPoints: 0xff6b6b,
  damage: 0xffb060,
} as const;
