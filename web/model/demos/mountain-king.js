// mountain-king.js - "In the Hall of the Mountain King" (Edvard Grieg, Peer Gynt Suite No. 1, Op. 46 No. 4),
// reduced from the piano score to the three SID voices.
//
// Source: the Mutopia Project piano edition (see `info.source`). The notes below are read from that
// edition's MIDI file, bar by bar, and every rhythm is kept exactly: one tick is a 96th of a whole
// note, so a bar of 4/4 is 96 ticks, an eighth note 12, a sixteenth 6, an eighth-note triplet 8 and the
// grace notes 3 each. The song speed is 1 frame per tick (125 beats per minute, a little slower than the
// 138 and 154 of the printed score: a song has one fixed speed).
//
// The reduction, voice by voice:
//   voice 1  the melody: the top note of the right hand
//   voice 2  the bass: the lowest note of the left hand
//   voice 3  the harmony: everything else, as a note, or as a chord stab that alternates between the
//            lowest chord note and the nearest chord tone above it (the instrument's arpeggio)
// Where the score has only two lines (bars 2 to 25) the third voice is silent, as the score is.
//
// Pitches are written as in the score (the printed octave, as the MIDI file sounds them). The order
// list moves them where a SID voice sounds well: the tune an octave up for the quiet opening and an
// octave down for the loud part, the bass an octave up for the opening. One bass note is written an
// octave above the score because the printed one (B0, 31 Hz) is too low to hear: the first note of
// bar 26.
//
// A bar is one text line per voice: "B-1:12" is a note (name, length in ticks), "r:12" a rest.
// "F#3+4:12" is a chord stab (the note and the note 4 semitones above, alternating), and a "g" after the
// pitch marks a grace note (three of them run up to the beat).
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import { defaultInstrument, parseNoteName } from '../project.js';

export const info = {
  id: 'mountain-king',
  title: 'In the Hall of the Mountain King',
  composer: 'Edvard Grieg (public domain), reduced for SID',
  note: 'The creeping march theme from the real score: it starts quiet and staccato, climbs in pitch and loudness through the key changes and ends in the loud finale with the final chords.',
  source: 'Mutopia Project, piece 1888 (https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1888), '
    + 'edition of The University Society, 1918, typeset in LilyPond by Coyau, licence: Public Domain (CC0-style dedication by the typesetter). '
    + 'The MIDI file of that edition was used for the notes.',
};

export const BAR_TICKS = 96;
export const BARS = 88;

