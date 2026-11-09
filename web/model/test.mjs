// Tests for the song model, the serialiser and the exports. Run: node --test web/model/test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import {
  LIMITS, clone, defaultInstrument, defaultSong, demoProject, newProject, noteName, parseNoteName,
  previewSong, songSizeInfo, transposedPitch, validate,
} from './project.js';
import {
  INSTRUMENT_TABLES, locatePlayhead, parseSong, playheadFromLocation, serialiseInstruments, serialiseSong,
} from './serialise.js';
import { exportInstrumentsAsm, exportPrg, exportSongAsm, projectFromJson, projectToJson } from './export.js';

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
const stripNames = (song) => ({ ...song, name: '', patterns: song.patterns.map((p) => ({ ...p, name: '' })) });

// The worked example of docs/design-player-format-and-timing.md, section 4.5 (plus an empty
// pattern table entry for pattern 1, `pat_lead`, which the example lists but does not show).
function workedExample() {
  return {
    name: 'demo',
    speed: 6,
    patterns: [
      { name: '', events: [
        { type: 'inst', instrument: 2 }, { type: 'note', pitch: 0x18, length: 4 }, { type: 'note', pitch: 0x18, length: 4 },
        { type: 'rest', length: 4 }, { type: 'note', pitch: 0x1F, length: 4 },
      ] },
      { name: '', events: [] },
    ],
    orders: [[{ pattern: 0, transpose: 0 }, { loop: 0 }], [{ stop: true }], [{ stop: true }]],
  };
}

test('worked example is byte exact', () => {
  const s = serialiseSong(workedExample(), 0x3000);
  // layout: header $3000, pattern table $3009, order lists $300D / $3011 / $3013, patterns $3015 / $3020
  assert.equal(hex(s.bytes.subarray(0, 9)), '06 0d 30 11 30 13 30 09 30');
  assert.equal(hex(s.bytes.subarray(9, 13)), '15 30 20 30');                    // pattern table
  assert.equal(hex(s.bytes.subarray(0x0D, 0x11)), '00 00 ff 00');               // voice 1: pattern 0, loop to entry 0
  assert.equal(hex(s.bytes.subarray(0x11, 0x15)), 'fe 00 fe 00');               // voices 2 and 3: stop
  assert.equal(hex(s.bytes.subarray(0x15, 0x20)), '61 02 18 04 18 04 60 04 1f 04 ff');
  assert.equal(hex(s.bytes.subarray(0x20)), 'ff');                               // empty pattern 1
  assert.equal(s.size, 0x21);
});

test('worked example: the pattern is 5 events, 10 bytes plus the end marker, the order list 4 bytes', () => {
  // (the design document says 12 bytes for the pattern; the listed bytes add up to 11)
  const s = serialiseSong(workedExample(), 0);
  assert.equal(s.map.patterns[0].endOffset + 1, 11);
  assert.equal(s.map.orders[0].length * 2, 4);
});

test('tables, instruments and limits', () => {
  const t = serialiseInstruments([{ ...defaultInstrument(), pw: 0x0A55, pwStep: -3, arp: -12, wave: 0x41 }, null, { ...defaultInstrument(), name: 'x' }]);
  assert.deepEqual(Object.keys(t), INSTRUMENT_TABLES);
  assert.equal(t.inst_pw_lo[0], 0x55);
  assert.equal(t.inst_pw_hi[0], 0x0A);
  assert.equal(t.inst_pw_step[0], 0xFD);
  assert.equal(t.inst_arp[0], 0xF4);
  assert.equal(t.inst_wave[1], 0);
  assert.equal(t.inst_wave[2], 0x40);
  assert.equal(t.inst_wave.length, 256);
  assert.throws(() => serialiseInstruments([{ ...defaultInstrument(), pw: 4096 }]), /pw/);
});

