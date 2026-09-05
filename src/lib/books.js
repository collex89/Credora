// Catholic spiritual classics, self-hosted and offline-capable, one JSON
// file per chapter (see scripts/parse-catholic-books.mjs). Same lazy-per-
// chapter approach as the Bible (src/lib/bible.js): Vite code-splits each
// chapter into its own chunk, so opening a book only ever downloads the
// chapter actually being read, not the whole work.
export const BOOKS_LIBRARY = [
  {
    id: 'imitation-of-christ',
    title: 'The Imitation of Christ',
    author: 'Thomas à Kempis',
    description: 'A 15th-century devotional classic on humility, detachment from the world, and the inner life -- after the Bible, the most widely read spiritual work in Christian history.',
    totalChapters: 114,
    sourceUrl: 'https://www.gutenberg.org/ebooks/1653',
    license: 'Public domain (Benham translation)',
  },
  {
    id: 'confessions',
    title: 'Confessions',
    author: 'St. Augustine of Hippo',
    description: "Augustine's own account of his restless youth and conversion, written as a long, searching prayer -- one of the earliest and most influential autobiographies in Western literature.",
    totalChapters: 13,
    sourceUrl: 'https://www.gutenberg.org/ebooks/3296',
    license: 'Public domain (Pusey translation)',
  },
  {
    id: 'story-of-a-soul',
    title: 'Story of a Soul',
    author: 'St. Thérèse of Lisieux',
    description: 'The autobiography of the "Little Flower," written at her prioress\'s request in the last years of her short life -- the origin of her "Little Way" of trust and simplicity.',
    totalChapters: 11,
    sourceUrl: 'https://www.gutenberg.org/ebooks/16772',
    license: 'Public domain (Taylor translation)',
  },
];

const bookModules = import.meta.glob('../data/books/*/*.json');

export async function loadBookChapter(bookId, chapterNum) {
  const importer = bookModules[`../data/books/${bookId}/${chapterNum}.json`];
  if (!importer) return null;
  const mod = await importer();
  return mod.default;
}
