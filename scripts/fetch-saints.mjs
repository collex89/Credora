// One-time enrichment script: pulls real biographies (Wikipedia article
// intros, CC BY-SA) and verifies each portrait's license on Wikimedia
// Commons before using it, so Crescamus only ships images that are actually
// free to use (public domain or open-licensed), never assumed.
//
// Run with: node scripts/fetch-saints.mjs
// Output:   scripts/saints-enriched.json  (reviewed, then merged into mockData.js by hand)

import { writeFileSync, existsSync, readFileSync } from 'fs';

const OUT_PATH = new URL('./saints-enriched.json', import.meta.url);
const previous = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, 'utf-8')) : [];
const alreadyOk = new Set(previous.filter(r => r.ok && r.image).map(r => r.id));

const SAINTS = [
  { id: 'therese', title: 'Thérèse of Lisieux' },
  { id: 'francis', title: 'Francis of Assisi' },
  { id: 'augustine', title: 'Augustine of Hippo' },
  { id: 'joan', title: 'Joan of Arc' },
  { id: 'johnpaul', title: 'Pope John Paul II' },
  { id: 'aquinas', title: 'Thomas Aquinas' },
  { id: 'teresaavila', title: 'Teresa of Ávila' },
  { id: 'kolbe', title: 'Maximilian Kolbe' },
  { id: 'sebastian', title: 'Saint Sebastian' },
  { id: 'piusx', title: 'Pope Pius X' },
  { id: 'agnes', title: 'Agnes of Rome' },
  { id: 'cecilia', title: 'Cecilia of Rome' },
  { id: 'xavier', title: 'Francis Xavier' },
  { id: 'jogues', title: 'Isaac Jogues' },
  { id: 'josephcup', title: 'Joseph of Cupertino' },
  { id: 'padrepio', title: 'Padre Pio' },
  { id: 'teresacalcutta', title: 'Mother Teresa' },
  { id: 'clare', title: 'Clare of Assisi' },
  { id: 'patrick', title: 'Saint Patrick' },
  { id: 'monica', title: 'Saint Monica' },
  { id: 'peter', title: 'Saint Peter' },
  { id: 'paul', title: 'Paul the Apostle' },
  { id: 'anthonypadua', title: 'Anthony of Padua' },
  { id: 'bernadette', title: 'Bernadette Soubirous' },
  { id: 'martindeporres', title: 'Martin de Porres' },
  { id: 'judethaddeus', title: 'Jude Thaddeus the Apostle' },
  { id: 'rita', title: 'Rita of Cascia' },
  { id: 'christopher', title: 'Saint Christopher' },
  { id: 'anne', title: 'Saint Anne' },
  { id: 'johnbaptist', title: 'John the Baptist' },
  { id: 'nativitymary', title: 'Nativity of Mary' }
];

const FREE_LICENSE = /public domain|cc0|cc-by|cc by/i;
const MAX_BIO_LENGTH = 1600;

function trimToParagraph(text, maxLen) {
  if (text.length <= maxLen) return text.trim();
  const cut = text.slice(0, maxLen);
  const lastBreak = Math.max(cut.lastIndexOf('\n\n'), cut.lastIndexOf('. '));
  return (lastBreak > maxLen * 0.5 ? cut.slice(0, lastBreak + 1) : cut).trim();
}

async function fetchJSON(url, attempt = 1) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Crescamus-App/1.0 (contact: app content enrichment script; one-time batch run)' } });
  if (res.status === 429 && attempt <= 5) {
    const wait = attempt * 4000;
    console.log(`  (rate limited, waiting ${wait / 1000}s...)`);
    await new Promise(r => setTimeout(r, wait));
    return fetchJSON(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.json();
}

async function checkImageLicense(fileTitle) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(fileTitle)}&prop=imageinfo&iiprop=extmetadata&format=json&origin=*`;
  const data = await fetchJSON(url);
  const page = Object.values(data.query.pages)[0];
  const meta = page?.imageinfo?.[0]?.extmetadata;
  if (!meta) return { free: false, license: 'unknown' };
  const license = meta.LicenseShortName?.value || meta.UsageTerms?.value || 'unknown';
  return { free: FREE_LICENSE.test(license), license };
}

async function fetchSaint({ id, title }) {
  const encodedTitle = encodeURIComponent(title.replace(/ /g, '_'));

  const extractData = await fetchJSON(
    `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodedTitle}&format=json&origin=*`
  );
  const extractPage = Object.values(extractData.query.pages)[0];
  const rawBio = extractPage?.extract || '';
  if (!rawBio) {
    return { id, title, ok: false, reason: 'No Wikipedia extract found' };
  }

  const summary = await fetchJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodedTitle}`);
  const imageUrl = summary.originalimage?.source || null;

  let image = null;
  let imageLicense = null;
  if (imageUrl) {
    // Thumbnail URLs end in a "/400px-Filename.ext" segment — the real file
    // name is the segment before that, not the last one.
    const parts = imageUrl.split('/');
    const rawName = parts.includes('thumb') ? parts[parts.length - 2] : parts[parts.length - 1];
    const fileTitle = 'File:' + decodeURIComponent(rawName);
    try {
      const { free, license } = await checkImageLicense(fileTitle);
      imageLicense = license;
      if (free) image = imageUrl;
    } catch {
      imageLicense = 'check failed';
    }
  }

  return {
    id,
    ok: true,
    wikipediaTitle: summary.title,
    sourceUrl: summary.content_urls?.desktop?.page,
    bio: trimToParagraph(rawBio, MAX_BIO_LENGTH),
    image,
    imageLicense
  };
}

const results = [];
for (const saint of SAINTS) {
  if (alreadyOk.has(saint.id)) {
    results.push(previous.find(r => r.id === saint.id));
    console.log(`= ${saint.id.padEnd(14)} (already have a good result, skipping)`);
    continue;
  }
  try {
    const result = await fetchSaint(saint);
    results.push(result);
    console.log(`${result.ok ? '✓' : '✗'} ${saint.id.padEnd(14)} bio:${(result.bio || '').length.toString().padStart(5)}  image:${result.image ? 'OK' : `SKIPPED (${result.imageLicense})`}`);
  } catch (err) {
    results.push({ id: saint.id, ok: false, reason: err.message });
    console.log(`✗ ${saint.id.padEnd(14)} ERROR: ${err.message}`);
  }
  await new Promise(r => setTimeout(r, 2500)); // be polite to the API
}

writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));
console.log(`\nWrote ${results.length} entries to scripts/saints-enriched.json`);