const MELODY = [
  /*  1 */ 'F#4:96',
  /*  2 */ 'B-1:12 C#2:12 D-2:12 E-2:12 F#2:12 D-2:12 F#2:24',
  /*  3 */ 'F-2:12 C#2:12 F-2:24 E-2:12 C-2:12 E-2:24',
  /*  4 */ 'B-1:12 C#2:12 D-2:12 E-2:12 F#2:12 D-2:12 F#2:12 B-2:12',
  /*  5 */ 'A-2:12 F#2:12 D-2:12 F#2:12 A-2:48',
  /*  6 */ 'B-2:12 C#3:12 D-3:12 E-3:12 F#3:12 D-3:12 F#3:24',
  /*  7 */ 'F-3:12 C#3:12 F-3:24 E-3:12 C-3:12 E-3:24',
  /*  8 */ 'B-2:12 C#3:12 D-3:12 E-3:12 F#3:12 D-3:12 F#3:12 B-3:12',
  /*  9 */ 'A-3:12 F#3:12 D-3:12 F#3:12 A-3:48',
  /* 10 */ 'F#2:12 G#2:12 A#2:12 B-2:12 C#3:12 A#2:12 C#3:24',
  /* 11 */ 'D-3:12 A#2:12 D-3:24 C#3:12 A#2:12 C#3:24',
  /* 12 */ 'F#2:12 G#2:12 A#2:12 B-2:12 C#3:12 A#2:12 C#3:24',
  /* 13 */ 'D-3:12 A#2:12 D-3:24 C#3:48',
  /* 14 */ 'F#3:12 G#3:12 A#3:12 B-3:12 C#4:12 A#3:12 C#4:24',
  /* 15 */ 'D-4:12 A#3:12 D-4:24 C#4:12 A#3:12 C#4:24',
  /* 16 */ 'F#3:12 G#3:12 A#3:12 B-3:12 C#4:12 A#3:12 C#4:24',
  /* 17 */ 'D-4:12 A#3:12 D-4:24 C#4:48',
  /* 18 */ 'B-1:12 C#2:12 D-2:12 E-2:12 F#2:12 D-2:12 F#2:24',
  /* 19 */ 'F-2:12 C#2:12 F-2:24 E-2:12 C-2:12 E-2:24',
  /* 20 */ 'B-1:12 C#2:12 D-2:12 E-2:12 F#2:12 D-2:12 F#2:12 B-2:12',
  /* 21 */ 'A-2:12 F#2:12 D-2:12 F#2:12 A-2:48',
  /* 22 */ 'B-2:12 C#3:12 D-3:12 E-3:12 F#3:12 D-3:12 F#3:24',
  /* 23 */ 'F-3:12 C#3:12 F-3:24 E-3:12 C-3:12 E-3:24',
  /* 24 */ 'B-2:12 C#3:12 D-3:12 E-3:12 F#3:12 D-3:12 F#3:12 B-3:12',
  /* 25 */ 'A-3:12 F#3:12 D-3:12 F#3:12 A-3:48',
  /* 26 */ 'B-3:12 C#4:12 D-4:12 E-4:12 F#4:12 D-4:12 F#4:24',
  /* 27 */ 'F-4:12 C#4:12 F-4:24 E-4:12 C-4:12 E-4:24',
  /* 28 */ 'B-3:12 C#4:12 D-4:12 E-4:12 F#4:12 D-4:12 F#4:12 B-4:12',
  /* 29 */ 'A-4:12 F#4:12 D-4:12 F#4:12 A-4:24 D-4:24',
  /* 30 */ 'B-4:12 C#5:12 D-5:12 E-5:12 F#5:12 D-5:12 F#5:24',
  /* 31 */ 'F-5:12 C#5:12 F-5:24 E-5:12 C-5:12 E-5:24',
  /* 32 */ 'B-4:12 C#5:12 D-5:12 E-5:12 F#5:12 D-5:12 F#5:12 B-5:12',
  /* 33 */ 'A-5:12 F#5:12 D-5:12 F#5:12 A-5:24 D-5:24',
  /* 34 */ 'F#4:12 G#4:12 A#4:12 B-4:12 C#5:12 A#4:12 C#5:24',
  /* 35 */ 'D-5:12 A#4:12 D-5:24 C#5:12 A#4:12 C#5:24',
  /* 36 */ 'F#4:12 G#4:12 A#4:12 B-4:12 C#5:12 A#4:12 C#5:24',
  /* 37 */ 'D-5:12 A#4:12 D-5:24 C#5:24 A#4:24',
  /* 38 */ 'F#5:12 G#5:12 A#5:12 B-5:12 C#6:12 A#5:12 C#6:24',
  /* 39 */ 'D-6:12 A#5:12 D-6:24 C#6:12 A#5:12 C#6:24',
  /* 40 */ 'F#5:12 G#5:12 A#5:12 B-5:12 C#6:12 A#5:12 C#6:24',
  /* 41 */ 'D-6:12 A#5:12 D-6:24 C#6:24 A#5:24',
  /* 42 */ 'B-3:12 C#4:12 D-4:12 E-4:12 F#4:12 D-4:12 F#4:24',
  /* 43 */ 'F-4:12 C#4:12 F-4:24 E-4:12 C-4:12 F-4:24',
  /* 44 */ 'B-3:12 C#4:12 D-4:12 E-4:12 F#4:12 D-4:12 F#4:12 B-4:12',
  /* 45 */ 'A-4:12 F#4:12 E-4:12 F#4:12 A-4:24 E-4:24',
  /* 46 */ 'B-4:12 C#5:12 D-5:12 E-5:12 F#5:12 D-5:12 F#5:24',
  /* 47 */ 'F-5:12 C#5:12 F-5:24 E-5:12 C-5:12 E-5:24',
  /* 48 */ 'B-4:12 C#5:12 D-5:12 E-5:12 F#5:12 D-5:12 F#5:12 B-5:12',
  /* 49 */ 'F#5:12 D-5:12 F#5:12 B-5:12 B-4:48',
  /* 50 */ 'B-5:12 C#6:12 D-6:12 E-6:12 F#6:12 D-6:12 F#6:24',
  /* 51 */ 'F-6:12 C#6:12 F-6:24 E-6:12 C-6:12 E-6:24',
  /* 52 */ 'B-5:12 C#6:12 D-6:12 E-6:12 F#6:12 D-6:12 F#6:12 B-6:12',
  /* 53 */ 'A-6:12 F#6:12 D-6:12 F#6:12 A-6:48',
  /* 54 */ 'B-5:12 C#6:12 D-6:12 E-6:12 F#6:12 D-6:12 F#6:24',
  /* 55 */ 'F-6:12 C#6:12 F-6:24 E-6:12 C-6:12 E-6:24',
  /* 56 */ 'B-5:12 C#6:12 D-6:12 E-6:12 F#6:12 D-6:12 F#6:12 B-6:12',
  /* 57 */ 'A-6:12 F#6:12 D-6:12 F#6:12 A-6:48',
  /* 58 */ 'F#6:12 G#6:12 A#6:12 B-6:12 C#7:12 A#6:12 C#7:24',
  /* 59 */ 'D-7:12 A#6:12 D-7:24 C#7:12 A#6:12 C#7:24',
  /* 60 */ 'F#6:12 G-6:12 A#6:12 B-6:12 C#7:12 A#6:12 C#7:24',
  /* 61 */ 'D-7:12 A#6:12 D-7:24 C#7:48',
  /* 62 */ 'F#6:12 G#6:12 A#6:12 B-6:12 C#7:12 A#6:12 C#7:24',
  /* 63 */ 'D#7:12 A#6:12 D#7:24 C#7:12 A#6:12 C#7:24',
  /* 64 */ 'F#6:12 G-6:12 A#6:12 B-6:12 C#7:12 A#6:12 C#7:24',
  /* 65 */ 'D-7:12 A#6:12 D-7:24 C#7:48',
  /* 66 */ 'B-5:12 C#6:12 D-6:12 E-6:12 F#6:12 D-6:12 F#6:24',
  /* 67 */ 'F-6:12 C#6:12 F-6:24 E-6:12 C-6:12 E-6:24',
  /* 68 */ 'B-5:12 C#6:12 D-6:12 E-6:12 F#6:12 B-5:12 F#6:12 B-6:12',
  /* 69 */ 'A-6:12 F#6:12 D-6:12 F#6:12 A-6:48',
  /* 70 */ 'B-5:12 C#6:12 D-6:12 E-6:12 F#6:12 D-6:12 F#6:24',
  /* 71 */ 'F-6:12 C#6:12 F-6:24 E-6:12 C-6:12 E-6:24',
  /* 72 */ 'B-5:12 C#6:12 D-6:12 E-6:12 F#6:12 D-6:12 F#6:12 B-6:12',
  /* 73 */ 'F#6:12 D-6:12 F#6:12 B-6:12 B-5:48',
  /* 74 */ 'r:15 G#6g:3 A-6g:3 A#6g:3 B-6:24 r:48',
  /* 75 */ 'r:15 G#6g:3 A-6g:3 A#6g:3 B-6:24 r:48',
  /* 76 */ 'B-4:12 C#5:12 D-5:12 E-5:12 F#5:12 D-5:12 F#5:12 B-5:12',
  /* 77 */ 'A#5:12 F#5:12 A#5:12 C#6:12 B-5:48',
  /* 78 */ 'r:15 G#6g:3 A-6g:3 A#6g:3 B-6:24 r:48',
  /* 79 */ 'r:15 G#6g:3 A-6g:3 A#6g:3 B-6:24 r:48',
  /* 80 */ 'B-5:12 C#6:12 D-6:12 E-6:12 F#6:12 D-6:12 F#6:12 B-6:12',
  /* 81 */ 'A#6:12 F#6:12 A#6:12 C#7:12 B-6:48',
  /* 82 */ 'r:15 G#6g:3 A-6g:3 A#6g:3 B-6:24 r:48',
  /* 83 */ 'r:15 G#6g:3 A-6g:3 A#6g:3 B-6:24 r:48',
  /* 84 */ 'r:15 G#6g:3 A-6g:3 A#6g:3 B-6:15 G#6g:3 A-6g:3 A#6g:3 B-6:15 G#6g:3 A-6g:3 A#6g:3 B-6:15 G#6g:3 A-6g:3 A#6g:3',
  /* 85 */ 'B-6:15 G#6g:3 A-6g:3 A#6g:3 B-6:15 G#6g:3 A-6g:3 A#6g:3 B-6:15 G#6g:3 A-6g:3 A#6g:3 B-6:24',
  /* 86 */ 'r:96',
  /* 87 */ 'r:96',
  /* 88 */ 'r:15 G#6g:3 A-6g:3 A#6g:3 B-6:24 r:48',
];

