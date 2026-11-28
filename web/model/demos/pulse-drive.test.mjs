// Checks Pulse Drive: valid and lint-free, 32 bars of 16 ticks in every voice, the loop back to bar 5,
// the classic layout (bass and drums on voice 1, the lead on 2, arpeggio chords on 3) and its tricks.
//
// Run: node --test web/model/demos/pulse-drive.test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';

import { info, build, parse, SPEED, BAR, LOOP_BAR } from './pulse-drive.js';
import { lint, noteName, songSizeInfo, validate } from '../project.js';
import { parseSong, serialiseSong } from '../serialise.js';

const project = build();
const { song, instruments } = project;
const ticks = (entry) => song.patterns[entry.pattern].events.reduce((sum, ev) => sum + (ev.length || 0), 0);
const usedIn = (voice) => new Set(song.orders[voice].filter((e) => e.pattern !== undefined)
  .flatMap((e) => song.patterns[e.pattern].events.filter((ev) => ev.type === 'inst').map((ev) => ev.instrument)));

test('info, validity, size and the byte round trip', () => {
  assert.equal(info.id, 'pulse-drive');
  assert.equal(info.composer, 'WebSidTracker');
  assert.deepEqual(validate(project), []);
  assert.deepEqual(lint(project), []);
  assert.ok(songSizeInfo(project).fits);
  assert.equal(song.speed, SPEED);
  const back = parseSong(serialiseSong(song, 0x3800).bytes, 0x3800);
  assert.deepEqual(back.orders, song.orders);
});

test('32 bars of 16 ticks in every voice, 150 beats per minute, looping to bar 5', () => {
  for (const order of song.orders) {
    assert.equal(order.length, 33);
    assert.deepEqual(order.at(-1), { loop: LOOP_BAR - 1 });
    order.slice(0, 32).forEach((entry, k) => assert.equal(ticks(entry), BAR, `bar ${k + 1}`));
  }
  assert.equal(60 * 50 / (SPEED * BAR / 4), 150);
});

test('voice 1 plays the bass and the drums, voice 2 the lead, voice 3 three-note chords', () => {
  const drums = [...usedIn(0)].filter((i) => instruments[i].drumNoise > 0);
  assert.equal(drums.length, 2, 'a kick and a snare on the bass voice');
  assert.ok([...usedIn(0)].some((i) => !instruments[i].drumNoise && instruments[i].wave === 0x40), 'and a pulse bass');
  assert.ok([...usedIn(1)].every((i) => !instruments[i].drumNoise && !instruments[i].arp));
  for (const i of usedIn(2)) assert.ok(instruments[i].arp > 0 && instruments[i].arp2 === 7, instruments[i].name);
});

test('the tricks: pulse sweeps, a late vibrato, bends, a rising slide and a falling dive', () => {
  const lead = [...usedIn(1)].map((i) => instruments[i]);
  assert.ok(lead.some((inst) => inst.slide > 0) && lead.some((inst) => inst.slide < 0));
  assert.ok(lead.filter((inst) => inst.vibDepth).every((inst) => inst.vibDelay >= 8));
  assert.ok(instruments.filter((inst) => inst.wave === 0x40 && !inst.drumNoise).every((inst) => inst.pwStep !== 0));
  const bends = song.orders[1].filter((e) => e.pattern !== undefined)        // bars of the lead with a bend
    .filter((e) => song.patterns[e.pattern].events.some((ev) => ev.type === 'legato'));
  assert.ok(bends.length >= 5);
});

test('the theme starts on D in bar 5, and the break has no drums', () => {
  const firstNote = song.patterns[song.orders[1][4].pattern].events.find((ev) => ev.type === 'note');
  assert.equal(noteName(firstNote.pitch), 'D-5');
  for (const bar of [21, 22, 23]) {
    const events = song.patterns[song.orders[0][bar - 1].pattern].events;
    assert.ok(events.filter((ev) => ev.type === 'inst').every((ev) => !instruments[ev.instrument].drumNoise), `bar ${bar}`);
  }
});

test('the note text', () => {
  assert.deepEqual(parse('i3 D5:4 l r:2'), [
    { type: 'inst', instrument: 3 }, { type: 'note', pitch: 62, length: 4 }, { type: 'legato' }, { type: 'rest', length: 2 },
  ]);
  assert.throws(() => parse('H9:1'));
});
