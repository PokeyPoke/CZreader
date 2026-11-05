/**
 * flashcards.js — Leitner review over your saved words, in context.
 *
 * Grading: Again drops a card to box 1 (it returns tomorrow); Good promotes one
 * box; Easy promotes two. Boxes reappear after 1, 2, 4, 8, 16 and 32 days, and
 * passing a card in the top box graduates the word to Known.
 *
 * Every card carries the sentence you first met the word in (or, failing
 * that, one from the stories). Words are remembered far better in context, and
 * the sentence shows the inflected form actually used — the thing you need
 * for reading.
 *
 * Cards you miss come round again at the end of the session until you get
 * them, so a session always ends on a successful recall. Only the first answer
 * moves the Leitner box.
 */

import { el, icon, esc, render, topbar, emptyState } from './ui.js';
import * as router from './router.js';
import * as dict from './dict.js';
import * as tts from './tts.js';
import * as content from './content.js';
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

/** Escape a sentence and wrap the first occurrence of `surface` in `wrap`. */
function markSurface(cs, surface, wrap) {
  const i = cs.indexOf(surface);
  if (i < 0) return esc(cs);
  return esc(cs.slice(0, i)) + wrap(esc(surface)) + esc(cs.slice(i + surface.length));
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
                ? `Nothing due right now — the next card comes round ${next}. Spacing the reviews out is what makes them stick. Reading a new story is the best use of the time.`
                : 'Nothing due right now.',
              'Back to the stories',
              () => router.navigate('/')
            )
          : emptyState(
              'No saved words yet. Look up words while reading — they are saved automatically and become flashcards.',
              'Go to the stories',
              () => router.navigate('/')
            ),
      ])
    );
    return;
  }

  // Sentences for cards saved before context was recorded, or from screens
  // that don't supply one, come from the stories instead.
  const missing = queue.filter((l) => !allWords()[l]?.ctx);
  const found = missing.length ? await content.findSentences(missing) : new Map();
  const contextOf = (lemma) => allWords()[lemma]?.ctx || found.get(lemma) || null;

  // Audio mode only makes sense when the device can actually speak Czech.
  const modes = MODES.filter(([key]) => key !== 'audio' || tts.isAvailable());
  let mode = modes[0][0];
  let flipped = false;

  const firstTotal = queue.length;
  const answered = new Set(); // lemmas whose box has already moved this session
  let firstTryCorrect = 0;
  const graduated = [];
  let pos = 0;

  const stage = el('div.card-stage');
  const progress = el('p.card-progress');
  const actions = el('div');
  const modeRow = el('div.filter-row', { role: 'group', 'aria-label': 'Card mode' });

  function currentLemma() { return queue[pos]; }

  function finishSession() {
    const missed = firstTotal - firstTryCorrect;
    render(
      el('div.screen', {}, [
        topbar('Practice', () => router.navigate('/')),
        el('div.masthead', {}, [
          el('p.kicker', { text: 'Session complete' }),
          el('h1', { html: `${firstTryCorrect}/${firstTotal}<em>.</em>` }),
        ]),
        el('div.notice', {}, [
          el('p', {
            text: missed
              ? `You recalled ${firstTryCorrect} first time and went back over the ${missed} you missed until they stuck. Those return tomorrow; the rest move to longer intervals.`
              : 'Every card right first time. Those words move to longer intervals.',
          }),
          graduated.length
            ? el('p', {
                html: `<strong>Graduated to Known:</strong> ${graduated.map((l) => `<span lang="cs">${esc(l)}</span>`).join(', ')}`,
              })
            : null,
        ]),
        el('button.btn.btn--block', {
          text: 'Read a story',
          on: { click: () => router.navigate('/') },
        }),
        el('button.btn.btn--ghost.btn--block', {
          text: 'See your words',
          style: 'margin-top:10px',
          on: { click: () => router.navigate('/saved') },
        }),
      ])
    );
  }

  function answer(grade) {
    const lemma = currentLemma();
    if (!answered.has(lemma)) {
      answered.add(lemma);
      const result = reviewWord(lemma, grade);
      if (grade !== 'again') firstTryCorrect++;
      if (result && result.graduated) graduated.push(lemma);
    }
    // A miss goes to the back of the queue: you see it again this session,
    // after a gap long enough to make the retrieval a real test.
    if (grade === 'again') queue.push(lemma);

    pos++;
    flipped = false;
    if (pos >= queue.length) finishSession();
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

  /** The context sentence: gapped on the front of en→cs, highlighted elsewhere. */
  function contextBlock(lemma, { gap, showEnglish }) {
    const ctx = contextOf(lemma);
    if (!ctx) return null;
    const surface = ctx.surface || lemma;
    const html = gap
      ? markSurface(ctx.cs, surface, () => '<span class="card-gap">_____</span>')
      : markSurface(ctx.cs, surface, (s) => `<mark>${s}</mark>`);
    return el('div.card-context', {}, [
      el('p.card-context-cs', { html, lang: 'cs' }),
      showEnglish && ctx.en ? el('p.card-context-en', { text: ctx.en }) : null,
    ]);
  }

  function paint() {
    const lemma = currentLemma();
    const entry = dict.entryOf(lemma);
    const word = allWords()[lemma];
    const retry = answered.has(lemma);
    const remaining = queue.length - pos;

    progress.textContent = retry
      ? `Again · ${remaining} left`
      : `${remaining} left · Box ${word.box || 1} of ${LEITNER_DAYS.length - 1}`;

    const front = [];
    if (mode === 'cs-en') {
      front.push(el('h2.card-face', { text: lemma, lang: 'cs' }));
      front.push(contextBlock(lemma, { gap: false, showEnglish: flipped }));
    } else if (mode === 'en-cs') {
      front.push(el('h2.card-face', {
        text: entry ? entry.translation : lemma,
        style: 'font-size:clamp(1.5rem,8vw,2.4rem)',
      }));
      // Front: the Czech sentence with the word gapped and its translation, so
      // you produce the right *form*, not just the headword.
      front.push(contextBlock(lemma, { gap: !flipped, showEnglish: true }));
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
      if (flipped) front.push(contextBlock(lemma, { gap: false, showEnglish: true }));
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
      back.push(el('p.card-hint', { text: 'Say it before you reveal' }));
    }

    stage.replaceChildren(...front.filter(Boolean), ...back);

    actions.replaceChildren(
      flipped
        ? el('div.answer-row.answer-row--3', {}, [
            el('button.btn.btn--ghost', {
              text: 'Again',
              on: { click: () => answer('again') },
            }),
            el('button.btn.btn--carmine', {
              html: `${icon('check')}<span>Good</span>`,
              on: { click: () => answer('good') },
            }),
            el('button.btn.btn--ghost', {
              text: 'Easy',
              // On a retry the box has already moved; Easy and Good mean the same.
              on: { click: () => answer(retry ? 'good' : 'easy') },
            }),
          ])
        : el('button.btn.btn--block', {
            text: 'Reveal',
            on: {
              click: () => {
                flipped = true;
                paint();
                // Hearing the word on reveal ties sound to spelling.
                if (mode !== 'audio') tts.speak(lemma);
              },
            },
          })
    );
  }

  stage.addEventListener('click', (e) => {
    if (flipped || e.target.closest('button')) return;
    flipped = true;
    paint();
    if (mode !== 'audio') tts.speak(currentLemma());
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
