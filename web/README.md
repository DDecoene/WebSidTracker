# The web app

The browser tracker. It runs the real C64 player (`player/player.prg`) on a small 6502 core in JavaScript, sends the SID writes to reSIDfp compiled to WebAssembly, and plays the result through an AudioWorklet. Songs are edited as a model, serialised into the player's byte format and written into the emulated RAM while the song plays. How to use it: [docs/tracker-guide.md](../docs/tracker-guide.md).

Everything in `web/` is GPL version 3 or later, see [LICENSE](LICENSE). The C64 player in `src/` and the files the tracker exports are MIT and do not contain any of this code.

## Run it

A browser only loads an AudioWorklet from a web server, not from `file://`. There is no build step:

```
cd web
python3 -m http.server 8010
```

Open <http://127.0.0.1:8010/> for the landing page (`index.html` with `landing.css` and the screenshots in `img/`, plain HTML and CSS with no script), or <http://127.0.0.1:8010/tracker.html> for the tracker itself, which is the app. The published version is at <https://ddecoene.github.io/WebSidTracker/> (`.github/workflows/pages.yml` publishes this folder on every push to main that touches it). Audio starts at the first click or key press.

`sound-test.html` is the first piece of the project, kept as a check of the SID alone: a button and a 440 Hz pulse tone, a list to switch the chip model, and status text with the sample rate and peak level.

