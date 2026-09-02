// Real Bible text, self-hosted and offline-capable, in three public-domain
// translations parsed into one JSON file per book (see scripts/parse-bible.mjs,
// scripts/parse-bible-versions.mjs, and scripts/parse-web-ce-deuterocanon.mjs).
// Vite code-splits each book into its own chunk, so only the book currently
// being read is ever downloaded.
//
// KJV follows the standard 66-book Protestant canon, so it has no text for
// the seven deuterocanonical books (Tobias, Judith, Wisdom, Ecclesiasticus,
// Baruch, 1-2 Machabees) -- loadBibleChapter falls back to Douay-Rheims for
// those automatically. WEB is the World English Bible Catholic Edition:
// unlike KJV it does have its own text for all 73 books, added specifically
// so the app's default translation doesn't drop into 400-year-old English
// for exactly the seven books most distinctly Catholic.
export const BIBLE_VERSIONS = [
  { id: 'dr', name: 'Douay-Rheims', shortName: 'DR', available: true },
  { id: 'web', name: 'World English Bible (Catholic Edition)', shortName: 'WEB', available: true },
  { id: 'kjv', name: 'King James Version', shortName: 'KJV', available: true },
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

function findImporter(bookId, versionId) {
  const modules = bibleModules[versionId] || bibleModules.dr;
  const dir = dirFor[versionId] || dirFor.dr;
  return modules[`../data/${dir}/${bookId}.json`];
}

// Whether the given version has its own text for this book, as opposed to
// silently falling back to Douay-Rheims. Used to decide whether the reader
// should show its "translated by a different version" notice -- keeping
// that check here, off the same lookup loadBibleChapter itself uses, means
// a version gaining or losing a book (like WEB just did) can't leave the UI
// showing a stale warning that no longer matches what actually loads.
export function versionHasBook(bookId, versionId) {
  return !!findImporter(bookId, versionId);
}

export async function loadBibleChapter(bookId, chapterNum, versionId = 'dr') {
  const importer = findImporter(bookId, versionId) || bibleModules.dr[`../data/bible/${bookId}.json`]; // deuterocanon fallback
  if (!importer) return [];
  const mod = await importer();
  return mod.default[String(chapterNum)] || [];
}
