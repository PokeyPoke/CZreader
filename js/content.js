/**
 * content.js — loads stories and computes the personalised difficulty readout.
 *
 * The readout is the honest answer to "can I read this one?": it counts how
 * many of the story's words you have already marked known, which is far more
 * informative than the CEFR letter on the tab. It sharpens as you use the app.
 */

import { tokenize, normalize } from './tokenizer.js';
import * as dict from './dict.js';
import { allWords, STATUS } from './store.js';

export const LEVELS = ['A1', 'A2', 'B1'];

export const LEVEL_BLURB = {
  A1: 'Present tense, everyday vocabulary, short sentences. Sentence translations on by default.',
  A2: 'Past and future tense, more cases, longer sentences. Translations still one tap away.',
  B1: 'Aspect pairs, conditional mood, relative clauses and idiom. Translations off by default — try the Czech first.',
};

/** Whether sentence translations start visible at this level. */
export function translationsDefaultOn(level) {
  return level !== 'B1';
}

let catalog = null;
const storyCache = new Map();

export async function loadCatalog() {
  if (catalog) return catalog;
  const res = await fetch('data/stories/index.json');
  if (!res.ok) throw new Error(`story index returned ${res.status}`);
  catalog = await res.json();
  return catalog;
}

export function catalogSync() {
  return catalog || [];
}

export function storyMeta(id) {
  return (catalog || []).find((s) => s.id === id) || null;
}

export async function loadStory(id) {
  if (storyCache.has(id)) return storyCache.get(id);
  const meta = storyMeta(id);
  if (!meta) throw new Error(`Unknown story: ${id}`);
  const res = await fetch(meta.file);
  if (!res.ok) throw new Error(`${meta.file} returned ${res.status}`);
  const story = await res.json();
  storyCache.set(id, story);
  return story;
}

export function storiesAtLevel(level) {
  return (catalog || []).filter((s) => s.level === level);
}

/**
 * Fraction of a story's running words you already know.
 *
 * Counted by token, not by unique word: knowing "a", "v" and "je" genuinely
 * does make a page easier to read, and weighting by frequency reflects the
 * actual reading experience. Words missing from the dictionary count as
 * unknown, which is the conservative direction to err in.
 *
 * @param {string[]} lemmasPerToken
 * @returns {{known:number, total:number, pct:number, band:string}}
 */
export function comprehension(lemmasPerToken) {
  const words = allWords();
  const total = lemmasPerToken.length;
  if (!total) return { known: 0, total: 0, pct: 0, band: 'hard' };

  let known = 0;
  for (const lemma of lemmasPerToken) {
    if (lemma && words[lemma] && words[lemma].status === STATUS.KNOWN) known++;
  }
  const pct = Math.round((known / total) * 100);
  return { known, total, pct, band: band(pct) };
}

/**
 * The rule of thumb shown next to the bar. Above ~90% reads comfortably;
 * 70-90% is the productive stretch where most learning happens; below that
 * you are looking up nearly every word.
 */
export function band(pct) {
  if (pct >= 90) return 'comfortable';
  if (pct >= 70) return 'stretch';
  return 'hard';
}

export const BAND_LABEL = {
  comfortable: 'Comfortable',
  stretch: 'Good stretch',
  hard: 'Hard',
};

/**
 * Every running word of a story, resolved to its lemma (null when the word is
 * not in the dictionary). Cached on the catalog entry — tokenizing eight
 * stories on every home-screen render would be wasteful.
 */
export async function storyLemmas(id) {
  const meta = storyMeta(id);
  if (meta && meta._lemmas) return meta._lemmas;

  const story = await loadStory(id);
  const lemmas = [];
  for (const s of story.sentences) {
    for (const t of tokenize(s.cs)) {
      if (t.type === 'word') lemmas.push(dict.lemmaOf(normalize(t.text)));
    }
  }
  if (meta) meta._lemmas = lemmas;
  return lemmas;
}

/** Comprehension for every story, computed once for the home screen. */
export async function allComprehension() {
  const out = {};
  for (const meta of catalog || []) {
    out[meta.id] = comprehension(await storyLemmas(meta.id));
  }
  return out;
}
