// cpu6502.js - a 6502 processor core in plain JavaScript.
//
// The CPU knows nothing about the C64. It only sees a bus: you give it
// read(address) and write(address, value), and it does the rest.
//
//   const cpu = new Cpu6502({ read, write });
//   cpu.pc = 0x0800;
//   const cycles = cpu.step();   // run one instruction, get its cycle count
//
// Only the documented instructions are supported. Anything else throws.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

// The status register P is one byte, one flag per bit:  N V - B D I Z C
export const FLAG_C = 0x01; // carry
export const FLAG_Z = 0x02; // zero
export const FLAG_I = 0x04; // interrupt disable
export const FLAG_D = 0x08; // decimal mode
export const FLAG_B = 0x10; // break (only exists on the stack, see PHP and BRK)
export const FLAG_U = 0x20; // unused, always 1 when pushed
export const FLAG_V = 0x40; // overflow
export const FLAG_N = 0x80; // negative

// The instruction table. For each opcode: the name, how it finds its operand
// (the addressing mode), its cycle count, and whether it pays one extra cycle
// when the address calculation crosses a page boundary (reads only).
const OPCODES = new Array(256).fill(null);
function op(code, name, mode, cycles, pageCost = false) {
  OPCODES[code] = { name, mode, cycles, pageCost };
}

// --- loads --------------------------------------------------------------
op(0xA9, 'LDA', 'imm', 2);
op(0xA5, 'LDA', 'zp', 3);
op(0xB5, 'LDA', 'zpx', 4);
op(0xAD, 'LDA', 'abs', 4);
op(0xBD, 'LDA', 'abx', 4, true);
op(0xB9, 'LDA', 'aby', 4, true);
op(0xA1, 'LDA', 'izx', 6);
op(0xB1, 'LDA', 'izy', 5, true);

op(0xA2, 'LDX', 'imm', 2);
op(0xA6, 'LDX', 'zp', 3);
op(0xB6, 'LDX', 'zpy', 4);
op(0xAE, 'LDX', 'abs', 4);
op(0xBE, 'LDX', 'aby', 4, true);

op(0xA0, 'LDY', 'imm', 2);
op(0xA4, 'LDY', 'zp', 3);
op(0xB4, 'LDY', 'zpx', 4);
op(0xAC, 'LDY', 'abs', 4);
op(0xBC, 'LDY', 'abx', 4, true);

// --- stores (never pay the page cost: they always take the long way) ----
op(0x85, 'STA', 'zp', 3);
op(0x95, 'STA', 'zpx', 4);
op(0x8D, 'STA', 'abs', 4);
op(0x9D, 'STA', 'abx', 5);
op(0x99, 'STA', 'aby', 5);
op(0x81, 'STA', 'izx', 6);
op(0x91, 'STA', 'izy', 6);

op(0x86, 'STX', 'zp', 3);
op(0x96, 'STX', 'zpy', 4);
op(0x8E, 'STX', 'abs', 4);

op(0x84, 'STY', 'zp', 3);
op(0x94, 'STY', 'zpx', 4);
op(0x8C, 'STY', 'abs', 4);

// --- register transfers -------------------------------------------------
op(0xAA, 'TAX', 'imp', 2);
op(0xA8, 'TAY', 'imp', 2);
op(0x8A, 'TXA', 'imp', 2);
op(0x98, 'TYA', 'imp', 2);
op(0xBA, 'TSX', 'imp', 2);
op(0x9A, 'TXS', 'imp', 2);

// --- flags and nop ------------------------------------------------------
op(0x18, 'CLC', 'imp', 2);
op(0x38, 'SEC', 'imp', 2);
op(0x58, 'CLI', 'imp', 2);
op(0x78, 'SEI', 'imp', 2);
op(0xD8, 'CLD', 'imp', 2);
op(0xF8, 'SED', 'imp', 2);
op(0xB8, 'CLV', 'imp', 2);
op(0xEA, 'NOP', 'imp', 2);

// --- logic and arithmetic -----------------------------------------------
// The eight "ALU" instructions share one pattern of modes and cycle counts.
function alu(name, base) {
  op(base + 0x09, name, 'imm', 2);
  op(base + 0x05, name, 'zp', 3);
  op(base + 0x15, name, 'zpx', 4);
  op(base + 0x0D, name, 'abs', 4);
  op(base + 0x1D, name, 'abx', 4, true);
  op(base + 0x19, name, 'aby', 4, true);
  op(base + 0x01, name, 'izx', 6);
  op(base + 0x11, name, 'izy', 5, true);
}
alu('ORA', 0x00);
alu('AND', 0x20);
alu('EOR', 0x40);
alu('ADC', 0x60);
alu('SBC', 0xE0);
alu('CMP', 0xC0);

