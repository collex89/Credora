// Real Bible text, self-hosted and offline-capable, in three public-domain
// translations parsed into one JSON file per book (see scripts/parse-bible.mjs
// and scripts/parse-bible-versions.mjs). Vite code-splits each book into its
// own chunk, so only the book currently being read is ever downloaded.
//
// KJV and WEB follow the standard 66-book Protestant canon, so they have no
// text for the seven deuterocanonical books (Tobias, Judith, Wisdom,
// Ecclesiasticus, Baruch, 1-2 Machabees) -- loadBibleChapter falls back to
// Douay-Rheims for those automatically.
export const BIBLE_VERSIONS = [
  { id: 'dr', name: 'Douay-Rheims', shortName: 'DR', available: true },
  { id: 'kjv', name: 'King James Version', shortName: 'KJV', available: true },
  { id: 'web', name: 'World English Bible', shortName: 'WEB', available: true },
  { id: 'nkjv', name: 'New King James Version', shortName: 'NKJV', available: false },
  { id: 'rsv', name: 'Revised Standard Version', shortName: 'RSV', available: false },
  { id: 'gnt', name: 'Good News Translation', shortName: 'GNT', available: false },
];

const bibleModules = {
  dr: import.meta.glob('../data/bible/*.json'),
  kjv: import.meta.glob('../data/bible-kjv/*.json'),
  web: import.meta.glob('../data/bible-web/*.json'),
};

const dirFor = { dr: 'bible', kjv: 'bible-kjv', web: 'bible-web' };

export async function loadBibleChapter(bookId, chapterNum, versionId = 'dr') {
  const modules = bibleModules[versionId] || bibleModules.dr;
  const dir = dirFor[versionId] || dirFor.dr;
  let importer = modules[`../data/${dir}/${bookId}.json`];
  if (!importer) importer = bibleModules.dr[`../data/bible/${bookId}.json`]; // deuterocanon fallback
  if (!importer) return [];
  const mod = await importer();
  return mod.default[String(chapterNum)] || [];
}
