// One-time build script: parses the public-domain King James Version (KJV)
// and World English Bible (WEB) texts from Project Gutenberg into per-book
// JSON files, in the same {chapter: [{v,t}]} shape as the existing
// Douay-Rheims data (see scripts/parse-bible.mjs), so the Bible reader can
// offer a version picker backed by real, complete, offline scripture text.
//
// Both KJV and WEB follow the standard 66-book Protestant canon (no
// Tobias/Judith/Wisdom/Ecclesiasticus/Baruch/1-2 Machabees), so those seven
// books simply have no entry under bible-kjv/ or bible-web/ -- the reader
// falls back to Douay-Rheims for them.
//
// Run with: node scripts/parse-bible-versions.mjs
// Sources:  scripts/src_tmp/kjv_source.txt (Project Gutenberg ebook #10)
//           scripts/src_tmp/web_source.txt (Project Gutenberg ebook #8294)
// Output:   src/data/bible-kjv/<id>.json, src/data/bible-web/<id>.json

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Standard 66-book order shared by KJV and WEB, mapped to Crescamus's ids
// and the expected chapter count (used only as a validation sanity check).
const ORDERED_66 = [
  ['gen', 50], ['exo', 40], ['lev', 27], ['num', 36], ['deu', 34],
  ['jos', 24], ['jud', 21], ['rut', 4], ['1sam', 31], ['2sam', 24],
  ['1kin', 22], ['2kin', 25], ['1chr', 29], ['2chr', 36], ['ezr', 10],
  ['neh', 13], ['est', 10], ['job', 42], ['psa', 150], ['pro', 31],
  ['ecc', 12], ['sg', 8], ['isa', 66], ['jer', 52], ['lam', 5],
  ['eze', 48], ['dan', 12], ['hos', 14], ['joe', 3], ['amo', 9],
  ['oba', 1], ['jon', 4], ['mic', 7], ['nah', 3], ['hab', 3],
  ['zep', 3], ['hag', 2], ['zec', 14], ['mal', 4],
  ['mat', 28], ['mar', 16], ['luk', 24], ['joh', 21], ['act', 28],
  ['rom', 16], ['1cor', 16], ['2cor', 13], ['gal', 6], ['eph', 6],
  ['phi', 4], ['col', 4], ['1the', 5], ['2the', 3], ['1tim', 6],
  ['2tim', 4], ['tit', 3], ['phm', 1], ['heb', 13], ['jam', 5],
  ['1pet', 5], ['2pet', 3], ['1joh', 5], ['2joh', 1], ['3joh', 1],
  ['jud_nt', 1], ['rev', 22]
];

const KJV_TITLES = [
  'The First Book of Moses: Called Genesis', 'The Second Book of Moses: Called Exodus',
  'The Third Book of Moses: Called Leviticus', 'The Fourth Book of Moses: Called Numbers',
  'The Fifth Book of Moses: Called Deuteronomy', 'The Book of Joshua', 'The Book of Judges',
  'The Book of Ruth', 'The First Book of the Kings', 'The Second Book of the Kings',
  'The Third Book of the Kings', 'The Fourth Book of the Kings',
  'The First Book of the Chronicles', 'The Second Book of the Chronicles', 'Ezra',
  'The Book of Nehemiah', 'The Book of Esther', 'The Book of Job', 'The Book of Psalms',
  'The Proverbs', 'The Preacher', 'The Song of Solomon', 'The Book of the Prophet Isaiah',
  'The Book of the Prophet Jeremiah', 'The Lamentations of Jeremiah',
  'The Book of the Prophet Ezekiel', 'The Book of Daniel', 'Hosea', 'Joel', 'Amos',
  'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah',
  'Malachi', 'The Gospel According to Saint Matthew', 'The Gospel According to Saint Mark',
  'The Gospel According to Saint Luke', 'The Gospel According to Saint John',
  'The Acts of the Apostles', 'The Epistle of Paul the Apostle to the Romans',
  'The First Epistle of Paul the Apostle to the Corinthians',
  'The Second Epistle of Paul the Apostle to the Corinthians',
  'The Epistle of Paul the Apostle to the Galatians',
  'The Epistle of Paul the Apostle to the Ephesians',
  'The Epistle of Paul the Apostle to the Philippians',
  'The Epistle of Paul the Apostle to the Colossians',
  'The First Epistle of Paul the Apostle to the Thessalonians',
  'The Second Epistle of Paul the Apostle to the Thessalonians',
  'The First Epistle of Paul the Apostle to Timothy',
  'The Second Epistle of Paul the Apostle to Timothy',
  'The Epistle of Paul the Apostle to Titus', 'The Epistle of Paul the Apostle to Philemon',
  'The Epistle of Paul the Apostle to the Hebrews', 'The General Epistle of James',
  'The First Epistle General of Peter', 'The Second General Epistle of Peter',
  'The First Epistle General of John', 'The Second Epistle General of John',
  'The Third Epistle General of John', 'The General Epistle of Jude',
  'The Revelation of Saint John the Divine'
];

function extractBody(text) {
  const startMarker = '*** START OF THE PROJECT GUTENBERG EBOOK';
  const endMarker = '*** END OF THE PROJECT GUTENBERG EBOOK';
  const start = text.indexOf('\n', text.indexOf(startMarker));
  return text.slice(start, text.indexOf(endMarker));
}

