// test.mjs - checks the audio engine without a browser.
//
// Run:  node --test web/engine/test.mjs
//
// Most tests use small 6502 routines assembled by hand (listed below), so that the
// expected cycle numbers are known exactly. The last test plays the real player
// (web/player/player.prg) when that file exists. Set ENGINE_TEST_OUT to a folder to
// get the rendered sound as WAV files there.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Engine, FRAME_CYCLES } from './engine.js';

const RATE = 48000;
const sidModule = new WebAssembly.Module(readFileSync(new URL('../sid/sid.wasm', import.meta.url)));

// --- hand-assembled player -------------------------------------------------
// One PRG that loads at $1000 and has five routines. A little state lives at $0300.
//
// init  $1000: STA $0310 / STX $0311        remember the song address (A, X)
//              LDA #1 / STA $0300 / RTS     st_running = 1
// play  $1020: LDA #$0F      2 cycles
//              STA $D418     4  -> ends at cycle 6    volume register
//              LDA #$41      2  -> 8
//              STA $D404     4  -> 12                 voice 1 control
//              NOP NOP NOP   6  -> 18
//              LDX #3        2  -> 20
//              STA $D400,X   5  -> 25                 register 3
//              INC $D40E     6  -> 31                 read-modify-write: register 14
//              INC $0301     frame counter
//              RTS
// stop  $1060: LDA #0 / STA $D418 / STA $0300 / RTS
const code = new Map();
code.set(0x1000, [0x8D, 0x10, 0x03, 0x8E, 0x11, 0x03, 0xA9, 0x01, 0x8D, 0x00, 0x03, 0x60]);
code.set(0x1020, [0xA9, 0x0F, 0x8D, 0x18, 0xD4, 0xA9, 0x41, 0x8D, 0x04, 0xD4, 0xEA, 0xEA, 0xEA,
  0xA2, 0x03, 0x9D, 0x00, 0xD4, 0xEE, 0x0E, 0xD4, 0xEE, 0x01, 0x03, 0x60]);
code.set(0x1060, [0xA9, 0x00, 0x8D, 0x18, 0xD4, 0x8D, 0x00, 0x03, 0x60]);
// runaway $1080: JMP $1080
code.set(0x1080, [0x4C, 0x80, 0x10]);
// ends by itself $10A0: LDA #0 / STA $0300 / RTS
code.set(0x10A0, [0xA9, 0x00, 0x8D, 0x00, 0x03, 0x60]);
// pair $10C0: copies RAM $0400 to register 0 and $0401 to register 1 (for the edit test)
code.set(0x10C0, [0xAD, 0x00, 0x04, 0x8D, 0x00, 0xD4, 0xAD, 0x01, 0x04, 0x8D, 0x01, 0xD4, 0x60]);
// unsupported opcode $10E0: $02 is not a documented 6502 instruction
code.set(0x10E0, [0x02, 0x60]);

const prg = new Uint8Array(2 + 0x100);
prg[0] = 0x00; prg[1] = 0x10;
for (const [address, bytes] of code) prg.set(bytes, 2 + address - 0x1000);

const symbols = {
  music_init: 0x1000, music_play: 0x1020, music_stop: 0x1060,
  st_running: 0x0300, st_order_pos: 0x0320, st_pat_lo: 0x0323, st_pat_hi: 0x0326,
  st_pat_pos: 0x0329, st_ticks_left: 0x032C, st_instr: 0x032F, st_pitch: 0x0332,
  st_frame_in_tick: 0x0335,
};

const makeEngine = (extra = {}) => new Engine({ sidModule, playerPrg: prg, symbols, sampleRate: RATE, model: 0, ...extra });

// Record every SID write together with the SID's own cycle count at that moment.
function trace(engine) {
  const log = [];
  let cycles = 0;
  const clock = engine.sid.clock, write = engine.sid.write;
  engine.sid.clock = (n) => { cycles += n; return clock(n); };
  engine.sid.write = (reg, value) => {
    log.push({ frame: engine.framesRun, cycle: cycles - engine.framesRun * FRAME_CYCLES, reg, value });
    write(reg, value);
  };
  return log;
}

function copyRender(engine, total, chunk) {
  const out = new Int16Array(total);
  for (let at = 0; at < total;) {
    const n = Math.min(chunk(), total - at);
    out.set(engine.render(n), at);
    at += n;
  }
  return out;
}

function wav(samples) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + samples.length * 2, 4);
  header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(samples.length * 2, 40);
  return Buffer.concat([header, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)]);
}

// --- tests ------------------------------------------------------------------

test('render(n) returns n samples for any n and frames add up to whole PAL frames', () => {
  const engine = makeEngine();
  const sizes = [1, 127, 128, 129, 957, 958, 959, 5000, 4097, 1, 256];
  let total = 0;
  for (const n of sizes) {
    assert.equal(engine.render(n).length, n);
    total += n;
  }
  // 19656 cycles at 985248 Hz is 957.6 samples at 48 kHz.
  const perFrame = FRAME_CYCLES * RATE / 985248;
  assert.ok(Math.abs(engine.samplesMade / engine.framesRun - perFrame) < 1, `${engine.samplesMade} samples in ${engine.framesRun} frames`);
  assert.ok(engine.samplesMade >= total && engine.samplesMade - total < 960, 'only the unused rest of one frame is left over');
  // One second of output is 50.125 frames.
  const second = makeEngine();
  second.render(RATE);
  assert.ok(second.framesRun === 50 || second.framesRun === 51, `frames per second: ${second.framesRun}`);
});

