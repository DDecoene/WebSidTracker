// klaus.mjs - runs Klaus Dormann's 6502 functional test on the core.
//
// The test tries every documented instruction and flag, and traps itself in an
// endless loop (a jump to its own address) where it fails. If it ends at the
// success address, everything passed.
//
// Run:  web/cpu/fetch-tests.sh && node web/cpu/klaus.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import { readFileSync } from 'node:fs';
import { Cpu6502 } from './cpu6502.js';

const SUCCESS = 0x3469; // where the published binary ends when all is well
const ram = new Uint8Array(readFileSync(new URL('./.cache/6502_functional_test.bin', import.meta.url)));
const cpu = new Cpu6502({ read: (a) => ram[a], write: (a, v) => { ram[a] = v; } });
cpu.pc = 0x0400; // the start address of the test

let before;
do {
  before = cpu.pc;
  cpu.step();
} while (cpu.pc !== before);

const at = '$' + cpu.pc.toString(16).toUpperCase().padStart(4, '0');
if (cpu.pc === SUCCESS) {
  console.log(`passed: reached ${at} after ${cpu.cycles} cycles`);
} else {
  console.log(`FAILED: trapped at ${at}`);
  process.exit(1);
}
