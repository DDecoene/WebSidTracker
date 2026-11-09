// engine.js - the audio engine: a 6502 running the player, feeding a SID chip.
//
// It plays the role of the C64: 64 KB of RAM, the player program loaded into it,
// and a raster interrupt that happens once per video frame. Every frame it calls
// music_play on the 6502 core, collects the writes to the SID registers, and gives
// the SID chip its time in between, so the chip hears every write at the right moment.
//
// The class has no DOM and no AudioWorklet in it, so it runs in the worklet, in Node
// (tests, WAV files) and anywhere else.
//
// Everything that changes the machine (write, start, stop, edit, mute, chip model) is
// put in a queue and applied at the start of the next frame, in the order it was
// asked. Frames are the unit of work: between two frames nothing runs, so an edit
// can never be half done.
//
// The cycle stamp rule: a write is heard on the LAST cycle of the instruction that
// makes it. A 6502 store does its write in the final cycle of the instruction, so
// for an STA that takes 4 cycles and starts at frame cycle 100, the SID is clocked
// for 103 cycles and then gets the new value. (Stores and read-modify-write
// instructions never pay page-crossing cycles, so the base cycle count is exact.)
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import { Cpu6502, FLAG_D } from '../cpu/cpu6502.js';
import { createSid } from '../sid/sid.js';

export const FRAME_CYCLES = 19656;          // PAL: cycles per video frame
const RUNAWAY_LIMIT = FRAME_CYCLES;         // music_play may not take longer than a frame
const OPERATION_LIMIT = 100000;             // music_init and music_stop may take a bit longer
const SID_BASE = 0xD400;
const SID_LAST = 0xD418;
const MAX_WRITES = 8192;                    // per frame; a store takes 3+ cycles, so 6552 at most
const FRAME_BUFFER = 4096;                  // samples; a frame is about 958 at 48 kHz

export class Engine {
  // sidModule: compiled sid.wasm. playerPrg: bytes of player.prg (2 byte load address
  // first). symbols: { label: address }. model: 0 = 6581, 1 = 8580.
  constructor({ sidModule, playerPrg, symbols, sampleRate, model = 0 }) {
    this.symbols = symbols;
    this.sampleRate = sampleRate;
    this.model = model;

    this.ram = new Uint8Array(65536);
    const loadAddress = playerPrg[0] | (playerPrg[1] << 8);
    this.ram.set(playerPrg.subarray(2), loadAddress);

    this.cpu = new Cpu6502({
      read: (address) => this.ram[address],
      write: (address, value) => this.busWrite(address, value),
    });
    this.cpu.sp = 0xFF;

    // reSIDfp builds large tables the first time it uses a chip model (a fraction of
    // a second). Initialise both models now so that switching later is cheap, and end
    // with the model that was asked for.
    this.sid = createSid(sidModule);
    const other = model === 0 ? 1 : 0;
    if (!this.sid.init(other, sampleRate)) throw new Error(`SID init failed (model ${other})`);
    if (!this.sid.init(model, sampleRate)) throw new Error(`SID init failed (model ${model})`);

    // SID writes of the frame being run: when (cycle in the frame), which register, what value.
    this.writeCycle = new Int32Array(MAX_WRITES);
    this.writeReg = new Uint8Array(MAX_WRITES);
    this.writeValue = new Uint8Array(MAX_WRITES);
    this.writeCount = 0;
    this.frameBase = 0;                     // cpu.cycles at the start of the frame
    this.inOperation = false;               // true while init/stop run: their writes all happen at cycle 0

    // The samples of the frame that was made last, and how many of them are handed out.
    this.frameSamples = new Int16Array(FRAME_BUFFER);
    this.frameLength = 0;
    this.framePos = 0;
    this.output = new Int16Array(4096);     // what render() returns a view of; grows if asked for more

    this.editsApplied = 0;                  // how many edits were applied: told to the page in readState
    this.queue = [];                        // changes waiting for the next frame boundary
    this.running = false;                   // is the player being called every frame?
    this.muted = [false, false, false];
    this.control = new Uint8Array(3);       // last control register value the player wrote, per voice
    this.errorMessage = null;
    this.endedFlag = false;
    this.framesRun = 0;                     // statistics, used by the tests
    this.samplesMade = 0;
  }

  // --- bus ---------------------------------------------------------------

