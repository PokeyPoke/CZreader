/**
 * worksheets.js — printable practice sheets built from your saved words.
 *
 * The screen has two states: a builder (pick words, pick exercises) and the
 * generated sheet itself. The sheet is rendered as ordinary DOM and printed via
 * css/print.css — no PDF library, and iOS Safari's print dialog can save it to
 * Files.
 */

import { el, render, topbar, toast, icon } from './ui.js';
import * as router from './router.js';
import * as dict from './dict.js';
import * as content from './content.js';
import { tokenize, normalize } from './tokenizer.js';
import { allWords, dueWords, STATUS } from './store.js';

const SOURCES = [
  ['active', 'All learning', (w) => w.status !== STATUS.KNOWN],
  ['new', 'New only', (w) => w.status === STATUS.NEW],
  ['due', 'Due for review', null], // handled specially
  ['all', 'Everything', () => true],
];

const EXERCISES = [
  ['translate', 'Translation drill', 'Czech to English, then English to Czech.'],
  ['gaps', 'Fill in the blank', 'Real sentences from the stories, with a word bank.'],
  ['tables', 'Case & conjugation grids', 'Blank tables to fill in by hand.'],
  ['match', 'Matching & handwriting', 'Draw lines, then practise the diacritics.'],
];

const CASES = [
  ['nom', '1. Nominative (kdo? co?)'],
  ['gen', '2. Genitive (koho? čeho?)'],
  ['dat', '3. Dative (komu? čemu?)'],
  ['acc', '4. Accusative (koho? co?)'],
  ['voc', '5. Vocative'],
  ['loc', '6. Locative (o kom? o čem?)'],
  ['ins', '7. Instrumental (kým? čím?)'],
];

const PERSONS = ['já', 'ty', 'on/ona/ono', 'my', 'vy', 'oni'];

/** Fisher-Yates, so the matching column order is genuinely scrambled. */
function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Find one story sentence containing each lemma, so the gap-fill uses Czech the
 * user has actually read rather than invented example sentences.
 * @returns {Promise<Map<string, {cs:string, en:string, surface:string}>>}
 */
async function findSentences(lemmas) {
  const wanted = new Set(lemmas);
  const found = new Map();

  for (const meta of content.catalogSync()) {
    if (found.size === wanted.size) break;
    let story;
    try {
      story = await content.loadStory(meta.id);
    } catch {
      continue; // a missing story should not sink the whole worksheet
    }
    for (const sentence of story.sentences) {
      for (const token of tokenize(sentence.cs)) {
        if (token.type !== 'word') continue;
        const lemma = dict.lemmaOf(normalize(token.text));
        if (!lemma || !wanted.has(lemma) || found.has(lemma)) continue;
        found.set(lemma, { cs: sentence.cs, en: sentence.en, surface: token.text });
      }
    }
  }
  return found;
}

/* ------------------------------------------------------------- exercises */

function translationDrill(rows) {
  const csToEn = el('table.ws-pairs');
  const enToCs = el('table.ws-pairs');
  for (const [lemma, entry] of rows) {
    csToEn.append(el('tr', {}, [el('td', { text: lemma, lang: 'cs' }), el('td', { html: '&nbsp;' })]));
    enToCs.append(el('tr', {}, [el('td', { text: entry.translation }), el('td', { html: '&nbsp;' })]));
  }
  return [
    el('section.ws-section', {}, [
      el('h2', { text: '1. Czech → English' }),
      el('p.ws-instruction', { text: 'Write the English meaning on the line.' }),
      csToEn,
    ]),
    el('section.ws-section', {}, [
      el('h2', { text: '2. English → Czech' }),
      el('p.ws-instruction', { text: 'Write the Czech word, with all its diacritics.' }),
      enToCs,
    ]),
  ];
}

