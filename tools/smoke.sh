#!/usr/bin/env bash
# Runs tests/smoke.html headlessly and reports the result.
#
#   ./tools/smoke.sh
#
# Starts its own server on a spare port, drives Chrome, prints the results and
# exits non-zero on any failure.

set -uo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-8231}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PROFILE="$(mktemp -d)"
DUMP="$(mktemp)"

if [ ! -x "$CHROME" ]; then
  echo "Chrome not found at: $CHROME"
  echo "Set CHROME=/path/to/chrome and try again."
  exit 2
fi

python3 -m http.server "$PORT" >/dev/null 2>&1 &
SERVER=$!
cleanup() {
  kill "$SERVER" 2>/dev/null
  rm -rf "$PROFILE" "$DUMP"
}
trap cleanup EXIT
sleep 1

"$CHROME" --headless=new --disable-gpu --no-sandbox \
  --user-data-dir="$PROFILE" \
  --virtual-time-budget=45000 \
  --window-size=1200,1100 \
  --dump-dom "http://localhost:$PORT/tests/smoke.html" >"$DUMP" 2>/dev/null &
CHROME_PID=$!

# --virtual-time-budget can outrun the wall clock; give it a hard ceiling.
for _ in $(seq 1 60); do
  kill -0 "$CHROME_PID" 2>/dev/null || break
  sleep 1
done
kill "$CHROME_PID" 2>/dev/null

python3 - "$DUMP" <<'PY'
import html, re, sys

dom = open(sys.argv[1], encoding='utf-8').read()
match = re.search(r'<div id="out">(.*?)</div>', dom, re.S)
if not match:
    print('No test output — the page did not run.')
    sys.exit(1)

text = re.sub(r'<[^>]+>', '', match.group(1))
print(html.unescape(text).strip())

sys.exit(1 if ('FAIL' in text or 'THREW' in text) else 0)
PY