test('demo project is valid and round-trips through bytes', () => {
  const demo = demoProject();
  assert.deepEqual(validate(demo), []);
  const s = serialiseSong(demo.song, 0x3000);
  const back = parseSong(s.bytes, 0x3000);
  assert.deepEqual(back, stripNames(demo.song));
  // the demo is 16 bars of 16 ticks on every voice, then loops
  const ticks = (v) => demo.song.orders[v].reduce((sum, e) => sum + (e.pattern === undefined ? 0
    : demo.song.patterns[e.pattern].events.reduce((a, ev) => a + (ev.length || 0), 0)), 0);
  assert.deepEqual([ticks(0), ticks(1), ticks(2)], [256, 256, 256]);
  assert.ok(s.size < 1000);
  // instruments: names, a drum voice using the three drum instruments
  assert.deepEqual(demo.instruments.map((i) => i.name), ['Bass', 'Lead', 'Kick', 'Snare', 'Hat', 'Arp']);
  const used = new Set(demo.song.patterns.flatMap((p) => p.events.filter((e) => e.type === 'inst').map((e) => e.instrument)));
  assert.deepEqual([...used].sort(), [0, 1, 2, 3, 4, 5]);
});

test('round trip at other base addresses and with several patterns', () => {
  const song = defaultSong();
  song.patterns = Array.from({ length: 200 }, (_, i) => ({ name: '', events: [{ type: 'note', pitch: i % 96, length: 1 + (i % 255) }] }));
  song.orders[0] = song.patterns.slice(0, 126).map((_, i) => ({ pattern: i, transpose: (i % 7) - 3 })).concat([{ loop: 5 }]);
  song.orders[1] = [{ pattern: 199, transpose: -96 }, { stop: true }];
  for (const base of [0, 0x3000, 0xC000]) {
    assert.deepEqual(parseSong(serialiseSong(song, base).bytes, base), stripNames(song));
  }
  assert.deepEqual(validate({ instruments: [defaultInstrument()], song }), []);
});

test('empty pattern, empty and unterminated order lists', () => {
  const song = defaultSong();
  const s = serialiseSong(song, 0x3000);
  const pat = s.map.patterns[0];
  assert.equal(s.bytes[pat.address - 0x3000], 0xFF);
  assert.deepEqual(pat.events, []);
  assert.equal(pat.endOffset, 0);

  // an order list that does not end in stop/loop gets a stop appended; empty list becomes one stop
  song.orders = [[{ pattern: 0, transpose: 0 }], [], [{ stop: true }]];
  const s2 = serialiseSong(song, 0x3000);
  const back = parseSong(s2.bytes, 0x3000);
  assert.deepEqual(back.orders, [[{ pattern: 0, transpose: 0 }, { stop: true }], [{ stop: true }], [{ stop: true }]]);
  assert.equal(s2.map.orders[1].length, 0);
});

test('transpose is signed in the bytes and clamps when played', () => {
  const song = defaultSong();
  song.orders[0] = [{ pattern: 0, transpose: -96 }, { pattern: 0, transpose: 96 }, { stop: true }];
  const s = serialiseSong(song, 0);
  const at = s.map.orderAddresses[0];
  assert.deepEqual([s.bytes[at + 1], s.bytes[at + 3]], [160, 96]);
  assert.equal(transposedPitch(10, -96), 0);
  assert.equal(transposedPitch(90, 96), 95);
  assert.equal(transposedPitch(48, -4), 44);
});

test('note names', () => {
  assert.equal(noteName(0), 'C-0');
  assert.equal(noteName(48), 'C-4');
  assert.equal(noteName(54), 'F#4');
  assert.equal(noteName(57), 'A-4');
  assert.equal(noteName(95), 'B-7');
  assert.equal(parseNoteName('F#3'), 42);
  assert.equal(parseNoteName('c4'), 48);
  assert.equal(parseNoteName('H-4'), null);
  for (let p = 0; p < 96; p++) assert.equal(parseNoteName(noteName(p)), p);
});

