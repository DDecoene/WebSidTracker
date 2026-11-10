// instruments-logic.test.mjs - tests for the pure instrument editor logic.
//
// Run:  node --test web/ui/instruments-logic.test.mjs
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as L from './instruments-logic.js';

test('SID time tables match the datasheet', () => {
  assert.equal(L.ATTACK_MS.length, 16);
  assert.equal(L.DECAY_MS.length, 16);
  assert.equal(L.ATTACK_MS[0], 2);
  assert.equal(L.ATTACK_MS[15], 8000);
  assert.equal(L.DECAY_MS[0], 6);
  assert.equal(L.DECAY_MS[15], 24000);
  for (const t of [L.ATTACK_MS, L.DECAY_MS]) {
    for (let i = 1; i < 16; i++) assert.ok(t[i] > t[i - 1]);
  }
  assert.equal(L.RELEASE_MS, L.DECAY_MS);
});

test('formatMs', () => {
  assert.equal(L.formatMs(2), '2 ms');
  assert.equal(L.formatMs(750), '750 ms');
  assert.equal(L.formatMs(1500), '1.5 s');
  assert.equal(L.formatMs(24000), '24 s');
});

test('one frame is 19.95 ms', () => {
  assert.ok(Math.abs(L.FRAME_MS - 19.950) < 0.001);
  assert.ok(Math.abs(L.framesToMs(50) - 997.5) < 0.1);
});

test('envelope nibbles', () => {
  assert.equal(L.attackOf(0x9a), 9);
  assert.equal(L.decayOf(0x9a), 10);
  assert.equal(L.sustainOf(0xc6), 12);
  assert.equal(L.releaseOf(0xc6), 6);
  assert.equal(L.withAttack(0x9a, 3), 0x3a);
  assert.equal(L.withDecay(0x9a, 3), 0x93);
  assert.equal(L.withSustain(0xc6, 15), 0xf6);
  assert.equal(L.withRelease(0xc6, 0), 0xc0);
  assert.equal(L.withAttack(0x00, 31), 0xf0, 'extra bits are cut off');
});

test('waveform flags and toggling', () => {
  assert.deepEqual(L.waveFlags(0x44), { triangle: false, saw: false, pulse: true, noise: false, sync: false, ring: true });
  assert.equal(L.toggleWave(0x40, 'saw', true), 0x60, 'saw + pulse combine');
  assert.equal(L.toggleWave(0x60, 'pulse', false), 0x20);
  assert.equal(L.toggleWave(0x40, 'noise', true), 0x80, 'noise clears the tone bits');
  assert.equal(L.toggleWave(0x84, 'noise', true), 0x84);
  assert.equal(L.toggleWave(0x80, 'pulse', true), 0x40, 'a tone bit clears noise');
  assert.equal(L.toggleWave(0x80, 'sync', true), 0x82, 'sync stays with noise');
  assert.equal(L.toggleWave(0x10, 'ring', true), 0x14);
  assert.equal(L.toggleWave(0x10, 'nonsense', true), 0x10);
  assert.equal(L.toggleWave(0x09, 'pulse', true) & 0x09, 0, 'gate and test bits never survive');
});

test('waveName', () => {
  assert.equal(L.waveName(0x40), 'pulse');
  assert.equal(L.waveName(0x16), 'triangle + ring + sync');
  assert.equal(L.waveName(0), 'silent');
});

test('pulse width as percentage', () => {
  assert.equal(L.pwPercent(0x800), 50);
  assert.equal(L.pwPercent(0), 0);
  assert.equal(L.pwFromPercent(50), 2048);
  assert.equal(L.pwFromPercent(100), 4095, 'clamped to 12 bits');
  assert.equal(L.pwFromPercent(-5), 0);
  assert.equal(L.unitsPercent(0x80), 50);
  assert.equal(L.unitsPercent(0xe0), 87.5);
});