function gapFill(rows, sentences) {
  const usable = rows.filter(([lemma]) => sentences.has(lemma));
  if (!usable.length) return [];

  const bank = el('div.ws-bank', {}, [
    el('strong', { text: 'Word bank' }),
    ...shuffle(usable.map(([lemma]) => lemma)).map((w) => el('span', { text: w, lang: 'cs' })),
  ]);

  const items = el('div');
  usable.forEach(([lemma], i) => {
    const { cs, en, surface } = sentences.get(lemma);
    // Blank out the inflected form as it appears, so the learner must supply
    // the right ending — not just the dictionary headword.
    const gapped = cs.replace(surface, '____________');
    items.append(
      el('p.ws-gap', {}, [
        el('span', { text: `${i + 1}. ` }),
        el('span', { html: gapped.replace('____________', '<span class="blank"></span>'), lang: 'cs' }),
        el('span.en', { text: en }),
      ])
    );
  });

  return [
    el('section.ws-section', {}, [
      el('h2', { text: '3. Fill in the blank' }),
      el('p.ws-instruction', {
        text: 'Each sentence is from a story you have read. Put the missing word in — in the correct form.',
      }),
      bank,
      items,
    ]),
  ];
}

function tables(rows) {
  const out = [];

  for (const [lemma, entry] of rows) {
    if (!entry.forms) continue;

    if (entry.pos === 'noun' || entry.pos === 'adjective') {
      const table = el('table.ws-grid', {}, [
        el('caption', { text: `${lemma} — ${entry.translation}` }),
      ]);
      const head = el('tr', {}, [
        el('th', { text: 'Case' }),
        el('th', { text: 'Singular', style: 'width:33%' }),
        el('th', { text: 'Plural', style: 'width:33%' }),
      ]);
      table.append(head);
      for (const [key, label] of CASES) {
        table.append(el('tr', {}, [
          el('th', { text: label }),
          el('td'),
          el('td'),
        ]));
      }
      out.push(table);
    } else if (entry.pos === 'verb' && entry.forms.present) {
      const table = el('table.ws-grid', {}, [
        el('caption', { text: `${lemma} — ${entry.translation}` }),
      ]);
      table.append(el('tr', {}, [
        el('th', { text: 'Person' }),
        el('th', { text: 'Present', style: 'width:33%' }),
        el('th', { text: 'Past', style: 'width:33%' }),
      ]));
      for (const person of PERSONS) {
        table.append(el('tr', {}, [el('th', { text: person }), el('td'), el('td')]));
      }
      out.push(table);
    }
  }

  if (!out.length) return [];
  return [
    el('section.ws-section.ws-break', {}, [
      el('h2', { text: '4. Case & conjugation grids' }),
      el('p.ws-instruction', {
        text: 'Fill in every form from memory. Check against the answer key at the end.',
      }),
      ...out,
    ]),
  ];
}

function matchAndTrace(rows) {
  const czech = rows.map(([lemma]) => lemma);
  const english = shuffle(rows.map(([, entry]) => entry.translation));

  const match = el('section.ws-section', {}, [
    el('h2', { text: '5. Matching' }),
    el('p.ws-instruction', { text: 'Draw a line from each Czech word to its English meaning.' }),
    el('div.ws-match', {}, [
      el('ol', {}, czech.map((w) => el('li', { text: w, lang: 'cs' }))),
      el('ol', {}, english.map((w) => el('li', { text: w }))),
    ]),
  ]);

  // Handwriting: prioritise words carrying the letters that are hardest to
  // write from memory.
  const diacritic = /[áčďéěíňóřšťúůýž]/i;
  const trace = rows
    .filter(([lemma]) => diacritic.test(lemma))
    .slice(0, 8)
    .map(([lemma, entry]) =>
      el('div.ws-trace', {}, [
        el('div.label', { text: entry.translation }),
        el('div.model', { text: `${lemma}   ${lemma}   ${lemma}`, lang: 'cs' }),
        el('div.line'),
        el('div.line'),
      ])
    );

  const sections = [match];
  if (trace.length) {
    sections.push(
      el('section.ws-section', {}, [
        el('h2', { text: '6. Handwriting' }),
        el('p.ws-instruction', {
          text: 'Trace the grey word, then write it twice more. Mind the háček and the kroužek.',
        }),
        ...trace,
      ])
    );
  }
  return sections;
}

function answerKey(rows, sentences) {
  const key = el('section.ws-key');
  key.append(el('h2', { text: 'Answer key', style: 'break-inside:avoid' }));

  for (const [lemma, entry] of rows) {
    key.append(el('p', { html: `<strong>${lemma}</strong> — ${entry.translation}` }));
  }
  for (const [lemma] of rows) {
    const s = sentences.get(lemma);
    if (s) key.append(el('p', { text: `${s.surface} → ${s.cs}` }));
  }
  return key;
}

/* ---------------------------------------------------------------- screen */

