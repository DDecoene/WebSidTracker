#!/bin/sh
# Builds the player image for the tracker: web/player/player.prg and web/player/symbols.json.
# Needs ACME and python3. The two output files are committed, so the browser and the Node tests
# do not need ACME; run this (or "make player") after changing anything in src/.
set -e
cd "$(dirname "$0")/.."
mkdir -p build web/player
acme -f cbm --cpu 6510 -I src -l build/player.lbl -r build/player.rpt -o web/player/player.prg src/runner.asm
python3 tools/labels-to-json.py build/player.lbl web/player/symbols.json
ls -l web/player/player.prg
