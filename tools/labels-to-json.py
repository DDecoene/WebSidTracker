#!/usr/bin/env python3
"""Turn the symbol list of ACME (acme -l file) into web/player/symbols.json.

The JSON is a flat object { "label": decimal address }. Only the labels the tracker and the
tests need are kept (the player's entry points, state block, tables and the demo song);
the many small labels and constants of the sources stay out.

usage: labels-to-json.py build/player.lbl web/player/symbols.json
"""
import json
import re
import sys

KEEP = re.compile(
    r"^(music_|inst_|st_|zp_|out_|freq_|song_|pat_|pattern_|order_)"
    r"|^(start|irq|multiply|divide|vibrato|play_voice)$"
    r"|^(format_version|release_(major|minor|patch))$"
)

symbols = {}
for line in open(sys.argv[1]):
    # ACME writes:   <tab>name<tab>= $1234<tab>; comment
    match = re.match(r"\s*(\w+)\s*=\s*\$([0-9a-fA-F]+)", line)
    if match and KEEP.match(match.group(1)):
        symbols[match.group(1)] = int(match.group(2), 16)

ordered = dict(sorted(symbols.items(), key=lambda item: (item[1], item[0])))
with open(sys.argv[2], "w") as out:
    json.dump(ordered, out, indent=1)
    out.write("\n")
print(f"{len(ordered)} symbols written to {sys.argv[2]}")