test('SID writes are stamped with the last cycle of the store instruction', () => {
  const engine = makeEngine();
  const log = trace(engine);
  engine.start(0x3000);
  engine.render(RATE / 10);
  const frame0 = log.filter((w) => w.frame === 0);
  // Frame 0 is where music_init and the first music_play ran; init writes nothing.
  assert.deepEqual(frame0.map((w) => [w.cycle, w.reg, w.value]), [
    [6, 0x18, 0x0F],     // LDA #; STA abs          2 + 4
    [12, 0x04, 0x41],    // LDA #; STA abs          2 + 4 more
    [25, 0x03, 0x41],    // NOP x3, LDX #, STA abs,X 6 + 2 + 5 more
    [31, 0x0E, 0x01],    // INC abs                 6 more, writes on its last cycle
  ]);
  // The same pattern repeats every frame.
  const frame3 = log.filter((w) => w.frame === 3);
  assert.deepEqual(frame3.map((w) => w.cycle), [6, 12, 25, 31]);
});

test('start passes the song address in A and X, and the player runs once per frame', () => {
  const engine = makeEngine();
  engine.start(0x3A21);
  engine.render(1);
  assert.equal(engine.ram[0x0310], 0x21);
  assert.equal(engine.ram[0x0311], 0x3A);
  assert.equal(engine.readState().running, true);
  engine.render(RATE / 2);
  assert.equal(engine.ram[0x0301], engine.framesRun, 'music_play ran exactly once per frame');
});

test('nothing is played before start, and stop silences and halts the player', () => {
  const engine = makeEngine();
  engine.render(5000);
  assert.equal(engine.ram[0x0301], 0);
  engine.start(0x3000);
  engine.render(5000);
  const played = engine.ram[0x0301];
  assert.ok(played > 0);
  const log = trace(engine);
  engine.stop();
  engine.render(5000);
  assert.equal(engine.readState().running, false);
  assert.equal(engine.ram[0x0301], played, 'no more music_play calls (stop ran at the next frame boundary)');
  assert.deepEqual(log.slice(0, 1).map((w) => [w.reg, w.value]), [[0x18, 0]]);
});

test('same input gives identical samples, whatever the chunk size', () => {
  const run = (chunk) => {
    const engine = makeEngine();
    engine.start(0x3000);
    return copyRender(engine, 20000, chunk);
  };
  const a = run(() => 128);
  const b = run(() => 1000);
  let k = 0;
  const c = run(() => [1, 7, 333, 128, 959][k++ % 5]);
  assert.deepEqual(a, b);
  assert.deepEqual(a, c);
  assert.ok(a.some((s) => s !== 0), 'the test routine makes a sound');
});

test('applyEdit is atomic: two bytes written together are always seen together', () => {
  const engine = makeEngine();
  engine.writeRam(0x0400, [1, 1]);
  engine.writeRam(0x1020, code.get(0x10C0));    // use the pair routine as music_play
  engine.start(0x3000);
  const log = trace(engine);
  for (let i = 2; i < 80; i++) {
    engine.render(300 + (i * 37) % 1500);        // edits land at all sorts of places in a frame
    engine.applyEdit({ writes: [{ address: 0x0400, bytes: [i, i] }] });
  }
  engine.render(3000);
  const byFrame = new Map();
  for (const w of log) {
    const pair = byFrame.get(w.frame) || {};
    pair[w.reg] = w.value;
    byFrame.set(w.frame, pair);
  }
  assert.ok(byFrame.size > 30);
  for (const [frame, pair] of byFrame) assert.equal(pair[0], pair[1], `frame ${frame}: ${pair[0]} vs ${pair[1]}`);
  assert.ok(new Set([...byFrame.values()].map((p) => p[0])).size > 20, 'the edits did arrive');
});

test('applyEdit writes the playhead into the state block with the data', () => {
  const engine = makeEngine();
  engine.applyEdit({
    writes: [{ address: 0x3000, bytes: [9, 8, 7] }],
    playhead: [{ orderPos: 4, patAddr: 0x3456, patPos: 5, ticksLeft: 2 }, null, { orderPos: 6, patAddr: 0x30FF, patPos: 1 }],
  });
  assert.equal(engine.ram[0x3000], 0, 'not applied before the next frame');
  engine.render(1);
  assert.deepEqual([...engine.ram.subarray(0x3000, 0x3003)], [9, 8, 7]);
  const state = engine.readState();
  assert.deepEqual(state.voices[0], { orderPos: 4, patAddr: 0x3456, patPos: 5, ticksLeft: 2, instrument: 0, pitch: 0 });
  assert.equal(state.voices[1].patAddr, 0, 'a null playhead leaves the voice alone');
  assert.deepEqual([state.voices[2].orderPos, state.voices[2].patAddr, state.voices[2].patPos, state.voices[2].ticksLeft], [6, 0x30FF, 1, 0]);
});