function verseSplit(flatText, chapterPad) {
  // Splits "1:1 In the beginning... 1:2 And the earth..." into
  // { [chapter]: [{v,t}] }, tolerant of both "1:1" and "001:001" forms.
  const pattern = chapterPad
    ? /(\d{3}):(\d{3}) /g
    : /(?:^|\s)(\d{1,3}):(\d{1,3}) /g;
  const chapters = {};
  const marks = [...flatText.matchAll(pattern)];
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    const chapterNum = parseInt(m[1], 10);
    const verseNum = parseInt(m[2], 10);
    const textStart = m.index + m[0].length;
    const textEnd = i + 1 < marks.length ? marks[i + 1].index : flatText.length;
    const verseText = flatText.slice(textStart, textEnd).trim();
    if (!verseText) continue;
    if (!chapters[chapterNum]) chapters[chapterNum] = [];
    chapters[chapterNum].push({ v: verseNum, t: verseText });
  }
  return chapters;
}

function writeVersion(versionName, chaptersByBook, outDirName) {
  const OUT_DIR = path.join(__dirname, '..', 'src', 'data', outDirName);
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const report = [`=== ${versionName} ===`];
  for (const [id, expectedChapters] of ORDERED_66) {
    const chapters = chaptersByBook.get(id);
    if (!chapters) {
      report.push(`MISSING BOOK: ${id}`);
      continue;
    }
    const chapterNums = Object.keys(chapters).map(Number).sort((a, b) => a - b);
    const totalVerses = chapterNums.reduce((sum, c) => sum + chapters[c].length, 0);
    const flag = chapterNums.length !== expectedChapters ? '  <== CHAPTER COUNT MISMATCH' : '';
    report.push(`${id.padEnd(7)} chapters ${String(chapterNums.length).padStart(3)}/${expectedChapters}  verses ${totalVerses}${flag}`);
    writeFileSync(path.join(OUT_DIR, `${id}.json`), JSON.stringify(chapters));
  }
  return report;
}

// --- KJV ---
const kjvText = readFileSync(path.join(__dirname, 'src_tmp', 'kjv_source.txt'), 'utf-8');
const kjvBody = extractBody(kjvText);
const kjvByBook = new Map();
{
  // Book titles are unreliable anchors on their own: some appear in a
  // front-matter listing AND before their real section, and four books
  // (1-2 Samuel, 1-2 Kings) nest an "Otherwise/Commonly Called:" alt-title
  // that duplicates ANOTHER book's heading text ("The First Book of the
  // Kings" is both 1 Samuel's alt-title and the literal heading of 1
  // Kings). The one reliable signal is that the real section heading is
  // always immediately followed (allowing blank lines) by "1:1 ".
  const realAnchorEnd = (title) => {
    const re = new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'gm');
    for (const m of kjvBody.matchAll(re)) {
      const after = kjvBody.slice(m.index + m[0].length, m.index + m[0].length + 40);
      if (/^\s*1:1 /.test(after)) return m.index + m[0].length;
    }
    return null;
  };

  const starts = KJV_TITLES.map(realAnchorEnd);
  for (let i = 0; i < KJV_TITLES.length; i++) {
    const start = starts[i];
    if (start === null) continue;
    const end = i + 1 < KJV_TITLES.length && starts[i + 1] !== null ? starts[i + 1] : kjvBody.length;
    const section = kjvBody.slice(start, end);
    const flat = section.replace(/\r/g, '').split('\n').map(l => l.trim()).join(' ').replace(/\s+/g, ' ').trim();
    const [id] = ORDERED_66[i];
    kjvByBook.set(id, verseSplit(flat, false));
  }
}
const kjvReport = writeVersion('KJV', kjvByBook, 'bible-kjv');

// --- WEB ---
const webText = readFileSync(path.join(__dirname, 'src_tmp', 'web_source.txt'), 'utf-8');
const webBody = extractBody(webText);
const webByBook = new Map();
{
  const headerRe = /^Book (\d{2}) (.+)$/gm;
  const heads = [...webBody.matchAll(headerRe)];
  for (let i = 0; i < heads.length; i++) {
    const bookIdx = parseInt(heads[i][1], 10) - 1;
    if (bookIdx < 0 || bookIdx >= ORDERED_66.length) continue;
    const start = heads[i].index + heads[i][0].length;
    const end = i + 1 < heads.length ? heads[i + 1].index : webBody.length;
    let section = webBody.slice(start, end);
    section = section.replace(/\{[^}]*\}/gs, ''); // strip footnotes
    const flat = section.replace(/\r/g, '').split('\n').map(l => l.trim()).join(' ').replace(/\s+/g, ' ').trim();
    const [id] = ORDERED_66[bookIdx];
    webByBook.set(id, verseSplit(flat, true));
  }
}
const webReport = writeVersion('WEB', webByBook, 'bible-web');

writeFileSync(path.join(__dirname, 'parse-versions-report.txt'), [...kjvReport, '', ...webReport].join('\n'));
console.log([...kjvReport, '', ...webReport].join('\n'));
