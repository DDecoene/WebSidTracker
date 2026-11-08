// test.mjs - checks sid.wasm without a browser: play a 440 Hz tone and measure it.
//
// Run:  node web/sid/test.mjs [folder]
// With a folder name it also writes the two sounds there as WAV files to listen to.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import { readFileSync, writeFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { createSid, MOS6581, CSG8580, PAL_CLOCK } from './sid.js';
import { playTone } from '../tone.js';

const SAMPLE_RATE = 48000;
const module = new WebAssembly.Module(readFileSync(new URL('./sid.wasm', import.meta.url)));

// Render `seconds` of sound in blocks of 128 samples, like the AudioWorklet will.
function renderSeconds(sid, seconds) {
  const blocks = Math.round(seconds * SAMPLE_RATE / 128);
  const out = new Int16Array(blocks * 128);
  let cycles = 0;
  for (let b = 0; b < blocks; b++) {
    cycles += sid.render(128);
    out.set(sid.samples.subarray(0, 128), b * 128);
  }
  return { out, cycles };
}

// Frequency from rising zero crossings, after removing the DC offset (the average).
function measureHz(samples, from, to) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i];
  const mean = sum / (to - from);
  let first = -1, last = -1, crossings = 0;
  for (let i = from + 1; i < to; i++) {
    if (samples[i - 1] - mean < 0 && samples[i] - mean >= 0) {
      if (first < 0) first = i;
      last = i;
      crossings++;
    }
  }
  return (crossings - 1) * SAMPLE_RATE / (last - first);
}

function rms(samples) {
  let sum = 0, mean = 0;
  for (const s of samples) mean += s;
  mean /= samples.length;
  for (const s of samples) sum += (s - mean) ** 2;
  return Math.sqrt(sum / samples.length);
}

function wav(samples) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + samples.length * 2, 4);
  header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(samples.length * 2, 40);
  return Buffer.concat([header, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)]);
}

const folder = process.argv[2];
const results = {};

for (const [name, model] of [['6581', MOS6581], ['8580', CSG8580]]) {
  const sid = createSid(module);
  assert.ok(sid.init(model, SAMPLE_RATE), `init ${name}`);

  const freq = playTone(sid);
  const { out, cycles } = renderSeconds(sid, 1);
  results[name] = out;

  const hz = measureHz(out, SAMPLE_RATE / 5, out.length);       // skip the first 0.2 s
  const level = rms(out.subarray(SAMPLE_RATE / 5));
  console.log(`${name}: freq register ${freq} ($${freq.toString(16).toUpperCase()}), measured ${hz.toFixed(1)} Hz, rms ${level.toFixed(0)}, ${cycles} cycles for ${out.length} samples`);

  assert.ok(Math.abs(hz - 440) < 2, `${name}: expected about 440 Hz, got ${hz}`);
  assert.ok(level > 500, `${name}: the sound is too quiet (rms ${level})`);
  // One second of samples must take about one second of C64 time. The resampler
  // needs a few samples of run-up, so allow a small difference (500 cycles = 0.05%).
  assert.ok(Math.abs(cycles - PAL_CLOCK) < 500, `${name}: cycles per second off: ${cycles}`);

  if (folder) writeFileSync(`${folder}/tone-${name}.wav`, wav(out));
}

// The two chips are different circuits, so the same tone must not be sample-for-sample equal.
let differ = 0;
for (let i = 0; i < results['6581'].length; i++) if (results['6581'][i] !== results['8580'][i]) differ++;
assert.ok(differ > 1000, 'the 6581 and 8580 sound identical, the model switch has no effect');
console.log(`6581 and 8580 differ in ${differ} of ${results['6581'].length} samples`);

// The other way to run it, which the tracker will use: by cycles. 50 PAL frames.
{
  const sid = createSid(module);
  sid.init(MOS6581, SAMPLE_RATE);
  let total = 0;
  for (let frame = 0; frame < 50; frame++) total += sid.clock(19656);
  // 50 * 19656 cycles is a little less than one second (a PAL frame is 19656 cycles,
  // which makes 50.125 frames per second), so the expected count is calculated, not 48000.
  const expected = 50 * 19656 * SAMPLE_RATE / PAL_CLOCK;
  console.log(`50 frames of 19656 cycles gave ${total} samples (expected about ${expected.toFixed(0)})`);
  assert.ok(Math.abs(total - expected) <= 20, 'clock(cycles) produced the wrong number of samples');
}

console.log('OK');
