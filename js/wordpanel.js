/**
 * wordpanel.js — the bottom sheet shown when a word is tapped.
 *
 * Shared by the reader, the saved-words list and the adventure, so a word looks
 * and behaves identically wherever you meet it.
 */

import { el, icon, esc } from './ui.js';
import * as dict from './dict.js';
import * as tts from './tts.js';
import { getStatus, setStatus, getSettings, STATUS } from './store.js';

/**
 * Czech case names with their question words — the question is how the cases
 * are actually taught and remembered, so it earns its space in the table.
 */
const CASES = [
  ['nom', '1. Nominative', 'kdo? co?'],
  ['gen', '2. Genitive',   'koho? čeho?'],
  ['dat', '3. Dative',     'komu? čemu?'],
  ['acc', '4. Accusative', 'koho? co?'],
  ['voc', '5. Vocative',   'oslovení'],
  ['loc', '6. Locative',   'o kom? o čem?'],
  ['ins', '7. Instrumental', 'kým? čím?'],
];

const PERSONS = ['já', 'ty', 'on/ona/ono', 'my', 'vy', 'oni'];

const TABLE_TITLES = {
  sg: 'Singular', pl: 'Plural',
  'sg m': 'Singular — masculine',
  'sg f': 'Singular — feminine',
  'sg n': 'Singular — neuter',
  present: 'Present', past: 'Past', future: 'Future',
  imperative: 'Imperative', conditional: 'Conditional',
  negative: 'Negative', passive: 'Passive',
};

/** Number/gender tables a declining word may carry, in display order. */
const DECLENSION_TABLES = ['sg', 'sg m', 'sg f', 'sg n', 'pl'];

const STATUS_LABELS = [
  [STATUS.NEW, 'New'],
  [STATUS.LEARNING, 'Learning'],
  [STATUS.KNOWN, 'Known'],
];

let open = null;

export function close() {
  if (!open) return;
  tts.cancel();
  open.scrim.remove();
  open.sheet.remove();
  document.removeEventListener('keydown', open.onKey);
  document.querySelectorAll('.w.is-active').forEach((n) => n.classList.remove('is-active'));
  const { onClose } = open;
  open = null;
  if (onClose) onClose();
}

function buildTable(rows, matchSurface) {
  const table = el('table');
  const body = el('tbody');
  for (const [label, hint, value] of rows) {
    if (!value) continue;
    const isMatch = matchSurface && value.toLocaleLowerCase('cs-CZ') === matchSurface;
    body.append(
      el('tr', { 'data-match': isMatch ? 'true' : null }, [
        el('th', { html: `${esc(label)}${hint ? `<br><span style="opacity:.7">${esc(hint)}</span>` : ''}` }),
        el('td', { text: value }),
      ])
    );
  }
  table.append(body);
  return table;
}

/** Render whichever form tables this entry has, driven by part of speech. */
function formsFor(entry, matchSurface) {
  const wrap = el('div.forms');
  const shape = dict.tableShape(entry);
  const forms = entry.forms || {};

  if (shape === 'declension') {
    for (const num of DECLENSION_TABLES) {
      const table = forms[num];
      if (!table) continue;
      wrap.append(el('h4', { text: TABLE_TITLES[num] }));
      wrap.append(buildTable(
        CASES.map(([key, label, hint]) => [label, hint, table[key]]),
        matchSurface
      ));
    }
  } else if (shape === 'verb') {
    for (const [key, title] of Object.entries(TABLE_TITLES)) {
      const table = forms[key];
      if (!table || DECLENSION_TABLES.includes(key)) continue;
      wrap.append(el('h4', { text: title }));

      if (typeof table === 'string') {
        wrap.append(buildTable([[title, '', table]], matchSurface));
        continue;
      }
      // Present/future conjugate by person; past and imperative use their own
      // keys (gender, or ty/vy), so we fall back to whatever keys exist.
      const keys = PERSONS.every((p) => p in table) ? PERSONS : Object.keys(table);
      wrap.append(buildTable(keys.map((k) => [k, '', table[k]]), matchSurface));
    }
  } else {
    const rows = Object.entries(forms)
      .filter(([, v]) => typeof v === 'string')
      .map(([k, v]) => [k, '', v]);
    if (rows.length) wrap.append(buildTable(rows, matchSurface));
  }

  return wrap.children.length ? wrap : null;
}

