// render-wav.mjs - plays the demo song of the real player and writes it to a WAV file.
//
// Run:  node web/engine/render-wav.mjs out.wav 20 [6581|8580]
//
// The song sits at $3000 in the player image, so this is also a quick way to hear
// whether the player, the engine and the SID work together.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import { readFileSync, writeFileSync } from 'node:fs';
import { Engine } from './engine.js';

const [outFile, secondsText = '10', chip = '6581'] = process.argv.slice(2);
if (!outFile) {
  console.error('usage: node render-wav.mjs <out.wav> <seconds> [6581|8580]');
  process.exit(1);
}
const RATE = 48000;
const seconds = Number(secondsText);

const engine = new Engine({
  sidModule: new WebAssembly.Module(readFileSync(new URL('../sid/sid.wasm', import.meta.url))),
  playerPrg: new Uint8Array(readFileSync(new URL('../player/player.prg', import.meta.url))),
  symbols: JSON.parse(readFileSync(new URL('../player/symbols.json', import.meta.url), 'utf8')),
  sampleRate: RATE,
  model: chip === '8580' ? 1 : 0,
});
engine.start(0x3000);

const samples = new Int16Array(Math.round(seconds * RATE));
for (let at = 0; at < samples.length; at += 128) {
  samples.set(engine.render(Math.min(128, samples.length - at)), at);
}
const error = engine.takeError();
if (error) console.error('engine error:', error);

const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + samples.length * 2, 4);
header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22); header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
header.write('data', 36); header.writeUInt32LE(samples.length * 2, 40);
writeFileSync(outFile, Buffer.concat([header, Buffer.from(samples.buffer)]));

let peak = 0;
for (const s of samples) peak = Math.max(peak, Math.abs(s));
console.log(`${outFile}: ${seconds} s, ${chip}, peak ${peak}, song running: ${engine.readState().running}`);