test('validate finds problems', () => {
  const bad = (mutate) => { const p = demoProject(); mutate(p); return validate(p); };
  assert.match(bad((p) => { p.song.speed = 0; })[0], /speed/);
  assert.match(bad((p) => { p.song.patterns[0].events.push({ type: 'note', pitch: 96, length: 1 }); })[0], /pitch/);
  assert.match(bad((p) => { p.song.patterns[0].events.push({ type: 'note', pitch: 1, length: 256 }); })[0], /length/);
  assert.match(bad((p) => { p.song.patterns[0].events.push({ type: 'note', pitch: 1, length: 0 }); })[0], /length/);
  assert.match(bad((p) => { p.song.orders[0][0].pattern = 99; })[0], /does not exist/);
  assert.match(bad((p) => { p.song.orders[0][0].transpose = 97; })[0], /transpose/);
  assert.match(bad((p) => { p.song.orders[0][p.song.orders[0].length - 1].loop = 999; })[0], /loop target/);
  assert.match(bad((p) => { p.instruments[3] = null; })[0], /instrument 3 does not exist/);
  assert.match(bad((p) => { p.instruments[0].pw = 5000; })[0], /pw/);
  assert.match(bad((p) => { p.song.patterns[0].events.push({ type: 'bogus' }); })[0], /unknown event/);
  assert.match(bad((p) => { p.song.patterns = Array.from({ length: 255 }, () => ({ name: '', events: [] })); })[0], /254 patterns/);
  assert.match(bad((p) => { p.song.orders[0] = Array.from({ length: 129 }, () => ({ pattern: 0, transpose: 0 })); })[0], /130 order entries/);
  assert.match(bad((p) => { p.song.orders[0] = Array.from({ length: 128 }, () => ({ pattern: 0, transpose: 0 })); })[0], /129 order entries/, 'the added STOP counts');
  assert.deepEqual(bad((p) => { p.song.orders[2] = Array.from({ length: 127 }, () => ({ pattern: 0, transpose: 0 })).concat([{ stop: true }]); }), []);
  assert.match(bad((p) => { p.song.patterns[0].events = Array.from({ length: 128 }, () => ({ type: 'note', pitch: 1, length: 1 })); })[0], /pattern 0 is 257 bytes, the player allows 255/);
  assert.deepEqual(bad((p) => { p.song.patterns[0].events = Array.from({ length: 127 }, () => ({ type: 'note', pitch: 1, length: 1 })); }), []);
  // a loop that plays no ticks: the player stops the voice after 16 empty entries
  const hang = newProject();
  hang.song.orders[0] = [{ pattern: 0, transpose: 0 }, { loop: 0 }];
  assert.match(validate(hang)[0], /16 empty entries/);
  assert.deepEqual(validate(newProject()), []);
});

test('song size limit: info, validate and exportPrg fail clearly', () => {
  const project = newProject();
  const info0 = songSizeInfo(project);
  assert.equal(info0.fits, true);
  assert.equal(info0.capacity, 0xC000 - 0x3000);
  assert.equal(info0.songBytes, serialiseSong(project.song, 0x3000).size);
  assert.equal(info0.instrumentBytes, 15);

  // 150 patterns of 255 bytes overflow $3000-$BFFF
  const events = Array.from({ length: 127 }, () => ({ type: 'note', pitch: 1, length: 1 }));
  project.song.patterns = Array.from({ length: 150 }, () => ({ name: '', events: events.map((e) => ({ ...e })) }));
  project.song.orders[0] = project.song.patterns.slice(0, 100).map((_, i) => ({ pattern: i, transpose: 0 })).concat([{ stop: true }]);
  const info = songSizeInfo(project);
  assert.equal(info.fits, false);
  assert.ok(info.free < 0);
  assert.match(validate(project)[0], /only \d+ fit below \$C000/);
  assert.throws(() => exportPrg(project, fakePlayer()), /cannot export: song is \d+ bytes/);
});

