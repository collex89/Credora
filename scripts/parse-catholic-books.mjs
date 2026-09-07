// One-time build script: parses public-domain Catholic spiritual classics
// into one JSON file per chapter, the same lazy-per-chapter approach
// already used for the Bible (see scripts/parse-bible.mjs) so the reader
// only ever downloads the chapter actually being read.
//
// Each confirmed public domain directly on its source listing page before
// downloading anything. Four are Project Gutenberg plain-text editions;
// Introduction to the Devout Life isn't on Gutenberg, so it's sourced from
// CCEL (Christian Classics Ethereal Library), which only hosts public
// domain or freely-licensed texts -- this is their 19th-century "Library
// of Spiritual Works for English Catholics" translation, long out of
// copyright, not a modern licensed edition:
//   The Imitation of Christ       -- gutenberg.org/ebooks/1653  (Benham translation)
//   The Confessions of St. Augustine -- gutenberg.org/ebooks/3296  (Pusey translation)
//   Story of a Soul (St. Thérèse) -- gutenberg.org/ebooks/16772 (Taylor translation)
//   Introduction to the Devout Life -- ccel.org/ccel/desales/devout_life (Library of Spiritual Works for English Catholics translation)
//   Abandonment to Divine Providence -- gutenberg.org/ebooks/52057 (McMahon translation)
//
// Each book has a different heading convention (CHAPTER I / BOOK I) and a
// different inline footnote-marker style, so each gets its own small
// config rather than one regex trying to cover all of them.
//
// Run with: node scripts/parse-catholic-books.mjs
// Source dir: scripts/src_tmp/books/ (gitignored, not committed --
//             re-download from the URLs above if these files are missing)
// Output:    src/data/books/<id>/<chapter>.json

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, 'src_tmp', 'books');
const OUT_ROOT = path.join(__dirname, '..', 'src', 'data', 'books');

function extractBody(raw, title) {
  const startMarker = raw.indexOf(`*** START OF THE PROJECT GUTENBERG EBOOK`);
  const endMarker = raw.indexOf(`*** END OF THE PROJECT GUTENBERG EBOOK`);
  if (startMarker === -1 || endMarker === -1) {
    throw new Error(`${title}: couldn't find Gutenberg START/END markers`);
  }
  return raw.slice(raw.indexOf('\n', startMarker), endMarker);
}

// CCEL's plain-text export has no Gutenberg START/END banner -- the front
// matter (title block, table of contents) is harmless to leave in, since
// it's dropped anyway: chapter splitting only keeps text between one
// chapter marker and the next, so anything before the first marker is
// never included.

// Handles the Imitation of Christ's two-part footnote convention: a bare
// "(1)" inline in the body is just a reference pointer with no text of its
// own, while the actual citation text for the whole chapter is one
// consolidated paragraph at the very end (e.g. "(1) Psalm xciv. 12; ...
// (2) John viii. 25 (Vulg.)."), immediately before the next chapter
// marker. Treating every inline "(1)" as if citation text followed it
// directly (a single regex, greedy or not) either leaves the real
// citations in the body or -- as first written -- eats the genuine
// sentence between one bare marker and the next, since there's no
// footnote text there to bound the match against. Splitting into
// paragraphs first and dropping only the ones that are entirely a
// citation list avoids that trap. The marker pattern is passed in since
// different editions use different bracket styles -- "(1)" here, "[1]"
// elsewhere.
function stripFootnoteParagraphs(text, markerPattern) {
  return text
    .split(/\n\n+/)
    .filter(para => !markerPattern.test(para.trim()))
    .join('\n\n');
}

function cleanParagraphs(text) {
  return text
    .split(/\n\n+/)
    .map(para => para
      // Gutenberg's plain text hard-wraps every line at ~70 characters,
      // independent of actual paragraph breaks (a holdover from
      // fixed-width terminal display) -- collapsing those internal
      // single newlines to spaces is what the reader actually needs,
      // since it renders with white-space: pre-line and would otherwise
      // show every source line as its own short paragraph.
      .replace(/\s*\n\s*/g, ' ')
      .trim())
    .filter(Boolean)
    // Real paragraph breaks put back as the reader expects them.
    .join('\n\n')
    // Gutenberg plain-text italics (_word_) -- stripped rather than
    // converted, since these books don't need the post composer's
    // markdown-style renderer just to show a few emphasized words.
    .replace(/_([^_]+)_/g, '$1');
}

