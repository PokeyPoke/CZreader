/**
 * app.js — boots the app: loads content, wires routes, renders the nav.
 */

import * as router from './router.js';
import * as dict from './dict.js';
import * as content from './content.js';
import { getSettings } from './store.js';
import { el, icon, render } from './ui.js';

import { homeScreen } from './home.js';
import { readerScreen } from './reader.js';
import { savedScreen } from './saved.js';
import { flashcardsScreen } from './flashcards.js';
import { worksheetScreen } from './worksheets.js';
import { adventureScreen } from './adventure.js';
import { settingsScreen } from './settings.js';
import { placementScreen } from './placement.js';

const NAV = [
  { path: '/',         label: 'Read',     ico: 'book' },
  { path: '/saved',    label: 'Words',    ico: 'bookmark' },
  { path: '/cards',    label: 'Practice', ico: 'cards' },
  { path: '/game',     label: 'Story',    ico: 'compass' },
  { path: '/settings', label: 'Settings', ico: 'gear' },
];

function renderNav() {
  const nav = document.getElementById('nav');
  nav.replaceChildren();
  const active = router.activeRoot();

  for (const item of NAV) {
    const isCurrent = item.path === '/' ? active === '/' : active === item.path;
    nav.append(
      el('a', {
        href: '#' + item.path,
        'aria-current': isCurrent ? 'page' : null,
        html: `${icon(item.ico, item.ico === 'bookmark')}<span>${item.label}</span>`,
      })
    );
  }
}

/** Wraps a screen handler so the nav highlight always follows the route. */
function screen(handler) {
  return async (params) => {
    try {
      await handler(params);
    } catch (err) {
      console.error(err);
      showError(err);
    }
    renderNav();
  };
}

function showError(err) {
  render(
    el('div.screen', {}, [
      el('div.masthead', {}, [
        el('p.kicker', { text: 'Problem' }),
        el('h1', { html: 'Something<em>.</em>' }),
      ]),
      el('div.notice.notice--error', {}, [
        el('p', { html: '<strong>The app could not load its content.</strong>' }),
        el('p', { text: String(err && err.message ? err.message : err) }),
        el('p', { text: 'If you are offline and have not opened the app before, connect once so it can cache its data.' }),
      ]),
      el('button.btn.btn--block', {
        text: 'Try again',
        on: { click: () => location.reload() },
      }),
    ])
  );
}

async function boot() {
  document.documentElement.dataset.theme = getSettings().theme;

  try {
    await Promise.all([dict.load(), content.loadCatalog()]);
  } catch (err) {
    console.error(err);
    showError(err);
    return;
  }

  router.route('/',            screen(homeScreen));
  router.route('/story/:id',   screen(readerScreen));
  router.route('/saved',       screen(savedScreen));
  router.route('/cards',       screen(flashcardsScreen));
  router.route('/worksheet',   screen(worksheetScreen));
  router.route('/game',        screen(adventureScreen));
  router.route('/settings',    screen(settingsScreen));
  router.route('/placement',   screen(placementScreen));
  router.setNotFound(screen(homeScreen));

  router.start();

  // Offer the placement check once, on the very first visit. It is skippable,
  // and its real job is seeding word statuses so the difficulty readouts on the
  // home screen mean something from day one.
  const settings = getSettings();
  if (!settings.placementDone && router.currentPath() === '/') {
    router.navigate('/placement', { replace: true });
  }

  if ('serviceWorker' in navigator) {
    // Registered after boot so a failing SW can never block the first paint.
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  }
}

boot();
