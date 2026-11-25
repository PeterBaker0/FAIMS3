#!/usr/bin/env python3
"""List review comments (highlight, note and free-text annotations) in a PDF.

Usage: docs/mel/extract-comments.py FILE.pdf

Uses only the standard library. Handles PDFs whose annotation objects are
stored uncompressed, which is what PDF viewers write when adding comments to
the Chromium-generated PDFs from build-pdf.sh.
"""
import re
import sys

ANNOT_TYPES = (b'/Highlight', b'/Text', b'/FreeText', b'/Underline', b'/StrikeOut')


def unescape(raw: bytes) -> str:
    if raw.startswith(b'\xfe\xff'):
        return raw[2:].decode('utf-16-be', errors='replace')
    text = raw.decode('latin1')
    return re.sub(r'\\([nrt()\\])', lambda m: {'n': '\n', 'r': '', 't': '\t'}.get(m.group(1), m.group(1)), text)


def main(path: str) -> None:
    data = open(path, 'rb').read()
    objs = {int(m.group(1)): m.group(2) for m in re.finditer(rb'(\d+) 0 obj\s*(.*?)endobj', data, re.S)}

    def leaves(num: int) -> list:
        body = objs[num]
        if b'/Type /Pages' not in body:
            return [num]
        kids = re.search(rb'/Kids \[(.*?)\]', body, re.S).group(1)
        return [p for k in re.findall(rb'(\d+) 0 R', kids) for p in leaves(int(k))]

    root = next(n for n, b in objs.items() if b'/Type /Pages' in b and b'/Parent' not in b)
    pages = leaves(root)

    found = []
    for num, body in objs.items():
        if b'/Type /Annot' not in body or not any(b'/Subtype ' + t in body for t in ANNOT_TYPES):
            continue
        contents = re.search(rb'/Contents \((.*?)(?<!\\)\)', body, re.S)
        page_ref = re.search(rb'/P (\d+) 0 R', body)
        rect = re.search(rb'/Rect \[([^\]]*)\]', body)
        page = pages.index(int(page_ref.group(1))) + 1 if page_ref and int(page_ref.group(1)) in pages else 0
        top = float(rect.group(1).split()[3]) if rect else 0
        found.append((page, -top, num, unescape(contents.group(1)) if contents else ''))

    for page, neg_top, num, text in sorted(found):
        print(f'page {page} (y={-neg_top:.0f}, obj {num}): {text}\n')
    print(f'{len(found)} comment(s)')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
