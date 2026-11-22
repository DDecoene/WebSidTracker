// sound-effects.js - a demo of sound effects: the original demo tune with a set of game effects to play
// over it. Open the Effects view, pick an effect and press Play effect (or Ctrl/Cmd+Enter), with or without
// the song playing. The exported .prg plays effects 1 to 9 on the keys 1 to 9.
//
// The first three effects are the moments of a small arcade game: a dodge, a new chapter, a hit. A "fat"
// sound is two effects started together on two voices (Hit and Hit body). The effects are our own.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import { defaultInstrument, demoProject, parseNoteName } from '../project.js';

export const info = {
  id: 'sound-effects',
  title: 'Sound effects',
  composer: 'WebSidTracker',
  note: 'The original demo tune with game sound effects: a dodge, a chapter bell, a hit (two effects on two voices), a laser and a power-up. Open the Effects view and press Play effect, also while the song plays.',
};

export function build() {
  const project = demoProject();
  const base = project.instruments.length;
  const instruments = [
    { // a short chirp that slides up: a dodged enemy, a scored point
      ...defaultInstrument(), name: 'Chirp', wave: 0x40, ad: 0x05, sr: 0x00, pw: 0x0400,
      pwStep: 60, pwMin: 0x20, pwMax: 0xE0, slide: 40, release: 2,
    },
    { // a bell: triangle with a gentle late vibrato
      ...defaultInstrument(), name: 'Bell', wave: 0x10, ad: 0x0A, sr: 0x00,
      vibDelay: 6, vibDepth: 4, vibSpeed: 6, release: 2,
    },
    { // the rumble of an explosion: noise that slides down
      ...defaultInstrument(), name: 'Rumble', wave: 0x80, ad: 0x0B, sr: 0x00, slide: -12, release: 2,
    },
    { // the body of an explosion: a low thump that falls
      ...defaultInstrument(), name: 'Thump', wave: 0x10, ad: 0x09, sr: 0x00, drumNoise: 2, drumFall: 30, release: 2,
    },
    { // a laser: a pulse that dives
      ...defaultInstrument(), name: 'Laser', wave: 0x40, ad: 0x08, sr: 0x00, pw: 0x0800,
      pwStep: 90, pwMin: 0x10, pwMax: 0xF0, slide: -110, release: 2,
    },
    { // a power-up: a major chord arpeggio that climbs
      ...defaultInstrument(), name: 'Sparkle', wave: 0x40, ad: 0x08, sr: 0x00, pw: 0x0600, arp: 4, arp2: 7, release: 2,
    },
  ];
  const [CHIRP, BELL, RUMBLE, THUMP, LASER, SPARKLE] = instruments.map((_, i) => base + i);
  const note = (name, length) => ({ type: 'note', pitch: parseNoteName(name), length });
  const inst = (instrument) => ({ type: 'inst', instrument });
  const VOICE_2 = 1, VOICE_3 = 2;

  project.instruments.push(...instruments);
  project.song.name = 'sound effects';
  project.effects = [
    { name: 'Dodge', speed: 1, voice: VOICE_3, events: [inst(CHIRP), note('C-5', 7)] },
    { name: 'Chapter', speed: 1, voice: VOICE_3, events: [inst(BELL), note('F#6', 10), note('B-6', 30)] },
    { name: 'Hit', speed: 1, voice: VOICE_3, events: [inst(RUMBLE), note('A-5', 50)] },
    { name: 'Hit body', speed: 1, voice: VOICE_2, events: [inst(THUMP), note('E-3', 30)] },
    { name: 'Laser', speed: 1, voice: VOICE_2, events: [inst(LASER), note('C-7', 16)] },
    { name: 'Power-up', speed: 2, voice: VOICE_2, events: [inst(SPARKLE), note('C-4', 3), note('F-4', 3), note('A#4', 3), note('D#5', 12)] },
  ];
  return project;
}
