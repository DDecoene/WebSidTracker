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
// Time, in two steps. First the notes below are written in *score ticks*: the length of the
// score, scaled by one fixed number in each section. The lengths in the score are in 1/1536 of
// a bar (a thirty-second note is 48 of them):
//   bars 1-3      Adagio            12 per score tick  (a thirty-second note is 4)
//   bars 4-27     Prestissimo       16 per score tick  (a triplet sixteenth is 4)
//   bars 28-129   chords, fugue,
//                 recitative        12 per score tick  (a sixteenth note is 8)
//   bars 130-132  Adagissimo         8 per score tick
//   bars 133-140  Presto, Adagio    12 per score tick
//   bars 141-143  Molto adagio       8 per score tick
// The fermatas are held a little longer, as extra score ticks: the three As of the opening and
// the rests after the first two phrases, the pauses in bars 5 and 7, bar 12, the chords of bars
// 127 and 133, and the last chord. The mordent on the three As of the opening is written out
// (A G A, joined with legato markers so that it is one organ note that changes pitch). The ends
// of the opening phrases (the Ds, and the D chord of bar 3) and the As before the pauses of bars
// 5 and 7 ring on into the rest, the way an organ does in a church; the score has short notes and
// long rests there.
// The two sixty-fourth notes of bar 19 (1.5 score ticks each) get 1 and 2, joined with a legato
// marker.
//
// Then TEMPO (below) turns score ticks into played ticks: the speed is 1, so a played tick is
// one frame (20 ms). That is where the playing tempo lives: a slow, free Adagio, the runs a
// little slower than the score ticks, a broader fugue, ritardandos at the ends of the big
// sections. Every voice goes through the same TEMPO and every start and end is rounded to the
// nearest whole tick, so the voices stay together and a run keeps an even pulse where the
// factor makes its note value a whole number of ticks.
//
// Notes are written as "A5:1" = note A5, 1 score tick long (a fraction is allowed: TEMPO rounds
// it); "r:8" = a rest of 8 score ticks; "i2" = switch to instrument 2; "l" = legato marker.
// Octaves follow noteName(): A4 = 440 Hz. One bar per line.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import { defaultInstrument, parseNoteName } from '../project.js';

export const info = {
  id: 'toccata',
  title: 'Toccata in D minor',
  composer: 'J. S. Bach (attributed), arranged for SID',
  note: 'The whole organ piece, bar for bar: the famous opening, the runs and chords, the fugue and the closing recitative, with the fermatas held. Two sweeping pulse organ voices with a late vibrato, soft arpeggio chords, a pedal that flutters with its octave.',
  source: 'Score: Toccata and Fugue in D Minor, BWV 565, from the Bach-Gesellschaft Ausgabe (1867), typeset for the Mutopia Project (piece 1780, www.mutopiaproject.org), public domain.',
};

const SPEED = 1;

// Instrument numbers: 0 and 1 are the two manual voices, 2 the pedal, 3 and up the arpeggio
// instruments (instrument 3 + k flutters between the note and the note + ARP_OFFSETS[k]).
const LEAD = 0, MID = 1, PEDAL = 2, ARP_FIRST = 3;
const ARP_OFFSETS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
// The chords whose two notes get the octave of the lower note as a third note (arp2 = 12): the
// thirds, fourths, fifths and sixths. The seconds, the tritone and the sevenths stay two notes,
// and so does the octave itself.
const CHORD_WITH_OCTAVE = new Set([3, 4, 5, 7, 8, 9]);

