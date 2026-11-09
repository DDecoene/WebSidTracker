// test.mjs - small hand-made tests for the 6502 core.
//
// Run:  node --test web/cpu/test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Cpu6502, FLAG_C, FLAG_Z, FLAG_N } from './cpu6502.js';

// A CPU with 64 KB of RAM and `program` placed at $0800.
function machine(program) {
  const ram = new Uint8Array(65536);
  ram.set(program, 0x0800);
  const cpu = new Cpu6502({
    read: (address) => ram[address],
    write: (address, value) => { ram[address] = value; },
  });
  cpu.pc = 0x0800;
  return { cpu, ram };
}

test('LDA immediate loads the value and sets Z and N', () => {
  const { cpu } = machine([0xA9, 0x00, 0xA9, 0x80, 0xA9, 0x42]);
  assert.equal(cpu.step(), 2);
  assert.equal(cpu.a, 0x00);
  assert.ok(cpu.p & FLAG_Z);
  cpu.step();
  assert.equal(cpu.a, 0x80);
  assert.ok(cpu.p & FLAG_N);
  assert.ok(!(cpu.p & FLAG_Z));
  cpu.step();
  assert.equal(cpu.a, 0x42);
  assert.ok(!(cpu.p & (FLAG_Z | FLAG_N)));
});

test('zero page indexed wraps inside page 0', () => {
  // LDX #$10 : LDA $F8,X  ->  reads $0008, not $0108
  const { cpu, ram } = machine([0xA2, 0x10, 0xB5, 0xF8]);
  ram[0x0008] = 0x77;
  ram[0x0108] = 0x11;
  cpu.step();
  assert.equal(cpu.step(), 4);
  assert.equal(cpu.a, 0x77);
});

test('absolute,X pays one extra cycle only when it crosses a page', () => {
  // LDX #$01 : LDA $10FF,X (crosses) : LDA $1000,X (does not)
  const { cpu, ram } = machine([0xA2, 0x01, 0xBD, 0xFF, 0x10, 0xBD, 0x00, 0x10]);
  ram[0x1100] = 0xAA;
  ram[0x1001] = 0xBB;
  cpu.step();
  assert.equal(cpu.step(), 5);
  assert.equal(cpu.a, 0xAA);
  assert.equal(cpu.step(), 4);
  assert.equal(cpu.a, 0xBB);
});

test('STA absolute,X always takes 5 cycles, even without a page cross', () => {
  const { cpu, ram } = machine([0xA9, 0x55, 0xA2, 0x01, 0x9D, 0x00, 0x20]);
  cpu.step();
  cpu.step();
  assert.equal(cpu.step(), 5);
  assert.equal(ram[0x2001], 0x55);
});

test('(zp),Y follows a pointer on zero page, wrapping at $FF', () => {
  // pointer at $FF/$00 -> $3000 ; LDY #$05 ; LDA ($FF),Y reads $3005
  const { cpu, ram } = machine([0xA0, 0x05, 0xB1, 0xFF]);
  ram[0x00FF] = 0x00;
  ram[0x0000] = 0x30;
  ram[0x3005] = 0x99;
  cpu.step();
  assert.equal(cpu.step(), 5);
  assert.equal(cpu.a, 0x99);
});

test('(zp,X) adds X to the pointer address first', () => {
  // LDX #$04 : LDA ($20,X) -> pointer at $24/$25
  const { cpu, ram } = machine([0xA2, 0x04, 0xA1, 0x20]);
  ram[0x0024] = 0x34;
  ram[0x0025] = 0x12;
  ram[0x1234] = 0x5A;
  cpu.step();
  assert.equal(cpu.step(), 6);
  assert.equal(cpu.a, 0x5A);
});

test('transfers copy and set flags, except TXS', () => {
  // LDA #$80 : TAX : TXS : TSX
  const { cpu } = machine([0xA9, 0x80, 0xAA, 0x9A, 0xBA]);
  cpu.step();
  cpu.step();
  assert.equal(cpu.x, 0x80);
  assert.ok(cpu.p & FLAG_N);
  cpu.p = 0; // clear the flags, then TXS must leave them alone
  cpu.step();
  assert.equal(cpu.sp, 0x80);
  assert.equal(cpu.p, 0);
  cpu.step();
  assert.equal(cpu.x, 0x80);
});

test('flag instructions', () => {
  const { cpu } = machine([0x38, 0x18]); // SEC, CLC
  cpu.step();
  assert.ok(cpu.p & FLAG_C);
  cpu.step();
  assert.ok(!(cpu.p & FLAG_C));
});

test('an unsupported opcode throws with its address', () => {
  const { cpu } = machine([0x02]);
  assert.throws(() => cpu.step(), /unsupported opcode \$02 at \$0800/);
});