test('map consistency: addresses and offsets point at the right bytes', () => {
  const demo = demoProject();
  const s = serialiseSong(demo.song, 0x4000);
  const at = (a) => s.bytes[a - s.base];
  demo.song.patterns.forEach((pattern, n) => {
    const m = s.map.patterns[n];
    // the pattern table entry holds the address
    const t = s.map.tableAddress + 2 * n;
    assert.equal(at(t) | (at(t + 1) << 8), m.address);
    assert.equal(m.events.length, pattern.events.length);
    pattern.events.forEach((ev, i) => {
      assert.equal(m.events[i].index, i);
      const first = at(m.address + m.events[i].offset);
      if (ev.type === 'note') assert.equal(first, ev.pitch);
      if (ev.type === 'rest') assert.equal(first, 0x60);
      if (ev.type === 'inst') assert.equal(first, 0x61);
      if (ev.type === 'legato') assert.equal(first, 0x62);
    });
    assert.equal(at(m.address + m.endOffset), 0xFF);
  });
  demo.song.orders.forEach((entries, v) => {
    assert.equal(at(1 + 2 * v + s.base) | (at(2 + 2 * v + s.base) << 8), s.map.orderAddresses[v]);
    entries.forEach((e, i) => {
      const m = s.map.orders[v][i];
      assert.equal(m.offset, 2 * i);
      assert.equal(m.entry, i);
      const a = s.map.orderAddresses[v] + m.offset;
      if (e.pattern !== undefined) { assert.equal(at(a), e.pattern); assert.equal(m.pattern, e.pattern); }
      else if (e.loop !== undefined) assert.deepEqual([at(a), at(a + 1)], [0xFF, e.loop]);
      else assert.equal(at(a), 0xFE);
    });
  });
  // patterns end inside the song
  const last = s.map.patterns[s.map.patterns.length - 1];
  assert.equal(last.address + last.endOffset + 1, s.base + s.size);
});

test('locatePlayhead and playheadFromLocation', () => {
  const song = demoProject().song;
  const map = serialiseSong(song, 0x3000).map;
  const bassFirst = map.patterns[0];
  // the player has just read event 3 (patPos = its offset is the NEXT event) in entry 2 of voice 1
  const state = { orderPos: 2 * 2, patAddr: map.patterns[0].address, patPos: bassFirst.events[3].offset };
  const loc = locatePlayhead(map, state, 0);
  assert.deepEqual(loc, { entry: 2, patternIndex: 0, eventIndex: 3, playingIndex: 2 });
  assert.deepEqual(playheadFromLocation(map, loc, 0), state);

  // at the end marker
  const end = locatePlayhead(map, { orderPos: 0, patAddr: bassFirst.address, patPos: bassFirst.endOffset }, 0);
  assert.equal(end.eventIndex, bassFirst.events.length);

  // not in a pattern -> null
  assert.equal(locatePlayhead(map, { orderPos: 0, patAddr: 0, patPos: 0 }, 0), null);

  // a player that has already advanced orderPos to the next entry (same pattern 0 is used by entry 1 and 2)
  const lead = locatePlayhead(map, { orderPos: 2 * 8, patAddr: map.patterns[4].address, patPos: 0 }, 1);
  assert.equal(lead.entry, 8);
  const ahead = locatePlayhead(map, { orderPos: 2 * 9, patAddr: map.patterns[4].address, patPos: 0 }, 1);
  assert.equal(ahead.entry, 8, 'entry 9 does not use pattern 4, so entry 8 is meant');
});

test('playhead survives edits', () => {
  const song = demoProject().song;
  const oldMap = serialiseSong(song, 0x3000).map;
  const p0 = oldMap.patterns[0];
  const loc = locatePlayhead(oldMap, { orderPos: 2, patAddr: p0.address, patPos: p0.events[5].offset }, 0);

  // insert two events before: the playhead keeps pointing at the same event
  const edited = clone({ song }).song;
  edited.patterns[0].events.splice(1, 0, { type: 'rest', length: 1 }, { type: 'rest', length: 1 });
  const newMap = serialiseSong(edited, 0x3000).map;
  let ph = playheadFromLocation(newMap, { ...loc, eventIndex: loc.eventIndex + 2 }, 0);
  assert.equal(ph.patPos, newMap.patterns[0].events[loc.eventIndex + 2].offset);
  assert.equal(ph.patAddr, newMap.patterns[0].address);
  assert.equal(ph.orderPos, 2);

  // the event vanished (pattern shortened): points at the end marker, the player moves on by itself
  edited.patterns[0].events.length = 2;
  const shortMap = serialiseSong(edited, 0x3000).map;
  ph = playheadFromLocation(shortMap, loc, 0);
  assert.equal(ph.patPos, shortMap.patterns[0].endOffset);

  // entry became STOP: finish the previous pattern entry, then the player meets the stop
  edited.orders[0][2] = { stop: true };
  const stopMap = serialiseSong(edited, 0x3000).map;
  ph = playheadFromLocation(stopMap, { entry: 2, patternIndex: 0, eventIndex: 1 }, 0);
  assert.equal(ph.orderPos, 2);
  assert.equal(ph.patPos, stopMap.patterns[0].endOffset);

  // entry index past the end of a shortened order list is clamped, nothing throws
  edited.orders[0] = [{ pattern: 0, transpose: 0 }, { loop: 0 }];
  const small = serialiseSong(edited, 0x3000).map;
  assert.doesNotThrow(() => playheadFromLocation(small, { entry: 15, patternIndex: 3, eventIndex: 99 }, 0));
  // no pattern entry at all -> null
  edited.orders[0] = [{ stop: true }];
  const none = serialiseSong(edited, 0x3000).map;
  assert.equal(playheadFromLocation(none, { entry: 0, patternIndex: 0, eventIndex: 0 }, 0), null);
  assert.equal(playheadFromLocation(none, null, 0), null);
});

