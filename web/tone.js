// tone.js - the demo sound: one voice, a 440 Hz pulse tone.
//
// Both the Node test and the AudioWorklet use this, so they play exactly the same
// register values. Later the 6502 player takes over this job.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ./LICENSE).

import { PAL_CLOCK } from './sid/sid.js';

// Writes the registers of voice 1 and starts the note. The writes are the same as
// a C64 program would do with STA $D400,x and so on.
export function playTone(sid) {
  // The SID adds `freq` to a 24-bit counter every cycle, the top bit drives the wave:
  //   frequency = freq * clock / 2^24   =>   freq = 440 * 2^24 / 985248 = 7493
  const freq = Math.round(440 * 16777216 / PAL_CLOCK);
  sid.write(0, freq & 255);           // $D400 frequency low
  sid.write(1, freq >> 8);            // $D401 frequency high
  sid.write(2, 0x00);                 // $D402 pulse width low
  sid.write(3, 0x08);                 // $D403 pulse width high: $800 = half = a square wave
  sid.write(5, 0x20);                 // $D405 attack 2 (16 ms), decay 0
  sid.write(6, 0xF4);                 // $D406 sustain 15 (full), release 4 (72 ms)
  sid.write(24, 0x0F);                // $D418 volume 15
  sid.write(4, 0x41);                 // $D404 pulse waveform + gate on: the note starts
  return freq;
}

// Lets go of the note: the envelope fades out over the release time.
export function stopTone(sid) {
  sid.write(4, 0x40);                 // $D404 pulse waveform, gate off
}
