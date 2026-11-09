#!/bin/sh
# fetch-tests.sh - downloads the public 6502 test material into .cache/ (not committed).
#
#   Klaus Dormann's functional test  (GPL v3, https://github.com/Klaus2m5/6502_65C02_functional_tests)
#   Tom Harte's SingleStepTests      (MIT,    https://github.com/SingleStepTests/65x02)
#
# Both are pinned to a commit, and every file is checked against a checksum, so the
# test results mean the same thing for everybody. Third-party test material stays
# out of the repository on purpose.
#
# Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

set -e

KLAUS=7954e2dbb49c469ea286070bf46cdd71aeb29e4b
KLAUS_SHA256=fa12bfc761e6f9057e4cc01a665a7b800ff01ae91f598af1e39a1201d01953fd
SINGLESTEP=2f6980a2d95757486c7bee24355c360e40e2a224

HERE=$(cd "$(dirname "$0")" && pwd)
CACHE=$HERE/.cache
mkdir -p "$CACHE/singlestep"

if [ ! -f "$CACHE/6502_functional_test.bin" ]; then
    curl -sfL -o "$CACHE/6502_functional_test.bin" \
        "https://raw.githubusercontent.com/Klaus2m5/6502_65C02_functional_tests/$KLAUS/bin_files/6502_functional_test.bin"
fi
echo "$KLAUS_SHA256  $CACHE/6502_functional_test.bin" | shasum -a 256 -c - >/dev/null \
    || { echo "Checksum of the Klaus test does not match." >&2; rm -f "$CACHE/6502_functional_test.bin"; exit 1; }

# One file per opcode: only the opcodes our core knows (the list is in singlestep.mjs).
for code in $(node "$HERE/singlestep.mjs" --list); do
    file="$CACHE/singlestep/$code.json"
    [ -f "$file" ] || curl -sfL -o "$file" \
        "https://raw.githubusercontent.com/SingleStepTests/65x02/$SINGLESTEP/6502/v1/$code.json"
done
(cd "$CACHE/singlestep" && shasum -a 256 -c "$HERE/singlestep.sha256" >/dev/null) \
    || { echo "A SingleStepTests file does not match its checksum." >&2; exit 1; }
echo "Test material is in $CACHE"