const BASS = [
  /*  1 */ 'F#3:96',
  /*  2 */ 'B-0:24 F#1:24 B-0:24 F#1:24',
  /*  3 */ 'B-0:24 F#1:24 B-0:24 F#1:24',
  /*  4 */ 'B-0:24 F#1:24 B-0:24 F#1:24',
  /*  5 */ 'D-1:24 A-1:24 D-1:24 A-1:24',
  /*  6 */ 'B-0:24 F#1:24 B-0:24 F#1:24',
  /*  7 */ 'B-0:24 F#1:24 B-0:24 F#1:24',
  /*  8 */ 'B-0:24 F#1:24 B-0:24 F#1:24',
  /*  9 */ 'D-1:24 A-1:24 D-1:24 A-1:24',
  /* 10 */ 'F#1:24 C#2:24 F#1:24 C#2:24',
  /* 11 */ 'D-1:24 A#1:24 F#1:24 C#2:24',
  /* 12 */ 'F#1:24 C#2:24 F#1:24 C#2:24',
  /* 13 */ 'D-1:24 A#1:24 F#1:24 C#2:24',
  /* 14 */ 'F#1:24 C#2:24 F#1:24 C#2:24',
  /* 15 */ 'D-1:24 A#1:24 F#1:24 C#2:24',
  /* 16 */ 'F#1:24 C#2:24 F#1:24 C#2:24',
  /* 17 */ 'D-1:24 A#1:24 F#1:24 C#2:24',
  /* 18 */ 'B-0:24 F#1:24 B-0:24 F#1:24',
  /* 19 */ 'B-0:24 F#1:24 B-0:24 F#1:24',
  /* 20 */ 'B-0:24 F#1:24 B-0:24 F#1:24',
  /* 21 */ 'D-1:24 A-1:24 D-1:24 A-1:24',
  /* 22 */ 'B-0:24 F#1:24 B-0:24 F#1:24',
  /* 23 */ 'B-0:24 F#1:24 B-0:24 F#1:24',
  /* 24 */ 'B-0:24 B-1:24 A-1:24 G-1:24',
  /* 25 */ 'F#1:24 E-1:24 C#1:24 B-0:24',
  /* 26 */ 'B-1:24 F#2:6 F-2:6 F#2:12 B-1:24 F#2:6 F-2:6 F#2:12',
  /* 27 */ 'B-1:24 F#2:6 F-2:6 F#2:12 B-1:24 F#2:6 F-2:6 F#2:12',
  /* 28 */ 'B-1:24 F#2:6 F-2:6 F#2:12 B-1:24 F#2:6 F-2:6 F#2:12',
  /* 29 */ 'D-2:24 A-2:6 G#2:6 A-2:12 D-2:24 A-2:6 G#2:6 A-2:12',
  /* 30 */ 'B-1:24 F#2:6 F-2:6 F#2:12 B-1:24 F#2:6 F-2:6 F#2:12',
  /* 31 */ 'B-1:24 F#2:6 F-2:6 F#2:12 B-1:24 F#2:6 F-2:6 F#2:12',
  /* 32 */ 'B-1:24 F#2:6 F-2:6 F#2:12 B-1:24 F#2:6 F-2:6 F#2:12',
  /* 33 */ 'D-2:24 A-2:6 G#2:6 A-2:12 D-2:24 A-2:6 G#2:6 A-2:12',
  /* 34 */ 'F#2:24 C#3:6 C-3:6 C#3:12 F#2:24 C#3:6 C-3:6 C#3:12',
  /* 35 */ 'D-2:24 D-3:6 C#3:6 D-3:12 F#2:24 C#3:6 C-3:6 C#3:12',
  /* 36 */ 'F#2:24 C#3:6 C-3:6 C#3:12 F#2:24 C#3:6 C-3:6 C#3:12',
  /* 37 */ 'D-2:24 D-3:6 C#3:6 D-3:12 F#2:24 C#3:6 C-3:6 C#3:12',
  /* 38 */ 'F#2:24 C#3:6 C-3:6 C#3:12 F#2:24 C#3:6 C-3:6 C#3:12',
  /* 39 */ 'D-2:24 D-3:6 C#3:6 D-3:12 F#2:24 C#3:6 C-3:6 C#3:12',
  /* 40 */ 'F#2:24 C#3:6 C-3:6 C#3:12 F#2:24 C#3:6 C-3:6 C#3:12',
  /* 41 */ 'D-2:24 D-3:6 C#3:6 D-3:12 F#2:24 C#3:6 C-3:6 C#3:12',
  /* 42 */ 'B-1:8 F-2:8 F#2:8 D-3:8 F-2:8 F#2:8 B-1:8 F-2:8 F#2:8 D-3:8 F-2:8 F#2:8',
  /* 43 */ 'B-1:8 F-2:8 F#2:8 C#3:8 F-2:8 F#2:8 B-1:8 F-2:8 F#2:8 C-3:8 F-2:8 F#2:8',
  /* 44 */ 'B-1:8 F-2:8 F#2:8 D-3:8 F-2:8 F#2:8 B-1:8 F-2:8 F#2:8 D-3:8 F-2:8 F#2:8',
  /* 45 */ 'D-2:8 G#2:8 A-2:8 F#3:8 G#2:8 A-2:8 D-2:8 G#2:8 A-2:8 F#3:8 G#2:8 A-2:8',
  /* 46 */ 'B-1:8 F-2:8 F#2:8 D-3:8 F-2:8 F#2:8 B-1:8 F-2:8 F#2:8 D-3:8 F-2:8 F#2:8',
  /* 47 */ 'B-1:8 F-2:8 F#2:8 D-3:8 F-2:8 F#2:8 B-1:8 F-2:8 F#2:8 D-3:8 F-2:8 F#2:8',
  /* 48 */ 'B-1:8 F-2:8 F#2:8 B-2:24 A-2:24 G-2:24',
  /* 49 */ 'F#2:24 E-2:24 D-2:24 C#2:24',
  /* 50 */ 'B-1:12 A-2:12 G-2:12 F#2:12 B-1:12 A-2:12 G-2:12 F#2:12',
  /* 51 */ 'B-1:12 A-2:12 G-2:12 F#2:12 B-1:12 A-2:12 G-2:12 F#2:12',
  /* 52 */ 'B-1:12 A-2:12 G-2:12 F#2:12 B-1:12 A-2:12 G-2:12 F#2:12',
  /* 53 */ 'D-2:12 C#3:12 B-2:12 A-2:12 D-2:12 C#3:12 B-2:12 A-2:12',
  /* 54 */ 'B-1:12 A-2:12 G-2:12 F#2:12 B-1:12 A-2:12 G-2:12 F#2:12',
  /* 55 */ 'B-1:12 A-2:12 G-2:12 F#2:12 B-1:12 A-2:12 G-2:12 F#2:12',
  /* 56 */ 'B-1:12 A-2:12 G-2:12 F#2:12 B-1:12 A-2:12 G-2:12 F#2:12',
  /* 57 */ 'B-1:12 A-2:12 G-2:12 F#2:12 B-1:12 A-2:12 G-2:12 F#2:12',
  /* 58 */ 'F#2:12 E-3:12 D-3:12 C#3:12 F#2:12 E-3:12 D-3:12 C#3:12',
  /* 59 */ 'D-2:12 C#3:12 D-3:12 E-3:12 F#2:12 E-3:12 D-3:12 C#3:12',
  /* 60 */ 'F#2:12 E-3:12 D-3:12 C#3:12 F#2:12 E-3:12 D-3:12 C#3:12',
  /* 61 */ 'D-2:12 C#3:12 D-3:12 E-3:12 F#2:12 E-3:12 D-3:12 C#3:12',
  /* 62 */ 'F#2:12 F-3:12 D#3:12 C#3:12 F#2:12 F-3:12 D#3:12 C#3:12',
  /* 63 */ 'D#2:12 C#3:12 D#3:12 F-3:12 F#2:12 F-3:12 D#3:12 C#3:12',
  /* 64 */ 'F#2:12 F-3:12 D#3:12 C#3:12 F#2:12 F-3:12 D#3:12 C#3:12',
  /* 65 */ 'D#2:12 C#3:12 D#3:12 F-3:12 F#2:12 F-3:12 D#3:12 C#3:12',
  /* 66 */ 'B-1:12 A-2:12 G-2:12 F#2:12 B-1:12 A-2:12 G-2:12 F#2:12',
  /* 67 */ 'B-1:12 A-2:12 G-2:12 F#2:12 B-1:12 A-2:12 G-2:12 F#2:12',
  /* 68 */ 'B-1:12 A-2:12 G-2:12 F#2:12 B-1:12 A-2:12 G-2:12 F#2:12',
  /* 69 */ 'D-2:12 C#3:12 A-2:12 G-2:12 D-2:12 C#3:12 A-2:12 G-2:12',
  /* 70 */ 'B-1:12 A-2:12 G-2:12 F#2:12 B-1:12 A-2:12 G-2:12 F#2:12',
  /* 71 */ 'B-1:12 A-2:12 G-2:12 F#2:12 B-1:12 A-2:12 G-2:12 F#2:12',
  /* 72 */ 'B-1:12 A-2:12 G-2:12 F#2:12 B-1:12 A-2:12 G-2:12 F#2:12',
  /* 73 */ 'B-1:12 A-2:12 G-2:12 F#2:12 B-1:12 A-2:12 G-2:12 F#2:12',
  /* 74 */ 'B-1:24 D-3:24 r:48',
  /* 75 */ 'B-1:24 D-3:24 r:48',
  /* 76 */ 'G-2:24 D-3:24 F#2:24 D-3:24',
  /* 77 */ 'F#1:24 C#3:24 B-1:24 D-3:24',
  /* 78 */ 'B-1:24 D-3:24 r:48',
  /* 79 */ 'B-1:24 D-3:24 r:48',
  /* 80 */ 'G-2:24 D-3:24 F#2:24 D-3:24',
  /* 81 */ 'F#1:24 C#3:24 B-1:24 D-3:24',
  /* 82 */ 'B-1:24 D-3:24 r:48',
  /* 83 */ 'B-1:24 D-3:24 r:48',
  /* 84 */ 'B-1:24 D-3:24 D-3:24 D-3:24',
  /* 85 */ 'D-3:24 D-3:24 D-3:24 D-3:24',
  /* 86 */ 'r:48 B-1:6 B-2:6 B-1:6 B-2:6 B-1:6 B-2:6 B-1:6 B-2:6',
  /* 87 */ 'B-1:6 B-2:6 B-1:6 B-2:6 B-1:6 B-2:6 B-1:6 B-2:6 B-1:6 B-2:6 B-1:6 B-2:6 B-1:6 B-2:6 B-1:6 B-2:6',
  /* 88 */ 'B-0:24 B-2:24 r:48',
];

