/**
 * home.js — the story library.
 *
 * Levels are tabs, not gates: every story is openable from a fresh install.
 * What actually guides the choice is the per-story readout showing how many of
 * its words you already know.
 */

import { el, icon, render } from './ui.js';
import * as router from './router.js';
import * as content from './content.js';
import {
  allWords, getProgress, getSettings, dueWords, streak, todayActivity, STATUS,
} from './store.js';

const LEVEL_KEY = 'czs.ui.level';

function activeLevel() {
  const saved = sessionStorage.getItem(LEVEL_KEY);
  if (saved && content.LEVELS.includes(saved)) return saved;
  return getSettings().suggestedLevel || 'A1';
}

function readout(comp) {
  return el('div.readout', { 'data-band': comp.band }, [
    el('div.readout-bar', {}, [
      el('div.readout-fill', { style: `width:${Math.max(comp.pct, 2)}%` }),
    ]),
    el('span.readout-label', { text: `${comp.pct}% known · ${content.BAND_LABEL[comp.band]}` }),
  ]);
}

function storyCard(meta, comp, index) {
  const progress = getProgress(meta.id);
  const finished = progress && progress.furthest >= meta.sentences - 1;
  const started = progress && progress.furthest > 0 && !finished;

  return el('button.story-card', {
    'data-done': finished ? 'true' : 'false',
    on: { click: () => router.navigate(`/story/${meta.id}`) },
  }, [
    el('span.story-num', { text: String(index + 1) }),
    el('span', {}, [
      el('span.story-title', { text: meta.title }),
      el('span.story-meta', {}, [
        el('span', { text: `${meta.sentences} sentences` }),
        el('span', { text: meta.grammarFocus.join(' · ') }),
        finished ? el('span', { text: '✓ Read' }) : null,
        started ? el('span', { text: `Resumed at ${progress.furthest + 1}` }) : null,
      ]),
      readout(comp),
    ]),
  ]);
}

/**
 * A one-line daily summary. Small and steady beats occasional and heroic: the
 * streak is there to make "a story and the due cards, every day" the habit.
 */
function todayStrip(days, today, due) {
  const parts = [];
  if (today.stories) parts.push(`${today.stories} stor${today.stories === 1 ? 'y' : 'ies'} read`);
  if (today.reviews) parts.push(`${today.reviews} card${today.reviews === 1 ? '' : 's'} reviewed`);
  if (today.lookups) parts.push(`${today.lookups} new word${today.lookups === 1 ? '' : 's'}`);

  const goal = !today.stories
    ? 'Today: finish a story'
    : due
      ? `Today: ${due} card${due === 1 ? '' : 's'} to review`
      : 'Done for today';

  return el('div.today', {}, [
    el('span.today-streak', {
      text: days ? `${days}-day streak` : 'Start a streak',
      'data-active': days ? 'true' : 'false',
    }),
    el('span.today-detail', { text: parts.length ? parts.join(' · ') : goal }),
    parts.length ? el('span.today-goal', { text: goal }) : null,
  ]);
}

export async function homeScreen() {
  const comps = await content.allComprehension();
  const words = allWords();
  const savedCount = Object.values(words).filter((w) => w.status !== STATUS.KNOWN).length;
  const knownCount = Object.values(words).filter((w) => w.status === STATUS.KNOWN).length;
  const due = dueWords().length;
  const days = streak();
  const today = todayActivity();

  const list = el('div');
  const blurb = el('p.level-blurb');
  const tabs = el('div.level-tabs', { role: 'tablist' });

  function paint(level) {
    sessionStorage.setItem(LEVEL_KEY, level);

    tabs.replaceChildren(
      ...content.LEVELS.map((lv) =>
        el('button.level-tab', {
          role: 'tab',
          'aria-selected': lv === level ? 'true' : 'false',
          text: lv,
          on: { click: () => paint(lv) },
        })
      )
    );
    blurb.textContent = content.LEVEL_BLURB[level];

    const stories = content.storiesAtLevel(level);
    list.replaceChildren(
      ...stories.map((meta, i) => storyCard(meta, comps[meta.id], i))
    );
  }

  paint(activeLevel());

  render(
    el('div.screen', {}, [
      el('div.masthead', {}, [
        el('p.kicker', { text: 'Read Czech' }),
        el('h1', { html: 'Čeština<em>.</em>' }),
      ]),

      todayStrip(days, today, due),

      tabs,
      blurb,
      list,

      el('p.section-head', { text: 'Your words' }),
      el('div.tile-row', {}, [
        el('button.tile', {
          on: { click: () => router.navigate('/saved') },
          'aria-label': `${savedCount} words in your list`,
        }, [
          el('span.tile-count', { text: String(savedCount) }),
          el('span', {}, [
            el('span.tile-label', { text: 'Saved words' }),
            el('span.tile-sub', { text: `${knownCount} known` }),
          ]),
        ]),
        el('button.tile', {
          on: { click: () => router.navigate('/cards') },
          'aria-label': `${due} flashcards due`,
        }, [
          el('span.tile-count', { text: String(due) }),
          el('span', {}, [
            el('span.tile-label', { text: 'Due for review' }),
            el('span.tile-sub', { text: due ? 'Practice now' : 'All caught up' }),
          ]),
        ]),
        el('button.tile.tile--wide', {
          on: { click: () => router.navigate('/game') },
        }, [
          el('span', {}, [
            el('span.tile-label', { text: 'Kámen na mostě' }),
            el('span.tile-sub', { text: 'Adventure · Prague, 1357 · A1' }),
          ]),
          el('span', { html: icon('compass'), style: 'color:var(--carmine)' }),
        ]),
      ]),

      el('div.legend', {}, [
        el('span', { html: `<i data-status="0"></i> New word` }),
        el('span', { html: `<i data-status="1"></i> Learning` }),
        el('span', { html: `<i data-status="2"></i> Known` }),
      ]),
    ])
  );
}