const BOOKS = [
  {
    id: 'imitation-of-christ',
    file: 'imitation_of_christ.txt',
    title: 'The Imitation of Christ',
    // "CHAPTER I" then a title line then body -- the title line is kept
    // as part of the chapter's own text rather than split into a separate
    // field, matching how saint bios are already stored as one string.
    chapterRegex: /^CHAPTER [IVXLC]+\s*$/gm,
    stripFootnoteParagraph: /^\(\d+\)/,
    // What's left after that is bare inline pointers ("(1)", "(2)") with
    // no text of their own -- safe to remove directly.
    footnoteRegex: /\(\d+\)/g,
    expectedChapters: 114,
  },
  {
    id: 'confessions',
    file: 'confessions_augustine.txt',
    title: 'Confessions',
    // No chapter subdivisions in this translation, only 13 Books -- each
    // Book is one lazy-loaded "chapter" in the reader, same as a long
    // Psalm is still one chapter.
    chapterRegex: /^BOOK [IVXLC]+\s*$/gm,
    footnoteRegex: null,
    expectedChapters: 13,
  },
  {
    id: 'story-of-a-soul',
    file: 'story_of_a_soul.txt',
    title: 'Story of a Soul',
    chapterRegex: /^CHAPTER [IVXLC]+.*$/gm,
    // This Gutenberg edition bundles the autobiography with a large
    // appendix (letters, prayers, acts of consecration) that the book's
    // own text marks off with an explicit "END OF THE AUTOBIOGRAPHY"
    // line -- without cutting there, chapter 11 balloons from ~35KB to
    // ~260KB by absorbing all of it. Truncating the whole body there
    // before per-chapter splitting keeps this to the actual memoir; the
    // appendix is real content but a different, unverified scope, not
    // something to fold in by accident.
    truncateAt: 'END OF THE AUTOBIOGRAPHY',
    // Each chapter ends in "<body>\n______\n\n[1] note\n\n[2] note...\n\n______"
    // right before the next CHAPTER marker -- translator's endnotes, not
    // the author's own words. Keeping only what precedes the first
    // underscore-rule line removes the whole block in one step, rather
    // than trying to strip each bracketed note individually.
    truncateChapterAtRule: true,
    // Inline callouts like "...the Mercies of the Lord.[1]" pointing at
    // the endnotes just removed above -- orphaned reference markers with
    // nothing left to refer to, stripped the same way as Imitation of
    // Christ's bare "(1)" pointers.
    footnoteRegex: /\[\d+\]/g,
    expectedChapters: 11,
  },
  {
    id: 'introduction-devout-life',
    file: 'introduction_devout_life.txt',
    title: 'Introduction to the Devout Life',
    // Not a Gutenberg edition -- CCEL's plain-text export has no
    // START/END banner to slice on, so skip that step entirely.
    source: 'ccel',
    // Same "CHAPTER I. Title on the same line" style as Story of a Soul,
    // but numbering restarts at I within each of the book's 5 Parts
    // rather than running continuously -- harmless here, since each
    // match just becomes the next sequential lazy-loaded chapter file
    // regardless of what roman numeral it printed.
    chapterRegex: /^CHAPTER [IVXLC]+\..*$/gm,
    // Everything from here on is CCEL's own apparatus (a subject index,
    // a Scripture-reference index, then a huge page-number link list) --
    // none of it is Francis de Sales' text, and cutting it before
    // per-chapter splitting keeps the last real chapter from absorbing
    // it the way Story of a Soul's appendix did.
    truncateAt: 'INDEX.',
    // Endnotes ("[212] Ps. cxix. 93.") sit in their own paragraph after a
    // rule line at the end of a chapter, same shape as Story of a Soul.
    truncateChapterAtRule: true,
    footnoteRegex: /\[\d+\]/g,
    expectedChapters: 119,
  },
  {
    id: 'abandonment-divine-providence',
    file: 'abandonment_divine_providence.txt',
    title: 'Abandonment to Divine Providence',
    // Headings are "_CHAPTER I._" (Gutenberg's plain-text italics markup)
    // for every chapter except one -- Book Second's Chapter IX is missing
    // its underscores in this transcription -- so both are matched.
    chapterRegex: /^_?CHAPTER [IVXLC]+\._?$/gm,
    // Numbering restarts at I within each of the 3 Books, same non-issue
    // as Introduction to the Devout Life above.
    // This edition's Gutenberg transcriber note ("Obvious typographical
    // errors have been silently corrected...") sits inside the START/END
    // banner, right after the real text ends -- without cutting it, the
    // last chapter absorbs it whole.
    truncateAt: 'Transcriber’s Notes',
    stripFootnoteParagraph: /^\[\d+\]/,
    footnoteRegex: /\[\d+\]/g,
    expectedChapters: 33,
  },
];

