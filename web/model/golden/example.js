// example.js - the fixed project the golden files are made from. Do not "improve" it: a change here
// changes every golden set. It uses every kind of event, every kind of order entry, a negative transpose
// and sets every instrument field to a value other than the default on at least one instrument.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

export function goldenProject() {
  return {
    instruments: [
      {
        name: 'Bass', wave: 0x41, ad: 0x08, sr: 0xA3, pw: 0x0A00, pwStep: 3, pwMin: 0x30, pwMax: 0xD0,
        vibDelay: 0, vibDepth: 0, vibSpeed: 0, arp: 0, drumNoise: 0, drumFall: 0, release: 3,
      },
      {
        name: 'Lead', wave: 0x41, ad: 0x2A, sr: 0x84, pw: 0x0600, pwStep: -2, pwMin: 0x18, pwMax: 0xE8,
        vibDelay: 12, vibDepth: 5, vibSpeed: 4, arp: 7, drumNoise: 0, drumFall: 0, release: 2,
      },
      {
        name: 'Snare', wave: 0x81, ad: 0x00, sr: 0x00, pw: 0x0800, pwStep: 0, pwMin: 0x20, pwMax: 0xE0,
        vibDelay: 0, vibDepth: 0, vibSpeed: 0, arp: -3, drumNoise: 2, drumFall: 40, release: 1,
      },
    ],
    song: {
      name: 'golden',
      speed: 5,
      patterns: [
        { name: 'bass', events: [
          { type: 'inst', instrument: 0 },
          { type: 'note', pitch: 24, length: 4 }, { type: 'note', pitch: 31, length: 4 },
          { type: 'rest', length: 2 }, { type: 'note', pitch: 29, length: 6 },
        ] },
        { name: 'lead', events: [
          { type: 'inst', instrument: 1 },
          { type: 'note', pitch: 48, length: 8 }, { type: 'legato' }, { type: 'note', pitch: 50, length: 8 },
          { type: 'rest', length: 4 },
        ] },
        { name: 'drums', events: [
          { type: 'inst', instrument: 2 },
          { type: 'note', pitch: 36, length: 2 }, { type: 'rest', length: 2 },
        ] },
      ],
      orders: [
        [{ pattern: 0, transpose: 0 }, { pattern: 0, transpose: -5 }, { loop: 0 }],
        [{ pattern: 1, transpose: 12 }, { stop: true }],
        [{ pattern: 2, transpose: 0 }, { loop: 0 }],
      ],
    },
  };
}