function instruments() {
  const base = defaultInstrument();
  // Every instrument has decay 0: then the player needs only one frame to close a note
  // (release 1), and a run of 4- and 5-frame notes stays legato. (With a decay above 0 the
  // player takes two frames, and half of every short note would be silence.)
  // The sound is in what moves while a note plays: the pulse width sweeps wide (the fat sound),
  // a held note gets a gentle vibrato after half a second, the pedal flutters with its octave.
  const pulse = (name, fields) => ({ ...base, name, wave: 0x40, ad: 0x10, sr: 0xF0, release: 1, ...fields });
  const list = [];
  // Lead: the width sweeps between 19 and 69 percent, one way in about 1.3 seconds.
  list[LEAD] = pulse('Organ lead', {
    pw: 0x0400, pwStep: 32, pwMin: 0x30, pwMax: 0xB0, vibDelay: 25, vibDepth: 3, vibSpeed: 4,
  });
  // Second voice: the other way round and at another rate, with a vibrato of another speed, so
  // that the octaves of the opening float against the lead instead of adding up to one wave.
  list[MID] = pulse('Organ second voice', {
    pw: 0x0A00, pwStep: -23, pwMin: 0x28, pwMax: 0xC0, vibDelay: 30, vibDepth: 2, vibSpeed: 6,
  });
  // Pedal: a narrow pulse that sweeps slowly, fluttering with its octave above (arp 12): the
  // sound of a 16-foot and an 8-foot stop together, and the classic C64 bass.
  list[PEDAL] = pulse('Pedal', { pw: 0x0300, pwStep: 10, pwMin: 0x18, pwMax: 0x70, arp: 12 });
  // Chords: softer than the lines (sustain 10 of 15), so that the shimmer stays behind the tune.
  ARP_OFFSETS.forEach((semitones, k) => {
    list[ARP_FIRST + k] = pulse(`Chord +${semitones}`, {
      sr: 0xA0, pw: 0x0600, pwStep: -17, pwMin: 0x30, pwMax: 0xA0,
      arp: semitones, arp2: CHORD_WITH_OCTAVE.has(semitones) ? 12 : 0,
    });
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
      i0 A5:1.6 l G5:1.6 l A5:36.8 r:4 G5:2 F5:2 E5:2 D5:2 C#5:4 D5:24 r:38 A4:1.6 l G4:1.6 l A4:36.8 r:4 E4:4 F4:4 C#4:4 D4:24 r:38
      A3:1.6 l G3:1.6 l A3:36.8 r:4 G3:2 F3:2 E3:2 D3:2 C#3:4 D3:24 r:64 E4:64 D4:56 r:32 C#4:8
      D4:4 E4:4 C#4:4 D4:4 E4:4 C#4:4 D4:4 E4:4 C#4:4 D4:6 E4:6 F4:4 G4:4 E4:4 F4:4 G4:4 E4:4 F4:4 G4:4 E4:4 F4:6 G4:6
      A4:4 A#4:4 G4:4 A4:4 A#4:4 G4:4 A4:4 A#4:4 G4:4 A4:24 r:80 C#5:6
    `,
    `
      i0 D5:4 E5:4 C#5:4 D5:4 E5:4 C#5:4 D5:4 E5:4 C#5:4 D5:6 E5:6 F5:4 G5:4 E5:4 F5:4 G5:4 E5:4 F5:4 G5:4 E5:4 F5:6 G5:6
      A5:4 A#5:4 G5:4 A5:4 A#5:4 G5:4 A5:4 A#5:4 G5:4 A5:24 r:80 A5:6
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
      i1 A4:1.6 l G4:1.6 l A4:36.8 r:4 G4:2 F4:2 E4:2 D4:2 C#4:4 D4:24 r:38 A3:1.6 l G3:1.6 l A3:36.8 r:4 E3:4 F3:4 C#3:4 D3:24 r:38
      A2:1.6 l G2:1.6 l A2:36.8 r:4 G2:2 F2:2 E2:2 D2:2 C#2:4 D2:24 r:64 i14 C#3:64 i9 D3:8 D3:8 D3:40 r:32 i1 C#3:8
      D3:4 E3:4 C#3:4 D3:4 E3:4 C#3:4 D3:4 E3:4 C#3:4 D3:6 E3:6 F3:4 G3:4 E3:4 F3:4 G3:4 E3:4 F3:4 G3:4 E3:4 F3:6 G3:6
      A3:4 A#3:4 G3:4 A3:4 A#3:4 G3:4 A3:4 A#3:4 G3:4 A3:24 r:80 C#4:6
    `,
    `
      i1 D4:4 E4:4 C#4:4 D4:4 E4:4 C#4:4 D4:4 E4:4 C#4:4 D4:6 E4:6 F4:4 G4:4 E4:4 F4:4 G4:4 E4:4 F4:4 G4:4 E4:4 F4:6 G4:6
      A4:4 A#4:4 G4:4 A4:4 A#4:4 G4:4 A4:4 A#4:4 G4:4 A4:24 r:80 A4:6
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

// Where bar n starts, in score ticks. Each section has its own bar length, and the bars with a
// fermata are longer by the extra ticks given to it.
const SECTIONS = [[1, 128], [4, 96], [28, 128], [130, 192], [133, 128], [141, 192]];   // [first bar, score ticks per bar]
const FERMATA_EXTRA = { 1: 108, 2: 48, 5: 50, 7: 50, 12: 30, 127: 30, 133: 30, 143: 60 };
export function barStart(n) {
  let tick = 0;
  for (let bar = 1; bar < n; bar++) {
    tick += SECTIONS.filter(([first]) => first <= bar).at(-1)[1] + (FERMATA_EXTRA[bar] ?? 0);
  }
  return tick;
}

// The playing tempo: how many played ticks (frames) one score tick lasts, from a point in the
// score on. { at, factor } holds the factor from that point; { at, factor, ramp: true } moves it
// evenly from the factor before to this one, arriving at this point (a ritardando when it grows).
// The factors are picked so that the main note value of a passage is a whole number of ticks.
const TEMPO = [
  { at: barStart(1), factor: 2.5 },                     // Adagio: a thirty-second note 10 ticks, the held As 2 seconds
  { at: barStart(4), factor: 1.25 },                    // Prestissimo: a triplet sixteenth 5 ticks (100 ms)
  { at: barStart(11), factor: 4 / 3 },                  // the thirty-second runs: 4 ticks each, a sixteenth 8
  { at: barStart(22), factor: 1.25 },                   // triplet sixteenths again: 5 ticks
  { at: barStart(29), factor: 1.25 },
  { at: barStart(30), factor: 1.75, ramp: true },       // a ritardando into the fugue
  { at: barStart(30), factor: 1.25 },                   // the fugue: a sixteenth 10 ticks, a quarter 75 a minute
  { at: barStart(126), factor: 1.25 },
  { at: barStart(127), factor: 1.75, ramp: true },      // a ritardando into the big chord of bar 127
  { at: barStart(127) + 94, factor: 1 },                // Recitativo: the thirty-second runs free and fast, 4 ticks
  { at: barStart(130), factor: 1.5 },                   // Adagissimo
  { at: barStart(133), factor: 1.75 },                  // the chord of bar 133
  { at: barStart(133) + 94, factor: 1 },                // Presto
  { at: barStart(136) + 96, factor: 1.25 },             // Adagio: a sixteenth 20 ticks
  { at: barStart(140), factor: 1.25 },
  { at: barStart(141), factor: 1.5, ramp: true },
  { at: barStart(141), factor: 1.5 },                   // Molto adagio
  { at: barStart(143), factor: 1.5 },
  { at: barStart(144), factor: 2, ramp: true },         // the last chord broadens
];

// The played tick of a score position (not rounded).
export function warp(position) {
  let played = 0;
  for (let k = 0; k < TEMPO.length; k++) {
    const from = TEMPO[k].at;
    if (position <= from) break;
    const next = TEMPO[k + 1];
    const to = Math.min(position, next ? next.at : Infinity);
    if (next && next.ramp) {
      const slope = (next.factor - TEMPO[k].factor) / (next.at - from);
      const end = TEMPO[k].factor + slope * (to - from);
      played += (TEMPO[k].factor + end) / 2 * (to - from);
    } else {
      played += TEMPO[k].factor * (to - from);
    }
  }
  return played;
}

// The events of one pattern with their lengths in played ticks. `at` is the score position the
// pattern starts at; returns the events and the score position after them. A note or rest longer
// than the pattern format allows (255) is split: a note into tied notes with legato markers.
function played(list, at) {
  const merged = [];   // rests in a row become one rest first, so that splitting them again costs fewer events
  for (const e of list) {
    if (e.type === 'rest' && merged.at(-1)?.type === 'rest') merged.at(-1).length += e.length;
    else merged.push({ ...e });
  }
  const out = [];
  for (const e of merged) {
    if (e.type !== 'note' && e.type !== 'rest') { out.push(e); continue; }
    const start = Math.round(warp(at));
    at += e.length;
    let length = Math.round(warp(at)) - start;
    if (length < 1) throw new Error(`toccata: a ${e.type} at score tick ${at - e.length} is shorter than one tick`);
    while (length > 255) {
      out.push({ ...e, length: 255 });
      if (e.type === 'note') out.push({ type: 'legato' });
      length -= 255;
    }
    out.push({ ...e, length });
  }
  return { events: out, at };
}

export function build() {
  const patterns = [];
  const orders = VOICES.map((list, voice) => {
    let at = 0;
    const order = list.map((text, k) => {
      const part = played(events(text), at);
      at = part.at;
      patterns.push({ name: `voice ${voice + 1} part ${k + 1}`, events: part.events });
      return { pattern: patterns.length - 1, transpose: 0 };
    });
    order.push({ stop: true });
    return order;
  });
  return { instruments: instruments(), song: { name: 'Toccata in D minor', speed: SPEED, patterns, orders } };
}
