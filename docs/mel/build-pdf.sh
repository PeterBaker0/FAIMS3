#!/usr/bin/env bash
# Build nicely formatted PDFs from markdown: pandoc renders a self-contained
# HTML page, then headless Chromium prints it to PDF.
#
# Usage:
#   docs/mel/build-pdf.sh [--landscape] [--keep-html] [--out DIR] [FILE.md ...]
#
# With no files, every *.md in docs/mel is built. Output goes to docs/mel/out.
# Set CHROME_BIN to choose the browser binary.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CSS="$SCRIPT_DIR/assets/mel.css"
OUT_DIR="$SCRIPT_DIR/out"
LANDSCAPE=false
KEEP_HTML=false
FILES=()

usage() {
  sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --landscape) LANDSCAPE=true ;;
    --keep-html) KEEP_HTML=true ;;
    --out)
      OUT_DIR="$2"
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
    *) FILES+=("$1") ;;
  esac
  shift
done

if [[ ${#FILES[@]} -eq 0 ]]; then
  shopt -s nullglob
  FILES=("$SCRIPT_DIR"/*.md)
  shopt -u nullglob
fi

if ! command -v pandoc >/dev/null 2>&1; then
  cat >&2 <<'EOF'
pandoc not found. Install it with your package manager, or without root:
  download https://github.com/jgm/pandoc/releases (linux-amd64 tarball)
  and copy bin/pandoc into ~/.local/bin
EOF
  exit 1
fi

find_chrome() {
  if [[ -n "${CHROME_BIN:-}" ]]; then
    echo "$CHROME_BIN"
    return
  fi
  local candidate
  for candidate in chrome-headless-shell google-chrome google-chrome-stable chromium chromium-browser; do
    if command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return
    fi
  done
  # Playwright's cache. The headless shell is preferred: full Chromium can hang
  # on --print-to-pdf when there is no display or session bus.
  local cache
  for cache in ${PLAYWRIGHT_BROWSERS_PATH:+"$PLAYWRIGHT_BROWSERS_PATH"} "$HOME/.cache/ms-playwright"; do
    candidate="$(ls -d "$cache"/chromium_headless_shell-*/chrome-*/chrome-headless-shell 2>/dev/null | sort -V | tail -n1 || true)"
    if [[ -z "$candidate" ]]; then
      candidate="$(ls -d "$cache"/chromium-*/chrome-linux*/chrome 2>/dev/null | sort -V | tail -n1 || true)"
    fi
    if [[ -n "$candidate" ]]; then
      echo "$candidate"
      return
    fi
  done
  local mac='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if [[ -x "$mac" ]]; then
    echo "$mac"
  fi
}

CHROME="$(find_chrome)"
if [[ -z "$CHROME" ]]; then
  echo "No Chromium/Chrome found. Set CHROME_BIN to a Chrome binary." >&2
  exit 1
fi

TIMEOUT=()
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT=(timeout "${CHROME_TIMEOUT:-60}")
fi

mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"
TMP_DIR="$(mktemp -d "$OUT_DIR/.build.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

EXTRA_CSS=()
if $LANDSCAPE; then
  echo '@page { size: A4 landscape; }' >"$TMP_DIR/landscape.css"
  EXTRA_CSS=(--css "$TMP_DIR/landscape.css")
fi

for md in "${FILES[@]}"; do
  name="$(basename "${md%.md}")"
  html="$OUT_DIR/$name.html"
  pdf="$OUT_DIR/$name.pdf"

  # Front matter `toc: false` skips the contents page.
  TOC=(--toc --toc-depth=3)
  if sed -n '1,/^---$/{/^---$/!p}' "$md" | grep -qE '^toc:[[:space:]]*false'; then
    TOC=()
  fi

  pandoc "$md" \
    --from markdown \
    --to html5 \
    --standalone \
    --columns 10000 \
    --embed-resources \
    ${TOC[@]+"${TOC[@]}"} \
    --metadata lang=en-AU \
    --metadata pagetitle="$name" \
    --resource-path="$(dirname "$md"):$SCRIPT_DIR" \
    --css "$CSS" \
    ${EXTRA_CSS[@]+"${EXTRA_CSS[@]}"} \
    --output "$html"

  if ! ${TIMEOUT[@]+"${TIMEOUT[@]}"} "$CHROME" \
    --headless \
    --disable-gpu \
    --no-sandbox \
    --no-pdf-header-footer \
    --user-data-dir="$TMP_DIR/chrome-profile" \
    --print-to-pdf="$pdf" \
    "file://$html" >"$TMP_DIR/chrome.log" 2>&1; then
    echo "Chrome failed to print $html (binary: $CHROME). Log:" >&2
    tail -n 20 "$TMP_DIR/chrome.log" >&2
    exit 1
  fi

  if ! $KEEP_HTML; then
    rm -f "$html"
  fi
  echo "Built $pdf"
done