async function buildSheet(rows, chosen) {
  const sentences = chosen.has('gaps') ? await findSentences(rows.map((r) => r[0])) : new Map();

  const sections = [];
  if (chosen.has('translate')) sections.push(...translationDrill(rows));
  if (chosen.has('gaps')) sections.push(...gapFill(rows, sentences));
  if (chosen.has('tables')) sections.push(...tables(rows));
  if (chosen.has('match')) sections.push(...matchAndTrace(rows));
  sections.push(answerKey(rows, sentences));

  const stamp = new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  render(
    el('div.screen', {}, [
      el('div.no-print', {}, [
        topbar('Worksheet', () => worksheetScreen()),
        el('div.notice', {}, [
          el('p', {
            html: `<strong>${rows.length} words, ready to print.</strong> On iPhone, choose Print and then pinch out on the preview to save it to Files as a PDF.`,
          }),
        ]),
        el('button.btn.btn--carmine.btn--block', {
          html: `${icon('printer')}<span>Print</span>`,
          on: { click: () => window.print() },
          style: 'margin-bottom:24px',
        }),
      ]),

      el('header.sheet-head', {}, [
        el('h1', { text: 'Czech practice' }),
        el('span.meta', { text: `${stamp} · ${rows.length} words` }),
      ]),
      ...sections,
    ])
  );
}

export function worksheetScreen() {
  let sourceKey = 'active';
  const chosen = new Set(['translate', 'gaps', 'tables', 'match']);
  let limit = 20;

  const sourceRow = el('div.filter-row', { role: 'group', 'aria-label': 'Which words' });
  const limitRow = el('div.filter-row', { role: 'group', 'aria-label': 'How many' });
  const exerciseList = el('div');
  const summary = el('p.setting-desc', { style: 'margin:14px 0 20px' });

  function selectedRows() {
    const words = allWords();
    let lemmas;
    if (sourceKey === 'due') {
      lemmas = dueWords();
    } else {
      const filter = SOURCES.find((s) => s[0] === sourceKey)[2];
      lemmas = Object.keys(words).filter((k) => filter(words[k]));
    }
    return lemmas
      .map((lemma) => [lemma, dict.entryOf(lemma)])
      .filter(([, entry]) => entry)
      .slice(0, limit);
  }

  function paint() {
    sourceRow.replaceChildren(
      ...SOURCES.map(([key, label]) =>
        el('button.chip', {
          'aria-pressed': key === sourceKey ? 'true' : 'false',
          text: label,
          on: { click: () => { sourceKey = key; paint(); } },
        })
      )
    );

    limitRow.replaceChildren(
      ...[10, 20, 30, 50].map((n) =>
        el('button.chip', {
          'aria-pressed': n === limit ? 'true' : 'false',
          text: `${n} words`,
          on: { click: () => { limit = n; paint(); } },
        })
      )
    );

    exerciseList.replaceChildren(
      ...EXERCISES.map(([key, label, desc]) =>
        el('div.setting', {}, [
          el('div.setting-main', {}, [
            el('div.setting-label', { text: label }),
            el('div.setting-desc', { text: desc }),
          ]),
          el('button.switch', {
            role: 'switch',
            'aria-checked': String(chosen.has(key)),
            'aria-label': label,
            on: {
              click: (e) => {
                if (chosen.has(key)) chosen.delete(key); else chosen.add(key);
                e.currentTarget.setAttribute('aria-checked', String(chosen.has(key)));
                paint();
              },
            },
          }),
        ])
      )
    );

    const rows = selectedRows();
    summary.textContent = rows.length
      ? `${rows.length} words selected.`
      : 'No words match — save some words while reading first.';
  }

  paint();

  render(
    el('div.screen', {}, [
      topbar('Build a worksheet', () => router.navigate('/saved')),

      el('p.section-head', { text: 'Which words' }),
      sourceRow,
      limitRow,
      summary,

      el('p.section-head', { text: 'Exercises' }),
      exerciseList,

      el('button.btn.btn--carmine.btn--block', {
        text: 'Build the worksheet',
        style: 'margin-top:24px',
        on: {
          click: async () => {
            const rows = selectedRows();
            if (!rows.length) return toast('No words selected.');
            if (!chosen.size) return toast('Pick at least one exercise.');
            await buildSheet(rows, chosen);
          },
        },
      }),
    ])
  );
}
