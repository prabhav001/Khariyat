// Checks the submission PDF against the assignment's measurable rules, using only Node.
// Same checks as verify_pdf.py: page count and size, the font size of every text run, word counts
// (cover, body, appendix), where the body ends, placeholder count, images and em dashes.
// Usage (once):  npm install --no-save pdfjs-dist@4.10.38
//        then:   node submission/verify-pdf.mjs submission/<file>.pdf
import fs from 'node:fs';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

const EM_DASH = String.fromCharCode(0x2014);
const A4 = [595.28, 841.89];
const words = (t) => t.split(/\s+/).filter((w) => /[0-9A-Za-zऀ-ॿ]/.test(w));

const file = process.argv[2];
if (!file) { console.error('Usage: node submission/verify-pdf.mjs <file.pdf>'); process.exit(2); }

const pdf = await getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0 }).promise;
let ok = true;
const texts = [];
console.log(`File: ${file}`);
console.log(`Pages: ${pdf.numPages}`);
for (let n = 1; n <= pdf.numPages; n++) {
  const page = await pdf.getPage(n);
  const { width, height } = page.getViewport({ scale: 1 });
  const a4 = Math.abs(width - A4[0]) < 2 && Math.abs(height - A4[1]) < 2;
  const content = await page.getTextContent();
  const text = content.items.map((i) => i.str + (i.hasEOL ? '\n' : '')).join('');
  texts.push(text);
  const sizes = content.items.filter((i) => i.str.trim()).map((i) => Math.round(Math.hypot(i.transform[2], i.transform[3]) * 100) / 100);
  const lo = sizes.length ? Math.min(...sizes) : null;
  const hi = sizes.length ? Math.max(...sizes) : null;
  const inRange = sizes.length > 0 && lo >= 9.95 && hi <= 13.05;
  const ops = await page.getOperatorList();
  const images = ops.fnArray.filter((f) => f === OPS.paintImageXObject || f === OPS.paintInlineImageXObject).length;
  ok = ok && a4 && inRange;
  const first = (text.trim().split('\n')[0] || '').slice(0, 60);
  console.log(`  page ${n}: ${width.toFixed(1)} x ${height.toFixed(1)} pt (${a4 ? 'A4 portrait' : 'NOT A4'}), font sizes ${lo}-${hi} pt (${inRange ? 'within 10-13' : 'OUT OF RANGE'}), ${words(text).length} words, ${images} image(s), first line: ${first}`);
}
const appStart = texts.findIndex((t) => t.trimStart().startsWith('Appendix'));
const body = appStart > 0 ? texts.slice(1, appStart) : texts.slice(1);
const coverW = words(texts[0] || '').length;
const bodyW = body.reduce((n, t) => n + words(t).length, 0);
const appW = appStart > 0 ? texts.slice(appStart).reduce((n, t) => n + words(t).length, 0) : 0;
console.log(`Cover words: ${coverW}`);
console.log(`Body pages: ${body.length} (pages 2-${1 + body.length}); body words: ${bodyW}`);
console.log(`Cover + body words (everything except the appendix): ${coverW + bodyW}`);
console.log(`Appendix pages: ${appStart > 0 ? texts.length - appStart : 0}; appendix words (not counted): ${appW}`);
ok = ok && body.length <= 2 && coverW + bodyW <= 1200 && (appStart < 0 || texts.length - appStart <= 2);
const all = texts.join('\n');
const dashes = all.split(EM_DASH).length - 1;
console.log(`Placeholders: ${all.split('PLACEHOLDER').length - 1}`);
const leftover = (all.match(/\[Your [^\]]*\]/g) || []);
console.log(`Unfilled personal-detail placeholders: ${leftover.length}${leftover.length ? ` (${leftover.join(', ')})` : ''}`);
console.log(`Em dashes (U+2014) in PDF text: ${dashes}`);
ok = ok && dashes === 0;
console.log(`RESULT: ${ok ? 'PASS' : 'FAIL'}${leftover.length ? ' (but personal details are still missing)' : ''}`);
process.exit(ok ? 0 : 1);
