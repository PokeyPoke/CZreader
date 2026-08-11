/**
 * flashcards.js — Leitner review over your saved words.
 *
 * Correct promotes a card one box (1→2→3→4→5, reappearing after 1, 2, 4, 8 and
 * 16 days); wrong drops it straight back to box 1. Making forgetting expensive
 * is the point — a word you failed comes back tomorrow, not in a fortnight.
 */

import { el, icon, render, topbar, emptyState } from './ui.js';
import * as router from './router.js';
import * as dict from './dict.js';
import * as tts from './tts.js';
import { dueWords, upcomingWords, reviewWord, allWords, LEITNER_DAYS } from './store.js';

const MODES = [
  ['cs-en', 'Czech → English'],
  ['en-cs', 'English → Czech'],
  ['audio', 'Listen → meaning'],
];

function nextDueLabel() {
  const upcoming = upcomingWords();
  if (!upcoming.length) return null;
  const ms = allWords()[upcoming[0]].due - Date.now();
  const days = Math.ceil(ms / 86400000);
  return days <= 1 ? 'tomorrow' : `in ${days} days`;
}

export async function flashcardsScreen() {
  await tts.init();

  const queue = dueWords();

  if (!queue.length) {
    const total = Object.keys(allWords()).length;
    const next = nextDueLabel();
    render(
      el('div.screen', {}, [
        topbar('Practice', () => router.navigate('/')),
        total
          ? emptyState(
              next
                ? `Nothing due right now — the next card comes round ${next}. Spacing the reviews out is what makes them stick.`
                : 'Nothing due right now.',
              'Back to the stories',
              () => router.navigate('/')
            )
          : emptyState(
              'No saved words yet. Tap words while reading and mark them New or Learning — they become flashcards automatically.',
              'Go to the stories',
              () => router.navigate('/')
            ),
      ])
    );
    return;
  }

  // Audio mode only makes sense when the device can actually speak Czech.
  const modes = MODES.filter(([key]) => key !== 'audio' || tts.isAvailable());
  let mode = modes[0][0];
  let index = 0;
  let flipped = false;
  let correct = 0;

  const stage = el('div.card-stage');
  const progress = el('p.card-progress');
  const actions = el('div');
  const modeRow = el('div.filter-row', { role: 'group', 'aria-label': 'Card mode' });

  function currentLemma() { return queue[index]; }

  function finishSession() {
    render(
      el('div.screen', {}, [
        topbar('Practice', () => router.navigate('/')),
        el('div.masthead', {}, [
          el('p.kicker', { text: 'Session complete' }),
          el('h1', { html: `${correct}/${queue.length}<em>.</em>` }),
        ]),
        el('div.notice', {}, [
          el('p', {
            text: correct === queue.length
              ? 'Every card correct. Those words move to a longer interval and will come back later.'
              : 'The ones you missed return tomorrow; the rest move to a longer interval.',
          }),
        ]),
        el('button.btn.btn--block', {
          text: 'Done',
          on: { click: () => router.navigate('/saved') },
        }),
      ])
    );
  }

  function answer(wasCorrect) {
    reviewWord(currentLemma(), wasCorrect);
    if (wasCorrect) correct++;
    index++;
    flipped = false;
    if (index >= queue.length) finishSession();
    else paint();
  }

  function paintModes() {
    modeRow.replaceChildren(
      ...modes.map(([key, label]) =>
        el('button.chip', {
          'aria-pressed': key === mode ? 'true' : 'false',
          text: label,
          on: {
            click: () => {
              mode = key;
              flipped = false;
              paintModes();
              paint();
            },
          },
        })
      )
    );
  }

  function paint() {
    const lemma = currentLemma();
    const entry = dict.entryOf(lemma);
    const word = allWords()[lemma];

    progress.textContent = `Card ${index + 1} of ${queue.length} · Box ${word.box || 1} of ${LEITNER_DAYS.length - 1}`;

    const front = [];
    if (mode === 'cs-en') {
      front.push(el('h2.card-face', { text: lemma, lang: 'cs' }));
    } else if (mode === 'en-cs') {
      front.push(el('h2.card-face', {
        text: entry ? entry.translation : lemma,
        style: 'font-size:clamp(1.5rem,8vw,2.4rem)',
      }));
    } else {
      front.push(
        el('button.play-btn', {
          style: 'width:76px;height:76px',
          html: icon('speaker'),
          'aria-label': 'Play the word',
          on: { click: () => tts.speak(lemma) },
        })
      );
      if (!flipped) tts.speak(lemma);
    }

    const back = [];
    if (flipped) {
      if (mode === 'cs-en') {
        back.push(el('p.card-back', { text: entry ? entry.translation : '—' }));
      } else {
        back.push(el('p.card-back', { text: lemma, lang: 'cs', style: 'color:var(--ink)' }));
        if (entry && mode === 'audio') {
          back.push(el('p.card-back', { text: entry.translation }));
        }
      }
      if (entry && entry.phonetic) {
        back.push(el('p.card-hint', { text: entry.phonetic, style: 'color:var(--brass)' }));
      }
    } else {
      back.push(el('p.card-hint', { text: 'Tap to reveal' }));
    }

    stage.replaceChildren(...front, ...back);

    actions.replaceChildren(
      flipped
        ? el('div.answer-row', {}, [
            el('button.btn.btn--ghost', {
              text: 'Again',
              on: { click: () => answer(false) },
            }),
            el('button.btn.btn--carmine', {
              html: `${icon('check')}<span>Got it</span>`,
              on: { click: () => answer(true) },
            }),
          ])
        : el('button.btn.btn--block', {
            text: 'Reveal',
            on: { click: () => { flipped = true; paint(); } },
          })
    );
  }

  stage.addEventListener('click', (e) => {
    if (flipped || e.target.closest('button')) return;
    flipped = true;
    paint();
  });

  paintModes();
  paint();

  render(
    el('div.screen', {}, [
      topbar('Practice', () => { tts.cancel(); router.navigate('/'); }),
      modeRow,
      progress,
      stage,
      actions,
    ])
  );
}
