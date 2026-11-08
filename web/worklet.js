// worklet.js - runs inside the browser's audio thread (an AudioWorklet).
//
// The browser calls process() about 375 times a second (48 kHz / 128 samples) and
// expects 128 new samples each time. We ask the SID for exactly that many and hand
// them over. Nothing here may be slow: a late answer is an audible crackle.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ./LICENSE).

import { createSid, MOS6581, CSG8580 } from './sid/sid.js';
import { playTone, stopTone } from './tone.js';

const STATS_EVERY = 16;               // send level numbers to the page every 16 blocks (about 43 ms)

class SidTone extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sid = null;
    this.model = MOS6581;
    this.blocks = 0;
    this.samplesMade = 0;
    this.peak = 0;
    this.port.onmessage = (event) => this.onMessage(event.data);
  }

  onMessage(msg) {
    if (msg.type === 'init') {
      try {
        const started = Date.now();
        this.sid = createSid(msg.module);
        this.model = msg.model;
        // reSIDfp builds big tables the first time it uses a chip model (a fraction of a
        // second). Do both models now, while nobody listens, so that switching later
        // does not make the audio thread stall.
        const other = msg.model === MOS6581 ? CSG8580 : MOS6581;
        if (!this.sid.init(other, sampleRate)) throw new Error('SID init failed (' + other + ')');
        if (!this.sid.init(msg.model, sampleRate)) throw new Error('SID init failed (' + msg.model + ')');
        playTone(this.sid);           // the voice is set up and gate is on; the page starts the clock
        this.port.postMessage({ type: 'ready', sampleRate, initMs: Date.now() - started });
      } catch (error) {
        this.sid = null;
        this.port.postMessage({ type: 'error', message: String(error) });
      }
    } else if (msg.type === 'model' && this.sid) {
      this.model = msg.model;
      this.sid.setModel(msg.model);
    } else if (msg.type === 'gate' && this.sid) {
      if (msg.on) playTone(this.sid); else stopTone(this.sid);
    }
  }

  process(inputs, outputs) {
    const out = outputs[0][0];        // one channel: the SID is mono
    if (!this.sid) return true;       // not ready yet: the output stays silent

    this.sid.render(out.length);      // out.length is 128
    const made = this.sid.samples;    // 16-bit integers, -32768 to 32767
    let peak = this.peak;
    for (let i = 0; i < out.length; i++) {
      const v = made[i] / 32768;      // the Web Audio API wants floats from -1 to 1
      out[i] = v;
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
    }
    this.peak = peak;
    this.samplesMade += out.length;

    if (++this.blocks % STATS_EVERY === 0) {
      this.port.postMessage({ type: 'stats', samples: this.samplesMade, peak: this.peak });
      this.peak = 0;
    }
    return true;                      // true = keep this processor alive
  }
}

registerProcessor('sid-tone', SidTone);
