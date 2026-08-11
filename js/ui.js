/**
 * ui.js — small shared DOM helpers and the icon set.
 *
 * Deliberately tiny: this is not a framework, just the handful of primitives
 * every screen needs so they do not each reinvent element creation.
 */

/**
 * Create an element.
 * @param {string} tag  'div', or 'div.class.other', or 'button.chip'
 * @param {object} [attrs] attributes; `text` sets textContent, `html` sets innerHTML,
 *                         `on` takes an object of event listeners
 * @param {Array<Node|string>} [children]
 */
export function el(tag, attrs = {}, children = []) {
  const [name, ...classes] = tag.split('.');
  const node = document.createElement(name);
  if (classes.length) node.className = classes.join(' ');

  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'on') {
      for (const [evt, fn] of Object.entries(value)) node.addEventListener(evt, fn);
    } else if (key === 'class') {
      node.className = node.className ? `${node.className} ${value}` : value;
    } else {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }

  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** Replace the app's contents with a screen, scrolled to the top. */
export function render(...nodes) {
  const app = document.getElementById('app');
  clear(app);
  nodes.forEach((n) => n && app.append(n));
  window.scrollTo(0, 0);
  return app;
}

/* ------------------------------------------------------------------ icons */

const ICONS = {
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v4H6.5A2.5 2.5 0 0 1 4 19.5z"/>',
  cards: '<rect x="3" y="6" width="12" height="15" rx="2"/><path d="M8 3h9a2 2 0 0 1 2 2v11"/>',
  bookmark: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H7a1.7 1.7 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V7a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  speaker: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
  speakerOff: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>',
  play: '<path d="M6 4l14 8-14 8z"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  translate: '<path d="M4 5h11"/><path d="M9 3v2c0 5-2.5 8-5 9"/><path d="M6 11c1.5 2.5 4 4 7 4.5"/><path d="m13 21 4.5-11L22 21"/><path d="M14.8 17.5h5.4"/>',
  printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 15h12v6H6z"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
};

/**
 * @param {keyof ICONS} name
 * @param {boolean} [filled] use fill instead of stroke (for play/pause/bookmark)
 */
export function icon(name, filled = false) {
  const paint = filled
    ? 'fill="currentColor" stroke="none"'
    : 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  return `<svg viewBox="0 0 24 24" aria-hidden="true" ${paint}>${ICONS[name] || ''}</svg>`;
}

/* ------------------------------------------------------------------ toast */

let toastTimer = null;

export function toast(message, ms = 2200) {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const node = el('div.toast', { role: 'status', 'aria-live': 'polite', text: message });
  document.body.append(node);
  toastTimer = setTimeout(() => node.remove(), ms);
}

/* ----------------------------------------------------------------- layout */

/** Standard back bar for inner screens. */
export function topbar(title, onBack, trailing = null) {
  return el('div.topbar', {}, [
    el('button.icon-btn', {
      html: icon('back'),
      'aria-label': 'Back',
      on: { click: onBack },
    }),
    el('h2', { text: title }),
    trailing,
  ]);
}

export function emptyState(message, actionLabel, onAction) {
  return el('div.empty', {}, [
    el('p', { text: message }),
    actionLabel
      ? el('button.btn.btn--ghost', { text: actionLabel, on: { click: onAction } })
      : null,
  ]);
}

/** Escape a string for safe interpolation into innerHTML. */
export function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