// A tiny two-pass reader for the ACME subset we generate: labels at column 0, !byte / !word lines,
// values as $hex, decimal or label names. Returns the bytes assembled at `origin` and the labels.
function assemble(text, origin) {
  const items = [];
  const labels = {};
  let pc = origin;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/;.*$/, '').trimEnd();
    if (!line.trim()) continue;
    if (/^\S/.test(line)) labels[line.trim().split(/\s/)[0]] = pc;
    const dir = /^\s+(!byte|!word)\s+(.*)$/.exec(line);
    if (!dir) { assert.match(line, /^\w+$/, `unexpected line: ${raw}`); continue; }
    const values = dir[2].split(',').map((v) => v.trim());
    items.push({ kind: dir[1], values });
    pc += values.length * (dir[1] === '!byte' ? 1 : 2);
  }
  const out = [];
  const num = (v) => (v[0] === '$' ? parseInt(v.slice(1), 16) : /^-?\d+$/.test(v) ? Number(v) : labels[v]);
  for (const { kind, values } of items) {
    for (const v of values) {
      const n = num(v);
      assert.ok(n !== undefined && !Number.isNaN(n), `unknown value ${v}`);
      if (kind === '!byte') out.push(n & 0xFF);
      else out.push(n & 0xFF, n >> 8);
    }
  }
  return { bytes: Uint8Array.from(out), labels };
}

test('song asm assembles to exactly the serialised bytes', () => {
  for (const song of [demoProject().song, workedExample(), defaultSong()]) {
    const asm = exportSongAsm(song, 'My Song 1');
    assert.match(asm, /^song_my_song_1$/m);
    const { bytes } = assemble(asm, 0x3000);
    assert.equal(hex(bytes), hex(serialiseSong(song, 0x3000).bytes));
  }
  assert.match(exportSongAsm(defaultSong(), '9lives'), /^song_s9lives$/m);
});

test('instruments asm: trimmed tables with the inst_* labels', () => {
  const demo = demoProject();
  const asm = exportInstrumentsAsm(demo.instruments);
  const { bytes, labels } = assemble(asm, 0x2000);
  const full = serialiseInstruments(demo.instruments);
  const n = demo.instruments.length;
  INSTRUMENT_TABLES.forEach((name) => {
    assert.ok(name in labels, name);
    const start = labels[name] - 0x2000;
    assert.equal(hex(bytes.subarray(start, start + n)), hex(full[name].subarray(0, n)), name);
  });
  assert.equal(bytes.length, 15 * n);
  // sparse set: highest used instrument + 1 entries
  const sparse = [null, null, { ...defaultInstrument(), name: 'Third' }];
  assert.equal(assemble(exportInstrumentsAsm(sparse), 0).bytes.length, 15 * 3);
  assert.equal(assemble(exportInstrumentsAsm([]), 0).bytes.length, 15);
});

// A stand-in for player.prg: load address $0801, code up to $1xxx marked with a pattern, and a
// fake "demo song" at $3000 that the export must remove.
function fakePlayer({ load = 0x0801, end = 0x3100 } = {}) {
  const prg = new Uint8Array(2 + end - load).fill(0xEA);
  prg[0] = load & 0xFF;
  prg[1] = load >> 8;
  return prg;
}