const HARMONY = [
  /*  1 */ 'r:96',
  /*  2 */ 'r:96',
  /*  3 */ 'r:96',
  /*  4 */ 'r:96',
  /*  5 */ 'r:96',
  /*  6 */ 'r:96',
  /*  7 */ 'r:96',
  /*  8 */ 'r:96',
  /*  9 */ 'r:48 A-2:48',
  /* 10 */ 'r:96',
  /* 11 */ 'r:96',
  /* 12 */ 'r:96',
  /* 13 */ 'r:96',
  /* 14 */ 'r:96',
  /* 15 */ 'r:96',
  /* 16 */ 'r:96',
  /* 17 */ 'r:48 C#3:48',
  /* 18 */ 'r:96',
  /* 19 */ 'r:96',
  /* 20 */ 'r:96',
  /* 21 */ 'r:96',
  /* 22 */ 'r:96',
  /* 23 */ 'r:96',
  /* 24 */ 'r:96',
  /* 25 */ 'r:48 A-2:48',
  /* 26 */ 'r:24 D-3+4:12 r:36 D-3+4:24',
  /* 27 */ 'r:24 C#3+4:24 r:24 C-3+4:24',
  /* 28 */ 'r:24 D-3+4:12 r:36 D-3:12 r:12',
  /* 29 */ 'r:24 F#3+3:12 r:36 F#3+3:24',
  /* 30 */ 'r:24 D-3+4:24 r:24 D-3+4:24',
  /* 31 */ 'r:24 C#3+5:24 r:24 D-3+4:24',
  /* 32 */ 'r:24 D-3+4:24 r:24 D-3:12 r:12',
  /* 33 */ 'r:24 F#3+3:24 r:24 F#3+3:24',
  /* 34 */ 'r:24 A#3+8:24 r:24 A#3+8:24',
  /* 35 */ 'r:24 A#3+8:24 r:24 A#3+8:24',
  /* 36 */ 'r:24 A#3+8:24 r:24 A#3+8:24',
  /* 37 */ 'r:24 A#3+8:24 r:24 A#3+8:24',
  /* 38 */ 'r:24 A#3+8:12 r:36 A#3+8:24',
  /* 39 */ 'r:24 A#3+8:24 r:24 A#3+8:24',
  /* 40 */ 'r:24 A#3+8:12 r:36 A#3+8:24',
  /* 41 */ 'r:24 A#3+8:24 r:24 A#3+8:24',
  /* 42 */ 'r:24 F#3:12 r:36 F#3:24',
  /* 43 */ 'r:24 F#3:24 r:24 F#3:24',
  /* 44 */ 'r:24 F#3:12 r:36 B-3:12 r:12',
  /* 45 */ 'r:24 A-3:12 r:36 A-3:24',
  /* 46 */ 'r:24 F#4:24 r:24 F#4:24',
  /* 47 */ 'r:24 F#4:24 r:24 F#4:24',
  /* 48 */ 'r:48 B-2:24 B-2+3:24',
  /* 49 */ 'B-2:24 B-2+3:24 B-2:24 B-2:24',
  /* 50 */ 'r:48 B-5:48',
  /* 51 */ 'B-5:48 B-5:48',
  /* 52 */ 'r:48 B-5:48',
  /* 53 */ 'A-5+5:48 A-5+5:48',
  /* 54 */ 'r:48 B-5:48',
  /* 55 */ 'B-5:48 B-5:48',
  /* 56 */ 'r:48 B-5:48',
  /* 57 */ 'A-5+5:48 A-5+5:48',
  /* 58 */ 'r:48 C#6+5:24 C#6+5:24',
  /* 59 */ 'D-6+4:12 r:12 D-6+4:24 C#6+5:12 r:12 C#6+5:24',
  /* 60 */ 'r:12 F#6:12 F#6:12 F#6:12 C#6+5:12 C#6+5:12 C#6+5:24',
  /* 61 */ 'D-6+4:12 D-6+4:12 D-6+4:24 C#6+5:48',
  /* 62 */ 'r:48 C#6+5:24 C#6+5:24',
  /* 63 */ 'D#6+3:12 r:12 D#6+3:24 C#6+5:12 r:12 C#6+5:24',
  /* 64 */ 'r:12 F#6:12 F#6:12 F#6:12 C#6+5:12 C#6+5:12 C#6+5:24',
  /* 65 */ 'D-6+4:12 D-6+4:12 D-6+4:24 C#6+5:48',
  /* 66 */ 'r:48 B-5:48',
  /* 67 */ 'B-5:48 B-5:48',
  /* 68 */ 'r:48 B-5:24 r:24',
  /* 69 */ 'A-5+5:48 A-5+5:48',
  /* 70 */ 'r:12 B-5:12 B-5:12 B-5:12 B-5:12 B-5:12 B-5+3:24',
  /* 71 */ 'B-5:12 B-5:12 B-5:24 B-5:12 B-5:12 B-5:24',
  /* 72 */ 'r:12 B-5:12 B-5:12 B-5:12 B-5:12 B-5:12 B-5:12 B-5:12',
  /* 73 */ 'B-5:12 B-5:12 B-5:12 B-5:12 r:48',
  /* 74 */ 'r:24 F-3+3:24 r:48',
  /* 75 */ 'r:24 F-3+3:24 r:48',
  /* 76 */ 'r:24 G-3+4:24 r:24 F#3+5:24',
  /* 77 */ 'r:24 F#3+4:24 r:24 F#3+5:24',
  /* 78 */ 'r:24 F-3+3:24 r:48',
  /* 79 */ 'r:24 F-3+3:24 r:48',
  /* 80 */ 'r:24 G-3+4:24 r:24 F#3+5:24',
  /* 81 */ 'r:24 F#3+4:24 r:24 F#3+5:24',
  /* 82 */ 'r:24 F-3+3:24 r:48',
  /* 83 */ 'r:24 F-3+3:24 r:48',
  /* 84 */ 'r:24 F-3+3:24 F-3+3:24 F-3+3:24',
  /* 85 */ 'F-3+3:24 F-3+3:24 F-3+3:24 F-3+3:24',
  /* 86 */ 'r:96',
  /* 87 */ 'r:96',
  /* 88 */ 'r:24 D-3+4:24 r:48',
];
// ---------------------------------------------------------------- order list helpers

