# The web app

This folder will hold the browser tracker. For now it holds its first and riskiest part: **a SID chip in the browser**. reSIDfp, an accurate emulation of the Commodore 64 sound chip, is compiled to WebAssembly and played through an AudioWorklet. Press a button, hear a tone.

Everything in `web/` is GPL version 3 or later, see [LICENSE](LICENSE). The C64 player in `src/` and the files the tracker will export are MIT and do not contain any of this code.

## Try it

A browser only loads an AudioWorklet from a web server, not from `file://`:

```
python3 -m http.server 8010 --directory web
```

Open <http://127.0.0.1:8010/>, press Play, and you hear a 440 Hz pulse tone on voice 1. The list next to the button switches between the two SID models. The text under it shows the sample rate, how many samples the SID has made and the peak level, so you can see the audio thread is alive.

To check the SID without a browser:

```
node web/sid/test.mjs
```

It plays the same tone, measures its pitch, and checks both chip models and the cycle counting. Pass a folder name and it also writes the two sounds there as WAV files.

## How it fits together

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

The registers of the tone are written by [`tone.js`](tone.js), in the same way a C64 program writes to `$D400` and up. Later the real 6502 player takes over that job and the page sends it edits.

Two things worth knowing:

- **An AudioWorklet has no `fetch()`.** The page downloads `sid.wasm`, compiles it to a `WebAssembly.Module` and posts that to the worklet, which creates the SID from it.
- **The SID is clocked per cycle, the sound card per sample.** The chip runs 985,248 cycles per second (PAL), the sound card 44,100 or 48,000 samples per second. reSIDfp resamples between the two. `sid_clock(cycles)` runs a given number of cycles and returns however many samples that made. `sid_render(n)` runs until `n` samples exist and returns the cycles it took. The audio thread uses the second, the future tracker the first.

## Files

| Path | What |
|---|---|
| `sound-test.html`, `sound-test.js` | the sound test page |
| `sound-test-worklet.js` | the audio thread: asks the SID for samples |
| `tone.js` | the demo tone, as SID register writes |
| `sid/sid.js` | loads `sid.wasm` and wraps it in a small JavaScript object |
| `sid/sid.wasm` | the built SID emulation (committed, so you do not need Emscripten to work on the rest) |
| `sid/wrapper.cpp` | the C functions around reSIDfp that JavaScript can call |
| `sid/build.sh` | builds `sid.wasm` |
| `sid/no-threads.patch` | the one change we make to reSIDfp's source, see below |
| `sid/test.mjs` | the Node test |

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
