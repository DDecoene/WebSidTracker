// index.js - the list of built-in demo songs, in the order the Demos menu shows them.
//
// Every demo module exports `info` ({ id, title, composer, note }) and `build()` (a fresh project).
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../../LICENSE).

import { defaultInstrument } from '../project.js';
import * as original from './original.js';
import * as odeToJoy from './ode-to-joy.js';
import * as furElise from './fur-elise.js';
import * as rondoAllaTurca from './rondo-alla-turca.js';
import * as toccata from './toccata.js';
import * as mountainKing from './mountain-king.js';
import * as soundEffects from './sound-effects.js';

// The demos were written before instruments had a slide and projects had sound effects: fill those in.
const complete = (project) => ({
  ...project,
  instruments: project.instruments.map((inst) => (inst ? { ...defaultInstrument(), ...inst } : inst)),
  effects: project.effects ?? [],
});

/** [{ id, title, composer, note, build }], the original tune first: it is what a first visit starts with. */
export const DEMOS = [original, odeToJoy, furElise, rondoAllaTurca, toccata, mountainKing, soundEffects]
  .map((demo) => ({ ...demo.info, build: () => complete(demo.build()) }));

/** The demo with this id, or undefined. */
export function findDemo(id) {
  return DEMOS.find((demo) => demo.id === id);
}

/** The text of a menu entry: "Title - composer". */
export function demoLabel(demo) {
  return `${demo.title} - ${demo.composer}`;
}
