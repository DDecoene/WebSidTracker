// Checks the Für Elise demo against the notes of the score it was made from (see info.source):
// the project is valid and fits, it survives the byte format, the notes of every voice are the notes
// of the source in the same order and at the same tick, and the real player plays them on the right frame.
//
// The expected values below come from the machine-readable files of the source edition (the MIDI file
// and the LilyPond text of the same piece agree on every pitch), not from this module. Times are in
// ticks: a sixteenth note is 6 ticks, a bar of 3/8 is 36.
//
// Run: node --test web/model/demos/fur-elise.test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { Cpu6502 } from '../../cpu/cpu6502.js';
import { info, build, events, SPEED, BAR, DYADS } from './fur-elise.js';
import { LIMITS, lint, noteName, songSizeInfo, validate } from '../project.js';
import { INSTRUMENT_TABLES, parseSong, serialiseInstruments, serialiseSong } from '../serialise.js';

const project = build();
const { song } = project;
const name = (pitch) => noteName(pitch).replace('-', '');

// What a voice plays in one pass: [{ start, length, pitch, instrument }] in ticks, the loop entry ends it.
function expand(voice) {
  const notes = [];
  let tick = 0;
  for (const entry of song.orders[voice]) {
    if (entry.stop || entry.loop !== undefined) break;
    let instrument = 0;
    for (const ev of song.patterns[entry.pattern].events) {
      if (ev.type === 'inst') instrument = ev.instrument;
      if (ev.type === 'note') notes.push({ start: tick, length: ev.length, pitch: ev.pitch + entry.transpose, instrument });
      if (ev.type === 'note' || ev.type === 'rest') tick += ev.length;
    }
  }
  return { notes, ticks: tick };
}
const voices = [expand(0), expand(1), expand(2)];
const patternTicks = (n) => song.patterns[n].events.reduce((sum, ev) => sum + (ev.length || 0), 0);
const sectionTicks = (voice) => song.orders[voice].filter((e) => e.pattern !== undefined).map((e) => patternTicks(e.pattern));

// "tick:name:length" of every note whose start lies in [from, to)
const listing = (voice, from, to) => voices[voice].notes.filter((n) => n.start >= from && n.start < to)
  .map((n) => `${n.start}:${name(n.pitch)}:${n.length}`).join(' ');

// A note string with the dyad offset of its instrument appended: "A2+3" (the pulse flips between A2 and C3).
const dyad = (n) => { const arp = project.instruments[n.instrument].arp; return `${name(n.pitch)}${arp ? `+${arp}` : ''}`; };
const digest = (voice) => createHash('sha256')
  .update(voices[voice].notes.map((n) => `${n.start}:${dyad(n)}:${n.length};`).join('')).digest('hex').slice(0, 16);

// ---- expected, from the source: first phrases, and a digest of every note of every voice
const LEAD_START = '0:E5:6 6:D#5:6 12:E5:6 18:D#5:6 24:E5:6 30:B4:6 36:D5:6 42:C5:6 48:A4:12 66:C4:6 72:E4:6 78:A4:6 84:B4:12 102:E4:6 108:G#4:6 114:B4:6';
const BASS_START = '48:A2:6 54:E3:6 60:A3:6 84:E2:6 90:E3:6 96:G#3:6';
// the second section (F major, C major) starts after the theme, its ending 1 and 2, and the repeat: tick 588
const LEAD_SECOND = '588:E5:18 606:G4:6 612:F5:6 618:E5:6 624:D5:18 642:F4:6 648:E5:6 654:D5:6';
const BASS_SECOND = '588:C3:6 594:G3:6 600:C4:6 624:G2:6 630:G3:6 636:B3:6';
// the minor-key section: the chord, the two grace notes (2 ticks each, taken from the chord) and the dotted C5
const LEAD_MINOR = '1578:C5:6 1584:C5:6 1590:C5:2 1592:F4:2 1594:A4:2 1596:C5:24 1620:F5:9 1629:E5:3';
const DIGESTS = ['0ca76349c8002564', '869428ae4e08c9b3', '0e54c83c199c0fee'];
const NOTE_COUNTS = [578, 352, 130];
// score, with the repeats written out: theme (12 + 252), ending 1 (24), theme, ending 2 (36),
// second section (468), ending 1 (36), second section, ending 2 (36), then the rest in 40 pieces
const FIRST_SECTIONS = [12, 252, 24, 12, 252, 36, 468, 36, 468, 36];
const TOTAL_TICKS = 4500;

test('info names the source and its licence', () => {
  assert.equal(info.id, 'fur-elise');
  assert.equal(info.title, 'Für Elise');
  assert.ok(info.composer && info.note);
  assert.match(info.source, /mutopiaproject\.org\/cgibin\/piece-info\.cgi\?id=931/);
  assert.match(info.source, /Public Domain/);
  assert.match(info.source, /Stelios Samelis/);
  assert.equal(song.name, 'Für Elise');
});

test('valid, no warnings, fits, within the player limits', () => {
  assert.deepEqual(validate(project), []);
  assert.deepEqual(lint(project), []);
  assert.ok(songSizeInfo(project).fits);
  for (const pattern of song.patterns) assert.ok(pattern.events.length * 2 + 1 <= 255);
  for (const order of song.orders) assert.ok(order.length <= 128);
  for (const inst of project.instruments) assert.ok(inst.release >= 1 && inst.release <= 2);
});

test('serialise and parse give the same song', () => {
  const { bytes } = serialiseSong(song, 0x3000);
  const back = parseSong(bytes, 0x3000);   // the byte format has no names
  const unnamed = { ...song, name: back.name, patterns: song.patterns.map((p, i) => ({ ...p, name: back.patterns[i].name })) };
  assert.deepEqual(back, unnamed);
});