To check the SID without a browser: `node web/sid/test.mjs`. It plays the same tone, measures its pitch, and checks both chip models and the cycle counting. Pass a folder name and it also writes the two sounds there as WAV files. All test commands are in the [main README](../README.md#running-the-tests).

## Layers

```
 ui/ (pattern editor, instrument editor)   app/ (shell: header, dialogs, keys)
        |  every change goes through store.update
        v
 app/store.js      project + undo + selection + playhead
        |
        v
 app/session.js + app/live.js    model -> bytes (model/serialise.js) -> minimal RAM writes + playhead fix-up
        |  messages
        v
 engine/client.js  ---->  engine/worklet.js (audio thread) -> engine/engine.js
                                                        |  runs player.prg on cpu/cpu6502.js
                                                        v
                                             sid/sid.js -> sid/sid.wasm (reSIDfp)
```

## How the sound test fits together (the SID layer)

```
 sound-test.html + .js     the page: button, status text
        |  fetches sid.wasm, compiles it, sends it in a message
        v
 sound-test-worklet.js      runs in the browser's audio thread
        |  asks for 128 samples, 375 times a second
        v
 sid/sid.js                  loads sid.wasm, wraps its functions
        |
        v
 sid/sid.wasm                reSIDfp + sid/wrapper.cpp, compiled to WebAssembly
```

The registers of the tone are written by [`tone.js`](tone.js), in the same way a C64 program writes to `$D400` and up. In the tracker the real 6502 player does that job (`engine/engine.js`).

Two things worth knowing:

- **An AudioWorklet has no `fetch()`.** The page downloads `sid.wasm`, compiles it to a `WebAssembly.Module` and posts that to the worklet, which creates the SID from it.
- **The SID is clocked per cycle, the sound card per sample.** The chip runs 985,248 cycles per second (PAL), the sound card 44,100 or 48,000 samples per second. reSIDfp resamples between the two. `sid_clock(cycles)` runs a given number of cycles and returns however many samples that made. `sid_render(n)` runs until `n` samples exist and returns the cycles it took. The sound test uses the second; the tracker engine uses the first, because it knows at which cycle each register write happens.

## Files

| Path | What |
|---|---|
| `tracker.html`, `style.css` | the tracker page: header with file, transport and chip controls, the two panes, the export and help dialogs |
| `app/main.js` | starts the app: loads the autosave (browser storage) or the demo tune, wires the header, dialogs, Space, Ctrl/Cmd+Z, Ctrl/Cmd+S and `?` |
| `app/store.js` | the shared state: project, undo/redo (200 steps), selection, playhead |
| `app/session.js` | glue between store, model and engine: creates the engine on the first click or key, play, stop, mute, note audition, live edits, size and problem reports |
| `app/live.js` | the pure part of live editing: which bytes the engine holds, the smallest set of RAM writes for a change, the playhead fix-up |
| `app/panels.js` | the message strip, the help dialog and the export dialog |
| `app/files.js` | file names, download, open, copy to clipboard |
| `app/fake-model.mjs` | small stand-ins used by the session and live tests |
| `app/*.test.mjs` | tests for `files`, `live`, `session` and `store` |
| `model/project.js` | the song model: shapes, limits, validation, size info, the demo tune |
| `model/serialise.js` | model to the exact bytes of the player format, and back; the playhead maps |
| `model/export.js` | `instruments.asm`, `song_<name>.asm`, the `.prg`, and the project file (JSON) |
| `model/test.mjs` | tests for the three files above |
| `ui/editor.js`, `ui/editor.css` | the pattern and order editor (DOM, keyboard, mouse) |
| `ui/editor-logic.js` | its pure part: grid layout and every edit |
| `ui/instruments.js`, `ui/instruments.css` | the instrument editor (list, presets, sliders, graphs, audition piano) |
| `ui/instruments-logic.js` | its pure part: SID time tables, presets, field limits |
| `ui/*.test.mjs` | tests for the two logic files |
| `engine/engine.js` | 6502 + SID on a frame clock; no DOM, runs in the worklet and in Node |
| `engine/worklet.js` | the audio thread: turns messages into engine calls and fills sample blocks |
| `engine/client.js` | the page's side: creates the audio context, loads the files, sends messages |
| `engine/render-wav.mjs` | renders the demo song of the player image to a WAV file |
| `engine/test.mjs` | tests of the engine |
| `cpu/cpu6502.js` | the 6502 core: documented opcodes, exact cycle counts |
| `cpu/test.mjs` | hand-made tests |
| `cpu/klaus.mjs`, `cpu/singlestep.mjs`, `cpu/fetch-tests.sh`, `cpu/singlestep.sha256` | the public test material is downloaded by the script into `cpu/.cache` (not committed) and checked by checksum |
| `player/player.prg`, `player/symbols.json` | the built player image and its label addresses (made by `make player`), see [player/README.md](player/README.md) |
| `player/test.mjs` | the player tests |
| `sid/sid.js` | loads `sid.wasm` and wraps it in a small JavaScript object |
| `sid/sid.wasm` | the built SID emulation (committed, so you do not need Emscripten to work on the rest) |
| `sid/wrapper.cpp` | the C functions around reSIDfp that JavaScript can call |
| `sid/build.sh` | builds `sid.wasm` |
| `sid/no-threads.patch` | the one change we make to reSIDfp's source, see below |
| `sid/test.mjs` | the Node test |
| `sound-test.html`, `sound-test.js`, `sound-test-worklet.js`, `tone.js` | the sound test page, its audio thread and the demo tone (as SID register writes) |

## Rebuilding sid.wasm

You only need this when the SID side changes. Install [Emscripten](https://emscripten.org/) (on macOS: `brew install emscripten`) and run:

```
sh web/sid/build.sh
```

The script downloads the source of libresidfp 1.2.3, checks its SHA-256, applies the patch, and compiles it together with `wrapper.cpp`. The download and the generated headers go in `web/sid/.cache/`, which is not committed. The build is reproducible: the same inputs give the same `sid.wasm` byte for byte, wherever you build it, because file paths are mapped to fixed names.

## Third-party software: reSIDfp

`sid.wasm` contains **libresidfp 1.2.3** (reSIDfp), a cycle-exact SID emulation by Dag Lem, Antti S. Lankila, Ken Händel and Leandro Nini (see its AUTHORS file), licensed under the GNU General Public License version 2 or (at your option) any later version. Source: <https://github.com/libsidplayfp/libresidfp> (tag `v1.2.3`). That is the reason this folder is GPL.

We change one thing in its source, in `sid/no-threads.patch`. reSIDfp starts several threads to compute its filter tables and waits for them at once. A browser page cannot start threads without special HTTP headers (`SharedArrayBuffer`), which static hosts such as GitHub Pages do not send. The patch runs the same jobs one after the other. The tables come out the same.

## Notes from building it

- reSIDfp throws a C++ exception on invalid settings, so the module is built with `-fwasm-exceptions`, and `wrapper.cpp` catches everything so no exception reaches JavaScript.
- The module needs 32 MB of memory; 16 MB is not enough. The size is fixed at build time, which keeps the address of the sample buffer constant.
- The first chip of each model takes about 0.3 s to create, because reSIDfp builds its tables then. The worklet creates both models when it starts, so switching later does not stall the audio.
- The sample buffer is 16-bit mono. The worklet turns it into floats between -1 and 1.
