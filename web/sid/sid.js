// sid.js - loads sid.wasm and wraps its C functions in a small JavaScript object.
//
// It works in the browser's AudioWorklet and in Node (for the tests), because it
// only uses the plain WebAssembly API. The caller passes in a compiled
// WebAssembly.Module; fetching the .wasm file is the caller's job, since an
// AudioWorklet has no fetch().
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

export const MOS6581 = 0;
export const CSG8580 = 1;
export const PAL_CLOCK = 985248;      // C64 cycles per second, PAL

export function createSid(module) {
  // The module imports three WASI functions (fd_close, fd_write, fd_seek) that the
  // C++ runtime wants for printing text. We never print, so stubs are enough.
  // The return value 52 is WASI's error code "not supported".
  const imports = {
    wasi_snapshot_preview1: {
      fd_close: () => 52,
      fd_write: () => 52,
      fd_seek: () => 52,
    },
  };
  const instance = new WebAssembly.Instance(module, imports);
  const x = instance.exports;
  x._initialize();                    // a "reactor" module: run its start-up code once

  const bufferAddress = x.sid_buffer();
  const bufferSize = x.sid_buffer_size();

  // A view on the sample buffer inside the WebAssembly memory. The memory has a
  // fixed size (see build.sh), so this view stays valid.
  const samples = new Int16Array(x.memory.buffer, bufferAddress, bufferSize);

  return {
    // Start (or restart) the chip. Returns true when all went well.
    init(model, sampleRate, clockHz = PAL_CLOCK) {
      return x.sid_init(model, clockHz, sampleRate) === 1;
    },
    setModel(model) { return x.sid_set_model(model) === 1; },
    reset() { x.sid_reset(); },
    // Like STA $D400+reg on a C64.
    write(reg, value) { x.sid_write(reg, value); },
    // Run `cycles` C64 cycles. Returns the number of new samples; read them from `samples`.
    clock(cycles) { return x.sid_clock(cycles); },
    // Run until `count` samples are made. Returns the number of cycles that took.
    render(count) { return x.sid_render(count); },
    samples,                          // Int16Array, 16-bit mono
    bufferSize,
  };
}