test('exportPrg patches tables at $2000 and the song at $3000', () => {
  const project = demoProject();
  const player = fakePlayer();
  const prg = exportPrg(project, player);
  assert.deepEqual([prg[0], prg[1]], [0x01, 0x08]);
  const ram = (a) => prg[2 + a - 0x0801];
  // the player part is untouched below $2000
  for (let a = 0x0801; a < 0x2000; a += 97) assert.equal(ram(a), 0xEA);
  // instrument tables
  const tables = serialiseInstruments(project.instruments);
  INSTRUMENT_TABLES.forEach((name, k) => {
    for (let i = 0; i < 256; i++) assert.equal(ram(0x2000 + k * 0x100 + i), tables[name][i], `${name}[${i}]`);
  });
  // song
  const song = serialiseSong(project.song, 0x3000);
  assert.equal(prg.length, 2 + (0x3000 + song.size) - 0x0801);
  assert.equal(hex(prg.subarray(2 + 0x3000 - 0x0801)), hex(song.bytes));
  // a smaller song than the player's built-in one: the old tail is gone
  const small = exportPrg(newProject(), player);
  assert.equal(small.length, 2 + 0x3000 + serialiseSong(newProject().song, 0x3000).size - 0x0801);
});

test('exportPrg: image that ends below $2F00 still gets all tables; bad images are rejected', () => {
  const prg = exportPrg(newProject(), fakePlayer({ end: 0x1800 }));
  assert.ok(prg.length >= 2 + 0x3000 - 0x0801);
  assert.throws(() => exportPrg(newProject(), new Uint8Array(1)), /empty/);
  assert.throws(() => exportPrg(newProject(), fakePlayer({ load: 0x2000, end: 0x2100 })), /expected below \$2000/);
  const broken = newProject();
  broken.song.speed = 0;
  assert.throws(() => exportPrg(broken, fakePlayer()), /cannot export/);
});

test('exportPrg with the real player image, if it is built', { skip: !existsSync(new URL('../player/player.prg', import.meta.url)) }, () => {
  const player = new Uint8Array(readFileSync(new URL('../player/player.prg', import.meta.url)));
  const project = demoProject();
  const prg = exportPrg(project, player);
  const load = player[0] | (player[1] << 8);
  assert.deepEqual([prg[0], prg[1]], [player[0], player[1]]);
  const song = serialiseSong(project.song, 0x3000);
  assert.equal(hex(prg.subarray(2 + 0x3000 - load, 2 + 0x3000 - load + song.size)), hex(song.bytes));
  // player code below $2000 is untouched
  const codeEnd = Math.min(0x2000, load + player.length - 2);
  assert.equal(hex(prg.subarray(2, 2 + codeEnd - load)), hex(player.subarray(2, 2 + codeEnd - load)));
});

test('project JSON round trip and error messages', () => {
  const demo = demoProject();
  assert.deepEqual(projectFromJson(projectToJson(demo)), demo);
  const sparse = { instruments: [null, { ...defaultInstrument() }], song: defaultSong() };
  assert.deepEqual(projectFromJson(projectToJson(sparse)), sparse);
  assert.throws(() => projectFromJson('not json'), /not valid JSON/);
  assert.throws(() => projectFromJson('{"a":1}'), /not a project file/);
  const broken = JSON.parse(projectToJson(demo));
  broken.song.orders[0][0].pattern = 77;
  assert.throws(() => projectFromJson(JSON.stringify(broken)), /pattern 77 does not exist/);
  // missing instrument fields are filled with defaults
  const partial = projectFromJson(JSON.stringify({ instruments: [{ name: 'Only a name' }], song: defaultSong() }));
  assert.equal(partial.instruments[0].release, 2);
});

test('previewSong and clone', () => {
  const s = previewSong(3, 48);
  assert.equal(s.speed, 4);
  const bytes = serialiseSong(s, LIMITS.scratchBase).bytes;
  assert.equal(parseSong(bytes, LIMITS.scratchBase).patterns[0].events[0].instrument, 3);
  assert.equal(parseSong(bytes, LIMITS.scratchBase).orders[1][0].stop, true);
  assert.equal(previewSong(0, 10, 7).speed, 7);

  const demo = demoProject();
  const copy = clone(demo);
  assert.deepEqual(copy, demo);
  copy.song.patterns[0].events[0].instrument = 9;
  assert.notDeepEqual(copy, demo);
});
