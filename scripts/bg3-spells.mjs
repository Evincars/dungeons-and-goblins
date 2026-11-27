// Builds src/data/spell-list.json, the spells the game knows, from the Baldur's Gate 3 wiki's list of every spell
// (https://baldursgate3.wiki.fextralife.com/Spells): each spell's name, level, school, who learns it (the base classes;
// our cleric is a Life Domain cleric, so its domain spells count as cleric spells; `knight` for the Eldritch Knight)
// and its in-game text, with its icon from public/spells-icons (the pixelated copy scripts/spell-icons.sh makes).
// Spells only an item, a race or a scroll gives are left out; a variant (Chromatic Orb: Fire, Find Familiar: Cat) is
// part of its spell. What a spell does in play (its dice, how it is cast) is in src/data/spells.json; the D&D rules text
// and numbers behind it (range, dice, "At Higher Levels") come from src/data/spellbook.json where it has the spell.
//
// Run it again only to refresh the list:  node scripts/bg3-spells.mjs [saved-page.html]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE = 'https://baldursgate3.wiki.fextralife.com/Spells';
const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${root}src/data/spell-list.json`;
const ICONS = `${root}public/spells-icons`;
const book = JSON.parse(readFileSync(`${root}src/data/spellbook.json`, 'utf8')).spells;

/** The classes a hero can be (or may be one day), as the wiki writes them. */
const BASE_CLASSES = ['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Sorcerer', 'Warlock', 'Wizard'];
/** Subclasses whose spells the game's own heroes get: our cleric heals, a Life Domain cleric. */
const AS_CLASS = { 'Life Domain': 'Cleric' };
/** Subclasses and their class (a spell only a subclass learns stays in the list, learnt by nobody for now). */
const SUBCLASS_OF = {
  'Eldritch Knight': 'Fighter', 'Arcane Trickster': 'Rogue', 'Mage Breaker': 'Ranger', 'Gloom Stalker': 'Ranger',
  Hexblade: 'Warlock', 'The Fiend': 'Warlock', 'The Great Old One': 'Warlock', Archfey: 'Warlock', Celestial: 'Warlock',
  Undying: 'Warlock', 'Storm Sorcery': 'Sorcerer', Oathbreaker: 'Paladin',
};
const isSubclass = (name) => name in SUBCLASS_OF || / Domain$|^College of |^Oath |^Circle of /.test(name);
/** The wiki leaves out who learns these. */
const LEARNERS = { Blur: ['Sorcerer', 'Wizard'] };
/** Spells the wiki lists twice under two names: the one kept. */
const SAME_AS = { 'Grant Flight': 'Fly' };
/** The game's ids where they differ from the spell's BG3 name (the D&D lists' ids, to share their rules). */
const IDS = {
  'Bone Chill': 'chill_touch', 'Mage Armour': 'mage_armor', 'Colour Spray': 'color_spray', 'Enhance Leap': 'jump',
  'Enlarge - Reduce': 'enlarge_reduce', 'Divine Favour': 'divine_favor',
  'Armour of Agathys': 'armor_of_agathys', 'Command (Halt)': 'command',
};
/** The D&D lists' entries for spells they name otherwise. */
const BOOK = { blindness: 'blindness_deafness', conjure_minor_elemental: 'conjure_minor_elementals', enthral: 'enthrall' };
/** Names to give where the wiki's differ from the game's (a variant's name, a typo). */
const NAMES = { 'Command (Halt)': 'Command', 'Enlarge - Reduce': 'Enlarge/Reduce', 'Bestow curse': 'Bestow Curse' };
/** Spells whose icon's file name says something else: the icons' own spelling, or a stand-in. */
const ICON_NAMES = {
  fire_bolt: 'firebolt', eldritch_blast: 'eldtrich blast', toll_the_dead: 'toll of the dead', glyph_of_warding: 'gluph of warding',
  revivify: 'revify', thaumaturgy: 'thraumaturgy', dispel_evil_and_good: 'dispell evil and good', grasping_vine: 'graping vine',
  conjure_woodland_beings: 'conjure woodland being', enlarge_reduce: 'enlarge reduce', enthral: 'enthrall', evards_black_tentacles: 'edvards black tentacles', fly: 'grant flight',
  // No Fireball icon in the set: the closest look is Flaming Sphere's ball of fire.
  fireball: 'flaming sphere',
};

/** Spells the game keeps (their text and rules) but leaves out of the Skills tab: they have no part in play here. */
const HIDDEN = new Set([
  'friends', 'light', 'mage_hand', 'minor_illusion', 'bursting_sinew',
  'disguise_self', 'jump', 'expeditious_retreat', 'feather_fall', 'find_familiar',
]);
/** Spells the game holds by concentration though the wiki's table does not say so (one held at a time, as every other). */
const CONCENTRATION = new Set(['dancing_lights', 'true_strike']);
/** The wiki's table gives some spells only their numbers: their description as Baldur's Gate tells it. */
const TEXTS = {
  dancing_lights: 'Light up the dark round you, or send the lights away to draw foes to them. 10 Turns 18m Concentration',
};

const ENTITIES = { '&amp;': '&', '&#39;': "'", '&#039;': "'", '&quot;': '"', '&nbsp;': ' ', '&lt;': '<', '&gt;': '>' };
/** The game's pixel font has only Latin-1: curly quotes and dashes become their plain look-alikes. */
const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#?\w+;/g, (m) => ENTITIES[m] ?? m)
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/(\d)\s*[~∼]\s*(\d)/g, '$1-$2').replace(/\s+/g, ' ').trim();
const idOf = (name) => IDS[name] ?? name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const levelOf = (cell) => (/cantrip/i.test(cell) ? 0 : Number(cell.match(/\d+/)?.[0]));
/** A name to compare icons by: lower case, no apostrophes, words split by single spaces. */
const normal = (name) => name.toLowerCase().replace(/['’]/g, '').replace(/[-_ ]+/g, ' ').trim();

async function page() {
  const saved = process.argv[2];
  if (saved) return readFileSync(saved, 'utf8');
  const res = await fetch(PAGE, { headers: { 'user-agent': 'Mozilla/5.0 (spell data import)' } });
  if (!res.ok) throw new Error(`Could not fetch ${PAGE}: ${res.status}`);
  return res.text();
}

/** The rows of the page's spell table: name, level, school, concentration, text, and who learns it. */
function rows(html) {
  const start = html.indexOf('<table class="wikitable sortable searchable">');
  if (start < 0) throw new Error('The spell table is not on the page');
  const table = html.slice(start, html.indexOf('</table>', start));
  return table.split(/<tr[^>]*>/).slice(2).map((row) => {
    const cells = row.split(/<td[^>]*>/).slice(1);
    const learners = [...cells[6].matchAll(/title="([^"]+)"/g)].map((m) => plain(m[1]));
    return {
      name: plain(cells[0]), level: levelOf(plain(cells[1])), school: plain(cells[2]), concentration: /yes/i.test(plain(cells[4])),
      text: plain(cells[5].split(/<\/p>/)[0]), learners: learners.length ? learners : plain(cells[6]).split(/\s*,\s*/).filter(Boolean),
    };
  });
}

/** Each pixelated icon's name in comparable form. */
const icons = readdirSync(ICONS).filter((f) => f.endsWith('_pixelart.png')).map((file) => ({ file, name: normal(file.replace(/_pixelart\.png$/, '')) }));

/** The icon whose file name starts with the spell's name (then a space or its end): of several, the one with least after it. */
function iconOf(id, name) {
  const want = ICON_NAMES[id] ?? normal(name);
  const found = icons.filter((icon) => `${icon.name} `.startsWith(`${want} `)).sort((a, b) => a.name.length - b.name.length);
  return found.length ? `spells-icons/${found[0].file}` : null;
}

const spells = {};
for (const row of rows(await page())) {
  if (row.name.includes(':') || SAME_AS[row.name] || !Number.isInteger(row.level) || row.school === '-') continue;
  const learners = LEARNERS[row.name] ?? row.learners;
  const classes = [...new Set(learners.map((who) => AS_CLASS[who] ?? who).filter((who) => BASE_CLASSES.includes(who)))];
  const subclasses = learners.filter(isSubclass);
  // Only an item, a race or a scroll gives it: not a spell anyone learns.
  if (!classes.length && !subclasses.length) continue;
  const id = idOf(row.name);
  const img = iconOf(id, NAMES[row.name] ?? row.name);
  if (!img) console.warn(`no icon for ${id}`);
  spells[id] = {
    name: NAMES[row.name] ?? row.name, level: row.level, school: row.school, concentration: row.concentration || CONCENTRATION.has(id),
    classes: classes.map((c) => c.toLowerCase()), knight: learners.includes('Eldritch Knight'), subclasses,
    book: [BOOK[id], id].find((key) => key && key in book) ?? null, text: TEXTS[id] ?? row.text, img,
    ...(HIDDEN.has(id) ? { hidden: true } : {}),
  };
}

const comment = 'Every spell of Baldur\'s Gate 3 the game knows (made by scripts/bg3-spells.mjs from the BG3 wiki): its name, level '
  + '(0: cantrip), school, whether it needs concentration, the classes that learn it (at the hero level their slots of its level open, '
  + 'src/data/spellbook.json casterKinds), knight: on the Eldritch Knight\'s list, the subclasses that learn it, book: its entry in '
  + 'src/data/spellbook.json (the D&D rules: range, dice, At Higher Levels), text: its in-game description, img: its icon under public/, '
  + 'hidden: kept (its text and rules) but left out of the Skills tab. '
  + 'Only the spells in src/data/spells.json can be cast yet; the others show greyed out as not in the game yet.';
writeFileSync(OUT, `${JSON.stringify({ $comment: comment, spells }, null, 2)}\n`);
console.log(`wrote ${Object.keys(spells).length} spells to src/data/spell-list.json`);