// [first bar, value]: the value holds from that bar on, until the next entry.
const from = (table, bar) => table.reduce((value, [first, v]) => (bar >= first ? v : value), table[0][1]);

// The transpose of each voice's order entries, in semitones.
export const TRANSPOSE = [
  [[1, 0], [2, 12], [26, 0], [50, -12]],            // melody
  [[1, 0], [2, 12], [26, 0], [88, 12]],             // bass
  [[1, 0], [2, 12], [26, 0], [50, -12], [74, 0]],   // harmony
];

// How loud each bar is, 1 to 15 (the sustain level of the instruments): quiet and creeping at the
// start, one step up for every few bars, and the big build from the dark chords to the final chord.
const LEVEL = [
  [1, 5], [2, 3], [10, 4], [14, 5], [18, 3], [22, 4], [26, 5], [30, 6], [34, 7], [38, 9],
  [42, 10], [46, 12], [50, 14], [66, 15], [74, 13], [76, 9], [78, 13], [80, 10], [82, 13],
  [84, 7], [85, 9], [86, 9], [87, 12], [88, 15],
];
const MELODY_WAVE = [[1, 'tri'], [26, 'pulse']];
const BASS_WAVE = [[1, 'tri'], [26, 'pulse']];

// ---------------------------------------------------------------- instruments