test('timing: every voice has the same length, section by section', () => {
  assert.equal(SPEED, 2);
  assert.equal(song.speed, SPEED);
  assert.equal(BAR, 36);
  for (const v of voices) assert.equal(v.ticks, TOTAL_TICKS);
  assert.deepEqual(sectionTicks(0), sectionTicks(1));
  assert.deepEqual(sectionTicks(0), sectionTicks(2));
  assert.deepEqual(sectionTicks(0).slice(0, FIRST_SECTIONS.length), FIRST_SECTIONS);
  for (const order of song.orders) assert.deepEqual(order.at(-1), { loop: 0 });
  // every note starts on the grid of the shortest note value (a thirty-second note is 3 ticks, a triplet note 4)
  for (const v of voices) for (const n of v.notes) assert.ok(n.length >= 2 && Number.isInteger(n.start));
});

test('the opening phrases are the notes of the score', () => {
  assert.equal(listing(0, 0, 120), LEAD_START);
  assert.equal(listing(1, 0, 120), BASS_START);
  assert.equal(listing(0, 588, 660), LEAD_SECOND);
  assert.equal(listing(1, 588, 660), BASS_SECOND);
  assert.equal(listing(0, 1578, 1632), LEAD_MINOR);
});

test('every note of every voice matches the source (digest of tick, pitch and length)', () => {
  voices.forEach((v, i) => assert.equal(v.notes.length, NOTE_COUNTS[i]));
  voices.forEach((v, i) => assert.equal(digest(i), DIGESTS[i], `voice ${i + 1}`));
});

test('the voices keep their roles: lead above the left hand, no drums, lead has the highest sustain', () => {
  const lowestLead = Math.min(...voices[0].notes.map((n) => n.pitch));
  const topLeft = Math.max(...voices[1].notes.map((n) => n.pitch));
  assert.ok(lowestLead >= 45 && topLeft <= 53);   // the lead from A-3 up (the foot of the big arpeggio), the left hand up to F-4
  assert.ok(project.instruments.every((inst) => !inst.drumNoise));
  const sustain = (n) => project.instruments[n].sr >> 4;
  assert.ok(sustain(0) > sustain(1) && sustain(1) > sustain(2));
  // the dyad instruments are exactly the offsets the inner voice uses
  const used = new Set(voices[2].notes.map((n) => project.instruments[n.instrument].arp).filter(Boolean));
  assert.deepEqual([...used].sort((a, b) => a - b), [...DYADS]);
});

test('vibrato is only on the lead and starts late; pulse width stays between 40 and 60 percent', () => {
  const lead = project.instruments[0];
  assert.ok(lead.vibDelay >= 10 && lead.vibDepth > 0);
  assert.ok(lead.pwMin * 16 / 4096 >= 0.39 && lead.pwMax * 16 / 4096 <= 0.61);
  project.instruments.slice(1).forEach((inst) => assert.equal(inst.vibDepth, 0));
});

// ---- the real player: every note starts on the frame of its tick, with the right pitch and length
test('the real player plays every note on the right frame', () => {
  const root = new URL('../../player/', import.meta.url);
  const prg = new Uint8Array(readFileSync(new URL('player.prg', root)));
  const symbols = JSON.parse(readFileSync(new URL('symbols.json', root), 'utf8'));
  const ram = new Uint8Array(65536);
  ram.set(prg.subarray(2), prg[0] | (prg[1] << 8));
  const tables = serialiseInstruments(project.instruments);
  INSTRUMENT_TABLES.forEach((n, k) => ram.set(tables[n], LIMITS.instrumentBase + k * 0x100));
  ram.set(serialiseSong(song, LIMITS.songBase).bytes, LIMITS.songBase);

  let frame = 0;
  const gate = [0, 0, 0];
  const played = [[], [], []];                 // { on, off, pitch } per gate cycle
  const cpu = new Cpu6502({
    read: (a) => ram[a],
    write: (a, v) => {
      ram[a] = v;
      const reg = a - 0xD400;
      if (reg < 0 || reg > 20 || reg % 7 !== 4) return;      // only the control registers
      const voice = (reg - 4) / 7;
      if ((v & 1) && !gate[voice]) played[voice].push({ on: frame });
      if (!(v & 1) && gate[voice]) played[voice].at(-1).off = frame;
      gate[voice] = v & 1;
    },
  });
  cpu.sp = 0xFF;
  cpu.a = LIMITS.songBase & 255;
  cpu.x = LIMITS.songBase >> 8;
  cpu.call(symbols.music_init, 100000);
  for (frame = 0; frame < TOTAL_TICKS * SPEED; frame++) {
    cpu.call(symbols.music_play, 100000);
    played.forEach((list, v) => { if (list.length && list.at(-1).on === frame) list.at(-1).pitch = ram[symbols.st_pitch + v]; });
  }
  voices.forEach((voice, v) => {
    assert.equal(played[v].length, voice.notes.length, `voice ${v + 1}: number of notes`);
    voice.notes.forEach((n, i) => {
      const got = played[v][i];
      const want = { on: n.start * SPEED, off: (n.start + n.length) * SPEED - 2, pitch: n.pitch };   // the gate closes release (2) frames early
      assert.deepEqual(got, want, `voice ${v + 1} note ${i}`);
    });
  });
});

test('the note text helper', () => {
  assert.deepEqual(events('i2 E5:3 | r:2 l'), [
    { type: 'inst', instrument: 2 }, { type: 'note', pitch: 64, length: 3 }, { type: 'rest', length: 2 }, { type: 'legato' },
  ]);
  assert.throws(() => events('H9:1'));
});
