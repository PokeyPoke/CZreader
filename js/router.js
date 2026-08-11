/**
 * router.js — hash-based routing.
 *
 * Hash routing rather than the History API is a deliberate choice: GitHub Pages
 * has no server-side rewrites, so a deep link like /story/01 would 404 on
 * refresh. Everything after the # never reaches the server, so #/story/01
 * always resolves to index.html.
 */

const routes = [];
let notFound = null;
let current = null;

/**
 * @param {string} pattern e.g. '/story/:id' — ':name' captures one segment
 * @param {(params:object) => void|Promise<void>} handler
 */
export function route(pattern, handler) {
  const names = [];
  const regex = new RegExp(
    '^' + pattern.replace(/:([A-Za-z]+)/g, (_, name) => {
      names.push(name);
      return '([^/]+)';
    }) + '$'
  );
  routes.push({ regex, names, handler });
}

export function setNotFound(handler) {
  notFound = handler;
}

export function navigate(path, { replace = false } = {}) {
  const hash = '#' + path;
  if (location.hash === hash) {
    resolve();
  } else if (replace) {
    history.replaceState(null, '', hash);
    resolve();
  } else {
    location.hash = hash;
  }
}

export function currentPath() {
  return location.hash.slice(1) || '/';
}

/** The route currently rendered, for nav highlighting. */
export function activeRoot() {
  return '/' + currentPath().split('/')[1];
}

function resolve() {
  const path = currentPath();
  current = path;

  for (const { regex, names, handler } of routes) {
    const match = path.match(regex);
    if (!match) continue;
    const params = {};
    names.forEach((name, i) => { params[name] = decodeURIComponent(match[i + 1]); });
    handler(params);
    return;
  }
  if (notFound) notFound({ path });
}

export function start() {
  window.addEventListener('hashchange', resolve);
  resolve();
}
