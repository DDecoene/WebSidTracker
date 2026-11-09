// worklet.js - runs in the browser's audio thread (an AudioWorklet) and plays the tracker.
//
// The page sends messages (see client.js); this file turns them into calls on the
// Engine and fills the 128-sample blocks the browser asks for. Two rules: nothing in
// process() may be slow or allocate, and nothing may throw, because a processor that
// throws is silenced by the browser for good.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import { Engine } from './engine.js';

const STATE_RATE = 20;                // state messages per second while running

class SidTracker extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = null;
    this.broken = false;              // set after an unexpected exception: output stays silent
    this.volume = 1;                  // master volume wanted
    this.gain = 1;                    // master volume now (ramps to `volume` within a block)
    this.peak = 0;                    // loudest sample since the last state message
    this.samplesSinceState = 0;
    this.sendFinalState = false;
    this.port.onmessage = (event) => this.onMessage(event.data);
  }

  onMessage(msg) {
    try {
      if (msg.type === 'init') {
        const started = Date.now();
        this.engine = new Engine({
          sidModule: msg.module,
          playerPrg: msg.playerPrg,
          symbols: msg.symbols,
          sampleRate,                 // a global of the AudioWorklet scope
          model: msg.model,
        });
        this.broken = false;
        this.port.postMessage({ type: 'ready', sampleRate, initMs: Date.now() - started });
        return;
      }
      const engine = this.engine;
      if (!engine) return;
      switch (msg.type) {
        case 'write': engine.writeRam(msg.address, msg.bytes); break;
        case 'start': engine.start(msg.address); break;
        case 'stop': engine.stop(); break;
        case 'edit': engine.applyEdit(msg); break;
        case 'model': engine.setModel(msg.model); break;
        case 'mute': engine.setMuted(msg.voice, msg.muted); break;
        case 'volume': this.volume = Math.min(1, Math.max(0, Number(msg.value) || 0)); break;
      }
    } catch (error) {
      this.port.postMessage({ type: 'error', message: String(error && error.message ? error.message : error) });
    }
  }

  process(inputs, outputs) {
    const out = outputs[0][0];        // one channel: the SID is mono
    if (!out) return true;
    const engine = this.engine;
    if (!engine || this.broken) return true;      // the output stays silent

    try {
      const n = out.length;
      const samples = engine.render(n);
      const from = this.gain;
      const to = this.volume;
      const step = (to - from) / n;   // ramp the volume over the block: no clicks
      let gain = from;
      let peak = this.peak;
      for (let i = 0; i < n; i++) {
        gain += step;
        const v = (samples[i] / 32768) * gain;
        out[i] = v;
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
      }
      this.gain = to;
      this.peak = peak;

      const message = engine.takeError();
      if (message) this.port.postMessage({ type: 'error', message });
      if (engine.takeEnded()) this.port.postMessage({ type: 'ended' });

      this.samplesSinceState += n;
      if (this.samplesSinceState >= sampleRate / STATE_RATE) {
        this.samplesSinceState = 0;
        if (engine.running || this.sendFinalState) {
          this.sendFinalState = engine.running;     // one more message after it stopped
          this.port.postMessage({ type: 'state', ...engine.readState(), peak: this.peak });
        }
        this.peak = 0;
      }
    } catch (error) {
      this.broken = true;
      out.fill(0);
      this.port.postMessage({ type: 'error', message: String(error && error.message ? error.message : error) });
    }
    return true;                      // keep the processor alive
  }
}

registerProcessor('sid-tracker', SidTracker);
