// singlestep.mjs - checks the 6502 core against Tom Harte's SingleStepTests.
//
// Each test gives a start state (registers and some RAM), runs ONE instruction,
// and says what the registers, the RAM and the cycle count must be afterwards.
// It checks the instruction results and the cycle counts, but not the order of
// the individual bus accesses inside an instruction.
//
// Run:  web/cpu/fetch-tests.sh && node web/cpu/singlestep.mjs [opcode ...]
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import { readFileSync, existsSync } from 'node:fs';
import { Cpu6502 } from './cpu6502.js';

const CACHE = new URL('./.cache/singlestep/', import.meta.url);

// Which opcodes does the core know? Ask it: an unknown opcode throws "unsupported".
function knownOpcodes() {
  const known = [];
  for (let code = 0; code < 256; code++) {
    const ram = new Uint8Array(65536);
    ram[0x0800] = code;
    const cpu = new Cpu6502({ read: (a) => ram[a], write: () => {} });
    cpu.pc = 0x0800;
    try { cpu.step(); known.push(code); } catch (e) {
      if (!/unsupported opcode/.test(e.message)) known.push(code);
    }
  }
  return known;
}
const hex2 = (n) => n.toString(16).padStart(2, '0');

if (process.argv[2] === '--list') {
  console.log(knownOpcodes().map(hex2).join(' '));
  process.exit(0);
}

const ram = new Uint8Array(65536);
const cpu = new Cpu6502({ read: (a) => ram[a], write: (a, v) => { ram[a] = v; } });

let failures = 0;
let total = 0;
const wanted = process.argv.slice(2);
const opcodes = wanted.length ? wanted.map((w) => parseInt(w, 16)) : knownOpcodes();

for (const code of opcodes) {
  const file = new URL(`${hex2(code)}.json`, CACHE);
  if (!existsSync(file)) { console.log(`${hex2(code)}: no test file (run fetch-tests.sh)`); failures++; continue; }
  let bad = 0;
  for (const t of JSON.parse(readFileSync(file, 'utf8'))) {
    total++;
    for (const [address, value] of t.initial.ram) ram[address] = value;
    cpu.pc = t.initial.pc; cpu.sp = t.initial.s; cpu.a = t.initial.a;
    cpu.x = t.initial.x; cpu.y = t.initial.y; cpu.p = t.initial.p;

    let cycles, error = '';
    try { cycles = cpu.step(); } catch (e) { error = e.message; }

    const f = t.final;
    const problems = [];
    if (error) problems.push(error);
    if (cycles !== t.cycles.length) problems.push(`cycles ${cycles} != ${t.cycles.length}`);
    for (const key of ['pc', 'sp', 'a', 'x', 'y', 'p']) {
      const mine = key === 'sp' ? cpu.sp : cpu[key];
      const theirs = key === 'sp' ? f.s : f[key];
      if (mine !== theirs) problems.push(`${key} ${mine} != ${theirs}`);
    }
    for (const [address, value] of f.ram) {
      if (ram[address] !== value) problems.push(`ram[${address}] ${ram[address]} != ${value}`);
    }
    if (problems.length) {
      if (bad++ < 3) console.log(`${t.name}: ${problems.join('; ')}`);
      failures++;
    }
    // Clean up, so the next test starts with empty RAM.
    for (const [address] of t.initial.ram) ram[address] = 0;
    for (const [address] of f.ram) ram[address] = 0;
  }
  if (bad) console.log(`opcode ${hex2(code)}: ${bad} tests failed`);
}

console.log(`${total} tests, ${failures} failed`);
process.exit(failures ? 1 : 0);
