// Builds the A4 submission PDF from khairiyat-2-pager.html with headless Chromium.
// Personal details come from details.local.json (git-ignored, so they never reach the public
// repository) or, if that file doesn't exist, from details.json. Empty values keep the placeholders.
// Usage (once, in the repository root): npm install && npx playwright install chromium
//        then: npm run build-pdf
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const DIR = __dirname;
const local = path.join(DIR, 'details.local.json');
const details = JSON.parse(fs.readFileSync(fs.existsSync(local) ? local : path.join(DIR, 'details.json'), 'utf8'));
const slug = (s, fallback) => (String(s || '').trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || fallback);
const outName = `${slug(details.name, 'YourName')}_${slug(details.college, 'YourCollege')}.pdf`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.join(DIR, 'khairiyat-2-pager.html')).href);
  await page.evaluate((d) => window.__setDetails(d), details);
  await page.evaluate(() => document.fonts.ready);
  const out = path.join(DIR, outName);
  await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await browser.close();
  console.log(out);
})().catch((e) => { console.error(e); process.exit(1); });