// Instruments are made when a bar asks for them: the same description gives the same number.
function instrumentSet() {
  const list = [];
  const index = new Map();
  const get = (name, fields) => {
    if (!index.has(name)) {
      index.set(name, list.length);
      list.push({ ...defaultInstrument(), name, release: 2, ...fields });
    }
    return index.get(name);
  };
  return { list, get };
}

// What an instrument is made of, by role. `level` is the sustain, 0 to 15: a note jumps to full
// volume, falls in a few frames to this level and stays there. A low level is a quiet note.
function describe(set, role, level, wave, arp) {
  const sr = level << 4;
  // quiet notes fall to their level in 24 ms, loud ones in about 70 ms: the louder, the more marcato
  const ad = level <= 5 ? 0x01 : 0x03;
  if (role === 'melody') {
    // vibrato only after 20 frames, so only the long notes (half and whole notes) get it
    const vib = { vibDelay: 20, vibDepth: 5, vibSpeed: 4 };
    if (wave === 'tri') return set.get(`Lead triangle ${level}`, { wave: 0x10, ad, sr, ...vib });
    return set.get(`Lead pulse ${level}`, { wave: 0x40, ad, sr, pw: 0x0800, pwStep: 6, pwMin: 0x30, pwMax: 0xC0, ...vib });
  }
  if (role === 'grace') {
    // 3 ticks long: release 1 leaves two frames of sound
    return set.get(`Grace ${level}`, { wave: 0x40, ad: 0x00, sr, pw: 0x0800, release: 1 });
  }
  if (role === 'bass') {
    if (wave === 'tri') return set.get(`Bass triangle ${level}`, { wave: 0x10, ad: 0x03, sr });
    return set.get(`Bass pulse ${level}`, { wave: 0x40, ad: 0x04, sr, pw: 0x0600, pwStep: 5, pwMin: 0x20, pwMax: 0xA0 });
  }
  // a chord stab: the pulse note, and the same note plus `arp` semitones on every other frame
  return set.get(arp ? `Stab +${arp} ${level}` : `Stab ${level}`, { wave: 0x40, ad, sr, pw: 0x0500, pwStep: 4, pwMin: 0x20, pwMax: 0xE0, arp });
}