op(0xE0, 'CPX', 'imm', 2);
op(0xE4, 'CPX', 'zp', 3);
op(0xEC, 'CPX', 'abs', 4);
op(0xC0, 'CPY', 'imm', 2);
op(0xC4, 'CPY', 'zp', 3);
op(0xCC, 'CPY', 'abs', 4);
op(0x24, 'BIT', 'zp', 3);
op(0x2C, 'BIT', 'abs', 4);

// --- shifts, rotates, increments (they read, change and write back) -----
function shift(name, base) {
  op(base + 0x0A, name, 'acc', 2);
  op(base + 0x06, name, 'zp', 5);
  op(base + 0x16, name, 'zpx', 6);
  op(base + 0x0E, name, 'abs', 6);
  op(base + 0x1E, name, 'abx', 7);
}
shift('ASL', 0x00);
shift('ROL', 0x20);
shift('LSR', 0x40);
shift('ROR', 0x60);

op(0xE6, 'INC', 'zp', 5);
op(0xF6, 'INC', 'zpx', 6);
op(0xEE, 'INC', 'abs', 6);
op(0xFE, 'INC', 'abx', 7);
op(0xC6, 'DEC', 'zp', 5);
op(0xD6, 'DEC', 'zpx', 6);
op(0xCE, 'DEC', 'abs', 6);
op(0xDE, 'DEC', 'abx', 7);
op(0xE8, 'INX', 'imp', 2);
op(0xC8, 'INY', 'imp', 2);
op(0xCA, 'DEX', 'imp', 2);
op(0x88, 'DEY', 'imp', 2);

// --- branches: 2 cycles, +1 when taken, +1 more when the target is on another page
op(0x10, 'BPL', 'rel', 2);
op(0x30, 'BMI', 'rel', 2);
op(0x50, 'BVC', 'rel', 2);
op(0x70, 'BVS', 'rel', 2);
op(0x90, 'BCC', 'rel', 2);
op(0xB0, 'BCS', 'rel', 2);
op(0xD0, 'BNE', 'rel', 2);
op(0xF0, 'BEQ', 'rel', 2);

// --- jumps, subroutines, stack ------------------------------------------
op(0x4C, 'JMP', 'abs', 3);
op(0x6C, 'JMP', 'ind', 5);
op(0x20, 'JSR', 'abs', 6);
op(0x60, 'RTS', 'imp', 6);
op(0x40, 'RTI', 'imp', 6);
op(0x00, 'BRK', 'imp', 7);
op(0x48, 'PHA', 'imp', 3);
op(0x08, 'PHP', 'imp', 3);
op(0x68, 'PLA', 'imp', 4);
op(0x28, 'PLP', 'imp', 4);

// The branch instructions, with the flag they test and the value it must have.
const BRANCHES = {
  BPL: [FLAG_N, false], BMI: [FLAG_N, true],
  BVC: [FLAG_V, false], BVS: [FLAG_V, true],
  BCC: [FLAG_C, false], BCS: [FLAG_C, true],
  BNE: [FLAG_Z, false], BEQ: [FLAG_Z, true],
};

// call() returns to this address when the routine ends (see call()).
const CALL_RETURN = 0xFFFF;

export class Cpu6502 {
  constructor({ read, write }) {
    this.read = read;
    this.write = write;
    this.a = 0;
    this.x = 0;
    this.y = 0;
    this.sp = 0xFF;
    this.pc = 0;
    this.p = FLAG_U | FLAG_I;
    this.cycles = 0; // total cycles run so far
    this.crossed = false; // did the last address calculation cross a page?
    this.extra = 0; // extra cycles the instruction itself asked for (branches)
  }

  // --- small helpers ----------------------------------------------------

  // Set or clear one flag.
  setFlag(flag, on) {
    if (on) this.p |= flag;
    else this.p &= ~flag;
  }

  // Most instructions that produce a value set Z (value is 0) and N (bit 7).
  setZN(value) {
    this.setFlag(FLAG_Z, value === 0);
    this.setFlag(FLAG_N, (value & 0x80) !== 0);
  }