let allOk = true;
for (const book of BOOKS) {
  const srcPath = path.join(SRC_DIR, book.file);
  if (!existsSync(srcPath)) {
    console.log(`✗ ${book.id.padEnd(20)} missing source file: ${srcPath}`);
    allOk = false;
    continue;
  }
  // Windows CRLF line endings -- the paragraph boundary is actually
  // "\r\n\r\n", which never contains two literal, adjacent "\n"
  // characters, so /\n\n+/ silently never matched it. That's what let
  // the Imitation of Christ's trailing footnote paragraph merge into the
  // real paragraph before it instead of splitting off on its own.
  // Normalizing here, before anything else runs, fixes it for all three
  // books at once rather than patching around CRLF in each regex.
  const raw = readFileSync(srcPath, 'utf8').replace(/\r\n/g, '\n');
  let body = book.source === 'ccel' ? raw : extractBody(raw, book.title);
  if (book.truncateAt) {
    const cut = body.indexOf(book.truncateAt);
    if (cut === -1) throw new Error(`${book.id}: truncateAt marker "${book.truncateAt}" not found`);
    body = body.slice(0, cut);
  }

  const markers = [...body.matchAll(book.chapterRegex)];
  if (markers.length !== book.expectedChapters) {
    console.log(`✗ ${book.id.padEnd(20)} expected ${book.expectedChapters} chapters, found ${markers.length} -- not writing this book`);
    allOk = false;
    continue;
  }

  const outDir = path.join(OUT_ROOT, book.id);
  mkdirSync(outDir, { recursive: true });

  let chapterNum = 0;
  let emptyFound = false;
  for (let i = 0; i < markers.length; i++) {
    chapterNum++;
    const spanStart = markers[i].index + markers[i][0].length;
    const spanEnd = i + 1 < markers.length ? markers[i + 1].index : body.length;
    let text = body.slice(spanStart, spanEnd);
    if (book.stripFootnoteParagraph) text = stripFootnoteParagraphs(text, book.stripFootnoteParagraph);
    if (book.truncateChapterAtRule) {
      // CCEL's rule lines are indented a few spaces rather than flush
      // left like Gutenberg's -- \s* tolerates either.
      const ruleMatch = text.match(/^\s*_{5,}\s*$/m);
      if (ruleMatch) text = text.slice(0, ruleMatch.index);
    }
    if (book.footnoteRegex) text = text.replace(book.footnoteRegex, '');
    text = cleanParagraphs(text);
    if (!text) { emptyFound = true; break; }
    writeFileSync(path.join(outDir, `${chapterNum}.json`), JSON.stringify(text));
  }

  if (emptyFound) {
    console.log(`✗ ${book.id.padEnd(20)} chapter ${chapterNum} came out empty after cleaning -- not writing this book`);
    allOk = false;
    continue;
  }

  console.log(`✓ ${book.id.padEnd(20)} ${chapterNum} chapters -> src/data/books/${book.id}/`);
}

if (!allOk) {
  console.log('\nOne or more books failed validation -- see ✗ lines above.');
  process.exit(1);
}
console.log('\nDone.');
