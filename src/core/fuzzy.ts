/**
 * Loose search, as in a code editor's "go to file": the letters of what was typed turn up in the text in the same order,
 * not necessarily side by side (`vybow` finds "Heavy crossbow": heaV-Y cross-B-O-W). Case and spaces don't matter.
 */

/**
 * Where the letters of `query` (spaces skipped, any case) turn up in order in `text`: the indices of the letters matched
 * (the earliest each can be), or null when they don't all turn up. An empty query matches everything, highlighting nothing.
 */
export function fuzzyMatch(query: string, text: string): number[] | null {
  const wanted = query.toLowerCase().replace(/\s+/g, '');
  const haystack = text.toLowerCase();
  const found: number[] = [];
  let at = 0;
  for (const ch of wanted) {
    const i = haystack.indexOf(ch, at);
    if (i < 0) return null;
    found.push(i);
    at = i + 1;
  }
  return found;
}
