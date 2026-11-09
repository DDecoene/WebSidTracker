// index.js - the list of built-in demo songs, in the order the Demos menu shows them.
//
// Every demo module exports `info` ({ id, title, composer, note }) and `build()` (a fresh project).
// The original tune lives in project.js; it gets its info here.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import { demoProject } from '../project.js';
import * as odeToJoy from './ode-to-joy.js';
import * as furElise from './fur-elise.js';
import * as rondoAllaTurca from './rondo-alla-turca.js';
import * as toccata from './toccata.js';
import * as mountainKing from './mountain-king.js';

const original = {
  info: {
    id: 'original',
    title: 'Original demo tune',
    composer: 'WebSidTracker',
    note: 'A 16-bar tune in A minor with bass, lead and drums, built from a few small patterns that are reused with transposition.',
  },
  build: demoProject,
};

/** [{ id, title, composer, note, build }], Ode to Joy first as the friendly starter. */
export const DEMOS = [odeToJoy, furElise, rondoAllaTurca, toccata, mountainKing, original]
  .map((demo) => ({ ...demo.info, build: demo.build }));

/** The demo with this id, or undefined. */
export function findDemo(id) {
  return DEMOS.find((demo) => demo.id === id);
}

/** The text of a menu entry: "Title - composer". */
export function demoLabel(demo) {
  return `${demo.title} - ${demo.composer}`;
}
