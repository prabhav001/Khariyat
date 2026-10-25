# Submission compliance record

Checked against the official brief, “Prompt 2 | Case Submission | Flipkart APM 2029” (4-page PDF: cover template, leading questions and submission instructions, two blank pages).

| Requirement (source) | How it was met | Verified by |
|---|---|---|
| PDF only (2b) | `YourName_YourCollege.pdf`, built from `khairiyat-2-pager.html` by headless Chromium | `pdfinfo` opens it; all pages rendered and inspected |
| 1,200-word limit, excluding appendices (2b) | Cover 71 + body 1,101 = **1,172 words**, placeholders included. A second count from the HTML gives 71 + 1,097 = 1,168. Appendix (457 words) excluded. | `verify_pdf.py`; DOM word count |
| Body at most 2 pages, excluding cover and appendices (2c) | Cover (page 1), body (pages 2 and 3), appendix (page 4) | `verify_pdf.py`: the appendix starts on page 4 |
| Font size 10 to 13, portrait, A4 (2d) | Every character between **10.0 and 13.0 pt**; all four pages 595 × 842 pt, portrait | `verify_pdf.py` reads the size of every character |
| Visual aids allowed (2e) | Only marked placeholders (two tables, one diagram); no charts, diagrams or tables were produced. The only images are the template's logo on the cover. | Page images counted; pages inspected |
| Appendix at most 2 pages: references, citations, primary research (2f) | One page: references, a fact / assumption / hypothesis register, how to open the prototype | `verify_pdf.py` |
| Use a copy of the template (2a) | The cover reproduces the template's structure, wording, blue (#1155CC) and logo. The body follows the four leading questions, plus a short risks section. | Side-by-side visual check |
| File name `<your name>_<your college>` (4) | **Not yet possible**: the details are unknown. Copy `details.json` to `details.local.json` (git-ignored), fill it in and run `node submission/build-pdf.js`; the file is then named, for example, `Priya-Sharma_BITS-Pilani.pdf`. | |
| No em dashes (U+2014) | 0 in the PDF text (pdfplumber and pdftotext), 0 in all source and documentation files | `verify_pdf.py`, `qa/check-no-em-dash.js` |

## Interpretations

- **Page size.** The template document is 1800 × 2250 pt, not A4. The instructions require A4, so A4 was used and the template's layout was reproduced on it.
- **Font size unit.** The brief says “10 px to 13 px” for body text, but Google Docs font sizes, which the template uses, are points. Every visible element, not only body text, is set between 10 and 13 **pt**, as instructed for this submission. A strictly literal CSS-pixel reading (13 px ≈ 9.75 pt) cannot be met at the same time as a 10 pt minimum.
- **Template fonts.** Lexend and Outfit could not be installed offline. Liberation Sans, which is metrically compatible with Arial (the template's own text font), is used throughout, and FreeSans covers the Devanagari in the title.
- **Cover sizes.** The template's cover text is 61 to 85 pt on its large page (about 20 to 28 pt if scaled to A4). It is set at 12 to 13 pt to stay within the size rule; the cover's layout, wording and colours are kept.
- **Template page 2** (leading questions and instructions) is guidance, not content, so it is omitted. Its four questions are the body's section headings.
- **Word count.** The cover is counted, even though the brief excludes only appendices. Placeholder text is counted. Replacing the four detail placeholders (13 words) with real details changes the total by a few words.

## Not verified

- **Reference links** were not re-opened from this environment: its network policy blocked the three hosts tried (`prsindia.org`, `blog.whatsapp.com`, `www.fonearena.com`). Each fact was cross-checked through search-engine extracts from several outlets. The WhatsApp sources had also been checked earlier in this project.
- **Personal details and the final file name** are not filled in.

## Re-checking a rebuilt PDF

Either checker gives the same page, size and placement results. Their word totals can differ by one, because the two tools split the Devanagari title differently.

- **Python:** `pip install pdfplumber`, then `python3 submission/verify_pdf.py <file.pdf>` (on Windows, `py` instead of `python3`).
- **Node only:** `npm install --no-save pdfjs-dist@4.10.38`, then `node submission/verify-pdf.mjs <file.pdf>`. It also reports any `[Your ...]` placeholder left unfilled.
