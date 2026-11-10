// make.mjs - writes a golden set from the current code.
// usage: node web/model/golden/make.mjs <format>      (use the value of FORMAT in web/version.js)
//
// Do this only when the format really changed on purpose and a migration from the previous format exists.
// The old sets stay in place: the tests use them to check the migrations.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { FORMAT } from '../../version.js';
import { serialiseSong } from '../serialise.js';
import { exportInstrumentsAsm, exportSongAsm, projectToJson } from '../export.js';
import { formatFingerprint } from '../fingerprint.js';
import { goldenProject } from './example.js';

const format = Number(process.argv[2]);
if (!Number.isInteger(format) || format !== FORMAT) {
  console.error(`usage: node web/model/golden/make.mjs ${FORMAT}   (the format must equal FORMAT in web/version.js)`);
  process.exit(1);
}
const dir = new URL(`./format-${format}/`, import.meta.url);
mkdirSync(dir, { recursive: true });
const project = goldenProject();
const symbols = JSON.parse(readFileSync(new URL('../../player/symbols.json', import.meta.url), 'utf8'));
writeFileSync(new URL('project.json', dir), projectToJson(project));
writeFileSync(new URL('instruments.asm', dir), exportInstrumentsAsm(project.instruments));
writeFileSync(new URL('song_golden.asm', dir), exportSongAsm(project.song, 'golden'));
writeFileSync(new URL('song.bin', dir), serialiseSong(project.song, 0x3000).bytes);
writeFileSync(new URL('fingerprint.txt', dir), formatFingerprint(symbols) + '\n');
console.log(`golden set of format ${format} written to ${dir.pathname}`);
