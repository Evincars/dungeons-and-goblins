// Builds src/data/spellbook.json from https://dnd5e.wikidot.com (the class spell lists and every spell page).
// Run it again only to refresh the data:  node scripts/scrape-spells.mjs
// Be polite to the site: a few requests at a time, and the pages are not cached, so the run takes a few minutes.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SITE = 'https://dnd5e.wikidot.com';
const CLASSES = ['artificer', 'bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'warlock', 'wizard'];
const DAMAGE_TYPES = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
const PX_PER_5_FEET = 48;
const FEET_PER_MILE = 5280;
/** Character levels at which a cantrip's damage dice multiply (5th: twice, 11th: three times, 17th: four times). */
const CANTRIP_TIERS = [5, 11, 17];
const PARALLEL = 5;

/** The character level at which each class gets its first slots of spell level 1..9 (null: never). */
const UNLOCK = {
  full: [1, 3, 5, 7, 9, 11, 13, 15, 17],
  half: [2, 5, 9, 13, 17, null, null, null, null],
  artificer: [1, 5, 9, 13, 17, null, null, null, null],
  pact: [1, 3, 5, 7, 9, 11, 13, 15, 17],
};
const CLASS_KIND = { artificer: 'artificer', bard: 'full', cleric: 'full', druid: 'full', paladin: 'half', ranger: 'half', sorcerer: 'full', warlock: 'pact', wizard: 'full' };

async function get(path) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${SITE}${path}`, { headers: { 'user-agent': 'Mozilla/5.0 (spell data import)' } });
    if (res.ok) return res.text();
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw new Error(`Could not fetch ${path}`);
}

const entities = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&rsquo;': '\u2019', '&lsquo;': '\u2018', '&ndash;': '\u2013', '&mdash;': '\u2014' };
/** The game's pixel font has only Latin-1: curly quotes, dashes and bullets become their plain look-alikes. */
const PLAIN_CHARS = { '\u2019': "'", '\u2018': "'", '\u201c': '"', '\u201d': '"', '\u2022': '-', '\u2013': '-', '\u2014': '-', '\u00a0': ' ', '\u2009': ' ' };
const plain = (html) => html
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|tr|ul|ol|h\d)>/gi, '\n').replace(/<\/t[dh]>/gi, ' | ').replace(/<li[^>]*>/gi, '\u2022 ')
  .replace(/<[^>]+>/g, '').replace(/&#?\w+;/g, (m) => entities[m] ?? m).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
  .replace(/[\u2000-\u200a\u202f]/g, ' ')
  .replace(/[\u00a0\u2009\u2013\u2014\u2018\u2019\u201c\u201d\u2022]/g, (c) => PLAIN_CHARS[c]).trim();

/** Spell links of a class page, with the spell level (0: cantrip) of the tab each is in. */
function classList(html) {
  const found = [];
  // The tabs are named ("Cantrip", "1st Level"…): a class with no cantrips starts at its 1st Level tab.
  const names = [...html.matchAll(/<li[^>]*><a href="javascript:;"><em>([^<]+)<\/em>/g)].map((m) => m[1]);
  const levelOf = (tab) => (/cantrip/i.test(names[tab]) ? 0 : Number(names[tab].match(/\d+/)[0]));
  const tabs = html.split(/<div id="wiki-tab-0-(\d+)"[^>]*>/);
  for (let i = 1; i < tabs.length; i += 2) {
    for (const m of tabs[i + 1].matchAll(/<a href="\/spell:([^"]+)">([^<]+)<\/a>/g)) found.push({ slug: m[1], name: m[2], level: levelOf(Number(tabs[i])) });
  }
  return found;
}

function rangeOf(text) {
  const t = text.toLowerCase();
  let feet = null;
  const f = t.match(/^(\d[\d,]*)\s*(feet|foot|ft)/);
  const mile = t.match(/^(\d+)\s*mile/);
  if (f) feet = Number(f[1].replace(/,/g, ''));
  else if (mile) feet = Number(mile[1]) * FEET_PER_MILE;
  else if (t.startsWith('touch')) feet = 5;
  else if (t.startsWith('self')) feet = 0;
  return { text, feet, px: feet === null ? null : Math.round((feet / 5) * PX_PER_5_FEET) };
}

function damageOf(body, level) {
  const typed = [...body.matchAll(/(\d+)d(\d+)(?:\s*\+\s*(\d+))?\s+([a-z]+)\s+damage/gi)].find((m) => DAMAGE_TYPES.includes(m[4].toLowerCase()));
  const untyped = body.match(/(\d+)d(\d+)(?:\s*\+\s*(\d+))?\s+damage/i);
  const heal = body.match(/(?:regains?|restores?)[^.]*?hit points equal to (\d+)d(\d+)/i) ?? body.match(/(\d+)d(\d+)\s+hit points/i);
  if (heal && !typed) return { kind: 'heal', dice: `${heal[1]}d${heal[2]}`, types: [] };
  const hit = typed ?? untyped;
  if (!hit) return null;
  const types = typed ? [typed[4].toLowerCase()] : DAMAGE_TYPES.filter((t) => new RegExp(`\\b${t}\\b`, 'i').test(body));
  return { kind: 'damage', dice: `${hit[1]}d${hit[2]}${hit[3] ? `+${hit[3]}` : ''}`, types, level };
}

function scalingOf(dice, level) {
  if (level !== 0) return [];
  const [count, sides] = dice.split('+')[0].split('d').map(Number);
  return CANTRIP_TIERS.map((at, i) => ({ level: at, dice: `${count * (i + 2)}d${sides}` }));
}

function parseSpell(slug, html) {
  const content = html.split('<div id="page-content">')[1]?.split('page-tags')[0] ?? '';
  const source = content.match(/<p>Source:\s*([^<]*)<\/p>/)?.[1] ?? '';
  const head = content.match(/<p><em>([^<]*)<\/em><\/p>/)?.[1] ?? '';
  const meta = (label) => content.match(new RegExp(`<strong>${label}:</strong>\\s*([^<]*)`))?.[1]?.trim() ?? '';
  const afterMeta = content.split(/<strong>Duration:<\/strong>[^<]*<\/p>/)[1] ?? '';
  const [bodyHtml, listHtml = ''] = afterMeta.split(/<p><strong><em>Spell Lists\.<\/em><\/strong>/);
  const [descHtml, higherHtml] = bodyHtml.split(/<p><strong><em>At Higher Levels\.<\/em><\/strong>/);
  const cantrip = /cantrip/i.test(head);
  const levelMatch = head.match(/^(\d)(?:st|nd|rd|th)-level (\w+)/i) ?? head.match(/^(\w+) cantrip/i);
  const level = cantrip ? 0 : Number(levelMatch?.[1] ?? 0);
  const school = (cantrip ? levelMatch?.[1] : levelMatch?.[2]) ?? '';
  const description = plain(descHtml ?? '');
  const higher = higherHtml ? plain(higherHtml.split('</p>')[0]) : null;
  const dmg = damageOf(description, level);
  const perSlot = higher?.match(/increases? by (\d+d\d+)\s+for each (?:slot )?level above/i)?.[1] ?? null;
  const duration = meta('Duration');
  return {
    slug, name: html.match(/<title>([^<]*?)\s*-\s*DND/)?.[1] ?? slug, level, school: school[0]?.toUpperCase() + school.slice(1),
    ritual: /ritual/i.test(head), source, castingTime: meta('Casting Time'), range: rangeOf(meta('Range')), duration,
    concentration: /concentration/i.test(duration), description, higherLevels: higher,
    effect: dmg && { kind: dmg.kind, dice: dmg.dice, damageTypes: dmg.types, cantripScaling: dmg.kind === 'damage' ? scalingOf(dmg.dice, level) : [], perSlotLevel: perSlot },
  };
}

const slugId = (slug) => slug.replace(/-/g, '_');

async function inBatches(items, work) {
  const out = [];
  for (let i = 0; i < items.length; i += PARALLEL) out.push(...(await Promise.all(items.slice(i, i + PARALLEL).map(work))));
  return out;
}

const lists = {};
for (const cls of CLASSES) lists[cls] = classList(await get(`/spells:${cls}`)).filter((s) => !/\(UA\)/.test(s.name));
const slugs = [...new Set(Object.values(lists).flat().map((s) => s.slug))];
console.log(`${slugs.length} spells across ${CLASSES.length} classes`);

const spells = {};
await inBatches(slugs, async (slug) => {
  const spell = parseSpell(slug, await get(`/spell:${slug}`));
  const classes = {};
  for (const cls of CLASSES) {
    const entry = lists[cls].find((s) => s.slug === slug);
    if (!entry) continue;
    if (entry.level !== spell.level) console.warn(`${slug}: the ${cls} list has it at level ${entry.level}, its page at ${spell.level}`);
    // A cantrip is known from level 1; a spell from the level its class first gets slots of the spell's level.
    classes[cls] = entry.level === 0 ? 1 : UNLOCK[CLASS_KIND[cls]][entry.level - 1];
  }
  const { slug: _slug, ...rest } = spell;
  spells[slugId(slug)] = { ...rest, classes };
});

const sorted = Object.fromEntries(Object.entries(spells).sort(([a], [b]) => a.localeCompare(b)));
const out = {
  $comment: 'Every spell of the D&D 5e spell lists (dnd5e.wikidot.com), made by scripts/scrape-spells.mjs. classes: the class -> the character level at which that class learns the spell (a cantrip: 1; a spell: when the class gets slots of its level). range: feet, and px (5 feet = 48 px). effect: dice rolled (damage or heal), the damage types (several when the caster picks), cantripScaling (damage by character level) and perSlotLevel (extra dice per level a spell is cast above its own). Spell slots do not exist in this game: a higher cast level is a longer recovery (src/rules/Spellbook.ts).',
  casterKinds: CLASS_KIND,
  unlockLevels: UNLOCK,
  spells: sorted,
};
// One spell to a line, so the file diffs and reads well.
const { spells: _spells, ...header } = out;
const lines = Object.entries(sorted).map(([id, spell]) => `  ${JSON.stringify(id)}: ${JSON.stringify(spell)}`);
const head = JSON.stringify(header, null, 1).slice(0, -2);
writeFileSync(fileURLToPath(new URL('../src/data/spellbook.json', import.meta.url)), `${head},\n "spells": {\n${lines.join(',\n')}\n }\n}\n`);
console.log(`wrote ${Object.keys(sorted).length} spells`);