  // The 6502 stores here. SID registers go to the chip (stamped with their cycle);
  // everything else is plain RAM.
  busWrite(address, value) {
    if (address < SID_BASE || address > SID_LAST) {
      this.ram[address] = value;
      return;
    }
    const reg = address - SID_BASE;
    if (this.writeCount >= MAX_WRITES) return;       // cannot happen in a legal frame
    const i = this.writeCount++;
    const voice = (reg / 7) | 0;
    const isControl = reg < 21 && reg - voice * 7 === 4;
    if (isControl) {
      this.control[voice] = value;
      if (this.muted[voice]) value &= 0xFE;          // a muted voice never gets its gate
    }
    let cycle = 0;
    if (!this.inOperation) {
      cycle = this.cpu.cycles + this.cpu.opCycles - this.frameBase;
      if (cycle > FRAME_CYCLES) cycle = FRAME_CYCLES;
    }
    this.writeCycle[i] = cycle;
    this.writeReg[i] = reg;
    this.writeValue[i] = value;
  }

  // --- the public controls (all of them take effect at the next frame boundary) ---

  writeRam(address, bytes) {
    this.queue.push({ kind: 'write', address, bytes: Uint8Array.from(bytes) });
  }

  start(songAddress) {
    this.queue.push({ kind: 'start', address: songAddress });
  }

  stop() {
    this.queue.push({ kind: 'stop' });
  }

  setModel(model) {
    this.queue.push({ kind: 'model', model });
  }

  setMuted(voice, muted) {
    this.queue.push({ kind: 'mute', voice, muted: !!muted });
  }

  // edit = { writes: [{address, bytes}],
  //          playhead: [{orderPos, patAddr, patPos, ticksLeft?} | null, x3],
  //          remap: [[{from: {orderPos, patAddr, patPos}, to: {orderPos, patAddr, patPos}}] | null, x3] }
  // The writes, the new playhead positions and the remaps are applied together, between two
  // frames. `playhead` puts a voice at a place. `remap` moves a voice only if it is at the
  // `from` place of one of the rows (the rows are made from a state that was a few frames old,
  // so they list every place the voice can have reached since): it then goes to `to`.
  applyEdit(edit) {
    const writes = (edit.writes || []).map((w) => ({ address: w.address, bytes: Uint8Array.from(w.bytes) }));
    const playhead = (edit.playhead || []).map((p) => (p ? { ...p } : null));
    const remap = (edit.remap || []).map((rows) => (rows ? rows.map((r) => ({ from: { ...r.from }, to: { ...r.to } })) : null));
    this.queue.push({ kind: 'edit', writes, playhead, remap });
  }

  // --- reading the player's state block -----------------------------------

  readState() {
    const s = this.symbols;
    const ram = this.ram;
    const voices = [];
    for (let v = 0; v < 3; v++) {
      voices.push({
        orderPos: ram[s.st_order_pos + v],
        patAddr: ram[s.st_pat_lo + v] | (ram[s.st_pat_hi + v] << 8),
        patPos: ram[s.st_pat_pos + v],
        ticksLeft: ram[s.st_ticks_left + v],
        instrument: ram[s.st_instr + v],
        pitch: ram[s.st_pitch + v],
      });
    }
    return { running: this.running, voices, frameInTick: ram[s.st_frame_in_tick], edits: this.editsApplied };
  }

  // The message of the last error (a runaway or unsupported instruction), once.
  takeError() {
    const message = this.errorMessage;
    this.errorMessage = null;
    return message;
  }

  // True once after the song stopped by itself.
  takeEnded() {
    const ended = this.endedFlag;
    this.endedFlag = false;
    return ended;
  }

  // --- making samples ------------------------------------------------------

  // Returns a view on n new samples (16-bit, mono). The view is only valid until the
  // next call. n can be anything; frames are made as needed and leftovers carry over.
  render(n) {
    if (this.output.length < n) this.output = new Int16Array(n);
    const out = this.output;
    let filled = 0;
    while (filled < n) {
      if (this.framePos >= this.frameLength) this.runFrame();
      const take = Math.min(n - filled, this.frameLength - this.framePos);
      const from = this.framePos;
      for (let i = 0; i < take; i++) out[filled + i] = this.frameSamples[from + i];
      filled += take;
      this.framePos += take;
    }
    return out.subarray(0, n);
  }

  // Run one video frame: queued changes, then the player, then the SID with the
  // writes in their right places.
  runFrame() {
    this.writeCount = 0;
    try {
      this.inOperation = true;
      this.applyQueue();
      this.inOperation = false;
      if (this.running) this.playOnce();
    } catch (error) {
      this.fail(error);
    }
    this.inOperation = false;
    this.flushToSid();
    this.framesRun++;
  }

  applyQueue() {
    const queue = this.queue;
    try {
      for (let i = 0; i < queue.length; i++) this.applyOperation(queue[i]);
    } finally {
      queue.length = 0;               // also after an error: never run an operation twice
    }
  }