// ---------------------------------------------------------------- reading the bars

const TOKEN = /^([A-G][#-]\d)(?:\+(\d+))?(g?):(\d+)$/;

// "B-1:12 r:12" -> [{ pitch, arp, grace, length }] with pitch null for a rest
export function parseBar(text) {
  return text.split(' ').map((word) => {
    if (/^r:\d+$/.test(word)) return { pitch: null, length: Number(word.slice(2)) };
    const m = TOKEN.exec(word);
    if (!m) throw new Error(`bad token "${word}"`);
    return { pitch: parseNoteName(m[1]), arp: Number(m[2] || 0), grace: m[3] === 'g', length: Number(m[4]) };
  });
}

export function build() {
  const set = instrumentSet();
  const patterns = [];
  const patternIndex = new Map();
  const orders = [[], [], []];

  const ROLE = ['melody', 'bass', 'harmony'];
  [MELODY, BASS, HARMONY].forEach((score, voice) => {
    score.forEach((text, i) => {
      const bar = i + 1;
      const level = from(LEVEL, bar);
      const events = [];
      let current = -1;
      for (const note of parseBar(text)) {
        if (note.pitch === null) { events.push({ type: 'rest', length: note.length }); continue; }
        let instrument;
        if (voice === 0) instrument = note.grace ? describe(set, 'grace', level, 'pulse') : describe(set, 'melody', Math.min(15, level + (from(MELODY_WAVE, bar) === 'tri' ? 1 : 0)), from(MELODY_WAVE, bar));
        else if (voice === 1) instrument = describe(set, 'bass', Math.max(1, level - (from(BASS_WAVE, bar) === 'tri' ? 2 : 3)), from(BASS_WAVE, bar));
        else instrument = describe(set, 'harmony', Math.max(2, level - 3), 'pulse', note.arp);
        if (instrument !== current) { events.push({ type: 'inst', instrument }); current = instrument; }
        events.push({ type: 'note', pitch: note.pitch, length: note.length });
      }
      const key = JSON.stringify(events);
      if (!patternIndex.has(key)) {
        patternIndex.set(key, patterns.length);
        patterns.push({ name: `${ROLE[voice]} bar ${bar}`, events });
      }
      orders[voice].push({ pattern: patternIndex.get(key), transpose: from(TRANSPOSE[voice], bar) });
    });
    orders[voice].push({ loop: 0 });
  });

  return {
    instruments: set.list,
    song: { name: 'Mountain King', speed: 1, patterns, orders },
  };
}