/**
 * Open the word panel.
 * @param {string} surface the word as it appeared on the page
 * @param {{onChange?:(lemma:string,status:number)=>void, onClose?:Function}} [opts]
 * @returns {boolean} false when the word is not in the dictionary
 */
export function show(surface, opts = {}) {
  const found = dict.lookup(surface);
  if (!found) return false;

  close();

  const { lemma, entry } = found;
  const tapped = surface.toLocaleLowerCase('cs-CZ');
  const settings = getSettings();

  const scrim = el('div.scrim', { on: { click: () => close() } });
  const sheet = el('section.sheet', {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': `${lemma} — ${entry.translation}`,
  });

  /* Header: lemma, part of speech, speaker */
  const speakBtn = tts.isAvailable()
    ? el('button.speak-btn', {
        html: icon('speaker'),
        'aria-label': `Hear ${lemma}`,
        on: {
          click: (e) => {
            const btn = e.currentTarget;
            btn.classList.add('is-speaking');
            // Speak the form actually on the page — that is the one being read.
            tts.speak(surface, { onend: () => btn.classList.remove('is-speaking') });
          },
        },
      })
    : null;

  sheet.append(el('div.sheet-grab'));
  sheet.append(
    el('div.word-head', {}, [
      el('h3.word-lemma', { text: lemma }),
      el('span.word-pos', { text: entry.pos + (entry.gender ? ` · ${entry.gender}` : '') }),
      el('span', { style: 'flex:1' }),
      speakBtn,
    ])
  );

  // Only worth saying when the tapped form differs from the headword.
  if (tapped !== lemma) {
    sheet.append(el('p.word-surface', {
      html: `You tapped <b>${esc(surface)}</b> — a form of <b>${esc(lemma)}</b>`,
    }));
  }

  if (settings.showPhonetics && (entry.phonetic || entry.ipa)) {
    sheet.append(el('p.phonetic', {}, [
      entry.phonetic ? el('span', { text: entry.phonetic }) : null,
      entry.ipa ? el('span.ipa', { text: `/${entry.ipa}/` }) : null,
    ]));
  }

  sheet.append(el('p.word-translation', { text: entry.translation }));
  if (entry.note) sheet.append(el('p.word-note', { text: entry.note }));

  /* Status picker */
  const statusRow = el('div.status-row', { role: 'group', 'aria-label': 'Word status' });
  function paintStatus() {
    const currentStatus = getStatus(lemma);
    statusRow.replaceChildren(
      ...STATUS_LABELS.map(([value, label]) =>
        el('button.status-btn', {
          'data-status': value,
          'aria-pressed': currentStatus === value ? 'true' : 'false',
          text: label,
          on: {
            click: () => {
              setStatus(lemma, value);
              paintStatus();
              if (opts.onChange) opts.onChange(lemma, value);
            },
          },
        })
      )
    );
  }
  paintStatus();
  sheet.append(statusRow);

  /* Expandable full-forms table */
  const formsNode = formsFor(entry, tapped);
  if (formsNode) {
    const toggle = el('button.forms-toggle', {
      'aria-expanded': 'false',
      html: `<span>All forms</span><span class="chev">${icon('chevron')}</span>`,
    });
    const holder = el('div');
    toggle.addEventListener('click', () => {
      const isOpen = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!isOpen));
      holder.replaceChildren(...(isOpen ? [] : [formsNode]));
    });
    sheet.append(toggle, holder);
  }

  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  document.body.append(scrim, sheet);
  open = { scrim, sheet, onKey, onClose: opts.onClose };
  return true;
}
