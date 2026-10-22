import texts from '../data/texts.json';

/**
 * Every string the player reads lives in src/data/texts.json under a short, self-describing id
 * (`stat.strength.name`), so translating the game means supplying another file with the same ids.
 */

export type TextId = keyof typeof texts;

/** Values for the `{name}` placeholders of a text. */
export type TextVars = Record<string, string | number>;

/** The text with this id; each `{name}` in it is replaced by the matching entry of `vars`. */
export function text(id: TextId, vars?: TextVars): string {
  const raw: string = texts[id];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, key: string) => String(vars[key] ?? whole));
}