  applyOperation(op) {
    switch (op.kind) {
      case 'write':
        this.poke(op.address, op.bytes);
        break;
      case 'edit':
        for (const w of op.writes) this.poke(w.address, w.bytes);
        for (let v = 0; v < op.playhead.length; v++) this.setPlayhead(v, op.playhead[v]);
        for (let v = 0; v < op.remap.length; v++) this.remapPlayhead(v, op.remap[v]);
        this.editsApplied++;
        break;
      case 'start':
        // music_init takes the song address in A (low byte) and X (high byte).
        this.cpu.a = op.address & 0xFF;
        this.cpu.x = (op.address >> 8) & 0xFF;
        this.cpu.p &= ~FLAG_D;
        this.cpu.call(this.symbols.music_init, OPERATION_LIMIT);
        this.running = true;
        break;
      case 'stop':
        this.running = false;
        this.cpu.call(this.symbols.music_stop, OPERATION_LIMIT);
        break;
      case 'model':
        this.model = op.model;
        this.sid.setModel(op.model);
        break;
      case 'mute': {
        this.muted[op.voice] = op.muted;
        // Take effect at once: close the gate, or give back what the player last wrote.
        const control = this.control[op.voice];
        this.busWriteDirect(op.voice * 7 + 4, op.muted ? control & 0xFE : control);
        break;
      }
    }
  }

  // Copy bytes into RAM, cutting off whatever would fall past $FFFF.
  poke(address, bytes) {
    const room = 65536 - address;
    if (room <= 0) return;
    this.ram.set(bytes.length > room ? bytes.subarray(0, room) : bytes, address);
  }

  // A SID write that does not come from the 6502 (muting), at cycle 0 of the frame.
  busWriteDirect(reg, value) {
    const i = this.writeCount++;
    this.writeCycle[i] = 0;
    this.writeReg[i] = reg;
    this.writeValue[i] = value;
  }

  setPlayhead(voice, p) {
    if (!p) return;
    const s = this.symbols;
    this.ram[s.st_order_pos + voice] = p.orderPos;
    this.ram[s.st_pat_lo + voice] = p.patAddr & 0xFF;
    this.ram[s.st_pat_hi + voice] = (p.patAddr >> 8) & 0xFF;
    this.ram[s.st_pat_pos + voice] = p.patPos;
    if (p.ticksLeft !== undefined) this.ram[s.st_ticks_left + voice] = p.ticksLeft;
  }

  // Move a voice to the `to` of the row whose `from` is where the voice is now, if there is one.
  remapPlayhead(voice, rows) {
    if (!rows) return;
    const s = this.symbols;
    const orderPos = this.ram[s.st_order_pos + voice];
    const patAddr = this.ram[s.st_pat_lo + voice] | (this.ram[s.st_pat_hi + voice] << 8);
    const patPos = this.ram[s.st_pat_pos + voice];
    const row = rows.find((r) => r.from.orderPos === orderPos && r.from.patAddr === patAddr && r.from.patPos === patPos);
    if (row) this.setPlayhead(voice, row.to);
  }

  // One raster interrupt: call music_play and see whether the song ended by itself.
  playOnce() {
    this.frameBase = this.cpu.cycles;
    this.cpu.call(this.symbols.music_play, RUNAWAY_LIMIT);
    const flag = this.symbols.st_running;
    if (flag !== undefined && this.ram[flag] === 0) {
      this.running = false;
      this.endedFlag = true;
    }
  }

  // The 6502 went wrong (a runaway routine, an unsupported opcode). Report it, stop
  // the player and silence the chip, but keep the audio running.
  fail(error) {
    this.errorMessage = String(error && error.message ? error.message : error);
    this.running = false;
    this.cpu.sp = 0xFF;
    for (let v = 0; v < 3; v++) this.busWriteDirect(v * 7 + 4, 0);
  }

  // Hand the frame's writes to the SID, clocking it up to each write's cycle first,
  // and collect the samples it makes into frameSamples.
  flushToSid() {
    // Writes made by the 6502 during an operation (init, stop) were stamped 0; the
    // player's writes carry their cycle relative to frameBase. Both are in order.
    const sid = this.sid;
    this.frameLength = 0;
    this.framePos = 0;
    let now = 0;
    for (let i = 0; i < this.writeCount; i++) {
      const at = this.writeCycle[i];
      if (at > now) {
        this.collect(sid.clock(at - now));
        now = at;
      }
      sid.write(this.writeReg[i], this.writeValue[i]);
    }
    if (now < FRAME_CYCLES) this.collect(sid.clock(FRAME_CYCLES - now));
  }

  // Copy the samples the SID just made into the frame buffer.
  collect(count) {
    const from = this.sid.samples;
    const to = this.frameSamples;
    let at = this.frameLength;
    if (at + count > to.length) count = to.length - at;   // cannot happen with 19656 cycles
    for (let i = 0; i < count; i++) to[at + i] = from[i];
    this.frameLength = at + count;
    this.samplesMade += count;
  }
}
