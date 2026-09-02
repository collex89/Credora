// One-time build script: adds the seven deuterocanonical books to the
// existing World English Bible dataset (src/data/bible-web/), which until
// now only had the 66-book Protestant canon -- the reader silently fell
// back to Douay-Rheims for Tobit, Judith, Wisdom, Sirach, Baruch, and
// 1-2 Maccabees whenever someone was reading WEB, dropping from modern
// English into 400-year-old English with nothing to explain why.
//
// Source: eBible.org's "World English Bible Classic" (id eng-web), which
// includes the Deuterocanon -- same WEB translation and license already
// used for the other 66 books, just a different eBible.org edition of it.
// Public domain (see scripts/src_tmp/web_ce_usfm/copr.htm): "The World
// English Bible is in the Public Domain... You may copy, publish,
// distribute, sell... as much as you want." "World English Bible" itself
// is trademarked, so this stays labeled WEB rather than a new name.
// Downloaded from: https://eBible.org/Scriptures/eng-web_usfm.zip
//
// Format: USFM (Unified Standard Format Markers), a proper structured
// format with explicit \c and \v markers -- unlike the Gutenberg plain-text
// source parse-bible-versions.mjs had to regex out of "1:1 In the
// beginning..." runs, so this parses directly off those markers rather
// than reconstructing them.
//
// Chapter counts verified against the standard Catholic canon before
// writing any output (Tobit 14, Judith 16, Wisdom 19, Sirach 51, Baruch 6,
// 1 Maccabees 16, 2 Maccabees 15) -- this script throws if a parsed count
// doesn't match, rather than silently shipping a truncated book.
//
// Run with: node scripts/parse-web-ce-deuterocanon.mjs
// Source dir: scripts/src_tmp/web_ce_usfm/ (gitignored, not committed --
//             re-download from the URL above if these files are missing)
// Output:    src/data/bible-web/{tob,jdt,wis,sir,bar,1mac,2mac}.json

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, 'src_tmp', 'web_ce_usfm');
const OUT_DIR = path.join(__dirname, '..', 'src', 'data', 'bible-web');

// usfmFile -> [crescamus book id, expected chapter count]
const BOOKS = [
  ['41-TOBeng-web.usfm', 'tob', 14],
  ['42-JDTeng-web.usfm', 'jdt', 16],
  ['45-WISeng-web.usfm', 'wis', 19],
  ['46-SIReng-web.usfm', 'sir', 51],
  ['47-BAReng-web.usfm', 'bar', 6],
  ['52-1MAeng-web.usfm', '1mac', 16],
  ['53-2MAeng-web.usfm', '2mac', 15],
];

function parseUsfm(raw) {
  let text = raw
    // Footnotes and cross-references are translator/study notes, not
    // scripture -- drop the whole block, opening marker to closing marker.
    .replace(/\\f\b[\s\S]*?\\f\*/g, '')
    .replace(/\\x\b[\s\S]*?\\x\*/g, '')
    // Book intro paragraph (e.g. "Tobit is recognized as Deuterocanonical
    // Scripture by the Roman Catholic...") -- editorial, precedes chapter 1.
    .replace(/^\\ip.*$/gm, '')
    // Section headings (e.g. "The Prayer of Tobit") sit between two \v
    // markers and would otherwise get glued onto the verse before them.
    .replace(/^\\s1 .*$/gm, '')
    .replace(/^\\is1 .*$/gm, '')
    // Inline emphasis around a book name -- keep the name, drop the marker.
    .replace(/\\bk\*?/g, '');

  // Walk \c and \v markers in document order; a verse's text is everything
  // between it and whichever marker comes next.
  const markerRe = /\\c (\d+)|\\v (\S+)/g;
  const matches = [...text.matchAll(markerRe)];
  const chapters = {};
  let currentChapter = null;

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const isChapter = m[1] !== undefined;
    if (isChapter) {
      currentChapter = m[1];
      chapters[currentChapter] = [];
      continue;
    }
    // Verse bridges (e.g. "15-16", a handful in Sirach where Greek/Latin
    // versification splits differently) are stored once, under the first
    // number -- verse is an integer everywhere downstream (bible_highlights
    // and bible_bookmarks both declare it `integer not null`, and the
    // reader uses verse.v directly as a React key), so a "15-16" string
    // would break both.
    const verseNum = parseInt(m[2], 10);
    const spanStart = m.index + m[0].length;
    const spanEnd = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const cleaned = text.slice(spanStart, spanEnd)
      // Remaining bare structural markers (paragraph/poetry line breaks,
      // stanza spacing) carry no text of their own -- turn each into a
      // plain space so words on either side of one don't get glued
      // together, then collapse all whitespace/newlines below.
      .replace(/\\(p|pc|q1|q2|q3|b)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // A verse number with nothing left after stripping isn't a parsing
    // failure -- it means the source marks that traditional verse number
    // "omitted by the best authorities" (a textual-critical judgment about
    // Sirach's Greek manuscript tradition) and put its footnote-only
    // explanation where the footnote-strip above just removed it. The
    // number is kept in the source for cross-reference continuity with
    // older numbering (Vulgate/DR); since this app has no footnote
    // rendering, skipping it here is more honest than shipping an empty
    // verse row that would just look broken. 24 such verses in Sirach,
    // confirmed by hand against the raw USFM before this was written this
    // way -- none are lost content, all are the source's own choice.
    if (cleaned) chapters[currentChapter].push({ v: verseNum, t: cleaned });
  }
  return chapters;
}

let allOk = true;
for (const [file, id, expectedChapters] of BOOKS) {
  const srcPath = path.join(SRC_DIR, file);
  if (!existsSync(srcPath)) {
    console.log(`✗ ${id.padEnd(6)} missing source file: ${srcPath}`);
    allOk = false;
    continue;
  }
  const raw = readFileSync(srcPath, 'utf8');
  const chapters = parseUsfm(raw);
  const chapterCount = Object.keys(chapters).length;
  const verseCount = Object.values(chapters).reduce((n, vs) => n + vs.length, 0);

  if (chapterCount !== expectedChapters) {
    console.log(`✗ ${id.padEnd(6)} expected ${expectedChapters} chapters, got ${chapterCount} -- not writing this book`);
    allOk = false;
    continue;
  }
  const emptyVerse = Object.entries(chapters).find(([, vs]) => vs.some(v => !v.t));
  if (emptyVerse) {
    console.log(`✗ ${id.padEnd(6)} chapter ${emptyVerse[0]} has a verse with no text -- not writing this book`);
    allOk = false;
    continue;
  }

  writeFileSync(path.join(OUT_DIR, `${id}.json`), JSON.stringify(chapters));
  console.log(`✓ ${id.padEnd(6)} ${chapterCount} chapters, ${verseCount} verses -> src/data/bible-web/${id}.json`);
}

if (!allOk) {
  console.log('\nOne or more books failed validation -- see ✗ lines above. Nothing partial was left in place for those books.');
  process.exit(1);
}
console.log('\nDone.');
