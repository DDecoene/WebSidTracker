// toccata.js - the Toccata and Fugue in D minor (BWV 565, attributed to J. S. Bach) for the three
// SID voices: the whole piece, from the first bar to the last chord.
//
// The notes come from a public-domain score (see info.source): the right hand, left hand and
// pedal of the organ version. The three staves are reduced to the three voices like this:
//   voice 1  the top line of the right hand (the left hand where the right hand rests)
//   voice 2  the rest of the manuals: one line where there is one (the left hand, or the lower
//            note of an octave), and a shimmer of an arpeggio instrument where a chord is held
//            (the lowest and the highest note that are left, folded to at most an octave apart;
//            the top note and the pedal are already in voices 1 and 3)
//   voice 3  the pedal line
// In a thick passage of the fugue, where more notes sound than three voices can play, the notes
// between the lowest and the highest of voice 2 are left out.
//
// Time: speed 1, so one tick is one frame (20 ms). Every note and rest has the length of the
// score, scaled by one fixed number in each section, because the piece changes tempo. The
// lengths in the score are in 1/1536 of a bar (a thirty-second note is 48 of them):
//   bars 1-3      Adagio            12 per tick  (a thirty-second note is 4 ticks)
//   bars 4-27     Prestissimo       16 per tick  (a triplet sixteenth is 4 ticks)
//   bars 28-129   chords, fugue,
//                 recitative        12 per tick  (a sixteenth note is 8 ticks: 94 quarters a minute)
//   bars 130-132  Adagissimo         8 per tick
//   bars 133-140  Presto, Adagio    12 per tick
//   bars 141-143  Molto adagio       8 per tick
// The fermatas are held a little longer, as extra ticks: the three As of the opening and the
// rests after the first two phrases, the pauses in bars 5 and 7, bar 12, the chords of bars 127
// and 133, and the last chord. The mordent on the three As of the opening is written out (A G A).
// The one place where a note does not fit on a whole tick: the two sixty-fourth notes of bar 19
// (1.5 ticks each) get 1 and 2 ticks, joined with a legato marker.
//
// Notes are written as "A5:1" = note A5, 1 tick long; "r:8" = a rest of 8 ticks; "i2" = switch to
// instrument 2; "l" = legato marker. Octaves follow noteName(): A4 = 440 Hz. One bar per line.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import { defaultInstrument, parseNoteName } from '../project.js';

export const info = {
  id: 'toccata',
  title: 'Toccata in D minor',
  composer: 'J. S. Bach (attributed), arranged for SID',
  note: 'The whole organ piece, bar for bar: the famous opening, the runs and chords, the fugue and the closing recitative, with the fermatas held. Pulse organ in two voices, an arpeggio instrument for held chords, pedal bass.',
  source: 'Score: Toccata and Fugue in D Minor, BWV 565, from the Bach-Gesellschaft Ausgabe (1867), typeset for the Mutopia Project (piece 1780, www.mutopiaproject.org), public domain.',
};

const SPEED = 1;

// Instrument numbers: 0 and 1 are the two manual voices, 2 the pedal, 3 and up the arpeggio
// instruments (instrument 3 + k flutters between the note and the note + ARP_OFFSETS[k]).
const LEAD = 0, MID = 1, PEDAL = 2, ARP_FIRST = 3;
const ARP_OFFSETS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function instruments() {
  const base = defaultInstrument();
  // Organ: a pulse wave at full sustain with a short attack. The width moves slowly around 50
  // percent so that two voices on the same note do not simply add up; no vibrato, an organ has none.
  const organ = (name, pw, pwStep, pwMin, pwMax) => ({
    ...base, name, wave: 0x40, ad: 0x10, sr: 0xF0, pw, pwStep, pwMin, pwMax, release: 1,
  });
  const list = [];
  list[LEAD] = organ('Organ lead', 0x0800, 3, 0x60, 0xA0);
  list[MID] = organ('Organ second voice', 0x0600, -3, 0x50, 0x90);
  list[PEDAL] = { // a narrow pulse: the low notes keep their edge
    ...base, name: 'Pedal', wave: 0x40, ad: 0x10, sr: 0xF0, pw: 0x0500, pwStep: 0, pwMin: 0x20, pwMax: 0xE0, release: 1,
  };
  ARP_OFFSETS.forEach((semitones, k) => {
    list[ARP_FIRST + k] = { ...organ(`Chord +${semitones}`, 0x0600, -3, 0x50, 0x90), arp: semitones };
  });
  return list;
}

// "A5:1 G5:1 r:8 i2 ..." -> events.
function events(text) {
  return text.trim().split(/\s+/).map((token) => {
    if (token === 'l') return { type: 'legato' };
    if (/^i\d+$/.test(token)) return { type: 'inst', instrument: Number(token.slice(1)) };
    const [name, len] = token.split(':');
    const length = Number(len);
    if (name === 'r') return { type: 'rest', length };
    const pitch = parseNoteName(name);
    if (pitch === null) throw new Error(`toccata: unknown note "${token}"`);
    return { type: 'note', pitch, length };
  });
}