  // Read the byte at PC and move PC on.
  fetch() {
    const value = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    return value;
  }

  // Read a 16-bit word at PC (low byte first, as the 6502 stores it).
  fetchWord() {
    const lo = this.fetch();
    return lo | (this.fetch() << 8);
  }

  // The stack lives in page 1 ($0100-$01FF) and grows downwards.
  push(value) {
    this.write(0x0100 + this.sp, value);
    this.sp = (this.sp - 1) & 0xFF;
  }

  pull() {
    this.sp = (this.sp + 1) & 0xFF;
    return this.read(0x0100 + this.sp);
  }

  // --- addressing modes -------------------------------------------------
  // Each mode works out the address of the operand and returns it.
  // Zero page wraps inside page 0: $FF + 1 is $00, not $100.
  // 'acc' (the accumulator itself) has no address and returns null.

  address(mode) {
    this.crossed = false;
    switch (mode) {
      case 'acc':
        return null;
      case 'imm': { // the operand is the byte right after the opcode
        const at = this.pc;
        this.pc = (this.pc + 1) & 0xFFFF;
        return at;
      }
      case 'zp':
        return this.fetch();
      case 'zpx':
        return (this.fetch() + this.x) & 0xFF;
      case 'zpy':
        return (this.fetch() + this.y) & 0xFF;
      case 'abs':
        return this.fetchWord();
      case 'abx':
        return this.indexed(this.fetchWord(), this.x);
      case 'aby':
        return this.indexed(this.fetchWord(), this.y);
      case 'ind': { // JMP ($xxxx). The real chip never carries into the high byte
        // of the pointer: JMP ($10FF) reads the high byte from $1000, not $1100.
        const pointer = this.fetchWord();
        const hiAt = (pointer & 0xFF00) | ((pointer + 1) & 0x00FF);
        return this.read(pointer) | (this.read(hiAt) << 8);
      }
      case 'izx': { // (zp,X): add X to the zero page pointer, then follow it
        const pointer = (this.fetch() + this.x) & 0xFF;
        return this.read(pointer) | (this.read((pointer + 1) & 0xFF) << 8);
      }
      case 'izy': { // (zp),Y: follow the zero page pointer, then add Y
        const pointer = this.fetch();
        const base = this.read(pointer) | (this.read((pointer + 1) & 0xFF) << 8);
        return this.indexed(base, this.y);
      }
      case 'rel': { // a branch: signed offset from the address after the instruction
        let offset = this.fetch();
        if (offset >= 0x80) offset -= 0x100;
        const target = (this.pc + offset) & 0xFFFF;
        this.crossed = (this.pc & 0xFF00) !== (target & 0xFF00);
        return target;
      }
      default:
        throw new Error(`unknown addressing mode ${mode}`);
    }
  }

  // base + index, and remember whether that crossed into another page.
  indexed(base, index) {
    const address = (base + index) & 0xFFFF;
    this.crossed = (base & 0xFF00) !== (address & 0xFF00);
    return address;
  }

  // --- running ----------------------------------------------------------

  // Run one instruction. Returns the number of cycles it took.
  step() {
    const startPc = this.pc;
    const code = this.fetch();
    const entry = OPCODES[code];
    if (!entry) {
      const hex = code.toString(16).toUpperCase().padStart(2, '0');
      throw new Error(`unsupported opcode $${hex} at $${startPc.toString(16).toUpperCase().padStart(4, '0')}`);
    }

    this.extra = 0;
    if (entry.mode === 'imp') {
      this.implied(entry.name);
    } else {
      const at = this.address(entry.mode);
      this.operate(entry.name, at);
      if (entry.pageCost && this.crossed) this.extra++;
    }

    const cycles = entry.cycles + this.extra;
    this.cycles += cycles;
    return cycles;
  }

  // Run the subroutine at `address` until its RTS, like the raster interrupt
  // calling music_play. Returns the cycles used. `limit` stops a runaway routine.
  call(address, limit = 1000000) {
    const sp = this.sp;
    // Push CALL_RETURN - 1, because RTS adds 1 to the address it pulls.
    this.push((CALL_RETURN - 1) >> 8);
    this.push((CALL_RETURN - 1) & 0xFF);
    this.pc = address;
    const start = this.cycles;
    while (this.pc !== CALL_RETURN || this.sp !== sp) {
      if (this.cycles - start > limit) {
        throw new Error(`routine at $${address.toString(16)} ran for more than ${limit} cycles`);
      }
      this.step();
    }
    return this.cycles - start;
  }