test('sweep path bounces between the limits', () => {
  const path = L.sweepPath(2048, 512, 0x80, 0xa0, 8); // limits 2048..2560
  assert.deepEqual(path, [2048, 2560, 2048, 2560, 2048, 2560, 2048, 2560]);
  const down = L.sweepPath(1000, -100, 0x20, 0xe0, 3);
  assert.deepEqual(down, [1000, 900, 800]);
  assert.deepEqual(L.sweepPath(2048, 0, 0, 255, 3), [2048, 2048, 2048], 'no step, no movement');
  // a start outside the range is pulled in
  const out = L.sweepPath(100, 10, 0x20, 0xe0, 2);
  assert.equal(out[0], 100);
  assert.ok(out[1] >= 512 || out[1] === 110);
});

test('sweep path never leaves the limits once inside', () => {
  const path = L.sweepPath(2048, 37, 0x30, 0xd0, 2000);
  for (const p of path) assert.ok(p >= 0x30 * 16 && p <= 0xd0 * 16);
});

test('sweep period', () => {
  assert.equal(L.sweepPeriodFrames(0, 0x20, 0xe0), 0);
  assert.equal(L.sweepPeriodFrames(10, 0x20, 0x20), 0);
  assert.equal(L.sweepPeriodFrames(16, 0x20, 0x30), 32); // 256 units wide, there and back / 16
  assert.equal(L.sweepPeriodFrames(-16, 0x20, 0x30), 32);
});

test('vibrato conversions', () => {
  assert.equal(L.vibratoCents(16), 100);
  assert.equal(L.vibratoCents(4), 25);
  assert.equal(L.vibratoHz(0), 0);
  // speed 4: half period 4 frames, full period 8 frames = 159.6 ms = 6.27 Hz
  assert.ok(Math.abs(L.vibratoHz(4) - 6.27) < 0.01);
});

test('clamping', () => {
  assert.equal(L.clampInt(300, 0, 255), 255);
  assert.equal(L.clampInt(-3, 0, 255), 0);
  assert.equal(L.clampInt('12.6', 0, 255), 13);
  assert.equal(L.clampInt('abc', 5, 9), 5);
  assert.equal(L.clampField('pwStep', -500), -128);
  assert.equal(L.clampField('pw', 5000), 4095);
  assert.equal(L.clampField('arp', 200), 96);
  assert.equal(L.clampField('name', 'x'), 'x');
});

test('hex', () => {
  assert.equal(L.hex(10), '0A');
  assert.equal(L.hex(0x800, 4), '0800');
  assert.equal(L.hex(-1), 'FF');
});

test('every preset has legal fields and a hint', () => {
  const names = L.PRESETS.map((p) => p.name);
  assert.deepEqual(names, ['Bass', 'Lead', 'Pad', 'Pluck', 'Kick', 'Snare', 'Hat']);
  for (const p of L.PRESETS) {
    assert.ok(p.hint.length > 10);
    const inst = L.applyPreset(L.blankInstrument('x'), p);
    for (const [k, v] of Object.entries(inst)) {
      if (k === 'name') continue;
      assert.equal(L.clampField(k, v), v, `${p.name}.${k}`);
    }
    assert.equal(inst.wave & 0x09, 0, 'no gate or test bit');
    assert.equal(inst.wave & 0x80 && inst.wave & 0x70, 0, 'no noise mixed with a tone');
    assert.ok(inst.pwMin <= inst.pwMax);
    assert.equal(inst.release, 2);
    assert.equal(L.releaseOf(inst.sr), 0, `${p.name}: the release nibble of sr is not used, so it is 0`);
  }
  assert.equal(L.releaseOf(L.blankInstrument().sr), 0);
});

