/**
 * saved.js — your personal word list.
 *
 * The launch point for both practice modes: flashcards and printable worksheets.
 */

import { el, render, topbar, emptyState } from './ui.js';
import * as router from './router.js';
import * as dict from './dict.js';
import * as wordpanel from './wordpanel.js';
import { allWords, dueWords, STATUS } from './store.js';

const FILTERS = [
  ['active', 'Learning', (w) => w.status !== STATUS.KNOWN],
  ['new', 'New', (w) => w.status === STATUS.NEW],
  ['learning', 'In progress', (w) => w.status === STATUS.LEARNING],
  ['known', 'Known', (w) => w.status === STATUS.KNOWN],
  ['all', 'All', () => true],
];

const SORTS = [
  ['recent', 'Newest', (a, b) => b[1].added - a[1].added],
  ['alpha', 'A–Z', (a, b) => a[0].localeCompare(b[0], 'cs')],
  ['due', 'Due first', (a, b) => (a[1].due || 0) - (b[1].due || 0)],
];

function dueLabel(word) {
  if (word.status === STATUS.KNOWN) return 'Known';
  const ms = (word.due || 0) - Date.now();
  if (ms <= 0) return 'Due';
  const days = Math.ceil(ms / 86400000);
  return days === 1 ? '1 day' : `${days} days`;
}

export function savedScreen() {
  let filterKey = 'active';
  let sortKey = 'recent';
  let query = '';

  const list = el('div');
  const count = el('p.section-head');
  const filterRow = el('div.filter-row', { role: 'group', 'aria-label': 'Filter' });
  const sortRow = el('div.filter-row', { role: 'group', 'aria-label': 'Sort' });

  const search = el('input.search', {
    type: 'search',
    placeholder: 'Search Czech or English…',
    'aria-label': 'Search your saved words',
    on: {
      input: (e) => { query = e.target.value.trim().toLocaleLowerCase('cs-CZ'); paint(); },
    },
  });

  function matches(lemma, entry) {
    if (!query) return true;
    return lemma.includes(query)
      || (entry && entry.translation.toLowerCase().includes(query));
  }

  function paint() {
    const words = allWords();
    const filter = FILTERS.find((f) => f[0] === filterKey)[2];
    const sort = SORTS.find((s) => s[0] === sortKey)[2];

    const rows = Object.entries(words)
      .filter(([lemma, w]) => filter(w) && matches(lemma, dict.entryOf(lemma)))
      .sort(sort);

    filterRow.replaceChildren(
      ...FILTERS.map(([key, label]) =>
        el('button.chip', {
          'aria-pressed': key === filterKey ? 'true' : 'false',
          text: label,
          on: { click: () => { filterKey = key; paint(); } },
        })
      )
    );
    sortRow.replaceChildren(
      ...SORTS.map(([key, label]) =>
        el('button.chip', {
          'aria-pressed': key === sortKey ? 'true' : 'false',
          text: label,
          on: { click: () => { sortKey = key; paint(); } },
        })
      )
    );

    count.textContent = rows.length === 1 ? '1 word' : `${rows.length} words`;

    if (!rows.length) {
      list.replaceChildren(
        Object.keys(words).length
          ? emptyState('No words match that filter.')
          : emptyState(
              'No saved words yet. Tap any word while reading a story and mark it New or Learning — it will appear here, ready for flashcards and worksheets.',
              'Go to the stories',
              () => router.navigate('/')
            )
      );
      return;
    }

    list.replaceChildren(
      ...rows.map(([lemma, word]) => {
        const entry = dict.entryOf(lemma);
        return el('button.word-row', {
          on: {
            click: () => wordpanel.show(lemma, { onChange: paint, onClose: paint }),
          },
        }, [
          el('span.word-dot', { 'data-status': String(word.status) }),
          el('span.word-row-main', {}, [
            el('span.word-row-cs', { text: lemma, lang: 'cs' }),
            el('span.word-row-en', { text: entry ? entry.translation : '—' }),
          ]),
          el('span.word-row-box', { text: dueLabel(word) }),
        ]);
      })
    );
  }

  paint();

  const due = dueWords().length;
  const total = Object.keys(allWords()).length;

  render(
    el('div.screen', {}, [
      topbar('Saved words', () => router.navigate('/')),

      total
        ? el('div.tile-row', {}, [
            el('button.tile', {
              on: { click: () => router.navigate('/cards') },
            }, [
              el('span.tile-count', { text: String(due) }),
              el('span', {}, [
                el('span.tile-label', { text: 'Flashcards' }),
                el('span.tile-sub', { text: due ? 'Due now' : 'Nothing due' }),
              ]),
            ]),
            el('button.tile', {
              on: { click: () => router.navigate('/worksheet') },
            }, [
              el('span.tile-label', { text: 'Worksheet' }),
              el('span.tile-sub', { text: 'Print and practise by hand' }),
            ]),
          ])
        : null,

      total ? search : null,
      total ? filterRow : null,
      total ? sortRow : null,
      count,
      list,
    ])
  );
}
