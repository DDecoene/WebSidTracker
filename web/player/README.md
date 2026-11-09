# The player image

`player.prg` and `symbols.json` are the build output of the C64 player in [`src/`](../../src) (MIT licence, see [`../../LICENSE`](../../LICENSE)). They are committed so that the browser and the Node tests do not need an assembler. To rebuild them after a change in `src/`:

```
make player        # needs ACME and python3; runs tools/build-player.sh
```

| File | What |
|---|---|
| `player.prg` | one C64 program (2 load address bytes, then the data from `$0801` to the end of the song at `$3000`): BASIC line, raster interrupt, the player at `$1000`, the 15 instrument tables at `$2000`, the demo song at `$3000` |
| `symbols.json` | `{ "label": decimal address }` for the player's entry points, state block, tables and zero page, made from the assembler's symbol list by `tools/labels-to-json.py` |
| `test.mjs` | tests: `node --test web/player/test.mjs` (runs the player in the JavaScript 6502 core and the SID emulation) |

How the player works, where everything lives and what it does in odd cases: [`docs/player.md`](../../docs/player.md).