test('presets are musically what the hints say', () => {
  const get = (n) => L.applyPreset(L.blankInstrument('x'), L.PRESETS.find((p) => p.name === n));
  const kick = get('Kick');
  assert.equal(kick.drumNoise, 1);
  assert.ok(kick.drumFall >= 60);
  assert.equal(kick.wave, 0x10);
  const hat = get('Hat');
  assert.ok(hat.drumNoise >= 1 && hat.drumNoise <= 2);
  assert.equal(hat.drumFall, 0);
  assert.ok(L.decayOf(hat.ad) <= 3);
  assert.equal(hat.wave, 0x80);
  const snare = get('Snare');
  assert.ok(snare.drumNoise >= 2 && snare.drumNoise <= 3);
  assert.ok(snare.drumFall > 0);
  const pluck = get('Pluck');
  assert.equal(L.sustainOf(pluck.sr), 0);
  assert.equal(pluck.drumNoise, 0);
  assert.equal(pluck.wave, 0x40);
  const bass = get('Bass');
  assert.equal(bass.wave, 0x40);
  assert.ok(bass.pwStep !== 0);
  assert.equal(bass.vibDepth, 0);
  const pad = get('Pad');
  assert.ok(L.attackOf(pad.ad) >= 8, 'slow attack');
  assert.ok(pad.vibDelay >= 20 && pad.vibDepth > 0, 'late vibrato');
  const lead = get('Lead');
  assert.equal(lead.wave, 0x40);
  assert.ok(lead.vibDelay > 0 && lead.vibDepth > 0);
  for (const n of ['Bass', 'Lead', 'Pad', 'Pluck']) assert.equal(get(n).drumNoise, 0);
});

test('applyPreset renames only placeholder names and does not change the input', () => {
  const inst = L.blankInstrument('New 05');
  const copy = JSON.stringify(inst);
  const kick = L.applyPreset(inst, L.PRESETS[4]);
  assert.equal(kick.name, 'Kick');
  assert.equal(JSON.stringify(inst), copy);
  assert.equal(L.applyPreset(L.blankInstrument('Deep'), L.PRESETS[0]).name, 'Deep');
});

test('describeDrum', () => {
  assert.match(L.describeDrum({ drumNoise: 0, drumFall: 9 }), /Not a drum/);
  assert.match(L.describeDrum({ drumNoise: 1, drumFall: 0 }), /1 frame of noise.*stays/);
  assert.match(L.describeDrum({ drumNoise: 3, drumFall: 80 }), /3 frames.*falls by 80/);
});

test('instrument list slots', () => {
  const list = [L.blankInstrument('a'), null, L.blankInstrument('c')];
  assert.equal(L.firstFreeSlot(list), 1);
  list[1] = L.blankInstrument('b');
  assert.equal(L.firstFreeSlot(list), 3);
  const full = new Array(256).fill(0).map(() => L.blankInstrument());
  assert.equal(L.firstFreeSlot(full), -1);
  const sparse = [];
  L.setSlot(sparse, 3, L.blankInstrument('x'));
  assert.deepEqual(sparse.map((i) => i && i.name), [null, null, null, 'x']);
  sparse[3] = null;
  L.trimEmptySlots(sparse);
  assert.equal(sparse.length, 0);
  assert.equal(L.copyName('Bass'), 'Bass copy');
  assert.equal(L.copyName('Bass copy'), 'Bass copy');
});

test('instrumentUsage', () => {
  const project = { song: { patterns: [
    { events: [{ type: 'inst', instrument: 2 }, { type: 'note', pitch: 1, length: 1 }, { type: 'inst', instrument: 2 }] },
    { events: [{ type: 'inst', instrument: 3 }] },
    { events: [{ type: 'inst', instrument: 2 }] },
  ] } };
  assert.deepEqual(L.instrumentUsage(project, 2), { count: 3, patterns: [0, 2] });
  assert.deepEqual(L.instrumentUsage(project, 9), { count: 0, patterns: [] });
});

test('piano keys', () => {
  assert.equal(L.pianoPitch('z', 3), 36);
  assert.equal(L.pianoPitch('Z', 3), 36);
  assert.equal(L.pianoPitch('m', 3), 47);
  assert.equal(L.pianoPitch('q', 3), 48);
  assert.equal(L.pianoPitch('u', 3), 59);
  assert.equal(L.pianoPitch('5', 3), 54);
  assert.equal(L.pianoPitch('p', 3), null);
  assert.equal(L.pianoPitch('u', 7), null, 'above the table');
  assert.equal(L.pianoPitch('z', 0), 0);
  assert.equal(L.pitchName(57), 'A-4');
  assert.equal(L.pitchName(0), 'C-0');
  assert.equal(L.pitchName(30), 'F#2');
});
