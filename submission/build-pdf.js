// Builds the A4 submission PDF from khairiyat-2-pager.html with headless Chromium.
// Personal details come from details.json; empty values keep the template's placeholders.
// Usage: node submission/build-pdf.js   (needs Node and Playwright with Chromium)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const DIR = __dirname;
const details = JSON.parse(fs.readFileSync(path.join(DIR, 'details.json'), 'utf8'));
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