test('applyEdit remap moves a voice only if it is at the place of one of the rows', () => {
  const engine = makeEngine();
  const place = (voice, orderPos, patAddr, patPos) => {
    engine.applyEdit({ playhead: Array.from({ length: 3 }, (_, v) => (v === voice ? { orderPos, patAddr, patPos } : null)) });
  };
  place(0, 2, 0x3100, 6);
  place(1, 0, 0x3200, 4);
  const row = (from, to) => ({ from: { orderPos: from[0], patAddr: from[1], patPos: from[2] }, to: { orderPos: to[0], patAddr: to[1], patPos: to[2] } });
  engine.applyEdit({ remap: [
    [row([2, 0x3100, 4], [2, 0x3110, 6]), row([2, 0x3100, 6], [2, 0x3110, 8])],   // voice 0 is at the second row
    [row([0, 0x3200, 6], [0, 0x3210, 8])],                                       // voice 1 is at none of them
    null,
  ] });
  engine.render(1);
  const state = engine.readState();
  assert.deepEqual([state.voices[0].orderPos, state.voices[0].patAddr, state.voices[0].patPos], [2, 0x3110, 8]);
  assert.deepEqual([state.voices[1].orderPos, state.voices[1].patAddr, state.voices[1].patPos], [0, 0x3200, 4]);
});

test('muting a voice removes its gate, unmuting gives it back', () => {
  const engine = makeEngine();
  engine.start(0x3000);
  engine.render(RATE / 20);
  const log = trace(engine);
  engine.setMuted(0, true);
  engine.render(RATE / 20);
  engine.setMuted(0, false);
  engine.render(RATE / 20);
  const control = log.filter((w) => w.reg === 4).map((w) => w.value);
  // muted: 0x40 (the player's 0x41 without the gate); the mute itself writes 0x40 first
  assert.ok(control.includes(0x40) && !control.slice(0, control.lastIndexOf(0x40)).includes(0x41));
  assert.equal(control[control.length - 1], 0x41, 'gate is back after unmute');
  assert.equal(engine.muted[0], false);
});

test('a runaway music_play is cut off, reported, and the audio goes on', () => {
  const engine = makeEngine();
  engine.writeRam(0x1020, code.get(0x1080));
  engine.start(0x3000);
  const samples = engine.render(5000);
  assert.equal(samples.length, 5000);
  assert.match(engine.takeError(), /more than/);
  assert.equal(engine.takeError(), null);
  assert.equal(engine.readState().running, false);
  assert.equal(engine.render(2000).length, 2000);
});

test('an unsupported opcode is reported as an error, not thrown', () => {
  const engine = makeEngine();
  engine.writeRam(0x1020, code.get(0x10E0));
  engine.start(0x3000);
  assert.doesNotThrow(() => engine.render(3000));
  assert.match(engine.takeError(), /unsupported opcode/);
});

test('a song that ends by itself is reported once', () => {
  const engine = makeEngine();
  engine.writeRam(0x1020, code.get(0x10A0));
  engine.start(0x3000);
  engine.render(3000);
  assert.equal(engine.takeEnded(), true);
  assert.equal(engine.takeEnded(), false);
  assert.equal(engine.readState().running, false);
});

test('the chip model can be switched while running', () => {
  const a = makeEngine();
  const b = makeEngine();
  a.start(0x3000); b.start(0x3000);
  a.render(2000); b.render(2000);
  b.setModel(1);
  const started = performance.now();
  const sa = Int16Array.from(a.render(4000));
  const sb = Int16Array.from(b.render(4000));
  console.log(`# model switch plus 4000 samples took ${(performance.now() - started).toFixed(1)} ms for both engines`);
  assert.equal(b.model, 1);
  assert.ok(sa.some((v, i) => v !== sb[i]));
});

test('the real player plays the demo song', { skip: !existsSync(new URL('../player/player.prg', import.meta.url)) }, () => {
  const realPrg = new Uint8Array(readFileSync(new URL('../player/player.prg', import.meta.url)));
  const realSymbols = JSON.parse(readFileSync(new URL('../player/symbols.json', import.meta.url), 'utf8'));
  const out = process.env.ENGINE_TEST_OUT;
  for (const [name, model] of [['6581', 0], ['8580', 1]]) {
    const engine = new Engine({ sidModule, playerPrg: realPrg, symbols: realSymbols, sampleRate: RATE, model });
    engine.start(0x3000);
    const samples = copyRender(engine, RATE * 6, () => 128);
    assert.equal(engine.takeError(), null);
    const state = engine.readState();
    assert.equal(state.running, true);
    let peak = 0;
    for (const s of samples) peak = Math.max(peak, Math.abs(s));
    assert.ok(peak > 2000, `${name}: demo is audible (peak ${peak})`);
    console.log(`# ${name}: peak ${peak}, order positions ${state.voices.map((v) => v.orderPos)}`);
    if (out) writeFileSync(`${out}/engine-${name}.wav`, wav(samples));
  }
});
