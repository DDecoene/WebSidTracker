// Checks the "Ode to Joy" demo: valid and lint-free, fits the player, survives the byte round trip,
// plays the right tune, and all three voices have the same length so the loop stays aligned.
//
// Run: node --test web/model/demos/ode-to-joy.test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import test from 'node:test';
import assert from 'node:assert/strict';

import { build, info } from './ode-to-joy.js';
import { LIMITS, lint, noteName, parseNoteName, songSizeInfo, validate } from '../project.js';
import { parseSong, serialiseSong } from '../serialise.js';

const events = (project, pattern) => project.song.patterns[pattern].events;
const notes = (list) => list.filter((ev) => ev.type === 'note');
const ticksOf = (project, voice) => project.song.orders[voice].reduce(
  (sum, e) => sum + (e.pattern === undefined ? 0 : events(project, e.pattern).reduce((n, ev) => n + (ev.length ?? 0), 0)), 0);

test('info names the demo', () => {
  assert.equal(info.id, 'ode-to-joy');
  assert.equal(info.title, 'Ode to Joy');
  assert.ok(info.composer.includes('Beethoven') && info.note.length > 20);
});

test('the project is valid, has no warnings and fits the player', () => {
  const project = build();
  assert.deepEqual(validate(project), []);
  assert.deepEqual(lint(project), []);
  assert.ok(songSizeInfo(project).fits);
  assert.ok(serialiseSong(project.song).size < 2000);
  project.song.orders.forEach((list) => assert.ok(list.length <= LIMITS.maxEntries));
  assert.ok(project.song.speed >= 1);
});

test('serialise and parse give the same song back', () => {
  const project = build();
  const bytes = serialiseSong(project.song, LIMITS.songBase);
  const back = parseSong(bytes.bytes, LIMITS.songBase);   // pattern and song names are not stored in the bytes
  assert.equal(back.speed, project.song.speed);
  assert.deepEqual(back.orders, project.song.orders);
  assert.deepEqual(back.patterns.map((p) => p.events), project.song.patterns.map((p) => p.events));
});

test('the first phrase is the Ode to Joy theme: E E F G G F E D C C D E E. D D', () => {
  const project = build();
  const first = project.song.orders[0][0];
  assert.equal(first.transpose, 0);
  const got = notes(events(project, first.pattern)).map((ev) => [noteName(ev.pitch), ev.length]);
  const want = 'E-5 E-5 F-5 G-5 G-5 F-5 E-5 D-5 C-5 C-5 D-5 E-5 E-5 D-5 D-5'.split(' ');
  const lengths = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 6, 2, 8];
  assert.deepEqual(got, want.map((name, i) => [name, lengths[i]]));
  assert.equal(got.reduce((n, [, length]) => n + length, 0), 4 * 16, 'four bars of 16 ticks');
});

test('the bridge is D D E C D E F E C D E F E D C D G, then the theme returns', () => {
  const project = build();
  const lead = project.song.orders[0];
  const pitches = (entry) => notes(events(project, entry.pattern)).map((ev) => noteName(ev.pitch));
  assert.deepEqual(pitches(lead[2]).join(' '), 'D-5 D-5 E-5 C-5 D-5 E-5 F-5 E-5 C-5 D-5 E-5 F-5 E-5 D-5 C-5 D-5 G-4');
  assert.equal(lead[3].pattern, lead[1].pattern, 'bars 13-16 repeat bars 5-8');
  assert.equal(pitches(lead[1]).slice(-3).join(' '), 'D-5 C-5 C-5', 'the second phrase ends D. C C');
});

test('four rounds of 16 bars, all voices equally long, and every voice loops to the start', () => {
  const project = build();
  const total = 4 * 16 * 16;
  [0, 1, 2].forEach((v) => {
    assert.equal(ticksOf(project, v), total, `voice ${v + 1}`);
    assert.deepEqual(project.song.orders[v].at(-1), { loop: 0 });
  });
  const lead = project.song.orders[0];
  assert.deepEqual(lead.slice(12, 16).map((e) => e.transpose), [12, 12, 12, 12], 'the final round is an octave up');
});

test('the rounds add instruments in the planned order', () => {
  const project = build();
  const names = (voice, round) => {
    const used = new Set();
    const per = project.song.orders[voice].filter((e) => e.pattern !== undefined);
    const size = per.length / 4;
    per.slice(round * size, (round + 1) * size).forEach((e) => events(project, e.pattern).forEach((ev) => {
      if (ev.type === 'inst') used.add(project.instruments[ev.instrument].name);
    }));
    return [...used].sort().join(',');
  };
  const voice3Silent = project.song.orders[2].slice(0, 4).every((e) => events(project, e.pattern).every((ev) => ev.type === 'rest'));
  assert.ok(voice3Silent, 'round 1: the chord voice is silent');
  assert.equal(names(0, 0), 'Lead');
  assert.equal(names(1, 0), 'Bass');
  assert.equal(names(1, 2), 'Bass,Kick');
  assert.equal(names(1, 3), 'Bass,Kick,Snare');
  const chordVoice = project.song.orders[2].slice(4, 68);
  const chordNames = (a, b) => [...new Set(chordVoice.slice(a, b).flatMap((e) => events(project, e.pattern).filter((ev) => ev.type === 'inst').map((ev) => project.instruments[ev.instrument].name)))].sort().join(',');
  assert.equal(chordNames(0, 16), 'Chord (fifth),Chord (third)');
  assert.equal(chordNames(16, 32), 'Chord (fifth),Chord (third),Hat');
  assert.equal(chordNames(32, 48), 'Counter');
  assert.equal(parseNoteName('E5'), 64);
});

test('round 3 keeps the tune but with shorter notes', () => {
  const project = build();
  const lead = project.song.orders[0];
  const plain = notes(events(project, lead[0].pattern));
  const short = notes(events(project, lead[8].pattern));
  assert.ok(short.length > plain.length);
  assert.ok(Math.max(...short.map((ev) => ev.length)) <= 6);
  assert.deepEqual([...new Set(short.map((ev) => ev.pitch))].sort(), [...new Set(plain.map((ev) => ev.pitch))].sort());
  assert.equal(short.reduce((n, ev) => n + ev.length, 0), plain.reduce((n, ev) => n + ev.length, 0));
});
