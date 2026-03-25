const fs = require('fs');
const path = require('path');

const GA_TAGS = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-VWXNSYLPZE"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-VWXNSYLPZE');</script>`;

const files = [
  'index.html',
  'pages/about.html',
  'pages/account.html',
  'pages/browse.html',
  'pages/room.html',
  'pages/rooms.html',
  'pages/design-system.html',
  'pages/games/bau-cua.html',
  'pages/games/fanorona.html',
  'pages/games/ganjifa.html',
  'pages/games/hnefatafl.html',
  'pages/games/latrunculi.html',
  'pages/games/mahjong.html',
  'pages/games/o-an-quan.html',
  'pages/games/oware.html',
  'pages/games/pachisi.html',
  'pages/games/pallanguzhi.html',
  'pages/games/patolli.html',
  'pages/games/puluc.html',
  'pages/games/tien-len.html',
  'cachos/index.html',
  'profile/index.html',
  'how-to-play/oware/index.html',
  'how-to-play/bau-cua/index.html',
  'how-to-play/pallanguzhi/index.html',
  'how-to-play/fanorona/index.html',
];

const BASE = path.join(__dirname);
const MARKER = '<meta charset="UTF-8" />';

let updated = 0;
let skipped = 0;
let errors = 0;

for (const rel of files) {
  const fullPath = path.join(BASE, rel);
  let content;
  try {
    content = fs.readFileSync(fullPath, 'utf8');
  } catch (e) {
    console.error(`ERROR reading ${rel}: ${e.message}`);
    errors++;
    continue;
  }

  if (!content.includes(MARKER)) {
    console.warn(`WARN: marker not found in ${rel} - skipping`);
    skipped++;
    continue;
  }

  if (content.includes('G-VWXNSYLPZE')) {
    console.log(`SKIP (already has GA): ${rel}`);
    skipped++;
    continue;
  }

  const newContent = content.replace(MARKER, `${MARKER}\n${GA_TAGS}`);
  try {
    fs.writeFileSync(fullPath, newContent, 'utf8');
    console.log(`OK: ${rel}`);
    updated++;
  } catch (e) {
    console.error(`ERROR writing ${rel}: ${e.message}`);
    errors++;
  }
}

console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`);
