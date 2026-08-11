/**
 * placement.js — the optional starting-level check.
 *
 * Two jobs, and the second matters more than the first: it suggests a level,
 * and it seeds your word list so the home screen's "you know N% of this story"
 * readouts are meaningful immediately instead of reading 0% everywhere.
 *
 * Nothing is ever locked by the result. It is a suggestion.
 */

import { el, render, toast } from './ui.js';
import * as router from './router.js';
import * as dict from './dict.js';
import { LEVELS } from './content.js';
import { setStatus, setSetting, STATUS } from './store.js';

/** Fraction of a level's words you must know for it to be suggested. */
const THRESHOLD = 0.6;

function suggestLevel(answers) {
  const byLevel = {};
  for (const { level, known } of answers) {
    byLevel[level] = byLevel[level] || { known: 0, total: 0 };
    byLevel[level].total++;
    if (known) byLevel[level].known++;
  }
  // Walk down from the hardest level and take the first one you comfortably pass.
  for (const level of [...LEVELS].reverse()) {
    const s = byLevel[level];
    if (s && s.total && s.known / s.total >= THRESHOLD) return level;
  }
  return LEVELS[0];
}

function finish(answers) {
  for (const { lemma, known } of answers) {
    // Only "known" is recorded. A word you did not recognise here is not yet a
    // word you have chosen to study — that choice belongs to you, in a story.
    if (known) setStatus(lemma, STATUS.KNOWN);
  }

  const level = suggestLevel(answers);
  setSetting('placementDone', true);
  setSetting('suggestedLevel', level);

  const knownCount = answers.filter((a) => a.known).length;

  render(
    el('div.screen', {}, [
      el('div.masthead', {}, [
        el('p.kicker', { text: 'Placement check' }),
        el('h1', { html: `Start at<br><em>${level}</em>` }),
      ]),
      el('div.notice', {}, [
        el('p', {
          html: `You knew <strong>${knownCount} of ${answers.length}</strong> words. Those are now marked known, so each story shows how much of it you can already read.`,
        }),
        el('p', {
          text: 'This is only a suggestion. Every level is open — if A1 feels easy, go straight to A2 or B1 and see how the percentages look.',
        }),
      ]),
      el('button.btn.btn--carmine.btn--block', {
        text: `Read the ${level} stories`,
        on: { click: () => router.navigate('/') },
      }),
    ])
  );
}

export async function placementScreen() {
  let words;
  try {
    const res = await fetch('data/placement.json');
    if (!res.ok) throw new Error(`placement.json returned ${res.status}`);
    words = await res.json();
  } catch (err) {
    console.error(err);
    toast('Could not load the placement check.');
    router.navigate('/', { replace: true });
    return;
  }

  const answers = [];
  let index = 0;

  const stage = el('div.card-stage');
  const progress = el('p.card-progress');

  function answer(known) {
    answers.push({ ...words[index], known });
    index++;
    if (index >= words.length) finish(answers);
    else paint();
  }

  function paint() {
    const item = words[index];
    const entry = dict.entryOf(item.lemma);
    progress.textContent = `${index + 1} of ${words.length}`;
    stage.replaceChildren(
      el('p.card-hint', { text: 'Do you know this word?' }),
      el('h2.card-face', { text: item.lemma, lang: 'cs' }),
      entry ? el('p.card-hint', { text: entry.pos }) : null
    );
  }

  paint();

  render(
    el('div.screen', {}, [
      el('div.topbar', {}, [
        el('h2', { text: 'Placement check' }),
        el('button.btn.btn--ghost', {
          text: 'Skip',
          style: 'min-height:40px;padding:8px 14px;font-size:0.85rem',
          on: {
            click: () => {
              setSetting('placementDone', true);
              router.navigate('/');
            },
          },
        }),
      ]),

      el('div.notice', {}, [
        el('p', {
          text: 'Tap through these words and say honestly whether you know each one. It takes a minute, suggests a starting level, and — more usefully — teaches the app what you already know so every story can show how much of it you can read.',
        }),
      ]),

      progress,
      stage,

      el('div.answer-row', {}, [
        el('button.btn.btn--ghost', {
          text: "Don't know",
          on: { click: () => answer(false) },
        }),
        el('button.btn.btn--carmine', {
          text: 'I know it',
          on: { click: () => answer(true) },
        }),
      ]),
    ])
  );
}
