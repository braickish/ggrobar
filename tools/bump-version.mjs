// Gives every file the page loads a new version tag (?v=...), so browsers fetch the whole new release
// together instead of mixing cached files from the last one. Run before pushing: npm run bump
import fs from 'node:fs';

const v = new Date().toISOString().replace(/\D/g, '').slice(0, 12);   // e.g. 202611091530
let changed = 0;
for (const file of ['index.html', 'game.js']) {
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(/(\.(?:js|css))\?v=[\w.]+/g, `$1?v=${v}`);
  if (after !== before) { fs.writeFileSync(file, after); changed++; }
}
console.log(`version ${v} (${changed} files updated)`);