  // Instructions without an operand.
  implied(name) {
    switch (name) {
      case 'TAX': this.x = this.a; this.setZN(this.x); break;
      case 'TAY': this.y = this.a; this.setZN(this.y); break;
      case 'TXA': this.a = this.x; this.setZN(this.a); break;
      case 'TYA': this.a = this.y; this.setZN(this.a); break;
      case 'TSX': this.x = this.sp; this.setZN(this.x); break;
      case 'TXS': this.sp = this.x; break; // TXS is the one transfer that sets no flags
      case 'CLC': this.setFlag(FLAG_C, false); break;
      case 'SEC': this.setFlag(FLAG_C, true); break;
      case 'CLI': this.setFlag(FLAG_I, false); break;
      case 'SEI': this.setFlag(FLAG_I, true); break;
      case 'CLD': this.setFlag(FLAG_D, false); break;
      case 'SED': this.setFlag(FLAG_D, true); break;
      case 'CLV': this.setFlag(FLAG_V, false); break;
      case 'NOP': break;
      case 'INX': this.x = (this.x + 1) & 0xFF; this.setZN(this.x); break;
      case 'INY': this.y = (this.y + 1) & 0xFF; this.setZN(this.y); break;
      case 'DEX': this.x = (this.x - 1) & 0xFF; this.setZN(this.x); break;
      case 'DEY': this.y = (this.y - 1) & 0xFF; this.setZN(this.y); break;
      case 'PHA': this.push(this.a); break;
      case 'PHP': this.push(this.p | FLAG_B | FLAG_U); break; // B only exists on the stack
      case 'PLA': this.a = this.pull(); this.setZN(this.a); break;
      case 'PLP': this.p = (this.pull() & ~FLAG_B) | FLAG_U; break;
      case 'RTS': {
        const lo = this.pull();
        this.pc = (((this.pull() << 8) | lo) + 1) & 0xFFFF;
        break;
      }
      case 'RTI': {
        this.p = (this.pull() & ~FLAG_B) | FLAG_U;
        const lo = this.pull();
        this.pc = (this.pull() << 8) | lo;
        break;
      }
      case 'BRK': { // acts like an interrupt; the byte after BRK is skipped
        const returnTo = (this.pc + 1) & 0xFFFF;
        this.push(returnTo >> 8);
        this.push(returnTo & 0xFF);
        this.push(this.p | FLAG_B | FLAG_U);
        this.setFlag(FLAG_I, true);
        this.pc = this.read(0xFFFE) | (this.read(0xFFFF) << 8);
        break;
      }
      default: throw new Error(`instruction ${name} is not implemented`);
    }
  }

  // Instructions that work on an address (or, for 'acc', on the accumulator).
  operate(name, at) {
    switch (name) {
      case 'LDA': this.a = this.read(at); this.setZN(this.a); break;
      case 'LDX': this.x = this.read(at); this.setZN(this.x); break;
      case 'LDY': this.y = this.read(at); this.setZN(this.y); break;
      case 'STA': this.write(at, this.a); break;
      case 'STX': this.write(at, this.x); break;
      case 'STY': this.write(at, this.y); break;

      case 'ORA': this.a |= this.read(at); this.setZN(this.a); break;
      case 'AND': this.a &= this.read(at); this.setZN(this.a); break;
      case 'EOR': this.a ^= this.read(at); this.setZN(this.a); break;
      case 'ADC': this.adc(this.read(at)); break;
      case 'SBC': this.sbc(this.read(at)); break;
      case 'CMP': this.compare(this.a, this.read(at)); break;
      case 'CPX': this.compare(this.x, this.read(at)); break;
      case 'CPY': this.compare(this.y, this.read(at)); break;
      case 'BIT': { // Z from A AND memory; N and V are copied from bits 7 and 6 of memory
        const value = this.read(at);
        this.setFlag(FLAG_Z, (this.a & value) === 0);
        this.setFlag(FLAG_N, (value & 0x80) !== 0);
        this.setFlag(FLAG_V, (value & 0x40) !== 0);
        break;
      }

      case 'ASL': this.modify(at, (v) => {
        this.setFlag(FLAG_C, (v & 0x80) !== 0);
        return (v << 1) & 0xFF;
      }); break;
      case 'LSR': this.modify(at, (v) => {
        this.setFlag(FLAG_C, (v & 0x01) !== 0);
        return v >> 1;
      }); break;
      case 'ROL': this.modify(at, (v) => {
        const carryIn = this.p & FLAG_C;
        this.setFlag(FLAG_C, (v & 0x80) !== 0);
        return ((v << 1) | carryIn) & 0xFF;
      }); break;
      case 'ROR': this.modify(at, (v) => {
        const carryIn = (this.p & FLAG_C) << 7;
        this.setFlag(FLAG_C, (v & 0x01) !== 0);
        return (v >> 1) | carryIn;
      }); break;
      case 'INC': this.modify(at, (v) => (v + 1) & 0xFF); break;
      case 'DEC': this.modify(at, (v) => (v - 1) & 0xFF); break;

      case 'JMP': this.pc = at; break;
      case 'JSR': { // pushes the address of the LAST byte of the instruction
        const returnTo = (this.pc - 1) & 0xFFFF;
        this.push(returnTo >> 8);
        this.push(returnTo & 0xFF);
        this.pc = at;
        break;
      }

      default: {
        const branch = BRANCHES[name];
        if (!branch) throw new Error(`instruction ${name} is not implemented`);
        const [flag, wanted] = branch;
        if (((this.p & flag) !== 0) === wanted) {
          this.extra = this.crossed ? 2 : 1; // taken: +1, and +1 more across a page
          this.pc = at;
        }
      }
    }
  }