// The patterns of each voice, in playing order.
const VOICES = [
  [
    `
      i0 A5:2 G5:2 A5:36 r:4 G5:2 F5:2 E5:2 D5:2 C#5:4 D5:8 r:54 A4:2 G4:2 A4:36 r:4 E4:4 F4:4 C#4:4 D4:8 r:54
      A3:2 G3:2 A3:36 r:4 G3:2 F3:2 E3:2 D3:2 C#3:4 D3:8 r:80 E4:64 D4:32 r:56 C#4:8
      D4:4 E4:4 C#4:4 D4:4 E4:4 C#4:4 D4:4 E4:4 C#4:4 D4:6 E4:6 F4:4 G4:4 E4:4 F4:4 G4:4 E4:4 F4:4 G4:4 E4:4 F4:6 G4:6
      A4:4 A#4:4 G4:4 A4:4 A#4:4 G4:4 A4:4 A#4:4 G4:4 A4:6 r:98 C#5:6
    `,
    `
      i0 D5:4 E5:4 C#5:4 D5:4 E5:4 C#5:4 D5:4 E5:4 C#5:4 D5:6 E5:6 F5:4 G5:4 E5:4 F5:4 G5:4 E5:4 F5:4 G5:4 E5:4 F5:6 G5:6
      A5:4 A#5:4 G5:4 A5:4 A#5:4 G5:4 A5:4 A#5:4 G5:4 A5:6 r:98 A5:6
      G5:4 A#5:4 E5:4 G5:4 A#5:4 E5:4 F5:4 A5:4 D5:4 F5:4 A5:4 D5:4 E5:4 G5:4 C5:4 E5:4 G5:4 C5:4 D5:4 F5:4 A#4:4 D5:4 F5:4 A#4:4
      C5:4 E5:4 A4:4 C5:4 E5:4 A4:4 A#4:4 D5:4 G4:4 A#4:4 D5:4 G4:4 A4:4 C5:4 F4:4 A4:4 C5:4 F4:4 G4:4 A#4:4 E4:4 G4:4 A#4:4 E4:4
    `,
    `
      i0 F4:4 A4:4 D4:4 F4:4 A4:4 D4:4 E4:4 G4:4 C#4:4 E4:4 G4:4 C#4:4 r:24 A#4:51 A4:3 G4:3 F4:3 E4:3 D4:3 C#4:3 B3:3 C#4:6 A3:6 C#4:6 E4:3 G4:3 F4:18 E4:6
      F4:54 r:18 A4:6 D5:6 E5:6 F5:6 D5:6 E5:6 F5:6 G5:6 E5:6
      F5:6 G5:6 A5:6 F5:6 G5:6 A5:6 A#5:6 G5:6 A5:6 F5:6 G5:6 E5:6 F5:6 D5:6 E5:6 C#5:6
      D5:6 A4:6 A#4:6 G4:6 A4:6 F4:6 G4:6 E4:6 F4:6 D4:6 G4:6 E4:6 F4:6 D4:6 E4:6 C#4:6
    `,
    `
      i0 D4:6 A3:6 A#3:6 G3:6 A3:6 F3:6 G3:6 E3:6 F3:6 D3:6 G3:6 E3:6 F3:6 D3:6 E3:6 C#3:6
      D3:12 D4:3 F4:3 A#4:3 F4:3 C4:3 E4:3 A4:3 E4:3 A#3:3 D4:3 G4:3 D4:3 A3:3 C#4:3 E4:3 A4:3 D4:6 A#4:6 A3:6 A4:6 A#3:6 G4:6
      A4:12 D4:3 F4:3 A#4:3 F4:3 C4:3 E4:3 A4:3 E4:3 A#3:3 D4:3 G4:3 D4:3 A3:3 C#4:3 E4:3 A4:3 D4:6 A#4:6 A3:6 A4:6 A#3:6 G4:6
      A4:27 G4:3 F4:3 E4:3 D4:3 C#4:3 B3:3 C#4:3 A3:3 B3:3 C#4:3 D4:3 E4:3 F4:3 G4:3 A4:3 G4:3 F4:3 E4:3 F4:3 D4:3 F4:3 A4:3 C#5:3
    `,
    `
      i0 D5:3 A4:3 B4:3 C#5:3 D5:3 E5:3 F5:1 l G5:2 A5:3 A#5:12 D5:6 A#5:6 A4:6 A5:6 A#4:6 G5:6 A5:12 D5:3 F5:3 A#5:3 F5:3
      C5:3 E5:3 A5:3 E5:3 A#4:3 D5:3 G5:3 D5:3 A4:3 C#5:3 E5:3 A5:3 D5:6 A#5:6 A4:6 A5:6 A#4:6 G5:6 A5:12 B4:12
      C#5:18 B4:6 A4:6 C#5:6 E5:3 G5:3 A#5:6 A5:3 G5:3 F5:3 E5:3 F5:3 E5:3 D5:3 C#5:3 D5:3 C5:3 A#4:3 A4:3 G4:3 F4:3 E4:3 D4:3
    `,
    `
      i0 E5:48 r:4 E5:4 C#5:4 A#4:4 C#5:4 A#4:4 C#5:4 E5:4 C#5:4 A#4:4 C#5:4 A#4:4
      C#5:4 E5:4 C#5:4 A#4:4 C#5:4 A#4:4 C#5:4 E5:4 C#5:4 A#4:4 C#5:4 A#4:4 G4:4 A#4:4 G4:4 E4:4 G4:4 E4:4 G4:4 A#4:4 G4:4 E4:4 G4:4 A#4:4
      G4:4 A#4:4 G4:4 E4:4 G4:4 E4:4 G4:4 A#4:4 G4:4 E4:4 G4:4 E4:4 C#4:4 E4:4 C#4:4 A#3:4 C#4:4 A#3:4 C#4:4 E4:4 C#4:4 A#3:4 C#4:4 A#3:4
      C#4:4 E4:4 C#4:4 A#3:4 C#4:4 A#3:4 C#4:4 E4:4 C#4:4 A#3:4 C#4:4 A#3:4 C#4:4 E4:4 C#4:4 E4:4 G4:4 E4:4 C#4:4 E4:4 C#4:4 E4:4 G4:4 E4:4
    `,
    `
      i0 C#4:4 E4:4 C#4:4 E4:4 G4:4 E4:4 C#4:4 E4:4 C#4:4 E4:4 G4:4 E4:4 G4:4 A#4:4 G4:4 A#4:4 G4:4 A#4:4 G4:4 A#4:4 G4:4 A#4:4 G4:4 A#4:4
      C#5:4 A#4:4 C#5:4 E5:4 C#5:4 E5:4 C#5:4 E5:4 C#5:4 E5:4 C#5:4 E5:4 A5:24 A5:24
      G5:32 r:32 G5:32 r:88 C#5:8 D5:16 F4:16 E4:32
      D4:64 r:8 A4:8 G4:8 A4:8 F4:8 A4:8 E4:8 A4:8
      D4:8 A4:8 C#4:8 A4:8 D4:8 A4:8 E4:8 A4:8 F4:8 A4:8 A3:8 A4:8 B3:8 A4:8 C#4:8 A4:8
    `,
    `
      i0 D4:8 A4:8 C#4:8 A4:8 D4:8 A4:8 E4:8 A4:8 F4:8 D5:8 C5:8 D5:8 A#4:8 D5:8 A4:8 D5:8
      G4:8 D5:8 F#4:8 D5:8 G4:8 D5:8 A4:8 D5:8 A#4:8 D5:8 D4:8 D5:8 E4:8 D5:8 F#4:8 D5:8
      G4:8 D5:8 F#4:8 D5:8 G4:8 D5:8 A4:8 D5:8 A#4:16 D5:16 A#4:16 D5:16
      D#5:16 G4:16 D#5:16 G4:16 C5:16 A4:16 C5:16 A4:16
      D5:16 F4:16 D5:16 F4:16 A#4:16 G4:16 A#4:16 G4:16
      C#5:16 E4:16 C#5:16 E4:16 A4:16 F4:16 A4:16 F4:16
    `,
    `
      i0 G4:16 C#4:16 G4:16 C#4:16 F4:16 D4:16 F4:16 D4:16
      E4:16 A#3:16 E4:16 A#3:16 A3:8 A5:8 G5:8 A5:8 F5:8 A5:8 E5:8 A5:8
      D5:8 A5:8 C#5:8 A5:8 D5:8 A5:8 E5:8 A5:8 F5:8 A5:8 A4:8 A5:8 B4:8 A5:8 C#5:8 A5:8
      D5:8 A5:8 C#5:8 A5:8 D5:8 A5:8 E5:8 A5:8 F5:8 A5:8 E5:8 A5:8 D5:8 A5:8 C5:8 A5:8
      A#4:8 A5:8 C5:8 A5:8 D5:8 G5:8 A#4:8 G5:8 E5:8 G5:8 D5:8 G5:8 C5:8 G5:8 A#4:8 G5:8
    `,
    `
      i0 A4:8 G5:8 A#4:8 G5:8 C5:8 F5:8 A4:8 F5:8 D5:8 F5:8 C5:8 F5:8 A#4:8 F5:8 A4:8 F5:8
      G4:8 F5:8 A4:8 F5:8 A#4:8 E5:8 G4:8 E5:8 C#5:8 E5:8 A#4:8 E5:8 A4:8 E5:8 G4:8 E5:8
      F4:8 E5:8 G4:8 E5:8 A4:8 D5:8 F4:8 D5:8 E4:8 E5:8 E4:8 E5:8 F4:8 D5:8 F4:8 D5:8
      A#4:8 C#5:8 A#4:8 C#5:8 A4:8 D5:8 F4:8 D5:8 E4:8 E5:8 E4:8 E5:8 F4:8 D5:8 F4:8 D5:8
    `,
    `
      i0 E4:8 D5:8 C#5:8 D5:8 B4:8 D5:8 C#5:8 B4:8 C#5:32 E4:8 G4:8 F4:8 E4:8
      F4:8 D5:8 C#5:8 D5:8 F5:8 D5:8 C#5:8 B4:8 C#5:32 E5:48 D5:32 C#5:16 C5:32 A#4:32
      A4:32 A4:32 G4:32 G4:32
      F#4:16 A4:32 D#5:16 D5:32 A#4:16 G5:32 F#5:16 G5:32 A#4:16 D5:16 D5:16 D5:16
      D5:16 D5:16 D5:16 D5:16 D5:16 D5:16 D5:16 D5:16
      D5:8 G5:8 F5:8 G5:8 E5:8 F5:8 D5:8 E5:8 C5:8 A5:8 G5:8 A5:8 F5:8 G5:8 E5:8 F5:8
    `,
    `
      i0 D5:8 A#5:8 A5:8 A#5:8 G5:8 A5:8 F5:8 G5:8 E5:8 C6:8 A#5:8 C6:8 A5:8 A#5:8 G5:8 A5:8
      F5:8 D#5:8 D5:8 C5:8 D5:8 C5:8 A#4:8 A4:8 A#4:8 D5:8 A#4:8 A4:8 G4:8 A#4:8 G4:8 F4:8
      E4:8 F4:8 G4:8 A4:8 A#4:8 D5:8 C5:8 A#4:8 A4:32 C5:16 A#4:16
      A4:16 G4:16 A4:16 A#4:16 C5:16 E4:16 F4:16 G4:16
      A4:16 G4:16 A4:16 A#4:16 C5:8 A#4:8 A4:8 G4:8 F4:8 D#4:8 D4:8 C4:8
      D5:8 C5:8 A#4:8 A4:8 G4:8 F4:8 E4:8 D4:8 E5:8 D5:8 C5:8 A#4:8 A4:8 G4:8 F4:8 E4:8
    `,
    `
      i0 F5:8 E5:8 D5:8 C5:8 A#4:8 A4:8 G4:8 F4:8 G5:8 F5:8 E5:8 D5:8 C5:8 A#4:8 A4:8 G4:8
      A5:8 F5:8 E5:8 F5:8 C5:8 F5:8 E5:8 F5:8 A5:8 F5:8 E5:8 F5:8 C5:8 F5:8 E5:8 F5:8
      G5:8 E5:8 D5:8 E5:8 C5:8 E5:8 D5:8 E5:8 G5:8 E5:8 D5:8 E5:8 C5:8 E5:8 D5:8 E5:8
      A5:8 F5:8 E5:8 F5:8 C5:8 F5:8 E5:8 F5:8 A5:8 F5:8 E5:8 F5:8 C5:8 F5:8 E5:8 F5:8
    `,
    `
      i0 G5:8 E5:8 D5:8 E5:8 C5:8 E5:8 D5:8 E5:8 G5:8 E5:8 D5:8 E5:8 C5:8 E5:8 D5:8 E5:8
      F5:8 G5:8 F5:8 E5:8 D5:8 C5:8 B4:8 A4:8 B4:8 G4:8 B4:8 D5:8 F5:8 A5:8 F5:8 D5:8
      B4:8 G4:8 B4:8 D5:8 F5:8 A5:8 F5:8 D5:8 A#4:8 G4:8 A#4:8 C5:8 E5:8 G5:8 E5:8 C5:8
      A#4:8 G4:8 A#4:8 C5:8 E5:8 G5:8 E5:8 C5:8 A4:8 F4:8 A4:8 C5:8 D5:8 F5:8 D5:8 A#4:8
    `,
    `
      i0 A4:8 F4:8 A4:8 C5:8 D5:8 F5:8 D5:8 A#4:8 G4:8 E4:8 G4:8 A#4:8 C#5:8 E5:8 C#5:8 A#4:8
      G4:8 E4:8 G4:8 A#4:8 C#5:8 E5:8 C#5:8 A#4:8 A4:8 A5:8 G5:8 A5:8 F5:8 A5:8 E5:8 A5:8
      D5:8 A5:8 C#5:8 A5:8 D5:8 A5:8 E5:8 A5:8 F5:8 A5:8 A4:8 A5:8 B4:8 A5:8 C#5:8 A5:8
      D5:8 A5:8 C#5:8 A5:8 D5:16 E5:16 D5:16 C5:16 A#4:16 A4:16
      A#4:8 A4:8 G4:8 F4:8 E4:8 D4:8 C#4:8 B3:8 C#3:8 A2:8 C#3:8 E3:8 G3:8 A#3:8 G3:8 E3:8
    `,
    `
      i0 C#3:8 A2:8 C#3:8 E3:8 G3:8 A#3:8 G3:8 E3:8 D3:8 A2:8 D3:8 F3:8 A3:8 D4:8 A3:8 F3:8
      D3:8 A2:8 D3:8 F3:8 A3:8 D4:8 A3:8 F3:8 C#3:8 A2:8 C#3:8 E3:8 G3:8 A#3:8 G3:8 E3:8
      C#3:8 A2:8 C#3:8 E3:8 G3:8 A#3:8 G3:8 E3:8 D3:8 A2:8 D3:8 F3:8 A3:8 D4:8 A3:8 F3:8
      D3:8 A2:8 D3:8 F3:8 A3:8 D4:8 A3:8 F3:8 E3:8 C#3:8 E3:8 G3:8 A#3:8 C#4:8 A#3:8 G3:8
    `,
    `
      i0 E3:8 C#3:8 E3:8 G3:8 A#3:8 C#4:8 A#3:8 G3:8 F3:8 D3:8 F3:8 A3:8 D4:8 F4:8 D4:8 A3:8
      F3:8 D3:8 F3:8 A3:8 D4:8 F4:8 D4:8 A3:8 E3:8 C#3:8 E3:8 G3:8 A#3:8 C#4:8 A#3:8 G3:8
      E3:8 C#3:8 E3:8 G3:8 A#3:8 C#4:8 A#3:8 G3:8 F3:8 D3:8 F3:8 A3:8 D4:8 F4:8 D4:8 A3:8
      F3:8 D3:8 F3:8 A3:8 D4:8 F4:8 D4:8 A3:8 G3:8 E3:8 G3:8 A#3:8 C#4:8 E4:8 C#4:8 A#3:8
    `,
    `
      i0 G3:8 E3:8 G3:8 A#3:8 C#4:8 E4:8 C#4:8 A#3:8 A3:8 F3:8 A3:8 C#4:8 D4:8 F4:8 D4:8 A3:8
      A#3:8 D4:8 A#3:8 G3:8 F3:8 A3:8 F3:8 D3:8 A2:8 D3:8 A2:8 F2:8 D2:8 D3:8 C#3:8 B2:8
      C#3:8 A#3:8 A3:8 G3:8 F3:8 G3:8 F3:8 E3:8 D3:8 A#3:8 A3:8 G3:8 F3:8 G3:8 F3:8 E3:8
      D3:8 E3:4 F3:4 G3:4 A3:4 B3:4 C#4:4 D4:8 F4:8 E4:8 D4:8 A4:8 B3:4 C#4:4 D4:4 E4:4 F4:4 G4:4 A4:8 E5:8 D5:8 C#5:8
    `,
    `
      i0 D5:8 D#5:4 D5:4 C5:4 A#4:4 A4:4 G4:4 F#4:16 A4:32 G4:16 C5:16 B4:16
      D#5:16 D5:16 D#5:16 B4:16 C5:16 B4:16 C5:16 D5:16
      D#5:16 D5:16 D#5:16 F5:16 G5:255 l G5:9 G5:8 F5:8 G5:8 D#5:8 F5:8 D5:8 D#5:8
      C5:8 F5:8 D#5:8 F5:8 D5:8 D#5:8 C5:8 D5:8 A#4:8 D#5:8 D5:8 D#5:8 C5:8 D5:8 A#4:8 C5:8
      A4:8 D5:8 C5:8 D5:8 A#4:8 C5:8 A4:8 A#4:8 G4:8 A#4:8 A4:8 A#4:8 C5:8 A#4:8 A4:8 G4:8
    `,
    `
      i0 F#4:16 A4:16 D5:8 G4:8 C5:8 F#4:8 A#4:8 G4:8 D5:8 A4:8 A#4:8 G4:8 A4:8 F#4:8
      G4:8 D5:8 F#4:8 D5:8 G4:8 D5:8 A4:8 D5:8 A#4:8 G4:8 D5:8 A4:8 A#4:8 G4:8 C5:8 A4:8
      D5:8 C5:8 A#4:8 A4:8 A#4:8 A4:8 A#4:8 G4:8 A4:8 A#4:8 C5:8 D5:8 D#5:8 D5:8 C5:8 D5:8
      A#4:8 C5:8 A4:8 A#4:8 G4:16 B4:16 C5:8 D#5:8 F5:8 G5:8 G#5:8 G5:8 F5:8 G5:8
      D#5:8 F5:8 D5:8 D#5:8 C5:16 A#4:16 A4:16 A#4:32 A4:32 G4:32 F#4:16 F4:16 D#4:32 D4:8 A#4:8
    `,
    `
      i0 A4:8 A#4:8 A4:8 G4:8 F#4:8 D#5:8 D5:8 C5:8 A#4:8 A5:8 G5:8 F#5:8 G5:24 F5:8
      D#5:8 F5:8 D5:8 D#5:8 C#5:32 D5:32 C5:32
      A#4:32 A4:16 C#5:16 D5:16 E5:16 F5:32
      E5:64 D5:48 F5:16
      G5:16 D5:16 C#5:16 D5:16 E5:16 D5:16 C#5:16 D5:16
      E5:16 D5:16 C#5:16 D5:16 E5:16 G5:16 F5:16 D5:16
      A#4:16 E5:16 D5:16 D5:16 C#5:32 D5:16 E5:16
      F5:16 E5:16 F5:16 C#5:16 D5:16 C#5:16 D5:16 E5:16
      F5:16 E5:16 F5:16 G5:16 A5:8 A#5:8 G5:8 A5:8 F5:8 G5:8 E5:8 F5:8
    `,
    `
      i0 D5:8 A4:8 C#5:8 A4:8 D5:8 A4:8 E5:8 A4:8 F5:8 A4:8 E5:8 A4:8 F5:8 A4:8 G5:8 A4:8
      A5:8 A4:8 E5:8 A4:8 F5:8 A4:8 G5:8 A4:8 A5:32 r:232 E5:8 D5:8 C#5:8 D5:16 D4:8 F5:8
      E5:8 F5:8 G5:8 A5:8 A#5:8 A5:8 G5:8 A5:8 F5:16 E5:16 D5:8 E5:8 F5:8 D#5:8
      D5:8 C5:8 A#4:8 A4:8 G4:8 A4:8 A#4:8 C5:8 A4:32 A3:8 C4:8 C5:32 A#4:16 G3:8 A#3:8 G5:16 D#5:8 F5:8 D5:8 D#5:8 C5:8 A#4:8 A4:8 G4:8
    `,
    `
      i0 A4:32 A3:8 D4:8 A3:8 G3:8 F#3:8 D3:8 F#3:8 G3:8 A3:8 D4:8 A3:8 F#3:8
      G3:8 D3:8 G3:8 A3:8 A#3:8 D4:8 A#3:8 A3:8 G3:8 D3:8 G3:8 A3:8 A#3:8 D4:8 C4:8 A#3:8
      A3:8 F#3:8 A3:8 A#3:8 C4:8 D#4:8 C4:8 A#3:8 A3:8 F#3:8 A3:8 A#3:8 C4:8 D#4:8 C4:8 A#3:8
      A3:8 A#3:8 D4:8 F#4:8 G4:8 A#4:8 G4:8 D4:8 A#3:8 G3:8 A#3:8 D4:8 G4:8 A#4:8 G4:8 D4:8
      C4:8 A3:8 C4:8 D#4:8 F#4:8 A4:8 F#4:8 D#4:8 C4:8 A3:8 C4:8 D#4:8 F#4:8 A4:8 F#4:8 D#4:8
    `,
    `
      i0 D4:16 r:16 D5:16 C5:16 A#4:32 C5:16 D5:16
      D#5:32 F5:16 G5:16 A5:32 F5:16 D#5:16
      D5:8 D#5:8 D5:8 C5:8 A#4:8 C5:8 A#4:8 A4:8 G4:8 C5:8 A#4:8 A4:8 G4:8 A4:8 G4:8 F#4:8
      G4:8 F4:8 E4:8 D4:8 C#4:16 E4:16 F4:8 G4:8 A4:8 B4:8 C#5:8 D5:8 E5:8 F5:8
      G5:16 F5:8 E5:8 D5:16 C#5:16 D5:16 E5:16 F5:16 G5:16
      A5:16 C#5:16 D5:16 E5:16 F5:16 E5:16 F5:16 D5:16
      E5:16 D5:16 D5:16 C#5:16 D5:16 F5:16 E5:32
    `,
    `
      i0 D5:94 r:4 F5:4 G5:4 A5:4 A#5:4 A4:4 A#4:4 C5:4 D5:4 C5:4 D5:4 D#5:4 F5:4 F4:4 G4:4 A4:4
      A#4:4 A4:4 A#4:4 C5:4 D5:4 A4:4 G4:4 F4:4 D#4:4 G4:4 A4:4 A#4:4 C5:4 G4:4 F4:4 D#4:4 D4:4 F4:4 G4:4 A4:4 A#4:4 A3:4 A#3:4 C4:4 D4:4 C4:4 D4:4 D#4:4 F4:4 F3:4 G3:4 A3:4
      A#3:4 A3:4 A#3:4 C4:4 D4:4 C4:4 A#3:4 A3:4 G3:4 A#3:4 C4:4 D4:4 D#4:4 D4:4 C4:4 A#3:4 A3:4 C4:4 D4:4 E4:4 F#4:4 D#4:4 D4:4 C4:4 A#3:4 F#4:4 G4:4 A4:4 A#4:4 C5:4 D5:4 r:4
    `,
    `
      i0 E5:144 D5:144 r:168 D5:24 C5:96
      C5:94 r:4 G4:4 F4:4 G4:4 E4:4 E4:4 D4:4 E4:4 C4:4 A4:4 G4:4 A4:4 F4:4 F4:4 E4:4 F4:4
      D4:4 B4:4 A4:4 B4:4 G4:4 G4:4 F4:4 G4:4 E4:4 C5:4 B4:4 C5:4 A4:4 D5:4 C5:4 D5:4 B4:4 E5:4 D5:4 E5:4 C5:4 F5:4 E5:4 F5:4 D5:4 G5:4 F5:4 G5:4 E5:4 C5:4 B4:4 C5:4
      A4:4 D5:4 C5:4 D5:4 B4:4 G#4:4 F#4:4 G#4:4 E4:4 C5:4 B4:4 C5:4 A4:4 F4:4 E4:4 F4:4 D4:4 B4:4 A4:4 B4:4 C4:4 A4:4 G4:4 A4:4 B3:4 G#4:4 F#4:4 G#4:4 E4:4 C4:4 B3:4 A3:4
    `,
    `
      i0 G#3:4 D4:4 C4:4 B3:4 A3:4 E4:4 D4:4 C4:4 B3:4 F4:4 E4:4 D4:4 C4:4 G4:4 F4:4 E4:4 D4:4 A4:4 G4:4 F4:4 E4:4 G4:4 A4:4 B4:4 C5:32
      C#5:16 A3:4 C#4:4 E4:4 A4:4 C#5:16 C#5:16 D5:16 A3:4 D4:4 F4:4 A4:4 D5:16 D5:16
      B4:16 G3:4 B3:4 D4:4 G4:4 B4:16 B4:16 C5:16 G3:4 C4:4 E4:4 G4:4 C5:16 C5:16
      A4:16 F3:4 A3:4 C4:4 F4:4 A4:16 A4:16 A#4:16 F3:4 A#3:4 D4:4 F4:4 A#4:16 A#4:16
    `,
    `
      i0 A#4:16 E3:4 G3:4 A#3:4 C#4:4 A#4:16 A#4:16 A4:16 D3:4 A3:4 D4:4 F#4:4 A4:16 A4:64 G4:96 F4:48
      E4:96 D4:255 l D4:93
    `,
  ],
  [
    `
      i1 A4:2 G4:2 A4:36 r:4 G4:2 F4:2 E4:2 D4:2 C#4:4 D4:8 r:54 A3:2 G3:2 A3:36 r:4 E3:4 F3:4 C#3:4 D3:8 r:54
      A2:2 G2:2 A2:36 r:4 G2:2 F2:2 E2:2 D2:2 C#2:4 D2:8 r:80 i14 C#3:64 i9 D3:8 D3:8 D3:16 r:56 i1 C#3:8
      D3:4 E3:4 C#3:4 D3:4 E3:4 C#3:4 D3:4 E3:4 C#3:4 D3:6 E3:6 F3:4 G3:4 E3:4 F3:4 G3:4 E3:4 F3:4 G3:4 E3:4 F3:6 G3:6
      A3:4 A#3:4 G3:4 A3:4 A#3:4 G3:4 A3:4 A#3:4 G3:4 A3:6 r:98 C#4:6
    `,
    `
      i1 D4:4 E4:4 C#4:4 D4:4 E4:4 C#4:4 D4:4 E4:4 C#4:4 D4:6 E4:6 F4:4 G4:4 E4:4 F4:4 G4:4 E4:4 F4:4 G4:4 E4:4 F4:6 G4:6
      A4:4 A#4:4 G4:4 A4:4 A#4:4 G4:4 A4:4 A#4:4 G4:4 A4:6 r:98 A4:6
      G4:4 A#4:4 E4:4 G4:4 A#4:4 E4:4 F4:4 A4:4 D4:4 F4:4 A4:4 D4:4 E4:4 G4:4 C4:4 E4:4 G4:4 C4:4 D4:4 F4:4 A#3:4 D4:4 F4:4 A#3:4
      C4:4 E4:4 A3:4 C4:4 E4:4 A3:4 A#3:4 D4:4 G3:4 A#3:4 D4:4 G3:4 A3:4 C4:4 F3:4 A3:4 C4:4 F3:4 G3:4 A#3:4 E3:4 G3:4 A#3:4 E3:4
    `,
    `
      i1 F3:4 A3:4 D3:4 F3:4 A3:4 D3:4 E3:4 G3:4 C#3:4 E3:4 G3:4 C#3:4 r:24 i8 C#3:48 r:72
      i14 D3:54 r:27 i1 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:3 r:3 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:3 r:3 A4:3 r:6 A4:3 A4:6 A4:3 r:6 A4:3 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:3 r:3 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:6 A4:3 r:66 F4:6 r:6 E4:6 r:6 D4:6
    `,
    `
      i14 E3:12 r:54 i1 F4:6 r:6 E4:6 r:6 D4:6
      i14 E3:24 r:114 i1 F5:6 r:6 E5:6 r:6 D5:6 i14 E4:12 r:54 i1 F5:6 r:6 E5:6 r:6 D5:6 i14 E4:12 i8 B3:12
      i14 A3:24 r:72
      C#4:48 i11 E4:4 i1 G4:4 E4:4 C#4:4 E4:4 C#4:4 E4:4 G4:4 E4:4 C#4:4 E4:4 C#4:4
      E4:4 G4:4 E4:4 C#4:4 E4:4 C#4:4 E4:4 G4:4 E4:4 C#4:4 E4:4 C#4:4 A#3:4 C#4:4 A#3:4 G3:4 A#3:4 G3:4 A#3:4 C#4:4 A#3:4 G3:4 A#3:4 G3:4
    `,
    `
      i1 A#3:4 C#4:4 A#3:4 G3:4 A#3:4 G3:4 A#3:4 C#4:4 A#3:4 G3:4 A#3:4 G3:4 E3:4 G3:4 E3:4 C#3:4 E3:4 C#3:4 E3:4 G3:4 E3:4 C#3:4 E3:4 C#3:4
      E3:4 G3:4 E3:4 C#3:4 E3:4 C#3:4 E3:4 G3:4 E3:4 C#3:4 E3:4 C#3:4 E3:4 G3:4 E3:4 G3:4 A#3:4 G3:4 E3:4 G3:4 E3:4 G3:4 A#3:4 G3:4
      E3:4 G3:4 E3:4 G3:4 A#3:4 G3:4 E3:4 G3:4 E3:4 G3:4 A#3:4 G3:4 E3:4 G3:4 E3:4 G3:4 E3:4 G3:4 A#3:4 C#4:4 A#3:4 C#4:4 A#3:4 C#4:4
    `,
    `
      i1 E4:4 C#4:4 E4:4 C#4:4 E4:4 C#4:4 E4:4 C#4:4 E4:4 C#4:4 E4:4 C#4:4 i9 A3:24 i10 A3:24
      i14 D4:32 r:32 i5 C#4:32 r:88 i14 A3:8 A3:16 i7 A3:32 i6 A3:8 i8 G3:8
      i9 D3:16 D3:8 D3:8 D3:32 r:255 r:9 i1 F4:8 F#4:16 G4:16 C4:16
      A#3:16 A3:16 A#3:16 C4:16 D4:16 F#3:16 G3:16 A3:16
      A#3:16 A3:16 A#3:16 F#3:16 G3:8 G4:8 G3:8 G4:8 D4:8 G4:8 D4:8 G4:8
      C4:8 D#4:8 C4:8 D#4:8 C4:8 D#4:8 C4:8 D#4:8 C4:8 F4:8 C4:8 F4:8 C4:8 F4:8 C4:8 F4:8
    `,
    `
      i1 A#3:8 D4:8 A#3:8 D4:8 A#3:8 D4:8 A#3:8 D4:8 A#3:8 E4:8 A#3:8 E4:8 A#3:8 E4:8 A#3:8 E4:8
      A3:8 C#4:8 A3:8 C#4:8 A3:8 C#4:8 A3:8 C#4:8 F3:8 D4:8 F3:8 D4:8 F3:8 D4:8 F3:8 D4:8
      E3:8 A#3:8 E3:8 A#3:8 E3:8 A#3:8 E3:8 A#3:8 D3:8 A3:8 D3:8 A3:8 D3:8 A3:8 D3:8 A3:8
      E3:8 G3:8 E3:8 G3:8 E3:8 G3:8 E3:8 G3:8 F3:8 i6 F3:8 i7 E3:16 i9 D3:16 i4 G3:16
    `,
    `
      i6 F3:16 i7 E3:16 i6 F3:16 i10 C#3:16 i9 D3:16 i10 C#3:16 i9 D3:16 i7 E3:16
      i6 F3:16 i7 E3:16 i6 F3:16 i10 C#3:16 i9 D3:32 i11 F3:32
      i9 G3:32 r:32 i14 C3:32 i10 E3:32
      i9 F3:32 r:32 i14 A#2:32 i10 D3:32
      i8 E3:32 r:32 i14 A2:32 i10 C#3:32
      i9 D3:32 r:16 i11 F3:16 i5 A#3:16 A#3:16 i7 A3:16 A3:16
      i11 G3:32 r:16 i7 A3:16 i5 A#3:16 A#3:16 i7 A3:16 A3:16
    `,
    `
      i1 G#3:8 i10 G#3:24 r:40 i1 A4:8 G4:8 A4:8 r:40 F4:24 D4:32 A3:8 A4:8 G4:8 A4:8 C#4:8 G4:8 F4:8 E4:8
      F4:8 i5 D4:8 i6 C#4:8 i5 D4:8 i9 A3:8 A3:8 i11 G3:8 i9 A3:8 i10 F#3:8 i1 D4:8 i10 C#4:8 i9 D4:8 i4 G3:8 i6 F4:8 D#4:8 i7 D4:8
      i8 C#4:8 i5 E4:8 i12 A3:8 i8 C#4:8 i6 D3:8 i5 D#4:8 i6 D4:8 i8 C4:8 B3:8 i5 D4:8 i12 G3:8 i8 B3:8 i5 C3:8 i3 D4:8 i5 C4:8 i7 A#3:8
    `,
    `
      i8 A3:8 i5 C4:8 i10 F#3:8 i7 A3:8 i6 D3:8 i8 C4:8 i4 A#3:8 i5 A3:8 i4 A#3:8 i5 A4:8 G4:8 F#4:8 i1 G4:8 A#3:8 i3 A3:8 i5 G3:8
      i9 D4:32 i1 D5:16 i12 D4:16 i1 D4:16 i9 D4:16 i10 D4:16 i8 C4:16
      i11 A#3:16 i6 D4:16 i7 D4:16 i11 C4:16 i14 A#3:16 i9 D4:16 i10 D4:16 i8 C4:16
      i11 A#3:8 i14 A#3:8 i13 A#3:8 i14 A#3:8 i1 G4:8 A4:8 F4:8 G4:8 E4:8 C5:8 A#4:8 C5:8 A4:8 A#4:8 G4:8 A4:8
    `,
    `
      i1 F4:8 D5:8 C5:8 D5:8 A#4:8 C5:8 A4:8 A#4:8 G4:8 E5:8 D5:8 E5:8 C5:8 D5:8 A#4:8 C5:8
      A4:16 F4:16 A#4:8 A4:8 G4:8 F4:8 G4:8 A#4:8 G4:8 F4:8 E4:8 G4:8 E4:8 D4:8
      C4:8 D4:8 E4:8 F4:8 G4:16 E4:16 F4:8 i7 C4:8 i9 A#3:8 i7 C4:8 i1 A3:8 C4:8 G3:8 C4:8
      F3:8 C4:8 E3:8 C4:8 F3:8 C4:8 G3:8 C4:8 A3:8 C4:8 C3:8 C4:8 D3:8 C4:8 E3:8 C4:8
    `,
    `
      i1 F3:8 C4:8 E3:8 C4:8 F3:8 C4:8 G3:8 C4:8 A3:32 r:32
      A#3:16 r:48 C4:16 r:48
      D4:16 r:48 E4:16 r:48
      F4:16 r:24 C5:8 r:16 F4:16 r:24 C5:8 r:16
      E4:16 r:24 C5:8 r:16 E4:16 r:24 C5:8 r:16
      F4:16 r:24 C5:8 r:16 F4:16 r:24 C5:8 r:16
      E4:16 r:24 C5:8 r:16 E4:16 r:24 C5:8 r:16
      D4:16 r:255 r:255 r:58 A4:8 C#5:16 D5:16 G4:16
      F4:16 A4:16 B4:16 C#5:16 D5:16 C#5:16 D5:16 E5:16
    `,
    `
      i1 F5:16 E5:16 F5:8 i10 A4:8 i8 G4:8 i6 A4:8 r:8 i1 F#4:8 i7 E4:8 i5 F#4:8 i1 G4:8 i7 D4:8 i8 C4:8 i6 D4:8
      i11 A#3:8 i9 C4:8 i1 A#3:8 A3:8 G3:8 F3:8 E3:8 D3:8 r:255 r:255 r:255 r:255 r:255 r:255 r:6 A3:8 r:32 G4:8 F4:8 E4:8
      F4:16 r:24 D#4:8 D4:8 C4:8 A#3:16 B3:16 C4:16 G4:16
      G4:200 G4:8 F4:8 G4:8 D#4:8 G4:8 D4:8 G4:8
    `,
    `
      i1 C4:8 G4:8 B3:8 G4:8 C4:8 G4:8 D4:8 G4:8 D#4:8 G4:8 G3:8 G4:8 A3:8 G4:8 B3:8 G4:8
      C4:8 G4:8 B3:8 G4:8 C4:8 G4:8 D4:8 D4:8 D#4:16 D4:16 G4:8 G#4:8 F4:8 G4:8
      D#4:16 C4:16 F4:8 G4:8 D#4:8 F4:8 D4:16 A#3:16 D#4:8 F4:8 D4:8 D#4:8
      C4:16 F#4:16 G4:8 A4:8 F4:8 G4:8 D#4:8 G4:8 F#4:8 G4:8 A4:8 G4:8 F#4:8 E4:8 r:8 D4:8 C4:8 D4:8 A#3:8 D4:8 A3:8 D4:8 G3:8 D4:8 F#3:8 D4:8 G3:8 D4:8 A3:8 D4:8
    `,
    `
      i1 A#3:8 D4:8 r:8 D4:8 E3:8 D4:8 F#3:8 D4:8 G3:8 D4:8 F#3:8 D4:8 G3:8 D4:8 A3:8 D4:8
      A#3:16 A3:16 G3:64 F#3:32
      G3:16 A3:16 A#3:8 A3:8 G3:8 F3:8 D#3:16 D#4:16 D4:32
      C4:16 D4:16 D#4:8 F4:8 D4:8 D#4:8 C4:8 D#4:8 D4:8 F4:8 G4:8 F4:8 D#4:8 F4:8
      D4:8 A#3:8 D#4:8 D4:8 C#4:8 A3:8 D4:8 C4:8 B3:8 G3:8 C4:8 A#3:8 A3:8 F3:8 A#3:8 D4:8
      C4:8 D4:8 C4:8 A#3:8 A3:8 C4:8 A#3:8 A3:8 G3:8 C4:8 A#3:8 A3:8 A#3:8 C4:8 A#3:8 A3:8
    `,
    `
      i1 G3:8 A3:8 F3:8 G3:8 E3:8 i8 E3:8 i7 E3:8 i5 E3:8 F#3:8 F#3:8 F#3:8 F#3:8 i6 D3:8 D3:8 D3:8 D3:8
      i14 G3:8 i12 G3:8 i10 G3:8 i9 G3:8 i6 A3:8 i5 A#3:8 i9 A3:8 i11 G3:8 i14 F3:8 i12 G3:8 i5 E3:8 i12 A3:8 i9 D3:8 i7 D3:8 i14 D3:8 D3:8
      i9 G4:8 i7 A4:8 i9 G4:8 i7 A4:8 i5 A#4:8 i6 A4:8 i8 G4:8 i6 A4:8 F4:8 i5 G4:8 E4:8 i6 F4:8 i5 D4:8 i7 C4:8 i13 A#3:8 i14 A3:8
    `,
    `
      i11 A#3:8 i12 A3:8 i4 G3:8 i6 F3:8 i5 E3:8 i4 F3:8 i3 E3:8 i5 D3:8 i8 C#3:8 i12 A2:8 i5 D3:8 i10 A2:8 i14 E3:8 i9 A2:8 i6 F3:8 i14 A2:8
      i5 G3:8 i3 A2:8 i6 F3:8 i14 A2:8 i5 E3:8 i12 A2:8 i5 D3:8 i10 A2:8 C#3:8 i14 A3:8 i9 A2:8 A3:8 i14 D3:8 i7 A3:8 i6 F3:8 i9 D4:8
      i4 F3:8 i7 D4:8 i5 E3:8 i8 C#4:8 i6 F3:8 i9 D4:8 i5 D3:8 D4:8 i9 A3:8 i14 A3:8 i12 A3:8 i14 A3:8 i10 A3:8 i14 A3:8 i9 A3:8 i14 A3:8
    `,
    `
      i7 A3:8 i14 A3:8 i6 A3:8 i14 A3:8 i7 A3:8 i14 A3:8 i9 A3:8 i14 A3:8 i10 A3:8 i14 A3:8 i1 A3:8 i14 A3:8 i4 A3:8 i14 A3:8 i6 A3:8 i14 A3:8
      i7 A3:8 i14 A3:8 i6 A3:8 i14 A3:8 i7 A3:8 i14 A3:8 i9 A3:8 i14 A3:8 i10 A3:16 i9 A3:16 i7 A3:16 i12 A3:16
      i10 A3:16 i9 A3:16 i10 A3:16 i6 A3:16 i7 A3:16 i6 A3:16 i7 A3:16 i4 A3:16
    `,
    `
      i6 A3:16 i12 A3:16 i10 A3:16 i7 A3:16 i6 A3:8 i1 C#4:8 i6 A3:8 i1 C#4:8 r:232 G4:8 F4:8 E4:8 F4:8 C#4:8 r:8 D4:40 C#4:32 D4:8 A4:8 B4:8 C#5:8 r:8 D5:8 C5:16
      F4:48 D#4:24 C4:8 A3:8 F3:8 r:16 D#4:8 C4:8
      D4:8 A#3:8 G3:8 D3:8 r:16 D4:8 G4:8 C4:8 D4:8 A#3:8 C4:8 A3:8 G3:8 F#3:8 E3:8
      F#3:8 r:8 F#3:8 G3:8 r:255 r:255 r:98
      F#3:16 r:16 i14 G3:16 i11 A3:16 A#3:32 i6 D#4:16 i14 B3:16
    `,
    `
      i7 G3:32 i14 C4:16 i8 A#3:16 i10 A3:32 i14 A#3:16 i11 C4:16
      i10 D4:8 i5 G4:8 i1 F4:8 D#4:8 D4:8 D#4:8 D4:8 C4:8 A#3:8 D#4:8 D4:8 C4:8 A#3:8 C4:8 A#3:8 A3:8
      A#3:8 A3:8 G3:8 F3:8 E3:16 G3:16 A3:8 B3:8 C#4:8 D4:8 E4:8 F4:8 G4:8 A4:8
      A#4:16 A4:8 G4:8 F4:8 A4:8 E4:8 A4:8 D4:8 A4:8 C#4:8 A4:8 D4:8 A4:8 E4:8 A4:8
      F4:8 A4:8 A3:8 A4:8 B3:8 A4:8 C#4:8 A4:8 D4:8 A4:8 C#4:8 A4:8 D4:8 A4:8 B3:8 A4:8
    `,
    `
      i1 C#4:16 i9 D4:16 i5 G4:16 i7 E4:16 i6 F4:16 i7 A4:16 i6 A#4:16 i5 A4:16
      i7 F3:94 r:255 r:53 i1 A#4:8 i5 G4:4
      i11 C#4:144 i9 D4:48
      i14 B3:96 r:168 i9 E3:24 i7 E3:72 i5 E3:12 i3 E3:12
      i14 E3:94 r:255 r:177 G3:16
      A3:16 r:32 A3:16 A3:16 r:32 A3:16
      i10 B3:16 r:32 i14 G3:16 G3:16 r:32 G3:16
      i10 A3:16 r:32 i14 F3:16 F3:16 r:32 F3:16
    `,
    `
      i5 E3:16 r:32 E3:16 i14 F#3:16 r:32 F#3:16
      i9 G3:96 i8 A#3:48 i7 A3:48
      A3:48 i5 A3:48 i9 F3:48 i5 G3:48
      i9 D3:252
    `,
  ],
  [
    `
      r:255 r:93 i2 D2:128 r:255 r:255 r:255 r:23 D2:72 r:72
      D2:54 r:255 r:165 D3:12 C3:12 A#2:12
      A2:12 r:48 D3:12 C3:12 A#2:12
      A2:24 r:108 D3:12 C3:12 A#2:12 A2:12 r:48 D3:12 C3:12 A#2:12 A2:12 G#2:12
      G2:24 r:72
      G3:48 r:255 r:225 G3:24 F3:24
      A#3:48 A3:8 G3:8 A3:24 E3:8 F3:8 D3:8 E3:8 C#3:8
      D3:8 B2:8 C#3:8 A2:8 A#2:8 G#2:8 A2:8 G3:8 F3:16 D3:16 A2:32
      D2:64 r:255 r:255 r:255 r:255 r:255 r:255 r:255 r:255 r:255 r:255 r:210 D3:8 C3:8 D3:8 A#2:8 D3:8 A2:8 D3:8 G2:8 D3:8 F#2:8 D3:8 G2:8 D3:8 A2:8 D3:8
    `,
    `
      i2 A#2:8 D3:8 D2:8 D3:8 E2:8 D3:8 F#2:8 D3:8 G2:8 D3:8 F#2:8 D3:8 G2:8 D3:8 A2:8 D3:8
      A#2:32 r:16 B2:16 C3:32 r:16 C#3:16
      D3:32 r:16 D3:16 E3:32 r:16 E3:16
      F3:16 A2:16 A#2:16 D3:16 G2:32 r:16 A#2:32 A2:16 G2:16 C3:16 F2:32 r:255 r:255 r:255 r:255 r:255 r:255 r:255 r:255 r:255 r:255 r:255 r:255 r:255 r:255 r:118 G3:8 F3:8 G3:8 D#3:8 G3:8 D3:8 G3:8
      C3:8 G3:8 B2:8 G3:8 C3:8 G3:8 D3:8 G3:8 D#3:8 G3:8 G2:8 G3:8 A2:8 G3:8 B2:8 G3:8
    `,
    `
      i2 C3:8 G3:8 B2:8 G3:8 C3:8 G3:8 D3:8 G3:8 D#3:16 D3:16 C3:16 B2:16
      C3:16 D3:16 D#3:16 F3:16 G3:16 B2:16 C3:16 D3:16
      D#3:16 D3:16 D#3:16 F3:16 G3:16 B2:16 C3:16 D3:16
      D#3:16 A2:16 A#2:16 C3:16 D3:16 G2:16 A2:16 A#2:16
      C3:16 D3:16 G3:16 D3:16 D#3:16 A#2:16 A2:16 C3:16
      D3:255 l D3:33 r:16 G2:16 C3:16 A2:16 D3:16 D2:16
      G2:32 r:16 G2:16 C3:48 B2:16
      C3:32 r:255 r:255 r:255 r:255 r:255 r:255 r:46 A3:8 G3:8 A3:8 F3:8 A3:8 E3:8 A3:8
    `,
    `
      i2 D3:8 A3:8 C#3:8 A3:8 D3:8 A3:8 E3:8 A3:8 F3:8 A3:8 A2:8 A3:8 B2:8 A3:8 C#3:8 A3:8
      D3:8 A3:8 C#3:8 A3:8 D3:8 A3:8 E3:8 A3:8 F3:32 r:16 F3:16
      G3:16 E3:16 A3:16 A2:16 D3:32 r:16 A2:16
      A#2:16 G2:16 C3:16 C2:16 F2:32 r:16 A2:16
      A#2:32 r:16 A#2:16 C3:32 r:16 A2:16
      D3:32 r:32 D3:32 r:32
      D3:32 r:32 D3:32 r:32
      D3:32 r:32 D3:32 r:32
      D3:32 r:32 D3:32 r:32
      D3:32 r:32 D3:32 r:40 D3:8 C3:8 D3:8 A#2:8 D3:8 A2:8 D3:8 G2:8 G3:8 F3:8 G3:8 D#3:8 G3:8 D3:8 G3:8
    `,
    `
      i2 C3:8 C3:8 A#2:8 C3:8 A2:8 C3:8 G2:8 C3:8 F2:8 F3:8 D#3:8 F3:8 D3:8 F3:8 C3:8 F3:8
      A#2:16 D#3:16 F3:16 F2:16 G2:16 C3:16 D3:16 D2:16
      G2:32 r:8 A2:8 G2:8 A2:8 F2:16 D2:16 A2:32
      D2:192 r:48 D3:16
      A2:16 F2:16 G2:16 A2:16 F2:16 D2:16 G2:16 A2:16
      A#2:94 r:255 r:65
      C#3:96 F3:72 D3:24
      G#2:96 r:12 G#3:12 B3:12 F3:12 G#3:12 D3:12 F3:12 B2:12
      D3:12 G#2:12 A2:24 E2:238 r:255 r:177 E3:16
    `,
    `
      i2 G3:16 r:32 G3:16 F3:16 r:32 F3:16
      F3:16 r:32 F3:16 E3:16 r:32 E3:16
      E3:16 r:32 E3:16 D3:16 r:32 D3:16
      C#3:16 r:32 C#3:16 C3:16 r:32 C3:16
      G2:48 A#2:48 E2:48 F2:48
      A2:96 A#2:48 G2:48
      D2:252
    `,
  ],
];

export function build() {
  const patterns = [];
  const orders = VOICES.map((list, voice) => {
    const order = list.map((text, k) => {
      patterns.push({ name: `voice ${voice + 1} part ${k + 1}`, events: events(text) });
      return { pattern: patterns.length - 1, transpose: 0 };
    });
    order.push({ stop: true });
    return order;
  });
  return { instruments: instruments(), song: { name: 'Toccata in D minor', speed: SPEED, patterns, orders } };
}
