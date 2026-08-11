/**
 * dict.js — the bundled Czech dictionary.
 *
 * Czech is heavily inflected: "vstává", "vstávám" and "vstávej" are all the
 * same word. Storing a status against each surface form would mean marking the
 * same word known a dozen times, so everything is keyed by *lemma* (dictionary
 * headword).
 *
 * The surface-form index is DERIVED, not authored. Every form written in a
 * lemma's declension or conjugation table automatically resolves back to that
 * lemma, so the tables shown in the word panel and the lookup index can never
 * drift apart. Only forms that do not belong in a table — irregular or
 * suppletive ones — need listing explicitly under `extra`.
 *
 * The dictionary is split into parts so it stays editable; they are fetched in
 * parallel and merged at load.
 */

import { normalize } from './tokenizer.js';

let lemmas = null;
let forms = null;
let loading = null;

/** Every surface form inside an entry's tables, plus any `extra` forms. */
export function surfaceFormsOf(entry) {
  const out = [];
  for (const table of Object.values(entry.forms || {})) {
    if (typeof table === 'string') out.push(table);
    else if (table && typeof table === 'object') out.push(...Object.values(table));
  }
  out.push(...(entry.extra || []));
  // An em dash marks a cell that has no form (pronouns have no vocative). It is
  // worth showing in the table but must never enter the lookup index.
  return out.filter((f) => typeof f === 'string' && f && f !== '—');
}

/**
 * Build the lookup index. When two lemmas claim the same surface form (Czech
 * has plenty: "je" is both "is" and "them"), the first one wins — parts are
 * ordered so the more frequent word is registered first.
 * @returns {string[]} collisions, for the content checker to report
 */
export function buildIndex(lemmaMap) {
  const index = Object.create(null);
  const collisions = [];

  for (const [lemma, entry] of Object.entries(lemmaMap)) {
    index[normalize(lemma)] = index[normalize(lemma)] || lemma;
  }
  for (const [lemma, entry] of Object.entries(lemmaMap)) {
    for (const form of surfaceFormsOf(entry)) {
      const key = normalize(form);
      if (index[key] && index[key] !== lemma) {
        collisions.push(`"${form}" claimed by both ${index[key]} and ${lemma}`);
        continue;
      }
      index[key] = lemma;
    }
  }
  return { index, collisions };
}

export function load() {
  if (lemmas) return Promise.resolve(lemmas);
  if (loading) return loading;

  loading = fetch('data/dictionary.json')
    .then((res) => {
      if (!res.ok) throw new Error(`dictionary.json returned ${res.status}`);
      return res.json();
    })
    .then((manifest) =>
      Promise.all(
        manifest.parts.map((file) =>
          fetch(file).then((res) => {
            if (!res.ok) throw new Error(`${file} returned ${res.status}`);
            return res.json();
          })
        )
      )
    )
    .then((parts) => {
      const merged = {};
      for (const part of parts) Object.assign(merged, part.lemmas);
      lemmas = merged;
      forms = buildIndex(merged).index;
      loading = null;
      return lemmas;
    })
    .catch((err) => {
      loading = null;
      throw err;
    });

  return loading;
}

export function isLoaded() {
  return lemmas !== null;
}

/** The lemma a surface form belongs to, or null if it is not in the dictionary. */
export function lemmaOf(surface) {
  if (!forms) return null;
  return forms[normalize(surface)] || null;
}

/**
 * Full entry for a surface form.
 * @returns {{lemma:string, surface:string, entry:object}|null}
 */
export function lookup(surface) {
  const lemma = lemmaOf(surface);
  if (!lemma) return null;
  return { lemma, surface: normalize(surface), entry: lemmas[lemma] };
}

export function entryOf(lemma) {
  return lemmas ? lemmas[lemma] || null : null;
}

export function allLemmas() {
  return lemmas ? Object.keys(lemmas) : [];
}

/**
 * How the word panel should render an entry, driven by part of speech.
 * Nouns and adjectives decline by case; verbs conjugate by person and tense.
 */
export function tableShape(entry) {
  if (!entry || !entry.forms) return 'none';
  if (entry.pos === 'verb') return 'verb';
  if (['noun', 'adjective', 'pronoun', 'numeral'].includes(entry.pos)) return 'declension';
  return 'simple';
}
