"""Checks the submission PDF against the assignment's measurable rules.

Usage: python3 submission/verify_pdf.py <file.pdf>
Reports page count and size, the font-size range of every character, word counts
(cover, body, appendix), where the body ends, placeholder count, images, and em dashes.
"""
import re
import sys
import pdfplumber

EM_DASH = chr(0x2014)
A4 = (595.28, 841.89)


def words(text):
    return [w for w in re.split(r"\s+", text) if re.search(r"[0-9A-Za-zऀ-ॿ]", w)]


def main(path):
    ok = True
    with pdfplumber.open(path) as pdf:
        pages = pdf.pages
        print(f"File: {path}")
        print(f"Pages: {len(pages)}")
        texts = [p.extract_text() or "" for p in pages]
        for i, p in enumerate(pages, 1):
            w, h = p.width, p.height
            a4 = abs(w - A4[0]) < 2 and abs(h - A4[1]) < 2
            sizes = [round(c["size"], 2) for c in p.chars if c["text"].strip()]
            lo, hi = (min(sizes), max(sizes)) if sizes else (None, None)
            in_range = sizes and lo >= 9.95 and hi <= 13.05
            ok &= bool(a4 and in_range)
            print(f"  page {i}: {w:.1f} x {h:.1f} pt ({'A4 portrait' if a4 else 'NOT A4'}), "
                  f"font sizes {lo}-{hi} pt ({'within 10-13' if in_range else 'OUT OF RANGE'}), "
                  f"{len(words(texts[i - 1]))} words, {len(p.images)} image(s), "
                  f"first line: {texts[i - 1].strip().splitlines()[0][:60] if texts[i - 1].strip() else ''}")
        app_start = next((i for i, t in enumerate(texts) if t.lstrip().startswith("Appendix")), None)
        body = texts[1:app_start] if app_start else texts[1:]
        cover_w = len(words(texts[0]))
        body_w = sum(len(words(t)) for t in body)
        app_w = sum(len(words(t)) for t in texts[app_start:]) if app_start else 0
        print(f"Cover words: {cover_w}")
        print(f"Body pages: {len(body)} (pages 2-{1 + len(body)}); body words: {body_w}")
        print(f"Cover + body words (everything except the appendix): {cover_w + body_w}")
        print(f"Appendix pages: {len(texts) - app_start if app_start else 0}; appendix words (not counted): {app_w}")
        ok &= len(body) <= 2 and cover_w + body_w <= 1200
        if app_start:
            ok &= len(texts) - app_start <= 2
        all_text = "\n".join(texts)
        n_dash = all_text.count(EM_DASH)
        print(f"Placeholders: {all_text.count('PLACEHOLDER')}")
        print(f"Em dashes (U+2014) in PDF text: {n_dash}")
        ok &= n_dash == 0
    print("RESULT:", "PASS" if ok else "FAIL")
    return ok


if __name__ == "__main__":
    sys.exit(0 if main(sys.argv[1]) else 1)