  // Read-modify-write: shifts, rotates, INC and DEC. `at` is null for the
  // accumulator. The new value sets Z and N.
  modify(at, change) {
    const value = at === null ? this.a : this.read(at);
    const result = change(value);
    if (at === null) this.a = result;
    else this.write(at, result);
    this.setZN(result);
  }

  // CMP, CPX, CPY: subtract without storing. C means "register >= value".
  compare(register, value) {
    this.setFlag(FLAG_C, register >= value);
    this.setZN((register - value) & 0xFF);
  }

  // A + value + carry. Binary or, with the D flag, decimal (BCD).
  adc(value) {
    const carry = this.p & FLAG_C;
    const a = this.a;
    const binary = a + value + carry;

    if (this.p & FLAG_D) {
      // Decimal mode as the NMOS 6502 does it: add the low digits and fix up
      // when they pass 9, then the high digits. N and V come from the result
      // before the high digit is fixed; Z comes from the plain binary sum.
      let low = (a & 0x0F) + (value & 0x0F) + carry;
      if (low >= 0x0A) low = ((low + 0x06) & 0x0F) + 0x10;
      let sum = (a & 0xF0) + (value & 0xF0) + low;
      this.setFlag(FLAG_Z, (binary & 0xFF) === 0);
      this.setFlag(FLAG_N, (sum & 0x80) !== 0);
      this.setFlag(FLAG_V, ((a ^ sum) & (value ^ sum) & 0x80) !== 0);
      if (sum >= 0xA0) sum += 0x60;
      this.setFlag(FLAG_C, sum >= 0x100);
      this.a = sum & 0xFF;
      return;
    }

    // Overflow: both inputs had the same sign but the result has another.
    this.setFlag(FLAG_V, ((a ^ binary) & (value ^ binary) & 0x80) !== 0);
    this.setFlag(FLAG_C, binary > 0xFF);
    this.a = binary & 0xFF;
    this.setZN(this.a);
  }

  // A - value - (1 - carry). SBC is ADC of the inverted value; in decimal
  // mode the flags still come from the binary result, only A is fixed up.
  sbc(value) {
    const carry = this.p & FLAG_C;
    const a = this.a;
    const binary = a + (value ^ 0xFF) + carry;

    this.setFlag(FLAG_V, ((a ^ binary) & ((value ^ 0xFF) ^ binary) & 0x80) !== 0);
    this.setFlag(FLAG_C, binary > 0xFF);
    this.setZN(binary & 0xFF);

    if (this.p & FLAG_D) {
      let low = (a & 0x0F) - (value & 0x0F) + carry - 1;
      if (low < 0) low = ((low - 0x06) & 0x0F) - 0x10;
      let result = (a & 0xF0) - (value & 0xF0) + low;
      if (result < 0) result -= 0x60;
      this.a = result & 0xFF;
    } else {
      this.a = binary & 0xFF;
    }
  }
}
